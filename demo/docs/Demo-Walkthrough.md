# CFG V2 Platform — Demo Walkthrough

A guided, ~15-minute tour of the runnable local demo. It walks the full vetted-access lifecycle —
**apply → vet/donate → grant → learn → expire** — across the two dashboards plus the public
apply/donate API, using the seeded data. For *what* the demo is and *how it maps to AWS*, see the
[README](../README.md) and [Demo-Architecture](./Demo-Architecture.md); for the production design,
[`../../docs/Architecture-Design.md`](../../docs/Architecture-Design.md).

---

## 0 · Start the demo

```bash
cd demo
cp .env.example .env                 # auto-loaded by config.mjs (endpoint defaults to MiniStack :4566)
npm install
npm run cloud:up                     # local cloud (DynamoDB/Cognito/SQS/S3/SES on :4566)
npm run db:reset && npm run db:seed  # 9 tables + admin + students + sample applications + curriculum
npm start                            # http://localhost:3000
```

Open two browser tabs:

| Dashboard | URL | Login |
|-----------|-----|-------|
| **Admin** | <http://localhost:3000/admin.html> | `admin@codeforgood.us` / `admin1234` |
| **Student** | <http://localhost:3000/app.html> | see below |

> No Docker? Run the DynamoDB Local jar on `:8000` and set `AWS_ENDPOINT_URL=http://localhost:8000`
> in `.env` (see [ADR-002](./ADR-002-local-cloud-emulator.md)). Everything below still works.

### The seeded cast

`db:seed` pre-stages one application in **each** lifecycle state so the admin queue is worth looking
at, plus two provisioned students and one self-serve supporter:

| Person | Email | State | Notes |
|--------|-------|-------|-------|
| Maya Chen | `maya@student.edu` | `SUBMITTED` | current student — drive her end-to-end in Tour 1 |
| Jordan Blake | `jordan@student.edu` | `SUBMITTED` | another fresh applicant |
| Diego Ramirez | `diego@student.edu` | `INTERVIEW_SCHEDULED` | interview booked |
| Priya Patel | `priya@student.edu` | `APPROVED_BENEFICIARY` | eligible (free) — ready to provision |
| Sam O'Connor | `sam@student.edu` | `DONATION_REQUIRED` | not eligible free → asked to donate |
| Taylor Quinn | `taylor@supporter.org` | `ACTIVE` (supporter) | **self-serve**: funded a seat + donated, auto-granted, no admin |
| Lee Nakamura | `student@codeforgood.us` | `ACTIVE` (fast track) | password `student1234`; `wk1-day1` already complete |
| Ava Okafor | `roadmap@codeforgood.us` | `ACTIVE` (full roadmap) | password `student1234`; `pillar1` already complete |

---

## 1 · Admin — drive a beneficiary through the state machine

In the **Admin** tab you land on the overview (counts by lifecycle status) and the application
review queue.

1. **Open Maya Chen** (`SUBMITTED`). The detail view shows her application plus a PII-free audit
   trail that grows with each action.
2. **Schedule an interview** (beneficiary track) → she moves to `INTERVIEW_SCHEDULED`.
3. **Approve** as eligible → `APPROVED_BENEFICIARY`.
4. **Provision** → this is the privileged step: in production only `system-fn` (the queue worker)
   holds `AdminCreateUser`; here it creates the member, issues a credential, and moves her to
   `ACTIVE`. Watch the overview counts shift.

Then explore member management:

- **Members** lists provisioned students. Open one to **inspect gated progress** or **override a
  milestone** (lock / unlock / restore-auto) — every override is audited.
- **Extend** or **Revoke** an access window. Revoking immediately blocks the student app (Tour 5).

