# Petacity — Engineering Handoff & Operations Guide

Procedural, zero-asset, runtime-restylable 3D metropolis built with vanilla ES modules and Three.js (`r170`, vendored locally). Every skyscraper, sculptural landmark, public venue, bridge, harbor vessel, transit loop, billboard, single-sided hologram cone, volumetric cloud deck, celestial body, precipitation crystal, 14-station modular synth soundtrack, and 20,000-vehicle traffic stream is synthesized purely from deterministic code and custom WebGL 2 shaders—zero external 3D models, image textures, audio samples, or CDN requests.

- **Live GitHub Pages Deployment**: `https://bashmaester.github.io/petacity/`
- **Deep Technical Retrospective & Modular Engine Blueprint**: **[`ARCHITECTURE_AND_LESSONS.md`](./ARCHITECTURE_AND_LESSONS.md)**
- **System Feature Reference**: **[`DOCS.md`](./DOCS.md)**
- **AI Movie-Set Director & WebMCP Reference**: **[`WEBMCP.md`](./WEBMCP.md)**

---

## 1. Quick Start, Verification & Deployment

### Local Dev / Live Preview
No bundler or build step is needed—native ES modules load directly from `index.html`:

```bash
python3 -m http.server 8000 --bind 0.0.0.0   # or: npm run serve
# Open http://localhost:8000
```

### Automated Verification Suite (`101` Tests)
Tests run in Node (`>= 20`) against real `vendor/three.module.js` and `jsdom`:

```bash
npm install
npm test
```

All **101/101** tests (`0 fail, 0 skipped`) run across 4 suites:
- **`tests/city.test.mjs`** — Seeded PRNG/noise determinism, Voronoi district zoning, strict water-body exclusion (`isPointInWater` across all wet shoreline/river/lake modes), feature amount dials (`0 = off` through cranked), 16 sculptural POI landmarks, Showcase Park (`2×2` superblock), river bridges, harbor ships (`>= 350 m` offshore separation), orbital spaceport, street-centerline transit loops with grounded `strut` / facade `bracket` supports, curvilinear `evalRoadWeb` suburbs, 6-deck grade-separated lanes, `magneticFieldAt` canyon repulsion equilibrium, and horizontal-only compound-corner `resolveSphere` resolution (zero rooftop teleports).
- **`tests/scene.test.mjs`** — Bidirectional GLSL-uniform parity & ESSL 3.00 (`#version 300 es`) reserved-keyword safety across all `42` shaders, `9` pluggable visual looks + `uTint` + `uColorVar` (`Metropolis` strictly monochrome with `uColorVar = 0`), non-flooding analytical water (`cDist > 0` discard + 5 water shaders + ship Kelvin wakes), 4D volumetric clouds (`SKY_FRAG` 3-deck shells + `CLOUD_FRAG` `BackSide` `r <= 0.88` puffs + 7 StormyClouds print styles), 12 commercial & LED-pixelated billboard ads (`GLSL_GLYPHS` + `loopAnimTime`), 8 single-sided `FrontSide` hologram archetypes + terminating cone/frustum beams, `makeRibbonBatch` culled-frame re-seeding, `FlyControls` crack threading / zero-wobble avenue flight / Drone-DP gaze / `{ point, normal }` raycast stand-off / Dubins route interception, `CameraPathRecorder` C² open-loop return bridge, `createSceneViewCuller` spatial/altitude hysteresis, `120.0s`-periodic precipitation (`aSpeed` multiples of `6.0 m/s`), 10 camera lens/360° modes, 11 edit transitions, 14 pure-code synth stations + Music-to-World sync, standalone HTML export, and all 20 WebMCP tools.
- **`tests/ui-contract.test.mjs`** — Static/DOM contract verifying every `$('#id')` literal in `src/main.js` exists in `index.html`, pure-glyph `<button>` rule (no `[A-Za-z0-9]` text inside buttons; every button carries `aria-label` + `title`), `.panel-head` 5-button layout, minimized `ui-off` startup, non-snapping `slewPerformanceBudgets`, course-preserving `setGlideState`, and zero external URLs.
- **`tests/boot.test.mjs`** — Full end-to-end boot smoke test (`index.html` + `src/main.js` in `jsdom` with mocked WebGL 2 + WebAudio).

