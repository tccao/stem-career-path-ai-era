# V3 Security Verification Walkthrough

Rev. 2 — 2026-06-29. This is the authoritative install, local-emulator, test, and
pre-production security gate for V3. It replaces the old Spark/functions-free test path.

## 1. Security baseline

V3 is a Firebase Blaze application with a static Amplify frontend. Browsers are read-only in
Firestore. Every mutation goes through a 2nd-generation callable in `backend/sync-fn/`.
Production callables enforce Firebase App Check; staff callables additionally require a current
owner/admin token whose account has a confirmed TOTP factor.

| control | required behavior | authoritative implementation |
| --- | --- | --- |
| browser writes | deny every application/member/progress/lock/settings/audit write | backend/firestore.rules |
| curriculum | no public curriculum.json; return only to active student or MFA staff | getCurriculum/getStudentDashboard |
| stage gate | known stage + sequential predecessor + admin lock checked transactionally | src/student.js submitStage |
| grant | idempotent provisioning reservation; never overwrite staff; claims activated only with member state | src/lifecycle.js grantAccess |
| supporter access | settled non-refunded Zeffy payment bound to the same applicant email | src/integrations.js confirmDonation |
| refund | verified supporter session revoked when sync sees refund/dispute | src/integrations.js syncDonations |
| revocation | sessionVersion metadata invalidates the already-issued token immediately | revocations/{uid} + security.js + Rules |
| reactivation | admin/owner may re-enable a disabled student; owner may re-enable disabled staff | enableAccount + admin member/account views |
| access restoration | expired enabled member remains ENDED until extendAccess atomically restores ACTIVE state and matching claims | extendAccess + admin/extend.mjs |
| final staff-role removal | active unexpired returning member demoted from admin regains student claims while the prior staff token is revoked | setRole + listAccounts memberStatus |
| staff MFA | TOTP enrollment confirmed by Admin SDK; mfaEnrolled claim required | confirmMfaEnrollment + security.js + Rules |
| App Check | enforceAppCheck=true outside the Functions emulator | src/config.js |
| lockdown | deny non-owner sensitive reads and calls; owner recovery remains available | firestore.rules + security.js |
| intake | COPPA/guardian validation + strict schema + per-uid limit + per-email dedupe | submitApplication |
| settings | owner only; HTTPS host allowlists for zeffy.com and cal.com | updateSettings |
| audit | Firestore append-only to clients + structured Cloud Logging copy with actor IDs | audit.js |
| retention | TTL on applications/members/rate limits/intake/revocations | firestore.indexes.json |
| browser storage | session Auth persistence + memory-only Firestore cache | frontend/src/firebase.js |
| browser hardening | CSP/HSTS/nosniff/frame/referrer/permissions headers | repo-root customHttp.yml |
| dependency gate | zero npm advisories at moderate-or-higher severity | all three package-lock.json files |
| break glass | real Admin-SDK mutations require explicit phrase + operator uid | admin-cli/lib/admin.mjs |

## 2. Test tools and installation

| tool/library | purpose | version/source |
| --- | --- | --- |
| Node.js | runtime + built-in node:test assertions | 22.x production baseline |
| Java | Firestore/Auth emulator runtime | 21 |
| Firebase CLI | Auth/Firestore/Functions emulators + deploy | 15.22.2 |
| @firebase/rules-unit-testing | Rules allow/deny tests | 5.0.1 locked in admin-cli |
| Firebase Web SDK | real client auth/callable behavior against emulators | 12.15.0 locked |
| Firebase Admin SDK | test seeding + privileged assertions | 13.10.0 Functions / 14.1.0 CLI locked |
| Vite | production multi-page build | 8.1.0 locked |
| Zod | server input schemas | 4.4.3 locked |
| npm audit | known dependency advisory gate | npm bundled with Node 22 |
| Gitleaks | Git history secret scan | v8.30.1 locally / pinned v2 action in CI |
| curl | read-only live header and endpoint checks | OS package |

Install the runtimes on Ubuntu/WSL:

