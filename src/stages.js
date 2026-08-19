/* Puffin Flight — stage + difficulty configuration.
 *
 * EVERYTHING A NON-DEV MIGHT WANT TO TWEAK LIVES IN PF.CONFIG BELOW.
 * Gap sizes, speeds, spawn rates, stage thresholds, palettes and copy are all
 * here; no game logic in this file.
 */
(function (PF) {
  'use strict';

  PF.CONFIG = {
    /* Logical playfield. All game math uses these coordinates; the renderer
     * scales/letterboxes to whatever the container is. 16:9. */
    world: { width: 960, height: 540 },

    puffin: {
      x: 250,            // fixed horizontal position, logical px
      radius: 19,        // collision radius (forgiving vs. the drawn sprite)
      spriteW: 84,
      spriteH: 67,
      tiltUp: -0.42,     // radians at full rise
      tiltDown: 0.85     // radians at full fall
    },

    scoring: {
      fiberBonus: 25,        // Mbps per fiber strand
      bufferPenalty: 50,     // Mbps drained by the Big Cable buffering wheel
      gbpsThreshold: 1000,   // display flips to Gbps here
      highScoreKey: 'gwi-puffin-highscore'
    },

    buffering: {
      duration: 2.0,      // seconds of "buffering..."
      speedFactor: 0.55,  // scroll + score rate multiplier while buffering
      stutterHz: 2.5      // visual stutter rate (kept under 3 Hz: photosensitivity)
    },

    router: {
      duration: 3.0,      // seconds of invincibility
      speedFactor: 1.25,  // scroll + score rate multiplier while boosted
      spawnChance: 0.07   // chance a pickup slot spawns a router instead of fiber
    },

    transition: {
      bannerTime: 2.2,    // seconds the "You've unlocked FLY!" banner shows
      blendTime: 1.1      // seconds to lerp physics/palette between stages
    },

    /* Stage order matters: thresholds must ascend. Stage names are the GWI
     * residential plan names and must stay SWIM / FLY / SOAR. */
    stages: [
      {
        id: 'SWIM',
        threshold: 0,
        tagline: 'Underwater. Puffins really do swim.',
        scoreRate: 20,        // Mbps gained per second survived
        scroll: 200,          // logical px per second
        gravity: 820,         // px/s^2 — buoyant
        flap: -300,           // px/s impulse
        maxFall: 360,
        maxRise: -420,
        gapMin: 208,
        gapMax: 248,
        spawnInterval: 1.85,  // seconds between obstacle groups
        bufferChance: 0.10,   // chance a group is a buffering wheel instead
        fiberChance: 0.72,    // chance a group carries a pickup
        obstacles: ['kelp', 'rock', 'buoy'],
        palette: {
          skyTop: '#04303a', skyBottom: '#0b6b6e', haze: '#1fa3a0',
          far: '#0a4d55', near: '#0d3b45', accent: '#5fe3d0',
          hud: '#eafcff', obstacle: '#1c7f63', obstacleEdge: '#6ff0d6'
        }
      },
      {
        id: 'FLY',
        threshold: 500,
        tagline: 'Maine coast. Mind the gulls.',
        scoreRate: 25,
        scroll: 250,          // +25% vs SWIM
        gravity: 1500,
        flap: -430,
        maxFall: 650,
        maxRise: -560,
        gapMin: 182,
        gapMax: 210,
        spawnInterval: 1.55,
        bufferChance: 0.13,
        fiberChance: 0.66,
        obstacles: ['lighthouse', 'buoy', 'gull'],
        palette: {
          skyTop: '#67c6f2', skyBottom: '#d6f0fb', haze: '#ffffff',
          far: '#7fa8bd', near: '#2f5d70', accent: '#ffc247',
          hud: '#123448', obstacle: '#e9edf0', obstacleEdge: '#c2ccd4'
        }
      },
      {
        id: 'SOAR',
        threshold: 1000,
        tagline: 'Supersonic. Two gigs of altitude.',
        scoreRate: 32,
        scroll: 300,          // +50% vs SWIM
        gravity: 1700,
        flap: -470,
        maxFall: 760,
        maxRise: -620,
        gapMin: 168,
        gapMax: 192,
        spawnInterval: 1.35,
        bufferChance: 0.15,
        fiberChance: 0.62,
        obstacles: ['gull', 'rock'],
        palette: {
          skyTop: '#0b1f5c', skyBottom: '#4aa6e8', haze: '#bfe6ff',
          far: '#7fb6e8', near: '#2b5da8', accent: '#ffd873',
          hud: '#f2f9ff', obstacle: '#dfe9f5', obstacleEdge: '#9fb6cf'
        }
      }
    ],

    /* All player-facing copy. G-rated, short, GWI tone. */
    copy: {
      title: 'PUFFIN FLIGHT',
      subline: '"No contracts. No data caps. No games."*',
      subline2: '*OK, fine. One game.',
      tapToFlap: 'Tap to flap',
      tapToFlapDesktop: 'Tap, click or press SPACE to flap',
      buffering: 'Buffering... (this is what Big Cable feels like)',
      bigCable: 'Big Cable',
      unlocked: function (stage) { return "You've unlocked " + stage + '!'; },
      gameOverTitle: 'Wiped out!',
      gameOver: function (speed) {
        return 'You hit ' + speed + '! GWI customers get up to 2 Gbps without the seagulls.';
      },
      newRecord: 'New personal best!',
      playAgain: 'Fly Again',
      share: function (speed, url) {
        return 'I hit ' + speed + ' in Puffin Flight. Beat that. ' + url;
      },
      shareTitle: 'Puffin Flight'
    }
  };

  /* Which stage index a (peak) score belongs to. Stage never walks backwards —
   * game.js feeds this the peak score so a buffering hit can't demote you. */
  PF.stageIndexFor = function (score) {
    var stages = PF.CONFIG.stages;
    var idx = 0;
    for (var i = 0; i < stages.length; i++) {
      if (score >= stages[i].threshold) idx = i;
    }
    return idx;
  };

  /* Score -> display string. Mbps until 1000, then Gbps with one decimal. */
  PF.formatSpeed = function (score) {
    var s = Math.max(0, Math.floor(score));
    if (s >= PF.CONFIG.scoring.gbpsThreshold) {
      return (Math.floor(s / 100) / 10).toFixed(1) + ' Gbps';
    }
    return s + ' Mbps';
  };
})(window.PF = window.PF || {});
