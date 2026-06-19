# Student App Vibrant Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin and re-lay-out the student app (`demo/public/app.html`) into a bold, vibrant-gradient design while preserving every behavior, the API contract, and server-side gating.

**Architecture:** `app.html` is a single self-contained file: a `<style>` block, a static DOM shell (`#login`, `#app` with topbar/sidebar/main), and a `<script type="module">` that fetches `/api/v1/app/profile` + `/app/path` and renders via `renderPath(v)` and helpers. This redesign changes **only** the `<style>` tokens/components and the HTML strings the renderers emit. All data flow, hash routing, the submit/gating logic, and the menu logic stay byte-for-byte where possible. The DOM-id contract (`#sbBar`, `#stats`, `#continueWrap`, `#pathway`, `#stageDetailWrap`, `#ladder`, `#pathTree`, etc.) is preserved so the JS keeps working.

**Tech Stack:** Plain HTML5 + embedded CSS + ES-module JS. No frameworks/build. Google Fonts (Space Grotesk + Inter). Express static serving (`src/app.mjs`). Tests: `node --test` (API-level, 43 tests).

**Visual + CSS source of truth:** the approved mockup at `docs/superpowers/specs/redesign-mockup-student-dashboard.html`. Copy CSS blocks and innerHTML templates from there verbatim; this plan embeds the critical ones inline.

**Design spec:** `docs/superpowers/specs/2026-06-19-student-app-vibrant-redesign-design.md`.

## Global Constraints

- Single file only — no new CSS/JS assets, no frameworks, no build step (V1 house style; ADR-003).
- Preserve all element `id`s the script references; preserve `alt`, `aria-*`, focus styles.
- Preserve server-side gating: UI reflects `state` from the server; never compute eligibility client-side. Do not touch `src/`, `test/`, or any API route.
- Canvas: pure white `#ffffff`. Hero gradient = Electric Twilight `linear-gradient(135deg,#1e1b4b,#4c1d95,#6d28d9,#c026d3)`.
- Color system: **purple (`--grad-accent` `#6d28d9→#c026d3`) = brand / nav-active**; **teal (`--teal` `#0ea5b7`) = "where you are"** (current stage label, current-week fraction, selected day/milestone, current journey node, live ladder rung). Done = mint `#22d3a8`. Locked text ≥ `#7a6c95` (WCAG AA).
- Fonts: Space Grotesk (500–700) for headings + big numbers; Inter (400–800) for body/UI.
- All animation (pulse/glow/bar-fill) wrapped in `@media (prefers-reduced-motion: no-preference)`.
- Keep section comments (`<!-- === HERO === -->` style) in markup and `/* ===== HERO ===== */` in CSS.
- Existing tests must stay green (43 pass); HTML must validate (`xmllint --noout --html`).

---

### Task 0: Restore the corrupted working copy and establish baseline

**Why:** `demo/public/app.html` in the working tree is truncated (443 lines, ends mid-statement, no `</html>`). HEAD has the intact 673-line file. All later tasks edit the restored file.

**Files:**
- Restore: `demo/public/app.html` (from HEAD)

- [ ] **Step 1: Confirm the working copy is broken**

Run: `cd demo && tail -n 2 public/app.html`
Expected: output ends mid-line at `<div class="lbl"` with NO `</script></body></html>`.

- [ ] **Step 2: Restore the file from HEAD**

Run: `cd demo && git checkout HEAD -- public/app.html`

- [ ] **Step 3: Verify restoration**

Run: `cd demo && wc -l public/app.html && grep -c "</html>" public/app.html`
Expected: `673` lines and `1` match for `</html>`.

- [ ] **Step 4: Verify HTML validity baseline**

