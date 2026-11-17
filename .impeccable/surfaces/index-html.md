---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

Scope: the whole TrailTime app shell and every screen in `index.html` (Operate mode). Audience and product truth live in PRODUCT.md.

Jobs per area: Timing (press to record at a point), Starts (gun starts and time trial starts), Results (ranked sheets, corrections, export), Ops (state of the race at a glance, leaderboards, athlete lookup), Registration (find, add, edit, check in), Penalty box (serve timed penalties), Setup (event, races, checkpoints, entry list, devices). Plus a read-only big-screen leaderboard.

## Direction contract

THESIS: The bib is the unit of everything. Every athlete appears as their race number wearing their race's colour, so a director recognises people the way they do on the course. Refuses the tile-row-plus-chart admin dashboard where athletes are rows of grey text.

OWN-WORLD: Tyvek white surfaces on a pale neutral ground; heavy black condensed numerals; one flat saturated colour per race, assigned from a fixed sequence (blue, red, then green, violet, orange); hi-vis yellow marks what is active or needs a look; bib chips with a race-colour top band and a 2px black outline; square corners, flat colour, no gradients or glows.

STORY: The director sees each race as a field of its colour with a clock and counts, recognises athletes by bib, and acts on what is flagged yellow. The timer sees one huge button in the colour of the race or point and the bibs they just recorded.

FIRST VIEWPORT: Desktop Ops: white top bar with the wordmark and section navigation under a black rule; full-width race fields side by side, race name at display size with clock and started / on course / finished counts; below, a wall of bib chips grouped by state on the left and the top 10 on the right. Phone Timing: race-colour header, bib box drawn as a large bib, one press button filling the thumb zone, recent presses as bib rows.

FORM: Race Bib, position 1 on the ordered list (the pick card, chosen by the user over the assigned Pace Band). seed:ae69e12ecc7f4abf

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: tapping any bib chip anywhere opens that athlete's card (splits, status, penalties, check-in) in place.

Unresolved: none.
