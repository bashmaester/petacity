// Look presets — the point of this project. Each preset re-colours and
// re-lights the same city scaffolding (sky, fog, light, towers, ground, UI).

/**
 * @typedef {Object} Look
 * @property {string} id
 * @property {string} label
 * @property {string} blurb
 * @property {string} accent      UI accent colour
 * @property {Object} sky
 * @property {Object} fog
 * @property {Object} light
 * @property {Object} tower
 * @property {Object} ground
 * @property {Object} post        CSS overlay strengths 0..1
 */

export const LOOKS = [
  {
    id: 'bladerunner',
    label: 'Blade Runner',
    blurb: 'smog sunset · neon windows · low orange haze',
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
    post: { grain: 0.22, scan: 0, vignette: 0.85 },
  },
  {
    id: 'anime',
    label: '2000s Anime',
    blurb: 'flat cel light · ink lines · bright painted sky',
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
    post: { grain: 0.12, scan: 0, vignette: 0.45 },
  },
  {
    id: 'abstract',
    label: 'Abstract',
    blurb: 'primary blocks · black edges · no light at all',
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
    post: { grain: 0, scan: 0, vignette: 0.25 },
  },
  {
    id: 'tron',
    label: 'Tron',
    blurb: 'dark grid · glowing edges · emissive bands',
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
    post: { grain: 0.08, scan: 0.35, vignette: 0.9 },
  },
  {
    id: 'outrun',
    label: 'Outrun',
    blurb: 'violet dusk · pink grid · star field',
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
    post: { grain: 0.18, scan: 0.15, vignette: 0.7 },
  },
  {
    id: 'clay',
    label: 'Clay',
    blurb: 'white study model · soft shadow · archviz calm',
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
    post: { grain: 0, scan: 0, vignette: 0.35 },
  },
];

export const LOOK_BY_ID = Object.fromEntries(LOOKS.map((l) => [l.id, l]));
