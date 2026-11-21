'use strict';
/* =============================================================================
   Icons for the menus and cards, the chest, the chapter banner and the hero
   preview. Icons are drawn on a 64 x 64 grid and turned into data URLs once,
   so the DOM can show them as plain <img>s.
   ========================================================================== */

const ICON = {};

function iconURL(draw, size = 64, res = 2) {
  const c = mkCanvas(size * res, size * res), g = c.getContext('2d');
  g.scale(res, res); g.lineJoin = 'round'; g.lineCap = 'round';
  draw(g, size);
  return c.toDataURL('image/png');
}

/* ------------------------------ ability icons ---------------------------- */

function icGuardian(g, evo) {
  g.save(); g.translate(32, 32);
  g.beginPath(); g.arc(0, 0, 21, 0.3, 2.6); g.lineWidth = 3; g.strokeStyle = evo ? 'rgba(255,90,90,0.8)' : 'rgba(220,235,255,0.75)'; g.stroke();
  g.beginPath(); g.arc(0, 0, 21, 3.4, 5.8); g.stroke();
  g.save(); g.translate(-13, -11); g.scale(1.25, 1.25); drawBlade(g, evo); g.restore();
  g.save(); g.translate(13, 12); g.scale(1.25, 1.25); drawBlade(g, evo); g.restore();
  if (evo) { g.save(); g.translate(14, -15); g.scale(0.8, 0.8); drawBlade(g, evo); g.restore(); }
  circ(g, 0, 0, 5, '#2fa596', 1.8);
  g.restore();
}
function icForcefield(g, evo) {
  const c = evo ? ['rgba(255,80,80,0.25)', '#ff5a5a', '#ffd0d0'] : ['rgba(90,255,120,0.22)', '#55f07a', '#d8ffe0'];
  circ(g, 32, 32, 25, c[0], 0);
  g.beginPath(); g.arc(32, 32, 25, 0, TAU); g.lineWidth = 3.5; g.strokeStyle = c[1]; g.stroke();
  g.setLineDash([5, 5]); g.beginPath(); g.arc(32, 32, 17, 0, TAU); g.lineWidth = 2; g.strokeStyle = c[2]; g.stroke(); g.setLineDash([]);
  circ(g, 32, 30, 6, '#f2c39b', 1.8);
  rr(g, 26, 35, 12, 10, 4, '#2fa596', 1.8);
  if (evo) for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.6; seg(g, 32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28, 32 + Math.cos(a) * 21, 32 + Math.sin(a) * 21, '#7fd0ff', 2.5); }
}
function icDurian(g, evo) { g.save(); g.translate(32, 32); g.scale(1.35, 1.35); drawDurian(g, evo); g.restore(); if (evo) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; g.save(); g.translate(32 + Math.cos(a) * 29, 32 + Math.sin(a) * 29); g.rotate(a); g.scale(0.6, 0.6); drawSpike(g); g.restore(); } }
function icMissile(g, evo) {
  g.save(); g.translate(30, 34); g.rotate(-0.75);
  const c = evo ? ['#c77dff', '#7f1fd0'] : ['#ffd25a', '#ff6a1a'];
  g.beginPath(); g.moveTo(-14, 0); g.lineTo(-30, -6); g.lineTo(-26, 0); g.lineTo(-30, 6); g.closePath(); g.fillStyle = c[1]; g.fill();
  g.beginPath(); g.moveTo(-14, 0); g.lineTo(-24, -3); g.lineTo(-24, 3); g.closePath(); g.fillStyle = c[0]; g.fill();
  g.scale(1.7, 1.7); drawMissile(g, evo);
  g.restore();
}
function icMolotov(g, evo) {
  if (evo) {
    g.save(); g.translate(32, 36); g.scale(1.6, 1.6); drawCanister(g); g.restore();
    g.save(); g.translate(46, 22); g.scale(0.8, 0.8); drawFlame(g, 0, FLAME_PALS.blue); g.restore();
    g.save(); g.translate(16, 58); g.scale(0.9, 0.7); drawFlame(g, 1, FLAME_PALS.blue); g.restore();
  } else {
    g.save(); g.translate(16, 60); g.scale(0.9, 0.7); drawFlame(g, 1, FLAME_PALS.orange); g.restore();
    g.save(); g.translate(34, 38); g.rotate(0.35); g.scale(1.6, 1.6); drawMolotov(g); g.restore();
  }
}

