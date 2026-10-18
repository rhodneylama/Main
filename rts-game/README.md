# Scrapline Command

A top-down, real-time battle game that runs in your web browser. You command a
small army of vehicles, collect scrap to pay for more, build up a base, and
fight a computer opponent for control of the whole map.

It borrows ideas from:

- **Battlezone 2**: scrap as the only resource, Scavengers that collect it,
  a Recycler as your HQ, and a Constructor that builds your base.
- **Battlefield 2**: a battlefield of vehicles with different jobs: fast
  scouts, tough tanks, long-range artillery.
- **RTS / 4X games**: gather, build, expand and conquer. Box-selecting units,
  a minimap, fog of war, and territory that grows as you build outposts.

---

## How to play it

**On your own computer (no install needed):**

1. On the GitHub page for this project, click the green **Code** button, then
   **Download ZIP**.
2. Unzip the file (double-click it on a Mac; right-click → *Extract All* on Windows).
3. Open the `rts-game` folder and double-click **`index.html`**. It opens in
   your web browser and you're playing.

**Tip:** add `?watch` to the end of the address in the browser bar (for example
`.../index.html?watch`) to watch two computer players fight each other.
Add `?seed=42` to get the same map every time.

---

## How to win

- **Destroy the enemy Recycler**, their headquarters in the opposite corner of the map.
  Everyone starts with their Recycler on wheels: drive it onto a glowing scrap
  geyser and deploy it to found your base.
- **Protect your own Recycler** at all costs. If it is destroyed, you lose.

The top bar shows the health of both bases. The enemy's shows `?` until one of
your vehicles has seen it.

The enemy attacks in waves. On **Easy** its first attack comes after about 10
minutes and is small, so you have time to learn. **Normal** attacks after about
5 minutes; **Hard** after 3.

## Playing on a phone or tablet

The game works on touch screens. Turning your phone sideways gives the best view.

| Action | How |
| --- | --- |
| Select a vehicle | Tap it. Tap the same kind twice quickly to select all of that kind on screen. |
| Move / attack / gather | With vehicles selected, tap the ground, an enemy, or a scrap pile |
| Select a group | Press and hold on the map, then drag a box |
| Select fighters | **Army** button, then All, Scouts, Tanks or Artillery |
| Unit groups | **Groups** button: **Set** saves the selected vehicles as group 1–6; tap a group to select it (twice to jump to it). Group numbers show beside the vehicles. |
| Scroll / zoom | Drag one finger / pinch |
| Build | Select the Constructor, pick a building, tap where it goes, then press **Build here** |
| Deselect, jump home, find an idle worker | **Deselect**, **Base**, **Idle worker** buttons in the top bar |
| Help | Press **Pause**, then **Help** |
| Hide or show the minimap | **Map** button above it |

## Controls (mouse and keyboard)

| Action | How |
| --- | --- |
| Select | Left-click, or drag a box. Double-click selects every unit of that type on screen. |
| Move / attack / gather | Right-click |
| Attack-move (fight anything on the way) | `A`, then left-click |
| Stop | `S` |
| Command buttons | `Q` `W` `E` `R`, or click them |
| Unit groups | `Ctrl` + `1`–`9` saves the selection as a group. Press the number to reselect it; press twice to jump to it. Same groups as the **Groups** button. |
| Scroll the map | Arrow keys, push the mouse against the screen edge, middle-drag, or click the minimap |
| Zoom | Mouse wheel |
| Jump to base / to selection | `H` / `Space` |
| Find an idle worker | `X` |
| Pause · mute · help | `P` · `M` · `F1` |

## Your forces

| Unit | Cost | Role | Special order |
| --- | --- | --- | --- |
| Scavenger | 60 | Collects loose scrap automatically. Cannot deploy. | |
| Scavenger II | 80 | Built by a Recycler II. Collects scrap. | **Deploy on geyser**: drives onto a scrap geyser and becomes an Extractor. |
| Recycler (mobile) | — | Your starting vehicle. Your base on wheels. | **Deploy base**: drive onto a scrap geyser and become your Recycler. |
| Constructor | 80 | Builds buildings. Cannot repair. | |
| Constructor II | 110 | Built by a Recycler II. Builds and repairs buildings. | |
| Scout | 50 | Fast, sees far. Spots targets for artillery. | **Scout**: explores the map. With several selected, **Scout as pack** keeps them together; **Scout solo** spreads them out. **Guard** (all armed vehicles): press it, then tap one of your buildings or vehicles to protect it. |
| Tank | 100 | Tough all-rounder. | **Patrol**: loops around your buildings and fights anything it meets. |
| Artillery | 140 | Very long range and splash damage, but very slow, and it can only hit what your side can see. It must stop and lower its legs (about half a second) before it can fire. | **Guard** a building to dig in beside it and shell anything in range. |
| Scout / Tank / Artillery Mk II | 75 / 150 / 210 | Researched at a Research Lab, built at a Factory II. About +40% armour, +30% damage, +20% speed. Marked with gold chevrons. | As the basic version. |

