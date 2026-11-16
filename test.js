// Run: node test.js
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { fmt, parseTod, merge, view, parseEntrants, results, toCsv } = require('./core.js');

// --- formatting and parsing
assert.equal(fmt(0), '0:00:00.0');
assert.equal(fmt(3723456), '1:02:03.4');
assert.equal(fmt(59999), '0:00:59.9'); // truncates, never rounds up
assert.equal(fmt(null), '–');
assert.equal(parseTod('07:00'), 7 * 3600e3);
assert.equal(parseTod('7:00:01.25'), 7 * 3600e3 + 1250);
assert.equal(parseTod('07:00:00,5'), 7 * 3600e3 + 500);
assert.equal(parseTod('25:00'), null);
assert.equal(parseTod('seven'), null);

// --- last write wins, and it converges whatever order the devices sync in
const a = { id: 'x', k: 'time', u: 5, bib: '1' }, b = { id: 'x', k: 'time', u: 9, bib: '2' };
const one = {}, two = {};
merge(one, [a]); merge(one, [b]);
merge(two, [b]); assert.deepEqual(merge(two, [a]), []); // the older edit changes nothing
assert.deepEqual(one, two);
assert.equal(one.x.bib, '2');
const tie = {}; merge(tie, [{ id: 'y', u: 1, n: 'a' }]); merge(tie, [{ id: 'y', u: 1, n: 'b' }]);
const tie2 = {}; merge(tie2, [{ id: 'y', u: 1, n: 'b' }]); merge(tie2, [{ id: 'y', u: 1, n: 'a' }]);
assert.deepEqual(tie, tie2); // same instant: both sides still pick the same winner
merge(one, [{ id: '__proto__', u: 1, evil: 1 }]);
assert.equal({}.evil, undefined);

// --- entry list
const parsed = parseEntrants(
  'bib,name,category,race,chip\n1,Ann,F,25K,E200A1\n2,Bob,M,25K\n3,=SUM(1),M,50K\n\n7\tDee, "D"\tF\t50k\n4,Eve,F,25K\n5,Flo,F,25K\n6,Gil,M,25K',
  [{ id: 'a', name: '25K' }]
);
assert.equal(parsed.entrants.length, 7); // header and blank line skipped
assert.deepEqual(parsed.races.map(r => r.name), ['50K']); // created once; "50k" matched to it

// --- records -> view -> results
const recs = {};
const add = r => { recs[r.id] = { u: 1, ...r }; };
add({ id: 'a', k: 'race', name: '25K', start: 1000, o: 1 });
add({ id: parsed.races[0].id, k: 'race', name: '50K', start: 0, o: 2 });
add({ id: 'gone', k: 'race', name: 'Deleted', start: 0, o: 0, del: 1 });
add({ id: 'cp2', k: 'point', name: 'CP2', o: 2 });
add({ id: 'cp1', k: 'point', name: 'CP1', o: 1 });
for (const e of parsed.entrants) add({ id: 'e:' + e.bib, k: 'entrant', ...e });
[
  ['f1', 5000, '2'], ['f2', 4000, '1'],
  ['f3', 6000, ''],           // pressed, bib not entered yet
  ['f4', 7000, '1'],          // same bib twice at the finish: the first one counts
  ['f5', 8000, '3'], ['f6', 9000, '99'], ['f7', 9500, '7'],
  ['s1', 2000, '1', 'cp1'], ['s2', 3000, '1', 'cp2'],
  ['s3', 2500, '4', 'cp1'], ['s4', 3500, '4', 'cp2'], // 4 and 5 are still out on the course
  ['s5', 2200, '5', 'cp1'],
  ['s6', 2600, '6', 'cp1'],                            // 6 passed CP1, then retired
  ['s7', 1500, '2', 'nope'],                           // its timing point no longer exists
].forEach(([id, t, bib, p = '']) => add({ id, k: 'time', t, bib, p }));
add({ id: 'u1', k: 'update', bib: '6', type: 'DNF' });
add({ id: 'u2', k: 'update', bib: '1', type: 'PEN', sec: 2 });   // puts bib 1 (3.0s) behind bib 2 (4.0s)
add({ id: 'u3', k: 'update', bib: '50', type: 'DNS' });
add({ id: 'u4', k: 'update', bib: '8', type: 'BOGUS' });          // unknown types from another device are ignored

const v = view(recs);
assert.deepEqual(v.races.map(r => r.name), ['25K', '50K']);
assert.deepEqual(v.points.map(p => p.name), ['CP1', 'CP2']);
assert.equal(v.chips.E200A1, '1');
assert.equal(v.chips.constructor, undefined);
assert.deepEqual(view({}).races.map(r => r.id), ['race0']); // an empty event still has a race to start

