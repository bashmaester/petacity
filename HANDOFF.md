# Petacity — Engineering Handoff

Procedural, zero-asset, runtime-restylable 3D sci-fi/fantasy metropolis built with vanilla ES modules and Three.js (`r170`). Every building, landmark, public venue, billboard, hologram, street lamp, volumetric cloud deck, celestial body, weather particle, and multi-strata vehicle stream is synthesized purely from deterministic code and custom GLSL shaders—no external 3D models, image textures, or CDN dependencies.

---

## 1. Quick Start & Verification

### Local Dev / Live Preview
No bundler or build step is required; the browser loads native ES modules directly from `index.html`:

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000` (or the proxied preview URL on port `8000`).

### Automated Test Suite
Tests run in Node (`>= 20`) against real `vendor/three.module.js` and `jsdom`:

```bash
npm install
npm test
```

The suite (`64` tests across 4 files) validates:
- `tests/city.test.mjs` — deterministic PRNG/noise, district layout, landmarks (`arch`, `spire`, `dome`, `mast`, `crown`, `needle`, `pyramid`, `cantilever`, `ziggurat`), public venues (`arena`, `theatre`, `stadium`, `market`, `plaza`, `park`, `fair`), 5 macro-water/shoreline modes (`WATER_MODE_NAMES`), 5 distant 3D terrain modes (`TERRAIN_MODE_NAMES`), non-grid curvilinear suburban houses + neighborhood shops, power stations & rural Voronoi farmsteads (`suburbPOIs`), park tree groves + inter-tree connections (`treeLinks`), billboard/hologram distribution, and grade-separated horizontal street-grid traffic lanes with corner turns, elevation ramps, and rooftop/building clearance.
- `tests/scene.test.mjs` — shader-to-uniform contracts, instanced attribute contracts, ESSL 3.00 (`#version 300 es`) reserved-keyword safety across all `38` GLSL shaders, `applyLook` / `applyTime` 24-hour celestial orbits (`uSolarDir`, `uMoonDir`, `uStarRot`) and full 8-phase lunar cycle (`uMoonPhase` `0..2`), 6 volumetric cloud types & cloud-cover range, theme-reactive special structures (`setLook`), analytical ocean/lake/river water triangulation, multi-branching Real Botanical & Artificial Cyber-Dendritic park trees + custom lights + catenary links (`TREE_MODE_NAMES`), `FlyControls` smooth inertial damping + shallow-angle long-range anticipatory obstacle avoidance, 6 artistic/diagnostic post-processing render styles (`ART_STYLE_NAMES` + `DepthTexture`), `0..20,000` smooth multi-strata vehicles, spherical `bendWorld` curvature, exact-state tokens, and clean render/path capture.
- `tests/ui-contract.test.mjs` — static/DOM contract ensuring every `$('#id')` selector in `src/main.js` resolves in `index.html`, zero external network URLs exist, and all glyph/icon buttons carry `aria-label` and `title`.
- `tests/boot.test.mjs` — end-to-end boot smoke test (`index.html` + `src/main.js` under `jsdom` with mocked WebGL 2).

### CI / GitHub Pages Deployment
- `.github/workflows/pages.yml` runs `npm test` and deploys the repository root to GitHub Pages on pushes to `main` and `arena/*` branches (`pages: write`, `id-token: write`, no environment gate).

---

## 2. Repository Architecture

