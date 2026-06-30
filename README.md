# STEM Graduates Career Path - AI Era

A Code For Good career-readiness initiative with three versioned horizons in one repository. The
current hosted application is V3: an AWS Amplify frontend backed by Firebase Identity Platform,
Firestore, App Check, and 2nd-generation callable Functions. It provides public application intake,
two gated learning paths, proof-of-work stage progression, and TOTP-protected admin/owner operations.

The original V1 static landing page and the planned V2 AWS architecture remain in this repository as
separate historical/design sources. Do not apply V1's single-file constraints to `v3/`.

## Project Overview

The **STEM Graduates Career Path - AI Era** project helps STEM students and recent graduates prepare for careers shaped by artificial intelligence, automation, cloud platforms, and changing employer expectations.

The current V3 application explains the program, accepts age-gated beneficiary/supporter applications,
routes applicants to Cal.com or Zeffy, grants time-bounded student access, and tracks sequential
proof-of-work through the Full Roadmap and 28-day Fast Track. Staff operations are server-enforced,
audited, TOTP-protected, and attested with Firebase App Check.

The V1 material below remains the reference for the standalone static landing page. Current runtime,
security, setup, and deployment behavior is documented under `v3/`.

## Organization

**Organization:** Code For Good  
**Website:** <https://www.codeforgood.org>  
**Project Owner:** Tinh Cao  
**Primary Reviewer:** Code For Good Leadership  
**Future Maintainers:** Student volunteers  
**Project Type:** Versioned landing page, AWS platform design, and secured hosted Firebase MVP

## Project Horizons

This repository covers three stages of the same initiative:

- **V1 — Static landing page (built).** A single `index.html` marketing page on AWS static hosting.
  Most of the reference material later in this README documents V1.
- **V2 — Vetted-access learning platform (planned).** A standalone app (public / student / admin zones,
  an apply → interview → donate → provision access flow, and the two learning paths) on an AWS
  serverless stack. V2 is **fully planned** in the documents below but **not built**; a runnable local
  prototype lives in `demo/`.
- **V3 — Secured hosted MVP (current implementation).** **AWS Amplify** hosts the Vite frontend and
  **Firebase Blaze with Identity Platform** provides email-link Auth, staff TOTP, App Check,
  Firestore, and callable Functions. Browsers cannot write Firestore directly. Students submit HTTPS
  proof links sequentially; admins can grant, disable, re-enable, and restore ended access; owners can
  manage staff, settings, and lockdown. Lives in `v3/`. Start with
  **[`v3/docs/Setup-Guide.md`](v3/docs/Setup-Guide.md)**; architecture in
  [`v3/docs/Architecture-V3.md`](v3/docs/Architecture-V3.md); agent guide in
  [`v3/CLAUDE.md`](v3/CLAUDE.md).

## Planning & Architecture Documentation

All planning lives in `docs/`. Read these before contributing to the V2 platform:

| Document | What it covers |
|----------|----------------|
| [`docs/Project SRS.md`](docs/Project%20SRS.md) | Source of truth — program purpose, audiences, 8 pillars, V1 requirements |
| [`docs/Sitemap-and-Wireframes.md`](docs/Sitemap-and-Wireframes.md) | Information architecture: sitemap, routes, low-fidelity wireframes, nav-by-role |
| [`docs/Customer-Journey.md`](docs/Customer-Journey.md) | Personas, the access lifecycle state machine, end-to-end apply→provision→expire flow |
| [`docs/Architecture-Design.md`](docs/Architecture-Design.md) | Build-ready AWS serverless design: role separation, audit trail, rate limiting, audit logging |
| [`docs/Service-Tradeoff-Analysis.md`](docs/Service-Tradeoff-Analysis.md) | Board-facing cost & service justification (charges, alternatives, nonprofit credits) |
| [`requirements.txt`](requirements.txt) | Local validation dependencies: `tidy` and `xmllint` (apt); the Python venv is managed by `uv` |

> The original combined planning file, `docs/Sprint-Planning_Sitemap-and-Wireframes.md`, has been
> **retired** — its content is split across the Sitemap, Customer-Journey, and Architecture docs above.

## V1 MVP Deliverable (historical reference)

The first version of this project will deliver:

- A single `index.html` landing page
- Embedded CSS
- Minimal embedded JavaScript
- Code For Good visual styling
- Responsive layout
- Accessible navigation
- STEM Career Path dropdown menu
- Donation and sign-up calls to action
- eight-pillar S-curve program pathway
- How It Works section
- Testimonials or impact cards
- Resources section
- FAQ accordion
- Documentation for future maintainers

