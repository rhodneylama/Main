# Build "Scrapline Command": a top-down real-time strategy game for the browser

You are going to build a complete, playable browser game from a written
specification. Everything you need is in the files attached with this prompt.
Read this whole prompt first, then the files in the order given in section 3.

---

## 1. Who you're working with

The game's owner and designer is **not a programmer**. They have no coding
experience, they test by playing (often on their phone), and they describe
what they want in plain English. When you talk to them:

- Explain what you did and what to do next in **plain English**, without
  jargon. If a technical word is unavoidable, explain it in a few words.
- Give **exact, step-by-step instructions** for anything they must do
  themselves (saving files, opening the game, running a test).
- When you finish a stage, tell them **what they can now see or try** in the
  game.
- Don't ask them technical questions they can't answer. Make a sensible
  choice, then tell them what you chose and why.

---

## 2. The game in one paragraph

**Scrapline Command** is a top-down, real-time strategy game inspired by
*Battlezone 2* (a scrap economy, a Recycler headquarters, Scavengers that
deploy onto geysers), *Battlefield 2* (vehicles with distinct roles) and 4X/RTS
games (gather, build, expand, research, conquer). One human player (Blue)
fights one computer opponent (Red) on a large, mirror-symmetric map. You start
with a Recycler on wheels: drive it onto a scrap geyser and deploy it as your
headquarters. Collect scrap, build a base, research Mk II vehicles, claim
geysers, and **win by destroying the enemy Recycler**. It must be fully
playable on a **phone** as well as a desktop. There are **two factions**,
Scrapline and the Kethra Concord, chosen on the start screen; they play by
exactly the same rules and differ only in their art and names
(`GAME_DESIGN.md` section 6, "Factions").

---

## 3. The files attached, and how to use them

Read them in this order:

| # | File | What it is | How to treat it |
| --- | --- | --- | --- |
| 1 | `PROMPT.md` | This prompt | Your instructions |
| 2 | `docs/GAME_DESIGN.md` | **The full specification**: every rule, every number, the computer opponent's logic, controls, screen layout, art, testing, known problems and design decisions (about 1,200 lines) | **The source of truth.** Build exactly what it describes. Where anything else disagrees with it, it wins (except the economy numbers; see the next row). |
| 3 | `docs/ECONOMY_TEST_REPORT.md` | The most recent balance round: why there are 12 geysers, the Extractor and opponent settings, with test results (Transports and Extractor Silos have since been **removed**; ignore those parts) | Use the values listed as **"in the game now"** (option A). Its *recommendations* (option E) are **not** applied yet; build option A. |
| 4 | `docs/README.md` | The player's guide: how to play, controls, unit and building tables | Use it for in-game text and help screens. It must match how your game behaves. |
| 5 | `docs/UNIT_SPRITES.md` | The art brief for the unit design sheet | How to wire the art into your drawing code. |
| 6 | `assets/sprites.js`, `assets/sprites_kethra.js` | **The owner's own vehicle and building designs** for Scrapline and the Kethra Concord, as finished vector-drawing code (`docs/KETHRA_SPRITES.md` describes the second) | **Use these files as they are.** Don't redraw or restyle the units. See section 6.4. |
| 7 | `tests/rules.js` | An automatic test of the game rules (82 checks), run with Node.js | Your version must pass it. See section 7. |
| 8 | `screenshots/` | 13 pictures of the current game on desktop and phone | What the finished game should look and feel like. Match the layout and feel; you don't have to match it pixel for pixel. |
| 9 | `docs/ROADMAP.md` | Possible future stages | Background only. **Don't build** anything that is only on the roadmap. |

The original program code is deliberately **not** included: the aim is to
rebuild the game from the specification.

### The screenshots

