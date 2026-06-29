try { process.loadEnvFile('.env'); } catch { /* Amplify injects environment variables directly. */ }

const required = [
  'VITE_FB_API_KEY',
  'VITE_FB_AUTH_DOMAIN',
  'VITE_FB_PROJECT_ID',
  'VITE_FB_APP_ID',
  'VITE_RECAPTCHA_ENTERPRISE_SITE_KEY',
];
const missing = required.filter((name) => !process.env[name] || /^(your-|changeme)/i.test(process.env[name]));
if (missing.length) {
  console.error(`Production build blocked: missing ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.VITE_USE_EMULATORS === 'true') {
  console.error('Production build blocked: VITE_USE_EMULATORS must not be true.');
  process.exit(1);
}
console.log('Production environment preflight passed (values not printed).');
