// Interactive 2D City & Recorder Minimap:
//   - Displays coastline / water bodies / sandy shore, urban grid & avenues,
//     parks, harbor piers, bridges, orbital spaceport, cross-city transit lines,
//     and named landmarks/venues (`sites` / POIs).
//   - Displays CameraPathRecorder spline trajectory, keyframe nodes (`keys`),
//     and active playback playhead.
//   - Displays live camera position, travel heading arrow, and (when Freelook /
//     Look-Around mode is active) the independent view frustum cone.
//   - Supports zoom in/out, camera-follow vs city-overview toggle, hover label,
//     and click-to-fly to any site or map coordinate.
import { CELL, evalCoastSignedDist, evalRiverSignedDist } from './city.js';

export function makeMinimap({
  canvas,
  labelEl = null,
  onSelectSpot = null,
  onLoopEdited = null,
}) {
  let city = null;
  let look = null;
  let visible = true;
  let zoom = 1.0;        // 0.35 (regional) .. 3.5 (downtown close-up)
  let followCam = false; // false = centered on city core, true = centered on camera
  let hoveredSite = null;
  let hoveredLoopIdx = -1;
  let hoveredSeg = null; // { afterIdx, wx, wz, y }
  let dragLoopIdx = -1;
  let didDragLoop = false;
  let lastControls = null;
  let cachedBg = null;
  let cachedBgKey = '';
  let lastCx = 0;
  let lastCz = 0;

  const getCtx = () => {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    try {
      return canvas.getContext('2d');
    } catch {
      return null;
    }
  };

  function worldSpan() {
    const core = city ? city.radius * CELL : 900;
    return Math.max(520, (core * 2.15) / Math.max(0.25, zoom));
  }

  function worldToMap(wx, wz, cx, cz, w, h, span) {
    const scale = (Math.min(w, h) * 0.46) / span;
    return {
      px: w * 0.5 + (wx - cx) * scale,
      py: h * 0.5 + (wz - cz) * scale,
      scale,
    };
  }

  function mapToWorld(px, py, cx, cz, w, h, span) {
    const scale = (Math.min(w, h) * 0.46) / span;
    return {
      wx: cx + (px - w * 0.5) / Math.max(1e-5, scale),
      wz: cz + (py - h * 0.5) / Math.max(1e-5, scale),
    };
  }

  function collectSites() {
    if (!city) return [];
    const list = [];
    for (const lm of (city.landmarks || [])) {
      list.push({ name: lm.name, x: lm.x, y: lm.h * 0.65 + 40, z: lm.z, kind: 'landmark' });
    }
    for (const pl of (city.places || [])) {
      list.push({
        name: pl.name,
        x: pl.x,
        y: pl.showcase ? 75 : 55,
        z: pl.z,
        kind: pl.kind === 'park' ? 'park' : 'place',
      });
    }
    if (city.harbor && city.harbor.active) {
      list.push({ name: city.harbor.name || 'Deep-Water Harbor', x: city.harbor.x, y: 85, z: city.harbor.z, kind: 'harbor' });
    }
    if (city.spaceport && city.spaceport.active) {
      list.push({ name: city.spaceport.name || 'Orbital Spaceport', x: city.spaceport.x, y: 120, z: city.spaceport.z, kind: 'spaceport' });
    }
    for (const br of (city.bridges || [])) {
      list.push({ name: br.name, x: br.x, y: br.deckY + 45, z: br.z, kind: 'bridge' });
    }
    return list;
  }

  function buildStaticWaterLayer(w, h, cx, cz, span) {
    if (typeof document === 'undefined' || !city) return null;
    const key = `${city.seed}:${city.radius}:${city.waterMode}:${city.waterAmount}:${city.shoreDist}:${w}x${h}:${Math.round(cx)}:${Math.round(cz)}:${Math.round(span)}`;
    if (cachedBg && cachedBgKey === key) return cachedBg;

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext && off.getContext('2d');
    if (!octx) return null;

    octx.fillStyle = '#0a0f18';
    octx.fillRect(0, 0, w, h);

    // Sample analytical coastline & beach strip on a fast 4px grid
    if (city.waterAmount > 0.005 && city.waterMode >= 1 && city.waterMode <= 3) {
      const coreSpan = city.radius * CELL;
      const step = 4;
      for (let py = 0; py < h; py += step) {
        for (let px = 0; px < w; px += step) {
          const { wx, wz } = mapToWorld(px + step * 0.5, py + step * 0.5, cx, cz, w, h, span);
          const d = evalCoastSignedDist(
            wx, wz, coreSpan, city.coastAngle, city.waterMode,
            city.terrainSeedX, city.terrainSeedZ, city.shoreDist, city.waterAmount
          );
          if (d < 0) {
            octx.fillStyle = d > -110 ? 'rgba(26, 98, 138, 0.72)' : 'rgba(14, 52, 86, 0.78)';
            octx.fillRect(px, py, step, step);
          } else if (d < 62) {
            octx.fillStyle = 'rgba(198, 172, 118, 0.34)';
            octx.fillRect(px, py, step, step);
          }
        }
      }
    }

    // Polygonal rivers & harbor basins
    for (const wb of (city.water || [])) {
      if (!wb.pts || wb.pts.length < 3 || wb.kind === 'ocean' || wb.kind === 'lake') continue;
      octx.beginPath();
      for (let i = 0; i < wb.pts.length; i++) {
        const m = worldToMap(wb.pts[i][0], wb.pts[i][1], cx, cz, w, h, span);
        if (i === 0) octx.moveTo(m.px, m.py);
        else octx.lineTo(m.px, m.py);
      }
      octx.closePath();
      octx.fillStyle = 'rgba(28, 108, 152, 0.76)';
      octx.fill();
      octx.strokeStyle = 'rgba(198, 174, 122, 0.32)';
      octx.lineWidth = 1.5;
      octx.stroke();
    }

    // Core avenue & street grid (clipped to dry land AND riverbanks!)
    const r = city.radius;
    const coreSpan = r * CELL;
    const isDryMapPt = (wx, wz) => {
      if (city.waterAmount > 0.005) {
        if (evalCoastSignedDist(wx, wz, coreSpan, city.coastAngle, city.waterMode, city.terrainSeedX, city.terrainSeedZ, city.shoreDist, city.waterAmount) < 12) return false;
        if (evalRiverSignedDist(wx, wz, city.riverFlow) < 10) return false;
      }
      return true;
    };
    const strokeDryLine = (x0, z0, x1, z1) => {
      const steps = 28;
      let pen = false;
      octx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        const wx = x0 + (x1 - x0) * f;
        const wz = z0 + (z1 - z0) * f;
        if (isDryMapPt(wx, wz)) {
          const m = worldToMap(wx, wz, cx, cz, w, h, span);
          if (!pen) { octx.moveTo(m.px, m.py); pen = true; }
          else octx.lineTo(m.px, m.py);
        } else {
          pen = false;
        }
      }
      octx.stroke();
    };
    for (let g = -r; g <= r; g++) {
      const isAve = g % 4 === 0;
      octx.strokeStyle = isAve ? 'rgba(170, 205, 245, 0.30)' : 'rgba(120, 150, 190, 0.12)';
      octx.lineWidth = isAve ? 1.15 : 0.65;
      strokeDryLine(g * CELL, -coreSpan, g * CELL, coreSpan);
      strokeDryLine(-coreSpan, g * CELL, coreSpan, g * CELL);
    }

    // Showcase & neighborhood parks
    for (const pl of (city.places || [])) {
      if (pl.kind !== 'park') continue;
      const m = worldToMap(pl.x, pl.z, cx, cz, w, h, span);
      const pr = Math.max(3, pl.r * m.scale);
      octx.fillStyle = pl.showcase ? 'rgba(56, 188, 108, 0.42)' : 'rgba(46, 156, 92, 0.30)';
      octx.beginPath();
      octx.arc(m.px, m.py, pr, 0, Math.PI * 2);
      octx.fill();
    }

    // Transit lines (subtle map infrastructure so they never read as a camera flight path)
    if (city.transit && city.transit.active) {
      octx.setLineDash?.([2, 3]);
      for (const ln of (city.transit.lines || [])) {
        octx.strokeStyle = ln.color || '#53d9ff';
        octx.globalAlpha = 0.20;
        octx.lineWidth = 0.85;
        octx.beginPath();
        for (let s = 0; s < ln.segments.length; s++) {
          const sg = ln.segments[s];
          const p1 = worldToMap(sg.x1, sg.z1, cx, cz, w, h, span);
          const pc = worldToMap(sg.cx, sg.cz, cx, cz, w, h, span);
          const p2 = worldToMap(sg.x2, sg.z2, cx, cz, w, h, span);
          if (s === 0) octx.moveTo(p1.px, p1.py);
          octx.quadraticCurveTo(pc.px, pc.py, p2.px, p2.py);
        }
        octx.stroke();
        octx.globalAlpha = 1;
      }
      octx.setLineDash?.([]);
    }

    // Harbor piers & Spaceport runway
    if (city.harbor && city.harbor.active) {
      octx.strokeStyle = 'rgba(220, 200, 155, 0.72)';
      octx.lineWidth = 1.6;
      for (const pr of (city.harbor.piers || [])) {
        const p0 = worldToMap(pr.x - Math.sin(pr.rot) * pr.len * 0.5, pr.z - Math.cos(pr.rot) * pr.len * 0.5, cx, cz, w, h, span);
        const p1 = worldToMap(pr.x + Math.sin(pr.rot) * pr.len * 0.5, pr.z + Math.cos(pr.rot) * pr.len * 0.5, cx, cz, w, h, span);
        octx.beginPath(); octx.moveTo(p0.px, p0.py); octx.lineTo(p1.px, p1.py); octx.stroke();
      }
    }
    if (city.spaceport && city.spaceport.active && city.spaceport.runway) {
      const rw = city.spaceport.runway;
      const p0 = worldToMap(rw.x - Math.cos(rw.rot) * rw.len * 0.5, rw.z - Math.sin(rw.rot) * rw.len * 0.5, cx, cz, w, h, span);
      const p1 = worldToMap(rw.x + Math.cos(rw.rot) * rw.len * 0.5, rw.z + Math.sin(rw.rot) * rw.len * 0.5, cx, cz, w, h, span);
      octx.strokeStyle = 'rgba(130, 220, 255, 0.75)';
      octx.lineWidth = 2.4;
      octx.beginPath(); octx.moveTo(p0.px, p0.py); octx.lineTo(p1.px, p1.py); octx.stroke();
    }

    cachedBg = off;
    cachedBgKey = key;
    return off;
  }

  function render(arg0, arg1, arg2) {
    if (!visible || !canvas) return;
    const ctx = getCtx();
    if (!ctx) return;

    const isBag = arg0 && !arg0.isCamera && !arg0.position && (typeof arg0 === 'object');
    const camera = isBag ? arg0.camera : arg0;
    const controls = isBag ? arg0.controls : arg1;
    const recorder = isBag ? arg0.recorder : arg2;
    if (controls) lastControls = controls;

    const w = canvas.width || 184;
    const h = canvas.height || 184;
    const span = worldSpan();
    const cx = followCam && camera ? camera.position.x : 0;
    const cz = followCam && camera ? camera.position.z : 0;
    lastCx = cx;
    lastCz = cz;

    const bg = buildStaticWaterLayer(w, h, cx, cz, span);
    if (bg) {
      ctx.drawImage(bg, 0, 0);
    } else {
      ctx.fillStyle = '#0a0f18';
      ctx.fillRect(0, 0, w, h);
    }

    const accent = (look && look.accent) || '#ff8a3d';

    // 1. Named sites (Landmarks, Parks, Venues, Harbor, Spaceport, Bridges)
    const sites = collectSites();
    for (const st of sites) {
      const m = worldToMap(st.x, st.z, cx, cz, w, h, span);
      if (m.px < -6 || m.px > w + 6 || m.py < -6 || m.py > h + 6) continue;
      const isHov = hoveredSite && hoveredSite.name === st.name;
      if (st.kind === 'landmark') {
        ctx.fillStyle = isHov ? '#ffffff' : accent;
        ctx.beginPath();
        ctx.arc(m.px, m.py, isHov ? 4.2 : 2.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (st.kind === 'park') {
        ctx.fillStyle = isHov ? '#a8ffd0' : '#4ee28a';
        ctx.fillRect(m.px - 2.2, m.py - 2.2, 4.4, 4.4);
      } else if (st.kind === 'harbor' || st.kind === 'spaceport' || st.kind === 'bridge') {
        ctx.strokeStyle = isHov ? '#ffffff' : '#6be4ff';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(m.px - 2.8, m.py - 2.8, 5.6, 5.6);
      } else {
        ctx.fillStyle = isHov ? '#ffffff' : 'rgba(235, 220, 175, 0.85)';
        ctx.beginPath();
        ctx.arc(m.px, m.py, isHov ? 3.4 : 2.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const hasActiveRoute = !!(controls && Array.isArray(controls.routeQueue) && controls.routeQueue.length > 0);
    const hasLoop = !!(controls && Array.isArray(controls.autopilotLoop) && controls.autopilotLoop.length >= 3 && typeof controls.evaluateAutopilotLoop === 'function');
    const hasRecPath = !!(recorder && recorder.frames && recorder.frames.length >= 1 && (recorder.hasPath || recorder.recording));
    const recActive = !!(recorder && (recorder.recording || recorder.playing));

    // 2. Recorded Camera Path Spline + Keyframe Nodes (`keys`) + Active Playhead (Gold/Coral — dimmed when idle)
    if (recorder && recorder.frames && recorder.frames.length >= 1) {
      ctx.save();
      ctx.globalAlpha = recActive ? 1.0 : 0.42;
      if (recorder.hasPath) {
        const dur = recorder.duration;
        const samples = Math.min(96, Math.max(24, recorder.frames.length * 4));
        ctx.beginPath();
        for (let i = 0; i <= samples; i++) {
          const ev = recorder.evaluate((i / samples) * dur);
          if (!ev) continue;
          const m = worldToMap(ev.x, ev.z, cx, cz, w, h, span);
          if (i === 0) ctx.moveTo(m.px, m.py);
          else ctx.lineTo(m.px, m.py);
        }
        ctx.strokeStyle = recorder.recording ? '#ff5566' : '#ffd24c';
        ctx.lineWidth = recActive ? 1.95 : 1.35;
        ctx.stroke();
      }

      // Keyframe nodes (`keys`): distinct golden diamonds for manual `K` keys, dots for flight samples
      const stride = recorder.frames.length > 48 ? Math.ceil(recorder.frames.length / 32) : 1;
      for (let i = 0; i < recorder.frames.length; i++) {
        const f = recorder.frames[i];
        if (!f.manual && i % stride !== 0 && i !== recorder.frames.length - 1) continue;
        const m = worldToMap(f.x, f.z, cx, cz, w, h, span);
        if (f.manual || i === 0 || i === recorder.frames.length - 1) {
          ctx.save();
          ctx.translate(m.px, m.py);
          ctx.rotate(Math.PI * 0.25);
          ctx.fillStyle = i === 0 ? '#5cff9d' : (i === recorder.frames.length - 1 ? '#ff6e7a' : '#ffe066');
          ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(255, 218, 102, 0.8)';
          ctx.beginPath();
          ctx.arc(m.px, m.py, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Live playback playhead marker
      if (recorder.playing && recorder.hasPath) {
        const ev = recorder.evaluate(recorder.playTime);
        if (ev) {
          const m = worldToMap(ev.x, ev.z, cx, cz, w, h, span);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(m.px, m.py, 4.8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 2a. Editable Closed Autopilot Loop Spline + Draggable Waypoint Handles (Solid Cyan — dims while a clicked Route runs!)
    if (hasLoop) {
      const loopPts = controls.autopilotLoop;
      const nL = loopPts.length;
      const samples = Math.min(160, Math.max(48, nL * 14));
      const loopDriving = !!(controls.glide && !hasActiveRoute && !(recorder && recorder.playing));
      ctx.save();
      ctx.beginPath();
      for (let s = 0; s <= samples; s++) {
        const u = (s / samples) * nL;
        const q = controls.evaluateAutopilotLoop(u);
        if (!q) continue;
        const m = worldToMap(q.x, q.z, cx, cz, w, h, span);
        if (s === 0) ctx.moveTo(m.px, m.py);
        else ctx.lineTo(m.px, m.py);
      }
      ctx.closePath();
      ctx.strokeStyle = loopDriving
        ? 'rgba(83, 243, 255, 0.86)'
        : (hasActiveRoute ? 'rgba(83, 243, 255, 0.22)' : 'rgba(120, 210, 255, 0.44)');
      ctx.lineWidth = loopDriving ? 1.85 : (hasActiveRoute ? 1.05 : 1.3);
      ctx.stroke();

      // Subtle directional flow chevrons along the loop
      for (let i = 0; i < nL; i++) {
        const qa = controls.evaluateAutopilotLoop(i + 0.46);
        const qb = controls.evaluateAutopilotLoop(i + 0.54);
        if (!qa || !qb) continue;
        const ma = worldToMap(qa.x, qa.z, cx, cz, w, h, span);
        const mb = worldToMap(qb.x, qb.z, cx, cz, w, h, span);
        const ang = Math.atan2(mb.py - ma.py, mb.px - ma.px);
        ctx.save();
        ctx.translate(mb.px, mb.py);
        ctx.rotate(ang);
        ctx.strokeStyle = loopDriving
          ? 'rgba(160, 250, 255, 0.9)'
          : (hasActiveRoute ? 'rgba(120, 210, 255, 0.24)' : 'rgba(150, 220, 255, 0.55)');
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-3.6, -2.5);
        ctx.lineTo(0.8, 0);
        ctx.lineTo(-3.6, 2.5);
        ctx.stroke();
        ctx.restore();
      }

      // Highlight hovered curve insertion point
      if (hoveredSeg && hoveredLoopIdx < 0 && dragLoopIdx < 0) {
        const mh = worldToMap(hoveredSeg.wx, hoveredSeg.wz, cx, cz, w, h, span);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(mh.px, mh.py, 3.6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draggable loop control handles
      for (let i = 0; i < nL; i++) {
        const lp = loopPts[i];
        const m = worldToMap(lp.x, lp.z, cx, cz, w, h, span);
        const isActive = i === dragLoopIdx || i === hoveredLoopIdx;
        ctx.globalAlpha = isActive ? 1.0 : (hasActiveRoute ? 0.42 : 1.0);
        ctx.fillStyle = isActive ? '#ffffff' : (loopDriving ? '#53f3ff' : '#8fd8ff');
        ctx.beginPath();
        ctx.arc(m.px, m.py, isActive ? 4.8 : 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#071019';
        ctx.lineWidth = 1.25;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2b. Live Autopilot Waypoint Route Queue (Dashed Emerald-Mint — distinct from Cyan Loop!)
    if (camera && hasActiveRoute) {
      const routeFlying = !!(controls.glide && !(recorder && recorder.playing));
      const routeCol = routeFlying ? '#5cff9d' : 'rgba(92, 255, 157, 0.62)';
      ctx.save();
      ctx.strokeStyle = routeCol;
      ctx.lineWidth = routeFlying ? 2.05 : 1.6;
      ctx.setLineDash?.([5, 3]);
      ctx.beginPath();
      const mStart = worldToMap(camera.position.x, camera.position.z, cx, cz, w, h, span);
      ctx.moveTo(mStart.px, mStart.py);
      let prevPt = mStart;
      const chevrons = [];
      for (const wp of controls.routeQueue) {
        const mw = worldToMap(wp.x, wp.z, cx, cz, w, h, span);
        ctx.lineTo(mw.px, mw.py);
        const segLen = Math.hypot(mw.px - prevPt.px, mw.py - prevPt.py);
        if (segLen > 16) {
          chevrons.push({
            x: (prevPt.px + mw.px) * 0.5,
            y: (prevPt.py + mw.py) * 0.5,
            ang: Math.atan2(mw.py - prevPt.py, mw.px - prevPt.px),
          });
        }
        prevPt = mw;
      }
      ctx.stroke();
      ctx.setLineDash?.([]);

      // Directional chevrons along the dashed route so travel order is unmistakable
      for (const ch of chevrons) {
        ctx.save();
        ctx.translate(ch.x, ch.y);
        ctx.rotate(ch.ang);
        ctx.strokeStyle = routeCol;
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.moveTo(-3.6, -2.5);
        ctx.lineTo(1.0, 0);
        ctx.lineTo(-3.6, 2.5);
        ctx.stroke();
        ctx.restore();
      }

      let userStopNum = 0;
      for (let i = 0; i < controls.routeQueue.length; i++) {
        const wp = controls.routeQueue[i];
        const mw = worldToMap(wp.x, wp.z, cx, cz, w, h, span);
        if (wp.via) {
          ctx.fillStyle = 'rgba(92, 255, 157, 0.72)';
          ctx.beginPath();
          ctx.arc(mw.px, mw.py, 2.0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          userStopNum++;
          ctx.strokeStyle = routeCol;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(mw.px, mw.py, 4.8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#071210';
          ctx.beginPath();
          ctx.arc(mw.px, mw.py, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = routeCol;
          ctx.font = '700 7.5px ui-monospace, monospace';
          ctx.fillText(String(userStopNum), mw.px - 2.2, mw.py + 2.5);
        }
      }
      ctx.restore();
    }

    // 3. Live Camera Position, Travel Heading Vector & Separate Freelook / Auto-Look View Cone
    if (camera) {
      const m = worldToMap(camera.position.x, camera.position.z, cx, cz, w, h, span);
      const viewYaw = controls ? controls.yaw : 0;
      const decoupled = !!(controls && (controls.freelook || (controls.glide && controls.autoLook)));
      const moveYaw = decoupled ? controls.moveYaw : viewYaw;

      // View frustum wedge (shows Look-Around / Auto-Look orientation!)
      const vx = -Math.sin(viewYaw);
      const vz = -Math.cos(viewYaw);
      const fovHalf = ((camera.fov || 58) * Math.PI) / 360;
      const coneLen = 22;
      const lx = vx * Math.cos(fovHalf) - vz * Math.sin(fovHalf);
      const lz = vx * Math.sin(fovHalf) + vz * Math.cos(fovHalf);
      const rx = vx * Math.cos(-fovHalf) - vz * Math.sin(-fovHalf);
      const rz = vx * Math.sin(-fovHalf) + vz * Math.cos(-fovHalf);

      ctx.beginPath();
      ctx.moveTo(m.px, m.py);
      ctx.lineTo(m.px + lx * coneLen, m.py + lz * coneLen);
      ctx.lineTo(m.px + rx * coneLen, m.py + rz * coneLen);
      ctx.closePath();
      ctx.fillStyle = decoupled ? 'rgba(92, 230, 255, 0.28)' : 'rgba(255, 255, 255, 0.20)';
      ctx.fill();

      // Travel heading arrow when Freelook or Auto-Look is decoupled from view!
      if (decoupled) {
        const tx = -Math.sin(moveYaw);
        const tz = -Math.cos(moveYaw);
        ctx.strokeStyle = '#ff9e4a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(m.px, m.py);
        ctx.lineTo(m.px + tx * 16, m.py + tz * 16);
        ctx.stroke();
      }

      // Camera dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(m.px, m.py, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#091018';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 4. Compact Color-Coded Path Legend (top-left) + Compass "N" Watermark
    const badges = [];
    if (hasActiveRoute) {
      const userStops = controls.routeQueue.filter((q) => !q.via).length || controls.routeQueue.length;
      badges.push({
        text: controls.glide ? `\u21E2 Route (${userStops})` : `\u23F8 Route (${userStops})`,
        color: '#5cff9d',
        active: !!controls.glide && !(recorder && recorder.playing),
      });
    }
    if (hasLoop) {
      badges.push({
        text: '\u25CB Loop',
        color: '#53f3ff',
        active: !!(controls.glide && !hasActiveRoute && !(recorder && recorder.playing)),
      });
    }
    if (hasRecPath) {
      badges.push({
        text: recorder.recording ? '\u25CF Rec' : (recorder.playing ? '\u25B6 Rec' : '\u25C6 Rec'),
        color: recorder.recording ? '#ff5566' : '#ffd24c',
        active: recActive,
      });
    }
    if (badges.length) {
      ctx.save();
      ctx.font = '600 8.5px ui-monospace, monospace';
      let bx = 5;
      const by = 5;
      for (const b of badges) {
        const tw = (ctx.measureText ? ctx.measureText(b.text).width : b.text.length * 5) + 8;
        ctx.fillStyle = b.active ? 'rgba(8, 16, 26, 0.86)' : 'rgba(8, 16, 26, 0.58)';
        ctx.fillRect(bx, by, tw, 13);
        ctx.strokeStyle = b.active ? b.color : 'rgba(180, 210, 240, 0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, tw, 13);
        ctx.fillStyle = b.color;
        ctx.globalAlpha = b.active ? 1.0 : 0.62;
        ctx.fillText(b.text, bx + 4, by + 9.5);
        ctx.globalAlpha = 1.0;
        bx += tw + 4;
      }
      ctx.restore();
    }

    // Keep default #minimap-label informative when idle (not hovering/dragging)
    if (labelEl && !hoveredSite && hoveredLoopIdx < 0 && !hoveredSeg && dragLoopIdx < 0) {
      if (recorder && recorder.playing) {
        labelEl.textContent = 'Playing Rec Path (Shift+P stop)';
      } else if (hasActiveRoute) {
        const nStops = controls.routeQueue.filter((q) => !q.via).length || controls.routeQueue.length;
        labelEl.textContent = controls.glide
          ? `Flying Route (${nStops}) \u00B7 Shift+click +stop`
          : `Route (${nStops}) paused \u00B7 Press \u25B6 or P`;
      } else {
        labelEl.textContent = controls && controls.glide
          ? 'Flying Loop \u00B7 Click map for Route'
          : 'Click map to fly \u00B7 Press \u25B6 or P';
      }
    }

    ctx.fillStyle = 'rgba(210, 225, 245, 0.48)';
    ctx.font = '600 9px ui-monospace, monospace';
    ctx.fillText('N', w * 0.5 - 3, 11);
  }

  function hitTestLoop(px, py) {
    if (!lastControls || !Array.isArray(lastControls.autopilotLoop) || lastControls.autopilotLoop.length < 3) {
      return { nodeIdx: -1, seg: null };
    }
    const span = worldSpan();
    const pts = lastControls.autopilotLoop;
    let bestIdx = -1;
    let bestD = 8.5;
    for (let i = 0; i < pts.length; i++) {
      const m = worldToMap(pts[i].x, pts[i].z, lastCx, lastCz, canvas.width, canvas.height, span);
      const d = Math.hypot(m.px - px, m.py - py);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) return { nodeIdx: bestIdx, seg: null };

    // Check proximity to closed spline segments for click-to-insert
    if (typeof lastControls.evaluateAutopilotLoop === 'function') {
      const nL = pts.length;
      const samples = nL * 12;
      let bestSegD = 6.5;
      let bestSeg = null;
      for (let s = 0; s < samples; s++) {
        const u = (s / samples) * nL;
        const q = lastControls.evaluateAutopilotLoop(u);
        if (!q) continue;
        const m = worldToMap(q.x, q.z, lastCx, lastCz, canvas.width, canvas.height, span);
        const d = Math.hypot(m.px - px, m.py - py);
        if (d < bestSegD) {
          bestSegD = d;
          const { wx, wz } = mapToWorld(px, py, lastCx, lastCz, canvas.width, canvas.height, span);
          bestSeg = { afterIdx: Math.floor(u) % nL, wx, wz, y: q.y };
        }
      }
      if (bestSeg) return { nodeIdx: -1, seg: bestSeg };
    }
    return { nodeIdx: -1, seg: null };
  }

  function removeLoopNodeAt(idx) {
    if (!lastControls || !Array.isArray(lastControls.autopilotLoop)) return false;
    if (lastControls.autopilotLoop.length <= 3 || idx < 0 || idx >= lastControls.autopilotLoop.length) return false;
    const next = lastControls.autopilotLoop.slice();
    next.splice(idx, 1);
    lastControls.setAutopilotLoop(next);
    hoveredLoopIdx = -1;
    if (typeof onLoopEdited === 'function') onLoopEdited(lastControls.autopilotLoop);
    return true;
  }

  function insertLoopNodeAfter(afterIdx, wx, wz, wy = 135) {
    if (!lastControls || !Array.isArray(lastControls.autopilotLoop)) return false;
    const next = lastControls.autopilotLoop.slice();
    const insAt = Math.max(0, Math.min(next.length, afterIdx + 1));
    next.splice(insAt, 0, {
      name: `Loop ${insAt + 1}`,
      x: Math.round(wx * 10) / 10,
      y: Math.round(wy * 10) / 10,
      z: Math.round(wz * 10) / 10,
    });
    lastControls.setAutopilotLoop(next);
    if (typeof onLoopEdited === 'function') onLoopEdited(lastControls.autopilotLoop);
    return true;
  }

  if (canvas && typeof canvas.addEventListener === 'function') {
    const getCanvasXY = (ev) => {
      const rect = canvas.getBoundingClientRect();
      return {
        px: ((ev.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
        py: ((ev.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
      };
    };

    canvas.addEventListener('pointerdown', (ev) => {
      if (!city) return;
      const { px, py } = getCanvasXY(ev);
      const hit = hitTestLoop(px, py);
      if (hit.nodeIdx >= 0) {
        if (ev.button === 2 || ev.altKey) {
          ev.preventDefault();
          removeLoopNodeAt(hit.nodeIdx);
          return;
        }
        dragLoopIdx = hit.nodeIdx;
        didDragLoop = false;
        canvas.setPointerCapture?.(ev.pointerId);
        ev.preventDefault();
      }
    });

    canvas.addEventListener('pointermove', (ev) => {
      if (!city) return;
      const { px, py } = getCanvasXY(ev);
      const span = worldSpan();

      if (dragLoopIdx >= 0 && lastControls && Array.isArray(lastControls.autopilotLoop) && lastControls.autopilotLoop[dragLoopIdx]) {
        const { wx, wz } = mapToWorld(px, py, lastCx, lastCz, canvas.width, canvas.height, span);
        const next = lastControls.autopilotLoop.slice();
        next[dragLoopIdx] = {
          ...next[dragLoopIdx],
          x: Math.round(wx * 10) / 10,
          z: Math.round(wz * 10) / 10,
        };
        lastControls.setAutopilotLoop(next);
        didDragLoop = true;
        if (labelEl) labelEl.textContent = `Loop #${dragLoopIdx + 1} · (${Math.round(wx)}, ${Math.round(wz)})`;
        return;
      }

      const loopHit = hitTestLoop(px, py);
      hoveredLoopIdx = loopHit.nodeIdx;
      hoveredSeg = loopHit.seg;
      if (hoveredLoopIdx >= 0) {
        hoveredSite = null;
        canvas.style.cursor = 'grab';
        if (labelEl) {
          labelEl.textContent = `Drag Loop #${hoveredLoopIdx + 1} · Right/Alt-click delete`;
        }
        return;
      }
      if (hoveredSeg) {
        hoveredSite = null;
        canvas.style.cursor = 'copy';
        if (labelEl) {
          labelEl.textContent = 'Click loop line to insert waypoint';
        }
        return;
      }

      canvas.style.cursor = 'crosshair';
      const sites = collectSites();
      let best = null;
      let bestD = 9.5;
      for (const st of sites) {
        const m = worldToMap(st.x, st.z, lastCx, lastCz, canvas.width, canvas.height, span);
        const d = Math.hypot(m.px - px, m.py - py);
        if (d < bestD) { bestD = d; best = st; }
      }
      hoveredSite = best;
      if (labelEl) {
        labelEl.textContent = best ? `Fly to · ${best.name}` : (followCam ? 'Radar · Drag loop' : 'Drag loop · Click line +pt');
      }
    });

    const endLoopDrag = (ev) => {
      if (dragLoopIdx >= 0) {
        dragLoopIdx = -1;
        canvas.releasePointerCapture?.(ev.pointerId);
        if (didDragLoop && typeof onLoopEdited === 'function' && lastControls) {
          onLoopEdited(lastControls.autopilotLoop);
        }
      }
    };
    canvas.addEventListener('pointerup', endLoopDrag);
    canvas.addEventListener('pointercancel', endLoopDrag);

    canvas.addEventListener('contextmenu', (ev) => {
      const { px, py } = getCanvasXY(ev);
      const hit = hitTestLoop(px, py);
      if (hit.nodeIdx >= 0) {
        ev.preventDefault();
        removeLoopNodeAt(hit.nodeIdx);
      }
    });

    canvas.addEventListener('dblclick', (ev) => {
      const { px, py } = getCanvasXY(ev);
      const hit = hitTestLoop(px, py);
      if (hit.nodeIdx >= 0) {
        ev.preventDefault();
        removeLoopNodeAt(hit.nodeIdx);
      }
    });

    canvas.addEventListener('pointerleave', () => {
      hoveredSite = null;
      hoveredLoopIdx = -1;
      hoveredSeg = null;
      if (labelEl) labelEl.textContent = followCam ? 'Radar · Drag loop' : 'Drag loop · Click line +pt';
    });

    canvas.addEventListener('click', (ev) => {
      if (didDragLoop) {
        didDragLoop = false;
        return;
      }
      if (!city) return;
      const { px, py } = getCanvasXY(ev);
      const loopHit = hitTestLoop(px, py);
      if (loopHit.nodeIdx >= 0) {
        if (ev.altKey) removeLoopNodeAt(loopHit.nodeIdx);
        return;
      }
      if (loopHit.seg) {
        insertLoopNodeAfter(loopHit.seg.afterIdx, loopHit.seg.wx, loopHit.seg.wz, loopHit.seg.y);
        return;
      }
      if (typeof onSelectSpot !== 'function') return;
      const span = worldSpan();
      const routeMeta = { append: !!ev.shiftKey, fromMinimap: true };
      if (hoveredSite) {
        onSelectSpot(hoveredSite, routeMeta);
        return;
      }
      const { wx, wz } = mapToWorld(px, py, lastCx, lastCz, canvas.width, canvas.height, span);
      onSelectSpot({ name: 'Map Pin', x: wx, y: 135, z: wz }, routeMeta);
    });

    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      zoom = Math.max(0.35, Math.min(3.5, zoom * (ev.deltaY < 0 ? 1.18 : 0.85)));
      cachedBg = null;
    }, { passive: false });
  }

  return {
    setCity(nextCity, nextLook) {
      city = nextCity;
      look = nextLook || look;
      cachedBg = null;
    },
    setLook(nextLook) {
      look = nextLook;
    },
    setAccent(hex) {
      if (!look || typeof look !== 'object' || Array.isArray(look)) look = { accent: hex };
      else look = { ...look, accent: hex };
    },
    setZoom(z) {
      zoom = Math.max(0.35, Math.min(4.0, Number(z) || 1));
      cachedBg = null;
      return zoom;
    },
    setVisible(on) {
      visible = !!on;
    },
    get visible() {
      return visible;
    },
    zoomBy(mul) {
      zoom = Math.max(0.35, Math.min(3.5, zoom * mul));
      cachedBg = null;
      return zoom;
    },
    toggleFollow() {
      followCam = !followCam;
      cachedBg = null;
      if (labelEl) labelEl.textContent = followCam ? 'Radar · Follow' : 'City Map';
      return followCam;
    },
    get follow() {
      return followCam;
    },
    setControls(ctl) {
      lastControls = ctl;
    },
    insertLoopNodeAfter,
    removeLoopNodeAt,
    render,
  };
}
