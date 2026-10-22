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

// True 3D spherical environment dome: ray-intersects a curved 3D atmospheric
// cloud shell (wrapping all 360 deg in orbital/sphere mode — no flat ceiling!).
export const SKY_FRAG = /* glsl */ `
uniform vec3 uZen;
uniform vec3 uHor;
uniform vec3 uSkySunCol;
uniform vec3 uSunDir;
uniform vec3 uCloudCol;
uniform float uStars;
uniform float uCloud;
uniform float uCloudStyle;
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
varying vec3 vDir;
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_STORMY_PLATE}

void main() {
  vec3 d = normalize(vDir);
  vec3 sd = normalize(uSunDir);
  // In sphere/orbital mode, gradient wraps smoothly across both hemispheres
  float elev = mix(smoothstep(-0.18, 0.58, d.y), smoothstep(-0.85, 0.75, d.y) * 0.85 + 0.15, uWorldCurve * 0.75);
  vec3 col = mix(uHor, uZen, pow(clamp(elev, 0.0, 1.0), 0.8));

  // sun: tight disc, mid halo, wide atmospheric glow
  float s = max(dot(d, sd), 0.0);
  float disc = smoothstep(0.99965, 0.99995, s);
  float halo = pow(s, 14.0) * 0.55 + pow(s, 5.0) * 0.18;
  col += uSkySunCol * (disc * 2.8 + halo * (0.55 + uSunGlow * 1.4)) * (0.35 + uSunGlow * 0.75);

  // 3D spherical atmosphere shell clouds (no planar d.xz/d.y projection!)
  float minElev = mix(-0.22, -1.02, clamp(uWorldCurve * 1.4, 0.0, 1.0));
  if (uCloud > 0.002 && d.y > minElev) {
    // Intersect view ray with a curved 3D atmospheric shell (radius ratio 1 : 1.24)
    float atmR = 4.2;
    float topR = 5.22;
    float bTerm = atmR * d.y;
    float radTerm = max(bTerm * bTerm + topR * topR - atmR * atmR, 0.001);
    float rayLen = -bTerm + sqrt(radTerm);
    vec3 shellDir = normalize(vec3(0.0, atmR, 0.0) + d * rayLen);
    vec3 sampleVec = mix(shellDir * 4.4, d * 3.1, uWorldCurve * 0.58);

    float iso = clamp(0.58 - uCloud * 0.27, 0.16, 0.62);
    float base = cloudField3(sampleVec, uTime);
    float cover = smoothstep(iso - 0.06, iso + 0.22, base);

    // 3D shadow probe toward the sun in spherical cloud volume
    float probe = cloudField3(sampleVec + sd * 0.42, uTime);
    float sh = smoothstep(iso - 0.05, iso + 0.22, probe);
    float heightUp = smoothstep(iso - 0.04, iso + 0.30, base);
    float lit = clamp((1.0 - 0.88 * sh) * (0.68 + 0.34 * heightUp) + 0.06, 0.0, 1.25);

    vec3 darkBelly = uCloudCol * 0.36;
    vec3 brightTop = mix(uCloudCol + uSkySunCol * 0.95, vec3(0.96, 0.95, 0.92), 0.28);
    vec2 fc = gl_FragCoord.xy;
    float g1 = cloudField3(sampleVec + vec3(0.08, 0.0, 0.0), uTime) - base;
    float g2 = cloudField3(sampleVec + vec3(0.0, 0.0, 0.08), uTime) - base;
    vec4 plate = evalStormyPlate(lit, uCloudStyle, fc, vec2(-g2, g1), darkBelly, brightTop, uTime);
    vec3 cl = plate.rgb;
    float alphaMul = plate.a;

    // Aerosol storm drips when style == 2 near lower cloud band
    if (uCloudStyle >= 1.5 && uCloudStyle < 2.5 && d.y > -0.05 && d.y < 0.34) {
      float colId = floor(fc.x / 19.0);
      float colH = grainHash(vec2(colId, 4.7));
      if (colH > 0.62) {
        float cyc = fract(uTime / (15.0 + colH * 9.0) + colH * 5.0);
        float lenY = smoothstep(0.0, 0.55, cyc) * (1.0 - smoothstep(0.82, 1.0, cyc)) * 0.14;
        float xWob = (colId + 0.5) * 19.0 + sin(fc.y * 0.06 + colH * 30.0) * 1.6;
        float bandD = smoothstep(0.34, 0.34 - lenY, d.y) * step(0.34 - lenY, d.y);
        float inStem = (1.0 - smoothstep(0.7, 1.7, abs(fc.x - xWob))) * bandD * cover;
        cl = mix(cl, brightTop * 0.95, inStem * 0.78);
        cover = max(cover, inStem * 0.65);
      }
    }

    float edge = cover * (1.0 - cover) * 4.0;
    float facing = pow(max(dot(d, sd), 0.0), 3.0);
    cl += uSkySunCol * edge * facing * (0.45 + uSunGlow * 1.1);
    float sphereWrap = mix(smoothstep(-0.18, 0.08, d.y), 0.78, clamp(uWorldCurve * 1.25, 0.0, 1.0));
    float amt = clamp(cover * sphereWrap * clamp(uCloud, 0.0, 1.6) * alphaMul * 0.72, 0.0, 0.94);
    col = mix(col, cl, amt);
  }

  // moon: soft disc with crater speckle, phase shadow and glow halo
  if (uMoonGlow > 0.003) {
    vec3 md = normalize(uMoonDir);
    vec3 mright = normalize(cross(md, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
    vec3 mup = cross(mright, md);
    vec2 muv = vec2(dot(d, mright), dot(d, mup));
    float moonR = 0.045 * max(uMoonSize, 0.15);
    float mAng = length(muv);
    float mDisc = 1.0 - smoothstep(moonR * 0.9, moonR, mAng);
    float shOff = (uMoonPhase - 0.5) * 2.4 * moonR;
    float shadow = 1.0 - smoothstep(moonR * 0.94, moonR * 1.02, length(muv - vec2(shOff, moonR * 0.15)));
    float mBody = mDisc * (1.0 - shadow * 0.94);
    float crater = 0.78 + 0.22 * vnoise(muv * 95.0 + 3.7);
    col += vec3(0.86, 0.9, 1.0) * mBody * crater * (1.15 + uMoonGlow * 1.3);
    float halo = 1.0 - smoothstep(moonR, moonR * 3.4, mAng);
    col += vec3(0.62, 0.72, 1.0) * halo * uMoonGlow * 0.34;
  }

  // stars wrap all 360 deg around the orbital sky as world curves into a sphere
  float starFloor = mix(-0.02, -1.02, clamp(uWorldCurve * 1.3, 0.0, 1.0));
  if (uStars > 0.002 && d.y > starFloor) {
    vec2 sph = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
    vec2 g = sph * 42.0;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float sh = hash12(id + 0.5);
    float star = step(0.982, sh) * (1.0 - smoothstep(0.0, 0.1, length(f)));
    star *= 0.65 + 0.35 * sin(uTime * 2.4 + sh * 60.0);
    float starVis = mix(smoothstep(-0.02, 0.12, d.y), 1.0, clamp(uWorldCurve * 1.2, 0.0, 1.0));
    col += vec3(0.82, 0.88, 1.0) * star * uStars * starVis;
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

/* ---------------------------------------------------- 3D cloud geometry */
// Real 3D scene cloud shells & sculpted cumulus volumes that wrap around the
// flat or spherical world so you can fly under, through and above the clouds.

export const CLOUD_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime;
varying vec3 vFlat;
varying vec3 vWorld;
varying vec3 vN;
varying float vSeed;
varying float vRimMask;
${GLSL_NOISE}
${GLSL_CURVE}
void main() {
  vSeed = aSeed;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  // Gentle 3D billow displacement so cloud shells & cumulus puffs breathe in 3D
  float billow = (vnoise3(wp.xyz * 0.0022 + vec3(uTime * 0.018, 0.0, uTime * 0.011) + aSeed * 13.0) - 0.5) * 46.0;
  wp.y += billow;
  vFlat = wp.xyz;
  vec3 rawN = normal;
  #ifdef USE_INSTANCING
    rawN = mat3(instanceMatrix) * rawN;
  #endif
  rawN = normalize(mat3(modelMatrix) * rawN);
  vN = bendNormal(wp.xz, rawN);
  // Radial fade for dome shells (aSeed < 0 marks shell vertices with radial t in -aSeed)
  vRimMask = aSeed < 0.0 ? clamp(1.0 - smoothstep(0.58, 0.98, -aSeed), 0.0, 1.0) : 1.0;
  wp.xyz = bendWorld(wp.xyz);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
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
uniform float uCloudStyle;
uniform float uSunGlow;
uniform float uTime;
uniform float uSat;
varying vec3 vFlat;
varying vec3 vWorld;
varying vec3 vN;
varying float vSeed;
varying float vRimMask;
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_STORMY_PLATE}
void main() {
  if (uCloud < 0.02) discard;
  vec3 sd = normalize(uSunDir);
  vec3 n = normalize(vN);
  vec3 vdir = normalize(vWorld - cameraPosition);

  // 3D volumetric cloud density in flat-world canopy coordinates (drifts with wind)
  vec3 q = vFlat * vec3(0.00095, 0.0024, 0.00095) + vec3(uTime * 0.014, 0.0, uTime * 0.006);
  float dens = cloudField3(q, uTime);
  float isPuff = step(0.0, vSeed);
  float iso = mix(clamp(0.60 - uCloud * 0.25, 0.20, 0.62), clamp(0.44 - uCloud * 0.16, 0.16, 0.50), isPuff);
  float cover = smoothstep(iso - 0.07, iso + 0.22, dens);
  // Sculpted cumulus puffs soften smoothly at grazing silhouette angles
  float puffSil = isPuff > 0.5 ? pow(abs(dot(n, -vdir)), 0.75) : 1.0;
  float alphaBase = cover * vRimMask * puffSil * clamp(uCloud, 0.0, 1.5) * (isPuff > 0.5 ? 0.68 : 0.46);
  // Camera fly-through proximity fade so flying right through a cloud shell feels misty, never a hard plane
  float camDist = length(vWorld - cameraPosition);
  alphaBase *= smoothstep(18.0, 130.0, camDist);
  if (alphaBase < 0.006) discard;

  float probe = cloudField3(q + sd * 0.35, uTime);
  float sh = smoothstep(iso - 0.05, iso + 0.22, probe);
  float topLight = clamp(dot(n, sd) * 0.45 + 0.55, 0.0, 1.0);
  float lit = clamp((1.0 - 0.84 * sh) * (0.55 + 0.52 * topLight) + 0.08, 0.0, 1.25);

  vec3 darkBelly = uCloudCol * 0.38;
  vec3 brightTop = mix(uCloudCol + uSkySunCol * 0.95, vec3(0.97, 0.96, 0.93), 0.32);
  vec4 plate = evalStormyPlate(lit, uCloudStyle, gl_FragCoord.xy, vFlat.xz * 0.002, darkBelly, brightTop, uTime);
  vec3 cl = plate.rgb;

  // Forward-scattered silver lining around the sun
  float fwd = pow(max(dot(vdir, sd), 0.0), 5.0);
  float edge = cover * (1.0 - cover) * 4.0;
  cl += uSkySunCol * (edge * 0.65 + 0.22) * fwd * (0.45 + uSunGlow * 1.05);

  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, sd), 0.0), 6.0) * uHazeSun);
  float farMix = smoothstep(4500.0, 13000.0, camDist) * 0.55;
  cl = saturate3(mix(cl, fogCol, farMix), uSat);
  gl_FragColor = vec4(cl, clamp(alphaBase * plate.a, 0.0, 0.88));
}
`;

