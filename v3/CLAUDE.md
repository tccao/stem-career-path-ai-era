# V3 agent guide

V3 is a secured hosted MVP: Vite multi-page frontend on AWS Amplify plus Firebase Blaze
(Authentication with Identity Platform, Firestore, and 2nd-generation Functions).

Read before changing V3:

1. `docs/Architecture-V3.md` — current runtime/trust boundaries.
2. `docs/Security-Verification-Walkthrough.md` — mandatory tests, baselines, local emulator and deploy gate.
3. Root `../AGENTS.md` — repo-wide V1/V2 separation and project invariants.

`docs/Spark-Backend.md`, `docs/V3-Plan.md`, and `backend/functions/` are historical references. Do
not implement or deploy from them.

## Current implementation

| concern | current control |
| --- | --- |
| frontend | frontend/ Vite entries index.html app.html admin.html |
| deployed backend | backend/sync-fn only; firebase.json codebase sync; Node 22 |
| public intake | anonymous Auth + production App Check + callable validation/rate limit/dedupe |
| student data | getStudentDashboard/getCurriculum/submitStage callables; no direct Firestore access |
| staff | owner/admin claim + confirmed TOTP + current sessionVersion + production App Check |
| browser writes | all denied by firestore.rules |
| revocation | revocations/{uid}.sessionVersion checked by Rules and every callable |
| lockdown | non-owner sensitive reads and calls denied; owner recovery remains |
| payments | Zeffy confirm is server-side and email-bound; refund sync revokes supporter |
| access recovery | enable restores sign-in; extendAccess separately restores an expired member to ACTIVE and synchronizes claims |
| role removal | removing an admin's final staff role restores claims for an ACTIVE unexpired member and revokes the old staff token |
| settings | owner-only callable; exact zeffy.com/cal.com host allowlist |
| retention | Firestore TTL field overrides + scheduled maintenance |
| audit | actor-attributed Firestore events plus structured Cloud Logging copy |
| headers | repo-root customHttp.yml (CSP HSTS cache and browser isolation) |
| break glass | admin-cli real mutations require CFG_BREAK_GLASS + CFG_OPERATOR_ID |

## Non-negotiable invariants

- Never restore client writes to applications, progress, stage locks, settings, members, donations,
  audit, revocations, or system controls.
- Curriculum must not return to `frontend/public/`.
- No supporter reaches ACTIVE without `donations/{paymentId}.verificationState == VERIFIED` bound to
  the same application.
- Never remove staff MFA, App Check, revocation, or lockdown checks from a callable.
- Never allow a member mutation to target an owner/admin account.
- Keep re-enable separate from access restoration; never reactivate an expired window implicitly.
- When removing an admin's final staff role, preserve a valid returning student's server-derived
  `accessBasis` and `accessEnds`; never trust browser-supplied claims.
- Every privileged mutation must include actor-attributed audit evidence.
- Never weaken the CSP with `script-src 'unsafe-inline'`.
- Never run emulator E2E tests with production credentials or endpoints.
- Never deploy `backend/functions/`; it is excluded from `firebase.json`.

## Required verification

After any security, Auth, Rules, lifecycle, payment, frontend bootstrap, or hosting-header change, run
the complete matrix from `docs/Security-Verification-Walkthrough.md`:

If the commands are launched by bridging from PowerShell, Git Bash, or another non-Linux shell,
set `TMPDIR=/tmp TMP=/tmp TEMP=/tmp` inside WSL first. Otherwise Firebase may inherit a
`/mnt/c/...` temp directory and fail to create its Functions runtime Unix socket.

```bash
export TMPDIR=/tmp TMP=/tmp TEMP=/tmp

cd v3/frontend && npm run build && npm run test:security

cd v3/backend
DEBUG= firebase emulators:exec --only firestore \
  'cd admin-cli && npm run test:rules'

DEBUG= ZEFFY_API_KEY=test-key ZEFFY_API_BASE_URL=http://127.0.0.1:7777 \
firebase emulators:exec --only auth,firestore,functions \
  'cd admin-cli && npm run test:security'
```

Zero npm audit findings at moderate-or-higher severity are required in all three packages. A build or
happy-path test alone is not enough.

## Local/manual behavior

Set `VITE_USE_EMULATORS=true` only in local `.env`. The frontend then connects to Auth 9099,
Firestore 8080, and Functions 5001. Production builds fail preflight without the App Check site key
and fail closed at runtime if App Check cannot initialize.

Emulator owner/admin helpers receive `testMfa`; production never does. Production staff must enroll
TOTP and call `confirmMfaEnrollment`, then reauthenticate.

## Editing conventions

- Keep server authorization in `backend/sync-fn/src/security.js` and shared callable options in
  `src/config.js`.
- Reuse `queueAudit` inside Firestore transactions and `writeAudit` for standalone events.
- Validate every callable input with a strict Zod schema and bounded strings/numbers.
- External fetches need HTTPS production bases, timeouts, bounded pagination, and fail-closed status
  handling. Emulator-only URL overrides must stay behind `IS_EMULATOR`.
- Update tests and the walkthrough baseline whenever behavior intentionally changes.
