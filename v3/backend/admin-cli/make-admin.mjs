// Bootstrap an admin: create/link the user and set the role:admin claim.
//   node make-admin.mjs <email>
import { auth, audit, die, onEmulator, recordRevocation, requireBreakGlass } from './lib/admin.mjs';

const actorId = requireBreakGlass();

const email = process.argv[2];
if (!email) die('usage: node make-admin.mjs <email>');

const user = await auth.getUserByEmail(email).catch(() => auth.createUser({ email }));
if (user.customClaims?.role === 'owner') die('refusing to demote an owner through make-admin');
const mfaEnrolled = onEmulator || (user.multiFactor?.enrolledFactors?.length || 0) > 0;
await auth.setCustomUserClaims(user.uid, { role: 'admin', mfaEnrolled, ...(onEmulator ? { testMfa: true } : {}) });
await recordRevocation(user.uid);
await audit({ type: 'admin.bootstrapped', targetType: 'admin', targetId: user.uid, actorId });
console.log(`ok: ${email} is admin (uid=${user.uid}). Sign in via email-link on admin.html.`);
process.exit(0);
