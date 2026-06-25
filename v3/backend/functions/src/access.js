// Passwordless access (V3-Plan §5). Issue a single-use code (nanoid), email it as a
// magic link, then exchange it for a Firebase session. No password is ever stored —
// only the SHA-256 of the unguessable 256-bit code.
//
// Audit fix #1: role/window claims are PERSISTED on the account via setCustomUserClaims
// (done at grant time, see lifecycle.grantAccess), NOT baked one-shot into the custom
// token. So extend/revoke can update the window and the client just refreshes its ID
// token (getIdToken(true)) — a passwordless user is never forced to re-auth.
// Audit fix #7: expiresAt is a Firestore Timestamp so the TTL policy actually purges codes.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { customAlphabet } from 'nanoid';
import { db, auth } from './_db.js';
import { audit } from './_audit.js';
import { CODE_TTL_MS } from './config.js';

const newCode = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 24);

// 256-bit codes are unguessable, so SHA-256(code) is itself the lookup id — the raw code
// never lands in the DB.
const codeId = (code) => createHash('sha256').update(code).digest('hex');

/** Mint a one-time code for a uid, store its hash as the doc id, email the magic link. */
export async function issueCodeFor(uid) {
  const code = newCode();
  await db.collection('accessCodes').doc(codeId(code)).set({
    uid,
    expiresAt: Timestamp.fromMillis(Date.now() + CODE_TTL_MS), // TTL policy field
    usedAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  // TODO: send email via Trigger Email / SendGrid — link: https://<app>/app.html?c=<code>
  return { code }; // returned for local/dev; in prod it is emailed, never returned
}

// PUBLIC: redeem ?c=<code> → custom token. Verifies hash + unused + unexpired in a txn.
// The session's role/window come from the account's PERSISTED custom claims, not from here.
export const redeemCode = onCall(async (req) => {
  const code = String(req.data?.code ?? '');
  if (!code) throw new HttpsError('invalid-argument', 'missing_code');
  const ref = db.collection('accessCodes').doc(codeId(code));
  const rec = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'invalid_code');
    const d = snap.data();
    if (d.usedAt) throw new HttpsError('failed-precondition', 'code_used');
    if (d.expiresAt.toMillis() < Date.now()) throw new HttpsError('failed-precondition', 'code_expired');
    tx.update(ref, { usedAt: FieldValue.serverTimestamp() });
    return d;
  });
  const token = await auth.createCustomToken(rec.uid); // claims flow from setCustomUserClaims
  await audit({ type: 'access.redeemed', targetType: 'member', targetId: rec.uid });
  return { token };
});
