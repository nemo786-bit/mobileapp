// TrailTime screens. The timing logic lives in core.js; this file draws it and handles input.
const QS = new URLSearchParams(location.search);
const VIEW = QS.get('view');      // read-only live results link
const SCREEN = QS.has('screen');  // big public leaderboard
const KEY = 'trailtime.v2', DEV = 'trailtime.device';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const localIso = ms => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 19);
const ICON_X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="square"/></svg>';

// state.recs is the event (shared when syncing). dev is this device only: which event it joined, what
// it still has to send, its clock correction, the timing point it stands at and its theme.
const freshDev = () => ({ code: '', since: 0, dirty: {}, offset: 0, rtt: 1e9, point: '', view: '', theme: '' });
let state, dev, V, R, tab = 'timing', online = false, busy = false;
const ui = { resRace: '', resFilter: '', opsRace: '', opsFilter: '', q: '', regRace: '', regState: 'all', find: '', card: null };

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
function load() {
  state = VIEW ? { recs: {} } : read(KEY, { recs: {} });
  dev = { ...freshDev(), ...(VIEW ? {} : read(DEV, {})) };
  document.documentElement.style.colorScheme = dev.theme;
}
// Saved on every change, so a closed tab or dead battery loses nothing.
function save() {
  if (VIEW) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(DEV, JSON.stringify(dev));
    $('warn').hidden = true;
  } catch { $('warn').hidden = false; }
}

// Date.now(), not performance.now(): the monotonic clock stops while a phone sleeps, and a trail race
// lasts hours. dev.offset moves this device onto the sync server's clock, so that a start taken on one
// phone and a finish taken on another are measured against the same clock.
const now = () => Math.round(Date.now() + dev.offset);

function put(rec) {
  rec.u = Math.max(now(), (state.recs[rec.id]?.u || 0) + 1); // an edit always outranks what it edits
  state.recs[rec.id] = rec;
  dev.dirty[rec.id] = 1;
}
const del = id => put({ id, k: state.recs[id].k, del: 1 }); // a deletion is a record too, so it reaches the other devices
const commit = () => { save(); render(); sync(); };
const toBib = s => V.chips[s.trim()] || s.trim(); // a chip code from the entry list stands for its bib

