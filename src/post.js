// Multi-pass WebGL post-processing stack:
//   1. Full-res scene pass -> sceneRT
//   2. Quarter-res bright-pass threshold -> bloomA
//   3. Two-axis separable wide Gaussian + anamorphic flare blur -> bloomB -> bloomA
//   4. Final screen composite: Bloom + Optical Lens FX (chromatic aberration,
//      barrel curvature, ghost halation, vignette) + Filmic Color Grading
//      (temperature, contrast, saturation, ACES shoulder) + Old-Film weather
//      (StormyClouds re-dealt silver grain, twinkling nitrate dust specks,
//      celluloid vertical scratches, shutter flicker & gate weave).
import * as THREE from '../vendor/three.module.js';

export const POST_VERT = /* glsl */ `
// petacity-post-pass
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const BRIGHT_FRAG = /* glsl */ `
// petacity-post-pass
uniform sampler2D tScene;
uniform float uThresh;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  float lum = max(max(c.r, c.g), c.b);
  float soft = clamp((lum - uThresh + 0.22) / 0.44, 0.0, 1.0);
  float contrib = max(lum - uThresh, 0.0) + soft * soft * 0.22;
  vec3 outCol = c * (contrib / max(lum, 1e-4));
  gl_FragColor = vec4(min(outCol, vec3(6.0)), 1.0);
}
`;

export const BLUR_FRAG = /* glsl */ `
// petacity-post-pass
uniform sampler2D tTex;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  // 9-tap wide tent/Gaussian filter (5 bilinear fetches)
  vec3 s = texture2D(tTex, vUv).rgb * 0.227027;
  vec2 off1 = uDir * 1.384615;
  vec2 off2 = uDir * 3.230769;
  s += texture2D(tTex, vUv + off1).rgb * 0.316216;
  s += texture2D(tTex, vUv - off1).rgb * 0.316216;
  s += texture2D(tTex, vUv + off2).rgb * 0.070270;
  s += texture2D(tTex, vUv - off2).rgb * 0.070270;
  gl_FragColor = vec4(s, 1.0);
}
`;

export const COMP_FRAG = /* glsl */ `
// petacity-post-pass
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloom;
uniform float uLens;
uniform float uContrast;
uniform float uTemp;
uniform float uGradeSat;
uniform float uVignette;
uniform float uFilm;
uniform vec3 uTint;
varying vec2 vUv;

float grainHash(vec2 v) {
  return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453);
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

