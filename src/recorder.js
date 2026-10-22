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
    this.frames = []; // [{ t, x, y, z, qx, qy, qz, qw }]
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
    this.recording = false;
    this.playing = false;
    this.playTime = 0;
    this._recElapsed = 0;
    this._lastSampleT = -1;
  }

  startRecording(camOrPose = null) {
    this.frames = [];
    this.playing = false;
    this.recording = true;
    this._recElapsed = 0;
    this._lastSampleT = -1;
    if (camOrPose) this._pushPose(0, camOrPose);
  }

  recordSample(dt, camOrPose, sampleInterval = 0.085) {
    if (!this.recording) return false;
    this._recElapsed += Math.max(0, dt);
    if (this.frames.length === 0 || this._recElapsed - this._lastSampleT >= sampleInterval) {
      this._pushPose(this._recElapsed, camOrPose);
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
      this._pushPose(Math.max(this._recElapsed, lastT + 0.04), camOrPose);
    }
    this.recording = false;
    this._smoothRecordedFrames();
    this.playTime = 0;
    return this.count;
  }

  /** Append a manual shot keyframe spaced `stepSec` after the previous keyframe. */
  addKeyframe(camOrPose, stepSec = 2.6) {
    if (!camOrPose) return 0;
    const t = this.frames.length === 0 ? 0 : this.frames[this.frames.length - 1].t + Math.max(0.4, stepSec);
    this._pushPose(t, camOrPose);
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

  _pushPose(t, camOrPose) {
    const pq = extractPosQuat(camOrPose);
    if (!pq) return;
    let { qx, qy, qz, qw } = pq;
    // Keep neighbouring quaternions in the same hemisphere so slerp always takes shortest arc
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

  /** Evaluate smooth Catmull-Rom + quaternion slerp pose at `timeSec`. */
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

    this._qA.set(f1.qx, f1.qy, f1.qz, f1.qw);
    this._qB.set(f2.qx, f2.qy, f2.qz, f2.qw);
    if (this._qA.dot(this._qB) < 0) {
      this._qB.set(-f2.qx, -f2.qy, -f2.qz, -f2.qw);
    }
    const su = u * u * (3 - 2 * u);
    this._qOut.slerpQuaternions(this._qA, this._qB, su).normalize();
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
    camera.quaternion.set(ev.qx, ev.qy, ev.qz, ev.qw);
    if (controls && typeof controls.syncFromCamera === 'function') {
      controls.syncFromCamera();
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
    return this.frames.length >= 2;
  }
}

/**
 * Scene Render Exporter:
 *  - `captureStillPNG`: renders a clean HUD-free frame at target resolution
 *    (Viewport, 1080p, 2x Super, or 4K 3840x2160), awaits PNG blob BEFORE
 *    restoring viewport dimensions, and triggers download.
 *  - `startVideoCapture` / `stopVideoCapture`: records WebGL canvas stream via
 *    MediaRecorder (WebM VP9/VP8 or MP4) and downloads on stop.
 */
export function makeSceneExporter({ canvas: explicitCanvas, renderer, post, scene, camera, getTime }) {
  const canvas = explicitCanvas || (renderer && renderer.domElement);
  let mediaRec = null;
  let chunks = [];
  let activeFilename = 'petacity-capture.webm';
  let activeMime = '';
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
    if (mode === '2x') return { width: curW * 2, height: curH * 2, dpr: 1 };
    if (mode === '1080p') return { width: 1920, height: 1080, dpr: 1 };
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

  function pickMimeType() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    for (const m of [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ]) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  function startVideoCapture(optsOrName = {}) {
    if (mediaRec) return { ext: activeMime.includes('mp4') ? 'mp4' : 'webm' };
    if (!canvas || typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      throw new Error('Video capture (MediaRecorder / canvas.captureStream) is not supported in this browser');
    }
    const isObj = optsOrName && typeof optsOrName === 'object';
    const fps = isObj ? (optsOrName.fps || 60) : 60;
    activeFilename = isObj ? (optsOrName.filename || 'petacity-capture.webm') : String(optsOrName);
    const stream = canvas.captureStream(fps);
    activeMime = pickMimeType();
    const recOpts = activeMime
      ? { mimeType: activeMime, videoBitsPerSecond: 18_000_000 }
      : { videoBitsPerSecond: 18_000_000 };
    chunks = [];
    mediaRec = new MediaRecorder(stream, recOpts);
    mediaRec.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };
    mediaRec.start(200);
    return { mimeType: activeMime || 'video/webm', ext: activeMime.includes('mp4') ? 'mp4' : 'webm' };
  }

  function stopVideoCapture() {
    if (!mediaRec) return Promise.resolve(null);
    return new Promise((resolve) => {
      const rec = mediaRec;
      const mime = activeMime || 'video/webm';
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const finalName = activeFilename.replace(/\.(webm|mp4)$/i, '') + '.' + ext;
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mime });
        chunks = [];
        mediaRec = null;
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
    get capturingVideo() {
      return !!mediaRec && mediaRec.state === 'recording';
    },
    get isRecordingVideo() {
      return !!mediaRec && mediaRec.state === 'recording';
    },
  };
}
