# V3 Setup, Configuration & Testing Guide

End-to-end instructions to stand up the V3 hosted MVP from scratch: install tooling, configure the
**Firebase** backend (Blaze) and the **AWS Amplify** frontend, deploy, and test — including how the
**owner** exercises the live production gates from the command line.

This is the operational companion to the design docs: `Architecture-V3.md` (system architecture),
`Spark-Backend.md` (Firestore Rules + admin-cli), and `../CLAUDE.md` (agent/source-of-truth index).

## 1. Architecture at a glance

| Layer | Tech | Where |
|-------|------|-------|
| Frontend (public + student + admin SPAs) | Vite multi-page, Firebase Web SDK | `v3/frontend/` → AWS Amplify Hosting |
| Backend data + auth | Firestore + Firebase Auth (passwordless email-link) | Firebase project `code4good-stem-career-path` (Blaze) |
| Enforcement | Firestore Security Rules (client) + admin-gated Cloud Functions (privileged) | `v3/backend/firestore.rules`, `v3/backend/sync-fn/` |
| Privileged CLI | `firebase-admin` scripts (Admin SDK) | `v3/backend/admin-cli/` |
| Roles | custom claim `role`: **owner > admin > student** | minted by `make-owner.mjs` / hosted functions |

Trust model: the browser can only do what the Rules allow; account-minting, role claims, lockdown, and
secret-backed integrations (Zeffy, Cal.com) run **server-side** in admin/owner-gated Cloud Functions or
the local admin-cli. Secrets never ship to the client.

## 2. Prerequisites

| Tool | Why | Install |
|------|-----|---------|
| Node.js ≥ 20 (repo uses v24.16.0 via nvm) | build frontend, run functions + admin-cli | `nvm install 24` |
| Firebase CLI ≥ 15 | deploy rules/functions, manage secrets | `npm i -g firebase-tools` |
| A Google account with billing | Blaze plan (Cloud Functions need it) | — |
| An AWS account | Amplify Hosting | — |
| Java JRE | only if you run the Firebase emulators locally | `apt install default-jre` |
| Git + GitHub access | Amplify connects to the repo | — |

> **WSL/Windows note.** If the repo is opened over `\\wsl.localhost\...`, `node`/`firebase` run on the
> Windows side without nvm. Run backend commands inside WSL with a login shell:
> `wsl.exe bash -lic 'cd ~/stem-career-path-ai-era/v3/backend && firebase deploy --only firestore:rules'`.

## 3. Firebase backend setup

### 3.1 Project + Blaze

1. Create (or open) the Firebase project `code4good-stem-career-path`.
2. Upgrade it to the **Blaze** (pay-as-you-go) plan — required for Cloud Functions. Costs stay ~$0 at
   pilot scale (see `Architecture-V3.md` §11a); set a budget alert to be safe.

### 3.2 Authentication (email-link)

1. Console → **Authentication → Sign-in method**: enable **Email/Password**, then turn on
   **Email link (passwordless sign-in)**. Also enable **Anonymous** (used by `/apply`).
2. Console → **Authentication → Settings → Authorized domains**: add your dev origin (`localhost`) and,
   later, the Amplify domain (§4.4). **Email-link sign-in fails with `auth/unauthorized-domain` until the
   serving domain is on this list.**
3. Email send limit on Blaze is 25,000/day (it is only 5/day on Spark — a real blocker we hit).

### 3.3 Firestore

1. Console → **Firestore Database → Create database** in **Native** mode; pick a region (e.g.
   `us-central`/`nam5`) and keep it consistent with the functions region (`us-central1`).
2. Enable **Point-in-time recovery** (Firestore → settings) for safety.

### 3.4 Web app config → frontend env

1. Console → **Project settings → Your apps → Web app**. Copy the SDK config.
2. In `v3/frontend/`, `cp .env.example .env` and fill the values (these are **public**, protected by
   Rules — not secrets):

   ```bash
   VITE_FB_API_KEY=...            # Web API key
   VITE_FB_AUTH_DOMAIN=code4good-stem-career-path.firebaseapp.com
   VITE_FB_PROJECT_ID=code4good-stem-career-path
   VITE_FB_STORAGE_BUCKET=code4good-stem-career-path.firebasestorage.app
   VITE_FB_APP_ID=...
   ```

