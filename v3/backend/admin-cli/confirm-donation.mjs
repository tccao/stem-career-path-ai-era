// Confirm a supporter donation via the Zeffy API (FAIL-CLOSED), then grant supporter access.
// Idempotent on the Zeffy payment id. The Zeffy key is supplied only for this process
// through $ZEFFY_API_KEY and is never read from a repository-local plaintext file.
//   GOOGLE_APPLICATION_CREDENTIALS=<key.json> [ZEFFY_API_KEY=...] \
//     node confirm-donation.mjs <applicationId> <zeffyPaymentId> [--path fasttrack|roadmap]
import { spawnSync } from 'node:child_process';
import { FieldValue } from 'firebase-admin/firestore';
import { db, audit, arg, die, requireBreakGlass } from './lib/admin.mjs';

const actorId = requireBreakGlass();

const appId = process.argv[2];
const paymentId = process.argv[3];
if (!appId || !paymentId) die('usage: confirm-donation.mjs <applicationId> <zeffyPaymentId> [--path fasttrack|roadmap]');

const key = process.env.ZEFFY_API_KEY;
if (!key) die('no Zeffy key — set ZEFFY_API_KEY for this process');

// Idempotency: a synced payment is not the same as a verified/bound payment.
const donRef = db.collection('donations').doc(paymentId);
const existing = await donRef.get();
if (existing.exists && existing.get('applicationId') && existing.get('applicationId') !== appId) die('payment is already bound to another application');
if (existing.get('grantedUid')) { console.log(`already granted (idempotent): ${paymentId}`); process.exit(0); }

const application = await db.collection('applications').doc(appId).get();
if (!application.exists) die(`application ${appId} not found`);
if (application.get('accessChoice') !== 'supporter') die('application is not on the supporter path');

// FAIL CLOSED: fetch the payment from Zeffy and require a clean, settled donation.
const res = await fetch(`https://api.zeffy.com/api/v1/payments/${encodeURIComponent(paymentId)}`, {
  headers: { Authorization: `Bearer ${key}` },
  signal: AbortSignal.timeout(15_000),
});
if (!res.ok) die(`Zeffy API ${res.status} — payment not verified`);
const p = await res.json();
if (p.status !== 'succeeded') die(`payment status "${p.status}" (need succeeded)`);
if (p.refund_status && p.refund_status !== 'none') die(`payment refunded (${p.refund_status})`);
if (p.dispute) die('payment is disputed');
if (String(p.buyer?.email || '').trim().toLowerCase() !== String(application.get('email')).trim().toLowerCase()) {
  die('payment email does not match application email');
}

await donRef.set({
  applicationId: appId, zeffyPaymentId: paymentId, amount: p.amount, currency: p.currency,
  campaignId: p.campaign_id ?? null, verificationState: 'VERIFIED',
  verifiedAt: FieldValue.serverTimestamp(), verifiedBy: actorId,
}, { merge: true });
await audit({ type: 'donation.verified', targetType: 'application', targetId: appId, actorId });
console.log(`verified ${paymentId}: ${(p.amount / 100).toFixed(2)} ${p.currency} succeeded`);

// Grant supporter access (account-minting stays in grant.mjs).
const args = ['grant.mjs', appId, '--basis', 'supporter', '--payment', paymentId];
const path = arg('path', '');
if (path) args.push('--path', path);
const r = spawnSync(process.execPath, args, { cwd: new URL('.', import.meta.url), env: process.env, encoding: 'utf8' });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
process.exit(r.status === 0 ? 0 : 1);
