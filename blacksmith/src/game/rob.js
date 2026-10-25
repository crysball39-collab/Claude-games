/* =============================================================================
   Rob. A miner who has been down here a long time and would like there to be
   fewer skeletons. He pays for them, three at a time, as often as you like.
   Pickaxes are not his line: those are on the wall outside the cave mouth.

   Over his head: his name, and a mark that says what he wants from you -
   "!" when he has work, "?" when you have done it and he owes you.
   ========================================================================== */
import { Group, Vector3 } from 'three';
import { Rig, dressHuman } from './character.js';
import { buildPickaxe } from './gear.js';
import { Tag } from './fx.js';
import { CV } from './cave.js';
import { angleDelta, clamp } from '../core/util.js';

export class Rob {
  constructor(scene) {
    this.rig = dressHuman(new Rig(), {
      skin: '#e8b48c', hair: '#8a4520', shirt: '#6b4a32', sleeves: '#7a5a3c', pants: '#3f5a7a',
      boots: '#2a2018', belt: '#3a2412', face: 'rob', hat: 'miner', beard: true,
    });
    // braces on the overalls
    const strap = this.rig.mat('#3f5a7a');
    for (const x of [-0.12, 0.12]) this.rig.box('torso', 0.06, 0.5, 0.28, strap, { x, y: 0.27 });
    this.rig.bake();
    this.rig.joints.grip.add(buildPickaxe('stone'));
    this.group = new Group();
    this.group.add(this.rig.root);
    this.pos = new Vector3(CV.rob.x, 0, CV.rob.z);
    this.group.position.copy(this.pos);
    this.yaw = CV.rob.yaw;
    this.rig.root.rotation.y = this.yaw;

    this.name = new Tag('Rob', { fg: '#ffe08a', scale: 0.8 });
    this.name.sprite.position.set(0, 2.25, 0);
    this.mark = new Tag('!', { fg: '#1a1006', bg: 'rgba(255,205,60,0.95)', border: 'rgba(255,250,220,0.9)', w: 96, h: 96, scale: 0.55 });
    this.mark.sprite.position.set(0, 2.75, 0);
    this.group.add(this.name.sprite, this.mark.sprite);
    scene.add(this.group);

    this.look = 0;
    this.wave = -1;
    this.waved = false;
    this.time = 0;
  }

  /** `quest`: 'offer' (he has work), 'active' (you are on it), 'ready' (come and get paid) */
  update(dt, playerPos, quest) {
    this.time += dt;
    const dx = playerPos.x - this.pos.x, dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    // he watches you once you are near, turning his head and then himself
    const want = Math.atan2(dx, dz);
    if (dist < 9) {
      const off = angleDelta(this.yaw, want);
      if (Math.abs(off) > 0.9) this.yaw += clamp(off, -1, 1) * dt * 1.6;
      this.look = clamp(angleDelta(this.yaw, want), -1, 1);
    } else {
      this.look *= Math.exp(-dt * 2);
    }
    if (dist < 6.5 && !this.waved) { this.waved = true; this.wave = 0; }
    if (dist > 12) this.waved = false;
    let swing = null;
    if (this.wave >= 0) {
      this.wave += dt / 1.6;
      swing = { kind: 'wave', t: this.wave };
      if (this.wave >= 1) this.wave = -1;
    }
    this.rig.update(dt, { speed: 0, swing, look: this.look });
    this.rig.root.rotation.y = this.yaw;

    const mark = quest === 'ready' ? '?' : quest === 'offer' ? '!' : '';
    this.mark.sprite.visible = !!mark;
    if (mark) {
      this.mark.set(mark);
      this.mark.sprite.position.y = 2.75 + Math.sin(this.time * 3) * 0.06;
    }
    return dist;
  }

  dispose() {
    this.group.removeFromParent();
    this.rig.dispose();
    this.name.dispose();
    this.mark.dispose();
  }
}
