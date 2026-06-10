// Core audit engine: renders user HTML into a sandboxed iframe (scripts
// blocked), runs every check against the live DOM, and scores the result.

import { checkImgAlt, checkContrast, checkFormLabels, checkFontUnits } from './checks/perceivable.js';
import {
  checkKeyboardAccess,
  checkFocusVisible,
  checkTouchTargets,
  checkLinkText,
  checkSkipLink,
  checkTabindex,
} from './checks/operable.js';
import { checkLang, checkHeadings, checkAutocomplete } from './checks/understandable.js';
import { checkDuplicateIds, checkAria, checkLandmarks, checkHtmlValidity } from './checks/robust.js';

const ALL_CHECKS = [
  // Perceivable
  checkImgAlt,
  checkContrast,
  checkFormLabels,
  checkFontUnits,
  // Operable
  checkKeyboardAccess,
  checkFocusVisible,
  checkTouchTargets,
  checkLinkText,
  checkSkipLink,
  checkTabindex,
  // Understandable
  checkLang,
  checkHeadings,
  checkAutocomplete,
  // Robust
  checkDuplicateIds,
  checkAria,
  checkLandmarks,
  checkHtmlValidity,
];

// Items the tool cannot judge — surfaced honestly in every report.
export const MANUAL_CHECKS = [
  { title: 'Video captions & audio transcripts', wcagRef: '1.2.x Time-based Media' },
  { title: 'Alt text quality — the tool checks presence, not whether the description is accurate', wcagRef: '1.1.1' },
  { title: 'Information conveyed by color alone has a real text alternative in context', wcagRef: '1.4.1 Use of Color' },
  { title: 'Animations can be paused, stopped, or hidden', wcagRef: '2.2.2 Pause, Stop, Hide' },
  { title: 'No keyboard traps in custom widgets (modals, menus) — test by tabbing through', wcagRef: '2.1.2 No Keyboard Trap' },
  { title: 'Reading order makes sense when CSS is disabled', wcagRef: '1.3.2 Meaningful Sequence' },
  { title: 'Form errors are announced and explained when they occur', wcagRef: '3.3.1 Error Identification' },
  { title: 'Test with a real screen reader (VoiceOver, NVDA) before shipping', wcagRef: '—' },
];

function createSandbox(html, css) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    // allow-same-origin lets us read contentDocument; scripts stay blocked.
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.style.cssText =
      'position:absolute;left:-99999px;top:0;width:1280px;height:800px;visibility:hidden;pointer-events:none;';

    const timer = setTimeout(() => {
      iframe.remove();
      reject(new Error('Rendering timed out'));
    }, 10000);

    iframe.addEventListener('load', () => {
      const doc = iframe.contentDocument;
      // The iframe fires an initial load for about:blank before the srcdoc
      // content arrives — wait for the real document.
      if (doc && doc.URL === 'about:blank') return;
      clearTimeout(timer);
      if (!doc) {
        iframe.remove();
        reject(new Error('Could not access the sandboxed document'));
        return;
      }
      if (css) {
        const style = doc.createElement('style');
        style.textContent = css;
        (doc.head || doc.documentElement).appendChild(style);
      }
      resolve({
        doc,
        win: iframe.contentWindow,
        destroy: () => iframe.remove(),
      });
    });

    document.body.appendChild(iframe);
    iframe.srcdoc = html;
  });
}

/* Scoring: start at 100; critical −12, warning −4, with diminishing
   deductions for repeats of the same check type, capped per type. */
const BASE_DEDUCTION = { critical: 12, warning: 4 };
const REPEAT_FACTOR = 0.6;
const CAP_MULTIPLIER = 2.5;

function deductionFor(group) {
  const base = BASE_DEDUCTION[group[0].severity] || 0;
  // Expand aggregated findings (occurrences) into virtual instances, capped.
  const instances = Math.min(
    group.reduce((sum, f) => sum + (f.occurrences || 1), 0),
    12
  );
  let d = 0;
  for (let i = 0; i < instances; i++) d += base * Math.pow(REPEAT_FACTOR, i);
  return Math.min(d, base * CAP_MULTIPLIER);
}

function scoreFindings(issues) {
  const groups = new Map();
  for (const f of issues) {
    if (!groups.has(f.checkId)) groups.set(f.checkId, []);
    groups.get(f.checkId).push(f);
  }
  let total = 0;
  for (const group of groups.values()) total += deductionFor(group);
  return Math.max(0, Math.round(100 - total));
}

export function ratingFor(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Needs Work';
  return 'Poor';
}

const SEVERITY_ORDER = { critical: 0, warning: 1, pass: 2 };

export async function runAudit({ html, css = '' }) {
  if (!html || !html.trim()) throw new Error('No HTML to audit');

  const isFragment = !/<\s*(!doctype|html|head|body)[\s>]/i.test(html);
  const sandbox = await createSandbox(html, css);

  try {
    const ctx = {
      doc: sandbox.doc,
      win: sandbox.win,
      isFragment,
      sourceHtml: html,
      sourceCss: css,
    };

    const findings = [];
    for (const check of ALL_CHECKS) {
      try {
        findings.push(...check(ctx));
      } catch (err) {
        // One broken check must not kill the whole audit.
        console.error(`Check failed: ${check.name}`, err);
      }
    }

    findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

    const issues = findings.filter((f) => f.severity !== 'pass');
    const score = scoreFindings(issues);
    // Potential score = what remains after fixing everything fixable.
    const unfixable = issues.filter((f) => f.fixType === 'none');
    const potentialScore = scoreFindings(unfixable);

    return {
      findings,
      score,
      potentialScore,
      rating: ratingFor(score),
      counts: {
        critical: issues.filter((f) => f.severity === 'critical').length,
        warning: issues.filter((f) => f.severity === 'warning').length,
        pass: findings.filter((f) => f.severity === 'pass').length,
      },
      isFragment,
      manualChecks: MANUAL_CHECKS,
    };
  } finally {
    sandbox.destroy();
  }
}
