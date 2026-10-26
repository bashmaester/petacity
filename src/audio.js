// Modular Pure-Code Space-Ambient Synthesizer & Evolving Generative Radio Engine.
// 100% software synthesis in Web Audio API — zero audio files, zero samples, zero network fetches.
// Features 6 original atmospheric stations and a 4-movement macro-evolution engine
// (Mist Prelude -> Rising Skyline -> Luminous Zenith -> Nocturnal Dissolve) with
// modal harmonic pivots, call-and-response phrasing, and live city-telemetry coupling.

import { mulberry32 } from './prng.js';

export const RADIO_MOVEMENTS = [
  { index: 0, name: 'I · Mist Prelude', density: 0.42, brightness: 0.68, rhythmMul: 0.30, leadMul: 0.45, bridge: false },
  { index: 1, name: 'II · Rising Skyline', density: 0.78, brightness: 0.96, rhythmMul: 0.82, leadMul: 0.85, bridge: false },
  { index: 2, name: 'III · Luminous Zenith', density: 1.15, brightness: 1.28, rhythmMul: 1.18, leadMul: 1.15, bridge: true },
  { index: 3, name: 'IV · Nocturnal Dissolve', density: 0.58, brightness: 0.80, rhythmMul: 0.45, leadMul: 0.65, bridge: true },
];

const MODAL_CYCLE_SHIFTS = [0, 5, -2, 7, -4, 3]; // Multi-cycle key center shifts (in semitones)

