// Break-glass grant path. Normal production grants use the hosted `grant` or
// `confirmDonation` callable. Emulator use is unrestricted; real-project use requires
// the explicit break-glass environment gate from lib/admin.mjs.
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth, STATE, DAY_MS, arg, assertNotStaff, die, recordRevocation, requireBreakGlass } from './lib/admin.mjs';

const actorId = requireBreakGlass();
const applicationId = process.argv[2];
if (!applicationId) die('usage: node grant.mjs <applicationId> [--days N] [--basis beneficiary|supporter] [--path fasttrack|roadmap] [--payment id]');
const days = Number(arg('days', '365'));
const accessBasis = arg('basis', 'beneficiary');
const path = arg('path', 'fasttrack');
const paymentId = arg('payment', '');
if (!Number.isInteger(days) || days < 1 || days > 3650) die('--days must be an integer from 1 to 3650');
if (!['beneficiary', 'supporter'].includes(accessBasis)) die('--basis must be beneficiary or supporter');
if (!['fasttrack', 'roadmap'].includes(path)) die('--path must be fasttrack or roadmap');
if (accessBasis === 'supporter' && !paymentId) die('supporter grants require --payment <verified Zeffy payment id>');

const appRef = db.collection('applications').doc(applicationId);
const operationId = `breakglass-grant:${applicationId}`;
const reservation = await db.runTransaction(async (tx) => {
  const app = await tx.get(appRef);
  if (!app.exists) throw new Error(`application ${applicationId} not found`);
  if (app.get('status') === STATE.GRANTED && app.get('grantedUid')) return { data: app.data(), granted: true };
  if (app.get('status') === 'PROVISIONING') {
    const provisioning = app.get('provisioning') || {};
    if (
      provisioning.operationId !== operationId
      || provisioning.accessBasis !== accessBasis
      || provisioning.path !== path
      || provisioning.days !== days
      || provisioning.paymentId !== (paymentId || null)
    ) throw new Error('different provisioning operation is active');
    return { data: app.data(), granted: false };
  }
  if (![STATE.SUBMITTED, STATE.INTERVIEW_SCHEDULED].includes(app.get('status'))) throw new Error(`cannot grant from ${app.get('status')}`);
  if (app.get('accessChoice') !== accessBasis) throw new Error('basis does not match the application');
  if (accessBasis === 'supporter') {
    const donation = await tx.get(db.collection('donations').doc(paymentId));
    if (!donation.exists || donation.get('verificationState') !== 'VERIFIED' || donation.get('applicationId') !== applicationId) {
      throw new Error('payment is not verified for this application');
    }
  }
  const provisioning = { operationId, fromStatus: app.get('status'), accessBasis, path, days, paymentId: paymentId || null, actorId, reservedAt: Date.now() };
  tx.update(appRef, {
    status: 'PROVISIONING',
    provisioning,
  });
  return { data: { ...app.data(), status: 'PROVISIONING', provisioning }, granted: false };
});

if (reservation.granted) {
  console.log(`ok: application already granted to uid=${reservation.data.grantedUid}`);
  process.exit(0);
}

let user;
try {
  user = await auth.getUserByEmail(reservation.data.email);
} catch (error) {
  if (error.code !== 'auth/user-not-found') throw error;
  user = await auth.createUser({ email: reservation.data.email, displayName: reservation.data.name || '' });
}
await assertNotStaff(user.uid);
const existingMember = await db.collection('members').doc(user.uid).get();
if (existingMember.exists && existingMember.get('applicationId') !== applicationId) die('account is linked to another application');

const provisioning = reservation.data.provisioning;
const accessEnds = provisioning.reservedAt + provisioning.days * DAY_MS;
const memberRef = db.collection('members').doc(user.uid);
await memberRef.set({
  status: 'PROVISIONING', accessBasis: provisioning.accessBasis, accessEnds, email: reservation.data.email,
  name: reservation.data.name || '', path: provisioning.path, applicationId, provisioningOperationId: operationId,
  createdAt: FieldValue.serverTimestamp(),
}, { merge: true });
await appRef.update({ grantedUid: user.uid });
await auth.setCustomUserClaims(user.uid, { role: 'student', accessBasis: provisioning.accessBasis, accessEnds });
await recordRevocation(user.uid);

await db.runTransaction(async (tx) => {
  const [app, member] = await Promise.all([tx.get(appRef), tx.get(memberRef)]);
  if (app.get('status') !== 'PROVISIONING' || app.get('provisioning.operationId') !== operationId || app.get('grantedUid') !== user.uid) {
    throw new Error('provisioning reservation changed');
  }
  if (member.get('provisioningOperationId') !== operationId) throw new Error('member provisioning record missing');
  tx.update(appRef, { status: STATE.GRANTED, provisioning: FieldValue.delete(), grantedAt: FieldValue.serverTimestamp() });
  tx.update(memberRef, { status: STATE.ACTIVE, provisioningOperationId: FieldValue.delete() });
  if (provisioning.paymentId) tx.set(db.collection('donations').doc(provisioning.paymentId), { grantedUid: user.uid, grantedAt: FieldValue.serverTimestamp() }, { merge: true });
  tx.create(db.collection('auditLog').doc(), {
    type: 'access.granted', targetType: 'member', targetId: user.uid, actorId: provisioning.actorId,
    fromStatus: 'PROVISIONING', toStatus: STATE.ACTIVE, operationId,
    ts: FieldValue.serverTimestamp(),
  });
});

console.log(`ok: granted ${reservation.data.email} (uid=${user.uid}); window ${days}d`);
process.exit(0);
