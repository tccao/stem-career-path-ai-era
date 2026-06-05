# Customer Journey — STEM Career Path (AI Era)

**Project:** STEM Graduates Career Path — AI Era (Code For Good)
**Doc type:** Personas + Access Lifecycle + End-to-End Journey Maps
**Owner:** Tinh Cao
**Status:** Draft for review
**Source of truth:** `docs/Project SRS.md`
**Companion docs:** `docs/Sitemap-and-Wireframes.md` · `docs/Architecture-Design.md`
**Credential model:** Email + password (resolved)

---

## 0. Purpose

This document describes **who the people are** and **the path they travel** through the
platform — from first hearing about the program to finishing (or lapsing). It is the human
counterpart to the structural `Sitemap-and-Wireframes.md` and the technical
`Architecture-Design.md`. The access lifecycle here is what the architecture enforces server-side.

Access is **earned and vetted, not open.** Every member arrives through one of two acquisition
paths that both end in an Admin-provisioned account:

- **Beneficiary path** — an eligible nonprofit beneficiary is granted **free** access after a
  short interview.
- **Supporter path** — an applicant who does not meet beneficiary criteria **donates** to unlock
  access; payment is confirmed, then access is granted.

This gives a human eligibility gate (protects scarce free seats) plus a self-funding route, while
keeping the platform itself off the payment-data path.

---

## 1. Personas

### 1.1 Primary learner personas

| Persona | Who | Stage | Suggested path | Top need |
|---------|-----|-------|----------------|----------|
| **New Grad** | Graduated (or about to), no offer yet | Recent graduate | Fast Track, or Roadmap pillars 1, 2, 3, 8 | A deployed project + market presence fast |
| **Current Student** | In school, long runway | Still in school | Full Roadmap (pillars 1, 2, 4, 7 first) | Build readiness over multiple terms |
| **Upskilling Professional** | Working, wants AI-era skills | Recent grad / professional | Fast Track, or Roadmap pillars 1, 6, 7 + a specialization track | Targeted upskill without quitting |

These personas drive the path/pillar focus the platform can **suggest** at onboarding — they are
recommendations, not hard assignments. The actual path is chosen at onboarding (self-select or
Admin-assigned from the interview) and can only be switched by an Admin.

### 1.2 Persona snapshots

**Maya — New Grad.** Finished a CS degree, six months of applications, no offers. Feels the gap
between "has a degree" and "can show deployed work." Anxious about time and money. Wants a fast,
structured sprint that ends in something she can link on LinkedIn. → **Fast Track**, supporter or
beneficiary depending on eligibility.

**Jordan — Current Student.** Sophomore, two+ years of runway, unsure where to start. Motivated
but easily overwhelmed by scattered advice. Wants a long, paced trail with feedback. → **Full
Roadmap**, likely beneficiary.

**Sam — Upskilling Professional.** Junior IT role, wants to move into AI/automation work. Limited
hours, willing to pay. Wants high signal-to-noise and a credential path. → **Fast Track** or
targeted Roadmap pillars, supporter.

### 1.3 Operator persona

**The Program Owner (Admin).** Reviews applications, runs 15-minute interviews, decides
beneficiary vs. donor, provisions accounts, manages durations and revocations, and holds the
content-gating **override** privilege. Optimizes for low admin time and clean nonprofit
accountability — every decision they make is audit-logged.

---

## 2. Roles & access basis

Two roles this sprint: **Student/Participant** and **Admin/Program Owner**. The access *basis*
(how a seat was earned) is recorded on the member but does **not** change in-app permissions — a
beneficiary and a supporter see the same Student app.

| Field | Values | Purpose |
|-------|--------|---------|
| `role` | `student` \| `admin` | Controls protected routes |
| `accessBasis` | `beneficiary` \| `supporter` | Impact reporting + donor records |
| `status` | see §4 lifecycle | Drives sign-in eligibility |

---

## 3. The journey at a glance

```mermaid
journey
    title STEM Career Path — member journey
    section Discover
      Land on Home: 4: Guest
      Read mission + 8 pillars: 4: Guest
      Decide to apply: 3: Guest
    section Apply & vet
      Submit application: 4: Applicant
      Book 15-min interview: 3: Applicant
      Eligibility decision: 2: Applicant, Admin
    section Unlock access
      Beneficiary - free grant: 5: Applicant, Admin
      Supporter - donate & confirm: 3: Applicant, Admin
      Account provisioned: 5: Admin
    section Onboard
      First sign-in (email + password): 4: Student
      Pick or receive path: 4: Student
      Readiness self-assessment: 3: Student
    section Learn
      Work pillars or daily deliverables: 4: Student
      Submit proof-of-work links: 4: Student
      Earn badges, unlock stages: 5: Student
    section Complete or lapse
      Job-ready - portfolio + outreach: 5: Student
      Access expires or is revoked: 2: Student, Admin
      Re-apply or extend: 3: Student, Admin
```

