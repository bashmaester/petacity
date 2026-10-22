// GLSL for the custom materials: sky dome, ground grid, instanced towers,
// landmarks, beacons/lamps, vehicle light-trails.
// Written in GLSL ES 1.00 style (THREE.ShaderMaterial default).

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
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
`;

export const GLSL_UTIL = /* glsl */ `
vec3 saturate3(vec3 c, float s) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(l), c, s);
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

export const SKY_FRAG = /* glsl */ `
uniform vec3 uZen;
uniform vec3 uHor;
uniform vec3 uSkySunCol;
uniform vec3 uSunDir;
uniform vec3 uCloudCol;
uniform float uStars;
uniform float uCloud;
uniform float uHaze;
uniform float uTime;
uniform float uSunGlow;
uniform float uSat;
uniform vec3 uMoonDir;
uniform float uMoonSize;
uniform float uMoonGlow;
uniform float uMoonPhase;
uniform float uFlash;
varying vec3 vDir;
${GLSL_NOISE}
${GLSL_UTIL}
void main() {
  vec3 d = normalize(vDir);
  vec3 sd = normalize(uSunDir);
  float t = smoothstep(-0.12, 0.55, d.y);
  vec3 col = mix(uHor, uZen, pow(t, 0.8));

  // sun: tight disc, mid halo, wide atmospheric glow — all parametric in uSunGlow
  float s = max(dot(d, sd), 0.0);
  float disc = smoothstep(0.99965, 0.99995, s);
  float halo = pow(s, 14.0) * 0.55 + pow(s, 5.0) * 0.18;
  col += uSkySunCol * (disc * 2.8 + halo * (0.55 + uSunGlow * 1.4)) * (0.35 + uSunGlow * 0.75);

  // parametric cloud deck: lit tops, shadowed bellies, silver lining toward the sun
  if (uCloud > 0.002 && d.y > 0.012) {
    vec2 cp = d.xz / max(d.y, 0.07) * 0.62;
    cp += vec2(uTime * 0.006, uTime * 0.0024);
    float base = fbm(cp * 0.9);
    float cover = smoothstep(0.58 - uCloud * 0.36, 0.88 - uCloud * 0.22, base);
    vec2 sunOff = normalize(sd.xz + vec2(1e-4)) * 0.42;
    float toward = fbm(cp * 0.9 + sunOff);
    float lit = clamp(0.62 + (base - toward) * 2.8, 0.0, 1.3);
    vec3 cl = mix(uCloudCol * 0.5, uCloudCol + uSkySunCol * 0.9, lit);
    float edge = cover * (1.0 - cover) * 4.0;
    float facing = pow(max(dot(d, sd), 0.0), 3.0);
    cl += uSkySunCol * edge * facing * (0.45 + uSunGlow * 1.1);
    float band = smoothstep(0.012, 0.16, d.y) * (1.0 - smoothstep(0.35, 0.95, d.y));
    float amt = cover * band * clamp(uCloud, 0.0, 1.6);
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

  // stars belong to the night
  if (uStars > 0.002 && d.y > -0.02) {
    vec2 sph = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
    vec2 g = sph * 42.0;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;
    float sh = hash12(id + 0.5);
    float star = step(0.982, sh) * (1.0 - smoothstep(0.0, 0.1, length(f)));
    star *= 0.65 + 0.35 * sin(uTime * 2.4 + sh * 60.0);
    col += vec3(0.82, 0.88, 1.0) * star * uStars * smoothstep(-0.02, 0.12, d.y);
  }

  // horizon haze band — thickens with uHaze and dissolves the ground seam
  float hz = exp(-max(d.y, 0.0) * 7.0) * uHaze * 0.55;
  col = mix(col, uHor, clamp(hz, 0.0, 0.85));

  // lightning flash — the whole sky spikes
  col += vec3(0.85, 0.9, 1.1) * uFlash;

  col = saturate3(col, uSat);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* --------------------------------------------------------------- ground */

export const GROUND_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
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
uniform vec3 uSunDir;
uniform vec3 uFogCol;
uniform vec3 uSunFogCol;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uHazeSun;
uniform float uSat;
varying vec3 vWorld;
${GLSL_NOISE}
${GLSL_UTIL}
void main() {
  vec2 p = vWorld.xz;
  float ix = floor(p.x / uCell + 0.5);
  float iz = floor(p.y / uCell + 0.5);
  float isAveX = (abs(mod(ix, 4.0)) < 0.5) ? 1.0 : 0.0;
  float isAveZ = (abs(mod(iz, 4.0)) < 0.5) ? 1.0 : 0.0;
  float swx = (isAveX > 0.5) ? uAve : uSt;
  float swz = (isAveZ > 0.5) ? uAve : uSt;
  float dx = abs(p.x - ix * uCell);
  float dz = abs(p.y - iz * uCell);

  // Outskirts fade: minor streets dissolve first, major avenues linger out into the mist
  float rWarp = (vnoise(p * 0.0018) - 0.5) * uCell * 3.2;
  float rDist = length(p) + rWarp;
  float gridFade = 1.0 - smoothstep(uCitySpan * 0.9, uCitySpan * 2.15, rDist);
  float aveFade = 1.0 - smoothstep(uCitySpan * 1.15, uCitySpan * 2.85, rDist);
  float stX = step(dx, swx * 0.5) * mix(gridFade, aveFade, isAveX);
  float stZ = step(dz, swz * 0.5) * mix(gridFade, aveFade, isAveZ);
  float street = max(stX, stZ);

  vec3 col = mix(uGBlock, uGStreet, street);
  col *= 0.90 + 0.20 * vnoise(p * 0.018);

  // centre lines + kerbs, gently fading across the outskirts
  float line = max(
    (1.0 - smoothstep(0.0, 1.5, dx)) * stX,
    (1.0 - smoothstep(0.0, 1.5, dz)) * stZ
  );
  float curb = max(
    (1.0 - smoothstep(0.0, 1.1, abs(dx - swx * 0.5))) * (1.0 - step(swx * 0.5, dx)) * mix(gridFade, aveFade, isAveX),
    (1.0 - smoothstep(0.0, 1.1, abs(dz - swz * 0.5))) * (1.0 - step(swz * 0.5, dz)) * mix(gridFade, aveFade, isAveZ)
  );
  col = mix(col, uGLine, clamp(line * (0.3 + uGLineGlow * 0.7) + curb * 0.35, 0.0, 1.0));
  col += uGLine * line * uGLineGlow * 0.4;

  // faint fine grid inside the core only
  vec2 gf = abs(fract(p / 25.0) - 0.5);
  float fine = (1.0 - smoothstep(0.0, 0.035, min(gf.x, gf.y))) * gridFade;
  col += uGLine * fine * uGLineGlow * 0.16;

  col = saturate3(col, uSat);

  float dist = length(vWorld - cameraPosition);
  float density = uFogDensity * exp(-max(vWorld.y, 0.0) * uFogHeight);
  float fogF = 1.0 - exp(-density * dist);
  vec3 vdir = normalize(vWorld - cameraPosition);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, normalize(uSunDir)), 0.0), 6.0) * uHazeSun);
  // dissolve the plane edge into the horizon sky colour — no square world bounds
  float horizonMix = smoothstep(3800.0, 9500.0, dist);
  vec3 far3 = mix(fogCol, uSunFogCol, horizonMix);
  gl_FragColor = vec4(mix(col, far3, clamp(max(fogF, horizonMix), 0.0, 1.0)), 1.0);
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
varying vec3 vWorld;
varying vec3 vDims;
varying float vSeed;
varying float vKind;
varying float vStyle;
void main() {
  vLocal = position;
  vDims = aDims;
  vSeed = aSeed;
  vKind = aKind;
  vStyle = aStyle;
  vec3 nrm = mat3(instanceMatrix) * normal;
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  wp = modelMatrix * wp;
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * nrm);
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
varying vec3 vLocal;
varying vec3 vN;
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

void main() {
  vec3 n = normalize(vN);
  vec3 vdir = normalize(vWorld - cameraPosition);

  float h = hash12(vec2(vSeed * 127.1, floor(vKind + 0.5) * 311.7));
  vec3 base = mix(uBaseA, uBaseB, h);
  if (uUsePal > 0.5) {
    base = pickPal(hash12(vec2(vSeed * 91.3, 7.7)));
    base *= 0.92 + 0.16 * hash12(vec2(vSeed * 13.1, 2.2));
  }

  // facade style per instance: 0 normal, 1 outline-glow, 2 sparse monolith
  float sty = vStyle;
  float densMul = 1.0;
  float edgeBoost = 0.0;
  float bayMul = 1.0;
  if (sty > 0.5 && sty < 1.5) {   // wireframe towers: dark body, neon edges
    base *= 0.10;
    densMul = 0.0;
    edgeBoost = 1.6;
  } else if (sty > 1.5) {          // heavy monoliths: few big windows
    base *= 0.82;
    densMul = 0.22;
    bayMul = 1.7;
    edgeBoost = 0.35;
  }

  // simple sun + sky/ground ambient
  float dif = max(dot(n, normalize(uSunDir)), 0.0);
  float toonD = floor(dif * 3.0 + 0.5) / 3.0;
  dif = mix(dif, toonD, uToon);
  vec3 amb = mix(uAmbG, uAmb, n.y * 0.5 + 0.5);
  vec3 lit = base * (amb + uSunCol * uSunK * dif);
  vec3 col = mix(lit, base, uFlat);
  col = saturate3(col, uSat);

  // face-space coords in metres
  vec2 uvm;
  float face; // 0 = x face, 1 = y face, 2 = z face
  if (abs(n.x) > 0.6) { uvm = vLocal.zy * vDims.zy; face = 0.0; }
  else if (abs(n.y) > 0.6) { uvm = vLocal.xz * vDims.xz; face = 1.0; }
  else { uvm = vLocal.xy * vDims.xy; face = 2.0; }

  if (face < 0.5 || face > 1.5) {
    // windows on side faces
    float floorH = 3.5 * bayMul;
    float bayW = 3.9 * bayMul;
    float dens = uWinDensity * densMul;
    float glow = uWinGlow;
    if (vKind > 0.5 && vKind < 1.5) { floorH = 5.2 * bayMul; bayW = 6.2 * bayMul; dens *= 0.3; glow *= 0.6; }
    if (vKind > 1.5) dens = 0.0;

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
    col += wc * litWin * glow;
    // unlit glass sits slightly darker than the wall
    col *= mix(1.0, 0.86 + 0.14 * (1.0 - win), clamp(uWinGlow * 0.5, 0.0, 0.6));
  }

  // emissive trim bands
  if (vKind > 2.5) {
    col = uEdgeCol * (1.1 + uBandGlow);
  } else if (vKind > 1.5 && vKind < 2.5) {
    col += uWinC * 0.2;
  }

  // screen-constant edge lines
  vec3 ad = 0.5 - abs(vLocal);
  float ed;
  if (face < 0.5) ed = min(ad.y, ad.z);
  else if (face < 1.5) ed = min(ad.x, ad.z);
  else ed = min(ad.x, ad.y);
  float wd = fwidth(ed);
  float edge = 1.0 - smoothstep(0.0, max(wd, 1e-5) * 1.8, ed);
  float eK = uEdge + edgeBoost;
  col = mix(col, uEdgeCol * (0.55 + uBandGlow * 0.35), edge * min(eK, 1.0));
  col += uEdgeCol * edge * max(eK - 1.0, 0.0);

  // fog
  float dist = length(vWorld - cameraPosition);
  float density = uFogDensity * exp(-max(vWorld.y, 0.0) * uFogHeight);
  float fogF = 1.0 - exp(-density * dist);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, normalize(uSunDir)), 0.0), 6.0) * uHazeSun);
  gl_FragColor = vec4(mix(col, fogCol, clamp(fogF, 0.0, 1.0)), 1.0);
}
`;

