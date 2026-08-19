/* Shared autopilot for the headless harnesses.
 *
 * A proportional controller with lookahead: it predicts where a moving obstacle
 * will be by the time the puffin arrives, picks the side with real clearance,
 * and tracks its target by matching vertical speed rather than bang-banging.
 * It plays like a decent human, not a perfect solver.
 */
'use strict';

function installPilot() {
  var PF = window.PF;
  var S = PF._debug.state;
  var H = PF.CONFIG.world.height;

  window.__log = { maxScore: 0, stages: {}, buffered: 0, fibers: 0, frames: 0, longFrames: 0, runs: [] };
  var last = performance.now();

  window.__pilot = setInterval(function () {
    var now = performance.now();
    var dt = now - last;
    last = now;
    window.__log.frames++;
    if (dt > 60) window.__log.longFrames++;

    var w = PF._debug.getWorld();
    var pu = w.puffin;
    window.__log.maxScore = Math.max(window.__log.maxScore, S.score);
    window.__log.stages[PF.CONFIG.stages[S.stageIdx].id] = true;
    if (S.bufferTime > 0) window.__log.buffered++;
    if (S.lastDeath && S.lastDeath !== window.__deathRef) {
      window.__deathRef = S.lastDeath;
      window.__log.runs.push(S.lastDeath);
    }

    if (S.mode === 'title' || S.mode === 'over') {
      document.getElementById('pf-stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return;
    }
    if (S.mode !== 'playing') return;

    var stage = PF.CONFIG.stages[S.stageIdx];
    var scroll = stage.scroll * (S.bufferTime > 0 ? PF.CONFIG.buffering.speedFactor : 1);
    var target = H / 2;
    var best = Infinity;
    var list = w.obstacles.alive;

    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.kind === 'buffer') continue;                        // harmless by design
      var right = o.kind === 'column' ? o.x + o.w : o.x + o.r;
      // Distance to the obstacle's TRAILING edge: one we're still passing stays
      // selected (hold the gap), but it never outranks the next one ahead.
      var d = right - pu.x;
      if (d < 0) { o.__side = 0; continue; }
      if (d > best || d > 700) continue;
      best = d;
      var lead = Math.max(0, (o.kind === 'column' ? o.x : o.x - o.r) - pu.x);

      if (o.kind === 'column') {
        target = o.gapY;
      } else {
        // Where will this thing be when we get there?
        var eta = lead / Math.max(1, scroll * (o.speedMul || 1));
        var futureY = o.baseY + Math.sin((w.time + eta) * o.freq * Math.PI + o.phase) * o.amp;
        var above = futureY - o.r - 95;
        var below = futureY + o.r + 95;
        var canAbove = above > 80;
        var canBelow = below < H - 85;
        // Commit to a side the first time we consider this obstacle; flip-
        // flopping mid-approach is what flies you straight into it.
        if (!o.__side) {
          if (canAbove && canBelow) o.__side = Math.abs(above - pu.y) <= Math.abs(below - pu.y) ? -1 : 1;
          else o.__side = canAbove ? -1 : 1;
        }
        target = o.__side < 0 ? above : below;
      }
    }
    target = Math.max(70, Math.min(H - 80, target));

    // Flap only when where we're HEADED overshoots the target. Free-falling
    // until then is what lets the puffin actually descend: a flap replaces
    // velocity outright, so any rate-holding law ratchets upward instead.
    window.__target = target;
    // A flap rises ~55px, so the puffin oscillates in a band below the flap
    // threshold. Bias the threshold so that BAND straddles the target rather
    // than hanging above it.
    window.__willFlap = pu.y + pu.vy * 0.10 > target + 25;
    if (window.__willFlap) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    }
  }, 16);
}

module.exports = { installPilot };
