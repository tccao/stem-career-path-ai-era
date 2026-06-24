// Student SPA (public/app.html) end-to-end: the roadmap layout, hero-follows-selection,
// proof-of-work persistence (to the DB), sidebar navigation, and color-contrast of the
// roadmap/sidebar components. Runs the app in-process and drives it with puppeteer-core.
//
// Needs a local DynamoDB engine + AWS_ENDPOINT_URL (same as `npm test`). Run: `npm run test:e2e`.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { freshSeed, makeStudent, startServer, launchBrowser, openApp, colorContrastViolations } from './_support.mjs';

let server;
let base;
let browser;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COMPONENT_SELECTORS = ['#pathway', '.node', '.day-card', '#pathTree', '.milestones', '.acc.lvl2', '#heroTasks'];

before(async () => {
  await freshSeed();
  ({ server, base } = await startServer());
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  server?.close();
});

describe('Student SPA · roadmap', () => {
  test('clicking a subpillar features that pillar, highlights only its card, scrolls to the tasks', async () => {
    const { token } = await makeStudent('full_roadmap');
    const page = await openApp(browser, base, token);
    const active = await page.evaluate(() => document.querySelector('#pathway .node.current').dataset.stage);
    await page.evaluate((k) => document.querySelector(`#pathway .node[data-stage="${k}"] .day-card`).click(), active);
    await sleep(400);
    const s = await page.evaluate(() => ({
      hash: location.hash,
      selected: [...document.querySelectorAll('#pathway .node.selected')].map((n) => n.dataset.stage),
      eyebrow: document.querySelector('#continueWrap .eyebrow')?.textContent.trim(),
      tasksInView: (() => { const d = document.getElementById('stageDetail'); const r = d.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; })(),
    }));
    assert.equal(s.hash, '#stage=' + active);
    assert.deepEqual(s.selected, [active]); // exactly one card highlighted
    assert.match(s.eyebrow, /Your next move/);
    assert.ok(s.tasksInView);
    await page.close();
  });

  test('marking tasks advances the hero checklist, then prompts to submit; ticks persist to the DB across reload', async () => {
    const { token } = await makeStudent('full_roadmap');
    const page = await openApp(browser, base, token);
    const active = await page.evaluate(() => document.querySelector('#pathway .node.current').dataset.stage);
    await page.evaluate((k) => document.querySelector(`#pathway .node[data-stage="${k}"] .day-card`).click(), active);
    await sleep(400);

    const firstTask = await page.evaluate(() => document.querySelector('#heroTasks .chk span').textContent.trim());
    await page.evaluate(() => { const c = document.querySelector('#stageDetail .reqCheck'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(300);
    const advanced = await page.evaluate(() => document.querySelector('#heroTasks .chk span').textContent.trim());
    assert.notEqual(advanced, firstTask); // "what to complete" moved past the checked task

    await page.evaluate(() => document.querySelectorAll('#stageDetail .reqCheck').forEach((c) => { if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } }));
    await sleep(400);
    const allDone = await page.evaluate(() => document.querySelector('#heroTasks .chk span').textContent.trim());
    assert.match(allDone, /submit your proof/i);

    // reload — proves the ticks came back from the database, not the DOM
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('#pathway .node');
    await page.evaluate((k) => document.querySelector(`#pathway .node[data-stage="${k}"] .day-card`).click(), active);
    await sleep(400);
    const restored = await page.evaluate(() => [...document.querySelectorAll('#stageDetail .reqCheck')].every((c) => c.checked));
    assert.ok(restored, 'all ticks restored after reload (persisted in the Progress table)');
    await page.close();
  });

  test('sidebar sub-item navigates the main body to its pillar without filling every bullet', async () => {
    const { token } = await makeStudent('full_roadmap');
    const page = await openApp(browser, base, token);
    const active = await page.evaluate(() => document.querySelector('#pathway .node.current').dataset.stage);
    await page.evaluate((k) => document.querySelector(`#pathTree .acc.lvl2[data-stage-key="${k}"] .milestones li[data-nav]`).click(), active);
    await sleep(400);
    const s = await page.evaluate(() => ({
      hash: location.hash,
      selectedNodes: [...document.querySelectorAll('#pathway .node.selected')].map((n) => n.dataset.stage),
      selectedAcc: [...document.querySelectorAll('#pathTree .acc.lvl2.selected')].map((a) => a.dataset.stageKey),
      filledBullets: document.querySelectorAll('#pathTree .milestones li.selected').length,
    }));
    assert.equal(s.hash, '#stage=' + active);
    assert.deepEqual(s.selectedNodes, [active]);
    assert.deepEqual(s.selectedAcc, [active]);
    assert.equal(s.filledBullets, 0); // contrast fix preserved: bullets are never solid-filled
    await page.close();
  });

  test('roadmap pathway + sidebar components have no color-contrast violations (axe-core)', async () => {
    const { token } = await makeStudent('full_roadmap');
    const page = await openApp(browser, base, token);
    await page.evaluate(() => { const n = document.querySelector('#pathway .node.current') || document.querySelector('#pathway .node'); n.querySelector('.day-card')?.click(); });
    await sleep(300);
    const targets = await colorContrastViolations(page);
    const ours = targets.filter((t) => COMPONENT_SELECTORS.some((sel) => t.includes(sel)));
    assert.deepEqual(ours, [], `roadmap/sidebar must pass color-contrast; offending: ${ours.join(' | ')}`);
    await page.close();
  });
});
