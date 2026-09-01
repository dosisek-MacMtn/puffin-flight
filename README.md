# Puffin Flight

A one-button, family-friendly browser game for GWI, starring the puffin. Fly
through **SWIM**, **FLY** and **SOAR** - the same names as GWI's residential
plans - dodging Maine-flavoured obstacles and collecting fiber strands, while
your score climbs in Mbps.

The game itself is **one self-contained file**, `dist/index.html` - no
frameworks, no runtime build step, no tracking, no cookies. Alongside it the
build emits a manifest, a service worker and app icons, which make it an
**installable PWA that plays offline**. No frameworks, no runtime build step,
no tracking, no cookies.

---

## Quick start

```bash
node build.js                 # writes dist/index.html
open dist/index.html          # or serve the dist/ folder
```

To work on the source with live files instead of the bundle, open
`src/index.html` through any static server (it loads the `src/*.js` files and
`assets/*.svg` directly):

```bash
npx http-server . -p 8080     # then visit http://localhost:8080/src/
```

`file://` works too, but a server is closer to how it ships.

---

## How it plays

| | |
|---|---|
| **Flap** | tap or click anywhere, `Space`, or `↑` |
| **Pause** | `P`, `Esc`, or the on-screen button (auto-pauses when the tab is hidden) |
| **Mute** | `M` or the sound button |

Score is a connection speed. It climbs with distance survived, +25 Mbps per
fiber strand, and flips from Mbps to Gbps at 1000. Your best run is kept in
`localStorage` under `gwi-puffin-highscore` - that is the only thing the game
stores, and nothing ever leaves the browser.

### Stages

| Stage | From | Feel |
|---|---|---|
| **SWIM** | 0 Mbps | Underwater, buoyant physics, kelp and rock spires. Gentle. |
| **FLY** | 500 Mbps | Bursts through the surface. Maine coast, lighthouses, gulls. +25% scroll. |
| **SOAR** | 1000 Mbps | High altitude, motion streaks, gulls and crags. +50% scroll. |

### The Big Cable buffering wheel

Touching the spinning "Big Cable" wheel does **not** end your run - it drains
50 Mbps and leaves the puffin stuttering along for two seconds. It is a joke,
not an obstacle, and it is the only thing in the game that punishes you without
killing you.

---

## Layout

```
puffin-flight/
├── README.md
├── SPEC.md            the approved v1 spec
├── build.js           inlines src/ + assets/ into dist/index.html
├── src/
│   ├── index.html     page shell, screens, DOM overlay UI
│   ├── styles.css     layout and screen chrome
│   ├── stages.js      ALL tuning + copy lives here
│   ├── entities.js    pooled puffin / obstacles / pickups / particles
│   ├── render.js      canvas drawing, parallax, HUD
│   ├── audio.js       WebAudio chimes (no audio files)
│   └── game.js        state machine, loop, input, scoring
├── assets/            artwork (placeholder SVGs - see below)
├── tools/             headless test harnesses (dev only, not shipped)
└── dist/
    ├── index.html     ← the game, entirely self-contained
    ├── manifest.webmanifest
    ├── sw.js          ← offline cache, versioned per build
    └── icons/         ← app icons (192, 512, maskable, apple-touch)
```

`index.html` still stands alone: everything the game needs is inlined, and the
PWA files only matter when the whole folder is hosted. Deploy the folder to get
an installable app; copy the single file to embed the game somewhere.

The game draws into a fixed 960×540 logical playfield and scales that to fit
any container, so the same build works in portrait, landscape, on desktop and
inside an iframe.

On a portrait phone the 16:9 playfield can only be as tall as the screen is
wide, so it sits in a letterboxed band with dark space above and below - as the
spec calls for. Taps anywhere on the screen (letterbox included) flap, so the
game still plays one-handed. A portrait-native playfield with its own obstacle
spacing would use the full screen and is a good v2 candidate.

---

## Tuning

Everything a non-developer would want to change is in one object at the top of
`src/stages.js` - gap sizes, scroll speeds, gravity, flap strength, spawn
rates, stage thresholds, palettes, and all player-facing copy. No game logic
lives in that file. Change a number, run `node build.js`, reload.

