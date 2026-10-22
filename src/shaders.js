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

// True 3D spherical environment dome: volumetric Beer-Lambert raymarch through
// a curved concentric 3D atmospheric cumulus shell (zero polygons, zero plane cutoff!).
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

// Continuous 3D cumulus cloud density inside concentric spherical shell
float skyCumulusDensity(vec3 p, float h01, float covK, float t) {
  vec3 wind = vec3(t * 22.0, 0.0, t * 9.5);
  vec3 q = (p + wind) * vec3(0.00034, 0.00072, 0.00034);
  float macro = fbm3(q);
  float billow = fbm3(q * 2.35 + vec3(3.7, -1.9, 5.1));
  float detail = vnoise3(q * 5.8 - vec3(t * 0.08, 0.0, 0.0));
  // Cumulus anvil profile: flat condensation base, rounded billowing cauliflower tops
  float prof = smoothstep(0.02, 0.22, h01) * smoothstep(1.0, 0.36, h01);
  float shape = (macro * 0.66 + billow * 0.34) * (0.55 + 0.62 * prof) - detail * 0.14;
  float thresh = clamp(0.56 - covK * 0.21, 0.22, 0.62);
  return clamp((shape - thresh) * 2.85, 0.0, 1.0) * prof;
}

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

  // Stars sit behind volumetric clouds so clouds naturally occlude starlight
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

  // Moon also sits behind volumetric clouds so cloud banks drift naturally across the moon
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
    float haloM = 1.0 - smoothstep(moonR, moonR * 3.4, mAng);
    col += vec3(0.62, 0.72, 1.0) * haloM * uMoonGlow * 0.34;
  }

  // True 3D volumetric raymarch through concentric spherical cloud shell
  float minElev = mix(-0.14, -1.02, clamp(uWorldCurve * 1.4, 0.0, 1.0));
  if (uCloud > 0.01 && d.y > minElev) {
    float curveBlend = smoothstep(0.02, 0.35, uWorldCurve);
    float globeR = max(uPlanetR, 1200.0) / max(uWorldCurve, 0.04);
    float atmoR = mix(15500.0, globeR, curveBlend);
    // In flat mode, anchor horizontal coordinates softly so flying through the world shifts clouds with real parallax!
    vec3 sphereCenter = mix(
      vec3(cameraPosition.x * 0.65, -atmoR, cameraPosition.z * 0.65),
      vec3(0.0, -atmoR, 0.0),
      curveBlend
    );
    vec3 oc = cameraPosition - sphereCenter;
    float rCam = length(oc);
    float rBase = atmoR + 620.0;
    float rTop = atmoR + 1660.0;
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
      float dtStep = span / 9.0;
      float covK = clamp(uCloud, 0.0, 1.6);

      float Tr = 1.0;
      vec3 accum = vec3(0.0);
      float avgLit = 0.0;
      float wSum = 0.0;
      vec3 repP = cameraPosition + d * (tStart + span * 0.45);

      vec3 darkBelly = mix(uCloudCol * 0.34, uHor * 0.48, 0.28);
      vec3 brightTop = mix(uCloudCol + uSkySunCol * 0.92, vec3(0.97, 0.96, 0.93), 0.30);
      float cosTheta = dot(d, sd);
      float hgPhase = 0.25 + 0.95 * pow(max(cosTheta, 0.0), 6.0) * (0.4 + uSunGlow * 0.85);

      for (int i = 0; i < 9; i++) {
        if (Tr < 0.03) break;
        float tCur = tStart + (float(i) + jit) * dtStep;
        vec3 p = cameraPosition + d * tCur;
        float h01 = clamp((length(p - sphereCenter) - rBase) / shellThick, 0.0, 1.0);
        float dens = skyCumulusDensity(p, h01, covK, uTime);
        if (dens > 0.004) {
          vec3 pSun = p + sd * 145.0;
          float hSun = clamp((length(pSun - sphereCenter) - rBase) / shellThick, 0.0, 1.0);
          float shDens = skyCumulusDensity(pSun, hSun, covK, uTime);
          float sunTrans = exp(-shDens * 2.6);
          float powder = 1.0 - exp(-dens * 3.4);
          float lit = clamp(sunTrans * (0.52 + 0.55 * h01) + 0.10 + 0.16 * h01, 0.0, 1.25);
          vec3 stepCol = mix(darkBelly, brightTop, clamp(lit, 0.0, 1.0));
          stepCol += uSkySunCol * sunTrans * (0.35 + 0.65 * powder) * hgPhase * 0.55;

          float sig = dens * (0.0026 + covK * 0.0012);
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
        // Horizon atmospheric perspective softly blends very distant cloud rims into horizon haze
        float distFade = mix(smoothstep(-0.10, 0.07, d.y), 1.0, clamp(uWorldCurve * 1.3, 0.0, 1.0));
        float farAtmo = smoothstep(3500.0, 14500.0, tStart) * (1.0 - curveBlend * 0.65);
        cRgb = mix(cRgb, mix(uHor, uSkySunCol, pow(s, 5.0) * 0.35), farAtmo * 0.58);
        col = mix(col, cRgb, clamp(cloudAlpha * distFade, 0.0, 0.96));
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
  vHalfExt = max(aScale * 0.5, vec3(1.0));
  vCenterW = bendWorld(aCenter);
  vec3 upAxis = normalize(bendNormal(aCenter.xz, vec3(0.0, 1.0, 0.0)));
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
uniform float uCloudStyle;
uniform float uSunGlow;
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

float puffVolDensity(vec3 pL, float covK, float seed, float t) {
  // Ellipsoidal radial falloff strictly reaches 0.0 at r = 0.88 (< 1.0 cube wall!)
  vec3 sq = vec3(pL.x, pL.y * 1.12 - 0.06, pL.z);
  float r = length(sq);
  if (r >= 0.88) return 0.0;
  float env = (1.0 - smoothstep(0.22, 0.87, r)) * smoothstep(-0.78, -0.20, pL.y);
  vec3 drift = vec3(t * 0.045, 0.0, t * 0.022) + seed * 17.3;
  float n1 = fbm3(pL * 2.15 + drift);
  float n2 = fbm3(pL * 4.6 - drift * 1.4);
  float raw = (n1 * 0.68 + n2 * 0.32) * env;
  float cut = clamp(0.26 - covK * 0.09, 0.08, 0.30);
  return clamp((raw - cut) * 3.1, 0.0, 1.0) * env;
}

void main() {
  if (uCloud < 0.05) discard;
  vec3 rayVec = vWorld - cameraPosition;
  float distToBack = length(rayVec);
  if (distToBack < 1e-3) discard;
  vec3 rdW = rayVec / distToBack;

  // Transform camera ray into normalized ellipsoid space where unit sphere r<=0.88 is inside [-1,1]^3
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
  float covK = clamp(uCloud, 0.0, 1.6);

  float Tr = 1.0;
  vec3 accum = vec3(0.0);
  float avgLit = 0.0;
  float wSum = 0.0;

  vec3 darkBelly = uCloudCol * 0.38;
  vec3 brightTop = mix(uCloudCol + uSkySunCol * 0.95, vec3(0.97, 0.96, 0.93), 0.30);
  float fwd = pow(max(dot(rdW, sd), 0.0), 5.0);

  for (int i = 0; i < 7; i++) {
    if (Tr < 0.04) break;
    float tCur = t0 + (float(i) + jit) * dtL;
    vec3 pL = roL + rdL * tCur;
    float dens = puffVolDensity(pL, covK, vSeed, uTime);
    if (dens > 0.005) {
      float shD = puffVolDensity(pL + sdL * 0.32, covK, vSeed, uTime);
      float sunT = exp(-shD * 2.4);
      float hUp = clamp(pL.y * 0.5 + 0.5, 0.0, 1.0);
      float lit = clamp(sunT * (0.55 + 0.52 * hUp) + 0.12, 0.0, 1.22);
      vec3 sc = mix(darkBelly, brightTop, clamp(lit, 0.0, 1.0));
      sc += uSkySunCol * sunT * fwd * (0.35 + uSunGlow * 0.75);

      float stepT = exp(-dens * dtL * (1.85 + covK * 0.95));
      float w = Tr * (1.0 - stepT);
      accum += w * sc;
      avgLit += w * lit;
      wSum += w;
      Tr *= stepT;
    }
  }

  float alpha = (1.0 - Tr) * 0.78;
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
  gl_FragColor = vec4(cl, clamp(alpha, 0.0, 0.82));
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
    if (isMedia > 0.5 && wy > 14.0) {
      // Selective architectural media facade: mostly dark glass/mullions with 1-2 framed LED screens
      float faceHash = hash12(vec2(face * 13.7, floor(vSeed * 89.0)));
      vec2 scrUv = vec2(uvm.x / max(vDims.x, 22.0) + 0.5, (wy - 14.0) / 38.0);
      vec2 panelId = floor(vec2(scrUv.x * 1.5, scrUv.y));
      vec2 pf = fract(vec2(scrUv.x * 1.5, scrUv.y));
      float pHash = hash12(panelId * 3.7 + faceHash * 19.0 + vSeed * 43.0);
      // Only ~32% of facade zones carry an inset LED screen; the rest stays dark structural glass!
      float activeScreen = step(0.68, pHash) * step(0.10, pf.x) * step(pf.x, 0.90) * step(0.12, pf.y) * step(pf.y, 0.88);
      if (activeScreen > 0.5) {
        vec2 uvS = (pf - vec2(0.10, 0.12)) / vec2(0.80, 0.76);
        float mode = fract(pHash * 7.31);
        float motif = 0.0;
        if (mode < 0.34) {
          float sunR = length((uvS - vec2(0.5, 0.56)) * vec2(1.3, 1.0));
          motif = (1.0 - smoothstep(0.22, 0.27, sunR)) * step(0.18, fract(uvS.y * 9.0));
        } else if (mode < 0.68) {
          float diag = smoothstep(0.08, 0.0, abs(uvS.x * 0.8 + uvS.y * 0.6 - fract(uTime * 0.12 + pHash) * 1.4));
          float chyron = step(uvS.y, 0.18) * step(0.45, fract(uvS.x * 12.0 - uTime * 0.9));
          motif = clamp(diag * 0.9 + chyron * 0.8, 0.0, 1.0);
        } else {
          float wave = smoothstep(0.12, 0.0, abs(uvS.y - 0.5 - 0.24 * sin(uvS.x * 6.28 + uTime * 1.3 + pHash * 9.0)));
          motif = wave;
        }
        vec3 adBg = mix(base * 0.35, styleBillColor(uBillB) * 0.22, 0.55);
        vec3 adFg = styleBillColor(mix(uBillA, uBillB, fract(pHash * 4.1)));
        vec3 screenRgb = mix(adBg, saturate3(adFg, uSat), motif);
        float scan = 0.86 + 0.14 * sin(wy * 6.0 + uTime * 6.0);
        float emK = clamp(uBillK * max(uLightK, 0.28), 0.0, 1.35) * 0.78;
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

/* ------------------------------------------- GPU multi-strata swarm */
// Evaluates smooth 3D quadratic Bezier + coordinated banking + portal taper
// directly on the GPU so 18,000+ vehicles across 6 vertical strata cost 0ms CPU!

export const SWARM_VERT = /* glsl */ `
attribute vec4 aCurveA; // x1, z1, yBase, rate
attribute vec4 aCurveB; // cx, cz, yArch, phase
attribute vec4 aCurveC; // x2, z2, scale, closedLoop
attribute vec3 aColor;
uniform float uTime;
uniform float uHeightScale;
varying vec3 vColor;
varying vec3 vLocalP;
varying float vFade;
${GLSL_CURVE}

vec3 evalSwarmPos(float tt) {
  float u = 1.0 - tt;
  float px = u * u * aCurveA.x + 2.0 * u * tt * aCurveB.x + tt * tt * aCurveC.x;
  float pz = u * u * aCurveA.y + 2.0 * u * tt * aCurveB.y + tt * tt * aCurveC.y;
  float arch = sin(tt * 3.14159265) * aCurveB.z;
  float bob = sin(uTime * 1.7 + aCurveB.w * 25.0) * 1.4;
  float py = (aCurveA.z + arch + bob) * uHeightScale;
  return vec3(px, py, pz);
}

void main() {
  vColor = aColor;
  vLocalP = position;
  float rawT = aCurveB.w + uTime * aCurveA.w;
  float tt = fract(rawT);
  // Smooth fade-in/out at open corridor portals so vehicles never pop at endpoints
  float portal = aCurveC.w > 0.5 ? 1.0 : smoothstep(0.0, 0.045, tt) * smoothstep(1.0, 0.955, tt);
  vFade = portal;

  float eps = 0.008;
  float tPrev = aCurveC.w > 0.5 ? fract(tt - eps) : max(0.0, tt - eps);
  float tNext = aCurveC.w > 0.5 ? fract(tt + eps) : min(1.0, tt + eps);
  vec3 p0 = evalSwarmPos(tPrev);
  vec3 pC = evalSwarmPos(tt);
  vec3 p1 = evalSwarmPos(tNext);

  vec3 vel = p1 - p0;
  float vLen = length(vel);
  vec3 fwd = vLen > 1e-4 ? vel / vLen : vec3(1.0, 0.0, 0.0);
  vec3 upRef = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(upRef, fwd) + vec3(1e-5, 0.0, 0.0));
  vec3 up = normalize(cross(fwd, right));

  // Gentle coordinated banking into curve
  vec3 turnVec = (p1 - pC) - (pC - p0);
  float bankAng = clamp(dot(turnVec, right) * 0.12, -0.42, 0.42);
  float cb = cos(bankAng);
  float sb = sin(bankAng);
  vec3 bRight = right * cb + up * sb;
  vec3 bUp = -right * sb + up * cb;

  float sc = aCurveC.z * portal;
  // Sleek fusiform craft + trailing light wake (+X is forward)
  vec3 hull = vec3(position.x * 11.5, position.y * 1.45, position.z * 3.4) * sc;
  vec3 wp = pC + fwd * hull.x + bUp * hull.y + bRight * hull.z;
  wp = bendWorld(wp);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const SWARM_FRAG = /* glsl */ `
uniform float uLightK;
varying vec3 vColor;
varying vec3 vLocalP;
varying float vFade;
void main() {
  if (vFade < 0.02) discard;
  // Dark metallic nose/hull with bright forward headlights (+x) and look-tinted thruster tail (-x)
  float nose = smoothstep(0.18, 0.48, vLocalP.x);
  float tail = smoothstep(-0.12, -0.48, vLocalP.x);
  float sidePod = smoothstep(0.18, 0.45, abs(vLocalP.z));
  vec3 hullCol = vec3(0.08, 0.10, 0.15) + vColor * 0.18;
  vec3 headCol = mix(vec3(1.0, 0.95, 0.84), vColor, 0.25) * (0.85 + uLightK * 0.95);
  vec3 tailCol = vColor * (0.95 + uLightK * 1.15);
  vec3 col = hullCol;
  col = mix(col, headCol, nose * (0.55 + 0.45 * sidePod));
  col = mix(col, tailCol, tail * (0.65 + 0.35 * sidePod));
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
  // Dark architectural bezel around every billboard so panels never fuse into a solid blob
  float bezel = smoothstep(0.0, 0.045, vUv.x) * smoothstep(1.0, 0.955, vUv.x)
              * smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
  float layoutId = fract(vSeed * 13.37);
  vec3 darkBg = mix(uBillB, uBillA, 0.25) * 0.09;
  vec3 col = darkBg;

  if (layoutId < 0.22) {
    // 1. Cyber-sun horizon disc + segmented scan bands
    vec2 dc = (vUv - vec2(0.5, 0.54)) * vec2(1.45, 1.0);
    float sunDisc = (1.0 - smoothstep(0.24, 0.27, length(dc))) * step(0.22, fract(vUv.y * 11.0));
    float horLine = smoothstep(0.03, 0.0, abs(vUv.y - 0.28));
    col = mix(darkBg, mix(uBillB, uBillA, clamp(vUv.y * 1.2, 0.0, 1.0)), clamp(sunDisc + horLine * 0.8, 0.0, 1.0));
  } else if (layoutId < 0.46) {
    // 2. Bold diagonal slash + vertical glyph column (high negative space)
    float slash = smoothstep(0.11, 0.01, abs((vUv.x - 0.46) * 0.85 + (vUv.y - 0.5) * 0.55));
    float glyphCol = step(0.74, vUv.x) * step(vUv.x, 0.88) * step(0.38, fract(vUv.y * 8.0 - uTime * 0.25)) * step(0.35, hash12(vec2(floor(vUv.y * 8.0), vSeed * 31.0)));
    col = mix(darkBg, uBillA, slash * 0.88);
    col = mix(col, uBillB, glyphCol * 0.92);
  } else if (layoutId < 0.70) {
    // 3. Minimalist flowing sine wave + bottom scrolling ticker
    float wY = 0.56 + 0.20 * sin(vUv.x * 6.283 + uTime * (0.8 + vSeed) + vSeed * 12.0);
    float ribbon = smoothstep(0.09, 0.01, abs(vUv.y - wY));
    float chyron = step(0.08, vUv.y) * step(vUv.y, 0.20) * step(0.42, fract(vUv.x * 14.0 - uTime * 0.65));
    col = mix(darkBg, uBillB, ribbon * 0.9);
    col = mix(col, uBillA, chyron * 0.85);
  } else {
    // 4. Asymmetric hero portrait block + crisp caption bars
    float portrait = step(0.08, vUv.x) * step(vUv.x, 0.46) * step(0.16, vUv.y) * step(vUv.y, 0.84);
    float ring = smoothstep(0.035, 0.0, abs(length((vUv - vec2(0.27, 0.52)) * vec2(1.4, 1.0)) - 0.14));
    float copyBars = step(0.54, vUv.x) * step(vUv.x, 0.90) * step(0.48, fract(vUv.y * 5.0)) * step(0.22, vUv.y) * step(vUv.y, 0.78);
    col = mix(darkBg, uBillB * 0.55, portrait * 0.65);
    col = mix(col, uBillA, clamp(ring + copyBars * 0.82, 0.0, 1.0));
  }

  // Thin inner neon trim line
  float innerRim = smoothstep(0.025, 0.0, abs(max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) - 0.45));
  col += mix(uBillA, uBillB, 0.5) * innerRim * 0.35;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 mono = mix(uBillB * 0.30, uBillA * 0.95, clamp(lum, 0.0, 1.2));
  col = mix(col, mono, clamp(uBillMono, 0.0, 1.0));
  col = saturate3(col, uSat * (1.0 - 0.85 * clamp(uBillMono, 0.0, 1.0)));

  col *= 0.88 + 0.12 * sin(vUv.y * 85.0 + uTime * 2.5);
  float k = clamp(uBillK * max(uLightK, 0.25), 0.0, 1.25) * (0.68 + 0.16 * sin(uTime * 1.3 + vSeed * 20.0));
  gl_FragColor = vec4(col * (0.28 + k * 0.72) * bezel, 1.0);
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
  float r = length(cUv * vec2(1.35, 1.0));
  // Crisp thin wireframe rings & sparse telemetry lines (mostly transparent negative space!)
  float rings = smoothstep(0.024, 0.0, abs(fract(r * 4.0 - uTime * 0.24 + vSeed * 4.0) - 0.5)) * smoothstep(0.52, 0.12, r);
  float horiz = smoothstep(0.018, 0.0, abs(fract(vUv.y * 9.0 - uTime * 0.18 + vSeed * 3.0) - 0.5)) * 0.38;
  vec2 g = vec2(vUv.x * 9.0, vUv.y * 6.0 - uTime * 0.18);
  float blocks = hash12(floor(g) + vSeed * 17.0);
  float glyphs = step(0.78, blocks) * step(0.28, fract(g.x)) * step(fract(g.x), 0.72) * step(0.28, fract(g.y));
  float motif = clamp(rings * 0.95 + glyphs * 0.75 + horiz, 0.0, 1.0);
  if (motif < 0.03) discard;

  vec3 col = mix(uBillB, uBillA, clamp(rings * 0.65 + fract(vSeed * 5.3) * 0.45, 0.0, 1.0));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 mono = mix(uBillB * 0.4, uBillA * 1.05, clamp(lum, 0.0, 1.2));
  col = mix(col, mono, clamp(uBillMono, 0.0, 1.0));
  col = saturate3(col, uSat * (1.0 - 0.85 * clamp(uBillMono, 0.0, 1.0)));

  float scan = 0.68 + 0.32 * sin(vUv.y * 160.0 + uTime * 8.0);
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x)
             * smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
  float a = motif * scan * edge * clamp(uBillK, 0.0, 1.3) * max(uLightK, 0.3) * 0.36;
  gl_FragColor = vec4(col * 0.85, clamp(a, 0.0, 0.38));
}
`;
