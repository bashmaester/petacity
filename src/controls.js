// Smooth inertial Fly, Glide & Decoupled Look-Around camera controller:
//   - Adjustable camera speed (`speedMul`), motion styles (`CAMERA_STYLE_NAMES`),
//     smoothness/inertia (`smoothness`), and compact collider size (`colliderRadius`,
//     default 2.2m so camera slips cleanly through narrow alleys between towers
//     without ever passing through walls).
//   - Separate Look-Around / Freelook mode (`freelook`): decouples head/view
//     angles (`yaw`/`pitch`) from travel heading (`moveYaw`/`movePitch`) during
//     manual flight, Glide cruise, and Camera Path playback.
//   - C2-smooth continuous ray-probed anticipatory obstacle avoidance + soft
//     wall-proximity cushion + multi-substep swept sphere resolution (zero jerk).
import * as THREE from '../vendor/three.module.js';

const PITCH_LIMIT = 1.553; // ~89.0 deg for extreme skyscraper worm's-eye & nadir angles
const WHISKER_ANGLES = [-0.20, 0.20, -0.44, 0.44, -0.76, 0.76, -1.16, 1.16];

export const CAMERA_STYLE_NAMES = [
  'Cinema Drone (Balanced)',
  'FPV Agile (Crisp)',
  'Steadicam Crane (Ultra-Smooth)',
  'Orbital Glider (Wide Bank)',
  'Silk Airship (Slow Turns)',
];

const STYLE_PRESETS = [
  { lookRate: 14.0, velRate: 6.4, maxTurnRate: 1.35, glideTurnRate: 0.42, turnAccel: 4.2, maxBank: 0.14, glideBank: 0.32, bankGain: 0.075, glideBankGain: 0.20, avoidRate: 3.8 },
  { lookRate: 26.0, velRate: 13.0, maxTurnRate: 2.60, glideTurnRate: 0.78, turnAccel: 9.0, maxBank: 0.24, glideBank: 0.46, bankGain: 0.11,  glideBankGain: 0.26, avoidRate: 6.2 },
  { lookRate: 7.2,  velRate: 2.9, maxTurnRate: 0.72, glideTurnRate: 0.24, turnAccel: 2.1, maxBank: 0.04, glideBank: 0.12, bankGain: 0.03,  glideBankGain: 0.09, avoidRate: 2.4 },
  { lookRate: 10.5, velRate: 4.2, maxTurnRate: 1.05, glideTurnRate: 0.34, turnAccel: 3.0, maxBank: 0.22, glideBank: 0.48, bankGain: 0.10,  glideBankGain: 0.28, avoidRate: 3.2 },
  { lookRate: 4.8,  velRate: 2.1, maxTurnRate: 0.44, glideTurnRate: 0.16, turnAccel: 1.25, maxBank: 0.06, glideBank: 0.16, bankGain: 0.04, glideBankGain: 0.12, avoidRate: 1.8 },
];

function wrapAngleDelta(a) {
  let d = ((a + Math.PI) % (Math.PI * 2));
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
}