```js
{
  id: 'SWIM',
  threshold: 0,        // Mbps at which this stage starts
  scoreRate: 20,       // Mbps gained per second survived
  scroll: 200,         // playfield px per second
  gravity: 820,        // px/s^2
  flap: -300,          // px/s impulse per tap
  gapMin: 208,         // obstacle gap, px
  gapMax: 248,
  spawnInterval: 1.85, // seconds between obstacle groups
  ...
}
```

Obstacle spacing is distance-based rather than timer-based, so slowing the
puffin down (buffering) never bunches obstacles together.

---

## Artwork: placeholders in, brand art out

The GWI logo is now the real brand asset. **The four puffin images in
`assets/` are still placeholder, drawn for this repo, not GWI brand art** -
this build could not reach `gwi.net` to fetch the real files, so they need
swapping before launch:

1. Drop the production art into `assets/` using these base names:
   `puffin-flying`, `puffin-pointing`, `puffin-thumbsup`,
   `puffin-fiber-strand`, `gwi-logo`.
2. `build.js` prefers `.png`, then `.webp`, then `.svg` for each name - so
   adding `puffin-flying.png` takes over from the placeholder SVG with no code
   change.
3. Run `node build.js`.

The quickest way to get a file in is GitHub itself: on the working branch, open
`assets/` and use **Add file → Upload files**, keeping the base name above.
`gwi-logo` currently ships as a rasterized placeholder PNG, so uploading a real
`gwi-logo.png` replaces it directly.

Prefer SVG where you have it - the logo renders between 78 and 168 px wide
depending on the viewport, so a vector stays crisp and costs less. `.svg` is
the last format `build.js` looks for, so remove the matching `.png` when you
want the vector to win. To go the other way, `node tools/rasterize.js <base>
[scale]` renders an asset's SVG to a transparent PNG at that scale.

If the embedded art would exceed ~300 KB, the build automatically writes
`dist/assets/` and references the files instead of inlining them. Either way
the result makes zero network requests.

### The logo file

The uploaded logo arrived as a 320x320 PNG with a painted white background, so
it showed as a white box on the game's dark screens. `assets/gwi-logo.png` is
now a transparent, trimmed version (284x178); the untouched upload is kept as
`assets/gwi-logo-source.png`.