### CI / GitHub Pages Workflow (`.github/workflows/pages.yml`)
- Runs `npm test` and deploys `index.html`, `src/`, and `vendor/` directly to GitHub Pages on pushes to `main` and `arena/*` branches.
- Keep top-level `permissions: { contents: read, pages: write, id-token: write }` and omit `environment: github-pages` so working branches deploy cleanly without environment-protection blocks.

---

## 2. Repository Map & Module Responsibilities

| File | ~Lines | Responsibility |
| :--- | ---: | :--- |
| `index.html` | 1,508 | Minimized-by-default (`ui-off`) pure-glyph HUD, collapsible `<details class="subpanel">` drawers, traveling Synth-Linear SVG glyph `#loading` marquee, `#minimap`, `#radio-viz`, and `#stage` WebGL 2 canvas. |
| `src/main.js` | 4,748 | Bootstrap, URL query / `#s=` token / `localStorage` (`petacity.lastState.v1`) hydration, HUD & hotkey wiring (`P` Autopilot, `M` Music, `O` Gaze, `L` Freelook, `V` Avoidance, `C` Collision, `T` Clock, `H` UI, `Shift+Arrows`), `dblclick` raycast flight, `slewPerformanceBudgets` adaptive governor, Music-to-World coupling, and `animate()` loop. |
| `src/city.js` | 5,051 | Deterministic world generator (`generateCity`) & spatial collider (`makeCityCollider`): Voronoi districts, 5 water modes (`makeWaters`), 5 3D terrain modes (`evalTerrainHeight`), tower stacks, 16 POI landmarks, 7 venue types + Showcase Park, curvilinear `evalRoadWeb` suburbs (`addHorizonSuburbs`), river bridges, harbor, spaceport, street-centerline transit (`makeTransitNetwork`), 6-deck lanes (`makeLanes`), horizontal `resolveSphere`, and 3D `magneticFieldAt` repulsion. |
| `src/scene.js` | 8,700 | Three.js scene graph & uniform orchestration (`makeUniforms`, `makeWorld`, `growCity`, `applyLook`, `applyTime`), landmarks/venues/trees/bridges/transit (`transitWakeGuideway`)/harbor/spaceport/street-infra builders, Tier-1 CPU hero + Tier-2 GPU swarm vehicles (`makeVehicles`), `makeRibbonBatch` trails, single-sided `buildHolos`, `makeSearchlights`, `makeWeather`, `PERFORMANCE_PROFILES`, and hysteretic `createSceneViewCuller`. |
| `src/shaders.js` | 4,660 | All `38` scene GLSL vertex/fragment shaders + shared libraries: `GLSL_NOISE` (`PC_LOOP = 120.0`, `loopPhase`, `loopSin`, `loopOrbit`, `loopAnimTime`, `evalLoopedToggle`, `evalCircadian24`), `GLSL_UTIL` (`rotateHue3`, `excursePalette`), `GLSL_CURVE` (`bendWorld`), `GLSL_TERRAIN`, `GLSL_GLYPHS` (`evalSimulatedAd` 12 archetypes), `SKY_FRAG`, `CLOUD_FRAG` (`evalStormyPlate`), `WATER_FRAG`, `TOWER_FRAG`, `SWARM_VERT`, `HOLO_VERT/FRAG`, `BEAM_FRAG`, `TRANSIT_WAKE_VERT/FRAG`, `WEATHER_VERT/FRAG`. |
| `src/controls.js` | 2,183 | `FlyControls`: 3rd-order critically-damped fluid-head gimbal, 5 motion styles, 6 `CINEMATIC_GAZE_MODES` + `_computeOpenGazeOffset` empty-gap gaze deflection, long-horizon whisker avoidance + `magneticFieldAt` canyon cushion, closed Catmull-Rom `autopilotLoop`, Dubins-bounded `routeQueue`, `{ point, normal }` `computeSafeDestinationFromHit`, `setCourseHeading`, and C² outer `cityLimitRadius` veer-back. |
| `src/audio.js` | 2,335 | `ModularRadioEngine`: 100% pure-code WebAudio synthesizer, 14 original stations (`RADIO_STATIONS`, zero real artist/synth names), 64-bar 4-movement symphonic evolution + modal shifts, 4.4s crossfading Auto-DJ, `getMusicalTelemetry()`, oscilloscope renderer, and stereo `MediaStream` capture for video export. |
| `src/director.js` | 1,640 | `MovieSetDirector`: 3D scene raycasting, clear-corridor pathfinder, scripted dolly/orbit/chase/crane camera shots, building window-matrix text wraps, billboard/hologram projection injection, and hero vehicle puppeteering. |
| `src/webmcp.js` | 1,586 | Registers all **20 `petacity_*` tools** on `navigator.modelContext` (WebMCP), `window.petacity`, and `window.postMessage` RPC. |
| `src/post.js` | 1,277 | `makePostProcessor`: `HalfFloatType` HDR `sceneRT` + `DepthTexture`, separable bloom, 6 artistic/X-ray render styles, 10 camera lens & 6-face `CubeCamera` 360° projections (`Panini`, `Fisheye`, `Little Planet`, `Inception`, `Kaleidoscope`), StormyClouds film print composite, and 11 `snapRT`-backed cinema edit transitions (`POST_VERT`, `BRIGHT_FRAG`, `BLUR_FRAG`, `CUBE_LENS_FRAG`, `COMP_FRAG`). |
| `src/minimap.js` | 876 | Interactive 2D radar/city canvas (`makeMinimap`): dry-land clipped streets, landmarks, zoom (`1×/2×/3.5×`), distinct dashed `#5cff9d` `Route` vs `#53f3ff` draggable `Loop` vs `#ffd24c` recorded `Path`, click-to-fly & `Shift+Click` multi-stop routing. |
| `src/recorder.js` | 815 | `CameraPathRecorder` (live flight + keyframe spline capture, non-destructive `smoothPath`, and C² quintic open-loop return bridge) + `makeSceneExporter` (HUD-free PNG up to 4K & `24/30/60fps` WebM/MP4 video with muxed synth audio). |
| `src/presets.js` | 752 | 14 curated `WORLD_PRESETS`, `DEFAULT_BOOKMARKS`, and lossless `normalizeExactState` / `encodeExactState` / `decodeExactState` (`_v: 2` `#s=` compact Base64URL delta codec). |
| `src/looks.js` | 424 | 9 pluggable visual looks (`bladerunner`, `realistic`, `anime`, `abstract`, `tron`, `outrun`, `clay`, `metropolis`, `custom`) + `syncCustomLook`. |
| `src/demo-export.js` | 162 | `buildStandaloneDemoHTML` & `exportStandaloneDemoHTML` — bundles `index.html` + `vendor/three.module.js` + all `src/*.js` modules + baked scene/path state into a single offline `.html` file. |
| `src/prng.js` | 55 | Deterministic `mulberry32`, `hash2i`, and 2D value noise / `fbm2D`. |

