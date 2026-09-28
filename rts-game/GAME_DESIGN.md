# Scrapline Command: Game Design Reference

A complete description of the game as it exists today: how it plays, every
rule, every number, how the computer opponent thinks, what has been tested,
and what is known to be wrong. It is written so that someone (or an AI
assistant) who has never seen the code can reason about the game and plan
improvements.

**Last updated:** 28 September 2026. It covers everything up to and including
the tech tree (upgrades, research, Radar, Repair Pad) and the collapsible
minimap.

All values below are copied from the code. The balance numbers live in
`js/config.js`; a few rules are fixed inside the other files and are named
with their file so they can be found.

---

## Contents

1. [The game in one page](#1-the-game-in-one-page)
2. [Win and loss](#2-win-and-loss)
3. [The battlefield](#3-the-battlefield)
4. [Starting position](#4-starting-position)
5. [Economy: scrap, storage and income](#5-economy-scrap-storage-and-income)
6. [Units](#6-units)
7. [Buildings](#7-buildings)
8. [Tech tree: upgrades and research](#8-tech-tree-upgrades-and-research)
9. [Combat rules](#9-combat-rules)
10. [Unit orders and behaviour](#10-unit-orders-and-behaviour)
11. [Building rules: territory and placement](#11-building-rules-territory-and-placement)
12. [Vision, fog of war and radar](#12-vision-fog-of-war-and-radar)
13. [The computer opponent](#13-the-computer-opponent)
14. [Difficulty levels](#14-difficulty-levels)
15. [Controls](#15-controls)
16. [Screen layout](#16-screen-layout)
17. [Art: how things are drawn, and sprite sizes](#17-art-how-things-are-drawn-and-sprite-sizes)
18. [Derived numbers (for balancing)](#18-derived-numbers-for-balancing)
19. [How the code is organised](#19-how-the-code-is-organised)
20. [What has been tested, and how](#20-what-has-been-tested-and-how)
21. [Known problems and open questions](#21-known-problems-and-open-questions)
22. [Design decisions already made](#22-design-decisions-already-made)
23. [A framework for systematic improvement](#23-a-framework-for-systematic-improvement)
24. [Change log](#24-change-log)

---

## 1. The game in one page

**Genre:** real-time strategy, viewed from directly above, in a web browser.
Plays on desktop (mouse and keyboard) and on phones and tablets (touch).

**Inspirations:** Battlezone 2 (scrap economy, Recycler, Scavengers deploying
onto geysers, Constructors), Battlefield 2 (a battlefield of vehicles with
distinct roles), and 4X / RTS games (gather, build, expand, research, conquer).

**The loop:**

1. Drive your mobile Recycler onto a scrap geyser and deploy it. It becomes
   your headquarters.
2. Scavengers collect loose scrap from the ground and bring it home.
3. Build a Factory, then combat vehicles and Gun Towers.
4. Upgrade the Recycler to **Recycler II**. Only then can you build
   Scavenger IIs, which can claim scrap geysers as Extractors, and
   Constructor IIs, which can repair.
5. Expand onto geysers for steady income. Build silos to store more scrap.
6. Research Mk II vehicles at a Research Lab and upgrade a Factory to
   **Factory II** to build them. Add a Radar and a Repair Pad.
7. Defend against the enemy's attack waves.
8. Destroy the enemy Recycler.

**Players:** one human (Blue Command) against one computer opponent (Red
Legion). A spectator mode lets two computer players fight.

**Match length:** roughly 8 to 30+ minutes, depending on difficulty and play.

---

## 2. Win and loss

- **You win** when the enemy has no Recycler, whether deployed or still a
  vehicle.
- **You lose** when you have no Recycler.
- Nothing else ends the game: there are no tickets, flags, timers or score
  limits.
- The end screen shows, for both sides: vehicles built, enemies destroyed,
  vehicles lost, scrap gathered, and battle length.

The Recycler cannot be demolished by its owner.

---

## 3. The battlefield

### Size and grid

| Setting | Value |
| --- | --- |
| Map size | 96 × 72 squares ("tiles") |
| Tile size | 32 pixels |
| Map size in pixels | 3,072 × 2,304 |
| Game updates ("ticks") per second | 30 |

### Terrain

Each tile is one of four types. Rock and water block all vehicles.

| Terrain | Passable | How it is generated |
| --- | --- | --- |
| Grass | Yes | Default |
| Dirt | Yes | Patches from a second noise layer (cosmetic only) |
| Rock | No | Where the height noise is above 0.74 |
| Water | No | Where the height noise is below 0.24 |

Terrain has no effect on speed, sight or combat. It only blocks movement.
The map edge is always rock.

### Symmetry

Every map is **point-symmetric**: rotating it half a turn about its centre
gives the same map. Whatever is near one base is also near the other. Maps
come from a number called the **seed**. The same seed always gives the same
map, and adding `?seed=42` to the address picks one.

After generation the map is checked and repaired: roads are dug so both
bases, every geyser, every scrap field and every clearing can be reached.

### Fixed features

Positions are in tiles, given for the bottom-left half. The top-right half
mirrors them.

| Feature | Positions (bottom-left half) | Notes |
| --- | --- | --- |
| Starting position | (10, 61) | Mirrored: (85, 10). A 10-tile radius is cleared. |
| Scrap geysers | (10, 62) at the start, (16, 54), (22, 20), (34, 50), (44, 34) | 10 geysers in total, 5 per half. Positions are tile corners. |
| Scrap fields | (20, 64), (7, 48), (42, 60), (16, 34), (40, 30) | 10 fields in total. Each has 5 to 7 piles of 400 scrap within about 3 tiles. |
| Open clearings | (22, 20), (34, 50), plus the map centre | Terrain cleared to a 4-tile radius. |

**Total loose scrap on a fresh map:** about 10 fields × 6 piles × 400 ≈
24,000, so roughly 12,000 per side.

### Starting corner

Which side starts in which corner is **chosen at random every game** (seeded,
so replays match). This is a workaround for a corner advantage; see
[Known problems](#21-known-problems-and-open-questions).

---

## 4. Starting position

Each side begins with:

| Asset | Amount |
| --- | --- |
| Scrap | 300 (storage is full) |
| Storage capacity | 300 (held by the mobile Recycler) |
| Recycler (mobile) | 1, not deployed. Starts selected, with a **Deploy base** button. |
| Scavengers | 2, basic (start collecting loose scrap automatically; cannot deploy on geysers) |
| Constructor | 1, basic (can build; cannot repair) |
| Scouts | 2 |
| Tank | 1 |
| Buildings | None |
| Research | None |

A geyser sits about 66 pixels from the starting Recycler.

---

## 5. Economy: scrap, storage and income

Scrap is the only resource. It pays for every unit, building, upgrade and
research.

### Storage (the cap)

You can only hold as much scrap as your storage allows. Income that would go
over the cap is not lost; it waits:

- Scavengers and Transports wait at the base with their load, retrying once
  a second.
- Extractors hold up to 30 in their own tank, then stop pumping.
- The Recycler's own trickle is simply not added.

| Source of storage | Adds |
| --- | --- |
| Recycler (mobile, deploying, deployed, or upgraded) | 300 |
| Base Silo | 300 |
| Extractor Silo | 125 |

If a silo is destroyed and storage drops below what you hold, the excess is
lost. The top bar shows `held / capacity` and turns yellow when full. A
"storage full" warning appears at most every 20 seconds.

### Ways to earn scrap

| Source | Rate | Delivered how | Runs out? |
| --- | --- | --- | --- |
| Scavenger (either tier) collecting loose scrap | Gathers 4 per second, carries 25 per trip. Real income depends on distance: roughly 40 to 70 a minute per Scavenger near home. | Drives it to the Recycler, a Base Silo or an Extractor Silo | Yes. Each pile holds 400, and fields empty over time. |
| Extractor on a geyser (needs a **Scavenger II** to create) | 1.0 per second (60 a minute) | With an Extractor Silo touching it, straight into storage. Without one, into its own 30-scrap tank, which Transports empty. | No |
| Deployed Recycler | 0.05 per second (3 a minute), a twentieth of an Extractor | Straight into storage | No |
| Salvage from destroyed vehicles | 30% of the vehicle's cost, left as a pile on the ground | Collected by Scavengers | Yes |
| Demolishing your own building | 50% of its cost, left as piles of at most 40 on the ground | Collected by Scavengers | Yes |
| Cancelling a unit in a build queue | 100% of its cost, straight to storage (if there is room) | Immediate | n/a |

The computer opponent's income is multiplied by its difficulty's
`incomeMult` (see [Difficulty levels](#14-difficulty-levels)). The human
player always has ×1.

### Spending

Costs are paid in full when a unit is queued, a building is placed, an
upgrade is started, or research begins. You can queue at most 5 units per
building. Units in a queue can be cancelled for a full refund; buildings can
be demolished (see section 7).

### The flow in words

```
loose scrap ──Scavenger──▶ Recycler / Base Silo / Extractor Silo ──▶ STORAGE
geyser ──Extractor (from a Scavenger II)──▶ Extractor Silo touching it? ──yes──▶ STORAGE
                                                                     └─no──▶ tank (30) ──Transport──▶ STORAGE
Recycler's own geyser ──(3/min)──▶ STORAGE
```

---

## 6. Units

### Full stats

Speed is in pixels per second (a tile is 32 pixels). Sight and range are in
pixels. "Radius" is the unit's collision size. "Tier" shows what is needed
to build it.

| Unit | Role | Cost | Build time | HP | Speed | Sight | Radius | Built at | Needs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Recycler (mobile) | Headquarters | — | — | 2,500 | 30 | 300 | 22 | Starts on map | — |
| Scavenger | Harvester | 60 | 6 s | 180 | 43 | 200 | 13 | Recycler | — |
| Scavenger II | Harvester | 80 | 7 s | 180 | 43 | 200 | 13 | Recycler II | Recycler upgrade |
| Constructor | Builder | 80 | 8 s | 160 | 43 | 220 | 13 | Recycler | — |
| Constructor II | Builder | 110 | 9 s | 200 | 43 | 220 | 13 | Recycler II | Recycler upgrade |
| Transport | Hauler | 70 | 7 s | 120 + 150 shield | 39 | 200 | 14 | Recycler / Recycler II | — |
| Scout | Combat | 50 | 5 s | 140 | 98 | 330 | 11 | Factory | — |
| Tank | Combat | 100 | 9 s | 400 | 40 | 260 | 15 | Factory | — |
| Artillery | Combat | 140 | 12 s | 200 | 32 | 220 | 15 | Factory | — |
| Scout Mk II | Combat | 75 | 7 s | 196 | 118 | 330 | 11 | Factory II | Advanced Scouts |
| Tank Mk II | Combat | 150 | 12 s | 560 | 48 | 260 | 15 | Factory II | Advanced Tanks |
| Artillery Mk II | Combat | 210 | 16 s | 280 | 38 | 220 | 15 | Factory II | Advanced Artillery |

**Speed chain (a stated design rule):** Transport 39 → Scavenger 43 (+10%)
= Constructor 43. Tank 40, Artillery 32 (kept the slowest), Scout 98. The
mobile Recycler moves at 30. Mk II vehicles are 20% faster than their basic
versions.

**Mk II rule of thumb:** about +40% HP, +30% damage, +20% speed, for +50%
cost. A Mk II counts as the same kind of vehicle as its basic version for
orders and the Army menu.

### Weapons

| Unit | Range | Min range | Damage per shot | Seconds between shots | Projectile | Splash | vs buildings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Scout | 170 | — | 8 | 0.35 | Bullet (900 px/s, homing) | — | ×0.5 |
| Scout Mk II | 170 | — | 10 | 0.35 | Bullet | — | ×0.5 |
| Tank | 200 | — | 34 | 1.2 | Shell (620 px/s, homing) | — | ×1.0 |
| Tank Mk II | 200 | — | 44 | 1.2 | Shell | — | ×1.0 |
| Artillery | 440 | 110 | 60 | 3.5 | Arcing shell (260 px/s, aimed at a spot) | 55 px radius | ×1.6 |
| Artillery Mk II | 440 | 110 | 78 | 3.5 | Arcing shell | 55 px radius | ×1.6 |
| Recycler (deployed) | 210 | — | 24 | 0.8 | Bullet | — | ×1.0 |
| Gun Tower | 250 | — | 22 | 0.9 | Shell | — | ×1.0 |

Scavengers, Constructors, Transports and the mobile Recycler are unarmed.

### Special abilities

| Unit | Ability |
| --- | --- |
| Recycler (mobile) | **Deploy base:** drives onto a free geyser and becomes the Recycler building (10 s to set up). Holds 300 storage while mobile. |
| Scavenger | Collects loose scrap automatically. Carries 25. **Cannot** deploy on geysers. |
| Scavenger II | As Scavenger, plus **Deploy on geyser:** becomes an Extractor (8 s to set up). |
| Constructor | Builds buildings and finishes construction sites. **Cannot** repair. |
| Constructor II | Builds, and **repairs** damaged buildings at 25 HP per second. |
| Transport | **Auto-haul:** empties the fullest Extractor tank (at least 15 stored), preferring ones no other Transport is heading to. Loads 40 per second, carries 60. **Shield:** absorbs the first 150 damage; recharges at 20 per second after 3 seconds without being hit. |
| Scout (and Mk II) | **Scout** (alone) or **Scout as pack** / **Scout solo** (groups). |
| Tank (and Mk II) | **Patrol:** loops around all your buildings. |
| Artillery (and Mk II) | **Defend:** holds a post beside one of your buildings. |
| Any damaged vehicle | **Go repair:** drives to the nearest Repair Pad (the button appears once you have one). |

---

## 7. Buildings

| Building | Cost | Build time | HP | Size (tiles) | Sight | Storage | Territory radius (tiles) | Built by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Recycler | — | 10 s (deploy) | 4,000 (5,000 as Recycler II) | 3×3 | 300 | 300 | 14 | Deploying the mobile Recycler on a geyser |
| Factory | 150 | 18 s | 1,400 (1,800 as Factory II) | 3×3 | 220 | — | 10 | Constructor |
| Extractor | — | 8 s (deploy) | 900 | 2×2 | 240 | tank of 30 | 9 | Deploying a Scavenger II on a geyser |
| Base Silo | 250 | 14 s | 1,100 | 2×2 | 200 | 300 | 8 | Constructor |
| Extractor Silo | 500 | 12 s | 800 | 2×2 | 200 | 125 | 5 | Constructor |
| Gun Tower | 110 | 14 s | 1,000 | 2×2 | 300 | — | — | Constructor |
| Research Lab | 200 | 20 s | 900 | 2×2 | 200 | — | 6 | Constructor |
| Radar | 150 | 16 s | 600 | 2×2 | 220 | — | 6 | Constructor |
| Repair Pad | 150 | 12 s | 800 | 3×3, flat | 180 | — | — | Constructor |

### What each building does

| Building | Produces / offers | Other functions |
| --- | --- | --- |
| Recycler | Scavenger, Constructor, Transport. **Upgrade to Recycler II.** | Headquarters. Defence gun (fires from the centre drum; no visible barrel). Drop-off point. Pumps its own geyser at 3 a minute. Cannot be demolished. |
| Recycler II | Scavenger II, Constructor II, Transport (replaces the basic workers) | As Recycler, with 5,000 HP. |
| Factory | Scout, Tank, Artillery. **Upgrade to Factory II.** | — |
| Factory II | Scout, Tank, Artillery, plus Scout / Tank / Artillery **Mk II** (each once researched; otherwise shown as "Research first") | 1,800 HP. |
| Extractor | — | Pumps 60 a minute from its geyser. Salvage value counts as 60 (the Scavenger it came from). |
| Base Silo | — | Adds 300 storage. Drop-off point. Must be within 7 tiles of your Recycler's edge. |
| Extractor Silo | — | Adds 125 storage. Drop-off point. Must touch one of your Extractors (at most one empty square between them). Makes that Extractor send its scrap straight to storage. |
| Gun Tower | — | Defensive gun (see Weapons). |
| Research Lab | Research: Advanced Scouts, Advanced Tanks, Advanced Artillery (see section 8) | One topic at a time. The glass dome pulses while researching. |
| Radar | — | Pings every 30 s, revealing a 750 px circle for 4 s (see section 12). |
| Repair Pad | — | Vehicles drive over it (it doesn't block movement). Your vehicles parked on it regain 30 HP per second, and Transport shields refill at the same rate. Nothing can be built on top of it. |

### Building lifecycle

- **Placing:** the full cost is paid immediately and the building appears
  as a construction site at 10% HP.
- **Construction:** a Constructor (either tier) must stand next to it.
  Progress runs from 0 to 100% over the build time, and HP rises with it.
- **Deploying** (Recycler, Extractor): no Constructor needed; it sets
  itself up.
- **Repair:** only a **Constructor II** can repair a finished building, at
  25 HP per second. A basic Constructor gets the message "Only a Constructor
  II can repair buildings".
- **Upgrading** (Recycler, Factory): see section 8. Production pauses until
  the upgrade finishes.
- **Waypoint** (Recycler, Factory): every new vehicle drives straight to
  it. Without one, combat units wait beside the building, Scavengers start
  harvesting and Transports start hauling.
- **Demolish:** asks for confirmation, then removes the building and leaves
  half its cost on the ground as scrap piles. Frees a geyser if it was an
  Extractor.
- **Destroyed:** removed with an explosion; frees its geyser; no salvage.

---

## 8. Tech tree: upgrades and research

### What unlocks what

```
Recycler ──(upgrade 250, 40 s)──▶ Recycler II ──▶ Scavenger II ──▶ Extractors on geysers
                                              └─▶ Constructor II ──▶ building repairs

Research Lab ──▶ Advanced Scouts / Tanks / Artillery ──┐
Factory ──(upgrade 200, 30 s)──▶ Factory II ───────────┴─▶ Scout / Tank / Artillery Mk II
```

Radar and Repair Pad have no prerequisites beyond territory and scrap.

### Building upgrades

| Upgrade | Cost | Time | New HP | Unlocks |
| --- | --- | --- | --- | --- |
| Recycler → Recycler II | 250 | 40 s | 5,000 | Builds Scavenger II, Constructor II, Transport (replaces the basic workers) |
| Factory → Factory II | 200 | 30 s | 1,800 | Also builds Scout, Tank and Artillery Mk II, once each is researched |

- Only one upgrade level exists for each.
- Production pauses while a building upgrades; queued units wait.
- Upgraded buildings show gold chevrons.
- A Factory II can be built without any research, but its Mk II buttons say
  "Research first" until researched.

### Research

| Research | Cost | Time | Unlocks |
| --- | --- | --- | --- |
| Advanced Scouts | 150 | 45 s | Scout Mk II |
| Advanced Tanks | 200 | 60 s | Tank Mk II |
| Advanced Artillery | 250 | 75 s | Artillery Mk II |

- A lab researches one topic at a time.
- The same topic can't be researched twice, or in two labs at once.
- Research is permanent for the rest of the game, even if the lab is later
  destroyed.
- The lab shows each topic's state: cost, "Researching 40%", or
  "Researched ✓".

---

## 9. Combat rules

### Targeting

- Units look for targets every 0.4 to 0.6 seconds (randomised).
- They only target enemies their side can currently **see** (fog of war;
  radar pings count).
- Scoring (lower is preferred): distance, plus 40 for an armed building,
  plus 200 for an unarmed building, plus 120 for an unarmed unit, minus 150
  for whoever last shot this unit. In short, units prefer nearby armed
  enemies and retaliate against their attacker.
- A unit switches to a new target only if it is at least 60 pixels closer
  than the current one.
- Artillery cannot fire at anything closer than 110 pixels.
- **Artillery must be parked to fire.** It stops, lowers four stabiliser
  legs (0.6 s), and only then can shoot. Given a move order, it first raises
  its legs (0.6 s) before it can drive. It never fires while moving. The
  timings are `ARTILLERY_DEPLOY` and `ARTILLERY_RETRACT` in `config.js`.

### Firing

- The turret turns at 4 radians per second, and a unit fires once its aim
  is within about 14 degrees.
- Bullets and tank shells home in and always hit if the target is alive.
- Artillery shells fly to a spot near the target (random scatter of
  20 + 6% of the distance) and damage everything in a 55-pixel radius.
  Damage falls off to 40% at the edge. Artillery does not hurt its own
  side.
- Distances to buildings are measured from the building's edge, so building
  guns reach as far beyond their walls as vehicle guns do.

### Damage

- Damage is multiplied by the weapon's "vs buildings" factor when hitting
  a building.
- Shields absorb damage before HP.
- Units hit while standing idle turn and fight their attacker.
- Unarmed units and buildings under attack raise an alert, at most once
  every 12 seconds per side.

### Death

- Vehicles explode (1.2 s), then leave a burnt-out wreck (cosmetic, fades
  after 20 seconds) and a salvage pile worth 30% of their cost.
- Buildings explode and leave a scorched crater (cosmetic, fades after
  90 seconds) but no scrap (unless demolished by their owner).

---

## 10. Unit orders and behaviour

### Orders available to the player

| Order | Who | What it does |
| --- | --- | --- |
| Move | Any vehicle | Drives to the point. Groups spread into a grid about 34 pixels apart. |
| Attack-move | Armed vehicles | Moves, but stops to fight anything seen on the way. |
| Attack | Armed vehicles | Chases and fires at one target until it dies or is lost from sight. |
| Stop | Any vehicle | Stops and stands guard. Transports also stop auto-hauling. |
| Gather | Scavengers | Collects a chosen scrap pile, then carries on automatically. |
| Deploy | Scavenger II or mobile Recycler | Drives onto a geyser and becomes an Extractor or the Recycler. A basic Scavenger gets a message explaining it needs to be a Scavenger II. |
| Build | Constructor (either tier) | Places a building or finishes a construction site. |
| Repair | Constructor II | Restores a damaged building. |
| Scout | Scouts | Explores: unexplored ground first, then areas under fog. Fires at enemies passed without stopping. Picks a new destination on arrival or after 45 seconds. |
| Scout as pack | 2+ Scouts | As Scout, but the group travels together in a loose ring of about 34 pixels and picks a new destination when any of them arrives (or after 40 seconds). |
| Patrol | Tanks | Loops around the outside of all your finished buildings, fighting anything met. |
| Defend | Artillery | Takes a post beside the chosen building and fires at anything in range. Never chases. Returns to its post after moving. |
| Auto-haul | Transports | Empties Extractor tanks (see Units). Can be pinned to one Extractor. |
| Go repair | Damaged vehicles | Drives to the nearest Repair Pad and parks on it. |

### Automatic behaviour

- **Idle armed units** attack anything in sight, but give up the chase once
  the target is more than their weapon range + 220 pixels from where they
  were told to stand, and then return there.
- **Idle Scavengers** look for scrap within 450 pixels once a second and go
  back to work. When a pile runs out, they look within 900 pixels.
- **Idle Transports** resume hauling unless told to Stop.
- **Vehicles on a Repair Pad** are repaired automatically, with a pulsing
  green ring and rising green "+" signs. They don't leave the pad by
  themselves.
- **Arrival:** a vehicle counts as arrived when it reaches its destination,
  or when it is within 120 pixels and has not got any closer for 2 seconds
  (this stops crowds jostling forever).
- **Getting unstuck:** a vehicle that barely moves for 1.2 seconds
  re-plans its route; after 3.5 seconds it gives up.
- **Route-finding:** A* search over the tile grid, with diagonal moves
  that never cut rock corners, smoothed into straight legs.

---

## 11. Building rules: territory and placement

A Constructor can place a building only if **all** of these hold:

1. Every tile of the footprint is inside the map, explored by your side, and
   free of rock, water, other buildings and Repair Pads.
2. The footprint is at least one tile away from any scrap geyser (geysers
   are kept free for Extractors).
3. No enemy vehicle is within one building-width of the spot.
4. The spot is inside your **territory**: within the territory radius of one
   of your finished buildings (Recycler 14, Factory 10, Extractor 9, Base
   Silo 8, Research Lab 6, Radar 6, Extractor Silo 5 tiles; Gun Towers and
   Repair Pads add none).
5. Special rules:
   - Base Silos must be within 7 tiles of your Recycler's edge.
   - Extractor Silos must touch one of your Extractors.
6. You can afford it.

Before the Recycler is deployed you have no territory and cannot build.

While placing, the screen shows your territory as green circles, or silo
zones in gold, plus a green or red outline for the building. Towers also
show their firing range.

---

## 12. Vision, fog of war and radar

- Every unit and building sees a circle of its sight radius. Vision is
  recalculated every 3 ticks (10 times per second).
- **Unexplored** ground is nearly black. **Explored but not currently seen**
  ground is dimmed.
- Enemy vehicles are only drawn while visible. Enemy buildings stay drawn,
  faded, where they were last seen.
- The enemy base's health shows `?` in the top bar until your side has
  seen it.
- Artillery can only hit what your side can see, so it relies on spotters.
- **Radar:** each Radar pings once when finished, then every **30 seconds**.
  A ping reveals everything within **750 pixels** (2.5 times a normal
  building's sight) for **4 seconds**, and marks that ground as explored.
  A green ring sweeps outward to show it. Anything revealed can be targeted
  during those 4 seconds, which lets artillery hit targets beyond normal
  sight. The Radar's own constant sight is a normal 220. Its info panel
  shows the time to the next ping.

---

## 13. The computer opponent

The computer plays by exactly the same rules and uses the same commands as
the player. Its only advantage is its difficulty's income multiplier. It
knows where your Recycler is at all times (deployed or not) but must see
other buildings before targeting them.

It makes decisions at intervals (`thinkEvery`, with ±15% random jitter). On
each decision it runs through these steps in order:

1. **Deploy:** if its Recycler is still a vehicle, deploy it on the nearest
   free geyser. Nothing else happens until it is deployed.
2. **Upgrade the Recycler** once past `upgradeBaseAfter` and it has a
   Factory. It saves up for it; while saving, it pauses army production and
   construction.
3. **Recycler production** (only when the Recycler's queue is empty and it
   isn't upgrading), first match wins:
   - a Constructor (Constructor II once upgraded), if it has none;
   - a Constructor II, if upgraded and it has none (so it can repair);
   - a Scavenger II, if it wants a new geyser and has no Scavenger II
     available to deploy;
   - a Transport, if it has fewer Transports than Extractors without an
     Extractor Silo;
   - a Scavenger (Scavenger II once upgraded), if it has fewer than
     `min(maxScavengers, 3 + minutes ÷ 2.5)`.
4. **Expansion:** once upgraded, if not already deploying, below
   `maxExtractors`, past 90 seconds (360 on Easy) and at least 30 seconds
   since its last attempt, it sends its nearest Scavenger II to the nearest
   free geyser on its own half.
5. **Construction** (with an idle Constructor, preferring a Constructor II),
   first match wins:
   1. finish any unfinished building;
   2. repair any building below 60% HP (Constructor II only);
   3. a Factory, if it has none;
   4. a first Gun Tower after 90 seconds (300 on Easy);
   5. a Base Silo, if under `maxBaseSilos`, storage at least 70% full, and
      past 150 seconds;
   6. an Extractor Silo on an Extractor lacking one, once its storage can
      hold 500 and it has 500;
   7. a Research Lab after `labAfter` (never on Easy);
   8. a Radar after `radarAfter` (never on Easy);
   9. a second Factory after 300 seconds (not on Easy);
   10. more Gun Towers, up to 1 plus the number of Extractors, after 200
       seconds, placed at Extractors that have none nearby.

   While saving for a Base Silo, it pauses army production.
6. **Research and Factory upgrade:** an idle lab researches Advanced Tanks,
   then Scouts, then Artillery. Once anything is researched, it upgrades one
   Factory at a time to Factory II. It saves for both, pausing army
   production.
7. **Army production** (each Factory with fewer than 2 queued, not
   upgrading): stops at the army cap. On Easy and Normal the cap also grows
   over time: `3 + minutes × armyPerMinute`, up to `maxArmy`. It picks:
   - a Scout if it has fewer than 2, or scouts are under a quarter of the
     army;
   - Artillery if artillery is under a quarter of its tanks and time is past
     `artilleryAfter`;
   - otherwise a Tank;
   - the **Mk II** version whenever that Factory is a Factory II and the
     research is done.

   It keeps 60 scrap in reserve while its Constructor is busy, and sets the
   Factory waypoint to its rally point, 220 pixels from its Recycler toward
   the map centre.
8. **Defence:** if an enemy combat vehicle it can see is within 380 pixels
   of any of its buildings, every combat unit within 1,400 pixels of its
   Recycler attack-moves there. Nothing else happens that turn.
9. **Attack:**
   - The target is the nearest enemy building it knows of, or your Recycler
     wherever it is.
   - Idle units already out in the field keep pushing to the target after
     the first-attack time; before it, they return to the rally point.
   - When the time is past `nextWave` and enough units are waiting at the
     rally point, it sends exactly `waveSize` of them (the extras stay home)
     and announces "Enemy attack force spotted".
   - `waveSize = min(maxArmy, waveBase + minutes since first attack × waveGrowth)`.
   - The next wave is due `waveEvery` seconds later.

Buildings are placed by searching rings around its Recycler toward the map
centre (Towers at 8 tiles, others at 5), leaving a one-tile gap for driving.
Placement near a target point walks back toward home until a legal spot is
found. The search is done as if the AI were in the bottom-left corner and
then mirrored, so both corners place buildings identically.

**Measured tech timings** (one AI-vs-AI test game on seed 1701):

| Milestone | Normal | Hard |
| --- | --- | --- |
| Recycler II ready | 3:18 | 2:59 |
| First Extractor | 3:36 | 3:32 |
| Advanced Tanks researched | 10:58 | 8:51 |
| Factory II ready | 11:52 | 9:47 |
| First Tank Mk II | 13:29 | 10:58 |

---

## 14. Difficulty levels

| Setting | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Income multiplier | ×0.5 | ×1.0 | ×1.35 |
| First attack at | 10:00 | 5:00 | 3:00 |
| Time between attacks | 4:00 | 2:30 | 1:40 |
| First wave size | 3 | 5 | 6 |
| Wave growth (extra units per minute) | 0.25 | 0.8 | 1.5 |
| Most combat vehicles | 8 | 25 | 40 |
| Army growth limit (units per minute, on top of 3) | 0.7 | 3 | none |
| Most Extractors | 1 | 3 | 4 |
| Most Base Silos | 1 | 2 | 3 |
| Most Scavengers | 3 | 6 | 7 |
| Seconds between decisions | 2.5 | 1.0 | 0.5 |
| Artillery allowed after | 20:00 | 4:00 | 2:30 |
| Second Factory | No | Yes | Yes |
| Upgrades its Recycler after | 5:00 | 2:00 | 1:30 |
| Builds a Research Lab after | never | 6:00 | 4:00 |
| Builds a Radar after | never | 8:00 | 6:00 |

**Measured "do nothing" survival** (the player deploys the Recycler and then
does nothing; one test map, after the tech tree was added):

| Easy | Normal | Hard |
| --- | --- | --- |
| about 16 min | about 9 min | about 5 min |

If the player never deploys at all, the enemy kills the unarmed mobile
Recycler at its first attack.

---

## 15. Controls

### Touch (phones and tablets)

| Action | How |
| --- | --- |
| Select a vehicle | Tap it. Tap the same kind twice quickly to select all of that kind on screen. |
| Order selected vehicles | Tap the ground (move), an enemy (attack), scrap (gather), a geyser (deploy), a damaged building (repair, with a Constructor II), your building (defend, with Artillery), or an Extractor (haul, with Transports). |
| Box select | Press and hold on the map, then drag. |
| Scroll / zoom | One-finger drag / pinch. |
| Build | Select the Constructor, pick a building, tap where it goes, then press **Build here**. |
| Upgrade / research | Select the building and press its **Upgrade** or research button. |
| Quick buttons (top bar) | **Army ▾** (menu: All combat / Scouts / Tanks / Artillery), **Base**, **Idle worker**, **Deselect**. |
| Pause / Help | **Pause** button (❚❚ on narrow phones). The pause screen has **Resume** and **Help**. |
| Minimap | Tap to move the camera. **Map ▾ / Map ▸** folds it away or brings it back. |

### Mouse and keyboard

| Action | How |
| --- | --- |
| Select | Left-click or drag a box. Double-click selects all of a type. Shift adds. |
| Order | Right-click (the same meanings as tapping, above). |
| Command buttons | `Q` `W` `E` `R` `T` `Y` `U` `I`, in the order the buttons appear |
| Attack-move / Stop | `A` then click / `S` |
| Demolish | `Z` (then `Z` again to confirm) |
| Squads | `Ctrl`+`1`–`9` saves; `1`–`9` selects; press twice to jump to it. |
| Jump to base / selection | `H` / `Space` |
| Idle worker | `X` |
| Scroll | Arrow keys, screen edge, middle-drag, or the minimap |
| Zoom | Mouse wheel |
| Pause / mute / help / cancel | `P` / `M` / `F1` / `Esc` |
| Confirm building placement | `Enter` |

The game speed button cycles through ×1, ×2 and ×4.

---

## 16. Screen layout

- **Top bar:** scrap held / capacity, workers, units / 50, your base's
  health %, the enemy base's health % (or `?`), the quick buttons, clock,
  speed and pause. On a narrow phone the clock is hidden, Pause becomes a ❚❚
  symbol, and the quick buttons get their own second row.
- **Quick buttons (in the top bar):** Army ▾ (its menu drops down under
  it), Base, Idle worker, Deselect.
- **Pause screen:** Resume and **Help**. Help is only reachable from here
  (or `F1` on a keyboard, which also pauses).
- **Bottom panel:** the selected unit or building's details, plus its
  command buttons. On phones the details shrink to a one- or two-line summary
  and the buttons wrap into rows of three (portrait) or sit beside the
  summary (sideways), so nothing needs scrolling.
- **Minimap:** bottom-right corner (top-right on phones). Shows fog, units,
  buildings, geysers and alerts. Tap it to move the camera. The **Map**
  button above it folds it down to a small tab; the choice is remembered on
  that device.
- **Message log:** top-left. Shows the latest messages, or only the latest
  two on a sideways phone.
- **On the map:** health bars appear on damaged or selected things. Under a
  building's health bar, a blue bar shows unit production, an amber bar shows
  upgrade or research progress, and a gold bar shows a tank's fill.
- **Screens:** title (difficulty choice, Watch AI vs AI), help, pause, end
  (Victory / Defeat with stats).

---

## 17. Art: how things are drawn, and sprite sizes

Every unit and building is drawn from the **unit design sheet**,
`js/sprites.js` (brief: `UNIT_SPRITES.md`). It draws with vector shapes on
the canvas, so there are **no image files** and everything stays sharp at any
zoom. Hulls are neutral steel; only the team panels change colour (Blue
`#4aa3ff`, Red `#ff5a4a`). `js/render.js` calls `UnitSprites.drawSprite` for
each vehicle and building, and keeps the health bars, selection rings,
progress bars, fog and minimap dots itself.

### What the sprites show

| Thing | On screen |
| --- | --- |
| Tank, Artillery, Gun Tower | Turret turns on its own, recoils and flashes when firing |
| Artillery | Four stabiliser legs fold out when it parks to fire, and fold away before it drives |
| Mk II vehicles, Tier II workers, upgraded buildings | Gold chevrons; plus side skirts (Tank Mk II), fins (Scout Mk II), clamps (Scavenger II) |
| Transport | Dashed shield bubble while the shield is up; flickers when hit |
| Radar | Dish spins |
| Extractor | Pump head spins, centre glows |
| Recycler (deployed) | Centre drum turns. **No visible gun barrel** (see below) |
| Research Lab | Dome glows and pulses while researching |
| Repair Pad | Hazard stripes; green cross pulses |
| Factory | Bay lights blink |
| Anything under half health | Scorch marks, rising smoke, sparks |
| Vehicle destroyed | Explosion, then a burnt-out wreck |
| Building destroyed | Explosion, then a crater |
| Building under construction | Faded sprite that firms up as it is built, dashed outline |

**Recycler gun decision:** the sheet's Recycler has no turret. The Recycler
**keeps its defence gun** (210 range, 24 damage) and fires it from the centre
drum without a visible barrel, so bases are no easier to rush. To remove the
gun instead, delete the `weapon` line from the Recycler in `config.js`.

### Sizes on the map (at normal zoom)

A tile is 32 × 32 pixels. The camera zooms from 0.45× to 1.8×, and phones
start zoomed out (about 0.55×).

| Building | Tiles | Pixels |
| --- | --- | --- |
| Recycler, Factory, Repair Pad | 3 × 3 | 96 × 96 |
| Extractor, Base Silo, Extractor Silo, Gun Tower, Research Lab, Radar | 2 × 2 | 64 × 64 |

| Vehicle | Body diameter | Notes |
| --- | --- | --- |
| Recycler (mobile) | 44 px | |
| Tank / Tank Mk II | 30 px | Barrel reaches about 22 px from the centre |
| Artillery / Artillery Mk II | 30 px | Long barrel reaches about 36 px from the centre |
| Transport | 28 px | |
| Scavenger / Scavenger II, Constructor / Constructor II | 26 px | |
| Scout / Scout Mk II | 22 px | |

### Guidance for sprite artists

To change a design, edit the shape data in `js/sprites.js`. If you ever switch
to image files instead:

- Draw at **4×** these sizes (for example about 128 px for a Tank, 384 px
  for a 3×3 building), so they stay crisp when zoomed in and on sharp phone
  screens.
- Top-down view, **facing right**. Angle 0 in the code means pointing right,
  and sprites are rotated from there.
- Separate **turret layers** for Tank, Artillery, Gun Tower and Recycler:
  their guns turn independently of the body.
- Leave **team-colour areas**, as a separate layer or in a neutral colour the
  game can tint.
- Transparent PNG backgrounds.
- Current visual markers to keep: gold chevrons for Mk II vehicles and
  upgraded buildings; the Transport's shield bubble; the Repair Pad's hazard
  stripes and green cross; the radar dish's rotation.

---

## 18. Derived numbers (for balancing)

**Damage per second (DPS)** is damage divided by the time between shots.
**Time to kill** is the target's HP divided by the attacker's DPS, ignoring
travel and aiming.

| Attacker | DPS vs units | DPS vs buildings | DPS per 100 scrap | HP per 100 scrap |
| --- | --- | --- | --- | --- |
| Scout | 22.9 | 11.4 | 45.7 | 280 |
| Scout Mk II | 28.6 | 14.3 | 38.1 | 261 |
| Tank | 28.3 | 28.3 | 28.3 | 400 |
| Tank Mk II | 36.7 | 36.7 | 24.4 | 373 |
| Artillery | 17.1 (more with splash) | 27.4 | 12.2 | 143 |
| Artillery Mk II | 22.3 (more with splash) | 35.7 | 10.6 | 133 |
| Recycler gun | 30.0 | 30.0 | — | — |
| Gun Tower | 24.4 | 24.4 | 22.2 | 909 |

Mk II vehicles are stronger per unit but slightly less efficient per scrap.
Their value is in fewer, tougher, faster units (useful under the 50-unit
cap) rather than raw cost efficiency.

**One-on-one:** a Tank Mk II kills a Tank in about 11 s; a Tank needs about
20 s to kill a Tank Mk II.

**Killing a Recycler:** 4,000 HP (Recycler) or 5,000 HP (Recycler II).
- 5 Tanks: about 28 s / 35 s.
- 5 Tank Mk IIs: about 22 s / 27 s.
- 5 Artillery: about 29 s / 36 s.
- 10 Scouts: about 35 s / 44 s.

**Repair:** a Repair Pad restores a Tank Mk II from 100 to full (560) in
about 15 s. A Constructor II repairs a Base Silo from 500 to 1,100 in 24 s.

**Travel:** the two starting positions are about 2,900 pixels apart.

| Unit | Time to cross from base to base |
| --- | --- |
| Scout Mk II | about 25 s |
| Scout | about 30 s |
| Tank Mk II | about 60 s |
| Scavenger / Constructor (either tier) | about 67 s |
| Tank | about 73 s |
| Transport | about 74 s |
| Artillery Mk II | about 76 s |
| Artillery | about 91 s |
| Mobile Recycler | about 97 s |

**Economy:**

- An Extractor (60 a minute) pays for an Extractor Silo (500) in about 8
  minutes. It makes storage room and removes the need for a Transport.
- A Base Silo (250 for +300 storage) is the cheapest way to raise the cap.
- The full tech path costs 250 (Recycler II) + 200 (Lab) + 200 (research) +
  200 (Factory II) = 850 scrap before the first Tank Mk II, plus its 150.
- The Recycler's trickle of 3 a minute is symbolic: 180 scrap per hour.
- Salvage: a destroyed Tank leaves 30; a demolished Factory leaves 75.

---

## 19. How the code is organised

Plain HTML and JavaScript with no build step: open `index.html` to play.

| File | Contents |
| --- | --- |
| `index.html` | Page layout, styles (including phone layouts), title, help and end screens |
| `js/config.js` | **All balance numbers:** units, buildings, upgrades, research, difficulty |
| `js/map.js` | Random mirrored map generation, geysers, scrap fields; route-finding (A*) |
| `js/sim.js` | The rules: commands, movement, combat, economy, storage, deploying, upgrades, research, radar, repair pads, demolishing, vision, victory |
| `js/ai.js` | The computer opponent |
| `js/sprites.js` | The unit design sheet: vector drawings of every vehicle and building, their animations, damage smoke, explosions, wrecks and craters |
| `js/render.js` | Drawing the map, fog, minimap, bars and effects; calls `sprites.js` for units and buildings |
| `js/main.js` | Mouse, touch and keyboard input; panels and buttons; minimap toggle; sound; the game loop |

Other documents in the folder: `README.md` (how to play, controls, unit
tables), `ROADMAP.md` (planned stages), and this file.

### Design principles already built in

- **Every action is a command.** The player and the AI change the game
  only through `issueCommand(game, team, command)`. This is what makes
  online multiplayer possible later: players would exchange commands
  rather than the whole game state. Commands include move, attack, harvest,
  deploy, build, repair, produce, cancel, rally, demolish, upgrade, research,
  scout, patrol, guard, haul and gorepair.
- **Deterministic simulation.** All randomness in the rules uses a seeded
  generator (`makeRng`), including the per-tick shuffle of update order. The
  same seed and the same commands give the same game.
- **Fixed-rate simulation.** Rules run at exactly 30 ticks per second,
  independent of screen frame rate.
- **Mirror fairness.** Route-finding and group formation always compute
  from one half of the map and mirror the result, so mirrored situations
  get mirrored outcomes.
- **Unit families.** Upgraded units name their basic kind
  (`base: 'tank'`), so orders, menus and the AI treat a Tank Mk II as a
  tank. Adding a Mk III later would follow the same pattern.

---

## 20. What has been tested, and how

Automated tests were run throughout development. The testing scripts were
temporary (they are not in the repository); the methods are listed so they
can be rebuilt.

| Test type | Method | What it checks |
| --- | --- | --- |
| **Rules tests** | Run the simulation without graphics (Node.js), set up a situation, and check the result. | Deploying; income rates; storage caps; silo placement; shields; demolish values; waypoints; tower fire rate; Recycler and Factory upgrades; research; Mk II stats; which workers can deploy and repair; radar reveal; Repair Pad healing and walkability. |
| **AI-vs-AI batches** | Run 30 to 120 full games between two computer players on different seeds. | Games end, typical length, and **fairness** by team and by corner. |
| **AI tech progression** | Log when the AI reaches each milestone at each difficulty. | The AI actually upgrades, researches and fields Mk II units. |
| **"Do nothing" survival** | The player deploys and then does nothing, at each difficulty. | Difficulty pacing: when the first attack lands and how long a passive player lasts. |
| **Mirrored duels** | Identical groups placed in mirror-image positions fight 100 to 300 times. | Whether combat or movement favours one side or location. |
| **Mirror determinism trace** | Same as a duel with randomness removed, comparing both sides every tick. | Finds the exact moment and cause of any asymmetry. |
| **Economy comparison** | Average each side's scrap, units and build times minute by minute over 20+ games. | Which phase of the game an imbalance comes from. |
| **Browser tests** | Automated Chromium, desktop and simulated iPhone (portrait and landscape), with real taps, drags and pinches. | Every button and gesture works, no script errors, and layout doesn't hide important things. Includes upgrade and research buttons, Go repair, the Army menu and the minimap toggle. |
| **Performance** | Measure simulation time per game-second in a long AI-vs-AI game. | About 35 ms of work per second of play in big battles on a desktop. |

### Bugs these tests have caught (for reference)

- **Combat:** gun towers never reloaded; building guns were outranged by
  tanks.
- **Economy:** the starting Scavengers idled.
- **Movement:** group moves to one point made units jostle forever (the
  Hard AI stalled).
- **AI:** it never finished research, because it spent everything on its
  army.
- **Phone layout:** the start geyser was hidden behind buttons, and a long
  build list pushed the quick buttons over the map in portrait.
- **Buttons:** the build queue's cancel buttons broke at the unit limit.
- **Side bias**, from several sources: update order, route tie-breaking,
  formation tie-breaking, a non-mirrored map clearing, and decision timing.

---

## 21. Known problems and open questions

### Problems

1. **Corner advantage (unsolved).** Before the tech tree, whoever started in
   the **top-right corner won about 75%** of AI-vs-AI games (36 to 11 over
   60 games). The map, the bases and the route-finding are verified mirror
   images, so the cause is unknown. The workaround is random corners each
   game, which makes the teams even on average. In a small batch after the
   tech tree was added (30 games), the corners came out even (9 to 9), so
   the effect may have shrunk, but this needs a larger test.
2. **Stalemates.** Since the tech tree was added, about **2 in 5** AI-vs-AI
   games reach 30 minutes without a winner (before, about 1 in 5), because
   bases can now repair and upgrade and units are slow. It is unknown
   whether human games feel too long.
3. **Slower start.** No geyser can be claimed until the Recycler is upgraded
   (250 scrap, 40 s, with a storage cap of 300), so the early game relies on
   loose scrap for several minutes.
4. **Economic death spiral.** If a side loses all its Scavengers and has no
   Extractors, its only income is the Recycler's 3 a minute (1.5 on Easy for
   the AI). It may never recover. Seen in an Easy AI-vs-AI game.
5. **Never tested on a real phone.** Touch controls have only been tested
   in a simulated iPhone.
6. **The AI doesn't use** Scout, Patrol, Defend, Go repair or the Repair Pad,
   and never demolishes. On Easy it skips research and the Radar entirely.
7. **The AI rarely builds Extractor Silos** (they cost 500 and need a Base
   Silo first).
8. **Balance is untested with human play.** All numbers come from design
   intent and AI-vs-AI results, not from people playing.
9. **Sprites not yet checked on a real phone.** They draw in about 5 ms a
   frame with 30+ units on a desktop; a busy late game on an older phone may
   be slower. `UnitSprites.bake()` can cache hulls if needed.

### Open design questions

- Should terrain affect speed or sight (hills, forests, roads)?
- Is the Recycler's 3-a-minute trickle meaningful, or only flavour?
- Should Extractor Silos really cost 500 when base storage is only 300?
- Should the enemy be denied knowledge of where your Recycler is?
- How long should a typical game be?
- What do Transports do once every Extractor has a silo?
- **Tech tree:**
  - Should Factory II require a Research Lab to exist?
  - Should research be lost if the lab is destroyed?
  - Should there be more tiers (Mk III, Recycler III)?
- Mk II units are less cost-efficient than basic ones. Is that the intended
  trade-off (quality over quantity under the unit cap)?
- Should the Radar ping also show on the minimap, or warn the enemy when
  they're pinged?
- Should vehicles go to the Repair Pad automatically when badly damaged?
- Should the basic Constructor be able to repair at a slower rate, rather
  than not at all?
- Should the deployed Recycler keep its (now invisible) defence gun, or lose
  it to match the art? Currently kept.

---

## 22. Design decisions already made

These were decided by the game's designer during development; change them
only on purpose.

1. **No capture-the-flag or tickets.** They were built and then removed.
   The only win condition is destroying the enemy Recycler.
2. **Must be playable on a phone.**
3. **Easy must be genuinely easy** for a new player.
4. **Battlezone 2-style economy:** loose scrap for Scavengers; geysers with
   Extractors; a Recycler that deploys onto a geyser and pumps it at a
   twentieth of an Extractor's rate.
5. **Storage is limited,** expanded by Base Silos (next to the Recycler) and
   Extractor Silos (joined onto Extractors, double the cost of a Base Silo,
   125 storage).
6. **Speeds:** Transports and Tanks halved, Scouts −25%, Scavengers 10%
   faster than Transports, Constructors equal to Scavengers, Artillery the
   slowest.
7. **Unit roles:** Scouts scout (solo or as a pack), Tanks patrol,
   Artillery defends buildings, Transports are unarmed but shielded.
8. **Buildings can be demolished** for 50% of their cost, left as scrap on
   the ground.
9. **Waypoints** on the Recycler and Factory, which can be set and cleared.
10. **Tech tree:**
    - Basic Scavengers cannot deploy; basic Constructors cannot repair. Both
      abilities need the upgraded Recycler.
    - Mk II vehicles need both research at a Research Lab and a Factory II.
11. **Radar** pings periodically (every 30 s) rather than giving constant
    vision, over about 2.5 times normal sight.
12. **Repair Pad** is a wide pad that vehicles drive onto, with a visible
    repair animation.
13. **The minimap can be collapsed.**
14. **Starting corners are random** (a fairness workaround, not a design
    goal; revisit once the corner advantage is understood).

---

## 23. A framework for systematic improvement

A suggested way to organise the next stage of work. It is a starting point
to refine, not a finished plan.

### How to run each phase

1. **State the goal** in one sentence, and the measurable signs of success
   (for example, "corner win rate between 45% and 55% over 100 games").
2. **Change one system at a time,** so any effect can be traced to its
   cause.
3. **Test with the right tool** from section 20: rules tests for mechanics,
   AI batches for balance and fairness, browser tests for controls and
   layout, and **human playtests** for feel.
4. **Record results** (numbers, not impressions) before and after.
5. **Keep or roll back.** Every change is a separate saved version
   (a git commit), so undoing is easy.

### Candidate phases (in suggested order)

| Phase | Goal | Main test |
| --- | --- | --- |
| 1. Real-device check | Confirm touch controls, layout and speed on the designer's actual phone. | Human playtest checklist: deploy, upgrade, research, build, select, order, every button. |
| 2. Fairness | Confirm whether the corner advantage still exists after the tech tree; find and remove it. | AI-vs-AI by corner: 45 to 55% over 100+ games. Mirror traces for the cause. |
| 3. Pacing and game length | Decide target game length; reduce stalemates; tune the slow start (Recycler II cost and time, storage cap). | Game length distribution; share over 30 minutes; time to first Extractor. |
| 4. Core balance | Every unit has a clear job; no single unit type dominates; Mk II worth its price. | Unit-versus-unit duel tables (equal scrap spent); AI-vs-AI with forced army compositions. |
| 5. Tech tree tuning | Upgrade and research costs and times feel right; the tech path is a real choice versus more basic units. | Timing curves; basic-army vs tech-army AI matchups. |
| 6. Difficulty curve | Easy beatable by a first-time player; Hard challenging. | "Do nothing" survival, scripted "simple player" bots, human playtests. |
| 7. AI competence | The AI uses Scout, Patrol, Defend, the Repair Pad and Extractor Silos; recovers from losing its Scavengers. | AI-vs-AI game length; milestone logs. |
| 8. Art | Done: sprites from the unit design sheet (section 17). Remaining: check on real phones; sound. | Visual review on desktop and phone; performance check. |
| 9. Content | New units, buildings or terrain effects (roadmap Stage 2). | Each addition gets its own rules test and balance check. |
| 10. Campaign / 4X layer | Sector map between battles (roadmap Stage 3). | Design first, then playtests. |
| 11. Online multiplayer | Lockstep command syncing (roadmap Stage 4). | Two browsers, determinism checks, disconnect handling. |

### Useful measurements to track across phases

- Win rate by team and by corner (AI-vs-AI).
- Game length: median, and the share of games over 30 minutes.
- Time of first Factory, first Extractor, Recycler II, first research, first
  Mk II, first attack.
- Scrap gathered per minute by source.
- Units built and lost by type.
- "Do nothing" survival time per difficulty.
- Simulation cost per game-second (performance).
- For human tests: win or loss, game length, what was confusing, what felt
  unfair or boring.

---

## 24. Change log

How the game reached its current state, in order. Each step is a separate
saved version on the `claude/topdown-2d-rts-game-5pqhc1` branch.

1. **First playable version.** Flags and tickets, a scrap economy, a
   Factory, three combat units, an AI opponent, desktop controls.
2. **Fairness fix.** Update order alternated so neither side always acted
   first.
3. **Phone support.** Touch controls, the phone layout and quick buttons.
4. **Flags and tickets removed.** Destroying the Recycler became the only
   win condition; Easy made much gentler; Scrap Silos for territory.
5. **Unit orders and geysers.** Scout, Patrol and Defend orders, the Army
   menu, scrap geysers and Extractors (replacing Scrap Silos). Gun towers
   fixed.
6. **Storage.** A scrap cap, Base Silos, Outpost Silos and shielded
   Transports. Route-finding and formations made mirror-fair.
7. **Mobile Recycler.** Deploys onto a geyser; Demolish; waypoints; Outpost
   Silos became Extractor Silos (joined onto Extractors, direct to storage);
   units slowed.
8. **Random starting corners,** to neutralise a corner advantage.
9. **First version of this document.**
10. **Tech tree.** Recycler II and Factory II upgrades, Research Lab, Mk II
    vehicles, Scavenger II and Constructor II, Radar, Repair Pad; the AI
    uses the tech tree; phone buttons kept to one scrolling row.
11. **Collapsible minimap.**
12. **This document brought fully up to date** (28 September 2026).
13. **Unit design sheet.** All vehicles and buildings drawn from
    `js/sprites.js`: turning turrets with recoil, spinning radar and pump,
    shield bubble, damage smoke, explosions, wrecks and craters. Artillery
    must now park and lower stabiliser legs (0.6 s) before firing and raise
    them (0.6 s) before driving, a small nerf. The Recycler keeps its gun
    without a visible barrel.
14. **Phone layout tidy-up.** Quick buttons moved into the top bar; Help
    moved onto the pause screen; the selection panel shrank to a short
    summary with action buttons wrapping into rows instead of scrolling.
15. **Constructor sprite fix and darker treads.** Constructors were drawn as
    only a shadow (their name clashed with a built-in JavaScript word in the
    sprite lookup). Tank, Artillery and mobile Recycler treads are now
    near-black with lighter cleats for contrast. A pixel test now checks
    every vehicle and building draws for both teams, upgraded and wrecked.