| File | Responsibility |
| :--- | :--- |
| `index.html` | Compact glyph-first HUD, CSS theme variables, canvas `#stage`, overlay grain/scanlines/vignette, and boot error surface (`#loading`). |
| `src/main.js` | Application bootstrap, URL query & exact-state hydration, HUD slider/dropdown/hotkey bindings, live 24h celestial clock loop (`T`), camera fly-tos, and `requestAnimationFrame` loop. |
| `src/city.js` | Deterministic city & macro-environment generator (`generateCity`) and 3D terrain-aware spatial collider (`makeCityCollider`): Voronoi districts, 5 water/shoreline modes (`makeWaters`), 5 distant 3D terrain modes (`evalTerrainHeight`), tower archetypes, 9 landmark kinds, 7 public venue kinds (guaranteed `park` groves + `treeLinks`), curvilinear non-grid suburbs (`addHorizonSuburbs`) with street-aligned houses, shops, power stations & Voronoi farmsteads, and the 6-deck horizontal street-grid lane graph (`makeLanes`). |
| `src/scene.js` | Three.js scene graph & uniform orchestration (`makeUniforms`, `makeWorld`, `syncCityEnvironmentUniforms`, `applyLook`, `applyTime`), theme-reactive `buildLandmarks` & `buildPlaces` (`setLook`), multi-branching Real Botanical & Artificial Cyber-Dendritic `buildTrees` + custom lights + catenary `treeLinks`, analytical ocean/lake/river `buildWater`, Tier-1 CPU hero vehicles + Tier-2 GPU swarm (`makeVehicles`), volumetric cloud puff field, billboards, holograms, searchlights, and weather (`makeWeather`). |
| `src/shaders.js` | All 34 scene GLSL vertex/fragment shaders, shared 3D value-noise/FBM library, `GLSL_CURVE` (`bendWorld`), `GLSL_TERRAIN` (shared JS/GLSL 3D terrain & coastline SDF), de-gridded Voronoi farmland/suburb/mountain/desert/beach `GROUND_FRAG`, surf-foam `WATER_FRAG`, catenary `TREE_LINK_VERT`/`FRAG`, volumetric `SKY_FRAG` & `CLOUD_FRAG`, `TOWER_FRAG`, and 4-role `LANDMARK_FRAG`. |
| `src/looks.js` | 8 pluggable visual looks (`bladerunner`, `anime`, `abstract`, `tron`, `outrun`, `clay`, `metropolis`, plus runtime `custom`) and `syncCustomLook` palette synthesizer. |
| `src/post.js` | Multi-pass HDR HalfFloat + hardware `DepthTexture` post-processor (`makePostProcessor`): bloom, chromatic lens dispersion/halation, color grading, StormyClouds old-film grain/specks, and 6 runtime-switchable render styles (`ART_STYLE_NAMES`: `Cinema`, `X-Ray Structural`, `Architectural Ink Sketch`, `Charcoal & Chalk`, `Painterly Impasto`, `Impressionist Nocturne`). |
| `src/controls.js` | Smooth inertial Fly & Glide camera (`FlyControls`) with critically-damped look/velocity, aerodynamic turn banking, long-range (`115–380m`) 8-whisker shallow-angle anticipatory obstacle & terrain avoidance (`V`), autonomous scenic `Glide` cruise (`G`), building/terrain collision (`C`), and radial planetoid local-up frame. |
| `src/presets.js` | Curated `WORLD_PRESETS`, `DEFAULT_BOOKMARKS`, and lossless `normalizeExactState` / `encodeExactState` / `decodeExactState` (`?s=` Base64URL token + JSON import/export). |
| `src/recorder.js` | `CameraPathRecorder` (Catmull-Rom + squad quaternion keyframe/flight recorder, `R`/`K`/`P`) and `makeSceneExporter` (HUD-free `Viewport`/`1080p`/`2x`/`4K` PNG stills & `60fps` WebM/MP4 video). |
| `src/prng.js` | Seeded `mulberry32`, integer 2D hash `hash2i`, and 2D value noise / `fbm2D`. |

---

## 3. Core Systems Design (Including Phase-9 & Phase-10 Upgrades)

