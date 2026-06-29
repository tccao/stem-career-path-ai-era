// Admin console. Reads are Rules-gated; every mutation crosses an MFA- and
// App-Check-protected callable so lifecycle transitions and audits stay server-owned.
import '../ui/theme.css';
import { collection, query, where, orderBy, limit, getDocs, getDoc, getCountFromServer, doc } from 'firebase/firestore';
import { signOut, getIdTokenResult } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '../firebase.js';
import { clearSignInState, enrollTotpMfa, hasEnrolledMfa, requestSignInLink, completeSignInIfPresent, onAuthStateChanged } from '../lib/auth.js';
import { loadCurriculum } from '../lib/cache.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (m) => { const t = $('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); };
// Staff/owner-gated Cloud Functions (grant/extendAccess/disableAccount/enableAccount/getInterview/syncDonations + owner setRole/setLockdown/listAccounts).
const call = (name, data) => httpsCallable(functions, name)(data).then((r) => r.data);
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const stateTxt = (s) => (s === 'complete' ? 'Complete' : s === 'active' ? 'In progress' : 'Locked');

const STATUSES = [['SUBMITTED', 'Submitted'], ['GRANTED', 'Granted'], ['REJECTED', 'Rejected']];
let activeStatus = 'SUBMITTED';
let view = 'applications'; // 'applications' | 'donations' | 'owner'
let myRole = null; // 'admin' | 'owner'

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
  clearSignInState();
  signOut(auth).finally(() => { ['app', 'session', 'topbar'].forEach((i) => $(i).classList.add('hidden')); $('login').classList.remove('hidden'); });
}
function showLogin(msg) {
  ['app', 'session', 'topbar'].forEach((i) => $(i).classList.add('hidden')); $('login').classList.remove('hidden');
  if (msg) $('loginMsg').textContent = msg;
}

async function showApp(user) {
  const tok = await getIdTokenResult(user, true).catch(() => null);
  const role = tok?.claims.role;
  if (role !== 'admin' && role !== 'owner') {
    await signOut(auth).catch(() => {});
    return showLogin('That account is not staff. Ask an owner/admin to grant your email an admin role.');
  }
  if (tok?.claims.mfaEnrolled !== true) {
    try {
      if (!hasEnrolledMfa(user)) await enrollTotpMfa(user);
      await call('confirmMfaEnrollment');
      await signOut(auth);
      return showLogin('MFA confirmed. Open a new email link and enter your authenticator code.');
    } catch (error) {
      await signOut(auth).catch(() => {});
      return showLogin('MFA setup failed: ' + (error.code || error.message));
    }
  }
  myRole = role;
  $('login').classList.add('hidden'); ['app', 'session', 'topbar'].forEach((i) => $(i).classList.remove('hidden'));
  $('who').textContent = (user.email || 'staff') + ' · ' + role;
  ensureSettingsButton();
  renderTabs(); refresh(); refreshLockdownBanner();
}

