/**
 * <CapacitorFactory> — interactive, scrubbable 3D walkthrough of how a
 * metallized-polypropylene (MPP) cylindrical power capacitor is made.
 *
 * Architecture
 *   • The whole scene is a pure function of one number, T ∈ [0, 7]
 *     (integer part = stage, fraction = progress). Scrubbing, pausing,
 *     jumping and looping are therefore always consistent.
 *   • Only the camera damping and the pressure-test sparks use wall time.
 *
 * Usage
 *   import { CapacitorFactory } from './js/factory/capacitor-factory.js';
 *   new CapacitorFactory(document.querySelector('#factory'), { stageDuration: 7 });
 */
import * as THREE from 'three';
import { OrbitControls, RoomEnvironment } from 'three/addons';
import { createMaterials } from '../three/materials.js';
import {
  DIM, STACK, buildCan, buildRimBead, buildLidAssembly, buildLabel, labelGeometry, buildElement,
} from '../three/capacitor-model.js';
import { Emitter } from './particles.js';
import { STAGES } from './stages.js';
import { FactoryUI } from './factory-ui.js';

const { clamp, lerp, smoothstep } = THREE.MathUtils;
const seg = (T, a, b) => clamp((T - a) / (b - a), 0, 1);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeIn = (x) => x * x * x;

const N_STAGES = STAGES.length;
const BASE_Y = -DIM.H / 2;                     // world y of the can base
const W_Y = STACK.elements[1] + BASE_Y;        // world y of the winding axis
const FLOOR_Y = BASE_Y - 0.04;
const FEED = 9;                                // film fed per T-unit (scene units)

/* ------------------------------------------------------------- film strip */

/** A ribbon of film following a polyline in the YZ plane (width along X). */
class FilmStrip extends THREE.Mesh {
  constructor(width, material, samples = 60) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(samples * 6), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(samples * 6), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(samples * 4), 2));
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
   * @param {object} o  x: centre, from/to: drawn fraction, flow: texture scroll, sOffset: arc offset
   */
  setPath(pts, { x = 0, from = 0, to = 1, flow = 0, sOffset = 0, flipU = false } = {}) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const total = cum[cum.length - 1] || 1e-6;
    const s0 = from * total, s1 = to * total;
    const pos = this.geometry.attributes.position.array;
    const nor = this.geometry.attributes.normal.array;
    const uv = this.geometry.attributes.uv.array;
    const hw = this.width / 2;
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
      uv[k * 4] = flipU ? 1 : 0; uv[k * 4 + 1] = v;
      uv[k * 4 + 2] = flipU ? 0 : 1; uv[k * 4 + 3] = v;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.uv.needsUpdate = true;
    return total;
  }
}

const pathLength = (pts) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
};

/** Chamfer the corners of a polyline so a centripetal Catmull-Rom rounds them. */
function roundedCurve(points, r = 0.07) {
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const dIn = p.clone().sub(points[i - 1]);
    const dOut = points[i + 1].clone().sub(p);
    const ri = Math.min(r, dIn.length() * 0.45, dOut.length() * 0.45);
    out.push(p.clone().sub(dIn.normalize().multiplyScalar(ri)));
    out.push(p.clone().add(dOut.normalize().multiplyScalar(ri)));
  }
  out.push(points[points.length - 1]);
  return new THREE.CatmullRomCurve3(out, false, 'centripetal');
}

/* ================================================================ factory */

export class CapacitorFactory {
  /**
   * @param {HTMLElement} container
   * @param {object} [opts]
   * @param {number} [opts.stageDuration=7]  seconds per stage at 1×
   * @param {boolean} [opts.autoplay=true]
   * @param {boolean} [opts.loop=true]
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.opts = { stageDuration: 7, autoplay: true, loop: true, ...opts };
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.T = opts.startAt ?? 0;
    this.playing = this.opts.autoplay && !this.reducedMotion;
    this.userPaused = !this.playing;
    this.visible = false;
    this.follow = true;
    this.xrayManual = false;
    this.xray = 0;
    this.pressure = 0;
    this.broken = false;
    this.breakStart = -10;
    this.holdTimer = 0;
    this.stageIndex = -1;

    this.ui = new FactoryUI(container, STAGES, this);
    if (!this.#initRenderer()) return;
    this.#buildScene();
    this.#precomputeSpin();
    this.#observe();
    this.update(this.T);
    this.#snapCamera();
    this.renderer.render(this.scene, this.camera);
    this.ui.ready();
  }

  /* ------------------------------------------------------------ setup */

