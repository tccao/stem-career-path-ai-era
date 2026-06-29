import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { auth as adminAuth, db } from '../lib/admin.mjs';

const projectId = process.env.GCLOUD_PROJECT || 'code4good-stem-career-path';
const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const apps = [];
const supporterEmail = `supporter-${runId}@example.test`;
const paymentId = `payment-${runId}`;
let paymentIsRefunded = false;

const payment = () => ({
  id: paymentId,
  status: 'succeeded',
  refund_status: paymentIsRefunded ? 'refunded' : 'none',
  dispute: false,
  amount: 10_000,
  currency: 'USD',
  campaign_id: 'campaign-1',
  created: Math.floor(Date.now() / 1_000),
  buyer: { email: supporterEmail, first_name: 'Supporter', last_name: 'Student' },
});

const zeffyMock = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url.startsWith('/api/v1/campaigns')) {
    res.end(JSON.stringify({ data: [{ id: 'campaign-1', title: 'Fund a Seat', status: 'active', currency: 'USD' }], has_more: false }));
  } else if (req.url === `/api/v1/payments/${encodeURIComponent(paymentId)}`) {
    res.end(JSON.stringify(payment()));
  } else if (req.url.startsWith('/api/v1/payments?')) {
    res.end(JSON.stringify({ data: [payment()], has_more: false }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  }
});