## Target Audiences

### STEM Students and Recent Graduates

Students and graduates who want guidance on career readiness, portfolio building, AI-era skills, certifications, freelance options, and job preparation.

### Donors and Supporters

Individuals or organizations who may donate to help cover program costs, tooling, cloud hosting, mentoring resources, educational materials, or student support.

### Code For Good Volunteers and Mentors

Volunteers who may support mentorship, curriculum development, resume reviews, mock interviews, technical workshops, and student project feedback.

### Student Maintainers

Student volunteers who will learn web development by maintaining the landing page, updating content, improving documentation, and contributing to the project over time.

### Code For Good Leadership

Leadership is responsible for reviewing the project, validating maintainability, and supporting deployment within Code For Good's AWS environment.

## Landing Page Sections

The landing page will include the following sections:

1. Header with Code For Good navigation
2. STEM Career Path dropdown menu
3. Hero section
4. Mission / problem section
5. Program Pillars S-curve trail
6. How It Works section
7. Program Timeline Tracks section
8. Testimonials / impact stories section
9. Resources section
10. FAQ section
11. Final call-to-action section
12. Footer

## Navigation Plan

The main navigation should preserve the existing Code For Good structure while adding a project-specific dropdown.

```text
About | Volunteer | Success Stories | Contact | STEM Career Path v
```

The **STEM Career Path** dropdown should include:

```text
Overview
Program Pillars
How It Works
Timeline Tracks
Testimonials
Resources
FAQ
Sign Up
```

Navigation requirements:

- Works on desktop and mobile devices
- Supports hover and click behavior where practical
- Remains keyboard accessible
- Uses anchor links for same-page navigation
- Wraps or collapses cleanly on small screens

## Calls to Action

The landing page must include two major calls to action:

### Primary CTA

```text
Sign Up
```

### Secondary CTA

```text
Donate
```

For the MVP, these links may point to placeholder anchors:

```html
<a href="#signup">Sign Up</a>
<a href="#donate">Donate</a>
```

Later, these should be replaced with the official program sign-up form and donation platform links.

## Eight-Pillar Program Pathway

The program is organized around eight readiness pillars:

1. AI-Augmented Skills
2. Deployed Project Portfolio
3. Gig Economy Entry
4. Personal Branding
5. Micro-Internships
6. Strategic Certifications
7. Industry Tooling
8. Community Impact Projects

### Desktop Layout

The pillar section should use a 3-column S-curve trail layout:

```text
[1] AI-Augmented Skills  ->  [2] Deployed Project Portfolio  ->  [3] Gig Economy Entry
                                                                          v
[6] Strategic Certifications  <-  [5] Micro-Internships  <-  [4] Personal Branding
v
[7] Industry Tooling  ->  [8] Community Impact Projects
```

### Mobile Layout

On mobile, the trail should stack vertically:

```text
1 v 2 v 3 v 4 v 5 v 6 v 7 v 8
```

Each pillar card should include:

- Number
- Title
- Short description
- Example activity or outcome

## How It Works

The participant journey should be explained in five steps:

1. Sign up and share your background
2. Follow the eight-pillar readiness pathway
3. Build projects and career materials
4. Receive feedback from volunteers and mentors
5. Prepare for jobs, freelance work, internships, or startup paths

Desktop layout may use a horizontal timeline or numbered cards. Mobile layout should use stacked cards.

## Program Timeline Tracks

The program supports two participant timelines.

### During School Track

**Recommended duration:** 12-18 months

This track is for current students who can build career readiness gradually while still in school.

Focus areas:

- AI-augmented learning habits
- Portfolio project development
- GitHub, LinkedIn, and resume improvement
- Certifications and industry tooling
- Micro-internships or volunteer experience
- Career preparation before graduation

### Recent Graduate Track

**Recommended duration:** 8-12 weeks

This track is for recent graduates who need a faster, focused career-readiness sprint.

Focus areas:

- Career direction and role targeting
- Resume, LinkedIn, and GitHub cleanup
- One strong deployable project
- AI/tooling practice
- Mock interviews and mentor feedback
- Job, freelance, internship, or startup readiness

### Landing Page Display

The landing page should show these timelines as two cards:

```text
During School Track | Recent Graduate Track
```

On desktop, the timeline cards should appear side by side. On mobile, they should stack vertically.

## Testimonials and Impact Stories

The project must not use fake testimonials.

Until real testimonials are collected, use impact statement cards instead.

