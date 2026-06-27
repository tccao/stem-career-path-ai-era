// Call a DEPLOYED callable Cloud Function as a chosen account (default: an owner), to test the
// LIVE production gates end-to-end — exactly what the browser does, but from the terminal.
// Flow: service-account key → mint a custom token → exchange for an ID token (Identity Toolkit)
// → POST { data } to the function's HTTPS endpoint with Authorization: Bearer <idToken>.
//
//   GOOGLE_APPLICATION_CREDENTIALS=<key.json> FB_WEB_API_KEY=<public web apiKey> \
//     node call-fn.mjs <functionName> --as <email> [--data '<json>'] [--region us-central1]
//
// Examples:
//   node call-fn.mjs listAccounts  --as owner@example.com
//   node call-fn.mjs getInterview  --as owner@example.com --data '{"email":"applicant@x.com"}'
//   node call-fn.mjs setLockdown   --as owner@example.com --data '{"enabled":true,"reason":"drill"}'
//
// The web apiKey is PUBLIC (it ships in the frontend) — it is read from FB_WEB_API_KEY or, if unset,
// from v3/frontend/.env (VITE_FB_API_KEY). The service-account key stays local and is never sent.
import { readFileSync } from 'node:fs';
import { auth } from './lib/admin.mjs';

const argv = process.argv.slice(2);
const fn = argv[0];
const get = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
if (!fn || fn.startsWith('--')) {
  console.error("usage: node call-fn.mjs <functionName> --as <email> [--data '<json>'] [--region us-central1]");
  process.exit(1);
}
const asEmail = get('as', process.env.OWNER_EMAIL);
if (!asEmail) { console.error('provide --as <email> (the account to call as), or set OWNER_EMAIL'); process.exit(1); }
const region = get('region', 'us-central1');
const project = process.env.GCLOUD_PROJECT || 'code4good-stem-career-path';
let data;
try { data = JSON.parse(get('data', '{}')); } catch { console.error('--data must be valid JSON'); process.exit(1); }

let apiKey = process.env.FB_WEB_API_KEY;
if (!apiKey) {
  try { apiKey = readFileSync(new URL('../../frontend/.env', import.meta.url), 'utf8').match(/VITE_FB_API_KEY=(.+)/)?.[1]?.trim(); } catch { /* ignore */ }
}
if (!apiKey) { console.error('set FB_WEB_API_KEY (public web apiKey) or create v3/frontend/.env'); process.exit(1); }

const user = await auth.getUserByEmail(asEmail).catch(() => { console.error(`no user for ${asEmail}`); process.exit(1); });
const customToken = await auth.createCustomToken(user.uid);
const ex = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
});
const { idToken, error } = await ex.json();
if (!idToken) { console.error('token exchange failed:', JSON.stringify(error)); process.exit(1); }

const url = `https://${region}-${project}.cloudfunctions.net/${fn}`;
const r = await fetch(url, {
  method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data }),
});
const body = await r.json().catch(() => ({}));
console.log(`POST ${fn} as ${asEmail} (role: ${user.customClaims?.role ?? 'none'}) -> HTTP ${r.status}`);
console.log(JSON.stringify(body.result ?? body.error ?? body, null, 2));
process.exit(r.ok ? 0 : 1);
