// Camera Path Recorder (live flight capture + shot-by-shot keyframe spline)
// and Scene Render Exporter (clean HUD-free PNG up to 4K + WebM/MP4 video capture).
import * as THREE from '../vendor/three.module.js';

const roundN = (n, d = 3) => (Number.isFinite(n) ? Number(n.toFixed(d)) : 0);

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

const _tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _tmpQuat = new THREE.Quaternion();

function extractPosQuat(camOrPose) {
  if (!camOrPose) return null;
  if (camOrPose.position && camOrPose.quaternion) {
    return {
      x: camOrPose.position.x,
      y: camOrPose.position.y,
      z: camOrPose.position.z,
      qx: camOrPose.quaternion.x,
      qy: camOrPose.quaternion.y,
      qz: camOrPose.quaternion.z,
      qw: camOrPose.quaternion.w,
    };
  }
  if (Number.isFinite(camOrPose.x) && Number.isFinite(camOrPose.y) && Number.isFinite(camOrPose.z)) {
    if (Number.isFinite(camOrPose.qw)) {
      return {
        x: camOrPose.x,
        y: camOrPose.y,
        z: camOrPose.z,
        qx: camOrPose.qx || 0,
        qy: camOrPose.qy || 0,
        qz: camOrPose.qz || 0,
        qw: camOrPose.qw,
      };
    }
    _tmpEuler.set(camOrPose.pitch || 0, camOrPose.yaw || 0, 0, 'YXZ');
    _tmpQuat.setFromEuler(_tmpEuler);
    return {
      x: camOrPose.x,
      y: camOrPose.y,
      z: camOrPose.z,
      qx: _tmpQuat.x,
      qy: _tmpQuat.y,
      qz: _tmpQuat.z,
      qw: _tmpQuat.w,
    };
  }
  return null;
}

/**
 * Records either continuous free-flight/glide camera motion OR discrete shot
 * keyframes, and evaluates a C1-smooth Catmull-Rom 3D position + smoothstepped
 * quaternion slerp trajectory at any time `t` in `[0, duration]`.
 */
export class CameraPathRecorder {
  constructor() {
    this.frames = [];     // [{ t, x, y, z, qx, qy, qz, qw, manual? }]
    this._rawFrames = []; // un-smoothed backup for non-destructive cinematic smoothing
    this.smoothStrength = 0;
    this.recording = false;
    this.playing = false;
    this.loop = true;
    this.playTime = 0;
    this.speed = 1;
    this._recElapsed = 0;
    this._lastSampleT = -1;
    this._qA = new THREE.Quaternion();
    this._qB = new THREE.Quaternion();
    this._qOut = new THREE.Quaternion();
  }

  get hasPath() {
    return this.frames.length >= 2 && this.duration > 1e-4;
  }

  get duration() {
    return this.frames.length >= 2 ? this.frames[this.frames.length - 1].t : 0;
  }

  get playhead() {
    return this.playTime;
  }

  get count() {
    return this.frames.length;
  }

  clear() {
    this.frames = [];
    this._rawFrames = [];
    this.smoothStrength = 0;
    this.recording = false;
    this.playing = false;
    this.playTime = 0;
    this._recElapsed = 0;
    this._lastSampleT = -1;
  }

  startRecording(camOrPose = null) {
    this.frames = [];
    this._rawFrames = [];
    this.smoothStrength = 0;
    this.playing = false;
    this.recording = true;
    this._recElapsed = 0;
    this._lastSampleT = -1;
    if (camOrPose) this._pushPose(0, camOrPose, false);
  }

  recordSample(dt, camOrPose, sampleInterval = 0.085) {
    if (!this.recording) return false;
    this._recElapsed += Math.max(0, dt);
    if (this.frames.length === 0 || this._recElapsed - this._lastSampleT >= sampleInterval) {
      this._pushPose(this._recElapsed, camOrPose, false);
      return true;
    }
    return false;
  }

  stopRecording(camOrPose = null) {
    if (!this.recording) return this.count;
    if (camOrPose) {
      if (this.frames.length > 0 && this._recElapsed - this._lastSampleT <= 0.025) {
        this.frames.pop();
      }
      const lastT = this.frames.length > 0 ? this.frames[this.frames.length - 1].t : -0.05;
      this._pushPose(Math.max(this._recElapsed, lastT + 0.04), camOrPose, false);
    }
    this.recording = false;
    this._smoothRecordedFrames();
    this._rawFrames = this.frames.map((f) => ({ ...f }));
    if (this.smoothStrength > 0.01) {
      this.smoothPath(this.smoothStrength, { fromRaw: true });
    }
    this.playTime = 0;
    return this.count;
  }

