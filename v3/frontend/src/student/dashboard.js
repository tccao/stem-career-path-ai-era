// Student dashboard = ONE Firestore read (memberDashboard/{uid}), then cache (V3-Plan §4).
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase.js';
import { redeemFromUrl } from '../lib/accessLink.js';

async function render(uid) {
  const snap = await getDoc(doc(db, 'memberDashboard', uid)); // 1 read (cache on repeat)
  const root = document.getElementById('app-root');
  if (!snap.exists()) { root.textContent = 'No active access.'; return; }
  const d = snap.data(); // { profile, path, stages[], progress, nextAction }
  root.textContent = `Welcome ${d.profile.name} — ${d.path} (${d.progress.percent}%)`;
  // TODO: render path, per-stage gating state, submit buttons (submit.js).
}

// If arriving via magic link, redeem first; otherwise rely on an existing session.
(async () => {
  if (new URLSearchParams(location.search).get('c')) {
    const user = await redeemFromUrl();
    return render(user.uid);
  }
  onAuthStateChanged(auth, (user) => { if (user) render(user.uid); });
})();