```bash
nvm install 22
nvm use 22
sudo apt-get update
sudo apt-get install -y openjdk-21-jre curl
npm install --global firebase-tools@15.22.2
```

Install only the dependencies pinned by the repository:

```bash
npm ci --prefix v3/frontend
npm ci --prefix v3/backend/sync-fn
npm ci --prefix v3/backend/admin-cli
```

Optional local Gitleaks installation:

```bash
go install github.com/gitleaks/gitleaks/v8@v8.30.1
gitleaks detect --source . --redact --no-banner
```

CI uses the commit-pinned Gitleaks action and the same locked npm/Firebase commands in
`.github/workflows/v3-security.yml`.

If the Gitleaks action fails on a GitHub API rate-limit or a misleading license lookup without
reporting a leak, inspect the job log and rerun the failed job. Do not disable the scan or change
source code merely to mask an external API failure; a clean rerun is still required.

## 3. Safe local configuration

Never point the automated suite at production. Do not set `GOOGLE_APPLICATION_CREDENTIALS` for
emulator tests. The Firebase CLI injects the emulator hosts automatically.

Create `v3/frontend/.env` from `.env.example`. Public Firebase identifiers may be fake when all
services use emulators:

```bash
cd v3/frontend
cp .env.example .env
```

Set these local values:

```dotenv
VITE_FB_API_KEY=fake-local-api-key
VITE_FB_AUTH_DOMAIN=localhost
VITE_FB_PROJECT_ID=code4good-stem-career-path
VITE_FB_STORAGE_BUCKET=unused.local
VITE_FB_APP_ID=fake-local-app-id
VITE_FB_FUNCTIONS_REGION=us-central1
VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=unused-in-emulator
VITE_USE_EMULATORS=true
```

`VITE_USE_EMULATORS=true` connects the frontend to ports 9099, 8080, and 5001. Functions disable
App Check only when `FUNCTIONS_EMULATOR=true`; deployed code always requires App Check.

## 4. Automated local verification

Run every gate from the repo root. A command is successful only when it exits `0`.

When invoking WSL through PowerShell, Git Bash, or another non-Linux shell, force Linux temp paths
before starting Firebase emulators. An inherited `/mnt/c/...` temp directory cannot host the Unix
socket used by the Functions emulator:

```bash
export TMPDIR=/tmp TMP=/tmp TEMP=/tmp
```

### 4.1 Dependency, syntax, and build gates

```bash
npm audit --prefix v3/frontend --audit-level=moderate
npm audit --prefix v3/backend/sync-fn --audit-level=moderate
npm audit --prefix v3/backend/admin-cli --audit-level=moderate
find v3/backend/sync-fn/src -type f -name '*.js' -exec node --check {} \;
find v3/backend/admin-cli -path '*/node_modules' -prune -o -type f -name '*.mjs' -exec node --check {} \;
npm --prefix v3/backend/admin-cli run test:cli-safety
cd v3/frontend && npm run build && npm run test:security
```

Success criteria:

| gate | pass baseline |
| --- | --- |
| npm audit | 0 moderate/high/critical vulnerabilities in all three lockfiles |
| syntax | every source exits 0 |
| CLI fail-closed | 2 safety tests pass; partial or remote emulator configuration is rejected |
| Vite build | three HTML entries and hashed JS/CSS emitted |
| public curriculum | dist/curriculum.json does not exist |
| inline execution | no executable inline script and no on* HTML handler |
| legacy credentials | no demo1234 or mock-dashboard route in built HTML |
| security headers | customHttp.yml includes CSP HSTS nosniff referrer permissions COOP |
| CSP | script-src self without unsafe-inline |
| JavaScript transfer | total Brotli-compressed JS &lt;= 220000 bytes |
| logo | size &lt;= 300000 bytes |

### 4.2 Firestore Rules tests

```bash
cd v3/backend
DEBUG= firebase emulators:exec --only firestore \
  'cd admin-cli && npm run test:rules'
```