export const RADIO_STATIONS = [
  {
    id: 'rain-cathedral',
    name: '99.4 FM · Rain on Neon Glass',
    shortName: '99.4 · Rain on Glass',
    artistHint: 'Slow detuned brass swells, rooftop rain-chimes & midnight sub-harmonics',
    bpm: 64,
    baseNote: 48, // C3
    defaultSpace: 0.94,
    defaultWarmth: 0.78,
    defaultPulse: 0.28,
    progressions: [
      { name: 'Cmaj9#11', bass: -12, pad: [0, 4, 7, 11, 14, 18], scale: [0, 2, 4, 6, 7, 9, 11, 14] },
      { name: 'Abmaj7#11', bass: -16, pad: [-4, 0, 3, 7, 10, 14], scale: [-4, -2, 0, 2, 3, 7, 10, 12] },
      { name: 'Fm11', bass: -19, pad: [-7, -4, 0, 3, 7, 10], scale: [-7, -5, -4, -2, 0, 3, 5, 7] },
      { name: 'Dm9', bass: -10, pad: [2, 5, 9, 12, 16], scale: [2, 4, 5, 7, 9, 11, 12, 16] },
    ],
    bridgeProgressions: [
      { name: 'Ebmaj9#11', bass: -9, pad: [3, 7, 10, 14, 17, 21], scale: [3, 5, 7, 9, 10, 12, 14, 17] },
      { name: 'Bmaj7#5', bass: -13, pad: [-1, 3, 7, 10, 14], scale: [-1, 1, 3, 6, 7, 10, 11, 14] },
      { name: 'Gm11', bass: -17, pad: [-5, -2, 2, 5, 9, 12], scale: [-5, -3, -2, 0, 2, 5, 7, 9] },
      { name: 'G13sus4', bass: -17, pad: [-5, 0, 2, 5, 9, 12], scale: [-5, -3, 0, 2, 4, 5, 9, 12] },
    ],
  },
  {
    id: 'velvet-sublevel',
    name: '101.7 FM · Velvet Sub-Level',
    shortName: '101.7 · Velvet Sub-Level',
    artistHint: 'Asynchronous warm fifth pads, crystalline FM bells & tape flutter',
    bpm: 76,
    baseNote: 50, // D3 (+14 cents warm tape drift)
    detuneCents: 14,
    defaultSpace: 0.90,
    defaultWarmth: 0.72,
    defaultPulse: 0.42,
    progressions: [
      { name: 'Dadd9', bass: -12, pad: [0, 7, 14, 16, 21], scale: [0, 2, 4, 7, 9, 11, 14, 16] },
      { name: 'Bm11', bass: -15, pad: [-3, 4, 7, 11, 14, 16], scale: [-3, 0, 2, 4, 7, 9, 11, 14] },
      { name: 'Gmaj9#11', bass: -19, pad: [-7, 0, 4, 7, 11, 14], scale: [-7, -5, -3, 0, 2, 4, 7, 11] },
      { name: 'Asus2/F#', bass: -20, pad: [-5, 2, 4, 9, 14], scale: [-5, -3, 0, 2, 4, 7, 9, 14] },
    ],
    bridgeProgressions: [
      { name: 'Em9', bass: -10, pad: [2, 5, 9, 12, 16], scale: [2, 4, 5, 7, 9, 12, 14, 16] },
      { name: 'F#m11', bass: -8, pad: [4, 7, 11, 14, 19], scale: [4, 6, 7, 9, 11, 14, 16, 19] },
      { name: 'Cmaj9', bass: -14, pad: [-2, 2, 5, 9, 12], scale: [-2, 0, 2, 4, 5, 9, 12, 14] },
      { name: 'A13sus4', bass: -17, pad: [-5, 0, 2, 7, 9], scale: [-5, -3, 0, 2, 4, 7, 9, 12] },
    ],
  },
  {
    id: 'midnight-monorail',
    name: '104.2 FM · Midnight Monorail',
    shortName: '104.2 · Midnight Monorail',
    artistHint: 'Hypnotic 16th-note filter arpeggios, poly-strings & horizon brass',
    bpm: 108,
    baseNote: 45, // A2
    defaultSpace: 0.86,
    defaultWarmth: 0.84,
    defaultPulse: 0.82,
    progressions: [
      { name: 'Am9', bass: -12, pad: [0, 3, 7, 10, 14], scale: [0, 2, 3, 7, 10, 12, 14, 15] },
      { name: 'Fmaj7#11', bass: -16, pad: [-4, 0, 4, 7, 11], scale: [-4, -2, 0, 2, 4, 7, 11, 12] },
      { name: 'Dm11', bass: -19, pad: [-7, -4, 0, 3, 5, 10], scale: [-7, -4, -2, 0, 3, 5, 7, 10] },
      { name: 'Esus4', bass: -17, pad: [-5, 0, 2, 7, 11], scale: [-5, -1, 0, 2, 4, 7, 11, 12] },
    ],
    bridgeProgressions: [
      { name: 'Cmaj9/G', bass: -14, pad: [-9, -5, -2, 2, 7], scale: [-9, -7, -5, -2, 0, 2, 4, 7] },
      { name: 'Abmaj9', bass: -13, pad: [-1, 3, 6, 10, 13], scale: [-1, 1, 3, 5, 6, 10, 13, 15] },
      { name: 'Gm9', bass: -14, pad: [-2, 1, 5, 8, 12], scale: [-2, 0, 1, 5, 8, 10, 12, 15] },
      { name: 'Bbmaj7#11', bass: -11, pad: [1, 5, 9, 12, 16], scale: [1, 3, 5, 7, 9, 12, 14, 16] },
    ],
  },
  {
    id: 'sodium-mercury',
    name: '106.8 FM · Sodium & Mercury',
    shortName: '106.8 · Sodium & Mercury',
    artistHint: 'Resonant liquid filter bubbles, Euclidean micro-beats & vapor pads',
    bpm: 118,
    baseNote: 46, // Bb2
    detuneCents: -9,
    defaultSpace: 0.78,
    defaultWarmth: 0.86,
    defaultPulse: 0.88,
    progressions: [
      { name: 'Bbm9', bass: -12, pad: [0, 3, 7, 10, 14], scale: [0, 2, 3, 5, 7, 10, 12, 14] },
      { name: 'Gbmaj9', bass: -16, pad: [-4, 0, 3, 7, 10], scale: [-4, -2, 0, 3, 5, 7, 10, 12] },
      { name: 'Ebm11', bass: -19, pad: [-7, -4, 0, 3, 5], scale: [-7, -4, -2, 0, 3, 5, 8, 10] },
      { name: 'Fsus4', bass: -17, pad: [-5, 0, 2, 5, 10], scale: [-5, -2, 0, 2, 5, 7, 10, 12] },
    ],
    bridgeProgressions: [
      { name: 'Dbmaj9', bass: -9, pad: [3, 7, 10, 14, 17], scale: [3, 5, 7, 8, 10, 14, 15, 17] },
      { name: 'Ab6/9', bass: -14, pad: [-2, 2, 5, 7, 12], scale: [-2, 0, 2, 5, 7, 9, 10, 12] },
      { name: 'Cm11', bass: -10, pad: [2, 5, 9, 12, 17], scale: [2, 4, 5, 7, 9, 12, 14, 17] },
      { name: 'F7alt', bass: -17, pad: [-5, -1, 3, 6, 10], scale: [-5, -4, -1, 1, 3, 6, 8, 10] },
    ],
  },
  {
    id: 'foghorn-starlight',
    name: '88.9 FM · Foghorn & Starlight',
    shortName: '88.9 · Foghorn & Starlight',
    artistHint: 'Weightless harbor organ drones, breath flutes & tidal fifths',
    bpm: 56,
    baseNote: 43, // G2
    detuneCents: -6,
    defaultSpace: 0.98,
    defaultWarmth: 0.66,
    defaultPulse: 0.16,
    progressions: [
      { name: 'G5add9', bass: -12, pad: [0, 7, 12, 14, 19], scale: [0, 2, 4, 7, 9, 11, 14, 19] },
      { name: 'Em11', bass: -15, pad: [-3, 2, 4, 7, 11, 14], scale: [-3, 0, 2, 4, 7, 9, 11, 14] },
      { name: 'Cmaj9#11', bass: -19, pad: [-7, 0, 4, 6, 11], scale: [-7, -5, -3, 0, 2, 4, 6, 11] },
      { name: 'Dsus2', bass: -17, pad: [-5, 2, 7, 9, 14], scale: [-5, -3, 0, 2, 4, 7, 9, 14] },
    ],
    bridgeProgressions: [
      { name: 'Bbmaj7#11', bass: -9, pad: [3, 7, 10, 14, 16], scale: [3, 5, 7, 9, 10, 12, 14, 17] },
      { name: 'Fmaj9', bass: -14, pad: [-2, 2, 5, 9, 12], scale: [-2, 0, 2, 4, 5, 9, 12, 14] },
      { name: 'Am11', bass: -10, pad: [2, 5, 9, 12, 16], scale: [2, 4, 5, 7, 9, 12, 14, 16] },
      { name: 'D9sus4', bass: -17, pad: [-5, 0, 2, 5, 9], scale: [-5, -3, 0, 2, 5, 7, 9, 12] },
    ],
  },
  {
    id: 'sky-gardens',
    name: '93.1 FM · Hanging Sky-Gardens',
    shortName: '93.1 · Sky-Gardens',
    artistHint: 'Pentatonic plucked harp-bells, evolving wind-flutes & rain droplets',
    bpm: 88,
    baseNote: 51, // Eb3
    detuneCents: 6,
    defaultSpace: 0.92,
    defaultWarmth: 0.82,
    defaultPulse: 0.54,
    progressions: [
      { name: 'Ebmaj9', bass: -12, pad: [0, 4, 7, 11, 14], scale: [0, 2, 4, 7, 9, 11, 14, 16] },
      { name: 'Cm9', bass: -15, pad: [-3, 0, 4, 7, 11], scale: [-3, 0, 2, 4, 7, 9, 12, 14] },
      { name: 'Abadd9', bass: -19, pad: [-7, -3, 0, 4, 7], scale: [-7, -5, -3, 0, 2, 4, 7, 12] },
      { name: 'Bb13sus', bass: -17, pad: [-5, 0, 2, 7, 10], scale: [-5, -3, 0, 2, 4, 7, 9, 12] },
    ],
    bridgeProgressions: [
      { name: 'Fm9', bass: -10, pad: [2, 5, 9, 12, 16], scale: [2, 4, 5, 7, 9, 12, 14, 16] },
      { name: 'Dbmaj7#11', bass: -14, pad: [-2, 2, 5, 8, 12], scale: [-2, 0, 2, 4, 5, 9, 12, 14] },
      { name: 'Gm11', bass: -8, pad: [4, 7, 11, 14, 17], scale: [4, 7, 9, 11, 14, 16, 17, 19] },
      { name: 'C7sus2', bass: -15, pad: [-3, 2, 4, 9, 12], scale: [-3, 0, 2, 4, 7, 9, 12, 14] },
    ],
  },
  {
    id: 'cobalt-atrium',
    name: '95.6 FM · Cobalt Atrium',
    shortName: '95.6 · Cobalt Atrium',
    artistHint: 'Warm electric-tine lounge chords, bowed glass harmonics & dub sub-bass',
    bpm: 74,
    baseNote: 48, // C3
    detuneCents: -4,
    defaultSpace: 0.90,
    defaultWarmth: 0.78,
    defaultPulse: 0.46,
    progressions: [
      { name: 'Cm9', bass: -12, pad: [0, 3, 7, 10, 14], scale: [0, 2, 3, 5, 7, 10, 12, 14] },
      { name: 'Abmaj9', bass: -16, pad: [-4, 0, 3, 7, 10], scale: [-4, -2, 0, 3, 5, 7, 10, 12] },
      { name: 'Fm11', bass: -19, pad: [-7, -4, 0, 3, 5], scale: [-7, -4, -2, 0, 3, 5, 7, 10] },
      { name: 'G7sus4', bass: -17, pad: [-5, 0, 2, 5, 10], scale: [-5, -2, 0, 2, 5, 7, 10, 12] },
    ],
    bridgeProgressions: [
      { name: 'Ebmaj9', bass: -9, pad: [3, 7, 10, 14, 17], scale: [3, 5, 7, 10, 12, 14, 17, 19] },
      { name: 'Dbmaj7#11', bass: -11, pad: [1, 5, 8, 12, 15], scale: [1, 3, 5, 7, 8, 12, 15, 17] },
      { name: 'Bbm11', bass: -14, pad: [-2, 1, 5, 8, 12], scale: [-2, 0, 1, 3, 5, 8, 10, 12] },
      { name: 'Gsus2', bass: -17, pad: [-5, 2, 7, 9, 14], scale: [-5, -3, 0, 2, 5, 7, 9, 14] },
    ],
  },
  {
    id: 'orbital-shipyard',
    name: '108.1 FM · Orbital Shipyard',
    shortName: '108.1 · Orbital Shipyard',
    artistHint: 'Colossal hull sub-drones, metallic dockyard chimes & deep telemetry sonar',
    bpm: 48,
    baseNote: 38, // D2
    detuneCents: -11,
    defaultSpace: 1.08,
    defaultWarmth: 0.62,
    defaultPulse: 0.24,
    progressions: [
      { name: 'D5add9', bass: -12, pad: [0, 7, 12, 14, 19], scale: [0, 2, 3, 7, 9, 10, 14, 19] },
      { name: 'Bbmaj7#11', bass: -16, pad: [-4, 0, 3, 7, 10], scale: [-4, -2, 0, 2, 3, 7, 10, 14] },
      { name: 'Gm11', bass: -19, pad: [-7, -2, 0, 3, 5], scale: [-7, -4, -2, 0, 2, 3, 5, 10] },
      { name: 'Asus4', bass: -17, pad: [-5, 0, 2, 7, 12], scale: [-5, -3, 0, 2, 4, 7, 9, 12] },
    ],
    bridgeProgressions: [
      { name: 'Fmaj9', bass: -9, pad: [3, 7, 10, 14, 17], scale: [3, 5, 7, 9, 10, 14, 16, 17] },
      { name: 'Cm9', bass: -14, pad: [-2, 1, 5, 8, 12], scale: [-2, 0, 1, 5, 7, 8, 12, 14] },
      { name: 'Ebmaj7#11', bass: -11, pad: [1, 5, 8, 12, 16], scale: [1, 3, 5, 7, 8, 10, 12, 16] },
      { name: 'A7sus2', bass: -17, pad: [-5, 2, 5, 9, 12], scale: [-5, -3, 0, 2, 5, 7, 9, 12] },
    ],
  },
  {
    id: 'sunset-overpass',
    name: '90.3 FM · Sunset Overpass',
    shortName: '90.3 · Sunset Overpass',
    artistHint: 'Golden-hour octave basslines, shimmering chorus chords & soaring horizon leads',
    bpm: 114,
    baseNote: 50, // D3
    detuneCents: 4,
    defaultSpace: 0.84,
    defaultWarmth: 0.92,
    defaultPulse: 0.86,
    progressions: [
      { name: 'Dmaj9', bass: -12, pad: [0, 4, 7, 11, 14], scale: [0, 2, 4, 6, 7, 9, 11, 14] },
      { name: 'Bm11', bass: -15, pad: [-3, 0, 4, 7, 9], scale: [-3, -1, 0, 2, 4, 7, 9, 12] },
      { name: 'Gmaj7#11', bass: -19, pad: [-7, -3, 0, 4, 6], scale: [-7, -5, -3, -1, 0, 4, 6, 11] },
      { name: 'A13sus', bass: -17, pad: [-5, 0, 2, 4, 9], scale: [-5, -3, -1, 0, 2, 4, 7, 9] },
    ],
    bridgeProgressions: [
      { name: 'Em9', bass: -10, pad: [2, 5, 9, 12, 16], scale: [2, 4, 5, 7, 9, 11, 12, 16] },
      { name: 'F#m11', bass: -8, pad: [4, 7, 11, 14, 16], scale: [4, 6, 7, 9, 11, 14, 16, 18] },
      { name: 'Cmaj9', bass: -14, pad: [-2, 2, 5, 9, 12], scale: [-2, 0, 2, 4, 5, 9, 12, 14] },
      { name: 'Asus4', bass: -17, pad: [-5, 0, 2, 7, 12], scale: [-5, -3, 0, 2, 4, 7, 9, 12] },
    ],
  },
  {
    id: 'clockwork-observatory',
    name: '97.8 FM · Clockwork Observatory',
    shortName: '97.8 · Observatory',
    artistHint: 'Polymetric celesta mallets, interlocking string canons & astrolabe bells',
    bpm: 96,
    baseNote: 52, // E3
    detuneCents: 3,
    defaultSpace: 0.88,
    defaultWarmth: 0.85,
    defaultPulse: 0.72,
    progressions: [
      { name: 'Em9', bass: -12, pad: [0, 3, 7, 10, 14], scale: [0, 2, 3, 7, 9, 10, 12, 14] },
      { name: 'Cmaj7#11', bass: -16, pad: [-4, 0, 4, 6, 11], scale: [-4, -2, 0, 2, 4, 6, 7, 11] },
      { name: 'Am11', bass: -19, pad: [-7, -4, 0, 3, 5], scale: [-7, -5, -4, 0, 2, 3, 5, 10] },
      { name: 'Bsus4', bass: -17, pad: [-5, 0, 2, 7, 10], scale: [-5, -3, 0, 2, 4, 7, 10, 12] },
    ],
    bridgeProgressions: [
      { name: 'Gmaj9', bass: -9, pad: [3, 7, 11, 14, 17], scale: [3, 5, 7, 9, 11, 14, 16, 17] },
      { name: 'Dadd9', bass: -14, pad: [-2, 2, 5, 9, 12], scale: [-2, 0, 2, 4, 5, 9, 11, 12] },
      { name: 'Fmaj7#11', bass: -11, pad: [1, 5, 8, 11, 16], scale: [1, 3, 5, 7, 8, 11, 12, 16] },
      { name: 'B7alt', bass: -17, pad: [-5, -1, 3, 6, 10], scale: [-5, -4, -1, 1, 3, 6, 8, 10] },
    ],
  },
  {
    id: 'subterranean-arcade',
    name: '103.5 FM · Subterranean Arcade',
    shortName: '103.5 · Sub-Arcade',
    artistHint: 'Crisp pulse-wave arpeggios, syncopated electro-bass & midnight percussion',
    bpm: 128,
    baseNote: 47, // B2
    detuneCents: -5,
    defaultSpace: 0.72,
    defaultWarmth: 0.90,
    defaultPulse: 0.96,
    progressions: [
      { name: 'Bm9', bass: -12, pad: [0, 3, 7, 10, 14], scale: [0, 2, 3, 5, 7, 10, 12, 14] },
      { name: 'Gmaj9', bass: -16, pad: [-4, 0, 3, 7, 10], scale: [-4, -2, 0, 2, 3, 7, 10, 12] },
      { name: 'Em11', bass: -19, pad: [-7, -4, 0, 3, 5], scale: [-7, -5, -4, 0, 2, 3, 5, 10] },
      { name: 'F#7sus4', bass: -17, pad: [-5, 0, 2, 5, 10], scale: [-5, -3, 0, 2, 5, 7, 10, 12] },
    ],
    bridgeProgressions: [
      { name: 'Dmaj9', bass: -9, pad: [3, 7, 10, 14, 17], scale: [3, 5, 7, 9, 10, 14, 16, 17] },
      { name: 'A6/9', bass: -14, pad: [-2, 2, 5, 7, 12], scale: [-2, 0, 2, 5, 7, 9, 10, 12] },
      { name: 'C#m11', bass: -10, pad: [2, 5, 9, 12, 16], scale: [2, 4, 5, 7, 9, 12, 14, 16] },
      { name: 'F#7alt', bass: -17, pad: [-5, -1, 3, 6, 10], scale: [-5, -4, -1, 1, 3, 6, 8, 10] },
    ],
  },
  {
    id: 'glacier-monolith',
    name: '87.5 FM · Glacier & Monolith',
    shortName: '87.5 · Glacier & Monolith',
    artistHint: 'Frozen cathedral fifths, crystalline prism overtones & arctic wind swells',
    bpm: 42,
    baseNote: 41, // F2
    detuneCents: -8,
    defaultSpace: 1.15,
    defaultWarmth: 0.58,
    defaultPulse: 0.10,
    progressions: [
      { name: 'Fmaj9#11', bass: -12, pad: [0, 4, 7, 11, 14, 18], scale: [0, 2, 4, 6, 7, 9, 11, 14] },
      { name: 'Dm11', bass: -15, pad: [-3, 0, 4, 7, 11], scale: [-3, -1, 0, 2, 4, 7, 9, 12] },
      { name: 'Bbmaj9', bass: -19, pad: [-7, -3, 0, 4, 7], scale: [-7, -5, -3, 0, 2, 4, 7, 12] },
      { name: 'Csus2', bass: -17, pad: [-5, 2, 7, 9, 14], scale: [-5, -3, 0, 2, 4, 7, 9, 14] },
    ],
    bridgeProgressions: [
      { name: 'Abmaj7#11', bass: -9, pad: [3, 7, 10, 14, 17], scale: [3, 5, 7, 9, 10, 14, 15, 17] },
      { name: 'Gm11', bass: -10, pad: [2, 5, 9, 12, 16], scale: [2, 4, 5, 7, 9, 12, 14, 16] },
      { name: 'Dbmaj9', bass: -16, pad: [-4, 0, 3, 7, 10], scale: [-4, -2, 0, 3, 5, 7, 10, 12] },
      { name: 'C9sus4', bass: -17, pad: [-5, 0, 2, 5, 9], scale: [-5, -3, 0, 2, 5, 7, 9, 12] },
    ],
  },
  {
    id: 'monsoon-market',
    name: '105.4 FM · Monsoon Market',
    shortName: '105.4 · Monsoon Market',
    artistHint: 'Hollow wooden mallets, syncopated rain-rim grooves & silk-flute melodies',
    bpm: 102,
    baseNote: 49, // Db3
    detuneCents: 5,
    defaultSpace: 0.85,
    defaultWarmth: 0.88,
    defaultPulse: 0.78,
    progressions: [
      { name: 'Dbadd9', bass: -12, pad: [0, 4, 7, 9, 14], scale: [0, 2, 4, 7, 9, 12, 14, 16] },
      { name: 'Bbm9', bass: -15, pad: [-3, 0, 4, 7, 11], scale: [-3, 0, 2, 4, 7, 9, 12, 14] },
      { name: 'Gbmaj9', bass: -19, pad: [-7, -3, 0, 4, 7], scale: [-7, -5, -3, 0, 2, 4, 7, 12] },
      { name: 'Ab13sus', bass: -17, pad: [-5, 0, 2, 4, 9], scale: [-5, -3, 0, 2, 4, 7, 9, 12] },
    ],
    bridgeProgressions: [
      { name: 'Ebm11', bass: -10, pad: [2, 5, 9, 12, 16], scale: [2, 4, 5, 7, 9, 12, 14, 16] },
      { name: 'Bmaj7#11', bass: -14, pad: [-2, 2, 5, 8, 12], scale: [-2, 0, 2, 4, 5, 9, 12, 14] },
      { name: 'Fm9', bass: -8, pad: [4, 7, 11, 14, 17], scale: [4, 7, 9, 11, 14, 16, 17, 19] },
      { name: 'Ab7sus2', bass: -17, pad: [-5, 2, 5, 9, 12], scale: [-5, -3, 0, 2, 5, 7, 9, 12] },
    ],
  },
  {
    id: 'solar-sail',
    name: '91.9 FM · Solar Sail Serenata',
    shortName: '91.9 · Solar Sail',
    artistHint: 'Luminous Lydian harp cascades, warm string swells & weightless orbital chimes',
    bpm: 82,
    baseNote: 53, // F3
    detuneCents: 2,
    defaultSpace: 0.96,
    defaultWarmth: 0.86,
    defaultPulse: 0.48,
    progressions: [
      { name: 'Fmaj7#11', bass: -12, pad: [0, 4, 7, 11, 18], scale: [0, 2, 4, 6, 7, 9, 11, 14] },
      { name: 'G6/9', bass: -10, pad: [2, 6, 9, 11, 16], scale: [2, 4, 6, 7, 9, 11, 14, 16] },
      { name: 'Em11', bass: -13, pad: [-1, 2, 6, 9, 14], scale: [-1, 0, 2, 4, 6, 9, 11, 14] },
      { name: 'Am9', bass: -16, pad: [-4, 0, 3, 7, 11], scale: [-4, -2, 0, 2, 4, 7, 9, 11] },
    ],
    bridgeProgressions: [
      { name: 'Dbmaj7#11', bass: -16, pad: [-4, 0, 3, 7, 14], scale: [-4, -2, 0, 2, 3, 7, 10, 12] },
      { name: 'Bbmaj9', bass: -19, pad: [-7, -3, 0, 4, 7], scale: [-7, -5, -3, 0, 2, 4, 7, 12] },
      { name: 'Dm9', bass: -15, pad: [-3, 0, 4, 7, 11], scale: [-3, -1, 0, 2, 4, 7, 9, 12] },
      { name: 'Csus4', bass: -17, pad: [-5, 0, 2, 7, 12], scale: [-5, -3, 0, 2, 4, 7, 9, 12] },
    ],
  },
];

