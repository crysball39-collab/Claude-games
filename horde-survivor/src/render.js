'use strict';
/* =============================================================================
   Drawing. World units are scaled so every screen shows about the same area
   of street, on a phone held upright or a monitor.
   ========================================================================== */

let canvas = null, ctx = null, DPR = 1;
const DL = [], FLY = [];

function resize() {
  const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * DPR); canvas.height = Math.round(h * DPR);
  VIEW.cssW = w; VIEW.cssH = h;
  VIEW.scale = clamp(Math.sqrt(w * h / 360000), 0.62, 2.4);
  VIEW.w = w / VIEW.scale; VIEW.h = h / VIEW.scale;
  const res = clamp(Math.round(DPR * VIEW.scale * 4) / 4, 1, 3);
  if (!SPR.player || Math.abs(res - RES) >= 0.5) buildSprites(res);
  setChunkRes(clamp(Math.round(DPR * VIEW.scale * 2) / 2, 1, 2));
  measureHud();
}
function measureHud() {
  const hh = UI.hudHeight();
  VIEW.hudTop = (hh > 0 ? hh : 104) / VIEW.scale;
}

function worldTransform(cx, cy) {
  const s = VIEW.scale * DPR;
  ctx.setTransform(s, 0, 0, s, canvas.width / 2 - cx * s, canvas.height / 2 - cy * s);
}

/* ------------------------------- the menu -------------------------------- */

const menuBg = { x: 300, y: 300, walkers: null };
function renderMenu(dt) {
  menuBg.x += dt * 16; menuBg.y += dt * 7;
  const cx = menuBg.x, cy = menuBg.y;
  worldTransform(cx, cy);
  const L = cx - VIEW.w / 2, T = cy - VIEW.h / 2;
  drawGround(ctx, L, T, L + VIEW.w, T + VIEW.h);
  if (!menuBg.walkers) {
    menuBg.walkers = [];
    for (let i = 0; i < 12; i++) menuBg.walkers.push({ x: rand(0, 1), y: rand(0, 1), t: ['zombie', 'zombie', 'zombie', 'butterfly', 'beetle'][i % 5], sp: rand(10, 22), a: Math.random() * 4, dir: Math.random() < 0.5 ? -1 : 1 });
  }
  const list = menuBg.walkers.slice().sort((a, b) => a.y - b.y);
  for (const w of list) {
    w.x += w.dir * w.sp * dt / VIEW.w; w.a += dt * (w.t === 'butterfly' ? 12 : w.sp / 8);
    if (w.x < -0.1) w.x = 1.1; if (w.x > 1.1) w.x = -0.1;
    const x = L + w.x * VIEW.w, y = T + 0.15 * VIEW.h + w.y * VIEW.h * 0.8;
    const fr = (w.t === 'zombie' ? SPR.zombie : w.t === 'butterfly' ? SPR.butterfly : SPR.beetle)[Math.floor(w.a) % 4];
    drawSpr(ctx, SPR.shadow, x, y + (w.t === 'butterfly' ? 14 : 0), 0.9);
    drawSpr(ctx, w.dir > 0 ? fr.r : fr.l, x, y - (w.t === 'butterfly' ? 6 : 0));
  }
}

/* -------------------------------- the run -------------------------------- */

