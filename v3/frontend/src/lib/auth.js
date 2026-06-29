import {
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  isSignInWithEmailLink,
  multiFactor,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInAnonymously,
  signInWithEmailLink,
} from 'firebase/auth';
import { auth, authReady } from '../firebase.js';

const STORAGE_KEY = 'cfg.emailForSignIn';
const EMAIL_TTL_MS = 15 * 60_000;

function storeEmail(email) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, expiresAt: Date.now() + EMAIL_TTL_MS }));
}

function loadEmail() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (stored?.email && stored.expiresAt > Date.now()) return stored.email;
  } catch { /* prompt fallback below */ }
  localStorage.removeItem(STORAGE_KEY);
  return null;
}

export function clearSignInState() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function ensureAnonymous() {
  await authReady;
  return auth.currentUser || signInAnonymously(auth).then((credential) => credential.user);
}

export async function requestSignInLink(email) {
  await authReady;
  const actionCodeSettings = { url: `${location.origin}${location.pathname}`, handleCodeInApp: true };
  storeEmail(email);
  return sendSignInLinkToEmail(auth, email, actionCodeSettings);
}

async function resolveTotpSignIn(error) {
  const resolver = getMultiFactorResolver(auth, error);
  const hint = resolver.hints.find((item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw new Error('No supported TOTP factor is enrolled.');
  const code = window.prompt('Enter the 6-digit code from your authenticator app');
  if (!code) throw new Error('TOTP verification was cancelled.');
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim());
  return resolver.resolveSignIn(assertion);
}

export async function completeSignInIfPresent() {
  await authReady;
  if (!isSignInWithEmailLink(auth, location.href)) return null;
  let email = loadEmail();
  if (!email) email = window.prompt('Confirm your email to finish signing in');
  if (!email) throw new Error('Email confirmation is required.');
  let credential;
  try {
    credential = await signInWithEmailLink(auth, email, location.href);
  } catch (error) {
    if (error.code !== 'auth/multi-factor-auth-required') throw error;
    credential = await resolveTotpSignIn(error);
  }
  clearSignInState();
  history.replaceState(null, '', location.pathname);
  return credential.user;
}

export async function enrollTotpMfa(user) {
  if (!user.emailVerified) throw new Error('Verify the staff email before enrolling MFA.');
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const uri = secret.generateQrCodeUrl(user.email, 'Code For Good STEM Career Path');
  window.prompt('Add this key or otpauth URI to your authenticator app, then continue.', `${secret.secretKey}\n${uri}`);
  const code = window.prompt('Enter the current 6-digit authenticator code to finish enrollment');
  if (!code) throw new Error('MFA enrollment was cancelled.');
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim());
  await multiFactor(user).enroll(assertion, 'CFG authenticator');
}

export function hasEnrolledMfa(user) {
  return multiFactor(user).enrolledFactors.some((factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}

export function mountLogin(root, heading = 'Sign in') {
  root.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className = 'login';
  const h = document.createElement('h2'); h.textContent = heading;
  const input = document.createElement('input');
  input.type = 'email'; input.placeholder = 'you@example.com'; input.autocomplete = 'email'; input.className = 'cfg-input';
  const btn = document.createElement('button'); btn.textContent = 'Email me a sign-in link'; btn.className = 'btn btn-purple';
  const msg = document.createElement('p'); msg.className = 'cfg-msg';
  btn.onclick = async () => {
    const email = input.value.trim();
    if (!email) { msg.textContent = 'Enter your email.'; return; }
    btn.disabled = true; msg.textContent = 'Sending…';
    try {
      await requestSignInLink(email);
      msg.textContent = `Link sent to ${email}. Open it in this browser within 15 minutes.`;
    } catch (error) {
      msg.textContent = `Error: ${error.code || error.message}`;
      btn.disabled = false;
    }
  };
  wrap.append(h, input, btn, msg); root.append(wrap);
}

export { onAuthStateChanged };
