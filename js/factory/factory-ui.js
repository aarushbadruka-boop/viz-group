/**
 * DOM layer for <CapacitorFactory>: HUD, toolbar, stage scrubber and the
 * overpressure test panel. Pure DOM — no framework.
 */
const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill="currentColor"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  xray: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.35-5.65M20 4v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  expand: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const pad = (n) => String(n).padStart(2, '0');
// localisation hook (js/i18n.js); English passes straight through when it is absent
const t = (s) => window.vizI18n?.t(s) ?? s;
const fmt = (s, vars) => t(s).replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class FactoryUI {
  constructor(root, stages, factory) {
    this.root = root;
    this.stages = stages;
    this.f = factory;
    this.dragging = false;
    this.frameCount = 0;
    root.classList.add('vf');
    root.innerHTML = '';
    this.#build();
    this.#bind();
  }

  #build() {
    const S = this.stages;
    const n = S.length;
    this.viewport = el('div', 'vf-viewport');
    this.canvas = el('canvas', 'vf-canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Interactive 3D animation of the capacitor manufacturing process');

    /* HUD */
    this.hud = el('div', 'vf-hud');
    this.hud.innerHTML = `
      <div class="vf-hud__index"><span class="vf-hud__num">01</span><span class="vf-hud__of">/ ${pad(n)}</span></div>
      <p class="vf-hud__kicker">Manufacturing stage</p>
      <h3 class="vf-hud__title" aria-live="polite" data-i18n-skip></h3>
      <p class="vf-hud__body" data-i18n-skip></p>
      <dl class="vf-telemetry" data-i18n-skip></dl>
      <p class="vf-hud__sim"><span class="vf-dot"></span>Simulated telemetry</p>`;
    this.hudNum = this.hud.querySelector('.vf-hud__num');
    this.hudTitle = this.hud.querySelector('.vf-hud__title');
    this.hudBody = this.hud.querySelector('.vf-hud__body');
    this.tele = this.hud.querySelector('.vf-telemetry');
    this.teleRows = [0, 1, 2].map(() => {
      const row = el('div', 'vf-telemetry__row');
      const dt = el('dt');
      const dd = el('dd');
      row.append(dt, dd);
      this.tele.append(row);
      return { dt, dd };
    });

    /* toolbar */
    this.tools = el('div', 'vf-tools');
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    this.btn = {
      xray: this.#tool('xray', 'X-ray view', true),
      rotate: this.#tool('rotate', 'Drag to rotate', true),
      minus: this.#tool('minus', 'Zoom out'),
      plus: this.#tool('plus', 'Zoom in'),
      reset: this.#tool('target', 'Re-centre camera'),
      full: this.#tool('expand', 'Fullscreen'),
    };
    this.btn.rotate.setAttribute('aria-pressed', String(!coarse));
    Object.values(this.btn).forEach((b) => this.tools.append(b));
    if (!document.fullscreenEnabled) this.btn.full.hidden = true;
    this.coarse = coarse;

    /* pressure test */
    this.pressure = el('div', 'vf-pressure');
    this.pressure.hidden = true;
    this.pressure.innerHTML = `
      <div class="vf-pressure__head">
        <label for="vf-p-${this.#uid()}">Overpressure test</label>
        <output>0%</output>
      </div>
      <input type="range" min="0" max="100" step="1" value="0" />
      <p class="vf-pressure__status" data-state="ok" data-i18n-skip><span class="vf-dot"></span><span>Circuit connected</span></p>`;
    this.pInput = this.pressure.querySelector('input');
    this.pInput.id = this.pressure.querySelector('label').htmlFor;
    this.pOut = this.pressure.querySelector('output');
    this.pStatus = this.pressure.querySelector('.vf-pressure__status');

    this.hint = el('p', 'vf-hint');
    this.hint.setAttribute('data-i18n-skip', '');
    this.loading = el('div', 'vf-loading', '<span class="vf-spinner"></span><span>Initialising 3D line…</span>');

    this.viewport.append(this.canvas, this.hud, this.tools, this.pressure, this.hint, this.loading);

    /* timeline */
    this.timeline = el('div', 'vf-timeline');
    this.playBtn = el('button', 'vf-play');
    this.playBtn.type = 'button';
    this.prevBtn = el('button', 'vf-step-btn', ICONS.prev);
    this.prevBtn.type = 'button';
    this.prevBtn.setAttribute('aria-label', 'Previous stage');
    this.nextBtn = el('button', 'vf-step-btn', ICONS.next);
    this.nextBtn.type = 'button';
    this.nextBtn.setAttribute('aria-label', 'Next stage');
    const controls = el('div', 'vf-controls');
    controls.append(this.prevBtn, this.playBtn, this.nextBtn);

    this.track = el('div', 'vf-track');
    this.rail = el('div', 'vf-rail');
    this.rail.setAttribute('role', 'slider');
    this.rail.setAttribute('tabindex', '0');
    this.rail.setAttribute('aria-label', 'Manufacturing timeline');
    this.rail.setAttribute('aria-valuemin', '0');
    this.rail.setAttribute('aria-valuemax', '100');
    this.fill = el('div', 'vf-rail__fill');
    this.handle = el('div', 'vf-rail__handle');
    for (let i = 1; i < n; i++) {
      const tick = el('span', 'vf-rail__tick');
      tick.style.left = `${(i / n) * 100}%`;
      this.rail.append(tick);
    }
    this.rail.append(this.fill, this.handle);
    this.steps = el('ol', 'vf-steps');
    this.steps.style.setProperty('--vf-n', String(n)); // the step grid scales with the stage count
    this.stepBtns = S.map((s, i) => {
      const li = el('li');
      const b = el('button', 'vf-steps__btn', `<span class="vf-steps__n">${pad(i + 1)}</span><span class="vf-steps__t">${s.short}</span>`);
      b.type = 'button';
      b.dataset.stage = i;
      b.dataset.i18nSkip = '';
      li.append(b);
      this.steps.append(li);
      return b;
    });
    this.track.append(this.rail, this.steps);
    this.time = el('div', 'vf-time', '00:00');
    this.time.setAttribute('aria-hidden', 'true');
    this.timeline.append(controls, this.track, this.time);

    this.root.append(this.viewport, this.timeline);
    this.setPlaying(this.f.playing);
    this.relabel();
    document.addEventListener('viz:langchange', () => this.relabel());
  }

  /** (Re)apply every visible / announced string in the current language. */
  relabel() {
    this.stepBtns.forEach((b, i) => {
      b.setAttribute('aria-label', fmt('Stage {n}: {title}', { n: i + 1, title: t(this.stages[i].title) }));
      b.querySelector('.vf-steps__t').textContent = t(this.stages[i].short);
    });
    this.#hintText();
    this.setPlaying(this.f.playing);
    if (this.pInput) this.setPressure(this.pInput.value / 100);
    if (this.current != null) this.setStage(this.current, null, { quiet: true });
    window.vizI18n?.apply(this.root);
  }

  #hintText() {
    const on = this.btn.rotate.getAttribute('aria-pressed') === 'true';
    this.hint.textContent = t(on ? 'Drag to orbit · pinch or +/− to zoom' : 'Swipe sideways to scrub · tap ⟲ to rotate');
    if (!this.coarse) this.hint.textContent = t('Drag to orbit · use +/− to zoom');
  }

  #uid() { return Math.random().toString(36).slice(2, 8); }

  #tool(icon, label, toggle = false) {
    const b = el('button', 'vf-tool', ICONS[icon]);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    if (toggle) b.setAttribute('aria-pressed', 'false');
    return b;
  }

  #bind() {
    const f = this.f;
    this.playBtn.addEventListener('click', () => f.toggle());
    this.prevBtn.addEventListener('click', () => f.prev());
    this.nextBtn.addEventListener('click', () => f.next());
    this.stepBtns.forEach((b) => b.addEventListener('click', () => f.goToStage(+b.dataset.stage)));

    this.btn.xray.addEventListener('click', () => {
      const on = this.btn.xray.getAttribute('aria-pressed') !== 'true';
      this.btn.xray.setAttribute('aria-pressed', String(on));
      f.setXray(on);
    });
    this.btn.rotate.addEventListener('click', () => {
      const on = this.btn.rotate.getAttribute('aria-pressed') !== 'true';
      this.btn.rotate.setAttribute('aria-pressed', String(on));
      f.setRotateEnabled(on);
      this.#hintText();
    });
    this.btn.plus.addEventListener('click', () => f.zoom(0.8));
    this.btn.minus.addEventListener('click', () => f.zoom(1.25));
    this.btn.reset.addEventListener('click', () => f.resetView());
    this.btn.full.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else this.root.requestFullscreen?.();
    });
    document.addEventListener('fullscreenchange', () => {
      const fs = document.fullscreenElement === this.root;
      this.root.classList.toggle('is-fullscreen', fs);
      f.setZoomEnabled?.(fs);
    });

    this.pInput.addEventListener('input', () => {
      if (f.playing) f.pause();
      f.setPressure(this.pInput.value / 100);
    });

    /* scrubbing */
    const seekFromEvent = (e) => {
      const r = this.rail.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      f.seek(x * this.stages.length);
    };
    this.rail.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.rail.setPointerCapture(e.pointerId);
      this.root.classList.add('is-scrubbing');
      seekFromEvent(e);
    });
    this.rail.addEventListener('pointermove', (e) => { if (this.dragging) seekFromEvent(e); });
    const end = () => { this.dragging = false; this.root.classList.remove('is-scrubbing'); };
    this.rail.addEventListener('pointerup', end);
    this.rail.addEventListener('pointercancel', end);
    this.rail.addEventListener('keydown', (e) => {
      const n = this.stages.length;
      const map = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05, PageUp: 1, PageDown: -1 };
      if (e.key in map) { f.seek(f.T + map[e.key]); e.preventDefault(); }
      if (e.key === 'Home') { f.seek(0); e.preventDefault(); }
      if (e.key === 'End') { f.seek(n); e.preventDefault(); }
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.target.closest('input, .vf-rail')) return;
      if (e.key === ' ' && e.target === this.root) { f.toggle(); e.preventDefault(); }
    });
  }

  /* ------------------------------------------------------------ state → DOM */

  ready() {
    this.loading.classList.add('is-done');
    if (this.coarse) this.f.setRotateEnabled(false);
  }

  fail() {
    this.loading.innerHTML = '<span>3D preview needs WebGL. Try a current version of Chrome, Edge, Safari or Firefox.</span>';
    this.root.classList.add('is-failed');
    window.vizI18n?.apply(this.loading);
  }

  setStage(i, prev, { quiet = false } = {}) {
    const s = this.stages[i];
    this.current = i;
    if (!quiet) {
      this.hud.classList.remove('is-in');
      void this.hud.offsetWidth; // restart the entrance animation
      this.hud.classList.add('is-in');
    }
    this.hudNum.textContent = pad(i + 1);
    this.hudTitle.textContent = t(s.title);
    this.hudBody.textContent = t(s.body);
    this.stepBtns.forEach((b, k) => {
      b.classList.toggle('is-active', k === i);
      b.classList.toggle('is-done', k < i);
      if (k === i) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
    this.pressure.hidden = i !== this.stages.length - 1;
    this.root.dataset.stage = s.key;
  }

  setPlaying(on) {
    this.playBtn.innerHTML = on ? ICONS.pause : ICONS.play;
    this.playBtn.setAttribute('aria-label', t(on ? 'Pause animation' : 'Play animation'));
    this.root.classList.toggle('is-playing', on);
  }

  setFollow(on) { this.btn.reset.classList.toggle('is-attn', !on); }

  setPressure(p) {
    const pct = Math.round(p * 100);
    this.pInput.value = pct;
    this.pOut.textContent = `${pct}%`;
    this.pInput.style.setProperty('--p', `${pct}%`);
    const isolated = p >= 0.72;
    this.pStatus.dataset.state = isolated ? 'isolated' : p > 0.12 ? 'warn' : 'ok';
    this.pStatus.lastElementChild.textContent = t(isolated
      ? 'Leads torn — capacitor isolated'
      : p > 0.12 ? 'Lid expanding…' : 'Circuit connected');
  }

  frame(T, f) {
    const n = this.stages.length;
    const x = (T / n) * 100;
    this.fill.style.width = `${x}%`;
    this.handle.style.left = `${x}%`;
    if (this.frameCount++ % 4) return;
    this.rail.setAttribute('aria-valuenow', String(Math.round(x)));
    this.rail.setAttribute('aria-valuetext', fmt('Stage {n} of {total}', { n: Math.min(n, Math.floor(T) + 1), total: n }));
    const secs = Math.round(T * f.opts.stageDuration);
    this.time.textContent = `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
    const s = this.stages[Math.min(n - 1, Math.floor(T))];
    const rows = s.telemetry(T, f);
    this.teleRows.forEach((r, i) => {
      const [k, v] = (rows[i] || ['', '']).map((x) => t(String(x)));
      if (r.dt.textContent !== k) r.dt.textContent = k;
      if (r.dd.textContent !== v) r.dd.textContent = v;
    });
  }
}
