// Admin console — design ported from demo/public/admin.html, wired to the Spark/Functions-free
// backend. READS go straight to Firestore (allowed by Rules for the admin custom claim).
// Privileged MUTATIONS have no hosted endpoint on Spark, so the buttons render the exact
// admin-cli command to copy and run (the admin-cli holds AdminCreateUser / setCustomUserClaims).
import '../ui/theme.css';
import { collection, query, where, orderBy, limit, getDocs, getCountFromServer } from 'firebase/firestore';
import { signOut, getIdTokenResult } from 'firebase/auth';
import { db, auth } from '../firebase.js';
import { requestSignInLink, completeSignInIfPresent, onAuthStateChanged } from '../lib/auth.js';
import { loadCurriculum } from '../lib/cache.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (m) => { const t = $('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); };
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const stateTxt = (s) => (s === 'complete' ? 'Complete' : s === 'active' ? 'In progress' : 'Locked');

const STATUSES = [['SUBMITTED', 'Submitted'], ['GRANTED', 'Granted'], ['REJECTED', 'Rejected']];
let activeStatus = 'SUBMITTED';

// ---------- auth ----------
async function login() {
  $('loginMsg').textContent = '';
  const email = $('email').value.trim();
  if (!email) { $('loginMsg').textContent = 'Enter your email.'; return; }
  $('loginBtn').disabled = true; $('loginMsg').textContent = 'Sending…';
  try { await requestSignInLink(email); $('loginMsg').textContent = `Link sent to ${email}. Open it on this device to finish signing in.`; }
  catch (e) { $('loginMsg').textContent = 'Error: ' + (e.code || e.message); $('loginBtn').disabled = false; }
}
function logout() {
  signOut(auth).finally(() => { ['app', 'session', 'topbar'].forEach((i) => $(i).classList.add('hidden')); $('login').classList.remove('hidden'); });
}
function showLogin(msg) {
  ['app', 'session', 'topbar'].forEach((i) => $(i).classList.add('hidden')); $('login').classList.remove('hidden');
  if (msg) $('loginMsg').textContent = msg;
}

async function showApp(user) {
  const tok = await getIdTokenResult(user, true).catch(() => null);
  if (tok?.claims.role !== 'admin') {
    await signOut(auth).catch(() => {});
    return showLogin('That account is not an admin. Ask an admin to run admin-cli/make-admin.mjs for your email.');
  }
  $('login').classList.add('hidden'); ['app', 'session', 'topbar'].forEach((i) => $(i).classList.remove('hidden'));
  $('who').textContent = (user.email || 'admin') + ' · admin';
  renderTabs(); refresh();
}

// ---------- tabs + refresh ----------
function renderTabs() {
  $('tabs').innerHTML = STATUSES.map(([s, l]) => `<div class="tab ${s === activeStatus ? 'active' : ''}" data-s="${s}">${l}</div>`).join('');
  $('tabs').querySelectorAll('.tab').forEach((t) => { t.onclick = () => { activeStatus = t.dataset.s; clearDetail(); renderTabs(); loadQueue(); }; });
}
async function refresh() { await Promise.all([loadOverview(), loadQueue(), loadMembers()]); }
const clearDetail = () => { $('detail').innerHTML = '<div class="empty">Select an application from the queue.</div>'; };

async function loadOverview() {
  const apps = collection(db, 'applications'), mem = collection(db, 'members');
  const c = async (col, val) => (await getCountFromServer(query(col, where('status', '==', val)))).data().count;
  try {
    const [sub, gr, rej, act, end] = await Promise.all([c(apps, 'SUBMITTED'), c(apps, 'GRANTED'), c(apps, 'REJECTED'), c(mem, 'ACTIVE'), c(mem, 'ENDED')]);
    const cards = [['Submitted', sub, ''], ['Granted', gr, 'teal'], ['Rejected', rej, 'coral'], ['Active members', act, 'mint'], ['Ended', end, 'gold']];
    $('kpis').innerHTML = cards.map(([l, n, cl]) => `<div class="kpi ${cl}"><div class="n">${n}</div><div class="l">${esc(l)}</div></div>`).join('');
  } catch (e) { $('kpis').innerHTML = `<div class="empty">Could not load counts (${esc(e.code || e.message)}).</div>`; }
}

