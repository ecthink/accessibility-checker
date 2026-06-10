// Shared helpers for the check engine: color math, snippets, finding factory.

let findingCounter = 0;

export function makeFinding({
  checkId,
  severity,
  title,
  wcagRef,
  element = null,
  whyItMatters = '',
  fixType = 'none',
  before = null,
  after = null,
  fixNote = null,
  occurrences = 1,
}) {
  findingCounter += 1;
  return {
    id: `${checkId}-${findingCounter}`,
    checkId,
    severity,
    title,
    wcagRef,
    element,
    whyItMatters,
    fixType,
    before,
    after,
    fixNote,
    occurrences,
  };
}

export function makePass(checkId, title, wcagRef, detail = '') {
  return makeFinding({
    checkId,
    severity: 'pass',
    title,
    wcagRef,
    whyItMatters: detail,
  });
}

// Compact one-line snippet of an element's opening tag (+ a little content).
export function snippet(el, maxLen = 180) {
  let html = el.outerHTML || String(el);
  html = html.replace(/\s+/g, ' ').trim();
  if (html.length > maxLen) html = html.slice(0, maxLen - 1) + '…';
  return html;
}

// Just the opening tag of an element.
export function openingTag(el) {
  const html = el.outerHTML || '';
  const match = html.match(/^<[^>]*>/);
  return match ? match[0] : snippet(el, 120);
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- Color math (WCAG 2.x) ---------- */

// Parse computed-style color strings: rgb(), rgba(), #hex, transparent.
export function parseColor(str) {
  if (!str) return null;
  str = str.trim().toLowerCase();
  if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  let m = str.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }
  // Modern space-separated syntax: rgb(0 0 0 / 0.5)
  m = str.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.%]+)\s*)?\)$/);
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  m = str.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = hex.split('').map((c) => c + c).join('');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return null;
}

// Composite a foreground color with alpha over an opaque background.
export function composite(fg, bg) {
  const a = fg.a === undefined ? 1 : fg.a;
  if (a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

export function relativeLuminance({ r, g, b }) {
  const chan = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

export function contrastRatio(c1, c2) {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function rgbToHex({ r, g, b }) {
  const h = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v, a: 1 };
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
    a: 1,
  };
}

// Find the closest color (same hue/saturation, adjusted lightness) to `fg`
// that meets `target` contrast against `bg`. Returns hex string or null.
export function suggestAccessibleColor(fg, bg, target) {
  const { h, s, l } = rgbToHsl(fg);
  let best = null;
  for (const dir of [-1, 1]) {
    for (let step = 1; step <= 100; step++) {
      const nl = l + dir * step * 0.01;
      if (nl < 0 || nl > 1) break;
      const candidate = hslToRgb({ h, s, l: nl });
      if (contrastRatio(candidate, bg) >= target) {
        if (!best || step < best.step) best = { step, candidate };
        break;
      }
    }
  }
  return best ? rgbToHex(best.candidate) : null;
}

// All CSS text available for static analysis: user-provided CSS + <style> tags.
export function collectCss(ctx) {
  const styleTags = Array.from(ctx.doc.querySelectorAll('style'))
    .map((s) => s.textContent)
    .join('\n');
  return `${ctx.sourceCss || ''}\n${styleTags}`;
}

// Naive CSS rule iterator: strips comments and at-rule wrappers, yields
// { selector, body } pairs. Good enough for pattern-level checks.
export function parseCssRules(cssText) {
  const rules = [];
  if (!cssText) return rules;
  const cleaned = cssText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@(media|supports|layer|container)[^{]*\{/g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const selector = m[1].trim();
    const body = m[2].trim();
    if (selector && !selector.startsWith('@')) rules.push({ selector, body });
  }
  return rules;
}

export function isRendered(el, win) {
  const cs = win.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return false;
  return true;
}