export class FlyControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.enabled = true;

    this.speed = 260;
    this.speedMul = 1.0;        // user speed multiplier (0.2x .. 4.0x)
    this.motionStyle = 0;       // index into CAMERA_STYLE_NAMES
    this.smoothness = 1.0;      // 0.15 (snappy) .. 3.0 (heavy cinema translational damping)
    this.turnSmooth = 1.0;      // 0.20 (crisp) .. 3.0 (ultra-gentle rate-limited turns, zero whip-pans!)
    this.colliderRadius = 2.2;  // compact 2.2m default fits narrow 5m building cracks!

    this.glide = false;
    this.glideSpeed = 165;
    this.glideTarget = null;
    this.onCourseReorient = null; // optional hook `(pos, moveYaw) => nextGlideTarget` after manual course steer

    // Minimap / Director smooth multi-waypoint autopilot route queue
    this.routeQueue = [];
    this._routeStopOnArrive = false;
    this.onRouteArrive = null;

    // Autopilot POI Auto-Look gimbal mode (gazes smoothly at nearby landmarks/POIs while slowly moving or hovering!)
    this.autoLook = false;
    this.poiList = [];
    this._autoLookPoi = null;
    this._autoLookTimer = 0;
    this._autoLookPhase = 0;

    this.freelook = false;      // separate Look-Around mode decoupled from travel heading
    this.moveYaw = 0;
    this.movePitch = 0;
    this._targetMoveYaw = 0;
    this._targetMovePitch = 0;
    this._freeYawOff = 0;       // freelance look offset during path playback / autoLook
    this._freePitchOff = 0;

    this.collision = true;
    this.avoidance = true;
    this.damping = 7.5;
    this.collider = null;
    this.heightScale = 1;
    this.worldCurve = 0;
    this.planetR = 2100;

    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.cameraRoll = 0;        // user / director Dutch roll offset (-PI .. +PI)
    this._targetYaw = 0;
    this._targetPitch = 0;
    this._yawVel = 0;
    this._pitchVel = 0;
    this._moveYawVel = 0;
    this._movePitchVel = 0;
    this._manualCourseSteered = false;

    this._drag = null;
    this._idle = 3;
    this._vel = new THREE.Vector3();
    this._avoidSide = 0;
    this._avoidActive = 0;
    this._avoidYawRate = 0;     // low-pass filtered avoidance yaw rate (rad/s)
    this._avoidPitchRate = 0;   // low-pass filtered avoidance climb rate (rad/s)
    this._avoidLiftVel = 0;     // low-pass filtered vertical cushion velocity

    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this._targetYaw = this.yaw;
    this._targetPitch = this.pitch;
    this.moveYaw = this.yaw;
    this.movePitch = this.pitch;
    this._targetMoveYaw = this.yaw;
    this._targetMovePitch = this.pitch;

    this._onDown = (ev) => {
      if (!this.enabled) return;
      dom.setPointerCapture?.(ev.pointerId);
      this._drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, touch: ev.pointerType === 'touch' };
      this._idle = 0;
    };
    this._onMove = (ev) => {
      const d = this._drag;
      if (!this.enabled || !d || d.id !== ev.pointerId) return;
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;
      d.x = ev.clientX;
      d.y = ev.clientY;
      const sens = 0.0028 / Math.max(0.65, Math.pow(this.turnSmooth || 1.0, 0.35));
      this._targetYaw -= dx * sens;
      this._targetPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._targetPitch - dy * sens));
      if (this.freelook || (this.glide && this.autoLook)) {
        this._freeYawOff -= dx * sens;
        this._freePitchOff = Math.max(-1.25, Math.min(1.25, this._freePitchOff - dy * sens));
        this._autoLookTimer = Math.max(this._autoLookTimer, 3.0);
      } else {
        this._targetMoveYaw = this._targetYaw;
        this._targetMovePitch = this._targetPitch;
        if (this.glide) this._manualCourseSteered = true;
      }
      this._idle = 0;
    };
    this._onUp = (ev) => {
      if (this._drag && this._drag.id === ev.pointerId) {
        this._drag = null;
        dom.releasePointerCapture?.(ev.pointerId);
      }
    };
    this._onWheel = (ev) => {
      if (!this.enabled) return;
      ev.preventDefault();
      if (this.glide) {
        // Allow glideSpeed down to 0 so Autopilot + Auto-Look can smoothly slow to a stationary scenic hover!
        this.glideSpeed = Math.max(0, Math.min(640, this.glideSpeed - Math.sign(ev.deltaY) * 20));
      } else {
        const fwd = this._travelForward();
        this._vel.addScaledVector(fwd, -Math.sign(ev.deltaY) * 220 * this.speedMul);
      }
    };
    this._onContext = (ev) => ev.preventDefault();
    this._onKeyDown = (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.isContentEditable)) return;
      const key = (ev.key || '').toLowerCase();
      if (key) this.keys.add(key);
      if ([' ', 'w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        this._idle = 0;
        ev.preventDefault();
      }
    };
    this._onKeyUp = (ev) => {
      const key = (ev.key || '').toLowerCase();
      if (key) this.keys.delete(key);
    };
    this._onBlur = () => {
      this.keys.clear();
      this._drag = null;
    };

    dom.addEventListener('pointerdown', this._onDown);
    dom.addEventListener('pointermove', this._onMove);
    dom.addEventListener('pointerup', this._onUp);
    dom.addEventListener('pointercancel', this._onUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
    dom.addEventListener('contextmenu', this._onContext);
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      window.addEventListener('blur', this._onBlur);
    }
  }

  _hasKey(shortKey, codeKey) {
    return this.keys.has(shortKey) || (codeKey && this.keys.has(codeKey));
  }

  _forward() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
  }

  _travelForward() {
    const decoupled = this.freelook || (this.glide && this.autoLook);
    const y = decoupled ? this.moveYaw : this.yaw;
    const p = decoupled ? this.movePitch : this.pitch;
    return new THREE.Vector3(
      -Math.sin(y) * Math.cos(p),
      Math.sin(p),
      -Math.cos(y) * Math.cos(p)
    );
  }

  setAutoLook(on) {
    const next = !!on;
    if (next && !this.autoLook) {
      this.moveYaw = this.freelook ? this.moveYaw : this.yaw;
      this.movePitch = this.freelook ? this.movePitch : this.pitch;
      this._targetMoveYaw = this.moveYaw;
      this._targetMovePitch = this.movePitch;
      this._autoLookPoi = null;
      this._autoLookTimer = 0;
      this._freeYawOff = 0;
      this._freePitchOff = 0;
    } else if (!next && this.autoLook && !this.freelook) {
      // Smoothly converge view back to travel direction with zero snap
      this._targetYaw = this.moveYaw;
      this._targetPitch = this.movePitch;
      this._freeYawOff = 0;
      this._freePitchOff = 0;
    }
    this.autoLook = next;
  }

  /**
   * Queue or set a smooth flight route to `(x, y, z)` (used by Minimap click & WebMCP).
   * Automatically inserts an elevated cruise arc waypoint if distant towers sit between
   * the camera and destination so the camera flies gracefully there instead of teleporting!
   */
  enqueueWaypoint(spot, { append = false, stopOnArrive = false } = {}) {
    if (!spot || !Number.isFinite(spot.x) || !Number.isFinite(spot.z)) return [];
    const p = this.camera.position;
    if (!append) this.routeQueue.length = 0;
    const from = append && this.routeQueue.length
      ? this.routeQueue[this.routeQueue.length - 1]
      : { x: p.x, y: p.y, z: p.z };

    const destY = Number.isFinite(spot.y) ? spot.y : Math.max(125, p.y);
    const dx = spot.x - from.x;
    const dz = spot.z - from.z;
    const dist = Math.hypot(dx, dz);

    // For longer cross-city legs (> 520m), insert a smooth elevated mid-course arc waypoint
    // above any intervening skyline ridge so the flight curves gracefully around/over blocks!
    if (dist > 520) {
      const mx = from.x + dx * 0.5;
      const mz = from.z + dz * 0.5;
      let safeMidY = Math.max(from.y, destY, 135);
      if (this.collider) {
        const ridge = this.collider.maxHeightNear(mx, mz, 95) * this.heightScale;
        if (ridge + 42 > safeMidY) safeMidY = Math.min(480, ridge + 46);
      }
      const nx = -dz / dist;
      const nz = dx / dist;
      const gentleArc = Math.min(110, dist * 0.08);
      this.routeQueue.push({
        name: `${spot.name || 'Destination'} Approach`,
        x: mx + nx * gentleArc,
        y: safeMidY,
        z: mz + nz * gentleArc,
        lookX: spot.lookX ?? spot.x,
        lookY: spot.lookY ?? (destY * 0.7),
        lookZ: spot.lookZ ?? spot.z,
        via: true,
      });
    }

    this.routeQueue.push({
      name: spot.name || 'Map Destination',
      x: spot.x,
      y: destY,
      z: spot.z,
      lookX: spot.lookX ?? spot.x,
      lookY: spot.lookY ?? Math.max(28, destY * 0.58),
      lookZ: spot.lookZ ?? spot.z,
      via: false,
    });
    this._routeStopOnArrive = !!stopOnArrive;
    this._manualCourseSteered = false;
    if (!this.glide) {
      if (this.glideSpeed < 85) this.glideSpeed = 165;
      this.setGlide(true);
    } else if (this.glideSpeed < 45) {
      this.glideSpeed = 145;
    }
    this._idle = 2.5;
    return this.routeQueue;
  }

  clearRoute() {
    this.routeQueue.length = 0;
    this._routeStopOnArrive = false;
  }

  setFreelook(on) {
    const next = !!on;
    if (next && !this.freelook) {
      // Lock current travel heading at the instant Look-Around engages
      this.moveYaw = this.yaw;
      this.movePitch = this.pitch;
      this._freeYawOff = 0;
      this._freePitchOff = 0;
    } else if (!next && this.freelook) {
      // Smoothly adopt current view direction as the new travel heading (no snap!)
      this.moveYaw = this.yaw;
      this.movePitch = this.pitch;
      this._freeYawOff = 0;
      this._freePitchOff = 0;
    }
    this.freelook = next;
  }

  _resolve() {
    return this._resolveAt(this.camera.position);
  }

  _resolveAt(p) {
    const rad = Math.max(0.4, Math.min(16, this.colliderRadius || 2.2));
    if (this.worldCurve >= 0.0005) {
      if (!this.collision) return false;
      const R = this.planetR / Math.max(this.worldCurve, 0.0005);
      const vx = p.x;
      const vy = p.y + R;
      const vz = p.z;
      const rho = Math.hypot(vx, vy, vz);
      if (rho < 1e-3) {
        p.set(0, 12, 0);
        return true;
      }
      const horiz = Math.hypot(vx, vz);
      const cosT = Math.max(-1, Math.min(1, vy / rho));
      const theta = Math.acos(cosT);
      const flatR = R * theta;
      const fx = horiz > 1e-4 ? (vx / horiz) * flatR : 0;
      const fz = horiz > 1e-4 ? (vz / horiz) * flatR : 0;
      let roof = 0;
      if (this.collider && theta < 3.08) {
        roof = this.collider.maxHeightNear(fx, fz, rad + 1.5) * this.heightScale;
      }
      const minRho = R + Math.max(2.5 + rad, roof + rad + 1.5);
      if (rho < minRho) {
        const s = minRho / rho;
        p.set(vx * s, vy * s - R, vz * s);
        return true;
      }
      return false;
    }
    if (this.collision && this.collider) {
      return this.collider.resolveSphere(p, rad, this.heightScale);
    }
    if (!this.collision) return false;
    if (p.y < 2) {
      p.y = 2;
      return true;
    }
    return false;
  }

  /**
   * Soft proximity potential field around nearby walls so the camera glides silkily
   * along narrow alleys/facades without harsh discrete contact stuttering.
   */
  _applyWallProximityCushion(p, dt) {
    if (!this.collision || !this.collider || this.worldCurve >= 0.05) return;
    const rad = Math.max(0.4, this.colliderRadius || 2.2);
    const feelR = rad + Math.max(1.8, rad * 0.95);
    if (!this.collider.hitsPoint(p.x, p.y, p.z, feelR, this.heightScale)) return;

    // Estimate smooth outward gradient via 4-axis symmetric probe
    const eps = Math.max(1.2, rad * 0.7);
    let gx = 0;
    let gz = 0;
    const hPx = this.collider.hitsPoint(p.x + eps, p.y, p.z, rad * 1.15, this.heightScale) ? 1 : 0;
    const hMx = this.collider.hitsPoint(p.x - eps, p.y, p.z, rad * 1.15, this.heightScale) ? 1 : 0;
    const hPz = this.collider.hitsPoint(p.x, p.y, p.z + eps, rad * 1.15, this.heightScale) ? 1 : 0;
    const hMz = this.collider.hitsPoint(p.x, p.y, p.z - eps, rad * 1.15, this.heightScale) ? 1 : 0;
    gx = hMx - hPx;
    gz = hMz - hPz;
    const gl = Math.hypot(gx, gz);
    if (gl > 1e-3) {
      gx /= gl;
      gz /= gl;
      const into = this._vel.x * gx + this._vel.z * gz;
      if (into < 0) {
        const damp = Math.min(1, dt * 14);
        this._vel.x -= gx * into * damp;
        this._vel.z -= gz * into * damp;
      }
    }
  }

  getPose() {
    const p = this.camera.position;
    return {
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      z: Math.round(p.z * 100) / 100,
      yaw: Math.round(this.yaw * 10000) / 10000,
      pitch: Math.round(this.pitch * 10000) / 10000,
      roll: Math.round((this.cameraRoll || 0) * 10000) / 10000,
    };
  }

  setCameraRoll(rad = 0) {
    this.cameraRoll = Number.isFinite(rad) ? rad : 0;
    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, this.roll + this.cameraRoll, 'YXZ')
    );
  }

  setPose(pose, maybeTarget = null) {
    if (Array.isArray(pose) && Array.isArray(maybeTarget)) {
      this.camera.position.set(pose[0], pose[1], pose[2]);
      this.camera.lookAt(maybeTarget[0], maybeTarget[1], maybeTarget[2]);
      this.syncFromCamera();
      return;
    }
    if (!pose || typeof pose !== 'object') return;
    if (Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.z)) {
      this.camera.position.set(pose.x, pose.y, pose.z);
    }
    if (Number.isFinite(pose.yaw)) this.yaw = pose.yaw;
    if (Number.isFinite(pose.pitch)) this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pose.pitch));
    if (Number.isFinite(pose.roll)) this.cameraRoll = pose.roll;
    this._targetYaw = this.yaw;
    this._targetPitch = this.pitch;
    this.moveYaw = this.yaw;
    this.movePitch = this.pitch;
    this._targetMoveYaw = this.yaw;
    this._targetMovePitch = this.pitch;
    this._yawVel = 0;
    this._pitchVel = 0;
    this._moveYawVel = 0;
    this._movePitchVel = 0;
    this._freeYawOff = 0;
    this._freePitchOff = 0;
    this.roll = 0;
    this._vel.set(0, 0, 0);
    this._avoidSide = 0;
    this._avoidActive = 0;
    this._avoidYawRate = 0;
    this._avoidPitchRate = 0;
    this._avoidLiftVel = 0;
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.cameraRoll || 0, 'YXZ'));
  }

  setGlide(on) {
    this.glide = !!on;
    if (!this.glide) {
      this.roll = 0;
      this._vel.set(0, 0, 0);
      this._avoidSide = 0;
      this._avoidActive = 0;
      this._avoidYawRate = 0;
      this._avoidPitchRate = 0;
      this._avoidLiftVel = 0;
      this._manualCourseSteered = false;
    } else {
      this._idle = 2.5;
      if (!this.freelook) {
        this.moveYaw = this.yaw;
        this.movePitch = this.pitch;
        this._targetMoveYaw = this.yaw;
        this._targetMovePitch = this.pitch;
      }
      this._vel.copy(this._travelForward()).multiplyScalar(this.glideSpeed * this.speedMul);
    }
  }

  /** Re-seed yaw/pitch from wherever the camera currently points (after a fly-to or path step). */
  syncFromCamera(preserveFreelookOffset = false) {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this._targetYaw = this.yaw;
    this._targetPitch = this.pitch;
    this._yawVel = 0;
    this._pitchVel = 0;
    this._moveYawVel = 0;
    this._movePitchVel = 0;
    if (!preserveFreelookOffset) {
      this.moveYaw = this.yaw;
      this.movePitch = this.pitch;
      this._targetMoveYaw = this.yaw;
      this._targetMovePitch = this.pitch;
      this._freeYawOff = 0;
      this._freePitchOff = 0;
    }
    this.roll = 0;
    this._vel.set(0, 0, 0);
    this._avoidSide = 0;
    this._avoidActive = 0;
    this._avoidYawRate = 0;
    this._avoidPitchRate = 0;
    this._avoidLiftVel = 0;
    this.keys.clear();
    this._drag = null;
  }

  _stepDampedAngle(cur, target, velField, maxRate, accel, gain, dt) {
    const err = wrapAngleDelta(target - cur);
    const wantVel = Math.max(-maxRate, Math.min(maxRate, err * gain));
    const maxDv = accel * dt;
    const dv = Math.max(-maxDv, Math.min(maxDv, wantVel - this[velField]));
    this[velField] += dv;
    if (Math.abs(this[velField] * dt) > Math.abs(err) && Math.sign(this[velField]) === Math.sign(err)) {
      this[velField] = err / Math.max(dt, 1e-3) * 0.5;
      return cur + err * Math.min(1, dt * gain);
    }
    return cur + this[velField] * dt;
  }

  _pickNextAutoLookPoi(p) {
    if (!Array.isArray(this.poiList) || !this.poiList.length) return null;
    const candidates = [];
    for (const poi of this.poiList) {
      if (!poi || !Number.isFinite(poi.x) || !Number.isFinite(poi.z)) continue;
      if (poi === this._autoLookPoi && this.poiList.length > 1) continue;
      const dx = poi.x - p.x;
      const dz = poi.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 45 || dist > 3400) continue;
      // Prefer nearby dramatic landmarks & forward-hemisphere vistas
      const brg = Math.atan2(-dx, -dz);
      const fwdCos = Math.cos(wrapAngleDelta(brg - this.moveYaw));
      const score = (1.0 / (160 + dist)) * (1.15 + 0.55 * fwdCos) * (poi.priority || 1.0);
      candidates.push({ poi, score });
    }
    if (!candidates.length) return this.poiList[Math.floor(Math.random() * this.poiList.length)] || null;
    candidates.sort((a, b) => b.score - a.score);
    const topK = Math.min(4, candidates.length);
    const idx = Math.floor(Math.abs(Math.sin((this._autoLookPhase + 1.7) * 19.31)) * topK) % topK;
    return candidates[idx].poi;
  }

  /**
   * Continuous high-resolution + binary-refined ray clearance fraction [0..1]
   * so obstacle distance varies smoothly with zero step quantization jumps!
   */
  _probeRayClearance(ox, oy, oz, dx, dy, dz, maxDist, pad) {
    const col = this.collider;
    if (!col) return 1.0;
    const steps = 18;
    const floorClear = Math.max(4.0, pad * 0.65);
    const hitsAt = (f) => {
      const dist = f * maxDist;
      const qx = ox + dx * dist;
      const qy = oy + dy * dist;
      const qz = oz + dz * dist;
      if (col.hitsPoint(qx, qy, qz, pad, this.heightScale)) return true;
      if (col.groundHeightAt && qy < col.groundHeightAt(qx, qz) + floorClear) return true;
      return false;
    };
    for (let s = 1; s <= steps; s++) {
      const fHi = s / steps;
      if (hitsAt(fHi)) {
        // 4-step binary refinement between clear `(s-1)/steps` and hit `s/steps`
        let lo = (s - 1) / steps;
        let hi = fHi;
        for (let b = 0; b < 4; b++) {
          const mid = (lo + hi) * 0.5;
          if (hitsAt(mid)) hi = mid;
          else lo = mid;
        }
        return (lo + hi) * 0.5;
      }
    }
    return 1.0;
  }

  /**
   * C2-smooth weighted-whisker anticipatory course adjustment:
   * - Scales comfort buffer with `colliderRadius` so narrow canyon cracks stay open
   *   when collider is small, yet towers directly ahead are gracefully skirted.
   * - Filters yaw/pitch steering rates exponentially so course bends never twitch.
   */
  _applyAnticipatoryAvoidance(moveDir, speed, dt, preset) {
    const smoothK = Math.max(0.25, this.smoothness || 1.0);
    const rateAlpha = 1 - Math.exp(-dt * (preset.avoidRate / Math.sqrt(smoothK)));

    if (!this.avoidance || !this.collision || !this.collider || this.worldCurve >= 0.05) {
      this._avoidSide *= Math.exp(-dt * 2.5);
      this._avoidActive *= Math.exp(-dt * 3.5);
      this._avoidYawRate += (0 - this._avoidYawRate) * rateAlpha;
      this._avoidPitchRate += (0 - this._avoidPitchRate) * rateAlpha;
      this._avoidLiftVel += (0 - this._avoidLiftVel) * rateAlpha;
      return;
    }

    const p = this.camera.position;
    const rad = Math.max(0.4, this.colliderRadius || 2.2);
    const lookAhead = Math.max(85, Math.min(340, speed * 1.45));
    // Comfort pad adapts to colliderRadius: small collider slips cleanly through wider alleys!
    const comfortPad = Math.max(rad + 2.2, Math.min(22, rad * 3.4));

    const fwdFree = this._probeRayClearance(
      p.x, p.y, p.z,
      moveDir.x, moveDir.y, moveDir.z,
      lookAhead, comfortPad
    );

    let wantYawRate = 0;
    let wantPitchRate = 0;
    let wantLift = 0;

    if (fwdFree < 0.995) {
      const hitDist = Math.max(12, fwdFree * lookAhead);
      const earlyT = 1.0 - fwdFree;
      // Smooth cubic urgency ramp (zero slope at horizon entry -> zero entry jerk!)
      const smoothUrg = earlyT * earlyT * (3 - 2 * earlyT);
      const urgency = 0.14 + 0.86 * smoothUrg;
      this._avoidActive += (urgency - this._avoidActive) * Math.min(1, dt * 4.5);

      const sampleD = Math.min(lookAhead, hitDist + 18);
      const hitX = p.x + moveDir.x * sampleD;
      const hitZ = p.z + moveDir.z * sampleD;
      const terrY = this.collider.groundHeightAt ? this.collider.groundHeightAt(hitX, hitZ) : 0;
      const rawTop = this.collider.maxHeightNear(hitX, hitZ, comfortPad + 6);
      const obsTop = rawTop > terrY + 0.5 ? rawTop * this.heightScale : terrY;

      // Smooth blend weight between climbing over low roofs/hills vs banking around tall towers
      const overDelta = obsTop - p.y;
      const climbBlend = obsTop <= terrY + 10 ? 1.0 : Math.max(0, Math.min(1, 1 - (overDelta - 18) / 36));

      if (climbBlend > 0.02) {
        const clearY = obsTop + Math.max(10, rad * 3.5);
        const climbNeed = Math.max(0, clearY - p.y);
        const curTravelPitch = this.freelook ? this.movePitch : this._targetPitch;
        const shallowPitch = Math.min(0.44, Math.atan2(climbNeed, Math.max(55, hitDist * 0.9)));
        if (curTravelPitch < shallowPitch) {
          wantPitchRate += (shallowPitch - curTravelPitch) * 1.85 * urgency * climbBlend;
        }
        wantLift += climbNeed * 0.85 * urgency * climbBlend;
      }

      const latBlend = 1.0 - climbBlend * 0.85;
      if (latBlend > 0.05) {
        const hLen = Math.hypot(moveDir.x, moveDir.z) || 1;
        const hx = moveDir.x / hLen;
        const hz = moveDir.z / hLen;

        let goalCross = 0;
        if (this.glide && this.glideTarget) {
          const gx = this.glideTarget.x - p.x;
          const gz = this.glideTarget.z - p.z;
          const gl = Math.hypot(gx, gz) || 1;
          goalCross = hx * (gz / gl) - hz * (gx / gl);
        }

        // Continuous weighted centroid across all 8 whiskers (never snaps between discrete angles!)
        let weightedTurn = 0;
        let weightTotal = 0;
        let maxFree = fwdFree;
        const whiskerPad = Math.max(rad + 1.4, comfortPad * 0.78);

        for (let i = 0; i < WHISKER_ANGLES.length; i++) {
          const ang = WHISKER_ANGLES[i];
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          const wx = hx * ca + hz * sa;
          const wz = -hx * sa + hz * ca;
          const free = this._probeRayClearance(
            p.x, p.y, p.z,
            wx, moveDir.y * 0.45, wz,
            lookAhead, whiskerPad
          );
          if (free > maxFree) maxFree = free;
          const side = Math.sign(ang);
          let w = Math.pow(Math.max(0.02, free), 2.2) / (0.35 + Math.abs(ang) * 0.55);
          if (this._avoidSide !== 0 && side === Math.sign(this._avoidSide)) w *= 1.38;
          if (goalCross !== 0 && side === Math.sign(-goalCross)) w *= 1.15;
          weightedTurn += Math.sign(ang) * (0.42 + Math.abs(ang) * 0.65) * w;
          weightTotal += w;
        }

        const normTurn = weightTotal > 1e-5 ? (weightedTurn / weightTotal) : (this._avoidSide >= 0 ? 0.6 : -0.6);
        const turnSign = Math.abs(normTurn) > 0.06 ? Math.sign(normTurn) : (this._avoidSide >= 0 ? 1 : -1);
        this._avoidSide = turnSign;

        const mag = Math.max(0.22, Math.min(0.85, Math.abs(normTurn) * 1.15)) / Math.pow(Math.max(0.35, this.turnSmooth || 1.0), 0.55);
        wantYawRate = turnSign * mag * urgency * latBlend;

        if (maxFree < 0.38) {
          wantLift += speed * 0.26 * urgency;
        }
      }
    } else {
      this._avoidSide *= Math.exp(-dt * 2.2);
      this._avoidActive *= Math.exp(-dt * 3.4);
    }

    // Low-pass filter angular & vertical avoidance rates so velocity/heading are C2 smooth!
    this._avoidYawRate += (wantYawRate - this._avoidYawRate) * rateAlpha;
    this._avoidPitchRate += (wantPitchRate - this._avoidPitchRate) * rateAlpha;
    this._avoidLiftVel += (wantLift - this._avoidLiftVel) * rateAlpha;

    const decoupled = this.freelook || (this.glide && this.autoLook);
    if (Math.abs(this._avoidYawRate) > 1e-4) {
      const dYaw = this._avoidYawRate * dt;
      this.moveYaw += dYaw;
      this._targetMoveYaw += dYaw;
      if (!decoupled) {
        this._targetYaw += dYaw;
        this.yaw += dYaw;
      }
      const cT = Math.cos(dYaw);
      const sT = Math.sin(dYaw);
      const vx = this._vel.x;
      const vz = this._vel.z;
      this._vel.x = vx * cT + vz * sT;
      this._vel.z = -vx * sT + vz * cT;
    }

    if (Math.abs(this._avoidPitchRate) > 1e-4) {
      const dp = this._avoidPitchRate * dt;
      this.movePitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.movePitch + dp));
      this._targetMovePitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._targetMovePitch + dp));
      if (!decoupled) {
        this._targetPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._targetPitch + dp));
        this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + dp));
      }
    }

    if (Math.abs(this._avoidLiftVel) > 1e-3) {
      this._vel.y += this._avoidLiftVel * dt;
    }
  }

  update(dt) {
    if (!this.enabled) return;
    const clampedDt = Math.min(Math.max(dt, 1e-4), 0.1);
    const preset = STYLE_PRESETS[Math.max(0, Math.min(STYLE_PRESETS.length - 1, this.motionStyle | 0))];
    const smoothK = Math.max(0.15, Math.min(3.5, this.smoothness || 1.0));
    const turnK = Math.max(0.20, Math.min(3.5, this.turnSmooth || 1.0));
    const spdMul = Math.max(0.1, Math.min(5.0, this.speedMul || 1.0));
    const decoupled = this.freelook || (this.glide && this.autoLook);

    const prevMoveYaw = decoupled ? this.moveYaw : this.yaw;
    const p = this.camera.position;

    const wDown = this._hasKey('w', 'KeyW') || this._hasKey('arrowup', 'ArrowUp');
    const sDown = this._hasKey('s', 'KeyS') || this._hasKey('arrowdown', 'ArrowDown');
    const aDown = this._hasKey('a', 'KeyA') || this._hasKey('arrowleft', 'ArrowLeft');
    const dDown = this._hasKey('d', 'KeyD') || this._hasKey('arrowright', 'ArrowRight');
    const upDown = this._hasKey('e', 'KeyE') || this._hasKey(' ', 'Space');
    const dnDown = this._hasKey('q', 'KeyQ');
    const shiftDown = this._hasKey('shift', 'ShiftLeft') || this._hasKey('shift', 'ShiftRight');

    const desiredVel = new THREE.Vector3();
    let routeArrivalSlowdown = 1.0;

    if (this.glide) {
      const manualSteeringKeys = aDown || dDown || upDown || dnDown;
      if (!this._drag && !manualSteeringKeys) this._idle += clampedDt;
      else this._idle = 0;

      if (wDown) this.glideSpeed = Math.min(640, this.glideSpeed + 140 * clampedDt);
      if (sDown) this.glideSpeed = Math.max(0, this.glideSpeed - 140 * clampedDt);

      // Smooth manual course steering during Autopilot (never fights or snaps back!)
      const keySteerRate = 0.72 / Math.pow(turnK, 0.55);
      if (aDown) {
        this._targetMoveYaw += keySteerRate * clampedDt;
        if (!decoupled) this._targetYaw += keySteerRate * clampedDt;
        this._manualCourseSteered = true;
      }
      if (dDown) {
        this._targetMoveYaw -= keySteerRate * clampedDt;
        if (!decoupled) this._targetYaw -= keySteerRate * clampedDt;
        this._manualCourseSteered = true;
      }
      if (upDown) {
        this._targetMovePitch = Math.min(1.05, this._targetMovePitch + 0.58 * clampedDt);
        if (!decoupled) this._targetPitch = Math.min(1.05, this._targetPitch + 0.58 * clampedDt);
        this._manualCourseSteered = true;
      }
      if (dnDown) {
        this._targetMovePitch = Math.max(-1.05, this._targetMovePitch - 0.58 * clampedDt);
        if (!decoupled) this._targetPitch = Math.max(-1.05, this._targetPitch - 0.58 * clampedDt);
        this._manualCourseSteered = true;
      }

      // If user manually steered course while touring (no explicit minimap routeQueue),
      // re-orient the scenic tour target ahead of the user's new chosen heading!
      if (this._manualCourseSteered && this._idle > 1.2 && this.routeQueue.length === 0) {
        this._manualCourseSteered = false;
        if (typeof this.onCourseReorient === 'function') {
          const nextNode = this.onCourseReorient(p, this.moveYaw);
          if (nextNode) this.glideTarget = nextNode;
        }
      }

      // Determine active autopilot destination: Minimap/Director routeQueue takes priority over tour glideTarget!
      let activeGoal = this.routeQueue.length > 0 ? this.routeQueue[0] : (this._idle > 1.6 ? this.glideTarget : null);
      if (this.routeQueue.length > 0) {
        const wp = this.routeQueue[0];
        const distWp = Math.hypot(wp.x - p.x, (wp.y - p.y) * 0.6, wp.z - p.z);
        const acceptR = wp.via ? 155 : 92;
        if (distWp < acceptR) {
          const arrived = this.routeQueue.shift();
          if (this.routeQueue.length === 0) {
            if (typeof this.onRouteArrive === 'function') this.onRouteArrive(arrived);
            if (this._routeStopOnArrive) {
              // Smoothly transition into stationary hover or gentle drift looking at the destination!
              this.glideSpeed = this.autoLook ? 18 : 0;
              this._routeStopOnArrive = false;
            }
          }
          activeGoal = this.routeQueue.length > 0 ? this.routeQueue[0] : null;
        } else if (!wp.via && this.routeQueue.length === 1 && this._routeStopOnArrive && distWp < 320) {
          routeArrivalSlowdown = Math.max(0.18, distWp / 320);
        }
      }

      if (activeGoal && (!manualSteeringKeys && (!this._drag || decoupled))) {
        const dx = activeGoal.x - p.x;
        const dy = activeGoal.y - p.y;
        const dz = activeGoal.z - p.z;
        const horiz = Math.hypot(dx, dz) || 1;
        const wantYaw = Math.atan2(-dx, -dz);
        const avoidAtten = 1.0 - 0.72 * this._avoidActive;
        const dYaw = wrapAngleDelta(wantYaw - this._targetMoveYaw);
        const maxGlideTurn = (preset.glideTurnRate / Math.pow(turnK, 0.80)) * clampedDt * avoidAtten;
        const stepYaw = Math.max(-maxGlideTurn, Math.min(maxGlideTurn, dYaw * 0.75));
        this._targetMoveYaw += stepYaw;
        if (!decoupled) this._targetYaw = this._targetMoveYaw;

        const wantPitch = Math.max(-0.40, Math.min(0.40, Math.atan2(dy, horiz)));
        const stepPitch = (wantPitch - this._targetMovePitch) * Math.min(1, clampedDt * (1.15 / Math.sqrt(turnK)) * avoidAtten);
        this._targetMovePitch += stepPitch;
        if (!decoupled) this._targetPitch = this._targetMovePitch;
      }

      // Autopilot POI Auto-Look Gimbal: smoothly gazes around at nearby POIs while moving slowly or hovering!
      if (this.autoLook && !this.freelook) {
        this._autoLookPhase += clampedDt;
        this._autoLookTimer -= clampedDt;
        if (!this._drag) {
          // Decay temporary drag offset gently back toward POI framing
          this._freeYawOff *= Math.exp(-clampedDt * 0.45);
          this._freePitchOff *= Math.exp(-clampedDt * 0.45);
        }
        if (this._autoLookTimer <= 0 || !this._autoLookPoi) {
          this._autoLookPoi = this._pickNextAutoLookPoi(p);
          this._autoLookTimer = 5.8 + (Math.abs(Math.sin(this._autoLookPhase * 3.7)) * 4.4);
        }
        if (this._autoLookPoi) {
          const lx = this._autoLookPoi.x - p.x;
          const ly = (this._autoLookPoi.lookY ?? ((this._autoLookPoi.y || 80) * 0.68)) - p.y;
          const lz = this._autoLookPoi.z - p.z;
          const lh = Math.hypot(lx, lz) || 1;
          const poiYaw = Math.atan2(-lx, -lz) + Math.sin(this._autoLookPhase * 0.28) * 0.08 + this._freeYawOff;
          const poiPitch = Math.max(-0.65, Math.min(0.55, Math.atan2(ly, lh) + Math.cos(this._autoLookPhase * 0.22) * 0.04 + this._freePitchOff));
          this._targetYaw = poiYaw;
          this._targetPitch = poiPitch;
        } else {
          // Gentle scenic horizon sweep if poiList is empty
          this._targetYaw = this.moveYaw + Math.sin(this._autoLookPhase * 0.24) * 0.55 + this._freeYawOff;
          this._targetPitch = -0.08 + Math.cos(this._autoLookPhase * 0.19) * 0.10 + this._freePitchOff;
        }
      }
    }

    // 2nd-Order Rate- & Acceleration-Limited Angular Damping (guarantees silky turns with ZERO whip-pans!)
    const maxLookRate = (this.glide && this.autoLook ? preset.glideTurnRate * 0.95 : preset.maxTurnRate) / Math.pow(turnK, 0.82);
    const maxMoveRate = (this.glide ? preset.glideTurnRate * 1.15 : preset.maxTurnRate) / Math.pow(turnK, 0.82);
    const angAccel = preset.turnAccel / Math.pow(turnK, 0.75);
    const lookGain = preset.lookRate / Math.pow(smoothK * turnK, 0.42);

    this.yaw = this._stepDampedAngle(this.yaw, this._targetYaw, '_yawVel', maxLookRate, angAccel, lookGain, clampedDt);
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT,
      this._stepDampedAngle(this.pitch, this._targetPitch, '_pitchVel', maxLookRate * 0.85, angAccel, lookGain, clampedDt)
    ));

    if (decoupled) {
      this.moveYaw = this._stepDampedAngle(this.moveYaw, this._targetMoveYaw, '_moveYawVel', maxMoveRate, angAccel, lookGain * 0.8, clampedDt);
      this.movePitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT,
        this._stepDampedAngle(this.movePitch, this._targetMovePitch, '_movePitchVel', maxMoveRate * 0.8, angAccel, lookGain * 0.8, clampedDt)
      ));
    } else {
      this.moveYaw = this.yaw;
      this.movePitch = this.pitch;
      this._targetMoveYaw = this._targetYaw;
      this._targetMovePitch = this._targetPitch;
    }

    if (this.glide) {
      const boost = shiftDown ? 2.4 : 1;
      desiredVel.copy(this._travelForward()).multiplyScalar(this.glideSpeed * spdMul * boost * routeArrivalSlowdown);
    } else {
      const boost = shiftDown ? 3.6 : 1;
      const maxSpd = this.speed * spdMul * boost;
      const fwd = this._travelForward();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
      const move = new THREE.Vector3();
      if (wDown) move.add(fwd);
      if (sDown) move.sub(fwd);
      if (aDown) move.sub(right);
      if (dDown) move.add(right);
      if (upDown) move.y += 1;
      if (dnDown) move.y -= 1;
      if (move.lengthSq() > 1e-6) {
        desiredVel.copy(move.normalize()).multiplyScalar(maxSpd);
      }
    }

    // Smooth inertial velocity response scaled by Motion Style & Smoothness slider
    const effVelRate = (preset.velRate * (this.damping / 7.5)) / smoothK;
    const velAlpha = 1 - Math.exp(-clampedDt * Math.max(0.8, effVelRate));
    this._vel.lerp(desiredVel, velAlpha);

    // Long-range C2-smooth anticipatory obstacle & terrain avoidance
    const spd = this._vel.length();
    if (spd > 1.5) {
      const moveDir = this._vel.clone().divideScalar(spd);
      this._applyAnticipatoryAvoidance(moveDir, spd, clampedDt, preset);
    } else {
      this._applyAnticipatoryAvoidance(this._travelForward(), 0, clampedDt, preset);
    }

    // Soft wall cushion + multi-substep swept sphere resolution (prevents tunneling even at 0.5m radius!)
    const stepVec = this._vel.clone().multiplyScalar(clampedDt);
    const stepDist = stepVec.length();
    if (stepDist > 1e-4) {
      const rad = Math.max(0.4, this.colliderRadius || 2.2);
      const substeps = (this.collision && this.collider && this.worldCurve < 0.05)
        ? Math.max(1, Math.min(8, Math.ceil(stepDist / Math.max(0.65, rad * 0.8))))
        : 1;
      const subDt = clampedDt / substeps;
      for (let s = 0; s < substeps; s++) {
        p.addScaledVector(this._vel, subDt);
        this._applyWallProximityCushion(p, subDt);
        const before = p.clone();
        const hit = this._resolveAt(p);
        if (hit) {
          const push = p.clone().sub(before);
          const pushLen = push.length();
          if (pushLen > 1e-5) {
            push.divideScalar(pushLen);
            const into = this._vel.dot(push);
            if (into < 0) this._vel.addScaledVector(push, -into);
          }
          if (this.glide) {
            this.movePitch = Math.min(0.60, this.movePitch + subDt * 0.45);
            if (!this.freelook) this._targetPitch = Math.min(0.60, this._targetPitch + subDt * 0.45);
          }
        }
      }
    } else {
      // Stationary safety check (e.g. when collision is toggled back ON inside a building)
      this._resolveAt(p);
    }

    // Smooth aerodynamic banking into travel turns
    const curMoveYaw = decoupled ? this.moveYaw : this.yaw;
    const yawRate = wrapAngleDelta(curMoveYaw - prevMoveYaw) / Math.max(clampedDt, 1e-3);
    const maxBank = this.glide ? preset.glideBank : preset.maxBank;
    const bankGain = this.glide ? preset.glideBankGain : preset.bankGain;
    const targetRoll = decoupled ? 0 : Math.max(-maxBank, Math.min(maxBank, yawRate * bankGain));
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-clampedDt * (6.5 / Math.sqrt(smoothK * turnK))));

    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this.pitch, this.yaw, this.roll + (this.cameraRoll || 0), 'YXZ')
    );
  }

  get velocity() {
    return this._vel;
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this._onDown);
    this.dom.removeEventListener('pointermove', this._onMove);
    this.dom.removeEventListener('pointerup', this._onUp);
    this.dom.removeEventListener('pointercancel', this._onUp);
    this.dom.removeEventListener('wheel', this._onWheel);
    this.dom.removeEventListener('contextmenu', this._onContext);
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup', this._onKeyUp);
      window.removeEventListener('blur', this._onBlur);
    }
  }
}
