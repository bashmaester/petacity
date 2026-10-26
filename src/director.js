// MovieSetDirector — Programmable Cinematography, Scene Perception (3D Raycast)
// & Diegetic World Takeover Engine for Petacity.
//
// Enables an AI agent (via WebMCP `navigator.modelContext` or `window.petacity`)
// or human script to treat the procedural city as a live, interactive movie set:
//   1. `whatAmILookingAt()` — 3D raycast + frustum scan across buildings, landmarks,
//      billboards, holograms, cars/trains/spinners/blimps, bridges, ships & water.
//   2. `runCameraScript()` / `lookAt()` / `followVehicle()` / `orbitTarget()` —
//      keyframed & procedural cinematography with C2 easing and target tracking.
//   3. `setBuildingLights()` & `displayBuildingMessage()` — per-building window
//      shader overrides + 4-sided architectural LED window-matrix text marquees.
//   4. `takeoverSignage()` — hijack any city billboard or mega-screen with custom
//      pure-code bitmap typography, colors, frames & flicker.
//   5. `projectInFrontOfCamera()` — spawn a volumetric hologram + physical drone
//      emitter + terminating projector light frustum right in front of the lens
//      (world-anchored or camera-tracking).
//   6. `controlVehicle()` — take over any car/spinner/train/blimp: position, route
//      waypoints, orbit-camera, speed, custom paint color & twin headlight state.

import * as THREE from '../vendor/three.module.js';
import {
  CELL, evalCoastSignedDist, evalRiverSignedDist, isPointInWater,
} from './city.js';
import { projectorFrustumGeometry } from './scene.js';
import { BEAM_VERT, BEAM_FRAG } from './shaders.js';

/* =========================================================================
 * PURE-CODE 5x7 BITMAP GLYPH FONT (ASCII 32..95, zero external fonts/DOM)
 * Each entry encodes 7 rows of 5 bits (MSB = left column 4, LSB = right col 0).
 * ========================================================================= */
const FONT_5X7 = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '!': [4, 4, 4, 4, 4, 0, 4],
  '"': [10, 10, 4, 0, 0, 0, 0],
  '#': [10, 31, 10, 10, 31, 10, 0],
  '$': [4, 15, 20, 14, 5, 30, 4],
  '%': [24, 25, 2, 4, 8, 19, 3],
  '&': [12, 18, 20, 8, 21, 18, 13],
  "'": [4, 4, 2, 0, 0, 0, 0],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  '*': [0, 4, 21, 14, 21, 4, 0],
  '+': [0, 4, 4, 31, 4, 4, 0],
  ',': [0, 0, 0, 0, 4, 4, 8],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 4, 4],
  '/': [1, 2, 2, 4, 8, 8, 16],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 6, 8, 16, 31],
  '3': [31, 2, 4, 6, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  ':': [0, 4, 4, 0, 4, 4, 0],
  ';': [0, 4, 4, 0, 4, 4, 8],
  '<': [2, 4, 8, 16, 8, 4, 2],
  '=': [0, 0, 31, 0, 31, 0, 0],
  '>': [8, 4, 2, 1, 2, 4, 8],
  '?': [14, 17, 1, 6, 4, 0, 4],
  '@': [14, 17, 23, 21, 23, 16, 14],
  'A': [14, 17, 17, 31, 17, 17, 17],
  'B': [30, 17, 17, 30, 17, 17, 30],
  'C': [14, 17, 16, 16, 16, 17, 14],
  'D': [30, 17, 17, 17, 17, 17, 30],
  'E': [31, 16, 16, 30, 16, 16, 31],
  'F': [31, 16, 16, 30, 16, 16, 16],
  'G': [14, 17, 16, 23, 17, 17, 15],
  'H': [17, 17, 17, 31, 17, 17, 17],
  'I': [14, 4, 4, 4, 4, 4, 14],
  'J': [7, 2, 2, 2, 18, 18, 12],
  'K': [17, 18, 20, 24, 20, 18, 17],
  'L': [16, 16, 16, 16, 16, 16, 31],
  'M': [17, 27, 21, 21, 17, 17, 17],
  'N': [17, 25, 21, 19, 17, 17, 17],
  'O': [14, 17, 17, 17, 17, 17, 14],
  'P': [30, 17, 17, 30, 16, 16, 16],
  'Q': [14, 17, 17, 17, 21, 18, 13],
  'R': [30, 17, 17, 30, 20, 18, 17],
  'S': [15, 16, 16, 14, 1, 1, 30],
  'T': [31, 4, 4, 4, 4, 4, 4],
  'U': [17, 17, 17, 17, 17, 17, 14],
  'V': [17, 17, 17, 17, 17, 10, 4],
  'W': [17, 17, 17, 21, 21, 27, 17],
  'X': [17, 17, 10, 4, 10, 17, 17],
  'Y': [17, 17, 10, 4, 4, 4, 4],
  'Z': [31, 1, 2, 4, 8, 16, 31],
  '[': [14, 8, 8, 8, 8, 8, 14],
  '\\': [16, 8, 8, 4, 2, 2, 1],
  ']': [14, 2, 2, 2, 2, 2, 14],
  '^': [4, 10, 17, 0, 0, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 31],
};

function parseRgb255(hexOrCol, fallback = [0, 240, 255]) {
  try {
    const c = new THREE.Color(hexOrCol ?? '#00f0ff');
    return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
  } catch {
    return fallback;
  }
}

/**
 * Rasterize pure-code RGBA `DataTexture` with glowing LED window-matrix / neon glyph text.
 */
export function buildGlyphMatrixTexture({
  text = 'PETACITY',
  subtext = '',
  fgColor = '#3cf5ff',
  subColor = '#ff7bd5',
  bgColor = '#040812',
  bgAlpha = 0.82,
  border = true,
  windowGrid = true,
  padCols = 3,
} = {}) {
  const line1 = String(text || 'PETACITY').toUpperCase();
  const line2 = subtext ? String(subtext).toUpperCase() : '';
  const maxChars = Math.max(line1.length, line2.length, 4);
  const cellPx = 6; // 5px window + 1px dark mullion
  const charCols = maxChars + padCols * 2;
  const w = Math.min(2048, Math.max(128, charCols * 6 * cellPx));
  const h = line2 ? 128 : 80;
  const data = new Uint8Array(w * h * 4);

  const fg = parseRgb255(fgColor, [60, 245, 255]);
  const sc = parseRgb255(subColor, [255, 123, 213]);
  const bg = parseRgb255(bgColor, [4, 8, 18]);
  const bgA = Math.round(Math.max(0, Math.min(1, bgAlpha)) * 255);

  // Fill background
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    data[o] = bg[0];
    data[o + 1] = bg[1];
    data[o + 2] = bg[2];
    data[o + 3] = bgA;
  }

  const plotLitCell = (x0, y0, cw, ch, col, intensity = 1.0) => {
    for (let dy = 0; dy < ch; dy++) {
      const py = h - 1 - (y0 + dy); // flip Y for UV orientation
      if (py < 0 || py >= h) continue;
      const isMullionY = windowGrid && (dy === ch - 1);
      for (let dx = 0; dx < cw; dx++) {
        const px = ((x0 + dx) % w + w) % w;
        const isMullionX = windowGrid && (dx === cw - 1);
        const mul = (isMullionX || isMullionY) ? 0.22 : intensity;
        const o = (py * w + px) * 4;
        data[o] = Math.min(255, Math.round(bg[0] * 0.2 + col[0] * mul));
        data[o + 1] = Math.min(255, Math.round(bg[1] * 0.2 + col[1] * mul));
        data[o + 2] = Math.min(255, Math.round(bg[2] * 0.2 + col[2] * mul));
        data[o + 3] = Math.max(bgA, Math.min(255, Math.round(255 * Math.min(1, mul + 0.15))));
      }
    }
  };

  const drawString = (str, yStart, scalePx, col) => {
    const glyphW = 6 * scalePx;
    const totalW = str.length * glyphW;
    const xStart = Math.max(scalePx * 2, Math.floor((w - totalW) * 0.5));
    for (let ci = 0; ci < str.length; ci++) {
      const ch = str[ci];
      const rows = FONT_5X7[ch] || FONT_5X7['?'];
      for (let r = 0; r < 7; r++) {
        const bits = rows[r];
        for (let c = 0; c < 5; c++) {
          if ((bits >> (4 - c)) & 1) {
            plotLitCell(xStart + ci * glyphW + c * scalePx, yStart + r * scalePx, scalePx, scalePx, col, 1.0);
          }
        }
      }
    }
  };

  if (line2) {
    drawString(line1, 14, cellPx, fg);
    drawString(line2, 74, Math.max(4, cellPx - 2), sc);
  } else {
    drawString(line1, Math.floor((h - 7 * cellPx) * 0.5), cellPx, fg);
  }

  if (border) {
    for (let x = 2; x < w - 2; x++) {
      if (x % 4 !== 3) {
        plotLitCell(x, 3, 1, 2, sc, 0.85);
        plotLitCell(x, h - 5, 1, 2, sc, 0.85);
      }
    }
    for (let y = 3; y < h - 3; y++) {
      plotLitCell(3, y, 2, 1, fg, 0.85);
      plotLitCell(w - 5, y, 2, 1, fg, 0.85);
    }
  }

  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/* =========================================================================
 * EXACT 3D RAY-PRIMITIVE INTERSECTION HELPERS
 * ========================================================================= */
