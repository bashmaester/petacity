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

The suite (`69` tests across 4 files) validates:
- `tests/city.test.mjs` — deterministic PRNG/noise, district layout, strict water-body exclusion (`isPointInWater` across all 4 wet shoreline/river/lake modes), feature amount dials (`0 = completely off` up to cranked: `waterAmount`, `shoreDist`, `vegCover`, `transitAmt`, `maritimeAmt`, `airAmt`, `signAmt`, `megaWrap`, `suburbReach`, `terrainRelief`), landmarks (`arch`, `spire`, `dome`, `mast`, `crown`, `needle`, `pyramid`, `cantilever`, `ziggurat`), public venues including the `2×2` superblock `'Grand Conservatory Park'` Showcase Park, 5 macro-water/shoreline modes (`WATER_MODE_NAMES`), River Bridges (`cable-stayed`, `tied-arch`, `suspension`), Deep-Water Harbor (`piers`, `cranes`, `cruise` liners, `container` ships, tugs/yachts), Orbital Air/Spaceport (`runway`, `controlTower`, `launchPad`, `hangars`, `vtolPads`), 3-line Cross-City Public Transit Network (`lines` + elevated `stations`), 5 distant 3D terrain modes (`TERRAIN_MODE_NAMES`), shared JS/GLSL curvilinear road-web trapezoid land subdivision (`evalRoadWeb` & `roadWebToWorld`), organic arterial ribbon growth, and grade-separated horizontal street-grid traffic lanes.
- `tests/scene.test.mjs` — shader-to-uniform bidirectional parity, instanced attribute contracts, ESSL 3.00 (`#version 300 es`) reserved-keyword safety across all `40` GLSL shaders, `9` pluggable visual looks including `'realistic'` (`Unreal Cinema`) with controllable `uTint` (`0..1`) per-instance building & vehicle variation, non-flooding analytical water (`vAnalytical > 0.5 && cDist > 0.0` land discard + shoreward `+ uTime` surf), 4D volumetric clouds (`fbm4Cloud`, `uCloudSeed`, `uCloudEvol`, `uCloudLac`, `0 = crystal-clear`), animated synthetic Linear A/B + Cyber-Synth glyph language (`GLSL_GLYPHS` `evalSynthGlyph` / `evalGlyphLine` across billboards, holograms & mega-facade tower wraps), `applyLook` / `applyTime` 24-hour celestial orbits & circadian windows, full 8-phase lunar cycle (`0..2`), multi-branching Real Botanical & Artificial Cyber-Dendritic mega-trees (`vegScale` up to `4.5x`), `buildTransitInfrastructure`, `buildBridges`, `buildHarbor`, `buildSpaceport`, `FlyControls` smooth anticipatory steering, 6 artistic/X-ray post styles, 8 sci-fi vehicle silhouettes with sparse default train share & `setTransitAmt(0)`, sweeping blimp & skyscraper searchlights, `0..20,000` vehicles, spherical `bendWorld` curvature, exact-state tokens, and clean render/path capture.
- `tests/ui-contract.test.mjs` — static/DOM contract ensuring every `$('#id')` selector in `src/main.js` resolves in `index.html`, collapsible HUD `<details class="subpanel">` sections + `#b-fold-all` work cleanly, zero external network URLs exist, and all glyph/icon buttons carry `aria-label` and `title`.
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
| `src/looks.js` | 9 pluggable visual looks (`bladerunner`, `realistic` (`Unreal Cinema`), `anime`, `abstract`, `tron`, `outrun`, `clay`, `metropolis`, plus runtime `custom`) with controllable `defTint` defaults and `syncCustomLook` palette synthesizer. |
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

### J. Phase-11: Strict Water Exclusion, Road-Web Trapezoid Parcels, Sci-Fi Fleet & Circadian Windows
- **Zero-Water Building Guarantee (`src/city.js`)**:
  - `isPointInWater(city, x, z, pad)` unifies analytical shorelines (`evalCoastSignedDist`) and polygonal rivers/harbors (`pointInPoly` + `distToPolyEdges` accelerated by a `280m` `waterCells` spatial hash).
  - Every `push(...)` checks `boxTouchesWater` across center + all 4 rotated footprint corners, keeping skyscrapers, corridor towers, suburban houses, farmsteads, power pylons, landmarks, venues, lamps, signs, and bluff lighthouses strictly on dry land.
