# STEM Graduates Career Path — AI Era

## Project Execution Plan

**Project Owner:** Tinh Cao

**Organization:** Code For Good (https://www.codeforgood.org)

**Project Type:** Static landing page + maintainable documentation

**Initial Deliverable:** Single HTML landing page supported by Markdown planning and maintenance docs

**Primary Reviewer:** CodeForGood Leadership

**Future Maintainers:** Student volunteers

## 1. Project Purpose

The **STEM Graduates Career Path — AI Era** project is a Code For Good initiative designed to help STEM students and recent graduates prepare for careers shaped by artificial intelligence, automation, cloud platforms, and changing employer expectations.

The landing page will introduce the program, explain its 8-pillar readiness pathway, provide clear calls to action, and support future program growth through sign-ups, donations, testimonials, and resources.

## 2. Project Goals

### 2.1 Primary Goals

* Create a single-page landing page for the STEM Graduates Career Path — AI Era initiative.
* Maintain visual consistency with the current Code For Good website.
* Clearly explain the program mission, structure, and expected participant outcomes.
* Provide clear calls to action for program sign-up and donations.
* Make the project simple enough for student and volunteer teams to maintain.
* Prepare the project for review and deployment by CodeForGood Leadership.

### 2.2 Secondary Goals

* Establish clean documentation for future contributors.
* Create a repeatable structure for future Code For Good project pages.
* Make the page accessible, responsive, and easy to update.
* Avoid unnecessary frameworks or build tools in the MVP.

## 3. Target Audiences

### 3.1 STEM Students and Recent Graduates

Students and graduates who want guidance on career readiness, portfolio building, AI-era skills, certifications, freelance options, and job preparation.

### 3.2 Program Donors and Supporters

Individuals or organizations who may donate to help cover program costs, tooling, cloud hosting, mentoring resources, educational materials, or student support.

### 3.3 Code For Good Volunteers and Mentors

Volunteers who may help with mentorship, curriculum support, resume reviews, mock interviews, technical workshops, or student project feedback.

### 3.4 Student Maintainers

Students who will learn web development by maintaining the page, updating content, and improving the project over time.

### 3.5 CodeForGood Leadership

Leadership responsible for validating that the project is clean, maintainable, and ready to be hosted within Code For Good’s AWS environment.

## 4. Design Direction

The landing page should preserve the existing Code For Good design identity.

### 4.1 Visual Style

* Clean nonprofit-style layout
* Light background
* Purple/lavender accent colors
* Rounded cards
* Soft shadows
* Centered sections with readable text width
* Simple navigation
* Responsive grid layouts

### 4.2 Code For Good Color Direction

Suggested CSS variables:

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

### 4.3 Design Rule

Use the reference landing page for structure and flow, but use Code For Good’s current visual identity for branding.

## 5. Landing Page Architecture

### 5.1 Final Page Sections

1. Header with Code For Good navigation
2. STEM Career Path dropdown menu
3. Hero section
4. Mission / problem section
5. Program Pillars S-curve trail
6. How It Works section
7. Testimonials / impact stories section
8. Resources section
9. FAQ section
10. Final CTA section
11. Footer

## 6. Header and Navigation Plan

### 6.1 Main Header

Keep the same general navigation structure as the current Code For Good page.

Main navigation:

```text
About | Volunteer | Success Stories | Contact | STEM Career Path ▼
```

### 6.2 STEM Career Path Dropdown

The **STEM Career Path** navigation item should open a dropdown on hover and click.

Dropdown links:

```text
Overview
Program Pillars
How It Works
Testimonials
Resources
FAQ
Sign Up
```

### 6.3 Navigation Requirements

* Must work on desktop and mobile.
* Dropdown must be keyboard accessible.
* On small screens, navigation should wrap or collapse cleanly.
* Anchor links should scroll to page sections.

## 7. Hero Section Plan

### 7.1 Hero Headline

```text
STEM Graduates Career Path — AI Era
```

### 7.2 Hero Subheadline

```text
A Code For Good initiative helping STEM students and recent graduates build AI-era skills, project portfolios, confidence, and career readiness.
```

### 7.3 CTA Buttons

Primary CTA:

```text
Sign Up
```

Secondary CTA:

```text
Donate
```

### 7.4 CTA Behavior for MVP

For the first version, buttons will use placeholder links:

```html
<a href="#signup">Sign Up for the Program</a>
<a href="#donate">Donate to Support the Program</a>
```

Later, these can be replaced with actual form, donation, or CRM links.

## 8. Mission / Problem Section

### 8.1 Section Purpose

AI is changing what early-career STEM professionals need to succeed. A degree is still valuable, but students now need practical projects, AI-assisted workflows, cloud and tooling exposure, professional branding, and clear career direction.

This program helps students move from uncertainty to a structured readiness path through guided learning, community projects, mentorship, and portfolio development.

### 8.2 Cards/Images Layout for Attention Hook

* Career uncertainty
* Skills gap
* Portfolio gap
* Access gap

## 9. Program Pillars S-Curve Trail

### 9.1 The 8 Pillars

1. AI-Augmented Skills
2. Deployed Project Portfolio
3. Gig Economy Entry
4. Personal Branding
5. Micro-Internships
6. Strategic Certifications
7. Industry Tooling
8. Community Impact Projects

### 9.2 Desktop Layout

Use a 3-column S-curve layout:

```text
[1] AI-Augmented Skills  →  [2] Deployed Project Portfolio  →  [3] Gig Economy Entry
                                                                          ↓
[6] Strategic Certifications  ←  [5] Micro-Internships  ←  [4] Personal Branding
↓
[7] Industry Tooling  →  [8] Community Impact Projects
```

### 9.3 Mobile Layout

Use a vertical trail:

```text
1 ↓ 2 ↓ 3 ↓ 4 ↓ 5 ↓ 6 ↓ 7 ↓ 8
```

### 9.4 Pillar Card Template

Each card should include:

```text
Number
Title
Short description
Example activity or outcome
```

### 9.6 Draft Pillar Descriptions

#### 1. AI-Augmented Skills

Students learn how to use AI tools responsibly for research, coding support, writing, debugging, productivity, and career preparation.

#### 2. Deployed Project Portfolio

Students build and publish real projects that demonstrate practical skills, not just classroom theory.

#### 3. Gig Economy Entry

Students learn how platforms like Upwork, Contra, and Toptal work, and how to position small technical services professionally.

#### 4. Personal Branding

Students improve their LinkedIn, GitHub, resume, portfolio, and professional storytelling.

#### 5. Micro-Internships

Students gain short, focused project experience that helps them build confidence and work samples.

#### 6. Strategic Certifications

Students identify practical certifications from providers such as AWS, Google, Microsoft, Databricks, or other relevant platforms.

#### 7. Industry Tooling

Students practice tools commonly used by modern teams, including GitHub, cloud platforms, automation tools, documentation tools, and AI assistants.

#### 8. Community Impact Projects

Students contribute to mission-driven Code For Good projects that support nonprofits and local communities.

## 10. How It Works Section

### 10.1 Section Purpose

Explain the participant journey.

### 10.2 Proposed Steps

1. Sign up and share your background
2. Follow the 8-pillar readiness pathway
3. Build projects and career materials
4. Receive feedback from volunteers and mentors
5. Prepare for jobs, freelance work, internships, or startup paths

### 10.3 Layout

Use a simple numbered step layout or horizontal timeline on desktop. Use stacked cards on mobile.

## 11. Testimonials / Impact Stories Section

### 11.1 Section Purpose

Build trust and show human impact.

### 11.2 Rule

No fake testimonials. Use impact statement cards inplace until we get real testimonials.

### 11.3 MVP Card Types

#### Student Participant

```text
Structured guidance helps students understand where to start and what to build next.
```

#### Volunteer Mentor

```text
Mentors can support students through resume reviews, project feedback, mock interviews, and technical workshops.
```

#### Nonprofit Partner

```text
Community projects give students practical experience while helping nonprofits save time through technology.
```

#### Student Maintainer

```text
High school volunteers can maintain and improve the page while learning real-world HTML, CSS, documentation, and version control.
```

### 11.4 Future Version

Replace impact cards with real testimonials once the program has participants, mentors, or partners willing to share quotes.

## 12. Resources Section

### 12.1 Section Purpose

Give the page room to grow into a practical student resource hub.

### 12.2 MVP Resource Cards

* Resume and LinkedIn checklist
* GitHub portfolio checklist
* AI tool safety guide
* Cloud certification guide
* Freelance readiness checklist
* Project idea bank

### 12.3 MVP Behavior

Resource links can point to placeholder anchors until actual documents are created.

## 13. FAQ Section

### 13.1 FAQ Questions

1. Who is this program for?
2. Do I need coding experience?
3. Is this only for computer science students?
4. How long does the program take?
5. What does the donation support?
6. Can high school students contribute?
7. How can mentors or volunteers help?
8. Is this program connected to Code For Good projects?

### 13.2 FAQ Behavior

Use a simple accordion with minimal JavaScript.

## 14. Final CTA Section

### 14.1 CTA Copy

```text
Ready to support STEM graduates in the AI era?
```

Buttons:

```text
Sign Up
Donate
```

## 15. Technical Requirements

### 15.1 MVP Requirements

* Single `index.html` file
* Embedded CSS
* Minimal embedded JavaScript
* No frontend framework
* No package manager
* Responsive design
* Accessible navigation
* Semantic HTML
* Clear section comments
* AWS static-hosting ready

### 15.2 JavaScript Scope

Only use JavaScript for:

* Mobile navigation toggle
* Dropdown behavior if needed
* FAQ accordion
* Optional smooth scrolling

### 15.3 Avoid in MVP

* React
* Bootstrap
* Tailwind
* External build tools
* Backend forms
* Complex animations
* External analytics scripts

## 16. Maintainability Rules

### 16.1 Use Section Comments

Example:

```html
<!-- ================= HERO SECTION ================= -->
```

### 16.2 Use CSS Variables

All colors should be controlled from the `:root` block.

### 16.3 Keep Content Easy to Edit

Avoid deeply nested HTML when possible.

### 16.4 Use Plain Language Comments

Comments should help new students understand what each section does.

### 16.5 Protect Accessibility

Do not remove:

* `alt` text
* semantic headings
* navigation labels
* button labels
* focus states

## 17. Suggested Repository Structure

```text
stem-career-path-ai-era/
│
├── index.html
├── README.md
│
├── docs/
│   ├── project SRS.md
│
├── assets/
│   ├── images/
│   ├── icons/
│
└── references/
    ├── CodeForGood_index.html
```


## 18. Documentation Plan

### 18.1 README.md

Purpose:

* Explain what the project is
* Explain how to open the site locally
* Explain the project structure
* Explain how to make safe edits
* Explain deployment assumptions

### 18.2 docs/project-overview.md

Purpose:

* Program mission
* Audiences
* 8 pillars
* Success metrics

### 18.3 docs/design-guidelines.md

Purpose:

* Code For Good color system
* Typography guidance
* Button styles
* Card styles
* Layout rules

### 18.4 docs/content-guide.md

Purpose:

* How to edit hero copy
* How to edit pillar cards
* How to edit FAQs
* How to add testimonials
* How to update CTA links

### 18.5 docs/maintenance-guide.md

Purpose:

* Beginner-friendly guide for student maintainers
* Local testing steps
* Mobile testing checklist
* Link checking checklist
* Common mistakes to avoid

### 18.6 docs/aws-deployment-notes.md

Purpose:

* Explain that the page is static
* No backend required for MVP
* Ready for S3 + CloudFront hosting
* Uses relative asset paths
* Forms and donations require external links unless backend is added later

### 18.7 docs/student-onboarding.md

Purpose:

* Teach high school students how to contribute
* Explain HTML/CSS basics used in this project
* Explain GitHub workflow
* Explain review process


## 19. Development Phases

### Phase 1 — Planning

Deliverables:

* Project execution plan
* Landing page outline
* Design notes
* Documentation structure

### Phase 2 — Content Drafting

Deliverables:

* Final hero copy
* Final pillar descriptions
* Final how-it-works steps
* FAQ draft
* CTA copy

### Phase 3 — HTML/CSS Build

Deliverables:

* `index.html`
* Responsive layout
* Header dropdown
* S-curve pillar trail
* CTA buttons
* Testimonial cards
* FAQ accordion

### Phase 4 — Documentation

Deliverables:

* `README.md`
* `docs/project-overview.md`
* `docs/design-guidelines.md`
* `docs/content-guide.md`
* `docs/maintenance-guide.md`
* `docs/aws-deployment-notes.md`
* `docs/student-onboarding.md`

### Phase 5 — Review and Handoff

Deliverables:

* Final QA checklist
* Demo script
* Known limitations
* Future roadmap
* CodeForGood Leadership handoff notes


## 20. QA Checklist

### 20.1 Content QA

* [ ] Page title is clear
* [ ] Mission is understandable within 5 seconds
* [ ] Donation CTA is visible
* [ ] Sign-up CTA is visible
* [ ] 8 pillars are listed correctly
* [ ] No fake testimonials are used
* [ ] Contact information is correct

### 20.2 Design QA

* [ ] Matches Code For Good colors
* [ ] Cards have consistent spacing
* [ ] Buttons are easy to see
* [ ] Mobile layout works
* [ ] S-curve trail is readable on desktop
* [ ] Pillars stack correctly on mobile

### 20.3 Accessibility QA

* [ ] Images have alt text
* [ ] Navigation has aria label
* [ ] Buttons and links are keyboard accessible
* [ ] Color contrast is readable
* [ ] Headings follow logical order
* [ ] FAQ accordion is usable with keyboard

### 20.4 Technical QA

* [ ] `index.html` opens locally
* [ ] No broken internal links
* [ ] No console errors
* [ ] CSS is embedded
* [ ] JavaScript is minimal
* [ ] No framework dependencies
* [ ] Assets use relative paths

### 20.5 AWS Readiness QA

* [ ] Static hosting compatible
* [ ] No backend required for MVP
* [ ] Links can be updated later
* [ ] File names are clean
* [ ] Documentation explains deployment assumptions

## 21. Future Roadmap

### Version 1.0

* Static landing page
* Donation CTA
* Sign-up CTA
* Program pillar trail
* FAQ
* Documentation

### Version 1.1

* Add real sign-up form link
* Add real donation platform link
* Add real testimonials
* Add downloadable resource PDFs
* Add screenshots or student project examples

### Version 2.0

* Separate resource pages
* Student dashboard concept
* Mentor directory
* Program application workflow
* CMS or simple content management approach
* Analytics and impact tracking

## 22. Open Questions

These should be clarified before final implementation:

1. What donation platform or link should the Donate button use?
2. What form should the Sign Up button use?
3. Should the page use the current Code For Good logo file path: `codeforgood-logo.png`?
4. Should testimonials start as impact cards until real quotes are collected?
5. Will the page live as a standalone page or be added into the existing Code For Good website?
6. Are there required AWS hosting conventions from the senior SWE?
7. Who will approve final copy before deployment?

## 23. Immediate Next Steps

1. Finalize landing page section copy.
2. Confirm CTA links for Donate and Sign Up.
3. Build `index.html` with embedded CSS and minimal JavaScript.
4. Create documentation files.
5. Run QA checklist.
6. Prepare demo script and handoff notes for CodeForGood Leadership.