### A. Horizontal Street-Aligned Traffic, Grade Separation & Corner Turns
- **6 Horizontal Street Strata (`DECKS` in `src/city.js` `makeLanes`)**:
  - Vehicles travel along flat horizontal street corridors aligned with the N–S and E–W city street grid (`y1 === y2` along block segments).
  - **Perpendicular Grade Separation**: On every deck (`0..5`, from street-level `5.8m / 19.8m` up to `368m / 406m`), N–S streets (`yNS`) and E–W streets (`yEW`) sit at distinct elevations (`14m–38m` apart). Perpendicular streams pass cleanly over/under one another without traffic lights or intersection collisions.
  - **Directed Intersection Graph (`L.outs`)**: At every clear intersection, arriving lanes branch into weighted straight-through spans (`kind: 'thru'`) and tangent-exact 90° left/right corner turns (`kind: 'turn'`) whose Hermite vertical profile (`L.prof`) smoothly bridges `yNS <-> yEW`. Roughly `18%` of avenue segments also emit smooth street-aligned elevation-switch ramps (`kind: 'ramp'`) between adjacent horizontal decks.
  - **Seamless Multi-Segment Vehicle & Trailer Stepping (`makeVehicles` in `src/scene.js`)**:
    - Hero vehicles pre-select `nextLane[i]` from `L.outs` and retain `prevLane[i]`, so velocity tangents, aerodynamic roll banking around local `+X`, and articulated 2-trailer hauler trains bend smoothly around 90° street corners without shrinking or popping.
    - The GPU swarm (`SWARM_VERT`, up to `18,600+` craft at zero CPU per-frame cost) evaluates flat street runs (`mode < -0.5`), smooth deck switches, 90° street-intersection turns (`mode = turnR > 0.5`), and high orbital rings (`abs(mode) <= 0.5`) across all 6 vertical strata (`0..20,000` total vehicles).

### B. Theme-Following Special Structures & New Megastructures
- **New Landmark & Tower Types**:
  - Landmarks (`LM_KINDS`): added monumental **`pyramid`** (Neo-Mayan / Tyrell sloped 4-face arcology pyramid with armored arris spines, 3 recessed glowing sky-terraces, 4 axial grand stairways, summit sanctuary, and hovering pyramidion + halo), **`cantilever`** (twin mega-shear cores with 3 alternating horizontal cantilevered sky-wings, diagonal tension ties & compression knee-struts, glowing underside sky-lobbies, and cantilevered helipad), and **`ziggurat`** (7-tier stepped hanging-terrace ziggurat with corner bastions, colonnade galleries, and 4 grand stairways), alongside enriched `arch`, `spire`, `dome`, `mast`, `crown`, and `needle`.
  - Block Towers (`addTower` in `src/city.js`): added **Stepped Arcology Pyramid** blocks and **Cantilevered Sky-Wing** towers into the procedural skyline mix.
- **Live Theme Synchronization (`LANDMARK_FRAG` + `setLook`)**:
  - `LANDMARK_FRAG` supports 4 architectural material roles (`uRole = 0` primary casing with procedural mullions/fluting, `1` heavy structural stone/alloy plinths & trusses, `2` glowing accent crowns/arrises, `3` illuminated panoramic sky-galleries), plus `uToon`, `uFlat`, `uBandGlow`, `uWinC`, and street bounce `uPoolCol`.
  - Both `buildLandmarks` and `buildPlaces` expose `.setLook(look)` (wired into `rebuild()` and `refreshLook()` in `src/main.js`), re-deriving a 5-tone architectural palette from any active look (`Blade Runner`, `Anime`, `Abstract`, `Tron`, `Outrun`, `Clay`, `Metropolis`, or live `Custom` color pickers).

