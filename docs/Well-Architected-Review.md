# AWS Well-Architected Review — STEM Career Path (AI Era)

**Project:** STEM Graduates Career Path — AI Era (Code For Good)
**Doc type:** AWS Well-Architected Framework review of the launch (pilot) architecture
**Reviewer role:** Senior solutions architect (AWS serverless)
**Owner:** Tinh Cao
**Status:** Rev. 1 — June 2026
**Subject of review:** `docs/Architecture-Design.md` (Rev. 2)
**Source of truth:** `docs/Platform-SRS.md`
**Companion docs:** `docs/Service-Tradeoff-Analysis.md` · `docs/Ops-Runbook.md` ·
`docs/Customer-Journey.md` · `docs/Sitemap-and-Wireframes.md`

> **What this is.** A pillar-by-pillar assessment of the *launch-state* design against the six
> AWS Well-Architected pillars, sized for a one-maintainer nonprofit pilot at ~$0 net cost. It
> records what is already strong, the defects worth fixing before build, and a prioritised action
> list. Findings are written as recommendations against the design doc; per the owner's decision
> the design doc's prose is left intact except for the §2 diagram, and each finding carries a
> **where-to-apply** pointer so the fixes can be folded in deliberately.

---

## 0. Scope & method

The launch architecture is: AWS Amplify Hosting (public site + SPA shell) · API Gateway HTTP API
with a Cognito JWT authorizer · three Lambda functions split on trust boundaries (`public-fn` /
`app-fn` / `system-fn`) · Cognito User Pool (Essentials) · DynamoDB on-demand · private-S3
curriculum behind a dedicated CloudFront distribution with signed-cookie access · SQS + DLQ ·
EventBridge Scheduler · SES · CloudTrail + an append-only application `AuditLog` exported to an
Object-Lock (WORM) bucket. Donations run on Zeffy (link-out); supporters are **auto-granted via a
read-only Zeffy API reconcile poll** (Rev. 3 — see the addendum, §11) — no webhook, no card data.

Each pillar below is graded **Strong / Good / Gap** for the pilot's context (not an enterprise
bar), followed by specific findings. Severity: **[H]** correctness or build-blocking · **[M]**
should-fix before launch · **[L]** nice-to-have / monitor.

---

## 1. Summary scorecard

| Pillar | Posture | Top action |
|--------|---------|-----------|
| Operational Excellence | **Good** | Set CloudWatch Logs retention; add an async-invoke DLQ + alarm; pick one IaC tool |
| Security | **Strong, 2 must-fix** | Correct the Cognito MFA model; specify the signed-cookie cross-domain topology |
| Reliability | **Strong** | State the single-region DR posture explicitly for the board |
| Performance Efficiency | **Good** | Pin the Lambda runtime and standardise on arm64/Graviton |
| Cost Optimization | **Excellent** | Hold the line; only log-retention + arm64 left to capture |
| Sustainability | **Strong (undocumented)** | Make the pillar explicit; arm64 is the one concrete lever |

**Overall:** the design is well above the bar for a pilot. Two **[H]** items (MFA model,
signed-cookie domains) are genuine correctness issues that will bite during build if left as
written; everything else is incremental hardening that fits the $0 posture.

---

## 2. Cross-cutting correctness & consistency

These are not pillar-specific — they are defects in the current text or diagram.

