// Admin review queue (read-only in the web app on Spark). Listing is an admin-gated
// Firestore read. The state-machine MUTATIONS (approve/grant, reject) are performed by the
// local admin-cli (grant.mjs / a reject step), not from the browser — there is no privileged
// hosted endpoint on Spark. See v3/backend/admin-cli + Spark-Backend.md §4.
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';

export async function listApplications(status = 'SUBMITTED') {
  const q = query(
    collection(db, 'applications'),
    where('status', '==', status),
    orderBy('createdAt', 'desc'),
    limit(100),
  );
  const snap = await getDocs(q); // Rules: isAdmin
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// To grant:  node v3/backend/admin-cli/grant.mjs <applicationId> [--days N] [--basis ...]
// To reject: mark the application REJECTED via an admin-cli step (or extend grant.mjs).
