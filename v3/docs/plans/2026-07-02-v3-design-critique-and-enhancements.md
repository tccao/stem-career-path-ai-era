# V3 Production Design Critique — Enhancements and Doc Updates Implementation Plan

> **Execution:** Implement task-by-task in this worktree. Preserve unrelated user changes, use
> failing tests before behavior changes, and update checkboxes only after verification. Do not
> commit, push, deploy, or add co-author trailers unless the operator explicitly requests it.

**Goal:** Close the concrete gaps found in a full production-design critique of V3 (UI → callable API → logic handlers), then align `Architecture-V3.md`, `v3/README.md`, `Architect-Defense-Guide.md`, `Implementation-Handler-Catalog.md`, `Security-Verification-Walkthrough.md` baselines, and the root `CLAUDE.md` with the improved behavior.

**Architecture:** V3 is a Vite MPA on AWS Amplify with a Firebase Blaze backend; all mutations go through App-Check-protected callables in `v3/backend/sync-fn`, browser Firestore access is read-only for current-MFA staff, and revocation uses `sessionVersion`. The plan fixes one lifecycle authorization gap (`enableAccount` resurrecting revoked members), three robustness gaps (rejected-application payment binding, maintenance-sweep fault isolation, refund-reconciliation latency), one scale gap (admin member-list N+1), plus frontend hardening and dead-code removal — each behind a failing test first — then updates every affected document.

**Tech Stack:** Node 22, Firebase Functions v2 (callables + `onSchedule`), firebase-admin 13, Zod 4, Firestore emulator suite, `node --test`, Vite 7, Playwright (landing only).

## Global Constraints

Copied from `v3/CLAUDE.md` (non-negotiable; every task implicitly includes these):

- Never restore client writes to applications, progress, stage locks, settings, members, donations, audit, revocations, or system controls.
- No supporter reaches ACTIVE without `donations/{paymentId}.verificationState == VERIFIED` bound to the same application.
- Never remove staff MFA, App Check, revocation, or lockdown checks from a callable.
- Never allow a member mutation to target an owner/admin account.
- Keep re-enable separate from access restoration; never reactivate an expired window implicitly.
- Every privileged mutation must include actor-attributed audit evidence.
- Validate every callable input with a strict Zod schema and bounded strings/numbers.
- Reuse `queueAudit` inside Firestore transactions and `writeAudit` for standalone events.
- Never run emulator E2E tests with production credentials or endpoints. Never deploy `backend/functions/`.
- Update tests and the `Security-Verification-Walkthrough.md` baseline whenever behavior intentionally changes.
- Zero npm audit findings at moderate-or-higher severity in all three packages.
- Docs use native Markdown tables; lint with `npx markdownlint-cli2 <file>`.
- Execution environment: if running from Windows, bridge every command through WSL with a login shell and a Linux temp dir, e.g. `wsl.exe bash -lic 'export TMPDIR=/tmp TMP=/tmp TEMP=/tmp; cd /home/tinhc/stem-career-path-ai-era/... && <command>'`. Commands below are written for the WSL shell; prefix accordingly.
- Work happens on branch `feat/v3-mvp`. Existing dirty-worktree files may contain operator work;
  inspect diffs before editing and never overwrite unrelated changes.
- Commit/push/deploy commands are handoff examples only. Run them only with explicit operator
  approval. Never attribute generated work to a third party with a `Co-Authored-By` trailer.

Full verification matrix (run after any behavior task; all must pass):

```bash
cd v3/frontend && npm run build && npm run test:security
cd v3/backend
DEBUG= firebase emulators:exec --only firestore 'cd admin-cli && npm run test:rules'
DEBUG= ZEFFY_API_KEY=test-key ZEFFY_API_BASE_URL=http://127.0.0.1:7777 \
  firebase emulators:exec --only auth,firestore,functions 'cd admin-cli && npm run test:security'
DEBUG= firebase emulators:exec --only firestore,auth 'cd admin-cli && npm run test:flow'
```

## Execution status — 2026-07-02

- [x] Plan hardened before implementation: dirty-worktree protection, explicit publication gate,
  anonymous-delete fault isolation, bounded scheduled cursor continuation, and truthful
  count-only progress copy added.
- [x] Tasks 1–7 behavior and regression tests implemented.
- [x] Tasks 8–10 authoritative docs updated.
- [x] Full local verification passed: frontend build/security/E2E, Rules, callable security,
  maintenance, break-glass flow, Markdown lint, and all three moderate-level npm audits.
- [ ] Commit, push, production deploy, and live scheduler verification remain operator-controlled.

### Task 0: establish baseline and protect existing work

- [ ] Record `git status --short --branch` and inspect diffs for every already-modified target.
- [ ] Run focused pre-change suites for touched packages. Record genuine baseline failures; do not
  rewrite expected results to hide them.
- [ ] Confirm current branch is `feat/v3-mvp`. Do not switch branches with a dirty worktree.
- [ ] Use `rg` for dead-code/import checks; `grep` examples below are portable fallbacks.

---

## Part 1 — Critique findings register

This is the critique output the tasks below implement. Severity: H = must fix, M = should fix, L = hygiene, A = accepted limitation (document only).

