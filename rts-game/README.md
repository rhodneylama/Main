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

On Normal and Hard the enemy fights like a commander: it holds back early and
counter-attacks after you attack; it flanks; its Tanks lead while its
Artillery shells your Gun Towers from behind them and its Scouts swing round
to hit your Extractors or your Artillery at the same time; it raids your
workers; it pulls back from fights it's losing and may leave a trap for
whatever chases it; and it builds more Artillery if you build lots of Gun
Towers, and more Scouts if you rely on Artillery.

## Play it full screen

The game has its own page: **https://rhodneylama.github.io/Main/**. Open it
in your phone's browser, then Share → **Add to Home Screen** (iPhone) or
**Install app** (Android): the icon opens the game full screen. Saves there
are separate from the ones in Claude; use **Download this game** and **Load
from a file…** to move one across.

## Playing on a phone or tablet

The game works on touch screens, held upright or sideways. For the whole screen, use **Full screen** (pause screen, or **More ▾** on the start screen); on an iPhone, or inside claude.ai where full screen isn't allowed, open the game on its own web page and use Share → **Add to Home Screen**: it then opens full screen like an app.

| Action | How |
| --- | --- |
| Select a vehicle | Tap it. Tap the same kind twice quickly to select all of that kind on screen. |
| Move / attack / gather | With vehicles selected, tap the ground, an enemy, or a scrap pile |
| Select a group | Press and hold on the map, then drag a box |
| Battle groups | Select vehicles, then **Group ▾** → Battle group 1–5 (or add to one, or leave). A numbered button for each group appears above the command panel: tap to select it, tap again to jump to it. Also under **Army ▾**. |
| Select fighters | **Army** button, then All, Scouts, Tanks or Artillery |
| Stance and Hunt | **Aggressive**, **Return fire**, **Stealth** or **Fight, then repair** sets how selected vehicles behave; **Hunt** sends them to seek and destroy (see "Orders and stances"). |
| Scroll / zoom | Drag one finger / pinch |
| Build | Select the Constructor, pick a building, tap where it goes, then press **Build here** |
| Select your army, jump home, find an idle worker, deselect | **Army ▾** in the top bar |
| Hunt, stance, guard, patrol | **Hunt ▾**, the stance drop-down (e.g. **Aggressive ▾**) and **Orders ▾** in the bottom panel |
| Game speed, save, help, full screen, quit | **❚❚** (pause) |
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
| Battle groups | `Ctrl` + `1`–`9` saves the selection as a battle group. Press the number to reselect it; press twice to jump to it. |
| Scroll the map | Arrow keys, push the mouse against the screen edge, middle-drag, or click the minimap |
| Zoom | Mouse wheel |
| Jump to base / to selection | `H` / `Space` |
| Find an idle worker | `X` |
| Pause · mute · help | `P` · `M` · `F1` |

## Factions

On the start screen you pick your faction, then the difficulty. The enemy
fields the other faction.

- **Scrapline:** tracked steel war machines built from scrap.
- **Kethra Concord:** hovering alien constructs on glowing gravity rings.

Both fight by exactly the same rules; only the look and the names differ.
This guide uses Scrapline names. The Kethra call them: Recycler = **Nexus**
(on wheels: **Monad**), Scavenger = **Skimmer**, Constructor = **Loom**,
Scout = **Shard**, Hornet = **Talon**, Tank = **Bulwark**, Sentry = **Pylon**,
Artillery = **Spire**, Factory = **Assembler**, Extractor = **Siphon**,
Base Silo = **Vault Orb**, Gun Tower = **Prism Tower**, Research Lab =
**Archive**, Radar = **Sensor Array**, Repair Pad = **Mending Lattice**.

**How to play** on the start screen (or Help on the pause screen) has the
mission, the controls and tips.

## Orders and stances

Select armed vehicles and use the buttons in the panel:

| Button | What it does |
| --- | --- |
| **Aggressive** (default) | On the move they fight anything they meet, then carry on to where you sent them. Standing still, they go to the help of friends under fire nearby. |
| **Return fire** | They shoot whatever comes in range but keep going (or keep to their spot). No chasing. |
| **Stealth** | They hold fire and just get there. |
| **Fight, then repair** | Like Aggressive, but when a vehicle's health turns yellow it pulls back to a Repair Pad (or to your Recycler, where your Repair Drones can fix it), then returns to where it was. |
| **Hunt as pack** / **Hunt solo** | Seek and destroy: they go after the nearest enemy you know of, or search for one. A pack keeps together. |
| **Guard** | Pick a building or vehicle: they stay beside it, and the moment it's attacked they go after the attacker, then come back. |

When several vehicles attack the same target they spread out around it
instead of bunching up. Each side can have up to **100 units**.

## Campaign

Press **Campaign** on the start screen to fight a war for **The Cinder
Reach**: fifteen battlefields joined into a web. Your side holds the west,
the enemy the east, and AI commanders on both sides fight over the front
lines while you're away ("on paper"), at the pace you choose: Fast (a war
report every 10 minutes), Normal (30 minutes), Slow (2 hours), Very slow (8
hours) or Hold (the war moves only when you finish a battle). At most 12
reports come in while you're away, so the war is never decided without you.

