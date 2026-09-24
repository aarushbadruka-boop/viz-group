/**
 * Hero showcase: the finished VIZ capacitor, lit by a light that follows
 * the pointer. Glass spec chips drift in parallax with the same input.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons';
import { createMaterials } from './three/materials.js';
import { buildFinishedCapacitor, DIM } from './three/capacitor-model.js';

const easeOut = (x) => 1 - Math.pow(1 - x, 3);

function blobShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.5, 'rgba(0,0,0,0.22)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

export function mountHero(stage) {
  const canvas = stage.querySelector('.hero__canvas');
  if (!canvas) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return null; // keep the photographic fallback
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.95;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  camera.position.set(0, 0.6, 13.6);
  camera.lookAt(0, 0.1, 0);

  const m = createMaterials(renderer);
  m.aluminium.side = THREE.FrontSide;

  const pivot = new THREE.Group();
  const cap = buildFinishedCapacitor(m);
  const totalH = DIM.H + DIM.blockH + 0.06;
  cap.position.y = -totalH / 2;
  pivot.add(cap);
  scene.add(pivot);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 4.2),
    new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -totalH / 2 - 0.02;
  scene.add(shadow);

  scene.add(new THREE.HemisphereLight(0xdcecff, 0x0f263a, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(4, 6, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x3d9bff, 3.2);
  rim.position.set(-6, 3, -5);
  scene.add(rim);
  const rimR = new THREE.DirectionalLight(0x7fc4ff, 1.4);
  rimR.position.set(6, 1, -4);
  scene.add(rimR);
  const cursor = new THREE.PointLight(0xffe9a8, 30, 22, 1.6);
  cursor.position.set(2, 2, 6);
  scene.add(cursor);

  // label faces the viewer (label centre is at DIM.labelCenter)
  const baseRot = -DIM.labelCenter - 0.28;

  const chips = [...stage.querySelectorAll('[data-depth]')];
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (e) => {
    const r = stage.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the whole unit in frame on narrow stages
    const fitH = totalH / 0.8;
    const fitW = (DIM.R * 2 + 1.6) / camera.aspect;
    const need = Math.max(fitH, fitW);
    camera.position.z = need / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  let visible = true;
  let raf = null;
  const t0 = performance.now();
  const frame = (now) => {
    raf = null;
    const t = (now - t0) / 1000;
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    const intro = reduced ? 1 : easeOut(Math.min(1, t / 1.8));

    pivot.rotation.y = baseRot - (1 - intro) * 1.6 + (reduced ? 0 : Math.sin(t * 0.32) * 0.32) + pointer.x * 0.45;
    pivot.rotation.x = pointer.y * 0.06;
    pivot.position.y = reduced ? 0 : Math.sin(t * 0.9) * 0.08;
    pivot.scale.setScalar(0.9 + 0.1 * intro);
    shadow.material.opacity = 0.9 - (pivot.position.y + 0.08) * 1.5;
    cursor.position.set(pointer.x * 5, -pointer.y * 3.5 + 1, 6);

    chips.forEach((c) => {
      const d = +c.dataset.depth;
      c.style.transform = `translate3d(${pointer.x * d}px, ${pointer.y * d * 0.7}px, 0)`;
    });

    renderer.render(scene, camera);
    if (visible && !reduced) raf = requestAnimationFrame(frame);
  };

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(frame);
  }).observe(stage);

  // first frame, then reveal the canvas over the photographic fallback
  frame(performance.now());
  requestAnimationFrame(() => stage.classList.add('is-3d'));
  if (reduced) window.addEventListener('pointermove', () => { if (!raf) raf = requestAnimationFrame(frame); }, { passive: true });
  return { renderer, scene, camera };
}