function rayHitsAABB(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ, maxDist) {
  let tmin = 0.05;
  let tmax = maxDist;
  let hitAxis = 0;
  let hitSign = 0;

  const checkAxis = (o, d, mn, mx, axisId) => {
    if (Math.abs(d) < 1e-8) {
      return o >= mn && o <= mx;
    }
    const inv = 1 / d;
    let t1 = (mn - o) * inv;
    let t2 = (mx - o) * inv;
    let sgn = -1;
    if (t1 > t2) {
      const tmp = t1; t1 = t2; t2 = tmp;
      sgn = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      hitAxis = axisId;
      hitSign = sgn;
    }
    if (t2 < tmax) tmax = t2;
    return tmin <= tmax;
  };

  if (!checkAxis(ox, dx, minX, maxX, 0)) return null;
  if (!checkAxis(oy, dy, minY, maxY, 1)) return null;
  if (!checkAxis(oz, dz, minZ, maxZ, 2)) return null;
  if (tmin > maxDist || tmax < 0.05) return null;

  const faceNames = [
    hitSign < 0 ? 'west' : 'east',
    hitSign < 0 ? 'bottom' : 'rooftop',
    hitSign < 0 ? 'north' : 'south',
  ];
  return {
    distance: tmin,
    point: [
      Math.round((ox + dx * tmin) * 100) / 100,
      Math.round((oy + dy * tmin) * 100) / 100,
      Math.round((oz + dz * tmin) * 100) / 100,
    ],
    face: faceNames[hitAxis] || 'facade',
  };
}

function rayHitsSphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, maxDist) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return null;
  const d2 = (lx * lx + ly * ly + lz * lz) - tca * tca;
  if (d2 > r * r) return null;
  const thc = Math.sqrt(Math.max(0, r * r - d2));
  const t = tca - thc > 0.05 ? tca - thc : tca + thc;
  if (t < 0.05 || t > maxDist) return null;
  return {
    distance: t,
    point: [
      Math.round((ox + dx * t) * 100) / 100,
      Math.round((oy + dy * t) * 100) / 100,
      Math.round((oz + dz * t) * 100) / 100,
    ],
  };
}

function smoothEase(t, mode = 'C2') {
  const u = Math.max(0, Math.min(1, t));
  if (mode === 'linear') return u;
  if (mode === 'easeInOut') return u * u * (3 - 2 * u);
  // Quintic C2 smoothstep (zero acceleration jerk at start/end!)
  return u * u * u * (u * (u * 6 - 15) + 10);
}

const VEHICLE_CLASS_NAMES = ['ground-car', 'elevated-spinner', 'transit-train', 'aerial-blimp'];

export function getCityBuildingBox(city, i) {
  if (!city || !city.x || i < 0 || i >= (city.count || 0)) return null;
  const x = city.x[i];
  const z = city.z[i];
  const hx = city.w[i] * 0.5;
  const hz = city.d[i] * 0.5;
  const bot = Math.max(0, city.y[i] - city.h[i] * 0.5);
  const top = city.y[i] + city.h[i] * 0.5;
  return { x, z, hx, hz, bot, h: top, rot: city.rot ? city.rot[i] : 0 };
}

/* =========================================================================
 * MOVIE SET DIRECTOR ENGINE
 * ========================================================================= */
export class MovieSetDirector {
  constructor({
    scene,
    camera,
    controls,
    uniforms,
    getCity,
    getVehicles,
    onEditTransition = null,
  }) {
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.U = uniforms;
    this.getCity = getCity;
    this.getVehicles = getVehicles;
    this.onEditTransition = onEditTransition;

    this.root = new THREE.Group();
    this.root.name = 'movie-set-director';
    if (this.scene) this.scene.add(this.root);

    this.buildingGroup = new THREE.Group();
    this.signGroup = new THREE.Group();
    this.holoGroup = new THREE.Group();
    this.root.add(this.buildingGroup, this.signGroup, this.holoGroup);

    // Active Movie-Set Overrides
    this._buildingMessages = new Map(); // id -> { id, buildingId, mesh, tex, scrollSpeed, offset, text }
    this._signOverrides = new Map();    // id -> { id, signIndex, mesh, tex, scrollSpeed, offset, text }
    this._projectedHolos = new Map();   // id -> { id, group, holoMesh, podMesh, frustumMesh, tex, hudLocked, dist, offsetRight, offsetUp, spinSpeed, text, shape }
    this._vehicleScripts = new Map();   // vehicleId -> { waypoints, wpIdx, speed, loop, circleCamera, angle, color, headlights }

    // Active Cinematography Script / Tracking State
    this._activeShot = null;
    this._shotQueue = [];
    this._followSpec = null;
    this._orbitSpec = null;
    this._nextId = 1;
    this._time = 0;
  }

  /* -----------------------------------------------------------------------
   * 1. SCENE PERCEPTION: `whatAmILookingAt` & `scanVisibleScene`
   * ----------------------------------------------------------------------- */

