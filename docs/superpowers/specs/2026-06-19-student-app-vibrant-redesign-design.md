# Student App Visual Redesign — Vibrant Gradient

**Status:** Draft (awaiting owner review)
**Date:** 2026-06-19
**Owner:** Tinh Cao
**Scope:** `demo/public/app.html` (student app only). Admin app, sign-in, and the V1 landing page are out of scope.
**Companion mockup:** `redesign-mockup-student-dashboard.html` (static, seeded — the approved visual reference).
**Relates to:** ADR-003 (mock-derived design system this replaces), the 2026-06-17 UI audit.

---

## 1. Goal

Replace the student app's current mock-derived look with a **bold, energetic, vibrant-gradient** identity and a **re-laid-out** dashboard that makes the single next action unmissable. This is a visual + layout change only. The backend, API contract, server-side gating, and tests do **not** change — the UI continues to *reflect* server state, never decide it.

## 2. Direction (locked with owner)

```csv
decision,choice
aesthetic,Bold & energetic — hero gradient "Electric Twilight" (midnight indigo→violet→magenta; premium/deep), glow accents, motion
layout,Full re-layout of the main column; restyled sidebar KEPT for stage navigation
canvas,Pure white (#ffffff) so gradient elements pop
top bar,Glassy — translucent white with backdrop blur (unchanged structure, restyled)
active sidebar entry,Solid teal pill (NOT purple-on-light-purple) — distinct from purple brand nav
type,Space Grotesk (headings + big numbers) + Inter (body) via Google Fonts
surfaces in scope,topbar · sidebar · hero · momentum chips · journey · ladder · login card
```

## 3. Design tokens (new)

Add a vibrant layer on top of the existing CFG palette. Keep the canonical CFG vars from `CLAUDE.md`; introduce gradient + accent tokens.

```csv
token,value,use
--canvas,#ffffff,page background (pure white)
--p,#6a0dad,core CFG purple (unchanged) — brand/nav-active
--magenta,#c026d3,energy accent / journey current-state
--violet,#6d28d9,mid gradient stop
--mint,#22d3a8,done/success
--coral,#ff5d73,track accent
--gold,#ffc24b,progress-fill highlight
--teal,#0ea5b7,active/selected SIDEBAR entry (current stage + selected milestone)
--teal-dark,#0c7d8c,teal text / current-week label
--teal-soft,#e2f7fa,sidebar milestone hover
--grad-hero,"linear-gradient(135deg,#1e1b4b,#4c1d95,#6d28d9,#c026d3)",hero + sidebar progress card + avatar (Electric Twilight: midnight indigo→violet→magenta)
--grad-accent,"linear-gradient(135deg,#6d28d9,#c026d3)",buttons/brand-nav-active/badges/number text
--grad-teal,"linear-gradient(135deg,#0c7d8c,#0ea5b7)",selected sidebar milestone + current-week frac
--grad-mint,"linear-gradient(135deg,#10b981,#22d3a8)",done badges/streak
--font-head,"'Space Grotesk','Inter',system-ui,sans-serif",headings + big gradient numbers
--font-body,"'Inter',system-ui,'Segoe UI',Arial,sans-serif",all body/UI text
```

Fonts load from Google Fonts (`fonts.googleapis.com`): `Space Grotesk` 500–700 for headings and big numbers, `Inter` 400–800 for body/UI. Radii: `--r:16px`, `--r-lg:24px`, pill `999px`. Headings weight 700 (Space Grotesk caps at 700), tight letter-spacing (`-.02em`). Shadows are larger and purple-tinted.

**Sidebar color system (resolves owner feedback):** brand navigation active state = purple (`--grad-accent`, white text); your *current position* (current stage label, current-week fraction, selected milestone) = **teal** (`--grad-teal`, white text). This makes "where I am" read as a distinct color from "what's selected in nav," and removes the low-contrast purple-on-light-purple selected state.

Accessibility note: number-as-gradient-text (`background-clip:text`) must keep a solid-color fallback and meet contrast; locked-state text darkened from the audit's pale lavender to `#7a6c95`+ to clear WCAG AA. Respect `prefers-reduced-motion` — disable the pulse/glow/bar-fill animations.

## 4. Layout

```
┌──────────────────────────────────────────────────────────┐
│ GLASSY TOP BAR  brand · ☰(mobile)      ring% · who · ava · logout │
├───────────────┬──────────────────────────────────────────┤
│ SIDEBAR       │ MAIN (white)                              │
│ (restyled)    │ ┌──────────────────────────────────────┐ │
│ gradient      │ │ HERO — "Your next move" (active stage)│ │
│ progress card │ │ big title · progress · SUBMIT CTA ·   │ │
│ Dashboard nav │ │ today checklist                       │ │
│ path accordion│ └──────────────────────────────────────┘ │
│  Week ✓ / ● / 🔒│ [ momentum chips ×4 ]                     │
│  day milestones│ JOURNEY — connected node track            │
│ Resources     │  done(mint) · current(glow) · locked(ghost)│
│ Log out       │ EARN-WHILE-YOU-LEARN ladder (ascending)   │
└───────────────┴──────────────────────────────────────────┘
```

