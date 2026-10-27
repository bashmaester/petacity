# Petacity — Technical Architecture, Design Decisions & Modular Engine Retrospective

> **Purpose of this document**: Across 26 iterative phases, `petacity` grew from a minimal seeded box-grid prototype into a **43,000-line, zero-asset, 100% code-generated 3D metropolis** with runtime-pluggable visual looks, 42 custom WebGL 2 shaders, 4D volumetric clouds, 5 analytical hydrology shaders, 20,000 multi-strata vehicles, 10 camera lens/360° projections, a 14-station pure-code WebAudio modular synthesizer, and a 20-tool WebMCP AI Movie-Set Director (`101/101` automated tests).
>
> This document records **every major technique and engineering decision**, followed by a candid **post-mortem of what worked vs. what did not**, and a **concrete architectural blueprint** for using these learnings to build a next-generation **true modular city system**.

---

## Table of Contents

1. [Core Architectural Constraints & Philosophy](#1-core-architectural-constraints--philosophy)
2. [Catalog of Techniques & Engineering Decisions](#2-catalog-of-techniques--engineering-decisions)
   - [2.1 Deterministic Seeded World Generation & Dual CPU/GPU SDF Parity](#21-deterministic-seeded-world-generation--dual-cpugpu-sdf-parity)
   - [2.2 Instanced Megastructures & Fragment-Synthesized Architecture](#22-instanced-megastructures--fragment-synthesized-architecture)
   - [2.3 Pluggable Visual Looks, Palette Borrowing & Monochrome Guarantees](#23-pluggable-visual-looks-palette-borrowing--monochrome-guarantees)
   - [2.4 Hybrid 4D Volumetric Clouds & StormyClouds Print Plates](#24-hybrid-4d-volumetric-clouds--stormyclouds-print-plates)
   - [2.5 Analytical Hydrology, Non-Flooding Water & Waterfront Districts](#25-analytical-hydrology-non-flooding-water--waterfront-districts)
   - [2.6 Curvilinear Road-Web Suburbs & Continuous Planetoid Curvature](#26-curvilinear-road-web-suburbs--continuous-planetoid-curvature)
   - [2.7 Two-Tier Multi-Strata Traffic, Centerline Transit & Ribbon Trails](#27-two-tier-multi-strata-traffic-centerline-transit--ribbon-trails)
   - [2.8 Procedural Glyph Scripts, Simulated Ads & Single-Sided Holograms](#28-procedural-glyph-scripts-simulated-ads--single-sided-holograms)
   - [2.9 6-DOF Drone-DP Flight Physics, Magnetic Cushion & Open-Gap Gaze](#29-6-dof-drone-dp-flight-physics-magnetic-cushion--open-gap-gaze)
   - [2.10 Multi-Pass HDR Post-Processing, 360° Optics & Edit Transitions](#210-multi-pass-hdr-post-processing-360-optics--edit-transitions)
   - [2.11 Pure-Code WebAudio Modular Synthesizer & Music-to-World Coupling](#211-pure-code-webaudio-modular-synthesizer--music-to-world-coupling)
   - [2.12 Seamless `PC_LOOP = 120s` Time & Continuity-First Performance Governance](#212-seamless-pc_loop--120s-time--continuity-first-performance-governance)
   - [2.13 Compact Delta State Codec, Standalone Bundler & WebMCP Director](#213-compact-delta-state-codec-standalone-bundler--webmcp-director)
3. [Candid Retrospective: What Worked vs. What Did Not](#3-candid-retrospective-what-worked-vs-what-did-not)
   - [3.1 What Worked Exceptionally Well (Keep & Reuse)](#31-what-worked-exceptionally-well-keep--reuse)
   - [3.2 What Did NOT Work / Painful Failure Modes (Do Not Repeat)](#32-what-did-not-work--painful-failure-modes-do-not-repeat)
4. [Blueprint for the Next-Generation True Modular City System](#4-blueprint-for-the-next-generation-true-modular-city-system)

---

## 1. Core Architectural Constraints & Philosophy

Every design choice in `petacity` was shaped by five non-negotiable constraints:

1. **100% Procedural, Zero External Assets**: Zero `.glb`/`.obj` meshes, zero `.png`/`.jpg`/`.hdr` textures, zero `.mp3`/`.wav` audio samples, and zero external CDNs (`three.module.js` `r170` is vendored locally). Everything—from skyscraper mullions and pixel-matrix pedestrians on billboards to ocean surf, crystalline snowflakes, and 14 radio stations—is synthesized mathematically at runtime.
2. **Pluggable Runtime-Switchable Looks Without Rebuilding Geometry**: The city geometry is "scaffolding." Switching between `Blade Runner`, `Unreal Cinema (realistic)`, `2000s Anime`, `Abstract Bauhaus`, `Tron`, `Outrun`, `Clay Maquette`, `Metropolis (1927)`, or a user-authored `Custom` palette mutates shared shader uniforms in `< 1 ms` without regenerating meshes.
3. **Zero Build Step in Development & Instant Static Hosting**: Native browser ES modules load directly from `index.html` over any static server (`python3 -m http.server`) and deploy directly to GitHub Pages.
4. **Fast Small Default (`r = 5`) + Visible Failure Surface**: Default boot builds a compact `~1.5 km` core (`~4,500` boxes) for rapid iteration while allowing `?r=15` + procedural horizon suburbs out to `13.5 km`. Any startup or WebGL shader compilation failure surfaces directly inside `#loading` rather than failing silently in DevTools.
5. **Full Bidirectional Agent & Human Control**: Every visual, environmental, camera, and audio parameter is controllable simultaneously via a pure-glyph HUD, compact `#s=` share URLs, `localStorage` session persistence, and 20 `navigator.modelContext` WebMCP tools.

---

## 2. Catalog of Techniques & Engineering Decisions

### 2.1 Deterministic Seeded World Generation & Dual CPU/GPU SDF Parity
- **Seeded PRNG & Lattice Noise (`src/prng.js`)**: `mulberry32(seed)` drives deterministic city layout, while integer-hashed 2D value noise (`hash2i`, `fbm2D`) drives district density, elevation relief, and shoreline contours. Same `(seed, radius, options)` tuple always produces identical building IDs (`0 .. city.count - 1`), landmark coordinates, and window hashes.
- **Voronoi District Zoning (`src/city.js`)**: Rather than uniform random tower heights, seeded Voronoi cells classify neighborhoods into *downtown cores*, *tower spines*, *media/holo-ad wards*, *monolith districts*, *showcase parks*, *low-rise wards*, and *rifts*, plus rotated/octagonal/V-wing/twisting block variants so the grid never looks monotonous.
- **Shared Analytical Coastline, River, Lake & Terrain Math (`src/city.js` ↔ `src/shaders.js` `GLSL_TERRAIN`)**:
  - **Decision**: Instead of rasterizing a heightmap/watermap texture on CPU and uploading it to GPU, we wrote **identical analytical signed-distance functions (SDFs)** in JavaScript (`isPointInWater`, `evalTerrainHeight`, `evalRiverMeander`) and GLSL (`evalCoastDist`, `evalTerrainWorldY`).
  - **Payoff**: Every pixel of the `27 km` ground/water plane evaluates exact shoreline curvature, wet-sand swash, river meanders, and mountain ridges at infinite resolution with zero texture memory and guaranteed CPU/GPU agreement (buildings, lamps, street lanes, and transit struts never spawn in water).

### 2.2 Instanced Megastructures & Fragment-Synthesized Architecture
- **One `InstancedMesh` for the Entire Skyline (`growCity` in `src/scene.js`)**:
  - Thousands of tower podiums, shafts, setbacks, wings, and suburban houses are packed into a single `THREE.InstancedMesh` of a unit `BoxGeometry(1, 1, 1)` with per-instance attributes: `aDims` (`vec3` world width/height/depth), `aSeed` (`float`), `aKind` (`float`: tower, outline-wireframe, sparse monolith, media-facade, suburban house/shed/silo), and `aPalette` (`float`).
  - **Crucial Ordering Invariant**: Core + suburb boxes are emitted in deterministic index order so `raycaster.intersectObject(cityMesh)[0].instanceId === buildingId`, enabling O(1) raycast building selection for double-click flight and WebMCP `petacity_takeover_building`.
- **Fragment-Shader Architectural Synthesis (`TOWER_FRAG` in `src/shaders.js`)**:
  - Using world-scaled local face coordinates (`uvm = vLocal * vDims`), a single fragment shader synthesizes:
    - Floor slabs, structural mullions, corner columns, and recessed street-level pedestrian arcades (`wy < 14m`).
    - **24-Hour Periodic Circadian Occupancy (`evalCircadian24`)**: Window on/off probabilities smoothly peak in early morning and evening, dip at noon (replaced by sky/sun glass Fresnel reflections), and leave scattered night-owl floors lit at 03:00—with exact periodicity at `24.0 → 0.0`.
    - **Looped Interior Life (`evalLoopedToggle`)**: Individual offices/apartments switch lights and TV shimmers across integer-quantized slots over `PC_LOOP = 120s` with smooth crossfades rather than hard frame-snaps.
    - **Procedural Rooftops**: Parapet walls, HVAC cooling fans (spinning at integer harmonics of `120s`), solar PV arrays, illuminated helipad `H` rings, skylights, and perimeter aviation lights on top faces (`face == 1`).
    - **Director Building Takeover (`uOverrideBldg`, `uOverrideColor`)**: Allows WebMCP scripts to black out, pulse, strobe, or wrap 4-sided scrolling window-matrix messages around any target skyscraper via uniforms alone.

### 2.3 Pluggable Visual Looks, Palette Borrowing & Monochrome Guarantees
- **Declarative Look Schema (`src/looks.js`)**: Each look defines sky zenith/horizon/sun colors, fog density & height falloff, directional + hemisphere lighting, toon/flat shading flags, a 6-slot building base palette (`uPal[6]`), window/beacon/billboard colors, `authoredHour`, `defTint`, and post-grade defaults.
- **Relative Diurnal Delta (`applyLook` + `applyTime` in `src/scene.js`)**: Each look lands on its exact authored aesthetic when `timeOfDay === look.authoredHour`, while scrubbing `0..24h` computes physically motivated solar/lunar orbits, twilight scatter, star emergence, and streetlamp activation (`uLightK`) around that look's identity.
- **Decoupling Palette Fidelity (`Tint`) from Cross-Palette Richness (`Palette Color Variation`)**:
  - `uTint` (`#sl-tint`, `0..1`) controls how strongly materials adhere to the look's primary tint vs. neutral architectural tones.
  - `uColorVar` (`#sl-color-var`, `0..1.2`) controls **cross-palette role borrowing** (outlines, windows, beacons, billboards, and vehicles borrowing secondary/accent slots from the active palette) plus **luminance-preserving chromatic excursions** (`rotateHue3` & `excursePalette` in `GLSL_UTIL`, preserving Rec.709 luma so bloom thresholds never blow out).
  - **Strict Monochrome Guard**: Whenever `look.monochrome` is active (`uBillMono > 0.5`, e.g., Fritz Lang `Metropolis` or custom monochrome), both `applyLook` and `applyTime` hard-clamp `U.uColorVar.value = 0` and desaturate shaders (`saturate3(..., 0.0)`), guaranteeing zero color leakage.

### 2.4 Hybrid 4D Volumetric Clouds & StormyClouds Print Plates
- **Why Polygon Clouds Failed**: Early experiments displacing icosahedrons with vertex noise produced unmistakable polygonal facets and hard mesh intersections.
- **Two-Tier Raymarched Solution (`SKY_FRAG` + `CLOUD_FRAG` in `src/shaders.js`)**:
  1. **Concentric Spherical Sky-Shell Raymarching (`SKY_FRAG`)**: Raymarches 3 user-configurable altitude decks (`uCloudLayerElev`, `uCloudLayerThick`, `uCloudLayerDens`, `CLOUD_LAYER_PRESETS`) across curved atmospheric shells (`intersectSphereShell`), supporting 6 meteorological regimes (`Cumulus`, `Cumulonimbus` with glaciated downwind anvils, `Stratocumulus` wind-streets, `Cirrus` mares' tails, `Altocumulus + Cirrus`, and low `Sea-of-Clouds` canyon inversions) with Ekman altitude wind veer and 4D time evolution (`fbm4Cloud`). Setting `clouds = 0` yields a 100% crystal-clear sky.
  2. **Local-Ellipsoid `BackSide` Hero Cloud Volumes (`CLOUD_FRAG`)**: Renders instanced oriented bounding boxes with `side: THREE.BackSide` and raymarches analytical 3D cauliflower FBM (`puffVolDensity`) inside each box. Density falls **strictly to `0.0` at ellipsoidal radius `r >= 0.88 < 1.0`**, guaranteeing bounding-box walls/corners are mathematically invisible even when flying straight through a cloud.
- **StormyClouds WebGL Print-Plate Aesthetics (`evalStormyPlate`)**: Evaluates 7 runtime-switchable graphic cloud rendering modes inspired by traditional printmaking: `Cinema Volumetric`, `1-Bit Filmgrain`, `Convective Flow` (Hill spherical vortex dashed streamlines), `Cabral-Leedom LIC Streaks`, `Stochastic Spray + Drips`, `Bristle Drybrush`, and `8fps Lineboil / Mezzotint`.

### 2.5 Analytical Hydrology, Non-Flooding Water & Waterfront Districts
- **5 Macro-Water Topologies (`makeWaters` in `src/city.js`)**: `Coastal Bay & Harbor`, `River Delta & Bridges`, `Island Archipelago`, `Twin Lakes & Canal`, and `Dry Basin (Off)`.
- **Non-Flooding Analytical Discard (`WATER_FRAG`)**: Rather than stretching flat rectangular water quads underneath uneven city terrain (which floods inland plazas), analytical water meshes evaluate `cDist = evalCoastDist(vWorldXZ)` per fragment and `discard` wherever `cDist > 0.0` (dry land), while shaping foam, shoaling color, wet-sand swash, and shoreward-propagating (`+ uTime`) breaking surf along `cDist <= 0.0`.
- **5 Runtime Water Shaders (`uWaterShader 0..4`)**: Gerstner ocean swell, capillary wind-ripples, stylized cel-band anime water, neon cyber-grid reflections, and mirror-calm noir canals—plus real-time **Kelvin V-wake uniforms (`uShipWakes[8]`)** driven by moving harbor vessels.
- **Bridges & Harbor Separation**: River bridges (`cable-stayed`, `tied-arch`, `suspension`) retract abutments onto dry banks and carry dedicated bridge traffic lanes; harbor piers host docked cargo/cruise ships while underway offshore ships enforce `>= 350 m` mutual separation so hulls never overlap.

### 2.6 Curvilinear Road-Web Suburbs & Continuous Planetoid Curvature
- **Organic Sprawl Beyond the Grid (`evalRoadWeb` & `addHorizonSuburbs`)**: Outside the orthogonal downtown core, radial and ring arterials warped by low-frequency FBM subdivide land into curvilinear trapezoids populated with street-facing houses, corner shops, industrial silos, solar farms, Voronoi agricultural fields, and named suburb POIs—avoiding repetitive Manhattan grids on the horizon.
- **Continuous Plane ↔ Globe World Curvature (`GLSL_CURVE` `bendWorld` & `bendWorldPoint`)**:
  - Every vertex shader in the engine routes world positions through `bendWorld(wp.xyz)` controlled by `uWorldCurve` (`0.0` flat plane → `1.0` closed spherical planetoid of radius `uPlanetR`).
  - Ground, water, and boulevard meshes are radially/grid-subdivided so curvature bends smoothly without cracking, and `createSceneViewCuller` automatically disables planar frustum culling whenever `worldCurve >= 0.008`.

### 2.7 Two-Tier Multi-Strata Traffic, Centerline Transit & Ribbon Trails
- **Grade-Separated 6-Deck Directed Lane Graph (`makeLanes` in `src/city.js`)**:
  - N–S and E–W avenues sit at distinct vertical altitudes (`14–38 m` apart) on each of the 6 decks (`5.8 m` street canyon up to `406 m` high airway), eliminating perpendicular intersection collisions without stopping traffic.
  - At intersections, lanes connect via `L.outs` into straight-through runs, tangent-continuous 90° corner turns (Hermite vertical bridge between `yNS` and `yEW`), and inter-deck ramps.
- **Tier-1 CPU Hero Fleet (`1,400` instances across 8 classes) + Tier-2 GPU Swarm (`18,600` instances)**:
  - **Hero Fleet (`makeVehicles` in `src/scene.js`)**: Spinners, speeders, articulated multi-coach skytrains, cruisers, twin-rotor helicopters, illuminated blimps (with `>= 330 m` 3D separation), haulers, and pods—complete with twin headlight cones, tail lamps, local `+X` aerodynamic roll banking, `440 m` near-camera cull immunity, off-camera lane respawn preference, and smooth portal fade-ins so vehicles never pop in front of the lens.
  - **GPU Swarm (`SWARM_VERT`)**: Evaluates Bezier/turn/ring trajectories and platoon compression waves purely in the vertex shader at **zero per-frame CPU cost**, with orbital rates quantized to `floor(rate * 120.0 + 0.5) / 120.0` so `20,000` vehicles loop seamlessly across `PC_LOOP = 120s`.
- **Centerline-Locked Transit Loops & Wake Guideways (`makeTransitNetwork`, `buildTransitInfrastructure`)**:
  - 3 closed rapid-transit loops stay strictly on integer `k * CELL` street centerlines inside `[-radius * CELL, +radius * CELL]`, clearing towers via 3-pass junction elevation smoothing.
  - Physical guideway piers attach via horizontal `bracket` struts into adjacent skyscraper facades or `strut` columns onto dry ground; unsupported aerial spans omit concrete beams cleanly while `TRANSIT_WAKE_VERT/FRAG` renders subtle double-sided harmonic wake ribbons along each loop.
- **Ring-Buffered Motion Trails (`makeRibbonBatch`)**: Pre-allocated typed-array ribbon ring buffer (`slots × nodes`) emits camera-independent 3D light ribbons for hero vehicles, ships, and spaceport rockets, tracking `frameTag` per slot so objects returning from off-screen frustum culling re-seed cleanly at their current position instead of stretching chord streaks across skipped frames.

### 2.8 Procedural Glyph Scripts, Simulated Ads & Single-Sided Holograms
- **Procedural Writing Systems (`GLSL_GLYPHS`)**: Signed-distance stroke primitives synthesize 3 switchable scripts (*Hybrid Linear-A/B + Synth*, *Pure Linear Archaic*, *Cyber-Synth Circuit*, *Astral Geometric*) with smooth `120s`-periodic glyph morphing and integer-harmonic marquee scrolling (`loopAnimTime`).
- **12 Commercial & LED-Pixelated Billboard Archetypes (`evalSimulatedAd`)**: Synth-beverage bottles with rising bubbles, twin-rotor tilt-duct VTOL shuttles (non-automotive aerospace silhouette), ringed off-world colony travel posters, cyber-visor portraits, steaming noodle bowls, live candlestick charts, club equalizers, luxury chrono dials, plus **discrete `32×22` LED-matrix pixelated walking citizens, pixelated cruiser ships, pixelated megastructure skylines, and pixelated abstract forms**.
- **Cross-Free Volumetric Holograms & Projector Cones (`buildHolos`, `BEAM_FRAG`)**:
  - **Decision**: Replaced traditional crossed `DoubleSide` quads (which show an ugly `X` seam from above/beside) with **closed single-sided `THREE.FrontSide` cone/frustum hulls** (`projectorFrustumGeometry` & `beamGeometry`) paired with 8 hologram archetypes (curved ribbons, cylindrical drums, **Archimedean 3D polyhedra**, **abstract 3D sculptures** with slow 40–120s asynchronous gimbal precession, and planar frames).

### 2.9 6-DOF Drone-DP Flight Physics, Magnetic Cushion & Open-Gap Gaze
Camera feel went through the deepest engineering refinement in `petacity` (`src/controls.js`):
- **3rd-Order Critically-Damped Fluid-Head Gimbal (`_stepDampedAngle`)**: Analytical implicit `ζ = 1.0` integration with pre-filtered `_fluidYawTarget` and jerk/acceleration bounds (`_yawAccel`) guarantees **0.000% overshoot** and zero nose-wag ringing at any `dt`.
- **Dual-Layer Obstacle Avoidance (Anticipatory Whiskers + 3D Magnetic Repulsion Cushion)**:
  1. *Long-Range Anticipatory Gap-Seeking (`_applyAnticipatoryAvoidance`, `115–380 m`)*: Multi-angle forward fan probes score open canyon corridors and steer 2nd-order filtered yaw/climb rates smoothly around towers—gated on forward blockage (`approachGate`) so flying parallel down an open avenue produces **zero S-bend oscillation**.
  2. *3D Magnetic Repulsion Cushion (`collider.magneticFieldAt` + `_applyWallProximityCushion`)*: Buildings exert smooth inverse-distance horizontal repulsion vectors. Across a narrow street or `7.8 m` building crack, opposing left/right facade forces **cancel symmetrically along the canyon midline**, centering the camera automatically. Lateral velocity braking is gated strictly on `wallDirectlyAhead` (`hitsPoint` along velocity) with overdamped lateral centering so grazing narrow cracks never bounces or tilts velocity into walls.
  3. *Horizontal-Only Compound-Corner Resolution (`resolveSphere`)*: Physical sphere fallback resolves overlapping podium/shaft/wing corners horizontally (trying orthogonal street axes across narrow alleys) without ever snapping `pos.y` vertically onto skyscraper roofs.
- **Strategic Drone-DP Gaze (`CINEMATIC_GAZE_MODES 0..5`) & Open-Gap Deflection (`_computeOpenGazeOffset`)**:
  - Alternates calm forward composure beats with quintic C² minimum-jerk (`10u³ - 15u⁴ + 6u⁵`) glances toward unoccluded nearby landmarks, 3D holograms, street canyons, or spires, fading out smoothly via `_sightlineConfidence` if a building slips into the line of sight.
  - `_computeOpenGazeOffset` probes center and cheek sightlines (`±0.20..0.86 rad`) so the lens naturally deflects away from blank walls into open canyon gaps and sky vistas.
- **Editable Periodic `autopilotLoop`, Dubins `routeQueue` & Raycast Flight**:
  - Autopilot follows an 8-sector circularly smoothed closed Catmull-Rom spline (`autopilotLoop`, draggable on the minimap) via a monotonic local-window pursuit carrot (`300–520 m` ahead).
  - Clicking a Landmark, Minimap pin, or **double-clicking any 3D surface (`handleViewportDoubleClick` → `computeSafeDestinationFromHit({ point, normal })`)** queues a one-shot route (`#5cff9d` dashed line on minimap) with **Dubins circular-arc speed bounding** (`R = v/ω <= d / (2 sin θ)`) so fast cameras never orbit outside a close waypoint's capture radius. Double-clicking open sky smoothly sets flight heading (`setCourseHeading`).

### 2.10 Multi-Pass HDR Post-Processing, 360° Optics & Edit Transitions
- **7-Pass Offscreen HDR Pipeline (`src/post.js`)**: Renders scene + hardware `DepthTexture` into `HalfFloatType` `sceneRT` → bright-pass extraction → 2-iteration separable Gaussian bloom (`bloomA` ↔ `bloomB`) → final composite (`COMP_FRAG`) with chromatic dispersion, ACES-inspired tonemapping, color temperature, StormyClouds 1-px film grain & twinkling dust specks, and 6 runtime artistic styles (`Cinema`, `X-Ray Structural`, `Ink Sketch`, `Charcoal & Chalk`, `Painterly Impasto`, `Impressionist Nocturne`).
- **10 Camera Lens & Omnidirectional Projections**:
  - `lensMode 0..3`: Rectilinear, **Panini Wide** (cylindrical architectural vertical-preserving wide angle), Ultra-Wide Rectilinear, and Barrel/Pincushion/Anamorphic/Tilt-Shift optics in `COMP_FRAG`.
  - `lensMode 4..9`: Captures a 6-face GPU `CubeCamera` (`cubeRT`) each frame and ray-projects **360° Equirectangular**, **180°/360° Domemaster Fisheye**, **Stereographic Little Planet**, **Inverted Tunnel**, **Inception 90°-Folded City**, and **Mirrored Kaleidoscope** (`CUBE_LENS_FRAG`).
- **11 Cinema Scene Edit Transitions**: `cut`, `fade_black`, `dip_white`, `cross_dissolve`, directional `wipe_*`, `iris_circle`, and `shutter_bars`—lazily snapshotting the outgoing frame into `snapRT` only during active dissolve/wipe transitions so steady-state rendering pays zero extra pass cost.

### 2.11 Pure-Code WebAudio Modular Synthesizer & Music-to-World Coupling
- **Sample-Free Synthesis (`src/audio.js`)**: Built entirely on Web Audio API oscillators, waveshapers, biquad formants, stereo chorus delay lines, algorithmic feedback-delay-network (FDN) shimmer reverbs, and filtered noise bursts—zero audio files.
- **14 Original Stations & 64-Bar 4-Movement Symphonic Evolution**: Each station features custom voice patches, arpeggiators, basslines, and percussion that evolve across *I · Mist Prelude*, *II · Rising Skyline*, *III · Luminous Zenith* (bridge progressions + counter-melodies), and *IV · Nocturnal Dissolve* with multi-cycle modal transpositions (`MODAL_CYCLE_SHIFTS`) and a 4.4s crossfading Auto-DJ.
- **Non-Destructive Music-to-Environment Sync (`getMusicalTelemetry()`)**: Modulates traffic tempo, cloud evolution, diurnal progression, window/hologram glow, and bloom/temperature as additive/multiplicative offsets over `baseUniformSnap` so turning sync off restores exact user slider values.

### 2.12 Seamless `PC_LOOP = 120s` Time & Continuity-First Performance Governance
- **Exact `120.0s` Shader Loop Invariant**: `U.uTime.value` wraps modulo `120.0` to preserve float32 precision over multi-hour runs. Every time-varying shader expression (`loopPhase`, `loopSin`, `loopCos`, `loopOrbit`, `loopAnimTime`, `evalLoopedToggle`, `SWARM_VERT` `orbRate`, `BEAM_FRAG` scintillation, and `makeWeather` `aSpeed = 6.0 * k` for `uFallH = 720`) completes an **exact integer number of cycles per `120.0s`**, guaranteeing zero visual snap across `119.999 → 0.000`.
- **Hysteretic View Culling & Slewed Adaptive Quality (`createSceneViewCuller`, `slewPerformanceBudgets`)**:
  - Frustum/distance culling applies spatial retention margins (`+96 m` & `1.12×` draw distance when already visible vs. `+45 m` & `1.0×` when hidden), `1.15×` altitude hysteresis on street-furniture detail, `1.45×` frustum guard bands under wide/Panini optics, and full-height `780 m` searchlight spheres.
  - Adaptive `auto` quality mode requires sustained heavy frame times (`> 36 ms` for `5.5 s`, `10 s` cooldown), **never resizes DPR or flips `bloomPasses` mid-flight**, and exponentially slews continuous draw/cloud/traffic budgets so quality governance is completely invisible to the viewer.

### 2.13 Compact Delta State Codec, Standalone Bundler & WebMCP Director
- **Versioned Delta Share Tokens (`_v: 2` `#s=` in `src/presets.js`)**: Packs core scalars into compact fixed-precision tuples and omits any `tune`/`post`/`radio` key matching defaults, keeping full-world share URLs `< 1,350` characters (`#s=` hash avoids server 414 URI limits and reloads cleanly). `localStorage` (`petacity.lastState.v1`) persists the live flight state every `2 s` without dirtying `location.search`.
- **Single-File Offline HTML Demo Exporter (`src/demo-export.js`)**: Inlines `vendor/three.module.js`, all `src/*.js` modules (rewriting imports into Blob/inline module registries), and baked `__PETACITY_DEMO_BOOT__` state + camera path into one self-contained `.html` file.
- **20-Tool WebMCP Cinematography Suite (`src/director.js` + `src/webmcp.js`)**: Registers structured JSON-Schema tools on `navigator.modelContext` (mirrored on `window.petacity` and `postMessage`), allowing AI agents to inspect 3D raycasts, find clear drone corridors, run dolly/orbit/chase camera scripts, hijack skyscrapers/billboards/holograms/vehicles, and trigger edit transitions.

---

## 3. Candid Retrospective: What Worked vs. What Did Not

This section distills the hardest-earned engineering lessons from 26 phases of building and debugging `petacity`.

### 3.1 What Worked Exceptionally Well (Keep & Reuse)

| Technique | Why It Succeeded |
| :--- | :--- |
| **1. Geometry as "Scaffolding" + Uniform-Driven Looks** | Separating procedural geometry generation from look palettes (`applyLook` / `applyTime`) let us add 9 radically different visual aesthetics (`Blade Runner` → `Metropolis` → `Clay` → `Anime`) with `< 1 ms` switching cost and zero mesh rebuilds. |
| **2. Shared Analytical SDFs Across JS & GLSL** | Writing the exact same pure math for coastlines, meandering rivers, lakes, road-web trapezoids, and terrain height in CPU JS and GPU GLSL eliminated texture uploads, resolution aliasing, and shoreline building/water overlap bugs simultaneously. |
| **3. Two-Tier Traffic (CPU Hero + GPU Vertex Swarm)** | Pure CPU instancing caps out around ~2,000 articulated vehicles; pure GPU vertex traffic lacks collision headway, dynamic overrides, and multi-part trailers. Combining `1,400` CPU hero craft near the camera with `18,600` loop-quantized GPU vertex-shader vehicles delivered `20,000` active vehicles at 60 FPS. |
| **4. 3D Magnetic Repulsion Cushion + Forward-Only Braking Gate** | Pure raycast whiskers oscillate inside narrow alleys because left and right whiskers alternate hits. Adding a continuous 3D repulsion gradient (`magneticFieldAt`) whose opposing wall forces cancel to zero on the canyon centerline—while gating inward velocity braking strictly on `wallDirectlyAhead`—let the camera thread `7.8 m` cracks smoothly with zero open-avenue wobble. |
| **5. `BackSide` Bounding Volumes with `r <= 0.88` Zero-Boundary SDFs** | Raymarching inside `BackSide` instanced boxes whose density strictly vanishes before `r = 0.88` completely solved both camera-inside-volume clipping and polygonal cloud silhouettes. |
| **6. Closed `FrontSide` Volumetric Cones Instead of Crossed Quads** | Single-sided `FrontSide` cone/pyramid frustums with analytical axial-core falloff (`BEAM_FRAG`) look genuinely volumetric from every 3D angle—including straight down—at 1 draw call and zero `X`-plane artifacts. |
| **7. Fast Headless Node Contract Tests (`101` Tests, `< 80 s`)** | Testing real `three.module.js` math, shader uniform parity, ESSL 3.00 reserved keywords, `$()` DOM IDs, flight trajectories, and a `jsdom` fake-WebGL boot in plain `node --test` caught 95% of bugs in seconds without launching headless Chromium. |
| **8. WebMCP (`navigator.modelContext`) Scene Introspection** | Designing semantic perception + action tools (`raycast`, `find_clear_path`, `camera_script`, `project_hologram`) turned the procedural city into a programmable virtual film stage. |

---

### 3.2 What Did NOT Work / Painful Failure Modes (Do Not Repeat)

#### 1. Monolithic "God Files" & Cross-Cutting Feature Edits
- **What went wrong**: `src/scene.js` grew to **8,700 lines**, `src/city.js` to **5,051 lines**, `src/main.js` to **4,748 lines**, and `src/shaders.js` to **4,660 lines**. Adding a single parameter (like `colorVar` or `holoDensity`) required coordinated edits across **7 files**: `index.html`, `src/presets.js`, `src/looks.js`, `src/shaders.js`, `src/scene.js`, `src/main.js`, and `src/webmcp.js`.
- **Root cause**: No self-contained domain module boundary (`CitySubsystem`) and no central parameter registry.

#### 2. Overlapping AABB/OBB Sub-Boxes for Compound Buildings + Iterative `resolveSphere` Fallbacks
- **What went wrong**: Compound towers were emitted as 2–4 overlapping boxes (`podium`, `main shaft`, `side wing`). When a sphere collider grazed an interior corner junction, pushing out of box A pushed into box B across multiple iterations. An early `if (iter >= 4) pos.y = top + radius` "escape hatch" caused **single-frame `+100..300 m` vertical camera teleports onto skyscraper roofs**! Even after fixing `resolveSphere` to resolve horizontally/orthogonally, overlapping box primitives remain harder to collide against than unified 2D footprint polygons with vertical extrusion profiles.
- **Lesson for Modular Engine**: Represent every parcel/building collider as a **clean 2D signed-distance footprint (convex polygon or union SDF) + vertical tier profile `(bot, top, sdf2D)`**, never as un-merged overlapping boxes.

#### 3. Step-Function Adaptive Quality & Zero-Hysteresis Culling ("Sudden Scene Cuts")
- **What went wrong**: Our first adaptive FPS governor switched `high ↔ medium ↔ low` after `1.8 s` and called `applyPerformanceProfile()`, which resized `renderer` DPR & `post` render targets, toggled `bloomPasses` (`2 ↔ 1`), popped 45% of cloud puffs, and stepped `maxDrawDist` from `7,200 m` to `4,500 m` in **one single frame**. Combined with zero-hysteresis frustum/altitude cutoffs (`cyCam < streetDetailAlt`), flying across downtown created baffling full-screen "scene cuts" every few seconds.
- **Lesson for Modular Engine**:
  1. **Never** discrete-step `bloomPasses` or DPR mid-flight without either user initiation or ultra-gradual dynamic resolution scaling inside a fixed-size render target.
  2. Every spatial culler and LOD transition **must** have dual thresholds (**enter distance < exit distance** hysteresis) + screen-space dithered/alpha crossfades (`uLodFade`), never 1-frame `.visible = false` snaps inside or near the frustum.

#### 4. Wrapping `uTime % 120.0` Without Enforcing Periodicity by Construction
- **What went wrong**: Wrapping `uTime` at `120.0 s` prevented float32 precision decay in noise shaders, **but** any developer writing `sin(uTime * 2.4)`, `uTime * uSignAnim`, or `mod(y - uTime * aSpeed, 720.0)` with non-harmonic `aSpeed` silently introduced a **2-minute global scene cut** where stars, beams, rotating 3D holograms, or raindrops jumped phase when `uTime` wrapped `120.0 → 0.0`.
- **Lesson for Modular Engine**: **Never expose raw wrapped `uTime` to shaders!** Pass either:
  - `uLoopPhase` (`0.0 .. 1.0` over `120 s`), where shader helpers *only* accept integer harmonic counts `harmonicSin(uLoopPhase, intCycles, phase)` so non-periodic math is impossible to write by accident, plus
  - `uFrameJitter` (`0.0 .. 1.0` per-frame random seed) for film grain and raymarch dithering.

#### 5. Implicit Function Signatures & Positional Tuple Serialization
- **What went wrong**:
  - `handleViewportDoubleClick` passed `{ point, normal }` to `computeSafeDestinationFromHit(hitPoint)`, which silently evaluated `hitPoint.x || 0` → `0` and routed double-clicks toward `(0, 0, 0)` because unit tests had only called `computeSafeDestinationFromHit(vec3)` directly.
  - `applyTime(U, look, hours, tune)` vs `applyLook(U, look, tune)` had different positional argument orders, causing test bugs when `tune` was passed as the 3rd argument to `applyTime`.
  - `_v: 2` `#s=` compact state arrays relied on append-only key ordering in `DEF_TUNE`.
- **Lesson for Modular Engine**: Use **options objects (`{ uniforms, look, timeHours, tune }`)** with runtime dev assertions on required coordinates (`assertFiniteVec3`), and generate URL delta codecs from **explicit numeric field tags** (Protobuf-lite / CBOR-style `{ tag: 14, default: 0.45 }`) so field reordering can never corrupt saved links.

#### 6. Root `cityGroup.scale.y = heightScale` Non-Uniform Transform
- **What went wrong**: Scaling the entire `cityGroup` along `Y` stretched skyscraper heights instantly, **but** also stretched parked helicopters, transit train proportions, billboard aspect ratios, surface normals, and forced manual `* heightScale` multipliers in `controls.js`, `viewCuller`, `director.js`, and `vehicles.js`.
- **Lesson for Modular Engine**: Pass `uHeightScale` solely to architectural extrusion shaders/colliders (or per-tier building height tables) while keeping the world scene-graph root at strict uniform `[1, 1, 1]` scale!

#### 7. Regex-Scanning Raw Concatenated GLSL Template Strings
- **What went wrong**: `src/shaders.js` concatenated shared GLSL libraries via `${GLSL_NOISE}${GLSL_CURVE}`, and `tests/scene.test.mjs` verified uniform parity with `/uniform\s+\w+\s+(\w+)/g` without stripping comments first—meaning writing the English word *"non-uniform scale"* inside a `//` GLSL comment caused a false test failure (`shader uses undeclared uniform "scale"`)!
- **Lesson for Modular Engine**: Strip `//` and `/* ... */` comments before static GLSL analysis, validate ESSL 3.00 compilation in CI (`@webgpu/glslang` or headless WebGL2), and compose shaders from small `.glsl.js` modules via a `composeShader({ includes, uniforms, vert, frag })` builder that auto-generates `ShaderMaterial.uniforms` from a single typed declaration!

#### 8. Cascaded Rate-Limiters & Unconditional `syncFromCamera()` Resets in Flight Controls
- **What went wrong**:
  - Feeding a rate-limited autopilot `wantYaw` into a *second* rate-limited gimbal solver doubled phase lag so the camera orbited outside close minimap waypoints until we switched `followingRoute` to single-stage critically-damped tracking + Dubins speed bounding.
  - Calling `controls.syncFromCamera()` unconditionally inside `setGlideState()` zeroed aerodynamic roll (`roll = 0`), froze `_vel`, and overwrote decoupled `moveYaw` with whatever sideways POI `autoLook` happened to be glancing at!
- **Lesson for Modular Engine**: Model the camera as an explicit **Pose + Twist (`position, velocity, courseQuat, gazeOffsetQuat, roll`) state vector** shared across all flight modes (`Manual`, `Loop`, `Route`, `PathPlayback`, `DirectorShot`). Mode transitions blend **weights** between controllers over `0.6–1.5 s` rather than mutating/resetting internal integrator states!

---

## 4. Blueprint for the Next-Generation True Modular City System

When we start the new modular city repository using `petacity` as our foundation, we should organize it around **five clean architectural pillars**:

```
modular-city/
├── core/
│   ├── kernel.js            # Module lifecycle, deterministic RNG streams, event bus
│   ├── schema-registry.js   # Single source of truth -> UI + URL Codec + Storage + WebMCP
│   ├── spatial-world.js     # 2D/3D Chunk grid, Parcel polygons, Half-Edge Street/Water Graph, SDFs
│   ├── shader-composer.js   # Typed uniform declarations, #include linker, PC_LOOP harmonic math
│   └── continuity-camera.js # Unified Pose+Twist blender (Manual / Loop / Dubins Route / Director)
├── modules/                 # 100% self-contained plug-and-play CityModule plugins!
│   ├── terrain-hydrology/   # Coastline/river/lake SDFs + 5 water shaders + wakes
│   ├── road-network/        # Core grid + curvilinear suburb road-web + bridges + intersections
│   ├── architecture/        # Parcel extrusions, podiums/towers, circadian facades, rooftops
│   ├── landmarks-venues/    # Hero sculptural POIs, parks, stadiums, plazas
│   ├── transit/             # Topological rail graph, stations, facade brackets/piers, wake ribbons
│   ├── traffic/             # Tier-1 CPU hero vehicles + Tier-2 GPU swarm + ribbon trails
│   ├── maritime-spaceport/  # Harbor piers/cranes/ships + spaceport pads/rockets
│   ├── signage-holograms/   # Glyph scripts, commercial/pixel ads, FrontSide holo cones & solids
│   ├── sky-atmosphere/      # 24h ephemeris, 4D shell + BackSide clouds, StormyClouds plates, weather
│   ├── look-themes/         # Pluggable uniform themes + Tint + Palette Color Variation
│   ├── post-optics/         # HDR bloom, 10 lens/360° modes, artistic styles, edit transitions
│   └── synth-radio/         # Pure-code WebAudio modular synth + telemetry coupling
├── ui/
│   ├── auto-hud.js          # Schema-driven pure-glyph HUD + minimap + keyboard controller
│   └── webmcp-bridge.js     # Auto-registered navigator.modelContext + window SDK
└── tests/                   # Per-module unit tests + cross-module determinism & continuity suite
```

### Key Interfaces for the Modular Engine

#### 1. `SchemaRegistry` — Write Every Parameter Once
Instead of duplicating every slider across 7 files, each module registers its own slice:
```js
registry.register('look.colorVar', {
  tag: 42,                  // Stable binary/compact URL tag — never breaks old share links!
  type: 'float',
  min: 0, max: 1.2, step: 0.01, default: 0.45,
  urlParam: 'cv',
  ui: { section: 'look', label: 'Palette Color Variation', format: (v) => `Var ${Math.round(v * 100)}%` },
  webmcp: { tool: 'set_environment', description: 'Cross-palette color borrowing & hue excursion (0 in monochrome).' },
});
```
From this single registration, the engine automatically wires the HUD slider, `#s=` delta encoder/decoder, `localStorage` persistence, URL query parser, and WebMCP JSON schema!

#### 2. `SpatialWorld` — Topological Graph + Chunked 2D Parcel SDFs
- Partition the world into deterministic `512 m × 512 m` spatial chunks (`ChunkCoord(cx, cz)`), enabling both tiny instant-boot dioramas (`3×3` chunks) and **infinite streaming horizons** as the camera flies!
- Represent roads, rivers, bridges, and transit lines as a **shared planar/multi-level Half-Edge Graph** (`Nodes` = intersections/portals, `Edges` = typed splines with exact width, elevation profile, and clearance envelope).
- Subdivide blocks into **exact 2D polygon parcels** with analytical 2D SDFs + vertical tier stacks (`[{ y0, y1, inset, rot }]`), eliminating overlapping-box corner collision bugs forever and allowing buildings to conform naturally to curved boulevards and riverfronts.

#### 3. `CityModule` — Strict Lifecycle & Disposal Contract
Every feature lives in its own folder and implements one clean contract:
```js
export const TransitModule = {
  id: 'transit',
  deps: ['terrain-hydrology', 'road-network', 'architecture'],
  schema: [...],
  init(ctx) { /* create shared materials via ctx.shaders.compose(...) */ },
  generateChunk(chunk, ctx) { /* deterministic pure data -> chunk.data.transit */ },
  mountChunk(chunk, ctx) { /* build Three.js InstancedMeshes + register cullable bounds */ },
  unmountChunk(chunk, ctx) { /* dispose chunk geometries cleanly */ },
  applyTheme(theme, ephemeris, ctx) { /* update module uniforms in <0.05ms */ },
  getColliders(chunk) { /* return analytical SDF / capsule primitives */ },
  getPOIs(chunk) { /* return named stations/landmarks for Minimap, Gaze & WebMCP */ },
  update(dt, frameCtx) { /* per-frame simulation using frameCtx.loopPhase */ },
};
```
Because every module interacts *only* through `SpatialWorld` chunk data, `SchemaRegistry`, and `ShaderComposer`, modules can be toggled, unit-tested in isolation in `< 50 ms`, hot-swapped, or reused in other projects without touching core engine code.

#### 4. `ShaderComposer` — Safe-by-Construction Periodic Shaders
- Declare uniforms as `{ uBeamCol: { type: 'vec3', value: ... } }` once; `ShaderComposer` emits the `uniform vec3 uBeamCol;` GLSL header automatically (making uniform mismatch bugs impossible!).
- Provide built-in periodic time uniforms `uLoopPhase` (`0..1` over `120 s`) and `uFrameSeed` (`0..1` per frame) instead of raw wrapped `uTime`, so every oscillating, orbiting, or scrolling shader effect is **mathematically guaranteed wrap-free**.

#### 5. Continuity-Tested Cinematography & LOD Pipeline
- Bake **continuity regression assertions** into CI from commit #1: automated 600-second flight & loop-wrap sweeps asserting bounded per-frame `|Δpos - v·dt|`, bounded angular acceleration `|Δ²q|`, zero single-frame `.visible` pops inside the camera frustum (using dithered screen-space LOD crossfades), and zero mid-flight render-target resizes.
