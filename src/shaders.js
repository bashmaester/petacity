// GLSL for the custom materials: spherical sky dome & 3D cloud volumes (with
// StormyClouds WebGL styles), alpha-feathered polar ground with horizon suburbs,
// instanced towers (street podiums, media-ad facades & suburban houses),
// landmarks, beacons/lamps, vehicle hulls & light-trails, water, billboards,
// holograms, downward precipitation, ambient dust motes, and Plane<->Sphere
// world curvature. Written in GLSL ES 1.00 style (upgraded to #version 300 es
// by Three.js r170 on WebGL 2 — zero ESSL 3.00 reserved identifiers).

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float hash14(vec4 p4) {
  p4 = fract(p4 * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.x + p4.y) * (p4.z + p4.w));
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}
float vnoise4(vec4 p) {
  vec4 i = floor(p);
  vec4 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float w0 = mix(
    mix(
      mix(hash14(i), hash14(i + vec4(1.0, 0.0, 0.0, 0.0)), f.x),
      mix(hash14(i + vec4(0.0, 1.0, 0.0, 0.0)), hash14(i + vec4(1.0, 1.0, 0.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash14(i + vec4(0.0, 0.0, 1.0, 0.0)), hash14(i + vec4(1.0, 0.0, 1.0, 0.0)), f.x),
      mix(hash14(i + vec4(0.0, 1.0, 1.0, 0.0)), hash14(i + vec4(1.0, 1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    f.z
  );
  float w1 = mix(
    mix(
      mix(hash14(i + vec4(0.0, 0.0, 0.0, 1.0)), hash14(i + vec4(1.0, 0.0, 0.0, 1.0)), f.x),
      mix(hash14(i + vec4(0.0, 1.0, 0.0, 1.0)), hash14(i + vec4(1.0, 1.0, 0.0, 1.0)), f.x),
      f.y
    ),
    mix(
      mix(hash14(i + vec4(0.0, 0.0, 1.0, 1.0)), hash14(i + vec4(1.0, 0.0, 1.0, 1.0)), f.x),
      mix(hash14(i + vec4(0.0, 1.0, 1.0, 1.0)), hash14(i + vec4(1.0, 1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
  return mix(w0, w1, f.w);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += vnoise(p) * a;
    p *= 2.13;
    a *= 0.5;
  }
  return s;
}
float fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += vnoise3(p) * a;
    p *= 2.07;
    a *= 0.5;
  }
  return s;
}
const float PC_LOOP = 120.0;
const float PC_TAU  = 6.28318530718;

float loopPhase(float t) {
  return fract(t / PC_LOOP);
}

float loopPhase(float t, float harmonics) {
  float k = max(1.0, floor(harmonics + 0.5));
  return fract(loopPhase(t) * k);
}

float loopSin(float t, float approxHz, float ph) {
  float k = max(1.0, floor(approxHz * PC_LOOP + 0.5));
  return sin(loopPhase(t) * PC_TAU * k + ph);
}

float loopCos(float t, float approxHz, float ph) {
  float k = max(1.0, floor(approxHz * PC_LOOP + 0.5));
  return cos(loopPhase(t) * PC_TAU * k + ph);
}

vec2 loopOrbit(float t, float radius, float harmonic) {
  float k = max(1.0, floor(harmonic + 0.5));
  float a = loopPhase(t) * PC_TAU * k;
  return vec2(cos(a), sin(a)) * radius;
}

float evalLoopedToggle(vec2 cellId, float t, float approxRate, float seedOff) {
  float nSlots = max(3.0, floor(approxRate * PC_LOOP + 0.5));
  float cyc = loopPhase(t) * nSlots + fract(seedOff * 7.13) * nSlots;
  float s0 = mod(floor(cyc), nSlots);
  float s1 = mod(s0 + 1.0, nSlots);
  float blend = smoothstep(0.76, 1.0, fract(cyc));
  float h0 = hash12(cellId + vec2(s0 * 1.37, seedOff * 41.9));
  float h1 = hash12(cellId + vec2(s1 * 1.37, seedOff * 41.9));
  return mix(h0, h1, blend);
}

float evalLoopedToggle(float t, float approxRate, vec2 cellId, float seedOff) {
  return evalLoopedToggle(cellId, t, approxRate, seedOff);
}

// Strictly 24.0-hour periodic circadian occupancy curve (zero jump at 24.0 -> 0.0!)
float evalCircadian24(float dayH, float bPhase, float flrHash, float roomHash) {
  float h = mod(mod(dayH, 24.0) + 24.0, 24.0);
  float dEve = abs(h - (20.1 + bPhase * 0.8 + flrHash * 0.6));
  dEve = min(dEve, 24.0 - dEve);
  float evePeak = exp(-(dEve * dEve) / (3.35 * 3.35));

  float dMorn = abs(h - (7.15 + bPhase * 0.4));
  dMorn = min(dMorn, 24.0 - dMorn);
  float mornPeak = exp(-(dMorn * dMorn) / (1.55 * 1.55)) * (0.45 + 0.55 * step(0.35, flrHash));

  float dNoon = abs(h - 12.6);
  dNoon = min(dNoon, 24.0 - dNoon);
  float dayDip = exp(-(dNoon * dNoon) / (4.1 * 4.1));

  float nightOwl = 0.28 + 0.44 * step(0.75, flrHash) + 0.18 * step(0.80, roomHash);
  float dayBase = 0.30 + 0.32 * step(0.64, flrHash);
  float base = mix(nightOwl, dayBase, dayDip);
  return clamp(base + evePeak * 0.86 + mornPeak * 0.38, 0.18, 1.22);
}

float fbm4Cloud(vec3 p, float w, float lac, float seedOff) {
  float s = 0.0;
  float a = 0.5;
  float normA = 0.0;
  float gain = clamp(1.02 / max(lac, 1.25), 0.34, 0.66);
  vec4 q = vec4(p + vec3(seedOff * 1.37, -seedOff * 0.83, seedOff * 1.91), w + seedOff * 0.41);
  for (int i = 0; i < 4; i++) {
    s += vnoise4(q) * a;
    normA += a;
    q.xyz = q.xyz * lac + vec3(2.71, -1.53, 3.19);
    q.w = q.w * (1.0 + (lac - 1.0) * 0.45) + 1.13;
    a *= gain;
  }
  return s / max(normA, 1e-4);
}
`;

/**
 * Invented procedural script engine ("Synth-Linear"):
 * Zero real-world alphabet characters — synthesizes crisp vector strokes inspired
 * by Aegean Minoan Linear A / Mycenaean Linear B syllabograms (central hastae,
 * cross-bars, horned lunettes, splayed tripods, double-dot word dividers) fused
 * with futuristic cyber-sigils & astral geometric glyphs that morph over time.
 */
export const GLSL_GLYPHS = /* glsl */ `
float glyphSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
  return length(pa - ba * h);
}

float evalLinearStrokeSet(vec2 p, float gid) {
  float k = floor(mod(gid, 16.0));
  float d = 9.0;
  // Primary vertical spine or twin prongs (Linear A/B syllabogram backbone)
  if (k < 5.5) {
    d = min(d, glyphSeg(p, vec2(0.50, 0.14), vec2(0.50, 0.86)));
  } else if (k < 9.5) {
    d = min(d, glyphSeg(p, vec2(0.32, 0.16), vec2(0.32, 0.84)));
    d = min(d, glyphSeg(p, vec2(0.68, 0.16), vec2(0.68, 0.84)));
  } else if (k < 12.5) {
    d = min(d, glyphSeg(p, vec2(0.50, 0.42), vec2(0.50, 0.86)));
    d = min(d, glyphSeg(p, vec2(0.50, 0.44), vec2(0.24, 0.14)));
    d = min(d, glyphSeg(p, vec2(0.50, 0.44), vec2(0.76, 0.14)));
  } else {
    d = min(d, glyphSeg(p, vec2(0.24, 0.16), vec2(0.50, 0.86)));
    d = min(d, glyphSeg(p, vec2(0.76, 0.16), vec2(0.50, 0.86)));
  }

  // Quantized horizontal crossbars (classic Linear B PA / DA / RO / TI motifs)
  float bars = floor(mod(gid * 3.7, 4.0));
  if (bars > 0.5) d = min(d, glyphSeg(p, vec2(0.22, 0.72), vec2(0.78, 0.72)));
  if (bars > 1.5) d = min(d, glyphSeg(p, vec2(0.26, 0.48), vec2(0.74, 0.48)));
  if (bars > 2.5) d = min(d, glyphSeg(p, vec2(0.20, 0.26), vec2(0.80, 0.26)));

  // Aegean lunette / horned crown / side-loop flourish
  float crown = floor(mod(gid * 7.3, 5.0));
  if (crown < 1.5) {
    vec2 cp = p - vec2(0.50, 0.78);
    if (cp.y < 0.08) d = min(d, abs(length(cp * vec2(1.0, 1.25)) - 0.23));
  } else if (crown < 2.5) {
    d = min(d, glyphSeg(p, vec2(0.22, 0.86), vec2(0.50, 0.62)));
    d = min(d, glyphSeg(p, vec2(0.78, 0.86), vec2(0.50, 0.62)));
  } else if (crown < 3.5) {
    d = min(d, abs(length(p - vec2(0.50, 0.64)) - 0.17));
  } else if (crown < 4.5) {
    d = min(d, glyphSeg(p, vec2(0.20, 0.56), vec2(0.20, 0.82)));
    d = min(d, glyphSeg(p, vec2(0.80, 0.56), vec2(0.80, 0.82)));
  }
  return d;
}

float evalSynthStrokeSet(vec2 p, float gid) {
  float k = floor(mod(gid, 12.0));
  float d = 9.0;
  // 45-degree chamfered cyber-traces & resonator gates
  if (k < 3.5) {
    d = min(d, glyphSeg(p, vec2(0.20, 0.82), vec2(0.62, 0.82)));
    d = min(d, glyphSeg(p, vec2(0.62, 0.82), vec2(0.80, 0.62)));
    d = min(d, glyphSeg(p, vec2(0.80, 0.62), vec2(0.80, 0.18)));
    d = min(d, glyphSeg(p, vec2(0.24, 0.48), vec2(0.60, 0.48)));
    d = min(d, glyphSeg(p, vec2(0.24, 0.48), vec2(0.44, 0.18)));
  } else if (k < 6.5) {
    d = min(d, glyphSeg(p, vec2(0.22, 0.20), vec2(0.22, 0.78)));
    d = min(d, glyphSeg(p, vec2(0.22, 0.78), vec2(0.78, 0.78)));
    d = min(d, glyphSeg(p, vec2(0.48, 0.56), vec2(0.78, 0.22)));
    d = min(d, abs(length(p - vec2(0.56, 0.54)) - 0.11));
  } else if (k < 9.5) {
    d = min(d, glyphSeg(p, vec2(0.20, 0.66), vec2(0.50, 0.86)));
    d = min(d, glyphSeg(p, vec2(0.80, 0.66), vec2(0.50, 0.86)));
    d = min(d, glyphSeg(p, vec2(0.26, 0.38), vec2(0.74, 0.38)));
    d = min(d, glyphSeg(p, vec2(0.36, 0.16), vec2(0.64, 0.16)));
    d = min(d, glyphSeg(p, vec2(0.50, 0.38), vec2(0.50, 0.70)));
  } else {
    d = min(d, glyphSeg(p, vec2(0.22, 0.82), vec2(0.78, 0.22)));
    d = min(d, glyphSeg(p, vec2(0.22, 0.52), vec2(0.52, 0.82)));
    d = min(d, abs(length(p - vec2(0.30, 0.28)) - 0.09));
    d = min(d, glyphSeg(p, vec2(0.56, 0.62), vec2(0.80, 0.62)));
  }
  // Terminal circuit node pip
  if (fract(gid * 0.37) > 0.45) {
    vec2 np = vec2(0.24 + 0.52 * step(0.5, fract(gid * 1.9)), 0.22 + 0.56 * step(0.5, fract(gid * 2.7)));
    d = min(d, max(0.0, length(p - np) - 0.045));
  }
  return d;
}

float evalAstralStrokeSet(vec2 p, float gid) {
  vec2 c = p - 0.5;
  float d = abs(length(c) - 0.31);
  float k = floor(mod(gid, 8.0));
  if (k < 2.5) {
    d = min(d, abs(abs(c.x) + abs(c.y) - 0.26));
    d = min(d, glyphSeg(p, vec2(0.50, 0.12), vec2(0.50, 0.88)));
  } else if (k < 5.5) {
    d = min(d, abs(length(p - vec2(0.60, 0.56)) - 0.22));
    d = min(d, glyphSeg(p, vec2(0.16, 0.50), vec2(0.84, 0.50)));
  } else {
    d = min(d, glyphSeg(p, vec2(0.22, 0.22), vec2(0.78, 0.78)));
    d = min(d, glyphSeg(p, vec2(0.22, 0.78), vec2(0.78, 0.22)));
    d = min(d, max(0.0, length(c) - 0.065));
  }
  return d;
}

float evalSingleGlyphDist(vec2 p, float gid, float glyphStyle) {
  if (glyphStyle > 0.5 && glyphStyle < 1.5) return evalLinearStrokeSet(p, gid);
  if (glyphStyle >= 1.5 && glyphStyle < 2.5) return evalSynthStrokeSet(p, gid);
  if (glyphStyle >= 2.5) return evalAstralStrokeSet(p, gid);
  // 0: Hybrid Linear-A/B + Synth sigil script
  return (fract(gid * 0.61803) < 0.58)
    ? evalLinearStrokeSet(p, gid)
    : evalSynthStrokeSet(p, gid * 1.37);
}

float evalSynthGlyph(vec2 cellUv, float charSeed, float glyphStyle, float animT, float strokeW) {
  if (cellUv.x < 0.08 || cellUv.x > 0.92 || cellUv.y < 0.08 || cellUv.y > 0.92) return 0.0;
  vec2 p = (cellUv - 0.08) / 0.84;
  // Seamlessly looped glyph-morphing over PC_LOOP = 120s (zero jump on cycle reset!)
  float nEpochs = 32.0;
  float phase = fract(animT / PC_LOOP) * nEpochs + fract(charSeed * 19.7) * nEpochs;
  float ep0 = mod(floor(phase), nEpochs);
  float ep1 = mod(ep0 + 1.0, nEpochs);
  float morph = smoothstep(0.74, 0.96, fract(phase));
  float g0 = floor(hash12(vec2(charSeed * 97.3, ep0 * 13.1)) * 64.0);
  float g1 = floor(hash12(vec2(charSeed * 97.3, ep1 * 13.1)) * 64.0);
  float d0 = evalSingleGlyphDist(p, g0, glyphStyle);
  float d1 = evalSingleGlyphDist(p, g1, glyphStyle);
  float d = mix(d0, d1, morph);
  float aa = max(fwidth(d), 0.018);
  return 1.0 - smoothstep(strokeW - aa * 0.5, strokeW + aa, d);
}

// Multi-character Linear-Synth text line with seamless integer-period scrolling
float evalGlyphLine(vec2 uv, float cols, float scrollT, float rowSeed, float glyphStyle, float animT) {
  if (uv.y < 0.04 || uv.y > 0.96) return 0.0;
  float loopScroll = floor(abs(scrollT) / max(animT, 1e-4) * PC_LOOP * 0.2 + 0.5) * 5.0 * sign(scrollT) * fract(animT / PC_LOOP);
  if (abs(scrollT) < 1e-4) loopScroll = 0.0;
  float xShift = uv.x * cols + loopScroll;
  float cid = mod(floor(xShift), 20.0);
  vec2 cUv = vec2(fract(xShift), uv.y);
  float wordSlot = mod(cid + floor(rowSeed * 11.0), 5.0);
  if (wordSlot > 3.5) {
    float dDot = min(
      length(cUv - vec2(0.5, 0.34)),
      length(cUv - vec2(0.5, 0.68))
    );
    return 1.0 - smoothstep(0.045, 0.085, dDot);
  }
  float chSeed = hash12(vec2(cid * 1.73, rowSeed * 53.7));
  if (chSeed < 0.08) return 0.0;
  return evalSynthGlyph(cUv, chSeed, glyphStyle, animT, 0.056);
}

// Simulated Commercial Ad Illustrations (Synth-Cola bottle, Cyber-Car, Off-World Ring Planet,
// Fashion Visor Portrait, Steaming Noodle Bowl, Market Candlesticks, Equalizer & Chrono Dial)
vec3 evalSimulatedAd(vec2 uv, float seed, float glyphStyle, float animT, vec3 colA, vec3 colB, vec3 darkBg) {
  float ph = fract(animT / PC_LOOP);
  float ang = ph * PC_TAU;
  float adKind = floor(fract(seed * 29.17) * 8.0);
  // Diversify ad palette per-seed so adjacent billboards feel like distinct competing brands!
  vec3 altC = vec3(fract(seed * 3.7) * 0.7 + 0.3, fract(seed * 7.1) * 0.6 + 0.35, fract(seed * 11.3) * 0.7 + 0.3);
  vec3 brandA = mix(colA, mix(colA, altC, 0.45), step(0.45, fract(seed * 5.1)));
  vec3 brandB = mix(colB, mix(colB, altC.zyx, 0.45), step(0.45, fract(seed * 8.9)));
  vec3 col = darkBg;

  if (adKind < 0.5) {
    // 0: Fizzy Synth-Beverage Bottle + Rising Bubbles + Price Pill + Brand Copy
    vec2 bp = uv - vec2(0.26, 0.50);
    float neck = step(0.16, bp.y) * step(bp.y, 0.33) * (1.0 - smoothstep(0.038, 0.052, abs(bp.x)));
    float shoulder = smoothstep(0.06, 0.17, bp.y) * (1.0 - smoothstep(0.17, 0.20, bp.y));
    float halfW = mix(0.095 + 0.015 * sin(bp.y * 18.0), 0.042, shoulder);
    float body = step(-0.34, bp.y) * step(bp.y, 0.17) * (1.0 - smoothstep(halfW - 0.012, halfW, abs(bp.x)));
    float bottle = clamp(max(neck, body), 0.0, 1.0);
    float labelBand = bottle * step(-0.10, bp.y) * step(bp.y, 0.05);
    // Rising effervescent bubbles (looped!)
    float bub = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float by = fract(ph * (3.0 + fi) + fi * 0.27 + seed) * 0.76 + 0.12;
      float bx = 0.26 + sin(ang * 2.0 + fi * 2.1) * 0.12;
      bub += 1.0 - smoothstep(0.014, 0.026, length((uv - vec2(bx, by)) * vec2(1.3, 1.0)));
    }
    float title = evalGlyphLine(vec2(clamp((uv.x - 0.44) / 0.50, 0.0, 1.0), clamp((uv.y - 0.54) / 0.30, 0.0, 1.0)), 4.0, 0.0, seed * 13.0, glyphStyle, animT) * step(0.44, uv.x) * step(0.54, uv.y) * step(uv.y, 0.84);
    float badgeBox = step(0.48, uv.x) * step(uv.x, 0.88) * step(0.18, uv.y) * step(uv.y, 0.40);
    float priceTxt = evalGlyphLine(vec2(clamp((uv.x - 0.51) / 0.34, 0.0, 1.0), clamp((uv.y - 0.21) / 0.14, 0.0, 1.0)), 3.0, 0.0, seed * 31.0, glyphStyle, animT) * badgeBox;
    col = mix(col, brandB * 0.26, step(0.0, uv.x - uv.y * 0.35 - 0.36));
    col = mix(col, brandA * 1.15, bottle);
    col = mix(col, darkBg * 1.5 + brandB * 0.9, labelBand);
    col += brandB * clamp(bub, 0.0, 1.0) * 0.85;
    col = mix(col, brandA * 1.2, title);
    col = mix(col, brandB * 0.85, badgeBox * (1.0 - priceTxt));
  } else if (adKind < 1.5) {
    // 1: Sleek Cyber-Coupe / Spinner Showroom Ad + Speed Lines
    vec2 cp = (uv - vec2(0.46, 0.42)) * vec2(1.0, 1.35);
    float chassis = step(-0.34, cp.x) * step(cp.x, 0.36) * step(-0.10, cp.y) * step(cp.y, 0.04 + 0.09 * (1.0 - abs(cp.x * 2.4)));
    float canopy = step(-0.14, cp.x) * step(cp.x, 0.16) * step(0.02, cp.y) * (1.0 - smoothstep(0.09, 0.12, length((cp - vec2(0.0, 0.02)) * vec2(0.75, 1.1))));
    float wheelL = 1.0 - smoothstep(0.055, 0.072, length((cp - vec2(-0.20, -0.09)) * vec2(1.15, 1.0)));
    float wheelR = 1.0 - smoothstep(0.055, 0.072, length((cp - vec2(0.21, -0.09)) * vec2(1.15, 1.0)));
    float car = clamp(max(chassis, canopy) - (wheelL + wheelR) * 0.5, 0.0, 1.0);
    float rimGlow = (1.0 - smoothstep(0.015, 0.032, abs(length((cp - vec2(-0.20, -0.09)) * vec2(1.15, 1.0)) - 0.045)))
                  + (1.0 - smoothstep(0.015, 0.032, abs(length((cp - vec2(0.21, -0.09)) * vec2(1.15, 1.0)) - 0.045)));
    float streak = step(0.75, fract(uv.y * 14.0)) * step(uv.x, 0.24 + 0.1 * sin(ang * 4.0 + uv.y * 9.0)) * step(0.28, uv.y) * step(uv.y, 0.56);
    float hdr = evalGlyphLine(vec2(uv.x * 0.88 + 0.06, clamp((uv.y - 0.72) / 0.20, 0.0, 1.0)), 6.0, 0.0, seed * 19.0, glyphStyle, animT) * step(0.72, uv.y) * step(uv.y, 0.92);
    float spec = evalGlyphLine(vec2(uv.x, clamp((uv.y - 0.07) / 0.14, 0.0, 1.0)), 11.0, animT * 0.6, seed * 43.0, glyphStyle, animT) * step(0.07, uv.y) * step(uv.y, 0.21);
    col = mix(col, brandA * 1.1, car + rimGlow * 0.9);
    col += brandB * (streak * 0.65 + spec * 0.9);
    col = mix(col, brandB * 1.18, hdr);
  } else if (adKind < 2.5) {
    // 2: Off-World Colony Travel Ad ("A New Life Awaits"): Ringed Planet + Arc Trajectory + Departures
    vec2 pp = (uv - vec2(0.32, 0.56)) * vec2(1.25, 1.0);
    float planet = 1.0 - smoothstep(0.17, 0.19, length(pp));
    vec2 rp = vec2(pp.x * 0.92 + pp.y * 0.38, -pp.x * 0.38 + pp.y * 0.92) * vec2(1.0, 3.4);
    float ring = (1.0 - smoothstep(0.022, 0.045, abs(length(rp) - 0.29))) * (1.0 - planet * step(0.0, rp.y));
    float moonlet = 1.0 - smoothstep(0.025, 0.04, length(pp - vec2(cos(ang) * 0.26, sin(ang) * 0.14)));
    float copy1 = evalGlyphLine(vec2(clamp((uv.x - 0.54) / 0.40, 0.0, 1.0), clamp((uv.y - 0.56) / 0.26, 0.0, 1.0)), 4.0, 0.0, seed * 7.0, glyphStyle, animT) * step(0.54, uv.x) * step(0.56, uv.y) * step(uv.y, 0.82);
    float copy2 = evalGlyphLine(vec2(uv.x, clamp((uv.y - 0.10) / 0.16, 0.0, 1.0)), 10.0, -animT * 0.5, seed * 29.0, glyphStyle, animT) * step(0.10, uv.y) * step(uv.y, 0.26);
    col = mix(col, mix(brandB * 0.5, brandA * 1.15, clamp(pp.y * 3.0 + 0.5, 0.0, 1.0)), planet);
    col = mix(col, brandB * 1.25, clamp(ring + moonlet, 0.0, 1.0));
    col = mix(col, brandA * 1.15, copy1);
    col = mix(col, brandB, copy2 * 0.9);
  } else if (adKind < 3.5) {
    // 3: High-Fashion / Cyber-Optics Portrait Silhouette + Glowing Visor Strip
    vec2 fp = (uv - vec2(0.30, 0.50)) * vec2(1.25, 1.0);
    float head = 1.0 - smoothstep(0.18, 0.20, length((fp - vec2(0.0, 0.08)) * vec2(1.15, 0.92)));
    float shoulders = (1.0 - smoothstep(0.28, 0.31, abs(fp.x))) * step(-0.38, fp.y) * step(fp.y, -0.08);
    float neckS = (1.0 - smoothstep(0.065, 0.08, abs(fp.x))) * step(-0.12, fp.y) * step(fp.y, 0.0);
    float sil = clamp(max(max(head, shoulders), neckS), 0.0, 1.0);
    float visor = head * step(0.07, fp.y) * step(fp.y, 0.13) * (1.0 - smoothstep(0.13, 0.16, abs(fp.x)));
    float scanV = 0.65 + 0.35 * sin(ang * 3.0 + fp.x * 16.0);
    float brandLogo = evalSynthGlyph(vec2(clamp((uv.x - 0.58) / 0.30, 0.0, 1.0), clamp((uv.y - 0.42) / 0.42, 0.0, 1.0)), seed * 17.0, glyphStyle, animT, 0.048) * step(0.58, uv.x) * step(uv.x, 0.88) * step(0.42, uv.y) * step(uv.y, 0.84);
    float sub = evalGlyphLine(vec2(clamp((uv.x - 0.52) / 0.42, 0.0, 1.0), clamp((uv.y - 0.14) / 0.18, 0.0, 1.0)), 5.0, 0.0, seed * 37.0, glyphStyle, animT) * step(0.52, uv.x) * step(0.14, uv.y) * step(uv.y, 0.32);
    col = mix(darkBg, brandB * 0.28, step(0.50, uv.x));
    col = mix(col, brandA * 0.42, sil);
    col = mix(col, brandB * (1.35 * scanV), visor);
    col = mix(col, brandA * 1.2, clamp(brandLogo + sub * 0.85, 0.0, 1.0));
  } else if (adKind < 4.5) {
    // 4: Street-Food / Steaming Noodle Bowl Neon Sign + Chopsticks
    vec2 np = (uv - vec2(0.32, 0.36)) * vec2(1.2, 1.0);
    float bowl = (1.0 - smoothstep(0.22, 0.24, length(np))) * step(np.y, 0.02);
    float rimB = (1.0 - smoothstep(0.015, 0.03, abs(np.y - 0.02))) * step(abs(np.x), 0.24);
    float chop1 = 1.0 - smoothstep(0.010, 0.022, glyphSeg(np, vec2(-0.04, 0.03), vec2(0.24, 0.20)));
    float chop2 = 1.0 - smoothstep(0.010, 0.022, glyphSeg(np, vec2(-0.06, 0.07), vec2(0.23, 0.26)));
    float steam = 0.0;
    for (int s = 0; s < 3; s++) {
      float fs = float(s) - 1.0;
      float sy = clamp((uv.y - 0.42) / 0.40, 0.0, 1.0);
      float sx = 0.30 + fs * 0.07 + sin(sy * 7.0 - ang * 3.0 + fs) * 0.022;
      steam += (1.0 - smoothstep(0.010, 0.024, abs(uv.x - sx))) * step(0.42, uv.y) * step(uv.y, 0.80) * (1.0 - sy * 0.5);
    }
    float vBan = evalSynthGlyph(vec2(clamp((uv.x - 0.64) / 0.24, 0.0, 1.0), fract(uv.y * 4.0)), hash12(vec2(floor(uv.y * 4.0), seed * 23.0)), glyphStyle, animT, 0.058) * step(0.64, uv.x) * step(uv.x, 0.88) * step(0.12, uv.y) * step(uv.y, 0.88);
    col = mix(col, brandA * 1.15, clamp(bowl * 0.85 + rimB + chop1 + chop2, 0.0, 1.0));
    col += brandB * clamp(steam, 0.0, 1.0) * 0.95;
    col = mix(col, brandB * 1.18, vBan);
  } else if (adKind < 5.5) {
    // 5: Exchange Market Candlestick Chart + Live Ticker
    float colIdx = floor(clamp((uv.x - 0.08) / 0.84, 0.0, 0.999) * 10.0);
    float cf = fract(clamp((uv.x - 0.08) / 0.84, 0.0, 0.999) * 10.0);
    float cH = hash12(vec2(colIdx, floor(seed * 53.0)));
    float waveShift = 0.08 * sin(ang * 2.0 + colIdx * 0.7);
    float loY = 0.30 + cH * 0.22 + waveShift;
    float hiY = loY + 0.12 + fract(cH * 7.3) * 0.22;
    float wick = step(abs(cf - 0.5), 0.07) * step(loY - 0.06, uv.y) * step(uv.y, hiY + 0.06);
    float candle = step(0.22, cf) * step(cf, 0.78) * step(loY, uv.y) * step(uv.y, hiY) * step(0.08, uv.x) * step(uv.x, 0.92);
    float bull = step(0.45, fract(cH * 3.9));
    vec3 cCol = mix(brandB, brandA * 1.2, bull);
    float tick = evalGlyphLine(vec2(uv.x, clamp((uv.y - 0.07) / 0.15, 0.0, 1.0)), 12.0, animT * 0.9, seed * 61.0, glyphStyle, animT) * step(0.07, uv.y) * step(uv.y, 0.22);
    col = mix(col, cCol, clamp(candle + wick * 0.65, 0.0, 1.0));
    col = mix(col, brandA, tick * 0.92);
  } else if (adKind < 6.5) {
    // 6: Club / Music Equalizer Spectrum + Strobe Halo
    float barId = floor(clamp((uv.x - 0.08) / 0.84, 0.0, 0.999) * 12.0);
    float bf = fract(clamp((uv.x - 0.08) / 0.84, 0.0, 0.999) * 12.0);
    float beat = 0.22 + 0.52 * (0.5 + 0.5 * sin(ang * (4.0 + mod(barId, 5.0)) + barId * 1.3 + seed * 10.0));
    float seg = step(0.18, fract(uv.y * 16.0));
    float eq = step(0.16, bf) * step(bf, 0.84) * step(0.24, uv.y) * step(uv.y, 0.24 + beat) * seg * step(0.08, uv.x) * step(uv.x, 0.92);
    float top = evalGlyphLine(vec2(uv.x * 0.88 + 0.06, clamp((uv.y - 0.78) / 0.15, 0.0, 1.0)), 7.0, -animT * 0.5, seed * 15.0, glyphStyle, animT) * step(0.78, uv.y) * step(uv.y, 0.93);
    col = mix(col, mix(brandA, brandB, clamp((uv.y - 0.24) / 0.55, 0.0, 1.0)) * 1.2, eq);
    col = mix(col, brandA * 1.15, top);
  } else {
    // 7: Luxury Chrono / Radar Dial + Sweeping Hand + Minimalist Crest
    vec2 dp = (uv - vec2(0.30, 0.50)) * vec2(1.3, 1.0);
    float r = length(dp);
    float dial = (1.0 - smoothstep(0.24, 0.26, r)) * smoothstep(0.21, 0.23, r);
    float aD = atan(dp.y, dp.x);
    float ticks = (1.0 - smoothstep(0.17, 0.21, abs(r - 0.19))) * step(0.75, cos(aD * 12.0));
    vec2 handDir = vec2(cos(-ang * 2.0), sin(-ang * 2.0));
    float hand = 1.0 - smoothstep(0.008, 0.020, glyphSeg(dp, vec2(0.0), handDir * 0.19));
    float txt1 = evalGlyphLine(vec2(clamp((uv.x - 0.54) / 0.40, 0.0, 1.0), clamp((uv.y - 0.52) / 0.26, 0.0, 1.0)), 4.0, 0.0, seed * 47.0, glyphStyle, animT) * step(0.54, uv.x) * step(0.52, uv.y) * step(uv.y, 0.78);
    float txt2 = evalGlyphLine(vec2(clamp((uv.x - 0.54) / 0.40, 0.0, 1.0), clamp((uv.y - 0.22) / 0.18, 0.0, 1.0)), 6.0, 0.0, seed * 71.0, glyphStyle, animT) * step(0.54, uv.x) * step(0.22, uv.y) * step(uv.y, 0.40);
    col = mix(col, brandA * 1.15, clamp(dial + ticks * 0.8 + txt1, 0.0, 1.0));
    col = mix(col, brandB * 1.25, clamp(hand + txt2 * 0.85, 0.0, 1.0));
  }
  return col;
}

vec4 evalSimulatedAd(vec2 uv, float seed, float glyphStyle, float animT) {
  vec3 ch = evalSimulatedAd(uv, seed, glyphStyle, animT, vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0));
  float spec = max(0.0, ch.z);
  float wA = max(0.0, ch.x - spec * 0.5);
  float wB = max(0.0, ch.y - spec * 0.5);
  float mask = clamp(wA + wB + spec, 0.0, 1.0);
  float mixAB = wB / max(0.001, wA + wB);
  return vec4(mask, clamp(mixAB, 0.0, 1.0), clamp(spec, 0.0, 1.0), 1.0);
}
`;

export const GLSL_UTIL = /* glsl */ `
vec3 saturate3(vec3 c, float s) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(l), c, s);
}
`;

/**
 * Continuous Plane (uWorldCurve = 0) <-> Sphere (uWorldCurve = 1) world bend.
 * Sphere centre sits at (0, -R, 0) so the city centre (0, 0, 0) stays anchored
 * tangent to y = 0 while outer rings and horizon suburbs wrap around the globe.
 */
export const GLSL_CURVE = /* glsl */ `
uniform float uWorldCurve;
uniform float uPlanetR;
vec3 bendWorld(vec3 p) {
  if (uWorldCurve < 0.0005) return p;
  float R = uPlanetR / max(uWorldCurve, 0.0005);
  float r = length(p.xz);
  vec2 dir = (r > 1e-4) ? (p.xz / r) : vec2(1.0, 0.0);
  float theta = min(r / R, 3.10);
  float st = sin(theta);
  float ct = cos(theta);
  vec3 upV = vec3(dir.x * st, ct, dir.y * st);
  return vec3(0.0, -R, 0.0) + (R + p.y) * upV;
}
vec3 bendNormal(vec2 xz, vec3 n) {
  if (uWorldCurve < 0.0005) return n;
  float R = uPlanetR / max(uWorldCurve, 0.0005);
  float r = length(xz);
  if (r < 1e-4) return n;
  vec2 dir = xz / r;
  float theta = min(r / R, 3.10);
  float st = sin(theta);
  float ct = cos(theta);
  float nRad = dot(n.xz, dir);
  vec2 nTan = n.xz - dir * nRad;
  float nRad2 = nRad * ct + n.y * st;
  float ny2 = -nRad * st + n.y * ct;
  return normalize(vec3(nTan.x + dir.x * nRad2, ny2, nTan.y + dir.y * nRad2));
}
`;

export const GLSL_STORMY_PLATE = /* glsl */ `
float grainHash(vec2 v) {
  return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453);
}

float filmGrainSky(vec2 fc, float t) {
  vec2 shift = vec2(fract(t * 12.9), fract(t * 7.3)) * 512.0;
  return grainHash(floor(fc) + shift);
}

float cloudField3(vec3 p, float t) {
  vec3 breath = vec3(sin(t * 0.29) * 0.08, cos(t * 0.23) * 0.05, cos(t * 0.37) * 0.07 + sin(t * 0.41) * 0.04);
  vec3 drift = vec3(t * 0.011, t * 0.003, t * 0.005);
  vec3 q = p + breath + drift;
  float c0 = fbm3(q);
  float c1 = fbm3(q * 2.18 + vec3(3.7, 1.4, -1.9) + breath * 1.4);
  return c0 * 0.68 + c1 * 0.32;
}

float mezzotintArc(vec2 p, float r, float openSign) {
  vec2 q = vec2(abs(p.x), p.y * openSign);
  float a = atan(q.x, -q.y);
  float cap = 2.05;
  if (a < cap) return abs(length(q) - r);
  return length(q - r * vec2(sin(cap), -cos(cap)));
}

// Returns vec4(shadedRGB, alphaMultiplier) across all 7 StormyClouds styles.
vec4 evalStormyPlate(float lit, float sty, vec2 fc, vec2 flowVec, vec3 darkBelly, vec3 brightTop, float time) {
  float tone = smoothstep(0.04, 0.92, clamp(pow(lit, 1.35) * 1.22, 0.0, 1.0));
  vec3 cl = mix(darkBelly, brightTop, lit);
  float alphaMul = 1.0;

  if (sty > 0.5 && sty < 1.5) {
    float g = filmGrainSky(fc, time);
    float stipple = step(g, tone) * 0.94;
    cl = mix(darkBelly * 0.55, brightTop * 1.12, stipple);
    alphaMul = mix(0.85, 1.0, stipple);
  } else if (sty >= 1.5 && sty < 2.5) {
    float g1 = grainHash(floor(fc * 0.913));
    float g2 = grainHash(floor(fc * 0.5) + 19.3);
    float sp = step(g1, pow(tone, 1.25)) * (0.42 + 0.58 * step(g2, tone * 1.15));
    vec2 dc = floor(fc / 17.0);
    vec2 dj = (dc + 0.5 + (vec2(grainHash(dc + 3.1), grainHash(dc + 8.7)) - 0.5) * 0.7) * 17.0;
    float drop = step(0.84, grainHash(dc + 11.9)) * (1.0 - smoothstep(1.1, 2.4, length(fc - dj))) * smoothstep(0.15, 0.65, tone);
    vec2 pc = floor(fc / 26.0);
    vec2 pj = (pc + 0.5 + (vec2(grainHash(pc + 5.3), grainHash(pc + 2.9)) - 0.5) * 0.6) * 26.0;
    float hole = step(0.88, grainHash(pc + 21.4)) * (1.0 - smoothstep(0.8, 1.9, length(fc - pj))) * step(0.65, tone);
    float mark = clamp(sp + drop * 0.85 - hole * 0.8, 0.0, 1.0);
    cl = mix(darkBelly * 0.6, brightTop * 1.08, mark);
  } else if (sty >= 2.5 && sty < 3.5) {
    vec2 cellSz = vec2(3.8);
    vec2 cid = floor(fc / cellSz);
    vec2 sub = fc - (cid + 0.5 + (vec2(grainHash(cid + 1.7), grainHash(cid + 6.3)) - 0.5) * 0.45) * cellSz;
    float openS = grainHash(cid + 9.2) > 0.5 ? 1.0 : -1.0;
    float dArc = mezzotintArc(sub, 1.45, openS);
    float burr = 1.0 - smoothstep(0.32, 1.05, dArc);
    float plate = smoothstep(1.0 - tone * 1.08, 1.0 - tone * 1.08 + 0.35, burr * (0.55 + 0.45 * grainHash(cid + 3.9)));
    cl = mix(darkBelly * 0.48, brightTop * 1.1, plate);
  } else if (sty >= 3.5 && sty < 4.5) {
    float acc = 0.0;
    for (int k = 0; k < 3; k++) {
      float ang = k == 0 ? -0.9 : (k == 1 ? 0.95 : -0.32);
      float ca = cos(ang);
      float sa = sin(ang);
      vec2 rf = mat2(ca, -sa, sa, ca) * (fc + float(k) * 37.0);
      vec2 stId = floor(rf / vec2(44.0, 9.0));
      vec2 stUv = fract(rf / vec2(44.0, 9.0));
      float hair = vnoise(vec2(rf.y * 1.45, stId.x * 7.3 + float(k) * 13.0));
      float uEnd = 0.55 + 0.42 * grainHash(stId + float(k) * 19.0);
      float dry = smoothstep(uEnd, uEnd - 0.38, stUv.x) * smoothstep(0.0, 0.10, stUv.x);
      float groove = step(0.32 + (1.0 - tone) * 0.52, hair * dry);
      acc = max(acc, groove * (k == 0 ? 1.0 : (k == 1 ? 0.8 : 0.65)));
    }
    cl = mix(darkBelly * 0.52, brightTop * 1.12, acc);
    alphaMul = mix(0.75, 1.0, acc);
  } else if (sty >= 4.5 && sty < 5.5) {
    vec2 flow = normalize(flowVec + vec2(0.55, 0.18) + vec2(1e-4));
    float sAcc = grainHash(floor(fc * 0.85));
    float wAcc = 1.0;
    for (int i = 1; i <= 7; i++) {
      float fi = float(i);
      float w = 0.5 + 0.5 * cos(3.14159 * fi / 8.0);
      sAcc += (grainHash(floor((fc + flow * fi * 2.1) * 0.85)) + grainHash(floor((fc - flow * fi * 2.1) * 0.85))) * w;
      wAcc += 2.0 * w;
    }
    float lic = clamp((sAcc / wAcc - 0.5) * 5.8 + 0.5, 0.0, 1.0);
    float thr = mix(0.78, 0.14, pow(tone, 0.75));
    float streak = smoothstep(thr - 0.10, thr + 0.10, lic);
    cl = mix(darkBelly * 0.55, brightTop * 1.1, streak);
  } else if (sty >= 5.5) {
    float qT = floor(time * 8.0) / 8.0;
    float boil = (vnoise(fc * 0.045 + vec2(qT * 13.7, qT * 9.1)) - 0.5) * 0.18;
    float tb = tone + boil;
    float contour = 1.0 - smoothstep(0.0, 0.11, abs(fract(tb * 4.5) - 0.5));
    float ca = cos(-0.4189);
    float sa = sin(-0.4189);
    float rLine = sin((fc.x * ca - fc.y * sa) * 1.35 + boil * 8.0);
    float hatch = step(0.25, rLine) * step(tb, 0.34);
    vec2 sc = floor(fc / 2.7);
    float stip = step(grainHash(sc + qT * 3.1), pow(clamp(tb, 0.0, 1.0), 1.2));
    float ink = clamp(stip * (1.0 - hatch * 0.65) - contour * 0.72, 0.0, 1.0);
    cl = mix(darkBelly * 0.42, brightTop * 1.12, ink);
  }
  return vec4(cl, alphaMul);
}
`;

/* ------------------------------------------------------------------ sky */

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// True 3D spherical environment dome: volumetric Beer-Lambert raymarch through
// a curved concentric 3D atmospheric cumulus shell (zero polygons, zero plane cutoff!).
export const SKY_FRAG = /* glsl */ `
uniform vec3 uZen;
uniform vec3 uHor;
uniform vec3 uSkySunCol;
uniform vec3 uSunDir;
uniform vec3 uSolarDir;
uniform vec3 uCloudCol;
uniform float uStars;
uniform float uStarRot;
uniform float uCloud;
uniform float uCloudType;
uniform float uCloudStyle;
uniform float uCloudSeed;
uniform float uCloudEvol;
uniform float uCloudLac;
uniform float uCloudElev;
uniform float uCloudRange;
uniform vec3 uCloudLayerElev;
uniform vec3 uCloudLayerThick;
uniform vec3 uCloudLayerDens;
uniform float uHaze;
uniform float uTime;
uniform float uSunGlow;
uniform float uSat;
uniform vec3 uMoonDir;
uniform float uMoonSize;
uniform float uMoonGlow;
uniform float uMoonPhase;
uniform float uFlash;
uniform float uWorldCurve;
uniform float uPlanetR;
uniform float uWindAngle;
uniform float uWindStrength;
uniform float uPerfQuality;
varying vec3 vDir;
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_STORMY_PLATE}

vec2 intersectSphereShell(vec3 oc, vec3 rd, float rad) {
  float b = dot(oc, rd);
  float c = dot(oc, oc) - rad * rad;
  float disc = b * b - c;
  if (disc < 0.0) return vec2(1e9, -1e9);
  float s = sqrt(disc);
  return vec2(-b - s, -b + s);
}

// Multi-regime 3D volumetric cloud density driven by 4D noise evolution, seed & lacunarity:
// 0 = Cumulus, 1 = Cumulonimbus thunderheads, 2 = Stratocumulus deck,
// 3 = High ice Cirrus, 4 = Multi-layer Altocumulus + Cirrus, 5 = Low Sea-of-Clouds
float skyCumulusDensity(vec3 p, float h01, float covK, float cType, float t) {
  // Coherent prevailing wind streamlines + altitude Ekman veer (100% seamless loop at PC_LOOP = 120s!)
  float wAng = uWindAngle + h01 * 0.26;
  float cwA = cos(wAng);
  float swA = sin(wAng);
  vec2 orbWind = loopOrbit(t, 440.0 * mix(0.65, 1.35, clamp(uWindStrength, 0.0, 2.0)), 1.0);
  vec3 wind = vec3(cwA * orbWind.x - swA * orbWind.y * 0.45, 0.0, swA * orbWind.x + cwA * orbWind.y * 0.45);
  vec3 pw = vec3(p.x * cwA + p.z * swA, p.y, -p.x * swA + p.z * cwA);
  float w4 = loopSin(t, 0.025, 0.0) * 1.85 * max(uCloudEvol, 0.0) + loopCos(t, 0.017, 1.1) * 0.95 * max(uCloudEvol, 0.0);
  float lac = clamp(uCloudLac, 1.25, 3.4);
  float sOff = uCloudSeed;
  float over = clamp((covK - 1.05) / 1.15, 0.0, 1.0);
  // Multi-stratum vertical modulation when cloud range is tall (> 500m) so clouds form layered decks
  float multiDeck = 0.78 + 0.22 * cos(h01 * 9.42 + sOff);

  if (cType > 2.5 && cType < 3.5) {
    // 3: High ice-crystal Cirrus & wind-sheared mares' tails aligned with prevailing wind
    vec3 cw = (pw + vec3(orbWind.x * 2.1 + h01 * 560.0, 0.0, orbWind.y * 0.45)) * vec3(0.00018, 0.0014, 0.00054);
    float warp = fbm4Cloud(cw * 0.85, w4 * 0.7, lac, sOff);
    float wisps = fbm4Cloud(cw * vec3(1.5, 1.0, 3.5) + vec3(warp * 2.4, 0.0, -warp * 1.6), w4, lac, sOff + 3.1);
    float fine = vnoise4(vec4(cw * vec3(4.5, 1.8, 7.5), w4 * 1.3 + sOff));
    float prof = smoothstep(0.05, 0.45, h01) * smoothstep(1.0, 0.48, h01);
    float shape = (wisps * 0.72 + fine * 0.28) * (0.65 + 0.55 * prof);
    float thresh = mix(clamp(0.58 - covK * 0.20, 0.22, 0.64), 0.16, over);
    return clamp((shape - thresh) * 2.2, 0.0, 0.78) * prof;
  }

  if (cType > 1.5 && cType < 2.5) {
    // 2: Stratocumulus wind-streets & cellular rolls aligned along wind streamlines
    vec3 sq = (pw + vec3(orbWind.x * 0.85, 0.0, orbWind.y * 0.35)) * vec3(0.00026, 0.00125, 0.00046);
    float rolls = fbm4Cloud(sq * vec3(0.80, 1.0, 1.60), w4 * 0.8, lac, sOff);
    float cells = fbm4Cloud(sq * 2.6 + vec3(4.1, -1.3, 2.7), w4 * 1.15, lac, sOff + 5.7);
    float detail = vnoise4(vec4(sq * 5.4, w4 * 1.4 + sOff));
    float prof = smoothstep(0.03, 0.26, h01) * smoothstep(1.0, 0.44, h01);
    float shape = (rolls * 0.62 + cells * 0.38) * (0.62 + 0.52 * prof) - detail * 0.09;
    float thresh = mix(clamp(0.53 - covK * 0.24, 0.16, 0.60), 0.06, over);
    return clamp((shape - thresh) * 3.25, 0.0, 1.0) * prof;
  }

  if (cType > 0.5 && cType < 1.5) {
    // 1: Towering Cumulonimbus storm cells with downwind-sheared glaciated anvil tops
    float anvilShear = smoothstep(0.58, 0.96, h01);
    vec3 tp = pw + vec3(orbWind.x * (0.9 + anvilShear * 1.15) - anvilShear * 720.0, 0.0, orbWind.y * 0.4);
    vec3 tq = tp * vec3(mix(0.00028, 0.00016, anvilShear), 0.00042, mix(0.00028, 0.00020, anvilShear));
    float core = fbm4Cloud(tq, w4, lac, sOff);
    float turret = fbm4Cloud(tq * 2.45 + vec3(2.9, -3.1, 4.7), w4 * 1.35, lac, sOff + 7.9);
    float detail = vnoise4(vec4(tq * 5.6, w4 * 1.6 + sOff));
    float baseProf = smoothstep(0.01, 0.14, h01);
    float topProf = smoothstep(1.0, 0.78, h01);
    float anvilBoost = 1.0 + anvilShear * 0.28;
    float prof = baseProf * topProf;
    float shape = (core * 0.68 + turret * 0.32) * (0.58 + 0.58 * baseProf) * anvilBoost - detail * 0.12;
    float thresh = mix(clamp(0.55 - covK * 0.22, 0.18, 0.62), 0.08, over);
    return clamp((shape - thresh) * 3.1, 0.0, 1.0) * prof;
  }

  if (cType > 3.5 && cType < 4.5) {
    // 4: Multi-layer deck — mid-altitude mackerel Altocumulus + high sheared Cirrus
    float lowBand = smoothstep(0.03, 0.16, h01) * smoothstep(0.44, 0.24, h01);
    float hiBand = smoothstep(0.64, 0.78, h01) * smoothstep(1.0, 0.84, h01);
    float dOut = 0.0;
    if (lowBand > 0.005) {
      vec3 mq = (p + wind * 0.95) * vec3(0.00042, 0.0011, 0.00048);
      float m1 = fbm4Cloud(mq * 1.4, w4, lac, sOff);
      float m2 = vnoise4(vec4(mq * 4.2, w4 * 1.3 + sOff));
      float sh = m1 * 0.78 + m2 * 0.22;
      float th = mix(clamp(0.55 - covK * 0.22, 0.18, 0.62), 0.09, over);
      dOut += clamp((sh - th) * 3.0, 0.0, 1.0) * lowBand;
    }
    if (hiBand > 0.005) {
      vec3 hq = (p + wind * 2.2 + vec3(320.0, 0.0, -180.0)) * vec3(0.00020, 0.0015, 0.00055);
      float w1 = fbm4Cloud(hq * vec3(1.5, 1.0, 3.1), w4 * 0.85, lac, sOff + 9.3);
      float thH = mix(clamp(0.56 - covK * 0.20, 0.20, 0.62), 0.14, over);
      dOut += clamp((w1 - thH) * 2.3, 0.0, 0.75) * hiBand;
    }
    return clamp(dOut, 0.0, 1.0);
  }

  if (cType > 4.5) {
    // 5: Low urban Sea-of-Clouds / canyon inversion blanket
    vec3 fq = (p + wind * 0.55) * vec3(0.00030, 0.0016, 0.00030);
    float swell = fbm4Cloud(fq, w4 * 0.75, lac, sOff);
    float crest = fbm4Cloud(fq * 2.5 + vec3(1.7, 2.3, -3.4), w4 * 1.1, lac, sOff + 4.4);
    float prof = smoothstep(0.0, 0.22, h01) * smoothstep(1.0, 0.42, h01);
    float shape = (swell * 0.66 + crest * 0.34) * (0.66 + 0.48 * prof);
    float thresh = mix(clamp(0.50 - covK * 0.24, 0.12, 0.58), 0.04, over);
    return clamp((shape - thresh) * 3.4, 0.0, 1.0) * prof;
  }

  // 0: Fair-weather Cumulus humilis / mediocris (multi-tier vertical spread!)
  vec3 q = (p + wind) * vec3(0.00034, 0.00072, 0.00034);
  float macro = fbm4Cloud(q, w4, lac, sOff);
  float billow = fbm4Cloud(q * 2.35 + vec3(3.7, -1.9, 5.1), w4 * 1.3, lac, sOff + 6.2);
  float detail = vnoise4(vec4(q * 5.8 + vec3(orbWind.x * 0.002, 0.0, orbWind.y * 0.002), w4 * 1.7 + sOff));
  float prof = smoothstep(0.02, 0.20, h01) * smoothstep(1.0, 0.34, h01) * multiDeck;
  float shape = (macro * 0.66 + billow * 0.34) * (0.55 + 0.62 * prof) - detail * 0.14;
  float thresh = mix(clamp(0.56 - covK * 0.21, 0.20, 0.62), 0.08, over);
  return clamp((shape - thresh) * 2.85, 0.0, 1.0) * prof;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 sd = normalize(uSunDir);
  vec3 solarD = normalize(uSolarDir);
  float horMask = mix(smoothstep(-0.045, 0.014, d.y), 1.0, clamp(uWorldCurve * 1.35, 0.0, 1.0));

  // In sphere/orbital mode, gradient wraps smoothly across both hemispheres
  float elev = mix(smoothstep(-0.18, 0.58, d.y), smoothstep(-0.85, 0.75, d.y) * 0.85 + 0.15, uWorldCurve * 0.75);
  vec3 col = mix(uHor, uZen, pow(clamp(elev, 0.0, 1.0), 0.8));

  // True astronomical sun: rises in the East, transits high, sets below Western horizon (y < 0 at night)
  float sunVis = smoothstep(-0.16, 0.03, solarD.y);
  float s = max(dot(d, solarD), 0.0);
  if (sunVis > 0.001) {
    float disc = smoothstep(0.99962, 0.99993, s) * smoothstep(-0.03, 0.02, solarD.y) * horMask;
    float halo = (pow(s, 14.0) * 0.55 + pow(s, 5.0) * 0.18) * sunVis * mix(horMask * 0.85 + 0.15, 1.0, uWorldCurve);
    // Overcast decks naturally soften direct solar disc glare
    float overcastDim = 1.0 - 0.78 * smoothstep(1.15, 2.1, uCloud);
    col += uSkySunCol * (disc * 2.8 * overcastDim + halo * (0.55 + uSunGlow * 1.4)) * (0.35 + uSunGlow * 0.75);
  }
  // Civil/nautical twilight glow hugging the rising/setting solar azimuth near the horizon
  float twi = exp(-pow((solarD.y + 0.05) / 0.18, 2.0)) * (1.0 - uWorldCurve * 0.55);
  if (twi > 0.01) {
    float azAlign = pow(max(dot(normalize(vec3(d.x, 0.0, d.z) + vec3(1e-5)), normalize(vec3(solarD.x, 0.0, solarD.z) + vec3(1e-5))), 0.0), 3.0);
    float bandH = exp(-abs(d.y) * 8.5);
    col += uSkySunCol * twi * azAlign * bandH * (0.28 + uSunGlow * 0.35);
  }

  // Sidereal rotating star vault behind volumetric clouds (rotates around inclined celestial pole)
  float starFloor = mix(-0.02, -1.02, clamp(uWorldCurve * 1.3, 0.0, 1.0));
  if (uStars > 0.002 && d.y > starFloor) {
    vec3 pole = normalize(vec3(0.0, 0.743, 0.669));
    float cR = cos(uStarRot);
    float sR = sin(uStarRot);
    vec3 dStar = d * cR + cross(pole, d) * sR + pole * dot(pole, d) * (1.0 - cR);
    vec2 sph = vec2(atan(dStar.z, dStar.x), asin(clamp(dStar.y, -1.0, 1.0)));
    vec2 g = sph * 42.0;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float sh = hash12(id + 0.5);
    float star = step(0.981, sh) * (1.0 - smoothstep(0.0, 0.105, length(f)));
    star *= 0.65 + 0.35 * sin(uTime * 2.4 + sh * 60.0);
    // Faint galactic star-band sweeping diagonally across the celestial sphere
    float mwBand = exp(-pow((dStar.y * 0.58 - dStar.x * 0.62 + dStar.z * 0.25) * 3.4, 2.0));
    float mw = mwBand * fbm(sph * 3.8 + 2.1) * 0.14;
    float starVis = mix(smoothstep(-0.02, 0.12, d.y), 1.0, clamp(uWorldCurve * 1.2, 0.0, 1.0));
    vec3 starTint = mix(vec3(0.78, 0.86, 1.0), vec3(1.0, 0.90, 0.76), fract(sh * 13.7));
    col += (starTint * star + vec3(0.56, 0.66, 0.92) * mw) * uStars * starVis;
  }

  // Complete 8-phase 3D spherical Moon behind volumetric clouds:
  // uMoonPhase: 0.0 = New, 0.125 = Waxing Crescent, 0.25 = First Quarter,
  // 0.375 = Waxing Gibbous, 0.5 = Full, 0.625 = Waning Gibbous, 0.75 = Third Quarter, 0.875 = Waning Crescent
  vec3 md = normalize(uMoonDir);
  float moonAbove = mix(smoothstep(-0.08, 0.01, md.y), 1.0, clamp(uWorldCurve * 1.35, 0.0, 1.0));
  if (uMoonGlow > 0.003 && moonAbove > 0.002 && dot(d, md) > 0.2) {
    vec3 mright = normalize(cross(vec3(0.0, 1.0, 0.0), md) + vec3(1e-4, 0.0, 0.0));
    vec3 mup = cross(md, mright);
    vec2 muv = vec2(dot(d, mright), dot(d, mup));
    float moonR = 0.044 * max(uMoonSize, 0.15);
    vec2 mp = muv / moonR;
    float r2 = dot(mp, mp);
    float mAng = length(muv);

    // uMoonPhase in 0..2: 0 = New, 0.25 = Waxing Crescent, 0.5 = First Quarter, 0.75 = Waxing Gibbous,
    // 1.0 = Full Moon, 1.25 = Waning Gibbous, 1.5 = Third Quarter, 1.75 = Waning Crescent, 2.0 = New
    float phi = uMoonPhase * 3.14159265;
    float illumFrac = 0.5 - 0.5 * cos(phi);

    if (r2 < 1.06) {
      float mDisc = (1.0 - smoothstep(0.92, 1.0, sqrt(r2))) * horMask * moonAbove;
      float mz = sqrt(max(0.0, 1.0 - min(r2, 1.0)));
      // Lunar maria basalt plains + subtle terminator crater-rim relief
      float maria = fbm(mp * 2.35 + vec2(1.7, -0.85));
      float c1 = vnoise(mp * 11.5 + 4.3);
      float c2 = vnoise(mp * 24.0 - 2.1);
      vec2 relief = vec2(c1 - 0.5, c2 - 0.5) * 0.11;
      vec3 mn = normalize(vec3(mp.x + relief.x, mp.y + relief.y, mz));

      // 3D sun illumination vector in moon-view frame driven by synodic phase phi
      vec3 mSun = normalize(vec3(sin(phi), 0.07 * sin(phi), -cos(phi)));
      float ndl = dot(mn, mSun);
      // Lommel-Seeliger-like lunar reflectance: crisp terminator, full bright limb at phi = pi
      float term = smoothstep(-0.045, 0.075, ndl);
      float lommel = max(ndl, 0.0) / (max(ndl, 0.0) + max(mn.z, 0.14) * 0.55 + 0.05);
      float litMoon = term * mix(0.42, 1.08, lommel);

      float albedo = mix(0.62, 1.04, smoothstep(0.36, 0.66, maria)) * (0.86 + 0.14 * c1);
      // Subtle blue-silver planetshine ("earthshine") on the unlit lunar nightside so New/Crescent moons read as real 3D spheres!
      float earthshine = (0.042 + 0.032 * (1.0 - illumFrac)) * (0.65 + 0.35 * mz);
      float limbRim = pow(1.0 - mz, 3.0) * 0.09 * (0.35 + 0.65 * illumFrac);
      vec3 litTint = vec3(0.92, 0.95, 1.02) * (1.05 + uMoonGlow * 1.25);
      vec3 darkTint = mix(col * 0.35, vec3(0.42, 0.54, 0.78), 0.65) * (0.6 + uMoonGlow * 0.6);
      vec3 moonSurf = (litTint * litMoon * albedo + darkTint * earthshine + litTint * limbRim);
      // Occlude stars behind the solid lunar sphere and add illuminated lunar disc
      col = mix(col, moonSurf, mDisc * clamp(0.82 + 0.18 * litMoon, 0.0, 1.0));
    }

    float haloM = (1.0 - smoothstep(moonR * 0.85, moonR * 3.8, mAng)) * horMask * moonAbove;
    col += vec3(0.62, 0.72, 1.0) * haloM * uMoonGlow * (0.07 + 0.34 * illumFrac);
  }

  // True 3D volumetric raymarch through selectable multi-altitude concentric spherical cloud shells (Low / Mid / High)
  float rawElevMul = (uCloudElev > 20.0) ? (uCloudElev / 260.0) : max(0.03, uCloudElev);
  float lowestActiveBase = 99999.0;
  if (uCloudLayerDens.x > 0.015) lowestActiveBase = min(lowestActiveBase, max(4.0, uCloudLayerElev.x * rawElevMul));
  if (uCloudLayerDens.y > 0.015) lowestActiveBase = min(lowestActiveBase, max(4.0, uCloudLayerElev.y * rawElevMul));
  if (uCloudLayerDens.z > 0.015) lowestActiveBase = min(lowestActiveBase, max(4.0, uCloudLayerElev.z * rawElevMul));
  float aboveCloudDeck = smoothstep(lowestActiveBase - 25.0, lowestActiveBase + 35.0, cameraPosition.y);
  float minElev = mix(mix(-0.14, -0.96, aboveCloudDeck), -1.02, clamp(uWorldCurve * 1.4, 0.0, 1.0));
  float maxLayerD = max(uCloudLayerDens.x, max(uCloudLayerDens.y, uCloudLayerDens.z));
  if (uCloud > 0.01 && maxLayerD > 0.01 && d.y > minElev) {
    float curveBlend = smoothstep(0.02, 0.35, uWorldCurve);
    float globeR = max(uPlanetR, 1200.0) / max(uWorldCurve, 0.04);
    float atmoR = mix(15500.0, globeR, curveBlend);
    vec3 sphereCenter = mix(
      vec3(cameraPosition.x * 0.65, -atmoR, cameraPosition.z * 0.65),
      vec3(0.0, -atmoR, 0.0),
      curveBlend
    );
    vec3 oc = cameraPosition - sphereCenter;
    float rCam = length(oc);

    // Master elevation & range multipliers (supports lowering all the way down to street canyons!)
    float elevMul = rawElevMul;
    float rangeMul = (uCloudRange > 20.0) ? (uCloudRange / 780.0) : max(0.10, uCloudRange);
    float maxMarch = mix(13500.0, max(atmoR * 2.8, 9000.0), curveBlend);
    vec2 fc = gl_FragCoord.xy;
    float covBase = clamp(uCloud, 0.0, 2.5);
    float overTint = smoothstep(1.15, 2.2, covBase);

    vec3 darkBelly = mix(uCloudCol * 0.34, uHor * 0.44, 0.26) * (1.0 - 0.26 * overTint);
    vec3 brightTop = mix(uCloudCol + uSkySunCol * 0.92, vec3(0.97, 0.96, 0.93), 0.30) * (1.0 - 0.14 * overTint);
    float cosTheta = dot(d, sd);
    float hgPhase = 0.25 + 0.95 * pow(max(cosTheta, 0.0), 6.0) * (0.4 + uSunGlow * 0.85);

    float totalTr = 1.0;
    vec3 totalAccum = vec3(0.0);
    float totalLit = 0.0;
    float totalW = 0.0;
    float nearestT = 1e9;
    vec3 repP = cameraPosition + d * 1800.0;

    // March Low (0), Mid (1), High (2) in camera-nearest order along the ray
    bool topDown = (d.y < 0.0 && rCam > atmoR + uCloudLayerElev.y * elevMul);
    for (int passIdx = 0; passIdx < 3; passIdx++) {
      if (totalTr < 0.03) break;
      int L = topDown ? (2 - passIdx) : passIdx;
      float lDens = (L == 0) ? uCloudLayerDens.x : ((L == 1) ? uCloudLayerDens.y : uCloudLayerDens.z);
      if (lDens <= 0.015) continue;

      float rawBase = (L == 0) ? uCloudLayerElev.x : ((L == 1) ? uCloudLayerElev.y : uCloudLayerElev.z);
      float rawThick = (L == 0) ? uCloudLayerThick.x : ((L == 1) ? uCloudLayerThick.y : uCloudLayerThick.z);
      float baseH = max(4.0, rawBase * elevMul);
      float spanH = max(24.0, rawThick * rangeMul);
      float layerType = uCloudType;
      float extMul = 1.0;

      if (L == 0) {
        // Low deck: misty stratus / skyscraper-skimming deck unless user picked thunderheads
        layerType = (uCloudType > 0.5 && uCloudType < 1.5) ? 1.0 : 2.0;
        extMul = 1.18;
      } else if (L == 1) {
        if (uCloudType > 0.5 && uCloudType < 1.5) { spanH *= 1.65; extMul = 1.25; }
        else if (uCloudType > 1.5 && uCloudType < 2.5) { spanH *= 0.72; extMul = 1.32; }
        else if (uCloudType > 2.5 && uCloudType < 3.5) { baseH *= 1.28; spanH *= 0.80; extMul = 0.52; }
        else if (uCloudType > 4.5) { baseH = max(4.0, baseH * 0.48); spanH *= 0.62; extMul = 1.45; }
      } else {
        // High deck: wind-sheared altocumulus / cirrus canopy
        layerType = (uCloudType < 0.5) ? 4.0 : ((uCloudType > 1.5 && uCloudType < 2.5) ? 3.0 : uCloudType);
        extMul = 0.62;
      }

      float rBase = atmoR + baseH;
      float rTop = rBase + spanH;
      vec2 hit0 = intersectSphereShell(oc, d, rBase);
      vec2 hit1 = intersectSphereShell(oc, d, rTop);
      float tStart = 0.0;
      float tEnd = -1.0;

      if (rCam < rBase) {
        tStart = max(0.0, hit0.y);
        tEnd = hit1.y;
      } else if (rCam <= rTop) {
        tStart = 0.0;
        tEnd = (hit0.x > 0.0) ? min(hit0.x, hit1.y) : hit1.y;
      } else if (hit1.x > 0.0) {
        tStart = hit1.x;
        tEnd = (hit0.x > 0.0) ? hit0.x : hit1.y;
      }
      tEnd = min(tEnd, tStart + maxMarch);

      if (tEnd > tStart + 8.0) {
        nearestT = min(nearestT, tStart);
        float jit = grainHash(fc + float(L) * 37.0 + fract(uTime * 7.31) * 113.0);
        float span = tEnd - tStart;
        int maxSkySteps = uPerfQuality < 0.48 ? 3 : (uPerfQuality < 0.78 ? 4 : 6);
        float dtStep = span / float(maxSkySteps);
        float covK = clamp(covBase * lDens, 0.0, 2.5);
        vec3 layerOff = vec3(float(L) * 910.0, 0.0, float(L) * -670.0);
        if (totalW < 1e-3) repP = cameraPosition + d * (tStart + span * 0.45);

        for (int i = 0; i < 6; i++) {
          if (i >= maxSkySteps || totalTr < 0.025) break;
          float tCur = tStart + (float(i) + jit) * dtStep;
          vec3 p = cameraPosition + d * tCur;
          float h01 = clamp((length(p - sphereCenter) - rBase) / spanH, 0.0, 1.0);
          float dens = skyCumulusDensity(p + layerOff, h01, covK, layerType, uTime);
          if (dens > 0.004) {
            float shDens = 0.0;
            if (uPerfQuality < 0.56) {
              // Fast low-power analytical self-shadow (avoids 2nd 3D FBM evaluation per step!)
              shDens = dens * 0.68 * (1.0 - h01 * 0.58);
            } else {
              vec3 pSun = p + sd * 145.0;
              float hSun = clamp((length(pSun - sphereCenter) - rBase) / spanH, 0.0, 1.0);
              shDens = skyCumulusDensity(pSun + layerOff, hSun, covK, layerType, uTime);
            }
            float sunTrans = exp(-shDens * 2.5);
            float powder = 1.0 - exp(-dens * 3.4);
            // High decks catch slightly warmer/brighter upper-troposphere light
            float altWarm = float(L) * 0.08;
            float lit = clamp(sunTrans * (0.52 + 0.55 * h01 + altWarm) + 0.10 + 0.16 * h01, 0.0, 1.28);
            vec3 stepCol = mix(darkBelly, brightTop, clamp(lit, 0.0, 1.0));
            stepCol += uSkySunCol * sunTrans * (0.35 + 0.65 * powder) * hgPhase * 0.55;

            float sig = dens * (0.0025 + covK * 0.0014) * extMul;
            float stepT = exp(-sig * dtStep);
            float w = totalTr * (1.0 - stepT);
            totalAccum += w * stepCol;
            totalLit += w * lit;
            totalW += w;
            totalTr *= stepT;
          }
        }
      }
    }

    float cloudAlpha = 1.0 - totalTr;
    if (cloudAlpha > 0.004) {
      vec3 cRgb = totalAccum / max(totalW, 1e-4);
      float meanLit = totalLit / max(totalW, 1e-4);
      if (uCloudStyle > 0.5) {
        vec4 plate = evalStormyPlate(meanLit, uCloudStyle, fc, repP.xz * 0.0012, darkBelly, brightTop, uTime);
        cRgb = mix(cRgb, plate.rgb, 0.85);
        cloudAlpha *= plate.a;
      }
      float distFade = mix(smoothstep(-0.10, 0.07, d.y), 1.0, clamp(uWorldCurve * 1.3, 0.0, 1.0));
      float farAtmo = smoothstep(3500.0, 14500.0, nearestT) * (1.0 - curveBlend * 0.65);
      cRgb = mix(cRgb, mix(uHor, uSkySunCol, pow(s, 5.0) * 0.35), farAtmo * 0.58);
      col = mix(col, cRgb, clamp(cloudAlpha * distFade, 0.0, 0.985));
    }
  }

  // horizon haze band — softens in orbital sphere mode so space stays crisp
  float hz = exp(-abs(d.y) * 7.0) * uHaze * 0.55 * (1.0 - uWorldCurve * 0.65);
  col = mix(col, uHor, clamp(hz, 0.0, 0.85));

  // lightning flash
  col += vec3(0.85, 0.9, 1.1) * uFlash;

  col = saturate3(col, uSat);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---------------------------------------------------- 3D cloud volumes */
// Raymarched 3D volumetric cumulus banks inside BackSide bounding boxes.
// Density falls strictly to 0.0 inside local radius 0.88 (well inside [-1, 1]^3),
// guaranteeing ZERO polygon edges or silhouettes from outside or inside!

export const CLOUD_VERT = /* glsl */ `
attribute vec3 aCenter;
attribute vec3 aScale;
attribute float aSeed;
attribute float aLayer;
uniform float uCloudType;
uniform float uCloudElev;
uniform float uCloudRange;
uniform float uCloudPuffs;
uniform vec3 uCloudLayerElev;
uniform vec3 uCloudLayerThick;
uniform vec3 uCloudLayerDens;
uniform float uWindAngle;
uniform float uWindStrength;
varying vec3 vWorld;
varying vec3 vCenterW;
varying vec3 vAxisX;
varying vec3 vAxisY;
varying vec3 vAxisZ;
varying vec3 vHalfExt;
varying float vSeed;
varying float vLayerDens;
varying float vLayerIdx;
${GLSL_CURVE}
void main() {
  vSeed = aSeed;
  vLayerIdx = aLayer;
  vec3 ctr = aCenter;
  vec3 scl = aScale;
  float elevMul = (uCloudElev > 20.0) ? (uCloudElev / 260.0) : max(0.03, uCloudElev);
  float rangeMul = (uCloudRange > 20.0) ? (uCloudRange / 780.0) : max(0.10, uCloudRange);

  float rawBase = (aLayer < 0.5) ? uCloudLayerElev.x : ((aLayer < 1.5) ? uCloudLayerElev.y : uCloudLayerElev.z);
  float rawThick = (aLayer < 0.5) ? uCloudLayerThick.x : ((aLayer < 1.5) ? uCloudLayerThick.y : uCloudLayerThick.z);
  float lDens = (aLayer < 0.5) ? uCloudLayerDens.x : ((aLayer < 1.5) ? uCloudLayerDens.y : uCloudLayerDens.z);
  float puffAmt = uCloudPuffs;
  float effDens = lDens * puffAmt;
  vLayerDens = effDens;

  float hFrac = clamp((aCenter.y - 185.0) / 315.0 * 0.55 + fract(aSeed * 7.31) * 0.45, 0.0, 1.0);
  float baseY = max(4.0, rawBase * elevMul);
  float spanY = max(20.0, rawThick * rangeMul);
  float vThick = clamp(sqrt(spanY / 420.0), 0.24, 1.95);
  ctr.y = baseY + hFrac * spanY;
  scl.y *= vThick;

  if (aLayer < 0.5) {
    // Low tower-skimming stratus/mist puffs
    scl *= vec3(1.35, 0.55, 1.35);
  } else if (aLayer > 1.5) {
    // High altocumulus/cirrus canopy wisps
    scl *= vec3(2.05, 0.30, 1.10);
  } else if (uCloudType > 0.5 && uCloudType < 1.5) {
    ctr.y = max(4.0, baseY * 0.85) + hFrac * spanY * 1.45;
    scl *= vec3(1.15, 1.85, 1.15);
  } else if (uCloudType > 1.5 && uCloudType < 2.5) {
    ctr.y = baseY * 1.02 + hFrac * spanY * 0.42;
    scl *= vec3(1.75, 0.52, 1.55);
  } else if (uCloudType > 2.5 && uCloudType < 3.5) {
    ctr.y = baseY * 1.25 + hFrac * spanY * 0.75;
    scl *= vec3(2.25, 0.28, 0.85);
  } else if (uCloudType > 3.5 && uCloudType < 4.5) {
    float upper = step(0.5, fract(aSeed * 13.7));
    ctr.y = mix(baseY + hFrac * spanY * 0.42, baseY + spanY * (0.68 + hFrac * 0.48), upper);
    scl *= mix(vec3(1.35, 0.65, 1.35), vec3(2.0, 0.32, 0.9), upper);
  } else if (uCloudType > 4.5) {
    ctr.y = max(4.0, baseY * 0.38) + hFrac * max(20.0, spanY * 0.42);
    scl *= vec3(1.90, 0.54, 1.85);
  }

  // Keep puff bottom from plunging deep underground when lowered to street level
  ctr.y = max(ctr.y, max(6.0, scl.y * 0.18));

  // Wind-guided coherent streamline orientation:
  // Nearby clouds share smooth atmospheric wind streamlines + tropospheric Ekman altitude veer
  // (low stratus -> mid cumulus -> high cirrus), eliminating chaotic random angles between puffs!
  float wStr = clamp(uWindStrength, 0.0, 2.5);
  scl.z *= mix(1.0, 1.38, clamp(wStr * 0.55, 0.0, 1.0));
  vHalfExt = max(scl * 0.5, vec3(1.0));
  vCenterW = bendWorld(ctr);
  vec3 upAxis = normalize(bendNormal(ctr.xz, vec3(0.0, 1.0, 0.0)));
  float crossWind = dot(ctr.xz, vec2(-sin(uWindAngle), cos(uWindAngle)));
  float alongWind = dot(ctr.xz, vec2(cos(uWindAngle), sin(uWindAngle)));
  float streamWave = 0.22 * sin(crossWind * 0.00038 + alongWind * 0.00017)
    + 0.09 * cos(crossWind * 0.00085 - alongWind * 0.00029);
  float ekmanVeer = aLayer * 0.22;
  float localEddy = (aSeed - 0.5) * mix(0.26, 0.11, clamp(wStr * 0.7, 0.0, 1.0));
  float yaw = uWindAngle + streamWave + ekmanVeer + localEddy;
  // Align axZ (major puff stretch axis in cirrus/stratocumulus) cleanly along the wind streamline!
  vec3 windH = vec3(cos(yaw), 0.0, sin(yaw));
  vec3 axX = cross(upAxis, windH);
  if (dot(axX, axX) < 1e-4) axX = cross(upAxis, vec3(1.0, 0.0, 0.0));
  axX = normalize(axX);
  vec3 axZ = normalize(cross(axX, upAxis));
  vAxisX = axX;
  vAxisY = upAxis;
  vAxisZ = axZ;

  // Collapse inactive layer puffs outside clip frustum with zero fragment cost!
  if (effDens <= 0.015) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  // position is unit cube [-0.5, 0.5]^3 => local [-1, 1]^3 scaled by vHalfExt
  vec3 loc = position * 2.0;
  vec3 wp = vCenterW + axX * (loc.x * vHalfExt.x) + upAxis * (loc.y * vHalfExt.y) + axZ * (loc.z * vHalfExt.z);
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const CLOUD_FRAG = /* glsl */ `
uniform vec3 uCloudCol;
uniform vec3 uSkySunCol;
uniform vec3 uSunDir;
uniform vec3 uFogCol;
uniform vec3 uSunFogCol;
uniform float uHazeSun;
uniform float uCloud;
uniform float uCloudPuffs;
uniform float uCloudType;
uniform float uCloudStyle;
uniform float uCloudSeed;
uniform float uCloudEvol;
uniform float uCloudLac;
uniform float uSunGlow;
uniform vec3 uPoolCol;
uniform float uLightK;
uniform float uTime;
uniform float uSat;
uniform float uPerfQuality;
varying vec3 vWorld;
varying vec3 vCenterW;
varying vec3 vAxisX;
varying vec3 vAxisY;
varying vec3 vAxisZ;
varying vec3 vHalfExt;
varying float vSeed;
varying float vLayerDens;
varying float vLayerIdx;
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_STORMY_PLATE}

vec3 worldToCloudLocal(vec3 p) {
  vec3 d = p - vCenterW;
  return vec3(
    dot(d, vAxisX) / vHalfExt.x,
    dot(d, vAxisY) / vHalfExt.y,
    dot(d, vAxisZ) / vHalfExt.z
  );
}

float puffVolDensity(vec3 pL, float covK, float cType, float seed, float t) {
  // Ellipsoidal radial falloff strictly reaches 0.0 at r = 0.88 (< 1.0 cube wall!)
  vec3 sq = vec3(pL.x, pL.y * 1.10 - 0.05, pL.z);
  float r = length(sq);
  if (r >= 0.88) return 0.0;
  float baseFloor = (cType > 2.5 && cType < 3.5) ? smoothstep(-0.85, 0.0, pL.y) : smoothstep(-0.78, -0.20, pL.y);
  float wallFade = smoothstep(0.88, 0.56, r) * baseFloor;
  float coreEnv = (1.0 - smoothstep(0.18, 0.86, r)) * baseFloor;
  vec3 freq = (cType > 2.5 && cType < 3.5) ? vec3(1.4, 3.3, 4.5) : vec3(2.35, 2.35, 2.35);
  vec2 orbP = loopOrbit(t, 0.85, 1.0);
  vec3 drift = vec3(orbP.x, 0.0, orbP.y * 0.7) + seed * 17.3;
  float w4 = loopSin(t, 0.025, seed * 6.28) * 1.95 * max(uCloudEvol, 0.0);
  float lac = clamp(uCloudLac, 1.25, 3.4);
  float n1 = fbm4Cloud(pL * freq + drift, w4, lac, uCloudSeed + seed * 7.0);
  float n2 = fbm4Cloud(pL * (freq * 2.15) - drift * 1.4, w4 * 1.35, lac, uCloudSeed + 4.3);
  // Deep fractal carving so puff edges form irregular cauliflower wisps instead of smooth oval pills!
  float fbmMix = n1 * 0.66 + n2 * 0.34;
  float raw = coreEnv * 0.48 + (fbmMix - 0.44) * 0.88;
  float cut = clamp(0.30 - covK * 0.11, 0.04, 0.34);
  return clamp((raw - cut) * 3.10, 0.0, 1.0) * wallFade;
}

void main() {
  if (uCloud <= 0.015 || uCloudPuffs <= 0.015 || vLayerDens <= 0.015) discard;
  vec3 rayVec = vWorld - cameraPosition;
  float distToBack = length(rayVec);
  if (distToBack < 1e-3) discard;
  vec3 rdW = rayVec / distToBack;

  vec3 roL = worldToCloudLocal(cameraPosition);
  vec3 backL = worldToCloudLocal(vWorld);
  vec3 segL = backL - roL;
  float segLenL = length(segL);
  if (segLenL < 1e-4) discard;
  vec3 rdL = segL / segLenL;

  float b = dot(roL, rdL);
  float c = dot(roL, roL) - 0.7744; // 0.88^2
  float disc = b * b - c;
  if (disc <= 0.0) discard;
  float sqD = sqrt(disc);
  float t0 = max(0.0, -b - sqD);
  float t1 = min(segLenL, -b + sqD);
  if (t1 <= t0 + 0.01) discard;

  vec3 sd = normalize(uSunDir);
  vec3 sdL = normalize(vec3(
    dot(sd, vAxisX) / vHalfExt.x,
    dot(sd, vAxisY) / vHalfExt.y,
    dot(sd, vAxisZ) / vHalfExt.z
  ));

  float jit = grainHash(gl_FragCoord.xy + fract(uTime * 9.17) * 83.0);
  float dtL = (t1 - t0) / 7.0;
  float covK = clamp(uCloud * vLayerDens, 0.0, 2.5);
  // Respect per-deck cloud character so High Cirrus Only & Low Mist Only don't force Mid Cumulus cauliflower puffs!
  float effType = uCloudType;
  if (vLayerIdx > 1.5 && uCloudType < 0.5) effType = 3.0;
  else if (vLayerIdx < 0.5 && uCloudType < 0.5) effType = 2.0;
  float isCirrus = (effType > 2.5 && effType < 3.5) ? 1.0 : 0.0;
  float lowProx = smoothstep(240.0, 55.0, vCenterW.y);
  float isLowSea = max((effType > 4.5) ? 1.0 : 0.0, lowProx);

  float Tr = 1.0;
  vec3 accum = vec3(0.0);
  float avgLit = 0.0;
  float wSum = 0.0;

  // Low / lowered clouds pick up warm/neon city under-glow on their undersides!
  vec3 cityUnder = uPoolCol * max(uLightK, 0.15) * (0.20 + 0.50 * isLowSea);
  vec3 darkBelly = uCloudCol * 0.38 + cityUnder * 0.35;
  vec3 brightTop = mix(uCloudCol + uSkySunCol * 0.95, vec3(0.97, 0.96, 0.93), 0.30);
  float fwd = pow(max(dot(rdW, sd), 0.0), 5.0);
  float optScale = mix(1.85 + covK * 0.95, 0.78 + covK * 0.42, isCirrus);

  int maxPuffSteps = uPerfQuality < 0.48 ? 3 : (uPerfQuality < 0.78 ? 5 : 7);
  float stepMul = 7.0 / float(maxPuffSteps);
  float dtQ = dtL * stepMul;

  for (int i = 0; i < 7; i++) {
    if (i >= maxPuffSteps || Tr < 0.04) break;
    float tCur = t0 + (float(i) + jit) * dtQ;
    vec3 pL = roL + rdL * tCur;
    float dens = puffVolDensity(pL, covK, effType, vSeed, uTime);
    if (dens > 0.005) {
      float hUp = clamp(pL.y * 0.5 + 0.5, 0.0, 1.0);
      float shD = uPerfQuality < 0.56
        ? dens * 0.64 * (1.0 - hUp * 0.58)
        : puffVolDensity(pL + sdL * 0.32, covK, effType, vSeed, uTime);
      float sunT = exp(-shD * 2.4);
      float lit = clamp(sunT * (0.55 + 0.52 * hUp) + 0.12, 0.0, 1.22);
      vec3 sc = mix(darkBelly, brightTop, clamp(lit, 0.0, 1.0));
      sc += cityUnder * (1.0 - hUp) * 0.55;
      sc += uSkySunCol * sunT * fwd * (0.35 + uSunGlow * 0.75);

      float stepT = exp(-dens * dtQ * optScale);
      float w = Tr * (1.0 - stepT);
      accum += w * sc;
      avgLit += w * lit;
      wSum += w;
      Tr *= stepT;
    }
  }

  float maxA = mix(0.84, 0.52, isCirrus);
  float alpha = (1.0 - Tr) * mix(0.80, 0.55, isCirrus);
  if (alpha < 0.008) discard;

  vec3 cl = accum / max(wSum, 1e-4);
  if (uCloudStyle > 0.5) {
    vec4 plate = evalStormyPlate(avgLit / max(wSum, 1e-4), uCloudStyle, gl_FragCoord.xy, vCenterW.xz * 0.001, darkBelly, brightTop, uTime);
    cl = mix(cl, plate.rgb, 0.80);
    alpha *= plate.a;
  }

  float camDist = length(vCenterW - cameraPosition);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(rdW, sd), 0.0), 6.0) * uHazeSun);
  float farMix = smoothstep(3200.0, 11500.0, camDist) * 0.62;
  cl = saturate3(mix(cl, fogCol, farMix), uSat);
  gl_FragColor = vec4(cl, clamp(alpha, 0.0, maxA));
}
`;

/* --------------------------------------------------------------- ground */

export const GLSL_TERRAIN = /* glsl */ `
uniform float uCitySpan;
uniform float uSuburbSpan;
uniform float uWaterMode;
uniform float uWaterAmt;
uniform float uShoreDist;
uniform float uTerrainMode;
uniform float uTerrainScale;
uniform float uCoastAngle;
uniform vec2 uTerrainSeed;
uniform vec4 uRiverOrigin;
uniform vec4 uRiverShape;
uniform vec4 uLagoon;
uniform vec2 uPondCenter;