### 3.5 CLI login + service-account key

1. `firebase login` (interactive). The default project is pinned in `v3/backend/.firebaserc`.
2. Console → **Project settings → Service accounts → Generate new private key**. Save the JSON inside
   `v3/` as `code4good-stem-career-path-firebase-adminsdk-*.json`. It is **gitignored** — never commit or
   paste it. The admin-cli and `call-fn.mjs` use it via `GOOGLE_APPLICATION_CREDENTIALS`.

### 3.6 Functions secrets (Zeffy + Cal.com)

The Zeffy and Cal.com API keys are **secrets** — they stay server-side as Functions secrets. From
`v3/backend/`:

```bash
firebase functions:secrets:set ZEFFY_API_KEY   # paste the Zeffy key when prompted
firebase functions:secrets:set CAL_API_KEY     # paste the Cal.com key when prompted
```

(The same keys live locally, gitignored, at `v3/Zeffy_API_Key.txt` and `v3/Cal.com-Dev-API-Key.txt` for
the admin-cli fallbacks.)

### 3.7 Deploy rules, indexes, and functions

From `v3/backend/`:

```bash
# one-time: install the function deps
( cd sync-fn && npm install )

# Firestore Rules + indexes
firebase deploy --only firestore:rules,firestore:indexes

# Cloud Functions (only the sync-fn codebase is registered in firebase.json, so this
# deploys exactly the 10 callables; the functions/ dir is a Blaze reference and is skipped)
firebase deploy --only functions

# to redeploy a single function, target the codebase:
firebase deploy --only functions:sync:getInterview
```

> First-deploy gotchas (both transient, both real): if the build fails with *"missing permission on the
> build service account,"* the just-enabled Cloud Build API is still propagating — wait ~2 min and retry.
> If a function's first call returns `functions/internal` with *"request was not authenticated"* in the
> logs, its public-invoker binding wasn't applied (a failed-build create) — `firebase functions:delete
> <name> --region us-central1 --force` then redeploy; a clean create sets it.

### 3.8 Bootstrap the owner

The **first owner is minted locally** (root of trust — hosted code can't forge it). From `v3/backend/`:

```bash
GOOGLE_APPLICATION_CREDENTIALS=../code4good-stem-career-path-firebase-adminsdk-*.json \
  node admin-cli/make-owner.mjs you@example.com
```

The owner then signs in on `admin.html` (email link) and manages everyone else from the **Owner** tab
(promote admins, disable accounts, lockdown).

## 4. Amplify frontend setup

### 4.1 Connect the repo (monorepo)

1. AWS Amplify → **Host web app** → connect the GitHub repo and pick the branch (`feat/v3-mvp` for the
   preview; `main` at launch).
2. Set the **app root / monorepo root** to `v3/frontend`. The build spec is the **repo-root**
   `amplify.yml` (it uses the `applications[].appRoot` form; a flat spec errors with *"Monorepo spec
   provided without 'applications' key"*).

### 4.2 Environment variables

In Amplify → **Hosting → Environment variables**, add the same `VITE_FB_*` keys as in `.env` (§3.4).
Vite inlines them at build time.

### 4.3 Build + deploy

Amplify runs `npm ci` then `npm run build` (Vite) in `v3/frontend` and serves `dist/`. Every push to the
connected branch triggers a rebuild. Live preview URL (current):
`https://feat-v3-mvp.d3eyz6x5b4wbjx.amplifyapp.com`.

### 4.4 Authorize the Amplify domain in Firebase (critical)

Back in Console → **Authentication → Settings → Authorized domains**, add the Amplify domain (e.g.
`feat-v3-mvp.d3eyz6x5b4wbjx.amplifyapp.com`) and any custom domain. Without this, hosted email-link
sign-in is rejected.

