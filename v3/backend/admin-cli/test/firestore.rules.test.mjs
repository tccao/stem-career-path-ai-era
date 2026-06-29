import { readFile } from 'node:fs/promises';
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'code4good-stem-career-path';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await Promise.all([
      setDoc(doc(db, 'applications', 'app-1'), { status: 'SUBMITTED', email: 'student@example.test' }),
      setDoc(doc(db, 'members', 'student-1'), { status: 'ACTIVE', accessEnds: Date.now() + 86_400_000 }),
      setDoc(doc(db, 'members', 'student-1', 'progress', 'd01'), { status: 'complete' }),
      setDoc(doc(db, 'members', 'student-1', 'stageLocks', 'd28'), { state: 'locked' }),
      setDoc(doc(db, 'auditLog', 'event-1'), { type: 'seed' }),
      setDoc(doc(db, 'settings', 'public'), { zeffyUrl: 'https://www.zeffy.com/test', calComUrl: 'https://cal.com/test' }),
    ]);
  });
});

after(async () => env?.cleanup());

test('anonymous users can read only public settings', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'settings', 'public')));
  await assertFails(getDoc(doc(db, 'applications', 'app-1')));
  await assertFails(getDoc(doc(db, 'members', 'student-1')));
  await assertFails(getDoc(doc(db, 'auditLog', 'event-1')));
});

test('all browser writes are denied, including former bypasses', async () => {
  const student = env.authenticatedContext('student-1', {
    role: 'student', accessEnds: Date.now() + 86_400_000, auth_time: 100,
  }).firestore();
  const staff = env.authenticatedContext('admin-1', {
    role: 'admin', mfaEnrolled: true, auth_time: 100,
  }).firestore();

  await assertFails(setDoc(doc(student, 'members', 'student-1', 'progress', 'd28'), {
    status: 'complete', deliverableUrl: 'https://example.test/proof', completedAt: new Date(),
  }));
  await assertFails(setDoc(doc(staff, 'members', 'student-1', 'stageLocks', 'd28'), { state: 'unlocked' }));
  await assertFails(setDoc(doc(staff, 'applications', 'new-app'), { status: 'SUBMITTED' }));
  await assertFails(setDoc(doc(staff, 'settings', 'public'), { zeffyUrl: 'https://evil.test', calComUrl: 'https://evil.test' }));
  await assertFails(setDoc(doc(staff, 'auditLog', 'forged'), { type: 'forged' }));
});

test('students cannot read backend records directly', async () => {
  const db = env.authenticatedContext('student-1', {
    role: 'student', accessEnds: Date.now() + 86_400_000, auth_time: 100,
  }).firestore();
  await assertFails(getDoc(doc(db, 'members', 'student-1')));
  await assertFails(getDocs(collection(db, 'members', 'student-1', 'progress')));
});

test('staff reads require MFA and a current token', async () => {
  const noMfa = env.authenticatedContext('admin-no-mfa', { role: 'admin', auth_time: 100 }).firestore();
  await assertFails(getDoc(doc(noMfa, 'applications', 'app-1')));

  const current = env.authenticatedContext('admin-current', {
    role: 'admin', mfaEnrolled: true, auth_time: 200,
  }).firestore();
  await assertSucceeds(getDoc(doc(current, 'applications', 'app-1')));

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'revocations', 'admin-current'), { revokeTime: 200 });
  });
  await assertFails(getDoc(doc(current, 'applications', 'app-1')));
});

test('lockdown denies non-owner reads while preserving owner recovery', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'system', 'lockdown'), { enabled: true });
  });
  const admin = env.authenticatedContext('admin-1', {
    role: 'admin', mfaEnrolled: true, auth_time: 100,
  }).firestore();
  const owner = env.authenticatedContext('owner-1', {
    role: 'owner', mfaEnrolled: true, auth_time: 100,
  }).firestore();
  await assertFails(getDoc(doc(admin, 'applications', 'app-1')));
  const snap = await assertSucceeds(getDoc(doc(owner, 'applications', 'app-1')));
  assert.equal(snap.get('status'), 'SUBMITTED');
});
