# CLAUDE.md

Guidance for AI agents working in this repo. Tables are CSV (token-lean). Read the linked `docs/` only when a task needs that depth.

**Execution boundary (READ FIRST if the working dir is a `\\wsl.localhost\...` UNC path).** When the repo is opened from Windows over the `\\wsl.localhost\ubuntu\...` share, the Bash/PowerShell tools run on the **Windows** side (Git Bash/MINGW64 — `uname` shows `MINGW64_NT … Msys`, `HOME=/c/Users/...`), NOT inside WSL Ubuntu. All the tools below (node/npm/mmdc/uv/tidy/etc.) live in the **WSL Linux** userland and are invisible to Windows — `node`/`npm` will be "not found", `~` resolves to the Windows home (so `~/.nvm` does not exist), and the UNC share can read/write files but cannot execute Linux binaries. Bridge into WSL for every command, and use a **login+interactive** shell so `.bashrc` sources nvm (a plain `wsl.exe node` hits a stray system node, not the project's v24.16.0):

```bash
# WRONG from Windows: node --version          → not recognized
# WRONG:              wsl.exe node --version   → v22.23.0 (system node, no nvm)
# RIGHT: login+interactive shell sources nvm → v24.16.0 + npm 11.17.0
wsl.exe bash -lic 'cd /home/tinhc/stem-career-path-ai-era/demo && npm run cloud:up'
```

(If you are already inside a native WSL/Linux shell, skip the bridge and run commands directly.)

**Git operations.** WSL has its own `gh` auth (`gh auth login --web` as `tccao`; token at `~/.config/gh/hosts.yml`, plaintext since no keyring) and `gh` is wired as the git credential helper (`git config credential.https://github.com.helper` → `!/usr/bin/gh auth git-credential`). So push/PR natively through the bridge — `wsl.exe bash -lic 'cd /home/tinhc/stem-career-path-ai-era && git push && gh pr create ...'`. Do NOT push from the Windows side: Windows `gh.exe auth token` returns empty across interop (keyring unreachable), and a plain WSL `git push` with no helper hangs on a credential prompt.

## What this is

Code For Good nonprofit project, owner Tinh Cao. Three horizons in one repo:

- **V1 — static landing page (BUILT).** Single marketing HTML file (`STEM Career Path Landing Page.html`, renamed to `index.html` for hosting). Plain HTML + embedded CSS + minimal JS. AWS static hosting.
- **V2 — vetted-access learning platform (PLANNED; runnable local demo built).** AWS serverless app: apply → vet/donate → grant → learn → expire. Production is unbuilt and fully designed in `docs/`; a **runnable local demo** of the whole flow — incl. self-serve donate auto-grant and credential issuance — lives in `demo/` (Node + AWS SDK v3 over a local cloud; see `demo/docs/Demo-Architecture.md`).
- **V3 — hosted MVP (LIVE).** A pragmatic, **$0 / no-card** variant of V2: **AWS Amplify** hosts the static frontend; **Firebase Spark** is the backend, **Functions-free** (Spark cannot deploy Cloud Functions). Enforcement lives in **Firestore Security Rules**; privileged ops run in a local **`firebase-admin` CLI**; auth is passwordless **email-link**. Deployed and end-to-end tested against the real project. Lives in `v3/` — **read `v3/CLAUDE.md` before any V3 work.**

Source of truth: `docs/Project SRS.md` (V1), `docs/Platform-SRS.md` (V2), `v3/CLAUDE.md` + `v3/docs/Spark-Backend.md` (V3).

## Repo layout

```text
STEM Career Path Landing Page.html  # V1 page (→ index.html for deploy)
mock-dashboard.html, mock-booking.html  # V2 UI mocks
assets/{images,icons}/              # codeforgood-logo.png, cohort/profile imgs
references/                         # CodeForGood_index.html + roadmap PDFs (source of truth) 
docs/                               # all V2 planning (see Doc map)
demo/                               # runnable local V2 prototype — Node/Express + DynamoDB; see demo/docs/
v3/                                 # hosted MVP (LIVE) — Amplify frontend + Firebase Spark backend (Functions-free); see v3/CLAUDE.md
amplify.yml                         # V3 Amplify monorepo build spec (appRoot v3/frontend) — repo root by requirement
requirements.txt                    # validation apt deps (tidy, xmllint); venv via `uv venv --python 3.14`
```

## Doc map (read before V2 work)

```csv
doc,covers
docs/Project SRS.md,V1 source of truth — purpose audiences 8 pillars requirements
docs/Platform-SRS.md,V2 source of truth — scope FRs NFRs data-handling phasing board asks
docs/Architecture-Design.md,V2 build-ready AWS serverless design (Rev.4) — the deep reference
docs/Customer-Journey.md,V2 personas + access lifecycle state machine + apply→provision→expire
docs/Sitemap-and-Wireframes.md,V2 zones routes wireframes nav-by-role
docs/Service-Tradeoff-Analysis.md,V2 board-facing cost/service justification
docs/Well-Architected-Review.md,V2 AWS WA review findings (applied in Arch Rev.4)
docs/Ops-Runbook.md,V2 weekly checklist alarms restore/rotation procedures
demo/docs/Demo-Architecture.md,how the runnable local demo works (Mermaid) + demo↔AWS mapping — incl. self-serve donate auto-grant + provision-issues-credential
demo/docs/Demo-Walkthrough.md,guided ~15-min tour of the running demo (admin state machine + self-serve donate + student roadmap/fast-track + expiry/gating) keyed to the seeded cast
v3/CLAUDE.md,V3 source of truth for agents — Spark/Functions-free arch + run/test/deploy + security invariants (READ before V3 work)
v3/docs/Architecture-V3.md,V3 system architecture (senior-architect) — 8 mmdc-validated Mermaid diagrams (context icon-group flow lifecycle ER security portability Spark→Blaze) + trade-offs/risks
v3/docs/Spark-Backend.md,V3 ACTIVE backend — Firestore Rules + local admin-cli + email-link auth (Functions-free on Spark)
v3/docs/MVP-Plan.md,V3 MVP goal + env-config gates (CLI-verified) + small-commit plan
v3/docs/V3-Plan.md,V3 original Amplify+Firebase Cloud-Functions design — BLAZE reference only (v3/backend/functions/ not deployed on Spark)
```

`docs/Sprint-Planning_Sitemap-and-Wireframes.md` is RETIRED — do not use.

---

## V1 — static landing page

Constraints (hard): plain semantic HTML, embedded CSS, minimal embedded JS. JS only for: mobile nav toggle, dropdown, FAQ accordion, optional smooth scroll. Relative asset paths. Keep section comments (`<!-- === HERO === -->`).

Forbidden: React, Bootstrap, Tailwind, package managers, build tools, backend forms, external analytics, heavy animation.

Colors via CSS vars only (`--cfg-purple` `#6a0dad`, `--cfg-purple-dark` `#4b0082`, `--cfg-lavender` `#b19cd9`, light bg). Match Code For Good identity.

8 pillars (S-curve desktop, stacked mobile): AI-Augmented Skills, Deployed Project Portfolio, Gig Economy Entry, Personal Branding, Micro-Internships, Strategic Certifications, Industry Tooling, Community Impact Projects.

Two tracks: During-School 12–18 mo; Recent-Graduate 8–12 wk. CTAs: Sign Up (primary), Donate (secondary) — placeholder anchors for now.

Editing rules: one section at a time; copy an existing card as template; never remove `alt`/aria/focus styles; test desktop+mobile widths; check every link; no new libraries without CFG leadership approval.

Run/validate (static, no install):

```csv
action,command
create venv,uv venv --python 3.14 (uv-managed Python 3.14)
open,open index.html (or VS Code Live Server)
html validate,tidy -q -e index.html
xml/well-formed,xmllint --noout index.html
```

---

## V2 — planned platform (design reference)

> Production not built — but a runnable local prototype lives in `demo/` (`demo/docs/Demo-Architecture.md` maps it to this design). When implementing for real, `docs/Architecture-Design.md` is authoritative; this is the index.

Principles: serverless monolith, scale-to-zero pay-per-use, stateless (JWT), **server-side enforcement of roles/windows/content-gating** (never trust client), least privilege, everything privileged audited, no card data in-stack, idempotent (conditional-write) transitions, defer anything without a traffic trigger.

Compute — one repo → 3 Lambdas (arm64/Graviton), split by trust boundary:

```csv
function,trigger,zone,job
public-fn,POST /apply + public reads,unauth internet,application intake only (smallest blast radius); validates input in code
app-fn,/app/* /admin/* (Cognito JWT),authed humans,student+admin routes; in-handler group check; mints CloudFront signed cookies; enqueues grants — CANNOT create accounts
system-fn,SQS + EventBridge Scheduler,system (no ingress),SOLE holder of AdminCreateUser; provision; expiry sweep; SES; Zeffy read-only reconcile poll → verify donation → auto-provision supporters
```

Services (launch):

```csv
need,service,notes
frontend hosting,Amplify Hosting,public site + SPA shell; managed CDN
api,API Gateway HTTP API,Cognito JWT authorizer; stage+per-route throttling; CORS locked to Amplify origin
identity,Cognito User Pool Essentials,groups student/admin; MFA REQUIRED pool-wide (TOTP admin / email-OTP student); no self-signup
app data,DynamoDB on-demand,conditional writes; PITR + deletion protection + TTL on every table
gated curriculum,private S3 + dedicated CloudFront (key group),OAC-only bucket; short-TTL signed cookies issued by app-fn after gate
async provisioning,SQS + DLQ,durable retry; IAM seam keeping AdminCreateUser out of web roles
scheduling jobs,EventBridge Scheduler → system-fn,one schedule: Zeffy reconcile poll + expiry sweep + SES reminders
email,Amazon SES,SPF/DKIM/DMARC + prod access are launch items
payments,Zeffy (hosted) + read-only Payments API,card entry on Zeffy (PCI SAQ-A); poll verifies donations; NO webhook NO card data
secrets,SSM Param Store SecureString,CloudFront signing key (app-fn) + Zeffy read-only key (system-fn); no Secrets Manager
audit trail,CloudTrail → S3 Object Lock (WORM),multi-region; data events on AuditLog+Members
encryption,KMS,AWS-managed most; customer CMK on AuditLog + WORM bucket (maintainer cannot administer key)
observability,CloudWatch,structured JSON; explicit log retention; Cost Anomaly Detection
IaC,AWS SAM,one stack per env; canary deploy + alarm rollback
```

NOT at launch (each has a re-entry trigger in Arch §14): AWS WAF, Cognito Plus, Stripe/webhooks (Appendix A), Secrets Manager, X-Ray, 6-function split, AWS Organizations/SCPs.

DynamoDB tables:

```csv
table,pk,sk,purpose
Applications,applicationId (ULID),,access requests; GSI byStatus byEmail; TTL purges rejected/lapsed PII
Members,memberId (=Cognito sub),,provisioned accounts; GSI byStatusAccessEnds for expiry query
Donations,donationId (ULID),,payment refs only; zeffyPaymentId = idempotency key; GSI byZeffyPaymentId
Progress,memberId,stageKey,proof-of-work (external links); locked/active/submitted/complete
StageLocks,memberId,stageKey,server-side gating + audited admin override flags
Notes,memberId,,member-private notes
AuditLog,targetType#targetId,ts#eventId,append-only PII-FREE events (IDs + status codes only)
```

Access state machine (server-enforced, conditional writes). No path reaches ACTIVE without admin grant (beneficiary) OR server-verified Zeffy payment (supporter):

```csv
from,to,trigger
*,SUBMITTED,applicant submits /apply (also re-apply target)
SUBMITTED,INTERVIEW_SCHEDULED,admin sends Cal.com link (beneficiary track)
SUBMITTED,DONATION_REQUIRED,self-serve fund-a-seat (no interview)
INTERVIEW_SCHEDULED,APPROVED_BENEFICIARY,eligible (free)
INTERVIEW_SCHEDULED,DONATION_REQUIRED,not eligible — donate
INTERVIEW_SCHEDULED,REJECTED,declined
DONATION_REQUIRED,DONATION_CONFIRMED,system-fn verifies Zeffy payment via poll (admin fallback)
APPROVED_BENEFICIARY,ACTIVE,provision (free)
DONATION_CONFIRMED,ACTIVE,auto-provision
ACTIVE,EXPIRED,window ends
ACTIVE,REVOKED,admin revoke or auto on refund/chargeback
```

`PAID_AUTO` (Stripe) is future-phase only (Appendix A).

Routes / zones:

```csv
zone,auth,routes
Public,none,/ , /apply , /apply/submitted , /donate , /login
System/Auth,shared,/login /logout /access/expired /access/denied /auth/*
Student,login + role=student,/app /app/path /app/pillars[/:id] /app/fasttrack (/week/:n /day/:n) /app/resources /app/progress /app/notes /app/profile
Admin,login + role=admin,/admin /admin/applications[/:id] /admin/members[/:id] /admin/content /admin/settings
```

Two learning paths: A = Full Roadmap (~12–18 mo, 8 pillars × phased units); B = 4-Week Fast Track (28 days, daily deliverable). Path chosen at onboarding; switchable only by admin. `accessBasis` (beneficiary|supporter) is reporting metadata, NOT a permission — both see the identical student app.

Security invariants (do not break when implementing V2):

```csv
invariant,why
only system-fn holds AdminCreateUser,internet-facing code can never mint accounts
no role has Update/Delete on AuditLog,append-only tamper-evidence
curriculum S3 reachable only via CloudFront OAC,no public/direct bucket reads
supporter ACTIVE requires server-verified Zeffy payment,never a client signal; idempotent on zeffyPaymentId
every state transition = conditional write,retries/double-clicks/redeliveries cannot double-provision
MFA mandatory all accounts + human AWS identities,no single-factor admin
audit events carry IDs + status codes only,immutable log must never trap PII
```

Cost target: gross ≤ $200/yr at pilot scale, net $0 against the $1,000 AWS nonprofit credit (single canonical figure). No always-on compute; no fixed-cost add-on without a documented trigger.

Minors: under-13 not accepted (COPPA); 13–17 require guardian consent before interview. `/apply` runs the age/consent gate before the donate link-out.

---

## V3 — hosted MVP (LIVE; index — full guide in `v3/CLAUDE.md`)

The shipped, pragmatic variant of V2. **`v3/CLAUDE.md` is authoritative for any V3 work** — this is just the pointer. Keep V3 self-contained under `v3/`; don't mix it with V1/V2.

```csv
fact,value
hosting,AWS Amplify (frontend) — branch feat/v3-mvp auto-builds; monorepo appRoot v3/frontend via repo-root amplify.yml
live url,https://feat-v3-mvp.d3eyz6x5b4wbjx.amplifyapp.com
backend,Firebase Spark (project code4good-stem-career-path) — Functions-free; no Cloud Functions / no Cloud Storage on Spark
enforcement,Firestore Security Rules (client-facing) + local firebase-admin CLI (privileged ops) — see v3/backend/admin-cli
auth,passwordless email-link; roles via persisted custom claims (role + accessEnds); anonymous auth for /apply
status,deployed + end-to-end tested live; privileged ops now run as admin-gated Cloud Functions (backend/sync-fn, codebase "sync"); functions/ kept as a separate Blaze-reference design (not deployed)
```

V3 security invariants (do not break): roles are **owner > admin > student** (custom claim). Account-minting + claims run ONLY via the Admin SDK — the hosted **staff-gated Cloud Functions** (`grant`/`extendAccess`/`revokeAccess`/`getInterview`/`syncDonations`) plus the **owner-gated** ones (`setRole`/`disableAccount`/`enableAccount`/`setLockdown`) in `backend/sync-fn`, or the local `admin-cli`; the **browser client can never createUser or set role claims** (it may only set INTERVIEW_SCHEDULED/REJECTED + stageLocks via Rules). Every function fails closed unless `request.auth.token.role` is `admin` (staff fns) or `owner` (owner fns). **Owner is the top tier and admins can never override it**: only the owner can change roles, disable an admin, or toggle the global lockdown kill-switch (`system/lockdown` — when on, every non-owner function + client write is denied via `assertNotLockedDown`/`notLocked()`); the first owner is minted local-only via `make-owner.mjs`. (This relaxes the earlier "no hosted account-minting" rule now that we're on Blaze; bounded by the gate + idempotent writes.) Firestore Rules deny client writes to protected collections (apply is create-only behind the age/consent gate; progress writes need ACTIVE+in-window+own-doc). Secrets — the service-account key, `Zeffy_API_Key.txt`, and `Cal.com-Dev-API-Key.txt` (the Cal.com/Zeffy keys live server-side as Functions secrets) — are **gitignored and must never be committed or pasted**. Supporter grants still require a verified payment (fail-closed). Details + run/test/deploy: `v3/CLAUDE.md`.

---

## Local tooling (verified present — a future session can run these)

```csv
tool,version/path,use
node + npx,v24.16.0 (nvm),JS runtime backing mmdc
mmdc,11.15.0 (mermaid-cli),render+syntax-validate Mermaid headless — non-zero/stderr on parse error
markdownlint-cli2,v0.22.1,lint docs/*.md + CLAUDE.md (config: .markdownlint*.json*) — `npx markdownlint-cli2 CLAUDE.md`
chromium,snap 149 — real binary /snap/chromium/current/usr/lib/chromium-browser/chrome,Puppeteer backend for mmdc + demo UI tests (the puppeteer-bundled Chrome is ABSENT — point at this + run --no-sandbox)
puppeteer-core + axe-core,demo/ devDeps (`npm i -D`),student-SPA E2E (`npm run test:e2e`) — drives system Chromium via CHROME_BIN (default snap path above); no browser download
tidy,apt,HTML validate (index.html)
xmllint,apt,XML well-formed check
uv,managed,Python 3.14 venv
python3,system,quick scripts (e.g. graph subgraph/end + edge-endpoint checks)
```

**Render/validate a Mermaid diagram headless (incl. Fig 2A AWS `logos:` icons).** The puppeteer-bundled Chrome is missing, so pass snap Chromium with the sandbox off (snap confinement blocks puppeteer's sandbox):

```bash
printf '{ "executablePath": "/snap/chromium/current/usr/lib/chromium-browser/chrome", "args": ["--no-sandbox","--disable-setuid-sandbox","--disable-gpu"] }' > /tmp/pptr.json
# --iconPacks pulls the iconify logos pack so logos:aws-* resolve (network needed); omit for plain graphs
mmdc -p /tmp/pptr.json --iconPacks @iconify-json/logos -i diagram.mmd -o out.svg
```

Verified: renders Fig 2A with all subgroup labels + 12 embedded AWS logos. CLI is for validation/CI; the VS Code built-in preview / `assets/diagrams/architecture-2A.html` stay the interactive logo-accurate path.

**Export docs to HTML/PDF with AWS logos (yzane "Markdown PDF").** The extension's default mermaid build never calls `registerIconPacks`, so `logos:aws-*` icons export as blue `?` boxes. `.vscode/settings.json` sets `markdown-pdf.mermaidServer` to a path-independent `data:` URI shim (CDN mermaid 11 + `registerIconPacks` for the `logos` pack) — a `file://` bundle would break when the export is opened in a Windows browser on WSL. Needs internet at view time. Details + how to re-encode the shim: `assets/diagrams/README-mermaid-logos.md`. After editing the setting, reload the window and re-export.

**Run the demo test suites (`demo/`).** All suites need a local DynamoDB engine at the configured endpoint. The app auto-loads `demo/.env` (`process.loadEnvFile`, try/catch) — `cp .env.example .env` once (defaults to MiniStack `:4566`) and tests/scripts pick it up; only export `AWS_ENDPOINT_URL` (+ region/creds) if you skip the `.env`. E2E tooling (`puppeteer-core` + `axe-core`) is already a devDep — `npm ci` installs it; no browser download (it reuses the snap Chromium):

```bash
cd demo
cp .env.example .env                                       # auto-loaded; endpoint defaults to :4566
npm run cloud:up && npm run db:reset && npm run db:seed    # local cloud + tables + seed
npm test            # backend/API suite (test/**)
npm run test:e2e    # student-SPA E2E (e2e/** — puppeteer-core + axe-core)
npm run test:all    # both
```

`e2e/` starts the Express app in-process (no `npm start` needed) and drives `public/app.html` with `puppeteer-core` against a system Chromium — override the binary with `CHROME_BIN` (defaults to the snap path above; `--no-sandbox` because snap blocks the sandbox). Shared helpers + axe-core injection live in `e2e/_support.mjs`; add new SPA tests as `e2e/*.test.mjs`.

## Conventions for agents

- Keep V1, V2, and V3 separate — don't add backend/framework code to the static page; V3 is its own subtree with its own `v3/CLAUDE.md` (read it before V3 work).
- Match existing doc style: Rev-tracked, source-of-truth links, decisions recorded not implied.
- Prefer editing existing files over adding new ones; ask before changing nav, CTAs, the 8-pillar pathway, or any security invariant above.
- Tabular data in docs/this file → CSV blocks (token-efficient). Verify HTML with `tidy`/`xmllint`.