float envWaveFbm(vec2 p, vec2 ts) {
  vec2 q = p * 0.00052 + ts * 0.17;
  float sum = 0.0;
  float amp = 0.52;
  for (int i = 0; i < 4; i++) {
    float v = sin(q.x) * cos(q.y) + 0.55 * sin(q.x * 1.37 - q.y * 1.19 + 1.1);
    sum += amp * (v / 1.55);
    q = mat2(0.8, 0.6, -0.6, 0.8) * q * 2.03 + vec2(1.73, -1.31);
    amp *= 0.5;
  }
  return sum;
}

float envRidgeFbm(vec2 p, vec2 ts) {
  vec2 q = p * 0.00046 + vec2(ts.x * 0.23 + 2.4, -ts.y * 0.19 - 1.8);
  float sum = 0.0;
  float amp = 0.54;
  float weight = 1.0;
  for (int i = 0; i < 4; i++) {
    float raw = (sin(q.x) * cos(q.y) + 0.6 * cos(q.x * 1.29 + q.y * 1.41 - 0.7)) / 1.6;
    float r = 1.0 - abs(raw);
    r = r * r * weight;
    weight = clamp(r * 1.35, 0.0, 1.0);
    sum += r * amp;
    q = mat2(0.8, 0.6, -0.6, 0.8) * q * 2.11 + vec2(2.31, 0.97);
    amp *= 0.5;
  }
  return clamp(sum * 1.08, 0.0, 1.0);
}

