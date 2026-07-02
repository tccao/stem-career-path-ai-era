import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

process.env.GCLOUD_PROJECT ||= 'code4good-stem-career-path';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.ZEFFY_API_BASE_URL = 'http://127.0.0.1:7788';

const { auth, db } = await import('../../sync-fn/src/context.js');
const { runMaintenanceSweep } = await import('../../sync-fn/src/maintenance.js');

test('maintenance sweep isolates per-member failures', async () => {
  const now = Date.now();
  const staff = await auth.createUser({ email: `stale-staff-${now}@example.test` });
  await auth.setCustomUserClaims(staff.uid, { role: 'admin' });
  await db.collection('members').doc(staff.uid).set({ status: 'ACTIVE', accessEnds: now - 1, accessBasis: 'beneficiary' });
  const student = await auth.createUser({ email: `expired-student-${now}@example.test` });
  await auth.setCustomUserClaims(student.uid, { role: 'student' });
  await db.collection('members').doc(student.uid).set({ status: 'ACTIVE', accessEnds: now - 1, accessBasis: 'beneficiary' });
  const summary = await runMaintenanceSweep();
  assert.equal(summary.failed, 1);
  assert.ok(summary.expired >= 1);
  assert.equal((await db.collection('members').doc(student.uid).get()).get('status'), 'ENDED');
  assert.equal((await db.collection('members').doc(staff.uid).get()).get('status'), 'ACTIVE');
});

test('donation sync core and scheduled wrapper mirror payments', async () => {
  const paymentId = `reconcile-${Date.now()}`;
  const mock = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/api/v1/campaigns')) {
      res.end(JSON.stringify({ data: [{ id: 'c1', title: 'Fund a Seat' }], has_more: false }));
    } else if (req.url.startsWith('/api/v1/payments?')) {
      res.end(JSON.stringify({ data: [{ id: paymentId, status: 'succeeded', refund_status: 'none', amount: 5_000, campaign_id: 'c1', buyer: { email: 'reconcile@example.test' } }], has_more: false }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise((resolve) => mock.listen(7788, '127.0.0.1', resolve));
  try {
    const { runDonationSync, runScheduledDonationReconcile } = await import('../../sync-fn/src/integrations.js');
    assert.equal((await runDonationSync({ key: 'test-key', actorId: 'system:test' })).synced, 1);
    const summary = await runScheduledDonationReconcile({ key: 'test-key' });
    assert.equal(summary.truncated, false);
    assert.equal((await db.collection('donations').doc(paymentId).get()).get('status'), 'succeeded');
  } finally {
    await new Promise((resolve) => mock.close(resolve));
  }
});
