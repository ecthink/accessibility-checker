// Perceivable checks (WCAG principle 1)

import {
  makeFinding,
  makePass,
  snippet,
  openingTag,
  parseColor,
  composite,
  contrastRatio,
  rgbToHex,
  suggestAccessibleColor,
  collectCss,
  isRendered,
} from '../utils.js';

/* 1.1.1 — Images must have alt text */
export function checkImgAlt(ctx) {
  const findings = [];
  const imgs = Array.from(ctx.doc.querySelectorAll('img'));
  if (imgs.length === 0) return findings;

  let missing = 0;
  for (const img of imgs) {
    if (img.hasAttribute('alt')) continue;
    const role = (img.getAttribute('role') || '').toLowerCase();
    if (role === 'presentation' || role === 'none') continue;
    missing += 1;
    const before = openingTag(img);
    const after = before.replace(/\/?>$/, (end) => ` alt="[describe the image here]"${end === '/>' ? ' />' : '>'}`);
    findings.push(
      makeFinding({
        checkId: 'img-alt',
        severity: 'critical',
        title: 'Image is missing alt text',
        wcagRef: '1.1.1 Non-text Content',
        element: snippet(img),
        whyItMatters:
          'Screen reader users hear nothing (or a raw filename) for this image, so any information it conveys is lost.',
        fixType: 'guided',
        before,
        after,
        fixNote:
          'Describe what the image communicates, not what it looks like ("CEO presenting Q3 results", not "photo"). If the image is purely decorative, use alt="" so screen readers skip it.',
      })
    );
  }
  if (missing === 0) {
    findings.push(
      makePass('img-alt', 'All images have alt attributes', '1.1.1 Non-text Content', `${imgs.length} image(s) checked.`)
    );
  }
  return findings;
}

/* 1.4.3 — Color contrast for text */
export function checkContrast(ctx) {
  const findings = [];
  const { doc, win } = ctx;
  const body = doc.body;
  if (!body) return findings;

  const hasDirectText = (el) =>
    Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'OPTION']);
  const all = Array.from(body.querySelectorAll('*')).filter(
    (el) => !SKIP_TAGS.has(el.tagName) && hasDirectText(el)
  );
  if (hasDirectText(body)) all.unshift(body);

  // Resolve the effective opaque background behind an element by walking up
  // the ancestor chain and compositing. Returns null when indeterminate
  // (e.g. a background-image is in the way).
  const effectiveBackground = (el) => {
    const layers = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = win.getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const bg = parseColor(cs.backgroundColor);
      if (bg && bg.a > 0) {
        layers.push(bg);
        if (bg.a >= 1) break;
      }
      node = node.parentElement;
    }
    let result = { r: 255, g: 255, b: 255, a: 1 }; // document default
    for (let i = layers.length - 1; i >= 0; i--) {
      result = composite(layers[i], result);
    }
    return result;
  };

  const seen = new Map(); // dedupe identical color pairs
  let examined = 0;
  let skippedIndeterminate = 0;

  for (const el of all.slice(0, 800)) {
    if (!isRendered(el, win)) continue;
    const cs = win.getComputedStyle(el);
    const fgRaw = parseColor(cs.color);
    if (!fgRaw) continue;
    const bg = effectiveBackground(el);
    if (!bg) {
      skippedIndeterminate += 1;
      continue;
    }
    const fg = composite(fgRaw, bg);
    examined += 1;

    const size = parseFloat(cs.fontSize) || 16;
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);
    const target = isLarge ? 3 : 4.5;
    const ratio = contrastRatio(fg, bg);
    if (ratio >= target) continue;

    const key = `${rgbToHex(fg)}|${rgbToHex(bg)}|${isLarge}`;
    if (seen.has(key)) {
      seen.get(key).occurrences += 1;
      continue;
    }

    const fgHex = rgbToHex(fg);
    const bgHex = rgbToHex(bg);
    const suggested = suggestAccessibleColor(fg, bg, target);
    const finding = makeFinding({
      checkId: 'contrast',
      severity: 'critical',
      title: `Insufficient color contrast (${ratio.toFixed(2)}:1, needs ${target}:1)`,
      wcagRef: '1.4.3 Contrast (Minimum)',
      element: snippet(el),
      whyItMatters: `Text in ${fgHex} on a ${bgHex} background is hard to read for users with low vision or color deficiencies, and for anyone in bright sunlight.`,
      fixType: suggested ? 'auto' : 'guided',
      before: `color: ${fgHex}; /* ${ratio.toFixed(2)}:1 on ${bgHex} */`,
      after: suggested
        ? `color: ${suggested}; /* ${contrastRatio(parseColor(suggested), bg).toFixed(2)}:1 on ${bgHex} */`
        : `/* Choose a ${isLarge ? '3' : '4.5'}:1+ color against ${bgHex}, or darken/lighten the background */`,
      fixNote: suggested
        ? 'Suggested color keeps the original hue and adjusts lightness just enough to pass. Alternatively, change the background instead.'
        : 'Neither darkening nor lightening this color alone reaches the required ratio — adjust the background as well.',
    });
    seen.set(key, finding);
    findings.push(finding);
  }

  if (findings.length === 0 && examined > 0) {
    findings.push(
      makePass(
        'contrast',
        'Text color contrast meets WCAG AA',
        '1.4.3 Contrast (Minimum)',
        `${examined} text element(s) checked.${skippedIndeterminate ? ` ${skippedIndeterminate} skipped (background images — verify manually).` : ''}`
      )
    );
  }
  return findings;
}

