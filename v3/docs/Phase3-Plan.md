# HISTORICAL — V3 Phase 3 Plan

> Completed/superseded by the Rev. 2 security architecture and verification walkthrough.

Goal: close the remaining gaps to a production-ready pilot — **supporter/Zeffy verification**,
**Firestore rules-unit tests**, **admin MFA** (now feasible on Blaze), **UI polish**, and a new
**admin Settings modal** to manage the **Zeffy donate link** and **Cal.com booking link** without
a redeploy. Stays Spark/Functions-free where the budget requires it; uses Blaze only where the
platform forces it (MFA). Builds on [`Architecture-V3.md`](Architecture-V3.md) · [`Spark-Backend.md`](Spark-Backend.md).

> Status precondition: project is now on **Blaze** (email-link cap lifted to 25k/day, MFA/Identity
> Platform available). The $0 posture still holds *within* the Blaze free tier.

---

## 1. Workstreams (scope + Spark-compatible approach)

| # | workstream | approach (V3 / Spark) | rules / infra change |
| --- | --- | --- | --- |
| 1 | configurable links (NEW) | settings/public Firestore doc {zeffyUrl, calComUrl}; landing + apply read it; admin edits via modal | Rules: settings public-read · admin-write (validated) |
| 2 | supporter / Zeffy verify | admin-cli confirm-donation.mjs &lt;appId&gt; &lt;zeffyPaymentId&gt;: record donation (idempotent) → grant --basis supporter; FAIL-CLOSED | donations write = admin-cli (Admin SDK); optional Zeffy read-only API in cli |
| 3 | rules-unit tests | @firebase/rules-unit-testing against the Firestore emulator; full allow/deny matrix | backend devDep + test/rules.test.mjs (no prod change) |
| 4 | admin MFA | Identity Platform TOTP as 2nd factor on top of email-link; enroll in admin console; optional enforcement | enable MFA in Firebase console (Blaze) |
| 5 | UI polish | code-split firebase chunk · a11y/axe pass · loading/empty/error states · compress assets · mobile layouts | none (frontend only) |

---

## 2. Configurable links — data model + flow (workstream 1)

A single public-read settings doc replaces the hardcoded Zeffy/Cal.com URLs.

| field | type | used by |
| --- | --- | --- |
| zeffyUrl | string (https) | landing Donate buttons + footer + final CTA |
| calComUrl | string (https) | apply success Book your 15-min interview + admin interview card |
| updatedAt | timestamp | audit |
| updatedBy | string (admin uid) | audit |

Rules (additive):

```text
match /settings/{id} {
  allow read: if true;                         // anonymous landing needs the links
  allow write: if isAdmin()
    && request.resource.data.keys().hasOnly(['zeffyUrl','calComUrl','updatedAt','updatedBy'])
    && request.resource.data.zeffyUrl.matches('https://.*')
    && request.resource.data.calComUrl.matches('https://.*');
}
```

Flow: `landing.js` reads `settings/public` on load → rewrites every Donate `href` and the apply
success "Book interview" link; falls back to the current hardcoded URLs if the doc is missing. The
admin Settings modal writes the doc (admin claim) — no redeploy needed to change a link.

---

## 3. New component — Admin Settings modal (design-system "extend")

### Problem

Zeffy and Cal.com URLs are hardcoded in the landing markup; changing them needs a code edit +
redeploy. Admins need to update them in place.

### Existing patterns

| Related | Similarity | Why not enough |
|---|---|---|
| Admin interview card | inline form in `.detail` | scoped to one application, not global settings |
| Login card | modal-ish form | not reusable as an admin overlay |

### Proposed design

| Property | Type | Default | Description |
|---|---|---|---|
| `open` | boolean | false | modal visibility |
| `zeffyUrl` | string | from `settings/public` | donate link |
| `calComUrl` | string | from `settings/public` | interview booking link |
| `onSave(values)` | fn | — | writes `settings/public` (admin) |

States: Default (loaded from Firestore) · Editing · Saving (button disabled + spinner) ·
Saved (toast "Settings updated") · Error (inline `auth/permission` message) · Empty (no doc → prefilled fallbacks).

Tokens: reuse `--cfg-purple`/`--grad-accent` (buttons), `--line`/`--r` (card), `.cfg-input`/`.btn-purple`
(form), the existing `.toast`. No new tokens.

Accessibility: `role="dialog"` `aria-modal="true"` + labelled heading; focus trap; Escape closes;
URL inputs `type="url"` with `inputmode="url"`; Save announces via the toast (`aria-live="polite"`).

Entry point: a **Settings** button in the admin top bar → opens the modal.

### Open questions

- One global settings doc, or per-environment? (MVP: one `settings/public`.)
- Validate the URL is reachable, or just `https://` shape? (MVP: shape only.)

---

## 4. Supporter / Zeffy verify (workstream 2)

