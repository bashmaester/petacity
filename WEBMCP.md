# Petacity — WebMCP & AI Movie-Set Director Guide

Petacity exposes its entire 3D procedural world, camera rig, raycast perception engine, skyscraper lighting, 4-sided LED building facade displays, billboards, volumetric holo-projectors, vehicle fleet, weather, water shaders, and generative music to **AI Agents and scripts** as a **programmable movie set**.

---

## 1. Three Ways to Connect

### A. W3C / Chrome WebMCP (`navigator.modelContext`)
On startup, `registerPetacityWebMCP` (`src/webmcp.js`) registers all **14 JSON-Schema-typed tools** with `navigator.modelContext` (`registerTool` / `provideContext`). Any WebMCP-capable browser agent can discover and invoke `petacity_*` tools natively with zero configuration.
*(In browsers without native WebMCP enabled yet, Petacity installs a standards-compatible `navigator.modelContext` dispatcher automatically: `navigator.modelContext.listTools()` and `await navigator.modelContext.callTool(name, args)`.)*

### B. In-Page JavaScript / Playwright / DevTools SDK (`window.petacity`)
Every tool and direct Movie-Set helper is available synchronously/asynchronously on `window.petacity`:

```js
// List all 14 structured WebMCP tools + JSON schemas
window.petacity.listTools();

// Call any WebMCP tool by name
const view = await window.petacity.callTool('petacity_what_am_i_looking_at', {});

// Or use ergonomic shorthand methods directly:
window.petacity.whatAmILookingAt();
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

## 2. Complete WebMCP Tool Catalog (14 Tools)

| Tool Name | Purpose |
| :--- | :--- |
| `petacity_get_world_status` | Snapshot of active look, post-FX, city topology, landmarks, water shader, clouds/wind, camera pose, autopilot route, radio movement & active movie-set overrides. |
| `petacity_what_am_i_looking_at` | Exact 3D raycast from screen coordinates `(ndcX, ndcY)` (`0,0` = center crosshair) + frustum scan across buildings, landmarks, billboards, holograms, vehicles, river, ocean & parks. |
| `petacity_list_entities` | List world entities (`landmarks`, `buildings`, `billboards`, `holograms`, `vehicles`, `transit`, `bridges`, `parks`) sorted by proximity to camera. |
| `petacity_set_camera_pose` | Position or aim the camera, set `fov` (`15..150°`), `lensMode` (`0..9` incl. Panini, Anamorphic, Tilt-Shift, 180° Fisheye, 360° Panorama, Little Planet, Inception Fold, 250° Probe, Kaleidoscope), `lensDistort`, `lensZoom`, `roll` (`-180..+180°` Dutch/inverted), `anamorphic`, `tiltShift`, `anglePreset`, `motionStyle`, `smoothness`, `turnSmooth`, and `freelook`. |
| `petacity_autopilot_route` | Control smooth Autopilot Loop / route cruise (`0.02×..5.0×` speed), hover (`speed: 0`), POI `autoLook` cinematography, and multi-stop `waypoints` / landmark routes. |
| `petacity_run_camera_script` | Run multi-shot keyframed camera choreography (`cut`, `dolly`, `orbit` with C2 quintic easing), `followVehicleId` pursuit chase-cam, or continuous `orbitTarget`. |
| `petacity_takeover_building` | Override any skyscraper's window shader (`normal`, `blackout`, `solid`, `pulse`, `strobe`, `dim`) and/or wrap a **4-sided glowing LED window-matrix message marquee** around its facade. |
| `petacity_takeover_signage` | Hijack any city billboard or mega-screen (`lookingAt` or `signId`) with custom pure-code neon glyph typography, subtext, colors & marquee scroll. |
| `petacity_project_hologram` | Spawn a volumetric hologram (`billboard`, `diamond`, `prism`, `ring`) right in front of the camera — complete with an armored drone projector pod and **corner-terminating volumetric light frustum**. |
| `petacity_control_vehicle` | Puppeteer any car, spinner, transit train, or blimp (`nearest`, `lookingAt`, `car`, `spinner`, `train`, or `vehicleId`): teleport, park in front of camera, circle camera, drive `waypoints`, repaint `color`, or set twin `headlights` (`on`, `glow-only`, `off`). |
| `petacity_set_environment` | Live-switch visual `look`, `postStyle` (`0..12`), `time` (`0..24h`), `waterShader` (`0..4`), `waterMode`, `shoreDist`, `clouds`, `cloudLayer`, `windAngle`, `windStrength`, `rain`, `fog`, `trafficCount`, `seed`, or `radius`. |
| `petacity_control_music` | Start/stop the pure-code generative radio, switch between the 6 original stations, configure Playlist Auto-DJ (`seq` / `shuffle` / `loop` + `playlistInterval`), tune `volume`, `space`, `warmth`, `pulse`, `cityReact`, and read live chord/movement evolution. |
| `petacity_capture_media` | Drive `CameraPathRecorder`, capture clean PNG stills (`Viewport`/`720p`/`1080p`/`1440p`/`2x`/`4K`), record high-bitrate (`16..115 Mbps`) video with muxed WebAudio synth sound (`startVideo`/`stopVideo`), or export a standalone single-file HTML autoloop demo (`exportDemoHTML`). |
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

### Recipe 7 — Hovering Contemplative Autopilot with POI Auto-Look & Slow Turns
```js
await window.petacity.callTool('petacity_autopilot_route', {
  enabled: true,
  speed: 0,                     // stationary aerial hover (or 22 for slow airship drift)
  autoLook: true,               // smoothly pans & contemplates nearby landmarks/vistas
  turnSmooth: 2.2,              // ultra-silky 2nd-order angular rate damping
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
