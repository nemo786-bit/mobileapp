// Pure timing logic. Loaded by index.html as a plain script, and by server.js and test.js via require().
//
// Everything that is shared between devices is a record: { id, k: kind, u: last-changed ms, del?: 1, ...fields }
//   meta     id 'meta'       { name }
//   race                     { name, start, o: order }
//   point                    { name, o }                    an intermediate timing point; the finish is implicit
//   time                     { t, bib, p: point id or '' }  one press of the button
//   entrant  id 'e:' + bib   { bib, name, cat, race, chip }
//   update                   { bib, type: DNF | DNS | DSQ | PEN, sec }

const pad = n => String(n).padStart(2, '0');
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ms -> "H:MM:SS.t". Tenths are truncated, never rounded up: a time isn't reached until it has passed.
function fmt(ms) {
  if (ms == null || ms < 0) return '–';
  const t = Math.floor(ms / 100);
  return `${Math.floor(t / 36000)}:${pad(Math.floor(t / 600) % 60)}:${pad(Math.floor(t / 10) % 60)}.${t % 10}`;
}

// epoch ms -> local time of day "HH:MM:SS.t" (digits = decimals shown)
function tod(ms, digits = 1) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0').slice(0, digits)}`;
}

// "07:00", "7:00:00", "07:00:00.25" -> ms since midnight, or null if it isn't a time
function parseTod(s) {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,3}))?)?$/.exec(s.trim());
  if (!m || m[1] > 23 || m[2] > 59 || (m[3] || 0) > 59) return null;
  return ((+m[1] * 60 + +m[2]) * 60 + +(m[3] || 0)) * 1000 + +(m[4] || '').padEnd(3, '0');
}

// Last write wins, per record. Applies `incoming` to `recs` and returns the records that changed.
// ponytail: conflicts are settled by device clocks (corrected against the server). Two people editing
// the same record in the same instant keep one edit, not both; per-field merging if that ever matters.
function merge(recs, incoming) {
  const changed = [];
  for (const r of incoming) {
    if (!r || r.id === '__proto__') continue;
    const old = Object.hasOwn(recs, r.id) ? recs[r.id] : null;
    if (!old || r.u > old.u || (r.u === old.u && JSON.stringify(r) > JSON.stringify(old))) {
      recs[r.id] = r;
      changed.push(r);
    }
  }
  return changed;
}

// Records -> the shape the screens and results() work with.
function view(recs) {
  const live = Object.values(recs).filter(r => !r.del);
  const of = k => live.filter(r => r.k === k);
  const byOrder = (a, b) => a.o - b.o || (a.id < b.id ? -1 : 1);
  const entrants = Object.create(null), chips = Object.create(null); // no prototype: a bib typed as "constructor" must not match
  for (const e of of('entrant')) { entrants[e.bib] = e; if (e.chip) chips[e.chip] = e.bib; }
  const races = of('race').sort(byOrder);
  if (!races.length) races.push({ id: 'race0', k: 'race', name: 'Race', start: null, o: 0 }); // there is always one race
  return {
    name: (Object.hasOwn(recs, 'meta') && recs.meta.name) || '',
    races, points: of('point').sort(byOrder), entrants, chips, times: of('time'), updates: of('update'),
  };
}

// One entrant per line: bib, name, category, race, chip. Tab-separated (pasted from Excel) or comma/semicolon.
// Returns the entrants plus any races that are named in the list but don't exist yet.
// ponytail: naive split, quoted CSV fields aren't understood. Paste from a spreadsheet (tabs) if names contain commas.
function parseEntrants(text, races) {
  races = [...races];
  const added = [], entrants = {};
  for (const line of text.split(/\r?\n/)) {
    const [bib, name = '', cat = '', race = '', chip = ''] = line.split(line.includes('\t') ? '\t' : /[,;]/).map(s => s.trim().slice(0, 40));
    if (!bib || /^bib$/i.test(bib)) continue;
    let r = race ? races.find(x => x.name.toLowerCase() === race.toLowerCase()) : races[0];
    if (!r) { r = { id: newId(), name: race }; races.push(r); added.push(r); }
    entrants[bib] = { bib, name, cat, race: r.id, chip };
  }
  return { entrants: Object.values(entrants), races: added };
}

const GROUP = { '': 0, 'on course': 1, DNF: 2, DSQ: 3, DNS: 4 };

