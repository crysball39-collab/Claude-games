/* =============================================================================
   Maps: what the sandbox starts out as.

     Flat   the grey sky and the black ground, and nothing else - the way it
            has always been
     City   a street of buildings - an office tower or two, apartments, old
            brick, a couple of shops - with lamps over it, trees and bushes
            along it, and a skyline far off behind (city.js)

   Loading one clears the sandbox first; clearing the sandbox with the bin
   leaves the map it is on as it was when it was loaded.
   ========================================================================== */
import { buildCity } from './city.js';

export const MAPS = [
  {
    id: 'flat', name: 'Flat',
    about: 'The grey sky and the black ground, with nothing on it: what the sandbox has always been.',
    build() {},
  },
  {
    id: 'city', name: 'City',
    about: 'A street of buildings - two office towers, an apartment block, old brick, a couple of shops - with lamps over it and trees and bushes along it. Everything in it has its weight, and comes apart a few cells at a time: knock enough out of a storey and what was above it comes down into the street.',
    build: buildCity,
  },
];

export const getMap = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

/** The sandbox cleared, and made into map `id`. */
export function loadMap(sb, id) {
  const m = getMap(id);
  sb.clear();
  sb.map = m.id;
  sb.skyline = null;
  m.build(sb);
  sb.emit('map', { id: m.id });
  return m;
}