  #initRenderer() {
    const canvas = this.ui.canvas;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      this.ui.fail();
      return false;
    }
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.localClippingEnabled = true;

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.75;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.controls = new OrbitControls(this.camera, canvas);
    const c = this.controls;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.enablePan = false;
    c.enableZoom = false; // page scroll wins; zoom via toolbar or fullscreen
    c.minDistance = 3;
    c.maxDistance = 20;
    c.maxPolarAngle = Math.PI * 0.62;
    c.touches.ONE = THREE.TOUCH.ROTATE;
    c.addEventListener('start', () => { this.follow = false; this.ui.setFollow(false); });

    this.lastTime = performance.now();
    this.#resize();
    new ResizeObserver(() => this.#resize()).observe(this.ui.canvas);
    return true;
  }

  #resize() {
    const { clientWidth: w, clientHeight: h } = this.ui.canvas;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the subject framed on tall / narrow viewports
    this.camera.fov = w / h < 1 ? 48 : 38;
    this.camera.updateProjectionMatrix();
    this.narrow = w / h < 1;
  }

  #observe() {
    const io = new IntersectionObserver(
      ([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible) this.#loop();
      },
      { threshold: 0.05 },
    );
    io.observe(this.container);
  }

  /* ------------------------------------------------------------ scene */

  #buildScene() {
    const m = (this.m = createMaterials(this.renderer));
    const scene = this.scene;

    // cut-away section (x > c && z > c is removed)
    this.cutPlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
    for (const mat of [m.aluminium, m.xray]) {
      mat.clippingPlanes = this.cutPlanes;
      mat.clipIntersection = true;
    }

    /* lights */
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x0f263a, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(5, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x3d9bff, 2.2);
    rim.position.set(-6, 4, -6);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffe7a8, 0.5);
    fill.position.set(-4, -1, 6);
    scene.add(fill);

    /* floor */
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), m.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), m.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = FLOOR_Y + 0.002;
    shadow.receiveShadow = true;
    scene.add(floor, shadow);

    this.#buildWinder();
    this.#buildGuns();
    this.#buildProduct();
  }

  #buildWinder() {
    const m = this.m;
    const w = (this.winder = new THREE.Group());
    w.name = 'winder';
    this.scene.add(w);

    const L = (this.layout = {
      rollA: [-3.9, 1.95], rollB: [-3.9, -1.4], rollR: 0.95,
      ga1: [-2.5, 1.0], ga2: [-1.2, 0.55], gb1: [-2.5, -0.55], gr: 0.12,
      Wu: 1.5, Wd: DIM.elemL, off: 0.035,
    });
    const axisX = (geo) => geo.rotateZ(Math.PI / 2);

    // cantilever side-frame
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 5.4, 5.4), m.navyPaint);
    plate.position.set(1.02, FLOOR_Y + 2.7, -2.75);
    plate.castShadow = plate.receiveShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 5.4), m.yellowPaint);
    stripe.position.set(1.02, FLOOR_Y + 5.36, -2.75);
    w.add(plate, stripe);

    const mkRoll = ([z, y]) => {
      const g = new THREE.Group();
      g.position.set(0, y, z);
      const body = new THREE.Mesh(axisX(new THREE.CylinderGeometry(1, 1, L.Wu, 64)), [m.filmRoll, m.elementFace, m.elementFace]);
      body.castShadow = true;
      const hub = new THREE.Mesh(axisX(new THREE.CylinderGeometry(0.26, 0.26, L.Wu + 0.1, 32)), m.yellowPaint);
      const shaft = new THREE.Mesh(axisX(new THREE.CylinderGeometry(0.07, 0.07, 2.0, 16)), m.steel);
      shaft.position.x = 0.05;
      g.add(body, hub, shaft);
      g.userData.body = body;
      w.add(g);
      return g;
    };
    this.rollA = mkRoll(L.rollA);
    this.rollB = mkRoll(L.rollB);

    const rollerGeo = axisX(new THREE.CylinderGeometry(L.gr, L.gr, 1.75, 32));
    this.rollers = [L.ga1, L.ga2, L.gb1].map(([z, y]) => {
      const r = new THREE.Mesh(rollerGeo, m.steel);
      r.position.set(0.08, y, z);
      r.castShadow = true;
      w.add(r);
      return r;
    });

    // slitting knives
    const kA = [lerp(L.ga1[0], L.ga2[0], 0.5), lerp(L.ga1[1] + L.gr, L.ga2[1] + L.gr, 0.5)];
    const kB = [lerp(L.gb1[0], L.ga2[0], 0.4), lerp(L.gb1[1] + L.gr, L.ga2[1] + L.gr, 0.4)];
    this.knifePts = [kA, kB];
    const bladeGeo = axisX(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 48));
    const hubGeo = axisX(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16));
    this.knives = [];
    [kA, kB].forEach(([z, y], i) => {
      [-1, 1].forEach((side) => {
        const g = new THREE.Group();
        const edgeX = side < 0 ? -L.Wd / 2 + (i ? -L.off : L.off) : L.Wd / 2 + (i ? -L.off : L.off);
        g.position.set(edgeX, y, z);
        const blade = new THREE.Mesh(bladeGeo, m.steel);
        const hub = new THREE.Mesh(hubGeo, m.darkSteel);
        g.add(blade, hub);
        w.add(g);
        this.knives.push(g);
      });
    });

    // film webs (upstream = full width, downstream = slit width)
    this.filmAUp = new FilmStrip(L.Wu, m.film);
    this.filmADown = new FilmStrip(L.Wd, m.film);
    this.filmBUp = new FilmStrip(L.Wu, m.film);
    this.filmBDown = new FilmStrip(L.Wd, m.film);
    // edge trims peeled away by the knives
    const trimW = (L.Wu - L.Wd) / 2;
    this.trims = [0, 1, 2, 3].map(() => new FilmStrip(trimW - 0.01, m.film, 16));
    w.add(this.filmAUp, this.filmADown, this.filmBUp, this.filmBDown, ...this.trims);
    const trimBobbinGeo = axisX(new THREE.CylinderGeometry(0.13, 0.13, 0.14, 24));
    this.trimEnds = [
      [kA[0] + 0.25, kA[1] + 1.1], [kA[0] + 0.25, kA[1] + 1.1],
      [kB[0] + 0.2, kB[1] - 1.2], [kB[0] + 0.2, kB[1] - 1.2],
    ];
    this.trimXs = [
      -L.Wu / 2 + trimW / 2, L.Wu / 2 - trimW / 2, -L.Wu / 2 + trimW / 2, L.Wu / 2 - trimW / 2,
    ];
    this.trimEnds.forEach(([z, y], i) => {
      const b = new THREE.Mesh(trimBobbinGeo, m.yellowPaint);
      b.position.set(this.trimXs[i], y, z);
      w.add(b);
    });

    // mandrel + spindle housing (drive side, +x; camera sits on the -x side)
    this.mandrel = new THREE.Group();
    const shaft = new THREE.Mesh(axisX(new THREE.CylinderGeometry(DIM.mandrelR, DIM.mandrelR, 2.2, 24)), m.steel);
    shaft.position.x = 0.1;
    this.mandrel.add(shaft);
    this.mandrel.position.y = W_Y;
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 1.0), m.navyPaint);
    housing.position.set(1.45, W_Y, 0);
    housing.castShadow = true;
    const chuck = new THREE.Mesh(axisX(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 32)), m.steel);
    chuck.position.set(1.07, W_Y, 0);
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.4, W_Y - FLOOR_Y - 0.5, 0.6), m.darkSteel);
    pedestal.position.set(1.45, (W_Y - 0.5 + FLOOR_Y) / 2, 0);
    w.add(this.mandrel, housing, chuck, pedestal);
  }

  #buildGuns() {
    const m = this.m;
    this.guns = [1, -1].map((side) => {
      const g = new THREE.Group();
      g.position.set(side * 2.6, W_Y, 0);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.9, 32), m.darkSteel);
      body.rotation.z = Math.PI / 2;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.08, 32), m.yellowPaint);
      band.rotation.z = Math.PI / 2;
      band.position.x = side * 0.1;
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, 0.32, 24), m.brass);
      nozzle.rotation.z = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      nozzle.position.x = -side * 0.6;
      const wireFeed = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 12, 32), m.copper);
      wireFeed.position.set(side * 0.15, 0.35, 0);
      const light = new THREE.PointLight(0xff8a2a, 0, 3.5, 2);
      light.position.x = -side * 1.4;
      const spray = new Emitter({
        count: 1400, life: 0.36, speed: [3.4, 5.2], cone: 0.52, spawnRadius: 0.04, seed: side > 0 ? 3 : 7,
        hot: 0xfff4c8, cool: 0xff6a10, size: 0.11, stop: 2.6 - 0.76 - DIM.elemL / 2,
      });
      spray.rotation.z = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      spray.position.x = -side * 0.76;
      g.add(body, band, nozzle, wireFeed, light, spray);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.userData = { side, light, spray };
      this.scene.add(g);
      return g;
    });
  }

  #buildProduct() {
    const m = this.m;
    const p = (this.product = new THREE.Group());
    p.position.y = BASE_Y;
    this.scene.add(p);

    /* stack */
    this.elements = [0, 1, 2].map((i) => {
      const e = buildElement(m, { layers: i === 1 });
      e.position.y = STACK.elements[i];
      p.add(e);
      return e;
    });
    this.wound = this.elements[1];
    this.insulators = STACK.insulators.map((y) => {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.87, 0.87, 0.05, 64), m.pressboard);
      d.position.y = y;
      d.castShadow = true;
      p.add(d);
      return d;
    });

    /* wiring (delta) */
    const [x1, x2, x3] = DIM.termX;
    const E = STACK.elements, hl = DIM.elemL / 2;
    const deg = Math.PI / 180;
    this.wireDefs = [
      { y: E[2] + hl, top: true, phi: 150 * deg, lug: x1 },
      { y: E[2] - hl, top: false, phi: 40 * deg, lug: x2 },
      { y: E[1] + hl, top: true, phi: 65 * deg, lug: x2 },
      { y: E[1] - hl, top: false, phi: 300 * deg, lug: x3 },
      { y: E[0] + hl, top: true, phi: 325 * deg, lug: x3 },
      { y: E[0] - hl, top: false, phi: 205 * deg, lug: x1 },
    ];
    // elements[] is bottom→top; the wire list is ordered top→bottom for the weld sequence
    const junctionY = STACK.lugY - 0.04;
    this.wireMat = m.copper.clone();
    this.weldPts = [];
    this.wires = this.wireDefs.map((d) => {
      const c = Math.cos(d.phi), s = Math.sin(d.phi);
      const ya = d.y + (d.top ? -0.04 : 0.04);
      const A = new THREE.Vector3(0.875 * c, ya, 0.875 * s);
      const pts = [
        A,
        new THREE.Vector3(0.915 * c, ya, 0.915 * s),
        new THREE.Vector3(0.915 * c, 4.53, 0.915 * s),
        new THREE.Vector3(d.lug, junctionY, 0.02),
      ];
      this.weldPts.push(A);
      const geo = new THREE.TubeGeometry(roundedCurve(pts, 0.09), 140, 0.02, 8, false);
      const mesh = new THREE.Mesh(geo, this.wireMat);
      mesh.castShadow = true;
      mesh.userData.total = geo.index.count;
      p.add(mesh);
      return mesh;
    });

    // lugs + discharge resistors (move with the lid in the pressure test)
    this.lugs = new THREE.Group();
    p.add(this.lugs);
    DIM.termX.forEach((x) => {
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.025), m.copper);
      lug.position.set(x, STACK.lugY + 0.07, 0);
      this.lugs.add(lug);
    });
    this.resistors = new THREE.Group();
    const resGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.13, 16);
    resGeo.rotateZ(Math.PI / 2);
    const leadMat = m.nickel;
    const addRes = (xa, xb, z) => {
      const body = new THREE.Mesh(resGeo, m.resistorBody);
      body.position.set((xa + xb) / 2, STACK.lugY + 0.03, z);
      const lead = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([
            new THREE.Vector3(xa, STACK.lugY + 0.06, 0),
            new THREE.Vector3(xa, STACK.lugY + 0.03, z * 0.8),
            new THREE.Vector3(xb, STACK.lugY + 0.03, z * 0.8),
            new THREE.Vector3(xb, STACK.lugY + 0.06, 0),
          ]),
          32, 0.006, 6, false,
        ),
        leadMat,
      );
      this.resistors.add(body, lead);
    };
    addRes(x1, x2, 0.15);
    addRes(x2, x3, 0.15);
    addRes(x1, x3, -0.17);
    this.lugs.add(this.resistors);

    // fusible links: bridge wire junction → lug; they tear in the pressure test
    this.links = DIM.termX.map((x) => {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 8), m.copper);
      l.position.set(x, junctionY, 0.02);
      p.add(l);
      return l;
    });
    this.junctionY = junctionY;

    /* can, bead, lid, label */
    this.can = buildCan(m);
    this.canSolid = this.can.getObjectByName('canSolid');
    this.canXray = this.can.getObjectByName('canXray');
    this.bead = buildRimBead(m);
    this.lid = buildLidAssembly(m);
    this.label = buildLabel(m);
    const bellows = new THREE.CylinderGeometry(DIM.R - 0.015, DIM.R - 0.015, 1, 96, 1, true);
    bellows.translate(0, 0.5, 0);
    this.bellows = new THREE.Mesh(bellows, m.aluminiumLid);
    this.bellows.position.y = DIM.H - 0.02;
    this.bellowsX = new THREE.Mesh(bellows, m.xray);
    this.bellowsX.position.y = DIM.H - 0.02;
    this.highlight = new THREE.Mesh(new THREE.TorusGeometry(DIM.R + 0.03, 0.014, 8, 128).rotateX(Math.PI / 2), m.highlight);
    this.highlight.position.y = DIM.H - 0.14;
    p.add(this.can, this.bead, this.lid, this.label, this.bellows, this.bellowsX, this.highlight);

    /* casing & potting rig */
    this.plateVac = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.8, 0.1, 64), m.darkSteel);
    this.plateVac.position.y = -0.03;
    this.plateVac.receiveShadow = true;
    const jar = (this.jar = new THREE.Group());
    const jarWall = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 6.2, 64, 1, true), m.glass);
    jarWall.position.y = 3.1;
    const jarDome = new THREE.Mesh(new THREE.SphereGeometry(1.55, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), m.glass);
    jarDome.position.y = 6.2;
    const jarRing = new THREE.Mesh(new THREE.TorusGeometry(1.56, 0.04, 8, 96).rotateX(Math.PI / 2), m.bluePaint);
    jarRing.position.y = 0.04;
    jar.add(jarWall, jarDome, jarRing);
    const resinGeo = new THREE.CylinderGeometry(DIM.R - DIM.wall - 0.005, DIM.R - DIM.wall - 0.005, 1, 64);
    resinGeo.translate(0, 0.5, 0);
    this.resin = new THREE.Mesh(resinGeo, m.resin);
    this.resin.position.y = 0.04;
    this.resin.renderOrder = 5;
    const noz = (this.nozzle = new THREE.Group());
    const nozBody = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 20), m.darkSteel);
    nozBody.position.y = 0.45;
    const nozTip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.035, 0.18, 20), m.brass);
    nozTip.position.y = -0.09;
    noz.add(nozBody, nozTip);
    this.nozzleXZ = [0.93 * Math.cos(Math.PI / 4), 0.93 * Math.sin(Math.PI / 4)];
    noz.position.set(this.nozzleXZ[0], 7, this.nozzleXZ[1]);
    const streamMat = m.resin.clone();
    streamMat.opacity = 0.9;
    streamMat.clippingPlanes = null;
    const streamGeo = new THREE.CylinderGeometry(0.022, 0.03, 1, 12);
    streamGeo.translate(0, -0.5, 0);
    this.stream = new THREE.Mesh(streamGeo, streamMat);
    p.add(this.plateVac, jar, this.resin, noz, this.stream);

    /* crimping rig */
    this.crimp = new THREE.Group();
    this.crimp.position.y = DIM.H - 0.01;
    this.crimpWheels = [0, 1].map(() => {
      const g = new THREE.Group();
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.11, 32), m.steel);
      const groove = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 32).rotateX(Math.PI / 2), m.darkSteel);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.07), m.darkSteel);
      arm.position.y = 0.5;
      const armCap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.14), m.yellowPaint);
      armCap.position.y = 0.95;
      g.add(wheel, groove, arm, armCap);
      g.userData.wheel = wheel;
      this.crimp.add(g);
      return g;
    });
    p.add(this.crimp);

    /* emitters */
    this.weld = new Emitter({
      count: 380, life: 0.45, speed: [0.8, 2.6], cone: 1.25, gravity: 7, seed: 11, hot: 0xffffff, cool: 0x7fc4ff, size: 0.1,
    });
    this.weldLight = new THREE.PointLight(0x9fd2ff, 0, 3, 2);
    this.sparks = new Emitter({
      count: 520, life: 1.1, speed: [0.8, 3.0], cone: 1.4, gravity: 5, seed: 5, mode: 'burst', stagger: 0.3,
      spawnPoints: DIM.termX.map((x) => new THREE.Vector3(x, this.junctionY + 0.02, 0.02)), hot: 0xffffff, cool: 0xffb000, size: 0.11,
    });
    this.bubbles = new Emitter({
      count: 260, life: 2.4, speed: [0.35, 0.9], cone: 0.12, spawnRadius: 0.9, spawnHeight: 0.1, seed: 13,
      hot: 0xffffff, cool: 0xcde9ff, size: 0.07, blending: THREE.NormalBlending, opacity: 0.6,
    });
    this.bubbles.position.y = 0.1;
    p.add(this.weld, this.weldLight, this.sparks, this.bubbles);
  }

  /** Integrate spindle angle so surface speed = film speed as the radius grows. */
  #precomputeSpin() {
    const n = 1500, dT = 3 / n;
    this.spinTable = new Float32Array(n + 1);
    let a = 0;
    for (let i = 0; i <= n; i++) {
      this.spinTable[i] = a;
      const T = i * dT;
      const feeding = T < 1.9 ? 1 : 0;
      a += (feeding ? FEED / this.#elementR(T) : 1.6) * dT;
    }
  }

  #spinAngle(T) {
    const n = this.spinTable.length - 1;
    if (T >= 3) return this.spinTable[n] + (T - 3) * 1.6;
    const f = (T / 3) * n, i = Math.floor(f);
    return lerp(this.spinTable[i], this.spinTable[Math.min(n, i + 1)], f - i);
  }

  #elementR(T) {
    return lerp(0.12, DIM.elemR, ease(seg(T, 1.02, 1.85)));
  }

  /* ------------------------------------------------------------ update */

  /** Set the whole scene to timeline position T (0…7). */
  update(T) {
    const m = this.m;
    const L = this.layout;
    const tSec = T * this.opts.stageDuration;
    const P = this.pressure;

    /* ---------- stage 1-2 : feed, slit, wind ---------- */
    const r = T < 3 ? this.#elementR(T) : DIM.elemR;
    const fed = Math.min(T, 1.9) * FEED;
    const windP = seg(T, 1.02, 1.85);
    const rollR = lerp(L.rollR, 0.74, windP);

    const winderOut = easeIn(seg(T, 2.0, 2.14));
    this.winder.visible = T < 2.16;
    this.winder.position.set(0, -winderOut * 1.2, -winderOut * 9);
    this.mandrel.position.x = 1.9 * ease(seg(T, 1.97, 2.05));

    if (this.winder.visible) {
      this.rollA.userData.body.scale.set(1, rollR, rollR);
      this.rollB.userData.body.scale.set(1, rollR, rollR);
      this.rollA.rotation.x = -fed / rollR;
      this.rollB.rotation.x = fed / rollR;
      this.rollers.forEach((ro) => { ro.rotation.x = fed / L.gr; });
      this.knives.forEach((k, i) => { k.rotation.x = tSec * 6 + i; });

      const topY = W_Y + r + 0.004;
      const [kA, kB] = this.knifePts;
      const aUp = [[L.rollA[0], L.rollA[1] - rollR], [L.ga1[0], L.ga1[1] + L.gr], kA];
      const aDown = [kA, [L.ga2[0], L.ga2[1] + L.gr + 0.012], [0, topY + 0.008]];
      const bUp = [[L.rollB[0], L.rollB[1] + rollR], [L.gb1[0] + 0.08, L.gb1[1] + L.gr - 0.02], kB];
      const bDown = [kB, [L.ga2[0], L.ga2[1] + L.gr], [0, topY]];
      const cut = easeIn(seg(T, 1.86, 1.94));
      const upA = this.filmAUp.setPath(aUp, { flow: fed });
      this.filmADown.setPath(aDown, { x: L.off, flow: fed, sOffset: upA, from: cut });
      const upB = this.filmBUp.setPath(bUp, { flow: fed, flipU: true });
      this.filmBDown.setPath(bDown, { x: -L.off, flow: fed, sOffset: upB, from: cut, flipU: true });
      this.filmADown.visible = this.filmBDown.visible = cut < 0.999;
      this.trims.forEach((tr, i) => {
        const k = i < 2 ? kA : kB;
        tr.setPath([k, this.trimEnds[i]], { x: this.trimXs[i], flow: fed });
      });
    }

    /* ---------- the wound element (middle of the stack) ---------- */
    const e = this.wound.userData.api;
    const upright = ease(seg(T, 3.0, 3.2));
    this.wound.rotation.z = (Math.PI / 2) * (1 - upright);
    e.setRadius(r);
    e.spin.rotation.y = -this.#spinAngle(T);
    e.setTape(ease(seg(T, 1.88, 1.98)));
    const sprayOn = T >= 2.18 && T < 2.86;
    const coverage = ease(seg(T, 2.18, 2.85));
    const glow = sprayOn ? 0.75 + 0.25 * Math.sin(tSec * 40) : Math.max(0, 1 - (T - 2.86) / 0.12) * (T > 2.86 ? 1 : 0);
    e.setZinc(coverage, glow);

    /* ---------- stage 3 : schooping guns ---------- */
    const gunIn = easeOut(seg(T, 2.04, 2.16)) * (1 - easeIn(seg(T, 2.9, 3.0)));
    this.guns.forEach((g) => {
      const { side, light, spray } = g.userData;
      g.visible = gunIn > 0.001;
      g.position.x = side * lerp(6.5, 2.6, gunIn);
      spray.active = sprayOn;
      spray.time = tSec;
      light.intensity = sprayOn ? 6 + Math.sin(tSec * 37 + side) * 2 : 0;
    });

    /* ---------- stage 4 : stack, leads, weld ---------- */
    const sib = ease(seg(T, 3.15, 3.35));
    [this.elements[0], this.elements[2]].forEach((el, i) => {
      el.visible = sib > 0.001;
      const side = i === 0 ? -1 : 1;
      el.position.x = side * lerp(5.5, 0, sib);
      el.userData.api.spin.rotation.y = side * (1 - sib) * 3;
    });
    const ins = ease(seg(T, 3.28, 3.4));
    this.insulators.forEach((d) => {
      d.visible = ins > 0.001;
      d.scale.set(ins, 1, ins);
    });
    const lugIn = easeOut(seg(T, 3.34, 3.42));
    this.lugs.visible = lugIn > 0.001;
    this.lugs.scale.setScalar(Math.max(0.001, lugIn));
    const resIn = easeOut(seg(T, 3.88, 3.98));
    this.resistors.visible = resIn > 0.001;
    this.resistors.children.forEach((c) => { c.scale.setScalar(Math.max(0.001, resIn)); });

    let weldActive = false;
    this.wires.forEach((w, k) => {
      const a = 3.42 + k * 0.075;
      const g = seg(T, a + 0.012, a + 0.07);
      w.visible = g > 0;
      w.geometry.setDrawRange(0, Math.floor((w.userData.total * g) / 6) * 6);
      if (T >= a && T < a + 0.06) {
        weldActive = true;
        this.weld.position.copy(this.weldPts[k]);
        this.weldLight.position.copy(this.weldPts[k]);
      }
    });
    this.weld.active = weldActive;
    this.weld.time = tSec;
    this.weldLight.intensity = weldActive ? 4 + 3 * Math.abs(Math.sin(tSec * 53)) : 0;

    /* ---------- stage 5 : casing, vacuum, resin ---------- */
    const canIn = ease(seg(T, 4.0, 4.28));
    this.can.visible = T >= 4.0;
    const cutClose = ease(seg(T, 5.2, 5.3));
    const cutC = T < 4 ? 50 : lerp(0, 1.25, cutClose);
    this.cutPlanes.forEach((pl) => { pl.constant = cutC; });

    this.plateVac.visible = T > 4.0 && T < 5.05;
    this.plateVac.scale.setScalar(Math.max(0.001, easeOut(seg(T, 4.0, 4.1)) * (1 - seg(T, 4.98, 5.05))));
    const jarDown = ease(seg(T, 4.28, 4.4)) * (1 - ease(seg(T, 4.88, 5.0)));
    this.jar.visible = jarDown > 0.001;
    this.jar.position.y = lerp(9, -0.08, jarDown);

    const level = ease(seg(T, 4.46, 4.86));
    this.resin.visible = level > 0.001 && T < 6.0;
    this.resin.scale.y = Math.max(0.001, level * 4.56);
    const nozDown = ease(seg(T, 4.4, 4.46)) * (1 - ease(seg(T, 4.86, 4.93)));
    this.nozzle.visible = nozDown > 0.001;
    this.nozzle.position.y = lerp(8.5, 5.45, nozDown);
    const pouring = T >= 4.46 && T < 4.86;
    this.stream.visible = pouring;
    const surf = 0.04 + level * 4.56;
    this.stream.position.set(this.nozzleXZ[0], 5.27, this.nozzleXZ[1]);
    this.stream.scale.y = Math.max(0.01, 5.27 - surf);
    this.bubbles.active = T >= 4.47 && T < 4.97 && level > 0.05;
    this.bubbles.time = tSec;
    this.bubbles.material.uniforms.uStop.value = Math.max(0.05, level * 4.4);

    /* ---------- stage 6 : lid, crimp, disconnector, label ---------- */
    const lidDown = ease(seg(T, 5.0, 5.2));
    this.lid.visible = T >= 5.0;
    const beadP = ease(seg(T, 5.3, 5.58));
    this.bead.visible = beadP > 0.01;
    this.bead.scale.set(1, Math.max(0.02, beadP), 1);
    const crimpVis = easeOut(seg(T, 5.22, 5.28)) * (1 - easeIn(seg(T, 5.58, 5.64)));
    this.crimp.visible = crimpVis > 0.001;
    const orbit = ease(seg(T, 5.28, 5.58)) * Math.PI * 2;
    this.crimpWheels.forEach((g, i) => {
      const a = orbit + i * Math.PI;
      const rr = DIM.R + 0.17 + (1 - crimpVis) * 1.2;
      g.position.set(Math.cos(a) * rr, (1 - crimpVis) * 1.2, Math.sin(a) * rr);
      g.userData.wheel.rotation.y = -a * ((DIM.R + 0.17) / 0.16);
    });
    const hiP = seg(T, 5.58, 5.76);
    let highlight = hiP > 0 && hiP < 1 ? Math.sin(Math.PI * hiP) * (0.6 + 0.4 * Math.sin(tSec * 14)) : 0;
    const labelP = ease(seg(T, 5.7, 5.86));
    this.label.visible = labelP > 0.001;
    if (this.label.visible) this.label.geometry = labelGeometry(labelP);

    /* ---------- stage 7 : explode, x-ray, pressure test ---------- */
    const collapse = smoothstep(P, 0, 0.12);
    const ex = ease(seg(T, 6.05, 6.45)) * (1 - collapse);
    const lay = ease(seg(T, 6.25, 6.55)) * (1 - collapse);
    const bulge = smoothstep(P, 0.12, 0.7);
    const brk = smoothstep(P, 0.72, 0.8);
    const lift = 0.05 * bulge + 0.55 * brk;
    highlight = Math.max(highlight, bulge * (0.5 + 0.5 * Math.sin(tSec * 10)) * (T >= 6 ? 1 : 0));
    m.highlight.opacity = highlight;
    this.highlight.visible = highlight > 0.01;

    this.product.rotation.y = T > 6.45 ? (T - 6.45) * 1.1 * (1 - collapse) : 0;

    const canOffset = -1.0 * ex;
    this.can.position.y = lerp(-7.6, 0, canIn) + canOffset;
    this.bead.position.y = DIM.H - 0.004 + canOffset;
    this.label.position.y = DIM.labelY + canOffset;
    this.lid.position.y = lerp(DIM.H + 3.2, DIM.H - 0.03, lidDown) + 1.45 * ex + lift;
    const lidParts = this.lid.userData;
    lidParts.lid.scale.y = lidParts.lidX.scale.y = 1 + 4.5 * bulge;
    this.bellows.visible = this.bellowsX.visible = lift > 0.004;
    this.bellows.scale.y = this.bellowsX.scale.y = Math.max(0.001, lift);
    this.lugs.position.y = 1.0 * ex + lift;
    this.elements[2].position.y = STACK.elements[2] + 0.75 * ex;
    this.elements[0].position.y = STACK.elements[0] - 0.55 * ex;
    [-0.8, -0.25, 0.45, 0.98].forEach((o, i) => { this.insulators[i].position.y = STACK.insulators[i] + o * ex; });
    // only the element we watched being wound opens up into its layers
    this.wound.userData.api.setLayers(lay);
    this.m.pressboard.opacity = 1 - 0.45 * this.xray;

    this.wireMat.opacity = 1 - ex;
    const linkOn = T >= 3.42 && ex < 0.02 && brk < 0.01;
    this.links.forEach((l) => {
      l.visible = linkOn;
      const len = 0.03 + lift;
      l.scale.y = len;
      l.position.y = this.junctionY + len / 2;
    });

    // tear-off sparks (wall-clock burst when the threshold is crossed)
    const nowS = performance.now() / 1000;
    if (T >= 6 && P >= 0.72 && !this.broken) { this.broken = true; this.breakStart = nowS; }
    if (P < 0.7) this.broken = false;
    const since = nowS - this.breakStart;
    this.sparks.active = this.broken && since < 1.6;
    this.sparks.time = since;

    /* x-ray blend */
    const xrayTarget = Math.max(this.xrayManual ? 1 : 0, ease(seg(T, 6.0, 6.15)));
    this.xrayGoal = xrayTarget;
    this.#applyXray(this.xray);

    this.T = T;
    this.#syncStage(T);
  }

  #applyXray(x) {
    const m = this.m;
    m.aluminium.opacity = 1 - x;
    m.aluminium.depthWrite = x < 0.4;
    this.canSolid.visible = x < 0.995;
    this.canXray.visible = x > 0.005;
    m.xray.uniforms.uIntensity.value = x;
    m.aluminiumLid.opacity = 1 - x * 0.9;
    this.lid.userData.lidX.visible = x > 0.005;
    m.label.opacity = 1 - x;
    m.blackPlastic.opacity = 1 - x * 0.55;
    m.darkRecess.opacity = 1 - x * 0.55;
  }

  #syncStage(T) {
    const s = Math.min(N_STAGES - 1, Math.floor(T));
    if (s !== this.stageIndex) {
      const prev = this.stageIndex;
      this.stageIndex = s;
      if (s !== N_STAGES - 1 && this.pressure > 0) this.setPressure(0);
      this.ui.setStage(s, prev);
    }
  }

  /* ------------------------------------------------------------ camera */

  #cameraGoal(T) {
    const s = Math.min(N_STAGES - 1, Math.floor(T));
    const p = T - s;
    const a = STAGES[s].camera;
    const b = STAGES[Math.min(N_STAGES - 1, s + 1)].camera;
    const k = ease(seg(p, 0.9, 1.0));
    const pos = new THREE.Vector3().fromArray(a.pos).lerp(new THREE.Vector3().fromArray(b.pos), k);
    const tgt = new THREE.Vector3().fromArray(a.target).lerp(new THREE.Vector3().fromArray(b.target), k);
    const pc = STAGES[s].pressureCamera;
    if (pc && this.pressure > 0) {
      const k2 = smoothstep(this.pressure, 0, 0.12);
      pos.lerp(new THREE.Vector3().fromArray(pc.pos), k2);
      tgt.lerp(new THREE.Vector3().fromArray(pc.target), k2);
    }
    if (this.narrow) {
      // back off on portrait screens so the subject fits
      pos.sub(tgt).multiplyScalar(1.08).add(tgt);
    }
    return { pos, tgt };
  }

  #snapCamera() {
    const { pos, tgt } = this.#cameraGoal(this.T);
    this.camera.position.copy(pos);
    this.controls.target.copy(tgt);
    this.controls.update();
  }

  /* ------------------------------------------------------------ loop */

  #loop() {
    if (this.raf) return;
    const step = () => {
      this.raf = null;
      if (!this.visible && !document.fullscreenElement) return;
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      this.#tick(dt);
      this.raf = requestAnimationFrame(step);
    };
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(step);
  }

  #tick(dt) {
    let T = this.T;
    if (this.playing && !this.ui.dragging) {
      if (T < N_STAGES) {
        T = Math.min(N_STAGES, T + dt / this.opts.stageDuration);
        this.holdTimer = 0;
      } else if (this.opts.loop) {
        this.holdTimer += dt;
        if (this.holdTimer > 3.5) { T = 0; this.follow = true; this.ui.setFollow(true); }
      }
    }
    // smooth x-ray fade
    this.xray += (this.xrayGoal - this.xray) * (1 - Math.exp(-dt * 6));
    this.update(T);

    if (this.follow) {
      const { pos, tgt } = this.#cameraGoal(T);
      const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.4);
      this.camera.position.lerp(pos, k);
      this.controls.target.lerp(tgt, k);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.ui.frame(T, this);
  }

  /* ------------------------------------------------------------ public API */

  play() { this.playing = true; this.userPaused = false; if (this.T >= N_STAGES) this.seek(0); this.ui.setPlaying(true); }
  pause() { this.playing = false; this.userPaused = true; this.ui.setPlaying(false); }
  toggle() { this.playing ? this.pause() : this.play(); }

  seek(T, { follow = true } = {}) {
    this.T = clamp(T, 0, N_STAGES);
    this.holdTimer = 0;
    if (follow) { this.follow = true; this.ui.setFollow(true); }
    this.update(this.T);
  }

  goToStage(i) { this.seek(clamp(i, 0, N_STAGES - 1) + 0.001); }
  next() { this.goToStage(Math.min(N_STAGES - 1, Math.floor(this.T) + 1)); }
  prev() { this.goToStage(Math.max(0, Math.ceil(this.T) - 2)); }

  setXray(on) { this.xrayManual = on; }
  setPressure(p) {
    this.pressure = clamp(p, 0, 1);
    this.ui.setPressure(this.pressure);
  }
  resetView() { this.follow = true; this.ui.setFollow(true); }
  zoom(f) {
    this.follow = false;
    this.ui.setFollow(false);
    const t = this.controls.target;
    const d = this.camera.position.clone().sub(t);
    const len = clamp(d.length() * f, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(t).add(d.setLength(len));
  }
  setRotateEnabled(on) {
    this.controls.enableRotate = on;
    this.ui.canvas.style.touchAction = on ? 'none' : 'pan-y';
  }
  setZoomEnabled(on) { this.controls.enableZoom = on; }
}
