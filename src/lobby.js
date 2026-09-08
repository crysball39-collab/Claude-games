// Lobby: your character idles on a platform in the background while the locker
// lets you equip an outfit, a back bling and a pickaxe.
import * as THREE from 'three';
import { CharacterRig, SKINS, BACKBLINGS, PICKAXES, cosmeticDefaults } from './character.js';
import { makePickaxe } from './models.js';
import { damp, TAU } from './util.js';

const STORE_KEY = 'fortnite3d.locker';

export function loadCosmetics() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...cosmeticDefaults(), ...JSON.parse(raw) };
  } catch (e) { /* private mode: fall back to defaults */ }
  return cosmeticDefaults();
}
export function saveCosmetics(c) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ }
}

export class Lobby {
  constructor(renderer, root) {
    this.renderer = renderer;
    this.root = root;
    this.cos = loadCosmetics();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
    this.t = 0;
    this.turn = 0;
    this.targetTurn = 0;
    this.buildScene();
    this.buildDom();
  }

  buildScene() {
    const s = this.scene;
    s.background = new THREE.Color(0x121826);
    s.fog = new THREE.Fog(0x121826, 26, 70);

    s.add(new THREE.HemisphereLight(0x9fc4ff, 0x1a1f2b, 1.0));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.0);
    key.position.set(4, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1; key.shadow.camera.far = 30;
    key.shadow.camera.left = -6; key.shadow.camera.right = 6;
    key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
    s.add(key);
    const rim = new THREE.DirectionalLight(0x6aa8ff, 1.5);
    rim.position.set(-6, 3, -5);
    s.add(rim);
    const fill = new THREE.PointLight(0xff9a4a, 0.9, 22);
    fill.position.set(-3, 2.4, 4);
    s.add(fill);

    // stage
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.8, 0.5, 34),
      new THREE.MeshLambertMaterial({ color: 0x1c2536 })
    );
    disc.position.y = -0.25;
    disc.receiveShadow = true;
    s.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.45, 0.06, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x4da3ff })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    s.add(ring);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshLambertMaterial({ color: 0x0e131d })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.52;
    floor.receiveShadow = true;
    s.add(floor);

    // some background scenery so the lobby is not an empty void
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const r = 12 + (i % 3) * 4;
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(2 + (i % 3), 3 + (i % 4) * 2.5, 2 + (i % 2)),
        new THREE.MeshLambertMaterial({ color: i % 2 ? 0x1a2334 : 0x202b3e })
      );
      b.position.set(Math.cos(a) * r, (1.5 + (i % 4) * 1.2) - 0.5, Math.sin(a) * r - 4);
      b.castShadow = true; b.receiveShadow = true;
      s.add(b);
    }

    this.charHolder = new THREE.Group();
    s.add(this.charHolder);
    this.rebuildCharacter();

    this.camera.position.set(0.4, 1.9, 6.4);
    this.camera.lookAt(0, 1.05, 0);
  }

  rebuildCharacter() {
    if (this.rig) { this.charHolder.remove(this.rig.root); this.rig.dispose(); }
    this.rig = new CharacterRig(this.cos);
    this.charHolder.add(this.rig.root);
    const axe = makePickaxe(this.cos.pickaxe);
    axe.scale.setScalar(0.78);
    this.rig.setStowed(axe);
    this.rig.setHeld(null);
  }

  buildDom() {
    const r = this.root;
    r.innerHTML = '';
    r.className = 'lobby';

    const top = document.createElement('div');
    top.className = 'lobbytop';
    top.innerHTML = `<div class="logo">FORTNITE</div><div class="sub">Battle Royale &middot; 100 Players</div>`;
    r.appendChild(top);

    const panel = document.createElement('div');
    panel.className = 'panel locker';
    r.appendChild(panel);
    this.panel = panel;

    const head = document.createElement('div');
    head.className = 'lockerhead';
    head.innerHTML = `<h2>LOCKER</h2><p>Equip your default cosmetics</p>`;
    panel.appendChild(head);

    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    panel.appendChild(tabs);
    const grid = document.createElement('div');
    grid.className = 'itemgrid';
    panel.appendChild(grid);
    const detail = document.createElement('div');
    detail.className = 'itemdetail';
    panel.appendChild(detail);

    this.categories = [
      { id: 'skin', label: 'Outfit', items: SKINS, key: 'skin' },
      { id: 'backbling', label: 'Back Bling', items: BACKBLINGS, key: 'backbling' },
      { id: 'pickaxe', label: 'Pickaxe', items: PICKAXES, key: 'pickaxe' },
    ];
    this.activeCat = 0;
    this.tabEls = this.categories.map((c, i) => {
      const t = document.createElement('button');
      t.className = 'tab' + (i === 0 ? ' on' : '');
      t.textContent = c.label;
      t.addEventListener('click', () => { this.activeCat = i; this.renderTabs(); });
      tabs.appendChild(t);
      return t;
    });
    this.grid = grid;
    this.detail = detail;
    this.renderTabs();

    const foot = document.createElement('div');
    foot.className = 'lobbyfoot';
    r.appendChild(foot);
    const nameWrap = document.createElement('label');
    nameWrap.className = 'namefield';
    nameWrap.innerHTML = '<span>NAME</span>';
    this.nameInput = document.createElement('input');
    this.nameInput.maxLength = 14;
    this.nameInput.value = localStorage.getItem('fortnite3d.name') || 'You';
    this.nameInput.addEventListener('input', () => {
      localStorage.setItem('fortnite3d.name', this.nameInput.value.trim() || 'You');
    });
    nameWrap.appendChild(this.nameInput);
    foot.appendChild(nameWrap);

    this.playBtn = document.createElement('button');
    this.playBtn.className = 'playbtn';
    this.playBtn.textContent = 'PLAY';
    foot.appendChild(this.playBtn);

    const hint = document.createElement('div');
    hint.className = 'lobbyhint';
    hint.innerHTML = 'Drag the character to rotate &middot; WASD + mouse or the on-screen pad in game';
    r.appendChild(hint);

    // drag to spin the character
    let dragging = false, lastX = 0;
    const dom = this.renderer.domElement;
    const down = (e) => { if (e.target.closest && e.target.closest('.panel, .lobbyfoot')) return; dragging = true; lastX = e.clientX; };
    const move = (e) => { if (!dragging) return; this.targetTurn -= (e.clientX - lastX) * 0.01; lastX = e.clientX; };
    const up = () => { dragging = false; };
    dom.addEventListener('pointerdown', down);
    r.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  renderTabs() {
    this.tabEls.forEach((t, i) => t.classList.toggle('on', i === this.activeCat));
    const cat = this.categories[this.activeCat];
    this.grid.innerHTML = '';
    for (const item of cat.items) {
      const cell = document.createElement('button');
      cell.className = 'itemcell' + (this.cos[cat.key] === item.id ? ' on' : '');
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.appendChild(this.thumbFor(cat.id, item));
      cell.appendChild(thumb);
      const nm = document.createElement('span');
      nm.textContent = item.name;
      cell.appendChild(nm);
      cell.addEventListener('click', () => {
        this.cos[cat.key] = item.id;
        saveCosmetics(this.cos);
        this.rebuildCharacter();
        this.renderTabs();
      });
      cell.addEventListener('pointerenter', () => this.showDetail(item));
      this.grid.appendChild(cell);
    }
    const cur = cat.items.find(i => i.id === this.cos[cat.key]) || cat.items[0];
    this.showDetail(cur);
  }

  showDetail(item) {
    this.detail.innerHTML = `<h3>${item.name}</h3><p>${item.desc || 'Default item'}</p>`;
  }

  /** Tiny canvas icon so each locker cell reads at a glance. */
  thumbFor(cat, item) {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const x = c.getContext('2d');
    const hex = (n) => '#' + n.toString(16).padStart(6, '0');
    x.fillStyle = 'rgba(255,255,255,0.04)';
    x.fillRect(0, 0, 96, 96);
    if (cat === 'skin') {
      x.fillStyle = hex(item.shirt); x.fillRect(30, 40, 36, 34);
      x.fillStyle = hex(item.skin); x.fillRect(36, 16, 24, 24);
      x.fillStyle = hex(item.hair); x.fillRect(35, 12, 26, 7);
      x.fillStyle = hex(item.pants); x.fillRect(32, 74, 14, 16); x.fillRect(50, 74, 14, 16);
      x.fillStyle = hex(item.skin); x.fillRect(22, 42, 8, 26); x.fillRect(66, 42, 8, 26);
    } else if (cat === 'backbling') {
      if (item.id === 'none') {
        x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 4;
        x.beginPath(); x.moveTo(28, 28); x.lineTo(68, 68); x.moveTo(68, 28); x.lineTo(28, 68); x.stroke();
      } else if (item.id === 'pack') {
        x.fillStyle = '#3c6fbe'; x.fillRect(30, 26, 36, 46);
        x.fillStyle = '#2a2d33'; x.fillRect(28, 60, 40, 12);
        x.fillStyle = '#9aa3ad'; x.fillRect(40, 34, 16, 12);
      } else {
        x.fillStyle = '#8d7a5a'; x.fillRect(22, 38, 52, 22);
        x.fillStyle = '#5a4c38'; x.fillRect(60, 34, 12, 30);
      }
    } else {
      const shaft = item.id === 'frost' ? '#8fd4e8' : '#9b6b3f';
      const head = item.id === 'frost' ? '#d8f3ff' : '#b9c2cc';
      x.strokeStyle = shaft; x.lineWidth = 8;
      x.beginPath(); x.moveTo(34, 78); x.lineTo(58, 24); x.stroke();
      x.fillStyle = head;
      x.beginPath(); x.moveTo(40, 26); x.quadraticCurveTo(70, 14, 76, 40); x.lineTo(62, 40);
      x.quadraticCurveTo(58, 28, 44, 34); x.closePath(); x.fill();
    }
    return c;
  }

  update(dt) {
    this.t += dt;
    this.turn = damp(this.turn, this.targetTurn, 8, dt);
    this.charHolder.rotation.y = this.turn + Math.sin(this.t * 0.25) * 0.12;
    this.rig.update(dt, {
      speed: 0, sprinting: false, crouching: false, grounded: true,
      aiming: false, hasGun: false, hasTool: false, pitch: 0, dead: false,
    });
    this.camera.position.x = 0.4 + Math.sin(this.t * 0.2) * 0.25;
    this.camera.lookAt(0, 1.05, 0);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  get name() { return (this.nameInput.value || 'You').trim() || 'You'; }

  dispose() {
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
