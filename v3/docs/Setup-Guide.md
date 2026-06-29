# V3 Setup Guide (Rev. 2)

The complete install, emulator, test, production-control, deployment, and live-verification procedure
is [`Security-Verification-Walkthrough.md`](Security-Verification-Walkthrough.md). Follow it in order.

Quick local start after installing Node 22, Java 21, Firebase CLI 15.22.2, and running `npm ci` in
the three package directories:

```bash
# terminal 1
cd v3/backend
DEBUG= firebase emulators:start --only auth,firestore,functions

# terminal 2
cd v3/frontend
npm run dev
```

`v3/frontend/.env` must use `VITE_USE_EMULATORS=true`; production must use `false` and provide the
reCAPTCHA Enterprise App Check site key. Never use production credentials for emulator tests.

Production is blocked until TOTP, App Check enforcement, exact origins, Functions secrets, TTL,
Firestore PITR, budget alerts, and locked Cloud Logging audit retention have been verified. The
walkthrough provides the exact commands, success criteria, baseline, safe deployment order, and
read-only post-deploy smoke test.