void main() {
  vec2 uv = vUv;

  // Projector gate weave when Old-Film weather FX is active
  if (uFilm > 0.01) {
    float fTick = floor(uTime * 18.0);
    vec2 weave = (vec2(grainHash(vec2(fTick, 1.7)), grainHash(vec2(fTick, 9.3))) - 0.5) * 0.0022 * uFilm;
    uv = clamp(uv + weave, 0.001, 0.999);
  }

  // Subtle optical barrel distortion + radial chromatic dispersion (uLens)
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 dUv = clamp(0.5 + cc * (1.0 + 0.085 * uLens * r2), 0.001, 0.999);
  vec2 caOff = cc * (0.0065 * uLens * (0.35 + r2 * 2.2));

  float scR = texture2D(tScene, clamp(dUv + caOff, 0.001, 0.999)).r;
  float scG = texture2D(tScene, dUv).g;
  float scB = texture2D(tScene, clamp(dUv - caOff, 0.001, 0.999)).b;
  vec3 col = vec3(scR, scG, scB);

  // Multi-radius Bloom + subtle horizontal anamorphic streak
  vec3 blm = texture2D(tBloom, dUv).rgb;
  vec3 anam = (
    texture2D(tBloom, clamp(dUv + vec2(0.018, 0.0), 0.001, 0.999)).rgb +
    texture2D(tBloom, clamp(dUv - vec2(0.018, 0.0), 0.001, 0.999)).rgb
  ) * 0.28;
  col += (blm + anam * (0.35 + 0.45 * uLens)) * uBloom;

  // Optical ghost flare / halation mirrored across the lens axis
  if (uLens > 0.01) {
    vec2 ghostUv = clamp(1.0 - dUv, 0.002, 0.998);
    vec2 haloUv = clamp(0.5 - cc * 0.55, 0.002, 0.998);
    float ring = exp(-pow((length(cc) - 0.28) * 7.5, 2.0));
    vec3 ghost = texture2D(tBloom, ghostUv).rgb * 0.45 + texture2D(tBloom, haloUv).rgb * 0.35;
    col += ghost * uTint * uLens * (0.14 + 0.22 * ring);
  }

  // Color Grading: white-balance temperature, split shadow/highlight lift, S-contrast & ACES rolloff
  vec3 wb = vec3(1.0 + uTemp * 0.16, 1.0 + uTemp * 0.02, 1.0 - uTemp * 0.18);
  col *= wb;
  // Blend linear look with filmic ACES shoulder so emissives bloom richly without crushing darks
  vec3 mapped = acesFilm(col * 0.92);
  col = mix(clamp(col, 0.0, 1.0), mapped, 0.48);

  // S-curve contrast around mid-grey
  col = clamp((col - 0.46) * uContrast + 0.46, 0.0, 1.0);

  // Grade saturation
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, uGradeSat);

  // Old-Film weather composite (StormyClouds Shared Foundation §5 + nitrate scratches & flicker)
  if (uFilm > 0.005) {
    vec2 fc = gl_FragCoord.xy;
    float fk = clamp(uFilm, 0.0, 1.5);
    // 18-fps projector shutter/bulb breathing
    float q18 = floor(uTime * 18.0);
    float flicker = 1.0 + (grainHash(vec2(q18, 3.7)) - 0.5) * 0.09 * fk;
    col *= flicker;

    // Warm silver-sepia tone wash as uFilm rises
    float l2 = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 nitrate = vec3(l2 * 1.06, l2 * 0.99, l2 * 0.86);
    col = mix(col, nitrate, clamp(fk * 0.34, 0.0, 0.62));

    // Sparse fine dust specks (~1 in 300 7x7px cells, slowly twinkling — StormyClouds §5)
    vec2 cell = floor(fc / 7.0);
    float hc = grainHash(cell * 1.37 + 7.1);
    if (hc > 0.9958 - 0.0025 * fk) {
      vec2 spPos = (cell + 0.5 + (vec2(grainHash(cell + 1.3), grainHash(cell + 4.7)) - 0.5) * 0.6) * 7.0;
      float speck = max(0.0, 1.0 - length(fc - spPos) / 1.55) * (0.55 + 0.45 * sin(uTime * (0.6 + hc * 3.0) + hc * 90.0));
      col += vec3(0.95, 0.91, 0.82) * speck * fk * 0.65;
    }

    // Transient popping dust/hair blotch at 12fps
    float q12 = floor(uTime * 12.0);
    vec2 bCell = floor(fc / 46.0);
    float hb = grainHash(bCell + q12 * 5.13);
    if (hb > 0.994) {
      vec2 bp = (bCell + 0.5) * 46.0;
      float blotch = 1.0 - smoothstep(1.2, 4.2, length(fc - bp));
      col *= 1.0 - blotch * 0.45 * fk;
    }

    // Vertical celluloid rain scratches drifting subtly across the gate
    float q14 = floor(uTime * 14.0);
    for (int s = 0; s < 2; s++) {
      float fs = float(s);
      float scOn = step(0.42, grainHash(vec2(q14, 17.0 + fs * 9.0)));
      float sx = grainHash(vec2(q14 * 0.5 + fs * 31.0, 4.2)) * uRes.x;
      sx += sin(fc.y * 0.018 + uTime * 5.0 + fs * 4.0) * 1.4;
      float line = (1.0 - smoothstep(0.0, 1.05, abs(fc.x - sx))) * scOn;
      float gap = step(0.28, fract(sin((floor(fc.y * 0.04) + q14 * 3.0) * 91.7) * 43758.5));
      col += vec3(0.85, 0.82, 0.74) * line * gap * fk * 0.28;
    }

    // Printed-black lift + per-frame re-dealt 1px silver film grain
    col += vec3(0.022, 0.020, 0.017) * fk;
    col += (filmGrain(fc, uTime) - 0.5) * 0.14 * fk;
  }

  // Optical cos^4-style corner vignette
  float vig = 1.0 - smoothstep(0.32, 0.92, length(cc) * (1.18 + uVignette * 0.42)) * (0.28 + uVignette * 0.52);
  col *= vig;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export function makePostProcessor(renderer) {
  const rtOpts = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  };
  const bloomOpts = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  };

  let w = 800;
  let h = 600;
  const sceneRT = new THREE.WebGLRenderTarget(w, h, rtOpts);
  const bloomA = new THREE.WebGLRenderTarget(200, 150, bloomOpts);
  const bloomB = new THREE.WebGLRenderTarget(200, 150, bloomOpts);

  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);

  const brightMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: BRIGHT_FRAG,
    uniforms: {
      tScene: { value: sceneRT.texture },
      uThresh: { value: 0.62 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const blurMat = new THREE.ShaderMaterial({
    vertexShader: POST_VERT,
    fragmentShader: BLUR_FRAG,
    uniforms: {
      tTex: { value: bloomA.texture },
      uDir: { value: new THREE.Vector2(1 / 200, 0) },
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
      uRes: { value: new THREE.Vector2(w, h) },
      uTime: { value: 0 },
      uBloom: { value: 0.85 },
      uLens: { value: 0.45 },
      uContrast: { value: 1.06 },
      uTemp: { value: 0.0 },
      uGradeSat: { value: 1.0 },
      uVignette: { value: 0.65 },
      uFilm: { value: 0.16 },
      uTint: { value: new THREE.Color('#ff6a4d') },
    },
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(quadGeo, compMat);
  quad.frustumCulled = false;
  quadScene.add(quad);
  let bypass = false;

  function setBypass(flag) {
    bypass = !!flag;
  }

  function setSize(width, height, dpr = 1) {
    w = Math.max(2, Math.floor(width * dpr));
    h = Math.max(2, Math.floor(height * dpr));
    const bw = Math.max(2, Math.floor(w * 0.35));
    const bh = Math.max(2, Math.floor(h * 0.35));
    sceneRT.setSize(w, h);
    bloomA.setSize(bw, bh);
    bloomB.setSize(bw, bh);
    compMat.uniforms.uRes.value.set(w, h);
  }

  function configure(opts = {}) {
    const u = compMat.uniforms;
    if (opts.bloom !== undefined) u.uBloom.value = opts.bloom;
    if (opts.thresh !== undefined) brightMat.uniforms.uThresh.value = opts.thresh;
    if (opts.lens !== undefined) u.uLens.value = opts.lens;
    if (opts.contrast !== undefined) u.uContrast.value = opts.contrast;
    if (opts.temp !== undefined) u.uTemp.value = opts.temp;
    if (opts.sat !== undefined) u.uGradeSat.value = opts.sat;
    if (opts.vignette !== undefined) u.uVignette.value = opts.vignette;
    if (opts.film !== undefined) u.uFilm.value = opts.film;
    if (opts.tint !== undefined) u.uTint.value.set(opts.tint);
  }

  function render(scene, camera, time = 0) {
    if (bypass) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    compMat.uniforms.uTime.value = time;
    // 1. Render main 3D scene into offscreen RT
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);

    // 2. Bright-pass + two-round separable wide bloom
    if (compMat.uniforms.uBloom.value > 0.005 || compMat.uniforms.uLens.value > 0.01) {
      quad.material = brightMat;
      brightMat.uniforms.tScene.value = sceneRT.texture;
      renderer.setRenderTarget(bloomA);
      renderer.render(quadScene, quadCam);

      const bw = Math.max(2, bloomA.width);
      const bh = Math.max(2, bloomA.height);
      quad.material = blurMat;
      // Round 1 (tight bloom)
      blurMat.uniforms.tTex.value = bloomA.texture;
      blurMat.uniforms.uDir.value.set(1.0 / bw, 0);
      renderer.setRenderTarget(bloomB);
      renderer.render(quadScene, quadCam);

      blurMat.uniforms.tTex.value = bloomB.texture;
      blurMat.uniforms.uDir.value.set(0, 1.0 / bh);
      renderer.setRenderTarget(bloomA);
      renderer.render(quadScene, quadCam);

      // Round 2 (wide lush atmospheric halo, slightly wider horizontally for sci-fi lens feel)
      blurMat.uniforms.tTex.value = bloomA.texture;
      blurMat.uniforms.uDir.value.set(2.35 / bw, 0);
      renderer.setRenderTarget(bloomB);
      renderer.render(quadScene, quadCam);

      blurMat.uniforms.tTex.value = bloomB.texture;
      blurMat.uniforms.uDir.value.set(0, 1.85 / bh);
      renderer.setRenderTarget(bloomA);
      renderer.render(quadScene, quadCam);
    }

    // 3. Final composite to canvas
    quad.material = compMat;
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCam);
  }

  return { sceneRT, bloomA, bloomB, brightMat, blurMat, compMat, setSize, setBypass, configure, render };
}
