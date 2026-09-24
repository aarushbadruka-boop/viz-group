/**
 * Parametric model of the VIZ cylindrical MPP capacitor, proportioned
 * after the reference unit VECOCA3AU0055B (can H/D ≈ 2.55, 3-pole
 * terminal block, rolled rim, wrap-around label).
 *
 * Units: can radius = 1. Local origin = centre of the can base.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons';

export const DIM = {
  R: 1.0,          // can outer radius
  H: 5.1,          // can height
  wall: 0.03,
  elemR: 0.86,     // wound element radius
  elemL: 1.36,     // wound element length (= film width)
  mandrelR: 0.1,
  blockW: 0.56,
  blockH: 0.5,
  blockD: 0.44,
  termX: [-0.18, 0, 0.18],
  labelY: 2.5,
  labelH: 1.38,
  labelTheta: 1.375,
  labelCenter: -0.42, // radians; label faces front-left like the photograph
};

/** Vertical centres of the three stacked elements (delta, bottom → top). */
export const STACK = {
  insulators: [0.075, 1.53, 2.99, 4.445],
  elements: [0.80, 2.26, 3.72],
  lugY: 4.62,
};

/* ------------------------------------------------------------------ can */

export function canGeometry(R = DIM.R, H = DIM.H) {
  const t = DIM.wall;
  const pts = [
    [0, 0], [R - 0.07, 0], [R - 0.025, 0.012], [R - 0.004, 0.04], [R, 0.075],
  ];
  // subdivide the wall so the UVs spread evenly along the height
  const steps = 12;
  for (let i = 1; i <= steps; i++) pts.push([R, 0.075 + ((H - 0.075) * i) / steps]);
  pts.push([R - t * 0.5, H + 0.004], [R - t, H]);
  for (let i = steps; i >= 1; i--) pts.push([R - t, 0.075 + ((H - 0.075) * (i - 1)) / steps + 0.01]);
  pts.push([R - t - 0.03, t + 0.01], [0, t]);

  const v2 = pts.map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(v2, 128);

  // re-parameterise V by arc length so the brushed texture isn't smeared
  const cum = [0];
  for (let j = 1; j < v2.length; j++) cum.push(cum[j - 1] + v2[j].distanceTo(v2[j - 1]));
  const total = cum[cum.length - 1];
  const uv = geo.attributes.uv;
  for (let i = 0; i <= 128; i++) {
    for (let j = 0; j < v2.length; j++) uv.setY(i * v2.length + j, (cum[j] / total) * 2.2);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function buildCan(m) {
  const g = new THREE.Group();
  g.name = 'can';
  const geo = canGeometry();
  const solid = new THREE.Mesh(geo, m.aluminium);
  solid.castShadow = true;
  solid.receiveShadow = true;
  solid.name = 'canSolid';
  const xray = new THREE.Mesh(geo, m.xray);
  xray.name = 'canXray';
  xray.renderOrder = 10;
  xray.visible = false;
  g.add(solid, xray);
  return g;
}

/** Rolled crimp bead that forms during sealing. */
export function buildRimBead(m) {
  const geo = new THREE.TorusGeometry(DIM.R - 0.012, 0.036, 16, 128);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, m.aluminiumLid);
  mesh.position.y = DIM.H - 0.004;
  mesh.castShadow = true;
  mesh.name = 'rimBead';
  return mesh;
}

/* ------------------------------------------------------------------- lid */

export function lidGeometry() {
  const pts = [
    [0, 0.034], [0.35, 0.033], [0.62, 0.028], [0.84, 0.016], [0.93, 0.004],
    [0.955, -0.02], [0.955, -0.07], [0.93, -0.07], [0.9, -0.03], [0, -0.03],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 96);
  geo.computeVertexNormals();
  return geo;
}

export function buildTerminalBlock(m) {
  const { blockW: w, blockH: h, blockD: d } = DIM;
  const g = new THREE.Group();
  g.name = 'terminalBlock';

  const flange = new THREE.Mesh(new RoundedBoxGeometry(w + 0.1, 0.05, d + 0.08, 2, 0.015), m.blackPlastic);
  flange.position.y = 0.025;
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h - 0.04, d, 3, 0.03), m.blackPlastic);
  body.position.y = 0.05 + (h - 0.04) / 2;
  g.add(flange, body);

  const colW = w / 3;
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + colW * (i + 0.5);
    // raised top pad
    const pad = new THREE.Mesh(new RoundedBoxGeometry(colW - 0.03, 0.04, d - 0.08, 2, 0.01), m.blackPlastic);
    pad.position.set(x, h + 0.01, 0);
    // recessed window + captive screw
    const win = new THREE.Mesh(new THREE.BoxGeometry(colW - 0.07, 0.15, 0.02), m.darkRecess);
    win.position.set(x, 0.19, d / 2 + 0.002);
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.02, 24), m.nickel);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, 0.19, d / 2 + 0.008);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.01, 0.006), m.darkRecess);
    slot.position.set(x, 0.19, d / 2 + 0.019);
    slot.rotation.z = 0.5 + i * 0.7;
    // top cable entry
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 20), m.darkRecess);
    hole.position.set(x, h + 0.028, 0.05);
    g.add(pad, win, screw, slot, hole);
    if (i < 2) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.018, h - 0.06, 0.03), m.blackPlastic);
      rib.position.set(-w / 2 + colW * (i + 1), 0.05 + (h - 0.06) / 2, d / 2 + 0.012);
      g.add(rib);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/**
 * Lid assembly: domed aluminium lid + terminal block + brass posts that
 * reach down to meet the internal lugs.
 */
