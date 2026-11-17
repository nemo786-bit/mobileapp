// Pure timing logic. Loaded by index.html as a plain script, and by server.js and test.js via require().
//
// Everything that is shared between devices is a record: { id, k: kind, u: last-changed ms, del?: 1, ...fields }
//   meta     id 'meta'       { name }
//   race                     { name, start, o: order, c: colour slot, mode: '' | 'tt', gap: seconds between time trial starts }
//   point                    { name, o }                    an intermediate timing point; start and finish are implicit
//   time                     { t, bib, p }                  one press. p: '' finish, 'start' an athlete's own start, else a point id
//   entrant  id 'e:' + bib   { bib, name, cat, race, chip, sex, ci: checked-in ms or 0 }
//   update                   { bib, type: DNF | DNS | DSQ | PEN | BOX, sec, in, out }
//                            PEN adds sec to the time. BOX is a penalty served standing still: in / out are when it began and ended.

const pad = n => String(n).padStart(2, '0');
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });

// ms -> "H:MM:SS.t". Tenths are truncated, never rounded up: a time isn't reached until it has passed.
function fmt(ms) {
  if (ms == null || ms < 0) return '–';
  const t = Math.floor(ms / 100);
  return `${Math.floor(t / 36000)}:${pad(Math.floor(t / 600) % 60)}:${pad(Math.floor(t / 10) % 60)}.${t % 10}`;
}

// epoch ms -> local time of day "HH:MM:SS.t" (digits = decimals shown)
function tod(ms, digits = 1) {
  const d = new Date(ms);
  const s = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return digits ? `${s}.${String(d.getMilliseconds()).padStart(3, '0').slice(0, digits)}` : s;
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
  const races = of('race').sort(byOrder).map((r, i) => ({ ...r, c: r.c ?? i }));
  if (!races.length) races.push({ id: 'race0', k: 'race', name: 'Race', start: null, o: 0, c: 0 }); // there is always one race
  const raceIds = new Set(races.map(r => r.id));
  const entrants = Object.create(null), chips = Object.create(null); // no prototype: a bib typed as "constructor" must not match
  for (const e of of('entrant')) {
    entrants[e.bib] = raceIds.has(e.race) ? e : { ...e, race: races[0].id }; // a deleted race hands its athletes to the first one
    if (e.chip) chips[e.chip] = e.bib;
  }
  return {
    name: (Object.hasOwn(recs, 'meta') && recs.meta.name) || '',
    races, points: of('point').sort(byOrder), entrants, chips, times: of('time'), updates: of('update'),
  };
}

// One entrant per line: bib, name, category, race, chip, sex. Tab-separated (pasted from Excel) or comma/semicolon.
// Returns the entrants plus any races that are named in the list but don't exist yet.
// ponytail: naive split, quoted CSV fields aren't understood. Paste from a spreadsheet (tabs) if names contain commas.
function parseEntrants(text, races) {
  races = [...races];
  const added = [], entrants = {};
  for (const line of text.split(/\r?\n/)) {
    const [bib, name = '', cat = '', race = '', chip = '', sex = ''] = line.split(line.includes('\t') ? '\t' : /[,;]/).map(s => s.trim().slice(0, 40));
    if (!bib || /^bib$/i.test(bib)) continue;
    let r = race ? races.find(x => x.name.toLowerCase() === race.toLowerCase()) : races[0];
    if (!r) { r = { id: newId(), name: race }; races.push(r); added.push(r); }
    entrants[bib] = { bib, name, cat, race: r.id, chip, sex: toSex(sex) };
  }
  return { entrants: Object.values(entrants), races: added };
}
const toSex = s => ({ F: 'F', W: 'F', M: 'M', H: 'M', X: 'X' })[String(s).trim().charAt(0).toUpperCase()] || '';

