/* =============================================================================
   What the page can reach of claude.ai, when it is open there.

   Inside a claude.ai artifact view the page has `window.claude.use(name)`,
   which hands over a capability (the live room, the shared store, who is
   viewing) or null. A copy of the game opened on its own has no
   `window.claude` at all, and everything here resolves null at once.
   ========================================================================== */

/** Is the page open inside claude.ai (where its own players, store and identity can be had)? */
export const IN_CLAUDE = typeof window !== 'undefined' && !!window.claude && typeof window.claude.use === 'function';

const cache = new Map();

/**
 * The capability `name`, or null: not open in claude.ai, not offered, or no answer within `ms`.
 * (The page's host itself answers null after about ten seconds; this only covers a host that never answers.)
 */
export function use(name, ms = 12000) {
  if (!IN_CLAUDE) return Promise.resolve(null);
  if (cache.has(name)) return cache.get(name);
  const p = new Promise((done) => {
    const t = setTimeout(() => done(null), ms);
    let call;
    try { call = window.claude.use(name); } catch { clearTimeout(t); done(null); return; }
    Promise.resolve(call).then((ns) => { clearTimeout(t); done(ns || null); }, () => { clearTimeout(t); done(null); });
  });
  cache.set(name, p);
  return p;
}
