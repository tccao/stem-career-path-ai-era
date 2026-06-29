// Grant access (beneficiary approve OR supporter confirm). The ONLY account-minting path.
//   node grant.mjs <applicationId> [--days 365] [--basis beneficiary|supporter]
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth, STATE, DAY_MS, arg, audit, die } from './lib/admin.mjs';

const applicationId = process.argv[2];
if (!applicationId) die('usage: node grant.mjs <applicationId> [--days N] [--basis beneficiary|supporter]');
const days = Number(arg('days', '365'));
const accessBasis = arg('basis', 'beneficiary');
const path = arg('path', 'fasttrack'); // 'fasttrack' | 'roadmap'

const appRef = db.collection('applications').doc(applicationId);
const appSnap = await appRef.get();
if (!appSnap.exists) die(`application ${applicationId} not found`);
const a = appSnap.data();
if (![STATE.SUBMITTED, STATE.INTERVIEW_SCHEDULED].includes(a.status)) {
  die(`application is ${a.status}, expected SUBMITTED or INTERVIEW_SCHEDULED (idempotency)`);
}
if (accessBasis === 'beneficiary' && a.accessChoice !== 'beneficiary') die('beneficiary grant requires beneficiary application');
if (accessBasis === 'supporter' && a.accessChoice !== 'supporter') die('supporter grant requires supporter application');

const accessEnds = Date.now() + days * DAY_MS;

// Sole caller of createUser. Passwordless: user signs in later via email-link.
const existing = await auth.getUserByEmail(a.email).catch(() => null);
if (existing?.customClaims?.role === 'admin' || existing?.customClaims?.role === 'owner') die('refusing to overwrite a staff account');
const user = existing || await auth.createUser({ email: a.email });
// Persisted claims → flow into every ID token (role/window drive the Firestore Rules).
await auth.setCustomUserClaims(user.uid, { role: 'student', accessBasis, accessEnds });

const batch = db.batch();
batch.update(appRef, { status: STATE.GRANTED, grantedUid: user.uid, grantedAt: FieldValue.serverTimestamp() });
batch.set(db.collection('members').doc(user.uid), {
  status: STATE.ACTIVE, accessBasis, accessEnds, email: a.email, name: a.name ?? '',
  path, applicationId, createdAt: FieldValue.serverTimestamp(),
});
batch.set(db.collection('accountAccess').doc(user.uid), {
  uid: user.uid, email: a.email, role: 'student', enabled: true, status: STATE.ACTIVE,
  accessBasis, accessEnds, path, applicationId,
}, { merge: true });
await batch.commit();
await audit({ type: 'access.granted', targetType: 'member', targetId: user.uid, toStatus: STATE.ACTIVE });

console.log(`ok: granted ${a.email} (uid=${user.uid}); window ${days}d. Tell them to sign in via email-link.`);
process.exit(0);
