const API = window.location.origin.includes('localhost') || window.location.port === '3000' ? 'http://localhost:3000' : '';

const form = document.getElementById('shorten-form');
const urlInput = document.getElementById('url-input');
const resultDiv = document.getElementById('result');
const linksContainer = document.getElementById('links-container');
const themeToggle = document.getElementById('theme-toggle');

const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const savedTheme = localStorage.getItem('theme') || (prefersDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-theme', savedTheme);
themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  const btn = document.getElementById('shorten-btn');
  btn.disabled = true;
  btn.textContent = 'Shortening...';

  try {
    const body = {
      url,
      alias: document.getElementById('alias-input').value.trim() || undefined,
      expiresIn: document.getElementById('expires-select').value || undefined,
      password: document.getElementById('password-input').value || undefined,
      tags: document.getElementById('tags-input').value.split(',').map(t => t.trim()).filter(Boolean)
    };

    const res = await fetch(`${API}/api/shorten`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    showResult(data);
    loadLinks();
    form.reset();
  } catch (err) {
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `<p style="color:#e53935">Error: ${err.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Shorten';
  }
});

function showResult(data) {
  resultDiv.classList.remove('hidden');
  resultDiv.innerHTML = `
    <p><strong>Short URL:</strong></p>
    <div style="display:flex;gap:0.5rem;align-items:center;justify-content:center;flex-wrap:wrap;">
      <code style="font-size:1.2rem;background:var(--bg);padding:0.5rem 1rem;border-radius:8px;">${data.shortUrl}</code>
      <button id="copy-btn" data-url="${data.shortUrl}">Copy</button>
    </div>
    <div id="qr-container" style="margin-top:1rem;"></div>
  `;

  const qrContainer = document.getElementById('qr-container');
  QRCode.toCanvas(qrContainer, data.shortUrl, { width: 180 }, (err) => {
    if (err) qrContainer.textContent = 'QR error';
  });

  document.getElementById('copy-btn').addEventListener('click', async function() {
    await navigator.clipboard.writeText(this.dataset.url);
    this.textContent = 'Copied!';
    setTimeout(() => this.textContent = 'Copy', 2000);
  });
}

let allLinks = [];

async function loadLinks() {
  try {
    const res = await fetch(`${API}/api/links`);
    allLinks = await res.json();
    renderLinks();
  } catch {
    linksContainer.innerHTML = '<p>Could not load links</p>';
  }
}

function getStatus(link) {
  if (link.expires && Date.now() > link.expires) return 'expired';
  if (link.hasPassword) return 'protected';
  return 'active';
}

function renderLinks() {
  const search = document.getElementById('search-input').value.toLowerCase().trim();
  const status = document.getElementById('filter-status').value;
  const sort = document.getElementById('sort-by').value;

  let filtered = allLinks.filter(l => {
    const matchesSearch = !search ||
      l.alias.toLowerCase().includes(search) ||
      l.original.toLowerCase().includes(search) ||
      (l.tags || []).some(t => t.toLowerCase().includes(search));

    const linkStatus = getStatus(l);
    const matchesStatus = status === 'all' || linkStatus === status;

    return matchesSearch && matchesStatus;
  });

  filtered.sort((a, b) => {
    switch (sort) {
      case 'created-desc': return b.created - a.created;
      case 'created-asc': return a.created - b.created;
      case 'clicks-desc': return (b.clicks || 0) - (a.clicks || 0);
      case 'clicks-asc': return (a.clicks || 0) - (b.clicks || 0);
      case 'alias-asc': return a.alias.localeCompare(b.alias);
      case 'alias-desc': return b.alias.localeCompare(a.alias);
      default: return 0;
    }
  });

  const noResults = document.getElementById('no-results');
  if (filtered.length === 0) {
    linksContainer.innerHTML = '';
    noResults.classList.remove('hidden');
    return;
  }
  noResults.classList.add('hidden');

  linksContainer.innerHTML = filtered.map(l => {
    const status = getStatus(l);
    const statusLabel = status === 'expired' ? 'Expired' : status === 'protected' ? 'Protected' : 'Active';
    return `
      <div class="link-card">
        <div>
          <strong>${escapeHtml(l.alias)}</strong> → <a href="${escapeHtml(l.original)}" target="_blank" rel="noopener">${escapeHtml(l.original.slice(0,60))}${l.original.length>60?'...':''}</a>
          <div style="font-size:0.85rem;color:#666;margin-top:0.25rem;">
            Clicks: ${l.clicks || 0} · ${statusLabel}
            ${(l.tags || []).length ? ' · ' + l.tags.map(t => '#' + escapeHtml(t)).join(' ') : ''}
          </div>
        </div>
        <button class="analytics-btn" data-code="${escapeHtml(l.alias)}">Analytics</button>
        <button class="copy-link" data-url="${window.location.origin}/${escapeHtml(l.alias)}">Copy</button>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.copy-link').forEach(btn => {
    btn.addEventListener('click', async function() {
      await navigator.clipboard.writeText(this.dataset.url);
      this.textContent = 'Copied!';
      setTimeout(() => this.textContent = 'Copy', 2000);
    });
  });

  document.querySelectorAll('.analytics-btn').forEach(btn => {
    btn.addEventListener('click', () => openAnalytics(btn.dataset.code));
  });
}

