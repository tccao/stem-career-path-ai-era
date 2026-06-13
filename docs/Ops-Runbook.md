# Ops Runbook — STEM Career Path (AI Era)

**Project:** STEM Graduates Career Path — AI Era (Code For Good)
**Doc type:** Operations runbook for a one-person, best-effort, volunteer-run platform
**Owner:** Tinh Cao
**Status:** v1.0 — June 2026
**Audience:** the current maintainer and any future student volunteer taking over
**Companion docs:** `docs/Architecture-Design.md` (§11 alarms, §6.3 governance) · `docs/Platform-SRS.md` (N5/N7)

This program has no on-call rotation and pretends to none. The operating model is: **alarms with
named owners + a weekly 15-minute checklist + a tested restore procedure.** Response targets are
best-effort within 1 business day (board-approved, `Platform-SRS.md` §9).

---

## 1. Contacts & alarm routing

> Fill in real names/addresses before launch; placeholders are marked ⚠️.

| Role | Who | Channel |
|------|-----|---------|
| Maintainer (ops alias) | Tinh Cao | ⚠️ `ops@…` (alias — survives maintainer handover) |
| Board contact (severe alerts + billing) | ⚠️ named board member | ⚠️ board email |
| Root credential custodian | ⚠️ named board member (must NOT be the maintainer) | sealed envelope / password manager vault per §6.3 |

| Alarm | Severity | Goes to |
|-------|----------|---------|
| API 5xx rate, Lambda errors/throttles | Normal | Maintainer |
| SQS DLQ depth > 0 (a grant failed) | Normal | Maintainer |
| Login-failure spike | Normal | Maintainer |
| SES bounce/complaint rate | Normal | Maintainer |
| Billing budget threshold (set at \$10/mo gross) | **Severe** | Maintainer + board contact |
| Root account usage | **Severe** | Maintainer + board contact |
| CloudTrail delivery failure / config change | **Severe** | Maintainer + board contact |
| Any `AuditLog` delete/update attempt (CloudTrail metric filter) | **Severe** | Maintainer + board contact |

---

## 2. Weekly checklist (~15 minutes)

1. **DLQ empty?** SQS console → provisioning DLQ. If messages exist: read them (each is a failed
   grant), fix the cause (usually a Cognito email typo), re-drive to the main queue, verify the
   member became `ACTIVE`, confirm the audit event exists.
2. **CloudTrail delivering?** Trail status = logging, last delivery < 24 h.
3. **Billing on track?** Cost Explorer month-to-date vs. the ~\$17/mo gross ceiling
   (\$200/yr envelope). Anything anomalous → find the service line before it compounds.
4. **AuditLog export ran?** Object-Lock bucket has yesterday's incremental export.
5. **SES health:** bounce rate < 5%, complaint rate < 0.1%.
6. **Admin queue hygiene:** no application stuck in `SUBMITTED`/`INTERVIEW_SCHEDULED` older than
   2 weeks without a note.

## 3. Monthly / quarterly

- **Monthly:** review CloudWatch alarm history; check Cognito for stale admin accounts; verify
  the maintainer + board MFA devices still work; skim WAF-trigger evidence (login-failure and
  4xx patterns) against the §14 triggers in `Architecture-Design.md`.
- **Quarterly:** run the **restore test** (§4) against the dev stack; rotate the maintainer's
  AWS credentials; **rotate the CloudFront curriculum signing key** (generate a new key, add its
  public key to the CloudFront key group, update the SSM SecureString that `app-fn` reads, then
  retire the old key once the longest cookie TTL has elapsed); re-confirm the root custodian can
  locate the sealed credentials; review TTL purges happened on `Applications` (rejected > 12 months
  should be gone).

---

## 4. Restore procedure (DynamoDB PITR) — tested, not theoretical

**RPO ≤ 24 h, RTO ≤ 1 business day** (`Platform-SRS.md` N5).

1. Identify the corruption/deletion time `T` (CloudTrail data events on the affected table).
2. Console → DynamoDB → table → *Backups / PITR* → **Restore to point in time**, choose `T − 1 min`,
   restore to a **new table** `<name>-restore-<date>` (PITR never overwrites in place).
3. Validate the restored table (spot-check the records that were wrong/missing).
4. Swap: update the stack parameter/env var to point at the restored table **or** copy the
   corrected items back to the live table (small tables — a 20-line script; keep it in `tools/`).
5. Re-enable **deletion protection + PITR + TTL** on the restored table (restores don't carry
   these settings — this is the step everyone forgets).
6. Append an `OPS_RESTORE` audit event (actor, table, restore point, reason).
7. Record the drill/incident at the bottom of this file.

**Note:** table deletion should be impossible without first flipping deletion protection — if a
table vanished, someone deliberately disabled protection; check CloudTrail for who, and notify
the board contact.

## 5. Common incidents

| Symptom | First moves |
|---------|-------------|
| Grant clicked, member can't sign in | DLQ (§2.1); then Cognito user exists? `Members.status=ACTIVE`? Welcome email bounced (SES suppression list)? |
| Student sees `403 stage_locked` wrongly | `StageLocks` + `Progress` for that `memberId#stageKey`; prerequisite chain; if judgment call → admin override (audited) |
| Curriculum assets `403` from CloudFront for a valid member | Signed cookies present and unexpired? `app-fn` cookie issuance succeeded (gating check passed)? CloudFront key group holds the **current** public key matching the SSM private key (check after a key rotation)? Clock skew? — re-entering the stage re-issues cookies; a stale key after rotation is the usual cause |
| Cohort can't log in (burst) | Cognito `ThrottledRequests` metric → this is the §9A.2 scenario: tell students to retry, stagger comms; consider quota increase before next cohort |
| Welcome emails in spam | Verify DKIM/SPF/DMARC still pass (`dig`, mail-tester); SES reputation dashboard |
| Billing alarm fired | Cost Explorer → which service; usual suspects: log retention misconfig, runaway Lambda retry loop (check error alarms together) |
| Severe alarm: root usage / trail change / audit-delete attempt | Treat as compromise until proven drill: rotate maintainer credentials, verify trail re-enabled, diff AuditLog vs. last WORM export, notify board contact same day |

## 6. Handover (maintainer change)

New maintainer gets: this runbook, the `ops@` alias, a fresh MFA-required AWS identity (old one
disabled, not shared), Cognito admin account (own MFA), and a walkthrough of §2. Board custodian
confirms root seal intact. Update §1 contacts. The old maintainer's accesses are revoked the same
day — the board's standing ability to do this **is** the Day-1 governance model
(`Architecture-Design.md` §6.3).

---

## 7. Drill & incident log

| Date | Type (drill/incident) | Summary | Outcome |
|------|----------------------|---------|---------|
| ⚠️ before launch | Restore drill | First PITR restore test (§4) | |
