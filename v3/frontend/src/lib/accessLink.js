// Passwordless content access (V3-Plan §5).
// The applicant/donor receives a magic link: https://<app>/redeem?c=<code>.
// Redeeming exchanges the one-time code for a Firebase custom token whose claims
// (role, accessBasis, accessEnds) drive all server-side gating — no password stored.
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { fns, auth } from '../firebase.js';

const redeemCode = httpsCallable(fns, 'redeemCode');

/** Read ?c= from the URL, exchange it for a session. Returns the signed-in user. */
export async function redeemFromUrl() {
  const code = new URLSearchParams(location.search).get('c');
  if (!code) throw new Error('missing access code');
  const { data } = await redeemCode({ code }); // server verifies hash + unused + unexpired
  const { token } = data; // Firebase custom token with role/window claims
  const cred = await signInWithCustomToken(auth, token);
  // strip the code from the URL so it isn't re-used / shared
  history.replaceState(null, '', location.pathname);
  return cred.user;
}
