// Phase 3 — admin dashboard API (integration over real HTTP + real local DynamoDB).

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { freshTables } from './_setup.mjs';
import { createApp } from '../src/app.mjs';
import { seedAdmin, ADMIN } from '../scripts/seed.mjs';
import { seedCurriculum } from '../scripts/seed-curriculum.mjs';
import { createToken } from '../src/services/auth.mjs';

let server;
let base;

before(async () => {
  await freshTables();
  await seedAdmin();
  await seedCurriculum();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

const api = (path, opts = {}) =>
  fetch(base + path, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
const bearer = (t) => ({ authorization: `Bearer ${t}` });

async function adminToken() {
  const r = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { email: ADMIN.email, password: ADMIN.password },
  });
  return (await r.json()).token;
}

async function createApplication(over = {}) {
  const r = await api('/api/v1/applications', {
    method: 'POST',
    body: {
      email: `a-${Math.random().toString(36).slice(2)}@cfg.org`,
      fullName: 'Test Applicant',
      stage: 'recent_graduate',
      preferredTrack: 'fast_track',
      ageBracket: '18+',
      ...over,
    },
  });
  return { res: r, body: await r.json() };
}

describe('Phase 3 · admin API', () => {
  test('login returns a token with admin role', async () => {
    const r = await api('/api/v1/auth/login', {
      method: 'POST',
      body: { email: ADMIN.email, password: ADMIN.password },
    });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(j.token);
    assert.equal(j.user.role, 'admin');
  });

  test('bad credentials -> 401', async () => {
    const r = await api('/api/v1/auth/login', {
      method: 'POST',
      body: { email: ADMIN.email, password: 'wrong' },
    });
    assert.equal(r.status, 401);
  });

  test('admin route without token -> 401', async () => {
    const r = await api('/api/v1/admin/applications');
    assert.equal(r.status, 401);
  });

  test('admin route with STUDENT token -> 403 (server-side role guard)', async () => {
    const studentTok = createToken({ sub: 's1', email: 's@cfg.org', role: 'student' });
    const r = await api('/api/v1/admin/applications', { headers: bearer(studentTok) });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).reason, 'wrong_role');
  });

  test('public intake creates a SUBMITTED application', async () => {
    const { res, body } = await createApplication();
    assert.equal(res.status, 201);
    assert.equal(body.status, 'SUBMITTED');
    assert.ok(body.applicationId);
  });

  test('age gate: under-13 is rejected at intake', async () => {
    const { res, body } = await createApplication({ ageBracket: 'under_13' });
    assert.equal(res.status, 400);
    assert.equal(body.error, 'age_ineligible');
  });

  test('queue lists submitted applications', async () => {
    const tok = await adminToken();
    await createApplication();
    const r = await api('/api/v1/admin/applications?status=SUBMITTED', { headers: bearer(tok) });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.ok(j.count >= 1);
  });

  test('full flow over HTTP: schedule -> approve -> provision -> member ACTIVE', async () => {
    const tok = await adminToken();
    const { body: app } = await createApplication();
    const id = app.applicationId;

    let r = await api(`/api/v1/admin/applications/${id}/schedule-interview`, {
      method: 'POST',
      headers: bearer(tok),
      body: { interviewAt: '2026-07-01T10:00:00Z' },
    });
    assert.equal(r.status, 200);

    r = await api(`/api/v1/admin/applications/${id}/approve`, { method: 'POST', headers: bearer(tok) });
    assert.equal(r.status, 200);

    r = await api(`/api/v1/admin/applications/${id}/provision`, { method: 'POST', headers: bearer(tok) });
    assert.equal(r.status, 200);
    const prov = await r.json();
    assert.ok(prov.memberId);

    const members = await (await api('/api/v1/admin/members', { headers: bearer(tok) })).json();
    const found = members.items.find((m) => m.memberId === prov.memberId);
    assert.ok(found, 'provisioned member appears in members list');
    assert.equal(found.status, 'ACTIVE');
  });

  test('self-serve: applying to fund a seat -> DONATION_REQUIRED (no interview)', async () => {
    const { res, body } = await createApplication({ accessChoice: 'supporter' });
    assert.equal(res.status, 201);
    assert.equal(body.status, 'DONATION_REQUIRED');
    assert.equal(body.accessBasis, 'supporter');
    assert.ok(body.donateUrl, 'returns a donate link-out');
  });

  test('self-serve: donating auto-grants ACTIVE access with NO admin token', async () => {
    const { body: app } = await createApplication({ accessChoice: 'supporter' });

    // Note: no Authorization header — this is purely self-serve, no admin involved.
    const r = await api(`/api/v1/applications/${app.applicationId}/donate`, {
      method: 'POST',
      body: { zeffyPaymentId: 'zf_http_1' },
    });
    assert.equal(r.status, 201);
    const j = await r.json();
    assert.equal(j.status, 'ACTIVE');
    assert.equal(j.accessBasis, 'supporter');
    assert.ok(j.memberId);

    // It really is an ACTIVE supporter member, visible to the admin.
    const tok = await adminToken();
    const members = await (await api('/api/v1/admin/members', { headers: bearer(tok) })).json();
    const found = members.items.find((m) => m.memberId === j.memberId);
    assert.ok(found, 'self-serve member appears in the members list');
    assert.equal(found.status, 'ACTIVE');
    assert.equal(found.accessBasis, 'supporter');
  });

  test('self-serve: issued credential logs in and reaches the gated student app', async () => {
    const { body: app } = await createApplication({ accessChoice: 'supporter' });
    const grant = await (
      await api(`/api/v1/applications/${app.applicationId}/donate`, { method: 'POST', body: {} })
    ).json();
    assert.ok(grant.demoLogin?.tempPassword, 'donate returns a demo welcome credential');

    // Log in as the freshly self-provisioned supporter (no admin involved anywhere).
    const login = await (
      await api('/api/v1/auth/login', {
        method: 'POST',
        body: { email: grant.demoLogin.email, password: grant.demoLogin.tempPassword },
      })
    ).json();
    assert.ok(login.token);
    assert.equal(login.user.role, 'student');

    // Reach the access-gated student app with that token.
    const r = await api('/api/v1/app/path', { headers: bearer(login.token) });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).pathKey, 'B_fast_track');
  });

  test('self-serve: double donate is idempotent (exactly one member)', async () => {
    const { body: app } = await createApplication({ accessChoice: 'supporter' });
    const first = await (
      await api(`/api/v1/applications/${app.applicationId}/donate`, { method: 'POST', body: {} })
    ).json();
    const second = await (
      await api(`/api/v1/applications/${app.applicationId}/donate`, { method: 'POST', body: {} })
    ).json();
    assert.equal(first.memberId, second.memberId);
    assert.equal(second.alreadyProvisioned, true);
  });

  test('invalid transition over HTTP -> 409 (approve a SUBMITTED app)', async () => {
    const tok = await adminToken();
    const { body: app } = await createApplication();
    const r = await api(`/api/v1/admin/applications/${app.applicationId}/approve`, {
      method: 'POST',
      headers: bearer(tok),
    });
    assert.equal(r.status, 409);
  });

  test('idempotent provision over HTTP: second call is a no-op', async () => {
    const tok = await adminToken();
    const { body: app } = await createApplication();
    const id = app.applicationId;
    await api(`/api/v1/admin/applications/${id}/schedule-interview`, { method: 'POST', headers: bearer(tok), body: {} });
    await api(`/api/v1/admin/applications/${id}/approve`, { method: 'POST', headers: bearer(tok) });
    const first = await (await api(`/api/v1/admin/applications/${id}/provision`, { method: 'POST', headers: bearer(tok) })).json();
    const second = await (await api(`/api/v1/admin/applications/${id}/provision`, { method: 'POST', headers: bearer(tok) })).json();
    assert.equal(second.alreadyProvisioned, true);
    assert.equal(first.memberId, second.memberId);
  });

  test('revoke member, then second revoke -> 409', async () => {
    const tok = await adminToken();
    const { body: app } = await createApplication();
    const id = app.applicationId;
    await api(`/api/v1/admin/applications/${id}/schedule-interview`, { method: 'POST', headers: bearer(tok), body: {} });
    await api(`/api/v1/admin/applications/${id}/approve`, { method: 'POST', headers: bearer(tok) });
    const { memberId } = await (await api(`/api/v1/admin/applications/${id}/provision`, { method: 'POST', headers: bearer(tok) })).json();

    let r = await api(`/api/v1/admin/members/${memberId}/revoke`, { method: 'POST', headers: bearer(tok), body: { reasonCode: 'TEST' } });
    assert.equal(r.status, 200);
    r = await api(`/api/v1/admin/members/${memberId}/revoke`, { method: 'POST', headers: bearer(tok) });
    assert.equal(r.status, 409);
  });

  test('admin can inspect member learning progress', async () => {
    const tok = await adminToken();
    const { body: app } = await createApplication();
    const id = app.applicationId;
    await api(`/api/v1/admin/applications/${id}/schedule-interview`, { method: 'POST', headers: bearer(tok), body: {} });
    await api(`/api/v1/admin/applications/${id}/approve`, { method: 'POST', headers: bearer(tok) });
    const { memberId } = await (await api(`/api/v1/admin/applications/${id}/provision`, { method: 'POST', headers: bearer(tok) })).json();

    const r = await api(`/api/v1/admin/members/${memberId}/progress`, { headers: bearer(tok) });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.member.memberId, memberId);
    assert.equal(j.path.pathKey, 'B_fast_track');
    assert.equal(j.path.stageUnits.length, 28);
    assert.equal(j.path.activeStage.stageKey, 'wk1-day1');
  });

  test('admin can unlock, lock, and restore automatic gating for a milestone', async () => {
    const tok = await adminToken();
    const { body: app } = await createApplication();
    const id = app.applicationId;
    await api(`/api/v1/admin/applications/${id}/schedule-interview`, { method: 'POST', headers: bearer(tok), body: {} });
    await api(`/api/v1/admin/applications/${id}/approve`, { method: 'POST', headers: bearer(tok) });
    const { memberId } = await (await api(`/api/v1/admin/applications/${id}/provision`, { method: 'POST', headers: bearer(tok) })).json();

    let r = await api(`/api/v1/admin/members/${memberId}/stages/wk1-day3/unlocked`, { method: 'POST', headers: bearer(tok) });
    assert.equal(r.status, 200);
    let j = await r.json();
    let day3 = j.path.stageUnits.find((s) => s.stageKey === 'wk1-day3');
    assert.equal(day3.state, 'active');
    assert.equal(day3.lockOverride, 'unlocked');

    r = await api(`/api/v1/admin/members/${memberId}/stages/wk1-day3/locked`, { method: 'POST', headers: bearer(tok) });
    assert.equal(r.status, 200);
    j = await r.json();
    day3 = j.path.stageUnits.find((s) => s.stageKey === 'wk1-day3');
    assert.equal(day3.state, 'locked');
    assert.equal(day3.lockOverride, 'locked');

    r = await api(`/api/v1/admin/members/${memberId}/stages/wk1-day3/auto`, { method: 'POST', headers: bearer(tok) });
    assert.equal(r.status, 200);
    j = await r.json();
    day3 = j.path.stageUnits.find((s) => s.stageKey === 'wk1-day3');
    assert.equal(day3.state, 'locked');
    assert.equal(day3.lockOverride, null);
  });
});
