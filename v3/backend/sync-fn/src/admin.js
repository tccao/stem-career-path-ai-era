import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { auth, db, FieldValue, Timestamp } from './context.js';
import { queueAudit, logCommittedAudit, writeAudit } from './audit.js';
import { callableOptions, DAY_MS, ENDED_MEMBER_RETENTION_MS, IS_EMULATOR, MAX_ACCESS_DAYS } from './config.js';
import { assertStaff, assertStaffMfaBootstrap, assertTargetNotStaff, recordSessionRevocation, roleOf } from './security.js';
import { parse } from './validation.js';
import { STATE } from './lifecycle.js';

const UidSchema = z.object({ uid: z.string().min(1).max(128) }).strict();
const ExtendSchema = z.object({ uid: z.string().min(1).max(128), days: z.number().int().min(1).max(MAX_ACCESS_DAYS) }).strict();
const RoleSchema = z.object({ uid: z.string().min(1).max(128), role: z.enum(['admin', 'owner', 'none']) }).strict();
const StageLockSchema = z.object({
  uid: z.string().min(1).max(128),
  stageKey: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  action: z.enum(['locked', 'unlocked', 'auto']),
}).strict();
const SettingsSchema = z.object({ zeffyUrl: z.url().max(2_048), calComUrl: z.url().max(2_048) }).strict();
const LockdownSchema = z.object({ enabled: z.boolean(), reason: z.string().trim().max(280).default('') }).strict();

function requireAllowedHost(raw, rootHost) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !(url.hostname === rootHost || url.hostname.endsWith(`.${rootHost}`))) {
    throw new HttpsError('invalid-argument', `URL must use https on ${rootHost}`);
  }
  url.username = '';
  url.password = '';
  return url.toString();
}

async function activeOwnerCount() {
  let count = 0;
  let pageToken;
  do {
    const page = await auth.listUsers(1_000, pageToken);
    count += page.users.filter((user) => !user.disabled && user.customClaims?.role === 'owner').length;
    pageToken = page.pageToken;
  } while (pageToken && count < 2);
  return count;
}

export const confirmMfaEnrollment = onCall(callableOptions(), async (req) => {
  const { uid, user } = await assertStaffMfaBootstrap(req);
  const claims = user.customClaims || {};
  await auth.setCustomUserClaims(uid, { ...claims, mfaEnrolled: true });
  await recordSessionRevocation(uid);
  await writeAudit({ type: 'staff.mfa.confirmed', targetType: 'account', targetId: uid, actorId: uid });
  return { confirmed: true, reauthenticationRequired: true };
});

export const setStageLock = onCall(callableOptions(), async (req) => {
  const { uid: actorId } = await assertStaff(req);
  const input = parse(StageLockSchema, req.data);
  await assertTargetNotStaff(input.uid);
  const memberRef = db.collection('members').doc(input.uid);
  const lockRef = memberRef.collection('stageLocks').doc(input.stageKey);
  await db.runTransaction(async (tx) => {
    const member = await tx.get(memberRef);
    if (!member.exists) throw new HttpsError('not-found', 'member not found');
    if (input.action === 'auto') tx.delete(lockRef);
    else tx.set(lockRef, { state: input.action, updatedAt: FieldValue.serverTimestamp(), updatedBy: actorId });
    queueAudit(tx, {
      type: 'stage.lock.changed', targetType: 'member', targetId: input.uid,
      actorId, reasonCode: `${input.stageKey}:${input.action}`,
    });
  });
  logCommittedAudit({ type: 'stage.lock.changed', targetType: 'member', targetId: input.uid, actorId, reasonCode: `${input.stageKey}:${input.action}` });
  return { uid: input.uid, stageKey: input.stageKey, state: input.action };
});

export const updateSettings = onCall(callableOptions(), async (req) => {
  const { uid: actorId } = await assertStaff(req, { ownerOnly: true });
  const input = parse(SettingsSchema, req.data);
  const settings = {
    zeffyUrl: requireAllowedHost(input.zeffyUrl, 'zeffy.com'),
    calComUrl: requireAllowedHost(input.calComUrl, 'cal.com'),
  };
  await db.runTransaction(async (tx) => {
    tx.set(db.doc('settings/public'), { ...settings, updatedAt: FieldValue.serverTimestamp(), updatedBy: actorId });
    queueAudit(tx, { type: 'settings.updated', targetType: 'settings', targetId: 'public', actorId });
  });
  logCommittedAudit({ type: 'settings.updated', targetType: 'settings', targetId: 'public', actorId });
  return settings;
});

async function assertSupporterExtensionEligible(tx, uid, member) {
  if (member.get('accessBasis') !== 'supporter') return;
  const donations = await tx.get(db.collection('donations').where('grantedUid', '==', uid).limit(10));
  const eligible = donations.docs.some((donation) => (
    donation.get('verificationState') === 'VERIFIED'
    && donation.get('status') === 'succeeded'
    && !['refunded', 'partially_refunded'].includes(donation.get('refundStatus'))
    && donation.get('disputed') !== true
    && !donation.get('revocationProcessedAt')
  ));
  if (!eligible) throw new HttpsError('failed-precondition', 'supporter access requires a current verified payment');
}

