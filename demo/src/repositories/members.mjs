// Members repository (the users/admins account table). Provisioning is a conditional
// create (no double-provision). Expiry uses the byStatusAccessEnds GSI — a real query.

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddb } from '../db/client.mjs';
import { TABLE } from '../db/tables.mjs';

export async function createMember(item) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE.MEMBERS,
      Item: item,
      ConditionExpression: 'attribute_not_exists(memberId)',
    }),
  );
  return item;
}

export async function getMember(memberId) {
  const { Item } = await ddb.send(
    new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId } }),
  );
  return Item || null;
}

// Demo-scale listing. Prod would page or use a status GSI; the pilot has tens of members.
export async function listMembers() {
  const { Items } = await ddb.send(new ScanCommand({ TableName: TABLE.MEMBERS }));
  return Items || [];
}

// Expiry sweep: status = ACTIVE AND accessEndsAt <= now (key-condition query, not a scan).
export async function queryExpiring(nowIso) {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TABLE.MEMBERS,
      IndexName: 'byStatusAccessEnds',
      KeyConditionExpression: '#s = :active AND accessEndsAt <= :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':active': 'ACTIVE', ':now': nowIso },
    }),
  );
  return Items || [];
}

export async function transitionMemberStatus(memberId, { from, to, patch = {} }) {
  const names = { '#s': 'status' };
  const values = { ':from': from, ':to': to, ':now': new Date().toISOString() };
  const sets = ['#s = :to', 'updatedAt = :now'];
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
      TableName: TABLE.MEMBERS,
      Key: { memberId },
      UpdateExpression: 'SET ' + sets.join(', '),
      ConditionExpression: '#s = :from',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }),
  );
  return Attributes;
}

// Extend an active member's window (admin action). Conditional on still being ACTIVE.
export async function extendAccess(memberId, newEndsAtIso) {
  const { Attributes } = await ddb.send(
    new UpdateCommand({
      TableName: TABLE.MEMBERS,
      Key: { memberId },
      UpdateExpression: 'SET accessEndsAt = :e, updatedAt = :now',
      ConditionExpression: '#s = :active',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':e': newEndsAtIso,
        ':now': new Date().toISOString(),
        ':active': 'ACTIVE',
      },
      ReturnValues: 'ALL_NEW',
    }),
  );
  return Attributes;
}
