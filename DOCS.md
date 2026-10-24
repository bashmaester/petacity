# Petacity — System Architecture & Technical Documentation

Petacity is a **100% pure-code procedural city, multi-style shader sandbox, generative synthesizer, and WebMCP-enabled AI Movie Set**. Every building, street, river, ocean wave, cloud deck, hologram, vehicle, glyph sign, and musical note is generated deterministically in JavaScript, GLSL, and the Web Audio API — with **zero external 3D models, zero image textures, zero CDNs, and zero audio samples**.

For AI agent integration and programmable movie-set control (`navigator.modelContext`, `window.petacity`, and `window.postMessage`), see **[`WEBMCP.md`](./WEBMCP.md)**.

---

## 1. Repository Layout & Module Graph

```text
index.html              Application shell, collapsible HUD subpanels, radar minimap & radio scope
vendor/three.module.js  Vendored Three.js r170 ES module (offline / static-host ready)
src/
  prng.js               Deterministic Mulberry32 PRNG, integer hashes & 2D value/fBm noise
  city.js               Pure-JS procedural city, hydrology, terrain, transit, traffic & collider
  looks.js              9 runtime-switchable visual look presets + live Custom palette schema
  shaders.js            36 ESSL 3.00-clean GLSL vertex/fragment shaders (sky, clouds, water, city, beams)
  post.js               Multi-pass bloom, lens FX, color grading & artistic/Stormy-Clouds post-FX
  scene.js              Three.js scene builders, instanced meshes, twin-beam fleet, searchlights & holos
  controls.js           6-DOF flight physics, 2nd-order turn-rate limiter, Autopilot POI Auto-Look & routes
  minimap.js            Interactive 2D radar/city map with dry-land clipping & live route visualization
  recorder.js           C2 Catmull-Rom / SQUAD camera path recorder, non-destructive smoother & PNG/WebM export
  audio.js              Pure-code Web Audio modular synthesizer with 6 original stations & 4-movement evolution
  presets.js            Curated world presets, bookmarks & compact Base64URL exact-state codec
  director.js           MovieSetDirector: 3D raycast perception, scripted shots, building/sign/holo/car takeover
  webmcp.js             W3C/Chrome WebMCP (`navigator.modelContext`), `window.petacity` & `postMessage` bridge
  main.js               DOM bindings, URL state sync, render loop & subsystem orchestration
tests/
  city.test.mjs         Unit & invariant suite for procedural city, rivers, dry streets & transit (29 tests)
  scene.test.mjs        Integration suite for shaders, uniforms, fleet, motion, audio & WebMCP (32 tests)
  ui-contract.test.mjs  Static contract suite verifying DOM IDs, ARIA labels & zero external assets (16 tests)
  boot.test.mjs         Full JSDOM + mock-WebGL end-to-end boot verification of `main.js`
```

---

## 2. Procedural City, Hydrology & River-Aware Streets (`src/city.js`)

### 2.1 Seeded Determinism & Scale
- `generateCity({ seed, radius, suburbReach, waterMode, waterAmount, shoreDist, ... })` produces an identical city down to individual building setbacks, window seeds, and streetlamps for a given `seed`.
- The urban core is laid out on a `CELL = 150m` superblock grid (`radius = 5` default -> `1.5 km` core) surrounded by procedural Voronoi/radial quarters and a road-web suburban sprawl (`evalRoadWeb`) extending to the horizon.
- Building boxes are stored in cache-friendly **Structure-of-Arrays (SoA)** typed buffers (`city.x`, `city.y`, `city.z`, `city.w`, `city.h`, `city.d`, `city.rot`, `city.kind`, `city.style` of length `city.count`).

### 2.2 `shoreDist`-Exact Rivers & Closed-Form Hydrology
Petacity supports 5 hydrology layouts (`WATER_MODE_NAMES`):
- `0` **Harbor & Winding River**
- `1` **Coastal Ocean, Harbor & River** *(default)*
- `2` **Archipelago & Peninsula**
- `3` **Great Crater Lake**
- `4` **No Shoreline (Dry Basin)**

