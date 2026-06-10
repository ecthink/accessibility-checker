// Operable checks (WCAG principle 2)

import {
  makeFinding,
  makePass,
  snippet,
  openingTag,
  collectCss,
  parseCssRules,
  isRendered,
} from '../utils.js';

const NATIVE_INTERACTIVE = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);

/* 2.1.1 — Interactive elements must be keyboard-operable */
export function checkKeyboardAccess(ctx) {
  const findings = [];
  const { doc } = ctx;
  const candidates = Array.from(doc.querySelectorAll('[onclick], [role="button"], [role="link"]'));
  let flagged = 0;

  for (const el of candidates) {
    if (NATIVE_INTERACTIVE.has(el.tagName)) continue;
    if (el.hasAttribute('tabindex') && parseInt(el.getAttribute('tabindex'), 10) >= 0) continue;
    flagged += 1;
    const tag = el.tagName.toLowerCase();
    const inner = el.textContent.trim().slice(0, 40) || '…';
    findings.push(
      makeFinding({
        checkId: 'keyboard-access',
        severity: 'critical',
        title: `Clickable <${tag}> is not keyboard-accessible`,
        wcagRef: '2.1.1 Keyboard',
        element: snippet(el),
        whyItMatters:
          'Keyboard and switch-device users cannot Tab to this element or activate it with Enter/Space — the action is unreachable without a mouse.',
        fixType: 'guided',
        before: snippet(el),
        after: `<button type="button" onclick="…">${inner}</button>`,
        fixNote:
          'Prefer a native <button> — it is focusable and keyboard-operable for free. If you must keep the <' +
          tag +
          '>, add tabindex="0", role="button", and a keydown handler for Enter and Space.',
      })
    );
  }
  if (flagged === 0 && candidates.length > 0) {
    findings.push(
      makePass('keyboard-access', 'Interactive elements are keyboard-accessible', '2.1.1 Keyboard', `${candidates.length} element(s) checked.`)
    );
  }
  return findings;
}

/* 2.4.7 — Focus must stay visible */
export function checkFocusVisible(ctx) {
  const findings = [];
  const css = collectCss(ctx);
  const rules = parseCssRules(css);

  const removesOutline = (body) => /outline\s*:\s*(none|0)(px)?\s*(!important)?\s*(;|$)/i.test(body);
  const providesAlternative = (body) =>
    /box-shadow\s*:(?!\s*none)|border\s*:(?!\s*none)|outline\s*:(?!\s*(none|0))/i.test(body);

  // Does any rule in the sheet define a visible focus style?
  const hasFocusStyleSomewhere = rules.some(
    (r) => /:focus/.test(r.selector) && providesAlternative(r.body)
  );

  let flagged = 0;
  for (const rule of rules) {
    if (!removesOutline(rule.body)) continue;
    if (providesAlternative(rule.body)) continue;
    flagged += 1;
    const baseSelector = rule.selector.replace(/:focus(-visible|-within)?/g, '').trim() || 'a, button';
    findings.push(
      makeFinding({
        checkId: 'focus-visible',
        severity: hasFocusStyleSomewhere ? 'warning' : 'critical',
        title: 'Focus outline removed without a replacement',
        wcagRef: '2.4.7 Focus Visible',
        element: `${rule.selector} { ${rule.body} }`,
        whyItMatters:
          'Sighted keyboard users rely on the focus ring to know where they are on the page. Removing it without a substitute makes keyboard navigation blind.',
        fixType: 'auto',
        before: `${rule.selector} { outline: none; }`,
        after: `${baseSelector}:focus-visible {\n  outline: 2px solid #4f46e5;\n  outline-offset: 2px;\n}`,
        fixNote: hasFocusStyleSomewhere
          ? 'A :focus style exists elsewhere in this CSS — verify it actually covers these elements.'
          : ':focus-visible shows the ring for keyboard users only, so mouse users never see it. There is rarely a good reason to remove it entirely.',
      })
    );
  }
  if (flagged === 0 && rules.length > 0) {
    findings.push(
      makePass('focus-visible', 'No focus outlines removed', '2.4.7 Focus Visible', `${rules.length} CSS rule(s) scanned.`)
    );
  }
  return findings;
}

/* 2.5.5 — Touch targets should be at least 44×44px */
export function checkTouchTargets(ctx) {
  const findings = [];
  const { doc, win } = ctx;
  // Text-entry fields are excluded — typing targets are generously sized by
  // their nature; 2.5.5 is about pointer-activation targets.
  const CLICKY_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'range']);
  const targets = Array.from(
    doc.querySelectorAll('a[href], button, input, [role="button"]')
  ).filter(
    (el) =>
      el.tagName !== 'INPUT' || CLICKY_INPUT_TYPES.has((el.getAttribute('type') || 'text').toLowerCase())
  );
  if (targets.length === 0) return findings;

  const seen = new Set();
  let measured = 0;
  let flagged = 0;
  for (const el of targets) {
    if (!isRendered(el, win)) continue;
    const cs = win.getComputedStyle(el);
    // Inline links inside text are exempt under 2.5.5
    if (el.tagName === 'A' && cs.display === 'inline') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    measured += 1;
    if (rect.width >= 44 && rect.height >= 44) continue;

    flagged += 1;
    const key = `${el.tagName}.${el.className}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push(
      makeFinding({
        checkId: 'touch-target',
        severity: 'warning',
        title: `Touch target too small (${Math.round(rect.width)}×${Math.round(rect.height)}px)`,
        wcagRef: '2.5.5 Target Size',
        element: snippet(el),
        whyItMatters:
          'Small targets are hard to tap for users with motor impairments, tremors, or simply large thumbs. 44×44px is the recommended minimum.',
        fixType: 'auto',
        before: `/* current rendered size: ${Math.round(rect.width)}×${Math.round(rect.height)}px */`,
        after: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''} {\n  min-width: 44px;\n  min-height: 44px;\n}`,
        fixNote: 'Padding also counts toward the target size — increasing padding is often the least disruptive fix.',
      })
    );
  }
  if (flagged === 0 && measured > 0) {
    findings.push(
      makePass('touch-target', 'Touch targets are large enough', '2.5.5 Target Size', `${measured} target(s) measured.`)
    );
  }
  return findings;
}

