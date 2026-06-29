// Student app. All curriculum, progress, lock, and submission data crosses authenticated
// App-Check-protected callables; the browser view is never the authorization boundary.
import '../ui/theme.css';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase.js';
import { clearSignInState, requestSignInLink, completeSignInIfPresent, onAuthStateChanged } from '../lib/auth.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (m) => { const t = $('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); };

let currentUid = null, member = null, progressMap = {}, lockMap = {}, curriculumData = null, latestView = null;
const getStudentDashboard = httpsCallable(functions, 'getStudentDashboard', { timeout: 30_000 });
const submitStageFn = httpsCallable(functions, 'submitStage', { timeout: 30_000 });

// Pull the member's progress + admin stage-lock overrides together.
async function refetch() {
  const result = (await getStudentDashboard()).data;
  member = result.member;
  curriculumData = result.curriculum;
  progressMap = Object.fromEntries((result.progress || []).map((item) => [item.stageKey, item]));
  lockMap = result.locks || {};
}

// ---------- view model (replaces the demo's GET /app/path) ----------
async function buildView() {
  const pathKey = member.path || 'fasttrack';
  const cur = curriculumData;
  const path = cur[pathKey] || cur.fasttrack;
  const defs = path.stages || [];
  const completedKeys = defs.filter((s) => progressMap[s.key]?.status === 'complete').map((s) => s.key);
  const nextOpen = defs.find((s) => !completedKeys.includes(s.key))?.key ?? null;
  // Admin lock/unlock overrides take precedence over the natural sequential gate.
  const stateOf = (k) => {
    if (completedKeys.includes(k)) return 'complete';
    if (lockMap[k] === 'locked') return 'locked';
    if (lockMap[k] === 'unlocked') return 'active';
    return k === nextOpen ? 'active' : 'locked';
  };
  const total = defs.length, completed = completedKeys.length;
  const progressPct = total ? Math.round((100 * completed) / total) : 0;

  let stages, stageUnits;
  if (pathKey === 'fasttrack') {
    stageUnits = defs.map((d) => ({
      stageKey: d.key, title: `${d.label} · ${d.title}`, description: d.deliverable,
      state: stateOf(d.key), weekKey: `wk${d.week}`, order: Number(d.key.slice(1)),
      requirements: [d.deliverable], checkedTasks: loadTicks(d.key), deliverableUrl: progressMap[d.key]?.deliverableUrl,
    }));
    stages = [1, 2, 3, 4].map((w) => {
      const days = stageUnits.filter((u) => u.weekKey === `wk${w}`);
      const wDone = days.filter((d) => d.state === 'complete').length;
      const state = wDone === days.length ? 'complete' : (days.some((d) => d.state === 'active') ? 'active' : 'locked');
      return { stageKey: `wk${w}`, title: `Week ${w}`, order: w, state, completed: wDone, total: days.length,
        days: days.map((d) => ({ stageKey: d.stageKey, title: d.title, state: d.state, weekKey: d.weekKey })) };
    });
  } else {
    stageUnits = defs.map((p, i) => ({
      stageKey: p.key, title: `${p.label} · ${p.title}`, description: p.description, state: stateOf(p.key),
      order: i + 1, items: p.milestones || [], requirements: p.milestones || [p.description],
      checkedTasks: loadTicks(p.key), deliverableUrl: progressMap[p.key]?.deliverableUrl,
    }));
    stages = stageUnits.map((u) => ({ stageKey: u.stageKey, title: u.title, order: u.order, state: u.state, items: u.items, description: u.description }));
  }
  return { pathKey, meta: { title: path.title, duration: path.duration }, progressPct, completed, total,
    stages, stageUnits, activeStage: stageUnits.find((u) => u.state === 'active') || null };
}

