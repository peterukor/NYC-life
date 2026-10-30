// =====================================================================
// central-park-ground.ts — paints Central Park's ground into ONE canvas
// texture: mottled grass, mowed lawns, dark woods floor, gravel paths,
// the loop drive, ball fields, tennis courts, rinks, plazas, water with
// depth and lilies, the Imagine mosaic, picnic blankets…
//
// One textured plane = one draw call, however many paths there are, and
// no flat layers fighting each other at satellite-map distance. The same
// texture is reused on the (shiny) water meshes.
// =====================================================================

import * as THREE from 'three';
import { grow, type CentralParkPlan, type PaintOp, type XZ } from '../central-park-plan.ts';

/** Paint the park's ground. `width` = texture pixels across the park. */
export function paintParkGround(plan: CentralParkPlan, width: number): THREE.CanvasTexture {
  const g = plan.grass;
  const GW = g.maxX - g.minX, GL = g.maxZ - g.minZ;
  const k = width / GW; // pixels per metre
  const c = document.createElement('canvas');
  c.width = Math.round(GW * k);
  c.height = Math.round(GL * k);
  const ctx = c.getContext('2d')!;
  const X = (x: number) => (x - g.minX) * k;
  const Y = (z: number) => (z - g.minZ) * k; // north (−z) at the top
  const path = (pts: XZ[], close = true) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.z)) : ctx.moveTo(X(p.x), Y(p.z))));
    if (close) ctx.closePath();
  };
  // A seeded random for the decoration (same picture every load).
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // ---- grass: base, soft mottling, fine speckle
  ctx.fillStyle = '#79c96b';
  ctx.fillRect(0, 0, c.width, c.height);
  {
    const nw = Math.max(8, Math.round(GW / 14)), nh = Math.max(8, Math.round(GL / 14));
    const n = document.createElement('canvas');
    n.width = nw;
    n.height = nh;
    const nx = n.getContext('2d')!;
    const img = nx.createImageData(nw, nh);
    for (let i = 0; i < nw * nh; i++) {
      const v = rnd();
      const light = v > 0.5;
      img.data[i * 4] = light ? 150 : 84;
      img.data[i * 4 + 1] = light ? 214 : 160;
      img.data[i * 4 + 2] = light ? 120 : 76;
      img.data[i * 4 + 3] = Math.round(Math.abs(v - 0.5) * 2 * 70);
    }
    nx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(n, 0, 0, c.width, c.height);
  }
  const speck = Math.round((c.width * c.height) / 260);
  for (let i = 0; i < speck; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(160,222,128,0.35)' : 'rgba(70,140,64,0.28)';
    ctx.fillRect(rnd() * c.width, rnd() * c.height, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  // Soft shade under every tree spot: woods read as woods from the sky.
  for (const t of plan.treeSpots) {
    ctx.fillStyle = 'rgba(40,96,44,0.22)';
    ctx.beginPath();
    ctx.arc(X(t.x + 0.6), Y(t.z + 0.6), 2.1 * t.s * k, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const op of plan.paint) draw(op);

  function draw(op: PaintOp): void {
    switch (op.t) {
      case 'fill':
        ctx.globalAlpha = op.alpha ?? 1;
        ctx.fillStyle = op.color;
        path(op.pts);
        ctx.fill();
        ctx.globalAlpha = 1;
        return;
      case 'stroke':
        ctx.globalAlpha = op.alpha ?? 1;
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.w * k;
        ctx.lineCap = op.dash ? 'butt' : 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(op.dash ? op.dash.map((v) => v * k) : []);
        path(op.pts, !!op.closed);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        return;
      case 'circle':
        ctx.globalAlpha = op.alpha ?? 1;
        ctx.fillStyle = op.color;
        ctx.beginPath();
        ctx.arc(X(op.x), Y(op.z), op.r * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return;
      case 'stripes': {
        // Mowing stripes, clipped to the lawn, plus a soft darker edge.
        ctx.save();
        path(op.pts);
        ctx.clip();
        const cx = op.pts.reduce((a, p) => a + X(p.x), 0) / op.pts.length;
        const cy = op.pts.reduce((a, p) => a + Y(p.z), 0) / op.pts.length;
        ctx.translate(cx, cy);
        ctx.rotate(op.angle);
        ctx.fillStyle = op.color;
        const R = Math.hypot(c.width, c.height);
        const gap = op.gap * k;
        for (let s = -R; s < R; s += gap * 2) ctx.fillRect(s, -R, gap, R * 2);
        ctx.restore();
        ctx.strokeStyle = 'rgba(60,120,56,0.35)';
        ctx.lineWidth = 1.4 * k;
        path(op.pts);
        ctx.stroke();
        return;
      }
      case 'water': {
        // Stone/sand rim, shallow edge, deeper middle, ripples, lilies.
        ctx.strokeStyle = op.rim;
        ctx.lineWidth = 2.6 * k;
        ctx.lineJoin = 'round';
        path(op.pts);
        ctx.stroke();
        ctx.fillStyle = op.shallow;
        path(op.pts);
        ctx.fill();
        for (const [d, a] of [[-2.5, 0.55], [-6, 0.6], [-11, 0.5]] as const) {
          const inner = grow(op.pts, d);
          ctx.globalAlpha = a;
          ctx.fillStyle = op.deep;
          path(inner);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (op.fence) {
          ctx.strokeStyle = '#3d4249';
          ctx.lineWidth = 0.45 * k;
          path(grow(op.pts, 1.2));
          ctx.stroke();
        }
        // Ripples and sparkles (clipped to the water).
        ctx.save();
        path(op.pts);
        ctx.clip();
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const p of op.pts) {
          x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
          z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
        }
        const nr = Math.round(((x1 - x0) * (z1 - z0)) / 60);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = Math.max(1, 0.35 * k);
        ctx.lineCap = 'round';
        for (let i = 0; i < nr; i++) {
          const x = X(x0 + rnd() * (x1 - x0)), y = Y(z0 + rnd() * (z1 - z0));
          const L = (1 + rnd() * 2.2) * k;
          ctx.beginPath();
          ctx.moveTo(x - L, y);
          ctx.quadraticCurveTo(x, y - 0.5 * k, x + L, y);
          ctx.stroke();
        }
        // Lily pads near the edge.
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        for (let i = 0; i < (op.lilies ?? 0) * 3; i++) {
          const p = op.pts[Math.floor(rnd() * op.pts.length)];
          const dl = Math.hypot(mx - p.x, mz - p.z) || 1, inset = 2 + rnd() * 3;
          const q = { x: p.x + ((mx - p.x) / dl) * inset, z: p.z + ((mz - p.z) / dl) * inset };
          ctx.fillStyle = rnd() > 0.3 ? '#4caf50' : '#6cc66a';
          ctx.beginPath();
          const r = (0.5 + rnd() * 0.5) * k;
          ctx.arc(X(q.x), Y(q.z), r, 0.4, Math.PI * 2 - 0.1);
          ctx.lineTo(X(q.x), Y(q.z));
          ctx.fill();
          if (rnd() > 0.7) {
            ctx.fillStyle = '#ffd6e7';
            ctx.beginPath();
            ctx.arc(X(q.x), Y(q.z), r * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
        return;
      }
      case 'diamond': {
        // A ball field: outfield fan, infield dirt, grass square, bases, foul lines.
        const s = op.s;
        ctx.save();
        ctx.translate(X(op.x), Y(op.z));
        ctx.rotate(op.rot);
        ctx.scale(k * s, k * s);
        const B = 6; // home → first base
        ctx.fillStyle = '#a6e08a';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 21, -Math.PI * 0.75, -Math.PI * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 1.2);
        ctx.lineTo(-30, -28.8);
        ctx.lineTo(30, -28.8);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = '#d6a46f';
        ctx.beginPath();
        ctx.arc(0, -B * 0.72, B * 1.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#d6a46f';
        ctx.beginPath();
        ctx.arc(0, 0, 1.4, 0, Math.PI * 2);
        ctx.fill();
        const d = B / Math.SQRT2;
        ctx.fillStyle = '#8fd474';
        ctx.beginPath();
        ctx.moveTo(0, -0.9);
        ctx.lineTo(d - 0.9, -d);
        ctx.lineTo(0, -2 * d + 0.9);
        ctx.lineTo(-d + 0.9, -d);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#d6a46f';
        ctx.beginPath();
        ctx.arc(0, -d, 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.18;
        ctx.beginPath();
        ctx.moveTo(-15, -15);
        ctx.lineTo(0, 0);
        ctx.lineTo(15, -15);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (const [bx, by] of [[0, 0], [d, -d], [0, -2 * d], [-d, -d]]) ctx.fillRect(bx - 0.25, by - 0.25, 0.5, 0.5);
        ctx.restore();
        return;
      }
      case 'tennis': {
        const x = X(op.x), y = Y(op.z), w = op.w * k, d = op.d * k;
        ctx.fillStyle = '#c4673d';
        ctx.fillRect(x - w / 2 - 0.5 * k, y - d / 2 - 0.8 * k, w + 1 * k, d + 1.6 * k);
        ctx.fillStyle = '#d97b4c';
        ctx.fillRect(x - w / 2, y - d / 2, w, d);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, 0.14 * k);
        ctx.strokeRect(x - w / 2 + 0.3 * k, y - d / 2 + 0.3 * k, w - 0.6 * k, d - 0.6 * k);
        ctx.beginPath();
        ctx.moveTo(x - w / 2 + 0.9 * k, y - d / 2 + 0.3 * k);
        ctx.lineTo(x - w / 2 + 0.9 * k, y + d / 2 - 0.3 * k);
        ctx.moveTo(x + w / 2 - 0.9 * k, y - d / 2 + 0.3 * k);
        ctx.lineTo(x + w / 2 - 0.9 * k, y + d / 2 - 0.3 * k);
        ctx.moveTo(x - w / 2 + 0.9 * k, y - d * 0.22);
        ctx.lineTo(x + w / 2 - 0.9 * k, y - d * 0.22);
        ctx.moveTo(x - w / 2 + 0.9 * k, y + d * 0.22);
        ctx.lineTo(x + w / 2 - 0.9 * k, y + d * 0.22);
        ctx.moveTo(x, y - d * 0.22);
        ctx.lineTo(x, y + d * 0.22);
        ctx.stroke();
        ctx.strokeStyle = '#2b2d31';
        ctx.lineWidth = Math.max(1, 0.2 * k);
        ctx.beginPath();
        ctx.moveTo(x - w / 2, y);
        ctx.lineTo(x + w / 2, y);
        ctx.stroke();
        return;
      }
      case 'blanket': {
        ctx.save();
        ctx.translate(X(op.x), Y(op.z));
        ctx.rotate(op.rot);
        ctx.scale(k, k);
        ctx.fillStyle = op.color;
        ctx.fillRect(-1.1, -0.9, 2.2, 1.8);
        ctx.fillStyle = op.color === '#ffffff' ? 'rgba(230,57,70,0.7)' : 'rgba(255,255,255,0.6)';
        for (let i = 0; i < 3; i++) ctx.fillRect(-1.1, -0.75 + i * 0.6, 2.2, 0.22);
        ctx.restore();
        return;
      }
      case 'mosaic': {
        // Strawberry Fields' "Imagine" circle.
        const x = X(op.x), y = Y(op.z), r = op.r * k;
        ctx.fillStyle = '#d9d3c5';
        ctx.beginPath();
        ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#2b2b2b';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f2efe8';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a - 0.12) * r * 0.32, y + Math.sin(a - 0.12) * r * 0.32);
          ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
          ctx.lineTo(x + Math.cos(a + 0.12) * r * 0.32, y + Math.sin(a + 0.12) * r * 0.32);
          ctx.fill();
        }
        ctx.fillStyle = '#2b2b2b';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      case 'rink': {
        // Wollman (ice) or Lasker (a pool in summer): deck, surface, markings.
        const xs = op.pts.map((p) => X(p.x)), ys = op.pts.map((p) => Y(p.z));
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const R = 3 * k;
        const rr = (pad: number) => {
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') ctx.roundRect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2, R + pad);
          else ctx.rect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2);
        };
        ctx.fillStyle = '#e6e0d2';
        rr(1.6 * k);
        ctx.fill();
        ctx.fillStyle = op.ice ? '#e9f6fc' : '#4fb6e3';
        rr(0);
        ctx.fill();
        ctx.strokeStyle = op.ice ? 'rgba(120,180,220,0.35)' : 'rgba(255,255,255,0.7)';
        ctx.lineWidth = Math.max(1, 0.25 * k);
        if (op.ice) {
          for (let i = 0; i < 14; i++) {
            ctx.beginPath();
            const cx = x0 + rnd() * (x1 - x0), cy = y0 + rnd() * (y1 - y0);
            ctx.ellipse(cx, cy, (2 + rnd() * 5) * k, (1 + rnd() * 2) * k, rnd() * 3, 0, Math.PI * 1.4);
            ctx.stroke();
          }
        } else {
          for (let i = 1; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(x0 + 1.5 * k, y0 + ((y1 - y0) * i) / 6);
            ctx.lineTo(x1 - 1.5 * k, y0 + ((y1 - y0) * i) / 6);
            ctx.stroke();
          }
        }
        return;
      }
    }
  }

  // Bethesda's lower terrace: a ring pattern in the paving round the fountain.
  const bf = plan.features.find((f) => f.kind === 'bethesda');
  if (bf) {
    ctx.strokeStyle = 'rgba(160,130,95,0.55)';
    ctx.lineWidth = Math.max(1, 0.3 * k);
    for (const r of [9, 11.5]) {
      ctx.beginPath();
      ctx.arc(X(bf.x), Y(bf.z), r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(X(bf.x) + Math.cos(a) * 9 * k, Y(bf.z) + Math.sin(a) * 9 * k);
      ctx.lineTo(X(bf.x) + Math.cos(a) * 11.5 * k, Y(bf.z) + Math.sin(a) * 11.5 * k);
      ctx.stroke();
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