- **Road-Aligned Curvilinear Trapezoid Land Subdivision & Arterial Ribbon Growth (`evalRoadWeb` & `roadWebToWorld`)**:
  - Shared `2π`-periodic radial highways (`12` winding arterials) and `380m` curved collector rings partition the countryside into road-bounded curvilinear trapezoids (`(cellU, fu, cellV, fv)`) rather than road-ignoring Voronoi cells.
  - `addArterialCorridors` grows high-rise/mid-rise commercial fingers outward along major radial highways, while `addHorizonSuburbs` (`8 km` at `r=5`) subdivides each trapezoid into `2..4` parallel residential streets (`~17,400+` low-rise houses, shops & power stations) transitioning into road-parallel strip-crop farmland.
- **Sci-Fi Vehicle Variety, Smooth Rail-Locked Sky-Trains & Front/Rear Lamps (`src/scene.js`, `src/shaders.js`)**:
  - 8 procedural classes with realistic fleet weights: **~92.4% cars** (`DeLorean DMC-12 Hover-Coupe`, *Fifth Element* `Retro-Cab`, `Cyber-Wedge GT`, `Executive Hover-Cruiser`, `Blade Runner Spinner`), **~4.8% 5-car `Maglev Sky-Trains`** riding dedicated closed `railLoop` monorails via exact arc-length `composeRailCoach`, **~1.8% `Patrol Helicopters`**, and **~1.0% `112m Off-World Blimps`**.
  - Wide `GATE = 40m` corner fillets, turn deceleration, and bounded continuous yaw/pitch/bank damping eliminate sudden heading snaps.
  - `VEHICLE_VERT`/`VEHICLE_FRAG` (`attribute float aRole`) and `SWARM_FRAG` keep warm-white/xenon front headlights (`+X`, `aRole=3`) and crimson-red rear taillights (`-X`, `aRole=4`) pure and untinted by hull paint.
- **Animated Blimp & Skyscraper Searchlights + 24-Hour Circadian Windows**:
  - `beamGeometry` populates `uv` (`[w, t]`) alongside `aBeamT`/`aBeamW` on flared spotlight cones so both `makeSearchlights` (`34` Lissajous-sweeping skyscraper, landmark & venue shafts) and dual gimbal-sweeping blimp/helicopter searchlights (`veh.beams[4..5]` + `veh.blimpSearchlights`) render bright volumetric shafts.
  - `TOWER_FRAG` and `LANDMARK_FRAG` consume `uDayPhase` (`0..24`, synced in `applyTime`) for 24-hour circadian window waves (predawn wake-up, daytime sky/sun glass reflection + blinds, staggered dusk wave, live `uTime` room toggles + TV/holo shimmer, late-night taper, and moving exterior glass elevators on towers `> 42m`).

### K. Phase-12: Collapsible HUD Subpanels, Unreal Cinema Tint, Non-Flooding Water, 4D Clouds, Synthetic Linear-Synth Signage, Harbor, Bridges, Transit Network & Spaceport
- **Minimizable / Collapsible HUD Subpanels (`index.html`, `src/main.js`)**:
  - `#hud .panel-body` is organized into **10 independent `<details class="subpanel">` sections** (*Presets & Navigation*, *Look & Theme Tint*, *City Scale & Traffic*, *Water & Shoreline*, *Clouds & Atmosphere*, *Signage, Billboards & Glyphs*, *Parks, Terrain & Suburbs*, *Time & Celestial Cycle*, *Post-FX & Render Style*, and *Capture & Exact State*) with a header Fold/Expand All toggle (`#b-fold-all`).
- **`Unreal Cinema` (`'realistic'`) Look & Controllable Theme Tint (`#sl-tint` -> `uTint` `0..1`)**:
  - Added `'realistic'` (`Unreal Cinema`, `defTint: 0.44`, `defTime: 17.3`): Rayleigh cobalt zenith, warm golden-hour sunset horizon, realistic asphalt/granite street tones, and physically grounded glass/concrete/steel towers.
  - Every look acts as a controllable **Theme Tint (`uTint`)**: at lower tint (`0.0..0.55`), buildings (`TOWER_FRAG`, `LANDMARK_FRAG`) and vehicles (`VEHICLE_FRAG`, `SWARM_FRAG`, `makeVehicles.setPalette`) blend per-instance architectural stone/concrete/tinted-glass/anodized-steel and automotive paint finishes with the look palette so instances never appear uniformly colored; at `1.0`, full stylized look dominance is applied (strictly preserving `Metropolis` monochrome).
