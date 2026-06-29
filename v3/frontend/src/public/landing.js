// Public V3 landing flow. Page interactions attach without Firebase so navigation and the
// application modal remain usable even when backend configuration is missing. Firebase is
// loaded only when public settings or an application submission actually need it.

const $ = (id) => document.getElementById(id);
const applyModal = $('applyModal');
const form = $('applyForm');
const body = document.body;
const ageSelect = $('af-age');
const consentField = $('consentField');
const consentInput = $('af-consent');
const applicationFields = $('applicationFields');
const submitted = $('applicationSubmitted');
const pageRegions = [$('siteHeader'), $('main'), document.querySelector('.site-footer')].filter(Boolean);
const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const defaults = {
  zeffyUrl: document.querySelector('a[href*="zeffy.com"]')?.href || 'https://www.zeffy.com/en-US/donation-form/donate-to-codeforgood',
  calComUrl: 'https://cal.com/tinhcao001',
};
let links = { ...defaults };
let modalOpener = null;

function setPageInert(state) {
  pageRegions.forEach((region) => {
    region.inert = state;
    if (state) region.setAttribute('aria-hidden', 'true');
    else region.removeAttribute('aria-hidden');
  });
}

function updateEligibility() {
  const isMinor = ageSelect?.value === '13-17';
  if (consentField) consentField.hidden = !isMinor;
  if (consentInput) consentInput.required = isMinor;
  const eligible = ageSelect?.value === '18plus' || (isMinor && consentInput?.checked);
  if (applicationFields) applicationFields.hidden = !eligible;
  if (eligible) $('af-name')?.focus();
}

function openModal(opener) {
  if (!applyModal) return;
  modalOpener = opener || document.activeElement;
  applyModal.hidden = false;
  applyModal.setAttribute('data-open', 'true');
  body.classList.add('modal-open');
  ageSelect?.focus();
  setPageInert(true);
}

function closeModal() {
  if (!applyModal || applyModal.hidden) return;
  applyModal.setAttribute('data-open', 'false');
  applyModal.hidden = true;
  body.classList.remove('modal-open');
  setPageInert(false);
  modalOpener?.focus?.();
  modalOpener = null;
}

function trapModalFocus(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key !== 'Tab' || applyModal?.hidden) return;
  const controls = [...applyModal.querySelectorAll(focusableSelector)].filter((el) => !el.closest('[hidden]'));
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

document.querySelectorAll('.js-signup').forEach((el) => el.addEventListener('click', (event) => {
  event.preventDefault();
  openModal(el);
}));
document.querySelectorAll('.js-login, #loginBtn').forEach((el) => el.addEventListener('click', (event) => {
  event.preventDefault();
  location.href = '/app.html';
}));
document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
applyModal?.addEventListener('click', (event) => { if (event.target === applyModal) closeModal(); });
applyModal?.addEventListener('keydown', trapModalFocus);
ageSelect?.addEventListener('change', updateEligibility);
consentInput?.addEventListener('change', updateEligibility);
updateEligibility();

async function loadPublicLinks() {
  try {
    const [{ doc, getDoc }, { db }] = await Promise.all([
      import('firebase/firestore'),
      import('../firebase.js'),
    ]);
    const snap = await getDoc(doc(db, 'settings', 'public'));
    if (snap.exists()) links = { ...links, ...snap.data() };
  } catch {
    // Static fallbacks keep the public funnel usable when settings cannot be loaded.
  }
  document.querySelectorAll('a[href*="zeffy.com"]').forEach((anchor) => { anchor.href = links.zeffyUrl; });
}
loadPublicLinks();

function showMessage(text) {
  let message = $('applyMsg');
  if (!message) {
    message = document.createElement('p');
    message.id = 'applyMsg';
    message.className = 'modal-foot';
    message.setAttribute('role', 'alert');
    message.setAttribute('aria-live', 'assertive');
    message.tabIndex = -1;
    form?.appendChild(message);
  }
  message.textContent = text;
  message.style.color = '#c94454';
  message.focus();
}

function makeExternalAction(href, label, className = 'btn btn-primary') {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.className = className;
  anchor.textContent = label;
  const context = document.createElement('span');
  context.className = 'visually-hidden';
  context.textContent = ' (opens in a new tab)';
  anchor.appendChild(context);
  return anchor;
}

function showSubmitted({ firstName, email, fullName, next }) {
  if (!form || !submitted) return;
  form.hidden = true;
  submitted.hidden = false;
  const heading = submitted.querySelector('h3');
  const copy = submitted.querySelector('p');
  const actions = submitted.querySelector('.modal-actions');
  actions.replaceChildren();

  if (next === 'donate') {
    heading.textContent = 'Application received';
    copy.textContent = `Thanks, ${firstName}. Continue to Zeffy to fund a seat. Access is granted only after the payment is verified.`;
    actions.appendChild(makeExternalAction(links.zeffyUrl, 'Continue to secure donation'));
  } else {
    heading.textContent = 'Application submitted';
    copy.textContent = `Thanks, ${firstName}. Book a 15-minute eligibility interview. We’ll email you after the application is reviewed.`;
    let href = links.calComUrl;
    try {
      const url = new URL(href);
      url.searchParams.set('email', email);
      url.searchParams.set('name', fullName);
      href = url.toString();
    } catch { /* keep the configured fallback */ }
    actions.appendChild(makeExternalAction(href, 'Book your 15-minute interview'));
  }

  const title = $('applyTitle');
  if (title) title.textContent = `Thanks, ${firstName}!`;
  submitted.focus();
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('af-name')?.value.trim() || '';
  const email = $('af-email')?.value.trim() || '';
  const ageBracket = ageSelect?.value || '';
  const stage = $('af-stage')?.value || '';
  const track = $('af-track')?.value || '';
  const accessChoice = $('af-choice')?.value || '';
  const reason = $('af-reason')?.value.trim() || '';
  const guardianConsent = consentInput?.checked || false;

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  if (!['13-17', '18plus'].includes(ageBracket)) {
    showMessage('Choose an age group to continue.');
    return;
  }
  if (ageBracket === '13-17' && !guardianConsent) {
    showMessage('A parent or guardian must consent before you can apply.');
    consentInput?.focus();
    return;
  }
  if (!name || !email || !stage || !track || !accessChoice || !reason) {
    form.reportValidity();
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  }
  try {
    const { apply } = await import('./apply.js');
    const result = await apply({ name, email, ageBracket, guardianConsent, accessChoice, stage, track, reason });
    showSubmitted({ firstName: name.split(' ')[0], email, fullName: name, next: result.next });
  } catch {
    showMessage('The application could not be submitted right now. Please try again or contact Code For Good.');
  } finally {
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }
});