  /**
   * Compute exact 3D raycast intersection for any screen point `(ndcX, ndcY)`
   * (`(0, 0)` = center crosshair) plus nearby entities in the camera's frustum.
   */
  whatAmILookingAt({ ndcX = 0, ndcY = 0, maxDistance = 4500, includeFrustumScan = true } = {}) {
    const city = this.getCity ? this.getCity() : null;
    const vehicles = this.getVehicles ? this.getVehicles() : null;
    const cam = this.camera;
    if (!cam) return { hit: null, visible: [] };

    cam.updateMatrixWorld?.();
    const origin = cam.position.clone();
    const dir = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(cam).sub(origin).normalize();
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = dir.x, dy = dir.y, dz = dir.z;
    const hScale = this.U?.uHeightScale?.value ?? 1.0;

    let bestHit = null;
    const consider = (cand) => {
      if (!cand) return;
      if (!bestHit || cand.distance < bestHit.distance) bestHit = cand;
    };

    // A. Buildings & Landmarks (exact AABB test against SOA city.x/y/z/w/h/d boxes)
    const nBoxes = city?.count || 0;
    const landmarks = city?.landmarks || [];
    for (let i = 0; i < nBoxes; i++) {
      const bx = city.x[i];
      const bz = city.z[i];
      const hx = city.w[i] * 0.5;
      const hz = city.d[i] * 0.5;
      const botY = Math.max(0, city.y[i] - city.h[i] * 0.5) * hScale;
      const topY = (city.y[i] + city.h[i] * 0.5) * hScale;
      const hit = rayHitsAABB(ox, oy, oz, dx, dy, dz, bx - hx, botY, bz - hz, bx + hx, topY, bz + hz, maxDistance);
      if (hit) {
        let lmName = null;
        for (const lm of landmarks) {
          if (Math.hypot(lm.x - bx, lm.z - bz) < Math.max(hx, hz) + 18) {
            lmName = lm.name;
            break;
          }
        }
        consider({
          kind: lmName ? 'landmark-building' : 'building',
          buildingId: i,
          name: lmName || `Tower #${i}`,
          distance: Math.round(hit.distance * 10) / 10,
          point: hit.point,
          face: hit.face,
          center: [Math.round(bx * 10) / 10, Math.round(topY * 0.5 * 10) / 10, Math.round(bz * 10) / 10],
          height: Math.round(topY * 10) / 10,
          halfExtents: [Math.round(hx * 10) / 10, Math.round(hz * 10) / 10],
        });
      }
    }

    // B. City Billboards & Custom Hijacked Signage
    const bills = city?.bills || [];
    for (let i = 0; i < bills.length; i++) {
      const bl = bills[i];
      const by = bl.y * hScale;
      const hw = Math.max(4, bl.w * 0.5);
      const hh = Math.max(3, bl.h * 0.5);
      const hit = rayHitsAABB(ox, oy, oz, dx, dy, dz, bl.x - hw, by - hh, bl.z - hw, bl.x + hw, by + hh, maxDistance);
      if (hit) {
        consider({
          kind: 'signage',
          signId: i,
          mega: !!bl.mega,
          name: bl.mega ? `Mega-Billboard #${i}` : `Neon Sign #${i}`,
          distance: Math.round(hit.distance * 10) / 10,
          point: hit.point,
          center: [Math.round(bl.x * 10) / 10, Math.round(by * 10) / 10, Math.round(bl.z * 10) / 10],
          size: [Math.round(bl.w * 10) / 10, Math.round(bl.h * 10) / 10],
        });
      }
    }

    // C. City Holograms & Camera-Projected Holograms
    const holos = city?.holos || [];
    for (let i = 0; i < holos.length; i++) {
      const h = holos[i];
      const hy = h.y * hScale;
      const rad = Math.max(h.w, h.h) * 0.48;
      const hit = rayHitsSphere(ox, oy, oz, dx, dy, dz, h.x, hy, h.z, rad, maxDistance);
      if (hit) {
        consider({
          kind: 'hologram',
          holoId: i,
          shape: h.shape,
          name: `Sky Hologram #${i} (${h.shape})`,
          distance: Math.round(hit.distance * 10) / 10,
          point: hit.point,
          center: [Math.round(h.x * 10) / 10, Math.round(hy * 10) / 10, Math.round(h.z * 10) / 10],
        });
      }
    }
    for (const [pid, ph] of this._projectedHolos.entries()) {
      const wp = new THREE.Vector3();
      ph.holoMesh.getWorldPosition(wp);
      const hit = rayHitsSphere(ox, oy, oz, dx, dy, dz, wp.x, wp.y, wp.z, ph.radius || 8, maxDistance);
      if (hit) {
        consider({
          kind: 'projected-hologram',
          projectionId: pid,
          text: ph.text,
          name: `Director Hologram "${ph.text}"`,
          distance: Math.round(hit.distance * 10) / 10,
          point: hit.point,
          center: [Math.round(wp.x * 10) / 10, Math.round(wp.y * 10) / 10, Math.round(wp.z * 10) / 10],
        });
      }
    }

    // D. Active Vehicles (Cars, Spinners, Transit Trains, Blimps)
    if (vehicles && typeof vehicles.listVehicles === 'function') {
      const vList = vehicles.listVehicles({ limit: 800, near: [ox, oy, oz] });
      for (const v of vList) {
        const rad = v.class === 3 ? 28 : (v.class === 2 ? 9.5 : 4.2);
        const hit = rayHitsSphere(ox, oy, oz, dx, dy, dz, v.position[0], v.position[1], v.position[2], rad, maxDistance);
        if (hit) {
          consider({
            kind: 'vehicle',
            vehicleId: v.id,
            vehicleClass: VEHICLE_CLASS_NAMES[v.class] || 'vehicle',
            name: `${VEHICLE_CLASS_NAMES[v.class] || 'vehicle'} #${v.id}`,
            speed: v.speed,
            overridden: v.overridden,
            distance: Math.round(hit.distance * 10) / 10,
            point: hit.point,
            center: v.position,
          });
        }
      }
    }

    // E. Ground / River / Ocean / Park / Spaceport Plane Intersection (y = 0)
    if (dy < -1e-4) {
      const tg = -oy / dy;
      if (tg > 0.05 && tg < maxDistance && (!bestHit || tg < bestHit.distance)) {
        const gx = ox + dx * tg;
        const gz = oz + dz * tg;
        let surfaceKind = 'street-ground';
        let surfaceName = 'Urban Ground / Street Grid';
        if (city) {
          const coreSpan = city.radius * CELL;
          const rDist = evalRiverSignedDist(gx, gz, city.riverFlow);
          const cDist = city.waterAmount > 0.005
            ? evalCoastSignedDist(gx, gz, coreSpan, city.coastAngle, city.waterMode, city.terrainSeedX, city.terrainSeedZ, city.shoreDist, city.waterAmount)
            : 9999;
          if (rDist < 0) {
            surfaceKind = 'river';
            surfaceName = 'City River Channel';
          } else if (cDist < 0 || isPointInWater(city, gx, gz, 0)) {
            surfaceKind = 'ocean-water';
            surfaceName = 'Coastal Ocean / Harbor Basin';
          } else if (city.spaceport && Math.hypot(gx - city.spaceport.x, gz - city.spaceport.z) < city.spaceport.radius) {
            surfaceKind = 'spaceport';
            surfaceName = 'Orbital Spaceport Launch Complex';
          } else {
            for (const pl of (city.places || [])) {
              if (Math.hypot(gx - pl.x, gz - pl.z) < (pl.r || 60)) {
                surfaceKind = pl.kind || 'park';
                surfaceName = pl.showcase ? 'Central Showcase Park' : `Urban ${pl.kind}`;
                break;
              }
            }
          }
        }
        consider({
          kind: surfaceKind,
          name: surfaceName,
          distance: Math.round(tg * 10) / 10,
          point: [Math.round(gx * 100) / 100, 0, Math.round(gz * 100) / 100],
        });
      }
    }

    // F. Sky / Cloud / Horizon Fallback
    if (!bestHit) {
      bestHit = {
        kind: dy > 0.06 ? 'sky-clouds' : 'horizon',
        name: dy > 0.06 ? 'Volumetric Cloud Deck & Sky Dome' : 'Distant Horizon',
        direction: [Math.round(dx * 1000) / 1000, Math.round(dy * 1000) / 1000, Math.round(dz * 1000) / 1000],
        elevationDeg: Math.round((Math.asin(Math.max(-1, Math.min(1, dy))) * 180 / Math.PI) * 10) / 10,
      };
    }

    const visible = includeFrustumScan ? this.scanVisibleEntities({ limit: 12 }) : [];
    return {
      cameraPose: this.controls ? this.controls.getPose() : {
        x: Math.round(ox * 100) / 100, y: Math.round(oy * 100) / 100, z: Math.round(oz * 100) / 100,
      },
      rayDirection: [Math.round(dx * 1000) / 1000, Math.round(dy * 1000) / 1000, Math.round(dz * 1000) / 1000],
      hit: bestHit,
      visible,
    };
  }

