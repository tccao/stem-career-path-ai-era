// StageLocks repository — explicit admin overrides for server-side content gating.
// PK memberId, SK stageKey (Arch §5.1). State values used by the demo:
//   unlocked = allow this incomplete stage even if prior stages are incomplete
//   locked   = block this incomplete stage even if it would otherwise be active

import { DeleteCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../db/client.mjs';
import { TABLE } from '../db/tables.mjs';

export async function listLocks(memberId) {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TABLE.STAGE_LOCKS,
      KeyConditionExpression: 'memberId = :m',
      ExpressionAttributeValues: { ':m': memberId },
    }),
  );
  return Items || [];
}

export async function putLock(item) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE.STAGE_LOCKS,
      Item: item,
    }),
  );
  return item;
}

export async function deleteLock(memberId, stageKey) {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE.STAGE_LOCKS,
      Key: { memberId, stageKey },
    }),
  );
}
