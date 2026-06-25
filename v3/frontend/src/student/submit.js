// Submit a stage deliverable (Spark/Functions-free). Writes the progress doc directly;
// Firestore Rules require an ACTIVE, in-window student writing their OWN progress with
// status='complete' (see firestore.rules). Strict next-stage gating is relaxed for MVP —
// the SPA presents stages in order.
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase.js';

export async function submit(stageKey, deliverableUrl) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('not signed in');
  await setDoc(doc(db, 'members', uid, 'progress', stageKey), {
    status: 'complete', deliverableUrl, completedAt: serverTimestamp(),
  });
  return { stageKey, status: 'complete' };
}
