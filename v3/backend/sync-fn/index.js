// V3 hosted admin functions (Blaze, 2nd gen). Every callable is admin-claim gated and runs
// with the Admin SDK, so it can do the privileged ops that used to live only in the local
// admin-cli: mint accounts + set custom claims (grant), adjust the access window (extend),
// lock a member out (revoke), read Cal.com bookings (getInterview, key stays server-side), and
// sync Zeffy donations + campaigns (syncDonations, key stays server-side).
//
// Security note: this intentionally relaxes the earlier "no hosted account-minting" invariant
// (we are on Blaze now). It is bounded by: a fail-closed admin-claim gate on every function,
// idempotent/conditional writes, and secrets (Zeffy/Cal.com keys) injected at runtime — never
// shipped to the browser. The local admin-cli remains as an equivalent fallback.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ZEFFY_API_KEY = defineSecret('ZEFFY_API_KEY');
const CAL_API_KEY = defineSecret('CAL_API_KEY');

initializeApp();
const db = getFirestore();
const auth = getAuth();

const REGION = 'us-central1';
const DAY_MS = 86_400_000;
const STATE = Object.freeze({
  SUBMITTED: 'SUBMITTED', INTERVIEW_SCHEDULED: 'INTERVIEW_SCHEDULED',
  GRANTED: 'GRANTED', ACTIVE: 'ACTIVE', ENDED: 'ENDED', REJECTED: 'REJECTED',
});

function assertAdmin(req) {
  if (req.auth?.token?.role !== 'admin') throw new HttpsError('permission-denied', 'admin only');
}
async function audit(ev) {
  await db.collection('auditLog').add({ ...ev, ts: FieldValue.serverTimestamp() });
}

