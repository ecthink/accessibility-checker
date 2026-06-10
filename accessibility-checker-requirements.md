# Accessibility Checker — Requirements Document

## Overview

A professional-grade web accessibility auditing tool. Users paste HTML/CSS code or a URL, and the tool runs a full WCAG 2.1 AA analysis, returning a scored report with clear findings, explanations tied to WCAG criteria, and before/after code fixes.

**Positioning:** Not a toy. A genuine tool that designers and developers would actually use to catch accessibility issues before handoff or launch. Demonstrates UI/UX skill, engineering ability, and BA thinking (identifying problems AND providing solutions).

**Target audience:** Designers, front-end developers, and anyone shipping web UI who wants to check accessibility without installing tooling.

**Tech stack:** Front-end (HTML/CSS/JS or a framework), with serverless functions for URL fetching. Deploy to Vercel and/or Railway.

**Repo:** github.com/ecthink/accessibility-checker

---

## Core Value Proposition

Most designers know accessibility matters but don't know how to check it. This tool makes a professional WCAG audit accessible to anyone — paste code, get a score, see exactly what's wrong and how to fix it.

The differentiator from existing tools: **clear before/after fixes** and an **honest distinction** between what can be auto-fixed and what needs human judgment.

---

## Input Methods (Hybrid)

### Method 1: Paste Code
- User pastes HTML (and optionally CSS) into a text area
- Pure front-end analysis — zero cost, instant, works on any snippet
- Handles partial snippets or full pages

### Method 2: Paste URL
- User enters a URL
- A serverless function (Vercel function or Railway service) fetches the page server-side, bypassing CORS
- Returns the HTML to the front-end for analysis

#### URL fetching notes
- Works best on static / server-rendered pages
- JS-heavy SPAs may return an empty shell (content loads via JS after fetch). Detect this case and warn the user: _"This page appears to render content with JavaScript. Results may be incomplete. Try pasting the rendered HTML instead."_
- Phase 1: simple static fetch. Optional later: headless browser (Puppeteer) for JS-rendered pages — heavier, add only if needed.

---

## Scope — Full WCAG 2.1 AA Checks

Checks organized by the four WCAG principles (POUR). Each check below is achievable through static code analysis. Items requiring human/runtime judgment are flagged as out of scope.

### 1. Perceivable

| Check | WCAG | Notes |
|-------|------|-------|
| Color contrast: text vs background ≥ 4.5:1 (normal), ≥ 3:1 (large text ≥18pt / 14pt bold) | 1.4.3 | Pure calculation from computed colors |
| Image alt text present | 1.1.1 | `<img>` must have `alt`; decorative images use `alt=""` |
| Don't rely on color alone to convey info | 1.4.1 | Partial detection (e.g. flag inline color-only cues) |
| Text resizing — avoid hard-locked absolute font sizes | 1.4.4 | Flag `px`-locked text, encourage `rem`/`em` |
| Form inputs have associated `<label>` | 1.3.1 / 3.3.2 | Match `for`/`id` or wrapping label |
| Meaningful sequence / reading order in DOM | 1.3.2 | Basic structural check |

### 2. Operable

| Check | WCAG | Notes |
|-------|------|-------|
| Interactive elements are keyboard-focusable | 2.1.1 | Buttons/links not replaced by non-focusable divs |
| Focus visible — no `outline:none` without replacement | 2.4.7 | Flag removed focus styles |
| Touch target size ≥ 44×44px | 2.5.5 | Estimate from CSS dimensions |
| Link text is descriptive (avoid "click here", "read more") | 2.4.4 | Pattern match generic link text |
| Skip navigation link present | 2.4.1 | Check for skip link |
| No keyboard traps in custom widgets | 2.1.2 | Basic heuristic only |

### 3. Understandable

| Check | WCAG | Notes |
|-------|------|-------|
| Page has `lang` attribute | 3.1.1 | `<html lang="...">` |
| Heading hierarchy correct (no skipped levels, single h1) | 1.3.1 | Structural check |
| Form errors clearly identified | 3.3.1 | Partial — check for error patterns / aria-describedby |
| Inputs have appropriate `autocomplete` | 1.3.5 | Check common fields |
| Labels/instructions provided for inputs | 3.3.2 | Tied to label check |

### 4. Robust

| Check | WCAG | Notes |
|-------|------|-------|
| Semantic HTML (use `<nav>`, `<main>`, `<button>` not div soup) | 1.3.1 / 4.1.2 | Flag clickable divs, missing landmarks |
| Valid ARIA usage (no invalid roles, proper aria-* pairing) | 4.1.2 | Check role validity and required attributes |
| No duplicate `id`s | 4.1.1 | Parse and detect duplicates |
| Basic HTML validity (unclosed tags, etc.) | 4.1.1 | Lightweight validation |

### Explicitly Out of Scope (require human/runtime judgment)
- Video captions / audio transcripts (1.2.x)
- Animation pause/stop controls (2.2.2) — beyond basic detection
- Actual screen reader behavior testing
- Whether alt text content is *accurate* (tool can check presence, not quality)
- Whether color-coded info has a real text alternative in context

The tool should be **honest** about these limits — list them as "Manual checks recommended" so users know the audit isn't a substitute for full human testing.

---

## Scoring System (100-point scale)

