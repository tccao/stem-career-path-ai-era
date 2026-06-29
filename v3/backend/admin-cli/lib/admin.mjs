// Shared Admin SDK init for the admin-cli (Spark-Backend.md §4).
// Credentials resolution order:
//   1. Emulator: if FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are set, no key needed.
//   2. Real project: GOOGLE_APPLICATION_CREDENTIALS → a service-account key JSON (kept out of git).
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'code4good-stem-career-path';
const firestoreEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '';
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
const isLoopbackHost = (value) => /^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(value);

if (Boolean(firestoreEmulatorHost) !== Boolean(authEmulatorHost)) {
  throw new Error('refusing partial emulator configuration: set both FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST');
}
if (firestoreEmulatorHost && (!isLoopbackHost(firestoreEmulatorHost) || !isLoopbackHost(authEmulatorHost))) {
  throw new Error('refusing non-loopback emulator hosts');
}
export const onEmulator = Boolean(firestoreEmulatorHost && authEmulatorHost);

export const app = initializeApp(
  onEmulator
    ? { projectId: PROJECT_ID }                  // emulator: no real credentials
    : { credential: applicationDefault(), projectId: PROJECT_ID } // GOOGLE_APPLICATION_CREDENTIALS
);

export const db = getFirestore(app);
export const auth = getAuth(app);

export const STATE = Object.freeze({
  SUBMITTED: 'SUBMITTED', INTERVIEW_SCHEDULED: 'INTERVIEW_SCHEDULED',
  GRANTED: 'GRANTED', ACTIVE: 'ACTIVE', ENDED: 'ENDED', REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED', DISABLED: 'DISABLED',
});

export const DAY_MS = 86400_000;

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

export async function audit(event) {
  const { FieldValue } = await import('firebase-admin/firestore');
  await db.collection('auditLog').add({ ...event, ts: FieldValue.serverTimestamp() });
}

export function requireBreakGlass() {
  if (onEmulator) return 'emulator';
  if (process.env.CFG_BREAK_GLASS !== 'I_UNDERSTAND_PRODUCTION_BYPASS') {
    die('production Admin-SDK mutation blocked; use the MFA/App-Check callable or set CFG_BREAK_GLASS=I_UNDERSTAND_PRODUCTION_BYPASS for an incident');
  }
  if (!process.env.CFG_OPERATOR_ID) die('CFG_OPERATOR_ID (operator Firebase uid) is required for break-glass audit attribution');
  return process.env.CFG_OPERATOR_ID;
}

export async function assertNotStaff(uid) {
  const user = await auth.getUser(uid).catch(() => null);
  const role = user?.customClaims?.role;
  if (role === 'admin' || role === 'owner') die('member operation cannot target a staff account');
  return user;
}

export async function recordRevocation(uid) {
  const { randomUUID } = await import('node:crypto');
  const { Timestamp } = await import('firebase-admin/firestore');
  const before = await auth.getUser(uid);
  const sessionVersion = randomUUID();
  await auth.setCustomUserClaims(uid, { ...(before.customClaims || {}), sessionVersion });
  await auth.revokeRefreshTokens(uid);
  const user = await auth.getUser(uid);
  const revokeTime = Math.floor(new Date(user.tokensValidAfterTime).getTime() / 1000);
  await db.collection('revocations').doc(uid).set({
    revokeTime, sessionVersion,
    expiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY_MS),
  });
  return revokeTime;
}

export function die(msg) { console.error(`error: ${msg}`); process.exit(1); }
