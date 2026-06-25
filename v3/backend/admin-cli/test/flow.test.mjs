// Emulator E2E for the Spark/Functions-free grant flow (Spark-Backend.md §5).
// Run via:  firebase emulators:exec --only firestore,auth 'cd admin-cli && node test/flow.test.mjs'
// Seeds an application, runs the real grant.mjs, and asserts: application→GRANTED,
// member→ACTIVE, and the persisted custom claims (role=student, accessEnds in the future).
import { spawnSync } from 'node:child_process';
import { FieldValue } from 'firebase-admin/firestore';
import { ulid } from 'ulid';
import { db, auth } from '../lib/admin.mjs';

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

// Idempotency: granting again must refuse (status no longer SUBMITTED).
const r2 = spawnSync(process.execPath, ['grant.mjs', id], { cwd: new URL('..', import.meta.url), env: process.env, encoding: 'utf8' });
assert(r2.status !== 0, 'second grant refused (idempotent)');

console.log('ALL_PASS');
process.exit(0);
