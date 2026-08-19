# Puffin Flight - Developer Handoff

A family-friendly, one-button browser game for GWI (Great Works Internet) customers, starring the GWI puffin mascot. Ships as a single self-contained HTML file that can live at `/play` on gwi.net or be embedded anywhere via iframe.

Repo owner: Dave Osisek (MacMountain Networks / GWI)
Status: v1 spec - approved for build

---

## 1. Brand Context (read first)

- GWI is Maine's local fiber ISP since 1994. New site tagline: "Puffin Fast Fiber. It just puffin works."
- Site copy promises "No contracts, no data caps, no games." The game leans into this with a self-aware wink (see Copy section).
- Residential plans are named **Swim (500 Mbps)**, **Fly (1 Gig)**, and **Soar (2 Gig)**. These three names ARE the game's difficulty stages. Do not rename them.
- Tone: friendly, local, lightly funny, never snarky at customers. "Big Cable" is the only acceptable villain.
- Audience: all ages. Nothing scary, no violence, no death animations (the puffin "wipes out" with stars and a splash, then shakes it off).

### Brand assets (already exist on the site)

Staging paths below - swap the host to production `https://www.gwi.net` before launch:

| Asset | Path | Game usage |
|---|---|---|
| Flying puffin (aviator goggles + scarf) | `/brand/puffin-flying.png` | Player sprite (all stages) |
| Puffin holding glowing fiber strand | `/brand/puffin-fiber-strand.png` | Power-up / collectible art reference |
| Puffin pointing | `/brand/puffin-pointing.png` | Title screen / tutorial callout |
| Puffin thumbs up | `/brand/puffin-thumbsup.png` | New high score celebration |
| GWI logo | `/brand/gwi-logo.png` | Title + game over screens (small, tasteful) |

Prefer bundling copies of these into the repo (`/assets`) rather than hotlinking, so the game has zero runtime dependencies on the marketing site. Confirm final production filenames at integration time.

Brand colors: pull the exact hex values from the new site's CSS at build time. Primary is GWI blue (matches the scarf). Use site fonts if trivially available; otherwise a clean system font stack is fine.

---

## 2. Game Design

### Core loop

Endless side-scrolling flyer. The puffin auto-moves right. One input (tap / click / spacebar) makes him rise; gravity pulls him down. Survive, dodge obstacles, collect fiber strands. Run ends on obstacle collision or leaving the playfield.

### Scoring: Mbps

- Score is displayed as a connection speed: `S C O R E: 742 Mbps`.
- Score increases steadily with distance survived; fiber strand pickups add a burst (+25 Mbps each).
- Past 1000, display flips to Gbps with one decimal: `1.2 Gbps`.
- Local high score persisted in `localStorage` (key: `gwi-puffin-highscore`). No accounts, no server, no analytics. The game collects nothing.

### Stage progression (tied to plan names)

| Stage | Trigger | Look and feel | Difficulty |
|---|---|---|---|
| **SWIM** | 0 - 499 Mbps | Underwater. Blue-green palette, bubbles, kelp, slower physics (buoyancy feel). Puffins really do swim underwater - lean into it. | Gentle. Wide gaps, slow scroll. |
| **FLY** | 500 Mbps | Puffin bursts through the surface (splash transition). Maine coast: lighthouse silhouettes, lobster buoys, gulls. Normal physics. | Moderate. Scroll speed +25%, tighter gaps. |
| **SOAR** | 1000 Mbps (1 Gbps) | Supersonic. High-altitude sky, motion streaks, scarf trails harder, subtle screen shake on milestones. | Fast. Scroll speed +50%, obstacle variety maxed. |

Show a brief banner at each transition: "You've unlocked FLY!" etc. Stage names should visibly match the plan names - that is the whole marketing point.

### Obstacles (all Maine-flavored, all friendly)

- **Lobster buoys** - bob vertically on ropes (Swim + Fly stages)
- **Seagulls** - fly in sine waves toward the player (Fly + Soar)
- **Lighthouse tops** - static pipe-style obstacles from the bottom (Fly)
- **Kelp columns / rock spires** - pipe-style obstacles (Swim)
- **Buffering wheel** (special) - a spinning loading icon labeled "Big Cable." Touching it does NOT end the run; it slows the puffin and drains 50 Mbps with a stuttery "buffering..." effect for 2 seconds. Comedy obstacle and brand jab in one.

### Collectibles

- **Fiber strands** - short glowing light streaks, +25 Mbps, satisfying chime.
- **Router power-up** (rare) - 3 seconds of invincibility + speed burst, puffin glows GWI blue.

### Screens

1. **Title** - logo, puffin-pointing art, "Tap to flap" instruction, high score, and the joke line (see Copy).
2. **Playing** - HUD: current Mbps top-left, stage name top-right, pause button.
3. **Game over** - final speed, high score, puffin-thumbsup on a new record, "Fly Again" button, optional share line: `I hit [X] Mbps in Puffin Flight. Beat that. [url]` via `navigator.share` with clipboard fallback.