### 2.1 [H] Cognito MFA is described as per-group, which Cognito does not support
**Evidence:** §6.1 "Admin MFA is mandatory (TOTP), enforced at the pool level for the `admin`
group"; §4 service table "admin group MFA mandatory (TOTP)"; restated in §6.3, §10, §16.
**Problem:** Amazon Cognito user-pool MFA is a **pool-wide** setting — `OFF` / `OPTIONAL` /
`REQUIRED`. There is no native "MFA required only for group X." As written, the control is not
buildable from a pool toggle. The two real options are: (a) pool MFA `OPTIONAL` + enforce MFA for
admins in application logic; or (b) pool MFA `REQUIRED` for everyone.
**Resolution (owner decision):** **pool MFA = `REQUIRED` for all users.** Admins use **TOTP**;
students use **email-OTP** (Cognito email-message MFA — lower friction, sends via SES which is
already in-stack, ≈$0; fall back to TOTP for all if email-OTP is unavailable on the chosen tier).
**SMS MFA is intentionally not used** (toll-fraud exposure + per-message cost — both at odds with
the $0 posture). This is also a small security upgrade: students get MFA too.
**Where to apply:** §6.1 (rewrite the MFA bullet), §4 (Identity row), §6.3 (Application admin
row), §10 ("Admin credential hardening" → "Account hardening"), §16 (checklist item). Corrected
wording in Appendix A.1.
**Downstream sync:** requiring MFA for students changes onboarding — `AdminCreateUser` users must
complete an `MFA_SETUP` challenge on first sign-in. Update `Customer-Journey.md` Stage 4 (Onboard:
"password set on first login" → "password + MFA set on first login") and the `/login` / `/auth/*`
flows in `Sitemap-and-Wireframes.md`.

### 2.2 [H] Signed-cookie cross-domain topology is unspecified
**Evidence:** §9.2 issues `CloudFront-Policy/-Signature/-Key-Pair-Id` cookies from `app-fn`
(behind API Gateway) for the browser to present to the curriculum CloudFront distribution.
**Problem:** browsers only send those cookies to CloudFront if the cookie's `Domain` covers the
distribution's host. With Amplify (SPA), API Gateway (`app-fn`, which sets the cookies) and
CloudFront (curriculum) on three different AWS-generated hostnames, the cookies will **not** be
sent and every gated fetch silently 403s. This is the kind of thing that passes every unit test
and fails the first real browser session.
**Fix:** put all three behind **custom domains under one registrable parent** — e.g.
`app.example.org` (Amplify), `api.example.org` (API Gateway), `cdn.example.org` (CloudFront) — and
set the cookies with `Domain=.example.org; Secure; SameSite=None; HttpOnly; Path=/`. `SameSite=None`
is required because the curriculum host differs from the app host.
**Where to apply:** add a "Domain & cookie topology" note to §9.2; add a checklist line to §16
(custom domains provisioned; signed cookies scoped to the parent domain; integration test asserts
a real cross-host fetch). Corrected wording in Appendix A.2.

### 2.3 [M] `docs/Architecture-Review.md` referenced but missing — RESOLVED (Rev. 4)
**Evidence:** the `Architecture-Design.md` header and `Platform-SRS.md` §1 cited a non-existent
file. **Resolution:** the design header now points at this Well-Architected review; the
Platform-SRS reference was made generic ("an architecture review"). No dangling source-of-truth
reference remains.

### 2.4 [M] §2 diagram defects (corrected in this revision of the design doc)
- **SES was miscategorised** under "External (no integration, link-out / dashboard only)" while
  `system-fn → SES` is a first-party integration. SES is now drawn in the AWS plane.
- **`app-fn → CloudFront (set signed cookies)` was semantically wrong** — `app-fn` returns
  `Set-Cookie` to the **browser**; the **browser** presents the cookies to CloudFront. The flow is
  now `app-fn → browser (Set-Cookie)` then `browser → CloudFront (cookies) → OAC → S3`.
- The single dense diagram is split into **Figure 2A (request & data flow)** and **Figure 2B
  (trust zones & IAM seams)** with colour-coded trust groups for legibility.

---

## 3. Operational Excellence — *Good*

**Already strong.** A real `Ops-Runbook.md` with named alarm owners, a weekly 15-minute checklist,
a *tested* PITR restore drill, quarterly key rotation, and a handover procedure. Structured JSON
logging. IaC-per-environment with a prod approval gate. This is better operational hygiene than
most funded startups ship with.

**Findings.**
- **[H] CloudWatch Logs retention is not set.** Log groups default to **never expire**. This is an
  unbounded, slowly-compounding cost leak — and `Ops-Runbook.md` §5 already names "log retention
  misconfig" as a prime billing-spike suspect, so the design implicitly knows about it without
  closing it. *Fix:* declare explicit retention in IaC — e.g. 30–90 days for Lambda/API logs,
  longer (or lifecycle-to-Glacier) for trail logs. *Where:* §13 IaC bullet + §16 checklist.