- **Non-Flooding Water, Shoreward Surf & Dedicated Water Controls (`#sel-water`, `#sl-water-amt`, `#sl-shoredist`, `#sl-maritime`)**:
  - Analytical ocean/lake meshes (`aAnalytical = 1.0` at `y = -0.22m`) execute `if (vAnalytical > 0.5 && cDist > 0.0) discard;` in `WATER_FRAG` (and `if (uWaterAmt <= 0.005) discard;`), eliminating inland wave stripes over downtown streets while preserving polygonal inland rivers, harbor basins, and park ponds (`aAnalytical = 0.0`).
  - Surf phase uses `+ uTime` (`sin(shoalK * 0.23 + uTime * 2.15 + ...)`) so breaking waves roll **inward onto the shore** rather than backward out to sea.
  - Dedicated controls cover No Shoreline (`waterMode = 0` or `waterAmount = 0`), Water Amount (`0..2`), Shoreline Distance (`0.45..2.4x` offshore shift via `uShoreDist` / `evalCoastSignedDist`), and Harbor & Ships (`0..2`).
- **4D Volumetric Cloud Controls (`#sl-clouds`, `#sl-cloud-seed`, `#sl-cloud-evol`, `#sl-cloud-lac`)**:
  - Coverage (`#sl-clouds`) reaches `0.00` (`uCloud = 0`, `world.clouds.visible = false` and `CLOUD_FRAG` discard for crystal-clear sky).
  - Shared `fbm4Cloud(vec3 p, float wTime, float seed, float lac)` in `GLSL_NOISE` drives 4D time-evolving cloud morphology (`uCloudEvol`), deterministic formation reseeding (`uCloudSeed`), fractal octave lacunarity (`uCloudLac` `1.4..3.2`), and deep fractal edge carving on `BackSide` cloud puffs.
- **Invented Animated Linear-Synth Glyph Script & Mega-Facade Signage (`GLSL_GLYPHS`)**:
  - Purely synthetic procedural glyph script (`evalSingleGlyphDist`, `evalSynthGlyph`, `evalGlyphLine` — inspired by Minoan Linear A/B ideograms and cybernetic sigils, zero real-world alphabets) with smooth `cubicSmooth` character morphing, scrolling tickers, and vertical cascades across `BILL_FRAG`, `HOLO_FRAG`, and `TOWER_FRAG`.
  - Signage subpanel controls **Signage & Billboards (`#sl-signs` `0..2.5`)**, **Mega-Facade Wraps (`#sl-megawrap` `0..2` — multi-story animated facade screens on skyscrapers)**, **Glyph Script (`#sel-glyph` — Linear-Synth Hybrid / Archaic Linear A/B / Cyber Geometric)**, and **Sign Animation (`#sl-sign-anim` `0..2.5`)**.
- **Feature Amount Dials (`0 = Off` .. Cranked) & Civic Megastructures (`src/city.js`, `src/scene.js`)**:
  - **Vegetation Cover (`#sl-veg-cover` `0..2.5`) & Mega-Tree Scale (`#sl-veg-scale` `0.35..4.5x`)** plus guaranteed `2×2` superblock **`Grand Conservatory Park`** (`p.showcase === true`, glass biomes, reflecting lagoon, elevated skywalk ring & towering supertrees).
  - **Multi-Line Cross-City Public Transit Network (`makeTransitNetwork` + `buildTransitInfrastructure`, `#sl-transit` `0..2.5`)**: 3 orthogonal street-aligned cross-city trunk & beltway lines (`Central North–South Trunk`, `Crosstown Waterfront Express`, `District Quadrangle Beltway`) with elevated guideway beams, piers, and glowing passenger **Transit Stations**, paired with a sparse, realistic default train fleet share (`~1.0%`) and `veh.setTransitAmt(0)` instant shutoff.
  - **Deep-Water Harbor (`makeHarbor` + `buildHarbor`, `#sl-maritime` `0..2`)**: Quay seawall, finger piers, container gantry cranes, multi-deck **Luxury Cruise Liners** (illuminated cabin tiers, bridge wings, pool decks & funnels), **Container Cargo Ships** (colored TEU stacks & stern superstructure), and harbor tugs/yachts with gentle sea bobbing.
  - **Monumental River Bridges (`makeBridges` + `buildBridges`)**: Cable-stayed H-pylon + harp fan stays, tied-arch steel ribs + vertical hangers, and suspension catenary bridges spanning coastal & inland rivers.
  - **Orbital Air / Spaceport (`makeSpaceport` + `buildSpaceport`, `#sl-air` `0..2`)**: Illuminated runway + animated approach strobes, air-traffic control tower with rotating radar bar, orbital launch pad + umbilical tower + flame trenches + vertical starship/shuttle stack, arched hangar domes, and glowing VTOL pads (strictly excluded from suburban house spawning).

