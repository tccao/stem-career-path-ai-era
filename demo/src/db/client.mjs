// Single DynamoDB client for the whole app. Everything goes through the Document client
// so handlers work with plain JS objects (no AttributeValue wrappers).

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { config } from '../config.mjs';

const base = new DynamoDBClient({
  region: config.region,
  ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  ...(config.credentials ? { credentials: config.credentials } : {}),
});

export const ddb = DynamoDBDocumentClient.from(base, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
});

// Raw client exposed for control-plane ops (CreateTable, etc.).
export const ddbRaw = base;

export default ddb;
