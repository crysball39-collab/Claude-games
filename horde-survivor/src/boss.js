'use strict';
/* =============================================================================
   Bosses. When the clock reaches a boss, the street is cleared, a cage drops
   around you and the boss falls in. The clock waits until it is dead.
   Every attack is telegraphed: red lines for charges, red circles for slams
   and mines, glowing cracks for lava spikes.
   ========================================================================== */

const BOSS_FOOT = { dreadnought: 30, mothra: -10, titanus: 34 };

function inArena(x, y, pad = 0) {
  const A = run.arena;
  if (!A) return true;
  return x > A.x - A.w / 2 + pad && x < A.x + A.w / 2 - pad && y > A.y - A.h / 2 + pad && y < A.y + A.h / 2 - pad;
}

function beginBoss(id) {
  const R = run, P = R.p;
  R.intro = { id, t: 0 };
  // The horde scatters before the boss arrives.
  for (const e of R.enemies) if (!e.dead) { e.dead = true; puff(e.x, e.y, 'rgba(120,124,136,0.6)'); }
  for (const g of R.gems) g.mag = true;
  UI.showBossBar(BOSSES[id].name);
  measureHud();
  const hud = VIEW.hudTop;
  const w = Math.min(VIEW.w - 24, 660), h = Math.min(VIEW.h - hud - 30, 760);
  R.arena = { x: P.x, y: P.y, w, h, camOff: (hud - 6) / 2, t: 0 };
  R.camAnchor.x = P.x; R.camAnchor.y = P.y;
  UI.bossWarning(BOSSES[id].name);
  Sfx.play('warn');
}

function updateIntro(dt) {
  const R = run;
  R.intro.t += dt;
  if (R.intro.t >= 2.6) { spawnBoss(R.intro.id); R.intro = null; }
}

function spawnBoss(id) {
  const R = run, def = BOSSES[id], A = R.arena;
  const dm = enemyDmgMult(R.t);
  R.boss = {
    id, def, isBoss: true, x: A.x, y: A.y - A.h * 0.26, z: 460, r: def.r, hp: def.hp, maxHp: def.hp,
    speed: def.speed, dmg: def.dmg * dm, dm, face: -1, anim: 0, flash: 0, atkCd: 0,
    state: 'enter', st: 0, phase: '', queue: [], last: null, n: 0,
    gHit: -9, dHit: -9, slowT: 0, slowMul: 1, burnT: 0, burnDps: 0, burnTick: 0,
    pose: 'walk', rot: 0, targetable: false, invuln: true, dir: { x: 0, y: 1 }, dead: false,
  };
}

