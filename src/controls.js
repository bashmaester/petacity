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
// 25-ray high-angular-resolution fan (-80 deg .. +80 deg, ~3.1 deg spacing near center)
// so narrow passable cracks between buildings (>= 2 * colliderRadius + margin) are detected & threaded!
const FAN_ANGLES = [
  0.0,
  -0.012, 0.012,
  -0.028, 0.028,
  -0.055, 0.055,
  -0.115, 0.115,
  -0.180, 0.180,
  -0.255, 0.255,
  -0.340, 0.340,
  -0.440, 0.440,
  -0.560, 0.560,
  -0.700, 0.700,
  -0.860, 0.860,
  -1.040, 1.040,
  -1.220, 1.220,
  -1.400, 1.400,
];

function catmullRomScalar(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

export const CAMERA_STYLE_NAMES = [
  'Cinema Drone (Balanced)',
  'FPV Agile (Crisp)',
  'Steadicam Crane (Ultra-Smooth)',
  'Orbital Glider (Wide Bank)',
  'Silk Airship (Slow Turns)',
];

export const CINEMATIC_GAZE_MODES = [
  'Off (Locked Forward Nose)',
  'Drone DP — Motivated Reveals (All)',
  'Drone DP — Architecture & Landmarks',
  'Drone DP — Holograms & Projections',
  'Drone DP — Canyon & Spire Tilt',
  'Drone DP — Silk Horizon Turn-Lead',
];

function quintic01(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * t * (10 - 15 * t + 6 * t * t);
}

const STYLE_PRESETS = [
  { lookRate: 10.5, velRate: 3.8, maxTurnRate: 1.05, glideTurnRate: 0.30, turnAccel: 2.6, maxBank: 0.12, glideBank: 0.26, bankGain: 0.065, glideBankGain: 0.16, avoidRate: 2.65 },
  { lookRate: 22.0, velRate: 9.5, maxTurnRate: 2.20, glideTurnRate: 0.62, turnAccel: 6.8, maxBank: 0.22, glideBank: 0.40, bankGain: 0.10,  glideBankGain: 0.22, avoidRate: 4.20 },
  { lookRate: 5.2,  velRate: 1.7, maxTurnRate: 0.54, glideTurnRate: 0.17, turnAccel: 1.2, maxBank: 0.04, glideBank: 0.10, bankGain: 0.025, glideBankGain: 0.07, avoidRate: 1.45 },
  { lookRate: 7.8,  velRate: 2.6, maxTurnRate: 0.82, glideTurnRate: 0.25, turnAccel: 1.9, maxBank: 0.20, glideBank: 0.42, bankGain: 0.09,  glideBankGain: 0.24, avoidRate: 1.95 },
  { lookRate: 3.4,  velRate: 1.15, maxTurnRate: 0.32, glideTurnRate: 0.11, turnAccel: 0.72, maxBank: 0.05, glideBank: 0.13, bankGain: 0.032, glideBankGain: 0.09, avoidRate: 1.10 },
];

function wrapAngleDelta(a) {
  let d = ((a + Math.PI) % (Math.PI * 2));
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
}

/**
 * Step camera speed multiplier up (`dir > 0`) or down (`dir < 0`):
 * - `0.01` increments inside the `0 .. 0.1` fine micro-drift range
 * - `0.10` increments above `0.1`
 */
export function stepCameraSpeed(currentSpeed, dir, { min = 0, max = 3.5 } = {}) {
  const curNum = Number(currentSpeed);
  const c = Math.max(min, Math.min(max, Math.round((Number.isFinite(curNum) ? curNum : 0) * 100) / 100));
  let next = c;
  if (dir > 0) {
    const delta = c < 0.1 - 1e-6 ? 0.01 : 0.1;
    next = c + delta;
  } else if (dir < 0) {
    if (c <= 0.1 + 1e-6) {
      next = c - 0.01;
    } else {
      next = c < 0.2 - 1e-6 ? 0.1 : (c - 0.1);
    }
  }
  return Math.max(min, Math.min(max, Math.round(next * 100) / 100));
}

export class FlyControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.enabled = true;

    this.speed = 260;
    this.speedMul = 1.0;        // user speed multiplier (0.0x .. 5.0x)
    this._liveSpeedMul = null;  // smoothed live multiplier when ramped via Shift+Up/Down
    this._lastSyncedSpeedMul = 1.0;
    this._shiftChordUsed = false;
    this.motionStyle = 0;       // index into CAMERA_STYLE_NAMES
    this.smoothness = 1.0;      // 0.15 (snappy) .. 3.0 (heavy cinema translational damping)
    this.turnSmooth = 1.0;      // 0.20 (crisp) .. 3.0 (ultra-gentle rate-limited turns, zero whip-pans!)
    this.colliderRadius = 2.2;  // compact 2.2m default fits narrow 5m building cracks!

    this.glide = false;
    this.glideSpeed = 165;
    this.glideTarget = null;
    this.onCourseReorient = null; // optional hook `(pos, moveYaw) => nextGlideTarget` after manual course steer

    // Minimap / Director smooth multi-waypoint autopilot route queue & editable closed loop
    this.routeQueue = [];
    this._routeStopOnArrive = false;
    this.onRouteArrive = null;
    this.autopilotLoop = [];    // closed periodic Catmull-Rom control nodes [{ x, y, z, name }]
    this._loopU = 0;            // continuous parameter in [0, autopilotLoop.length)
    this._loopInitialized = false;

    // Experienced Drone Cinematographer Fluid-Head Gimbal (motivated, C2-smooth, zero random hunting!)
    this.autoLook = false;
    this.gazeMode = 0;          // 0=Off, 1=Drone DP (All), 2=Landmarks, 3=Projections, 4=Canyon/Spire, 5=Horizon Turn-Lead
    this._lastActiveGazeMode = 1;
    this.gimbalSmooth = 1.0;    // 0.25..3.0 cinema fluid-head inertia multiplier
    this.leadFraming = 0.82;    // 0.35..1.0 rule-of-thirds lead framing (preserves forward flight horizon)
    this.poiList = [];
    this.projectionList = [];   // 3D holograms, media screens, mega-wraps & searchlight crowns
    this.getLiveProjections = null; // optional callback returning dynamic director projections
    this._autoLookPoi = null;
    this._autoLookTimer = 0;
    this._autoLookDuration = 8.5;
    this._autoLookElapsed = 0;
    this._autoLookPhase = 0;
    this._gazeBeatCount = 0;
    this._gazeKind = 'forward';
    this._sightlineConfidence = 1.0;
    this._smoothCourseRate = 0;
    this._fluidYawTarget = 0;
    this._fluidPitchTarget = 0;
    this._yawAccel = 0;
    this._pitchAccel = 0;
    this._gazeHistory = new Map();

    // Pre-allocated zero-GC scratch vectors & arrays for low-end 60fps smoothness
    this._fwdTmp = new THREE.Vector3();
    this._travelTmp = new THREE.Vector3();
    this._desiredVel = new THREE.Vector3();
    this._moveTmp = new THREE.Vector3();
    this._rightTmp = new THREE.Vector3();
    this._moveDirTmp = new THREE.Vector3();
    this._stepVecTmp = new THREE.Vector3();
    this._beforePosTmp = new THREE.Vector3();
    this._pushVecTmp = new THREE.Vector3();
    this._outEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._fanWeights = new Float64Array(FAN_ANGLES.length);

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
    this._avoidYawRate = 0;     // 2nd-order filtered avoidance yaw rate (rad/s)
    this._avoidYawTarget = 0;   // intermediate low-pass stage for C2 smoothness
    this._avoidPitchRate = 0;   // 2nd-order filtered avoidance climb rate (rad/s)
    this._avoidPitchTarget = 0;
    this._avoidLiftVel = 0;     // low-pass filtered vertical cushion velocity

    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this._targetYaw = this.yaw;
    this._targetPitch = this.pitch;
    this._fluidYawTarget = this.yaw;
    this._fluidPitchTarget = this.pitch;
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
        // Fine proportional step near slow speeds + down to 0 stationary scenic hover!
        const step = Math.max(2.5, Math.min(22, this.glideSpeed * 0.14 + 2.5));
        this.glideSpeed = Math.max(0, Math.min(640, this.glideSpeed - Math.sign(ev.deltaY) * step));
      } else {
        const fwd = this._travelForward();
        this._vel.addScaledVector(fwd, -Math.sign(ev.deltaY) * 220 * Math.max(0.02, this.speedMul));
      }
    };
    this._onContext = (ev) => ev.preventDefault();
    this._onKeyDown = (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.isContentEditable)) return;
      const key = (ev.key || '').toLowerCase();
      // Shift + ArrowUp/Down (speed) / ArrowLeft/Right (track) / P (play path) are app shortcuts:
      // do not inject thrust/yaw or trigger Shift sprint boost!
      if (ev.shiftKey && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'p'].includes(key)) {
        this._shiftChordUsed = true;
        this.keys.delete('arrowup');
        this.keys.delete('arrowdown');
        this.keys.delete('arrowleft');
        this.keys.delete('arrowright');
        ev.preventDefault();
        return;
      }
      if (key) this.keys.add(key);
      if ([' ', 'w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        this._idle = 0;
        ev.preventDefault();
      }
    };
    this._onKeyUp = (ev) => {
      const key = (ev.key || '').toLowerCase();
      if (key) this.keys.delete(key);
      if (key === 'shift' || !ev.shiftKey) {
        this._shiftChordUsed = false;
      }
    };
    this._onBlur = () => {
      this.keys.clear();
      this._shiftChordUsed = false;
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

  _forward(out = this._fwdTmp) {
    return out.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
  }

  _travelForward(out = this._travelTmp) {
    const decoupled = this.freelook || (this.glide && this.autoLook);
    const y = decoupled ? this.moveYaw : this.yaw;
    const p = decoupled ? this.movePitch : this.pitch;
    return out.set(
      -Math.sin(y) * Math.cos(p),
      Math.sin(p),
      -Math.cos(y) * Math.cos(p)
    );
  }

  /**
   * Smoothly ramp `speedMul` toward `nextSpeed` (`0.00 .. 5.00`) without a step-velocity jump.
   * `this.speedMul` immediately reflects the target value while `_liveSpeedMul` glides exponentially.
   */
  rampSpeedMultiplier(nextSpeed) {
    const clamped = Math.max(0, Math.min(5.0, Number.isFinite(Number(nextSpeed)) ? Number(nextSpeed) : 1.0));
    if (!Number.isFinite(this._liveSpeedMul)) {
      this._liveSpeedMul = Math.max(0, Math.min(5.0, this.speedMul ?? 1.0));
    }
    this.speedMul = clamped;
    this._lastSyncedSpeedMul = clamped;
    return clamped;
  }

  /**
   * Relative drone stick / step-piloting helper for automated WebMCP agents:
   * translates along current horizontal/3D heading and/or nudges gimbal angles smoothly.
   */
  stepPilot({
    forward = 0,
    right = 0,
    up = 0,
    yawDelta = 0,
    pitchDelta = 0,
    yawDeltaDeg = undefined,
    pitchDeltaDeg = undefined,
    roll = undefined,
    rollDeg = undefined,
    fov = undefined,
    speedMul = undefined,
    dt = undefined,
    immediate = false,
  } = {}) {
    const effSpeed = Number.isFinite(speedMul) ? Math.max(0, Math.min(5.0, speedMul)) : Math.max(0, this.speedMul ?? 1);
    const stepScale = Number.isFinite(dt) ? (90 * effSpeed * Math.max(0.001, dt)) : 1.0;
    const dYaw = Number.isFinite(yawDeltaDeg) ? (yawDeltaDeg * Math.PI) / 180 : yawDelta;
    const dPitch = Number.isFinite(pitchDeltaDeg) ? (pitchDeltaDeg * Math.PI) / 180 : pitchDelta;

    if (Number.isFinite(dYaw) && dYaw !== 0) {
      this._targetYaw += dYaw;
      if (!this.freelook && !(this.glide && this.autoLook)) this._targetMoveYaw += dYaw;
      else this._freeYawOff += dYaw;
      if (immediate || Number.isFinite(dt)) {
        this.yaw += dYaw;
        this._fluidYawTarget = this.yaw;
        if (!this.freelook && !(this.glide && this.autoLook)) this.moveYaw += dYaw;
      }
    }
    if (Number.isFinite(dPitch) && dPitch !== 0) {
      this._targetPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._targetPitch + dPitch));
      if (!this.freelook && !(this.glide && this.autoLook)) {
        this._targetMovePitch = this._targetPitch;
      } else {
        this._freePitchOff = Math.max(-1.25, Math.min(1.25, this._freePitchOff + dPitch));
      }
      if (immediate || Number.isFinite(dt)) {
        this.pitch = this._targetPitch;
        this._fluidPitchTarget = this.pitch;
        if (!this.freelook && !(this.glide && this.autoLook)) this.movePitch = this.pitch;
      }
    }
    if (Number.isFinite(rollDeg)) {
      this.setCameraRoll((rollDeg * Math.PI) / 180);
    } else if (Number.isFinite(roll)) {
      this.setCameraRoll(roll);
    }
    if (Number.isFinite(fov) && this.camera) {
      this.camera.fov = Math.max(15, Math.min(150, fov));
      this.camera.updateProjectionMatrix?.();
    }

    const fwd = this._travelForward();
    const rx = -fwd.z;
    const rz = fwd.x;
    const rLen = Math.hypot(rx, rz) || 1;
    const p = this.camera.position;
    if (Number.isFinite(forward) && forward !== 0) p.addScaledVector(fwd, forward * stepScale);
    if (Number.isFinite(right) && right !== 0) {
      p.x += (rx / rLen) * right * stepScale;
      p.z += (rz / rLen) * right * stepScale;
    }
    if (Number.isFinite(up) && up !== 0) p.y = Math.max(1.5, p.y + up * stepScale);
    if (this.collision && this.collider) this._resolveAt(p);

    this._outEuler.set(this.pitch, this.yaw, this.roll + (this.cameraRoll || 0), 'YXZ');
    this.camera.quaternion.setFromEuler(this._outEuler);
    return this.getPose();
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
      if (this.gazeMode <= 0) this.gazeMode = this._lastActiveGazeMode || 1;
    } else if (!next && this.autoLook && !this.freelook) {
      // Smoothly converge view back to travel direction with zero snap
      this._targetYaw = this.moveYaw;
      this._targetPitch = this.movePitch;
      this._freeYawOff = 0;
      this._freePitchOff = 0;
    }
    if (!next) this.gazeMode = 0;
    this.autoLook = next;
  }

  setGazeMode(mode) {
    const m = Math.max(0, Math.min(CINEMATIC_GAZE_MODES.length - 1, Math.round(Number(mode) || 0)));
    if (m > 0) {
      this._lastActiveGazeMode = m;
      this.gazeMode = m;
      if (!this.autoLook) {
        this.setAutoLook(true);
      } else {
        this._autoLookPoi = null;
        this._autoLookTimer = 0;
      }
    } else {
      this.gazeMode = 0;
      this.setAutoLook(false);
    }
    return this.gazeMode;
  }

  /**
   * Queue or set a smooth flight route to `(x, y, z)` (used by Landmark dropdown, Minimap click & WebMCP).
   * Preserves the camera's current cruise speed and inserts an elevated cruise arc waypoint if
   * distant towers sit between the camera and destination so the camera flies gracefully there!
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
    // Preserve current camera speed! Only initialize glideSpeed if <= 0.
    if (!Number.isFinite(this.glideSpeed) || this.glideSpeed <= 0) {
      this.glideSpeed = 120;
    }
    if (!this.glide) {
      this.setGlide(true);
    }
    this._idle = 2.5;
    // Let Strategic Gaze anticipate the newly selected destination landmark when within visual range
    if (this.autoLook && dist < 950) {
      this._autoLookTimer = Math.min(this._autoLookTimer, 0.8);
    }
    return this.routeQueue;
  }

  clearRoute() {
    this.routeQueue.length = 0;
    this._routeStopOnArrive = false;
  }

  /** Set or replace the closed editable Autopilot spline loop waypoints (`N >= 3`). */
  setAutopilotLoop(points, { snapParam = false } = {}) {
    if (!Array.isArray(points) || points.length < 3) {
      this.autopilotLoop = [];
      this._loopInitialized = false;
      return this.autopilotLoop;
    }
    this.autopilotLoop = points.map((pt, i) => ({
      name: pt.name || `Loop ${i + 1}`,
      x: Number(pt.x) || 0,
      y: Number.isFinite(pt.y) ? Number(pt.y) : 135,
      z: Number(pt.z) || 0,
    }));
    const n = this.autopilotLoop.length;
    this._loopU = ((this._loopU % n) + n) % n;
    if (snapParam || !this._loopInitialized) {
      this._syncNearestLoopParam(true);
      this._loopInitialized = true;
    }
    return this.autopilotLoop;
  }

  /** Evaluate closed periodic Catmull-Rom 3D point `{ x, y, z }` at loop parameter `u` in `[0, N)`. */
  evaluateAutopilotLoop(u) {
    const pts = this.autopilotLoop;
    const n = pts ? pts.length : 0;
    if (n < 3) return null;
    const uWrap = ((u % n) + n) % n;
    const i1 = Math.floor(uWrap) % n;
    const frac = uWrap - Math.floor(uWrap);
    const i0 = (i1 - 1 + n) % n;
    const i2 = (i1 + 1) % n;
    const i3 = (i1 + 2) % n;
    const p0 = pts[i0];
    const p1 = pts[i1];
    const p2 = pts[i2];
    const p3 = pts[i3];
    return {
      x: catmullRomScalar(p0.x, p1.x, p2.x, p3.x, frac),
      y: catmullRomScalar(p0.y, p1.y, p2.y, p3.y, frac),
      z: catmullRomScalar(p0.z, p1.z, p2.z, p3.z, frac),
    };
  }

  _syncNearestLoopParam(globalSearch = false) {
    const n = this.autopilotLoop.length;
    if (n < 3) return 0;
    const p = this.camera.position;
    let bestU = this._loopU;
    let bestD2 = Infinity;
    if (globalSearch) {
      const samples = n * 16;
      for (let s = 0; s < samples; s++) {
        const u = (s / samples) * n;
        const q = this.evaluateAutopilotLoop(u);
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; bestU = u; }
      }
    } else {
      // Monotonic forward-only local window (`s = 0..22`) so `_loopU` never steps backward or oscillates on curves!
      for (let s = 0; s <= 22; s++) {
        const u = (((this._loopU + s * 0.035) % n) + n) % n;
        const q = this.evaluateAutopilotLoop(u);
        const dx = q.x - p.x;
        const dz = q.z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; bestU = u; }
      }
    }
    this._loopU = bestU;
    return bestU;
  }

  _advanceAutopilotLoopCarrot(dt, effSpeed) {
    const n = this.autopilotLoop.length;
    if (n < 3) return null;
    if (!this._loopInitialized) {
      this._syncNearestLoopParam(true);
      this._loopInitialized = true;
    } else {
      this._syncNearestLoopParam(false);
    }
    // Estimate local spline tangent length (meters per 1.0 parameter unit)
    const q0 = this.evaluateAutopilotLoop(this._loopU);
    const q1 = this.evaluateAutopilotLoop(this._loopU + 0.05);
    const dPerUnit = Math.max(40, Math.hypot(q1.x - q0.x, q1.z - q0.z) / 0.05);
    // Advance parameter gently with speed + project a long, steady pursuit carrot 300m..520m ahead!
    this._loopU = (this._loopU + (Math.max(effSpeed, 4) * dt) / dPerUnit) % n;
    const carrotDist = Math.max(300, Math.min(520, 275 + effSpeed * 1.65));
    const uCarrot = (this._loopU + Math.min(0.95, carrotDist / dPerUnit)) % n;
    const goal = this.evaluateAutopilotLoop(uCarrot);
    if (goal && this.collider) {
      // Ensure loop altitude gently clears underlying terrain while allowing canyon threading!
      const terr = this.collider.groundHeightAt ? this.collider.groundHeightAt(goal.x, goal.z) : 0;
      goal.y = Math.max(terr + 22, goal.y);
    }
    return goal;
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
    this._fluidYawTarget = this.yaw;
    this._fluidPitchTarget = this.pitch;
    this.moveYaw = this.yaw;
    this.movePitch = this.pitch;
    this._targetMoveYaw = this.yaw;
    this._targetMovePitch = this.pitch;
    this._yawVel = 0;
    this._pitchVel = 0;
    this._yawAccel = 0;
    this._pitchAccel = 0;
    this._moveYawVel = 0;
    this._movePitchVel = 0;
    this._smoothCourseRate = 0;
    this._freeYawOff = 0;
    this._freePitchOff = 0;
    this.roll = 0;
    this._vel.set(0, 0, 0);
    this._avoidSide = 0;
    this._avoidActive = 0;
    this._avoidYawRate = 0;
    this._avoidYawTarget = 0;
    this._avoidPitchRate = 0;
    this._avoidPitchTarget = 0;
    this._avoidLiftVel = 0;
    this._outEuler.set(this.pitch, this.yaw, this.cameraRoll || 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._outEuler);
  }

  setGlide(on) {
    this.glide = !!on;
    if (!this.glide) {
      this.roll = 0;
      this._vel.set(0, 0, 0);
      this._avoidSide = 0;
      this._avoidActive = 0;
      this._avoidYawRate = 0;
      this._avoidYawTarget = 0;
      this._avoidPitchRate = 0;
      this._avoidPitchTarget = 0;
      this._avoidLiftVel = 0;
      this._manualCourseSteered = false;
    } else {
      this._idle = 2.5;
      if (this.autopilotLoop.length >= 3) this._syncNearestLoopParam(true);
      if (!this.freelook) {
        this.moveYaw = this.yaw;
        this.movePitch = this.pitch;
        this._targetMoveYaw = this.yaw;
        this._targetMovePitch = this.pitch;
      }
      const curMul = Math.max(0, Math.min(5.0, this.speedMul ?? 1.0));
      this._liveSpeedMul = curMul;
      this._lastSyncedSpeedMul = curMul;
      this._vel.copy(this._travelForward()).multiplyScalar(this.glideSpeed * curMul);
    }
  }

  /** Re-seed yaw/pitch from wherever the camera currently points (after a fly-to or path step). */
  syncFromCamera(preserveFreelookOffset = false) {
    const e = this._outEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this._targetYaw = this.yaw;
    this._targetPitch = this.pitch;
    this._fluidYawTarget = this.yaw;
    this._fluidPitchTarget = this.pitch;
    this._yawVel = 0;
    this._pitchVel = 0;
    this._yawAccel = 0;
    this._pitchAccel = 0;
    this._moveYawVel = 0;
    this._movePitchVel = 0;
    this._smoothCourseRate = 0;
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

  _stepDampedAngle(cur, target, velField, maxRate, accel, gain, dt, accelField = null) {
    const err = wrapAngleDelta(target - cur);
    const absErr = Math.abs(err);
    if (absErr < 1e-6 && Math.abs(this[velField]) < 1e-5) {
      this[velField] = 0;
      if (accelField) this[accelField] = 0;
      return target;
    }
    // Analytical critically-damped (zeta = 1.0) 2nd-order fluid head:
    // Implicit integration guarantees 0.000% overshoot and zero left-right ringing for any dt!
    const omega = Math.max(0.65, Math.min(gain, Math.sqrt((accel * 1.15) / Math.max(0.16, absErr))));
    const wDt = omega * dt;
    const denom = 1 + 2 * wDt + wDt * wDt;
    const prevVel = this[velField] || 0;
    let nextVel = (prevVel + omega * omega * err * dt) / denom;
    // Respect smooth angular acceleration bound on start-up without adding phase-lag poles inside the loop
    const maxDv = accel * dt;
    if (Math.abs(nextVel - prevVel) > maxDv && Math.sign(nextVel) === Math.sign(err) && Math.abs(nextVel) > Math.abs(prevVel)) {
      nextVel = prevVel + Math.sign(nextVel - prevVel) * maxDv;
    }
    nextVel = Math.max(-maxRate, Math.min(maxRate, nextVel));
    if (accelField) this[accelField] = (nextVel - prevVel) / Math.max(dt, 1e-3);
    this[velField] = nextVel;
    const step = nextVel * dt;
    if (Math.abs(step) >= absErr && Math.sign(step) === Math.sign(err)) {
      this[velField] *= 0.25;
      return target;
    }
    return cur + step;
  }

  _hasGazeSightline(p, tx, ty, tz) {
    if (!this.collider || this.worldCurve >= 0.05) return true;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dz = tz - p.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 18) return true;
    const checkLen = Math.min(dist * 0.76, 310);
    const inv = 1 / dist;
    const ux = dx * inv;
    const uy = dy * inv;
    const uz = dz * inv;
    for (let s = 1; s <= 5; s++) {
      const d = (s / 5) * checkLen;
      if (this.collider.hitsPoint(p.x + ux * d, p.y + uy * d, p.z + uz * d, 1.4, this.heightScale)) {
        return false;
      }
    }
    return true;
  }

  _pickNextAutoLookPoi(p) {
    const gMode = this.gazeMode || 1;
    this._gazeBeatCount = (this._gazeBeatCount || 0) + 1;
    this._autoLookElapsed = 0;
    this._sightlineConfidence = 1.0;

    // Mode 5: Pure silk horizon turn-lead composure (zero discrete target hunting)
    if (gMode === 5) {
      this._gazeKind = 'drift';
      this._autoLookDuration = 10.5;
      return null;
    }

    // Experienced Drone DP Rhythm:
    // In Mode 1 (Balanced Drone DP), hold serene, rock-steady forward flight composure for 2 out of every 3 beats
    // (~10.5s each) so the camera glides straight and never scans back-and-forth without reason!
    // In dedicated spotter Modes 2/3, alternate every reveal with a calm forward beat (~6.4s).
    const finalRouteStop = this.routeQueue.length > 0 ? this.routeQueue[this.routeQueue.length - 1] : null;
    const nearRouteDest = finalRouteStop && Math.hypot((finalRouteStop.lookX ?? finalRouteStop.x) - p.x, (finalRouteStop.lookZ ?? finalRouteStop.z) - p.z) < 760;
    if (!nearRouteDest && gMode !== 4 && this._gazeBeatCount > 1) {
      const restBeat = gMode === 1 ? (this._gazeBeatCount % 3 !== 1) : (this._gazeBeatCount % 2 === 0);
      if (restBeat) {
        this._gazeKind = 'forward';
        this._autoLookDuration = gMode === 1 ? 10.5 : 6.4;
        return null;
      }
    }

    const candidates = [];
    // Mode 1 uses a calm forward cone (0.72 rad = 41 deg) so balanced flight never cranks sideways;
    // dedicated Modes 2 (Sites) & 3 (Projections) keep wide forward-hemisphere entry (1.28..1.36 rad).
    const maxEntryYaw = gMode === 1 ? 0.72 : (gMode === 3 ? 1.36 : 1.28);
    const nowPhase = this._autoLookPhase || 0;

    const continuityWeight = (brg) => {
      // Anti-whiplash fluid-head continuity: strongly favor targets near current gimbal azimuth
      // or in the direction the drone is gently curving, avoiding opposite-side whip-pans!
      const panSpan = Math.abs(wrapAngleDelta(brg - this.yaw));
      const curveSign = Math.sign(this._smoothCourseRate || 0);
      const relSign = Math.sign(wrapAngleDelta(brg - this.moveYaw));
      const curveBonus = (curveSign !== 0 && curveSign === relSign) ? 1.18 : 1.0;
      return (1.0 / (1.0 + Math.pow(panSpan / 0.85, 2))) * curveBonus;
    };

    const recencyWeight = (name) => {
      if (!name || !this._gazeHistory.has(name)) return 1.0;
      const elapsedSince = Math.max(0, nowPhase - this._gazeHistory.get(name));
      return elapsedSince > 34 ? 1.0 : (0.12 + 0.88 * (elapsedSince / 34));
    };

    // 1. Active Route Destination Landmark (admire selected destination cleanly on approach!)
    if (finalRouteStop && gMode !== 4) {
      const tx = finalRouteStop.lookX ?? finalRouteStop.x;
      const ty = finalRouteStop.lookY ?? (finalRouteStop.y * 0.62);
      const tz = finalRouteStop.lookZ ?? finalRouteStop.z;
      const dist = Math.hypot(tx - p.x, tz - p.z);
      if (dist > 25 && dist < 1150) {
        const clear = this._hasGazeSightline(p, tx, ty, tz) ? 1.0 : 0.18;
        candidates.push({
          poi: { name: finalRouteStop.name, x: tx, lookY: ty, z: tz, gazeKind: 'destination' },
          score: (3.6 / (135 + dist)) * clear,
          dur: 9.2,
        });
      }
    }

    // 2. Hero Landmarks, Architecture, Bridges, Harbor & Park (`poiList`)
    if ((gMode === 1 || gMode === 2) && Array.isArray(this.poiList)) {
      const maxSiteDist = gMode === 1 ? 680 : 2400;
      for (const poi of this.poiList) {
        if (!poi || !Number.isFinite(poi.x) || !Number.isFinite(poi.z)) continue;
        if (this._autoLookPoi && poi.name === this._autoLookPoi.name && this.poiList.length > 1) continue;
        const dx = poi.x - p.x;
        const dz = poi.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 58 || dist > maxSiteDist) continue;
        const brg = Math.atan2(-dx, -dz);
        const relYaw = Math.abs(wrapAngleDelta(brg - this.moveYaw));
        if (relYaw > maxEntryYaw) continue;
        const lookY = poi.lookY ?? ((poi.y || 80) * 0.65);
        const clear = this._hasGazeSightline(p, poi.x, lookY, poi.z) ? 1.0 : 0.04;
        if (gMode === 1 && clear < 0.5) continue;
        // Gentle 16-32 deg forward-quarter aerial reveal sweet spot
        const sweetCenter = gMode === 1 ? 0.34 : 0.56;
        const sweetSpot = 0.72 + 0.68 * Math.exp(-Math.pow((relYaw - sweetCenter) / 0.40, 2));
        const score = (1.35 / (140 + dist)) * sweetSpot * (poi.priority || 1.0)
          * continuityWeight(brg) * recencyWeight(poi.name) * clear * (gMode === 2 ? 1.65 : 1.0);
        candidates.push({
          poi: { ...poi, lookY, gazeKind: 'site' },
          score,
          dur: 9.2 + (dist < 420 ? 2.2 : 1.2),
        });
      }
    }

    // 3. 3D Holograms, Live Director Projections, Hero Billboards & Searchlight Crowns
    if (gMode === 1 || gMode === 3) {
      const liveProjs = typeof this.getLiveProjections === 'function' ? (this.getLiveProjections() || []) : [];
      // In Mode 1 (Balanced), only glance at live projections or nearby hero 3D holograms (never distant random billboards!)
      const staticProjs = Array.isArray(this.projectionList)
        ? (gMode === 1 ? this.projectionList.filter((pr) => (pr.priority || 1) >= 1.75) : this.projectionList)
        : [];
      const allProjs = liveProjs.concat(staticProjs);
      for (const pr of allProjs) {
        if (!pr || !Number.isFinite(pr.x) || !Number.isFinite(pr.z)) continue;
        if (this._autoLookPoi && pr.name && pr.name === this._autoLookPoi.name && allProjs.length > 1) continue;
        const dx = pr.x - p.x;
        const dz = pr.z - p.z;
        const dist = Math.hypot(dx, dz);
        const minD = pr.live ? 8 : 38;
        const maxD = pr.live ? 680 : (gMode === 1 ? 360 : 880);
        if (dist < minD || dist > maxD) continue;
        const brg = Math.atan2(-dx, -dz);
        const relYaw = Math.abs(wrapAngleDelta(brg - this.moveYaw));
        if (relYaw > maxEntryYaw) continue;
        const lookY = pr.lookY ?? pr.y ?? 65;
        const clear = pr.live || this._hasGazeSightline(p, pr.x, lookY, pr.z) ? 1.0 : 0.04;
        if (gMode === 1 && clear < 0.5) continue;
        const liveBoost = pr.live ? 4.8 : 1.0;
        const modeBoost = gMode === 3 ? 2.5 : 0.95;
        const score = (1.55 / (95 + dist)) * (pr.priority || 1.15) * liveBoost * modeBoost
          * continuityWeight(brg) * recencyWeight(pr.name) * clear;
        candidates.push({
          poi: { name: pr.name || 'Hologram Projection', x: pr.x, lookY, z: pr.z, gazeKind: 'projection' },
          score,
          dur: pr.live ? 9.0 : 8.2,
        });
      }
    }

    // 4. Intentional Vertical Reveals: Deep Street Canyon Tilt-Down & Skyscraper Spire Tilt-Up
    // Strictly aligned along the forward flight vector (`fwdX, fwdZ`) so vertical tilts NEVER cause unmotivated lateral yaw!
    if ((gMode === 1 || gMode === 4) && this.worldCurve < 0.08) {
      const terrY = (this.collider && this.collider.groundHeightAt) ? this.collider.groundHeightAt(p.x, p.z) : 0;
      const altAGL = p.y - terrY;
      const fwdX = -Math.sin(this.moveYaw);
      const fwdZ = -Math.cos(this.moveYaw);
      const rightX = -fwdZ;
      const rightZ = fwdX;

      // 4A. Composed Canyon Reveal Below (when cruising above 45m AGL — pure pitch down ahead, zero lateral yaw!)
      if (altAGL > 45 && this._gazeKind !== 'canyon_down') {
        const lookAheadD = Math.max(75, Math.min(155, altAGL * 1.02));
        const cx = p.x + fwdX * lookAheadD;
        const cz = p.z + fwdZ * lookAheadD;
        const floorY = ((this.collider && this.collider.groundHeightAt) ? this.collider.groundHeightAt(cx, cz) : terrY) + 8;
        if (this._hasGazeSightline(p, cx, floorY + 12, cz)) {
          const vertWeight = gMode === 4 ? 0.024 : 0.0028;
          candidates.push({
            poi: { name: 'Street Canyon Vista', x: cx, lookY: floorY, z: cz, gazeKind: 'canyon_down' },
            score: vertWeight * Math.min(1.6, altAGL / 95),
            dur: 7.8,
          });
        }
      }

      // 4B. Towering Spire Crown / Volumetric Cloud Canopy Tilt-Up
      if (this._gazeKind !== 'spire_up') {
        let bestSpire = null;
        if (this.collider && altAGL < 185) {
          for (const lat of [0, -28, 28]) {
            const sx = p.x + fwdX * 115 + rightX * lat;
            const sz = p.z + fwdZ * 115 + rightZ * lat;
            const top = this.collider.maxHeightNear(sx, sz, 22) * this.heightScale;
            if (top > p.y + 42 && (!bestSpire || top > bestSpire.top)) {
              bestSpire = { x: sx, z: sz, top };
            }
          }
        }
        const skyTarget = bestSpire
          ? { name: 'Skyscraper Crown', x: bestSpire.x, lookY: bestSpire.top + 8, z: bestSpire.z, gazeKind: 'spire_up' }
          : { name: 'Cloud & Sky Canopy', x: p.x + fwdX * 220, lookY: p.y + 135, z: p.z + fwdZ * 220, gazeKind: 'spire_up' };
        const upWeight = gMode === 4 ? 0.021 : (bestSpire ? 0.0030 : 0.0014);
        candidates.push({
          poi: skyTarget,
          score: upWeight,
          dur: 8.0,
        });
      }
    }

    if (!candidates.length) {
      this._gazeKind = 'forward';
      this._autoLookDuration = 6.5;
      return null;
    }
    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates[0];
    // Quality gate in auto Drone DP mode: never pan toward weak/occluded clutter — stay composed on the flight curve!
    if (gMode === 1 && chosen.score < 0.0015) {
      this._gazeKind = 'forward';
      this._autoLookDuration = 6.2;
      return null;
    }
    if (chosen.poi && chosen.poi.name) {
      this._gazeHistory.set(chosen.poi.name, nowPhase);
      if (this._gazeHistory.size > 24) {
        const oldestKey = this._gazeHistory.keys().next().value;
        this._gazeHistory.delete(oldestKey);
      }
    }
    this._gazeKind = chosen.poi.gazeKind || 'site';
    this._autoLookDuration = chosen.dur || 8.4;
    return chosen.poi;
  }

  /**
   * Continuous high-resolution + binary-refined ray clearance fraction [0..1]
   * so obstacle distance varies smoothly with zero step quantization jumps!
   */
  _probeRayClearance(ox, oy, oz, dx, dy, dz, maxDist, pad) {
    const col = this.collider;
    if (!col) return 1.0;
    const steps = 28;
    const floorClear = Math.max(3.5, pad * 0.65);
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
        // 5-step binary refinement between clear `(s-1)/steps` and hit `s/steps`
        let lo = (s - 1) / steps;
        let hi = fHi;
        for (let b = 0; b < 5; b++) {
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
   * Long-Horizon C2-Smooth Anticipatory Avoidance & Smart Building-Crack Gap Threading:
   * - Probes 260m..760m ahead (3x farther than before) so trajectories curve smoothly
   *   long before reaching any tower, with a quintic C2 envelope & 2nd-order rate filter.
   * - Distinguishes TRUE passable clearance (`passPad = colliderRadius + 0.75m`) from
   *   outer horizon awareness (`comfortPad`), scanning 25 dense fan angles (`~3.1 deg`
   *   resolution near center) so whenever a canyon or crack between buildings is wide
   *   enough for the camera (`>= 2 * passPad`), the camera aims cleanly BETWEEN the
   *   buildings and centers itself down the slot midline instead of shying away!
   */
  _applyAnticipatoryAvoidance(moveDir, speed, dt, preset, desiredGoal = null) {
    const smoothK = Math.max(0.25, this.smoothness || 1.0);
    const turnK = Math.max(0.20, this.turnSmooth || 1.0);
    // Two-stage cascaded low-pass (2nd-order critically smooth response -> zero curvature snap!)
    const alpha1 = 1 - Math.exp(-dt * ((preset.avoidRate * 1.35) / Math.pow(smoothK, 0.72)));
    const alpha2 = 1 - Math.exp(-dt * ((preset.avoidRate * 0.85) / Math.pow(smoothK * turnK, 0.48)));

    if (!this.avoidance || !this.collision || !this.collider || this.worldCurve >= 0.05) {
      this._avoidSide *= Math.exp(-dt * 1.8);
      this._avoidActive *= Math.exp(-dt * 2.4);
      this._avoidYawTarget += (0 - this._avoidYawTarget) * alpha1;
      this._avoidYawRate += (this._avoidYawTarget - this._avoidYawRate) * alpha2;
      this._avoidPitchTarget += (0 - this._avoidPitchTarget) * alpha1;
      this._avoidPitchRate += (this._avoidPitchTarget - this._avoidPitchRate) * alpha2;
      this._avoidLiftVel += (0 - this._avoidLiftVel) * alpha2;
      return;
    }

    const p = this.camera.position;
    const rad = Math.max(0.4, this.colliderRadius || 2.2);
    // Two-tier horizon:
    //  - `steerHorizon` (225m..340m): triggers smooth course adjustment well in advance without
    //    falsely reacting to buildings half a kilometer away down a clear avenue!
    //  - `gapHorizon` (280m..540m): scores candidate cracks/avenues by deep downrange openness!
    const steerHorizon = Math.max(225, Math.min(340, 185 + speed * 1.15));
    const lookAhead = Math.max(280, Math.min(540, 240 + speed * 1.75));
    // Exact passable radius (`2.95m` -> any >=6m crack is passable!) vs outer comfort sensor
    const passPad = rad + 0.75;
    const comfortPad = Math.max(rad + 3.0, Math.min(18, rad * 3.5));

    const hLen = Math.hypot(moveDir.x, moveDir.z) || 1;
    const hx = moveDir.x / hLen;
    const hz = moveDir.z / hLen;
    // Right perpendicular vector in XZ
    const rx = -hz;
    const rz = hx;

    const fwdComfort = this._probeRayClearance(
      p.x, p.y, p.z, moveDir.x, moveDir.y, moveDir.z, steerHorizon, comfortPad
    );
    const fwdPass = fwdComfort >= 0.995
      ? 1.0
      : this._probeRayClearance(p.x, p.y, p.z, moveDir.x, moveDir.y, moveDir.z, steerHorizon, passPad);

    let wantYawRate = 0;
    let wantPitchRate = 0;
    let wantLift = 0;
    let parallelSlotOffset = 0;
    let foundParallelSlot = false;

    // Parallel Canyon-Slot Seeker: if direct ray (`fwdPass <= 0.80`) grazes one wall of a narrow
    // two-sided building crack right ahead, check parallel laterally-shifted rays (`±1.8m, ±3.6m, ±5.6m`).
    // Only triggers when BOTH left and right canyon walls flank the slot (`wallL < 0.85 && wallR < 0.85`).
    if (fwdPass <= 0.80) {
      const slotShifts = [-1.8, 1.8, -3.6, 3.6, -5.6, 5.6];
      for (let k = 0; k < slotShifts.length; k++) {
        const s = slotShifts[k];
        const sx = p.x + rx * s;
        const sz = p.z + rz * s;
        if (this.collider.hitsPoint(sx, p.y, sz, passPad, this.heightScale)) continue;
        const slotClear = this._probeRayClearance(
          sx, p.y, sz, moveDir.x, moveDir.y, moveDir.z, steerHorizon, passPad
        );
        if (slotClear > 0.88) {
          const wallR = this._probeRayClearance(
            sx + rx * 12, p.y, sz + rz * 12, moveDir.x, moveDir.y, moveDir.z, steerHorizon, passPad
          );
          const wallL = this._probeRayClearance(
            sx - rx * 12, p.y, sz - rz * 12, moveDir.x, moveDir.y, moveDir.z, steerHorizon, passPad
          );
          if (wallR < 0.85 && wallL < 0.85) {
            foundParallelSlot = true;
            parallelSlotOffset = s;
            break;
          }
        }
      }
    }

    if (fwdComfort < 0.996) {
      if (foundParallelSlot) {
        // Smoothly glide laterally onto the open canyon centerline without inducing yaw S-turns!
        const slideRate = Math.max(-12, Math.min(12, parallelSlotOffset * 1.45)) / Math.sqrt(smoothK);
        p.x += rx * slideRate * dt;
        p.z += rz * slideRate * dt;
        wantYawRate = 0;
        this._avoidActive = Math.max(this._avoidActive || 0, 0.45);
      } else if (fwdPass > 0.85) {
        // CASE A: Direct forward flight ray is CLEAR (`fwdPass > 0.85`)!
        // NEVER weave left/right for single buildings passed along an open street;
        // ONLY center gently when genuinely enclosed between BOTH left AND right close canyon walls!
        const flankOff = rad + 2.2;
        const probeD = Math.min(steerHorizon * 0.45, 110);
        const clearR = this._probeRayClearance(
          p.x + rx * flankOff, p.y, p.z + rz * flankOff,
          moveDir.x, moveDir.y * 0.5, moveDir.z, probeD, passPad
        );
        const clearL = this._probeRayClearance(
          p.x - rx * flankOff, p.y, p.z - rz * flankOff,
          moveDir.x, moveDir.y * 0.5, moveDir.z, probeD, passPad
        );
        if (clearL < 0.55 && clearR < 0.55) {
          const balance = clearL - clearR;
          wantYawRate = Math.max(-0.14, Math.min(0.14, balance * 0.22)) / Math.pow(turnK, 0.5);
          this._avoidActive += (0.28 - this._avoidActive) * Math.min(1, dt * 2.5);
        } else {
          wantYawRate = 0;
          this._avoidActive *= Math.exp(-dt * 2.2);
        }
      } else {
        // CASE B: Direct line will hit a building (`fwdPass <= 0.85`).
        // Scan all 29 high-density fan angles to find the cleanest passable crack/gap between buildings!
        const hitDist = Math.max(14, fwdPass * steerHorizon);
        const u = Math.max(0, Math.min(1, (0.85 - fwdPass) / 0.85));
        const urgency = 0.18 + 0.82 * u * (0.45 + 0.55 * u * (3 - 2 * u));
        this._avoidActive = Math.max(this._avoidActive || 0, urgency);

        let goalDeltaYaw = 0;
        const goalRef = desiredGoal || (this.glide ? this.glideTarget : null);
        if (goalRef) {
          const gx = goalRef.x - p.x;
          const gz = goalRef.z - p.z;
          if (gx * gx + gz * gz > 64) {
            const curYaw = Math.atan2(-hx, -hz);
            const gYaw = Math.atan2(-gx, -gz);
            goalDeltaYaw = wrapAngleDelta(gYaw - curYaw);
          }
        }

        let bestAng = 0;
        let bestScore = -1;
        let maxPassFree = fwdPass;
        const rayWeights = this._fanWeights;
        rayWeights.fill(0);

        for (let i = 0; i < FAN_ANGLES.length; i++) {
          const ang = FAN_ANGLES[i];
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          const wx = hx * ca + hz * sa;
          const wz = -hx * sa + hz * ca;
          const free = i === 0
            ? fwdPass
            : this._probeRayClearance(p.x, p.y, p.z, wx, moveDir.y * 0.4, wz, lookAhead, passPad);
          if (free > maxPassFree) maxPassFree = free;
          if (free <= 0.14) continue;

          const openScore = Math.pow(free, 2.8);
          const fwdAlign = 1.0 / (0.32 + Math.abs(ang) * 0.85);
          const goalAlign = 1.0 + 0.30 * Math.cos(wrapAngleDelta(ang - goalDeltaYaw));
          const side = Math.sign(ang);
          // Strong commitment hysteresis (`1.42x`) prevents left-right side-flipping mid-turn!
          const commitBias = (this._avoidSide !== 0 && side === Math.sign(this._avoidSide)) ? 1.42 : 1.0;
          const gapBonus = (free > 0.82 && Math.abs(ang) < 0.72) ? 1.28 : 1.0;

          const w = openScore * fwdAlign * goalAlign * commitBias * gapBonus;
          rayWeights[i] = w;
          if (w > bestScore) {
            bestScore = w;
            bestAng = ang;
          }
        }

        let lobeWeighted = 0;
        let lobeSum = 0;
        for (let i = 0; i < FAN_ANGLES.length; i++) {
          const w = rayWeights[i];
          if (w > 0 && Math.abs(FAN_ANGLES[i] - bestAng) <= 0.38) {
            lobeWeighted += FAN_ANGLES[i] * w;
            lobeSum += w;
          }
        }
        const chosenAng = lobeSum > 1e-5
          ? (bestAng * 0.45 + (lobeWeighted / lobeSum) * 0.55)
          : (this._avoidSide >= 0 ? 0.36 : -0.36);

        const sampleD = Math.min(lookAhead, hitDist + 22);
        const hitX = p.x + moveDir.x * sampleD;
        const hitZ = p.z + moveDir.z * sampleD;
        const terrY = this.collider.groundHeightAt ? this.collider.groundHeightAt(hitX, hitZ) : 0;
        const rawTop = this.collider.maxHeightNear(hitX, hitZ, passPad + 5);
        const obsTop = rawTop > terrY + 0.5 ? rawTop * this.heightScale : terrY;
        const overDelta = obsTop - p.y;

        const noHorizGap = Math.max(0, Math.min(1, (0.58 - maxPassFree) / 0.35));
        const lowRoofBlend = obsTop <= terrY + 12 ? 1.0 : Math.max(0, Math.min(1, 1 - (overDelta - 14) / 30));
        const climbBlend = Math.max(lowRoofBlend * (maxPassFree > 0.82 ? 0.25 : 1.0), noHorizGap);

        if (climbBlend > 0.02) {
          const clearY = obsTop + Math.max(10, rad * 3.2);
          const climbNeed = Math.max(0, clearY - p.y);
          const curTravelPitch = this.freelook ? this.movePitch : this._targetPitch;
          const shallowPitch = Math.min(0.36, Math.atan2(climbNeed, Math.max(95, hitDist * 1.15)));
          if (curTravelPitch < shallowPitch) {
            wantPitchRate += (shallowPitch - curTravelPitch) * 1.15 * urgency * climbBlend;
          }
          wantLift += climbNeed * 0.45 * urgency * climbBlend;
        }

        const latBlend = 1.0 - lowRoofBlend * (maxPassFree > 0.82 ? 0.15 : 0.78);
        if (latBlend > 0.04) {
          if (Math.abs(chosenAng) > 0.05) {
            this._avoidSide = Math.sign(chosenAng);
          } else if (this._avoidSide === 0) {
            this._avoidSide = 1;
          }
          // Smooth proportional steering with zero step-jump discontinuity near chosenAng == 0!
          const minNudge = fwdPass < 0.52 ? (this._avoidSide * 0.12 * (0.52 - fwdPass)) : 0;
          const desiredRate = (chosenAng * 1.12 + minNudge) / Math.pow(turnK, 0.58);
          const maxAvoidTurn = 0.44 / Math.pow(turnK, 0.52);
          wantYawRate = Math.max(-maxAvoidTurn, Math.min(maxAvoidTurn, desiredRate)) * urgency * latBlend;
        }
      }
    } else {
      // Slow decay on `_avoidActive` (~0.9s tail) prevents instant goal snap-back oscillation at tower corners!
      this._avoidSide *= Math.exp(-dt * 1.1);
      this._avoidActive *= Math.exp(-dt * 1.15);
    }

    // 2nd-order cascaded low-pass filter on angular & vertical avoidance rates (ultra-cinematic C2 arc!)
    this._avoidYawTarget += (wantYawRate - this._avoidYawTarget) * alpha1;
    this._avoidYawRate += (this._avoidYawTarget - this._avoidYawRate) * alpha2;
    this._avoidPitchTarget += (wantPitchRate - this._avoidPitchTarget) * alpha1;
    this._avoidPitchRate += (this._avoidPitchTarget - this._avoidPitchRate) * alpha2;
    this._avoidLiftVel += (wantLift - this._avoidLiftVel) * alpha2;

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
    const smoothK = Math.max(0.15, Math.min(6.0, this.smoothness || 1.0));
    const turnK = Math.max(0.20, Math.min(6.0, this.turnSmooth || 1.0));
    // Support speed down to 0.00x (including 0.01x steps in 0..0.1) with smooth exponential ramping!
    const targetSpdMul = Math.max(0, Math.min(5.0, this.speedMul ?? 1.0));
    if (this._liveSpeedMul === null || Math.abs(targetSpdMul - this._lastSyncedSpeedMul) > 1e-6) {
      this._liveSpeedMul = targetSpdMul;
      this._lastSyncedSpeedMul = targetSpdMul;
    } else if (Math.abs(targetSpdMul - this._liveSpeedMul) > 1e-4) {
      this._liveSpeedMul += (targetSpdMul - this._liveSpeedMul) * (1 - Math.exp(-clampedDt * 8.5));
      if (Math.abs(targetSpdMul - this._liveSpeedMul) <= 1e-4) this._liveSpeedMul = targetSpdMul;
    } else {
      this._liveSpeedMul = targetSpdMul;
    }
    const spdMul = this._liveSpeedMul;
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

    const desiredVel = this._desiredVel.set(0, 0, 0);
    let routeArrivalSlowdown = 1.0;
    let activeAutopilotGoal = null;

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

      if (this._manualCourseSteered && this._idle > 1.2 && this.routeQueue.length === 0) {
        this._manualCourseSteered = false;
        if (this.autopilotLoop.length >= 3) {
          this._syncNearestLoopParam(true);
        } else if (typeof this.onCourseReorient === 'function') {
          const nextNode = this.onCourseReorient(p, this.moveYaw);
          if (nextNode) this.glideTarget = nextNode;
        }
      }

      // Priority: 1) one-shot routeQueue -> 2) closed editable `autopilotLoop` -> 3) fallback `glideTarget`
      let activeGoal = null;
      if (this.routeQueue.length > 0) {
        activeGoal = this.routeQueue[0];
        const wp = this.routeQueue[0];
        const distWp = Math.hypot(wp.x - p.x, (wp.y - p.y) * 0.6, wp.z - p.z);
        const acceptR = wp.via ? 155 : 92;
        if (distWp < acceptR) {
          const arrived = this.routeQueue.shift();
          if (this.routeQueue.length === 0) {
            if (this.autopilotLoop.length >= 3) this._syncNearestLoopParam(true);
            if (typeof this.onRouteArrive === 'function') this.onRouteArrive(arrived);
            if (this._routeStopOnArrive) {
              this.glideSpeed = this.autoLook ? 18 : 0;
              this._routeStopOnArrive = false;
            }
          }
          activeGoal = this.routeQueue.length > 0 ? this.routeQueue[0] : null;
        } else if (!wp.via && this.routeQueue.length === 1 && this._routeStopOnArrive && distWp < 320) {
          routeArrivalSlowdown = Math.max(0.18, distWp / 320);
        }
      } else if (this._idle > 1.4) {
        if (this.autopilotLoop.length >= 3) {
          activeGoal = this._advanceAutopilotLoopCarrot(clampedDt, this.glideSpeed * spdMul);
        } else {
          activeGoal = this.glideTarget;
        }
      }
      activeAutopilotGoal = activeGoal;

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

      // Experienced Drone Cinematographer Fluid-Head Gimbal:
      // Gyro-stabilized horizon + curve-anticipation turn lead + C2 quintic minimum-jerk reveals
      // with rule-of-thirds lead framing and graceful abeam/sightline release (ZERO random wobble!)
      if (this.autoLook && !this.freelook) {
        this._autoLookPhase += clampedDt;
        this._autoLookElapsed = (this._autoLookElapsed || 0) + clampedDt;
        this._autoLookTimer -= clampedDt;
        if (!this._drag) {
          this._freeYawOff *= Math.exp(-clampedDt * 0.45);
          this._freePitchOff *= Math.exp(-clampedDt * 0.45);
        }
        if (this._autoLookTimer <= 0) {
          this._autoLookPoi = this._pickNextAutoLookPoi(p);
          this._autoLookTimer = Math.max(3.2, this._autoLookDuration || 8.0);
        }

        // Narrow gimbal off-axis excursion smoothly when threading a tight canyon gap (`_avoidActive`)
        const safetyFocus = Math.max(0.24, 1.0 - 0.68 * (this._avoidActive || 0));

        // Subtle deadzone-gated curve-anticipation turn lead (zero nose wag on micro-corrections!)
        const rawRate = this._smoothCourseRate || 0;
        const deadRate = Math.sign(rawRate) * Math.max(0, Math.abs(rawRate) - 0.032);
        const turnLeadYaw = Math.max(-0.11, Math.min(0.11, deadRate * 0.35));
        const horizonPitch = Math.max(-0.14, Math.min(0.12, this.movePitch * 0.55 - 0.038));

        if (this._gazeKind === 'forward' || (this.gazeMode === 5 && !this._autoLookPoi)) {
          const silkSweep = this.gazeMode === 5 ? Math.sin(this._autoLookPhase * 0.08) * 0.09 : 0;
          this._targetYaw = this.moveYaw + (turnLeadYaw + silkSweep) * safetyFocus + this._freeYawOff;
          this._targetPitch = horizonPitch + this._freePitchOff;
        } else if (this._autoLookPoi && this.gazeMode !== 5) {
          const tx = this._autoLookPoi.x;
          const ty = this._autoLookPoi.lookY ?? ((this._autoLookPoi.y || 80) * 0.68);
          const tz = this._autoLookPoi.z;
          const lx = tx - p.x;
          const ly = ty - p.y;
          const lz = tz - p.z;
          const lh = Math.hypot(lx, lz) || 1;
          const rawYaw = Math.atan2(-lx, -lz);
          const rawPitch = Math.atan2(ly, lh);
          const relYaw = wrapAngleDelta(rawYaw - this.moveYaw);
          const absRelYaw = Math.abs(relYaw);

          // Continuous sightline confidence: smoothly fades out if a tower slips between camera & subject
          const clearNow = this._gazeKind === 'projection' || this._hasGazeSightline(p, tx, ty, tz);
          const sightTarget = clearNow ? 1.0 : 0.0;
          this._sightlineConfidence += (sightTarget - this._sightlineConfidence) * (1 - Math.exp(-clampedDt * (clearNow ? 3.2 : 1.15)));
          if (this._sightlineConfidence < 0.18 && this._autoLookTimer > 1.8) {
            this._autoLookTimer = 1.8; // trigger graceful early C2 release
          }

          // Quintic C2 minimum-jerk envelope (zero d/dt and zero d^2/dt^2 at both start and end!)
          const dur = Math.max(3.2, this._autoLookDuration || 8.0);
          const easeIn = quintic01(Math.min(1, this._autoLookElapsed / Math.min(1.6, dur * 0.24)));
          const easeOut = quintic01(Math.min(1, this._autoLookTimer / Math.min(2.4, dur * 0.30)));
          const abeamLimit = this.gazeMode === 1 ? 1.05 : 1.62;
          const abeamFade = quintic01(1.0 - Math.max(0, Math.min(1, (absRelYaw - abeamLimit) / 0.56)));
          const weight = easeIn * easeOut * abeamFade * this._sightlineConfidence * safetyFocus;

          // Subtle rule-of-thirds lead framing: in Mode 1 (Balanced), keep lateral pan gentle (<= 24 deg)
          // so the forward flight path always stays anchored in frame; dedicated Modes 2/3 allow fuller framing!
          const leadK = Math.max(0.35, Math.min(1.0, this.leadFraming ?? 0.82));
          const isVerticalShot = this._gazeKind === 'canyon_down' || this._gazeKind === 'spire_up';
          const modeYawCap = this.gazeMode === 1 ? 0.42 : 1.22;
          const modeLeadMul = this.gazeMode === 1 ? (isVerticalShot ? 0.25 : 0.62) : (isVerticalShot ? 0.65 : 1.0);
          const framedRelYaw = Math.max(-modeYawCap, Math.min(modeYawCap, relYaw * leadK * modeLeadMul));
          const clampedPitch = Math.max(-1.05, Math.min(0.86, rawPitch * (isVerticalShot ? 0.96 : 0.88)));

          const baseYaw = this.moveYaw + turnLeadYaw * (1 - weight) * safetyFocus;
          this._targetYaw = baseYaw + framedRelYaw * weight + this._freeYawOff;
          this._targetPitch = horizonPitch * (1 - weight) + clampedPitch * weight + this._freePitchOff;
        } else {
          this._targetYaw = this.moveYaw + turnLeadYaw * safetyFocus + this._freeYawOff;
          this._targetPitch = horizonPitch + this._freePitchOff;
        }
      }
    }

    // 3rd-Order Fluid-Head Cinema Gimbal Damping (pre-filtered + jerk/accel/rate bounded -> zero whip-pans!)
    const gimbalK = Math.max(0.25, Math.min(4.0, this.gimbalSmooth || 1.0));
    const droneDpActive = this.glide && this.autoLook && !this.freelook;
    const maxLookRate = (droneDpActive ? Math.min(0.42, preset.glideTurnRate * 1.15) : preset.maxTurnRate) / Math.pow(turnK * (droneDpActive ? gimbalK : 1.0), 0.78);
    const maxMoveRate = (this.glide ? preset.glideTurnRate * 1.15 : preset.maxTurnRate) / Math.pow(turnK, 0.82);
    const angAccel = (droneDpActive ? preset.turnAccel * 0.82 : preset.turnAccel) / Math.pow(turnK * (droneDpActive ? gimbalK : 1.0), 0.72);
    const lookGain = (droneDpActive ? Math.min(4.2, preset.lookRate * 0.52) : preset.lookRate) / Math.pow(smoothK * turnK * (droneDpActive ? gimbalK : 1.0), 0.42);

    if (droneDpActive) {
      const preAlpha = 1 - Math.exp(-clampedDt * (5.2 / Math.sqrt(gimbalK)));
      this._fluidYawTarget += wrapAngleDelta(this._targetYaw - this._fluidYawTarget) * preAlpha;
      this._fluidPitchTarget += (this._targetPitch - this._fluidPitchTarget) * preAlpha;
    } else {
      this._fluidYawTarget = this._targetYaw;
      this._fluidPitchTarget = this._targetPitch;
    }

    this.yaw = this._stepDampedAngle(
      this.yaw, this._fluidYawTarget, '_yawVel', maxLookRate, angAccel, lookGain, clampedDt,
      droneDpActive ? '_yawAccel' : null
    );
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT,
      this._stepDampedAngle(
        this.pitch, this._fluidPitchTarget, '_pitchVel', maxLookRate * 0.85, angAccel, lookGain, clampedDt,
        droneDpActive ? '_pitchAccel' : null
      )
    ));

    if (decoupled) {
      this.moveYaw = this._stepDampedAngle(this.moveYaw, this._targetMoveYaw, '_moveYawVel', maxMoveRate, angAccel * 1.25, lookGain * 0.85, clampedDt);
      this.movePitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT,
        this._stepDampedAngle(this.movePitch, this._targetMovePitch, '_movePitchVel', maxMoveRate * 0.8, angAccel * 1.25, lookGain * 0.85, clampedDt)
      ));
    } else {
      this.moveYaw = this.yaw;
      this.movePitch = this.pitch;
      this._targetMoveYaw = this._targetYaw;
      this._targetMovePitch = this._targetPitch;
    }

    if (this.glide) {
      const manualMoveHeld = wDown || sDown || aDown || dDown || upDown || dnDown;
      const boost = (shiftDown && manualMoveHeld && !this._shiftChordUsed) ? 2.4 : 1;
      desiredVel.copy(this._travelForward()).multiplyScalar(this.glideSpeed * spdMul * boost * routeArrivalSlowdown);
    } else {
      const boost = (shiftDown && !this._shiftChordUsed) ? 3.6 : 1;
      const maxSpd = this.speed * spdMul * boost;
      const fwd = this._travelForward();
      const right = this._rightTmp.set(-fwd.z, 0, fwd.x);
      if (right.lengthSq() > 1e-8) right.normalize();
      const move = this._moveTmp.set(0, 0, 0);
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
    const effVelRate = (preset.velRate * (this.damping / 7.5)) / Math.pow(smoothK, 1.15);
    const velAlpha = 1 - Math.exp(-clampedDt * Math.max(0.28, effVelRate));
    this._vel.lerp(desiredVel, velAlpha);

    // Long-range C2-smooth anticipatory obstacle avoidance & smart building-crack gap threading
    const spd = this._vel.length();
    if (spd > 0.25) {
      const moveDir = this._moveDirTmp.copy(this._vel).divideScalar(spd);
      this._applyAnticipatoryAvoidance(moveDir, spd, clampedDt, preset, activeAutopilotGoal);
    } else {
      this._applyAnticipatoryAvoidance(this._travelForward(), 0, clampedDt, preset, activeAutopilotGoal);
    }

    // Soft wall cushion + multi-substep swept sphere resolution (prevents tunneling even at 0.5m radius!)
    const stepVec = this._stepVecTmp.copy(this._vel).multiplyScalar(clampedDt);
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
        const before = this._beforePosTmp.copy(p);
        const hit = this._resolveAt(p);
        if (hit) {
          const push = this._pushVecTmp.copy(p).sub(before);
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

    // Smooth aerodynamic banking into travel turns (+ filtered course rate for Drone DP turn-lead)
    const curMoveYaw = decoupled ? this.moveYaw : this.yaw;
    const yawRate = wrapAngleDelta(curMoveYaw - prevMoveYaw) / Math.max(clampedDt, 1e-3);
    this._smoothCourseRate += (yawRate - this._smoothCourseRate) * (1 - Math.exp(-clampedDt * 2.2));
    const maxBank = this.glide ? preset.glideBank : preset.maxBank;
    const bankGain = this.glide ? preset.glideBankGain : preset.bankGain;
    const targetRoll = this.freelook
      ? 0
      : (decoupled
        ? Math.max(-maxBank * 0.62, Math.min(maxBank * 0.62, this._smoothCourseRate * bankGain * 0.65))
        : Math.max(-maxBank, Math.min(maxBank, yawRate * bankGain)));
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-clampedDt * (6.5 / Math.sqrt(smoothK * turnK))));

    this._outEuler.set(this.pitch, this.yaw, this.roll + (this.cameraRoll || 0), 'YXZ');
    this.camera.quaternion.setFromEuler(this._outEuler);
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