| id | layer | sev | finding | evidence | disposition |
| --- | --- | --- | --- | --- | --- |
| F1 | handler | H | `enableAccount` derives ACTIVE purely from `accessEnds > now`, but `revokeStudent` never shortens `member.accessEnds` — so re-enabling a refund-revoked supporter (or any manually revoked member with a future window) silently restores ACTIVE + student claims with **no payment recheck**, bypassing `assertSupporterExtensionEligible` and the verified-payment invariant. The UI hides "Restore access" for `payment_reversed`, but that is client-side only. `disableAccount` also overwrites an existing `endedReason` (e.g. `revoked` → `disabled`), laundering a revoked member into the auto-restorable state. | `sync-fn/src/admin.js:186-209` (enable), `admin.js:131-154` (revoke leaves `accessEnds`), `admin.js:162-184` (disable overwrites reason), `frontend/src/admin/admin.js:220-226` (UI-only guard); test gap: `security.e2e.test.mjs:211-237` covers expired-only | Task 1 |
| F2 | handler | M | `confirmDonation` binds a payment to an application before checking the application is grantable; binding a payment to a REJECTED application permanently consumes it (the one-payment-one-application guard then blocks legitimate reuse) even though `grantAccess` fails afterwards. | `sync-fn/src/integrations.js:133-162` (no status check before `tx.set` binding) | Task 2 |
| F3 | handler | M | `maintenanceSweep` has no per-member fault isolation: one `revokeStudent` throw aborts the whole run, skipping remaining expiries **and** anonymous-user cleanup. Concrete trigger: an ACTIVE member later promoted to staff (`setRole` does not end the member record) makes `assertTargetNotStaff` throw at expiry time, wedging the sweep permanently. | `sync-fn/src/maintenance.js:23-26`; `admin.js:236-264` (`setRole` promotion leaves member ACTIVE) | Task 3 |
| F4 | handler/ops | M | Refund/dispute revocation only happens when staff manually clicks Sync; there is no scheduled reconciliation, so a refunded supporter keeps access indefinitely if nobody syncs. Additionally the UI ignores `truncated`/`nextCursor`, so beyond 1,000 payments staff get a silently partial mirror. Scheduled reconciliation must continue bounded pages within the run and persist/report truncation rather than restarting silently at page one forever. | `sync-fn/src/integrations.js:66-119`; `frontend/src/admin/admin.js:452-459` (no cursor, no truncation surfacing) | Task 4 (backend), Task 6 (UI) |
| F5 | UI/scale | M | Admin Members view is N+1: it reads **every** member document plus **every member's whole progress subcollection** on each refresh; unusable and costly beyond pilot size. | `frontend/src/admin/admin.js:204-218` | Task 5 (denormalized counter) |
| F6 | UI | L | Owner roster shows only the first 100 accounts; `listAccounts` returns `nextPageToken` but `renderOwnerView` never uses it. | `frontend/src/admin/admin.js:367-374`; `sync-fn/src/admin.js:211-234` | Task 6 |
| F7 | UI | L | Dead code shipped or exported: `src/public/donate.js` (contains a TODO URL, not imported by any entry), `src/lib/accessLink.js` (deprecated alias), `mountLogin` (`src/lib/auth.js:189`), `clearCurriculumCache` (`src/lib/cache.js:13`). | grep: no active imports | Task 7 |
| F8 | docs | M | Root `CLAUDE.md` still describes V3 as "Firebase Spark … Functions-free" with rules-only enforcement; the live system is Blaze with `sync-fn` callables, TOTP staff MFA, App Check, revocation, and lockdown. `AGENTS.md` is current; `CLAUDE.md` is not. | root `CLAUDE.md` V3 section vs `v3/CLAUDE.md` | Task 9 |
| F9 | API | A | `extendAccess` is not idempotent server-side (double-invoke adds days twice); UI already disables the button while in flight. Accept at pilot scale; revisit with an operation nonce if staff automation appears. | `sync-fn/src/admin.js:99-129`; `frontend/src/admin/admin.js:244-250` | register only |
| F10 | UI/UX | A | Native `confirm()` dialogs for destructive staff actions, toast-only error surfacing, donations table reads the whole collection, student checklist ticks are per-device `localStorage`, tab close ends the session (deliberate `browserSessionPersistence`). Acceptable pilot trade-offs. | `frontend/src/admin/admin.js`, `frontend/src/student/app.js`, `frontend/src/firebase.js` | register + Deferred backlog |
| F11 | lifecycle | A | `INTERVIEW_SCHEDULED` is recognized but never written by any handler; Cal.com stays externally authoritative via `getInterview`. Intentional; keep documented. | `sync-fn/src/lifecycle.js` state machine | docs only |
| F12 | tests | A | No automated admin/student **browser** E2E (callables + Rules + landing Playwright are covered). Deferred with trigger below. | `Implementation-Handler-Catalog.md` §12 | Deferred backlog |

Strengths confirmed (keep; defend as-is): resumable grant saga with deterministic reservation and concurrency convergence; `sessionVersion` revocation checked by both Rules and callables; deny-all browser writes; fail-closed external fetches with timeouts and bounded pagination; strict Zod schemas on every callable; server-owned curriculum; break-glass CLI with loopback/phrase/operator guards.

### Deferred backlog (document, do not build now)

| item | trigger to build |
| --- | --- |
| Admin/student browser E2E (Playwright against emulators, custom-token sign-in) | first regression that the callable suite could not catch, or before onboarding a second frontend contributor |
| Zeffy webhook (replace polling) | refund-revocation SLA under 24 h required, or payment volume makes 10-page mirror insufficient |
| `INTERVIEW_SCHEDULED` writer + Cal.com booking webhook | staff report queue confusion distinguishing submitted vs scheduled beneficiaries |
| Accessible in-app confirm dialogs replacing `confirm()` | any staff-console accessibility audit, or keyboard-only staff user |
| App Check enforcement for Firestore (console toggle; browser SDK already attaches tokens) | verify in a staging window; enable with the next deploy train |
| `extendAccess` idempotency nonce | staff automation/scripting of extensions |
| Donations table pagination/aggregation | donations collection exceeds ~1,000 docs |

---

## Part 2 — Tasks

### Task 1: `enableAccount` must not restore revoked/reversed members (F1)

**Files:**

- Modify: `v3/backend/sync-fn/src/admin.js:162-209` (`disableAccount`, `enableAccount`)
- Modify: `v3/frontend/src/admin/admin.js:442-451` (`reactivateMember` copy)
- Test: `v3/backend/admin-cli/test/security.e2e.test.mjs` (two new subtests after line 209)

**Interfaces:**

- Consumes: `STATE`, `assertStaff`, `recordSessionRevocation`, `writeAudit`, `queueAudit` (existing).
- Produces: `enableAccount` returns `{ uid, disabled: false, memberStatus }` where `memberStatus` is `'ACTIVE'` only when the member was ACTIVE or ENDED-by-mistaken-disable with a future window; otherwise `'ENDED'` (or `null` with no member doc). `disableAccount` now preserves a pre-existing `endedReason`. Task 10 documents this contract.

- [ ] **Step 1: Write the failing tests**

In `v3/backend/admin-cli/test/security.e2e.test.mjs`, insert after the supporter-refund subtest (after line 209, before `'disable is immediate…'`):