function renderRun() {
  const R = run, P = R.p;
  let cx = R.cam.x, cy = R.cam.y;
  if (R.shake > 0) { cx += rand(-1, 1) * R.shake * 0.45; cy += rand(-1, 1) * R.shake * 0.45; }
  worldTransform(cx, cy);
  const L = cx - VIEW.w / 2, T = cy - VIEW.h / 2, Rt = cx + VIEW.w / 2, B = cy + VIEW.h / 2;
  const vis = (x, y, m) => x > L - m && x < Rt + m && y > T - m && y < B + m;
  const clock = R.clock;

  drawGround(ctx, L, T, Rt, B);
  if (R.arena) drawArenaFloor(R.arena, L, T, Rt, B);

  // fire on the ground
  for (const z of R.zones) {
    if (!vis(z.x, z.y, z.r + 30)) continue;
    const fade = Math.min(1, z.life / 0.5, (z.max - z.life) / 0.15 + 0.3);
    ctx.globalAlpha = fade;
    drawSpr(ctx, z.color === 'blue' ? SPR.glowBlue : SPR.glowOrange, z.x, z.y, z.r * 1.3 / 64);
    const fl = SPR.flames[z.color === 'blue' ? 'blue' : 'orange'];
    const big = z.color === 'blue' ? 1.45 : 1;
    for (const f of z.flames) {
      const fi = Math.floor(clock * 11 + f[2]) % 4;
      drawSpr(ctx, fl[fi], z.x + f[0], z.y + f[1] + 6, f[3] * big * (0.8 + 0.2 * fade));
    }
    ctx.globalAlpha = 1;
  }

  // forcefield
  if (R.ffRad > 0) {
    const evo = R.ab.forcefield.evo, r = R.ffRad;
    drawSpr(ctx, evo ? SPR.fieldRed : SPR.fieldGreen, P.x, P.y, r / 64);
    ctx.save();
    ctx.setLineDash([10, 12]); ctx.lineDashOffset = -clock * 30;
    ctx.beginPath(); ctx.arc(P.x, P.y, r * 0.98, 0, TAU);
    ctx.lineWidth = 2.5; ctx.strokeStyle = evo ? 'rgba(255,120,120,0.75)' : 'rgba(150,255,170,0.7)'; ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(P.x, P.y, r * (0.55 + 0.4 * ((clock * 0.8) % 1)), 0, TAU);
    ctx.lineWidth = 1.5; ctx.strokeStyle = evo ? 'rgba(255,140,140,0.25)' : 'rgba(160,255,180,0.22)'; ctx.stroke();
    ctx.restore();
  }

  drawTelegraphs(R, clock);

  // gems
  for (const g of R.gems) {
    if (!vis(g.x, g.y, 20)) continue;
    drawSpr(ctx, g.big ? SPR.gemBig : SPR.gem, g.x, g.y + Math.sin(clock * 4 + g.bob) * 1.5);
  }

  // shadows, then bodies sorted by depth
  DL.length = 0; FLY.length = 0;
  for (const e of R.enemies) {
    if (e.dead || !vis(e.x, e.y, 60)) continue;
    if (e.fly) FLY.push(e); else DL.push(e);
  }
  for (const e of DL) drawSpr(ctx, SPR.shadow, e.x, e.y + FOOT[e.type] * (e.elite ? ELITE.size : 1), e.r / 13);
  for (const e of FLY) drawSpr(ctx, SPR.shadow, e.x, e.y + 14, e.r / 15);
  if (!P.dead || P.deathT < 1.2) drawSpr(ctx, SPR.shadow, P.x, P.y + 12, 0.95);
  if (R.boss) drawBossShadow(R.boss);
  if (R.durian) drawSpr(ctx, SPR.shadow, R.durian.x, R.durian.y + R.durian.size * 0.9, R.durian.size / 14);
  DL.push(P);
  if (R.boss && R.boss.id !== 'mothra') DL.push(R.boss);
  DL.sort((a, b) => a.y - b.y);
  for (const e of DL) {
    if (e === P) drawPlayer(P, clock);
    else if (e.isBoss) drawBoss(e, clock);
    else drawEnemy(e, clock);
  }
  for (const e of FLY) drawEnemy(e, clock);
  if (R.boss && R.boss.id === 'mothra') drawBoss(R.boss, clock);
  if (R.bossDeath) drawBossDeath(R.bossDeath);

  // guardian blades
  if (R.blades.length) {
    const spr = R.ab.guardian.evo ? SPR.bladeEvo : SPR.blade;
    const sc = Math.sqrt(R.st.area);
    for (let i = 0; i < R.blades.length; i += 2) {
      ctx.save(); ctx.translate(R.blades[i], R.blades[i + 1]); ctx.rotate(clock * 16);
      drawSpr(ctx, spr, 0, 0, sc); ctx.restore();
    }
  }

  // durian
  if (R.durian) {
    const D = R.durian, evo = R.ab.durian.evo;
    ctx.save(); ctx.translate(D.x, D.y); ctx.rotate(D.rot);
    if (evo) { ctx.globalCompositeOperation = 'lighter'; drawSpr(ctx, SPR.glowRed, 0, 0, D.size * 1.6 / 64); ctx.globalCompositeOperation = 'source-over'; }
    drawSpr(ctx, evo ? SPR.durianEvo : SPR.durian, 0, 0, D.size / 16);
    ctx.restore();
  }

  // bottles in the air
  for (const t of R.throws) {
    if (t.t < 0) continue;
    drawSpr(ctx, SPR.shadow, t.x, t.y, 0.35);
    ctx.save(); ctx.translate(t.x, t.y - t.h); ctx.rotate(t.rot);
    drawSpr(ctx, t.kind === 'canister' ? SPR.canister : SPR.molotov, 0, 0);
    ctx.restore();
  }

  // your projectiles
  for (const s of R.shots) {
    if (!vis(s.x, s.y, 30)) continue;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    if (s.kind === 'shuriken') drawSpr(ctx, SPR.shuriken, 0, 0);
    else if (s.kind === 'spike') drawSpr(ctx, SPR.spike, 0, 0);
    else {
      if (s.evo) { ctx.globalCompositeOperation = 'lighter'; drawSpr(ctx, SPR.glowPurple, -6, 0, 0.32); ctx.globalCompositeOperation = 'source-over'; }
      drawSpr(ctx, s.evo ? SPR.missileEvo : SPR.missile, 0, 0);
    }
    ctx.restore();
  }

  // boss projectiles
  ctx.globalCompositeOperation = 'lighter';
  for (const b of R.ebullets) {
    if (b.kind === 'rock' || !vis(b.x, b.y, 30)) continue;
    const pulse = 1 + Math.sin(clock * 18 + b.x) * 0.08;
    drawSpr(ctx, b.kind === 'poison' ? SPR.poison : b.kind === 'dust' ? SPR.dust : SPR.lava, b.x, b.y, pulse * (b.kind === 'dust' ? 1.1 : 1));
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const b of R.ebullets) {
    if (b.kind !== 'rock') continue;
    drawSpr(ctx, SPR.shadow, b.x, b.y + 22, 0.6);
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); drawSpr(ctx, SPR.rock, 0, 0); ctx.restore();
  }

  drawBooms(R);
  drawParticles(R);
  if (R.arena) drawArenaFence(R.arena, clock);
  drawPlayerBars(P, clock);
  drawNumbers(R);

  // screen space: the joystick
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawJoystick();
}

