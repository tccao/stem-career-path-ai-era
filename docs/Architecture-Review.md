# Senior Architecture Review — Architecture-Design.md

**Project:** STEM Graduates Career Path — AI Era (Code For Good)
**Doc under review:** `docs/Architecture-Design.md` (Draft for review)
**Review type:** Critical design review (pre-board-sign-off)
**Reviewer stance:** Senior architect, adversarial by request
**Context assumed:** Team of one (the author). No cohort yet. Board sign-off is the next gate.
**Date:** 2026-06-09

---

## Verdict

The architecture is directionally sound, unusually cost-literate, and the idempotency discipline
(conditional writes everywhere, at-least-once-tolerant consumers) is better than most production
systems I review. The decision to decouple payments to Zeffy at launch is the single best call in
the document — it deletes the hardest class of bugs (payment/provisioning races) before they exist.

It is, however, **not approvable by a board as written**, for four reasons that are about the
documents, not the AWS services: (1) the declared source-of-truth SRS describes a *static landing
page*, not this platform, so the board would be approving an architecture against a requirements
doc that doesn't authorize it; (2) the architecture doc and the trade-off doc **contradict each
other on board-facing numbers and decisions** (credit amount, WAF, hosting); (3) the content-gating
promise and the read-scaling strategy are **mutually exclusive as specified**; and (4) the
governance and operations model assumes people and processes that do not exist for a one-person,
zero-cohort program.

Every blocker below is fixable in documentation and scoping — none requires abandoning the
architecture.

---

## Findings index

| # | Severity | Finding |
|---|----------|---------|
| 1 | **Blocker** | SRS "source of truth" does not describe this product |
| 2 | **Blocker** | Content gating (§9.2) contradicts the static-CDN read strategy (§9A.3) |
| 3 | **Blocker** | Cross-document contradictions in board-facing numbers (credits, WAF, hosting) |
| 4 | **Blocker** | Governance model (§6.3) assumes an organization that doesn't exist yet |
| 5 | High | Hash-chained audit log is underspecified and likely breaks under concurrency |
| 6 | High | Minors' PII: no data classification, retention, or deletion design — and it collides with audit immutability |
| 7 | High | Admin MFA is "optional" for the account that can grant everything |
| 8 | High | No backup/DR posture beyond PITR on one table |
| 9 | High | Alarms with no owner: an alerting design for an on-call team of zero |
| 10 | High | Launch build carries dead Stripe machinery in diagram, checklist, and config |
| 11 | Medium | Six-function split vs. one maintainer — the doc argues against its own default |
| 12 | Medium | `byAccessEndsAt` GSI is not a valid index design as written |
| 13 | Medium | Email deliverability (SES sandbox, SPF/DKIM/DMARC) unaddressed — it's the only onboarding channel |
| 14 | Medium | Unauthenticated receipt upload surface contradicts the state machine's ordering |
| 15 | Low | Minor nits: 423 status code, Calendly vs Cal.com, secrets for keys that don't exist |

---

## Blockers

### 1. The declared source of truth does not describe this product

The architecture doc states `Source of truth: docs/Project SRS.md`. The SRS says, verbatim:
*"Project Type: Static landing page + maintainable documentation"* and *"Avoid unnecessary
frameworks or build tools in the MVP."* The architecture describes a multi-table, multi-Lambda,
Cognito-backed vetted-access learning platform with audit infrastructure and a governance
hierarchy.

A senior reviewer's first question — and a diligent board member's — is: **where is the approved
requirement for any of this?** The Customer-Journey and Sitemap docs describe the platform, but
they all cite the same SRS as source of truth, so the requirements chain is circular: design docs
authorizing each other.