- **[M] Async-invoke failure path is uncovered.** Only the SQS path has a DLQ. `EventBridge
  Scheduler → system-fn` (the expiry sweep) is an **asynchronous** Lambda invocation; if it throws
  past its retries the failure is silent. *Fix:* configure a Lambda **on-failure destination**
  (SQS/SNS) or DLQ for `system-fn`'s async invocations and alarm on it, mirroring the SQS DLQ
  alarm already in §11. *Where:* §3 (system-fn trigger row), §11 (alarms), §16.
- **[M] Choose the IaC tool.** §4/§13 say "AWS SAM **or** CDK." A build-ready doc should commit.
  *Recommendation:* **SAM** for a single maintainer — less abstraction to learn, first-class
  serverless deployment-preference/rollback support, smaller mental model. Pick CDK only if the
  maintainer is already fluent in TypeScript and wants typed constructs. *Where:* §4, §13.
- **[M] Add deployment safety.** For a solo maintainer, an unattended bad deploy is a top
  operational risk. *Fix:* use Lambda aliases + a **canary/linear deployment with automatic
  rollback on a CloudWatch alarm** (SAM `DeploymentPreference`, or CodeDeploy). Near-zero cost,
  large blast-radius reduction. *Where:* §13.
- **[L] Enable API Gateway access logging** (distinct from Lambda logs). It is the cleanest source
  of the abuse evidence that the §8.3/§14 WAF trigger depends on. *Where:* §8, §11.

---

## 4. Security — *Strong (two must-fix items)*

**Already strong.** Server-side enforcement of role/window/gating; least-privilege per-function
roles with the critical separation-of-duties (internet-facing code cannot mint accounts);
append-only `AuditLog` by IAM with CloudTrail data events and WORM export; PII-free audit schema;
sealed root with a board custodian and explicit-deny on audit-infra tampering; PCI SAQ-A via Zeffy.
The signed-cookie gating design (private S3 + OAC + key group) is the right pattern.

**Findings.**
- **[H] Cognito MFA model** — see §2.1. (Resolved: pool-wide `REQUIRED`, TOTP admin / email-OTP
  student.)
- **[H] Signed-cookie cross-domain topology** — see §2.2.
- **[M] State the KMS strategy.** The design says "SSE at rest" generically. *Recommendation:*
  AWS-managed keys for most stores (free, fine for the pilot), **but** consider a **customer-managed
  KMS key (CMK) with a restrictive key policy** for the `AuditLog` table and the WORM bucket. The
  current control set lets the maintainer be denied bucket *deletion* but says nothing about the
  *encryption key* — a CMK whose key policy the maintainer cannot alter completes the "ultimate
  authority controls access, never the ability to erase the record" promise in §6.3. *Trade-off:*
  ~$1/month per CMK against a $0 target — small, but a real decision for the board. *Where:* §4
  (Secrets/KMS), §6.3, §7. Recorded as a decision in §9 below.
- **[M] CORS + input validation.** *(a)* Lock the HTTP API's CORS to the Amplify origin(s) only;
  default-open CORS would let any site drive the authenticated API with a user's token. *(b)*
  HTTP API (unlike REST API) has **no built-in request validation** — so `public-fn`, the one
  **unauthenticated** path and the one that ingests **minors' PII** via `/apply`, must validate
  size/shape/age-gate rigorously in code (the honeypot + dedupe in §8.2 guard volume, not
  payload). *Where:* §4 (API row), §8.2, §16.
- **[M] S3 Object Lock is creation-time only.** Object Lock requires versioning and **cannot be
  enabled on an existing bucket** — it must be set when the WORM bucket is created. *Fix:* encode
  this in IaC and call it out in §16 so the audit bucket is created correctly the first time
  (retrofitting means recreating the bucket). *Where:* §7.1, §16.
