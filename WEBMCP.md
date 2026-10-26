# Petacity — WebMCP & AI Movie-Set Director Guide

Petacity exposes its entire 3D procedural world, camera rig, raycast perception engine, skyscraper lighting, 4-sided LED building facade displays, billboards, volumetric holo-projectors, vehicle fleet, weather, water shaders, and generative music to **AI Agents and scripts** as a **programmable movie set**.

---

## 1. Three Ways to Connect

### A. W3C / Chrome WebMCP (`navigator.modelContext`)
On startup, `registerPetacityWebMCP` (`src/webmcp.js`) registers all **20 JSON-Schema-typed tools** with `navigator.modelContext` (`registerTool` / `provideContext`). Any WebMCP-capable browser agent can discover and invoke `petacity_*` tools natively with zero configuration.
*(In browsers without native WebMCP enabled yet, Petacity installs a standards-compatible `navigator.modelContext` dispatcher automatically: `navigator.modelContext.listTools()` and `await navigator.modelContext.callTool(name, args)`.)*

### B. In-Page JavaScript / Playwright / DevTools SDK (`window.petacity`)
Every tool and direct Movie-Set helper is available synchronously/asynchronously on `window.petacity`:

```js
// List all 20 structured WebMCP tools + JSON schemas
window.petacity.listTools();

// Inspect 100% of normalized settings + full enum catalog + FPS/culling telemetry
await window.petacity.fullState();

// Call any WebMCP tool by name
const view = await window.petacity.callTool('petacity_what_am_i_looking_at', {});

// Or use ergonomic shorthand methods directly:
window.petacity.whatAmILookingAt();
window.petacity.stepPilot({ forward: 0.8, yawDeltaDeg: -10, pitchDeltaDeg: 2, dt: 0.25 });
window.petacity.transition({ type: 'wipe_left', duration: 0.9, applyState: { look: 'outrun', time: 19.2 } });
window.petacity.takeoverBuilding({ building: 'lookingAt', message: 'WAKE UP', color: '#00ffcc' });
window.petacity.takeoverSignage({ sign: 'lookingAt', text: 'SECTOR 09', subtext: 'RESTRICTED' });
window.petacity.projectInFrontOfCamera({ text: 'INCOMING CALL', shape: 'diamond', followCamera: true });
window.petacity.controlVehicle({ vehicle: 'nearest', parkInFrontOfCamera: true, color: '#ff2a6d' });
```

### C. Cross-Frame `window.postMessage` RPC Bridge
Parent iframes, multi-agent orchestrators, or browser extensions can drive Petacity without direct JS realm access:

```js
// 1. Discover tools
iframe.contentWindow.postMessage({ type: 'petacity:mcp:list', id: 'req-1' }, '*');

// 2. Invoke any tool
iframe.contentWindow.postMessage({
  type: 'petacity:mcp:call',
  id: 'req-2',
  tool: 'petacity_takeover_building',
  args: { building: 'lookingAt', message: 'ACTION!', color: '#ffcf40' },
}, '*');

// Replies arrive via message event:
// { type: 'petacity:mcp:result', id: 'req-2', tool: '...', ok: true, result: { ... } }
```

---

## 2. Complete WebMCP Tool Catalog (20 Tools)

