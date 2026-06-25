// App shell (V2 design): top bar + fixed sidebar (progress widget + path accordion + nav).
// Renders into rootEl and returns the <main> element for the screen to fill. Generic over
// the path tree so the same shell serves dashboard / progress / profile screens.
import './theme.css';
import { svg } from './icons.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// tree: { label, pct, done, total, groups: [{ name, done, total, items:[{text, state}] }] }
function accordionHtml(tree) {
  let rows = '';
  tree.groups.forEach((g) => {
    const allDone = g.total > 0 && g.done === g.total;
    rows += `<div class="acc lvl2${allDone ? ' done' : ''}" data-open="false">`
      + `<button class="acc-head" type="button">${esc(g.name)}`
      + `<span class="frac">${g.done}/${g.total}</span>${svg('chev', 'chev', 14)}</button>`
      + `<div class="acc-body"><div class="acc-inner"><ul class="milestones">`
      + g.items.map((m) => `<li class="${m.state || ''}"><span class="dot"></span>${esc(m.text)}</li>`).join('')
      + `</ul></div></div></div>`;
  });
  return rows;
}

export function mountShell(rootEl, { user, tree, active = 'dashboard', onLogout, onNav }) {
  const initial = (user.name || user.email || '?').charAt(0).toUpperCase();
  rootEl.innerHTML = `
  <header class="topbar">
    <div style="display:flex;align-items:center;gap:14px;">
      <button class="menu-btn" id="menuBtn" aria-label="Toggle menu">${svg('menu', '', 20)}</button>
      <span class="brand"><img src="/codeforgood-logo.png" alt="Code For Good"
        onerror="this.style.display='none'"><span>Code For Good<small>STEM Career Path</small></span></span>
    </div>
    <div class="topbar-right">
      <div class="user"><div class="avatar">${esc(initial)}</div>
        <div class="name">${esc(user.name || user.email)}<small>Student · ${esc(user.accessBasis || 'member')}</small></div>
      </div>
    </div>
  </header>
  <div class="layout">
    <nav class="sidebar" id="sidebar">
      <div class="sb-progress">
        <div class="top"><span class="lab">${esc(tree.label)}</span><span class="pct">${tree.pct}%</span></div>
        <div class="track"><span style="width:${tree.pct}%"></span></div>
        <div class="sub">${tree.done} of ${tree.total} stages complete</div>
      </div>
      <button class="nav-item ${active === 'dashboard' ? 'active' : ''}" data-nav="dashboard">${svg('dashboard')}Dashboard</button>
      <div class="nav-section">Learn</div>
      <div class="acc" data-open="true">
        <button class="nav-item acc-head" type="button">${svg('grid')}${esc(tree.label)}${svg('chev', 'chev', 16)}</button>
        <div class="acc-body"><div class="acc-inner" id="pathTree">${accordionHtml(tree)}</div></div>
      </div>
      <div class="nav-section">Track</div>
      <button class="nav-item ${active === 'progress' ? 'active' : ''}" data-nav="progress">${svg('chart')}Progress</button>
      <button class="nav-item ${active === 'profile' ? 'active' : ''}" data-nav="profile">${svg('user')}Profile</button>
      <div class="sidebar-foot">
        <button class="nav-item" id="logoutBtn">${svg('logout')}Log out</button>
      </div>
    </nav>
    <main class="main" id="screen"></main>
  </div>`;

  const sidebar = rootEl.querySelector('#sidebar');
  // Accordion: one open at a time within a level.
  sidebar.addEventListener('click', (e) => {
    const head = e.target.closest('.acc-head');
    if (!head || !sidebar.contains(head)) return;
    e.preventDefault();
    const acc = head.parentElement;
    const open = acc.getAttribute('data-open') === 'true';
    Array.from(acc.parentElement.children).forEach((sib) => {
      if (sib !== acc && sib.classList?.contains('acc')) sib.setAttribute('data-open', 'false');
    });
    acc.setAttribute('data-open', open ? 'false' : 'true');
  });
  // Open the active lvl2 group.
  const activeGroup = sidebar.querySelector('#pathTree .acc.lvl2 .milestones li.active')?.closest('.acc.lvl2');
  if (activeGroup) activeGroup.setAttribute('data-open', 'true');

  rootEl.querySelector('#menuBtn').addEventListener('click', () => sidebar.classList.toggle('open'));
  rootEl.querySelector('#logoutBtn').addEventListener('click', () => onLogout && onLogout());
  if (onNav) sidebar.querySelectorAll('[data-nav]').forEach((b) =>
    b.addEventListener('click', () => onNav(b.getAttribute('data-nav'))));

  return rootEl.querySelector('#screen');
}
