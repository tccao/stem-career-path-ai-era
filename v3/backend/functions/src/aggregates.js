// Read-light denormalization (V3-Plan §4). Triggers keep two rollups fresh so the hot
// read paths cost ONE doc read each:
//   - memberDashboard/{uid}   → the student dashboard (profile + path + gating + progress)
//   - counters/overview       → the admin overview (counts by status), no collection scans.
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './_db.js';
import { percentComplete } from './curriculum.js';

// Rebuild a member's dashboard rollup whenever their progress changes.
export const onProgressWrite = onDocumentWritten('members/{uid}/progress/{stageKey}', async (event) => {
  const uid = event.params.uid;
  const [member, progress] = await Promise.all([
    db.collection('members').doc(uid).get(),
    db.collection('members').doc(uid).collection('progress').get(),
  ]);
  if (!member.exists) return;
  const path = member.get('path') ?? 'fasttrack';
  const done = progress.docs.filter((d) => d.get('status') === 'complete').length;
  await db.collection('memberDashboard').doc(uid).set({
    profile: { name: member.get('name') ?? '', accessBasis: member.get('accessBasis') },
    path,
    stages: progress.docs.map((d) => ({ key: d.id, state: d.get('status') })),
    progress: { complete: done, percent: percentComplete(path, done) }, // server curriculum
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
});

// Maintain status counters so the admin overview never scans the collection.
export const onApplicationWrite = onDocumentWritten('applications/{id}', async (event) => {
  const before = event.data?.before?.get('status');
  const after = event.data?.after?.get('status');
  if (before === after) return;
  const ref = db.collection('counters').doc('overview');
  const patch = {};
  if (before) patch[before] = FieldValue.increment(-1);
  if (after) patch[after] = FieldValue.increment(1);
  await ref.set(patch, { merge: true });
});