  /** Append a manual shot keyframe spaced `stepSec` after the previous keyframe. */
  addKeyframe(camOrPose, stepSec = 2.6) {
    if (!camOrPose) return 0;
    const t = this.frames.length === 0 ? 0 : this.frames[this.frames.length - 1].t + Math.max(0.4, stepSec);
    this._pushPose(t, camOrPose, true);
    this._rawFrames = this.frames.map((f) => ({ ...f }));
    return this.frames.length;
  }

  play(restart = false) {
    if (!this.hasPath) return false;
    this.recording = false;
    if (restart || this.playTime >= this.duration - 1e-4) this.playTime = 0;
    this.playing = true;
    return true;
  }

  pause() {
    this.playing = false;
  }

  _pushPose(t, camOrPose, manual = false) {
    const pq = extractPosQuat(camOrPose);
    if (!pq) return;
    let { qx, qy, qz, qw } = pq;
    if (this.frames.length > 0) {
      const prev = this.frames[this.frames.length - 1];
      if (prev.qx * qx + prev.qy * qy + prev.qz * qz + prev.qw * qw < 0) {
        qx = -qx; qy = -qy; qz = -qz; qw = -qw;
      }
    }
    this.frames.push({
      t: roundN(t, 3),
      x: roundN(pq.x, 2),
      y: roundN(pq.y, 2),
      z: roundN(pq.z, 2),
      qx: roundN(qx, 5),
      qy: roundN(qy, 5),
      qz: roundN(qz, 5),
      qw: roundN(qw, 5),
      manual: !!manual,
    });
    this._lastSampleT = t;
  }

  /** Gentle 3-tap temporal smoothing pass on dense live-recorded hand flights. */
  _smoothRecordedFrames() {
    if (this.frames.length < 6) return;
    if (this.frames.length > 240) {
      const stride = Math.ceil(this.frames.length / 200);
      const dec = [];
      for (let i = 0; i < this.frames.length; i += stride) dec.push(this.frames[i]);
      const last = this.frames[this.frames.length - 1];
      if (dec[dec.length - 1] !== last) dec.push(last);
      this.frames = dec;
    }
    const n = this.frames.length;
    const xs = this.frames.map((f) => f.x);
    const ys = this.frames.map((f) => f.y);
    const zs = this.frames.map((f) => f.z);
    for (let i = 1; i < n - 1; i++) {
      this.frames[i].x = roundN((xs[i - 1] + xs[i] * 2 + xs[i + 1]) * 0.25, 2);
      this.frames[i].y = roundN((ys[i - 1] + ys[i] * 2 + ys[i + 1]) * 0.25, 2);
      this.frames[i].z = roundN((zs[i - 1] + zs[i] * 2 + zs[i + 1]) * 0.25, 2);
    }
  }

