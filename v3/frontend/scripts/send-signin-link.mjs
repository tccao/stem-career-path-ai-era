// Send a passwordless email-link sign-in email via the client SDK (same call the live app makes).
// Verifies the project can send email-link emails (i.e. the Spark 5/day cap is lifted on Blaze),
// and delivers a real sign-in link to the given address.
//   cd v3/frontend && node scripts/send-signin-link.mjs [email]
import { initializeApp } from 'firebase/app';
import { getAuth, sendSignInLinkToEmail } from 'firebase/auth';

process.loadEnvFile('.env');
const email = process.argv[2] || 'caotinh98c+student2@gmail.com';
const app = initializeApp({
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  appId: process.env.VITE_FB_APP_ID,
});
const auth = getAuth(app);
const actionCodeSettings = { url: 'https://feat-v3-mvp.d3eyz6x5b4wbjx.amplifyapp.com/app.html', handleCodeInApp: true };

const timer = setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, 20000);
try {
  await sendSignInLinkToEmail(auth, email, actionCodeSettings);
  clearTimeout(timer);
  console.log(`SEND_OK — email-link sent to ${email} (continue → ${actionCodeSettings.url})`);
  process.exit(0);
} catch (e) {
  clearTimeout(timer);
  console.error(`SEND_FAIL ${e.code || e.message}`);
  process.exit(1);
}