Success baseline: 5 tests pass, 0 fail. The matrix proves public-settings-only anonymous reads,
deny-all browser writes, no direct student record access, mandatory staff MFA/current-session checks,
and full non-owner lockdown.

### 4.3 Callable security tests

The suite starts a local HTTP Zeffy double on port 7777. The Functions emulator is explicitly told
to use it; production code ignores this override.

```bash
cd v3/backend
DEBUG= \
ZEFFY_API_KEY=test-key \
ZEFFY_API_BASE_URL=http://127.0.0.1:7777 \
firebase emulators:exec --only auth,firestore,functions \
  'cd admin-cli && npm run test:security'
```

Success criteria:

| test | required result |
| --- | --- |
| COPPA and dedupe | under-13 denied; valid intake accepted; duplicate email denied |
| grant | defaults to 365 days; idempotent retry returns same uid and active member |
| concurrent grant | matching calls converge on one Auth user; conflicting duration is rejected |
| staff collision | application using owner email is denied and owner claim remains owner |
| student dashboard | active member receives both tracks through callable |
| stage sequencing | insecure proof denied; day 2 denied before day 1; valid day 1 proof unlocks day 2; day 28 remains denied |
| admin lock | locked day denied; explicit unlock permits the intended override |
| supporter bypass | beneficiary grant callable rejects supporter application |
| payment verification | settled matching-email Zeffy payment grants supporter |
| refund | reversed payment revokes the already-issued supporter session |
| staff MFA | staff token without confirmed MFA is denied |
| reactivation | admin may reactivate students; only owner may reactivate disabled staff |
| settings | admin denied; evil host denied; owner allowed for approved hosts |
| disable/enable | old token denied immediately; expired re-enabled member can be extended and member/claim agree on ACTIVE |
| revoke | already-issued student token denied immediately |
| lockdown | admin/student calls denied; owner can lift lockdown |
| role removal | already-issued admin token denied immediately; an active member demoted from staff regains exact student claims |
| audit | access.granted event includes actorId |

Required baseline: 15 tests pass, 0 fail, and no duplicate account/member is created.

### 4.4 Break-glass CLI regression

```bash
cd v3/backend
DEBUG= firebase emulators:exec --only firestore,auth \
  'cd admin-cli && npm run test:flow'
```

Success baseline: `ALL_PASS`, including the idempotent second grant, one-user-only assertion, and
restoration of an ENDED member with matching Firestore/Auth access expiry.

## 5. Manual local application verification

Start the backend in terminal 1:

```bash
cd v3/backend
DEBUG= firebase emulators:start --only auth,firestore,functions
```

Seed a local owner in terminal 2. Emulator claims include `testMfa`; this bypass exists only when
the Functions emulator is active:

```bash
cd v3/backend
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
node admin-cli/make-owner.mjs owner@example.test
```

Start the frontend in terminal 3:

```bash
cd v3/frontend
npm run dev
```

Manual checklist:

| step | expected |
| --- | --- |
| landing submit | valid adult/consented minor creates SUBMITTED; under-13 and duplicate are rejected |
| Auth Emulator UI | email-link appears locally; no real email is sent |
| admin login | local owner reaches admin console without production TOTP service |
| grant | application becomes GRANTED and member becomes ACTIVE |
| student login | dashboard loads curriculum through getStudentDashboard; no curriculum.json network request |
| future stage | submission fails until prior stage or explicit admin unlock |
| lock | locked stage submission fails even with a handcrafted request |
| revoke | open student tab loses callable access without waiting for token expiry |
| lockdown | admin/student reads and calls fail; owner can lift lockdown |
| browser storage | closing the tab removes Auth session; Firestore records are absent from IndexedDB |

Use browser DevTools Network to confirm all callable requests target `127.0.0.1:5001` and all
Firestore/Auth traffic targets the emulator ports. Any request to a production Google endpoint is a
test failure.

## 6. Production configuration gate

These controls are external state and must be verified before deployment.

### 6.1 Credential hygiene

