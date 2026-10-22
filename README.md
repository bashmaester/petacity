# Petacity

A procedural city grown from one seed — streets, blocks, stacked towers, landmark
spires — built as **scaffolding** so we can explore where different visual styles
can take it: Blade Runner cyberpunk, 2000s anime, abstract geometry, Tron, and
more. No models, no textures: everything is generated in code and re-styled by
swapping uniforms.

Inspired by [Gigacity](https://sael.net/gigacity/), cut down to just the city
itself: no traffic, no cockpit, no radio — just the scaffolding and the looks.

## Run it

Any static file server works (ES modules need `http://`, not `file://`):

```sh
python3 -m http.server 8000        # or: npm run serve
# open http://localhost:8000
```

## Controls

| input | action |
| --- | --- |
| drag | look around |
| `W` `A` `S` `D` | fly |
| `E` / `Q` (or `Space` / `C`) | up / down |
| `Shift` | speed boost |
| mouse wheel | dolly in/out |

The **Look** chips restyle the same city instantly. The sliders scale window
density, window glow and fog on top of any look. `?seed=` and `?look=` in the URL
share a specific city + style (the Copy link button does this for you).

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
src/city.js         the scaffolding: streets, lots, tower stacks, spires (pure JS)
src/shaders.js      GLSL: sky dome, ground grid, instanced towers w/ windows
src/looks.js        look presets (sky, fog, light, tower, ground, post)
src/scene.js        three.js scene layer + look -> uniform plumbing
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
and the HTML/JS wiring contract.
