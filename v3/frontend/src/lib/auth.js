// Passwordless auth for the Spark backend (Spark-Backend.md §2). Firebase email-link
// sign-in is a client-only flow (free, no server). Authorization still requires an admin
// grant: a signed-in user with no `student` claim / member doc is denied by Firestore Rules.
import {
  signInAnonymously, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../firebase.js';

const STORAGE_KEY = 'cfg.emailForSignIn';

// Applicants: anonymous session so Rules can attribute the application create to a uid.
export function ensureAnonymous() {
  return auth.currentUser ? Promise.resolve(auth.currentUser) : signInAnonymously(auth).then((c) => c.user);
}

// Student/admin: request a sign-in email. Firebase sends the link to `email`.
export function requestSignInLink(email) {
  const actionCodeSettings = { url: `${location.origin}${location.pathname}`, handleCodeInApp: true };
  localStorage.setItem(STORAGE_KEY, email);
  return sendSignInLinkToEmail(auth, email, actionCodeSettings);
}

// On page load: if the URL is an email-link, complete the sign-in.
export async function completeSignInIfPresent() {
  if (!isSignInWithEmailLink(auth, location.href)) return null;
  let email = localStorage.getItem(STORAGE_KEY);
  if (!email) email = window.prompt('Confirm your email to finish signing in');
  const cred = await signInWithEmailLink(auth, email, location.href);
  localStorage.removeItem(STORAGE_KEY);
  history.replaceState(null, '', location.pathname); // strip the link params
  return cred.user;
}

// Minimal signed-out UI: email field + "send link" button wired to requestSignInLink.
export function mountLogin(root, heading = 'Sign in') {
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'max-width:22rem;margin:3rem auto;font-family:system-ui;display:grid;gap:.6rem';
  const h = document.createElement('h2'); h.textContent = heading;
  const input = document.createElement('input');
  input.type = 'email'; input.placeholder = 'you@example.com'; input.autocomplete = 'email';
  input.style.cssText = 'padding:.6rem;font-size:1rem';
  const btn = document.createElement('button');
  btn.textContent = 'Email me a sign-in link';
  btn.style.cssText = 'padding:.6rem;font-size:1rem;cursor:pointer';
  const msg = document.createElement('p'); msg.style.cssText = 'min-height:1.2rem;color:#444';
  btn.onclick = async () => {
    const email = input.value.trim();
    if (!email) { msg.textContent = 'Enter your email.'; return; }
    btn.disabled = true; msg.textContent = 'Sending…';
    try {
      await requestSignInLink(email);
      msg.textContent = `Link sent to ${email}. Open it on this device to finish signing in.`;
    } catch (e) { msg.textContent = `Error: ${e.code || e.message}`; btn.disabled = false; }
  };
  wrap.append(h, input, btn, msg); root.append(wrap);
}

export { onAuthStateChanged };