/* 1.3.1 / 3.3.2 — Form inputs need labels */
export function checkFormLabels(ctx) {
  const findings = [];
  const { doc } = ctx;
  const NON_LABELED = new Set(['hidden', 'submit', 'button', 'reset', 'image']);
  const fields = Array.from(doc.querySelectorAll('input, select, textarea')).filter(
    (el) => !(el.tagName === 'INPUT' && NON_LABELED.has((el.getAttribute('type') || 'text').toLowerCase()))
  );
  if (fields.length === 0) return findings;

  let unlabeled = 0;
  for (const field of fields) {
    const id = field.getAttribute('id');
    const hasLabel =
      (field.getAttribute('aria-label') || '').trim() ||
      (field.getAttribute('aria-labelledby') &&
        field
          .getAttribute('aria-labelledby')
          .split(/\s+/)
          .some((ref) => doc.getElementById(ref))) ||
      (id && doc.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
      field.closest('label') ||
      (field.getAttribute('title') || '').trim();
    if (hasLabel) continue;

    unlabeled += 1;
    const name = field.getAttribute('name') || field.getAttribute('placeholder') || 'field';
    const suggestedId = id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const before = openingTag(field);
    const withId = id ? before : before.replace(/^<(\w+)/, `<$1 id="${suggestedId}"`);
    findings.push(
      makeFinding({
        checkId: 'form-label',
        severity: 'critical',
        title: 'Form field has no associated label',
        wcagRef: '3.3.2 Labels or Instructions',
        element: snippet(field),
        whyItMatters:
          'Screen reader users hear only "edit text" with no clue what to type. Placeholders disappear on input and are not a substitute.',
        fixType: 'auto',
        before,
        after: `<label for="${suggestedId}">[${name}]</label>\n${withId}`,
        fixNote: 'The for/id wiring is exact — replace the bracketed label text with the field’s real name.',
      })
    );
  }
  if (unlabeled === 0) {
    findings.push(
      makePass('form-label', 'All form fields are labeled', '3.3.2 Labels or Instructions', `${fields.length} field(s) checked.`)
    );
  }
  return findings;
}

/* 1.4.4 — Avoid px-locked font sizes */
export function checkFontUnits(ctx) {
  const findings = [];
  const css = collectCss(ctx);
  const inlineStyles = Array.from(ctx.doc.querySelectorAll('[style]'))
    .map((el) => el.getAttribute('style'))
    .join(';');
  const re = /font-size\s*:\s*([\d.]+)px/gi;
  const hits = new Set();
  let m;
  while ((m = re.exec(css + ';' + inlineStyles)) !== null) hits.add(m[1]);

  if (hits.size === 0) {
    if (/font-size/i.test(css + inlineStyles)) {
      findings.push(
        makePass('font-units', 'Font sizes use relative units', '1.4.4 Resize Text', 'No px-locked font-size declarations found.')
      );
    }
    return findings;
  }

  const values = Array.from(hits).slice(0, 8);
  findings.push(
    makeFinding({
      checkId: 'font-units',
      severity: 'warning',
      title: 'Font sizes locked in px',
      wcagRef: '1.4.4 Resize Text',
      element: values.map((v) => `font-size: ${v}px`).join('; '),
      whyItMatters:
        'Users who set a larger default font size in their browser are ignored when text is sized in px. Relative units (rem/em) respect their preference.',
      fixType: 'auto',
      before: values.map((v) => `font-size: ${v}px;`).join('\n'),
      after: values.map((v) => `font-size: ${(parseFloat(v) / 16).toFixed(3).replace(/\.?0+$/, '')}rem; /* was ${v}px */`).join('\n'),
      fixNote: 'Conversion assumes the browser default of 16px = 1rem.',
      occurrences: hits.size,
    })
  );
  return findings;
}