/* --------------------------------------------------------------- ground */

export const GROUND_VERT = /* glsl */ `
varying vec3 vFlat;
varying vec3 vWorld;
${GLSL_CURVE}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vFlat = wp.xyz;
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
uniform float uCitySpan;
uniform float uSuburbSpan;
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
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_CURVE}
void main() {
  vec2 p = vFlat.xz;

  // Organic radial alpha disappearance at the outer rim of the ground disc
  float edgeWarp = (vnoise(p * 0.00045 + 4.2) - 0.5) * uGroundRadius * 0.14;
  float edgeR = length(p) + edgeWarp;
  float fadeInner = mix(uGroundRadius * 0.44, uPlanetR * 2.55, uWorldCurve);
  float fadeOuter = mix(uGroundRadius * 0.95, uPlanetR * 3.08, uWorldCurve);
  float edgeAlpha = 1.0 - smoothstep(fadeInner, fadeOuter, edgeR);
  if (edgeAlpha < 0.004) discard;

  float ix = floor(p.x / uCell + 0.5);
  float iz = floor(p.y / uCell + 0.5);
  float isAveX = (abs(mod(ix, 4.0)) < 0.5) ? 1.0 : 0.0;
  float isAveZ = (abs(mod(iz, 4.0)) < 0.5) ? 1.0 : 0.0;
  float swx = (isAveX > 0.5) ? uAve : uSt;
  float swz = (isAveZ > 0.5) ? uAve : uSt;
  float dx = abs(p.x - ix * uCell);
  float dz = abs(p.y - iz * uCell);

  // Core grid transitions into curved suburban street & parcel fabric out to uSuburbSpan
  float rWarp = (vnoise(p * 0.0018) - 0.5) * uCell * 3.2;
  float rDist = length(p) + rWarp;
  float gridFade = 1.0 - smoothstep(uCitySpan * 0.9, uCitySpan * 2.05, rDist);
  float aveFade = 1.0 - smoothstep(uCitySpan * 1.15, uCitySpan * 3.1, rDist);
  float subFade = (1.0 - gridFade * 0.85) * (1.0 - smoothstep(uSuburbSpan * 0.55, uSuburbSpan * 1.18, rDist));

  // Distinct streetscape zones: carriageway, raised sidewalk promenade & inner block lot
  float walkW = 4.2;
  float roadX = step(dx, swx * 0.5 - walkW) * mix(gridFade, aveFade, isAveX);
  float roadZ = step(dz, swz * 0.5 - walkW) * mix(gridFade, aveFade, isAveZ);
  float road = max(roadX, roadZ);

  // Winding suburban neighbourhood collector streets, cul-de-sacs & residential lots
  vec2 subWarp = vec2(fbm(p * 0.0011 + 2.3), fbm(p * 0.0011 - 7.1)) * 125.0;
  vec2 sp = p + subWarp;
  vec2 subCell = abs(fract(sp / 138.0) - 0.5) * 138.0;
  float subRoad = (1.0 - smoothstep(4.8, 7.2, min(subCell.x, subCell.y))) * subFade;
  road = max(road, subRoad * 0.88);

  float walkBandX = step(swx * 0.5 - walkW, dx) * step(dx, swx * 0.5 + 1.2) * (1.0 - roadZ) * mix(gridFade, aveFade, isAveX);
  float walkBandZ = step(swz * 0.5 - walkW, dz) * step(dz, swz * 0.5 + 1.2) * (1.0 - roadX) * mix(gridFade, aveFade, isAveZ);
  float sidewalk = clamp(max(walkBandX, walkBandZ), 0.0, 1.0);

  vec3 walkCol = mix(uGBlock, uGStreet, 0.35) + uGLine * 0.05;
  vec2 paver = abs(fract(p / 3.6) - 0.5);
  float joint = 1.0 - smoothstep(0.0, 0.06, min(paver.x, paver.y));
  walkCol *= 1.0 - joint * 0.14;

  // Suburban hedged garden parcels & house roof/patio micro-plots out to the horizon
  vec2 lotUv = fract(sp / 34.5);
  vec2 lotId = floor(sp / 34.5);
  float lotHash = hash12(lotId + 5.7);
  float lotBorder = (1.0 - smoothstep(0.0, 0.055, min(min(lotUv.x, 1.0 - lotUv.x), min(lotUv.y, 1.0 - lotUv.y)))) * subFade * (1.0 - subRoad);
  vec3 yardTint = mix(uGBlock * 0.88, uGBlock * 1.18, lotHash);
  vec3 baseBlock = mix(uGBlock, yardTint, subFade * 0.75);

  vec3 col = mix(baseBlock, uGStreet, road);
  col = mix(col, walkCol, sidewalk * 0.92);
  col = mix(col, uGStreet * 1.25, lotBorder * 0.35);
  col *= 0.90 + 0.20 * vnoise(p * 0.018);

  // Distant suburban porch / cul-de-sac streetlamp micro-glints fading toward the horizon
  float subPorch = step(0.76, lotHash) * (1.0 - smoothstep(0.0, 0.18, length(lotUv - vec2(0.5, 0.28)))) * subFade * (1.0 - subRoad);
  col += uPoolCol * subPorch * max(uLightK, 0.12) * 0.55;

  // Centre lines, multi-lane dashes on avenues, kerbs & intersection zebra crosswalks
  float dashZ = step(0.42, fract(p.y / 14.0));
  float dashX = step(0.42, fract(p.x / 14.0));
  float centerX = (1.0 - smoothstep(0.0, 1.25, dx)) * roadX * (1.0 - roadZ * 0.85);
  float centerZ = (1.0 - smoothstep(0.0, 1.25, dz)) * roadZ * (1.0 - roadX * 0.85);
  float subCenter = (1.0 - smoothstep(0.0, 0.85, min(subCell.x, subCell.y))) * subRoad * 0.45;
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

  // Wet street puddles & neon/streetlamp asphalt sheen (intensifies in rain/storm)
  float puddle = smoothstep(0.42, 0.78, vnoise(p * 0.045 + 3.1));
  float wet = clamp(0.16 + uWetness * 0.84, 0.0, 1.0) * road * puddle;
  vec3 vdir = normalize(vWorld - cameraPosition);
  vec3 upN = bendNormal(p, vec3(0.0, 1.0, 0.0));
  float fres = pow(1.0 - max(dot(-vdir, upN), 0.0), 2.6);
  vec3 streetRefl = mix(uPoolCol, uBillA, vnoise(p * 0.014 - 7.3));
  col += streetRefl * wet * (0.18 + 0.55 * fres) * max(uLightK, 0.15);

  // Spherical planetoid day/night terminator shading when curved into a globe
  if (uWorldCurve > 0.01) {
    float globeShade = mix(1.0, 0.38 + 0.68 * max(dot(upN, normalize(uSunDir)), 0.0), clamp(uWorldCurve * 1.1, 0.0, 1.0));
    col *= globeShade;
  }

  // faint fine plaza paving inside urban blocks only
  vec2 gf = abs(fract(p / 25.0) - 0.5);
  float fine = (1.0 - smoothstep(0.0, 0.035, min(gf.x, gf.y))) * gridFade * (1.0 - road);
  col += uGLine * fine * uGLineGlow * 0.12;

  col = saturate3(col, uSat);

  float dist = length(vWorld - cameraPosition);
  float density = uFogDensity * exp(-max(vFlat.y, 0.0) * uFogHeight);
  float fogF = (1.0 - exp(-density * dist)) * (1.0 - uWorldCurve * 0.45);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, normalize(uSunDir)), 0.0), 6.0) * uHazeSun);
  float horizonMix = smoothstep(fadeInner * 0.72, fadeOuter, edgeR) * (1.0 - uWorldCurve * 0.75);
  vec3 far3 = mix(fogCol, uSunFogCol, horizonMix);
  gl_FragColor = vec4(mix(col, far3, clamp(max(fogF, horizonMix), 0.0, 1.0)), edgeAlpha);
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

vec3 pickPal(float p) {
  vec3 c = uPal[0];
  if (p > 0.1666) c = uPal[1];
  if (p > 0.3333) c = uPal[2];
  if (p > 0.5)    c = uPal[3];
  if (p > 0.6666) c = uPal[4];
  if (p > 0.8333) c = uPal[5];
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
  vec3 base = mix(uBaseA, uBaseB, h);
  if (uUsePal > 0.5) {
    base = pickPal(hash12(vec2(vSeed * 91.3, 7.7)));
    base *= 0.92 + 0.16 * hash12(vec2(vSeed * 13.1, 2.2));
  }

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

  if ((face < 0.5 || face > 1.5) && vKind < 1.5) {
    if (isMedia > 0.5 && wy > 5.5) {
      vec2 scrUv = vec2(uvm.x / max(vDims.x, 18.0) + 0.5, wy / 26.0);
      vec2 panelId = floor(vec2(scrUv.x * 2.0, scrUv.y));
      vec2 pf = fract(vec2(scrUv.x * 2.0, scrUv.y));
      float frame = step(0.05, pf.x) * step(pf.x, 0.95) * step(0.07, pf.y) * step(pf.y, 0.93);
      float pHash = hash12(panelId + vSeed * 43.0);
      float rate = (0.18 + 0.35 * pHash) * (pHash > 0.5 ? 1.0 : -1.0);
      vec2 subG = vec2(pf.x * (4.0 + floor(pHash * 4.0)), pf.y * 4.0 - uTime * rate);
      float cellH = hash12(floor(subG) + panelId * 7.1 + vSeed * 19.0);
      float bar = step(0.32, cellH) * (0.55 + 0.45 * sin(uTime * 2.2 + pHash * 30.0));
      float wave = 0.5 + 0.5 * sin(pf.x * 9.0 - pf.y * 6.0 - uTime * 2.6 + pHash * 12.0);
      float ticker = step(pf.y, 0.22) * step(0.35, fract(pf.x * 14.0 - uTime * 1.4));
      vec3 adCol = mix(uBillA, uBillB, step(0.48, fract(pHash * 5.7 + wave * 0.45)));
      adCol = mix(adCol, (uBillA + uBillB) * 0.85 + vec3(0.25), ticker * 0.7);
      adCol = styleBillColor(adCol);
      float scan = 0.80 + 0.20 * sin(wy * 5.5 + uTime * 8.0);
      float emK = uBillK * max(uLightK, 0.32) * (0.75 + 0.55 * bar + 0.35 * wave + 0.5 * ticker);
      col = mix(col * 0.35, saturate3(adCol, uSat) * emK * scan, frame);
    } else if (vDims.y < 13.5 && isStreetPod < 0.5) {
      // Suburban residential house / cottage windows: warm domestic lights & porch door
      vec2 hg = uvm / vec2(4.2, 3.2);
      vec2 hf = fract(hg);
      float hWin = step(0.26, hf.x) * step(hf.x, 0.74) * step(0.30, hf.y) * step(hf.y, 0.76);
      float hr = hash12(floor(hg) + vSeed * 31.7);
      vec3 hCol = saturate3(mix(uWinA, uPoolCol, 0.45), uSat);
      col += hCol * hWin * step(hr, uWinDensity * 0.95) * uWinGlow * 0.85;
    } else if (wy < 15.8 || isStreetPod > 0.5) {
      float podH = 5.4;
      float bayW = 5.6;
      float bx = fract(uvm.x / bayW);
      float pilaster = 1.0 - step(0.14, bx) * step(bx, 0.86);
      if (wy < podH) {
        float glass = (1.0 - pilaster) * step(0.35, wy) * step(wy, podH - 0.55);
        float shopId = floor(uvm.x / bayW);
        float shHash = hash12(vec2(shopId, floor(vSeed * 97.0)));
        float openShop = step(0.18, shHash + uWinDensity * 0.45);
        vec3 shopCol = mix(uPoolCol, uWinA, fract(shHash * 3.7));
        shopCol = mix(shopCol, styleBillColor(uBillA), step(0.82, shHash) * 0.55);
        shopCol = saturate3(shopCol, uSat);
        float interiorBand = 0.65 + 0.35 * step(0.45, fract(wy * 0.7 + shHash * 4.0));
        col *= 1.0 - pilaster * 0.24;
        col = mix(col, shopCol * (0.45 + uWinGlow * 0.62 + uLightK * 0.45) * interiorBand, glass * openShop * 0.88);
        float fascia = (1.0 - pilaster * 0.7) * step(podH - 0.55, wy) * step(wy, podH - 0.08);
        col += saturate3(styleBillColor(mix(uWinA, uBillA, 0.35)), uSat) * fascia * step(0.35, shHash) * (0.45 + uLightK * 0.6);
      } else {
        vec2 mg = vec2(uvm.x / bayW, (wy - podH) / 4.6);
        vec2 mf = fract(mg);
        float mWin = step(0.16, mf.x) * step(mf.x, 0.84) * step(0.22, mf.y) * step(mf.y, 0.80);
        float mr = hash12(floor(mg) + vSeed * 23.1);
        vec3 mCol = saturate3(mix(uWinA, uWinB, step(0.6, mr)), uSat);
        col += mCol * mWin * step(mr, uWinDensity * 1.15) * uWinGlow * 0.85;
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
      float litWin = step(r1, dens) * win;
      litWin *= 0.85 + 0.15 * sin(uTime * 2.0 + r1 * 60.0);
      float r2 = hash12(gid + vec2(vSeed * 37.7, 5.0));
      vec3 wc = uWinA;
      if (r2 > 0.55) wc = uWinB;
      if (r2 > 0.82) wc = uWinC;
      col += saturate3(wc, uSat) * litWin * glow;
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
${GLSL_CURVE}
void main() {
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
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uSunK;
uniform vec3 uAmb;
uniform vec3 uAmbG;
uniform float uWinDensity;
uniform float uWinGlow;
uniform vec3 uWinA;
uniform vec3 uWinB;
uniform float uEdge;
uniform vec3 uEdgeCol;
uniform vec3 uFogCol;
uniform vec3 uSunFogCol;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uHazeSun;
uniform float uTime;
uniform float uSat;
varying vec3 vN;
varying vec3 vFlat;
varying vec3 vWorld;
varying vec3 vLocalN;
${GLSL_NOISE}
${GLSL_UTIL}
void main() {
  vec3 n = normalize(vN);
  vec3 ln = normalize(vLocalN);
  vec3 vdir = normalize(vWorld - cameraPosition);
  float dif = max(dot(n, normalize(uSunDir)), 0.0);
  vec3 amb = mix(uAmbG, uAmb, n.y * 0.5 + 0.5);
  vec3 col = uCol * (amb + uSunCol * uSunK * dif);
  col = saturate3(col, uSat);

  if (abs(ln.y) < 0.72) {
    float ang = atan(ln.z, ln.x);
    vec2 g = vec2(ang * 18.0, max(vFlat.y, 0.0) / 4.2);
    vec2 gid = floor(g);
    vec2 f = fract(g);
    float win = step(0.25, f.x) * step(f.x, 0.75) * step(0.28, f.y) * step(f.y, 0.76);
    float r = hash12(gid + 11.7);
    float on = step(r, uWinDensity * 0.75) * win;
    vec3 wc = mix(uWinA, uWinB, step(0.55, hash12(gid + 3.3)));
    col += saturate3(wc, uSat) * on * uWinGlow * 0.85;
  }

  float rim = pow(1.0 - max(dot(-vdir, n), 0.0), 2.6);
  col += saturate3(uEdgeCol, uSat) * rim * uEdge * 0.55;

  float dist = length(vWorld - cameraPosition);
  float density = uFogDensity * exp(-max(vFlat.y, 0.0) * uFogHeight);
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
varying vec3 vFlat;
varying vec3 vWorld;
${GLSL_CURVE}
void main() {
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
uniform float uHazeSun;
uniform float uTime;
uniform float uSat;
varying vec3 vFlat;
varying vec3 vWorld;
${GLSL_NOISE}
${GLSL_UTIL}
${GLSL_CURVE}

void main() {
  vec3 vdir = normalize(vWorld - cameraPosition);
  vec2 p = vFlat.xz * 0.012;
  float w1 = fbm(p + vec2(uTime * 0.05, uTime * 0.031));
  float w2 = fbm(p * 2.7 - vec2(uTime * 0.033, uTime * 0.05));
  float wave = clamp(w1 * 0.7 + w2 * 0.5, 0.0, 1.0);
  vec3 col = mix(uWaterDeep, uWaterShallow, wave * 0.65);

  vec3 sd = normalize(uSunDir);
  vec3 waveN = bendNormal(vFlat.xz, normalize(vec3((w1 - w2) * 2.0, 1.0, (w2 - w1) * 2.0)));
  float facing = pow(max(dot(waveN, sd), 0.0), 24.0);
  float glint = pow(smoothstep(0.55, 0.95, w2), 5.0);
  col += uSkySunCol * (facing * 1.3 + glint * 0.55);

  vec3 upN = bendNormal(vFlat.xz, vec3(0.0, 1.0, 0.0));
  float fres = pow(1.0 - max(dot(-vdir, upN), 0.0), 3.0);
  col = mix(col, uSunFogCol, fres * 0.55);

  float dist = length(vWorld - cameraPosition);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, sd), 0.0), 6.0) * uHazeSun);
  float fogF = (1.0 - exp(-uTime * 0.0 - 0.00028 * dist)) * (1.0 - uWorldCurve * 0.45);
  col = mix(col, fogCol, clamp(fogF, 0.0, 1.0));
  col = saturate3(col, uSat);
  gl_FragColor = vec4(col, 1.0);
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
uniform float uTime;
uniform float uLightK;
uniform float uSat;
varying vec2 vUv;
varying float vSeed;
${GLSL_NOISE}
${GLSL_UTIL}

void main() {
  float scroll = uTime * (0.12 + vSeed * 0.22);
  vec2 g = vec2(vUv.x * 5.0, vUv.y * 3.0 - scroll);
  float slab = hash12(floor(g) + vSeed * 31.0);
  float lit = step(0.34, slab) * (0.55 + 0.45 * hash12(floor(g) * 1.7 + 2.0));
  vec3 col = mix(uBillA, uBillB, step(0.58, fract(slab * 7.31)));
  col *= lit;

  float frame = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
  col += uBillA * smoothstep(0.86, 1.0, frame) * 1.05;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 mono = mix(uBillB * 0.35, uBillA * 1.12, clamp(lum, 0.0, 1.3));
  col = mix(col, mono, clamp(uBillMono, 0.0, 1.0));
  col = saturate3(col, uSat * (1.0 - 0.85 * clamp(uBillMono, 0.0, 1.0)));

  col *= 0.82 + 0.18 * sin(vUv.y * 90.0 + uTime * 3.0);
  float vig = 1.0 - smoothstep(0.55, 1.02, length(vUv - 0.5) * 1.6);
  float k = uBillK * max(uLightK, 0.25) * (0.72 + 0.28 * sin(uTime * 1.7 + vSeed * 20.0));
  gl_FragColor = vec4(col * (0.32 + k) * vig, 1.0);
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
uniform float uTime;
uniform float uLightK;
uniform float uSat;
varying vec2 vUv;
varying float vSeed;
${GLSL_NOISE}
${GLSL_UTIL}

void main() {
  vec2 cUv = vUv - 0.5;
  float r = length(cUv * vec2(1.4, 1.0));
  float rings = smoothstep(0.05, 0.0, abs(fract(r * 5.0 - uTime * 0.32 + vSeed * 4.0) - 0.5));
  float band = vnoise(vec2(vUv.y * 6.5 - uTime * 0.38, vSeed * 20.0 + uTime * 0.09));
  float rows = step(0.28, fract(vUv.y * 15.0 - uTime * 0.24 + band));
  vec2 g = vec2(vUv.x * 7.0, vUv.y * 5.0 - uTime * 0.22);
  float blocks = hash12(floor(g) + vSeed * 17.0);
  float glyphs = step(0.58, blocks) * step(0.22, fract(g.x)) * step(0.22, fract(g.y));
  float motif = clamp(rows * (0.45 + 0.55 * band) + rings * 0.85 + glyphs * 0.75, 0.0, 1.35);

  vec3 col = mix(uBillB, uBillA, clamp(band + rings * 0.45, 0.0, 1.0));
  col = mix(col, (uBillA + uBillB) * 0.9 + vec3(0.18 * (1.0 - uBillMono)), glyphs * 0.65);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 mono = mix(uBillB * 0.4, uBillA * 1.15, clamp(lum, 0.0, 1.3));
  col = mix(col, mono, clamp(uBillMono, 0.0, 1.0));
  col = saturate3(col, uSat * (1.0 - 0.85 * clamp(uBillMono, 0.0, 1.0)));

  float scan = 0.58 + 0.42 * sin(vUv.y * 170.0 + uTime * 10.0);
  float flick = 0.84 + 0.16 * sin(uTime * 3.3 + vSeed * 40.0);
  float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x)
             * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
  float a = (0.26 + 0.58 * motif) * scan * flick * edge * uBillK * max(uLightK, 0.35);
  gl_FragColor = vec4(col * (0.7 + motif * 0.65), clamp(a, 0.0, 0.95));
}
`;
