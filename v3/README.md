# CFG V3 — hosted MVP (Amplify + Firebase Spark)

The shipped, **$0 / no-card** variant of the V2 demo. **AWS Amplify** hosts the static
frontend; **Firebase Spark** is the backend, **Functions-free**: enforcement lives in
**Firestore Security Rules**, privileged ops in a local **`firebase-admin` CLI**, and auth is
passwordless **email-link**. Deployed and end-to-end tested against the real project.

- **Live:** <https://feat-v3-mvp.d3eyz6x5b4wbjx.amplifyapp.com>
- **Agent guide (authoritative):** [`CLAUDE.md`](CLAUDE.md)
- **Backend design:** [`docs/Spark-Backend.md`](docs/Spark-Backend.md) ·
  **MVP plan:** [`docs/MVP-Plan.md`](docs/MVP-Plan.md) ·
  **Blaze reference:** [`docs/V3-Plan.md`](docs/V3-Plan.md)

## Log in (live)

Email-link sign-in — open the link **on the same device/browser** that requested it.

| Role | URL | Email |
|------|-----|-------|
| Admin | `…amplifyapp.com/admin.html` | `caotinh98c@gmail.com` |
| Student | `…amplifyapp.com/app.html` | `caotinh98c+student@gmail.com` |

Enter the email → "Email me a sign-in link" → open the email → you land back signed in.
(The `+student` alias is delivered to the same Gmail inbox; one Auth account can hold only one role.)

## How it works

```text
Browser ──Firebase Web SDK──► Firestore (reads/writes gated by Security Rules)
                              └► Firebase Auth (email-link; persisted role/window claims)
Admin operator ──firebase-admin CLI (local + service-account key)──► grant / revoke / expiry
```

Apply is a client write behind a Rules-enforced age/consent gate (under-13 denied, 13–17 needs
guardian consent). Access requires an admin grant: `grant.mjs` creates the Auth user, sets the
`role=student` + `accessEnds` claims, and writes the member doc — there is **no hosted code that
can mint accounts**. Full design + security invariants: [`CLAUDE.md`](CLAUDE.md) /
[`docs/Spark-Backend.md`](docs/Spark-Backend.md).

## Local dev (Java + firebase-tools installed)

```bash
# backend — Firestore + Auth emulators
cd v3/backend && firebase emulators:start --only firestore,auth

# admin-cli against the emulator (no key needed)
cd v3/backend/admin-cli && npm install
FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
  node make-admin.mjs you@example.com

# frontend — Vite dev server (.env supplies VITE_FB_*)
cd v3/frontend && npm install && npm run dev
```

## Test (verified green)

```bash
# backend grant flow on the emulator
cd v3/backend && firebase emulators:exec --only firestore,auth 'cd admin-cli && node test/flow.test.mjs'

# live: deployed Rules from a client (no key) — valid apply allowed, under-13 denied
cd v3/frontend && node scripts/live-apply.mjs

# live: grant → student session reads own / denied others (needs the service-account key)
export GOOGLE_APPLICATION_CREDENTIALS=v3/code4good-stem-career-path-firebase-adminsdk-*.json
node v3/backend/admin-cli/test/grant-mint.mjs <applicationId> \
  && (cd v3/frontend && node scripts/live-student-read.mjs) \
  && node v3/backend/admin-cli/test/cleanup.mjs <applicationId>
```

All of the above pass against the real `code4good-stem-career-path` project.

## Deploy

```bash
# backend (Spark): rules + indexes only — Functions are NOT deployed
cd v3/backend && firebase deploy --only firestore --project code4good-stem-career-path

# frontend: push to feat/v3-mvp → Amplify auto-builds (monorepo appRoot v3/frontend via repo-root amplify.yml)
```

Firebase config (`VITE_FB_*`, public) lives in `frontend/.env` for local builds and as Amplify
environment variables for the hosted build. After deploy, the Amplify domain must be in
**Firebase Auth → Authorized domains** for email-link to work.

## Security note

The service-account key (`v3/code4good-stem-career-path-firebase-adminsdk-*.json`) is **gitignored
and must never be committed or shared**. It grants full admin to the Firebase project. Use the
emulator (`*_EMULATOR_HOST`) when a key isn't needed.

## Status

Core loop is **live and end-to-end tested**. Still stubby (not blocking login): dashboards render
minimal text, `public/curriculum.json` is empty (no stages yet), and the admin SPA is read-only
(grant/revoke are CLI). Next: populate curriculum + dashboard/stage UI, add rules-unit tests, and
merge `feat/v3-mvp` → `main`. See [`docs/MVP-Plan.md`](docs/MVP-Plan.md) and [`CLAUDE.md`](CLAUDE.md) TODO.
