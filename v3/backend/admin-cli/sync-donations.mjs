// Sync Zeffy payments → Firestore donations/{paymentId} for the admin Donations dashboard.
// The Zeffy key stays server-side (this CLI), never in the browser. Idempotent (merge).
//   GOOGLE_APPLICATION_CREDENTIALS=<key.json> [ZEFFY_API_KEY=...] node sync-donations.mjs
import { FieldValue } from 'firebase-admin/firestore';
import { db, die, requireBreakGlass } from './lib/admin.mjs';

requireBreakGlass();

const key = process.env.ZEFFY_API_KEY;
if (!key) die('no Zeffy key — set ZEFFY_API_KEY for this process');

async function api(path) {
  const r = await fetch('https://api.zeffy.com' + path, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) die(`Zeffy API ${r.status} on ${path}`);
  return r.json();
}

// 1) campaigns → id:title map
const campaigns = {};
let cursor = null;
let campaignPages = 0;
do {
  const list = await api(`/api/v1/campaigns?limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`);
  for (const c of list.data) campaigns[c.id] = c.title;
  cursor = list.has_more ? list.next_cursor : null;
  campaignPages++;
} while (cursor && campaignPages < 10);

// 2) payments → upsert
let n = 0;
cursor = null;
let paymentPages = 0;
do {
  const list = await api(`/api/v1/payments?limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`);
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
  paymentPages++;
} while (cursor && paymentPages < 10);

console.log(`synced ${n} donations across ${Object.keys(campaigns).length} campaign(s)${cursor ? '; more pages remain — use the hosted callable for cursor-safe continuation' : ''}`);
process.exit(0);
