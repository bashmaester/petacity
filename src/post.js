// Multi-pass post-processing & optical camera projection pipeline (Three.js r170 / WebGL 2):
//   0. Optional 6-Face GPU Cubemap Omnidirectional Optical Ray-Projector (for true 180°–360°
//      Fisheye, Equirectangular, Little Planet, Inception Folded Sky-Tunnel, 250° Probe &
//      Prismatic Kaleidoscope projections) rendered into `sceneRT` prior to HDR Bloom!
//   1. Scene render -> offscreen HalfFloat render target (+ hardware DepthTexture)
//   2. Bright-pass extraction -> quarter-res ping-pong Gaussian bloom (4 blur passes)
//   3. Composite pass -> Brown-Conrady barrel/pincushion/mustache distortion, Panini
//      architectural wide-angle, Anamorphic 2.39:1 squeeze & streak flare, 12-tap Vogel
//      Tilt-Shift Scheimpflug bokeh, chromatic dispersion, ACES grading, StormyClouds
//      film grain + specks, and 6 Artistic / X-Ray Render Styles!
import * as THREE from '../vendor/three.module.js';

export const ART_STYLE_NAMES = [
  'Cinema (Default)',
  'X-Ray Structural',
  'Architectural Ink Sketch',
  'Charcoal & Chalk',
  'Painterly Impasto',
  'Impressionist Nocturne',
];

export const LENS_MODE_NAMES = [
  'Rectilinear Cinema Lens',
  'Panini Architectural Wide',
  'Anamorphic Scope 2.39:1',
  'Tilt-Shift Miniature',
  '180° Hemispherical Fisheye',
  '360° Equirectangular Panorama',
  'Little Planet (360° Nadir)',
  'Inception Folded Sky-City',
  'Hyper-Fisheye 250° Probe',
  'Mirage Prismatic Kaleidoscope',
];

export const CAMERA_ANGLE_PRESETS = [
  { id: 'standard', label: 'Standard Cinema (58° · Clean)', lensMode: 0, fov: 58, distort: 0, zoom: 1.0, roll: 0, anamorphic: 0, tiltShift: 0 },
  { id: 'wormseye', label: "Ultra-Wide Canyon Worm's-Eye (+54° Up)", lensMode: 0, fov: 122, distort: 0.38, zoom: 1.0, roll: 0, anamorphic: 0, tiltShift: 0, pitchDeg: 54, altitude: 24 },
  { id: 'dutch_noir', label: 'Noir Dutch Cant (+28° Oblique)', lensMode: 2, fov: 86, distort: 0.22, zoom: 1.0, roll: 28, anamorphic: 0.65, tiltShift: 0, pitchDeg: -8 },
  { id: 'telephoto', label: 'Telephoto Compression Stack (18°)', lensMode: 0, fov: 18, distort: -0.10, zoom: 1.0, roll: 0, anamorphic: 0.22, tiltShift: 0.24, pitchDeg: -6 },
  { id: 'panini_arch', label: 'Panini Super-Wide Architecture (130°)', lensMode: 1, fov: 130, distort: 0.14, zoom: 1.0, roll: 0, anamorphic: 0, tiltShift: 0, pitchDeg: 8 },
  { id: 'nadir_drop', label: 'Skyscraper Nadir Vertigo (-86° Down)', lensMode: 0, fov: 114, distort: 0.44, zoom: 1.0, roll: 18, anamorphic: 0, tiltShift: 0, pitchDeg: -86, altitude: 340 },
  { id: 'fisheye_dome', label: '180° Circular Fisheye Dome', lensMode: 4, fov: 90, distort: 0.16, zoom: 0.78, roll: 0, anamorphic: 0, tiltShift: 0 },
  { id: 'little_planet', label: '360° Little Planet Floating City', lensMode: 6, fov: 90, distort: 0, zoom: 1.0, roll: 0, anamorphic: 0, tiltShift: 0, altitude: 260 },
  { id: 'inception_fold', label: 'Inception Folded Horizon Ceiling', lensMode: 7, fov: 90, distort: 0.10, zoom: 1.0, roll: 0, anamorphic: 0, tiltShift: 0, pitchDeg: 0, altitude: 68 },
  { id: 'vr_360', label: '360° Equirectangular Full Sphere', lensMode: 5, fov: 90, distort: 0, zoom: 1.0, roll: 0, anamorphic: 0, tiltShift: 0 },
  { id: 'probe_250', label: '250° Hyper-Fisheye Bug-Eye Probe', lensMode: 8, fov: 90, distort: 0.20, zoom: 1.0, roll: 0, anamorphic: 0, tiltShift: 0, altitude: 38 },
  { id: 'kaleido_prism', label: 'Mirage Prismatic Kaleidoscope', lensMode: 9, fov: 90, distort: 0, zoom: 1.05, roll: 15, anamorphic: 0, tiltShift: 0 },
  { id: 'inverted_sky', label: 'Upside-Down Inverted Skyline (180°)', lensMode: 1, fov: 108, distort: 0.20, zoom: 1.0, roll: 180, anamorphic: 0.35, tiltShift: 0, pitchDeg: -10 },
  { id: 'miniature_tilt', label: 'Tabletop Miniature Diorama (Tilt-Shift)', lensMode: 3, fov: 42, distort: 0, zoom: 1.0, roll: 0, anamorphic: 0, tiltShift: 0.85, pitchDeg: -32, altitude: 280 },
];

