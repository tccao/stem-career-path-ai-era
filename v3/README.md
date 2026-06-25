# CFG V3 — Amplify (frontend) + Firebase (backend)

The hosted, lean variant of the V2 demo. Frontend on **AWS Amplify Hosting**, backend on
**Firebase** (Firestore + Cloud Functions + Storage + Auth-for-sessions). Optimized to be
**read-light** and to keep a **simple account lifecycle** with **passwordless** content access.

Full design: [`docs/V3-Plan.md`](docs/V3-Plan.md).

```text
v3/
  docs/V3-Plan.md      # architecture, lifecycle, data model, access gate, libraries
  frontend/            # → Amplify Hosting (Vite static build; Firebase Web SDK)
  backend/             # → Firebase (functions/, firestore.rules, storage.rules)
```

## Local dev

```bash
# backend — Firebase Local Emulator Suite (replaces V2's MiniStack)
cd v3/backend && npm --prefix functions install
firebase emulators:start --only functions,firestore,auth,storage

# frontend — Vite dev server (point it at the emulators via VITE_FB_* env)
cd v3/frontend && npm install && npm run dev
```

## Deploy

```bash
# backend
cd v3/backend && firebase deploy --only functions,firestore:rules,storage

# frontend — connect this repo in the Amplify console, app root = v3/frontend
#   (build spec: v3/frontend/amplify.yml)
```

Set your Firebase `projectId` in `backend/.firebaserc` and the `VITE_FB_*` values
(from Firebase project settings) for the frontend build.

**Status:** core lifecycle/access/gating logic is wired (Rev. 2 — audit fixes folded in).
Remaining `TODO`s before pilot: email delivery for magic links, the real Zeffy verify HTTP
call (currently fails closed), curriculum stage data in `functions/src/curriculum.js`,
Cloud Storage signed URLs, admin MFA + App Check, `redeemCode` rate-limiting, and the
emulator test suite. See `docs/V3-Plan.md` (Rev. 2 changelog).
