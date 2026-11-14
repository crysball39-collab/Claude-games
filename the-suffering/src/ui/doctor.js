/* =============================================================================
   Doctor mode.

   Tap a person and read them: an overall condition, the vital signs behind
   it, what they are feeling, every wound and what it is costing them, an
   X-ray with each bone and organ coloured by the state it is in, and - since
   everyone here has a mind - what they can see, hear and feel at this moment.
   ========================================================================== */
import { BONES, ORGANS, AMBIENT_TEMP } from '../human/health.js';
import { P, PARTS } from '../human/rig.js';
import { EMOTIONS } from '../mind/mind.js';
import { $, $$, el, clamp, clamp01 } from '../core/util.js';

const VITALS = [
  ['blood', 'Blood'], ['air', 'Air'], ['pulse', 'Pulse'], ['pain', 'Pain'], ['shock', 'Shock'], ['nausea', 'Nausea'], ['temp', 'Temp'], ['breath', 'Breath'],
];

/* the X-ray is drawn from the rig's own measurements: 228 pixels to the metre */
const S = 228, CX = 180, BASE = 478;
const X = (m) => CX + m * S, Y = (m) => BASE - m * S;

export class Doctor {
  constructor(game) {
    this.g = game;
    this.on = false; this.tab = 'vitals';
    this.panel = $('#doctor');
    this.rows = {};
    const mk = (host, key, label, cls) => {
      const row = el('div', 'meter ' + (cls || ''));
      const l = el('label', null, label), t = el('div', 'track'), f = el('div', 'fill'), o = el('output', null, '-');
      t.appendChild(f); row.append(l, t, o);
      host.appendChild(row);
      this.rows[key] = { row, f, o, cls: cls || '' };
    };
    for (const [k, label] of VITALS) mk($('#doc-vitals'), k, label);
    for (const k of EMOTIONS) mk($('#doc-emotions'), 'e_' + k, k, 'emo');
    this.ecg = $('#doc-ecg').getContext('2d');
    this.xr = $('#doc-xray').getContext('2d');
    this.ecgX = 0; this.beat = 0; this.lastY = 27; this.acc = 0; this.scan = 0;
    for (const b of $$('#doc-tabs button')) b.addEventListener('click', () => this.setTab(b.dataset.tab));
  }