### C. Complete 24-Hour Celestial Paths & Full 8-Phase Moon
- **Spherical Celestial Orbits (`applyTime` in `src/scene.js` + `SKY_FRAG`)**:
  - **Sun (`uSolarDir`)**: Traces an inclined great-circle sky trajectory—rises on the Eastern horizon at `~06:00` with warm civil/nautical twilight horizon glow, transits high (`y > 0.94`) at `12:00`, sets on the Western horizon at `~18:00`, and travels genuinely below the horizon (`y < 0`) throughout the night.
  - **Moon (`uMoonDir` & `uMoonPhase`)**: Follows an inclined 3D great-circle lunar orbit across moonrise, high meridian transit, moonset, and below-horizon phases. `uMoonPhase` (`#sl-moonph` `0..2`) illuminates a true 3D lunar sphere (`mn = (mp.x, mp.y, sqrt(1 - r^2))`) with procedural maria, terminator crater relief, Lommel-Seeliger limb brightness, and earthshine across **all 8 synodic phases**: *New Moon (`0.0`)* → *Waxing Crescent (`0.25`)* → *First Quarter (`0.5`)* → *Waxing Gibbous (`0.75`)* → *Full Moon (`1.0`)* → *Waning Gibbous (`1.25`)* → *Third Quarter (`1.5`)* → *Waning Crescent (`1.75`)* → *New Moon (`2.0`)*.
  - **Sidereal Star Vault (`uStarRot`)**: Stars and the diagonal galactic band rotate continuously around an inclined celestial pole across the 24-hour cycle.
  - **Live Time-Cycle Play Toggle (`#b-time-play` / hotkey `T`)**: Runs a continuous 24h day/night & lunar progression directly in the HUD with live `HH:MM` and moon-phase glyph readouts.

### D. Volumetric Cloud Formations & Cloud Cover Range
- **6 Volumetric Cloud Types (`#sel-cloudtype` -> `uCloudType = 0..5`)**:
  - `0` **Fair-weather Cumulus** — rounded convective puffs over flat moisture bases.
  - `1` **Thunderheads (Cumulonimbus)** — deep towering convective turrets spreading into sheared upper anvils.
  - `2` **Stratocumulus Deck** — broad horizontal cellular rolls & cloud streets.
  - `3` **High Ice Cirrus** — wind-sheared high-altitude ice-crystal filaments & mares' tails.
  - `4` **Multi-layer Altocumulus + Cirrus** — mid-level mackerel sky paired with high sheared cirrus.
  - `5` **Low Sea-of-Clouds Blanket** — low inversion fog/cloud sea threading around skyscraper spires.
- **Full Cloud-Cover Spectrum (`#sl-clouds` `0.0 .. 2.4`)**:
  - Scales smoothly from `0.0` crystal-clear sky through scattered/broken decks up to `2.4` solid overcast (softening direct solar disc glare and working even on clear-authored looks like `Tron` or `Abstract` when raised above `1.05`). Compatible with all 7 `StormyClouds` rendering plates (`#sel-cloudstyle`).

### E. Macro-Environment: Shorelines, Large Water Bodies & 3D Distant Terrain
- **Shared Analytical JS/GLSL Terrain & Coastline (`evalCoastSignedDist` & `evalTerrainHeight` in `src/city.js` + `GLSL_TERRAIN` in `src/shaders.js`)**:
  - Exactly identical wave-FBM, ridged-multifractal, and coastline signed-distance equations run in JS (for seating suburbs, piers, farmsteads, trees, and 3D camera collision `groundHeightAt`) and in `GROUND_VERT` / `GROUND_FRAG` / `WATER_FRAG` on the `13.5km` (`112 × 144`) polar disc.
  - **5 Water & Shoreline Modes (`#sel-water` -> `uWaterMode = 0..4`)**:
    `0` *Harbor & Winding River* (meandering S-curve river ribbon triangulated bank-to-bank + harbor fans), `1` *Coastal Ocean & Bay* (vast analytical ocean sector at `y = 0.25m` intersecting curved sandy beaches, animated surf-foam waves, wooden piers & offshore lighthouse), `2` *Archipelago & Peninsula* (wrap-around sea with 4 3D mountainous offshore islands), `3` *Great Crater Lake* (expansive organic inland lake nestled against foothills), and `4` *Dry Arid Basin*.
  - **5 Distant Terrain Modes (`#sel-terrain` -> `uTerrainMode = 0..4` + `#sl-relief` `0..2`)**:
    `0` *Distant Mountains* (ridged-multifractal alpine peaks with snowlines & foothill passes), `1` *Desert Dunes & Mesas* (wind-rippled barchan dunes + stepped red-rock mesas), `2` *Rolling Farmland Hills*, `3` *Volcanic Caldera Rim*, and `4` *Flat Horizon Plain*. Urban core stays strictly at `y = 0` so downtown streets and traffic decks remain level.