async function sync() {
  const code = dev.code;
  if (busy || !(VIEW || code)) return;
  busy = true;
  const sent = Object.keys(dev.dirty).map(id => state.recs[id]).filter(Boolean);
  const t0 = Date.now();
  try {
    const res = VIEW
      ? await fetch(`api/view/${encodeURIComponent(VIEW)}?since=${dev.since}`)
      : await fetch(`api/sync/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ since: dev.since, recs: sent }) });
    if (!res.ok) throw 0;
    const body = await res.json();
    if (code !== dev.code) return; // left or reset while the request was in the air
    // Clock correction: the server's time lies mid-way through the round trip, give or take half of it.
    // Trust the quickest round trip seen; let that record age so a later clock change is picked up.
    const rtt = Date.now() - t0;
    if (rtt < dev.rtt) { dev.rtt = rtt; dev.offset = body.now - (t0 + rtt / 2); } else dev.rtt += 5;
    for (const r of sent) if (state.recs[r.id]?.u === r.u) delete dev.dirty[r.id];
    if (body.seq < dev.since) { // the server lost its copy: hand it ours again
      for (const id in state.recs) dev.dirty[id] = 1;
      dev.since = 0;
    } else dev.since = body.seq;
    dev.view = body.view || '';
    const changed = merge(state.recs, body.recs);
    online = true;
    save();
    if (changed.length) render(); else shell();
  } catch { online = false; shell(); }
  finally { busy = false; }
}

// ---------- drawing helpers

// Sets innerHTML only when it changed, so a refresh from another device doesn't disturb what's on screen.
function fill(el, html) { if (el._html !== html) el.innerHTML = el._html = html; }
const setVal = (input, v) => { if (document.activeElement !== input && input.value !== v) input.value = v; };
// Keyed list: rows are created, moved and removed one by one. A row the user is typing in is never rebuilt.
function list(el, items, html, update, empty = '') {
  const ids = new Set(items.map(it => it.id));
  for (const c of [...el.children]) if (!ids.has(c.dataset.id)) c.remove();
  const have = new Map([...el.children].map(c => [c.dataset.id, c]));
  let prev = null;
  items.forEach((it, i) => {
    let c = have.get(it.id);
    if (!c) { const t = document.createElement('template'); t.innerHTML = html(it).trim(); c = t.content.firstElementChild; c.dataset.id = it.id; }
    const want = prev ? prev.nextSibling : el.firstChild;
    if (c !== want) el.insertBefore(c, want);
    update(c, it, i);
    prev = c;
  });
  if (!items.length) el.innerHTML = empty;
}

const raceCss = r => r ? `--race:var(--r${r.c % 5})` : '';
const hasList = () => Object.keys(V.entrants).length > 0;
// The race whose colour a bib wears. Without an entry list every bib belongs to the first race.
const raceOfBib = bib => V.entrants[bib] ? V.races.find(r => r.id === V.entrants[bib].race) : hasList() ? null : V.races[0];
// An athlete, drawn as their bib. As a button it opens their card.
function chip(bib, tag = 'button') {
  const r = raceOfBib(bib), e = V.entrants[bib];
  const about = `${e?.name || (hasList() ? 'Not on the entry list' : 'Bib ' + bib)}${r ? ', ' + r.name : ''}`;
  return `<${tag} class="bib${r ? '' : ' nolist'}" style="${raceCss(r)}" ${tag === 'button' ? `data-open="${esc(bib)}" aria-label="Bib ${esc(bib)}, ${esc(about)}"` : ''} title="${esc(about)}"><i></i><b>${esc(bib)}</b></${tag}>`;
}
const mins = ms => { const m = Math.max(0, Math.floor(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)}`; };
const countdown = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const ord = n => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th');
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// Leaderboard filters: '' everyone, 's:F' a sex, 'c:F40' a category.
const match = (r, f) => !f || (f[0] === 's' ? r.sex === f.slice(2) : r.cat === f.slice(2));
function filterSelect(el, rows, key) {
  const sexes = ['F', 'M', 'X'].filter(s => rows.some(r => r.sex === s));
  const cats = [...new Set(rows.map(r => r.cat).filter(Boolean))].sort(natural);
  const values = ['', ...sexes.map(s => 's:' + s), ...cats.map(c => 'c:' + c)];
  if (!values.includes(ui[key])) ui[key] = '';
  fill(el, '<option value="">Everyone</option>'
    + sexes.map(s => `<option value="s:${s}">${{ F: 'Women', M: 'Men', X: 'Other' }[s]}</option>`).join('')
    + cats.map(c => `<option value="c:${esc(c)}">${esc(c)}</option>`).join(''));
  el.value = ui[key];
  el.parentElement.hidden = values.length < 2;
}
function raceSeg(el, key) {
  const o = R.races.find(o => o.race.id === ui[key]) || R.races[0];
  ui[key] = o.race.id;
  fill(el, R.races.length > 1 ? R.races.map(x => `<button data-race="${esc(x.race.id)}" aria-pressed="${x === o}">${esc(x.race.name)}</button>`).join('') : '');
  return o;
}
// Ranked rows of a race under a filter, with the position inside that filter.
const ranked = (o, f) => o.rows.filter(r => !r.status && match(r, f)).map((r, i) => ({ ...r, fpos: i + 1 }));
function rowHtml(r, brief) {
  const notes = [
    [r.cat, r.catPos ? `cat. ${r.catPos}` : ''].filter(Boolean).join(', '),
    ...(brief === true ? [] : V.points.filter(p => r.splits[p.id] != null).map(p => `${p.name} ${fmt(r.splits[p.id])}`)),
    r.pen ? `+${countdown(r.pen)} penalty` : '',
  ].filter(Boolean).join(' · ');
  const flags = [r.unknown ? 'not on the entry list' : '', r.unserved ? 'penalty box not served' : ''].filter(Boolean).join(' · ');
  return `<tr${r.status ? ' class="out"' : ''}><td class="pos">${r.status ? '' : r.fpos ?? r.pos}</td><td>${chip(r.bib)}</td>
    <td class="who">${esc(r.name) || (r.unknown ? '' : 'Bib ' + esc(r.bib))}<small>${esc(notes)}${flags ? `${notes ? ' · ' : ''}<em>${flags}</em>` : ''}</small></td>
    <td class="t">${r.status ? esc(r.status === 'on course' ? 'On course' : r.status) : fmt(r.total)}</td></tr>`;
}
const table = (rows, brief = false) => `<div class="scroll"><table><thead><tr><th>Pos</th><th>Bib</th><th>Athlete</th><th class="t">Time</th></tr></thead><tbody>${rows.map(r => rowHtml(r, brief)).join('')}</tbody></table></div>`;

// ---------- screens

function render() {
  V = view(state.recs);
  R = results(V, now());
  shell();
  if (SCREEN) return rBoard();
  ({ timing: rTiming, starts: rStarts, results: rResults, ops: rOps, people: rPeople, box: rBox, setup: rSetup })[tab]();
  const c = $('card');
  if (c.open && !(c.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) rCard();
}

function shell() {
  $('title').textContent = V.name || 'TrailTime';
  document.title = V.name ? `${V.name} · TrailTime` : 'TrailTime';
  const unsent = Object.keys(dev.dirty).length, shared = VIEW || dev.code;
  $('status').hidden = !shared;
  $('status').classList.toggle('off', !online);
  $('status').lastElementChild.textContent = online ? (VIEW ? 'Live' : unsent ? 'Sending' : 'In sync') : 'Offline';
  $('net').hidden = online || !shared;
  $('net').textContent = VIEW ? 'Offline. Showing the last results received.'
    : `Offline. ${unsent ? `${plural(unsent, 'change')} will be sent when the connection returns.` : 'Still recording on this device.'}`;
  const ms = Math.round(dev.offset);
  fill($('syncBox'), dev.code ? `
    <p>Event code <b>${esc(dev.code)}</b> · ${online ? (unsent ? 'sending…' : 'in sync') : '<em>not connected, still trying</em>'}</p>
    <p class="hint">This device's clock is ${Math.abs(ms) < 50 ? 'in step with' : `${(Math.abs(ms) / 1000).toFixed(2)} s ${ms > 0 ? 'behind' : 'ahead of'}`} the event clock${online || dev.rtt < 1e9 ? '; times are corrected automatically' : ''}.</p>
    ${dev.view ? `<p><a href="?view=${esc(dev.view)}">Live results link</a> <span class="hint">read-only, safe to share with spectators</span></p>
    <p><a href="?view=${esc(dev.view)}&screen">Big screen leaderboard</a> <span class="hint">for a TV or projector</span></p>` : ''}
    <button id="leave" class="btn">Leave event</button>` : `
    <p class="hint">Devices that enter the same code share one event: starts, times, check-ins, penalties and results. This needs the app to be opened from the TrailTime server (see README).</p>
    <div class="row" style="margin-top:8px"><input id="code" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Event code, e.g. moka-2026" aria-label="Event code">
    <button id="join" class="btn">Join or create</button></div>
    <p style="margin-top:8px"><a href="?screen">Big screen leaderboard</a> <span class="hint">shows this device's results full screen</span></p>`);
}

function rTiming() {
  const many = V.races.length > 1;
  fill($('clocks'), V.races.map(r => `<div class="rfield" style="${raceCss(r)}"><b>${esc(r.name)}</b>
    ${r.start != null ? `<span class="num" data-since="${r.start}"></span>`
      : r.mode === 'tt' ? '<span class="num">Time trial</span>' : `<button class="start" data-start="${esc(r.id)}">Start</button>`}</div>`).join(''));
  tick();

  const tt = V.races.some(r => r.mode === 'tt');
  if (!['', 'start'].includes(dev.point) && !V.points.some(p => p.id === dev.point)) dev.point = '';
  if (dev.point === 'start' && !tt) dev.point = '';
  $('pointRow').hidden = !V.points.length && !tt;
  fill($('point'), (tt ? '<option value="start">Start line</option>' : '')
    + V.points.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') + '<option value="">Finish line</option>');
  $('point').value = dev.point;
  const here = dev.point === 'start' ? 'Start' : V.points.find(p => p.id === dev.point)?.name || 'Finish';
  $('press').textContent = here;
  $('logTitle').textContent = `Recorded at ${here === 'Finish' ? 'the finish' : here === 'Start' ? 'the start' : here}`;
  bibWho();

  const times = V.times.filter(f => (f.p || '') === dev.point && R.info[f.id]).sort((a, b) => b.t - a.t);
  list($('log'), times, () => `
    <li><span class="seq"></span><input data-bib inputmode="numeric" autocomplete="off" placeholder="bib"><span class="meta"></span>
      <button class="x" data-del>${ICON_X}</button></li>`,
    (li, f, i) => {
      const r = R.info[f.id], n = times.length - i, [seq, bib, meta, x] = li.children;
      const who = r.problem ? `<em>${esc(r.problem)}</em>` : r.unknown ? '<em>not on the entry list</em>' : esc(r.name);
      seq.textContent = n;
      fill(meta, `<b>${dev.point === 'start' ? tod(r.t) : fmt(r.elapsed)}</b><small>${[dev.point === 'start' ? '' : tod(r.t), many && r.bib ? esc(r.race) : '', who].filter(Boolean).join(' · ')}</small>`);
      setVal(bib, f.bib);
      bib.ariaLabel = `Bib for time ${n}`;
      x.ariaLabel = `Delete time ${n}`;
    }, '<li class="empty" style="display:block">Nothing recorded here yet. Start the race, then press the button as each athlete passes.</li>');
}

// Shows who a typed bib belongs to, before the press.
function bibWho() {
  const typed = $('bib').value.trim(), bib = typed && toBib(typed), e = V.entrants[bib], r = bib ? raceOfBib(bib) : null;
  $('bibbox').setAttribute('style', raceCss(r));
  fill($('bibWho'), !typed ? '' : e ? `${esc(e.name || 'Bib ' + bib)} · ${esc(r.name)}` : hasList() ? '<em>Not on the entry list</em>' : '');
}

function rStarts() {
  const waiting = V.races.filter(r => r.start == null && r.mode !== 'tt');
  $('startAll').hidden = waiting.length < 2;
  $('startAll').dataset.start = 'all';
  $('startAll').textContent = `Start all ${waiting.length} mass-start races together`;
  $('startAll').style.marginBottom = '16px';
  list($('rcards'), V.races, () => `
    <article class="card rcard">
      <header class="rfield"><b></b><span class="num"></span></header>
      <div class="pad">
        <div class="seg" role="group" aria-label="Start type"><button data-mode="">Mass start</button><button data-mode="tt">Time trial</button></div>
        <div class="row">
          <label>Start date<input data-rdate type="date"></label>
          <label>Start time<input data-rtime autocomplete="off" placeholder="07:00:00.0"></label>
          <label>Seconds between starts<input data-rgap type="number" min="1" step="1" inputmode="numeric"></label>
        </div>
        <button class="btn primary go"></button>
        <div class="ttpanel"></div>
      </div>
    </article>`,
    (el, r) => {
      const head = el.firstElementChild, [name, clock] = head.children;
      const [date, time, gap] = el.querySelectorAll('input'), go = el.querySelector('.go');
      head.setAttribute('style', raceCss(r));
      name.textContent = r.name;
      if (r.start == null) { delete clock.dataset.since; clock.textContent = 'Not started'; } else clock.dataset.since = r.start;
      for (const b of el.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', (r.mode || '') === b.dataset.mode);
      if (r.start != null) setVal(date, localIso(r.start).slice(0, 10)); // while unset, leave a date the user picked alone
      setVal(time, r.start == null ? '' : tod(r.start, 3));
      gap.parentElement.hidden = r.mode !== 'tt';
      setVal(gap, String(r.gap || 60));
      go.hidden = r.start != null;
      go.dataset.start = r.id;
      go.textContent = r.mode === 'tt' ? 'Start first athlete' : 'Start now';
      fill(el.querySelector('.ttpanel'), ttHtml(r));
    });
  tick();
}
function ttHtml(r) {
  if (r.mode !== 'tt') return '<p class="hint" style="margin-top:12px">Everyone in this race starts together on the gun. To correct the gun time, type it above, down to a thousandth if you have it.</p>';
  const all = startList(V, r), t = now(), gap = r.gap || 60;
  if (!all.length) return '<p class="empty">No athletes are entered in this race yet. Add them on the Registration tab; they start in bib order.</p>';
  if (r.start == null) return `<p class="hint" style="margin-top:12px">Press the button as bib ${esc(all[0].bib)} leaves. The other ${all.length - 1} follow in bib order, one every ${gap} seconds.</p>`;
  const to = all.filter(s => s.at > t);
  if (!to.length) return `<p class="hint" style="margin-top:12px">All ${all.length} athletes have started.</p>`;
  return `<div class="next">${chip(to[0].bib)}<strong>${esc(to[0].name) || 'Next to start'}</strong><span class="num" data-until="${to[0].at}"></span></div>
    <ol class="queue">${to.slice(1, 6).map(s => `<li>${chip(s.bib)}<span>${esc(s.name)}</span><span class="num">${tod(s.at, 0)}</span></li>`).join('')}</ol>
    <p class="hint">${all.length - to.length} gone, ${to.length} to go. A no-show keeps their slot: open their bib and mark them DNS. An athlete who leaves late can be timed from the Start line on the Timing tab.</p>`;
}

function rResults() {
  const o = raceSeg($('resRaces'), 'resRace'), c = o.counts;
  filterSelect($('resFilter'), o.rows, 'resFilter');
  const f = ui.resFilter, top = ranked(o, f);
  const rest = o.rows.filter(r => r.status && match(r, f));
  const seen = rest.filter(r => r.status !== 'on course' || r.far[0] >= 0), unseen = rest.length - seen.length;
  fill($('sheet'), `<h2 style="margin-top:0">${esc(o.race.name)} <small>${c.finished} finished${c.onCourse ? ` · ${c.onCourse} on course` : ''}${c.out ? ` · ${c.out} out` : ''}</small></h2>
    ${top.length + seen.length ? table([...top, ...seen], matchMedia('(max-width: 899px)').matches) /* phones: splits live on the athlete card */ :`<p class="empty">${o.race.start == null && o.race.mode !== 'tt' ? 'This race has not started.' : 'No one has been timed yet.'}</p>`}
    ${unseen ? `<p class="hint" style="margin-top:10px">${plural(unseen, 'more athlete')} on course, not yet seen at a timing point.</p>` : ''}`);

  $('attnBox').hidden = !R.unranked.length;
  list($('attn'), R.unranked, () => `<li><span class="meta"></span><input data-bib data-edit inputmode="numeric" autocomplete="off" placeholder="bib" aria-label="Bib for this time">
    <button class="x" data-del data-edit aria-label="Delete this time">${ICON_X}</button></li>`,
    (li, r) => {
      fill(li.children[0], `<b>${tod(r.t)}</b><small>${esc(r.point)}${r.bib ? ` · ${esc(r.race)}` : ''} · <em>${esc(r.problem)}</em></small>`);
      setVal(li.children[1], r.bib);
    });

  fill($('updates'), V.updates.filter(u => u.type !== 'BOX').sort((a, b) => a.u - b.u).map(u => `
    <li>${chip(u.bib)}<span>${esc(V.entrants[u.bib]?.name)} · ${u.type === 'PEN' ? `+${countdown(u.sec * 1000)} penalty` : esc(u.type)}</span>
      <button class="x" data-udel="${esc(u.id)}" aria-label="Remove this entry for bib ${esc(u.bib)}">${ICON_X}</button></li>`).join(''));
}

function rOps() {
  const t = now();
  fill($('opsFields'), R.races.map(({ race: r, counts: c }) => `<div class="rfield big" style="${raceCss(r)}"><b>${esc(r.name)}</b>
    ${r.start == null ? '<span class="num">Not started</span>' : `<span class="num" data-since="${r.start}"></span>`}
    <dl>${(r.start == null ? [[c.entered, 'Entered'], [c.checkedIn, 'Checked in']]
      : [[c.started, 'Started'], [c.onCourse, 'On course'], [c.finished, 'Finished'], [c.out, 'Out'], ...(c.dns ? [[c.dns, 'DNS']] : [])])
      .map(([n, label]) => `<div><dd>${n}</dd><dt>${label}</dt></div>`).join('')}</dl></div>`).join(''));
  tick();

  const q = ui.find.trim().toLowerCase(), rows = R.races.flatMap(o => o.rows);
  const known = new Map([...Object.values(V.entrants).map(e => [e.bib, e.name]), ...rows.map(r => [r.bib, r.name])]);
  const hits = q ? [...known].filter(([bib, name]) => bib.toLowerCase() === q || bib.toLowerCase().startsWith(q) || name.toLowerCase().includes(q))
    .sort((a, b) => (b[0].toLowerCase() === q) - (a[0].toLowerCase() === q) || natural(a[0], b[0])).slice(0, 8) : [];
  fill($('found'), hits.map(([bib, name]) => `<button data-open="${esc(bib)}">${chip(bib, 'span')}${esc(name) || 'Not on the entry list'}</button>`).join('')
    || (q ? '<p class="hint">No athlete matches.</p>' : ''));

  const done = rows.filter(r => !r.status).sort((a, b) => b.t - a.t).slice(0, 14);
  fill($('wallDone'), done.map(r => `<div class="tile">${chip(r.bib)}<small>${fmt(r.total)}</small></div>`).join('')
    || '<p class="empty" style="padding:0">No one has finished yet.</p>');
  const outThere = rows.filter(r => r.status === 'on course').sort((a, b) => a.seenAt - b.seenAt);
  fill($('wallOut'), outThere.slice(0, 14).map(r => `<div class="tile">${chip(r.bib)}<small>${esc(r.seenPoint)} · ${mins(t - r.seenAt)}</small></div>`).join('')
    + (outThere.length > 14 ? `<p class="hint" style="flex-basis:100%">and ${outThere.length - 14} more on course.</p>` : '')
    || '<p class="empty" style="padding:0">Nobody is out on the course.</p>');
  fill($('opsAttn'), R.unranked.length ? `<div class="attn"><h2>${plural(R.unranked.length, 'press', 'presses')} need attention</h2>
    <p style="margin-bottom:10px">Times with a missing or repeated bib are not counted until someone fixes them.</p>
    <p style="padding-bottom:10px"><button class="btn" data-tab="results">Review on Results</button></p></div>` : '');

  const o = raceSeg($('opsRaces'), 'opsRace'), c = o.counts;
  filterSelect($('opsFilter'), o.rows, 'opsFilter');
  const top = ranked(o, ui.opsFilter).slice(0, 10);
  fill($('top10'), top.length ? table(top, true) :'<p class="empty" style="padding:0">No finishers yet.</p>');
  const marks = [['Start', c.started], ...V.points.map(p => [p.name, c.seen[p.id]]), ['Finish', c.atFinish]];
  const max = Math.max(1, ...marks.map(m => m[1]));
  fill($('bars'), marks.map(([name, n]) => `<span class="lab">${esc(name)}</span>
    <div class="track" tabindex="0" style="--w:${(n / max * 100).toFixed(1)}%;${raceCss(o.race)}" data-tip="${esc(`${name}: ${n} of ${plural(c.started, 'starter')}`)}"><i></i><b>${n}</b></div>`).join(''));
}

function rPeople() {
  fill($('regStats'), R.races.map(({ race: r, counts: c }) => `<div class="rfield" style="${raceCss(r)}"><b>${esc(r.name)}</b>
    <span class="num">${c.checkedIn} / ${c.entered}</span></div>`).join(''));
  fill($('regRace'), '<option value="">All races</option>' + V.races.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join(''));
  if (!V.races.some(r => r.id === ui.regRace)) ui.regRace = '';
  $('regRace').value = ui.regRace;
  $('regRace').parentElement.hidden = V.races.length < 2;
  for (const b of $('regState').children) b.setAttribute('aria-pressed', b.dataset.state === ui.regState);

  const q = ui.q.trim().toLowerCase(), all = Object.values(V.entrants);
  const hits = all.filter(e => (!q || e.bib.toLowerCase().startsWith(q) || e.name.toLowerCase().includes(q))
    && (!ui.regRace || e.race === ui.regRace) && (ui.regState === 'all' || (ui.regState === 'in') === !!e.ci))
    .sort((a, b) => natural(a.bib, b.bib));
  const raceName = Object.fromEntries(V.races.map(r => [r.id, r.name]));
  fill($('roster'), !all.length ? '<p class="empty">No athletes yet. Add them one by one here, or import an entry list in Setup.</p>'
    : !hits.length ? '<p class="empty">No athlete matches this search.</p>'
    : `<p class="hint" style="margin-bottom:8px">Checked in / entered is shown per race above. ${hits.length > 150 ? `Showing the first 150 of ${hits.length}; search to narrow it down.` : plural(hits.length, 'athlete') + '.'}</p>
    <div class="scroll"><table><tbody>${hits.slice(0, 150).map(e => `<tr><td>${chip(e.bib)}</td>
      <td class="who">${esc(e.name) || 'Bib ' + esc(e.bib)}<small>${esc([e.cat, raceName[e.race], e.chip && 'chip ' + e.chip].filter(Boolean).join(' · '))}</small></td>
      <td class="t" style="font-size:1rem;font-stretch:100%;font-weight:400">${e.ci ? `In at ${tod(e.ci, 0)} <button class="btn" data-ci="${esc(e.bib)}">Undo</button>`
        : `<button class="btn primary" data-ci="${esc(e.bib)}">Check in</button>`}</td></tr>`).join('')}</tbody></table></div>`);
}

function rBox() {
  const t = now(), pen = b => `${countdown(b.sec * 1000)} penalty`;
  const li = (b, right, cls = '') => `<li class="${cls}">${chip(b.bib)}<span>${esc(b.name) || 'Bib ' + esc(b.bib)}<br><small class="hint">${right[0]}</small></span>${right[1]}</li>`;
  const serving = R.box.filter(b => b.in && !b.out).sort((a, b) => a.in + a.sec * 1000 - (b.in + b.sec * 1000));
  const coming = R.box.filter(b => !b.in), served = R.box.filter(b => b.out).sort((a, b) => b.out - a.out);
  fill($('boxLists'), `
    <h2>In the box <small>${serving.length}</small></h2>
    <ul class="boxlist">${serving.map(b => { const end = b.in + b.sec * 1000; return li(b, [end <= t ? 'Time served' : pen(b),
      `<span class="num" data-until="${end}" style="flex:none"></span><button class="btn primary" data-out="${esc(b.id)}">Release</button>`], end <= t ? 'due' : ''); }).join('')
      || '<li class="empty">Nobody is serving a penalty.</li>'}</ul>
    <h2>On their way <small>${coming.length}</small></h2>
    <ul class="boxlist">${coming.map(b => li(b, [pen(b), `<button class="btn primary" data-in="${esc(b.id)}">Arrived</button>
      <button class="x" data-udel="${esc(b.id)}" aria-label="Cancel this penalty for bib ${esc(b.bib)}">${ICON_X}</button>`])).join('')
      || '<li class="empty">No penalties waiting.</li>'}</ul>
    ${served.length ? `<h2>Served <small>${served.length}</small></h2>
    <ul class="boxlist">${served.slice(0, 30).map(b => li(b, [`${pen(b)} · in ${tod(b.in, 0)}, out ${tod(b.out, 0)}${b.out - b.in < b.sec * 1000 ? ` · <em>released ${countdown(b.sec * 1000 - (b.out - b.in))} early</em>` : ''}`, ''])).join('')}</ul>` : ''}`);
  tick();
}

function rSetup() {
  const many = V.races.length > 1;
  setVal($('eventName'), V.name);
  list($('races'), V.races, () => `<div class="setrow"><i></i><input data-rname aria-label="Race name"><button class="x" data-rdel aria-label="Delete race">${ICON_X}</button></div>`,
    (el, r) => { el.children[0].setAttribute('style', raceCss(r)); setVal(el.children[1], r.name); el.children[2].hidden = !many; });
  list($('points'), V.points, () => `<div class="setrow pt"><input data-pname aria-label="Checkpoint name"><button class="x" data-pdel aria-label="Delete checkpoint">${ICON_X}</button></div>`,
    (el, p) => setVal(el.children[0], p.name));
  const n = Object.keys(V.entrants).length;
  $('entrantCount').textContent = n ? `(${n} loaded)` : '';
  for (const b of $('theme').children) b.setAttribute('aria-pressed', b.dataset.theme === dev.theme);
  $('demoBox').hidden = n > 0 || V.times.length > 0;
}

// The public leaderboard: one column per race, ten rows, readable from across a finish area.
function rBoard() {
  const t = now();
  fill($('board'), R.races.map(({ race: r, rows, counts: c }) => {
    const top = rows.filter(x => !x.status).slice(0, 10);
    return `<div class="col"><div class="rfield" style="${raceCss(r)}"><div><b>${esc(r.name)}</b><br><small>${c.finished} finished${c.onCourse ? ` · ${c.onCourse} on course` : ''}</small></div>
      ${r.start == null ? '<span class="num">Not started</span>' : `<span class="num" data-since="${r.start}"></span>`}</div>
      ${top.length ? `<ol style="grid-template-rows:repeat(10,1fr)">${top.map(x => `<li${t - x.t < 60000 ? ' class="new"' : ''}><span class="pos">${x.pos}</span>${chip(x.bib, 'span')}
        <span class="nm">${esc(x.name)}</span><span class="t">${fmt(x.total)}</span></li>`).join('')}</ol>`
        : '<p class="none">The first finishers will appear here.</p>'}</div>`;
  }).join(''));
  tick();
}

// ---------- the athlete card: everything about one bib, opened from any bib on any screen
function rCard() {
  const bib = ui.card, d = $('card'), isNew = bib === '+';
  const e = V.entrants[bib], r = isNew ? null : raceOfBib(bib), row = R.races.flatMap(o => o.rows).find(x => x.bib === bib);
  const open = d.querySelector('details')?.open ?? !e;
  const st = row?.status ?? '';
  const state = isNew ? '' : !row ? (e?.ci ? `Checked in at ${tod(e.ci, 0)}` : e ? 'Not started' : 'No times recorded')
    : st === '' ? `Finished ${ord(row.pos)} · ${fmt(row.total)}` : st === 'on course' ? `On course · last seen at ${row.seenPoint}, ${mins(now() - row.seenAt)} ago` : st;
  const passes = isNew ? [] : [...(row?.start != null ? [{ point: 'Start', t: row.start, elapsed: null }] : []),
    ...Object.values(R.info).filter(i => i.bib === bib && !i.problem && i.point !== 'Start').sort((a, b) => a.t - b.t)];
  const ups = isNew ? [] : V.updates.filter(u => u.bib === bib && ['PEN', 'BOX'].includes(u.type)).sort((a, b) => a.u - b.u);
  const field = (label, key, value, cls = '') => `<label class="${cls}">${label}<input data-ef="${key}" value="${esc(value)}" autocomplete="off"></label>`;
  const form = `<div class="form">
      ${isNew ? field('Bib number', 'bib', '', 'wide') : ''}${field('Name', 'name', e?.name, 'wide')}${field('Category', 'cat', e?.cat)}
      <label>Sex<select data-ef="sex">${[['', 'Not set'], ['F', 'Female'], ['M', 'Male'], ['X', 'Other']].map(([v, l]) => `<option value="${v}"${(e?.sex || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Race<select data-ef="race">${V.races.map(x => `<option value="${esc(x.id)}"${(e?.race || V.races[0].id) === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      ${field('Chip code', 'chip', e?.chip)}
      <button class="btn primary" data-esave>${e ? 'Save' : 'Add to the entry list'}</button>
      ${e ? '<button class="btn danger" data-eremove>Remove athlete</button>' : ''}
    </div>`;
  fill(d, `<div class="chead">
      ${isNew ? '' : `<div class="bibbox" style="${raceCss(r)}"><i></i><b>${esc(bib)}</b></div>`}
      <div><h1 id="cardName">${isNew ? 'New athlete' : esc(e?.name) || (e || !hasList() ? 'Bib ' + esc(bib) : 'Not on the entry list')}</h1>
        <p>${esc([r?.name, e?.cat, { F: 'Female', M: 'Male', X: 'Other' }[e?.sex]].filter(Boolean).join(' · '))}</p><p class="state">${esc(state)}</p></div>
      <button class="x" data-close aria-label="Close">${ICON_X}</button>
    </div>
    <div class="cbody">${isNew ? `<div style="margin-top:16px">${form}</div>` : `
      ${passes.length ? `<h3>Passes</h3><ol class="passes">${passes.map(p => `<li><span>${esc(p.point)}</span><small>${tod(p.t)}</small><span class="num">${p.elapsed == null ? '' : fmt(p.elapsed)}</span></li>`).join('')}</ol>` : ''}
      <div data-edit>
        <h3>Status</h3>
        <div class="seg" role="group" aria-label="Status">${[['', 'Racing'], ['DNF', 'DNF'], ['DNS', 'DNS'], ['DSQ', 'DSQ']].map(([v, l]) =>
          `<button data-st="${v}" aria-pressed="${(['DNF', 'DNS', 'DSQ'].includes(st) ? st : '') === v}">${l}</button>`).join('')}</div>
        <h3>Penalty</h3>
        <div class="row"><input id="cMin" type="number" min="0" step="any" placeholder="Minutes" aria-label="Penalty in minutes">
          <button class="btn" data-cpen="PEN">Add to time</button><button class="btn" data-cpen="BOX">Send to box</button></div>
        <ul class="plain" style="margin-top:8px">${ups.map(u => `<li><span>${u.type === 'PEN' ? `+${countdown(u.sec * 1000)} added to time` : `${countdown(u.sec * 1000)} in the box · ${u.out ? 'served' : u.in ? 'serving now' : 'not served yet'}`}</span>
          <button class="x" data-udel="${esc(u.id)}" aria-label="Remove this penalty">${ICON_X}</button></li>`).join('')}</ul>
        ${e ? `<h3>Sign-on</h3><p>${e.ci ? `Checked in at ${tod(e.ci, 0)} <button class="btn" data-ci="${esc(bib)}" style="margin-left:8px">Undo</button>` : `<button class="btn primary" data-ci="${esc(bib)}">Check in</button>`}</p>` : ''}
        <details${open ? ' open' : ''}><summary>${e ? 'Edit details' : 'Add to the entry list'}</summary>${form}</details>
      </div>`}
    </div>`);
}
function openCard(bib) {
  ui.card = bib;
  $('card')._html = null; // a fresh card starts with its details closed
  $('card').innerHTML = '';
  rCard();
  if (!$('card').open) $('card').showModal();
}
$('card').addEventListener('close', () => { ui.card = null; });
$('card').addEventListener('click', e => { if (e.target === $('card')) $('card').close(); }); // a tap on the backdrop

function tick() {
  const t = now();
  for (const el of document.querySelectorAll('[data-since]')) el.textContent = fmt(t - el.dataset.since);
  for (const el of document.querySelectorAll('[data-until]')) el.textContent = countdown(el.dataset.until - t);
}

function show(next) {
  tab = next;
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== (SCREEN ? 'board' : tab);
  const inMore = !!$('more').querySelector(`[data-tab="${tab}"]`);
  for (const b of document.querySelectorAll('.tabs [data-tab]')) b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  document.querySelector('.morebtn').setAttribute('aria-current', inMore ? 'page' : 'false');
  try { $('more').hidePopover(); } catch {}
  render();
}

// ---------- recording

function record(t) {
  const bib = toBib($('bib').value);
  put({ id: newId(), k: 'time', t, bib, p: dev.point });
  $('bib').value = '';
  commit();
  $('log').firstElementChild.classList.add('flash');
  navigator.vibrate?.(40);
  if (bib) $('bib').focus(); // typing bibs first: stay ready for the next one
}

// Fire on press, not release: click arrives ~100ms late. A click with detail 0 comes from a keyboard
// or assistive tech, which never sends pointerdown.
function onPress(sel, fn) {
  const on = (type, ok) => document.addEventListener(type, e => {
    const t = now();
    const el = e.target.closest?.(sel);
    if (el && ok(e)) fn(el, t);
  });
  on('pointerdown', e => e.button === 0);
  on('click', e => e.detail === 0);
}
onPress('#press', (_, t) => record(t));
onPress('[data-start]', (el, t) => {
  for (const r of V.races) if (r.start == null && (r.id === el.dataset.start || (el.dataset.start === 'all' && r.mode !== 'tt'))) put({ ...r, start: t });
  commit();
});
$('bib').addEventListener('keydown', e => { if (e.key === 'Enter') record(now()); });
$('bib').addEventListener('input', bibWho);
// A reader "types" wherever the focus is: on the Timing tab, send stray typing to the bib box.
document.addEventListener('keydown', e => {
  if (tab === 'timing' && !SCREEN && !$('card').open && /^[\w-]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey
    && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) $('bib').focus();
});

// Registration: Enter on an exact bib (typed or scanned) checks that athlete in.
$('q').addEventListener('input', () => { ui.q = $('q').value; rPeople(); });
$('q').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !$('q').value.trim()) return;
  const bib = toBib($('q').value), a = V.entrants[bib];
  if (!a) return void ($('regMsg').textContent = `No athlete has bib ${bib}.`);
  $('regMsg').textContent = a.ci ? `${bib} ${a.name} was already checked in at ${tod(a.ci, 0)}.` : `Checked in ${bib} ${a.name}.`;
  if (!a.ci) put({ ...a, ci: now() });
  ui.q = $('q').value = '';
  commit();
});
$('find').addEventListener('input', () => { ui.find = $('find').value; rOps(); });
$('find').addEventListener('keydown', e => { if (e.key === 'Enter') $('found').querySelector('button')?.click(); });

// ---------- sample event, so every screen can be explored before race day
function demo() {
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const first = ['Amara', 'Jonas', 'Mei', 'Tomás', 'Priya', 'Noah', 'Sara', 'Luca', 'Ines', 'Kofi', 'Hana', 'Leo', 'Zoé', 'Omar', 'Ana', 'Finn', 'Lina', 'Raj', 'Eva', 'Theo'];
  const last = ['Diallo', 'Reiter', 'Tanaka', 'Vidal', 'Nair', 'Becker', 'Lindqvist', 'Ferri', 'Moreau', 'Mensah', 'Sato', 'Novak', 'Okafor', 'Silva', 'Haddad', 'Larsen', 'Kowalski', 'Mehta', 'Costa', 'Ryan'];
  const t = now(), H = 3600e3, time = (ms, bib, p) => put({ id: newId(), k: 'time', t: Math.round(ms), bib, p });
  put({ id: 'meta', k: 'meta', name: 'Sample event (invented data)' });
  put({ id: 'demoCP1', k: 'point', name: 'CP1 Col Vert', o: 1 });
  put({ id: 'demoCP2', k: 'point', name: 'CP2 Lac Noir', o: 2 });
  const races = [
    { id: 'demo50', name: '50K', c: 0, start: t - 3.7 * H, n: 60, from: 1, base: 3.25 * H, spread: 2.6 * H, marks: [['demoCP1', .3], ['demoCP2', .64]] },
    { id: 'demo25', name: '25K', c: 1, start: t - 2.7 * H, n: 80, from: 101, base: 1.75 * H, spread: 1.9 * H, marks: [['demoCP1', .56]] },
  ];
  races.forEach((r, i) => {
    put({ id: r.id, k: 'race', name: r.name, start: Math.round(r.start), o: i + 1, c: r.c });
    for (let j = 0; j < r.n; j++) {
      const bib = String(r.from + j), sex = rnd() < .42 ? 'F' : 'M';
      put({ id: 'e:' + bib, k: 'entrant', bib, name: `${first[Math.floor(rnd() * 20)]} ${last[Math.floor(rnd() * 20)]}`, cat: `${sex} ${rnd() < .6 ? 'Senior' : 'Master'}`, race: r.id, chip: '', sex, ci: 0 });
      const total = r.base + r.spread * rnd() ** 1.4, dns = ['12', '140'].includes(bib), dnf = ['33', '171'].includes(bib);
      if (dns) { put({ id: newId(), k: 'update', bib, type: 'DNS', sec: 0 }); continue; }
      for (const [p, frac] of r.marks) { const at = r.start + total * frac * (.97 + .06 * rnd()); if (at <= t && !(dnf && frac > .5)) time(at, bib, p); }
      if (dnf) put({ id: newId(), k: 'update', bib, type: 'DNF', sec: 0 });
      else if (r.start + total <= t) time(r.start + total, bib, '');
    }
  });
  put({ id: newId(), k: 'update', bib: '104', type: 'PEN', sec: 120 });
  put({ id: newId(), k: 'update', bib: '22', type: 'BOX', sec: 120, in: 0, out: 0 });
  time(t - 4 * 60e3, '', '');        // a press nobody put a bib on
  time(t - 9 * 60e3, '105', '');     // the same bib twice
  time(t - 8.9 * 60e3, '105', '');
}

// ---------- everything else that is clicked or changed

document.addEventListener('click', e => {
  const el = e.target.closest('button, a[data-tab]');
  if (!el) return;
  const d = el.dataset, id = el.closest('[data-id]')?.dataset.id, race = () => ({ ...V.races.find(r => r.id === id) });
  const stored = () => V.races.filter(r => state.recs[r.id] && !state.recs[r.id].del);
  const freeColour = taken => [0, 1, 2, 3, 4].find(c => !taken.includes(c)) ?? taken.length % 5;
  const minutes = input => Math.round(input.value * 60);
  if (d.tab) return show(d.tab);
  if (d.open) return openCard(d.open);
  if ('close' in d) return $('card').close();
  if (d.race) { ui[el.parentElement.id === 'opsRaces' ? 'opsRace' : 'resRace'] = d.race; return render(); }
  if (d.state) { ui.regState = d.state; return render(); }
  if ('theme' in d) { dev.theme = d.theme; document.documentElement.style.colorScheme = dev.theme; save(); return render(); }
  if (el.id === 'addAthlete') return openCard('+');
  if (el.id === 'export') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + toCsv(R)], { type: 'text/csv' })); // BOM: Excel reads accents correctly
    a.download = `${V.name || 'results'}.csv`;
    return a.click();
  }
  if (VIEW) return;

  if ('mode' in d) put({ ...race(), mode: d.mode, gap: race().gap || 60 });
  else if ('del' in d) {
    const f = state.recs[id];
    if (!confirm(`Delete the time ${tod(f.t)}${f.bib ? ` (bib ${f.bib})` : ''}?`)) return;
    del(id);
  } else if ('rdel' in d) {
    const r = race();
    if (!confirm(`Delete race "${r.name}"? Its athletes will be timed against "${V.races.find(x => x.id !== id).name}".`)) return;
    del(id);
  } else if ('pdel' in d) {
    const n = V.times.filter(f => f.p === id).length;
    if (!confirm(`Delete checkpoint "${state.recs[id].name}"?${n ? ` Its ${plural(n, 'recorded time')} will no longer be shown.` : ''}`)) return;
    del(id);
  } else if (d.udel) del(d.udel);
  else if (d.ci) { const a = V.entrants[d.ci]; put({ ...a, ci: a.ci ? 0 : now() }); }
  else if (d.in) put({ ...state.recs[d.in], in: now() });
  else if (d.out) {
    const b = state.recs[d.out], left = b.in + b.sec * 1000 - now();
    if (left > 0 && !confirm(`Bib ${b.bib} still has ${countdown(left)} to serve. Release anyway?`)) return;
    put({ ...b, out: now() });
  } else if ('st' in d) {
    for (const u of V.updates) if (u.bib === ui.card && ['DNF', 'DNS', 'DSQ'].includes(u.type)) del(u.id);
    if (d.st) put({ id: newId(), k: 'update', bib: ui.card, type: d.st, sec: 0 });
  } else if (d.cpen) {
    const sec = minutes($('cMin'));
    if (!(sec > 0)) return alert('Enter the penalty in minutes, for example 2 or 0.5.');
    put({ id: newId(), k: 'update', bib: ui.card, type: d.cpen, sec, in: 0, out: 0 });
    $('cMin').value = '';
  } else if ('esave' in d) {
    const v = Object.fromEntries([...$('card').querySelectorAll('[data-ef]')].map(i => [i.dataset.ef, i.value.trim().slice(0, 40)]));
    const bib = ui.card === '+' ? v.bib : ui.card, old = V.entrants[bib];
    if (!bib) return alert('Enter the bib number.');
    if (ui.card === '+' && old) return alert(`Bib ${bib} is already on the entry list.`);
    put({ id: 'e:' + bib, k: 'entrant', bib, name: v.name, cat: v.cat, sex: v.sex, race: v.race, chip: v.chip, ci: old?.ci || 0 });
    if (!state.recs[v.race]) put({ ...V.races.find(r => r.id === v.race) }); // the built-in first race becomes a stored one
    ui.card = bib;
    $('card')._html = null;
  } else if ('eremove' in d) {
    if (!confirm(`Remove bib ${ui.card} from the entry list? Recorded times for this bib are kept.`)) return;
    del('e:' + ui.card);
    $('card').close();
  } else if (el.id === 'addRace') {
    if (!state.recs[V.races[0].id]) put({ ...V.races[0] }); // keep the built-in first race when a second is added
    put({ id: newId(), k: 'race', name: `Race ${V.races.length + 1}`, start: null, o: now(), c: freeColour(V.races.map(r => r.c % 5)) });
  } else if (el.id === 'addPoint') {
    put({ id: newId(), k: 'point', name: `CP${V.points.length + 1}`, o: now() });
  } else if (el.id === 'uAdd' || el.id === 'bAdd') {
    const box = el.id === 'bAdd', bib = toBib($(box ? 'bBib' : 'uBib').value), type = box ? 'BOX' : $('uType').value;
    const sec = minutes($(box ? 'bMin' : 'uMin'));
    if (!bib) return alert('Enter the bib number.');
    if (['PEN', 'BOX'].includes(type) && !(sec > 0)) return alert('Enter the penalty in minutes, for example 2 or 0.5.');
    put({ id: newId(), k: 'update', bib, type, sec: ['PEN', 'BOX'].includes(type) ? sec : 0, in: 0, out: 0 });
    $(box ? 'bBib' : 'uBib').value = $(box ? 'bMin' : 'uMin').value = '';
  } else if (el.id === 'import') {
    const parsed = parseEntrants($('entrants').value, V.races);
    if (!parsed.entrants.length) return alert('No athletes found. Expected one per line: bib, name, category, race, chip, sex');
    const checked = Object.fromEntries(Object.values(V.entrants).map(a => [a.bib, a.ci || 0])); // a re-import keeps check-ins
    for (const a of Object.values(V.entrants)) del(a.id);
    const taken = stored().map(r => r.c % 5);
    parsed.races.forEach((r, i) => { const c = freeColour(taken); taken.push(c); put({ ...r, k: 'race', start: null, o: now() + i, c }); });
    for (const a of parsed.entrants) put({ id: 'e:' + a.bib, k: 'entrant', ...a, ci: checked[a.bib] || 0 });
    $('entrants').value = '';
  } else if (el.id === 'demo') {
    demo();
  } else if (el.id === 'join') {
    const code = $('code').value.trim().toLowerCase(), n = V.times.length;
    if (!/^[a-z0-9-]{4,32}$/.test(code)) return alert('An event code is 4 to 32 letters, digits or dashes.');
    if (n && !confirm(`This device already holds ${plural(n, 'recorded time')}. They will be added to event "${code}". If they belong to a different event, cancel and reset this device first.`)) return;
    Object.assign(dev, { code, since: 0, view: '' });
    for (const rid in state.recs) dev.dirty[rid] = 1;
  } else if (el.id === 'leave') {
    const n = Object.keys(dev.dirty).length;
    if (!confirm(n ? `${plural(n, 'change')} ${n > 1 ? 'have' : 'has'} not reached the other devices yet and will stay on this device only. Leave anyway?` : 'Stop sharing with the other devices? Everything recorded so far stays on this device.')) return;
    dev = { ...freshDev(), offset: dev.offset, point: dev.point, theme: dev.theme };
    online = false;
  } else if (el.id === 'reset') {
    if (!confirm(`Delete ALL times, races and athletes from this device?${dev.code ? ' Other devices on this event keep their copy.' : ' Export the results first if you need them.'}`)) return;
    state = { recs: {} };
    dev = { ...freshDev(), theme: dev.theme };
    online = false;
  } else return;
  commit();
});

document.addEventListener('change', e => {
  const el = e.target, d = el.dataset, v = el.value.trim(), id = el.closest('[data-id]')?.dataset.id;
  const race = () => ({ ...V.races.find(r => r.id === id) });
  if (el.id === 'resFilter') { ui.resFilter = v; return render(); }
  if (el.id === 'opsFilter') { ui.opsFilter = v; return render(); }
  if (el.id === 'regRace') { ui.regRace = v; return render(); }
  if (el.id === 'uType') return void ($('uMin').hidden = v !== 'PEN');
  if (VIEW) return;
  if ('bib' in d) put({ ...state.recs[id], bib: toBib(v) });
  else if ('rname' in d) put({ ...race(), name: v || 'Race' });
  else if ('pname' in d) put({ ...state.recs[id], name: v || 'Checkpoint' });
  else if ('rgap' in d) put({ ...race(), gap: Math.max(1, Math.round(v) || 60) });
  else if ('rdate' in d || 'rtime' in d) {
    const [date, time] = el.closest('.rcard').querySelectorAll('input'), text = time.value.trim(), ms = parseTod(text);
    if (text && ms == null) { alert('A start time looks like 07:00:00 or 07:00:00.250'); return render(); }
    if (!text && race().start == null) return; // only a date so far: wait for the time
    if (!text && !confirm(`Clear the start time of "${race().name}"? Its athletes will have no times until it is started again.`)) return render();
    const day = date.value || localIso(Date.now()).slice(0, 10);
    put({ ...race(), start: text ? new Date(day + 'T00:00:00').getTime() + ms : null });
  }
  else if (el.id === 'eventName') put({ id: 'meta', k: 'meta', name: v });
  else if (el.id === 'point') dev.point = v;
  else return;
  commit();
});

// Another tab of this app changed the data: follow it rather than overwrite it.
addEventListener('storage', () => { load(); render(); });

// Keep the screen on at the finish line. The lock is dropped whenever the page is hidden, so re-take it.
const stayAwake = () => navigator.wakeLock?.request('screen').catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { stayAwake(); sync(); } });
stayAwake();

navigator.serviceWorker?.register('sw.js').catch(() => {}); // offline + install; unavailable when opened as a file

load();
if (VIEW) document.body.classList.add('viewer');
if (SCREEN) document.body.classList.add('screen');
V = view(state.recs);
show(VIEW ? 'results' : 'timing');
setInterval(tick, 100);
// Countdowns, "minutes since seen" and time trial slots move with the clock, not only with new data.
setInterval(() => { if (SCREEN || ['starts', 'box', 'ops'].includes(tab) || $('card').open) render(); }, 1000);
// ponytail: polling. Other devices see a change within 2 s; a WebSocket or SSE push if that feels slow.
setInterval(sync, VIEW ? 5000 : 2000);
sync();
