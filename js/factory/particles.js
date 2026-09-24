/**
 * GPU particle emitter. Every particle's position is a pure function of
 * `time`, so the system scrubs forwards/backwards with the timeline.
 *
 *   mode 'loop'  — continuous stream (age = (t + seed·life) mod life)
 *   mode 'burst' — one-shot, staggered by seed (age = t − seed·stagger)
 */
import * as THREE from 'three';
import { rng } from '../three/materials.js';

const vert = /* glsl */ `
  attribute vec3 aDir;
  attribute vec3 aOffset;
  attribute float aSeed;
  attribute float aSpeed;
  uniform float uTime, uLife, uStagger, uMode, uStop, uSize, uPixelRatio, uGravity, uActive;
  varying float vAge;
  varying float vAlive;
  void main(){
    float age;
    if (uMode < 0.5) { age = mod(uTime + aSeed * uLife, uLife); }
    else { age = uTime - aSeed * uStagger; }
    float alive = step(0.0, age) * step(age, uLife) * uActive;
    float travel = min(aSpeed * age, uStop / max(aDir.y, 0.05));
    vec3 p = aOffset + aDir * travel;
    p.y -= 0.5 * uGravity * age * age;
    vAge = clamp(age / uLife, 0.0, 1.0);
    vAlive = alive;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float s = uSize * (1.0 - 0.55 * vAge) * alive;
    gl_PointSize = s * uPixelRatio * (300.0 / -mv.z);
  }`;

const frag = /* glsl */ `
  uniform vec3 uHot, uCool;
  uniform float uOpacity;
  varying float vAge;
  varying float vAlive;
  void main(){
    if (vAlive < 0.5) discard;
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    vec3 col = mix(uHot, uCool, smoothstep(0.0, 0.85, vAge));
    gl_FragColor = vec4(col * (1.2 - vAge), soft * (1.0 - vAge * 0.8) * uOpacity);
  }`;

export class Emitter extends THREE.Points {
  /**
   * @param {object} o
   * @param {number} o.count
   * @param {number} o.life        seconds
   * @param {[number,number]} o.speed
   * @param {number} o.cone        half-angle (rad) around +Y
   * @param {number} o.spawnRadius disk radius in XZ for spawn offsets
   * @param {number} o.spawnHeight cylinder height for spawn offsets
   * @param {THREE.Vector3[]} [o.spawnPoints] optional discrete spawn sites
   */
  constructor(o = {}) {
    const {
      count = 800, life = 0.6, speed = [2, 4], cone = 0.25, spawnRadius = 0.02, spawnHeight = 0,
      spawnPoints = null, seed = 1, hot = 0xfff1b0, cool = 0xff6a00, size = 0.06, gravity = 0,
      stop = 1e3, mode = 'loop', stagger = 0.2, blending = THREE.AdditiveBlending, opacity = 1,
    } = o;
    const r = rng(seed);
    const dir = new Float32Array(count * 3);
    const off = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // direction in a cone around +Y
      const a = r() * Math.PI * 2;
      const c = Math.cos(cone * Math.sqrt(r()));
      const s = Math.sqrt(1 - c * c);
      dir.set([Math.cos(a) * s, c, Math.sin(a) * s], i * 3);
      if (spawnPoints) {
        const p = spawnPoints[i % spawnPoints.length];
        off.set([p.x, p.y, p.z], i * 3);
      } else {
        const ra = r() * Math.PI * 2, rr = Math.sqrt(r()) * spawnRadius;
        off.set([Math.cos(ra) * rr, (r() - 0.5) * spawnHeight, Math.sin(ra) * rr], i * 3);
      }
      seeds[i] = r();
      speeds[i] = speed[0] + r() * (speed[1] - speed[0]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(off, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLife: { value: life },
        uStagger: { value: stagger },
        uMode: { value: mode === 'loop' ? 0 : 1 },
        uStop: { value: stop },
        uSize: { value: size },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uGravity: { value: gravity },
        uActive: { value: 0 },
        uHot: { value: new THREE.Color(hot) },
        uCool: { value: new THREE.Color(cool) },
        uOpacity: { value: opacity },
      },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending,
    });
    super(geo, mat);
    this.frustumCulled = false;
    this.renderOrder = 20;
  }

  set time(t) { this.material.uniforms.uTime.value = t; }
  set active(a) { this.material.uniforms.uActive.value = a ? 1 : 0; this.visible = !!a; }
  set opacity(o) { this.material.uniforms.uOpacity.value = o; }
}