| File | Shows |
| --- | --- |
| `00-start-screen-desktop.png` | The current start screen: faction cards, difficulty, Start / How to play / Watch (01 is the older title screen) |
| `01-title-screen-desktop.png` | Title screen: mission summary, difficulty, Start, Watch AI vs AI |
| `02-game-start-desktop.png` | The first moments: mobile Recycler selected, geyser nearby |
| `03-base-and-army-desktop.png` | A base (Recycler, Factory, Base Silo, Gun Tower, Repair Pad) and 5 selected Tanks |
| `04-all-units-and-buildings.png` | Every vehicle (both teams, basic and Mk II) and every building, including the Artillery Tower and Heavy Gun Tower, from `sprites.js` |
| `05-factory-selected-desktop.png` | A building's command panel |
| `06-phone-portrait-start.png`, `06-phone-landscape-start.png` | Phone layouts at the start |
| `07-phone-portrait-constructor-selected.png`, `07-phone-landscape-constructor-selected.png` | Phone command panel: buttons wrap in rows, no sideways scrolling |
| `08-phone-portrait-paused.png` | Pause screen with Resume and Help |
| `09-phone-portrait-help.png` | The help screen |
| `10-computer-vs-computer-10-minutes.png` | Watch mode, 10 minutes into an AI-vs-AI game |
| `11-map-overview-seed-42.png` | The whole map (seed 42): terrain, the 12 geysers (yellow, with 10-tile rings), scrap fields, both bases |
| `12-production-queue-desktop.png` | A Factory with a long queue: each vehicle button shows ×N queued, a progress fill and a red − to remove one |
| `13-groups-menu-desktop.png` | The Groups menu: unit groups 1 to 9 with Set buttons |

---

## 4. Requirements you must not break

