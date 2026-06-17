// Applications repository. All state-changing writes are conditional (idempotency +
// server-side state enforcement). GSIs: byStatus (admin queue), byEmail (dedupe).

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb } from '../db/client.mjs';
import { TABLE } from '../db/tables.mjs';

export async function createApplication(item) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE.APPLICATIONS,
      Item: item,
      ConditionExpression: 'attribute_not_exists(applicationId)',
    }),
  );
  return item;
}

export async function getApplication(applicationId) {
  const { Item } = await ddb.send(
    new GetCommand({ TableName: TABLE.APPLICATIONS, Key: { applicationId } }),
  );
  return Item || null;
}

export async function listByStatus(status) {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TABLE.APPLICATIONS,
      IndexName: 'byStatus',
      KeyConditionExpression: '#s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': status },
      ScanIndexForward: false, // newest first
    }),
  );
  return Items || [];
}

export async function findByEmail(email) {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TABLE.APPLICATIONS,
      IndexName: 'byEmail',
      KeyConditionExpression: 'email = :e',
      ExpressionAttributeValues: { ':e': email },
    }),
  );
  return Items || [];
}

// Conditional status transition: only succeeds if current status === `from`.
// Throws ConditionalCheckFailedException when the precondition fails (illegal/duplicate
// transition) — this is the server-side state-machine guard. `patch` sets extra attributes.
export async function transitionStatus(applicationId, { from, to, patch = {} }) {
  const names = { '#s': 'status' };
  const values = {
    ':from': from,
    ':to': to,
    ':now': new Date().toISOString(),
    ':one': 1,
    ':zero': 0,
  };
  const sets = [
    '#s = :to',
    'updatedAt = :now',
    'version = if_not_exists(version, :zero) + :one',
  ];
  let i = 0;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const nk = `#p${i}`;
    const vk = `:p${i}`;
    names[nk] = k;
    values[vk] = v;
    sets.push(`${nk} = ${vk}`);
    i++;
  }

  const { Attributes } = await ddb.send(
    new UpdateCommand({
      TableName: TABLE.APPLICATIONS,
      Key: { applicationId },
      UpdateExpression: 'SET ' + sets.join(', '),
      ConditionExpression: '#s = :from',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }),
  );
  return Attributes;
}
