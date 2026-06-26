# CFG V3 — hosted MVP (Amplify + Firebase Spark)

The shipped, **$0 / no-card** variant of the V2 demo. **AWS Amplify** hosts the static
frontend; **Firebase Spark** is the backend, **Functions-free**: enforcement lives in
**Firestore Security Rules**, privileged ops in a local **`firebase-admin` CLI**, and auth is
passwordless **email-link**. The V1 marketing landing page is the public front door. Deployed
and end-to-end tested against the real project.

- **Live:** <https://feat-v3-mvp.d3eyz6x5b4wbjx.amplifyapp.com> — `/` landing · `/app.html` student · `/admin.html` admin
- **Agent guide (authoritative):** [`CLAUDE.md`](CLAUDE.md)
- **Designs:** [`docs/Spark-Backend.md`](docs/Spark-Backend.md) (backend) ·
  [`docs/Phase2-UI-Plan.md`](docs/Phase2-UI-Plan.md) (UI port) ·
  [`docs/MVP-Plan.md`](docs/MVP-Plan.md) · [`docs/V3-Plan.md`](docs/V3-Plan.md) (Blaze ref)

## What's built (current)

- **Landing page** (`/`) — the V1 marketing site, wired to V3: **Apply** writes a real Firestore
  application behind the COPPA age/consent gate; **Login** → `/app.html`; **Donate** → Zeffy.
- **Student app** (`/app.html`) — full "vibrant" design ported from the V2 demo: glassy top bar +
  progress ring, gradient sidebar + accordion path tree, momentum chips, a hero featuring the
  active/selected stage, stage-detail with requirement checkboxes + proof-of-work submit, the
  journey grid (fast-track weeks → day drill-down; roadmap pillar cards), and the earn ladder.
- **Admin console** (`/admin.html`) — KPIs, status tabs, application queue + detail with an
  **interview card** and **reject**, a members table, and per-stage **lock/unlock** gate overrides.
  Reads go through Firestore Rules (admin claim); account-minting actions render the exact
  **admin-cli command to copy** (Spark has no privileged hosted endpoint).
- **Curriculum** — 8 pillars + 28 fast-track days (`public/curriculum.json`). **Both tracks** live.

## Log in (live)

Email-link sign-in — open the link **on the same device/browser** that requested it.

| Role | URL | Email |
|------|-----|-------|
| Admin | `…/admin.html` | `caotinh98c@gmail.com` |
| Student · Fast Track | `…/app.html` | `caotinh98c+student@gmail.com` |
| Student · Roadmap | `…/app.html` | `caotinh98c+student2@gmail.com` |

The `+alias` addresses deliver to the same Gmail inbox; one Auth account holds one role.

> **⚠️ Email-link sign-in limit (Spark): 5 sign-in emails per day.** Firebase recently lowered the
> built-in email-link quota to **5/day** on the no-cost plan; past that you get `auth/quota-exceeded`.
> Options: (1) **wait** ~24h for reset; (2) **Blaze** plan → 25,000/day (custom SMTP does *not* lift
> this — it's plan-based); (3) **stay on Spark** and have the admin-cli **generate** the sign-in link
> via `generateSignInWithEmailLink` (a separate 20,000 links/day quota) and open it directly.
> See <https://firebase.google.com/docs/auth/limits>.

## How it works

```text
Browser ──Firebase Web SDK──► Firestore (reads/writes gated by Security Rules)
                              └► Firebase Auth (email-link; persisted role/window claims)
Admin operator ──firebase-admin CLI (local + service-account key)──► grant / extend / revoke / expiry
```

Access requires an admin grant: `grant.mjs` creates the Auth user, sets the `role=student` +
`accessEnds` (+ `accessBasis`) claims, and writes the member doc — **no hosted code can mint
accounts**. The admin browser can only do NON-minting writes (schedule interview, reject, stage
lock/unlock). Full design + invariants: [`CLAUDE.md`](CLAUDE.md) / [`docs/Spark-Backend.md`](docs/Spark-Backend.md).

## Local dev (Java + firebase-tools installed)

```bash
cd v3/backend && firebase emulators:start --only firestore,auth          # backend
cd v3/backend/admin-cli && npm install
FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
  node make-admin.mjs you@example.com
cd v3/frontend && npm install && npm run dev                              # frontend (.env → VITE_FB_*)
```

## Provision / manage (real project — needs the service-account key)

```bash
export GOOGLE_APPLICATION_CREDENTIALS=v3/code4good-stem-career-path-firebase-adminsdk-*.json
cd v3/backend
node admin-cli/grant.mjs   <applicationId> --path roadmap --days 365   # grant (fasttrack|roadmap)
node admin-cli/extend.mjs  <uid> --days 90
node admin-cli/revoke.mjs  <uid>
node admin-cli/expiry-sweep.mjs
```

## Test (verified green)

```bash
cd v3/backend && firebase emulators:exec --only firestore,auth 'cd admin-cli && node test/flow.test.mjs'
cd v3/frontend && node scripts/live-apply.mjs            # live: deployed Rules from a client (no key)
```

## Deploy

```bash
cd v3/backend && firebase deploy --only firestore --project code4good-stem-career-path   # rules + indexes
# frontend: push to feat/v3-mvp → Amplify auto-builds (repo-root amplify.yml, appRoot v3/frontend)
```

`VITE_FB_*` (public config) live in `frontend/.env` and as Amplify env vars. The Amplify domain
must be in **Firebase Auth → Authorized domains**. Note: CloudFront caches the root `/` HTML — a
fresh landing may show stale until the CDN TTL / a hard-refresh (hashed JS/CSS assets aren't stale).

## Security note

The service-account key (`v3/code4good-…-firebase-adminsdk-*.json`) is **gitignored and must never
be committed or shared** — it grants full admin to the Firebase project. Use the emulator
(`*_EMULATOR_HOST`) when a key isn't needed.

## Status

**Live and feature-complete for the MVP**: landing + both student tracks + admin console all ported
from the V2 design and wired to real data. Remaining: lift the email-link cap (Blaze or the
link-generation workaround) for >5 logins/day, supporter/Zeffy verify, rules-unit tests, admin MFA,
and merging `feat/v3-mvp` → `main`. See [`CLAUDE.md`](CLAUDE.md) TODO.