async function client(name, user = null) {
  const app = initializeApp({ apiKey: 'fake-api-key', projectId }, `${name}-${runId}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const functions = getFunctions(app, 'us-central1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  if (user) await signInWithCustomToken(auth, await adminAuth.createCustomToken(user.uid));
  return { app, auth, functions, call: (name, data = {}) => httpsCallable(functions, name)(data).then((result) => result.data) };
}

async function createRoleClient(name, role, extraClaims = {}) {
  const user = await adminAuth.createUser({ email: `${name}-${runId}@example.test`, emailVerified: true });
  await adminAuth.setCustomUserClaims(user.uid, { role, ...extraClaims });
  return { user, ...(await client(name, user)) };
}

async function expectDenied(promise, pattern = /permission|unauthenticated|failed-precondition|already-exists/i) {
  try {
    await promise;
    assert.fail('expected the operation to be denied');
  } catch (error) {
    assert.match(`${error.code || ''} ${error.message || error}`, pattern);
  }
}

test('V3 callable security flow', async (t) => {
  await new Promise((resolve) => zeffyMock.listen(7777, '127.0.0.1', resolve));
  const owner = await createRoleClient('owner', 'owner', { mfaEnrolled: true, testMfa: true });
  const admin = await createRoleClient('admin', 'admin', { mfaEnrolled: true, testMfa: true });
  const noMfa = await createRoleClient('no-mfa', 'admin', { mfaEnrolled: false, testMfa: false });
  const applicant = await client('applicant');
  await signInAnonymously(applicant.auth);

  await t.test('intake validates age and deduplicates email', async () => {
    await expectDenied(applicant.call('submitApplication', {
      name: 'Too Young', email: `under13-${runId}@example.test`, ageBracket: 'under13',
      guardianConsent: false, accessChoice: 'beneficiary',
    }), /failed-precondition|under-13/i);

    const email = `beneficiary-${runId}@example.test`;
    const first = await applicant.call('submitApplication', {
      name: 'Beneficiary Student', email, ageBracket: '18plus', guardianConsent: false,
      accessChoice: 'beneficiary',
    });
    assert.equal(first.status, 'SUBMITTED');
    await expectDenied(applicant.call('submitApplication', {
      name: 'Duplicate', email, ageBracket: '18plus', guardianConsent: false,
      accessChoice: 'beneficiary',
    }), /already-exists/i);
    assert.ok(first.applicationId);
    t.diagnostic(`beneficiaryApplication=${first.applicationId}`);
  });

  // node:test does not expose parent custom state to subtests, so retrieve the seeded application.
  const beneficiarySnap = await db.collection('applications').where('email', '==', `beneficiary-${runId}@example.test`).limit(1).get();
  const beneficiaryApplication = beneficiarySnap.docs[0].id;

  let student;
  await t.test('beneficiary grant is resumable, idempotent, and creates an active member', async () => {
    const beforeGrant = Date.now();
    const first = await admin.call('grant', { applicationId: beneficiaryApplication, path: 'fasttrack' });
    assert.equal(first.status, 'GRANTED');
    assert.ok(first.accessEnds >= beforeGrant + 365 * 86_400_000);
    const second = await admin.call('grant', { applicationId: beneficiaryApplication, path: 'fasttrack' });
    assert.equal(second.idempotent, true);
    const user = await adminAuth.getUser(first.uid);
    assert.equal(user.customClaims.role, 'student');
    const member = await db.collection('members').doc(first.uid).get();
    assert.equal(member.get('status'), 'ACTIVE');
    student = { user, ...(await client('student', user)) };
  });

  await t.test('curriculum is callable-only and stage sequencing/locks are server-enforced', async () => {
    const dashboard = await student.call('getStudentDashboard');
    assert.equal(dashboard.member.status, 'ACTIVE');
    assert.equal(dashboard.curriculum.fasttrack.stages.length, 28);
    await expectDenied(student.call('submitStage', { stageKey: 'd01', deliverableUrl: 'http://example.test/insecure' }), /invalid-argument|https/i);
    await expectDenied(student.call('submitStage', { stageKey: 'd02', deliverableUrl: 'https://example.test/too-early' }));
    const first = await student.call('submitStage', { stageKey: 'd01', deliverableUrl: 'https://example.test/day-1-proof' });
    assert.equal(first.status, 'complete');
    const afterFirst = await student.call('getStudentDashboard');
    assert.equal(afterFirst.progress.find((stage) => stage.stageKey === 'd01')?.deliverableUrl, 'https://example.test/day-1-proof');
    const second = await student.call('submitStage', { stageKey: 'd02', deliverableUrl: 'https://example.test/day-2-proof' });
    assert.equal(second.status, 'complete');
    await expectDenied(student.call('submitStage', { stageKey: 'd28', deliverableUrl: 'https://example.test/future' }));
    await admin.call('setStageLock', { uid: student.user.uid, stageKey: 'd28', action: 'locked' });
    await expectDenied(student.call('submitStage', { stageKey: 'd28', deliverableUrl: 'https://example.test/locked' }));
    await admin.call('setStageLock', { uid: student.user.uid, stageKey: 'd28', action: 'unlocked' });
    const completed = await student.call('submitStage', { stageKey: 'd28', deliverableUrl: 'https://example.test/override' });
    assert.equal(completed.status, 'complete');
  });

  await t.test('concurrent grant calls converge on one account', async () => {
    const email = `concurrent-${runId}@example.test`;
    const application = await applicant.call('submitApplication', {
      name: 'Concurrent Student', email, ageBracket: '18plus', guardianConsent: false,
      accessChoice: 'beneficiary',
    });
    const [a, b] = await Promise.all([
      admin.call('grant', { applicationId: application.applicationId, path: 'fasttrack', days: 90 }),
      admin.call('grant', { applicationId: application.applicationId, path: 'fasttrack', days: 90 }),
    ]);
    assert.equal(a.uid, b.uid);
    const users = await adminAuth.listUsers();
    assert.equal(users.users.filter((user) => user.email === email).length, 1);
  });

  await t.test('a resumed grant rejects a conflicting access duration', async () => {
    const applicationRef = db.collection('applications').doc();
    const operationId = `grant:${applicationRef.id}`;
    await applicationRef.set({
      status: 'PROVISIONING',
      accessChoice: 'beneficiary',
      email: `conflicting-duration-${runId}@example.test`,
      name: 'Conflicting Duration',
      provisioning: {
        operationId,
        fromStatus: 'SUBMITTED',
        accessBasis: 'beneficiary',
        path: 'fasttrack',
        days: 365,
        paymentId: null,
        actorId: admin.user.uid,
        reservedAt: Date.now(),
      },
    });

    await expectDenied(admin.call('grant', {
      applicationId: applicationRef.id, path: 'fasttrack', days: 30,
    }), /aborted/i);
    const resumed = await admin.call('grant', {
      applicationId: applicationRef.id, path: 'fasttrack', days: 365,
    });
    assert.equal(resumed.status, 'GRANTED');
  });

  await t.test('grant cannot overwrite an owner account', async () => {
    const application = await applicant.call('submitApplication', {
      name: 'Owner Collision', email: owner.user.email, ageBracket: '18plus', guardianConsent: false,
      accessChoice: 'beneficiary',
    });
    await expectDenied(admin.call('grant', { applicationId: application.applicationId, path: 'fasttrack', days: 90 }));
    const ownerAfter = await adminAuth.getUser(owner.user.uid);
    assert.equal(ownerAfter.customClaims.role, 'owner');
    const appAfter = await db.collection('applications').doc(application.applicationId).get();
    assert.equal(appAfter.get('status'), 'SUBMITTED');
  });

  await t.test('supporter access requires verified payment and refunds revoke it', async () => {
    const supporter = await applicant.call('submitApplication', {
      name: 'Supporter Student', email: supporterEmail, ageBracket: '18plus',
      guardianConsent: false, accessChoice: 'supporter',
    });
    await expectDenied(admin.call('grant', { applicationId: supporter.applicationId, path: 'fasttrack', days: 90 }));
    const granted = await admin.call('confirmDonation', {
      applicationId: supporter.applicationId, paymentId, path: 'roadmap', days: 90,
    });
    assert.equal(granted.status, 'GRANTED');
    const supporterUser = await adminAuth.getUser(granted.uid);
    const supporterClient = await client('supporter', supporterUser);
    assert.equal((await supporterClient.call('getStudentDashboard')).member.status, 'ACTIVE');
    paymentIsRefunded = true;
    const sync = await admin.call('syncDonations');
    assert.equal(sync.revoked, 1);
    await expectDenied(supporterClient.call('getStudentDashboard'), /unauthenticated|revoked/i);
    await expectDenied(admin.call('extendAccess', { uid: supporterUser.uid, days: 30 }), /failed-precondition|verified payment/i);
  });

  await t.test('disable is immediate and an enabled member with expired access can be restored', async () => {
    const application = await applicant.call('submitApplication', {
      name: 'Disable Test', email: `disable-${runId}@example.test`, ageBracket: '18plus',
      guardianConsent: false, accessChoice: 'beneficiary',
    });
    const granted = await admin.call('grant', { applicationId: application.applicationId, path: 'fasttrack', days: 90 });
    const user = await adminAuth.getUser(granted.uid);
    const beforeDisable = await client('before-disable', user);
    await admin.call('disableAccount', { uid: user.uid });
    await expectDenied(beforeDisable.call('getStudentDashboard'), /unauthenticated|revoked/i);
    const expiredAt = Date.now() - 86_400_000;
    await db.collection('members').doc(user.uid).update({ accessEnds: expiredAt });
    const enabled = await admin.call('enableAccount', { uid: user.uid });
    assert.equal(enabled.memberStatus, 'ENDED');
    const restored = await admin.call('extendAccess', { uid: user.uid, days: 30 });
    assert.ok(restored.accessEnds >= Date.now() + 30 * 86_400_000 - 5_000);
    const member = await db.collection('members').doc(user.uid).get();
    assert.equal(member.get('status'), 'ACTIVE');
    assert.equal(member.get('endedReason'), undefined);
    assert.equal(member.get('endedAt'), undefined);
    assert.equal(member.get('expiresAt'), undefined);
    const refreshed = await adminAuth.getUser(user.uid);
    assert.equal(refreshed.disabled, false);
    assert.equal(refreshed.customClaims.accessEnds, restored.accessEnds);
    const afterEnable = await client('after-enable', refreshed);
    assert.equal((await afterEnable.call('getStudentDashboard')).member.status, 'ACTIVE');
  });

  await t.test('staff requires MFA', async () => {
    await expectDenied(noMfa.call('listAccounts'));
    const page = await owner.call('listAccounts');
    assert.ok(page.accounts.some((account) => account.uid === owner.user.uid));
  });

  await t.test('owner can reactivate disabled staff while admin remains student-only', async () => {
    const target = await createRoleClient('reactivate-admin', 'admin', { mfaEnrolled: true, testMfa: true });
    await owner.call('disableAccount', { uid: target.user.uid });
    assert.equal((await adminAuth.getUser(target.user.uid)).disabled, true);
    await expectDenied(admin.call('enableAccount', { uid: target.user.uid }));
    const reactivated = await owner.call('enableAccount', { uid: target.user.uid });
    assert.equal(reactivated.disabled, false);
    assert.equal((await adminAuth.getUser(target.user.uid)).disabled, false);
  });

  await t.test('settings are owner-only and hostname allowlisted', async () => {
    await expectDenied(admin.call('updateSettings', {
      zeffyUrl: 'https://www.zeffy.com/test', calComUrl: 'https://cal.com/test',
    }));
    await expectDenied(owner.call('updateSettings', {
      zeffyUrl: 'https://evil.test/phish', calComUrl: 'https://cal.com/test',
    }), /invalid-argument/i);
    const settings = await owner.call('updateSettings', {
      zeffyUrl: 'https://www.zeffy.com/test', calComUrl: 'https://cal.com/test',
    });
    assert.match(settings.zeffyUrl, /^https:\/\/www\.zeffy\.com/);
  });

  await t.test('revocation rejects the already-issued student token immediately', async () => {
    await admin.call('revokeAccess', { uid: student.user.uid });
    await expectDenied(student.call('getStudentDashboard'), /unauthenticated|revoked/i);
  });

  await t.test('lockdown denies non-owner calls and owner can recover', async () => {
    await owner.call('setLockdown', { enabled: true, reason: 'security test' });
    await expectDenied(admin.call('getCurriculum'), /unavailable|lockdown/i);
    await owner.call('setLockdown', { enabled: false, reason: 'security test complete' });
    const curriculum = await admin.call('getCurriculum');
    assert.equal(curriculum.curriculum.roadmap.stages.length, 8);
  });

  await t.test('role removal invalidates the existing admin token', async () => {
    const returning = await createRoleClient('returning-student', 'admin', { mfaEnrolled: true, testMfa: true });
    const returningEnds = Date.now() + 30 * 86_400_000;
    await db.collection('members').doc(returning.user.uid).set({
      status: 'ACTIVE', accessBasis: 'beneficiary', accessEnds: returningEnds,
      path: 'fasttrack', email: returning.user.email,
    });
    const restored = await owner.call('setRole', { uid: returning.user.uid, role: 'none' });
    assert.equal(restored.role, 'student');
    const restoredUser = await adminAuth.getUser(returning.user.uid);
    assert.equal(restoredUser.customClaims.role, 'student');
    assert.equal(restoredUser.customClaims.accessBasis, 'beneficiary');
    assert.equal(restoredUser.customClaims.accessEnds, returningEnds);
    await expectDenied(returning.call('listAccounts'), /unauthenticated|revoked/i);
    const returningStudent = await client('returning-student-fresh', restoredUser);
    assert.equal((await returningStudent.call('getStudentDashboard')).member.status, 'ACTIVE');

    await owner.call('setRole', { uid: admin.user.uid, role: 'none' });
    await expectDenied(admin.call('getCurriculum'), /unauthenticated|revoked/i);
  });

  const audits = await db.collection('auditLog').get();
  assert.ok(audits.docs.some((doc) => doc.get('type') === 'access.granted' && doc.get('actorId')));
});

test.after(async () => {
  await new Promise((resolve) => zeffyMock.close(resolve));
  await Promise.all(apps.map((app) => deleteApp(app).catch(() => {})));
});