> Each transition is a server-side **conditional write** — illegal jumps (e.g. approving a
> `SUBMITTED` app without an interview) are rejected, and double-clicks can't double-provision.
> The same flow is scriptable via the `POST /api/v1/admin/applications/:id/{schedule-interview,
> approve,require-donation,confirm-donation,reject,provision}` routes ([README API table](../README.md#api-url-versioned)).

---

## 2 · Self-serve supporter — donate to auto-grant (no admin)

A supporter can fund their own seat with **no interview and no manual approval** — the grant is
gated on a server-verified payment, never a client "I paid" signal. There's no public web page in
the demo, so drive the public API directly (this is the same API the landing-page form would call):

```bash
# Apply choosing to fund a seat -> goes straight to DONATION_REQUIRED (skips the interview)
APP=$(curl -s localhost:3000/api/v1/applications \
  -H 'content-type: application/json' \
  -d '{"email":"chris@supporter.org","fullName":"Chris Rivera","preferredTrack":"fast_track","ageBracket":"18+","accessChoice":"supporter"}')
echo "$APP"        # { applicationId, status:"DONATION_REQUIRED", next:"donate", donateUrl:"/api/v1/applications/<id>/donate" }
ID=$(echo "$APP" | sed -E 's/.*"applicationId":"([^"]+)".*/\1/')

# Donate: stands in for paying on Zeffy's hosted page + system-fn's read-only poll verifying it.
# On verification it auto-provisions to ACTIVE and returns a login credential (Cognito + SES stand-in).
curl -s localhost:3000/api/v1/applications/$ID/donate \
  -H 'content-type: application/json' \
  -d '{"zeffyPaymentId":"zf_demo_001"}'
# -> { status:"ACTIVE", demoLogin:{ email, password }, ... }   (idempotent: repeat calls are safe)
```

Log in at <http://localhost:3000/app.html> with the returned `demoLogin` — a brand-new student,
provisioned without any admin touching the queue. (The age gate also lives here: `ageBracket:
"under_13"` is rejected, and `"13_17"` requires `guardianConsentAt` before the donate link-out.)

---

## 3 · Student — the full-roadmap experience (sidebar + content)

Log in to the **Student** tab as **Ava** (`roadmap@codeforgood.us` / `student1234`).

- **Layout.** A left **sidebar** (progress ring + the 8-pillar accordion) and a **content** area —
  a hero, the pillar cards, and an earnings ladder. Pillar 1 is already complete, so **Pillar 2 is
  active** and the rest are locked.
- **Hero — "Your next move."** It features the active pillar and a **What to complete** checklist.
- **Click a pillar (or a sub-item under it in the sidebar).** The hero re-points to that pillar, the
  card gets a border highlight, and the page scrolls to that pillar's **tasks**.
- **Mark tasks done.** Tick the requirement checkboxes — the hero's *What to complete* advances to
  the next unchecked task; tick them all and it prompts you to submit proof. **These ticks persist
  to the database** (Progress table): switch pillars, reload the page, even log back in — they come
  back. They are UI progress only; ticking never completes or unlocks a stage.
- **Submit a deliverable.** Paste any project URL (GitHub, a live demo, a Loom…) and submit. Pillar 2
  flips to **complete**, **Pillar 3 unlocks**, and the progress ring / readiness % update.
- **Gating is server-side.** Try to jump ahead to a locked pillar — the server refuses; the client
  never decides eligibility.

---

## 4 · Student — the 4-week fast track

Log out, then log in as **Lee** (`student@codeforgood.us` / `student1234`).

Same shell, different path: **4 weeks → 28 days**, where each **day** is its own gated, submittable
stage. `wk1-day1` is already complete, so day 2 is active. Open a day, check its requirements, submit
a deliverable, and the next day unlocks — one day at a time. The full-roadmap and fast-track views
share the identical sidebar+content UI; `accessBasis` (beneficiary vs supporter) is reporting
metadata only, never a difference in what the student sees.

---

## 5 · Lifecycle edges — expiry, revoke, gating

- **Revoke / expire.** In the Admin tab, **Revoke** Lee or Ava (or **Extend** a window into the
  past). Reload their student tab → the app is bounced with **403 `access_expired`**; access is
  re-checked server-side on every request, never trusted from the client.
- **Locked stage (server gate).** A `POST /api/v1/app/stages/<locked-stage>/submit` returns **403
  `stage_locked`** even if the UI is bypassed — the gate is enforced in the handler.

---

## What this demonstrates

The demo exercises every security-critical invariant of the production design against a local cloud:
provisioning isolated behind a queue seam, supporter access gated on a **server-verified** payment,
every state transition an idempotent conditional write, server-side role/window/content gating, and
a PII-free append-only audit trail. Because the data-access code is endpoint-driven, the same code
runs against real AWS by changing only `AWS_ENDPOINT_URL` — see the
[mapping table](../README.md#how-the-demo-maps-to-production-aws) and
[Demo-Architecture](./Demo-Architecture.md).

## Verify it yourself

```bash
npm test          # backend/API suite (state machine, gating, idempotency, audit)
npm run test:e2e  # student-SPA end-to-end (layout, persistence, sidebar nav, a11y)
npm run test:all  # both
```

## Reset

```bash
npm run db:reset && npm run db:seed   # back to the seeded cast above
```