Run: `cd demo && xmllint --noout --html public/app.html 2>&1 | grep -i "EntityRef\|expecting" || echo "no entity errors"`
Expected: `no entity errors` (the only notices, if any, are `Tag header/aside/main/section invalid` — HTML5 false positives from xmllint's HTML4 DTD; ignore them).

- [ ] **Step 5: Verify tests pass baseline**

Run: `cd demo && npm test 2>&1 | tail -n 5`
Expected: `# pass 43` (or the project's current count) and `# fail 0`. If DynamoDB-local is required and not up, run `npm run cloud:up && npm run db:reset && npm run db:seed` first.

- [ ] **Step 6: Commit the restore**

```bash
cd demo && git add public/app.html && git commit -m "fix: restore truncated student app.html from HEAD before redesign"
```

---

### Task 1: Design tokens, fonts, and global base

**Files:**
- Modify: `demo/public/app.html` — the `<head>` (add font links) and the `:root` + base rules at the top of `<style>`.

**Interfaces:**
- Produces: CSS custom properties `--grad-hero`, `--grad-accent`, `--grad-teal`, `--grad-mint`, `--teal`, `--teal-dark`, `--teal-soft`, `--magenta`, `--mint`, `--coral`, `--gold`, `--canvas`, `--ink`, `--muted`, `--line`, `--font-head`, `--font-body`, radii `--r/--r-lg/--r-pill`, `--sidebar`, shadows `--sh/--sh-lg`. Later tasks consume these.

- [ ] **Step 1: Add Google Fonts to `<head>`** (after the `<title>`, before `<style>`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&amp;family=Inter:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet">
```
Note: the `&amp;` entities are required for HTML validity.

- [ ] **Step 2: Replace the `:root` token block** with the redesign tokens (copy verbatim from the mockup's `:root`):

```css
:root{
  --p-dark:#3a006b; --p:#6a0dad; --p-bright:#8b1ad1; --magenta:#c026d3; --violet:#7c3aed;
  --lav:#b19cd9; --lav-soft:#efe7fb; --mint:#22d3a8; --coral:#ff5d73; --gold:#ffc24b;
  --teal:#0ea5b7; --teal-dark:#0c7d8c; --teal-soft:#e2f7fa;
  --ink:#1c1130; --muted:#6b5b86; --line:#eee9f4; --canvas:#ffffff; --white:#fff;
  --grad-hero:linear-gradient(135deg,#1e1b4b 0%,#4c1d95 45%,#6d28d9 75%,#c026d3 100%);
  --grad-accent:linear-gradient(135deg,#6d28d9,#c026d3);
  --grad-mint:linear-gradient(135deg,#10b981,#22d3a8);
  --grad-teal:linear-gradient(135deg,#0c7d8c,#0ea5b7);
  --font-head:'Space Grotesk','Inter',system-ui,sans-serif;
  --font-body:'Inter',system-ui,'Segoe UI',Arial,sans-serif;
  --r:16px; --r-lg:24px; --r-pill:999px; --sidebar:268px;
  --sh:0 10px 30px rgba(76,5,124,.08); --sh-lg:0 24px 60px rgba(76,5,124,.20);
}
```
Keep the legacy `--cfg-*` vars only if other rules still reference them; otherwise migrate those rules to the new names in the task that owns them.

- [ ] **Step 3: Set base typography + canvas**

```css
body{margin:0;font-family:var(--font-body);color:var(--ink);background:var(--canvas);-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{margin:0;font-family:var(--font-head);line-height:1.1;font-weight:700;letter-spacing:-.02em}
```

- [ ] **Step 4: Add the reduced-motion wrapper convention**

At the end of `<style>` add (animations defined in later tasks must be gated; if any `animation:` is set unconditionally, neutralize it here):
```css
@media (prefers-reduced-motion: reduce){
  *{animation:none !important; transition:none !important;}
}
```

- [ ] **Step 5: Verify validity + serve**

Run: `cd demo && xmllint --noout --html public/app.html 2>&1 | grep -i "EntityRef\|expecting" || echo "clean"`
Expected: `clean`.
Run: `cd demo && grep -c "Space+Grotesk" public/app.html` → Expected: `1`.

- [ ] **Step 6: Commit**

```bash
cd demo && git add public/app.html && git commit -m "feat(app): add redesign tokens, fonts, white canvas, reduced-motion gate"
```

---

### Task 2: Glassy top bar + progress ring

**Files:**
- Modify: `demo/public/app.html` — `.topbar` CSS section and the `<header class="topbar">` markup; add a progress-ring element.

**Interfaces:**
- Consumes: `--grad-accent`, `--grad-hero`, `--line`, `--magenta` (Task 1).
- Produces: a `#progressRing` element styled by `--v` custom property; `boot()`/`renderPath()` will set `--v`.

- [ ] **Step 1: Replace the topbar CSS** with the glassy bar + ring + avatar styles. Copy the `/* ===== GLASSY TOP BAR ===== */` block from the mockup (`.appbar`, `.brand`, `.brand .mark`, `.menu`, `.ring`, `.ava`, `.who`, `.ghost`). Map class names to the existing markup: the existing header uses `.topbar`, `.brand`, `.menu-btn`, `.avatar`, `.user .name`, `.linkbtn`. Either (a) rename existing classes to the mockup's, or (b) re-point the mockup CSS to the existing class names. Choose (b) to minimize JS/markup churn — keep ids `menuBtn`, `avatar`, `userName`, `logoutBtn`.

- [ ] **Step 2: Add the progress ring** to `.topbar-right`, before `.user`:

```html
<div class="ring" id="progressRing" style="--v:0" aria-hidden="true"><b id="ringPct">0%</b></div>
```
With CSS:
```css
.ring{--v:0;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--magenta) calc(var(--v)*1%), #ece3fb 0);position:relative}
.ring::after{content:'';position:absolute;inset:4px;border-radius:50%;background:#fff}
.ring b{position:relative;font-size:.64rem;font-weight:800;color:var(--p-dark);font-family:var(--font-head)}
```

- [ ] **Step 3: Drive the ring from data.** In `renderPath(v)`, where `#sbBar` is set, also add:

```js
const ring = document.getElementById('progressRing');
if (ring){ ring.style.setProperty('--v', v.progressPct); document.getElementById('ringPct').textContent = v.progressPct + '%'; }
```

- [ ] **Step 4: Verify**

Run: `cd demo && xmllint --noout --html public/app.html 2>&1 | grep -i "EntityRef\|expecting" || echo clean` → Expected: `clean`.
Manual: start the server (`npm start`), log in as `student@codeforgood.us` / `student1234`, confirm the top bar is glassy white with a working magenta progress ring.

- [ ] **Step 5: Commit**

```bash
cd demo && git add public/app.html && git commit -m "feat(app): glassy top bar with live progress ring"
```

---

### Task 3: Restyled sidebar — gradient progress card + teal current-state accordion

**Files:**
- Modify: `demo/public/app.html` — `.sidebar`, `.sb-progress`/`.sb-prog`, `.nav-*`/`.acc*`/`.milestones` CSS; the sidebar markup; and the accordion strings in `renderPath`.

**Interfaces:**
- Consumes: `--grad-hero`, `--grad-accent`, `--grad-teal`, `--teal`, `--teal-dark`, `--teal-soft`, `--mint` (Task 1).
- Preserves ids: `#sbPct`, `#sbBar`, `#sbSub`, `#pathTree`, `#pathNavLabel`, `#logoutNav`, `#sidebar`, `#sidebarBackdrop`; classes `.acc.lvl2`, `.acc-head`, `.acc-body`, `.acc-inner`, `.milestones`, `.frac`, `data-stage-key`, `data-open` (consumed by `wireAccordions`, `renderPath`).

- [ ] **Step 1: Replace the sidebar progress meter** CSS+markup with the gradient progress card. Copy `.sidebar`, `.sb-prog*` from the mockup. Update the markup `<div class="sb-progress">…` to the `.sb-prog` structure but KEEP ids `sbPct`/`sbBar`/`sbSub`. Example markup:

```html
<div class="sb-prog">
  <div class="lab">Path progress</div>
  <div class="big"><span id="sbPct">0%</span></div>
  <div class="track"><span id="sbBar" style="width:0%"></span></div>
  <div class="sub" id="sbSub">0 of 0 stages complete</div>
</div>
```

- [ ] **Step 2: Restyle nav + accordion** with the teal current-state system. Copy `.nav`, `.nav.active`, `.acc`, `.acc-h`/`.acc-head`, `.acc.done/.current/.locked`, `.frac`, `.ms`/`.milestones`, `.ms li.sel`/`.milestones li.selected` from the mockup. Critical mappings:
  - `.nav.active{background:var(--grad-accent);color:#fff}` (purple = nav-active)
  - `.acc.current .acc-head{color:var(--teal-dark)}` and `.acc.current .frac{color:#fff;background:var(--teal)}`
  - selected milestone (existing class is `.selected`, mockup uses `.sel`): `#pathTree .milestones li.selected{background:var(--teal);color:#fff;font-weight:700;box-shadow:0 6px 16px rgba(12,125,140,.28)}` and `.milestones li.selected .dot{background:#fff;border-color:#fff}`
  - done milestone dot mint; locked text `#b3a6cd`→ darken to ≥`#7a6c95` if it fails contrast.

- [ ] **Step 3: Keep the accordion markup classes** emitted by `renderPath` unchanged (`acc lvl2`, `acc-head`, `acc-body`, `acc-inner`, `milestones`, `frac`, `selected`). Only the CSS changes. Confirm `wireAccordions()` still selects `#pathTree .acc.lvl2 > .acc-head`.

- [ ] **Step 4: Verify**

Run: `cd demo && grep -n "milestones li.selected{background:var(--teal)" public/app.html` → Expected: 1 match.
Run: `cd demo && xmllint --noout --html public/app.html 2>&1 | grep -i "EntityRef\|expecting" || echo clean` → `clean`.
Manual: log in (both `student@…` Fast Track and `roadmap@…` Roadmap); confirm current stage label + fraction are teal, selected day is a solid teal pill, Dashboard nav is purple, accordion expand/collapse works, mobile drawer (≤820px) opens with backdrop + Escape.

- [ ] **Step 5: Commit**

```bash
cd demo && git add public/app.html && git commit -m "feat(app): restyle sidebar — gradient progress card + teal current-state"
```

---

### Task 4: Hero — "Your next move" (Electric Twilight)

**Files:**
- Modify: `demo/public/app.html` — add `/* ===== HERO ===== */` CSS; rewrite the `#continueWrap` innerHTML in `renderPath` (the "continue card (current active stage)" block) into the hero; optionally relocate the page-head/access-chip.

**Interfaces:**
- Consumes: `v.activeStage` (`{stageKey,title,description,weekKey}`), `v.stages`, `v.progressPct`, `v.completed`, `v.total`, `unitLabel`; `openStage(stageKey)`; `requirementsFor(stage)` for the checklist.
- Preserves: `#continueWrap` container id; the `openActiveStage` click → `openStage(active.stageKey)` behavior; the access-expired branch in `boot()` that writes to `#continueWrap`.

- [ ] **Step 1: Add hero CSS.** Copy the `/* ===== HERO ===== */` block from the mockup (`.hero`, `.hero::before/::after`, `.hero-grid`, `.eyebrow`, `.eyebrow .pulse`, `@keyframes pulse`, `.hero h1`, `.where`, `.hbar`, `.hpct`, `.cta`, `.btn`, `.btn-glow`, `.btn-ghost`, `.hero-side`, `.chk`). Ensure `@keyframes pulse` usage on `.eyebrow .pulse` is inside a `@media (prefers-reduced-motion: no-preference)` block OR rely on the global reduce gate from Task 1.

- [ ] **Step 2: Rewrite the active-stage branch** of `renderPath` to emit the hero into `#continueWrap`. Keep the `else` (path complete) and the `boot()` access-expired branch intact. Replace the `$('continueWrap').innerHTML = \`<div class="card continue">…\`` with:

```js
const active = v.activeStage;
if (active) {
  const week = active.weekKey ? v.stages.find((s) => s.stageKey === active.weekKey) : null;
  const title = week ? week.title : active.title;
  const detail = week ? `${active.title}: ${active.description}` : (active.description || 'Complete this stage to unlock the next.');
  const reqs = requirementsFor(active).slice(0, 3);
  const checklist = reqs.map((r) => `<div class="chk"><i></i><span>${esc(r)}</span></div>`).join('');
  $('continueWrap').innerHTML = `<section class="hero">
    <div class="hero-grid">
      <div>
        <span class="eyebrow"><span class="pulse"></span> Your next move</span>
        <h1>${esc(title)}</h1>
        <p class="where">${esc(detail)}</p>
        <div class="hbar"><span style="width:${v.progressPct}%"></span></div>
        <div class="hpct"><span>${v.progressPct}% complete</span><span>${v.completed}/${v.total} ${unitLabel}</span></div>
        <div class="cta">
          <button class="btn btn-glow" id="openActiveStage" type="button">Open ${esc(active.title)} ${icoArrow()}</button>
        </div>
      </div>
      <div class="hero-side">
        <h4>What to complete</h4>
        ${checklist || '<div class="chk"><i></i><span>Open the stage to see requirements</span></div>'}
      </div>
    </div>
  </section>`;
  $('openActiveStage').onclick = () => openStage(active.stageKey);
} else {
  $('continueWrap').innerHTML = `<section class="hero"><div class="hero-grid"><div><span class="eyebrow">Path complete</span><h1>You've completed every stage</h1><p class="where">All ${v.total} stages done — keep building and shipping.</p></div></div></section>`;
}
```
Note: the `btn-white`/`btn-purple` classes from the old card are replaced by `btn-glow`. If `renderStageDetail` still references `.btn-purple`/`.btn-white`, retain those rules (they style the stage submit button) — only the hero CTA changes.

- [ ] **Step 3: Restyle the access-expired message** (in `boot()`) to sit on a hero-style panel so the expired state still looks intentional (optional; keep copy identical).

- [ ] **Step 4: Verify**

Run: `cd demo && grep -c "class=\"hero\"" public/app.html` → Expected: ≥1.
Manual: log in as Fast Track — hero shows the active day's title, Electric Twilight gradient, working "Open …" button that scrolls to the stage detail; checklist shows up to 3 requirements. Submit a deliverable on the stage page; confirm the stage completes, next unlocks, hero re-renders to the new active stage (server-driven).

- [ ] **Step 5: Commit**

```bash
cd demo && git add public/app.html && git commit -m "feat(app): dominant Electric Twilight hero for the active stage"
```

---

### Task 5: Momentum chips (restyle stats)

**Files:**
- Modify: `demo/public/app.html` — `.stats`/`.stat` CSS → chips; the `#stats` innerHTML array in `renderPath`.

**Interfaces:**
- Consumes: `v.progressPct`, `v.completed`, `v.total`, `deliverables` count, `trackLabel`, `unitLabel`; `--grad-accent`, `--grad-mint`, `--gold`, `--coral`.
- Preserves: `#stats` container id.

- [ ] **Step 1: Add chips CSS.** Copy `/* ===== MOMENTUM CHIPS ===== */` (`.strip`, `.chip`, `.chip::before`, `.chip.mint/.gold/.coral`, `.chip .k/.v/.s`) from the mockup. Apply the `.strip` grid to the existing `#stats` element (either add `class="strip"` to `#stats` or alias `.stats{...}` to the chip grid).

- [ ] **Step 2: Rewrite the `#stats` innerHTML** to emit chips. Keep the same four metrics; drop the inline SVG icons in favor of the chip layout (or keep a small glyph). Streak is presentational and has no backing field — OMIT it (per spec §6) and keep the four existing metrics:

```js
$('stats').innerHTML = `
  <div class="chip"><div class="k">Readiness</div><div class="v">${v.progressPct}%</div><div class="s">path readiness</div></div>
  <div class="chip mint"><div class="k">${v.pathKey==='B_fast_track'?'Days':'Stages'}</div><div class="v">${v.completed}/${v.total}</div><div class="s">complete</div></div>
  <div class="chip gold"><div class="k">Deliverables</div><div class="v">${deliverables}</div><div class="s">submitted</div></div>
  <div class="chip coral"><div class="k">Track</div><div class="v" style="font-size:1.3rem;-webkit-text-fill-color:initial;background:none;color:var(--coral)">${esc(trackLabel)}</div><div class="s">your path</div></div>`;
```
Keep `#stats` empty-on-expired behavior intact (boot() sets `$('stats').innerHTML=''`).

- [ ] **Step 3: Verify**

Run: `cd demo && grep -c "class=\"chip" public/app.html` → Expected: ≥1.
Manual: chips show with gradient left-rails and gradient numbers; Readiness/Deliverables update after a submit.

- [ ] **Step 4: Commit**

```bash
cd demo && git add public/app.html && git commit -m "feat(app): momentum chips replace boxed stats"
```

---

### Task 6: Journey (restyle pathway grid, teal current node)

**Files:**
- Modify: `demo/public/app.html` — `.pillars`/`.pcard`/`.week-card`/`.day-card` CSS → journey nodes; `renderWeeks` and `renderStageCards` innerHTML.

**Interfaces:**
- Consumes: `v.stages` (with `state`, `order`, `title`, `days[]`), `cardClass(state)`, `shortTitle(t)`, `stageKeyFromHash()`, `wireStageLinks()`, `data-stage`; `--grad-mint`, `--grad-teal`, `--teal`.
- Preserves: `#pathway` id; `data-stage`/`data-state` attributes (consumed by `wireStageLinks`/`openStage`/`updateSelectedStage`); the day-drill buttons remain clickable.

- [ ] **Step 1: Add journey CSS.** Copy `/* ===== JOURNEY ===== */` (`.journey`, `.node`, `.node .badge`, `.node.done/.current/.locked`, `@keyframes glow`, `.node h4/.state/.lk`) from the mockup. Map: `.node.current .badge{background:var(--grad-teal)}`, `.node.current{border-color:var(--teal)}`, `.node.done .badge{background:var(--grad-mint)}`. Apply `.journey` grid to `#pathway` (the renderer sets `#pathway.className`; update that line to use `journey` and a roadmap/fasttrack modifier, OR add `.journey` styles to the existing `.pillars` classes).

- [ ] **Step 2: Rewrite `renderStageCards`** (8-pillar roadmap) to emit nodes:

```js
function renderStageCards(stages) {
  return stages.map((s) => {
    const cls = cardClass(s.state); // done|current|locked
    const label = s.state === 'complete' ? 'Complete' : s.state === 'active' ? 'In progress' : 'Locked';
    const lock = s.state === 'locked' ? `<i class="lk">${icoLock()}</i>` : '';
    const badge = s.state === 'complete' ? '✓' : String(s.order);
    return `<div class="node ${cls}" data-stage="${esc(s.stageKey)}" data-state="${esc(s.state)}">${lock}<div class="badge">${badge}</div><div class="state">${label}</div><h4>${esc(shortTitle(s.title))}</h4></div>`;
  }).join('');
}
```

- [ ] **Step 3: Rewrite `renderWeeks`** (Fast Track) to emit week nodes that still expose each day as a clickable `data-stage` control (drill-down must survive). Keep the day buttons inside the node:

```js
function renderWeeks(weeks) {
  return weeks.map((w) => {
    const cls = cardClass(w.state);
    const label = w.state === 'complete' ? 'Complete' : w.state === 'active' ? 'In progress' : 'Locked';
    const badge = w.state === 'complete' ? '✓' : String(w.order);
    const days = w.days.map((d) => {
      const sel = d.stageKey === stageKeyFromHash() ? 'selected' : '';
      const st = d.state === 'complete' ? 'Done' : d.state === 'active' ? 'Open' : 'Locked';
      return `<button class="day-card ${d.state} ${sel}" type="button" data-stage="${esc(d.stageKey)}" data-state="${esc(d.state)}" ${d.state==='locked'?'aria-disabled="true"':''}><span>${esc(d.title)}</span><span class="state">${st}</span></button>`;
    }).join('');
    return `<div class="node ${cls}"><div class="badge">${badge}</div><div class="state">${label} · ${w.completed}/${w.total} days</div><h4>${esc(shortTitle(w.title))}</h4><div class="day-list">${days}</div></div>`;
  }).join('');
}
```
Restyle `.day-card`/`.day-card.selected` so the selected day uses teal (`background:var(--teal);color:#fff`), matching the "where you are" rule.

- [ ] **Step 4: Verify**

Run: `cd demo && grep -c "class=\"node" public/app.html` → Expected: ≥1.
Manual: Roadmap account shows 8 nodes (done=mint, current=teal glow, locked=ghost+lock). Fast Track shows 4 week nodes with clickable days; clicking a day opens the stage detail and marks the day teal; locked day shows toast.

- [ ] **Step 5: Commit**

```bash
cd demo && git add public/app.html && git commit -m "feat(app): journey nodes replace pathway grid (teal current marker)"
```

---

### Task 7: Earn-while-you-learn ladder (ascending rungs)

**Files:**
- Modify: `demo/public/app.html` — `.ladder`/`.rung` CSS; `renderLadder(pct)` innerHTML.

**Interfaces:**
- Consumes: `pct`; `--grad-accent`, `--teal`, `--teal-dark`, `--mint`.
- Preserves: `#ladder` id; `renderLadder(v.progressPct)` call site.

- [ ] **Step 1: Add ladder CSS.** Copy `/* ===== LADDER ===== */` (`.ladder`, `.rung`, `.rung .tier/.amt/.d`, `.rung.r1..r4` offsets, `.rung.live`) from the mockup. `.rung.live` uses teal ("you are here").

- [ ] **Step 2: Rewrite `renderLadder`** to emit ascending rungs and mark the current rung `live` (teal):

```js
function renderLadder(pct) {
  const rungs = [['Rung 1','$0–50','First micro-gig'],['Rung 2','$50–200','Repeat freelance briefs'],['Rung 3','$200–500','Micro-internship stipend'],['Rung 4','$500–1.5k','Contract project work'],['Rung 5','Hired','Entry STEM role']];
  const reached = Math.min(rungs.length - 1, Math.round((pct/100) * rungs.length));
  $('ladder').innerHTML = rungs.map((r,i) => {
    const live = i === reached ? 'live' : '';
    const tier = i === reached ? 'You are here' : r[0];
    const off = i < 4 ? `r${i+1}` : '';
    return `<div class="rung ${off} ${live}"><div class="tier">${esc(tier)}</div><div class="amt">${esc(r[1])}</div><div class="d">${esc(r[2])}</div></div>`;
  }).join('');
}
```

- [ ] **Step 3: Verify**

Run: `cd demo && grep -c "class=\"rung" public/app.html` → Expected: ≥1.
Manual: ladder renders 5 ascending rungs; the rung matching progress is teal and labeled "You are here".

- [ ] **Step 4: Commit**

```bash
cd demo && git add public/app.html && git commit -m "feat(app): restyle earn-while-you-learn ladder with teal you-are-here"
```

---

### Task 8: Login card restyle

**Files:**
- Modify: `demo/public/app.html` — `.login-wrap`/`.login-card` CSS and the `#login` markup; keep ids `email`, `password`, `loginBtn`, `loginMsg`, `fillFastBtn`, `fillRoadmapBtn`.

**Interfaces:**
- Consumes: `--grad-accent`, `--grad-hero`, `--font-head`, `--canvas`.
- Preserves: all login ids and the demo-fill controls + presenter-note hint (from the 2026-06-17 audit fix).

- [ ] **Step 1: Restyle the login card** — gradient brand mark, Space Grotesk heading, gradient primary button (`#loginBtn`), subtle off-white fields on white canvas. Keep the two demo-fill buttons and the "keep credentials in presenter notes" hint.

- [ ] **Step 2: Verify**

Run: `cd demo && grep -c "id=\"fillFastBtn\"" public/app.html` → Expected: `1`.
Manual: sign-in screen matches the new identity; demo-fill buttons populate creds; sign-in works.

- [ ] **Step 3: Commit**

```bash
cd demo && git add public/app.html && git commit -m "feat(app): restyle login card to match redesign"
```

---

### Task 9: Accessibility & motion pass

**Files:**
- Modify: `demo/public/app.html` — focus styles, contrast tweaks, reduced-motion verification.

- [ ] **Step 1: Confirm reduced-motion** — every `animation:` (pulse, glow, hbar fill, sidebar transition) is neutralized under `@media (prefers-reduced-motion: reduce)` (the global gate from Task 1 covers `*`, but verify no `!important` animations escape it).

- [ ] **Step 2: Contrast** — verify gradient-text numbers (`-webkit-background-clip:text`) have a solid fallback color and that locked-state text is ≥ `#7a6c95` on white/`#fcfafe`. Adjust any value failing WCAG AA (4.5:1 for body text).

- [ ] **Step 3: Focus + keyboard** — ensure interactive elements (`.node[data-stage]` clickable cards, day buttons, nav items, accordion heads) are real buttons or have `tabindex`/`role` + visible `:focus-visible` outline. The journey `.node` for roadmap stages should be keyboard-activatable if clickable.

- [ ] **Step 4: Verify**

Run: `cd demo && grep -c "prefers-reduced-motion" public/app.html` → Expected: ≥1.
Manual: tab through the app; focus rings visible; emulate reduced-motion (DevTools → Rendering) and confirm animations stop.

- [ ] **Step 5: Commit**

```bash
cd demo && git add public/app.html && git commit -m "feat(app): accessibility + reduced-motion pass for redesign"
```

---

### Task 10: Full verification & sign-off

**Files:**
- No new edits unless a check fails.

- [ ] **Step 1: HTML validity**

Run: `cd demo && xmllint --noout --html public/app.html 2>&1 | grep -i "EntityRef\|expecting" || echo "VALID"`
Expected: `VALID` (ignore `Tag header/aside/main/section invalid` HTML5 false positives).

- [ ] **Step 2: Tests still green**

Run: `cd demo && npm test 2>&1 | tail -n 5`
Expected: `# pass 43`, `# fail 0` (start DynamoDB-local + seed first if needed).

- [ ] **Step 3: End-to-end student flow, both tracks** (manual against `npm start`)
  - Fast Track (`student@codeforgood.us`): hero shows active day, submit a valid URL → toast "Stage complete - next unlocked", progress ring + chips + journey + ladder all update; selected day is teal.
  - Roadmap (`roadmap@codeforgood.us`): 8 journey nodes, current = teal, submit advances.
  - Expired account (if seeded): shows access-ended state, no hero CTA.

- [ ] **Step 4: Responsive** — at ≤820px the sidebar is an off-canvas drawer (menu button + backdrop + Escape close), hero CTA visible in first viewport, no header wrap. At ≤560px chips/journey stack to one column.

- [ ] **Step 5: Parity check** — open `docs/superpowers/specs/redesign-mockup-student-dashboard.html` beside the live app; confirm the live app matches the mockup's identity (Electric Twilight hero, teal current-state, purple nav-active, fonts).

- [ ] **Step 6: Requirements checklist vs. spec §8** — re-read the design spec's acceptance criteria 1–8 and confirm each is met; note any gap.

- [ ] **Step 7: Final commit / branch wrap**

```bash
cd demo && git add public/app.html && git commit -m "chore(app): vibrant redesign verification pass complete"
```
Then use superpowers:finishing-a-development-branch to decide merge/PR.

---

## Notes for the executor

- Tasks are **sequential** — they all edit one file (`app.html`); do NOT parallelize.
- The mockup (`docs/superpowers/specs/redesign-mockup-student-dashboard.html`) is the CSS/visual source of truth — copy blocks from it rather than re-deriving.
- If a token/class rename ripples (e.g., legacy `--cfg-*`), fix all references within the same task so the file is always valid and serveable after each commit.
- Never change `src/`, `test/`, or API routes. The UI only reflects server state.
