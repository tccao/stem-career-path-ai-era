// Append-only, PII-FREE audit (ids + status codes only) — V3-Plan §9.
// Rules deny client writes; this runs via the admin SDK only.
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './_db.js';

export async function audit(event) {
  // event: { type, targetType, targetId, fromStatus?, toStatus?, actorId? }
  await db.collection('auditLog').add({ ...event, ts: FieldValue.serverTimestamp() });
}