### Copy (v1, editable)

- Title screen subline: `"No contracts. No data caps. No games."* ... *OK, fine. One game.`
- Buffering hit: `Buffering... (this is what Big Cable feels like)`
- Game over: `You hit [X] Mbps! GWI customers get up to 2 Gbps without the seagulls.`
- Keep all copy G-rated and short.

---

## 3. Technical Requirements

### Architecture

- **Single self-contained deliverable**: `dist/index.html` with inlined CSS + JS. Images may be separate files in `dist/assets/` OR base64-inlined - either is acceptable; separate files preferred if total inline size would exceed ~300 KB.
- **Vanilla JS + Canvas 2D.** No frameworks, no build-time dependencies required at runtime. A simple build step (even a concat script) is fine if the source is split for sanity.
- Target: 60 fps on a mid-range phone. Use `requestAnimationFrame`, delta-time physics (do not tie physics to frame count), and object pooling for obstacles/particles.

### Input

- Touch (tap anywhere), mouse click, spacebar, and up arrow all flap.
- `P` or on-screen button pauses. Auto-pause on `visibilitychange`.
- Prevent double-tap zoom and scroll on mobile (`touch-action: manipulation`, prevent default on the canvas).

### Responsive / embed behavior

- Canvas scales to its container while preserving a 16:9-ish playfield; letterbox as needed. Must be playable in portrait phone, landscape phone, desktop, and inside an iframe.
- No console errors, no popups, no external network calls at runtime (fonts included - self-host or system stack).

### Accessibility and safety

- Respect `prefers-reduced-motion`: disable screen shake and heavy particle effects.
- All state readable without color alone (stage names as text, not just palette shifts).
- No flashing above 3 Hz anywhere (photosensitivity).
- No data collection of any kind. localStorage high score only.

### Browser support

Evergreen Chrome/Edge/Firefox/Safari, iOS Safari 16+, Android Chrome. No IE.

---

## 4. Suggested Repo Structure

```
puffin-flight/
├── README.md
├── SPEC.md                 <- this document
├── src/
│   ├── index.html
│   ├── game.js             <- main loop, state machine
│   ├── entities.js         <- puffin, obstacles, pickups
│   ├── stages.js           <- Swim/Fly/Soar config + transitions
│   ├── render.js           <- canvas drawing, parallax backgrounds
│   ├── audio.js            <- tiny WebAudio chimes (no audio files needed)
│   └── styles.css
├── assets/
│   ├── puffin-flying.png
│   ├── puffin-pointing.png
│   ├── puffin-thumbsup.png
│   ├── puffin-fiber-strand.png
│   └── gwi-logo.png
├── build.js                <- inlines src into dist/index.html
└── dist/
    └── index.html          <- the shippable artifact
```

Stage/difficulty tuning values should live in one config object at the top of `stages.js` so non-devs can tweak gap sizes, speeds, and thresholds without touching game logic.

---

## 5. Build Milestones

1. **M1 - Playable core (flappy skeleton):** puffin sprite, gravity/flap physics, one obstacle type, collision, score counter, game over/restart. Desktop + mobile input.
2. **M2 - Stages:** Swim/Fly/Soar palettes, parallax backgrounds, transition banners, speed ramping, full obstacle set.
3. **M3 - Juice:** fiber pickups, buffering wheel mechanic, particles, WebAudio chimes, scarf trail, screen shake (with reduced-motion off switch).
4. **M4 - Polish + ship:** title/game-over screens, copy, high score, share line, iframe/responsive QA, Lighthouse pass, build to single `dist/index.html`.

Each milestone should be a working game. Cut from the bottom if time is short - M1 + M2 alone is shippable.

## 6. Acceptance Criteria

- [ ] Runs from a single `dist/index.html` (plus optional `dist/assets/`) with zero external requests
- [ ] Playable with one finger on a phone and spacebar on desktop
- [ ] Stage names exactly match plan names: SWIM, FLY, SOAR at 0 / 500 / 1000 Mbps
- [ ] Score displays in Mbps, flips to Gbps at 1000
- [ ] Buffering wheel slows but does not kill
- [ ] High score persists across sessions, no other data stored or sent
- [ ] 60 fps on mid-range mobile, no jank at stage transitions
- [ ] Reduced-motion respected, no flashing content
- [ ] All copy G-rated, brand tone consistent with gwi.net
- [ ] Works embedded in an iframe on the new site

## 7. Out of Scope (v1)

- Server-side leaderboards or accounts
- Sound files / music (WebAudio-generated chimes only)
- Seasonal skins, multiple characters, achievements (good v2 candidates)
- Any tracking, analytics, or cookies

## 8. Open Items for Dave

- Confirm production asset filenames/paths on the new gwi.net before launch
- Confirm exact brand hex values from the live site CSS
- Decide final URL (`gwi.net/play` suggested) and whether the launch-week announcement includes the game or it follows as a second touchpoint
- Legal/marketing sign-off on the "Big Cable" buffering wheel gag and share-line copy
