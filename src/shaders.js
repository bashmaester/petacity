// GLSL for the three custom materials: sky dome, ground grid, instanced towers.
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
varying vec3 vDir;
${GLSL_NOISE}
void main() {
  vec3 d = normalize(vDir);
  float t = smoothstep(-0.12, 0.55, d.y);
  vec3 col = mix(uHor, uZen, pow(t, 0.8));

  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSkySunCol * (pow(s, 260.0) * 1.3 + pow(s, 9.0) * 0.3 * (0.35 + uHaze));

  if (uCloud > 0.002 && d.y > 0.015) {
    vec2 cp = d.xz / max(d.y, 0.08) * 1.1;
    float c = fbm(cp * 0.55 + vec2(uTime * 0.004, uTime * 0.0016));
    float band = smoothstep(0.015, 0.22, d.y) * (1.0 - smoothstep(0.3, 0.95, d.y));
    float cl = smoothstep(0.46, 0.72, c) * band * uCloud;
    col = mix(col, uCloudCol, cl);
    col += uSkySunCol * cl * pow(s, 5.0) * 0.25;
  }

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
uniform vec3 uSunDir;
uniform vec3 uFogCol;
uniform vec3 uSunFogCol;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uHazeSun;
varying vec3 vWorld;
${GLSL_NOISE}
void main() {
  vec2 p = vWorld.xz;
  float ix = floor(p.x / uCell + 0.5);
  float iz = floor(p.y / uCell + 0.5);
  float swx = (abs(mod(ix, 4.0)) < 0.5) ? uAve : uSt;
  float swz = (abs(mod(iz, 4.0)) < 0.5) ? uAve : uSt;
  float dx = abs(p.x - ix * uCell);
  float dz = abs(p.y - iz * uCell);
  float street = max(step(dx, swx * 0.5), step(dz, swz * 0.5));

  vec3 col = mix(uGBlock, uGStreet, street);
  col *= 0.92 + 0.16 * vnoise(p * 0.018);

  // centre lines + kerbs
  float line = max(
    (1.0 - smoothstep(0.0, 1.5, dx)) * step(dx, swx * 0.5),
    (1.0 - smoothstep(0.0, 1.5, dz)) * step(dz, swz * 0.5)
  );
  float curb = max(
    (1.0 - smoothstep(0.0, 1.1, abs(dx - swx * 0.5))) * (1.0 - step(swx * 0.5, dx)),
    (1.0 - smoothstep(0.0, 1.1, abs(dz - swz * 0.5))) * (1.0 - step(swz * 0.5, dz))
  );
  col = mix(col, uGLine, clamp(line * (0.3 + uGLineGlow * 0.7) + curb * 0.35, 0.0, 1.0));
  col += uGLine * line * uGLineGlow * 0.4;

  // faint fine grid (reads strongly in the glowing looks)
  vec2 gf = abs(fract(p / 25.0) - 0.5);
  float fine = 1.0 - smoothstep(0.0, 0.035, min(gf.x, gf.y));
  col += uGLine * fine * uGLineGlow * 0.16;

  float dist = length(vWorld - cameraPosition);
  float density = uFogDensity * exp(-max(vWorld.y, 0.0) * uFogHeight);
  float fogF = 1.0 - exp(-density * dist);
  vec3 vdir = normalize(vWorld - cameraPosition);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, normalize(uSunDir)), 0.0), 6.0) * uHazeSun);
  gl_FragColor = vec4(mix(col, fogCol, clamp(fogF, 0.0, 1.0)), 1.0);
}
`;

/* --------------------------------------------------------------- towers */

export const TOWER_VERT = /* glsl */ `
attribute float aSeed;
attribute vec3 aDims;
attribute float aKind;
varying vec3 vLocal;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vDims;
varying float vSeed;
varying float vKind;
void main() {
  vLocal = position;
  vDims = aDims;
  vSeed = aSeed;
  vKind = aKind;
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
varying vec3 vLocal;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vDims;
varying float vSeed;
varying float vKind;
${GLSL_NOISE}

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

  // simple sun + sky/ground ambient
  float dif = max(dot(n, normalize(uSunDir)), 0.0);
  float toonD = floor(dif * 3.0 + 0.5) / 3.0;
  dif = mix(dif, toonD, uToon);
  vec3 amb = mix(uAmbG, uAmb, n.y * 0.5 + 0.5);
  vec3 lit = base * (amb + uSunCol * uSunK * dif);
  vec3 col = mix(lit, base, uFlat);

  // face-space coords in metres
  vec2 uvm;
  float face; // 0 = x face, 1 = y face, 2 = z face
  if (abs(n.x) > 0.6) { uvm = vLocal.zy * vDims.zy; face = 0.0; }
  else if (abs(n.y) > 0.6) { uvm = vLocal.xz * vDims.xz; face = 1.0; }
  else { uvm = vLocal.xy * vDims.xy; face = 2.0; }

  if (face < 0.5 || face > 1.5) {
    // windows on side faces
    float floorH = 3.5;
    float bayW = 3.9;
    float dens = uWinDensity;
    float glow = uWinGlow;
    if (vKind > 0.5 && vKind < 1.5) { floorH = 5.2; bayW = 6.2; dens *= 0.3; glow *= 0.6; }
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
  col = mix(col, uEdgeCol * (0.55 + uBandGlow * 0.35), edge * min(uEdge, 1.0));
  col += uEdgeCol * edge * max(uEdge - 1.0, 0.0);

  // fog
  float dist = length(vWorld - cameraPosition);
  float density = uFogDensity * exp(-max(vWorld.y, 0.0) * uFogHeight);
  float fogF = 1.0 - exp(-density * dist);
  vec3 fogCol = mix(uFogCol, uSunFogCol, pow(max(dot(vdir, normalize(uSunDir)), 0.0), 6.0) * uHazeSun);
  gl_FragColor = vec4(mix(col, fogCol, clamp(fogF, 0.0, 1.0)), 1.0);
}
`;
