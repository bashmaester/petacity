// WebMCP (`navigator.modelContext`) + `window.petacity` + `postMessage` Bridge
// Exposes every subsystem of Petacity as structured, JSON-Schema-typed tools
// so AI agents, browser extensions, parent frames, and scripts can inspect and
// direct the procedural city like a programmable movie set.

import { LOOKS } from './looks.js';
import { WATER_SHADER_NAMES } from './scene.js';
import { ART_STYLE_NAMES, LENS_MODE_NAMES, CAMERA_ANGLE_PRESETS } from './post.js';
import { CAMERA_STYLE_NAMES } from './controls.js';
import { RADIO_STATIONS } from './audio.js';
import { WATER_MODE_NAMES } from './city.js';

export function buildPetacityTools(ctx) {
  const {
    director,
    getState,
    applyPartialState,
    getCity,
    getVehicles,
    controls,
    camera,
    radio,
    recorder,
    exporter,
    exportDemoHTML,
    enqueueSpotRoute,
  } = ctx;

  return [
    {
      name: 'petacity_get_world_status',
      description: 'Return full live status of Petacity: visual look, post-FX, city seed/scale, water mode & high-frequency water shader, clouds & wind vector, camera pose, autopilot & waypoint queue, generative radio station/chord/movement, and active movie-set overrides.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const st = getState();
        const city = getCity();
        return {
          state: st,
          availableLooks: LOOKS.map((l) => l.id),
          availablePostStyles: ART_STYLE_NAMES.map((n, i) => ({ index: i, name: n })),
          availableLensModes: LENS_MODE_NAMES.map((n, i) => ({ index: i, name: n })),
          availableAnglePresets: CAMERA_ANGLE_PRESETS.map((p, i) => ({ index: i, id: p.id, label: p.label })),
          availableWaterModes: WATER_MODE_NAMES.map((n, i) => ({ index: i, name: n })),
          availableWaterShaders: WATER_SHADER_NAMES.map((n, i) => ({ index: i, name: n })),
          availableCameraStyles: CAMERA_STYLE_NAMES.map((n, i) => ({ index: i, name: n })),
          availableRadioStations: RADIO_STATIONS.map((s, i) => ({ index: i, id: s.id, name: s.name })),
          cameraPose: controls ? controls.getPose() : null,
          autopilot: controls ? {
            glide: controls.glide,
            glideSpeed: controls.glideSpeed,
            speedMul: controls.speedMul,
            autoLook: controls.autoLook,
            freelook: controls.freelook,
            turnSmooth: controls.turnSmooth,
            autopilotLoopCount: Array.isArray(controls.autopilotLoop) ? controls.autopilotLoop.length : 0,
            routeWaypointsRemaining: controls.routeQueue.length,
          } : null,
          citySummary: city ? {
            seed: city.seed,
            radius: city.radius,
            towers: city.towers,
            buildings: city.count || 0,
            landmarks: (city.landmarks || []).map((l) => ({ kind: l.kind, name: l.name, x: Math.round(l.x), y: Math.round(l.h || l.y || 140), z: Math.round(l.z) })),
            billboards: city.bills?.length || 0,
            holograms: city.holos?.length || 0,
            bridges: city.bridges?.length || 0,
            transitLines: city.transit?.lines?.length || 0,
            riverActive: !!city.riverFlow?.active,
            riverMeetsOcean: !!city.riverFlow?.oceanMouth,
          } : null,
          radio: radio ? {
            playing: radio.playing,
            stationIndex: radio.stationIndex,
            stationId: radio.station.id,
            stationName: radio.station.name,
            chord: radio.currentChordName,
            movement: radio.movementName,
            evolutionPhase: Math.round(radio.evolutionPhase * 1000) / 1000,
          } : null,
          director: director ? director.getStatus() : null,
        };
      },
    },

    {
      name: 'petacity_what_am_i_looking_at',
      description: 'Cast a 3D perception ray through screen coordinates (ndcX, ndcY; default 0,0 = center crosshair) and scan the camera frustum to report exactly what building, landmark, billboard, hologram, car/spinner/train/blimp, river, ocean, or park the camera is looking at.',
      inputSchema: {
        type: 'object',
        properties: {
          ndcX: { type: 'number', description: 'Normalized horizontal screen coordinate (-1 left .. 0 center .. +1 right)', default: 0 },
          ndcY: { type: 'number', description: 'Normalized vertical screen coordinate (-1 bottom .. 0 center .. +1 top)', default: 0 },
          maxDistance: { type: 'number', description: 'Maximum raycast distance in meters', default: 4500 },
          includeFrustumScan: { type: 'boolean', description: 'Also return prominent entities inside the camera field of view', default: true },
        },
      },
      execute: async (args = {}) => director.whatAmILookingAt(args),
    },

    {
      name: 'petacity_list_entities',
      description: 'List inspectable & controllable world entities by category: landmarks, buildings, billboards, holograms, vehicles, transit, bridges, or parks.',
      inputSchema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['landmarks', 'buildings', 'billboards', 'holograms', 'vehicles', 'transit', 'bridges', 'parks'],
            default: 'landmarks',
          },
          limit: { type: 'number', default: 25 },
        },
      },
      execute: async ({ category = 'landmarks', limit = 25 } = {}) => {
        const city = getCity();
        const vehicles = getVehicles();
        const cap = Math.max(1, Math.min(200, Number(limit) || 25));
        const camPos = camera ? [camera.position.x, camera.position.y, camera.position.z] : [0, 120, 0];
        if (!city) return { category, items: [] };

        if (category === 'landmarks') {
          return {
            category,
            items: (city.landmarks || []).slice(0, cap).map((l, i) => ({
              index: i, name: l.name, position: [Math.round(l.x), Math.round(l.y || 160), Math.round(l.z)],
            })),
          };
        }
        if (category === 'buildings') {
          const boxes = [];
          for (let i = 0; i < (city.count || 0); i++) {
            const top = city.y[i] + city.h[i] * 0.5;
            if (top < 25) continue;
            boxes.push({
              buildingId: i,
              position: [Math.round(city.x[i]), Math.round(top), Math.round(city.z[i])],
              height: Math.round(top),
              footprint: [Math.round(city.w[i]), Math.round(city.d[i])],
              dist: Math.round(Math.hypot(city.x[i] - camPos[0], city.z[i] - camPos[2])),
            });
          }
          boxes.sort((a, b) => a.dist - b.dist);
          return { category, items: boxes.slice(0, cap) };
        }
        if (category === 'billboards') {
          const bills = (city.bills || []).map((b, i) => ({
            signId: i,
            mega: !!b.mega,
            position: [Math.round(b.x), Math.round(b.y), Math.round(b.z)],
            size: [Math.round(b.w), Math.round(b.h)],
            dist: Math.round(Math.hypot(b.x - camPos[0], b.z - camPos[2])),
          }));
          bills.sort((a, b) => a.dist - b.dist);
          return { category, items: bills.slice(0, cap) };
        }
        if (category === 'holograms') {
          return {
            category,
            items: (city.holos || []).slice(0, cap).map((h, i) => ({
              holoId: i, shape: h.shape, position: [Math.round(h.x), Math.round(h.y), Math.round(h.z)], size: [Math.round(h.w), Math.round(h.h)],
            })),
          };
        }
        if (category === 'vehicles') {
          return {
            category,
            items: vehicles ? vehicles.listVehicles({ limit: cap, near: camPos }) : [],
          };
        }
        if (category === 'transit') {
          return {
            category,
            lines: (city.transit?.lines || []).map((ln) => ({
              id: ln.id, name: ln.name, elevation: ln.elevation, segmentCount: ln.segments.length,
            })),
            stations: (city.transit?.stations || []).slice(0, cap).map((s) => ({
              lineName: s.lineName, position: [Math.round(s.x), Math.round(s.y), Math.round(s.z)],
            })),
          };
        }
        if (category === 'bridges') {
          return { category, items: (city.bridges || []).slice(0, cap) };
        }
        return { category, items: (city.places || []).slice(0, cap) };
      },
    },

    {
      name: 'petacity_set_camera_pose',
      description: 'Position or aim the camera, configure FOV (15..150 deg), optical lens projection (0=Rectilinear, 1=Panini Wide, 2=Anamorphic Scope, 3=Tilt-Shift, 4=180 Fisheye, 5=360 Panorama, 6=Little Planet, 7=Inception Fold, 8=250 Probe, 9=Kaleidoscope), barrel/pincushion distortion, zoom, Dutch roll (-180..+180 deg), anamorphic squeeze, tilt-shift, extreme-angle presets, motion style, and turn damping.',
      inputSchema: {
        type: 'object',
        properties: {
          position: { type: 'array', items: { type: 'number' }, description: '[x, y, z] camera world coordinates' },
          yaw: { type: 'number', description: 'Camera yaw in radians' },
          pitch: { type: 'number', description: 'Camera pitch in radians (-1.55..+1.55 for nadir/worm-eye)' },
          roll: { type: 'number', description: 'Camera Dutch roll / oblique angle in degrees (-180..+180)' },
          lookAt: { description: '[x, y, z] array or { buildingId, vehicleId, landmark } object to aim at' },
          immediateLook: { type: 'boolean', description: 'Snap aim immediately instead of smooth turn-damped pan', default: false },
          fov: { type: 'number', description: 'Vertical field of view in degrees (15..150)' },
          lensMode: { type: 'number', description: '0=Rectilinear, 1=Panini Wide, 2=Anamorphic 2.39:1, 3=Tilt-Shift, 4=180 Fisheye, 5=360 Equirectangular, 6=Little Planet, 7=Inception Fold, 8=Hyper-Fisheye 250, 9=Kaleidoscope' },
          lensDistort: { type: 'number', description: 'Brown-Conrady lens distortion (-1.0 pincushion .. 0.0 clean .. +1.25 barrel)' },
          lensZoom: { type: 'number', description: 'Optical projection scale / zoom (0.35..2.5; <0.9 reveals circular fisheye rim)' },
          anamorphic: { type: 'number', description: 'Anamorphic cinema squeeze & horizontal streak flare (0..1)' },
          tiltShift: { type: 'number', description: 'Scheimpflug tilt-shift miniature diorama bokeh blur (0..1)' },
          anglePreset: { description: 'Extreme/strange preset id or index (e.g. "wormseye", "dutch_noir", "telephoto", "panini_arch", "nadir_drop", "fisheye_dome", "little_planet", "inception_fold", "vr_360", "probe_250", "kaleido_prism", "inverted_sky", "miniature_tilt")' },
          motionStyle: { type: 'number', description: '0=Cinema Drone, 1=FPV Agile, 2=Steadicam Crane, 3=Orbital Glider, 4=Silk Airship (Slow Turns)' },
          smoothness: { type: 'number', description: 'Translational inertia smoothing (0.2..3.0)' },
          turnSmooth: { type: 'number', description: 'Angular turn-rate damping (0.2..3.5; higher = slower, silkier turns)' },
          freelook: { type: 'boolean', description: 'Decouple camera look direction from travel vector' },
        },
      },
      execute: async (args = {}) => {
        director.stopCameraScript();
        if (Array.isArray(args.position) && args.position.length >= 3 && controls) {
          controls.setPose({
            x: Number(args.position[0]),
            y: Number(args.position[1]),
            z: Number(args.position[2]),
            yaw: args.yaw ?? controls.yaw,
            pitch: args.pitch ?? controls.pitch,
          });
        } else if ((args.yaw !== undefined || args.pitch !== undefined) && controls) {
          if (args.immediateLook) {
            controls.setPose({
              x: camera.position.x, y: camera.position.y, z: camera.position.z,
              yaw: args.yaw ?? controls.yaw, pitch: args.pitch ?? controls.pitch,
            });
          } else {
            if (args.yaw !== undefined) controls._targetYaw = Number(args.yaw);
            if (args.pitch !== undefined) controls._targetPitch = Number(args.pitch);
          }
        }
        const patch = {};
        if (args.anglePreset !== undefined) patch.anglePreset = args.anglePreset;
        if (args.fov !== undefined) patch.fov = Number(args.fov);
        if (args.roll !== undefined) patch.roll = Number(args.roll);
        if (args.lensMode !== undefined) patch.lensMode = Number(args.lensMode);
        if (args.lensDistort !== undefined) patch.lensDistort = Number(args.lensDistort);
        if (args.lensZoom !== undefined) patch.lensZoom = Number(args.lensZoom);
        if (args.anamorphic !== undefined) patch.anamorphic = Number(args.anamorphic);
        if (args.tiltShift !== undefined) patch.tiltShift = Number(args.tiltShift);
        if (args.motionStyle !== undefined) patch.motionStyle = Number(args.motionStyle);
        if (args.smoothness !== undefined) patch.camSmooth = Number(args.smoothness);
        if (args.turnSmooth !== undefined) patch.turnSmooth = Number(args.turnSmooth);
        if (args.freelook !== undefined) patch.freelook = Boolean(args.freelook);
        if (Object.keys(patch).length > 0) applyPartialState(patch);
        if (args.lookAt) director.lookAt(args.lookAt, { immediate: !!args.immediateLook });
        return { ok: true, pose: controls ? controls.getPose() : null };
      },
    },

    {
      name: 'petacity_autopilot_route',
      description: 'Control Autopilot smooth flight, Strategic Cinematic Gaze mode (0=Off, 1=Cinematic Director, 2=Sites & Landmarks, 3=Holograms & Projections, 4=Vertigo Canyon/Spire Up-Down, 5=Gentle Drift), and smooth multi-stop waypoint routing at current speed.',
      inputSchema: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', description: 'Enable or disable Autopilot glide' },
          speed: { type: 'number', description: 'Autopilot cruise speed in m/s (omit to preserve current camera speed)' },
          gazeMode: { type: 'number', description: '0=Off, 1=Cinematic Director, 2=Sites & Landmarks, 3=Holograms & Projections, 4=Vertigo Up/Down, 5=Gentle Drift' },
          autoLook: { type: 'boolean', description: 'Automatically pan & frame nearby points of interest during Autopilot' },
          turnSmooth: { type: 'number', description: 'Turn damping factor (0.2..3.5; >1.4 eliminates fast turns)' },
          destination: { description: '[x, y, z] coordinates or landmark name to smoothly fly to' },
          waypoints: { type: 'array', description: 'Array of [x, y, z] waypoints for a multi-stop scenic flight route' },
          append: { type: 'boolean', description: 'Append to existing routeQueue instead of replacing', default: false },
          stopOnArrive: { type: 'boolean', description: 'Smoothly decelerate to hover upon reaching final route waypoint', default: false },
          clearRoute: { type: 'boolean', description: 'Clear active waypoint queue' },
        },
      },
      execute: async (args = {}) => {
        if (!controls) return { ok: false };
        director.stopCameraScript();
        const patch = {};
        if (args.enabled !== undefined) patch.glide = Boolean(args.enabled);
        if (args.gazeMode !== undefined) patch.gazeMode = Number(args.gazeMode);
        else if (args.autoLook !== undefined) patch.autoLook = Boolean(args.autoLook);
        if (args.turnSmooth !== undefined) patch.turnSmooth = Number(args.turnSmooth);
        if (Object.keys(patch).length > 0) applyPartialState(patch);
        if (args.speed !== undefined) controls.glideSpeed = Math.max(0, Math.min(640, Number(args.speed)));
        if (args.clearRoute) controls.clearRoute();

        if (args.destination) {
          let spot = null;
          if (Array.isArray(args.destination)) {
            spot = { name: 'Director Pin', x: args.destination[0], y: args.destination[1] ?? 140, z: args.destination[2] };
          } else if (typeof args.destination === 'string') {
            const city = getCity();
            const q = args.destination.toLowerCase();
            spot = (city?.landmarks || []).find((l) => l.name.toLowerCase().includes(q)) || null;
          }
          if (spot && enqueueSpotRoute) {
            enqueueSpotRoute(spot, { append: !!args.append, stopOnArrive: !!args.stopOnArrive });
          }
        }
        if (Array.isArray(args.waypoints)) {
          args.waypoints.forEach((wp, idx) => {
            if (Array.isArray(wp) && wp.length >= 3) {
              controls.enqueueWaypoint(
                { name: `Waypoint ${idx + 1}`, x: wp[0], y: wp[1], z: wp[2] },
                { append: idx > 0 || !!args.append, stopOnArrive: !!args.stopOnArrive }
              );
            }
          });
          applyPartialState({ glide: true });
        }
        return {
          ok: true,
          glide: controls.glide,
          glideSpeed: controls.glideSpeed,
          gazeMode: controls.gazeMode,
          autoLook: controls.autoLook,
          routeWaypointsRemaining: controls.routeQueue.length,
        };
      },
    },

    {
      name: 'petacity_run_camera_script',
      description: 'Direct movie-set camera choreography: run a sequence of shots (cut, dolly, crane, orbit), lock onto a moving car/vehicle chase-cam (`followVehicleId`), orbit a building/landmark (`orbitTarget`), or stop active scripts.',
      inputSchema: {
        type: 'object',
        properties: {
          shots: {
            type: 'array',
            description: 'List of shot objects: { type: "cut"|"dolly"|"orbit", from?: [x,y,z], to: [x,y,z], lookAt?: [x,y,z]|{buildingId,vehicleId,landmark}, duration?: number, fov?: number, ease?: "C2"|"easeInOut"|"linear" }',
          },
          followVehicleId: { type: 'number', description: 'Lock camera into pursuit chase-cam behind vehicle ID' },
          followDistance: { type: 'number', default: 28 },
          followHeight: { type: 'number', default: 9 },
          orbitTarget: { description: '[x,y,z] or { buildingId, landmark, vehicleId } to continuously orbit' },
          orbitRadius: { type: 'number', default: 220 },
          orbitHeight: { type: 'number', default: 140 },
          orbitSpeed: { type: 'number', default: 0.22 },
          stop: { type: 'boolean', description: 'Stop active camera script / pursuit / orbit' },
        },
      },
      execute: async (args = {}) => {
        if (args.stop) return director.stopCameraScript();
        if (args.followVehicleId !== undefined) {
          return director.followVehicle(args.followVehicleId, {
            distance: args.followDistance, height: args.followHeight,
          });
        }
        if (args.orbitTarget !== undefined) {
          return director.orbitTarget(args.orbitTarget, {
            radius: args.orbitRadius, height: args.orbitHeight, angularSpeed: args.orbitSpeed,
          });
        }
        if (Array.isArray(args.shots)) {
          return director.runCameraScript(args.shots);
        }
        return { ok: false, reason: 'provide shots, followVehicleId, orbitTarget, or stop:true' };
      },
    },

    {
      name: 'petacity_takeover_building',
      description: 'Take over a skyscraper\'s lights (`lookingAt`, numeric `buildingId`, or `[x,z]`) and/or display a 4-sided glowing LED window-matrix message marquee across its upper facade.',
      inputSchema: {
        type: 'object',
        properties: {
          building: { description: '"lookingAt" (default), buildingId integer, or [x, z] coordinates', default: 'lookingAt' },
          mode: { type: 'string', enum: ['normal', 'blackout', 'solid', 'pulse', 'strobe', 'dim'], default: 'pulse' },
          color: { type: 'string', description: 'Hex color for overridden windows & LED facade text', default: '#00f5ff' },
          message: { type: 'string', description: 'Optional text message to display in giant glowing skyscraper windows' },
          subtext: { type: 'string', description: 'Optional second line of facade text' },
          scrollSpeed: { type: 'number', description: 'Horizontal marquee scroll speed (0 = static)', default: 0.16 },
          heightFraction: { type: 'number', description: 'Vertical placement along tower height (0.2..0.92)', default: 0.76 },
          clear: { type: 'boolean', description: 'Clear all building light & facade message overrides' },
        },
      },
      execute: async (args = {}) => {
        if (args.clear) return director.clearBuildingOverrides();
        return director.takeoverBuilding(args);
      },
    },

    {
      name: 'petacity_takeover_signage',
      description: 'Hijack any city billboard or mega-screen (`lookingAt` or `signId`) with custom neon typography, subtext, colors & marquee scroll.',
      inputSchema: {
        type: 'object',
        properties: {
          sign: { description: '"lookingAt" (default) or signId integer', default: 'lookingAt' },
          text: { type: 'string', default: 'WAKE UP' },
          subtext: { type: 'string', default: '' },
          color: { type: 'string', default: '#ff4fd8' },
          subColor: { type: 'string', default: '#47f5ff' },
          scrollSpeed: { type: 'number', default: 0 },
          clear: { type: 'boolean', description: 'Restore all hijacked billboards to city ads' },
        },
      },
      execute: async (args = {}) => {
        if (args.clear) return director.clearSignOverrides();
        return director.takeoverSignage(args);
      },
    },

    {
      name: 'petacity_project_hologram',
      description: 'Project a glowing single-sided planar or 3D Archimedean/abstract hologram (with physical emitter drone pod and terminating volumetric projector light cone!) directly in front of the camera — either world-anchored or tracking the camera as you fly.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Primary hologram message', default: 'INCOMING TRANSMISSION' },
          subtext: { type: 'string', description: 'Secondary hologram subtitle', default: 'SIGNAL LOCKED' },
          shape: { type: 'string', enum: ['billboard', 'disc', 'diamond', 'cuboctahedron', 'icosahedron', 'knot', 'prism', 'ring'], default: 'billboard' },
          color: { type: 'string', default: '#44f2ff' },
          subColor: { type: 'string', default: '#ff6ad5' },
          distance: { type: 'number', description: 'Distance ahead of camera in meters', default: 36 },
          offsetRight: { type: 'number', description: 'Horizontal offset in meters', default: 0 },
          offsetUp: { type: 'number', description: 'Vertical offset in meters', default: 0 },
          width: { type: 'number', default: 18 },
          height: { type: 'number', default: 9 },
          followCamera: { type: 'boolean', description: 'Keep projection tracking in front of the camera as it moves', default: false },
          clear: { type: 'boolean', description: 'Remove all Director projected holograms' },
        },
      },
      execute: async (args = {}) => {
        if (args.clear) return director.clearProjections();
        return director.projectInFrontOfCamera(args);
      },
    },

    {
      name: 'petacity_control_vehicle',
      description: 'Take over any car, elevated spinner, transit train, or blimp (`nearest`, `lookingAt`, `car`, `spinner`, `train`, or numeric `vehicleId`): park in front of camera, orbit camera, drive custom `[x,y,z]` waypoints, repaint color, or switch twin headlights (`on`, `glow-only`, `off`).',
      inputSchema: {
        type: 'object',
        properties: {
          vehicle: { description: '"nearest", "lookingAt", "car", "spinner", "train", or integer vehicleId', default: 'nearest' },
          position: { type: 'array', items: { type: 'number' }, description: '[x, y, z] teleport position' },
          yaw: { type: 'number' },
          speed: { type: 'number', description: 'Scripted waypoint / circle speed in m/s', default: 55 },
          freeze: { type: 'boolean', description: 'Hold vehicle stationary' },
          headlights: { type: 'string', enum: ['on', 'glow-only', 'off'] },
          color: { type: 'string', description: 'Custom vehicle body/accent hex color' },
          waypoints: { type: 'array', description: 'Array of [x, y, z] world points for the vehicle to drive along' },
          parkInFrontOfCamera: { type: 'boolean', description: 'Place hero vehicle right in front of the camera' },
          circleCamera: { type: 'boolean', description: 'Orbit the vehicle around the camera' },
          releaseAll: { type: 'boolean', description: 'Release all overridden vehicles back to procedural traffic' },
          releaseVehicleId: { type: 'number', description: 'Release one specific vehicle ID' },
        },
      },
      execute: async (args = {}) => {
        if (args.releaseAll) return director.releaseVehicle(null);
        if (args.releaseVehicleId !== undefined) return director.releaseVehicle(args.releaseVehicleId);
        return director.controlVehicle(args);
      },
    },

    {
      name: 'petacity_set_environment',
      description: 'Live-adjust any city look, post-processing shader, high-frequency water shader (0..4), coastline mode, time of day, weather, wind-guided volumetric clouds, traffic count, or city seed/scale.',
      inputSchema: {
        type: 'object',
        properties: {
          look: { type: 'string', description: 'bladerunner | realistic | anime | abstract | tron | outrun | clay | metropolis | custom' },
          postStyle: { type: 'number', description: '0..12 post-processing shader index' },
          time: { type: 'number', description: '24-hour solar/lunar time (0..24)' },
          waterShader: { type: 'number', description: '0=Capillary Micro-Facet, 1=Diamond Wind-Chop, 2=Crystalline Caustic Filigree, 3=Storm Swell & Spray, 4=Obsidian Silk' },
          waterMode: { type: 'number', description: '0=Harbor & Winding River, 1=Coastal Ocean & Harbor, 2=Archipelago, 3=Crater Lake, 4=Dry Basin' },
          shoreDist: { type: 'number', description: 'Coastline distance offset (-550..900m)' },
          waterWave: { type: 'number' },
          waterChop: { type: 'number' },
          waterFoam: { type: 'number' },
          clouds: { type: 'number', description: 'Cloud density (0 = clear sky .. 2.4 = overcast)' },
          cloudPuffs: { type: 'number', description: '3D volumetric cumulus puffs density (0 = off .. 2.0 = dense cumulus)' },
          cloudElev: { type: 'number', description: 'Master cloud altitude multiplier (0.05 street canyons .. 2.4 high sky)' },
          cloudLayer: { type: 'number', description: '0..7 cloud elevation layer preset' },
          windAngle: { type: 'number', description: 'Prevailing wind direction in degrees (0..360) orienting clouds & waves' },
          windStrength: { type: 'number', description: 'Wind speed & cloud streamline stretch (0..2.5)' },
          weatherMode: { type: 'number', description: '0=Clear, 1=Rain, 2=Thunderstorm, 3=Snow, 4=Volcanic ash, 5=Dust haze, 6=Old-film storm' },
          weatherAutoMode: { type: 'string', enum: ['off', 'seq', 'shuffle', 'cinematic'], description: 'Automatic weather cycle crossfade mode' },
          weatherInterval: { type: 'number', description: 'Auto weather cycle interval in seconds (15..240)' },
          rain: { type: 'number' },
          fog: { type: 'number' },
          lightning: { type: 'number' },
          trafficCount: { type: 'number', description: '0..20000 active vehicles' },
          trailMode: { description: 'Moving-object motion trails mode: 0/"off", 1/"subtle", 2/"some" (~30% fast), 3/"transit" (air/rail/ships/rockets), 4/"traffic" (all street+skyway), 5/"all" (city-wide)' },
          trailLength: { type: 'number', description: 'Motion trail length & luminous intensity multiplier (0..2.5)' },
          holoDensity: { type: 'number', description: 'Hologram projection number/density (0 = off .. 2.5 = dense citywide projections)' },
          holoScale: { type: 'number', description: 'Hologram projection scale multiplier (0.35..2.2)' },
          holoScan: { type: 'number', description: 'Hologram scanline & Archimedean facet wireframe intensity (0..2.5)' },
          seed: { type: 'number' },
          radius: { type: 'number', description: '3..13 city grid radius' },
        },
      },
      execute: async (args = {}) => {
        applyPartialState(args);
        return { ok: true, applied: args };
      },
    },

    {
      name: 'petacity_control_music',
      description: 'Control the pure-code generative synthesizer radio: play/stop, select any of the 6 evocative atmospheric stations, and tune Space, Warmth, Pulse, Volume & City Reactivity.',
      inputSchema: {
        type: 'object',
        properties: {
          playing: { type: 'boolean' },
          station: { description: 'Station index (0..5) or station id string' },
          volume: { type: 'number', description: '0..1.2' },
          space: { type: 'number', description: '0..1.5 reverb/delay hall depth' },
          warmth: { type: 'number', description: '0..1.5 analog filter warmth/brilliance' },
          pulse: { type: 'number', description: '0..1.5 rhythmic density (0 = beatless ambient)' },
          cityReact: { type: 'number', description: '0..1.0 live altitude/speed/night coupling' },
          playlistMode: { type: 'string', enum: ['seq', 'shuffle', 'loop'], description: 'Playlist Auto-DJ crossfade mode' },
          playlistInterval: { type: 'number', description: 'Playlist track switch interval in seconds (15..300)' },
        },
      },
      execute: async (args = {}) => {
        if (!radio) return { ok: false };
        if (args.station !== undefined) {
          let idx = Number(args.station);
          if (!Number.isFinite(idx)) {
            idx = RADIO_STATIONS.findIndex((s) => s.id === args.station || s.name.toLowerCase().includes(String(args.station).toLowerCase()));
          }
          if (idx >= 0) applyPartialState({ radioStation: idx });
        }
        const patch = {};
        if (args.volume !== undefined) patch.radioVol = Number(args.volume);
        if (args.space !== undefined) patch.radioSpace = Number(args.space);
        if (args.warmth !== undefined) patch.radioWarmth = Number(args.warmth);
        if (args.pulse !== undefined) patch.radioPulse = Number(args.pulse);
        if (args.cityReact !== undefined) patch.radioReact = Number(args.cityReact);
        if (args.playlistMode !== undefined) patch.playlistMode = args.playlistMode;
        if (args.playlistInterval !== undefined) patch.playlistInterval = Number(args.playlistInterval);
        if (Object.keys(patch).length > 0) applyPartialState(patch);
        if (args.playing === true && !radio.playing) radio.start();
        else if (args.playing === false && radio.playing) radio.stop();
        return {
          ok: true,
          playing: radio.playing,
          stationId: radio.station.id,
          stationName: radio.station.name,
          playlistMode: radio.playlistMode,
          playlistInterval: radio.playlistInterval,
          chord: radio.currentChordName,
          movement: radio.movementName,
          evolutionPhase: radio.evolutionPhase,
        };
      },
    },

    {
      name: 'petacity_capture_media',
      description: 'Manage CameraPathRecorder, trigger a PNG still render, start/stop high-bitrate video capture with pure-code synth sound, or export a standalone single-file HTML autoloop demo.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['screenshot', 'startVideo', 'stopVideo', 'exportDemoHTML', 'addKeyframe', 'smoothPath', 'playPath', 'stopPath', 'clearPath', 'exportPath', 'importPath'],
          },
          resolution: { type: 'string', enum: ['view', '720p', '1080p', '1440p', '2x', '4k'], default: '1080p' },
          fps: { type: 'number', default: 60 },
          quality: { type: 'string', enum: ['standard', 'high', 'ultra', 'master'], default: 'ultra' },
          codec: { type: 'string', enum: ['auto', 'vp9', 'mp4', 'vp8'], default: 'auto' },
          includeAudio: { type: 'boolean', default: true },
          smoothStrength: { type: 'number', default: 0.65 },
          pathData: { description: 'JSON camera path payload when action === "importPath"' },
        },
      },
      execute: async ({
        action = 'exportPath',
        resolution = '1080p',
        fps = 60,
        quality = 'ultra',
        codec = 'auto',
        includeAudio = true,
        smoothStrength = 0.65,
        pathData = null,
      } = {}) => {
        if (action === 'screenshot') {
          const info = await exporter?.captureStillPNG?.(resolution, `petacity-webmcp-${resolution}.png`);
          return { ok: true, action, info: info || null };
        }
        if (action === 'startVideo') {
          const audioStream = includeAudio ? radio?.getAudioStream?.({ autoStart: true }) : null;
          const started = exporter?.startVideoCapture?.({
            fps, resolution, quality, codec, audioStream, filename: `petacity-webmcp-${resolution}.webm`,
          });
          return { ok: true, action, started: started || null };
        }
        if (action === 'stopVideo') {
          const stopped = await exporter?.stopVideoCapture?.();
          return { ok: true, action, stopped: stopped ? { filename: stopped.filename } : null };
        }
        if (action === 'exportDemoHTML') {
          await exportDemoHTML?.();
          return { ok: true, action };
        }
        if (!recorder) return { ok: false, reason: 'no-recorder' };
        if (action === 'addKeyframe') {
          recorder.addKeyframe(camera);
          return { ok: true, keyframes: recorder.frames.length };
        }
        if (action === 'smoothPath') {
          recorder.smoothPath(smoothStrength);
          return { ok: true, keyframes: recorder.frames.length };
        }
        if (action === 'playPath') {
          recorder.play(true);
          return { ok: true, playing: recorder.playing };
        }
        if (action === 'stopPath') {
          recorder.pause();
          return { ok: true, playing: recorder.playing };
        }
        if (action === 'clearPath') {
          recorder.clear();
          return { ok: true, keyframes: 0 };
        }
        if (action === 'importPath' && pathData) {
          recorder.fromJSON(pathData);
          return { ok: true, keyframes: recorder.frames.length };
        }
        return { ok: true, keyframes: recorder.frames.length, duration: recorder.duration, path: recorder.toJSON() };
      },
    },

    {
      name: 'petacity_reset_movie_set',
      description: 'Clear all active movie-set overrides in one call: restore all building lights & facades, restore hijacked billboards, remove projected holograms, release overridden cars, and stop scripted camera shots.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        director.clearBuildingOverrides();
        director.clearSignOverrides();
        director.clearProjections();
        director.releaseVehicle(null);
        director.stopCameraScript();
        return { ok: true };
      },
    },
  ];
}