### Calculation logic
- Start at 100
- **Critical** issues: −10 to −15 each
- **Warning** issues: −3 to −5 each
- Repeated issues of the same type: diminishing deduction (so one mistake type can't push the score to absurd negatives)
- Floor at 0

### Rating bands
| Score | Rating |
|-------|--------|
| 90–100 | Excellent |
| 70–89 | Good |
| 50–69 | Needs Work |
| 0–49 | Poor |

### Display
- Large, prominent score number (shareable / screenshot-worthy)
- Rating label
- **"Potential score after fixes"** — show what the score becomes if all flagged issues are resolved, to motivate action
- Breakdown: count of Critical / Warning / Pass

---

## Findings & Report Structure

### Three severity levels
- 🔴 **Critical** — violates WCAG AA, must fix (e.g. insufficient contrast, missing alt, unlabeled inputs)
- 🟡 **Warning** — should improve (e.g. non-descriptive link text, small touch targets)
- 🟢 **Pass** — checks that passed (positive reinforcement — show what was done right)

### Each finding contains
- **Title** (e.g. "Insufficient color contrast")
- **Affected element** — highlight the offending code snippet or element
- **Why it matters** — 1-2 sentence explanation of the accessibility principle (e.g. "Users with low vision may not be able to read this text")
- **WCAG reference** — criterion number and name (e.g. "1.4.3 Contrast Minimum") for professional credibility
- **How to fix** — specific, actionable guidance

### Report-level features
- Filter findings by severity
- Each finding expandable for detail
- Summary header with score, rating, and counts
- "Manual checks recommended" section listing out-of-scope items

---

## Before/After Code Fixes

For each fixable issue, show a comparison:

- **Before:** user's original code, with the problem line highlighted
- **After:** suggested corrected code, with the change highlighted
- **"Copy fixed code"** button

### Two types of fixes (be honest about the distinction)

#### Type A — Automatic fixes (rule is unambiguous)
The tool can generate the exact corrected code:
- Color contrast → compute and suggest a compliant color value (e.g. "Change `#999` to `#767676` to reach 4.5:1")
- Missing `lang` attribute → add it
- Label structure → wire up `for`/`id`
- Removed focus outline → restore a visible focus style
- Duplicate ids → rename

#### Type B — Guided fixes (needs human judgment)
The tool provides a template with a placeholder and annotation, not a fabricated value:
- Alt text → `alt="[describe the image here]"` with a note explaining what good alt text looks like
- Link text rewrite → suggest the pattern but let user supply context
- Semantic structure → suggest the right element with a note

**Why this matters:** A tool that pretends to auto-fix everything will sometimes "fix" things wrongly and lose credibility. Honestly separating "I can fix this for you" from "this needs your judgment" is what makes it feel professional.

---

## Design & UX

### Aesthetic
- Clean, professional, trustworthy — this is a serious tool
- Clear visual hierarchy: score up top, findings below
- Severity color-coding (red/yellow/green) used consistently
- Code blocks with syntax highlighting
- Good use of whitespace; not cluttered despite information density

### Key screens
1. **Input screen** — toggle between "Paste Code" and "Paste URL", large input area, prominent "Run Audit" button
2. **Report screen** — score header, severity filters, list of findings, each expandable with before/after
3. **Empty/loading states** — clear feedback while URL is being fetched and analyzed

### Shareability
- The score is designed to be screenshot-worthy
- Optional: "Export report" as PDF or shareable summary (nice-to-have, not MVP)

---

## Technical Specs

### Architecture
- Front-end does all the analysis (parsing HTML, running checks, scoring)
- Serverless function only used to fetch URLs (proxy to bypass CORS)
- Core analysis engine is a set of modular check functions, each returning structured findings

### Analysis approach
- Parse HTML into a DOM (e.g. DOMParser in browser, or a library)
- Each check is an independent function: `(dom, css) => Finding[]`
- Color contrast: parse computed/inline colors, apply WCAG relative luminance formula
- Findings aggregated, scored, sorted by severity

### Finding data model
```javascript
Finding {
  id: string,
  severity: 'critical' | 'warning' | 'pass',
  title: string,
  wcagRef: string,          // e.g. "1.4.3 Contrast Minimum"
  element: string,          // the affected code snippet
  whyItMatters: string,
  fixType: 'auto' | 'guided' | 'none',
  before: string | null,    // original code
  after: string | null,     // fixed code (or template for guided)
  fixNote: string | null,   // explanation for guided fixes
}
```

### No AI required
All checks are rule-based / mathematical. No API keys, no per-use cost, no login. (AI could later be added as an optional "explain this in more depth" enhancement, but the core tool is fully deterministic.)

### Deployment
- Vercel (front-end + serverless function) and/or Railway (if a heavier fetch service is wanted)
- Free tier sufficient for personal/demo traffic
- Zero recurring cost

---

## MVP vs Later

### MVP
- Paste code input
- Full WCAG 2.1 AA static checks (POUR)
- 100-point scoring + rating
- Findings report with severity, WCAG refs, explanations
- Before/after fixes (auto + guided)
- URL input via serverless fetch (static pages)

### Later enhancements
- Headless browser fetch for JS-rendered pages
- PDF / shareable report export
- Optional AI layer: deeper explanations, smarter fix suggestions
- Saved audit history
- Browser extension version
- Batch checking multiple pages

---

## Why This Project (Portfolio Angle)

- **Demonstrates inclusive design knowledge** — accessibility is highly valued (especially by large orgs, government, universities) but under-practiced by designers
- **Shows engineering depth** — DOM analysis, algorithms (contrast math), structured reporting
- **Shows BA thinking** — not just finding problems, but providing actionable solutions with before/after
- **Genuinely useful** — a real tool, not a toy; strong demo credibility in interviews
- **Zero cost to run** — fully deterministic, no API dependencies