### L. Phase-13: Small Adjustable Camera Collider, Freelook, Interactive Minimap, Cinematic Path Smoothing, Dedicated Lights Section, Universal 24h Day/Night, Seamless Looped Noise, Stylized Water & Street Infrastructure
- **Camera Speed, Motion Styles, Small Adjustable Collider & Separate Freelook (`src/controls.js`, `index.html`, `src/main.js`)**:
  - **Small Adjustable Camera Collider (`#sl-camcol` `0.5..12.0m`, default `2.2m`)**: Reduced default camera collision sphere from `9m` to `2.2m` (adjustable down to `0.5m`) with substepped anti-tunneling (`_resolveAt` along `prev -> pos` so high speeds never pass through thin walls) and gentle `quintic` wall cushion + C2-smooth 5-ray anticipatory avoidance (`#sl-camsmooth`). The camera slips cleanly through narrow alleys and gaps between skyscrapers without ever clipping inside buildings.
  - **Camera Speed & Motion Styles (`#sl-camspeed` `0.2..3.0x`, `#sel-camstyle`)**: Four distinct flight dynamics — *Cinematic Drone* (banked turns + heavy inertia), *Balanced Cruiser*, *Precision Survey* (crisp damping, zero roll), and *Dynamic Swoop* (expressive banking + wide horizon sweep).
  - **Separate Look-Around / Freelook Mode (`#b-freelook`, key `L`)**: Decouples head/gaze yaw & pitch (`_headYaw`, `_headPitch`) from forward flight direction (`_travelYaw`, `_travelPitch`) so users can look sideways, straight up, or behind while cruising along avenues, gliding on autopilot, or playing back a recorded camera path (`recorder.applyAt(..., { freelook })`).
- **Interactive Minimap & Post-Recording Cinematic Path Smoothing (`src/minimap.js`, `src/recorder.js`)**:
  - **Interactive Minimap (`#minimap`, `#b-map-follow`, `#b-map-zin`, `#b-map-zout`)**: 2D canvas radar rendering water bodies, shorelines, harbor piers/beach, bridges, parks, transit trunks, named landmarks/POIs (click any site on the minimap to teleport/fly there), live camera position + separate travel vs freelook FOV cones, and the recorded camera path ribbon with manual (`K`) vs auto keyframes and live playback scrub head.
  - **Post-Recording Camera Path Smoothing (`CameraPathRecorder.smoothPath`, `#sl-pathsmooth`, `#b-pathsmooth`)**: Non-destructive zero-phase `[1, 4, 6, 4, 1]/16` binomial spline filter (`_rawFrames` preserved so smoothing strength `0..1` can be re-dialed anytime without cumulative shrinkage), antipodal-safe quaternion smoothing, sparse-keyframe C1 Catmull-Rom upsampling, and pinned manual `K` keyframe anchors.
- **Dedicated Lights Subpanel (`Lights, Searchlights & Signals`)**:
  - Separate collapsible HUD section controlling **Window & Facade Lights (`#sl-light`)**, **Sky Searchlights (`#sl-searchlights` -> `searchlights.setAmount`)**, **Traffic Signal Glow (`#sl-siglight` -> `U.uSignalGlow`)**, and **Vehicle & Ship Lights (`#sl-vehlight` -> `U.uVehLight`)**.
- **Universal 24h Day/Night Cycle, Separate Day/Night Speed & Non-Uniform Dry-Land Traffic (`src/scene.js`, `src/city.js`)**:
  - Every look (`bladerunner`, `realistic`, `anime`, `abstract`, `tron`, `outrun`, `clay`, `metropolis`, `custom`) supports a full, vibrant 24-hour day-and-night cycle (`applyTime` lifts pitch-black night sky presets into atmospheric daytime skies around solar noon while preserving `Metropolis` strict `0` saturation and smooth midnight wrap via `evalCircadian24`).
  - **Separate Speed Dials**: **Day/Night Cycle Speed (`#sl-dayspeed`)** is decoupled from **Traffic Speed (`#sl-traffspeed` -> `U.uTrafficSpeed` & `vehicles.setTrafficSpeed`)**.
  - **Non-Uniform Sophisticated Traffic & Dry-Land Grid**: Street-grid markings (`shoreDryRoad` in `GROUND_FRAG`), deck lanes (`segmentDry` in `makeLanes`), and GPU swarm routes (`dryGridPairs` + `isSwarmPathClear` in `makeVehicles`) stop cleanly at shorelines rather than continuing across open water, while explicit river bridges (`kind: 'bridge'`) carry traffic across rivers. Vehicles exhibit per-driver speed distributions, intersection signal queuing/platooning (`evalTrafficSignalState`), and transit station dwell pauses.
