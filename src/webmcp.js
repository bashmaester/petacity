/* ============================================================================
 * Petacity WebMCP Bridge (`navigator.modelContext` + `window.petacity` + postMessage)
 *
 * Exposes 100% of Petacity's procedural city, professional Drone-DP camera,
 * multi-shot choreography, scene edit transitions, world/sky/cloud/water/light
 * dials, color grading, optical lenses, presets/bookmarks, performance & view
 * culling, generative synth radio, and capture tools to WebMCP-compatible
 * browser agents (`navigator.modelContext`), in-page scripts (`window.petacity`),
 * and parent frames (`postMessage` JSON-RPC).
 *
 * Reference spec: W3C Web Machine Learning Community Group — WebMCP
 * (`navigator.modelContext.registerTool` / `provideContext`).
 * ========================================================================= */

import {
  SCENE_TRANSITION_NAMES,
  ART_STYLE_NAMES,
  LENS_MODE_NAMES,
  CAMERA_ANGLE_PRESETS,
} from './post.js';
import { CAMERA_STYLE_NAMES, CINEMATIC_GAZE_MODES } from './controls.js';
import { PERFORMANCE_PROFILES } from './scene.js';
import { RADIO_STATIONS, MUSIC_SYNC_PRESETS } from './audio.js';

export const WEBMCP_PROTOCOL_VERSION = '2026.10.22';

function asMcpResult(data) {
  const payload = typeof data === 'string' ? { message: data } : data;
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function asMcpError(err) {
  const msg = (err && err.message) ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: msg }) }],
    structuredContent: { error: msg },
  };
}

export const PETACITY_CONTROL_CATALOG = Object.freeze({
  looks: ['bladerunner', 'realistic', 'anime', 'abstract', 'tron', 'outrun', 'clay', 'metropolis', 'custom'],
  cameraMotionStyles: CAMERA_STYLE_NAMES,
  cinematicGazeModes: CINEMATIC_GAZE_MODES,
  lensModes: LENS_MODE_NAMES,
  anglePresets: CAMERA_ANGLE_PRESETS.map((p, id) => ({ id, key: p.key, name: p.name })),
  artStyles: ART_STYLE_NAMES,
  sceneTransitions: SCENE_TRANSITION_NAMES,
  performanceTiers: ['auto', ...Object.keys(PERFORMANCE_PROFILES)],
  weatherModes: ['clear', 'rain', 'storm', 'snow', 'ash', 'dust', 'film'],
  cloudTypes: ['cumulus', 'stratus', 'cirrus', 'cumulonimbus', 'lenticular', 'turbulent'],
  cloudStyles: ['volumetric', 'filmgrain', 'streaks', 'flow', 'spray', 'drybrush', 'inkhatch'],
  waterModes: ['none', 'harbor', 'river', 'archipelago', 'canals'],
  waterShaders: ['realistic', 'stylized_toon', 'neon_synth', 'calm_mirror', 'storm_ocean'],
  terrainModes: ['flat', 'gentle_hills', 'coastal_ridge', 'highland_basin', 'mesa_canyon'],
  treeModes: ['mixed_urban', 'lush_canopy', 'pine_conifer', 'palm_tropical', 'cherry_autumn', 'cyber_biolum', 'none'],
  trailModes: ['off', 'hero_ships_trains', 'aircraft_trains', 'fast_traffic', 'dense_traffic', 'all_moving'],
  radioStations: RADIO_STATIONS.map((s, index) => ({ index, id: s.id, name: s.name, bpm: s.bpm })),
  musicSyncPresets: MUSIC_SYNC_PRESETS.map((p) => ({ id: p.id, label: p.label })),
});

/**
 * Build and register the complete Petacity WebMCP tool suite.
 */
