// Admin callables (V3-Plan §3). Every handler enforces role=admin from the token claim.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db, auth, STATE, transition } from './_db.js';
import { audit } from './_audit.js';
import { grantAccess } from './lifecycle.js';

function requireAdmin(req) {
  if (req.auth?.token?.role !== 'admin') throw new HttpsError('permission-denied', 'not_admin');
  return req.auth.uid;
}

export const listApplications = onCall(async (req) => {
  requireAdmin(req);
  const status = req.data?.status ?? STATE.SUBMITTED;
  const q = await db.collection('applications').where('status', '==', status)
    .orderBy('createdAt', 'desc').limit(100).get();
  return { items: q.docs.map((d) => ({ id: d.id, ...d.data() })) };
});

export const approveApplication = onCall(async (req) => {
  const actorId = requireAdmin(req);
  const applicationId = z.string().parse(req.data?.applicationId);
  const res = await grantAccess({ applicationId, accessBasis: 'beneficiary' });
  await audit({ type: 'application.approved', targetType: 'application', targetId: applicationId, actorId });
  return res;
});

export const rejectApplication = onCall(async (req) => {
  const actorId = requireAdmin(req);
  const applicationId = z.string().parse(req.data?.applicationId);
  await transition(db.collection('applications').doc(applicationId), STATE.SUBMITTED, { status: STATE.REJECTED });
  await audit({ type: 'application.rejected', targetType: 'application', targetId: applicationId, toStatus: STATE.REJECTED, actorId });
  return { applicationId, status: STATE.REJECTED };
});

// Audit fix #1/#9: transactional read-modify-write; bump the window from max(now, current)
// so an expired member extends forward. Update the PERSISTED claim and DO NOT revoke —
// revoking would force a passwordless re-auth the user can't complete. The client picks up
// the new window on its next ID-token refresh (or getIdToken(true)).
export const extendMember = onCall(async (req) => {
  requireAdmin(req);
  const { uid, addDays } = z.object({ uid: z.string(), addDays: z.number().int().positive() }).parse(req.data);
  const ref = db.collection('members').doc(uid);
  const { accessEnds, accessBasis } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'member_not_found');
    const base = Math.max(Date.now(), snap.get('accessEnds') ?? Date.now());
    const next = base + addDays * 86400_000;
    tx.update(ref, { accessEnds: next, status: STATE.ACTIVE, endedReason: FieldValue.delete() });
    return { accessEnds: next, accessBasis: snap.get('accessBasis') };
  });
  await auth.setCustomUserClaims(uid, { role: 'student', accessBasis, accessEnds });
  await audit({ type: 'member.extended', targetType: 'member', targetId: uid });
  return { uid, accessEnds };
});

// Revoke IS an intended lock-out: expire the claim AND revoke refresh tokens. The Rules
// accessEnds check denies reads on the next refresh; revokeRefreshTokens blocks new tokens.
export const revokeMember = onCall(async (req) => {
  requireAdmin(req);
  const uid = z.string().parse(req.data?.uid);
  await db.collection('members').doc(uid).update({ status: STATE.ENDED, endedReason: 'revoked' });
  await auth.setCustomUserClaims(uid, { role: 'student', accessEnds: Date.now() });
  await auth.revokeRefreshTokens(uid);
  await audit({ type: 'member.revoked', targetType: 'member', targetId: uid, toStatus: STATE.ENDED });
  return { uid, status: STATE.ENDED };
});
