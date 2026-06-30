# AGENTS.md

Guidance for AI agents working in this repo. Tables are CSV (token-lean). Read the linked `docs/` only when a task needs that depth.

## What this is

Code For Good nonprofit project, owner Tinh Cao. Three horizons in one repo:

- **V1 — static landing page (BUILT).** Single marketing HTML file (`STEM Career Path Landing Page.html`, renamed to `index.html` for hosting). Plain HTML + embedded CSS + minimal JS. AWS static hosting.
- **V2 — vetted-access learning platform (PLANNED, NOT BUILT).** AWS serverless app: apply → vet/donate → grant → learn → expire. Fully designed in `docs/`; no code yet.
- **V3 — secured hosted Firebase MVP (BUILT).** `v3/` contains the deployed Amplify + Firebase Blaze/Identity Platform implementation: public landing page, student app, admin/owner console, App-Check-protected 2nd-generation callable Functions, read-only browser Firestore Rules, a break-glass admin CLI, and Playwright/security tests. On `feat/v3-mvp`, `v3/README.md`, `v3/CLAUDE.md`, and `v3/docs/Security-Verification-Walkthrough.md` are authoritative for implemented behavior and operations.

Source of truth: `docs/Project SRS.md` (V1), `docs/Platform-SRS.md` (V2), and
`v3/README.md` + `v3/CLAUDE.md` + `v3/docs/Security-Verification-Walkthrough.md` (implemented V3
behavior, tests, and operations).

## Repo layout

```text
STEM Career Path Landing Page.html  # V1 page (→ index.html for deploy)
mock-dashboard.html, mock-booking.html  # V2 UI mocks
assets/{images,icons}/              # codeforgood-logo.png, cohort/profile imgs
references/                         # CodeForGood_index.html + roadmap PDFs (source of truth) 
docs/                               # all V2 planning (see Doc map)
requirements.txt                    # validation apt deps (tidy, xmllint); venv via `uv venv --python 3.14`
v3/                                 # current hosted MVP; Vite frontend + Firebase backend/admin CLI
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
```

`docs/Sprint-Planning_Sitemap-and-Wireframes.md` is RETIRED — do not use.

---

## V1 — static landing page

Constraints (hard): plain semantic HTML, embedded CSS, minimal embedded JS. JS only for: mobile nav toggle, dropdown, FAQ accordion, optional smooth scroll. Relative asset paths. Keep section comments (`<!-- === HERO === -->`).

Forbidden: React, Bootstrap, Tailwind, package managers, build tools, backend forms, external analytics, heavy animation.

Colors via CSS vars only (`--cfg-purple` `#6a0dad`, `--cfg-purple-dark` `#4b0082`, `--cfg-lavender` `#b19cd9`, light bg). Match Code For Good identity.

8 pillars (S-curve desktop, stacked mobile): AI-Augmented Skills, Deployed Project Portfolio, Gig Economy Entry, Personal Branding, Micro-Internships, Strategic Certifications, Industry Tooling, Community Impact Projects.

Two tracks: Full Roadmap 12–18 mo; 4-Week Fast Track (28 days). CTAs: Sign Up (primary), Donate (secondary).

Editing rules: one section at a time; copy an existing card as template; never remove `alt`/aria/focus styles; test desktop+mobile widths; check every link; no new libraries without CFG leadership approval.

Run/validate (static, no install):

```csv
action,command
create venv,uv venv --python 3.14 (uv-managed Python 3.14)
open,open index.html (or VS Code Live Server)
html validate,tidy -q -e index.html
html parse,xmllint --html --noout index.html
```

Raw `xmllint --noout` selects XML mode and incorrectly rejects valid HTML5 void elements, boolean
attributes, and embedded JavaScript. `tidy` may also warn about valid modern attributes such as
`decoding`, `aria-modal`, and fractional SVG `stroke-width`; treat those as compatibility warnings,
not malformed markup. V3 behavioral validation must include `cd v3/frontend && npm run test:e2e`,
not only static linting.

## V3 — implemented MVP (current work)

V3 is intentionally different from the V1 single-file constraints: it uses Vite, the modular
Firebase Web SDK, Firebase Auth/Firestore, a local `firebase-admin` CLI, and Playwright tests.
Do not apply V1's “no package manager/build tools” rule to files under `v3/`.

```csv
area,current behavior
learning tracks,Full Roadmap (12–18 months) and 4-Week Fast Track (28 days)
access duration,365 days by default for both tracks; operator may explicitly override
age gate,UI exposes only 13–17 and 18+; 13–17 requires guardian consent before the full form
unsupported ages,no under-13 product path/state; Firestore Rules defensively deny undeclared values
application outcomes,beneficiary routes to Cal.com after submit; supporter routes to Zeffy
student progress,submitStage callable validates an HTTPS proof URL and transactionally unlocks only the next stage or an explicit admin override
access recovery,re-enable restores sign-in only; Extend/Restore access creates a future window and clears ENDED lifecycle fields
final staff-role removal,demoting admin to no staff role restores exact claims for an active unexpired member and revokes the old staff session
privileged access,normal operations use TOTP- and App-Check-protected callables; local Admin SDK commands are explicit attributable break glass
browser boundary,all Firestore writes are denied; the browser cannot directly mint users or assign claims
landing tests,7 Playwright Chrome scenarios in v3/frontend/tests/e2e/landing.spec.js
```

Run the V3 verification suite before committing landing or access changes:

```bash
(cd v3/frontend && npm run build && npm run test:security)
(cd v3/frontend && npm run test:e2e)

(cd v3/backend && DEBUG= firebase emulators:exec --only firestore \
  'cd admin-cli && npm run test:rules'
)
(cd v3/backend && DEBUG= ZEFFY_API_KEY=test-key ZEFFY_API_BASE_URL=http://127.0.0.1:7777 \
firebase emulators:exec --only auth,firestore,functions \
  'cd admin-cli && npm run test:security'
)
(cd v3/backend && DEBUG= firebase emulators:exec --only firestore,auth \
  'cd admin-cli && npm run test:flow'
)

(cd v3 && tidy -q -e frontend/index.html)
(cd v3 && xmllint --html --noout frontend/index.html)
```

Never set `GOOGLE_APPLICATION_CREDENTIALS` for emulator tests. Production staff role changes,
MFA confirmation, disables, revokes, grants, and re-enables rotate `sessionVersion`; the affected
account must use a new email sign-in link (and TOTP for staff) rather than reusing an open session.

---

## V2 — planned platform (design reference)

> Not built. When implementing, `docs/Architecture-Design.md` is authoritative; this is the index.

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

## Conventions for agents

- Keep V1 and V2 separate — don't add backend/framework code to the static page.
- Match existing doc style: Rev-tracked, source-of-truth links, decisions recorded not implied.
- Prefer editing existing files over adding new ones; ask before changing nav, CTAs, the 8-pillar pathway, or any security invariant above.
- Tabular data in docs/this file → CSV blocks (token-efficient). Verify HTML with `tidy`/`xmllint`.

## Imported Claude Cowork project instructions