export const extendAccess = onCall(callableOptions(), async (req) => {
  const { uid: actorId } = await assertStaff(req);
  const input = parse(ExtendSchema, req.data);
  const user = await assertTargetNotStaff(input.uid);
  if (!user) throw new HttpsError('not-found', 'user not found');
  if (user.disabled) throw new HttpsError('failed-precondition', 'enable the account before extending it');
  const memberRef = db.collection('members').doc(input.uid);
  let accessBasis;
  let accessEnds;
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(memberRef);
    if (!fresh.exists) throw new HttpsError('not-found', 'member not found');
    await assertSupporterExtensionEligible(tx, input.uid, fresh);
    accessBasis = fresh.get('accessBasis');
    accessEnds = Math.max(Date.now(), Number(fresh.get('accessEnds') || 0)) + input.days * DAY_MS;
    tx.update(memberRef, {
      accessEnds, status: STATE.ACTIVE, endedReason: FieldValue.delete(), endedAt: FieldValue.delete(),
      expiresAt: FieldValue.delete(),
    });
    queueAudit(tx, {
      type: 'member.extended', targetType: 'member', targetId: input.uid, actorId,
      fromStatus: fresh.get('status'), toStatus: STATE.ACTIVE,
    });
  });
  await auth.setCustomUserClaims(input.uid, {
    role: 'student', accessBasis, accessEnds,
    ...(user.customClaims?.sessionVersion ? { sessionVersion: user.customClaims.sessionVersion } : {}),
  });
  logCommittedAudit({ type: 'member.extended', targetType: 'member', targetId: input.uid, actorId });
  return { uid: input.uid, accessEnds };
});

export async function revokeStudent(uid, { actorId, reasonCode }) {
  await assertTargetNotStaff(uid);
  const memberRef = db.collection('members').doc(uid);
  const member = await memberRef.get();
  if (!member.exists) throw new HttpsError('not-found', 'member not found');
  await auth.setCustomUserClaims(uid, { role: 'student', accessBasis: member.get('accessBasis'), accessEnds: Date.now() });
  await recordSessionRevocation(uid);
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(memberRef);
    if (!fresh.exists) throw new HttpsError('not-found', 'member not found');
    tx.update(memberRef, {
      status: STATE.ENDED,
      endedReason: reasonCode,
      endedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + ENDED_MEMBER_RETENTION_MS),
    });
    queueAudit(tx, {
      type: `member.${reasonCode}`, targetType: 'member', targetId: uid, actorId,
      fromStatus: fresh.get('status'), toStatus: STATE.ENDED, reasonCode,
    });
  });
  logCommittedAudit({ type: `member.${reasonCode}`, targetType: 'member', targetId: uid, actorId, reasonCode });
  return { uid, status: STATE.ENDED };
}

export const revokeAccess = onCall(callableOptions(), async (req) => {
  const { uid: actorId } = await assertStaff(req);
  const { uid } = parse(UidSchema, req.data);
  return revokeStudent(uid, { actorId, reasonCode: 'revoked' });
});

export const disableAccount = onCall(callableOptions(), async (req) => {
  const { uid: actorId, role: callerRole } = await assertStaff(req);
  const { uid } = parse(UidSchema, req.data);
  if (uid === actorId) throw new HttpsError('failed-precondition', 'cannot disable your own account');
  const user = await auth.getUser(uid);
  const targetRole = user.customClaims?.role || 'student';
  if (targetRole === 'owner') throw new HttpsError('permission-denied', 'owner accounts cannot be disabled here');
  if (callerRole === 'admin' && targetRole !== 'student') throw new HttpsError('permission-denied', 'admins may disable students only');
  await auth.updateUser(uid, { disabled: true });
  await recordSessionRevocation(uid);
  const memberRef = db.collection('members').doc(uid);
  if ((await memberRef.get()).exists) {
    await db.runTransaction(async (tx) => {
      const member = await tx.get(memberRef);
      const fromStatus = member.get('status');
      tx.update(memberRef, {
        status: STATE.ENDED,
        ...(fromStatus === STATE.ACTIVE
          ? { endedReason: 'disabled', endedAt: FieldValue.serverTimestamp() }
          : {}),
      });
      queueAudit(tx, { type: 'account.disabled', targetType: 'account', targetId: uid, actorId, fromStatus, toStatus: STATE.ENDED });
    });
  } else {
    await writeAudit({ type: 'account.disabled', targetType: 'account', targetId: uid, actorId });
  }
  logCommittedAudit({ type: 'account.disabled', targetType: 'account', targetId: uid, actorId });
  return { uid, disabled: true };
});

