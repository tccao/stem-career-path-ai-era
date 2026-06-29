// Read-only post-deploy smoke test. It never signs in and never calls a mutation.
const base = (process.env.V3_LIVE_URL || process.argv[2] || '').replace(/\/$/, '');
const functionBase = (process.env.V3_FUNCTION_BASE || '').replace(/\/$/, '');
if (!base || !functionBase) {
  console.error('Set V3_LIVE_URL and V3_FUNCTION_BASE (for example https://us-central1-PROJECT.cloudfunctions.net).');
  process.exit(1);
}

const requiredHeaders = [
  'strict-transport-security', 'content-security-policy', 'x-content-type-options',
  'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy',
];

for (const path of ['/', '/app.html', '/admin.html']) {
  const response = await fetch(`${base}${path}`, { redirect: 'error' });
  if (response.status !== 200) throw new Error(`${path}: expected 200, got ${response.status}`);
  for (const header of requiredHeaders) {
    if (!response.headers.get(header)) throw new Error(`${path}: missing ${header}`);
  }
  if (!/no-cache|no-store/.test(response.headers.get('cache-control') || '')) {
    throw new Error(`${path}: HTML cache-control is not deployment-safe`);
  }
}

const curriculum = await fetch(`${base}/curriculum.json`);
if (curriculum.status !== 404) throw new Error(`/curriculum.json must be unavailable; got ${curriculum.status}`);

const appHtml = await (await fetch(`${base}/app.html`)).text();
const assetPath = appHtml.match(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/)?.[1];
if (!assetPath) throw new Error('could not locate a hashed asset in app.html');
const asset = await fetch(`${base}${assetPath}`, { method: 'HEAD' });
if (!/immutable/.test(asset.headers.get('cache-control') || '')) throw new Error('hashed assets are not immutable-cached');

const denied = await fetch(`${functionBase}/getStudentDashboard`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ data: {} }),
});
if (denied.ok) throw new Error('unauthenticated getStudentDashboard unexpectedly succeeded');

console.log('LIVE_SECURITY_SMOKE_PASS');
