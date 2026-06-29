# HISTORICAL — V3 MVP Plan Rev. 2

> Superseded by [`Architecture-V3.md`](Architecture-V3.md) and
> [`Security-Verification-Walkthrough.md`](Security-Verification-Walkthrough.md).

> **Rev. 2 — Spark/Functions-free pivot.** Hosting choice is **Firebase Spark** (no Blaze, no
> card). Spark can't deploy Cloud Functions and has no Storage, so the **active backend** is
> Firestore Security Rules + a local **admin-cli** ([`Spark-Backend.md`](Spark-Backend.md));
> `v3/backend/functions/` is now a Blaze reference only. Auth is Firebase **email-link**
> (passwordless, client-side). Gates and commits below that mention "functions deploy" are
> superseded by "rules deploy + admin-cli" — see Spark-Backend.md §5.

The smallest **hosted, end-to-end** slice of V3 that proves the apply→grant→learn loop on
real infrastructure (AWS Amplify frontend + Firebase backend). Every environment gate is
**verified by a CLI test, not assumed** (§2 records the actual probe output). Design
reference: [`V3-Plan.md`](V3-Plan.md) (Rev. 2).

---

## 1. MVP "done" state

A reviewer can, against the deployed cloud (not local), complete this one happy path:

| step | who | proves |
| --- | --- | --- |
| open the Amplify-hosted URL | public | frontend is deployed on AWS Amplify Hosting (live https URL) |
| seed/approve one application → grantAccess | admin | server-only account minting + persisted claims + magic-link code issued |
| open the magic link → redeem → signed in | student | passwordless auth (custom token) works end to end |
| dashboard renders | student | memberDashboard read = 1 doc (read-light invariant) |
| submit one gated stage → progress advances | student | server-side gating re-derived from server curriculum; aggregates rebuild the rollup |

In scope (MVP): beneficiary/admin-grant path · passwordless redeem · 1-read dashboard ·
one gated stage submit · Firestore Rules deny client writes · Amplify build+deploy.

Out of scope (post-MVP): supporter/Zeffy donation path (stays fail-closed) · email
deliverability (magic link returned via callable in MVP, emailed later) · admin MFA/App
Check · expiry scheduler · signed-URL gated assets · full test matrix. These are tracked in
[`V3-Plan.md`](V3-Plan.md) §9–§11.

---

## 2. Environment-config gates — verified by CLI (probe 2026-06-25)

| gate | test command | status | note |
| --- | --- | --- | --- |
| node/npm | node --version; npm --version | PASS | node v24.16.0 · npm 11.17.0 |
| git/gh | git --version; gh --version | PASS | git 2.43.0 · gh 2.45.0 (gh authed as tccao) |
| aws cli + identity | aws sts get-caller-identity | PASS | arn …:user/Code4Good-STEM-Path-Root · acct 096615316348 (existing config) |
| firebase cli | firebase --version; firebase projects:list | PASS (cli authed) | firebase-tools 15.22.2; logged in — NO project selected yet (see §4) |
| functions deps | cd v3/backend/functions && npm install --dry-run | PASS | 522 pkgs resolve · exit 0 |
| frontend deps | cd v3/frontend && npm install --dry-run | PASS | resolves · exit 0 |
| JS syntax | node --check (all v3 *.js) | PASS | 23/23 files clean |
| JSON | JSON.parse (all v3 *.json) | PASS | 6/6 parse |
| npm install scripts | npm config / approve-scripts | ACTION | npm 11 blocks postinstall (esbuild, protobufjs, @firebase/util) → Vite build fails until approved (§3 fix) |
| java (emulators) | java -version | BLOCKED | MISSING — Firebase Emulator Suite needs a JVM for Firestore/Auth/Storage emulators (§4 fix) |
| firebase project | firebase use &lt;id&gt; | BLOCKED | no project in .firebaserc yet (placeholder) — user action (§4) |
| amplify hosting | Amplify console build log | BLOCKED | connect the GitHub repo in the AWS Amplify console (Git-connect, no CLI) (§4) |