Key hydrological guarantees:
- **Exact Ocean River Mouths (`evalExactCoastShoreU`)**: In coastal modes (`1` and `2`), `evalExactCoastShoreU` solves the exact coastline contour offset at any lateral coordinate `v` across all `shoreDist` settings (`0.35x .. 2.5x`), anchoring the river mouth `260m` seaward into the ocean (`cDist < 0`) with a smooth estuarine `mouthFlare` so rivers never terminate short of the sea or flood downtown media zones.
- **Closed-Form `evalRiverSignedDist(wx, wz, riverFlow)`**: Evaluates signed distance to the meandering dual-sine river channel in $O(1)$ time identically on CPU (`src/city.js`, `src/minimap.js`, `src/director.js`) and GPU (`GLSL_TERRAIN` in `src/shaders.js`).
- **River-Aware Streets, Boulevards & Ground Shader**:
  - `GROUND_FRAG` suppresses road asphalt, lane markings, and suburban lights inside river channels (`rDist < 0`), painting a dark wet riverbed and stone riverwalk quays along `0 < rDist < 14m`.
  - 3D street traffic lanes (`makeLanes`), diagonal boulevards (`buildBoulevards` merged dry spans), and streetlights terminate cleanly at riverbanks, crossing rivers exclusively over elevated arch/suspension bridges (`city.bridges`).

### 2.3 Scenic Public Transport Trajectories (`makeTransitNetwork`)
Rather than axis-aligned rectangular loops, `makeTransitNetwork` builds 3 elevated corridors aligned with avenue clearance channels and linked by wide quadratic Bézier corner arcs (`makeRoundedPolySegments`, `cr = 24..26m`) plus continuous vertical elevation waves (`y1`, `y2`):
1. **Grand Serpentine S-Line** — sweeping S-bend across the city core with undulating viaduct elevation.
2. **Harbor–Midtown Crescent** — L-shaped crescent loop linking waterfront and midtown towers.
3. **Cross-Quarter Pinwheel Loop** — asymmetric 8-node pinwheel loop with Hermite-interpolated station platforms (`st.y`) and pitched viaduct girders (`buildTransitInfrastructure`).

---

## 3. Pluggable Visual Looks, Shaders & Post-Processing (`src/looks.js`, `src/shaders.js`, `src/post.js`)

### 3.1 Runtime-Switchable Looks
All 9 looks re-tint and re-light the **exact same 3D city geometry** in real time via shared uniforms (`applyLook`, `applyTime`):
`bladerunner`, `realistic`, `anime`, `abstract`, `tron`, `outrun`, `clay`, `metropolis` (strictly monochrome expressionist silver/sepia across all 24 hours), and `custom`.

### 3.2 Five High-Frequency Water Shader Solutions (`WATER_FRAG`, `uWaterShader = 0..4`)
To prevent open-ocean blotchiness and screen-space Moiré shimmer at grazing angles, all 5 selectable water shaders (`#sel-watershader`) clamp analytical wave-normal derivatives against `fwidth(vWorld.xz)` (Nyquist anti-aliasing) while confining `uWaterShallow` strictly to coastal shoals:
- `0` **Capillary Micro-Facet Sea (Default)** — 6-octave anisotropic wind-aligned Gerstner + capillary micro-ripple normal field with Schlick Fresnel sky reflection and dual-lobe solar/lunar glitter.
- `1` **Diamond Wind-Chop & Glitter** — Crossed wave-packet interference facets producing crisp diamond sun-path sparkles.
- `2` **Crystalline Caustic Filigree** — Dual-advected Ridged-Voronoi refractive caustic filaments across shoals, harbors, and rivers.
- `3` **Storm Swell & Whitecap Spray** — Steep trochoidal swells with wind-sheared foam streaks and breaking crest spray.
- `4` **Obsidian Silk & Mirror Filaments** — Ultra-sleek nocturnal mirror water with razor-thin anisotropic neon city/sky light ribbons.

### 3.3 Wind-Guided 4D Volumetric Clouds (`SKY_FRAG`, `CLOUD_VERT`, `CLOUD_FRAG`)
- Clouds are 100% **volumetric raymarched** (concentric spherical atmosphere shells in `SKY_FRAG` + `THREE.BackSide` ellipsoid bounding volumes in `CLOUD_FRAG` whose density falls strictly to `0.0` before `r = 0.88`, never exposing polygon facets; `0` density = completely clear sky).
- **Prevailing Wind Streamlines (`uWindAngle`, `uWindStrength`)**: Cloud domain coordinates rotate into a coherent wind frame (`windFrameXZ`) with **Ekman altitude wind shear** (gradual clockwise veer across the Low Mist `~210m`, Mid Cumulus `~680m`, and High Cirrus `~1620m` decks) and anisotropic along-wind stretching (`cloudStreets`), eliminating unnatural random angles between neighboring clouds.
- All animated shaders wrap seamlessly on a `PC_LOOP = 120.0s` period (`loopPhase`).

