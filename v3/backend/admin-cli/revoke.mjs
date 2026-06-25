// Revoke access (intended lock-out): expire the claim, end the member, kill refresh tokens.
//   node revoke.mjs <uid>
import { auth, db, STATE, audit, die } from './lib/admin.mjs';

const uid = process.argv[2];
if (!uid) die('usage: node revoke.mjs <uid>');

await db.collection('members').doc(uid).update({ status: STATE.ENDED, endedReason: 'revoked' });
await auth.setCustomUserClaims(uid, { role: 'student', accessEnds: Date.now() }); // Rules deny on next refresh
await auth.revokeRefreshTokens(uid);                                              // block new tokens
await audit({ type: 'member.revoked', targetType: 'member', targetId: uid, toStatus: STATE.ENDED });
console.log(`ok: revoked ${uid}`);
process.exit(0);
