import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const app = getApps()[0] || initializeApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export { FieldValue, Timestamp };
