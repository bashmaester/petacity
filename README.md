# Petacity

A procedural city grown from one seed — streets, blocks, stacked towers, landmark
spires — built as **scaffolding** so we can explore where different visual styles
can take it: Blade Runner cyberpunk, 2000s anime, abstract geometry, Tron, and
more. No models, no textures: everything is generated in code and re-styled by
swapping uniforms.

Inspired by [Gigacity](https://sael.net/gigacity/), cut down to just the city
itself: no traffic, no cockpit, no radio — just the scaffolding and the looks.

## Live demo

Published from CI on GitHub Pages at **https://bashmaester.github.io/petacity/** —
every push runs the tests and redeploys, so you can try it outside a local setup.

## Run it

Any static file server works (ES modules need `http://`, not `file://`):

```sh
python3 -m http.server 8000        # or: npm run serve
# open http://localhost:8000
```

The city starts **small by default** (a 1.5 km core, ~4.5k boxes) so it stays
fast while testing and debugging. Grow the skyline with `?r=13` in the URL
(each step is a 150 m block ring, max 15) when you want the full thing.

If anything fails at startup, the error is shown right on the loading screen
instead of hanging — and `npm test` includes a headless boot smoke test
(jsdom + fake WebGL) that catches startup regressions like selector typos.

## Controls

| input | action |
| --- | --- |
| drag | look / steer glide |
| `W` `A` `S` `D` | fly (or adjust glide speed / bank) |
| `E` / `Q` (or `Space`) | up / down |
| `Shift` | speed boost |
| mouse wheel | dolly in/out (or adjust glide speed) |
| `G` | toggle **Autopilot Glide mode** (smooth route cruise; drag or `A`/`D` trims course smoothly; wheel down to `0` hovers) |
| `O` | toggle **Autopilot POI Auto-Look** (smoothly gaze around at landmarks & vistas while slowly drifting or hovering) |
| `L` | toggle **Freelook** (decouple camera gaze from travel heading) |
| `M` | toggle **Generative Synth Radio** (6 original stations with 4-movement symphonic evolution, 100% pure code) |
| `V` | toggle **Anticipatory Obstacle Avoidance** |
| `C` | toggle **Collision detection** (solid buildings & traffic spacing vs noclip) |
| `H` | hide / show the UI |
| Minimap Click | queue a smooth Autopilot flight route to any site or map pin (`Shift+Click` appends multi-stop routes) |

## Documentation & WebMCP Movie-Set API

- **[`ARCHITECTURE_AND_LESSONS.md`](./ARCHITECTURE_AND_LESSONS.md)** — Deep-dive catalog of all procedural/shader/flight/audio techniques & decisions, candid retrospective (*what worked vs. what did not*), and architectural blueprint for a next-generation true modular city engine.
- **[`HANDOFF.md`](./HANDOFF.md)** — Practical engineering handoff & operations guide: 16-file module map, runtime state precedence, critical invariants (`101/101` tests), and subsystem extraction order.
- **[`DOCS.md`](./DOCS.md)** — Complete system feature & user controls reference (hydrology, 5 high-frequency water shaders, wind-guided 4D volumetric clouds, twin-headlight fleet, beam/holo-projector optics, Drone-DP gimbal, and 14-station generative synthesizer).
- **[`WEBMCP.md`](./WEBMCP.md)** — Full AI Agent & Programmable Movie-Set Guide (`navigator.modelContext` WebMCP, `window.petacity` SDK, and `window.postMessage` RPC): raycast what the camera is looking at, run scripted dolly/orbit/chase shots, take over any skyscraper's lights + wrap 4-sided LED window-matrix messages around facades, hijack billboards, project holograms + terminating light cones in front of the camera, and puppeteer cars.

The **Look** chips restyle the same city instantly. The tuning sliders scale
window density, window glow and fog on top of any look. **Environment → Time**
drives a day/night cycle (each look lands on the hour it was authored for —
golden sunsets, starry nights, brighter days, all while keeping the look's
identity). **Scale** sets city size (rebuild), building height and traffic
density; **Atmosphere → Lights** drives the beacons and night lighting. The
**Places of interest** chips fly the camera to each named landmark.

`?seed=`, `?look=`, `?r=` (city scale) and `?t=` (time of day) in the URL share
a specific city + style + hour (the Copy link button does this for you).

## What's in the city

- **Districts** — the city grows coherent quarters (dense downtown, sparse
  edges, tower spines, monolith wards, low towns, rifts) instead of one
  uniform randomness everywhere.
- **Streets & towers** — a seeded grid of blocks, lots and stacked tower
  segments with setbacks, podiums, roof clutter and street-level grit;
  facades vary per building: windowed, outline-glow wireframes, sparse
  monoliths.
- **Monumental landmarks** — named POIs (Meridian Gate arch, spires, domes,
  masts, crowns, needles) with halos, cantilevers and strange companions,
  plus a fly-to list in the panel.
- **Public spaces** — markets, plazas, parks and fairs with stalls, canopies,
  light trees and tent rings, ringed by string lights.
- **Vehicles** — pods, skimmers and haulers with real silhouettes (hulls,
  canopies, fins, containers), head/tail lights, headlight beams and
  additive light-trails; articulated too: pulsing thrusters, spinning
  rotors, swaying trailer sections, hover-bob.
- **Volumetric lights** — animated searchlight shafts sweeping and breathing
  over the skyline, street-lamp light pools, blinking aviation beacons,
  night window glow.
- **Full-day clock** — the Time slider spans 0–24 h with a moving sun path:
  dawn golds, high noon, warm dusk, and the deep small hours. The interface
  hides with the Hide UI button or <kbd>H</kbd>.
- **Metropolis look** — a Fritz Lang preset: silver expressionist towers,
  posterised light, burning windows, sepia clouds. Each look also decides
  whether street structures are trees or sybernetic bioelectric illuminators.
- **Weather** — rain, storms with lightning flashes, snow and ash fall.
- **Moon controls** — moon glow, size and phase, riding a night path opposite
  the sun.
- **Billboards, neon signage & giant holograms** — illuminated scrolling
  facade billboards, vertical neon canyon blades, rooftop wordmarks, shopfront
  fascias, and towering sky-holograms (panels, 360° drums & portals) fed by
  volumetric projector cones.
- **Grand venues & public spaces** — arenas, Art-Deco movie theatres (with
  premiere searchlights), twin-tier colosseum stadiums (with floodlight
  towers), markets, plazas, parks and fairs.
- **Non-rectangular variation & outskirts fade** — Voronoi-oriented and radial
  quarters, octagonal prisms, V-wing wedges, twisting stacks, diagonal
  boulevards, and a deep noise-fingered outskirts skirt of low-rise blocks,
  silos, warehouses and lone beacons dissolving seamlessly into the mist.
- **8-class collision-free fleet** — pods, skimmers, haulers, drones,
  helicopters, blimps, transit shuttles and twin-prong spinners riding 3D
  rooftop-clearing glide profiles, switching routes at endpoints, pitching over
  towers, and maintaining headway spacing.
- **Parametric atmospherics** — cloud deck (lit tops, silver lining), sun
  disc + glow, horizon haze and vibrance are all sliders; the horizon
  dissolves into the sky so the world has no square edges.

## Current looks

- **Blade Runner** — smog sunset, neon windows, low orange haze
- **2000s Anime** — flat cel light, ink lines, bright painted sky
- **Abstract** — Bauhaus primary blocks, black edges, no light at all
- **Tron** — dark grid, glowing edges, emissive bands
- **Outrun** — violet dusk, pink grid, star field
- **Clay** — white study model, soft shadow, archviz calm

## How it's put together

```
index.html          UI shell + overlay effects (grain / scanlines / vignette)
src/prng.js         seeded RNG + smooth value noise
src/city.js         the scaffolding: streets, lots, tower stacks, 16 creative PoI landmarks, lanes
src/shaders.js      GLSL: sky dome, ground grid, instanced towers, multi-role landmarks, beacons
src/looks.js        look presets (sky, fog, light, tower, ground, post) + authored hours
src/scene.js        three.js scene layer: look/time -> uniforms, sculpted PoI landmarks, traffic
src/post.js         bloom + 10 camera lens projections (Panini, Fisheye, 360°, Little Planet, Tilt-Shift)
src/controls.js     6-DOF flight physics, Dutch roll, 2nd-order turn damper, POI Auto-Look & routes
src/minimap.js      interactive radar/city map with dry-land street clipping & live route visualization
src/recorder.js     C2 camera path recorder, non-destructive spline smoother & PNG/WebM exporter
src/audio.js        pure-code Web Audio synth radio (6 original stations + 4-movement evolution)
src/director.js     MovieSetDirector: 3D raycast perception, camera scripts & world takeovers
src/webmcp.js       WebMCP (`navigator.modelContext`), `window.petacity` & `postMessage` bridge
src/main.js         wiring: renderer, UI, state sync, WebMCP & render loop
vendor/three.module.js  three.js r170 (vendored, no CDN)
```

The city is deterministic: the same seed always grows the same towers, right
down to which windows are lit (a hash of the tower and the window cell). Towers
are one `InstancedMesh` of unit boxes scaled per instance; facades, windows,
edge lines and emissive bands are all computed in the fragment shader from the
instance's dimensions and seed.

## Look development

Each look in `src/looks.js` is a plain object: sky gradient + sun, fog, sun/ambient
lighting (incl. toon and flat modes), tower palette + window colours + edge glow,
ground colours + grid glow, and post overlay strengths. Add a new preset, give it
an `id`, and it shows up as a chip — the whole pipeline is uniform-driven.

## Tests

```sh
npm test
```

Node tests cover the generator (determinism, bounds), the scene layer against
real three.js (uniform/shader contract, instancing attributes, look application),
the HTML/JS wiring contract, and a full headless boot of `main.js` (jsdom +
fake WebGL — skips if jsdom isn't installed).

CI (`.github/workflows/pages.yml`) runs this suite on every push and pull
request; on pushes to `main` or the working branch it also publishes `index.html`,
`src/` and `vendor/` to GitHub Pages via `actions/deploy-pages`.