| step | actor | detail |
| --- | --- | --- |
| fund-a-seat | applicant | landing offers Fund a seat → application with accessChoice=supporter → Donate (settings.zeffyUrl) |
| verify | admin | admin-cli confirm-donation.mjs &lt;appId&gt; &lt;zeffyPaymentId&gt; — records donations/{zeffyPaymentId} (idempotent) then grants --basis supporter |
| verification source | admin-cli | if ZEFFY_READONLY_KEY set → call Zeffy read-only Payments API (settled?); else admin-attested against the Zeffy dashboard |
| console action | admin | for supporter apps the detail panel shows the confirm-donation command to copy (mutations stay CLI on Spark) |

Invariant preserved: supporter→ACTIVE still requires a server-side verified payment (the admin-cli
is the server-side actor), idempotent on `zeffyPaymentId`, fail-closed (never a raw client claim).

**Open question:** does your Zeffy account expose a read-only Payments API + key? If yes, I wire the
real check; if not, verification is admin-attested (admin confirms the payment in the Zeffy dashboard,
enters the paymentId) — documented honestly.

---

## 5. Rules-unit tests (workstream 3)

`@firebase/rules-unit-testing` + the Firestore emulator (`initializeTestEnvironment`). Matrix:

| case | expect |
| --- | --- |
| anon create valid application | ALLOW |
| anon create under-13 / 13-17 without consent / bad shape | DENY |
| student read own member + progress (ACTIVE) | ALLOW |
| student read another member | DENY |
| student write own progress (ACTIVE+in-window) | ALLOW |
| student write after accessEnds | DENY |
| admin read applications/members/auditLog | ALLOW |
| admin set INTERVIEW_SCHEDULED / REJECTED / stageLocks | ALLOW |
| admin set status GRANTED/ACTIVE from browser | DENY (minting is cli-only) |
| any client write counters/donations/auditLog | DENY |
| settings public read · non-admin write | ALLOW read · DENY write |

Run: `cd v3/backend && firebase emulators:exec --only firestore 'node test/rules.test.mjs'`. Wire
into the test gate in `MVP-Plan.md`.

---

## 6. Admin MFA (workstream 4 — needs Blaze/Identity Platform)

| step | detail |
| --- | --- |
| enable | Firebase console → Authentication → enable Multi-factor (TOTP) [Identity Platform, Blaze] |
| enroll | admin console: multiFactor(user).enroll(totpSecret) — show QR + verify a code; first factor = email-link (verified email) |
| challenge | on admin sign-in, catch auth/multi-factor-auth-required → resolve with the TOTP code |
| enforce (phase) | optional: block admin console actions until the account has an enrolled 2nd factor |

Trade-off: TOTP (authenticator app) avoids SMS cost/limits. Risk: lock-out — keep one un-enrolled
break-glass admin until enrollment is verified. App Check (abuse protection) is a sibling add-on.

---

## 7. UI polish (workstream 5)

| item | fix |
| --- | --- |
| firebase bundle 558kB | manualChunks / dynamic import for firebase/auth+firestore to cut initial JS |
| a11y | axe pass (focus-visible everywhere, modal focus-trap, ARIA on dialogs, contrast on muted text) |
| states | loading/empty/error for student dashboard, admin queue/members, landing apply |
| assets | compress Profile2.jpg (3.2MB → &lt;200KB); add width/height to hero imgs |
| mobile | verify admin table horizontal scroll + hero/journey breakpoints |
| consistency | unify toast usage + button focus rings across landing/app/admin |

---

## 8. Small-commit roadmap

| # | commit | gate |
| --- | --- | --- |
| 1 | feat(rules): settings public-read + admin-write; deploy | rules-unit test green |
| 2 | feat(v3-ui): admin Settings modal (Zeffy + Cal.com) | build green · writes settings/public |
| 3 | feat(v3-ui): landing reads settings → donate + book-interview links | live: edit link in admin → landing updates |
| 4 | test(v3): @firebase/rules-unit-testing matrix on emulator | all cases pass |
| 5 | feat(v3-backend): confirm-donation.mjs (fail-closed) + supporter fund-a-seat | emulator: donate→confirm→grant supporter |
| 6 | feat(v3-ui): admin supporter confirm donation action (CLI command) | renders confirm-donation command |
| 7 | feat(v3-auth): admin TOTP MFA enroll + challenge | admin enrolls + signs in with 2nd factor |
| 8 | polish: code-split + a11y + states + assets | axe pass · bundle smaller · build green |

Commits 1–4 are self-contained and low-risk; 5–6 depend on the Zeffy API answer; 7 needs the console
MFA toggle; 8 is continuous.

---

## 9. Inputs needed from you

| need | why |
| --- | --- |
| real Zeffy campaign URL + (optional) read-only Payments API key | seed settings + wire real supporter verify (else admin-attested) |
| real Cal.com booking link | seed settings.calComUrl for the apply→interview step |
| MFA decision | TOTP for admins? enforce for all or optional? keep a break-glass admin |

## 10. Out of scope (Phase 3)

Deploying Cloud Functions (still Spark for the data plane) · gated Cloud Storage assets · payment
processing in-stack (Zeffy stays hosted) · merge to `main` (held per your instruction).