// requirement ticks live client-side (localStorage) — no Firestore write, no Rules change.
const loadTicks = (k) => { try { return JSON.parse(localStorage.getItem('cfg.ticks.' + k) || '[]'); } catch { return []; } };
const saveTicks = (k, idx) => { try { localStorage.setItem('cfg.ticks.' + k, JSON.stringify(idx)); } catch { /* ignore */ } };

// ---------- auth ----------
async function login() {
  $('loginMsg').textContent = '';
  const email = $('email').value.trim();
  if (!email) { $('loginMsg').textContent = 'Enter your email.'; return; }
  $('loginBtn').disabled = true; $('loginMsg').textContent = 'Sending…';
  try { await requestSignInLink(email); $('loginMsg').textContent = `Link sent to ${email}. Open it on this device to finish signing in.`; }
  catch (e) { $('loginMsg').textContent = 'Error: ' + (e.code || e.message); $('loginBtn').disabled = false; }
}
function logout() { closeMenu(); clearSignInState(); signOut(auth).finally(() => { $('app').classList.add('hidden'); $('login').classList.remove('hidden'); }); }

async function boot(uid) {
  currentUid = uid;
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  try {
    await refetch();
    if (!member) return showInactive('No active access yet', 'An admin needs to grant you a seat. Once granted, sign in again with the same email.');
    const first = (member.name || member.email || '').split(' ')[0];
    $('avatar').textContent = (first || '?').charAt(0).toUpperCase();
    $('userName').innerHTML = `${esc(first)}<small>Student · ${esc(member.accessBasis || '')}</small>`;
    $('welcome').textContent = `Welcome back, ${first} 👋`;
    const ends = member.accessEnds ? new Date(member.accessEnds).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
    $('accMeta').innerHTML = `Access until <b>${esc(ends)}</b><br>${esc(member.accessBasis || '')} access`;
    if (member.accessEnds && member.accessEnds <= Date.now()) {
      $('accStatus').className = 'status expired'; $('accStatus').innerHTML = '<span class="led"></span> EXPIRED';
      return showInactive('Your access has ended', 'Your learning window expired or access was revoked. Contact Code For Good to renew.');
    }
    renderPath(await buildView());
  } catch (e) {
    showInactive('Access unavailable', 'Your session is expired, revoked, or the system is temporarily locked. Sign in again or contact Code For Good.');
    toast('Error: ' + (e.code || e.message));
  }
}

function showInactive(title, body) {
  $('stats').innerHTML = ''; $('pathway').innerHTML = ''; $('ladder').innerHTML = ''; $('stageDetailWrap').innerHTML = '';
  $('continueWrap').innerHTML = `<div class="card"><h3>${esc(title)}</h3><p style="color:var(--cfg-muted);margin-top:8px">${esc(body)}</p></div>`;
}

async function loadPath() {
  await refetch();
  renderPath(await buildView());
}

// ---------- render (ported from demo) ----------
const chev = () => '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>';
const icoArrow = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const icoLock = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const icoDoc = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';

const stageUnitsOf = (v) => v.stageUnits || v.stages || [];
const findStage = (v, key) => stageUnitsOf(v).find((s) => s.stageKey === key);
const stageKeyFromHash = () => { const h = decodeURIComponent(location.hash || ''); return h.startsWith('#stage=') ? h.slice(7) : ''; };
const cardClass = (st) => (st === 'complete' ? 'done' : st === 'active' ? 'current' : 'locked');
const shortTitle = (t) => String(t).replace(/^Pillar \d+ · /, '').replace(/^Day \d+ · /, '');
const requirementsFor = (s) => (s.requirements?.length ? s.requirements : (s.items?.length ? s.items : [s.description || s.title]));