- **Seamless Looped Noise (`PC_LOOP = 120.0`, `src/shaders.js`, `src/scene.js`, `src/main.js`)**:
  - `U.uTime.value = (U.uTime.value + dt) % 120.0` pairs with exact integer-harmonic phase helpers (`loopPhase`, `evalLoopedToggle`, `loopCircle2`, closed-circle `fbm4Cloud` wind orbits, integer-harmonic `makeSearchlights` Lissajous sweeps, and `evalCircadian24`) so building windows, clouds, water waves, signage, weather, and searchlights loop with **zero visual discontinuity** at cycle boundaries.
- **Cloud Elevation & Vertical Range Controls (`#sl-cloudelev`, `#sl-cloudrange`)**:
  - `uCloudElev` (`0.4..2.4x`) and `uCloudRange` (`0.4..2.8x`) drive both the `SKY_FRAG` concentric cumulus shell (`rInner..rOuter`) and `world.clouds` puff altitudes/thickness so clouds can hug skyscraper spires or span deep multi-kilometer vertical formations.
- **Stylized Directional Water + Ship Wakes, Organic River/Pond Shapes & Sandy Beach Transitions (`WATER_FRAG`, `GROUND_FRAG`, `src/city.js`, `src/scene.js`)**:
  - Replaced blotchy isotropic fractal water body noise with directional Gerstner-inspired swell trains, cross-chop wavelets, anisotropic sun/moon glitter, V-shaped Kelvin **ship wakes** (`uShipWakes[8]` synced live from `harbor.syncShipWakes`), and preserved shoreward surf breaking (`shoalK * 0.23 + uTime * ...`).
  - Improved river S-bends with oxbow broadenings and multi-lobed organic park ponds (`makeWaters`), plus wet-sand / dry-sand / coastal scrub **shoreline & harbor crescent beach transitions** (`harbor.beach`, `harbor.promenade`, and `GROUND_FRAG` beach collar).
- **Richer Street Level, Infrastructure, Painted Distant Suburb Sprawl, Rooftops & Simulated Ad Signage**:
  - **Street Level & Infrastructure (`makeStreetInfrastructure` + `buildStreetInfrastructure`)**: Crosswalks, stop bars, tiled sidewalks, cantilevered intersection **traffic lights** (3-lens red/amber/green heads synced with `uTime`), utility poles with sagging overhead catenary **power lines/cables**, and transit shelters / backlit ad totems.
  - **Painted Distant Suburb Sprawl (`GROUND_FRAG`)**: Procedural multi-kilometer suburban street grids, parcel subdivisions, warm roof tiles, and nighttime porch/cul-de-sac glow painted directly onto the ground shader beyond the 3D suburb ring — zero extra 3D draw calls.
  - **Rooftop Diversity & 8-Archetype Simulated Ads (`TOWER_FRAG`, `BILL_FRAG`, `HOLO_FRAG`, `addTower`)**: Shader-painted solar PV arrays, twin spinning HVAC fan units, gravel parapets, and illuminated `H` helipads + lightweight rooftop dish/spire geometry, alongside `evalSimulatedAd` generating 8 distinct procedural advertisement layouts (split product hero, kinetic poster, radial emblem, equalizer, diagonal promo, data ticker, triptych, Luxury minimal).

