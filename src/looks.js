// Look presets — the point of this project. Each preset re-colours and
// re-lights the same city scaffolding (sky, fog, light, towers, ground,
// signage/billboards, holograms, vehicles, water, post-processing, UI).

/**
 * Default user-editable custom theme state. Mutated via syncCustomLook() so
 * LOOK_BY_ID.custom stays live in-place across the whole app.
 */
export const DEFAULT_CUSTOM = {
  zen: '#091326',
  hor: '#d95b43',
  base: '#182438',
  win: '#ffd166',
  accent: '#06d6a0',
  sec: '#4cc9f0',
  style: 'lit', // 'lit' | 'toon' | 'flat'
  mono: false,
};

function hexToRgb(hex) {
  const s = String(hex || '#888888').replace('#', '');
  const v = s.length === 3
    ? s.split('').map((c) => parseInt(c + c, 16))
    : [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  return v.map((n) => (Number.isFinite(n) ? n : 128));
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixHex(a, b, t) {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function scaleHex(a, k) {
  const [r, g, b] = hexToRgb(a);
  return rgbToHex(r * k, g * k, b * k);
}

export function buildCustomLookFields(cfg = {}) {
  const p = { ...DEFAULT_CUSTOM, ...cfg };
  const zen = p.zen;
  const hor = p.hor;
  const base = p.base;
  const win = p.win;
  const accent = p.accent;
  const sec = p.mono ? mixHex(win, '#ffffff', 0.35) : p.sec;
  const baseB = mixHex(base, hor, 0.28);
  const darkStreet = scaleHex(base, 0.48);
  const blockCol = scaleHex(base, 0.72);
  const isFlat = p.style === 'flat' ? 1 : 0;
  const isToon = p.style === 'toon' ? 1 : 0;
  const billA = p.mono ? mixHex(win, '#ffffff', 0.25) : accent;
  const billB = p.mono ? scaleHex(win, 0.62) : sec;

  return {
    id: 'custom',
    customConfig: p,
    nature: p.mono ? 'cyber' : 'organic',
    trees: {
      trunk: scaleHex(base, 0.75),
      canopy: p.mono ? mixHex(base, win, 0.35) : mixHex(accent, base, 0.35),
      glow: win,
    },
    defTime: 19.0,
    label: 'Custom',
    blurb: 'your own palette · live sky, facade, signage & neon colours',
    accent,
    sky: {
      zen,
      hor,
      sun: mixHex(win, '#ffffff', 0.35),
      sunDir: [0.58, 0.18, -0.79],
      stars: 0.45,
      cloud: 0.38,
      cloudCol: mixHex(zen, hor, 0.42),
      haze: 0.65,
    },
    fog: { color: mixHex(zen, hor, 0.55), density: 0.00055, height: 0.0003 },
    light: {
      sun: mixHex(hor, win, 0.5),
      sunK: 1.05,
      amb: mixHex(zen, sec, 0.28),
      ambG: scaleHex(zen, 0.7),
      toon: isToon,
      flat: isFlat,
    },
    tower: {
      baseA: base,
      baseB,
      palette: [
        base,
        baseB,
        mixHex(base, accent, 0.22),
        mixHex(base, sec, 0.22),
        scaleHex(base, 0.78),
        mixHex(baseB, win, 0.18),
      ],
      usePalette: 1,
      winDensity: isFlat ? 0.18 : 0.44,
      winGlow: isFlat ? 0.45 : 1.35,
      winA: win,
      winB: sec,
      winC: p.mono ? mixHex(win, base, 0.2) : accent,
      edge: isToon || isFlat ? 0.75 : 0.36,
      edgeCol: p.mono ? win : accent,
      bandGlow: 1.35,
    },
    ground: {
      street: darkStreet,
      block: blockCol,
      line: p.mono ? win : accent,
      lineGlow: 0.95,
    },
    signals: {
      billA,
      billB,
      billK: 1.0,
      billMono: p.mono ? 1.0 : 0.0,
      beam: mixHex(sec, '#ffffff', 0.45),
      lamp: mixHex(win, '#ffffff', 0.25),
      pool: win,
      beacon: p.mono ? win : accent,
      waterDeep: scaleHex(zen, 0.85),
      waterShallow: mixHex(zen, sec, 0.55),
      vehicles: p.mono
        ? [win, mixHex(win, '#ffffff', 0.4), scaleHex(win, 0.75), mixHex(win, base, 0.35), '#ffffff', billB]
        : [win, accent, sec, mixHex(win, '#ffffff', 0.45), mixHex(accent, sec, 0.5), mixHex(hor, '#ffffff', 0.3)],
    },
    grade: { bloom: 0.85, lens: 0.45, contrast: 1.06, temp: 0.0, film: p.mono ? 0.32 : 0.1 },
    post: { grain: 0.16, scan: 0.06, vignette: 0.65 },
  };
}

export const LOOKS = [
  {
    id: 'bladerunner',
    defTint: 0.78,
    nature: 'cyber',
    trees: { trunk: '#1a1220', canopy: '#2a1a3c', glow: '#ff4f8f' },
    defTime: 18.2,
    label: 'Blade Runner',
    blurb: 'smog sunset · neon windows · media megastructures · low orange haze',
    accent: '#ff6a4d',
    sky: {
      zen: '#0d0716', hor: '#a8452c', sun: '#ff9a5c', sunDir: [0.72, 0.1, -0.68],
      stars: 0, cloud: 0.32, cloudCol: '#2c1226', haze: 1.0,
    },
    fog: { color: '#5b2032', density: 0.00075, height: 0.0005 },
    light: {
      sun: '#ffb070', sunK: 1.15, amb: '#2c1a44', ambG: '#160c24',
      toon: 0, flat: 0,
    },
    tower: {
      baseA: '#171022', baseB: '#2a1a3c', palette: ['#171022', '#221533', '#2a1a3c', '#1a1028', '#2c1a40', '#141022'], usePalette: 0,
      winDensity: 0.42, winGlow: 1.5,
      winA: '#ffb45e', winB: '#53d9ff', winC: '#ff4f8f',
      edge: 0.18, edgeCol: '#ff2d6f', bandGlow: 1.6,
    },
    ground: { street: '#0c0713', block: '#170e22', line: '#ff386e', lineGlow: 0.85 },
    signals: {
      billA: '#ff4f8f', billB: '#53d9ff', billK: 1.15, billMono: 0,
      beam: '#ffcba4', lamp: '#ffb870', pool: '#ff9852', beacon: '#ff3b5c',
      waterDeep: '#0d0a1a', waterShallow: '#48244c',
      vehicles: ['#ff9e5e', '#53d9ff', '#ff4f8f', '#ffd28a', '#9ee6ff', '#ff6e54'],
    },
    grade: { bloom: 0.95, lens: 0.55, contrast: 1.08, temp: 0.14, film: 0.16 },
    post: { grain: 0.22, scan: 0, vignette: 0.85 },
  },
  {
    id: 'realistic',
    defTint: 0.44,
    nature: 'organic',
    trees: { trunk: '#5c4430', canopy: '#3d7f4b', glow: '#ffdf9e' },
    defTime: 17.3,
    label: 'Unreal Cinema',
    blurb: 'modern cinema & game realism · varied glass, stone & steel · golden coastal sun',
    accent: '#56b4e9',
    sky: {
      zen: '#16325c', hor: '#df8c59', sun: '#fff1d6', sunDir: [0.64, 0.26, -0.72],
      stars: 0.12, cloud: 0.46, cloudCol: '#dce5f2', haze: 0.46,
    },
    fog: { color: '#394f6e', density: 0.00038, height: 0.00024 },
    light: {
      sun: '#ffe8c2', sunK: 1.32, amb: '#526f96', ambG: '#2a2622',
      toon: 0, flat: 0,
    },
    tower: {
      baseA: '#353e4a', baseB: '#6d7785',
      palette: ['#8a7f71', '#4c5c6e', '#696259', '#3d444d', '#7b5848', '#788390'],
      usePalette: 1,
      winDensity: 0.46, winGlow: 0.95,
      winA: '#ffd28e', winB: '#b5dcff', winC: '#ffe9c4',
      edge: 0.12, edgeCol: '#95adc9', bandGlow: 0.55,
    },
    ground: { street: '#1f242c', block: '#2c323b', line: '#e6c57a', lineGlow: 0.32 },
    signals: {
      billA: '#ff8c42', billB: '#48cae4', billK: 0.92, billMono: 0,
      beam: '#fff3dc', lamp: '#ffd599', pool: '#ffbe78', beacon: '#ff4242',
      waterDeep: '#092438', waterShallow: '#1f6f84',
      vehicles: ['#d8dee6', '#f2b705', '#2b4560', '#c1292e', '#eef2f6', '#4a5562'],
    },
    grade: { bloom: 0.62, lens: 0.28, contrast: 1.09, temp: 0.05, film: 0.08 },
    post: { grain: 0.08, scan: 0, vignette: 0.52 },
  },
  {
    id: 'anime',
    nature: 'organic',
    trees: { trunk: '#7a5a3a', canopy: '#4a9c5d', glow: '#ffd98a' },
    defTime: 11.5,
    label: '2000s Anime',
    blurb: 'flat cel light · ink lines · painted cumuli · crisp signage',
    accent: '#3ea8ff',
    sky: {
      zen: '#2f7fd6', hor: '#b7e8f2', sun: '#fff4d2', sunDir: [0.48, 0.62, -0.62],
      stars: 0, cloud: 0.6, cloudCol: '#ffffff', haze: 0.25,
    },
    fog: { color: '#c6e6f0', density: 0.0003, height: 0.0002 },
    light: {
      sun: '#fff2c8', sunK: 1.35, amb: '#6f9fc9', ambG: '#8aa0b4',
      toon: 1, flat: 0,
    },
    tower: {
      baseA: '#d8c4a8', baseB: '#8fa8c4', palette: ['#e8d5b5', '#cbb795', '#8fa8c4', '#a7c4d8', '#d8c4a8', '#b7a68c'], usePalette: 0,
      winDensity: 0.5, winGlow: 0.35,
      winA: '#ffd98a', winB: '#a8d8ff', winC: '#ffb8c8',
      edge: 0.55, edgeCol: '#20283e', bandGlow: 0.15,
    },
    ground: { street: '#5c6d80', block: '#a8bfa6', line: '#eef7f2', lineGlow: 0.12 },
    signals: {
      billA: '#ff6b8b', billB: '#3ea8ff', billK: 0.72, billMono: 0,
      beam: '#fff6da', lamp: '#ffe39e', pool: '#ffd98a', beacon: '#ff5c77',
      waterDeep: '#2266ab', waterShallow: '#7fd4ea',
      vehicles: ['#fff5e4', '#ff7b89', '#4db4ff', '#ffd166', '#8ce0b8', '#d8e6f5'],
    },
    grade: { bloom: 0.42, lens: 0.18, contrast: 1.05, temp: 0.04, film: 0.06 },
    post: { grain: 0.12, scan: 0, vignette: 0.45 },
  },
  {
    id: 'abstract',
    nature: 'organic',
    trees: { trunk: '#202028', canopy: '#e63946', glow: '#f4c430' },
    defTime: 13,
    label: 'Abstract',
    blurb: 'primary blocks · black ink edges · graphic Bauhaus placards',
    accent: '#e63946',
    sky: {
      zen: '#eef0f4', hor: '#ffffff', sun: '#ffffff', sunDir: [0.5, 0.7, -0.5],
      stars: 0, cloud: 0, cloudCol: '#ffffff', haze: 0,
    },
    fog: { color: '#f2f3f6', density: 0.00022, height: 0 },
    light: {
      sun: '#ffffff', sunK: 0.9, amb: '#ffffff', ambG: '#e8e8ec',
      toon: 0, flat: 1,
    },
    tower: {
      baseA: '#264653', baseB: '#e9c46a',
      palette: ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#8d99ae'],
      usePalette: 1,
      winDensity: 0, winGlow: 0,
      winA: '#000000', winB: '#000000', winC: '#000000',
      edge: 1.0, edgeCol: '#101014', bandGlow: 0,
    },
    ground: { street: '#ffffff', block: '#f1f2f5', line: '#101014', lineGlow: 0 },
    signals: {
      billA: '#e63946', billB: '#2a9d8f', billK: 0.55, billMono: 0,
      beam: '#e9c46a', lamp: '#f4a261', pool: '#e9c46a', beacon: '#e63946',
      waterDeep: '#264653', waterShallow: '#2a9d8f',
      vehicles: ['#e63946', '#e9c46a', '#2a9d8f', '#264653', '#f4a261', '#101014'],
    },
    grade: { bloom: 0.16, lens: 0.08, contrast: 1.08, temp: 0.0, film: 0.0 },
    post: { grain: 0, scan: 0, vignette: 0.25 },
  },
  {
    id: 'tron',
    nature: 'cyber',
    trees: { trunk: '#0a1420', canopy: '#0a2836', glow: '#00e5ff' },
    defTime: 22.8,
    label: 'Tron',
    blurb: 'dark grid · cyan & amber light-lines · holographic data towers',
    accent: '#00e5ff',
    sky: {
      zen: '#000000', hor: '#02101c', sun: '#0a2c40', sunDir: [0.2, 0.25, -0.95],
      stars: 0.35, cloud: 0, cloudCol: '#02101c', haze: 0.2,
    },
    fog: { color: '#020a12', density: 0.00055, height: 0.0003 },
    light: {
      sun: '#12384e', sunK: 0.7, amb: '#071622', ambG: '#030a10',
      toon: 0, flat: 0,
    },
    tower: {
      baseA: '#050a10', baseB: '#0a141d', palette: ['#050a10', '#071018', '#0a141d', '#04090e', '#0c1a24', '#060d14'], usePalette: 0,
      winDensity: 0.07, winGlow: 0.7,
      winA: '#00e5ff', winB: '#ffb347', winC: '#00e5ff',
      edge: 1.25, edgeCol: '#00e5ff', bandGlow: 2.6,
    },
    ground: { street: '#01060c', block: '#02090f', line: '#00e5ff', lineGlow: 1.6 },
    signals: {
      billA: '#00e5ff', billB: '#ff9e2c', billK: 1.25, billMono: 0,
      beam: '#00e5ff', lamp: '#00e5ff', pool: '#00b8d9', beacon: '#ff9e2c',
      waterDeep: '#010912', waterShallow: '#006884',
      vehicles: ['#00e5ff', '#00e5ff', '#ff9e2c', '#80f4ff', '#ffb347', '#e6fcff'],
    },
    grade: { bloom: 1.15, lens: 0.55, contrast: 1.12, temp: -0.18, film: 0.05 },
    post: { grain: 0.08, scan: 0.35, vignette: 0.9 },
  },
  {
    id: 'outrun',
    nature: 'organic',
    trees: { trunk: '#2a1a3c', canopy: '#ff7edb', glow: '#ffb347' },
    defTime: 19.2,
    label: 'Outrun',
    blurb: 'violet dusk · magenta & cyan arcade strip · star field',
    accent: '#ff7edb',
    sky: {
      zen: '#1b0f3a', hor: '#ff6fa5', sun: '#ffd166', sunDir: [0.35, 0.08, -0.93],
      stars: 0.8, cloud: 0.15, cloudCol: '#5b2a7a', haze: 0.7,
    },
    fog: { color: '#3b1a5e', density: 0.0005, height: 0.0002 },
    light: {
      sun: '#ff9ecb', sunK: 1.1, amb: '#3a2266', ambG: '#1e1040',
      toon: 0.35, flat: 0,
    },
    tower: {
      baseA: '#2a1a4a', baseB: '#4a2a80', palette: ['#2a1a4a', '#38245e', '#4a2a80', '#221440', '#54308c', '#1c1034'], usePalette: 0,
      winDensity: 0.5, winGlow: 1.25,
      winA: '#ff7edb', winB: '#7af0ff', winC: '#ffd166',
      edge: 0.4, edgeCol: '#ff7edb', bandGlow: 1.4,
    },
    ground: { street: '#160b2c', block: '#221040', line: '#7af0ff', lineGlow: 1.25 },
    signals: {
      billA: '#ff5ec4', billB: '#7af0ff', billK: 1.2, billMono: 0,
      beam: '#ff9ee2', lamp: '#ffd166', pool: '#ff7edb', beacon: '#ff5ec4',
      waterDeep: '#180a34', waterShallow: '#7a2c8f',
      vehicles: ['#ff7edb', '#7af0ff', '#ffd166', '#ff54b0', '#a8f9ff', '#c77dff'],
    },
    grade: { bloom: 1.0, lens: 0.5, contrast: 1.08, temp: 0.08, film: 0.12 },
    post: { grain: 0.18, scan: 0.15, vignette: 0.7 },
  },
  {
    id: 'clay',
    nature: 'organic',
    trees: { trunk: '#8a7a6a', canopy: '#9aa87a', glow: '#ffd9a0' },
    defTime: 12.5,
    label: 'Clay',
    blurb: 'white study model · soft shadow · monochrome paper signage',
    accent: '#8fa3b8',
    sky: {
      zen: '#c3d0de', hor: '#eef2f6', sun: '#fff6e8', sunDir: [0.55, 0.55, -0.63],
      stars: 0, cloud: 0.25, cloudCol: '#ffffff', haze: 0.3,
    },
    fog: { color: '#dfe6ee', density: 0.00034, height: 0.0001 },
    light: {
      sun: '#fff4e4', sunK: 1.2, amb: '#9fb0c2', ambG: '#b8c2cc',
      toon: 0, flat: 0,
    },
    tower: {
      baseA: '#d6d6d6', baseB: '#bdbdbd', palette: ['#d6d6d6', '#cfcfcf', '#bdbdbd', '#c6c6c6', '#d2d2d2', '#b8b8b8'], usePalette: 0,
      winDensity: 0.18, winGlow: 0.05,
      winA: '#aebbc8', winB: '#aebbc8', winC: '#aebbc8',
      edge: 0.32, edgeCol: '#6a7583', bandGlow: 0.1,
    },
    ground: { street: '#b4bac2', block: '#d7d7d7', line: '#97a0aa', lineGlow: 0.1 },
    signals: {
      billA: '#eceef0', billB: '#9aa6b2', billK: 0.28, billMono: 1.0,
      beam: '#f4efe6', lamp: '#f2e4c8', pool: '#e6dcc8', beacon: '#c8b89e',
      waterDeep: '#9aaaba', waterShallow: '#ccd6e0',
      vehicles: ['#eceef0', '#d4dae0', '#b8c2cc', '#f7f8fa', '#9aa6b2', '#cfd5dc'],
    },
    grade: { bloom: 0.22, lens: 0.12, contrast: 1.0, temp: 0.02, film: 0.04 },
    post: { grain: 0, scan: 0, vignette: 0.35 },
  },
  {
    id: 'metropolis',
    defTime: 21.4,
    label: 'Metropolis',
    blurb: 'Fritz Lang silhouettes · monochrome silver & tungsten · searchlights raking the clouds',
    accent: '#d8c9a3',
    nature: 'cyber',
    trees: { trunk: '#141210', canopy: '#2a2622', glow: '#e8d9b0' },
    sky: {
      zen: '#07070a', hor: '#5a5148', sun: '#e8d9b0', sunDir: [0.62, 0.16, -0.72],
      stars: 0.3, cloud: 0.62, cloudCol: '#1c1916', haze: 0.8,
    },
    fog: { color: '#15130f', density: 0.00062, height: 0.00038 },
    light: {
      sun: '#e8d9b0', sunK: 0.75, amb: '#3a3630', ambG: '#141210',
      toon: 1, flat: 0,
    },
    tower: {
      baseA: '#26221e', baseB: '#6b635a', palette: ['#26221e', '#3a342e', '#6b635a', '#4a423a', '#201c18', '#57503f'], usePalette: 1,
      winDensity: 0.4, winGlow: 2.3,
      winA: '#f2dfb3', winB: '#fff1d0', winC: '#d6c396',
      edge: 0.85, edgeCol: '#d9c9a0', bandGlow: 1.5,
    },
    ground: { street: '#0c0b09', block: '#171412', line: '#c9b98c', lineGlow: 1.1 },
    signals: {
      // Strictly monochrome silver-nitrate / warm silver — ZERO colour billboards!
      billA: '#ece8df', billB: '#7a7770', billK: 0.88, billMono: 1.0,
      beam: '#eeebe2', lamp: '#efe9dc', pool: '#dcd5c6', beacon: '#f0ece2',
      waterDeep: '#0b0a09', waterShallow: '#45423d',
      vehicles: ['#efece4', '#cfcbc2', '#f7f5ef', '#9c9890', '#e0dcd2', '#b8b4ab'],
    },
    grade: { bloom: 0.88, lens: 0.48, contrast: 1.18, temp: 0.06, film: 0.48 },
    post: { grain: 0.3, scan: 0.18, vignette: 0.55 },
  },
  buildCustomLookFields(DEFAULT_CUSTOM),
];

export const LOOK_BY_ID = Object.fromEntries(LOOKS.map((l) => [l.id, l]));

/**
 * Update the live Custom look preset in-place from partial user palette overrides.
 */
export function syncCustomLook(overrides = {}) {
  const cur = LOOK_BY_ID.custom ? LOOK_BY_ID.custom.customConfig : DEFAULT_CUSTOM;
  const built = buildCustomLookFields({ ...cur, ...overrides });
  Object.assign(LOOK_BY_ID.custom, built);
  return LOOK_BY_ID.custom;
}