export const enableAccount = onCall(callableOptions(), async (req) => {
  const { uid: actorId, role: callerRole } = await assertStaff(req);
  const { uid } = parse(UidSchema, req.data);
  const user = await auth.getUser(uid);
  const targetRole = user.customClaims?.role || 'student';
  if (targetRole === 'owner' && callerRole !== 'owner') throw new HttpsError('permission-denied', 'owner only');
  if (callerRole === 'admin' && targetRole !== 'student') throw new HttpsError('permission-denied', 'admins may enable students only');
  await auth.updateUser(uid, { disabled: false });
  const memberRef = db.collection('members').doc(uid);
  const member = await memberRef.get();
  let status = null;
  if (member.exists) {
    const accessEnds = Number(member.get('accessEnds') || 0);
    const endedReason = member.get('endedReason') || null;
    const restorable = accessEnds > Date.now()
      && (member.get('status') === STATE.ACTIVE || endedReason === 'disabled');
    status = restorable ? STATE.ACTIVE : STATE.ENDED;
    if (restorable) {
      await auth.setCustomUserClaims(uid, { role: 'student', accessBasis: member.get('accessBasis'), accessEnds });
      await memberRef.update({ status, endedReason: FieldValue.delete(), endedAt: FieldValue.delete() });
    } else if (member.get('status') !== STATE.ENDED) {
      await memberRef.update({ status: STATE.ENDED, endedReason: endedReason || 'expired' });
    }
  }
  await recordSessionRevocation(uid);
  await writeAudit({ type: 'account.enabled', targetType: 'account', targetId: uid, actorId, toStatus: status || undefined });
  return { uid, disabled: false, memberStatus: status };
});

export const listAccounts = onCall(callableOptions(), async (req) => {
  const { uid: actorId } = await assertStaff(req, { ownerOnly: true });
  const input = parse(z.object({ pageToken: z.string().max(2_048).optional() }).strict(), req.data || {});
  const page = await auth.listUsers(100, input.pageToken);
  const members = page.users.length
    ? await db.getAll(...page.users.map((user) => db.collection('members').doc(user.uid)))
    : [];
  const memberStatus = new Map(members.filter((member) => member.exists).map((member) => [member.id, member.get('status')]));
  const result = {
    accounts: page.users.filter((user) => user.email).map((user) => ({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || null,
      role: user.customClaims?.role || null,
      memberStatus: memberStatus.get(user.uid) || null,
      mfaEnrolled: user.multiFactor?.enrolledFactors?.length > 0,
      disabled: user.disabled,
      lastSignIn: user.metadata.lastSignInTime || null,
    })),
    nextPageToken: page.pageToken || null,
  };
  await writeAudit({ type: 'accounts.listed', targetType: 'system', targetId: 'auth-roster', actorId });
  return result;
});

export const setRole = onCall(callableOptions(), async (req) => {
  const { uid: actorId } = await assertStaff(req, { ownerOnly: true });
  const input = parse(RoleSchema, req.data);
  if (input.uid === actorId) throw new HttpsError('failed-precondition', 'cannot change your own role');
  const user = await auth.getUser(input.uid);
  if (user.customClaims?.role === 'owner' && input.role !== 'owner' && await activeOwnerCount() <= 1) {
    throw new HttpsError('failed-precondition', 'cannot remove the last active owner');
  }
  let effectiveRole = input.role;
  if (input.role === 'none') {
    const member = await db.collection('members').doc(input.uid).get();
    if (member.exists && member.get('status') === STATE.ACTIVE && Number(member.get('accessEnds') || 0) > Date.now()) {
      effectiveRole = 'student';
      await auth.setCustomUserClaims(input.uid, {
        role: 'student', accessBasis: member.get('accessBasis'), accessEnds: member.get('accessEnds'),
      });
    } else {
      await auth.setCustomUserClaims(input.uid, {});
    }
  } else {
    const mfaEnrolled = IS_EMULATOR || (user.multiFactor?.enrolledFactors?.length || 0) > 0;
    await auth.setCustomUserClaims(input.uid, {
      role: input.role, mfaEnrolled, ...(IS_EMULATOR ? { testMfa: true } : {}),
    });
  }
  await recordSessionRevocation(input.uid);
  await writeAudit({ type: 'role.set', targetType: 'account', targetId: input.uid, actorId, reasonCode: effectiveRole });
  return { uid: input.uid, role: effectiveRole, reauthenticationRequired: true };
});

export const setLockdown = onCall(callableOptions(), async (req) => {
  const { uid: actorId } = await assertStaff(req, { ownerOnly: true, allowDuringLockdown: true });
  const input = parse(LockdownSchema, req.data);
  await db.runTransaction(async (tx) => {
    tx.set(db.doc('system/lockdown'), {
      enabled: input.enabled, reason: input.reason, by: actorId, at: FieldValue.serverTimestamp(),
    });
    queueAudit(tx, {
      type: input.enabled ? 'system.lockdown.on' : 'system.lockdown.off',
      targetType: 'system', targetId: 'lockdown', actorId,
      reasonCode: input.enabled ? 'enabled' : 'disabled',
    });
  });
  logCommittedAudit({ type: input.enabled ? 'system.lockdown.on' : 'system.lockdown.off', targetType: 'system', targetId: 'lockdown', actorId });
  return { enabled: input.enabled, reason: input.reason };
});

export { roleOf };
