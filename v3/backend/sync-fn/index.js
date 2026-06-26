// syncDonations — the single deployed Cloud Function on V3 (Blaze, 2nd gen).
// Admin-gated callable that mirrors the local admin-cli/sync-donations.mjs:
// pulls Zeffy campaigns + payments and upserts Firestore donations/{paymentId}.
// The Zeffy API key NEVER reaches the browser — it is injected at runtime as a
// Functions secret (ZEFFY_API_KEY). Scale-to-zero (no min instances), so there
// is no idle cost; one invocation per admin "Refresh" click. See v3/docs/Architecture-V3.md
// (§ Cost & constraints) for the cost note.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ZEFFY_API_KEY = defineSecret('ZEFFY_API_KEY');

initializeApp();
const db = getFirestore();

async function zeffy(path, key) {
  const r = await fetch('https://api.zeffy.com' + path, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new HttpsError('unavailable', `Zeffy API ${r.status} on ${path}`);
  return r.json();
}

export const syncDonations = onCall(
  { secrets: [ZEFFY_API_KEY], region: 'us-central1', memory: '256MiB', timeoutSeconds: 120, cors: true },
  async (req) => {
    // Fail-closed: only the admin custom claim may run this.
    if (req.auth?.token?.role !== 'admin') throw new HttpsError('permission-denied', 'admin only');
    const key = ZEFFY_API_KEY.value();
    if (!key) throw new HttpsError('failed-precondition', 'ZEFFY_API_KEY secret is not set');

    // 1) campaigns → id:title map
    const campaigns = {};
    let cursor = null;
    do {
      const list = await zeffy(`/api/v1/campaigns?limit=100${cursor ? `&starting_after=${cursor}` : ''}`, key);
      for (const c of list.data) campaigns[c.id] = c.title;
      cursor = list.has_more ? list.next_cursor : null;
    } while (cursor);

    // 2) payments → upsert (idempotent merge on the Zeffy payment id)
    let n = 0;
    cursor = null;
    do {
      const list = await zeffy(`/api/v1/payments?limit=100${cursor ? `&starting_after=${cursor}` : ''}`, key);
      const batch = db.batch();
      for (const p of list.data) {
        batch.set(db.collection('donations').doc(p.id), {
          zeffyPaymentId: p.id,
          email: p.buyer?.email ?? null,
          name: [p.buyer?.first_name, p.buyer?.last_name].filter(Boolean).join(' ') || null,
          amount: p.amount ?? 0,
          currency: p.currency ?? null,
          status: p.status ?? null,
          refundStatus: p.refund_status ?? null,
          created: p.created ? p.created * 1000 : null,
          campaignId: p.campaign_id ?? null,
          campaignName: campaigns[p.campaign_id] ?? null,
          syncedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        n++;
      }
      await batch.commit();
      cursor = list.has_more ? list.next_cursor : null;
    } while (cursor);

    return { synced: n, campaigns: Object.keys(campaigns).length };
  },
);
