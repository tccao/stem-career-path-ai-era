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

  test('fast-track student sees 4 weeks / 28 days; day 1 active, later days locked', async () => {
    const { token } = await makeStudent('fast_track');
    const r = await api('/api/v1/app/path', { token });
    assert.equal(r.status, 200);
    const view = await r.json();
    assert.equal(view.pathKey, 'B_fast_track');
    assert.equal(view.stages.length, 4);
    assert.equal(view.stageUnits.length, 28);
    assert.equal(view.stages[0].state, 'active');
    assert.equal(view.stages[1].state, 'locked');
    assert.equal(view.stages[0].days[0].stageKey, 'wk1-day1');
    assert.equal(view.stages[0].days[0].title, 'Day 1 - Token Mechanics');
    assert.equal(view.stages[0].days[0].state, 'active');
    assert.equal(view.stages[0].days[1].state, 'locked');
    assert.equal(view.activeStage.stageKey, 'wk1-day1');
    assert.equal(view.progressPct, 0);
  });

  test('full-roadmap student sees 8 pillars', async () => {
    const { token } = await makeStudent('full_roadmap');
    const view = await (await api('/api/v1/app/path', { token })).json();
    assert.equal(view.pathKey, 'A_full_roadmap');
    assert.equal(view.stages.length, 8);
  });

  test('submitting the active fast-track day completes it and unlocks the next day', async () => {
    const { token } = await makeStudent('fast_track');
    const r = await api('/api/v1/app/stages/wk1-day1/submit', {
      method: 'POST',
      token,
      body: { deliverableUrl: 'https://github.com/me/day1' },
    });
    assert.equal(r.status, 200);
    const view = await r.json();
    assert.equal(view.stages[0].state, 'active');
    assert.equal(view.stages[0].days[0].state, 'complete');
    assert.equal(view.stages[0].days[0].deliverableUrl, 'https://github.com/me/day1');
    assert.equal(view.stages[0].days[1].state, 'active'); // next day unlocked
    assert.equal(view.activeStage.stageKey, 'wk1-day2');
    assert.equal(view.progressPct, 4);
  });

  test('submitting accepts a bare domain and stores a normalized URL', async () => {
    const { token } = await makeStudent('fast_track');
    const r = await api('/api/v1/app/stages/wk1-day1/submit', {
      method: 'POST',
      token,
      body: { deliverableUrl: 'test.com/' },
    });
    assert.equal(r.status, 200);
    const view = await r.json();
    assert.equal(view.stages[0].days[0].deliverableUrl, 'https://test.com/');
  });

  test('task ticks persist to the DB and come back on the next path read', async () => {
    const { token } = await makeStudent('full_roadmap');
    const save = await api('/api/v1/app/stages/pillar1/tasks', { method: 'PUT', token, body: { checked: [0, 2] } });
    assert.equal(save.status, 200);
    const view = await save.json();
    assert.deepEqual(view.stages[0].checkedTasks, [0, 2]);
    // a fresh read returns the persisted ticks (proves it is in the database, not just the response)
    const reread = await (await api('/api/v1/app/path', { token })).json();
    assert.deepEqual(reread.stages[0].checkedTasks, [0, 2]);
  });

  test('task ticks are sanitized: out-of-range/duplicate indices are dropped, ticking does not complete the stage', async () => {
    const { token } = await makeStudent('full_roadmap');
    const view = await (await api('/api/v1/app/stages/pillar1/tasks', { method: 'PUT', token, body: { checked: [1, 1, -3, 9999, 'x'] } })).json();
    assert.deepEqual(view.stages[0].checkedTasks, [1]);
    assert.equal(view.stages[0].state, 'active'); // still active — ticking is not submitting
    assert.equal(view.progressPct, 0);
  });

  test('saving ticks on a locked stage -> 403 stage_locked (server-side gate)', async () => {
    const { token } = await makeStudent('full_roadmap');
    const r = await api('/api/v1/app/stages/pillar3/tasks', { method: 'PUT', token, body: { checked: [0] } });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error, 'stage_locked');
  });

  test('submitting a locked stage -> 403 stage_locked (server-side gate)', async () => {
    const { token } = await makeStudent('fast_track');
    const r = await api('/api/v1/app/stages/wk1-day3/submit', {
      method: 'POST',
      token,
      body: { deliverableUrl: 'https://github.com/me/day3' },
    });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error, 'stage_locked');
  });

  test('submit without a valid URL -> 400', async () => {
    const { token } = await makeStudent('fast_track');
    const r = await api('/api/v1/app/stages/wk1-day1/submit', { method: 'POST', token, body: { deliverableUrl: 'nope' } });
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
