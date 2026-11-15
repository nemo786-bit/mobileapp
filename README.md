# TrailTime

Finish-line timing for trail races. One web app that installs on any phone, tablet or laptop and keeps working with no signal.

- **Timing**: start each race (or all together), press FINISH as each athlete crosses. Type the bib first, or fill it in afterwards.
- **Results**: live ranking per race and per category, CSV export.
- **Setup**: event name, races and start times, optional entry list (`bib, name, category, race`, one per line or pasted from Excel).

Everything is stored on the device and saved on every press.

## Run

No build step. Any static file server works:

    npx serve .

Opening `index.html` directly also works, minus offline install. To put it on phones, host the folder on HTTPS (for example GitHub Pages: Settings → Pages → deploy from `main`), open the link, and choose "Add to Home Screen".

## Test

    node test.js