function renderPath(v) {
  latestView = v;
  const isFast = v.pathKey === 'fasttrack';
  const unitLabel = isFast ? 'days' : 'stages';
  const selected = stageKeyFromHash();
  const openKeys = new Set([...document.querySelectorAll('#pathTree .acc.lvl2[data-open="true"]')].map((a) => a.dataset.stageKey));

  $('sbPct').textContent = v.progressPct + '%';
  $('sbBar').style.width = v.progressPct + '%';
  $('sbSub').textContent = `${v.completed} of ${v.total} ${unitLabel} complete`;
  $('progressRing').style.setProperty('--v', v.progressPct); $('ringPct').textContent = v.progressPct + '%';
  $('pathSub').textContent = `${v.meta.title} · ${v.meta.duration || ''}`;
  $('pathNavLabel').textContent = isFast ? 'Fast Track' : '8-Pillar Roadmap';
  $('pathwayTitle').textContent = isFast ? 'Your 4-week fast track' : 'Your 8-pillar pathway';
  $('pathway').className = isFast ? 'journey fasttrack' : 'journey';

  // sidebar accordion tree
  $('pathTree').innerHTML = v.stages.map((s) => {
    const items = s.days
      ? s.days.map((d) => `<li class="${[d.state === 'complete' ? 'done' : '', d.state === 'locked' ? 'locked' : '', d.stageKey === selected ? 'selected' : ''].filter(Boolean).join(' ')}" data-stage="${esc(d.stageKey)}"><span class="dot"></span><span>${esc(d.title)}</span></li>`).join('')
      : (s.items || []).map((m) => `<li class="${[s.state === 'complete' ? 'done' : '', s.state === 'locked' ? 'locked' : ''].filter(Boolean).join(' ')}" data-nav="${esc(s.stageKey)}"><span class="dot"></span><span>${esc(m)}</span></li>`).join('');
    const frac = s.state === 'complete' ? '✓' : s.state === 'active' ? '●' : '🔒';
    const isOpen = openKeys.has(s.stageKey) || s.state === 'active' || s.stageKey === selected || (s.days || []).some((d) => d.stageKey === selected);
    return `<div class="acc lvl2 ${s.state === 'complete' ? 'done' : s.state}" data-stage-key="${esc(s.stageKey)}" data-open="${isOpen ? 'true' : 'false'}">
      <button class="acc-head" type="button"><span>${esc(s.title)}</span><span class="frac">${frac}</span>${chev()}</button>
      <div class="acc-body"><div class="acc-inner"><ul class="milestones">${items}</ul></div></div></div>`;
  }).join('');
  wireAccordions(); wireStageLinks();

  const deliverables = stageUnitsOf(v).filter((s) => s.deliverableUrl).length;
  const trackLabel = isFast ? 'Fast Track' : 'Full Roadmap';
  $('stats').innerHTML = `
    <div class="chip"><div class="k">Readiness</div><div class="v">${v.progressPct}%</div><div class="s">path readiness</div></div>
    <div class="chip mint"><div class="k">${isFast ? 'Days' : 'Stages'}</div><div class="v">${v.completed}/${v.total}</div><div class="s">complete</div></div>
    <div class="chip gold"><div class="k">Deliverables</div><div class="v">${deliverables}</div><div class="s">submitted</div></div>
    <div class="chip coral"><div class="k">Track</div><div class="v" style="font-size:1.3rem;-webkit-text-fill-color:initial;background:none;color:var(--coral)">${esc(trackLabel)}</div><div class="s">your path</div></div>`;

  renderHero(v);
  $('pathway').innerHTML = isFast ? renderWeeks(v.stages) : renderStageCards(v.stages);
  wireStageLinks();
  renderStageDetail(v);
  renderLadder(v.progressPct);
}