float evalCoastSignedDist(vec2 p) {
  if (uWaterAmt <= 0.005 || uWaterMode < 0.5 || uWaterMode > 3.5) return 9999.0;
  float ca = cos(uCoastAngle);
  float sa = sin(uCoastAngle);
  float u = p.x * ca + p.y * sa;
  float v = -p.x * sa + p.y * ca;
  float sdMul = max(uShoreDist, 0.30);
  float amtScale = 0.55 + 0.45 * clamp(uWaterAmt, 0.0, 2.0);
  float warp = sin(v * 0.00058 + uTerrainSeed.x) * 410.0
    + cos(v * 0.00131 - uTerrainSeed.y) * 195.0
    + sin(v * 0.00285 + uTerrainSeed.x * 1.7) * 82.0;
  float bayIndent = -255.0 * amtScale * exp(-(v * v) / (690.0 * 690.0));

  if (uWaterMode < 1.5) {
    float shoreU = max(320.0, uCitySpan * 0.94 * sdMul) + warp + bayIndent;
    return shoreU - u;
  }
  if (uWaterMode < 2.5) {
    float baseSpan = max(360.0, uCitySpan * 1.02 * sdMul);
    float best = (baseSpan + warp * 0.84 + bayIndent * 0.65) - (u + 0.000115 * v * v);
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float sgn = (k == 0 || k == 2) ? 1.0 : -1.0;
      float iu = baseSpan + 1150.0 + fk * 760.0 + sin(uTerrainSeed.x + fk * 2.1) * 260.0;
      float iv = sgn * (680.0 + fk * 540.0) + cos(uTerrainSeed.y + fk * 1.7) * 320.0;
      float ir = 340.0 + ((k == 1) ? 210.0 : fk * 55.0);
      vec2 d = vec2(u - iu, v - iv);
      float ang = atan(d.y, d.x);
      float iWarp = sin(ang * 3.0 + fk * 1.9 + uTerrainSeed.x) * 68.0 + cos(ang * 5.0 - uTerrainSeed.y) * 34.0;
      float islDist = (ir + iWarp) - length(d);
      best = max(best, islDist);
    }
    return best;
  }
  float lakeU = max(950.0, uCitySpan * 2.25 * sdMul);
  float lakeR = max(680.0, uCitySpan * 1.32 * amtScale);
  vec2 dL = vec2(u - lakeU, v * 0.82);
  float angL = atan(dL.y, dL.x);
  float lWarp = sin(angL * 3.0 + uTerrainSeed.x) * 185.0 + cos(v * 0.0019 + uTerrainSeed.y) * 125.0;
  return (length(dL) + lWarp) - lakeR;
}

float evalRiverSignedDist(vec2 p) {
  if (uWaterAmt <= 0.005 || uRiverShape.z < 0.5) return 9999.0;
  float rAng = uRiverOrigin.z;
  float maxLen = max(uRiverOrigin.w, 600.0);
  float ca = cos(rAng);
  float sa = sin(rAng);
  vec2 d = p - uRiverOrigin.xy;
  float u = d.x * ca + d.y * sa;
  float v = -d.x * sa + d.y * ca;
  float oceanMouth = uRiverShape.w;
  float uMin = oceanMouth > 0.5 ? -260.0 : -95.0;
  float uC = clamp(u, uMin, maxLen);
  float t = clamp(uC / maxLen, 0.0, 1.0);
  float sx = uTerrainSeed.x;
  float sz = uTerrainSeed.y;
  float latBias = uRiverShape.x;
  float amtScale = max(uRiverShape.y, 0.25);

  float sBend1 = sin(uC * 0.00155 + sx);
  float sBend2 = cos(uC * 0.00068 - sz);
  float sBend3 = sin(uC * 0.00310 + sx * 1.7);
  float meander = latBias * t
    + sBend1 * (115.0 + t * 255.0)
    + sBend2 * (55.0 + t * 165.0)
    + sBend3 * (22.0 + t * 38.0);
  float dMeander = latBias / maxLen
    + cos(uC * 0.00155 + sx) * 0.00155 * (115.0 + t * 255.0)
    - sin(uC * 0.00068 - sz) * 0.00068 * (55.0 + t * 165.0)
    + cos(uC * 0.00310 + sx * 1.7) * 0.00310 * (22.0 + t * 38.0);

  float perpDist = abs(v - meander) / sqrt(1.0 + dMeander * dMeander);
  float uExcess = u < uMin ? (uMin - u) : (u > maxLen ? (u - maxLen) : 0.0);
  float distToCenter = uExcess > 0.0 ? length(vec2(perpDist, uExcess)) : perpDist;

  float bendSwelling = abs(sBend1) * 14.0 + (1.0 - clamp(t * 3.5, 0.0, 1.0)) * 18.0;
  float mouthFlare = oceanMouth > 0.5 ? (56.0 * (1.0 - smoothstep(-180.0, 95.0, uC))) : 0.0;
  float halfW = (34.0 + t * 44.0 + bendSwelling + mouthFlare + sin(uC * 0.0085 + sx) * 6.0) * amtScale;
  return distToCenter - halfW;
}

float evalWaterBodySignedDist(vec2 p) {
  float d = evalCoastSignedDist(p);
  d = min(d, evalRiverSignedDist(p));
  if (uWaterAmt > 0.005 && uLagoon.z > 1.0) {
    d = min(d, length(p - uLagoon.xy) - uLagoon.z * 0.94);
  }
  if (uWaterAmt > 0.005 && uLagoon.w > 1.0) {
    d = min(d, length(p - uPondCenter) - uLagoon.w * 0.92);
  }
  return d;
}

