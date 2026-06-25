// Admin overview = ONE read of the denormalized counters singleton (V3-Plan §4) — no scans.
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase.js';

async function render() {
  const snap = await getDoc(doc(db, 'counters', 'overview')); // 1 read; maintained by triggers
  const c = snap.data() ?? {};
  document.getElementById('admin-root').textContent =
    `Submitted ${c.SUBMITTED ?? 0} · Granted ${c.GRANTED ?? 0} · Active ${c.ACTIVE ?? 0} · Ended ${c.ENDED ?? 0}`;
}

onAuthStateChanged(auth, (user) => {
  if (user) render(); // Rules require token.role == 'admin'
  else document.getElementById('admin-root').textContent = 'Please sign in.';
});
