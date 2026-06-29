// Extend or restore a member's access window. Active clients pick up the persisted claim on token
// refresh; a previously revoked session must sign in again.
//   node extend.mjs <uid> --days N
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth, STATE, DAY_MS, arg, audit, assertNotStaff, die, requireBreakGlass } from './lib/admin.mjs';

const actorId = requireBreakGlass();

const uid = process.argv[2];
const days = Number(arg('days', ''));
if (!uid || !Number.isInteger(days) || days < 1 || days > 3650) die('usage: node extend.mjs <uid> --days <integer 1..3650>');
const user = await assertNotStaff(uid);
if (!user) die(`user ${uid} not found`);
if (user.disabled) die('enable the account before extending it');

const ref = db.collection('members').doc(uid);
let accessBasis;
let accessEnds;
try {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`member ${uid} not found`);
    if (snap.get('accessBasis') === 'supporter') {
      const donations = await tx.get(db.collection('donations').where('grantedUid', '==', uid).limit(10));
      const eligible = donations.docs.some((donation) => (
        donation.get('verificationState') === 'VERIFIED'
        && donation.get('status') === 'succeeded'
        && !['refunded', 'partially_refunded'].includes(donation.get('refundStatus'))
        && donation.get('disputed') !== true
        && !donation.get('revocationProcessedAt')
      ));
      if (!eligible) throw new Error('supporter access requires a current verified payment');
    }
    accessBasis = snap.get('accessBasis');
    const base = Math.max(Date.now(), snap.get('accessEnds') ?? Date.now());
    accessEnds = base + days * DAY_MS;
    tx.update(ref, {
      accessEnds,
      status: STATE.ACTIVE,
      endedReason: FieldValue.delete(),
      endedAt: FieldValue.delete(),
      expiresAt: FieldValue.delete(),
    });
  });
} catch (error) {
  die(error.message || 'extension failed');
}
await auth.setCustomUserClaims(uid, {
  role: 'student', accessBasis, accessEnds,
  ...(user.customClaims?.sessionVersion ? { sessionVersion: user.customClaims.sessionVersion } : {}),
});
await audit({ type: 'member.extended', targetType: 'member', targetId: uid, actorId });
console.log(`ok: ${uid} extended ${days}d → accessEnds=${new Date(accessEnds).toISOString()}`);
process.exit(0);
