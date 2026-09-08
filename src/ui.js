// Touch + keyboard HUD.  Everything is plain DOM over the WebGL canvas so it
// scales to phones and desktops alike.
import { RARITY } from './models.js';
import { BUILD_TYPES, BUILD_COST } from './building.js';

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export class HUD {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.input = {
      move: { x: 0, y: 0 },
      look: { x: 0, y: 0 },
      shoot: false, aim: false, sprint: false,
      jump: false, use: false, reload: false,
      crouch: false,
      buildMode: false, buildType: 'ramp',
      slotRequest: -1, placeRequest: false,
    };
    this.keys = new Set();
    this.build();
    this.bindKeyboard();
    this.bindPointer();
  }

  build() {
    const r = this.root;
    r.innerHTML = '';
    r.className = 'hud';

    // ---- top left: vitals ------------------------------------------------
    const vit = el('div', 'vitals', r);
    this.shieldBar = el('div', 'bar shield', vit);
    this.shieldFill = el('i', null, this.shieldBar);
    this.shieldTxt = el('span', null, this.shieldBar, '0');
    this.hpBar = el('div', 'bar hp', vit);
    this.hpFill = el('i', null, this.hpBar);
    this.hpTxt = el('span', null, this.hpBar, '100');

    // ---- top right: match info -------------------------------------------
    const info = el('div', 'matchinfo', r);
    const row1 = el('div', 'row', info);
    el('span', 'lbl', row1, 'ALIVE');
    this.aliveTxt = el('span', 'val', row1, '100');
    const row2 = el('div', 'row', info);
    el('span', 'lbl', row2, 'ELIMS');
    this.killsTxt = el('span', 'val', row2, '0');
    const row3 = el('div', 'row wood', info);
    el('span', 'lbl', row3, 'WOOD');
    this.woodTxt = el('span', 'val', row3, '0');
    this.feed = el('div', 'killfeed', r);

    // ---- crosshair -------------------------------------------------------
    this.cross = el('div', 'crosshair', r);
    for (let i = 0; i < 4; i++) el('i', 'ch' + i, this.cross);
    this.hitmark = el('div', 'hitmarker', r);

    // ---- prompt ----------------------------------------------------------
    this.prompt = el('div', 'prompt', r);
    this.prompt.style.display = 'none';

    // ---- action feedback -------------------------------------------------
    this.castbar = el('div', 'castbar', r);
    this.castFill = el('i', null, this.castbar);
    this.castLabel = el('span', null, this.castbar, '');
    this.castbar.style.display = 'none';
    this.damageFx = el('div', 'damagefx', r);

    // ---- joystick --------------------------------------------------------
    this.stickZone = el('div', 'stickzone', r);
    this.stickBase = el('div', 'stickbase', this.stickZone);
    this.stickKnob = el('div', 'stickknob', this.stickBase);

    // ---- right hand buttons ---------------------------------------------
    const pad = el('div', 'buttons', r);
    this.btn = {};
    const mk = (id, label, cls) => {
      const b = el('div', 'btn ' + (cls || '') + ' b-' + id, pad);
      el('span', null, b, label);
      this.btn[id] = b;
      return b;
    };
    mk('build', 'BUILD', 'small');
    mk('reload', 'RELOAD', 'small');
    mk('use', 'USE', 'small');
    mk('crouch', 'CROUCH', 'small');
    mk('jump', 'JUMP', 'small');
    mk('aim', 'AIM', 'mid');
    mk('shoot', '', 'big');

    // ---- build bar -------------------------------------------------------
    this.buildBar = el('div', 'buildbar', r);
    this.buildBtns = {};
    for (const t of BUILD_TYPES) {
      const b = el('div', 'bpiece', this.buildBar);
      el('div', 'bicon i-' + t, b);
      el('span', null, b, t.toUpperCase());
      this.buildBtns[t] = b;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        this.input.buildType = t;
        this.refreshBuildBar();
      });
    }
    this.buildBar.style.display = 'none';

    // ---- inventory -------------------------------------------------------
    this.invBar = el('div', 'invbar', r);
    this.slots = [];
    for (let i = 0; i < 6; i++) {
      const s = el('div', 'slot', this.invBar);
      el('div', 'sname', s, '');
      el('div', 'scount', s, '');
      el('div', 'skey', s, i === 5 ? 'PICK' : String(i + 1));
      s.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); e.preventDefault();
        this.input.slotRequest = i;
      });
      this.slots.push(s);
    }

    // ---- ammo ------------------------------------------------------------
    this.ammo = el('div', 'ammo', r);
    this.ammoMag = el('span', 'mag', this.ammo, '');
    this.ammoRes = el('span', 'res', this.ammo, '');
  }

  refreshBuildBar() {
    for (const t of BUILD_TYPES) this.buildBtns[t].classList.toggle('on', this.input.buildType === t);
  }

  // ------------------------------------------------------------------ input
  bindKeyboard() {
    const down = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k >= '1' && k <= '5') this.input.slotRequest = parseInt(k, 10) - 1;
      if (k === '6' || k === 'x') this.input.slotRequest = 5;
      if (k === 'r') this.input.reload = true;
      if (k === 'e' || k === 'f') this.input.use = true;
      if (k === 'q') this.toggleBuild();
      if (k === 'c') this.input.crouch = !this.input.crouch;
      if (k === ' ') { this.input.jump = true; e.preventDefault(); }
      if (this.input.buildMode) {
        const map = { z: 'wall', v: 'floor', b: 'ramp', n: 'pyramid' };
        if (map[k]) { this.input.buildType = map[k]; this.refreshBuildBar(); }
      }
      if (k === 'escape') this.game.togglePause && this.game.togglePause();
    };
    const up = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', () => this.keys.clear());
    this._kb = { down, up };
  }

  readKeyboardMove() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('w') || k.has('arrowup')) y += 1;
    if (k.has('s') || k.has('arrowdown')) y -= 1;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, sprint: k.has('shift') };
  }

  bindPointer() {
    const canvasArea = document.body;
    this.stickId = null;
    this.lookId = null;
    this.lookLast = { x: 0, y: 0 };

    const stickStart = (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.stickBase.style.left = e.clientX + 'px';
      this.stickBase.style.top = e.clientY + 'px';
      this.stickBase.classList.add('on');
      this.stickZone.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const stickMove = (e) => {
      if (e.pointerId !== this.stickId) return;
      const dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y;
      const max = 62;
      const d = Math.hypot(dx, dy);
      const s = d > max ? max / d : 1;
      const kx = dx * s, ky = dy * s;
      this.stickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
      this.input.move.x = kx / max;
      this.input.move.y = -ky / max;
      this.input.sprint = Math.hypot(this.input.move.x, this.input.move.y) > 0.86;
    };
    const stickEnd = (e) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.input.move.x = 0; this.input.move.y = 0;
      this.input.sprint = false;
      this.stickKnob.style.transform = 'translate(0,0)';
      this.stickBase.classList.remove('on');
    };
    this.stickZone.addEventListener('pointerdown', stickStart);
    this.stickZone.addEventListener('pointermove', stickMove);
    this.stickZone.addEventListener('pointerup', stickEnd);
    this.stickZone.addEventListener('pointercancel', stickEnd);

    // look: dragging anywhere that is not a control
    const lookStart = (e) => {
      if (this.lookId !== null) return;
      if (e.target.closest && e.target.closest('.btn, .slot, .stickzone, .bpiece, .panel')) return;
      this.lookId = e.pointerId;
      this.lookLast.x = e.clientX; this.lookLast.y = e.clientY;
      this.lookMoved = 0;
    };
    const lookMove = (e) => {
      if (e.pointerId !== this.lookId) return;
      const dx = e.clientX - this.lookLast.x, dy = e.clientY - this.lookLast.y;
      this.lookLast.x = e.clientX; this.lookLast.y = e.clientY;
      this.input.look.x += dx;
      this.input.look.y += dy;
      this.lookMoved += Math.abs(dx) + Math.abs(dy);
    };
    const lookEnd = (e) => { if (e.pointerId === this.lookId) this.lookId = null; };
    canvasArea.addEventListener('pointerdown', lookStart);
    window.addEventListener('pointermove', lookMove);
    window.addEventListener('pointerup', lookEnd);
    window.addEventListener('pointercancel', lookEnd);

    // mouse look with pointer lock on desktop
    const canvas = document.getElementById('game-canvas');
    canvas.addEventListener('mousedown', (e) => {
      if (this.game.state !== 'match') return;
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
      if (e.button === 0) this.input.shoot = true;
      if (e.button === 2) this.input.aim = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.shoot = false;
      if (e.button === 2) this.input.aim = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.input.look.x += e.movementX;
        this.input.look.y += e.movementY;
      }
    });
    window.addEventListener('wheel', (e) => {
      const p = this.game.player;
      if (!p) return;
      const dir = Math.sign(e.deltaY);
      let s = p.inv.selected + dir;
      if (s < 0) s = 5; if (s > 5) s = 0;
      this.input.slotRequest = s;
    }, { passive: true });

    // buttons
    const hold = (name, key) => {
      const b = this.btn[name];
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.input[key] = true; b.classList.add('down'); });
      const end = (e) => { e.preventDefault(); this.input[key] = false; b.classList.remove('down'); };
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('pointerleave', end);
    };
    const tap = (name, fn) => {
      const b = this.btn[name];
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); fn(); });
      const end = () => b.classList.remove('down');
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('pointerleave', end);
    };
    hold('shoot', 'shoot');
    hold('aim', 'aim');
    tap('jump', () => { this.input.jump = true; });
    tap('reload', () => { this.input.reload = true; });
    tap('use', () => { this.input.use = true; });
    tap('crouch', () => { this.input.crouch = !this.input.crouch; });
    tap('build', () => this.toggleBuild());
  }

  toggleBuild() {
    this.input.buildMode = !this.input.buildMode;
    this.buildBar.style.display = this.input.buildMode ? 'flex' : 'none';
    this.btn.build.classList.toggle('on', this.input.buildMode);
    this.refreshBuildBar();
  }

  // ------------------------------------------------------------------ view
  killFeed(text, mine) {
    const line = el('div', 'kfline' + (mine ? ' mine' : ''), this.feed, text);
    setTimeout(() => line.classList.add('fade'), 3200);
    setTimeout(() => line.remove(), 4200);
    while (this.feed.children.length > 5) this.feed.firstChild.remove();
  }

  showHit(elim) {
    this.hitmark.classList.remove('on', 'elim');
    void this.hitmark.offsetWidth;
    this.hitmark.classList.add('on');
    if (elim) this.hitmark.classList.add('elim');
  }

  flashDamage() {
    this.damageFx.classList.remove('on');
    void this.damageFx.offsetWidth;
    this.damageFx.classList.add('on');
  }

  update(p, game) {
    // vitals
    const hp = Math.max(0, Math.round(p.health));
    const sh = Math.max(0, Math.round(p.shield));
    this.hpFill.style.width = (hp / p.maxHealth * 100) + '%';
    this.shieldFill.style.width = (sh / p.maxShield * 100) + '%';
    this.hpTxt.textContent = hp;
    this.shieldTxt.textContent = sh;

    this.aliveTxt.textContent = game.aliveCount;
    this.killsTxt.textContent = p.kills;
    this.woodTxt.textContent = p.inv.wood;

    // inventory
    for (let i = 0; i < 6; i++) {
      const s = this.slots[i];
      const isPick = i === 5;
      const it = isPick ? { name: 'Pickaxe', rarity: 'common' } : p.inv.slots[i];
      s.classList.toggle('on', p.inv.selected === i);
      s.classList.toggle('empty', !it);
      const nm = s.children[0], ct = s.children[1];
      if (it) {
        nm.textContent = isPick ? 'Pickaxe' : it.name;
        nm.style.color = '#fff';
        s.style.borderColor = '#' + RARITY[it.rarity].color.toString(16).padStart(6, '0');
        s.style.background = `linear-gradient(180deg, #${RARITY[it.rarity].color.toString(16).padStart(6, '0')}33, rgba(8,10,14,0.72))`;
        ct.textContent = it.kind === 'item' ? 'x' + it.count : '';
      } else {
        nm.textContent = '';
        ct.textContent = '';
        s.style.borderColor = 'rgba(255,255,255,0.16)';
        s.style.background = 'rgba(8,10,14,0.45)';
      }
    }

    // ammo
    const w = p.weapon;
    if (w) {
      this.ammo.style.display = 'flex';
      this.ammoMag.textContent = w.ammo;
      this.ammoRes.textContent = '/ ' + w.reserve;
      this.ammoMag.style.color = w.ammo === 0 ? '#ff6a5a' : '#fff';
    } else this.ammo.style.display = 'none';

    // cast bar for reload / heal
    let cast = 0, label = '';
    if (p.reloadT > 0) { cast = 1 - p.reloadT / p.reloadTotal; label = 'RELOADING'; }
    else if (p.useT > 0) {
      cast = 1 - p.useT / p.useTotal;
      const it = p.inv.slots[p.useSlot];
      label = it ? it.def.verb.toUpperCase() : 'USING';
    }
    if (cast > 0) {
      this.castbar.style.display = 'block';
      this.castFill.style.width = (cast * 100) + '%';
      this.castLabel.textContent = label;
    } else this.castbar.style.display = 'none';

    // crosshair spread feedback
    const spread = w ? (p.aiming ? w.adsSpread : w.spread) * (p.speed2D > 4 ? 1.7 : 1) : 2.2;
    this.cross.style.setProperty('--gap', (6 + spread * 4.5) + 'px');
    this.cross.style.opacity = p.inv.holdingPickaxe ? 0.35 : 1;

    // build mode
    this.buildBar.style.display = this.input.buildMode ? 'flex' : 'none';
    if (this.input.buildMode) {
      for (const t of BUILD_TYPES) {
        this.buildBtns[t].classList.toggle('poor', p.inv.wood < BUILD_COST);
      }
    }
  }

  setPrompt(text) {
    if (!text) { this.prompt.style.display = 'none'; return; }
    this.prompt.style.display = 'block';
    this.prompt.innerHTML = text;
  }
}
