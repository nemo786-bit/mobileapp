// TrailTime sync server: serves the app and keeps every device on one event in step.
// No dependencies.   node server.js   (PORT and DATA_DIR are optional)
//
//   POST /api/sync/<event code>  { since, recs }  -> { now, seq, view, recs changed after `since` }
//   GET  /api/view/<view key>?since=n             -> the same, read-only, for the live results link
//
// The event code is the only secret: whoever knows it can read and write that event. The view key is
// derived from it one-way, so the results link can be handed to spectators.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { merge } = require('./core.js');

const PORT = process.env.PORT ?? 8080;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const CODE = /^[a-z0-9-]{4,32}$/;
const MAX_BODY = 2e6, MAX_RECS = 50000;
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/core.js': ['core.js', 'text/javascript; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png'],
};

fs.mkdirSync(DATA, { recursive: true });
const events = {}, views = {};
const file = code => path.join(DATA, code + '.json');
const viewKey = code => crypto.createHash('sha256').update('trailtime:' + code).digest('hex').slice(0, 16);

function open(code) {
  if (!events[code]) {
    // A file that exists but can't be read throws here on purpose: answering "empty" would overwrite it.
    events[code] = fs.existsSync(file(code)) ? JSON.parse(fs.readFileSync(file(code), 'utf8')) : { seq: 0, recs: {}, at: {} };
    views[viewKey(code)] = code;
  }
  return events[code];
}
for (const f of fs.readdirSync(DATA)) if (f.endsWith('.json') && CODE.test(f.slice(0, -5))) open(f.slice(0, -5));

// ponytail: the whole event is rewritten on every change. Fine for a race (a few thousand records);
// an append-only log or SQLite if events get much bigger.
function save(code) {
  fs.writeFileSync(file(code) + '.tmp', JSON.stringify(events[code]));
  fs.renameSync(file(code) + '.tmp', file(code)); // atomic: a crash never leaves half a file
}

const okRec = r => r && typeof r === 'object' && !Array.isArray(r)
  && typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 64 && typeof r.k === 'string' && Number.isFinite(r.u);
const since = (ev, n) => ({ now: Date.now(), seq: ev.seq, recs: Object.values(ev.recs).filter(r => ev.at[r.id] > (Number(n) || 0)) });

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { if ((size += c.length) > MAX_BODY) reject(413); else chunks.push(c); }); // past the cap: answer 413, buffer nothing more
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(400); } });
    req.on('error', () => reject(400));
  });
}

const server = http.createServer(async (req, res) => {
  const send = (status, body, type = 'application/json') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  try {
    const url = new URL(req.url, 'http://x');
    const [, api, kind, key] = url.pathname.split('/');
    if (api === 'api' && kind === 'sync' && req.method === 'POST') {
      if (!CODE.test(key)) return send(400, { error: 'bad event code' });
      const body = await readJson(req);
      const ev = open(key);
      const recs = Array.isArray(body.recs) ? body.recs.filter(okRec) : [];
      if (Object.keys(ev.recs).length + recs.length > MAX_RECS) return send(413, { error: 'event is full' });
      const changed = merge(ev.recs, recs);
      for (const r of changed) ev.at[r.id] = ++ev.seq;
      if (changed.length) save(key);
      return send(200, { ...since(ev, body.since), view: viewKey(key) });
    }
    if (api === 'api' && kind === 'view' && req.method === 'GET') {
      return Object.hasOwn(views, key) ? send(200, since(events[views[key]], url.searchParams.get('since'))) : send(404, { error: 'no such event' });
    }
    const hit = req.method === 'GET' && Object.hasOwn(STATIC, url.pathname) && STATIC[url.pathname];
    if (hit) return send(200, fs.readFileSync(path.join(__dirname, hit[0])), hit[1]);
    send(404, { error: 'not found' });
  } catch (e) {
    if (typeof e !== 'number') console.error(e);
    send(typeof e === 'number' ? e : 500, { error: 'failed' });
  }
});

server.listen(PORT, () => {
  const port = server.address().port;
  console.log(`TrailTime is running. On this computer: http://localhost:${port}`);
  for (const nets of Object.values(os.networkInterfaces()))
    for (const n of nets) if (n.family === 'IPv4' && !n.internal) console.log(`On phones on the same Wi-Fi:  http://${n.address}:${port}`);
});
module.exports = server;