export function buildLidAssembly(m) {
  const g = new THREE.Group();
  g.name = 'lidAssembly';
  const lid = new THREE.Mesh(lidGeometry(), m.aluminiumLid);
  lid.name = 'lid';
  lid.castShadow = true;
  const lidX = new THREE.Mesh(lid.geometry, m.xray);
  lidX.name = 'lidXray';
  lidX.visible = false;
  const block = buildTerminalBlock(m);
  block.position.y = 0.03;
  g.add(lid, lidX, block);

  const posts = new THREE.Group();
  posts.name = 'posts';
  DIM.termX.forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 16), m.brass);
    post.position.set(x, -0.2, 0);
    posts.add(post);
  });
  g.add(posts);
  g.userData = { lid, lidX, block, posts };
  return g;
}

/* ----------------------------------------------------------------- label */

const labelGeoCache = new Map();
/** Label sleeve geometry, `frac` of the full wrap (for the applicator). */
export function labelGeometry(frac = 1) {
  const q = Math.max(1, Math.round(frac * 40));
  if (labelGeoCache.has(q)) return labelGeoCache.get(q);
  const f = q / 40;
  const theta = DIM.labelTheta * f;
  const start = DIM.labelCenter - DIM.labelTheta / 2;
  const geo = new THREE.CylinderGeometry(DIM.R + 0.004, DIM.R + 0.004, DIM.labelH, Math.max(2, Math.round(48 * f)), 1, true, start, theta);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * f);
  uv.needsUpdate = true;
  labelGeoCache.set(q, geo);
  return geo;
}

export function buildLabel(m) {
  const mesh = new THREE.Mesh(labelGeometry(1), m.label);
  mesh.position.y = DIM.labelY;
  mesh.name = 'label';
  return mesh;
}

/* --------------------------------------------------------------- element */

/**
 * One wound MPP element (axis = local Y). Returns a Group with an API:
 *   setRadius(r) · setZinc(coverage, glow) · setTape(a) · setLayers(explode)
 */
