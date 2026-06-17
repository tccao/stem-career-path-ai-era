// Curriculum content repository. In production this gated content lives in private S3
// behind CloudFront signed cookies (Arch §9.2); the demo stores it in a DynamoDB table
// keyed (pathKey, stageKey) so it aligns with Progress / StageLocks (see ADR-002).

import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../db/client.mjs';
import { TABLE } from '../db/tables.mjs';

export async function putCurriculumItem(item) {
  await ddb.send(new PutCommand({ TableName: TABLE.CURRICULUM, Item: item }));
  return item;
}

export async function getPath(pathKey) {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TABLE.CURRICULUM,
      KeyConditionExpression: 'pathKey = :p',
      ExpressionAttributeValues: { ':p': pathKey },
    }),
  );
  return Items || [];
}

export async function getStage(pathKey, stageKey) {
  const { Item } = await ddb.send(
    new GetCommand({ TableName: TABLE.CURRICULUM, Key: { pathKey, stageKey } }),
  );
  return Item || null;
}