  /**
   * Return the most prominent landmarks, buildings, billboards, holograms & vehicles
   * currently inside the camera's forward field of view.
   */
  scanVisibleEntities({ limit = 12 } = {}) {
    const city = this.getCity ? this.getCity() : null;
    const vehicles = this.getVehicles ? this.getVehicles() : null;
    const cam = this.camera;
    if (!cam || !city) return [];

    const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const cosHalfFov = Math.cos(((cam.fov || 58) * 0.62 * Math.PI) / 180);
    const hScale = this.U?.uHeightScale?.value ?? 1.0;
    const items = [];

    const pushIfInView = (wx, wy, wz, size, entry) => {
      const vx = wx - ox, vy = wy - oy, vz = wz - oz;
      const dist = Math.hypot(vx, vy, vz);
      if (dist < 2 || dist > 3200) return;
      const dot = (vx * fwd.x + vy * fwd.y + vz * fwd.z) / dist;
      if (dot < cosHalfFov) return;
      const prominence = (size / (30 + dist)) * (0.5 + 0.5 * dot);
      items.push({ ...entry, distance: Math.round(dist * 10) / 10, alignment: Math.round(dot * 100) / 100, _score: prominence });
    };

    for (let i = 0; i < (city.landmarks || []).length; i++) {
      const lm = city.landmarks[i];
      pushIfInView(lm.x, (lm.y || 180) * 0.65 * hScale, lm.z, (lm.y || 180) * 1.4, {
        kind: 'landmark', name: lm.name, position: [Math.round(lm.x), Math.round((lm.y || 180) * hScale), Math.round(lm.z)],
      });
    }

    const nBoxes = city.count || 0;
    const stepB = Math.max(1, Math.floor(nBoxes / 220));
    for (let i = 0; i < nBoxes; i += stepB) {
      const topY = (city.y[i] + city.h[i] * 0.5) * hScale;
      if (topY < 75) continue;
      pushIfInView(city.x[i], topY * 0.6, city.z[i], topY * 0.85, {
        kind: 'building', buildingId: i, name: `Tower #${i}`, height: Math.round(topY),
        position: [Math.round(city.x[i]), Math.round(topY), Math.round(city.z[i])],
      });
    }

    for (let i = 0; i < (city.bills || []).length; i++) {
      const bl = city.bills[i];
      if (!bl.mega && i % 6 !== 0) continue;
      pushIfInView(bl.x, bl.y * hScale, bl.z, bl.w * (bl.mega ? 2.2 : 1.0), {
        kind: 'signage', signId: i, mega: !!bl.mega, name: bl.mega ? `Mega-Billboard #${i}` : `Sign #${i}`,
        position: [Math.round(bl.x), Math.round(bl.y * hScale), Math.round(bl.z)],
      });
    }

    if (vehicles && typeof vehicles.listVehicles === 'function') {
      const nearV = vehicles.listVehicles({ limit: 24, near: [ox, oy, oz] });
      for (const v of nearV) {
        pushIfInView(v.position[0], v.position[1], v.position[2], v.class === 3 ? 65 : 22, {
          kind: 'vehicle', vehicleId: v.id, vehicleClass: VEHICLE_CLASS_NAMES[v.class] || 'vehicle',
          position: v.position,
        });
      }
    }

    items.sort((a, b) => b._score - a._score);
    return items.slice(0, Math.max(1, limit)).map(({ _score, ...rest }) => rest);
  }

  /* -----------------------------------------------------------------------
   * 2. SCRIPTED CINEMATOGRAPHY: Shots, LookAt, Orbit & Chase-Cam
   * ----------------------------------------------------------------------- */

  _resolveTargetPoint(spec) {
    if (!spec) return null;
    if (Array.isArray(spec) && spec.length >= 3) {
      return new THREE.Vector3(Number(spec[0]) || 0, Number(spec[1]) || 0, Number(spec[2]) || 0);
    }
    if (typeof spec === 'object') {
      if (Number.isFinite(spec.x) && Number.isFinite(spec.z)) {
        return new THREE.Vector3(spec.x, spec.y ?? 80, spec.z);
      }
      const city = this.getCity ? this.getCity() : null;
      const hScale = this.U?.uHeightScale?.value ?? 1.0;
      if (spec.vehicleId !== undefined) {
        const vehicles = this.getVehicles ? this.getVehicles() : null;
        const st = vehicles?.getVehicleState?.(spec.vehicleId);
        if (st) return new THREE.Vector3(st.position[0], st.position[1], st.position[2]);
      }
      if (spec.buildingId !== undefined) {
        const b = getCityBuildingBox(city, spec.buildingId | 0);
        if (b) return new THREE.Vector3(b.x, b.h * hScale * (spec.heightFrac ?? 0.72), b.z);
      }
      if (spec.landmark && city?.landmarks) {
        const q = String(spec.landmark).toLowerCase();
        const lm = city.landmarks.find((l) => l.name.toLowerCase().includes(q));
        if (lm) return new THREE.Vector3(lm.x, (lm.h || lm.y || 150) * hScale * 0.72, lm.z);
      }
    }
    return null;
  }

  /** Point camera smoothly or immediately at `[x,y,z]` or `{ buildingId, vehicleId, landmark }`. */
  lookAt(target, { immediate = false } = {}) {
    const pt = this._resolveTargetPoint(target);
    if (!pt || !this.camera || !this.controls) return { ok: false, reason: 'target-not-found' };
    const p = this.camera.position;
    const dx = pt.x - p.x;
    const dy = pt.y - p.y;
    const dz = pt.z - p.z;
    const horiz = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.max(-1.45, Math.min(1.45, Math.atan2(dy, horiz)));

    if (immediate) {
      this.controls.setPose({ x: p.x, y: p.y, z: p.z, yaw, pitch });
    } else {
      this.controls._targetYaw = yaw;
      this.controls._targetPitch = pitch;
      if (!this.controls.freelook) {
        this.controls._targetMoveYaw = yaw;
        this.controls._targetMovePitch = pitch;
      }
    }
    return { ok: true, target: [pt.x, pt.y, pt.z], yaw, pitch };
  }

  /**
   * Run a sequence of camera shots:
   * `shots = [{ type: 'cut'|'dolly'|'orbit', from?, to, lookAt, duration, fov, ease }]`
   */
  runCameraScript(shots = [], { append = false } = {}) {
    const list = Array.isArray(shots) ? shots : [shots];
    if (!append) {
      this._shotQueue.length = 0;
      this._activeShot = null;
      this._followSpec = null;
      this._orbitSpec = null;
    }
    for (const s of list) {
      if (s && typeof s === 'object') this._shotQueue.push({ ...s });
    }
    if (!this._activeShot && this._shotQueue.length > 0) {
      this._startNextShot();
    }
    return {
      ok: true,
      queuedShots: this._shotQueue.length + (this._activeShot ? 1 : 0),
    };
  }

  stopCameraScript() {
    this._shotQueue.length = 0;
    this._activeShot = null;
    this._followSpec = null;
    this._orbitSpec = null;
    if (this.controls) this.controls.syncFromCamera();
    return { ok: true };
  }

  /** Lock camera into a smooth chase / aerial pursuit rig following any vehicle `id`. */
  followVehicle(vehicleId, { distance = 28, height = 9, lookAhead = 14 } = {}) {
    this._shotQueue.length = 0;
    this._activeShot = null;
    this._orbitSpec = null;
    this._followSpec = {
      vehicleId: Number(vehicleId) | 0,
      distance: Number(distance) || 28,
      height: Number(height) || 9,
      lookAhead: Number(lookAhead) || 14,
    };
    if (this.controls) this.controls.setGlide(false);
    return { ok: true, followingVehicle: this._followSpec.vehicleId };
  }

  /** Smoothly orbit around `[x,y,z]` or `{ buildingId, landmark, vehicleId }`. */
  orbitTarget(target, { radius = 220, height = 140, angularSpeed = 0.22 } = {}) {
    const pt = this._resolveTargetPoint(target);
    if (!pt) return { ok: false, reason: 'target-not-found' };
    this._shotQueue.length = 0;
    this._activeShot = null;
    this._followSpec = null;
    const p = this.camera.position;
    const startAngle = Math.atan2(p.z - pt.z, p.x - pt.x);
    this._orbitSpec = {
      targetSpec: target,
      radius: Math.max(20, Number(radius) || 220),
      height: Number(height) || 140,
      angularSpeed: Number(angularSpeed) || 0.22,
      angle: startAngle,
    };
    if (this.controls) this.controls.setGlide(false);
    return { ok: true, center: [pt.x, pt.y, pt.z] };
  }

