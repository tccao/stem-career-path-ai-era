// Access lifecycle — the server-enforced state machine (docs Customer-Journey §4 / Arch §9).
// The client NEVER decides eligibility: every transition is a conditional write keyed on the
// expected current status, and every transition appends a PII-free audit event.
//
// In production the APPROVED_BENEFICIARY -> ACTIVE and DONATION_CONFIRMED -> ACTIVE grants
// run in system-fn (the sole holder of AdminCreateUser) off an SQS message. In this demo
// provisioning is invoked in-process; the SQS seam is documented, not built (see ADR-002).

import { ulid } from 'ulid';
import * as appsRepo from '../repositories/applications.mjs';
import * as membersRepo from '../repositories/members.mjs';
import * as audit from '../repositories/audit.mjs';
import { createDemoCredential } from './auth.mjs';

export const STATUS = Object.freeze({
  SUBMITTED: 'SUBMITTED',
  INTERVIEW_SCHEDULED: 'INTERVIEW_SCHEDULED',
  DONATION_REQUIRED: 'DONATION_REQUIRED',
  APPROVED_BENEFICIARY: 'APPROVED_BENEFICIARY',
  DONATION_CONFIRMED: 'DONATION_CONFIRMED',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REJECTED: 'REJECTED',
  REVOKED: 'REVOKED',
});

// Allowed application-status transitions (member statuses handled separately below).
export const TRANSITIONS = Object.freeze({
  [STATUS.SUBMITTED]: [STATUS.INTERVIEW_SCHEDULED, STATUS.DONATION_REQUIRED],
  [STATUS.INTERVIEW_SCHEDULED]: [
    STATUS.APPROVED_BENEFICIARY,
    STATUS.DONATION_REQUIRED,
    STATUS.REJECTED,
  ],
  [STATUS.DONATION_REQUIRED]: [STATUS.DONATION_CONFIRMED],
  [STATUS.APPROVED_BENEFICIARY]: [STATUS.ACTIVE],
  [STATUS.DONATION_CONFIRMED]: [STATUS.ACTIVE],
  [STATUS.ACTIVE]: [STATUS.EXPIRED, STATUS.REVOKED],
  [STATUS.EXPIRED]: [],
  [STATUS.REJECTED]: [],
  [STATUS.REVOKED]: [],
});

const ACCESS_DAYS = 120; // demo access window length

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

const isConditionalFail = (e) => e?.name === 'ConditionalCheckFailedException';