/* ------------------------------------------------------------- landmarks */

export const LANDMARK_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
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
varying vec3 vWorld;
${GLSL_NOISE}
${GLSL_UTIL}
void main() {
  vec3 n = normalize(vN);
  vec3 vdir = normalize(vWorld - cameraPosition);
  float dif = max(dot(n, normalize(uSunDir)), 0.0);
  vec3 amb = mix(uAmbG, uAmb, n.y * 0.5 + 0.5);
  vec3 col = uCol * (amb + uSunCol * uSunK * dif);
  col = saturate3(col, uSat);

  // world-space window speckle on vertical faces
  if (abs(n.y) < 0.6 && uWinDensity > 0.002) {
    vec2 cellId = floor(vWorld.xz / 6.5);
    float f = fract(vWorld.y / 3.8);
    float win = step(0.28, f) * step(f, 0.74);
    float r1 = hash12(cellId + floor(vWorld.y / 3.8) * 0.13);
    float litWin = step(r1, uWinDensity) * win;
    litWin *= 0.85 + 0.15 * sin(uTime * 1.7 + r1 * 55.0);
    vec3 wc = uWinA;
    if (hash12(cellId + 3.1) > 0.62) wc = uWinB;
    col += wc * litWin * uWinGlow;
  }

  // emissive rim so landmarks read at night
  float rim = pow(1.0 - abs(dot(n, vdir)), 2.4);
  col += uEdgeCol * rim * uEdge * 0.8;

  float dist = length(vWorld - cameraPosition);
  float density = uFogDensity * exp(-max(vWorld.y, 0.0) * uFogHeight);
  float fogF = 1.0 - exp(-density * dist);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, normalize(uSunDir)), 0.0), 6.0) * uHazeSun);
  gl_FragColor = vec4(mix(col, fogCol, clamp(fogF, 0.0, 1.0)), 1.0);
}
`;

/* --------------------------------------------------------------- beacons */

export const BEACON_VERT = /* glsl */ `
attribute float aPhase;
attribute float aSize;
uniform float uTime;
uniform float uSteady;
varying float vPulse;
void main() {
  vPulse = mix(0.5 + 0.5 * sin(uTime * 2.1 + aPhase), 0.78, uSteady);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * (260.0 / max(1.0, -mv.z)) * (0.55 + 0.85 * vPulse), 1.5, 42.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const BEACON_FRAG = /* glsl */ `
uniform vec3 uBeaconCol;
uniform float uLightK;
uniform float uSteady;
varying float vPulse;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.06, d);
  float k = uLightK * (0.3 + 0.7 * vPulse);
  gl_FragColor = vec4(uBeaconCol * (0.6 + k), a * k);
}
`;

/* -------------------------------------------------------- vehicle trails */

export const TRAIL_VERT = /* glsl */ `
attribute vec3 aColor;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = uv;
  vCol = aColor;
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  wp = modelMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const TRAIL_FRAG = /* glsl */ `
uniform float uLightK;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float along = pow(max(1.0 - vUv.x, 0.0), 1.6);
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float a = along * across * across * uLightK * 0.85;
  gl_FragColor = vec4(vCol * (0.55 + along), a);
}
`;

/* ----------------------------------------------------- volumetric beams */
// Fake-volumetric shafts built from two crossed quads: alpha falls off along
// the beam (aBeamT) and across its width (aBeamW), with slow noise wobble.

export const BEAM_VERT = /* glsl */ `
attribute float aBeamT;
attribute float aBeamW;
varying float vT;
varying float vW;
void main() {
  vT = aBeamT;
  vW = aBeamW;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
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
// Soft warm pools of lamp light lying on the ground.

export const POOL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
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
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
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
varying vec3 vWorld;
${GLSL_NOISE}
${GLSL_UTIL}

void main() {
  vec3 vdir = normalize(vWorld - cameraPosition);
  // animated ripple field — two drifting octaves
  vec2 p = vWorld.xz * 0.012;
  float w1 = fbm(p + vec2(uTime * 0.05, uTime * 0.031));
  float w2 = fbm(p * 2.7 - vec2(uTime * 0.033, uTime * 0.05));
  float wave = clamp(w1 * 0.7 + w2 * 0.5, 0.0, 1.0);
  vec3 col = mix(uWaterDeep, uWaterShallow, wave * 0.65);

  // sun glitter
  vec3 sd = normalize(uSunDir);
  float facing = pow(max(dot(normalize(vec3((w1 - w2) * 2.0, 1.0, (w2 - w1) * 2.0)), sd), 0.0), 24.0);
  float glint = pow(smoothstep(0.55, 0.95, w2), 5.0);
  col += uSkySunCol * (facing * 1.3 + glint * 0.55);

  // fresnel toward the horizon sky
  float fres = pow(1.0 - max(dot(-vdir, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
  col = mix(col, uSunFogCol, fres * 0.55);

  float dist = length(vWorld - cameraPosition);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, sd), 0.0), 6.0) * uHazeSun);
  float fogF = 1.0 - exp(-uTime * 0.0 - 0.00028 * dist);
  col = mix(col, fogCol, clamp(fogF, 0.0, 1.0));
  col = saturate3(col, uSat);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------ billboards */
// Illuminated facade panels with scrolling procedural content.

export const BILL_VERT = /* glsl */ `
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const BILL_FRAG = /* glsl */ `
uniform vec3 uBillA;
uniform vec3 uBillB;
uniform float uBillK;
uniform float uTime;
uniform float uLightK;
varying vec2 vUv;
varying float vSeed;
${GLSL_NOISE}

void main() {
  // scrolling slabs of fake text/graphics
  float scroll = uTime * (0.12 + vSeed * 0.22);
  vec2 g = vec2(vUv.x * 5.0, vUv.y * 3.0 - scroll);
  float slab = hash12(floor(g) + vSeed * 31.0);
  float lit = step(0.38, slab) * (0.55 + 0.45 * hash12(floor(g) * 1.7 + 2.0));
  vec3 col = mix(uBillA, uBillB, step(0.62, fract(slab * 7.31)));
  col *= lit;

  // frame + scanlines + soft vignette
  float frame = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
  col += uBillB * smoothstep(0.86, 1.0, frame) * 1.2;
  col *= 0.82 + 0.18 * sin(vUv.y * 90.0 + uTime * 3.0);
  float vig = 1.0 - smoothstep(0.55, 1.02, length(vUv - 0.5) * 1.6);
  float k = uBillK * max(uLightK, 0.25) * (0.72 + 0.28 * sin(uTime * 1.7 + vSeed * 20.0));
  gl_FragColor = vec4(col * (0.35 + k) * vig, 1.0);
}
`;

/* -------------------------------------------------------------- weather */
// Rain streaks / drifting snow / ash — instanced with per-particle phase.

export const WEATHER_VERT = /* glsl */ `
attribute float aOff;
attribute float aSpeed;
attribute float aSway;
uniform float uTime;
uniform float uFallH;
uniform float uSwayAmp;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  wp.y = mod(wp.y + aOff + uTime * aSpeed, uFallH) - uFallH * 0.5;
  wp.x += sin(uTime * aSway + aOff * 0.7) * uSwayAmp;
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

/* ------------------------------------------------------ holograms */
// Giant translucent displays: scanlines, interference, vertical fade.

export const HOLO_VERT = /* glsl */ `
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vec4 wp = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const HOLO_FRAG = /* glsl */ `
uniform vec3 uBillA;
uniform vec3 uBillB;
uniform float uBillK;
uniform float uTime;
uniform float uLightK;
varying vec2 vUv;
varying float vSeed;
${GLSL_NOISE}

void main() {
  // Animated sky-hologram motifs: orbital rings, glyph columns & waveform bars
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
  col = mix(col, (uBillA + uBillB) * 0.9 + vec3(0.22), glyphs * 0.65);
  float scan = 0.58 + 0.42 * sin(vUv.y * 170.0 + uTime * 10.0);
  float flick = 0.84 + 0.16 * sin(uTime * 3.3 + vSeed * 40.0);
  float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x)
             * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
  float a = (0.26 + 0.58 * motif) * scan * flick * edge * uBillK * max(uLightK, 0.35);
  gl_FragColor = vec4(col * (0.7 + motif * 0.65), clamp(a, 0.0, 0.95));
}
`;
