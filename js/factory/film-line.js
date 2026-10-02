/**
 * Upstream film processing for <CapacitorFactory>:
 *   stage 01 — vacuum metallization (Al + Zn vapour onto polypropylene film)
 *   stage 02 — slitting the metallized master roll into narrow reels
 *
 * Each station stands on its own floor patch further down the line (−x), so
 * the camera tracks sideways from station to station. As with the rest of the
 * factory, every visual is a pure function of the timeline position T.
 */
import * as THREE from 'three';
import { DIM } from '../three/capacitor-model.js';
import { Emitter } from './particles.js';
import { FilmStrip, pathLength, arcPoints } from './film-strip.js';

const { clamp, lerp } = THREE.MathUtils;
const seg = (T, a, b) => clamp((T - a) / (b - a), 0, 1);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const axisX = (geo) => geo.rotateZ(Math.PI / 2);

const FLOOR_Y = -DIM.H / 2 - 0.04;
/** Station centres along x. Multiples of the floor-grid cell so the grids line up. */
export const STATIONS = { metallize: -20.25, slit: -10.125 };

/* --------------------------------------------------------- film shader */

/**
 * Polypropylene film that can carry metallized lanes. Built on
 * MeshStandardMaterial so it keeps the scene's PBR lighting.
 *   lanes / clear   — lane periods across the web and clear-lane fraction
 *   coatS / coatLen — metal exists for arc ∈ [coatS, coatS + coatLen]
 *   zone            — arc length over which the coating builds up (vapour window)
 *   oilS            — arc where the oil mask is printed (iridescent clear lanes)
 */
export function processFilmMaterial({ lanes = 3, clear = 0.16, laneAxis = 0, laneScale = 1, laneOffset = 0 } = {}) {
  const u = {
    uLanes: { value: lanes }, uClear: { value: clear }, uLaneAxis: { value: laneAxis },
    uLaneScale: { value: laneScale }, uLaneOffset: { value: laneOffset },
    uCoatS: { value: -1e4 }, uCoatLen: { value: 1e5 }, uZone: { value: 1 }, uOilS: { value: 1e4 },
    uMetal: { value: 1 }, uGlow: { value: 0 }, uMarginGlow: { value: 0 },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: 0.9, roughness: 0.2, transparent: true, side: THREE.DoubleSide, envMapIntensity: 1.3,
  });
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float arc;\nvarying float vArc;\nvarying vec2 vFilmUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvArc = arc;\nvFilmUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
        uniform float uLanes, uClear, uLaneAxis, uLaneScale, uLaneOffset;
        uniform float uCoatS, uCoatLen, uZone, uOilS, uMetal, uGlow, uMarginGlow;
        varying float vArc;
        varying vec2 vFilmUv;`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        float across = mix(vFilmUv.x, vFilmUv.y, uLaneAxis) * uLaneScale + uLaneOffset;
        float along = mix(vFilmUv.y, vFilmUv.x, uLaneAxis);
        float lq = across * uLanes;
        float laneAA = fwidth(lq) * 1.5 + 1e-4;
        float clearLane = 1.0 - smoothstep(uClear * 0.5 - laneAA, uClear * 0.5 + laneAA, abs(fract(lq) - 0.5));
        float coated = step(uCoatS, vArc) * step(vArc, uCoatS + uCoatLen);
        float build = smoothstep(uCoatS, uCoatS + uZone * 0.7, vArc);
        float metal = coated * build * (1.0 - clearLane) * uMetal;
        // fine segmentation lines in the electrode make the web's motion readable
        float segLine = 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.07, fract(along * 4.0)));
        float oil = step(uOilS, vArc) * clearLane;
        vec3 clearCol = vec3(0.78, 0.87, 0.95)
          + oil * 0.2 * (0.5 + 0.5 * cos(6.2831 * (along * 0.6 + vec3(0.0, 0.33, 0.67))));
        diffuseColor.rgb = mix(clearCol, vec3(0.88, 0.9, 0.94) * segLine, metal);
        diffuseColor.a = mix(0.34 + oil * 0.14, 1.0, metal) * opacity;
        diffuseColor.a = max(diffuseColor.a, clearLane * min(uMarginGlow, 1.0) * 0.85 * opacity);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.1, 0.2, metal);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(0.05, 0.95, metal);')
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
        float zone = step(uCoatS, vArc) * (1.0 - smoothstep(uCoatS, uCoatS + uZone, vArc));
        totalEmissiveRadiance += vec3(0.55, 0.8, 1.0) * uGlow * zone * (1.0 - clearLane);
        totalEmissiveRadiance += vec3(1.0, 0.8, 0.1) * uMarginGlow * clearLane;`);
  };
  return mat;
}