Suggested MVP cards:

### Student Participant

Structured guidance helps students understand where to start and what to build next.

### Volunteer Mentor

Mentors can support students through resume reviews, project feedback, mock interviews, and technical workshops.

### Nonprofit Partner

Community projects give students practical experience while helping nonprofits save time through technology.

### Student Maintainer

Student volunteers can maintain and improve the page while learning real-world HTML, CSS, documentation, and version control.

## Resources Section

The MVP resource section may include placeholder cards for future materials:

- Resume and LinkedIn checklist
- GitHub portfolio checklist
- AI tool safety guide
- Cloud certification guide
- Freelance readiness checklist
- Project idea bank

Resource links may point to placeholder anchors until real documents are created.

## FAQ Section

The FAQ section should use a simple accordion with minimal JavaScript.

Initial FAQ questions:

1. Who is this program for?
2. Do I need coding experience?
3. Is this only for computer science students?
4. How long does the program take?
5. What does the donation support?
6. Can high school students contribute?
7. How can mentors or volunteers help?
8. Is this program connected to Code For Good projects?

## Design Guidelines

The landing page should preserve the current Code For Good design identity.

### Visual Style

- Clean nonprofit-style layout
- Light background
- Purple and lavender accent colors
- Rounded cards
- Soft shadows
- Centered sections with readable text width
- Simple navigation
- Responsive grids

### Suggested CSS Variables

```css
:root {
  --cfg-purple-dark: #4b0082;
  --cfg-purple: #6a0dad;
  --cfg-lavender: #b19cd9;
  --cfg-purple-light: #f3e9f9;
  --cfg-section-bg: #f9f3fc;
  --cfg-text: #333333;
  --cfg-muted: #555555;
  --cfg-card-bg: #ffffff;
  --cfg-border: #eadcf5;
}
```

Design rule:

> Use the reference landing page for structure and flow, but use Code For Good's current visual identity for branding.

## Technical Requirements

The MVP should use:

- Plain HTML
- Embedded CSS
- Minimal embedded JavaScript
- Semantic HTML
- Responsive CSS
- Accessible navigation
- Clear section comments
- Relative asset paths

The MVP should avoid:

- React
- Bootstrap
- Tailwind
- Package managers
- External build tools
- Backend forms
- Complex animations
- External analytics scripts

JavaScript should only be used for:

- Mobile navigation toggle
- Dropdown behavior if needed
- FAQ accordion
- Optional smooth scrolling

## Project Structure

Current repository structure:

```text
stem-career-path-ai-era/
│
├── STEM Career Path Landing Page.html   # V1 landing page (to be renamed index.html for hosting)
├── README.md
├── LICENSE
│
├── docs/
│   ├── Project SRS.md                          # source of truth
│   ├── Sitemap-and-Wireframes.md               # V2 information architecture
│   ├── Customer-Journey.md                     # V2 personas + access lifecycle
│   ├── Architecture-Design.md                  # V2 AWS serverless design
│   ├── Service-Tradeoff-Analysis.md            # V2 board-facing cost/service justification
│   └── Sprint-Planning_Sitemap-and-Wireframes.md   # RETIRED — superseded by the three docs above
│
├── assets/
│   ├── images/
│   └── icons/                                  # codeforgood-logo.png
│
└── references/
    └── CodeForGood_index.html
```

Future content documentation may still be added as needed (e.g., `design-guidelines.md`,
`content-guide.md`, `maintenance-guide.md`, `aws-deployment-notes.md`, `student-onboarding.md`).

## How to Run Locally

Because this is a static HTML project, no installation is required.

### Option 1: Open Directly

Open `index.html` in a web browser.

### Option 2: Use a Local Server

If using VS Code, install the **Live Server** extension and open `index.html` with Live Server.

This is helpful for testing navigation, assets, and responsive behavior.

### Optional: Validation Tooling