export function registerPetacityWebMCP({
  director,
  getState,
  getFullState,
  applyPartialState,
  getCity,
  getVehicles,
  controls,
  camera,
  radio,
  recorder,
  exporter,
  enqueueSpotRoute,
  triggerTransition,
  getTransitionState,
  managePresetsAndBookmarks,
  setPerformance,
  getPerformanceStats,
}) {
  const registeredTools = new Map();

  function buildPoseSnapshot() {
    return camera ? {
      x: +camera.position.x.toFixed(2),
      y: +camera.position.y.toFixed(2),
      z: +camera.position.z.toFixed(2),
      yaw: +(controls ? controls.yaw : camera.rotation.y).toFixed(4),
      pitch: +(controls ? controls.pitch : camera.rotation.x).toFixed(4),
      roll: +(controls ? (controls.roll || 0) : (camera.rotation.z || 0)).toFixed(4),
      fov: +(camera.fov || 58).toFixed(1),
      glide: !!(controls && controls.glide),
      glideSpeed: +(controls ? (controls.glideSpeed || 32) : 32).toFixed(2),
      camSpeed: +(controls ? (controls.speedMul ?? 1) : 1).toFixed(3),
      motionStyle: controls ? (CAMERA_STYLE_NAMES[controls.motionStyle] || 'Silk') : 'Silk',
      motionStyleId: controls ? (controls.motionStyle ?? 0) : 0,
      gazeModeId: controls ? (controls.gazeMode ?? 0) : 0,
      gazeMode: controls ? (CINEMATIC_GAZE_MODES[controls.gazeMode] || 'Off') : 'Off',
      autoLook: !!(controls && controls.autoLook),
      autoLookSubject: (controls && controls.autoLookSubject) || '',
      sightlineConfidence: +(controls && Number.isFinite(controls._sightlineConfidence) ? controls._sightlineConfidence : 1).toFixed(3),
      gimbalSmooth: +(controls ? (controls.gimbalSmooth ?? 1) : 1).toFixed(2),
      leadFraming: +(controls ? (controls.leadFraming ?? 0.82) : 0.82).toFixed(2),
      freelook: !!(controls && controls.freelook),
      avoidance: !!(controls && controls.avoidance),
      collision: !!(controls && controls.collision),
      colliderRadius: +(controls ? (controls.colliderRadius ?? 2.2) : 2.2).toFixed(2),
      queuedWaypoints: controls && controls.waypoints ? controls.waypoints.length : 0,
      autopilotLoopNodes: controls && Array.isArray(controls.autopilotLoop) ? controls.autopilotLoop.length : 0,
    } : null;
  }

  function applyPoseFields(input) {
    if (!camera) return;
    const nextX = Number.isFinite(input.x) ? input.x : camera.position.x;
    const nextY = Number.isFinite(input.y) ? Math.max(2, input.y) : camera.position.y;
    const nextZ = Number.isFinite(input.z) ? input.z : camera.position.z;
    camera.position.set(nextX, nextY, nextZ);

    if (Number.isFinite(input.fov)) {
      camera.fov = Math.max(15, Math.min(150, input.fov));
      camera.updateProjectionMatrix?.();
    }

    let nextYaw = controls ? controls.yaw : camera.rotation.y;
    let nextPitch = controls ? controls.pitch : camera.rotation.x;
    let nextRoll = controls ? (controls.cameraRoll || controls.roll || 0) : (camera.rotation.z || 0);

    if (input.lookAt && Number.isFinite(input.lookAt.x) && Number.isFinite(input.lookAt.z)) {
      const ly = Number.isFinite(input.lookAt.y) ? input.lookAt.y : nextY * 0.65;
      const dx = input.lookAt.x - nextX;
      const dy = ly - nextY;
      const dz = input.lookAt.z - nextZ;
      const hDist = Math.max(1e-4, Math.hypot(dx, dz));
      nextYaw = Math.atan2(-dx, -dz);
      nextPitch = Math.max(-1.42, Math.min(1.42, Math.atan2(dy, hDist)));
    } else {
      if (Number.isFinite(input.yawDeg)) nextYaw = (input.yawDeg * Math.PI) / 180;
      else if (Number.isFinite(input.yaw)) nextYaw = input.yaw;
      if (Number.isFinite(input.pitchDeg)) nextPitch = (input.pitchDeg * Math.PI) / 180;
      else if (Number.isFinite(input.pitch)) nextPitch = input.pitch;
    }
    if (Number.isFinite(input.rollDeg)) nextRoll = (input.rollDeg * Math.PI) / 180;
    else if (Number.isFinite(input.roll)) nextRoll = input.roll;

    if (controls && typeof controls.setPose === 'function') {
      controls.setPose({ x: nextX, y: nextY, z: nextZ, yaw: nextYaw, pitch: nextPitch, roll: nextRoll });
    } else if (input.lookAt && Number.isFinite(input.lookAt.x) && Number.isFinite(input.lookAt.z)) {
      camera.lookAt(input.lookAt.x, Number.isFinite(input.lookAt.y) ? input.lookAt.y : nextY * 0.65, input.lookAt.z);
    }
  }

  const tools = [
    /* ------------------------------------------------------------------ 1 */
    {
      name: 'petacity_get_world_status',
      description: 'Inspect the current Petacity movie-set state: seed, look, scale, time of day, weather, camera pose & Drone-DP gimbal state, active shot choreography, scene edit transitions, performance/culling stats, overridden buildings/signs/vehicles/projections, and generative synth radio status.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        const st = getState();
        const city = getCity();
        return asMcpResult({
          protocol: WEBMCP_PROTOCOL_VERSION,
          world: st,
          camera: buildPoseSnapshot(),
          counts: city ? {
            buildings: city.count || 0,
            landmarks: (city.landmarks || []).length,
            places: (city.places || []).length,
            signageBillboards: (city.bills || []).length,
            holograms: (city.holos || []).length,
            harbor: !!city.harbor,
            spaceport: !!city.spaceport,
            bridges: (city.bridges || []).length,
            transitLines: city.transit ? (city.transit.lines || []).length : 0,
          } : null,
          transition: getTransitionState ? getTransitionState() : { active: false, type: 'cut', progress: 0 },
          performance: getPerformanceStats ? getPerformanceStats() : null,
          movieSet: director.getStatus(),
          radio: radio ? {
            playing: radio.playing,
            stationIndex: radio.stationIndex,
            station: radio.station ? radio.station.name : null,
            playlistMode: radio.playlistMode,
            playlistInterval: radio.playlistInterval,
          } : null,
        });
      },
    },

    /* ------------------------------------------------------------------ 2 */
    {
      name: 'petacity_get_full_control_state',
      description: 'Return 100% of Petacity settings as a normalized state object alongside the full catalog of valid enum names, saved presets/bookmarks, camera path recorder status, active edit transition, and performance telemetry. Ideal for automated cinematography planning.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          includeCatalog: { type: 'boolean', description: 'Include full enum catalog of looks, lenses, transitions, cloud/water/terrain/trail modes (default true).' },
        },
      },
      execute: async (input = {}) => {
        const full = getFullState ? getFullState() : getState();
        const presetsInfo = managePresetsAndBookmarks
          ? managePresetsAndBookmarks({ action: 'list' })
          : { builtinPresets: [], userPresets: [], bookmarks: [] };
        return asMcpResult({
          protocol: WEBMCP_PROTOCOL_VERSION,
          state: full,
          camera: buildPoseSnapshot(),
          pathRecorder: recorder ? {
            hasPath: recorder.hasPath,
            recording: recorder.recording,
            playing: recorder.playing,
            loop: recorder.loop,
            keyframeCount: recorder.count,
            durationSec: +recorder.duration.toFixed(2),
            playheadSec: +recorder.playhead.toFixed(2),
          } : null,
          transition: getTransitionState ? getTransitionState() : { active: false, type: 'cut', progress: 0 },
          performance: getPerformanceStats ? getPerformanceStats() : null,
          presetsAndBookmarks: presetsInfo,
          catalog: input.includeCatalog !== false ? PETACITY_CONTROL_CATALOG : undefined,
        });
      },
    },

    /* ------------------------------------------------------------------ 3 */
    {
      name: 'petacity_what_am_i_looking_at',
      description: 'Cast a 3D perception ray from the camera through normalized screen coordinates (default `[0, 0]` = center crosshair) and return the hit entity (`building`, `sign`, `hologram`, `landmark`, `place`, `vehicle`, `custom_projection`, `ground`, or `sky`), world coordinates, distance, dimensions, and nearby points of interest.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          ndcX: { type: 'number', minimum: -1, maximum: 1, description: 'Normalized horizontal screen coordinate (-1 left .. 0 center .. +1 right).' },
          ndcY: { type: 'number', minimum: -1, maximum: 1, description: 'Normalized vertical screen coordinate (-1 bottom .. 0 center .. +1 top).' },
          maxDistance: { type: 'number', minimum: 10, maximum: 20000, description: 'Maximum ray distance in meters (default 6000).' },
        },
      },
      execute: async (input = {}) => asMcpResult(director.whatAmILookingAt(input)),
    },

    /* ------------------------------------------------------------------ 4 */
    {
      name: 'petacity_list_entities',
      description: 'Query spatial entities in the city (`visible`, `buildings`, `signs`, `holograms`, `landmarks`, `places`, `vehicles`, `infrastructure`) with optional proximity filter (`nearX`, `nearZ`, `radius`) and height filter (`minHeight`). Returns entity IDs ready for `petacity_takeover_*`, `petacity_control_vehicle`, or camera targeting.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['all', 'visible', 'buildings', 'signs', 'holograms', 'landmarks', 'places', 'vehicles', 'infrastructure'],
            description: 'Entity category to list (default `all`).',
          },
          nearX: { type: 'number', description: 'Optional filter center X (world meters).' },
          nearZ: { type: 'number', description: 'Optional filter center Z (world meters).' },
          radius: { type: 'number', minimum: 10, maximum: 20000, description: 'Optional search radius in meters around `(nearX, nearZ)`.' },
          minHeight: { type: 'number', minimum: 0, description: 'Minimum height filter for buildings (meters).' },
          limit: { type: 'number', minimum: 1, maximum: 200, description: 'Max entities per category (default 40).' },
        },
      },
      execute: async (input = {}) => {
        const cat = input.category || 'all';
        const limit = Math.max(1, Math.min(200, Math.round(input.limit || 40)));
        if (cat === 'visible') {
          return asMcpResult({ ok: true, visible: director.scanVisibleEntities({ limit }) });
        }
        const city = getCity ? getCity() : null;
        const vehicles = getVehicles ? getVehicles() : null;
        const hasNear = Number.isFinite(input.nearX) && Number.isFinite(input.nearZ);
        const rad = Number.isFinite(input.radius) ? input.radius : Infinity;
        const inRange = (x, z) => (!hasNear || Math.hypot(x - input.nearX, z - input.nearZ) <= rad);
        const out = { ok: true };

        if (city && (cat === 'all' || cat === 'landmarks')) {
          out.landmarks = (city.landmarks || [])
            .map((lm, id) => ({ id, name: lm.name, kind: lm.kind, x: +lm.x.toFixed(1), z: +lm.z.toFixed(1), height: +(lm.h || lm.y || 140).toFixed(1) }))
            .filter((e) => inRange(e.x, e.z))
            .slice(0, limit);
        }
        if (city && (cat === 'all' || cat === 'places')) {
          out.places = (city.places || [])
            .map((pl, id) => ({ id, name: pl.name, kind: pl.kind, x: +pl.x.toFixed(1), z: +pl.z.toFixed(1), radius: +(pl.r || 40).toFixed(1) }))
            .filter((e) => inRange(e.x, e.z))
            .slice(0, limit);
        }
        if (city && (cat === 'all' || cat === 'infrastructure')) {
          const infra = [];
          if (city.harbor) infra.push({ name: 'Port Harbor & Lighthouse', kind: 'harbor', x: +city.harbor.x.toFixed(1), z: +city.harbor.z.toFixed(1), y: 72 });
          if (city.spaceport) infra.push({ name: 'Orbital Launchport', kind: 'spaceport', x: +city.spaceport.x.toFixed(1), z: +city.spaceport.z.toFixed(1), y: 95 });
          if (city.showcasePark) infra.push({ name: city.showcasePark.name || 'Showcase Park', kind: 'park', x: +city.showcasePark.x.toFixed(1), z: +city.showcasePark.z.toFixed(1), y: 48 });
          if (city.mediaZone) infra.push({ name: city.mediaZone.name || 'Media Holo-Core', kind: 'media', x: +city.mediaZone.x.toFixed(1), z: +city.mediaZone.z.toFixed(1), y: 95 });
          out.infrastructure = infra.filter((e) => inRange(e.x, e.z)).slice(0, limit);
        }
        if (city && (cat === 'all' || cat === 'buildings')) {
          const minH = Number.isFinite(input.minHeight) ? input.minHeight : 60;
          const bldgs = [];
          for (let i = 0; i < (city.count || 0) && bldgs.length < limit; i++) {
            const topY = city.y[i] + city.h[i] * 0.5;
            if (topY < minH) continue;
            if (!inRange(city.x[i], city.z[i])) continue;
            bldgs.push({ buildingId: i, x: +city.x[i].toFixed(1), z: +city.z[i].toFixed(1), height: +topY.toFixed(1), width: +city.w[i].toFixed(1), depth: +city.d[i].toFixed(1) });
          }
          out.buildings = bldgs;
        }
        if (city && (cat === 'all' || cat === 'signs')) {
          out.signs = (city.bills || [])
            .map((b, signId) => ({ signId, x: +b.x.toFixed(1), y: +b.y.toFixed(1), z: +b.z.toFixed(1), width: +b.w.toFixed(1), height: +b.h.toFixed(1), mega: !!b.mega }))
            .filter((e) => inRange(e.x, e.z))
            .slice(0, limit);
        }
        if (city && (cat === 'all' || cat === 'holograms')) {
          out.holograms = (city.holos || [])
            .map((h, holoId) => ({ holoId, kind: h.kind, x: +h.x.toFixed(1), y: +h.y.toFixed(1), z: +h.z.toFixed(1), width: +h.w.toFixed(1), height: +h.h.toFixed(1) }))
            .filter((e) => inRange(e.x, e.z))
            .slice(0, limit);
        }
        if (vehicles && typeof vehicles.listVehicles === 'function' && (cat === 'all' || cat === 'vehicles')) {
          const nearPt = hasNear
            ? [input.nearX, camera ? camera.position.y : 60, input.nearZ]
            : (camera ? [camera.position.x, camera.position.y, camera.position.z] : null);
          out.vehicles = vehicles.listVehicles({ limit, near: nearPt });
        }
        return asMcpResult(out);
      },
    },

    /* ------------------------------------------------------------------ 5 */
    {
      name: 'petacity_set_camera_pose',
      description: 'Position, aim, and configure the camera, optics, and Drone-DP fluid-head gimbal. Supports world `(x, y, z)`, `yaw`/`pitch`/`roll` or `lookAt`, `fov`, `lensMode` (0..9), `anglePreset` (0..13), `gazeMode` (0..5), `gimbalSmooth` (0.15..2.5), `leadFraming` (0..1.5), `motionStyle` (`silk|chase|fpv|orbit|dolly`), `camSpeed`, `colliderRadius`, and optional cinema `transition` (`cut|fade_black|dissolve|wipe_left|...`).',
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Camera world X in meters.' },
          y: { type: 'number', description: 'Camera world Y (altitude in meters).' },
          z: { type: 'number', description: 'Camera world Z in meters.' },
          yaw: { type: 'number', description: 'Camera yaw in radians.' },
          pitch: { type: 'number', description: 'Camera pitch in radians (-1.45 .. +1.45).' },
          roll: { type: 'number', description: 'Camera Dutch roll in radians.' },
          yawDeg: { type: 'number', description: 'Optional camera yaw in degrees.' },
          pitchDeg: { type: 'number', description: 'Optional camera pitch in degrees.' },
          rollDeg: { type: 'number', description: 'Optional camera Dutch roll in degrees.' },
          lookAt: {
            type: 'object',
            description: 'Target world point `{ x, y, z }` to aim the camera toward.',
            properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          },
          fov: { type: 'number', minimum: 15, maximum: 150, description: 'Vertical field of view in degrees.' },
          lensMode: {
            type: 'integer', minimum: 0, maximum: 9,
            description: '0=Rectilinear, 1=Fisheye180, 2=BarrelCinema, 3=Pincushion, 4=Equirect360, 5=LittlePlanet, 6=CrystalBall, 7=CylindricalPan, 8=DomeMaster, 9=Hyperbolic.',
          },
          lensDistort: { type: 'number', minimum: -1, maximum: 1 },
          lensZoom: { type: 'number', minimum: 0.4, maximum: 2.5 },
          anamorphic: { type: 'number', minimum: 0, maximum: 1 },
          tiltShift: { type: 'number', minimum: 0, maximum: 1 },
          anglePreset: { type: 'integer', minimum: 0, maximum: 13, description: 'Strange-angle preset index (0..13).' },
          glide: { type: 'boolean', description: 'Enable/disable autopilot glide.' },
          glideSpeed: { type: 'number', minimum: 1, maximum: 260, description: 'Base autopilot cruise speed in m/s (default 32).' },
          camSpeed: { type: 'number', minimum: 0, maximum: 5, description: 'Camera speed multiplier (0.00x stationary hover, 0.01x..0.10x fine drift .. 5x).' },
          gazeMode: {
            type: ['integer', 'string'],
            description: 'Drone-DP gaze mode: 0/`off`, 1/`drone_cinema` (Balanced Drone DP), 2/`architectural` (Landmarks & Towers), 3/`skyline` (Vertical Canyons & Spires), 4/`projections` (Holograms & Neon), 5/`kinetic` (Sweep & Bank).',
          },
          gimbalSmooth: { type: 'number', minimum: 0.15, maximum: 2.5, description: '3rd-order fluid-head gimbal inertia multiplier (1.0 = cinema default, higher = heavier damped fluid head).' },
          leadFraming: { type: 'number', minimum: 0, maximum: 1.5, description: 'Turn-anticipation & rule-of-thirds lead framing amount (default 0.82).' },
          autoLook: { type: 'boolean', description: 'Toggle Drone-DP look-around on/off.' },
          freelook: { type: 'boolean', description: 'Decouple head gaze from flight travel direction.' },
          avoidance: { type: 'boolean', description: 'Enable/disable building obstacle avoidance.' },
          collision: { type: 'boolean', description: 'Enable/disable building/ground collision.' },
          colliderRadius: { type: 'number', minimum: 0.5, maximum: 12, description: 'Camera collision sphere radius in meters (default 2.2).' },
          motionStyle: {
            type: ['integer', 'string'],
            description: 'Camera flight style: 0/`silk`, 1/`chase`, 2/`fpv`, 3/`orbit`, 4/`dolly`.',
          },
          smoothness: { type: 'number', minimum: 0, maximum: 1.5, description: 'Translational velocity smoothing.' },
          turnSmooth: { type: 'number', minimum: 0.2, maximum: 5, description: 'Autopilot steering smoothness.' },
          transition: {
            type: 'string',
            description: 'Optional edit transition when cutting to this pose (`cut`, `fade_black`, `fade_white`, `dissolve`, `wipe_left`, `wipe_right`, `wipe_up`, `wipe_down`, `wipe_diagonal`, `iris`, `shutter_bars`).',
          },
          transitionDuration: { type: 'number', minimum: 0.08, maximum: 6, description: 'Optional edit transition duration in seconds.' },
        },
      },
      execute: async (input = {}) => {
        director.stopCameraScript();
        const runCut = () => {
          applyPoseFields(input);
          applyPartialState({
            fov: input.fov,
            rollDeg: Number.isFinite(input.rollDeg)
              ? input.rollDeg
              : (Number.isFinite(input.roll) ? (input.roll * 180) / Math.PI : undefined),
            lensMode: input.lensMode,
            lensDistort: input.lensDistort,
            lensZoom: input.lensZoom,
            anamorphic: input.anamorphic,
            tiltShift: input.tiltShift,
            anglePreset: input.anglePreset,
            glide: input.glide,
            glideSpeed: input.glideSpeed,
            camSpeed: input.camSpeed,
            gazeMode: input.gazeMode,
            gimbalSmooth: input.gimbalSmooth,
            leadFraming: input.leadFraming,
            autoLook: input.autoLook,
            freelook: input.freelook,
            avoidance: input.avoidance,
            collision: input.collision,
            colliderRadius: input.colliderRadius,
            motionStyle: input.motionStyle,
            smoothness: input.smoothness,
            turnSmooth: input.turnSmooth,
          });
        };
        if (input.transition && input.transition !== 'cut' && triggerTransition) {
          triggerTransition({
            type: input.transition,
            duration: input.transitionDuration,
            onCut: runCut,
          });
        } else {
          runCut();
        }
        return asMcpResult({ ok: true, transition: input.transition || 'cut', pose: buildPoseSnapshot() });
      },
    },

    /* ------------------------------------------------------------------ 6 */
    {
      name: 'petacity_step_pilot',
      description: 'Relative drone stick & fluid-head gimbal piloting for step-by-step or real-time agent navigation. Moves the drone relative to its current heading (`forward`, `right`, `up`) while respecting building collision & avoidance, and smoothly steps `yawDeltaDeg`, `pitchDeltaDeg`, `rollDeg`, and `fov`.',
      inputSchema: {
        type: 'object',
        properties: {
          forward: { type: 'number', minimum: -5, maximum: 5, description: 'Forward/backward stick (-1 full reverse .. +1 full forward, up to ±5x boost).' },
          right: { type: 'number', minimum: -5, maximum: 5, description: 'Right/left strafe stick (-1 left .. +1 right).' },
          up: { type: 'number', minimum: -5, maximum: 5, description: 'Vertical climb/descent stick (-1 down .. +1 up).' },
          yawDeltaDeg: { type: 'number', minimum: -180, maximum: 180, description: 'Relative pan angle delta in degrees (positive = pan left, negative = pan right).' },
          pitchDeltaDeg: { type: 'number', minimum: -90, maximum: 90, description: 'Relative tilt angle delta in degrees (positive = tilt up, negative = tilt down).' },
          rollDeg: { type: 'number', minimum: -85, maximum: 85, description: 'Optional target Dutch roll angle in degrees.' },
          fov: { type: 'number', minimum: 15, maximum: 150, description: 'Optional target vertical field of view in degrees.' },
          speedMul: { type: 'number', minimum: 0, maximum: 5, description: 'Optional speed multiplier override for this step.' },
          dt: { type: 'number', minimum: 0.005, maximum: 2, description: 'Simulated time step per sub-step in seconds (default 0.25).' },
          steps: { type: 'integer', minimum: 1, maximum: 60, description: 'Number of physics/collision sub-steps to integrate (default 1).' },
        },
      },
      execute: async (input = {}) => {
        if (!controls || typeof controls.stepPilot !== 'function') {
          throw new Error('Controls stepPilot unavailable');
        }
        director.stopCameraScript();
        const steps = Math.max(1, Math.min(60, Math.round(input.steps ?? 1)));
        const dt = Math.max(0.005, Math.min(2.0, Number.isFinite(input.dt) ? input.dt : 0.25));
        const yawPerStep = Number.isFinite(input.yawDeltaDeg) ? input.yawDeltaDeg / steps : 0;
        const pitchPerStep = Number.isFinite(input.pitchDeltaDeg) ? input.pitchDeltaDeg / steps : 0;
        let pose = null;
        for (let i = 0; i < steps; i++) {
          pose = controls.stepPilot({
            forward: input.forward || 0,
            right: input.right || 0,
            up: input.up || 0,
            yawDeltaDeg: yawPerStep,
            pitchDeltaDeg: pitchPerStep,
            rollDeg: input.rollDeg,
            fov: input.fov,
            speedMul: input.speedMul,
            dt,
          });
        }
        return asMcpResult({ ok: true, steps, dt, pose, camera: buildPoseSnapshot() });
      },
    },

    /* ------------------------------------------------------------------ 7 */
    {
      name: 'petacity_autopilot_route',
      description: 'Queue smooth collision-avoiding autopilot destinations OR inspect/edit the closed spline `autopilotLoop` shown on the minimap. Supports landmarks by name (`destinationName`), world `{ x, y, z }` waypoints, Drone-DP `gazeMode`/`gimbalSmooth`/`leadFraming`, and full loop CRUD (`setLoop`, `insertLoopNode`, `updateLoopNode`, `removeLoopNode`, `resetLoop`).',
      inputSchema: {
        type: 'object',
        properties: {
          destinationName: { type: 'string', description: 'Case-insensitive landmark, place, or district name to fly to.' },
          waypoints: {
            type: 'array',
            description: 'Ordered list of world `{ x, y, z, name }` waypoints to fly through.',
            items: {
              type: 'object',
              required: ['x', 'z'],
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                z: { type: 'number' },
                name: { type: 'string' },
              },
            },
          },
          append: { type: 'boolean', description: 'Append to existing route queue instead of replacing it (default false).' },
          clear: { type: 'boolean', description: 'Clear all queued waypoints.' },
          gazeMode: {
            type: ['integer', 'string'],
            description: 'Optional Drone-DP gaze mode (`off`, `drone_cinema`, `architectural`, `skyline`, `projections`, `kinetic`).',
          },
          gimbalSmooth: { type: 'number', minimum: 0.15, maximum: 2.5 },
          leadFraming: { type: 'number', minimum: 0, maximum: 1.5 },
          speedMul: { type: 'number', minimum: 0, maximum: 5, description: 'Optional autopilot camera speed multiplier.' },
          setLoop: {
            type: 'array',
            description: 'Replace the closed autopilot spline loop (minimum 3 `{ x, y, z }` control nodes).',
            items: {
              type: 'object',
              required: ['x', 'z'],
              properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
            },
          },
          insertLoopNode: {
            type: 'object',
            description: 'Insert a `{ x, y, z, afterIndex }` node into the closed autopilot loop.',
            properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' }, afterIndex: { type: 'integer' } },
          },
          updateLoopNode: {
            type: 'object',
            description: 'Move an existing loop node `{ index, x, y, z }`.',
            properties: { index: { type: 'integer' }, x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
          },
          removeLoopNode: { type: 'integer', description: 'Remove loop node at `index` (preserves minimum 3 nodes).' },
          resetLoop: { type: 'boolean', description: 'Rebuild the default city-wide scenic autopilot spline loop.' },
        },
      },
      execute: async (input = {}) => {
        director.stopCameraScript();
        if (input.clear && controls) controls.clearWaypoints();
        if (input.gazeMode !== undefined || input.gimbalSmooth !== undefined || input.leadFraming !== undefined || input.speedMul !== undefined) {
          applyPartialState({
            gazeMode: input.gazeMode,
            gimbalSmooth: input.gimbalSmooth,
            leadFraming: input.leadFraming,
            camSpeed: input.speedMul,
          });
        }
        if (controls) {
          if (input.resetLoop) {
            const st = getState();
            const R = ((st && st.cityRadius) || 5) * 260;
            controls.buildDefaultAutopilotLoop(R, (st && st.heightScale) || 1);
          }
          if (Array.isArray(input.setLoop) && input.setLoop.length >= 3) {
            controls.setAutopilotLoop(input.setLoop);
          }
          if (input.insertLoopNode && Number.isFinite(input.insertLoopNode.x) && Number.isFinite(input.insertLoopNode.z)) {
            const idx = Number.isInteger(input.insertLoopNode.afterIndex)
              ? input.insertLoopNode.afterIndex
              : Math.max(0, controls.autopilotLoop.length - 1);
            controls.insertLoopPointAfter(idx, input.insertLoopNode.x, input.insertLoopNode.z, input.insertLoopNode.y);
          }
          if (input.updateLoopNode && Number.isInteger(input.updateLoopNode.index)) {
            controls.updateLoopPoint(
              input.updateLoopNode.index,
              input.updateLoopNode.x,
              input.updateLoopNode.z,
              input.updateLoopNode.y
            );
          }
          if (Number.isInteger(input.removeLoopNode)) {
            controls.removeLoopPoint(input.removeLoopNode);
          }
        }
        const queued = [];
        if (input.destinationName) {
          const q = input.destinationName.toLowerCase();
          const city = getCity ? getCity() : null;
          const candidates = city ? [
            ...(city.landmarks || []).map((lm) => ({ name: lm.name, x: lm.x, z: lm.z, h: lm.h || lm.y || 140 })),
            ...(city.places || []).map((pl) => ({ name: pl.name, x: pl.x, z: pl.z, h: 55 })),
            ...(city.harbor ? [{ name: 'Port Harbor & Lighthouse', x: city.harbor.x, z: city.harbor.z, h: 72 }] : []),
            ...(city.spaceport ? [{ name: 'Orbital Launchport', x: city.spaceport.x, z: city.spaceport.z, h: 95 }] : []),
            ...(city.mediaZone ? [{ name: city.mediaZone.name || 'Media Holo-Core', x: city.mediaZone.x, z: city.mediaZone.z, h: 95 }] : []),
          ] : [];
          const match = candidates.find((c) => (c.name || '').toLowerCase().includes(q));
          if (!match) throw new Error(`No landmark/place matching "${input.destinationName}"`);
          enqueueSpotRoute(match, { append: !!input.append });
          queued.push(match.name);
        }
        if (Array.isArray(input.waypoints)) {
          input.waypoints.forEach((wp, idx) => {
            enqueueSpotRoute(
              { name: wp.name || `Waypoint ${idx + 1}`, x: wp.x, z: wp.z, h: wp.y || 80 },
              { append: idx > 0 || !!input.append || queued.length > 0 }
            );
            queued.push(wp.name || `Waypoint ${idx + 1}`);
          });
        }
        return asMcpResult({
          ok: true,
          queued,
          totalQueued: controls && controls.waypoints ? controls.waypoints.length : 0,
          autopilotLoop: controls && Array.isArray(controls.autopilotLoop) ? controls.autopilotLoop : [],
          glide: !!(controls && controls.glide),
        });
      },
    },

    /* ------------------------------------------------------------------ 8 */
    {
      name: 'petacity_run_camera_script',
      description: 'Run or stop a multi-shot cinematography timeline! Each shot supports `dolly` (`from` -> `to`), `orbit` (`center`, `radius`, `startAngle`, `endAngle`), `flyover`, `crane`, `chase` (`followVehicle`), or `static`, with dynamic `lookAt` / `lookAtEntity`, `fov`, `roll`, `ease` (`smooth|easeInOutCubic|linear`), and film edit `transition` (`cut|fade_black|fade_white|dissolve|wipe_left|wipe_right|wipe_up|wipe_down|wipe_diagonal|iris|shutter_bars`) + `transitionDuration`.',
      inputSchema: {
        type: 'object',
        properties: {
          stop: { type: 'boolean', description: 'If true, stop any active camera script and return control to free flight.' },
          loop: { type: 'boolean', description: 'Loop the shot list continuously (default false).' },
          shots: {
            type: 'array',
            description: 'Ordered sequence of camera shots.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string', enum: ['dolly', 'orbit', 'flyover', 'crane', 'chase', 'static'] },
                duration: { type: 'number', minimum: 0.2, maximum: 300, description: 'Shot duration in seconds.' },
                from: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
                to: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
                center: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
                radius: { type: 'number' },
                height: { type: 'number' },
                endHeight: { type: 'number' },
                startAngle: { type: 'number' },
                endAngle: { type: 'number' },
                followVehicle: { type: 'integer', description: 'Vehicle ID to chase.' },
                offset: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
                lookAt: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } } },
                lookAtEntity: {
                  type: 'object',
                  description: 'Aim dynamically at `{ type: "building"|"sign"|"hologram"|"landmark"|"vehicle"|"projection", id }`.',
                  properties: { type: { type: 'string' }, id: { type: ['integer', 'string'] } },
                },
                fov: { type: 'number', minimum: 15, maximum: 150 },
                roll: { type: 'number', description: 'Dutch roll in radians (or pass `rollDeg`).' },
                rollDeg: { type: 'number', description: 'Dutch roll in degrees.' },
                ease: { type: 'string', enum: ['smooth', 'easeInOutCubic', 'linear'] },
                transition: {
                  type: 'string',
                  enum: SCENE_TRANSITION_NAMES,
                  description: 'Edit transition entering this shot (`cut`, `fade_black`, `fade_white`, `dissolve`, `wipe_left`, `wipe_right`, `wipe_up`, `wipe_down`, `wipe_diagonal`, `iris`, `shutter_bars`).',
                },
                transitionDuration: { type: 'number', minimum: 0.08, maximum: 6, description: 'Duration of the edit transition in seconds.' },
                transitionFeather: { type: 'number', minimum: 0.002, maximum: 0.45, description: 'Wipe/iris edge softness.' },
              },
            },
          },
        },
      },
      execute: async (input = {}) => {
        if (input.stop) return asMcpResult(director.stopCameraScript());
        if (input.followVehicle !== undefined && !Array.isArray(input.shots)) {
          return asMcpResult(director.followVehicle(input.followVehicle, input));
        }
        if (input.orbitTarget && !Array.isArray(input.shots)) {
          return asMcpResult(director.orbitTarget(input.orbitTarget, input));
        }
        const normalizedShots = Array.isArray(input.shots)
          ? input.shots.map((sh) => ({
              ...sh,
              roll: Number.isFinite(sh.rollDeg) ? sh.rollDeg : sh.roll,
            }))
          : [];
        return asMcpResult(director.runCameraScript(normalizedShots, { append: !!input.append }));
      },
    },

    /* ------------------------------------------------------------------ 9 */
    {
      name: 'petacity_scene_transition',
      description: 'Execute a cinema edit transition (`cut`, `fade_black`, `fade_white`, `dissolve`, `wipe_left`, `wipe_right`, `wipe_up`, `wipe_down`, `wipe_diagonal`, `iris`, `shutter_bars`) with an optional atomic scene change (`cameraPose`, `applyState`, `presetName`, `bookmarkIndex`, or `newSeed`) performed seamlessly at the edit point!',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: SCENE_TRANSITION_NAMES,
            description: 'Transition type (`cut`, `fade_black`, `fade_white`, `dissolve`, `wipe_left`, `wipe_right`, `wipe_up`, `wipe_down`, `wipe_diagonal`, `iris`, `shutter_bars`).',
          },
          duration: { type: 'number', minimum: 0.08, maximum: 6, description: 'Total transition duration in seconds (default 0.95).' },
          feather: { type: 'number', minimum: 0.002, maximum: 0.45, description: 'Softness of wipe/iris/bar edge (default 0.055).' },
          hold: { type: 'number', minimum: 0, maximum: 0.5, description: 'Fraction of dip-to-black/white spent holding full color at midpoint (default 0.12).' },
          color: { type: 'string', description: 'Optional dip color hex (e.g. `#000000`, `#ffffff`, `#0a1020`) for `fade_black`/`fade_white`.' },
          setAsDefault: { type: 'boolean', description: 'Also save `type` and `duration` as the active HUD default edit transition.' },
          cameraPose: {
            type: 'object',
            description: 'Optional incoming camera pose `{ x, y, z, yaw, pitch, roll, yawDeg, pitchDeg, rollDeg, fov, lookAt }` applied at the transition cut point.',
          },
          applyState: {
            type: 'object',
            description: 'Optional partial world/environment/post state applied atomically at the transition cut point.',
          },
          presetName: { type: 'string', description: 'Optional built-in or user World Preset name to switch to at the cut point.' },
          bookmarkIndex: { type: 'integer', description: 'Optional saved Camera Bookmark index to jump to at the cut point.' },
          newSeed: { type: 'integer', minimum: 1, maximum: 999999999, description: 'Optional new procedural city seed to rebuild at the cut point.' },
        },
      },
      execute: async (input = {}) => {
        const type = input.type || 'dissolve';
        const duration = Number.isFinite(input.duration) ? input.duration : undefined;
        if (input.setAsDefault) {
          applyPartialState({ editTransition: type, transitionDuration: duration });
        }
        const performCut = () => {
          if (input.presetName && managePresetsAndBookmarks) {
            managePresetsAndBookmarks({ action: 'apply_preset', name: input.presetName, skipTransition: true });
          }
          if (Number.isInteger(input.newSeed)) {
            applyPartialState({ seed: input.newSeed });
          }
          if (input.applyState && typeof input.applyState === 'object') {
            applyPartialState(input.applyState);
          }
          if (Number.isInteger(input.bookmarkIndex) && managePresetsAndBookmarks) {
            managePresetsAndBookmarks({ action: 'go_bookmark', index: input.bookmarkIndex, instant: true, skipTransition: true });
          }
          if (input.cameraPose && typeof input.cameraPose === 'object') {
            applyPoseFields(input.cameraPose);
          }
        };
        const res = triggerTransition
          ? triggerTransition({
              type,
              duration,
              feather: input.feather,
              hold: input.hold,
              color: input.color,
              onCut: performCut,
            })
          : (performCut(), { active: false, type: 'cut', duration: 0 });
        return asMcpResult({ ok: true, transition: res, camera: buildPoseSnapshot() });
      },
    },

    /* ----------------------------------------------------------------- 10 */
    {
      name: 'petacity_set_post_and_grade',
      description: 'Configure cinema post-processing, ACES color grading (`bloom`, `lens`, `contrast`, `temp`, `film`), 6 artistic/diagnostic render styles (`cinema`, `xray`, `blueprint`, `sketch`, `watercolor`, `oil`), 10 optical & 360° lens projections, 14 strange-angle presets, and default scene edit transition settings.',
      inputSchema: {
        type: 'object',
        properties: {
          bloom: { type: 'number', minimum: 0, maximum: 2.2, description: 'HDR mip-pyramid bloom strength.' },
          lens: { type: 'number', minimum: 0, maximum: 1.5, description: 'Chromatic aberration & vignette amount.' },
          contrast: { type: 'number', minimum: 0.7, maximum: 1.5, description: 'ACES filmic contrast.' },
          temp: { type: 'number', minimum: -1, maximum: 1, description: 'Color temperature (-1 cool cyan .. +1 warm amber).' },
          film: { type: 'number', minimum: 0, maximum: 1, description: '35mm silver-halide grain & twinkling dust specks.' },
          artStyle: {
            type: ['integer', 'string'],
            description: '0/`cinema`, 1/`xray`, 2/`blueprint`, 3/`sketch`, 4/`watercolor`, 5/`oil`.',
          },
          artStrength: { type: 'number', minimum: 0, maximum: 1.4, description: 'Blend strength of the artistic post style.' },
          fov: { type: 'number', minimum: 15, maximum: 150, description: 'Vertical FOV in degrees.' },
          rollDeg: { type: 'number', minimum: -180, maximum: 180, description: 'Camera Dutch roll in degrees.' },
          lensMode: {
            type: 'integer', minimum: 0, maximum: 9,
            description: '0=Rectilinear, 1=Fisheye180, 2=BarrelCinema, 3=Pincushion, 4=Equirect360, 5=LittlePlanet, 6=CrystalBall, 7=CylindricalPan, 8=DomeMaster, 9=Hyperbolic.',
          },
          lensDistort: { type: 'number', minimum: -1, maximum: 1 },
          lensZoom: { type: 'number', minimum: 0.4, maximum: 2.5 },
          anamorphic: { type: 'number', minimum: 0, maximum: 1 },
          tiltShift: { type: 'number', minimum: 0, maximum: 1 },
          anglePreset: { type: 'integer', minimum: 0, maximum: 13, description: 'Apply one of 14 curated strange-angle & projection presets.' },
          editTransition: { type: 'string', enum: SCENE_TRANSITION_NAMES, description: 'Default edit transition for HUD & preset scene changes.' },
          transitionDuration: { type: 'number', minimum: 0.08, maximum: 6, description: 'Default edit transition duration in seconds.' },
        },
      },
      execute: async (input = {}) => {
        applyPartialState({
          ...input,
          rollDeg: Number.isFinite(input.rollDeg)
            ? input.rollDeg
            : (Number.isFinite(input.roll) ? (input.roll * 180) / Math.PI : undefined),
        });
        return asMcpResult({ ok: true, state: getState() });
      },
    },

    /* ----------------------------------------------------------------- 11 */
    {
      name: 'petacity_manage_presets_and_bookmarks',
      description: 'List, apply, save, or delete curated/user World Presets and Camera Bookmarks; export/import compact `#s=` share URLs or full JSON state; randomize city seed; or show/hide the HUD (`set_hud`). Supports optional cinema edit `transition`!',
      inputSchema: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: [
              'list',
              'apply_preset',
              'save_preset',
              'delete_preset',
              'go_bookmark',
              'add_bookmark',
              'delete_bookmark',
              'export_state',
              'import_state',
              'new_seed',
              'set_hud',
            ],
          },
          name: { type: 'string', description: 'Preset name (for `apply_preset`/`save_preset`) or new bookmark label (for `add_bookmark`).' },
          index: { type: 'integer', description: 'Preset or bookmark index.' },
          tokenOrJson: { type: 'string', description: 'Share URL, `#s=` compact token, or JSON state string for `import_state`.' },
          applyCamera: { type: 'boolean', description: 'Whether `apply_preset` or `import_state` also moves the camera (default true).' },
          instant: { type: 'boolean', description: 'Jump immediately to bookmark instead of smooth fly-in (default false unless transition is set).' },
          transition: { type: 'string', enum: SCENE_TRANSITION_NAMES, description: 'Optional cinema edit transition when switching preset/bookmark/state/seed.' },
          transitionDuration: { type: 'number', minimum: 0.08, maximum: 6 },
          hudVisible: { type: 'boolean', description: 'Show (`true`) or minimize (`false`) the HUD overlay when `action="set_hud"`.' },
        },
      },
      execute: async (input = {}) => {
        if (!managePresetsAndBookmarks) {
          return asMcpResult({ ok: false, error: 'Preset/bookmark manager unavailable in headless test harness' });
        }
        return asMcpResult(managePresetsAndBookmarks(input));
      },
    },

    /* ----------------------------------------------------------------- 12 */
    {
      name: 'petacity_set_performance_quality',
      description: 'Inspect live FPS, frame time, and view-culling statistics, and configure low-end optimization settings: `qualityMode` (`auto` adaptive FPS governor, `low`, `medium`, `high`, `ultra`), `viewCulling` (frustum + distance culling of districts, holograms, street furniture, and vehicles), and `postBypass`.',
      inputSchema: {
        type: 'object',
        properties: {
          qualityMode: {
            type: 'string',
            enum: ['auto', 'low', 'medium', 'high', 'ultra'],
            description: '`auto` dynamically adapts DPR, raymarch steps, bloom, and swarm density to maintain smooth frame rates; `low` targets integrated/mobile GPUs; `ultra` unlocks full fidelity.',
          },
          viewCulling: { type: 'boolean', description: 'Enable/disable 3D frustum & distance view culling.' },
          postBypass: { type: 'boolean', description: 'Bypass HDR bloom/composite post-processor for raw raster speed.' },
          maxDrawDist: { type: 'number', minimum: 600, maximum: 30000, description: 'Optional world object draw distance override in meters.' },
          vehDrawDist: { type: 'number', minimum: 350, maximum: 20000, description: 'Optional traffic vehicle draw distance override in meters.' },
        },
      },
      execute: async (input = {}) => {
        if (setPerformance) {
          return asMcpResult(setPerformance(input));
        }
        applyPartialState({
          qualityMode: input.qualityMode,
          viewCulling: input.viewCulling,
          postBypass: input.postBypass,
        });
        return asMcpResult({ ok: true, performance: getPerformanceStats ? getPerformanceStats() : null });
      },
    },

    /* ----------------------------------------------------------------- 13 */
    {
      name: 'petacity_takeover_building',
      description: 'Take over a specific building (`building`: `"lookingAt"`, `"tallest"`, or integer `buildingId`) on the movie set: control window lights (`mode`: `pulse|strobe|solid|blackout|dim|normal`, `color`), or mount a glowing 4-sided architectural LED window-matrix message (`message`, `subtext`, `scrollSpeed`)!',
      inputSchema: {
        type: 'object',
        properties: {
          building: { type: ['integer', 'string'], description: '`"lookingAt"`, `"tallest"`, or building index.' },
          buildingId: { type: 'integer', minimum: 0, description: 'Alias for `building` index.' },
          mode: { type: 'string', enum: ['normal', 'pulse', 'strobe', 'solid', 'blackout', 'dim', 'off'] },
          color: { type: 'string', description: 'Hex color for window lights & LED text (e.g. `#00ffcc`).' },
          windowColor: { type: 'string', description: 'Alias for `color`.' },
          message: { type: 'string', description: '4-sided scrolling LED facade headline.' },
          bannerText: { type: 'string', description: 'Alias for `message`.' },
          subtext: { type: 'string', description: 'Secondary facade text line.' },
          bannerSubtext: { type: 'string', description: 'Alias for `subtext`.' },
          scrollSpeed: { type: 'number', description: 'Horizontal marquee scroll speed.' },
          heightFraction: { type: 'number', minimum: 0.15, maximum: 0.95 },
          bandHeight: { type: 'number', minimum: 8, maximum: 120 },
          clear: { type: 'boolean', description: 'Clear all building overrides and restore default city appearance.' },
        },
      },
      execute: async (input = {}) => {
        if (input.clear) return asMcpResult(director.clearBuildingOverrides());
        return asMcpResult(director.takeoverBuilding({
          building: input.building ?? input.buildingId ?? 'lookingAt',
          mode: input.mode || 'pulse',
          color: input.color || input.windowColor || '#00f5ff',
          message: input.message ?? input.bannerText ?? null,
          subtext: input.subtext ?? input.bannerSubtext ?? '',
          scrollSpeed: input.scrollSpeed ?? 0.16,
          heightFraction: input.heightFraction ?? 0.76,
          bandHeight: input.bandHeight ?? 22,
        }));
      },
    },

    /* ----------------------------------------------------------------- 14 */
    {
      name: 'petacity_takeover_signage',
      description: 'Take over any existing billboard (`sign`: `"lookingAt"`, `"nearest"`, or integer `signId`), replacing it in-place with high-resolution procedural typography (`text`, `subtext`), neon colors (`color`, `subColor`), and optional scrolling marquee (`scrollSpeed`).',
      inputSchema: {
        type: 'object',
        properties: {
          sign: { type: ['integer', 'string'], description: '`"lookingAt"`, `"nearest"`, or billboard index.' },
          signId: { type: 'integer', minimum: 0, description: 'Alias for `sign` index.' },
          text: { type: 'string', description: 'Headline text to display on the sign.' },
          subtext: { type: 'string', description: 'Optional secondary line.' },
          color: { type: 'string', description: 'Primary neon text hex color (e.g. `#ff4fd8`).' },
          subColor: { type: 'string', description: 'Secondary neon accent hex color.' },
          scrollSpeed: { type: 'number', description: 'Marquee scroll speed (0 = static).' },
          clear: { type: 'boolean', description: 'Remove signage overrides and restore original procedural ads.' },
        },
      },
      execute: async (input = {}) => {
        if (input.clear) return asMcpResult(director.clearSignOverrides());
        return asMcpResult(director.takeoverSignage({
          sign: input.sign ?? input.signId ?? 'lookingAt',
          text: input.text || 'ON AIR',
          subtext: input.subtext ?? '',
          color: input.color || '#ff4fd8',
          subColor: input.subColor || input.borderColor || '#47f5ff',
          scrollSpeed: input.scrollSpeed ?? 0,
        }));
      },
    },

    /* ----------------------------------------------------------------- 15 */
    {
      name: 'petacity_project_hologram',
      description: 'Spawn or remove a custom hologram + physical projector drone pod & terminating light cone (`billboard`/`panel`/`disc` single-sided planar screen fed by emitter pyramid, `diamond`, `cuboctahedron`, `icosahedron`, `knot`, `prism`, or `ring` 3D solid) in front of the camera or locked to follow the drone!',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Projection ID to remove when `remove: true`.' },
          remove: { type: 'boolean', description: 'If true, remove projection `id` (or clear all if `id` omitted).' },
          text: { type: 'string', description: 'Headline text projected in the hologram.' },
          subtext: { type: 'string', description: 'Secondary text line.' },
          shape: {
            type: 'string',
            enum: ['billboard', 'panel', 'disc', 'diamond', 'cuboctahedron', 'icosahedron', 'knot', 'prism', 'ring'],
            description: 'Hologram geometry (`billboard`/`panel`/`disc` single-sided plane + emitter pyramid; `diamond`/`cuboctahedron`/`icosahedron`/`knot`/`prism`/`ring` 3D solids).',
          },
          color: { type: 'string', description: 'Primary hologram hex color (e.g. `#44f2ff`).' },
          subColor: { type: 'string', description: 'Secondary accent hex color.' },
          distance: { type: 'number', minimum: 4, maximum: 600, description: 'Distance in front of camera in meters (default 36).' },
          offsetRight: { type: 'number', description: 'Horizontal offset in meters.' },
          offsetUp: { type: 'number', description: 'Vertical offset in meters.' },
          width: { type: 'number', minimum: 2, maximum: 400, description: 'Projection width in meters.' },
          height: { type: 'number', minimum: 2, maximum: 400, description: 'Projection height in meters.' },
          followCamera: { type: 'boolean', description: 'Keep hologram locked in formation ahead of the camera.' },
          spinSpeed: { type: 'number', minimum: -6, maximum: 6, description: 'Continuous 3D spin speed in rad/s.' },
        },
      },
      execute: async (input = {}) => {
        if (input.remove) {
          if (input.id) return asMcpResult({ ok: director.removeProjection(input.id), removed: input.id });
          return asMcpResult(director.clearProjections());
        }
        return asMcpResult(director.projectInFrontOfCamera(input));
      },
    },

    /* ----------------------------------------------------------------- 16 */
    {
      name: 'petacity_control_vehicle',
      description: 'Direct hero vehicles (`vehicle`: `"nearest"`, `"lookingAt"`, `"car"`, `"spinner"`, `"train"`, or integer `vehicleId`) across the city: `parkInFrontOfCamera`, `circleCamera`, follow 3D `waypoints` (`[[x,y,z], ...]`), set `headlights` (`"on"|"off"|"glow-only"`), `color`, `speed`, `follow` with chase-cam, or `release`!',
      inputSchema: {
        type: 'object',
        properties: {
          vehicle: { type: ['integer', 'string'], description: '`"nearest"`, `"lookingAt"`, `"car"`, `"spinner"`, `"train"`, or vehicle ID.' },
          vehicleId: { type: 'integer', minimum: 0, description: 'Alias for `vehicle` index.' },
          release: { type: 'boolean', description: 'Release hero vehicle(s) back to ambient traffic.' },
          parkInFrontOfCamera: { type: 'boolean', description: 'Stage vehicle directly in front of the camera.' },
          circleCamera: { type: ['boolean', 'object'], description: 'Orbit vehicle smoothly around the camera.' },
          position: { type: 'array', items: { type: 'number' }, description: 'Explicit `[x, y, z]` world coordinates.' },
          waypoints: {
            type: 'array',
            description: '3D path `[[x, y, z], ...]` or `[{ x, y, z }, ...]` for the hero vehicle.',
            items: { type: ['array', 'object'] },
          },
          loopWaypoints: { type: 'boolean', description: 'Loop waypoints (default true).' },
          speed: { type: 'number', minimum: 0, maximum: 400, description: 'Speed in m/s.' },
          freeze: { type: 'boolean', description: 'Freeze/hover vehicle in place.' },
          headlights: { type: ['string', 'number'], description: '`"on"`, `"off"`, `"glow-only"`, or numeric intensity.' },
          color: { type: 'string', description: 'Custom emissive hex color (e.g. `#ff2a6d`).' },
          yaw: { type: 'number' },
          follow: { type: 'boolean', description: 'Attach pursuit chase-cam to this vehicle.' },
        },
      },
      execute: async (input = {}) => {
        const targetVeh = input.vehicle ?? input.vehicleId;
        if (input.release) {
          return asMcpResult(director.releaseVehicle(targetVeh ?? null));
        }
        const normWaypoints = Array.isArray(input.waypoints)
          ? input.waypoints.map((w) => (Array.isArray(w) ? w : [w.x || 0, w.y ?? 1.2, w.z || 0]))
          : null;
        const normPos = Array.isArray(input.position)
          ? input.position
          : (input.position && typeof input.position === 'object' ? [input.position.x || 0, input.position.y || 1.2, input.position.z || 0] : null);
        const res = director.controlVehicle({
          ...input,
          vehicle: targetVeh ?? 'nearest',
          position: normPos,
          waypoints: normWaypoints,
        });
        if (input.follow && res && Number.isFinite(res.vehicleId)) {
          director.followVehicle(res.vehicleId);
        }
        return asMcpResult(res);
      },
    },

    /* ----------------------------------------------------------------- 17 */
    {
      name: 'petacity_set_environment',
      description: 'Adjust any world, architecture, custom palette, terrain, nature, water, sky, 3-deck volumetric clouds, weather, lighting, signage, hologram, or moving-object trail dial at runtime. Rebuilds geometry automatically only when structural city parameters (`seed`, `radius`, `suburbReach`, `terrainMode`, `waterMode`, `treeMode`, etc.) change.',
      inputSchema: {
        type: 'object',
        properties: {
          seed: { type: 'integer', minimum: 1, maximum: 999999999, description: 'Procedural city seed.' },
          look: {
            type: 'string',
            enum: ['bladerunner', 'realistic', 'anime', 'abstract', 'tron', 'outrun', 'clay', 'metropolis', 'custom'],
          },
          tint: { type: 'number', minimum: 0, maximum: 1, description: 'Palette adherence (`1` = closely faithful to the look palette .. `0` = natural materials & wider chromatic excursion).' },
          colorVar: { type: 'number', minimum: 0, maximum: 1.2, description: 'Cross-palette swatch borrowing & color variation (`0` = uniform swatches .. `1.2` = rich intra-palette & spectral variation).' },
          customPalette: {
            type: 'object',
            description: 'Custom look palette colors & shader style (automatically switches `look` to `custom` if `activate: true`).',
            properties: {
              activate: { type: 'boolean' },
              seedFromLook: { type: 'string', description: 'Copy baseline colors from an existing look ID first.' },
              zen: { type: 'string', description: 'Sky zenith hex color.' },
              hor: { type: 'string', description: 'Horizon & fog hex color.' },
              base: { type: 'string', description: 'Tower mass hex color.' },
              win: { type: 'string', description: 'Warm window hex color.' },
              accent: { type: 'string', description: 'Primary neon accent hex color.' },
              sec: { type: 'string', description: 'Secondary accent hex color.' },
              style: { type: 'integer', minimum: 0, maximum: 6, description: '0=PBR, 1=Cel/Anime, 2=Abstract, 3=TronGrid, 4=Synthwave, 5=MatteClay, 6=NoirDeco.' },
              mono: { type: 'boolean', description: 'Monochrome silver-screen mode.' },
            },
          },
          radius: { type: 'integer', minimum: 2, maximum: 22, description: 'City core radius in grid blocks (default 5).' },
          suburbReach: { type: 'number', minimum: 0, maximum: 3, description: 'Suburban sprawl reach multiplier.' },
          worldCurve: { type: 'number', minimum: 0, maximum: 1, description: 'Planetary horizon curvature (`0` flat .. `1` asteroid).' },
          heightScale: { type: 'number', minimum: 0.35, maximum: 2.6, description: 'Vertical skyscraper height multiplier.' },
          terrainMode: { type: 'integer', minimum: 0, maximum: 4, description: '0=Flat, 1=Hills, 2=CoastalRidge, 3=HighlandBasin, 4=MesaCanyon.' },
          terrainScale: { type: 'number', minimum: 0, maximum: 2.5, description: 'Terrain elevation relief.' },
          treeMode: { type: 'integer', minimum: 0, maximum: 6, description: '0=Mixed, 1=LushCanopy, 2=Pine, 3=Palm, 4=CherryAutumn, 5=Biolum, 6=None.' },
          vegCover: { type: 'number', minimum: 0, maximum: 2, description: 'Foliage coverage.' },
          vegScale: { type: 'number', minimum: 0.4, maximum: 2.4, description: 'Tree canopy size.' },
          waterMode: { type: 'integer', minimum: 0, maximum: 4, description: '0=None, 1=Harbor, 2=River, 3=Archipelago, 4=Canals.' },
          waterAmount: { type: 'number', minimum: 0.2, maximum: 2, description: 'Water coverage / river & canal width.' },
          shoreDist: { type: 'number', minimum: 0.35, maximum: 1.8, description: 'Harbor shoreline setback.' },
          waterShader: { type: 'integer', minimum: 0, maximum: 4, description: '0=Realistic, 1=Toon, 2=NeonSynth, 3=CalmMirror, 4=StormOcean.' },
          waterWave: { type: 'number', minimum: 0.2, maximum: 4 },
          waterChop: { type: 'number', minimum: 0, maximum: 2.5 },
          waterFoam: { type: 'number', minimum: 0, maximum: 2.5 },
          waterRefl: { type: 'number', minimum: 0, maximum: 2.5 },
          waterContrast: { type: 'number', minimum: 0, maximum: 1 },
          waterWarp: { type: 'number', minimum: 0, maximum: 2 },
          time: { type: 'number', minimum: 0, maximum: 24, description: 'Solar clock hour (`0..24`).' },
          dayCycle: { type: 'boolean', description: 'Run/pause continuous 24h solar & lunar cycle.' },
          daySpeed: { type: 'number', minimum: 0.05, maximum: 5, description: '24h cycle speed multiplier.' },
          sun: { type: 'number', minimum: 0, maximum: 2, description: 'Sun & dusk warmth intensity.' },
          vib: { type: 'number', minimum: 0, maximum: 2, description: 'Color vibrancy.' },
          moon: { type: 'number', minimum: 0, maximum: 2.5, description: 'Moonlight & starfield brightness.' },
          moonsz: { type: 'number', minimum: 0.25, maximum: 3.5, description: 'Lunar disc size.' },
          moonph: { type: 'number', minimum: 0, maximum: 2, description: 'Moon phase (0=New, 0.5=Crescent, 1.0=Full, 1.5=Waning).' },
          weatherMode: { type: 'integer', minimum: 0, maximum: 6, description: '0=Clear, 1=Rain, 2=Storm, 3=Snow, 4=Ash, 5=Dust, 6=Film.' },
          weatherAutoMode: { type: 'string', enum: ['off', 'seq', 'shuffle', 'cinematic'] },
          weatherInterval: { type: 'integer', minimum: 15, maximum: 240 },
          dust: { type: 'number', minimum: 0, maximum: 2, description: 'Precipitation / particulate density.' },
          fog: { type: 'number', minimum: 0, maximum: 2.5 },
          haze: { type: 'number', minimum: 0, maximum: 2 },
          clouds: { type: 'number', minimum: 0, maximum: 2.4, description: 'Master cloud cover (`0` = crystal-clear sky).' },
          cloudPuffs: { type: 'number', minimum: 0, maximum: 2, description: 'Foreground cumulus puff deck (`0` = off).' },
          cloudType: { type: 'integer', minimum: 0, maximum: 5, description: '0=Cumulus, 1=Stratus, 2=Cirrus, 3=Cumulonimbus, 4=Lenticular, 5=Turbulent.' },
          cloudStyle: { type: 'integer', minimum: 0, maximum: 6, description: '0=Volumetric, 1=FilmGrain, 2=Streaks, 3=Flow, 4=Spray, 5=Drybrush, 6=InkHatch.' },
          cloudSeed: { type: 'number', minimum: 0, maximum: 100 },
          cloudEvol: { type: 'number', minimum: 0, maximum: 2.5 },
          cloudLac: { type: 'number', minimum: 1.4, maximum: 3.2 },
          cloudElev: { type: 'number', minimum: 0.05, maximum: 2.4 },
          cloudRange: { type: 'number', minimum: 0.3, maximum: 3 },
          cloudLayer: { type: 'integer', minimum: 0, maximum: 7, description: 'Cloud deck preset: 0=Low, 1=Mid, 2=High, 3=Low+Mid, 4=Mid+High, 5=Low+High, 6=AllThree, 7=Custom.' },
          cloudLayerElev: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Per-deck altitudes `[low, mid, high]`.' },
          cloudLayerThick: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Per-deck thicknesses `[low, mid, high]`.' },
          cloudLayerDens: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'Per-deck densities `[low, mid, high]` (`0` turns deck off).' },
          windAngle: { type: 'number', minimum: 0, maximum: 360 },
          windStrength: { type: 'number', minimum: 0, maximum: 2.5 },
          win: { type: 'number', minimum: 0, maximum: 2, description: 'Interior window density.' },
          glow: { type: 'number', minimum: 0, maximum: 2.5, description: 'Neon & emissive glow.' },
          lights: { type: 'number', minimum: 0, maximum: 2.5, description: 'Master urban light brightness.' },
          lampDensity: { type: 'number', minimum: 0, maximum: 2, description: 'Streetlight & park lamp density.' },
          searchLight: { type: 'number', minimum: 0, maximum: 2.5, description: 'Sky searchlight beam intensity.' },
          searchCount: { type: 'number', minimum: 0, maximum: 2, description: 'Sky searchlight count multiplier.' },
          trafficLight: { type: 'number', minimum: 0, maximum: 2.5, description: 'Intersection signal brightness.' },
          sigDensity: { type: 'number', minimum: 0, maximum: 1.5, description: 'Intersection signal density.' },
          vehLight: { type: 'number', minimum: 0, maximum: 2.5, description: 'Vehicle & ship headlight intensity.' },
          traffic: { type: 'integer', minimum: 0, maximum: 20000, description: 'Ambient vehicle count (`0..20000`).' },
          trafficSpeed: { type: 'number', minimum: 0, maximum: 3, description: 'Traffic & transit speed multiplier.' },
          transitAmt: { type: 'number', minimum: 0, maximum: 2, description: 'Elevated/surface rail transit density (`0` = off).' },
          maritimeAmt: { type: 'number', minimum: 0, maximum: 2, description: 'Harbor ship & boat count (`0` = off).' },
          airAmt: { type: 'number', minimum: 0, maximum: 2, description: 'Spaceport, rocket & aircraft density (`0` = off).' },
          signAmt: { type: 'number', minimum: 0, maximum: 2, description: 'Rooftop/facade signage density (`0` = off).' },
          megaWrap: { type: 'number', minimum: 0, maximum: 2, description: 'Skyscraper wraparound mega-ad frequency (`0` = off).' },
          glyphStyle: { type: 'integer', minimum: 0, maximum: 2, description: '0=MixedScripts, 1=GeometricGlyphs, 2=Minimal.' },
          signAnim: { type: 'number', minimum: 0, maximum: 2.5, description: 'Billboard animation speed.' },
          holoDensity: { type: 'number', minimum: 0, maximum: 2.5, description: '3D hologram & projector count (`0` = off).' },
          holoScale: { type: 'number', minimum: 0.35, maximum: 2.2, description: 'Hologram projection scale.' },
          holoScan: { type: 'number', minimum: 0, maximum: 2.5, description: 'Hologram scanline & flicker intensity.' },
          trailMode: {
            type: 'integer', minimum: 0, maximum: 5,
            description: '0=Off, 1=HeroShips&Trains, 2=Aircraft&Trains, 3=FastTraffic, 4=DenseTraffic, 5=AllMovingObjects.',
          },
          trailLength: { type: 'number', minimum: 0, maximum: 2.5, description: 'Moving-object light-ribbon trail length (`0` = off).' },
          transition: { type: 'string', enum: SCENE_TRANSITION_NAMES, description: 'Optional cinema edit transition around this environment change.' },
          transitionDuration: { type: 'number', minimum: 0.08, maximum: 6 },
        },
      },
      execute: async (input = {}) => {
        if (input.transition && input.transition !== 'cut' && triggerTransition) {
          triggerTransition({
            type: input.transition,
            duration: input.transitionDuration,
            onCut: () => applyPartialState(input),
          });
        } else {
          applyPartialState(input);
        }
        return asMcpResult({ ok: true, state: getState() });
      },
    },

    /* ----------------------------------------------------------------- 18 */
    {
      name: 'petacity_control_music',
      description: 'Control the pure-software generative WebAudio synthesizer radio, Auto-DJ & Music-to-Environment choreography: play/pause, pick any of the 14 original evolving stations (`0..13` or `stationName`), crossfade next, reseed melodies, configure Auto-DJ (`loop`, `seq`, `shuffle`), and map musical elements onto the environment (`syncPreset`, `syncStrength`, `syncTraffic` BPM->traffic tempo, `syncClouds` chord->cloud shifts, `syncDiurnal` chord->sky cycle, `syncLights` beat->city lights/holos, `syncAtmo` movement->bloom/haze).',
      inputSchema: {
        type: 'object',
        properties: {
          playing: { type: 'boolean', description: 'Start (`true`) or pause (`false`) the generative synth engine.' },
          station: {
            type: 'integer',
            minimum: 0,
            maximum: 13,
            description: '0=Rain on Neon Glass, 1=Velvet Sub-Level, 2=Midnight Monorail, 3=Sodium & Mercury, 4=Foghorn & Starlight, 5=Hanging Sky-Gardens, 6=Cobalt Atrium, 7=Orbital Shipyard, 8=Sunset Overpass, 9=Clockwork Observatory, 10=Subterranean Arcade, 11=Glacier & Monolith, 12=Monsoon Market, 13=Solar Sail Serenata.',
          },
          stationName: { type: 'string', description: 'Optional case-insensitive station name or id substring to select.' },
          next: { type: 'boolean', description: 'Crossfade to the next station in the playlist.' },
          prev: { type: 'boolean', description: 'Crossfade to the previous station in the playlist.' },
          reseed: { type: 'boolean', description: 'Generate a fresh melodic/harmonic seed.' },
          playlistMode: { type: 'string', enum: ['loop', 'seq', 'shuffle'], description: 'Auto-DJ station progression mode.' },
          playlistInterval: { type: 'integer', minimum: 20, maximum: 240, description: 'Seconds per station before Auto-DJ crossfade.' },
          volume: { type: 'number', minimum: 0, maximum: 1 },
          space: { type: 'number', minimum: 0, maximum: 1.5, description: 'Algorithmic hall reverb space.' },
          warmth: { type: 'number', minimum: 0, maximum: 1.5, description: 'Filter & tape saturation warmth.' },
          pulse: { type: 'number', minimum: 0, maximum: 1.5, description: 'Arpeggiator & rhythmic drive.' },
          react: { type: 'number', minimum: 0, maximum: 1.5, description: 'Camera altitude/speed & weather audio reactivity.' },
          syncPreset: {
            type: 'string',
            enum: ['off', 'all', 'kinetic', 'sky', 'subtle', 'custom'],
            description: 'Music -> Environment mapping preset (`all` enables all 5 couplings; `off` disables).',
          },
          syncStrength: { type: 'number', minimum: 0, maximum: 1.5, description: 'Music -> Environment coupling intensity (0 = off .. 1.5 = dramatic).' },
          syncTraffic: { type: 'boolean', description: 'Match vehicle & transit traffic speed to musical BPM & beat pulse.' },
          syncClouds: { type: 'boolean', description: 'Shift volumetric cloud formations & drift on musical chord changes.' },
          syncDiurnal: { type: 'boolean', description: 'Glide diurnal sun/moon cycle forward on musical chord changes.' },
          syncLights: { type: 'boolean', description: 'Pulse city windows, neon signs, searchlights & holograms with musical beat & spectrum.' },
          syncAtmo: { type: 'boolean', description: 'Couple atmospheric bloom & color warmth to musical movements & chord brightness.' },
        },
      },
      execute: async (input = {}) => {
        if (!radio) throw new Error('Generative synth radio unavailable');
        if (typeof input.stationName === 'string' && input.stationName.trim() && Array.isArray(RADIO_STATIONS)) {
          const q = input.stationName.trim().toLowerCase();
          const idx = RADIO_STATIONS.findIndex((s) => s.id.includes(q) || s.name.toLowerCase().includes(q));
          if (idx >= 0) radio.setStation(idx);
        } else if (Number.isInteger(input.station)) {
          radio.setStation(input.station);
        }
        if (input.next) radio.nextStation({ smooth: radio.playing });
        if (input.prev) radio.prevStation({ smooth: radio.playing });
        if (input.reseed) radio.reseed();
        if (input.playlistMode !== undefined || input.playlistInterval !== undefined) {
          radio.setPlaylist({ mode: input.playlistMode, interval: input.playlistInterval });
        }
        radio.setParams({
          volume: input.volume,
          space: input.space,
          warmth: input.warmth,
          pulse: input.pulse,
          cityReact: input.react,
        });
        if (input.playing === true && !radio.playing) radio.start();
        else if (input.playing === false && radio.playing) radio.stop();
        const effStIdx = radio.effectiveStationIndex ?? radio.stationIndex;
        const effSt = RADIO_STATIONS[effStIdx] || radio.station;
        applyPartialState({
          radioStation: effStIdx,
          radioPlaying: input.playing,
          playlistMode: radio.playlistMode,
          playlistInterval: radio.playlistInterval,
          radioVol: input.volume,
          radioSpace: input.space,
          radioWarmth: input.warmth,
          radioPulse: input.pulse,
          radioReact: input.react,
          musicSyncPreset: input.syncPreset,
          musicSyncStrength: input.syncStrength,
          musicSyncTraffic: input.syncTraffic,
          musicSyncClouds: input.syncClouds,
          musicSyncDiurnal: input.syncDiurnal,
          musicSyncLights: input.syncLights,
          musicSyncAtmo: input.syncAtmo,
        });
        const full = typeof getFullState === 'function' ? getFullState() : null;
        return asMcpResult({
          ok: true,
          playing: radio.playing,
          stationIndex: effStIdx,
          station: effSt ? effSt.name : null,
          bpm: effSt ? effSt.bpm : null,
          playlistMode: radio.playlistMode,
          playlistInterval: radio.playlistInterval,
          worldSync: full && full.radio ? {
            syncPreset: full.radio.syncPreset,
            syncStrength: full.radio.syncStrength,
            syncTraffic: full.radio.syncTraffic,
            syncClouds: full.radio.syncClouds,
            syncDiurnal: full.radio.syncDiurnal,
            syncLights: full.radio.syncLights,
            syncAtmo: full.radio.syncAtmo,
          } : null,
          telemetry: typeof radio.getMusicalTelemetry === 'function' ? radio.getMusicalTelemetry() : null,
        });
      },
    },

    /* ----------------------------------------------------------------- 19 */
    {
      name: 'petacity_capture_media',
      description: 'Capture high-resolution clean PNG stills (`720p`, `1080p`, `1440p`, `4k`), start/stop live WebM/MP4 video recording, or record/keyframe/smooth/scrub/play/import/export spline camera flight paths!',
      inputSchema: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: [
              'snapshot_png',
              'start_video',
              'stop_video',
              'start_path_record',
              'stop_path_record',
              'add_keyframe',
              'smooth_path',
              'play_path',
              'pause_path',
              'seek_path',
              'set_path_loop',
              'clear_path',
              'export_path_json',
              'import_path_json',
            ],
          },
          resolution: { type: 'string', enum: ['viewport', '720p', '1080p', '1440p', '4k'], description: 'Target render resolution (default `1080p`).' },
          fps: { type: 'integer', enum: [24, 30, 60], description: 'Video capture frame rate (default 60).' },
          includeAudio: { type: 'boolean', description: 'Mux pure-code synth soundtrack into video capture (default true).' },
          smoothAmount: { type: 'number', minimum: 0, maximum: 1, description: 'Spline smoothing strength for `smooth_path` (default 0.65).' },
          seekTimeSec: { type: 'number', minimum: 0, description: 'Playhead time in seconds for `seek_path`.' },
          seekNormalized: { type: 'number', minimum: 0, maximum: 1, description: 'Normalized `0..1` scrub position for `seek_path`.' },
          loop: { type: 'boolean', description: 'Loop flag for `set_path_loop` or `play_path`.' },
          pathJson: { type: ['object', 'string'], description: 'Camera path JSON object or string for `import_path_json`.' },
        },
      },
      execute: async (input) => {
        const act = input.action;
        if (act === 'snapshot_png') {
          if (!exporter) throw new Error('Exporter unavailable');
          const res = input.resolution || '1080p';
          const info = await exporter.captureStillPNG(res, `petacity-agent-${Date.now()}-${res}.png`);
          return asMcpResult({ ok: true, action: act, ...info });
        }
        if (act === 'start_video') {
          if (!exporter) throw new Error('Exporter unavailable');
          const audioStream = (input.includeAudio !== false && radio)
            ? radio.getAudioStream({ autoStart: true })
            : null;
          const info = exporter.startVideoCapture({
            resolution: input.resolution || '1080p',
            fps: input.fps || 60,
            quality: 'ultra',
            codec: 'auto',
            audioStream,
            filename: `petacity-agent-${Date.now()}.webm`,
          });
          return asMcpResult({ ok: true, action: act, ...info });
        }
        if (act === 'stop_video') {
          if (!exporter) throw new Error('Exporter unavailable');
          const info = await exporter.stopVideoCapture();
          return asMcpResult({ ok: true, action: act, ...(info || {}) });
        }
        if (!recorder) throw new Error('Path recorder unavailable');
        if (act === 'start_path_record') {
          recorder.startRecording(camera);
          return asMcpResult({ ok: true, recording: recorder.recording });
        }
        if (act === 'stop_path_record') {
          recorder.stopRecording(camera);
          return asMcpResult({ ok: true, recording: recorder.recording, keyframes: recorder.count, duration: +recorder.duration.toFixed(2) });
        }
        if (act === 'add_keyframe') {
          recorder.addKeyframe(camera);
          return asMcpResult({ ok: true, keyframes: recorder.count, duration: +recorder.duration.toFixed(2) });
        }
        if (act === 'smooth_path') {
          recorder.smoothPath(input.smoothAmount ?? 0.65);
          return asMcpResult({ ok: true, keyframes: recorder.count, duration: +recorder.duration.toFixed(2) });
        }
        if (act === 'play_path') {
          if (typeof input.loop === 'boolean') recorder.loop = input.loop;
          recorder.play();
          return asMcpResult({ ok: true, playing: recorder.playing, loop: recorder.loop, duration: +recorder.duration.toFixed(2) });
        }
        if (act === 'pause_path') {
          recorder.pause();
          if (controls) controls.syncFromCamera();
          return asMcpResult({ ok: true, playing: recorder.playing });
        }
        if (act === 'seek_path') {
          if (!recorder.hasPath) throw new Error('No recorded camera path to seek');
          if (recorder.playing) recorder.pause();
          const tSec = Number.isFinite(input.seekTimeSec)
            ? input.seekTimeSec
            : (Number.isFinite(input.seekNormalized) ? input.seekNormalized * recorder.duration : 0);
          recorder.applyAt(Math.max(0, Math.min(recorder.duration, tSec)), camera, controls);
          return asMcpResult({ ok: true, playheadSec: +recorder.playhead.toFixed(2), camera: buildPoseSnapshot() });
        }
        if (act === 'set_path_loop') {
          recorder.loop = input.loop !== undefined ? !!input.loop : !recorder.loop;
          return asMcpResult({ ok: true, loop: recorder.loop });
        }
        if (act === 'clear_path') {
          recorder.clear();
          return asMcpResult({ ok: true, keyframes: 0 });
        }
        if (act === 'export_path_json') {
          return asMcpResult({ ok: true, path: recorder.toJSON() });
        }
        if (act === 'import_path_json') {
          const obj = typeof input.pathJson === 'string' ? JSON.parse(input.pathJson) : input.pathJson;
          const ok = recorder.fromJSON(obj);
          if (!ok) throw new Error('Invalid camera path JSON payload');
          return asMcpResult({ ok: true, keyframes: recorder.count, duration: +recorder.duration.toFixed(2) });
        }
        throw new Error(`Unknown capture action: ${act}`);
      },
    },

    /* ----------------------------------------------------------------- 20 */
    {
      name: 'petacity_reset_movie_set',
      description: 'Clear all Movie-Set overrides (building takeovers, custom signage, holograms, hero vehicles, and scripted camera shots) and restore the clean procedural city.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        director.stopCameraScript();
        director.clearBuildingOverrides();
        director.clearSignOverrides();
        director.clearProjections();
        director.releaseVehicle(null);
        return asMcpResult({ ok: true, status: director.getStatus() });
      },
    },
  ];

  for (const t of tools) registeredTools.set(t.name, t);

  /* ==========================================================================
   * 1) Native W3C WebMCP registration (`navigator.modelContext`) + polyfill
   * ======================================================================== */
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav) {
    if (!nav.modelContext) {
      const polyfillTools = new Map();
      nav.modelContext = {
        __petacityPolyfill: true,
        protocolVersion: WEBMCP_PROTOCOL_VERSION,
        registerTool(toolDef) {
          if (!toolDef || !toolDef.name) throw new Error('Tool definition requires a name');
          polyfillTools.set(toolDef.name, toolDef);
          return { unregister: () => polyfillTools.delete(toolDef.name) };
        },
        unregisterTool(name) {
          return polyfillTools.delete(name);
        },
        provideContext(ctx = {}) {
          polyfillTools.clear();
          if (Array.isArray(ctx.tools)) {
            for (const t of ctx.tools) polyfillTools.set(t.name, t);
          }
        },
        clearContext() {
          polyfillTools.clear();
        },
        listTools() {
          return Array.from(polyfillTools.values()).map(({ name, description, inputSchema, annotations }) => ({
            name, description, inputSchema, annotations,
          }));
        },
        async callTool(name, args = {}) {
          const t = polyfillTools.get(name);
          if (!t) return asMcpError(new Error(`Unknown WebMCP tool: ${name}`));
          try {
            return await t.execute(args || {});
          } catch (err) {
            return asMcpError(err);
          }
        },
      };
    }

    const mc = nav.modelContext;
    if (typeof mc.registerTool === 'function') {
      for (const t of tools) {
        try {
          if (typeof mc.unregisterTool === 'function') {
            try { mc.unregisterTool(t.name); } catch { /* ignore if not registered */ }
          }
          mc.registerTool({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: t.annotations,
            execute: async (args) => {
              try {
                return await t.execute(args || {});
              } catch (err) {
                return asMcpError(err);
              }
            },
          });
        } catch {
          /* tolerate partial browser implementations */
        }
      }
    } else if (typeof mc.provideContext === 'function') {
      try { mc.provideContext({ tools }); } catch { /* ignore */ }
    }
  }

  /* ==========================================================================
   * 2) Ergonomic In-Page SDK (`window.petacity`) & postMessage JSON-RPC Bridge
   * ======================================================================== */
  async function invokeTool(name, args = {}) {
    const t = registeredTools.get(name);
    if (!t) throw new Error(`Unknown Petacity WebMCP tool "${name}"`);
    const res = await t.execute(args || {});
    if (res && res.isError) {
      throw new Error((res.structuredContent && res.structuredContent.error) || 'Tool error');
    }
    return res && res.structuredContent !== undefined ? res.structuredContent : res;
  }

  const sdk = {
    version: WEBMCP_PROTOCOL_VERSION,
    catalog: PETACITY_CONTROL_CATALOG,
    director,
    listTools() {
      return tools.map(({ name, description, inputSchema, annotations }) => ({
        name, description, inputSchema, annotations,
      }));
    },
    callTool: invokeTool,
    status: () => invokeTool('petacity_get_world_status', {}),
    fullState: (opts = {}) => invokeTool('petacity_get_full_control_state', opts),
    lookAtRay: (opts = {}) => invokeTool('petacity_what_am_i_looking_at', opts),
    whatAmILookingAt: (opts = {}) => invokeTool('petacity_what_am_i_looking_at', opts),
    entities: (opts = {}) => invokeTool('petacity_list_entities', opts),
    setCamera: (opts = {}) => invokeTool('petacity_set_camera_pose', opts),
    stepPilot: (opts = {}) => invokeTool('petacity_step_pilot', opts),
    autopilot: (opts = {}) => invokeTool('petacity_autopilot_route', opts),
    runScript: (opts = {}) => invokeTool('petacity_run_camera_script', opts),
    transition: (opts = {}) => invokeTool('petacity_scene_transition', opts),
    setGrade: (opts = {}) => invokeTool('petacity_set_post_and_grade', opts),
    presets: (opts = {}) => invokeTool('petacity_manage_presets_and_bookmarks', opts),
    setPerformance: (opts = {}) => invokeTool('petacity_set_performance_quality', opts),
    takeoverBuilding: (opts) => invokeTool('petacity_takeover_building', opts),
    takeoverSign: (opts) => invokeTool('petacity_takeover_signage', opts),
    takeoverSignage: (opts) => invokeTool('petacity_takeover_signage', opts),
    projectHologram: (opts = {}) => invokeTool('petacity_project_hologram', opts),
    projectInFrontOfCamera: (opts = {}) => invokeTool('petacity_project_hologram', opts),
    controlVehicle: (opts) => invokeTool('petacity_control_vehicle', opts),
    setEnvironment: (opts = {}) => invokeTool('petacity_set_environment', opts),
    controlMusic: (opts = {}) => invokeTool('petacity_control_music', opts),
    music: (opts = {}) => invokeTool('petacity_control_music', opts),
    capture: (opts) => invokeTool('petacity_capture_media', opts),
    reset: () => invokeTool('petacity_reset_movie_set', {}),
  };

  if (typeof window !== 'undefined') {
    window.petacity = sdk;

    window.addEventListener('message', async (ev) => {
      const msg = ev && ev.data;
      if (!msg || typeof msg !== 'object') return;

      // Support both `petacity:mcp:*` and JSON-RPC `target: 'petacity-webmcp'` envelopes
      if (msg.type === 'petacity:mcp:list') {
        try {
          ev.source?.postMessage?.({
            type: 'petacity:mcp:result',
            id: msg.id ?? null,
            ok: true,
            tools: sdk.listTools(),
            protocolVersion: WEBMCP_PROTOCOL_VERSION,
          }, '*');
        } catch { /* ignore */ }
        return;
      }
      if (msg.type === 'petacity:mcp:call') {
        try {
          const result = await invokeTool(msg.tool, msg.args || {});
          ev.source?.postMessage?.({
            type: 'petacity:mcp:result',
            id: msg.id ?? null,
            tool: msg.tool,
            ok: true,
            result,
          }, '*');
        } catch (err) {
          ev.source?.postMessage?.({
            type: 'petacity:mcp:result',
            id: msg.id ?? null,
            tool: msg.tool,
            ok: false,
            error: (err && err.message) || String(err),
          }, '*');
        }
        return;
      }

      if (msg.target !== 'petacity-webmcp') return;
      const reply = (payload) => {
        try {
          if (ev.source && typeof ev.source.postMessage === 'function') {
            ev.source.postMessage({ source: 'petacity-webmcp', id: msg.id ?? null, ...payload }, '*');
          }
        } catch {
          /* ignore cross-origin restrictions */
        }
      };
      try {
        if (msg.method === 'tools/list') {
          reply({ result: { tools: sdk.listTools(), protocolVersion: WEBMCP_PROTOCOL_VERSION } });
        } else if (msg.method === 'tools/call') {
          const p = msg.params || {};
          const t = registeredTools.get(p.name);
          if (!t) {
            reply({ error: { code: -32601, message: `Unknown tool: ${p.name}` } });
            return;
          }
          const result = await t.execute(p.arguments || {});
          reply({ result });
        } else {
          reply({ error: { code: -32601, message: `Unsupported method: ${msg.method}` } });
        }
      } catch (err) {
        reply({ error: { code: -32000, message: (err && err.message) || String(err) } });
      }
    });
  }

  return sdk;
}