| Tool Name | Purpose |
| :--- | :--- |
| `petacity_get_world_status` | Snapshot of active look, post-FX, city topology, landmarks, water shader, clouds/wind, camera pose & Drone-DP gimbal state, edit transition status, performance/culling stats, radio & active movie-set overrides. |
| `petacity_get_full_control_state` | Complete normalized Petacity state object + `PETACITY_CONTROL_CATALOG` enum reference, saved presets/bookmarks, path recorder playhead, transition state & live FPS/culling telemetry. |
| `petacity_what_am_i_looking_at` | Exact 3D raycast from screen coordinates `(ndcX, ndcY)` (`0,0` = center crosshair) + frustum scan across buildings, landmarks, billboards, holograms, vehicles, river, ocean & parks. |
| `petacity_list_entities` | List world entities (`visible`, `landmarks`, `places`, `buildings`, `signs`, `holograms`, `vehicles`, `infrastructure`) with proximity (`nearX`, `nearZ`, `radius`) and `minHeight` filters. |
| `petacity_set_camera_pose` | Position/aim camera, configure Drone-DP fluid-head (`gazeMode` `0..5`, `gimbalSmooth`, `leadFraming`), `fov` (`15..150°`), `lensMode` (`0..9`), `rollDeg`, `anamorphic`, `tiltShift`, `anglePreset`, `motionStyle`, `camSpeed`, `colliderRadius`, and optional cinema `transition`. |
| `petacity_step_pilot` | Relative drone stick & fluid-head gimbal piloting (`forward`, `right`, `up`, `yawDeltaDeg`, `pitchDeltaDeg`, `rollDeg`, `fov`, `speedMul`, `dt`, `steps`) with full building/terrain collision safety. |
| `petacity_autopilot_route` | Queue smooth Autopilot destinations (`destinationName` or `waypoints`), tune `gazeMode`/`gimbalSmooth`/`leadFraming`/`speedMul`, and inspect/edit the closed spline `autopilotLoop` (`setLoop`, `insertLoopNode`, `updateLoopNode`, `removeLoopNode`, `resetLoop`). |
| `petacity_run_camera_script` | Run multi-shot keyframed camera choreography (`dolly`, `orbit`, `flyover`, `crane`, `chase`, `static`) with per-shot film edit `transition` (`cut`, `fade_black`, `fade_white`, `dissolve`, `wipe_*`, `iris`, `shutter_bars`), `transitionDuration`, `rollDeg`, and `fov`. |
| `petacity_scene_transition` | Trigger any of the 11 GPU scene edit transitions (`cut`, `fade_black`, `fade_white`, `dissolve`, `wipe_left`, `wipe_right`, `wipe_up`, `wipe_down`, `wipe_diagonal`, `iris`, `shutter_bars`) with atomic `cameraPose`, `applyState`, `presetName`, `bookmarkIndex`, or `newSeed` at the edit cut! |
| `petacity_set_post_and_grade` | Configure ACES color grading (`bloom`, `lens`, `contrast`, `temp`, `film`), 6 artistic/diagnostic render styles (`artStyle` `0..5`, `artStrength`), 10 optical/360° projections, 14 angle presets, and default HUD `editTransition`. |
| `petacity_manage_presets_and_bookmarks` | List, apply, save, or delete curated/user World Presets and Camera Bookmarks; export/import compact `#s=` share tokens & JSON state; randomize city seed; or toggle HUD (`set_hud`). |
| `petacity_set_performance_quality` | Read live FPS / frame-time / view-culling telemetry and configure `qualityMode` (`auto` adaptive FPS governor, `low`, `medium`, `high`, `ultra`), `viewCulling`, `maxDrawDist`, `vehDrawDist`, and `postBypass`. |
| `petacity_takeover_building` | Override any skyscraper's window shader (`normal`, `blackout`, `solid`, `pulse`, `strobe`, `dim`) and/or wrap a **4-sided glowing LED window-matrix message marquee** around its facade. |
| `petacity_takeover_signage` | Hijack any city billboard or mega-screen (`lookingAt` or `signId`) with custom pure-code neon glyph typography, subtext, colors & marquee scroll. |
| `petacity_project_hologram` | Spawn a volumetric hologram (`billboard`, `panel`, `disc`, `diamond`, `cuboctahedron`, `icosahedron`, `knot`, `prism`, `ring`) in front of the camera with an armored drone projector pod and **corner-terminating volumetric light frustum**. |
| `petacity_control_vehicle` | Puppeteer any car, spinner, transit train, or blimp (`nearest`, `lookingAt`, `car`, `spinner`, `train`, or `vehicleId`): teleport, park in front of camera, circle camera, drive `waypoints`, repaint `color`, `follow`, or set `headlights`. |
| `petacity_set_environment` | Live-switch `look`, `tint`, `customPalette`, `terrainMode`/`terrainScale`, `treeMode`/`vegCover`/`vegScale`, `waterMode`/`waterShader`, `time`/`dayCycle`, 3-deck `clouds`/`cloudLayerElev`/`cloudLayerDens`, `weatherMode`/`weatherAutoMode`, all light & district dials, `holoDensity`/`holoScale`/`holoScan`, and `trailMode`/`trailLength`. |
| `petacity_control_music` | Start/stop the pure-code generative radio, switch stations, reseed voice-leading, configure Playlist Auto-DJ (`seq` / `shuffle` / `loop` + `playlistInterval`), and tune `volume`, `space`, `warmth`, `pulse`, and `react`. |
| `petacity_capture_media` | Capture clean PNG stills (`Viewport`/`720p`/`1080p`/`1440p`/`4K`), start/stop HQ video + synth audio (`start_video`/`stop_video`), and record/keyframe/smooth/seek/loop/import/export spline camera paths. |
| `petacity_reset_movie_set` | Cleanly restore all building lights/facades, hijacked billboards, projected holograms, overridden vehicles, and camera scripts in one call. |