### 4.1 Top bar (glassy, restyled)
Translucent white + backdrop blur, sticky. Left: brand mark (gradient tile) + wordmark; mobile adds a `☰` toggle. Right: a **progress ring** (conic gradient, reads `progressPct`), user name/role, gradient avatar, logout. Mobile collapses name.

### 4.2 Sidebar (kept, restyled)
Sticky, full-height, white. Top is a **gradient progress card** (replaces the bordered `sb-progress`): big `progressPct`, gold-tipped bar, `{completed} of {total} {unit} complete`. Below: Dashboard nav item (gradient when active) + the **path accordion** rendered from `v.stages` — each stage shows ✓ / ● / 🔒, the active stage auto-expands to its `days[]`/`items[]` milestones with done/selected/locked dots. Clicking a milestone selects that stage (drives the hero + URL hash, same as today). On mobile the sidebar becomes an off-canvas drawer with backdrop + Escape close (preserve the audit's a11y fix).

### 4.3 Hero — "Your next move" (new, dominant)
Full-width gradient panel with soft radial glows. Renders the **active stage** from the path:
- eyebrow: pulsing dot + "Your next move · {Day n / Stage}"
- `h1`: active stage title; sub-line: pillar/week context + one-line goal
- gold-tipped progress bar + `{pct}% complete · {completed}/{total}`
- primary CTA **Submit deliverable** (opens the proof input — same submit interaction as today) + secondary "View task brief"
- side panel: today's requirement checklist (from stage `requirements`), checked items reflect saved proof
- Expired/revoked access replaces the hero with the existing "access has ended" message.

### 4.4 Momentum chips (replaces boxed stats)
Four chips with gradient left-rails + gradient number text: Readiness (`progressPct`), Streak (derived/optional — see §6), Deliverables submitted (count of stages with `deliverableUrl`), Track (Fast Track / Full Roadmap).

### 4.5 Journey (replaces pathway grid as the visual path)
Horizontal track of connected nodes from `v.stages`: done = mint badge, current-week marker = **teal** badge with pulsing teal glow ring + teal border (the "where you are" color), locked = ghost badge + lock icon. Full Roadmap (8 pillars) wraps to a multi-row grid; Fast Track shows 4 week-nodes. Clicking a node scrolls to / selects that stage (mirrors sidebar selection). Drill-down to day/milestone detail stays in the **sidebar accordion** (so removing the grid loses no navigation).

### 4.6 Earn-while-you-learn ladder
Restyled ascending "rungs" with gradient amounts and a "You are here" highlight keyed to current progress.

### 4.7 Login card
Restyle to match: gradient brand mark, bolder type, gradient primary button, subtle off-white field surfaces on the white canvas. Keep the demo-fill controls and presenter-note hint from the audit fix pass.

## 5. Data flow (unchanged contract)

Same two reads as today: `GET /api/v1/app/profile` (name, accessBasis, accessEndsAt, status) and `GET /api/v1/app/path` (pathKey, progressPct, completed, total, meta, `stages[]` with `state`/`days[]`/`items[]`/`deliverableUrl`/`requirements`). Submitting a deliverable posts to the existing endpoint; on success the stage completes and the next unlocks **server-side**, then the UI re-renders from a fresh `path` read. The renderer is the same boundary as today (`renderPath(v)`), only the markup/CSS it emits changes.

## 6. Non-goals / YAGNI

- No backend, route, schema, or test changes. No new endpoints.
- **Streak** is presentational; if no activity-date data exists, render it from available proof timestamps or **drop the chip** rather than invent a field. (Owner decides at build.)
- No real confetti/sound; motion limited to CSS pulse/glow/bar-fill, all gated by `prefers-reduced-motion`.
- No shared stylesheet extraction (ADR-003 Option C stays deferred); this remains single-file `app.html`.
- Admin app stays as-is (separate future round).

## 7. Risks & mitigations

```csv
risk,mitigation
gradient-text numbers fail contrast/clip on some browsers,solid-color fallback + test in target browsers
removing pathway grid loses stage nav,sidebar accordion retains full drill-down; journey nodes also select stages
heavy gradients/animation feel busy or hurt perf,near-white canvas for contrast; reduced-motion gate; GPU-friendly transforms only
single-file CSS grows large,acceptable per ADR-003; keep section comments (=== HERO === etc.)
mobile sidebar regressions,reuse audit's drawer+backdrop+Escape pattern; retest mobile widths
```

## 8. Acceptance criteria

1. `app.html` renders the new top bar, restyled sidebar, hero, chips, journey, and ladder from live `/profile` + `/path` data for both Fast Track and Full Roadmap accounts.
2. The active stage's **Submit deliverable** flow still completes the stage and unlocks the next via the server; UI re-renders correctly.
3. Sidebar accordion drill-down (stage → day/milestone selection, hash sync) works as before.
4. Expired/revoked access shows the access-ended state, not the hero.
5. Mobile: off-canvas sidebar with backdrop + Escape; hero CTA visible in first viewport; no header wrap.
6. `prefers-reduced-motion` disables pulse/glow/bar-fill.
7. Locked-state and gradient-text contrast meet WCAG AA.
8. All existing demo tests still pass unchanged.
