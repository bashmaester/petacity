// Modular Pure-Code Space-Ambient Synthesizer & Generative Radio Engine.
// 100% software synthesis in Web Audio API — zero audio files, zero samples, zero network fetches.
// Inspired by Vangelis (CS-80 Blade Runner Blues, Albedo 0.39, Spiral) and
// Aphex Twin (Selected Ambient Works 85-92, SAW Volume II: Rhubarb / Lichen / Xtal, Polygon Window).

import { mulberry32 } from './prng.js';

export const RADIO_STATIONS = [
  {
    id: 'vangelis-bladerunner',
    name: 'Vangelis · Tyrell 2019 (CS-80 Space Blues)',
    shortName: 'Tyrell 2019 · CS-80',
    artistHint: 'Vangelis-inspired CS-80 brass pads, ribbon solo & shimmer hall',
    bpm: 64,
    baseNote: 48, // C3
    defaultSpace: 0.94,
    defaultWarmth: 0.78,
    defaultPulse: 0.28,
    // Lydian / Dorian / Minor-9th suspended voicings (semitones from root C)
    progressions: [
      { name: 'Cmaj9#11', bass: -12, pad: [0, 4, 7, 11, 14, 18], scale: [0, 2, 4, 6, 7, 9, 11, 14] },
      { name: 'Abmaj7#11', bass: -16, pad: [-4, 0, 3, 7, 10, 14], scale: [-4, -2, 0, 2, 3, 7, 10, 12] },
      { name: 'Fm11', bass: -19, pad: [-7, -4, 0, 3, 7, 10], scale: [-7, -5, -4, -2, 0, 3, 5, 7] },
      { name: 'Dm9', bass: -10, pad: [2, 5, 9, 12, 16], scale: [2, 4, 5, 7, 9, 11, 12, 16] },
      { name: 'G13sus4', bass: -17, pad: [-5, 0, 2, 5, 9, 12], scale: [-5, -3, 0, 2, 4, 5, 9, 12] },
      { name: 'Ebmaj9#11', bass: -9, pad: [3, 7, 10, 14, 17, 21], scale: [3, 5, 7, 9, 10, 12, 14, 17] },
    ],
  },
  {
    id: 'aphex-saw-drift',
    name: 'Aphex Twin · Selected Ambient Works (Drift)',
    shortName: 'SAW II · Rhubarb Drift',
    artistHint: 'Asynchronous warm fifth pads, Xtal FM bells & tape flutter',
    bpm: 76,
    baseNote: 50, // D3 (slightly micro-detuned +14 cents for nostalgic SAW tape warmth!)
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
  },
  {
    id: 'vangelis-cosmos',
    name: 'Vangelis · Albedo & Spiral (Cosmic Sequencer)',
    shortName: 'Albedo 0.39 · Sequencer',
    artistHint: 'Hypnotic 16th-note analog filter arpeggios & cosmic brass',
    bpm: 108,
    baseNote: 45, // A2
    defaultSpace: 0.86,
    defaultWarmth: 0.84,
    defaultPulse: 0.82,
    progressions: [
      { name: 'Am9', bass: -12, pad: [0, 3, 7, 10, 14], scale: [0, 2, 3, 7, 10, 12, 14, 15] },
      { name: 'Fmaj7#11', bass: -16, pad: [-4, 0, 4, 7, 11], scale: [-4, -2, 0, 2, 4, 7, 11, 12] },
      { name: 'Dm11', bass: -19, pad: [-7, -4, 0, 3, 5, 10], scale: [-7, -4, -2, 0, 3, 5, 7, 10] },
      { name: 'Esus4 -> E7', bass: -17, pad: [-5, 0, 2, 7, 11], scale: [-5, -1, 0, 2, 4, 7, 11, 12] },
    ],
  },
  {
    id: 'aphex-polygon',
    name: 'Aphex Twin · Polygon Window (IDM Acid Ambient)',
    shortName: 'Polygon Window · IDM',
    artistHint: 'Melodic 303 acid bubbles, Euclidean micro-beats & nostalgic pads',
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
  },
];

export function midiToHz(midi, centsOffset = 0) {
  return 440 * Math.pow(2, (midi - 69 + centsOffset / 100) / 12);
}

