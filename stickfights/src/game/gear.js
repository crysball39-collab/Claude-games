/* =============================================================================
   The things in the spawn menu that are neither people, weapons in a hand,
   nor walls: explosives (explosives.js) and what runs on electricity
   (power.js). Each is described the way a mod describes its spawnables
   (mods/registry.js) - a name, a picture for its card and for where it will
   go, and how to make one - so the spawn menu, the spawn tool and the
   ghost under the pointer treat them all alike (ui.js, findAny).
   ========================================================================== */
import { EXPLOSIVES } from './explosives.js';
import { POWER_KINDS } from './power.js';

/** A card's picture of something drawn by `draw` (centred on the origin, w by h metres), filling the card. */
function iconOf(draw, w, h, tilt = 0) {
  return (ctx, cw, ch, card) => {
    const s = Math.min((cw * (card ? 0.8 : 0.92)) / (w * Math.abs(Math.cos(tilt)) + h * Math.abs(Math.sin(tilt))), (ch * (card ? 0.62 : 0.92)) / (h * Math.abs(Math.cos(tilt)) + w * Math.abs(Math.sin(tilt))));
    ctx.setTransform(s * Math.cos(tilt), -s * Math.sin(tilt), -s * Math.sin(tilt), -s * Math.cos(tilt), cw / 2, card ? ch * 0.45 : ch / 2);
    draw(ctx);
  };
}

const entry = (kind, name, short, blurb, d, o = {}) => ({
  kind, name, short, plural: 'things', limit: 'items', blurb, core: true,
  icon: iconOf(d.draw, d.w, d.h, o.tilt || 0),
  // (where it will be: its middle where it is put, or sitting on the ground under that)
  ghost: (ctx, g) => { ctx.translate(0, Math.max(0, d.h / 2 - g.y)); d.draw(ctx); },
  spawn: (sb, x, y) => sb.addItem(d.make(sb, x, Math.max(y, d.h / 2))),
  said: o.said || null,
});

export const GEAR = {
  grenade: entry('grenade', 'Grenade', 'GRENADE', 'Tap it to pull the pin: four seconds, then it goes off.', EXPLOSIVES.grenade, { tilt: 0.3 }),
  c4: entry('c4', 'C4', 'C4', 'Sticks to whatever it lands on. Tap it: three seconds of beeping, and a big bang.', EXPLOSIVES.c4),
  tnt: entry('tnt', 'TNT', 'TNT', 'Tap it to light the fuse. Fire lights it too.', EXPLOSIVES.tnt),
  missile: entry('missile', 'Missile', 'MISSILE', 'Tap it to fire: it flies the way it points until it hits something.', EXPLOSIVES.missile, { tilt: 0.45 }),
  generator: entry('generator', 'Generator', 'GENERATOR', 'Tap it to start it: 230 volts down any power cord tied to it.', POWER_KINDS.generator),
  lightbulb: entry('lightbulb', 'Lightbulb', 'LIGHTBULB', 'Lights up on a power cord from a running generator. Shatters.', POWER_KINDS.lightbulb),
  floodlight: entry('floodlight', 'Floodlight', 'FLOODLIGHT', 'A beam of hard white light the way it points. Shatters.', POWER_KINDS.floodlight),
  voltmeter: entry('voltmeter', 'Volt Meter', 'VOLT METER', 'Shows the voltage of whatever it is tied to with a power cord.', POWER_KINDS.voltmeter),
};

/** A core spawnable of these, by kind. */
export const findGear = (k) => GEAR[k] || null;