---

## 3. Runtime Data Flow & State Precedence

1. **Boot Hydration Priority (`src/main.js`)**:
   - **(1) Baked Standalone Demo** (`window.__PETACITY_DEMO_BOOT__`) → **(2) Explicit URL State** (`#s=<token>`, `?s=<token>`, or explicit query params `?seed=`, `?look=`, `?r=`, `?t=`, `?cv=`, etc.) → **(3) Saved `localStorage` Session** (`petacity.lastState.v1`, keeping `window.location.search` clean) → **(4) Built-in Defaults** (`seed = 4417`, `r = 5`, `bladerunner`, `autoTier = 'high'`, UI minimized `ui-off`).
2. **Per-Frame Update Order (`animate()` in `src/main.js`)**:
   - Adaptive FPS EMA telemetry → `slewPerformanceBudgets(dt)` (gradual budget slewing, never resizing DPR/`bloomPasses` mid-flight) → `U.uTime.value = (U.uTime.value + dt) % 120.0` → optional diurnal clock & auto-weather crossfades → active camera controller (`pathRecorder` OR `fly` OR `director` OR `controls.update(dt)`) → `viewCuller.update(camera, ...)` → world simulations (`vehicles`, `harborObj`, `spaceportObj`, `streetInfraObj`, `searchlights`, `weather`) → `minimap.render(...)` → `radioEngine.update(...)` + 5-channel Music-to-World offsets → `post.updateTransition(dt)` → `post.render(scene, camera, U.uTime.value)`.