async function loadQueue() {
  $('queueTitle').textContent = 'Applications · ' + (STATUSES.find((s) => s[0] === activeStatus)?.[1] || activeStatus);
  let items;
  try {
    const snap = await getDocs(query(collection(db, 'applications'), where('status', '==', activeStatus), orderBy('createdAt', 'desc'), limit(100)));
    items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { $('queue').innerHTML = `<div class="empty">Could not load (${esc(e.code || e.message)}).</div>`; return; }
  if (!items.length) { $('queue').innerHTML = '<div class="empty">No applications in this state.</div>'; clearDetail(); return; }
  $('queue').innerHTML = items.map((a) => `<div class="adminrow" data-id="${esc(a.id)}"><div><div class="nm">${esc(a.name || '—')}</div><div class="sub">${esc(a.email)} · ${esc(a.accessChoice || '')}</div></div><span class="pill ${esc(a.status)}">${esc(a.status)}</span></div>`).join('');
  $('queue').querySelectorAll('.adminrow').forEach((r) => { r.onclick = () => openApp(items.find((x) => x.id === r.dataset.id)); });
}

function cmdBox(cmd) { return `<div class="cmd"><code>${esc(cmd)}</code><button type="button" data-copy="${esc(cmd)}">Copy</button></div>`; }
function wireCmds() { document.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => toast('Command copied')).catch(() => toast('Copy failed')); }); }

function openApp(a) {
  const f = (k, v) => `<div class="field"><span>${k}</span><span>${esc(v ?? '—')}</span></div>`;
  let cmds = '';
  if (a.status === 'SUBMITTED') {
    cmds = `<div class="cmd-note">Grant access (run in <b>v3/backend</b> with your service-account key):</div>`
      + cmdBox(`node admin-cli/grant.mjs ${a.id}${a.accessChoice === 'supporter' ? ' --basis supporter' : ''}`);
  } else if (a.status === 'GRANTED') {
    cmds = `<div class="cmd-note">Granted → member <b>${esc(a.grantedUid || '')}</b>. Manage in the Members table below.</div>`;
  }
  $('detail').innerHTML = `
    <div class="field"><span>Applicant</span><span><b>${esc(a.name)}</b></span></div>
    ${f('Email', a.email)} ${f('Status', a.status)} ${f('Access choice', a.accessChoice)} ${f('Age bracket', a.ageBracket)} ${f('Guardian consent', a.guardianConsent ? 'yes' : '—')} ${f('Application ID', a.id)}
    ${cmds}
    <div class="timeline" id="timeline"></div>`;
  wireCmds();
  loadTimeline(a.id, a.grantedUid);
}

async function loadTimeline(appId, uid) {
  try {
    const ids = [appId, uid].filter(Boolean);
    const snap = await getDocs(query(collection(db, 'auditLog'), where('targetId', 'in', ids)));
    const evs = snap.docs.map((d) => d.data()).sort((a, b) => (a.ts?.toMillis?.() || 0) - (b.ts?.toMillis?.() || 0));
    $('timeline').innerHTML = evs.length
      ? evs.map((ev) => `<div class="ev"><b>${esc(ev.type || 'event')}</b><span style="float:right">${esc(ev.ts?.toDate ? ev.ts.toDate().toLocaleString() : '')}</span></div>`).join('')
      : '<div class="ev">No audit events.</div>';
  } catch { $('timeline').innerHTML = ''; }
}

