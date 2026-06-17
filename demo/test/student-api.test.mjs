// Student app API — auth/role/access guards, path assembly, and server-side stage gating.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { freshTables } from './_setup.mjs';
import { createApp } from '../src/app.mjs';
import { seedAdmin, ADMIN } from '../scripts/seed.mjs';
import { seedCurriculum } from '../scripts/seed-curriculum.mjs';
import { createToken } from '../src/services/auth.mjs';
import * as lc from '../src/services/lifecycle.mjs';
import * as membersRepo from '../src/repositories/members.mjs';

let server;
let base;

// Provision a fresh ACTIVE student on the chosen track and return a token for them.
async function makeStudent(track = 'fast_track') {
  const app = await lc.submitApplication({
    email: `stu-${Math.random().toString(36).slice(2)}@cfg.org`,
    fullName: 'Student Tester',
    preferredTrack: track,
    ageBracket: '18+',
  });
  await lc.scheduleInterview(app.applicationId, { actorId: ADMIN.memberId, interviewAt: 't' });
  await lc.approveBeneficiary(app.applicationId, { actorId: ADMIN.memberId });
  const { memberId } = await lc.provision(app.applicationId, { actorId: ADMIN.memberId });
  return { memberId, token: createToken({ sub: memberId, email: app.email, role: 'student' }) };
}

before(async () => {
  await freshTables();
  await seedAdmin();
  await seedCurriculum();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

const api = (path, { method = 'GET', token, body } = {}) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

describe('Student app API', () => {
  test('no token -> 401', async () => {
    assert.equal((await api('/api/v1/app/path')).status, 401);
  });

  test('admin token on student route -> 403 wrong_role', async () => {
    const adminTok = createToken({ sub: ADMIN.memberId, email: ADMIN.email, role: 'admin' });
    const r = await api('/api/v1/app/path', { token: adminTok });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).reason, 'wrong_role');
  });

  test('fast-track student sees 4 weeks; first active, rest locked', async () => {
    const { token } = await makeStudent('fast_track');
    const r = await api('/api/v1/app/path', { token });
    assert.equal(r.status, 200);
    const view = await r.json();
    assert.equal(view.pathKey, 'B_fast_track');
    assert.equal(view.stages.length, 4);
    assert.equal(view.stages[0].state, 'active');
    assert.equal(view.stages[1].state, 'locked');
    assert.equal(view.progressPct, 0);
  });

  test('full-roadmap student sees 8 pillars', async () => {
    const { token } = await makeStudent('full_roadmap');
    const view = await (await api('/api/v1/app/path', { token })).json();
    assert.equal(view.pathKey, 'A_full_roadmap');
    assert.equal(view.stages.length, 8);
  });

  test('submitting the active stage completes it and unlocks the next', async () => {
    const { token } = await makeStudent('fast_track');
    const r = await api('/api/v1/app/stages/wk1/submit', {
      method: 'POST',
      token,
      body: { deliverableUrl: 'https://github.com/me/week1' },
    });
    assert.equal(r.status, 200);
    const view = await r.json();
    assert.equal(view.stages[0].state, 'complete');
    assert.equal(view.stages[0].deliverableUrl, 'https://github.com/me/week1');
    assert.equal(view.stages[1].state, 'active'); // next unlocked
    assert.equal(view.progressPct, 25);
  });

  test('submitting a locked stage -> 403 stage_locked (server-side gate)', async () => {
    const { token } = await makeStudent('fast_track');
    const r = await api('/api/v1/app/stages/wk3/submit', {
      method: 'POST',
      token,
      body: { deliverableUrl: 'https://github.com/me/week3' },
    });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error, 'stage_locked');
  });

  test('submit without a valid URL -> 400', async () => {
    const { token } = await makeStudent('fast_track');
    const r = await api('/api/v1/app/stages/wk1/submit', { method: 'POST', token, body: { deliverableUrl: 'nope' } });
    assert.equal(r.status, 400);
  });

  test('revoked member is blocked with 403 access_expired', async () => {
    const { memberId, token } = await makeStudent('fast_track');
    await lc.revokeMember(memberId, { actorId: ADMIN.memberId, reasonCode: 'TEST' });
    const r = await api('/api/v1/app/profile', { token });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error, 'access_expired');
  });

  test('expired window is blocked with 403 access_expired', async () => {
    const { memberId, token } = await makeStudent('fast_track');
    // force the window into the past
    await membersRepo.extendAccess(memberId, '2020-01-01T00:00:00.000Z');
    const r = await api('/api/v1/app/profile', { token });
    assert.equal(r.status, 403);
  });
});