function drawEnemy(e, clock) {
  let frames;
  if (e.type === 'zombie') frames = e.elite ? SPR.brute : SPR.zombie;
  else if (e.type === 'butterfly') frames = e.elite ? SPR.mothElite : SPR.butterfly;
  else if (e.type === 'beetle') frames = e.elite ? SPR.beetleElite : SPR.beetle;
  else frames = SPR.minion;
  const fr = frames[Math.floor(e.anim) % frames.length];
  const right = e.face > 0;
  const spr = e.flash > 0 ? (right ? fr.wr : fr.wl) : (right ? fr.r : fr.l);
  const foot = FOOT[e.type] * (e.elite ? ELITE.size : 1);
  if (e.elite) {
    ctx.beginPath(); ctx.ellipse(e.x, e.y + foot, e.r * 1.25, e.r * 0.5, 0, 0, TAU);
    ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(255,70,60,${0.45 + 0.3 * Math.sin(clock * 6)})`; ctx.stroke();
  }
  if (e.spawnT > 0) {
    const k = 1 - e.spawnT / 0.45;
    ctx.globalAlpha = k;
    drawSpr(ctx, spr, e.x, e.y + foot, 0.5 + 0.5 * k);
    ctx.globalAlpha = 1;
  } else drawSpr(ctx, spr, e.x, e.y + foot);
  if (e.burnT > 0) {
    const f = SPR.flames.purple[Math.floor(clock * 12 + e.wob) % 4];
    drawSpr(ctx, f, e.x, e.y + foot - 4, 0.6 + e.r / 30);
  }
  if (e.elite && e.hp < e.maxHp) {
    const w = e.r * 2.2, x = e.x - w / 2, y = e.y + foot + 5;
    ctx.fillStyle = 'rgba(10,8,14,0.8)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), 3);
  }
}

function drawPlayer(P, clock) {
  const fr = SPR.player[P.moving && !P.dead ? Math.floor(P.anim) % 4 : 4 + Math.floor(P.anim) % 4];
  const right = P.face > 0;
  let spr = right ? fr.r : fr.l;
  if (P.flash > 0) spr = right ? fr.wr : fr.wl;
  else if (P.poisonT > 0 && Math.floor(clock * 5) % 2 === 0) spr = right ? fr.gr : fr.gl;
  if (P.dead) {
    const k = Math.min(1, P.deathT * 3);
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, P.deathT - 0.8) * 1.5);
    ctx.translate(P.x, P.y + 12); ctx.rotate(-P.face * k * Math.PI / 2);
    drawSpr(ctx, spr, 0, 0);
    ctx.restore();
    return;
  }
  if (P.inv > 0 && Math.floor(clock * 22) % 2) ctx.globalAlpha = 0.55;
  drawSpr(ctx, spr, P.x, P.y + 12);
  ctx.globalAlpha = 1;
}

function drawPlayerBars(P, clock) {
  if (P.dead) return;
  const w = 38, x = P.x - w / 2, y = P.y + 17;
  ctx.fillStyle = 'rgba(12,10,16,0.85)'; rrPath(ctx, x - 1.5, y - 1.5, w + 3, 7, 3); ctx.fill();
  const k = clamp(P.hp / P.maxHp, 0, 1);
  ctx.fillStyle = P.poisonT > 0 ? '#58d63a' : k < 0.3 ? '#ff3b3b' : '#ff5a4f';
  if (k > 0) { rrPath(ctx, x, y, w * k, 4, 2); ctx.fill(); }
  if (P.poisonT > 0) {
    drawSpr(ctx, SPR.drop, P.x - 26, P.y + 19, 0.9);
    ctx.font = '900 9px "Lilita One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = '#10140c'; ctx.strokeText(Math.ceil(P.poisonT) + 's', P.x + 27, P.y + 19);
    ctx.fillStyle = '#9dff6a'; ctx.fillText(Math.ceil(P.poisonT) + 's', P.x + 27, P.y + 19);
  }
  void clock;
}

/* --------------------------------- bosses -------------------------------- */

function bossSprite(B) {
  const right = B.face > 0, flash = B.flash > 0;
  let fr;
  if (B.id === 'dreadnought') fr = B.pose === 'raise' ? SPR.dreadRaise : B.pose === 'crouch' ? SPR.dreadCrouch : SPR.dread[Math.floor(B.anim * 6) % 4];
  else if (B.id === 'mothra') fr = SPR.mothra[Math.floor(B.anim * 14) % 6];
  else fr = SPR.titanus[Math.floor(B.anim * (B.state === 'charge' && B.phase === 'dash' ? 14 : 6)) % 4];
  return flash ? (right ? fr.wr : fr.wl) : (right ? fr.r : fr.l);
}
function drawBossShadow(B) {
  const foot = BOSS_FOOT[B.id];
  const k = 1 / (1 + B.z / 180);
  const sy = B.id === 'mothra' ? B.y + 46 : B.y + foot;
  drawSpr(ctx, SPR.shadow, B.x, sy, B.r / 11 * (0.4 + 0.6 * k));
}
function drawBoss(B, clock) {
  const spr = bossSprite(B), foot = BOSS_FOOT[B.id];
  const enraged = B.hp < B.maxHp * 0.5;
  if (enraged) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(clock * 8);
    drawSpr(ctx, B.id === 'mothra' ? SPR.glowPurple : SPR.glowRed, B.x, B.y - (B.id === 'mothra' ? 10 : 20) - B.z, B.r * 2.4 / 64);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  if (B.id === 'mothra') {
    ctx.save(); ctx.translate(B.x, B.y - 10 - B.z + Math.sin(clock * 3) * 4); ctx.rotate(B.rot);
    drawSpr(ctx, spr, 0, 0);
    ctx.restore();
  } else {
    const lean = B.state === 'charge' && B.phase === 'dash' ? 0.18 * B.face : B.state === 'charge' && B.phase === 'aim' ? -0.08 * B.face : 0;
    ctx.save(); ctx.translate(B.x, B.y + foot - B.z); ctx.rotate(lean);
    drawSpr(ctx, spr, 0, 0);
    ctx.restore();
  }
  if (B.state === 'charge' && B.phase === 'stun') {
    for (let i = 0; i < 3; i++) {
      const a = clock * 5 + i * TAU / 3;
      drawSpr(ctx, SPR.dizzy, B.x + Math.cos(a) * 22, B.y - B.r * 2.4 + Math.sin(a) * 6);
    }
  }
  if (B.burnT > 0) drawSpr(ctx, SPR.flames.purple[Math.floor(clock * 12) % 4], B.x, B.y + foot - 10, 1.6);
}
function drawBossDeath(D) {
  const k = D.t / 1.6;
  const fake = { id: D.id, face: D.face, flash: Math.floor(D.t * 14) % 2 ? 1 : 0, anim: 0, pose: 'walk', state: '', z: 0 };
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - k);
  ctx.translate(D.x, D.y + (D.id === 'mothra' ? -10 : BOSS_FOOT[D.id]));
  ctx.scale(1 + k * 0.3, 1 - k * 0.2);
  drawSpr(ctx, bossSprite(fake), 0, 0);
  ctx.restore();
}

/* ------------------------------ telegraphs ------------------------------- */

function drawTelegraphs(R, clock) {
  for (const h of R.hazards) {
    if (h.kind === 'line') {
      const k = h.t / h.life;
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(Math.atan2(h.dy, h.dx));
      ctx.fillStyle = `rgba(255,40,40,${0.16 + 0.12 * Math.sin(clock * 24)})`;
      ctx.fillRect(0, -h.w / 2, h.len, h.w);
      ctx.fillStyle = 'rgba(255,60,60,0.35)';
      ctx.fillRect(0, -h.w / 2, h.len * k, h.w);
      ctx.strokeStyle = 'rgba(255,90,90,0.8)'; ctx.lineWidth = 2;
      ctx.strokeRect(0, -h.w / 2, h.len, h.w);
      ctx.fillStyle = 'rgba(255,220,220,0.55)';
      for (let x = 30; x < h.len - 10; x += 46) { ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x + 14, 0); ctx.lineTo(x, 10); ctx.lineTo(x + 5, 0); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    } else if (h.kind === 'slam') {
      const k = clamp(h.t / h.life, 0, 1);
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU);
      ctx.fillStyle = 'rgba(255,40,40,0.16)'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(255,80,80,${0.6 + 0.4 * Math.sin(clock * 20)})`; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r * k, 0, TAU);
      ctx.fillStyle = 'rgba(255,60,60,0.3)'; ctx.fill();
    } else if (h.kind === 'spike') {
      if (!h.erupted) {
        const k = clamp(h.t / h.delay, 0, 1);
        ctx.beginPath(); ctx.ellipse(h.x, h.y, h.r * (0.5 + 0.5 * k), h.r * 0.55 * (0.5 + 0.5 * k), 0, 0, TAU);
        ctx.fillStyle = `rgba(255,120,30,${0.15 + 0.35 * k})`; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = `rgba(255,190,90,${0.3 + 0.5 * k})`; ctx.stroke();
      } else {
        const e = h.t - h.delay, pop = Math.min(1, e / 0.08) * (e > h.dur - 0.12 ? Math.max(0, (h.dur - e) / 0.12) : 1);
        ctx.globalCompositeOperation = 'lighter';
        drawSpr(ctx, SPR.glowOrange, h.x, h.y, 0.45);
        ctx.globalCompositeOperation = 'source-over';
        drawSpr(ctx, SPR.lavaSpike, h.x, h.y + 4, 0.4 + 0.6 * pop);
      }
    } else if (h.kind === 'mine') {
      if (h.state === 'fly') {
        const k = clamp(h.t / h.fly, 0, 1);
        const x = lerp(h.sx, h.x, k), y = lerp(h.sy, h.y, k) - Math.sin(k * Math.PI) * 80;
        drawSpr(ctx, SPR.shadow, lerp(h.sx, h.x, k), lerp(h.sy, h.y, k), 0.5);
        drawSpr(ctx, SPR.mine[1], x, y, 0.8);
      } else {
        if (h.state === 'fuse') {
          const k = clamp(h.t / 0.6, 0, 1);
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU);
          ctx.fillStyle = 'rgba(255,50,30,0.16)'; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,90,60,0.85)'; ctx.stroke();
          ctx.beginPath(); ctx.arc(h.x, h.y, h.r * k, 0, TAU); ctx.fillStyle = 'rgba(255,80,40,0.3)'; ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(h.x, h.y, h.trig, 0, TAU);
          ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,140,60,0.35)'; ctx.setLineDash([5, 6]); ctx.stroke(); ctx.setLineDash([]);
        }
        const blink = h.state === 'fuse' ? Math.floor(clock * 16) % 2 : Math.floor(clock * 3 + h.x) % 2;
        drawSpr(ctx, SPR.mine[blink], h.x, h.y);
      }
    }
  }
}

