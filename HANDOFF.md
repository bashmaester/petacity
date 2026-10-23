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

The suite (`61` tests across 4 files) validates:
- `tests/city.test.mjs` — deterministic PRNG/noise, district layout, landmarks (`arch`, `spire`, `dome`, `mast`, `crown`, `needle`, `pyramid`, `cantilever`, `ziggurat`), public venues (`arena`, `theatre`, `stadium`, `market`, `plaza`, `park`, `fair`), horizon suburbs, billboard/hologram distribution, and grade-separated horizontal street-grid traffic lanes with corner turns, elevation ramps, and rooftop/building clearance.
- `tests/scene.test.mjs` — shader-to-uniform contracts, instanced attribute contracts, ESSL 3.00 (`#version 300 es`) reserved-keyword safety, `applyLook` / `applyTime` 24-hour celestial orbits (`uSolarDir`, `uMoonDir`, `uStarRot`) and full 8-phase lunar cycle (`uMoonPhase` `0..2`), 6 volumetric cloud types & cloud-cover range, theme-reactive special structures (`setLook`), `0..20,000` smooth multi-strata vehicles, spherical `bendWorld` curvature, exact-state tokens, and clean render/path capture.
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
| `src/city.js` | Deterministic city generator (`generateCity`) and spatial hash collider (`makeCityCollider`): Voronoi districts, waterways, diagonal boulevards, tower archetypes (including stepped arcology pyramids & cantilevered sky-wing towers), 9 landmark kinds, 7 public venue kinds, media ward, outskirts, procedural horizon suburbs, and the 6-deck horizontal street-grid lane graph (`makeLanes`). |
| `src/scene.js` | Three.js scene graph & uniform orchestration (`makeUniforms`, `makeWorld`, `applyLook`, `applyTime`), theme-reactive `buildLandmarks` & `buildPlaces` (`setLook`), Tier-1 CPU hero vehicles + Tier-2 GPU swarm (`makeVehicles`), volumetric cloud puff field (`buildCloudLayers`), water, boulevards, trees, billboards, holograms, searchlights, and weather (`makeWeather`). |
| `src/shaders.js` | All 32 scene GLSL vertex/fragment shaders, shared 3D value-noise/FBM library, `GLSL_CURVE` (`bendWorld` planar-to-planetoid vertex projection), StormyClouds 2D/3D procedural plate styles, volumetric `SKY_FRAG` & `CLOUD_FRAG`, `TOWER_FRAG`, and 4-role `LANDMARK_FRAG`. |
| `src/looks.js` | 8 pluggable visual looks (`bladerunner`, `anime`, `abstract`, `tron`, `outrun`, `clay`, `metropolis`, plus runtime `custom`) and `syncCustomLook` palette synthesizer. |
| `src/post.js` | Half-resolution bloom, chromatic lens dispersion/halation, color-temperature & contrast grading, and StormyClouds-inspired old-film print grain, twinkling dust specks, and scratches (`makePostProcessor`). |
| `src/controls.js` | Free-flight WASD + pointer-drag camera (`FlyControls`), autonomous scenic `Glide` cruise (`G`), building/ground collision (`C`), and radial planetoid local-up frame when `worldCurve > 0`. |
| `src/presets.js` | Curated `WORLD_PRESETS`, `DEFAULT_BOOKMARKS`, and lossless `normalizeExactState` / `encodeExactState` / `decodeExactState` (`?s=` Base64URL token + JSON import/export). |
| `src/recorder.js` | `CameraPathRecorder` (Catmull-Rom + squad quaternion keyframe/flight recorder, `R`/`K`/`P`) and `makeSceneExporter` (HUD-free `Viewport`/`1080p`/`2x`/`4K` PNG stills & `60fps` WebM/MP4 video). |
| `src/prng.js` | Seeded `mulberry32`, integer 2D hash `hash2i`, and 2D value noise / `fbm2D`. |

---

## 3. Core Systems Design (Including Latest Phase-9 Upgrades)

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
