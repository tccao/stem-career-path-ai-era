// Live test of the DEPLOYED Firestore Rules using the client (web) SDK + anonymous auth —
// exactly what the hosted site does. Verifies a valid application is allowed and an undeclared
// age value is denied, against the real code4good-stem-career-path project.
//   cd v3/frontend && node scripts/live-apply.mjs
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

const useEmulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);
try { process.loadEnvFile('.env'); } catch (error) { if (!useEmulators) throw error; }
const cfg = {
  apiKey: process.env.VITE_FB_API_KEY || 'emulator-api-key',
  authDomain: process.env.VITE_FB_AUTH_DOMAIN || 'demo-cfg.firebaseapp.com',
  projectId: process.env.VITE_FB_PROJECT_ID || 'demo-cfg',
  appId: process.env.VITE_FB_APP_ID || 'emulator-app-id',
};
const app = initializeApp(cfg);
const auth = getAuth(app);
// Node needs long-polling (no WebChannel streaming outside a browser).
const db = initializeFirestore(app, { experimentalForceLongPolling: true });
if (useEmulators) {
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const [firestoreHost, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(db, firestoreHost, Number(firestorePort));
}

const timer = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 25000);

const u = await signInAnonymously(auth);
console.log('anon uid', u.user.uid);

const id = `live-${Date.now()}`;
// 1) valid application → must be ALLOWED by deployed Rules
await setDoc(doc(db, 'applications', id), {
  status: 'SUBMITTED', accessChoice: 'beneficiary',
  email: 'live-student@example.com', name: 'Live Test Student',
  ageBracket: '18plus', guardianConsent: false,
  stage: 'recent-graduate', track: 'fasttrack', reason: 'Rules smoke test',
  createdAt: serverTimestamp(),
});
console.log('OK  valid application created:', id);

// 2) undeclared age value → must be DENIED by deployed Rules
let denied = false;
try {
  await setDoc(doc(db, 'applications', `live-bad-${Date.now()}`), {
    status: 'SUBMITTED', accessChoice: 'beneficiary',
    email: 'invalid-age@example.com', name: 'Invalid Age Value',
    ageBracket: 'unsupported', guardianConsent: false,
    stage: 'recent-graduate', track: 'fasttrack', reason: 'Rules negative test',
    createdAt: serverTimestamp(),
  });
} catch (e) { denied = true; console.log('OK  unsupported age denied:', e.code); }
if (!denied) { console.error('FAIL unsupported age was ALLOWED by Rules'); process.exit(1); }

clearTimeout(timer);
console.log(`APPLY_RULES_PASS applicationId=${id}`);
process.exit(0);