  /**
   * Post-recording Cinematic Path Smoothing:
   * - Upsamples sparse manual keyframes if needed, applies multi-pass Gaussian
   *   filtering to 3D positions & hemisphere-aligned quaternions, and regularizes
   *   knot timing by 3D arc-length so camera velocity & pan rate glide like a
   *   cinema crane / Steadicam rail.
   */
  smoothPath(strength = 0.65, opts = {}) {
    const s = Math.max(0, Math.min(1, Number(strength) || 0));
    this.smoothStrength = s;
    const base = (opts.fromRaw && this._rawFrames.length >= 2)
      ? this._rawFrames
      : (this._rawFrames.length >= 2 ? this._rawFrames : this.frames);
    if (base.length < 2) return this.frames.length;
    if (!this._rawFrames.length) {
      this._rawFrames = base.map((f) => ({ ...f }));
    }
    if (s <= 0.005) {
      this.frames = this._rawFrames.map((f) => ({ ...f }));
      return this.frames.length;
    }

    const pinManual = opts.pinManual !== false;
    let work = base.map((f) => ({ ...f }));
    if (work.length >= 3 && work.length < 12) {
      const saved = this.frames;
      this.frames = work;
      const dur = this.duration;
      const nSub = Math.min(64, Math.max(24, (work.length - 1) * 6));
      const manualFrames = pinManual ? work.filter((f, idx) => idx > 0 && idx < work.length - 1 && f.manual) : [];
      const resampled = [];
      for (let i = 0; i <= nSub; i++) {
        const tSample = (i / nSub) * dur;
        const ev = this.evaluate(tSample);
        resampled.push({
          t: roundN(tSample, 3),
          x: ev.x, y: ev.y, z: ev.z,
          qx: ev.qx, qy: ev.qy, qz: ev.qz, qw: ev.qw,
          manual: i === 0 || i === nSub,
        });
      }
      for (const mf of manualFrames) {
        let bestIdx = 1;
        let bestDt = Infinity;
        for (let i = 1; i < resampled.length - 1; i++) {
          const d = Math.abs(resampled[i].t - mf.t);
          if (d < bestDt) { bestDt = d; bestIdx = i; }
        }
        resampled[bestIdx] = { ...mf, manual: true };
      }
      this.frames = saved;
      work = resampled;
    }

    const n = work.length;
    const posPasses = Math.max(1, Math.round(1 + s * 14));
    const rotPasses = Math.max(1, Math.round(2 + s * 18));
    const wrapIdx = (idx) => (this.loop ? ((idx % n) + n) % n : Math.max(0, Math.min(n - 1, idx)));

    for (let pass = 0; pass < posPasses; pass++) {
      const next = work.map((f) => ({ ...f }));
      const startI = this.loop ? 0 : 1;
      const endI = this.loop ? n : n - 1;
      for (let i = startI; i < endI; i++) {
        if (pinManual && work[i].manual) continue;
        const a = work[wrapIdx(i - 2)];
        const b = work[wrapIdx(i - 1)];
        const c = work[i];
        const d = work[wrapIdx(i + 1)];
        const e = work[wrapIdx(i + 2)];
        next[i].x = (a.x + 4 * b.x + 6 * c.x + 4 * d.x + e.x) / 16;
        next[i].y = (a.y + 4 * b.y + 6 * c.y + 4 * d.y + e.y) / 16;
        next[i].z = (a.z + 4 * b.z + 6 * c.z + 4 * d.z + e.z) / 16;
      }
      work = next;
    }

    for (let pass = 0; pass < rotPasses; pass++) {
      const next = work.map((f) => ({ ...f }));
      const startI = this.loop ? 0 : 1;
      const endI = this.loop ? n : n - 1;
      for (let i = startI; i < endI; i++) {
        if (pinManual && work[i].manual) continue;
        const ref = work[i];
        let sx = 0, sy = 0, sz = 0, sw = 0;
        const taps = [[-2, 1], [-1, 4], [0, 6], [1, 4], [2, 1]];
        for (const [off, w] of taps) {
          const q = work[wrapIdx(i + off)];
          const sgn = (ref.qx * q.qx + ref.qy * q.qy + ref.qz * q.qz + ref.qw * q.qw) < 0 ? -1 : 1;
          sx += q.qx * sgn * w;
          sy += q.qy * sgn * w;
          sz += q.qz * sgn * w;
          sw += q.qw * sgn * w;
        }
        const len = Math.hypot(sx, sy, sz, sw) || 1;
        next[i].qx = sx / len;
        next[i].qy = sy / len;
        next[i].qz = sz / len;
        next[i].qw = sw / len;
      }
      for (let i = 1; i < n; i++) {
        const p = next[i - 1];
        const cur = next[i];
        if (p.qx * cur.qx + p.qy * cur.qy + p.qz * cur.qz + p.qw * cur.qw < 0) {
          cur.qx = -cur.qx; cur.qy = -cur.qy; cur.qz = -cur.qz; cur.qw = -cur.qw;
        }
      }
      work = next;
    }

    const totalDur = Math.max(0.2, work[n - 1].t - work[0].t);
    const cumArc = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      const seg = Math.hypot(
        work[i].x - work[i - 1].x,
        work[i].y - work[i - 1].y,
        work[i].z - work[i - 1].z
      );
      const qDot = Math.min(1, Math.abs(
        work[i].qx * work[i - 1].qx + work[i].qy * work[i - 1].qy +
        work[i].qz * work[i - 1].qz + work[i].qw * work[i - 1].qw
      ));
      const angWeight = Math.acos(qDot) * 28;
      cumArc[i] = cumArc[i - 1] + Math.max(0.05, seg + angWeight);
    }
    const maxArc = cumArc[n - 1] || 1;
    const arcBlend = Math.min(0.92, s * 0.88);
    for (let i = 0; i < n; i++) {
      let uArc = cumArc[i] / maxArc;
      if (!this.loop && s > 0.25) {
        const eased = uArc * uArc * (3 - 2 * uArc);
        uArc = uArc * (1 - 0.28 * s) + eased * (0.28 * s);
      }
      const tArc = totalDur * uArc;
      work[i].t = roundN(work[i].t * (1 - arcBlend) + tArc * arcBlend, 3);
      work[i].x = roundN(work[i].x, 2);
      work[i].y = roundN(work[i].y, 2);
      work[i].z = roundN(work[i].z, 2);
      work[i].qx = roundN(work[i].qx, 5);
      work[i].qy = roundN(work[i].qy, 5);
      work[i].qz = roundN(work[i].qz, 5);
      work[i].qw = roundN(work[i].qw, 5);
    }
    for (let i = 1; i < n; i++) {
      if (work[i].t <= work[i - 1].t) work[i].t = roundN(work[i - 1].t + 0.008, 3);
    }

