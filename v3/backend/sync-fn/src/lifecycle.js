import { createHash, randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { auth, db, FieldValue, Timestamp } from './context.js';
import { queueAudit, logCommittedAudit } from './audit.js';
import { callableOptions, APPLICATION_RETENTION_MS, DAY_MS, DEFAULT_ACCESS_DAYS, MAX_ACCESS_DAYS, RATE_LIMIT_RETENTION_MS, REJECTED_RETENTION_MS } from './config.js';
import { assertAnonymousApplicant, assertStaff, assertTargetNotStaff, recordSessionRevocation } from './security.js';
import { normalizeEmail, parse } from './validation.js';

export const STATE = Object.freeze({
  SUBMITTED: 'SUBMITTED',
  INTERVIEW_SCHEDULED: 'INTERVIEW_SCHEDULED',
  PROVISIONING: 'PROVISIONING',
  GRANTED: 'GRANTED',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  REJECTED: 'REJECTED',
});

const ApplySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().max(254),
  ageBracket: z.enum(['under13', '13-17', '18plus']),
  guardianConsent: z.boolean().optional().default(false),
  accessChoice: z.enum(['beneficiary', 'supporter']),
  stage: z.enum(['student', 'recent-graduate', 'professional']).optional(),
  track: z.enum(['roadmap', 'fasttrack', 'unsure']).optional(),
  reason: z.string().trim().min(1).max(2_000).optional(),
}).strict();

const GrantSchema = z.object({
  applicationId: z.string().min(8).max(128),
  path: z.enum(['fasttrack', 'roadmap']).default('fasttrack'),
  days: z.number().int().min(1).max(MAX_ACCESS_DAYS).default(DEFAULT_ACCESS_DAYS),
}).strict();

const RejectSchema = z.object({
  applicationId: z.string().min(8).max(128),
  reasonCode: z.enum(['not_eligible', 'incomplete', 'duplicate', 'withdrawn']).default('not_eligible'),
}).strict();

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const submitApplication = onCall(callableOptions({ maxInstances: 20 }), async (req) => {
  const applicantUid = await assertAnonymousApplicant(req);
  const input = parse(ApplySchema, req.data);
  if (input.ageBracket === 'under13') throw new HttpsError('failed-precondition', 'under-13 applicants are not accepted');
  if (input.ageBracket === '13-17' && input.guardianConsent !== true) {
    throw new HttpsError('failed-precondition', 'guardian consent is required');
  }

  const email = normalizeEmail(input.email);
  const emailHash = sha256(email);
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  const uidRateRef = db.collection('rateLimits').doc(`apply-${sha256(applicantUid).slice(0, 32)}-${hourBucket}`);
  const emailRateRef = db.collection('applicationIntake').doc(emailHash);
  const appRef = db.collection('applications').doc();
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const [uidRate, emailRate] = await Promise.all([tx.get(uidRateRef), tx.get(emailRateRef)]);
    if (Number(uidRate.get('count') || 0) >= 5) throw new HttpsError('resource-exhausted', 'application rate limit exceeded');
    if (emailRate.exists && Number(emailRate.get('lastSubmittedAt') || 0) > now - DAY_MS) {
      throw new HttpsError('already-exists', 'an application for this email was submitted recently');
    }

    tx.create(appRef, {
      status: STATE.SUBMITTED,
      accessChoice: input.accessChoice,
      email,
      emailHash,
      name: input.name,
      ageBracket: input.ageBracket,
      guardianConsent: input.ageBracket === '13-17',
      guardianConsentAt: input.ageBracket === '13-17' ? FieldValue.serverTimestamp() : null,
      ...(input.stage ? { stage: input.stage } : {}),
      ...(input.track ? { track: input.track } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      applicantUid,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + APPLICATION_RETENTION_MS),
    });
    tx.set(uidRateRef, {
      count: FieldValue.increment(1),
      expiresAt: Timestamp.fromMillis(now + RATE_LIMIT_RETENTION_MS),
    }, { merge: true });
    tx.set(emailRateRef, {
      applicationId: appRef.id,
      lastSubmittedAt: now,
      expiresAt: Timestamp.fromMillis(now + RATE_LIMIT_RETENTION_MS),
    });
    queueAudit(tx, {
      type: 'application.submitted', targetType: 'application', targetId: appRef.id,
      actorId: applicantUid, toStatus: STATE.SUBMITTED,
    });
  });
  logCommittedAudit({ type: 'application.submitted', targetType: 'application', targetId: appRef.id, actorId: applicantUid });
  return { applicationId: appRef.id, status: STATE.SUBMITTED, next: input.accessChoice === 'supporter' ? 'donate' : 'review' };
});

