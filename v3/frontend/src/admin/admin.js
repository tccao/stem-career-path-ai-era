// Admin console — design ported from demo/public/admin.html, wired to the Spark/Functions-free
// backend. READS go straight to Firestore (allowed by Rules for the admin custom claim).
// Privileged MUTATIONS have no hosted endpoint on Spark, so the buttons render the exact
// admin-cli command to copy and run (the admin-cli holds AdminCreateUser / setCustomUserClaims).
import '../ui/theme.css';
import { collection, query, where, orderBy, limit, getDocs, getDoc, getCountFromServer, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { signOut, getIdTokenResult } from 'firebase/auth';
import { db, auth } from '../firebase.js';
import { requestSignInLink, completeSignInIfPresent, onAuthStateChanged } from '../lib/auth.js';
import { loadCurriculum } from '../lib/cache.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (m) => { const t = $('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); };
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const stateTxt = (s) => (s === 'complete' ? 'Complete' : s === 'active' ? 'In progress' : 'Locked');

const STATUSES = [['SUBMITTED', 'Submitted'], ['INTERVIEW_SCHEDULED', 'Interview'], ['GRANTED', 'Granted'], ['REJECTED', 'Rejected']];
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
  ensureSettingsButton();
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

const reopen = async (id) => { try { const d = await getDoc(doc(db, 'applications', id)); if (d.exists()) openApp({ id, ...d.data() }); } catch { /* ignore */ } };

