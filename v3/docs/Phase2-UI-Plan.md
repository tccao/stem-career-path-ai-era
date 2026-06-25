# V3 Phase 2 — "Working app like V2" (Rev. 2)

Goal: bring the V3 student app to **full visual + experiential parity with the demo student app**
([`../../demo/public/app.html`](../../demo/public/app.html) — the "vibrant redesign"), wired to
the Spark/Functions-free Firebase backend, showing **real data** (no fabricated metrics).

> **Rev. 2 — target is `demo/public/app.html`, not the tamer `mock-dashboard.html`.** The demo app
> is the canonical look: Space Grotesk + Inter fonts; glassy blurred top bar with a conic
> **progress ring**; gradient sidebar **progress card** + accordion path tree; **momentum chips**
> with gradient-text values; a full-bleed **hero** that features the selected/active stage with a
> "what to complete" checklist; a **stage-detail** card (requirement checkboxes gate a proof-of-work
> URL submit); a **journey grid** of stage **nodes** (fast-track weeks drill down to day-cards;
> roadmap shows pillar cards); and the **earn-while-you-learn ladder**. Hash routing (`#stage=`)
> selects a stage; the hero + detail follow the selection. We port that design 1:1 and swap its
> REST data source for a client-side view built from Firestore + the curriculum bundle.

Builds on the live MVP ([`Spark-Backend.md`](Spark-Backend.md), [`MVP-Plan.md`](MVP-Plan.md)).
Source of the design language: `mock-dashboard.html` (V2 UI mock) + `STEM Career Path Landing
Page.html` (brand).

## 1. Goal statement

A signed-in student sees a Code-For-Good-branded app — fixed top bar + sidebar shell, accordion
pathway navigation, dashboard with access status, progress, a "continue learning" card, and the
pathway grid — matching the V2 look, driven by the student's **real** Firestore data (member doc,
progress, curriculum). Same tokens, same components, same responsive behavior as the mock.

## 2. Design system (extracted from mock-dashboard.html → shared `theme.css`)

```csv
token group,values
brand,--cfg-purple #6a0dad · --cfg-purple-dark #4b0082 · --cfg-lavender #b19cd9 · --cfg-purple-light #f3e9f9
neutrals,--cfg-section-bg #f9f3fc · --cfg-text #2a1f3d · --cfg-muted #5b5170 · --cfg-border #eadcf5 · --cfg-bg #fff
accents,--cfg-coral #e85a6b · --cfg-mint #2ea27a · --cfg-gold #d99b22
shape,radii 8/12/18/24px · shadows sm/md/lg (purple-tinted) · sidebar 280px
```

```csv
component,role
topbar,sticky brand (logo + "STEM Career Path") · notifications · avatar + name/role
sidebar,fixed 280px: progress widget · Dashboard · Learn (path accordion) · Resources · Track (Progress/Notes/Profile) · Log out
accordion,one-open-at-a-time pathway tree; lvl2 groups with done/total fraction + milestone bullets
page-head,welcome + access-chip (Active · seat type · access-until)
stat cards,4-up metric cards (icon + number + label)
continue card,purple gradient "continue learning" with progress bar + CTA
pathway grid,pcards: done / current / locked states
btn,pill buttons (.btn / .btn-white)
responsive,2-up at 980px · sidebar drawer + menu button at 760px
```

## 3. Student-app screens (this phase) + real-data mapping

```csv
screen,V2 component,real V3 data (no fakes)
shell (all screens),topbar + sidebar + progress widget,member.name/email/accessBasis · progress done/total/pct for member.path
dashboard,page-head + access-chip,member status ACTIVE · accessBasis · accessEnds date
,stat cards,REAL only: overall % · deliverables submitted (completed count) · stages remaining · days of access left
,continue card,the next OPEN stage (title + deliverable) + submit/open CTA
,pathway grid,member.path stages as cards — fasttrack→4 week cards (days done/total) · roadmap→8 pillar cards (state)
pathway nav (sidebar),accordion tree,member.path grouped: fasttrack by week→days · roadmap→pillars→milestones; state from progress
stage detail,card + milestones + submit,one stage: title · deliverable/description · milestones · proof-of-work URL submit (active only)
progress,list,completed stages + submitted deliverable links + dates
profile,card,name · email · accessBasis · access window · sign out
```

Dropped from the mock (no backing data, per "real data only"): readiness %, day-streak, badges,
earn-while-you-learn ladder, interview/onboarding step list. The shell keeps slots so they can
return later if the data exists.

## 4. Spark constraints (unchanged)

```csv
constraint,effect on this phase
no Cloud Functions,all reads/writes are client SDK + Rules; submit writes own progress doc (ACTIVE+in-window)
admin mutations are CLI,not in scope here (student app only); admin console restyle is a later phase
gating computed client-side,sequential state from curriculum order; access WINDOW enforced by Rules
curriculum is the static bundle,already populated (8 pillars + 28 days); no server curriculum on Spark
```

## 5. Architecture

```csv
file,role
frontend/src/ui/theme.css,the shared design system (tokens + components) — imported once by the SPA
frontend/src/ui/shell.js,renders topbar + sidebar (progress widget + path accordion + nav) → returns the <main> to fill; wires accordion + mobile drawer + logout
frontend/src/student/dashboard.js,fetch member+progress+curriculum → mount shell → render dashboard cards (real data) → submit re-renders
frontend/src/student/{stage,progress,profile}.js,later commits — stage detail, progress list, profile (reuse shell)
frontend/src/ui/icons.js,small inline-SVG set (sidebar/topbar/cards)
```

## 6. Small-commit roadmap

```csv
#,commit,gate
1,feat(v3-ui): shared theme.css design system + app shell (topbar+sidebar),build green · shell renders
2,feat(v3-ui): restyle student dashboard to V2 layout (real data),build green · live dashboard matches mock look
3,feat(v3-ui): sidebar path accordion from curriculum+progress,accordion states correct (complete/active/locked)
4,feat(v3-ui): stage detail + submit screen,submit unlocks next; deployed Rules still enforce window
5,feat(v3-ui): progress + profile screens,real deliverables list + profile + sign out
6,polish: responsive + a11y (focus states, contrast) + empty/loading states,axe contrast pass
```

Commits 1-2 are this turn (plan + shell + dashboard). 3-6 follow.

## 7. Out of scope (this phase)
Admin console restyle (CLI-bound on Spark) · public landing/apply/login rich restyle (gets the
shell tokens only) · the dropped decorative widgets · curriculum content edits.