Five macro-stages: **Discover → Apply & Vet → Unlock Access → Onboard → Learn →
Complete/Lapse.** The two acquisition paths diverge only in the "Unlock Access" stage and
converge again at provisioning.

---

## 4. Access lifecycle (state machine)

Every application moves through a guarded state machine. Transitions are **idempotent** and
protected by conditional writes, so a retry or a duplicate webhook can never double-provision or
skip the gate (enforced in `docs/Architecture-Design.md`).

| State | Meaning | Set by |
|-------|---------|--------|
| `SUBMITTED` | Basic form received; in admin queue | Applicant |
| `INTERVIEW_SCHEDULED` | Calendly 15-min call booked / pending | Admin / Applicant |
| `APPROVED_BENEFICIARY` | Passed vetting → free access | Admin |
| `DONATION_REQUIRED` | Not eligible for free; must donate | Admin |
| `PAID_AUTO` | Stripe webhook confirmed payment | System |
| `RECEIPT_REVIEW` | Manual receipt uploaded; awaiting check | Applicant → Admin |
| `ACTIVE` | Account provisioned; can sign in | System / Admin |
| `EXPIRED` / `REVOKED` | Access ended | System / Admin |
| `REJECTED` | Declined at interview | Admin |

```mermaid
stateDiagram-v2
    [*] --> SUBMITTED: applicant submits form
    SUBMITTED --> INTERVIEW_SCHEDULED: admin sends Calendly link
    INTERVIEW_SCHEDULED --> APPROVED_BENEFICIARY: eligible (free)
    INTERVIEW_SCHEDULED --> DONATION_REQUIRED: not eligible (donate)
    INTERVIEW_SCHEDULED --> REJECTED: declined

    DONATION_REQUIRED --> PAID_AUTO: Stripe webhook "paid"
    DONATION_REQUIRED --> RECEIPT_REVIEW: manual receipt uploaded

    APPROVED_BENEFICIARY --> ACTIVE: provision (free)
    PAID_AUTO --> ACTIVE: auto-grant
    RECEIPT_REVIEW --> ACTIVE: admin verifies

    ACTIVE --> EXPIRED: window ends
    ACTIVE --> REVOKED: admin revokes
    EXPIRED --> SUBMITTED: re-apply
    REVOKED --> SUBMITTED: re-apply
    REJECTED --> SUBMITTED: re-apply (after cooldown)
    REJECTED --> [*]
    EXPIRED --> [*]
    REVOKED --> [*]
```

No path reaches `ACTIVE` without either `APPROVED_BENEFICIARY` (free) or confirmed payment
(`PAID_AUTO` or Admin-verified receipt). That two-path integrity is a core security property.

---

## 5. End-to-end access flow (with actors)

```mermaid
sequenceDiagram
    actor A as Applicant
    actor Ad as Admin (owner)
    participant Sys as Platform (AWS)
    participant Cal as Calendly (ext)
    participant Pay as Stripe (ext)
    participant Mail as SES email

    A->>Sys: 1. Submit application (name, email, stage, track, reason)
    Sys-->>Ad: enters queue [SUBMITTED]
    Ad->>Mail: 2. Email Calendly link
    Mail-->>A: 15-min call invite
    A->>Cal: 3. Self-book 15-min call [INTERVIEW_SCHEDULED]
    Ad->>Ad: 4. Eligibility decision

    alt Beneficiary (free)
        Ad->>Sys: mark [APPROVED_BENEFICIARY]
    else Not eligible → donate
        Ad->>Sys: mark [DONATION_REQUIRED]
        A->>Pay: 5. Donate via hosted Stripe Checkout
        alt Integrated
            Pay-->>Sys: 6a. Signed webhook "paid" [PAID_AUTO]
        else Offline / other channel
            A->>Sys: 6b. Upload receipt → private S3 [RECEIPT_REVIEW]
            Ad->>Sys: verify receipt
        end
    end

    Sys->>Sys: 7. Provision: add email to members DB,<br/>role=student, accessBasis, duration [ACTIVE]
    Sys->>Mail: notify approved
    Mail-->>A: sign-in instructions
    A->>Sys: 8. Sign in /login (email + password) → /app
    Note over A,Sys: 9. Valid until end condition → [EXPIRED] (/access/expired)<br/>or [REVOKED] by admin
```

**Reject branch:** at step 4, **REJECTED** → optional decline / re-apply email.

### 5.1 Donation & payment handling (hybrid)

