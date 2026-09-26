# Roadmap

The game is built in stages. Each stage gives you something you can play, so
you're never months away from seeing progress.

## ✅ Stage 1: Single-player skirmish (done)

- Top-down battlefield with fog of war, a minimap, and mirrored random maps
- Scrap economy: Scavengers, salvage from wrecks, and scrap geysers that Scavengers deploy onto as Extractors
- Base building with a Constructor; you can only build inside your territory
- Five combat and support vehicles, four buildings
- Win by destroying the enemy Recycler; lose if yours falls
- Expand your territory outward by claiming geysers
- Unit orders: Scout (solo or as a pack), Patrol, Defend, Deploy
- An AI opponent with three difficulty levels
- AI-vs-AI spectator mode (`?watch`)

## Stage 2: Deeper battles (single player)

Good next steps. Each is a self-contained request you can give an AI assistant.

- **More units.** An anti-tank rocket buggy, a mobile repair truck, a
  minelayer, an air-defence unit, a transport.
- **Terrain that matters.** Hills that extend sight and range, forests that
  hide units, roads that speed them up.
- **Veterancy.** Units that survive fights get stronger.
- **Upgrades / tech tree.** Research armour and weapons at a new building.
- **Unit stances.** Hold position, defensive, aggressive.
- **Better graphics.** Swap the drawn shapes for sprite images. The drawing
  code for each unit is in one place in `render.js`.
- **Sound and music.** Replace the synthesised beeps with real sound files.

## Stage 3: A bigger campaign (the "4X" layer)

- A strategic map of sectors between battles.
- Keep your surviving units and scrap from one battle to the next.
- Choose which sector to attack next. Captured sectors give bonuses.

## Stage 4: Online multiplayer

The code is already set up for this. Every player action, human or AI, goes
through a single function, `issueCommand()` in `sim.js`. To play online:

1. **A small server** (a program running on the internet) relays commands
   between players. A free service like Render, Fly.io or Railway can host it.
2. **"Lockstep" syncing.** Both players' browsers run the same simulation. Each
   sends only its commands (e.g. "move tanks 4 and 7 to here") and both apply
   them on the same game tick. That uses very little internet bandwidth.
3. **Same randomness everywhere.** The game already uses a seeded random
   number generator (`makeRng` in `map.js`), so both browsers see the same
   map and the same shots hit or miss.
4. **Lobby.** A page to create or join a game with a code.

Expect this stage to take longer than the others. Online games need testing
with two computers, and handling players who disconnect.

## Stage 5: Publishing

- Put the game on the internet for free with **GitHub Pages**, so anyone can
  play at a web address. No server is needed until Stage 4.
- Add a title screen, settings, and saved preferences.
