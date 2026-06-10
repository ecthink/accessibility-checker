// Robust checks (WCAG principle 4)

import { makeFinding, makePass, snippet, openingTag } from '../utils.js';

/* 4.1.1 — No duplicate ids */
export function checkDuplicateIds(ctx) {
  const findings = [];
  const { doc } = ctx;
  const byId = new Map();
  for (const el of doc.querySelectorAll('[id]')) {
    const id = el.getAttribute('id');
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(el);
  }
  if (byId.size === 0) return findings;

  // An id duplicate is critical when something references it (labels, ARIA, anchors)
  const referenced = new Set();
  for (const el of doc.querySelectorAll('[for], [aria-labelledby], [aria-describedby], [aria-controls], a[href^="#"]')) {
    const refs = [
      el.getAttribute('for'),
      ...(el.getAttribute('aria-labelledby') || '').split(/\s+/),
      ...(el.getAttribute('aria-describedby') || '').split(/\s+/),
      ...(el.getAttribute('aria-controls') || '').split(/\s+/),
      (el.getAttribute('href') || '').replace(/^#/, ''),
    ].filter(Boolean);
    refs.forEach((r) => referenced.add(r));
  }

  let flagged = 0;
  for (const [id, els] of byId) {
    if (els.length < 2) continue;
    flagged += 1;
    const isReferenced = referenced.has(id);
    findings.push(
      makeFinding({
        checkId: 'duplicate-id',
        severity: isReferenced ? 'critical' : 'warning',
        title: `Duplicate id "${id}" (${els.length} elements)${isReferenced ? ' — referenced by labels/ARIA' : ''}`,
        wcagRef: '4.1.1 Parsing',
        element: els.map((el) => openingTag(el)).join('\n'),
        whyItMatters: isReferenced
          ? 'Labels and ARIA references resolve to the first element with this id — the others silently lose their association.'
          : 'Duplicate ids make label/ARIA wiring and anchor links unreliable.',
        fixType: 'auto',
        before: openingTag(els[1]),
        after: openingTag(els[1]).replace(`id="${id}"`, `id="${id}-2"`),
        fixNote: 'Rename each duplicate to a unique id and update anything that references it.',
        occurrences: els.length - 1,
      })
    );
  }
  if (flagged === 0) {
    findings.push(makePass('duplicate-id', 'All ids are unique', '4.1.1 Parsing', `${byId.size} id(s) checked.`));
  }
  return findings;
}

/* 4.1.2 — Valid ARIA usage */
const VALID_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'button', 'cell', 'checkbox',
  'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'dialog',
  'directory', 'document', 'feed', 'figure', 'form', 'grid', 'gridcell', 'group', 'heading',
  'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu',
  'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'navigation', 'none', 'note',
  'option', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup',
  'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton',
  'status', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term', 'textbox', 'timer',
  'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
]);

const VALID_ARIA_ATTRS = new Set([
  'aria-activedescendant', 'aria-atomic', 'aria-autocomplete', 'aria-braillelabel',
  'aria-brailleroledescription', 'aria-busy', 'aria-checked', 'aria-colcount', 'aria-colindex',
  'aria-colspan', 'aria-controls', 'aria-current', 'aria-describedby', 'aria-description',
  'aria-details', 'aria-disabled', 'aria-errormessage', 'aria-expanded', 'aria-flowto',
  'aria-haspopup', 'aria-hidden', 'aria-invalid', 'aria-keyshortcuts', 'aria-label',
  'aria-labelledby', 'aria-level', 'aria-live', 'aria-modal', 'aria-multiline',
  'aria-multiselectable', 'aria-orientation', 'aria-owns', 'aria-placeholder', 'aria-posinset',
  'aria-pressed', 'aria-readonly', 'aria-relevant', 'aria-required', 'aria-roledescription',
  'aria-rowcount', 'aria-rowindex', 'aria-rowspan', 'aria-selected', 'aria-setsize',
  'aria-sort', 'aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext',
]);

// Roles that require specific attributes when not implied by a native element
const REQUIRED_ARIA = {
  checkbox: 'aria-checked',
  radio: 'aria-checked',
  switch: 'aria-checked',
  slider: 'aria-valuenow',
  heading: 'aria-level',
  combobox: 'aria-expanded',
};