function featuredStage(v) {
  const key = stageKeyFromHash();
  if (key) { const s = findStage(v, key); if (s && s.state !== 'locked') return s; }
  return v.activeStage || null;
}
function checkedReqStates(stage) {
  const reqs = requirementsFor(stage);
  if (stage.state === 'complete') return reqs.map(() => true);
  const detail = $('stageDetail');
  if (detail && stageKeyFromHash() === stage.stageKey) {
    const checks = [...detail.querySelectorAll('.reqCheck')];
    if (checks.length === reqs.length) return checks.map((c) => c.checked);
  }
  const saved = new Set(stage.checkedTasks || []);
  return reqs.map((_, i) => saved.has(i));
}
function heroChecklistHtml(stage) {
  if (stage.state === 'complete') return '<div class="chk on"><i>✓</i><span>This stage is complete — nice work.</span></div>';
  const reqs = requirementsFor(stage), checked = checkedReqStates(stage);
  const remaining = reqs.filter((_, i) => !checked[i]);
  if (!remaining.length) return '<div class="chk on"><i>✓</i><span>All tasks checked — submit your proof below.</span></div>';
  return remaining.slice(0, 3).map((r) => `<div class="chk"><i></i><span>${esc(r)}</span></div>`).join('');
}
const refreshHeroChecklist = (stage) => { const el = $('heroTasks'); if (el) el.innerHTML = heroChecklistHtml(stage); };

function renderHero(v) {
  const stage = featuredStage(v);
  if (!stage) {
    $('continueWrap').innerHTML = `<section class="hero"><div class="hero-grid"><div><span class="eyebrow">Path complete</span><h1>You've completed every stage</h1><p class="where">All ${v.total} stages done — keep building and shipping.</p></div></div></section>`;
    return;
  }
  const unitLabel = v.pathKey === 'fasttrack' ? 'days' : 'stages';
  const reviewing = stage.state === 'complete';
  const eyebrow = reviewing ? 'Reviewing' : 'Your next move';
  const btnLabel = `${reviewing ? 'Review' : 'Open'} ${shortTitle(stage.title)}`;
  $('continueWrap').innerHTML = `<section class="hero"><div class="hero-grid">
      <div>
        <span class="eyebrow"><span class="pulse"></span> ${esc(eyebrow)}</span>
        <h1>${esc(shortTitle(stage.title))}</h1>
        <p class="where">${esc(stage.description || 'Complete this stage to unlock the next.')}</p>
        <div class="hbar"><span style="width:${v.progressPct}%"></span></div>
        <div class="hpct"><span>${v.progressPct}% complete</span><span>${v.completed}/${v.total} ${unitLabel}</span></div>
        <div class="cta"><button class="btn btn-glow" id="openActiveStage" type="button">${esc(btnLabel)} ${icoArrow()}</button></div>
      </div>
      <div class="hero-side"><h4>What to complete</h4><div id="heroTasks">${heroChecklistHtml(stage)}</div></div>
    </div></section>`;
  $('openActiveStage').onclick = () => openStage(stage.stageKey);
}

function renderWeeks(weeks) {
  return weeks.map((w) => {
    const cls = cardClass(w.state);
    const label = w.state === 'complete' ? 'Complete' : w.state === 'active' ? 'In progress' : 'Locked';
    const badge = w.state === 'complete' ? '✓' : String(w.order);
    const days = w.days.map((d) => {
      const sel = d.stageKey === stageKeyFromHash() ? 'selected' : '';
      const st = d.state === 'complete' ? 'Done' : d.state === 'active' ? 'Open' : 'Locked';
      return `<button class="day-card ${d.state} ${sel}" type="button" data-stage="${esc(d.stageKey)}" ${d.state === 'locked' ? 'aria-disabled="true"' : ''}><span>${esc(shortTitle(d.title))}</span><span class="state">${st}</span></button>`;
    }).join('');
    return `<div class="node ${cls}"><div class="badge">${badge}</div><div class="state">${label} · ${w.completed}/${w.total} days</div><h4>${esc(w.title)}</h4><div class="day-list">${days}</div></div>`;
  }).join('');
}