- **Integrated (auto):** redirect to **Stripe Checkout** (hosted page). On the
  `checkout.session.completed` webhook (signature-verified, event-id de-duped), the system moves
  the application `PAID_AUTO` → `ACTIVE`.
- **Manual (fallback):** applicant uploads a receipt; stored in a **private S3 bucket**
  (server-side encrypted, presigned upload, lifecycle auto-delete); Admin verifies → `ACTIVE`.
  Covers donations through near-zero-fee nonprofit channels (e.g., Zeffy, PayPal Giving Fund).
- **PCI posture:** the app **never sees card data** — all card entry happens on the processor's
  hosted page, keeping the lightest PCI scope (SAQ-A). The platform stores only a payment
  reference / receipt, never a card number.
- **Edge cases (later):** refund/chargeback → optional auto-revoke; duplicate payment →
  idempotent grant; partial/under-amount → admin review.

### 5.2 Interview step (Calendly)

After the form, the Admin sends a **Calendly free-tier booking link** by email; the applicant
self-books a 15-minute call against the Admin's open blocks. The call decides beneficiary
eligibility vs. donor path. To save admin time, the call can be **required only on the
donor/borderline path** and skipped for clearly eligible beneficiaries. Calendly holds only
scheduling data; no program PII flows through it.

---

## 6. Journey stage map (experience layer)

What the person is trying to do, where they touch the product, how they feel, where it can break,
and what we can do about it.

### Stage 1 — Discover  (`/`, `/donate`)