/* 2.4.4 — Link text should describe the destination */
const GENERIC_LINK_TEXT = new Set([
  'click here', 'click', 'here', 'read more', 'more', 'learn more',
  'link', 'this', 'details', 'go', 'view', 'see more', 'info',
]);

export function checkLinkText(ctx) {
  const findings = [];
  const links = Array.from(ctx.doc.querySelectorAll('a[href]'));
  if (links.length === 0) return findings;

  let flagged = 0;
  for (const link of links) {
    const ariaLabel = (link.getAttribute('aria-label') || '').trim();
    const text = (ariaLabel || link.textContent || '').trim().replace(/\s+/g, ' ');
    const normalized = text.toLowerCase().replace(/[^\w\s]/g, '').trim();

    if (!text && !link.querySelector('img[alt]:not([alt=""])')) {
      flagged += 1;
      findings.push(
        makeFinding({
          checkId: 'link-name',
          severity: 'critical',
          title: 'Link has no accessible name',
          wcagRef: '2.4.4 Link Purpose (In Context)',
          element: snippet(link),
          whyItMatters:
            'Screen readers announce this as just "link" — users have no idea where it goes.',
          fixType: 'guided',
          before: snippet(link),
          after: openingTag(link).replace('>', ' aria-label="[where this link goes]">') + '…</a>',
          fixNote: 'Add visible text if possible; aria-label is the fallback for icon-only links.',
        })
      );
      continue;
    }
    if (GENERIC_LINK_TEXT.has(normalized)) {
      flagged += 1;
      findings.push(
        makeFinding({
          checkId: 'link-text-generic',
          severity: 'warning',
          title: `Generic link text: “${text}”`,
          wcagRef: '2.4.4 Link Purpose (In Context)',
          element: snippet(link),
          whyItMatters:
            'Screen reader users often pull up a list of all links on a page — ten links that all say "read more" are indistinguishable.',
          fixType: 'guided',
          before: `<a href="…">${text}</a>`,
          after: `<a href="…">${text === 'click here' ? '[Download the 2026 annual report]' : `[${text}: what it actually points to]`}</a>`,
          fixNote: 'Make the link text describe the destination so it stands alone out of context.',
        })
      );
    }
  }
  if (flagged === 0) {
    findings.push(
      makePass('link-text', 'Link text is descriptive', '2.4.4 Link Purpose (In Context)', `${links.length} link(s) checked.`)
    );
  }
  return findings;
}

/* 2.4.1 — Skip navigation link (full pages only) */
export function checkSkipLink(ctx) {
  const findings = [];
  if (ctx.isFragment) return findings;
  const { doc } = ctx;
  const navLinks = doc.querySelectorAll('nav a, header a');
  // Only meaningful when there is navigation to skip
  if (navLinks.length < 3) return findings;

  const hasSkip = Array.from(doc.querySelectorAll('a[href^="#"]')).some(
    (a) => /skip/i.test(a.textContent) || /^#(main|content|main-content)$/i.test(a.getAttribute('href'))
  );
  if (hasSkip) {
    findings.push(makePass('skip-link', 'Skip navigation link present', '2.4.1 Bypass Blocks'));
  } else {
    findings.push(
      makeFinding({
        checkId: 'skip-link',
        severity: 'warning',
        title: 'No skip navigation link',
        wcagRef: '2.4.1 Bypass Blocks',
        element: '<body> — first focusable element',
        whyItMatters:
          'Keyboard users must Tab through every navigation link on every page before reaching the content. A skip link lets them jump straight to it.',
        fixType: 'auto',
        before: '<body>\n  <header>…</header>',
        after:
          '<body>\n  <a class="skip-link" href="#main">Skip to main content</a>\n  <header>…</header>\n\n/* CSS: visually hidden until focused */\n.skip-link {\n  position: absolute;\n  left: -9999px;\n}\n.skip-link:focus {\n  left: 8px;\n  top: 8px;\n}',
        fixNote: 'Make sure the target element has id="main" (typically your <main> landmark).',
      })
    );
  }
  return findings;
}

/* 2.4.3 — Positive tabindex disrupts focus order */
export function checkTabindex(ctx) {
  const findings = [];
  const els = Array.from(ctx.doc.querySelectorAll('[tabindex]')).filter(
    (el) => parseInt(el.getAttribute('tabindex'), 10) > 0
  );
  for (const el of els.slice(0, 5)) {
    findings.push(
      makeFinding({
        checkId: 'tabindex-positive',
        severity: 'warning',
        title: `Positive tabindex (${el.getAttribute('tabindex')}) overrides natural focus order`,
        wcagRef: '2.4.3 Focus Order',
        element: snippet(el),
        whyItMatters:
          'Positive tabindex values hijack the Tab order away from the visual reading order, which disorients keyboard users.',
        fixType: 'auto',
        before: openingTag(el),
        after: openingTag(el).replace(/tabindex="[^"]*"/, 'tabindex="0"'),
        fixNote: 'Use tabindex="0" and let DOM order define the sequence — reorder the markup if the focus order is wrong.',
      })
    );
  }
  return findings;
}