---

## 4. Critical Invariants & Guardrails (Do Not Break!)

When modifying `petacity`—or extracting modules into the new modular city engine—preserve these battle-tested invariants enforced by `npm test`:

1. **GLSL Uniform Parity, Comment Rule & WebGL 2 (`#version 300 es`) Safety**:
   - Every `world.*Mat` and `post.*Mat` `uniforms` dictionary must match its GLSL `uniform` declarations **1:1** (never redeclare built-in `cameraPosition`).
   - **Important**: `tests/scene.test.mjs` scans raw GLSL strings (including comments!) with `/uniform\s+\w+\s+(\w+)/g` — **never write the word `uniform` or `non-uniform` inside a GLSL comment**.
   - Never use ESSL 3.00 reserved identifiers (`active`, `sample`, `smooth`, `flat`, `centroid`, `filter`, `common`, `partition`, `half`, `fixed`, `input`, `output`, `interface`, `inline`, `packed`, `superp`) or unescaped backticks in GLSL template strings.
2. **Seamless `PC_LOOP = 120.0` Periodic Time**:
   - `U.uTime.value` wraps modulo `120.0`. Every shader oscillation, marquee scroll (`loopAnimTime`), swarm orbit (`orbRate`), beam shimmer, and weather fall speed (`makeWeather` `aSpeed` quantized to multiples of `uFallH / 120 = 6.0 m/s`, preserving `/-\s*uTime\s*\*\s*aSpeed/` in `WEATHER_VERT`) must complete an exact integer number of cycles per `120.0s`.
   - Note helper units in `GLSL_NOISE`: `loopPhase(t, cycles)` takes **integer cycles per 120s**, whereas `loopSin(t, approxHz, phase)` and `loopCos(t, approxHz, phase)` take **Hz**.
3. **Camera Canyon Threading & Zero-Wobble Constants (`src/controls.js` & `src/city.js`)**:
   - Keep `passPad = rad + 0.95` (`< 3.9 m` so `7.8 m` cracks remain passable), `safeShell = Math.max(3.6, rad * 1.62)` (`< 3.9 m`), `approachGate` gated on `fwdBlockedK`, `slotShifts` gated on `fwdPass <= 0.90`, `wallDirectlyAhead` strictly forward `hitsPoint(...)` (never `mf.minDist < rad * 2.1`), and horizontal-only `resolveSphere` wall push-out (`src/city.js` — never vertical rooftop snaps on `iter >= 4`).
   - Keep `followingRoute` single-stage (`angAccel >= 2.1`, `lookGain >= 4.6`, Dubins speed bound for `cruiseSpd > 14`), `_manualCourseSteered` reset gated on `_headingHoldTimer === 0`, and `setGlideState` passing `{ preserveCourse: true, coast: true, smoothAccel: true }`.
4. **Geometry, Transit, Holo, Vehicle & Post Contracts**:
   - Preserve `cityMesh` instance emission order (`hit.instanceId === buildingId`) and `seed = 4417, r = 5` deterministic landmarks.
   - Transit loops stay on integer `k * CELL` street centerlines inside `[-radius * CELL, +radius * CELL]` (`transitAmt = 0` → `active: false, stations: []`).
   - Holograms (`city.holos`) use closed `THREE.FrontSide` hulls & terminating cone/pyramid frustums (`archetype === 4`), never `DoubleSide` crossed planes.
   - `Metropolis` (`billMono > 0.5`) clamps `U.uColorVar.value = 0` in both `applyLook` and `applyTime`.
   - `post.js` executes **7** `renderer.render` passes in steady state at `bloomPasses = 2` for `lensMode 0..3` (lazy `snapRT` only during active transitions) and `createSceneViewCuller` bypasses directional culling when `lensMode >= 3.5` or `worldCurve >= 0.008`.