export function checkAria(ctx) {
  const findings = [];
  const { doc } = ctx;
  let flagged = 0;
  let checked = 0;

  for (const el of doc.querySelectorAll('[role]')) {
    checked += 1;
    const role = (el.getAttribute('role') || '').trim().toLowerCase().split(/\s+/)[0];
    if (!VALID_ROLES.has(role)) {
      flagged += 1;
      findings.push(
        makeFinding({
          checkId: 'aria-role',
          severity: 'critical',
          title: `Invalid ARIA role: "${role}"`,
          wcagRef: '4.1.2 Name, Role, Value',
          element: snippet(el),
          whyItMatters: 'An unrecognized role is ignored by assistive technology, so the element loses its intended semantics.',
          fixType: 'guided',
          before: openingTag(el),
          after: openingTag(el).replace(/role="[^"]*"/, 'role="[valid role]"'),
          fixNote: 'Check the ARIA spec for the role you intended — or better, use the equivalent native HTML element.',
        })
      );
      continue;
    }
    const required = REQUIRED_ARIA[role];
    if (required && !el.hasAttribute(required) && !(el.tagName === 'INPUT')) {
      flagged += 1;
      findings.push(
        makeFinding({
          checkId: 'aria-required-attr',
          severity: 'critical',
          title: `role="${role}" is missing required ${required}`,
          wcagRef: '4.1.2 Name, Role, Value',
          element: snippet(el),
          whyItMatters: `Without ${required}, assistive technology cannot announce the state of this ${role} — users hear the control but not whether it is on, off, or where it sits.`,
          fixType: 'auto',
          before: openingTag(el),
          after: openingTag(el).replace('>', ` ${required}="${required === 'aria-checked' || required === 'aria-expanded' ? 'false' : required === 'aria-level' ? '2' : '50'}">`),
          fixNote: 'Remember to update this attribute from JavaScript whenever the state changes.',
        })
      );
    }
  }

  // Unknown aria-* attributes
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of el.attributes || []) {
      if (!attr.name.startsWith('aria-')) continue;
      checked += 1;
      if (!VALID_ARIA_ATTRS.has(attr.name)) {
        flagged += 1;
        findings.push(
          makeFinding({
            checkId: 'aria-attr',
            severity: 'warning',
            title: `Unknown ARIA attribute: ${attr.name}`,
            wcagRef: '4.1.2 Name, Role, Value',
            element: snippet(el),
            whyItMatters: 'Misspelled ARIA attributes are silently ignored — the accessibility you think you added does not exist.',
            fixType: 'guided',
            before: `${attr.name}="${attr.value}"`,
            after: '/* check spelling against the WAI-ARIA spec */',
          })
        );
      }
    }
  }

  // aria-labelledby / aria-describedby referencing missing ids
  for (const el of doc.querySelectorAll('[aria-labelledby], [aria-describedby]')) {
    for (const attrName of ['aria-labelledby', 'aria-describedby']) {
      const value = el.getAttribute(attrName);
      if (!value) continue;
      checked += 1;
      const missing = value.split(/\s+/).filter((id) => id && !doc.getElementById(id));
      if (missing.length > 0) {
        flagged += 1;
        findings.push(
          makeFinding({
            checkId: 'aria-idref',
            severity: 'critical',
            title: `${attrName} points to missing id(s): ${missing.join(', ')}`,
            wcagRef: '4.1.2 Name, Role, Value',
            element: snippet(el),
            whyItMatters: 'The reference resolves to nothing, so the element has no accessible name/description despite appearing labeled in the code.',
            fixType: 'guided',
            before: `${attrName}="${value}"`,
            after: `${attrName}="[id of an existing element]"`,
            fixNote: 'Add the missing element, or fix the id reference.',
          })
        );
      }
    }
  }

  // aria-hidden on focusable elements
  for (const el of doc.querySelectorAll('[aria-hidden="true"]')) {
    checked += 1;
    const focusable =
      ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) ||
      el.querySelector('a[href], button, input, select, textarea, [tabindex]') ||
      (el.hasAttribute('tabindex') && parseInt(el.getAttribute('tabindex'), 10) >= 0);
    if (focusable) {
      flagged += 1;
      findings.push(
        makeFinding({
          checkId: 'aria-hidden-focus',
          severity: 'critical',
          title: 'aria-hidden="true" on a focusable element',
          wcagRef: '4.1.2 Name, Role, Value',
          element: snippet(el),
          whyItMatters:
            'Keyboard users can still Tab into this element, but screen readers announce nothing — focus lands on a ghost.',
          fixType: 'guided',
          before: openingTag(el),
          after: '/* either remove aria-hidden, or also remove it from the tab order (tabindex="-1" / disabled) */',
        })
      );
    }
  }

  if (flagged === 0 && checked > 0) {
    findings.push(makePass('aria', 'ARIA usage is valid', '4.1.2 Name, Role, Value', `${checked} ARIA usage(s) checked.`));
  }
  return findings;
}