function openApp(a) {
  const f = (k, v) => `<div class="field"><span>${k}</span><span>${esc(v ?? '—')}</span></div>`;
  const ivInfo = a.interviewAt ? f('Interview', new Date(a.interviewAt).toLocaleString()) : '';
  const vetting = (a.status === 'SUBMITTED' || a.status === 'INTERVIEW_SCHEDULED');
  let block = '';
  if (vetting && a.accessChoice === 'supporter') {
    block = `
      <div class="card" style="margin-top:14px;padding:18px">
        <h2 style="font-size:.95rem;margin:0 0 6px">Confirm donation</h2>
        <p class="cmd-note">Supporter path. Enter the Zeffy payment id (from your Zeffy dashboard / webhook). The CLI verifies it against the Zeffy API (fail-closed) and grants. Run in <b>v3/backend</b>:</p>
        <label for="zpid">Zeffy payment id</label>
        <input id="zpid" type="text" placeholder="p1b2c3d4-..." />
        <div class="cmd"><code id="confirmCode">node admin-cli/confirm-donation.mjs ${esc(a.id)} &lt;paymentId&gt;</code><button type="button" id="confirmCopy">Copy</button></div>
        <div class="actions"><button class="btn bad" id="ivReject">Reject</button></div>
      </div>`;
  } else if (vetting) {
    block = `
      <div class="card" style="margin-top:14px;padding:18px">
        <h2 style="font-size:.95rem;margin:0 0 6px">Interview</h2>
        <label for="ivAt">Date &amp; time</label>
        <input id="ivAt" type="datetime-local" />
        <label for="ivNote">Note (optional)</label>
        <input id="ivNote" type="text" placeholder="Cal.com / Zoom link, interviewer…" value="${esc(a.interviewNote || '')}" />
        <div class="actions">
          <button class="btn" id="ivSchedule">${a.status === 'INTERVIEW_SCHEDULED' ? 'Update interview' : 'Schedule interview'}</button>
          <button class="btn bad" id="ivReject">Reject</button>
        </div>
        <div class="cmd-note">After the interview, grant access from the admin-cli (account-minting stays server-side):</div>
        ${cmdBox(`node admin-cli/grant.mjs ${a.id}`)}
      </div>`;
  } else if (a.status === 'GRANTED') {
    block = `<div class="cmd-note">Granted → member <b>${esc(a.grantedUid || '')}</b>. Manage in the Members table below.</div>`;
  } else if (a.status === 'REJECTED') {
    block = `<div class="cmd-note">Application rejected${a.rejectedReason ? ': ' + esc(a.rejectedReason) : ''}.</div>`;
  }
  $('detail').innerHTML = `
    <div class="field"><span>Applicant</span><span><b>${esc(a.name)}</b></span></div>
    ${f('Email', a.email)} ${f('Status', a.status)} ${f('Access choice', a.accessChoice)} ${f('Age bracket', a.ageBracket)} ${f('Guardian consent', a.guardianConsent ? 'yes' : '—')} ${ivInfo} ${f('Application ID', a.id)}
    ${block}
    <div class="timeline" id="timeline"></div>`;
  wireCmds();
  const sched = $('ivSchedule');
  if (sched) sched.onclick = async () => {
    const at = $('ivAt').value, note = $('ivNote').value.trim();
    const patch = { status: 'INTERVIEW_SCHEDULED' };
    if (at) patch.interviewAt = new Date(at).getTime();
    if (note) patch.interviewNote = note;
    try { await updateDoc(doc(db, 'applications', a.id), patch); toast('Interview scheduled'); await refresh(); reopen(a.id); }
    catch (e) { toast('Error: ' + (e.code || e.message)); }
  };
  const rej = $('ivReject');
  if (rej) rej.onclick = async () => {
    try { await updateDoc(doc(db, 'applications', a.id), { status: 'REJECTED', rejectedReason: 'not_eligible' }); toast('Application rejected'); await refresh(); clearDetail(); }
    catch (e) { toast('Error: ' + (e.code || e.message)); }
  };
  const zpid = $('zpid');
  if (zpid) {
    const code = $('confirmCode');
    const build = () => `node admin-cli/confirm-donation.mjs ${a.id} ${zpid.value.trim() || '<paymentId>'}`;
    zpid.addEventListener('input', () => { code.textContent = build(); });
    $('confirmCopy').onclick = () => navigator.clipboard?.writeText(build()).then(() => toast('Command copied')).catch(() => toast('Copy failed'));
  }
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

async function openMemberProgress(row) {
  const { m, defs, completed, comp, total, pct } = row;
  const ls = await getDocs(collection(db, 'members', m.uid, 'stageLocks')).catch(() => ({ forEach() {} }));
  const ov = {}; ls.forEach((d) => { ov[d.id] = d.data().state; });
  const nextOpen = defs.find((s) => !completed.has(s.key))?.key ?? null;
  const stateOf = (k) => (completed.has(k) ? 'complete' : ov[k] === 'locked' ? 'locked' : ov[k] === 'unlocked' ? 'active' : (k === nextOpen ? 'active' : 'locked'));
  const chip = (s) => {
    const st = stateOf(s.key), override = ov[s.key];
    let ctrl = '';
    if (st !== 'complete') {
      const primary = override === 'locked' ? ['unlock', 'Unlock'] : override === 'unlocked' ? ['lock', 'Lock'] : st === 'locked' ? ['unlock', 'Unlock'] : ['lock', 'Lock'];
      const autoBtn = override ? `<button class="mini-action" data-stage="${esc(s.key)}" data-act="auto">Auto</button>` : '';
      ctrl = `<button class="mini-action" data-stage="${esc(s.key)}" data-act="${primary[0]}">${primary[1]}</button>${autoBtn}`;
    }
    const lbl = override === 'unlocked' ? 'Unlocked' : override === 'locked' ? 'Locked' : stateTxt(st);
    return `<span class="stage-chip ${st}" title="${esc(s.title || '')}">${esc(s.label || s.key)} · ${lbl} ${ctrl}</span>`;
  };
  let grid;
  if (m.path === 'roadmap') {
    grid = defs.map((s) => `<div class="stage-block"><h4>${esc(s.label)}: ${esc(s.title)}</h4><div class="stage-chips">${chip(s)}</div></div>`).join('');
  } else {
    grid = [1, 2, 3, 4].map((w) => {
      const days = defs.filter((s) => s.week === w);
      const wd = days.filter((s) => completed.has(s.key)).length;
      return `<div class="stage-block"><h4>Week ${w} · ${wd}/${days.length}</h4><div class="stage-chips">${days.map(chip).join('')}</div></div>`;
    }).join('');
  }
  const cur = m.path === 'roadmap' ? 'Full Roadmap' : '4-Week Fast Track';
  $('memberProgress').innerHTML = `<h3>${esc(m.name || m.email)}</h3><p>${esc(cur)} · ${comp}/${total} complete · ${pct}% · use a stage's Lock/Unlock to override the student's gate</p>${progressMini(pct, comp, total)}<div class="stage-grid">${grid}</div>`;
  $('memberProgress').querySelectorAll('.mini-action').forEach((b) => { b.onclick = () => setStageLock(m.uid, b.dataset.stage, b.dataset.act, row); });
}

async function setStageLock(uid, stageKey, act, row) {
  try {
    const ref = doc(db, 'members', uid, 'stageLocks', stageKey);
    if (act === 'auto') await deleteDoc(ref);
    else await setDoc(ref, { state: act === 'lock' ? 'locked' : 'unlocked' });
    toast(act === 'auto' ? 'Gate restored to automatic' : `Stage ${act}ed`);
    await openMemberProgress(row);
  } catch (e) { toast('Error: ' + (e.code || e.message)); }
}

// ---------- site settings (Zeffy + Cal.com links) ----------
function ensureSettingsButton() {
  if ($('settingsBtn')) return;
  const mk = (id, label, fn) => { const b = document.createElement('button'); b.id = id; b.className = 'linkbtn'; b.textContent = label; b.onclick = fn; return b; };
  $('session').insertBefore(mk('donationsBtn', 'Donations', openDonations), $('logoutBtn'));
  $('session').insertBefore(mk('settingsBtn', 'Settings', openSettings), $('logoutBtn'));
}

async function openDonations() {
  $('donationsModal')?.remove();
  let rows = [];
  try { rows = (await getDocs(collection(db, 'donations'))).docs.map((d) => d.data()); }
  catch (e) { return toast('Could not load donations: ' + (e.code || e.message)); }
  const totalByEmail = {};
  for (const r of rows) { const k = (r.email || '').toLowerCase(); totalByEmail[k] = (totalByEmail[k] || 0) + (r.amount || 0); }
  rows.forEach((r) => { r._total = totalByEmail[(r.email || '').toLowerCase()] || 0; });
  const money = (c) => `$${((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cols = [
    ['email', 'Email', (r) => r.email || '—'],
    ['amount', 'Amount', (r) => money(r.amount)],
    ['_total', 'Total donation', (r) => money(r._total)],
    ['created', 'Date / time', (r) => (r.created ? new Date(r.created).toLocaleString() : '—')],
    ['confirmed', 'Confirmed', (r) => (r.status === 'succeeded' && r.created ? new Date(r.created).toLocaleDateString() : (r.status || '—'))],
    ['campaignName', 'Campaign', (r) => r.campaignName || '—'],
  ];
  const fnOf = (k) => cols.find((c) => c[0] === k)[2];
  const valOf = (r, k) => (k === 'confirmed' ? (r.status === 'succeeded' ? (r.created || 0) : 0)
    : (k === 'created' || k === 'amount' || k === '_total') ? (r[k] || 0) : String(r[k] ?? '').toLowerCase());
  const donors = new Set(rows.map((r) => (r.email || '').toLowerCase()).filter(Boolean)).size;
  const campTotal = rows.filter((r) => r.status === 'succeeded').reduce((s, r) => s + (r.amount || 0), 0);
  const campName = rows.find((r) => r.campaignName)?.campaignName || '—';

  const modal = document.createElement('div');
  modal.id = 'donationsModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(28,17,48,.45);display:grid;place-items:center;z-index:99;padding:20px';
  modal.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-label="Donations" style="max-width:1040px;width:100%;max-height:88vh;overflow:auto;margin:0">
      <div class="card-head"><h3>Donations</h3><button class="linkbtn" id="donClose">Close</button></div>
      <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">
        <div class="kpi mint"><div class="n">${donors}</div><div class="l">Total donors</div></div>
        <div class="kpi"><div class="n">${money(campTotal)}</div><div class="l">Total donations</div></div>
        <div class="kpi teal"><div class="n" style="font-size:1.05rem;line-height:1.2">${esc(campName)}</div><div class="l">Campaign</div></div>
      </div>
      <div class="cmd-note">Synced from Zeffy by the admin-cli (the API key stays server-side). Refresh:</div>
      ${cmdBox('node admin-cli/sync-donations.mjs')}
      <div id="donTableWrap" style="margin-top:12px"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.addEventListener('keydown', function esc2(e) { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc2); } });
  $('donClose').onclick = () => modal.remove();
  wireCmds();

  const state = { sortKey: 'created', sortDir: -1, filters: {} };
  function renderBody() {
    let view = rows.filter((r) => cols.every(([k]) => { const f = (state.filters[k] || '').toLowerCase(); return !f || String(fnOf(k)(r)).toLowerCase().includes(f); }));
    view.sort((a, b) => { const A = valOf(a, state.sortKey), B = valOf(b, state.sortKey); return (A > B ? 1 : A < B ? -1 : 0) * state.sortDir; });
    $('donBody').innerHTML = view.length
      ? view.map((r) => `<tr>${cols.map(([, , fn]) => `<td>${esc(fn(r))}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="empty">No donations${rows.length ? ' match the filters' : ' yet — run sync-donations.mjs'}.</td></tr>`;
  }
  function renderHead() {
    const head = cols.map(([k, label]) => `<th data-sort="${k}" style="cursor:pointer;white-space:nowrap">${label}${state.sortKey === k ? (state.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
    const filt = cols.map(([k]) => `<th><input class="cfg-input donfilter" data-f="${k}" value="${esc(state.filters[k] || '')}" placeholder="filter" style="padding:4px 7px;font-size:.76rem;min-width:90px"></th>`).join('');
    $('donTableWrap').innerHTML = `<table><thead><tr>${head}</tr><tr>${filt}</tr></thead><tbody id="donBody"></tbody></table>`;
    $('donTableWrap').querySelectorAll('th[data-sort]').forEach((th) => { th.onclick = () => { const k = th.dataset.sort; if (state.sortKey === k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = 1; } renderHead(); renderBody(); }; });
    $('donTableWrap').querySelectorAll('.donfilter').forEach((inp) => { inp.oninput = () => { state.filters[inp.dataset.f] = inp.value; renderBody(); }; });
  }
  renderHead(); renderBody();
}

async function openSettings() {
  $('settingsModal')?.remove();
  let s = {};
  try { const d = await getDoc(doc(db, 'settings', 'public')); if (d.exists()) s = d.data(); } catch { /* defaults */ }
  const modal = document.createElement('div');
  modal.id = 'settingsModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(28,17,48,.45);display:grid;place-items:center;z-index:99;padding:20px';
  modal.innerHTML = `<div class="login-card" role="dialog" aria-modal="true" aria-label="Site settings" style="max-width:460px;margin:0">
      <h1 style="font-size:1.3rem">Site settings</h1>
      <p>Public links used by the landing page — saved to Firestore, no redeploy needed.</p>
      <label for="setZeffy">Zeffy donate URL</label>
      <input id="setZeffy" type="url" inputmode="url" placeholder="https://www.zeffy.com/..." />
      <label for="setCal">Cal.com booking URL</label>
      <input id="setCal" type="url" inputmode="url" placeholder="https://cal.com/..." />
      <div class="actions" style="margin-top:16px">
        <button class="btn btn-purple" id="setSave" style="flex:1">Save</button>
        <button class="btn sec" id="setCancel">Cancel</button>
      </div>
      <div class="cfg-msg" id="setMsg"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); } });
  $('setZeffy').value = s.zeffyUrl || '';
  $('setCal').value = s.calComUrl || '';
  $('setCancel').onclick = () => modal.remove();
  $('setSave').onclick = async () => {
    const zeffyUrl = $('setZeffy').value.trim(), calComUrl = $('setCal').value.trim();
    if (!/^https:\/\//.test(zeffyUrl) || !/^https:\/\//.test(calComUrl)) { $('setMsg').textContent = 'Both must be https:// URLs.'; return; }
    $('setSave').disabled = true; $('setMsg').textContent = 'Saving…';
    try {
      await setDoc(doc(db, 'settings', 'public'), { zeffyUrl, calComUrl, updatedAt: Date.now(), updatedBy: auth.currentUser?.uid || '' });
      toast('Settings updated'); modal.remove();
    } catch (e) { $('setMsg').textContent = 'Error: ' + (e.code || e.message); $('setSave').disabled = false; }
  };
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
