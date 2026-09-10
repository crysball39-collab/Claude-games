// The local player: turns HUD input into actor commands and drives the
// third-person camera (with wall collision and an aim-down-sights zoom).
import * as THREE from 'three';
import { Actor } from './actor.js';
import { clamp, damp } from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Player extends Actor {
  constructor(game, opts) {
    super(game, { ...opts, isPlayer: true, plate: false });
    this.sens = 0.0026;
    this.camDist = 4.4;
    this.camDistNow = 4.4;
    this.aimTarget = new THREE.Vector3();
    this.camShake = 0;
    this.interactTarget = null;
    this.hitFlash = 0;
  }

  handleInput(input, dt, hud) {
    if (!this.alive || input.mapOpen) {
      input.look.x = 0; input.look.y = 0;
      this.moveInput.set(0, 0);
      this.sprinting = false;
      return;
    }

    // look
    this.yaw -= input.look.x * this.sens * (this.aiming ? 0.65 : 1);
    this.pitch -= input.look.y * this.sens * (this.aiming ? 0.65 : 1);
    this.pitch = clamp(this.pitch, -1.15, 1.15);
    input.look.x = 0; input.look.y = 0;

    // --- riding the bus: look around, jump to drop ------------------------
    if (this.mode === 'bus') {
      this.moveInput.set(0, 0);
      this.sprinting = false;
      this.aiming = false;
      if (input.jump) { input.jump = false; this.game.dropActor(this); }
      return;
    }
    // --- skydiving: the stick steers, everything else is locked out -------
    if (this.mode === 'dive') {
      const kbd = hud.readKeyboardMove();
      let dx = input.move.x, dy = input.move.y;
      if (Math.abs(kbd.x) + Math.abs(kbd.y) > 0) { dx = kbd.x; dy = kbd.y; }
      this.moveInput.set(dx, dy);
      this.sprinting = false;
      this.aiming = false;
      input.jump = false;
      return;
    }

    // move
    const kb = hud.readKeyboardMove();
    let mx = input.move.x, my = input.move.y;
    if (Math.abs(kb.x) + Math.abs(kb.y) > 0) { mx = kb.x; my = kb.y; }
    this.moveInput.set(mx, my);
    this.sprinting = input.sprint || input.sprintLock || kb.sprint;
    this.crouching = input.crouch;

    if (input.jump) { this.wantJump = true; input.jump = false; }

    if (input.slotRequest >= 0) {
      this.select(input.slotRequest);
      input.aimToggle = false;
      input.slotRequest = -1;
      if (input.buildMode && !this.inv.holdingPickaxe) hud.toggleBuild();
    }
    if (input.reload) { this.tryReload(); input.reload = false; }
    if (input.use) { input.use = false; this.game.interact(this); }

    // primary action depends on what is in hand / build mode
    if (input.buildMode) {
      if (input.shoot) {
        if (this.game.build.place(this, input.buildType)) this.buildCooldown = 0.18;
        input.shoot = false;   // one piece per tap
      }
    } else {
      const cur = this.inv.current;
      if (cur && cur.kind === 'item') {
        if (input.shoot) { this.tryUse(); input.shoot = false; }
      } else if (this.inv.holdingPickaxe) {
        if (input.shoot) this.trySwing();
      } else if (cur && cur.kind === 'weapon') {
        this.aiming = input.aim || input.aimToggle;
        if (input.shoot) {
          if (cur.def.auto) this.tryFire();
          else if (!this.semiLatch) { this.tryFire(); this.semiLatch = true; }
        }
      }
    }
    if (!input.shoot) this.semiLatch = false;
    if (!this.weapon) { this.aiming = false; input.aimToggle = false; }
  }

  update(dt, input, hud) {
    if (this.alive) this.handleInput(input, dt, hud);
    else { this.deadT += dt; this.moveInput.set(0, 0); }
    this.updateTimers(dt);
    if (this.alive) this.updatePhysics(dt);
    this.updateVisual(dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  /** Camera + crosshair ray.  Called after the player has moved. */
  updateCamera(camera, dt) {
    const aimingNow = this.aiming;
    const scopedNow = aimingNow && this.weapon && this.weapon.def.scope;
    const wantDist = scopedNow ? 0.9 : aimingNow ? 2.15 : 4.4;
    const wantSide = scopedNow ? 0.34 : aimingNow ? 0.62 : 0.85;
    const wantHigh = aimingNow ? 1.52 : 1.62;
    this.camDist = damp(this.camDist, wantDist, 12, dt);
    const side = damp(this.camSide ?? wantSide, wantSide, 12, dt);
    this.camSide = side;
    const high = damp(this.camHigh ?? wantHigh, wantHigh, 12, dt);
    this.camHigh = high;

    const head = _v.set(this.pos.x, this.pos.y + (this.crouching ? 1.22 : 1.58), this.pos.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fx = Math.sin(this.yaw) * cp, fy = sp, fz = Math.cos(this.yaw) * cp;
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);   // screen-right

    // shoulder offset first — indoors it has to give way to the wall
    let sideNow = side;
    const sideHit = this.game.physics.raycast(head.x, head.y, head.z, rx, 0, rz, Math.abs(side) + 0.3);
    if (sideHit) sideNow = Math.max(0, sideHit.t - 0.25);
    const ox = head.x + rx * sideNow, oy = head.y + high - 1.58, oz = head.z + rz * sideNow;
    let dist = this.camDist;
    const hit = this.game.physics.raycast(ox, oy, oz, -fx, -fy, -fz, dist + 0.5);
    if (hit) dist = Math.max(0.5, hit.t - 0.45);
    this.camDistNow = damp(this.camDistNow, dist, 18, dt);

    camera.position.set(ox - fx * this.camDistNow, oy - fy * this.camDistNow, oz - fz * this.camDistNow);
    const shake = this.camShake + (this.recoilKick || 0) * 0.012;
    if (shake > 0.0001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      this.camShake = damp(this.camShake, 0, 8, dt);
    }
    const pitchKick = (this.recoilKick || 0) * 0.02;
    camera.lookAt(ox + fx * 40, oy + fy * 40 + pitchKick * 20, oz + fz * 40);

    // scoped weapons zoom much further in
    const w = this.weapon;
    const scoped = aimingNow && w && w.def.scope;
    const fov = scoped ? 24 : aimingNow ? 56 : 72;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = damp(camera.fov, fov, 12, dt);
      camera.updateProjectionMatrix();
    }

    // where the crosshair actually points, so bullets match the reticle
    const ch = this.game.physics.raycast(camera.position.x, camera.position.y, camera.position.z, fx, fy, fz, 300);
    const t = ch ? ch.t : 300;
    this.aimTarget.set(camera.position.x + fx * t, camera.position.y + fy * t, camera.position.z + fz * t);
  }

  onFired() {
    this.camShake = Math.min(0.09, this.camShake + 0.02);
  }
}
