// Shared admin SDK handles. The admin SDK bypasses Security Rules, so ALL mutations
// flow through Functions — the client never writes (V3-Plan §5/§9).
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

export const db = getFirestore();
export const auth = getAuth();

// Lifecycle states (V3-Plan §3).
export const STATE = Object.freeze({
  SUBMITTED: 'SUBMITTED',
  GRANTED: 'GRANTED',
  ACTIVE: 'ACTIVE',
  ENDED: 'ENDED',
  REJECTED: 'REJECTED',
});

/** Conditional transition: run inside a txn, assert the expected current status. */
export async function transition(ref, expected, patch) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('status') !== expected) {
      throw new Error(`illegal_transition: expected ${expected}, got ${snap.get('status')}`);
    }
    tx.update(ref, patch);
  });
}
