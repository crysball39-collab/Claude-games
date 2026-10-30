/* =============================================================================
   The heads-up display: health and stamina top left, the round top centre,
   coins, the bag and pause top right; banners and short notes in the middle;
   health bars over the heads of the box ragdolls you have hurt, and coins
   rising off the ones you have put down.
   ========================================================================== */
import { Vector3 } from 'three';
import { $, clamp } from '../core/util.js';

const _v = new Vector3();

export class Hud {
  constructor(game) {
    this.game = game;
    this.root = $('#hud');
    this.hpFill = $('#hp-fill');
    this.hpLag = $('#hp-lag');
    this.hpText = $('#hp-text');
    this.hp = $('#hp');
    this.stFill = $('#st-fill');
    this.st = $('#st');
    this.coinsEl = $('#coins');
    this.coinsBox = $('#coins-box');
    this.waveLabel = $('#wave-label');
    this.waveLeft = $('#wave-left');
    this.bannerEl = $('#banner');
    this.bannerBig = $('#banner-big');
    this.bannerSmall = $('#banner-small');
    this.toastEl = $('#toast');
    this.hintEl = $('#hint');
    this.contextEl = $('#btn-context');
    this.hurtEl = $('#hurt');
    this.floaters = $('#floaters');
    this.punchLabel = $('#punch-label');
    this.btn = {
      crouch: $('#btn-crouch'), sprint: $('#btn-sprint'), punch: $('#btn-punch'), kick: $('#btn-kick'), jump: $('#btn-jump'), block: $('#btn-block'),
    };
    this.bars = new Map();
    this.pops = [];
    this.bannerT = 0;
    this.toastT = 0;
    this.hurtT = 0;
    this.lastHp = -1;
    this.lastCoins = -1;
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  setCoins(n, bump = false) {
    if (n === this.lastCoins) return;
    this.lastCoins = n;
    this.coinsEl.textContent = n;
    if (bump) {
      this.coinsBox.classList.remove('bump');
      void this.coinsBox.offsetWidth;
      this.coinsBox.classList.add('bump');
    }
  }

  banner(big, small = '', dur = 2) {
    this.bannerBig.textContent = big;
    this.bannerSmall.textContent = small;
    this.bannerEl.classList.remove('pop');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show', 'pop');
    this.bannerT = dur;
  }

  toast(text, dur = 2.4) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastT = dur;
  }

  hint(text) {
    if (this.hintText === text) return;
    this.hintText = text;
    if (text) this.hintEl.textContent = text;
    this.hintEl.classList.toggle('show', !!text);
  }

  context(label) {
    if (this.contextLabel === label) return;
    this.contextLabel = label;
    if (label) this.contextEl.textContent = label;
    this.contextEl.classList.toggle('hidden', !label);
  }

  hurt() {
    this.hurtEl.classList.add('show');
    this.hurtT = 0.12;
  }

  /** Coins rising off a body. */
  coinPop(at, n) {
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = `+${n}`;
    this.floaters.appendChild(el);
    this.pops.push({ el, at: at.clone(), t: 0 });
  }

  /** Pins an element to a world point; false if the point is behind the camera. */
  project(el, p, dy = 0) {
    _v.copy(p).project(this.game.camera);
    if (_v.z > 1 || _v.z < -1) { el.style.opacity = '0'; return false; }
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-_v.y * 0.5 + 0.5) * window.innerHeight + dy;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    return true;
  }

  update(dt) {
    const g = this.game, p = g.player;
    if (p) {
      const hp = clamp(p.health / p.maxHealth, 0, 1);
      if (hp !== this.lastHp) {
        if (hp < this.lastHp) this.hpLag.style.transform = `scaleX(${hp})`;
        else this.hpLag.style.transform = `scaleX(${hp})`;
        this.hpFill.style.transform = `scaleX(${hp})`;
        this.hpText.textContent = Math.ceil(Math.max(0, p.health));
        this.hp.classList.toggle('low', hp < 0.3 && p.alive);
        this.lastHp = hp;
      }
      this.stFill.style.transform = `scaleX(${clamp(p.stamina / p.maxStamina, 0, 1)})`;
      this.st.classList.toggle('winded', p.winded);
      const c = p.controller;
      this.btn.sprint.classList.toggle('on', !!(c && c.sprintOn));
      this.btn.crouch.classList.toggle('on', p.wantCrouch);
      for (const k of ['punch', 'kick', 'jump']) this.btn[k].classList.toggle('tired', p.winded);
      this.punchLabel.textContent = p.weapon ? 'SLASH' : 'PUNCH';
    }

    // the round
    const w = g.waves;
    let label, left = '';
    if (w.state === 'rest' || w.state === 'idle') { label = `WAVE ${w.wave}`; left = 'NEXT'; }
    else if (w.state === 'defeat') { label = `WAVE ${w.wave}`; left = 'FALLEN'; }
    else if (w.state === 'cleared') { label = `WAVE ${w.wave - 1}`; left = 'CLEARED'; }
    else { label = `WAVE ${w.wave}`; left = `${w.left} LEFT`; }
    if (label !== this.wl) { this.waveLabel.textContent = label; this.wl = label; }
    if (left !== this.wlf) { this.waveLeft.textContent = left; this.wlf = left; }

    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerEl.classList.remove('show'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('show'); }
    if (this.hurtT > 0) { this.hurtT -= dt; if (this.hurtT <= 0) this.hurtEl.classList.remove('show'); }

    this.enemyBars();
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const f = this.pops[i];
      f.t += dt;
      if (f.t > 1.2) { f.el.remove(); this.pops.splice(i, 1); continue; }
      _v.copy(f.at);
      _v.y += 2 + f.t * 0.9;
      this.project(f.el, _v);
      f.el.style.opacity = String(Math.min(1, (1.2 - f.t) * 2.5));
    }
  }

  /** Little health bars over the heads of the hurt. */
  enemyBars() {
    const g = this.game;
    const seen = new Set();
    for (const f of g.fighters) {
      if (f.team !== 'enemy' || !f.alive || f.removed) continue;
      const boss = f.spec && f.spec.boss;
      if (!boss && f.health >= f.maxHealth) continue;
      seen.add(f.id);
      let b = this.bars.get(f.id);
      if (!b) {
        const el = document.createElement('div');
        el.className = 'ebar' + (boss ? ' boss' : '');
        el.innerHTML = '<i></i>';
        this.floaters.appendChild(el);
        b = { el, fill: el.firstChild, k: -1 };
        this.bars.set(f.id, b);
      }
      _v.copy(f.head.x);
      _v.y += 0.32;
      b.el.style.opacity = this.project(b.el, _v) ? '1' : '0';
      const k = Math.max(0, f.health / f.maxHealth);
      if (k !== b.k) { b.fill.style.transform = `scaleX(${k})`; b.k = k; }
    }
    for (const [id, b] of this.bars) {
      if (!seen.has(id)) { b.el.remove(); this.bars.delete(id); }
    }
  }

  clearFloaters() {
    for (const b of this.bars.values()) b.el.remove();
    this.bars.clear();
    for (const f of this.pops) f.el.remove();
    this.pops = [];
  }
}
