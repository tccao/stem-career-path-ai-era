import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { db, FieldValue } from './context.js';
import { callableOptions } from './config.js';
import { CURRICULUM, isKnownStage, nextOpenStage } from './curriculum.js';
import { queueAudit, logCommittedAudit } from './audit.js';
import { assertActiveStudent, assertStaff } from './security.js';
import { parse } from './validation.js';
import { STATE } from './lifecycle.js';

const SubmitStageSchema = z.object({
  stageKey: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  deliverableUrl: z.url().max(2_048),
}).strict();

function safeProofUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new HttpsError('invalid-argument', 'proof URL must use HTTP or HTTPS');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new HttpsError('invalid-argument', 'proof URL must use HTTPS');
  }
  return url.toString();
}

async function activeMember(uid) {
  const snap = await db.collection('members').doc(uid).get();
  if (!snap.exists || snap.get('status') !== STATE.ACTIVE || !(Number(snap.get('accessEnds') || 0) > Date.now())) {
    throw new HttpsError('permission-denied', 'active member access required');
  }
  return snap;
}

export const getCurriculum = onCall(callableOptions(), async (req) => {
  const role = req.auth?.token?.role;
  if (role === 'student') {
    const uid = await assertActiveStudent(req);
    await activeMember(uid);
  } else {
    await assertStaff(req);
  }
  return { curriculum: CURRICULUM };
});
export const getStudentDashboard = onCall(callableOptions(), async (req) => {
  const uid = await assertActiveStudent(req);
  const memberRef = db.collection('members').doc(uid);
  const [member, progress, locks] = await Promise.all([
    activeMember(uid),
    memberRef.collection('progress').get(),
    memberRef.collection('stageLocks').get(),
  ]);
  return {
    member: {
      status: member.get('status'), name: member.get('name') || '', email: member.get('email') || '',
      accessBasis: member.get('accessBasis'), accessEnds: member.get('accessEnds'), path: member.get('path'),
    },
    progress: progress.docs.map((doc) => ({ stageKey: doc.id, ...doc.data(), completedAt: doc.get('completedAt')?.toMillis?.() || null })),
    locks: Object.fromEntries(locks.docs.map((doc) => [doc.id, doc.get('state')])),
    curriculum: CURRICULUM,
  };
});

export const submitStage = onCall(callableOptions(), async (req) => {
  const uid = await assertActiveStudent(req);
  const input = parse(SubmitStageSchema, req.data);
  const deliverableUrl = safeProofUrl(input.deliverableUrl);
  const memberRef = db.collection('members').doc(uid);
  const progressRef = memberRef.collection('progress').doc(input.stageKey);
  const lockRef = memberRef.collection('stageLocks').doc(input.stageKey);
  let idempotent = false;

  await db.runTransaction(async (tx) => {
    const member = await tx.get(memberRef);
    if (!member.exists || member.get('status') !== STATE.ACTIVE || !(Number(member.get('accessEnds') || 0) > Date.now())) {
      throw new HttpsError('permission-denied', 'active member access required');
    }
    const path = member.get('path');
    if (!isKnownStage(path, input.stageKey)) throw new HttpsError('invalid-argument', 'unknown stage');

    const [existing, progress, lock] = await Promise.all([
      tx.get(progressRef),
      tx.get(memberRef.collection('progress').where('status', '==', 'complete')),
      tx.get(lockRef),
    ]);
    if (existing.exists && existing.get('status') === 'complete') {
      idempotent = true;
      return;
    }
    if (lock.exists && lock.get('state') === 'locked') throw new HttpsError('failed-precondition', 'stage is administratively locked');
    const completed = progress.docs.map((doc) => doc.id);
    const naturallyOpen = nextOpenStage(path, completed) === input.stageKey;
    const overrideOpen = lock.exists && lock.get('state') === 'unlocked';
    if (!naturallyOpen && !overrideOpen) throw new HttpsError('failed-precondition', 'complete prior stages first');

    tx.create(progressRef, { status: 'complete', deliverableUrl, completedAt: FieldValue.serverTimestamp() });
    tx.update(memberRef, { progressCompleted: completed.length + 1 });
    queueAudit(tx, { type: 'stage.submitted', targetType: 'member', targetId: uid, actorId: uid, reasonCode: input.stageKey });
  });

  if (!idempotent) logCommittedAudit({ type: 'stage.submitted', targetType: 'member', targetId: uid, actorId: uid, reasonCode: input.stageKey });
  return { stageKey: input.stageKey, status: 'complete', idempotent };
});