export const MUSIC_SYNC_PRESETS = [
  { id: 'off', label: 'World Sync · Off', strength: 0, traffic: false, clouds: false, diurnal: false, lights: false, atmo: false },
  { id: 'all', label: 'World Sync · Full Symphonic City (All)', strength: 1.0, traffic: true, clouds: true, diurnal: true, lights: true, atmo: true },
  { id: 'kinetic', label: 'World Sync · Tempo → Traffic & Beat Lights', strength: 1.0, traffic: true, clouds: false, diurnal: false, lights: true, atmo: false },
  { id: 'sky', label: 'World Sync · Chords → Clouds & Diurnal Sky', strength: 1.0, traffic: false, clouds: true, diurnal: true, lights: false, atmo: true },
  { id: 'subtle', label: 'World Sync · Subtle Ambient Coupling', strength: 0.55, traffic: true, clouds: true, diurnal: false, lights: true, atmo: true },
  { id: 'custom', label: 'World Sync · Custom Channels', strength: 1.0, traffic: false, clouds: false, diurnal: false, lights: false, atmo: false },
];

export function midiToHz(midi, centsOffset = 0) {
  return 440 * Math.pow(2, (midi - 69 + centsOffset / 100) / 12);
}

/**
 * Pure-code algorithmic stereo shimmer/velvet hall impulse generator.
 * Deterministic given `seed`, zero external audio samples.
 */
export function buildSpaceImpulseData(sampleRate = 44100, durationSec = 5.4, seed = 4417) {
  const length = Math.max(256, Math.floor(sampleRate * durationSec));
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const rnd = mulberry32(seed ^ 0x6a09e667);

  // 1. Distinct early architectural reflections (11..89 ms)
  const earlyMs = [13, 19, 29, 37, 47, 61, 73, 89];
  for (let i = 0; i < earlyMs.length; i++) {
    const idxL = Math.min(length - 1, Math.floor((earlyMs[i] * 0.001) * sampleRate));
    const idxR = Math.min(length - 1, Math.floor(((earlyMs[i] + 3.7 * ((i % 2) ? 1 : -1)) * 0.001) * sampleRate));
    const gain = 0.28 * Math.pow(0.84, i);
    left[idxL] += (i % 2 === 0 ? 1 : -1) * gain;
    right[idxR] += (i % 3 === 0 ? -1 : 1) * gain;
  }

  // 2. Velvet decorrelated late diffuse field with progressive high-frequency air absorption
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const u = i / length;
    const preFade = Math.min(1, t / 0.032);
    const env = preFade * (0.58 * Math.exp(-t * 1.45) + 0.42 * Math.exp(-t * 0.62));
    const damp = 0.52 - 0.38 * u;
    const rawL = (rnd() * 2 - 1);
    const rawR = (rnd() * 2 - 1);
    const mod = 1 + 0.08 * Math.sin(t * 2.3);
    lpL += (rawL - lpL) * damp;
    lpR += (rawR - lpR) * damp;
    left[i] += lpL * env * 0.36 * mod;
    right[i] += lpR * env * 0.36 * (2 - mod);
  }
  return { left, right, sampleRate, length };
}

/** Soft analog tape saturation curve (tanh-like warmth, zero harsh digital clipping). */
function makeWarmDriveCurve(amount = 1.4, samples = 512) {
  const curve = new Float32Array(samples);
  const norm = Math.tanh(amount) || 1;
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / norm;
  }
  return curve;
}

