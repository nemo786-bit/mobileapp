---
name: TrailTime
description: Race timing where every athlete is their bib, wearing their race's colour.
colors:
  ground: "#EEF0F2"
  surface: "#FFFFFF"
  ink: "#0B0B0C"
  mute: "#565A61"
  line: "#D3D6DB"
  hi-vis: "#FFD60A"
  tyvek: "#FFFFFF"
  bad: "#B42318"
  hi-vis-hover: "#F2C800"
  scrim: "rgb(0 0 0 / .55)"
  good: "#0A7A3E"
  race-1: "#1447E6"
  race-2: "#D92D20"
  race-3: "#0A8754"
  race-4: "#7A3FE0"
  race-5: "#C2570A"
  ground-dark: "#0E0F10"
  surface-dark: "#1B1C1E"
  ink-dark: "#F4F4F2"
  race-1-dark: "#4C7DFF"
  race-2-dark: "#D63434"
  race-3-dark: "#2CAB7D"
  race-4-dark: "#8E66EE"
  race-5-dark: "#D4731F"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 900
    lineHeight: 0.9
    letterSpacing: "0em"
  numeral:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0em"
  heading:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.01em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0em"
  small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0em"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0em"
  stat:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0em"
  press:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "3.25rem"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "0.01em"
  bib-entry:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "4rem"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "0em"
rounded:
  none: "0px"
  bar-end: "4px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "28px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.hi-vis}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "44px"
  button-primary-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.hi-vis}"
  bib:
    backgroundColor: "{colors.tyvek}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    typography: "{typography.numeral}"
  race-field:
    backgroundColor: "{colors.race-1}"
    textColor: "{colors.surface}"
    padding: "18px 20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
    height: "44px"
---

# Design System: TrailTime

## Overview

TrailTime looks like the thing a race official already reads all day: the race bib. An athlete is never a row of grey text; they are a white tile with heavy black numerals and a band in their race's colour, and that tile opens their card wherever it appears. Each race owns one flat colour across the whole app. Hi-vis yellow is reserved for the one thing to press and for what needs a look.

The surface is light by default because it is used outdoors in sun; the dark theme exists for night finishes and follows the device unless set in Setup.

## Colors

### Primary

- **Hi-vis** is the action and attention colour: the press button, primary buttons, the active tab marker, the "needs attention" field, a penalty that has come due, a new row on the public board. Text on it is always ink black.

### Secondary

- **Race colours** (race-1 to race-5) identify a race, in a fixed order: blue, red, green, violet, orange. A race keeps its slot for life; deleting another race never repaints it. Light and dark steps were both validated for colour-blind separation between neighbours.

### Neutral

- **Ground** is the page, **surface** is anything that holds content, **ink** is text and rules, **mute** is secondary text, **line** is a hairline divider.
- **Tyvek** is the bib. It stays white with black numerals in both themes.
- **Bad** and **good** mark problems and a live connection. They always travel with words, never alone.

### Named Rules

- **The bib rule.** Any athlete shown anywhere is drawn as a bib chip, and the chip opens their card.
- **One colour per race.** Race colour appears only on that race's field, band or bar. It is never used as decoration.
- **Yellow means act.** If it is yellow, it can be pressed or it needs someone.
- **Flat only.** No gradients, glows or shadows. Hierarchy comes from size, weight and field colour.

## Typography

One family, Archivo, self-hosted so it works offline. Its width axis carries the two voices: condensed (68%) and heavy for race names, bibs, positions and times; normal width for everything read as a sentence. Every number that can change uses tabular figures so rows never shift.

### Hierarchy

- **Display**: race names on fields and the public board, condensed 900.
- **Numeral**: bibs, positions, clocks, times, condensed 800 to 900, tabular.
- **Heading**: section titles, condensed 800, uppercase.
- **Title**, **stat**, **press** and **bib entry**: the larger condensed steps for race fields, counts, the press button and the bib being typed.
- **Body** and **small**: normal width, 400 to 600.

## Layout

A white top bar under a 3px ink rule carries the wordmark and the seven sections. On phones the sections move to a bottom bar within thumb reach, with the less frequent three behind "More". Content sits in a 1280px column; working screens split into two columns from 900px. The public board fills the screen with one column per race and ten rows.

## Elevation & Depth

None. Surfaces separate by colour (surface on ground) and by 1px lines. The only overlay is the athlete card, a sheet with a 3px ink edge over a dimmed page.

## Shapes

Square corners everywhere. A 2px ink outline belongs to bibs and buttons; a 3px outline to the big bib and the press button. The one rounded shape is the data end of a bar (4px).

## Components

### Buttons

44px high, 2px ink outline, weight 600. Primary is hi-vis with ink text. Pressed is inverted, so a press is visible in sunlight.

### Chips

The bib chip: white, 2px black outline, 8px race-colour band on top, condensed 900 numerals. A dashed outline means the bib is not on the entry list.

### Cards / Containers

White surface, no border, no shadow, 16px padding.

### Inputs / Fields

44px, 2px line border that turns ink on focus. Bib inputs are styled as bibs.

### Navigation

Text tabs. The active tab is ink with a 6px hi-vis marker.

### Race field

A block of the race's colour carrying its name at display size, its clock, and its counts. It is the header of anything about that race.

### Press button

Hi-vis, 3px ink outline, condensed 900 at 3.25rem, at least a quarter of the screen high. It records on press, not release.

## Do's and Don'ts

### Do:

- Show an athlete as their bib chip, and let it open their card.
- Keep a race in its own colour on every screen.
- Pair every colour signal with words.
- Use tabular condensed numerals for anything that updates.

### Don't:

- Use race colours or yellow for decoration.
- Add shadows, gradients or rounded cards.
- Put a label above a heading.
- Recolour the bib in dark mode.
