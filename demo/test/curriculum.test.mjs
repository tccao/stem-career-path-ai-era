// Phase 4 — real curriculum seeded into the DB and served via the API.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { freshTables } from './_setup.mjs';
import { createApp } from '../src/app.mjs';
import { seedCurriculum } from '../scripts/seed-curriculum.mjs';
import * as content from '../src/repositories/content.mjs';

let server;
let base;

before(async () => {
  await freshTables();
  await seedCurriculum();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server?.close());

const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('Phase 4 · curriculum content', () => {
  test('lists available paths', async () => {
    const { body } = await get('/api/v1/curriculum');
    assert.deepEqual(body.paths.sort(), ['A_full_roadmap', 'B_fast_track']);
  });

  test('full roadmap: 8 pillars with real milestones, ordered', async () => {
    const { status, body } = await get('/api/v1/curriculum/A_full_roadmap');
    assert.equal(status, 200);
    assert.equal(body.meta.title, 'Full Roadmap — 8 Pillars');
    assert.equal(body.stages.length, 8);
    assert.deepEqual(body.stages.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8]);
    // every pillar carries real extracted milestones
    for (const p of body.stages) assert.ok(p.milestones.length >= 3, `${p.title} has milestones`);
    // spot-check fidelity to the source PDF
    const p2 = body.stages.find((s) => s.n === 2);
    assert.ok(p2.milestones.join(' ').includes('Deployed'), 'Pillar 2 keeps the "Deployed" criterion');
  });

  test('fast track: 4 weeks / 28 days, day 1 is Token Mechanics', async () => {
    const { body } = await get('/api/v1/curriculum/B_fast_track');
    assert.equal(body.stages.length, 4);
    const totalDays = body.stages.reduce((s, w) => s + w.days.length, 0);
    assert.equal(totalDays, 28);
    const day1 = body.stages[0].days.find((d) => d.day === 1);
    assert.equal(day1.topic, 'Token Mechanics');
  });

  test('unknown path -> 404', async () => {
    const { status } = await get('/api/v1/curriculum/nope');
    assert.equal(status, 404);
  });

  test('content is keyed (pathKey, stageKey) to align with Progress/StageLocks', async () => {
    const pillar1 = await content.getStage('A_full_roadmap', 'pillar1');
    assert.equal(pillar1.kind, 'pillar');
    assert.ok(pillar1.milestones.length >= 3);
  });
});
