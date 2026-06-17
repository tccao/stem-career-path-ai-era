// Create all demo tables idempotently. `--reset` drops them first (clean slate for tests/seed).
//
//   node scripts/create-tables.mjs            # create missing tables
//   node scripts/create-tables.mjs --reset    # drop + recreate all

import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  ListTablesCommand,
  UpdateTimeToLiveCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';
import { ddbRaw } from '../src/db/client.mjs';
import { TABLE_DEFINITIONS, TTL_CONFIG } from '../src/db/tables.mjs';
import { config } from '../src/config.mjs';

const reset = process.argv.includes('--reset');

async function exists(name) {
  try {
    await ddbRaw.send(new DescribeTableCommand({ TableName: name }));
    return true;
  } catch (e) {
    if (e instanceof ResourceNotFoundException) return false;
    throw e;
  }
}

async function waitGone(name, tries = 30) {
  for (let i = 0; i < tries; i++) {
    if (!(await exists(name))) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${name} to delete`);
}

async function waitActive(name, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const { Table } = await ddbRaw.send(new DescribeTableCommand({ TableName: name }));
      if (Table?.TableStatus === 'ACTIVE') return;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${name} to become ACTIVE`);
}

export async function createTables({ reset: doReset = false, log = () => {} } = {}) {
  for (const def of TABLE_DEFINITIONS) {
    const name = def.TableName;

    if (doReset && (await exists(name))) {
      await ddbRaw.send(new DeleteTableCommand({ TableName: name }));
      await waitGone(name);
      log(`  dropped ${name}`);
    }

    if (await exists(name)) {
      log(`  exists  ${name}`);
      continue;
    }

    await ddbRaw.send(new CreateTableCommand(def));
    await waitActive(name);
    log(`  created ${name}`);
  }

  // Best-effort TTL config (PII auto-purge in prod; harmless locally).
  for (const ttl of TTL_CONFIG) {
    try {
      await ddbRaw.send(
        new UpdateTimeToLiveCommand({
          TableName: ttl.TableName,
          TimeToLiveSpecification: { Enabled: true, AttributeName: ttl.AttributeName },
        }),
      );
    } catch {
      /* TTL already set or unsupported locally — non-fatal */
    }
  }

  const { TableNames } = await ddbRaw.send(new ListTablesCommand({}));
  return TableNames || [];
}

// Run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = config.endpoint || 'real AWS';
  console.log(`Creating tables on ${target}${reset ? ' (reset)' : ''}...`);
  const names = await createTables({ reset, log: (m) => console.log(m) });
  console.log(`Done. ${names.length} tables present:`);
  for (const n of names.sort()) console.log(`  - ${n}`);
}
