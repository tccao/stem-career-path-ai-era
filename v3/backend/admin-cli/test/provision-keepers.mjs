// Provision persistent keeper accounts for live email-link login (real project).
//   node test/provision-keepers.mjs <adminEmail> <studentEmail>
import { spawnSync } from 'node:child_process';
import { FieldValue } from 'firebase-admin/firestore';
import { ulid } from 'ulid';
import { db } from '../lib/admin.mjs';

const adminEmail = process.argv[2];
const studentEmail = process.argv[3];
if (!adminEmail || !studentEmail) { console.error('usage: provision-keepers.mjs <adminEmail> <studentEmail>'); process.exit(1); }
const run = (args) => spawnSync(process.execPath, args, { cwd: new URL('..', import.meta.url), env: process.env, encoding: 'utf8' });

let r = run(['make-admin.mjs', adminEmail]);
process.stdout.write(r.stdout || ''); if (r.status !== 0) { process.stderr.write(r.stderr || ''); process.exit(1); }

const appId = ulid();
await db.collection('applications').doc(appId).set({
  status: 'SUBMITTED', accessChoice: 'beneficiary', email: studentEmail, name: 'Demo Student',
  ageBracket: '18plus', guardianConsent: false, createdAt: FieldValue.serverTimestamp(),
});
r = run(['grant.mjs', appId, '--days', '365']);
process.stdout.write(r.stdout || ''); if (r.status !== 0) { process.stderr.write(r.stderr || ''); process.exit(1); }

console.log(`KEEPERS_OK admin=${adminEmail} student=${studentEmail}`);
process.exit(0);