| Building | Cost | Role |
| --- | --- | --- |
| Recycler | — | Your HQ, made by deploying the mobile Recycler on a geyser. Makes Scavengers and Constructors. Holds 300 scrap, has a defence gun, and pumps its geyser very slowly (about 2 a minute). Can't be demolished. |
| Factory | 150 | Makes Scouts, Tanks and Artillery. |
| Extractor | a Scavenger | Made by deploying a Scavenger onto a scrap geyser. Pumps about 42 scrap a minute straight into your total. When your storage is full, up to 120 waits in the Extractor until there's room. Expands the area you can build in. |
| Base Silo | 250 | Adds 300 to your scrap storage. Must be next to your Recycler. |
| Gun Tower | 110 | Defensive turret. Upgrade once to an **Artillery Tower** (180: long-range shells with splash, range 520, needs your side to see the target) or a **Heavy Gun Tower** (150: tougher, faster twin cannon, range 280). |
| Research Lab | 200 | Researches Advanced Scouts (150), Tanks (200) and Artillery (250), one at a time. |
| Radar | 150 | Every 30 seconds, a ping reveals a wide circle (750 px, 2.5× normal sight) for 4 seconds. |
| Repair Pad | 150 | A flat 3×3 pad. Every vehicle parked on it is repaired at 30 health a second (shields too); workers wait there until fixed. **Go repair** sends damaged vehicles there; once fixed they drive to the pad's **waypoint** (or step off beside it). Vehicles parked on it can be **recycled** for half their cost: press Recycle, then Confirm recycle. |

**Upgrades:** the Recycler upgrades to **Recycler II** (250 scrap, 40 s), which builds Scavenger IIs and
Constructor IIs. A Factory upgrades to **Factory II** (200 scrap, 30 s), which builds researched Mk II
vehicles. Production pauses while a building upgrades.

**Building vehicles:** press a vehicle's button once for each one you want;
the button shows how many are queued (Tank ×7). There's no limit. Each is paid
for when it starts building, so a long queue simply waits when you're short of
scrap. The queue line shows one entry per vehicle type: tap its − to remove
one. On a keyboard, Shift-click queues five.

### Scrap and storage

You can only hold as much scrap as your base has room for. The Recycler holds
300, and each Base Silo adds 300. The top bar shows `held / room`; it turns
yellow when you're full. When storage is full, Scavengers wait at the base
with their loads, and Extractors hold up to 120 each, until there's room.

Scrap reaches your bank two ways:

- **Scavengers** pick up loose scrap and bring it home. It runs out eventually.
- **Extractors** pump scrap from geysers forever, straight into your total.
- Your **Recycler** also pumps its own geyser, but only a trickle.

**Demolish** any building except the Recycler: select it and press Demolish,
then Confirm. Half of what it cost is left on the ground as loose scrap.

**The battlefield** is 182 × 137 squares, with 12 scrap geysers (6 near each
side, spread from home out to the contested middle) and 22 fields of loose
scrap. Expect longer drives than on a small map: a Tank takes over two and a
half minutes to cross from base to base.

**Waypoints:** select your Recycler or a Factory and press Set waypoint. Every
new vehicle from it drives straight there. A Repair Pad's waypoint is where
vehicles sent by Go repair drive once fixed. Clear waypoint removes it.

**A good first few minutes:** deploy your Recycler on the geyser right next to
it. Then select the Constructor and build a Factory near your Recycler. Build a third Scavenger from the Recycler, then start making
Tanks. Put a Gun Tower on the side of your base facing the enemy. Send a
Scavenger II to the next glowing scrap geyser to make an Extractor (upgrade the
Recycler to Recycler II first). Add a Base Silo once your storage keeps filling
up. Claim the geysers further out too, and guard each one with a Gun Tower.

---

## What's in this folder

You don't need to understand these to play. They're here so you know where to
point an AI assistant when you want to change something.

| File | What it does |
| --- | --- |
| `index.html` | The page itself: the top bar, bottom panel, menus and help screen. |
| `js/config.js` | **All the balance numbers.** Costs, health, speed, damage, starting scrap, difficulty. The easiest file to experiment with. |
| `js/map.js` | Builds the random, mirrored battlefield and finds routes around obstacles. |
| `js/sim.js` | The rules: movement, combat, gathering, building, territory, winning. |
| `js/ai.js` | The computer opponent's decision-making. |
| `js/sprites.js` | The unit design sheet: how every vehicle and building looks. |
| `js/render.js` | Draws everything on screen, using `sprites.js` for vehicles and buildings. |
| `tests/rules.js` | Automatic checks of the game rules. Run `node rts-game/tests/rules.js` (needs Node.js). |
| `tests/balance/` | Tools that play many computer-vs-computer games and measure the economy. See `ECONOMY_TEST_REPORT.md`. |
| `ECONOMY_TEST_REPORT.md` | The October economy test (before Transports and Extractor Silos were removed): geysers, results and recommendations. |
| `js/main.js` | Mouse, keyboard, the on-screen panels, sound, and the main loop. |

### Changing the game with an AI assistant

Good requests are specific and name the file. For example:

- *"In `rts-game/js/config.js`, make Tanks cost 120 and give them 500 health."*
- *"In `rts-game/js/sim.js` and `config.js`, add a new unit called Rocket
  Buggy that is fast and does extra damage to buildings. Add it to the Factory."*
- *"In `rts-game/js/ai.js`, make the enemy build more Gun Towers on Hard."*
- *"In `rts-game/js/render.js`, draw Tanks with a longer barrel."*

After any change, reload `index.html` in your browser to try it. If something
breaks, the browser's developer console shows the error: press `F12` and open
the *Console* tab. Paste that error back to the AI.

See [`ROADMAP.md`](ROADMAP.md) for where the game could go next, including
online multiplayer.
