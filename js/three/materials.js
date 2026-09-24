/**
 * VIZ Technologies — shared procedural textures & materials.
 * Everything is generated at runtime on <canvas>, so the 3D scenes ship
 * with zero image downloads. All generators are seeded => deterministic.
 */
import * as THREE from 'three';

export const BRAND = {
  navy: '#0F263A',
  blue: '#1F77C4',
  blueBright: '#007AFF',
  yellow: '#FFD204',
  red: '#E23434',
};

/* ------------------------------------------------------------------ utils */

/** mulberry32 — tiny seeded PRNG */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, { srgb = true, repeat = false, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/* --------------------------------------------------------------- textures */

/**
 * Brushed / extruded aluminium. Streaks run along V (the can's height),
 * with soft low-frequency mottling like the reference photograph.
 */
export function brushedAluminiumCanvas(seed = 11) {
  const r = rng(seed);
  const [c, g] = makeCanvas(1024, 512);
  g.fillStyle = '#c9ced4';
  g.fillRect(0, 0, c.width, c.height);

  // low-frequency mottling
  for (let i = 0; i < 90; i++) {
    const x = r() * c.width, y = r() * c.height, rad = 40 + r() * 180;
    const v = r() > 0.5 ? 255 : 120;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(${v},${v},${v},${0.05 + r() * 0.07})`);
    grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fine extrusion streaks (vertical in UV space = along the height)
  for (let i = 0; i < 2600; i++) {
    const x = r() * c.width;
    const v = 150 + Math.floor(r() * 105);
    g.strokeStyle = `rgba(${v},${v},${v + 4},${0.03 + r() * 0.09})`;
    g.lineWidth = 0.5 + r() * 1.6;
    const y0 = r() * c.height * 0.4, y1 = c.height - r() * c.height * 0.4;
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x + (r() - 0.5) * 2, y1);
    g.stroke();
  }
  return c;
}

/**
 * Metallized polypropylene film, UV u = across the web, v = along it.
 * [clear margin | metallized electrode w/ segmentation pattern | heavy edge]
 */
export function filmCanvas({ seed = 3, segmented = true } = {}) {
  const r = rng(seed);
  const [c, g] = makeCanvas(256, 1024);
  const W = c.width, H = c.height;
  const margin = Math.round(W * 0.08), heavy = Math.round(W * 0.07);

  // clear polypropylene margin
  g.fillStyle = 'rgba(205,225,240,0.28)';
  g.fillRect(0, 0, margin, H);

  // metallized electrode — cool silver with faint interference tint
  const grd = g.createLinearGradient(margin, 0, W - heavy, 0);
  grd.addColorStop(0, '#dfe6ee');
  grd.addColorStop(0.35, '#c6d0dc');
  grd.addColorStop(0.55, '#d8dbe6');
  grd.addColorStop(0.8, '#bfc9d6');
  grd.addColorStop(1, '#d4dce6');
  g.fillStyle = grd;
  g.fillRect(margin, 0, W - margin - heavy, H);

  // segmentation (self-healing "mosaic") pattern
  if (segmented) {
    g.strokeStyle = 'rgba(70,90,115,0.35)';
    g.lineWidth = 1;
    const cell = 22;
    for (let y = 0; y < H; y += cell) {
      g.beginPath();
      g.moveTo(margin + 6, y);
      g.lineTo(W - heavy - 10, y);
      g.stroke();
    }
    for (let x = margin + 6; x < W - heavy - 10; x += cell * 1.6) {
      for (let y = 0; y < H; y += cell) {
        g.beginPath();
        g.moveTo(x, y + 3);
        g.lineTo(x, y + cell - 3);
        g.stroke();
      }
    }
  }
  // heavy edge (thicker metallization for the schooped contact)
  g.fillStyle = '#9ea9b6';
  g.fillRect(W - heavy, 0, heavy, H);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(W - heavy, 0, 2, H);

  // longitudinal sheen streaks
  for (let i = 0; i < 160; i++) {
    const x = margin + r() * (W - margin);
    g.fillStyle = `rgba(255,255,255,${r() * 0.07})`;
    g.fillRect(x, 0, 1 + r() * 2, H);
  }
  return c;
}

/** End face of a freshly wound element — hundreds of concentric layers. */
export function spiralFaceCanvas(seed = 5) {
  const r = rng(seed);
  const [c, g] = makeCanvas(512, 512);
  const cx = 256, cy = 256;
  g.fillStyle = '#6d7885';
  g.fillRect(0, 0, 512, 512);
  for (let rad = 255; rad > 18; rad -= 1.6) {
    const v = r() > 0.5 ? 200 + r() * 40 : 95 + r() * 40;
    g.strokeStyle = `rgb(${v},${v + 4},${v + 10})`;
    g.lineWidth = 1.1;
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.stroke();
  }
  // mandrel bore
  g.fillStyle = '#1b2733';
  g.beginPath();
  g.arc(cx, cy, 18, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Arc-sprayed zinc: granular, matte, slightly speckled. */
export function zincCanvas(seed = 9) {
  const r = rng(seed);
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = '#a3a9b0';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16000; i++) {
    const v = 110 + Math.floor(r() * 130);
    g.fillStyle = `rgba(${v},${v},${v + 3},${0.25 + r() * 0.5})`;
    const s = 0.6 + r() * 2.6;
    g.beginPath();
    g.arc(r() * 512, r() * 512, s, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/**
 * Smooth cloud noise used as an alphaMap: raising material.alphaTest
 * progressively "grows" sprayed coverage in blotches.
 */
export function coverageNoiseCanvas(seed = 21) {
  const r = rng(seed);
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = '#0b0b0b'; // never fully 0 => alphaTest 0.02 reveals 100%
  g.fillRect(0, 0, 256, 256);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 900; i++) {
    const x = r() * 256, y = r() * 256, rad = 6 + r() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.10)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.globalCompositeOperation = 'source-over';
  return c;
}

/** Resistor body with colour bands. */
export function resistorCanvas() {
  const [c, g] = makeCanvas(256, 64);
  g.fillStyle = '#2d6fb5';
  g.fillRect(0, 0, 256, 64);
  const bands = ['#7a4a1e', '#111', '#e0a100', '#d4af37'];
  bands.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(40 + i * 36 + (i === 3 ? 30 : 0), 0, 16, 64);
  });
  return c;
}

/** Floor disc: blueprint grid fading to transparent. */
export function floorCanvas() {
  const [c, g] = makeCanvas(1024, 1024);
  const cx = 512;
  g.clearRect(0, 0, 1024, 1024);
  g.strokeStyle = 'rgba(31,119,196,0.55)';
  g.lineWidth = 1;
  for (let i = 0; i <= 1024; i += 32) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke();
  }
  g.strokeStyle = 'rgba(255,210,4,0.5)';
  g.lineWidth = 2;
  [150, 260].forEach((rad) => { g.beginPath(); g.arc(cx, cx, rad, 0, Math.PI * 2); g.stroke(); });
  // radial fade mask
  g.globalCompositeOperation = 'destination-in';
  const grd = g.createRadialGradient(cx, cx, 60, cx, cx, 512);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.6, 'rgba(0,0,0,0.5)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 1024);
  g.globalCompositeOperation = 'source-over';
  return c;
}

/** Draws the placeholder VIZ lettermark into a 2D context. */
export function drawVizMark(g, x, y, h, color = BRAND.blue) {
  const s = h / 80;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.transform(1, 0, -0.22, 1, 18, 0); // italic shear
  g.fillStyle = color;
  // V
  g.beginPath();
  g.moveTo(0, 8); g.lineTo(20, 8); g.lineTo(36, 52); g.lineTo(52, 8); g.lineTo(72, 8);
  g.lineTo(46, 72); g.lineTo(26, 72); g.closePath(); g.fill();
  // I
  g.fillRect(80, 8, 18, 64);
  // Z with a lightning notch
  g.beginPath();
  g.moveTo(106, 8); g.lineTo(170, 8); g.lineTo(170, 22); g.lineTo(138, 52);
  g.lineTo(170, 52); g.lineTo(170, 72); g.lineTo(106, 72); g.lineTo(106, 58);
  g.lineTo(138, 28); g.lineTo(106, 28); g.closePath(); g.fill();
  g.restore();
}

/**
 * Product label recreated from the reference photograph
 * (VECOCA3AU0055B, 3 × 55.7 µF, IEC 61071).
 */
export function labelCanvas() {
  const [c, g] = makeCanvas(1100, 1100);
  const W = c.width, H = c.height;
  g.fillStyle = '#f4f5f2';
  g.fillRect(0, 0, W, H);
  // subtle paper grain
  const r = rng(77);
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.035})`;
    g.fillRect(r() * W, r() * H, 1.5, 1.5);
  }
  const ink = '#1d2126';
  g.fillStyle = ink;
  drawVizMark(g, 54, 70, 70, '#3b4450');

  const font = (w, px) => `${w} ${px}px Arial, Helvetica, sans-serif`;
  g.font = font(700, 70);
  g.fillText('VECOCA3AU0055B', 232, 128);
  g.font = font(700, 62);
  g.fillText('3*55.7 µF', 150, 218);
  g.font = font(400, 44);
  g.fillText('-5... +5%', 520, 214);

  const rows = [
    ['Uɴ', '1400V AC'],
    ['Uʀᴍs', '1000V AC'],
    ['Iᴍᴀx', '80A'],
    ['AC', '-50°C... +85°C'],
  ];
  rows.forEach(([k, v], i) => {
    const y = 300 + i * 70;
    g.font = font(400, 42);
    g.fillStyle = '#444b53';
    g.fillText(k, 130, y);
    g.font = font(400, 52);
    g.fillStyle = ink;
    g.fillText(v, 520, y);
  });
  g.font = font(400, 38);
  g.fillStyle = '#444b53';
  g.fillText('IEC 61071', 60, 610);
  g.font = font(700, 78);
  g.fillStyle = ink;
  g.fillText('CE', 70, 715);
  g.font = font(400, 30);
  g.fillText('10,000AFC', 50, 770);
  g.font = font(400, 48);
  g.fillText('Δ', 470, 650);
  g.fillText('E', 470, 730);
  g.font = font(400, 48);
  g.fillText('SH MPP', 690, 650);
  // capacitor symbol
  g.fillRect(720, 690, 110, 6);
  g.fillRect(720, 716, 110, 6);
  g.fillRect(760, 670, 6, 70);
  g.fillRect(784, 670, 6, 70);
  g.font = font(400, 34);
  g.fillText('B/N 2001907A', 640, 800);
  g.fillText('PART NUMBER : PC000060407', 50, 830);
  // barcode
  let bx = 90;
  const br = rng(1234);
  while (bx < 650) {
    const w = 2 + Math.floor(br() * 6);
    if (br() > 0.4) g.fillRect(bx, 860, w, 80);
    bx += w + 1;
  }
  g.fillText('REV: 0001', 760, 880);
  g.font = font(400, 30);
  g.fillText('Sl No:  FXXF05570001', 80, 975);
  g.font = font(700, 36);
  g.fillText('MADE IN INDIA', 50, 1030);
  g.font = font(400, 36);
  g.fillText('23.24', 820, 1050);
  return c;
}

/* -------------------------------------------------------------- materials */

/**
 * Creates the full, shared material library. Call once per renderer.
 * @param {THREE.WebGLRenderer} renderer
 */
export function createMaterials(renderer) {
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;

  const aluCanvas = brushedAluminiumCanvas();
  const aluMap = toTexture(aluCanvas, { repeat: true, anisotropy: maxAniso });
  const aluRough = toTexture(aluCanvas, { srgb: false, repeat: true, anisotropy: maxAniso });

  const filmTex = toTexture(filmCanvas(), { repeat: true, anisotropy: maxAniso });
  const zincTex = toTexture(zincCanvas(), { repeat: true });
  const zincBump = toTexture(zincCanvas(19), { srgb: false, repeat: true });
  const coverage = toTexture(coverageNoiseCanvas(), { srgb: false });
  const spiral = toTexture(spiralFaceCanvas());
  const label = toTexture(labelCanvas(), { anisotropy: maxAniso });
  const resistor = toTexture(resistorCanvas());
  const floor = toTexture(floorCanvas());

  const m = {
    textures: { aluMap, filmTex, zincTex, coverage, spiral, label, resistor, floor },

    aluminium: new THREE.MeshStandardMaterial({
      color: 0xeef1f4,
      map: aluMap,
      roughnessMap: aluRough,
      metalness: 0.88,
      roughness: 0.36,
      envMapIntensity: 1.6,
      side: THREE.DoubleSide,
      transparent: true, // kept true so opacity fades never trigger recompiles
    }),
    aluminiumLid: new THREE.MeshStandardMaterial({
      color: 0xeef1f4, metalness: 0.9, roughness: 0.3, map: aluMap, envMapIntensity: 1.5, side: THREE.DoubleSide, transparent: true,
    }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 1, roughness: 0.28 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x3a4552, metalness: 0.9, roughness: 0.4 }),
    navyPaint: new THREE.MeshStandardMaterial({ color: 0x0f263a, metalness: 0.3, roughness: 0.45 }),
    bluePaint: new THREE.MeshStandardMaterial({ color: 0x1f77c4, metalness: 0.25, roughness: 0.4 }),
    yellowPaint: new THREE.MeshStandardMaterial({ color: 0xffd204, metalness: 0.2, roughness: 0.45 }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.05, roughness: 0.55, transparent: true }),
    darkRecess: new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.9, transparent: true }),
    nickel: new THREE.MeshStandardMaterial({ color: 0xcfd4da, metalness: 1, roughness: 0.25, transparent: true }),
    copper: new THREE.MeshStandardMaterial({ color: 0xc27a47, metalness: 1, roughness: 0.3, transparent: true }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd1a54f, metalness: 1, roughness: 0.3, transparent: true }),
    film: new THREE.MeshStandardMaterial({
      map: filmTex, metalness: 0.85, roughness: 0.22, transparent: true, side: THREE.DoubleSide, envMapIntensity: 1.3,
    }),
    filmRoll: new THREE.MeshStandardMaterial({
      color: 0xd9e1ea, metalness: 0.95, roughness: 0.18, envMapIntensity: 1.2, transparent: true,
    }),
    filmClear: new THREE.MeshStandardMaterial({
      color: 0xbfe0ff, metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
    }),
    elementBody: new THREE.MeshStandardMaterial({
      color: 0xd3dbe5, metalness: 0.95, roughness: 0.2, map: filmTex, transparent: true,
    }),
    elementFace: new THREE.MeshStandardMaterial({ map: spiral, metalness: 0.8, roughness: 0.35, transparent: true }),
    zinc: new THREE.MeshStandardMaterial({
      map: zincTex,
      bumpMap: zincBump,
      bumpScale: 1.2,
      alphaMap: coverage,
      alphaTest: 0.999,
      metalness: 0.85,
      roughness: 0.62,
      emissive: new THREE.Color(0xff6a00),
      emissiveIntensity: 0,
      transparent: false,
    }),
    tape: new THREE.MeshStandardMaterial({
      color: 0xffe27a, metalness: 0.1, roughness: 0.18, transparent: true, opacity: 0.0, depthWrite: false,
    }),
    pressboard: new THREE.MeshStandardMaterial({ color: 0xcdc3ab, roughness: 0.9, transparent: true }),
    resin: new THREE.MeshStandardMaterial({
      color: 0xe0a53c, metalness: 0, roughness: 0.2, transparent: true, opacity: 0.5, depthWrite: false,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xcfe6ff, metalness: 0.1, roughness: 0.02, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    }),
    resistorBody: new THREE.MeshStandardMaterial({ map: resistor, roughness: 0.5, transparent: true }),
    label: new THREE.MeshStandardMaterial({ map: label, roughness: 0.62, metalness: 0, transparent: true, side: THREE.FrontSide }),
    floor: new THREE.MeshBasicMaterial({ map: floor, transparent: true, depthWrite: false, opacity: 0.9 }),
    shadow: new THREE.ShadowMaterial({ opacity: 0.35 }),
    xray: createXrayMaterial(),
    highlight: new THREE.MeshBasicMaterial({
      color: 0xffd204, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  };
  return m;
}

/** Fresnel rim "X-ray" shell material in brand electric blue. */
export function createXrayMaterial(color = 0x1f9bff) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: 0 },
      uPower: { value: 2.2 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      #include <clipping_planes_pars_vertex>
      void main(){
        vec4 mvPosition = modelViewMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uIntensity; uniform float uPower;
      varying vec3 vN; varying vec3 vV;
      #include <clipping_planes_pars_fragment>
      void main(){
        #include <clipping_planes_fragment>
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
        gl_FragColor = vec4(uColor * (0.08 + f * 1.4) * uIntensity, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  mat.clipping = true;
  return mat;
}
