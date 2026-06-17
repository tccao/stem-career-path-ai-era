// Phase 1 — table schema validation + conditional-write idempotency.
// Integration tests against the real DynamoDB Local engine.

import { test, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, ddbRaw } from '../src/db/client.mjs';
import { TABLE } from '../src/db/tables.mjs';
import { freshTables } from './_setup.mjs';

const tableOf = async (name) =>
  (await ddbRaw.send(new DescribeTableCommand({ TableName: name }))).Table;
const gsiNames = (t) => (t.GlobalSecondaryIndexes || []).map((i) => i.IndexName).sort();
const keyOf = (schema) => schema.map((k) => `${k.AttributeName}:${k.KeyType}`);

before(async () => {
  await freshTables();
});

describe('Phase 1 · table schema', () => {
  test('all 9 tables exist and are ACTIVE', async () => {
    for (const name of Object.values(TABLE)) {
      const t = await tableOf(name);
      assert.equal(t.TableStatus, 'ACTIVE', `${name} should be ACTIVE`);
    }
  });

  test('Members (users/admins): PK memberId + byStatusAccessEnds GSI', async () => {
    const t = await tableOf(TABLE.MEMBERS);
    assert.deepEqual(keyOf(t.KeySchema), ['memberId:HASH']);
    assert.ok(gsiNames(t).includes('byStatusAccessEnds'), 'expiry-sweep GSI present');
  });

  test('Applications: PK applicationId + byStatus + byEmail GSIs', async () => {
    const t = await tableOf(TABLE.APPLICATIONS);
    assert.deepEqual(keyOf(t.KeySchema), ['applicationId:HASH']);
    assert.deepEqual(gsiNames(t), ['byEmail', 'byStatus']);
  });

  test('Donations: PK donationId + byZeffyPaymentId GSI', async () => {
    const t = await tableOf(TABLE.DONATIONS);
    assert.deepEqual(keyOf(t.KeySchema), ['donationId:HASH']);
    assert.ok(gsiNames(t).includes('byZeffyPaymentId'));
  });

  test('Progress + StageLocks: composite (memberId, stageKey)', async () => {
    for (const name of [TABLE.PROGRESS, TABLE.STAGE_LOCKS]) {
      const t = await tableOf(name);
      assert.deepEqual(keyOf(t.KeySchema), ['memberId:HASH', 'stageKey:RANGE']);
    }
  });

  test('AuditLog: composite (pk, sk) + byActor + byAction GSIs', async () => {
    const t = await tableOf(TABLE.AUDIT_LOG);
    assert.deepEqual(keyOf(t.KeySchema), ['pk:HASH', 'sk:RANGE']);
    assert.deepEqual(gsiNames(t), ['byAction', 'byActor']);
  });

  test('round-trip put/get on Members', async () => {
    const item = {
      memberId: 'm-roundtrip',
      email: 'rt@cfg.org',
      role: 'student',
      status: 'ACTIVE',
      accessEndsAt: '2027-01-01T00:00:00.000Z',
    };
    await ddb.send(new PutCommand({ TableName: TABLE.MEMBERS, Item: item }));
    const { Item } = await ddb.send(
      new GetCommand({ TableName: TABLE.MEMBERS, Key: { memberId: 'm-roundtrip' } }),
    );
    assert.deepEqual(Item, item);
  });

  test('idempotency: attribute_not_exists blocks a double-create', async () => {
    const item = {
      memberId: 'm-dup',
      email: 'dup@cfg.org',
      role: 'student',
      status: 'ACTIVE',
      accessEndsAt: '2027-01-01T00:00:00.000Z',
    };
    const put = () =>
      ddb.send(
        new PutCommand({
          TableName: TABLE.MEMBERS,
          Item: item,
          ConditionExpression: 'attribute_not_exists(memberId)',
        }),
      );
    await put(); // first create succeeds
    await assert.rejects(put(), (e) => e.name === 'ConditionalCheckFailedException');
  });
});