/**
 * Register Petacity's full Movie-Set Tool Suite with:
 *   1. Native W3C/Chrome WebMCP (`navigator.modelContext.registerTool` / `provideContext`)
 *      — plus a clean polyfill on `navigator.modelContext` when running in browsers
 *      without native WebMCP enabled yet!
 *   2. `window.petacity` SDK (`callTool`, `listTools`, `director`, `getState`, `applyState`)
 *   3. `window.postMessage` RPC (`{ type: 'petacity:mcp:call', id, tool, args }`)
 */
export function registerPetacityWebMCP(ctx) {
  const tools = buildPetacityTools(ctx);
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const callTool = async (name, args = {}) => {
    const tool = toolMap.get(name);
    if (!tool) {
      throw new Error(`Unknown Petacity WebMCP tool "${name}". Available: ${[...toolMap.keys()].join(', ')}`);
    }
    return await tool.execute(args || {});
  };

  const listTools = () => tools.map(({ name, description, inputSchema }) => ({
    name, description, inputSchema,
  }));

  // 1. Register with `navigator.modelContext` (native WebMCP or compliant polyfill)
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  if (nav) {
    const nativeMc = nav.modelContext;
    if (nativeMc) {
      try {
        if (typeof nativeMc.registerTool === 'function') {
          for (const t of tools) {
            try { nativeMc.unregisterTool?.(t.name); } catch {}
            nativeMc.registerTool({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              execute: (args) => t.execute(args || {}),
            });
          }
        } else if (typeof nativeMc.provideContext === 'function') {
          nativeMc.provideContext({
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
              execute: (args) => t.execute(args || {}),
            })),
          });
        }
      } catch (err) {
        console.warn('[Petacity WebMCP] Native modelContext registration warning:', err);
      }
    } else {
      // Install a lightweight, standards-aligned `navigator.modelContext` surface
      // so in-page agents & Playwright/WebMCP inspectors work in every browser!
      const polyTools = new Map();
      for (const t of tools) polyTools.set(t.name, t);
      try {
        Object.defineProperty(nav, 'modelContext', {
          configurable: true,
          value: {
            isPolyfill: true,
            registerTool(def) { polyTools.set(def.name, def); },
            unregisterTool(name) { polyTools.delete(name); },
            provideContext({ tools: list = [] } = {}) {
              polyTools.clear();
              for (const def of list) polyTools.set(def.name, def);
            },
            listTools() {
              return [...polyTools.values()].map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
            },
            async callTool(name, args = {}) {
              const def = polyTools.get(name);
              if (!def) throw new Error(`Unknown WebMCP tool: ${name}`);
              return await def.execute(args);
            },
          },
        });
      } catch {}
    }
  }

  // 2. Expose ergonomic `window.petacity` global SDK
  const api = {
    version: '15.0.0',
    webmcp: true,
    director: ctx.director,
    listTools,
    callTool,
    tools: Object.fromEntries(tools.map((t) => [t.name, (args) => t.execute(args || {})])),
    getState: ctx.getState,
    applyState: ctx.applyPartialState,
    whatAmILookingAt: (opts) => ctx.director.whatAmILookingAt(opts),
    takeoverBuilding: (opts) => ctx.director.takeoverBuilding(opts),
    displayBuildingMessage: (opts) => ctx.director.displayBuildingMessage(opts),
    takeoverSignage: (opts) => ctx.director.takeoverSignage(opts),
    projectInFrontOfCamera: (opts) => ctx.director.projectInFrontOfCamera(opts),
    controlVehicle: (opts) => ctx.director.controlVehicle(opts),
    runCameraScript: (shots, opts) => ctx.director.runCameraScript(shots, opts),
    resetMovieSet: () => callTool('petacity_reset_movie_set', {}),
  };

  if (typeof window !== 'undefined') {
    window.petacity = api;

    // 3. `window.postMessage` RPC Bridge for parent frames / extensions / multi-agent harnesses
    window.addEventListener('message', async (ev) => {
      const msg = ev?.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'petacity:mcp:list') {
        ev.source?.postMessage?.({
          type: 'petacity:mcp:tools',
          id: msg.id ?? null,
          tools: listTools(),
        }, '*');
      } else if (msg.type === 'petacity:mcp:call' && typeof msg.tool === 'string') {
        try {
          const result = await callTool(msg.tool, msg.args || {});
          ev.source?.postMessage?.({
            type: 'petacity:mcp:result',
            id: msg.id ?? null,
            tool: msg.tool,
            ok: true,
            result,
          }, '*');
        } catch (err) {
          ev.source?.postMessage?.({
            type: 'petacity:mcp:result',
            id: msg.id ?? null,
            tool: msg.tool,
            ok: false,
            error: String(err?.message || err),
          }, '*');
        }
      }
    });
  }

  return api;
}
