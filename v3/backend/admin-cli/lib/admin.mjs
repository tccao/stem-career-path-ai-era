// Shared Admin SDK init for the admin-cli (Spark-Backend.md §4).
// Credentials resolution order:
//   1. Emulator: if FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST are set, no key needed.
//   2. Real project: GOOGLE_APPLICATION_CREDENTIALS → a service-account key JSON (kept out of git).
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'code4good-stem-career-path';
const onEmulator = !!(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);

export const app = initializeApp(
  onEmulator
    ? { projectId: PROJECT_ID }                  // emulator: no real credentials
    : { credential: applicationDefault(), projectId: PROJECT_ID } // GOOGLE_APPLICATION_CREDENTIALS
);

export const db = getFirestore(app);
export const auth = getAuth(app);

export const STATE = Object.freeze({
  SUBMITTED: 'SUBMITTED', GRANTED: 'GRANTED', ACTIVE: 'ACTIVE', ENDED: 'ENDED', REJECTED: 'REJECTED',
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

export function die(msg) { console.error(`error: ${msg}`); process.exit(1); }
