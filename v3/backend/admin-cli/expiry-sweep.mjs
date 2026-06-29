// Expiry sweep: members past their accessEnds → ENDED + revoke. Run manually or via the
// admin machine's cron (replaces the Blaze EventBridge/scheduler).
//   node expiry-sweep.mjs
import { db, auth, STATE, audit, recordRevocation, requireBreakGlass } from './lib/admin.mjs';

const actorId = requireBreakGlass();

const now = Date.now();
const due = await db.collection('members')
  .where('status', '==', STATE.ACTIVE)
  .where('accessEnds', '<', now)
  .get();

let n = 0;
for (const m of due.docs) {
  await m.ref.update({ status: STATE.ENDED, endedReason: 'expired' });
  await auth.setCustomUserClaims(m.id, { role: 'student', accessEnds: now });
    await recordRevocation(m.id);
    await audit({ type: 'member.expired', targetType: 'member', targetId: m.id, actorId, toStatus: STATE.ENDED });
  n++;
}
console.log(`ok: expired ${n} member(s)`);
process.exit(0);
