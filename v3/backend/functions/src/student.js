// Student actions (V3-Plan §4). Gating is RE-DERIVED server-side from the member's
// progress — the client is never trusted about which stage is open.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db } from './_db.js';
import { audit } from './_audit.js';
import { isStageOpen } from './curriculum.js';

function requireActiveStudent(req) {
  const t = req.auth?.token;
  if (!t || t.role !== 'student') throw new HttpsError('permission-denied', 'not_student');
  if (!(t.accessEnds > Date.now())) throw new HttpsError('permission-denied', 'access_expired');
  return req.auth.uid;
}

const SubmitSchema = z.object({ stageKey: z.string(), deliverableUrl: z.string().url() });

// Mark a gated stage complete. Audit fix #2: gating is RE-DERIVED from the SERVER curriculum
// (curriculum.js) against the member's completed stages — never from the client.
export const submitStage = onCall(async (req) => {
  const uid = requireActiveStudent(req);
  const { stageKey, deliverableUrl } = SubmitSchema.parse(req.data);

  const memberRef = db.collection('members').doc(uid);
  const [member, progress] = await Promise.all([
    memberRef.get(),
    memberRef.collection('progress').where('status', '==', 'complete').get(),
  ]);
  const path = member.get('path') ?? 'fasttrack';
  const completedKeys = progress.docs.map((d) => d.id);
  if (!isStageOpen(path, completedKeys, stageKey)) {
    throw new HttpsError('failed-precondition', 'stage_locked');
  }

  await memberRef.collection('progress').doc(stageKey)
    .set({ status: 'complete', deliverableUrl, completedAt: FieldValue.serverTimestamp() });
  await audit({ type: 'stage.submitted', targetType: 'member', targetId: uid });
  return { stageKey, status: 'complete' };
});

// Short-TTL signed URL for a gated asset — minted only after the gate check (V3-Plan §9).
export const getSignedAsset = onCall(async (req) => {
  requireActiveStudent(req);
  // TODO: getStorage().bucket().file(path).getSignedUrl({ expires: Date.now()+5*60_000 })
  return { url: null, note: 'stub — wire Cloud Storage signed URL' };
});
