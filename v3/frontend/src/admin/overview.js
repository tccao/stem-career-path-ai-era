// Admin overview (Spark/Functions-free). No trigger-maintained counters; tally applications
// by status with a direct admin-gated read. Fine at pilot scale.
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase.js';
import { completeSignInIfPresent, onAuthStateChanged } from '../lib/auth.js';

async function render() {
  const snap = await getDocs(collection(db, 'applications')); // Rules: isAdmin
  const counts = {};
  snap.forEach((d) => { const s = d.data().status; counts[s] = (counts[s] ?? 0) + 1; });
  document.getElementById('admin-root').textContent =
    `Applications — ` + Object.entries(counts).map(([k, v]) => `${k}:${v}`).join('  ') || 'none';
}

(async () => {
  await completeSignInIfPresent();
  onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) render().catch((e) => {
      document.getElementById('admin-root').textContent = `Not authorized (${e.code || e.message}).`;
    });
    else document.getElementById('admin-root').textContent = 'Sign in with your admin email link.';
  });
})();
