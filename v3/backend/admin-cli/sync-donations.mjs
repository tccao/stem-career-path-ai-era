// Sync Zeffy payments → Firestore donations/{paymentId} for the admin Donations dashboard.
// The Zeffy key stays server-side (this CLI), never in the browser. Idempotent (merge).
//   GOOGLE_APPLICATION_CREDENTIALS=<key.json> [ZEFFY_API_KEY=...] node sync-donations.mjs
import { readFileSync } from 'node:fs';
import { FieldValue } from 'firebase-admin/firestore';
import { db, die } from './lib/admin.mjs';

let key = process.env.ZEFFY_API_KEY;
if (!key) { try { key = readFileSync(new URL('../../Zeffy_API_Key.txt', import.meta.url), 'utf8').trim(); } catch { /* ignore */ } }
if (!key) die('no Zeffy key — set ZEFFY_API_KEY or place v3/Zeffy_API_Key.txt');

async function api(path) {
  const r = await fetch('https://api.zeffy.com' + path, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) die(`Zeffy API ${r.status} on ${path}`);
  return r.json();
}

// 1) campaigns → id:title map
const campaigns = {};
let cursor = null;
do {
  const list = await api(`/api/v1/campaigns?limit=100${cursor ? `&starting_after=${cursor}` : ''}`);
  for (const c of list.data) campaigns[c.id] = c.title;
  cursor = list.has_more ? list.next_cursor : null;
} while (cursor);

// 2) payments → upsert
let n = 0;
cursor = null;
do {
  const list = await api(`/api/v1/payments?limit=100${cursor ? `&starting_after=${cursor}` : ''}`);
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

console.log(`synced ${n} donations across ${Object.keys(campaigns).length} campaign(s)`);
process.exit(0);