float evalTerrainHeight(vec2 p) {
  float coastDist = evalCoastSignedDist(p);
  if (coastDist < 0.0) {
    return -18.0 * smoothstep(0.0, 240.0, -coastDist);
  }
  float riverDist = evalRiverSignedDist(p);
  if (riverDist < 0.0) {
    return -3.4 * smoothstep(0.0, 22.0, -riverDist);
  }
  float r = length(p);
  float shoreEase = smoothstep(0.0, 290.0, coastDist) * smoothstep(0.0, 65.0, riverDist);

  float ca = cos(uCoastAngle);
  float sa = sin(uCoastAngle);
  float u = p.x * ca + p.y * sa;
  if (uWaterMode > 1.5 && uWaterMode < 2.5 && u > max(500.0, uCitySpan * 1.02) + 520.0) {
    float islPeak = smoothstep(0.0, 360.0, coastDist);
    float islRidge = envRidgeFbm(p * 1.8, uTerrainSeed);
    return islPeak * (34.0 + 135.0 * islRidge) * max(0.45, uTerrainScale);
  }

  if (uTerrainMode > 3.5 || uTerrainScale <= 0.001) return 0.0;

  float wVal = envWaveFbm(p, uTerrainSeed);
  float basinR = max(920.0, uCitySpan * 1.28) + wVal * 320.0;
  if (r <= basinR) return 0.0;

  float ang = atan(p.y, p.x);
  float passWave = abs(sin((ang - uCoastAngle * 0.5) * 2.0 + wVal * 0.55));
  float valleyCarve = 0.34 + 0.66 * smoothstep(0.14, 0.58, passWave);
  float horizonTaper = 1.0 - 0.35 * smoothstep(10200.0, 13400.0, r);
  float sc = uTerrainScale * shoreEase * horizonTaper;

  if (uTerrainMode < 0.5) {
    float footRamp = smoothstep(basinR, basinR + 2100.0, r);
    float mtnRamp = smoothstep(max(basinR + 900.0, uSuburbSpan * 0.58), max(basinR + 3800.0, uSuburbSpan * 1.08), r);
    float ridge = envRidgeFbm(p, uTerrainSeed);
    float detail = envWaveFbm(p * 2.35, uTerrainSeed + vec2(3.1, -2.4)) * 0.5 + 0.5;
    float foothills = footRamp * (28.0 + 95.0 * detail) * valleyCarve;
    float peaks = mtnRamp * (240.0 + 860.0 * pow(ridge, 1.35)) * (0.42 + 0.58 * valleyCarve);
    return (foothills + peaks) * sc;
  }
  if (uTerrainMode < 1.5) {
    float duneRamp = smoothstep(basinR, basinR + 1450.0, r);
    float mesaRamp = smoothstep(max(basinR + 1100.0, uSuburbSpan * 0.55), max(basinR + 3400.0, uSuburbSpan * 1.02), r);
    float windU = (p.x * 0.82 - p.y * 0.57) * 0.0046 + wVal * 2.4;
    float sDune = sin(windU);
    float duneCrest = pow(0.5 + 0.5 * sin(windU - 0.42 * sDune), 1.65);
    float dunes = duneRamp * (18.0 + 68.0 * duneCrest * (0.55 + 0.45 * (wVal * 0.5 + 0.5)));
    float mesaField = envWaveFbm(p * 0.72 + vec2(910.0, -640.0), uTerrainSeed) * 0.5 + 0.5;
    float tier1 = smoothstep(0.56, 0.64, mesaField);
    float tier2 = smoothstep(0.71, 0.77, mesaField);
    float mesas = mesaRamp * (tier1 * 235.0 + tier2 * 185.0) * valleyCarve;
    return (dunes + mesas) * sc;
  }
  if (uTerrainMode < 2.5) {
    float hillRamp = smoothstep(basinR, basinR + 1500.0, r);
    float outerRise = smoothstep(basinR + 2200.0, basinR + 5600.0, r);
    float h1 = envWaveFbm(p * 0.85, uTerrainSeed) * 0.5 + 0.5;
    float h2 = envWaveFbm(p * 2.1, uTerrainSeed + vec2(-1.9, 2.7)) * 0.5 + 0.5;
    return hillRamp * (14.0 + 78.0 * h1 + outerRise * 105.0 * h1 * h2) * valleyCarve * sc;
  }
  float rimCenter = max(basinR + 2900.0, uSuburbSpan * 0.92);
  float dRim = (r + wVal * 520.0 - rimCenter) / 1650.0;
  float craterRing = exp(-dRim * dRim);
  float gully = envRidgeFbm(p * 1.45, uTerrainSeed);
  float badlands = smoothstep(basinR, basinR + 1600.0, r) * 58.0 * gully;
  return (badlands + craterRing * (310.0 + 560.0 * gully) * (0.45 + 0.55 * valleyCarve)) * sc;
}
`;

export const GROUND_VERT = /* glsl */ `
varying vec3 vFlat;
varying vec3 vWorld;
varying vec3 vTerrN;
varying float vElev;
${GLSL_CURVE}
${GLSL_TERRAIN}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float hC = evalTerrainHeight(wp.xz);
  float eps = 18.0;
  float hX = evalTerrainHeight(wp.xz + vec2(eps, 0.0)) - evalTerrainHeight(wp.xz - vec2(eps, 0.0));
  float hZ = evalTerrainHeight(wp.xz + vec2(0.0, eps)) - evalTerrainHeight(wp.xz - vec2(0.0, eps));
  vec3 rawN = normalize(vec3(-hX, 2.0 * eps, -hZ));
  wp.y += hC;
  vElev = hC;
  vFlat = wp.xyz;
  vTerrN = bendNormal(wp.xz, rawN);
  wp.xyz = bendWorld(wp.xyz);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const GROUND_FRAG = /* glsl */ `
uniform vec3 uGStreet;
uniform vec3 uGBlock;
uniform vec3 uGLine;
uniform float uGLineGlow;
uniform float uCell;
uniform float uAve;
uniform float uSt;
uniform float uGroundRadius;
uniform vec3 uSunDir;
uniform vec3 uFogCol;
uniform vec3 uSunFogCol;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uHazeSun;
uniform float uSat;
uniform float uWetness;
uniform vec3 uPoolCol;
uniform vec3 uBillA;
uniform float uLightK;
varying vec3 vFlat;
varying vec3 vWorld;
varying vec3 vTerrN;
varying float vElev;
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_CURVE}
${GLSL_TERRAIN}

// Shared analytical curvilinear road-web & surveyor trapezoid subdivision
// (matches evalRoadWeb in src/city.js 1-to-1 so roads, trapezoid parcels,
// suburbs, highway corridors, and strip-crop furrows align to the metre!)
struct RoadWeb {
  float cellU;
  float cellV;
  float fu;
  float fv;
  float dArt;
  float dRing;
  float spanU;
  vec2 tanArt;
  vec2 tanRing;
};

RoadWeb evalRoadWeb(vec2 p, vec2 seedShift) {
  float r = length(p);
  float ang = atan(p.y, p.x);
  float angWarp = ang
    + 0.135 * sin(r * 0.00062 + seedShift.x) * cos(ang * 2.0 - seedShift.y)
    + 0.075 * cos(r * 0.00125 - seedShift.y * 0.7) * sin(ang * 3.0 + seedShift.x);
  float uRoad = angWarp * (12.0 / 6.28318530718);
  float fu = fract(uRoad);
  float cellU = mod(floor(uRoad), 12.0);
  if (cellU < 0.0) cellU += 12.0;

  float spanU = 6.28318530718 * max(r, 180.0) / 12.0;
  float dArt = min(fu, 1.0 - fu) * spanU;

  float rUndul = r
    + 135.0 * sin(ang * 3.0 + seedShift.x * 1.1)
    + 78.0 * cos(ang * 5.0 - seedShift.y * 1.3 + r * 0.00055)
    + 65.0 * sin(ang * 4.0 - seedShift.x * 0.6 + r * 0.0004);
  float vRoad = rUndul / 380.0;
  float fv = fract(vRoad);
  float cellV = floor(vRoad);
  float dRing = min(fv, 1.0 - fv) * 380.0;

  vec2 radDir = r > 1e-3 ? p / r : vec2(1.0, 0.0);
  vec2 azDir = vec2(-radDir.y, radDir.x);

  RoadWeb rw;
  rw.cellU = cellU;
  rw.cellV = cellV;
  rw.fu = fu;
  rw.fv = fv;
  rw.dArt = dArt;
  rw.dRing = dRing;
  rw.spanU = spanU;
  rw.tanArt = radDir;
  rw.tanRing = azDir;
  return rw;
}

void main() {
  vec2 p = vFlat.xz;

  // Organic radial alpha disappearance at the outer rim of the ground disc
  float edgeWarp = (vnoise(p * 0.00045 + 4.2) - 0.5) * uGroundRadius * 0.14;
  float edgeR = length(p) + edgeWarp;
  float fadeInner = mix(uGroundRadius * 0.46, uPlanetR * 2.55, uWorldCurve);
  float fadeOuter = mix(uGroundRadius * 0.96, uPlanetR * 3.08, uWorldCurve);
  float edgeAlpha = 1.0 - smoothstep(fadeInner, fadeOuter, edgeR);
  if (edgeAlpha < 0.004) discard;

  float coastDist = evalCoastSignedDist(p);
  vec3 flatUp = bendNormal(p, vec3(0.0, 1.0, 0.0));
  vec3 surfN = normalize(vTerrN);
  float terrSlope = clamp(1.0 - dot(surfN, flatUp), 0.0, 1.0);
  float slopeSteep = smoothstep(0.015, 0.18, terrSlope);

  RoadWeb rw = evalRoadWeb(p, uTerrainSeed);
  float secHash = fract(sin(rw.cellU * 19.31 + uTerrainSeed.x * 2.17) * 43758.5453);
  float corrProm = smoothstep(0.32, 0.88, secHash);
  float corrMask = exp(-pow(rw.dArt / (115.0 + 95.0 * corrProm), 2.0)) * corrProm;

  // 1. Urban Core Grid + Organic Arterial Ribbon Extensions along primary radial highways
  float ix = floor(p.x / uCell + 0.5);
  float iz = floor(p.y / uCell + 0.5);
  float isAveX = (abs(mod(ix, 4.0)) < 0.5) ? 1.0 : 0.0;
  float isAveZ = (abs(mod(iz, 4.0)) < 0.5) ? 1.0 : 0.0;
  float swx = (isAveX > 0.5) ? uAve : uSt;
  float swz = (isAveZ > 0.5) ? uAve : uSt;
  float dx = abs(p.x - ix * uCell);
  float dz = abs(p.y - iz * uCell);

  float rWarp = (vnoise(p * 0.0018) - 0.5) * uCell * 2.6;
  float rDist = length(p) + rWarp;
  float spanBoost = uCitySpan * (1.0 + 0.42 * corrMask);
  float gridFade = 1.0 - smoothstep(spanBoost * 0.86, spanBoost * 1.15, rDist);
  float aveFade = 1.0 - smoothstep(spanBoost * 0.94, spanBoost * 1.32, rDist);

  float walkW = 4.6;
  // Strictly cut off ALL core streets, sidewalks, lane markings & suburban roads before coastlines, rivers & harbors!
  float riverDist = evalRiverSignedDist(p);
  float waterDist = evalWaterBodySignedDist(p);
  float shoreDryRoad = smoothstep(11.0, 32.0, waterDist);
  float roadX = step(dx, swx * 0.5 - walkW) * mix(gridFade, aveFade, isAveX) * shoreDryRoad;
  float roadZ = step(dz, swz * 0.5 - walkW) * mix(gridFade, aveFade, isAveZ) * shoreDryRoad;
  float coreRoad = max(roadX, roadZ);

  // 2. Road-Aligned Curvilinear Trapezoid Blocks, High-Density Painted Suburban Sprawl & Lots
  float dryMask = smoothstep(14.0, 44.0, waterDist) * (1.0 - slopeSteep);
  float blockH = fract(sin(rw.cellU * 12.9898 + rw.cellV * 78.233 + uTerrainSeed.x * 3.1) * 43758.5453);
  float blockH2 = fract(blockH * 13.71 + rw.cellV * 0.37);

  // Major radial highways & curved collector roads extend far across suburbs & countryside
  float hwyReach = 1.0 - smoothstep(uSuburbSpan * 1.08, uSuburbSpan * 1.62, rDist);
  float artRoad = (1.0 - smoothstep(8.2, 11.2, rw.dArt)) * dryMask * hwyReach * (1.0 - gridFade * 0.75);
  float ringRoad = (1.0 - smoothstep(5.4, 7.8, rw.dRing)) * dryMask * (1.0 - smoothstep(uSuburbSpan * 0.95, uSuburbSpan * 1.40, rDist)) * (1.0 - gridFade * 0.85);

  // Suburban sprawl stretches far across uSuburbSpan and surges outward along major radial roads!
  float subActive = smoothstep(uCitySpan * 1.02, uCitySpan * 1.32, uSuburbSpan);
  float subSpanEff = uSuburbSpan * (0.94 + 0.36 * corrMask);
  float subBelt = (1.0 - gridFade)
    * (1.0 - smoothstep(subSpanEff * 0.76, subSpanEff * 1.26, rDist))
    * dryMask * subActive;
  float subPatch = smoothstep(0.18, 0.48, fbm(p * 0.00085 + vec2(-4.2, 8.7)) + corrMask * 0.32);
  float subZone = clamp(subBelt * (0.56 + 0.44 * subPatch), 0.0, 1.0);

  // Internal parallel residential streets (3..5 streets per trapezoid block for dense sprawl!)
  float nLanes = 3.0 + floor(blockH2 * 3.0);
  float orientAlongRing = step(0.42, blockH);
  float stCoord = orientAlongRing > 0.5 ? rw.fv * nLanes : rw.fu * nLanes;
  float stSpanM = orientAlongRing > 0.5 ? (380.0 / nLanes) : (rw.spanU / nLanes);
  float stFrac = fract(stCoord);
  float dLocalSt = min(stFrac, 1.0 - stFrac) * stSpanM;
  float localRoad = (1.0 - smoothstep(3.6, 5.4, dLocalSt)) * subZone * step(10.0, min(rw.dArt, rw.dRing));

  float subRoad = clamp(max(max(artRoad, ringRoad), localRoad), 0.0, 1.0);
  float road = max(coreRoad, subRoad * 0.94);

  // Rich Street-Level Sidewalks: stone pavers, raised curb bevel, street-tree pits & storm-drain grates
  float walkBandX = step(swx * 0.5 - walkW, dx) * step(dx, swx * 0.5 + 1.4) * (1.0 - roadZ) * mix(gridFade, aveFade, isAveX) * shoreDryRoad;
  float walkBandZ = step(swz * 0.5 - walkW, dz) * step(dz, swz * 0.5 + 1.4) * (1.0 - roadX) * mix(gridFade, aveFade, isAveZ) * shoreDryRoad;
  float subWalk = (1.0 - smoothstep(5.2, 7.4, min(min(rw.dArt - 3.6, rw.dRing - 1.2), dLocalSt))) * subZone * (1.0 - subRoad);
  float sidewalk = clamp(max(max(walkBandX, walkBandZ), subWalk * 0.68), 0.0, 1.0);

  vec3 walkCol = mix(uGBlock, uGStreet, 0.28) + vec3(0.055, 0.052, 0.048) + uGLine * 0.04;
  vec2 paver = abs(fract(p / 3.2) - 0.5);
  float joint = 1.0 - smoothstep(0.0, 0.055, min(paver.x, paver.y));
  walkCol *= 1.0 - joint * 0.16;
  // Sidewalk tree-pit planters & tactile curb strip every 18m along urban sidewalks
  float treePitX = (1.0 - smoothstep(0.9, 1.35, length(vec2(dx - (swx * 0.5 - 2.1), (fract(p.y / 18.0) - 0.5) * 18.0)))) * walkBandX;
  float treePitZ = (1.0 - smoothstep(0.9, 1.35, length(vec2(dz - (swz * 0.5 - 2.1), (fract(p.x / 18.0) - 0.5) * 18.0)))) * walkBandZ;
  float treePit = clamp(treePitX + treePitZ, 0.0, 1.0) * step(18.0, min(dx + dz, 99.0));
  walkCol = mix(walkCol, mix(uGBlock * 0.65, vec3(0.11, 0.19, 0.11), 0.55), treePit * 0.85);

  // Road-aligned residential micro-lots + Painted Distant Suburban Sprawl Texture (roofs, driveways, pools & yards!)
  float lotDensity = max(8.0, floor(rw.spanU / 19.0));
  float lotAlong = orientAlongRing > 0.5 ? rw.fu * lotDensity : rw.fv * 20.0;
  float lotSkew = (fract(blockH * 19.3) - 0.5) * 0.22;
  float lotIdx = floor(lotAlong + (stFrac - 0.5) * lotSkew);
  float lotF = fract(lotAlong + (stFrac - 0.5) * lotSkew);
  float lotSpanM = orientAlongRing > 0.5 ? (rw.spanU / lotDensity) : (380.0 / 20.0);
  float dLotSide = min(lotF, 1.0 - lotF) * lotSpanM;
  float dBackFence = abs(stFrac - 0.5) * stSpanM;
  float lotEdgeM = min(dLotSide, dBackFence);
  float rowSide = sign(stFrac - 0.5);
  float lotHash = fract(sin(lotIdx * 17.13 + floor(stCoord * 2.0) * 41.7 + blockH * 97.3) * 43758.5453);

  float lotHedge = (1.0 - smoothstep(0.55, 1.65, lotEdgeM)) * subZone * (1.0 - subRoad) * step(6.2, dLocalSt);
  vec3 lushHint = mix(uGBlock, vec3(0.11, 0.21, 0.11) + uGBlock * 0.52, 0.50);
  vec3 yardTint = mix(uGBlock * 0.88, lushHint * 1.16, lotHash);
  vec3 col = mix(uGBlock, yardTint, subZone * 0.88);

  // Painted suburban sprawl rooftops, concrete driveways & backyard pools inside residential parcels!
  float sprawlGlow = 0.0;
  if (subZone > 0.02 && subRoad < 0.5) {
    float setback = 8.5 + fract(lotHash * 5.3) * 4.5;
    float houseDepth = 8.0 + fract(lotHash * 11.7) * 5.0;
    float houseHalfW = clamp(lotSpanM * (0.28 + 0.12 * fract(lotHash * 3.1)), 3.2, 8.5);
    float lotCenterDist = abs(lotF - 0.5) * lotSpanM;
    float inDepth = step(setback, dLocalSt) * step(dLocalSt, setback + houseDepth) * step(5.0, dBackFence);
    float inWidth = 1.0 - smoothstep(houseHalfW - 0.6, houseHalfW + 0.4, lotCenterDist);
    float hasHouse = step(0.12, lotHash) * step(11.5, min(rw.dArt, rw.dRing));
    float houseMask = inDepth * inWidth * hasHouse * subZone;

    // Pitched gable roof ridge shading (sunlit slope vs shaded slope!)
    float roofRidge = (dLocalSt - setback) / max(houseDepth, 1.0) - 0.5;
    float gableShade = 0.82 + 0.34 * sign(roofRidge) * rowSide * clamp(uSunDir.x * 0.6 + uSunDir.z * 0.6, -1.0, 1.0);
    vec3 roofTile = mix(uGBlock * 1.15, vec3(0.36, 0.22, 0.17), 0.55); // terracotta shingle
    if (lotHash > 0.36) roofTile = mix(uGBlock * 1.1, vec3(0.24, 0.26, 0.30), 0.60); // slate grey
    if (lotHash > 0.68) roofTile = mix(uGBlock * 1.15, vec3(0.33, 0.29, 0.24), 0.58); // warm cedar/tan
    if (lotHash > 0.88) roofTile = mix(uGBlock * 1.2, vec3(0.46, 0.45, 0.43), 0.55); // commercial flat membrane

    // Concrete driveway connecting street curb to garage
    float driveOff = (lotF - 0.28) * lotSpanM;
    float driveway = (1.0 - smoothstep(1.4, 2.1, abs(driveOff))) * step(4.8, dLocalSt) * step(dLocalSt, setback + 1.5) * hasHouse * subZone;
    // Occasional turquoise backyard swimming pool
    float poolMask = step(0.86, lotHash) * (1.0 - smoothstep(1.8, 2.5, length(vec2(lotCenterDist, dLocalSt - (setback + houseDepth + 4.5))))) * step(4.0, dBackFence) * subZone;

    col = mix(col, mix(uGStreet, vec3(0.32, 0.32, 0.34), 0.35), driveway * 0.78);
    col = mix(col, roofTile * gableShade, houseMask * 0.92);
    col = mix(col, vec3(0.14, 0.52, 0.64), poolMask * 0.75);
    // Warm nocturnal suburban window/porch & streetlamp clusters stretching to the horizon!
    float nightLamp = (1.0 - smoothstep(1.5, 5.5, abs(dLocalSt - 5.8))) * step(0.68, fract(lotIdx * 0.37 + blockH * 7.0));
    sprawlGlow = (houseMask * step(0.42, fract(lotHash * 23.1)) * 0.42 + nightLamp * 0.55) * subZone;
  }

  // 3. Road-Aligned Trapezoidal & Parallel-Strip Farmland (matches bounding roads!)
  float isArid = (uTerrainMode > 0.5 && uTerrainMode < 1.5) ? 1.0 : ((uTerrainMode > 2.5 && uTerrainMode < 3.5) ? 0.75 : 0.0);
  float farmZone = (1.0 - gridFade)
    * (1.0 - subZone * 0.88)
    * (1.0 - slopeSteep)
    * smoothstep(24.0, 95.0, coastDist)
    * (1.0 - isArid * 0.72)
    * (1.0 - smoothstep(uSuburbSpan * 1.05, uSuburbSpan * 1.72, rDist));

  if (farmZone > 0.01) {
    // Subdivide each road-bounded curvilinear macro-trapezoid into 2..5 parallel / oblique trapezoid strips!
    float nStripU = 2.0 + floor(fract(blockH * 5.17) * 4.0);
    float nStripV = 2.0 + floor(fract(blockH * 11.31) * 3.0);
    float trapSkewU = (fract(blockH * 23.7) - 0.5) * 0.42;
    float trapSkewV = (fract(blockH * 31.9) - 0.5) * 0.28;
    float pu = rw.fu * nStripU + (rw.fv - 0.5) * trapSkewU;
    float pv = rw.fv * nStripV + (rw.fu - 0.5) * trapSkewV;
    vec2 pid = floor(vec2(pu, pv));
    vec2 pf = fract(vec2(pu, pv));

    float dEdgeU = min(pf.x, 1.0 - pf.x) * (rw.spanU / nStripU);
    float dEdgeV = min(pf.y, 1.0 - pf.y) * (380.0 / nStripV);
    float parcelEdge = min(min(dEdgeU, dEdgeV), min(rw.dArt - 9.0, rw.dRing - 6.0));

    float pHash = fract(sin(pid.x * 27.1 + pid.y * 59.3 + rw.cellU * 13.7 + rw.cellV * 41.9 + uTerrainSeed.x) * 43758.5453);
    float cropSel = fract(pHash * 7.31);

    // Plow furrows strictly aligned parallel to either the radial road or the collector road!
    float furrowAlongArt = step(0.48, fract(pHash * 3.9));
    float furrowCoord = furrowAlongArt > 0.5
      ? (rw.fu * rw.spanU * 0.62)
      : (rw.fv * 380.0 * 0.62);
    float furrow = 0.5 + 0.5 * sin(furrowCoord);

    // Palette-harmonized multi-crop tones: emerald pasture, golden grain, dark ploughed loam, olive orchard
    vec3 baseL = uGBlock * 0.75 + uFogCol * 0.16;
    vec3 cropPasture = mix(baseL, vec3(0.14, 0.28, 0.12) + baseL * 0.45, 0.68);
    vec3 cropGrain   = mix(baseL, vec3(0.34, 0.28, 0.13) + baseL * 0.42, 0.65);
    vec3 cropLoam    = mix(baseL, vec3(0.16, 0.12, 0.09) + baseL * 0.40, 0.68);
    vec3 cropOrchard = mix(baseL, vec3(0.10, 0.22, 0.13) + baseL * 0.42, 0.68);

    vec3 fieldCol = cropPasture;
    if (cropSel > 0.27 && cropSel <= 0.55) fieldCol = cropGrain;
    else if (cropSel > 0.55 && cropSel <= 0.80) fieldCol = cropLoam;
    else if (cropSel > 0.80) fieldCol = cropOrchard;

    // Parallel strip-crop & orchard row modulation
    fieldCol *= 0.87 + 0.23 * furrow;
    // Crisp road-aligned hedgerows, drainage ditches & farm access tracks along trapezoid borders
    float hedge = (1.0 - smoothstep(1.8, 5.2, max(parcelEdge, 0.0))) * (1.0 - subRoad);
    fieldCol = mix(fieldCol, cropOrchard * 0.48, hedge * 0.84);
    col = mix(col, fieldCol, farmZone);
  }

  // Apply core & road-aligned curvilinear highways, collector roads, residential streets & hedges
  col = mix(col, uGStreet, road);
  col = mix(col, walkCol, sidewalk * 0.92);
  col = mix(col, uGStreet * 0.65, lotHedge * 0.55);
  col *= 0.91 + 0.18 * vnoise(p * 0.018);

  // Subtle warm porch / driveway & sprawl streetlamp glints along suburban residential lots
  float subPorch = step(0.74, lotHash) * smoothstep(3.0, 9.0, lotEdgeM) * smoothstep(6.0, 14.0, dLocalSt) * subZone * (1.0 - subRoad);
  col += uPoolCol * (subPorch * 0.26 + sprawlGlow * 0.48) * max(uLightK, 0.08);

  // 4. 3D Distant Terrain Biomes: Mountains, Desert Dunes & Mesas, Rolling Hills, Volcanic Badlands
  float outerLand = 1.0 - gridFade;
  vec3 sd = normalize(uSunDir);
  float sunDiff = max(dot(surfN, sd), 0.0);
  float skyAmb = 0.42 + 0.58 * clamp(surfN.y, 0.0, 1.0);
  float reliefShade = mix(1.0, 0.44 * skyAmb + 0.92 * sunDiff, clamp(outerLand * (slopeSteep * 0.85 + smoothstep(8.0, 90.0, vElev) * 0.75), 0.0, 1.0));

  if (uTerrainMode > 0.5 && uTerrainMode < 1.5 && outerLand > 0.02) {
    // Desert Sand Dunes & Stratified Red-Rock Mesas
    float desertMask = outerLand * (1.0 - subZone * 0.72) * smoothstep(8.0, 55.0, coastDist);
    float ripple = 0.5 + 0.5 * sin((p.x * 0.82 - p.y * 0.57) * 0.24 + vnoise(p * 0.02) * 3.0);
    vec3 sandWarm = mix(uGBlock * 0.9 + uFogCol * 0.35, vec3(0.56, 0.40, 0.25) + uSunFogCol * 0.22, 0.68);
    sandWarm *= 0.93 + 0.12 * ripple;
    // Stratified horizontal sandstone cliff bands on steep mesa walls
    float strata = 0.5 + 0.5 * sin(vElev * 0.21 + vnoise(p * 0.006) * 2.5);
    vec3 mesaRock = mix(vec3(0.42, 0.21, 0.14), vec3(0.64, 0.38, 0.23), strata) + uFogCol * 0.18;
    vec3 desertCol = mix(sandWarm, mesaRock, smoothstep(0.03, 0.16, terrSlope));
    col = mix(col, desertCol, desertMask * 0.92);
  } else if (vElev > 3.0 || slopeSteep > 0.04) {
    float terMask = clamp(smoothstep(3.0, 48.0, vElev) + slopeSteep * 0.85, 0.0, 1.0) * outerLand;
    float strata = 0.5 + 0.5 * sin(vElev * 0.11 + vnoise(p * 0.005) * 3.2);
    vec3 foothillVeg = mix(uGBlock * 0.85 + uFogCol * 0.2, vec3(0.12, 0.21, 0.14) + uGBlock * 0.35, 0.58);
    vec3 cliffRock = mix(vec3(0.18, 0.19, 0.23), vec3(0.32, 0.33, 0.37), strata) + uFogCol * 0.22;
    if (uTerrainMode > 2.5 && uTerrainMode < 3.5) {
      // Volcanic basalt / obsidian ridges + warm mineral veins in deep gullies
      cliffRock = mix(vec3(0.09, 0.08, 0.10), vec3(0.22, 0.16, 0.15), strata) + uFogCol * 0.14;
      foothillVeg = mix(uGBlock * 0.7, vec3(0.16, 0.13, 0.12), 0.65);
    }
    vec3 mtnCol = mix(foothillVeg, cliffRock, smoothstep(0.025, 0.15, terrSlope) * 0.85 + smoothstep(140.0, 340.0, vElev) * 0.45);
    // Alpine snow / frost caps on high mountain peaks (mode 0)
    if (uTerrainMode < 0.5) {
      float snowLine = smoothstep(310.0, 520.0, vElev - terrSlope * 260.0 + vnoise(p * 0.008) * 55.0);
      vec3 snowCol = mix(vec3(0.76, 0.82, 0.90), uSunFogCol * 0.55 + vec3(0.55), 0.38);
      mtnCol = mix(mtnCol, snowCol, snowLine * 0.88);
    }
    col = mix(col, mtnCol, terMask);
  }
  col *= reliefShade;

  // 5. Natural Water-to-Land Shore Transition: Wet Swash, Golden Crescent Beach, Shingle & Dune Grass!
  if (uWaterAmt > 0.005 && uWaterMode > 0.5 && uWaterMode < 3.5 && coastDist < 112.0) {
    float pocket = smoothstep(-0.28, 0.38, sin(p.x * 0.0013 - p.y * 0.0011 + uTerrainSeed.x * 2.1));
    float beachWidth = mix(34.0, 88.0, pocket);
    float beachBand = (1.0 - smoothstep(4.0, beachWidth, max(coastDist, 0.0))) * (1.0 - road * 0.85);
    float duneGrass = smoothstep(beachWidth * 0.58, beachWidth * 0.92, coastDist) * (1.0 - smoothstep(beachWidth * 0.92, beachWidth + 28.0, coastDist));
    float sandRipple = 0.93 + 0.07 * sin(coastDist * 0.85 + vnoise(p * 0.04) * 3.0);
    vec3 drySand = mix(uGBlock * 0.75 + vec3(0.46, 0.39, 0.27), vec3(0.68, 0.58, 0.42) + uSunFogCol * 0.18, 0.68) * sandRipple;
    vec3 pebbleHeadland = mix(vec3(0.28, 0.27, 0.26), uGBlock + vec3(0.14, 0.13, 0.12), 0.45);
    vec3 shoreSurf = mix(pebbleHeadland, drySand, pocket);
    // Dark glistening wet foreshore sand right where waves wash up (coastDist -5..16m)
    float wetSwash = 1.0 - smoothstep(-3.0, 16.0, coastDist);
    vec3 wetSand = shoreSurf * 0.52 + uFogCol * 0.12;
    shoreSurf = mix(shoreSurf, wetSand, wetSwash);
    col = mix(col, shoreSurf, beachBand * 0.92);
    vec3 grassCol = mix(uGBlock, vec3(0.18, 0.29, 0.15), 0.62);
    col = mix(col, grassCol, duneGrass * (1.0 - road) * 0.55);
  }

  // 5b. Riverwalk Stone Embankment Quays (urban core) & Riparian Gravel/Reed Banks (suburbs & countryside)!
  if (uWaterAmt > 0.005 && riverDist < 24.0 && coastDist > 8.0) {
    float bankBand = (1.0 - smoothstep(0.0, mix(20.0, 12.5, gridFade), max(riverDist, 0.0))) * smoothstep(-4.0, 0.5, riverDist);
    vec3 quayStone = mix(uGStreet * 1.18 + vec3(0.06, 0.06, 0.065), vec3(0.32, 0.34, 0.37) + uGLine * 0.05, 0.48);
    float quayCope = (1.0 - smoothstep(0.0, 2.2, abs(riverDist - 1.4))) * gridFade;
    quayStone += vec3(0.09) * quayCope;
    vec3 riparian = mix(vec3(0.28, 0.25, 0.20) + uGBlock * 0.35, vec3(0.14, 0.24, 0.13) + uGBlock * 0.35, smoothstep(2.5, 14.0, riverDist));
    vec3 bankSurf = mix(riparian, quayStone, gridFade);
    col = mix(col, bankSurf, bankBand * 0.90);
  }

  // Centre lines, multi-lane dashes on core avenues, storm-drain curbs & zebra crosswalks (clipped before beach/water!)
  float dashZ = step(0.42, fract(p.y / 14.0));
  float dashX = step(0.42, fract(p.x / 14.0));
  float centerX = (1.0 - smoothstep(0.0, 1.25, dx)) * roadX * (1.0 - roadZ * 0.85);
  float centerZ = (1.0 - smoothstep(0.0, 1.25, dz)) * roadZ * (1.0 - roadX * 0.85);
  float dashHwy = step(0.38, fract(length(p) / 16.0));
  float subCenter = max(
    (1.0 - smoothstep(0.0, 0.85, rw.dArt)) * artRoad * (0.45 + 0.55 * dashHwy),
    (1.0 - smoothstep(0.0, 0.65, rw.dRing)) * ringRoad * 0.55
  ) * 0.62;
  float laneDashX = (1.0 - smoothstep(0.0, 0.75, abs(dx - 11.0))) * isAveX * dashZ * roadX * (1.0 - roadZ);
  float laneDashZ = (1.0 - smoothstep(0.0, 0.75, abs(dz - 11.0))) * isAveZ * dashX * roadZ * (1.0 - roadX);
  float stopBarX = (1.0 - smoothstep(0.0, 0.85, abs(dz - (swz * 0.5 + 3.8)))) * roadX * (1.0 - roadZ) * gridFade * shoreDryRoad;
  float stopBarZ = (1.0 - smoothstep(0.0, 0.85, abs(dx - (swx * 0.5 + 3.8)))) * roadZ * (1.0 - roadX) * gridFade * shoreDryRoad;
  float line = max(max(max(centerX, centerZ), subCenter), max(max(laneDashX, laneDashZ) * 0.75, max(stopBarX, stopBarZ) * 0.7));

  float xingOnX = step(swz * 0.5 - walkW, dz) * step(dz, swz * 0.5 + 3.2) * roadX * step(0.42, fract(p.x / 2.4));
  float xingOnZ = step(swx * 0.5 - walkW, dx) * step(dx, swx * 0.5 + 3.2) * roadZ * step(0.42, fract(p.y / 2.4));
  float crosswalk = max(xingOnX, xingOnZ) * gridFade * shoreDryRoad;

  float curb = max(
    (1.0 - smoothstep(0.0, 0.95, abs(dx - (swx * 0.5 - walkW)))) * (1.0 - roadZ) * mix(gridFade, aveFade, isAveX),
    (1.0 - smoothstep(0.0, 0.95, abs(dz - (swz * 0.5 - walkW)))) * (1.0 - roadX) * mix(gridFade, aveFade, isAveZ)
  ) * shoreDryRoad;
  float markings = clamp(line * (0.32 + uGLineGlow * 0.7) + curb * 0.42 + crosswalk * 0.52, 0.0, 1.0);
  col = mix(col, uGLine, markings);
  col += uGLine * (line + crosswalk * 0.55) * uGLineGlow * 0.38;

  // Wet street puddles & neon/streetlamp asphalt sheen
  float puddle = smoothstep(0.42, 0.78, vnoise(p * 0.045 + 3.1));
  float wet = clamp(0.16 + uWetness * 0.84, 0.0, 1.0) * road * puddle;
  vec3 vdir = normalize(vWorld - cameraPosition);
  float fres = pow(1.0 - max(dot(-vdir, surfN), 0.0), 2.6);
  vec3 streetRefl = mix(uPoolCol, uBillA, vnoise(p * 0.014 - 7.3));
  col += streetRefl * wet * (0.18 + 0.55 * fres) * max(uLightK, 0.15);

  if (uWorldCurve > 0.01) {
    float globeShade = mix(1.0, 0.38 + 0.68 * max(dot(flatUp, sd), 0.0), clamp(uWorldCurve * 1.1, 0.0, 1.0));
    col *= globeShade;
  }

  vec2 gf = abs(fract(p / 25.0) - 0.5);
  float fine = (1.0 - smoothstep(0.0, 0.035, min(gf.x, gf.y))) * gridFade * (1.0 - road);
  col += uGLine * fine * uGLineGlow * 0.12;

  col = saturate3(col, uSat);

  float dist = length(vWorld - cameraPosition);
  float density = uFogDensity * exp(-max(vFlat.y, 0.0) * uFogHeight);
  float fogF = (1.0 - exp(-density * dist)) * (1.0 - uWorldCurve * 0.45);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, sd), 0.0), 6.0) * uHazeSun);
  // Let tall distant mountain silhouettes remain majestically visible against the horizon sky!
  float mtnSilhouette = smoothstep(80.0, 420.0, vElev) * 0.48;
  float horizonMix = smoothstep(fadeInner * 0.78, fadeOuter, edgeR) * (1.0 - uWorldCurve * 0.75) * (1.0 - mtnSilhouette);
  vec3 far3 = mix(fogCol, uSunFogCol, horizonMix);
  gl_FragColor = vec4(mix(col, far3, clamp(max(fogF * (1.0 - mtnSilhouette * 0.45), horizonMix), 0.0, 1.0)), edgeAlpha);
}
`;

/* --------------------------------------------------------------- towers */

