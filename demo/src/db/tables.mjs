// Table schemas — mirrors docs/Architecture-Design.md §5.1 (DynamoDB, on-demand).
//
// "Users and admins" live in the MEMBERS table (role = student | admin) — this is the
// account table the architecture defines; there is no separate Cognito in the demo, so a
// thin demo-only DEMO_AUTH table holds login credentials (stand-in for Cognito; see ADR-001).
//
// Every table is PAY_PER_REQUEST (on-demand). GSIs match the access patterns in §5.2.

import { config } from '../config.mjs';

const p = (name) => `${config.tablePrefix}${name}`;

// Logical -> physical (prefixed) names. Repositories import these.
export const TABLE = {
  MEMBERS: p('Members'),
  APPLICATIONS: p('Applications'),
  DEMO_AUTH: p('DemoAuth'),
  DONATIONS: p('Donations'),
  PROGRESS: p('Progress'),
  STAGE_LOCKS: p('StageLocks'),
  NOTES: p('Notes'),
  AUDIT_LOG: p('AuditLog'),
  CURRICULUM: p('Curriculum'),
};

const ON_DEMAND = { BillingMode: 'PAY_PER_REQUEST' };

// ---- Account tables first (users / admins) ----

// MEMBERS — one row per provisioned account (student or admin). §5.1.
const members = {
  TableName: TABLE.MEMBERS,
  ...ON_DEMAND,
  AttributeDefinitions: [
    { AttributeName: 'memberId', AttributeType: 'S' }, // = Cognito sub in prod
    { AttributeName: 'status', AttributeType: 'S' },
    { AttributeName: 'accessEndsAt', AttributeType: 'S' }, // ISO-8601, sorts chronologically
  ],
  KeySchema: [{ AttributeName: 'memberId', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      // Expiry sweep: query status = ACTIVE AND accessEndsAt <= now (a real query, not a scan).
      IndexName: 'byStatusAccessEnds',
      KeySchema: [
        { AttributeName: 'status', KeyType: 'HASH' },
        { AttributeName: 'accessEndsAt', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
};

// DEMO_AUTH — demo-only credential shim (NOT in production; Cognito holds credentials there).
// Keyed by email; stores a salted scrypt hash + the linked memberId/role.
const demoAuth = {
  TableName: TABLE.DEMO_AUTH,
  ...ON_DEMAND,
  AttributeDefinitions: [{ AttributeName: 'email', AttributeType: 'S' }],
  KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
};

// ---- Application + lifecycle tables ----

// APPLICATIONS — one row per access request. §5.1.
const applications = {
  TableName: TABLE.APPLICATIONS,
  ...ON_DEMAND,
  AttributeDefinitions: [
    { AttributeName: 'applicationId', AttributeType: 'S' }, // ULID
    { AttributeName: 'status', AttributeType: 'S' },
    { AttributeName: 'createdAt', AttributeType: 'S' },
    { AttributeName: 'email', AttributeType: 'S' },
  ],
  KeySchema: [{ AttributeName: 'applicationId', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'byStatus', // admin queue
      KeySchema: [
        { AttributeName: 'status', KeyType: 'HASH' },
        { AttributeName: 'createdAt', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'byEmail', // dedupe / re-application lookup
      KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
};

// DONATIONS — payment references only, never card data. §5.1.
const donations = {
  TableName: TABLE.DONATIONS,
  ...ON_DEMAND,
  AttributeDefinitions: [
    { AttributeName: 'donationId', AttributeType: 'S' }, // ULID
    { AttributeName: 'zeffyPaymentId', AttributeType: 'S' }, // idempotency key
  ],
  KeySchema: [{ AttributeName: 'donationId', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'byZeffyPaymentId',
      KeySchema: [{ AttributeName: 'zeffyPaymentId', KeyType: 'HASH' }],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
};

// PROGRESS — proof-of-work submissions. PK memberId, SK stageKey. §5.1.
const progress = {
  TableName: TABLE.PROGRESS,
  ...ON_DEMAND,
  AttributeDefinitions: [
    { AttributeName: 'memberId', AttributeType: 'S' },
    { AttributeName: 'stageKey', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'memberId', KeyType: 'HASH' },
    { AttributeName: 'stageKey', KeyType: 'RANGE' },
  ],
};

// STAGE_LOCKS — explicit server-side gating + audited override flags. §5.1.
const stageLocks = {
  TableName: TABLE.STAGE_LOCKS,
  ...ON_DEMAND,
  AttributeDefinitions: [
    { AttributeName: 'memberId', AttributeType: 'S' },
    { AttributeName: 'stageKey', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'memberId', KeyType: 'HASH' },
    { AttributeName: 'stageKey', KeyType: 'RANGE' },
  ],
};

// NOTES — member-private notes. PK memberId. §5.1.
const notes = {
  TableName: TABLE.NOTES,
  ...ON_DEMAND,
  AttributeDefinitions: [{ AttributeName: 'memberId', AttributeType: 'S' }],
  KeySchema: [{ AttributeName: 'memberId', KeyType: 'HASH' }],
};

// AUDIT_LOG — append-only, PII-free business audit. PK targetType#targetId, SK ts#eventId. §7.2.
const auditLog = {
  TableName: TABLE.AUDIT_LOG,
  ...ON_DEMAND,
  AttributeDefinitions: [
    { AttributeName: 'pk', AttributeType: 'S' }, // targetType#targetId
    { AttributeName: 'sk', AttributeType: 'S' }, // ts#eventId
    { AttributeName: 'actorId', AttributeType: 'S' },
    { AttributeName: 'action', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'pk', KeyType: 'HASH' },
    { AttributeName: 'sk', KeyType: 'RANGE' },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'byActor',
      KeySchema: [
        { AttributeName: 'actorId', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'byAction',
      KeySchema: [
        { AttributeName: 'action', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
};

// CURRICULUM — demo content store (prod serves gated curriculum from S3+CloudFront; see ADR-002).
// PK pathKey (A_full_roadmap | B_fast_track), SK stageKey (aligns with Progress/StageLocks).
const curriculum = {
  TableName: TABLE.CURRICULUM,
  ...ON_DEMAND,
  AttributeDefinitions: [
    { AttributeName: 'pathKey', AttributeType: 'S' },
    { AttributeName: 'stageKey', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'pathKey', KeyType: 'HASH' },
    { AttributeName: 'stageKey', KeyType: 'RANGE' },
  ],
};

// Ordered so the account tables (users/admins) are created first.
export const TABLE_DEFINITIONS = [
  members,
  demoAuth,
  applications,
  donations,
  progress,
  stageLocks,
  notes,
  auditLog,
  curriculum,
];

// TTL config applied after creation (best-effort; DynamoDB Local accepts the setting).
export const TTL_CONFIG = [
  { TableName: TABLE.APPLICATIONS, AttributeName: 'expiresAt' },
];

export default TABLE_DEFINITIONS;
