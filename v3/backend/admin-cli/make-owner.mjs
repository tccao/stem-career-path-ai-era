// Bootstrap the OWNER: the highest privilege tier. Local-only (Admin SDK on your machine,
// service-account key never leaves it) — this is the root of trust that hosted code can never
// forge, which is what makes "admins cannot escalate to owner" actually hold.
//   node make-owner.mjs <email>
// Owner > admin > student. Owner can manage admins, disable any account, and lock down the system.
import { auth, audit, die, onEmulator, recordRevocation } from './lib/admin.mjs';

const email = process.argv[2];
if (!email) die('usage: node make-owner.mjs <email>');
if (!onEmulator && process.env.CFG_OWNER_BOOTSTRAP !== 'I_UNDERSTAND_ROOT_ACCESS') {
  die('set CFG_OWNER_BOOTSTRAP=I_UNDERSTAND_ROOT_ACCESS for the local root bootstrap');
}

const user = await auth.getUserByEmail(email).catch(() => auth.createUser({ email }));
const mfaEnrolled = onEmulator || (user.multiFactor?.enrolledFactors?.length || 0) > 0;
await auth.setCustomUserClaims(user.uid, { role: 'owner', mfaEnrolled, ...(onEmulator ? { testMfa: true } : {}) });
await recordRevocation(user.uid);
await audit({ type: 'owner.bootstrapped', targetType: 'owner', targetId: user.uid, actorId: 'bootstrap:local' });
console.log(`ok: ${email} is OWNER (uid=${user.uid}). Sign in via email-link on admin.html.`);
process.exit(0);