let searchTimeout;
document.getElementById('search-input').addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(renderLinks, 200);
});
document.getElementById('filter-status').addEventListener('change', renderLinks);
document.getElementById('sort-by').addEventListener('change', renderLinks);

let currentCode = null;
let charts = {};

function destroyCharts() {
  Object.values(charts).forEach(c => c?.destroy());
  charts = {};
}

async function openAnalytics(code) {
  currentCode = code;
  document.getElementById('analytics-title').textContent = `Analytics: ${code}`;
  document.getElementById('analytics-modal').classList.remove('hidden');
  await loadAnalytics('7d');
}

async function loadAnalytics(range) {
  if (!currentCode) return;
  destroyCharts();

  try {
    const res = await fetch(`${API}/api/analytics/${currentCode}?range=${range}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    document.getElementById('stat-total').textContent = data.total;
    document.getElementById('stat-unique').textContent = data.unique;

    const ctx1 = document.getElementById('timeline-chart');
    charts.timeline = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: data.timeline.map(d => d.date.slice(5)),
        datasets: [{
          label: 'Clicks',
          data: data.timeline.map(d => d.count),
          borderColor: '#0066ff',
          backgroundColor: 'rgba(0,102,255,0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });

    const makePie = (id, items, colors) => {
      const ctx = document.getElementById(id);
      charts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: items.map(i => i.name),
          datasets: [{ data: items.map(i => i.count), backgroundColor: colors }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });
    };

    const palette = ['#0066ff', '#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181', '#aa96da', '#fcbad3'];
    makePie('devices-chart', data.devices, palette);
    makePie('browsers-chart', data.browsers, palette);
    makePie('countries-chart', data.countries, palette);
    makePie('referrers-chart', data.referrers, palette);

    document.querySelectorAll('.range-selector button').forEach(b => {
      b.classList.toggle('active', b.dataset.range === range);
    });
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('close-analytics').addEventListener('click', () => {
  document.getElementById('analytics-modal').classList.add('hidden');
  destroyCharts();
  currentCode = null;
});

document.querySelectorAll('.range-selector button').forEach(btn => {
  btn.addEventListener('click', () => loadAnalytics(btn.dataset.range));
});

const bulkBtn = document.getElementById('bulk-btn');
const bulkInput = document.getElementById('bulk-input');
const bulkResults = document.getElementById('bulk-results');

bulkBtn.addEventListener('click', async () => {
  const text = bulkInput.value.trim();
  if (!text) return;

  const urls = text.split('\n').map(u => u.trim()).filter(Boolean);
  if (urls.length === 0) return;
  if (urls.length > 50) {
    bulkResults.innerHTML = '<p style="color:#e53935">Maximum 50 URLs allowed.</p>';
    return;
  }

  bulkBtn.disabled = true;
  bulkBtn.textContent = 'Shortening...';
  bulkResults.innerHTML = '<p>Processing...</p>';

  try {
    const res = await fetch(`${API}/api/shorten/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    bulkResults.innerHTML = data.results.map(r => {
      if (r.error) {
        return `<div class="bulk-item error"><span>${escapeHtml(r.original)}</span><span style="color:#e53935">${escapeHtml(r.error)}</span></div>`;
      }
      return `<div class="bulk-item"><code>${escapeHtml(r.shortUrl)}</code><button class="copy-bulk" data-url="${r.shortUrl}">Copy</button></div>`;
    }).join('');

    document.querySelectorAll('.copy-bulk').forEach(btn => {
      btn.addEventListener('click', async function() {
        await navigator.clipboard.writeText(this.dataset.url);
        this.textContent = 'Copied!';
        setTimeout(() => this.textContent = 'Copy', 2000);
      });
    });

    loadLinks();
    bulkInput.value = '';
  } catch (err) {
    bulkResults.innerHTML = `<p style="color:#e53935">Error: ${escapeHtml(err.message)}</p>`;
  } finally {
    bulkBtn.disabled = false;
    bulkBtn.textContent = 'Shorten All';
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

loadLinks();