### M. Phase 14 — Calibrated Multi-Band Water Shader + UI Controls, Selectable 3-Deck Cloud Elevation Layers, Light Number/Density & Pure-Code Modular Synth Radio (`src/audio.js`, `src/shaders.js`, `src/city.js`, `src/scene.js`, `src/presets.js`, `index.html`, `src/main.js`)
- **Calibrated Multi-Band Water Shader & Live UI Experimentation Controls (`WATER_FRAG`, `src/scene.js`, `index.html`)**:
  - Replaced oversized blotchy open-ocean color mixing with a physically calibrated 5-band directional Gerstner/trochoidal wave spectrum (~22m, 13.5m, 6.8m, 3.2m, and 1.35m wavelengths scaled by `uWaterScale`) with distance-attenuated high-frequency filtering (`att2..att5`), cohesive deep-water body absorption (`uWaterContrast` defaulting low at `0.12` so high-contrast palettes like `outrun` never produce camouflage blotches), Schlick Fresnel sky/horizon reflection + dual-lobe sun/moon glitter (`uWaterRefl`), V-shaped Kelvin ship wakes + breaking shoreline surf (`uWaterFoam`), and wave-front organic curl (`uWaterWarp`).
  - Exposed live Water Shader sliders in **Water, Rivers & Shoreline** (`#sl-water-scale`, `#sl-water-chop`, `#sl-water-foam`, `#sl-water-refl`, `#sl-water-contrast`, `#sl-water-warp`).
  - Retracted elevated transit corridors (`makeTransitNetwork` in `src/city.js`) away from open-sea coastline (`evalCoastSignedDist < 18.0`) by `CELL` steps while preserving 3 full lines (`>= 24` `railLoop` segments), and tagged `blimp` routes as `kind: 'airway'`.
- **Selectable & Adjustable 3-Deck Cloud Elevation Layers (`SKY_FRAG`, `CLOUD_VERT`, `CLOUD_FRAG`, `CLOUD_LAYER_PRESETS`, `buildCloudLayers`)**:
  - Split atmospheric clouds into 3 distinct selectable & individually tunable altitude decks via `vec3` uniforms (`uCloudLayerElev`, `uCloudLayerThick`, `uCloudLayerDens`, multiplied by master `uCloudElev` and `uCloudRange`): **Layer 1 — Low Deck (Tower Mist ~210m)**, **Layer 2 — Mid Deck (Cumulus ~680m)**, and **Layer 3 — High Deck (Cirrus Canopy ~1620m)**, alongside 60 instanced volumetric puffs tagged with `attribute float aLayer` (`0 | 1 | 2`).
  - Exposed 8 quick layer presets (`#sel-cloud-layers`) plus an interactive per-layer inspector (`#sel-cloud-edit`, `#sl-clayer-dens`, `#sl-clayer-elev`, `#sl-clayer-thick`) in **Clouds & 4D Sky**.
- **Adjustable Light Number / Density (`src/city.js`, `src/scene.js`, `index.html`)**:
  - Extended **Lights, Searchlights & Signals** beyond brightness/glow to control actual **light counts & occupancy**: Lit Window Number (`#sl-win` + `#win-density-label`, scaling `U.uWinDensity` across 24h `applyTime`), Searchlight Beam Count (`#sl-search-count`, `0..68` active skybeams via `searchlights.setCountFactor`), Streetlamp / Light-Pool / Beacon Density (`#sl-lamp-density`, `0..2.0x` illuminating secondary dry-land side-street lamps beyond `city.primaryLampCount`), and Intersection Signal & Kiosk Density (`#sl-sig-density`, `streetInfra.setDensity`).
- **Pure-Code Modular Synthesizer & Space-Ambient Radio (`src/audio.js`, `index.html`, `src/main.js`)**:
  - Built `ModularRadioEngine` (`src/audio.js`) generating 100% pure-software Web Audio synthesis (**zero audio samples/files**) with 6 modular synth voices (CS-80 polyphonic brass/pad with sub-sine + chorus + pitch-ribbon, CS-80 expressive mono solo lead with portamento & delayed vibrato, Aphex *SAW* warm detuned tape-drift pad with wow/flutter, FM/sub resonant polyrhythmic pluck, synthesized micro-percussion, and continuous cosmic solar-wind breath) routed through stereo ping-pong tape delay and a procedural 5.2s stereo Feedback-Delay-Network space hall impulse response.
  - Shipped 4 generative stations, live spectrum + oscilloscope visualizer (`#radio-viz`), top-bar `#b-radio` + `M` shortcut, and live coupling to camera altitude, flight speed, and time of day (`#sl-radio-react`).

