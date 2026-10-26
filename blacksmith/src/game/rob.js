/* =============================================================================
   The people of the mines: the ones who give out bounties.

   Rob, just inside the cave. A miner who has been down here a long time and
   would like there to be fewer skeletons. He pays for them, three at a time,
   as often as you like. Pickaxes are not his line: those are on the wall
   outside the cave mouth.

   Jack, in the deep mine, by the steps. He hunts the elites, the skeletons in
   iron, and pays well for five of them - but only to a smith who has reached
   level 5.

   Over each head: a name, and a mark that says what they want from you -
   "!" when there is work, "?" when you have done it and they owe you, and
   the level it takes when you are not ready for it yet.
   ========================================================================== */
import { Group, Vector3 } from 'three';
import { Rig, dressHuman } from './character.js';
import { buildPickaxe, buildWeapon } from './gear.js';
import { Tag } from './fx.js';
import { CV } from './cave.js';
import { DM } from './deep.js';
import { angleDelta, clamp } from '../core/util.js';

export class QuestGiver {
  /** look: dressHuman's; extra(rig): anything more before baking; held: what is in the hand */
  constructor(scene, { name, at, yaw, look, extra = null, held = null }) {
    this.name = name;
    this.rig = dressHuman(new Rig(), look);
    extra?.(this.rig);
    this.rig.bake();
    if (held) this.rig.joints.grip.add(held);
    this.group = new Group();
    this.group.add(this.rig.root);
    this.pos = new Vector3(at.x, 0, at.z);
    this.group.position.copy(this.pos);
    this.yaw = yaw;
    this.rig.root.rotation.y = this.yaw;

    this.nameTag = new Tag(name, { fg: '#ffe08a', scale: 0.8 });
    this.nameTag.sprite.position.set(0, 2.25, 0);
    this.mark = new Tag('!', { fg: '#1a1006', bg: 'rgba(255,205,60,0.95)', border: 'rgba(255,250,220,0.9)', w: 96, h: 96, scale: 0.55 });
    this.mark.sprite.position.set(0, 2.75, 0);
    this.lock = new Tag('LV 5', { fg: '#e8e2d8', bg: 'rgba(40,36,44,0.88)', border: 'rgba(200,190,180,0.7)', w: 160, h: 72, scale: 0.6 });
    this.lock.sprite.position.set(0, 2.72, 0);
    this.group.add(this.nameTag.sprite, this.mark.sprite, this.lock.sprite);
    scene.add(this.group);

    this.look = 0;
    this.wave = -1;
    this.waved = false;
    this.time = 0;
  }

  /**
   * `quest`: 'offer' (there is work), 'active' (you are on it), 'ready' (come
   * and get paid), or 'locked:N' (come back at level N)
   */
  update(dt, playerPos, quest) {
    this.time += dt;
    const dx = playerPos.x - this.pos.x, dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    // watches you once you are near, turning the head and then the rest
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

    const locked = quest?.startsWith('locked');
    const mark = quest === 'ready' ? '?' : quest === 'offer' ? '!' : '';
    this.mark.sprite.visible = !!mark;
    if (mark) {
      this.mark.set(mark);
      this.mark.sprite.position.y = 2.75 + Math.sin(this.time * 3) * 0.06;
    }
    this.lock.sprite.visible = !!locked;
    if (locked) this.lock.set('LV ' + quest.split(':')[1]);
    return dist;
  }

  dispose() {
    this.group.removeFromParent();
    this.rig.dispose();
    this.nameTag.dispose();
    this.mark.dispose();
    this.lock.dispose();
  }
}

export function makeRob(scene) {
  return new QuestGiver(scene, {
    name: 'Rob', at: CV.rob, yaw: CV.rob.yaw,
    look: {
      skin: '#e8b48c', hair: '#8a4520', shirt: '#6b4a32', sleeves: '#7a5a3c', pants: '#3f5a7a',
      boots: '#2a2018', belt: '#3a2412', face: 'rob', hat: 'miner', beard: true,
    },
    // braces on the overalls
    extra: (rig) => {
      const strap = rig.mat('#3f5a7a');
      for (const x of [-0.12, 0.12]) rig.box('torso', 0.06, 0.5, 0.28, strap, { x, y: 0.27 });
    },
    held: buildPickaxe('stone'),
  });
}

export function makeJack(scene) {
  return new QuestGiver(scene, {
    name: 'Jack', at: DM.jack, yaw: DM.jack.yaw,
    look: {
      skin: '#c98e64', hair: '#8d8a84', shirt: '#3d4a3a', sleeves: '#4a5846', pants: '#2e2a26',
      boots: '#1e1a16', belt: '#5a3a1a', face: 'jack', hat: 'miner', beard: '#9a968e',
    },
    // a leather jerkin, studded, and a pauldron on the sword arm
    extra: (rig) => {
      const leather = rig.mat('#5a3a22');
      rig.box('torso', 0.48, 0.34, 0.28, leather, { y: 0.34 });
      const iron = rig.mat('#6d737b');
      rig.box('shR', 0.17, 0.08, 0.17, iron, { y: 0.0 });
      for (const x of [-0.12, 0, 0.12]) rig.box('torso', 0.03, 0.03, 0.02, iron, { x, y: 0.42, z: 0.145 });
    },
    held: buildWeapon('sword', ['iron', 'iron', 'iron']),
  });
}
