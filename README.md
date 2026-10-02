# VIZ Technologies — website redesign

A static, framework-free redesign of the VIZ Technologies Private Limited website. It includes an interactive
Three.js walkthrough of how a metallized-polypropylene (MPP) power capacitor is manufactured.

| Page | What it is |
| --- | --- |
| `index.html` | Home page: split hero with a live 3D capacitor, client ticker, about/vision/mission, filterable product bento grid, 3D manufacturing line, infrastructure, applications, downloads, contact, footer |
| `manufacturing.html` | Full-screen version of the 3D line. `?stage=4` deep-links to a stage (1–8). |

## Run locally

ES modules need a web server (opening the file directly won't work):

```bash
npx serve .          # or: python3 -m http.server 8000
```

## Deploy

`.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to `main` (or the current working
branch), and can be run by hand from the Actions tab. One-time setup: **Settings → Pages → Source: GitHub Actions**.
There is no build step, so the folder also works on any static host. Three.js r186 is vendored and minified in `vendor/three/`, so there are no runtime CDN dependencies
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
js/factory/capacitor-factory.js  the 8-stage scene, as a pure function of timeline position T
js/factory/film-line.js stages 01–02: vacuum metallizer (Al/Zn vapour) and slitter (safety margins)
js/factory/film-strip.js film ribbon geometry shared by all stations
js/factory/stages.js    stage copy, simulated telemetry and camera presets
js/factory/particles.js GPU particle emitter (zinc spray, weld sparks, bubbles, tear-off sparks)
js/factory/factory-ui.js HUD / timeline DOM layer
assets/                 product photos (img/products), hero photo (background removed), OG image, brand SVGs
```

## 3D manufacturing component

```js
import { CapacitorFactory } from './js/factory/capacitor-factory.js';
const line = new CapacitorFactory(document.querySelector('#factory'), { stageDuration: 7, autoplay: true, loop: true });
line.goToStage(3);   // 0-based
line.seek(5.5);      // any T in [0, 8]
line.setXray(true);
line.setPressure(0.85); // stage 8 overpressure test (≥ 0.72 tears the leads)
```

Stages: 1 vacuum metallization (Al + Zn vapour onto PP film over a chill drum, oil-masked clear lanes) ·
2 slitting into narrow reels with unmetallized safety margins · 3 film feed & high-speed winding ·
4 schooping (zinc arc spray) · 5 stacking, leads & soldering (3 × 55.7 µF Δ) · 6 casing, vacuum & resin potting ·
7 lid crimping, overpressure disconnector & label · 8 exploded / X-ray inspection with an interactive pressure test.

Stages 1–2 stand at their own stations further down the line (−x) and the camera tracks across to the winder.
The winder → x-ray scene runs on its own "line time" `L = lineT(T)` (see `stages.js`), so adding or reordering
upstream stages never touches its choreography. The scrubber and step labels size themselves from `STAGES.length`.

Because the scene is a pure function of `T`, scrubbing backwards, jumping and looping always stay consistent.
Rendering pauses when the section is off-screen. `prefers-reduced-motion` disables autoplay and camera easing.
Touch devices start with rotate off so the page still scrolls; the ⟲ button enables it.

## Placeholders to replace before launch

- **Client logos:** the ticker uses text wordmarks. Drop official logo files into each `<li class="logo-word">` as
  `<img>`; the CSS already handles greyscale → colour on hover.
- **Product ratings:** values on the tiles come from the original viztechnologies.biz pages; the Viz PQS cards and
  the featured VECOCA3AU0055B tile are read off the product labels in the photos. Tiles without a spec strip
  (super heavy / standard / basic duty, reactors, fan, segmented film, motor start) had no published ratings.
- **Downloads:** link to the PDFs still hosted on the old WordPress site (viztechnologies.biz/wp-content/…).
  Copy them into `assets/downloads/` and repoint the links before the old site is retired. "Selection table for
  individual PFC for motors" pointed at a demo.fgrade.net host on the old site and may be dead.
- **Product photos:** `assets/img/products/` holds 10 photos from the "Capacitor Pictures" Drive folder (trimmed,
  ≤ 900 px WebP). Eight originals over 7 MB (EAE_4146, 4196, 4201, 4203, 4207, 4211, 4214, 4227) were not imported.
- **Contact form:** composes an email (mailto). Connect a form backend if submissions should be stored.
- **3D telemetry** is labelled as simulated and is illustrative, not plant data.