### F. De-Gridded Curvilinear Suburbs, Neighborhood POIs & Voronoi Farmland
- **Zero Square Grid Outside the Urban Core (`GROUND_FRAG` + `addHorizonSuburbs`)**:
  - Beyond `uCitySpan`, orthogonal avenue grids smoothly dissolve into FBM-warped winding arterial roads, cul-de-sac ring lanes, and **irregular 2D Voronoi agricultural fields** with rotated crop-furrow textures, hedgerow borders, golden/emerald/terracotta crop variants, and irrigated greenhouse strips.
- **Street-Following Low-Story Houses & Rural Infrastructure**:
  - Suburban 1–2 story houses (`addSuburbanHouse`) sit setback from curved road tangents with continuous street-aligned rotations (`rot`), gabled roofs, side garages, and warm domestic window lighting in `TOWER_FRAG`.
  - Interspersed along suburban collectors and rural Voronoi cells (`city.suburbPOIs`, selectable in `#sel-poi`): illuminated corner **Neighborhood Shops** (`addSuburbanShop`), **Regional Power Stations** (`addPowerStation` with twin hyperboloid cooling towers, switchyards & transmission pylons), and **Patchwork Farmsteads** (`addFarmstead` with red barns, grain silos, greenhouses & shelterbelt windbreaks).

### G. Smooth Inertial Camera & Shallow-Angle Anticipatory Obstacle Avoidance
- **`FlyControls` (`src/controls.js`, toggle `#b-avoid` / hotkey `V`)**:
  - Critically-damped pointer look (`lookAlpha`) and exponential velocity smoothing (`_vel.lerp(desiredVel, ...)`) deliver silky acceleration, aerodynamic turn banking, and smooth coast-to-rest deceleration.
  - **Long-Range Multi-Whisker Course Anticipation (`115–380m` ahead)**: Casts a multi-step forward corridor probe (`comfortPad = 26m`) plus 8 symmetric lateral grazing whiskers (`±14°, ±29°, ±48°, ±71°`). As soon as a skyscraper, landmark, or mountain ridge enters the far horizon (`200m+` out), the controller progressively curves yaw (with side-hysteresis `_avoidSide` so it never flip-flops) or pitches into a gentle climb over foothills/low roofs—gliding past obstacles at a shallow grazing angle well before approaching head-on.

### H. Botanical & Cyber-Dendritic Parks with Custom Lights & Connections
- **Dedicated Park Architecture (`buildPlaces` `kind === 'park'` + `buildTrees` in `src/scene.js`, `#sel-trees` `0..3`)**:
  - Every city guarantees lush botanical/cyber parks featuring reflecting ponds, elevated illuminated skywalk rings on piers, glass conservatory domes, and dense multi-species procedural tree groves.
  - **4 Park Tree Modes**: `0` *Auto (Follow Theme)*, `1` *Real Botanical* (multi-order tapered trunks, primary/secondary boughs, layered organic crown clusters & warm hanging lantern `Points`), `2` *Artificial Cyber-Trees* (faceted alloy trunks, geometric dendritic struts, holographic ring canopies & glowing neon tip nodes), and `3` *Hybrid Bio-Cyber Grove*.
  - **Inter-Tree Catenary Network (`city.treeLinks` + `TREE_LINK_VERT`/`FRAG`)**: Neighboring park and boulevard trees are linked by sagging 3D catenary light-cables with animated traveling bioluminescent/data pulses and elevated timber/neon canopy skywalk bridges.