- **[L] Make the `/apply` residual risk explicit.** `/apply` is the sole unauthenticated write
  path, it holds minors' PII, and there is no WAF at launch. The deferral is defensible (cost, no
  users yet) with compensating controls (per-route throttle + honeypot + dedupe + input
  validation), but the acceptance should be *stated* and `/apply` named as **first in line** when
  the §14 WAF trigger fires. *Where:* §8.

---

## 5. Reliability — *Strong*

**Already strong.** PITR + deletion protection on every table; idempotent state transitions via
conditional writes (thoroughly enumerated in §9A.1); SQS DLQ; a *tested* restore procedure with
board-accepted RPO ≤ 24 h / RTO ≤ 1 business day. The idempotency analysis is genuinely
above-grade.

**Findings.**
- **[M] State the DR posture.** The design is implicitly single-region and PITR is **in-region** —
  a regional outage or a region-level account issue is unrecoverable within the stated RTO from
  PITR alone. For a volunteer pilot this is an acceptable risk, but the board should accept it
  *knowingly*. *Fix:* add one line — "single-region deployment; region-loss recovery = await AWS
  regional recovery; (optional) periodic cross-region copy of the WORM export and a DynamoDB
  backup for true off-region durability." *Where:* §13 or a short note in §10/§12.
- **[L] Tune the SQS consumer.** Give `system-fn` a sensible **reserved concurrency** so a burst
  cannot throttle it into redelivery storms, and adopt **partial batch response**
  (`ReportBatchItemFailures`) so a single poison message doesn't re-drive an entire batch. *Where:*
  §3, §9A.

---

## 6. Performance Efficiency — *Good*

**Already strong.** Scale-to-zero serverless; curriculum edge-cached on CloudFront with zero
Lambda per asset; stateless JWT auth touching Cognito only at login/refresh; per-member partition
keys avoid hot partitions; the bottleneck analysis (§9A) correctly ranks Cognito sign-in burst
first and prescribes client backoff + quota pre-warming.

**Findings.**
- **[M] Pin the runtime and standardise on arm64/Graviton.** The doc never names the Lambda
  runtime or CPU architecture. *Recommendation:* choose a fast-cold-start runtime (Node.js or
  Python) on **arm64/Graviton** — typically ~20% cheaper *and* faster, helping both this pillar
  and Cost. Keep deployment bundles small to bound cold starts. *Where:* §3, §4 (Compute row).
- **[L] Name the cold-start trade-off.** Deferring provisioned concurrency is the right call at
  pilot scale; just state that first-request-after-idle latency is the accepted cost, with
  provisioned concurrency as the documented §14 lever if a synchronized cohort login proves it
  necessary. *Where:* §9A.4.

---

## 7. Cost Optimization — *Excellent*

**Already strong — the standout pillar.** Near-zero at rest; no fixed-cost line items; WAF,
Cognito Plus, Secrets Manager, and X-Ray all deferred behind explicit triggers; a single canonical
credit figure; a per-service cost table reconciled with `Service-Tradeoff-Analysis.md`; a $10/mo
budget alarm routed to the board. There is very little to add.

**Findings.**
- **[H/cost] CloudWatch Logs retention** (see §3) is the single most likely source of unplanned
  spend — closing it protects the whole cost model.
- **[M] arm64/Graviton** (see §6) is a direct ~20% compute saving.
- **[L] Add AWS Cost Anomaly Detection** (free) alongside the budget threshold — it catches a
  runaway-retry or misconfig spike days before a monthly threshold would. *Where:* §11, §12.

---

## 8. Sustainability — *Strong, but undocumented*

The sixth pillar is absent from the design doc, yet the architecture scores well on it almost by
construction — worth stating so the board sees the full Well-Architected coverage.

- **Scale-to-zero serverless** means no idle compute drawing power between cohorts — the single
  biggest sustainability win available to a bursty, low-traffic workload.
- **Managed services at high multi-tenant utilisation** (Lambda, DynamoDB on-demand, Cognito, SES)
  are more carbon-efficient per unit of work than a dedicated always-on server would be.