    this.frames = work;
    return this.frames.length;
  }

  /** Evaluate C1-continuous Catmull-Rom 3D position + C1 cubic quaternion spline at `timeSec`. */
  evaluate(timeSec) {
    const n = this.frames.length;
    if (n === 0) return null;
    if (n === 1) {
      const f = this.frames[0];
      this._qOut.set(f.qx, f.qy, f.qz, f.qw).normalize();
      _tmpEuler.setFromQuaternion(this._qOut, 'YXZ');
      return { x: f.x, y: f.y, z: f.z, qx: this._qOut.x, qy: this._qOut.y, qz: this._qOut.z, qw: this._qOut.w, yaw: _tmpEuler.y, pitch: _tmpEuler.x };
    }
    const dur = this.duration;
    const tClamped = Math.max(0, Math.min(dur, timeSec));

    let lo = 0;
    let hi = n - 2;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid + 1].t < tClamped) lo = mid + 1;
      else if (this.frames[mid].t > tClamped) hi = mid - 1;
      else { lo = mid; break; }
    }
    const i1 = Math.max(0, Math.min(n - 2, lo));
    const i2 = i1 + 1;
    const i0 = this.loop ? (i1 - 1 + n) % n : Math.max(0, i1 - 1);
    const i3 = this.loop ? (i2 + 1) % n : Math.min(n - 1, i2 + 1);

    const f0 = this.frames[i0];
    const f1 = this.frames[i1];
    const f2 = this.frames[i2];
    const f3 = this.frames[i3];
    const segDt = Math.max(1e-5, f2.t - f1.t);
    const u = Math.max(0, Math.min(1, (tClamped - f1.t) / segDt));

    const x = catmullRom(f0.x, f1.x, f2.x, f3.x, u);
    const y = catmullRom(f0.y, f1.y, f2.y, f3.y, u);
    const z = catmullRom(f0.z, f1.z, f2.z, f3.z, u);

    const alignQ = (ref, q) => {
      const s = (ref.qx * q.qx + ref.qy * q.qy + ref.qz * q.qz + ref.qw * q.qw) < 0 ? -1 : 1;
      return { qx: q.qx * s, qy: q.qy * s, qz: q.qz * s, qw: q.qw * s };
    };
    const q0 = alignQ(f1, f0);
    const q1 = f1;
    const q2 = alignQ(f1, f2);
    const q3 = alignQ(q2, f3);

    const qx = catmullRom(q0.qx, q1.qx, q2.qx, q3.qx, u);
    const qy = catmullRom(q0.qy, q1.qy, q2.qy, q3.qy, u);
    const qz = catmullRom(q0.qz, q1.qz, q2.qz, q3.qz, u);
    const qw = catmullRom(q0.qw, q1.qw, q2.qw, q3.qw, u);
    this._qOut.set(qx, qy, qz, qw).normalize();
    _tmpEuler.setFromQuaternion(this._qOut, 'YXZ');
    return {
      x, y, z,
      qx: this._qOut.x, qy: this._qOut.y, qz: this._qOut.z, qw: this._qOut.w,
      yaw: _tmpEuler.y,
      pitch: _tmpEuler.x,
    };
  }

  /** Evaluate smooth spline position + orientation at `timeSec` and write to `camera`. */
  applyAt(timeSec, camera, controls = null) {
    if (!camera) return null;
    this.playTime = Math.max(0, Math.min(this.duration, timeSec));
    const ev = this.evaluate(this.playTime);
    if (!ev) return null;
    camera.position.set(ev.x, ev.y, ev.z);
    if (controls && controls.freelook) {
      const yaw = ev.yaw + (controls._freeYawOff || 0);
      const pitch = Math.max(-1.45, Math.min(1.45, ev.pitch + (controls._freePitchOff || 0)));
      controls.moveYaw = ev.yaw;
      controls.movePitch = ev.pitch;
      controls.yaw = yaw;
      controls.pitch = pitch;
      controls._targetYaw = yaw;
      controls._targetPitch = pitch;
      _tmpEuler.set(pitch, yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(_tmpEuler);
    } else {
      camera.quaternion.set(ev.qx, ev.qy, ev.qz, ev.qw);
      if (controls && typeof controls.syncFromCamera === 'function') {
        controls.syncFromCamera();
      }
    }
    return ev;
  }

  /** Advance playback by `dt` seconds; returns `true` while still playing, `false` when ended. */
  updatePlayback(dt, camera, controls = null) {
    if (!this.playing || !this.hasPath) {
      this.playing = false;
      return false;
    }
    const dur = this.duration;
    this.playTime += Math.max(0, dt) * this.speed;
    if (this.playTime >= dur) {
      if (this.loop) {
        this.playTime = this.playTime % dur;
      } else {
        this.playTime = dur;
        this.applyAt(this.playTime, camera, controls);
        this.playing = false;
        return false;
      }
    }
    this.applyAt(this.playTime, camera, controls);
    return true;
  }

  toJSON() {
    if (!this.frames.length) return null;
    return {
      v: 1,
      loop: !!this.loop,
      frames: this.frames.map((f) => [f.t, f.x, f.y, f.z, f.qx, f.qy, f.qz, f.qw]),
    };
  }

  fromJSON(input) {
    let data = input;
    if (typeof input === 'string') {
      try {
        data = JSON.parse(input);
      } catch {
        return false;
      }
    }
    const list = data && (Array.isArray(data.frames) ? data.frames : Array.isArray(data.k) ? data.k : null);
    if (!list || list.length < 2) return false;
    this.clear();
    this.loop = data.loop !== undefined ? !!data.loop : true;
    for (const row of list) {
      if (Array.isArray(row) && row.length >= 8) {
        this.frames.push({
          t: Number(row[0]) || 0,
          x: Number(row[1]) || 0,
          y: Number(row[2]) || 0,
          z: Number(row[3]) || 0,
          qx: Number(row[4]) || 0,
          qy: Number(row[5]) || 0,
          qz: Number(row[6]) || 0,
          qw: Number(row[7] ?? 1),
        });
      } else if (Array.isArray(row) && row.length >= 6) {
        this._pushPose(Number(row[0]) || 0, {
          x: Number(row[1]) || 0,
          y: Number(row[2]) || 0,
          z: Number(row[3]) || 0,
          yaw: Number(row[4]) || 0,
          pitch: Number(row[5]) || 0,
        });
      } else if (row && typeof row === 'object') {
        this._pushPose(Number(row.t) || 0, row);
      }
    }
    this.frames.sort((a, b) => a.t - b.t);
    this._rawFrames = this.frames.map((f) => ({ ...f }));
    return this.frames.length >= 2;
  }
}

