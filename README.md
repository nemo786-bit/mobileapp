# TrailTime

Finish-line timing for trail races. One web app that installs on any phone, tablet or laptop and keeps recording with no signal.

- **Timing**: start each race (or all together), press the button as each athlete passes. Type the bib first, or fill it in afterwards.
- **Checkpoints**: optional timing points on the course. Each device picks the point it is standing at; results show the splits and who is still on course.
- **Results**: live ranking per race and per category, DNF / DNS / DSQ, time penalties, CSV export.
- **Several devices, one event**: devices that enter the same event code share starts, times and results, and are put on one common clock. Each keeps recording offline and catches up when the connection returns.
- **Live results link**: a read-only page for spectators.
- **Chip and barcode readers**: any reader that types like a keyboard (code, then Enter) records a time by itself. Put the chip codes in the entry list.

Everything is stored on the device and saved on every press.

## Run

Needs [Node.js](https://nodejs.org) 20 or newer, nothing else to install.

    node server.js

It prints the address to open on this computer and on phones on the same Wi-Fi or hotspot. Event data is kept in `data/`. Set `PORT` or `DATA_DIR` to change the defaults.

For installing to the home screen and reopening the app with no connection, the address must be HTTPS: deploy this folder to any Node host (start command `npm start`) or put the server behind an HTTPS proxy. Over plain `http://192.168…` everything works as long as the page stays open.

Without the server, `index.html` still works on its own as a single-device timer (for example on GitHub Pages); only sharing between devices and the live results link need the server.

The event code is the password for an event: anyone who has it can record and edit. The live results link does not reveal it.

## Entry list

One athlete per line, pasted from Excel or typed with commas. Only the bib is required.

    bib, name, category, race, chip
    101, Jane Doe, F40, 25K, E2000017
    201, Ali Khan, M, 50K

## Test

    node test.js
