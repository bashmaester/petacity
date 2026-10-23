// Multi-pass post-processing pipeline (Three.js r170 / WebGL 2 compatible):
//   1. Scene render -> offscreen HalfFloat render target (+ hardware DepthTexture)
//   2. Bright-pass extraction -> quarter-res ping-pong Gaussian bloom (4 blur passes)
//   3. Composite pass -> chromatic aberration, anamorphic lens flare, vignette,
//      temperature / tint / contrast / saturation grading, StormyClouds old-film
//      grain + twinkling dust specks, AND Phase-10 Artistic Render Styles:
//        0: Cinema (Default)
//        1: X-Ray Structural Radiograph
//        2: Architectural Ink Sketch
//        3: Charcoal & White Chalk Drawing
//        4: Painterly Oil Impasto (Kuwahara)
//        5: Impressionist Broken-Color Nocturne
import * as THREE from '../vendor/three.module.js';

export const ART_STYLE_NAMES = [
  'Cinema (Default)',
  'X-Ray Structural',
  'Architectural Ink Sketch',
  'Charcoal & Chalk',
  'Painterly Impasto',
  'Impressionist Nocturne',
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

  float dC = readLinearDepth(q);
  float dL = readLinearDepth(q - vec2(px.x * 1.4, 0.0));
  float dR = readLinearDepth(q + vec2(px.x * 1.4, 0.0));
  float dU = readLinearDepth(q + vec2(0.0, px.y * 1.4));
  float dD = readLinearDepth(q - vec2(0.0, px.y * 1.4));
  float depE = (abs(dL - dR) + abs(dU - dD)) / max(dC * 0.22 + 3.0, 1.0);
  return vec4(gx, gy, lumE, clamp(depE, 0.0, 2.0));
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

void main() {
  vec2 uv = vUv;
  vec2 centered = uv - 0.5;
  float r2 = dot(centered, centered);
  vec2 px = 1.0 / max(uRes, vec2(1.0));

  // Subtle radial chromatic aberration near frame edges when lens FX > 0
  vec2 caShift = centered * (0.0055 * uLens * (0.35 + r2 * 2.2));
  float sr = texture2D(tScene, clamp(uv + caShift, vec2(0.001), vec2(0.999))).r;
  float sg = texture2D(tScene, uv).g;
  float sb = texture2D(tScene, clamp(uv - caShift, vec2(0.001), vec2(0.999))).b;
  vec3 sceneCol = vec3(sr, sg, sb);

  // Soft bloom + horizontal anamorphic lens flare streak
  vec3 bloom = texture2D(tBloom, uv).rgb;
  vec3 anamorphic = (
    texture2D(tBloom, clamp(uv + vec2(0.018, 0.0), vec2(0.001), vec2(0.999))).rgb +
    texture2D(tBloom, clamp(uv - vec2(0.018, 0.0), vec2(0.001), vec2(0.999))).rgb +
    texture2D(tBloom, clamp(uv + vec2(0.042, 0.0), vec2(0.001), vec2(0.999))).rgb * 0.45 +
    texture2D(tBloom, clamp(uv - vec2(0.042, 0.0), vec2(0.001), vec2(0.999))).rgb * 0.45
  ) * 0.22;

  vec3 col = sceneCol + bloom * uBloom + anamorphic * (uLens * 0.52 * uBloom);

  // ACES-inspired filmic tonemap
  col = acesFilm(col);

  // Color temperature (cool cyan <-> warm amber) + look tint
  col.r *= 1.0 + uTemp * 0.14;
  col.b *= 1.0 - uTemp * 0.14;
  col *= mix(vec3(1.0), uTint, 0.22);

  // Contrast around mid-grey & saturation grade
  col = clamp((col - 0.5) * uContrast + 0.5, 0.0, 1.0);
  float lum = luma3(col);
  col = clamp(mix(vec3(lum), col, uGradeSat), 0.0, 1.0);

  // --- Phase-10 Artistic & Diagnostic Render Styles (uArtStyle 1..5) ---
  if (uArtStyle > 0.5 && uArtStrength > 0.01) {
    float artMix = clamp(uArtStrength, 0.0, 1.0);
    float artBoost = max(uArtStrength, 0.25);
    vec2 fc = gl_FragCoord.xy;

    if (uArtStyle < 1.5) {
      // 1. X-Ray Structural Radiograph: translucent cyan/cobalt depth shells +
      // glowing internal architectural/silhouette wireframe + hot plasma tracers!
      float rawD = texture2D(tDepth, uv).r;
      float dLin = readLinearDepth(uv);
      float isSky = step(0.9996, rawD);
      vec4 ed = evalEdges(uv, px);

      float volShell = exp(-dLin * 0.00038) * (1.0 - isSky);
      float wire = clamp(ed.z * 0.95 + ed.w * 1.45, 0.0, 1.6) * artBoost;
      float bloomHot = clamp(luma3(bloom) * 0.85, 0.0, 1.4);

      vec3 xrayBg = mix(vec3(0.010, 0.024, 0.055), vec3(0.020, 0.052, 0.105), 1.0 - uv.y);
      vec3 shellCol = vec3(0.05, 0.30, 0.58) * volShell * (0.35 + 0.65 * (1.0 - lum));
      // Translucent internal floor-plate & elevation contour bands
      float scanBand = 0.88 + 0.12 * sin(fc.y * 1.35);
      vec3 edgeGlow = vec3(0.28, 0.86, 1.0) * wire + vec3(0.90, 0.98, 1.0) * pow(max(wire - 0.35, 0.0), 1.7);
      vec3 hotTracer = mix(vec3(0.20, 0.95, 0.88), vec3(1.0, 0.62, 0.24), clamp(bloomHot * 0.7, 0.0, 1.0)) * bloomHot * 0.72;

      // Subtle diagnostic engineering grid overlay
      vec2 gridCell = abs(fract(fc / 64.0) - 0.5) * 64.0;
      float diagGrid = (1.0 - smoothstep(0.0, 1.1, min(gridCell.x, gridCell.y))) * 0.055;

      vec3 xray = (xrayBg + shellCol + edgeGlow + hotTracer) * scanBand + vec3(0.18, 0.62, 0.85) * diagGrid;
      col = mix(col, clamp(xray, 0.0, 1.0), artMix);
    } else if (uArtStyle < 2.5) {
      // 2. Architectural Ink & Watercolor Sketch on warm archival drafting paper
      vec2 tremor = px * 0.75 * vec2(sin(fc.y * 0.11 + 1.3), cos(fc.x * 0.11 - 0.7));
      vec4 ed = evalEdges(uv + tremor, px);
      float tooth = (grainHash(floor(fc * 0.85)) - 0.5) * 0.055;
      vec3 paper = vec3(0.952, 0.928, 0.876) + tooth;

      // Subtle architectural watercolor wash preserving active theme accents
      vec3 wash = mix(paper, clamp(col * 1.25 + 0.18, 0.0, 1.0), 0.28);

      // 4-angle progressive fountain-pen cross-hatching driven by scene darkness
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
      // 3. Charcoal & White Chalk on mid-tone laid Ingres paper
      vec4 ed = evalEdges(uv, px);
      float laidRib = sin(fc.y * 1.8) * 0.018;
      float paperGrain = (grainHash(floor(fc * 0.65)) - 0.5) * 0.09 + laidRib;
      vec3 tonedPaper = vec3(0.465, 0.452, 0.432) + paperGrain;

      // Diagonal dry-charcoal stroke texture
      float stroke = grainHash(floor(vec2(fc.x * 0.72 + fc.y * 0.68, (fc.x * -0.68 + fc.y * 0.72) * 0.18)));
      float darkMass = smoothstep(0.56, 0.05, lum) * (0.62 + 0.38 * stroke);
      float charEdge = clamp((ed.z * 1.05 + ed.w * 1.35) * artBoost, 0.0, 1.0) * (0.72 + 0.28 * stroke);

      vec3 charcoal = mix(tonedPaper, vec3(0.055, 0.052, 0.058), clamp(max(darkMass * 0.92, charEdge * 0.88), 0.0, 1.0));
      // White Conté chalk highlights catching sunlit arrises, clouds, moon & lamps
      float chalkAmt = smoothstep(0.58, 0.96, lum + luma3(bloom) * 0.45) * (0.68 + 0.32 * stroke);
      charcoal = mix(charcoal, vec3(0.965, 0.955, 0.930), clamp(chalkAmt * artBoost, 0.0, 0.95));
      col = mix(col, charcoal, artMix);
    } else if (uArtStyle < 4.5) {
      // 4. Painterly Oil Impasto: 4-quadrant edge-preserving Kuwahara brush planes + canvas weave
      float kRad = 2.2 + 2.4 * artBoost;
      vec3 painted = evalKuwahara(uv, px, kRad);
      // Apply grade to Kuwahara sample so palette matches active look
      painted.r *= 1.0 + uTemp * 0.14;
      painted.b *= 1.0 - uTemp * 0.14;
      painted *= mix(vec3(1.0), uTint, 0.22);
      painted = clamp((painted - 0.5) * (uContrast * 1.06) + 0.5, 0.0, 1.0);
      float pLum = luma3(painted);
      painted = clamp(mix(vec3(pLum), painted, uGradeSat * 1.18), 0.0, 1.0);

      // Subtle impasto brush-ridge relief & linen canvas weave
      vec4 ed = evalEdges(uv, px * 1.6);
      float canvasWeave = (sin(fc.x * 1.35) * sin(fc.y * 1.35)) * 0.024;
      float ridgeCatch = clamp((ed.x + ed.y) * 0.22, -0.09, 0.12);
      painted = clamp(painted + canvasWeave + ridgeCatch + bloom * (uBloom * 0.22), 0.0, 1.0);
      col = mix(col, painted, artMix);
    } else {
      // 5. Impressionist Broken-Color Nocturne: gradient-tangent oriented dabs + warm/cool chroma vibration
      vec4 ed = evalEdges(uv, px * 2.2);
      vec2 grad = vec2(ed.x, ed.y);
      float gLen = length(grad);
      // Brush tangent flows along silhouettes, cloud billows & water ripples
      vec2 tang = gLen > 0.015 ? normalize(vec2(-grad.y, grad.x)) : vec2(0.866, 0.5);
      vec2 perp = vec2(-tang.y, tang.x);

      // Anisotropic brushstroke lattice in pixel space (11px x 4.6px dabs)
      vec2 dabScale = vec2(10.5, 4.6) * (0.75 + 0.35 * artBoost);
      vec2 rotFc = vec2(dot(fc, tang), dot(fc, perp)) / dabScale;
      vec2 cellId = floor(rotFc);
      vec2 cellFrac = fract(rotFc) - 0.5;
      vec2 jit = (hash22(cellId) - 0.5) * 0.55;

      // Reconstruct world-screen UV at brushstroke center
      vec2 centerRotPx = (cellId + 0.5 + jit) * dabScale;
      vec2 strokeFc = tang * centerRotPx.x + perp * centerRotPx.y;
      vec2 strokeUv = clamp(strokeFc * px, vec2(0.002), vec2(0.998));

      vec3 dabCol = acesFilm(texture2D(tScene, strokeUv).rgb + texture2D(tBloom, strokeUv).rgb * (uBloom * 0.85));
      dabCol.r *= 1.0 + uTemp * 0.14;
      dabCol.b *= 1.0 - uTemp * 0.14;
      dabCol *= mix(vec3(1.0), uTint, 0.22);

      // Broken-color complementary temperature vibration per dab (warm gold vs cool cobalt-violet)
      float tempJit = (grainHash(cellId + 11.3) - 0.5) * 0.26 * artBoost;
      dabCol += vec3(tempJit, tempJit * 0.22, -tempJit * 0.95) * (0.35 + 0.65 * luma3(dabCol));
      float dLum = luma3(dabCol);
      dabCol = clamp(mix(vec3(dLum), dabCol, uGradeSat * 1.28), 0.0, 1.0);

      // Bristle grooves & rounded dab bevel
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
    // 1. Render 3D scene to HDR HalfFloat offscreen buffer (+ hardware depthTexture)
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);

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

    // 4. Final composite + grading + artistic style + film grain to screen
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
    quadGeo.dispose();
    brightMat.dispose();
    blurMat.dispose();
    compMat.dispose();
  }

  return {
    sceneRT, bloomA, bloomB, brightMat, blurMat, compMat,
    get bypass() { return bypass; },
    setBypass, setSize, configure, render, dispose,
  };
}
