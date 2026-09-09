// Minimap and full-screen map.  Both draw from the same island image that the
// terrain builder produced, so what you see on the map is the world itself.
import { WORLD, POIS } from './world.js';
import { clamp, TAU } from './util.js';

const POI_SHORT = { summering: 'Summering Falls', pumped: 'Pumped Palms', snowy: 'Snowy Snarks' };

/** World X/Z -> pixel coordinates inside the island image. */
export function worldToImage(x, z, img) {
  return {
    x: (x + WORLD.half) / WORLD.size * img.width,
    y: (z + WORLD.half) / WORLD.size * img.height,
  };
}

export class GameMap {
  constructor(image) {
    this.image = image;              // canvas produced by createTerrain()
    this.waypoint = null;            // { x, z }
  }

  setWaypoint(x, z) {
    // a tap out in the ocean still drops a pin, clamped to the island
    const h = WORLD.half;
    this.waypoint = { x: clamp(x, -h, h), z: clamp(z, -h, h) };
    return this.waypoint;
  }
  clearWaypoint() { this.waypoint = null; }

  // ---------------------------------------------------------------- minimap
  /**
   * @param ctx     2D context of a square canvas
   * @param size    canvas size in px (already device-scaled)
   * @param s       { player, storm, span } — span is metres across the minimap
   */
  drawMinimap(ctx, size, s) {
    const span = s.span || 300;
    const px = s.player.pos.x, pz = s.player.pos.z;
    const scale = size / span;                       // px per metre
    const toScreen = (x, z) => ({ x: (x - px) * scale + size / 2, y: (z - pz) * scale + size / 2 });

    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, TAU);
    ctx.clip();

    // island image, cropped to the window around the player
    const img = this.image;
    const ppm = img.width / WORLD.size;              // image px per metre
    const sw = span * ppm;
    const c = worldToImage(px, pz, img);
    ctx.fillStyle = '#0a1018';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, c.x - sw / 2, c.y - sw / 2, sw, sw, 0, 0, size, size);

    // POI labels
    ctx.font = `600 ${Math.round(size * 0.062)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3;
    for (const p of POIS) {
      const q = toScreen(p.x, p.z);
      if (q.x < -40 || q.x > size + 40 || q.y < -20 || q.y > size + 20) continue;
      ctx.fillText(POI_SHORT[p.id] || p.name, q.x, q.y);
    }
    ctx.shadowBlur = 0;

    this.drawStorm(ctx, toScreen, scale, s.storm, false);

    // waypoint
    if (this.waypoint) {
      const q = toScreen(this.waypoint.x, this.waypoint.z);
      this.drawWaypoint(ctx, q.x, q.y, size * 0.05, true, size);
    }

    // a white line to the safe circle whenever we are outside it
    if (s.storm) {
      const safe = s.storm.safeCircle();
      const dx = safe.x - px, dz = safe.z - pz;
      const d = Math.hypot(dx, dz);
      if (d > safe.r) {
        const target = toScreen(safe.x, safe.z);
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(2, size * 0.017);
        ctx.setLineDash([size * 0.055, size * 0.04]);
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(size / 2, size / 2);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // player arrow
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-s.player.yaw);           // +Z is down on the map; canvas rotates clockwise
    const r = size * 0.075;
    ctx.beginPath();
    ctx.moveTo(0, r);
    ctx.lineTo(-r * 0.72, -r * 0.8);
    ctx.lineTo(0, -r * 0.4);
    ctx.lineTo(r * 0.72, -r * 0.8);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  drawStorm(ctx, toScreen, scale, storm, full) {
    if (!storm) return;
    const cur = storm.currentCircle();
    const next = storm.nextCircle();
    const closing = storm.phase === 'closing';

    // everything outside the current circle is storm
    const c = toScreen(cur.x, cur.z);
    ctx.save();
    ctx.strokeStyle = closing ? '#e0b4ff' : '#b57cff';
    ctx.lineWidth = full ? 3 : 2.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, cur.r * scale, 0, TAU);
    ctx.stroke();
    // purple wash beyond the edge
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(120, 60, 200, 0.24)';
    ctx.beginPath();
    ctx.rect(-9999, -9999, 99999, 99999);
    ctx.arc(c.x, c.y, cur.r * scale, 0, TAU, true);
    ctx.fill('evenodd');
    ctx.restore();

    // the circle it is closing onto
    if (next) {
      const n = toScreen(next.x, next.z);
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = full ? 2.5 : 2;
      ctx.setLineDash(full ? [10, 8] : [5, 4]);
      ctx.beginPath();
      ctx.arc(n.x, n.y, next.r * scale, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawWaypoint(ctx, x, y, r, small, bound) {
    ctx.save();
    if (bound != null) {
      // pin it to the rim if it is off the edge of the minimap
      const cx = bound / 2, cy = bound / 2;
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy), lim = bound / 2 - r - 2;
      if (d > lim) { x = cx + dx / d * lim; y = cy + dy / d * lim; }
    }
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - r * 0.8, y - r * 1.6);
    ctx.lineTo(x + r * 0.8, y - r * 1.6);
    ctx.closePath();
    ctx.fillStyle = '#3ad6ff';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y - r * 1.75, r * 0.72, 0, TAU);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // --------------------------------------------------------------- full map
  /**
   * @param view { cx, cz, zoom }  zoom = px per metre
   */
  drawFull(ctx, w, h, s, view) {
    const scale = view.zoom;
    const toScreen = (x, z) => ({ x: (x - view.cx) * scale + w / 2, y: (z - view.cz) * scale + h / 2 });

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, w, h);

    const img = this.image;
    const tl = toScreen(-WORLD.half, -WORLD.half);
    const size = WORLD.size * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, tl.x, tl.y, size, size);

    // grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (let g = -WORLD.half; g <= WORLD.half; g += 300) {
      const a = toScreen(g, -WORLD.half), b = toScreen(g, WORLD.half);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const c = toScreen(-WORLD.half, g), d = toScreen(WORLD.half, g);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    ctx.restore();

    this.drawStorm(ctx, toScreen, scale, s.storm, true);

    // POIs
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 5;
    for (const p of POIS) {
      const q = toScreen(p.x, p.z);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(p.name.toUpperCase(), q.x, q.y - 10);
    }
    ctx.restore();

    if (this.waypoint) {
      const q = toScreen(this.waypoint.x, this.waypoint.z);
      this.drawWaypoint(ctx, q.x, q.y, 9, false, null);
    }

    // player
    const p = toScreen(s.player.pos.x, s.player.pos.z);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-s.player.yaw);
    ctx.beginPath();
    ctx.moveTo(0, 13);
    ctx.lineTo(-9, -10);
    ctx.lineTo(0, -4);
    ctx.lineTo(9, -10);
    ctx.closePath();
    ctx.fillStyle = '#ffe14d';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 2.5;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** Screen pixel -> world position, for tapping a waypoint onto the map. */
  screenToWorld(sx, sy, w, h, view) {
    return { x: (sx - w / 2) / view.zoom + view.cx, z: (sy - h / 2) / view.zoom + view.cz };
  }
}