---

## 3. Movie-Set Cookbook Recipes

### Recipe 1 — Compute What the Camera Is Looking At
```js
const view = await window.petacity.callTool('petacity_what_am_i_looking_at', {
  ndcX: 0,           // -1 (left) .. 0 (center crosshair) .. +1 (right)
  ndcY: 0,           // -1 (bottom) .. 0 (center crosshair) .. +1 (top)
  includeFrustumScan: true,
});
console.log(view.hit);
// -> { kind: 'building', buildingId: 142, name: 'Tower #142', face: 'south',
//      distance: 118.4, point: [148.2, 96.5, -280.0], height: 164.0 }
console.log(view.visible);
// -> Top 12 prominent landmarks, towers, mega-billboards & vehicles currently on screen!
```

### Recipe 2 — Take Over a Skyscraper's Lights & Display a Facade Message
```js
await window.petacity.callTool('petacity_takeover_building', {
  building: 'lookingAt',        // or integer buildingId, or [x, z]
  mode: 'dim',                  // dims background windows so the LED marquee pops!
  color: '#00f5ff',
  message: 'LOOK UP NEO',       // rendered in crisp architectural window-mullion LED cells!
  subtext: 'SECTOR 4 ONLINE',
  scrollSpeed: 0.18,            // horizontal wrap-around marquee across all 4 tower faces
  heightFraction: 0.78,
});
```

### Recipe 3 — Hijack a Mega-Billboard
```js
await window.petacity.callTool('petacity_takeover_signage', {
  sign: 'lookingAt',            // automatically picks crosshair sign or nearest visible mega-billboard
  text: 'SYNTHETIC DREAMS',
  subtext: 'TONIGHT 23:00',
  color: '#ff4fd8',
  subColor: '#47f5ff',
  scrollSpeed: 0.12,
});
```

### Recipe 4 — Project a Hologram + Terminating Light Cone in Front of the Camera
```js
await window.petacity.callTool('petacity_project_hologram', {
  text: 'TARGET ACQUIRED',
  subtext: 'ALTITUDE 180M',
  shape: 'billboard',           // 'billboard' | 'diamond' | 'prism' | 'ring'
  color: '#44f2ff',
  distance: 34,                 // 34m ahead of camera lens
  offsetRight: 6,               // framed slightly camera-right (rule of thirds!)
  followCamera: true,           // drone projector tracks smoothly with camera motion
});
```