```js
  await t.test('re-enable does not restore a revoked supporter without a clean payment', async () => {
    const supporterUser = await adminAuth.getUserByEmail(supporterEmail);
    const enabled = await admin.call('enableAccount', { uid: supporterUser.uid });
    assert.equal(enabled.memberStatus, 'ENDED');
    const member = await db.collection('members').doc(supporterUser.uid).get();
    assert.equal(member.get('status'), 'ENDED');
    assert.equal(member.get('endedReason'), 'payment_reversed');
    const refreshed = await adminAuth.getUser(supporterUser.uid);
    assert.ok(Number(refreshed.customClaims.accessEnds || 0) <= Date.now());
    await expectDenied(admin.call('extendAccess', { uid: supporterUser.uid, days: 30 }), /failed-precondition|verified payment/i);
  });

  await t.test('re-enable restores learning access only after a mistaken disable', async () => {
    // Fresh anonymous session: the shared applicant is at the 5/hour intake rate limit.
    const applicant2 = await client('applicant-enable');
    await signInAnonymously(applicant2.auth);
    const application = await applicant2.call('submitApplication', {
      name: 'Mistaken Disable', email: `mistaken-disable-${runId}@example.test`, ageBracket: '18plus',
      guardianConsent: false, accessChoice: 'beneficiary',
    });
    const granted = await admin.call('grant', { applicationId: application.applicationId, path: 'fasttrack', days: 90 });

    await admin.call('disableAccount', { uid: granted.uid });
    const afterDisable = await admin.call('enableAccount', { uid: granted.uid });
    assert.equal(afterDisable.memberStatus, 'ACTIVE');
    const restored = await db.collection('members').doc(granted.uid).get();
    assert.equal(restored.get('status'), 'ACTIVE');
    assert.equal(restored.get('endedReason'), undefined);

    await admin.call('revokeAccess', { uid: granted.uid });
    await admin.call('disableAccount', { uid: granted.uid });
    const afterRevoke = await admin.call('enableAccount', { uid: granted.uid });
    assert.equal(afterRevoke.memberStatus, 'ENDED');
    assert.equal((await db.collection('members').doc(granted.uid).get()).get('endedReason'), 'revoked');
  });
```

- [ ] **Step 2: Run to verify both fail**

```bash
cd v3/backend
DEBUG= ZEFFY_API_KEY=test-key ZEFFY_API_BASE_URL=http://127.0.0.1:7777 \
  firebase emulators:exec --only auth,firestore,functions 'cd admin-cli && npm run test:security'
```

Expected: FAIL — first new subtest gets `memberStatus 'ACTIVE'` (supporter resurrected); second fails at the final `endedReason 'revoked'` assertion (disable overwrote it with `'disabled'`, enable restored ACTIVE).

- [ ] **Step 3: Implement**

In `v3/backend/sync-fn/src/admin.js`, replace the member-update block inside `disableAccount` (the `if ((await memberRef.get()).exists)` transaction) so a pre-existing ended reason is preserved:

```js
  if ((await memberRef.get()).exists) {
    await db.runTransaction(async (tx) => {
      const member = await tx.get(memberRef);
      const fromStatus = member.get('status');
      tx.update(memberRef, {
        status: STATE.ENDED,
        ...(fromStatus === STATE.ACTIVE
          ? { endedReason: 'disabled', endedAt: FieldValue.serverTimestamp() }
          : {}),
      });
      queueAudit(tx, { type: 'account.disabled', targetType: 'account', targetId: uid, actorId, fromStatus, toStatus: STATE.ENDED });
    });
  } else {
    await writeAudit({ type: 'account.disabled', targetType: 'account', targetId: uid, actorId });
  }
```

Replace the member branch of `enableAccount` (currently `if (member.exists) { … }`) with:

```js
  if (member.exists) {
    const accessEnds = Number(member.get('accessEnds') || 0);
    const endedReason = member.get('endedReason') || null;
    // Only a mistaken disable may auto-restore learning access. Revoked, reversed, or
    // expired members stay ENDED until extendAccess re-validates the entitlement.
    const restorable = accessEnds > Date.now()
      && (member.get('status') === STATE.ACTIVE || endedReason === 'disabled');
    status = restorable ? STATE.ACTIVE : STATE.ENDED;
    if (restorable) {
      await auth.setCustomUserClaims(uid, { role: 'student', accessBasis: member.get('accessBasis'), accessEnds });
      await memberRef.update({ status, endedReason: FieldValue.delete(), endedAt: FieldValue.delete() });
    } else if (member.get('status') !== STATE.ENDED) {
      await memberRef.update({ status: STATE.ENDED, endedReason: endedReason || 'expired' });
    }
  }
```

