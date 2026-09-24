# VIZ Technologies — website redesign

A static, framework-free redesign of the VIZ Technologies Private Limited website. It includes an interactive
Three.js walkthrough of how a metallized-polypropylene (MPP) power capacitor is manufactured.

| Page | What it is |
| --- | --- |
| `index.html` | Home page: split hero with a live 3D capacitor, client ticker, about/vision/mission, filterable product bento grid, 3D manufacturing line, infrastructure, applications, downloads, contact, footer |
| `manufacturing.html` | Full-screen version of the 3D line. `?stage=4` deep-links to a stage (1–7). |

## Run locally

ES modules need a web server (opening the file directly won't work):

```bash
npx serve .          # or: python3 -m http.server 8000
```

## Deploy

No build step. Push to GitHub and enable **Settings → Pages → Deploy from branch** (root), or upload the folder to any
static host. Three.js r186 is vendored and minified in `vendor/three/`, so there are no runtime CDN dependencies
apart from Google Fonts.

## Structure

```
index.html · manufacturing.html
css/main.css            design tokens (brand colours, type stack) + all page sections
css/factory.css         3D component UI: glass HUD, toolbar, scrubber, pressure test
js/main.js              nav, mega menu, mobile menu, reveals, counters, product filters, lazy 3D, contact form
js/hero-scene.js        hero capacitor with pointer-driven lighting + parallax spec chips
js/three/materials.js   procedural textures (brushed aluminium, MPP film, zinc spray, label) + materials
js/three/capacitor-model.js  parametric model of VECOCA3AU0055B (can, lid, terminal block, label, wound element)
js/factory/capacitor-factory.js  the 7-stage scene, as a pure function of timeline position T
js/factory/stages.js    stage copy, simulated telemetry and camera presets
js/factory/particles.js GPU particle emitter (zinc spray, weld sparks, bubbles, tear-off sparks)
js/factory/factory-ui.js HUD / timeline DOM layer
assets/                 product photo (background removed), OG image, brand SVGs
```

## 3D manufacturing component

```js
import { CapacitorFactory } from './js/factory/capacitor-factory.js';
const line = new CapacitorFactory(document.querySelector('#factory'), { stageDuration: 7, autoplay: true, loop: true });
line.goToStage(3);   // 0-based
line.seek(5.5);      // any T in [0, 7]
line.setXray(true);
line.setPressure(0.85); // stage 7 overpressure test (≥ 0.72 tears the leads)
```

Stages: 1 film feed & slitting · 2 winding · 3 schooping (zinc arc spray) · 4 stacking, leads & soldering (3 × 55.7 µF Δ) ·
5 casing, vacuum & resin potting · 6 lid crimping, overpressure disconnector & label · 7 exploded / X-ray inspection
with an interactive pressure test.

Because the scene is a pure function of `T`, scrubbing backwards, jumping and looping always stay consistent.
Rendering pauses when the section is off-screen. `prefers-reduced-motion` disables autoplay and camera easing.
Touch devices start with rotate off so the page still scrolls; the ⟲ button enables it.

## Placeholders to replace before launch

- **Logo:** `assets/brand/viz-mark.svg` and the inline header/footer SVGs are a *placeholder* VIZ lettermark.
  Swap in the official vector logo.
- **Client logos:** the ticker uses text wordmarks. Drop official logo files into each `<li class="logo-word">` as
  `<img>`; the CSS already handles greyscale → colour on hover.
- **Product ratings:** only the featured VECOCA3AU0055B tile uses verified values (copied from the product label).
  All other kVAr / voltage / temperature-class values are **indicative placeholders** and must be checked against
  VIZ datasheets.
- **Downloads:** rows open a pre-filled email to sales@viztechnologies.biz until the PDFs are supplied.
- **Contact form:** composes an email (mailto). Connect a form backend if submissions should be stored.
- **3D telemetry** is labelled as simulated and is illustrative, not plant data.