/* ------------------------------- buff icons ------------------------------ */

function icGoldBand(g) {
  g.beginPath(); g.ellipse(32, 36, 19, 15, 0, 0, TAU); g.lineWidth = 11; g.strokeStyle = OUT; g.stroke();
  g.lineWidth = 7.5; g.strokeStyle = '#f5c242'; g.stroke();
  g.beginPath(); g.ellipse(32, 36, 19, 15, 0, 3.6, 5.2); g.lineWidth = 2.5; g.strokeStyle = '#fff2b0'; g.stroke();
  poly(g, [32, 12, 41, 19, 32, 27, 23, 19], '#ff4f6d', 2);
  poly(g, [32, 12, 32, 27, 23, 19], '#ff8aa0', 0);
}
function icFuel(g) {
  rr(g, 15, 18, 34, 38, 6, '#d63b2f', 2.2);
  rr(g, 15, 18, 34, 7, 3, '#ef5a4c', 0);
  rr(g, 36, 10, 10, 10, 3, '#3a3f46', 2);
  rr(g, 18, 12, 14, 7, 3, '#a8261d', 2);
  rr(g, 21, 30, 22, 14, 3, '#f2c230', 1.8);
  g.fillStyle = OUT; g.font = '900 11px Arial Black, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('HE', 32, 37.5);
}
function icSharpener(g) {
  g.save(); g.translate(32, 32); g.rotate(-0.6);
  rr(g, -22, 6, 44, 12, 3, '#8d939b', 2);
  rr(g, -22, 6, 44, 4, 2, '#b3b9c0', 0);
  poly(g, [-18, 3, 20, -14, 24, -10, -16, 6], '#e9eef3', 2);
  rr(g, -28, 0, 12, 7, 2, '#7a4a2a', 1.8);
  g.restore();
  for (const [x, y, a] of [[44, 18, 0.2], [50, 26, 0.6], [40, 12, -0.4]]) { g.save(); g.translate(x, y); g.rotate(a); star(g, 0, 0, 4.5, 1.6, 4, 0, '#ffd84a', 1); g.restore(); }
}
function icEnergy(g) {
  rr(g, 20, 12, 24, 42, 6, '#2f9e44', 2.2);
  rr(g, 20, 12, 24, 6, 3, '#c9d0d7', 1.6);
  rr(g, 20, 48, 24, 6, 3, '#c9d0d7', 1.6);
  rr(g, 21, 18, 6, 30, 2, 'rgba(255,255,255,0.22)', 0);
  poly(g, [35, 20, 26, 35, 32, 35, 29, 47, 39, 30, 33, 30], '#ffe14a', 1.8);
}
function icArmor(g) {
  poly(g, [18, 14, 26, 10, 32, 15, 38, 10, 46, 14, 50, 30, 46, 54, 18, 54, 14, 30], '#4a5563', 2.2);
  poly(g, [26, 10, 32, 15, 38, 10, 36, 24, 28, 24], '#2f3740', 1.6);
  for (let i = 0; i < 4; i++) {
    rr(g, 19 + i * 7, 34, 5.5, 13, 2, '#e0433a', 1.4);
    rr(g, 19 + i * 7, 43, 5.5, 4, 1, '#d9b24a', 0);
  }
  seg(g, 16, 32, 48, 32, '#2a313a', 2.5);
}

/* ------------------------------- gear icons ------------------------------ */

const LEATHER = '#8a5a35', LEATHER_D = '#6b4226', LEATHER_L = '#a8744a', STITCH = '#e8d7b0';
function stitches(g, pts) { g.setLineDash([2.5, 2.5]); poly(g, pts, null, 0, false); g.lineWidth = 1.3; g.strokeStyle = STITCH; g.stroke(); g.setLineDash([]); }