function renderStageCards(stages) {
  return stages.map((s) => {
    const cls = cardClass(s.state);
    const label = s.state === 'complete' ? 'Complete' : s.state === 'active' ? 'In progress' : 'Locked';
    const lock = s.state === 'locked' ? `<i class="lk">${icoLock()}</i>` : '';
    const badge = s.state === 'complete' ? '✓' : String(s.order);
    const sel = s.stageKey === stageKeyFromHash() ? 'selected' : '';
    const milestones = (s.items || []).map((m) => `<div class="day-card${s.state === 'locked' ? ' locked' : ''}"><span>${esc(m)}</span></div>`).join('');
    return `<div class="node ${cls} ${sel}" data-stage="${esc(s.stageKey)}" role="button" tabindex="0">${lock}<div class="badge">${badge}</div><div class="state">${label} · ${(s.items || []).length} milestones</div><h4>${esc(shortTitle(s.title))}</h4><div class="day-list">${milestones}</div></div>`;
  }).join('');
}

function renderStageDetail(v) {
  const key = stageKeyFromHash();
  if (!key) { $('stageDetailWrap').innerHTML = ''; return; }
  const stage = findStage(v, key);
  if (!stage) { $('stageDetailWrap').innerHTML = ''; return; }
  if (stage.state === 'locked') { history.replaceState(null, '', location.pathname); $('stageDetailWrap').innerHTML = ''; return; }
  const reqs = requirementsFor(stage);
  const complete = stage.state === 'complete';
  const badge = complete ? 'Complete' : 'Active';
  const saved = new Set(stage.checkedTasks || []);
  const checks = reqs.map((r, i) => `<label class="requirement"><input type="checkbox" class="reqCheck" ${complete ? 'checked disabled' : (saved.has(i) ? 'checked' : '')} /><span>${esc(r)}</span></label>`).join('');
  const proof = complete
    ? `<div class="stage-complete"><span>Deliverable recorded</span><a href="${esc(stage.deliverableUrl || '#')}" target="_blank" rel="noopener">Open proof</a></div>`
    : `<form class="stage-form proof-bar" id="stageForm">
        <div class="proof-icon">${icoDoc()}</div>
        <div class="proof-copy"><strong>Submit proof of work</strong><span>Check every requirement, then paste a GitHub, Loom, live demo, or any valid project URL.</span></div>
        <div class="proof-input"><input id="stageUrl" type="text" inputmode="url" placeholder="https://example.com/proof" required disabled /></div>
        <button class="btn btn-purple" id="stageSubmit" type="submit" disabled>Submit ${icoArrow()}</button>
      </form>`;
  $('stageDetailWrap').innerHTML = `<div class="card stage-detail" id="stageDetail">
    <div class="stage-head"><div><span class="stage-badge">${badge}</span><h2>${esc(shortTitle(stage.title))}</h2><p>${esc(stage.description || '')}</p></div></div>
    <div class="requirements">${checks}</div>${proof}</div>`;
  wireStageForm(stage);
}

function wireStageForm(stage) {
  const form = $('stageForm'); if (!form) return;
  const checks = [...document.querySelectorAll('#stageDetail .reqCheck')];
  const url = $('stageUrl'), btn = $('stageSubmit');
  const sync = () => { const done = checks.length ? checks.every((c) => c.checked) : true; url.disabled = !done; btn.disabled = !done || !url.value.trim(); };
  const persist = () => { const idx = checks.map((c, i) => (c.checked ? i : -1)).filter((i) => i >= 0); stage.checkedTasks = idx; saveTicks(stage.stageKey, idx); };
  checks.forEach((c) => c.addEventListener('change', () => { persist(); sync(); refreshHeroChecklist(stage); }));
  url.addEventListener('input', sync);
  form.onsubmit = (e) => { e.preventDefault(); submitStage(stage.stageKey, url.value); };
  sync();
}