// Time trial: the athletes of a race leave one by one in bib order, `gap` seconds apart, from the race's start time.
function startList(v, race) {
  return Object.values(v.entrants).filter(e => e.race === race.id).sort((a, b) => natural(a.bib, b.bib))
    .map((e, i) => ({ bib: e.bib, name: e.name, at: race.start == null ? null : race.start + i * (race.gap || 60) * 1000 }));
}

const GROUP = { '': 0, 'on course': 1, DNF: 2, DSQ: 3, DNS: 4 };

// Builds the state of each race at `now`: ranked finishers (by time + penalties), then athletes still on
// course (furthest point first), then DNF / DSQ / DNS, plus the counts a race director asks for.
//
// An athlete's clock starts at their own recorded start if there is one, else their time trial slot,
// else the race's gun time. A bib's race comes from the entry list; bibs not on it go to the first race.
// Who has started: with an entry list, everyone entered once their start time has passed, or only those
// checked in if check-in is being used; without a list, whoever has been seen.
// Presses that can't be used (no bib, repeated bib, no start time) come back in `unranked`, never dropped.
// `info` describes every press by record id, for the timing log.
function results(v, now = Infinity) {
  const out = v.races.map(race => ({ race, rows: [] }));
  const byRace = Object.fromEntries(out.map(o => [o.race.id, o]));
  const pointIx = Object.fromEntries(v.points.map((p, i) => [p.id, i]));
  const entrants = Object.values(v.entrants);
  const hasList = entrants.length > 0, usesCheckin = entrants.some(e => e.ci);

  const status = Object.create(null), pen = Object.create(null), slot = Object.create(null), own = Object.create(null);
  const box = [];
  for (const u of [...v.updates].sort((a, b) => a.u - b.u)) {
    if (u.type === 'PEN') pen[u.bib] = (pen[u.bib] || 0) + (+u.sec || 0) * 1000;
    else if (u.type === 'BOX') box.push(u);
    else if (['DNF', 'DNS', 'DSQ'].includes(u.type)) status[u.bib] = u.type; // the latest one stands
  }
  for (const o of out) if (o.race.mode === 'tt') for (const s of startList(v, o.race)) slot[s.bib] = s.at;

  const who = bib => {
    const e = v.entrants[bib];
    return { name: e?.name || '', cat: e?.cat || '', sex: e?.sex || '', o: byRace[e?.race] || out[0], unknown: hasList && !!bib && !e };
  };
  const startOf = (bib, o) => own[bib] ?? (bib in slot ? slot[bib] : o.race.start);
  const athletes = new Map();
  const athlete = bib => {
    if (!athletes.has(bib)) athletes.set(bib, { bib, ...who(bib), t: null, elapsed: null, splits: {}, seenAt: null, seenPoint: '' });
    return athletes.get(bib);
  };

  const seen = new Set(), info = {}, unranked = [];
  const sorted = [...v.times].sort((a, b) => a.t - b.t);
  const pass = (f, p, pointName, use) => {
    const w = who(f.bib), st = status[f.bib];
    const start = p === 'start' ? f.t : startOf(f.bib, w.o);
    const elapsed = start == null ? null : f.t - start;
    const problem = !f.bib ? 'no bib' : seen.has(p + '|' + f.bib) ? 'duplicate bib'
      : elapsed == null ? 'race not started' : elapsed < 0 ? 'before start'
      : st === 'DNS' || (st === 'DNF' && !p) ? `marked ${st}` : '';
    const row = info[f.id] = {
      id: f.id, t: f.t, bib: f.bib, name: w.name, cat: w.cat, race: w.o.race.name, raceId: w.o.race.id, unknown: w.unknown,
      point: pointName, elapsed: p === 'start' ? null : elapsed, problem,
    };
    if (problem) return void unranked.push(row);
    seen.add(p + '|' + f.bib);
    const a = athlete(f.bib);
    a.seenAt = f.t; a.seenPoint = pointName;
    use(a, elapsed);
  };
  // own starts first: they decide everyone's elapsed times
  for (const f of sorted) if (f.p === 'start') pass(f, 'start', 'Start', () => { own[f.bib] = f.t; });
  for (const f of sorted) {
    const p = f.p || '';
    if (p === 'start' || (p && !(p in pointIx))) continue; // a start (done above), or its timing point was deleted
    pass(f, p, p ? v.points[pointIx[p]].name : 'Finish', (a, elapsed) => {
      if (p) a.splits[p] = elapsed; else { a.t = f.t; a.elapsed = elapsed; }
    });
  }
  for (const bib in status) athlete(bib);
  for (const e of entrants) { // entered and under way, even if no timing point has seen them yet
    const start = startOf(e.bib, byRace[e.race]);
    if (start != null && start <= now && (!usesCheckin || e.ci)) athlete(e.bib);
  }

  for (const a of athletes.values()) {
    a.start = startOf(a.bib, a.o);
    a.pen = pen[a.bib] || 0;
    a.unserved = box.filter(b => b.bib === a.bib && !b.out).length;
    a.status = status[a.bib] || (a.elapsed == null ? 'on course' : '');
    a.total = a.status ? null : a.elapsed + a.pen;
    a.race = a.o.race.name;
    a.raceId = a.o.race.id;
    if (a.seenAt == null) { a.seenAt = a.start; a.seenPoint = 'Start'; }
    const far = Object.keys(a.splits).sort((x, y) => pointIx[y] - pointIx[x])[0];
    a.far = far ? [pointIx[far], a.splits[far]] : [-1, 0];
    a.o.rows.push(a);
    delete a.o;
  }
  for (const o of out) {
    o.rows.sort((a, b) => GROUP[a.status] - GROUP[b.status]
      || (a.status ? b.far[0] - a.far[0] || a.far[1] - b.far[1] || natural(a.bib, b.bib) : a.total - b.total));
    const cats = {};
    o.rows.forEach((r, i) => {
      if (r.status) return;
      r.pos = i + 1;
      r.catPos = r.cat ? (cats[r.cat] = (cats[r.cat] || 0) + 1) : '';
    });
    const n = s => o.rows.filter(r => r.status === s).length;
    const mine = entrants.filter(e => e.race === o.race.id);
    o.counts = {
      entered: mine.length, checkedIn: mine.filter(e => e.ci).length,
      finished: n(''), onCourse: n('on course'), out: n('DNF') + n('DSQ'), dns: n('DNS'),
      started: o.rows.length - n('DNS'),
      seen: Object.fromEntries(v.points.map(p => [p.id, o.rows.filter(r => r.splits[p.id] != null).length])),
      atFinish: o.rows.filter(r => r.t != null).length,
    };
  }
  const boxed = box.map(b => ({ ...b, name: v.entrants[b.bib]?.name || '', raceId: who(b.bib).o.race.id }));
  return { races: out, unranked, info, points: v.points, box: boxed, usesCheckin };
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
    ['Race', 'Pos', 'Bib', 'Name', 'Category', 'Sex', 'Cat pos', 'Finish time', 'Elapsed', 'Penalty', 'Total', ...res.points.map(p => p.name), 'Note'],
    ...res.races.flatMap(o => o.rows.map(r => [
      r.race, r.pos, r.bib, r.name, r.cat, r.sex, r.catPos, r.t == null ? '' : tod(r.t), f(r.elapsed), r.pen ? fmt(r.pen) : '', f(r.total),
      ...res.points.map(p => f(r.splits[p.id])),
      [r.status, r.unknown ? 'not in entry list' : '', r.unserved ? 'penalty box not served' : ''].filter(Boolean).join('; '),
    ])),
    ...res.unranked.map(r => [r.race, '', r.bib, r.name, r.cat, '', '', tod(r.t), f(r.elapsed), '', '', ...blank, `${r.point}: ${r.problem}`]),
  ].map(row => row.map(cell).join(',')).join('\r\n');
}

if (typeof module !== 'undefined') module.exports = { fmt, tod, parseTod, merge, view, parseEntrants, startList, results, toCsv, natural };