function updateBoss(dt) {
  const R = run, B = R.boss, P = R.p, A = R.arena;
  if (!B || B.dead) return;
  B.anim += dt;
  if (B.flash > 0) B.flash -= dt;
  if (B.atkCd > 0) B.atkCd -= dt;
  if (B.slowT > 0) B.slowT -= dt;
  if (B.burnT > 0) {
    B.burnT -= dt; B.burnTick -= dt;
    if (B.burnTick <= 0) { B.burnTick = 0.5; hitEnemy(B, B.burnDps * 0.5, 0, 0, 0, '#d68bff'); if (B.dead) return; }
  }
  const dx = P.x - B.x, dy = P.y - B.y, d = Math.hypot(dx, dy) || 1;
  if (B.state !== 'charge' && Math.abs(dx) > 6) B.face = dx > 0 ? 1 : -1;
  B.st -= dt;
  if (B.state === 'enter') {
    B.z = Math.max(0, B.z - 760 * dt);
    if (B.z <= 0) {
      B.state = 'chase'; B.st = 1.1; B.targetable = true; B.invuln = false;
      R.shake = 12; Sfx.play('thud');
      R.rings.push({ x: B.x, y: B.y + 20, r0: 20, r1: 140, t: 0, dur: 0.5, color: 'rgba(220,210,190,', dead: false });
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; addPart(B.x + Math.cos(a) * 30, B.y + 20 + Math.sin(a) * 14, Math.cos(a) * 160, Math.sin(a) * 60, 0.6, rand(5, 9), 'rgba(170,160,150,0.6)', 'smoke'); }
    }
  } else if (B.state === 'chase') {
    const sp = B.speed * (B.slowT > 0 ? 0.65 : 1) * (B.hp < B.maxHp * 0.5 ? 1.15 : 1);
    if (B.id === 'mothra') {
      // hovers at a distance and circles you
      const want = 150, radial = d > want ? 1 : -0.6;
      B.x += (dx / d * radial + -dy / d * 0.8) * sp * dt;
      B.y += (dy / d * radial + dx / d * 0.8) * sp * dt;
    } else if (d > B.r + P.r) {
      B.x += dx / d * sp * dt; B.y += dy / d * sp * dt;
    }
    if (B.st <= 0) startAttack(B);
  } else {
    const atk = BOSS_ATTACKS[B.state];
    atk.update(B, dt);
  }
  if (A && B.state !== 'enter' && !(B.state === 'slam' && B.phase === 'air')) {
    B.x = clamp(B.x, A.x - A.w / 2 + B.r * 0.8, A.x + A.w / 2 - B.r * 0.8);
    B.y = clamp(B.y, A.y - A.h / 2 + B.r * 0.8, A.y + A.h / 2 - B.r * 0.8);
  }
  if (B.targetable && !P.dead) {
    const dd = Math.hypot(P.x - B.x, P.y - B.y);
    if (dd < B.r + P.r - 2 && B.atkCd <= 0) {
      B.atkCd = 0.8;
      const dash = B.state === 'charge' && B.phase === 'dash';
      hurtPlayer(B.dmg * (dash ? 1.6 : 1), { boss: true });
    }
  }
}

function startAttack(B) {
  if (!B.queue.length) {
    B.queue = shuffle(B.def.attacks.slice());
    if (B.queue[0] === B.last && B.queue.length > 1) B.queue.push(B.queue.shift());
  }
  const a = B.queue.shift();
  B.last = a; B.state = a; B.phase = ''; B.st = 0; B.n = 0;
  BOSS_ATTACKS[a].begin(B);
}

function endAttack(B) {
  B.state = 'chase'; B.pose = 'walk'; B.rot = 0;
  const enraged = B.hp < B.maxHp * 0.5;
  B.st = (B.id === 'titanus' ? 1.0 : 1.25) * (enraged ? 0.7 : 1);
}

function slamImpact(x, y, r, dmg) {
  const R = run, P = R.p;
  if (Math.hypot(P.x - x, P.y - y) < r + P.r * 0.4) hurtPlayer(dmg, { boss: true });
  R.shake = 14;
  Sfx.play('thud');
  R.rings.push({ x, y, r0: r * 0.2, r1: r * 1.25, t: 0, dur: 0.45, color: 'rgba(255,210,160,', dead: false });
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * TAU, v = rand(120, 300);
    addPart(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, Math.cos(a) * v, Math.sin(a) * v * 0.6, rand(0.4, 0.8), rand(4, 9), i % 3 ? 'rgba(160,150,140,0.7)' : '#7a7068', i % 3 ? 'smoke' : 'dot');
  }
}

function aimCharge(B, aimTime, speed) {
  const P = run.p, dx = P.x - B.x, dy = P.y - B.y, d = Math.hypot(dx, dy) || 1;
  B.dir = { x: dx / d, y: dy / d };
  B.dashSpeed = speed;
  B.dashLen = Math.min(560, d + 170);
  B.face = dx > 0 ? 1 : -1;
  run.hazards.push({ kind: 'line', x: B.x, y: B.y, dx: B.dir.x, dy: B.dir.y, len: B.dashLen, w: B.r * 1.9, t: 0, life: aimTime, dead: false });
}

