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
}) {
  let city = null;
  let look = null;
  let visible = true;
  let zoom = 1.0;        // 0.35 (regional) .. 3.5 (downtown close-up)
  let followCam = false; // false = centered on city core, true = centered on camera
  let hoveredSite = null;
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

    // Transit lines
    if (city.transit && city.transit.active) {
      for (const ln of (city.transit.lines || [])) {
        octx.strokeStyle = ln.color || '#53d9ff';
        octx.globalAlpha = 0.55;
        octx.lineWidth = 1.25;
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

    // 2. Recorded Camera Path Spline + Keyframe Nodes (`keys`) + Active Playhead
    if (recorder && recorder.frames && recorder.frames.length >= 1) {
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
        ctx.lineWidth = 1.85;
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
    }

    // 2b. Live Autopilot Waypoint Route Queue (smooth minimap click-to-fly course!)
    if (camera && controls && Array.isArray(controls.routeQueue) && controls.routeQueue.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#53f3ff';
      ctx.lineWidth = 1.85;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      const mStart = worldToMap(camera.position.x, camera.position.z, cx, cz, w, h, span);
      ctx.moveTo(mStart.px, mStart.py);
      for (const wp of controls.routeQueue) {
        const mw = worldToMap(wp.x, wp.z, cx, cz, w, h, span);
        ctx.lineTo(mw.px, mw.py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < controls.routeQueue.length; i++) {
        const wp = controls.routeQueue[i];
        const mw = worldToMap(wp.x, wp.z, cx, cz, w, h, span);
        if (wp.via) {
          ctx.fillStyle = 'rgba(83, 243, 255, 0.75)';
          ctx.beginPath();
          ctx.arc(mw.px, mw.py, 2.0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = '#5cff9d';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(mw.px, mw.py, 4.6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#5cff9d';
          ctx.beginPath();
          ctx.arc(mw.px, mw.py, 1.9, 0, Math.PI * 2);
          ctx.fill();
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

    // Subtle compass "N" watermark
    ctx.fillStyle = 'rgba(210, 225, 245, 0.48)';
    ctx.font = '600 9px ui-monospace, monospace';
    ctx.fillText('N', w * 0.5 - 3, 11);
  }

  if (canvas && typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('pointermove', (ev) => {
      if (!city) return;
      const rect = canvas.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
      const py = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
      const span = worldSpan();
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
        labelEl.textContent = best ? `Fly to · ${best.name}` : (followCam ? 'Radar · Follow' : 'City Map');
      }
    });

    canvas.addEventListener('pointerleave', () => {
      hoveredSite = null;
      if (labelEl) labelEl.textContent = followCam ? 'Radar · Follow' : 'City Map';
    });

    canvas.addEventListener('click', (ev) => {
      if (!city || typeof onSelectSpot !== 'function') return;
      const rect = canvas.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
      const py = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
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
    render,
  };
}
