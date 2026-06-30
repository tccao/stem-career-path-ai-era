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
import QRCode from 'qrcode';
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

function requestTotpEnrollmentCode(uri, secretKey) {
  return new Promise((resolve, reject) => {
    const previousFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'mfa-overlay';
    overlay.innerHTML = `
      <div class="mfa-dialog" role="dialog" aria-modal="true" aria-labelledby="mfaTitle" aria-describedby="mfaHelp">
        <h1 id="mfaTitle">Set up your authenticator</h1>
        <p id="mfaHelp">Scan this QR code with Microsoft Authenticator, Google Authenticator, or another TOTP app.</p>
        <canvas class="mfa-qr" role="img" aria-label="QR code for adding this Code For Good account to an authenticator app"></canvas>
        <details class="mfa-manual">
          <summary>Can't scan it? Enter a setup key</summary>
          <p>Choose manual entry in your authenticator app, then use this key:</p>
          <div class="mfa-secret-row">
            <code class="mfa-secret"></code>
            <button class="linkbtn mfa-copy" type="button">Copy</button>
          </div>
          <div class="hint mfa-copy-status" role="status" aria-live="polite"></div>
        </details>
        <form class="mfa-form">
          <label for="mfaCode">6-digit code from your app</label>
          <input id="mfaCode" class="cfg-input" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required />
          <div class="actions">
            <button class="btn btn-purple" type="submit">Verify and finish</button>
            <button class="btn sec mfa-cancel" type="button">Cancel</button>
          </div>
          <div class="cfg-msg mfa-error" role="alert"></div>
        </form>
      </div>`;

    const secret = overlay.querySelector('.mfa-secret');
    const input = overlay.querySelector('#mfaCode');
    const error = overlay.querySelector('.mfa-error');
    const copyStatus = overlay.querySelector('.mfa-copy-status');
    secret.textContent = secretKey;

    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
      if (code) resolve(code);
      else reject(new Error('MFA enrollment was cancelled.'));
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        finish();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...overlay.querySelectorAll('button, input, summary')]
        .filter((element) => element.offsetParent !== null && !element.disabled);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    overlay.querySelector('.mfa-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(secretKey);
        copyStatus.textContent = 'Setup key copied.';
      } catch {
        copyStatus.textContent = 'Copy was blocked. Select and copy the setup key manually.';
      }
    });
    overlay.querySelector('.mfa-cancel').addEventListener('click', () => finish());
    overlay.querySelector('.mfa-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const code = input.value.trim();
      if (!/^\d{6}$/.test(code)) {
        error.textContent = 'Enter the current 6-digit code from your authenticator app.';
        input.focus();
        return;
      }
      finish(code);
    });
    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(overlay);

    QRCode.toCanvas(overlay.querySelector('.mfa-qr'), uri, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#3a006b', light: '#ffffff' },
    }).catch(() => {
      overlay.querySelector('.mfa-qr').classList.add('hidden');
      overlay.querySelector('.mfa-manual').open = true;
      error.textContent = 'The QR code could not be rendered. Use the setup key instead.';
    });
    input.focus();
  });
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
  const code = await requestTotpEnrollmentCode(uri, secret.secretKey);
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
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