function icShuriken(g) { g.save(); g.translate(32, 32); g.rotate(0.3); g.scale(2.3, 2.3); drawShuriken(g); g.restore(); }
function icGloves(g) {
  poly(g, [18, 54, 16, 30, 20, 16, 25, 16, 26, 28, 29, 12, 34, 12, 35, 27, 38, 14, 43, 15, 42, 30, 48, 24, 52, 28, 44, 42, 44, 54], LEATHER, 2.2);
  rr(g, 16, 48, 30, 9, 3, LEATHER_D, 2);
  stitches(g, [20, 44, 42, 44]);
  poly(g, [38, 36, 42, 39, 38, 41], '#3a2516', 0);
  seg(g, 25, 33, 28, 38, '#3a2516', 1.6);
}
function icNecklace(g) {
  g.beginPath(); g.moveTo(12, 10); g.quadraticCurveTo(14, 40, 32, 42); g.quadraticCurveTo(50, 40, 52, 10);
  g.lineWidth = 5; g.strokeStyle = OUT; g.stroke(); g.lineWidth = 2.6; g.strokeStyle = LEATHER_L; g.stroke();
  for (const [x, y] of [[17, 30], [47, 30]]) circ(g, x, y, 2.8, '#c9b48a', 1.3);
  poly(g, [32, 40, 39, 47, 32, 60, 25, 47], '#e8dfc6', 2);
  seg(g, 30, 46, 33, 52, 'rgba(0,0,0,0.25)', 1.2);
  circ(g, 32, 41, 3.2, LEATHER_D, 1.4);
}
function icChest(g) {
  poly(g, [14, 18, 24, 12, 32, 18, 40, 12, 50, 18, 54, 34, 50, 56, 14, 56, 10, 34], LEATHER, 2.2);
  poly(g, [24, 12, 32, 18, 40, 12, 38, 28, 26, 28], LEATHER_D, 1.8);
  stitches(g, [32, 30, 32, 54]);
  stitches(g, [16, 40, 48, 40]);
  poly(g, [42, 46, 47, 50, 44, 54, 40, 50], '#3a2516', 0);
  poly(g, [18, 24, 22, 28, 18, 30], '#3a2516', 0);
}
function icHelmet(g) {
  g.beginPath(); g.moveTo(10, 44); g.bezierCurveTo(10, 10, 54, 10, 54, 44); g.closePath();
  g.fillStyle = LEATHER; g.fill(); strokeOut(g, 2.2);
  rr(g, 8, 42, 48, 9, 4, LEATHER_D, 2);
  stitches(g, [32, 16, 32, 42]);
  circ(g, 22, 30, 6, '#ffb03b', 2); circ(g, 40, 30, 6, '#ffb03b', 2);
  seg(g, 28, 30, 34, 30, OUT, 2.5);
  circ(g, 20.5, 28.5, 1.6, '#fff8dc', 0); circ(g, 38.5, 28.5, 1.6, '#fff8dc', 0);
  poly(g, [46, 18, 50, 22, 47, 24], '#3a2516', 0);
}
function icBelt(g) {
  g.save(); g.translate(32, 32); g.rotate(-0.25);
  rr(g, -28, -7, 56, 14, 4, LEATHER, 2.2);
  stitches(g, [-25, -3, 25, -3]); stitches(g, [-25, 3, 25, 3]);
  rr(g, -9, -11, 18, 22, 3, '#c9a24a', 2.2);
  rr(g, -4.5, -6.5, 9, 13, 2, LEATHER_D, 1.6);
  seg(g, 0, -6, 0, 6, '#e9d9a0', 2);
  circ(g, 18, 0, 1.6, '#2a1d14', 0); circ(g, 23, 0, 1.6, '#2a1d14', 0);
  g.restore();
}

/* ------------------------------ misc icons ------------------------------- */

