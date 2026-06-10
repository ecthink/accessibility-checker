// Shared report renderer — used by the main checker (app.js) and the
// about page's self-audit (about.js). Expects the page to contain
// #score-card, #filters, #findings and #manual-list containers.

import { escapeHtml } from './engine/utils.js';

const $ = (sel) => document.querySelector(sel);

const RATING_CLASSES = {
  Excellent: 'rating-excellent',
  Good: 'rating-good',
  'Needs Work': 'rating-needs-work',
  Poor: 'rating-poor',
};

export function renderReport(result, opts = {}) {
  renderScoreCard(result, opts);
  renderFilters(result);
  renderFindings(result.findings, 'all');
  renderManualChecks(result.manualChecks);
}

function renderScoreCard(result, opts) {
  const { score, potentialScore, rating, counts, isFragment } = result;
  const ratingClass = RATING_CLASSES[rating];
  $('#score-card').innerHTML = `
    <p class="kicker">Accessibility score</p>
    <p class="score-value">
      <span class="score-number ${ratingClass}">${score}</span>
      <span class="score-denom">/100</span>
    </p>
    <p class="score-rating ${ratingClass}">${rating}</p>
    <div class="score-meter" role="img"
         aria-label="Accessibility score: ${score} out of 100, rated ${rating}">
      <div class="meter-track">
        <div class="meter-seg poor"></div>
        <div class="meter-seg needs"></div>
        <div class="meter-seg good"></div>
        <div class="meter-seg excellent"></div>
        <div class="meter-marker" style="left:${score}%"></div>
      </div>
      <div class="meter-ticks" aria-hidden="true">
        <span style="left:0">0</span>
        <span style="left:50%">50</span>
        <span style="left:70%">70</span>
        <span style="left:90%">90</span>
        <span style="left:100%">100</span>
      </div>
    </div>
    ${
      potentialScore > score
        ? `<p class="score-potential">Fix the issues below and this becomes <strong>${potentialScore}</strong>.</p>`
        : ''
    }
    <dl class="stat-rows">
      <div class="stat-row">
        <dt><span class="swatch critical" aria-hidden="true"></span>Critical</dt>
        <dd>${counts.critical}</dd>
      </div>
      <div class="stat-row">
        <dt><span class="swatch warning" aria-hidden="true"></span>Warnings</dt>
        <dd>${counts.warning}</dd>
      </div>
      <div class="stat-row">
        <dt><span class="swatch pass" aria-hidden="true"></span>Passed</dt>
        <dd>${counts.pass}</dd>
      </div>
    </dl>
    ${
      opts.shellWarning
        ? `<p class="fragment-note">${escapeHtml(opts.shellWarning)}</p>`
        : ''
    }
    ${
      isFragment
        ? '<p class="fragment-note">Analyzed as an HTML snippet — page-level checks (lang attribute, landmarks, skip link) were skipped.</p>'
        : ''
    }`;
}

let currentFindings = [];

function renderFilters(result) {
  currentFindings = result.findings;
  const { counts } = result;
  const filters = [
    { key: 'all', label: 'All findings', count: counts.critical + counts.warning + counts.pass },
    { key: 'critical', label: 'Critical', count: counts.critical },
    { key: 'warning', label: 'Warnings', count: counts.warning },
    { key: 'pass', label: 'Passed', count: counts.pass },
  ];
  const el = $('#filters');
  el.innerHTML = filters
    .map(
      (f) =>
        `<button class="filter-btn" data-filter="${f.key}" aria-pressed="${f.key === 'all'}">
          <span>${f.label}</span><span class="filter-count">${f.count}</span>
        </button>`
    )
    .join('');
  el.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.filter-btn').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      renderFindings(currentFindings, btn.dataset.filter);
    });
  });
}

function renderFindings(findings, filter) {
  const visible = filter === 'all' ? findings : findings.filter((f) => f.severity === filter);
  const container = $('#findings');
  if (visible.length === 0) {
    container.innerHTML = '<p>No findings in this category.</p>';
    return;
  }
  container.innerHTML = visible.map((f, i) => findingCard(f, i)).join('');

  container.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const code = btn.closest('.fix-row').nextElementSibling.textContent;
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copied ✓';
        setTimeout(() => (btn.textContent = 'Copy fixed code'), 1500);
      } catch {
        btn.textContent = 'Copy failed';
      }
    });
  });
}

function findingCard(f, index) {
  const occurrences =
    (f.occurrences || 1) > 1 ? ` <span class="occurrence-count">×${f.occurrences}</span>` : '';
  const fixTag =
    f.severity !== 'pass' && f.fixType !== 'none'
      ? `<span class="fix-type-tag ${f.fixType}">${f.fixType === 'auto' ? 'Auto-fixable' : 'Guided fix'}</span>`
      : '';

  let body = `<div class="finding-tags"><span class="wcag-ref">WCAG ${escapeHtml(f.wcagRef)}</span>${fixTag}</div>`;
  if (f.whyItMatters) body += `<p class="why">${escapeHtml(f.whyItMatters)}</p>`;
  if (f.element && f.severity !== 'pass') {
    body += `<p class="code-label">Affected element</p>
      <pre class="code-block">${escapeHtml(f.element)}</pre>`;
  }
  if (f.before) {
    body += `<p class="code-label">Before</p>
      <pre class="code-block before">${escapeHtml(f.before)}</pre>`;
  }
  if (f.after) {
    body += `<div class="fix-row">
        <p class="code-label">After</p>
        <button class="copy-btn" type="button">Copy fixed code</button>
      </div>
      <pre class="code-block after">${escapeHtml(f.after)}</pre>`;
  }
  if (f.fixNote) body += `<p class="fix-note">${escapeHtml(f.fixNote)}</p>`;

  return `
    <details class="finding ${f.severity}"${f.severity === 'critical' ? ' open' : ''}>
      <summary>
        <span class="finding-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
        <span class="severity-badge ${f.severity}">${f.severity}</span>
        <span class="finding-title">${escapeHtml(f.title)}${occurrences}</span>
      </summary>
      <div class="finding-body">${body}</div>
    </details>`;
}

function renderManualChecks(items) {
  $('#manual-list').innerHTML = items
    .map(
      (item) =>
        `<li>${escapeHtml(item.title)} <span class="wcag-inline">(${escapeHtml(item.wcagRef)})</span></li>`
    )
    .join('');
}