(Do not touch claims in the non-restorable branch: a revoked member's claims already carry a past `accessEnds`.)

In `v3/frontend/src/admin/admin.js` `reactivateMember`, replace the non-ACTIVE toast string with:

```js
      : 'Account re-enabled, but learning access is not active. Extend access to restore learning.');
```

- [ ] **Step 4: Run to verify pass** — same command as Step 2. Expected: all subtests PASS, including the pre-existing `'disable is immediate and an enabled member with expired access can be restored'` (its expired member was disabled, so `endedReason === 'disabled'` but `accessEnds` is past → stays ENDED → `extendAccess` still restores it).

- [ ] **Step 5: Run frontend build/security suites**

```bash
cd v3/frontend && npm run build && npm run test:security
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add v3/backend/sync-fn/src/admin.js v3/backend/admin-cli/test/security.e2e.test.mjs v3/frontend/src/admin/admin.js
git commit -m "fix(v3): re-enable no longer restores revoked members

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: `confirmDonation` must not bind a payment to a rejected application (F2)

**Files:**

- Modify: `v3/backend/sync-fn/src/integrations.js:128-172` (`confirmDonation`)
- Test: `v3/backend/admin-cli/test/security.e2e.test.mjs` (mock fixture + one new subtest)

**Interfaces:**

- Consumes: `STATE` (already imported in integrations.js).
- Produces: `confirmDonation` throws `failed-precondition` "application is rejected" before writing any donation binding when `application.status === 'REJECTED'`.

- [ ] **Step 1: Write the failing test**

In `security.e2e.test.mjs`, add fixtures next to the existing `paymentId` declarations (after line 14):

```js
const rejectedSupporterEmail = `rejected-supporter-${runId}@example.test`;
const altPaymentId = `payment-alt-${runId}`;
const altPayment = () => ({
  ...payment(), id: altPaymentId, refund_status: 'none',
  buyer: { email: rejectedSupporterEmail, first_name: 'Rejected', last_name: 'Supporter' },
});
```

In the `zeffyMock` handler, add a branch before the `startsWith('/api/v1/payments?')` case:

```js
  } else if (req.url === `/api/v1/payments/${encodeURIComponent(altPaymentId)}`) {
    res.end(JSON.stringify(altPayment()));
```

Add a subtest (place it after the Task 1 subtests):

```js
  await t.test('a payment cannot be bound to a rejected application', async () => {
    const applicant3 = await client('applicant-rejected');
    await signInAnonymously(applicant3.auth);
    const application = await applicant3.call('submitApplication', {
      name: 'Rejected Supporter', email: rejectedSupporterEmail, ageBracket: '18plus',
      guardianConsent: false, accessChoice: 'supporter',
    });
    await admin.call('rejectApplication', { applicationId: application.applicationId, reasonCode: 'withdrawn' });
    await expectDenied(admin.call('confirmDonation', {
      applicationId: application.applicationId, paymentId: altPaymentId, path: 'fasttrack', days: 90,
    }), /failed-precondition|rejected/i);
    const donation = await db.collection('donations').doc(altPaymentId).get();
    assert.ok(!donation.exists || donation.get('applicationId') !== application.applicationId);
  });
```

- [ ] **Step 2: Run to verify it fails** — same emulator command as Task 1 Step 2. Expected: FAIL — `confirmDonation` verifies the payment, binds it, then `grantAccess` throws `cannot grant from REJECTED`; the donation-binding assertion fails.

- [ ] **Step 3: Implement**

In `confirmDonation`, directly after the `accessChoice !== 'supporter'` check, add:

```js
  if (application.get('status') === STATE.REJECTED) {
    throw new HttpsError('failed-precondition', 'application is rejected and cannot accept a payment');
  }
```

- [ ] **Step 4: Run to verify pass** — same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add v3/backend/sync-fn/src/integrations.js v3/backend/admin-cli/test/security.e2e.test.mjs
git commit -m "fix(v3): refuse donation binding to rejected applications

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: fault-isolate the maintenance sweep (F3)

**Files:**

- Modify: `v3/backend/sync-fn/src/maintenance.js` (extract + harden `runMaintenanceSweep`)
- Create: `v3/backend/admin-cli/test/maintenance.test.mjs`
- Modify: `v3/backend/admin-cli/package.json` (add `test:maintenance` script)

**Interfaces:**

- Consumes: `revokeStudent(uid, { actorId, reasonCode })` from `../admin.js`; `writeAudit`; `auth`, `db` from `./context.js`.
- Produces: `export async function runMaintenanceSweep()` returning `{ expired, failed, deletedAnonymous, anonymousDeleteFailed }`; `maintenanceSweep` stays the exported `onSchedule` wrapper. Member revokes and anonymous-user deletes are independently fault-isolated. Audit `reasonCode` becomes `` `${expired}:${failed}:${deletedAnonymous}:${anonymousDeleteFailed}` ``. Task 4's test file reuses this test harness.

- [ ] **Step 1: Write the failing test**

Create `v3/backend/admin-cli/test/maintenance.test.mjs`:

```js
// Runs under: firebase emulators:exec --only auth,firestore — imports sync-fn sources directly.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GCLOUD_PROJECT ||= 'code4good-stem-career-path';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
}

const { auth, db } = await import('../../sync-fn/src/context.js');
const { runMaintenanceSweep } = await import('../../sync-fn/src/maintenance.js');

test('maintenance sweep isolates per-member failures', async () => {
  const now = Date.now();
  const staff = await auth.createUser({ email: `stale-staff-${now}@example.test` });
  await auth.setCustomUserClaims(staff.uid, { role: 'admin' });
  await db.collection('members').doc(staff.uid).set({
    status: 'ACTIVE', accessEnds: now - 1, accessBasis: 'beneficiary', email: `stale-staff-${now}@example.test`,
  });
  const student = await auth.createUser({ email: `expired-student-${now}@example.test` });
  await auth.setCustomUserClaims(student.uid, { role: 'student' });
  await db.collection('members').doc(student.uid).set({
    status: 'ACTIVE', accessEnds: now - 1, accessBasis: 'beneficiary', email: `expired-student-${now}@example.test`,
  });

  const summary = await runMaintenanceSweep();
  assert.equal(summary.failed, 1);
  assert.ok(summary.expired >= 1);
  assert.equal((await db.collection('members').doc(student.uid).get()).get('status'), 'ENDED');
  assert.equal((await db.collection('members').doc(staff.uid).get()).get('status'), 'ACTIVE');
});
```

Add to `v3/backend/admin-cli/package.json` scripts:

```json
    "test:maintenance": "node --test test/maintenance.test.mjs",
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd v3/backend
DEBUG= firebase emulators:exec --only auth,firestore 'cd admin-cli && npm run test:maintenance'
```

Expected: FAIL with `runMaintenanceSweep is not a function` (only `maintenanceSweep` is exported today).

- [ ] **Step 3: Implement**

Replace `v3/backend/sync-fn/src/maintenance.js` body with an extracted, fault-isolated core (schedule options unchanged):

```js
export async function runMaintenanceSweep() {
  const now = Date.now();
  const due = await db.collection('members')
    .where('status', '==', STATE.ACTIVE)
    .where('accessEnds', '<=', now)
    .limit(500)
    .get();
  let expired = 0;
  let failed = 0;
  for (const member of due.docs) {
    try {
      await revokeStudent(member.id, { actorId: 'system:maintenance', reasonCode: 'expired' });
      expired += 1;
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        severity: 'ERROR',
        maintenanceExpiryFailure: { uid: member.id, code: error.code || String(error) },
      }));
    }
  }

  const anonymousCutoff = now - 7 * 86_400_000;
  let deletedAnonymous = 0;
  let anonymousDeleteFailed = 0;
  let pageToken;
  do {
    const page = await auth.listUsers(1_000, pageToken);
    for (const user of page.users) {
      if (!user.email && new Date(user.metadata.creationTime).getTime() < anonymousCutoff) {
        try {
          await auth.deleteUser(user.uid);
          deletedAnonymous += 1;
        } catch (error) {
          anonymousDeleteFailed += 1;
          console.error(JSON.stringify({
            severity: 'ERROR',
            maintenanceAnonymousDeleteFailure: { uid: user.uid, code: error.code || String(error) },
          }));
        }
      }
    }
    pageToken = page.pageToken;
  } while (pageToken && deletedAnonymous < 2_000);

  await writeAudit({
    type: 'maintenance.completed', targetType: 'system', targetId: 'daily',
    actorId: 'system:maintenance', reasonCode: `${expired}:${failed}:${deletedAnonymous}:${anonymousDeleteFailed}`,
  });
  return { expired, failed, deletedAnonymous, anonymousDeleteFailed };
}

