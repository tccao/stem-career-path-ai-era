// AuditLog repository — append-only, PII-free (IDs + status codes only; never names,
// emails, or free text). Mirrors docs §7.2/§7.3: no Update/Delete is ever exposed here.

import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { ddb } from '../db/client.mjs';
import { TABLE } from '../db/tables.mjs';

export async function append({
  actorId,
  actorRole,
  action,
  targetType,
  targetId,
  before,
  after,
  reasonCode,
  requestId,
}) {
  const ts = new Date().toISOString();
  const eventId = ulid();
  const item = {
    pk: `${targetType}#${targetId}`,
    sk: `${ts}#${eventId}`,
    eventId,
    ts,
    actorId,
    actorRole,
    action,
    targetType,
    targetId,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(reasonCode ? { reasonCode } : {}),
    ...(requestId ? { requestId } : {}),
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE.AUDIT_LOG,
      Item: item,
      ConditionExpression: 'attribute_not_exists(sk)',
    }),
  );
  return item;
}

export async function listForTarget(targetType, targetId) {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TABLE.AUDIT_LOG,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': `${targetType}#${targetId}` },
      ScanIndexForward: false,
    }),
  );
  return Items || [];
}