### N. Phase-15 High-Frequency Water Shaders, `shoreDist` Ocean Rivers, Twin Headlights, Varied Beams & Holo-Projectors, Turn-Damped Motion & POI Auto-Look, Undulating Transit, Wind-Guided Clouds, Evolving Original Radio & WebMCP Movie Set (`src/shaders.js`, `src/city.js`, `src/scene.js`, `src/controls.js`, `src/minimap.js`, `src/audio.js`, `src/director.js`, `src/webmcp.js`, `DOCS.md`, `WEBMCP.md`)
- **Five Selectable High-Frequency Water Shaders (`WATER_FRAG`, `WATER_SHADER_NAMES`, `#sel-watershader`)**:
  - Built 5 Nyquist-anti-aliased (`fwidth(vWorld.xz)` derivative-clamped) high-frequency water surface shaders selectable live via `uWaterShader = 0..4`: `0` **Capillary Micro-Facet Sea**, `1` **Diamond Wind-Chop & Glitter**, `2` **Crystalline Caustic Filigree** (Ridged-Voronoi refractive filaments), `3` **Storm Swell & Whitecap Spray**, and `4` **Obsidian Silk & Mirror Filaments**.
- **`shoreDist`-Exact Ocean River Mouths & River-Aware Streets (`evalExactCoastShoreU`, `evalRiverSignedDist`, `GLSL_TERRAIN`)**:
  - Solved exact coastline contour offsets across all `shoreDist` (`0.35..2.5`) so coastal rivers in modes `1` and `2` always reach `260m` seaward into the ocean (`cDist < 0`) with a smooth seaward `mouthFlare`, while analytical $O(1)$ `evalRiverSignedDist` clips ground-shader road paint (replacing submerged asphalt with dark riverbed + stone riverwalk quays), 3D street lanes, merged boulevard spans (`buildBoulevards`), and minimap grid streets cleanly at riverbanks except over elevated bridges.
- **Twin Bumper-Emitted Vehicle Headlights & Varied Light Profiles (`twinHeadlightGeometry`, `twinTrailGeometry`, `makeVehicles`)**:
  - Moved vehicle front light cones and forward light-trails from center origin to paired left/right bumper sockets (`+X` nose, `±Z` lateral offset) and introduced deterministic per-vehicle front-lighting diversity (~18% glow-only marker lamps with `beamReach = 0` like rear taillights, ~27% dipped low-beam, ~37% standard twin-beam, and ~18% long-throw xenon/cyan high-beam).
- **Varied Searchlight Families & Terminating Holo-Projector Cones (`BEAM_VERT`/`BEAM_FRAG`, `makeSearchlights`, `projectorFrustumGeometry`, `buildHolos`)**:
  - Extended volumetric beams with `aBeamMeta` (`kind`, `gain`, `falloff`, `phase`) and `aBeamTint` across 4 searchlight families (Pencil Laser, Carbon-Arc Searchlight, Wide Flood, Flat Fan Curtain) plus archetype `4` **Holo-Projector Frustums** emitted from instanced armored pods & lenses whose rays terminate directly onto the 4 corners of every hologram (`vT = 0 -> 1`).
- **2nd-Order Turn-Rate-Limited Motion, Hover POI Auto-Look & Smooth Minimap Route Queue (`src/controls.js`, `src/minimap.js`)**:
  - Added 5th motion preset **`Silk Airship (Slow Turns)`** + `#sl-turnsmooth` (`0.2..3.5x`) driving a 2nd-order velocity- and acceleration-clamped angular stepper (`_stepDampedAngle`) that eliminates whip-pans, `#b-autolook` (`O` key) to smoothly pan across POIs even while slowly drifting or hovering (`glideSpeed = 0`), smooth minimap click-to-route queuing (`enqueueWaypoint`, `Shift+Click` multi-stop routes rendered live on `#minimap`), and non-fighting manual course trim (`onCourseReorient`).
- **Undulating Curved Public Transport & Wind-Guided Cloud Streamlines (`makeTransitNetwork`, `SKY_FRAG`, `CLOUD_VERT`)**:
  - Upgraded the 3 transit corridors into avenue-aligned serpentine S-bends, harbor-midtown crescents, and pinwheel loops with quadratic Bézier corners (`cr = 24..26m`) and Hermite-sloped vertical elevation waves (`y1`, `y2`), and rotated 4D cloud noise into a prevailing wind frame (`uWindAngle`, `uWindStrength`, `#sl-windang`, `#sl-windstr`) with Ekman altitude veer so neighboring clouds share natural coherent alignment.
- **6 Original Evocative Radio Stations & 4-Movement Evolution (`src/audio.js`)**:
  - Removed all real-world artist/album/synth references across the codebase and built 6 original pure-code stations (**99.4 FM · Rain on Neon Glass**, **101.7 FM · Velvet Sub-Level**, **104.2 FM · Midnight Monorail**, **106.8 FM · Sodium & Mercury**, **88.9 FM · Foghorn & Starlight**, **93.1 FM · Hanging Sky-Gardens**) driven by a 64-bar **4-Movement Macro-Evolution Engine** (*Mist Prelude -> Rising Skyline -> Luminous Zenith -> Nocturnal Dissolve*) with bridge chord modulation, motif mutation, plucked harp & breath flute voices, and multi-cycle modal key shifts.