  setTab(tab) {
    this.tab = tab;
    for (const b of $$('#doc-tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
    for (const s of $$('#doc-body section')) s.hidden = s.dataset.pane !== tab;
    this.acc = 1;
  }

  open(on) {
    this.on = on;
    this.panel.hidden = !on;
    this.g.doctor = on ? this : null;
    if (on) { this.acc = 1; if (!this.g.selected) this._empty(); }
  }

  select(h) {
    this.g.selected = h;
    this.acc = 1;
    this.ecg.clearRect(0, 0, 320, 54); this.ecgX = 0;
    if (!h) this._empty();
  }

  _empty() {
    $('#doc-name').textContent = 'Nobody selected';
    $('#doc-sub').textContent = 'Tap a person in the street';
    $('#doc-cond-label').textContent = '-'; $('#doc-cond-label').className = '';
    $('#doc-cond-note').textContent = '';
  }

  update(dt) {
    if (!this.on) return;
    const h = this.g.selected;
    if (!h || h.removed) { if (h) this.select(null); return; }
    this._ecg(dt, h.h);
    this.acc += dt;
    if (this.acc < 0.16) return;
    this.acc = 0;
    this._head(h);
    if (this.tab === 'vitals') this._vitals(h);
    else if (this.tab === 'xray') this._xray(h);
    else this._mind(h);
  }

  _head(h) {
    const hh = h.h, c = hh.condition, L = h.look;
    $('#doc-name').textContent = h.isPlayer ? 'You' : L.name;
    // what they have on and about them is part of the picture
    const kit = (h.isPlayer ? this.g.weapons.inventory : h.kit || []).map((i) => i.def.name + (h.weapon === i ? ' in hand' : ''));
    const extra = (h.vest ? ', light vest' + (h.vest.hits ? ` (hit ${h.vest.hits} time${h.vest.hits === 1 ? '' : 's'})` : '') : '') + (kit.length ? ', carrying ' + kit.join(' and ') : '');
    $('#doc-sub').textContent = (h.isPlayer ? `${L.outfit}` : `${L.age}, ${L.noun}, ${L.outfit}`) + extra;
    const label = $('#doc-cond-label');
    label.textContent = c.label; label.className = c.tone;
    $('#doc-cond-note').textContent = !hh.alive ? hh.cause + (hh.timeDead > 1 ? ` - ${fmtTime(hh.timeDead)} ago` : '')
      : c.aware + (hh.heartStopped ? ' - heart stopped' + (hh.mechanism ? ': ' + hh.mechanism.toLowerCase() : '') : hh.mechanism ? ' - ' + hh.mechanism.toLowerCase() : '');
  }

  _set(key, pct, text, tone) {
    const r = this.rows[key];
    r.f.style.width = clamp(pct, 0, 100).toFixed(1) + '%';
    r.o.textContent = text;
    r.row.className = 'meter ' + r.cls + (tone ? ' ' + tone : '');
  }

  _vitals(h) {
    const hh = h.h, bp = hh.bloodPct;
    this._set('blood', bp, `${Math.round(bp)}% ${(hh.blood / 1000).toFixed(1)}L`, bp < 60 ? 'bad' : bp < 82 ? 'warn' : '');
    this._set('air', hh.air, `${Math.round(hh.air)}%`, hh.air < 60 ? 'bad' : hh.air < 88 ? 'warn' : '');
    this._set('pulse', hh.pulse / 2, `${Math.round(hh.pulse)} bpm`, hh.pulse < 35 ? 'bad' : hh.pulse > 135 ? 'warn' : '');
    this._set('pain', hh.pain, `${Math.round(hh.pain)}`, hh.pain > 60 ? 'bad' : hh.pain > 25 ? 'warn' : '');
    this._set('shock', hh.shock, `${Math.round(hh.shock)}`, hh.shock > 60 ? 'bad' : hh.shock > 25 ? 'warn' : '');
    this._set('nausea', hh.nausea, `${Math.round(hh.nausea)}`, hh.nausea > 70 ? 'bad' : hh.nausea > 40 ? 'warn' : '');
    this._set('temp', (hh.temp - AMBIENT_TEMP) / (40 - AMBIENT_TEMP) * 100, `${hh.temp.toFixed(1)}°C`, hh.temp < 34 ? 'bad' : hh.temp < 35.6 ? 'cool' : hh.temp > 38.2 ? 'warn' : '');
    this._set('breath', hh.breath / 45 * 100, `${Math.round(hh.breath)}/min`, hh.breath < 6 ? 'bad' : hh.breath > 30 ? 'warn' : '');
    const emo = h.mind ? h.mind.emo : null;
    for (const k of EMOTIONS) this._set('e_' + k, emo ? emo[k] : 0, emo ? String(Math.round(emo[k])) : '-', '');

    const ul = $('#doc-wounds');
    ul.textContent = '';
    let bruises = 0;
    const add = (name, right, cls) => { const li = el('li', cls); li.append(el('span', null, name), el('span', null, right)); ul.appendChild(li); };
    for (const w of hh.wounds) {
      if (w.gone || w.dropped) continue;
      if (w.type === 'bruise') { bruises++; continue; }
      const where = w.type === 'stump' ? (w.stumpOf != null ? PARTS[w.stumpOf].label : PARTS[w.part].label) : PARTS[w.part].label;
      const flow = w.flow || 0;
      add(`${w.name}, ${where}`, flow > 0.05 ? `${flow.toFixed(1)} ml/s${w.arterial ? ' artery' : ''}` : hh.alive ? 'closed' : 'still', w.arterial || flow > 8 ? 'bad' : flow > 0.5 ? 'warn' : '');
    }
    if (bruises) add(bruises > 1 ? `Bruises x${bruises}` : 'Bruise', '', '');
    if (hh.bleedIn > 0.3) add('Bleeding inside', `${hh.bleedIn.toFixed(1)} ml/s`, 'bad');
    if (hh.bleedOut > 0.05) add('Losing in all', `${(hh.bleedOut + hh.bleedIn).toFixed(1)} ml/s`, hh.bleedOut + hh.bleedIn > 10 ? 'bad' : 'warn');
    if (!ul.children.length) ul.appendChild(el('li', 'empty', 'No wounds.'));
  }

  /** A heart trace that runs at the patient's own pulse. */
  _ecg(dt, hh) {
    const c = this.ecg, W = 320, H = 54;
    const speed = 70, x0 = this.ecgX, x1 = x0 + speed * dt;
    this.beat += dt * hh.pulse / 60;
    const p = this.beat % 1;
    let v = 0;
    if (hh.pulse > 1) {
      // the shape of one beat: a small bump, a tall spike, a rounded hill
      if (p > 0.08 && p < 0.16) v = 0.12 * Math.sin((p - 0.08) / 0.08 * Math.PI);
      else if (p > 0.2 && p < 0.225) v = -0.16;
      else if (p >= 0.225 && p < 0.26) v = 1;
      else if (p >= 0.26 && p < 0.29) v = -0.3;
      else if (p > 0.42 && p < 0.58) v = 0.22 * Math.sin((p - 0.42) / 0.16 * Math.PI);
      v *= clamp(0.5 + hh.bloodPct / 200, 0.5, 1);
    } else v = (Math.random() - 0.5) * 0.02;
    const y = H * 0.62 - v * H * 0.5;
    c.fillStyle = '#0b1013';
    c.fillRect(x1 % W, 0, 14, H);
    c.strokeStyle = !hh.alive ? '#6b7378' : hh.heartStopped || hh.pulse < 35 || hh.pulse > 150 ? '#e2533f' : '#86c47e';
    c.lineWidth = 1.8; c.lineJoin = 'round';
    c.beginPath();
    if (Math.floor(x0 / W) === Math.floor(x1 / W)) { c.moveTo(x0 % W, this.lastY); c.lineTo(x1 % W, y); } else { c.moveTo(0, y); c.lineTo(x1 % W, y); }
    c.stroke();
    this.ecgX = x1; this.lastY = y;
  }

  /* ---------------------------------- x-ray ------------------------------- */

  _xray(h) {
    const c = this.xr, hh = h.h, t = this.g.time;
    c.clearRect(0, 0, 360, 500);
    const g = c.createRadialGradient(180, 250, 30, 180, 250, 300);
    g.addColorStop(0, '#0d1a22'); g.addColorStop(1, '#04080b');
    c.fillStyle = g; c.fillRect(0, 0, 360, 500);

    // the body, as a shadow
    for (let i = 0; i < PARTS.length; i++) {
      const p = PARTS[i], w = p.size[0] * S, ht = p.size[1] * S;
      const x = X(p.c[0]) - w / 2, y = Y(p.c[1]) - ht / 2;
      if (hh.missing[i]) { c.setLineDash([4, 4]); c.strokeStyle = 'rgba(152,161,166,0.5)'; c.lineWidth = 1; c.strokeRect(x, y, w, ht); c.setLineDash([]); }
      else { c.fillStyle = 'rgba(120,170,190,0.13)'; c.fillRect(x, y, w, ht); }
    }

    const boneCol = (id) => { const s = hh.boneState(id); return s === 'missing' ? null : s === 'broken' ? '#e2533f' : s === 'fractured' ? '#e2bb52' : '#cfe9f2'; };
    const bone = (id, draw) => {
      const col = boneCol(id);
      if (!col) return;
      c.strokeStyle = col; c.fillStyle = col; c.shadowColor = col; c.shadowBlur = col === '#cfe9f2' ? 5 : 9;
      draw(col);
      c.shadowBlur = 0;
    };
    const seg = (x0, y0, x1, y1, w) => { c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(X(x0), Y(y0)); c.lineTo(X(x1), Y(y1)); c.stroke(); };
    const crack = (id, x, y) => {
      const s = hh.boneState(id);
      if (s !== 'broken' && s !== 'fractured') return;
      c.strokeStyle = '#05090c'; c.lineWidth = s === 'broken' ? 3 : 1.6; c.shadowBlur = 0;
      c.beginPath(); c.moveTo(X(x) - 7, Y(y) - 4); c.lineTo(X(x) - 2, Y(y) + 2); c.lineTo(X(x) + 2, Y(y) - 3); c.lineTo(X(x) + 7, Y(y) + 4); c.stroke();
    };

    // spine, from the neck down
    bone('cspine', () => { for (let i = 0; i < 4; i++) c.fillRect(X(0) - 5, Y(1.675 - i * 0.022) - 2, 10, 3.5); });
    bone('tspine', () => { for (let i = 0; i < 9; i++) c.fillRect(X(0) - 6, Y(1.575 - i * 0.03) - 2.5, 12, 4.5); });
    bone('lspine', () => { for (let i = 0; i < 6; i++) c.fillRect(X(0) - 7.5, Y(1.285 - i * 0.033) - 3, 15, 5.5); });
    crack('cspine', 0, 1.64); crack('tspine', 0, 1.45); crack('lspine', 0, 1.2);
    for (const side of [1, -1]) {
      bone(side > 0 ? 'ribsL' : 'ribsR', () => {
        c.lineWidth = 2.6; c.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
          const y = 1.565 - i * 0.034, reach = 0.115 + Math.sin((i + 1) / 8 * Math.PI) * 0.05;
          c.beginPath(); c.moveTo(X(side * 0.012), Y(y));
          c.quadraticCurveTo(X(side * reach * 1.15), Y(y + 0.012), X(side * reach), Y(y - 0.035));
          if (i < 5) c.quadraticCurveTo(X(side * reach * 0.6), Y(y - 0.06), X(side * 0.02), Y(y - 0.05 + i * 0.004));
          c.stroke();
        }
      });
      crack(side > 0 ? 'ribsL' : 'ribsR', side * 0.11, 1.44);
      bone(side > 0 ? 'clavL' : 'clavR', () => seg(side * 0.02, 1.578, side * 0.205, 1.562, 4));
      crack(side > 0 ? 'clavL' : 'clavR', side * 0.11, 1.57);
      const hum = side > 0 ? 'humerusL' : 'humerusR', fa = side > 0 ? 'forearmL' : 'forearmR', hd = side > 0 ? 'handL' : 'handR';
      bone(hum, () => { seg(side * 0.235, 1.545, side * 0.235, 1.275, 6.5); c.beginPath(); c.arc(X(side * 0.235), Y(1.55), 6, 0, 7); c.arc(X(side * 0.235), Y(1.268), 5, 0, 7); c.fill(); });
      crack(hum, side * 0.235, 1.41);
      bone(fa, () => { seg(side * 0.222, 1.245, side * 0.226, 1.0, 3.2); seg(side * 0.248, 1.245, side * 0.244, 1.0, 2.8); });
      crack(fa, side * 0.235, 1.12);
      bone(hd, () => { for (let f = -2; f <= 2; f++) seg(side * 0.235 + f * 0.006, 0.985, side * 0.235 + f * 0.013, 0.89 + Math.abs(f) * 0.012, 1.8); });
      const fe = side > 0 ? 'femurL' : 'femurR', ti = side > 0 ? 'tibiaL' : 'tibiaR', ft = side > 0 ? 'footL' : 'footR';
      bone(fe, () => { seg(side * 0.105, 0.925, side * 0.1, 0.515, 8); c.beginPath(); c.arc(X(side * 0.1), Y(0.94), 7.5, 0, 7); c.arc(X(side * 0.1), Y(0.505), 7, 0, 7); c.fill(); });
      crack(fe, side * 0.1, 0.72);
      bone(ti, () => { seg(side * 0.092, 0.48, side * 0.095, 0.09, 5.5); seg(side * 0.118, 0.47, side * 0.115, 0.1, 2.4); });
      crack(ti, side * 0.1, 0.29);
      bone(ft, () => { for (let f = -1; f <= 1; f++) seg(side * 0.1 + f * 0.008, 0.07, side * 0.1 + f * 0.022, 0.012, 2.4); c.beginPath(); c.arc(X(side * 0.1), Y(0.075), 5, 0, 7); c.fill(); });
    }
    bone('sternum', () => { c.fillRect(X(0) - 4.5, Y(1.56), 9, 0.2 * S * 0.9); });
    crack('sternum', 0, 1.48);
    bone('pelvis', () => {
      c.lineWidth = 5.5;
      for (const side of [1, -1]) { c.beginPath(); c.ellipse(X(side * 0.085), Y(1.01), 0.068 * S, 0.075 * S, side * 0.35, 0, 7); c.stroke(); }
      c.beginPath(); c.moveTo(X(-0.035), Y(1.07)); c.lineTo(X(0.035), Y(1.07)); c.lineTo(X(0), Y(0.95)); c.closePath(); c.fill();
    });
    crack('pelvis', 0.08, 1.0);
    bone('skull', () => {
      c.lineWidth = 4; c.beginPath(); c.ellipse(X(0), Y(1.815), 0.086 * S, 0.1 * S, 0, 0, 7); c.stroke();
      c.fillStyle = 'rgba(207,233,242,0.2)'; c.fill();
      c.fillStyle = '#05090c'; c.shadowBlur = 0;
      c.beginPath(); c.ellipse(X(-0.036), Y(1.82), 9, 7.5, 0, 0, 7); c.ellipse(X(0.036), Y(1.82), 9, 7.5, 0, 0, 7); c.fill();
      c.beginPath(); c.moveTo(X(0), Y(1.79)); c.lineTo(X(-0.012), Y(1.757)); c.lineTo(X(0.012), Y(1.757)); c.closePath(); c.fill();
    });
    crack('skull', 0.03, 1.88);
    bone('jaw', () => { c.lineWidth = 4.5; c.beginPath(); c.moveTo(X(-0.07), Y(1.762)); c.quadraticCurveTo(X(-0.06), Y(1.69), X(0), Y(1.685)); c.quadraticCurveTo(X(0.06), Y(1.69), X(0.07), Y(1.762)); c.stroke();
      c.lineWidth = 1.5; c.strokeStyle = '#05090c'; c.shadowBlur = 0; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(X(i * 0.011), Y(1.738)); c.lineTo(X(i * 0.011), Y(1.722)); c.stroke(); } });
    crack('jaw', -0.04, 1.71);

    // organs, tinted by how much of each is left
    const organ = (id, draw, back) => {
      const v = hh.organs[id];
      if (v < 0) return;
      const k = clamp01(v / 100);
      const r = Math.round(230 - 130 * k), gr = Math.round(60 + 160 * k), b = Math.round(50 + 110 * k);
      c.fillStyle = v <= 0 ? 'rgba(25,10,10,0.9)' : `rgba(${r},${gr},${b},${back ? 0.3 : 0.5})`;
      c.strokeStyle = v <= 0 ? '#e2533f' : `rgba(${r},${gr},${b},0.95)`;
      c.lineWidth = 1.4;
      c.beginPath(); draw(); c.fill(); c.stroke();
    };
    organ('kidneyL', () => c.ellipse(X(0.075), Y(1.175), 9, 13, 0.2, 0, 7), true);
    organ('kidneyR', () => c.ellipse(X(-0.075), Y(1.175), 9, 13, -0.2, 0, 7), true);
    organ('lungL', () => { c.moveTo(X(0.035), Y(1.55)); c.quadraticCurveTo(X(0.15), Y(1.56), X(0.155), Y(1.4)); c.quadraticCurveTo(X(0.15), Y(1.335), X(0.05), Y(1.345)); c.closePath(); });
    organ('lungR', () => { c.moveTo(X(-0.035), Y(1.55)); c.quadraticCurveTo(X(-0.15), Y(1.56), X(-0.155), Y(1.4)); c.quadraticCurveTo(X(-0.15), Y(1.335), X(-0.05), Y(1.345)); c.closePath(); });
    organ('airway', () => c.rect(X(0) - 4, Y(1.68), 8, 0.14 * S));
    const beat = hh.pulse > 1 ? 1 + 0.12 * Math.pow(Math.max(0, Math.sin(this.beat * Math.PI * 2)), 6) : 1;
    organ('heart', () => c.ellipse(X(0.026), Y(1.43), 15 * beat, 19 * beat, -0.5, 0, 7));
    organ('liver', () => { c.moveTo(X(-0.14), Y(1.3)); c.quadraticCurveTo(X(-0.02), Y(1.32), X(0.03), Y(1.27)); c.quadraticCurveTo(X(-0.06), Y(1.2), X(-0.14), Y(1.215)); c.closePath(); });
    organ('stomach', () => c.ellipse(X(0.06), Y(1.245), 17, 12, -0.5, 0, 7));
    organ('spleen', () => c.ellipse(X(0.115), Y(1.26), 7, 11, 0.4, 0, 7));
    organ('gut', () => { for (let r = 0; r < 4; r++) { const y = 1.17 - r * 0.036; c.moveTo(X(-0.09), Y(y)); c.bezierCurveTo(X(-0.04), Y(y + 0.03), X(0.04), Y(y - 0.03), X(0.09), Y(y)); c.lineTo(X(0.09), Y(y - 0.03)); c.bezierCurveTo(X(0.04), Y(y - 0.055), X(-0.04), Y(y), X(-0.09), Y(y - 0.03)); c.closePath(); } });
    organ('bladder', () => c.ellipse(X(0), Y(0.975), 10, 9, 0, 0, 7));
    organ('brain', () => c.ellipse(X(0), Y(1.845), 0.07 * S, 0.062 * S, 0, 0, 7));
    organ('eyeL', () => c.arc(X(0.036), Y(1.82), 5, 0, 7));
    organ('eyeR', () => c.arc(X(-0.036), Y(1.82), 5, 0, 7));

    // where the wounds are
    for (const w of hh.wounds) {
      if (w.gone || w.dropped || w.type === 'bruise') continue;
      const p = PARTS[w.part], sc = h.scale;
      const x = X(p.c[0] + w.x / sc), y = Y(p.c[1] + w.y / sc);
      const flow = w.flow || 0, pulse = flow > 0.05 ? 1 + 0.4 * Math.sin(t * 6) : 1;
      c.strokeStyle = '#ff5a48'; c.lineWidth = 1.6;
      c.beginPath(); c.arc(x, y, (w.type === 'stump' ? 9 : 5) * pulse, 0, 7); c.stroke();
      c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 3, y); c.moveTo(x, y - 3); c.lineTo(x, y + 3); c.stroke();
    }

