// Bootstrap the OWNER: the highest privilege tier. Local-only (Admin SDK on your machine,
// service-account key never leaves it) — this is the root of trust that hosted code can never
// forge, which is what makes "admins cannot escalate to owner" actually hold.
//   node make-owner.mjs <email>
// Owner > admin > student. Owner can manage admins, disable any account, and lock down the system.
import { auth, audit, die } from './lib/admin.mjs';

const email = process.argv[2];
if (!email) die('usage: node make-owner.mjs <email>');

const user = await auth.getUserByEmail(email).catch(() => auth.createUser({ email }));
await auth.setCustomUserClaims(user.uid, { role: 'owner' });
await auth.revokeRefreshTokens(user.uid); // force a fresh token so the owner claim takes effect now
await audit({ type: 'owner.bootstrapped', targetType: 'owner', targetId: user.uid });
console.log(`ok: ${email} is OWNER (uid=${user.uid}). Sign in via email-link on admin.html.`);
process.exit(0);
