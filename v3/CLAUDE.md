# v3/CLAUDE.md — V3 hosted MVP (LIVE)

Guidance for AI agents working in `v3/`. Tables are CSV (token-lean). Read the linked
`docs/` only when a task needs that depth. Repo-wide execution + git rules are in the
**root `../CLAUDE.md`** (WSL UNC bridge, `gh` auth) — they apply here; this file does not repeat them.

## What V3 is

The shipped, **$0 / no-card** variant of V2. **AWS Amplify** hosts a static frontend;
**Firebase Spark** is the backend. Spark **cannot deploy Cloud Functions** and has **no
Cloud Storage** (new projects), so V3 is **Functions-free**: the trust boundary is **Firestore
Security Rules** (client-facing) plus a local **`firebase-admin` CLI** (privileged ops). Auth
is passwordless **email-link**. Deployed and end-to-end tested against the real project.

```csv
fact,value
live url,https://feat-v3-mvp.d3eyz6x5b4wbjx.amplifyapp.com  (/ apply · /app.html student · /admin.html admin)
firebase project,code4good-stem-career-path (Spark — no Blaze, no card)
git branch,feat/v3-mvp (Amplify auto-builds on push; not yet merged to main)
keeper accounts,admin caotinh98c@gmail.com · student caotinh98c+student@gmail.com (email-link login)
status,LIVE + E2E-verified; dashboards minimal, curriculum.json empty (stubs — see TODO)
```

## Architecture (Functions-free)

```csv
concern,V3 (Spark) implementation
frontend,Vite static build → Amplify Hosting; Firebase Web SDK talks to Firestore/Auth directly
enforcement,firestore.rules — apply create-gate (age/consent), member/progress read+self-attest, deny client writes to protected data
privileged ops,backend/admin-cli/ (firebase-admin): make-admin · grant · extend · revoke · expiry-sweep — Admin SDK works free on Spark
auth,email-link (passwordless, client SDK); anonymous auth for /apply; roles via PERSISTED custom claims (role + accessBasis + accessEnds)
data,Firestore: applications · members(/progress) · counters · donations · auditLog (no Storage; curriculum is a static bundle)
payments,Zeffy hosted; supporter grant via admin-cli after verify (fail-closed) — post-MVP
NOT used on Spark,Cloud Functions (backend/functions/ = Blaze reference only) · Cloud Storage
```

State machine (5 states, server-set by admin-cli): `SUBMITTED → GRANTED → ACTIVE → ENDED | REJECTED`. Both beneficiary (admin grant) and supporter (verified donation) converge on `grant.mjs`, which creates the Auth user + sets claims + writes the member doc (ACTIVE).

## Layout

```text
v3/
  CLAUDE.md  README.md  .gitignore
  docs/        Spark-Backend.md (ACTIVE backend) · MVP-Plan.md · V3-Plan.md (Blaze ref)
  frontend/    package.json vite.config.js .env(.example)   # → Amplify (appRoot)
    index.html app.html admin.html  public/curriculum.json
    src/ firebase.js  lib/{auth,cache}.js  public/{apply,donate}.js
         student/{dashboard,submit,path}.js  admin/{overview,applications,members}.js
    scripts/ live-apply.mjs  live-student-read.mjs        # live test utilities
  backend/
    firebase.json  .firebaserc  firestore.rules  firestore.indexes.json  storage.rules(unused)
    admin-cli/ make-admin grant extend revoke expiry-sweep .mjs  lib/admin.mjs
      test/ flow.test.mjs grant-mint.mjs cleanup.mjs provision-keepers.mjs
    functions/ BLAZE REFERENCE ONLY (not deployed) — see functions/README.md
  ../amplify.yml   # repo-root monorepo build spec (appRoot v3/frontend) — REQUIRED location
```

## Security invariants (do not break)

