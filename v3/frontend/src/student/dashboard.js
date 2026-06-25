// Student dashboard — V2 design (app shell + cards), driven by REAL Firestore data
// (member doc, progress, curriculum). Spark/Functions-free: reads gated by Rules, submit
// writes the student's own progress doc. No fabricated metrics.
import { doc, getDoc, collection, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebase.js';
import { completeSignInIfPresent, onAuthStateChanged, mountLogin } from '../lib/auth.js';
import { getStageView } from './path.js';
import { mountShell } from '../ui/shell.js';
import { svg } from '../ui/icons.js';

const root = () => document.getElementById('app-root');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const DAY = 86400_000;

function buildTree(pathKey, view) {
  const groups = [];
  if (pathKey === 'fasttrack') {
    for (let w = 1; w <= 4; w++) {
      const days = view.stages.filter((s) => s.week === w);
      const done = days.filter((s) => s.state === 'complete').length;
      groups.push({
        name: `Week ${w}`, done, total: days.length,
        items: days.map((s) => ({ text: `${s.label}: ${s.title}`, state: s.state === 'complete' ? 'done' : (s.state === 'active' ? 'active' : '') })),
      });
    }
  } else {
    view.stages.forEach((s) => groups.push({
      name: `${s.label}: ${s.title}`, done: s.state === 'complete' ? 1 : 0, total: 1,
      items: (s.milestones || []).map((m) => ({ text: m, state: s.state === 'complete' ? 'done' : (s.state === 'active' ? 'active' : '') })),
    }));
  }
  return { label: pathKey === 'fasttrack' ? 'Fast Track' : '8 Pillars', pct: view.total ? Math.round(100 * view.done / view.total) : 0, done: view.done, total: view.total, groups };
}

function statCard(name, num, lbl) {
  return `<div class="stat"><div class="ico">${svg(name)}</div><div class="num">${num}</div><div class="lbl">${esc(lbl)}</div></div>`;
}

function pathwayCards(pathKey, view) {
  let cards;
  if (pathKey === 'fasttrack') {
    cards = [1, 2, 3, 4].map((w) => {
      const days = view.stages.filter((s) => s.week === w);
      const done = days.filter((s) => s.state === 'complete').length;
      const current = days.some((s) => s.state === 'active');
      const state = done === days.length ? 'done' : (current ? 'current' : 'locked');
      const label = state === 'done' ? '✓ Complete' : (current ? `In progress · ${done}/${days.length}` : 'Locked');
      return { n: w, title: `Week ${w}`, state, label };
    });
  } else {
    cards = view.stages.map((s, i) => ({
      n: i + 1, title: s.title,
      state: s.state === 'complete' ? 'done' : (s.state === 'active' ? 'current' : 'locked'),
      label: s.state === 'complete' ? '✓ Complete' : (s.state === 'active' ? 'In progress' : 'Locked'),
    }));
  }
  return cards.map((c) => `<div class="pcard ${c.state}"><div class="pnum">${c.n}</div><h4>${esc(c.title)}</h4><span class="state">${esc(c.label)}</span></div>`).join('');
}

async function render(uid) {
  root().innerHTML = '<p style="margin:3rem;text-align:center;color:#5b5170">Loading…</p>';
  const memberSnap = await getDoc(doc(db, 'members', uid));
  if (!memberSnap.exists()) {
    mountLogin(root(), 'No active access — sign in with a granted account');
    return;
  }
  const m = memberSnap.data();
  const progressSnap = await getDocs(collection(db, 'members', uid, 'progress'));
  const completedKeys = [];
  progressSnap.forEach((d) => { if (d.data().status === 'complete') completedKeys.push(d.id); });
  const pathKey = m.path || 'fasttrack';
  const view = await getStageView(pathKey, completedKeys);
  const tree = buildTree(pathKey, view);
  const active = view.stages.find((s) => s.state === 'active');
  const daysLeft = Math.max(0, Math.ceil((m.accessEnds - Date.now()) / DAY));

  const screen = mountShell(root(), {
    user: { name: m.name, email: m.email, accessBasis: m.accessBasis },
    tree, active: 'dashboard',
    onLogout: () => signOut(auth).then(() => mountLogin(root(), 'Student sign-in')),
  });

  const continueCard = active
    ? `<div class="card continue">
        <span class="eyebrow">Continue learning</span>
        <h3>${esc(active.label)} · ${esc(active.title)}</h3>
        <div class="where">${esc(active.deliverable || active.description || '')}</div>
        <div class="progress"><span style="width:${tree.pct}%"></span></div>
        <div class="pct"><span>Path progress</span><span>${tree.pct}%</span></div>
        <div class="cfg-submit">
          <input class="cfg-input" id="delUrl" type="url" placeholder="https://link-to-your-deliverable">
          <button class="btn btn-white" id="submitBtn">Submit &amp; unlock next ${svg('arrow', '', 17)}</button>
          <div class="cfg-msg" id="submitMsg"></div>
        </div>
      </div>`
    : `<div class="card continue"><span class="eyebrow">All done</span>
        <h3>Path complete 🎉</h3><div class="where">You've completed every stage of ${esc(view.title)}.</div></div>`;

  screen.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Welcome back, ${esc((m.name || m.email || '').split(' ')[0])} 👋</h1>
        <p>You're on <b>${esc(view.title)}</b>. Here's where to pick things up.</p>
      </div>
      <div class="access-chip">
        <span class="status"><span class="led"></span> Active</span>
        <span class="sep"></span>
        <span class="meta"><b>${esc(m.accessBasis || 'member')}</b> seat<br>Access until <b>${new Date(m.accessEnds).toLocaleDateString()}</b></span>
      </div>
    </div>
    <div class="stats">
      ${statCard('chart', tree.pct + '%', 'Overall progress')}
      ${statCard('check', view.done, 'Deliverables submitted')}
      ${statCard('bolt', view.total - view.done, 'Stages remaining')}
      ${statCard('calendar', daysLeft, 'Days of access left')}
    </div>
    <div class="row-2">
      ${continueCard}
      <div class="card">
        <div class="card-head"><h3>Your path</h3></div>
        <p style="color:#5b5170;font-size:.9rem;margin:0 0 6px">${esc(view.title)}</p>
        <p style="color:#5b5170;font-size:.86rem;margin:0">${esc(view.duration || '')}</p>
        <p style="margin:14px 0 0;font-size:.9rem"><b>${view.done}</b> of <b>${view.total}</b> stages complete.</p>
      </div>
    </div>
    <div class="section-title"><h2>Your ${pathKey === 'fasttrack' ? '4-week' : '8-pillar'} pathway</h2></div>
    <div class="pillars">${pathwayCards(pathKey, view)}</div>`;

  const btn = screen.querySelector('#submitBtn');
  if (btn) btn.addEventListener('click', async () => {
    const url = screen.querySelector('#delUrl').value.trim();
    const msg = screen.querySelector('#submitMsg');
    if (!/^https?:\/\//i.test(url)) { msg.textContent = 'Enter a valid https link to your work.'; return; }
    btn.disabled = true; msg.textContent = 'Submitting…';
    try {
      await setDoc(doc(db, 'members', uid, 'progress', active.key), { status: 'complete', deliverableUrl: url, completedAt: serverTimestamp() });
      await render(uid);
    } catch (e) { msg.textContent = `Error: ${e.code || e.message}`; btn.disabled = false; }
  });
}

(async () => {
  const linkUser = await completeSignInIfPresent();
  if (linkUser) return render(linkUser.uid);
  onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) render(user.uid);
    else mountLogin(root(), 'Student sign-in');
  });
})();
