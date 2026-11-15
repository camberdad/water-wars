# Water Wars

**Fish for it, or take it by force.** A browser game built on [Tidewater](https://github.com/dgreenheck/tidewater)
(MIT, © DRG Software Solutions LLC). It keeps Tidewater's island, ocean, sky, boat and fishing, and adds
other boats on the water, deck guns and cannons, piracy, bounties, a wanted level and a full upgrade tree.

## Play

Double-click **`Play Water Wars.bat`**, or run:

```sh
npm install
npm run dev      # then open http://127.0.0.1:5189
```

You need a browser with WebGPU (recent Chrome or Edge). The first load compiles shaders and can take a minute.

## How to play

- **Start.** Choose a captain name on the start screen (required), then **Click to set sail** for single
  player, or **🌐 Multiplayer** to join the open sea with everyone else playing.
- **Multiplayer.** One shared open world: you see the other players' boats (their own boat model) sailing live,
  with name tags and blue minimap dots, and their gunfire and cannon shells. No PvP: their shots can't hurt you.
  The NPC boats, fish and giants are your own. Peer-to-peer: players find each other through public Nostr relays
  ([Trystero](https://github.com/dmotz/trystero)) and connect directly over WebRTC, so there is no game server.
- **Diesel** costs $75.71 a gallon: mind the gauge on long trips.
- **Units.** Everything is shown in US units: pounds, inches and feet, gallons, mph and knots.

- **Fish.** Cast from the beach, the pier or the boat (`R` for the rod). Sell to Joe at the fish stand, or at any
  harbour service point. There are 48 real Caribbean and Atlantic species in five rarity tiers:

  | Tier | Value | Share of catches | Examples |
  |---|---|---|---|
  | Common | $60 – $1,000 | ~46% | scaled sardine, dusky damselfish, tomtate, ballyhoo, sand perch, Bermuda chub, silverside, pinfish, grunt, lane snapper, little tunny |
  | Uncommon | $1,000 – $4,500 | ~28% | yellowtail snapper, queen and gray triggerfish, crevalle jack, permit |
  | Rare | $4,500 – $21,600 | ~17% | hogfish, bonefish, snook, cobia, wahoo, king mackerel, rainbow runner |
  | Epic | $21,600 – $108,000 | ~7.5% | mahi-mahi, tarpon, yellowfin tuna, sailfish, goliath grouper, swordfish |
  | Legendary | $108,000 – $144,000 | ~1.5% | golden tilefish, Atlantic bluefin tuna, blue marlin |

  (The shares are the base odds. Fish worth over $1,000 sell for 40% less than before 1.7.1, never under
  $1,000.) Bigger fish of a species are worth more. **The danger tier sets the odds of the valuable fish:**
  they are scarcest in the harbour and the Coastal Waters and far more common out at sea. In deep water a
  legendary is about 1 bite in 75 in the harbour, 1 in 55 in the Coastal Waters, 1 in 30 in the Open Sea and
  1 in 22 in the Deadwater, where about half of all bites are rare or better. Deep water helps too. The big ones need strong line and a good reel, and trophies (rare and up) that don't fit in the
  hold are strapped on deck.
- **Stern rods.** The **stern rod holder** upgrade (fishing tab: 1, 2 or 3 extra rods, $8,000 / $35,000 /
  $90,000) puts rods in holders on the back of the boat. While you are aboard and the boat is stopped or
  barely moving, their lines are out astern and fish for you, much slower than a rod in your hands, and only
  out in the **Open Sea and the Deadwater** (danger tiers 2 and 3). When
  one bends over you have 9 seconds to press **`B`**: you step away from the helm, your own line comes in and
  the stern rod's fish is on your rod for the usual fight.
- **Giant fish.** Whale-sized fish (Leviathan grouper, Titan bluefin, Giant oarfish, Colossal tarpon, 23–52 ft)
  surface out in deep water now and then; the minimap marks them in pink. Fit a **harpoon** (Weapons tab), aim
  at a surfaced giant from the helm and press **`Q`** to spear it from the stern. It is tethered to your boat
  and fights, dragging you, until it tires; then tow it into a harbour (the pier or a sea station), where it is
  landed and sold like any other fish, for $150,000 to $312,000. Giants are rare close in (now and then one
  surfaces far out in the Open Sea), common in the Open Sea (up to three about at once) and everywhere in the
  Deadwater (up to four). A notice tells you when one turns up and each time it surfaces, and the minimap
  marks them in pink. Hold `Q` to cut it loose.
- **Turn pirate.** Take the helm (`E` at the wheel). **Left mouse** fires the deck gun at the crosshair (it
  overheats, so fire in bursts). **Right mouse** fires the bow cannon once you've bought one. Ammo is
  unlimited. Shoot a boat until it burns, pull alongside and press **`G`** to plunder its cash and fish. Ramming
  at speed damages the other boat; bumping into boats never damages yours. The aim is steady: the
  helm camera and your shots ignore the waves, so the crosshair stays where you put it. Boats can't capsize:
  a stabiliser keeps them within ~30° of level, and the bow no longer rears up under full throttle (if a
  boat is ever heeled far over, press **`X`** to right it).
- **The other boats:**
  - *Fishing boats* (white) carry a little cash and their catch. Some have a rifle.
  - *Traders* (green) carry more cash and a machine gun. They run and shoot back.
  - *Pirates* (black, with a skull flag) roam the **danger tiers** outside the harbour. They attack on sight
    when you come near, and get tougher, richer and keener the further out you sail. Sinking them is legal and
    pays a bounty.
- **Three danger tiers** ring the harbour, marked on the map and by buoys at the borders:
  1. **Coastal Waters** (220-700 m out): a few weak pirates that only attack up close.
  2. **Open Sea** (700-1,400 m, past the amber buoys): tougher pirates, rarer fish, plunder x1.5,
     and the giant fish surface here.
  3. **Deadwater** (1,400-2,400 m, past the red buoys): pirate warlords with cannons, the rarest fish,
     plunder x2.5 and the most giants.
  Past 2,400 m is the edge of the charted sea: the current turns you back.
  - *Coast guard* (grey, flashing lights) come after you once you're wanted.
- **Wanted level.** Attacking fishers, traders or the coast guard earns you stars. From ★★ the coast guard
  hunts you, but never in a safe zone: it turns back and stays away until you sail out. Lie low for a while to let it cool off, or pay your fines at the harbour.
- **Getting sunk** loses your catch and a quarter of your money, and you're towed back to the pier.
- **Safe zones** (green on the map): the harbour (the bay, the pier, the beach and the reef) and the eight
  **sea stations** (Westpoint Station, Eastwind Station, Southreach Barge, Coral Light Rig, and out in the far
  tiers Midway Station, Southern Cross, Eastmost and Westmost Outposts). Nobody fires on
  you there and your guns stay holstered. Press **`U`** alongside a station for full harbour services.
- **New boats** are the big savings goal (Boats tab): a *Harbour workboat* ($25,000, an open steel boat,
  cheap and quick), a *Harbour trawler* ($60,000, tough, big hold), an *Old fishing launch* ($95,000, slow but a
  cavernous hold and a thick hide), a *Sport-fishing yacht* ($160,000, fast), a *Deep-sea fishing ship*
  ($400,000, a fortress with a huge hold) and the *WaveCutter speedboat* ($800,000, the fastest thing on
  the water). On any boat, press `E` near the wheel or in the middle of the boat to take the helm. Each multiplies its own upgrades; switch between owned boats at the harbour or Marta's.
  **Every boat is upgraded separately:** the engine, armour, hold, fuel tank, pumps, salvage gear, every
  weapon and the harpoon, the fish finder, deck lights and stern rod holders are fitted to one boat (a new
  boat starts with the basics). Your tackle (rod, reel, line, bait, chum) goes with you onto every boat. You can walk the deck
  of every boat (its walkable deck is worked out from the model: rails, cabins and deck fittings are solid).
- **Upgrades** come from Marta at the chandlery, or from **harbour services** (`U` by the pier or at a sea station):
  - **Boat:** hull armour (up to battleship plating, 1,600 hp), engine (up to a hydrofoil jet drive), fish
    hold (up to 2,646 lb), fuel tank (up to 317 gal), damage control (up to a self-sealing nano hull), and
    **salvage gear** (up to +100% cash from every wreck you plunder)
  - **Weapons:** deck gun (rifle → carbine → MG → twin MG → rotary → twin 20 mm → twin 30 mm autocannon),
    gun cooling (up to cryogenic), bow cannon (swivel gun → deck cannon → naval gun → heavy naval gun → rail
    cannon), cannon loader (up to quad-feed), and **targeting** (up to a fire-control computer: 70% tighter spread)
  - **Fishing:** line (up to 400 lb titanium), reel (up to a hydraulic winch), rod (up to a pro offshore
    rod), fish finder, deck lights, **bait & lures** (up to twice the epic and legendary bites) and **chum**
    (fish bite up to twice as soon)
  - **Services:** diesel, hull repairs, paying off fines; every service point also buys your catch

| Key | Action |
|---|---|
| W A S D | Move / throttle and steer at the helm |
| Mouse | Look / aim (click to capture the mouse) |
| E | Board, take or leave the helm, talk to Joe and Marta |
| Left mouse | At the helm: fire the deck gun · on foot/deck: cast, strike, reel |
| Right mouse | At the helm: fire the bow cannon · on foot/deck: reel in |
| G | Loot a wreck alongside |
| Q | At the helm: fire the harpoon at a giant fish · hold to cut the tether |
| U | Harbour services (alongside the pier in your boat, on foot at the kiosk on the end of the main dock, or at a sea station) |
| V | Boat camera, 1st / 3rd person |
| R | Fishing rod |
| B | Grab a bent stern rod (rod holder upgrade) |
| Space | Also passes the catch cards and closes the cooler, shop and help panels |
| I / Tab | Cooler and fish log |
| K | High scores (the live board) |
| F1 | All controls and the guide |

## High scores

A shared, live high-score board, the same set-up as Castle Rangers: one [jsonbin.io](https://jsonbin.io) bin
read and written straight from the page. Captains are ranked by **lifetime earnings** (fish sold, bounties
and plunder; spending doesn't lower it), with their fish caught, pirates sunk, giants landed, the furthest
danger tier they reached, their boat and their total time at sea. While you play, your row syncs about every
10 seconds and is marked active, so the board shows who is at sea right now (green rows). Open it with the
**High Scores** button on the start screen or **K** in game; it refreshes every 15 seconds while open. If the
bin can't be reached the board shows this device's scores. The bin ID and key are at the top of
`src/game/HighScores.js`.

## Live updates

The game keeps itself up to date. Every build publishes `version.json`; the game checks it at start-up, every
30 seconds and when you come back to the tab. On the loading or home screen a new release installs itself (an
"Updating Water Wars" card, then a reload into the new version); while you play, a notice asks you to return
to the home screen, with a button that saves your progress and installs it. The version is in `package.json`.

## What's new on top of Tidewater

| File | What it does |
|---|---|
| `src/game/combat/Combat.js` | Aiming and firing from the helm, hit tests, damage, ramming, sinking and respawn, wanted level, bounties, looting, harbour services |
| `src/game/combat/NPCBoats.js` | The other boats: factions, hull paint, AI (cruise, fish, flee, attack, circle), their guns, wrecks and sinking |
| `src/game/combat/CombatFX.js` | Tracers, cannon shells, muzzle flashes, fire, smoke, splinters, water splashes (through the ocean's spray particles) |
| `src/game/combat/WeaponModels.js` | Procedural deck guns, cannons, the pirate flag and the coast-guard light bar |
| `src/game/combat/CombatHUD.js` | Hull, gun heat, shells, wanted stars, crosshair, boat labels, minimap dots, the "Sunk!" screen |
| `src/game/combat/CombatSFX.js` | Synthesised gunfire and explosions |
| `src/game/BoatCatalog.js`, `Boats.js` | The boats you can buy (stats, model fitting) and their loader |
| `src/game/DangerZones.js` | The three danger tiers, their buoys and rewards |
| `src/game/Harbours.js` | Safe zones and the eight sea stations |
| `src/game/Giants.js` | Giant fish: surfacing, the stern harpoon, the tether, towing and landing |
| `src/game/FishTable.js`, `Bites.js` | The 40 species, rarity tiers, values and bite odds |
| `src/game/HighScores.js` | The shared high-score board (jsonbin.io) and its screen |
| `src/game/Multiplayer.js` | Open-world multiplayer: joining, sending your boat, drawing other players |
| `src/version.js` | The version shown on the start screen |
| `tools/boats/convert.mjs` | Converts the boat models (OBJ/FBX) into `public/models/boats/` (`node tools/boats/convert.mjs`) |
| `src/game/Gear.js`, `GameState.js`, `GameHUD.js` | Upgrade tracks by category, hull / shells / wanted / pirate record in the save, the tabbed shop |

The rest (rendering engine, ocean, sky, world, audio, fishing) is Tidewater's. See below and `CREDITS.md`.

---

# Tidewater (upstream)

An island fishing game for the browser. Cast from the pier, the beach or your own boat, fight the fish,
sell your catch to Joe at the fish stand, and spend it on better gear at Marta's chandlery. Around it is a
real-time tropical island and ocean: swim the reef, drive the boat out to deep water, and watch a humpback
breach. It runs directly on WebGPU and WGSL with its own small rendering engine, no framework.

**Play it:** https://dgreenheck.github.io/tidewater/

![Fishing off the pier at golden hour](docs/screenshot.jpg)

![The beach in the late afternoon](docs/screenshot-beach.jpg)

## Requirements

- A browser with WebGPU: a recent Chrome, Edge or Safari.
- A capable GPU. It targets 60 fps at 2560×1267 on an Apple M5 Pro, and dynamic resolution scales
  the render down on slower machines.
- The first load compiles several hundred shaders, which can take a minute or more. Later visits are
  faster because the browser caches them.

## Features

**Fishing**
- A spinning rod and reel that cast, reel and bend under load, with the bail, rotor and crank animated.
- Bites that depend on the water (shallows, pier, reef, bay, deep water), depth and time of day, across
  18 Caribbean species.
- A line-tension fight: keep the tension in the green band, ease off when the fish runs.
- A full-screen catch card with the fish's length and weight, a fish log with records, and a cooler.
- Joe's fish stand buys your catch; Marta's chandlery sells line, reels, rods, a bigger hold, fuel, a rebuilt
  engine, a fish finder and deck floodlights for night fishing.
- Walk the deck and the wheelhouse while the boat drifts; the boat burns fuel.
- A first-play guide, contextual tips and a minimap. Progress is saved in the browser.

**Ocean**
- Four-cascade FFT ocean (Tessendorf spectra) with foam, whitecaps, wind streaks and swell.
- Depth-aware breaking waves with peeling shoulders, whitewater, spray and foam lace.
- A shallow-water simulation for swash running up and down the sand.
- Boat wake and bow spray, and a whale wake.
- Caustics on the seabed and in the water, with light shafts.
- A split underwater/above-water view at the waterline, with water droplets on the lens after surfacing.
- Refraction of the seabed through the surface, including behind the pier and boats.

**Sky**
- Physically based atmosphere (Hillaire 2020) with a sun, moon and stars.
- Volumetric cumulus and wispy cirrus with cloud shadows on the land.
- Aerial perspective and sea haze.
- God rays, and a lens flare with occlusion.

**World**
- An island with a beach, hills, headlands and rocks.
- A fishing village, a pier, and the vendors' stalls built from Poly Haven scans.
- Realistic vendor characters (Microsoft Rocketbox) with skinned animation.
- A coral reef with fish.
- Palms, bananas, monstera, elephant ear, heliconia, bird of paradise, broadleaf trees, shrubs and dune
  grass, with impostors and dithered LOD fades.
- Beach debris.
- Birds, crabs and marine snow.
- A humpback whale with an escort of fish, blows, fluke dives and breaches.

**Lighting and post**
- Cascaded shadows with contact-hardening penumbrae, and screen-space contact shadows.
- Ground bounce light.
- GTAO ambient occlusion.
- Temporal upscaling and sharpening.
- Bloom, auto exposure and motion blur.
- Night lighting from lanterns, windows and the boat, plus a flashlight that also works underwater.

**Audio**
- Positional audio from real CC0 field recordings: surf timed to each breaking wave, wind, birds, the boat
  engine, footsteps by surface, underwater ambience, whale song, and the rod and reel (casts, the bail,
  reeling, the drag, line snaps, splashes).

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (click to capture the mouse, Esc to release) |
| Shift | Sprint / boat boost |
| Space | Jump / swim up |
| C | Crouch / dive |
| E | Interact: board the boat, take or leave the helm, step ashore, trade with the fish buyer or the chandlery |
| V | Boat camera at the helm (1st / 3rd person) |
| R | Take out / put away the fishing rod |
| Left mouse | Hold to wind up, release to cast · strike when a fish takes the bait · hold to reel |
| Right mouse | Reel an empty line in |
| I or Tab | Cooler / fish hold and the fish log |
| F | Free camera |
| L | Flashlight |
| T | Pause time |
| M | Mute |
| H | Settings panel |
| P | Photo mode |
| F1 or ? | All controls |

### Fishing

Walk the deck of the boat while it drifts, or fish from the pier and the beach. Cast, wait for the bobber
to dip and strike when it's pulled under, then play the fish: keep the line tension in the green band,
ease off when it runs. Different water holds different fish (the shallows, the pier, the reef, the bay and
deep water offshore), and some bite best at dawn, dusk or night. Sell your catch to Joe at the fish stand
on the beach by the pier, and spend it at Marta's chandlery by the boathouse: stronger line, a faster reel,
a longer rod, a bigger fish hold, a larger fuel tank, a rebuilt engine, a fish finder and deck floodlights for
night fishing. The boat burns diesel at the helm; fill up at the chandlery. Progress is saved in the browser.

The settings panel (H) exposes the sea state, time of day, sun azimuth, clouds, haze, post-processing and
more.

## URL options

Add these to the URL, for example `?fly&noAudio`:

| Option | Effect |
|---|---|
| `fly` | Start in the free camera |
| `noAudio` | Disable sound |
| `noClouds` | Skip the volumetric clouds |
| `noHaze` | Skip the haze and sun shafts |
| `noCaustics` | Skip caustics |
| `noVeg` | Skip vegetation |
| `noSim` | Skip the swash (shallow-water) simulation |

## Running locally

```sh
npm install
npm run dev      # http://127.0.0.1:5189
npm run build    # static build in dist/
```

Every push to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

## Project layout

| Folder | Contents |
|---|---|
| `src/game/` | The fishing game: rod, bites, the fight, catch card, cooler and log, vendors and stalls, guide, minimap, HUD |
| `src/engine/` | The rendering engine: math, scene graph and geometry, GPU resources, WGSL shader composition, materials, lighting and shadows |
| `src/ocean/` | FFT ocean, water surface and material, shore waves, breakers, swash, wake, caustics, underwater lighting |
| `src/sky/` | Atmosphere, clouds, sky and environment |
| `src/world/` | Terrain, village, pier, reef, fish, vegetation, rocks, debris, wildlife, whale, boat |
| `src/post/` | Post chain: AO, underwater composite, haze, TAAU, motion blur, bloom, lens flare, droplets |
| `src/materials/` | Shared lighting: shadow filtering, bounce light, contact shadows, local lights, LOD fades |
| `src/player/` | Walking, swimming, the boat and the free camera |
| `src/audio/` | The sample-based soundscape |
| `src/ui/` | Settings panel, loading screen and HUD |
| `tools/` | Scripts that fetch and convert the characters, stall props and fishing sounds |
| `test/` | Headless engine smoke test and game-logic tests (`npm test`), and HUD / loader dev pages |

## Credits and license

The code is released under the MIT license; see [LICENSE](LICENSE). Third-party assets (CC0 audio from
Freesound, CC0 scans from Poly Haven, MIT characters from Microsoft Rocketbox, OFL / Apache fonts) and
technique references are listed in [CREDITS.md](CREDITS.md).