### I. X-Ray, Sketch/Drawing & Painterly/Impressionist Post-Processing Styles
- **Hardware Depth + 6 Render Styles (`#sel-art` `0..5` + `#sl-artstr` `0..1.4` in `src/post.js`)**:
  - `sceneRT` attaches a `THREE.DepthTexture` (`tDepth`) alongside HDR scene & bloom buffers so `COMP_FRAG` combines 3D linear-depth discontinuities with Sobel luminance gradients and Kuwahara/flow kernels:
    - `0` **Cinema (Default)** — Filmic ACES tonemap, bloom, anamorphic flare, grade & subtle grain.
    - `1` **X-Ray Structural** — Translucent cyan/cobalt depth-shell radiograph, razor-crisp depth + facade wireframe, plasma emissive tracers & engineering reticle.
    - `2` **Architectural Ink Sketch** — Fountain-pen contour boil, 4-angle progressive cross-hatching & delicate theme-tinted watercolor wash on warm cotton paper.
    - `3` **Charcoal & Chalk** — Velvety dry-charcoal shadow strokes & luminous white Conté chalk highlights on laid Ingres paper.
    - `4` **Painterly Impasto** — 4-quadrant edge-preserving Kuwahara oil/gouache brush planes with linen canvas weave & ridge catchlights.
    - `5` **Impressionist Nocturne** — Gradient-tangent oriented anisotropic brush dabs with broken-color warm/cool chroma vibration & bristle grooves.

---

## 4. Critical Invariants & Pitfalls to Preserve

1. **WebGL 2 (`#version 300 es`) Reserved Keywords**:
   - `vendor/three.module.js` (`r170`) compiles `ShaderMaterial` as `#version 300 es` on WebGL 2 contexts. Never use ESSL 3.00 §3.7 reserved words (`active`, `sample`, `smooth`, `flat`, `centroid`, `filter`, `common`, `partition`, `half`, `fixed`, `input`, `output`, `interface`, `inline`, `packed`, `superp`, etc.) as variable or function names in any GLSL string. `tests/scene.test.mjs` enforces this automatically.
2. **Non-Polygonal Volumetric Clouds**:
   - Never displace low-poly icosahedrons or shade cloud meshes with polygon normals (`vN`). Keep `world.cloudMat.side = THREE.BackSide` on bounding boxes whose analytical 3D density falls strictly to `0.0` inside `r <= 0.88 < 1.0`, paired with the concentric spherical shell raymarch (`intersectSphereShell` + `skyCumulusDensity`) in `SKY_FRAG`.
3. **Vehicle Forward Axis (`+X`) & C1 Lane Continuity**:
   - All procedural vehicle meshes are authored with nose along `+X` (`(1, 0, 0)`). Keep Euler order `e.set(0, yaw, pitch, 'YXZ')` and post-multiply roll strictly around local `+X`. Never call discrete rooftop queries inside per-frame `composeAt`.
4. **UI Selector & Accessibility Contract**:
   - In `src/main.js`, always pass `#`-prefixed string literals to `$('#some-id')`, and give every `<button>` in `index.html` both `aria-label` and `title` (`tests/ui-contract.test.mjs`).
5. **Spherical World Curvature (`bendWorld`)**:
   - Any new world-space geometry added to the city must route its vertex shader through `bendWorld(wp.xyz)` (`GLSL_CURVE`) and keep ground/water/boulevard meshes subdivided so `worldCurve` (`Plane <-> Globe`) bends seamlessly without exposing world edges.

---

## 5. Suggested Next Ideas
- **Interactive Skyway Transit Stations**: Elevated passenger boarding platforms docked against `cantilever` and `ziggurat` sky-lobbies where `shuttle` (`cc = 4`) craft briefly pause before re-entering the horizontal avenue stream.
- **Procedural Audio / Synth Ambience (Opt-in)**: WebAudio synthesis reactive to altitude (`street canyon` vs `cloud deck` vs `orbital`), weather mode, and active look.
- **Custom Landmark Inspector**: Click-to-select a landmark or public venue on the canvas to display its procedural name, district, elevation, and quick fly-around orbit camera.
