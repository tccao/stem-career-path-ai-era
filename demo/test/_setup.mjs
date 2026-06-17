// Shared test setup. Integration tests run against a real local DynamoDB engine
// (DynamoDB Local jar or MiniStack) — never real AWS. Point AWS_ENDPOINT_URL at it first.

import { config } from '../src/config.mjs';
import { createTables } from '../scripts/create-tables.mjs';

if (!config.endpoint) {
  throw new Error(
    'Tests require a local endpoint. Set AWS_ENDPOINT_URL (MiniStack http://localhost:4566 ' +
      'or DynamoDB Local http://localhost:8000) before running `npm test`.',
  );
}

// Guard: never let a test run touch a non-local endpoint.
if (!/localhost|127\.0\.0\.1/.test(config.endpoint)) {
  throw new Error(`Refusing to run tests against non-local endpoint: ${config.endpoint}`);
}

export async function freshTables() {
  await createTables({ reset: true });
}