export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  // Clamp firefly spikes so bloom stays silky rather than blowing out to white blocks
  c = min(c, vec3(5.0));
  float lum = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.55;
  float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);
  soft = (soft * soft) / max(4.0 * knee, 1e-4);
  float contrib = max(soft, lum - uThreshold) / max(lum, 1e-4);
  gl_FragColor = vec4(c * max(contrib, 0.0), 1.0);
}
`;

export const BLUR_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  // 9-tap separable Gaussian via 5 bilinear taps
  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
  sum += texture2D(tDiffuse, vUv + uDir * 1.384615).rgb * 0.316216;
  sum += texture2D(tDiffuse, vUv - uDir * 1.384615).rgb * 0.316216;
  sum += texture2D(tDiffuse, vUv + uDir * 3.230769).rgb * 0.070270;
  sum += texture2D(tDiffuse, vUv - uDir * 3.230769).rgb * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}
`;

// Omnidirectional 6-Face Cubemap Optical Ray-Projector (`uLensMode` 4..9)
export const CUBE_LENS_FRAG = /* glsl */ `
uniform samplerCube tCube;
uniform vec2 uRes;
uniform mat3 uCamBasis;
uniform vec3 uCamAngles;
uniform float uLensMode;
uniform float uLensDistort;
uniform float uLensZoom;
uniform float uAnamorphic;
uniform float uTime;
varying vec2 vUv;

const float PC_PI = 3.14159265359;

void main() {
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = (vUv - 0.5) * 2.0;
  float zoom = max(uLensZoom, 0.15);

  vec2 q = vec2(p.x * aspect, p.y) / zoom;
  q.x *= mix(1.0, 1.42, clamp(uAnamorphic, 0.0, 1.0));

  vec3 worldDir = vec3(0.0, 0.0, 1.0);
  float mask = 1.0;
  float rimGlow = 0.0;

  if (uLensMode < 4.5) {
    // Mode 4: 180-deg Hemispherical Fisheye (Circular Dome at Zoom < 0.88, Full-Frame at Zoom >= 1.0)
    float diagFill = mix(1.0, sqrt(1.0 + aspect * aspect) * 0.88, clamp((zoom - 0.82) * 3.2, 0.0, 1.0));
    vec2 fq = vec2(p.x * aspect, p.y) / (max(zoom, 0.2) * diagFill);
    fq.x *= mix(1.0, 1.35, clamp(uAnamorphic, 0.0, 1.0));
    float r = length(fq);
    float rWarped = r * max(0.25, 1.0 + uLensDistort * 0.24 * r * r);
    float maxTheta = PC_PI * (0.52 + 0.14 * clamp(uLensDistort, -0.5, 1.0));
    float theta = rWarped * (PC_PI * 0.52);
    float phi = atan(fq.y, fq.x);
    vec3 camRay = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
    worldDir = normalize(uCamBasis * camRay);
    if (zoom < 0.94) {
      float ap = maxTheta / (PC_PI * 0.52);
      mask = 1.0 - smoothstep(ap - 0.018, ap + 0.008, rWarped);
      rimGlow = exp(-pow((rWarped - (ap - 0.012)) * 55.0, 2.0)) * 0.22;
    }
  } else if (uLensMode < 5.5) {
    // Mode 5: 360-deg x 180-deg Equirectangular Spherical Panorama
    float lon = (p.x / zoom) * PC_PI;
    float lat = (p.y / zoom) * (PC_PI * 0.5);
    lat += uLensDistort * 0.20 * sin(lon * 2.0) * cos(clamp(lat, -1.55, 1.55));
    lat = clamp(lat, -PC_PI * 0.499, PC_PI * 0.499);
    // Horizontal meridian aligns with camera yaw + roll tilt; nadir/zenith stay world-true
    float yaw = uCamAngles.y;
    float pitchOff = uCamAngles.x * 0.65;
    float roll = uCamAngles.z;
    vec2 pr = vec2(
      lon * cos(roll) - lat * sin(roll),
      lon * sin(roll) + lat * cos(roll)
    );
    float effLat = clamp(pr.y + pitchOff, -PC_PI * 0.499, PC_PI * 0.499);
    float effLon = pr.x;
    vec3 localDir = vec3(cos(effLat) * sin(effLon), sin(effLat), cos(effLat) * cos(effLon));
    float cy = cos(yaw);
    float sy = sin(yaw);
    // Camera forward at yaw=0 is (0, 0, -1) in Three.js world space
    worldDir = normalize(vec3(
      localDir.x * cy - localDir.z * sy,
      localDir.y,
      -localDir.x * sy - localDir.z * cy
    ));
  } else if (uLensMode < 6.5) {
    // Mode 6: Little Planet (360-deg Stereographic Nadir Globe)
    float rad = length(q) * 1.28;
    rad = rad * max(0.25, 1.0 + uLensDistort * 0.22 * rad);
    float theta = 2.0 * atan(rad); // 0 = straight down nadir, PI = zenith
    float az = atan(q.y, q.x) - uCamAngles.y + uCamAngles.z + PC_PI * 0.5;
    // Stereographic vector centered on world nadir (0, -1, 0), gently tiltable via camera pitch
    vec3 planetRay = vec3(sin(theta) * cos(az), -cos(theta), sin(theta) * sin(az));
    float tilt = clamp((uCamAngles.x + 0.35) * 0.45, -0.85, 0.85);
    float ct = cos(tilt);
    float st = sin(tilt);
    worldDir = normalize(vec3(
      planetRay.x,
      planetRay.y * ct - planetRay.z * st,
      planetRay.y * st + planetRay.z * ct
    ));
  } else if (uLensMode < 7.5) {
    // Mode 7: Inception Folded Sky-City (continuous horizon-to-zenith-to-inverted-rear fold!)
    float foldSpan = (1.88 + uLensDistort * 0.45) / zoom;
    float foldAng = (p.y + 0.34) * foldSpan;
    float latSpread = q.x * (0.94 + 0.22 * abs(p.y));
    vec3 camRay = normalize(vec3(latSpread, sin(foldAng), cos(foldAng)));
    worldDir = normalize(uCamBasis * camRay);
  } else if (uLensMode < 8.5) {
    // Mode 8: Hyper-Fisheye 250-deg Wrap-Around Probe Lens
    float r = length(q);
    float theta = r * (2.18 + uLensDistort * 0.35);
    float phi = atan(q.y, q.x);
    vec3 camRay = vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
    worldDir = normalize(uCamBasis * camRay);
    if (theta > PC_PI * 0.98) {
      mask = 1.0 - smoothstep(PC_PI * 0.96, PC_PI * 1.02, theta);
    }
  } else {
    // Mode 9: Mirage Prismatic Kaleidoscope (Dihedral Crystal Mirror Optics)
    float sectors = floor(6.0 + clamp(uLensDistort * 3.0, -2.0, 4.0));
    float r = length(q);
    float phi = atan(q.y, q.x) + uCamAngles.z;
    float seg = (2.0 * PC_PI) / max(sectors, 3.0);
    float mPhi = mod(phi + PC_PI * 4.0, seg);
    if (mPhi > seg * 0.5) mPhi = seg - mPhi;
    mPhi += sin(uTime * 0.104719755) * 0.12;
    float theta = 2.0 * atan(r * 0.82);
    vec3 camRay = vec3(sin(theta) * cos(mPhi), sin(theta) * sin(mPhi), cos(theta));
    worldDir = normalize(uCamBasis * camRay);
  }

  vec3 col = textureCube(tCube, worldDir).rgb * mask;
  col += vec3(0.10, 0.16, 0.24) * rimGlow;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const COMP_FRAG = /* glsl */ `
