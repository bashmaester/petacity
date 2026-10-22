// Fly & Glide camera: drag to look, WASD to move, Q/E down/up, Shift boost,
// G for continuous Glide mode (with turn banking + scenic autopilot when idle),
// and optional spatial-hash building collision.
import * as THREE from '../vendor/three.module.js';

export class FlyControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.speed = 260;
    this.glide = false;
    this.glideSpeed = 155;
    this.glideTarget = null;
    this.collision = true;
    this.collider = null;
    this.heightScale = 1;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this._drag = null;
    this._idle = 3;

    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;

    dom.addEventListener('pointerdown', (ev) => {
      dom.setPointerCapture(ev.pointerId);
      this._drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, touch: ev.pointerType === 'touch' };
      this._idle = 0;
    });
    dom.addEventListener('pointermove', (ev) => {
      const d = this._drag;
      if (!d || d.id !== ev.pointerId) return;
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;
      d.x = ev.clientX;
      d.y = ev.clientY;
      this.yaw -= dx * 0.0032;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0032));
      this._idle = 0;
    });
    const end = (ev) => {
      if (this._drag && this._drag.id === ev.pointerId) this._drag = null;
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      if (this.glide) {
        this.glideSpeed = Math.max(45, Math.min(540, this.glideSpeed - Math.sign(ev.deltaY) * 22));
      } else {
        const fwd = this._forward();
        this.camera.position.addScaledVector(fwd, -Math.sign(ev.deltaY) * 90);
        this._resolve();
      }
    }, { passive: false });
    dom.addEventListener('contextmenu', (ev) => ev.preventDefault());

    window.addEventListener('keydown', (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.isContentEditable)) return;
      const key = ev.key.toLowerCase();
      this.keys.add(key);
      if ([' ', 'w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        this._idle = 0;
      }
      if ([' ', 'w', 'a', 's', 'd', 'q', 'e'].includes(key)) ev.preventDefault();
    });
    window.addEventListener('keyup', (ev) => this.keys.delete(ev.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
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
    if (this.collision && this.collider) {
      return this.collider.resolveSphere(p, 9, this.heightScale);
    }
    p.y = Math.max(2, p.y);
    return false;
  }

  setGlide(on) {
    this.glide = !!on;
    if (!this.glide) this.roll = 0;
    else this._idle = 2.5; // begin smoothly curving toward first scenic node unless steered
  }

  /** Re-seed yaw/pitch from wherever the camera currently points (after a fly-to). */
  syncFromCamera() {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this.roll = 0;
    this.keys.clear();
    this._drag = null;
  }

  update(dt) {
    const k = this.keys;
    const prevYaw = this.yaw;
    const p = this.camera.position;

    if (this.glide) {
      if (!this._drag && k.size === 0) this._idle += dt;
      else this._idle = 0;

      // Throttle & manual bank/pitch trim while gliding
      if (k.has('w') || k.has('arrowup')) this.glideSpeed = Math.min(540, this.glideSpeed + 140 * dt);
      if (k.has('s') || k.has('arrowdown')) this.glideSpeed = Math.max(40, this.glideSpeed - 140 * dt);
      if (k.has('a') || k.has('arrowleft')) this.yaw += 0.95 * dt;
      if (k.has('d') || k.has('arrowright')) this.yaw -= 0.95 * dt;
      if (k.has('e') || k.has(' ')) this.pitch = Math.min(1.1, this.pitch + 0.7 * dt);
      if (k.has('q')) this.pitch = Math.max(-1.1, this.pitch - 0.7 * dt);

      // Hands-free scenic cruise gently steers toward the next glide node
      if (this._idle > 1.6 && this.glideTarget) {
        const dx = this.glideTarget.x - p.x;
        const dy = this.glideTarget.y - p.y;
        const dz = this.glideTarget.z - p.z;
        const horiz = Math.hypot(dx, dz) || 1;
        const wantYaw = Math.atan2(-dx, -dz);
        let dYaw = ((wantYaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        if (dYaw < -Math.PI) dYaw += Math.PI * 2;
        const maxTurn = 0.52 * dt;
        this.yaw += Math.max(-maxTurn, Math.min(maxTurn, dYaw * 0.9));
        const wantPitch = Math.max(-0.42, Math.min(0.42, Math.atan2(dy, horiz)));
        this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 1.4);
      }

      const boost = k.has('shift') ? 2.4 : 1;
      const fwd = this._forward();
      p.addScaledVector(fwd, this.glideSpeed * boost * dt);

      // Gentle rooftop cushion in autopilot so the glide skims gracefully over towers
      if (this.collision && this.collider && this._idle > 1.2) {
        const aheadRoof = this.collider.maxHeightNear(p.x + fwd.x * 55, p.z + fwd.z * 55, 22) * this.heightScale;
        if (aheadRoof > 0 && p.y < aheadRoof + 34) {
          this.pitch = Math.min(0.65, this.pitch + dt * 0.95);
          p.y += Math.min(60 * dt, (aheadRoof + 34 - p.y) * dt * 1.8);
        }
      }

      const hit = this._resolve();
      if (hit) this.pitch = Math.min(0.65, this.pitch + dt * 0.8);

      // Bank into turns for an authentic glider feel
      let yawRate = (this.yaw - prevYaw) / Math.max(dt, 1e-3);
      if (yawRate > 20) yawRate -= (Math.PI * 2) / Math.max(dt, 1e-3);
      if (yawRate < -20) yawRate += (Math.PI * 2) / Math.max(dt, 1e-3);
      const targetRoll = Math.max(-0.42, Math.min(0.42, yawRate * 0.28));
      this.roll += (targetRoll - this.roll) * Math.min(1, dt * 5.5);
    } else {
      const boost = k.has('shift') ? 4.2 : 1;
      const step = this.speed * boost * dt;
      const fwd = this._forward();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
      if (k.has('w') || k.has('arrowup')) p.addScaledVector(fwd, step);
      if (k.has('s') || k.has('arrowdown')) p.addScaledVector(fwd, -step);
      if (k.has('a') || k.has('arrowleft')) p.addScaledVector(right, -step);
      if (k.has('d') || k.has('arrowright')) p.addScaledVector(right, step);
      if (k.has('e') || k.has(' ')) p.y += step;
      if (k.has('q')) p.y -= step;
      this.roll += (0 - this.roll) * Math.min(1, dt * 8);
      this._resolve();
    }

    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, 'YXZ'));
  }
}
