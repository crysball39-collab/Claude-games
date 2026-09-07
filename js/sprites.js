/* Character and fruit artwork, drawn in arcade pixel units.
   Every routine draws around the origin; the caller translates into place. */
(function (global) {
  'use strict';

  var GHOST_COLORS = {
    blinky: '#ff0000',
    pinky: '#ffb8ff',
    inky: '#00ffff',
    clyde: '#ffb851',
    // the four extra ghosts
    lumo: '#7cff3c',
    vexa: '#b24bff',
    grimm: '#9c9cac',
    nox: '#2e5cc8'
  };
  var FRIGHT_BODY = '#2121ff';
  var FRIGHT_FLASH = '#ffffff';
  var FRIGHT_FACE = '#ffffff';
  var FRIGHT_FLASH_FACE = '#ff0000';
  var EYE_WHITE = '#dedeff';
  var PUPIL = '#2121ff';

  var DIR_VECTORS = {
    right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1]
  };

  /* ------------------------------------------------------------------ */
  /* Pac-Man                                                             */
  /* ------------------------------------------------------------------ */

  var DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

  /**
   * @param {number} mouth 0 = closed circle, 1 = fully open wedge.
   */
  var PAC_R = 6.5;          // the arcade sprite measures 13 pixels across

  function drawPacman(ctx, dir, mouth, color) {
    var half = mouth * 0.25 * Math.PI;   // half-angle of the missing wedge
    var facing = DIR_ANGLE[dir] || 0;
    ctx.fillStyle = color || '#ffff00';
    ctx.beginPath();
    if (half < 0.01) {
      ctx.arc(0, 0, PAC_R, 0, Math.PI * 2);
    } else {
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, PAC_R, facing + half, facing - half);
      ctx.closePath();
    }
    ctx.fill();
  }

  /**
   * Death animation: the mouth opens outward from the facing direction until
   * Pac-Man closes into nothing, then a short burst of rays.
   * @param {number} t progress in [0, 1]
   */
  function drawPacmanDeath(ctx, t, color) {
    ctx.fillStyle = color || '#ffff00';
    if (t < 0.82) {
      var p = t / 0.82;
      // Wedge grows from the "up" direction all the way round.
      var half = p * Math.PI;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, PAC_R, -Math.PI / 2 + half, -Math.PI / 2 - half);
      ctx.closePath();
      ctx.fill();
    } else {
      var burst = (t - 0.82) / 0.18;
      var radius = 2 + burst * 8;
      var len = 2.5 * (1 - burst);
      if (len <= 0) return;
      ctx.strokeStyle = color || '#ffff00';
      ctx.lineWidth = 1.5;
      for (var i = 0; i < 6; i++) {
        var a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
        ctx.lineTo(Math.cos(a) * (radius + len * 2), Math.sin(a) * (radius + len * 2));
        ctx.stroke();
      }
    }
  }

  /* Angry brows for the Rampage Pac mod: a V across the forehead, rotated
     to whichever way he is facing. */
  function drawBrows(ctx, dir) {
    ctx.save();
    // Clip inside the head, leaving a rim so the brow never notches his outline.
    ctx.beginPath();
    ctx.arc(0, 0, PAC_R - 1.2, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(DIR_ANGLE[dir] || 0);
    // One heavy brow on the upper-back of the head, clear of the mouth wedge
    // and slanting down towards it.
    ctx.translate(-1.2, -4.1);
    ctx.rotate(0.62);
    ctx.fillStyle = '#000000';
    ctx.fillRect(-2.9, -1.1, 5.8, 2.2);
    ctx.restore();
  }

  /* The shotgun he pulls out, held along the direction of travel. */
  function drawShotgun(ctx, dir, recoil) {
    ctx.save();
    ctx.rotate(DIR_ANGLE[dir] || 0);
    ctx.translate(-(recoil || 0) * 2, 0);
    ctx.fillStyle = '#5a3a1a';                 // stock
    ctx.fillRect(-1, 1.5, 6, 3);
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(3, 1, 4, 2.5);
    ctx.fillStyle = '#9a9aae';                 // barrel
    ctx.fillRect(4, -1.5, 11, 2.4);
    ctx.fillStyle = '#5a5a6e';                 // pump
    ctx.fillRect(8, 1, 4, 1.6);
    ctx.restore();
  }

  /** Muzzle flash, drawn separately so it can outlive a single frame. */
  function drawMuzzleFlash(ctx, dir, t) {
    ctx.save();
    ctx.rotate(DIR_ANGLE[dir] || 0);
    var k = 1 - t;
    ctx.fillStyle = t < 0.5 ? '#ffffff' : '#ffff00';
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(15 + 7 * k, -4 * k);
    ctx.lineTo(15 + 4 * k, 0);
    ctx.lineTo(15 + 7 * k, 4 * k);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Ghosts                                                              */
  /* ------------------------------------------------------------------ */

  /* Geometry traced from the arcade sprite: 14x14, a shallow dome over a
     straight body, finished with three evenly spaced pointed feet. The two
     animation frames shift the feet by half a step. */
  function ghostBodyPath(ctx, frame) {
    var W = 7, R = 6.6;
    var shoulder = 0.5;                   // where the dome meets the flanks
    var skirtTop = 5, skirtBottom = 7;
    ctx.beginPath();
    ctx.arc(0, -0.4, R, Math.PI, 0);      // dome
    ctx.lineTo(W, shoulder);              // flare out to full width
    ctx.lineTo(W, skirtTop);              // right flank
    // Each entry is [start x, apex x, end x] of one foot, right to left.
    var feet = frame
      ? [[7, 6, 5], [4, 2, 0], [-1, -3, -5], [-6, -7, -7]]
      : [[7, 5, 3], [2, 0, -2], [-3, -5, -7]];
    for (var i = 0; i < feet.length; i++) {
      ctx.lineTo(feet[i][1], skirtBottom);
      ctx.lineTo(feet[i][2], skirtTop);
    }
    ctx.lineTo(-W, skirtTop);
    ctx.lineTo(-W, shoulder);
    ctx.closePath();
  }

  /* Eye whites sit a pixel toward the direction of travel; the pupils lead
     them by another pixel and a half. */
  function drawEyes(ctx, dir, whiteColor, pupilColor) {
    var v = DIR_VECTORS[dir] || [0, 0];
    var ox = v[0], oy = v[1];
    ctx.fillStyle = whiteColor;
    for (var s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.ellipse(s * 3 + ox, -1.5 + oy, 2, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = pupilColor;
    for (var t = -1; t <= 1; t += 2) {
      ctx.fillRect(t * 3 + ox + v[0] * 1.5 - 1, -1.5 + oy + v[1] * 1.5 - 1, 2, 2);
    }
  }

  /**
   * @param {string} name blinky|pinky|inky|clyde
   * @param {string} mode normal|frightened|eaten
   */
  function drawGhost(ctx, name, dir, frame, mode, flashing) {
    if (mode === 'eaten') {
      drawEyes(ctx, dir, EYE_WHITE, PUPIL);
      return;
    }

    if (mode === 'frightened') {
      var body = flashing ? FRIGHT_FLASH : FRIGHT_BODY;
      var face = flashing ? FRIGHT_FLASH_FACE : FRIGHT_FACE;
      ctx.fillStyle = body;
      ghostBodyPath(ctx, frame);
      ctx.fill();
      // Square eyes and a zig-zag mouth.
      ctx.fillStyle = face;
      ctx.fillRect(-3.6, -3, 2, 2);
      ctx.fillRect(1.6, -3, 2, 2);
      ctx.strokeStyle = face;
      ctx.lineWidth = 1;
      ctx.beginPath();
      var y0 = 2.6, amp = 1.6, startX = -5;
      ctx.moveTo(startX, y0);
      for (var i = 1; i <= 5; i++) {
        ctx.lineTo(startX + i * 2, y0 + (i % 2 ? -amp : 0));
      }
      ctx.stroke();
      return;
    }

    ctx.fillStyle = GHOST_COLORS[name] || '#ff0000';
    ghostBodyPath(ctx, frame);
    ctx.fill();
    drawEyes(ctx, dir, EYE_WHITE, PUPIL);
  }

  /* ------------------------------------------------------------------ */
  /* Fruit                                                               */
  /* ------------------------------------------------------------------ */

  function disc(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Fruit that appears on level 1, traced pixel-for-pixel from the arcade
     capture: 12x12, tan stems, red cherries with a highlight. */
  var CHERRY_PIXELS = [
    '..........11', '........1111', '......11.1..', '.....1...1..',
    '.2221...1...', '222122.1....', '22222.2122..', '2322.221222.',
    '2232.222222.', '.222.232222.', '.....223222.', '......2222..'
  ];
  var CHERRY_PALETTE = { '1': '#de9751', '2': '#ff0000', '3': '#dedeff' };

  /** Draw a character-map sprite centred on the origin, one unit per pixel. */
  function drawPixelSprite(ctx, rows, palette) {
    var h = rows.length, w = rows[0].length;
    var ox = -Math.floor(w / 2), oy = -Math.floor(h / 2);
    for (var y = 0; y < h; y++) {
      var row = rows[y], run = -1, key = null;
      for (var x = 0; x <= w; x++) {
        var ch = x < w ? row[x] : '.';
        if (ch !== key) {
          if (key && key !== '.') {
            ctx.fillStyle = palette[key];
            ctx.fillRect(ox + run, oy + y, x - run, 1);
          }
          key = ch; run = x;
        }
      }
    }
  }

  var FRUIT_ART = {
    cherry: function (ctx) {
      drawPixelSprite(ctx, CHERRY_PIXELS, CHERRY_PALETTE);
    },
    strawberry: function (ctx) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.moveTo(-5, -2); ctx.quadraticCurveTo(-5, 6, 0, 7);
      ctx.quadraticCurveTo(5, 6, 5, -2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#00d000'; ctx.fillRect(-5, -4, 10, 2);
      ctx.fillRect(-1, -7, 2, 3);
      ctx.fillStyle = '#ffffff';
      var pts = [[-3, 0], [0, 1], [3, 0], [-2, 3], [2, 3], [0, 5]];
      for (var i = 0; i < pts.length; i++) ctx.fillRect(pts[i][0], pts[i][1], 1, 1);
    },
    orange: function (ctx) {
      disc(ctx, 0, 2, 5, '#ffb851');
      ctx.fillStyle = '#00d000'; ctx.fillRect(-1, -5, 2, 3);
      ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(6, -6); ctx.lineTo(2, -2); ctx.closePath(); ctx.fill();
    },
    apple: function (ctx) {
      ctx.fillStyle = '#ff0000';
      ctx.beginPath();
      ctx.arc(-2.6, 2, 3.6, 0, Math.PI * 2);
      ctx.arc(2.6, 2, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-2.6, -1.4, 5.2, 5);
      ctx.strokeStyle = '#a05000'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(1, -6); ctx.stroke();
      ctx.fillStyle = '#00d000';
      ctx.beginPath(); ctx.ellipse(3.4, -5, 2.6, 1.3, -0.4, 0, Math.PI * 2); ctx.fill();
    },
    melon: function (ctx) {
      disc(ctx, 0, 1.5, 5.2, '#8ce800');
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8;
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(i * 2.6, -3.4); ctx.lineTo(i * 2.6, 6.4); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-5, 1.5); ctx.lineTo(5, 1.5); ctx.stroke();
      ctx.fillStyle = '#00d000'; ctx.fillRect(-1, -7, 2, 3);
    },
    galaxian: function (ctx) {
      ctx.fillStyle = '#ffff00';
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(2, -1); ctx.lineTo(-2, -1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2121ff';
      ctx.beginPath(); ctx.moveTo(-6, 5); ctx.lineTo(-2, -2); ctx.lineTo(-2, 5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6, 5); ctx.lineTo(2, -2); ctx.lineTo(2, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff0000'; ctx.fillRect(-1.5, -1, 3, 6);
    },
    bell: function (ctx) {
      ctx.fillStyle = '#ffe500';
      ctx.beginPath();
      ctx.moveTo(-5.5, 4);
      ctx.quadraticCurveTo(-5, -6, 0, -6);
      ctx.quadraticCurveTo(5, -6, 5.5, 4);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(-6, 4, 12, 1.6);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-4, -3, 1.4, 5);
      ctx.fillStyle = '#2121ff'; ctx.fillRect(-1.4, 5.6, 2.8, 2);
    },
    key: function (ctx) {
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(-1, -2, 2, 8);
      ctx.fillRect(0, 3, 3.4, 1.4);
      ctx.fillRect(0, 5.4, 3.4, 1.4);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, -4, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.arc(0, -4, 1.3, 0, Math.PI * 2); ctx.fill();
    }
  };

  function drawFruit(ctx, name) {
    var fn = FRUIT_ART[name];
    if (fn) fn(ctx);
  }

  global.Sprites = {
    GHOST_COLORS: GHOST_COLORS,
    drawBrows: drawBrows,
    drawShotgun: drawShotgun,
    drawMuzzleFlash: drawMuzzleFlash,
    drawPacman: drawPacman,
    drawPacmanDeath: drawPacmanDeath,
    drawGhost: drawGhost,
    drawFruit: drawFruit
  };
})(window);

/* ---------------------------------------------------------------------- */
/* Pixel rasterisation                                                     */
/*                                                                          */
/* The arcade has no anti-aliasing: every sprite pixel is one of a handful  */
/* of palette entries. The vector artwork above is drawn once into a 1x     */
/* buffer, its alpha is thresholded and its colours snapped to the palette, */
/* giving hard-edged bitmaps that scale up as crisp blocks.                 */
/* ---------------------------------------------------------------------- */
(function (global) {
  'use strict';

  var S = global.Sprites;

  var PALETTE = [
    [0, 0, 0], [33, 33, 255], [255, 184, 174], [222, 222, 255], [255, 255, 0],
    [255, 0, 0], [255, 184, 255], [0, 255, 255], [255, 184, 81], [222, 151, 81],
    [255, 255, 255], [0, 208, 0], [0, 160, 0], [140, 232, 0], [255, 229, 0],
    [160, 80, 0],
    // gunmetal and wood, for the Rampage Pac shotgun
    [154, 154, 174], [90, 90, 110], [90, 58, 26], [138, 90, 42],
    // the extra ghosts - lime, purple, grey, dark blue
    [124, 255, 60], [178, 75, 255], [156, 156, 172], [46, 92, 200]
  ];

  var SPRITE = 16;            // every character fits inside a 16x16 cell
  var ALPHA_CUT = 110;        // coverage at which a pixel counts as solid
  var cache = {};

  function snap(r, g, b) {
    var best = PALETTE[0], bestD = Infinity;
    for (var i = 0; i < PALETTE.length; i++) {
      var p = PALETTE[i];
      var d = (p[0] - r) * (p[0] - r) + (p[1] - g) * (p[1] - g) + (p[2] - b) * (p[2] - b);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /** Draw `fn` centred in a size x size buffer and harden it to pixel art. */
  function rasterize(size, fn) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.save();
    x.translate(size / 2, size / 2);
    fn(x);
    x.restore();

    var img = x.getImageData(0, 0, size, size);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] < ALPHA_CUT) { d[i + 3] = 0; continue; }
      var p = snap(d[i], d[i + 1], d[i + 2]);
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  function get(key, fn, size) {
    if (!cache[key]) cache[key] = rasterize(size || SPRITE, fn);
    return cache[key];
  }

  /* Mouth is quantised to the arcade's animation steps. */
  var MOUTH_STEPS = [0, 0.34, 0.67, 1];

  /**
   * @param {object} [opts] { angry, armed } - the Rampage Pac variants
   */
  function pacman(dir, mouth, opts) {
    var angry = opts && opts.angry, armed = opts && opts.armed;
    var step = Math.max(0, Math.min(3, Math.round(mouth * 3)));
    // A closed mouth has no facing, unless a brow or gun gives him one.
    var d = (step === 0 && !angry && !armed) ? 'x' : dir;
    var key = 'pac:' + d + step + (angry ? 'a' : '') + (armed ? 'g' : '');
    return get(key, function (ctx) {
      if (armed) S.drawShotgun(ctx, dir, 0);
      S.drawPacman(ctx, dir, MOUTH_STEPS[step]);
      if (angry) S.drawBrows(ctx, dir);
    }, armed ? 40 : SPRITE);
  }

  function muzzleFlash(dir, t) {
    var f = Math.max(0, Math.min(3, Math.round(t * 3)));
    return get('flash:' + dir + f, function (ctx) {
      S.drawMuzzleFlash(ctx, dir, f / 3);
    }, 48);
  }

  function lifeIcon() {
    return get('life', function (ctx) {
      ctx.scale(0.85, 0.85);
      S.drawPacman(ctx, 'left', 0.75);
    });
  }

  function death(step) {
    var t = Math.max(0, Math.min(1, step / 11));
    return get('death:' + Math.round(t * 11), function (ctx) {
      S.drawPacmanDeath(ctx, t);
    }, 22);
  }

  function ghost(name, dir, frame, mode, flashing) {
    var key = mode === 'normal' ? 'g:' + name + dir + frame
            : mode === 'eaten' ? 'g:eyes' + dir
            : 'g:fr' + (flashing ? 1 : 0) + frame;
    return get(key, function (ctx) {
      S.drawGhost(ctx, name, dir, frame, mode, flashing);
    });
  }

  function fruit(name) {
    return get('fruit:' + name, function (ctx) { S.drawFruit(ctx, name); });
  }

  /** Blit a cached bitmap centred on (x, y), snapped to whole pixels. */
  function blit(ctx, bmp, x, y) {
    ctx.drawImage(bmp, Math.round(x - bmp.width / 2), Math.round(y - bmp.height / 2));
  }

  S.Pixel = {
    pacman: pacman, ghost: ghost, fruit: fruit, death: death,
    muzzleFlash: muzzleFlash,
    lifeIcon: lifeIcon, blit: blit, rasterize: rasterize
  };
})(window);