// ---------- tabs + refresh ----------
function renderTabs() {
  const tabs = [...STATUSES, ['__donations__', 'Donations']];
  if (myRole === 'owner') tabs.push(['__owner__', 'Owner']);
  $('tabs').innerHTML = tabs.map(([s, l]) => {
    const active = s === '__donations__' ? view === 'donations' : s === '__owner__' ? view === 'owner' : (view === 'applications' && s === activeStatus);
    return `<div class="tab ${active ? 'active' : ''} ${s === '__owner__' ? 'tab-owner' : ''}" data-s="${s}">${l}</div>`;
  }).join('');
  $('tabs').querySelectorAll('.tab').forEach((t) => {
    t.onclick = () => {
      if (t.dataset.s === '__donations__') { view = 'donations'; renderTabs(); showDonations(); }
      else if (t.dataset.s === '__owner__') { view = 'owner'; renderTabs(); showOwner(); }
      else { view = 'applications'; activeStatus = t.dataset.s; renderTabs(); showApplications(); clearDetail(); loadQueue(); }
    };
  });
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

function openApp(a) {
  const f = (k, v) => `<div class="field"><span>${k}</span><span>${esc(v ?? '—')}</span></div>`;
  const vetting = (a.status === 'SUBMITTED' || a.status === 'INTERVIEW_SCHEDULED');
  let block = '';
  if (vetting && a.accessChoice === 'supporter') {
    block = `
      <div class="card" style="margin-top:14px;padding:18px">
        <h2 style="font-size:.95rem;margin:0 0 6px">Confirm donation</h2>
        <p class="cmd-note">The server verifies payment status, refund/dispute state, and applicant email before granting access.</p>
        <label for="zpid">Zeffy payment id</label>
        <input id="zpid" type="text" placeholder="p1b2c3d4-..." />
        <label for="supportPath">Learning path</label>
        <select id="supportPath"><option value="fasttrack">4-Week Fast Track</option><option value="roadmap">Full Roadmap</option></select>
        <div class="actions"><button class="btn" id="confirmDonation">Verify &amp; grant</button><button class="btn bad" id="ivReject">Reject</button></div>
      </div>`;
  } else if (vetting) {
    block = `
      <div class="card" style="margin-top:14px;padding:18px">
        <h2 style="font-size:.95rem;margin:0 0 6px">Review application</h2>
        <div class="iv-label">Interview booked on Cal.com</div>
        <div id="ivSlot" class="iv-slot iv-slot-loading">Checking Cal.com for a booked interview…</div>
        <label for="ivPath" style="margin-top:14px">Learning path on grant</label>
        <select id="ivPath"><option value="fasttrack">4-Week Fast Track</option><option value="roadmap">Full Roadmap</option></select>
        <div class="actions" style="margin-top:14px">
          <button class="btn" id="ivApprove">Approve &amp; grant</button>
          <button class="btn bad" id="ivReject">Reject</button>
        </div>
      </div>`;
  } else if (a.status === 'GRANTED') {
    block = `<div class="cmd-note">Granted → member <b>${esc(a.grantedUid || '')}</b>. Manage in the Members table below.</div>`;
  } else if (a.status === 'REJECTED') {
    block = `<div class="cmd-note">Application rejected${a.rejectedReason ? ': ' + esc(a.rejectedReason) : ''}.</div>`;
  }
  $('detail').innerHTML = `
    <div class="field"><span>Applicant</span><span><b>${esc(a.name)}</b></span></div>
    ${f('Email', a.email)} ${f('Status', a.status)} ${f('Access choice', a.accessChoice)} ${f('Age bracket', a.ageBracket)} ${f('Guardian consent', a.guardianConsent ? 'yes' : '—')} ${f('Application ID', a.id)}
    ${block}
    <div class="timeline" id="timeline"></div>`;
  // Show the applicant's self-booked Cal.com slot (key stays server-side in getInterview).
  const slot = $('ivSlot');
  if (slot) loadInterviewSlot(a.id, slot);
  const approve = $('ivApprove');
  if (approve) approve.onclick = async () => {
    approve.disabled = true; const orig = approve.textContent; approve.textContent = 'Granting…';
    try {
      const path = $('ivPath')?.value || 'fasttrack';
      await call('grant', { applicationId: a.id, path });
      toast('Access granted'); await refresh(); clearDetail();
    } catch (e) { toast('Grant failed: ' + (e.code || e.message)); approve.disabled = false; approve.textContent = orig; }
  };
  const rej = $('ivReject');
  if (rej) rej.onclick = async () => {
    try { await call('rejectApplication', { applicationId: a.id, reasonCode: 'not_eligible' }); toast('Application rejected'); await refresh(); clearDetail(); }
    catch (e) { toast('Error: ' + (e.code || e.message)); }
  };
  const zpid = $('zpid');
  if (zpid) {
    $('confirmDonation').onclick = async () => {
      const paymentId = zpid.value.trim();
      if (!paymentId) return toast('Enter the Zeffy payment id');
      const btn = $('confirmDonation'); btn.disabled = true; btn.textContent = 'Verifying…';
      try {
        await call('confirmDonation', { applicationId: a.id, paymentId, path: $('supportPath').value });
        toast('Payment verified and access granted'); await refresh(); clearDetail();
      } catch (error) {
        toast('Verification failed: ' + (error.code || error.message)); btn.disabled = false; btn.textContent = 'Verify & grant';
      }
    };
  }
  loadTimeline(a.id, a.grantedUid);
}

async function loadInterviewSlot(applicationId, el) {
  try {
    const { booking } = await call('getInterview', { applicationId });
    if (!booking) { el.className = 'iv-slot iv-slot-none'; el.textContent = 'No interview booked on Cal.com yet.'; return; }
    const when = booking.start ? new Date(booking.start).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
    el.className = 'iv-slot iv-slot-ok';
    el.innerHTML = `<span class="iv-dot"></span><div><div class="iv-when">${esc(when)}</div><div class="iv-meta">${esc(booking.title || 'Interview')} · ${esc(booking.status || 'scheduled')}</div></div>`;
  } catch (e) {
    el.className = 'iv-slot iv-slot-err';
    el.textContent = 'Could not load Cal.com booking: ' + (e.code || e.message);
  }
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
  $('members').innerHTML = `<table><thead><tr><th>Name</th><th>Email</th><th>Basis</th><th>Path</th><th>Progress</th><th>Current</th><th>Status</th><th>Access ends</th><th></th></tr></thead><tbody>${rows.map(({ m, comp, total, pct, current }) => {
    const disabled = m.status === 'ENDED' && m.endedReason === 'disabled';
    const canExtend = m.status === 'ACTIVE'
      || (m.status === 'ENDED' && m.endedReason !== 'payment_reversed' && !disabled);
    const extendLabel = m.status === 'ACTIVE' ? 'Extend' : 'Restore access';
    const actions = disabled
      ? `<button class="btn sec" data-reactivate="${esc(m.uid)}">Reactivate</button>`
      : `${canExtend ? `<button class="btn sec" data-ext="${esc(m.uid)}">${extendLabel}</button> ` : ''}<button class="btn bad" data-dis="${esc(m.uid)}">Disable</button>`;
    return `<tr class="member-row" data-uid="${esc(m.uid)}"><td>${esc(m.name || '—')}</td><td>${esc(m.email)}</td><td>${esc(m.accessBasis || '—')}</td><td>${esc(m.path === 'roadmap' ? 'Roadmap' : 'Fast track')}</td><td>${progressMini(pct, comp, total)}</td><td><div class="current-stage">${esc(current)}</div></td><td><span class="pill ${esc(m.status)}">${esc(m.status)}</span></td><td>${esc(fmtDate(m.accessEnds))}</td><td>${actions}</td></tr>`;
  }).join('')}</tbody></table>`;
  $('members').querySelectorAll('.member-row').forEach((r) => { r.onclick = () => openMemberProgress(rows.find((x) => x.m.uid === r.dataset.uid)); });
  $('members').querySelectorAll('button[data-ext]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); showMemberExtend(b.dataset.ext); }; });
  $('members').querySelectorAll('button[data-dis]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); disableMember(b.dataset.dis); }; });
  $('members').querySelectorAll('button[data-reactivate]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); reactivateMember(b.dataset.reactivate); }; });
}
const progressMini = (pct, completed, total) => `<div class="progress-mini"><div class="bar"><span style="width:${pct}%"></span></div><div class="txt">${pct}% · ${completed}/${total}</div></div>`;

// Extend an active member or restore an ended member's access window. A disabled account must be
// reactivated first; payment-reversed supporter access cannot be restored through this control.
function showMemberExtend(uid) {
  const host = $('memberProgress');
  host.innerHTML = `<h3>Extend or restore access</h3><p>Add days from the later of today or the current access end. Ended access becomes active again; the member may need to sign in again to refresh a revoked session.</p>
    <label for="extDays">Days to add</label>
    <input id="extDays" type="number" min="1" value="365" />
    <div class="actions" style="margin-top:12px"><button class="btn" id="extApply">Extend</button></div>`;
  $('extApply').onclick = async () => {
    const days = Number($('extDays').value);
    if (!days || days < 1) return toast('Enter a valid number of days');
    const btn = $('extApply'); btn.disabled = true; btn.textContent = 'Extending…';
    try { const r = await call('extendAccess', { uid, days }); toast(`Extended → ends ${fmtDate(r.accessEnds)}`); await loadMembers(); host.innerHTML = ''; }
    catch (e) { toast('Extend failed: ' + (e.code || e.message)); btn.disabled = false; btn.textContent = 'Extend'; }
  };
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
    await call('setStageLock', {
      uid,
      stageKey,
      action: act === 'auto' ? 'auto' : act === 'lock' ? 'locked' : 'unlocked',
    });
    toast(act === 'auto' ? 'Gate restored to automatic' : `Stage ${act}ed`);
    await openMemberProgress(row);
  } catch (e) { toast('Error: ' + (e.code || e.message)); }
}

// ---------- site settings (Zeffy + Cal.com links) ----------
function ensureSettingsButton() {
  if ($('settingsBtn') || myRole !== 'owner') return;
  const b = document.createElement('button');
  b.id = 'settingsBtn'; b.className = 'linkbtn'; b.textContent = 'Settings';
  b.onclick = openSettings;
  $('session').insertBefore(b, $('logoutBtn'));
}

// ---------- donations view (replaces the main body; Donations tab) ----------
function showApplications() {
  $('kpis').classList.remove('hidden');
  document.querySelector('.cols').classList.remove('hidden');
  document.querySelector('.members-wrap').classList.remove('hidden');
  $('donationsView')?.classList.add('hidden');
  $('ownerView')?.classList.add('hidden');
}
function ensureDonationsView() {
  if ($('donationsView')) return;
  const d = document.createElement('div');
  d.id = 'donationsView';
  document.querySelector('.members-wrap').after(d);
}
function showDonations() {
  $('kpis').classList.add('hidden');
  document.querySelector('.cols').classList.add('hidden');
  document.querySelector('.members-wrap').classList.add('hidden');
  $('ownerView')?.classList.add('hidden');
  ensureDonationsView();
  $('donationsView').classList.remove('hidden');
  renderDonationsView();
}

// ---------- owner controls (lockdown · staff roles · disable/enable) ----------
async function setLockdown(enabled, reason = '') {
  try {
    await call('setLockdown', { enabled, reason });
    toast(enabled ? 'Lockdown ENABLED' : 'Lockdown lifted');
    await refreshLockdownBanner();
    if (view === 'owner') renderOwnerView();
  } catch (e) { toast('Lockdown failed: ' + (e.code || e.message)); }
}
async function refreshLockdownBanner() {
  let snap; try { snap = await getDoc(doc(db, 'system', 'lockdown')); } catch { return; }
  const on = snap?.exists() && snap.data().enabled === true;
  let bar = $('lockdownBar');
  if (!on) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'lockdownBar'; bar.className = 'lockdown-bar'; $('app').prepend(bar); }
  const reason = snap.data().reason || '';
  bar.innerHTML = `<b>⛔ SYSTEM LOCKDOWN</b> — non-owner access is blocked.${reason ? ' ' + esc(reason) : ''}${myRole === 'owner' ? ' <button class="btn-mini" id="liftLock">Lift lockdown</button>' : ''}`;
  if (myRole === 'owner') $('liftLock').onclick = () => setLockdown(false);
}
function ensureOwnerView() {
  if ($('ownerView')) return;
  const d = document.createElement('div'); d.id = 'ownerView';
  document.querySelector('.members-wrap').after(d);
}
function showOwner() {
  $('kpis').classList.add('hidden');
  document.querySelector('.cols').classList.add('hidden');
  document.querySelector('.members-wrap').classList.add('hidden');
  $('donationsView')?.classList.add('hidden');
  ensureOwnerView();
  $('ownerView').classList.remove('hidden');
  renderOwnerView();
}
const ROLE_RANK = { owner: 3, admin: 2, student: 1 };
const promoteTarget = (r) => (r === 'admin' ? 'owner' : r === 'owner' ? null : 'admin');
const demoteTarget = (r) => (r === 'owner' ? 'admin' : r === 'admin' ? 'none' : null);

async function renderOwnerView() {
  const host = $('ownerView');
  host.innerHTML = '<div class="empty">Loading accounts…</div>';
  let locked = false, reason = '';
  try { const s = await getDoc(doc(db, 'system', 'lockdown')); if (s.exists()) { locked = s.data().enabled === true; reason = s.data().reason || ''; } } catch { /* default unlocked */ }
  let accounts = [];
  try { accounts = (await call('listAccounts')).accounts || []; }
  catch (e) { host.innerHTML = `<div class="empty">Could not load accounts (${esc(e.code || e.message)}).</div>`; return; }
  // Join student display names from the members collection.
  const nameByUid = {};
  try { (await getDocs(collection(db, 'members'))).docs.forEach((d) => { nameByUid[d.id] = d.data().name; }); } catch { /* names optional */ }
  const myUid = auth.currentUser?.uid;
  accounts.sort((a, b) => (ROLE_RANK[b.role] || 0) - (ROLE_RANK[a.role] || 0) || String(a.email).localeCompare(String(b.email)));

  const rows = accounts.map((a) => {
    const self = a.uid === myUid;
    const promo = promoteTarget(a.role), demo = demoteTarget(a.role);
    const acts = [];
    if (!self && promo) acts.push(`<button class="btn sec" data-prom="${esc(a.uid)}" data-to="${promo}">Promote</button>`);
    if (!self && demo) {
      const demoLabel = a.role === 'admin' && a.memberStatus === 'ACTIVE' ? 'Restore student' : 'Demote';
      acts.push(`<button class="btn warn" data-demo="${esc(a.uid)}" data-to="${demo}" data-label="${demoLabel}">${demoLabel}</button>`);
    }
    if (!self && a.role !== 'owner') acts.push(a.disabled
      ? `<button class="btn sec" data-en="${esc(a.uid)}">Reactivate</button>`
      : `<button class="btn bad" data-dis="${esc(a.uid)}">Disable</button>`);
    const nm = a.displayName || nameByUid[a.uid] || '—';
    const status = a.disabled ? '<span class="pill ENDED">Disabled</span>' : '<span class="pill ACTIVE">Active</span>';
    return `<tr><td><div class="acct"><b>${esc(nm)}</b><span>${esc(a.email)}</span></div></td><td>${rolePill(a.role)}</td><td>${status}${self ? ' <span class="you-tag">you</span>' : ''}</td><td class="acct-actions">${acts.join(' ') || '<span class="muted-dash">—</span>'}</td></tr>`;
  }).join('');

  host.innerHTML = `
    <div class="owner-layout">
      <div class="owner-main">
        <div class="don-bar"><h2 style="font-size:1.05rem;margin:0">Accounts <span class="count-chip">${accounts.length}</span></h2><button class="btn sec" id="acctRefresh">Refresh</button></div>
        <div class="don-table"><table><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="empty">No accounts.</td></tr>'}</tbody></table></div>
        <p class="owner-hint">Promote: student → admin → owner. Demoting an admin restores their active student membership when one exists; otherwise it removes the staff role. Disable blocks sign-in + ends sessions immediately. You can't change or disable your own account, and an owner can't be disabled here.</p>
      </div>
      <aside class="owner-side">
        <div class="owner-card ${locked ? 'lock-on' : ''}">
          <h3>System lockdown</h3>
          <p>Block all non-owner access (students + admins) across the app and the Cloud Functions. The owner stays exempt to recover.</p>
          <div class="owner-status ${locked ? 'on' : 'off'}">${locked ? 'LOCKDOWN ACTIVE' : 'Normal operation'}</div>
          <label for="lockReason">Reason (optional)</label>
          <input id="lockReason" type="text" value="${esc(reason)}" placeholder="e.g. investigating a breach" />
          <div class="actions" style="margin-top:12px">${locked ? '<button class="btn" id="lockOff">Lift lockdown</button>' : '<button class="btn bad" id="lockOn">Enable lockdown</button>'}</div>
        </div>
      </aside>
    </div>`;

  $('acctRefresh').onclick = () => renderOwnerView();
  if ($('lockOn')) $('lockOn').onclick = () => setLockdown(true, $('lockReason').value.trim());
  if ($('lockOff')) $('lockOff').onclick = () => setLockdown(false, $('lockReason').value.trim());
  host.querySelectorAll('button[data-prom]').forEach((b) => { b.onclick = () => changeRole(b.dataset.prom, b.dataset.to, 'Promote'); });
  host.querySelectorAll('button[data-demo]').forEach((b) => { b.onclick = () => changeRole(b.dataset.demo, b.dataset.to, b.dataset.label || 'Demote'); });
  host.querySelectorAll('button[data-dis]').forEach((b) => { b.onclick = () => acctSetDisabled(b.dataset.dis, true); });
  host.querySelectorAll('button[data-en]').forEach((b) => { b.onclick = () => acctSetDisabled(b.dataset.en, false); });
}
const rolePill = (r) => `<span class="role-pill ${r || 'user'}">${esc(r || 'user')}</span>`;
async function changeRole(uid, to, label) {
  const destination = label === 'Restore student' ? 'student' : (to === 'none' ? 'no staff role' : to);
  if (!confirm(`${label} this account to "${destination}"?`)) return;
  try { await call('setRole', { uid, role: to }); toast('Role updated'); await renderOwnerView(); }
  catch (e) { toast('Role change failed: ' + (e.code || e.message)); }
}
async function acctSetDisabled(uid, disable) {
  if (disable && !confirm('Disable this account? They are signed out immediately and cannot sign back in until re-enabled.')) return;
  try { await call(disable ? 'disableAccount' : 'enableAccount', { uid }); toast(disable ? 'Account disabled' : 'Account re-enabled'); await renderOwnerView(); await loadMembers(); }
  catch (e) { toast((disable ? 'Disable' : 'Enable') + ' failed: ' + (e.code || e.message)); }
}
async function disableMember(uid) {
  if (!confirm('Disable this member? They are signed out immediately and cannot sign back in until re-enabled.')) return;
  try { await call('disableAccount', { uid }); toast('Member disabled'); await loadMembers(); }
  catch (e) { toast('Disable failed: ' + (e.code || e.message)); }
}
async function reactivateMember(uid) {
  if (!confirm('Reactivate this member account? They will be able to sign in again if their access window is still active.')) return;
  try {
    const result = await call('enableAccount', { uid });
    toast(result.memberStatus === 'ACTIVE'
      ? 'Member reactivated'
      : 'Account re-enabled, but access is expired. Extend access to reactivate learning.');
    await loadMembers();
  } catch (e) { toast('Reactivate failed: ' + (e.code || e.message)); }
}
async function refreshDonations(btn) {
  const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Syncing…';
  try {
    const r = await httpsCallable(functions, 'syncDonations')();
    toast(`Synced ${r.data?.synced ?? 0} donations`);
    await renderDonationsView();
  } catch (e) { toast('Sync failed: ' + (e.code || e.message)); btn.disabled = false; btn.textContent = orig; }
}
async function renderDonationsView() {
  const host = $('donationsView');
  host.innerHTML = '<div class="empty">Loading donations…</div>';
  let rows = [];
  try { rows = (await getDocs(collection(db, 'donations'))).docs.map((d) => d.data()); }
  catch (e) { host.innerHTML = `<div class="empty">Could not load donations (${esc(e.code || e.message)}).</div>`; return; }
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
  // Campaign name comes from the synced campaigns collection, so it shows even with 0 donations.
  let campName = rows.find((r) => r.campaignName)?.campaignName;
  if (!campName) {
    try {
      const cs = (await getDocs(collection(db, 'campaigns'))).docs.map((d) => d.data());
      campName = cs.map((c) => c.title).filter(Boolean).join(', ');
    } catch { /* keep empty */ }
  }
  campName = campName || '—';

  host.innerHTML = `
    <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi mint"><div class="n">${donors}</div><div class="l">Total donors</div></div>
      <div class="kpi"><div class="n">${money(campTotal)}</div><div class="l">Total donations</div></div>
      <div class="kpi teal"><div class="n" style="font-size:1.05rem;line-height:1.2">${esc(campName)}</div><div class="l">Campaign</div></div>
    </div>
    <div class="don-bar"><h2 style="font-size:1.05rem;margin:0">All donations</h2><button class="btn btn-purple" id="donRefresh">Refresh</button></div>
    <div class="don-table" id="donTableWrap"></div>`;
  $('donRefresh').onclick = (e) => refreshDonations(e.currentTarget);

  const state = { sortKey: 'created', sortDir: -1, filters: {} };
  function renderBody() {
    const v = rows.filter((r) => cols.every(([k]) => { const f = (state.filters[k] || '').toLowerCase(); return !f || String(fnOf(k)(r)).toLowerCase().includes(f); }));
    v.sort((a, b) => { const A = valOf(a, state.sortKey), B = valOf(b, state.sortKey); return (A > B ? 1 : A < B ? -1 : 0) * state.sortDir; });
    $('donBody').innerHTML = v.length
      ? v.map((r) => `<tr>${cols.map(([, , fn]) => `<td>${esc(fn(r))}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="empty">No donations${rows.length ? ' match the filters' : ' yet — hit Refresh to sync from Zeffy'}.</td></tr>`;
  }
  function renderHead() {
    const head = cols.map(([k, label]) => `<th data-sort="${k}">${label}${state.sortKey === k ? (state.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
    const filt = cols.map(([k]) => `<th><input class="cfg-input donfilter" data-f="${k}" value="${esc(state.filters[k] || '')}" placeholder="filter"></th>`).join('');
    $('donTableWrap').innerHTML = `<table><thead><tr>${head}</tr><tr class="don-filterrow">${filt}</tr></thead><tbody id="donBody"></tbody></table>`;
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
      await call('updateSettings', { zeffyUrl, calComUrl });
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
