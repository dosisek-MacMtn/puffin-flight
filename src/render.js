/* Puffin Flight — canvas rendering.
 *
 * The game always draws in a fixed 960x540 logical space; the renderer scales
 * and letterboxes that into whatever box the page gives it, so the same code
 * works in portrait, landscape, desktop and inside an iframe.
 */
(function (PF) {
  'use strict';

  var C = PF.CONFIG;
  var W = C.world.width;
  var H = C.world.height;

  /* ---------------------------------------------------------------- color -- */

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var rgbCache = {};
  function rgb(hex) {
    if (!rgbCache[hex]) rgbCache[hex] = hexToRgb(hex);
    return rgbCache[hex];
  }
  function hex2(n) { return (n < 16 ? '0' : '') + n.toString(16); }
  /* Returns hex, not rgb(): the result is fed back into rgba()/rgb(), which
   * parse hex only. */
  function mix(a, b, t) {
    var ca = rgb(a), cb = rgb(b);
    return '#' +
      hex2(Math.round(ca[0] + (cb[0] - ca[0]) * t)) +
      hex2(Math.round(ca[1] + (cb[1] - ca[1]) * t)) +
      hex2(Math.round(ca[2] + (cb[2] - ca[2]) * t));
  }
  function rgba(hex, a) {
    var c = rgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  PF.mixColor = mix;

  /* Perceived brightness 0..1 — used to pick a contrasting text outline. */
  PF.luminance = function (hex) {
    var c = rgb(hex);
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  };

  /* --------------------------------------------------------------- assets -- */

  var assets = {};
  PF.loadAssets = function (sources, done) {
    var keys = Object.keys(sources);
    var pending = keys.length;
    if (!pending) { done(); return; }
    keys.forEach(function (k) {
      var img = new Image();
      img.onload = img.onerror = function () {
        pending--;
        if (pending === 0) done();
      };
      img.src = sources[k];
      assets[k] = img;
    });
  };
  PF.getAsset = function (k) { return assets[k]; };
  function drawable(img) { return img && img.complete && img.naturalWidth > 0; }

  /* ------------------------------------------------------------- renderer -- */

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.scale = 1;
    this.offX = 0;
    this.offY = 0;
    this.cssW = 0;
    this.cssH = 0;
    this.resize();
  }

  Renderer.prototype.resize = function () {
    var rect = this.canvas.parentNode.getBoundingClientRect();
    var cssW = Math.max(1, Math.round(rect.width));
    var cssH = Math.max(1, Math.round(rect.height));
    // Cap the backing store on very dense displays: 60fps beats extra pixels.
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.scale = Math.min(cssW / W, cssH / H);
    this.offX = (cssW - W * this.scale) / 2;
    this.offY = (cssH - H * this.scale) / 2;
  };

  /* Set up the frame: paint the letterbox, then clip to the playfield. */
  Renderer.prototype.begin = function (letterboxColor) {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = letterboxColor;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.save();
    ctx.translate(this.offX, this.offY);
    ctx.scale(this.scale, this.scale);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
  };
  Renderer.prototype.end = function () { this.ctx.restore(); };

  /* ---------------------------------------------------------- backgrounds -- */

  function wrap(v, span) { return ((v % span) + span) % span; }

  function drawSwim(ctx, s, alpha) {
    var p = s.palette, d = s.distance, t = s.time;
    ctx.globalAlpha = alpha;

    // Light shafts from the surface.
    if (!s.reducedMotion) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.12;
      for (var i = 0; i < 5; i++) {
        var sx = wrap(i * 240 - d * 0.06 + Math.sin(t * 0.2 + i) * 20, 1200) - 120;
        ctx.fillStyle = p.haze;
        ctx.beginPath();
        ctx.moveTo(sx, -10);
        ctx.lineTo(sx + 70, -10);
        ctx.lineTo(sx + 190, H + 10);
        ctx.lineTo(sx + 30, H + 10);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Far kelp forest.
    ctx.globalAlpha = alpha * 0.45;
    ctx.fillStyle = p.far;
    for (var k = 0; k < 9; k++) {
      var x = wrap(k * 150 - d * 0.25, 1350) - 100;
      var h = 150 + ((k * 37) % 120);
      kelpBlade(ctx, x, H, h * 1.6, 26, t * 0.6 + k);
    }
    // Near rocks along the seabed.
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = p.near;
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    for (var rx = -10; rx <= W + 40; rx += 40) {
      var ry = H - 26 - Math.sin((rx + d * 0.5) * 0.012) * 16 - ((rx * 7) % 13);
      ctx.lineTo(rx, ry);
    }
    ctx.lineTo(W + 40, H + 10);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function kelpBlade(ctx, x, baseY, h, w, phase) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, baseY);
    for (var y = 0; y <= h; y += 24) {
      ctx.lineTo(x - w / 2 + Math.sin(y * 0.02 + phase) * 14, baseY - y);
    }
    for (var y2 = h; y2 >= 0; y2 -= 24) {
      ctx.lineTo(x + w / 2 + Math.sin(y2 * 0.02 + phase) * 14, baseY - y2);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawFly(ctx, s, alpha) {
    var p = s.palette, d = s.distance, t = s.time;
    ctx.globalAlpha = alpha;

    // Sun.
    ctx.fillStyle = rgba(p.accent, 0.55);
    ctx.beginPath();
    ctx.arc(W - 150, 96, 40, 0, Math.PI * 2);
    ctx.fill();

    // Clouds, slowest layer.
    ctx.fillStyle = rgba(p.haze, 0.75);
    for (var i = 0; i < 6; i++) {
      var cx = wrap(i * 230 - d * 0.1, 1380) - 120;
      var cy = 60 + ((i * 53) % 90);
      puff(ctx, cx, cy, 34 + (i % 3) * 10);
    }

    // Headland with lighthouse silhouettes.
    ctx.globalAlpha = alpha * 0.75;
    ctx.fillStyle = p.far;
    for (var j = 0; j < 5; j++) {
      var hx = wrap(j * 320 - d * 0.28, 1600) - 160;
      ctx.beginPath();
      ctx.moveTo(hx - 120, H - 96);
      ctx.quadraticCurveTo(hx, H - 190, hx + 130, H - 96);
      ctx.closePath();
      ctx.fill();
      if (j % 2 === 0) {
        // Stand the lighthouse on the headland; based any higher it floats.
        ctx.fillRect(hx - 8, H - 212, 18, 96);
        ctx.beginPath();
        ctx.moveTo(hx - 14, H - 212);
        ctx.lineTo(hx + 1, H - 230);
        ctx.lineTo(hx + 16, H - 212);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Sea.
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.near;
    ctx.beginPath();
    ctx.moveTo(0, H - 88);
    for (var wx = 0; wx <= W; wx += 30) {
      ctx.lineTo(wx, H - 88 + Math.sin((wx + d * 0.9) * 0.02 + t) * 6);
    }
    ctx.lineTo(W, H + 10);
    ctx.lineTo(0, H + 10);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function puff(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 0.8, y + 6, r * 0.72, 0, Math.PI * 2);
    ctx.arc(x - r * 0.85, y + 8, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSoar(ctx, s, alpha) {
    var p = s.palette, d = s.distance, t = s.time;
    ctx.globalAlpha = alpha;

    // Faint stars up high (static brightness — nothing strobes).
    ctx.fillStyle = rgba('#ffffff', 0.55);
    for (var i = 0; i < 34; i++) {
      var sx = wrap(i * 97 - d * 0.03, 1000);
      var sy = ((i * 61) % 240) + 10;
      ctx.fillRect(sx, sy, 2, 2);
    }

    // Cloud tops far below.
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = rgba(p.haze, 0.8);
    for (var j = 0; j < 7; j++) {
      var cx = wrap(j * 200 - d * 0.2, 1400) - 100;
      puff(ctx, cx, H - 60 + ((j * 29) % 40), 46);
    }

    // Motion streaks.
    if (!s.reducedMotion) {
      ctx.globalAlpha = alpha * 0.3;
      ctx.strokeStyle = p.haze;
      ctx.lineWidth = 2;
      for (var k = 0; k < 16; k++) {
        var lx = wrap(k * 130 - d * 1.6, 1200) - 120;
        var ly = ((k * 83) % (H - 60)) + 20;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + 90, ly);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  var LAYERS = { SWIM: drawSwim, FLY: drawFly, SOAR: drawSoar };

  /* Blend the two stages' palettes so transitions never pop. */
  PF.blendPalette = function (a, b, t) {
    var out = {};
    for (var k in a) {
      if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = mix(a[k], b[k], t);
    }
    return out;
  };

  Renderer.prototype.drawBackground = function (s) {
    var ctx = this.ctx;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, s.palette.skyTop);
    g.addColorStop(1, s.palette.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    var from = LAYERS[s.fromStage.id];
    var to = LAYERS[s.toStage.id];
    if (from === to || s.blend >= 1) {
      to(ctx, s, 1);
    } else {
      from(ctx, s, 1 - s.blend);
      to(ctx, s, s.blend);
    }
  };

  /* ------------------------------------------------------------ obstacles -- */

  Renderer.prototype.drawObstacles = function (world, s) {
    var ctx = this.ctx;
    var list = world.obstacles.alive;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.kind === 'column') this.drawColumn(o, s);
      else if (o.kind === 'buoy') this.drawBuoy(o, s);
      else if (o.kind === 'gull') this.drawGull(o, s);
      else if (o.kind === 'buffer') this.drawBuffer(o, s);
    }
  };

  Renderer.prototype.drawColumn = function (o, s) {
    var ctx = this.ctx;
    var topH = o.gapY - o.gapH / 2;
    var botY = o.gapY + o.gapH / 2;
    if (o.variant === 'kelp') {
      ctx.fillStyle = s.palette.obstacle;
      ctx.strokeStyle = s.palette.obstacleEdge;
      ctx.lineWidth = 3;
      if (o.hasTop) kelpColumn(ctx, o.x, o.w, -10, topH + 10, s.time, o.seed, true);
      if (o.hasBottom) kelpColumn(ctx, o.x, o.w, botY, H - botY + 10, s.time, o.seed, false);
    } else if (o.variant === 'rock') {
      ctx.fillStyle = s.palette.obstacle;
      ctx.strokeStyle = s.palette.obstacleEdge;
      ctx.lineWidth = 3;
      if (o.hasTop) spire(ctx, o.x, o.w, -10, topH + 10, true, o.seed);
      if (o.hasBottom) spire(ctx, o.x, o.w, botY, H - botY + 10, false, o.seed);
    } else {
      // Lighthouse: bottom only, white tower with a red band and a lantern room.
      var y = botY, h = H - botY + 10;
      ctx.fillStyle = s.palette.obstacle;
      ctx.strokeStyle = s.palette.obstacleEdge;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(o.x + 6, y + 26);
      ctx.lineTo(o.x + o.w - 6, y + 26);
      ctx.lineTo(o.x + o.w, y + h);
      ctx.lineTo(o.x, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d3453c';
      ctx.fillRect(o.x + 7, y + 60, o.w - 14, 22);
      ctx.fillRect(o.x + 2, y + 12, o.w - 4, 16);
      ctx.fillStyle = '#2a3742';
      ctx.fillRect(o.x + 14, y + 26, o.w - 28, 14);
      ctx.fillStyle = rgba('#ffd873', 0.95);
      ctx.beginPath();
      ctx.arc(o.x + o.w / 2, y + 20, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  function kelpColumn(ctx, x, w, y, h, t, seed, flip) {
    var sway = Math.sin(t * 0.9 + seed * 6) * 7;
    ctx.beginPath();
    ctx.moveTo(x, y);
    var steps = Math.max(2, Math.floor(h / 26));
    for (var i = 0; i <= steps; i++) {
      var yy = y + (flip ? h - (h / steps) * i : (h / steps) * i);
      var off = Math.sin(i * 0.8 + t + seed * 5) * 6 + (flip ? sway * (i / steps) : sway * (1 - i / steps));
      ctx.lineTo(x + off, yy);
    }
    for (var j = steps; j >= 0; j--) {
      var yy2 = y + (flip ? h - (h / steps) * j : (h / steps) * j);
      var off2 = Math.sin(j * 0.8 + t + seed * 5) * 6 + (flip ? sway * (j / steps) : sway * (1 - j / steps));
      ctx.lineTo(x + w + off2, yy2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function spire(ctx, x, w, y, h, pointDown, seed) {
    var tipX = x + w / 2 + (seed - 0.5) * 10;
    ctx.beginPath();
    if (pointDown) {
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x + w + 4, y);
      ctx.lineTo(x + w - 6, y + h - 30);
      ctx.lineTo(tipX, y + h);
      ctx.lineTo(x + 6, y + h - 30);
    } else {
      ctx.moveTo(tipX, y);
      ctx.lineTo(x + w - 6, y + 30);
      ctx.lineTo(x + w + 4, y + h);
      ctx.lineTo(x - 4, y + h);
      ctx.lineTo(x + 6, y + 30);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  Renderer.prototype.drawBuoy = function (o, s) {
    var ctx = this.ctx;
    // Rope: decorative only, never lethal.
    ctx.strokeStyle = rgba('#f4e7c8', 0.5);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + Math.sin(s.time + o.phase) * 8, s.toStage.id === 'SWIM' ? -20 : H + 20);
    ctx.stroke();

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = '#e8503f';
    ctx.beginPath();
    ctx.ellipse(0, 0, o.r * 0.85, o.r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f7f3ea';
    ctx.fillRect(-o.r * 0.85, -6, o.r * 1.7, 8);
    ctx.fillStyle = '#2a3742';
    ctx.fillRect(-3, -o.r - 9, 6, 12);
    ctx.restore();
  };

  Renderer.prototype.drawGull = function (o, s) {
    var ctx = this.ctx;
    // Wings keep a visible sweep through the whole flap cycle — a gull that
    // flattens to a sliver is a lethal obstacle you can't see coming.
    var flap = Math.sin(s.time * 7 + o.phase);
    var tip = -10 + flap * 12;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.strokeStyle = '#5d6b78';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#ffffff';

    ctx.beginPath();
    ctx.moveTo(-30, tip);
    ctx.quadraticCurveTo(-14, tip + 4, -3, 2);
    ctx.lineTo(-3, 9);
    ctx.quadraticCurveTo(-16, 10, -30, tip + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(30, tip);
    ctx.quadraticCurveTo(14, tip + 4, 3, 2);
    ctx.lineTo(3, 9);
    ctx.quadraticCurveTo(16, 10, 30, tip + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 4, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-11, -1, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Beak points the way it's travelling.
    ctx.fillStyle = '#f0872a';
    ctx.beginPath();
    ctx.moveTo(-15, -3);
    ctx.lineTo(-27, 0);
    ctx.lineTo(-15, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a3742';
    ctx.beginPath();
    ctx.arc(-12, -3, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  Renderer.prototype.drawBuffer = function (o, s) {
    var ctx = this.ctx;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.globalAlpha = o.used ? 0.35 : 1;

    ctx.fillStyle = rgba('#0d1720', 0.55);
    ctx.beginPath();
    ctx.arc(0, 0, o.r + 4, 0, Math.PI * 2);
    ctx.fill();

    // Spinner: a gapped ring, rotating steadily. No strobing.
    ctx.rotate(o.spin);
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (var i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = rgba('#ffffff', 0.2 + (i / 8) * 0.7);
      ctx.beginPath();
      ctx.moveTo(0, -o.r + 7);
      ctx.lineTo(0, -o.r + 1);
      ctx.stroke();
    }
    ctx.restore();

    // Label — text, not colour alone.
    ctx.save();
    ctx.globalAlpha = o.used ? 0.3 : 0.92;
    ctx.font = '700 15px ' + PF.FONT;
    ctx.textAlign = 'center';
    var label = C.copy.bigCable;
    var tw = ctx.measureText(label).width;
    // Nudge the label so it stays readable when the wheel is at a screen edge.
    var lx = Math.max(tw / 2 + 12, Math.min(W - tw / 2 - 12, o.x));
    ctx.translate(lx, o.y);
    ctx.fillStyle = rgba('#0d1720', 0.6);
    roundRect(ctx, -tw / 2 - 8, o.r + 8, tw + 16, 22, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, 0, o.r + 24);
    ctx.restore();
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  PF.roundRect = roundRect;

  /* -------------------------------------------------------------- pickups -- */

  Renderer.prototype.drawPickups = function (world, s) {
    var ctx = this.ctx;
    var list = world.pickups.alive;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.kind === 'fiber') {
        var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r * 2.1);
        glow.addColorStop(0, 'rgba(255,255,255,0.95)');
        glow.addColorStop(0.45, 'rgba(127,216,255,0.5)');
        glow.addColorStop(1, 'rgba(26,111,181,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(Math.sin(p.spin) * 0.3);
        ctx.strokeStyle = '#8fe6ff';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-10, 11);
        ctx.quadraticCurveTo(2, 0, 10, -12);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.rotate(Math.sin(p.spin) * 0.15);
        ctx.fillStyle = rgba('#2a8fd8', 0.35);
        ctx.beginPath();
        ctx.arc(0, 0, p.r * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#12212e';
        roundRect(ctx, -p.r, -p.r * 0.55, p.r * 2, p.r * 1.1, 5);
        ctx.fill();
        ctx.strokeStyle = '#2a8fd8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-6, -p.r * 0.55);
        ctx.lineTo(-11, -p.r * 1.5);
        ctx.moveTo(6, -p.r * 0.55);
        ctx.lineTo(11, -p.r * 1.5);
        ctx.stroke();
        ctx.fillStyle = '#5fe3d0';
        ctx.fillRect(-p.r + 5, -2, 5, 4);
        ctx.fillRect(-p.r + 14, -2, 5, 4);
      }
      ctx.restore();
    }
  };

  /* ------------------------------------------------------------ particles -- */

  Renderer.prototype.drawParticles = function (world) {
    var ctx = this.ctx;
    var list = world.particles.alive;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      if (p.kind === 'bubble') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'star') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        star(ctx, p.size * 1.6);
        ctx.restore();
      } else if (p.kind === 'streak') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.size * 4, p.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  function star(ctx, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rad = i % 2 ? r * 0.45 : r;
      var a = (Math.PI / 5) * i - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
  }

  /* --------------------------------------------------------------- puffin -- */

  Renderer.prototype.drawPuffin = function (world, s) {
    var ctx = this.ctx;
    var pu = world.puffin;

    // Scarf trail.
    ctx.lineCap = 'round';
    for (var i = pu.trail.length - 1; i > 0; i--) {
      var a = pu.trail[i], b = pu.trail[i - 1];
      if (a.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, a.life) * 0.5;
      ctx.strokeStyle = s.stageIdx === 2 ? '#8fd8ff' : '#2a8fd8';
      ctx.lineWidth = 3 + (pu.trail.length - i) * 0.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(pu.x, pu.y);
    ctx.rotate(pu.rot);

    if (pu.glow > 0.01) {
      // Router power-up: steady GWI-blue halo, gentle 1.5 Hz pulse.
      var pulse = 0.75 + Math.sin(s.time * 9) * 0.12;
      var g = ctx.createRadialGradient(0, 0, 6, 0, 0, 62);
      g.addColorStop(0, rgba('#2a8fd8', 0.55 * pu.glow * pulse));
      g.addColorStop(1, rgba('#2a8fd8', 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 62, 0, Math.PI * 2);
      ctx.fill();
    }

    var img = PF.getAsset('flying');
    var w = C.puffin.spriteW, h = C.puffin.spriteH;
    if (drawable(img)) {
      ctx.drawImage(img, -w * 0.55, -h / 2, w, h);
    } else {
      // Vector fallback so the game is always playable, even if art fails.
      ctx.fillStyle = '#1b1d21';
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.34, h * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f7f9fb';
      ctx.beginPath();
      ctx.ellipse(6, 6, w * 0.24, h * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f0872a';
      ctx.beginPath();
      ctx.moveTo(w * 0.3, -4);
      ctx.lineTo(w * 0.5, 2);
      ctx.lineTo(w * 0.3, 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  PF.Renderer = Renderer;
  PF.FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif';
})(window.PF = window.PF || {});

/* Puffin Flight — HUD and in-canvas overlays. */
(function (PF) {
  'use strict';

  var C = PF.CONFIG;
  var W = C.world.width;
  var H = C.world.height;

  /* HUD text is outlined rather than shadowed. Stage palettes flip between a
   * near-white and a near-black HUD colour, and mid-transition the blend passes
   * through a mid-tone that a shadow alone can't keep legible. */
  function hudText(ctx, s, text, x, y, font) {
    ctx.font = font;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = PF.luminance(s.palette.hud) > 0.55
      ? 'rgba(6,20,30,0.62)'
      : 'rgba(255,255,255,0.72)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = s.palette.hud;
    ctx.fillText(text, x, y);
  }

  PF.Renderer.prototype.drawHud = function (s) {
    var ctx = this.ctx;
    ctx.textBaseline = 'alphabetic';

    // Score, top-left, as a connection speed.
    ctx.textAlign = 'left';
    hudText(ctx, s, 'S C O R E', 24, 40, '700 15px ' + PF.FONT);
    hudText(ctx, s, PF.formatSpeed(s.score), 24, 78, '800 38px ' + PF.FONT);

    // Stage name, top-right. Text, never colour alone.
    ctx.textAlign = 'right';
    hudText(ctx, s, 'S T A G E', W - 24, 40, '700 15px ' + PF.FONT);
    hudText(ctx, s, s.stageName, W - 24, 74, '800 32px ' + PF.FONT);

    // Buffering notice.
    if (s.bufferTime > 0) {
      ctx.textAlign = 'center';
      var dots = 1 + (Math.floor(s.time * 2) % 3);
      var msg = C.copy.buffering.replace('...', new Array(dots + 1).join('.'));
      ctx.font = '700 22px ' + PF.FONT;
      var tw = ctx.measureText(msg).width;
      ctx.fillStyle = 'rgba(13,23,32,0.72)';
      PF.roundRect(ctx, W / 2 - tw / 2 - 18, H - 92, tw + 36, 40, 12);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(msg, W / 2, H - 65);
    }

    // Router boost timer.
    if (s.routerTime > 0) {
      var frac = s.routerTime / C.router.duration;
      ctx.fillStyle = 'rgba(13,23,32,0.45)';
      PF.roundRect(ctx, W / 2 - 90, 26, 180, 12, 6);
      ctx.fill();
      ctx.fillStyle = '#2a8fd8';
      PF.roundRect(ctx, W / 2 - 90, 26, 180 * frac, 12, 6);
      ctx.fill();
      ctx.textAlign = 'center';
      hudText(ctx, s, 'ROUTER BOOST', W / 2, 56, '700 13px ' + PF.FONT);
    }
  };

  /* "You've unlocked FLY!" — drawn big, and also announced in the DOM. */
  PF.Renderer.prototype.drawBanner = function (s) {
    if (s.bannerTime <= 0) return;
    var ctx = this.ctx;
    var total = C.transition.bannerTime;
    var age = total - s.bannerTime;
    // Ease in for 0.25s, hold, fade out over the last 0.5s.
    var a = Math.min(1, age / 0.25) * Math.min(1, s.bannerTime / 0.5);
    var rise = (1 - Math.min(1, age / 0.4)) * 24;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = '800 46px ' + PF.FONT;
    var text = C.copy.unlocked(s.bannerStage);
    var tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(13,23,32,0.6)';
    PF.roundRect(ctx, W / 2 - tw / 2 - 28, H / 2 - 66 + rise, tw + 56, 96, 18);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, W / 2, H / 2 - 18 + rise);
    ctx.font = '600 19px ' + PF.FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(s.bannerTagline, W / 2, H / 2 + 14 + rise);
    ctx.restore();
  };

  /* One-shot white wash used for the surface splash. Single fade, no strobe. */
  PF.Renderer.prototype.drawFlash = function (amount) {
    if (amount <= 0.001) return;
    var ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.55, amount * 0.55) + ')';
    ctx.fillRect(0, 0, W, H);
  };

  /* Dim the playfield behind the pause / game-over DOM panels. */
  PF.Renderer.prototype.drawScrim = function (alpha) {
    var ctx = this.ctx;
    ctx.fillStyle = 'rgba(6,16,24,' + alpha + ')';
    ctx.fillRect(0, 0, W, H);
  };
})(window.PF = window.PF || {});
