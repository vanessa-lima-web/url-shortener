import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import UAParser from 'ua-parser-js';
import geoip from 'geoip-lite';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, 'data.json');

const app = express();
const PORT = process.env.PORT || 3000;

let links = new Map();
let clicks = [];

async function loadData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);
    links = new Map(parsed.links || []);
    clicks = parsed.clicks || [];
  } catch {
    const sample = [
      { id: 'demo1', original: 'https://example.com', alias: 'demo', created: Date.now() - 10*86400000, expires: null, password: null, tags: ['demo'], clicks: 0 },
      { id: 'demo2', original: 'https://github.com', alias: 'gh', created: Date.now() - 5*86400000, expires: Date.now() + 7*86400000, password: null, tags: ['dev'], clicks: 0 }
    ];
    sample.forEach(l => links.set(l.alias || l.id, l));

    const countries = ['US', 'BR', 'GB', 'DE', 'IN', 'FR', 'CA', 'AU'];
    const devices = ['desktop', 'mobile', 'tablet'];
    const oses = ['Windows', 'macOS', 'iOS', 'Android', 'Linux'];
    const browsers = ['Chrome', 'Safari', 'Firefox', 'Edge'];
    const refs = ['direct', 'https://google.com', 'https://twitter.com', 'https://github.com', 'https://linkedin.com'];

    for (let i = 0; i < 80; i++) {
      const daysAgo = Math.floor(Math.random() * 30);
      const timestamp = Date.now() - daysAgo * 86400000 - Math.random() * 86400000;
      const code = Math.random() > 0.4 ? 'demo' : 'gh';
      clicks.push({
        code,
        timestamp,
        ip: `192.168.${Math.floor(Math.random()*255)}.${Math.floor(Math.random()*255)}`,
        country: countries[Math.floor(Math.random()*countries.length)],
        city: 'Sample City',
        device: devices[Math.floor(Math.random()*devices.length)],
        os: oses[Math.floor(Math.random()*oses.length)],
        browser: browsers[Math.floor(Math.random()*browsers.length)],
        referrer: refs[Math.floor(Math.random()*refs.length)]
      });
    }
    links.get('demo').clicks = clicks.filter(c => c.code === 'demo').length;
    links.get('gh').clicks = clicks.filter(c => c.code === 'gh').length;
    await saveData();
  }
}

async function saveData() {
  const data = { links: Array.from(links.entries()), clicks };
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

await loadData();

app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10kb' }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { error: 'Too many requests' } });
app.use('/api/', limiter);

const createLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: 'Too many link creations' } });

function isValidUrl(str) {
  try {
    const url = new URL(str.startsWith('http') ? str : 'https://' + str);
    return ['http:', 'https:'].includes(url.protocol);
  } catch { return false; }
}

function sanitizeUrl(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    const params = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];
    params.forEach(p => u.searchParams.delete(p));
    return u.toString().replace(/\/+$/, '');
  } catch { return url; }
}

const RESERVED = new Set(['admin', 'api', 'login', 'static', 'dashboard', 'health', 'favicon.ico']);
function isValidAlias(alias) {
  return /^[a-zA-Z0-9_-]{3,30}$/.test(alias) && !RESERVED.has(alias.toLowerCase());
}