export const maintenanceSweep = onSchedule({
  schedule: 'every 24 hours',
  region: REGION,
  timeZone: 'America/Chicago',
  memory: '256MiB',
  timeoutSeconds: 540,
  maxInstances: 1,
}, runMaintenanceSweep);
```

(Imports unchanged: `onSchedule`, `auth`, `db`, `REGION`, `STATE`, `revokeStudent`, `writeAudit`.)

- [ ] **Step 4: Run to verify pass** — same command as Step 2. Expected: PASS (1 failed, ≥1 expired).

- [ ] **Step 5: Run the callable security suite** (regression) — Task 1 Step 2 command. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add v3/backend/sync-fn/src/maintenance.js v3/backend/admin-cli/test/maintenance.test.mjs v3/backend/admin-cli/package.json
git commit -m "fix(v3): isolate per-member failures in maintenance sweep

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 4: scheduled donation reconciliation (F4 backend)

**Files:**

- Modify: `v3/backend/sync-fn/src/integrations.js` (extract `runDonationSync`, add `donationReconcile`)
- Modify: `v3/backend/sync-fn/index.js` (export `donationReconcile`)
- Test: `v3/backend/admin-cli/test/maintenance.test.mjs` (second test)

**Interfaces:**

- Consumes: existing `loadCampaigns`, `zeffyJson`, `refunded`, `revokeStudent`, `writeAudit`, `MAX_SYNC_PAGES`; `REGION` from `./config.js`; `onSchedule` from `firebase-functions/v2/scheduler`.
- Produces: `export async function runDonationSync({ key, actorId, cursor = null })` returning `{ synced, revoked, campaigns, nextCursor, truncated }` (exact shape the `syncDonations` callable returns today); `export async function runScheduledDonationReconcile({ key })` follows continuation cursors for at most five bounded batches per invocation, aggregates counts, and emits NOTICE when more pages remain; `export const donationReconcile` (`onSchedule`, every 24 hours, `America/Chicago`, `secrets: [ZEFFY_API_KEY]`, `timeoutSeconds: 300`, `maxInstances: 1`) calls that helper and returns early with a NOTICE log when the secret is unset. This avoids silently restarting at page one while still bounding external work.

- [ ] **Step 1: Write the failing test**

Append to `v3/backend/admin-cli/test/maintenance.test.mjs` (before the imports of sync-fn modules add the emulator env; note both env vars must be set **before** the dynamic import of `integrations.js`):

```js
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.ZEFFY_API_BASE_URL = 'http://127.0.0.1:7788';
```

and the test:

```js
import { createServer } from 'node:http';

