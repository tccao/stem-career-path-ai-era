// LIVE client-side check of the DEPLOYED Rules for a student session: sign in with the
// minted custom token (carries role=student + accessEnds claims), then assert the student
// can read their OWN member doc but is DENIED another member's. Reads /tmp/e2e.json.
//   cd v3/frontend && node scripts/live-student-read.mjs
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { initializeFirestore, doc, getDoc } from 'firebase/firestore';

process.loadEnvFile('.env');
const { studentUid, otherUid, token } = JSON.parse(readFileSync('/tmp/e2e.json', 'utf8'));
const cfg = {
  apiKey: process.env.VITE_FB_API_KEY, authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID, appId: process.env.VITE_FB_APP_ID,
};
const app = initializeApp(cfg);
const auth = getAuth(app);
const db = initializeFirestore(app, { experimentalForceLongPolling: true });
const timer = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 25000);

await signInWithCustomToken(auth, token);
console.log('signed in as student', studentUid);

const own = await getDoc(doc(db, 'members', studentUid));
if (!own.exists()) { console.error('FAIL student cannot read own member'); process.exit(1); }
console.log('OK  student reads OWN member');

let denied = false;
try { await getDoc(doc(db, 'members', otherUid)); }
catch (e) { denied = true; console.log('OK  other member DENIED:', e.code); }
if (!denied) { console.error('FAIL other member was readable'); process.exit(1); }

clearTimeout(timer);
console.log('STUDENT_RULES_PASS');
process.exit(0);