/** Additive, flickering plume of metal vapour rising from an evaporation source. */
function vapourMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uIntensity; uniform vec3 uColor;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main(){
        float h = vUv.y;                                   // 0 at the source, 1 at the film
        float n = noise(vec2(vUv.x * 14.0, h * 5.0 - uTime * 6.0));
        float streak = 0.55 + 0.45 * noise(vec2(vUv.x * 40.0, uTime * 2.0));
        float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float a = uIntensity * facing * streak * (0.35 + 0.65 * n) * (1.0 - 0.55 * h) * smoothstep(0.0, 0.08, h);
        gl_FragColor = vec4(uColor * a * (1.4 - 0.6 * h), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Tube along a circular arc around the X axis (θ = 0 → +z, θ = 90° → +y). */
function shellArcTube(r, tube, th0, th1, x, cy, material) {
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = lerp(th0, th1, i / 48);
    pts.push(new THREE.Vector3(x, cy + Math.sin(t) * r, Math.cos(t) * r));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, tube, 8, false), material);
}

/* ============================================================== stations */

export class FilmLine {
  /** @param {THREE.Scene} scene  @param {object} m  shared materials from createMaterials() */
  constructor(scene, m) {
    this.m = m;
    this.#buildMetallizer();
    this.#buildSlitter();
    scene.add(this.metallizer, this.slitter);
  }