These come from the owner and from `GAME_DESIGN.md` section 22 ("Design
decisions already made"). Don't change them, even if you think something else
would be better. Suggest changes instead.

**Technical**

1. **Plain HTML, CSS and JavaScript. No build step, no frameworks, no
   installs, no server.** The owner plays by double-clicking `index.html`.
   It must work when opened straight from a file (`file://`), so no ES
   modules and no `fetch` of local files: use classic `<script>` tags.
2. **Phone-playable.** Touch controls (tap, drag, pinch, press-and-hold box
   select), a layout that works in portrait and landscape, buttons big enough
   for a thumb, **no sideways scrolling** in the command panel. See
   `GAME_DESIGN.md` sections 15 and 16 and the phone screenshots.
3. **No image files for units or buildings.** They are drawn by
   `sprites.js`. Terrain and effects are also drawn in code.
4. **Fixed-rate, deterministic simulation:** 30 ticks a second, independent
   of frame rate. **All** randomness in the rules comes from a seeded random
   number generator, so the same seed and the same commands give the same
   game. (Purely cosmetic effects may use `Math.random`.)
5. **Every player and AI action goes through one function,
   `issueCommand(game, team, command)`.** The AI uses the same rules and the
   same commands as the human. This is what will make online multiplayer
   possible later.
6. **Performance:** smooth on a phone. The map is 5,824 × 4,384 pixels,
   which is **too big for one canvas image on phones** (iPhones refuse
   images over about 16.7 million pixels). See section 8.

**Design**

7. The **only** win condition is destroying the enemy Recycler (deployed or
   still on wheels). No flags, tickets, timers or score limits.
8. **Easy must be genuinely easy** for a first-time player.
9. Use the numbers in the spec and the economy report. Don't rebalance.
10. **Help is only reachable from the pause screen** (and `F1` on a keyboard,
    which pauses). The quick buttons (Army ▾, Base, Idle worker, Deselect)
    live in the **top bar**.

---

## 5. Suggested build order

Build in stages. At the end of each stage, the game should open without
errors and show something new. Tell the owner what to try at each stage.

1. **Skeleton.** `index.html` with the page layout (top bar, bottom panel,
   minimap corner), the script tags in order, a canvas that fills the
   screen, the title screen, and the game loop at 30 ticks a second.
2. **Map.** `generateMap(seed)`: 182 × 137 tiles, grass/dirt/rock/water from
   smoothed noise, **point-symmetric**, rock edge, bases in opposite corners,
   12 geysers, 22 scrap fields, clearings, and the road-repair pass that
   makes everything reachable. Draw it, with a camera you can scroll and
   zoom (mouse and touch), and the minimap.
3. **Units and movement.** All unit types from `config.js`, drawn with
   `sprites.js`. Selection (click, box, tap, double-tap), move orders,
   group formations, route-finding (A*) with smoothing, collision with
   terrain and buildings.
4. **Economy.** Mobile Recycler deploy, Scavengers gathering loose scrap,
   storage and its cap, Base Silos, Constructors and building placement with
   territory, production queues, waypoints, demolish.
5. **Combat.** Weapons, turrets, projectiles, artillery splash and its
   stabiliser legs, Gun Towers, damage, death, wrecks and salvage, fog of war.
6. **Geysers.** Scavenger II deploying as an Extractor; Extractors pay
   straight into the total and only hold up to 120 while storage is full.
   There are **no** Transports and **no** Extractor Silos.
7. **Tech tree.** Recycler II and Factory II upgrades, the Research Lab and
   Mk II units, Constructor II repairs, Radar pings, the Repair Pad (repairs,
   workers waiting, repaired units leaving to the pad's waypoint, **Recycle**
   with a confirm step), Gun Tower upgrades (Artillery Tower, Heavy Gun
   Tower).
8. **Orders.** Scout (solo/pack), Patrol, Guard (a building or a unit),
   Attack-move, Stop, Deploy, Go repair (Constructors too), the Army ▾ menu,
   Idle worker, unit groups (Ctrl+1–9 and the Groups menu), production
   counts up to 99 with per-type cancel, light traffic steering.
9. **The computer opponent.** Exactly as `GAME_DESIGN.md` section 13
   describes, with the three difficulty levels of section 14 (including the
   economy report's changes: more Extractors, fewer Scavengers once geysers
   run). Normal and Hard use the **tactics** in section 13 (hold, counter,
   flank, combined arms, fire by role, feint, retreat and retreat trap,
   raids, adaptive army mix) with the per-difficulty settings in section 14.
   Artillery fires on anything its side can see out to its full range.
10. **Screens and polish.** Pause screen (Resume, Help), help, end screen
    with stats, sound, messages, alerts, Watch AI vs AI mode (`?watch`), the
    `?seed=N` address option, phone layouts.
11. **Testing.** Make `tests/rules.js` pass (section 7), then test in a phone
    emulator (section 9).

---

## 6. File layout and the code contract

### 6.1 Folder layout

```
index.html          the page, styles (including phone layouts), screens
js/config.js        ALL balance numbers: units, buildings, research, difficulty
js/map.js           map generation and route-finding
js/sim.js           the rules: commands, movement, combat, economy, vision, victory
js/ai.js            the computer opponent
js/sprites.js       the owner's Scrapline art (copy assets/sprites.js here, unchanged)
js/sprites_kethra.js the owner's Kethra art (copy assets/sprites_kethra.js here, unchanged)
js/render.js        drawing: terrain, fog, units/buildings via sprites.js, effects, minimap
js/main.js          input (mouse, keyboard, touch), panels and buttons, sound, the loop
tests/rules.js      the rules test (copy from the attachment)
README.md           player's guide (adapt docs/README.md to your game)
```

Load order in `index.html`: `config.js`, `map.js`, `sim.js`, `ai.js`,
`sprites.js`, `sprites_kethra.js`, `render.js`, `main.js`.

### 6.2 The four rules files must run without a browser

`tests/rules.js` loads **`js/config.js`, `js/map.js`, `js/sim.js` and
`js/ai.js`**, joins them into one script, and runs them in Node.js with no
browser. So in those four files:

- No `window`, `document`, canvas, `localStorage` or `Audio`. Keep all of
  that in `render.js` and `main.js`.
- Write them as **classic scripts with top-level `const`, `let` and
  `function` declarations** (no `import`/`export`, no wrapping everything in
  one object or closure), so the names below are directly visible.
- Names must not clash between the four files.

### 6.3 Names and shapes the test relies on

**Globals:** `CONFIG` (with `TILE: 32`, `TICK_RATE: 30`,
`SCRAP_NODE_AMOUNT`), `UNIT_TYPES`, `BUILDING_TYPES`, `RESEARCH`, `TILE_ROCK`,
`TILE_WATER`, `DIFFICULTY`.

**Type keys** (exactly these):

- Units: `mobileRecycler`, `scavenger`, `scavenger2`, `constructor`,
  `constructor2`, `scout`, `hornet`, `tank`, `sentry`, `artillery`, `scout2`,
  `hornet2`, `tank2`, `sentry2`, `artillery2`.
- Buildings: `recycler`, `factory`, `extractor`, `basesilo`, `lab`,
  `radar`, `repairpad`, `tower` (upgraded towers keep type `tower` and get
  `variant: 'arttower'` or `'heavytower'`).
- Research: `scout2`, `tank2`, `artillery2`.

**Functions:**

| Function | Must do |
| --- | --- |
| `generateMap(seed)` | Return `{ W, H, tiles, bases, scrap, geysers, fields, seed }`. `tiles` is a flat array, `tiles[y * W + x]`. `bases` is `{ 1: {x, y}, 2: {x, y} }` in tiles. `geysers` is `[{ id, x, y, tx, ty, extractorId }]`, where `tx, ty` is the tile corner and `x, y` the same point in pixels. `scrap` is `[{ id, x, y, amount, max }]` in pixels. `fields` is `[{ x, y }]`: field centres in tiles, mirrored as `(W−1−x, H−1−y)`. |
| `createGame({ seed, difficulty, aiTeams })` | Return the game object (below), with both sides' starting units placed (section 4 of the spec). `aiTeams: []` means no computer players. |
| `stepGame(game)` | Advance one tick (1/30 s). Remove anything with `hp <= 0` during the step. |
| `issueCommand(game, team, cmd)` | Apply a command (types below). Ignore anything the team doesn't own. |
| `aiUpdate(game, team)` | Let the computer play `team` (called every tick; it decides how often to think). |
| `addUnit(game, type, team, x, y)` | Create a unit at pixel `x, y`; return it. |
| `addBuilding(game, type, team, tx, ty, complete)` | Create a building with its top-left tile at `tx, ty`; `complete: true` means already built. Return it. |
| `canPlaceBuilding(game, team, type, tx, ty)` | Return `{ ok: true }` or `{ ok: false, why: 'reason' }`. |
| `findPath(game, sx, sy, gx, gy)` | Return a route as a list of pixel waypoints `[{x, y}, …]` ending at or near the goal, or `[]` if none. |
| `scrapCapacity(game, team)` | Total storage. |
| `bankScrap(game, team, amount, quiet)` | Add up to `amount` to storage; return how much fitted. |
| `isBlockedTile(game, tx, ty)` | True if rock, water, off the map or under a building (Repair Pads do **not** block). |
| `padUnder(game, unit)` | The finished, own-side Repair Pad the unit is parked on, or `null`. |
| `recycleValue(unit)` | Half the unit's cost, rounded. |
| `dist(a, b)` | Distance between two things with `x, y`. |

**The game object** has at least: `map` (from `generateMap`), `entities`
(every unit and building), `geysers`, `scrap` (loose scrap piles, including
wrecks' salvage and demolish leftovers), `teams` (`teams[1]` and `teams[2]`,
each with `scrap`, `research` (an object: `research.tank2 === true` once done)
and `explored`), `effects` (visual effects, each with `kind`, `x`, `y`),
`events` (messages), `tick`, `time`, `winner`.

**Every unit** has `id`, `kind: 'unit'`, `type`, `team`, `x`, `y`, `hp`,
`maxHp`, `def` (its `UNIT_TYPES` entry), `order` (with `order.type`: `'idle'`,
`'move'`, `'deploy'`, `'harvest'`, `'guard'`, …), and for artillery `legE` (0 to 1, how far its legs
are lowered) and `lastShot` (the game time of its last shot; undefined until
it fires). **Read weapons and other unit stats from `unit.def`**, not from
`UNIT_TYPES[unit.type]`: the test swaps in a modified `def` on one unit.

**Every building** has `id`, `kind: 'building'`, `type`, `team`, `x`, `y`
(centre, pixels), `tx`, `ty` (top-left tile), `size`, `hp`, `maxHp`, `def`,
`built` (0 to 1; 1 = finished), `level` (1, or 2 once upgraded) and `stored`
(an Extractor's tank).

**`def` fields used:** `role` (`'hq'`, `'harvester'`, `'builder'`,
`'combat'`), `cost`, `carryMax`, `store`, `income`.

**Command types used by the test:**

```js
{ type: 'deploy',   ids: [unitId], geyserId }   // mobile Recycler or Scavenger II onto a geyser
{ type: 'upgrade',  buildingId }                 // Recycler → Recycler II, Factory → Factory II
{ type: 'research', buildingId, key: 'tank2' }
{ type: 'demolish', buildingId }
{ type: 'move',     ids: [...], x, y }
{ type: 'gorepair', ids: [...] }
{ type: 'recycle',  ids: [...] }
{ type: 'produce',  buildingId, unit: 'tank', count }  // queue; paid when each one starts
{ type: 'cancel',   buildingId, unit: 'tank' }         // remove the last queued Tank
{ type: 'rally',    buildingId, x, y }                 // also works on a Repair Pad
{ type: 'guard',    ids: [...], targetId }             // a building or a unit
{ type: 'upgrade',  buildingId, option: 'arttower' }   // Gun Tower: 'arttower' or 'heavytower'
```

(Your game needs many more: attack, harvest, build, repair, produce, cancel,
rally, scout, patrol, guard, stop. The spec lists them in section 19.)

**Two small details the test checks:**

- A destroyed vehicle's salvage pile has `id = 100000 + unit.id`, and its
  wreck is an effect with `kind: 'wreck'`. A **recycled** vehicle must leave
  neither.
- Demolishing a building adds half its cost to `game.scrap` as one or more
  piles (a Factory: 75).

### 6.4 Using `sprites.js`

`sprites.js` defines `window.UnitSprites` (see `docs/UNIT_SPRITES.md` for its
API). It is browser-only, so load it in `index.html` but **not** in the four
rules files. Map game types to sprite ids:

- `mobileRecycler` → `recyclerV`
- `repairpad` → `repair`
- `basesilo` → `silo`
- `tower` with `variant: 'arttower'` → `towerArt`; `'heavytower'` → `towerHeavy`
- Mk II and tier-II types use their base type's sprite with `mk: true`
  (`tank2` → `tank`).
- Everything else uses its own name.

For a **Kethra** side, draw with `window.KethraSprites` instead, using its ids
(`tank` → `bulwark`, `scout` → `shard`, `artillery` → `spire`, `hornet` →
`talon`, `sentry` → `pylon`, `constructor` → `loom`, `scavenger` → `skimmer`,
`mobileRecycler` → `monad`, `recycler` → `nexus`, `factory` → `assembler`,
`repairpad` → `lattice`, `extractor` → `siphon`, `basesilo` → `vault`, every
tower → `prism`, `lab` → `archive`, `radar` → `array`) and pass `thrust: true`
while a vehicle moves.

**Lookup warning:** if you map types to sprite ids with a plain object, the
type `constructor` will hit JavaScript's built-in `Object.prototype.constructor`
and draw nothing. Use `Object.create(null)` or a `Map`.

---

## 7. The rules test

From the project folder, with Node.js installed:

```
node tests/rules.js
```

It prints `PASS` or `FAIL` for 82 checks and a final count. It covers:

- **Map:** size, corners, symmetry, rock edge, 12 geysers at least 20 tiles
  apart (6 per half), mirroring, 20 to 24 fields, everything reachable.
- **Route-finding:** a cross-map route exists and takes under 15 ms.
- **Economy:** deploying, storage and its cap, Base Silo, the Recycler's
  trickle, Extractor output straight into the total and its 120 buffer,
  no Transports or Extractor Silos, the production queue.
- **Tech:** Scavenger II deploying, Recycler II, research.
- **Combat and buildings:** tower fire, demolish refund, the Repair Pad
  (every vehicle repaired, workers waiting, leaving to its waypoint),
  recycling and all its limits, Guard, Gun Tower upgrades.
- **Artillery** stabiliser timing.

**Aim for 82 of 82.** If a check fails because you chose a different name or
shape, prefer changing your code to match section 6.3. Only adapt the test as
a last resort, keep every check's meaning, and tell the owner exactly what
you changed and why.

Note that the test file's comment says to run it as
`node rts-game/tests/rules.js`. It finds the `js` folder relative to its own
location (`tests/../js`), so it works from wherever your project lives.

---

## 8. Lessons already learned (please don't repeat these)

The original version hit each of these problems. They're all solvable, but
they're easy to miss.

1. **Mirror fairness.** Both sides must get mirror-image outcomes. Shuffle
   the update order each tick with the seeded generator. Make tie-breaks in
   route-finding, group formations and "nearest open tile" searches
   symmetric. The original solves routes and formations from one half of the
   map and mirrors the answer for the other half. The opponent's
   decision timing gets a little seeded jitter. Even so, a corner advantage
   remains unexplained (spec section 21), so **starting corners are chosen
   at random each game**.
2. **Crowds that never arrive.** When many vehicles head for one point,
   they jostle forever. Rule: a vehicle counts as arrived if it's within
   120 px of its last waypoint and hasn't got closer for 2 seconds.
3. **Route searches every tick.** Orders like "if I have no route, plan one"
   retry on every tick when no route exists. On this big map a failed
   search costs a whole-map scan (about 20 ms), and two stuck Constructors
   froze the game. Don't re-search the same destination within 2 seconds
   after a failure, or within half a second otherwise.
4. **Route speed on the big map.** Use a binary heap, inline the tile
   checks, and limit route smoothing to looking about 40 tiles ahead. Target:
   a cross-map route in about 5 ms.
5. **One canvas for the whole map is too big for phones.** Paint the
   terrain in chunks (for example 16 × 16 tiles = 512 px) as they scroll
   into view, paint at most 2 per frame, keep about 48 and drop the oldest.
   Show a blurred one-pixel-per-tile version underneath until a chunk is
   ready. Give each tile its own seeded random numbers so a repainted chunk
   looks identical. Remember scorch marks and repaint them onto new chunks.
6. **Building guns must reload.** Count down building weapon cooldowns
   (the first version's Gun Towers never fired twice). Measure range from a
   building's **edge**, so its gun isn't outranged by tanks.
7. **The opponent must save up.** Otherwise it spends everything on its
   army and never upgrades or researches. It pauses
   army production while saving (spec section 13).
8. **The Repair Pad must not heal the dead.** Skip anything with `hp <= 0`,
   or a vehicle destroyed or recycled on the pad gets healed back to life in
   the same tick.
9. **Workers on the pad.** Idle Scavengers go back to work by
   themselves, so they drove off half-repaired. They must wait on the pad
   until fully repaired.
10. **The `constructor` lookup bug** (section 6.4).
11. **Phone layout traps:** a long build list pushed the quick buttons over
    the map in portrait, and the starting geyser was hidden behind buttons
    in landscape. The fix: quick buttons in the top bar, command buttons
    wrapping in rows of three in portrait (no sideways scrolling), help on
    the pause screen.
12. **Queue buttons.** Rebuilding the panel's HTML every frame (or using
    `innerHTML +=`) breaks button presses. Only rebuild the panel when what
    it shows has changed, and react on press (mouse-down or touch start).

---

## 9. How to check your work before handing it over

1. `node tests/rules.js`: 82 of 82.
2. Open `index.html` from a file (double-click) in a desktop browser. No
   errors in the browser console (F12). Play a full game on Easy.
3. Use the browser's phone emulator (iPhone, portrait and landscape). Tap
   to select, tap to move, drag to scroll, pinch to zoom, press-and-hold to
   box-select, build a Factory, use every button. Nothing should need
   sideways scrolling, and nothing important should be hidden.
4. `index.html?watch`: two computer players fight. Games should usually end
   within 20 to 45 minutes on Normal (some may stall; see the economy
   report).
5. **"Do nothing" check:** deploy your Recycler, then do nothing. You should
   lose in roughly 21 / 9 / 6½ minutes on Easy / Normal / Hard (the first
   attack on Hard lands at about 3:00).
6. Compare with the screenshots.

---

## 10. What to hand back

1. **The complete project**, as the file layout in section 6.1, ready to
   open by double-clicking `index.html`. Give every file in full; don't
   abbreviate code with "…" or "rest unchanged".
2. **The rules test output** (the PASS/FAIL list).
3. **A short plain-English note for the owner:**
   - how to open and play the game;
   - what works;
   - anything you couldn't finish, or that differs from the spec, and why;
   - anything you had to guess, so they can confirm or correct it.

If the whole game is too much for one reply, build it in the stages of
section 5, giving the full files for each stage, and say clearly which stage
comes next.
