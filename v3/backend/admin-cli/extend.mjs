// Extend a member's access window. Updates the persisted claim WITHOUT revoking — the client
// picks up the new window on its next ID-token refresh (no re-auth needed).
//   node extend.mjs <uid> --days N
import { db, auth, STATE, DAY_MS, arg, audit, die } from './lib/admin.mjs';

const uid = process.argv[2];
const days = Number(arg('days', ''));
if (!uid || !days) die('usage: node extend.mjs <uid> --days N');

const ref = db.collection('members').doc(uid);
const snap = await ref.get();
if (!snap.exists) die(`member ${uid} not found`);
const base = Math.max(Date.now(), snap.get('accessEnds') ?? Date.now());
const accessEnds = base + days * DAY_MS;

await ref.update({ accessEnds, status: STATE.ACTIVE });
await auth.setCustomUserClaims(uid, { role: 'student', accessBasis: snap.get('accessBasis'), accessEnds });
await audit({ type: 'member.extended', targetType: 'member', targetId: uid });
console.log(`ok: ${uid} extended ${days}d → accessEnds=${new Date(accessEnds).toISOString()}`);
process.exit(0);
