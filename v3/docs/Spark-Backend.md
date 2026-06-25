# V3 Spark Backend — Functions-free, $0, no card (Rev. 1)

Decision: V3 runs on Firebase **Spark** (no Blaze, no billing card). Spark **cannot deploy
Cloud Functions** and has **no Cloud Storage** for new projects (verified 2026-06-25 — see
sources at bottom). So the Functions-based backend in [`V3-Plan.md`](V3-Plan.md) is retained
only as a **Blaze reference** (`v3/backend/functions/`, not deployed). This document is the
**active backend** for the MVP.

The trust boundary moves to two free places:

```csv
boundary,runs where,does
Firestore Security Rules,enforced by Firestore itself (free),all client-facing authz — apply-gate, member/progress access, deny writes to protected data
admin-cli (firebase-admin),admin operator's own machine (Node + service-account key),privileged Admin-SDK ops — createUser, set claims, grant/extend/revoke, expiry sweep
```

Nothing is always-on; there is no deployed API. The admin runs CLI commands to grant/revoke.
For a single-operator pilot this is sufficient and free.

---

## 1. What moved (Functions → Spark)

```csv
Functions design (Blaze),Spark replacement
submitApplication callable,client writes applications/{id} directly; Rules enforce shape + age/consent gate
grantAccess / approve (system-fn),admin-cli `grant.mjs` — createUser + setCustomUserClaims + member doc (Admin SDK works on Spark)
redeemCode → custom token,Firebase email-link sign-in (client SDK, free); claims set by grant give role/window
submitStage callable (re-derive gating),client writes members/{uid}/progress/{key}; Rules require ACTIVE+in-window+own-doc (self-attested)
admin callables (list/extend/revoke),admin dashboard reads via Rules (isAdmin); extend/revoke via admin-cli
aggregates triggers (memberDashboard, counters),no triggers on Spark → student app reads members/{uid} + progress (≤3 reads); admin overview = small status query
expiry scheduler (system-fn),admin-cli `expiry-sweep.mjs` run manually or by the admin's own cron
verifyDonation (Zeffy),admin-cli `confirm-donation.mjs` (fail-closed) — post-MVP
gated curriculum (Cloud Storage),NOT used — curriculum served static from Amplify build; deliverables are external URLs
```

---

## 2. Auth — passwordless email-link

```csv
actor,flow
applicant,anonymous sign-in (free) → create applications/{id} (Rules-gated) — gives a uid, limits spam
beneficiary student,admin runs grant.mjs → createUser(email) + claims {role:student, accessBasis, accessEnds}; student signs in via Firebase email-link; claims ride in the ID token
admin,bootstrap once: admin-cli make-admin.mjs sets role:admin claim; signs into admin.html via email-link
```

Why email-link (not the custom-token magic link from the Functions design): redeeming a code
for a custom token needs the Admin SDK at request time, which has no home on Spark (no hosted
endpoint). Firebase **email-link is a client-side passwordless flow** that needs no server and
is free. Authentication ≠ authorization: an un-granted person can sign in but has **no member
doc and no `student` claim**, so Rules deny everything — access still requires an admin grant.

---

## 3. Enforcement summary (Firestore Rules)

```csv
collection,client may,enforced by
applications/{id},CREATE only, if status==SUBMITTED + ageBracket!=under13 + (13-17 ⇒ guardianConsent) + allowed keys; READ if admin,Rules
members/{uid},READ own or admin; NO writes (admin-cli only),Rules + Admin SDK bypass
members/{uid}/progress/{key},READ own/admin; CREATE/UPDATE status=complete if ACTIVE+in-window+own doc,Rules (claims)
counters / auditLog / donations / accessCodes,READ if admin; NO client writes,Rules + Admin SDK
```

Preserved invariants: no access without an admin grant (member doc + `student` claim);
claims-based authz with no lookup reads; protected collections are client-read-only;
audit + member data are written only by the admin-cli (Admin SDK).

MVP deviations (documented, post-MVP hardening): **strict sequential gating is relaxed** —
Rules enforce ACTIVE+in-window+own-doc and completion is self-attested (the SPA shows the
gated order); enforcing "only the next stage" needs a trigger/Function (Blaze) and is deferred.
The denormalized 1-read `memberDashboard` rollup is dropped (no triggers) for a ≤3-read direct
read; still tiny at pilot scale.

---

## 4. admin-cli usage

```csv
command,effect
node admin-cli/make-admin.mjs <email>,bootstrap: create/link admin user + set role:admin claim
node admin-cli/grant.mjs <applicationId> [--days 90] [--basis beneficiary|supporter],vet→ACTIVE: createUser(email) + claims + member doc + audit; tells student to sign in
node admin-cli/extend.mjs <uid> --days N,bump accessEnds claim + member doc (no re-auth needed)
node admin-cli/revoke.mjs <uid>,claim accessEnds=now + member ENDED + revokeRefreshTokens + audit
node admin-cli/expiry-sweep.mjs,members past accessEnds → ENDED + revoke + audit (run via cron)
```

Credentials: set `GOOGLE_APPLICATION_CREDENTIALS` to a **service-account key** JSON
(Firebase Console → Project settings → Service accounts → Generate new private key). The key
is secret — keep it out of git (already covered by `.gitignore`); never commit it. Against the
emulator, set `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` instead (no key needed).

> I need from you: the service-account key (downloaded locally) OR confirmation to run only
> against the emulator. I won't handle the key contents — you place it and point the env var at it.

---

## 5. Local testing (Java is installed)

```csv
gate,command
rules unit tests,"firebase emulators:exec --only firestore 'node admin-cli/test/rules.test.mjs'" (uses @firebase/rules-unit-testing)
admin-cli against emulator,start auth+firestore emulators → FIREBASE_AUTH_EMULATOR_HOST/FIRESTORE_EMULATOR_HOST set → run grant.mjs → assert member doc + claim
frontend build,cd v3/frontend && npm ci && npm run build → dist/
```

---

## Sources
- Cloud Functions require Blaze: <https://firebase.google.com/docs/projects/billing/firebase-pricing-plans>
- No Cloud Storage on Spark for new projects: <https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024>
