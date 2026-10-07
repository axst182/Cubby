const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(process.env.DATA_DIR || '/data', 'items.json');
const TZ = process.env.TZ || 'Europe/Stockholm';
const NTFY_URL = process.env.NTFY_URL || '';
const REMINDER_TIME = process.env.REMINDER_TIME || '19:00';

const SEASONS = ['vinter', 'var-host', 'sommar'];
const DEFAULTS = [
  ['Underställ överdel', 1, ['vinter']], ['Underställ underdel', 1, ['vinter']],
  ['Strumpor', 2, []], ['Underkläder', 2, []], ['Tröja', 1, []], ['Byxor', 1, []],
  ['Mössa', 1, ['vinter', 'var-host']], ['Vantar', 1, ['vinter']], ['Skaloverall', 1, ['vinter']],
  ['Regnbyxor', 1, ['var-host']], ['Solhatt', 1, ['sommar']], ['Badkläder', 1, ['sommar']],
];
const clamp = (v) => Math.max(1, Math.min(20, parseInt(v, 10) || 1));
const normalize = (i) => {
  i.qty = clamp(i.qty);
  i.bringQty = Math.min(clamp(i.bringQty ?? i.qty), i.qty);
  i.bring = !!i.bring;
  i.seasons = SEASONS.filter((x) => (Array.isArray(i.seasons) ? i.seasons : []).includes(x));
  i.note = String(i.note || '').slice(0, 100);
  return i;
};
const newItem = (name, qty = 1, seasons = [], note = '') =>
  normalize({ id: crypto.randomUUID(), name, qty, bring: false, bringQty: qty, seasons, note });
const defaultSeason = () => {
  const m = new Date().getMonth(); // 0 = januari
  return m >= 10 || m <= 2 ? 'vinter' : m >= 5 && m <= 7 ? 'sommar' : 'var-host';
};

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.items; // äldre versioner sparade bara en lista
    return { season: SEASONS.includes(raw.season) ? raw.season : defaultSeason(), items: list.map(normalize) };
  } catch {
    return { season: defaultSeason(), items: DEFAULTS.map(([n, q, s]) => newItem(n, q, s)) };
  }
}
function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ season, items }, null, 2));
}
let { season, items } = load();
const state = () => ({ season, items });

// ---- Kvällspåminnelse via ntfy (https://ntfy.sh) ----
const label = (i) => (i.qty > 1 ? `${i.name} ×${i.bringQty}` : i.name);

async function remind() {
  if (!NTFY_URL) return { ok: false, reason: 'NTFY_URL är inte inställd' };
  const list = items.filter((i) => i.bring);
  if (!list.length) return { ok: false, reason: 'Inget att ta med' };
  const r = await fetch(NTFY_URL, {
    method: 'POST',
    headers: { Title: 'Cubby' },
    body: 'Ta med imorgon: ' + list.map(label).join(', '),
  });
  return { ok: r.ok };
}

function localNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}`, weekday: g('weekday') };
}

let lastSent = '';
setInterval(() => {
  if (!NTFY_URL) return;
  const n = localNow();
  if (n.time !== REMINDER_TIME || lastSent === n.date) return;
  if (n.weekday === 'Fri' || n.weekday === 'Sat') return; // ingen förskola dagen efter
  lastSent = n.date;
  remind().catch((e) => console.error('Påminnelse misslyckades:', e.message));
}, 30000);

// ---- HTTP ----
const send = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve) => {
  let s = '';
  req.on('data', (c) => (s += c));
  req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
});

http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;

  if (p === '/api/items' && req.method === 'GET') return send(res, 200, state());

  if (p === '/api/items' && req.method === 'POST') {
    const { name, qty, seasons, note } = await readBody(req);
    if (!name || !name.trim()) return send(res, 400, { error: 'Namn saknas' });
    items.push(newItem(name.trim().slice(0, 60), clamp(qty), seasons, note));
    save();
    return send(res, 201, state());
  }

  if (p === '/api/reset' && req.method === 'POST') {
    items.forEach((i) => { i.bring = false; i.bringQty = i.qty; });
    save();
    return send(res, 200, state());
  }

  if (p === '/api/remind' && req.method === 'POST') {
    try { return send(res, 200, await remind()); }
    catch (e) { return send(res, 502, { ok: false, reason: e.message }); }
  }

  if (p === '/healthz') { res.writeHead(200); return res.end('ok'); }

  if (p === '/api/season' && req.method === 'PUT') {
    const b = await readBody(req);
    if (!SEASONS.includes(b.season)) return send(res, 400, { error: 'Okänd säsong' });
    season = b.season;
    save();
    return send(res, 200, state());
  }

  const m = p.match(/^\/api\/items\/([\w-]+)$/);
  if (m) {
    const item = items.find((i) => i.id === m[1]);
    if (!item) return send(res, 404, { error: 'Hittades inte' });
    if (req.method === 'PATCH') {
      const b = await readBody(req);
      if ('note' in b) item.note = String(b.note).slice(0, 100);
      if ('seasons' in b) item.seasons = SEASONS.filter((x) => (b.seasons || []).includes(x));
      if ('qty' in b) item.qty = clamp(b.qty);
      if ('bring' in b) item.bring = !!b.bring;
      if ('bringQty' in b) item.bringQty = clamp(b.bringQty);
      else if (b.bring === true) item.bringQty = item.qty;
      item.bringQty = Math.min(item.bringQty, item.qty);
      save();
      return send(res, 200, state());
    }
    if (req.method === 'DELETE') {
      items = items.filter((i) => i.id !== item.id);
      save();
      return send(res, 200, state());
    }
  }

  if (p === '/manifest.webmanifest') {
    res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
    return res.end(JSON.stringify({
      name: 'Cubby', short_name: 'Cubby', start_url: '/', display: 'standalone',
      background_color: '#eef3f6', theme_color: '#2f8a68',
      icons: [
        { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    }));
  }

  const asset = p.match(/^\/assets\/([\w-]+\.(svg|png))$/);
  if (asset && req.method === 'GET') {
    return fs.readFile(path.join(__dirname, 'public', 'assets', asset[1]), (err, buf) => {
      if (err) return send(res, 404, { error: 'Hittades inte' });
      res.writeHead(200, {
        'Content-Type': asset[2] === 'svg' ? 'image/svg+xml' : 'image/png',
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(buf);
    });
  }

  if (req.method === 'GET') {
    return fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, buf) => {
      if (err) return send(res, 500, { error: 'index.html saknas' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
  }
  send(res, 404, { error: 'Hittades inte' });
}).listen(PORT, () => console.log(`Lyssnar på port ${PORT}`));
