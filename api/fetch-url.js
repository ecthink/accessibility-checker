// Vercel serverless function: fetches a URL server-side so the front-end
// can analyze pages without hitting CORS. Static fetch only (no JS execution).

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const TIMEOUT_MS = 10000;

const BLOCKED_HOSTS = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/i;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = req.query.url;
  if (!raw) return res.status(400).json({ error: 'Missing url parameter' });

  let url;
  try {
    url = new URL(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  if (!/^https?:$/.test(url.protocol)) {
    return res.status(400).json({ error: 'Only http(s) URLs are supported' });
  }
  if (BLOCKED_HOSTS.test(url.hostname)) {
    return res.status(400).json({ error: 'This host cannot be fetched' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AccessibilityChecker/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      return res
        .status(502)
        .json({ error: `The page responded with HTTP ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('html')) {
      return res
        .status(415)
        .json({ error: `Not an HTML page (content-type: ${contentType || 'unknown'})` });
    }

    // Stream with a size cap so huge pages can't blow up the function.
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
    }
    reader.cancel().catch(() => {});

    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      html,
      finalUrl: response.url,
      truncated: received >= MAX_BYTES,
    });
  } catch (err) {
    const message =
      err.name === 'AbortError'
        ? 'The page took too long to respond (10s timeout)'
        : 'Could not fetch the page — check the URL is reachable';
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timer);
  }
}
