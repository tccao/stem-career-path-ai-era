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

export { onAuthStateChanged };
