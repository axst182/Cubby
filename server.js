const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(process.env.DATA_DIR || '/data', 'items.json');
const DEFAULTS = ['Underställ överdel', 'Underställ underdel', 'Strumpor', 'Underkläder', 'Tröja', 'Byxor', 'Mössa', 'Vantar', 'Regnbyxor'];

const newItem = (name) => ({ id: crypto.randomUUID(), name, bring: false });

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return DEFAULTS.map(newItem); }
}
function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}
let items = load();

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
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/api/items' && req.method === 'GET') return send(res, 200, items);

  if (p === '/api/items' && req.method === 'POST') {
    const { name } = await readBody(req);
    if (!name || !name.trim()) return send(res, 400, { error: 'Namn saknas' });
    items.push(newItem(name.trim().slice(0, 60)));
    save();
    return send(res, 201, items);
  }

  if (p === '/api/reset' && req.method === 'POST') {
    items.forEach((i) => (i.bring = false));
    save();
    return send(res, 200, items);
  }

  const m = p.match(/^\/api\/items\/([\w-]+)$/);
  if (m) {
    const item = items.find((i) => i.id === m[1]);
    if (!item) return send(res, 404, { error: 'Hittades inte' });
    if (req.method === 'PATCH') {
      const { bring } = await readBody(req);
      item.bring = !!bring;
      save();
      return send(res, 200, items);
    }
    if (req.method === 'DELETE') {
      items = items.filter((i) => i.id !== item.id);
      save();
      return send(res, 200, items);
    }
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
