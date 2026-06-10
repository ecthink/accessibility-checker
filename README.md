# Accessibility Checker

A professional-grade web accessibility auditing tool. Paste HTML/CSS (or a URL) and get a scored WCAG 2.1 AA report with clear findings, WCAG references, and before/after code fixes.

**Stack:** Pure HTML / CSS / JavaScript (no build step) + one Vercel serverless function for URL fetching.

## How it works

- All analysis runs **in the browser**. The engine renders your HTML into a sandboxed iframe (scripts blocked), so checks like color contrast and touch-target size use real computed styles, not guesses.
- The serverless function (`api/fetch-url.js`) is only a CORS proxy for the "Check URL" mode.
- Every check is a modular function `(ctx) => Finding[]` in `js/engine/checks/`, organized by WCAG principle (POUR).

## Project structure

```
index.html              Input screen + report shell
about.html              Why a11y matters, the tool's own practices, self-audit demo
css/styles.css          All styling ("engineering audit document" design system)
js/app.js               Checker UI wiring (tabs, audit trigger)
js/about.js             Self-audit: feeds the about page into its own engine
js/report.js            Shared report renderer (score panel, filters, findings)
js/engine/engine.js     Sandbox rendering, check orchestration, scoring
js/engine/utils.js      Color math (WCAG luminance/contrast), CSS parsing, helpers
js/engine/checks/       perceivable.js / operable.js / understandable.js / robust.js
api/fetch-url.js        Vercel serverless function (URL proxy)
```

The tool practices what it audits — `about.html` documents each practice against its WCAG criterion, and its "Audit this page" button runs the engine on the page itself (it scores 100).

## Run locally

Any static server works for the paste-code mode:

```sh
npx serve .
```

The "Check URL" mode needs the serverless function — use the Vercel CLI:

```sh
npm i -g vercel
vercel dev
```

## Deploy

```sh
vercel
```

No configuration needed — Vercel serves the static files and picks up `api/fetch-url.js` automatically.

## Scoring

Start at 100. Critical issues deduct 12, warnings 4, with diminishing deductions for repeats of the same issue type (factor 0.6, capped at 2.5× base per type). The report also shows the **potential score** after fixing everything fixable.

| Score | Rating |
|-------|--------|
| 90–100 | Excellent |
| 70–89 | Good |
| 50–69 | Needs Work |
| 0–49 | Poor |

## Honest limits

Static analysis can't judge everything. The report ends with a "Manual checks recommended" list (captions, alt-text quality, keyboard traps, screen reader testing, …) — this tool is a strong first pass, not a substitute for human testing.
