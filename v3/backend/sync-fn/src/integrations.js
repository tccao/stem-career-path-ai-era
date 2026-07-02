import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { z } from 'zod';
import { db, FieldValue } from './context.js';
import { callableOptions, DEFAULT_ACCESS_DAYS, IS_EMULATOR, MAX_ACCESS_DAYS, MAX_SYNC_PAGES, REGION } from './config.js';
import { writeAudit } from './audit.js';
import { assertStaff } from './security.js';
import { grantAccess, STATE } from './lifecycle.js';
import { revokeStudent } from './admin.js';
import { normalizeEmail, parse } from './validation.js';

const ZEFFY_API_KEY = defineSecret('ZEFFY_API_KEY');
const CAL_API_KEY = defineSecret('CAL_API_KEY');
const ZEFFY_BASE_URL = IS_EMULATOR && process.env.ZEFFY_API_BASE_URL
  ? process.env.ZEFFY_API_BASE_URL
  : 'https://api.zeffy.com';
const CAL_BASE_URL = IS_EMULATOR && process.env.CAL_API_BASE_URL
  ? process.env.CAL_API_BASE_URL
  : 'https://api.cal.com';

async function externalJson(url, { headers = {}, timeoutMs = 10_000 } = {}) {
  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new HttpsError('unavailable', `external service unavailable: ${error.name}`);
  }
  if (!response.ok) throw new HttpsError('unavailable', `external service returned ${response.status}`);
  return response.json();
}

const zeffyJson = (path, key) => externalJson(`${ZEFFY_BASE_URL}${path}`, {
  headers: { Authorization: `Bearer ${key}` },
  timeoutMs: 15_000,
});

function refunded(payment) {
  return Boolean(payment.dispute)
    || (payment.refund_status && payment.refund_status !== 'none')
    || ['refunded', 'disputed', 'failed', 'canceled'].includes(String(payment.status || '').toLowerCase());
}