- **Edge caching** of curriculum (CloudFront) avoids redundant origin compute and data movement
  for repeated reads.
- **Data-minimisation + retention TTLs** (PII-free audit, 12-/24-month purges) keep the stored-data
  footprint — and its ongoing energy cost — small.
- **One concrete lever: arm64/Graviton**, which delivers more performance per watt than x86.

*Where to apply:* a short "Sustainability" subsection (or a row in §10's controls summary) noting
the above and pointing arm64 at both this pillar and Cost.

---

## 9. Recorded decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **MFA `REQUIRED` pool-wide** — TOTP admins, email-OTP students, no SMS | Cognito has no per-group MFA; pool-wide is the buildable, stronger option; email-OTP keeps student friction and cost low (uses SES); SMS avoided for toll-fraud/cost |
| D2 | **Custom domains under one parent** for Amplify / API GW / CloudFront; cookies `Domain=.parent; Secure; SameSite=None; HttpOnly` | Required for signed cookies to reach the curriculum distribution at all |
| D3 | **IaC = AWS SAM** (recommended) | Lowest-overhead path for a single maintainer; native canary/rollback |
| D4 | **KMS: AWS-managed keys, with a CMK for `AuditLog` + WORM bucket** *(pending board cost sign-off)* | Completes maintainer-cannot-tamper SoD; ~$1/mo/key is the only cost |
| D5 | **Lambda on arm64/Graviton**, pinned runtime | ~20% cheaper + faster; better performance-per-watt |

---

## 10. Prioritised action list

> **Status (applied in `Architecture-Design.md` Rev. 4):** all P0–P2 items below are now folded
> into the design doc's prose, diagrams, and §16 checklist — including the §2.1 MFA correction and
> the §2.2 signed-cookie domain topology (no longer review-only). The **single exception** is the
> **KMS CMK** (D4), written in as the recommendation **pending board cost sign-off** (~$1/mo/key).

**P0 — before build starts**
1. Rewrite the MFA model to pool-wide `REQUIRED` (D1); sync onboarding docs (§2.1).
2. Specify the custom-domain + cookie topology and add the cross-host integration test (§2.2).
3. Set CloudWatch Logs retention in IaC (§3).

**P1 — before launch**
4. Async on-failure destination/DLQ + alarm for `system-fn` (§3).
5. Commit to SAM (or CDK) and remove the either/or (§3).
6. KMS decision: CMK for audit + WORM, AWS-managed elsewhere (§4, D4).
7. CORS lockdown + `public-fn` input validation (§4).
8. Create the WORM bucket with Object Lock + versioning at creation (§4).
9. Standardise Lambda on arm64 + pin the runtime (§6).
10. Add the single-region DR statement for board acceptance (§5).
11. Fix or restore the `Architecture-Review.md` reference (§2.3).

**P2 — fast-follow / monitor**
12. Canary deployment with auto-rollback (§3).
13. API Gateway access logging (§3).
14. AWS Cost Anomaly Detection (§7).
15. SQS reserved concurrency + partial batch response (§5).
16. Explicit `/apply` residual-risk acceptance, named first for the WAF trigger (§4).
17. Add the Sustainability subsection (§8).

---

## 11. Addendum — self-serve supporter access (Rev. 3 design change)

After this review, the owner added a **self-serve supporter path**: a donation **auto-grants
access within minutes, without an interview**, via a **Zeffy read-only API reconcile poll**
(`system-fn` on its existing EventBridge schedule), matched to the application by email and
idempotent on the Zeffy payment ID. First sign-in uses a Cognito **temporary password**
(force-change) + MFA setup — **no password is stored in our DB**. This relaxes the prior
"`ACTIVE` only via admin grant" invariant; the new invariant is **"`ACTIVE` only via an admin
grant [beneficiary] or a server-verified payment [supporter]."** WA implications:

**Security**
- **Invariant preserved:** internet-facing code still cannot mint accounts — `system-fn` polls
  *outbound* and provisions; it is not internet-facing, and the poll verifies against Zeffy's
  authenticated read-only API (never a client redirect/signal). The supporter grant is gated on
  that server-side verification.
- **New surface / new secret:** a **read-only Zeffy API key** now exists (SSM SecureString,
  read-scoped to `system-fn`). Read-only = low blast radius; manual quarterly rotation (runbook).
  Keep it out of logs and the PII-free audit events.
- **Eligibility & minors:** the interview no longer backstops eligibility, so the **age/consent
  gate must run at `/apply` before the donate step** (under-13 blocked; 13–17 guardian consent) —
  now a build-checklist item and a journey requirement.
- **Refund/chargeback:** the poll flips the `Donations` row to `refunded` and triggers an
  **audited auto-`REVOKED`** — closing the "pay, get instant access, charge back" abuse path.
- **Quid-pro-quo:** instant paid-for access sharpens the IRS quid-pro-quo posture — board-approved
  receipt language is now a launch gate (`Service-Tradeoff-Analysis.md` §5; `Platform-SRS.md` §9).
- **[M] WAF re-prioritisation:** `/apply` + the donate funnel are now a more attractive abuse
  target (automated money+access), so they move to the **front of the §14 WAF trigger**; consider
  a basic rate rule on these routes sooner than the generic trigger.

**Reliability**
- **[M] New failure modes:** missed/late payments, Zeffy **Beta-API** changes, and the ~100
  req/min read-only limit. Mitigations: poll-failure alarm + unmatched-donation backlog alarm
  (added to the runbook), idempotent re-processing on `zeffyPaymentId`, and the **admin
  dashboard-confirm fallback** when email matching fails. Treat the Zeffy poll as the launch's
  most brittle dependency and the **first §14 trigger to Stripe** if it proves flaky.

**Operational Excellence** — new ops surface, all now in `Ops-Runbook.md`: weekly poll-health +
unmatched-donation check, quarterly Zeffy key rotation, and refund-verification / email-mismatch
incident playbooks. No new Lambda (stays within the 3-function launch shape).

**Cost / Performance / Sustainability** — unchanged posture: the poll is a handful of scheduled
invocations against a read-only API — **$0 fees, free-tier compute**. Latency is "minutes" by
design; Stripe (Appendix A of the design doc) remains the seconds-level upgrade if that matters.

**Added actions** (fold into §10): age/consent-before-donate **(P0)**; reconcile-poll alarms +
email-mismatch fallback **(P1)**; refund auto-revoke path **(P1)**; board-approved receipt
language **(P1)**; `/apply`+donate WAF rule moved earlier **(P2)**.

---

## Appendix A — corrected wording (paste-ready)

### A.1 MFA (replaces the §6.1 MFA bullet and the §4 Identity row)
> **MFA is mandatory for every account** (pool-wide Cognito `REQUIRED`). **Admins** enrol a
> **TOTP** authenticator; **students** use **email-OTP** (Cognito email-message MFA, delivered via
> the in-stack SES domain — low friction, ≈$0). **SMS MFA is not used** (toll-fraud exposure and
> per-message cost). Because Cognito MFA is a pool-level setting (it has no per-group mode),
> requiring it for all users is both the buildable option and a security upgrade over admin-only
> MFA. Admin-provisioned users complete MFA enrolment (an `MFA_SETUP` challenge) on first sign-in,
> alongside setting their password. If email-OTP is unavailable on the chosen Cognito tier or
> region, fall back to TOTP for all users.

### A.2 Cookie / domain topology (add to §9.2 and §16)
> **Domain & cookie topology (required).** The signed cookies `app-fn` issues are only sent to the
> curriculum distribution if they share a registrable parent domain. Deploy Amplify, API Gateway,
> and the curriculum CloudFront under **one parent** — e.g. `app.` / `api.` / `cdn.example.org` —
> and set cookies `Domain=.example.org; Secure; SameSite=None; HttpOnly; Path=<scoped prefix>`.
> `SameSite=None` is required because the curriculum host differs from the app host. **Acceptance
> test:** from the SPA origin, a real browser fetch of a curriculum object succeeds with valid
> cookies and 403s without them (proving the cookies actually reach CloudFront cross-host).
