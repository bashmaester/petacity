// Simple fly camera: drag to look, WASD to move, Q/E down/up, Shift boost.
import * as THREE from '../vendor/three.module.js';

export class FlyControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.speed = 260;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this._drag = null;

    // seed yaw/pitch from the camera's current orientation
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;

    dom.addEventListener('pointerdown', (ev) => {
      dom.setPointerCapture(ev.pointerId);
      this._drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, touch: ev.pointerType === 'touch' };
    });
    dom.addEventListener('pointermove', (ev) => {
      const d = this._drag;
      if (!d || d.id !== ev.pointerId) return;
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;
      d.x = ev.clientX;
      d.y = ev.clientY;
      this.yaw -= dx * 0.0032;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * 0.0032));
    });
    const end = (ev) => {
      if (this._drag && this._drag.id === ev.pointerId) this._drag = null;
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const fwd = this._forward();
      this.camera.position.addScaledVector(fwd, -Math.sign(ev.deltaY) * 90);
    }, { passive: false });
    dom.addEventListener('contextmenu', (ev) => ev.preventDefault());

    window.addEventListener('keydown', (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.isContentEditable)) return;
      this.keys.add(ev.key.toLowerCase());
      if ([' ', 'w', 'a', 's', 'd', 'q', 'e'].includes(ev.key.toLowerCase())) ev.preventDefault();
    });
    window.addEventListener('keyup', (ev) => this.keys.delete(ev.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _forward() {
    // camera looks down its local -Z; Euler YXZ (yaw, pitch)
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
  }

  /** Re-seed yaw/pitch from wherever the camera currently points (after a fly-to). */
  syncFromCamera() {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    this.keys.clear();
    this._drag = null;
  }

  update(dt) {
    const k = this.keys;
    const boost = k.has('shift') ? 4.2 : 1;
    const step = this.speed * boost * dt;
    const fwd = this._forward();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
    const p = this.camera.position;
    if (k.has('w') || k.has('arrowup')) p.addScaledVector(fwd, step);
    if (k.has('s') || k.has('arrowdown')) p.addScaledVector(fwd, -step);
    if (k.has('a') || k.has('arrowleft')) p.addScaledVector(right, -step);
    if (k.has('d') || k.has('arrowright')) p.addScaledVector(right, step);
    if (k.has('e') || k.has(' ')) p.y += step;
    if (k.has('q') || k.has('c')) p.y -= step;
    p.y = Math.max(6, p.y);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }
}
