// E2E support for the student SPA (public/app.html). Self-contained: starts the Express app
// in-process (createApp serves the static SPA), drives it with a headless browser via
// puppeteer-core, and runs axe-core for accessibility checks. No browser download — puppeteer-core
// reuses a system Chromium. Override the binary with CHROME_BIN; defaults to the snap path on this box.
//
// Like the backend suites, needs a local DynamoDB engine + AWS_ENDPOINT_URL set (see README "Testing").

import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';
import { createApp } from '../src/app.mjs';
import { freshTables } from '../test/_setup.mjs';
import { seedAdmin, ADMIN } from '../scripts/seed.mjs';
import { seedCurriculum } from '../scripts/seed-curriculum.mjs';
import { createToken } from '../src/services/auth.mjs';
import * as lc from '../src/services/lifecycle.mjs';

const AXE_PATH = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const CHROME_BIN = process.env.CHROME_BIN || '/snap/chromium/current/usr/lib/chromium-browser/chrome';

export async function freshSeed() {
  await freshTables();
  await seedAdmin();
  await seedCurriculum();
}

// Provision a fresh ACTIVE student on the chosen track; returns a usable JWT.
export async function makeStudent(track = 'full_roadmap') {
  const app = await lc.submitApplication({
    email: `e2e-${Math.random().toString(36).slice(2)}@cfg.org`,
    fullName: 'E2E Student',
    preferredTrack: track,
    ageBracket: '18+',
  });
  await lc.scheduleInterview(app.applicationId, { actorId: ADMIN.memberId, interviewAt: 't' });
  await lc.approveBeneficiary(app.applicationId, { actorId: ADMIN.memberId });
  const { memberId } = await lc.provision(app.applicationId, { actorId: ADMIN.memberId });
  return { memberId, email: app.email, token: createToken({ sub: memberId, email: app.email, role: 'student' }) };
}

export function startServer() {
  return new Promise((resolve) => {
    const server = createApp().listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

export function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROME_BIN,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
}

// Open the SPA already authenticated as `token` (injects the session JWT, then reloads to auto-boot).
export async function openApp(browser, base, token) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(`${base}/app.html`);
  await page.evaluate((t) => sessionStorage.setItem('cfg_student_token', t), token);
  await page.goto(`${base}/app.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#pathway .node', { timeout: 10000 });
  return page;
}

// Returns the CSS targets of any axe color-contrast violations on the current page.
export async function colorContrastViolations(page) {
  await page.addScriptTag({ path: AXE_PATH });
  const res = await page.evaluate(async () => window.axe.run(document, { runOnly: ['color-contrast'] }));
  return res.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')));
}
