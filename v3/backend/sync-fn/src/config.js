export const REGION = 'us-central1';
export const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';

const configuredOrigins = (process.env.APP_ORIGINS
  || 'https://feat-v3-mvp.d3eyz6x5b4wbjx.amplifyapp.com')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export const callableOptions = (overrides = {}) => ({
  region: REGION,
  cors: IS_EMULATOR ? true : configuredOrigins,
  enforceAppCheck: !IS_EMULATOR,
  maxInstances: 10,
  memory: '256MiB',
  timeoutSeconds: 30,
  ...overrides,
});

export const DAY_MS = 86_400_000;
export const APPLICATION_RETENTION_MS = 365 * DAY_MS;
export const REJECTED_RETENTION_MS = 90 * DAY_MS;
export const ENDED_MEMBER_RETENTION_MS = 365 * DAY_MS;
export const RATE_LIMIT_RETENTION_MS = 2 * DAY_MS;
export const REVOCATION_RETENTION_MS = 30 * DAY_MS;
export const DEFAULT_ACCESS_DAYS = 365;
export const MAX_ACCESS_DAYS = 3_650;
export const MAX_SYNC_PAGES = 10;
