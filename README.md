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
| drag | look around |
| `W` `A` `S` `D` | fly |
| `E` / `Q` (or `Space` / `C`) | up / down |
| `Shift` | speed boost |
| mouse wheel | dolly in/out |

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
- **Billboards & light sculptures** — illuminated scrolling facade panels and
  glowing rings/columns at the public spaces.
- **Bodies of water** — irregular voronoi lakes with a ripple shader, plus
  diagonal boulevards cutting the grid; streets and blocks stay, but the
  large-scale division is no longer a pure lattice.
- **Mixed fleet** — pods, skimmers, haulers, drones, helicopters and blimps
  on curved multi-layer lanes with weaving trajectories.
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
src/city.js         the scaffolding: streets, lots, tower stacks, landmarks, lanes (pure JS)
src/shaders.js      GLSL: sky dome, ground grid, instanced towers w/ windows, landmarks, beacons
src/looks.js        look presets (sky, fog, light, tower, ground, post) + authored hours
src/scene.js        three.js scene layer: look/time -> uniforms, landmarks, traffic, beacons
src/controls.js     fly camera
src/main.js         wiring: renderer, UI, render loop
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
