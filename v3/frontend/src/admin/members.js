// Admin member list (read-only in the web app on Spark). extend/revoke run via the local
// admin-cli (extend.mjs / revoke.mjs) — no privileged hosted endpoint on Spark.
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';

export async function listMembers() {
  const snap = await getDocs(collection(db, 'members')); // Rules: isAdmin
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// Extend: node v3/backend/admin-cli/extend.mjs <uid> --days N
// Revoke: node v3/backend/admin-cli/revoke.mjs <uid>