### Recipe 5 — Direct a Hero Car Chase + Pursuit Camera
```js
// 1. Take over a car, paint it crimson, enable twin high-beams, and send it down an avenue
const { vehicleId } = await window.petacity.callTool('petacity_control_vehicle', {
  vehicle: 'car',
  color: '#ff2a6d',
  headlights: 'on',             // 'on' | 'glow-only' | 'off'
  speed: 68,
  waypoints: [
    [0, 1.4, 450],
    [0, 1.4, -450],
    [300, 1.4, -450],
    [300, 1.4, 450],
  ],
});

// 2. Lock the camera into a low cinematic pursuit rig behind that car!
await window.petacity.callTool('petacity_run_camera_script', {
  followVehicleId: vehicleId,
  followDistance: 24,
  followHeight: 7.5,
});
```

### Recipe 6 — Multi-Shot Scripted Dolly/Orbit Sequence
```js
await window.petacity.callTool('petacity_run_camera_script', {
  shots: [
    {
      type: 'cut',
      to: [420, 260, 520],
      lookAt: [0, 140, 0],
      fov: 52,
    },
    {
      type: 'dolly',
      to: [160, 135, 210],
      lookAt: [0, 120, 0],
      duration: 6.0,
      fov: 60,
      ease: 'C2',               // zero-jerk quintic C2 smoothstep
    },
    {
      type: 'orbit',
      orbitCenter: [0, 120, 0],
      radius: 260,
      startAngle: 0.7,
      endAngle: 2.4,
      to: [0, 190, 0],
      lookAt: [0, 120, 0],
      duration: 8.0,
    },
  ],
});
```

### Recipe 7 — Strategic Cinematic Gaze Modes & Smooth Landmark Routing at Current Speed
```js
await window.petacity.callTool('petacity_autopilot_route', {
  enabled: true,
  gazeMode: 1,                  // 0=Off, 1=Cinematic Director, 2=Sites, 3=Projections, 4=Vertigo Up/Down, 5=Gentle Drift
  destination: 'Babylon',       // smoothly routes to landmark at current camera speed (omit speed to preserve current speed!)
  turnSmooth: 1.8,              // silky 2nd-order angular rate damping
});

// Auto-cycle weather with smooth 4.6s crossfades & lower cumulus into street canyons (or set cloudPuffs: 0 to disable):
await window.petacity.callTool('petacity_set_environment', {
  weatherAutoMode: 'cinematic', // 'off' | 'seq' | 'shuffle' | 'cinematic'
  weatherInterval: 45,          // seconds per weather mood
  cloudPuffs: 0.8,              // 0 = turn off 3D cumulus puffs completely .. 2.0 = dense cumulus
  cloudElev: 0.15,              // 0.05..2.4x master cloud altitude (lowers clouds right down between towers)
});
```

### Recipe 8 — 360° Little Planet, 180° Fisheye, Panini Wide & Dutch Noir Optics
```js
// Switch to a 360° Stereographic "Little Planet" view high over the skyline:
await window.petacity.callTool('petacity_set_camera_pose', {
  anglePreset: 'little_planet', // or 'wormseye' | 'dutch_noir' | 'panini_arch' | 'fisheye_dome' | 'inception_fold' | 'vr_360' | 'miniature_tilt'
});

// Or dial custom anamorphic Dutch-angle barrel optics aimed at a Hanging Gardens or Brutalist Habitat PoI:
await window.petacity.callTool('petacity_set_camera_pose', {
  lookAt: { landmark: 'Babylon Sky-Terraces' },
  immediateLook: true,
  lensMode: 1,                  // 1 = Panini Architectural Wide (0..9)
  fov: 112,
  lensDistort: 0.28,            // +barrel / -pincushion
  roll: -26,                    // -26 deg Dutch tilt
  anamorphic: 0.55,
});
```

