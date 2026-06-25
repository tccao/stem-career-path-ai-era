// Modular Firebase Web SDK init. Config values are public by design (security is
// enforced by Firestore Rules + Functions, never by hiding these keys).
// Fill from your Firebase project settings, or inject at build time via Vite env vars.
// Spark / Functions-free: the app talks to Firestore + Auth directly (no Cloud Functions).
// Enforcement is in Firestore Security Rules; privileged ops are done by the admin-cli.
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(firebaseConfig);

// IndexedDB cache → repeat views are read-light (served from cache, network only on change).
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const fns = getFunctions(app); // httpsCallable targets the Cloud Functions backend
export const auth = getAuth(app);