- Treat an OAuth bearer token printed by an Admin SDK/CLI error as exposed; redact logs and allow the
  short-lived token to expire or revoke the issuing credential/session when exposure scope is unclear.
- If a service-account JSON was attached, copied into an untrusted location, or otherwise shared,
  delete/rotate that service-account key and install a replacement.
- Keep service-account JSON outside the repository, for example
  `$HOME/.config/cfg-v3/firebase-admin.json`, mode `0600`.
- Prefer Application Default Credentials or workload identity over a long-lived JSON key.
- Run Gitleaks over full history and require a clean CI result.
- Never run Firebase CLI with verbose/debug output while unrelated secrets are present in its environment.

### 6.2 Identity Platform and TOTP

Run from `v3/backend` with an external credential path. This is an irreversible privileged setup and
therefore requires the break-glass phrase and an attributable operator uid:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/cfg-v3/firebase-admin.json"
export CFG_BREAK_GLASS=I_UNDERSTAND_PRODUCTION_BYPASS
export CFG_OPERATOR_ID='<owner-firebase-uid>'
node admin-cli/configure-auth-security.mjs
```

Expected output: `mfaState=ENABLED` and `improvedEmailPrivacy=true`. Bootstrap the first owner with
`CFG_OWNER_BOOTSTRAP=I_UNDERSTAND_ROOT_ACCESS`, then sign in and complete the TOTP enrollment flow.
Do not assign a second production owner/admin until the first owner has successfully reauthenticated
with TOTP.

```bash
export CFG_OWNER_BOOTSTRAP=I_UNDERSTAND_ROOT_ACCESS
node admin-cli/make-owner.mjs 'actual-owner@example.org'
```

For Microsoft Authenticator manual enrollment, add an **Other account** and enter the generated
secret key, not the entire `otpauth://` URI. Keep phone/computer time automatic and use a fresh code
near the start of its 30-second window. MFA confirmation rotates the session, so finish by requesting
a new email link and signing in with TOTP.

Operational error map:

| error | meaning and required action |
| --- | --- |
| `auth/invalid-email` in make-owner | a placeholder such as `OWNER_EMAIL` was passed; rerun with the actual email |
| `app/invalid-credential` / `ENOENT` | `GOOGLE_APPLICATION_CREDENTIALS` points to no file; install the JSON outside the repo and use its WSL path |
| `auth/operation-not-allowed` | Auth has not been upgraded to Identity Platform or TOTP is not enabled there |
| `auth/invalid-verification-code` | TOTP secret, device time, or 30-second code does not match; synchronize time or restart enrollment |
| `permission-denied` after role/MFA change | the old session was intentionally revoked; sign out and use a new email link plus TOTP |

### 6.3 Firebase App Check

1. Register the web app with reCAPTCHA Enterprise in Firebase App Check.
2. Add the public site key as `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` in Amplify.
3. Monitor App Check metrics before enforcement.
4. Enforce App Check for Authentication and Cloud Firestore in Firebase Console.
5. Callable enforcement is already code-enforced with `enforceAppCheck: true` outside emulators.
6. Never register `localhost` as a production reCAPTCHA domain; use Firebase debug tokens locally if
   production-service integration testing is explicitly required.
7. Keep both `https://firebaseappcheck.googleapis.com` and
   `https://content-firebaseappcheck.googleapis.com` in the Amplify CSP `connect-src` list. A blocked
   token exchange commonly surfaces as `functions/unauthenticated` even when Firebase Auth succeeded.

### 6.4 Access and role recovery

- **Enable is not extend:** re-enabling an expired account restores sign-in but correctly leaves its
  member `ENDED`. Use **Restore access** afterward to create a future window.
- `extendAccess` clears `endedReason`, `endedAt`, and `expiresAt`, writes ACTIVE state and audit in the
  transaction, then synchronizes Auth claims.
- Supporter restoration requires a current verified succeeded payment without refund, dispute, or
  processed revocation.