5. **UI, State Codec & Naming Contracts**:
   - Every `$()` call in `src/main.js` must pass a `'#...'` string literal; every `<button>` in `index.html` must be pure glyph/SVG (no `[A-Za-z0-9]` text) with `aria-label` + `title`; `.panel-head` keeps exact button IDs `['b-glide', 'b-radio', 'b-fold-all', 'b-export', 'b-ui']`.
   - Append any new `DEF_TUNE` keys at the **end** of `DEF_TUNE` in `src/presets.js` to preserve `_v: 2` `#s=` backward compatibility (`< 1,350` chars).
   - Keep all radio/synth station titles 100% original (zero real artist, album, or commercial synth model names).

---

## 5. Guide to Extracting Subsystems into the New Modular City Engine

When bootstrapping the next-generation modular repository (detailed in [`ARCHITECTURE_AND_LESSONS.md` §4](./ARCHITECTURE_AND_LESSONS.md#4-blueprint-for-the-next-generation-true-modular-city-system)), extract subsystems in this dependency order—each can be lifted almost directly while shedding monolithic coupling:

1. **Math, PRNG & Periodic Shader Primitives** (`src/prng.js` + `GLSL_NOISE` / `GLSL_UTIL` / `GLSL_CURVE` in `src/shaders.js`) → Wrap into `core/prng.js` and `core/shader-composer.js` (exposing `uLoopPhase` `0..1` instead of raw `uTime`).
2. **Analytical Terrain, Hydrology & Road-Web Kernel** (`evalTerrainHeight`, `makeWaters`, `isPointInWater`, `evalRoadWeb` in `src/city.js` + `GLSL_TERRAIN` & `WATER_FRAG` in `src/shaders.js`) → Extract into `core/spatial-world.js` + `modules/terrain-hydrology/`, replacing global city arrays with chunk-addressed `Chunk(cx, cz)` queries and 2D polygon parcel SDFs.
3. **Pluggable Theme & Ephemeris Engine** (`src/looks.js` + `applyLook` / `applyTime` in `src/scene.js`) → Extract into `modules/look-themes/`, replacing positional arguments with `{ uniforms, theme, ephemeris, params }`.
4. **Architecture, Landmarks, Transit & Signage** (`TOWER_FRAG`, `GLSL_GLYPHS`, `buildLandmarks`, `buildTransitInfrastructure`, `buildHolos`) → Lift each into its own `CityModule` plugin (`modules/architecture/`, `modules/transit/`, `modules/signage-holograms/`), keeping `FrontSide` volumetric cones, circadian facades, and `loopAnimTime` glyph/ad shaders intact while dropping root `cityGroup.scale.y` in favor of shader/tier height scaling.
5. **Two-Tier Traffic & Ribbon Trails** (`makeLanes` + `makeVehicles` + `SWARM_VERT` + `makeRibbonBatch`) → Extract into `modules/traffic/`, consuming the shared half-edge road/bridge/airway graph.
6. **4D Volumetric Clouds, Post-Optics & Pure-Code Synth Radio** (`SKY_FRAG` / `CLOUD_FRAG`, `src/post.js`, `src/audio.js`) → Already cleanly self-contained; wrap directly as `modules/sky-atmosphere/`, `modules/post-optics/`, and `modules/synth-radio/`.
7. **Continuity-First Drone-DP Camera & WebMCP Director** (`src/controls.js`, `src/recorder.js`, `src/director.js`, `src/webmcp.js`) → Unify into `core/continuity-camera.js` + `ui/webmcp-bridge.js`, keeping the 3rd-order critically-damped gimbal, `magneticFieldAt` cushion, `_computeOpenGazeOffset`, Dubins route solver, and 20 semantic cinematography tools, while driving UI, `#s=` URL tokens, and WebMCP schemas from a single `SchemaRegistry`.