The static page needs no build, but a local environment is handy for HTML
validation. The Python virtual environment is created and managed by
[`uv`](https://docs.astral.sh/uv/), which also provisions the Python 3.14
interpreter:

```bash
uv venv --python 3.14          # create .venv with Python 3.14
source .venv/bin/activate
```

The HTML validators are system (apt) packages — see `requirements.txt`:

```bash
sudo apt install tidy libxml2-utils
tidy -q -e index.html          # HTML validation
xmllint --noout index.html     # well-formedness check
```

## How to Make Safe Edits

Student maintainers should follow these rules:

1. Edit one section at a time.
2. Use existing cards as templates before creating new layouts.
3. Keep section comments in place.
4. Do not remove accessibility labels, alt text, or focus styles.
5. Test the page on desktop and mobile widths.
6. Check every link after editing.
7. Keep colors controlled through CSS variables.
8. Avoid adding new libraries unless approved by Code For Good leadership.

Example section comment:

```html
<!-- ================= HERO SECTION ================= -->
```

## Accessibility Requirements

Before submitting changes, confirm:

- Images have meaningful `alt` text
- Navigation has an accessible label
- Buttons and links are keyboard accessible
- Color contrast is readable
- Headings follow a logical order
- FAQ accordion can be used with keyboard
- Mobile layout remains readable

## QA Checklist

### Content QA

- [ ] Page title is clear
- [ ] Mission is understandable within 5 seconds
- [ ] Donation CTA is visible
- [ ] Sign-up CTA is visible
- [ ] Eight pillars are listed correctly
- [ ] No fake testimonials are used
- [ ] Contact information is correct

### Design QA

- [ ] Matches Code For Good colors
- [ ] Cards have consistent spacing
- [ ] Buttons are easy to see
- [ ] Mobile layout works
- [ ] S-curve trail is readable on desktop
- [ ] Pillars stack correctly on mobile

### Accessibility QA

- [ ] Images have alt text
- [ ] Navigation has aria label
- [ ] Buttons and links are keyboard accessible
- [ ] Color contrast is readable
- [ ] Headings follow logical order
- [ ] FAQ accordion is usable with keyboard

### Technical QA

- [ ] `index.html` opens locally
- [ ] No broken internal links
- [ ] No console errors
- [ ] CSS is embedded
- [ ] JavaScript is minimal
- [ ] No framework dependencies
- [ ] Assets use relative paths

### AWS Readiness QA

- [ ] Static hosting compatible
- [ ] No backend required for MVP
- [ ] Links can be updated later
- [ ] File names are clean
- [ ] Documentation explains deployment assumptions

## AWS Hosting Notes

The MVP should be compatible with AWS static hosting.

Expected hosting approach:

- Static files served from S3 or an existing Code For Good hosting workflow
- Optional CloudFront distribution for CDN and HTTPS
- No backend required for the first version
- Form, sign-up, and donation actions should use external approved links unless a backend is added later
- All local assets should use relative paths

## Development Phases

### Phase 1 - Planning

- Project execution plan
- Landing page outline
- Design notes
- Documentation structure

### Phase 2 - Content Drafting

- Final hero copy
- Final pillar descriptions
- Final How It Works steps
- FAQ draft
- CTA copy

### Phase 3 - HTML/CSS Build

- `index.html`
- Responsive layout
- Header dropdown
- S-curve pillar trail
- CTA buttons
- Testimonial cards
- FAQ accordion

### Phase 4 - Documentation

- `README.md`
- Supporting docs as needed

### Phase 5 - Review and Handoff

- Final QA checklist
- Demo script
- Known limitations
- Future roadmap
- Code For Good leadership handoff notes

## Future Roadmap

### Version 1.0

- Static landing page
- Donation CTA
- Sign-up CTA
- Program pillar trail
- FAQ
- Documentation

### Version 1.1

- Add real sign-up form link
- Add real donation platform link
- Add real testimonials
- Add downloadable resource PDFs
- Add screenshots or student project examples

### Version 2.0

- Separate resource pages
- Student dashboard concept
- Mentor directory
- Program application workflow
- Simple content management approach
- Analytics and impact tracking

## Open Questions

These should be clarified before final implementation:

1. What donation platform or link should the Donate button use?
2. What form should the Sign Up button use?
3. Should the page use the current Code For Good logo file path: `codeforgood-logo.png`?
4. Should testimonials start as impact cards until real quotes are collected?
5. Will the page live as a standalone page or be added into the existing Code For Good website?
6. Are there required AWS hosting conventions from Code For Good leadership?
7. Who will approve final copy before deployment?

## Contributor Notes

This project is intentionally beginner-friendly.

Before making large changes:

- Read the SRS in `docs/Project SRS.md` (and, for the V2 platform, the planning docs listed above)
- Review the existing Code For Good reference page
- Keep the design simple
- Prioritize readability over clever code
- Ask for review before changing navigation, CTAs, or the 8-pillar pathway

## Source of Truth

The project requirements are based on the SRS document: `docs/Project SRS.md`. The V2 platform
direction is detailed in the planning docs listed under **Planning & Architecture Documentation**.