/* 1.3.1 / 4.1.2 — Semantic landmarks (full pages only) */
export function checkLandmarks(ctx) {
  const findings = [];
  if (ctx.isFragment) return findings;
  const { doc } = ctx;
  let flagged = 0;

  if (!doc.querySelector('main, [role="main"]')) {
    flagged += 1;
    findings.push(
      makeFinding({
        checkId: 'landmarks',
        severity: 'warning',
        title: 'No <main> landmark',
        wcagRef: '1.3.1 Info and Relationships',
        element: '<body>',
        whyItMatters:
          'Screen reader users jump between landmarks (main, nav, header) to move around quickly. Without <main>, there is no "go to content" shortcut.',
        fixType: 'guided',
        before: '<body>\n  <div class="content">…</div>\n</body>',
        after: '<body>\n  <main id="main">…</main>\n</body>',
        fixNote: 'Wrap the primary content in a single <main> element.',
      })
    );
  }

  const navLinkCount = doc.querySelectorAll('a[href]').length;
  if (navLinkCount >= 5 && !doc.querySelector('nav, [role="navigation"]')) {
    flagged += 1;
    findings.push(
      makeFinding({
        checkId: 'landmarks',
        severity: 'warning',
        title: 'Navigation links without a <nav> landmark',
        wcagRef: '1.3.1 Info and Relationships',
        element: `${navLinkCount} links found, no <nav>`,
        whyItMatters: 'Grouping navigation in <nav> lets assistive technology users skip or jump to it directly.',
        fixType: 'guided',
        before: '<div class="menu">\n  <a href="…">…</a>\n</div>',
        after: '<nav aria-label="Main">\n  <a href="…">…</a>\n</nav>',
      })
    );
  }

  if (flagged === 0) {
    findings.push(makePass('landmarks', 'Page uses semantic landmarks', '1.3.1 Info and Relationships'));
  }
  return findings;
}

/* 4.1.1 — Lightweight tag-balance validation */
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

export function checkHtmlValidity(ctx) {
  const findings = [];
  const source = (ctx.sourceHtml || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');

  const counts = {};
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)[^>]*?(\/?)>/g;
  let m;
  while ((m = tagRe.exec(source)) !== null) {
    const [, closing, rawName, selfClose] = m;
    const name = rawName.toLowerCase();
    if (VOID_ELEMENTS.has(name) || selfClose === '/') continue;
    counts[name] = (counts[name] || 0) + (closing ? -1 : 1);
  }
  const unbalanced = Object.entries(counts).filter(([, n]) => n !== 0);

  if (unbalanced.length > 0) {
    findings.push(
      makeFinding({
        checkId: 'html-validity',
        severity: 'warning',
        title: `Possibly unclosed tags: ${unbalanced.map(([t, n]) => `<${t}> (${n > 0 ? '+' : ''}${n})`).join(', ')}`,
        wcagRef: '4.1.1 Parsing',
        element: unbalanced.map(([t]) => `<${t}>`).join(', '),
        whyItMatters:
          'Browsers silently repair broken markup, but each repairs it differently — assistive technology may read a different structure than you intended.',
        fixType: 'guided',
        before: null,
        after: null,
        fixNote: 'A positive count means more opening than closing tags. This is a heuristic — verify with an HTML validator.',
      })
    );
  } else {
    findings.push(makePass('html-validity', 'Tags appear balanced', '4.1.1 Parsing'));
  }
  return findings;
}
