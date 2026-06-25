# CFG V3 — Amplify (frontend) + Firebase Spark (backend)

The hosted, lean, **$0 / no-card** variant of the V2 demo. Frontend on **AWS Amplify Hosting**;
backend on **Firebase Spark** — **Functions-free**: enforcement lives in **Firestore Security
Rules**, privileged ops in a local **admin-cli** (`firebase-admin`), and auth is **passwordless
email-link**. No Cloud Functions, no Cloud Storage (both need Blaze).

Designs: [`docs/Spark-Backend.md`](docs/Spark-Backend.md) (active backend) ·
[`docs/V3-Plan.md`](docs/V3-Plan.md) (Blaze reference) · [`docs/MVP-Plan.md`](docs/MVP-Plan.md).

```text
v3/
  docs/                  # V3-Plan (Blaze ref) · Spark-Backend (active) · MVP-Plan
  frontend/              # → Amplify Hosting (Vite; Firebase Web SDK; email-link auth)
  backend/
    firestore.rules      # the trust boundary (Functions-free)
    firestore.indexes.json
    admin-cli/           # privileged ops: make-admin / grant / extend / revoke / expiry-sweep
    functions/           # BLAZE REFERENCE ONLY — not deployed on Spark
```

## Local dev (Java is installed for emulators)

```bash
# backend — Firestore + Auth emulators
cd v3/backend && firebase emulators:start --only firestore,auth

# admin-cli against the emulator (no service-account key needed)
cd v3/backend/admin-cli && npm install
FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
  node make-admin.mjs you@example.com

# frontend — Vite dev server (point VITE_FB_* at the emulators)
cd v3/frontend && npm install && npm run dev
```

## Deploy

```bash
# backend (Spark): rules only — Functions are NOT deployed
cd v3/backend && firebase deploy --only firestore:rules

# admin runs privileged ops locally with a service-account key:
#   GOOGLE_APPLICATION_CREDENTIALS=key.json node admin-cli/grant.mjs <applicationId>

# frontend — connect this repo in the Amplify console, app root = v3/frontend
#   (build spec: v3/frontend/amplify.yml)
```

`projectId` is set in `backend/.firebaserc` (`code4good-stem-career-path`). Provide the
`VITE_FB_*` values (Firebase Console → Project settings → Web app) as Amplify env vars.

**Status:** backend pivoted to Spark/Functions-free (rules + admin-cli + email-link), syntax-
clean. Remaining before pilot: real curriculum stage data, rules unit tests on the emulator,
admin-cli e2e on the emulator, frontend build verification, supporter/Zeffy grant, admin MFA.
Service-account key (or emulator-only) needed to run admin-cli against the real project.
