# v3/CLAUDE.md — V3 hosted MVP (LIVE)

Guidance for AI agents working in `v3/`. Tables are CSV (token-lean). Read the linked
`docs/` only when a task needs that depth. Repo-wide execution + git rules are in the
**root `../CLAUDE.md`** (WSL UNC bridge, `gh` auth) — they apply here; this file does not repeat them.

## What V3 is

The shipped, **$0 / no-card** variant of V2. **AWS Amplify** hosts a static frontend;
**Firebase Spark** is the backend. Spark **cannot deploy Cloud Functions** and has **no
Cloud Storage** (new projects), so V3 is **Functions-free**: the trust boundary is **Firestore
Security Rules** (client-facing) plus a local **`firebase-admin` CLI** (privileged ops). Auth
is passwordless **email-link**. The V1 marketing landing page is the public front door.

```csv
fact,value
live url,https://feat-v3-mvp.d3eyz6x5b4wbjx.amplifyapp.com  (/ = V1 landing · /app.html = student · /admin.html = admin)
firebase project,code4good-stem-career-path (Spark — no Blaze, no card)
git branch,feat/v3-mvp (Amplify auto-builds on push; NOT yet merged to main)
keeper accounts,admin caotinh98c@gmail.com · student-fasttrack caotinh98c+student@gmail.com · student-roadmap caotinh98c+student2@gmail.com
status,LIVE — full student app + admin console + landing all ported from V2 design and wired to real data
```

## Architecture (Functions-free)

```csv
concern,V3 (Spark) implementation
frontend,Vite static build → Amplify Hosting; Firebase Web SDK talks to Firestore/Auth directly. 3 entries: index.html (V1 landing) · app.html (student) · admin.html (admin)
design system,src/ui/theme.css — ported 1:1 from demo/public/app.html (the "vibrant redesign"); shared by app + admin
enforcement,firestore.rules — apply create-gate (age/consent); member/progress read+self-attest; admin claim may schedule-interview/reject + write stageLocks (NON-minting); deny all other client writes
privileged ops,backend/admin-cli/ (firebase-admin): make-admin · grant [--path fasttrack|roadmap] · extend · revoke · expiry-sweep — Admin SDK works free on Spark
auth,email-link (passwordless, client SDK); anonymous auth for /apply; roles via PERSISTED custom claims (role + accessBasis + accessEnds)
data,Firestore: applications(+interviewAt/Note/rejectedReason) · members(/progress · /stageLocks) · counters · donations · auditLog. Curriculum is a static bundle (public/curriculum.json), not Firestore
payments,Zeffy hosted (landing Donate links out); supporter grant via admin-cli after verify (fail-closed). Admin Donations "Refresh" = syncDonations (Blaze) — keeps the Zeffy key server-side
deployed functions,backend/sync-fn/ (codebase "sync"; nodejs22; scale-to-zero). STAFF-gated (admin or owner): syncDonations · getInterview (Cal.com slot; key server-side) · grant (createUser + claims + member) · extendAccess · revokeAccess. OWNER-gated: setRole (manage admin/owner roster) · disableAccount/enableAccount (block/restore sign-in; admins may target students only, owner anyone but an owner) · setLockdown (global kill-switch). Own codebase so `firebase deploy --only functions` skips the functions/ reference design
roles,owner > admin > student (custom claim role). Owner bootstrapped LOCAL-ONLY via admin-cli/make-owner.mjs (root of trust). Admin sign-in to admin.html works for admin OR owner; owner additionally sees the Owner tab
NOT used,backend/functions/ (full Blaze-reference design — NOT deployed) · Cloud Storage
```

**Cost of the deployed admin functions.** Effectively **$0** at pilot scale: the Cloud Functions free
tier (2M invocations, 400K GB-seconds, 200K vCPU-seconds, 5 GB egress/month) far exceeds admin-only
clicks. Only non-zero items are tiny — Artifact Registry image storage (~$0.10/GB-month, often within
the free 0.5 GB; cleanup policy auto-deletes images >1 day) and Cloud Build on deploy (120 free min/day).
Realistic bill: **$0, occasionally a few cents/month.** Constraints: fail-closed admin-claim gate on
every fn; secrets `ZEFFY_API_KEY` + `CAL_API_KEY` are Functions secrets (never in git/client); idempotent
writes; min-instances 0 (no idle cost). Set secrets once with `firebase functions:secrets:set <NAME>`;
deploy with `firebase deploy --only functions:sync`. Full note: `docs/Architecture-V3.md` §11a.