export function buildElement(m, { length = DIM.elemL, radius = DIM.elemR, layers = true } = {}) {
  const L = length;
  const g = new THREE.Group();
  g.name = 'element';

  const spin = new THREE.Group();
  g.add(spin);

  const bodyTex = m.textures.filmTex.clone();
  bodyTex.center.set(0.5, 0.5);
  bodyTex.rotation = Math.PI / 2;
  bodyTex.repeat.set(1, 6);
  bodyTex.needsUpdate = true;
  const bodyMat = m.elementBody.clone();
  bodyMat.map = bodyTex;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, L, 72, 1, true), bodyMat);
  body.castShadow = true;
  const faceGeo = new THREE.CircleGeometry(1, 72);
  const faceMat = m.elementFace.clone();
  const faceTop = new THREE.Mesh(faceGeo, faceMat);
  faceTop.rotation.x = -Math.PI / 2;
  faceTop.position.y = L / 2;
  const faceBot = new THREE.Mesh(faceGeo, faceMat);
  faceBot.rotation.x = Math.PI / 2;
  faceBot.position.y = -L / 2;
  const tapeMat = m.tape.clone();
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(1.012, 1.012, L * 0.94, 72, 1, true), tapeMat);
  spin.add(body, faceTop, faceBot, tape);

  const zincMat = m.zinc.clone();
  const zincGeo = new THREE.CircleGeometry(1.004, 72);
  const zincTop = new THREE.Mesh(zincGeo, zincMat);
  zincTop.rotation.x = -Math.PI / 2;
  zincTop.position.y = L / 2 + 0.006;
  const zincBot = new THREE.Mesh(zincGeo, zincMat);
  zincBot.rotation.x = Math.PI / 2;
  zincBot.position.y = -L / 2 - 0.006;
  spin.add(zincTop, zincBot);

  // concentric film layers, telescoped for the X-ray inspection view
  const layerGroup = new THREE.Group();
  layerGroup.visible = false;
  const shells = [];
  if (layers) {
    const metalMat = m.film.clone();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const r = radius * (1 - i * 0.125);
      const isMetal = i % 2 === 0;
      const mat = isMetal ? metalMat : m.filmClear;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 48, 1, true), mat);
      s.renderOrder = 2;
      layerGroup.add(s);
      shells.push(s);
    }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.12, radius * 0.12, L + 0.02, 24), m.darkSteel);
    layerGroup.add(core);
  }
  spin.add(layerGroup);

  let currentR = radius;
  const api = {
    spin,
    body,
    tape,
    zincTop,
    zincBot,
    zincMat,
    layerGroup,
    setRadius(r) {
      currentR = r;
      body.scale.set(r, 1, r);
      faceTop.scale.set(r, r, 1);
      faceBot.scale.set(r, r, 1);
      tape.scale.set(r, 1, r);
      zincTop.scale.set(r, r, 1);
      zincBot.scale.set(r, r, 1);
    },
    /** coverage 0..1 (alpha-tested blotches), glow 0..1 (molten emissive) */
    setZinc(coverage, glow = 0) {
      zincMat.alphaTest = THREE.MathUtils.lerp(0.999, 0.02, THREE.MathUtils.clamp(coverage, 0, 1));
      zincTop.visible = zincBot.visible = coverage > 0.001;
      zincMat.emissiveIntensity = glow * 1.6;
    },
    setTape(a) {
      tapeMat.opacity = a * 0.28;
      tape.visible = a > 0.01;
    },
    setOpacity(a) {
      bodyMat.opacity = a;
      faceMat.opacity = a;
      tapeMat.opacity = Math.min(tapeMat.opacity, a * 0.28);
    },
    /** 0 = solid element, 1 = telescoped concentric layers */
    setLayers(e) {
      layerGroup.visible = e > 0.001;
      const solid = 1 - THREE.MathUtils.smoothstep(e, 0, 0.35);
      body.visible = solid > 0.01;
      bodyMat.opacity = solid;
      tape.visible = tape.visible && solid > 0.01;
      shells.forEach((s, i) => { s.position.y = i * 0.11 * e; });
      zincTop.position.y = L / 2 + 0.006 + shells.length * 0.11 * e + 0.12 * e;
    },
    get radius() { return currentR; },
  };
  g.userData.api = api;
  api.setRadius(radius);
  api.setZinc(1);
  api.setTape(1);
  return g;
}

/* ------------------------------------------------------- finished product */

/** The finished capacitor, as photographed. Origin = base centre. */
export function buildFinishedCapacitor(m) {
  const g = new THREE.Group();
  g.name = 'capacitor';
  const can = buildCan(m);
  const bead = buildRimBead(m);
  const lid = buildLidAssembly(m);
  lid.position.y = DIM.H - 0.03;
  lid.userData.posts.visible = false;
  const label = buildLabel(m);
  g.add(can, bead, lid, label);
  g.userData = { can, bead, lid, label };
  return g;
}
