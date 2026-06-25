// DEPRECATED on Spark. The custom-token "magic code" redeem needed an Admin-SDK endpoint,
// which has no home on the Functions-free Spark backend. Passwordless sign-in is now Firebase
// email-link — see ./auth.js (completeSignInIfPresent). Kept as a pointer to avoid stale imports.
export { completeSignInIfPresent as redeemFromUrl } from './auth.js';