function atWall(B) {
  const A = run.arena;
  if (!A) return false;
  return B.x <= A.x - A.w / 2 + B.r * 0.8 + 1 || B.x >= A.x + A.w / 2 - B.r * 0.8 - 1 || B.y <= A.y - A.h / 2 + B.r * 0.8 + 1 || B.y >= A.y + A.h / 2 - B.r * 0.8 - 1;
}

const BOSS_ATTACKS = {
  /* All three bosses charge: aim, telegraph, dash in a straight line. */
  charge: {
    begin(B) {
      B.phase = 'aim';
      B.st = B.id === 'mothra' ? 0.7 : 0.85;
      aimCharge(B, B.st, B.id === 'mothra' ? 660 : B.id === 'titanus' ? 600 : 560);
    },
    update(B, dt) {
      if (B.phase === 'aim') {
        if (B.st <= 0) { B.phase = 'dash'; B.st = B.dashLen / B.dashSpeed; B.travel = 0; Sfx.play('roar'); }
      } else if (B.phase === 'dash') {
        B.x += B.dir.x * B.dashSpeed * dt;
        B.y += B.dir.y * B.dashSpeed * dt;
        if (Math.random() < 0.6) addPart(B.x + rand(-B.r, B.r) * 0.6, B.y + B.r * 0.6, -B.dir.x * 60 + rand(-30, 30), -B.dir.y * 60 + rand(-30, 10), 0.45, rand(5, 9), B.id === 'titanus' ? 'rgba(255,140,60,0.55)' : 'rgba(170,160,150,0.6)', 'smoke');
        if (B.st <= 0 || atWall(B)) {
          B.phase = 'stun'; B.st = B.id === 'mothra' ? 0.5 : 0.75;
          if (atWall(B)) { run.shake = 8; Sfx.play('thud'); }
        }
      } else if (B.phase === 'stun') {
        if (B.st <= 0) endAttack(B);
      }
    },
  },

  /* Zombie Dreadnought: three rocks, each thrown at where you are now. */
  rocks: {
    begin(B) { B.phase = 'wind'; B.st = 0.6; B.pose = 'raise'; },
    update(B) {
      if (B.phase === 'wind' && B.st <= 0) {
        const P = run.p, hx = B.x + B.face * 2, hy = B.y - 94;
        const ang = Math.atan2(P.y - hy, P.x - hx);
        run.ebullets.push({ kind: 'rock', x: hx, y: hy, vx: Math.cos(ang) * 340, vy: Math.sin(ang) * 340, r: 15, dmg: 18 * B.dm, life: 3, rot: 0, dead: false });
        Sfx.play('thud');
        B.n++; B.pose = 'walk';
        B.phase = 'after'; B.st = 0.22;
      } else if (B.phase === 'after' && B.st <= 0) {
        if (B.n < 3) { B.phase = 'wind'; B.st = 0.42; B.pose = 'raise'; }
        else { B.phase = 'rec'; B.st = 0.55; }
      } else if (B.phase === 'rec' && B.st <= 0) endAttack(B);
    },
  },

  /* Zombie Dreadnought: leaps and lands on the spot you were standing on. */
  slam: {
    begin(B) { B.phase = 'crouch'; B.st = 0.45; B.pose = 'crouch'; },
    update(B) {
      const P = run.p;
      if (B.phase === 'crouch' && B.st <= 0) {
        B.phase = 'air'; B.st = B.airTime = 1.05; B.pose = 'walk';
        B.sx = B.x; B.sy = B.y; B.tx = P.x; B.ty = P.y;
        B.targetable = false; B.invuln = true;
        run.hazards.push({ kind: 'slam', x: B.tx, y: B.ty, r: 96, t: 0, life: B.airTime, dead: false });
        Sfx.play('roar');
      } else if (B.phase === 'air') {
        const k = clamp(1 - B.st / B.airTime, 0, 1);
        B.x = lerp(B.sx, B.tx, k); B.y = lerp(B.sy, B.ty, k);
        B.z = Math.sin(k * Math.PI) * 300;
        if (B.st <= 0) {
          B.z = 0; B.x = B.tx; B.y = B.ty; B.targetable = true; B.invuln = false;
          B.phase = 'rec'; B.st = 0.9; B.pose = 'crouch';
          slamImpact(B.x, B.y, 96, 30 * B.dm);
        }
      } else if (B.phase === 'rec') {
        if (B.st < 0.5) B.pose = 'walk';
        if (B.st <= 0) endAttack(B);
      }
    },
  },

  /* Mutated Butterfly: spins and sprays a spiral of wing dust. */
  spin: {
    begin(B) { B.phase = 'wind'; B.st = 0.6; },
    update(B, dt) {
      if (B.phase === 'wind') { B.rot += dt * 4; if (B.st <= 0) { B.phase = 'spin'; B.st = 3.0; B.emit = 0; } }
      else if (B.phase === 'spin') {
        B.rot += dt * 12;
        const P = run.p, dx = P.x - B.x, dy = P.y - B.y, d = Math.hypot(dx, dy) || 1;
        B.x += dx / d * 50 * dt; B.y += dy / d * 50 * dt;
        B.emit -= dt;
        if (B.emit <= 0) {
          B.emit = B.hp < B.maxHp * 0.5 ? 0.09 : 0.115;
          for (let k = 0; k < 3; k++) {
            const a = B.rot * 0.45 + k * TAU / 3;
            run.ebullets.push({ kind: 'dust', x: B.x + Math.cos(a) * 28, y: B.y + Math.sin(a) * 28, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 7, dmg: 9 * B.dm, life: 3.6, dead: false });
          }
        }
        if (B.st <= 0) { B.phase = 'rec'; B.st = 0.7; }
      } else if (B.phase === 'rec') {
        B.rot += dt * 12 * Math.max(0, B.st / 0.7);
        if (B.st <= 0) endAttack(B);
      }
    },
  },

  /* Mutated Butterfly: three poison balls. Each hit poisons you for 10 seconds. */
  poison: {
    begin(B) { B.phase = 'wind'; B.st = 0.55; },
    update(B) {
      if (B.phase === 'wind' && B.st <= 0) {
        const P = run.p, base = Math.atan2(P.y - B.y, P.x - B.x);
        for (const off of [-0.32, 0, 0.32]) {
          const a = base + off;
          run.ebullets.push({ kind: 'poison', x: B.x + Math.cos(a) * 20, y: B.y + Math.sin(a) * 20, vx: Math.cos(a) * 215, vy: Math.sin(a) * 215, r: 11, dmg: 7 * B.dm, life: 3.2, poison: true, dead: false });
        }
        Sfx.play('spike');
        B.n++;
        if (B.n < (B.hp < B.maxHp * 0.5 ? 2 : 1)) B.st = 0.6; else { B.phase = 'rec'; B.st = 0.6; }
      } else if (B.phase === 'rec' && B.st <= 0) endAttack(B);
    },
  },

  /* Titanus: three fans of lava bullets. */
  bullets: {
    begin(B) { B.phase = 'wind'; B.st = 0.45; },
    update(B) {
      if (B.phase === 'wind' && B.st <= 0) {
        const P = run.p, mx = B.x + B.face * 46, my = B.y - 28;
        const base = Math.atan2(P.y - my, P.x - mx), cnt = 7;
        for (let i = 0; i < cnt; i++) {
          const a = base + (i - (cnt - 1) / 2) * 0.17;
          run.ebullets.push({ kind: 'lava', x: mx, y: my, vx: Math.cos(a) * 225, vy: Math.sin(a) * 225, r: 8, dmg: 12 * B.dm, life: 3.6, dead: false });
        }
        Sfx.play('fire');
        B.n++;
        if (B.n < 3) B.st = 0.38; else { B.phase = 'rec'; B.st = 0.6; }
      } else if (B.phase === 'rec' && B.st <= 0) endAttack(B);
    },
  },

  /* Titanus: lava spikes burst out of the ground in three lines toward you. */
  spikes: {
    begin(B) { B.phase = 'wind'; B.st = 0.7; },
    update(B) {
      if (B.phase === 'wind' && B.st <= 0) {
        const P = run.p, base = Math.atan2(P.y - B.y, P.x - B.x);
        for (const off of [-0.45, 0, 0.45]) {
          for (let i = 1; i <= 14; i++) {
            const a = base + off, dd = 28 + i * 34;
            const x = B.x + Math.cos(a) * dd, y = B.y + Math.sin(a) * dd;
            if (!inArena(x, y, 6)) break;
            run.hazards.push({ kind: 'spike', x, y, r: 21, t: 0, delay: 0.5 + i * 0.075, dur: 0.45, dmg: 20 * B.dm, hit: false, erupted: false, dead: false });
          }
        }
        run.shake = 7; Sfx.play('thud');
        B.phase = 'rec'; B.st = 1.5;
      } else if (B.phase === 'rec' && B.st <= 0) endAttack(B);
    },
  },

  /* Titanus: calls in lava beetles. */
  summon: {
    begin(B) { B.phase = 'wind'; B.st = 0.7; Sfx.play('roar'); },
    update(B) {
      if (B.phase === 'wind' && B.st <= 0) {
        let alive = 0;
        for (const e of run.enemies) if (!e.dead && e.type === 'minion') alive++;
        const n = Math.max(0, Math.min(B.hp < B.maxHp * 0.5 ? 6 : 5, 14 - alive));
        for (let i = 0; i < n; i++) {
          const a = i / Math.max(1, n) * TAU + Math.random() * 0.4;
          const e = makeEnemy('minion', B.x + Math.cos(a) * 72, B.y + Math.sin(a) * 58, false);
          e.spawnT = 0.45;
          puff(e.x, e.y, 'rgba(255,130,50,0.55)');
        }
        B.phase = 'rec'; B.st = 0.8;
      } else if (B.phase === 'rec' && B.st <= 0) endAttack(B);
    },
  },

  /* Titanus: lobs lava mines around you. They blow up when you get close. */
  mines: {
    begin(B) { B.phase = 'wind'; B.st = 0.5; },
    update(B) {
      if (B.phase === 'wind' && B.st <= 0) {
        const P = run.p;
        for (let i = 0; i < 6; i++) {
          let x = P.x, y = P.y, tries = 0;
          do {
            x = P.x + rand(-210, 210); y = P.y + rand(-210, 210); tries++;
          } while (tries < 30 && (!inArena(x, y, 24) || Math.hypot(x - B.x, y - B.y) < 90 || Math.hypot(x - P.x, y - P.y) < 60));
          run.hazards.push({ kind: 'mine', x, y, sx: B.x, sy: B.y - 30, t: 0, fly: 0.55, arm: 0.9, state: 'fly', fuse: 0, r: 68, trig: 46, dmg: 24 * B.dm, life: 8, dead: false });
        }
        Sfx.play('shoot');
        B.phase = 'rec'; B.st = 0.8;
      } else if (B.phase === 'rec' && B.st <= 0) endAttack(B);
    },
  },
};