## 5. Configuration (Zeffy + Cal.com links)

The public donate (Zeffy) and interview (Cal.com) links live in Firestore at `settings/public`. Set them
from the admin console's **Settings** modal (owner/admin), which writes the shape-validated doc. The
landing page reads it to wire the Donate button and the apply-confirmation "Book your 15-min interview"
CTA (which prefills the applicant's email/name so the booking matches their application).

## 6. Local development

```bash
cd v3/frontend
npm ci
npm run dev        # Vite dev server (uses .env); open the printed localhost URL
npm run build      # production build into dist/ (what Amplify runs)
```

The dev site talks to the **real** Firebase project unless you wire up emulators. To use emulators,
install Java and run `firebase emulators:start` from `v3/backend/` (ports in `firebase.json`); the
admin-cli auto-detects `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` and needs no key there.

## 7. Testing

### 7.1 Build + lint

```bash
( cd v3/frontend && npm run build )                     # must exit 0
node --check v3/backend/sync-fn/index.js                # function syntax
npx markdownlint-cli2 "v3/docs/*.md" "v3/CLAUDE.md"     # docs lint
```

### 7.2 Function gate probes (no auth)

Every callable fails closed. An unauthenticated probe should return our app-level error (not a platform
401), which proves the function is reachable and the gate works:

```bash
base=https://us-central1-code4good-stem-career-path.cloudfunctions.net
curl -s -X POST "$base/setRole"      -H 'Content-Type: application/json' --data '{"data":{}}'   # -> "owner only"
curl -s -X POST "$base/grant"        -H 'Content-Type: application/json' --data '{"data":{}}'   # -> "staff only"
```

### 7.3 Live function calls as a role (`call-fn.mjs`)

`admin-cli/call-fn.mjs` calls a **deployed** function as a chosen account — the same path the browser
uses — so the owner can test the live gates end-to-end. From `v3/backend/` (the web apiKey is public and
read from `v3/frontend/.env`, or pass `FB_WEB_API_KEY=`):

```bash
export GOOGLE_APPLICATION_CREDENTIALS=../code4good-stem-career-path-firebase-adminsdk-*.json

# owner: list every account (admins/owner/students)
node admin-cli/call-fn.mjs listAccounts --as you@example.com

# owner: read an applicant's Cal.com interview slot
node admin-cli/call-fn.mjs getInterview --as you@example.com --data '{"email":"applicant@x.com"}'

# verify the gate: calling an owner-only fn AS A STUDENT must be denied
node admin-cli/call-fn.mjs setRole --as student@x.com --data '{"email":"a@b.com","role":"admin"}'   # -> HTTP 403 owner only
```

### 7.4 End-to-end flow

1. **Apply** — on the live site, submit an application (the COPPA age/consent gate runs client + in
   Rules). Optionally book the interview via the prefilled Cal.com link.
2. **Review + grant** — sign in to `admin.html`; open the SUBMITTED application (it shows the booked
   Cal.com slot), pick a path, **Approve & grant** (mints the student + claims + member doc).
3. **Learn** — the granted email signs in on `app.html` and works the curriculum (progress writes need
   ACTIVE + in-window + own-doc).
4. **Manage** — from Members: **Extend** the window or **Disable** the account. From the **Owner** tab:
   promote/demote roles, disable any account, or flip **lockdown**.

## 8. Owner & admin operations (CLI)

### 8.1 admin-cli reference

Run from `v3/backend/` with `GOOGLE_APPLICATION_CREDENTIALS` set to the service-account key. These use
the Admin SDK directly (they bypass Rules and the hosted functions — the local equivalent of the hosted
ops):

| Command | Does |
|---------|------|
| `node admin-cli/make-owner.mjs <email>` | mint the first/another owner (top tier) |
| `node admin-cli/make-admin.mjs <email>` | mint an admin |
| `node admin-cli/grant.mjs <appId> [--days 90] [--basis beneficiary\|supporter] [--path fasttrack\|roadmap]` | approve → createUser + claims + member |
| `node admin-cli/extend.mjs <uid> --days N` | extend a member's window |
| `node admin-cli/revoke.mjs <uid>` | end a member + expire claim + kill tokens |
| `node admin-cli/expiry-sweep.mjs` | end members whose window lapsed (cron-able) |
| `node admin-cli/sync-donations.mjs` | pull Zeffy payments + campaigns into Firestore |
| `node admin-cli/confirm-donation.mjs <appId> <zeffyPaymentId>` | verify a Zeffy payment (fail-closed) → grant supporter |

### 8.2 Testing live production as the owner

Use `call-fn.mjs` (§7.3) to drive the **deployed** functions as the owner — this is how the owner
"communicates with" production without the browser. The owner-gated set: `listAccounts`, `setRole`,
`setLockdown`. The staff set (owner can call all): `grant`, `extendAccess`, `revokeAccess`,
`disableAccount`, `enableAccount`, `getInterview`, `syncDonations`.

### 8.3 Incident response

| Situation | Action |
|-----------|--------|
| A compromised account | Owner tab → **Disable** (or `call-fn.mjs disableAccount --as owner --data '{"email":"..."}'`). Blocks sign-in + kills sessions instantly. |
| Under active attack / need to freeze everything | Owner tab → **Enable lockdown** (or `call-fn.mjs setLockdown --as owner --data '{"enabled":true,"reason":"..."}'`). Every non-owner function + client write is denied until lifted. |
| Rogue admin | Owner-only `setRole ... none` to strip the role; admins can never demote/disable each other. |

## 9. Deployed Cloud Functions reference

All are 2nd-gen callables, `us-central1`, nodejs22, scale-to-zero, in codebase `sync`.

| Function | Gate | Purpose | Secret |
|----------|------|---------|--------|
| `grant` | staff | approve application → createUser + claims + member | — |
| `extendAccess` | staff | extend a member's access window | — |
| `revokeAccess` | staff | end a member (now superseded by Disable in the UI) | — |
| `disableAccount` | staff* | block sign-in + kill sessions (*admin→students only; owner→anyone but an owner) | — |
| `enableAccount` | staff* | re-enable a disabled account | — |
| `getInterview` | staff | read an applicant's Cal.com booking | `CAL_API_KEY` |
| `syncDonations` | staff | sync Zeffy payments + campaigns → Firestore | `ZEFFY_API_KEY` |
| `listAccounts` | owner | list all email-bearing accounts (roster) | — |
| `setRole` | owner | set a role: admin / owner / none | — |
| `setLockdown` | owner | global kill-switch (`system/lockdown`) | — |

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| "permission denied" in the dashboard right after a role change | the browser still holds the pre-change ID token | log out + sign in again (or clear site data for the domain); claims only refresh on a new token |
| Email-link sign-in never works on the hosted site | serving domain not authorized | add the Amplify/custom domain to Auth → Authorized domains (§4.4) |
| `auth/quota-exceeded` on sign-in | email send cap | Blaze is 25k/day; Spark is only 5/day |
| First function deploy: "missing permission on the build service account" | just-enabled Cloud Build API still propagating | wait ~2 min and redeploy |
| First call returns `functions/internal` ("request was not authenticated" in logs) | public-invoker binding missing after a failed-build create | `firebase functions:delete <name> --region us-central1 --force` then redeploy |
| `functions/unavailable` from `getInterview` | Cal.com API v1 was decommissioned | already fixed (v2 only); ensure `CAL_API_KEY` secret is set |
| Admin dashboard shows stale content after a deploy | CloudFront caches the root HTML | hard-refresh (Ctrl/Cmd+Shift+R); hashed JS/CSS never go stale |
| "No interview booked" for an applicant who booked | the booking email ≠ the application email | applicants must book with the email they applied with (the apply CTA now prefills it) |
| Backend commands fail over `\\wsl.localhost` | running on Windows without nvm | bridge into WSL with `wsl.exe bash -lic '...'` |
