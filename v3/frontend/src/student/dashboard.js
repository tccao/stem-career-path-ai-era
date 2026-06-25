// Student dashboard (Spark/Functions-free). Reads the member doc + progress directly
// (gated by Firestore Rules: role=student claim + accessEnds>now), renders the gated
// learning path from the cached static curriculum, and lets the student submit the next
// open stage. Sign-in is passwordless email-link.
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase.js';
import { completeSignInIfPresent, onAuthStateChanged, mountLogin } from '../lib/auth.js';
import { getStageView } from './path.js';
import { submit } from './submit.js';

const root = () => document.getElementById('app-root');

injectStyle();

async function render(uid) {
  const el = root();
  el.textContent = 'Loading…';
  const memberSnap = await getDoc(doc(db, 'members', uid));
  if (!memberSnap.exists()) {
    el.innerHTML = '';
    el.append(note('No active access yet. An admin needs to grant you a seat.'), signOutLink());
    return;
  }
  const m = memberSnap.data();
  const progressSnap = await getDocs(collection(db, 'members', uid, 'progress'));
  const progress = {};
  progressSnap.forEach((d) => { progress[d.id] = d.data(); });
  const completedKeys = Object.keys(progress).filter((k) => progress[k].status === 'complete');
  const view = await getStageView(m.path || 'fasttrack', completedKeys);
  const pct = view.total ? Math.round((100 * view.done) / view.total) : 0;

  el.innerHTML = '';
  const wrap = div('cfg-wrap');

  // Header
  const head = div('cfg-head');
  head.append(
    h(1, `Welcome, ${m.name || m.email}`),
    p(`${view.title} · ${view.duration || ''}`),
    p(`Access until ${new Date(m.accessEnds).toLocaleDateString()} · ${pct}% complete (${view.done}/${view.total})`, 'cfg-muted'),
    signOutLink(),
  );
  wrap.append(head);

  // Progress bar
  const bar = div('cfg-bar'); const fill = div('cfg-bar-fill'); fill.style.width = `${pct}%`;
  bar.append(fill); wrap.append(bar);

  // Stage list
  const list = div('cfg-list');
  for (const s of view.stages) {
    const card = div(`cfg-stage cfg-${s.state}`);
    const top = div('cfg-stage-top');
    top.append(span(`${s.label} — ${s.title}`, 'cfg-stage-title'), badge(s.state));
    card.append(top);

    const detail = s.deliverable || s.description;
    if (detail) card.append(p(detail, 'cfg-detail'));
    if (Array.isArray(s.milestones)) {
      const ul = document.createElement('ul'); ul.className = 'cfg-ms';
      s.milestones.forEach((ms) => { const li = document.createElement('li'); li.textContent = ms; ul.append(li); });
      card.append(ul);
    }

    if (s.state === 'complete' && progress[s.key]?.deliverableUrl) {
      const a = document.createElement('a');
      a.href = progress[s.key].deliverableUrl; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'View submitted work'; a.className = 'cfg-link';
      card.append(a);
    }

    if (s.state === 'active') card.append(submitForm(uid, s.key));
    list.append(card);
  }
  wrap.append(list);
  el.append(wrap);
}

function submitForm(uid, stageKey) {
  const form = div('cfg-submit');
  const input = document.createElement('input');
  input.type = 'url'; input.placeholder = 'https://link-to-your-deliverable';
  input.className = 'cfg-input';
  const btn = document.createElement('button'); btn.textContent = 'Submit & unlock next'; btn.className = 'cfg-btn';
  const msg = p('', 'cfg-muted');
  btn.onclick = async () => {
    const url = input.value.trim();
    if (!/^https?:\/\//i.test(url)) { msg.textContent = 'Enter a valid https link to your work.'; return; }
    btn.disabled = true; msg.textContent = 'Submitting…';
    try { await submit(stageKey, url); await render(uid); }
    catch (e) { msg.textContent = `Error: ${e.code || e.message}`; btn.disabled = false; }
  };
  form.append(input, btn, msg);
  return form;
}

// --- auth entry ---
(async () => {
  const linkUser = await completeSignInIfPresent();
  if (linkUser) return render(linkUser.uid);
  onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) render(user.uid);
    else mountLogin(root(), 'Student sign-in');
  });
})();

// --- tiny DOM helpers ---
function div(cls) { const d = document.createElement('div'); if (cls) d.className = cls; return d; }
function span(t, cls) { const s = document.createElement('span'); s.textContent = t; if (cls) s.className = cls; return s; }
function p(t, cls) { const e = document.createElement('p'); e.textContent = t; if (cls) e.className = cls; return e; }
function h(n, t) { const e = document.createElement(`h${n}`); e.textContent = t; return e; }
function note(t) { return p(t, 'cfg-detail'); }
function badge(state) {
  const labels = { complete: '✓ Complete', active: 'In progress', locked: 'Locked' };
  return span(labels[state] || state, `cfg-badge cfg-badge-${state}`);
}
function signOutLink() {
  const a = document.createElement('a');
  a.href = '#'; a.textContent = 'Sign out'; a.className = 'cfg-link';
  a.onclick = (e) => { e.preventDefault(); signOut(auth).then(() => mountLogin(root(), 'Student sign-in')); };
  return a;
}

function injectStyle() {
  if (document.getElementById('cfg-style')) return;
  const css = `
  .cfg-wrap{max-width:760px;margin:2rem auto;padding:0 1rem;font-family:system-ui,sans-serif;color:#1c1228}
  .cfg-head h1{margin:.2rem 0;color:#4b0082}
  .cfg-muted{color:#6b6477;font-size:.9rem}
  .cfg-bar{height:.55rem;background:#ece6f5;border-radius:999px;overflow:hidden;margin:.8rem 0 1.4rem}
  .cfg-bar-fill{height:100%;background:#6a0dad;transition:width .3s}
  .cfg-list{display:grid;gap:.8rem}
  .cfg-stage{border:1px solid #e4ddef;border-radius:.6rem;padding:.9rem 1rem;background:#fff}
  .cfg-stage.cfg-locked{opacity:.55}
  .cfg-stage.cfg-active{border-color:#6a0dad;box-shadow:0 0 0 1px #6a0dad}
  .cfg-stage-top{display:flex;justify-content:space-between;align-items:center;gap:.6rem}
  .cfg-stage-title{font-weight:600}
  .cfg-detail{margin:.5rem 0;color:#332b3f;font-size:.92rem}
  .cfg-ms{margin:.4rem 0 0;padding-left:1.1rem;color:#332b3f;font-size:.88rem}
  .cfg-ms li{margin:.15rem 0}
  .cfg-badge{font-size:.72rem;padding:.18rem .5rem;border-radius:999px;white-space:nowrap}
  .cfg-badge-complete{background:#e3f6e8;color:#1d7a3a}
  .cfg-badge-active{background:#efe6fb;color:#4b0082}
  .cfg-badge-locked{background:#eee;color:#777}
  .cfg-submit{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.7rem}
  .cfg-input{flex:1;min-width:220px;padding:.5rem;font-size:.95rem;border:1px solid #cfc6df;border-radius:.4rem}
  .cfg-btn{padding:.5rem .9rem;font-size:.95rem;background:#6a0dad;color:#fff;border:0;border-radius:.4rem;cursor:pointer}
  .cfg-btn:disabled{opacity:.6;cursor:default}
  .cfg-link{display:inline-block;margin-top:.5rem;color:#6a0dad;font-size:.9rem}
  `;
  const style = document.createElement('style'); style.id = 'cfg-style'; style.textContent = css;
  document.head.append(style);
}