test('runDonationSync mirrors payments and scheduled reconcile follows cursors', async () => {
  const paymentId = `reconcile-${Date.now()}`;
  const mock = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/api/v1/campaigns')) {
      res.end(JSON.stringify({ data: [{ id: 'c1', title: 'Fund a Seat', status: 'active', currency: 'USD' }], has_more: false }));
    } else if (req.url.startsWith('/api/v1/payments?')) {
      res.end(JSON.stringify({
        data: [{ id: paymentId, status: 'succeeded', refund_status: 'none', dispute: false, amount: 5_000, currency: 'USD', campaign_id: 'c1', created: Math.floor(Date.now() / 1_000), buyer: { email: 'reconcile@example.test' } }],
        has_more: false,
      }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise((resolve) => mock.listen(7788, '127.0.0.1', resolve));
  try {
    const { runDonationSync, runScheduledDonationReconcile } = await import('../../sync-fn/src/integrations.js');
    const summary = await runDonationSync({ key: 'test-key', actorId: 'system:reconcile' });
    assert.equal(summary.synced, 1);
    assert.equal(summary.revoked, 0);
    assert.equal(summary.truncated, false);
    assert.equal((await db.collection('donations').doc(paymentId).get()).get('status'), 'succeeded');
    const scheduled = await runScheduledDonationReconcile({ key: 'test-key' });
    assert.equal(scheduled.truncated, false);
  } finally {
    mock.close();
  }
});
```

- [ ] **Step 2: Run to verify it fails** — Task 3 Step 2 command. Expected: FAIL with `runDonationSync is not a function`.

- [ ] **Step 3: Implement**

In `integrations.js`: add imports `import { onSchedule } from 'firebase-functions/v2/scheduler';` and `REGION` (extend the existing `./config.js` import). Move the body of the `syncDonations` handler (everything after the `key` guard) into:

```js
export async function runDonationSync({ key, actorId, cursor = null }) {
  const campaigns = await loadCampaigns(key);
  let synced = 0;
  let pages = 0;
  const refundCandidates = [];
  // …existing while-loop over payment pages moves here verbatim (integrations.js:79-105), using `cursor`…
  let revoked = 0;
  // …existing refundCandidates → revokeStudent loop moves here verbatim (integrations.js:108-116), without its own `let revoked` line…
  await writeAudit({ type: 'donations.synced', targetType: 'system', targetId: 'zeffy', actorId, reasonCode: `${synced}:${revoked}` });
  return { synced, revoked, campaigns: Object.keys(campaigns).length, nextCursor: cursor, truncated: Boolean(cursor) };
}
```

Add bounded scheduled continuation:

```js
export async function runScheduledDonationReconcile({ key }) {
  let cursor = null;
  let synced = 0;
  let revoked = 0;
  let calls = 0;
  do {
    const result = await runDonationSync({ key, actorId: 'system:reconcile', cursor });
    synced += result.synced;
    revoked += result.revoked;
    cursor = result.truncated ? result.nextCursor : null;
    calls += 1;
  } while (cursor && calls < 5);
  if (cursor) console.info(JSON.stringify({ severity: 'NOTICE', donationReconcile: 'truncated', nextCursor: cursor }));
  return { synced, revoked, calls, nextCursor: cursor, truncated: Boolean(cursor) };
}
```

Rewrite the callable as a thin wrapper:

```js
export const syncDonations = onCall(callableOptions({
  secrets: [ZEFFY_API_KEY], timeoutSeconds: 120, maxInstances: 1,
}), async (req) => {
  const { uid: actorId } = await assertStaff(req);
  const input = parse(z.object({ cursor: z.string().max(1_024).nullable().optional() }).strict(), req.data || {});
  const key = ZEFFY_API_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'Zeffy integration is not configured');
  return runDonationSync({ key, actorId, cursor: input.cursor || null });
});
```

Add the scheduled reconcile:

```js
export const donationReconcile = onSchedule({
  schedule: 'every 24 hours',
  region: REGION,
  timeZone: 'America/Chicago',
  memory: '256MiB',
  timeoutSeconds: 300,
  maxInstances: 1,
  secrets: [ZEFFY_API_KEY],
}, async () => {
  const key = ZEFFY_API_KEY.value();
  if (!key) {
    console.info(JSON.stringify({ severity: 'NOTICE', donationReconcile: 'skipped: ZEFFY_API_KEY not configured' }));
    return;
  }
  await runScheduledDonationReconcile({ key });
});
```

In `index.js` change the integrations export line to:

```js
export { syncDonations, confirmDonation, getInterview, donationReconcile } from './src/integrations.js';
```

- [ ] **Step 4: Run to verify pass** — Task 3 Step 2 command (both maintenance tests). Expected: PASS.
- [ ] **Step 5: Run the callable security suite** (`syncDonations` regression) — Task 1 Step 2 command. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add v3/backend/sync-fn/src/integrations.js v3/backend/sync-fn/index.js v3/backend/admin-cli/test/maintenance.test.mjs
git commit -m "feat(v3): scheduled Zeffy reconcile closes refund-latency gap

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Deploy note (record in walkthrough, Task 8): deploying adds a second Cloud Scheduler job; verify it in the Firebase console after the next `firebase deploy --only functions:sync`.

### Task 5: denormalized progress counter kills the admin N+1 (F5)

**Files:**

- Modify: `v3/backend/sync-fn/src/student.js:62-100` (`submitStage`)
- Modify: `v3/frontend/src/admin/admin.js:204-233` (`loadMembers`), `:253-258` (`openMemberProgress`)
- Test: `v3/backend/admin-cli/test/security.e2e.test.mjs` (assertions in the existing stage subtest)

**Interfaces:**

- Consumes: the stage subtest's `student` client and `db` handle; `FieldValue` (already imported in student.js).
- Produces: `members/{uid}.progressCompleted` — exact count of complete stages, written transactionally on every accepted `submitStage`. Frontend uses it when present and falls back to the subcollection read for pre-existing members (no backfill required).

- [ ] **Step 1: Write the failing assertions**

In `security.e2e.test.mjs`, at the end of the `'curriculum is callable-only and stage sequencing/locks are server-enforced'` subtest (after the d28 override completion), add:

```js
    const counted = await db.collection('members').doc(student.user.uid).get();
    assert.equal(counted.get('progressCompleted'), 3);
    const resubmit = await student.call('submitStage', { stageKey: 'd01', deliverableUrl: 'https://example.test/day-1-proof' });
    assert.equal(resubmit.idempotent, true);
    assert.equal((await db.collection('members').doc(student.user.uid).get()).get('progressCompleted'), 3);
```

- [ ] **Step 2: Run to verify it fails** — Task 1 Step 2 command. Expected: FAIL — `progressCompleted` is `undefined`.

- [ ] **Step 3: Implement backend**

In `submitStage`'s transaction, immediately after `tx.create(progressRef, …)`, add (the `completed` array of already-complete stage ids is in scope):

```js
    tx.update(memberRef, { progressCompleted: completed.length + 1 });
```

- [ ] **Step 4: Run to verify pass** — Task 1 Step 2 command. Expected: PASS.

- [ ] **Step 5: Implement frontend fast path**

In `loadMembers`, replace the `rows` mapping with a counter-first version:

```js
  const rows = await Promise.all(members.map(async (m) => {
    const defs = cur[m.path]?.stages || cur.fasttrack.stages;
    const total = defs.length;
    if (typeof m.progressCompleted === 'number') {
      const comp = Math.min(m.progressCompleted, total);
      const pct = total ? Math.round((100 * comp) / total) : 0;
    return { m, completed: null, comp, total, pct, defs, current: comp >= total ? 'Path complete' : 'Open details for next stage' };
    }
    const ps = await getDocs(collection(db, 'members', m.uid, 'progress')).catch(() => ({ docs: [] }));
    const completed = new Set(ps.docs.filter((d) => d.data().status === 'complete').map((d) => d.id));
    const comp = defs.filter((s) => completed.has(s.key)).length;
    const pct = total ? Math.round((100 * comp) / total) : 0;
    const next = defs.find((s) => !completed.has(s.key));
    return { m, completed, comp, total, pct, defs, current: next ? `${next.label}: ${next.title}` : 'Path complete' };
  }));
```

In `openMemberProgress`, the detail view still needs exact per-stage state, so fetch on demand when the fast path was used — replace the destructuring line with:

```js
async function openMemberProgress(row) {
  const { m, defs, comp, total, pct } = row;
  let { completed } = row;
  if (!completed) {
    const ps = await getDocs(collection(db, 'members', m.uid, 'progress')).catch(() => ({ docs: [] }));
    completed = new Set(ps.docs.filter((d) => d.data().status === 'complete').map((d) => d.id));
  }
```

(Do not infer a specific current stage from count when an admin override can permit out-of-order
completion. Count-only rows show `Open details for next stage`; detail view computes exact state.)

- [ ] **Step 6: Build + frontend security tests**

```bash
cd v3/frontend && npm run build && npm run test:security
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add v3/backend/sync-fn/src/student.js v3/frontend/src/admin/admin.js v3/backend/admin-cli/test/security.e2e.test.mjs
git commit -m "feat(v3): denormalize member progress count for the admin console

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 6: admin console hardening — roster pagination + sync truncation (F4 UI, F6)

**Files:**

- Modify: `v3/frontend/src/admin/admin.js:367-424` (`renderOwnerView`), `:452-459` (`refreshDonations`)

**Interfaces:**

- Consumes: `listAccounts` `{ pageToken? } → { accounts, nextPageToken }`; `syncDonations` `{ cursor? } → { synced, revoked, nextCursor, truncated }` (Task 4 shape, unchanged).
- Produces: owner roster accumulates pages via a "Load more accounts" button; donation sync follows `nextCursor` up to 5 pages per click and tells staff when more remain.

- [ ] **Step 1: Implement roster pagination**

Change `renderOwnerView` to accept accumulation state and render a load-more control:

```js
async function renderOwnerView(pageToken = null, previous = []) {
  const host = $('ownerView');
  host.innerHTML = '<div class="empty">Loading accounts…</div>';
  let locked = false, reason = '';
  try { const s = await getDoc(doc(db, 'system', 'lockdown')); if (s.exists()) { locked = s.data().enabled === true; reason = s.data().reason || ''; } } catch { /* default unlocked */ }
  let accounts = []; let nextToken = null;
  try {
    const page = await call('listAccounts', pageToken ? { pageToken } : {});
    accounts = [...previous, ...(page.accounts || [])];
    nextToken = page.nextPageToken || null;
  } catch (e) { host.innerHTML = `<div class="empty">Could not load accounts (${esc(e.code || e.message)}).</div>`; return; }
```

Keep the rest of the function body identical, but where the account table markup ends, append:

```js
    ${nextToken ? '<button class="btn sec" id="acctMore">Load more accounts</button>' : ''}
```

and after the existing `$('acctRefresh').onclick = () => renderOwnerView();` wiring add:

```js
  if ($('acctMore')) $('acctMore').onclick = () => renderOwnerView(nextToken, accounts);
```

- [ ] **Step 2: Implement sync cursor follow-up**

Replace `refreshDonations` with:

```js
async function refreshDonations(btn) {
  const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Syncing…';
  try {
    let cursor = null, synced = 0, revoked = 0, calls = 0;
    do {
      const r = (await httpsCallable(functions, 'syncDonations')(cursor ? { cursor } : {})).data || {};
      synced += r.synced || 0; revoked += r.revoked || 0;
      cursor = r.truncated ? r.nextCursor : null;
      calls += 1;
    } while (cursor && calls < 5);
    toast(cursor
      ? `Synced ${synced} donations (more remain — run sync again)`
      : `Synced ${synced} donations${revoked ? `, revoked ${revoked}` : ''}`);
    await renderDonationsView();
  } catch (e) { toast('Sync failed: ' + (e.code || e.message)); }
  finally { btn.disabled = false; btn.textContent = orig; }
}
```

- [ ] **Step 3: Verify**

```bash
cd v3/frontend && npm run build && npm run test:security && npm run test:e2e
```

Expected: PASS (landing Playwright unaffected). Manual check (optional, emulators + `VITE_USE_EMULATORS=true`): owner view renders, Load more appears only when >100 accounts.

- [ ] **Step 4: Commit**

```bash
git add v3/frontend/src/admin/admin.js
git commit -m "feat(v3): owner roster pagination and donation sync cursor follow-up

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 7: remove dead frontend code (F7)

**Files:**

- Delete: `v3/frontend/src/public/donate.js`, `v3/frontend/src/lib/accessLink.js`
- Modify: `v3/frontend/src/lib/auth.js` (remove `mountLogin`, lines 189–end), `v3/frontend/src/lib/cache.js` (remove `clearCurriculumCache`)

- [ ] **Step 1: Prove nothing imports them**

```bash
cd v3/frontend && grep -rn --include='*.js' --include='*.html' -e accessLink -e 'donate.js' -e mountLogin -e clearCurriculumCache src *.html scripts tests
```

Expected: only the definitions themselves (in `lib/auth.js`, `lib/cache.js`) — no importers. If any importer appears, stop and re-scope.

- [ ] **Step 2: Delete and trim**

```bash
git rm v3/frontend/src/public/donate.js v3/frontend/src/lib/accessLink.js
```

Remove the entire `mountLogin` function from `lib/auth.js` and the `clearCurriculumCache` export from `lib/cache.js`.

- [ ] **Step 3: Verify** — `cd v3/frontend && npm run build && npm run test:security && npm run test:e2e`. Expected: PASS (bundle budget only shrinks).

- [ ] **Step 4: Commit**

```bash
git add -A v3/frontend/src
git commit -m "chore(v3): remove dead donate/accessLink/mountLogin/cache helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 8: update `Security-Verification-Walkthrough.md` baselines and `Architecture-V3.md`

**Files:**

- Modify: `v3/docs/Security-Verification-Walkthrough.md`, `v3/docs/Architecture-V3.md`

- [ ] **Step 1: Walkthrough baselines.** Update the callable-suite baseline from 14 to 17 named subtests; add the new suite row/command:

```bash
DEBUG= firebase emulators:exec --only auth,firestore 'cd admin-cli && npm run test:maintenance'
```

with baseline "2 tests (sweep fault isolation, donation reconcile mirror)". In the deploy section, add: "`firebase deploy --only functions:sync` now creates a second Cloud Scheduler job (`donationReconcile`, every 24 hours America/Chicago); verify both scheduler jobs exist after deploy."

- [ ] **Step 2: Architecture-V3.md.** Apply these edits (Rev-track per doc conventions):
  - §9 Payments, append to the `syncDonations` paragraph: "A scheduled `donationReconcile` job runs the same bounded mirror and revocation path every 24 hours, so refund enforcement no longer depends on a staff click; a staff-initiated sync can still follow `nextCursor` for immediate full coverage."
  - §10 table, replace the `enable` row with: `| enable | Auth enabled + new session rotation; member returns to ACTIVE only from a mistaken disable with a remaining window — revoked, reversed, or expired members stay ENDED until extend/restore |`
  - §10 table, replace the `disable` row with: `| disable | Auth disabled + session rotated + member ENDED; a pre-existing ended reason (revoked/reversed/expired) is preserved |`
  - §8, append: "Each accepted submission also updates the member's `progressCompleted` counter transactionally, which the staff console uses to avoid re-reading every progress subcollection."
  - §12 table, add rows: `| refund latency | donationReconcile scheduled daily, maxInstances=1, skips when the Zeffy secret is unset |` and `| staff member list | members/{uid}.progressCompleted counter avoids N+1 progress reads; detail view reads exact per-stage state |` and update the `admin account listing` row to `| admin account listing | 100-user pages with continuation token; owner console follows nextPageToken |`.

- [ ] **Step 3: Lint + render check**

```bash
npx markdownlint-cli2 v3/docs/Architecture-V3.md v3/docs/Security-Verification-Walkthrough.md
```

If any Mermaid block was touched (none planned): validate with `mmdc -p /tmp/pptr.json -i <file>.mmd -o /tmp/out.svg`.

- [ ] **Step 4: Commit**

```bash
git add v3/docs/Architecture-V3.md v3/docs/Security-Verification-Walkthrough.md
git commit -m "docs(v3): architecture + walkthrough reflect lifecycle and reconcile fixes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 9: update `v3/README.md` and the root `CLAUDE.md` V3 section (F8)

**Files:**

- Modify: `v3/README.md`, root `CLAUDE.md`

- [ ] **Step 1: README lifecycle table.** Replace the `re-enable` row with: `| re-enable | restores Firebase sign-in; learning access returns only when the member was ACTIVE or ended by a mistaken disable with time remaining — revoked, payment-reversed, and expired members stay ENDED until access is restored |`. In "Current lifecycle behavior", add: `| donation reconcile | a daily scheduled job mirrors Zeffy and revokes reversed supporter payments without staff action |`. In "Production operator notes", add a bullet: "After deploying, confirm two Cloud Scheduler jobs exist: `maintenanceSweep` and `donationReconcile`."

- [ ] **Step 2: Root CLAUDE.md.** Rewrite the stale V3 description ("Firebase Spark … Functions-free … enforcement lives in Firestore Security Rules; privileged ops run in a local firebase-admin CLI") to match reality, keeping it a pointer: V3 is AWS Amplify frontend + Firebase **Blaze** (Auth with Identity Platform TOTP, Firestore, 2nd-gen callable Functions in `v3/backend/sync-fn`); browser writes denied by Rules; staff mutations via App-Check + MFA callables; admin-cli is break-glass only; `v3/CLAUDE.md` is authoritative. Update the V3 rows in the doc map (`Spark-Backend.md` → historical) and the `v3/` line in the repo-layout block to say "Amplify frontend + Firebase Blaze callable backend".

- [ ] **Step 3: Lint** — `npx markdownlint-cli2 CLAUDE.md v3/README.md`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md v3/README.md
git commit -m "docs(v3): align README and root guide with Blaze lifecycle behavior

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 10: update the defense guide and handler catalog (and commit both docs)

**Files:**

- Modify: `v3/docs/Architect-Defense-Guide.md`, `v3/docs/Implementation-Handler-Catalog.md` (both currently untracked — this task stages them)

- [ ] **Step 1: Defense guide edits.**
  - §4.7 table: `enable` row → `| enable | re-enable Auth and rotate/revoke session | ACTIVE only after a mistaken disable with a remaining window; revoked/reversed/expired members stay ENDED |`; add row `| daily reconcile | none | donationReconcile mirrors Zeffy and revokes reversed supporters every 24 hours |`.
  - §4.4: note reconciliation is now scheduled daily **and** staff-triggerable; staff sync follows the cursor.
  - §7 bypass table: add `| re-enable a refund-revoked supporter | enableAccount keeps the member ENDED; extendAccess demands a clean verified payment |` and `| bind a payment to a rejected application | confirmDonation rejects before writing the binding |`.
  - §8 table: update `donation sync` row (scheduled daily + cursor follow-up), `member dashboard` row (progressCompleted counter; detail view exact), `account roster` row (UI follows nextPageToken), `expiry` row (per-member fault isolation; failures counted in the audit summary).
  - §10 limitations: remove the roster-first-page and N+1 rows (fixed); soften the webhook row to "reconciliation is daily scheduled polling, not real-time; webhook remains the tightening path"; keep E2E, external-config, and two-cloud rows.
- [ ] **Step 2: Handler catalog edits.** §2: update `enableAccount` output/enforcement cell to the mistaken-disable rule; update `syncDonations` row (wrapper over `runDonationSync`); add scheduled rows for `donationReconcile` (every 24 h, `secrets: ZEFFY_API_KEY`, skip-if-unset) and update `maintenanceSweep` row (`expired:failed:deletedAnonymous` audit code, per-member isolation). §3 `src/student.js`: note `submitStage` also maintains `members/{uid}.progressCompleted`. §4/§5: delete the `donate.js`, `accessLink.js`, `mountLogin`, `clearCurriculumCache` rows (removed in Task 7). §7 admin handlers: `loadMembers` row → "uses progressCompleted fast path; subcollection fallback for pre-counter members; detail view fetches exact state". §12: callable suite 14 → 17 subtests; add maintenance suite row.
- [ ] **Step 3: Lint** — `npx markdownlint-cli2 'v3/docs/Architect-Defense-Guide.md' 'v3/docs/Implementation-Handler-Catalog.md'`. Expected: clean.
- [ ] **Step 4: Commit**

```bash
git add v3/docs/Architect-Defense-Guide.md v3/docs/Implementation-Handler-Catalog.md
git commit -m "docs(v3): defense guide + handler catalog cover hardened lifecycle

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Final gate (after all tasks)

- [ ] Run the complete verification matrix (Global Constraints block) plus `npm run test:e2e` (frontend) and `npm run test:maintenance` (backend). All PASS, zero moderate+ audit findings (`npm audit --audit-level=moderate` in frontend, sync-fn, admin-cli).
- [ ] If operator explicitly requests publication, push from WSL only:
  `wsl.exe bash -lic 'cd /home/tinhc/stem-career-path-ai-era && git push'`.
- [ ] Production deploy remains gated by the walkthrough's ordered procedure (lockdown → functions/indexes → frontend → rules); the new scheduler job must be verified live before claiming the refund-latency fix in any presentation.