**Why it matters for sign-off:** the board would be approving spend, data custody (including
minors' data), and an operating commitment based on a requirements doc that authorizes a brochure
page. If scope was intentionally expanded, that expansion is the actual decision the board is
making, and it deserves its own document.

**Fix:** write a short Platform SRS (or an SRS v2 addendum): scope, user count assumptions,
data handled, what the board is being asked to approve, and the explicit statement that the
landing page (SRS v1) ships first and the platform is a separate phase. Re-point "source of truth"
at it. Half a day's work; removes the largest credibility hole.

### 2. Content gating and the read-scaling strategy cannot both be true

§9.2 promises: *"The check runs on every learning read/write against StageLocks"* — locked stages
are server-side enforced, the client never decides.

§9A.3 promises: *"The SPA shell, curriculum, and images live in S3 behind CloudFront edge caches…
zero Lambda, zero DynamoDB"* and *"Do not put shared, identical content in DynamoDB — keep it
static on CloudFront."*

If the curriculum is publicly cacheable static content on the CDN, then **no server-side gating
check runs when a student loads it.** Stage locks become a client-side UI affordance: any student
(or any ex-member with a saved URL, or anyone who reads the SPA bundle's route table) can fetch
locked, expired, or revoked content directly from CloudFront. The doc's own security claims —
"server-side enforcement," "revocable access," "gated progression" (§10) — are not met for the
asset that is the entire product: the learning content.

**Fix — pick one and write it down:**

- **CloudFront signed cookies** issued at login with a short TTL, content under a protected path
  behind a CloudFront key group. Keeps the edge-cached economics; adds revocation latency equal to
  cookie TTL. This is the option most consistent with §9A.3.
- **Content metadata via API, bodies via short-TTL presigned URLs** per stage — true per-stage
  gating, more moving parts.
- **Honest downgrade:** declare gating a progression-UX feature, not a security control, and
  delete the security claims in §9.2/§10. Defensible for a learning program — but it must be a
  stated decision, not an accidental contradiction.

### 3. The two board-facing documents disagree with each other

The board will read the architecture doc and the Service-Tradeoff-Analysis together. They
currently conflict:

| Topic | Architecture-Design.md | Service-Tradeoff-Analysis.md |
|-------|------------------------|------------------------------|
| AWS nonprofit credits | "$2,000/yr AWS Nonprofit Credit that covers this bill" (§12) | "$1,000 in AWS nonprofit credits ($95 fee per $1,000, max $5,000)" as the planning target |
| WAF | §16 checklist makes the WAF web ACL a launch acceptance criterion; §4 notes "CloudFront required for WAF attachment" | "Do **not** enable Amplify WAF by default on day one"; launch lean, add WAF when evidence justifies it |
| Frontend hosting | "Amplify Hosting **or** S3 + CloudFront", but the WAF requirement implies CloudFront | Amplify Hosting, chosen, because Code For Good already uses it |

The WAF row is the worst: **the launch checklist cannot be satisfied by the recommended hosting
choice without the $15/month Amplify-WAF surcharge the companion doc explicitly advises against.**
And against a $25–200/year total run cost, WAF at ~$20–25/month (ACL + ~10 rules + Amplify
integration fee) is not a "small fixed cost" (§12) — it would be the single largest line item,
larger than everything else combined.

**Fix:** reconcile before anything goes to the board. Recommended resolution: adopt the trade-off
doc's position (lean launch, Amplify, no WAF day one), move the WAF web ACL from §16's launch
checklist to a phase-2 trigger ("enable when WAF-relevant abuse is observed or cohort > N"), and
make the credit figure match whichever number is real.

### 4. The governance hierarchy assumes an organization that doesn't exist

§6.3 is a textbook multi-account governance design: AWS Organizations management account, SCPs,
board custodians holding sealed hardware-MFA root credentials, IAM Identity Center permission
sets, an alarmed break-glass role.

The actual situation: **one person**, who is simultaneously Tier 0 custodian, Tier 1 website
admin, Tier 2 application admin, and the author of the SCPs that supposedly constrain him. There
is no second custodian, no one to receive the break-glass alarm, and (presumably) no Organizations
setup yet. Presenting §6.3 as the launch design invites the board to believe a separation of
duties exists when it cannot.

This matters more, not less, because the audience is a board: the section's stated purpose is
accountability *to them*, and as written it documents an aspiration as if it were a control.

**Fix:** split §6.3 into **Day-1 actual** and **Target state**. Day-1 actual, honestly stated, is
still respectable: single account; root sealed with MFA and credentials lodged with a named board
member (this single step gives the board real ultimate authority today); admin IAM principal with
mandatory MFA; CloudTrail on; billing alarm to a board email. Target state is the existing §6.3,
with a trigger (second maintainer joins, or first real cohort) for adopting Organizations/SCPs.

---

## High-severity findings

### 5. The hash-chained audit log is underspecified — and probably broken under concurrency

§7.2 defines `prevHash`/`hash` per event, with PK `targetType#targetId`. Two problems:

- **Which chain?** If the chain is global, every append must read the current global tail —
  a single serialization point. Two concurrent Lambdas will read the same `prevHash` and fork the
  chain; DynamoDB gives you no total order to verify against. If the chain is per-entity
  (consistent with the PK), concurrent writes to the *same* entity still race the tail read, and
  the doc never says which design is intended.
- **Who verifies?** §7.3 mentions "a verifier job" that appears nowhere else: not in the function
  table (§3), the IAM table (§6.2), the alarms (§11), or the checklist (§16). A hash chain nobody
  verifies, with no external anchor, is decorative — it adds write-path complexity and a new
  failure mode (chain-fork bugs) for zero realized assurance.

**Fix:** for this threat model (a compromised function or admin trying to rewrite history), the
**IAM append-only policy + CloudTrail data events on the table is already the real control**, and
the doc says so itself. Recommended: drop the hash chain at launch; instead, schedule a daily
export of the AuditLog to the Object-Lock S3 bucket (that's your tamper-evident anchor, and it's
~10 lines of config). If the chain is kept, specify: per-entity chain, tail item per entity with a
conditional-write version counter, the verifier function, its schedule, and its alarm.

### 6. Minors' data has no lifecycle design — and collides with audit immutability

The SRS explicitly targets high-school students; the trade-off doc flags COPPA and guardian
consent as open leadership items. The architecture is silent on all of it:

- **No data classification or retention.** Rejected applicants' PII (name, background, links,
  email) apparently lives in `Applications` forever. No table has a stated retention period
  except the AuditLog (≥2 years — chosen for accountability, not privacy).
- **PII inside the immutable log.** The §7.2 event schema captures `before`/`after` object
  snapshots, `sourceIp`, and `userAgent` into a log that is append-only by IAM and exported to
  WORM storage. The doc's own §6.3 boast — "even the board cannot silently rewrite history" —
  means **nobody can honor a deletion request for whatever lands in that log.**
- **No consent gate.** `/apply` collects PII from possibly-under-13 users with no age screen or
  guardian-consent step in the design.

**Fix:** (a) audit events carry **IDs and state codes, not value snapshots** — `before/after`
become `{"status": ...}` only, never names/emails/free text; (b) define retention per table
(e.g., rejected applications purged after 12 months via TTL attribute); (c) add an age/consent
question to `/apply` and a stated minimum age or guardian-consent flow; (d) add a one-paragraph
data-handling summary for the board — they are the data controller and should approve it.

### 7. Admin MFA is optional

§15.1: "Optional MFA for admins recommended." The application admin account approves applicants,
grants/revokes all access, reads all applicant PII, and overrides stage locks. With a team of one,
it is the platform's single point of compromise, and phishing one email/password is the cheapest
attack in the entire threat model — far cheaper than anything WAF or Cognito Plus defends against.

**Fix:** mandatory TOTP MFA for the `admin` group, day one. Costs nothing on Essentials. It is
strictly inconsistent to budget for WAF rate rules while leaving the highest-value credential
single-factor.

### 8. No backup/DR posture

PITR is specified for `AuditLog` only. Nothing for `Members`, `Applications`, `Progress`,
`StageLocks` — the tables whose loss would actually end the program. No RTO/RPO statement, no
restore runbook, no mention of what happens if a bad deploy or a fat-fingered console action
(remember: one admin, no peer review) drops a table.

**Fix:** PITR on every table (pennies at this scale); a written 10-line restore procedure; and a
deletion guardrail (`deletion protection` flag on tables, which DynamoDB supports natively). This
is a half-day of work and belongs in the §16 checklist ahead of several items currently on it.

### 9. An alerting design with no one on call

§11 lists a respectable alarm set — DLQ depth, login-failure spikes, AuditLog delete attempts,
CloudTrail delivery failures, root usage. Unanswered: **delivered to whom, and what happens when
that one person is asleep, on vacation, or has graduated?** The SRS's stated maintainers are
rotating student volunteers.

**Fix:** name the alarm destination (an alias that includes a board contact for the severe
subset: root usage, audit-delete attempts, billing); accept in writing that response is
best-effort within days, not minutes; and replace aspirational 24/7-style alerting with a
**weekly 15-minute ops checklist** (DLQ empty, CloudTrail delivering, billing within budget,
backup restore tested quarterly). For this team size, a checklist is a real control; an
unowned alarm is not.

### 10. The launch build carries dead Stripe machinery

The doc says Stripe is deferred, but the launch artifacts don't agree: the §2 diagram routes
`STR → GW → Lhook → SQS`, §8.1 ships a WAF rule for `/webhooks/stripe`, §4/§6.2 scope Secrets
Manager around "Stripe keys" that won't exist, and the `Donations` table carries a
`byStripeEventId` GSI with no writer. For a board audience this reads as either unfinished
editing or scope confusion; for a builder it's config that can drift and a WAF rule guarding a
route that doesn't exist.

Related scope question the doc should answer rather than assume: **does launch need SQS at all?**
The queue's stated purpose is absorbing webhook spikes and separating the payment path from
account creation. At launch the producer is one admin clicking "grant" a few dozen times a
cohort. `admin-fn` could enqueue — or simply invoke the same idempotent provisioning logic
synchronously — with identical conditional-write guarantees. Keeping the queue is defensible
(it preserves the future seam and the IAM separation of `AdminCreateUser`), but the doc should
argue it, because every component is a thing the sole maintainer debugs at 11pm.

**Fix:** produce a **launch-state diagram** (no Stripe, no webhook-fn, no webhook WAF rule, no
Stripe secrets) and move the automated-payment architecture to an appendix labeled "future
phase." Keep the SQS decision either way, but write down why.

---

## Medium-severity findings

### 11. Function granularity: the doc argues against its own default

§3 presents the 6-function split as the design, then concedes a 4-function collapse "if even this
is too much ops overhead for v1." For one maintainer and zero users, it is too much: six execution
roles, six log groups, six sets of env config to keep coherent in SAM/CDK — versus the one
separation that §3 itself identifies as security-critical (only `provisioning-fn` holds
`AdminCreateUser`). Resolve open decision §15.4 now rather than at build time: **launch with
public-fn / app-fn / provisioning-fn** (3 functions; student+admin share a codepath with the JWT
group check the doc already requires), and split further when there's a second maintainer. The
trust-boundary table remains correct as the target.

### 12. `byAccessEndsAt` is not a valid GSI design as written

A DynamoDB GSI needs a partition key; "query `Members.byAccessEndsAt <= today`" across all members
isn't expressible against an index keyed only by `accessEndsAt`. Either (a) define the GSI as
PK = `status` (value `ACTIVE`), SK = `accessEndsAt`, and query `status = ACTIVE AND accessEndsAt
<= now` — correct and cheap; or (b) admit it's a filtered scan, which is honestly fine at
hundreds of members, but then §5.2/§9.3 shouldn't call it an index query. Same nit applies to
`expiry-scheduler-fn`'s IAM row, which says "scan."

### 13. Email deliverability is a hard dependency with no design

Every critical touchpoint — approval, credentials, expiry warnings — is an SES email. The doc
never mentions leaving the SES sandbox (production access request), domain verification, or
SPF/DKIM/DMARC. A welcome email in a spam folder is a failed onboarding for this program. Add a
checklist line: SES production access approved; DKIM + SPF + DMARC configured on the sending
domain; bounce/complaint handling pointed at a monitored address.

### 14. The receipt-upload surface contradicts the state machine's ordering

`public-fn` (unauthenticated) can mint presigned PUTs to the receipts bucket, but the
Customer-Journey state machine only reaches `RECEIPT_REVIEW` *after* an interview and a
`DONATION_REQUIRED` decision. As specified, any anonymous visitor can request upload URLs and fill
the bucket (cost + junk + potential malware storage; there is no AV-scan story). Scope the
presigned-PUT issuance to applications actually in `DONATION_REQUIRED` (a per-application token in
the email link is enough), keep the short TTL and content-length limits, and note that receipts
at launch may not even need uploads — Zeffy's dashboard is the admin's confirmation source.

---

## Low-severity nits

`423 Locked` is a WebDAV status; `403` with a machine-readable reason body is more conventional
for stage gating. The scheduling vendor differs between docs (Calendly in architecture, "Cal.com
or Calendly" in trade-off) — trivial, but board documents should match. The §7.2 example event
shows an application transition to `APPROVED_BENEFICIARY` while §5.1's `Applications.status`
column references the Customer-Journey states — consistent, but the `accessBasis` enum
(`beneficiary|supporter`) vs. state names (`APPROVED_BENEFICIARY`) mapping deserves one explicit
table. X-Ray and Athena are listed as launch components; both are "turn on when investigating"
tools and can be dropped from the checklist without loss.

---

## What is genuinely good (keep these)

Credit where due, because the board should also hear what's right: the **conditional-write
idempotency discipline** (§9.1, §9A.1) is the strongest part of the design and is exactly how
this class of system should be built. **Decoupling donations to Zeffy** removes PCI scope,
webhook-replay risk, and the payment→provisioning race in one decision, and §9A.1 correctly
recognizes that it shrinks the idempotency surface. The **per-function least-privilege intent**,
the **append-only-by-IAM audit posture**, the **server-side-enforcement principle**, the
scale-to-zero economics, and the §14 migration honesty (start serverless, graduate only on
evidence) are all senior-level reasoning. The flaws above are concentrated in *consistency between
documents* and *fit to the actual team*, not in the architectural instincts.

---

## Recommended path to sign-off

1. **Re-baseline requirements** (finding 1): short Platform SRS; landing page = phase 0.
2. **Reconcile the doc set** (findings 3, 10): one credit number, WAF to phase 2, Amplify
   hosting confirmed, launch-state diagram without Stripe.
3. **Resolve the gating contradiction** (finding 2): pick signed cookies or declare gating
   UX-only; update §9.2/§10 claims to match.
4. **Right-size for one human** (findings 4, 9, 11): Day-1 governance actual vs. target;
   3-function launch; weekly ops checklist; named alarm/board contacts.
5. **Close the cheap, high-value security items** (findings 6, 7, 8): mandatory admin MFA,
   PITR + deletion protection everywhere, PII-free audit events, retention TTLs, age/consent
   gate.
6. **Simplify the audit story** (finding 5): drop the hash chain at launch in favor of
   IAM append-only + CloudTrail data events + daily Object-Lock export; or fully specify the
   chain and its verifier.

Items 2–6 are roughly two to four days of documentation and template work combined. After them,
this is an architecture a board can approve with confidence — and one person can actually run.

---

## Resolution log — 2026-06-09 (all findings resolved)

Fixes were applied with a bias toward the **lowest-cost structure on Amplify + AWS serverless**.

| # | Finding | Resolution |
|---|---------|------------|
| 1 | SRS doesn't authorize the platform | **New `docs/Platform-SRS.md`** (scope, scale, data handling, board asks); all design docs re-pointed to it; scope note added to `Project SRS.md` (Phase 0) |
| 2 | Gating vs static-CDN contradiction | Curriculum moved to a **private S3 bucket served via `app-fn` gating check + short-TTL presigned GETs**; public content stays on Amplify CDN; checklist now includes a direct-URL fetch test (`Architecture-Design.md` §9.2, §16) |
| 3 | Cross-doc contradictions | **\$1,000 credit target** is canonical (the \$2,000 claim withdrawn); **no WAF at launch** (phase-2 trigger, §8.3/§14), matching the trade-off doc; **Amplify Hosting confirmed**; Calendly/Cal.com aligned |
| 4 | Governance assumes nonexistent org | §6.3 split into **Day-1 actual** (single account, sealed root with board custodian, MFA everywhere, explicit deny on audit tampering) vs. **target state** (Organizations/SCPs, Appendix B) with a named trigger |
| 5 | Hash chain broken/unverified | **Dropped.** Tamper-evidence = IAM append-only + CloudTrail data events + **daily incremental export to Object-Lock WORM** (§7.3) |
| 6 | Minors' PII / retention / immutability collision | **PII-free audit events** (IDs + status codes only); TTL retention on `Applications` (rejected +12 mo); age/consent gate on `/apply`; board-facing data table in `Platform-SRS.md` §6 |
| 7 | Admin MFA optional | **Mandatory TOTP MFA** for the `admin` group and all human AWS identities (§6.1, §6.3) |
| 8 | No DR posture | **PITR + deletion protection on every table** (in IaC); RPO ≤ 24 h / RTO ≤ 1 business day; tested restore procedure in **`docs/Ops-Runbook.md`** §4 |
| 9 | Alarms with no owner | Alarm routing table with named maintainer + **board contact** for severe alerts; weekly 15-minute ops checklist (`Ops-Runbook.md` §1–2; §11) |
| 10 | Dead Stripe machinery | **Launch-state diagram has no Stripe/webhook/secrets**; entire payment phase moved to **Appendix A**; SQS retained with written rationale (§4) |
| 11 | Function granularity | **Resolved: 3 functions** (`public-fn`/`app-fn`/`system-fn`); 6-way split is an Appendix B trigger (second maintainer) |
| 12 | Invalid GSI design | `Members.byStatusAccessEnds` — PK `status`, SK `accessEndsAt`; expiry sweep is a key-condition query (§5.1, §9.3) |
| 13 | Email deliverability | SES production access + SPF/DKIM/DMARC + bounce routing added to §16 checklist; spam-failure runbook entry |
| 14 | Anonymous receipt-upload surface | **Receipts path deleted from launch** (Zeffy dashboard is the confirmation source); tokened upload design preserved in Appendix A |
| 15 | Nits | `423`→`403` with reason body; scheduling vendor aligned; Secrets Manager removed (no secrets exist); X-Ray/Athena off the launch checklist |

**Cost effect of the fixes:** launch bill loses its largest items (WAF ~\$300/yr, Cognito Plus,
Secrets Manager, receipts bucket, CloudFront-for-WAF) and stays at **≈ \$25–200/yr gross → \$0 net**
against the \$1,000 credit target — now consistent across all board-facing documents.