export const VIDEO_QUALITY_PRESETS = {
  standard: { label: 'Standard (16 Mbps)', bps: 16_000_000 },
  high: { label: 'High HD (36 Mbps)', bps: 36_000_000 },
  ultra: { label: 'Ultra Studio (68 Mbps)', bps: 68_000_000 },
  master: { label: '4K Master (115 Mbps)', bps: 115_000_000 },
};

/**
 * Scene Render Exporter:
 *  - `captureStillPNG`: renders a clean HUD-free frame at target resolution
 *    (Viewport, 720p, 1080p, 1440p, 2x Super, or 4K 3840x2160), awaits PNG blob BEFORE
 *    restoring viewport dimensions, and triggers download.
 *  - `startVideoCapture` / `stopVideoCapture`: records high-bitrate WebGL canvas stream
 *    at configurable resolution/FPS/codec/bitrate + synchronized stereo WebAudio stream!
 */
export function makeSceneExporter({ canvas: explicitCanvas, renderer, post, scene, camera, getTime }) {
  const canvas = explicitCanvas || (renderer && renderer.domElement);
  let mediaRec = null;
  let chunks = [];
  let activeFilename = 'petacity-capture.webm';
  let activeMime = '';
  let savedViewportBeforeVid = null;
  const tmpSize = new THREE.Vector2();

  function triggerDownload(blobOrUrl, filename) {
    if (!filename || typeof document === 'undefined') return;
    const isBlob = typeof Blob !== 'undefined' && blobOrUrl instanceof Blob;
    const url = isBlob ? URL.createObjectURL(blobOrUrl) : String(blobOrUrl);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    if (isBlob) setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  function resolveResolution(mode) {
    renderer.getSize(tmpSize);
    const curW = Math.max(320, Math.round(tmpSize.x) || (canvas && canvas.clientWidth) || 1280);
    const curH = Math.max(240, Math.round(tmpSize.y) || (canvas && canvas.clientHeight) || 720);
    if (mode === '4k') return { width: 3840, height: 2160, dpr: 1 };
    if (mode === '1440p') return { width: 2560, height: 1440, dpr: 1 };
    if (mode === '2x') return { width: curW * 2, height: curH * 2, dpr: 1 };
    if (mode === '1080p') return { width: 1920, height: 1080, dpr: 1 };
    if (mode === '720p') return { width: 1280, height: 720, dpr: 1 };
    return { width: curW, height: curH, dpr: renderer.getPixelRatio() };
  }

  async function captureStillPNG(mode = '1080p', filename = 'petacity-render.png') {
    const prevDpr = renderer.getPixelRatio();
    renderer.getSize(tmpSize);
    const prevW = Math.max(1, Math.round(tmpSize.x) || (canvas && canvas.clientWidth) || 800);
    const prevH = Math.max(1, Math.round(tmpSize.y) || (canvas && canvas.clientHeight) || 600);
    const prevAspect = camera.aspect;
    const target = resolveResolution(mode);
    const tNow = typeof getTime === 'function' ? getTime() : 0;

    let blob = null;
    try {
      renderer.setPixelRatio(target.dpr);
      renderer.setSize(target.width, target.height, false);
      if (post) post.setSize(target.width, target.height, target.dpr);
      camera.aspect = target.width / target.height;
      camera.updateProjectionMatrix();
      if (post) post.render(scene, camera, tNow);
      else renderer.render(scene, camera);

      if (canvas && typeof canvas.toBlob === 'function') {
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      } else if (canvas && typeof canvas.toDataURL === 'function') {
        const dataUrl = canvas.toDataURL('image/png');
        triggerDownload(dataUrl, filename);
      }
      if (blob && filename) triggerDownload(blob, filename);
    } finally {
      renderer.setPixelRatio(prevDpr);
      renderer.setSize(prevW, prevH, false);
      if (post) post.setSize(prevW, prevH, prevDpr);
      camera.aspect = prevAspect;
      camera.updateProjectionMatrix();
    }
    return { width: target.width, height: target.height, blob };
  }

  function pickMimeType(codecPref = 'auto', hasAudio = false) {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    const vp9 = hasAudio ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9'] : ['video/webm;codecs=vp9'];
    const vp8 = hasAudio ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8'] : ['video/webm;codecs=vp8'];
    const mp4 = hasAudio
      ? ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
      : ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4'];
    let candidates;
    if (codecPref === 'mp4') candidates = [...mp4, ...vp9, ...vp8, 'video/webm'];
    else if (codecPref === 'vp8') candidates = [...vp8, ...vp9, 'video/webm', ...mp4];
    else candidates = [...vp9, ...mp4, ...vp8, 'video/webm'];
    for (const m of candidates) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  function restoreVideoViewport() {
    if (!savedViewportBeforeVid) return;
    const s = savedViewportBeforeVid;
    savedViewportBeforeVid = null;
    renderer.setPixelRatio(s.dpr);
    renderer.setSize(s.width, s.height, false);
    if (post) post.setSize(s.width, s.height, s.dpr);
    camera.aspect = s.aspect;
    camera.updateProjectionMatrix();
  }

  function startVideoCapture(optsOrName = {}) {
    if (mediaRec) return { ext: activeMime.includes('mp4') ? 'mp4' : 'webm' };
    if (!canvas || typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      throw new Error('Video capture (MediaRecorder / canvas.captureStream) is not supported in this browser');
    }
    const isObj = optsOrName && typeof optsOrName === 'object';
    const fps = isObj ? Math.max(12, Math.min(120, Number(optsOrName.fps) || 60)) : 60;
    const resMode = isObj && optsOrName.resolution ? String(optsOrName.resolution) : 'view';
    const qualKey = isObj && optsOrName.quality ? String(optsOrName.quality) : 'ultra';
    const codecPref = isObj && optsOrName.codec ? String(optsOrName.codec) : 'auto';
    const presetBps = (VIDEO_QUALITY_PRESETS[qualKey] || VIDEO_QUALITY_PRESETS.ultra).bps;
    const vBps = isObj && Number.isFinite(optsOrName.videoBitsPerSecond)
      ? Number(optsOrName.videoBitsPerSecond)
      : presetBps;
    const aBps = isObj && Number.isFinite(optsOrName.audioBitsPerSecond)
      ? Number(optsOrName.audioBitsPerSecond)
      : 192_000;
    activeFilename = isObj ? (optsOrName.filename || 'petacity-capture.webm') : String(optsOrName);

    // Lock render buffer to requested export resolution (`1080p`, `1440p`, `4k`, etc.) during video capture!
    if (resMode && resMode !== 'view') {
      renderer.getSize(tmpSize);
      savedViewportBeforeVid = {
        dpr: renderer.getPixelRatio(),
        width: Math.max(1, Math.round(tmpSize.x) || (canvas && canvas.clientWidth) || 1280),
        height: Math.max(1, Math.round(tmpSize.y) || (canvas && canvas.clientHeight) || 720),
        aspect: camera.aspect,
      };
      const target = resolveResolution(resMode);
      renderer.setPixelRatio(target.dpr);
      renderer.setSize(target.width, target.height, false);
      if (post) post.setSize(target.width, target.height, target.dpr);
      camera.aspect = target.width / target.height;
      camera.updateProjectionMatrix();
    }

    const vidStream = canvas.captureStream(fps);
    const audioStream = isObj ? optsOrName.audioStream : null;
    const audioTracks = (audioStream && typeof audioStream.getAudioTracks === 'function')
      ? audioStream.getAudioTracks()
      : [];
    let combinedStream = vidStream;
    if (audioTracks.length > 0) {
      if (typeof MediaStream !== 'undefined' && typeof vidStream.getVideoTracks === 'function') {
        combinedStream = new MediaStream([...vidStream.getVideoTracks(), ...audioTracks]);
      } else if (typeof vidStream.addTrack === 'function') {
        for (const trk of audioTracks) vidStream.addTrack(trk);
      }
    }

    const hasAudio = audioTracks.length > 0;
    activeMime = pickMimeType(codecPref, hasAudio);
    const recOpts = {
      videoBitsPerSecond: vBps,
      ...(hasAudio ? { audioBitsPerSecond: aBps } : {}),
      ...(activeMime ? { mimeType: activeMime } : {}),
    };
    chunks = [];
    try {
      mediaRec = new MediaRecorder(combinedStream, recOpts);
    } catch {
      // Fallback if browser MediaRecorder rejects combined codec/bitrate hint
      mediaRec = new MediaRecorder(combinedStream);
    }
    mediaRec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };
    mediaRec.start(200);
    return {
      mimeType: activeMime || 'video/webm',
      ext: activeMime.includes('mp4') ? 'mp4' : 'webm',
      hasAudio,
      videoBitsPerSecond: vBps,
    };
  }

  function stopVideoCapture() {
    if (!mediaRec) {
      restoreVideoViewport();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const rec = mediaRec;
      const mime = activeMime || 'video/webm';
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const finalName = activeFilename.replace(/\.(webm|mp4)$/i, '') + '.' + ext;
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mime });
        chunks = [];
        mediaRec = null;
        restoreVideoViewport();
        if (blob.size > 0) triggerDownload(blob, finalName);
        resolve({ blob, filename: finalName });
      };
      if (rec.state !== 'inactive') rec.stop();
      else rec.onstop();
    });
  }

  return {
    captureStillPNG,
    startVideoCapture,
    stopVideoCapture,
    get lockedResolution() {
      return !!savedViewportBeforeVid;
    },
    get capturingVideo() {
      return !!mediaRec && mediaRec.state === 'recording';
    },
    get isRecordingVideo() {
      return !!mediaRec && mediaRec.state === 'recording';
    },
  };
}