```csv
invariant,why / how
only admin-cli mints accounts + sets claims,no hosted code can create accounts or grant a role (Admin SDK is local-only)
Rules deny client writes to protected collections,members/counters/donations/auditLog are admin-SDK-write-only; auditLog append-only
apply is create-only behind the age/consent gate,Rules reject under-13 and 13–17 without guardianConsent, and bad shapes
progress write needs ACTIVE+in-window+own-doc,student self-attests only their own stage while role=student & accessEnds>now
service-account key NEVER committed or pasted,v3/.gitignore blocks *adminsdk*.json / *-key.json / *service-account*.json; key lives in v3/ but is ignored
supporter ACTIVE requires verified payment,verifyDonation fails closed (throws when unconfigured) — never a client claim
revoke = expire claim + revokeRefreshTokens,setCustomUserClaims(accessEnds=now) then revokeRefreshTokens(uid)
```

MVP deviations (documented in `docs/Spark-Backend.md` §3): strict next-stage gating is relaxed (Rules enforce window + own-doc; completion self-attested); the 1-read denormalized dashboard is dropped for a ≤3-read direct read. Both are post-MVP hardening.

## Run / test / deploy (Java 21 + firebase-tools present; node v24.16.0)

```csv
task,command (run via the WSL bridge per ../CLAUDE.md)
emulators,cd v3/backend && firebase emulators:start --only firestore,auth
deploy rules+indexes,cd v3/backend && firebase deploy --only firestore --project code4good-stem-career-path
admin-cli (real),GOOGLE_APPLICATION_CREDENTIALS=<key.json> node admin-cli/grant.mjs <applicationId> [--days N] [--basis ...]
admin-cli (emulator),FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 node admin-cli/make-admin.mjs you@x.com
frontend build,cd v3/frontend && npm ci && npm run build   # .env supplies VITE_FB_* (public config)
emulator E2E,cd v3/backend && firebase emulators:exec --only firestore,auth 'cd admin-cli && node test/flow.test.mjs'
live apply test (no key),cd v3/frontend && node scripts/live-apply.mjs        # tests deployed Rules from a client
live grant+read (key),set GOOGLE_APPLICATION_CREDENTIALS → node admin-cli/test/grant-mint.mjs <appId> → frontend/scripts/live-student-read.mjs → admin-cli/test/cleanup.mjs
provision keepers,GOOGLE_APPLICATION_CREDENTIALS=<key> node admin-cli/test/provision-keepers.mjs <adminEmail> <studentEmail>
```

Credentials: the service-account key is `v3/code4good-stem-career-path-firebase-adminsdk-*.json` (gitignored). Against the emulator, set `*_EMULATOR_HOST` and no key is needed. Never print or commit the key contents.

Amplify: monorepo, **repo-root `amplify.yml`** with `applications[].appRoot: v3/frontend` (a flat spec triggers `CustomerError: Monorepo spec provided without "applications" key`). Build-time env vars `VITE_FB_*` are set in the Amplify console; the live email-link domain is in Firebase Auth → Authorized domains.

## Current state + TODO

```csv
done,LIVE on Amplify · Rules deployed · email-link+anon auth · grant→ACTIVE+claims · student reads own/denied others (live E2E) · keepers provisioned
todo,populate frontend/public/curriculum.json + backend curriculum stages · flesh out dashboard/stage UI · rules-unit tests (@firebase/rules-unit-testing) · supporter/Zeffy grant · admin MFA · merge feat/v3-mvp → main
```

## Conventions

- Match the repo doc style: CSV tables, source-of-truth links, decisions recorded not implied.
- Prefer editing existing files; ask before changing security invariants, the lifecycle, or auth.
- `docs/Spark-Backend.md` is authoritative for the backend; `docs/V3-Plan.md` is the Blaze reference (do not implement against it on Spark).
- Verify, don't assume: syntax-check (`node --check`), build, and run the emulator/live E2E scripts before claiming something works.