  _startNextShot() {
    if (!this._shotQueue.length || !this.camera) {
      this._activeShot = null;
      return;
    }
    const raw = this._shotQueue.shift();
    if (this.controls) this.controls.setGlide(false);

    const activateShot = () => {
      const fromVec = raw.from
        ? this._resolveTargetPoint(raw.from)
        : this.camera.position.clone();
      const toVec = this._resolveTargetPoint(raw.to || raw.pos || raw.position) || fromVec.clone();
      const dur = Math.max(0, Number(raw.duration ?? (raw.type === 'cut' ? 0 : 4.5)));

      if (raw.roll !== undefined && this.controls && typeof this.controls.setCameraRoll === 'function') {
        this.controls.setCameraRoll((Number(raw.roll) * Math.PI) / 180);
      }

      if (dur <= 0.001 || raw.type === 'cut') {
        this.camera.position.copy(toVec);
        if (raw.fov && Number.isFinite(raw.fov)) {
          this.camera.fov = Math.max(15, Math.min(150, raw.fov));
          this.camera.updateProjectionMatrix?.();
        }
        if (raw.lookAt) this.lookAt(raw.lookAt, { immediate: true });
        else if (this.controls) this.controls.syncFromCamera();
        this._startNextShot();
        return;
      }

      // Snap camera immediately to shot `from` start point so any wipe/dissolve/fade reveals the new shot cleanly!
      if (raw.from) {
        this.camera.position.copy(fromVec);
        if (raw.lookAt) this.lookAt(raw.lookAt, { immediate: true });
      }

      this._activeShot = {
        type: raw.type || 'dolly',
        from: fromVec,
        to: toVec,
        lookAt: raw.lookAt || null,
        startFov: this.camera.fov || 58,
        endFov: Number.isFinite(raw.fov) ? Math.max(15, Math.min(150, raw.fov)) : (this.camera.fov || 58),
        duration: dur,
        elapsed: 0,
        ease: raw.ease || 'C2',
        orbitCenter: raw.orbitCenter || raw.lookAt || null,
        orbitRadius: raw.radius || 220,
        orbitStartAngle: raw.startAngle ?? 0,
        orbitEndAngle: raw.endAngle ?? Math.PI * 0.75,
      };
    };

    if (raw.transition && raw.transition !== 'cut' && typeof this.onEditTransition === 'function') {
      this._activeShot = {
        type: 'transition_wait',
        from: this.camera.position.clone(),
        to: this.camera.position.clone(),
        lookAt: null,
        startFov: this.camera.fov || 58,
        endFov: this.camera.fov || 58,
        duration: 999,
        elapsed: 0,
        ease: 'linear',
      };
      this.onEditTransition({
        type: raw.transition,
        duration: raw.transitionDuration ?? 0.9,
        feather: raw.transitionFeather,
        hold: raw.transitionHold,
        color: raw.transitionColor,
        onCut: () => {
          this._activeShot = null;
          activateShot();
        },
      });
      return;
    }

    activateShot();
  }

  /* -----------------------------------------------------------------------
   * 3. BUILDING LIGHT TAKEOVER & 4-SIDED FACADE MESSAGE DISPLAY
   * ----------------------------------------------------------------------- */