- **Full WebMCP Movie-Set Exposure & Thorough Documentation (`src/director.js`, `src/webmcp.js`, `DOCS.md`, `WEBMCP.md`)**:
  - Built `MovieSetDirector` and `registerPetacityWebMCP` exposing 14 JSON-Schema tools on `navigator.modelContext`, `window.petacity`, and `window.postMessage` RPC (`petacity_what_am_i_looking_at` 3D raycast + frustum scan, `petacity_run_camera_script` C2 shots/orbit/vehicle chase-cam, `petacity_takeover_building` window overrides + pure-code 5x7 bitmap 4-sided LED facade marquees, `petacity_takeover_signage`, `petacity_project_hologram` front-of-camera hologram + drone pod + terminating cone, and `petacity_control_vehicle`).

---

## 4. Critical Invariants & Pitfalls to Preserve

1. **WebGL 2 (`#version 300 es`) & `@webgpu/glslang` Shader Verification**:
   - `vendor/three.module.js` (`r170`) compiles `ShaderMaterial` as `#version 300 es` on WebGL 2 contexts. Never use ESSL 3.00 §3.7 reserved words (`active`, `sample`, `smooth`, `flat`, `centroid`, `filter`, `common`, `partition`, `half`, `fixed`, `input`, `output`, `interface`, `inline`, `packed`, `superp`, etc.) as variable or function names in any GLSL string, and never put unescaped backticks (`` ` ``) inside template-literal GLSL comments. Verify both `tests/scene.test.mjs` uniform parity and synchronous `@webgpu/glslang` (`36/36` shaders) after any shader edit.
2. **Seamless `PC_LOOP = 120.0` Periodic Noise**:
   - `uTime` wraps modulo `120.0s`. Any shader or scene animation driven by `uTime` must use integer harmonics of `2π / PC_LOOP` (`loopPhase(uTime, cycles)`, `evalLoopedToggle`, `loopCircle2`) — never raw `floor(uTime * rate)` or non-periodic linear `uTime` offsets (`WEATHER_VERT` preserves `- uTime * aSpeed` inside `mod(..., uTop)`).
3. **Non-Polygonal Volumetric Clouds**:
   - Never displace low-poly icosahedrons or shade cloud meshes with polygon normals (`vN`). Keep `world.cloudMat.side = THREE.BackSide` on bounding boxes whose analytical 3D density falls strictly to `0.0` inside `r <= 0.88 < 1.0`, paired with the concentric spherical shell raymarch (`intersectSphereShell` + `skyCumulusDensity`) in `SKY_FRAG`.
4. **Vehicle Forward Axis (`+X`) & C1 Lane Continuity**:
   - All procedural vehicle meshes are authored with nose along `+X` (`(1, 0, 0)`). Keep Euler order `e.set(0, yaw, pitch, 'YXZ')` and post-multiply roll strictly around local `+X`. Never call discrete rooftop queries inside per-frame `composeAt`.
5. **UI Selector & Accessibility Contract**:
   - In `src/main.js`, always pass `#`-prefixed string literals to `$('#some-id')`, and give every `<button>` in `index.html` both `aria-label` and `title` (`tests/ui-contract.test.mjs`).
6. **Spherical World Curvature (`bendWorld`)**:
   - Any new world-space geometry added to the city must route its vertex shader through `bendWorld(wp.xyz)` (`GLSL_CURVE`) and keep ground/water/boulevard meshes subdivided so `worldCurve` (`Plane <-> Globe`) bends seamlessly without exposing world edges.

---

## 5. Suggested Next Ideas
- **Interactive Skyway Transit Stations**: Elevated passenger boarding platforms docked against `cantilever` and `ziggurat` sky-lobbies where `shuttle` (`cc = 4`) craft briefly pause before re-entering the horizontal avenue stream.
- **Procedural Audio / Synth Ambience (Opt-in)**: WebAudio synthesis reactive to altitude (`street canyon` vs `cloud deck` vs `orbital`), weather mode, and active look.
- **Custom Landmark Inspector**: Click-to-select a landmark or public venue on the canvas to display its procedural name, district, elevation, and quick fly-around orbit camera.