/* ---------------------------------- fx ----------------------------------- */

function drawBooms(R) {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of R.booms) {
    if (b.t < 0) continue;
    const k = b.t / b.dur, e = 1 - (1 - k) * (1 - k);
    const r = b.r * (0.35 + 0.8 * e);
    ctx.globalAlpha = Math.max(0, 1 - k);
    drawSpr(ctx, b.color === 'purple' ? SPR.glowPurple : SPR.glowRed, b.x, b.y, r * 1.25 / 64);
    ctx.globalAlpha = Math.max(0, 1 - k * 1.6);
    ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.45, 0, TAU);
    ctx.fillStyle = b.color === 'purple' ? '#f3d9ff' : '#fff3c0'; ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  for (const r of R.rings) {
    const k = r.t / r.dur;
    ctx.beginPath(); ctx.arc(r.x, r.y, lerp(r.r0, r.r1, 1 - (1 - k) * (1 - k)), 0, TAU);
    ctx.lineWidth = 7 * (1 - k) + 1; ctx.strokeStyle = r.color + (0.8 * (1 - k)).toFixed(3) + ')'; ctx.stroke();
  }
}

function drawParticles(R) {
  for (const p of R.parts) {
    const k = p.life / p.max;
    if (p.kind === 'dot') {
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    } else if (p.kind === 'smoke') {
      ctx.globalAlpha = k * 0.7;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const p of R.parts) {
    if (p.kind !== 'fire') continue;
    const k = p.life / p.max;
    ctx.globalAlpha = k;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

function drawNumbers(R) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const n of R.nums) {
    const life = n.own ? 0.9 : 0.65, k = n.t / life;
    const pop = n.t < 0.08 ? 0.7 + n.t / 0.08 * 0.5 : 1.2 - Math.min(0.2, (n.t - 0.08) * 2);
    const size = (n.own ? 15 : 12) * pop;
    ctx.font = `${Math.round(size * 10) / 10}px "Lilita One", "Arial Black", sans-serif`;
    ctx.globalAlpha = k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
    const y = n.y - n.t * 34;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(15,10,20,0.9)';
    ctx.strokeText(n.v, n.x, y);
    ctx.fillStyle = n.color; ctx.fillText(n.v, n.x, y);
  }
  ctx.globalAlpha = 1;
}

/* --------------------------------- arena --------------------------------- */

function drawArenaFloor(A, L, T, Rt, B) {
  const appear = Math.min(1, (run.clock - (A.born ?? (A.born = run.clock))) / 0.6);
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.beginPath();
  ctx.rect(L - 10, T - 10, Rt - L + 20, B - T + 20);
  ctx.rect(A.x - A.w / 2, A.y - A.h / 2, A.w, A.h);
  ctx.fillStyle = 'rgba(6,4,10,0.55)';
  ctx.fill('evenodd');
  ctx.restore();
}
function drawArenaFence(A, clock) {
  const appear = Math.min(1, (run.clock - (A.born ?? run.clock)) / 0.6);
  const x = A.x - A.w / 2, y = A.y - A.h / 2;
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(40,12,8,0.9)'; ctx.strokeRect(x, y, A.w, A.h);
  ctx.lineWidth = 4; ctx.strokeStyle = '#ff6a2a'; ctx.strokeRect(x, y, A.w, A.h);
  ctx.setLineDash([14, 10]); ctx.lineDashOffset = -clock * 40;
  ctx.lineWidth = 2; ctx.strokeStyle = '#ffe0a0'; ctx.strokeRect(x, y, A.w, A.h);
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 12; ctx.strokeStyle = `rgba(255,90,30,${0.12 + 0.08 * Math.sin(clock * 6)})`; ctx.strokeRect(x, y, A.w, A.h);
  ctx.globalCompositeOperation = 'source-over';
  // posts
  ctx.fillStyle = '#2a1410';
  const step = 64;
  for (let px = x; px <= x + A.w + 0.1; px += A.w / Math.max(1, Math.round(A.w / step))) { ctx.fillRect(px - 4, y - 4, 8, 8); ctx.fillRect(px - 4, y + A.h - 4, 8, 8); }
  for (let py = y; py <= y + A.h + 0.1; py += A.h / Math.max(1, Math.round(A.h / step))) { ctx.fillRect(x - 4, py - 4, 8, 8); ctx.fillRect(x + A.w - 4, py - 4, 8, 8); }
  ctx.restore();
}

/* ------------------------------- joystick -------------------------------- */

const TOUCH_SCREEN = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

function drawStick(ox, oy, kx, ky, alpha) {
  const R = Input.JOY_R;
  ctx.beginPath(); ctx.arc(ox, oy, R, 0, TAU);
  ctx.fillStyle = `rgba(255,255,255,${0.12 * alpha})`; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,255,255,${0.35 * alpha})`; ctx.stroke();
  ctx.beginPath(); ctx.arc(ox + kx, oy + ky, R * 0.45, 0, TAU);
  ctx.fillStyle = `rgba(255,255,255,${0.45 * alpha})`; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = `rgba(30,20,40,${0.5 * alpha})`; ctx.stroke();
}

function drawJoystick() {
  const j = Input.joy;
  if (j.active) {
    const R = Input.JOY_R;
    const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy), k = d > R ? R / d : 1;
    drawStick(j.ox, j.oy, dx * k, dy * k, 1);
    return;
  }
  if (!run || run.state !== 'play' || run.p.dead) return;
  // At rest: a faint stick near the bottom shows where to put your thumb
  // (it follows your finger wherever you touch), plus a hint until you move.
  const x = VIEW.cssW / 2, y = VIEW.cssH - clamp(VIEW.cssH * 0.16, 90, 150);
  const hint = !run.moved;
  if (TOUCH_SCREEN) {
    const wob = hint ? Math.sin(run.clock * 3) * Input.JOY_R * 0.35 : 0;
    drawStick(x, y, wob, 0, hint ? 0.9 : 0.45);
  }
  if (hint) {
    const text = TOUCH_SCREEN ? 'Drag anywhere to move' : 'Move with WASD or the arrow keys';
    ctx.font = '20px "Lilita One", "Arial Black", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(run.clock * 4);
    const ty = TOUCH_SCREEN ? y - Input.JOY_R - 22 : y;
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(15,10,20,0.9)'; ctx.strokeText(text, x, ty);
    ctx.fillStyle = '#fff3c0'; ctx.fillText(text, x, ty);
    ctx.globalAlpha = 1;
  }
}
