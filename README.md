# TrailTime

Race timing for trail events, modelled on what RaceTec Toolkit does. One web app that installs on any phone, tablet or laptop and keeps recording with no signal.

| Section | What it is for |
|---|---|
| **Timing** | Press the big button as each athlete passes. Type the bib first, or fill it in afterwards. Each device chooses the point it stands at: finish, a checkpoint, or the start line. |
| **Starts** | Gun starts (one race or several together), start times correctable to the millisecond, and time trial starts where athletes leave one by one with a countdown to the next. |
| **Results** | Live sheet per race, filtered by sex or category. Presses that can't be counted are listed for fixing. DNF, DNS, DSQ and time penalties. CSV export. |
| **Ops** | The state of the race at a glance: started, on course, finished and out per race, who just finished, who has not been seen for longest, top 10, athletes seen at each point, athlete lookup. |
| **Registration** | Searchable entry list, add and edit athletes, check in by button or by scanning a bib or chip. |
| **Penalty box** | Send an athlete to the box, start the countdown when they arrive, release them when it is served. |
| **Setup** | Event name, races, checkpoints, entry list import, sharing between devices, theme, sample data. |

Tap any bib anywhere to open that athlete's card: their passes, status, penalties, sign-on and details.

Also:

- **Several devices, one event.** Devices that enter the same event code share everything and are put on one common clock. Each keeps recording offline and catches up when the connection returns.
- **Live results link** for spectators, read-only, and a **big screen leaderboard** for a TV or projector.
- **Chip and barcode readers.** Any reader that types like a keyboard (code, then Enter) records a time or checks an athlete in.

To look around before race day, open Setup and choose **Load sample event** (invented data).

## Run

Needs [Node.js](https://nodejs.org) 20 or newer, nothing else to install.

    node server.js

It prints the address to open on this computer and on phones on the same Wi-Fi or hotspot. Event data is kept in `data/`. Set `PORT` or `DATA_DIR` to change the defaults.

For installing to the home screen and reopening the app with no connection, the address must be HTTPS: deploy this folder to any Node host (start command `npm start`) or put the server behind an HTTPS proxy. Over plain `http://192.168…` everything works as long as the page stays open.

Without the server, `index.html` still works on its own as a single-device timer (for example on GitHub Pages); only sharing between devices and the live links need the server.

The event code is the password for an event: anyone who has it can record and edit. The live results link does not reveal it.

## Entry list

One athlete per line, pasted from Excel or typed with commas. Only the bib is required.

    bib, name, category, race, chip, sex
    101, Jane Doe, F40, 25K, E2000017, F
    201, Ali Khan, M, 50K, , M

## How some things are counted

- An athlete's time runs from their own recorded start if there is one, else their time trial slot, else their race's gun time.
- With an entry list, everyone entered counts as started once their start time has passed. As soon as anyone is checked in, only checked-in athletes count as started.
- A time penalty is added to the result. A penalty box is served standing still, so it adds nothing; one that is never served is flagged on the results.
- Time trial athletes start in bib order.

## Files

`index.html`, `app.css`, `app.js` are the screens. `core.js` is the timing logic, shared with `server.js` (sync) and `test.js`. `PRODUCT.md` and `DESIGN.md` describe who it is for and how it looks.

## Test

    node test.js