// petacity-post-pass
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloom;
uniform float uLens;
uniform float uVignette;
uniform float uContrast;
uniform float uTemp;
uniform float uGradeSat;
uniform vec3 uTint;
uniform float uFilm;
uniform float uArtStyle;
uniform float uArtStrength;
uniform float uCamNear;
uniform float uCamFar;
uniform float uLensMode;
uniform float uLensDistort;
uniform float uLensZoom;
uniform float uAnamorphic;
uniform float uTiltShift;
uniform float uTiltAngle;
varying vec2 vUv;

float grainHash(vec2 v) {
  return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 hash22(vec2 p) {
  return vec2(
    grainHash(p),
    grainHash(p + vec2(37.2, 19.7))
  );
}

float filmGrain(vec2 fc, float t) {
  vec2 shift = vec2(fract(t * 12.9), fract(t * 7.3)) * 512.0;
  return grainHash(floor(fc) + shift);
}

vec3 acesFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float luma3(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float readLinearDepth(vec2 q) {
  float rawD = texture2D(tDepth, clamp(q, vec2(0.001), vec2(0.999))).r;
  float zNdc = rawD * 2.0 - 1.0;
  return (2.0 * uCamNear * uCamFar) / max(uCamFar + uCamNear - zNdc * (uCamFar - uCamNear), 1e-4);
}

// Optical single-pass UV projection (Modes 0..3: Brown-Conrady, Panini Wide, Anamorphic Scope)
vec3 warpOpticalUv(vec2 inUv) {
  if (uLensMode > 3.5) {
    // Modes 4..9 already projected via 6-face cubemap ray-projector
    return vec3(inUv, 1.0);
  }
  float aspect = uRes.x / max(uRes.y, 1.0);
  float zoom = max(uLensZoom, 0.15);
  vec2 p = (inUv - 0.5) * 2.0 / zoom;

  float effAna = clamp(uAnamorphic + (uLensMode > 1.5 && uLensMode < 2.5 ? 0.55 : 0.0), 0.0, 1.2);
  p.x /= mix(1.0, 1.34, clamp(effAna, 0.0, 1.0));

  vec2 outP = p;
  if (uLensMode > 0.5 && uLensMode < 1.5) {
    // Mode 1: Exact Panini Cylindrical-Stereographic Architectural Wide Projection
    // Keeps vertical skyscraper lines 100% plumb-straight while compressing wide horizontals!
    float sx = p.x * (1.18 + max(uLensDistort, 0.0) * 0.35);
    float kPan = (sx * sx) * 0.25;
    float cosT = (1.0 - kPan) / (1.0 + kPan);
    float sinT = sx / (1.0 + kPan);
    float denom = max(cosT, 0.14);
    float fitX = 1.18 + max(uLensDistort, 0.0) * 0.35;
    float maxTan = (fitX / (1.0 + fitX * fitX * 0.25)) / max((1.0 - fitX * fitX * 0.25) / (1.0 + fitX * fitX * 0.25), 0.14);
    outP.x = (sinT / denom) / max(maxTan, 0.5);
    outP.y = (p.y / mix(1.0, denom, 0.72)) / (1.0 + fitX * 0.22);
    if (abs(uLensDistort) > 0.005) {
      float r2p = dot(outP, outP);
      outP *= 1.0 + uLensDistort * 0.14 * r2p;
    }
  } else {
    // Modes 0, 2, 3: Physical Brown-Conrady Radial + Higher-Order Mustache Distortion
    float k1 = uLensDistort * 0.38 + (uLensMode > 1.5 && uLensMode < 2.5 ? 0.10 : 0.0);
    float k2 = -uLensDistort * 0.065;
    vec2 pa = vec2(p.x * aspect, p.y);
    float r2 = dot(pa, pa) / max(1.0 + aspect * aspect, 1.0);
    float radScale = 1.0 + k1 * r2 + k2 * r2 * r2;
    // Auto-compensate edge scale at zoom >= 0.96 so positive barrel never clips black corners unless zoomed out
    float edgeComp = (zoom >= 0.95)
      ? 1.0 / max(1.0 + max(k1, 0.0) * 0.92 + max(-k1, 0.0) * 0.18, 0.35)
      : 1.0;
    outP = p * radScale * edgeComp;
  }

  vec2 wUv = outP * 0.5 + 0.5;
  float inside = (
    step(-0.002, wUv.x) * step(wUv.x, 1.002) *
    step(-0.002, wUv.y) * step(wUv.y, 1.002)
  );
  // Subtle widescreen 2.39:1 cinema matte in dedicated Anamorphic Scope mode (mode 2)
  if (uLensMode > 1.5 && uLensMode < 2.5 && aspect < 2.25) {
    float targetH = (uRes.x / 2.35) / max(uRes.y, 1.0);
    float barHalf = clamp(targetH * 0.5, 0.36, 0.5);
    inside *= smoothstep(barHalf + 0.006, barHalf - 0.002, abs(inUv.y - 0.5));
  }
  return vec3(clamp(wUv, vec2(0.001), vec2(0.999)), inside);
}

// Returns vec4(gradX, gradY, lumaEdge, depthEdge)
vec4 evalEdges(vec2 q, vec2 px) {
  float lTL = luma3(acesFilm(texture2D(tScene, q + vec2(-px.x,  px.y)).rgb));
  float lTC = luma3(acesFilm(texture2D(tScene, q + vec2( 0.0,   px.y)).rgb));
  float lTR = luma3(acesFilm(texture2D(tScene, q + vec2( px.x,  px.y)).rgb));
  float lML = luma3(acesFilm(texture2D(tScene, q + vec2(-px.x,  0.0 )).rgb));
  float lMR = luma3(acesFilm(texture2D(tScene, q + vec2( px.x,  0.0 )).rgb));
  float lBL = luma3(acesFilm(texture2D(tScene, q + vec2(-px.x, -px.y)).rgb));
  float lBC = luma3(acesFilm(texture2D(tScene, q + vec2( 0.0,  -px.y)).rgb));
  float lBR = luma3(acesFilm(texture2D(tScene, q + vec2( px.x, -px.y)).rgb));

  float gx = (lTR + 2.0 * lMR + lBR) - (lTL + 2.0 * lML + lBL);
  float gy = (lTL + 2.0 * lTC + lTR) - (lBL + 2.0 * lBC + lBR);
  float lumE = length(vec2(gx, gy));

  float depE = 0.0;
  if (uLensMode < 3.5) {
    float dC = readLinearDepth(q);
    float dL = readLinearDepth(q - vec2(px.x * 1.4, 0.0));
    float dR = readLinearDepth(q + vec2(px.x * 1.4, 0.0));
    float dU = readLinearDepth(q + vec2(0.0, px.y * 1.4));
    float dD = readLinearDepth(q - vec2(0.0, px.y * 1.4));
    depE = clamp((abs(dL - dR) + abs(dU - dD)) / max(dC * 0.22 + 3.0, 1.0), 0.0, 2.0);
  }
  return vec4(gx, gy, lumE, depE);
}

// 4-quadrant Kuwahara edge-preserving painterly kernel
vec3 evalKuwahara(vec2 q, vec2 px, float radiusPx) {
  vec2 stepUv = px * radiusPx;
  vec3 bestMean = acesFilm(texture2D(tScene, q).rgb);
  float minVar = 1e9;

  for (int qy = 0; qy < 2; qy++) {
    for (int qx = 0; qx < 2; qx++) {
      vec2 base = vec2(qx == 0 ? -1.0 : 0.0, qy == 0 ? -1.0 : 0.0);
      vec3 m1 = vec3(0.0);
      float m2 = 0.0;
      for (int j = 0; j < 3; j++) {
        for (int i = 0; i < 3; i++) {
          vec2 off = (base + vec2(float(i), float(j)) * 0.5) * stepUv;
          vec3 sCol = acesFilm(texture2D(tScene, clamp(q + off, vec2(0.001), vec2(0.999))).rgb);
          float l = luma3(sCol);
          m1 += sCol;
          m2 += l * l;
        }
      }
      m1 /= 9.0;
      float meanL = luma3(m1);
      float variance = abs(m2 / 9.0 - meanL * meanL);
      if (variance < minVar) {
        minVar = variance;
        bestMean = m1;
      }
    }
  }
  return bestMean;
}

// 12-tap Golden-Angle Vogel Disk Bokeh for Tilt-Shift Scheimpflug Miniature Optics
vec3 sampleTiltShiftBokeh(vec2 q, vec2 px, float cocPx, float anaAmt) {
  vec3 acc = vec3(0.0);
  float wSum = 0.0;
  vec2 oval = vec2(mix(1.0, 0.58, clamp(anaAmt, 0.0, 1.0)), mix(1.0, 1.35, clamp(anaAmt, 0.0, 1.0)));
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float rad = sqrt((fi + 0.5) / 12.0) * cocPx;
    float ang = fi * 2.39996323;
    vec2 off = vec2(cos(ang), sin(ang)) * oval * rad * px;
    vec3 tap = min(texture2D(tScene, clamp(q + off, vec2(0.001), vec2(0.999))).rgb, vec3(6.0));
    float w = 1.0 + max(0.0, luma3(tap) - 0.55) * 1.85;
    acc += tap * w;
    wSum += w;
  }
  return acc / max(wSum, 1e-4);
}

void main() {
  vec3 warped = warpOpticalUv(vUv);
  vec2 uv = warped.xy;
  float frameMask = warped.z;

  vec2 centered = vUv - 0.5;
  float r2 = dot(centered, centered);
  vec2 px = 1.0 / max(uRes, vec2(1.0));

  float effAna = clamp(uAnamorphic + (uLensMode > 1.5 && uLensMode < 2.5 ? 0.65 : 0.0), 0.0, 1.2);
  float effTilt = clamp(max(uTiltShift, (uLensMode > 2.5 && uLensMode < 3.5) ? 0.78 : 0.0), 0.0, 1.2);

  // Radial + lateral optical chromatic dispersion (enhanced on wide/distorted/anamorphic optics)
  float caGain = uLens * (1.0 + abs(uLensDistort) * 0.85 + effAna * 0.45);
  vec2 caShift = centered * (0.0055 * caGain * (0.35 + r2 * 2.4));
  float sr = texture2D(tScene, clamp(uv + caShift, vec2(0.001), vec2(0.999))).r;
  float sg = texture2D(tScene, uv).g;
  float sb = texture2D(tScene, clamp(uv - caShift, vec2(0.001), vec2(0.999))).b;
  vec3 sceneCol = vec3(sr, sg, sb);

  // Scheimpflug Tilt-Shift Miniature Diorama Bokeh
  if (effTilt > 0.01) {
    vec2 tiltN = vec2(sin(uTiltAngle), cos(uTiltAngle));
    float planeDist = abs(dot(vUv - 0.5, tiltN));
    float coc = smoothstep(0.065, 0.44, planeDist) * effTilt * 11.5;
    if (coc > 0.35) {
      vec3 blurred = sampleTiltShiftBokeh(uv, px, coc, effAna);
      sceneCol = mix(sceneCol, blurred, clamp(coc / 4.0, 0.0, 0.96));
    }
  }

  // Soft bloom + wide horizontal anamorphic cinema lens streak
  vec3 bloom = texture2D(tBloom, uv).rgb;
  vec3 anaStreak = (
    texture2D(tBloom, clamp(uv + vec2(0.018, 0.0), vec2(0.001), vec2(0.999))).rgb +
    texture2D(tBloom, clamp(uv - vec2(0.018, 0.0), vec2(0.001), vec2(0.999))).rgb +
    texture2D(tBloom, clamp(uv + vec2(0.044, 0.0), vec2(0.001), vec2(0.999))).rgb * 0.52 +
    texture2D(tBloom, clamp(uv - vec2(0.044, 0.0), vec2(0.001), vec2(0.999))).rgb * 0.52 +
    texture2D(tBloom, clamp(uv + vec2(0.082, 0.0), vec2(0.001), vec2(0.999))).rgb * (0.28 * effAna) +
    texture2D(tBloom, clamp(uv - vec2(0.082, 0.0), vec2(0.001), vec2(0.999))).rgb * (0.28 * effAna)
  ) * 0.22;
  vec3 anaTint = mix(vec3(1.0), vec3(0.62, 0.88, 1.32), clamp(effAna * 0.75, 0.0, 0.75));

  vec3 col = sceneCol + bloom * uBloom + anaStreak * anaTint * ((uLens * 0.52 + effAna * 0.88) * uBloom);

  // ACES-inspired filmic tonemap
  col = acesFilm(col);

  // Color temperature (cool cyan <-> warm amber) + look tint
  col.r *= 1.0 + uTemp * 0.14;
  col.b *= 1.0 - uTemp * 0.14;
  col *= mix(vec3(1.0), uTint, 0.22);

  // Contrast around mid-grey & saturation grade (boosted subtly in miniature diorama mode)
  float effSat = uGradeSat * (1.0 + effTilt * 0.12);
  col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
  float lum = luma3(col);
  col = clamp(mix(vec3(lum), col, effSat), 0.0, 1.0);

  // --- Phase-10 Artistic & Diagnostic Render Styles (uArtStyle 1..5) ---
  if (uArtStyle > 0.5 && uArtStrength > 0.01) {
    float artMix = clamp(uArtStrength, 0.0, 1.0);
    float artBoost = max(uArtStrength, 0.25);
    vec2 fc = gl_FragCoord.xy;

    if (uArtStyle < 1.5) {
      float rawD = texture2D(tDepth, uv).r;
      float dLin = readLinearDepth(uv);
      float isSky = (uLensMode > 3.5) ? 0.0 : step(0.9996, rawD);
      vec4 ed = evalEdges(uv, px);

      float volShell = (uLensMode > 3.5 ? 0.55 : exp(-dLin * 0.00038)) * (1.0 - isSky);
      float wire = clamp(ed.z * 0.95 + ed.w * 1.45, 0.0, 1.6) * artBoost;
      float bloomHot = clamp(luma3(bloom) * 0.85, 0.0, 1.4);

      vec3 xrayBg = mix(vec3(0.010, 0.024, 0.055), vec3(0.020, 0.052, 0.105), 1.0 - uv.y);
      vec3 shellCol = vec3(0.05, 0.30, 0.58) * volShell * (0.35 + 0.65 * (1.0 - lum));
      float scanBand = 0.88 + 0.12 * sin(fc.y * 1.35);
      vec3 edgeGlow = vec3(0.28, 0.86, 1.0) * wire + vec3(0.90, 0.98, 1.0) * pow(max(wire - 0.35, 0.0), 1.7);
      vec3 hotTracer = mix(vec3(0.20, 0.95, 0.88), vec3(1.0, 0.62, 0.24), clamp(bloomHot * 0.7, 0.0, 1.0)) * bloomHot * 0.72;

      vec2 gridCell = abs(fract(fc / 64.0) - 0.5) * 64.0;
      float diagGrid = (1.0 - smoothstep(0.0, 1.1, min(gridCell.x, gridCell.y))) * 0.055;

      vec3 xray = (xrayBg + shellCol + edgeGlow + hotTracer) * scanBand + vec3(0.18, 0.62, 0.85) * diagGrid;
      col = mix(col, clamp(xray, 0.0, 1.0), artMix);
    } else if (uArtStyle < 2.5) {
      vec2 tremor = px * 0.75 * vec2(sin(fc.y * 0.11 + 1.3), cos(fc.x * 0.11 - 0.7));
      vec4 ed = evalEdges(uv + tremor, px);
      float tooth = (grainHash(floor(fc * 0.85)) - 0.5) * 0.055;
      vec3 paper = vec3(0.952, 0.928, 0.876) + tooth;
      vec3 wash = mix(paper, clamp(col * 1.25 + 0.18, 0.0, 1.0), 0.28);

      float tone = clamp(lum + tooth * 0.6, 0.0, 1.0);
      float h1 = sin((fc.x * 0.83 + fc.y * 0.56) * 1.45);
      float h2 = sin((fc.x * 0.56 - fc.y * 0.83) * 1.55);
      float h3 = sin((fc.x * 0.14 + fc.y * 0.99) * 1.75);
      float hatch = 0.0;
      if (tone < 0.66) hatch = max(hatch, smoothstep(0.55, 0.92, h1) * smoothstep(0.66, 0.36, tone) * 0.45);
      if (tone < 0.44) hatch = max(hatch, smoothstep(0.52, 0.90, h2) * smoothstep(0.44, 0.18, tone) * 0.62);
      if (tone < 0.24) hatch = max(hatch, smoothstep(0.45, 0.88, h3) * smoothstep(0.24, 0.04, tone) * 0.78);

      float contour = clamp((ed.z * 1.15 + ed.w * 1.65) * artBoost, 0.0, 1.0);
      float inkMask = clamp(max(contour, hatch * artBoost * 0.92), 0.0, 1.0);
      vec3 inkCol = vec3(0.09, 0.10, 0.14);
      vec3 sketch = mix(wash, inkCol, inkMask);
      col = mix(col, sketch, artMix);
    } else if (uArtStyle < 3.5) {
      vec4 ed = evalEdges(uv, px);
      float laidRib = sin(fc.y * 1.8) * 0.018;
      float paperGrain = (grainHash(floor(fc * 0.65)) - 0.5) * 0.09 + laidRib;
      vec3 tonedPaper = vec3(0.465, 0.452, 0.432) + paperGrain;

      float stroke = grainHash(floor(vec2(fc.x * 0.72 + fc.y * 0.68, (fc.x * -0.68 + fc.y * 0.72) * 0.18)));
      float darkMass = smoothstep(0.56, 0.05, lum) * (0.62 + 0.38 * stroke);
      float charEdge = clamp((ed.z * 1.05 + ed.w * 1.35) * artBoost, 0.0, 1.0) * (0.72 + 0.28 * stroke);

      vec3 charcoal = mix(tonedPaper, vec3(0.055, 0.052, 0.058), clamp(max(darkMass * 0.92, charEdge * 0.88), 0.0, 1.0));
      float chalkAmt = smoothstep(0.58, 0.96, lum + luma3(bloom) * 0.45) * (0.68 + 0.32 * stroke);
      charcoal = mix(charcoal, vec3(0.965, 0.955, 0.930), clamp(chalkAmt * artBoost, 0.0, 0.95));
      col = mix(col, charcoal, artMix);
    } else if (uArtStyle < 4.5) {
      float kRad = 2.2 + 2.4 * artBoost;
      vec3 painted = evalKuwahara(uv, px, kRad);
      painted.r *= 1.0 + uTemp * 0.14;
      painted.b *= 1.0 - uTemp * 0.14;
      painted *= mix(vec3(1.0), uTint, 0.22);
      painted = clamp((painted - 0.5) * (uContrast * 1.06) + 0.5, 0.0, 1.0);
      float pLum = luma3(painted);
      painted = clamp(mix(vec3(pLum), painted, effSat * 1.18), 0.0, 1.0);

      vec4 ed = evalEdges(uv, px * 1.6);
      float canvasWeave = (sin(fc.x * 1.35) * sin(fc.y * 1.35)) * 0.024;
      float ridgeCatch = clamp((ed.x + ed.y) * 0.22, -0.09, 0.12);
      painted = clamp(painted + canvasWeave + ridgeCatch + bloom * (uBloom * 0.22), 0.0, 1.0);
      col = mix(col, painted, artMix);
    } else {
      vec4 ed = evalEdges(uv, px * 2.2);
      vec2 grad = vec2(ed.x, ed.y);
      float gLen = length(grad);
      vec2 tang = gLen > 0.015 ? normalize(vec2(-grad.y, grad.x)) : vec2(0.866, 0.5);
      vec2 perp = vec2(-tang.y, tang.x);

      vec2 dabScale = vec2(10.5, 4.6) * (0.75 + 0.35 * artBoost);
      vec2 rotFc = vec2(dot(fc, tang), dot(fc, perp)) / dabScale;
      vec2 cellId = floor(rotFc);
      vec2 cellFrac = fract(rotFc) - 0.5;
      vec2 jit = (hash22(cellId) - 0.5) * 0.55;

      vec2 centerRotPx = (cellId + 0.5 + jit) * dabScale;
      vec2 strokeFc = tang * centerRotPx.x + perp * centerRotPx.y;
      vec2 strokeUv = warpOpticalUv(clamp(strokeFc * px, vec2(0.002), vec2(0.998))).xy;

      vec3 dabCol = acesFilm(texture2D(tScene, strokeUv).rgb + texture2D(tBloom, strokeUv).rgb * (uBloom * 0.85));
      dabCol.r *= 1.0 + uTemp * 0.14;
      dabCol.b *= 1.0 - uTemp * 0.14;
      dabCol *= mix(vec3(1.0), uTint, 0.22);

      float tempJit = (grainHash(cellId + 11.3) - 0.5) * 0.26 * artBoost;
      dabCol += vec3(tempJit, tempJit * 0.22, -tempJit * 0.95) * (0.35 + 0.65 * luma3(dabCol));
      float dLum = luma3(dabCol);
      dabCol = clamp(mix(vec3(dLum), dabCol, effSat * 1.28), 0.0, 1.0);

      float bristle = 0.93 + 0.11 * sin((cellFrac.y + jit.y * 0.3) * 18.0);
      float dabRim = 1.0 - 0.12 * smoothstep(0.28, 0.52, length(cellFrac));
      dabCol = clamp(dabCol * bristle * dabRim, 0.0, 1.0);
      col = mix(col, dabCol, artMix);
    }
  }

  // StormyClouds §5 shared composite: lifted print blacks, per-frame 1-px grain & sparse twinkling specks
  if (uFilm > 0.005) {
    float g = filmGrain(gl_FragCoord.xy, uTime);
    col = mix(col, 0.86 * (1.0 - exp(-col * 1.45)) + 0.028, min(uFilm * 0.65, 0.85));
    col += (g - 0.5) * (0.14 * uFilm);

    vec2 cell = floor(gl_FragCoord.xy / 7.0);
    float hc = grainHash(cell + 17.3);
    if (hc > 0.9965) {
      vec2 sub = fract(gl_FragCoord.xy / 7.0);
      vec2 sp = vec2(grainHash(cell + 3.1), grainHash(cell + 9.7)) * 0.7 + 0.15;
      float d = length((sub - sp) * 7.0);
      float speck = exp(-d * d * 1.6) * (0.55 + 0.45 * sin(uTime * (0.6 + hc * 3.0) + hc * 90.0));
      col += vec3(speck * 0.55 * min(uFilm * 1.2, 1.0));
    }
  }

  // Smooth optical vignette
  float vig = smoothstep(0.86, 0.22, length(centered) * (0.92 + uVignette * 0.52));
  col *= mix(1.0, vig, clamp(uVignette, 0.0, 1.0));
  col *= frameMask;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export function makePostProcessor(renderer) {
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);

  const rtOpts = {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  };
  const bloomOpts = {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  };

  const sceneRT = new THREE.WebGLRenderTarget(512, 512, rtOpts);
  sceneRT.depthTexture = new THREE.DepthTexture(512, 512);
  const bloomA = new THREE.WebGLRenderTarget(256, 256, bloomOpts);
  const bloomB = new THREE.WebGLRenderTarget(256, 256, bloomOpts);

  let cubeRT = null;
  let cubeCam = null;
  let cubeSize = 768;

  const brightMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: BRIGHT_FRAG,
    uniforms: {
      tDiffuse: { value: sceneRT.texture },
      uThreshold: { value: 0.72 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const blurMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: BLUR_FRAG,
    uniforms: {
      tDiffuse: { value: bloomA.texture },
      uDir: { value: new THREE.Vector2(1 / 256, 0) },
    },
    depthTest: false,
    depthWrite: false,
  });

  const cubeLensMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: CUBE_LENS_FRAG,
    uniforms: {
      tCube: { value: null },
      uRes: { value: new THREE.Vector2(512, 512) },
      uCamBasis: { value: new THREE.Matrix3() },
      uCamAngles: { value: new THREE.Vector3(0, 0, 0) },
      uLensMode: { value: 0 },
      uLensDistort: { value: 0 },
      uLensZoom: { value: 1 },
      uAnamorphic: { value: 0 },
      uTime: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const compMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: COMP_FRAG,
    uniforms: {
      tScene: { value: sceneRT.texture },
      tBloom: { value: bloomA.texture },
      tDepth: { value: sceneRT.depthTexture },
      uRes: { value: new THREE.Vector2(512, 512) },
      uTime: { value: 0 },
      uBloom: { value: 0.85 },
      uLens: { value: 0.55 },
      uVignette: { value: 0.45 },
      uContrast: { value: 1.05 },
      uTemp: { value: 0 },
      uGradeSat: { value: 1 },
      uTint: { value: new THREE.Color('#ffffff') },
      uFilm: { value: 0.08 },
      uArtStyle: { value: 0 },
      uArtStrength: { value: 1.0 },
      uCamNear: { value: 2.0 },
      uCamFar: { value: 28000.0 },
      uLensMode: { value: 0 },
      uLensDistort: { value: 0 },
      uLensZoom: { value: 1.0 },
      uAnamorphic: { value: 0 },
      uTiltShift: { value: 0 },
      uTiltAngle: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(quadGeo, brightMat);
  quad.frustumCulled = false;
  quadScene.add(quad);

  let bw = 256;
  let bh = 256;
  let bypass = false;
  const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  function ensureCubeTarget(near = 2.0, far = 28000.0) {
    if (!cubeRT) {
      cubeRT = new THREE.WebGLCubeRenderTarget(cubeSize, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false,
      });
      cubeCam = new THREE.CubeCamera(near, far, cubeRT);
      cubeLensMat.uniforms.tCube.value = cubeRT.texture;
    }
    return cubeCam;
  }

  function setSize(w, h, dpr = 1) {
    const pw = Math.max(2, Math.floor(w * dpr));
    const ph = Math.max(2, Math.floor(h * dpr));
    sceneRT.setSize(pw, ph);
    if (sceneRT.depthTexture) {
      sceneRT.depthTexture.image.width = pw;
      sceneRT.depthTexture.image.height = ph;
    }
    bw = Math.max(2, Math.floor(pw * 0.35));
    bh = Math.max(2, Math.floor(ph * 0.35));
    bloomA.setSize(bw, bh);
    bloomB.setSize(bw, bh);
    compMat.uniforms.uRes.value.set(pw, ph);
    cubeLensMat.uniforms.uRes.value.set(pw, ph);
    const wantCube = Math.max(512, Math.min(1024, Math.floor(Math.max(pw, ph) * 0.55)));
    if (cubeRT && Math.abs(wantCube - cubeSize) >= 192) {
      cubeSize = wantCube;
      cubeRT.setSize(cubeSize, cubeSize);
    } else {
      cubeSize = wantCube;
    }
  }

  function configure(cfg = {}) {
    if (cfg.threshold !== undefined) brightMat.uniforms.uThreshold.value = cfg.threshold;
    if (cfg.bloom !== undefined) compMat.uniforms.uBloom.value = cfg.bloom;
    if (cfg.lens !== undefined) compMat.uniforms.uLens.value = cfg.lens;
    if (cfg.vignette !== undefined) compMat.uniforms.uVignette.value = cfg.vignette;
    if (cfg.contrast !== undefined) compMat.uniforms.uContrast.value = cfg.contrast;
    if (cfg.temp !== undefined) compMat.uniforms.uTemp.value = cfg.temp;
    if (cfg.sat !== undefined) compMat.uniforms.uGradeSat.value = cfg.sat;
    if (cfg.film !== undefined) compMat.uniforms.uFilm.value = cfg.film;
    if (cfg.tint !== undefined) compMat.uniforms.uTint.value.set(cfg.tint);
    if (cfg.artStyle !== undefined) compMat.uniforms.uArtStyle.value = cfg.artStyle;
    if (cfg.artStrength !== undefined) compMat.uniforms.uArtStrength.value = cfg.artStrength;
    if (cfg.lensMode !== undefined) {
      compMat.uniforms.uLensMode.value = cfg.lensMode;
      cubeLensMat.uniforms.uLensMode.value = cfg.lensMode;
    }
    if (cfg.lensDistort !== undefined) {
      compMat.uniforms.uLensDistort.value = cfg.lensDistort;
      cubeLensMat.uniforms.uLensDistort.value = cfg.lensDistort;
    }
    if (cfg.lensZoom !== undefined) {
      compMat.uniforms.uLensZoom.value = cfg.lensZoom;
      cubeLensMat.uniforms.uLensZoom.value = cfg.lensZoom;
    }
    if (cfg.anamorphic !== undefined) {
      compMat.uniforms.uAnamorphic.value = cfg.anamorphic;
      cubeLensMat.uniforms.uAnamorphic.value = cfg.anamorphic;
    }
    if (cfg.tiltShift !== undefined) compMat.uniforms.uTiltShift.value = cfg.tiltShift;
    if (cfg.tiltAngle !== undefined) compMat.uniforms.uTiltAngle.value = cfg.tiltAngle;
  }

  function render(scene, camera, time = 0) {
    if (bypass) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    if (camera) {
      if (camera.near) compMat.uniforms.uCamNear.value = camera.near;
      if (camera.far) compMat.uniforms.uCamFar.value = camera.far;
    }

    const lensMode = compMat.uniforms.uLensMode.value;
    const canCube = Boolean(
      lensMode >= 3.5 &&
      camera &&
      renderer &&
      typeof renderer.getActiveCubeFace === 'function'
    );

    if (canCube) {
      // Omnidirectional 6-Face GPU Cubemap capture + spherical/stereographic/fisheye ray-projection into sceneRT
      const cc = ensureCubeTarget(camera.near || 2.0, camera.far || 28000.0);
      camera.updateMatrixWorld?.();
      cc.position.copy(camera.position);
      cc.update(renderer, scene);

      const e = camera.matrixWorld.elements;
      // Columns: right (e0,e1,e2), up (e4,e5,e6), forward (-e8,-e9,-e10)
      cubeLensMat.uniforms.uCamBasis.value.set(
        e[0], e[4], -e[8],
        e[1], e[5], -e[9],
        e[2], e[6], -e[10]
      );
      tmpEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      cubeLensMat.uniforms.uCamAngles.value.set(tmpEuler.x, tmpEuler.y, tmpEuler.z);
      cubeLensMat.uniforms.uTime.value = time;

      quad.material = cubeLensMat;
      renderer.setRenderTarget(sceneRT);
      renderer.render(quadScene, quadCam);
    } else {
      // Single-pass HDR HalfFloat offscreen buffer (+ hardware depthTexture)
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
    }

    // 2. Extract bright regions into bloomA
    quad.material = brightMat;
    brightMat.uniforms.tDiffuse.value = sceneRT.texture;
    renderer.setRenderTarget(bloomA);
    renderer.render(quadScene, quadCam);

    // 3. Two-iteration separable Gaussian blur (H -> V -> wider H -> wider V)
    quad.material = blurMat;
    for (let pass = 0; pass < 2; pass++) {
      const spread = pass === 0 ? 1.0 : 2.1;
      blurMat.uniforms.tDiffuse.value = bloomA.texture;
      blurMat.uniforms.uDir.value.set(spread / bw, 0);
      renderer.setRenderTarget(bloomB);
      renderer.render(quadScene, quadCam);

      blurMat.uniforms.tDiffuse.value = bloomB.texture;
      blurMat.uniforms.uDir.value.set(0, spread / bh);
      renderer.setRenderTarget(bloomA);
      renderer.render(quadScene, quadCam);
    }

    // 4. Final composite + optics + grading + artistic style + film grain to screen
    quad.material = compMat;
    compMat.uniforms.tScene.value = sceneRT.texture;
    compMat.uniforms.tBloom.value = bloomA.texture;
    compMat.uniforms.tDepth.value = sceneRT.depthTexture;
    compMat.uniforms.uTime.value = time;
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCam);
  }

  function setBypass(v) {
    bypass = Boolean(v);
  }

  function dispose() {
    sceneRT.dispose();
    bloomA.dispose();
    bloomB.dispose();
    if (cubeRT) cubeRT.dispose();
    quadGeo.dispose();
    brightMat.dispose();
    blurMat.dispose();
    cubeLensMat.dispose();
    compMat.dispose();
  }

  return {
    sceneRT, bloomA, bloomB, brightMat, blurMat, cubeLensMat, compMat,
    get cubeRT() { return cubeRT; },
    get bypass() { return bypass; },
    setBypass, setSize, configure, render, dispose,
  };
}
