// Student dashboard (Spark/Functions-free). Reads the member doc + progress directly,
// gated by Firestore Rules (role=student claim + accessEnds>now). Curriculum is the cached
// static bundle (0 Firestore reads). Sign-in is passwordless email-link.
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase.js';
import { completeSignInIfPresent, onAuthStateChanged, mountLogin } from '../lib/auth.js';
import { loadCurriculum } from '../lib/cache.js';

async function render(uid) {
  const root = document.getElementById('app-root');
  const memberSnap = await getDoc(doc(db, 'members', uid)); // Rules: own doc
  if (!memberSnap.exists()) { root.textContent = 'No active access. Ask an admin to grant a seat.'; return; }
  const m = memberSnap.data();
  const progressSnap = await getDocs(collection(db, 'members', uid, 'progress'));
  const done = progressSnap.docs.filter((d) => d.data().status === 'complete').length;
  const curriculum = await loadCurriculum();
  const total = (curriculum[m.path]?.stages ?? []).length;
  const pct = total ? Math.round((100 * done) / total) : 0;
  root.textContent = `Welcome ${m.name || m.email} — ${m.path} (${pct}%, ${done}/${total})`;
  // TODO: render the gated stage list + submit buttons (submit.js / path.js).
}

(async () => {
  const linkUser = await completeSignInIfPresent(); // finish email-link if present
  if (linkUser) return render(linkUser.uid);
  onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) render(user.uid);
    else mountLogin(document.getElementById('app-root'), 'Student sign-in');
  });
})();
