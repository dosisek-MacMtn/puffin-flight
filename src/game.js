/* Puffin Flight — main loop and state machine.
 *
 * States: title -> playing <-> paused -> wipeout -> over -> playing
 * Physics are delta-time driven and sub-stepped, so a slow frame changes how
 * smooth the game looks, never how it plays.
 */
(function (PF) {
  'use strict';

  var C = PF.CONFIG;
  var W = C.world.width;
  var H = C.world.height;
  var STAGES = C.stages;
  var MAX_STEP = 1 / 120;     // physics sub-step ceiling
  var MAX_FRAME = 1 / 20;     // ignore anything slower (tab stalls, breakpoints)

  var renderer, world, dom;
  var reducedMotion = false;
  var raf = 0;
  var lastT = 0;

  var S = {
    mode: 'title',
    score: 0,
    peak: 0,
    high: 0,
    stageIdx: 0,
    fromIdx: 0,
    blend: 1,
    time: 0,
    bannerTime: 0,
    bannerStage: '',
    bannerTagline: '',
    bufferTime: 0,
    routerTime: 0,
    flash: 0,
    shake: 0,
    wipeTime: 0,
    nextSpawnAt: 0,
    ambient: 0,
    lastMilestone: 0,
    newRecord: false,
    lastDeath: null
  };

  /* ----------------------------------------------------------- high score -- */

  function loadHigh() {
    try {
      var v = window.localStorage.getItem(C.scoring.highScoreKey);
      return v ? Math.max(0, parseInt(v, 10) || 0) : 0;
    } catch (e) { return 0; }   // private mode / storage disabled
  }
  function saveHigh(v) {
    try { window.localStorage.setItem(C.scoring.highScoreKey, String(Math.floor(v))); } catch (e) {}
  }

  /* --------------------------------------------------------------- helpers -- */

  function lerp(a, b, t) { return a + (b - a) * t; }

  function stagePhysics() {
    var a = STAGES[S.fromIdx], b = STAGES[S.stageIdx], t = S.blend;
    return {
      gravity: lerp(a.gravity, b.gravity, t),
      flap: lerp(a.flap, b.flap, t),
      maxFall: lerp(a.maxFall, b.maxFall, t),
      maxRise: lerp(a.maxRise, b.maxRise, t)
    };
  }
  function stageScroll() {
    return lerp(STAGES[S.fromIdx].scroll, STAGES[S.stageIdx].scroll, S.blend);
  }
  function stageScoreRate() {
    return lerp(STAGES[S.fromIdx].scoreRate, STAGES[S.stageIdx].scoreRate, S.blend);
  }
  function speedFactor() {
    if (S.bufferTime > 0) return C.buffering.speedFactor;
    if (S.routerTime > 0) return C.router.speedFactor;
    return 1;
  }
  function currentPalette() {
    return PF.blendPalette(STAGES[S.fromIdx].palette, STAGES[S.stageIdx].palette, S.blend);
  }

  function renderState() {
    return {
      palette: currentPalette(),
      fromStage: STAGES[S.fromIdx],
      toStage: STAGES[S.stageIdx],
      stageIdx: S.stageIdx,
      stageName: STAGES[S.stageIdx].id,
      blend: S.blend,
      distance: world.distance,
      time: world.time,
      score: S.score,
      bannerTime: S.bannerTime,
      bannerStage: S.bannerStage,
      bannerTagline: S.bannerTagline,
      bufferTime: S.bufferTime,
      routerTime: S.routerTime,
      reducedMotion: reducedMotion
    };
  }

  /* ------------------------------------------------------------ transitions -- */

  function enterStage(idx) {
    var stage = STAGES[idx];
    S.fromIdx = S.stageIdx;
    S.stageIdx = idx;
    S.blend = 0;
    S.bannerTime = C.transition.bannerTime;
    S.bannerStage = stage.id;
    S.bannerTagline = stage.tagline;
    PF.audio.stageUp();
    announce(C.copy.unlocked(stage.id) + ' ' + stage.tagline);

    if (stage.id === 'FLY') {
      // Burst through the surface.
      PF.audio.splash();
      S.flash = 1;
      if (!reducedMotion) {
        world.emit('drop', world.puffin.x, world.puffin.y, 26, {
          speed: 240, life: 0.7, size: 5, gravity: 700, color: '#dff6ff'
        });
        shake(0.5);
      }
    } else if (!reducedMotion) {
      shake(0.35);
    }
  }

  function shake(amount) {
    if (reducedMotion) return;
    S.shake = Math.max(S.shake, amount);
  }

  function announce(msg) {
    if (dom.live) dom.live.textContent = msg;
  }

  /* ------------------------------------------------------------------ run -- */

  function startRun() {
    world.reset();
    S.mode = 'playing';
    S.score = 0;
    S.peak = 0;
    S.stageIdx = 0;
    S.fromIdx = 0;
    S.blend = 1;
    S.time = 0;
    S.bannerTime = 0;
    S.bufferTime = 0;
    S.routerTime = 0;
    S.flash = 0;
    S.shake = 0;
    S.wipeTime = 0;
    S.ambient = 0;
    S.lastMilestone = 0;
    S.newRecord = false;
    S.nextSpawnAt = world.distance + 320;
    showScreen(null);
    dom.pauseBtn.hidden = false;
    announce('Run started. Stage SWIM.');
  }

  function wipeout(reason) {
    if (S.mode !== 'playing') return;
    S.lastDeath = { reason: reason || 'unknown', score: Math.floor(S.score), stage: STAGES[S.stageIdx].id };
    S.mode = 'wipeout';
    S.wipeTime = 0.85;
    PF.audio.wipeout();
    shake(0.7);
    var pu = world.puffin;
    world.emit('star', pu.x, pu.y, reducedMotion ? 5 : 14, {
      speed: 190, life: 0.9, size: 6, gravity: 260, color: '#ffd873'
    });
    world.emit('drop', pu.x, pu.y, reducedMotion ? 6 : 18, {
      speed: 220, life: 0.7, size: 4, gravity: 520, color: '#eaf8ff'
    });
    dom.pauseBtn.hidden = true;
  }

  function gameOver() {
    S.mode = 'over';
    var final = Math.floor(S.score);
    S.newRecord = final > S.high;
    if (S.newRecord) {
      S.high = final;
      saveHigh(final);
    }
    var speed = PF.formatSpeed(final);
    dom.finalSpeed.textContent = speed;
    dom.overCopy.textContent = C.copy.gameOver(speed);
    dom.overHigh.textContent = PF.formatSpeed(S.high);
    dom.record.hidden = !S.newRecord;
    dom.titleHigh.textContent = PF.formatSpeed(S.high);
    dom.shareBtn.dataset.speed = speed;
    dom.shareNote.textContent = '';
    showScreen('over');
    announce(C.copy.gameOverTitle + ' ' + C.copy.gameOver(speed));
  }

  function togglePause(force) {
    if (S.mode === 'playing' && force !== false) {
      S.mode = 'paused';
      showScreen('paused');
      announce('Paused.');
    } else if (S.mode === 'paused' && force !== true) {
      S.mode = 'playing';
      showScreen(null);
      announce('Resumed.');
    }
  }

  /* ---------------------------------------------------------------- input -- */

  function flap() {
    PF.audio.unlock();
    if (S.mode === 'title') {
      startRun();
      world.puffin.flap(stagePhysics());
      PF.audio.flap();
      return;
    }
    if (S.mode === 'over') {
      startRun();
      return;
    }
    if (S.mode === 'paused') { togglePause(false); return; }
    if (S.mode !== 'playing') return;
    world.puffin.flap(stagePhysics());
    PF.audio.flap();
    if (!reducedMotion) {
      world.emit('drop', world.puffin.x - 26, world.puffin.y + 8, 3, {
        speed: 70, life: 0.35, size: 3, angle: Math.PI * 0.9, arc: 0.8,
        color: STAGES[S.stageIdx].id === 'SWIM' ? '#bff3ff' : '#ffffff'
      });
    }
  }

  function bindInput() {
    // Bind to the whole viewport, not just the 16:9 frame: in portrait most of
    // the screen is letterbox, and a thumb tap down there must still flap.
    var surface = dom.root;

    surface.addEventListener('pointerdown', function (e) {
      if (e.target.closest && e.target.closest('button, a')) return;
      e.preventDefault();
      flap();
    }, { passive: false });

    // Block double-tap zoom / rubber-band scrolling over the playfield.
    surface.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
    surface.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    surface.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    surface.addEventListener('dblclick', function (e) { e.preventDefault(); });

    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var k = e.key;
      if (k === ' ' || k === 'Spacebar' || k === 'ArrowUp' || k === 'Up') {
        // Let keyboard users still operate focused buttons with Space.
        var tag = document.activeElement && document.activeElement.tagName;
        if ((tag === 'BUTTON' || tag === 'A') && (k === ' ' || k === 'Spacebar')) return;
        e.preventDefault();
        flap();
      } else if (k === 'p' || k === 'P') {
        e.preventDefault();
        togglePause();
      } else if (k === 'Escape' && S.mode === 'playing') {
        togglePause(true);
      } else if (k === 'm' || k === 'M') {
        setMuted(PF.audio.toggleMute());
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && S.mode === 'playing') togglePause(true);
    });
    window.addEventListener('blur', function () {
      if (S.mode === 'playing') togglePause(true);
    });

    dom.playBtn.addEventListener('click', function () { PF.audio.unlock(); startRun(); });
    dom.againBtn.addEventListener('click', function () { PF.audio.unlock(); startRun(); });
    dom.resumeBtn.addEventListener('click', function () { togglePause(false); });
    dom.pauseBtn.addEventListener('click', function () { togglePause(); });
    dom.soundBtn.addEventListener('click', function () {
      PF.audio.unlock();
      setMuted(PF.audio.toggleMute());
    });
    dom.shareBtn.addEventListener('click', share);

    var resizeTimer = 0;
    function onResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () { renderer.resize(); }, 60);
      renderer.resize();
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  function setMuted(muted) {
    dom.soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    dom.soundBtn.textContent = muted ? 'Sound off' : 'Sound on';
  }

  function share() {
    var speed = dom.shareBtn.dataset.speed || PF.formatSpeed(S.score);
    var url = location.href.split('#')[0];
    var text = C.copy.share(speed, url);
    if (navigator.share) {
      navigator.share({ title: C.copy.shareTitle, text: text }).catch(function () {});
      return;
    }
    var done = function () { dom.shareNote.textContent = 'Copied to clipboard!'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {
        dom.shareNote.textContent = text;
      }
    }
  }

  /* --------------------------------------------------------------- screens -- */

  function showScreen(name) {
    dom.title.hidden = name !== 'title';
    dom.over.hidden = name !== 'over';
    dom.paused.hidden = name !== 'paused';
    dom.pauseBtn.hidden = !(S.mode === 'playing' || S.mode === 'paused');
  }

  /* ---------------------------------------------------------------- update -- */

  function step(dt) {
    S.time += dt;

    if (S.bannerTime > 0) S.bannerTime = Math.max(0, S.bannerTime - dt);
    if (S.blend < 1) S.blend = Math.min(1, S.blend + dt / C.transition.blendTime);
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 1.6);
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 1.8);

    if (S.mode === 'wipeout') {
      world.update(dt, stageScroll() * 0.25, reducedMotion);
      world.puffin.vy += 900 * dt;
      world.puffin.y += world.puffin.vy * dt;
      world.puffin.rot += dt * 3;
      S.wipeTime -= dt;
      if (S.wipeTime <= 0) gameOver();
      return;
    }

    if (S.mode !== 'playing') {
      // Idle scenery keeps moving gently behind the title / game-over panels.
      world.update(dt, stageScroll() * 0.25, reducedMotion);
      ambient(dt, stageScroll() * 0.25);
      return;
    }

    var factor = speedFactor();
    var scroll = stageScroll() * factor;

    if (S.bufferTime > 0) S.bufferTime = Math.max(0, S.bufferTime - dt);
    if (S.routerTime > 0) {
      S.routerTime = Math.max(0, S.routerTime - dt);
      world.puffin.glow = Math.min(1, S.routerTime / 0.4);
    } else {
      world.puffin.glow = 0;
    }

    // Score climbs with distance survived.
    S.score += stageScoreRate() * factor * dt;
    if (S.score > S.peak) S.peak = S.score;

    // Stage is driven by peak score, so a buffering hit can't demote you.
    var idx = PF.stageIndexFor(S.peak);
    if (idx !== S.stageIdx) enterStage(idx);

    // Subtle milestone shake once we're supersonic.
    if (STAGES[S.stageIdx].id === 'SOAR') {
      var milestone = Math.floor(S.peak / 500);
      if (milestone > S.lastMilestone) {
        S.lastMilestone = milestone;
        shake(0.28);
      }
    }

    var phys = stagePhysics();
    world.puffin.update(dt, phys, S.bufferTime > 0 ? 0.85 : 1);
    world.update(dt, scroll, reducedMotion);
    ambient(dt, scroll);

    // Distance-based spawning: slowing down never bunches obstacles up.
    if (world.distance >= S.nextSpawnAt) {
      var stage = STAGES[S.stageIdx];
      world.spawnGroup(stage, Math.random);
      S.nextSpawnAt = world.distance + stage.spawnInterval * stage.scroll;
    }

    // Ceiling is a soft stop; the floor ends the run.
    if (world.puffin.y < 24) {
      world.puffin.y = 24;
      if (world.puffin.vy < 0) world.puffin.vy = 0;
    }

    var events = world.collide(S.routerTime > 0);
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'lethal') { wipeout(ev.obj.variant || ev.obj.kind); return; }
      if (ev.type === 'buffer') {
        S.score = Math.max(0, S.score - C.scoring.bufferPenalty);
        S.bufferTime = C.buffering.duration;
        PF.audio.buffer();
        announce(C.copy.buffering);
        world.emit('drop', ev.obj.x, ev.obj.y, reducedMotion ? 4 : 12, {
          speed: 120, life: 0.5, size: 4, color: '#9fb6cf'
        });
      } else if (ev.type === 'fiber') {
        S.score += C.scoring.fiberBonus;
        if (S.score > S.peak) S.peak = S.score;
        PF.audio.fiber();
        world.emit('drop', ev.obj.x, ev.obj.y, reducedMotion ? 4 : 12, {
          speed: 150, life: 0.5, size: 3.5, color: '#8fe6ff'
        });
      } else if (ev.type === 'router') {
        S.routerTime = C.router.duration;
        PF.audio.router();
        announce('Router boost!');
        world.emit('drop', ev.obj.x, ev.obj.y, reducedMotion ? 5 : 16, {
          speed: 190, life: 0.6, size: 4, color: '#2a8fd8'
        });
      }
    }

    if (world.outOfBounds()) wipeout(world.puffin.y > 0 ? 'floor' : 'ceiling');
  }

  /* Stage-flavoured ambient particles: bubbles under water, streaks up high. */
  function ambient(dt, scroll) {
    if (reducedMotion) return;
    S.ambient -= dt;
    if (S.ambient > 0) return;
    var id = STAGES[S.stageIdx].id;
    if (id === 'SWIM') {
      S.ambient = 0.12;
      world.emit('bubble', W + 20, Math.random() * H, 1, {
        speed: 10, life: 3.2, size: 3.5, vx: -scroll * 0.55, vy: -40,
        color: 'rgba(200,245,255,0.7)'
      });
    } else if (id === 'SOAR') {
      S.ambient = 0.06;
      world.emit('streak', W + 30, Math.random() * H, 1, {
        speed: 0, life: 0.7, size: 3, vx: -scroll * 1.7, vy: 0,
        color: 'rgba(255,255,255,0.5)'
      });
    } else {
      S.ambient = 0.5;
    }
  }

  /* ----------------------------------------------------------------- draw -- */

  function draw() {
    var s = renderState();
    var ctx = renderer.ctx;
    renderer.begin(s.palette.skyBottom);

    if (S.shake > 0.001) {
      var m = S.shake * 12;
      ctx.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m);
    }

    renderer.drawBackground(s);
    renderer.drawObstacles(world, s);
    renderer.drawPickups(world, s);

    // Buffering makes the puffin stutter — a visible hitch, well under 3 Hz.
    var stutter = 0;
    if (S.bufferTime > 0) {
      stutter = Math.sin(S.time * Math.PI * 2 * C.buffering.stutterHz) > 0.4 ? 6 : 0;
    }
    ctx.save();
    ctx.translate(-stutter, 0);
    renderer.drawPuffin(world, s);
    ctx.restore();

    renderer.drawParticles(world);
    renderer.drawFlash(S.flash);

    if (S.mode === 'playing' || S.mode === 'wipeout' || S.mode === 'paused') {
      renderer.drawHud(s);
      renderer.drawBanner(s);
    }
    if (S.mode === 'title' || S.mode === 'over' || S.mode === 'paused') {
      renderer.drawScrim(S.mode === 'paused' ? 0.35 : 0.45);
    }
    renderer.end();
  }

  /* ----------------------------------------------------------------- loop -- */

  function frame(now) {
    raf = window.requestAnimationFrame(frame);
    var dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) return;
    if (dt > MAX_FRAME) dt = MAX_FRAME;

    // Sub-step so collisions stay honest even on a slow frame.
    var remaining = dt;
    while (remaining > 0) {
      var d = remaining > MAX_STEP ? MAX_STEP : remaining;
      step(d);
      remaining -= d;
    }
    draw();
  }

  /* ----------------------------------------------------------------- boot -- */

  PF.start = function (assetSources) {
    dom = {
      root: document.getElementById('pf-root'),
      canvas: document.getElementById('pf-canvas'),
      title: document.getElementById('pf-title'),
      over: document.getElementById('pf-over'),
      paused: document.getElementById('pf-paused'),
      playBtn: document.getElementById('pf-play'),
      againBtn: document.getElementById('pf-again'),
      resumeBtn: document.getElementById('pf-resume'),
      pauseBtn: document.getElementById('pf-pause'),
      soundBtn: document.getElementById('pf-sound'),
      shareBtn: document.getElementById('pf-share'),
      shareNote: document.getElementById('pf-share-note'),
      finalSpeed: document.getElementById('pf-final'),
      overCopy: document.getElementById('pf-over-copy'),
      overHigh: document.getElementById('pf-over-high'),
      titleHigh: document.getElementById('pf-title-high'),
      record: document.getElementById('pf-record'),
      live: document.getElementById('pf-live')
    };

    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    reducedMotion = !!(mq && mq.matches);
    if (mq) {
      var onMq = function (e) { reducedMotion = e.matches; };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }

    renderer = new PF.Renderer(dom.canvas);
    world = PF.createWorld();
    S.high = loadHigh();
    dom.titleHigh.textContent = PF.formatSpeed(S.high);
    setMuted(PF.audio.isMuted());

    bindInput();
    showScreen('title');
    dom.pauseBtn.hidden = true;

    PF.loadAssets(assetSources || {}, function () {
      var pointing = PF.getAsset('pointing');
      var thumbs = PF.getAsset('thumbsup');
      var logo = PF.getAsset('logo');
      if (pointing) document.getElementById('pf-art-pointing').src = pointing.src;
      if (thumbs) document.getElementById('pf-art-thumbsup').src = thumbs.src;
      if (logo) {
        document.getElementById('pf-logo-title').src = logo.src;
        document.getElementById('pf-logo-over').src = logo.src;
      }
    });

    // Seed the title-screen scenery so it isn't an empty gradient.
    for (var i = 0; i < 3; i++) world.spawnGroup(STAGES[0], Math.random);

    lastT = window.performance.now();
    raf = window.requestAnimationFrame(frame);
  };

  // Exposed for automated checks; not used by the game itself.
  PF._debug = { state: S, getWorld: function () { return world; } };
})(window.PF = window.PF || {});