export const TOWER_VERT = /* glsl */ `
attribute float aSeed;
attribute vec3 aDims;
attribute float aKind;
attribute float aStyle;
varying vec3 vLocal;
varying vec3 vN;
varying vec3 vFlat;
varying vec3 vWorld;
varying vec3 vDims;
varying float vSeed;
varying float vKind;
varying float vStyle;
${GLSL_CURVE}
void main() {
  vLocal = position;
  vDims = aDims;
  vSeed = aSeed;
  vKind = aKind;
  vStyle = aStyle;
  vec3 nrm = mat3(instanceMatrix) * normal;
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  wp = modelMatrix * wp;
  vFlat = wp.xyz;
  vN = bendNormal(wp.xz, normalize(mat3(modelMatrix) * nrm));
  wp.xyz = bendWorld(wp.xyz);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const TOWER_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunK;
uniform vec3 uAmb;
uniform vec3 uAmbG;
uniform vec3 uBaseA;
uniform vec3 uBaseB;
uniform vec3 uPal[6];
uniform float uUsePal;
uniform float uWinDensity;
uniform float uWinGlow;
uniform vec3 uWinA;
uniform vec3 uWinB;
uniform vec3 uWinC;
uniform float uEdge;
uniform vec3 uEdgeCol;
uniform float uBandGlow;
uniform float uToon;
uniform float uFlat;
uniform vec3 uFogCol;
uniform vec3 uSunFogCol;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uHazeSun;
uniform float uTime;
uniform float uSat;
uniform vec3 uBillA;
uniform vec3 uBillB;
uniform float uBillK;
uniform float uBillMono;
uniform vec3 uPoolCol;
uniform float uLightK;
uniform float uDayPhase;
uniform float uTint;
uniform float uSignAmt;
uniform float uMegaWrap;
uniform float uGlyphStyle;
uniform float uSignAnim;
uniform vec4 uOverrideBldg;
uniform vec3 uOverrideColor;
varying vec3 vLocal;
varying vec3 vN;
varying vec3 vFlat;
varying vec3 vWorld;
varying vec3 vDims;
varying float vSeed;
varying float vKind;
varying float vStyle;
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_GLYPHS}

vec3 pickPal(float p) {
  vec3 c = uPal[0];
  if (p > 0.1666) c = uPal[1];
  if (p > 0.3333) c = uPal[2];
  if (p > 0.5)    c = uPal[3];
  if (p > 0.6666) c = uPal[4];
  if (p > 0.8333) c = uPal[5];
  return c;
}

vec3 pickNaturalArch(float p) {
  // Real-world architectural materials: travertine stone, slate curtain-wall,
  // champagne bronze, charcoal precast, warm terracotta brick, brushed silver steel
  vec3 c = vec3(0.54, 0.50, 0.45);
  if (p > 0.17) c = vec3(0.27, 0.34, 0.43);
  if (p > 0.35) c = vec3(0.44, 0.40, 0.35);
  if (p > 0.52) c = vec3(0.23, 0.25, 0.29);
  if (p > 0.70) c = vec3(0.49, 0.33, 0.27);
  if (p > 0.85) c = vec3(0.48, 0.52, 0.57);
  return c;
}

vec3 styleBillColor(vec3 raw) {
  float lum = dot(raw, vec3(0.299, 0.587, 0.114));
  vec3 mono = mix(uBillB * 0.45, uBillA * 1.15, clamp(lum, 0.0, 1.2));
  return mix(raw, mono, clamp(uBillMono, 0.0, 1.0));
}

void main() {
  vec3 n = normalize(vN);
  vec3 vdir = normalize(vWorld - cameraPosition);

  float h = hash12(vec2(vSeed * 127.1, floor(vKind + 0.5) * 311.7));
  vec3 lookBase = mix(uBaseA, uBaseB, h);
  if (uUsePal > 0.5) {
    lookBase = pickPal(hash12(vec2(vSeed * 91.3, 7.7)));
    lookBase *= 0.92 + 0.16 * hash12(vec2(vSeed * 13.1, 2.2));
  }
  vec3 natBase = pickNaturalArch(hash12(vec2(vSeed * 73.9, 4.3))) * (0.84 + 0.30 * h);
  // Look acts as a controllable tint over diverse per-building real materials!
  vec3 base = mix(natBase, lookBase, clamp(uTint, 0.0, 1.0));

  float sty = vStyle;
  float isMedia = step(2.5, sty) * step(sty, 3.5);
  float isStreetPod = step(3.5, sty);
  float densMul = 1.0;
  float edgeBoost = 0.0;
  float bayMul = 1.0;
  if (sty > 0.5 && sty < 1.5) {
    base *= 0.10;
    densMul = 0.0;
    edgeBoost = 1.6;
  } else if (sty > 1.5 && sty < 2.5) {
    base *= 0.82;
    densMul = 0.22;
    bayMul = 1.7;
    edgeBoost = 0.35;
  } else if (isMedia > 0.5) {
    base *= 0.18;
    edgeBoost = 0.75;
  } else if (isStreetPod > 0.5) {
    base = mix(base * 1.14, uBaseB * 0.95, 0.45);
    edgeBoost = 0.25;
  }

  float dif = max(dot(n, normalize(uSunDir)), 0.0);
  float toonD = floor(dif * 3.0 + 0.5) / 3.0;
  dif = mix(dif, toonD, uToon);
  vec3 amb = mix(uAmbG, uAmb, n.y * 0.5 + 0.5);
  vec3 lit = base * (amb + uSunCol * uSunK * dif);
  vec3 col = mix(lit, base, uFlat);

  float wy = max(vFlat.y, 0.0);
  float streetBounce = exp(-wy * 0.085) * max(uLightK, 0.12);
  col += base * uPoolCol * streetBounce * 0.55 + uPoolCol * streetBounce * 0.05;
  col = saturate3(col, uSat);

  // Use unbent local axes to pick box face so curved planet towers keep crisp windows!
  vec3 aLoc = abs(vLocal);
  vec2 uvm;
  float face; // 0 = x face, 1 = y face, 2 = z face
  if (aLoc.x >= aLoc.y && aLoc.x >= aLoc.z) { uvm = vLocal.zy * vDims.zy; face = 0.0; }
  else if (aLoc.y >= aLoc.x && aLoc.y >= aLoc.z) { uvm = vLocal.xz * vDims.xz; face = 1.0; }
  else { uvm = vLocal.xy * vDims.xy; face = 2.0; }

  float extraMegaTower = step(52.0, vDims.y) * step(18.0, vDims.x) * step(1.0 - clamp(uMegaWrap * uSignAmt * 0.28, 0.0, 0.72), fract(vSeed * 19.37));
  float showMediaFacade = clamp(isMedia + extraMegaTower, 0.0, 1.0) * step(0.02, uSignAmt) * step(0.02, uMegaWrap);

  if ((face < 0.5 || face > 1.5) && vKind < 1.5) {
    if (showMediaFacade > 0.5 && wy > 14.0) {
      // Architectural media & mega-facade wrap: framed LED canvases + giant Linear-Synth animated calligraphics!
      float animT = uTime * max(uSignAnim, 0.0);
      float faceHash = hash12(vec2(face * 13.7, floor(vSeed * 89.0)));
      float wrapScaleY = mix(38.0, 68.0, clamp(uMegaWrap * 0.5, 0.0, 1.0));
      vec2 scrUv = vec2(uvm.x / max(vDims.x, 22.0) + 0.5, (wy - 14.0) / wrapScaleY);
      vec2 panelId = floor(vec2(scrUv.x * 1.4, scrUv.y));
      vec2 pf = fract(vec2(scrUv.x * 1.4, scrUv.y));
      float pHash = hash12(panelId * 3.7 + faceHash * 19.0 + vSeed * 43.0);
      float covThresh = clamp(0.74 - 0.28 * clamp(uMegaWrap, 0.0, 2.0) * clamp(uSignAmt, 0.0, 2.0), 0.18, 0.85);
      float activeScreen = step(covThresh, pHash) * step(0.07, pf.x) * step(pf.x, 0.93) * step(0.09, pf.y) * step(pf.y, 0.91);
      if (activeScreen > 0.5) {
        vec2 uvS = (pf - vec2(0.07, 0.09)) / vec2(0.86, 0.82);
        float mode = fract(pHash * 7.31);
        vec3 adBg = mix(base * 0.28, styleBillColor(uBillB) * 0.16, 0.52);
        vec3 screenRgb = adBg;
        if (mode < 0.46) {
          // Simulated Commercial Mega-Ad (Synth-Beverage, Cyber-Coupe, Off-World Travel, Visor Fashion, Ramen, Market, Club, Chrono)
          vec4 simAd = evalSimulatedAd(uvS, pHash * 19.7 + vSeed * 3.1, uGlyphStyle, animT);
          vec3 brandA = mix(uBillA, vec3(1.0, 0.62, 0.18), fract(pHash * 5.3) * 0.45 * (1.0 - uBillMono));
          vec3 brandB = mix(uBillB, vec3(0.20, 0.95, 0.78), fract(pHash * 9.1) * 0.45 * (1.0 - uBillMono));
          vec3 fg = styleBillColor(mix(brandA, brandB, clamp(simAd.y, 0.0, 1.0)) + vec3(0.95, 0.92, 0.85) * simAd.z * 0.42);
          screenRgb = mix(adBg, saturate3(fg, uSat), clamp(simAd.x, 0.0, 1.0));
        } else {
          float motif = 0.0;
          float scrollP = loopPhase(animT, 7.0);
          if (mode < 0.66) {
            float bigGlyph = evalSynthGlyph(vec2(fract(uvS.x * 2.0), clamp((uvS.y - 0.24) / 0.68, 0.0, 1.0)), pHash + floor(uvS.x * 2.0) * 0.31, uGlyphStyle, animT, 0.052) * step(0.24, uvS.y);
            float ticker = evalGlyphLine(vec2(uvS.x, uvS.y / 0.20), 9.0, scrollP * 9.0, pHash, uGlyphStyle, animT) * step(uvS.y, 0.20);
            motif = clamp(bigGlyph + ticker * 0.9, 0.0, 1.0);
          } else if (mode < 0.84) {
            float colIdx = floor(uvS.x * 4.0);
            float vShift = loopPhase(animT, 5.0 + floor(fract(colIdx * 0.37) * 4.0)) * 5.0;
            vec2 vCell = vec2(fract(uvS.x * 4.0), fract(uvS.y * 5.0 + vShift));
            float cSeed = hash12(vec2(colIdx, mod(floor(uvS.y * 5.0 + vShift), 5.0) + pHash * 17.0));
            motif = evalSynthGlyph(vCell, cSeed, uGlyphStyle, animT, 0.058) * step(0.22, fract(pHash * 5.3 + colIdx * 0.29));
          } else {
            float wave = smoothstep(0.08, 0.0, abs(uvS.y - 0.56 - 0.20 * loopSin(animT, 0.22, uvS.x * 6.28 + pHash * 9.0)));
            float badge = evalSynthGlyph((uvS - vec2(0.68, 0.08)) / 0.26, pHash * 3.1, uGlyphStyle, animT, 0.06) * step(0.68, uvS.x) * step(uvS.y, 0.34);
            motif = clamp(wave + badge, 0.0, 1.0);
          }
          vec3 adFg = styleBillColor(mix(uBillA, uBillB, fract(pHash * 4.1 + motif * 0.25)));
          screenRgb = mix(adBg, saturate3(adFg, uSat), motif);
        }
        float scan = 0.86 + 0.14 * loopSin(animT, 0.95, wy * 6.0);
        float emK = clamp(uBillK * max(uLightK, 0.28) * min(uSignAmt, 1.6), 0.0, 1.55) * 0.82;
        col = mix(col, screenRgb * (0.45 + emK) * scan, 0.92);
      } else {
        // Dark architectural office windows on the non-screen structural bays
        vec2 wg = uvm / vec2(3.6, 3.8);
        vec2 wf = fract(wg);
        float winM = step(0.22, wf.x) * step(wf.x, 0.78) * step(0.24, wf.y) * step(wf.y, 0.76);
        float wr = hash12(floor(wg) + vSeed * 53.0);
        col += saturate3(uWinA, uSat) * winM * step(wr, uWinDensity * 0.32) * uWinGlow * 0.55;
      }
    } else if (vDims.y < 13.5 && isStreetPod < 0.5) {
      // Suburban residential house / cottage windows: smooth 24h-periodic circadian rhythm + looped live switching!
      vec2 hg = uvm / vec2(4.2, 3.2);
      vec2 hgid = floor(hg);
      vec2 hf = fract(hg);
      float hWin = step(0.26, hf.x) * step(hf.x, 0.74) * step(0.30, hf.y) * step(hf.y, 0.76);
      float hr = hash12(hgid + vSeed * 31.7);
      float domOcc = evalCircadian24(uDayPhase, hr, hr, 1.0);
      float liveToggle = evalLoopedToggle(uTime, 0.07 + hr * 0.11, hgid, vSeed * 19.0);
      float roomOn = step(mix(hr, liveToggle, 0.36), clamp(uWinDensity * 0.95 * domOcc, 0.0, 0.96));
      float tvShimmer = (hr > 0.72) ? (0.82 + 0.18 * loopSin(uTime, 0.85, hr * 47.0)) : 1.0;
      vec3 hCol = saturate3(mix(uWinA, mix(uPoolCol, uWinC, step(0.76, hr) * 0.45), 0.45), uSat);
      col += hCol * hWin * roomOn * (uWinGlow * 0.85) * tvShimmer;
      // Daytime sunlit glass reflection on suburban house panes
      float dayRefl = clamp(1.0 - uLightK, 0.0, 1.0) * hWin * (1.0 - roomOn * 0.6);
      col = mix(col, mix(uAmb, uSunCol, 0.35) * 0.72, dayRefl * 0.42 * (1.0 - uFlat));
    } else if (wy < 15.8 || isStreetPod > 0.5) {
      float podH = 5.6;
      float bayW = 5.6;
      float bx = fract(uvm.x / bayW);
      float pilaster = 1.0 - step(0.13, bx) * step(bx, 0.87);
      if (wy < podH) {
        float glass = (1.0 - pilaster) * step(0.32, wy) * step(wy, podH - 0.62);
        float awning = (1.0 - pilaster * 0.5) * step(podH - 0.95, wy) * step(wy, podH - 0.52);
        float shopId = floor(uvm.x / bayW);
        float shHash = hash12(vec2(shopId, floor(vSeed * 97.0)));
        float shopSched = clamp(0.42 + 0.68 * evalCircadian24(uDayPhase, shHash, shHash, 0.5), 0.35, 1.15);
        float openShop = step(0.16, shHash * shopSched + uWinDensity * 0.45);
        vec3 shopCol = mix(uPoolCol, uWinA, fract(shHash * 3.7));
        shopCol = mix(shopCol, styleBillColor(uBillA), step(0.78, shHash) * 0.55);
        shopCol = saturate3(shopCol, uSat);
        // Ground-floor retail merchandise shelves, cafe counter & vertical mullions
        float mull = step(0.08, fract(bx * 3.0));
        float interiorBand = (0.62 + 0.38 * step(0.42, fract(wy * 0.75 + shHash * 4.0))) * (0.82 + 0.18 * mull);
        col *= 1.0 - pilaster * 0.26;
        col = mix(col, shopCol * (0.45 + uWinGlow * 0.65 + uLightK * 0.45) * interiorBand * shopSched, glass * openShop * 0.88);
        // Striped fabric / metal street-cafe awning + illuminated shopfront glyph fascia!
        vec3 awnCol = mix(base * 0.75, styleBillColor(mix(uBillA, uBillB, fract(shHash * 5.1))), 0.45) * (0.8 + 0.2 * step(0.5, fract(uvm.x * 1.6)));
        col = mix(col, saturate3(awnCol, uSat), awning * step(0.32, shHash) * 0.85);
        float fascia = (1.0 - pilaster * 0.65) * step(podH - 0.50, wy) * step(wy, podH - 0.08);
        float shopGlyph = evalGlyphLine(vec2(clamp((bx - 0.14) / 0.72, 0.0, 1.0), clamp((wy - (podH - 0.48)) / 0.38, 0.0, 1.0)), 5.0, 0.0, shHash * 29.0, uGlyphStyle, 0.0);
        col += saturate3(styleBillColor(mix(uWinA, uBillA, 0.45)), uSat) * fascia * (0.35 + 0.85 * shopGlyph) * step(0.28, shHash) * (0.45 + uLightK * 0.65);
      } else {
        vec2 mg = vec2(uvm.x / bayW, (wy - podH) / 4.6);
        vec2 mgid = floor(mg);
        vec2 mf = fract(mg);
        float mWin = step(0.16, mf.x) * step(mf.x, 0.84) * step(0.22, mf.y) * step(mf.y, 0.80);
        float mr = hash12(mgid + vSeed * 23.1);
        float mToggle = evalLoopedToggle(uTime, 0.09 + mr * 0.12, mgid, vSeed * 13.0);
        vec3 mCol = saturate3(mix(uWinA, uWinB, step(0.6, mr)), uSat);
        col += mCol * mWin * step(mix(mr, mToggle, 0.32), uWinDensity * 1.15) * uWinGlow * 0.85;
        float cornice = step(14.9, wy) * step(wy, 15.75);
        col = mix(col, col * 1.45 + uEdgeCol * 0.14, cornice);
      }
    } else {
      float floorH = 3.5 * bayMul;
      float bayW = 3.9 * bayMul;
      float dens = uWinDensity * densMul;
      float glow = uWinGlow;
      if (vKind > 0.5 && vKind < 1.5) { floorH = 5.2 * bayMul; bayW = 6.2 * bayMul; dens *= 0.3; glow *= 0.6; }

      vec2 g = uvm / vec2(bayW, floorH);
      vec2 gid = floor(g);
      vec2 f = fract(g);
      float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.26, f.y) * step(f.y, 0.78);
      float r1 = hash12(gid + vec2(vSeed * 17.3, vSeed * 29.1));
      float flrHash = hash12(vec2(gid.y * 0.73, floor(vSeed * 113.0) + face * 7.0));

      // Smooth 24-hour periodic circadian rhythm (C-infinity across 00:00 / 24:00, zero jumps!)
      float bPhase = fract(vSeed * 5.71);
      float duskOn = evalCircadian24(uDayPhase, bPhase * 0.6 + r1 * 0.4, flrHash, 0.0);
      float dayOffice = 1.0 - smoothstep(0.45, 0.85, duskOn);

      // Seamless PC_LOOP-periodic suite switching: rooms flick on and off organically with zero loop seams!
      float swRate = 0.08 + fract(r1 * 13.7) * 0.16;
      float rLive = evalLoopedToggle(uTime, swRate, gid, vSeed * 41.9 + flrHash * 7.0);
      float effRand = mix(r1, rLive, 0.38);

      // Whole-floor office ribbon boost on active corporate floors
      float floorBand = step(0.78, flrHash) * 0.22 * smoothstep(0.55, 1.05, duskOn);
      float effDens = clamp(dens * duskOn + floorBand, 0.0, 0.95);
      float litWin = step(effRand, effDens) * win;

      // Subtle Venetian blinds & room depth partitioning inside lit windows
      float blinds = mix(1.0, 0.72 + 0.28 * step(0.38, fract(f.y * 5.0 + r1 * 3.0)), step(0.55, fract(r1 * 9.3)));
      float holoPulse = (r1 > 0.78)
        ? (0.78 + 0.22 * loopSin(uTime, 0.52 + fract(r1 * 7.1) * 0.62, r1 * 60.0))
        : (0.90 + 0.10 * loopSin(uTime, 0.22, r1 * 45.0));
      litWin *= blinds * holoPulse;

      float r2 = hash12(gid + vec2(vSeed * 37.7, 5.0));
      vec3 lookWin = uWinA;
      if (r2 > 0.55) lookWin = uWinB;
      if (r2 > 0.82) lookWin = uWinC;
      vec3 natWin = vec3(1.0, 0.82, 0.56);
      if (r2 > 0.45) natWin = vec3(1.0, 0.93, 0.82);
      if (r2 > 0.76) natWin = vec3(0.76, 0.88, 1.0);
      vec3 wc = mix(natWin, lookWin, clamp(0.22 + 0.78 * uTint, 0.0, 1.0));

      // Exterior glass express elevator shaft on tall towers: integer-harmonic looped cab cycle!
      float nCols = max(3.0, floor(vDims.x / bayW));
      float elevCol = floor((fract(vSeed * 11.3) - 0.5) * (nCols * 0.5));
      float isElevShaft = step(42.0, vDims.y) * step(abs(gid.x - elevCol), 0.45) * step(0.5, densMul);
      if (isElevShaft > 0.5 && win > 0.5) {
        float shaftTop = max(18.0, vDims.y * 0.46);
        float cabHarm = 16.0 + floor(fract(vSeed * 3.7) * 16.0);
        float cabCycle = fract(loopPhase(uTime, cabHarm) + vSeed * 17.0);
        float cabTri = 1.0 - abs(cabCycle * 2.0 - 1.0);
        float cabEase = cabTri * cabTri * (3.0 - 2.0 * cabTri);
        float cabY = mix(-vDims.y * 0.42, shaftTop, cabEase);
        float cabDist = abs(uvm.y - cabY);
        float cabGlow = 1.0 - smoothstep(1.2, 4.8, cabDist);
        litWin = max(litWin * 0.25, cabGlow * 1.25);
        wc = mix(wc, mix(uWinA, uEdgeCol, 0.45), cabGlow * 0.85);
      }

      // Daytime sky & sun reflection on unlit curtain-wall glass panes
      float dayStrength = clamp(1.0 - uLightK * 0.85, 0.0, 1.0) * (1.0 - uFlat);
      if (dayStrength > 0.02 && win > 0.5) {
        vec3 reflDir = reflect(vdir, n);
        float skyUp = clamp(reflDir.y * 0.5 + 0.5, 0.0, 1.0);
        float sunGlint = pow(max(dot(reflDir, normalize(uSunDir)), 0.0), 16.0);
        float paneVar = 0.82 + 0.32 * r1;
        vec3 glassSky = mix(uAmbG * 0.85, mix(uAmb, uFogCol, 0.45) * 1.35, skyUp) * paneVar
          + uSunCol * sunGlint * uSunK * 0.55;
        col = mix(col, saturate3(glassSky, uSat), win * (1.0 - litWin * 0.75) * dayStrength * 0.52);
      }

      // Director / WebMCP per-building window takeover (0=off, 1=blackout, 2=solid/pulse, 3=strobe, 4=dim-for-text)
      if (uOverrideBldg.w > 0.5) {
        vec2 dOv = abs(vFlat.xz - uOverrideBldg.xy);
        if (max(dOv.x, dOv.y) < uOverrideBldg.z) {
          if (uOverrideBldg.w < 1.5) {
            litWin = 0.0;
          } else if (uOverrideBldg.w < 2.5) {
            litWin = win * (0.78 + 0.22 * sin(uTime * 3.2 + gid.y * 0.35));
            wc = uOverrideColor;
          } else if (uOverrideBldg.w < 3.5) {
            litWin = win * step(0.35, fract(uTime * 4.5 + gid.y * 0.08));
            wc = uOverrideColor;
          } else {
            litWin *= 0.08;
          }
        }
      }

      col += saturate3(wc, uSat) * litWin * (glow + 0.24 * dayOffice * (1.0 - uLightK));
      col *= mix(1.0, 0.86 + 0.14 * (1.0 - win), clamp(uWinGlow * 0.5, 0.0, 0.6));
    }
  } else if (face > 0.5 && face < 1.5 && vLocal.y > 0.1 && vKind < 1.5 && vDims.y > 9.0) {
    // Rich Procedural Rooftop Diversity (Parapets, Solar PV Arrays, HVAC Fans & Ducts, Helipads, Skylights & Green Terraces!)
    vec2 rp = uvm; // metres from roof centre in [-vDims.x*0.5..+vDims.x*0.5, -vDims.z*0.5..+vDims.z*0.5]
    vec2 halfR = max(vDims.xz * 0.5, vec2(3.0));
    float dRim = min(halfR.x - abs(rp.x), halfR.y - abs(rp.y));
    float parapet = 1.0 - smoothstep(0.85, 1.35, dRim);
    vec2 memGrid = abs(fract(rp / 3.0) - 0.5);
    float memSeam = 1.0 - smoothstep(0.0, 0.05, min(memGrid.x, memGrid.y));
    vec3 roofBase = col * (0.78 - 0.10 * memSeam);
    roofBase = mix(roofBase, col * 1.24, parapet * 0.85);

    float roofType = fract(vSeed * 29.17 + floor(vKind + 0.5) * 0.31);
    float innerMask = smoothstep(1.6, 2.4, dRim);
    if (roofType < 0.30) {
      // 1. Rooftop Solar Photovoltaic Array: angled dark-cobalt silicon cells + silver frames + sun specular
      float rowF = fract(rp.y / 2.6);
      float colF = fract(rp.x / 1.8);
      float pvPanel = step(0.24, rowF) * step(rowF, 0.88) * step(0.08, colF) * step(colF, 0.92) * innerMask;
      float pvFrame = pvPanel * (1.0 - step(0.30, rowF) * step(rowF, 0.82) * step(0.14, colF) * step(colF, 0.86));
      vec3 pvCell = mix(vec3(0.06, 0.11, 0.22), uAmb * 0.85 + uSunCol * 0.28 * uSunK, 0.45);
      roofBase = mix(roofBase, saturate3(pvCell, uSat), pvPanel * 0.90);
      roofBase = mix(roofBase, vec3(0.62, 0.66, 0.72), pvFrame * 0.65);
    } else if (roofType < 0.60) {
      // 2. Industrial HVAC Condenser Bank + Galvanized Sheet-Metal Ductwork
      vec2 hvacUv = mod(rp + halfR * 0.5, vec2(7.0, 7.0)) - 3.5;
      float fanR = length(hvacUv);
      float hvacBox = step(max(abs(hvacUv.x), abs(hvacUv.y)), 2.2) * innerMask;
      float fanWell = (1.0 - smoothstep(1.35, 1.55, fanR)) * hvacBox;
      float ang = atan(hvacUv.y, hvacUv.x) + loopPhase(uTime, 24.0) * 6.2831853;
      float blades = step(0.15, sin(ang * 4.0)) * fanWell;
      float duct = (1.0 - smoothstep(0.45, 0.65, abs(rp.x))) * step(abs(rp.y), halfR.y * 0.68) * innerMask;
      roofBase = mix(roofBase, roofBase * 1.35 + vec3(0.08), max(hvacBox, duct) * 0.82);
      roofBase = mix(roofBase, roofBase * 0.28, fanWell * (1.0 - blades * 0.55));
    } else if (roofType < 0.80 && min(vDims.x, vDims.z) > 18.0) {
      // 3. Executive Rooftop Helipad: circular touch-down ring, 'H' stencil & perimeter beacons
      float padR = min(halfR.x, halfR.y) * 0.62;
      float r = length(rp);
      float ring = smoothstep(0.55, 0.15, abs(r - padR)) * innerMask;
      vec2 hp = rp / max(padR, 1.0);
      float barL = step(abs(hp.x + 0.26), 0.08) * step(abs(hp.y), 0.42);
      float barR = step(abs(hp.x - 0.26), 0.08) * step(abs(hp.y), 0.42);
      float barM = step(abs(hp.x), 0.28) * step(abs(hp.y), 0.07);
      float hMark = clamp(barL + barR + barM, 0.0, 1.0) * step(r, padR * 0.85);
      float periLight = smoothstep(0.45, 0.08, abs(r - padR * 1.08)) * step(0.72, cos(atan(rp.y, rp.x) * 8.0));
      vec3 markCol = saturate3(mix(vec3(0.92, 0.78, 0.22), uEdgeCol, clamp(uTint * 0.6, 0.0, 1.0)), uSat);
      roofBase = mix(roofBase, roofBase * 0.65, step(r, padR) * 0.45);
      roofBase = mix(roofBase, markCol, clamp(ring + hMark, 0.0, 1.0) * 0.88);
      roofBase += saturate3(uWinA, uSat) * periLight * (0.55 + 0.45 * loopSin(uTime, 0.5, vSeed * 12.0)) * max(uLightK, 0.25);
    } else {
      // 4. Landscaped Sky-Garden Terrace + Illuminated Atrium Skylights
      float greenBed = smoothstep(2.4, 3.6, dRim) * (1.0 - step(abs(rp.x), halfR.x * 0.34) * step(abs(rp.y), halfR.y * 0.34));
      float skylight = step(abs(rp.x), halfR.x * 0.28) * step(abs(rp.y), halfR.y * 0.28) * innerMask;
      float mull = step(0.12, fract(rp.x / 2.0)) * step(0.12, fract(rp.y / 2.0));
      vec3 gardenCol = saturate3(mix(roofBase, vec3(0.12, 0.27, 0.14) + roofBase * 0.4, 0.65), uSat);
      roofBase = mix(roofBase, gardenCol, greenBed * 0.78);
      roofBase = mix(roofBase, saturate3(mix(uWinA, uWinB, 0.4), uSat) * (0.45 + uWinGlow * 0.65 * max(uLightK, 0.25)), skylight * mull * 0.85);
    }
    col = roofBase;
  }

  if (vKind > 2.5) {
    col = saturate3(uEdgeCol, uSat) * (1.1 + uBandGlow);
  } else if (vKind > 1.5 && vKind < 2.5) {
    col += saturate3(uWinC, uSat) * 0.2;
  } else if (isStreetPod > 0.5 && vKind > 0.5 && wy < 9.5) {
    float rim = 1.0 - abs(vLocal.y) * 1.6;
    col += saturate3(styleBillColor(mix(uPoolCol, uBillA, 0.35)), uSat) * clamp(rim, 0.0, 1.0) * 0.38 * max(uLightK, 0.2);
  }

  vec3 ad = 0.5 - abs(vLocal);
  float ed;
  if (face < 0.5) ed = min(ad.y, ad.z);
  else if (face < 1.5) ed = min(ad.x, ad.z);
  else ed = min(ad.x, ad.y);
  float wd = fwidth(ed);
  float edge = 1.0 - smoothstep(0.0, max(wd, 1e-5) * 1.8, ed);
  float eK = uEdge + edgeBoost;
  vec3 eCol = saturate3(isMedia > 0.5 ? styleBillColor(uBillA) : uEdgeCol, uSat);
  col = mix(col, eCol * (0.55 + uBandGlow * 0.35), edge * min(eK, 1.0));
  col += eCol * edge * max(eK - 1.0, 0.0);

  float dist = length(vWorld - cameraPosition);
  float density = uFogDensity * exp(-wy * uFogHeight);
  float fogF = 1.0 - exp(-density * dist);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, normalize(uSunDir)), 0.0), 6.0) * uHazeSun);
  gl_FragColor = vec4(mix(col, fogCol, clamp(fogF, 0.0, 1.0)), 1.0);
}
`;

/* ------------------------------------------------------------- landmarks */

