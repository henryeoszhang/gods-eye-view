# Interface language plugin — 日本語 / 简体中文

Adds an in-app language switcher to God's Eye View. English stays the default
for anyone whose browser does not ask for Japanese or Simplified Chinese.

## How it attaches

One `<script type="module">` tag at the end of `index.html` — the only thing
this plugin changes in the app. Vite serves and bundles it like any other
module entry, so `npm run dev`, `npm run build` and the Pinokio launcher all
pick it up without further wiring.

A Vite plugin doing `transformIndexHtml` would work too, but the repo pins the
exact plugin order in `src/tooling/viteBuild.test.mjs` (`api-not-found` must
stay last), and a script tag needs no exception to that rule.

## How it translates

Upstream has no i18n layer and ~156k lines of source, so the runtime translates
the **rendered DOM** instead of rewriting call sites:

- On load it walks `document.body`; a `MutationObserver` then catches everything
  the app paints later (live telemetry, panels built on demand, toasts).
- Text nodes plus the `title`, `aria-label`, `aria-valuetext`, `placeholder` and
  `alt` attributes.
- The English source is remembered per node, so switching languages — including
  back to English — always re-translates from the original, never from a
  translation.
- A string the dictionary does not name **stays English**. There are no blanks.

The choice is stored in `localStorage` under `gev:ui-language`; the first visit
falls back to `navigator.languages`.

## Layout

```
plugins/i18n/
  runtime.js              DOM walker, MutationObserver, language picker
  translate.js            pure lookup (entries, then patterns)
  picker.css             the switcher, styled for the app's dark chrome
  dictionaries/ja.js      日本語
  dictionaries/zh-CN.js   简体中文
  translate.test.mjs      node --test (also `npm run test:i18n`)
```

Each dictionary exports `{ entries, patterns }`. `entries` maps an exact English
string to its translation. `patterns` is an ordered list of `[RegExp, build]`
for strings the app composes at runtime, tried only when the exact lookup
misses — `Live Flights: OFF`, `CelesTrak · never`, `POWER UP · 7 KEYS WAITING`,
`Flying to Austin, TX...`.

## What is deliberately left in English

- **Brand**: `GOD'S EYE`, `VIEW`.
- **Provider and product names**: OpenSky, AISStream, TomTom, Cesium ion,
  OpenStreetMap, Radio Browser, and every `*_API_KEY` / `*_TOKEN` name.
- **The intelligence HUD** (`#intel-hud`), skipped as a whole: MGRS, NIIRS, GSD,
  orbit-pass lines and the classification banner are standing notations, and the
  panel is a simulated imagery-intel readout.
- **Units and telemetry placeholders**: `FT`, `KTS`, `MM`, `HDG --`, `FOV --`.
- **Live provider data**: place names, aircraft types, radio station names, and
  the Bhote Koshi data pack's own scene and landmark names. These arrive from
  external APIs at runtime and cannot be dictionary-backed.

## Adding or fixing a translation

1. Run the app, then in the DevTools console walk the DOM for anything still in
   English — the same walk `runtime.js` performs.
2. Add the exact string to **both** `dictionaries/ja.js` and
   `dictionaries/zh-CN.js`; the test suite fails if the two drift apart.
3. `npm run test:i18n`.

Never add a Material Symbols ligature (`close`, `draw`, `public`, `normal`, …)
as a key: those spans render an icon from their text, and translating one makes
the icon disappear. `index.html` lists them in `icon_names`, and the test checks
every key against that list.

## Adding a third language

1. Copy a dictionary to `dictionaries/<tag>.js` and translate the values.
2. Add the tag to `LANGUAGES` and `PACK_LOADERS` in `runtime.js`.
3. Add it to `initialLanguage()` if it should be auto-detected.
