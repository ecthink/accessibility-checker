// Self-audit: feed this very page into the engine.

import { runAudit } from './engine/engine.js';
import { renderReport } from './report.js';

// Capture the page HTML at load time, before any report markup is injected —
// otherwise a second run would audit the first run's rendered findings.
const PAGE_HTML = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

const btn = document.querySelector('#self-audit-btn');
const statusEl = document.querySelector('#status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusEl.classList.remove('error');
  statusEl.textContent = 'Auditing this very page…';
  try {
    const result = await runAudit({ html: PAGE_HTML });
    renderReport(result);
    document.querySelector('#report').hidden = false;
    statusEl.textContent = '';
    document.querySelector('#score-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Audit failed: ${err.message}`;
    statusEl.classList.add('error');
  } finally {
    btn.disabled = false;
  }
});