    // the scanner's bar, travelling down
    this.scan = (this.scan + 0.012) % 1.3;
    const sy = this.scan * 500;
    const sg = c.createLinearGradient(0, sy - 26, 0, sy + 4);
    sg.addColorStop(0, 'rgba(116,219,233,0)'); sg.addColorStop(1, 'rgba(116,219,233,0.2)');
    c.fillStyle = sg; c.fillRect(0, sy - 26, 360, 30);
    c.fillStyle = 'rgba(152,161,166,0.75)'; c.font = '600 10px ui-monospace, Menlo, monospace';
    c.fillText('R', 10, 16); c.fillText('L', 342, 16);

    const ul = $('#doc-findings');
    ul.textContent = '';
    const list = hh.findings();
    for (const f of list) {
      const li = el('li', f.sev >= 2 ? 'bad' : f.sev === 1 ? 'warn' : '');
      li.append(el('span', null, f.name), el('span', null, f.kind === 'organ' && f.state !== 'missing' ? `${f.state} ${f.pct}%` : f.state));
      ul.appendChild(li);
    }
    if (!list.length) ul.appendChild(el('li', 'empty', 'Every bone intact, every organ healthy.'));
  }

  /* ---------------------------------- mind -------------------------------- */

  _mind(h) {
    const m = h.mind, now = this.g.time;
    const set = (id, text) => { $(id).textContent = text; };
    if (!m) {
      set('#doc-persona', 'This is you. What you see, hear and feel is on your side of the screen.');
      for (const id of ['#doc-doing', '#doc-sees', '#doc-hears', '#doc-feels', '#doc-said']) set(id, '-');
      $('#doc-memory').textContent = '';
      return;
    }
    const p = m.p, hh = h.h;
    set('#doc-persona', `${h.look.first} is a ${p.job}, ${p.errand}. ${cap(p.quirk)}.`);
    set('#doc-doing', hh.alive ? cap(m.doing) : 'Nothing, any more.');
    set('#doc-sees', !hh.alive ? '-' : !hh.conscious ? 'Nothing: unconscious.' : hh.blind >= 2 ? 'Nothing: blind.' : m.sees.length ? m.sees.slice(0, 4).map((s) => cap(s.text)).join('. ') + '.' : 'Nobody in view.');
    const heard = m.heard.filter((x) => now - x.t < 8).map((x) => cap(x.text));
    set('#doc-hears', !hh.alive ? '-' : !hh.conscious ? 'Nothing: unconscious.' : (m.deaf > 14 ? 'Ears ringing. ' : '') + (heard.length ? heard.slice(-3).join('. ') + '.' : 'Nothing but the street.'));
    set('#doc-feels', !hh.alive ? '-' : !hh.conscious ? 'Nothing: unconscious.' : m.feels.length ? cap(m.feels.join('; ')) + '.' : 'Fine.');
    set('#doc-said', m.said ? `"${m.said}"` + (m.saidAi ? '  (Claude)' : '') + (now - m.saidAt > 20 ? ` - ${fmtTime(now - m.saidAt)} ago` : '') : 'Nothing yet.');
    const ul = $('#doc-memory');
    ul.textContent = '';
    for (const x of m.memory.slice(-8).reverse()) {
      const li = el('li', 'mem');
      li.append(el('i', null, x.sense), document.createTextNode(cap(x.text)));
      ul.appendChild(li);
    }
    if (!m.memory.length) ul.appendChild(el('li', 'empty', 'An uneventful day so far.'));
  }
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function fmtTime(s) { return s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`; }