/* --------------------------- hazards & bullets --------------------------- */

function updateHazards(dt) {
  const R = run, P = R.p;
  for (const h of R.hazards) {
    if (h.dead) continue;
    h.t += dt;
    if (h.kind === 'line' || h.kind === 'slam') {
      if (h.t >= h.life) h.dead = true;
    } else if (h.kind === 'spike') {
      if (h.t >= h.delay && !h.erupted) {
        h.erupted = true;
        Sfx.play('spike');
        for (let i = 0; i < 4; i++) addPart(h.x, h.y - 6, rand(-60, 60), rand(-140, -40), 0.4, rand(2, 4), '#ff9a3a', 'fire');
      }
      if (h.erupted && !h.hit && h.t < h.delay + h.dur && Math.hypot(P.x - h.x, P.y - h.y) < h.r + P.r * 0.6) {
        h.hit = true;
        hurtPlayer(h.dmg, { boss: true });
      }
      if (h.t >= h.delay + h.dur) h.dead = true;
    } else if (h.kind === 'mine') {
      if (h.state === 'fly') {
        if (h.t >= h.fly) { h.state = 'armed'; h.t = 0; }
      } else if (h.state === 'armed') {
        const near = Math.hypot(P.x - h.x, P.y - h.y) < h.trig + P.r;
        if ((h.t > h.arm && near) || h.t > h.life) { h.state = 'fuse'; h.t = 0; }
      } else if (h.state === 'fuse') {
        if (h.t >= 0.6) {
          h.dead = true;
          if (Math.hypot(P.x - h.x, P.y - h.y) < h.r + P.r * 0.4) hurtPlayer(h.dmg, { boss: true });
          R.booms.push({ x: h.x, y: h.y, r: h.r, t: 0, dur: 0.45, color: 'orange', dead: false });
          R.shake = Math.max(R.shake, 5);
          Sfx.play('boom');
        }
      }
    }
  }
}

