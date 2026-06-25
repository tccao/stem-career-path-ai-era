// Scheduled expiry sweep (V3-Plan §3/§5). Replaces the demo's runExpirySweep().
// Members past their accessEnds → ENDED, and their sessions are revoked so the next
// request is denied (the accessEnds claim also fails the Firestore Rules check).
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, auth, STATE } from './_db.js';
import { audit } from './_audit.js';

export const expirySweep = onSchedule('every 24 hours', async () => {
  const now = Date.now();
  const due = await db.collection('members')
    .where('status', '==', STATE.ACTIVE)
    .where('accessEnds', '<', now)
    .get();
  for (const m of due.docs) {
    await m.ref.update({ status: STATE.ENDED, endedReason: 'expired' });
    await auth.revokeRefreshTokens(m.id);
    await audit({ type: 'member.expired', targetType: 'member', targetId: m.id, toStatus: STATE.ENDED });
  }
  // TODO: also run the Zeffy reconcile poll + email reminders here (one schedule, V3-Plan §2).
});
