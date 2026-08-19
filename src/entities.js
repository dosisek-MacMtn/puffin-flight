/* Puffin Flight — entities and the world that owns them.
 *
 * Everything here is pooled: obstacles, pickups and particles are recycled
 * rather than allocated per spawn, so a long run doesn't sawtooth the GC.
 * All motion is delta-time based; nothing is tied to frame count.
 */
(function (PF) {
  'use strict';

  var C = PF.CONFIG;
  var W = C.world.width;
  var H = C.world.height;

  /* ---------------------------------------------------------------- pool -- */

  function Pool(factory, initial) {
    this.factory = factory;
    this.free = [];
    this.alive = [];
    for (var i = 0; i < (initial || 0); i++) this.free.push(factory());
  }
  Pool.prototype.acquire = function () {
    var o = this.free.length ? this.free.pop() : this.factory();
    this.alive.push(o);
    return o;
  };
  Pool.prototype.releaseAt = function (i) {
    var o = this.alive[i];
    this.alive[i] = this.alive[this.alive.length - 1];
    this.alive.pop();
    this.free.push(o);
    return o;
  };
  Pool.prototype.clear = function () {
    while (this.alive.length) this.free.push(this.alive.pop());
  };
  PF.Pool = Pool;

  /* --------------------------------------------------------------- puffin -- */

  function Puffin() {
    this.reset();
  }
  Puffin.prototype.reset = function () {
    this.x = C.puffin.x;
    this.y = H * 0.45;
    this.vy = 0;
    this.rot = 0;
    this.alive = true;
    this.flapAge = 99;          // seconds since last flap (drives wing pose)
    this.trail = [];            // scarf trail sample points
    this.trailTimer = 0;
    this.glow = 0;              // router power-up glow, 0..1
  };
  Puffin.prototype.flap = function (phys) {
    this.vy = phys.flap;
    this.flapAge = 0;
  };
  Puffin.prototype.update = function (dt, phys, timeScale) {
    this.flapAge += dt;
    this.vy += phys.gravity * dt * timeScale;
    if (this.vy > phys.maxFall) this.vy = phys.maxFall;
    if (this.vy < phys.maxRise) this.vy = phys.maxRise;
    this.y += this.vy * dt * timeScale;

    // Tilt toward velocity, eased so it never snaps.
    var t = this.vy / (this.vy < 0 ? -phys.maxRise : phys.maxFall);
    var target = t < 0 ? C.puffin.tiltUp * -t : C.puffin.tiltDown * t;
    this.rot += (target - this.rot) * Math.min(1, dt * 9);

    // Scarf trail: fixed-rate samples, independent of frame rate.
    this.trailTimer += dt;
    while (this.trailTimer >= 0.02) {
      this.trailTimer -= 0.02;
      this.trail.unshift({ x: this.x - 26, y: this.y + 4, life: 1 });
      if (this.trail.length > 14) this.trail.pop();
    }
    for (var i = 0; i < this.trail.length; i++) {
      this.trail[i].life -= dt * 2.4;
      this.trail[i].x -= dt * 40;
    }
  };
  PF.Puffin = Puffin;

  /* ------------------------------------------------------------- factories -- */

  function newObstacle() {
    return {
      kind: '', variant: '', x: 0, w: 0, gapY: 0, gapH: 0,
      hasTop: true, hasBottom: true, y: 0, r: 0, baseY: 0, amp: 0,
      freq: 0, phase: 0, speedMul: 1, spin: 0, used: false,
      scored: false, seed: 0, dead: false
    };
  }
  function newPickup() {
    return { kind: 'fiber', x: 0, y: 0, r: 0, baseY: 0, amp: 0, phase: 0, taken: false, spin: 0 };
  }
  function newParticle() {
    return {
      kind: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      size: 1, rot: 0, spin: 0, color: '#fff', gravity: 0
    };
  }

  /* ---------------------------------------------------------------- world -- */

  function World() {
    this.obstacles = new Pool(newObstacle, 16);
    this.pickups = new Pool(newPickup, 12);
    this.particles = new Pool(newParticle, 160);
    this.puffin = new Puffin();
    this.time = 0;
    this.lastGapY = H * 0.5;
    this.distance = 0;
  }

  World.prototype.reset = function () {
    this.obstacles.clear();
    this.pickups.clear();
    this.particles.clear();
    this.puffin.reset();
    this.time = 0;
    this.distance = 0;
    this.lastGapY = H * 0.5;
  };

  /* Spawn one obstacle group (plus an optional pickup) just off the right edge. */
  World.prototype.spawnGroup = function (stage, rand) {
    var r = rand || Math.random;
    var spawnX = W + 90;

    // Buffering wheel groups replace an obstacle group entirely — they are the
    // comedy beat, not an extra thing to dodge on top of a wall.
    if (r() < stage.bufferChance) {
      var b = this.obstacles.acquire();
      b.kind = 'buffer';
      b.variant = 'buffer';
      b.x = spawnX;
      b.r = 30;
      b.baseY = 90 + r() * (H - 220);
      b.y = b.baseY;
      b.amp = 26;
      b.freq = 0.7 + r() * 0.4;
      b.phase = r() * Math.PI * 2;
      b.speedMul = 1;
      b.spin = 0;
      b.used = false;
      b.dead = false;
      b.scored = false;
      b.seed = r();
      return;
    }

    var kinds = stage.obstacles;
    var kind = kinds[Math.floor(r() * kinds.length)];

    if (kind === 'gull') {
      var g = this.obstacles.acquire();
      g.kind = 'gull';
      g.variant = 'gull';
      g.x = spawnX;
      g.r = 22;
      g.baseY = 110 + r() * (H - 260);
      g.y = g.baseY;
      g.amp = 40 + r() * 45;
      g.freq = 0.9 + r() * 0.6;
      g.phase = r() * Math.PI * 2;
      g.speedMul = 1.3;
      g.dead = false;
      g.used = false;
      g.scored = false;
      g.seed = r();
      this.maybePickup(stage, r, spawnX + 190, 90 + r() * (H - 200));
      return;
    }

    if (kind === 'buoy') {
      var y = 120 + r() * (H - 260);
      var bo = this.obstacles.acquire();
      bo.kind = 'buoy';
      bo.variant = 'buoy';
      bo.x = spawnX;
      bo.r = 21;
      bo.baseY = y;
      bo.y = y;
      bo.amp = 30 + r() * 26;
      bo.freq = 0.45 + r() * 0.3;
      bo.phase = r() * Math.PI * 2;
      bo.speedMul = 1;
      bo.dead = false;
      bo.used = false;
      bo.scored = false;
      bo.seed = r();
      this.maybePickup(stage, r, spawnX + 200, 90 + r() * (H - 200));
      return;
    }

    // Column-style: kelp, rock spire, lighthouse top.
    var gapH = stage.gapMin + r() * (stage.gapMax - stage.gapMin);
    var margin = 56;
    var min = gapH / 2 + margin;
    var max = H - gapH / 2 - margin;
    // Keep consecutive gaps reachable: cap the vertical jump between groups.
    var gapY = this.lastGapY + (r() * 2 - 1) * 165;
    if (gapY < min) gapY = min;
    if (gapY > max) gapY = max;
    this.lastGapY = gapY;

    var o = this.obstacles.acquire();
    o.kind = 'column';
    o.variant = kind;
    o.x = spawnX;
    o.w = kind === 'lighthouse' ? 78 : 68;
    o.gapY = gapY;
    o.gapH = gapH;
    // A lighthouse rises from the bottom only; fly over it.
    o.hasTop = kind !== 'lighthouse';
    o.hasBottom = true;
    o.speedMul = 1;
    o.dead = false;
    o.used = false;
    o.scored = false;
    o.seed = r();

    if (!o.hasTop) {
      // Bottom-only: size a real tower (not a stub) and derive the gap from it,
      // so collision and art agree and there is clear sky above.
      var towerH = 150 + r() * 130;
      var top = H - towerH;
      o.gapY = top - gapH / 2;
      if (o.gapY < gapH / 2 + 40) o.gapY = gapH / 2 + 40;
    }

    this.maybePickup(stage, r, spawnX + o.w / 2, o.gapY);
  };

  World.prototype.maybePickup = function (stage, r, x, y) {
    if (r() > stage.fiberChance) return;
    var p = this.pickups.acquire();
    var isRouter = r() < C.router.spawnChance;
    p.kind = isRouter ? 'router' : 'fiber';
    p.x = x;
    p.baseY = Math.max(70, Math.min(H - 70, y));
    p.y = p.baseY;
    p.r = isRouter ? 20 : 15;
    p.amp = 9;
    p.phase = r() * Math.PI * 2;
    p.taken = false;
    p.spin = 0;
  };

  /* ------------------------------------------------------------ particles -- */

  World.prototype.emit = function (kind, x, y, count, opts) {
    opts = opts || {};
    for (var i = 0; i < count; i++) {
      var p = this.particles.acquire();
      p.kind = kind;
      p.x = x + (Math.random() * 2 - 1) * (opts.spread || 6);
      p.y = y + (Math.random() * 2 - 1) * (opts.spread || 6);
      var ang = opts.angle == null ? Math.random() * Math.PI * 2 : opts.angle + (Math.random() * 2 - 1) * (opts.arc || 0.7);
      var spd = (opts.speed || 90) * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(ang) * spd + (opts.vx || 0);
      p.vy = Math.sin(ang) * spd + (opts.vy || 0);
      p.maxLife = (opts.life || 0.6) * (0.6 + Math.random() * 0.7);
      p.life = p.maxLife;
      p.size = (opts.size || 5) * (0.5 + Math.random());
      p.rot = Math.random() * Math.PI * 2;
      p.spin = (Math.random() * 2 - 1) * 6;
      p.gravity = opts.gravity || 0;
      p.color = opts.color || '#ffffff';
    }
  };

  /* --------------------------------------------------------------- update -- */

  World.prototype.update = function (dt, scroll, reducedMotion) {
    this.time += dt;
    this.distance += scroll * dt;
    var t = this.time;
    var i, o, p;

    var obs = this.obstacles.alive;
    for (i = obs.length - 1; i >= 0; i--) {
      o = obs[i];
      o.x -= scroll * dt * o.speedMul;
      if (o.kind === 'buoy' || o.kind === 'gull' || o.kind === 'buffer') {
        o.y = o.baseY + Math.sin(t * o.freq * Math.PI + o.phase) * o.amp;
      }
      if (o.kind === 'buffer') o.spin += dt * 3.2;
      var right = o.kind === 'column' ? o.x + o.w : o.x + o.r;
      if (right < -40) this.obstacles.releaseAt(i);
    }

    var picks = this.pickups.alive;
    for (i = picks.length - 1; i >= 0; i--) {
      p = picks[i];
      p.x -= scroll * dt;
      p.y = p.baseY + Math.sin(t * 2.2 + p.phase) * p.amp;
      p.spin += dt * 2;
      if (p.x + p.r < -30 || p.taken) this.pickups.releaseAt(i);
    }

    var parts = this.particles.alive;
    var cap = reducedMotion ? 90 : 400;
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i];
      p.life -= dt;
      if (p.life <= 0 || parts.length > cap && p.life < p.maxLife * 0.4) {
        this.particles.releaseAt(i);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  };

  /* ----------------------------------------------------------- collisions -- */

  function circleHit(ax, ay, ar, bx, by, br) {
    var dx = ax - bx, dy = ay - by, rr = ar + br;
    return dx * dx + dy * dy <= rr * rr;
  }
  function circleRect(cx, cy, cr, rx, ry, rw, rh) {
    var nx = cx < rx ? rx : (cx > rx + rw ? rx + rw : cx);
    var ny = cy < ry ? ry : (cy > ry + rh ? ry + rh : cy);
    var dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy <= cr * cr;
  }

  /* Returns a list of events: {type:'lethal'|'buffer'|'fiber'|'router', obj}.
   * Pickups are consumed here; lethal hits are reported, not applied. */
  World.prototype.collide = function (invincible) {
    var events = [];
    var pu = this.puffin;
    var pr = C.puffin.radius;
    var i, o, p;

    var obs = this.obstacles.alive;
    for (i = 0; i < obs.length; i++) {
      o = obs[i];
      if (o.kind === 'column') {
        if (invincible) continue;
        if (o.hasTop && circleRect(pu.x, pu.y, pr, o.x, -10, o.w, o.gapY - o.gapH / 2 + 10)) {
          events.push({ type: 'lethal', obj: o });
          break;
        }
        var by = o.gapY + o.gapH / 2;
        if (o.hasBottom && circleRect(pu.x, pu.y, pr, o.x, by, o.w, H - by + 10)) {
          events.push({ type: 'lethal', obj: o });
          break;
        }
      } else if (o.kind === 'buffer') {
        if (!o.used && circleHit(pu.x, pu.y, pr, o.x, o.y, o.r * 0.85)) {
          o.used = true;
          events.push({ type: 'buffer', obj: o });
        }
      } else {
        if (invincible) continue;
        if (circleHit(pu.x, pu.y, pr, o.x, o.y, o.r * 0.82)) {
          events.push({ type: 'lethal', obj: o });
          break;
        }
      }
    }

    var picks = this.pickups.alive;
    for (i = 0; i < picks.length; i++) {
      p = picks[i];
      if (p.taken) continue;
      if (circleHit(pu.x, pu.y, pr + 6, p.x, p.y, p.r)) {
        p.taken = true;
        events.push({ type: p.kind, obj: p });
      }
    }
    return events;
  };

  /* Left the playfield? Ceiling is forgiving, the floor is not. */
  World.prototype.outOfBounds = function () {
    var pu = this.puffin;
    return pu.y > H - C.puffin.radius || pu.y < -80;
  };

  PF.World = World;
  PF.createWorld = function () { return new World(); };
})(window.PF = window.PF || {});