### Recipe 9 — Single-Sided Cone/Pyramid & 3D Archimedean Holograms + City-Wide Moving-Object Trails
```js
// Project a 3D Archimedean Cuboctahedron or Trefoil Knot hologram directly ahead of the camera:
await window.petacity.callTool('petacity_project_hologram', {
  text: 'ARCHIMEDEAN CORE',
  subtext: 'SECTOR 04',
  shape: 'cuboctahedron',       // 'billboard' | 'disc' | 'diamond' | 'cuboctahedron' | 'icosahedron' | 'knot' | 'prism' | 'ring'
  color: '#3cf5ff',
  followCamera: false,
});

// Dial city-wide hologram density, scale, scanline crispness & luminous trails on all moving objects:
await window.petacity.callTool('petacity_set_environment', {
  holoDensity: 2.2,             // 0 = off .. 1.0 = base .. 2.5 = dense street, plaza & sky projections
  holoScale: 1.35,              // 0.35..2.2x hologram projection scale
  holoScan: 1.5,                // 0..2.5x scanlines & Archimedean facet wireframe interference
  trailMode: 'all',             // 0/'off' | 1/'subtle' | 2/'some' | 3/'transit' | 4/'traffic' | 5/'all'
  trailLength: 1.6,             // 0..2.5x trail length & luminous intensity
});
```

### Recipe 10 — Cinema Scene Edit Transitions (Fade, Dissolve, Wipe, Iris & Shutter Bars)
```js
// Cut atomically to a sunset Synthwave skyline behind a soft diagonal wipe or Kurosawa horizontal wipe:
await window.petacity.callTool('petacity_scene_transition', {
  type: 'wipe_diagonal',        // 'cut' | 'fade_black' | 'fade_white' | 'dissolve' | 'wipe_left' | 'wipe_right' | 'wipe_up' | 'wipe_down' | 'wipe_diagonal' | 'iris' | 'shutter_bars'
  duration: 1.05,
  feather: 0.07,
  applyState: { look: 'outrun', time: 18.8, weatherMode: 0 },
  cameraPose: { x: 240, y: 145, z: 420, lookAt: { x: 0, y: 110, z: 0 }, fov: 50 },
});

// Multi-shot automated cinematography sequence with per-shot film edit transitions:
await window.petacity.callTool('petacity_run_camera_script', {
  shots: [
    {
      name: 'Establishing Wide',
      type: 'dolly',
      from: [420, 210, 520],
      to: [280, 175, 360],
      lookAt: [0, 110, 0],
      duration: 4.5,
      transition: 'fade_black',
      transitionDuration: 1.2,
    },
    {
      name: 'Low Canyon Reveal',
      type: 'dolly',
      from: [-60, 48, 260],
      to: [-20, 54, -80],
      lookAt: [0, 140, -240],
      fov: 68,
      rollDeg: -5,
      duration: 5.0,
      transition: 'wipe_left',
      transitionDuration: 0.75,
    },
  ],
});
```

### Recipe 11 — Professional Drone-DP Fluid-Head Gimbal & Step-by-Step Agent Piloting
```js
// Configure the 3rd-order fluid-head Drone Cinematographer for ultra-silky motivated reveals:
await window.petacity.callTool('petacity_set_camera_pose', {
  glide: true,
  gazeMode: 'drone_cinema',     // 'off' | 'drone_cinema' | 'architectural' | 'skyline' | 'projections' | 'kinetic'
  gimbalSmooth: 1.35,           // heavier cinema fluid-head inertia (0.15..2.5)
  leadFraming: 0.9,             // turn-anticipation & rule-of-thirds lead framing
});

// Or pilot the drone incrementally step-by-step with collision-safe stick & gimbal deltas:
await window.petacity.callTool('petacity_step_pilot', {
  forward: 1.0,
  right: 0.2,
  up: 0.1,
  yawDeltaDeg: -8,
  pitchDeltaDeg: 1.5,
  dt: 0.25,
  steps: 4,
});
```

### Recipe 12 — Low-End Device Optimization & View-Culling Telemetry
```js
// Inspect live FPS, frame time, and frustum/distance view-culling counters, or lock to low-power mode:
const perf = await window.petacity.callTool('petacity_set_performance_quality', {
  qualityMode: 'auto',          // 'auto' (adaptive FPS governor) | 'low' | 'medium' | 'high' | 'ultra'
  viewCulling: true,
});
console.log(perf.performance);
```