/** Evaluate deterministic harmonic state (including movement & modal evolution) for tests & UI inspection. */
export function evalStationHarmony(stationOrIdx = 0, stepIndex = 0, { useBridge = false, modalShift = 0 } = {}) {
  const st = (stationOrIdx && typeof stationOrIdx === 'object' && Array.isArray(stationOrIdx.progressions))
    ? stationOrIdx
    : RADIO_STATIONS[((Number(stationOrIdx) % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length];
  const bank = (useBridge && Array.isArray(st.bridgeProgressions) && st.bridgeProgressions.length)
    ? st.bridgeProgressions
    : st.progressions;
  const prog = bank[((stepIndex % bank.length) + bank.length) % bank.length];
  const cents = st.detuneCents || 0;
  const rootNote = st.baseNote + modalShift;
  const padMidi = prog.pad.map((semi) => rootNote + 12 + semi);
  return {
    station: st,
    chordName: modalShift === 0 ? prog.name : `${prog.name} (${modalShift > 0 ? '+' : ''}${modalShift})`,
    bassMidi: rootNote + prog.bass,
    bassHz: midiToHz(rootNote + prog.bass, cents),
    padMidi,
    padHz: padMidi.map((m) => midiToHz(m, cents)),
    scaleMidi: prog.scale.map((semi) => rootNote + 12 + semi),
  };
}

/**
 * Modular Pure-Code Synthesizer & Evolving Space-Ambient Radio Controller.
 */
export class ModularRadioEngine {
  constructor({
    seed = 4417,
    station = 0,
    volume = 0.68,
    space = 0.90,
    warmth = 0.80,
    pulse = 0.55,
    cityReactivity = 0.65,
    playlistMode = 'loop',
    playlistInterval = 75,
    AudioContextClass = null,
  } = {}) {
    this.seed = seed >>> 0;
    this.rnd = mulberry32(this.seed ^ 0x51f2d39b);
    this._AudioContextClass = AudioContextClass;
    const n = RADIO_STATIONS.length;
    this.stationIndex = ((Math.round(Number(station) || 0) % n) + n) % n;
    this.playing = false;

    // User-tunable modular parameters
    this.volume = Math.max(0, Math.min(1.2, Number(volume)));
    this.space = Math.max(0, Math.min(1.5, Number(space)));     // 0 .. 1.5 reverb lushness & delay feedback
    this.warmth = Math.max(0, Math.min(1.5, Number(warmth)));   // 0 .. 1.5 analog filter cutoff / brilliance
    this.pulse = Math.max(0, Math.min(1.5, Number(pulse)));     // 0 .. 1.5 sequencer & micro-percussion density (0 = beatless ambient!)
    this.cityReact = Math.max(0, Math.min(1.0, Number(cityReactivity)));

    // Playlist Auto-DJ state ('loop' = hold station, 'seq' = sequential crossfade, 'shuffle' = non-repeating shuffle crossfade)
    this.playlistMode = ['loop', 'seq', 'shuffle'].includes(playlistMode) ? playlistMode : 'seq';
    this.playlistInterval = Math.max(15, Math.min(300, Number(playlistInterval) || 75));
    this._playlistElapsed = 0;
    this._shuffleBag = [];
    this._xfadeActive = false;
    this._xfadeProgress = 0;
    this._xfadeSwitched = false;
    this._xfadeTargetIdx = -1;
    this.onStationAutoSwitch = null;

    // City telemetry state (fed live from main loop)
    this._cityAlt01 = 0.25;
    this._cityNight01 = 0.75;
    this._citySpeed01 = 0.20;

    // Web Audio graph handles (lazily initialized on user gesture)
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this._streamDest = null;
    this._dryBus = null;
    this._reverbSend = null;
    this._delaySend = null;
    this._delayFeedback = null;
    this._masterFilter = null;
    this._windGain = null;
    this._windFilter = null;
    this._noiseBuffer = null;

    // Long-form generative evolution & phrase state
    this._step16 = 0;
    this._barCount = 0;
    this._chordIdx = 0;
    this._chordChangeSeq = 0;
    this._movementIdx = 0;
    this._cycleCount = 0;
    this._modalShift = 0;
    this._evolutionPhase = 0; // continuous 0..1 position across the 64-bar symphonic arc
    this._motifDegs = [0, 2, 4, 3]; // evolving 4-note call-and-response seed
    this._nextStepTime = 0;
    this._driftVoiceNext = [0, 0, 0, 0];
    this._lastLeadMidi = null;
    this._simPhase = 0;
    this._beatEnv = 0;
    this._chordFlashEnv = 0;
    this._lowEnv = 0;
    this._highEnv = 0;
    this._freqBins = new Uint8Array(64);
    this._waveBins = new Uint8Array(64);
    this._currentChordName = RADIO_STATIONS[0].progressions[0].name;
  }

  get station() {
    return RADIO_STATIONS[this.stationIndex] || RADIO_STATIONS[0];
  }

  get currentChordName() {
    return this._currentChordName;
  }

  get movementIndex() {
    return this._movementIdx;
  }

  get movementName() {
    return RADIO_MOVEMENTS[this._movementIdx]?.name || RADIO_MOVEMENTS[0].name;
  }

  get evolutionPhase() {
    return this._evolutionPhase;
  }

  get isAvailable() {
    return Boolean(this._AudioContextClass) || (typeof globalThis !== 'undefined' && Boolean(globalThis.AudioContext || globalThis.webkitAudioContext));
  }

  _initGraph() {
    if (this.ctx) return true;
    const AC = this._AudioContextClass || (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext));
    if (!AC) return false;

    const ctx = new AC();
    this.ctx = ctx;

    // 1. Master Limiter / Glue Compressor -> Master Filter -> Master Gain -> Analyser -> Destination
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 4.5;
    comp.attack.value = 0.012;
    comp.release.value = 0.28;

    const masterFilter = ctx.createBiquadFilter();
    masterFilter.type = 'lowpass';
    masterFilter.frequency.value = 6800;
    masterFilter.Q.value = 0.55;
    this._masterFilter = masterFilter;

    const saturator = ctx.createWaveShaper();
    saturator.curve = makeWarmDriveCurve(1.28, 512);
    saturator.oversample = '2x';

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.0001;
    this.masterGain = masterGain;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.82;
    this.analyser = analyser;
    this._freqBins = new Uint8Array(analyser.frequencyBinCount);
    this._waveBins = new Uint8Array(analyser.frequencyBinCount);

    saturator.connect(masterFilter);
    masterFilter.connect(comp);
    comp.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
    if (typeof ctx.createMediaStreamDestination === 'function') {
      this._streamDest = ctx.createMediaStreamDestination();
      masterGain.connect(this._streamDest);
    }

    // 2. Dry Voice Bus
    const dryBus = ctx.createGain();
    dryBus.gain.value = 0.78;
    dryBus.connect(saturator);
    this._dryBus = dryBus;

    // 3. Stereo Analog Tape Wow-and-Flutter Ping-Pong Delay Bus
    const delaySend = ctx.createGain();
    delaySend.gain.value = 0.36;
    const delayL = ctx.createDelay(2.0);
    const delayR = ctx.createDelay(2.0);
    delayL.delayTime.value = 0.375;
    delayR.delayTime.value = 0.505;

    const wowOsc = ctx.createOscillator();
    const wowGainL = ctx.createGain();
    const wowGainR = ctx.createGain();
    wowOsc.type = 'sine';
    wowOsc.frequency.value = 0.38;
    wowGainL.gain.value = 0.0014;
    wowGainR.gain.value = -0.0017;
    wowOsc.connect(wowGainL);
    wowOsc.connect(wowGainR);
    wowGainL.connect(delayL.delayTime);
    wowGainR.connect(delayR.delayTime);
    wowOsc.start();

    const tapeLP = ctx.createBiquadFilter();
    tapeLP.type = 'lowpass';
    tapeLP.frequency.value = 2650;
    const tapeHP = ctx.createBiquadFilter();
    tapeHP.type = 'highpass';
    tapeHP.frequency.value = 135;

    const fbGain = ctx.createGain();
    fbGain.value = 0.42;
    fbGain.gain.value = 0.42;
    this._delayFeedback = fbGain;

    const merge = ctx.createChannelMerger(2);
    delaySend.connect(tapeHP);
    tapeHP.connect(delayL);
    delayL.connect(delayR);
    delayR.connect(tapeLP);
    tapeLP.connect(fbGain);
    fbGain.connect(delayL);

    delayL.connect(merge, 0, 0);
    delayR.connect(merge, 0, 1);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.54;
    merge.connect(delayOut);
    delayOut.connect(saturator);
    this._delaySend = delaySend;

    // 4. Algorithmic Stereo Shimmer Hall Reverb Bus
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.65;
    const preDelay = ctx.createDelay(0.25);
    preDelay.delayTime.value = 0.038;
    const revHP = ctx.createBiquadFilter();
    revHP.type = 'highpass';
    revHP.frequency.value = 110;
    const revLP = ctx.createBiquadFilter();
    revLP.type = 'lowpass';
    revLP.frequency.value = 4600;

    const convolver = ctx.createConvolver();
    const ir = buildSpaceImpulseData(ctx.sampleRate, 5.2, this.seed);
    const irBuf = ctx.createBuffer(2, ir.length, ctx.sampleRate);
    irBuf.getChannelData(0).set(ir.left);
    irBuf.getChannelData(1).set(ir.right);
    convolver.buffer = irBuf;

    const revOut = ctx.createGain();
    revOut.gain.value = 0.92;
    reverbSend.connect(preDelay);
    preDelay.connect(revHP);
    revHP.connect(convolver);
    convolver.connect(revLP);
    revLP.connect(revOut);
    revOut.connect(saturator);
    delayOut.connect(reverbSend);
    this._reverbSend = reverbSend;
    this._revLP = revLP;

    // 5. Shared Pure-Code Pink/Velvet Noise Buffer
    const nLen = Math.floor(ctx.sampleRate * 3.0);
    const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nData = nBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < nLen; i++) {
      const w = this.rnd() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      nData[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
    }
    this._noiseBuffer = nBuf;

    // 6. Continuous Atmospheric Mist / Rain-Wind Breath Module
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = nBuf;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 1.8;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.018;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(reverbSend);
    windSrc.start();
    this._windFilter = windFilter;
    this._windGain = windGain;

    this._syncBusLevels();
    return true;
  }

  _syncBusLevels() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const react = this.cityReact;
    const altBoost = react * this._cityAlt01;
    const nightWarm = react * (this._cityNight01 - 0.5) * 0.22;
    const mov = RADIO_MOVEMENTS[this._movementIdx] || RADIO_MOVEMENTS[0];
    // Slow incommensurate timbral LFO breathing across minutes
    const slowTimbreLfo = 0.08 * Math.sin(this._simPhase * 0.071) + 0.05 * Math.cos(this._simPhase * 0.043);

    const targetVol = this.playing ? Math.max(0, Math.min(1.2, this.volume)) * 0.82 : 0.0001;
    this.masterGain.gain.setTargetAtTime(targetVol, now, 0.08);

    // Smooth 4.4s ambient crossfade veil (`0 -> 1 -> 0`) during playlist track transitions
    const veil = this._xfadeActive ? Math.sin(Math.max(0, Math.min(1, this._xfadeProgress)) * Math.PI) : 0;
    if (this._dryBus) {
      this._dryBus.gain.setTargetAtTime(0.78 * (1 - 0.74 * veil), now, 0.10);
    }

    const spaceEff = Math.max(0, Math.min(1.65, this.space + altBoost * 0.28 + (mov.index === 3 ? 0.14 : 0) + veil * 0.42));
    this._reverbSend.gain.setTargetAtTime(0.18 + spaceEff * 0.62, now, 0.12);
    this._delaySend.gain.setTargetAtTime(0.12 + spaceEff * 0.30, now, 0.12);
    this._delayFeedback.gain.setTargetAtTime(Math.min(0.68, 0.20 + spaceEff * 0.28), now, 0.12);

    const warmEff = Math.max(0.08, Math.min(1.65, (this.warmth * mov.brightness) + slowTimbreLfo + altBoost * 0.24 - nightWarm * 0.18));
    const cutoff = 680 * Math.pow(14.5, warmEff * 0.78) * (1 - 0.56 * veil);
    this._masterFilter.frequency.setTargetAtTime(Math.max(260, Math.min(16500, cutoff)), now, 0.14);
    if (this._revLP) {
      this._revLP.frequency.setTargetAtTime(Math.min(9500, 1800 + warmEff * 3600 + altBoost * 1800), now, 0.2);
    }
    if (this._windGain && this._windFilter) {
      const windLvl = (0.007 + spaceEff * 0.013 + react * this._citySpeed01 * 0.024) * (this.playing ? 1 : 0);
      this._windGain.gain.setTargetAtTime(windLvl, now, 0.25);
      this._windFilter.frequency.setTargetAtTime(280 + altBoost * 920 + Math.sin(now * 0.19) * 110, now, 0.25);
    }
  }

  /* ========================================================= SYNTH MODULES */

  /** Module 1: Polyphonic detuned dual-saw + sub-triangle brass-string pad voice. */
  _triggerBrassPad(freq, when, dur, vel = 0.22, { brightness = 1.0, pan = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const stopAt = when + dur + 2.8;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    subOsc.type = 'triangle';

    const drift = (this.rnd() - 0.5) * 4.5;
    osc1.frequency.setValueAtTime(freq, when);
    osc2.frequency.setValueAtTime(freq, when);
    subOsc.frequency.setValueAtTime(freq * 0.5, when);
    osc1.detune.setValueAtTime(-7.2 + drift, when);
    osc2.detune.setValueAtTime(7.6 + drift, when);
    osc1.detune.linearRampToValueAtTime(-4.1 - drift, when + dur);
    osc2.detune.linearRampToValueAtTime(9.4 + drift * 0.5, when + dur);

    const subGain = ctx.createGain();
    subGain.gain.value = 0.34;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = Math.max(55, freq * 0.45);

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.Q.value = 1.65;
    const warmK = 0.45 + this.warmth * 0.85;
    const fBase = Math.max(160, freq * 1.45 * warmK);
    const fPeak = Math.min(9500, freq * (4.8 + brightness * 3.6) * warmK);
    lpf.frequency.setValueAtTime(fBase, when);
    lpf.frequency.exponentialRampToValueAtTime(fPeak, when + dur * 0.42);
    lpf.frequency.exponentialRampToValueAtTime(Math.max(180, fBase * 1.15), stopAt - 0.1);

    const env = ctx.createGain();
    const atk = Math.min(2.4, dur * 0.34);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(vel, when + atk);
    env.gain.setValueAtTime(vel * 0.88, when + dur * 0.72);
    env.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    const outNode = this._makePanner(pan);
    osc1.connect(hpf);
    osc2.connect(hpf);
    subOsc.connect(subGain);
    subGain.connect(hpf);
    hpf.connect(lpf);
    lpf.connect(env);
    env.connect(outNode);
    outNode.connect(this._dryBus);
    outNode.connect(this._reverbSend);
    outNode.connect(this._delaySend);

    osc1.start(when); osc2.start(when); subOsc.start(when);
    osc1.stop(stopAt + 0.05); osc2.stop(stopAt + 0.05); subOsc.stop(stopAt + 0.05);
  }

  /** Module 2: Expressive portamento solo ribbon-brass lead with delayed vibrato. */
  _triggerRibbonLead(freqFrom, freqTo, when, dur, vel = 0.18) {
    const ctx = this.ctx;
    if (!ctx) return;
    const stopAt = when + dur + 1.8;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    const glideT = Math.min(0.38, dur * 0.28);
    osc1.frequency.setValueAtTime(Math.max(40, freqFrom), when);
    osc2.frequency.setValueAtTime(Math.max(40, freqFrom * 1.0025), when);
    osc1.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), when + glideT);
    osc2.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo * 1.0028), when + glideT);

    const vib = ctx.createOscillator();
    const vibG = ctx.createGain();
    vib.type = 'sine';
    vib.frequency.value = 5.2 + (this.rnd() - 0.5) * 0.6;
    vibG.gain.setValueAtTime(0.0001, when);
    vibG.gain.linearRampToValueAtTime(freqTo * 0.0095, when + dur * 0.55);
    vibG.gain.linearRampToValueAtTime(0.0001, stopAt);
    vib.connect(vibG);
    vibG.connect(osc1.frequency);
    vibG.connect(osc2.frequency);

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.Q.value = 3.1;
    const warmK = 0.5 + this.warmth * 0.95;
    lpf.frequency.setValueAtTime(Math.max(240, freqTo * 1.4), when);
    lpf.frequency.exponentialRampToValueAtTime(Math.min(8200, freqTo * 7.5 * warmK), when + dur * 0.38);
    lpf.frequency.exponentialRampToValueAtTime(Math.max(260, freqTo * 1.6), stopAt - 0.05);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(vel, when + Math.min(0.42, dur * 0.24));
    env.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    const pan = this._makePanner((this.rnd() - 0.5) * 0.45);
    osc1.connect(lpf);
    osc2.connect(lpf);
    lpf.connect(env);
    env.connect(pan);
    pan.connect(this._dryBus);
    pan.connect(this._reverbSend);
    pan.connect(this._delaySend);

    osc1.start(when); osc2.start(when); vib.start(when);
    osc1.stop(stopAt + 0.05); osc2.stop(stopAt + 0.05); vib.stop(stopAt + 0.05);
  }

  /** Module 3: Warm tape-drifting triangle + pure fifth shimmer pad. */
  _triggerVelvetPad(freq, when, dur, vel = 0.20, pan = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const stopAt = when + dur + 3.4;

    const oFund = ctx.createOscillator();
    const oWarm = ctx.createOscillator();
    const oFifth = ctx.createOscillator();
    oFund.type = 'triangle';
    oWarm.type = 'sine';
    oFifth.type = 'triangle';

    const tapeDrift = (this.rnd() - 0.5) * 9.0;
    oFund.frequency.setValueAtTime(freq, when);
    oWarm.frequency.setValueAtTime(freq, when);
    oFifth.frequency.setValueAtTime(freq * 1.4983, when);
    oFund.detune.setValueAtTime(tapeDrift - 4.5, when);
    oWarm.detune.setValueAtTime(tapeDrift + 5.2, when);
    oFund.detune.linearRampToValueAtTime(-tapeDrift + 3.0, stopAt);

    const fifthGain = ctx.createGain();
    fifthGain.gain.value = 0.22;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.Q.value = 0.9;
    const fCut = Math.min(4800, Math.max(240, freq * (2.6 + this.warmth * 3.4)));
    lpf.frequency.setValueAtTime(fCut * 0.65, when);
    lpf.frequency.exponentialRampToValueAtTime(fCut, when + dur * 0.5);
    lpf.frequency.exponentialRampToValueAtTime(fCut * 0.55, stopAt - 0.05);

    const env = ctx.createGain();
    const atk = Math.min(3.2, dur * 0.42);
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(vel, when + atk);
    env.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    const panner = this._makePanner(pan);
    oFund.connect(lpf);
    oWarm.connect(lpf);
    oFifth.connect(fifthGain);
    fifthGain.connect(lpf);
    lpf.connect(env);
    env.connect(panner);
    panner.connect(this._dryBus);
    panner.connect(this._reverbSend);
    panner.connect(this._delaySend);

    oFund.start(when); oWarm.start(when); oFifth.start(when);
    oFund.stop(stopAt + 0.05); oWarm.stop(stopAt + 0.05); oFifth.stop(stopAt + 0.05);
  }

  /** Module 4: 2-Operator Crystalline FM Glass Bell Voice. */
  _triggerFMBell(freq, when, dur = 2.4, vel = 0.14, { ratio = 2.0, index = 2.2, pan = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const stopAt = when + dur;

    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    carrier.type = 'sine';
    mod.type = 'sine';

    carrier.frequency.setValueAtTime(freq, when);
    mod.frequency.setValueAtTime(freq * ratio, when);

    const peakDev = freq * index * (0.55 + this.warmth * 0.65);
    modGain.gain.setValueAtTime(Math.max(1, peakDev), when);
    modGain.gain.exponentialRampToValueAtTime(Math.max(0.5, freq * 0.08), when + Math.min(0.65, dur * 0.45));

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(vel, when + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    const panner = this._makePanner(pan);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(env);
    env.connect(panner);
    panner.connect(this._dryBus);
    panner.connect(this._delaySend);
    panner.connect(this._reverbSend);

    carrier.start(when); mod.start(when);
    carrier.stop(stopAt + 0.04); mod.stop(stopAt + 0.04);
  }

  /** Module 5: Resonant Liquid Filter Sequencer Pluck Voice. */
  _triggerFilterSeq(freq, when, dur = 0.24, vel = 0.15, { accent = false, wave = 'sawtooth', pan = 0, slideFrom = null } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const stopAt = when + dur + 0.08;

    const osc = ctx.createOscillator();
    osc.type = wave;
    if (slideFrom && slideFrom > 20) {
      osc.frequency.setValueAtTime(slideFrom, when);
      osc.frequency.exponentialRampToValueAtTime(freq, when + Math.min(0.065, dur * 0.5));
    } else {
      osc.frequency.setValueAtTime(freq, when);
    }

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.Q.value = accent ? 9.5 : 5.2;
    const warmK = 0.45 + this.warmth * 0.95;
    const fMin = Math.max(110, freq * 1.15);
    const fMax = Math.min(9800, freq * (accent ? 9.5 : 5.2) * warmK);
    lpf.frequency.setValueAtTime(fMax, when);
    lpf.frequency.exponentialRampToValueAtTime(fMin, when + dur * 0.88);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(vel * (accent ? 1.28 : 1.0), when + 0.007);
    env.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    const panner = this._makePanner(pan);
    osc.connect(lpf);
    lpf.connect(env);
    env.connect(panner);
    panner.connect(this._dryBus);
    panner.connect(this._delaySend);
    if (accent) panner.connect(this._reverbSend);

    osc.start(when);
    osc.stop(stopAt + 0.03);
  }

  /** Module 6: Plucked Harp-String & Warm Wooden Body Voice. */
  _triggerPluckedHarp(freq, when, dur = 1.9, vel = 0.13, pan = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const stopAt = when + dur;

    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'triangle';
    o2.type = 'sawtooth';
    o1.frequency.setValueAtTime(freq, when);
    o2.frequency.setValueAtTime(freq * 2.0, when);
    o2.detune.setValueAtTime(3.5, when);

    const o2Gain = ctx.createGain();
    o2Gain.gain.setValueAtTime(0.28, when);
    o2Gain.gain.exponentialRampToValueAtTime(0.02, when + Math.min(0.35, dur * 0.3));

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.Q.value = 1.8;
    lpf.frequency.setValueAtTime(Math.min(7200, freq * (5.5 + this.warmth * 3.0)), when);
    lpf.frequency.exponentialRampToValueAtTime(Math.max(220, freq * 1.3), stopAt);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(vel, when + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    const panner = this._makePanner(pan);
    o1.connect(lpf);
    o2.connect(o2Gain);
    o2Gain.connect(lpf);
    lpf.connect(env);
    env.connect(panner);
    panner.connect(this._dryBus);
    panner.connect(this._delaySend);
    panner.connect(this._reverbSend);

    o1.start(when); o2.start(when);
    o1.stop(stopAt + 0.04); o2.stop(stopAt + 0.04);
  }

  /** Module 7: Airy Breath-Pipe / Harmonic Flute Voice. */
  _triggerBreathFlute(freq, when, dur = 2.8, vel = 0.12, pan = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const stopAt = when + dur + 0.9;

    const pipe = ctx.createOscillator();
    const oct = ctx.createOscillator();
    pipe.type = 'sine';
    oct.type = 'triangle';
    pipe.frequency.setValueAtTime(freq, when);
    oct.frequency.setValueAtTime(freq * 2.0, when);

    const octG = ctx.createGain();
    octG.gain.value = 0.14;

    const vib = ctx.createOscillator();
    const vibG = ctx.createGain();
    vib.type = 'sine';
    vib.frequency.value = 4.6;
    vibG.gain.setValueAtTime(0.0001, when);
    vibG.gain.linearRampToValueAtTime(freq * 0.007, when + dur * 0.5);
    vib.connect(vibG);
    vibG.connect(pipe.frequency);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(vel, when + Math.min(0.55, dur * 0.32));
    env.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    const panner = this._makePanner(pan);
    pipe.connect(env);
    oct.connect(octG);
    octG.connect(env);
    env.connect(panner);
    panner.connect(this._dryBus);
    panner.connect(this._reverbSend);
    panner.connect(this._delaySend);

    if (this._noiseBuffer) {
      const chiff = ctx.createBufferSource();
      chiff.buffer = this._noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(5400, freq * 2.0);
      bp.Q.value = 4.5;
      const cEnv = ctx.createGain();
      cEnv.gain.setValueAtTime(vel * 0.25, when);
      cEnv.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);
      chiff.connect(bp);
      bp.connect(cEnv);
      cEnv.connect(panner);
      chiff.start(when, this.rnd() * 1.5, 0.18);
    }

    pipe.start(when); oct.start(when); vib.start(when);
    pipe.stop(stopAt + 0.05); oct.stop(stopAt + 0.05); vib.stop(stopAt + 0.05);
  }

  /** Module 8: Deep Sub-Bass Pedal Drone. */
  _triggerSubBass(freq, when, dur = 4.5, vel = 0.24) {
    const ctx = this.ctx;
    if (!ctx) return;
    const stopAt = when + dur + 0.6;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc.type = 'sine';
    osc2.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, when);
    osc2.frequency.setValueAtTime(freq, when);

    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.22;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = Math.max(95, freq * 2.6);
    lpf.Q.value = 1.2;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(vel, when + Math.min(0.65, dur * 0.22));
    env.gain.setValueAtTime(vel * 0.85, when + dur * 0.78);
    env.gain.exponentialRampToValueAtTime(0.0001, stopAt);

    osc.connect(lpf);
    osc2.connect(sawGain);
    sawGain.connect(lpf);
    lpf.connect(env);
    env.connect(this._dryBus);
    osc.start(when); osc2.start(when);
    osc.stop(stopAt + 0.04); osc2.stop(stopAt + 0.04);
  }

  /** Module 9: Pure-Code Soft Percussion (sub kick, brushed hat, resonant droplet rim). */
  _triggerMicroDrum(kind, when, vel = 0.18) {
    const ctx = this.ctx;
    if (!ctx || this.pulse <= 0.02) return;
    const mov = RADIO_MOVEMENTS[this._movementIdx] || RADIO_MOVEMENTS[0];
    const v = vel * Math.min(1.35, this.pulse * mov.rhythmMul);
    if (v <= 0.005) return;

    if (kind === 'kick') {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(126, when);
      osc.frequency.exponentialRampToValueAtTime(43, when + 0.085);
      osc.frequency.exponentialRampToValueAtTime(34, when + 0.34);
      env.gain.setValueAtTime(0.0001, when);
      env.gain.linearRampToValueAtTime(v * 1.15, when + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, when + 0.36);
      osc.connect(env);
      env.connect(this._dryBus);
      osc.start(when);
      osc.stop(when + 0.38);
      return;
    }

    if (kind === 'rim' || kind === 'snare') {
      const body = ctx.createOscillator();
      const bEnv = ctx.createGain();
      body.type = 'triangle';
      body.frequency.setValueAtTime(kind === 'rim' ? 390 : 215, when);
      body.frequency.exponentialRampToValueAtTime(kind === 'rim' ? 195 : 122, when + 0.06);
      bEnv.gain.setValueAtTime(v * 0.55, when);
      bEnv.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);
      body.connect(bEnv);
      bEnv.connect(this._dryBus);
      bEnv.connect(this._reverbSend);
      body.start(when);
      body.stop(when + 0.11);

      if (this._noiseBuffer) {
        const ns = ctx.createBufferSource();
        ns.buffer = this._noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = kind === 'rim' ? 2400 : 1650;
        bp.Q.value = kind === 'rim' ? 3.2 : 1.1;
        const nEnv = ctx.createGain();
        const nDur = kind === 'rim' ? 0.055 : 0.16;
        nEnv.gain.setValueAtTime(v * 0.65, when);
        nEnv.gain.exponentialRampToValueAtTime(0.0001, when + nDur);
        ns.connect(bp);
        bp.connect(nEnv);
        nEnv.connect(this._dryBus);
        nEnv.connect(this._delaySend);
        ns.start(when, this.rnd() * 1.8, nDur + 0.03);
      }
      return;
    }

    if (kind === 'hat' && this._noiseBuffer) {
      const ns = ctx.createBufferSource();
      ns.buffer = this._noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6800;
      const nEnv = ctx.createGain();
      const hDur = 0.038 + this.rnd() * 0.045;
      nEnv.gain.setValueAtTime(v * 0.36, when);
      nEnv.gain.exponentialRampToValueAtTime(0.0001, when + hDur);
      const pan = this._makePanner((this.rnd() - 0.5) * 0.6);
      ns.connect(hp);
      hp.connect(nEnv);
      nEnv.connect(pan);
      pan.connect(this._dryBus);
      pan.connect(this._delaySend);
      ns.start(when, this.rnd() * 2.0, hDur + 0.02);
    }
  }

  /** Warm electric-tine keyboard voice (pure sine/2nd harmonic body + soft 7x metallic tine transient). */
  _triggerElectricTines(freq, when, dur, vel = 0.095, pan = 0) {
    if (!this.ctx || freq <= 0) return;
    const ctx = this.ctx;
    const body = ctx.createOscillator();
    const over = ctx.createOscillator();
    const tine = ctx.createOscillator();
    body.type = 'sine';
    over.type = 'triangle';
    tine.type = 'sine';
    body.frequency.setValueAtTime(freq, when);
    over.frequency.setValueAtTime(freq * 2, when);
    tine.frequency.setValueAtTime(freq * 7.02, when);

    const overG = ctx.createGain();
    overG.gain.setValueAtTime(0.24 * this.warmth, when);
    overG.gain.exponentialRampToValueAtTime(0.02, when + Math.min(dur, 0.7));

    const tineG = ctx.createGain();
    tineG.gain.setValueAtTime(0.16 * this.warmth, when);
    tineG.gain.exponentialRampToValueAtTime(0.0001, when + 0.14);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(vel, when + 0.012);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, vel * 0.28), when + dur * 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    const panner = this._makePanner(pan);
    body.connect(env);
    over.connect(overG);
    overG.connect(env);
    tine.connect(tineG);
    tineG.connect(env);
    env.connect(panner);
    panner.connect(this._dryBus);
    panner.connect(this._reverbSend);
    panner.connect(this._delaySend);

    body.start(when);
    over.start(when);
    tine.start(when);
    const stopAt = when + dur + 0.05;
    body.stop(stopAt);
    over.stop(stopAt);
    tine.stop(when + 0.18);
  }

  /** Tuned hollow wooden/celesta modal resonator mallet (fundamental + 4.0x / 2.76x overtone bar). */
  _triggerHollowMallet(freq, when, dur = 1.4, vel = 0.095, { woody = true, pan = 0 } = {}) {
    if (!this.ctx || freq <= 0) return;
    const ctx = this.ctx;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq, when);
    osc2.frequency.setValueAtTime(freq * (woody ? 3.98 : 2.756), when);

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(woody ? 0.32 : 0.22, when);
    g2.gain.exponentialRampToValueAtTime(0.0001, when + Math.min(0.22, dur * 0.3));

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(vel, when + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    const panner = this._makePanner(pan);
    osc1.connect(env);
    osc2.connect(g2);
    g2.connect(env);
    env.connect(panner);
    panner.connect(this._dryBus);
    panner.connect(this._reverbSend);
    panner.connect(this._delaySend);

    osc1.start(when);
    osc2.start(when);
    osc1.stop(when + dur + 0.04);
    osc2.stop(when + Math.min(dur, 0.3) + 0.04);
  }

  _makePanner(pan = 0) {
    if (this.ctx && typeof this.ctx.createStereoPanner === 'function') {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      return p;
    }
    const g = this.ctx.createGain();
    g.gain.value = 1;
    return g;
  }

  /* ================================================= MACRO-EVOLUTION ENGINE */

  _advanceMacroEvolution(st) {
    const step = this._step16;
    if (step > 0 && step % 16 === 0) {
      this._barCount++;
      // 64-bar symphonic cycle across 4 distinct movements (16 bars each)
      const cycleBar = this._barCount % 64;
      this._evolutionPhase = cycleBar / 64;
      const nextMov = Math.floor(cycleBar / 16) % RADIO_MOVEMENTS.length;
      if (nextMov !== this._movementIdx) {
        this._movementIdx = nextMov;
        // Mutate one note of the recurring 4-note melodic motif each movement so themes evolve organically!
        const mutSlot = Math.floor(this.rnd() * this._motifDegs.length);
        this._motifDegs[mutSlot] = Math.floor(this.rnd() * 7);
      }
      if (cycleBar === 0 && this._barCount > 0) {
        this._cycleCount++;
        this._modalShift = MODAL_CYCLE_SHIFTS[this._cycleCount % MODAL_CYCLE_SHIFTS.length];
      }
    }

    const mov = RADIO_MOVEMENTS[this._movementIdx] || RADIO_MOVEMENTS[0];
    const bank = (mov.bridge && st.bridgeProgressions?.length) ? st.bridgeProgressions : st.progressions;
    const chordLenSteps = (st.bpm < 80) ? 64 : 32;
    if (step > 0 && step % chordLenSteps === 0) {
      this._chordIdx = (this._chordIdx + 1) % bank.length;
      this._chordChangeSeq++;
      this._chordFlashEnv = 1.0;
    }
    if (step % 4 === 0) {
      this._beatEnv = Math.max(this._beatEnv, (step % 16 === 0) ? 1.0 : 0.72);
    }
    const prog = bank[this._chordIdx % bank.length];
    const rootNote = st.baseNote + this._modalShift;
    this._currentChordName = this._modalShift === 0
      ? prog.name
      : `${prog.name} (${this._modalShift > 0 ? '+' : ''}${this._modalShift})`;
    return { mov, prog, rootNote };
  }

  /** Pick a call-and-response melody note shaped by bar phrasing (bars 0-1 call, bar 2 answer, bar 3 breathe). */
  _pickPhraseMidi(rootNote, scale, barInPhrase, stepSlot) {
    const n = scale.length;
    if (barInPhrase === 3 && this.rnd() < 0.65) return null; // breathing space in bar 4!
    const motifDeg = this._motifDegs[stepSlot % this._motifDegs.length];
    const deg = barInPhrase === 2
      ? (n - 1 - (motifDeg % n)) // melodic inversion in answer bar!
      : ((motifDeg + barInPhrase) % n);
    const oct = (this._movementIdx === 2 && this.rnd() < 0.45) ? 24 : 12;
    return rootNote + oct + scale[deg];
  }

  _scheduleStep(when) {
    const st = this.station;
    const step = this._step16;
    const barStep = step % 16;
    const phraseStep = step % 64;
    const barInPhrase = Math.floor(phraseStep / 16);
    const stepSec = 60 / st.bpm / 4;
    const cents = st.detuneCents || 0;

    const { mov, prog, rootNote } = this._advanceMacroEvolution(st);

    if (st.id === 'rain-cathedral') {
      this._composeRainCathedral(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'velvet-sublevel') {
      this._composeVelvetSublevel(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'midnight-monorail') {
      this._composeMidnightMonorail(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'sodium-mercury') {
      this._composeSodiumMercury(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'foghorn-starlight') {
      this._composeFoghornStarlight(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'cobalt-atrium') {
      this._composeCobaltAtrium(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'orbital-shipyard') {
      this._composeOrbitalShipyard(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'sunset-overpass') {
      this._composeSunsetOverpass(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'clockwork-observatory') {
      this._composeClockworkObservatory(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'subterranean-arcade') {
      this._composeSubterraneanArcade(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'glacier-monolith') {
      this._composeGlacierMonolith(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'monsoon-market') {
      this._composeMonsoonMarket(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else if (st.id === 'solar-sail') {
      this._composeSolarSail(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    } else {
      this._composeSkyGardens(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov);
    }

    this._step16++;
  }

  _composeRainCathedral(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    if (phraseStep === 0 || (phraseStep === 32 && mov.density > 0.6)) {
      const dur = stepSec * 30;
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, dur * 0.85, 0.22);
      const voiceLimit = mov.index === 0 ? Math.min(3, prog.pad.length) : prog.pad.length;
      for (let i = 0; i < voiceLimit; i++) {
        const semi = prog.pad[i];
        const pan = ((i / Math.max(1, voiceLimit - 1)) - 0.5) * 1.3;
        this._triggerBrassPad(
          midiToHz(rootNote + 12 + semi, cents),
          when + i * 0.09,
          dur,
          0.082 * mov.density,
          { brightness: (0.75 + (i / voiceLimit) * 0.65) * mov.brightness, pan }
        );
      }
    }

    if ((barStep === 2 || barStep === 9 || barStep === 13) && this.rnd() < 0.62 * mov.leadMul) {
      const midi = this._pickPhraseMidi(rootNote, prog.scale, barInPhrase, barStep);
      if (midi !== null) {
        const prevMidi = this._lastLeadMidi ?? (midi - 2);
        this._lastLeadMidi = midi;
        const dur = stepSec * (4 + Math.floor(this.rnd() * 6));
        this._triggerRibbonLead(midiToHz(prevMidi, cents), midiToHz(midi, cents), when, dur, 0.115);
      }
    }

    // Counter-melody plucked harp in Rising Skyline & Zenith movements
    if (mov.index >= 1 && mov.index <= 2 && (barStep === 6 || barStep === 14) && this.rnd() < 0.52) {
      const semi = prog.scale[(this._step16 >> 1) % prog.scale.length];
      this._triggerPluckedHarp(midiToHz(rootNote + 24 + semi, cents), when, 2.4, 0.075, Math.sin(this._step16) * 0.6);
    }

    if (barStep % 4 === 0 && this.rnd() < (0.36 + this._cityAlt01 * 0.25) * mov.density) {
      const semi = prog.scale[Math.floor(this.rnd() * prog.scale.length)];
      this._triggerFMBell(
        midiToHz(rootNote + 24 + semi, cents),
        when,
        3.2,
        0.072,
        { ratio: 3.0, index: 1.6 * mov.brightness, pan: (this.rnd() - 0.5) * 1.4 }
      );
    }

    if (this.pulse > 0.18) {
      if (barStep === 0 || (barStep === 10 && this.rnd() < 0.55)) {
        this._triggerMicroDrum('kick', when, 0.13);
      }
      if (barStep % 2 === 0 && this.pulse > 0.45 && mov.rhythmMul > 0.6 && this.rnd() < 0.55) {
        const arpSemi = prog.pad[(this._step16 >> 1) % prog.pad.length];
        this._triggerFilterSeq(midiToHz(rootNote + 12 + arpSemi, cents), when, stepSec * 1.6, 0.065, {
          wave: 'triangle', pan: Math.sin(this._step16 * 0.4) * 0.55,
        });
      }
    }
  }

  _composeVelvetSublevel(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    const primeDurs = [7.1, 10.7, 13.3, 16.9];
    const activeVoices = mov.index === 0 ? 2 : 4;
    for (let v = 0; v < activeVoices; v++) {
      if (when >= this._driftVoiceNext[v]) {
        const dur = primeDurs[v] * (0.92 + this.rnd() * 0.18);
        this._driftVoiceNext[v] = when + dur * 0.78;
        const semi = prog.pad[(v + Math.floor(this.rnd() * 2)) % prog.pad.length];
        const oct = v === 0 ? 0 : (mov.index === 2 && v === 3 ? 24 : 12);
        const pan = (v - 1.5) * 0.48;
        this._triggerVelvetPad(midiToHz(rootNote + oct + semi, cents), when, dur, v === 0 ? 0.14 : 0.095, pan);
      }
    }
    if (phraseStep === 0) {
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, stepSec * 28, 0.18);
    }

    const bellMask = (barStep === 0 || barStep === 3 || barStep === 6 || barStep === 10 || barStep === 14);
    if (bellMask && this.rnd() < 0.55 * mov.leadMul) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) {
        this._triggerFMBell(
          midiToHz(midi, cents),
          when,
          2.6,
          0.088,
          { ratio: mov.bridge ? 3.0 : 2.0, index: 1.35 * mov.brightness, pan: Math.cos(this._step16 * 0.37) * 0.65 }
        );
      }
    }

    if (mov.index === 2 && barStep === 8 && this.rnd() < 0.6) {
      const semi = prog.scale[barInPhrase % prog.scale.length];
      this._triggerBreathFlute(midiToHz(rootNote + 24 + semi, cents), when, stepSec * 8, 0.095, 0.25);
    }

    if (this.pulse > 0.12) {
      if (barStep === 0 || barStep === 10) this._triggerMicroDrum('kick', when, 0.15);
      if (barStep === 4 || barStep === 12) this._triggerMicroDrum('rim', when, 0.10);
      if (barStep % 2 === 1 && this.rnd() < 0.72) this._triggerMicroDrum('hat', when, 0.09);
    }
  }

  _composeMidnightMonorail(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    if (phraseStep === 0 || phraseStep === 16) {
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, stepSec * 15, 0.21);
      if (phraseStep === 0) {
        for (let i = 0; i < prog.pad.length; i++) {
          this._triggerBrassPad(
            midiToHz(rootNote + 12 + prog.pad[i], cents),
            when + i * 0.05,
            stepSec * 28,
            0.072 * mov.density,
            { brightness: 1.2 * mov.brightness, pan: ((i / prog.pad.length) - 0.5) * 1.2 }
          );
        }
      }
    }

    // Evolving arpeggio patterns across movements!
    const patterns = [
      [0, 1, 2, 1],
      [0, 2, 1, 3, 4, 2, 3, 1],
      [0, 3, 2, 4, 1, 5, 3, 2],
      [4, 2, 1, 0, 2, 1, 0, 1],
    ];
    const pat = patterns[mov.index % patterns.length];
    const seqProb = Math.min(1, (0.20 + this.pulse * 0.85) * mov.density);
    if (this.rnd() < seqProb) {
      const noteIdx = pat[barStep % pat.length] % prog.pad.length;
      const oct = (barStep % 8 === 4 || (mov.index === 2 && barStep % 4 === 2)) ? 24 : 12;
      const hz = midiToHz(rootNote + oct + prog.pad[noteIdx], cents);
      const accent = (barStep % 4 === 0);
      this._triggerFilterSeq(hz, when, stepSec * 0.85, 0.11, {
        accent,
        wave: mov.bridge ? 'square' : 'sawtooth',
        pan: ((barStep % 2 === 0) ? -1 : 1) * 0.42,
      });
    }

    if ((barStep === 0 || barStep === 6) && phraseStep >= 16 && this.rnd() < 0.58 * mov.leadMul) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) {
        const prev = this._lastLeadMidi ?? midi;
        this._lastLeadMidi = midi;
        this._triggerRibbonLead(midiToHz(prev, cents), midiToHz(midi, cents), when, stepSec * 6, 0.11);
      }
    }

    if (this.pulse > 0.25) {
      if (barStep % 4 === 0) this._triggerMicroDrum('kick', when, 0.14);
      if (barStep === 4 || barStep === 12) this._triggerMicroDrum('rim', when, 0.09);
      if (barStep % 2 === 1) this._triggerMicroDrum('hat', when, 0.08);
    }
  }

  _composeSodiumMercury(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    if (phraseStep === 0 || phraseStep === 32) {
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, stepSec * 15, 0.20);
      for (let i = 0; i < prog.pad.length; i++) {
        this._triggerVelvetPad(
          midiToHz(rootNote + 12 + prog.pad[i], cents),
          when + i * 0.04,
          stepSec * 30,
          0.080 * mov.density,
          ((i % 2 === 0) ? -1 : 1) * 0.52
        );
      }
    }

    const acidSteps = mov.index === 0 ? [0, 6, 12] : [0, 3, 4, 6, 7, 9, 11, 12, 14, 15];
    if (acidSteps.includes(barStep) && this.rnd() < (0.32 + this.pulse * 0.65) * mov.density) {
      const sc = prog.scale;
      const semi = sc[(barStep * 3 + this._motifDegs[barStep % 4]) % sc.length];
      const oct = this.rnd() < (mov.index === 2 ? 0.45 : 0.28) ? 24 : 12;
      const hz = midiToHz(rootNote + oct + semi, cents);
      const prevHz = this._lastLeadMidi ? midiToHz(this._lastLeadMidi, cents) : null;
      this._lastLeadMidi = rootNote + oct + semi;
      this._triggerFilterSeq(hz, when, stepSec * (this.rnd() < 0.35 ? 1.7 : 0.78), 0.115, {
        accent: this.rnd() < 0.38,
        wave: this.rnd() < 0.5 ? 'sawtooth' : 'square',
        slideFrom: this.rnd() < 0.42 ? prevHz : null,
        pan: (this.rnd() - 0.5) * 0.75,
      });
    }

    if ((barStep === 2 || barStep === 11) && this.rnd() < 0.55 * mov.leadMul) {
      const semi = prog.scale[Math.floor(this.rnd() * prog.scale.length)];
      this._triggerFMBell(midiToHz(rootNote + 24 + semi, cents), when, 2.1, 0.085, {
        ratio: 1.4142, index: 1.9 * mov.brightness, pan: (this.rnd() - 0.5) * 1.2,
      });
    }

    if (this.pulse > 0.08) {
      if (barStep === 0 || barStep === 7 || (barStep === 10 && this.rnd() < 0.65)) {
        this._triggerMicroDrum('kick', when, 0.16);
      }
      if (barStep === 4 || barStep === 12 || (barStep === 15 && this.rnd() < 0.45)) {
        this._triggerMicroDrum('snare', when, 0.12);
        if (this.pulse > 0.65 && mov.index === 2 && this.rnd() < 0.35) {
          this._triggerMicroDrum('rim', when + stepSec * 0.33, 0.08);
          this._triggerMicroDrum('rim', when + stepSec * 0.66, 0.06);
        }
      }
      if (this.rnd() < 0.68) {
        this._triggerMicroDrum('hat', when, 0.085);
      }
    }
  }

  _composeFoghornStarlight(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    // Deep oceanic harbor drone + fifth organ pads
    if (phraseStep === 0 || phraseStep === 32) {
      const dur = stepSec * 32;
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, dur, 0.24);
      for (let i = 0; i < prog.pad.length; i++) {
        this._triggerVelvetPad(
          midiToHz(rootNote + 12 + prog.pad[i], cents),
          when + i * 0.14,
          dur * 1.05,
          0.09 * mov.density,
          ((i / Math.max(1, prog.pad.length - 1)) - 0.5) * 1.2
        );
      }
    }

    // Distant foghorn brass call in low-mid register
    if (phraseStep === 8 && this.rnd() < 0.72) {
      const fogHz = midiToHz(rootNote + prog.pad[0], cents);
      this._triggerBrassPad(fogHz, when, stepSec * 14, 0.11, { brightness: 0.55, pan: -0.35 });
    }

    // Breath flute horizon melody
    if ((barStep === 0 || barStep === 10) && this.rnd() < 0.58 * mov.leadMul) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) {
        this._triggerBreathFlute(midiToHz(midi, cents), when, stepSec * 9, 0.105, (this.rnd() - 0.5) * 0.7);
      }
    }

    // Starlight high harmonic chimes
    if (barStep % 6 === 0 && this.rnd() < 0.52 * mov.density) {
      const semi = prog.scale[Math.floor(this.rnd() * prog.scale.length)];
      this._triggerFMBell(midiToHz(rootNote + 24 + semi, cents), when, 3.8, 0.068, {
        ratio: 2.0, index: 1.15, pan: (this.rnd() - 0.5) * 1.5,
      });
    }

    if (this.pulse > 0.22 && barStep === 0) {
      this._triggerMicroDrum('kick', when, 0.12);
    }
  }

  _composeSkyGardens(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    if (phraseStep === 0 || phraseStep === 32) {
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, stepSec * 26, 0.19);
      for (let i = 0; i < prog.pad.length; i++) {
        this._triggerVelvetPad(
          midiToHz(rootNote + 12 + prog.pad[i], cents),
          when + i * 0.06,
          stepSec * 28,
          0.078 * mov.density,
          ((i % 2 === 0) ? -1 : 1) * 0.45
        );
      }
    }

    // Interlocking pentatonic plucked harp-bell ostinato
    const harpMask = (barStep % 3 === 0 || barStep === 8 || barStep === 14);
    if (harpMask && this.rnd() < (0.48 + this.pulse * 0.35) * mov.density) {
      const sc = prog.scale;
      const idx = (barStep + this._motifDegs[barInPhrase % 4]) % sc.length;
      const oct = (barStep % 6 === 0 && mov.index >= 1) ? 24 : 12;
      this._triggerPluckedHarp(
        midiToHz(rootNote + oct + sc[idx], cents),
        when,
        2.1,
        0.105,
        Math.sin(this._step16 * 0.52) * 0.65
      );
    }

    // Singing flute descant in Rising Skyline & Zenith
    if ((barStep === 4 || barStep === 12) && mov.index >= 1 && this.rnd() < 0.52 * mov.leadMul) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) {
        this._triggerBreathFlute(midiToHz(midi, cents), when, stepSec * 7, 0.098, (this.rnd() - 0.5) * 0.55);
      }
    }

    if (this.pulse > 0.14) {
      if (barStep === 0 || barStep === 10) this._triggerMicroDrum('kick', when, 0.13);
      if (barStep === 6 || barStep === 12) this._triggerMicroDrum('rim', when, 0.095);
      if (barStep % 2 === 0 && this.rnd() < 0.55) this._triggerMicroDrum('hat', when, 0.075);
    }
  }

  _composeCobaltAtrium(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    // Warm dub sub-bass + rolled electric-tine lounge chords
    if (phraseStep === 0 || phraseStep === 32) {
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, stepSec * 22, 0.22);
      for (let i = 0; i < prog.pad.length; i++) {
        this._triggerElectricTines(
          midiToHz(rootNote + 12 + prog.pad[i], cents),
          when + i * 0.055,
          stepSec * 24,
          0.088 * mov.density,
          ((i / Math.max(1, prog.pad.length - 1)) - 0.5) * 1.1
        );
      }
    }
    if (barStep === 10 && barInPhrase % 2 === 1 && this.rnd() < 0.72) {
      this._triggerSubBass(midiToHz(rootNote + prog.bass + 7, cents), when, stepSec * 6, 0.16);
    }
    if ((barStep === 3 || barStep === 9 || barStep === 14) && this.rnd() < 0.56 * mov.leadMul) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) {
        this._triggerElectricTines(midiToHz(midi, cents), when, stepSec * 6, 0.092, (this.rnd() - 0.5) * 0.8);
      }
    }
    if (mov.index >= 1 && phraseStep === 16) {
      this._triggerVelvetPad(midiToHz(rootNote + 24 + prog.pad[1 % prog.pad.length], cents), when, stepSec * 24, 0.068, 0.3);
    }
    if (this.pulse > 0.16) {
      if (barStep === 0 || barStep === 10) this._triggerMicroDrum('kick', when, 0.14);
      if (barStep === 4 || barStep === 12) this._triggerMicroDrum('rim', when, 0.10);
      if (barStep % 2 === 1 && this.rnd() < 0.58) this._triggerMicroDrum('hat', when, 0.07);
    }
  }

  _composeOrbitalShipyard(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    // Colossal industrial hull sub-drone + metallic dockyard bell telemetry
    if (phraseStep === 0 || phraseStep === 32) {
      const dur = stepSec * 32;
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, dur * 1.05, 0.25);
      for (let i = 0; i < prog.pad.length; i++) {
        this._triggerBrassPad(
          midiToHz(rootNote + 12 + prog.pad[i], cents),
          when + i * 0.18,
          dur,
          0.078 * mov.density,
          { brightness: 0.48 * mov.brightness, pan: ((i % 2 === 0) ? -1 : 1) * 0.62 }
        );
      }
    }
    // Deep sonar beacon ping
    if ((barStep === 0 || barStep === 11) && this.rnd() < 0.65) {
      const semi = prog.scale[(barInPhrase * 2) % prog.scale.length];
      this._triggerFMBell(midiToHz(rootNote + 24 + semi, cents), when, 4.4, 0.078, {
        ratio: 2.414, index: 2.1 * mov.brightness, pan: (barStep === 0 ? -0.55 : 0.55),
      });
    }
    if (mov.index >= 1 && barStep === 6 && this.rnd() < 0.5) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) this._triggerRibbonLead(midiToHz(midi - 5, cents), midiToHz(midi, cents), when, stepSec * 10, 0.09);
    }
    if (this.pulse > 0.20 && (barStep === 0 || (barStep === 8 && barInPhrase === 3))) {
      this._triggerMicroDrum('kick', when, 0.15);
      if (barStep === 8) this._triggerMicroDrum('snare', when + stepSec * 2, 0.09);
    }
  }

  _composeSunsetOverpass(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    // Golden-hour rolling octave bassline + warm brass-chorus chords + soaring ribbon horizon melody
    if (phraseStep === 0 || phraseStep === 16 || phraseStep === 32 || phraseStep === 48) {
      if (phraseStep % 32 === 0) {
        for (let i = 0; i < prog.pad.length; i++) {
          this._triggerBrassPad(
            midiToHz(rootNote + 12 + prog.pad[i], cents),
            when + i * 0.04,
            stepSec * 28,
            0.076 * mov.density,
            { brightness: 1.28 * mov.brightness, pan: ((i / prog.pad.length) - 0.5) * 1.25 }
          );
        }
      }
    }
    if (barStep % 2 === 0 && this.rnd() < (0.45 + this.pulse * 0.55)) {
      const oct = (barStep % 4 === 2) ? 12 : 0;
      this._triggerFilterSeq(midiToHz(rootNote + prog.bass + 12 + oct, cents), when, stepSec * 1.45, 0.115, {
        accent: barStep % 4 === 0,
        wave: 'sawtooth',
        pan: ((barStep % 4 === 2) ? 0.25 : -0.25),
      });
    }
    if ((barStep === 0 || barStep === 6 || barStep === 12) && this.rnd() < 0.62 * mov.leadMul) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) {
        const prev = this._lastLeadMidi ?? midi;
        this._lastLeadMidi = midi;
        this._triggerRibbonLead(midiToHz(prev, cents), midiToHz(midi, cents), when, stepSec * 5.5, 0.11);
      }
    }
    if (this.pulse > 0.18) {
      if (barStep === 0 || barStep === 8) this._triggerMicroDrum('kick', when, 0.15);
      if (barStep === 4 || barStep === 12) this._triggerMicroDrum('snare', when, 0.115);
      if (barStep % 2 === 1) this._triggerMicroDrum('hat', when, 0.08);
    }
  }

  _composeClockworkObservatory(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    // Polymetric 5-step & 3-step celesta mallets + plucked string canons
    if (phraseStep === 0 || phraseStep === 32) {
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, stepSec * 24, 0.18);
      for (let i = 0; i < Math.min(4, prog.pad.length); i++) {
        this._triggerVelvetPad(
          midiToHz(rootNote + 12 + prog.pad[i], cents),
          when + i * 0.06,
          stepSec * 26,
          0.072 * mov.density,
          ((i % 2 === 0) ? -1 : 1) * 0.5
        );
      }
    }
    // 5-against-16 celesta clockwork wheel
    if ((this._step16 % 3 === 0 || this._step16 % 5 === 0) && this.rnd() < (0.52 + this.pulse * 0.38) * mov.density) {
      const sc = prog.scale;
      const deg = (this._step16 + this._motifDegs[this._step16 % 4]) % sc.length;
      const oct = (this._step16 % 5 === 0) ? 24 : 12;
      this._triggerHollowMallet(midiToHz(rootNote + oct + sc[deg], cents), when, 1.35, 0.092, {
        woody: false,
        pan: Math.sin(this._step16 * 0.7) * 0.68,
      });
    }
    if ((barStep === 2 || barStep === 10) && mov.index >= 1 && this.rnd() < 0.58 * mov.leadMul) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) this._triggerPluckedHarp(midiToHz(midi, cents), when, 2.0, 0.095, -0.35);
    }
    if (this.pulse > 0.20) {
      if (barStep === 0 || barStep === 6 || barStep === 12) this._triggerMicroDrum('rim', when, 0.085);
      if (barStep === 0) this._triggerMicroDrum('kick', when, 0.12);
    }
  }

  _composeSubterraneanArcade(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    // High-energy 128 BPM midnight pulse-wave arpeggios & syncopated electro-bass
    if (barStep === 0 || barStep === 6 || barStep === 10) {
      const bassOff = barStep === 10 ? 7 : 0;
      this._triggerFilterSeq(midiToHz(rootNote + prog.bass + 12 + bassOff, cents), when, stepSec * 2.2, 0.135, {
        accent: barStep === 0,
        wave: 'square',
        pan: 0,
      });
    }
    if (phraseStep === 0) {
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, stepSec * 16, 0.20);
    }
    // Rapid 16th-note pulse-wave chord arpeggiator
    if (this.rnd() < (0.45 + this.pulse * 0.55) * mov.density) {
      const semi = prog.pad[(barStep + barInPhrase) % prog.pad.length];
      const oct = (barStep % 4 === 3) ? 24 : 12;
      this._triggerFilterSeq(midiToHz(rootNote + oct + semi, cents), when, stepSec * 0.72, 0.095, {
        accent: barStep % 4 === 0,
        wave: 'square',
        pan: ((barStep % 2 === 0) ? -0.48 : 0.48),
      });
    }
    if ((barStep === 4 || barStep === 14) && mov.index >= 1 && this.rnd() < 0.52) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) this._triggerElectricTines(midiToHz(midi, cents), when, stepSec * 4, 0.085, 0.2);
    }
    if (this.pulse > 0.12) {
      if (barStep % 4 === 0) this._triggerMicroDrum('kick', when, 0.165);
      if (barStep === 4 || barStep === 12) this._triggerMicroDrum('snare', when, 0.125);
      if (barStep % 2 === 1 || (barStep % 4 === 2 && this.pulse > 0.7)) this._triggerMicroDrum('hat', when, 0.085);
    }
  }

  _composeGlacierMonolith(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    // Glacial 42 BPM monolith cathedral fifths & crystalline ice-prism chimes
    if (phraseStep === 0 || phraseStep === 32) {
      const dur = stepSec * 34;
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, dur, 0.23);
      for (let i = 0; i < prog.pad.length; i++) {
        this._triggerVelvetPad(
          midiToHz(rootNote + 12 + prog.pad[i], cents),
          when + i * 0.22,
          dur * 1.08,
          0.088 * mov.density,
          ((i / Math.max(1, prog.pad.length - 1)) - 0.5) * 1.35
        );
      }
    }
    if (barStep % 8 === 0 && this.rnd() < 0.62) {
      const semi = prog.scale[Math.floor(this.rnd() * prog.scale.length)];
      this._triggerFMBell(midiToHz(rootNote + 24 + semi, cents), when, 5.2, 0.068, {
        ratio: 3.0, index: 1.05, pan: (this.rnd() - 0.5) * 1.4,
      });
    }
    if (barStep === 4 && this.rnd() < 0.48 * mov.leadMul) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) this._triggerBreathFlute(midiToHz(midi, cents), when, stepSec * 11, 0.095, (this.rnd() - 0.5) * 0.6);
    }
  }

  _composeMonsoonMarket(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    // Organic wooden marimba resonators, syncopated rain-rim percussion & silk-flute melodies
    if (phraseStep === 0 || phraseStep === 32) {
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, stepSec * 20, 0.20);
      for (let i = 0; i < Math.min(4, prog.pad.length); i++) {
        this._triggerVelvetPad(midiToHz(rootNote + 12 + prog.pad[i], cents), when + i * 0.05, stepSec * 24, 0.068 * mov.density, (i - 1.5) * 0.35);
      }
    }
    const malletSteps = [0, 3, 6, 8, 11, 14];
    if (malletSteps.includes(barStep) && this.rnd() < (0.52 + this.pulse * 0.42) * mov.density) {
      const sc = prog.scale;
      const semi = sc[(barStep + this._motifDegs[barInPhrase % 4]) % sc.length];
      const oct = (barStep === 6 || barStep === 14) ? 24 : 12;
      this._triggerHollowMallet(midiToHz(rootNote + oct + semi, cents), when, 0.95, 0.105, {
        woody: true,
        pan: Math.cos(barStep * 0.6) * 0.58,
      });
    }
    if ((barStep === 2 || barStep === 10) && this.rnd() < 0.56 * mov.leadMul) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) this._triggerBreathFlute(midiToHz(midi, cents), when, stepSec * 6.5, 0.10, (this.rnd() - 0.5) * 0.5);
    }
    if (this.pulse > 0.12) {
      if (barStep === 0 || barStep === 7 || barStep === 10) this._triggerMicroDrum('kick', when, 0.145);
      if (barStep === 3 || barStep === 6 || barStep === 12 || barStep === 15) {
        if (this.rnd() < 0.72) this._triggerMicroDrum('rim', when, 0.095);
      }
      if (barStep % 2 === 1 && this.rnd() < 0.64) this._triggerMicroDrum('hat', when, 0.078);
    }
  }

  _composeSolarSail(when, stepSec, barStep, phraseStep, barInPhrase, rootNote, prog, cents, mov) {
    // Luminous Lydian harp cascades, warm string swells & weightless orbital chimes
    if (phraseStep === 0 || phraseStep === 32) {
      const dur = stepSec * 28;
      this._triggerSubBass(midiToHz(rootNote + prog.bass, cents), when, dur * 0.9, 0.19);
      for (let i = 0; i < prog.pad.length; i++) {
        this._triggerBrassPad(
          midiToHz(rootNote + 12 + prog.pad[i], cents),
          when + i * 0.08,
          dur,
          0.074 * mov.density,
          { brightness: 1.05 * mov.brightness, pan: ((i / Math.max(1, prog.pad.length - 1)) - 0.5) * 1.2 }
        );
      }
    }
    if (barStep % 2 === 0 && this.rnd() < (0.50 + this.pulse * 0.35) * mov.density) {
      const sc = prog.scale;
      const idx = ((barStep >> 1) + barInPhrase * 2) % sc.length;
      const oct = (barStep >= 8) ? 24 : 12;
      this._triggerPluckedHarp(midiToHz(rootNote + oct + sc[idx], cents), when, 2.5, 0.095, ((barStep / 16) - 0.5) * 1.1);
    }
    if (barStep === 4 && mov.index >= 1 && this.rnd() < 0.58 * mov.leadMul) {
      const midi = this._pickPhraseMidi(rootNote + 12, prog.scale, barInPhrase, barStep);
      if (midi !== null) this._triggerElectricTines(midiToHz(midi, cents), when, stepSec * 8, 0.085, 0.25);
    }
    if (this.pulse > 0.22 && barStep === 0) {
      this._triggerMicroDrum('kick', when, 0.115);
    }
  }

  /* ========================================================= PUBLIC API */

  start() {
    this.playing = true;
    if (!this._initGraph()) {
      return true;
    }
    if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      try { this.ctx.resume(); } catch {}
    }
    const now = this.ctx.currentTime;
    this._nextStepTime = now + 0.04;
    this._driftVoiceNext = [now + 0.05, now + 1.8, now + 3.4, now + 5.1];
    this._syncBusLevels();
    return true;
  }

  stop() {
    this.playing = false;
    this._syncBusLevels();
    return false;
  }

  toggle() {
    if (this.playing) {
      this.stop();
      return false;
    }
    this.start();
    return true;
  }

  setStation(index, { applyDefaults = false } = {}) {
    const n = RADIO_STATIONS.length;
    this.stationIndex = ((Math.round(index) % n) + n) % n;
    this._chordIdx = 0;
    this._chordChangeSeq++;
    this._chordFlashEnv = 1.0;
    this._step16 = 0;
    this._barCount = 0;
    this._movementIdx = 0;
    this._evolutionPhase = 0;
    this._lastLeadMidi = null;
    const st = this.station;
    this._currentChordName = st.progressions[0].name;
    if (applyDefaults) {
      this.space = st.defaultSpace;
      this.warmth = st.defaultWarmth;
      this.pulse = st.defaultPulse;
    }
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this._driftVoiceNext = [now + 0.06, now + 1.4, now + 2.9, now + 4.5];
      this._nextStepTime = Math.min(this._nextStepTime, now + 0.08);
    }
    this._syncBusLevels();
    return st;
  }

  get effectiveStationIndex() {
    return (this._xfadeActive && !this._xfadeSwitched && this._xfadeTargetIdx >= 0)
      ? this._xfadeTargetIdx
      : this.stationIndex;
  }

  stepStation(delta = 1, { smooth = false } = {}) {
    const n = RADIO_STATIONS.length;
    const base = this.effectiveStationIndex;
    const nextIdx = (((base + Math.round(delta)) % n) + n) % n;
    if (smooth && this.playing) {
      if (nextIdx === this.stationIndex) {
        this._xfadeActive = false;
        this._xfadeSwitched = false;
        this._xfadeTargetIdx = -1;
        this._playlistElapsed = 0;
        return this.station;
      }
      this.transitionToStation(nextIdx);
      return RADIO_STATIONS[nextIdx];
    }
    this._playlistElapsed = 0;
    return this.setStation(nextIdx, { applyDefaults: false });
  }

  nextStation(opts = {}) {
    return this.stepStation(1, opts);
  }

  prevStation(opts = {}) {
    return this.stepStation(-1, opts);
  }

  _pickNextPlaylistIndex() {
    const n = RADIO_STATIONS.length;
    if (this.playlistMode === 'shuffle') {
      if (!this._shuffleBag.length) {
        for (let i = 0; i < n; i++) {
          if (i !== this.stationIndex) this._shuffleBag.push(i);
        }
        for (let i = this._shuffleBag.length - 1; i > 0; i--) {
          const j = Math.floor(this.rnd() * (i + 1));
          const tmp = this._shuffleBag[i];
          this._shuffleBag[i] = this._shuffleBag[j];
          this._shuffleBag[j] = tmp;
        }
      }
      const picked = this._shuffleBag.pop();
      return picked !== undefined ? picked : ((this.stationIndex + 1) % n);
    }
    return (this.stationIndex + 1) % n;
  }

  /** Smooth 4.4s ambient reverb/filter crossfade into target station index. */
  transitionToStation(targetIdx) {
    const n = RADIO_STATIONS.length;
    const normIdx = ((Math.round(targetIdx) % n) + n) % n;
    if (normIdx === this.stationIndex) return this.station;
    this._xfadeActive = true;
    this._xfadeProgress = 0;
    this._xfadeSwitched = false;
    this._xfadeTargetIdx = normIdx;
    this._playlistElapsed = 0;
    return RADIO_STATIONS[normIdx];
  }

  setPlaylist({ mode, interval } = {}) {
    if (mode !== undefined && ['loop', 'seq', 'shuffle'].includes(mode)) {
      this.playlistMode = mode;
      this._playlistElapsed = 0;
    }
    if (interval !== undefined) {
      this.playlistInterval = Math.max(15, Math.min(300, Number(interval) || 75));
    }
  }

  /** Return live stereo WebAudio MediaStream for muxing synth soundtrack into video exports. */
  getAudioStream({ autoStart = false } = {}) {
    if (autoStart && !this.playing) {
      this.start();
    } else if (!this.ctx) {
      this._initGraph();
    }
    if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      try { this.ctx.resume(); } catch { /* ignore */ }
    }
    return this._streamDest ? this._streamDest.stream : null;
  }

  reseed(newSeed) {
    this.seed = (newSeed ?? ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
    this.rnd = mulberry32(this.seed ^ 0x51f2d39b);
    this._step16 = 0;
    this._barCount = 0;
    this._chordIdx = 0;
    this._movementIdx = 0;
    this._cycleCount = 0;
    this._modalShift = 0;
  }

  setParams({ volume, space, warmth, pulse, cityReact } = {}) {
    if (volume !== undefined) this.volume = Math.max(0, Math.min(1.2, Number(volume)));
    if (space !== undefined) this.space = Math.max(0, Math.min(1.5, Number(space)));
    if (warmth !== undefined) this.warmth = Math.max(0, Math.min(1.5, Number(warmth)));
    if (pulse !== undefined) this.pulse = Math.max(0, Math.min(1.5, Number(pulse)));
    if (cityReact !== undefined) this.cityReact = Math.max(0, Math.min(1.0, Number(cityReact)));
    this._syncBusLevels();
  }

  setVolume(v) { this.setParams({ volume: v }); }
  setSpace(v) { this.setParams({ space: v }); }
  setWarmth(v) { this.setParams({ warmth: v }); }
  setPulse(v) { this.setParams({ pulse: v }); }
  setCityReactivity(v) { this.setParams({ cityReact: v }); }

  /** Advance lookahead scheduler + macro-evolution + live city telemetry coupling. */
  update(dt = 0.016, telemetry = null) {
    if (telemetry) {
      if (telemetry.altitude !== undefined) {
        this._cityAlt01 = Math.max(0, Math.min(1, telemetry.altitude / 900));
      }
      if (telemetry.night !== undefined) {
        this._cityNight01 = Math.max(0, Math.min(1, Number(telemetry.night)));
      } else if (telemetry.timeOfDay !== undefined) {
        const h = ((telemetry.timeOfDay % 24) + 24) % 24;
        this._cityNight01 = 0.5 + 0.5 * Math.cos(((h - 0.5) / 24) * Math.PI * 2);
      }
      if (telemetry.speed !== undefined) {
        this._citySpeed01 = Math.max(0, Math.min(1, telemetry.speed / 280));
      }
    }

    this._simPhase += dt;
    this._beatEnv *= Math.exp(-dt * 5.8);
    this._chordFlashEnv *= Math.exp(-dt * 1.15);
    if (!this.playing) {
      this._lowEnv *= Math.exp(-dt * 4.0);
      this._highEnv *= Math.exp(-dt * 4.0);
      return;
    }

    // Advance Playlist Auto-DJ timer & smooth 4.4s crossfade envelope
    if (this._xfadeActive) {
      this._xfadeProgress += dt / 4.4;
      if (!this._xfadeSwitched && this._xfadeProgress >= 0.5) {
        this._xfadeSwitched = true;
        const st = this.setStation(this._xfadeTargetIdx, { applyDefaults: false });
        if (typeof this.onStationAutoSwitch === 'function') {
          this.onStationAutoSwitch(st, this.stationIndex);
        }
      }
      if (this._xfadeProgress >= 1.0) {
        this._xfadeActive = false;
        this._xfadeProgress = 0;
      }
    } else if (this.playlistMode !== 'loop') {
      this._playlistElapsed += dt;
      if (this._playlistElapsed >= this.playlistInterval) {
        this._playlistElapsed = 0;
        this.transitionToStation(this._pickNextPlaylistIndex());
      }
    }

    if (!this.ctx) {
      const stepSec = 60 / this.station.bpm / 4;
      while (this._simPhase >= stepSec) {
        this._simPhase -= stepSec;
        this._advanceMacroEvolution(this.station);
        this._step16++;
      }
      return;
    }

    const now = this.ctx.currentTime;
    const stepSec = 60 / this.station.bpm / 4;
    if (this._nextStepTime < now - 0.25) {
      this._nextStepTime = now + 0.02;
    }
    let guard = 0;
    while (this._nextStepTime < now + 0.16 && guard++ < 8) {
      this._scheduleStep(this._nextStepTime);
      this._nextStepTime += stepSec;
    }
    this._syncBusLevels();
  }

  /**
   * Real-time musical telemetry for coupling musical tempo, beats, chord progressions,
   * harmonic color, and spectral energy directly into the city environment.
   */
  getMusicalTelemetry() {
    const st = this.station;
    const bpm = st.bpm || 90;
    const mov = RADIO_MOVEMENTS[this._movementIdx] || RADIO_MOVEMENTS[0];
    const chordName = this._currentChordName || st.progressions[0].name;
    const isMinor = /m(?!aj)/i.test(chordName);
    const hasLydian = /#11|add9|maj9|sus2/i.test(chordName);
    const chordBrightness = Math.max(0, Math.min(1,
      (isMinor ? 0.34 : 0.68) + (hasLydian ? 0.22 : 0) + (mov.brightness - 0.85) * 0.25
    ));

    let low = 0;
    let mid = 0;
    let high = 0;
    const hasRealAudio = Boolean(this.playing && this.analyser && this.ctx && this.ctx.state === 'running');
    if (hasRealAudio) {
      this.analyser.getByteFrequencyData(this._freqBins);
      const n = this._freqBins.length || 64;
      const nLow = Math.max(1, Math.floor(n * 0.14));
      const nMid = Math.max(nLow + 1, Math.floor(n * 0.48));
      for (let i = 0; i < nLow; i++) low += this._freqBins[i] / 255;
      for (let i = nLow; i < nMid; i++) mid += this._freqBins[i] / 255;
      for (let i = nMid; i < n; i++) high += this._freqBins[i] / 255;
      low /= nLow;
      mid /= (nMid - nLow);
      high /= Math.max(1, n - nMid);
    } else if (this.playing) {
      low = Math.min(1, 0.28 + this._beatEnv * 0.52 * Math.max(0.25, this.pulse));
      mid = Math.min(1, 0.30 * mov.density + this._chordFlashEnv * 0.32);
      high = Math.min(1, 0.20 * this.warmth + 0.22 * (0.5 + 0.5 * Math.sin(this._simPhase * (bpm / 30))));
    }

    const beatSec = 60 / bpm;
    const beatPhase = this.playing ? (((this._simPhase / beatSec) % 1) + 1) % 1 : 0;
    const barPhase = this.playing ? ((((this._step16 % 16) / 16) + beatPhase * 0.25) % 1) : 0;

    return {
      playing: this.playing,
      stationIndex: this.stationIndex,
      stationId: st.id,
      bpm,
      tempoRatio: bpm / 90,
      beatPhase,
      barPhase,
      beatPulse: this.playing ? this._beatEnv : 0,
      chordFlash: this.playing ? this._chordFlashEnv : 0,
      chordChangeSeq: this._chordChangeSeq,
      chordIndex: this._chordIdx,
      chordName,
      isMinor,
      chordBrightness,
      modalShift: this._modalShift,
      movementIndex: this._movementIdx,
      movementName: mov.name,
      evolutionPhase: this._evolutionPhase,
      lowEnergy: low,
      midEnergy: mid,
      highEnergy: high,
    };
  }

  /** Render live spectrum bars + ambient oscilloscope ribbon onto `#radio-viz` 2D canvas. */
  renderScope(canvas, accentHex = '#53d9ff') {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const w = canvas.width || 276;
    const h = canvas.height || 48;

    if (g.clearRect) g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(6, 10, 20, 0.88)';
    g.fillRect(0, 0, w, h);

    g.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, h * 0.5);
    g.lineTo(w, h * 0.5);
    g.stroke();

    const hasRealAudio = Boolean(this.playing && this.analyser && this.ctx && this.ctx.state === 'running');
    if (hasRealAudio) {
      this.analyser.getByteFrequencyData(this._freqBins);
      this.analyser.getByteTimeDomainData(this._waveBins);
    }

    const bars = 28;
    const bw = (w - 12) / bars;
    g.fillStyle = accentHex;
    for (let i = 0; i < bars; i++) {
      let amp = 0.05;
      if (hasRealAudio) {
        const bi = Math.min(this._freqBins.length - 1, Math.floor((i / bars) * (this._freqBins.length * 0.72)));
        amp = Math.max(0.05, (this._freqBins[bi] / 255) * 0.92);
      } else if (this.playing) {
        amp = 0.14 + 0.42 * (0.5 + 0.5 * Math.sin(this._simPhase * 2.8 + i * 0.45)) * Math.exp(-i * 0.05);
      }
      const bh = Math.max(2, amp * (h - 10));
      g.globalAlpha = this.playing ? (0.28 + amp * 0.62) : 0.16;
      g.fillRect(6 + i * bw, h - 4 - bh, Math.max(2, bw - 2.2), bh);
    }

    g.globalAlpha = this.playing ? 0.92 : 0.35;
    g.strokeStyle = '#eef4ff';
    g.lineWidth = 1.35;
    g.beginPath();
    const nPts = 48;
    for (let i = 0; i < nPts; i++) {
      const u = i / (nPts - 1);
      const x = 4 + u * (w - 8);
      let yNorm = 0.5;
      if (hasRealAudio) {
        const wi = Math.min(this._waveBins.length - 1, Math.floor(u * (this._waveBins.length - 1)));
        yNorm = 0.5 + ((this._waveBins[wi] - 128) / 128) * 0.40;
      } else if (this.playing) {
        yNorm = 0.5 + 0.22 * Math.sin(u * 10 + this._simPhase * 3.4) * Math.sin(u * Math.PI);
      }
      const y = Math.max(3, Math.min(h - 3, yNorm * h));
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.globalAlpha = 1;
  }
}
