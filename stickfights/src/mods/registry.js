/* =============================================================================
   Mods: things that are not part of the game itself.

   Each mod lives in a folder of its own under src/mods/ and registers itself
   here when it loads: a name, a few words about it, what it adds, and the
   things it puts in the spawn menu. Nothing of a mod is in the game until it
   is installed, from the MODS screen, and the device remembers which ones
   are. Remove one and it is gone again - from the spawn menu, and from the
   world, along with anything of it that was in it.

   How much storage each mod needs is the size of its folder, measured when
   the game is built (tools/mod-sizes.mjs writes it into sizes.js).

   A mod is an object:
     id          its folder's name
     name, version, about, adds (the names of what it adds)
     icon(ctx, w, h)              its picture on the MODS screen
     spawnables  [{ kind, name, short, plural, limit, blurb, living,
                    icon(ctx, w, h, card), spawn(sb, x, y), said?(made), ghost?(ctx) }]
     options     { kind: (target) => text }   names for what its people may decide to do
     owns(thing)                  whether something in the world is the mod's
     cleanup(sb)                  anything else to forget when it is removed
     setup({ sb, sound, cam })    once, when the game starts
   ========================================================================== */
import { MOD_SIZES } from './sizes.js';

export const MODS = [];
const KEY = 'sf.mods';
const installed = new Set(load());

export function registerMod(def) {
  if (!MODS.some((m) => m.id === def.id)) MODS.push(def);
  return def;
}

export const getMod = (id) => MODS.find((m) => m.id === id) || null;
export const isInstalled = (id) => installed.has(id) && !!getMod(id);
export const installedMods = () => MODS.filter((m) => installed.has(m.id));

/** The storage a mod needs, in bytes. */
export const modSize = (id) => MOD_SIZES[id] || 0;

/** What the installed mods take up between them, in bytes. */
export const storageUsed = () => installedMods().reduce((n, m) => n + modSize(m.id), 0);

export function install(id) {
  if (!getMod(id) || installed.has(id)) return false;
  installed.add(id);
  save();
  return true;
}

/**
 * Uninstalls a mod, taking everything of it out of the sandbox first: its
 * people and things, what was cut off them, and whatever it has going on -
 * a missile in the air, acid in somebody - marked with the mod's id.
 */
export function uninstall(id, sb = null) {
  if (!installed.has(id)) return false;
  if (sb) {
    for (const t of thingsOf(id, sb)) sb.remove(t);
    sb.effects = sb.effects.filter((e) => e.mod !== id);
    for (const p of sb.people) p.afflictions = p.afflictions.filter((a) => a.mod !== id);
  }
  // and whatever else it keeps (something crafted and not yet placed, say)
  const m = getMod(id);
  if (m && m.cleanup) m.cleanup(sb);
  installed.delete(id);
  save();
  return true;
}

/** Everything the installed mods add to the spawn menu, each with its mod. */
export function modSpawnables() {
  const out = [];
  for (const m of installedMods()) for (const s of m.spawnables || []) out.push({ ...s, mod: m });
  return out;
}

export const findSpawnable = (kind) => modSpawnables().find((s) => s.kind === kind) || null;

/** How the inspector names something a mod's people weigh up doing (see the mod's `options`). */
export function modOption(kind) {
  for (const m of MODS) if (m.options && m.options[kind]) return m.options[kind];
  return null;
}

/** The things in the sandbox that came from a mod. */
export function thingsOf(id, sb) {
  const m = getMod(id);
  if (!m || !m.owns) return [];
  return [...sb.people, ...sb.guns, ...sb.knuckles, ...sb.knives, ...sb.machetes, ...sb.limbs, ...sb.crates, ...sb.items].filter((t) => m.owns(t));
}

/** Once, as the game starts: every mod hooks itself up, installed or not, so installing needs no reload. */
export function setupMods(ctx) {
  for (const m of MODS) if (m.setup) m.setup(ctx);
}

export function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(1) + ' KB';
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { return []; }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify([...installed])); } catch (_) { /* private mode: for this visit only */ }
}
