// UI wiring for the main checker: input screen, audit trigger.

import { runAudit } from './engine/engine.js';
import { renderReport } from './report.js';

const $ = (sel) => document.querySelector(sel);

/* ---------- Tabs ---------- */
const tabs = [$('#tab-code'), $('#tab-url')];
const panels = { 'tab-code': $('#panel-code'), 'tab-url': $('#panel-url') };

function selectTab(tab) {
  for (const t of tabs) {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
    panels[t.id].hidden = !selected;
  }
  tab.focus();
}

tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      selectTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]);
    }
  });
});

/* ---------- Status helper ---------- */
const statusEl = $('#status');
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

/* ---------- Sample snippet ---------- */
const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Acme Store</title>
  <style>
    body { font-family: sans-serif; }
    .subtitle { color: #999; font-size: 13px; }
    a { outline: none; }
    .icon-btn { width: 24px; height: 24px; }
  </style>
</head>
<body>
  <div class="header">
    <img src="logo.png">
    <a href="/products">Products</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
    <a href="/blog">Blog</a>
    <a href="/careers">Careers</a>
  </div>
  <h1>Welcome to Acme</h1>
  <p class="subtitle">The best products on the internet</p>
  <h4>Featured deals</h4>
  <p>Check out our newest arrivals. <a href="/new">Click here</a></p>
  <div onclick="openCart()">View cart 🛒</div>
  <form>
    <input type="text" name="email" placeholder="Your email">
    <button class="icon-btn" id="submit">→</button>
    <span id="submit">Subscribe to our newsletter</span>
  </form>
  <div role="buton">Sign up</div>
</body>
</html>`;

$('#load-sample').addEventListener('click', () => {
  $('#html-input').value = SAMPLE_HTML;
  $('#css-input').value = '';
  setStatus('Example loaded — it contains deliberate issues. Hit Run Audit.');
});

/* ---------- Run audit (code) ---------- */
const runCodeBtn = $('#run-code');
runCodeBtn.addEventListener('click', async () => {
  const html = $('#html-input').value;
  if (!html.trim()) {
    setStatus('Paste some HTML first.', true);
    $('#html-input').focus();
    return;
  }
  await audit({ html, css: $('#css-input').value }, runCodeBtn);
});

/* ---------- Run audit (URL) ---------- */
const runUrlBtn = $('#run-url');
runUrlBtn.addEventListener('click', async () => {
  const url = $('#url-input').value.trim();
  if (!/^https?:\/\//i.test(url)) {
    setStatus('Enter a full URL starting with http:// or https://', true);
    $('#url-input').focus();
    return;
  }
  runUrlBtn.disabled = true;
  setStatus('Fetching page…');
  try {
    const res = await fetch(`/api/fetch-url?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Fetch failed (HTTP ${res.status})`);
    }
    const data = await res.json();
    await audit({ html: data.html, css: '' }, runUrlBtn, { fetchedUrl: url });
  } catch (err) {
    const local = location.hostname === 'localhost' || location.protocol === 'file:';
    setStatus(
      `${err.message}${local ? ' — the URL proxy needs the serverless function; run with "vercel dev" or use the deployed site.' : ''}`,
      true
    );
  } finally {
    runUrlBtn.disabled = false;
  }
});

/* ---------- Audit orchestration ---------- */
async function audit(input, btn, opts = {}) {
  btn.disabled = true;
  setStatus('Analyzing…');
  try {
    const result = await runAudit(input);

    // Heuristic: did a fetched page come back as a JS-rendered shell?
    let shellWarning = '';
    if (opts.fetchedUrl) {
      const parsed = new DOMParser().parseFromString(input.html, 'text/html');
      const textLen = (parsed.body?.textContent || '').trim().length;
      if (textLen < 100 && parsed.querySelectorAll('script').length > 0) {
        shellWarning =
          'This page appears to render content with JavaScript. Results may be incomplete — try pasting the rendered HTML instead.';
      }
    }

    renderReport(result, { ...opts, shellWarning });
    setStatus('');
    $('#report').hidden = false;
    $('#score-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    setStatus(`Audit failed: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
}