async function loadCampaigns(key) {
  const campaigns = {};
  let cursor = null;
  for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
    const list = await zeffyJson(`/api/v1/campaigns?limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`, key);
    const batch = db.batch();
    for (const campaign of list.data || []) {
      campaigns[campaign.id] = campaign.title;
      batch.set(db.collection('campaigns').doc(campaign.id), {
        campaignId: campaign.id,
        title: campaign.title || null,
        status: campaign.status || null,
        currency: campaign.currency || null,
        syncedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
    cursor = list.has_more ? list.next_cursor : null;
    if (!cursor) break;
  }
  return campaigns;
}

export async function runDonationSync({ key, actorId, cursor = null }) {
  const campaigns = await loadCampaigns(key);
  let synced = 0;
  let pages = 0;
  const refundCandidates = [];

  while (pages < MAX_SYNC_PAGES) {
    const list = await zeffyJson(`/api/v1/payments?limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`, key);
    const batch = db.batch();
    for (const payment of list.data || []) {
      const ref = db.collection('donations').doc(payment.id);
      batch.set(ref, {
        zeffyPaymentId: payment.id,
        email: payment.buyer?.email ? normalizeEmail(payment.buyer.email) : null,
        name: [payment.buyer?.first_name, payment.buyer?.last_name].filter(Boolean).join(' ') || null,
        amount: Number(payment.amount || 0),
        currency: payment.currency || null,
        status: payment.status || null,
        refundStatus: payment.refund_status || null,
        disputed: Boolean(payment.dispute),
        created: payment.created ? payment.created * 1_000 : null,
        campaignId: payment.campaign_id || null,
        campaignName: campaigns[payment.campaign_id] || null,
        syncedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (refunded(payment)) refundCandidates.push(ref);
      synced += 1;
    }
    await batch.commit();
    pages += 1;
    cursor = list.has_more ? list.next_cursor : null;
    if (!cursor) break;
  }

  let revoked = 0;
  for (const ref of refundCandidates) {
    const donation = await ref.get();
    const uid = donation.get('grantedUid');
    if (uid && !donation.get('revocationProcessedAt')) {
      await revokeStudent(uid, { actorId, reasonCode: 'payment_reversed' });
      await ref.set({ revocationProcessedAt: FieldValue.serverTimestamp() }, { merge: true });
      revoked += 1;
    }
  }
  await writeAudit({ type: 'donations.synced', targetType: 'system', targetId: 'zeffy', actorId, reasonCode: `${synced}:${revoked}` });
  return { synced, revoked, campaigns: Object.keys(campaigns).length, nextCursor: cursor, truncated: Boolean(cursor) };
}

export async function runScheduledDonationReconcile({ key }) {
  let cursor = null;
  let synced = 0;
  let revoked = 0;
  let calls = 0;
  do {
    const result = await runDonationSync({ key, actorId: 'system:reconcile', cursor });
    synced += result.synced;
    revoked += result.revoked;
    cursor = result.truncated ? result.nextCursor : null;
    calls += 1;
  } while (cursor && calls < 5);
  if (cursor) console.info(JSON.stringify({ severity: 'NOTICE', donationReconcile: 'truncated', nextCursor: cursor }));
  return { synced, revoked, calls, nextCursor: cursor, truncated: Boolean(cursor) };
}

export const syncDonations = onCall(callableOptions({
  secrets: [ZEFFY_API_KEY], timeoutSeconds: 120, maxInstances: 1,
}), async (req) => {
  const { uid: actorId } = await assertStaff(req);
  const input = parse(z.object({ cursor: z.string().max(1_024).nullable().optional() }).strict(), req.data || {});
  const key = ZEFFY_API_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'Zeffy integration is not configured');
  return runDonationSync({ key, actorId, cursor: input.cursor || null });
});

export const donationReconcile = onSchedule({
  schedule: 'every 24 hours', region: REGION, timeZone: 'America/Chicago', memory: '256MiB',
  timeoutSeconds: 300, maxInstances: 1, secrets: [ZEFFY_API_KEY],
}, async () => {
  const key = ZEFFY_API_KEY.value();
  if (!key) {
    console.info(JSON.stringify({ severity: 'NOTICE', donationReconcile: 'skipped: ZEFFY_API_KEY not configured' }));
    return;
  }
  await runScheduledDonationReconcile({ key });
});

const ConfirmSchema = z.object({
  applicationId: z.string().min(8).max(128),
  paymentId: z.string().min(1).max(256),
  path: z.enum(['fasttrack', 'roadmap']).default('fasttrack'),
  days: z.number().int().min(1).max(MAX_ACCESS_DAYS).default(DEFAULT_ACCESS_DAYS),
}).strict();

export const confirmDonation = onCall(callableOptions({ secrets: [ZEFFY_API_KEY], timeoutSeconds: 60, maxInstances: 5 }), async (req) => {
  const { uid: actorId } = await assertStaff(req);
  const input = parse(ConfirmSchema, req.data);
  const key = ZEFFY_API_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'Zeffy integration is not configured');
  const [payment, application] = await Promise.all([
    zeffyJson(`/api/v1/payments/${encodeURIComponent(input.paymentId)}`, key),
    db.collection('applications').doc(input.applicationId).get(),
  ]);
  if (!application.exists) throw new HttpsError('not-found', 'application not found');
  if (application.get('accessChoice') !== 'supporter') throw new HttpsError('failed-precondition', 'application is not on the supporter path');
  if (application.get('status') === STATE.REJECTED) {
    throw new HttpsError('failed-precondition', 'application is rejected and cannot accept a payment');
  }
  if (payment.status !== 'succeeded' || refunded(payment)) throw new HttpsError('failed-precondition', 'payment is not settled and clean');
  if (normalizeEmail(payment.buyer?.email || '') !== normalizeEmail(application.get('email'))) {
    throw new HttpsError('failed-precondition', 'payment email does not match application email');
  }

  const donationRef = db.collection('donations').doc(input.paymentId);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(donationRef);
    if (existing.exists && existing.get('applicationId') && existing.get('applicationId') !== input.applicationId) {
      throw new HttpsError('already-exists', 'payment is already bound to another application');
    }
    tx.set(donationRef, {
      zeffyPaymentId: input.paymentId,
      applicationId: input.applicationId,
      email: normalizeEmail(payment.buyer.email),
      amount: Number(payment.amount || 0),
      currency: payment.currency || null,
      status: payment.status,
      refundStatus: payment.refund_status || null,
      verificationState: 'VERIFIED',
      verifiedAt: FieldValue.serverTimestamp(),
      verifiedBy: actorId,
    }, { merge: true });
  });
  await writeAudit({ type: 'donation.verified', targetType: 'application', targetId: input.applicationId, actorId, reasonCode: input.paymentId });
  return grantAccess({
    applicationId: input.applicationId,
    accessBasis: 'supporter',
    path: input.path,
    days: input.days,
    actorId,
    paymentId: input.paymentId,
  });
});

export const getInterview = onCall(callableOptions({ secrets: [CAL_API_KEY], timeoutSeconds: 20, maxInstances: 5 }), async (req) => {
  const { uid: actorId } = await assertStaff(req);
  const input = parse(z.object({ applicationId: z.string().min(8).max(128) }).strict(), req.data);
  const application = await db.collection('applications').doc(input.applicationId).get();
  if (!application.exists) throw new HttpsError('not-found', 'application not found');
  const email = normalizeEmail(application.get('email'));
  const key = CAL_API_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'Cal.com integration is not configured');
  const response = await externalJson(`${CAL_BASE_URL}/v2/bookings?attendeeEmail=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${key}`, 'cal-api-version': '2024-08-13' },
  });
  const now = Date.now();
  const bookings = (Array.isArray(response.data) ? response.data : [])
    .filter((booking) => !['cancelled', 'rejected'].includes(booking.status) && Date.parse(booking.start) >= now - 3_600_000)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const booking = bookings[0];
  await writeAudit({ type: 'interview.read', targetType: 'application', targetId: input.applicationId, actorId });
  return {
    booking: booking ? {
      start: booking.start, end: booking.end, title: booking.title,
      status: booking.status, uid: booking.uid || booking.id,
    } : null,
    count: bookings.length,
  };
});
