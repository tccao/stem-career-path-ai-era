// Confirm a supporter donation via the Zeffy API (FAIL-CLOSED), then grant supporter access.
// Idempotent on the Zeffy payment id. The Zeffy key is read from $ZEFFY_API_KEY or the
// gitignored v3/Zeffy_API_Key.txt — never committed.
//   GOOGLE_APPLICATION_CREDENTIALS=<key.json> [ZEFFY_API_KEY=...] \
//     node confirm-donation.mjs <applicationId> <zeffyPaymentId> [--path fasttrack|roadmap]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { FieldValue } from 'firebase-admin/firestore';
import { db, audit, arg, die } from './lib/admin.mjs';

const appId = process.argv[2];
const paymentId = process.argv[3];
if (!appId || !paymentId) die('usage: confirm-donation.mjs <applicationId> <zeffyPaymentId> [--path fasttrack|roadmap]');

let key = process.env.ZEFFY_API_KEY;
if (!key) { try { key = readFileSync(new URL('../../Zeffy_API_Key.txt', import.meta.url), 'utf8').trim(); } catch { /* ignore */ } }
if (!key) die('no Zeffy key — set ZEFFY_API_KEY or place v3/Zeffy_API_Key.txt');

// Idempotency: a payment can fund at most one grant.
const donRef = db.collection('donations').doc(paymentId);
const existing = await donRef.get();
if (existing.exists && existing.get('applicationId') && existing.get('applicationId') !== appId) {
  die(`payment already linked to application ${existing.get('applicationId')}`);
}

// FAIL CLOSED: fetch the payment from Zeffy and require a clean, settled donation.
const res = await fetch(`https://api.zeffy.com/api/v1/payments/${encodeURIComponent(paymentId)}`, {
  headers: { Authorization: `Bearer ${key}` },
});
if (!res.ok) die(`Zeffy API ${res.status} — payment not verified`);
const p = await res.json();
if (p.status !== 'succeeded') die(`payment status "${p.status}" (need succeeded)`);
if (p.refund_status && p.refund_status !== 'none') die(`payment refunded (${p.refund_status})`);
if (p.dispute) die('payment is disputed');

await donRef.set({
  applicationId: appId, zeffyPaymentId: paymentId, amount: p.amount, currency: p.currency,
  campaignId: p.campaign_id ?? null, verifiedAt: FieldValue.serverTimestamp(),
  paymentStatus: p.status, refundStatus: p.refund_status ?? null, dispute: !!p.dispute,
}, { merge: true });
await audit({ type: 'donation.verified', targetType: 'application', targetId: appId });
console.log(`verified ${paymentId}: ${(p.amount / 100).toFixed(2)} ${p.currency} succeeded`);

// Grant supporter access (account-minting stays in grant.mjs).
const args = ['grant.mjs', appId, '--basis', 'supporter'];
const path = arg('path', '');
if (path) args.push('--path', path);
const r = spawnSync(process.execPath, args, { cwd: new URL('.', import.meta.url), env: process.env, encoding: 'utf8' });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
process.exit(r.status === 0 ? 0 : 1);