State machine: `SUBMITTED → GRANTED → ACTIVE → ENDED | REJECTED`. The `INTERVIEW_SCHEDULED` state +
Interview tab are retired, but the SUBMITTED application detail still shows the applicant's self-booked
**Cal.com slot** (via `getInterview`). The admin reviews it and clicks **Approve & grant** (the `grant`
Cloud Function: createUser + claims + member doc; also `admin-cli/grant.mjs`) or **Reject** (client Rules
write). Member access is removed via **Disable** (`disableAccount`); the redundant Revoke button was
dropped. Supporter path uses donation confirmation.

## Layout

```text
v3/
  CLAUDE.md  README.md  .gitignore
  docs/  Architecture-V3.md (system architecture + 8 validated Mermaid diagrams) · Spark-Backend.md (ACTIVE backend) · MVP-Plan.md · Phase2-UI-Plan.md (UI port goal) · Phase3-Plan.md (next goal) · V3-Plan.md (Blaze ref)
  frontend/  package.json  vite.config.js  .env(.example)         # → Amplify (appRoot)
    index.html   # ported V1 landing — apply→Firestore (COPPA gate), login→/app.html, donate→Zeffy
    app.html     # student app          admin.html   # admin console
    public/  curriculum.json (8 pillars + 28 fast-track days)  assets/{icons,images}
    src/
      firebase.js   lib/{auth,cache}.js
      ui/ theme.css (shared design system)  icons.js
      public/ landing.js  apply.js  donate.js
      student/ app.js (full vibrant app: hero·journey·stage-detail·submit·ladder)  path.js
      admin/ admin.js (console: KPIs·queue·interview·members·progress·lock/unlock)
    scripts/ live-apply.mjs  live-student-read.mjs                # live test utilities
  backend/
    firebase.json  .firebaserc  firestore.rules  firestore.indexes.json  storage.rules(unused)
    admin-cli/ make-admin grant extend revoke expiry-sweep .mjs  lib/admin.mjs
      test/ flow.test.mjs grant-mint.mjs cleanup.mjs provision-keepers.mjs
    functions/ BLAZE REFERENCE ONLY (not deployed) — see functions/README.md
  ../amplify.yml   # repo-root monorepo build spec (appRoot v3/frontend) — REQUIRED at repo root
```

## Security invariants (do not break)

```csv
invariant,why / how
account-minting + claims only via Admin SDK — hosted STAFF-gated Cloud Functions or local admin-cli; NEVER the browser client,grant/extendAccess/revokeAccess fail-closed unless verified role in ['admin','owner']; the browser client can still only set INTERVIEW_SCHEDULED/REJECTED + stageLocks via Rules — it cannot createUser or set role claims. (Relaxes the earlier 'no hosted account-minting' rule now that we're on Blaze; bounded by the gate + idempotent writes.)
owner is the top tier and admins can never override it,setRole/setLockdown are OWNER-gated (fail-closed unless role=='owner') so an admin cannot promote/demote anyone, lift lockdown, or disable an admin/owner; member ops refuse staff targets (assertTargetNotStaff); the first owner is minted LOCAL-ONLY via make-owner.mjs; nobody can change their own role/disable themselves
global lockdown kill-switch is owner-only,setLockdown writes system/lockdown; when enabled every NON-owner privileged fn (assertNotLockedDown) AND client write (Rules notLocked()) is denied until the owner lifts it; owner stays exempt to recover
Rules deny client writes to protected collections,members/counters/donations/campaigns/auditLog are admin-SDK-write-only; auditLog append-only; system/{id} owner-write + staff-read
apply is create-only behind the age/consent gate,Rules reject under-13 and 13–17 without guardianConsent, and bad shapes (enforced again client-side in landing.js)
progress write needs ACTIVE+in-window+own-doc,student self-attests only their own stage while role=student & accessEnds>now
service-account key NEVER committed or pasted,v3/.gitignore blocks *adminsdk*.json / *-key.json / *service-account*.json; the key lives in v3/ but is ignored
supporter ACTIVE requires verified payment,verifyDonation fails closed (throws when unconfigured) — never a client claim
revoke = expire claim + revokeRefreshTokens,setCustomUserClaims(accessEnds=now) then revokeRefreshTokens(uid)
```

