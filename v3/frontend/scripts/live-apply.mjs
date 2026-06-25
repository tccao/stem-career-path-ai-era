// Live test of the DEPLOYED Firestore Rules using the client (web) SDK + anonymous auth —
// exactly what the hosted site does. Verifies a valid application is allowed and an under-13
// application is denied, against the real code4good-stem-career-path project.
//   cd v3/frontend && node scripts/live-apply.mjs
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { initializeFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

process.loadEnvFile('.env'); // Node 24: load VITE_FB_* from v3/frontend/.env
const cfg = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  appId: process.env.VITE_FB_APP_ID,
};
const app = initializeApp(cfg);
const auth = getAuth(app);
// Node needs long-polling (no WebChannel streaming outside a browser).
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

const timer = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 25000);

const u = await signInAnonymously(auth);
console.log('anon uid', u.user.uid);

const id = `live-${Date.now()}`;
// 1) valid application → must be ALLOWED by deployed Rules
await setDoc(doc(db, 'applications', id), {
  status: 'SUBMITTED', accessChoice: 'beneficiary',
  email: 'live-student@example.com', name: 'Live Test Student',
  ageBracket: '18plus', guardianConsent: false, createdAt: serverTimestamp(),
});
console.log('OK  valid application created:', id);

// 2) under-13 application → must be DENIED by deployed Rules
let denied = false;
try {
  await setDoc(doc(db, 'applications', `live-bad-${Date.now()}`), {
    status: 'SUBMITTED', accessChoice: 'beneficiary',
    email: 'kid@example.com', name: 'Too Young',
    ageBracket: 'under13', guardianConsent: false, createdAt: serverTimestamp(),
  });
} catch (e) { denied = true; console.log('OK  under-13 denied:', e.code); }
if (!denied) { console.error('FAIL under-13 was ALLOWED by Rules'); process.exit(1); }

clearTimeout(timer);
console.log(`APPLY_RULES_PASS applicationId=${id}`);
process.exit(0);