async function getOrCreateStudent(email, displayName) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
  try {
    return await auth.createUser({ email, displayName, emailVerified: false });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') return auth.getUserByEmail(email);
    throw error;
  }
}

async function resetFailedProvisioning(appRef, operationId, reasonCode) {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(appRef);
    const p = snap.get('provisioning');
    if (snap.get('status') === STATE.PROVISIONING && p?.operationId === operationId) {
      tx.update(appRef, {
        status: p.fromStatus || STATE.SUBMITTED,
        provisioning: FieldValue.delete(),
        provisioningError: reasonCode,
      });
    }
  });
}

export async function grantAccess({ applicationId, accessBasis, path, days, actorId, paymentId }) {
  const appRef = db.collection('applications').doc(applicationId);
  const operationId = `grant:${applicationId}`;
  const now = Date.now();

  const reservation = await db.runTransaction(async (tx) => {
    const appSnap = await tx.get(appRef);
    if (!appSnap.exists) throw new HttpsError('not-found', 'application not found');
    const app = appSnap.data();
    if (app.status === STATE.GRANTED && app.grantedUid) return { app, idempotent: true };
    if (app.status === STATE.PROVISIONING) {
      const p = app.provisioning || {};
      if (
        p.operationId !== operationId
        || p.accessBasis !== accessBasis
        || p.path !== path
        || p.days !== days
        || p.paymentId !== (paymentId || null)
      ) {
        throw new HttpsError('aborted', 'application has a different provisioning operation');
      }
      return { app, idempotent: false };
    }
    if (![STATE.SUBMITTED, STATE.INTERVIEW_SCHEDULED].includes(app.status)) {
      throw new HttpsError('failed-precondition', `cannot grant from ${app.status}`);
    }
    if (app.accessChoice !== accessBasis) throw new HttpsError('failed-precondition', 'access basis does not match application');

    if (accessBasis === 'supporter') {
      if (!paymentId) throw new HttpsError('failed-precondition', 'verified payment required');
      const donation = await tx.get(db.collection('donations').doc(paymentId));
      if (!donation.exists || donation.get('verificationState') !== 'VERIFIED' || donation.get('applicationId') !== applicationId) {
        throw new HttpsError('failed-precondition', 'payment is not verified for this application');
      }
    }

    tx.update(appRef, {
      status: STATE.PROVISIONING,
      provisioning: {
        operationId, fromStatus: app.status, accessBasis, path, days,
        paymentId: paymentId || null, actorId, reservedAt: now,
      },
      provisioningError: FieldValue.delete(),
    });
    return {
      app: {
        ...app,
        status: STATE.PROVISIONING,
        provisioning: {
          operationId, fromStatus: app.status, accessBasis, path, days,
          paymentId: paymentId || null, actorId, reservedAt: now,
        },
      },
      idempotent: false,
    };
  });

  if (reservation.idempotent) {
    return { uid: reservation.app.grantedUid, status: STATE.GRANTED, idempotent: true };
  }

  const provision = reservation.app.provisioning;
  const reservedAt = Number(provision.reservedAt);
  const reservedActorId = provision.actorId;
  const reservedAccessBasis = provision.accessBasis;
  const reservedPath = provision.path;
  const reservedDays = provision.days;
  const reservedPaymentId = provision.paymentId;

  let user;
  try {
    user = await getOrCreateStudent(reservation.app.email, reservation.app.name || '');
    const targetRole = user.customClaims?.role;
    if (targetRole === 'admin' || targetRole === 'owner') throw new HttpsError('permission-denied', 'application email belongs to staff');
    const existingMember = await db.collection('members').doc(user.uid).get();
    if (existingMember.exists && existingMember.get('applicationId') !== applicationId) {
      throw new HttpsError('already-exists', 'account is already linked to another application');
    }
  } catch (error) {
    await resetFailedProvisioning(appRef, operationId, error.code || 'account_resolution_failed');
    throw error;
  }

  const accessEnds = reservedAt + reservedDays * DAY_MS;
  const memberRef = db.collection('members').doc(user.uid);
  await Promise.all([
    memberRef.set({
      status: STATE.PROVISIONING,
      accessBasis: reservedAccessBasis,
      accessEnds,
      email: reservation.app.email,
      name: reservation.app.name || '',
      path: reservedPath,
      applicationId,
      provisioningOperationId: operationId,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }),
    appRef.update({ grantedUid: user.uid }),
  ]);

  await auth.setCustomUserClaims(user.uid, { role: 'student', accessBasis: reservedAccessBasis, accessEnds });
  await recordSessionRevocation(user.uid);

  let finalizedByPeer = false;
  await db.runTransaction(async (tx) => {
    const [appSnap, memberSnap] = await Promise.all([tx.get(appRef), tx.get(memberRef)]);
    if (appSnap.get('status') === STATE.GRANTED && appSnap.get('grantedUid') === user.uid) {
      finalizedByPeer = true;
      return;
    }
    const p = appSnap.get('provisioning');
    if (appSnap.get('status') !== STATE.PROVISIONING || p?.operationId !== operationId || appSnap.get('grantedUid') !== user.uid) {
      throw new HttpsError('aborted', 'provisioning reservation changed');
    }
    if (!memberSnap.exists || memberSnap.get('provisioningOperationId') !== operationId) {
      throw new HttpsError('aborted', 'member provisioning record missing');
    }
    tx.update(appRef, { status: STATE.GRANTED, grantedAt: FieldValue.serverTimestamp(), provisioning: FieldValue.delete() });
    tx.update(memberRef, { status: STATE.ACTIVE, provisioningOperationId: FieldValue.delete() });
    if (reservedPaymentId) tx.set(db.collection('donations').doc(reservedPaymentId), { grantedUid: user.uid, grantedAt: FieldValue.serverTimestamp() }, { merge: true });
    queueAudit(tx, {
      type: 'access.granted', targetType: 'member', targetId: user.uid, actorId: reservedActorId,
      fromStatus: STATE.PROVISIONING, toStatus: STATE.ACTIVE, operationId,
    });
  });
  if (!finalizedByPeer) logCommittedAudit({ type: 'access.granted', targetType: 'member', targetId: user.uid, actorId: reservedActorId, operationId });
  return { uid: user.uid, accessEnds, path: reservedPath, status: STATE.GRANTED, idempotent: finalizedByPeer };
}

