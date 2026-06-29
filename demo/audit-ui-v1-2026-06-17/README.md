# Demo V1 UI Audit

Date: 2026-06-17
Destination: local folder
Scope: seeded local demo at `http://localhost:3000`, desktop admin, desktop student, and mobile student screens.

## Captured Steps

| step | screenshot | health | notes |
| --- | --- | --- | --- |
| 1 | 01-admin-sign-in.png | Good for local dev; risky for public demo | Clean centered form; seeded credentials are visible. |
| 2 | 02-admin-overview-submitted.png | Usable but utilitarian | KPIs and queue are clear; admin story feels technical and sparse. |
| 3 | 03-admin-application-detail.png | Mostly clear | Application actions are visible; raw status/path values reduce polish. |
| 4 | 04-admin-approved-tab.png | Needs fix | Queue changes to Approved but detail panel still shows the prior Submitted applicant. |
| 5 | 05-admin-members-table.png | Usable | Members table is readable on desktop; action buttons are easy to find. |
| 6 | 06-student-sign-in.png | Good for local dev; risky for public demo | Card is polished; seeded credentials are visible. |
| 7 | 07-student-fast-track-dashboard.png | Strong | Clear hierarchy, progress, current work, and gated path story. |
| 8 | 08-student-fast-track-pathway.png | Strong | The pathway and earn-while-you-learn ladder make the product promise tangible. |
| 9 | 09-student-full-roadmap-dashboard.png | Strong with density risk | Good roadmap framing; long sidebar labels become heavy. |
| 10 | 10-student-mobile-dashboard.png | Needs polish | Main layout works; brand/logout wrap awkwardly and primary action is clipped below fold. |
| 11 | 11-student-mobile-menu-open.png | Needs polish | Menu is usable but lacks a scrim/focus treatment and visually collides with page content. |

## Priority Findings

1. Admin detail can show stale applicant data after a tab change.
   Evidence: `04-admin-approved-tab.png` shows the Approved queue with Priya Patel, while the detail panel still shows Jordan Blake in `SUBMITTED`. For a live demo, this is the highest-risk issue because it makes the workflow look unreliable. Clear the detail panel on status-tab changes, or automatically select the first item in the new queue.

2. Student mobile header wraps in a way that looks unfinished.
   Evidence: `10-student-mobile-dashboard.png` and `11-student-mobile-menu-open.png`. The brand breaks into multiple short lines, and the Log out button splits across two lines. Keep the logo/brand compact on mobile, hide the subtitle earlier, and use a single-line icon/text or icon-only logout control.

3. Demo credentials are visible on both sign-in screens.
   Evidence: `01-admin-sign-in.png` and `06-student-sign-in.png`. This is helpful for local testing, but for a donor, board, or partner demo it makes the product feel less real. Use a small “Demo account” selector, a “Fill demo credentials” button, or move credentials into presenter notes.

4. Admin UI speaks in implementation language.
   Evidence: `02-admin-overview-submitted.png` and `03-admin-application-detail.png`. Labels like `APPROVED_BENEFICIARY`, `full_roadmap`, `APPLICATION_SUBMITTED`, and `B_fast_track` are accurate but not human-friendly. Use demo-facing labels such as “Approved beneficiary,” “Full roadmap,” “Application submitted,” and “Fast track.”

5. Mobile current-work card pushes the first action below the fold.
   Evidence: `10-student-mobile-dashboard.png`. The current week card is persuasive, but the deliverable input/action starts below the first viewport. Tighten the top stats or shorten the card copy on mobile so the primary action is visible sooner.

6. Locked/disabled text may be too low-contrast.
   Evidence: `07-student-fast-track-dashboard.png`, `09-student-full-roadmap-dashboard.png`, and `11-student-mobile-menu-open.png`. The pale lavender locked labels are readable in the screenshot, but likely close to contrast limits. Test contrast and darken locked-state text slightly while keeping the disabled feel.

## Strengths

The student experience is demo-ready in concept: it immediately communicates access status, chosen path, current work, gated progression, and the earn-while-you-learn ladder. The visual system feels coherent with Code For Good's purple identity and has enough polish for a first platform demo.

The admin experience is functionally clear: lifecycle tabs, counts, queue, details, and member actions are all present in one view. It can demo the state-machine idea without forcing the presenter to jump through many screens.

## Accessibility Risks From Screenshots And DOM

The admin queue rows and tabs appear as clickable visual elements, but should be true buttons or links with keyboard focus states. The mobile sidebar should trap focus while open, close with Escape, and use a backdrop or clear page dimming. Screenshots alone cannot confirm keyboard order, screen reader labels, color contrast ratios, or reduced-motion handling.

## Recommended Demo Fix Order

1. Fix stale admin detail on tab change.
2. Replace raw status/path constants with human labels.
3. Hide or soften seeded credentials for presentation mode.
4. Tighten the mobile topbar and logout treatment.
5. Bring the mobile submit action higher in the first viewport.
6. Check locked-state contrast and keyboard focus behavior.

## Fix Pass

Completed on 2026-06-17:

| fix | status | evidence |
| --- | --- | --- |
| Admin detail clears after lifecycle-tab change | done | 12-admin-after-approved-tab.png |
| Admin status/path/basis labels are demo-friendly | done | 12-admin-after-approved-tab.png |
| Visible seeded credentials replaced with demo-fill controls | done | admin.html and app.html sign-in screens |
| Student mobile header no longer wraps brand/logout awkwardly | done | 13-student-mobile-after.png |
| Student mobile submit action is visible in first viewport | done | 13-student-mobile-after.png |
| Mobile sidebar adds backdrop and Escape close behavior | done | 14-student-mobile-menu-after.png |
| Locked-state text contrast strengthened | done | 13-student-mobile-after.png and 14-student-mobile-menu-after.png |
