# V3 Setup Guide (Rev. 3)

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

## Production owner bootstrap

Firebase browser variables (`VITE_FB_*`) do not authenticate the Admin SDK. Store the downloaded
service-account JSON outside the repository. From the repository root in WSL, a Windows Downloads
file can be installed as:

```bash
mkdir -p "$HOME/.config/cfg-v3"
cp "/mnt/c/Users/<windows-user>/Downloads/<firebase-adminsdk-file>.json" \
  "$HOME/.config/cfg-v3/firebase-admin.json"
chmod 600 "$HOME/.config/cfg-v3/firebase-admin.json"

cd v3/backend/admin-cli
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/cfg-v3/firebase-admin.json"
export CFG_OWNER_BOOTSTRAP=I_UNDERSTAND_ROOT_ACCESS
node make-owner.mjs 'actual-owner@example.org'
```

`OWNER_EMAIL` in examples is a placeholder; passing it literally produces `auth/invalid-email`.
If the credential path does not exist, Admin SDK commands fail with `app/invalid-credential` before
any account change occurs. Never commit or place the JSON in Amplify environment variables.

## Staff MFA and session behavior

TOTP requires Firebase Authentication upgraded to Identity Platform. Configure it only after that
upgrade; `auth/operation-not-allowed` means the product upgrade is still missing.

Microsoft Authenticator can scan the enrollment QR code or use **Other account** with the generated
secret key. For manual entry, enter the secret—not the whole `otpauth://` URI—and keep device time
automatic. `auth/invalid-verification-code` indicates a mismatched/expired code; start enrollment
again if the saved secret is uncertain.

Owner bootstrap, MFA confirmation, role changes, disable/revoke, grant, and re-enable rotate the
account session. Use a new email sign-in link after these operations; old tabs and old links can
correctly return `functions/unauthenticated` or `permission-denied`.

## Access restoration

Re-enable and restore are intentionally separate:

1. **Reactivate** enables Firebase sign-in. If the access window has expired, the member stays
   `ENDED`.
2. **Restore access** adds days from the later of now or the old end date, marks the member `ACTIVE`,
   clears end/TTL metadata, and synchronizes student claims.
3. The student signs in again because the earlier session was revoked.

When an active member is demoted from admin to no staff role, the student role is restored
automatically. An owner-to-admin change remains an admin role. Supporter access with a reversed or
unverifiable payment remains denied.
