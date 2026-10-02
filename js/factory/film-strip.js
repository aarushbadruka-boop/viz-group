/**
 * A ribbon of film following a polyline in the YZ plane (width along X).
 * Shared by the metallizer, the slitter and the winder.
 */
import * as THREE from 'three';

const { clamp, lerp } = THREE.MathUtils;

export class FilmStrip extends THREE.Mesh {
  constructor(width, material, samples = 60) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(samples * 6), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(samples * 6), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(samples * 4), 2));
    // absolute arc length along the path — lets shaders mark fixed points on the line
    geo.setAttribute('arc', new THREE.BufferAttribute(new Float32Array(samples * 2), 1));
    const idx = [];
    for (let i = 0; i < samples - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    geo.setIndex(idx);
    super(geo, material);
    this.width = width;
    this.samples = samples;
    this.frustumCulled = false;
    this.castShadow = true;
  }

  /**
   * @param {number[][]} pts [[z, y], ...]
   * @param {object} o  x: centre, from/to: drawn fraction, flow: texture scroll, sOffset: arc offset,
   *                    u0/u1: UV range across the web (for strips cut from a wider web)
   * @returns {number} path length
   */
  setPath(pts, { x = 0, from = 0, to = 1, flow = 0, sOffset = 0, flipU = false, u0 = 0, u1 = 1 } = {}) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const total = cum[cum.length - 1] || 1e-6;
    const s0 = from * total, s1 = to * total;
    const pos = this.geometry.attributes.position.array;
    const nor = this.geometry.attributes.normal.array;
    const uv = this.geometry.attributes.uv.array;
    const arc = this.geometry.attributes.arc.array;
    const hw = this.width / 2;
    const [ua, ub] = flipU ? [u1, u0] : [u0, u1];
    let j = 0;
    for (let k = 0; k < this.samples; k++) {
      const s = s0 + ((s1 - s0) * k) / (this.samples - 1);
      while (j < cum.length - 2 && s > cum[j + 1]) j++;
      const segLen = cum[j + 1] - cum[j] || 1e-6;
      const f = clamp((s - cum[j]) / segLen, 0, 1);
      const z = lerp(pts[j][0], pts[j + 1][0], f);
      const y = lerp(pts[j][1], pts[j + 1][1], f);
      const tz = (pts[j + 1][0] - pts[j][0]) / segLen;
      const ty = (pts[j + 1][1] - pts[j][1]) / segLen;
      const o = k * 6;
      pos[o] = x - hw; pos[o + 1] = y; pos[o + 2] = z;
      pos[o + 3] = x + hw; pos[o + 4] = y; pos[o + 5] = z;
      nor[o] = 0; nor[o + 1] = -tz; nor[o + 2] = ty;
      nor[o + 3] = 0; nor[o + 4] = -tz; nor[o + 5] = ty;
      const v = (s + sOffset - flow) * 0.35;
      uv[k * 4] = ua; uv[k * 4 + 1] = v;
      uv[k * 4 + 2] = ub; uv[k * 4 + 3] = v;
      arc[k * 2] = arc[k * 2 + 1] = s;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    this.geometry.attributes.arc.needsUpdate = true;
    return total;
  }
}

export const pathLength = (pts) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
};

/** Points on a circle in the YZ plane, [[z, y], ...], from angle a0 to a1 (rad, 0 = +z). */
export function arcPoints(cz, cy, r, a0, a1, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = lerp(a0, a1, i / n);
    out.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