// ---------------------------------------------------------------------------
// syncDonations — pull Zeffy campaigns + payments into Firestore. Also persists
// each campaign to campaigns/{id} so the admin Donations metrics (campaign name)
// render even when there are zero payments yet.
// ---------------------------------------------------------------------------
async function zeffy(path, key) {
  const r = await fetch('https://api.zeffy.com' + path, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new HttpsError('unavailable', `Zeffy API ${r.status} on ${path}`);
  return r.json();
}

export const syncDonations = onCall(
  { secrets: [ZEFFY_API_KEY], region: REGION, memory: '256MiB', timeoutSeconds: 120, cors: true },
  async (req) => {
    assertAdmin(req);
    const key = ZEFFY_API_KEY.value();
    if (!key) throw new HttpsError('failed-precondition', 'ZEFFY_API_KEY secret is not set');

    // 1) campaigns → id:title map + persist each campaign (so the name shows with 0 donations)
    const campaigns = {};
    let cursor = null;
    do {
      const list = await zeffy(`/api/v1/campaigns?limit=100${cursor ? `&starting_after=${cursor}` : ''}`, key);
      const batch = db.batch();
      for (const c of list.data) {
        campaigns[c.id] = c.title;
        batch.set(db.collection('campaigns').doc(c.id), {
          campaignId: c.id, title: c.title ?? null, status: c.status ?? null,
          currency: c.currency ?? null, syncedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
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

// ---------------------------------------------------------------------------
// getInterview — read the applicant's upcoming Cal.com booking (the slot they
// self-scheduled). The Cal.com key stays server-side. Tries API v2 then v1.
// ---------------------------------------------------------------------------
async function calBookings(email, key) {
  // v2 (Bearer + version header)
  try {
    const r = await fetch(`https://api.cal.com/v2/bookings?attendeeEmail=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${key}`, 'cal-api-version': '2024-08-13' },
    });
    if (r.ok) {
      const j = await r.json();
      const d = j.data;
      const arr = Array.isArray(d) ? d : (d?.bookings || []);
      if (arr.length) return arr.map((b) => ({
        start: b.start || b.startTime, end: b.end || b.endTime,
        title: b.title, status: b.status, uid: b.uid || b.id,
        attendees: (b.attendees || []).map((a) => a.email),
      }));
    }
  } catch { /* fall through to v1 */ }
  // v1 (?apiKey) — returns all bookings; filter by attendee email
  const r = await fetch(`https://api.cal.com/v1/bookings?apiKey=${encodeURIComponent(key)}`);
  if (!r.ok) throw new HttpsError('unavailable', `Cal.com API ${r.status}`);
  const j = await r.json();
  const arr = j.bookings || [];
  return arr
    .filter((b) => (b.attendees || []).some((a) => (a.email || '').toLowerCase() === email.toLowerCase()))
    .map((b) => ({
      start: b.startTime, end: b.endTime, title: b.title, status: b.status,
      uid: b.uid || b.id, attendees: (b.attendees || []).map((a) => a.email),
    }));
}

export const getInterview = onCall(
  { secrets: [CAL_API_KEY], region: REGION, timeoutSeconds: 30, cors: true },
  async (req) => {
    assertAdmin(req);
    const email = String(req.data?.email || '').trim();
    if (!email) throw new HttpsError('invalid-argument', 'email required');
    const key = CAL_API_KEY.value();
    if (!key) throw new HttpsError('failed-precondition', 'CAL_API_KEY secret is not set');

    const now = Date.now();
    const all = await calBookings(email, key);
    const upcoming = all
      .filter((b) => b.status !== 'cancelled' && b.status !== 'rejected' && Date.parse(b.start) >= now - 60 * 60 * 1000)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    return { booking: upcoming[0] || null, count: all.length };
  },
);

// ---------------------------------------------------------------------------
// grant — the account-minting path (beneficiary approve OR supporter confirm).
// Mirrors admin-cli/grant.mjs. Idempotent: only from SUBMITTED/INTERVIEW_SCHEDULED.
// ---------------------------------------------------------------------------
export const grant = onCall({ region: REGION, timeoutSeconds: 60, cors: true }, async (req) => {
  assertAdmin(req);
  const applicationId = String(req.data?.applicationId || '').trim();
  if (!applicationId) throw new HttpsError('invalid-argument', 'applicationId required');
  const days = Number(req.data?.days ?? 90);
  const accessBasis = req.data?.basis === 'supporter' ? 'supporter' : 'beneficiary';
  const path = req.data?.path === 'roadmap' ? 'roadmap' : 'fasttrack';

  const appRef = db.collection('applications').doc(applicationId);
  const appSnap = await appRef.get();
  if (!appSnap.exists) throw new HttpsError('not-found', `application ${applicationId} not found`);
  const a = appSnap.data();
  if (![STATE.SUBMITTED, STATE.INTERVIEW_SCHEDULED].includes(a.status)) {
    throw new HttpsError('failed-precondition', `application is ${a.status}, expected SUBMITTED or INTERVIEW_SCHEDULED`);
  }

  const accessEnds = Date.now() + days * DAY_MS;
  const user = await auth.getUserByEmail(a.email).catch(() => auth.createUser({ email: a.email }));
  await auth.setCustomUserClaims(user.uid, { role: 'student', accessBasis, accessEnds });

  const batch = db.batch();
  batch.update(appRef, { status: STATE.GRANTED, grantedUid: user.uid });
  batch.set(db.collection('members').doc(user.uid), {
    status: STATE.ACTIVE, accessBasis, accessEnds, email: a.email, name: a.name ?? '',
    path, applicationId, createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await audit({ type: 'access.granted', targetType: 'member', targetId: user.uid, toStatus: STATE.ACTIVE });
  return { uid: user.uid, accessEnds, path };
});

// ---------------------------------------------------------------------------
// extendAccess — push out the window (no revoke). Mirrors admin-cli/extend.mjs.
// ---------------------------------------------------------------------------
export const extendAccess = onCall({ region: REGION, timeoutSeconds: 30, cors: true }, async (req) => {
  assertAdmin(req);
  const uid = String(req.data?.uid || '').trim();
  const days = Number(req.data?.days);
  if (!uid || !days) throw new HttpsError('invalid-argument', 'uid and days required');

  const ref = db.collection('members').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', `member ${uid} not found`);
  const base = Math.max(Date.now(), snap.get('accessEnds') ?? Date.now());
  const accessEnds = base + days * DAY_MS;

  await ref.update({ accessEnds, status: STATE.ACTIVE });
  await auth.setCustomUserClaims(uid, { role: 'student', accessBasis: snap.get('accessBasis'), accessEnds });
  await audit({ type: 'member.extended', targetType: 'member', targetId: uid });
  return { uid, accessEnds };
});

// ---------------------------------------------------------------------------
// revokeAccess — intended lock-out. Mirrors admin-cli/revoke.mjs.
// ---------------------------------------------------------------------------
export const revokeAccess = onCall({ region: REGION, timeoutSeconds: 30, cors: true }, async (req) => {
  assertAdmin(req);
  const uid = String(req.data?.uid || '').trim();
  if (!uid) throw new HttpsError('invalid-argument', 'uid required');

  await db.collection('members').doc(uid).update({ status: STATE.ENDED, endedReason: 'revoked' });
  await auth.setCustomUserClaims(uid, { role: 'student', accessEnds: Date.now() });
  await auth.revokeRefreshTokens(uid);
  await audit({ type: 'member.revoked', targetType: 'member', targetId: uid, toStatus: STATE.ENDED });
  return { uid };
});
