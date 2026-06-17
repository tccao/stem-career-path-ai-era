// Progress repository — proof-of-work per stage. PK memberId, SK stageKey (Arch §5.1).
// state: locked | active | submitted | complete.

import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../db/client.mjs';
import { TABLE } from '../db/tables.mjs';

export async function listProgress(memberId) {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TABLE.PROGRESS,
      KeyConditionExpression: 'memberId = :m',
      ExpressionAttributeValues: { ':m': memberId },
    }),
  );
  return Items || [];
}

export async function getStageProgress(memberId, stageKey) {
  const { Item } = await ddb.send(
    new GetCommand({ TableName: TABLE.PROGRESS, Key: { memberId, stageKey } }),
  );
  return Item || null;
}

export async function putProgress(item) {
  await ddb.send(new PutCommand({ TableName: TABLE.PROGRESS, Item: item }));
  return item;
}
