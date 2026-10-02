/**
 * Stage metadata for the manufacturing timeline.
 * Telemetry is illustrative simulation output — not plant data.
 */
import { STATIONS } from './film-line.js';

const f1 = (n) => n.toFixed(1);
const pct = (n) => `${Math.round(n * 100)}%`;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sci = (v) => {
  if (v >= 1) return `${Math.round(v)}`;
  let e = Math.floor(Math.log10(v));
  let mant = Math.round(v / 10 ** e);
  if (mant === 10) { mant = 1; e += 1; }
  return `${mant}×10${String(e).replace(/./g, (c) => SUP[c])}`;
};

/** Timeline index where the winder takes over from the film-processing stations. */
export const LINE_START = 2;

/**
 * Map timeline T onto the capacitor line's own clock L (0…7), which drives the
 * winder → x-ray scene. Stage 03 packs film feed and winding (L 0…2) into one stage.
 */
export function lineT(T) {
  if (T < LINE_START) return 0;
  if (T < LINE_START + 1) return (T - LINE_START) * 2;
  return T - LINE_START + 1;
}
/** Wrap a telemetry function written against line time. */
const line = (fn) => (T, s) => fn(lineT(T), s);

const M = STATIONS.metallize, S = STATIONS.slit;

export const STAGES = [
  {
    key: 'metallize',
    short: 'Metallizing',
    title: 'Vacuum Metallization',
    body:
      'Inside a high-vacuum chamber, resistance-heated boats vaporize aluminium and zinc. The metal vapour condenses on polypropylene film running over a chilled drum, laying down an electrode only nanometres thick. An oil-printing roller masks the clear lanes where no metal may land.',
    telemetry: (T) => {
      const p = clamp01(T);
      const pump = 1 - (1 - clamp01(p / 0.18)) ** 3;
      const mbar = Math.exp(Math.log(1013) + (Math.log(4e-4) - Math.log(1013)) * pump);
      return [
        ['Vacuum · mbar', sci(mbar)],
        ['Boats', `${Math.round(25 + 1425 * clamp01((p - 0.1) / 0.14))} °C`],
        ['Coated', `${Math.round(Math.max(0, p - 0.23) * 3100)} m`],
      ];
    },
    camera: { pos: [M - 3.6, 2.1, 7.2], target: [M - 0.45, -0.55, -0.3] },
  },
  {
    key: 'slit',
    short: 'Slitting',
    title: 'Precision Slitting & Safety Margins',
    body:
      'The wide metallized master roll is unwound past rotary razor blades that slit it into narrow reels. Every cut runs down the centre of a clear lane or a metal lane, so each reel carries an unmetallized safety margin on one edge — and neighbouring reels are mirror images, ready to be paired in the winder.',
    telemetry: (T) => {
      const p = clamp01(T - 1);
      const run = clamp01((p - 0.12) / 0.84);
      return [
        ['Reel width', '60 mm'],
        ['Safety margin', '3.0 mm'],
        ['Slit', `${Math.round(run * 2400)} m`],
      ];
    },
    camera: { pos: [S - 5.0, 2.9, 6.2], target: [S - 0.35, 0.8, -0.3] },
  },
  {
    key: 'wind',
    short: 'Winding',
    title: 'Film Feed & High-Speed Winding',
    body:
      'Two slit reels — margins on opposite edges — unwind in lock-step onto a servo-driven mandrel that winds them into a dense cylindrical element. Tension and turn count are held tight: the winding itself sets the capacitance. The tail is cut and sealed with polyester tape.',
    telemetry: line((L) => {
      const p = clamp01((L - 1.02) / 0.83);
      const r = 0.12 + (0.86 - 0.12) * p;
      const c = (55.7 * (r * r - 0.0144)) / (0.86 * 0.86 - 0.0144);
      return [
        ['Film fed', `${f1(Math.min(L, 1.9) * 31.6)} m`],
        ['Turns', Math.round(2380 * p).toLocaleString('en-IN')],
        ['Capacitance', `${f1(c)} µF`],
      ];
    }),
    camera: { pos: [-6.3, 3.1, 5.6], target: [0, 0.15, -1.6] },
  },
  {
    key: 'schoop',
    short: 'Schooping',
    title: 'End-Face Metal Spraying',
    body:
      'Arc-sprayed molten zinc ("schooping") bonds to both end faces. Because each film’s metallized edge reaches only one face, the spray joins every turn in parallel — a low-inductance contact built for surge current.',
    telemetry: line((T) => {
      const p = clamp01((T - 2.18) / 0.67);
      return [
        ['Coverage', pct(p)],
        ['Contact', 'Zn spray'],
        ['Passes', `${Math.round(p * 12)} / 12`],
      ];
    }),
    camera: { pos: [-3.9, 1.6, 5.0], target: [0, -0.35, 0] },
  },
  {
    key: 'leads',
    short: 'Leads',
    title: 'Lead Attachment & Soldering',
    body:
      'Three elements are stacked on pressboard insulators and wired in delta. Copper leads are soldered to the schooped faces, and discharge resistors are fitted across the terminals to bleed stored charge after switch-off.',
    telemetry: line((T) => {
      const joints = Math.max(0, Math.min(6, Math.floor((T - 3.42) / 0.075) + (T >= 3.42 ? 1 : 0)));
      return [
        ['Joints', `${T >= 3.87 ? 6 : joints} / 6`],
        ['Delta config', '3×55.7 µF'],
        ['Discharge res.', T >= 3.95 ? '3 fitted' : '—'],
      ];
    }),
    camera: { pos: [4.6, 2.3, 7.6], target: [0, -0.05, 0] },
  },
  {
    key: 'case',
    short: 'Casing',
    title: 'Casing & Encapsulation',
    body:
      'The stack drops into a seamless extruded aluminium can. Under vacuum, polyurethane resin is poured to fill every void — drawing out the air and moisture that would otherwise shorten service life.',
    telemetry: line((T) => {
      const vac = clamp01((T - 4.4) / 0.08) * (1 - clamp01((T - 4.88) / 0.08));
      const fill = clamp01((T - 4.46) / 0.4);
      return [
        ['Vacuum', `${(-0.95 * vac).toFixed(2)} bar`],
        ['Resin fill', pct(fill)],
        ['Compound', 'PU resin'],
      ];
    }),
    camera: { pos: [5.0, 2.3, 7.6], target: [0, -0.1, 0] },
  },
  {
    key: 'seal',
    short: 'Sealing',
    title: 'Hermetic Sealing & Overpressure Disconnector',
    body:
      'The lid is roll-crimped to the can for a hermetic seal. The expansion zone beneath the rim is the safety system: if internal pressure rises at end of life, the lid lifts and tears the internal leads — isolating the capacitor.',
    telemetry: line((T) => {
      const crimp = clamp01((T - 5.28) / 0.3);
      return [
        ['Crimp', `${Math.round(crimp * 360)}°`],
        ['Seal test', T > 5.6 ? 'PASS' : '…'],
        ['Label', T > 5.86 ? 'Applied' : '—'],
      ];
    }),
    camera: { pos: [-2.7, 4.6, 8.0], target: [0, 0.9, 0] },
  },
  {
    key: 'inspect',
    short: 'X-ray',
    title: 'Exploded & X-Ray Inspection',
    body:
      'Drag to orbit. Inspect the concentric film layers, zinc end contacts, lead routing and the tear-off disconnector. Raise the internal pressure to watch the safety mechanism isolate the unit.',
    telemetry: (T, s) => [
      ['Pressure', pct(s.pressure)],
      ['Circuit', s.pressure >= 0.72 ? 'ISOLATED' : 'Connected'],
      ['Mode', s.pressure > 0.02 ? 'Test' : 'Exploded'],
    ],
    camera: { pos: [8.0, 3.3, 10.6], target: [0, 0.75, 0] },
    pressureCamera: { pos: [5.0, 2.4, 6.8], target: [0, 0.5, 0] },
  },
];
