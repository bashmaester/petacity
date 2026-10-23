// Smooth inertial Fly & Glide camera controller with long-range multi-whisker
// anticipatory obstacle & terrain avoidance:
//   - Drag to look (smooth critically-damped angular response)
//   - WASD / Arrows to fly, Q/C down, E/Space up, Shift boost, Wheel dolly/throttle
//   - G for continuous Glide mode (with turn banking + scenic autopilot when idle)
//   - Long-range (105–380m) 8-whisker course anticipation: detects towers,
//     landmarks, and rising terrain well in advance and bends course at a
//     shallow grazing angle long before approaching head-on.
import * as THREE from '../vendor/three.module.js';

const PITCH_LIMIT = 1.45;
const WHISKER_ANGLES = [-0.24, 0.24, -0.50, 0.50, -0.84, 0.84, -1.24, 1.24]; // ±14°, ±29°, ±48°, ±71°

export class FlyControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.enabled = true;

    this.speed = 260;
    this.glide = false;
    this.glideSpeed = 165;
    this.glideTarget = null;

    this.collision = true;
    this.avoidance = true;   // anticipatory shallow-angle obstacle & terrain steering
    this.damping = 7.5;      // smooth inertial velocity damping rate
    this.collider = null;
    this.heightScale = 1;
    this.worldCurve = 0;
    this.planetR = 2100;

    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this._targetYaw = 0;
    this._targetPitch = 0;

    this._drag = null;
    this._idle = 3;
    this._vel = new THREE.Vector3();
    this._avoidSide = 0;     // hysteresis memory (-1 right, +1 left) so passes never flip-flop
    this._avoidActive = 0;   // 0..1 smoothed avoidance engagement

    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this._targetYaw = this.yaw;
    this._targetPitch = this.pitch;

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
      this._targetYaw -= dx * 0.0030;
      this._targetPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this._targetPitch - dy * 0.0030));
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
        this.glideSpeed = Math.max(45, Math.min(560, this.glideSpeed - Math.sign(ev.deltaY) * 22));
      } else {
        const fwd = this._forward();
        this._vel.addScaledVector(fwd, -Math.sign(ev.deltaY) * 240);
      }
    };
    this._onContext = (ev) => ev.preventDefault();
    this._onKeyDown = (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.isContentEditable)) return;
      const key = (ev.key || '').toLowerCase();
      if (key) this.keys.add(key);
      if ([' ', 'w', 'a', 's', 'd', 'q', 'e', 'c', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        this._idle = 0;
      }
      if ([' ', 'w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
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

  _resolve() {
    const p = this.camera.position;
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
        roof = this.collider.maxHeightNear(fx, fz, 11) * this.heightScale;
      }
      const minRho = R + Math.max(7, roof + 10);
      if (rho < minRho) {
        const s = minRho / rho;
        p.set(vx * s, vy * s - R, vz * s);
        return true;
      }
      return false;
    }
    if (this.collision && this.collider) {
      return this.collider.resolveSphere(p, 9, this.heightScale);
    }
    if (!this.collision) return false;
    if (p.y < 2) {
      p.y = 2;
      return true;
    }
    return false;
  }

  getPose() {
    const p = this.camera.position;
    return {
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      z: Math.round(p.z * 100) / 100,
      yaw: Math.round(this.yaw * 10000) / 10000,
      pitch: Math.round(this.pitch * 10000) / 10000,
    };
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
    this._targetYaw = this.yaw;
    this._targetPitch = this.pitch;
    this.roll = 0;
    this._vel.set(0, 0, 0);
    this._avoidSide = 0;
    this._avoidActive = 0;
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  setGlide(on) {
    this.glide = !!on;
    if (!this.glide) {
      this.roll = 0;
      this._vel.set(0, 0, 0);
      this._avoidSide = 0;
      this._avoidActive = 0;
    } else {
      this._idle = 2.5;
      // Seed smooth cruise velocity along current forward heading immediately
      this._vel.copy(this._forward()).multiplyScalar(this.glideSpeed);
    }
  }

  /** Re-seed yaw/pitch from wherever the camera currently points (after a fly-to). */
  syncFromCamera() {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this._targetYaw = this.yaw;
    this._targetPitch = this.pitch;
    this.roll = 0;
    this._vel.set(0, 0, 0);
    this._avoidSide = 0;
    this._avoidActive = 0;
    this.keys.clear();
    this._drag = null;
  }

  /**
   * Probe free distance fraction [0..1] along ray `origin + dir * (f * maxDist)`
   * before entering a building comfort buffer (`pad`) or terrain floor.
   */
  _probeRayClearance(ox, oy, oz, dx, dy, dz, maxDist, pad) {
    const col = this.collider;
    if (!col) return 1.0;
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const dist = f * maxDist;
      const qx = ox + dx * dist;
      const qy = oy + dy * dist;
      const qz = oz + dz * dist;
      if (col.hitsPoint(qx, qy, qz, pad, this.heightScale)) {
        return (s - 1) / steps;
      }
      if (col.groundHeightAt) {
        const gY = col.groundHeightAt(qx, qz);
        if (qy < gY + Math.max(14, pad * 0.65)) {
          return (s - 1) / steps;
        }
      }
    }
    return 1.0;
  }

  /**
   * Long-range multi-whisker anticipatory course adjustment:
   * Scans 110–380m ahead along the velocity vector. When an obstacle or terrain
   * slope enters the far look-ahead cone, begins adjusting yaw/pitch smoothly at
   * a shallow angle hundreds of meters before reaching the facade.
   */
  _applyAnticipatoryAvoidance(moveDir, speed, dt) {
    if (!this.avoidance || !this.collision || !this.collider || this.worldCurve >= 0.05) {
      this._avoidSide *= Math.exp(-dt * 2.8);
      this._avoidActive *= Math.exp(-dt * 4.0);
      return;
    }

    const p = this.camera.position;
    const lookAhead = Math.max(115, Math.min(380, speed * 1.65));
    const comfortPad = 26;

    const fwdFree = this._probeRayClearance(
      p.x, p.y, p.z,
      moveDir.x, moveDir.y, moveDir.z,
      lookAhead, comfortPad
    );

    if (fwdFree >= 0.999) {
      this._avoidSide *= Math.exp(-dt * 2.4);
      this._avoidActive *= Math.exp(-dt * 3.8);
      return;
    }

    // Obstacle detected at `hitDist` ahead — engage smooth early deflection right away!
    const hitDist = Math.max(16, fwdFree * lookAhead);
    const earlyT = 1.0 - fwdFree; // >0 as soon as obstacle enters the 115–380m horizon!
    const urgency = 0.24 + 0.76 * Math.pow(earlyT, 1.10);
    this._avoidActive = Math.min(1, this._avoidActive + (urgency - this._avoidActive) * Math.min(1, dt * 6));

    const sampleD = Math.min(lookAhead, hitDist + 24);
    const hitX = p.x + moveDir.x * sampleD;
    const hitZ = p.z + moveDir.z * sampleD;
    const terrY = this.collider.groundHeightAt ? this.collider.groundHeightAt(hitX, hitZ) : 0;
    const rawTop = this.collider.maxHeightNear(hitX, hitZ, 22);
    const obsTop = rawTop > terrY + 0.5 ? rawTop * this.heightScale : terrY;

    // 1. Rising mountain slope, dune ridge, suburban roof, or tower crest -> smooth early climb arc
    if (obsTop - p.y < 42 || obsTop <= terrY + 12) {
      const clearY = obsTop + 26;
      const climbNeed = Math.max(0, clearY - p.y);
      const shallowPitch = Math.min(0.46, Math.atan2(climbNeed, Math.max(60, hitDist * 0.85)));
      if (this._targetPitch < shallowPitch) {
        const dp = (shallowPitch - this._targetPitch) * Math.min(1, dt * 2.6 * urgency);
        this._targetPitch = Math.min(PITCH_LIMIT, this._targetPitch + dp);
        this.pitch = Math.min(PITCH_LIMIT, this.pitch + dp);
      }
      this._vel.y += climbNeed * urgency * dt * 1.45;
      return;
    }

    // 2. Tall tower / landmark canyon ahead -> evaluate 8 symmetric lateral grazing whiskers
    const hLen = Math.hypot(moveDir.x, moveDir.z) || 1;
    const hx = moveDir.x / hLen;
    const hz = moveDir.z / hLen;

    let bestAng = 0;
    let bestScore = -1e9;
    let bestFree = fwdFree;

    let goalCross = 0;
    if (this.glide && this.glideTarget) {
      const gx = this.glideTarget.x - p.x;
      const gz = this.glideTarget.z - p.z;
      const gl = Math.hypot(gx, gz) || 1;
      goalCross = hx * (gz / gl) - hz * (gx / gl);
    }

    for (let i = 0; i < WHISKER_ANGLES.length; i++) {
      const ang = WHISKER_ANGLES[i]; // +ang rotates heading left (+yaw), -ang rotates right (-yaw)
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const wx = hx * ca + hz * sa;
      const wz = -hx * sa + hz * ca;
      const free = this._probeRayClearance(
        p.x, p.y, p.z,
        wx, moveDir.y * 0.45, wz,
        lookAhead, 19.5
      );
      const side = Math.sign(ang);
      // Prefer long unobstructed avenues at the shallowest deflection angle
      let score = free * 2.5 - Math.abs(ang) * 0.36;
      if (this._avoidSide !== 0 && side === Math.sign(this._avoidSide)) score += 0.26;
      if (goalCross !== 0 && side === Math.sign(-goalCross)) score += 0.12;
      if (score > bestScore) {
        bestScore = score;
        bestAng = ang;
        bestFree = free;
      }
    }

    const turnSign = bestAng !== 0 ? Math.sign(bestAng) : (this._avoidSide >= 0 ? 1 : -1);
    this._avoidSide = turnSign;

    // Shallow progressive turn rate: starts curving smoothly 200m+ out so it never dives at a steep angle
    const turnRate = turnSign * Math.min(1.65, (0.46 + Math.abs(bestAng) * 0.88) * urgency);
    const dYaw = turnRate * dt;
    this._targetYaw += dYaw;
    this.yaw += dYaw;

    // Bend horizontal velocity vector smoothly into the open corridor
    const cT = Math.cos(dYaw);
    const sT = Math.sin(dYaw);
    const vx = this._vel.x;
    const vz = this._vel.z;
    this._vel.x = vx * cT + vz * sT;
    this._vel.z = -vx * sT + vz * cT;

    // If boxed in on all horizontal whiskers, add a smooth upward escape climb
    if (bestFree < 0.42) {
      this._vel.y += speed * 0.30 * urgency * dt * 2.2;
    }
  }

  update(dt) {
    if (!this.enabled) return;
    const clampedDt = Math.min(Math.max(dt, 1e-4), 0.1);
    const prevYaw = this.yaw;
    const p = this.camera.position;

    // Smooth critically-damped pointer look interpolation
    const lookAlpha = 1 - Math.exp(-clampedDt * 18);
    this.yaw += (this._targetYaw - this.yaw) * lookAlpha;
    this.pitch += (this._targetPitch - this.pitch) * lookAlpha;

    const wDown = this._hasKey('w', 'KeyW') || this._hasKey('arrowup', 'ArrowUp');
    const sDown = this._hasKey('s', 'KeyS') || this._hasKey('arrowdown', 'ArrowDown');
    const aDown = this._hasKey('a', 'KeyA') || this._hasKey('arrowleft', 'ArrowLeft');
    const dDown = this._hasKey('d', 'KeyD') || this._hasKey('arrowright', 'ArrowRight');
    const upDown = this._hasKey('e', 'KeyE') || this._hasKey(' ', 'Space');
    const dnDown = this._hasKey('q', 'KeyQ');
    const shiftDown = this._hasKey('shift', 'ShiftLeft') || this._hasKey('shift', 'ShiftRight');

    const desiredVel = new THREE.Vector3();

    if (this.glide) {
      if (!this._drag && this.keys.size === 0) this._idle += clampedDt;
      else this._idle = 0;

      // Throttle & manual bank/pitch trim while gliding
      if (wDown) this.glideSpeed = Math.min(560, this.glideSpeed + 140 * clampedDt);
      if (sDown) this.glideSpeed = Math.max(40, this.glideSpeed - 140 * clampedDt);
      if (aDown) { this._targetYaw += 0.95 * clampedDt; this.yaw += 0.65 * clampedDt; }
      if (dDown) { this._targetYaw -= 0.95 * clampedDt; this.yaw -= 0.65 * clampedDt; }
      if (upDown) {
        this._targetPitch = Math.min(1.1, this._targetPitch + 0.7 * clampedDt);
      }
      if (dnDown) {
        this._targetPitch = Math.max(-1.1, this._targetPitch - 0.7 * clampedDt);
      }

      // Hands-free scenic cruise gently steers toward next glide node (attenuated during active obstacle pass)
      if (this._idle > 1.6 && this.glideTarget) {
        const dx = this.glideTarget.x - p.x;
        const dy = this.glideTarget.y - p.y;
        const dz = this.glideTarget.z - p.z;
        const horiz = Math.hypot(dx, dz) || 1;
        const wantYaw = Math.atan2(-dx, -dz);
        let dYaw = ((wantYaw - this._targetYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        if (dYaw < -Math.PI) dYaw += Math.PI * 2;
        const avoidAtten = 1.0 - 0.72 * this._avoidActive;
        const maxTurn = 0.52 * clampedDt * avoidAtten;
        const stepYaw = Math.max(-maxTurn, Math.min(maxTurn, dYaw * 0.9));
        this._targetYaw += stepYaw;
        this.yaw += stepYaw;
        const wantPitch = Math.max(-0.42, Math.min(0.42, Math.atan2(dy, horiz)));
        const stepPitch = (wantPitch - this._targetPitch) * Math.min(1, clampedDt * 1.4 * avoidAtten);
        this._targetPitch += stepPitch;
        this.pitch += stepPitch;
      }

      const boost = shiftDown ? 2.4 : 1;
      desiredVel.copy(this._forward()).multiplyScalar(this.glideSpeed * boost);
    } else {
      const boost = shiftDown ? 3.8 : 1;
      const maxSpd = this.speed * boost;
      const fwd = this._forward();
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

    // Smooth inertial velocity response (silky start, curve, and coast-to-stop)
    const velAlpha = 1 - Math.exp(-clampedDt * this.damping);
    this._vel.lerp(desiredVel, velAlpha);

    // Long-range shallow-angle anticipatory obstacle & terrain avoidance
    const spd = this._vel.length();
    if (spd > 2.0) {
      const moveDir = this._vel.clone().divideScalar(spd);
      this._applyAnticipatoryAvoidance(moveDir, spd, clampedDt);
    } else {
      this._avoidSide *= Math.exp(-clampedDt * 3.0);
      this._avoidActive *= Math.exp(-clampedDt * 4.0);
    }

    // Advance camera smoothly
    if (spd > 0.02) {
      p.addScaledVector(this._vel, clampedDt);
    }

    // Safety-net sphere & curved-globe surface resolution (slides velocity tangentially on contact)
    const before = p.clone();
    const hit = this._resolve();
    if (hit) {
      const push = p.clone().sub(before);
      const pushLen = push.length();
      if (pushLen > 1e-4) {
        push.divideScalar(pushLen);
        const into = this._vel.dot(push);
        if (into < 0) this._vel.addScaledVector(push, -into);
      }
      if (this.glide) {
        this._targetPitch = Math.min(0.65, this._targetPitch + clampedDt * 0.6);
      }
    }

    // Smooth aerodynamic banking into turns (stronger in Glide, subtle in manual flight)
    let yawRate = (this.yaw - prevYaw) / Math.max(clampedDt, 1e-3);
    if (yawRate > 20) yawRate -= (Math.PI * 2) / Math.max(clampedDt, 1e-3);
    if (yawRate < -20) yawRate += (Math.PI * 2) / Math.max(clampedDt, 1e-3);
    const maxBank = this.glide ? 0.38 : 0.13;
    const bankGain = this.glide ? 0.24 : 0.075;
    const targetRoll = Math.max(-maxBank, Math.min(maxBank, yawRate * bankGain));
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-clampedDt * 6.5));

    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
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