export const grant = onCall(callableOptions({ timeoutSeconds: 60, maxInstances: 5 }), async (req) => {
  const { uid: actorId } = await assertStaff(req);
  const input = parse(GrantSchema, req.data);
  return grantAccess({ ...input, accessBasis: 'beneficiary', actorId });
});

export const rejectApplication = onCall(callableOptions(), async (req) => {
  const { uid: actorId } = await assertStaff(req);
  const input = parse(RejectSchema, req.data);
  const appRef = db.collection('applications').doc(input.applicationId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(appRef);
    if (!snap.exists) throw new HttpsError('not-found', 'application not found');
    const fromStatus = snap.get('status');
    if (![STATE.SUBMITTED, STATE.INTERVIEW_SCHEDULED].includes(fromStatus)) {
      throw new HttpsError('failed-precondition', `cannot reject from ${fromStatus}`);
    }
    tx.update(appRef, {
      status: STATE.REJECTED,
      rejectedReason: input.reasonCode,
      rejectedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + REJECTED_RETENTION_MS),
    });
    queueAudit(tx, {
      type: 'application.rejected', targetType: 'application', targetId: input.applicationId,
      actorId, fromStatus, toStatus: STATE.REJECTED, reasonCode: input.reasonCode,
    });
  });
  logCommittedAudit({ type: 'application.rejected', targetType: 'application', targetId: input.applicationId, actorId });
  return { applicationId: input.applicationId, status: STATE.REJECTED };
});

export async function ensureMemberTarget(uid) {
  const user = await assertTargetNotStaff(uid);
  if (!user) throw new HttpsError('not-found', 'user not found');
  return user;
}

export { GrantSchema };