  _resolveBuilding(selector = 'lookingAt') {
    const city = this.getCity ? this.getCity() : null;
    const nBoxes = city?.count || 0;
    if (!nBoxes) return null;

    if (typeof selector === 'number') {
      const box = getCityBuildingBox(city, selector | 0);
      if (box) return { buildingId: selector | 0, box };
    }
    if (selector === 'lookingAt') {
      const ray = this.whatAmILookingAt({ includeFrustumScan: false });
      if (ray.hit && ray.hit.buildingId !== undefined) {
        const box = getCityBuildingBox(city, ray.hit.buildingId);
        if (box) return { buildingId: ray.hit.buildingId, box };
      }
      const vis = this.scanVisibleEntities({ limit: 10 }).find((e) => e.buildingId !== undefined);
      if (vis) {
        const box = getCityBuildingBox(city, vis.buildingId);
        if (box) return { buildingId: vis.buildingId, box };
      }
    }
    const refX = (Array.isArray(selector) ? selector[0] : selector?.x) ?? this.camera?.position.x ?? 0;
    const refZ = (Array.isArray(selector) ? selector[1] : selector?.z) ?? this.camera?.position.z ?? 0;
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < nBoxes; i++) {
      const top = city.y[i] + city.h[i] * 0.5;
      if (top < 45) continue;
      const d = Math.hypot(city.x[i] - refX, city.z[i] - refZ) - top * 0.25;
      if (d < bestScore) { bestScore = d; bestIdx = i; }
    }
    return { buildingId: bestIdx, box: getCityBuildingBox(city, bestIdx) };
  }

  /**
   * Take over a building's shader window lights (`mode`: `'off'|'blackout'|'solid'|'pulse'|'strobe'|'dim'`)
   * and optionally mount a glowing 4-sided LED window-matrix message across its upper facade!
   */
  takeoverBuilding({
    building = 'lookingAt',
    mode = 'pulse',
    color = '#00f5ff',
    message = null,
    subtext = '',
    scrollSpeed = 0.16,
    heightFraction = 0.76,
    bandHeight = 22,
  } = {}) {
    const resolved = this._resolveBuilding(building);
    if (!resolved) return { ok: false, reason: 'no-buildings-in-city' };
    const { buildingId, box } = resolved;

    const modeMap = { off: 0, normal: 0, blackout: 1, solid: 2, pulse: 2, strobe: 3, dim: 4 };
    const effectiveMode = message && (mode === 'pulse' || mode === 'normal')
      ? 4 // dim background windows slightly so the LED facade text reads crystal clear!
      : (modeMap[mode] ?? 2);

    if (this.U?.uOverrideBldg && this.U?.uOverrideColor) {
      const halfExt = Math.max(box.hx, box.hz) + 2.5;
      this.U.uOverrideBldg.value.set(box.x, box.z, halfExt, effectiveMode);
      this.U.uOverrideColor.value.set(color || '#00f5ff');
    }

    let messageId = null;
    if (message !== null && String(message).trim().length > 0) {
      const res = this.displayBuildingMessage({
        building: buildingId,
        text: String(message),
        subtext,
        color,
        scrollSpeed,
        heightFraction,
        bandHeight,
        dimBuilding: effectiveMode === 4,
      });
      messageId = res.messageId;
    }

    return {
      ok: true,
      buildingId,
      position: [Math.round(box.x * 10) / 10, Math.round(box.h * 10) / 10, Math.round(box.z * 10) / 10],
      lightMode: effectiveMode,
      color,
      messageId,
    };
  }

  /**
   * Mount a 4-sided glowing architectural LED window-matrix text display around any building!
   */
  displayBuildingMessage({
    building = 'lookingAt',
    text = 'HELLO PETACITY',
    subtext = '',
    color = '#3cf5ff',
    subColor = '#ff7bd5',
    scrollSpeed = 0.16,
    heightFraction = 0.76,
    bandHeight = 22,
    dimBuilding = true,
  } = {}) {
    const resolved = this._resolveBuilding(building);
    if (!resolved) return { ok: false, reason: 'no-buildings-in-city' };
    const { buildingId, box } = resolved;

    // Replace any existing message rig on this same building cleanly
    for (const [k, v] of this._buildingMessages.entries()) {
      if (v.buildingId === buildingId) this.removeBuildingMessage(k);
    }

    if (dimBuilding && this.U?.uOverrideBldg) {
      const halfExt = Math.max(box.hx, box.hz) + 2.5;
      this.U.uOverrideBldg.value.set(box.x, box.z, halfExt, 4);
      if (this.U.uOverrideColor) this.U.uOverrideColor.value.set(color);
    }

    const paddedText = scrollSpeed !== 0 ? `   ${text}   *` : text;
    const tex = buildGlyphMatrixTexture({
      text: paddedText,
      subtext,
      fgColor: color,
      subColor,
      bgColor: '#03060e',
      bgAlpha: 0.86,
      border: true,
      windowGrid: true,
      padCols: 2,
    });

    const hScale = this.U?.uHeightScale?.value ?? 1.0;
    const topY = box.h * hScale;
    const bh = Math.max(10, Math.min(topY * 0.45, Number(bandHeight) || 22));
    const cy = Math.max(bh * 0.6 + 8, Math.min(topY - bh * 0.55 - 2, topY * heightFraction));

    // Open-ended 4-wall architectural wrap sitting 0.45m outside the building curtain wall
    const wX = box.hx * 2 + 0.9;
    const wZ = box.hz * 2 + 0.9;
    const geo = new THREE.BoxGeometry(wX, bh, wZ);
    // Strip top & bottom faces (indices 2 and 3 in BoxGeometry groups) so only the 4 vertical facades render!
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.FrontSide,
    });
    const invisibleMat = new THREE.MeshBasicMaterial({ visible: false });
    const mesh = new THREE.Mesh(geo, [mat, mat, invisibleMat, invisibleMat, mat, mat]);
    mesh.position.set(box.x, cy, box.z);
    mesh.renderOrder = 5;
    this.buildingGroup.add(mesh);

    const id = `bldg-msg-${this._nextId++}`;
    this._buildingMessages.set(id, {
      id,
      buildingId,
      box,
      mesh,
      mat,
      invisibleMat,
      tex,
      text,
      scrollSpeed: Number(scrollSpeed) || 0,
      heightFraction,
      bandHeight: bh,
      offset: 0,
    });

    return {
      ok: true,
      messageId: id,
      buildingId,
      text,
      worldPosition: [Math.round(box.x), Math.round(cy), Math.round(box.z)],
    };
  }

  removeBuildingMessage(messageId) {
    const entry = this._buildingMessages.get(messageId);
    if (!entry) return false;
    this.buildingGroup.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    entry.mat.dispose();
    entry.invisibleMat.dispose();
    entry.tex.dispose();
    this._buildingMessages.delete(messageId);
    return true;
  }

  clearBuildingOverrides() {
    if (this.U?.uOverrideBldg) this.U.uOverrideBldg.value.set(0, 0, 0, 0);
    for (const k of [...this._buildingMessages.keys()]) this.removeBuildingMessage(k);
    return { ok: true };
  }

  /* -----------------------------------------------------------------------
   * 4. SIGNAGE & BILLBOARD TAKEOVER
   * ----------------------------------------------------------------------- */

  takeoverSignage({
    sign = 'lookingAt',
    text = 'OBEY THE SKY',
    subtext = 'CHANNEL 09',
    color = '#ff4fd8',
    subColor = '#47f5ff',
    scrollSpeed = 0,
  } = {}) {
    const city = this.getCity ? this.getCity() : null;
    const bills = city?.bills || [];
    if (!bills.length) return { ok: false, reason: 'no-billboards-in-city' };

    let signIdx = 0;
    if (typeof sign === 'number' && bills[sign | 0]) {
      signIdx = sign | 0;
    } else if (sign === 'lookingAt') {
      const ray = this.whatAmILookingAt({ includeFrustumScan: false });
      if (ray.hit?.signId !== undefined) {
        signIdx = ray.hit.signId;
      } else {
        const vis = this.scanVisibleEntities({ limit: 16 }).find((e) => e.signId !== undefined);
        if (vis) signIdx = vis.signId;
        else {
          // Nearest mega-billboard to camera
          const cx = this.camera?.position.x ?? 0;
          const cz = this.camera?.position.z ?? 0;
          let bestD = Infinity;
          for (let i = 0; i < bills.length; i++) {
            const d = Math.hypot(bills[i].x - cx, bills[i].z - cz) * (bills[i].mega ? 0.45 : 1.0);
            if (d < bestD) { bestD = d; signIdx = i; }
          }
        }
      }
    }

    for (const [k, v] of this._signOverrides.entries()) {
      if (v.signIndex === signIdx) this.removeSignOverride(k);
    }

    const bl = bills[signIdx];
    const hScale = this.U?.uHeightScale?.value ?? 1.0;
    const tex = buildGlyphMatrixTexture({
      text: scrollSpeed ? `  ${text}  ` : text,
      subtext,
      fgColor: color,
      subColor,
      bgColor: '#050814',
      bgAlpha: 0.96,
      border: true,
      windowGrid: false,
      padCols: 2,
    });

    const geo = new THREE.PlaneGeometry(bl.w * 1.04, bl.h * 1.04);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const ny = Math.sin(bl.ry || 0) * 0.35;
    const nz = Math.cos(bl.ry || 0) * 0.35;
    mesh.position.set(bl.x + ny, bl.y * hScale, bl.z + nz);
    mesh.rotation.y = bl.ry || 0;
    mesh.renderOrder = 6;
    this.signGroup.add(mesh);

    const id = `sign-ovr-${this._nextId++}`;
    this._signOverrides.set(id, {
      id,
      signIndex: signIdx,
      bill: bl,
      mesh,
      mat,
      tex,
      text,
      scrollSpeed: Number(scrollSpeed) || 0,
      offset: 0,
    });

    return {
      ok: true,
      overrideId: id,
      signId: signIdx,
      mega: !!bl.mega,
      position: [Math.round(bl.x), Math.round(bl.y * hScale), Math.round(bl.z)],
      text,
    };
  }

  removeSignOverride(id) {
    const e = this._signOverrides.get(id);
    if (!e) return false;
    this.signGroup.remove(e.mesh);
    e.mesh.geometry.dispose();
    e.mat.dispose();
    e.tex.dispose();
    this._signOverrides.delete(id);
    return true;
  }

  clearSignOverrides() {
    for (const k of [...this._signOverrides.keys()]) this.removeSignOverride(k);
    return { ok: true };
  }

  /* -----------------------------------------------------------------------
   * 5. PROJECT HOLOGRAM IN FRONT OF CAMERA (OR ANYWHERE IN WORLD)
   *    Complete with emitter drone pod + terminating projector light cone!
   * ----------------------------------------------------------------------- */

  projectInFrontOfCamera({
    text = 'INCOMING TRANSMISSION',
    subtext = 'CHANNEL OPEN',
    shape = 'billboard', // 'billboard' | 'diamond' | 'prism' | 'ring'
    color = '#44f2ff',
    subColor = '#ff6ad5',
    distance = 36,
    offsetRight = 0,
    offsetUp = 0,
    width = 18,
    height = 9,
    followCamera = false,
    spinSpeed = 0.35,
  } = {}) {
    const cam = this.camera;
    if (!cam) return { ok: false, reason: 'no-camera' };

    const group = new THREE.Group();
    const colObj = new THREE.Color(color || '#44f2ff');
    const tex = buildGlyphMatrixTexture({
      text,
      subtext,
      fgColor: color,
      subColor,
      bgColor: '#041222',
      bgAlpha: 0.45,
      border: true,
      windowGrid: false,
      padCols: 2,
    });

    // 1. Volumetric Hologram Mesh (single-sided FrontSide planar projection or outward 3D solid)
    const isPlanar = shape === 'billboard' || shape === 'disc' || shape === 'panel';
    let holoGeo;
    if (shape === 'diamond') holoGeo = new THREE.OctahedronGeometry(Math.max(width, height) * 0.42, 0);
    else if (shape === 'cuboctahedron' || shape === 'dodecahedron') holoGeo = new THREE.DodecahedronGeometry(Math.max(width, height) * 0.38, 0);
    else if (shape === 'icosahedron') holoGeo = new THREE.IcosahedronGeometry(Math.max(width, height) * 0.40, 0);
    else if (shape === 'knot') holoGeo = new THREE.TorusKnotGeometry(Math.max(width, height) * 0.25, Math.max(0.45, Math.min(width, height) * 0.08), 56, 8, 2, 3);
    else if (shape === 'prism') holoGeo = new THREE.CylinderGeometry(width * 0.34, width * 0.34, height, 6, 1, true);
    else if (shape === 'ring') holoGeo = new THREE.TorusGeometry(width * 0.38, Math.max(0.6, height * 0.12), 10, 32);
    else if (shape === 'disc') holoGeo = new THREE.CircleGeometry(Math.min(width, height) * 0.52, 32);
    else holoGeo = new THREE.PlaneGeometry(width, height);

    const holoMat = new THREE.MeshBasicMaterial({
      map: tex,
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const holoMesh = new THREE.Mesh(holoGeo, holoMat);
    holoMesh.renderOrder = 7;
    group.add(holoMesh);

    // Wireframe holo cage accent (FrontSide only)
    const wireMat = new THREE.MeshBasicMaterial({
      color: colObj,
      wireframe: true,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const wireMesh = new THREE.Mesh(holoGeo, wireMat);
    wireMesh.scale.setScalar(1.03);
    holoMesh.add(wireMesh);

    // 2. Physical Projector Drone Pod + Terminating Light Frustum (`projectorFrustumGeometry`)!
    // Planar projections place the emitter pod BEHIND and below the single FrontSide plane so
    // emitter -> pyramid/cone frustum -> single plane face the viewer as one directional projector!
    const podZ = isPlanar ? -Math.max(6.0, width * 0.42) : 0.0;
    const podOffset = new THREE.Vector3(0, -height * 0.95 - 5.5, podZ);
    const podGeo = new THREE.CylinderGeometry(0.65, 0.95, 1.4, 8);
    const podMat = new THREE.MeshBasicMaterial({ color: 0x1a2434 });
    const podMesh = new THREE.Mesh(podGeo, podMat);
    podMesh.position.copy(podOffset);
    const lensGeo = new THREE.SphereGeometry(0.52, 8, 6);
    const lensMat = new THREE.MeshBasicMaterial({ color: colObj, blending: THREE.AdditiveBlending });
    const lensMesh = new THREE.Mesh(lensGeo, lensMat);
    lensMesh.position.set(0, 0.65, 0);
    podMesh.add(lensMesh);
    group.add(podMesh);

    const frustumShape = shape === 'disc' ? 'circle' : (isPlanar ? 'pyramid' : 'vertical');
    const frustumGeo = projectorFrustumGeometry(
      podOffset.x, podOffset.y + 0.65, podOffset.z,
      { x: 0, y: 0, z: 0, w: width * 1.08, h: height * 1.08, frustumShape },
      0.5,
      [colObj.r, colObj.g, colObj.b],
    );
    const U = this.U || {};
    const frustumMat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: {
        uBeamCol: { value: colObj.clone() },
        uBeamK: { value: 0.42 },
        uTime: U.uTime || { value: 0 },
        uLightK: U.uLightK || { value: 1 },
        uWorldCurve: U.uWorldCurve || { value: 0 },
        uPlanetR: U.uPlanetR || { value: 2100 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });
    const frustumMesh = new THREE.Mesh(frustumGeo, frustumMat);
    frustumMesh.renderOrder = 6;
    group.add(frustumMesh);

    const placeRelativeToCamera = () => {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).normalize();
      group.position.copy(cam.position)
        .addScaledVector(fwd, distance)
        .addScaledVector(right, offsetRight)
        .addScaledVector(up, offsetUp);
      group.lookAt(cam.position);
    };
    placeRelativeToCamera();

    this.holoGroup.add(group);
    const id = `proj-holo-${this._nextId++}`;
    this._projectedHolos.set(id, {
      id,
      group,
      holoMesh,
      wireMat,
      podMesh,
      podMat,
      lensMat,
      frustumMesh,
      frustumMat,
      holoMat,
      tex,
      text,
      shape,
      followCamera: !!followCamera,
      distance: Number(distance) || 36,
      offsetRight: Number(offsetRight) || 0,
      offsetUp: Number(offsetUp) || 0,
      spinSpeed: shape === 'billboard' ? 0 : (Number(spinSpeed) || 0.35),
      radius: Math.max(width, height) * 0.55,
    });

    return {
      ok: true,
      projectionId: id,
      text,
      shape,
      followCamera: !!followCamera,
      worldPosition: [
        Math.round(group.position.x * 10) / 10,
        Math.round(group.position.y * 10) / 10,
        Math.round(group.position.z * 10) / 10,
      ],
    };
  }

  removeProjection(id) {
    const e = this._projectedHolos.get(id);
    if (!e) return false;
    this.holoGroup.remove(e.group);
    e.holoMesh.geometry.dispose();
    e.holoMat.dispose();
    e.wireMat.dispose();
    e.podMesh.geometry.dispose();
    e.podMat.dispose();
    e.lensMat.dispose();
    e.frustumMesh.geometry.dispose();
    e.frustumMat.dispose();
    e.tex.dispose();
    this._projectedHolos.delete(id);
    return true;
  }

  clearProjections() {
    for (const k of [...this._projectedHolos.keys()]) this.removeProjection(k);
    return { ok: true };
  }

  /* -----------------------------------------------------------------------
   * 6. PER-VEHICLE / CAR CONTROL & SCRIPTED CHOREOGRAPHY
   * ----------------------------------------------------------------------- */

  controlVehicle({
    vehicle = 'nearest',
    position = null,
    yaw = undefined,
    pitch = undefined,
    roll = undefined,
    speed = 55,
    speedMul = undefined,
    freeze = undefined,
    headlights = undefined, // 'on' | 'off' | 'glow-only'
    color = undefined,
    waypoints = null,
    loopWaypoints = true,
    parkInFrontOfCamera = false,
    circleCamera = false,
  } = {}) {
    const vehicles = this.getVehicles ? this.getVehicles() : null;
    if (!vehicles || typeof vehicles.setVehicleOverride !== 'function') {
      return { ok: false, reason: 'vehicles-unavailable' };
    }

    let id = 0;
    if (typeof vehicle === 'number') {
      id = vehicle | 0;
    } else if (vehicle === 'lookingAt') {
      const ray = this.whatAmILookingAt({ includeFrustumScan: false });
      if (ray.hit?.vehicleId !== undefined) id = ray.hit.vehicleId;
      else {
        const near = vehicles.listVehicles({ limit: 1, near: [this.camera.position.x, this.camera.position.y, this.camera.position.z] });
        if (near.length) id = near[0].id;
      }
    } else {
      const near = vehicles.listVehicles({
        limit: 1,
        classFilter: vehicle === 'car' ? 0 : (vehicle === 'spinner' ? 1 : (vehicle === 'train' ? 2 : null)),
        near: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      });
      if (near.length) id = near[0].id;
    }

    const hlVal = headlights === 'off' ? 0 : (headlights === 'glow-only' ? 0.08 : (headlights === 'on' ? 1.35 : (typeof headlights === 'number' ? headlights : undefined)));
    const curState = vehicles.getVehicleState(id);
    if (!curState) return { ok: false, reason: 'invalid-vehicle-id' };

    let initPos = position;
    let initYaw = yaw;
    if (parkInFrontOfCamera && this.camera) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
      fwd.normalize();
      initPos = [
        this.camera.position.x + fwd.x * 26,
        Math.max(0.85, this.camera.position.y - 3.5),
        this.camera.position.z + fwd.z * 26,
      ];
      initYaw = Math.atan2(fwd.x, fwd.z) + Math.PI * 0.25;
    }

    const ovr = {};
    if (Array.isArray(initPos) && initPos.length >= 3) {
      ovr.x = Number(initPos[0]);
      ovr.y = Number(initPos[1]);
      ovr.z = Number(initPos[2]);
    }
    if (initYaw !== undefined) ovr.yaw = Number(initYaw);
    if (pitch !== undefined) ovr.pitch = Number(pitch);
    if (roll !== undefined) ovr.roll = Number(roll);
    if (speedMul !== undefined) ovr.speedMul = Number(speedMul);
    if (freeze !== undefined) ovr.freeze = !!freeze;
    if (hlVal !== undefined) ovr.headlights = hlVal;
    if (color !== undefined) ovr.color = color;

    if (Array.isArray(waypoints) && waypoints.length >= 2) {
      const pts = waypoints.map((w) => [Number(w[0]) || 0, Number(w[1]) || 1.2, Number(w[2]) || 0]);
      ovr.x = ovr.x ?? pts[0][0];
      ovr.y = ovr.y ?? pts[0][1];
      ovr.z = ovr.z ?? pts[0][2];
      this._vehicleScripts.set(id, {
        mode: 'waypoints',
        waypoints: pts,
        wpIdx: 1,
        pos: [ovr.x, ovr.y, ovr.z],
        speed: Math.max(2, Number(speed) || 55),
        loop: !!loopWaypoints,
        color,
        headlights: hlVal,
      });
    } else if (circleCamera) {
      const rad = typeof circleCamera === 'object' ? (circleCamera.radius || 38) : 38;
      this._vehicleScripts.set(id, {
        mode: 'circleCamera',
        radius: rad,
        angle: 0,
        speed: Math.max(4, Number(speed) || 45),
        color,
        headlights: hlVal,
      });
    } else {
      this._vehicleScripts.delete(id);
    }

    const resState = vehicles.setVehicleOverride(id, ovr);
    return {
      ok: Boolean(resState),
      vehicleId: id,
      state: resState || vehicles.getVehicleState(id),
    };
  }

  releaseVehicle(vehicleId = null) {
    const vehicles = this.getVehicles ? this.getVehicles() : null;
    if (vehicleId === null || vehicleId === undefined) {
      this._vehicleScripts.clear();
      vehicles?.clearVehicleOverride?.();
      return { ok: true, released: 'all' };
    }
    this._vehicleScripts.delete(vehicleId | 0);
    vehicles?.clearVehicleOverride?.(vehicleId | 0);
    return { ok: true, released: vehicleId | 0 };
  }

  /* -----------------------------------------------------------------------
   * PER-FRAME UPDATE & CITY REBUILD LIFECYCLE
   * ----------------------------------------------------------------------- */

  onCityRebuilt() {
    // Clear building-index / sign-index bound meshes when city topology regenerates
    this.clearBuildingOverrides();
    this.clearSignOverrides();
    this._vehicleScripts.clear();
  }

  getStatus() {
    return {
      activeShot: this._activeShot ? this._activeShot.type : null,
      queuedShots: this._shotQueue.length,
      followingVehicle: this._followSpec ? this._followSpec.vehicleId : null,
      orbiting: Boolean(this._orbitSpec),
      buildingMessages: [...this._buildingMessages.values()].map((m) => ({
        messageId: m.id, buildingId: m.buildingId, text: m.text,
      })),
      signOverrides: [...this._signOverrides.values()].map((s) => ({
        overrideId: s.id, signId: s.signIndex, text: s.text,
      })),
      projections: [...this._projectedHolos.values()].map((p) => ({
        projectionId: p.id, text: p.text, shape: p.shape, followCamera: p.followCamera,
      })),
      scriptedVehicles: [...this._vehicleScripts.keys()],
    };
  }

  update(dt) {
    const clampedDt = Math.min(0.1, Math.max(0, dt));
    this._time += clampedDt;
    const hScale = this.U?.uHeightScale?.value ?? 1.0;

    // 1. Update scrolling building facade LED marquees & heightScale sync
    for (const m of this._buildingMessages.values()) {
      if (m.scrollSpeed !== 0) {
        m.offset = (m.offset + m.scrollSpeed * clampedDt) % 1;
        m.tex.offset.x = m.offset;
      }
      const topY = m.box.h * hScale;
      m.mesh.position.y = Math.max(m.bandHeight * 0.6 + 8, Math.min(topY - m.bandHeight * 0.55 - 2, topY * m.heightFraction));
    }

    // 2. Update hijacked billboards
    for (const s of this._signOverrides.values()) {
      if (s.scrollSpeed !== 0) {
        s.offset = (s.offset + s.scrollSpeed * clampedDt) % 1;
        s.tex.offset.x = s.offset;
      }
      s.mesh.position.y = s.bill.y * hScale;
    }

    // 3. Update camera-projected & world holograms + terminating projector frustums
    if (this.camera) {
      for (const p of this._projectedHolos.values()) {
        if (p.followCamera) {
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize();
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();
          p.group.position.copy(this.camera.position)
            .addScaledVector(fwd, p.distance)
            .addScaledVector(right, p.offsetRight)
            .addScaledVector(up, p.offsetUp);
          p.group.lookAt(this.camera.position);
        }
        if (p.spinSpeed !== 0) {
          p.holoMesh.rotation.y += p.spinSpeed * clampedDt;
        }
        // Subtle holographic projector shimmer
        p.frustumMat.opacity = 0.19 + 0.05 * Math.sin(this._time * 7.3);
      }
    }

    // 4. Update scripted cars / vehicles (waypoint routes & orbit-camera)
    const vehicles = this.getVehicles ? this.getVehicles() : null;
    if (vehicles && this._vehicleScripts.size > 0) {
      for (const [vid, sc] of this._vehicleScripts.entries()) {
        if (sc.mode === 'circleCamera' && this.camera) {
          sc.angle += (sc.speed / Math.max(8, sc.radius)) * clampedDt;
          const vx = this.camera.position.x + Math.cos(sc.angle) * sc.radius;
          const vz = this.camera.position.z + Math.sin(sc.angle) * sc.radius;
          const vy = Math.max(1.2, this.camera.position.y - 6);
          const yaw = Math.atan2(-Math.sin(sc.angle), Math.cos(sc.angle));
          vehicles.setVehicleOverride(vid, {
            x: vx, y: vy, z: vz, yaw, color: sc.color, headlights: sc.headlights,
          });
        } else if (sc.mode === 'waypoints' && sc.waypoints.length >= 2) {
          const tgt = sc.waypoints[sc.wpIdx];
          const dx = tgt[0] - sc.pos[0];
          const dy = tgt[1] - sc.pos[1];
          const dz = tgt[2] - sc.pos[2];
          const dist = Math.hypot(dx, dy, dz);
          const step = sc.speed * clampedDt;
          if (dist <= Math.max(1.5, step)) {
            sc.pos = [tgt[0], tgt[1], tgt[2]];
            if (sc.wpIdx + 1 < sc.waypoints.length) sc.wpIdx++;
            else if (sc.loop) sc.wpIdx = 0;
            else this._vehicleScripts.delete(vid);
          } else {
            sc.pos[0] += (dx / dist) * step;
            sc.pos[1] += (dy / dist) * step;
            sc.pos[2] += (dz / dist) * step;
          }
          const horiz = Math.hypot(dx, dz) || 1;
          const yaw = Math.atan2(dx, dz);
          const pitch = -Math.atan2(dy, horiz);
          vehicles.setVehicleOverride(vid, {
            x: sc.pos[0], y: sc.pos[1], z: sc.pos[2], yaw, pitch,
            color: sc.color, headlights: sc.headlights,
          });
        }
      }
    }

    // 5. Update active camera shot / vehicle pursuit / orbital rig
    if (this._activeShot && this._activeShot.type === 'transition_wait') {
      return;
    }
    if (this._activeShot && this.camera) {
      const sh = this._activeShot;
      sh.elapsed += clampedDt;
      const u = Math.min(1, sh.elapsed / sh.duration);
      const k = smoothEase(u, sh.ease);

      if (sh.type === 'orbit') {
        const ctr = this._resolveTargetPoint(sh.orbitCenter) || sh.to;
        const ang = sh.orbitStartAngle + (sh.orbitEndAngle - sh.orbitStartAngle) * k;
        const h = sh.from.y + (sh.to.y - sh.from.y) * k;
        this.camera.position.set(
          ctr.x + Math.cos(ang) * sh.orbitRadius,
          h,
          ctr.z + Math.sin(ang) * sh.orbitRadius
        );
      } else {
        this.camera.position.lerpVectors(sh.from, sh.to, k);
      }

      if (sh.startFov !== sh.endFov) {
        this.camera.fov = sh.startFov + (sh.endFov - sh.startFov) * k;
        this.camera.updateProjectionMatrix?.();
      }
      if (sh.lookAt) {
        const lp = this._resolveTargetPoint(sh.lookAt);
        if (lp) this.camera.lookAt(lp);
      }
      if (this.controls) this.controls.syncFromCamera();

      if (u >= 1) {
        this._activeShot = null;
        this._startNextShot();
      }
    } else if (this._followSpec && vehicles && this.camera) {
      const st = vehicles.getVehicleState(this._followSpec.vehicleId);
      if (st) {
        const [vx, vy, vz] = st.position;
        const yaw = st.yaw || 0;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const wantPos = new THREE.Vector3(
          vx - fx * this._followSpec.distance,
          vy + this._followSpec.height,
          vz - fz * this._followSpec.distance
        );
        this.camera.position.lerp(wantPos, 1 - Math.exp(-clampedDt * 6.5));
        this.camera.lookAt(vx + fx * this._followSpec.lookAhead, vy + 1.5, vz + fz * this._followSpec.lookAhead);
        if (this.controls) this.controls.syncFromCamera();
      }
    } else if (this._orbitSpec && this.camera) {
      const ctr = this._resolveTargetPoint(this._orbitSpec.targetSpec);
      if (ctr) {
        this._orbitSpec.angle += this._orbitSpec.angularSpeed * clampedDt;
        const ox = ctr.x + Math.cos(this._orbitSpec.angle) * this._orbitSpec.radius;
        const oz = ctr.z + Math.sin(this._orbitSpec.angle) * this._orbitSpec.radius;
        const oy = Math.max(12, this._orbitSpec.height);
        this.camera.position.lerp(new THREE.Vector3(ox, oy, oz), 1 - Math.exp(-clampedDt * 5.0));
        this.camera.lookAt(ctr);
        if (this.controls) this.controls.syncFromCamera();
      }
    }
  }
}