function updateEBullets(dt) {
  const R = run, P = R.p;
  for (const b of R.ebullets) {
    if (b.dead) continue;
    b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.rot !== undefined) b.rot += dt * 7;
    if (b.life <= 0 || (R.arena && !inArena(b.x, b.y, -30))) {
      b.dead = true;
      if (b.kind === 'rock') for (let i = 0; i < 6; i++) addPart(b.x, b.y, rand(-90, 90), rand(-90, 30), 0.4, rand(3, 5), '#8d939b', 'dot');
      continue;
    }
    if (!P.dead && Math.hypot(P.x - b.x, P.y - b.y) < b.r + P.r - 2) {
      b.dead = true;
      const hit = hurtPlayer(b.dmg, { boss: true });
      if (hit && b.poison) { P.poisonT = 10; P.poisonDps = 3 * enemyDmgMult(R.t); P.poisonTick = 0.5; }
      const col = b.kind === 'poison' ? '#7dff5a' : b.kind === 'dust' ? '#d9a3ff' : b.kind === 'lava' ? '#ff9a3a' : '#8d939b';
      for (let i = 0; i < 6; i++) addPart(b.x, b.y, rand(-80, 80), rand(-80, 40), 0.35, rand(2, 4), col, 'dot');
    }
  }
}