### 3.4 Volumetric Beams, Searchlight Families & Terminating Holo-Projectors
- **Searchlights (`makeSearchlights`, `BEAM_VERT`/`BEAM_FRAG`)** span 4 atmospheric beam families encoded via `aBeamMeta` (`kind`, `gain`, `falloff`, `phase`) and `aBeamTint`:
  - `0` **Pencil Laser** — tight collimated shaft reaching high into the cloud deck.
  - `1` **Carbon-Arc Searchlight** — classic cinema premiere beam with bright atmospheric core.
  - `2` **Wide Atmospheric Flood** — soft wide-angle stadium/plaza wash.
  - `3` **Flat Fan Curtain** — wide blade-like laser/light sheet.
- **Terminating Hologram Projectors (`projectorFrustumGeometry`, `archetype = 4`)**: Every city hologram (`buildHolos`) and Director camera-hologram (`projectInFrontOfCamera`) includes a physical armored emitter pod + optical lens whose volumetric frustum rays fan out from `vT = 0` at the lens and **terminate cleanly (`vT = 1`) on the 4 corners of the hologram**.

---

## 4. Twin-Headlight Vehicle Fleet (`src/scene.js`)

`makeVehicles` manages up to `20,000` multi-strata vehicles (hero instanced articulated meshes + distant GPU light-swarm) across ground streets, elevated sky-lanes, undulating transit rails, and high airways:
- **Twin Bumper-Emitted Headlights (`twinHeadlightGeometry`, `twinTrailGeometry`)**: Front light cones and forward light-trails originate from **paired left/right front bumper sockets** (`+X` nose offset, `±Z` lateral spacing) rather than the vehicle's center origin.
- **Per-Vehicle Front Light Variations**: Vehicles deterministically spawn across 4 realistic front-lighting profiles:
  - **Glow-Only Marker Lamps (~18%)** — `beamReach = 0` (emissive front lamp housings on the hull like rear taillights, with zero volumetric cone).
  - ** dipped Low-Beam (~27%)**, **Standard Twin-Beam (~37%)**, and **Long-Throw Xenon/Cyan High-Beam (~18%)**.
- Every hero vehicle can be inspected and puppeteered live via `getVehicleState`, `listVehicles`, `setVehicleOverride`, and `clearVehicleOverride`.

---

## 5. Smooth Flight, 2nd-Order Turn Damping, Autopilot Auto-Look & Minimap Routing (`src/controls.js`, `src/minimap.js`)

- **5 Camera Motion Styles (`CAMERA_STYLE_NAMES`)**:
  `0` Cinema Drone, `1` FPV Agile, `2` Steadicam Crane, `3` Orbital Glider, and `4` **Silk Airship (Slow Turns)**.
- **2nd-Order Rate- & Acceleration-Limited Turn Damping (`turnSmooth`, `#sl-turnsmooth`)**:
  `_stepDampedAngle` caps both maximum angular velocity (`|dyaw/dt| <= maxRate / turnSmooth^0.82`) and angular acceleration (`|d²yaw/dt²| <= turnAccel / turnSmooth^0.75`), completely eliminating jarring whip-pans or super-fast turns.
- **Autopilot POI Auto-Look (`autoLook`, `#b-autolook` / `O`)**:
  Decouples camera gaze from the flight vector during Autopilot (`G`), smoothly panning across nearby landmarks, bridges, harbors, and towers with gentle breathing framing — even when cruising very slowly or **hovering motionless (`glideSpeed = 0`)** via mouse-wheel down!
- **Minimap Smooth Route Queue (`enqueueWaypoint`) & Seamless Manual Course Trim**:
  - Clicking any landmark or coordinate on the radar minimap (`#minimap`) enqueues a smooth flight route (`Shift+Click` chains multi-stop routes!) rendered as a live cyan dashed trajectory with target rings — flying smoothly there instead of teleporting.
  - Dragging or pressing `A/D/Q/E` during Autopilot smoothly trims the flight course without fighting or snapping back; releasing input automatically re-orients scenic touring toward landmarks ahead of your new heading (`onCourseReorient`).
