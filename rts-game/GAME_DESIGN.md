# Scrapline Command: Game Design Reference

A complete description of the game as it exists today: how it plays, every
rule, every number, how the computer opponent thinks, what has been tested,
and what is known to be wrong. It is written so that someone (or an AI
assistant) who has never seen the code can reason about the game and plan
improvements.

All values below are copied from the code as of this document. The balance
numbers live in `js/config.js`; a few rules are fixed inside the other files
and are listed with their file so they can be found.

---

## Contents

1. [The game in one page](#1-the-game-in-one-page)
2. [Win and loss](#2-win-and-loss)
3. [The battlefield](#3-the-battlefield)
4. [Starting position](#4-starting-position)
5. [Economy: scrap, storage and income](#5-economy-scrap-storage-and-income)
6. [Units](#6-units)
7. [Buildings](#7-buildings)
8. [Combat rules](#8-combat-rules)
9. [Unit orders and behaviour](#9-unit-orders-and-behaviour)
10. [Building rules: territory and placement](#10-building-rules-territory-and-placement)
11. [Vision and fog of war](#11-vision-and-fog-of-war)
12. [The computer opponent](#12-the-computer-opponent)
13. [Difficulty levels](#13-difficulty-levels)
14. [Controls](#14-controls)
15. [Screen layout](#15-screen-layout)
16. [Derived numbers (for balancing)](#16-derived-numbers-for-balancing)
17. [How the code is organised](#17-how-the-code-is-organised)
18. [What has been tested, and how](#18-what-has-been-tested-and-how)
19. [Known problems and open questions](#19-known-problems-and-open-questions)
20. [Design history: decisions already made](#20-design-history-decisions-already-made)
21. [A framework for systematic improvement](#21-a-framework-for-systematic-improvement)
22. [Tech tree: upgrades, research, radar, repair](#22-tech-tree-upgrades-research-radar-repair)

---

## 1. The game in one page

**Genre:** real-time strategy, viewed from directly above, in a web browser.
Plays on desktop (mouse and keyboard) and on phones and tablets (touch).

**Inspirations:** Battlezone 2 (scrap economy, Recycler, Scavengers deploying
onto geysers, Constructors), Battlefield 2 (a battlefield of vehicles with
distinct roles), and 4X / RTS games (gather, build, expand, conquer).

**The loop:**

1. Drive your mobile Recycler onto a scrap geyser and deploy it. It becomes
   your headquarters.
2. Scavengers collect loose scrap from the ground and bring it home.
3. Spend scrap on a Factory, then on combat vehicles and Gun Towers.
4. Expand: turn Scavengers into Extractors on distant geysers for steady
   income. Build silos to store more scrap.
5. Defend against the enemy's attack waves.
6. Build an army and destroy the enemy Recycler.

**Players:** one human (Blue Command) against one computer opponent (Red
Legion). A spectator mode lets two computer players fight.

**Match length:** roughly 8 to 30 minutes, depending on difficulty and play.

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
so replays match). See [Known problems](#19-known-problems-and-open-questions)
for why.

---

## 4. Starting position

Each side begins with:

| Asset | Amount |
| --- | --- |
| Scrap | 300 (storage is full) |
| Storage capacity | 300 (held by the mobile Recycler) |
| Recycler (mobile) | 1, not deployed |
| Scavengers | 2 (start collecting scrap automatically) |
| Constructor | 1 |
| Scouts | 2 |
| Tank | 1 |
| Buildings | None |

A geyser sits about 66 pixels from the starting Recycler.

---

## 5. Economy: scrap, storage and income

Scrap is the only resource. It pays for every unit and building.

### Storage (the cap)

You can only hold as much scrap as your storage allows. Income that would go
over the cap is not lost; it waits:

- Scavengers and Transports wait at the base with their load, retrying once
  a second.
- Extractors hold up to 30 in their own tank, then stop pumping.
- The Recycler's own trickle is simply not added.

| Source of storage | Adds |
| --- | --- |
| Recycler (mobile, deploying, or deployed) | 300 |
| Base Silo | 300 |
| Extractor Silo | 125 |

If a silo is destroyed and storage drops below what you hold, the excess is
lost. The top bar shows `held / capacity` and turns yellow when full. A
"storage full" warning appears at most every 20 seconds.

### Ways to earn scrap

| Source | Rate | Delivered how | Runs out? |
| --- | --- | --- | --- |
| Scavenger collecting loose scrap | Gathers 4 per second, carries 25 per trip. Real income depends on distance: roughly 40 to 70 a minute per Scavenger near home. | Drives it to the Recycler, a Base Silo or an Extractor Silo | Yes. Each pile holds 400, and fields empty over time. |
| Extractor on a geyser | 1.0 per second (60 a minute) | With an Extractor Silo touching it, straight into storage. Without one, into its own 30-scrap tank, which Transports empty. | No |
| Deployed Recycler | 0.05 per second (3 a minute), a twentieth of an Extractor | Straight into storage | No |
| Salvage from destroyed vehicles | 30% of the vehicle's cost, left as a pile on the ground | Collected by Scavengers | Yes |
| Demolishing your own building | 50% of its cost, left as piles of at most 40 on the ground | Collected by Scavengers | Yes |
| Cancelling a unit in a build queue | 100% of its cost, straight to storage (if there is room) | Immediate | n/a |

The computer opponent's income is multiplied by its difficulty's
`incomeMult` (see [Difficulty levels](#13-difficulty-levels)). The human
player always has ×1.

### Spending

Costs are paid in full when a unit is queued or a building is placed. You
can queue at most 5 units per building. Units and buildings under
construction can be cancelled or demolished.

### The flow in words

```
loose scrap ──Scavenger──▶ Recycler / Base Silo / Extractor Silo ──▶ STORAGE
geyser ──Extractor──▶ (Extractor Silo touching it?) ──yes──▶ STORAGE
                                                    └─no──▶ tank (30) ──Transport──▶ STORAGE
Recycler's own geyser ──(3/min)──▶ STORAGE
```

---

## 6. Units

### Full stats

Speed is in pixels per second (a tile is 32 pixels). Sight and range are in
pixels. "Radius" is the unit's collision size.

| Unit | Role | Cost | Build time | HP | Speed | Sight | Radius | Built at |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Recycler (mobile) | Headquarters | — | — | 2,500 | 30 | 300 | 22 | Starts on map |
| Scavenger | Harvester | 60 | 6 s | 180 | 43 | 200 | 13 | Recycler |
| Constructor | Builder | 80 | 8 s | 160 | 43 | 220 | 13 | Recycler |
| Transport | Hauler | 70 | 7 s | 120 + 150 shield | 39 | 200 | 14 | Recycler |
| Scout | Combat | 50 | 5 s | 140 | 98 | 330 | 11 | Factory |
| Tank | Combat | 100 | 9 s | 400 | 40 | 260 | 15 | Factory |
| Artillery | Combat | 140 | 12 s | 200 | 32 | 220 | 15 | Factory |

**Speed chain (a stated design rule):** Transport 39 → Scavenger 43 (+10%)
= Constructor 43. Tank 40, Artillery 32 (kept the slowest), Scout 98. The
mobile Recycler moves at 30.

### Weapons

| Unit | Range | Min range | Damage per shot | Seconds between shots | Projectile | Splash | vs buildings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Scout | 170 | — | 8 | 0.35 | Bullet (900 px/s, homing) | — | ×0.5 |
| Tank | 200 | — | 34 | 1.2 | Shell (620 px/s, homing) | — | ×1.0 |
| Artillery | 440 | 110 | 60 | 3.5 | Arcing shell (260 px/s, aimed at a spot) | 55 px radius | ×1.6 |
| Recycler (deployed) | 210 | — | 24 | 0.8 | Bullet | — | ×1.0 |
| Gun Tower | 250 | — | 22 | 0.9 | Shell | — | ×1.0 |

Scavengers, Constructors, Transports and the mobile Recycler are unarmed.

### Special abilities

| Unit | Ability |
| --- | --- |
| Recycler (mobile) | **Deploy base:** drives onto a free geyser and becomes the Recycler building (10 s to set up). Holds 300 storage while mobile. |
| Scavenger | Collects loose scrap automatically. Carries 25. Only the **Scavenger II** can deploy on a geyser (see section 22). |
| Constructor | Builds buildings. Only the **Constructor II** can repair (25 HP per second; see section 22). |
| Transport | **Auto-haul:** empties the fullest Extractor tank (at least 15 stored), preferring ones no other Transport is heading to. Loads 40 per second, carries 60. **Shield:** absorbs the first 150 damage; recharges at 20 per second after 3 seconds without being hit. |
| Scout | **Scout** (alone) or **Scout as pack** / **Scout solo** (groups). |
| Tank | **Patrol:** loops around all your buildings. |
| Artillery | **Defend:** holds a post beside one of your buildings. |

---

## 7. Buildings

| Building | Cost | Build time | HP | Size (tiles) | Sight | Storage | Territory radius (tiles) | Built by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Recycler | — | 10 s (deploy) | 4,000 | 3×3 | 300 | 300 | 14 | Deploying the mobile Recycler on a geyser |
| Factory | 150 | 18 s | 1,400 | 3×3 | 220 | — | 10 | Constructor |
| Extractor | — | 8 s (deploy) | 900 | 2×2 | 240 | tank of 30 | 9 | Deploying a Scavenger on a geyser |
| Base Silo | 250 | 14 s | 1,100 | 2×2 | 200 | 300 | 8 | Constructor |
| Extractor Silo | 500 | 12 s | 800 | 2×2 | 200 | 125 | 5 | Constructor |
| Gun Tower | 110 | 14 s | 1,000 | 2×2 | 300 | — | — | Constructor |

### What each building does

| Building | Produces | Other functions |
| --- | --- | --- |
| Recycler | Scavenger, Constructor, Transport | Headquarters. Defence gun. Drop-off point. Pumps its own geyser at 3 a minute. Cannot be demolished. |
| Factory | Scout, Tank, Artillery | — |
| Extractor | — | Pumps 60 a minute from its geyser. Salvage value counts as 60 (the Scavenger it came from). |
| Base Silo | — | Adds 300 storage. Drop-off point. Must be within 7 tiles of your Recycler's edge. |
| Extractor Silo | — | Adds 125 storage. Drop-off point. Must touch one of your Extractors (at most one empty square between them). Makes that Extractor send its scrap straight to storage. |
| Gun Tower | — | Defensive gun (see Weapons). |

### Building lifecycle

- **Placing:** the full cost is paid immediately and the building appears
  as a construction site at 10% HP.
- **Construction:** a Constructor must stand next to it. Progress runs from
  0 to 100% over the build time, and HP rises with it.
- **Deploying** (Recycler, Extractor): no Constructor needed; it sets
  itself up.
- **Repair:** a Constructor restores 25 HP per second.
- **Waypoint** (Recycler, Factory): every new vehicle drives straight to
  it. Without one, combat units wait beside the building, Scavengers start
  harvesting and Transports start hauling.
- **Demolish:** asks for confirmation, then removes the building and leaves
  half its cost on the ground as scrap piles. Frees a geyser if it was an
  Extractor.
- **Destroyed:** removed with an explosion; frees its geyser; no salvage.

---

## 8. Combat rules

### Targeting

- Units look for targets every 0.4 to 0.6 seconds (randomised).
- They only target enemies their side can currently **see** (fog of war).
- Scoring (lower is preferred): distance, plus 40 for an armed building,
  plus 200 for an unarmed building, plus 120 for an unarmed unit, minus 150
  for whoever last shot this unit. In short, units prefer nearby armed
  enemies and retaliate against their attacker.
- A unit switches to a new target only if it is at least 60 pixels closer
  than the current one.
- Artillery cannot fire at anything closer than 110 pixels.

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

- Vehicles leave a wreck (cosmetic, fades after 20 seconds) and a salvage
  pile worth 30% of their cost.
- Buildings leave nothing.

---

## 9. Unit orders and behaviour

### Orders available to the player

| Order | Who | What it does |
| --- | --- | --- |
| Move | Any vehicle | Drives to the point. Groups spread into a grid about 34 pixels apart. |
| Attack-move | Armed vehicles | Moves, but stops to fight anything seen on the way. |
| Attack | Armed vehicles | Chases and fires at one target until it dies or is lost from sight. |
| Stop | Any vehicle | Stops and stands guard. Transports also stop auto-hauling. |
| Gather | Scavengers | Collects a chosen scrap pile, then carries on automatically. |
| Deploy | Scavenger or mobile Recycler | Drives onto a geyser and becomes an Extractor or the Recycler. |
| Build / Repair | Constructor | Places or finishes a building, or repairs one. |
| Scout | Scouts | Explores: unexplored ground first, then areas under fog. Fires at enemies passed without stopping. Picks a new destination on arrival or after 45 seconds. |
| Scout as pack | 2+ Scouts | As Scout, but the group travels together in a loose ring of about 34 pixels and picks a new destination when any of them arrives (or after 40 seconds). |
| Patrol | Tanks | Loops around the outside of all your finished buildings, fighting anything met. |
| Defend | Artillery | Takes a post beside the chosen building and fires at anything in range. Never chases. Returns to its post after moving. |
| Auto-haul | Transports | Empties Extractor tanks (see Units). Can be pinned to one Extractor. |

### Automatic behaviour

- **Idle armed units** attack anything in sight, but give up the chase once
  the target is more than their weapon range + 220 pixels from where they
  were told to stand, and then return there.
- **Idle Scavengers** look for scrap within 450 pixels once a second and go
  back to work. When a pile runs out, they look within 900 pixels.
- **Idle Transports** resume hauling unless told to Stop.
- **Arrival:** a vehicle counts as arrived when it reaches its destination,
  or when it is within 120 pixels and has not got any closer for 2 seconds
  (this stops crowds jostling forever).
- **Getting unstuck:** a vehicle that barely moves for 1.2 seconds
  re-plans its route; after 3.5 seconds it gives up.
- **Route-finding:** A* search over the tile grid, with diagonal moves
  that never cut rock corners, smoothed into straight legs.

---

## 10. Building rules: territory and placement

A Constructor can place a building only if **all** of these hold:

1. Every tile of the footprint is inside the map, explored by your side, and
   free of rock, water and other buildings.
2. The footprint is at least one tile away from any scrap geyser (geysers
   are kept free for Extractors).
3. No enemy vehicle is within one building-width of the spot.
4. The spot is inside your **territory**: within the territory radius of one
   of your finished buildings (Recycler 14, Factory 10, Extractor 9, Base
   Silo 8, Extractor Silo 5 tiles).
5. Special rules:
   - Base Silos must be within 7 tiles of your Recycler's edge.
   - Extractor Silos must touch one of your Extractors.
6. You can afford it.

Before the Recycler is deployed you have no territory and cannot build.

While placing, the screen shows your territory as green circles, or silo
zones in gold, plus a green or red outline for the building. Towers also
show their firing range.

---

## 11. Vision and fog of war

- Every unit and building sees a circle of its sight radius. Vision is
  recalculated every 3 ticks (10 times per second).
- **Unexplored** ground is nearly black. **Explored but not currently seen**
  ground is dimmed.
- Enemy vehicles are only drawn while visible. Enemy buildings stay drawn,
  faded, where they were last seen.
- The enemy base's health shows `?` in the top bar until your side has
  seen it.
- Artillery can only hit what your side can see, so it relies on spotters.

---

## 12. The computer opponent

The computer plays by exactly the same rules and uses the same commands as
the player. Its only advantage is its difficulty's income multiplier. It
knows where your Recycler is at all times (deployed or not) but must see
other buildings before targeting them.

It makes decisions at intervals (`thinkEvery`, with ±15% random jitter). On
each decision it runs through these steps in order:

1. **Deploy:** if its Recycler is still a vehicle, deploy it on the nearest
   free geyser. Nothing else happens until it is deployed.
2. **Recycler production** (only when the Recycler's queue is empty), first
   match wins:
   - a Constructor, if it has none;
   - a Transport, if it has fewer Transports than Extractors without an
     Extractor Silo;
   - a Scavenger, if it has fewer than `min(maxScavengers, 3 + minutes ÷ 2.5)`.
3. **Expansion:** if not already deploying, below `maxExtractors`, past 90
   seconds (360 on Easy) and at least 30 seconds since its last attempt, it
   sends its nearest Scavenger to the nearest free geyser on its own half.
   It needs at least 3 Scavengers to do this.
4. **Construction** (with an idle Constructor), first match wins:
   1. finish any unfinished building;
   2. repair any building below 60% HP;
   3. a Factory, if it has none;
   4. a first Gun Tower after 90 seconds (300 on Easy);
   5. a Base Silo, if under `maxBaseSilos`, storage at least 70% full, and
      past 150 seconds;
   6. an Extractor Silo on an Extractor lacking one, once its storage can
      hold 500 and it has 500;
   7. a second Factory after 300 seconds (not on Easy);
   8. more Gun Towers, up to 1 plus the number of Extractors, after 200
      seconds, placed at Extractors that have none nearby.

   While saving for a Base Silo, it pauses army production.
5. **Army production** (each Factory with fewer than 2 queued): stops at the
   army cap. On Easy and Normal the cap also grows over time:
   `3 + minutes × armyPerMinute`, up to `maxArmy`. It picks:
   - a Scout if it has fewer than 2, or scouts are under a quarter of the
     army;
   - Artillery if artillery is under a quarter of its tanks and time is past
     `artilleryAfter`;
   - otherwise a Tank.

   It keeps 60 scrap in reserve while its Constructor is busy, and sets the
   Factory waypoint to its rally point, 220 pixels from its Recycler toward
   the map centre.
6. **Defence:** if an enemy combat vehicle it can see is within 380 pixels
   of any of its buildings, every combat unit within 1,400 pixels of its
   Recycler attack-moves there. Nothing else happens that turn.
7. **Attack:**
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
found.

---

## 13. Difficulty levels

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

**Measured "do nothing" survival** (the player deploys the Recycler and then
does nothing; one test map):

| Easy | Normal | Hard |
| --- | --- | --- |
| about 16 min | about 8 min | about 7 min |

If the player never deploys at all, the enemy kills the unarmed mobile
Recycler at its first attack.

---

## 14. Controls

### Touch (phones and tablets)

| Action | How |
| --- | --- |
| Select a vehicle | Tap it. Tap the same kind twice quickly to select all of that kind on screen. |
| Order selected vehicles | Tap the ground (move), an enemy (attack), scrap (gather), a geyser (deploy), a damaged building (repair, with a Constructor), your building (defend, with Artillery), or an Extractor (haul, with Transports). |
| Box select | Press and hold on the map, then drag. |
| Scroll / zoom | One-finger drag / pinch. |
| Build | Select the Constructor, pick a building, tap where it goes, then press **Build here**. |
| Quick buttons | **Army ▾** (menu: All combat / Scouts / Tanks / Artillery), **Base**, **Idle worker**, **Deselect**. |

### Mouse and keyboard

| Action | How |
| --- | --- |
| Select | Left-click or drag a box. Double-click selects all of a type. Shift adds. |
| Order | Right-click (the same meanings as tapping, above). |
| Command buttons | `Q` `W` `E` `R` `T` |
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

## 15. Screen layout

- **Top bar:** scrap held / capacity, workers, units / 50, your base's
  health %, the enemy base's health % (or `?`), clock, speed, pause, help.
- **Bottom panel:** the selected unit or building's details, plus its
  command buttons.
- **Quick buttons:** Army ▾, Base, Idle worker, Deselect. They sit above the
  panel, or down the left edge on a phone held sideways.
- **Minimap:** bottom-right corner (top-right on phones). Shows fog, units,
  buildings, geysers and alerts. Tap it to move the camera.
- **Message log:** top-left. Shows the latest messages, or only the latest
  two on a sideways phone.
- **Screens:** title (difficulty choice, Watch AI vs AI), help, pause, end
  (Victory / Defeat with stats).

---

## 16. Derived numbers (for balancing)

**Damage per second (DPS)** is damage divided by the time between shots.
**Time to kill** is the target's HP divided by the attacker's DPS, ignoring
travel and aiming.

| Attacker | DPS vs units | DPS vs buildings | DPS per 100 scrap |
| --- | --- | --- | --- |
| Scout | 22.9 | 11.4 | 45.7 |
| Tank | 28.3 | 28.3 | 28.3 |
| Artillery | 17.1 (more with splash) | 27.4 | 12.2 |
| Recycler gun | 30.0 | 30.0 | — |
| Gun Tower | 24.4 | 24.4 | 22.2 |

| HP per 100 scrap | Scout 280 | Tank 400 | Artillery 143 | Gun Tower 909 |
| --- | --- | --- | --- | --- |

**One unit against one Tank (400 HP):** a Scout takes about 17.5 s, another
Tank about 14 s, the Recycler gun about 13 s, and a Gun Tower about 16 s.

**Killing a Recycler (4,000 HP):** 1 Tank takes 141 s; 5 Tanks take 28 s;
5 Artillery take 29 s; 10 Scouts take 35 s.

**Travel:** the two starting positions are about 2,900 pixels apart.

| Unit | Time to cross from base to base |
| --- | --- |
| Scout | about 30 s |
| Tank | about 73 s |
| Transport | about 74 s |
| Scavenger / Constructor | about 67 s |
| Artillery | about 91 s |
| Mobile Recycler | about 97 s |

**Economy:**

- An Extractor (60 a minute) pays for an Extractor Silo (500) in about 8
  minutes. It makes storage room and removes the need for a Transport.
- A Base Silo (250 for +300 storage) is the cheapest way to raise the cap.
- The Recycler's trickle of 3 a minute is symbolic: 180 scrap per hour.
- Salvage: a destroyed Tank leaves 30; a demolished Factory leaves 75.

---

## 17. How the code is organised

Plain HTML and JavaScript with no build step: open `index.html` to play.

| File | Contents |
| --- | --- |
| `index.html` | Page layout, styles (including phone layouts), title, help and end screens |
| `js/config.js` | **All balance numbers:** units, buildings, difficulty |
| `js/map.js` | Random mirrored map generation, geysers, scrap fields; route-finding (A*) |
| `js/sim.js` | The rules: commands, movement, combat, economy, storage, deploying, demolishing, vision, victory |
| `js/ai.js` | The computer opponent |
| `js/render.js` | Drawing the map, units, effects, fog and minimap (shapes only, no image files) |
| `js/main.js` | Mouse, touch and keyboard input; panels and buttons; sound; the game loop |

### Design principles already built in

- **Every action is a command.** The player and the AI change the game
  only through `issueCommand(game, team, command)`. This is what makes
  online multiplayer possible later: players would exchange commands
  rather than the whole game state.
- **Deterministic simulation.** All randomness in the rules uses a seeded
  generator (`makeRng`), including the per-tick shuffle of update order. The
  same seed and the same commands give the same game.
- **Fixed-rate simulation.** Rules run at exactly 30 ticks per second,
  independent of screen frame rate.
- **Mirror fairness.** Route-finding and group formation always compute
  from one half of the map and mirror the result, so mirrored situations
  get mirrored outcomes.

---

## 18. What has been tested, and how

Automated tests were run throughout development. The testing scripts were
temporary (they are not in the repository); the methods are listed so they
can be rebuilt.

| Test type | Method | What it checks |
| --- | --- | --- |
| **Rules tests** | Run the simulation without graphics (Node.js), set up a situation, and check the result. | Deploying, income rates, storage caps, silo placement rules, shields, demolish values, waypoints, tower fire rate. |
| **AI-vs-AI batches** | Run 40 to 120 full games between two computer players on different seeds. | Games end, typical length, and **fairness**: each side should win about half. |
| **"Do nothing" survival** | The player deploys and then does nothing, at each difficulty. | Difficulty pacing: when the first attack lands and how long a passive player lasts. |
| **Mirrored duels** | Identical groups placed in mirror-image positions fight 100 to 300 times. | Whether combat or movement favours one side or location. |
| **Mirror determinism trace** | Same as a duel with randomness removed, comparing both sides every tick. | Finds the exact moment and cause of any asymmetry. |
| **Economy comparison** | Average each side's scrap, units and build times minute by minute over 20+ games. | Which phase of the game an imbalance comes from. |
| **Browser tests** | Automated Chromium, desktop and simulated iPhone (portrait and landscape), with real taps, drags and pinches. | Every button and gesture works, no script errors, and layout doesn't hide important things. |
| **Performance** | Measure simulation time per game-second in a long AI-vs-AI game. | About 35 ms of work per second of play in big battles on a desktop. |

### Bugs these tests have caught (for reference)

Gun towers never reloaded. Building guns were outranged by tanks. Starting
Scavengers idled. Group moves to one point made units jostle forever (the
Hard AI stalled). A phone layout hid the start geyser. Build queue cancel
buttons broke at the unit limit. Several sources of side bias: update order,
route tie-breaking, formation tie-breaking, a non-mirrored map clearing,
and decision timing.

---

## 19. Known problems and open questions

### Problems

1. **Corner advantage (important, unsolved).** In AI-vs-AI games, whoever
   starts in the **top-right corner wins about 75%** (36 to 11 over 60
   games). The map, the bases and the route-finding are verified mirror
   images, so the cause is still unknown. The current workaround is
   random corners each game, which makes the two teams even on average
   (23 vs 24) but means one player gets a much harder game.
   **Top priority to find and fix.**
2. **Stalemates.** Since the tech tree was added, about 2 in 5 AI-vs-AI games reach 30 minutes without a winner (before it, about 1 in 5) reach 30 to 40 minutes
   without a winner, because well-defended bases are hard to crack with slow
   units. It is unknown whether human games feel too long.
3. **Never tested on a real phone.** Touch controls have only been tested
   in a simulated iPhone.
4. **The AI never uses Scout, Patrol, Defend or Go repair,** never builds a Repair Pad, and never demolishes.
5. **The AI rarely builds Extractor Silos** (they cost 500 and need a Base
   Silo first). In 10-minute test games, neither side built one.
6. **Balance is untested with human play.** All numbers come from design
   intent and AI-vs-AI results, not from people playing.

### Open design questions

- Should terrain affect speed or sight (hills, forests, roads)?
- Is the Recycler's 3-a-minute trickle meaningful, or only flavour?
- Should Extractor Silos really cost 500 when base storage is only 300?
- Should the enemy be denied knowledge of where your Recycler is?
- How long should a typical game be?
- What do Transports do once every Extractor has a silo?

---

## 20. Design history: decisions already made

These were decided by the game's designer during development; change them
only on purpose.

1. **No capture-the-flag or tickets.** They were built and then removed.
   The only win condition is destroying the enemy Recycler.
2. **Must be playable on a phone.**
3. **Easy must be genuinely easy** for a new player.
4. **Battlezone 2-style economy:** loose scrap for Scavengers; geysers with
   Extractors; a Recycler that deploys onto a geyser.
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

---

## 21. A framework for systematic improvement

A suggested way to organise the next stage of work. It is a starting point
to refine, not a finished plan.

### How to run each phase

1. **State the goal** in one sentence, and the measurable signs of success
   (for example, "corner win rate between 45% and 55% over 100 games").
2. **Change one system at a time,** so any effect can be traced to its
   cause.
3. **Test with the right tool** from section 18: rules tests for mechanics,
   AI batches for balance and fairness, browser tests for controls and
   layout, and **human playtests** for feel.
4. **Record results** (numbers, not impressions) before and after.
5. **Keep or roll back.** Every change is a separate saved version
   (a git commit), so undoing is easy.

### Candidate phases (in suggested order)

| Phase | Goal | Main test |
| --- | --- | --- |
| 1. Fairness | Find and remove the top-right corner advantage. | AI-vs-AI by corner: 45 to 55% over 100+ games. Mirror traces for the cause. |
| 2. Real-device check | Confirm touch controls, layout and speed on the designer's actual phone. | Human playtest checklist: deploy, build, select, order, every button. |
| 3. Core balance | Every unit has a clear job; no single unit type dominates. | Unit-versus-unit duel tables (equal scrap spent); AI-vs-AI with forced army compositions. |
| 4. Economy pacing | Decide target game length and income curve; tune storage, silo costs and extractor rate. | Economy comparison curves; time-to-first-Factory, first Extractor, first Silo. |
| 5. Difficulty curve | Easy beatable by a first-time player; Hard challenging. | "Do nothing" survival, scripted "simple player" bots, human playtests. |
| 6. AI competence | The AI uses Scout, Patrol, Defend and Extractor Silos; no stalemates. | AI-vs-AI game length distribution; share of games over 30 minutes. |
| 7. Content | New units, buildings or terrain effects (roadmap Stage 2). | Each addition gets its own rules test and balance check. |
| 8. Campaign / 4X layer | Sector map between battles (roadmap Stage 3). | Design first, then playtests. |
| 9. Online multiplayer | Lockstep command syncing (roadmap Stage 4). | Two browsers, determinism checks, disconnect handling. |

### Useful measurements to track across phases

- Win rate by team and by corner (AI-vs-AI).
- Game length: median, and the share of games over 30 minutes.
- Time of first Factory, first Extractor, first attack.
- Scrap gathered per minute by source.
- Units built and lost by type.
- "Do nothing" survival time per difficulty.
- Simulation cost per game-second (performance).
- For human tests: win or loss, game length, what was confusing, what felt
  unfair or boring.

---

## 22. Tech tree: upgrades, research, radar, repair

Added after the rest of this document; these rules override anything
earlier that conflicts.

### Worker tiers

| Unit | Cost | Build time | HP | Built by | Can deploy on geysers | Can repair buildings |
| --- | --- | --- | --- | --- | --- | --- |
| Scavenger | 60 | 6 s | 180 | Recycler | No | — |
| Scavenger II | 80 | 7 s | 180 | Recycler II | Yes | — |
| Constructor | 80 | 8 s | 160 | Recycler | — | No (can still build and finish construction) |
| Constructor II | 110 | 9 s | 200 | Recycler II | — | Yes, 25 HP/s |

Both starting Scavengers and the starting Constructor are the basic versions,
so no geyser can be claimed until the Recycler is upgraded.

### Building upgrades

| Upgrade | Cost | Time | New HP | Unlocks |
| --- | --- | --- | --- | --- |
| Recycler → Recycler II | 250 | 40 s | 5,000 | Builds Scavenger II, Constructor II, Transport (replaces the basic workers) |
| Factory → Factory II | 200 | 30 s | 1,800 | Also builds Scout, Tank and Artillery Mk II, once each is researched |

Production pauses while a building upgrades; queued units wait. Upgraded
buildings show gold chevrons.

### Research Lab

Cost 200, build 20 s, 900 HP, 2×2, territory radius 6. It researches one topic
at a time; the same topic can't be researched twice or in two labs at once.

| Research | Cost | Time | Unlocks |
| --- | --- | --- | --- |
| Advanced Scouts | 150 | 45 s | Scout Mk II |
| Advanced Tanks | 200 | 60 s | Tank Mk II |
| Advanced Artillery | 250 | 75 s | Artillery Mk II |

### Mk II vehicles

About +40% HP, +30% damage, +20% speed, +50% cost. Marked with gold chevrons.
They keep the orders of the basic version (Scout, Patrol, Defend).

| Unit | Cost | Build | HP | Speed | Damage | DPS |
| --- | --- | --- | --- | --- | --- | --- |
| Scout Mk II | 75 | 7 s | 196 | 118 | 10 | 28.6 |
| Tank Mk II | 150 | 12 s | 560 | 48 | 44 | 36.7 |
| Artillery Mk II | 210 | 16 s | 280 | 38 | 78 | 22.3 (splash) |

### Radar

Cost 150, build 16 s, 600 HP, 2×2, normal sight 220. It pings once on
completion, then every **30 s**. Each ping reveals everything within **750 px**
(2.5 times a normal building's sight) for **4 s**, shown as a sweeping green
ring. Enemies revealed by a ping can be targeted, including by artillery.

### Repair Pad

Cost 150, build 12 s, 800 HP, **3×3 and flat**: vehicles drive over it, and
nothing can be built on it. Any of your vehicles parked on it regains **30 HP
per second**, and Transport shields refill at the same rate. Repairing
vehicles show a pulsing green ring and rising green "+" signs. **Go repair**
(shown for damaged vehicles once a pad exists) sends the selection to the
nearest pad.

### How the computer opponent uses the tech tree

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Upgrades Recycler after | 5:00 | 2:00 | 1:30 |
| Builds a Research Lab after | never | 6:00 | 4:00 |
| Builds a Radar after | never | 8:00 | 6:00 |

It pauses army production while saving for an upgrade or research. It
researches Tanks, then Scouts, then Artillery; upgrades one Factory once
anything is researched; and builds Mk II versions when it can. It keeps one
Constructor II for repairs, and builds a Scavenger II whenever it wants a new
geyser. In a test game on Normal it had Tank Mk IIs by about 13 minutes.