- Every admin/owner role change invalidates the existing staff token. When an admin is changed to no
  staff role and has an ACTIVE unexpired member record, its student role, basis, and expiry are
  restored; the user must sign in again. Owner-to-admin remains a staff role.

### 6.5 Secrets, origins, recovery, and budget

```bash
cd v3/backend
firebase functions:secrets:set ZEFFY_API_KEY
firebase functions:secrets:set CAL_API_KEY
```

Set `APP_ORIGINS` for the Functions deployment to the exact Amplify/custom origins. Do not use `*`.
Enable Firestore PITR, set a billing budget/anomaly alert, and verify the TTL policies from
`firestore.indexes.json` are active after index deployment.

### 6.6 Locked audit retention

Firestore `auditLog` is an operational index; the structured `securityAudit` copies in Cloud Logging
are the tamper-resistant record. Create and test the sink before locking the bucket—locking is
irreversible:

```bash
PROJECT_ID=code4good-stem-career-path
gcloud logging buckets create cfg-security-audit \
  --project="$PROJECT_ID" --location=global --retention-days=365
gcloud logging sinks create cfg-security-audit-sink \
  "logging.googleapis.com/projects/$PROJECT_ID/locations/global/buckets/cfg-security-audit" \
  --project="$PROJECT_ID" --log-filter='jsonPayload.securityAudit:*'
gcloud logging buckets describe cfg-security-audit --project="$PROJECT_ID" --location=global
# Only after a test audit entry appears in the bucket:
gcloud logging buckets update cfg-security-audit \
  --project="$PROJECT_ID" --location=global --locked
```

Success: retention is 365 days, `locked: true`, test events are queryable, and maintainers do not hold
permission to alter the sink/bucket policy.

## 7. Deployment order

Use a maintenance window and the owner lockdown control to avoid mixing old clients with new rules.

1. Run every local gate in §4 on the exact commit.
2. Enable owner lockdown.
3. Deploy Functions and indexes first:

   ```bash
   cd v3/backend
   firebase deploy --only functions:sync,firestore:indexes
   ```

4. Confirm all callable deployments are healthy and secrets are attached.
5. Deploy the Amplify frontend with `npm run build:production`. The production preflight fails if the
   App Check key or Firebase identifiers are missing, or if emulator mode is enabled.
6. Deploy restrictive Rules:

   ```bash
   cd v3/backend
   firebase deploy --only firestore:rules
   ```

7. Run the read-only live smoke test in §8.
8. Lift lockdown only after owner TOTP login, student login, grant, stage submit, revoke, and audit-log
   checks pass using designated non-production test accounts.

## 8. Read-only live verification

Never run emulator mutation suites against production. Use the read-only smoke script:

```bash
cd v3/frontend
V3_LIVE_URL='https://your-amplify-or-custom-domain' \
V3_FUNCTION_BASE='https://us-central1-code4good-stem-career-path.cloudfunctions.net' \
npm run verify:live
```

`LIVE_SECURITY_SMOKE_PASS` requires:

| check | success |
| --- | --- |
| public pages | HTTP 200 without redirects |
| security headers | HSTS CSP nosniff referrer permissions COOP present |
| HTML caching | no-store/no-cache and s-maxage=0 |
| private curriculum | /curriculum.json returns 404 |
| hashed assets | Cache-Control includes immutable |
| callable deployment | dashboard, stage submission, access extension, and enable endpoints exist and deny unauthenticated probes |
| production writes | none performed by this script |

Also verify in Firebase Console that App Check shows valid traffic, rejected-unverified traffic is
non-zero during the negative probe, TTL/PITR are enabled, staff accounts have TOTP factors, and no
unexpected function instance/cost spike occurred.

## 9. Release decision

Deployment is blocked if any required test fails, npm reports any moderate/high/critical advisory,
the curriculum is publicly retrievable, an admin without TOTP can read/call, an old token works after
revoke/demotion, App Check is unenforced, the audit bucket is unlocked, or the live headers/cache
baseline differs from §8. Record the command output and commit SHA with the release ticket.