- **Camera Optics, Wide-Angle, 360° Projections & Strange Angles (`src/post.js`, `src/controls.js`, Subpanel `2C`)**:
  - **10 Optical Lens Projections (`LENS_MODE_NAMES`, `0..9`)**:
    - Single-pass optical modes (`0..3` in `COMP_FRAG`): `0` *Rectilinear Cinema Lens* (Brown-Conrady `k1/k2` barrel/pincushion/mustache distortion + peripheral radial chromatic dispersion), `1` *Panini Architectural Wide* (cylindrical stereographic projection keeping vertical skyscraper lines plumb up to `140°+`), `2` *Anamorphic Scope 2.39:1* (oval squeeze, cinema letterbox & horizontal cyan/amber flare streaks), and `3` *Tilt-Shift Miniature* (12-tap Vogel-disk Scheimpflug bokeh).
    - True 6-face omnidirectional cubemap modes (`4..9` via lazy `WebGLCubeRenderTarget` + `CubeCamera` + `CUBE_LENS_FRAG`): `4` *180° Hemispherical Fisheye* (equisolid-angle dome with circular fisheye rim when `lensZoom < 0.96`), `5` *360° Equirectangular Panorama* (`360° × 180°` spherical lat-long view), `6` *Little Planet (360° Nadir)* (stereographic downward projection turning the city into a floating mini-world), `7` *Inception Folded Sky-City* (inverse stereographic projection folding distant districts overhead), `8` *Hyper-Fisheye 250° Probe*, and `9` *Mirage Prismatic Kaleidoscope*.
  - **Extreme / Strange Angles (`CAMERA_ANGLE_PRESETS`)**: Full `-180°..+180°` Dutch/inverted roll (`controls.setCameraRoll`), `±89°` worm's-eye canyon look-up & `90°` nadir skyscraper drop, `15°..150°` telephoto-to-hyper-wide FOV, and 14 one-click shot presets.
- **16 Monumental Futuristic & Creative PoI Buildings (`LM_KINDS` in `src/city.js`, `buildLandmarks` in `src/scene.js`, `LANDMARK_FRAG` roles `0..6`)**:
  - Includes **Hanging Gardens** (`hanging_gardens` — 7 staggered cantilevered biophilic sky-terraces, lush foliage/vine overhangs `uRole = 4`, glowing botanical atrium dome & `loopPhase` cascading sky-waterfalls `uRole = 6`), **Brutalist Housing Complex** (`brutalist_habitat` — Habitat-67 / Barbican-inspired monolithic piloti megastructure of 34 interlocked cantilevered raw béton-brut concrete housing modules `uRole = 5` with recessed warm circadian loggias & elevated sky-streets), **Ziggurat & Split Neo-Ziggurat Arcologies** (`ziggurat`, `neo_ziggurat` — monumental stepped pyramids with battered diagonal buttress ribs, grand staircases, split sky-canyon skybridges & apex beacons), **Inverted Ziggurat** (`inverted_ziggurat`), **Double-Helix Bio-Arcology** (`helix_arcology`), **Levitated Torus Sky-Ring** (`torus_ring`), and **Metabolist Capsule Tree** (`metabolism_tree`), alongside `arch`, `spire`, `dome`, `mast`, `crown`, `needle`, `pyramid`, and `cantilever`.

---

## 6. Pure-Code Evolving Generative Synth Radio (`src/audio.js`)

`ModularRadioEngine` synthesizes 100% of its audio in real time using Web Audio oscillators, biquad filters, waveshaper tape saturation, stereo wow/flutter ping-pong delay, pink/velvet noise, and a procedural 5.2s stereo hall impulse response (`buildSpaceImpulseData`):
- **6 Original Atmospheric Stations** (zero external samples, zero real-world artist/album/synth brand names):
  1. `99.4 FM · Rain on Neon Glass`
  2. `101.7 FM · Velvet Sub-Level`
  3. `104.2 FM · Midnight Monorail`
  4. `106.8 FM · Sodium & Mercury`
  5. `88.9 FM · Foghorn & Starlight`
  6. `93.1 FM · Hanging Sky-Gardens`
- **4-Movement Macro-Evolution Engine (`RADIO_MOVEMENTS`)**:
  Across a 64-bar symphonic cycle, the composition evolves automatically through **I · Mist Prelude**, **II · Rising Skyline**, **III · Luminous Zenith** (pivoting into contrasting `bridgeProgressions` with counter-melodies and upper-octave voicings), and **IV · Nocturnal Dissolve**, followed by multi-cycle modal key transpositions (`MODAL_CYCLE_SHIFTS`) and motif mutations so long listening sessions continuously evolve.

---

## 7. Running Locally & Verification Suite

```bash
# Start local static server on port 8000
npm run serve   # or: python3 -m http.server 8000 --bind 0.0.0.0

# Run full 81-test Node verification suite (city, scene, shaders, optics, PoIs, UI contract & JSDOM boot)
npm test
```
