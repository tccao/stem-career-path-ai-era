// Bootstrap an admin: create/link the user and set the role:admin claim.
//   node make-admin.mjs <email>
import { auth, db, STATE, audit, die } from './lib/admin.mjs';

const email = process.argv[2];
if (!email) die('usage: node make-admin.mjs <email>');

const user = await auth.getUserByEmail(email).catch(() => auth.createUser({ email }));
await auth.setCustomUserClaims(user.uid, { role: 'admin' });
await db.collection('accountAccess').doc(user.uid).set({ uid: user.uid, email, role: 'admin', enabled: true, status: STATE.ACTIVE }, { merge: true });
await audit({ type: 'admin.bootstrapped', targetType: 'admin', targetId: user.uid });
console.log(`ok: ${email} is admin (uid=${user.uid}). Sign in via email-link on admin.html.`);
process.exit(0);