async function loadMembers() {
  let members;
  try { members = (await getDocs(collection(db, 'members'))).docs.map((d) => ({ uid: d.id, ...d.data() })); }
  catch (e) { $('members').innerHTML = `<div class="empty">Could not load members (${esc(e.code || e.message)}).</div>`; return; }
  if (!members.length) { $('members').innerHTML = '<div class="empty">No provisioned members yet.</div>'; return; }
  const cur = await loadCurriculum();
  const rows = await Promise.all(members.map(async (m) => {
    const ps = await getDocs(collection(db, 'members', m.uid, 'progress')).catch(() => ({ docs: [] }));
    const completed = new Set(ps.docs.filter((d) => d.data().status === 'complete').map((d) => d.id));
    const defs = cur[m.path]?.stages || cur.fasttrack.stages;
    const total = defs.length, comp = defs.filter((s) => completed.has(s.key)).length;
    const pct = total ? Math.round((100 * comp) / total) : 0;
    const next = defs.find((s) => !completed.has(s.key));
    return { m, completed, comp, total, pct, defs, current: next ? `${next.label}: ${next.title}` : 'Path complete' };
  }));
  $('members').innerHTML = `<table><thead><tr><th>Name</th><th>Email</th><th>Basis</th><th>Path</th><th>Progress</th><th>Current</th><th>Status</th><th>Access ends</th><th></th></tr></thead><tbody>${rows.map(({ m, comp, total, pct, current }) => `<tr class="member-row" data-uid="${esc(m.uid)}"><td>${esc(m.name || '—')}</td><td>${esc(m.email)}</td><td>${esc(m.accessBasis || '—')}</td><td>${esc(m.path === 'roadmap' ? 'Roadmap' : 'Fast track')}</td><td>${progressMini(pct, comp, total)}</td><td><div class="current-stage">${esc(current)}</div></td><td><span class="pill ${esc(m.status)}">${esc(m.status)}</span></td><td>${esc(fmtDate(m.accessEnds))}</td><td>${m.status === 'ACTIVE' ? `<button class="btn sec" data-ext="${esc(m.uid)}">Extend</button> <button class="btn bad" data-rev="${esc(m.uid)}">Revoke</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
  $('members').querySelectorAll('.member-row').forEach((r) => { r.onclick = () => openMemberProgress(rows.find((x) => x.m.uid === r.dataset.uid)); });
  $('members').querySelectorAll('button[data-ext]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); showMemberCmd('extend', b.dataset.ext); }; });
  $('members').querySelectorAll('button[data-rev]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); showMemberCmd('revoke', b.dataset.rev); }; });
}
const progressMini = (pct, completed, total) => `<div class="progress-mini"><div class="bar"><span style="width:${pct}%"></span></div><div class="txt">${pct}% · ${completed}/${total}</div></div>`;

function showMemberCmd(act, uid) {
  const cmd = act === 'extend' ? `node admin-cli/extend.mjs ${uid} --days 90` : `node admin-cli/revoke.mjs ${uid}`;
  $('memberProgress').innerHTML = `<h3>${act === 'extend' ? 'Extend access' : 'Revoke access'}</h3><p>Privileged ops run in the admin-cli (Spark has no hosted endpoint). Run in <b>v3/backend</b> with your service-account key:</p>${cmdBox(cmd)}`;
  wireCmds();
}

function openMemberProgress(row) {
  const { m, defs, completed, comp, total, pct } = row;
  const nextOpen = defs.find((s) => !completed.has(s.key))?.key ?? null;
  const stateOf = (k) => (completed.has(k) ? 'complete' : (k === nextOpen ? 'active' : 'locked'));
  let grid;
  if (m.path === 'roadmap') {
    grid = defs.map((s) => `<div class="stage-block"><h4>${esc(s.label)}: ${esc(s.title)}</h4><div class="stage-chips"><span class="stage-chip ${stateOf(s.key)}">${stateTxt(stateOf(s.key))}</span></div></div>`).join('');
  } else {
    grid = [1, 2, 3, 4].map((w) => {
      const days = defs.filter((s) => s.week === w);
      const wd = days.filter((s) => completed.has(s.key)).length;
      return `<div class="stage-block"><h4>Week ${w} · ${wd}/${days.length}</h4><div class="stage-chips">${days.map((s) => `<span class="stage-chip ${stateOf(s.key)}" title="${esc(s.title)}">${esc(s.label)} · ${stateTxt(stateOf(s.key))}</span>`).join('')}</div></div>`;
    }).join('');
  }
  const cur = m.path === 'roadmap' ? 'Full Roadmap' : '4-Week Fast Track';
  $('memberProgress').innerHTML = `<h3>${esc(m.name || m.email)}</h3><p>${esc(cur)} · ${comp}/${total} complete · ${pct}%</p>${progressMini(pct, comp, total)}<div class="stage-grid">${grid}</div>`;
}

// ---------- wiring + boot ----------
$('loginBtn').onclick = login;
$('email').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
$('logoutBtn').onclick = logout;
(async () => {
  const u = await completeSignInIfPresent();
  if (u) return showApp(u);
  onAuthStateChanged(auth, (user) => { if (user && !user.isAnonymous) showApp(user); else showLogin(); });
})();
