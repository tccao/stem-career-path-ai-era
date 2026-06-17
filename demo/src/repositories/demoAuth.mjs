// DEMO-ONLY credential store (stand-in for Cognito; see ADR-001). Production never stores
// passwords — Cognito holds the credential. Keyed by email; holds a scrypt hash + role + memberId.

import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../db/client.mjs';
import { TABLE } from '../db/tables.mjs';

export async function putCredential(item) {
  await ddb.send(new PutCommand({ TableName: TABLE.DEMO_AUTH, Item: item }));
  return item;
}

export async function getCredential(email) {
  const { Item } = await ddb.send(
    new GetCommand({ TableName: TABLE.DEMO_AUTH, Key: { email } }),
  );
  return Item || null;
}