function icCoin(g) {
  circ(g, 32, 34, 24, '#c98a12', 2.4);
  circ(g, 32, 31, 24, '#ffcc33', 2.4);
  circ(g, 32, 31, 17, '#f2b416', 1.6);
  star(g, 32, 31, 10, 4.2, 5, -Math.PI / 2, '#fff0a8', 1.6);
}
function icGemPremium(g) {
  poly(g, [16, 22, 24, 12, 40, 12, 48, 22, 32, 54], '#ff4fa3', 2.4);
  poly(g, [16, 22, 48, 22, 32, 54], '#e0307f', 0);
  poly(g, [24, 12, 32, 22, 40, 12], '#ffa3d0', 0);
  poly(g, [16, 22, 24, 12, 32, 22], '#ff79bb', 0);
  poly(g, [16, 22, 24, 12, 40, 12, 48, 22, 32, 54], null, 2.4);
  seg(g, 16, 22, 48, 22, OUT, 1.4);
  poly(g, [22, 24, 30, 24, 28, 38], 'rgba(255,255,255,0.45)', 0);
}
function icSkull(g) {
  g.beginPath(); g.moveTo(14, 30); g.bezierCurveTo(14, 8, 50, 8, 50, 30); g.lineTo(46, 40); g.lineTo(44, 50); g.lineTo(20, 50); g.lineTo(18, 40); g.closePath();
  g.fillStyle = '#f2ecdc'; g.fill(); strokeOut(g, 2.4);
  ell(g, 24.5, 31, 5.5, 6, OUT, 0); ell(g, 39.5, 31, 5.5, 6, OUT, 0);
  poly(g, [32, 37, 29, 43, 35, 43], OUT, 0);
  for (const x of [26, 32, 38]) seg(g, x, 45, x, 50, OUT, 1.6);
}
function icMeat(g) {
  ell(g, 28, 28, 17, 14, '#b5502a', 2.2, -0.6);
  ell(g, 25, 25, 9, 6, '#d9774a', 0, -0.6);
  limb(g, 38, 38, 50, 50, 5, '#f2ecdc');
  circ(g, 51, 47, 4, '#f2ecdc', 1.8); circ(g, 47, 52, 4, '#f2ecdc', 1.8);
}
function icGoldBag(g) {
  g.beginPath(); g.moveTo(24, 22); g.bezierCurveTo(6, 34, 10, 56, 32, 56); g.bezierCurveTo(54, 56, 58, 34, 40, 22); g.closePath();
  g.fillStyle = '#b98a4a'; g.fill(); strokeOut(g, 2.2);
  poly(g, [24, 22, 20, 12, 28, 16, 32, 10, 36, 16, 44, 12, 40, 22], '#a0763c', 2);
  seg(g, 22, 22, 42, 22, '#6b4a24', 3);
  g.save(); g.translate(32, 40); g.scale(0.42, 0.42); g.translate(-32, -32); icCoin(g); g.restore();
}
function icSwords(g) {
  for (const s of [-1, 1]) {
    g.save(); g.translate(32, 34); g.scale(s, 1); g.rotate(-0.78);
    poly(g, [-3, -26, 0, -30, 3, -26, 3, 8, -3, 8], '#dfe6ec', 2);
    seg(g, 0, -24, 0, 6, 'rgba(255,255,255,0.6)', 1);
    rr(g, -9, 8, 18, 5, 2, '#f2c230', 1.8);
    rr(g, -2.5, 13, 5, 10, 2, '#7a4a2a', 1.6);
    circ(g, 0, 25, 3, '#f2c230', 1.6);
    g.restore();
  }
}
function icGear(g) {
  star(g, 32, 32, 22, 17, 8, 0, '#c9d0d7', 2.2);
  circ(g, 32, 32, 13, '#9aa3ad', 2);
  circ(g, 32, 32, 6, '#3a3f46', 2);
}
function icPause(g) { rr(g, 18, 14, 10, 36, 3, '#ffffff', 2.2); rr(g, 36, 14, 10, 36, 3, '#ffffff', 2.2); }
function icLock(g) { g.beginPath(); g.arc(32, 26, 10, Math.PI, TAU); g.lineWidth = 7; g.strokeStyle = OUT; g.stroke(); g.lineWidth = 4; g.strokeStyle = '#c9d0d7'; g.stroke(); rr(g, 18, 26, 28, 22, 4, '#f2c230', 2.2); circ(g, 32, 36, 3, OUT, 0); }

/* --------------------------------- chests -------------------------------- */

