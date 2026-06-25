// Supporter self-serve (V3-Plan §5). Card entry is off-stack on Zeffy; this verifies the
// donation SERVER-SIDE (read-only) and auto-grants — never trusts a raw client "I paid".
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db } from './_db.js';
import { audit } from './_audit.js';
import { grantAccess } from './lifecycle.js';

const Schema = z.object({ applicationId: z.string(), zeffyPaymentId: z.string() });

export const verifyDonation = onCall(async (req) => {
  const { applicationId, zeffyPaymentId } = Schema.parse(req.data);

  // Idempotency: a given Zeffy payment can grant at most once.
  const donRef = db.collection('donations').doc(zeffyPaymentId);
  const already = await donRef.get();
  if (already.exists) return { status: 'GRANTED', idempotent: true };

  // Audit fix #5: FAIL CLOSED. Verify against Zeffy's read-only Payments API; if the
  // integration isn't configured we throw rather than defaulting to "verified" — a raw
  // client "I paid" is never proof (security invariant).
  await verifyZeffyPayment(zeffyPaymentId);

  await donRef.set({ applicationId, zeffyPaymentId, verifiedAt: FieldValue.serverTimestamp() });
  await audit({ type: 'donation.verified', targetType: 'application', targetId: applicationId });

  const res = await grantAccess({ applicationId, accessBasis: 'supporter' });
  return { ...res, emailedMagicLink: true };
});

/**
 * Confirm a payment via Zeffy's read-only Payments API. Reads the key from
 * SSM/Secret/env (never the client). Throws on missing config or unsettled payment.
 * TODO: implement the real HTTPS call; this stub fails closed by design.
 */
async function verifyZeffyPayment(zeffyPaymentId) {
  const apiKey = process.env.ZEFFY_READONLY_KEY;
  if (!apiKey) throw new HttpsError('failed-precondition', 'donation_verification_unconfigured');
  // const res = await fetch(`https://api.zeffy.com/.../payments/${zeffyPaymentId}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  // const p = await res.json(); if (!res.ok || p.status !== 'settled') throw new HttpsError('failed-precondition', 'donation_not_verified');
  throw new HttpsError('unimplemented', 'zeffy_verify_not_implemented');
}