Note: Amplify Gen1 CLI and Docker are intentionally NOT required — Amplify Hosting deploys
by Git-connect, and V3 emulators run on Java (not Docker/MiniStack).

---

## 3. Fix-now env items (no external account needed)

| item | fix |
| --- | --- |
| npm install scripts | add v3/frontend/.npmrc + v3/backend/functions/.npmrc to trust the needed build scripts, or run `npm install` then `npm approve-scripts esbuild protobufjs @firebase/util`; verify `npm run build` emits dist/ |
| local Java for emulator tests | install a JRE in WSL: `sudo apt-get install -y default-jre` then `java -version` PASS; or skip local emulators and test against a real Firebase project |

---

## 4. Blockers needing you (ping points)

| blocker | what I need from you | why |
| --- | --- | --- |
| Firebase project | create/choose a Firebase project; tell me the projectId (I set it in .firebaserc), and enable: Firestore, Authentication, Cloud Functions + Storage (these require the Blaze pay-as-you-go plan) | CLI is logged in but has no target project; 2nd-gen Functions + Storage need Blaze |
| Java for emulators | approve `sudo apt-get install default-jre` in WSL (or say to test against the real project instead) | emulator-based tests can't run without a JVM |
| Amplify Hosting | connect this GitHub repo in the AWS Amplify console with app root = v3/frontend (uses amplify.yml) | Git-connect deploy is a console+GitHub-OAuth step I can't do headless |

I will not create accounts, enable billing, or change AWS/Firebase settings — those are
yours. Ping me once the projectId exists and I'll wire `.firebaserc`, deploy rules/functions,
and run the gates against it.

---

## 5. Small-commit breakdown (small gits, each independently green)

Branch off `main` → `feat/v3-mvp`. Each commit is the smallest coherent step with a gate
that must pass before the next. No push until you approve.

| # | commit | scope | gate (CLI test) |
| --- | --- | --- | --- |
| 1 | docs(v3): MVP + V3 plan + README | v3/docs/*.md · v3/README.md · v3/.gitignore | markdownlint (optional) |
| 2 | feat(v3-backend): firebase config + rules + indexes | firebase.json · .firebaserc(placeholder) · firestore.rules · firestore.indexes.json · storage.rules | firebase emulators:exec --only firestore 'true' (rules compile) — needs Java/project |
| 3 | feat(v3-backend): functions base (db/audit/config/curriculum) | functions/package.json · index.js · src/_db.js · _audit.js · config.js · curriculum.js | npm ci · node --check |
| 4 | feat(v3-backend): lifecycle + passwordless access | src/lifecycle.js · src/access.js | emulator test: submit→grant→redeem→custom token |
| 5 | feat(v3-backend): student gating + aggregates | src/student.js · src/aggregates.js | emulator test: 1-read dashboard + gated submit |
| 6 | feat(v3-backend): admin + expiry + donations(fail-closed) | src/admin.js · src/expiry.js · src/donations.js | emulator test: role guard + extend(no-lockout) + revoke |
| 7 | feat(v3-frontend): shell + firebase init + amplify.yml | package.json · vite.config.js · amplify.yml · *.html · src/firebase.js | npm ci · npm run build → dist/ |
| 8 | feat(v3-frontend): public/student/admin modules | src/lib/* · src/public/* · src/student/* · src/admin/* | npm run build |
| 9 | test(v3): emulator integration suite | functions/test/** | npm test green on emulator (needs Java/project) |
| 10 | ci(v3): env-gate script | v3/scripts/check-env.sh (runs §2 gates) | script exits 0 on a configured machine |
| 11 | chore(v3): connect Amplify + deploy backend | .firebaserc(real id) · deploy | Amplify build PASS (live URL) · firebase deploy PASS |

Commits 1, 3, 7, 8, 10 are runnable **now** (no external account). Commits 2, 4, 5, 6, 9, 11
need the §4 blockers (Firebase project + Java, and Amplify connect for 11).