function openStage(stageKey) {
  const stage = latestView ? findStage(latestView, stageKey) : null;
  if (stage?.state === 'locked') { toast('That stage is locked'); return; }
  history.pushState(null, '', '#stage=' + encodeURIComponent(stageKey));
  document.querySelectorAll('[data-stage]').forEach((el) => el.classList.toggle('selected', el.dataset.stage === stageKey));
  renderStageDetail(latestView); renderHero(latestView);
  requestAnimationFrame(() => $('stageDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
function wireStageLinks() {
  document.querySelectorAll('[data-stage]').forEach((el) => {
    el.onclick = () => openStage(el.dataset.stage);
    if (el.getAttribute('role') === 'button') el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStage(el.dataset.stage); } };
  });
  document.querySelectorAll('#pathTree [data-nav]').forEach((el) => { el.onclick = () => openStage(el.dataset.nav); });
}
function wireAccordions() {
  document.querySelectorAll('#pathTree .acc.lvl2 > .acc-head').forEach((h) => {
    h.onclick = () => { const a = h.parentElement; a.dataset.open = a.dataset.open === 'true' ? 'false' : 'true'; };
  });
}

function renderLadder(pct) {
  const rungs = [['Rung 1', '$0–50', 'First micro-gig'], ['Rung 2', '$50–200', 'Repeat freelance briefs'], ['Rung 3', '$200–500', 'Micro-internship stipend'], ['Rung 4', '$500–1.5k', 'Contract project work'], ['Rung 5', 'Hired', 'Entry STEM role']];
  const reached = Math.min(rungs.length - 1, Math.round((pct / 100) * rungs.length));
  $('ladder').innerHTML = rungs.map((r, i) => {
    const live = i === reached ? 'live' : '', tier = i === reached ? 'You are here' : r[0], off = i < 4 ? `r${i + 1}` : '';
    return `<div class="rung ${off} ${live}"><div class="tier">${esc(tier)}</div><div class="amt">${esc(r[1])}</div><div class="d">${esc(r[2])}</div></div>`;
  }).join('');
}

async function submitStage(stageKey, url) {
  const deliverableUrl = normalizeUrl(url);
  if (!deliverableUrl) { toast('Enter a valid URL'); return; }
  try {
    await submitStageFn({ stageKey, deliverableUrl });
    await refetch();
    const v = await buildView();
    if (v.activeStage) history.replaceState(null, '', '#stage=' + encodeURIComponent(v.activeStage.stageKey));
    else history.replaceState(null, '', location.pathname);
    renderPath(v);
    toast(v.activeStage ? 'Stage complete — next unlocked' : 'Path complete 🎉');
  } catch (e) { toast('Error: ' + (e.code || e.message)); }
}
function normalizeUrl(url) {
  const raw = String(url || '').trim(); if (!raw) return '';
  try {
    const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    const ok = u.hostname === 'localhost' || u.hostname.includes('.');
    return ['http:', 'https:'].includes(u.protocol) && ok ? u.toString() : '';
  } catch { return ''; }
}

// ---------- menu + wiring ----------
function openMenu() { $('sidebar').classList.add('open'); $('sidebarBackdrop').classList.add('open'); $('menuBtn').setAttribute('aria-expanded', 'true'); }
function closeMenu() { $('sidebar').classList.remove('open'); $('sidebarBackdrop').classList.remove('open'); $('menuBtn').setAttribute('aria-expanded', 'false'); }

$('loginBtn').onclick = login;
$('email').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('logoutBtn').onclick = logout;
$('logoutNav').onclick = logout;
$('menuBtn').onclick = () => ($('sidebar').classList.contains('open') ? closeMenu() : openMenu());
$('sidebarBackdrop').onclick = closeMenu;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
window.addEventListener('hashchange', () => { if (latestView) renderPath(latestView); });
window.addEventListener('popstate', () => { if (latestView) renderPath(latestView); });

// ---------- boot ----------
(async () => {
  const linkUser = await completeSignInIfPresent();
  if (linkUser) return boot(linkUser.uid);
  onAuthStateChanged(auth, (user) => {
    if (user && !user.isAnonymous) boot(user.uid);
    else { $('app').classList.add('hidden'); $('login').classList.remove('hidden'); }
  });
})();
