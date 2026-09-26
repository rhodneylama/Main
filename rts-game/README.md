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

- **Destroy the enemy Recycler**, their headquarters in the top-right corner.
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
| Scroll / zoom | Drag one finger / pinch |
| Build | Select the Constructor, pick a building, tap where it goes, then press **Build here** |
| Deselect, jump home, find an idle worker | **Deselect**, **Base**, **Idle worker** buttons |

## Controls (mouse and keyboard)

| Action | How |
| --- | --- |
| Select | Left-click, or drag a box. Double-click selects every unit of that type on screen. |
| Move / attack / gather | Right-click |
| Attack-move (fight anything on the way) | `A`, then left-click |
| Stop | `S` |
| Command buttons | `Q` `W` `E` `R`, or click them |
| Save a squad | `Ctrl` + `1`–`9`. Press the number to reselect it; press twice to jump to it. |
| Scroll the map | Arrow keys, push the mouse against the screen edge, middle-drag, or click the minimap |
| Zoom | Mouse wheel |
| Jump to base / to selection | `H` / `Space` |
| Find an idle worker | `X` |
| Pause · mute · help | `P` · `M` · `F1` |

## Your forces

| Unit | Cost | Role | Special order |
| --- | --- | --- | --- |
| Scavenger | 60 | Collects loose scrap automatically. | **Deploy on geyser**: drives onto a scrap geyser and becomes an Extractor. |
| Constructor | 80 | Builds and repairs buildings. | |
| Scout | 50 | Fast, sees far. Spots targets for artillery. | **Scout**: explores the map. With several selected, **Scout as pack** keeps them together; **Scout solo** spreads them out. |
| Tank | 100 | Tough all-rounder. | **Patrol**: loops around your buildings and fights anything it meets. |
| Artillery | 140 | Very long range and splash damage, but very slow, and it can only hit what your side can see. | **Defend**: digs in beside one of your buildings and shells anything in range. |

| Building | Cost | Role |
| --- | --- | --- |
| Recycler | — | Your HQ. Makes Scavengers and Constructors. Has a defence gun. |
| Factory | 150 | Makes Scouts, Tanks and Artillery. |
| Extractor | a Scavenger | Made by deploying a Scavenger onto a scrap geyser. Pumps about 72 scrap a minute forever, is a drop-off point, and expands the area you can build in. |
| Gun Tower | 110 | Defensive turret. |

**A good first few minutes:** select the Constructor and build a Factory near
your Recycler. Build a third Scavenger from the Recycler, then start making
Tanks. Put a Gun Tower on the side of your base facing the enemy. Send a
Scavenger to the glowing scrap geyser near your base to make an Extractor. Loose
scrap runs out, but geysers never do, so claim the geysers further out too and
guard each one with a Gun Tower.

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
| `js/render.js` | Draws everything on screen. |
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