function killBoss(B) {
  const R = run;
  B.dead = true; B.targetable = false;
  R.kills++;
  R.gold += B.def.gold * R.st.gold;
  R.bossDeath = { x: B.x, y: B.y, id: B.id, face: B.face, t: 0 };
  for (let i = 0; i < 40; i++) dropGem(B.x + rand(-70, 70), B.y + rand(-60, 60), 5);
  for (const g of R.gems) g.mag = true;
  for (const e of R.enemies) if (!e.dead && e.type === 'minion') killEnemy(e);
  for (const b of R.ebullets) b.dead = true;
  for (const h of R.hazards) h.dead = true;
  for (let i = 0; i < 5; i++) R.booms.push({ x: B.x + rand(-40, 40), y: B.y + rand(-50, 20), r: rand(40, 70), t: -i * 0.18, dur: 0.5, color: B.id === 'mothra' ? 'purple' : 'orange', dead: false });
  R.shake = 16;
  Sfx.play('bigboom');
  R.boss = null;
  R.bossesDown++;
  UI.hideBossBar();
  R.arena = null;
  if (R.bossIdx >= R.chapter.bosses.length) {
    R.victory = true; R.endT = 3.6;
    UI.banner('Chapter cleared!', 'good');
    Sfx.play('win');
  } else {
    UI.banner(B.def.name + ' defeated!', 'good');
  }
}