export const LANDMARK_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vFlat;
varying vec3 vWorld;
varying vec3 vLocalN;
varying vec3 vLocalP;
${GLSL_CURVE}
void main() {
  vLocalP = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vFlat = wp.xyz;
  vec3 nrm = normalize(mat3(modelMatrix) * normal);
  vLocalN = nrm;
  vN = bendNormal(wp.xz, nrm);
  wp.xyz = bendWorld(wp.xyz);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const LANDMARK_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform float uRole;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunK;
uniform vec3 uAmb;
uniform vec3 uAmbG;
uniform float uWinDensity;
uniform float uWinGlow;
uniform vec3 uWinA;
uniform vec3 uWinB;
uniform vec3 uWinC;
uniform float uEdge;
uniform vec3 uEdgeCol;
uniform float uBandGlow;
uniform float uToon;
uniform float uFlat;
uniform vec3 uPoolCol;
uniform float uLightK;
uniform float uDayPhase;
uniform vec3 uFogCol;
uniform vec3 uSunFogCol;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uHazeSun;
uniform float uTime;
uniform float uSat;
uniform float uTint;
varying vec3 vN;
varying vec3 vFlat;
varying vec3 vWorld;
varying vec3 vLocalN;
varying vec3 vLocalP;
${GLSL_NOISE}
${GLSL_UTIL}
void main() {
  vec3 n = normalize(vN);
  vec3 ln = normalize(vLocalN);
  vec3 vdir = normalize(vWorld - cameraPosition);
  float wy = max(vFlat.y, 0.0);

  // Tangent architectural coordinate that works on flat box walls, 45-deg pyramid faces, AND cylinders!
  vec3 horizT = cross(vec3(0.0, 1.0, 0.0), ln);
  float hLen = length(horizT);
  horizT = hLen > 1e-3 ? horizT / hLen : vec3(1.0, 0.0, 0.0);
  float uCoord = dot(vFlat, horizT);

  // Subtle architectural stone/metal panelling relief before lighting
  float megaSeam = 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.06, abs(fract(wy / 22.0) - 0.5)));
  float cofferX = fract(uCoord / 6.0);
  float cofferY = fract(wy / 4.2);
  float panelShade = (0.92 + 0.08 * step(0.09, cofferX) * step(cofferX, 0.91) * step(0.10, cofferY)) * megaSeam;
  float lmMatHash = hash12(floor(vFlat.xz * 0.004) + vec2(3.7, 9.1));
  vec3 natStone = mix(vec3(0.55, 0.52, 0.47), vec3(0.35, 0.41, 0.48), step(0.5, lmMatHash));
  vec3 base = mix(natStone, uCol, clamp(0.20 + 0.80 * uTint, 0.0, 1.0)) * mix(panelShade, 1.0, uFlat * 0.7);

  float dif = max(dot(n, normalize(uSunDir)), 0.0);
  float toonD = floor(dif * 3.0 + 0.5) / 3.0;
  dif = mix(dif, toonD, uToon);
  vec3 amb = mix(uAmbG, uAmb, n.y * 0.5 + 0.5);
  vec3 lit = base * (amb + uSunCol * uSunK * dif);
  vec3 col = mix(lit, base, uFlat);

  // Warm/look-tinted street bounce on lower plinths, arches & grand staircases
  float streetBounce = exp(-wy * 0.065) * max(uLightK, 0.14);
  col += base * uPoolCol * streetBounce * 0.52 + uPoolCol * streetBounce * 0.04;
  col = saturate3(col, uSat);

  if (uRole > 1.5 && uRole < 2.5) {
    // Role 2: Glowing theme-accent structural rib / conduit / crown halo
    float pulse = 0.88 + 0.12 * loopSin(uTime, 0.28, wy * 0.045);
    vec3 em = saturate3(uCol, uSat) * (0.72 + uBandGlow * 0.95 * max(uLightK, 0.32)) * pulse;
    col = mix(col, em, 0.86);
  } else if (uRole > 2.5 && uRole < 3.5) {
    // Role 3: Panoramic illuminated sky-gallery / observation deck / atrium skylight
    float colSil = step(0.18, fract(uCoord / 3.4));
    float mull = step(0.14, fract(wy / 3.6));
    vec3 galCol = saturate3(mix(uWinA, uWinB, 0.32), uSat);
    float galK = (0.55 + uWinGlow * 0.82) * max(uLightK, 0.35);
    col = mix(col * 0.45, galCol * galK, (0.35 + 0.65 * colSil * mull));
  } else if (uRole > 3.5 && uRole < 4.5) {
    // Role 4: Biophilic Hanging-Garden Botanical Canopy, Moss & Trailing Vines
    float leafLo = vnoise(vFlat.xz * 0.28 + vec2(wy * 0.14, wy * -0.11));
    float leafHi = vnoise(vFlat.xz * 0.95 + vec2(uCoord * 0.55, wy * 0.62));
    float vine = (abs(ln.y) < 0.55)
      ? smoothstep(0.32, 0.82, vnoise(vec2(uCoord * 1.45, wy * 0.22)))
      : 1.0;
    vec3 lushCol = saturate3(uCol * (0.68 + 0.58 * leafLo + 0.26 * leafHi), uSat);
    float sunLeaf = pow(max(dot(n, normalize(uSunDir)), 0.0), 0.72);
    vec3 litLeaf = lushCol * (amb * 1.12 + uSunCol * uSunK * (0.32 + 0.88 * sunLeaf));
    col = mix(litLeaf, lushCol, uFlat * 0.75) * (0.78 + 0.22 * vine);
    // Subtle nocturnal garden fairy-lantern / bioluminescent firefly motes
    vec2 gCell = floor(vec2(uCoord * 0.55 + vFlat.x * 0.12, wy * 0.55 + vFlat.z * 0.12));
    float gRnd = hash12(gCell + vec2(41.2, 13.8));
    if (gRnd > 0.88) {
      float twinkle = 0.55 + 0.45 * loopSin(uTime, 0.35 + fract(gRnd * 7.3) * 0.4, gRnd * 60.0);
      vec3 glowTone = saturate3(mix(uCol * 1.45, uWinA, 0.48), uSat);
      col += glowTone * twinkle * max(uLightK, 0.22) * (0.35 + 0.45 * uWinGlow);
    }
  } else if (uRole > 4.5 && uRole < 5.5) {
    // Role 5: Brutalist Board-Formed Beton-Brut Concrete & Recessed Waffle-Slab Loggias
    float shutterY = fract(wy / 2.8);
    float boardGrain = 0.90 + 0.13 * vnoise(vec2(uCoord * 0.35, floor(wy / 2.8) * 3.7));
    float jointLine = smoothstep(0.0, 0.07, shutterY) * smoothstep(1.0, 0.93, shutterY);
    vec2 tieUv = fract(vec2(uCoord / 3.2, wy / 2.8)) - 0.5;
    float tieHole = 1.0 - 0.25 * (1.0 - smoothstep(0.04, 0.09, length(tieUv)));
    col *= boardGrain * (0.86 + 0.14 * jointLine) * tieHole;

    if (abs(ln.y) < 0.32) {
      // Deep coffered residential loggia bays + concrete brise-soleil fins
      vec2 wGrid = vec2(uCoord / 5.2, wy / 3.6);
      vec2 wId = floor(wGrid);
      vec2 wf = fract(wGrid);
      float recess = step(0.15, wf.x) * step(wf.x, 0.85) * step(0.18, wf.y) * step(wf.y, 0.84);
      col *= 1.0 - 0.42 * recess * (1.0 - uFlat * 0.7);
      float wr = hash12(wId + vec2(29.1, 7.4));
      float wCirc = evalCircadian24(uDayPhase, wr, fract(wr * 5.7), 0.12);
      float wSw = evalLoopedToggle(uTime, 0.08 + fract(wr * 8.3) * 0.12, wId, wr * 23.0);
      float wOn = step(mix(wr, wSw, 0.32), (uWinDensity * 0.82 + 0.14) * wCirc) * recess;
      // Warm recessed apartment window behind balcony balustrade
      float paneMask = step(0.34, wf.y) * step(0.24, wf.x) * step(wf.x, 0.76);
      vec3 aptCol = saturate3(mix(uWinA, uWinB, step(0.62, hash12(wId + 4.9))), uSat);
      col += aptCol * wOn * paneMask * uWinGlow * 0.96;
    }
  } else if (uRole > 5.5) {
    // Role 6: Cascading Sky-Waterfall Veil & Shimmering Terrace Infinity Pool
    float fallPhase = loopPhase(uTime, 14.0);
    float streamA = sin(uCoord * 3.2) * 0.5 + 0.5;
    float cascadeWave = 0.5 + 0.5 * sin(wy * 1.35 + fallPhase * 6.0 + streamA * 3.1);
    float fineSpray = vnoise(vec2(uCoord * 2.4, wy * 0.75 + sin(fallPhase) * 4.0));
    float crestFoam = (ln.y > 0.65)
      ? 0.25 + 0.35 * fineSpray
      : (0.32 + 0.48 * cascadeWave * fineSpray);
    vec3 aquaBase = saturate3(uCol, uSat);
    vec3 foamTone = saturate3(mix(uCol * 1.55 + vec3(0.24), uSunCol + vec3(0.45), 0.35), uSat);
    float fres = pow(1.0 - max(dot(-vdir, n), 0.0), 2.4);
    vec3 wLit = mix(aquaBase * (0.55 + 0.55 * max(uSunK, 0.35)), foamTone, clamp(crestFoam + fres * 0.45, 0.0, 1.0));
    // Nocturnal underwater architectural uplighting
    wLit += saturate3(mix(uCol, uWinB, 0.35), uSat) * max(uLightK, 0.25) * (0.38 + 0.35 * uBandGlow);
    col = mix(col, wLit, 0.90);
  } else {
    // Roles 0 & 1: Monumental architectural facades (vertical walls + sloped pyramid/ziggurat faces)
    float densRole = (uRole > 0.5) ? 0.34 : 0.88;
    float absY = abs(ln.y);
    if (absY < 0.26) {
      float bayW = (uRole > 0.5) ? 5.8 : 4.2;
      float flrH = (uRole > 0.5) ? 5.0 : 3.8;
      vec2 g = vec2(uCoord / bayW, wy / flrH);
      vec2 gid = floor(g);
      vec2 f = fract(g);
      float mullion = 1.0 - step(0.14, f.x) * step(f.x, 0.86);
      col *= 1.0 - mullion * 0.14 * (1.0 - uFlat);

      float win = step(0.20, f.x) * step(f.x, 0.80) * step(0.24, f.y) * step(f.y, 0.78);
      float skyRibbon = (uRole < 0.5 && mod(gid.y, 8.0) < 0.5) ? 1.0 : 0.0;
      float r = hash12(gid + vec2(11.7, 5.3));
      float flrH2 = hash12(vec2(gid.y * 0.67, 17.3));
      float schedMul = mix(evalCircadian24(uDayPhase, r, flrH2, 0.0), 1.0, skyRibbon * 0.45);
      float rSwitch = evalLoopedToggle(uTime, 0.09 + fract(r * 9.7) * 0.14, gid, r * 31.0);
      float effR = mix(r, rSwitch, 0.35);
      float litOn = mix(step(effR, uWinDensity * densRole * schedMul), step(effR, min(0.94, (uWinDensity * 1.35 + 0.25) * schedMul)), skyRibbon) * win;
      litOn *= 0.88 + 0.12 * loopSin(uTime, 0.30, r * 52.0);
      float rCol = hash12(gid + vec2(3.3, 19.1));
      vec3 wc = uWinA;
      if (rCol > 0.56) wc = uWinB;
      if (rCol > 0.86) wc = uWinC;
      float dayG = clamp(1.0 - uLightK * 0.85, 0.0, 1.0) * win * (1.0 - litOn * 0.7) * (1.0 - uFlat);
      col = mix(col, saturate3(mix(uAmbG, uAmb * 1.35, 0.65) + uSunCol * 0.18 * uSunK, uSat), dayG * 0.48);
      col += saturate3(wc, uSat) * litOn * uWinGlow * (0.85 + 0.30 * skyRibbon);
    } else if (absY < 0.86) {
      float course = fract(wy / 5.5);
      float blockJoint = step(0.08, fract(uCoord / 7.5 + floor(wy / 5.5) * 0.5));
      col *= 0.88 + 0.15 * smoothstep(0.0, 0.22, course) * blockJoint;

      vec2 sg = vec2(uCoord / 4.8, wy / 11.0);
      vec2 sgid = floor(sg);
      vec2 sf = fract(sg);
      float slit = step(0.16, sf.x) * step(sf.x, 0.84) * step(0.62, sf.y) * step(sf.y, 0.86);
      float sr = hash12(sgid + vec2(23.4, 9.1));
      float sSwitch = evalLoopedToggle(uTime, 0.08 + fract(sr * 11.3) * 0.14, sgid, sr * 29.0);
      float sDusk = evalCircadian24(uDayPhase, sr, fract(sr * 3.1), 0.0);
      float sOn = step(mix(sr, sSwitch, 0.34), uWinDensity * densRole * 0.95 * sDusk) * slit;
      vec3 swc = mix(uWinA, uWinB, step(0.58, hash12(sgid + 7.7)));
      col += saturate3(swc, uSat) * sOn * uWinGlow * 0.92;
    } else if (ln.y > 0.85 && uRole < 0.5) {
      // Rooftop / terrace deck subtle paver grid + landing pad rim accent
      vec2 rg = vFlat.xz / 8.0;
      float seam = step(0.08, fract(rg.x)) * step(0.08, fract(rg.y));
      col *= 0.90 + 0.10 * seam;
    }
  }

  // Crisp silhouette & architectural edge highlight (honouring Tron/Outrun/Anime edge glow)
  float rim = pow(1.0 - max(dot(-vdir, n), 0.0), 2.3);
  vec3 boxAd = 0.5 - abs(vLocalP);
  float minAd = min(min(abs(boxAd.x), abs(boxAd.y)), abs(boxAd.z));
  float boxCrease = 1.0 - smoothstep(0.0, max(fwidth(minAd), 1e-4) * 1.7, minAd);
  vec3 eCol = saturate3(uEdgeCol, uSat);
  col += eCol * (rim * 0.55 + boxCrease * 0.45) * uEdge * (0.65 + 0.35 * uBandGlow);

  float dist = length(vWorld - cameraPosition);
  float density = uFogDensity * exp(-wy * uFogHeight);
  float fogF = 1.0 - exp(-density * dist);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, normalize(uSunDir)), 0.0), 6.0) * uHazeSun);
  gl_FragColor = vec4(mix(col, fogCol, clamp(fogF, 0.0, 1.0)), 1.0);
}
`;

/* ------------------------------------------- curved unlit / vertex-color */
// Used for boulevard centre lines, trees, and articulated vehicle hulls so
// 100% of world meshes bend smoothly between Plane and Sphere.

export const SOLID_CURVED_VERT = /* glsl */ `
uniform vec3 uColor;
varying vec3 vCol;
${GLSL_CURVE}
void main() {
  vec3 c = uColor;
  #ifdef USE_COLOR
    c *= color;
  #endif
  #ifdef USE_INSTANCING_COLOR
    c *= instanceColor;
  #endif
  vCol = c;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  wp.xyz = bendWorld(wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const SOLID_CURVED_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  gl_FragColor = vec4(vCol, 1.0);
}
`;

/* ------------------------------------------- sci-fi vehicle hulls & lamps */
// Dedicated shader for articulated hero vehicles (DeLoreans, Fifth Element
// cabs, Spinners, Speeders, Sky-Trains, Helicopters, Blimps) so front
// headlights (+X, aRole=3) shine crisp warm-white/xenon and rear taillights
// (-X, aRole=4) glow vivid crimson-red WITHOUT being muddied by hull paint!

export const VEHICLE_VERT = /* glsl */ `
attribute float aRole;
varying vec3 vHullCol;
varying vec3 vPartTint;
varying vec3 vWorldN;
varying float vRole;
${GLSL_CURVE}
void main() {
  vRole = aRole;
  vec3 pt = vec3(1.0);
  #ifdef USE_COLOR
    pt = color;
  #endif
  vPartTint = pt;
  vec3 ic = vec3(0.55, 0.62, 0.72);
  #ifdef USE_INSTANCING_COLOR
    ic = instanceColor;
  #endif
  vHullCol = ic;

  vec3 nrm = normal;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    nrm = mat3(instanceMatrix) * nrm;
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  vWorldN = bendNormal(wp.xz, normalize(mat3(modelMatrix) * nrm));
  wp.xyz = bendWorld(wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const VEHICLE_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform float uLightK;
uniform float uVehLight;
uniform float uBillMono;
uniform float uTint;
varying vec3 vHullCol;
varying vec3 vPartTint;
varying vec3 vWorldN;
varying float vRole;
void main() {
  vec3 n = normalize(vWorldN);
  float sunD = max(dot(n, normalize(uSunDir)), 0.0);
  float skyHemi = 0.45 + 0.55 * clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  float shade = mix(0.46 * skyHemi + 0.78 * sunD, 0.68 * skyHemi + 0.32 * sunD, uLightK * 0.55);

  float coatId = fract(dot(vHullCol, vec3(17.31, 43.17, 29.53)));
  vec3 autoPaint = vec3(0.76, 0.80, 0.85);
  if (coatId > 0.18) autoPaint = vec3(0.92, 0.70, 0.12);
  if (coatId > 0.34) autoPaint = vec3(0.16, 0.24, 0.38);
  if (coatId > 0.50) autoPaint = vec3(0.88, 0.90, 0.93);
  if (coatId > 0.64) autoPaint = vec3(0.24, 0.27, 0.31);
  if (coatId > 0.78) autoPaint = vec3(0.74, 0.16, 0.20);
  if (coatId > 0.90) autoPaint = vec3(0.18, 0.42, 0.36);
  vec3 effHull = mix(autoPaint, vHullCol, clamp(uTint, 0.0, 1.0));
  float vL = max(uVehLight, 0.0);

  vec3 col;
  if (vRole < 0.5) {
    col = mix(vPartTint, effHull, 0.76) * shade + vec3(0.08) * pow(sunD, 6.0) * (1.0 - uLightK * 0.55);
  } else if (vRole < 1.5) {
    col = mix(vPartTint, effHull * 0.38, 0.28) * (0.55 + 0.45 * shade);
  } else if (vRole < 2.5) {
    col = vPartTint * (0.55 + 0.65 * skyHemi) + effHull * 0.14 * uLightK * vL;
  } else if (vRole < 3.5) {
    vec3 headRgb = mix(effHull * 0.35, vPartTint * (1.05 + uLightK * 1.15) * max(vL, 0.08), clamp(vL, 0.0, 1.0));
    if (vL > 1.0) headRgb *= vL;
    float lum = dot(headRgb, vec3(0.299, 0.587, 0.114));
    col = mix(headRgb, vec3(lum), clamp(uBillMono, 0.0, 1.0));
  } else if (vRole < 4.5) {
    vec3 tailRgb = mix(effHull * 0.25, vPartTint * (1.05 + uLightK * 1.25) * max(vL, 0.08), clamp(vL, 0.0, 1.0));
    if (vL > 1.0) tailRgb *= vL;
    float lum = dot(tailRgb, vec3(0.299, 0.587, 0.114));
    col = mix(tailRgb, vec3(lum * 0.85), clamp(uBillMono, 0.0, 1.0));
  } else {
    vec3 accRgb = mix(vPartTint, vHullCol * 0.65 + vPartTint * 0.65, 0.35) * (0.22 + (0.66 + uLightK * 0.95) * vL);
    float lum = dot(accRgb, vec3(0.299, 0.587, 0.114));
    col = mix(accRgb, vec3(lum), clamp(uBillMono, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

/* --------------------------------------------------------------- beacons */

export const BEACON_VERT = /* glsl */ `
attribute float aPhase;
attribute float aSize;
uniform float uTime;
varying float vTwinkle;
${GLSL_CURVE}
void main() {
  vTwinkle = 0.55 + 0.45 * sin(uTime * 2.61799388 + aPhase * 6.28318);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xyz = bendWorld(wp.xyz);
  vec4 mv = viewMatrix * wp;
  gl_PointSize = clamp(aSize * (520.0 / max(-mv.z, 1.0)), 1.5, 26.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const BEACON_FRAG = /* glsl */ `
uniform vec3 uBeaconCol;
uniform float uLightK;
uniform float uVehLight;
uniform float uSteady;
varying float vTwinkle;
void main() {
  if (uVehLight <= 0.005) discard;
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float core = pow(1.0 - r, 2.2);
  float tw = mix(vTwinkle, 1.0, uSteady);
  gl_FragColor = vec4(uBeaconCol * (0.9 + core * 1.4), clamp(core * tw * uLightK * uVehLight, 0.0, 1.0));
}
`;

/* -------------------------------------------------------- vehicle trails */

export const TRAIL_VERT = /* glsl */ `
attribute vec3 aColor;
varying vec3 vColor;
varying vec2 vUv;
${GLSL_CURVE}
void main() {
  vColor = aColor;
  vUv = uv;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  wp.xyz = bendWorld(wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const TRAIL_FRAG = /* glsl */ `
uniform float uLightK;
uniform float uVehLight;
varying vec3 vColor;
varying vec2 vUv;
void main() {
  if (uVehLight <= 0.005) discard;
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float along = pow(vUv.x, 1.6);
  float a = across * along * (0.45 + 0.55 * uLightK) * clamp(uVehLight, 0.0, 2.0);
  gl_FragColor = vec4(vColor * (0.8 + along * 0.9 * max(uVehLight, 0.5)), clamp(a, 0.0, 1.0));
}
`;

/* ------------------------------------------- 3D curved moving-object trail ribbons */

export const RIBBON_TRAIL_VERT = /* glsl */ `
attribute vec3 aRibbonDir;
attribute vec2 aRibbonUv;
attribute vec3 aColor;
attribute float aRibbonStyle;
varying vec3 vColor;
varying float vAlong;
varying float vAcross;
varying float vStyle;
${GLSL_CURVE}
void main() {
  vColor = aColor;
  vAlong = aRibbonUv.x;
  vAcross = aRibbonUv.y >= 0.0 ? 1.0 : -1.0;
  vStyle = aRibbonStyle;
  float halfW = abs(aRibbonUv.y);
  if (halfW <= 0.0005) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 toCam = cameraPosition - position;
  float tcLen = length(toCam);
  vec3 viewDir = tcLen > 1e-4 ? toCam / tcLen : vec3(0.0, 1.0, 0.0);
  vec3 dirN = length(aRibbonDir) > 1e-4 ? normalize(aRibbonDir) : vec3(1.0, 0.0, 0.0);
  vec3 side = cross(dirN, viewDir);
  float sLen = length(side);
  side = sLen > 1e-4 ? side / sLen : vec3(0.0, 1.0, 0.0);
  float taper = mix(1.0, 0.32, clamp(vAlong, 0.0, 1.0));
  vec3 wp = position + side * (vAcross * halfW * taper);
  wp = bendWorld(wp);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const RIBBON_TRAIL_FRAG = /* glsl */ `
uniform float uLightK;
uniform float uVehLight;
uniform float uBillMono;
varying vec3 vColor;
varying float vAlong;
varying float vAcross;
varying float vStyle;
void main() {
  if (uVehLight <= 0.005 || vAlong >= 0.995) discard;
  float u = clamp(vAlong, 0.0, 1.0);
  float headJoin = smoothstep(0.0, 0.045, u);
  float tailFade = pow(1.0 - u, 1.65);
  float ay = abs(vAcross);

  float profile = 0.0;
  if (vStyle < 0.5) {
    // Twin taillight / wingtip neon filaments + warm inner aura
    float twin = exp(-pow((ay - 0.58) / 0.22, 2.0));
    float core = exp(-pow(ay / 0.62, 2.0)) * 0.38;
    profile = twin + core;
  } else if (vStyle < 1.5) {
    // Express Maglev rail / Orbital rocket plasma ribbon
    float rail = exp(-pow((ay - 0.66) / 0.20, 2.0)) * 0.72;
    float plasma = exp(-pow(ay / 0.48, 2.0));
    profile = max(plasma, rail);
  } else {
    // Harbor ship luminous stern wake & navigation ribbon
    float vWake = exp(-pow((ay - (0.28 + 0.52 * u)) / 0.22, 2.0)) * 0.85;
    float stern = exp(-pow(ay / 0.42, 2.0)) * (1.0 - 0.55 * u);
    profile = vWake + stern * 0.65;
  }

  float a = profile * headJoin * tailFade * (0.42 + 0.58 * max(uLightK, 0.35)) * clamp(uVehLight, 0.0, 2.2) * 0.82;
  if (a < 0.006) discard;
  vec3 col = vColor * (0.85 + 0.95 * (1.0 - u) * max(uVehLight, 0.55));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), clamp(uBillMono, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
}
`;

/* ------------------------------------------- GPU multi-strata swarm */
// Evaluates smooth 3D quadratic Bezier + coordinated banking + portal taper
// directly on the GPU so 18,000+ vehicles across 6 vertical strata cost 0ms CPU!

export const SWARM_VERT = /* glsl */ `
attribute vec4 aCurveA; // x1, z1, y1 (flat deck 1), rate
attribute vec4 aCurveB; // ix (corner/ctrl x), iz (corner/ctrl z), y2 (flat deck 2), phase
attribute vec4 aCurveC; // x2, z2, scale, mode (>0.5 = sweeping corner fillet radius, <-0.5 = straight street + optional deck switch, 0 = closed ring arc)
attribute vec3 aColor;
uniform float uTime;
uniform float uTrafficSpeed;
uniform float uHeightScale;
varying vec3 vColor;
varying vec3 vLocalP;
varying float vFade;
varying float vModel;
${GLSL_CURVE}

vec3 evalSwarmPos(float tt) {
  float mode = aCurveC.w;
  float px;
  float pz;
  float py;
  float hover = sin(uTime * 1.46607657 + aCurveB.w * 25.0) * 0.14;

  if (mode > 0.5) {
    vec2 pStart = aCurveA.xy;
    vec2 pCorner = aCurveB.xy;
    vec2 pEnd = aCurveC.xy;
    vec2 v1 = pCorner - pStart;
    vec2 v2 = pEnd - pCorner;
    float L1 = max(length(v1), 1.0);
    float L2 = max(length(v2), 1.0);
    float turnR = min(max(mode, 44.0), min(L1, L2) * 0.46);
    vec2 cEnter = pCorner - (v1 / L1) * turnR;
    vec2 cExit = pCorner + (v2 / L2) * turnR;

    float s1 = max(1.0, L1 - turnR);
    float sTurn = max(1.0, 2.35 * turnR);
    float s2 = max(1.0, L2 - turnR);
    float arcS = clamp(tt, 0.0, 1.0) * (s1 + sTurn + s2);

    vec2 xz;
    if (arcS < s1) {
      xz = mix(pStart, cEnter, arcS / s1);
      py = aCurveA.z;
    } else if (arcS < s1 + sTurn) {
      float uTurn = (arcS - s1) / sTurn;
      float omT = 1.0 - uTurn;
      xz = omT * omT * cEnter + 2.0 * omT * uTurn * pCorner + uTurn * uTurn * cExit;
      float hRamp = uTurn * uTurn * (3.0 - 2.0 * uTurn);
      py = mix(aCurveA.z, aCurveB.z, hRamp);
    } else {
      xz = mix(cExit, pEnd, (arcS - s1 - sTurn) / s2);
      py = aCurveB.z;
    }
    px = xz.x;
    pz = xz.y;
  } else if (mode < -0.5) {
    vec2 xz = mix(aCurveA.xy, aCurveC.xy, tt);
    px = xz.x;
    pz = xz.y;
    float rampU = smoothstep(0.28, 0.72, tt);
    py = mix(aCurveA.z, aCurveB.z, rampU);
  } else {
    float om = 1.0 - tt;
    px = om * om * aCurveA.x + 2.0 * om * tt * aCurveB.x + tt * tt * aCurveC.x;
    pz = om * om * aCurveA.y + 2.0 * om * tt * aCurveB.y + tt * tt * aCurveC.y;
    py = mix(aCurveA.z, aCurveB.z, tt * tt * (3.0 - 2.0 * tt));
  }

  return vec3(px, (py + hover) * uHeightScale, pz);
}

void main() {
  vColor = aColor;
  vLocalP = position;
  float mdl = fract(aCurveB.w * 13.73);
  vModel = mdl;

  // Non-uniform platoon & driver-tempo traffic kinematics:
  // monotone phase warp f(raw) = raw + amp * sin(2*pi*(n*raw - waveT)) (with 2*pi*n*amp < 0.72 < 1.0 so velocity stays positive, compressing platoons at red waves & accelerating on green waves!)
  float sp = max(uTrafficSpeed, 0.0);
  float driverMul = 0.76 + 0.52 * fract(aCurveB.w * 29.17);
  float rawT = aCurveB.w + uTime * aCurveA.w * sp * driverMul;
  float platoonAmp = (aCurveA.z < 55.0) ? 0.036 : 0.018;
  float warpedT = rawT + platoonAmp * sin(6.2831853 * (3.0 * rawT - uTime * 0.08 * max(sp, 0.25)) + aCurveA.x * 0.008);
  float tt = fract(warpedT);
  bool isRing = abs(aCurveC.w) <= 0.5;
  float portal = isRing ? 1.0 : smoothstep(0.0, 0.045, tt) * smoothstep(1.0, 0.955, tt);
  vFade = portal;

  float eps = 0.008;
  float tPrev = isRing ? fract(tt - eps) : max(0.0, tt - eps);
  float tNext = isRing ? fract(tt + eps) : min(1.0, tt + eps);
  vec3 p0 = evalSwarmPos(tPrev);
  vec3 pC = evalSwarmPos(tt);
  vec3 p1 = evalSwarmPos(tNext);

  vec3 vel = p1 - p0;
  float vLen = length(vel);
  vec3 fwd = vLen > 1e-4 ? vel / vLen : vec3(1.0, 0.0, 0.0);
  vec3 upRef = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(upRef, fwd) + vec3(1e-5, 0.0, 0.0));
  vec3 up = normalize(cross(fwd, right));

  // Smooth aerodynamic banking into sweeping curves
  vec3 turnVec = (p1 - pC) - (pC - p0);
  float bankAng = clamp(dot(turnVec, right) * 0.18, -0.36, 0.36);
  float cb = cos(bankAng);
  float sb = sin(bankAng);
  vec3 bRight = right * cb + up * sb;
  vec3 bUp = -right * sb + up * cb;

  // Sculpt vertex hull into 3 distinct sci-fi car silhouettes (DeLorean wedge, Fifth Element cab, Spinner):
  vec3 lp = position;
  if (mdl < 0.38) {
    // DeLorean DMC-12 wedge: raked low front nose (+X), peaked greenhouse cabin, wide rear deck (-X)
    float noseTaper = mix(1.12, 0.52, smoothstep(-0.08, 0.5, lp.x));
    float cabin = 1.0 + 0.35 * exp(-pow((lp.x + 0.05) * 3.2, 2.0)) * step(0.0, lp.y);
    lp.y *= noseTaper * cabin;
    lp.z *= mix(1.08, 0.86, smoothstep(-0.3, 0.5, lp.x));
  } else if (mdl < 0.72) {
    // Fifth Element Cab: fuller cab-forward profile + wider lower side hover-pontoons
    lp.y *= 1.24 * mix(1.0, 0.78, smoothstep(0.22, 0.5, abs(lp.x)));
    lp.z *= mix(1.22, 0.78, smoothstep(-0.45, 0.45, lp.y));
  } else {
    // Blade Runner Spinner / Dart: sleek twin-mandible nose taper + raised rear deck
    lp.y *= mix(1.18, 0.58, smoothstep(-0.2, 0.5, lp.x));
    lp.z *= mix(1.15, 0.74, smoothstep(0.0, 0.5, lp.x));
  }

  float sc = aCurveC.z * portal;
  vec3 hull = vec3(lp.x * 11.8, lp.y * 1.55, lp.z * 3.6) * sc;
  vec3 wp = pC + fwd * hull.x + bUp * hull.y + bRight * hull.z;
  wp = bendWorld(wp);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const SWARM_FRAG = /* glsl */ `
uniform float uLightK;
uniform float uVehLight;
uniform float uBillMono;
uniform float uTint;
varying vec3 vColor;
varying vec3 vLocalP;
varying float vFade;
varying float vModel;
void main() {
  if (vFade < 0.02) discard;
  float nose = smoothstep(0.26, 0.48, vLocalP.x);
  float tail = smoothstep(-0.24, -0.48, vLocalP.x);
  float twinLamp = smoothstep(0.14, 0.36, abs(vLocalP.z));
  float lightBandY = 1.0 - smoothstep(0.12, 0.42, abs(vLocalP.y + 0.06));
  float cabSign = (vModel >= 0.38 && vModel < 0.72)
    ? (step(abs(vLocalP.x - 0.06), 0.14) * smoothstep(0.32, 0.48, vLocalP.y) * step(abs(vLocalP.z), 0.24))
    : 0.0;

  float coatId = fract(vModel * 7.91 + dot(vColor, vec3(5.3, 11.7, 3.1)));
  vec3 natCar = vec3(0.68, 0.73, 0.79);
  if (coatId > 0.20) natCar = vec3(0.92, 0.68, 0.12);
  if (coatId > 0.40) natCar = vec3(0.18, 0.27, 0.42);
  if (coatId > 0.60) natCar = vec3(0.84, 0.87, 0.90);
  if (coatId > 0.78) natCar = vec3(0.72, 0.17, 0.21);
  vec3 carTint = mix(natCar, vColor, clamp(uTint, 0.0, 1.0));

  float canopy = step(-0.18, vLocalP.x) * step(vLocalP.x, 0.24) * smoothstep(0.08, 0.32, vLocalP.y);
  vec3 hullCol = mix(vec3(0.09, 0.11, 0.15) + carTint * 0.42, vec3(0.05, 0.08, 0.13), canopy * 0.75);

  float vL = max(uVehLight, 0.0);
  vec3 headRaw = mix(vec3(1.0, 0.96, 0.82), vec3(0.84, 0.96, 1.0), step(0.65, vModel)) * (1.05 + uLightK * 1.15) * vL;
  vec3 tailRaw = vec3(1.0, 0.10, 0.15) * (1.08 + uLightK * 1.25) * vL;
  vec3 taxiRaw = vec3(1.0, 0.76, 0.16) * (0.95 + uLightK * 0.95) * vL;

  vec3 col = hullCol;
  float lampGate = clamp(vL, 0.0, 1.0);
  col = mix(col, headRaw, nose * (0.35 + 0.65 * twinLamp) * (0.55 + 0.45 * lightBandY) * lampGate);
  col = mix(col, tailRaw, tail * (0.55 + 0.45 * twinLamp) * (0.65 + 0.35 * lightBandY) * lampGate);
  col = mix(col, taxiRaw, cabSign * 0.88 * lampGate);

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), clamp(uBillMono, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SWARM_TRAIL_VERT = /* glsl */ `
attribute vec4 aCurveA;
attribute vec4 aCurveB;
attribute vec4 aCurveC;
attribute vec3 aColor;
uniform float uTime;
uniform float uTrafficSpeed;
uniform float uHeightScale;
uniform float uTrailMode;
uniform float uTrailLen;
varying vec3 vColor;
varying float vAlong;
varying float vAcross;
varying float vFade;
${GLSL_CURVE}

vec3 evalSwarmTrailPos(float tt) {
  float mode = aCurveC.w;
  float px;
  float pz;
  float py;
  float hover = sin(uTime * 1.46607657 + aCurveB.w * 25.0) * 0.14;

  if (mode > 0.5) {
    vec2 pStart = aCurveA.xy;
    vec2 pCorner = aCurveB.xy;
    vec2 pEnd = aCurveC.xy;
    vec2 v1 = pCorner - pStart;
    vec2 v2 = pEnd - pCorner;
    float L1 = max(length(v1), 1.0);
    float L2 = max(length(v2), 1.0);
    float turnR = min(max(mode, 44.0), min(L1, L2) * 0.46);
    vec2 cEnter = pCorner - (v1 / L1) * turnR;
    vec2 cExit = pCorner + (v2 / L2) * turnR;

    float s1 = max(1.0, L1 - turnR);
    float sTurn = max(1.0, 2.35 * turnR);
    float s2 = max(1.0, L2 - turnR);
    float arcS = clamp(tt, 0.0, 1.0) * (s1 + sTurn + s2);

    vec2 xz;
    if (arcS < s1) {
      xz = mix(pStart, cEnter, arcS / s1);
      py = aCurveA.z;
    } else if (arcS < s1 + sTurn) {
      float uTurn = (arcS - s1) / sTurn;
      float omT = 1.0 - uTurn;
      xz = omT * omT * cEnter + 2.0 * omT * uTurn * pCorner + uTurn * uTurn * cExit;
      float hRamp = uTurn * uTurn * (3.0 - 2.0 * uTurn);
      py = mix(aCurveA.z, aCurveB.z, hRamp);
    } else {
      xz = mix(cExit, pEnd, (arcS - s1 - sTurn) / s2);
      py = aCurveB.z;
    }
    px = xz.x;
    pz = xz.y;
  } else if (mode < -0.5) {
    vec2 xz = mix(aCurveA.xy, aCurveC.xy, tt);
    px = xz.x;
    pz = xz.y;
    float rampU = smoothstep(0.28, 0.72, tt);
    py = mix(aCurveA.z, aCurveB.z, rampU);
  } else {
    float om = 1.0 - tt;
    px = om * om * aCurveA.x + 2.0 * om * tt * aCurveB.x + tt * tt * aCurveC.x;
    pz = om * om * aCurveA.y + 2.0 * om * tt * aCurveB.y + tt * tt * aCurveC.y;
    py = mix(aCurveA.z, aCurveB.z, tt * tt * (3.0 - 2.0 * tt));
  }
  return vec3(px, (py + hover) * uHeightScale, pz);
}

void main() {
  vColor = aColor;
  float uSeg = clamp(position.x, 0.0, 1.0);
  float sideSign = position.y >= 0.0 ? 1.0 : -1.0;
  vAlong = uSeg;
  vAcross = sideSign;

  // Modes: 0=Off, 1=Subtle Taillights, 2=Some (~30% fast), 3=Air/Rail/Ships/Rockets, 4=All Traffic, 5=All Moving Objects
  bool allowMode = (uTrailMode > 1.5 && uTrailMode < 2.5) || (uTrailMode > 3.5);
  bool subsetKeep = (uTrailMode > 3.5) || (fract(aCurveB.w * 37.19) < 0.30);
  float sp = max(uTrafficSpeed, 0.0);
  if (!allowMode || !subsetKeep || uTrailLen <= 0.02 || aCurveC.z <= 0.01 || sp <= 0.01) {
    vFade = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float driverMul = 0.76 + 0.52 * fract(aCurveB.w * 29.17);
  float rawT = aCurveB.w + uTime * aCurveA.w * sp * driverMul;
  float platoonAmp = (aCurveA.z < 55.0) ? 0.036 : 0.018;
  float warpedT = rawT + platoonAmp * sin(6.2831853 * (3.0 * rawT - uTime * 0.08 * max(sp, 0.25)) + aCurveA.x * 0.008);
  float ttHead = fract(warpedT);
  bool isRing = abs(aCurveC.w) <= 0.5;

  // Arc-length-consistent parameter lag (0.85s at trailLen=1.0 -> ~50..130m of curved light trail!)
  float maxLag = min(0.28, aCurveA.w * max(sp, 0.25) * driverMul * 0.88 * uTrailLen + 0.006);
  float availLag = isRing ? maxLag : min(maxLag, max(0.0, ttHead - 0.004));
  float ttSample = isRing ? fract(ttHead - uSeg * availLag) : max(0.0, ttHead - uSeg * availLag);

  float portal = isRing ? 1.0 : smoothstep(0.0, 0.045, ttHead) * smoothstep(1.0, 0.955, ttHead) * smoothstep(0.008, 0.05, availLag / max(maxLag, 1e-4));
  vFade = portal;
  if (portal <= 0.01) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float eps = 0.005;
  float tAhead = isRing ? fract(ttSample + eps) : min(1.0, ttSample + eps);
  vec3 pS = evalSwarmTrailPos(ttSample);
  vec3 pA = evalSwarmTrailPos(tAhead);
  vec3 vel = pA - pS;
  vec3 fwd = length(vel) > 1e-4 ? normalize(vel) : vec3(1.0, 0.0, 0.0);

  // Start right behind the rear taillight deck (-5.5m * scale)
  vec3 sternPos = pS - fwd * (5.2 * aCurveC.z * (1.0 - uSeg * 0.35));
  vec3 toCam = cameraPosition - sternPos;
  vec3 viewDir = length(toCam) > 1e-4 ? normalize(toCam) : vec3(0.0, 1.0, 0.0);
  vec3 side = cross(fwd, viewDir);
  side = length(side) > 1e-4 ? normalize(side) : vec3(0.0, 1.0, 0.0);

  float halfW = (1.65 * aCurveC.z) * mix(1.0, 0.35, uSeg);
  vec3 wp = sternPos + side * (sideSign * halfW);
  wp = bendWorld(wp);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const SWARM_TRAIL_FRAG = /* glsl */ `
uniform float uLightK;
uniform float uVehLight;
uniform float uBillMono;
varying vec3 vColor;
varying float vAlong;
varying float vAcross;
varying float vFade;
void main() {
  if (vFade <= 0.015 || uVehLight <= 0.005) discard;
  float u = clamp(vAlong, 0.0, 1.0);
  float ay = abs(vAcross);
  float twin = exp(-pow((ay - 0.56) / 0.24, 2.0));
  float core = exp(-pow(ay / 0.58, 2.0)) * 0.34;
  float fade = pow(1.0 - u, 1.7) * smoothstep(0.0, 0.04, u);
  float a = (twin + core) * fade * vFade * (0.38 + 0.62 * max(uLightK, 0.3)) * clamp(uVehLight, 0.0, 2.0) * 0.68;
  if (a < 0.006) discard;
  vec3 tailTint = mix(vec3(1.0, 0.16, 0.22), vColor * 1.25 + vec3(0.18, 0.06, 0.10), 0.46);
  vec3 col = tailTint * (0.85 + 0.90 * (1.0 - u) * max(uVehLight, 0.5));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), clamp(uBillMono, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.90));
}
`;

/* ---------------------------------------------------------- searchlights & projector cones */

export const BEAM_VERT = /* glsl */ `
attribute vec4 aBeamMeta;
attribute vec3 aBeamTint;
varying float vT;
varying float vW;
varying vec4 vBeamMeta;
varying vec3 vBeamTint;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
${GLSL_CURVE}
void main() {
  vT = uv.y;
  vW = uv.x;
  vBeamMeta = aBeamMeta;
  vBeamTint = aBeamTint;
  vec4 localP = vec4(position, 1.0);
  vec3 localN = normal;
  #ifdef USE_INSTANCING
    localP = instanceMatrix * localP;
    localN = mat3(instanceMatrix) * localN;
  #endif
  vec4 flatWp = modelMatrix * localP;
  vec3 worldN = mat3(modelMatrix) * localN;
  float nLen = length(worldN);
  worldN = nLen > 1e-5 ? (worldN / nLen) : vec3(0.0, 1.0, 0.0);
  vWorldNormal = bendNormal(flatWp.xz, worldN);
  vec3 curvedWp = bendWorld(flatWp.xyz);
  vWorldPos = curvedWp;
  gl_Position = projectionMatrix * viewMatrix * vec4(curvedWp, 1.0);
}
`;

export const BEAM_FRAG = /* glsl */ `
uniform vec3 uBeamCol;
uniform float uBeamK;
uniform float uTime;
uniform float uLightK;
varying float vT;
varying float vW;
varying vec4 vBeamMeta;
varying vec3 vBeamTint;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
${GLSL_NOISE}

void main() {
  if (uBeamK <= 0.002) discard;
  float bKind = vBeamMeta.x;
  float bGain = vBeamMeta.y > 0.001 ? vBeamMeta.y : 1.0;
  float bFalloff = vBeamMeta.z > 0.01 ? vBeamMeta.z : 1.35;
  float bPhase = vBeamMeta.w;
  vec3 tintCol = dot(vBeamTint, vBeamTint) > 0.001 ? vBeamTint : uBeamCol;

  // Radial volumetric chord falloff across the smooth 3D cone/frustum hull:
  // |dot(N, V)| = 1.0 down the dense beam axis and fades smoothly to 0.0 at the outer silhouette rim,
  // completely eliminating flat crossed-plane '+'/'X' seams from every viewing angle!
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float nLen = length(vWorldNormal);
  vec3 surfN = nLen > 1e-5 ? (vWorldNormal / nLen) : viewDir;
  float baseCore = clamp(dot(surfN, viewDir), 0.0, 1.0);
  float azim = fract(vW) * 6.2831853;
  vec2 orbB = loopOrbit(uTime, 1.8, 3.0);
  float dust = 0.76 + 0.24 * vnoise(vec2(vT * 6.0 + orbB.x + bPhase * 5.0, orbB.y - bPhase * 3.0 + cos(azim) * 0.6));

  float a = 0.0;
  vec3 emitCol = tintCol;
  if (bKind < 0.5) {
    // 0: Classic Cinema Carbon-Arc Searchlight (bright hot axial filament + soft Mie halo)
    float hotCore = pow(baseCore, 2.8) * 0.86 + pow(baseCore, 1.15) * 0.42;
    float along = pow(max(1.0 - vT, 0.0), bFalloff) * smoothstep(0.0, 0.03, vT);
    a = hotCore * along * dust;
    emitCol = tintCol * (0.65 + 0.90 * along);
  } else if (bKind < 1.5) {
    // 1: Coherent Sky-Piercer Laser (razor-thin collimated beam reaching high clouds + dust sparkle)
    float laserCore = pow(baseCore, 6.2) * 1.45 + pow(baseCore, 2.1) * 0.28;
    float along = pow(max(1.0 - vT, 0.0), max(0.55, bFalloff * 0.55));
    float scint = 0.78 + 0.34 * sin(vT * 38.0 - uTime * 9.0 + bPhase * 25.0);
    a = laserCore * along * dust * scint;
    emitCol = mix(tintCol, vec3(1.0), 0.28) * (0.85 + 0.85 * along);
  } else if (bKind < 2.5) {
    // 2: Wide Architectural Flood Wash (broad Gaussian atmospheric wash, faster distance decay)
    float floodCore = pow(baseCore, 1.35) * 0.84;
    float along = pow(max(1.0 - vT, 0.0), bFalloff * 1.45) * smoothstep(0.0, 0.08, vT);
    a = floodCore * along * dust;
    emitCol = tintCol * (0.55 + 0.70 * along);
  } else if (bKind < 3.5) {
    // 3: Pulsed Aerial Fan Curtain (elliptical fan hull with periodic seamless azimuthal interference)
    float fanRibs = 0.74 + 0.26 * sin(azim * 5.0 + uTime * 2.5 + bPhase * 12.0);
    float along = pow(max(1.0 - vT, 0.0), bFalloff * 0.95);
    float pulse = 0.76 + 0.24 * sin(uTime * 3.4 + bPhase * 19.0);
    a = pow(baseCore, 1.45) * 0.92 * fanRibs * along * pulse * dust;
    emitCol = tintCol * (0.62 + 0.82 * along);
  } else {
    // 4: Volumetric Holo-Projector Frustum (smooth lens-to-screen cone with zero internal X-cross!)
    float rimSoft = pow(baseCore, 1.35);
    float lensGlow = exp(-vT * 9.5) * pow(baseCore, 1.8) * 0.96;
    float screenFocus = smoothstep(0.58, 0.995, vT) * (1.0 - smoothstep(0.995, 1.005, vT)) * rimSoft * 0.78;
    float coneBody = (0.26 + 0.58 * vT) * rimSoft;
    float scan = 0.78 + 0.22 * sin(vT * 64.0 - uTime * 14.0 + bPhase * 17.0);
    float rays = 0.78 + 0.22 * sin(azim * 6.0 + bPhase * 23.0);
    a = (coneBody * scan * rays + lensGlow + screenFocus) * dust;
    vec3 chroma = tintCol + vec3(0.12, 0.02, -0.09) * sin(azim * 3.0 + uTime * 4.0);
    emitCol = mix(chroma, vec3(1.0), lensGlow * 0.45 + screenFocus * 0.22);
  }

  float nightBoost = (bKind > 3.5) ? max(uLightK, 0.42) : max(uLightK, 0.12);
  a *= bGain * uBeamK * nightBoost;
  gl_FragColor = vec4(emitCol, clamp(a, 0.0, 0.92));
}
`;

/* --------------------------------------------------------- light pools */

export const POOL_VERT = /* glsl */ `
varying vec2 vUv;
${GLSL_CURVE}
void main() {
  vUv = uv;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  wp.xyz = bendWorld(wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const POOL_FRAG = /* glsl */ `
uniform vec3 uPoolCol;
uniform float uPoolK;
uniform float uLightK;
uniform float uVehLight;
varying vec2 vUv;
void main() {
  if (uVehLight <= 0.005) discard;
  float r = length(vUv - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.15, 1.0, r);
  a *= a * uPoolK * max(uLightK, 0.15) * clamp(uVehLight, 0.0, 2.2);
  gl_FragColor = vec4(uPoolCol * (0.5 + 0.5 * a), clamp(a, 0.0, 0.95));
}
`;

/* ---------------------------------------------------------------- water */

export const WATER_VERT = /* glsl */ `
attribute float aAnalytical;
varying vec3 vFlat;
varying vec3 vWorld;
varying float vAnalytical;
${GLSL_CURVE}
void main() {
  vAnalytical = aAnalytical;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vFlat = wp.xyz;
  wp.xyz = bendWorld(wp.xyz);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const WATER_FRAG = /* glsl */ `
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform float uWaterShader;
uniform float uWaterScale;
uniform float uWaterChop;
uniform float uWaterFoam;
uniform float uWaterRefl;
uniform float uWaterContrast;
uniform float uWaterWarp;
uniform float uWindAngle;
uniform float uWindStrength;
uniform vec3 uSunDir;
uniform vec3 uSkySunCol;
uniform vec3 uFogCol;
uniform vec3 uSunFogCol;
uniform float uGroundRadius;
uniform float uHazeSun;
uniform float uTime;
uniform float uSat;
uniform vec3 uPoolCol;
uniform float uLightK;
uniform vec4 uShipWakes[8];
varying vec3 vFlat;
varying vec3 vWorld;
varying float vAnalytical;
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_CURVE}
${GLSL_TERRAIN}

// Derivative-clamped Nyquist weight so high-frequency 0.15m..1.5m capillary ripples stay
// razor-crisp at EVERY camera altitude while band-limiting cleanly before sub-pixel aliasing!
float nyquistWeight(float k, float pxSize) {
  return 1.0 - smoothstep(0.95, 2.65, k * pxSize);
}

// Fast animated 2D cellular micro-facet ridge for diamond chop & caustic filigree
vec3 evalCellularFacet(vec2 uv, float phase) {
  vec2 ip = floor(uv);
  vec2 fp = fract(uv);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 bestV = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      float h = hash12(ip + g);
      vec2 o = 0.5 + 0.42 * sin(phase + 6.2831853 * vec2(h, fract(h * 17.3)));
      vec2 r = g + o - fp;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        bestV = r;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  float ridge = clamp(1.0 - (sqrt(d2) - sqrt(d1)) * 1.65, 0.0, 1.0);
  return vec3(bestV * 1.4, ridge);
}

void main() {
  if (uWaterAmt <= 0.005) discard;
  vec2 xz = vFlat.xz;
  float cDist = evalCoastSignedDist(xz);
  // Strictly clip analytical ocean/lake geometry on dry land (cDist > 0) so water NEVER floods streets!
  if (vAnalytical > 0.5 && cDist > 0.0) discard;

  float edgeWarp = (vnoise(xz * 0.00045 + 4.2) - 0.5) * uGroundRadius * 0.14;
  float edgeR = length(xz) + edgeWarp;
  float fadeInner = mix(uGroundRadius * 0.48, uPlanetR * 2.55, uWorldCurve);
  float fadeOuter = mix(uGroundRadius * 0.96, uPlanetR * 3.08, uWorldCurve);
  float edgeAlpha = 1.0 - smoothstep(fadeInner, fadeOuter, edgeR);
  if (edgeAlpha < 0.004) discard;

  vec3 viewVec = vWorld - cameraPosition;
  float dist = length(viewVec);
  vec3 vdir = viewVec / max(dist, 1e-4);

  // Screen-space footprint in world metres for crisp Nyquist-clamped high-frequency detail
  float pxSize = clamp(max(length(dFdx(xz)), length(dFdy(xz))), 0.025, 36.0);

  float ca = cos(uCoastAngle);
  float sa = sin(uCoastAngle);
  vec2 shoreDir = vec2(-ca, -sa);
  vec2 longDir = vec2(-sa, ca);
  vec2 windDir = vec2(cos(uWindAngle), sin(uWindAngle));
  vec2 windPerp = vec2(-windDir.y, windDir.x);

  float sc = max(0.18, uWaterScale);
  float chopK = clamp(uWaterChop, 0.0, 2.8) * mix(0.82, 1.25, clamp(uWindStrength * 0.5, 0.0, 1.0));
  float foamK = clamp(uWaterFoam, 0.0, 2.8);
  float reflK = clamp(uWaterRefl, 0.0, 2.8);
  float contrastK = clamp(uWaterContrast, 0.0, 1.0);
  float warpK = clamp(uWaterWarp, 0.0, 2.2);

  // Seamless integer-harmonic wave phases over PC_LOOP = 120s
  float ph1 = loopPhase(uTime, 36.0) * 6.2831853;
  float ph2 = loopPhase(uTime, 58.0) * 6.2831853;
  float ph3 = loopPhase(uTime, 89.0) * 6.2831853;
  float ph4 = loopPhase(uTime, 136.0) * 6.2831853;
  float ph5 = loopPhase(uTime, 198.0) * 6.2831853;
  float ph6 = loopPhase(uTime, 280.0) * 6.2831853;

  // Base 8-band multiscale high-frequency directional dispersion cascade (wavelengths ~11m down to 0.16m!)
  vec2 wdA = normalize(mix(shoreDir, windDir, 0.55) + windPerp * 0.24);
  vec2 wdB = normalize(mix(shoreDir, windDir, 0.55) - windPerp * 0.31);
  vec2 wdC = normalize(windDir * 0.72 + longDir * 0.69);
  vec2 wdD = normalize(windDir * 0.58 - longDir * 0.81);
  vec2 wdE = normalize(-shoreDir * 0.35 + windPerp * 0.94);

  float kWarp = 0.22 / sc;
  float bendW = (sin(dot(xz, windPerp) * kWarp + ph1 * 0.25) * 0.60
    + cos(dot(xz, wdC) * (kWarp * 1.65) - ph2 * 0.25) * 0.40) * warpK * 0.85;

  float k1 = 0.58 / sc;   // ~10.8m primary swell
  float k2 = 1.28 / sc;   // ~4.9m short gravity wave
  float k3 = 2.75 / sc;   // ~2.3m harbor chop
  float k4 = 5.90 / sc;   // ~1.06m crisp wind wavelets
  float k5 = 12.60 / sc;  // ~0.50m fine capillary facets
  float k6 = 25.50 / sc;  // ~0.25m micro-glint ripples
  float k7 = 46.00 / sc;  // ~0.14m ultra-fine silk capillary

  float nyq1 = nyquistWeight(k1, pxSize);
  float nyq2 = nyquistWeight(k2, pxSize);
  float nyq3 = nyquistWeight(k3, pxSize);
  float nyq4 = nyquistWeight(k4, pxSize);
  float nyq5 = nyquistWeight(k5, pxSize);
  float nyq6 = nyquistWeight(k6, pxSize);
  float nyq7 = nyquistWeight(k7, pxSize);

  float th1 = dot(xz, wdA) * k1 + bendW - ph1;
  float th2 = dot(xz, wdB) * k2 - bendW * 0.7 - ph2;
  float th3 = dot(xz, wdC) * k3 + bendW * 0.45 + ph3;
  float th4 = dot(xz, wdD) * k4 - ph4;
  float th5 = dot(xz, wdA * 0.8 + wdE * 0.6) * k5 + ph5;
  float th6 = dot(xz, wdB * 0.7 - wdE * 0.7) * k6 - ph6;
  float th7 = dot(xz, windDir * 0.9 + windPerp * 0.43) * k7 + ph6 * 1.5;

  float s1 = sin(th1); float c1 = cos(th1);
  float s2 = sin(th2); float c2 = cos(th2);
  float s3 = sin(th3); float c3 = cos(th3);
  float s4 = sin(th4); float c4 = cos(th4);
  float s5 = sin(th5); float c5 = cos(th5);
  float s6 = sin(th6); float c6 = cos(th6);
  float s7 = sin(th7); float c7 = cos(th7);

  // 5 Distinct High-Frequency Water Shader Solutions selectable via uWaterShader (0..4):
  //   0: Capillary Micro-Facet Sea (crisp 7-octave directional dispersion + GGX glints)
  //   1: Diamond Wind-Chop & Glitter (crossed Phillips wind chop + Voronoi micro-facets + Langmuir streaks)
  //   2: Crystalline Caustic Filigree (dual-layer cellular interference + luminous harbor/river caustics)
  //   3: Storm Swell & Whitecap Spray (steep trochoidal rollers + 7-octave wind-whipped spray & crest lace)
  //   4: Obsidian Silk & Hairline Ripples (ultra-fine capillary hairlines + mirror skyline filaments)
  float waveH = 0.0;
  vec2 gradH = vec2(0.0);
  float extraFoam = 0.0;
  float extraCaustic = 0.0;
  float specTightPow = 180.0;
  float specTightGain = 2.6;
  float glitterMask = 0.5 + 0.5 * s5;
  float reflBoost = 1.0;

  if (uWaterShader < 0.5) {
    // Mode 0: Capillary Micro-Facet Sea (Default)
    float w1 = pow(0.5 + 0.5 * s1, 2.0) * nyq1;
    float w2 = pow(0.5 + 0.5 * s2, 2.2) * nyq2;
    float w3 = pow(0.5 + 0.5 * s3, 2.3) * nyq3;
    float w4 = (0.5 + 0.5 * s4) * nyq4;
    float w5 = (0.5 + 0.5 * s5) * nyq5;
    waveH = w1 * 0.26 + w2 * 0.25 + w3 * 0.22 + w4 * 0.16 + w5 * 0.11;
    gradH = (
      wdA * (c1 * 0.095 * nyq1) +
      wdB * (c2 * 0.125 * nyq2) +
      wdC * (c3 * 0.145 * nyq3) +
      wdD * (c4 * 0.155 * nyq4) +
      normalize(wdA * 0.8 + wdE * 0.6) * (c5 * 0.145 * nyq5) +
      normalize(wdB * 0.7 - wdE * 0.7) * (c6 * 0.115 * nyq6) +
      normalize(windDir * 0.9 + windPerp * 0.43) * (c7 * 0.085 * nyq7)
    ) * chopK;
    glitterMask = clamp(0.35 + 0.65 * (0.5 + 0.5 * s5) * (0.5 + 0.5 * s6), 0.2, 1.2);
    extraFoam = smoothstep(0.76, 0.98, (w2 + w3) * 0.72 + w4 * 0.35) * 0.22;
  } else if (uWaterShader < 1.5) {
    // Mode 1: Diamond Wind-Chop & Glittering Ripples
    float cellK = 2.35 / sc;
    float cellNyq = nyquistWeight(cellK * 3.1, pxSize);
    vec3 cf1 = evalCellularFacet(xz * cellK + windDir * (ph2 * 0.35), ph3 * 0.5);
    vec3 cf2 = evalCellularFacet(xz * (cellK * 2.35) - windDir * (ph3 * 0.45), ph4 * 0.5);
    waveH = cf1.z * 0.45 * cellNyq + cf2.z * 0.30 * nyq4 + (0.5 + 0.5 * s3) * 0.25 * nyq3;
    gradH = (
      cf1.xy * (0.24 * cellNyq) +
      cf2.xy * (0.20 * nyq4) +
      wdA * (c2 * 0.11 * nyq2) +
      wdC * (c4 * 0.15 * nyq4) +
      windDir * (c5 * 0.16 * nyq5) +
      windPerp * (c6 * 0.13 * nyq6)
    ) * chopK;
    float langmuir = pow(0.5 + 0.5 * sin(dot(xz, windPerp) * (0.34 / sc) + s2 * 0.8), 8.0);
    extraFoam = (smoothstep(0.72, 0.96, cf1.z * cf2.z * 1.45) * 0.30 + langmuir * 0.16 * nyq2);
    specTightPow = 280.0;
    specTightGain = 3.6;
    glitterMask = 0.25 + 1.15 * cf1.z * (0.5 + 0.5 * s6);
  } else if (uWaterShader < 2.5) {
    // Mode 2: Crystalline Caustic Filigree & Crisp Harbor Chop
    float cScale = 1.85 / sc;
    float cNyq = nyquistWeight(cScale * 3.0, pxSize);
    vec3 vA = evalCellularFacet(xz * cScale + vec2(ph1, -ph2) * 0.18, ph2 * 0.6);
    vec3 vB = evalCellularFacet(xz * (cScale * 1.9) - vec2(ph2, ph3) * 0.16, ph3 * 0.6);
    float filigree = pow(clamp(vA.z * 0.62 + vB.z * 0.52, 0.0, 1.0), 3.2) * cNyq;
    waveH = (0.5 + 0.5 * s2) * 0.32 * nyq2 + (0.5 + 0.5 * s4) * 0.34 * nyq4 + vA.z * 0.34 * cNyq;
    gradH = (
      vA.xy * (0.16 * cNyq) +
      vB.xy * (0.14 * nyq4) +
      wdB * (c3 * 0.13 * nyq3) +
      wdD * (c5 * 0.14 * nyq5) +
      wdE * (c6 * 0.11 * nyq6)
    ) * chopK;
    extraCaustic = filigree * 0.52;
    extraFoam = pow(filigree, 2.2) * 0.24;
    reflBoost = 1.12;
  } else if (uWaterShader < 3.5) {
    // Mode 3: Storm Swell & Whitecap Spray
    float sharp1 = pow(0.5 + 0.5 * sin(th1 + 0.42 * c1), 2.8) * nyq1;
    float sharp2 = pow(0.5 + 0.5 * sin(th2 + 0.38 * c2), 2.6) * nyq2;
    float sharp3 = pow(0.5 + 0.5 * s3, 2.4) * nyq3;
    waveH = sharp1 * 0.42 + sharp2 * 0.32 + sharp3 * 0.16 + (0.5 + 0.5 * s5) * 0.10 * nyq5;
    gradH = (
      wdA * (c1 * (0.65 + 0.65 * s1) * 0.19 * nyq1) +
      wdB * (c2 * (0.60 + 0.60 * s2) * 0.18 * nyq2) +
      wdC * (c3 * 0.17 * nyq3) +
      wdD * (c4 * 0.16 * nyq4) +
      windDir * (c5 * 0.15 * nyq5 + c6 * 0.12 * nyq6)
    ) * chopK * 1.22;
    float sprayNoise = 0.55 + 0.45 * sin(dot(xz, windDir) * (8.5 / sc) - ph5 + s4 * 2.0);
    extraFoam = smoothstep(0.52, 0.90, sharp1 * 0.68 + sharp2 * 0.58) * sprayNoise * 0.62;
    specTightPow = 120.0;
    specTightGain = 2.0;
  } else {
    // Mode 4: Obsidian Silk & Hairline Micro-Ripples (Architectural Mirror Water)
    waveH = (0.5 + 0.5 * s4) * 0.35 * nyq4 + (0.5 + 0.5 * s5) * 0.35 * nyq5 + (0.5 + 0.5 * s6) * 0.30 * nyq6;
    gradH = (
      wdC * (c3 * 0.055 * nyq3) +
      wdD * (c4 * 0.095 * nyq4) +
      windDir * (c5 * 0.145 * nyq5) +
      windPerp * (c6 * 0.155 * nyq6) +
      normalize(windDir + windPerp) * (c7 * 0.135 * nyq7)
    ) * chopK * 0.82;
    specTightPow = 340.0;
    specTightGain = 3.4;
    reflBoost = 1.38;
    glitterMask = 0.40 + 0.60 * (0.5 + 0.5 * s6) * (0.5 + 0.5 * s7);
  }

  // Cohesive deep ocean body absorption: uWaterShallow stays subtle on open sea so high-contrast themes never blotch!
  vec3 crestBody = mix(uWaterDeep * 1.30 + vec3(0.014, 0.026, 0.036), uWaterShallow, 0.52);
  vec3 col = mix(uWaterDeep, crestBody, smoothstep(0.24, 0.86, waveH) * contrastK);

  vec3 sd = normalize(uSunDir);
  float backLight = pow(max(dot(vdir, vec3(-sd.x, 0.0, -sd.z)), 0.0), 2.5) * max(sd.y + 0.25, 0.0);
  col += uWaterShallow * smoothstep(0.48, 0.88, waveH) * backLight * 0.15 * chopK;

  vec3 foamTint = mix(vec3(0.90, 0.95, 1.0), uSkySunCol, 0.28);
  col += mix(uWaterShallow, foamTint, 0.35) * extraCaustic * 0.38;
  col = mix(col, foamTint, clamp(extraFoam * foamK * clamp(chopK, 0.15, 1.7), 0.0, 0.72));

  // Analytical V-Shaped Kelvin Ship Wakes & Turbulent Stern Prop-Wash behind Harbor Vessels!
  float wakeFoam = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 wk = uShipWakes[i];
    float wLen2 = dot(wk.zw, wk.zw);
    if (wLen2 > 0.05) {
      vec2 fwd = wk.zw / sqrt(wLen2);
      vec2 side = vec2(-fwd.y, fwd.x);
      vec2 rel = xz - wk.xy;
      float behind = -dot(rel, fwd);
      float lat = abs(dot(rel, side));
      if (behind > -8.0 && behind < 260.0 && lat < 95.0) {
        float trailFade = smoothstep(-6.0, 8.0, behind) * (1.0 - smoothstep(95.0, 255.0, behind));
        float vArm = behind * 0.34 + 4.2;
        float armDist = abs(lat - vArm);
        float kelvinArm = exp(-armDist * armDist / (10.0 + behind * 0.20)) * (0.55 + 0.45 * sin(armDist * 0.95 - ph2 * 2.0));
        float propWash = exp(-lat * lat / (8.0 + behind * 0.11)) * (1.0 - smoothstep(12.0, 145.0, behind))
          * (0.65 + 0.35 * sin(behind * 0.85 - ph4));
        float wkTotal = clamp(kelvinArm * 0.82 + propWash * 0.92, 0.0, 1.2) * trailFade;
        wakeFoam = max(wakeFoam, wkTotal);
        gradH += side * sign(dot(rel, side)) * kelvinArm * trailFade * 0.18 * chopK;
      }
    }
  }
  col = mix(col, foamTint, clamp(wakeFoam * 0.72 * foamK, 0.0, 0.88));

  // Shallow coastal shoal, fine intersecting sandbar caustics + preserved shoreward breaking surf!
  if (vAnalytical > 0.5 && uWaterMode > 0.5 && uWaterMode < 3.5) {
    float seaDist = max(0.0, -cDist);
    float shoal = 1.0 - smoothstep(0.0, 135.0, seaDist);
    float caustA = abs(sin((xz.x * 0.78 + xz.y * 0.59) / sc + s3 * 1.3 - ph3));
    float caustB = abs(sin((xz.x * 0.61 - xz.y * 0.82) / sc + s4 * 1.3 + ph4));
    float caustic = pow(1.0 - min(caustA, caustB), 4.5) * shoal * nyq3;
    col = mix(col, mix(uWaterDeep, uWaterShallow, 0.68) + foamTint * caustic * 0.26, shoal * 0.54);

    // Preserved shoreward surf-breaking band (+ uTime advances phase shoreward, integer-periodic over PC_LOOP = 120.0!)
    float shoalK = pow(seaDist, 0.86);
    float surfWave = sin(shoalK * 0.23 + uTime * (6.2831853 * 36.0 / PC_LOOP) + s1 * 1.5);
    float surfWave2 = sin(shoalK * 0.44 + ph4 - s2 * 1.3);
    float surfBand = (1.0 - smoothstep(4.0, 62.0, seaDist)) * smoothstep(0.0, 2.2, seaDist);
    float surfFoam = surfBand * smoothstep(0.42, 0.93, surfWave * 0.72 + surfWave2 * 0.28);
    float shoreLip = (1.0 - smoothstep(0.0, 4.5, seaDist)) * (0.65 + 0.35 * sin(ph3 + s1 * 2.2));
    col = mix(col, foamTint, clamp((surfFoam * 0.62 + shoreLip * 0.52) * foamK, 0.0, 0.88));
  } else {
    // Polygon harbors, meandering rivers & multi-lobed ponds: bank ripples + downstream capillary current!
    float rDist = evalRiverSignedDist(xz);
    float bankRipple = (1.0 - smoothstep(-16.0, -0.5, rDist)) * step(-24.0, rDist);
    float bankWave = 0.5 + 0.5 * sin(rDist * 2.8 - ph3);
    float caustR = pow(1.0 - min(abs(s4), abs(s5)), 4.0) * 0.18 * nyq4;
    col += (uWaterShallow * 0.45 + foamTint * 0.22) * caustR;
    col = mix(col, foamTint, clamp(bankRipple * bankWave * 0.28 * foamK, 0.0, 0.45));
  }

  // High-frequency Micro-Facet Fresnel Sky Reflection + GGX Sun/Moon Glitter + Broken-Column Skyline Shimmer!
  vec3 waveN = bendNormal(xz, normalize(vec3(-gradH.x * 2.4, 1.0, -gradH.y * 2.4)));
  vec3 reflDir = reflect(vdir, waveN);
  float reflElev = clamp(reflDir.y, 0.0, 1.0);
  vec3 skyRefl = mix(uSunFogCol, mix(uFogCol, uWaterDeep * 1.25, 0.48), pow(reflElev, 0.52));
  float nDotV = max(dot(-vdir, waveN), 0.0);
  float fres = 0.025 + 0.975 * pow(1.0 - nDotV, 4.6);
  col = mix(col, skyRefl, clamp(fres * 0.58 * reflK * reflBoost, 0.0, 0.90));

  vec3 halfV = normalize(sd - vdir);
  float ndh = max(dot(waveN, halfV), 0.0);
  float specTight = pow(ndh, specTightPow) * specTightGain;
  float specGlitter = pow(ndh, 34.0) * 0.34 * glitterMask;
  float sunVisW = smoothstep(-0.08, 0.12, sd.y);
  col += uSkySunCol * (specTight + specGlitter) * reflK * (0.25 + 0.75 * sunVisW);

  // Crisp capillary-broken city skyline & bridge reflection columns at dusk/night!
  float nearCity = 1.0 - smoothstep(uCitySpan * 0.42, uCitySpan * 2.05, length(xz));
  float colStreak = pow(0.5 + 0.5 * sin(atan(xz.y, xz.x) * 46.0 + gradH.x * 9.0), 4.0);
  float microBreak = 0.35 + 0.65 * (0.5 + 0.5 * s5) * (0.5 + 0.5 * s6);
  col += uPoolCol * nearCity * (0.18 + 0.82 * colStreak * microBreak) * max(uLightK, 0.0) * 0.32 * reflK * reflBoost;

  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, sd), 0.0), 6.0) * uHazeSun);
  float fogF = (1.0 - exp(-0.00024 * dist)) * (1.0 - uWorldCurve * 0.45);
  float horizonMix = smoothstep(fadeInner * 0.78, fadeOuter, edgeR) * (1.0 - uWorldCurve * 0.75);
  vec3 far3 = mix(fogCol, uSunFogCol, horizonMix);
  col = mix(col, far3, clamp(max(fogF, horizonMix), 0.0, 1.0));
  col = saturate3(col, uSat);
  gl_FragColor = vec4(col, edgeAlpha);
}
`;

/* ----------------------------------------------------- park tree connections */

export const TREE_LINK_VERT = /* glsl */ `
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
${GLSL_CURVE}
void main() {
  vUv = uv;
  vSeed = aSeed;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  wp.xyz = bendWorld(wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const TREE_LINK_FRAG = /* glsl */ `
uniform vec3 uLinkColA;
uniform vec3 uLinkColB;
uniform float uTreeCyber;
uniform float uTime;
uniform float uLightK;
uniform float uVehLight;
varying vec2 vUv;
varying float vSeed;
${GLSL_NOISE}
void main() {
  if (uVehLight <= 0.005) discard;
  float core = sin(3.14159 * clamp(vUv.y, 0.0, 1.0));
  float brightness = max(uLightK, 0.28) * clamp(uVehLight, 0.0, 2.2);
  vec3 col;
  float alpha;
  if (uTreeCyber < 0.5) {
    float bulbs = pow(0.5 + 0.5 * cos(vUv.x * 44.0 + vSeed * 6.28), 8.0);
    float twinkle = 0.85 + 0.15 * loopSin(uTime, 0.38, vUv.x * 19.0 + vSeed * 40.0);
    col = mix(uLinkColA * 0.45, uLinkColB * 1.45, bulbs) * twinkle * (0.55 + 0.75 * brightness);
    alpha = core * (0.28 + 0.72 * bulbs) * clamp(uVehLight, 0.0, 1.4);
  } else {
    float pulse1 = pow(0.5 + 0.5 * loopSin(uTime, -0.45, vUv.x * 12.56 + vSeed * 31.4), 5.0);
    float pulse2 = pow(0.5 + 0.5 * loopSin(uTime, 0.30, vUv.x * 18.84 - vSeed * 17.1), 6.0);
    float energy = clamp(0.32 + pulse1 * 0.85 + pulse2 * 0.55, 0.0, 1.5);
    col = mix(uLinkColA, uLinkColB, clamp(pulse1 + pulse2 * 0.5, 0.0, 1.0)) * energy * (0.65 + 0.85 * brightness);
    alpha = core * clamp(0.38 + (pulse1 + pulse2) * 0.55, 0.0, 0.96) * clamp(uVehLight, 0.0, 1.4);
  }
  gl_FragColor = vec4(col, alpha);
}
`;

/* ------------------------------------------------------------ billboards */

export const BILL_VERT = /* glsl */ `
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
${GLSL_CURVE}
void main() {
  vUv = uv;
  vSeed = aSeed;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  wp.xyz = bendWorld(wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const BILL_FRAG = /* glsl */ `
uniform vec3 uBillA;
uniform vec3 uBillB;
uniform float uBillK;
uniform float uBillMono;
uniform float uSignAmt;
uniform float uGlyphStyle;
uniform float uSignAnim;
uniform float uTime;
uniform float uLightK;
uniform float uSat;
varying vec2 vUv;
varying float vSeed;
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_GLYPHS}

void main() {
  if (uSignAmt <= 0.008) discard;
  float animT = uTime * max(uSignAnim, 0.0);

  // Dark architectural bezel around every billboard & sign so panels frame crisply
  float bezel = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x)
              * smoothstep(0.0, 0.05, vUv.y) * smoothstep(1.0, 0.95, vUv.y);
  float layoutId = fract(vSeed * 13.37);
  vec3 darkBg = mix(uBillB, uBillA, 0.22) * 0.08;
  vec3 col = darkBg;

  if (layoutId < 0.56) {
    // Simulated Diverse Commercial Advertisements (8 graphic product/brand archetypes:
    // Synth-Beverage bottle + bubbles, Cyber-Coupe showroom, Ringed Off-World Travel,
    // Fashion Visor Portrait, Steaming Noodle Bowl, Market Candlesticks, Club Equalizer, Chrono Dial)
    vec4 simAd = evalSimulatedAd(vUv, vSeed * 31.7, uGlyphStyle, animT);
    float palShift = fract(vSeed * 7.91);
    vec3 adAccentA = mix(uBillA, vec3(1.0, 0.66, 0.16), step(0.35, palShift) * 0.48 * (1.0 - uBillMono));
    if (palShift > 0.68) adAccentA = mix(uBillA, vec3(0.32, 0.96, 0.58), 0.45 * (1.0 - uBillMono));
    vec3 adAccentB = mix(uBillB, vec3(0.98, 0.28, 0.58), (1.0 - step(0.5, palShift)) * 0.42 * (1.0 - uBillMono));
    vec3 fgCol = mix(adAccentA, adAccentB, clamp(simAd.y, 0.0, 1.0)) + vec3(0.98, 0.95, 0.86) * simAd.z * 0.46;
    vec3 bgGrad = mix(darkBg, mix(adAccentB, adAccentA, vUv.y) * 0.16, 0.65);
    col = mix(bgGrad, fgCol, clamp(simAd.x, 0.0, 1.0));
  } else if (layoutId < 0.72) {
    // Classic Shopfront / Rooftop Wordmark: Bold Linear-A/B + Synth Syllabogram Headline + looped ticker
    float heroLine = evalGlyphLine(vec2(vUv.x * 0.90 + 0.05, clamp((vUv.y - 0.30) / 0.56, 0.0, 1.0)), 6.0, 0.0, vSeed * 19.3, uGlyphStyle, animT) * step(0.30, vUv.y) * step(vUv.y, 0.86);
    float subTick = evalGlyphLine(vec2(vUv.x, clamp((vUv.y - 0.08) / 0.16, 0.0, 1.0)), 13.0, loopPhase(animT, 9.0) * 13.0, vSeed * 41.1, uGlyphStyle, animT) * step(0.08, vUv.y) * step(vUv.y, 0.24);
    float rule = smoothstep(0.015, 0.0, abs(vUv.y - 0.27)) * step(0.06, vUv.x) * step(vUv.x, 0.94);
    col = mix(darkBg, uBillA * 1.12, heroLine);
    col = mix(col, uBillB, clamp(subTick * 0.92 + rule * 0.65, 0.0, 1.0));
  } else if (layoutId < 0.86) {
    // Vertical Skyscraper Blade: Twin columns of streaming Minoan-Synth sigils (looped!)
    float cIdx = floor(vUv.x * 2.0);
    float vFlow = loopPhase(animT, 5.0) * 6.0 * (1.0 - 2.0 * cIdx);
    vec2 cell = vec2(fract(vUv.x * 2.0) * 0.84 + 0.08, fract(vUv.y * 6.0 - vFlow));
    float rowIdx = mod(floor(vUv.y * 6.0 - vFlow), 6.0);
    float chS = hash12(vec2(cIdx * 7.1 + vSeed * 31.0, rowIdx * 1.9));
    float g = evalSynthGlyph(cell, chS, uGlyphStyle, animT, 0.060) * step(0.16, chS);
    float divider = smoothstep(0.018, 0.0, abs(vUv.x - 0.5)) * 0.45;
    col = mix(darkBg, mix(uBillA, uBillB, cIdx), g * 0.96);
    col += mix(uBillA, uBillB, 0.5) * divider;
  } else {
    // Full-Matrix Ancient-Futuristic Tablet: 3-row living Linear-A/B + Synth Proclamation
    float row = floor(clamp((vUv.y - 0.10) / 0.80, 0.0, 0.999) * 3.0);
    float rowY = fract(clamp((vUv.y - 0.10) / 0.80, 0.0, 0.999) * 3.0);
    float dirSgn = (mod(row, 2.0) < 0.5) ? 1.0 : -1.0;
    float nGl = 7.0 + row;
    float tablet = evalGlyphLine(vec2(vUv.x * 0.90 + 0.05, rowY), nGl, loopPhase(animT, 4.0) * nGl * dirSgn, vSeed * 17.0 + row * 5.3, uGlyphStyle, animT) * step(0.10, vUv.y) * step(vUv.y, 0.90);
    vec3 rowTint = mix(uBillA, uBillB, row * 0.45);
    col = mix(darkBg, rowTint * 1.1, tablet);
  }

  float innerRim = smoothstep(0.022, 0.0, abs(max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) - 0.455));
  col += mix(uBillA, uBillB, 0.5) * innerRim * 0.35;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 mono = mix(uBillB * 0.30, uBillA * 0.95, clamp(lum, 0.0, 1.2));
  col = mix(col, mono, clamp(uBillMono, 0.0, 1.0));
  col = saturate3(col, uSat * (1.0 - 0.85 * clamp(uBillMono, 0.0, 1.0)));

  col *= 0.88 + 0.12 * loopSin(animT, 0.40, vUv.y * 85.0);
  float k = clamp(uBillK * max(uLightK, 0.25) * min(uSignAmt, 1.65), 0.0, 1.45) * (0.72 + 0.14 * loopSin(animT, 0.20, vSeed * 20.0));
  gl_FragColor = vec4(col * (0.28 + k * 0.74) * bezel, 1.0);
}
`;

/* -------------------------------------------------------------- weather */

export const WEATHER_VERT = /* glsl */ `
attribute float aOff;
attribute float aSpeed;
attribute float aSway;
attribute float aFlakeSeed;
uniform float uTime;
uniform float uFallH;
uniform float uSwayAmp;
uniform float uWindX;
uniform float uWeatherKind;
uniform vec2 uFlakeSize;
varying vec2 vUv;
varying float vSeed;
varying float vViewDist;
varying float vColumnFade;
void main() {
  vUv = uv;
  vSeed = aFlakeSeed;
  vec3 center = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  // Subtract uTime * aSpeed so positive speeds fall DOWNWARD (-Y) toward the street!
  float fallY = mod(center.y + aOff - uTime * aSpeed, uFallH) - uFallH * 0.5;
  float hNorm = clamp((fallY + uFallH * 0.5) / max(uFallH, 1.0), 0.0, 1.0);
  vColumnFade = smoothstep(0.0, 0.09, hNorm) * (1.0 - smoothstep(0.91, 1.0, hNorm));
  center.y = fallY;
  float flutter2 = (uWeatherKind > 0.5)
    ? sin(uTime * (aSway * 1.9 + 0.7) + aFlakeSeed * 19.0) * (uSwayAmp * 0.28)
    : 0.0;
  center.x += (fallY / max(uFallH, 1.0)) * uWindX + sin(uTime * aSway + aOff * 0.7) * uSwayAmp + flutter2;
  center.z += cos(uTime * aSway * 0.8 + aOff * 1.3) * uSwayAmp + flutter2 * 0.75;

  vec3 worldCenter = (modelMatrix * vec4(center, 1.0)).xyz;
  vec3 toCam = cameraPosition - worldCenter;
  vViewDist = length(toCam);

  vec3 wp = worldCenter;
  if (uWeatherKind < 0.5) {
    // 0: Rain — camera-facing axial streak ribbon (never a boxy cuboid!)
    vec3 streakUp = normalize((modelMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec3 sideVec = cross(toCam, streakUp);
    float sLen = length(sideVec);
    vec3 streakRight = sLen > 1e-4 ? (sideVec / sLen) : vec3(1.0, 0.0, 0.0);
    float lenVar = 0.82 + 0.36 * fract(aFlakeSeed * 5.71);
    wp += streakRight * (position.x * uFlakeSize.x) + streakUp * (position.y * uFlakeSize.y * lenVar);
  } else {
    // 1: Snow / 2: Ash — true spherical camera-facing billboard with gentle spin & natural size distribution!
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float spinDir = aFlakeSeed > 0.5 ? 1.0 : -1.0;
    float spinAng = uTime * (0.42 + aSway * 0.32) * spinDir + aFlakeSeed * 6.2831853;
    float cs = cos(spinAng);
    float sn = sin(spinAng);
    vec2 rotXY = vec2(position.x * cs - position.y * sn, position.x * sn + position.y * cs);
    float sizeVar = mix(0.42, 1.32, pow(fract(aFlakeSeed * 7.31), 1.35));
    wp += (camRight * rotXY.x * uFlakeSize.x + camUp * rotXY.y * uFlakeSize.y) * sizeVar;
  }

  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const WEATHER_FRAG = /* glsl */ `
uniform vec3 uWeatherCol;
uniform float uWeatherK;
uniform float uWeatherKind;
uniform float uWeatherFade;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
varying float vViewDist;
varying float vColumnFade;
void main() {
  float fadeK = uWeatherK * uWeatherFade * vColumnFade;
  if (fadeK <= 0.003) discard;

  if (uWeatherKind < 0.5) {
    // Rain: sleek tapered motion-blurred streak with zero hard horizontal edges
    float along = sin(3.14159265 * clamp(vUv.y, 0.0, 1.0));
    float across = pow(sin(3.14159265 * clamp(vUv.x, 0.0, 1.0)), 1.65);
    float a = along * across * fadeK;
    if (a <= 0.004) discard;
    gl_FragColor = vec4(uWeatherCol, clamp(a, 0.0, 0.92));
    return;
  }

  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float ang = atan(p.y, p.x);

  if (uWeatherKind < 1.5) {
    // Snow: 6-fold hexagonal stellar dendrite ice crystal close-up + soft optical snow bokeh at distance!
    float armSharp = mix(5.5, 13.5, fract(vSeed * 3.17));
    float arm6 = pow(max(0.0, cos(ang * 6.0)), armSharp);
    float chev1 = pow(max(0.0, cos(ang * 6.0 + (r - 0.38) * 14.0)), 7.0)
      * smoothstep(0.16, 0.42, r) * (1.0 - smoothstep(0.66, 0.94, r));
    float chev2 = pow(max(0.0, cos(ang * 6.0 - (r - 0.38) * 14.0)), 7.0)
      * smoothstep(0.16, 0.42, r) * (1.0 - smoothstep(0.66, 0.94, r));
    float hexPlate = exp(-r * r * 9.5) * (0.85 + 0.15 * cos(ang * 6.0));
    float rimFade = 1.0 - smoothstep(0.76, 1.0, r);
    float crystal = clamp((hexPlate + arm6 * (1.0 - smoothstep(0.10, 0.96, r)) * 0.85 + (chev1 + chev2) * 0.42) * rimFade, 0.0, 1.0);
    float softFlake = exp(-r * r * 3.6) * (1.0 - smoothstep(0.62, 1.0, r));
    float detailBlend = (1.0 - smoothstep(12.0, 56.0, vViewDist)) * step(0.18, fract(vSeed * 11.3));
    float a = mix(softFlake * 0.88, max(crystal, softFlake * 0.48), detailBlend);
    float glint = 0.86 + 0.18 * sin(uTime * 3.1 + vSeed * 43.0);
    vec3 snowCol = mix(uWeatherCol, vec3(1.0), 0.35 * crystal * glint);
    float finalA = a * glint * fadeK;
    if (finalA <= 0.004) discard;
    gl_FragColor = vec4(snowCol, clamp(finalA, 0.0, 0.96));
    return;
  }

  // Volcanic Ash & Glowing Cinders: irregular organic flake silhouette (never cubic!)
  float lobe = 0.68 + 0.20 * sin(ang * 3.0 + vSeed * 19.0) + 0.11 * cos(ang * 5.0 - vSeed * 13.0);
  if (r > lobe) discard;
  float edge = 1.0 - smoothstep(lobe * 0.48, lobe, r);
  float ember = step(0.82, vSeed) * (0.55 + 0.45 * sin(uTime * 4.8 + vSeed * 37.0));
  vec3 ashCol = mix(uWeatherCol, vec3(1.0, 0.46, 0.14), ember * (1.0 - r * 0.6));
  gl_FragColor = vec4(ashCol, clamp(edge * fadeK, 0.0, 0.92));
}
`;

export const DUST_VERT = /* glsl */ `
attribute float aPhase;
attribute float aSize;
attribute vec3 aDrift;
uniform float uTime;
uniform float uBoxSpan;
varying float vTwinkle;
void main() {
  vec3 p = position;
  float omega = 6.2831853 / 120.0;
  float hOrbit = max(6.0, floor((0.35 + aPhase * 0.45) / omega + 0.5));
  float t = uTime * omega * hOrbit;
  float dxRate = floor(aDrift.x * 5.5 * 120.0 / max(uBoxSpan, 1.0) + 0.5) * (uBoxSpan / 120.0);
  float dzRate = floor(aDrift.z * 5.5 * 120.0 / max(uBoxSpan, 1.0) + 0.5) * (uBoxSpan / 120.0);
  float dyRate = floor(aDrift.y * 2.6 * 120.0 / 360.0 + 0.5) * (360.0 / 120.0);
  p.x = mod(p.x + dxRate * uTime + sin(t + aPhase * 9.0) * 14.0 + uBoxSpan * 0.5, uBoxSpan) - uBoxSpan * 0.5;
  p.z = mod(p.z + dzRate * uTime + cos(uTime * omega * max(5.0, floor(hOrbit * 0.83 + 0.5)) + aPhase * 7.0) * 14.0 + uBoxSpan * 0.5, uBoxSpan) - uBoxSpan * 0.5;
  p.y = mod(p.y + dyRate * uTime + sin(uTime * omega * max(4.0, floor(hOrbit * 0.61 + 0.5)) + aPhase * 13.0) * 7.5 + 180.0, 360.0) - 140.0;
  float hTwink = max(12.0, floor((0.7 + aPhase * 2.6) / omega + 0.5));
  vTwinkle = 0.45 + 0.55 * sin(uTime * omega * hTwink + aPhase * 80.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(aSize * (340.0 / max(-mv.z, 1.0)), 1.2, 11.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const DUST_FRAG = /* glsl */ `
uniform vec3 uDustCol;
uniform float uDustK;
varying float vTwinkle;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float soft = pow(1.0 - r, 2.4);
  gl_FragColor = vec4(uDustCol, soft * vTwinkle * uDustK);
}
`;

/* ------------------------------------------------------ holograms */

export const HOLO_VERT = /* glsl */ `
attribute float aSeed;
attribute float aHoloKind;
attribute float aEdgeDist;
uniform float uTime;
uniform float uSignAnim;
uniform float uHoloScale;
varying vec2 vUv;
varying float vSeed;
varying float vHoloKind;
varying float vEdgeDist;
varying float vLocalY;
varying float vViewDot;
${GLSL_NOISE}
${GLSL_CURVE}
void main() {
  vUv = uv;
  vSeed = aSeed;
  vHoloKind = aHoloKind;
  vEdgeDist = aEdgeDist;

  float scMul = max(0.2, uHoloScale);
  vec3 pLoc = position * scMul;
  vec3 nLoc = normal;

  // 3D Archimedean Solids (kind=2) & Abstract Sculptures (kind=3):
  // Slow, varied, asynchronous per-instance precession, poise & levitation (zero lockstep wobble!)
  if (aHoloKind > 1.5 && aHoloKind < 3.5) {
    float animRate = max(uSignAnim, 0.0);
    float animGate = clamp(animRate, 0.0, 1.0);
    float animT = uTime * animRate;

    // Independent per-instance random variates from aSeed
    float s1 = fract(aSeed * 17.31 + 0.13);
    float s2 = fract(aSeed * 43.97 + 0.37);
    float s3 = fract(aSeed * 71.19 + 0.61);
    float s4 = fract(aSeed * 97.43 + 0.29);
    float s5 = fract(aSeed * 131.71 + 0.83);

    float spinDir = s2 > 0.5 ? 1.0 : -1.0;
    float baseYaw = s1 * 6.2831853;
    float angY = baseYaw;
    if (s1 < 0.24) {
      // ~24% of 3D projections hover majestically with only a slow gentle azimuthal breathe (60-120s period)
      float kSway = 1.0 + step(0.55, s4);
      angY += (0.10 + 0.14 * s3) * sin(loopPhase(animT, kSway) * 6.2831853 + s5 * 6.2831853) * animGate;
    } else {
      // Slow architectural rotation: 1 or 2 revolutions per 120s (3 deg/s or 6 deg/s) + gentle phase drift
      float kSpin = s1 < 0.78 ? 1.0 : 2.0;
      float kMod = s3 < 0.5 ? 1.0 : 2.0;
      float driftMod = 0.11 * sin(loopPhase(animT, kMod) * 6.2831853 + s4 * 6.2831853) * animGate;
      angY += loopPhase(animT, kSpin) * 6.2831853 * spinDir * animGate + driftMod;
    }

    // Distinct integer harmonics (1..3 cycles per 120s -> 40s..120s periods, 50x-120x slower than 1Hz!)
    float kTiltX = 1.0 + floor(s3 * 2.99);
    float kTiltZ = 1.0 + mod(kTiltX + floor(s4 * 1.99), 3.0);
    float staticPoiseX = (s2 - 0.5) * 0.22;
    float staticPoiseZ = (s4 - 0.5) * 0.18;
    float ampX = (0.025 + 0.115 * s5) * animGate;
    float ampZ = (0.020 + 0.095 * (1.0 - s5)) * animGate;
    float angX = staticPoiseX + ampX * sin(loopPhase(animT, kTiltX) * 6.2831853 + s2 * 6.2831853);
    float angZ = staticPoiseZ + ampZ * cos(loopPhase(animT, kTiltZ) * 6.2831853 + s4 * 6.2831853);

    float cx = cos(angX);
    float sx = sin(angX);
    float cz = cos(angZ);
    float sz = sin(angZ);
    float cy = cos(angY);
    float sy = sin(angY);

    // Rotate X -> Z -> Y for full 3-axis asynchronous gimbal precession
    vec3 p1 = vec3(pLoc.x, pLoc.y * cx - pLoc.z * sx, pLoc.y * sx + pLoc.z * cx);
    vec3 p2 = vec3(p1.x * cz - p1.y * sz, p1.x * sz + p1.y * cz, p1.z);
    pLoc = vec3(p2.x * cy + p2.z * sy, p2.y, -p2.x * sy + p2.z * cy);

    vec3 n1 = vec3(nLoc.x, nLoc.y * cx - nLoc.z * sx, nLoc.y * sx + nLoc.z * cx);
    vec3 n2 = vec3(n1.x * cz - n1.y * sz, n1.x * sz + n1.y * cz, n1.z);
    nLoc = vec3(n2.x * cy + n2.z * sy, n2.y, -n2.x * sy + n2.z * cy);

    // Delicate asynchronous magnetic-levitation float (40s..120s period)
    float kBob = 1.0 + floor(s1 * 2.99);
    pLoc.y += scMul * (0.014 + 0.028 * s3) * sin(loopPhase(animT, kBob) * 6.2831853 + s5 * 6.2831853) * animGate;
  }
  vLocalY = pLoc.y / max(scMul, 1e-3);

  vec4 wp = vec4(pLoc, 1.0);
  vec3 wn = nLoc;
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
    wn = mat3(instanceMatrix) * wn;
  #endif
  wp = modelMatrix * wp;
  wn = normalize(mat3(modelMatrix) * wn);
  vec3 viewDir = normalize(cameraPosition - wp.xyz + vec3(1e-5));
  vViewDot = clamp(dot(wn, viewDir), 0.0, 1.0);

  wp.xyz = bendWorld(wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const HOLO_FRAG = /* glsl */ `
uniform vec3 uBillA;
uniform vec3 uBillB;
uniform float uBillK;
uniform float uBillMono;
uniform float uSignAmt;
uniform float uGlyphStyle;
uniform float uSignAnim;
uniform float uHoloScan;
uniform float uTime;
uniform float uLightK;
uniform float uSat;
varying vec2 vUv;
varying float vSeed;
varying float vHoloKind;
varying float vEdgeDist;
varying float vLocalY;
varying float vViewDot;
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_GLYPHS}

void main() {
  if (uSignAmt <= 0.008) discard;
  float animT = uTime * max(uSignAnim, 0.0);
  vec2 cUv = vUv - 0.5;
  float motif = 0.0;
  float colorMix = 0.5;
  float edgeMask = 1.0;

  // Per-instance desynchronized scanline, refresh & harmonic shimmer rates
  float hs1 = fract(vSeed * 29.31 + 0.17);
  float hs2 = fract(vSeed * 53.79 + 0.41);
  float hs3 = fract(vSeed * 83.13 + 0.67);
  float hsDir = hs2 > 0.5 ? 1.0 : -1.0;
  float kFine = 6.0 + floor(hs1 * 7.0);
  float kSub = 2.0 + floor(hs2 * 4.0);
  float kRefresh = 1.0 + floor(hs3 * 2.99);

  // Scanline & rolling CRT/laser refresh beam coordinate (planar UV or 3D local elevation slice)
  float scanCoord = (vHoloKind > 1.5 && vHoloKind < 3.5) ? (vLocalY * 0.85 + 0.5) : vUv.y;
  float scanAmt = clamp(uHoloScan, 0.0, 2.0);
  float fineLines = 0.5 + 0.5 * sin(scanCoord * 215.0 + loopPhase(animT, kFine) * 6.2831853 * hsDir + vSeed * 19.0);
  float subLines = 0.5 + 0.5 * sin(scanCoord * 48.0 - loopPhase(animT, kSub) * 6.2831853 * hsDir + hs1 * 6.2831853);
  float refreshSweep = pow(max(0.0, 1.0 - abs(fract(scanCoord * 1.25 - loopPhase(animT, kRefresh) * hsDir + hs2) - 0.5) * 8.0), 2.0);
  float scanMod = mix(1.0, (0.38 + 0.62 * fineLines) * (0.76 + 0.24 * subLines) + refreshSweep * 0.62, clamp(scanAmt * 0.72, 0.0, 1.0));

  if (vHoloKind < 0.5) {
    // Kind 0: Single-Plane Pyramid Projection Screen (FrontSide only — zero double-sided cross!)
    float holoMode = fract(vSeed * 11.73);
    if (holoMode < 0.54) {
      vec4 simAd = evalSimulatedAd(vUv, vSeed * 23.1, uGlyphStyle, animT);
      motif = clamp(simAd.x, 0.0, 1.0);
      colorMix = clamp(simAd.y + simAd.z * 0.35, 0.0, 1.0);
    } else {
      float r = length(cUv * vec2(1.35, 1.0));
      float kRing = 6.0 + floor(hs1 * 10.0);
      float rFlow = loopPhase(animT, kRing);
      float rings = smoothstep(0.022, 0.0, abs(fract(r * 4.2 - rFlow + vSeed * 4.0) - 0.5)) * smoothstep(0.50, 0.10, r);
      float centerSigil = evalSynthGlyph(clamp((vUv - vec2(0.32, 0.26)) / vec2(0.36, 0.46), 0.0, 1.0), vSeed * 9.3, uGlyphStyle, animT, 0.055)
        * step(0.32, vUv.x) * step(vUv.x, 0.68) * step(0.26, vUv.y) * step(vUv.y, 0.72);
      float kScroll = 3.0 + floor(hs2 * 5.0);
      float scrollArc = evalGlyphLine(vec2(vUv.x, clamp((vUv.y - 0.10) / 0.15, 0.0, 1.0)), 10.0, loopPhase(animT, kScroll) * 10.0, vSeed * 17.0, uGlyphStyle, animT)
        * step(0.10, vUv.y) * step(vUv.y, 0.25);
      motif = clamp(rings * 0.85 + centerSigil * 0.95 + scrollArc * 0.88, 0.0, 1.0);
      colorMix = clamp(rings * 0.55 + centerSigil * 0.65 + fract(vSeed * 5.3) * 0.35, 0.0, 1.0);
    }
    // Crisp HUD corner reticles + scanline field backing so the projection plane reads clearly
    float borderX = smoothstep(0.49, 0.465, abs(cUv.x)) * (1.0 - smoothstep(0.455, 0.43, abs(cUv.x))) * step(0.32, abs(cUv.y));
    float borderY = smoothstep(0.49, 0.465, abs(cUv.y)) * (1.0 - smoothstep(0.455, 0.43, abs(cUv.y))) * step(0.34, abs(cUv.x));
    float frameHud = clamp(borderX + borderY, 0.0, 1.0) * 0.78;
    motif = clamp(motif + frameHud + 0.10 * fineLines * clamp(scanAmt, 0.2, 1.5), 0.0, 1.0);
    edgeMask = smoothstep(0.0, 0.045, vUv.x) * smoothstep(1.0, 0.955, vUv.x)
             * smoothstep(0.0, 0.055, vUv.y) * smoothstep(1.0, 0.945, vUv.y);
  } else if (vHoloKind < 1.5) {
    // Kind 1: Single-Plane Conical Aperture Disc (FrontSide circular radar/astrolabe disc)
    float rad = length(cUv);
    if (rad > 0.492) discard;
    float ang = atan(cUv.y, cUv.x);
    float kDisc = 1.0 + floor(hs1 * 2.99);
    float kWedge = 2.0 + floor(hs3 * 2.99);
    float rotA = ang + loopPhase(animT, kDisc) * 6.2831853 * hsDir + hs2 * 6.2831853;
    float rings = smoothstep(0.016, 0.002, abs(rad - 0.455))
                + smoothstep(0.013, 0.002, abs(rad - 0.33)) * 0.85
                + smoothstep(0.012, 0.002, abs(rad - 0.19)) * 0.75;
    float ticks = step(0.65, cos(rotA * 24.0)) * smoothstep(0.04, 0.0, abs(rad - 0.395));
    float sweepWedge = pow(fract((ang / 6.2831853) - loopPhase(animT, kWedge) * hsDir + hs1), 4.0) * smoothstep(0.47, 0.08, rad);
    float sigil = evalSynthGlyph(clamp((vUv - vec2(0.34, 0.34)) / 0.32, 0.0, 1.0), vSeed * 13.7, uGlyphStyle, animT, 0.06)
      * smoothstep(0.20, 0.15, rad);
    motif = clamp(rings * 0.92 + ticks * 0.72 + sweepWedge * 0.48 + sigil * 0.98, 0.0, 1.0);
    colorMix = clamp(0.25 + 0.55 * sweepWedge + 0.45 * sigil + fract(vSeed * 7.1) * 0.25, 0.0, 1.0);
    edgeMask = smoothstep(0.492, 0.455, rad);
  } else if (vHoloKind < 2.5) {
    // Kind 2: 3D Archimedean Solid (Cuboctahedron, Truncated Octahedron, Rhombicuboctahedron, Buckyball)
    // Exact outer polygon edges glow brightly with zero internal diagonal triangulation seams!
    float polyEdge = smoothstep(0.115, 0.016, vEdgeDist);
    float innerRing = smoothstep(0.032, 0.006, abs(vEdgeDist - 0.30)) * 0.52;
    float fresnel = pow(1.0 - vViewDot, 1.75);
    float faceSigil = evalSynthGlyph(clamp(vUv, 0.0, 1.0), vSeed * 19.3 + floor(vUv.x * 2.0), uGlyphStyle, animT, 0.07)
      * smoothstep(0.16, 0.34, vEdgeDist) * 0.68;
    float kSlice = 2.0 + floor(hs1 * 3.99);
    float sliceBands = smoothstep(0.74, 0.98, sin(scanCoord * (52.0 + hs2 * 28.0) - loopPhase(animT, kSlice) * 6.2831853 * hsDir + hs3 * 6.2831853)) * 0.42;
    motif = clamp(polyEdge * 1.05 + innerRing + faceSigil + fresnel * 0.52 + sliceBands + 0.12, 0.0, 1.15);
    colorMix = clamp(polyEdge * 0.62 + fresnel * 0.38 + fract(vSeed * 8.9) * 0.35, 0.0, 1.0);
    edgeMask = 0.92;
  } else if (vHoloKind < 3.5) {
    // Kind 3: 3D Abstract Holographic Sculpture (Parametric Trefoil Knot & Gyroscopic Astrolabe)
    float rim = smoothstep(0.26, 0.03, vEdgeDist);
    float kPulse = 1.0 + floor(hs2 * 2.99);
    float nLobes = 2.0 + floor(hs1 * 1.99);
    float pulse = pow(0.5 + 0.5 * sin((vUv.x * nLobes - loopPhase(animT, kPulse) * hsDir + hs3) * 6.2831853), 3.0);
    float ticks = smoothstep(0.55, 0.92, cos(vUv.x * 110.0)) * 0.42;
    float fresnel = pow(1.0 - vViewDot, 1.55);
    motif = clamp(rim * 0.92 + pulse * 0.74 + ticks + fresnel * 0.58 + 0.16, 0.0, 1.15);
    colorMix = clamp(pulse * 0.68 + rim * 0.32 + fract(vSeed * 6.7) * 0.30, 0.0, 1.0);
    edgeMask = 0.94;
  } else {
    // Kind 4: Open Outer Cylindrical Crown (FrontSide outer ring over circular arenas/stadiums)
    float bandY = abs(vUv.y - 0.5) * 2.0;
    float rails = smoothstep(0.88, 0.96, bandY) * 0.85;
    float kCrown = 2.0 + floor(hs3 * 4.99);
    float ticker = evalGlyphLine(vec2(fract(vUv.x * 3.0), clamp((vUv.y - 0.22) / 0.56, 0.0, 1.0)), 12.0, loopPhase(animT, kCrown) * 12.0 * hsDir, vSeed * 15.0, uGlyphStyle, animT)
      * step(0.22, vUv.y) * step(vUv.y, 0.78);
    motif = clamp(ticker * 0.95 + rails + 0.12 * fineLines, 0.0, 1.0);
    colorMix = clamp(ticker * 0.65 + rails * 0.35 + fract(vSeed * 4.3) * 0.35, 0.0, 1.0);
    edgeMask = smoothstep(0.0, 0.10, vUv.y) * smoothstep(1.0, 0.90, vUv.y);
  }

  if (motif < 0.025) discard;

  vec3 col = mix(uBillB, uBillA, colorMix);
  // Subtle chromatic scanline accent on bright refresh sweeps when colorful
  col += mix(uBillA, vec3(0.75, 0.96, 1.0), 0.45) * refreshSweep * 0.24 * clamp(scanAmt, 0.0, 1.5);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 mono = mix(uBillB * 0.4, uBillA * 1.05, clamp(lum, 0.0, 1.2));
  col = mix(col, mono, clamp(uBillMono, 0.0, 1.0));
  col = saturate3(col, uSat * (1.0 - 0.85 * clamp(uBillMono, 0.0, 1.0)));

  float a = motif * scanMod * edgeMask * clamp(uBillK * min(uSignAmt, 1.6), 0.0, 1.5) * max(uLightK, 0.32) * 0.44;
  gl_FragColor = vec4(col * 0.92, clamp(a, 0.0, 0.56));
}
`;
