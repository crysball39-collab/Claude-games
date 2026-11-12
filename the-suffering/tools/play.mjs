/* Opens the game, presses PLAY, and hands back a page with a few test helpers installed. */
import { open } from './harness.mjs';

export async function play(opts = {}) {
  const t = await open(opts);
  await t.page.waitForFunction(() => window.__game, { timeout: 90000 });
  await t.page.click('#btn-play');
  await t.ev(() => {
    const g = window.__game, ts = window.__ts;
    window.T = {
      /** A person standing still a little way in front of the player, facing them, who will not wander off. */
      dummy(dist = 1.0, side = 0) {
        const p = g.player, yaw = g.camYaw;
        const x = p.x + Math.sin(yaw) * dist - Math.cos(yaw) * side, z = p.z + Math.cos(yaw) * dist + Math.sin(yaw) * side;
        const h = g.spawnHuman(x, z, yaw + Math.PI);
        h.brain = { update() {}, pause: 0 };
        return h;
      },
      /** Everyone but the player goes away, and the cars with them. */
      clear() { for (const h of g.humans.slice()) if (!h.isPlayer) g.removeHuman(h); ts.settings.people = 0; g.traffic.setCount(0); },
      press(name) { ts.input._press(name); },
      release(name) { ts.input._release(name); },
      state(h) { return ['ANIM', 'STUMBLE', 'RAGDOLL', 'GETUP'][h.state]; },
      look(yaw, pitch = -0.1) { g.camYaw = yaw; g.camPitch = pitch; },
      /** Puts the camera somewhere and points it at something, for a picture. */
      shot(x, y, z, tx, ty, tz) { g.headless = false; g.camera.position.set(x, y, z); g.camera.lookAt(tx, ty, tz); g.city.sky.position.copy(g.camera.position); g.gore.update(0, g.camera); g.boxes.commit(); g.faceQuads.commit(); g.faces.flush(g.time + 9); g.renderer.render(g.scene, g.camera); },
    };
    g.paused = true;            // the test drives time itself
  });
  t.adv = (s) => t.ev((s) => { const g = window.__game; g.paused = false; g.advance(s); g.paused = true; }, s);
  t.shot = async (name, cam) => {
    if (cam) await t.ev((c) => window.T.shot(...c), cam);
    else await t.ev(() => { const g = window.__game; g.paused = false; g.frame(1 / 600); g.paused = true; });
    await t.page.screenshot({ path: new URL('../.shots/' + name + '.png', import.meta.url).pathname });
  };
  return t;
}