// Builds the leaderboard of each race: ranked finishers (by time + penalties), then athletes still on
// course (furthest point first), then DNF / DSQ / DNS.
// A bib's race comes from the entry list; bibs not on the list go to the first race.
// Presses that can't be used (no bib, repeated bib, no start time) come back in `unranked`, never dropped.
// `info` describes every press by record id, for the timing log.
function results(v) {
  const out = v.races.map(race => ({ race, rows: [] }));
  const byRace = Object.fromEntries(out.map(o => [o.race.id, o]));
  const pointIx = Object.fromEntries(v.points.map((p, i) => [p.id, i]));
  const hasList = Object.keys(v.entrants).length > 0;
  const status = Object.create(null), pen = Object.create(null);
  for (const u of [...v.updates].sort((a, b) => a.u - b.u)) {
    if (u.type === 'PEN') pen[u.bib] = (pen[u.bib] || 0) + (+u.sec || 0) * 1000;
    else if (['DNF', 'DNS', 'DSQ'].includes(u.type)) status[u.bib] = u.type; // the latest one stands
  }
  const who = bib => {
    const e = v.entrants[bib];
    return { name: e?.name || '', cat: e?.cat || '', o: byRace[e?.race] || out[0], unknown: hasList && !!bib && !e };
  };
  const athletes = new Map();
  const athlete = bib => {
    if (!athletes.has(bib)) athletes.set(bib, { bib, ...who(bib), t: null, elapsed: null, splits: {} });
    return athletes.get(bib);
  };

  const seen = new Set(), info = {}, unranked = [];
  for (const f of [...v.times].sort((a, b) => a.t - b.t)) {
    const p = f.p || '';
    if (p && !(p in pointIx)) continue; // its timing point was deleted
    const w = who(f.bib), st = status[f.bib];
    const elapsed = w.o.race.start == null ? null : f.t - w.o.race.start;
    const problem = !f.bib ? 'no bib' : seen.has(p + '|' + f.bib) ? 'duplicate bib'
      : elapsed == null ? 'race not started' : elapsed < 0 ? 'before start'
      : st === 'DNS' || (st === 'DNF' && !p) ? `marked ${st}` : '';
    const row = info[f.id] = {
      id: f.id, t: f.t, bib: f.bib, name: w.name, cat: w.cat, race: w.o.race.name, unknown: w.unknown,
      point: p ? v.points[pointIx[p]].name : 'Finish', elapsed, problem,
    };
    if (problem) { unranked.push(row); continue; }
    seen.add(p + '|' + f.bib);
    const a = athlete(f.bib);
    if (p) a.splits[p] = elapsed; else { a.t = f.t; a.elapsed = elapsed; }
  }
  for (const bib in status) athlete(bib);

  for (const a of athletes.values()) {
    a.pen = pen[a.bib] || 0;
    a.status = status[a.bib] || (a.elapsed == null ? 'on course' : '');
    a.total = a.status ? null : a.elapsed + a.pen;
    a.race = a.o.race.name;
    const far = Object.keys(a.splits).sort((x, y) => pointIx[y] - pointIx[x])[0];
    a.far = far ? [pointIx[far], a.splits[far]] : [-1, 0];
    a.o.rows.push(a);
    delete a.o;
  }
  for (const o of out) {
    o.rows.sort((a, b) => GROUP[a.status] - GROUP[b.status]
      || (a.status ? b.far[0] - a.far[0] || a.far[1] - b.far[1] : a.total - b.total));
    const cats = {};
    o.rows.forEach((r, i) => {
      if (r.status) return;
      r.pos = i + 1;
      r.catPos = r.cat ? (cats[r.cat] = (cats[r.cat] || 0) + 1) : '';
    });
  }
  return { races: out, unranked, info, points: v.points };
}

function toCsv(res) {
  const cell = v => {
    v = String(v ?? '');
    if (/^[=+\-@]/.test(v)) v = "'" + v; // stop spreadsheets running imported names as formulas
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const f = ms => ms == null ? '' : fmt(ms);
  const blank = res.points.map(() => '');
  return [
    ['Race', 'Pos', 'Bib', 'Name', 'Category', 'Cat pos', 'Finish time', 'Elapsed', 'Penalty', 'Total', ...res.points.map(p => p.name), 'Note'],
    ...res.races.flatMap(o => o.rows.map(r => [
      r.race, r.pos, r.bib, r.name, r.cat, r.catPos, r.t == null ? '' : tod(r.t), f(r.elapsed), r.pen ? fmt(r.pen) : '', f(r.total),
      ...res.points.map(p => f(r.splits[p.id])), r.status || (r.unknown ? 'not in entry list' : ''),
    ])),
    ...res.unranked.map(r => [r.race, '', r.bib, r.name, r.cat, '', tod(r.t), f(r.elapsed), '', '', ...blank, `${r.point}: ${r.problem}`]),
  ].map(row => row.map(cell).join(',')).join('\r\n');
}

if (typeof module !== 'undefined') module.exports = { fmt, tod, parseTod, merge, view, parseEntrants, results, toCsv };
