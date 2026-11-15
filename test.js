// Run: node test.js
const assert = require('assert');
const { fmt, parseEntrants, results, toCsv } = require('./core.js');

assert.equal(fmt(0), '0:00:00.0');
assert.equal(fmt(3723456), '1:02:03.4');
assert.equal(fmt(59999), '0:00:59.9'); // truncates, never rounds up
assert.equal(fmt(null), '–');
assert.equal(fmt(-5), '–');

const { entrants, races } = parseEntrants(
  'bib,name,category,race\n1,Ann,F,25K\n2,Bob,M,25K\n3,=SUM(1),M,50K\n\n7\tDee, "D"\tF\t50k',
  [{ id: 'a', name: '25K', start: 1000 }]
);
assert.equal(Object.keys(entrants).length, 4); // header and blank line skipped
assert.deepEqual(races.map(r => r.name), ['25K', '50K']); // 50K created once, "50k" matched to it
races[1].start = 0;

const res = results({
  races, entrants,
  finishes: [
    { id: 'f1', t: 5000, bib: '2' },
    { id: 'f2', t: 4000, bib: '1' },
    { id: 'f3', t: 6000, bib: '' },   // tapped, bib not entered yet
    { id: 'f4', t: 7000, bib: '1' },  // same bib twice: first one counts
    { id: 'f5', t: 8000, bib: '3' },
    { id: 'f6', t: 9000, bib: '99' }, // not on the entry list
    { id: 'f7', t: 9500, bib: '7' },
  ],
});
const [r25, r50] = res.races;
assert.deepEqual(r25.rows.map(r => [r.pos, r.bib, r.elapsed, r.catPos]), [[1, '1', 3000, 1], [2, '2', 4000, 1], [3, '99', 8000, '']]);
assert.equal(r25.rows[2].unknown, true);
assert.deepEqual(r50.rows.map(r => [r.pos, r.bib, r.elapsed, r.catPos]), [[1, '3', 8000, 1], [2, '7', 9500, 1]]);
assert.deepEqual(res.unranked.map(r => [r.id, r.problem]), [['f3', 'no bib'], ['f4', 'duplicate bib']]);

// a race with no gun time can't rank anyone, but keeps every finish
const noStart = results({ races: [{ id: 'a', name: 'R', start: null }], entrants: {}, finishes: [{ id: 'x', t: 1, bib: '5' }] });
assert.equal(noStart.races[0].rows.length, 0);
assert.equal(noStart.unranked[0].problem, 'race not started');

const csv = toCsv(res);
assert.equal(csv.split('\r\n').length, 1 + 7); // header + every finish, ranked or not
assert.ok(csv.includes('25K,1,1,Ann,F,1,'));
assert.ok(csv.includes(`"Dee, ""D"""`));  // quoted
assert.ok(csv.includes(`'=SUM(1)`));      // formula defused
assert.ok(csv.includes('duplicate bib'));

console.log('ok');
