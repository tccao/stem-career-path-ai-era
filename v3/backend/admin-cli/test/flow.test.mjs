// Emulator E2E for the break-glass admin CLI grant and access-restoration flow.
// Run via:  firebase emulators:exec --only firestore,auth 'cd admin-cli && node test/flow.test.mjs'
// Seeds an application, runs the real grant.mjs/extend.mjs, and verifies Firestore/Auth agreement.
import { spawnSync } from 'node:child_process';
import { FieldValue } from 'firebase-admin/firestore';
import { ulid } from 'ulid';
import { db, auth, DAY_MS } from '../lib/admin.mjs';

function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); process.exit(1); } else console.log(`ok: ${msg}`); }

const email = `stu-${Date.now()}@example.com`;
const id = ulid();
await db.collection('applications').doc(id).set({
  status: 'SUBMITTED', accessChoice: 'beneficiary', email, name: 'Test Student',
  ageBracket: '18plus', guardianConsent: false, createdAt: FieldValue.serverTimestamp(),
});
console.log(`seeded application ${id} (${email})`);

// Run the real CLI as a subprocess (inherits the emulator env vars).
const r = spawnSync(process.execPath, ['grant.mjs', id, '--days', '30'],
  { cwd: new URL('..', import.meta.url), env: process.env, encoding: 'utf8' });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
assert(r.status === 0, 'grant.mjs exited 0');

const appDoc = await db.collection('applications').doc(id).get();
assert(appDoc.get('status') === 'GRANTED', 'application → GRANTED');
const uid = appDoc.get('grantedUid');
assert(!!uid, 'application has grantedUid');

const member = await db.collection('members').doc(uid).get();
assert(member.exists, 'member doc created');
assert(member.get('status') === 'ACTIVE', 'member → ACTIVE');

const claims = (await auth.getUser(uid)).customClaims || {};
assert(claims.role === 'student', 'claim role=student');
assert(typeof claims.accessEnds === 'number' && claims.accessEnds > Date.now(), 'claim accessEnds in future');

// Idempotency: granting again returns success without minting another account.
const r2 = spawnSync(process.execPath, ['grant.mjs', id], { cwd: new URL('..', import.meta.url), env: process.env, encoding: 'utf8' });
assert(r2.status === 0, 'second grant resumes idempotently');
const users = await auth.listUsers();
assert(users.users.filter((user) => user.email === email).length === 1, 'idempotent retry did not duplicate the account');

// An enabled account whose window has ended can be restored with the same privileged extend path
// used for active members. Lifecycle-only fields must not survive on the restored ACTIVE record.
const expiredAt = Date.now() - DAY_MS;
await member.ref.update({
  status: 'ENDED', accessEnds: expiredAt, endedReason: 'expired', endedAt: FieldValue.serverTimestamp(),
  expiresAt: new Date(Date.now() + DAY_MS),
});
await auth.setCustomUserClaims(uid, { role: 'student', accessBasis: 'beneficiary', accessEnds: expiredAt });
const extended = spawnSync(process.execPath, ['extend.mjs', uid, '--days', '30'],
  { cwd: new URL('..', import.meta.url), env: process.env, encoding: 'utf8' });
process.stdout.write(extended.stdout || ''); process.stderr.write(extended.stderr || '');
assert(extended.status === 0, 'extend.mjs restores ended access');
const restored = await member.ref.get();
assert(restored.get('status') === 'ACTIVE', 'restored member → ACTIVE');
assert(restored.get('accessEnds') > Date.now(), 'restored member accessEnds in future');
assert(restored.get('endedReason') === undefined && restored.get('endedAt') === undefined && restored.get('expiresAt') === undefined,
  'restored member lifecycle fields cleared');
const restoredClaims = (await auth.getUser(uid)).customClaims || {};
assert(restoredClaims.accessEnds === restored.get('accessEnds'), 'restored claim and member accessEnds agree');

console.log('ALL_PASS');
process.exit(0);
