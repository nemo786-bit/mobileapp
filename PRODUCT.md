# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Timers** at the start, at checkpoints and at the finish line of trail races: staff, trained timers and volunteers, standing outdoors with a phone, often in bright sun or rain, often with no signal, recording athletes as they pass.
- **Race directors and officials** at race HQ following the whole event on a laptop or tablet: who has started, who is on course, who is missing, what needs correcting.
- **Sign-on staff** checking athletes in before the start.
- **Spectators** watching a live leaderboard on a big public screen (TV or projector), and on their own phones through a read-only link.

The organisation both runs and times its own races and times races for other organisers, so the same people use it across many different events.

## Product Purpose

TrailTime records the exact time each athlete passes a timing point and turns those times into trustworthy results while the race is still running. Success is a result sheet nobody has to argue about: no lost times, no silent mistakes, and a director who knows the state of the race at a glance.

## Positioning

One installable web app that runs on any phone, tablet or laptop, keeps recording with no connection, and puts every device on one shared event and one shared clock. Functionally modelled on RaceTec Toolkit (manual timing, gun starts, course updates, ops summaries, time trial starts, sign-on, penalty box, entry lists), without needing the RaceTec platform behind it.

## Operating Context

- Outdoors at finish lines and remote checkpoints; one hand often busy; gloves, glare, rain, low battery.
- The gun start, the finish and each checkpoint may be on different devices held by different people.
- Connectivity is unreliable. Devices sync through the TrailTime server when they can.
- Athletes are identified by bib number; a chip or barcode reader that types like a keyboard can enter it.
- Results are exported as CSV for the organiser.

## Capabilities and Constraints

Existing, must be preserved:

- Races with gun start times (mass start of several races together), editable to the millisecond.
- Press-to-record timing with the bib typed before or after; chip codes mapped to bibs.
- Checkpoints with split times; each device chooses the point it stands at.
- Results per race and category; DNF / DNS / DSQ; time penalties; "needs attention" list for presses that cannot be ranked.
- Entry list import (bib, name, category, race, chip); CSV export.
- Multi-device sync with last-write-wins records, offline queueing and clock correction; read-only live results link.

To add in this version:

- Ops dashboard: race and split summaries with graphs, top 10, leaderboards by gender and category, athlete lookup with all splits.
- Registration and check-in: searchable participant list, add and edit athletes, check in and out, totals per race.
- Time trial starts: athletes start one by one at set intervals, with a countdown and per-athlete start times.
- Penalty box: timed penalties served in a holding area, counted down and logged.
- A big-screen live leaderboard for spectators.

Technical constraints: vanilla HTML, CSS and JavaScript with no build step and no dependencies; `core.js` holds the pure logic shared with the Node sync server; works offline as an installed PWA; data model is synced records.

Terminology: bib, race, checkpoint, split, gun start, wave, DNF, DNS, DSQ, penalty, sign-on / check-in.

## Brand Commitments

The product is called TrailTime. There is no existing company identity to follow.

## Evidence on Hand

No real event data, customers or testimonials. Demonstration data is synthetic and must be labelled as such wherever it could be mistaken for real results.

## Product Principles

1. The time comes first. Nothing on screen may delay or endanger the press that records it.
2. Never lose or hide a record. Anything that cannot be ranked is shown, not dropped.
3. Works without a connection, and says plainly when it is not connected.
4. One glance tells the state of the race.
5. A volunteer can use it after one minute of explanation.

## Accessibility & Inclusion

Readable in direct sunlight; large touch targets usable with gloves or wet hands; state never carried by colour alone; keyboard operable on laptops; respects reduced motion; light and dark themes.