- **Goal:** Understand what the program is and whether it's for me.
- **Touchpoints:** Home hero, 8-pillar preview, How It Works, Two Paths, impact stories, FAQ.
- **Emotion:** Curious but skeptical ("is this legit / for someone like me?").
- **Pain points:** Unclear who qualifies; unclear cost (free vs. donate).
- **Opportunities:** Lead with eligibility clarity ("free for eligible beneficiaries, donation
  unlocks a seat otherwise"); show both tracks side by side so visitors self-identify.

### Stage 2 — Apply & vet  (`/apply` → `/apply/submitted`, Calendly)

- **Goal:** Request access and prove I'm a fit.
- **Touchpoints:** Application form, "Application received" page, Calendly email, 15-min call.
- **Emotion:** Hopeful, a little exposed (sharing background/reason).
- **Pain points:** Waiting with no status; not knowing what happens next; interview-scheduling
  friction.
- **Opportunities:** Set expectations on the confirmation page (review timeline, that email is the
  channel); make the Calendly link arrive promptly; keep the form short.

### Stage 3 — Unlock access  (beneficiary grant OR `/donate` → Stripe / receipt)

- **Goal:** Get over the access gate.
- **Touchpoints:** Beneficiary approval email, or Stripe Checkout / receipt upload.
- **Emotion:** Relief (approved) **or** decision friction (asked to donate).
- **Pain points:** Donation framed as a paywall can feel transactional for a nonprofit; receipt
  path is slow (manual verify).
- **Opportunities:** Frame the supporter path as "fund a seat" (mission language, not paywall);
  auto-grant on Stripe webhook so paid supporters get in within seconds; keep the receipt
  fallback for low-fee channels.

### Stage 4 — Onboard  (`/login`, `/app`, `/app/path`, readiness)

- **Goal:** Get in, orient, and start.
- **Touchpoints:** First sign-in (email + password set on first login), dashboard, path
  selection, readiness self-assessment.
- **Emotion:** Motivated, wants a clear "start here."
- **Pain points:** Password setup friction; choice paralysis on path; readiness left "not
  started."
- **Opportunities:** Pre-suggest the path from the interview/persona; make "Continue Learning"
  and "Start readiness" the two obvious first actions; keep `/auth/*` reset flow easy.

### Stage 5 — Learn  (`/app/pillars/*` or `/app/fasttrack/*`, `/app/resources`, `/app/progress`)

- **Goal:** Make real, provable progress.
- **Touchpoints:** Pillar phases / daily deliverables, 5-min video modules, deliverable
  link submission, badges, gig ladder.
- **Emotion:** Engaged when unlocking; frustrated when blocked.
- **Pain points:** Hard-locked stages can feel punitive; "submit a link" is unfamiliar; momentum
  loss between sessions.
- **Opportunities:** Make the lock reason explicit ("complete Day 3 deliverable to unlock Day 4");
  Admin override for legitimate edge cases; "What's New" + progress bars to pull people back.

### Stage 6 — Complete or lapse  (`/app/progress`, `/access/expired`, re-apply)

- **Goal:** Reach job-readiness / a deployed project — or gracefully exit.
- **Touchpoints:** Progress milestones, expiry/revoke notices (SES), `/access/expired`, re-apply.
- **Emotion:** Accomplished (graduate badge) **or** disappointed (window closed mid-progress).
- **Pain points:** Expiry can interrupt unfinished work; unclear how to extend.
- **Opportunities:** Proactive expiry reminders (EventBridge-scheduled) with an extend/re-apply
  path; capture an optional testimonial/earnings log at graduation for nonprofit impact reporting.

---

## 7. Learning journeys within each path

### 7.1 Path A — Full Roadmap (Current Student / long runway)

```text
Onboard → Pillar 1 (AI skills) → Pillar 2 (portfolio) → Pillar 3 (gig, Wk3+)
   → Pillar 4 (brand) → Pillar 5 (micro-internships) → Pillar 6 (certs)
   → Pillar 7 (tooling) → Pillar 8 (community) → Graduate
```

- **Unlocks by badge/stage.** A later phase stays 🔒 until the prior stage is complete or the
  required milestone/badge is earned.
- **Earn-While-You-Learn ladder** runs alongside from Week 3 (Week 3 → \$50–100 … Month 4+ →
  \$500–2,000/mo retainers), surfaced via **gig milestone badges** Starter → Builder → Earner →
  Professional → Graduate.
- **Specialization track** (AI Product Builder / AI Data Engineer / AI Automation Specialist) is
  picked by Month 2 and tagged on the profile, filtering projects/gigs/certs.
- **Suggested milestone arc** mirrors the SRS During-School track: Foundation & self-assessment →
  AI-era skill building → Portfolio development → Certifications & tooling → Micro-internships →
  Career materials & interview prep.

### 7.2 Path B — 4-Week Fast Track (New Grad / Upskiller)

```text
Onboard → Wk1 (LLM foundations) → Wk2 (prompt like a pro) → Wk3 (build & deploy)
   → Wk4 (market-ready) → first proposals out
```

- **Unlocks day-by-day.** One measurable output per day; commit to GitHub daily; Day N+1 opens
  when Day N's deliverable is submitted.
- **Accelerated route for grads:** do Weeks 1–2 first, then run Weeks 3–4 in parallel.
- **Week 4** includes the **5 prompt-engineering interview questions** prep set and the
  market-ready push (LinkedIn, cert fast-track, gig setup, outreach).
- **Capstones per week:** token counter → prompt-audit tool → deployed project (live URL + CI/CD +
  Loom) → updated profile + first proposals.

Both paths share the proof-of-work model: **progress = deliverables completed**, recorded mostly
as **external links** (GitHub / URL / Loom / LinkedIn), not files the platform hosts.

---

## 8. Re-engagement, expiry & re-application

- **Expiry reminders** — EventBridge-scheduled SES emails before the access window closes, with an
  "extend" or "re-apply" link.
- **Expired / revoked** → `/access/expired`; the screen offers *Contact program owner* and
  *Re-apply*. Re-application re-enters the state machine at `SUBMITTED`.
- **Open decision:** whether a rejected/expired applicant can re-apply, and after how long
  (cooldown). Tracked in `docs/Sitemap-and-Wireframes.md` §7.
- **Admin levers** on a member row: **Edit · Extend · Revoke · Unlock stage.** Extend pushes the
  access window; Revoke moves to `REVOKED`; Unlock stage is the per-student content-gating
  override — all four are audit-logged.

---

## 9. Trust & accountability touchpoints

The journey is built so the person can trust the gate and the org can account for every decision:

- **Allowlist + human vetting** — only Admin-provisioned emails become accounts; an interview
  gates free seats.
- **Payment isolation** — hosted checkout means no card data in the app (PCI SAQ-A); supporters
  see a trusted Stripe page.
- **Transparent access status** — the learner always sees their status, access window, and who
  granted it on `/app/profile`.
- **Logged decisions** — every admin action (approve / reject / provision / extend / revoke /
  unlock-override) is recorded for nonprofit accountability; the audit-trail design lives in
  `docs/Architecture-Design.md`.

---

## 10. Open decisions affecting the journey

1. **Donate-to-access screens** — the flow adds an interview + donation branch the public sitemap
   does not yet show. Next pass should add `/apply/interview`, `/apply/donate`, `/apply/receipt`
   states/sub-screens, plus an Admin donation/receipt review view and a public
   *Donate-to-access* screen distinct from the general `/donate` link.
2. **Interview always-required vs. donor-only** — skip the call for clearly eligible
   beneficiaries to save admin time? (§5.2)
3. **Re-application cooldown** — allowed, and after how long? (§8)
4. **Notifications ownership** — approval/expiry emails fully automated (SES) vs. manual by owner.
5. **Refund/chargeback handling** — auto-revoke vs. admin review (§5.1 edge cases).
```
