# Reproducing V1

V1 was a static Code For Good marketing page built as one HTML file with embedded CSS and minimal
JavaScript. This guide records how to retrieve and validate the exact retired artifact; the adjacent
[`requirements.md`](requirements.md) records its product and design intent.

## Retrieve the source

Use the immutable historical tag in a separate worktree:

```bash
git fetch origin tag legacy-v1-v2-final
git worktree add ../stem-career-path-v1 legacy-v1-v2-final
cd ../stem-career-path-v1
```

The relevant files are:

```text
STEM Career Path Landing Page.html
mock-dashboard.html
mock-booking.html
assets/icons/codeforgood-logo.png
assets/images/
references/
```

The landing page was renamed to `index.html` by its hosting workflow. The two mock pages were design
references for the planned V2 experience and were not a backend application.

## Run locally

No package manager or build step is required:

```bash
cp 'STEM Career Path Landing Page.html' index.html
python3 -m http.server 8000
```

Open <http://127.0.0.1:8000/>. Opening `index.html` directly also works, but an HTTP server more
closely matches static hosting.

## Implementation constraints

- Keep the page semantic HTML with embedded CSS and only enough JavaScript for navigation,
  disclosure widgets, modal/application interactions, and optional smooth scrolling.
- Preserve relative asset paths, section comments, alternative text, ARIA attributes, keyboard
  focus styles, and mobile layouts.
- Use the Code For Good purple/lavender CSS variables and preserve the eight-pillar pathway.
- Preserve the Full Roadmap and four-week Fast Track descriptions and the Sign Up/Donate calls to
  action.
- Do not introduce a framework, package manager, analytics SDK, or backend form handler.

## Validation

Install `tidy` and `xmllint` through the operating system, then run:

```bash
tidy -q -e index.html
xmllint --html --noout index.html
```

Also check desktop and mobile widths, keyboard navigation, disclosure state, every link, and every
image path. `xmllint --html` is intentional; XML mode incorrectly rejects valid HTML5 constructs.

## Deployment note

V1 used static AWS hosting. Reproduction does not imply that the historical page should replace the
live V3 application. Deploy only from an explicitly designated historical sandbox.
