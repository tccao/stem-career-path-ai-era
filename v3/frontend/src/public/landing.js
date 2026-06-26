// V3 funnel for the ported landing page (index.html). Replaces the legacy mock workflow:
// the apply modal writes a real application to Firestore (anonymous auth + age/consent gate),
// and "Login" goes to the student app (/app.html) where passwordless email-link sign-in lives.
// Page behaviour (nav/dropdown/FAQ) stays in the landing's own inline script.
import { apply } from './apply.js';

const $ = (id) => document.getElementById(id);
const applyModal = $('applyModal');
const form = $('applyForm');
const body = document.body;

function openModal(m) {
  closeModals();
  m.setAttribute('data-open', 'true');
  body.classList.add('modal-open');
  const f = m.querySelector('input, select, textarea');
  if (f) setTimeout(() => f.focus(), 60);
}
function closeModals() {
  applyModal?.setAttribute('data-open', 'false');
  body.classList.remove('modal-open');
}

// Sign Up / Request access → application modal.
document.querySelectorAll('.js-signup').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); openModal(applyModal); }));
// Login → the student app (email-link sign-in lives there).
document.querySelectorAll('.js-login, #loginBtn').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); location.href = '/app.html'; }));
// Close handlers.
document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModals));
applyModal?.addEventListener('click', (e) => { if (e.target === applyModal) closeModals(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

// Guardian-consent field appears only for 13–17.
const ageSel = $('af-age');
ageSel?.addEventListener('change', () => { const c = $('consentField'); if (c) c.style.display = ageSel.value === '13-17' ? 'block' : 'none'; });

function showMsg(text) {
  let m = $('applyMsg');
  if (!m) { m = document.createElement('p'); m.id = 'applyMsg'; m.className = 'modal-foot'; m.style.color = '#c94454'; form.appendChild(m); }
  m.textContent = text;
}
function showSubmitted(first) {
  form.style.display = 'none';
  const b = $('bookingLaunched');
  const h = b.querySelector('h3'); if (h) h.textContent = 'Application submitted!';
  const p = b.querySelector('p'); if (p) p.innerHTML = `Thanks, ${first}. We'll review your application and email you a one-time sign-in link once access is granted.`;
  const a = $('toDashboardBtn'); if (a) { a.setAttribute('href', '/app.html'); a.textContent = 'Go to sign in'; }
  b.style.display = 'block';
  const t = $('applyTitle'); if (t) t.textContent = `Thanks, ${first}!`;
}

// Apply submit → real V3 application (Rules enforce the age/consent gate server-side too).
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('af-name').value.trim();
  const email = $('af-email').value.trim();
  const ageBracket = $('af-age').value;
  const consent = $('af-consent')?.checked || false;
  if (!name || !email || !ageBracket) { form.reportValidity?.(); return; }
  if (ageBracket === 'under13') { showMsg('Sorry — the program is not open to under-13s (COPPA).'); return; }
  if (ageBracket === '13-17' && !consent) { showMsg('A parent or guardian must consent for applicants aged 13–17.'); return; }
  const btn = form.querySelector('button[type="submit"]'); if (btn) btn.disabled = true;
  try {
    await apply({ name, email, ageBracket, guardianConsent: consent, accessChoice: 'beneficiary' });
    showSubmitted(name.split(' ')[0]);
  } catch (err) { showMsg('Could not submit: ' + (err.code || err.message)); if (btn) btn.disabled = false; }
});
