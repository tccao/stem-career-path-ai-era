import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { browserSessionPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

const appCheckKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
if (!useEmulators && appCheckKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckKey),
    isTokenAutoRefreshEnabled: true,
  });
} else if (!useEmulators && import.meta.env.PROD) {
  // Production functions reject requests without App Check. This intentionally fails closed.
  console.error('VITE_RECAPTCHA_ENTERPRISE_SITE_KEY is required for production access.');
}

// Sensitive student/admin records are memory-only and disappear when the tab closes.
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
export const auth = getAuth(app);
export const functions = getFunctions(app, import.meta.env.VITE_FB_FUNCTIONS_REGION || 'us-central1');

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

// Avoid durable staff/student sessions on shared browsers.
export const authReady = setPersistence(auth, browserSessionPersistence);
