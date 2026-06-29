import { db, FieldValue } from './context.js';

function clean(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
export function auditData(event) {
  return clean({
    type: event.type,
    targetType: event.targetType,
    targetId: event.targetId,
    actorId: event.actorId,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    reasonCode: event.reasonCode,
    operationId: event.operationId,
    ts: FieldValue.serverTimestamp(),
  });
}

export function queueAudit(tx, event) {
  const ref = db.collection('auditLog').doc();
  tx.create(ref, auditData(event));
  return ref.id;
}

export async function writeAudit(event) {
  const ref = db.collection('auditLog').doc();
  await ref.create(auditData(event));
  console.info(JSON.stringify({ severity: 'NOTICE', securityAudit: clean({ id: ref.id, ...event }) }));
  return ref.id;
}

export function logCommittedAudit(event) {
  console.info(JSON.stringify({ severity: 'NOTICE', securityAudit: clean(event) }));
}
