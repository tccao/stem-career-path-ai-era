// LIVE (real project): grant the given application via the real admin-cli, then mint a
// student custom token + seed an "other" member to test the deployed Rules' deny path.
// Writes /tmp/e2e.json for the client-side reader. Needs GOOGLE_APPLICATION_CREDENTIALS.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { FieldValue } from 'firebase-admin/firestore';
import { db, auth, DAY_MS } from '../lib/admin.mjs';

const appId = process.argv[2];
if (!appId) { console.error('usage: grant-mint.mjs <applicationId>'); process.exit(1); }

const r = spawnSync(process.execPath, ['grant.mjs', appId],
  { cwd: new URL('..', import.meta.url), env: process.env, encoding: 'utf8' });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
if (r.status !== 0) { console.error('grant failed'); process.exit(1); }

const studentUid = (await db.collection('applications').doc(appId).get()).get('grantedUid');
const otherUid = `e2e-other-${Date.now()}`;
await db.collection('members').doc(otherUid).set({
  status: 'ACTIVE', accessBasis: 'beneficiary', accessEnds: Date.now() + DAY_MS,
  email: 'other@example.com', name: 'Other Member', path: 'fasttrack', createdAt: FieldValue.serverTimestamp(),
});
const token = await auth.createCustomToken(studentUid); // carries persisted student claims
writeFileSync('/tmp/e2e.json', JSON.stringify({ studentUid, otherUid, token }));
console.log(`MINT_OK studentUid=${studentUid} otherUid=${otherUid}`);
process.exit(0);