  #floor(group) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), this.m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), this.m.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = FLOOR_Y + 0.002;
    shadow.receiveShadow = true;
    group.add(floor, shadow);
  }

  #roll(width, r, sideMat, faceMat, hubMat) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(axisX(new THREE.CylinderGeometry(1, 1, width, 64)), [sideMat, faceMat, faceMat]);
    body.scale.set(1, r, r);
    body.castShadow = true;
    const hub = new THREE.Mesh(axisX(new THREE.CylinderGeometry(0.15, 0.15, width + 0.08, 24)), hubMat);
    g.add(body, hub);
    g.userData.body = body;
    return g;
  }

  /* ------------------------------------------------------- 01 metallizer */

  #buildMetallizer() {
    const m = this.m;
    const g = (this.metallizer = new THREE.Group());
    g.name = 'metallizer';
    g.position.x = STATIONS.metallize;
    this.#floor(g);

    const R = 2.15, LEN = 3.6, CY = 0;
    const W = (this.mW = 2.4);
    const L = (this.mL = {
      drum: [0, -0.25], drumR: 0.9, unwind: [-1.15, 1.0], rewind: [1.15, 1.0],
      idlerA: [-1.55, 0.05], idlerB: [1.55, 0.05], idlerR: 0.1,
    });

    /* vacuum chamber — horizontal cylinder, cut away at the front and top */
    const th0 = THREE.MathUtils.degToRad(108), th1 = THREE.MathUtils.degToRad(325);
    const inner = new THREE.MeshStandardMaterial({ color: 0x8b98a5, metalness: 0.85, roughness: 0.36, side: THREE.BackSide });
    const shellIn = new THREE.Mesh(axisX(new THREE.CylinderGeometry(R, R, LEN, 96, 1, true, th0, th1 - th0)), inner);
    const shellOut = new THREE.Mesh(axisX(new THREE.CylinderGeometry(R + 0.06, R + 0.06, LEN, 96, 1, true, th0, th1 - th0)), m.navyPaint);
    shellOut.castShadow = true;
    shellIn.position.y = shellOut.position.y = CY;
    const back = new THREE.Mesh(axisX(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.08, 96)), m.navyPaint);
    back.position.set(LEN / 2, CY, 0);
    const backIn = new THREE.Mesh(axisX(new THREE.CircleGeometry(R, 96).rotateY(-Math.PI / 2).rotateZ(-Math.PI / 2)), inner);
    backIn.position.set(LEN / 2 - 0.045, CY, 0);
    // cut-away edges in safety yellow, end flanges in brand blue
    const edgeMat = m.yellowPaint;
    const edges = [th0, th1].map((t) => {
      const e = new THREE.Mesh(axisX(new THREE.CylinderGeometry(0.035, 0.035, LEN, 12)), edgeMat);
      e.position.set(0, CY + Math.sin(t) * (R + 0.03), Math.cos(t) * (R + 0.03));
      return e;
    });
    const flangeA = shellArcTube(R + 0.06, 0.07, th0, th1, -LEN / 2, CY, m.bluePaint);
    const flangeB = shellArcTube(R + 0.06, 0.07, th0, th1, LEN / 2, CY, m.bluePaint);
    g.add(shellIn, shellOut, back, backIn, ...edges, flangeA, flangeB);

    // saddles, vacuum pumps and the roughing line
    [-1.15, 1.15].forEach((x) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.6, 2.4), m.darkSteel);
      s.position.set(x, FLOOR_Y + 0.3, 0);
      s.castShadow = s.receiveShadow = true;
      g.add(s);
    });
    const pumpH = -0.2 - FLOOR_Y;
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, pumpH, 32), m.darkSteel);
    pump.position.set(0.7, FLOOR_Y + pumpH / 2, -3.05);
    const pumpBand = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.1, 32), m.yellowPaint);
    pumpBand.position.set(0.7, -0.6, -3.05);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.0, 20).rotateX(Math.PI / 2), m.steel);
    pipe.position.set(0.7, -0.4, -2.55);
    const roots = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.62, 0.6), m.navyPaint);
    roots.position.set(-0.6, FLOOR_Y + 0.31, -3.05);
    const motor = new THREE.Mesh(axisX(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 24)), m.bluePaint);
    motor.position.set(-1.25, FLOOR_Y + 0.31, -3.05);
    [pump, pipe, roots, motor].forEach((o) => { o.castShadow = true; });
    g.add(pump, pumpBand, pipe, roots, motor);

    /* film transport: unwind → oil-mask roller → chill drum → idler → rewind */
    const clearRoll = (this.clearRollMat = new THREE.MeshStandardMaterial({
      color: 0xd6e8f5, metalness: 0.15, roughness: 0.12, transparent: true, opacity: 0.62,
    }));
    this.mUnwind = this.#roll(W, 0.55, clearRoll, clearRoll, m.yellowPaint);
    this.mUnwind.position.set(0, L.unwind[1], L.unwind[0]);
    this.mRewindMat = processFilmMaterial({ laneAxis: 1 });
    this.mRewind = this.#roll(W, 0.28, this.mRewindMat, clearRoll, m.yellowPaint);
    this.mRewind.position.set(0, L.rewind[1], L.rewind[0]);

    const drum = new THREE.Group();
    const drumBody = new THREE.Mesh(axisX(new THREE.CylinderGeometry(L.drumR, L.drumR, W + 0.4, 96)), m.steel);
    drumBody.castShadow = true;
    const drumFlangeGeo = axisX(new THREE.CylinderGeometry(L.drumR + 0.05, L.drumR + 0.05, 0.06, 96));
    const spokeGeo = new THREE.BoxGeometry(0.02, L.drumR * 1.7, 0.08);
    [-1, 1].forEach((side) => {
      const fl = new THREE.Mesh(drumFlangeGeo, m.darkSteel);
      fl.position.x = side * (W / 2 + 0.23);
      drum.add(fl);
      for (let k = 0; k < 3; k++) {
        const sp = new THREE.Mesh(spokeGeo, m.bluePaint);
        sp.position.x = side * (W / 2 + 0.27);
        sp.rotation.x = (k * Math.PI) / 3;
        drum.add(sp);
      }
    });
    drum.add(drumBody);
    drum.position.set(0, L.drum[1], L.drum[0]);
    this.mDrum = drum;

    const rollerGeo = axisX(new THREE.CylinderGeometry(L.idlerR, L.idlerR, W + 0.3, 32));
    this.mIdlers = [L.idlerA, L.idlerB].map(([z, y]) => {
      const r = new THREE.Mesh(rollerGeo, m.steel);
      r.position.set(0, y, z);
      return r;
    });
    // oil-mask print bands on the first roller, over each clear lane
    const bandGeo = axisX(new THREE.CylinderGeometry(L.idlerR + 0.008, L.idlerR + 0.008, (W / 3) * 0.16, 32));
    [1, 3, 5].forEach((k) => {
      const b = new THREE.Mesh(bandGeo, m.yellowPaint);
      b.position.set(-W / 2 + (W * k) / 6, L.idlerA[1], L.idlerA[0]);
      g.add(b);
    });
    g.add(this.mUnwind, this.mRewind, drum, ...this.mIdlers);

    this.mFilmMat = processFilmMaterial({ lanes: 3 });
    this.mFilm = new FilmStrip(W, this.mFilmMat, 140);
    g.add(this.mFilm);

    /* evaporation sources: Al boats (rear row) and Zn crucibles (front row) under a slotted shield */
    const boatY = -1.85;
    this.boatMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6, emissive: 0xff9a4a, emissiveIntensity: 0 });
    const alXs = [-0.9, -0.3, 0.3, 0.9], znXs = [-0.8, 0, 0.8];
    const alZ = -0.25, znZ = 0.3;
    const boatGeo = new THREE.BoxGeometry(0.36, 0.05, 0.14);
    const clampGeo = new THREE.BoxGeometry(0.06, 0.1, 0.18);
    alXs.forEach((x) => {
      const b = new THREE.Mesh(boatGeo, this.boatMat);
      b.position.set(x, boatY, alZ);
      g.add(b);
      [-1, 1].forEach((s) => {
        const c = new THREE.Mesh(clampGeo, m.copper);
        c.position.set(x + s * 0.2, boatY - 0.02, alZ);
        g.add(c);
      });
    });
    const crucibleGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.12, 24);
    znXs.forEach((x) => {
      const c = new THREE.Mesh(crucibleGeo, this.boatMat);
      c.position.set(x, boatY + 0.02, znZ);
      g.add(c);
    });
    [alZ, znZ].forEach((z) => {
      const bus = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.22), m.darkSteel);
      bus.position.set(0, boatY - 0.09, z);
      g.add(bus);
    });
    // rear vapour shield; the coating window on the drum runs from z = −0.55 to +0.65
    // (the front shield is cut away so the sources stay in view)
    const shield = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.03, 0.8), m.darkSteel);
    shield.position.set(0, -1.38, -0.95);
    g.add(shield);
    this.zoneZ = [-0.55, 0.65];

    const plumeH = 0.66;
    const plumeGeo = (top) => new THREE.CylinderGeometry(top, 0.05, plumeH, 32, 1, true).translate(0, plumeH / 2, 0);
    this.vapAl = vapourMaterial(0x9cd2ff);
    this.vapZn = vapourMaterial(0xffc27a);
    const gAl = plumeGeo(0.32), gZn = plumeGeo(0.4);
    this.plumes = [];
    alXs.forEach((x) => {
      const p = new THREE.Mesh(gAl, this.vapAl);
      p.position.set(x, boatY + 0.03, alZ);
      p.renderOrder = 18;
      this.plumes.push(p);
    });
    znXs.forEach((x) => {
      const p = new THREE.Mesh(gZn, this.vapZn);
      p.position.set(x, boatY + 0.08, znZ);
      p.renderOrder = 18;
      this.plumes.push(p);
    });
    g.add(...this.plumes);

    this.alSpray = new Emitter({
      count: 900, life: 0.32, speed: [1.8, 3.2], cone: 0.42, seed: 17, stop: plumeH,
      spawnPoints: alXs.map((x) => new THREE.Vector3(x, boatY + 0.03, alZ)), hot: 0xf4f9ff, cool: 0x6fb4ff, size: 0.07,
    });
    this.znSpray = new Emitter({
      count: 700, life: 0.34, speed: [1.6, 3.0], cone: 0.5, seed: 23, stop: plumeH - 0.05,
      spawnPoints: znXs.map((x) => new THREE.Vector3(x, boatY + 0.08, znZ)), hot: 0xfff3d6, cool: 0xffa040, size: 0.075,
    });
    this.alLight = new THREE.PointLight(0xbfe0ff, 0, 4, 2);
    this.alLight.position.set(0, -1.5, alZ);
    this.znLight = new THREE.PointLight(0xffb35a, 0, 4, 2);
    this.znLight.position.set(0, -1.5, znZ);
    g.add(this.alSpray, this.znSpray, this.alLight, this.znLight);
  }

  /* ---------------------------------------------------------- 02 slitter */

  #buildSlitter() {
    const m = this.m;
    const g = (this.slitter = new THREE.Group());
    g.name = 'slitter';
    g.position.x = STATIONS.slit;
    this.#floor(g);

    const W = (this.sW = 2.7);
    const N = (this.sN = 6);
    const L = (this.sL = {
      master: [-2.5, 0.25], idler: [-1.0, 1.05], cut: [0.4, 1.05], up: [2.05, 2.0], down: [2.05, 0.0],
      idlerR: 0.1, cutR: 0.13,
    });
    const xOf = (u) => -W / 2 + W * u;
    this.sXs = Array.from({ length: N }, (_, k) => xOf((k + 0.5) / N));

    // drive-side frame (+x) and plinth
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 5.2, 6.6), m.navyPaint);
    plate.position.set(W / 2 + 0.45, FLOOR_Y + 2.6, -0.2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 6.6), m.yellowPaint);
    stripe.position.set(W / 2 + 0.45, FLOOR_Y + 5.16, -0.2);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 6.8), m.darkSteel);
    plinth.position.set(W / 2 + 0.45, FLOOR_Y + 0.15, -0.2);
    [plate, plinth].forEach((o) => { o.castShadow = o.receiveShadow = true; });
    g.add(plate, stripe, plinth);

    const shaftGeo = axisX(new THREE.CylinderGeometry(0.05, 0.05, W + 1.0, 16));
    [L.master, L.up, L.down].forEach(([z, y]) => {
      const s = new THREE.Mesh(shaftGeo, m.steel);
      s.position.set(0.15, y, z);
      g.add(s);
    });

    // master roll — the metallized web, lanes visible on the roll face
    this.sMasterMat = processFilmMaterial({ laneAxis: 1 });
    this.sMaster = this.#roll(W, 0.95, this.sMasterMat, m.elementFace, m.yellowPaint);
    this.sMaster.position.set(0, L.master[1], L.master[0]);

    const rollerGeo = axisX(new THREE.CylinderGeometry(L.idlerR, L.idlerR, W + 0.3, 32));
    const idler = new THREE.Mesh(rollerGeo, m.steel);
    idler.position.set(0, L.idler[1], L.idler[0]);
    const cutRoll = new THREE.Mesh(axisX(new THREE.CylinderGeometry(L.cutR, L.cutR, W + 0.3, 48)), m.steel);
    cutRoll.position.set(0, L.cut[1], L.cut[0]);
    this.sRollers = [idler, cutRoll];
    g.add(this.sMaster, idler, cutRoll);

    // web-guide edge sensor
    const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.2), m.darkSteel);
    sensor.position.set(-W / 2, L.idler[1] - 0.25, -1.55);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x5fd0ff }));
    led.position.set(-W / 2 - 0.075, L.idler[1] - 0.2, -1.55);
    g.add(sensor, led);

    /* rotary razor blades on a knife beam, one at every slit line */
    const cutTop = L.cut[1] + L.cutR;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 0.9, 0.16, 0.18), m.navyPaint);
    beam.position.set(0.1, 1.95, L.cut[0]);
    beam.castShadow = true;
    g.add(beam);
    this.blades = new THREE.Group();
    const bladeGeo = axisX(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 48));
    const hubGeo = axisX(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 16));
    const armGeo = new THREE.BoxGeometry(0.05, 0.5, 0.07);
    const grooveGeo = new THREE.TorusGeometry(L.cutR, 0.007, 6, 48).rotateY(Math.PI / 2);
    this.slitXs = [];
    for (let k = 1; k < N; k++) {
      const x = xOf(k / N);
      this.slitXs.push(x);
      const holder = new THREE.Group();
      holder.position.set(x, cutTop + 0.2 - 0.04, L.cut[0]);
      const blade = new THREE.Mesh(bladeGeo, m.steel);
      const hub = new THREE.Mesh(hubGeo, m.darkSteel);
      const arm = new THREE.Mesh(armGeo, m.darkSteel);
      arm.position.set(0.04, 0.3, 0);
      holder.add(blade, hub, arm);
      holder.userData.blade = blade;
      this.blades.add(holder);
      const groove = new THREE.Mesh(grooveGeo, m.darkSteel);
      groove.position.set(x, L.cut[1], L.cut[0]);
      g.add(groove);
    }
    g.add(this.blades);

    /* webs: wide master in, six narrow ribbons out — alternate reels go to the upper / lower shaft */
    this.sWebMat = processFilmMaterial({ lanes: 3 });
    this.sWeb = new FilmStrip(W, this.sWebMat, 40);
    this.sRibbonMat = processFilmMaterial({ lanes: 3 });
    this.ribbons = this.sXs.map(() => new FilmStrip(W / N - 0.014, this.sRibbonMat, 24));
    g.add(this.sWeb, ...this.ribbons);

    this.reelMats = [];
    this.reels = this.sXs.map((x, k) => {
      // cylinder UV v runs +x → −x, so map it back onto this reel's slice of the master web
      const mat = processFilmMaterial({ laneAxis: 1, laneScale: -1 / N, laneOffset: (k + 1) / N });
      this.reelMats.push(mat);
      const r = this.#roll(W / N - 0.03, 0.22, mat, m.elementFace, m.yellowPaint);
      const [z, y] = k % 2 ? L.down : L.up;
      r.position.set(x, y, z);
      g.add(r);
      return r;
    });

    this.slitDust = new Emitter({
      count: 300, life: 0.5, speed: [0.3, 0.9], cone: 0.9, gravity: 2.5, seed: 29, size: 0.035,
      spawnPoints: this.slitXs.map((x) => new THREE.Vector3(x, cutTop, L.cut[0])), hot: 0xffffff, cool: 0x8fd0ff,
    });
    g.add(this.slitDust);
  }

  /* -------------------------------------------------------------- update */

  /** @param {number} T timeline position  @param {number} tSec seconds at 1× (for flicker / particles) */
  update(T, tSec) {
    this.metallizer.visible = T < 1.06;
    this.slitter.visible = T > 0.86 && T < 2.06;
    if (this.metallizer.visible) this.#updateMetallizer(clamp(T, 0, 1), tSec);
    else { this.alSpray.active = this.znSpray.active = false; }
    if (this.slitter.visible) this.#updateSlitter(clamp(T - 1, 0, 1), tSec);
    else this.slitDust.active = false;
  }

  #updateMetallizer(p, tSec) {
    const L = this.mL;
    const heat = ease(seg(p, 0.1, 0.24));
    const vapour = ease(seg(p, 0.2, 0.27));
    const fed = Math.max(0, p - 0.2) * 9;
    const coatLen = Math.max(0, p - 0.23) * 9;
    const run = seg(p, 0.2, 1);

    const rU = lerp(0.55, 0.38, run);
    const rR = lerp(0.28, 0.5, run);
    this.mUnwind.userData.body.scale.set(1, rU, rU);
    this.mRewind.userData.body.scale.set(1, rR, rR);
    this.mUnwind.rotation.x = -fed / rU;
    this.mRewind.rotation.x = -fed / rR;
    this.mDrum.rotation.x = -fed / L.drumR;
    this.mIdlers.forEach((r) => { r.rotation.x = -fed / L.idlerR; });

    // film path (z, y): unwind → oil roller A → wrap under the chill drum → idler B → rewind
    const [dz, dy] = L.drum;
    const rf = L.drumR + 0.006;
    const a0 = Math.PI - 0.15, a1 = Math.PI * 2 + 0.15;
    const [Az, Ay] = L.idlerA, [Bz, By] = L.idlerB;
    const pre = [
      [L.unwind[0] - rU, L.unwind[1]],
      [Az - L.idlerR, Ay + 0.02],
      [Az - 0.02, Ay - L.idlerR],
    ];
    const wrap = arcPoints(dz, dy, rf, a0, a1, 40);
    const post = [[Bz + 0.02, By - L.idlerR], [Bz + L.idlerR, By + 0.02], [L.rewind[0] + rR, L.rewind[1]]];
    const pts = [...pre, ...wrap, ...post];
    const total = this.mFilm.setPath(pts, { flow: fed });

    // arc positions of the oil mask and of the vapour window on the drum
    const toDrum = pathLength([...pre, wrap[0]]);
    const zoneA = Math.PI * 2 - Math.acos(this.zoneZ[0] / rf);
    const zoneB = Math.PI * 2 - Math.acos(this.zoneZ[1] / rf);
    const coatS = toDrum + rf * (zoneA - a0);
    const u = this.mFilmMat.userData.u;
    u.uOilS.value = pathLength(pre);
    u.uCoatS.value = coatS;
    u.uCoatLen.value = coatLen;
    u.uZone.value = rf * (zoneB - zoneA);
    u.uGlow.value = vapour * (0.9 + 0.2 * Math.sin(tSec * 23));
    // the take-up roll turns silver once coated film reaches it
    this.mRewindMat.userData.u.uMetal.value = ease(clamp((coatLen - (total - coatS)) / 1.6, 0, 1));

    // sources
    const flick = 0.85 + 0.15 * Math.sin(tSec * 31) * Math.sin(tSec * 7.3);
    this.boatMat.emissiveIntensity = heat * 2.6 * (0.92 + 0.08 * flick);
    this.boatMat.emissive.setRGB(1, lerp(0.35, 0.78, heat), lerp(0.1, 0.5, heat));
    [this.vapAl, this.vapZn].forEach((v, i) => {
      v.uniforms.uTime.value = tSec + i * 3.1;
      v.uniforms.uIntensity.value = vapour * flick * 0.55;
    });
    this.plumes.forEach((pl) => { pl.visible = vapour > 0.01; });
    const sprayOn = p >= 0.21;
    this.alSpray.active = this.znSpray.active = sprayOn;
    this.alSpray.time = this.znSpray.time = tSec;
    this.alLight.intensity = (heat * 1.5 + vapour * 3) * flick;
    this.znLight.intensity = (heat * 1.5 + vapour * 2.6) * flick;
  }

  #updateSlitter(p, tSec) {
    const L = this.sL, N = this.sN;
    const run = seg(p, 0.12, 0.96);
    const fed = run * 0.84 * 7;
    const rM = lerp(0.95, 0.64, run);
    const rReel = lerp(0.22, 0.5, Math.sqrt(run));
    this.sMaster.userData.body.scale.set(1, rM, rM);
    this.sMaster.rotation.x = fed / rM;
    this.sRollers[0].rotation.x = -fed / L.idlerR;
    this.sRollers[1].rotation.x = -fed / L.cutR;
    this.reels.forEach((r, k) => {
      r.userData.body.scale.set(1, rReel, rReel);
      r.rotation.x = (k % 2 ? 1 : -1) * (fed / rReel);
    });

    // blades lower onto the cut roller, then spin with the web
    const drop = 0.35 * (1 - ease(seg(p, 0.04, 0.14)));
    this.blades.children.forEach((h) => {
      h.position.y = L.cut[1] + L.cutR + 0.16 + drop;
      h.userData.blade.rotation.x = -fed * 8;
    });

    const cutTop = [L.cut[0], L.cut[1] + L.cutR];
    const webPts = [[L.master[0], L.master[1] + rM], [L.idler[0], L.idler[1] + L.idlerR], cutTop];
    const webLen = this.sWeb.setPath(webPts, { flow: fed, flipU: true });
    this.ribbons.forEach((rb, k) => {
      const end = k % 2 ? [L.down[0], L.down[1] + rReel] : [L.up[0], L.up[1] - rReel];
      rb.setPath([cutTop, [cutTop[0] + 0.25, cutTop[1]], end], {
        x: this.sXs[k], flow: fed, sOffset: webLen, flipU: true, u0: k / N, u1: (k + 1) / N,
      });
    });

    // safety margins glow while the HUD explains them
    const hi = Math.sin(Math.PI * seg(p, 0.4, 0.82)) * (0.7 + 0.3 * Math.sin(tSec * 6));
    [this.sWebMat, this.sRibbonMat, this.sMasterMat, ...this.reelMats].forEach((mat) => {
      mat.userData.u.uMarginGlow.value = Math.max(0, hi) * 1.5;
    });

    this.slitDust.active = run > 0 && run < 1;
    this.slitDust.time = tSec;
  }
}