app.post('/api/shorten', createLimiter, async (req, res) => {
  try {
    const { url, alias, expiresIn, password, tags = [] } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    let cleanUrl = sanitizeUrl(url.trim());
    if (!isValidUrl(cleanUrl)) return res.status(400).json({ error: 'Invalid URL' });

    let shortCode = alias?.trim();
    if (shortCode) {
      if (!isValidAlias(shortCode)) return res.status(400).json({ error: 'Invalid alias format' });
      if (links.has(shortCode)) return res.status(409).json({ error: 'Alias already taken' });
    } else {
      do { shortCode = nanoid(7); } while (links.has(shortCode));
    }

    let hashedPassword = null;
    if (password) hashedPassword = await bcrypt.hash(password, 10);

    let expiresAt = null;
    if (expiresIn) {
      const now = Date.now();
      const presets = { '1h': 3600000, '24h': 86400000, '7d': 7*86400000, '30d': 30*86400000 };
      expiresAt = now + (presets[expiresIn] || parseInt(expiresIn) || 0);
    }

    const link = {
      id: nanoid(10),
      original: cleanUrl,
      alias: shortCode,
      created: Date.now(),
      expires: expiresAt,
      password: hashedPassword,
      tags: Array.isArray(tags) ? tags.slice(0, 10) : [],
      clicks: 0
    };

    links.set(shortCode, link);
    await saveData();

    res.status(201).json({
      shortUrl: `${req.protocol}://${req.get('host')}/${shortCode}`,
      shortCode,
      original: cleanUrl,
      created: link.created,
      expires: expiresAt,
      hasPassword: !!hashedPassword
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/shorten/bulk', createLimiter, async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: 'URLs array required' });
  if (urls.length > 50) return res.status(400).json({ error: 'Max 50 URLs' });

  const results = [];
  for (const url of urls) {
    try {
      let cleanUrl = sanitizeUrl(String(url).trim());
      if (!isValidUrl(cleanUrl)) {
        results.push({ original: url, error: 'Invalid URL' });
        continue;
      }
      let shortCode;
      do { shortCode = nanoid(7); } while (links.has(shortCode));
      const link = { id: nanoid(10), original: cleanUrl, alias: shortCode, created: Date.now(), expires: null, password: null, tags: [], clicks: 0 };
      links.set(shortCode, link);
      results.push({ shortUrl: `${req.protocol}://${req.get('host')}/${shortCode}`, shortCode, original: cleanUrl });
    } catch {
      results.push({ original: url, error: 'Failed' });
    }
  }
  await saveData();
  res.json({ results });
});

app.get('/api/links', (req, res) => {
  const list = Array.from(links.values()).map(l => ({ ...l, password: undefined, hasPassword: !!l.password }));
  res.json(list);
});

app.get('/api/links/:code', (req, res) => {
  const link = links.get(req.params.code);
  if (!link) return res.status(404).json({ error: 'Not found' });
  res.json({ ...link, password: undefined, hasPassword: !!link.password });
});

app.delete('/api/links/:code', async (req, res) => {
  if (!links.has(req.params.code)) return res.status(404).json({ error: 'Not found' });
  links.delete(req.params.code);
  await saveData();
  res.json({ success: true });
});

app.get('/api/analytics/:code', (req, res) => {
  const link = links.get(req.params.code);
  if (!link) return res.status(404).json({ error: 'Not found' });

  const range = req.query.range || '30d';
  const now = Date.now();
  const ranges = { '24h': 24*3600000, '7d': 7*86400000, '30d': 30*86400000, '90d': 90*86400000, 'all': Infinity };
  const cutoff = ranges[range] === Infinity ? 0 : now - ranges[range];

  const linkClicks = clicks.filter(c => c.code === req.params.code && c.timestamp >= cutoff);

  const byDay = {};
  linkClicks.forEach(c => {
    const day = new Date(c.timestamp).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + 1;
  });
  const timeline = Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

  const countries = {}, devices = {}, oses = {}, browsers = {}, referrers = {};
  linkClicks.forEach(c => {
    countries[c.country] = (countries[c.country] || 0) + 1;
    devices[c.device] = (devices[c.device] || 0) + 1;
    oses[c.os] = (oses[c.os] || 0) + 1;
    browsers[c.browser] = (browsers[c.browser] || 0) + 1;
    let ref = 'Direct';
    if (c.referrer && c.referrer !== 'direct') {
      try { ref = new URL(c.referrer).hostname || 'Other'; } catch { ref = 'Other'; }
    }
    referrers[ref] = (referrers[ref] || 0) + 1;
  });

  const top = (obj, n = 10) => Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0,n).map(([name,count]) => ({name, count}));

  res.json({
    total: linkClicks.length,
    unique: new Set(linkClicks.map(c => c.ip)).size,
    range,
    timeline,
    countries: top(countries),
    devices: top(devices),
    oses: top(oses),
    browsers: top(browsers),
    referrers: top(referrers),
    recent: linkClicks.slice(-20).reverse()
  });
});

app.get('/:code', async (req, res) => {
  const { code } = req.params;
  if (code === 'api' || code === 'favicon.ico') return res.status(404).end();

  const link = links.get(code);
  if (!link) return res.status(404).send('Link not found');

  if (link.expires && Date.now() > link.expires) {
    return res.status(410).send('This link has expired');
  }

  if (link.password) {
    const provided = req.query.p;
    if (!provided || !(await bcrypt.compare(provided, link.password))) {
      return res.status(401).send(`<!DOCTYPE html><html><head><title>Password Required</title></head><body style="font-family:system-ui;text-align:center;padding:2rem;"><h1>Password Protected</h1><form method="GET"><input type="password" name="p" placeholder="Enter password" required><button type="submit">Continue</button></form></body></html>`);
    }
  }

  const ua = new UAParser(req.headers['user-agent']);
  const geo = geoip.lookup(req.ip || '127.0.0.1');
  clicks.push({
    code,
    timestamp: Date.now(),
    ip: req.ip,
    country: geo?.country || 'Unknown',
    city: geo?.city || 'Unknown',
    device: ua.getDevice().type || 'desktop',
    os: ua.getOS().name || 'Unknown',
    browser: ua.getBrowser().name || 'Unknown',
    referrer: req.get('referer') || 'direct'
  });
  link.clicks = (link.clicks || 0) + 1;
  await saveData();

  res.redirect(302, link.original);
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`URL Shortener API running on http://localhost:${PORT}`);
});