function drawChestArt(g, open, glowAmt = 0) {
  // 160 x 140 grid, a blue chest with gold trim
  const blue = '#2f6fe0', blueD = '#1f4ea6', blueL = '#6aa1ff', gold = '#f5c242', goldD = '#b9861d';
  g.save(); g.translate(80, 78);
  ell(g, 0, 50, 62, 10, 'rgba(0,0,0,0.35)', 0);
  if (open && glowAmt > 0) {
    g.save(); g.globalAlpha = glowAmt;
    g.fillStyle = radial(g, 0, -10, 90, [[0, 'rgba(255,250,210,1)'], [0.4, 'rgba(140,200,255,0.6)'], [1, 'rgba(80,140,255,0)']]);
    g.beginPath(); g.arc(0, -10, 90, 0, TAU); g.fill();
    g.restore();
  }
  // body
  rr(g, -52, -6, 104, 54, 8, blue, 3);
  rr(g, -52, -6, 104, 12, 6, blueL, 0);
  rr(g, -52, 34, 104, 14, 6, blueD, 0);
  rr(g, -52, -6, 104, 54, 8, null, 3);
  for (const x of [-40, 30]) rr(g, x, -6, 10, 54, 2, gold, 2.4);
  rr(g, -52, -6, 104, 7, 3, gold, 2.4);
  if (open) {
    // inside and the lid tipped back
    rr(g, -48, -14, 96, 12, 5, '#0f2350', 2.4);
    g.save(); g.translate(0, -12);
    g.beginPath(); g.moveTo(-54, 0); g.lineTo(-46, -36); g.lineTo(46, -36); g.lineTo(54, 0); g.closePath();
    g.fillStyle = blueD; g.fill(); strokeOut(g, 3);
    for (const x of [-38, 28]) poly(g, [x - 1.5, 0, x + 2, -36, x + 11, -36, x + 9.5, 0], gold, 2.2);
    g.restore();
  } else {
    // domed lid
    g.beginPath(); g.moveTo(-54, -4); g.lineTo(-54, -22); g.bezierCurveTo(-50, -54, 50, -54, 54, -22); g.lineTo(54, -4); g.closePath();
    g.fillStyle = blue; g.fill(); strokeOut(g, 3);
    g.save(); g.clip(); ell(g, -10, -40, 40, 10, 'rgba(255,255,255,0.22)', 0); g.restore();
    for (const x of [-40, 30]) { g.beginPath(); g.moveTo(x, -4); g.lineTo(x, -30 - (x < 0 ? 4 : 6)); g.lineTo(x + 10, -32 - (x < 0 ? 6 : 4)); g.lineTo(x + 10, -4); g.closePath(); g.fillStyle = gold; g.fill(); strokeOut(g, 2.4); }
    rr(g, -54, -10, 108, 8, 3, gold, 2.4);
    // lock
    rr(g, -10, -14, 20, 22, 4, gold, 2.6);
    rr(g, -10, -14, 20, 6, 3, '#ffe38a', 0);
    rr(g, -10, -14, 20, 22, 4, null, 2.6);
    circ(g, 0, -4, 3, goldD, 0);
    poly(g, [-1.5, -3, 1.5, -3, 2.5, 4, -2.5, 4], goldD, 0);
  }
  g.restore();
}

/* ---------------------------- chapter banner ----------------------------- */

function drawCityBanner(c) {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2a1d47'); sky.addColorStop(0.55, '#8a3b55'); sky.addColorStop(0.85, '#e0703f'); sky.addColorStop(1, '#f2a04a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  // sun low behind the towers
  g.fillStyle = radial(g, w * 0.66, h * 0.78, h * 0.55, [[0, 'rgba(255,220,140,0.95)'], [0.25, 'rgba(255,170,90,0.6)'], [1, 'rgba(255,120,60,0)']]);
  g.fillRect(0, 0, w, h);
  const rnd = mulberry32(7);
  const layer = (base, hmin, hmax, color, windows) => {
    let x = -10;
    while (x < w + 10) {
      const bw = (18 + rnd() * 34) * w / 360, bh = (hmin + rnd() * (hmax - hmin)) * h;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x, h - bh);
      // broken tops
      const steps = 2 + Math.floor(rnd() * 3);
      for (let i = 1; i <= steps; i++) g.lineTo(x + bw * i / steps, h - bh + (rnd() - 0.3) * bh * 0.25);
      g.lineTo(x + bw, h);
      g.closePath(); g.fill();
      if (windows) {
        for (let wy = h - bh + 8; wy < h - 6; wy += 9) for (let wx = x + 4; wx < x + bw - 4; wx += 7) {
          const r = rnd();
          if (r < 0.1) { g.fillStyle = 'rgba(255,200,110,0.85)'; g.fillRect(wx, wy, 3, 4); }
          else if (r < 0.5) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(wx, wy, 3, 4); }
        }
      }
      x += bw + rnd() * 6;
    }
    void base;
  };
  layer(0, 0.35, 0.7, 'rgba(80,40,80,0.75)', false);
  layer(0, 0.25, 0.55, '#3a2440', true);
  layer(0, 0.12, 0.3, '#1d1428', true);
  // a crooked street lamp and a road sign in the foreground
  g.strokeStyle = '#120c18'; g.lineWidth = Math.max(2, w / 160);
  g.beginPath(); g.moveTo(w * 0.12, h); g.lineTo(w * 0.13, h * 0.5); g.quadraticCurveTo(w * 0.15, h * 0.42, w * 0.2, h * 0.45); g.stroke();
  g.fillStyle = '#120c18'; g.fillRect(w * 0.88, h * 0.55, w * 0.012, h * 0.45);
  g.save(); g.translate(w * 0.886, h * 0.55); g.rotate(0.2); g.fillRect(-w * 0.05, -h * 0.07, w * 0.1, h * 0.08); g.restore();
  // haze
  const fog = g.createLinearGradient(0, h * 0.6, 0, h);
  fog.addColorStop(0, 'rgba(30,18,40,0)'); fog.addColorStop(1, 'rgba(20,14,28,0.85)');
  g.fillStyle = fog; g.fillRect(0, 0, w, h);
}

