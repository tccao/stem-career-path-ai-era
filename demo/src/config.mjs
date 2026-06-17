// Central config. The app is endpoint-driven: the SAME code targets MiniStack, the
// DynamoDB Local jar, or real AWS by changing AWS_ENDPOINT_URL only (see ADR-002).
//
// Loads .env if present (Node >= 20.12 has process.loadEnvFile, no dotenv dependency).

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // No .env file — fall back to real environment variables / defaults. Fine.
}

const endpoint = process.env.AWS_ENDPOINT_URL || undefined; // undefined => real AWS

export const config = {
  region: process.env.AWS_REGION || 'us-west-2',

  // When an endpoint is set we are on a local emulator: pass dummy static creds.
  // When unset (real AWS), leave credentials undefined so the default provider chain runs.
  endpoint,
  credentials: endpoint
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      }
    : undefined,

  port: Number(process.env.PORT) || 3000,

  // URL path versioning: all routes mount under /api/${apiVersion}.
  apiVersion: process.env.API_VERSION || 'v1',

  // Table name prefix so multiple demos can share one endpoint without collision.
  tablePrefix: process.env.TABLE_PREFIX || 'cfg_',

  // Demo-only auth shim secret (stands in for Cognito-issued JWTs — see ADR-001).
  authSecret: process.env.DEMO_AUTH_SECRET || 'dev-only-change-me',

  isLocal: Boolean(endpoint),
};

export default config;
