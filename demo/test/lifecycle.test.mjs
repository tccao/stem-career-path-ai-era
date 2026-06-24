// Phase 2 — state-machine lifecycle service (integration, against real local DynamoDB).

import { test, before, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { freshTables } from './_setup.mjs';
import * as lc from '../src/services/lifecycle.mjs';
import * as appsRepo from '../src/repositories/applications.mjs';
import * as membersRepo from '../src/repositories/members.mjs';
import * as audit from '../src/repositories/audit.mjs';

const sampleApplicant = (over = {}) => ({
  email: `applicant-${Math.random().toString(36).slice(2)}@cfg.org`,
  fullName: 'Sample Applicant',
  stage: 'recent_graduate',
  preferredTrack: 'fast_track',
  background: 'CS grad',
  links: 'https://github.com/sample',
  ageBracket: '18+',
  ...over,
});

before(async () => {
  await freshTables();
});

describe('Phase 2 · lifecycle state machine', () => {
  test('beneficiary happy path: submit -> interview -> approve -> provision -> ACTIVE member', async () => {
    const app = await lc.submitApplication(sampleApplicant());
    assert.equal(app.status, lc.STATUS.SUBMITTED);

    await lc.scheduleInterview(app.applicationId, { actorId: 'admin1', interviewAt: '2026-07-01T10:00:00Z' });
    await lc.approveBeneficiary(app.applicationId, { actorId: 'admin1' });

    const { memberId, application } = await lc.provision(app.applicationId, { actorId: 'admin1' });
    assert.equal(application.status, lc.STATUS.ACTIVE);

    const member = await membersRepo.getMember(memberId);
    assert.equal(member.status, 'ACTIVE');
    assert.equal(member.role, 'student');
    assert.equal(member.accessBasis, 'beneficiary');
    assert.equal(member.path, 'B_fast_track'); // fast_track preference
  });

  test('supporter happy path: submit -> requireDonation -> confirmDonation -> provision', async () => {
    const app = await lc.submitApplication(sampleApplicant());
    await lc.requireDonation(app.applicationId, { actorId: 'admin1' });
    await lc.confirmDonation(app.applicationId, { actorId: 'system' });
    const { memberId } = await lc.provision(app.applicationId, { actorId: 'system' });
    const member = await membersRepo.getMember(memberId);
    assert.equal(member.status, 'ACTIVE');
    assert.equal(member.accessBasis, 'supporter');
  });

  test('self-serve supporter: submit -> fund a seat -> auto-grant -> ACTIVE (no admin)', async () => {
    const app = await lc.submitApplication(sampleApplicant());

    // Applicant chooses to fund a seat — straight to DONATION_REQUIRED, no interview/admin.
    const dr = await lc.chooseFundASeat(app.applicationId, { actorId: 'self' });
    assert.equal(dr.status, lc.STATUS.DONATION_REQUIRED);
    assert.equal(dr.accessBasis, 'supporter');

    // Verified donation auto-provisions to ACTIVE in one system-driven call.
    const { memberId, application } = await lc.selfServeSupporterGrant(app.applicationId, {
      zeffyPaymentId: 'zf_test_1',
    });
    assert.equal(application.status, lc.STATUS.ACTIVE);

    const member = await membersRepo.getMember(memberId);
    assert.equal(member.status, 'ACTIVE');
    assert.equal(member.accessBasis, 'supporter');
    assert.equal(member.role, 'student');
  });

  test('self-serve grant works straight from SUBMITTED and is idempotent', async () => {
    const app = await lc.submitApplication(sampleApplicant());
    const first = await lc.selfServeSupporterGrant(app.applicationId, { zeffyPaymentId: 'zf_a' });
    const second = await lc.selfServeSupporterGrant(app.applicationId, { zeffyPaymentId: 'zf_a' });

    assert.equal(second.alreadyProvisioned, true);
    assert.equal(first.memberId, second.memberId);
    assert.equal((await membersRepo.getMember(first.memberId)).accessBasis, 'supporter');
  });

  test('illegal transition rejected: approve a SUBMITTED app (skipping interview)', async () => {
    const app = await lc.submitApplication(sampleApplicant());
    await assert.rejects(
      lc.approveBeneficiary(app.applicationId, { actorId: 'admin1' }),
      (e) => e instanceof lc.InvalidTransitionError,
    );
    // unchanged
    const fresh = await appsRepo.getApplication(app.applicationId);
    assert.equal(fresh.status, lc.STATUS.SUBMITTED);
  });

  test('cannot provision before ACTIVE-eligible state', async () => {
    const app = await lc.submitApplication(sampleApplicant());
    await assert.rejects(
      lc.provision(app.applicationId, { actorId: 'admin1' }),
      (e) => e instanceof lc.InvalidTransitionError,
    );
  });

  test('idempotent provisioning: double provision creates exactly one member', async () => {
    const app = await lc.submitApplication(sampleApplicant());
    await lc.scheduleInterview(app.applicationId, { actorId: 'admin1', interviewAt: 't' });
    await lc.approveBeneficiary(app.applicationId, { actorId: 'admin1' });

    const first = await lc.provision(app.applicationId, { actorId: 'admin1' });
    const second = await lc.provision(app.applicationId, { actorId: 'admin1' });

    assert.equal(second.alreadyProvisioned, true);
    assert.equal(first.memberId, second.memberId);
  });

  test('reject path ends the application; no further transitions', async () => {
    const app = await lc.submitApplication(sampleApplicant());
    await lc.scheduleInterview(app.applicationId, { actorId: 'admin1', interviewAt: 't' });
    await lc.rejectApplication(app.applicationId, { actorId: 'admin1', reasonCode: 'NOT_ELIGIBLE' });
    const fresh = await appsRepo.getApplication(app.applicationId);
    assert.equal(fresh.status, lc.STATUS.REJECTED);
    await assert.rejects(
      lc.provision(app.applicationId, { actorId: 'admin1' }),
      (e) => e instanceof lc.InvalidTransitionError,
    );
  });

  test('member ops: revoke once, second revoke is rejected', async () => {
    const app = await lc.submitApplication(sampleApplicant());
    await lc.scheduleInterview(app.applicationId, { actorId: 'admin1', interviewAt: 't' });
    await lc.approveBeneficiary(app.applicationId, { actorId: 'admin1' });
    const { memberId } = await lc.provision(app.applicationId, { actorId: 'admin1' });

    const revoked = await lc.revokeMember(memberId, { actorId: 'admin1', reasonCode: 'TEST' });
    assert.equal(revoked.status, 'REVOKED');
    await assert.rejects(
      lc.revokeMember(memberId, { actorId: 'admin1' }),
      (e) => e instanceof lc.InvalidTransitionError,
    );
  });

  test('expiry sweep moves only past-due ACTIVE members to EXPIRED', async () => {
    // Directly seed two members: one past-due, one future.
    await membersRepo.createMember({
      memberId: 'm-past',
      email: 'p@cfg.org',
      role: 'student',
      status: 'ACTIVE',
      accessEndsAt: '2020-01-01T00:00:00.000Z',
    });
    await membersRepo.createMember({
      memberId: 'm-future',
      email: 'f@cfg.org',
      role: 'student',
      status: 'ACTIVE',
      accessEndsAt: '2099-01-01T00:00:00.000Z',
    });
    const expired = await lc.runExpirySweep({ nowIso: new Date().toISOString() });
    assert.ok(expired.includes('m-past'));
    assert.ok(!expired.includes('m-future'));
    assert.equal((await membersRepo.getMember('m-past')).status, 'EXPIRED');
    assert.equal((await membersRepo.getMember('m-future')).status, 'ACTIVE');
  });

  test('audit log is append-only and PII-free (IDs + status codes only)', async () => {
    const applicant = sampleApplicant({ email: 'secret-pii@cfg.org', fullName: 'Jane Secret' });
    const app = await lc.submitApplication(applicant);
    await lc.scheduleInterview(app.applicationId, { actorId: 'admin1', interviewAt: 't' });

    const events = await audit.listForTarget('application', app.applicationId);
    assert.ok(events.length >= 2, 'submit + schedule audited');
    for (const ev of events) {
      const blob = JSON.stringify(ev);
      assert.ok(!blob.includes('secret-pii@cfg.org'), 'no email in audit');
      assert.ok(!blob.includes('Jane Secret'), 'no name in audit');
      if (ev.before) assert.deepEqual(Object.keys(ev.before), ['status']);
      if (ev.after) assert.deepEqual(Object.keys(ev.after), ['status']);
    }
  });
});