export class InvalidTransitionError extends Error {
  constructor(from, to) {
    super(`Invalid transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
    this.code = 'INVALID_TRANSITION';
    this.httpStatus = 409;
  }
}
export class NotFoundError extends Error {
  constructor(what) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
    this.code = 'NOT_FOUND';
    this.httpStatus = 404;
  }
}

// ---- intake ----

export async function submitApplication(data) {
  const applicationId = ulid();
  const now = new Date().toISOString();
  const item = {
    applicationId,
    status: STATUS.SUBMITTED,
    createdAt: now,
    updatedAt: now,
    version: 1,
    email: data.email,
    fullName: data.fullName,
    stage: data.stage,
    preferredTrack: data.preferredTrack,
    background: data.background,
    links: data.links,
    ageBracket: data.ageBracket,
    guardianConsentAt: data.guardianConsentAt,
  };
  await appsRepo.createApplication(item);
  await audit.append({
    actorId: 'public',
    actorRole: 'applicant',
    action: 'APPLICATION_SUBMITTED',
    targetType: 'application',
    targetId: applicationId,
    after: { status: STATUS.SUBMITTED },
  });
  return item;
}

// ---- admin-driven application transitions ----

async function advance(applicationId, to, { actorId, actorRole = 'admin', reasonCode, patch = {} }) {
  const app = await appsRepo.getApplication(applicationId);
  if (!app) throw new NotFoundError('Application');
  if (!canTransition(app.status, to)) throw new InvalidTransitionError(app.status, to);

  let updated;
  try {
    updated = await appsRepo.transitionStatus(applicationId, { from: app.status, to, patch });
  } catch (e) {
    if (isConditionalFail(e)) throw new InvalidTransitionError(app.status, to); // raced
    throw e;
  }

  await audit.append({
    actorId,
    actorRole,
    action: `APPLICATION_${to}`,
    targetType: 'application',
    targetId: applicationId,
    before: { status: app.status },
    after: { status: to },
    reasonCode,
  });
  return updated;
}

export const scheduleInterview = (applicationId, { actorId, interviewAt }) =>
  advance(applicationId, STATUS.INTERVIEW_SCHEDULED, {
    actorId,
    patch: { interviewAt, decidedBy: actorId },
  });

export const approveBeneficiary = (applicationId, { actorId }) =>
  advance(applicationId, STATUS.APPROVED_BENEFICIARY, {
    actorId,
    reasonCode: 'ELIGIBLE',
    patch: { accessBasis: 'beneficiary', decidedBy: actorId, decidedAt: new Date().toISOString() },
  });

export const requireDonation = (applicationId, { actorId }) =>
  advance(applicationId, STATUS.DONATION_REQUIRED, {
    actorId,
    patch: { accessBasis: 'supporter', decidedBy: actorId },
  });

// Self-serve "fund a seat" at /apply: SUBMITTED -> DONATION_REQUIRED with NO interview and NO
// admin step (Customer-Journey §4 — supporters self-serve). The applicant, not an admin, is the
// actor; access still requires a verified payment downstream (see selfServeSupporterGrant).
export const chooseFundASeat = (applicationId, { actorId = 'self' } = {}) =>
  advance(applicationId, STATUS.DONATION_REQUIRED, {
    actorId,
    actorRole: 'applicant',
    reasonCode: 'SELF_SERVE',
    patch: { accessBasis: 'supporter' },
  });

export const rejectApplication = (applicationId, { actorId, reasonCode = 'DECLINED' }) =>
  advance(applicationId, STATUS.REJECTED, {
    actorId,
    reasonCode,
    patch: { rejectReason: reasonCode, decidedBy: actorId, decidedAt: new Date().toISOString() },
  });

// Supporter path: system verifies a Zeffy donation (here invoked directly for the demo).
// `zeffyPaymentId` is the production idempotency key (recorded in the Donations table there);
// in the demo we stamp it on the application for traceability.
export const confirmDonation = (applicationId, { actorId = 'system', zeffyPaymentId } = {}) =>
  advance(applicationId, STATUS.DONATION_CONFIRMED, {
    actorId,
    actorRole: 'system',
    patch: { zeffyPaymentId, donatedAt: zeffyPaymentId ? new Date().toISOString() : undefined },
  });

// request-info is NOT a status change (not in the state machine) — it's an audited note
// that keeps the application where it is.
export async function requestInfo(applicationId, { actorId, reasonCode = 'INFO_REQUESTED' }) {
  const app = await appsRepo.getApplication(applicationId);
  if (!app) throw new NotFoundError('Application');
  await audit.append({
    actorId,
    actorRole: 'admin',
    action: 'APPLICATION_INFO_REQUESTED',
    targetType: 'application',
    targetId: applicationId,
    after: { status: app.status },
    reasonCode,
  });
  return app;
}

// ---- provisioning (APPROVED_BENEFICIARY | DONATION_CONFIRMED -> ACTIVE) ----

export async function provision(applicationId, { actorId }) {
  const app = await appsRepo.getApplication(applicationId);
  if (!app) throw new NotFoundError('Application');
  if (app.memberId) {
    // already provisioned — idempotent no-op
    return { memberId: app.memberId, application: app, alreadyProvisioned: true };
  }
  if (![STATUS.APPROVED_BENEFICIARY, STATUS.DONATION_CONFIRMED].includes(app.status)) {
    throw new InvalidTransitionError(app.status, STATUS.ACTIVE);
  }

  const memberId = ulid();
  const now = new Date();
  const endsAt = new Date(now.getTime() + ACCESS_DAYS * 86400000).toISOString();

  // Claim the transition first (atomic), so a concurrent double-call cannot double-create.
  let updated;
  try {
    updated = await appsRepo.transitionStatus(applicationId, {
      from: app.status,
      to: STATUS.ACTIVE,
      patch: { memberId, provisionedAt: now.toISOString() },
    });
  } catch (e) {
    if (isConditionalFail(e)) {
      const cur = await appsRepo.getApplication(applicationId);
      return { memberId: cur?.memberId, application: cur, alreadyProvisioned: true };
    }
    throw e;
  }

  const accessBasis =
    app.accessBasis || (app.status === STATUS.APPROVED_BENEFICIARY ? 'beneficiary' : 'supporter');

  await membersRepo.createMember({
    memberId,
    email: app.email,
    fullName: app.fullName,
    role: 'student',
    accessBasis,
    status: STATUS.ACTIVE,
    accessStartsAt: now.toISOString(),
    accessEndsAt: endsAt,
    track: app.preferredTrack,
    path: app.preferredTrack === 'fast_track' ? 'B_fast_track' : 'A_full_roadmap',
    grantedBy: actorId,
    grantedAt: now.toISOString(),
  });

  await audit.append({
    actorId,
    actorRole: 'admin',
    action: 'MEMBER_PROVISIONED',
    targetType: 'application',
    targetId: applicationId,
    before: { status: app.status },
    after: { status: STATUS.ACTIVE },
  });
  await audit.append({
    actorId,
    actorRole: 'admin',
    action: 'ACCOUNT_CREATED',
    targetType: 'member',
    targetId: memberId,
    after: { status: STATUS.ACTIVE },
  });

  // Mint the login credential (demo stand-in for Cognito AdminCreateUser; prod emails it via SES).
  const { tempPassword } = await createDemoCredential({ email: app.email, memberId, role: 'student' });

  return { memberId, application: updated, alreadyProvisioned: false, tempPassword };
}

// ---- self-serve supporter auto-grant (Customer-Journey §4/§5; Arch §9 supporter path) ----
//
// Drives an applicant who funds a seat straight to ACTIVE with NO interview and NO admin step:
//   SUBMITTED -> DONATION_REQUIRED -> DONATION_CONFIRMED -> ACTIVE
// Idempotent (each leg is a conditional write; provision() is a no-op once done).
//
// SECURITY (production): the DONATION_REQUIRED -> DONATION_CONFIRMED leg is gated on a
// server-verified Zeffy payment — system-fn polls Zeffy's read-only API, matches by email, and
// is idempotent on zeffyPaymentId. It is NEVER a raw client "I paid" signal. This demo simulates
// that verification in-process (no real Zeffy), but the trust rule — access follows a
// server-side payment check, not a client claim — is preserved in the design.
export async function selfServeSupporterGrant(
  applicationId,
  { actorId = 'system', zeffyPaymentId } = {},
) {
  let app = await appsRepo.getApplication(applicationId);
  if (!app) throw new NotFoundError('Application');

  // Already granted -> idempotent no-op (returns the existing member).
  if (app.status === STATUS.ACTIVE || app.memberId) {
    return provision(applicationId, { actorId });
  }

  // Self-serve fund-a-seat: SUBMITTED -> DONATION_REQUIRED (applicant-initiated, no admin).
  if (app.status === STATUS.SUBMITTED) {
    app = await chooseFundASeat(applicationId, { actorId: 'self' });
  }

  // Server-verified payment (demo stand-in for the Zeffy poll): -> DONATION_CONFIRMED.
  if (app.status === STATUS.DONATION_REQUIRED) {
    app = await confirmDonation(applicationId, {
      actorId,
      zeffyPaymentId: zeffyPaymentId || `demo-${applicationId}`,
    });
  }

  // Anything else (REJECTED / EXPIRED / REVOKED / INTERVIEW_SCHEDULED) is not a donate target.
  if (app.status !== STATUS.DONATION_CONFIRMED) {
    throw new InvalidTransitionError(app.status, STATUS.ACTIVE);
  }

  // Auto-provision (system-fn in prod): DONATION_CONFIRMED -> ACTIVE.
  return provision(applicationId, { actorId });
}

// ---- member-status transitions ----

async function transitionMember(memberId, to, { actorId, actorRole = 'admin', reasonCode, patch = {} }) {
  const member = await membersRepo.getMember(memberId);
  if (!member) throw new NotFoundError('Member');
  if (!canTransition(member.status, to)) throw new InvalidTransitionError(member.status, to);
  let updated;
  try {
    updated = await membersRepo.transitionMemberStatus(memberId, { from: member.status, to, patch });
  } catch (e) {
    if (isConditionalFail(e)) throw new InvalidTransitionError(member.status, to);
    throw e;
  }
  await audit.append({
    actorId,
    actorRole,
    action: `MEMBER_${to}`,
    targetType: 'member',
    targetId: memberId,
    before: { status: member.status },
    after: { status: to },
    reasonCode,
  });
  return updated;
}

export const revokeMember = (memberId, { actorId, reasonCode = 'ADMIN_REVOKE' }) =>
  transitionMember(memberId, STATUS.REVOKED, { actorId, reasonCode, patch: { revokedBy: actorId } });

export const expireMember = (memberId, { actorId = 'system' } = {}) =>
  transitionMember(memberId, STATUS.EXPIRED, { actorId, actorRole: 'system' });

export async function extendMember(memberId, { actorId, days = ACCESS_DAYS }) {
  const member = await membersRepo.getMember(memberId);
  if (!member) throw new NotFoundError('Member');
  const base = new Date(member.accessEndsAt || Date.now());
  const newEndsAt = new Date(base.getTime() + days * 86400000).toISOString();
  let updated;
  try {
    updated = await membersRepo.extendAccess(memberId, newEndsAt);
  } catch (e) {
    if (isConditionalFail(e)) throw new InvalidTransitionError(member.status, 'EXTEND'); // not ACTIVE
    throw e;
  }
  await audit.append({
    actorId,
    actorRole: 'admin',
    action: 'MEMBER_EXTENDED',
    targetType: 'member',
    targetId: memberId,
    after: { status: STATUS.ACTIVE },
  });
  return updated;
}

// Scheduled expiry sweep (EventBridge -> system-fn in prod).
export async function runExpirySweep({ nowIso = new Date().toISOString(), actorId = 'system' } = {}) {
  const due = await membersRepo.queryExpiring(nowIso);
  const expired = [];
  for (const m of due) {
    try {
      await expireMember(m.memberId, { actorId });
      expired.push(m.memberId);
    } catch (e) {
      if (!(e instanceof InvalidTransitionError)) throw e; // already moved — skip
    }
  }
  return expired;
}