const res = results(v);
const [r25, r50] = res.races;
assert.deepEqual(r25.rows.map(r => [r.bib, r.status, r.pos ?? '', r.total]), [
  ['2', '', 1, 4000],
  ['1', '', 2, 5000],            // 3000 + 2000 penalty
  ['99', '', 3, 8000],
  ['4', 'on course', '', null],  // reached CP2
  ['5', 'on course', '', null],  // only CP1
  ['6', 'DNF', '', null],
  ['50', 'DNS', '', null],
]);
assert.deepEqual(r25.rows[1].splits, { cp1: 1000, cp2: 2000 });
assert.deepEqual(r25.rows.slice(0, 3).map(r => r.catPos), [1, 1, '']); // M1, F1, unknown bib has no category
assert.equal(r25.rows[2].unknown, true);
assert.deepEqual(r50.rows.map(r => [r.bib, r.pos, r.total]), [['3', 1, 8000], ['7', 2, 9500]]);
assert.deepEqual(res.unranked.map(r => [r.id, r.problem]), [['f3', 'no bib'], ['f4', 'duplicate bib']]);
assert.equal(res.info.s3.point, 'CP1');
assert.equal(res.info.s7, undefined);

// a DNF that then shows up at the finish is a conflict to look at, not a silent result
add({ id: 'f8', k: 'time', t: 9900, bib: '6', p: '' });
assert.equal(results(view(recs)).unranked.at(-1).problem, 'marked DNF');
delete recs.f8;

// a race with no gun time can't rank anyone, but keeps every press
const noStart = results(view({ t: { id: 't', k: 'time', u: 1, t: 1, bib: '5', p: '' } }));
assert.equal(noStart.races[0].rows.length, 0);
assert.equal(noStart.unranked[0].problem, 'race not started');

const csv = toCsv(res).split('\r\n');
assert.equal(csv[0], 'Race,Pos,Bib,Name,Category,Cat pos,Finish time,Elapsed,Penalty,Total,CP1,CP2,Note');
assert.equal(csv.length, 1 + 7 + 2 + 2); // header + 25K rows + 50K rows + unranked
assert.ok(csv.every(l => l.split(',').length >= 13));
const line = bib => csv.find(l => l.split(',')[2] === bib);
assert.ok(line('1').endsWith('0:00:03.0,0:00:02.0,0:00:05.0,0:00:01.0,0:00:02.0,'));
assert.ok(line('6').endsWith(',DNF'));
assert.ok(csv.some(l => l.includes(`"Dee, ""D"""`))); // quoted
assert.ok(csv.some(l => l.includes(`'=SUM(1)`)));     // formula defused
assert.ok(csv.at(-1).endsWith('Finish: duplicate bib'));

// --- sync server: two devices, one event
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trailtime-'));
  Object.assign(process.env, { PORT: '0', DATA_DIR: dir });
  const server = require('./server.js');
  await new Promise(r => server.on('listening', r));
  const base = `http://localhost:${server.address().port}`;
  const post = (code, body) => fetch(`${base}/api/sync/${code}`, { method: 'POST', body: JSON.stringify(body) }).then(async r => [r.status, await r.json()]);
  try {
    let [status, A] = await post('demo-1', { since: 0, recs: [{ id: 't1', k: 'time', u: 10, t: 123, bib: '7' }, { id: 5, k: 'time', u: 1 }, 'junk'] });
    assert.equal(status, 200);
    assert.equal(A.seq, 1); // the malformed records were dropped
    assert.ok(Math.abs(A.now - Date.now()) < 5000);

    let [, B] = await post('demo-1', { since: 0, recs: [{ id: 't1', k: 'time', u: 5, t: 123, bib: 'old' }] });
    assert.deepEqual(B.recs.map(r => r.bib), ['7']); // B's older edit lost, and B is told the current one

    [, B] = await post('demo-1', { since: B.seq, recs: [{ id: 't1', k: 'time', u: 20, t: 123, bib: '8' }] });
    [, A] = await post('demo-1', { since: A.seq, recs: [] });
    assert.deepEqual(A.recs.map(r => r.bib), ['8']); // A only receives what changed since it last asked
    assert.deepEqual((await post('demo-1', { since: A.seq, recs: [] }))[1].recs, []);

    assert.deepEqual((await post('other-event', { since: 0, recs: [] }))[1].recs, []); // events are separate
    assert.equal((await post('NO', { since: 0, recs: [] }))[0], 400);
    assert.equal((await post('demo-1', { recs: [{ id: 'big', k: 'x', u: 1, pad: 'x'.repeat(3e6) }] }))[0], 413);

    const viewed = await (await fetch(`${base}/api/view/${A.view}`)).json();
    assert.deepEqual(viewed.recs.map(r => r.bib), ['8']);
    assert.equal((await fetch(`${base}/api/view/demo-1`)).status, 404); // the event code itself is not a view key
    assert.equal((await fetch(`${base}/api/view/${A.view}`, { method: 'POST', body: '{}' })).status, 404); // read-only

    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/server.js`)).status, 404);          // only the app's own files are served
    assert.equal((await fetch(`${base}/data/demo-1.json`)).status, 404);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'demo-1.json'))).recs.t1.bib, '8'); // survives a restart
    console.log('ok');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
