// Remove the throwaway live-test artifacts (keeps production tidy). Needs the key.
import { readFileSync } from 'node:fs';
import { db, auth } from '../lib/admin.mjs';

const appId = process.argv[2];
const { studentUid, otherUid } = JSON.parse(readFileSync('/tmp/e2e.json', 'utf8'));
await db.collection('members').doc(studentUid).delete().catch(() => {});
await db.collection('members').doc(otherUid).delete().catch(() => {});
if (appId) await db.collection('applications').doc(appId).delete().catch(() => {});
await auth.deleteUser(studentUid).catch(() => {});
console.log('CLEANUP_OK');
process.exit(0);
