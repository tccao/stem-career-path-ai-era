import test from 'node:test';
import assert from 'node:assert/strict';
import { brotliCompressSync } from 'node:zlib';
import { access, readFile, readdir, stat } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const repoRoot = new URL('../../../', import.meta.url);

test('production build exposes no curriculum file', async () => {
  const files = await readdir(dist);
  assert.equal(files.includes('curriculum.json'), false);
});

test('obsolete production-mutation helpers are absent', async () => {
  for (const name of ['live-apply.mjs', 'live-student-read.mjs', 'send-signin-link.mjs']) {
    await assert.rejects(access(new URL(name, import.meta.url)));
  }
});

test('admin member controls expose access restoration for ended accounts', async () => {
  const source = await readFile(new URL('../src/admin/admin.js', import.meta.url), 'utf8');
  assert.match(source, /m\.status === 'ENDED'.*m\.endedReason !== 'payment_reversed'/s);
  assert.match(source, /m\.status === 'ACTIVE' \? 'Extend' : 'Restore access'/);
});

test('staff TOTP enrollment renders a local QR code with a manual-key fallback', async () => {
  const source = await readFile(new URL('../src/lib/auth.js', import.meta.url), 'utf8');
  assert.match(source, /import QRCode from 'qrcode'/);
  assert.match(source, /QRCode\.toCanvas\([^,]+, uri,/s);
  assert.match(source, /secret\.textContent = secretKey/);
  assert.doesNotMatch(source, /prompt\('Add this key or otpauth URI/);
});

test('HTML contains no inline executable JavaScript or inline event handlers', async () => {
  for (const file of ['index.html', 'app.html', 'admin.html']) {
    const html = await readFile(new URL(file, dist), 'utf8');
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${file} has inline script`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${file} has an inline event handler`);
    assert.doesNotMatch(html, /demo1234|mock-dashboard\.html/i, `${file} contains legacy demo credentials/routes`);
  }
});

test('Amplify headers establish the required browser security baseline', async () => {
  const yaml = await readFile(new URL('customHttp.yml', repoRoot), 'utf8');
  for (const header of [
    'Strict-Transport-Security', 'Content-Security-Policy', 'X-Content-Type-Options',
    'Referrer-Policy', 'Permissions-Policy', 'Cross-Origin-Opener-Policy',
  ]) assert.match(yaml, new RegExp(header));
  const csp = yaml.match(/value: "default-src[^\n]+/)?.[0] || '';
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(csp, /https:\/\/\*\.(?:googleapis\.com|cloudfunctions\.net)/);
  assert.match(csp, /https:\/\/us-central1-code4good-stem-career-path\.cloudfunctions\.net/);
  assert.match(csp, /https:\/\/content-firebaseappcheck\.googleapis\.com/);
  assert.match(yaml, /no-cache, no-store, must-revalidate/);
  assert.match(yaml, /max-age=31536000, immutable/);
});

test('compressed frontend baseline stays bounded', async () => {
  const assetNames = await readdir(new URL('assets/', dist));
  const jsAssets = assetNames.filter((name) => name.endsWith('.js'));
  let jsBrotliBytes = 0;
  for (const name of jsAssets) jsBrotliBytes += brotliCompressSync(await readFile(new URL(`assets/${name}`, dist))).length;
  assert.ok(jsBrotliBytes <= 220_000, `Brotli JS ${jsBrotliBytes} exceeds 220000-byte baseline`);
  assert.ok((await stat(new URL('codeforgood-logo.png', dist))).size <= 300_000, 'logo exceeds 300000-byte baseline');
});