Its grey "GREAT WORKS INTERNET" tagline (#757374) also measured only 3.33:1
against the title screen's background, so the tagline is recoloured white
(15.68:1). The blue mark is untouched. Both steps, reproducible from the
original upload:

```bash
node tools/dewhite.js assets/gwi-logo-source.png /tmp/logo-clear.png --pad=2
node tools/recolor.js /tmp/logo-clear.png assets/gwi-logo.png "#757374" "#ffffff"
```

`tools/dewhite.js` recovers real per-pixel alpha rather than keying out
near-white, so antialiased edges stay clean with no pale fringe. Run it on any
brand PNG that arrives with a white background. `tools/recolor.js` remaps one
colour family while preserving alpha.

Note that recolouring the tagline is a local edit to brand art. If GWI has an
official reverse/white logo, upload it as `gwi-logo.png` and the recolour step
can be dropped - worth asking for alongside the puffin art. Black was
considered and rejected: it measures 1.34:1 on that background, effectively
invisible.

### Brand colours

Sampled from the uploaded logo: the mark is **#35b7ff**, the tagline
**#757374**. Both are recorded in `src/styles.css`.

The buttons deliberately still use a darker blue (`--gwi-blue`, #1a6fb5):
white text on #35b7ff is about 2:1 contrast, well below the 4.5:1 accessibility
minimum. Using the true brand blue on buttons means switching their text to
dark - a brand call rather than a code one. Per-stage palettes in
`src/stages.js` are still approximations pending the exact values from the live
site CSS.

---

## Install it on your phone

A PWA can only be installed from an HTTPS origin, so the game needs hosting
first. `.github/workflows/pages.yml` builds from source and publishes `dist/`
to GitHub Pages on every push.

1. One-time: repository **Settings -> Pages -> Source: GitHub Actions**.
   Until this is set, the deploy fails at the `configure-pages` step.
2. Push (or run the workflow manually from the Actions tab).
3. Open the live site on your phone:
   **https://dosisek-macmtn.github.io/puffin-flight/**
4. **Android/Chrome:** menu -> *Install app* (or the install prompt).
   **iPhone/Safari:** Share -> *Add to Home Screen*.

It launches fullscreen with no browser chrome, and works with no signal after
the first visit - the service worker precaches the game, and the high score
lives in `localStorage` either way.

Any HTTPS static host works the same way; `start_url` and `scope` are relative,
so serving from a subdirectory (as Pages does) is fine.

### PWA details worth knowing

- **Orientation is locked to landscape** (`manifest.webmanifest`), because the
  16:9 playfield is heavily letterboxed in portrait. Change `"orientation"` to
  `"any"` to allow both. iOS ignores this and lets the phone rotate.
- **iOS** treats `display: fullscreen` as `standalone` (a thin status bar
  remains) and uses `apple-touch-icon`, not the manifest icons. Both are set.
  Install on iOS only works from Safari.
- **Updates** ship on the next launch: the cache name carries a hash of the
  built page, so a new build installs into a fresh cache and the old one is
  deleted.
- **App icons** are generated from the puffin art by
  `node tools/make-icons.js`, which writes `assets/icons/`. Re-run it when the
  real puffin art lands - the icons are the placeholder puffin today. The
  build copies them and fails loudly if an icon the manifest names is missing.

## Embedding

The whole game is one file, so hosting it at `gwi.net/play` is a file copy
(copy the folder if you also want the installable app). To embed it elsewhere:

```html
<iframe src="/play/" title="Puffin Flight"
        style="width:100%;aspect-ratio:16/9;border:0"
        allowfullscreen></iframe>
```

The game fills its container and letterboxes to 16:9, so give the iframe any
size you like. It never navigates the parent page, opens popups, or calls out
to the network. An embedded copy deliberately registers **no** service worker
and pulls no manifest, so dropping it into a page cannot install anything on
the host origin - there is a test for exactly that.

---

## Accessibility and safety

- `prefers-reduced-motion` disables screen shake, motion streaks and heavy
  particle effects, and the CSS animations.
- Stage, score, buffering and boost states are all readable as text, never
  colour alone.
- Nothing flashes faster than 3 Hz - the buffering stutter runs at 2.5 Hz and
  the surface splash is a single fade.
- Screens are real DOM elements with focusable buttons; stage changes and run
  outcomes are announced through an `aria-live` region.
- No data collection of any kind, no cookies, no third-party requests.

---

## Testing

Headless harnesses live in `tools/` and are development-only - they are not
part of the build or the deliverable. They need Chromium via Playwright.

```bash
node tools/smoke.js       # acceptance checks: errors, requests, stages,
                          # persistence, responsive sizes, iframe, a11y, pause
node tools/probe.js 90    # difficulty probe: plays for 90s, reports how runs end
node tools/trace.js       # dumps the last frames before each death (tuning)
node tools/shots.js       # writes stills of every screen to tools/shots/
node tools/make-icons.js  # regenerate app icons from the puffin art
```

The acceptance run covers the PWA too: the worker registers and activates, the
game loads with the network genuinely cut off, the manifest carries everything
an install prompt needs, every icon matches its declared size, and an iframe
embed installs nothing.

`tools/pilot.js` is the shared autopilot the harnesses use. It plays like a
competent human rather than a perfect solver, so `probe.js` output is a
sanity check on difficulty, not a benchmark.

---

## Still open before launch

- Confirm the production asset filenames on the new gwi.net and swap the
  placeholder art (see above).
- Confirm exact brand hex values from the live site CSS.
- Decide the final URL (`gwi.net/play` suggested) and whether the game is part
  of the launch-week announcement or a follow-up.
- Legal/marketing sign-off on the "Big Cable" buffering gag and the share line.
