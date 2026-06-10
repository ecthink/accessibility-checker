// Understandable checks (WCAG principle 3)

import { makeFinding, makePass, snippet, openingTag } from '../utils.js';

/* 3.1.1 — Page must declare its language */
export function checkLang(ctx) {
  const findings = [];
  if (ctx.isFragment) return findings;
  const html = ctx.doc.documentElement;
  const lang = (html.getAttribute('lang') || '').trim();

  if (!lang) {
    findings.push(
      makeFinding({
        checkId: 'lang',
        severity: 'critical',
        title: 'Page is missing a lang attribute',
        wcagRef: '3.1.1 Language of Page',
        element: '<html>',
        whyItMatters:
          'Screen readers pick their pronunciation engine from the lang attribute. Without it, English text may be read with the wrong voice, or vice versa.',
        fixType: 'auto',
        before: '<html>',
        after: '<html lang="en">',
        fixNote: 'Use the actual language of your content — e.g. lang="zh-Hant" for Traditional Chinese, lang="en" for English.',
      })
    );
  } else if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/.test(lang)) {
    findings.push(
      makeFinding({
        checkId: 'lang',
        severity: 'warning',
        title: `Invalid lang attribute value: "${lang}"`,
        wcagRef: '3.1.1 Language of Page',
        element: `<html lang="${lang}">`,
        whyItMatters: 'An invalid language tag is ignored by assistive technology.',
        fixType: 'auto',
        before: `<html lang="${lang}">`,
        after: '<html lang="en">',
        fixNote: 'Use a valid BCP 47 tag, e.g. "en", "zh-Hant", "ja".',
      })
    );
  } else {
    findings.push(makePass('lang', `Page language declared (${lang})`, '3.1.1 Language of Page'));
  }
  return findings;
}

/* 1.3.1 — Heading hierarchy */
export function checkHeadings(ctx) {
  const findings = [];
  const headings = Array.from(ctx.doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  if (headings.length === 0) {
    if (!ctx.isFragment) {
      findings.push(
        makeFinding({
          checkId: 'headings',
          severity: 'warning',
          title: 'Page has no headings',
          wcagRef: '1.3.1 Info and Relationships',
          element: '<body>',
          whyItMatters:
            'Screen reader users navigate by headings the way sighted users scan visually. A page without headings has no structure to navigate.',
          fixType: 'guided',
          before: null,
          after: '<h1>[Page title]</h1>',
          fixNote: 'Start with a single h1 describing the page, then use h2/h3 for sections.',
        })
      );
    }
    return findings;
  }

  let issues = 0;
  const h1s = headings.filter((h) => h.tagName === 'H1');
  if (h1s.length > 1) {
    issues += 1;
    findings.push(
      makeFinding({
        checkId: 'headings',
        severity: 'warning',
        title: `Multiple h1 elements (${h1s.length})`,
        wcagRef: '1.3.1 Info and Relationships',
        element: h1s.map((h) => snippet(h, 60)).join('\n'),
        whyItMatters: 'A single h1 gives the page one unambiguous title; multiple h1s flatten the document outline.',
        fixType: 'guided',
        before: snippet(h1s[1], 80),
        after: snippet(h1s[1], 80).replace(/h1/gi, 'h2'),
        fixNote: 'Keep the main page title as h1 and demote the others to h2.',
      })
    );
  }
  if (!ctx.isFragment && h1s.length === 0) {
    issues += 1;
    findings.push(
      makeFinding({
        checkId: 'headings',
        severity: 'warning',
        title: 'No h1 on the page',
        wcagRef: '1.3.1 Info and Relationships',
        element: snippet(headings[0], 80),
        whyItMatters: 'The h1 is the page’s title in the document outline — starting at h2 leaves the outline headless.',
        fixType: 'guided',
        before: snippet(headings[0], 80),
        after: snippet(headings[0], 80).replace(new RegExp(headings[0].tagName, 'gi'), 'h1'),
        fixNote: 'Promote the page’s main heading to h1.',
      })
    );
  }

  let prev = 0;
  for (const h of headings) {
    const level = parseInt(h.tagName[1], 10);
    if (prev > 0 && level > prev + 1) {
      issues += 1;
      findings.push(
        makeFinding({
          checkId: 'headings',
          severity: 'warning',
          title: `Skipped heading level (h${prev} → h${level})`,
          wcagRef: '1.3.1 Info and Relationships',
          element: snippet(h, 80),
          whyItMatters:
            'Skipped levels break the outline that screen reader users navigate — they may assume content is missing.',
          fixType: 'auto',
          before: snippet(h, 80),
          after: snippet(h, 80).replace(new RegExp(`h${level}`, 'gi'), `h${prev + 1}`),
          fixNote: 'Pick heading levels for structure, not size — restyle with CSS if the default look is wrong.',
        })
      );
    }
    prev = level;
  }

  if (issues === 0) {
    findings.push(
      makePass('headings', 'Heading hierarchy is correct', '1.3.1 Info and Relationships', `${headings.length} heading(s) checked.`)
    );
  }
  return findings;
}

/* 1.3.5 — Common inputs should declare autocomplete */
const AUTOCOMPLETE_HINTS = [
  { test: (t, n) => t === 'email' || /e-?mail/i.test(n), value: 'email' },
  { test: (t, n) => t === 'tel' || /phone|mobile|tel(?!l)/i.test(n), value: 'tel' },
  { test: (t, n) => /first.?name|given.?name/i.test(n), value: 'given-name' },
  { test: (t, n) => /last.?name|family.?name|surname/i.test(n), value: 'family-name' },
  { test: (t, n) => /full.?name|^name$/i.test(n), value: 'name' },
  { test: (t, n) => /zip|postal/i.test(n), value: 'postal-code' },
  { test: (t, n) => /country/i.test(n), value: 'country-name' },
  { test: (t, n) => /address/i.test(n), value: 'street-address' },
  { test: (t, n) => /user.?name/i.test(n), value: 'username' },
];

export function checkAutocomplete(ctx) {
  const findings = [];
  const inputs = Array.from(ctx.doc.querySelectorAll('input')).filter((el) => el.closest('form'));
  let flagged = 0;
  let applicable = 0;

  for (const input of inputs) {
    if (input.hasAttribute('autocomplete')) continue;
    const type = (input.getAttribute('type') || 'text').toLowerCase();
    const nameId = `${input.getAttribute('name') || ''} ${input.getAttribute('id') || ''}`;
    const hint = AUTOCOMPLETE_HINTS.find((h) => h.test(type, nameId));
    if (!hint) continue;
    applicable += 1;
    flagged += 1;
    const before = openingTag(input);
    findings.push(
      makeFinding({
        checkId: 'autocomplete',
        severity: 'warning',
        title: `Input should declare autocomplete="${hint.value}"`,
        wcagRef: '1.3.5 Identify Input Purpose',
        element: snippet(input),
        whyItMatters:
          'Autocomplete lets browsers and assistive tools fill known personal data automatically — a big help for users with motor or cognitive impairments.',
        fixType: 'auto',
        before,
        after: before.replace(/\/?>$/, (end) => ` autocomplete="${hint.value}"${end === '/>' ? ' />' : '>'}`),
      })
    );
  }
  if (flagged === 0 && inputs.length > 0 && applicable === 0) {
    const declared = inputs.filter((i) => i.hasAttribute('autocomplete')).length;
    if (declared > 0) {
      findings.push(
        makePass('autocomplete', 'Inputs declare autocomplete', '1.3.5 Identify Input Purpose', `${declared} input(s) with autocomplete.`)
      );
    }
  }
  return findings;
}
