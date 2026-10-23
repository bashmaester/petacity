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
  // Quantized temporal glyph-morphing: symbols periodically rewrite into new syllabograms!
  float phase = animT * 0.28 + charSeed * 19.7;
  float epoch = floor(phase);
  float morph = smoothstep(0.74, 0.96, fract(phase));
  float g0 = floor(hash12(vec2(charSeed * 97.3, epoch * 13.1)) * 64.0);
  float g1 = floor(hash12(vec2(charSeed * 97.3, (epoch + 1.0) * 13.1)) * 64.0);
  float d0 = evalSingleGlyphDist(p, g0, glyphStyle);
  float d1 = evalSingleGlyphDist(p, g1, glyphStyle);
  float d = mix(d0, d1, morph);
  float aa = max(fwidth(d), 0.018);
  return 1.0 - smoothstep(strokeW - aa * 0.5, strokeW + aa, d);
}

// Multi-character Linear-Synth text line with authentic Aegean double-dot word dividers
float evalGlyphLine(vec2 uv, float cols, float scrollT, float rowSeed, float glyphStyle, float animT) {
  if (uv.y < 0.04 || uv.y > 0.96) return 0.0;
  float xShift = uv.x * cols + scrollT;
  float cid = floor(xShift);
  vec2 cUv = vec2(fract(xShift), uv.y);
  float wordSlot = mod(cid + floor(rowSeed * 11.0), 5.0);
  if (wordSlot > 3.5) {
    // Linear A/B vertical colon word-separator puncta (:)
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
  vec3 wind = vec3(t * 22.0, 0.0, t * 9.5);
  float w4 = t * 0.095 * max(uCloudEvol, 0.0);
  float lac = clamp(uCloudLac, 1.25, 3.4);
  float sOff = uCloudSeed;
  float over = clamp((covK - 1.05) / 1.15, 0.0, 1.0);

  if (cType > 2.5 && cType < 3.5) {
    // 3: High ice-crystal Cirrus & wind-sheared mares' tails
    vec3 cw = (p + wind * 2.1 + vec3(h01 * 520.0, 0.0, -h01 * 210.0)) * vec3(0.00019, 0.0014, 0.00052);
    float warp = fbm4Cloud(cw * 0.85, w4 * 0.7, lac, sOff);
    float wisps = fbm4Cloud(cw * vec3(1.6, 1.0, 3.4) + vec3(warp * 2.4, 0.0, -warp * 1.6), w4, lac, sOff + 3.1);
    float fine = vnoise4(vec4(cw * vec3(4.5, 1.8, 7.5), w4 * 1.3 + sOff));
    float prof = smoothstep(0.05, 0.45, h01) * smoothstep(1.0, 0.48, h01);
    float shape = (wisps * 0.72 + fine * 0.28) * (0.65 + 0.55 * prof);
    float thresh = mix(clamp(0.58 - covK * 0.20, 0.22, 0.64), 0.16, over);
    return clamp((shape - thresh) * 2.2, 0.0, 0.78) * prof;
  }

  if (cType > 1.5 && cType < 2.5) {
    // 2: Stratocumulus cellular rolls & unbroken overcast ceiling at high cover
    vec3 sq = (p + wind * 0.85) * vec3(0.00028, 0.00125, 0.00044);
    float rolls = fbm4Cloud(sq * vec3(0.85, 1.0, 1.55), w4 * 0.8, lac, sOff);
    float cells = fbm4Cloud(sq * 2.6 + vec3(4.1, -1.3, 2.7), w4 * 1.15, lac, sOff + 5.7);
    float detail = vnoise4(vec4(sq * 5.4, w4 * 1.4 + sOff));
    float prof = smoothstep(0.03, 0.26, h01) * smoothstep(1.0, 0.44, h01);
    float shape = (rolls * 0.62 + cells * 0.38) * (0.62 + 0.52 * prof) - detail * 0.09;
    float thresh = mix(clamp(0.53 - covK * 0.24, 0.16, 0.60), 0.06, over);
    return clamp((shape - thresh) * 3.25, 0.0, 1.0) * prof;
  }

  if (cType > 0.5 && cType < 1.5) {
    // 1: Towering Cumulonimbus storm cells with sheared glaciated anvil tops
    float anvilShear = smoothstep(0.58, 0.96, h01);
    vec3 tp = p + wind * (0.9 + anvilShear * 1.15) - vec3(anvilShear * 680.0, 0.0, anvilShear * 240.0);
    vec3 tq = tp * vec3(mix(0.00028, 0.00017, anvilShear), 0.00042, mix(0.00028, 0.00019, anvilShear));
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

  // 0: Fair-weather Cumulus humilis / mediocris
  vec3 q = (p + wind) * vec3(0.00034, 0.00072, 0.00034);
  float macro = fbm4Cloud(q, w4, lac, sOff);
  float billow = fbm4Cloud(q * 2.35 + vec3(3.7, -1.9, 5.1), w4 * 1.3, lac, sOff + 6.2);
  float detail = vnoise4(vec4(q * 5.8 - vec3(t * 0.08, 0.0, 0.0), w4 * 1.7 + sOff));
  float prof = smoothstep(0.02, 0.22, h01) * smoothstep(1.0, 0.36, h01);
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

  // True 3D volumetric raymarch through concentric spherical cloud shell
  float minElev = mix(-0.14, -1.02, clamp(uWorldCurve * 1.4, 0.0, 1.0));
  if (uCloud > 0.01 && d.y > minElev) {
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

    // Cloud shell base & ceiling adapt to selected meteorological cloud type
    float baseH = 580.0;
    float topH = 1580.0;
    float extMul = 1.0;
    if (uCloudType > 0.5 && uCloudType < 1.5) { baseH = 420.0; topH = 2420.0; extMul = 1.25; }
    else if (uCloudType > 1.5 && uCloudType < 2.5) { baseH = 500.0; topH = 980.0; extMul = 1.35; }
    else if (uCloudType > 2.5 && uCloudType < 3.5) { baseH = 1340.0; topH = 1960.0; extMul = 0.46; }
    else if (uCloudType > 3.5 && uCloudType < 4.5) { baseH = 540.0; topH = 2040.0; extMul = 0.95; }
    else if (uCloudType > 4.5) { baseH = 85.0; topH = 355.0; extMul = 1.55; }

    float rBase = atmoR + baseH;
    float rTop = atmoR + topH;
    float shellThick = rTop - rBase;

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

    float maxMarch = mix(13500.0, max(atmoR * 2.8, 9000.0), curveBlend);
    tEnd = min(tEnd, tStart + maxMarch);

    if (tEnd > tStart + 8.0) {
      vec2 fc = gl_FragCoord.xy;
      float jit = grainHash(fc + fract(uTime * 7.31) * 113.0);
      float span = tEnd - tStart;
      float dtStep = span / 10.0;
      float covK = clamp(uCloud, 0.0, 2.5);
      float overTint = smoothstep(1.15, 2.2, covK);

      float Tr = 1.0;
      vec3 accum = vec3(0.0);
      float avgLit = 0.0;
      float wSum = 0.0;
      vec3 repP = cameraPosition + d * (tStart + span * 0.45);

      vec3 darkBelly = mix(uCloudCol * 0.34, uHor * 0.44, 0.26) * (1.0 - 0.26 * overTint);
      vec3 brightTop = mix(uCloudCol + uSkySunCol * 0.92, vec3(0.97, 0.96, 0.93), 0.30) * (1.0 - 0.14 * overTint);
      float cosTheta = dot(d, sd);
      float hgPhase = 0.25 + 0.95 * pow(max(cosTheta, 0.0), 6.0) * (0.4 + uSunGlow * 0.85);

      for (int i = 0; i < 10; i++) {
        if (Tr < 0.025) break;
        float tCur = tStart + (float(i) + jit) * dtStep;
        vec3 p = cameraPosition + d * tCur;
        float h01 = clamp((length(p - sphereCenter) - rBase) / shellThick, 0.0, 1.0);
        float dens = skyCumulusDensity(p, h01, covK, uCloudType, uTime);
        if (dens > 0.004) {
          vec3 pSun = p + sd * 145.0;
          float hSun = clamp((length(pSun - sphereCenter) - rBase) / shellThick, 0.0, 1.0);
          float shDens = skyCumulusDensity(pSun, hSun, covK, uCloudType, uTime);
          float sunTrans = exp(-shDens * 2.6);
          float powder = 1.0 - exp(-dens * 3.4);
          float lit = clamp(sunTrans * (0.52 + 0.55 * h01) + 0.10 + 0.16 * h01, 0.0, 1.25);
          vec3 stepCol = mix(darkBelly, brightTop, clamp(lit, 0.0, 1.0));
          stepCol += uSkySunCol * sunTrans * (0.35 + 0.65 * powder) * hgPhase * 0.55;

          float sig = dens * (0.0026 + covK * 0.0014) * extMul;
          float stepT = exp(-sig * dtStep);
          float w = Tr * (1.0 - stepT);
          accum += w * stepCol;
          avgLit += w * lit;
          wSum += w;
          Tr *= stepT;
        }
      }

      float cloudAlpha = 1.0 - Tr;
      if (cloudAlpha > 0.004) {
        vec3 cRgb = accum / max(wSum, 1e-4);
        float meanLit = avgLit / max(wSum, 1e-4);
        if (uCloudStyle > 0.5) {
          vec4 plate = evalStormyPlate(meanLit, uCloudStyle, fc, repP.xz * 0.0012, darkBelly, brightTop, uTime);
          cRgb = mix(cRgb, plate.rgb, 0.85);
          cloudAlpha *= plate.a;
        }
        float distFade = mix(smoothstep(-0.10, 0.07, d.y), 1.0, clamp(uWorldCurve * 1.3, 0.0, 1.0));
        float farAtmo = smoothstep(3500.0, 14500.0, tStart) * (1.0 - curveBlend * 0.65);
        cRgb = mix(cRgb, mix(uHor, uSkySunCol, pow(s, 5.0) * 0.35), farAtmo * 0.58);
        col = mix(col, cRgb, clamp(cloudAlpha * distFade, 0.0, 0.985));
      }
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
uniform float uCloudType;
varying vec3 vWorld;
varying vec3 vCenterW;
varying vec3 vAxisX;
varying vec3 vAxisY;
varying vec3 vAxisZ;
varying vec3 vHalfExt;
varying float vSeed;
${GLSL_CURVE}
void main() {
  vSeed = aSeed;
  vec3 ctr = aCenter;
  vec3 scl = aScale;
  // Morph 3D skyscraper-weaving cloud volumes by selected cloud type without rebuilding geometry!
  if (uCloudType > 0.5 && uCloudType < 1.5) {
    // 1: Cumulonimbus towering storm columns
    ctr.y = 260.0 + (aCenter.y - 330.0) * 1.45;
    scl *= vec3(1.15, 2.05, 1.15);
  } else if (uCloudType > 1.5 && uCloudType < 2.5) {
    // 2: Stratocumulus wide horizontal roll sheets
    ctr.y = 385.0 + (aCenter.y - 330.0) * 0.36;
    scl *= vec3(1.75, 0.52, 1.55);
  } else if (uCloudType > 2.5 && uCloudType < 3.5) {
    // 3: High ice Cirrus wind-sheared wisps
    ctr.y = 840.0 + (aCenter.y - 330.0) * 0.85;
    scl *= vec3(2.25, 0.28, 0.85);
  } else if (uCloudType > 3.5 && uCloudType < 4.5) {
    // 4: Multi-layer (split puffs into mid altocumulus & high cirrus decks)
    float upper = step(0.5, fract(aSeed * 13.7));
    ctr.y = mix(340.0 + (aCenter.y - 330.0) * 0.35, 860.0 + (aCenter.y - 330.0) * 0.55, upper);
    scl *= mix(vec3(1.35, 0.65, 1.35), vec3(2.0, 0.32, 0.9), upper);
  } else if (uCloudType > 4.5) {
    // 5: Low urban Sea-of-Clouds hugging skyscraper canyons (spires & pyramids pierce above!)
    ctr.y = 95.0 + (aCenter.y - 330.0) * 0.34;
    scl *= vec3(1.90, 0.54, 1.85);
  }

  vHalfExt = max(scl * 0.5, vec3(1.0));
  vCenterW = bendWorld(ctr);
  vec3 upAxis = normalize(bendNormal(ctr.xz, vec3(0.0, 1.0, 0.0)));
  float yaw = aSeed * 6.2831853;
  vec3 refH = vec3(cos(yaw), 0.0, sin(yaw));
  vec3 axX = cross(upAxis, refH);
  if (dot(axX, axX) < 1e-4) axX = cross(upAxis, vec3(1.0, 0.0, 0.0));
  axX = normalize(axX);
  vec3 axZ = normalize(cross(axX, upAxis));
  vAxisX = axX;
  vAxisY = upAxis;
  vAxisZ = axZ;

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
varying vec3 vWorld;
varying vec3 vCenterW;
varying vec3 vAxisX;
varying vec3 vAxisY;
varying vec3 vAxisZ;
varying vec3 vHalfExt;
varying float vSeed;
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
  vec3 drift = vec3(t * 0.045, 0.0, t * 0.022) + seed * 17.3;
  float w4 = t * 0.105 * max(uCloudEvol, 0.0);
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
  if (uCloud <= 0.015) discard;
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
  float covK = clamp(uCloud, 0.0, 2.5);
  float isCirrus = (uCloudType > 2.5 && uCloudType < 3.5) ? 1.0 : 0.0;
  float isLowSea = (uCloudType > 4.5) ? 1.0 : 0.0;

  float Tr = 1.0;
  vec3 accum = vec3(0.0);
  float avgLit = 0.0;
  float wSum = 0.0;

  // Low sea-of-clouds picks up warm/neon city under-glow on its undersides!
  vec3 cityUnder = uPoolCol * max(uLightK, 0.15) * (0.20 + 0.45 * isLowSea);
  vec3 darkBelly = uCloudCol * 0.38 + cityUnder * 0.35;
  vec3 brightTop = mix(uCloudCol + uSkySunCol * 0.95, vec3(0.97, 0.96, 0.93), 0.30);
  float fwd = pow(max(dot(rdW, sd), 0.0), 5.0);
  float optScale = mix(1.85 + covK * 0.95, 0.78 + covK * 0.42, isCirrus);

  for (int i = 0; i < 7; i++) {
    if (Tr < 0.04) break;
    float tCur = t0 + (float(i) + jit) * dtL;
    vec3 pL = roL + rdL * tCur;
    float dens = puffVolDensity(pL, covK, uCloudType, vSeed, uTime);
    if (dens > 0.005) {
      float shD = puffVolDensity(pL + sdL * 0.32, covK, uCloudType, vSeed, uTime);
      float sunT = exp(-shD * 2.4);
      float hUp = clamp(pL.y * 0.5 + 0.5, 0.0, 1.0);
      float lit = clamp(sunT * (0.55 + 0.52 * hUp) + 0.12, 0.0, 1.22);
      vec3 sc = mix(darkBelly, brightTop, clamp(lit, 0.0, 1.0));
      sc += cityUnder * (1.0 - hUp) * 0.55;
      sc += uSkySunCol * sunT * fwd * (0.35 + uSunGlow * 0.75);

      float stepT = exp(-dens * dtL * optScale);
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

float evalTerrainHeight(vec2 p) {
  float coastDist = evalCoastSignedDist(p);
  if (coastDist < 0.0) {
    return -18.0 * smoothstep(0.0, 240.0, -coastDist);
  }
  float r = length(p);
  float shoreEase = smoothstep(0.0, 290.0, coastDist);

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

  float walkW = 4.2;
  float roadX = step(dx, swx * 0.5 - walkW) * mix(gridFade, aveFade, isAveX);
  float roadZ = step(dz, swz * 0.5 - walkW) * mix(gridFade, aveFade, isAveZ);
  float coreRoad = max(roadX, roadZ) * smoothstep(8.0, 26.0, coastDist);

  // 2. Road-Aligned Curvilinear Trapezoid Blocks, Dense Suburban Streets & Parallel House Lots
  float dryMask = smoothstep(16.0, 58.0, coastDist) * (1.0 - slopeSteep);
  float blockH = fract(sin(rw.cellU * 12.9898 + rw.cellV * 78.233 + uTerrainSeed.x * 3.1) * 43758.5453);
  float blockH2 = fract(blockH * 13.71 + rw.cellV * 0.37);

  // Major radial highways & curved collector roads extend far across suburbs & countryside
  float hwyReach = 1.0 - smoothstep(uSuburbSpan * 1.08, uSuburbSpan * 1.62, rDist);
  float artRoad = (1.0 - smoothstep(8.2, 11.2, rw.dArt)) * dryMask * hwyReach * (1.0 - gridFade * 0.75);
  float ringRoad = (1.0 - smoothstep(5.4, 7.8, rw.dRing)) * dryMask * (1.0 - smoothstep(uSuburbSpan * 0.95, uSuburbSpan * 1.40, rDist)) * (1.0 - gridFade * 0.85);

  // Suburban sprawl stretches far across uSuburbSpan and surges outward along major radial roads!
  float subSpanEff = uSuburbSpan * (0.86 + 0.34 * corrMask);
  float subBelt = (1.0 - gridFade)
    * (1.0 - smoothstep(subSpanEff * 0.72, subSpanEff * 1.14, rDist))
    * dryMask;
  float subPatch = smoothstep(0.24, 0.52, fbm(p * 0.00085 + vec2(-4.2, 8.7)) + corrMask * 0.28);
  float subZone = clamp(subBelt * (0.48 + 0.52 * subPatch), 0.0, 1.0);

  // Internal parallel residential streets inside each road-bounded trapezoid block
  float nLanes = 2.0 + floor(blockH2 * 3.0); // 2..4 parallel streets per trapezoid block
  float orientAlongRing = step(0.42, blockH);
  float stCoord = orientAlongRing > 0.5 ? rw.fv * nLanes : rw.fu * nLanes;
  float stSpanM = orientAlongRing > 0.5 ? (380.0 / nLanes) : (rw.spanU / nLanes);
  float stFrac = fract(stCoord);
  float dLocalSt = min(stFrac, 1.0 - stFrac) * stSpanM;
  float localRoad = (1.0 - smoothstep(3.8, 5.6, dLocalSt)) * subZone * step(10.0, min(rw.dArt, rw.dRing));

  float subRoad = clamp(max(max(artRoad, ringRoad), localRoad), 0.0, 1.0);
  float road = max(coreRoad, subRoad * 0.94);

  float walkBandX = step(swx * 0.5 - walkW, dx) * step(dx, swx * 0.5 + 1.2) * (1.0 - roadZ) * mix(gridFade, aveFade, isAveX);
  float walkBandZ = step(swz * 0.5 - walkW, dz) * step(dz, swz * 0.5 + 1.2) * (1.0 - roadX) * mix(gridFade, aveFade, isAveZ);
  float subWalk = (1.0 - smoothstep(5.4, 7.6, min(min(rw.dArt - 3.6, rw.dRing - 1.2), dLocalSt))) * subZone * (1.0 - subRoad);
  float sidewalk = clamp(max(max(walkBandX, walkBandZ) * smoothstep(10.0, 28.0, coastDist), subWalk * 0.65), 0.0, 1.0);

  vec3 walkCol = mix(uGBlock, uGStreet, 0.35) + uGLine * 0.05;
  vec2 paver = abs(fract(p / 3.6) - 0.5);
  float joint = 1.0 - smoothstep(0.0, 0.06, min(paver.x, paver.y));
  walkCol *= 1.0 - joint * 0.14;

  // Road-aligned trapezoidal & rectangular house lots inside each residential block
  float lotAlong = orientAlongRing > 0.5 ? rw.fu * max(6.0, floor(rw.spanU / 26.0)) : rw.fv * 14.0;
  float lotSkew = (fract(blockH * 19.3) - 0.5) * 0.28;
  float lotIdx = floor(lotAlong + (stFrac - 0.5) * lotSkew);
  float lotF = fract(lotAlong + (stFrac - 0.5) * lotSkew);
  float lotSpanM = orientAlongRing > 0.5 ? (rw.spanU / max(6.0, floor(rw.spanU / 26.0))) : (380.0 / 14.0);
  float dLotSide = min(lotF, 1.0 - lotF) * lotSpanM;
  float dBackFence = abs(stFrac - 0.5) * stSpanM;
  float lotEdgeM = min(dLotSide, dBackFence);
  float lotHash = fract(sin(lotIdx * 17.13 + floor(stCoord) * 41.7 + blockH * 97.3) * 43758.5453);

  float lotHedge = (1.0 - smoothstep(0.65, 1.85, lotEdgeM)) * subZone * (1.0 - subRoad) * step(6.5, dLocalSt);
  vec3 lushHint = mix(uGBlock, vec3(0.11, 0.20, 0.11) + uGBlock * 0.55, 0.48);
  vec3 yardTint = mix(uGBlock * 0.90, lushHint * 1.15, lotHash);
  vec3 col = mix(uGBlock, yardTint, subZone * 0.85);

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

  // Subtle warm porch / driveway glints along suburban residential lots
  float subPorch = step(0.74, lotHash) * smoothstep(3.0, 9.0, lotEdgeM) * smoothstep(6.0, 14.0, dLocalSt) * subZone * (1.0 - subRoad);
  col += uPoolCol * subPorch * max(uLightK, 0.12) * 0.34;

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

  // 5. Coastal Sandy Beach / Rocky Waterfront Apron along Ocean & Lake Shores
  if (uWaterMode > 0.5 && uWaterMode < 3.5 && coastDist < 68.0) {
    float beachBand = (1.0 - smoothstep(6.0, 62.0, max(coastDist, 0.0))) * (1.0 - gridFade * 0.75);
    vec3 sandShore = mix(uGBlock + vec3(0.22, 0.19, 0.13), vec3(0.46, 0.40, 0.30) + uFogCol * 0.2, 0.58);
    float wetTide = 1.0 - smoothstep(-4.0, 14.0, coastDist);
    sandShore *= mix(1.0, 0.58, wetTide);
    col = mix(col, sandShore, beachBand * 0.82);
  }

  // Centre lines, multi-lane dashes on core avenues, kerbs & intersection zebra crosswalks
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
  float line = max(max(max(centerX, centerZ), subCenter), max(laneDashX, laneDashZ) * 0.75);

  float xingOnX = step(swz * 0.5 - walkW, dz) * step(dz, swz * 0.5 + 3.2) * roadX * step(0.42, fract(p.x / 2.6));
  float xingOnZ = step(swx * 0.5 - walkW, dx) * step(dx, swx * 0.5 + 3.2) * roadZ * step(0.42, fract(p.y / 2.6));
  float crosswalk = max(xingOnX, xingOnZ) * gridFade;

  float curb = max(
    (1.0 - smoothstep(0.0, 0.95, abs(dx - (swx * 0.5 - walkW)))) * (1.0 - roadZ) * mix(gridFade, aveFade, isAveX),
    (1.0 - smoothstep(0.0, 0.95, abs(dz - (swz * 0.5 - walkW)))) * (1.0 - roadX) * mix(gridFade, aveFade, isAveZ)
  );
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
        float motif = 0.0;
        if (mode < 0.30) {
          // Oversized Hero Linear-A/B + Synth Calligraphic Banner + scrolling bottom ticker
          float bigGlyph = evalSynthGlyph(vec2(fract(uvS.x * 2.0), clamp((uvS.y - 0.24) / 0.68, 0.0, 1.0)), pHash + floor(uvS.x * 2.0) * 0.31, uGlyphStyle, animT, 0.052) * step(0.24, uvS.y);
          float ticker = evalGlyphLine(vec2(uvS.x, uvS.y / 0.20), 9.0, animT * 0.85, pHash, uGlyphStyle, animT) * step(uvS.y, 0.20);
          motif = clamp(bigGlyph + ticker * 0.9, 0.0, 1.0);
        } else if (mode < 0.60) {
          // Vertical Skyscraper Glyph Cascade (streaming Linear-Synth columns)
          float colIdx = floor(uvS.x * 4.0);
          vec2 vCell = vec2(fract(uvS.x * 4.0), fract(uvS.y * 5.0 + animT * (0.28 + 0.15 * fract(colIdx * 0.37))));
          float cSeed = hash12(vec2(colIdx, floor(uvS.y * 5.0 + animT * (0.28 + 0.15 * fract(colIdx * 0.37))) + pHash * 17.0));
          motif = evalSynthGlyph(vCell, cSeed, uGlyphStyle, animT, 0.058) * step(0.22, fract(pHash * 5.3 + colIdx * 0.29));
        } else if (mode < 0.82) {
          // Cyber-sun horizon disc + Linear-B subtitle strip
          float sunR = length((uvS - vec2(0.5, 0.60)) * vec2(1.3, 1.0));
          float sunM = (1.0 - smoothstep(0.22, 0.26, sunR)) * step(0.18, fract(uvS.y * 9.0 - animT * 0.2));
          float sub = evalGlyphLine(vec2(uvS.x, (uvS.y - 0.06) / 0.18), 7.0, -animT * 0.55, pHash + 2.1, uGlyphStyle, animT) * step(0.06, uvS.y) * step(uvS.y, 0.24);
          motif = clamp(sunM + sub, 0.0, 1.0);
        } else {
          // Kinetic harmonic waveform + corner sigil badge
          float wave = smoothstep(0.08, 0.0, abs(uvS.y - 0.56 - 0.20 * sin(uvS.x * 6.28 + animT * 1.4 + pHash * 9.0)));
          float badge = evalSynthGlyph((uvS - vec2(0.68, 0.08)) / 0.26, pHash * 3.1, uGlyphStyle, animT, 0.06) * step(0.68, uvS.x) * step(uvS.y, 0.34);
          motif = clamp(wave + badge, 0.0, 1.0);
        }
        vec3 adBg = mix(base * 0.32, styleBillColor(uBillB) * 0.18, 0.52);
        vec3 adFg = styleBillColor(mix(uBillA, uBillB, fract(pHash * 4.1 + motif * 0.25)));
        vec3 screenRgb = mix(adBg, saturate3(adFg, uSat), motif);
        float scan = 0.86 + 0.14 * sin(wy * 6.0 + animT * 6.0);
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
      // Suburban residential house / cottage windows: circadian wake/sleep schedule + live switching!
      vec2 hg = uvm / vec2(4.2, 3.2);
      vec2 hgid = floor(hg);
      vec2 hf = fract(hg);
      float hWin = step(0.26, hf.x) * step(hf.x, 0.74) * step(0.30, hf.y) * step(hf.y, 0.76);
      float hr = hash12(hgid + vSeed * 31.7);
      // Circadian residential activity: early-morning kitchens (5:00-7:30) + cosy dusk-to-midnight living rooms (17:15-23:45)
      float domMorning = smoothstep(4.6 + hr * 1.1, 5.5 + hr * 0.8, uDayPhase) * (1.0 - smoothstep(7.0, 8.2, uDayPhase));
      float domEvening = smoothstep(16.7 + hr * 1.3, 18.0 + hr * 1.0, uDayPhase) * (1.0 - smoothstep(22.2 + hr * 1.6, 23.9, uDayPhase));
      float domLate = (uDayPhase < 1.6 ? (1.0 - smoothstep(0.2, 1.5, uDayPhase)) * step(0.65, hr) : 0.0);
      float liveToggle = hash12(hgid + vec2(floor(uTime * (0.07 + hr * 0.11) + vSeed * 19.0), 4.7));
      float domOcc = clamp(max(max(domMorning * 0.65, domEvening * 1.15), domLate * 0.55), 0.08, 1.0);
      float roomOn = step(mix(hr, liveToggle, 0.36), clamp(uWinDensity * 0.92 * domOcc + 0.14 * domEvening, 0.0, 0.96));
      float tvShimmer = (hr > 0.72) ? (0.82 + 0.18 * sin(uTime * 5.4 + hr * 47.0)) : 1.0;
      vec3 hCol = saturate3(mix(uWinA, mix(uPoolCol, uWinC, step(0.76, hr) * 0.45), 0.45), uSat);
      col += hCol * hWin * roomOn * (uWinGlow * 0.82 + 0.25 * domMorning) * tvShimmer;
      // Daytime sunlit glass reflection on suburban house panes
      float dayRefl = clamp(1.0 - uLightK, 0.0, 1.0) * hWin * (1.0 - roomOn * 0.6);
      col = mix(col, mix(uAmb, uSunCol, 0.35) * 0.72, dayRefl * 0.42 * (1.0 - uFlat));
    } else if (wy < 15.8 || isStreetPod > 0.5) {
      float podH = 5.4;
      float bayW = 5.6;
      float bx = fract(uvm.x / bayW);
      float pilaster = 1.0 - step(0.14, bx) * step(bx, 0.86);
      if (wy < podH) {
        float glass = (1.0 - pilaster) * step(0.35, wy) * step(wy, podH - 0.55);
        float shopId = floor(uvm.x / bayW);
        float shHash = hash12(vec2(shopId, floor(vSeed * 97.0)));
        // Late-night cafes stay open past midnight while boutiques dim after 22:30
        float shopSched = 1.0 - 0.55 * smoothstep(22.4 + shHash * 1.4, 23.9, uDayPhase) * step(shHash, 0.65)
          - 0.55 * (1.0 - smoothstep(1.5, 6.8, uDayPhase)) * step(shHash, 0.65);
        float openShop = step(0.18, shHash * shopSched + uWinDensity * 0.45);
        vec3 shopCol = mix(uPoolCol, uWinA, fract(shHash * 3.7));
        shopCol = mix(shopCol, styleBillColor(uBillA), step(0.82, shHash) * 0.55);
        shopCol = saturate3(shopCol, uSat);
        float interiorBand = 0.65 + 0.35 * step(0.45, fract(wy * 0.7 + shHash * 4.0));
        col *= 1.0 - pilaster * 0.24;
        col = mix(col, shopCol * (0.45 + uWinGlow * 0.62 + uLightK * 0.45) * interiorBand * shopSched, glass * openShop * 0.88);
        float fascia = (1.0 - pilaster * 0.7) * step(podH - 0.55, wy) * step(wy, podH - 0.08);
        col += saturate3(styleBillColor(mix(uWinA, uBillA, 0.35)), uSat) * fascia * step(0.35, shHash) * (0.45 + uLightK * 0.6);
      } else {
        vec2 mg = vec2(uvm.x / bayW, (wy - podH) / 4.6);
        vec2 mgid = floor(mg);
        vec2 mf = fract(mg);
        float mWin = step(0.16, mf.x) * step(mf.x, 0.84) * step(0.22, mf.y) * step(mf.y, 0.80);
        float mr = hash12(mgid + vSeed * 23.1);
        float mToggle = hash12(mgid + vec2(floor(uTime * (0.09 + mr * 0.12) + vSeed * 13.0), 9.1));
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

      // 24-hour circadian building rhythm:
      // - Morning trading/office spin-up (06:15-08:30)
      // - Daylight reflective glass panes + Venetian blinds + bright interior bays (08:30-16:45)
      // - Staggered dusk floor-by-floor & room-by-room turn-on wave (16:45-19:30)
      // - Evening live suite switching + holo/screen shimmer (19:30-23:15)
      // - Late-night power-down leaving night-owl floors, server bands & penthouses lit (23:15-05:30)
      float bPhase = fract(vSeed * 5.71);
      float duskOn = smoothstep(16.4 + bPhase * 1.1 + flrHash * 1.0 + r1 * 0.7, 17.6 + bPhase * 1.1 + flrHash * 0.9, uDayPhase);
      float lateTaper = 1.0 - 0.58 * smoothstep(22.4 + flrHash * 1.5, 23.95, uDayPhase) * step(r1, 0.72);
      float weeHours = (uDayPhase < 5.6)
        ? mix(0.38 + 0.45 * step(0.76, flrHash), 0.78, smoothstep(4.8, 6.4, uDayPhase) * step(0.45, flrHash))
        : 1.0;
      float dayOffice = (uDayPhase >= 6.4 && uDayPhase < 16.8)
        ? (0.28 + 0.34 * step(0.66, flrHash))
        : 1.0;
      float circMul = (uDayPhase < 6.4) ? weeHours : ((uDayPhase < 16.8) ? dayOffice : (mix(0.34, 1.16, duskOn) * lateTaper));

      // Live real-time suite switching: rooms flick on and off organically every few seconds
      float swRate = 0.08 + fract(r1 * 13.7) * 0.16;
      float swSlot = floor(uTime * swRate + r1 * 43.0 + flrHash * 11.0);
      float rLive = hash12(gid + vec2(swSlot * 1.37, vSeed * 41.9));
      float effRand = mix(r1, rLive, 0.38);

      // Whole-floor office ribbon boost on active corporate floors
      float floorBand = step(0.78, flrHash) * 0.24 * duskOn;
      float effDens = clamp(dens * circMul + floorBand, 0.0, 0.95);
      float litWin = step(effRand, effDens) * win;

      // Subtle Venetian blinds & room depth partitioning inside lit windows
      float blinds = mix(1.0, 0.72 + 0.28 * step(0.38, fract(f.y * 5.0 + r1 * 3.0)), step(0.55, fract(r1 * 9.3)));
      float holoPulse = (r1 > 0.78)
        ? (0.78 + 0.22 * sin(uTime * (3.2 + fract(r1 * 7.1) * 4.0) + r1 * 60.0))
        : (0.90 + 0.10 * sin(uTime * 1.4 + r1 * 45.0));
      litWin *= blinds * holoPulse;

      float r2 = hash12(gid + vec2(vSeed * 37.7, 5.0));
      vec3 lookWin = uWinA;
      if (r2 > 0.55) lookWin = uWinB;
      if (r2 > 0.82) lookWin = uWinC;
      // Natural interior Kelvin variety (2700K warm tungsten, 3800K neutral, 5400K cool office)
      vec3 natWin = vec3(1.0, 0.82, 0.56);
      if (r2 > 0.45) natWin = vec3(1.0, 0.93, 0.82);
      if (r2 > 0.76) natWin = vec3(0.76, 0.88, 1.0);
      vec3 wc = mix(natWin, lookWin, clamp(0.22 + 0.78 * uTint, 0.0, 1.0));

      // Exterior glass express elevator shaft on tall towers: glowing cabs gliding smoothly up & down!
      float nCols = max(3.0, floor(vDims.x / bayW));
      float elevCol = floor((fract(vSeed * 11.3) - 0.5) * (nCols * 0.5));
      float isElevShaft = step(42.0, vDims.y) * step(abs(gid.x - elevCol), 0.45) * step(0.5, densMul);
      if (isElevShaft > 0.5 && win > 0.5) {
        float shaftTop = max(18.0, vDims.y * 0.46);
        float cabCycle = uTime * (0.14 + fract(vSeed * 3.7) * 0.14) + vSeed * 17.0;
        float cabTri = 1.0 - abs(fract(cabCycle) * 2.0 - 1.0);
        // Smooth S-curve acceleration/deceleration at bottom lobby & top sky-deck
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

      col += saturate3(wc, uSat) * litWin * (glow + 0.24 * dayOffice * (1.0 - uLightK));
      col *= mix(1.0, 0.86 + 0.14 * (1.0 - win), clamp(uWinGlow * 0.5, 0.0, 0.6));
    }
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
    float pulse = 0.88 + 0.12 * sin(uTime * 1.8 + wy * 0.045);
    vec3 em = saturate3(uCol, uSat) * (0.72 + uBandGlow * 0.95 * max(uLightK, 0.32)) * pulse;
    col = mix(col, em, 0.86);
  } else if (uRole > 2.5) {
    // Role 3: Panoramic illuminated sky-gallery / observation deck / atrium skylight
    float colSil = step(0.18, fract(uCoord / 3.4));
    float mull = step(0.14, fract(wy / 3.6));
    vec3 galCol = saturate3(mix(uWinA, uWinB, 0.32), uSat);
    float galK = (0.55 + uWinGlow * 0.82) * max(uLightK, 0.35);
    col = mix(col * 0.45, galCol * galK, (0.35 + 0.65 * colSil * mull));
  } else {
    // Roles 0 & 1: Monumental architectural facades (vertical walls + sloped pyramid/ziggurat faces)
    float densRole = (uRole > 0.5) ? 0.34 : 0.88;
    float absY = abs(ln.y);
    if (absY < 0.26) {
      // Vertical walls (cantilever wings, arches, spires, towers, arenas, theatres)
      float bayW = (uRole > 0.5) ? 5.8 : 4.2;
      float flrH = (uRole > 0.5) ? 5.0 : 3.8;
      vec2 g = vec2(uCoord / bayW, wy / flrH);
      vec2 gid = floor(g);
      vec2 f = fract(g);
      float mullion = 1.0 - step(0.14, f.x) * step(f.x, 0.86);
      col *= 1.0 - mullion * 0.14 * (1.0 - uFlat);

      float win = step(0.20, f.x) * step(f.x, 0.80) * step(0.24, f.y) * step(f.y, 0.78);
      // Every 8th floor on primary monumental structures carries a panoramic sky-lobby ribbon!
      float skyRibbon = (uRole < 0.5 && mod(gid.y, 8.0) < 0.5) ? 1.0 : 0.0;
      float r = hash12(gid + vec2(11.7, 5.3));
      float flrH2 = hash12(vec2(gid.y * 0.67, 17.3));
      float duskWave = smoothstep(16.5 + flrH2 * 1.1 + r * 0.6, 17.8 + flrH2 * 0.9, uDayPhase);
      float dayKeep = (uDayPhase >= 6.4 && uDayPhase < 16.8) ? (0.32 + 0.35 * skyRibbon) : 1.0;
      float lateDim = 1.0 - 0.45 * smoothstep(22.6 + flrH2 * 1.3, 23.95, uDayPhase) * (1.0 - skyRibbon);
      float schedMul = (uDayPhase < 16.8) ? dayKeep : (mix(0.36, 1.15, duskWave) * lateDim);
      float rSwitch = hash12(gid + vec2(floor(uTime * (0.09 + fract(r * 9.7) * 0.14) + r * 31.0), 6.1));
      float effR = mix(r, rSwitch, 0.35);
      float litOn = mix(step(effR, uWinDensity * densRole * schedMul), step(effR, min(0.94, (uWinDensity * 1.35 + 0.25) * schedMul)), skyRibbon) * win;
      litOn *= 0.88 + 0.12 * sin(uTime * 1.9 + r * 52.0);
      float rCol = hash12(gid + vec2(3.3, 19.1));
      vec3 wc = uWinA;
      if (rCol > 0.56) wc = uWinB;
      if (rCol > 0.86) wc = uWinC;
      // Daytime sky reflection on landmark glass bays
      float dayG = clamp(1.0 - uLightK * 0.85, 0.0, 1.0) * win * (1.0 - litOn * 0.7) * (1.0 - uFlat);
      col = mix(col, saturate3(mix(uAmbG, uAmb * 1.35, 0.65) + uSunCol * 0.18 * uSunK, uSat), dayG * 0.48);
      col += saturate3(wc, uSat) * litOn * uWinGlow * (0.85 + 0.30 * skyRibbon);
    } else if (absY < 0.86) {
      // Sloped monumental faces (Pyramids, Ziggurats, Buttresses, Geodesic Domes):
      // Carved stepped stone/alloy courses + recessed glowing horizontal terrace galleries!
      float course = fract(wy / 5.5);
      float blockJoint = step(0.08, fract(uCoord / 7.5 + floor(wy / 5.5) * 0.5));
      col *= 0.88 + 0.15 * smoothstep(0.0, 0.22, course) * blockJoint;

      vec2 sg = vec2(uCoord / 4.8, wy / 11.0);
      vec2 sgid = floor(sg);
      vec2 sf = fract(sg);
      // Horizontal recessed terrace slits along pyramid/dome courses
      float slit = step(0.16, sf.x) * step(sf.x, 0.84) * step(0.62, sf.y) * step(sf.y, 0.86);
      float sr = hash12(sgid + vec2(23.4, 9.1));
      float sSwitch = hash12(sgid + vec2(floor(uTime * (0.08 + fract(sr * 11.3) * 0.14) + sr * 29.0), 3.9));
      float sDusk = (uDayPhase >= 6.5 && uDayPhase < 16.6)
        ? 0.34
        : mix(0.42, 1.12, smoothstep(16.6 + fract(sr * 3.1), 17.9 + fract(sr * 3.1), max(uDayPhase, 17.5 * step(uDayPhase, 6.5))));
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

  // Derive a per-instance automotive coat from vHullCol hash so vehicles vary naturally!
  float coatId = fract(dot(vHullCol, vec3(17.31, 43.17, 29.53)));
  vec3 autoPaint = vec3(0.76, 0.80, 0.85); // brushed DeLorean stainless silver
  if (coatId > 0.18) autoPaint = vec3(0.92, 0.70, 0.12); // Fifth Element cab gold-yellow
  if (coatId > 0.34) autoPaint = vec3(0.16, 0.24, 0.38); // midnight sapphire
  if (coatId > 0.50) autoPaint = vec3(0.88, 0.90, 0.93); // pearl white
  if (coatId > 0.64) autoPaint = vec3(0.24, 0.27, 0.31); // titanium gunmetal
  if (coatId > 0.78) autoPaint = vec3(0.74, 0.16, 0.20); // crimson metallic
  if (coatId > 0.90) autoPaint = vec3(0.18, 0.42, 0.36); // racing emerald
  vec3 effHull = mix(autoPaint, vHullCol, clamp(uTint, 0.0, 1.0));

  vec3 col;
  if (vRole < 0.5) {
    // Role 0: Painted / brushed-alloy primary vehicle hull
    col = mix(vPartTint, effHull, 0.76) * shade + vec3(0.08) * pow(sunD, 6.0) * (1.0 - uLightK * 0.55);
  } else if (vRole < 1.5) {
    // Role 1: Dark alloy trim, louvers, hover-pontoons & undercarriage
    col = mix(vPartTint, effHull * 0.38, 0.28) * (0.55 + 0.45 * shade);
  } else if (vRole < 2.5) {
    // Role 2: Tinted cockpit canopy glass + warm interior instrument glint
    col = vPartTint * (0.55 + 0.65 * skyHemi) + effHull * 0.14 * uLightK;
  } else if (vRole < 3.5) {
    // Role 3: FRONT HEADLIGHTS (+X) — crisp warm-white / ice-xenon (untinted by hull!)
    vec3 headRgb = vPartTint * (1.05 + uLightK * 1.15);
    float lum = dot(headRgb, vec3(0.299, 0.587, 0.114));
    col = mix(headRgb, vec3(lum), clamp(uBillMono, 0.0, 1.0));
  } else if (vRole < 4.5) {
    // Role 4: REAR TAILLIGHTS (-X) — vivid crimson-ruby brake & thruster bar (untinted by hull!)
    vec3 tailRgb = vPartTint * (1.05 + uLightK * 1.25);
    float lum = dot(tailRgb, vec3(0.299, 0.587, 0.114));
    col = mix(tailRgb, vec3(lum * 0.85), clamp(uBillMono, 0.0, 1.0));
  } else {
    // Role 5: Illuminated taxi roof crest / hover-pad / train passenger window strip
    vec3 accRgb = mix(vPartTint, vHullCol * 0.65 + vPartTint * 0.65, 0.35) * (0.88 + uLightK * 0.95);
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
  vTwinkle = 0.55 + 0.45 * sin(uTime * 2.6 + aPhase * 6.28318);
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
uniform float uSteady;
varying float vTwinkle;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float core = pow(1.0 - r, 2.2);
  float tw = mix(vTwinkle, 1.0, uSteady);
  gl_FragColor = vec4(uBeaconCol * (0.9 + core * 1.4), core * tw * uLightK);
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
varying vec3 vColor;
varying vec2 vUv;
void main() {
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float along = pow(vUv.x, 1.6);
  float a = across * along * (0.45 + 0.55 * uLightK);
  gl_FragColor = vec4(vColor * (0.8 + along * 0.9), a);
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
  float hover = sin(uTime * 1.45 + aCurveB.w * 25.0) * 0.14;

  if (mode > 0.5) {
    // Street-grid route: flat Street 1 -> wide sweeping G1 fillet turn with natural turn-deceleration -> flat Street 2!
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
    // Stretch parameter dwell across the turn (2.35x vs 1.57x) so vehicles smoothly decelerate into curves!
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
      // Smooth Hermite S-curve steps cleanly between N-S street elevation y1 and perpendicular E-W street elevation y2!
      float hRamp = uTurn * uTurn * (3.0 - 2.0 * uTurn);
      py = mix(aCurveA.z, aCurveB.z, hRamp);
    } else {
      xz = mix(cExit, pEnd, (arcS - s1 - sTurn) / s2);
      py = aCurveB.z;
    }
    px = xz.x;
    pz = xz.y;
  } else if (mode < -0.5) {
    // Straight horizontal street run (flat when y1 == y2, or occasional smooth S-curve elevation switch between decks!)
    vec2 xz = mix(aCurveA.xy, aCurveC.xy, tt);
    px = xz.x;
    pz = xz.y;
    float rampU = smoothstep(0.28, 0.72, tt);
    py = mix(aCurveA.z, aCurveB.z, rampU);
  } else {
    // Horizontal orbital ring arc (flat constant deck height aCurveA.z)
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

  float rawT = aCurveB.w + uTime * aCurveA.w;
  float tt = fract(rawT);
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
uniform float uBillMono;
uniform float uTint;
varying vec3 vColor;
varying vec3 vLocalP;
varying float vFade;
varying float vModel;
void main() {
  if (vFade < 0.02) discard;
  // Distinct sci-fi vehicle lighting:
  // +X Front = twin warm-white / ice-xenon headlights
  // -X Rear  = vivid crimson-ruby taillight bar & twin brake pods
  float nose = smoothstep(0.26, 0.48, vLocalP.x);
  float tail = smoothstep(-0.24, -0.48, vLocalP.x);
  float twinLamp = smoothstep(0.14, 0.36, abs(vLocalP.z));
  float lightBandY = 1.0 - smoothstep(0.12, 0.42, abs(vLocalP.y + 0.06));
  float cabSign = (vModel >= 0.38 && vModel < 0.72)
    ? (step(abs(vLocalP.x - 0.06), 0.14) * smoothstep(0.32, 0.48, vLocalP.y) * step(abs(vLocalP.z), 0.24))
    : 0.0;

  // Natural per-vehicle paint diversity blended with look tint uTint
  float coatId = fract(vModel * 7.91 + dot(vColor, vec3(5.3, 11.7, 3.1)));
  vec3 natCar = vec3(0.68, 0.73, 0.79);
  if (coatId > 0.20) natCar = vec3(0.92, 0.68, 0.12);
  if (coatId > 0.40) natCar = vec3(0.18, 0.27, 0.42);
  if (coatId > 0.60) natCar = vec3(0.84, 0.87, 0.90);
  if (coatId > 0.78) natCar = vec3(0.72, 0.17, 0.21);
  vec3 carTint = mix(natCar, vColor, clamp(uTint, 0.0, 1.0));

  // Brushed metallic / painted hull + dark tinted cockpit glass window band
  float canopy = step(-0.18, vLocalP.x) * step(vLocalP.x, 0.24) * smoothstep(0.08, 0.32, vLocalP.y);
  vec3 hullCol = mix(vec3(0.09, 0.11, 0.15) + carTint * 0.42, vec3(0.05, 0.08, 0.13), canopy * 0.75);

  vec3 headRaw = mix(vec3(1.0, 0.96, 0.82), vec3(0.84, 0.96, 1.0), step(0.65, vModel)) * (1.05 + uLightK * 1.15);
  vec3 tailRaw = vec3(1.0, 0.10, 0.15) * (1.08 + uLightK * 1.25);
  vec3 taxiRaw = vec3(1.0, 0.76, 0.16) * (0.95 + uLightK * 0.95);

  vec3 col = hullCol;
  col = mix(col, headRaw, nose * (0.35 + 0.65 * twinLamp) * (0.55 + 0.45 * lightBandY));
  col = mix(col, tailRaw, tail * (0.55 + 0.45 * twinLamp) * (0.65 + 0.35 * lightBandY));
  col = mix(col, taxiRaw, cabSign * 0.88);

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), clamp(uBillMono, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---------------------------------------------------------- searchlights */

export const BEAM_VERT = /* glsl */ `
varying float vT;
varying float vW;
${GLSL_CURVE}
void main() {
  vT = uv.y;
  vW = uv.x;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  wp.xyz = bendWorld(wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const BEAM_FRAG = /* glsl */ `
uniform vec3 uBeamCol;
uniform float uBeamK;
uniform float uTime;
uniform float uLightK;
varying float vT;
varying float vW;
${GLSL_NOISE}

void main() {
  float core = sin(3.14159 * clamp(vW, 0.0, 1.0));
  float along = pow(max(1.0 - vT, 0.0), 1.35);
  float wobble = 0.72 + 0.28 * vnoise(vec2(vT * 5.0, uTime * 0.18));
  float a = core * along * wobble * uBeamK * max(uLightK, 0.12);
  gl_FragColor = vec4(uBeamCol * (0.6 + 0.8 * along), a);
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
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.15, 1.0, r);
  a *= a * uPoolK * max(uLightK, 0.15);
  gl_FragColor = vec4(uPoolCol * (0.5 + 0.5 * a), a);
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
varying vec3 vFlat;
varying vec3 vWorld;
varying float vAnalytical;
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_CURVE}
${GLSL_TERRAIN}

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

  vec3 vdir = normalize(vWorld - cameraPosition);
  float ca = cos(uCoastAngle);
  float sa = sin(uCoastAngle);
  vec2 shoreDir = vec2(-ca, -sa); // inward from open sea toward shore!
  vec2 p = xz * 0.012;
  // Wind-driven swells drift shoreward (+shoreDir * uTime)
  float w1 = fbm(p - shoreDir * (uTime * 0.065) + vec2(uTime * 0.018, -uTime * 0.014));
  float w2 = fbm(p * 2.7 - shoreDir * (uTime * 0.095) - vec2(uTime * 0.024, uTime * 0.031));
  float wave = clamp(w1 * 0.68 + w2 * 0.48, 0.0, 1.0);
  vec3 col = mix(uWaterDeep, uWaterShallow, wave * 0.65);

  // Shallow turquoise shoal + shoreward-propagating breaking surf foam along coastal & lake shores!
  if (vAnalytical > 0.5 && uWaterMode > 0.5 && uWaterMode < 3.5) {
    float seaDist = max(0.0, -cDist);
    float shoal = 1.0 - smoothstep(0.0, 155.0, seaDist);
    col = mix(col, uWaterShallow * 1.26, shoal * 0.54);
    // + uTime advances phase inward toward seaDist = 0 (waves roll ONTO shore, never backward out to sea!)
    float shoalK = pow(seaDist, 0.86);
    float surfWave = sin(shoalK * 0.23 + uTime * 2.15 + w1 * 3.8);
    float surfWave2 = sin(shoalK * 0.42 + uTime * 3.05 - w2 * 3.1);
    float surfBand = (1.0 - smoothstep(4.0, 66.0, seaDist)) * smoothstep(0.0, 2.2, seaDist);
    float surfFoam = surfBand * smoothstep(0.40, 0.93, surfWave * 0.72 + surfWave2 * 0.28);
    float shoreLip = (1.0 - smoothstep(0.0, 4.8, seaDist)) * (0.65 + 0.35 * sin(uTime * 2.15 + w1 * 5.0));
    vec3 foamCol = mix(vec3(0.86, 0.93, 0.99), uSkySunCol, 0.32);
    col = mix(col, foamCol, clamp(surfFoam * 0.62 + shoreLip * 0.52, 0.0, 0.86));
  } else {
    // Polygon harbors, winding rivers & park lagoons: gentle current ripples without ocean surf bands
    float rip = smoothstep(0.62, 0.92, wave) * 0.18;
    col += uWaterShallow * rip;
  }

  vec3 sd = normalize(uSunDir);
  vec3 waveN = bendNormal(xz, normalize(vec3((w1 - w2) * 2.0, 1.0, (w2 - w1) * 2.0)));
  float facing = pow(max(dot(waveN, sd), 0.0), 24.0);
  float glint = pow(smoothstep(0.55, 0.95, w2), 5.0);
  col += uSkySunCol * (facing * 1.3 + glint * 0.55);

  // Subtle waterfront city-light shimmer near the urban core at night
  float nearCity = 1.0 - smoothstep(uCitySpan * 0.5, uCitySpan * 2.1, length(xz));
  col += uPoolCol * nearCity * wave * max(uLightK, 0.0) * 0.22;

  vec3 upN = bendNormal(xz, vec3(0.0, 1.0, 0.0));
  float fres = pow(1.0 - max(dot(-vdir, upN), 0.0), 3.0);
  col = mix(col, uSunFogCol, fres * 0.55);

  float dist = length(vWorld - cameraPosition);
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
varying vec2 vUv;
varying float vSeed;
void main() {
  float core = sin(3.14159 * clamp(vUv.y, 0.0, 1.0));
  float brightness = max(uLightK, 0.28);
  vec3 col;
  float alpha;
  if (uTreeCyber < 0.5) {
    // Organic park mode: warm festoon string-light bulbs along a subtle cable
    float bulbs = pow(0.5 + 0.5 * cos(vUv.x * 44.0 + vSeed * 6.28), 8.0);
    float twinkle = 0.85 + 0.15 * sin(uTime * 2.4 + vUv.x * 19.0 + vSeed * 40.0);
    col = mix(uLinkColA * 0.45, uLinkColB * 1.45, bulbs) * twinkle * (0.55 + 0.75 * brightness);
    alpha = core * (0.28 + 0.72 * bulbs);
  } else {
    // Cyber / Artificial mode: bioluminescent fiber-optic filament with traveling neural pulses
    float pulse1 = pow(0.5 + 0.5 * sin(vUv.x * 12.56 - uTime * 2.8 + vSeed * 31.4), 5.0);
    float pulse2 = pow(0.5 + 0.5 * sin(vUv.x * 18.84 + uTime * 1.9 - vSeed * 17.1), 6.0);
    float energy = clamp(0.32 + pulse1 * 0.85 + pulse2 * 0.55, 0.0, 1.5);
    col = mix(uLinkColA, uLinkColB, clamp(pulse1 + pulse2 * 0.5, 0.0, 1.0)) * energy * (0.65 + 0.85 * brightness);
    alpha = core * clamp(0.38 + (pulse1 + pulse2) * 0.55, 0.0, 0.96);
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

  if (layoutId < 0.18) {
    // 1. Classic Shopfront / Rooftop Wordmark: Bold Linear-A/B + Synth Syllabogram Headline + scrolling sub-ticker
    float heroLine = evalGlyphLine(vec2(vUv.x * 0.90 + 0.05, clamp((vUv.y - 0.30) / 0.56, 0.0, 1.0)), 6.0, floor(animT * 0.12) * 0.0, vSeed * 19.3, uGlyphStyle, animT) * step(0.30, vUv.y) * step(vUv.y, 0.86);
    float subTick = evalGlyphLine(vec2(vUv.x, clamp((vUv.y - 0.08) / 0.16, 0.0, 1.0)), 13.0, animT * 0.95, vSeed * 41.1, uGlyphStyle, animT) * step(0.08, vUv.y) * step(vUv.y, 0.24);
    float rule = smoothstep(0.015, 0.0, abs(vUv.y - 0.27)) * step(0.06, vUv.x) * step(vUv.x, 0.94);
    col = mix(darkBg, uBillA * 1.12, heroLine);
    col = mix(col, uBillB, clamp(subTick * 0.92 + rule * 0.65, 0.0, 1.0));
  } else if (layoutId < 0.34) {
    // 2. Vertical Skyscraper Blade: Twin columns of streaming Minoan-Synth sigils
    float cIdx = floor(vUv.x * 2.0);
    vec2 cell = vec2(fract(vUv.x * 2.0) * 0.84 + 0.08, fract(vUv.y * 6.0 - animT * (0.24 - 0.48 * cIdx)));
    float rowIdx = floor(vUv.y * 6.0 - animT * (0.24 - 0.48 * cIdx));
    float chS = hash12(vec2(cIdx * 7.1 + vSeed * 31.0, rowIdx * 1.9));
    float g = evalSynthGlyph(cell, chS, uGlyphStyle, animT, 0.060) * step(0.16, chS);
    float divider = smoothstep(0.018, 0.0, abs(vUv.x - 0.5)) * 0.45;
    col = mix(darkBg, mix(uBillA, uBillB, cIdx), g * 0.96);
    col += mix(uBillA, uBillB, 0.5) * divider;
  } else if (layoutId < 0.50) {
    // 3. Cyber-Sun Horizon Emblem + Linear-B Calligraphic Overlays
    vec2 dc = (vUv - vec2(0.34, 0.55)) * vec2(1.45, 1.0);
    float sunDisc = (1.0 - smoothstep(0.22, 0.25, length(dc))) * step(0.22, fract(vUv.y * 11.0 - animT * 0.25));
    float rightScript = evalGlyphLine(vec2(clamp((vUv.x - 0.52) / 0.42, 0.0, 1.0), clamp((vUv.y - 0.42) / 0.38, 0.0, 1.0)), 4.0, 0.0, vSeed * 23.0, uGlyphStyle, animT) * step(0.52, vUv.x) * step(0.42, vUv.y) * step(vUv.y, 0.80);
    float botScript = evalGlyphLine(vec2(vUv.x, clamp((vUv.y - 0.10) / 0.18, 0.0, 1.0)), 11.0, -animT * 0.7, vSeed * 11.0, uGlyphStyle, animT) * step(0.10, vUv.y) * step(vUv.y, 0.28);
    col = mix(darkBg, mix(uBillB, uBillA, clamp(vUv.y * 1.2, 0.0, 1.0)), sunDisc);
    col = mix(col, uBillA * 1.08, rightScript);
    col = mix(col, uBillB, botScript * 0.88);
  } else if (layoutId < 0.68) {
    // 4. Diagonal Kinetic Slash + Giant Morphing Hero Crest + Side Glyph Column
    float sweep = fract(animT * 0.16 + vSeed);
    float slash = smoothstep(0.09, 0.01, abs((vUv.x - 0.36) * 0.85 + (vUv.y - 0.5) * 0.55 - (sweep - 0.5) * 0.18));
    float crest = evalSynthGlyph(vec2(clamp((vUv.x - 0.10) / 0.44, 0.0, 1.0), clamp((vUv.y - 0.18) / 0.64, 0.0, 1.0)), vSeed * 7.7, uGlyphStyle, animT, 0.050) * step(0.10, vUv.x) * step(vUv.x, 0.54);
    float vCol = evalSynthGlyph(vec2(clamp((vUv.x - 0.68) / 0.22, 0.0, 1.0), fract(vUv.y * 5.0 - animT * 0.35)), hash12(vec2(floor(vUv.y * 5.0 - animT * 0.35), vSeed * 29.0)), uGlyphStyle, animT, 0.062) * step(0.68, vUv.x) * step(vUv.x, 0.90);
    col = mix(darkBg, uBillB * 0.65, slash * 0.75);
    col = mix(col, uBillA * 1.15, crest);
    col = mix(col, uBillB * 1.08, vCol);
  } else if (layoutId < 0.84) {
    // 5. Harmonic Telemetry Ribbon + Dual Scrolling Linear-Synth Tickers
    float wY = 0.56 + 0.18 * sin(vUv.x * 6.283 + animT * (1.1 + vSeed) + vSeed * 12.0);
    float ribbon = smoothstep(0.075, 0.01, abs(vUv.y - wY));
    float topLine = evalGlyphLine(vec2(vUv.x, clamp((vUv.y - 0.78) / 0.15, 0.0, 1.0)), 10.0, -animT * 0.6, vSeed * 13.0, uGlyphStyle, animT) * step(0.78, vUv.y) * step(vUv.y, 0.93);
    float botLine = evalGlyphLine(vec2(vUv.x, clamp((vUv.y - 0.08) / 0.16, 0.0, 1.0)), 12.0, animT * 0.85, vSeed * 37.0, uGlyphStyle, animT) * step(0.08, vUv.y) * step(vUv.y, 0.24);
    col = mix(darkBg, uBillB, ribbon * 0.92);
    col = mix(col, uBillA, clamp(topLine + botLine, 0.0, 1.0));
  } else {
    // 6. Full-Matrix Ancient-Futuristic Tablet: 3-row living Linear-A/B + Synth Proclamation
    float row = floor(clamp((vUv.y - 0.10) / 0.80, 0.0, 0.999) * 3.0);
    float rowY = fract(clamp((vUv.y - 0.10) / 0.80, 0.0, 0.999) * 3.0);
    float dirSgn = (mod(row, 2.0) < 0.5) ? 1.0 : -1.0;
    float tablet = evalGlyphLine(vec2(vUv.x * 0.90 + 0.05, rowY), 7.0 + row, animT * 0.32 * dirSgn, vSeed * 17.0 + row * 5.3, uGlyphStyle, animT) * step(0.10, vUv.y) * step(vUv.y, 0.90);
    vec3 rowTint = mix(uBillA, uBillB, row * 0.45);
    col = mix(darkBg, rowTint * 1.1, tablet);
  }

  // Thin inner neon trim line
  float innerRim = smoothstep(0.022, 0.0, abs(max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) - 0.455));
  col += mix(uBillA, uBillB, 0.5) * innerRim * 0.35;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 mono = mix(uBillB * 0.30, uBillA * 0.95, clamp(lum, 0.0, 1.2));
  col = mix(col, mono, clamp(uBillMono, 0.0, 1.0));
  col = saturate3(col, uSat * (1.0 - 0.85 * clamp(uBillMono, 0.0, 1.0)));

  col *= 0.88 + 0.12 * sin(vUv.y * 85.0 + animT * 2.5);
  float k = clamp(uBillK * max(uLightK, 0.25) * min(uSignAmt, 1.65), 0.0, 1.45) * (0.70 + 0.16 * sin(animT * 1.3 + vSeed * 20.0));
  gl_FragColor = vec4(col * (0.28 + k * 0.74) * bezel, 1.0);
}
`;

/* -------------------------------------------------------------- weather */

export const WEATHER_VERT = /* glsl */ `
attribute float aOff;
attribute float aSpeed;
attribute float aSway;
uniform float uTime;
uniform float uFallH;
uniform float uSwayAmp;
uniform float uWindX;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  // Subtract uTime * aSpeed so positive speeds fall DOWNWARD (-Y) toward the street!
  float fallY = mod(wp.y + aOff - uTime * aSpeed, uFallH) - uFallH * 0.5;
  wp.y = fallY;
  wp.x += (fallY / max(uFallH, 1.0)) * uWindX + sin(uTime * aSway + aOff * 0.7) * uSwayAmp;
  wp.z += cos(uTime * aSway * 0.8 + aOff * 1.3) * uSwayAmp;
  wp = modelMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const WEATHER_FRAG = /* glsl */ `
uniform vec3 uWeatherCol;
uniform float uWeatherK;
varying vec2 vUv;
void main() {
  float along = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float a = along * (0.35 + 0.65 * across) * uWeatherK;
  gl_FragColor = vec4(uWeatherCol, a);
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
  float t = uTime * (0.35 + aPhase * 0.45);
  p.x = mod(p.x + aDrift.x * uTime * 5.5 + sin(t + aPhase * 9.0) * 14.0 + uBoxSpan * 0.5, uBoxSpan) - uBoxSpan * 0.5;
  p.z = mod(p.z + aDrift.z * uTime * 5.5 + cos(t * 0.83 + aPhase * 7.0) * 14.0 + uBoxSpan * 0.5, uBoxSpan) - uBoxSpan * 0.5;
  p.y = mod(p.y + aDrift.y * uTime * 2.6 + sin(t * 0.61 + aPhase * 13.0) * 7.5 + 180.0, 360.0) - 140.0;
  vTwinkle = 0.45 + 0.55 * sin(uTime * (0.7 + aPhase * 2.6) + aPhase * 80.0);
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

export const HOLO_FRAG = /* glsl */ `
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
  vec2 cUv = vUv - 0.5;
  float r = length(cUv * vec2(1.35, 1.0));
  // Crisp wireframe orbital rings + floating Linear-Synth holographic glyphs!
  float rings = smoothstep(0.022, 0.0, abs(fract(r * 4.0 - animT * 0.24 + vSeed * 4.0) - 0.5)) * smoothstep(0.52, 0.12, r);
  float centerSigil = evalSynthGlyph(clamp((vUv - vec2(0.32, 0.28)) / vec2(0.36, 0.44), 0.0, 1.0), vSeed * 9.3, uGlyphStyle, animT, 0.055)
    * step(0.32, vUv.x) * step(vUv.x, 0.68) * step(0.28, vUv.y) * step(vUv.y, 0.72);
  float scrollArc = evalGlyphLine(vec2(vUv.x, clamp((vUv.y - 0.12) / 0.16, 0.0, 1.0)), 10.0, animT * 0.55, vSeed * 17.0, uGlyphStyle, animT)
    * step(0.12, vUv.y) * step(vUv.y, 0.28);
  float motif = clamp(rings * 0.85 + centerSigil * 0.95 + scrollArc * 0.85, 0.0, 1.0);
  if (motif < 0.03) discard;

  vec3 col = mix(uBillB, uBillA, clamp(rings * 0.55 + centerSigil * 0.65 + fract(vSeed * 5.3) * 0.35, 0.0, 1.0));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 mono = mix(uBillB * 0.4, uBillA * 1.05, clamp(lum, 0.0, 1.2));
  col = mix(col, mono, clamp(uBillMono, 0.0, 1.0));
  col = saturate3(col, uSat * (1.0 - 0.85 * clamp(uBillMono, 0.0, 1.0)));

  float scan = 0.68 + 0.32 * sin(vUv.y * 160.0 + animT * 8.0);
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x)
             * smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
  float a = motif * scan * edge * clamp(uBillK * min(uSignAmt, 1.5), 0.0, 1.4) * max(uLightK, 0.3) * 0.38;
  gl_FragColor = vec4(col * 0.88, clamp(a, 0.0, 0.42));
}
`;
