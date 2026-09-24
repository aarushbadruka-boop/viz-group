/**
 * Stage metadata for the manufacturing timeline.
 * Telemetry is illustrative simulation output — not plant data.
 */
const f1 = (n) => n.toFixed(1);
const pct = (n) => `${Math.round(n * 100)}%`;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export const STAGES = [
  {
    key: 'feed',
    short: 'Film feed',
    title: 'Film Feed & Slitting',
    body:
      'Twin rolls of metallized polypropylene film — a dielectric only microns thick carrying a vacuum-deposited Zn/Al electrode — unwind in lock-step. Rotary knives trim each web to width, leaving the clear margin on opposite edges.',
    telemetry: (T) => [
      ['Film fed', `${f1(18 + T * 42)} m`],
      ['Web speed', '4.8 m/s'],
      ['Margin offset', 'A ◀ · ▶ B'],
    ],
    camera: { pos: [-6.6, 3.1, 3.6], target: [0, 0.1, -1.9] },
  },
  {
    key: 'wind',
    short: 'Winding',
    title: 'Precision High-Speed Winding',
    body:
      'A servo-driven mandrel winds both films into a dense cylindrical element. Tension and turn count are held tight — the winding itself sets the capacitance. The tail is cut and sealed with polyester tape.',
    telemetry: (T) => {
      const p = clamp01((T - 1.02) / 0.83);
      const r = 0.12 + (0.86 - 0.12) * p;
      const c = (55.7 * (r * r - 0.0144)) / (0.86 * 0.86 - 0.0144);
      return [
        ['Turns', Math.round(2380 * p).toLocaleString('en-IN')],
        ['Capacitance', `${f1(c)} µF`],
        ['Element Ø', `${f1(r * 74)} mm`],
      ];
    },
    camera: { pos: [-6.0, 3.0, 5.4], target: [0, 0.2, -1.4] },
  },
  {
    key: 'schoop',
    short: 'Schooping',
    title: 'End-Face Metal Spraying',
    body:
      'Arc-sprayed molten zinc ("schooping") bonds to both end faces. Because each film’s metallized edge reaches only one face, the spray joins every turn in parallel — a low-inductance contact built for surge current.',
    telemetry: (T) => {
      const p = clamp01((T - 2.18) / 0.67);
      return [
        ['Coverage', pct(p)],
        ['Contact', 'Zn spray'],
        ['Passes', `${Math.round(p * 12)} / 12`],
      ];
    },
    camera: { pos: [-3.9, 1.6, 5.0], target: [0, -0.35, 0] },
  },
  {
    key: 'leads',
    short: 'Leads',
    title: 'Lead Attachment & Soldering',
    body:
      'Three elements are stacked on pressboard insulators and wired in delta. Copper leads are soldered to the schooped faces, and discharge resistors are fitted across the terminals to bleed stored charge after switch-off.',
    telemetry: (T) => {
      const joints = Math.max(0, Math.min(6, Math.floor((T - 3.42) / 0.075) + (T >= 3.42 ? 1 : 0)));
      return [
        ['Joints', `${T >= 3.87 ? 6 : joints} / 6`],
        ['Delta config', '3×55.7 µF'],
        ['Discharge res.', T >= 3.95 ? '3 fitted' : '—'],
      ];
    },
    camera: { pos: [4.6, 2.3, 7.6], target: [0, -0.05, 0] },
  },
  {
    key: 'case',
    short: 'Casing',
    title: 'Casing & Encapsulation',
    body:
      'The stack drops into a seamless extruded aluminium can. Under vacuum, polyurethane resin is poured to fill every void — drawing out the air and moisture that would otherwise shorten service life.',
    telemetry: (T) => {
      const vac = clamp01((T - 4.4) / 0.08) * (1 - clamp01((T - 4.88) / 0.08));
      const fill = clamp01((T - 4.46) / 0.4);
      return [
        ['Vacuum', `${(-0.95 * vac).toFixed(2)} bar`],
        ['Resin fill', pct(fill)],
        ['Compound', 'PU resin'],
      ];
    },
    camera: { pos: [5.0, 2.3, 7.6], target: [0, -0.1, 0] },
  },
  {
    key: 'seal',
    short: 'Sealing',
    title: 'Hermetic Sealing & Overpressure Disconnector',
    body:
      'The lid is roll-crimped to the can for a hermetic seal. The expansion zone beneath the rim is the safety system: if internal pressure rises at end of life, the lid lifts and tears the internal leads — isolating the capacitor.',
    telemetry: (T) => {
      const crimp = clamp01((T - 5.28) / 0.3);
      return [
        ['Crimp', `${Math.round(crimp * 360)}°`],
        ['Seal test', T > 5.6 ? 'PASS' : '…'],
        ['Label', T > 5.86 ? 'Applied' : '—'],
      ];
    },
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
