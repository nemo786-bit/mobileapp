// Pure timing logic. Loaded by index.html as a plain script and by test.js via require().

const pad = n => String(n).padStart(2, '0');
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ms -> "H:MM:SS.t". Tenths are truncated, never rounded up: a time isn't reached until it has passed.
function fmt(ms) {
  if (ms == null || ms < 0) return '–';
  const t = Math.floor(ms / 100);
  return `${Math.floor(t / 36000)}:${pad(Math.floor(t / 600) % 60)}:${pad(Math.floor(t / 10) % 60)}.${t % 10}`;
}

// epoch ms -> local time of day "HH:MM:SS.t"
function tod(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${Math.floor(d.getMilliseconds() / 100)}`;
}

// One entrant per line: bib, name, category, race. Tab-separated (pasted from Excel) or comma/semicolon.
// Race names that don't exist yet are created.
// ponytail: naive split, quoted CSV fields aren't understood. Paste from a spreadsheet (tabs) if names contain commas.
function parseEntrants(text, races) {
  races = races.map(r => ({ ...r }));
  const entrants = {};
  for (const line of text.split(/\r?\n/)) {
    const [bib, name = '', cat = '', race = ''] = line.split(line.includes('\t') ? '\t' : /[,;]/).map(s => s.trim());
    if (!bib || /^bib$/i.test(bib)) continue;
    let r = race ? races.find(x => x.name.toLowerCase() === race.toLowerCase()) : races[0];
    if (!r) races.push(r = { id: newId(), name: race || 'Race', start: null });
    entrants[bib] = { name, cat, race: r.id };
  }
  return { entrants, races };
}

// Ranks finishes per race. A bib's race comes from the entry list; bibs not on the list go to the first race.
// Finishes that can't be ranked (no bib, repeated bib, no start time) are returned separately, never dropped.
function results(state) {
  const out = state.races.map(race => ({ race, rows: [] }));
  const byRace = Object.fromEntries(out.map(o => [o.race.id, o]));
  const hasList = Object.keys(state.entrants).length > 0;
  const seen = new Set();
  const unranked = [];
  for (const f of [...state.finishes].sort((a, b) => a.t - b.t)) {
    const e = state.entrants[f.bib];
    const o = byRace[e?.race] || out[0];
    const row = {
      ...f, name: e?.name || '', cat: e?.cat || '', race: o.race.name,
      unknown: hasList && !!f.bib && !e,
      elapsed: o.race.start == null ? null : f.t - o.race.start,
    };
    const problem = !f.bib ? 'no bib' : seen.has(f.bib) ? 'duplicate bib'
      : row.elapsed == null ? 'race not started' : row.elapsed < 0 ? 'before start' : '';
    if (problem) { unranked.push({ ...row, problem }); continue; }
    seen.add(f.bib);
    o.rows.push(row);
  }
  for (const o of out) {
    const cats = {};
    o.rows.forEach((row, i) => {
      row.pos = i + 1;
      row.catPos = row.cat ? (cats[row.cat] = (cats[row.cat] || 0) + 1) : '';
    });
  }
  return { races: out, unranked };
}

function toCsv(res) {
  const cell = v => {
    v = String(v ?? '');
    if (/^[=+\-@]/.test(v)) v = "'" + v; // stop spreadsheets running imported names as formulas
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const line = (r, note) => [r.race, r.pos, r.bib, r.name, r.cat, r.catPos, tod(r.t), fmt(r.elapsed), note].map(cell).join(',');
  return [
    'Race,Pos,Bib,Name,Category,Cat pos,Finish time,Elapsed,Note',
    ...res.races.flatMap(o => o.rows.map(r => line(r, r.unknown ? 'not in entry list' : ''))),
    ...res.unranked.map(r => line(r, r.problem)),
  ].join('\r\n');
}

if (typeof module !== 'undefined') module.exports = { fmt, tod, parseEntrants, results, toCsv };