MVP deviations (documented in `docs/Spark-Backend.md` §3): strict next-stage gating is relaxed
(Rules enforce window + own-doc; completion self-attested; admin stageLocks override is a UI/Rules
signal, not byte-enforced); requirement checkboxes persist in localStorage (no Firestore write).

## Operational limits (Spark plan — verified at firebase.google.com/docs/auth/limits)

```csv
limit,value / impact
email-link sign-in emails,5 / day on Spark (Firebase built-in sender) → heavy testing hits auth/quota-exceeded. Blaze = 25,000/day. Custom SMTP does NOT lift it (plan-based)
workaround (stay Spark),generate the link via Admin SDK (generateSignInWithEmailLink — 20,000 links/day quota) and open/deliver it yourself; bypasses the 5/day SEND cap
new account creation,100 accounts/hour per IP (not the bottleneck)
prod email path,for >5 logins/day on Spark without Blaze: move link generation to the admin-cli + send via your own SMTP/provider
```

## Run / test / deploy (Java 21 + firebase-tools present; node v24.16.0)

```csv
task,command (run via the WSL bridge per ../CLAUDE.md)
emulators,cd v3/backend && firebase emulators:start --only firestore,auth
deploy rules+indexes,cd v3/backend && firebase deploy --only firestore --project code4good-stem-career-path
admin-cli (real),GOOGLE_APPLICATION_CREDENTIALS=<key.json> node admin-cli/grant.mjs <applicationId> [--days N] [--basis ...] [--path fasttrack|roadmap]
admin-cli (emulator),FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 node admin-cli/make-admin.mjs you@x.com
frontend build,cd v3/frontend && npm ci && npm run build   # .env supplies VITE_FB_* (public config)
emulator E2E,cd v3/backend && firebase emulators:exec --only firestore,auth 'cd admin-cli && node test/flow.test.mjs'
live apply test (no key),cd v3/frontend && node scripts/live-apply.mjs        # tests deployed Rules from a client
generate sign-in link (dodge 5/day cap),"GOOGLE_APPLICATION_CREDENTIALS=<key> node -e on admin.auth().generateSignInWithEmailLink(email, {url:'https://feat-v3-mvp…/app.html', handleCodeInApp:true}) → open the URL"
provision keepers,GOOGLE_APPLICATION_CREDENTIALS=<key> node admin-cli/test/provision-keepers.mjs <adminEmail> <studentEmail>
```

Credentials: the service-account key is `v3/code4good-stem-career-path-firebase-adminsdk-*.json`
(gitignored). Against the emulator, set `*_EMULATOR_HOST` and no key is needed. Never print or commit the key.

Amplify: monorepo, **repo-root `amplify.yml`** with `applications[].appRoot: v3/frontend` (a flat
spec triggers `CustomerError: Monorepo spec provided without "applications" key`). `VITE_FB_*` are
Amplify env vars; the live domain is in Firebase Auth → Authorized domains. NOTE: CloudFront caches
the root `/` HTML — after a deploy, the landing may show stale until the TTL/​hard-refresh (hashed
JS/CSS assets are never stale).

## Current state + TODO

```csv
done,V1 landing hooked (apply→Firestore + COPPA gate · login→/app.html · donate→Zeffy) · vibrant student app (hero·journey week→day drilldown·stage-detail+submit·ladder·progress ring) · admin console (KPIs·status tabs·queue+detail·interview card·reject·members table·member progress·stage lock/unlock — reads via Rules, mutations as copyable admin-cli commands) · curriculum 8 pillars + 28 days · BOTH tracks (fasttrack + roadmap keepers) · stageLocks override · rules deployed + live E2E green
todo,email-link >5/day needs Blaze or the link-generation workaround · supporter/Zeffy verify · rules-unit tests (@firebase/rules-unit-testing) · admin MFA + App Check · custom SMTP / admin-cli link-send for production email · merge feat/v3-mvp → main
```

## Conventions

- Match the repo doc style: CSV tables, source-of-truth links, decisions recorded not implied.
- Prefer editing existing files; ask before changing security invariants, the lifecycle, or auth.
- `docs/Spark-Backend.md` is authoritative for the backend; `docs/V3-Plan.md` is the Blaze reference (do not implement against it on Spark).
- Shared CSS is `src/ui/theme.css`; the student `.card.stage-detail` and admin `.card` panels share the `.card` class — scope new `.card *` rules carefully (a leak there already caused a checkbox bug).
- Verify, don't assume: syntax-check (`node --check`), build, and run the emulator/live E2E scripts before claiming something works.