On the war map, tap a battlefield:

- **Attack** an enemy battlefield **next to one your side holds** (you can't
  attack deeper than that). You lead from the first minute.
- Join a battle your side is already fighting (marked ⚔; the ring shows how
  it's going, blue for you): **Take command** of the allied base and army as
  they stand, or **Reinforce** with your own strike force (gold markers)
  while the allied commander runs the base and sends you every third
  vehicle it builds.

**Bases and landings.** Whoever holds a battlefield already has a base
there; the other side lands. Leading an attack, you choose your **landing
zone**: beside an unclaimed geyser, clear of their defences, or close to one
of their outlying Extractors, to destroy it and **liberate** the geyser. You
land with your Recycler on wheels, workers, a strike force and supply crates
of scrap. Bases held longer, or with more friendly ground around them, are
more built up. Campaign battles run faster, for about 10–15 minutes.

Five battlefields (marked ◆) are **capture and hold**: hold two of the
three uplinks for 3 minutes to win (or destroy their Recycler).

Every neighbouring battlefield your side holds gives you extra vehicles at
the start of a battle; the enemy gets the same from its own.
Win a battle and the battlefield is yours. **Leave battle** on the pause
screen hands it back to the allied commander. Hold all fifteen to win.

## Shields

Research **Forcefield Tech** at a Research Lab, build a **Power Generator**, then **Shield Projectors** (180 scrap) near it. Each
projector throws a forcefield wall in front of it that stops enemy fire from
that side (vehicles and shots from behind pass through). While placing one,
press **Rotate ↻** (or `F`) to point it at the threat; build several side by
side for a long wall. One Generator powers four projectors, and each burns a
little scrap (6 a minute) while running. The field turns from blue to orange
to red as it weakens; when it collapses, the projector is exposed for 15
seconds while it reboots.

## Radar

A **Radar** can be built anywhere you've explored, not just inside your
territory, and you can build around it (a small area), so a hidden Radar out
in the field can anchor a few Gun Towers. It pings every 30 seconds,
revealing a wide circle. Upgrade it to **Radar II** (pings every 15 seconds,
250 scrap) and then **Radar III** (a constant feed: the circle stays
revealed, 500 scrap).

## Hit and miss

Shots can miss: fast vehicles and far-away targets are harder to hit, and
firing on the move costs a little accuracy. In a fight, vehicles keep moving
around their target, so they're harder to hit too.

## Veterans and armour

Vehicles that score kills are promoted: **Veteran** (2 kills), **Elite** (5)
and **Ace** (10), shown as gold chevrons beside them. Each rank makes them
much more accurate (even on the move), quicker to reload and tougher, so
it pays to keep them alive. Hitting a vehicle from the **side** does 25%
more damage, and from **behind** 50% more: flank them.

On a **Factory II**, each vehicle has one button; the **Mk I / Mk II** chip
on it chooses which version it builds.

## Uplinks and call-ins

**Uplinks** (capture and hold): three masts on the map. Park combat vehicles
next to one to capture it (15 seconds with one, faster with more; nothing
happens while both sides are there). Once the uplinks come online at 5:00,
holding two of them for 3 minutes wins the battle. Choose **Capture the
uplinks** on the start screen for a single battle like this.

**Call-ins:** you start every battle with one; each uplink you hold earns
another every 2 minutes. Press **Call-in** in the top bar:

- **Supply drop:** 300 scrap, dropped beside your Recycler.
- **Reinforcements:** 2 Tanks and 2 Hornets, dropped where you tap.

## Saving your game

Pause, then **Save game**: pick Slot 1, 2 or 3. There's also an **Autosave**,
updated every 3 minutes of battle and whenever you leave the page or switch
apps. **Load game** is on the pause screen and the start screen; a loaded
battle starts paused, exactly where you left it. **Download this game**
keeps a copy as a small file, and **Load from a file…** brings it back, on
any device. On claude.ai your saves are kept with your account, so they're
there on your phone and your computer; elsewhere they're kept in the
browser.

## Music

The music is composed live in the game: calm on the start screen, steady
while you build, and it brings in drums and a driving lead when fighting
breaks out near your forces. Each faction has its own sound. **Music: On/Off**
is on the start screen and the pause screen (with a volume slider); `M`
silences sound and music together.

## Your forces

**Maps:** pick **Wasteland** or **Ruined city** from the Map drop-down on the
start screen. The ruined city is a grid of streets between city blocks:
you can drive down the streets but only build in open lots, plazas,
courtyards and parks. Rubble blocks some streets, and a canal crosses the
city between the two bases with only five bridges.

| Unit | Cost | Role | Special order |
| --- | --- | --- | --- |
| Scavenger | 60 | Collects loose scrap automatically. Cannot deploy. | |
| Scavenger II | 80 | Built by a Recycler II. Collects scrap. | **Deploy on geyser**: drives onto a scrap geyser and becomes an Extractor. |
| Recycler (mobile) | — | Your starting vehicle. Your base on wheels. | **Deploy base**: drive onto a scrap geyser and become your Recycler. |
| Constructor | 80 | Builds buildings. Cannot repair. | |
| Repair Drone | 90 | Built by a Recycler II. Fast (like a Hornet), unarmed flying repairer with white propellers: fixes your buildings **and vehicles**. | **Auto repair** (its default): goes wherever something needs fixing, vehicles first. **Follow**: press it, then tap one of your vehicles; the drones stay with it and keep it repaired. Or tap a damaged building or vehicle to send them there. |
| Scout | 50 | Fast, sees far. Spots targets for artillery. | **Scout**: explores the map. With several selected, **Scout as pack** keeps them together; **Scout solo** spreads them out. **Guard** (all armed vehicles): press it, then tap one of your buildings or vehicles to protect it. |
| Hornet | 75 | Light rocket tank, between a Scout and a Tank: much faster and cheaper than a Tank, less armour, hard-hitting rockets. Fast enough for raids. | |
| Tank | 100 | Tough all-rounder. | **Patrol**: loops around your buildings and fights anything it meets. |
| Juggernaut | 200 | Heavy vehicle: more armour than a Tank but slower. Two turrets, a Tank's cannon in front and a Sentry's minigun behind, that can fire at two enemies at once. Its Mk II has twin barrels on both turrets. | |
| Sentry | 90 | Purely defensive turret on tracks. It cannot fire while packed up. | **Deploy**: digs in where it stands and guards that spot with a rapid stream of fire; it never moves or chases. **Pack up** (or any move order) to move it again. |
| Artillery | 140 | Very long range and splash damage, but very slow and slow to reload, and it can only hit what your side can see: keep a Tank or Scout ahead of it to spot, and it fires on its own out to full range. It must stop and lower its legs (about half a second) before it can fire. | **Guard** a building to dig in beside it and shell anything in range. |
| Scout / Hornet / Tank / Sentry / Artillery / Juggernaut Mk II | 70 / 110 / 145 / 130 / 200 / 290 | Researched at a Research Lab, built at a Factory II. About +50% armour and +40% damage, some extra speed, and one signature edge each: Scout sees further, Hornet fires a third rocket, Tank and dug-in Sentry outrange a basic Tank, Artillery reaches further with a bigger blast. Marked with gold chevrons. | As the basic version. |

| Building | Cost | Role |
| --- | --- | --- |
| Recycler | — | Your HQ, made by deploying the mobile Recycler on a geyser. Makes Scavengers and Constructors. Holds 300 scrap, has a defence gun, and pumps its geyser very slowly (about 2 a minute). Can't be demolished. |
| Factory | 150 | Makes Scouts, Hornets, Tanks, Juggernauts, Sentries and Artillery. |
| Extractor | a Scavenger | Made by deploying a Scavenger onto a scrap geyser. Pumps about 45 scrap a minute straight into your total. When your storage is full, up to 120 waits in the Extractor until there's room. Expands the area you can build in. |
| Base Silo | 250 | Adds 300 to your scrap storage. Must be next to your Recycler. |
| Gun Tower | 110 | Defensive turret. Upgrade once to an **Artillery Tower** (180: long-range shells with splash, range 520, needs your side to see the target) or a **Heavy Gun Tower** (150: tougher, faster twin cannon, range 280). |
| Research Lab | 200 | Researches Advanced Scouts (150), Tanks (200), Artillery (250), Hornets (175), Sentries (175) and Juggernauts (225), one at a time. |
| Radar | 150 | Every 30 seconds, a ping reveals a wide circle (750 px, 2.5× normal sight) for 4 seconds. |
| Repair Pad | 150 | A flat 3×3 pad. Every vehicle parked on it is repaired at 30 health a second (shields too); workers wait there until fixed. **Go repair** sends damaged vehicles there; once fixed they drive to the pad's **waypoint** (or step off beside it). Vehicles parked on it can be **recycled** for half their cost: press Recycle, then Confirm recycle. |

**Upgrades:** the Recycler upgrades to **Recycler II** (250 scrap, 40 s), which builds Scavenger IIs and
Repair Drones. A Factory upgrades to **Factory II** (200 scrap, 30 s), which builds researched Mk II
vehicles. Production pauses while a building upgrades.

**Building vehicles:** press a vehicle's button once for each one you want;
the button shows how many are queued (×7), fills up as the current one is
built, and says "Needs scrap" while it waits. There's no limit. Each is paid
for when it starts building, so a long queue simply waits when you're short of
scrap. Tap the red − on the button to remove one. On a keyboard, Shift-click
queues five.

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

**The battlefield** is 223 × 168 squares, with 20 scrap geysers (10 near each
side, spread from home out to the contested middle) and 36 fields of loose
scrap. Expect long drives: a Tank takes over three minutes to cross from
base to base.

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
| `js/sprites.js` | The Scrapline design sheet: how every Scrapline vehicle and building looks. |
| `js/sprites_kethra.js` | The Kethra Concord design sheet (see `KETHRA_SPRITES.md`). |
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