/**
 * Pure-code algorithmic Lexicon-style stereo shimmer/velvet hall impulse generator.
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
    // Dual-stage decay: lush initial bloom + long 60dB cosmic tail
    const env = preFade * (0.58 * Math.exp(-t * 1.45) + 0.42 * Math.exp(-t * 0.62));
    // Sparse velvet density early -> smooth dense tail, low-passed progressively over time
    const damp = 0.52 - 0.38 * u;
    const rawL = (rnd() * 2 - 1);
    const rawR = (rnd() * 2 - 1);
    // Subtle slow chorus modulation baked into modal tail
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

/** Evaluate deterministic harmonic state for tests & UI inspection. */
export function evalStationHarmony(stationOrIdx = 0, stepIndex = 0) {
  const st = (stationOrIdx && typeof stationOrIdx === 'object' && Array.isArray(stationOrIdx.progressions))
    ? stationOrIdx
    : RADIO_STATIONS[((Number(stationOrIdx) % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length];
  const prog = st.progressions[((stepIndex % st.progressions.length) + st.progressions.length) % st.progressions.length];
  const cents = st.detuneCents || 0;
  const padMidi = prog.pad.map((semi) => st.baseNote + 12 + semi);
  return {
    station: st,
    chordName: prog.name,
    bassMidi: st.baseNote + prog.bass,
    bassHz: midiToHz(st.baseNote + prog.bass, cents),
    padMidi,
    padHz: padMidi.map((m) => midiToHz(m, cents)),
    scaleMidi: prog.scale.map((semi) => st.baseNote + 12 + semi),
  };
}

/**
 * Modular Pure-Code Synthesizer & Space-Ambient Radio Controller.
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
    this.cityReact = Math.max(0, Math.min(1.0, Number(cityReactivity))); // 0 .. 1.0 coupling to camera altitude, speed & time of day

    // City telemetry state (fed live from main loop)
    this._cityAlt01 = 0.25;
    this._cityNight01 = 0.75;
    this._citySpeed01 = 0.20;

    // Web Audio graph handles (lazily initialized on user gesture)
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this._dryBus = null;
    this._reverbSend = null;
    this._delaySend = null;
    this._delayFeedback = null;
    this._masterFilter = null;
    this._windGain = null;
    this._windFilter = null;
    this._noiseBuffer = null;

    // Generative scheduler state
    this._step16 = 0;
    this._chordIdx = 0;
    this._nextStepTime = 0;
    this._lastPadTime = -999;
    this._lastLeadTime = -999;
    this._sawVoiceNext = [0, 0, 0, 0];
    this._lastLeadMidi = null;
    this._euclidPhase = 0;
    this._simPhase = 0;
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

    // Subtle analog tape wow/flutter LFO
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

    // 4. Algorithmic Lexicon-Style Stereo Shimmer Hall Reverb Bus
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
    delayOut.connect(reverbSend); // feed echoes gently into cosmic hall!
    this._reverbSend = reverbSend;
    this._revLP = revLP;

    // 5. Shared Pure-Code White/Pink Noise Buffer (for percussive transients & cosmic solar wind)
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

    // 6. Continuous Cosmic Wind / Rain-Mist Breath Module
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

    const targetVol = this.playing ? Math.max(0, Math.min(1.2, this.volume)) * 0.82 : 0.0001;
    this.masterGain.gain.setTargetAtTime(targetVol, now, 0.08);

    const spaceEff = Math.max(0, Math.min(1.6, this.space + altBoost * 0.28));
    this._reverbSend.gain.setTargetAtTime(0.18 + spaceEff * 0.62, now, 0.12);
    this._delaySend.gain.setTargetAtTime(0.12 + spaceEff * 0.30, now, 0.12);
    this._delayFeedback.gain.setTargetAtTime(Math.min(0.68, 0.20 + spaceEff * 0.28), now, 0.12);

    const warmEff = Math.max(0.08, Math.min(1.6, this.warmth + altBoost * 0.24 - nightWarm * 0.18));
    const cutoff = 680 * Math.pow(14.5, warmEff * 0.78);
    this._masterFilter.frequency.setTargetAtTime(Math.min(16500, cutoff), now, 0.14);
    if (this._revLP) {
      this._revLP.frequency.setTargetAtTime(Math.min(9500, 1800 + warmEff * 3600 + altBoost * 1800), now, 0.2);
    }
    if (this._windGain && this._windFilter) {
      const windLvl = (0.008 + spaceEff * 0.014 + react * this._citySpeed01 * 0.024) * (this.playing ? 1 : 0);
      this._windGain.gain.setTargetAtTime(windLvl, now, 0.25);
      this._windFilter.frequency.setTargetAtTime(280 + altBoost * 920 + Math.sin(now * 0.19) * 110, now, 0.25);
    }
  }

  /* ========================================================= SYNTH MODULES */

  /** Module 1: Yamaha CS-80-inspired polyphonic detuned saw/sub brass-string pad voice. */
  _triggerCS80Pad(freq, when, dur, vel = 0.22, { brightness = 1.0, pan = 0 } = {}) {
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
    // Slow analog VCO drift across long sustain
    osc1.detune.linearRampToValueAtTime(-4.1 - drift, when + dur);
    osc2.detune.linearRampToValueAtTime(9.4 + drift * 0.5, when + dur);

    const subGain = ctx.createGain();
    subGain.gain.value = 0.34;

    // CS-80 signature HPF -> resonant LPF brass-to-velvet swell
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

  /** Module 2: Expressive CS-80 Ribbon / Portamento Solo Brass Lead with delayed aftertouch vibrato. */
  _triggerCS80Lead(freqFrom, freqTo, when, dur, vel = 0.18) {
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

    // Delayed expressive aftertouch vibrato
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

  /** Module 3: Aphex Twin SAW II (Rhubarb / Lichen) ultra-warm breathing triangle + fifth pad. */
  _triggerSAWPad(freq, when, dur, vel = 0.20, pan = 0) {
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
    oFifth.frequency.setValueAtTime(freq * 1.4983, when); // pure warm fifth shimmer
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

  /** Module 4: 2-Operator Crystalline FM Chime / Xtal Rhodes Bell Voice. */
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

  /** Module 5: Resonant Analog Sequencer / Melodic 303 Acid Pluck Voice. */
  _triggerAcidSeq(freq, when, dur = 0.24, vel = 0.15, { accent = false, wave = 'sawtooth', pan = 0, slideFrom = null } = {}) {
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

  /** Module 6: Deep Sub-Bass Pedal Drone. */
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

  /** Module 7: Pure-Code IDM / Ambient Soft Percussion (808/SAW soft kick, brushed hat, resonant rim). */
  _triggerMicroDrum(kind, when, vel = 0.18) {
    const ctx = this.ctx;
    if (!ctx || this.pulse <= 0.02) return;
    const v = vel * Math.min(1.35, this.pulse);

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

  /* ================================================= GENERATIVE COMPOSERS */

  _scheduleStep(when) {
    const st = this.station;
    const step = this._step16;
    const barStep = step % 16;
    const phraseStep = step % 64;
    const stepSec = 60 / st.bpm / 4;
    const cents = st.detuneCents || 0;

    // Advance chord on phrase boundaries (every 4 bars for cosmic/IDM, every 6 bars for space ambient)
    const chordLenSteps = (st.id === 'vangelis-bladerunner' || st.id === 'aphex-saw-drift') ? 64 : 32;
    if (step > 0 && step % chordLenSteps === 0) {
      this._chordIdx = (this._chordIdx + 1) % st.progressions.length;
    }
    const prog = st.progressions[this._chordIdx % st.progressions.length];
    this._currentChordName = prog.name;

    if (st.id === 'vangelis-bladerunner') {
      this._composeVangelisBladeRunner(when, stepSec, barStep, phraseStep, st, prog, cents);
    } else if (st.id === 'aphex-saw-drift') {
      this._composeAphexSAWDrift(when, stepSec, barStep, phraseStep, st, prog, cents);
    } else if (st.id === 'vangelis-cosmos') {
      this._composeVangelisCosmos(when, stepSec, barStep, phraseStep, st, prog, cents);
    } else {
      this._composeAphexPolygon(when, stepSec, barStep, phraseStep, st, prog, cents);
    }

    this._step16++;
  }

  _composeVangelisBladeRunner(when, stepSec, barStep, phraseStep, st, prog, cents) {
    // 1. Lush CS-80 polyphonic chord swell + deep sub pedal at start of each 4-bar chord
    if (phraseStep === 0 || phraseStep === 32) {
      const dur = stepSec * 30;
      this._triggerSubBass(midiToHz(st.baseNote + prog.bass, cents), when, dur * 0.85, 0.22);
      const padNotes = prog.pad;
      for (let i = 0; i < padNotes.length; i++) {
        const semi = padNotes[i];
        const pan = ((i / Math.max(1, padNotes.length - 1)) - 0.5) * 1.3;
        this._triggerCS80Pad(
          midiToHz(st.baseNote + 12 + semi, cents),
          when + i * 0.09,
          dur,
          0.085,
          { brightness: 0.85 + (i / padNotes.length) * 0.65, pan }
        );
      }
    }

    // 2. Singing portamento CS-80 solo brass melody floating over the rain-soaked skyline
    if ((barStep === 2 || barStep === 9 || barStep === 13) && this.rnd() < 0.62) {
      const sc = prog.scale;
      const pick = sc[Math.floor(this.rnd() * sc.length)];
      const oct = this.rnd() < 0.35 ? 24 : 12;
      const midi = st.baseNote + oct + pick;
      const prevMidi = this._lastLeadMidi ?? (midi - 2);
      this._lastLeadMidi = midi;
      const dur = stepSec * (4 + Math.floor(this.rnd() * 6));
      this._triggerCS80Lead(midiToHz(prevMidi, cents), midiToHz(midi, cents), when, dur, 0.115);
    }

    // 3. Sparse high Deckard apartment glass/chime sparkles into ping-pong hall
    if (barStep % 4 === 0 && this.rnd() < 0.44 + this._cityAlt01 * 0.25) {
      const sc = prog.scale;
      const semi = sc[Math.floor(this.rnd() * sc.length)];
      this._triggerFMBell(
        midiToHz(st.baseNote + 24 + semi, cents),
        when,
        3.2,
        0.075,
        { ratio: 3.0, index: 1.6, pan: (this.rnd() - 0.5) * 1.4 }
      );
    }

    // 4. Optional slow hypnotic Blade-Runner timpani/heartbeat pulse when Pulse > 0.2
    if (this.pulse > 0.18) {
      if (barStep === 0 || (barStep === 10 && this.rnd() < 0.55)) {
        this._triggerMicroDrum('kick', when, 0.13);
      }
      if (barStep % 2 === 0 && this.pulse > 0.45 && this.rnd() < 0.55) {
        const arpSemi = prog.pad[(this._step16 >> 1) % prog.pad.length];
        this._triggerAcidSeq(midiToHz(st.baseNote + 12 + arpSemi, cents), when, stepSec * 1.6, 0.065, {
          wave: 'triangle', pan: Math.sin(this._step16 * 0.4) * 0.55,
        });
      }
    }
  }

  _composeAphexSAWDrift(when, stepSec, barStep, phraseStep, st, prog, cents) {
    // 1. Prime-interval asynchronous Eno/AFX warm pad voices (7.1s, 10.7s, 13.3s, 16.9s)
    const primeDurs = [7.1, 10.7, 13.3, 16.9];
    for (let v = 0; v < 4; v++) {
      if (when >= this._sawVoiceNext[v]) {
        const dur = primeDurs[v] * (0.92 + this.rnd() * 0.18);
        this._sawVoiceNext[v] = when + dur * 0.78;
        const semi = prog.pad[(v + Math.floor(this.rnd() * 2)) % prog.pad.length];
        const oct = v === 0 ? 0 : 12;
        const pan = (v - 1.5) * 0.48;
        this._triggerSAWPad(midiToHz(st.baseNote + oct + semi, cents), when, dur, v === 0 ? 0.14 : 0.095, pan);
      }
    }
    if (phraseStep === 0) {
      this._triggerSubBass(midiToHz(st.baseNote + prog.bass, cents), when, stepSec * 28, 0.18);
    }

    // 2. Nostalgic Xtal / Tha soft FM bell pentatonic motif
    const bellMask = (barStep === 0 || barStep === 3 || barStep === 6 || barStep === 10 || barStep === 14);
    if (bellMask && this.rnd() < 0.58) {
      const sc = prog.scale;
      const semi = sc[(barStep + Math.floor(this.rnd() * 3)) % sc.length];
      this._triggerFMBell(
        midiToHz(st.baseNote + 24 + semi, cents),
        when,
        2.6,
        0.09,
        { ratio: 2.0, index: 1.35, pan: Math.cos(this._step16 * 0.37) * 0.65 }
      );
    }

    // 3. Soft SAW 85-92 "Xtal / Ageispolis" dubby sub-pulse when Pulse > 0.12
    if (this.pulse > 0.12) {
      if (barStep === 0 || barStep === 10) this._triggerMicroDrum('kick', when, 0.15);
      if (barStep === 4 || barStep === 12) this._triggerMicroDrum('rim', when, 0.10);
      if (barStep % 2 === 1 && this.rnd() < 0.72) this._triggerMicroDrum('hat', when, 0.09);
    }
  }

  _composeVangelisCosmos(when, stepSec, barStep, phraseStep, st, prog, cents) {
    // 1. Majestic cosmic brass chord cadence
    if (phraseStep === 0 || phraseStep === 16) {
      this._triggerSubBass(midiToHz(st.baseNote + prog.bass, cents), when, stepSec * 15, 0.21);
      if (phraseStep === 0) {
        for (let i = 0; i < prog.pad.length; i++) {
          this._triggerCS80Pad(
            midiToHz(st.baseNote + 12 + prog.pad[i], cents),
            when + i * 0.05,
            stepSec * 28,
            0.075,
            { brightness: 1.25, pan: ((i / prog.pad.length) - 0.5) * 1.2 }
          );
        }
      }
    }

    // 2. Signature Spiral / Albedo 0.39 16th-note analog filter sequencer arpeggiator!
    const seqProb = Math.min(1, 0.25 + this.pulse * 0.9);
    if (this.rnd() < seqProb) {
      const pat = [0, 2, 1, 3, 4, 2, 3, 1];
      const noteIdx = pat[barStep % pat.length] % prog.pad.length;
      const oct = (barStep % 8 === 4) ? 24 : 12;
      const hz = midiToHz(st.baseNote + oct + prog.pad[noteIdx], cents);
      const accent = (barStep % 4 === 0);
      this._triggerAcidSeq(hz, when, stepSec * 0.85, 0.11, {
        accent,
        wave: 'sawtooth',
        pan: ((barStep % 2 === 0) ? -1 : 1) * 0.42,
      });
    }

    // 3. Soaring cosmic brass theme on upper octave
    if ((barStep === 0 || barStep === 6) && phraseStep >= 16 && this.rnd() < 0.55) {
      const sc = prog.scale;
      const midi = st.baseNote + 24 + sc[Math.floor(this.rnd() * sc.length)];
      const prev = this._lastLeadMidi ?? midi;
      this._lastLeadMidi = midi;
      this._triggerCS80Lead(midiToHz(prev, cents), midiToHz(midi, cents), when, stepSec * 6, 0.11);
    }

    if (this.pulse > 0.25) {
      if (barStep % 4 === 0) this._triggerMicroDrum('kick', when, 0.14);
      if (barStep % 2 === 1) this._triggerMicroDrum('hat', when, 0.08);
    }
  }

  _composeAphexPolygon(when, stepSec, barStep, phraseStep, st, prog, cents) {
    // 1. Nostalgic detuned BoC/AFX ambient chord bed
    if (phraseStep === 0 || phraseStep === 32) {
      this._triggerSubBass(midiToHz(st.baseNote + prog.bass, cents), when, stepSec * 15, 0.20);
      for (let i = 0; i < prog.pad.length; i++) {
        this._triggerSAWPad(
          midiToHz(st.baseNote + 12 + prog.pad[i], cents),
          when + i * 0.04,
          stepSec * 30,
          0.082,
          ((i % 2 === 0) ? -1 : 1) * 0.52
        );
      }
    }

    // 2. Melodic Analord 303 resonant bubble counterline with slides & accents
    const acidSteps = [0, 3, 4, 6, 7, 9, 11, 12, 14, 15];
    if (acidSteps.includes(barStep) && this.rnd() < (0.35 + this.pulse * 0.65)) {
      const sc = prog.scale;
      const semi = sc[(barStep * 3 + Math.floor(this.rnd() * 3)) % sc.length];
      const oct = this.rnd() < 0.32 ? 24 : 12;
      const hz = midiToHz(st.baseNote + oct + semi, cents);
      const prevHz = this._lastLeadMidi ? midiToHz(this._lastLeadMidi, cents) : null;
      this._lastLeadMidi = st.baseNote + oct + semi;
      this._triggerAcidSeq(hz, when, stepSec * (this.rnd() < 0.35 ? 1.7 : 0.78), 0.115, {
        accent: this.rnd() < 0.38,
        wave: this.rnd() < 0.5 ? 'sawtooth' : 'square',
        slideFrom: this.rnd() < 0.42 ? prevHz : null,
        pan: (this.rnd() - 0.5) * 0.75,
      });
    }

    // 3. Crystalline high bell harmonics
    if ((barStep === 2 || barStep === 11) && this.rnd() < 0.55) {
      const semi = prog.scale[Math.floor(this.rnd() * prog.scale.length)];
      this._triggerFMBell(midiToHz(st.baseNote + 24 + semi, cents), when, 2.1, 0.085, {
        ratio: 1.4142, index: 1.9, pan: (this.rnd() - 0.5) * 1.2,
      });
    }

    // 4. Intricate Braindance IDM micro-percussion + occasional 32nd-note hi-hat/snare ratchets!
    if (this.pulse > 0.08) {
      if (barStep === 0 || barStep === 7 || (barStep === 10 && this.rnd() < 0.65)) {
        this._triggerMicroDrum('kick', when, 0.16);
      }
      if (barStep === 4 || barStep === 12 || (barStep === 15 && this.rnd() < 0.45)) {
        this._triggerMicroDrum('snare', when, 0.12);
        // Probabilistic AFX micro-ratchet
        if (this.pulse > 0.65 && this.rnd() < 0.32) {
          this._triggerMicroDrum('rim', when + stepSec * 0.33, 0.08);
          this._triggerMicroDrum('rim', when + stepSec * 0.66, 0.06);
        }
      }
      if (this.rnd() < 0.68) {
        this._triggerMicroDrum('hat', when, 0.085);
        if (this.pulse > 0.75 && this.rnd() < 0.25) {
          this._triggerMicroDrum('hat', when + stepSec * 0.5, 0.055);
        }
      }
    }
  }

  /* ========================================================= PUBLIC API */

  start() {
    this.playing = true;
    if (!this._initGraph()) {
      // Headless / JSDOM fallback: track playback state & chord evolution cleanly without Web Audio
      return true;
    }
    if (this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      try { this.ctx.resume(); } catch {}
    }
    const now = this.ctx.currentTime;
    this._nextStepTime = now + 0.04;
    this._sawVoiceNext = [now + 0.05, now + 1.8, now + 3.4, now + 5.1];
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
    this._step16 = 0;
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
      this._sawVoiceNext = [now + 0.06, now + 1.4, now + 2.9, now + 4.5];
      this._nextStepTime = Math.min(this._nextStepTime, now + 0.08);
    }
    this._syncBusLevels();
    return st;
  }

  nextStation() {
    return this.setStation(this.stationIndex + 1, { applyDefaults: false });
  }

  reseed(newSeed) {
    this.seed = (newSeed ?? ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
    this.rnd = mulberry32(this.seed ^ 0x51f2d39b);
    this._step16 = 0;
    this._chordIdx = 0;
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

  /** Advance lookahead scheduler + couple live city telemetry into modular filters & space bus. */
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
    if (!this.playing) return;

    if (!this.ctx) {
      // Headless / JSDOM deterministic step progression
      const stepSec = 60 / this.station.bpm / 4;
      if (this._simPhase >= stepSec) {
        this._simPhase = 0;
        const st = this.station;
        this._step16++;
        const chordSteps = (st.id === 'vangelis-bladerunner' || st.id === 'aphex-saw-drift') ? 64 : 32;
        if (this._step16 % chordSteps === 0) {
          this._chordIdx = (this._chordIdx + 1) % st.progressions.length;
        }
        this._currentChordName = st.progressions[this._chordIdx % st.progressions.length].name;
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

    // Subtle horizontal graticule
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

    // Floating oscilloscope trace
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