/* ---------------------------- small renderers ---------------------------- */

/* Draw one sprite frame centred into a canvas element (menus, previews). */
function paintSpriteInto(canvas, spr, fit = 0.9, yBias = 0) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  const s = Math.min(canvas.width / spr.c.width, canvas.height / spr.c.height) * fit;
  const dw = spr.c.width * s, dh = spr.c.height * s;
  g.imageSmoothingQuality = 'high';
  g.drawImage(spr.c, (canvas.width - dw) / 2, (canvas.height - dh) / 2 + yBias * canvas.height, dw, dh);
}

function buildIcons() {
  ICON.guardian = iconURL(g => icGuardian(g, false));
  ICON.guardian_evo = iconURL(g => icGuardian(g, true));
  ICON.forcefield = iconURL(g => icForcefield(g, false));
  ICON.forcefield_evo = iconURL(g => icForcefield(g, true));
  ICON.durian = iconURL(g => icDurian(g, false));
  ICON.durian_evo = iconURL(g => icDurian(g, true));
  ICON.missile = iconURL(g => icMissile(g, false));
  ICON.missile_evo = iconURL(g => icMissile(g, true));
  ICON.molotov = iconURL(g => icMolotov(g, false));
  ICON.molotov_evo = iconURL(g => icMolotov(g, true));
  ICON.goldband = iconURL(icGoldBand);
  ICON.fuel = iconURL(icFuel);
  ICON.sharpener = iconURL(icSharpener);
  ICON.energy = iconURL(icEnergy);
  ICON.armor = iconURL(icArmor);
  ICON.wood_shuriken = iconURL(icShuriken);
  ICON.torn_gloves = iconURL(icGloves);
  ICON.torn_necklace = iconURL(icNecklace);
  ICON.torn_chest = iconURL(icChest);
  ICON.torn_helmet = iconURL(icHelmet);
  ICON.torn_belt = iconURL(icBelt);
  ICON.coin = iconURL(icCoin);
  ICON.gem = iconURL(icGemPremium);
  ICON.skull = iconURL(icSkull);
  ICON.meat = iconURL(icMeat);
  ICON.goldbag = iconURL(icGoldBag);
  ICON.swords = iconURL(icSwords);
  ICON.gear = iconURL(icGear);
  ICON.pause = iconURL(icPause);
  ICON.lock = iconURL(icLock);
  ICON.chest = iconURL(g => { g.scale(0.4, 0.4); g.translate(0, 8); drawChestArt(g, false); }, 64, 2);
  ICON.chestBig = iconURL(g => drawChestArt(g, false), 160, 2);
  ICON.chestOpen = iconURL(g => drawChestArt(g, true, 1), 160, 2);
  // empty-slot silhouettes
  const ghost = fn => iconURL(g => { g.globalAlpha = 0.22; fn(g); });
  ICON.slot_weapon = ghost(icShuriken);
  ICON.slot_gloves = ghost(icGloves);
  ICON.slot_accessory = ghost(icNecklace);
  ICON.slot_chest = ghost(icChest);
  ICON.slot_helmet = ghost(icHelmet);
  ICON.slot_belt = ghost(icBelt);
}
