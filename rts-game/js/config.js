// =============================================================================
// config.js — THE BALANCE SHEET
//
// Every number that defines how the game plays lives here. If you want tanks
// to be tougher, scouts to be faster, or the enemy to be meaner, this is the
// file to change. You can ask an AI assistant things like:
//   "In config.js, make tanks cost 120 and give them 450 health."
// =============================================================================

const CONFIG = {
  TILE: 32,            // size of one map square, in pixels
  MAP_W: 257,          // map width, in squares (223 before it grew 15% a side in November 2026; 182 before that; 96 originally)
  MAP_H: 194,          // map height, in squares (168 before; 137 before that; 72 originally)
  TICK_RATE: 30,       // game updates per second

  START_SCRAP: 300,    // scrap each side starts with (the Recycler's storage is full)
  UNIT_CAP: 100,       // most units a side can have at once
  // Uplinks (capture-and-hold battles): radius, seconds for one vehicle to
  // capture (faster with up to three), seconds holding two to win.
  UPLINK_RADIUS: 130, UPLINK_CAPTURE: 15, UPLINK_WIN: 180,
  // Uplinks can be taken from the start, but holding two only counts toward
  // a win once they come online, so a side that has just landed can get going.
  UPLINK_ONLINE: 300,
  // Campaign: the holder of a battlefield doesn't send its first attack wave
  // before this (it still defends, and strikes back after beating one off).
  DEFENDER_FIRST_WAVE: 480,
  // ...and a side that has just landed doesn't send its first wave before this.
  LANDER_FIRST_WAVE: 420,
  // Call-ins: each side starts with one; every uplink held earns another
  // every CALLIN_EARN seconds (up to CALLIN_MAX in hand). They land
  // CALLIN_DELAY seconds after being called.
  CALLIN_START: 1, CALLIN_EARN: 120, CALLIN_MAX: 5, CALLIN_DELAY: 4,
  // Accuracy: the chance a shot hits. Each weapon's base chance falls with
  // range (up to ACC_RANGE less at full range), when the shooter is moving
  // (× ACC_SHOOTER_MOVING) and when the target is moving (less per pixel a
  // second of its speed). Buildings never dodge. Artillery has its own
  // spread instead. A miss flies past and hits nothing.
  ACCURACY: { bullet: 0.97, shell: 0.95, rocket: 0.95, rail: 0.98, flame: 0.96, shock: 0.96 },
  ACC_RANGE: 0.12, ACC_SHOOTER_MOVING: 0.92, ACC_TARGET_SPEED: 0.002, ACC_MIN: 0.15,
  // Guns that fire from a fixed spot (towers, the Recycler, dug-in Sentries,
  // Artillery with its legs down) are steadier: a higher hit chance, a
  // quarter less penalty against moving targets, and a tighter shell spread.
  ACC_FIXED: 1.1, ACC_FIXED_TRACK: 0.75, ARTY_SPREAD_FIXED: 0.75,
  // Tidal Flats: each cycle is `low` seconds of low tide then `high` of high
  // tide; warnings come `warn` seconds before it turns. Anything still on
  // the sand when it floods loses `swamp` of its health and is washed up on
  // the nearest dry ground. Each low tide washes up `washup` pairs of scrap.
  TIDE: { low: 160, high: 80, warn: 25, swamp: 0.3, washup: 5, washAmount: 120 },
  // Veterancy: kills earn ranks (Veteran, Elite, Ace). Each rank adds to the
  // chance to hit (× 1 + VET_ACC[rank]), shrinks the penalty for firing on
  // the move, reloads faster (VET_RELOAD less per rank) and adds health.
  VET_KILLS: [2, 5, 10], VET_NAMES: ['Recruit', 'Veteran', 'Elite', 'Ace'],
  VET_ACC: [0, 0.12, 0.24, 0.36], VET_RELOAD: 0.08, VET_HP: 0.1,
  // Armour facing: hits on a vehicle's side or rear do more damage.
  // Front is within 60° of where it faces, rear beyond 120°.
  ARMOR_SIDE: 1.25, ARMOR_REAR: 1.5,
  // Vehicles in a fight with an armed enemy keep moving (circling it at
  // range) at this share of their speed, so they're harder to hit.
  STRAFE_SPEED: 0.6,
  // Campaign battles: economy and production this much faster.
  CAMPAIGN_TEMPO: 1.5,
  QUEUE_MAX: 99,       // most vehicles queued at one building (each is paid for when its turn comes)

  WRECK_SCRAP_FRACTION: 0.3, // share of a destroyed unit's cost left as salvage
  // Artillery must stop and put down four stabiliser legs before it can fire,
  // and fold them away before it can move (seconds each way).
  ARTILLERY_DEPLOY: 0.6,
  ARTILLERY_RETRACT: 0.6,
  SCRAP_NODE_AMOUNT: 400,    // scrap in each fresh scrap pile
};

const TEAMS = {
  1: { name: 'Blue Command', color: '#4aa3ff', dark: '#1b4a78', light: '#a9d4ff' },
  2: { name: 'Red Legion',   color: '#ff5a4a', dark: '#7a2018', light: '#ffb0a6' },
};

// The two playable factions. They play by exactly the same rules (every unit
// and building has the same numbers); only the look and the names differ.
// `names` maps the Scrapline name of anything to the faction's own name.
const FACTIONS = {
  scrapline: {
    name: 'Scrapline', tagline: 'Salvage crews in tracked steel',
    desc: 'Tracked steel war machines built from scrap. Tanks lead, artillery digs in behind them.',
    names: {},
  },
  kethra: {
    name: 'Kethra Concord', tagline: 'Hovering alien constructs',
    desc: 'Hovering obsidian machines on gravity rings, with floating ceramic blades. Same strengths, alien look.',
    names: {
      'Recycler (mobile)': 'Monad', 'Recycler': 'Nexus', 'Recycler II': 'Nexus II',
      'Scavenger': 'Skimmer', 'Scavenger II': 'Skimmer II', 'Constructor': 'Loom', 'Constructor II': 'Loom II',
      'Scout': 'Shard', 'Scout Mk II': 'Shard Mk II', 'Tank': 'Bulwark', 'Tank Mk II': 'Bulwark Mk II',
      'Artillery': 'Spire', 'Artillery Mk II': 'Spire Mk II', 'Hornet': 'Talon', 'Hornet Mk II': 'Talon Mk II',
      'Sentry': 'Pylon', 'Sentry Mk II': 'Pylon Mk II', 'Repair Drone': 'Mender', 'Juggernaut': 'Colossus', 'Juggernaut Mk II': 'Colossus Mk II',
      'Factory': 'Assembler', 'Factory II': 'Assembler II', 'Extractor': 'Siphon', 'Base Silo': 'Vault Orb',
      'Gun Tower': 'Prism Tower', 'Artillery Tower': 'Prism Lancer', 'Heavy Gun Tower': 'Heavy Prism',
      'Research Lab': 'Archive', 'Armory': 'Forge', 'Radar': 'Sensor Array', 'Repair Pad': 'Mending Lattice',
      'Power Generator': 'Flux Well', 'Shield Projector': 'Aegis Pylon', 'Radar II': 'Sensor Array II', 'Radar III': 'Sensor Array III',
      'Advanced Scouts': 'Advanced Shards', 'Advanced Tanks': 'Advanced Bulwarks', 'Advanced Artillery': 'Advanced Spires',
      'Advanced Hornets': 'Advanced Talons', 'Advanced Sentries': 'Advanced Pylons', 'Advanced Juggernauts': 'Advanced Colossi',
    },
  },
};
// A name as a faction calls it.
const factionName = (faction, name) => (FACTIONS[faction] && FACTIONS[faction].names[name]) || name;
// A whole message in a faction's own words: every Scrapline name in it is
// swapped for the faction's (longest names first, so "Tank Mk II" wins over "Tank").
const factionText = (() => {
  const cache = Object.create(null);
  return (faction, text) => {
    const f = FACTIONS[faction];
    if (!f || !Object.keys(f.names).length) return text;
    const re = cache[faction] || (cache[faction] = new RegExp('\\b(' + Object.keys(f.names).sort((a, b) => b.length - a.length)
      .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(s?)(?![\\w])', 'g'));
    return text.replace(re, (m, n, pl) => f.names[n] + pl);
  };
})();

// role: 'harvester' collects scrap, 'builder' constructs buildings,
//       'combat' fights. Weapons: range and sight are in pixels.
// Speeds (pixels per second): Scavengers and Constructors 43, Tanks 40,
// Scouts 98. Artillery is kept the slowest of all.
const UNIT_TYPES = {
  // The starting vehicle. Drive it onto a scrap geyser and deploy it to
  // found your base. While mobile it still holds your scrap.
  mobileRecycler: {
    name: 'Recycler (mobile)', role: 'hq', cost: 0, buildTime: 1,
    hp: 2500, speed: 30, radius: 22, sight: 300, capacity: 300,
    desc: 'Your base on wheels. Drive it to a scrap geyser and deploy it. If it is destroyed, you lose.',
  },
  scavenger: {
    name: 'Scavenger', role: 'harvester', cost: 60, buildTime: 6,
    hp: 180, speed: 43, radius: 13, sight: 200,
    carryMax: 25, gatherRate: 4,
    desc: 'Collects loose scrap and hauls it home. Cannot deploy onto geysers (that needs a Scavenger II).',
  },
  // Built by an upgraded Recycler (Recycler II). Only these can become Extractors.
  scavenger2: {
    name: 'Scavenger II', base: 'scavenger', role: 'harvester', slots: [{ type: 'special', allow: ['shield', 'cloak', 'overdrive'] }], cost: 80, buildTime: 7,
    hp: 180, speed: 43, radius: 13, sight: 200,
    carryMax: 25, gatherRate: 4, canDeploy: true,
    desc: 'Collects loose scrap, and can deploy onto a scrap geyser to become an Extractor.',
  },
  constructor: {
    name: 'Constructor', role: 'builder', cost: 80, buildTime: 8,
    hp: 160, speed: 43, radius: 13, sight: 220,
    desc: 'Builds structures. Repairs are the Repair Drone\'s job.',
  },
  // Built by a Recycler II. Slow and armoured; builds only walls and
  // bastions (see WALL).
  heavyBuilder: {
    name: 'Heavy Constructor', role: 'builder', wallBuilder: true, art: 'constructor', cost: 130, buildTime: 10,
    hp: 420, speed: 34, radius: 15, sight: 220,
    desc: 'Builds compound walls and bastions (built by a Recycler II). Slow and armoured.',
  },
  // No longer built (repairs moved to the Repair Drone); kept so old saves load.
  constructor2: {
    name: 'Constructor II', base: 'constructor', role: 'builder', cost: 110, buildTime: 9,
    hp: 200, speed: 43, radius: 13, sight: 220,
    desc: 'Builds structures.',
  },
  // Built by a Recycler II. Repairs buildings and vehicles, as fast as a
  // Hornet; set to Auto repair it goes wherever something needs fixing.
  drone: {
    name: 'Repair Drone', role: 'repairer', cost: 90, buildTime: 8,
    hp: 150, speed: 68, radius: 10, sight: 240, repairRate: 30, repairReach: 55,
    desc: 'Repairs your buildings and vehicles (30 health a second). Tap something damaged, or set it to Auto repair and it finds work on its own.',
  },
  // No gun. A shield soaks up damage first and recharges once out of combat.
  scout: {
    name: 'Scout', role: 'combat', slots: [{ type: 'gun', count: 1, field: 'weapon', stock: 'Minigun' }], cost: 50, buildTime: 5,
    hp: 140, speed: 98, radius: 11, sight: 330,
    weapon: { range: 170, damage: 8, cooldown: 0.35, projectile: 'bullet', vsBuilding: 0.5 },
    desc: 'Fast and far-sighted. Can scout the map on its own or as a roaming pack.',
  },
  tank: {
    name: 'Tank', role: 'combat', slots: [{ type: 'cannon', count: 1, field: 'weapon', stock: 'Heavy Cannon' }], cost: 100, buildTime: 9,
    hp: 400, speed: 40, radius: 15, sight: 260,
    weapon: { range: 200, damage: 34, cooldown: 1.2, projectile: 'shell', vsBuilding: 1 },
    desc: 'The backbone of your army. Tough, steady damage. Can patrol between your buildings.',
  },
  artillery: {
    name: 'Artillery', role: 'combat', slots: [{ type: 'artillery', count: 1, field: 'weapon', stock: 'Howitzer' }], cost: 140, buildTime: 12,
    hp: 200, speed: 32, radius: 15, sight: 220,
    weapon: { range: 440, minRange: 110, damage: 60, cooldown: 3.85, projectile: 'artillery',
              splash: 55, vsBuilding: 1.6 },
    deployToFire: true,
    desc: 'Huge range, splash damage, very slow. Needs scouts to see targets. Can dig in to defend a building.',
  },
  // Light rocket tank: between a Scout and a Tank on cost, armour, speed and punch.
  hornet: {
    name: 'Hornet', role: 'combat', slots: [{ type: 'rocket', count: 1, field: 'weapon', stock: 'Rockets' }], cost: 75, buildTime: 7,
    hp: 250, speed: 68, radius: 13, sight: 280,
    weapon: { range: 220, damage: 26, cooldown: 0.9, projectile: 'rocket', vsBuilding: 1.2 },
    desc: 'Light rocket tank, between a Scout and a Tank: cheaper and much faster than a Tank, with less armour, and its rockets hit hard.',
  },
  // The heavy: tougher than a Tank and slower (Artillery speed), twice the price,
  // with two turrets that fire at two targets at once: a Tank's cannon in
  // front and a Sentry's minigun behind.
  heavy: {
    name: 'Juggernaut', role: 'combat', slots: [{ type: 'cannon', count: 1, field: 'weapon', stock: 'Heavy Cannon' }, { type: 'gun', count: 1, field: 'weapon2', turret: 2, stock: 'Minigun' }], cost: 200, buildTime: 14,
    hp: 715, speed: 32, radius: 18, sight: 270,
    weapon: { range: 200, damage: 34, cooldown: 1.2, projectile: 'shell', vsBuilding: 1 },
    weapon2: { range: 220, damage: 7, cooldown: 0.2, projectile: 'bullet', vsBuilding: 0.6 },
    desc: 'Heavy tank: more armour than a Tank but slower, with two turrets: a cannon in front and a minigun behind, each picking its own target.',
  },
  // Mobile turret, purely defensive: Deploy it and it digs in where it stands,
  // fires a rapid stream at anything in range and never moves or gives chase
  // until it is packed up again. It cannot fire while packed up.
  sentry: {
    name: 'Sentry', role: 'combat', slots: [{ type: 'gun', count: 2, field: 'weapon', stock: 'Twin Miniguns' }], cost: 90, buildTime: 8,
    hp: 320, speed: 36, radius: 12, sight: 260, deployToFire: true, deployable: true,
    weapon: { range: 220, damage: 7, cooldown: 0.2, projectile: 'bullet', vsBuilding: 0.6 },
    desc: 'Defensive turret on tracks. Press Deploy and it digs in where it stands, then guards that spot with a rapid stream of fire. It never chases, and cannot fire until deployed.',
  },
  // Mk II versions: researched at a Research Lab, built by a Factory II.
  // About +50% armour, +40% damage and some speed for +45% cost, so each is
  // worth more per scrap than its basic version, plus one signature edge:
  // Scout sees further, Hornet fires a third rocket, Tank and Sentry
  // outrange the basic Tank, Artillery reaches further with a bigger blast.
  scout2: {
    name: 'Scout Mk II', base: 'scout', requires: 'scout2', role: 'combat', slots: [{ type: 'gun', count: 1, field: 'weapon', stock: 'Minigun' }, { type: 'special' }], cost: 70, buildTime: 7,
    hp: 210, speed: 120, radius: 11, sight: 420,
    weapon: { range: 170, damage: 11, cooldown: 0.35, projectile: 'bullet', vsBuilding: 0.5 },
    desc: 'Upgraded Scout: tougher and faster, and it sees much further, so it spots for Artillery from safety.',
  },
  tank2: {
    name: 'Tank Mk II', base: 'tank', requires: 'tank2', role: 'combat', slots: [{ type: 'cannon', count: 1, field: 'weapon', stock: 'Heavy Cannon' }, { type: 'gun', count: 2, field: 'gunWeapon', stock: 'Coaxial Machine Guns' }], cost: 145, buildTime: 12,
    hp: 620, speed: 46, radius: 15, sight: 260,
    weapon: { range: 220, damage: 48, cooldown: 1.2, projectile: 'shell', vsBuilding: 1 },
    gunWeapon: { range: 180, damage: 12, cooldown: 0.4, projectile: 'bullet', vsBuilding: 0.4, vsLight: 1.6, vsHeavy: 0.5 },
    desc: 'Upgraded Tank: much heavier armour and a bigger gun that outranges a basic Tank.',
  },
  // Juggernaut Mk II: both turrets get twin barrels (double cannon, double
  // minigun) for the usual +40% damage, with +50% armour and a little speed.
  heavy2: {
    name: 'Juggernaut Mk II', base: 'heavy', requires: 'heavy2', role: 'combat', slots: [{ type: 'cannon', count: 2, field: 'weapon', stock: 'Twin Heavy Cannons' }, { type: 'gun', count: 3, field: 'weapon2', turret: 2, stock: 'Triple Miniguns' }, { type: 'special' }], cost: 290, buildTime: 18,
    hp: 1073, speed: 36, radius: 18, sight: 270,
    weapon: { range: 220, damage: 48, cooldown: 1.2, projectile: 'shell', vsBuilding: 1 },
    weapon2: { range: 240, damage: 10, cooldown: 0.2, projectile: 'bullet', vsBuilding: 0.6 },
    desc: 'Upgraded Juggernaut: twin cannons on the front turret and twin miniguns on the back one, much heavier armour, and guns that outrange a basic Tank.',
  },
  artillery2: {
    name: 'Artillery Mk II', base: 'artillery', requires: 'artillery2', role: 'combat', slots: [{ type: 'artillery', count: 1, field: 'weapon', stock: 'Howitzer' }, { type: 'special' }], cost: 200, buildTime: 16,
    hp: 300, speed: 36, radius: 15, sight: 220,
    weapon: { range: 500, minRange: 110, damage: 80, cooldown: 3.85, projectile: 'artillery',
              splash: 70, vsBuilding: 1.6 },
    deployToFire: true,
    desc: 'Upgraded Artillery: tougher, reaches further and has a bigger blast.',
  },
  hornet2: {
    name: 'Hornet Mk II', base: 'hornet', requires: 'hornet2', role: 'combat', slots: [{ type: 'rocket', count: 1, field: 'weapon', stock: 'Rockets' }], cost: 110, buildTime: 9,
    hp: 380, speed: 80, radius: 13, sight: 280,
    weapon: { range: 240, damage: 36, cooldown: 0.9, projectile: 'rocket', vsBuilding: 1.2 },
    desc: 'Upgraded Hornet: a third rocket, more armour and more speed.',
  },
  sentry2: {
    name: 'Sentry Mk II', base: 'sentry', requires: 'sentry2', role: 'combat', slots: [{ type: 'gun', count: 2, field: 'weapon', stock: 'Twin Miniguns' }], cost: 130, buildTime: 11,
    hp: 500, speed: 40, radius: 12, sight: 280, deployToFire: true, deployable: true,
    weapon: { range: 250, damage: 10, cooldown: 0.2, projectile: 'bullet', vsBuilding: 0.6 },
    desc: 'Upgraded Sentry: heavier armour, harder-hitting, and once dug in it outranges a Tank.',
  },
};

// What a Research Lab can research. Each one unlocks a Mk II unit, which a
// Factory II can then build.
const RESEARCH = {
  scout2:     { name: 'Advanced Scouts',    cost: 150, time: 45 },
  tank2:      { name: 'Advanced Tanks',     cost: 200, time: 60 },
  artillery2: { name: 'Advanced Artillery', cost: 250, time: 75 },
  hornet2:    { name: 'Advanced Hornets',   cost: 175, time: 50 },
  sentry2:    { name: 'Advanced Sentries',  cost: 175, time: 50 },
  heavy2:     { name: 'Advanced Juggernauts', cost: 225, time: 65 },
  // Unlocks a building rather than a vehicle (BUILDING_TYPES.shield.requires).
  shields:    { name: 'Forcefield Tech',    cost: 250, time: 60, unlocks: 'Shield Projectors' },
  // Lets you hand a battle group to one of its vehicles to lead (see COMMAND).
  command:    { name: 'Field Command',      cost: 250, time: 60, unlocks: 'commanders: hand up to 2 battle groups to a vehicle to lead' },
  // Weapons, researched at an Armory: added from WEAPONS below.
};

// ---------------------------------------------------------------------------
// Hardpoints and Armory weapons (November 2026).
//
// Every armed vehicle and tower has hardpoints (UNIT_TYPES.*.slots): Cannon,
// Gun, Rocket / Missile, Artillery or Special, each with a count (how many
// of that weapon fire together: a Sentry's two miniguns, a Juggernaut Mk
// II's three). Every slot but Special comes with a stock weapon; the Armory
// researches better ones, fitted with Loadouts (Factory, Recycler) or, for
// towers, once per tower. Mk II vehicles unlock extra hardpoints.
//
// Most vehicles have one turret and use one weapon at a time, picking the
// one that suits the target. The Juggernaut has two turrets (cannons and
// guns) firing together. Specials are abilities that work alongside.
//
// A weapon changes its slot's stock weapon by these factors, so it suits
// every platform and a Mk II stays stronger:
//   damage, cooldown, rangeMul, splashMul, minRangeMul, spreadMul multiply;
//   rangeAdd adds; everything else replaces. vsHeavy / vsLight multiply the
//   stock's own (heavy targets: Tanks, Juggernauts, Sentries, Artillery, the
//   Recycler; everything else is light). Flags: homing (ignores how fast the
//   target moves), unguided, sure (never misses), pierceShield, salvo (shots
//   per trigger pull, salvoGap seconds apart), emp (radius: shields drop and
//   vehicles stall for empTime; friendly ones too), smoke / fire (a cloud or
//   a fire left where it lands).
// ---------------------------------------------------------------------------
const HARDPOINTS = {
  cannon: { name: 'Cannon', plural: 'Cannons' }, gun: { name: 'Gun', plural: 'Guns' },
  rocket: { name: 'Rocket / Missile', plural: 'Rockets & Missiles' }, artillery: { name: 'Artillery', plural: 'Artillery' },
  special: { name: 'Special', plural: 'Specials' },
};
const WEAPONS = {
  // Guns
  hmg:      { slot: 'gun', name: 'Heavy Machine Gun', cost: 125, note: 'Shreds light vehicles (+40%); weaker against armour.', mod: { damage: 1.25, vsLight: 1.4, vsHeavy: 0.8 } },
  flamer:   { slot: 'gun', name: 'Flamethrower', cost: 175, note: 'Short range; burns everything around the target. Great against buildings and groups.', mod: { projectile: 'flame', rangeMul: 0.55, damage: 1.8, splash: 40, vsBuilding: 1.5, vsLight: 1.2 } },
  laser:    { slot: 'gun', name: 'Laser', cost: 200, note: 'A beam that never misses, for modest damage. Deadly to fast Scouts and drones.', mod: { projectile: 'laser', damage: 0.85, sure: true, vsLight: 1.15, vsHeavy: 0.8 } },
  flak:     { slot: 'gun', name: 'Flak Gun', cost: 150, note: 'Short-range bursts that hit everything nearby. Good against swarms of light vehicles.', mod: { projectile: 'flak', rangeMul: 0.95, damage: 0.95, splash: 50, vsLight: 1.45, vsHeavy: 0.7 } },
  ap:       { slot: 'gun', name: 'AP Rounds', cost: 150, note: 'Armour-piercing bullets: a gun that hurts heavy armour (+35%).', mod: { vsHeavy: 1.35, vsLight: 0.85 } },
  // Cannons
  sabot:    { slot: 'cannon', name: 'Sabot Cannon', cost: 150, note: 'Armour-piercing: +50% against heavy vehicles, less against light ones.', mod: { damage: 1.1, vsHeavy: 1.5, vsLight: 0.75 } },
  railgun:  { slot: 'cannon', name: 'Railgun', cost: 250, note: 'Long range, huge hits against armour, slow to reload. Wasted on fast light vehicles.', mod: { projectile: 'rail', rangeAdd: 70, damage: 2.4, cooldown: 2.1, vsHeavy: 1.2, vsLight: 0.55, acc: 1.05 } },
  he:       { slot: 'cannon', name: 'HE Cannon', cost: 175, note: 'High-explosive shells with a small blast: good against groups and buildings, and tears into walls.', mod: { vsWall: 1.7, damage: 1.0, splash: 40, vsLight: 1.25, vsHeavy: 0.8, vsBuilding: 1.3 } },
  autocannon: { slot: 'cannon', name: 'Autocannon', cost: 150, note: 'A smaller cannon that fires fast: between a gun and a cannon.', mod: { damage: 0.38, cooldown: 0.36, acc: 1.05, vsLight: 1.15 } },
  plasma:   { slot: 'cannon', name: 'Plasma Cannon', cost: 375, researchTime: 150, buildMul: 1.2, note: 'High-end: a slow glowing shot with a big blast that passes straight through shields. Vehicles carrying it cost 20% more to build. Walls shrug it off (half damage).', mod: { vsWall: 0.5, projectile: 'plasma', damage: 1.5, cooldown: 1.6, splash: 40, pierceShield: true, vsBuilding: 1.2 } },
  // Rockets and missiles (rockets fly straight; missiles home in)
  battery:  { slot: 'rocket', name: 'Rocket Battery', cost: 200, note: 'Three unguided rockets in quick succession: a big hit, a long reload.', mod: { projectile: 'rocket', unguided: true, homing: false, salvo: 3, salvoGap: 0.12, damage: 0.66, cooldown: 1.9, vsHeavy: 1.1, vsBuilding: 1.3 } },
  swarm:    { slot: 'rocket', name: 'Swarm Missiles', cost: 150, note: 'Paired homing missiles, good against armour (+30%).', mod: { projectile: 'missile', homing: true, salvo: 2, damage: 0.65, cooldown: 1.15, vsHeavy: 1.3 } },
  guided:   { slot: 'rocket', name: 'Guided Missile', cost: 225, note: 'One long-range homing missile that hits heavy armour hard.', mod: { projectile: 'missile', homing: true, rangeAdd: 80, damage: 2.2, cooldown: 3.0, vsHeavy: 1.4, vsLight: 0.7 } },
  thermobaric: { slot: 'rocket', name: 'Thermobaric Rocket', cost: 200, note: 'A slow unguided rocket with a huge blast: groups and bases.', mod: { projectile: 'rocket', unguided: true, homing: false, damage: 1.4, cooldown: 2.5, splash: 50, vsBuilding: 1.6, vsLight: 1.1 } },
  clusterR: { slot: 'rocket', name: 'Cluster Rockets', cost: 200, note: 'Unguided rockets that burst into bomblets over an area.', mod: { projectile: 'rocket', unguided: true, homing: false, damage: 1.1, cooldown: 2.0, splash: 50, vsLight: 1.2 } },
  empMissile: { slot: 'rocket', name: 'EMP Missile', cost: 250, note: 'Knocks out shields and stalls every vehicle in the blast, yours too. Slow to reload.', mod: { projectile: 'missile', homing: true, damage: 0.5, cooldown: 4.5, emp: 80, empTime: 2.5 } },
  // Artillery
  mortar:   { slot: 'artillery', name: 'Mortar', cost: 150, note: 'Shorter range, fast lobs, splash: chews up light units and Sentries.', mod: { rangeMul: 0.6, minRangeMul: 0.6, damage: 0.7, cooldown: 0.55, splashMul: 0.8, vsLight: 1.4 } },
  clusterA: { slot: 'artillery', name: 'Cluster Shells', cost: 200, note: 'Scatters bomblets over a wide area: hits many targets at once.', mod: { damage: 0.6, splashMul: 1.6, vsLight: 1.3 } },
  bunker:   { slot: 'artillery', name: 'Bunker Buster', cost: 225, note: 'A very slow, very heavy shell that wrecks buildings and walls.', mod: { vsWall: 1.8, damage: 2.5, cooldown: 2.0, splashMul: 0.5, vsBuilding: 2.4, vsLight: 0.6 } },
  guidedA:  { slot: 'artillery', name: 'Guided Shell', cost: 200, note: 'Longer range and pinpoint accuracy, little splash: picks off one target.', mod: { rangeAdd: 60, spreadMul: 0.2, splashMul: 0.5, damage: 1.4, vsHeavy: 1.2 } },
  empShell: { slot: 'artillery', name: 'EMP Shell', cost: 250, note: 'Knocks out shields and stalls every vehicle where it lands, yours too. Slow to reload.', mod: { damage: 0.3, cooldown: 1.6, emp: 85, empTime: 2.5 } },
  smoke:    { slot: 'artillery', name: 'Smoke Shell', cost: 125, note: 'A cloud nobody can see into for 12 seconds: cover an advance or a retreat.', mod: { damage: 0, cooldown: 1.4, smoke: 95, smokeTime: 12 } },
  incendiary: { slot: 'artillery', name: 'Incendiary Shell', cost: 175, note: 'Leaves the ground burning for 8 seconds, hurting enemies in it.', mod: { damage: 0.5, cooldown: 1.2, fire: 60, fireTime: 8, fireDps: 14 } },
  // Specials: abilities that work alongside the weapons (see SPECIALS).
  shock:    { slot: 'special', name: 'Shock Emitter', cost: 200, note: 'Zaps the current target every 2 s, slowing it by 45% for 2.5 s.' },
  cloak:    { slot: 'special', name: 'Cloak', cost: 225, note: 'Invisible to enemy eyes and radar for 8 s at a time (you still see it). Firing breaks it. Used constantly on Stealth.' },
  shield:   { slot: 'special', name: 'Shield', cost: 200, note: 'A close bubble that soaks damage, collapses if overwhelmed, then recharges.' },
  sensor:   { slot: 'special', name: 'Sensor Pulse', cost: 150, note: 'Every 12 s, reveals everything nearby for 4 s, cloaked units and mines too.' },
  pointdef: { slot: 'special', name: 'Point Defence', cost: 200, note: 'Shoots down incoming rockets, missiles and artillery shells nearby.' },
  overdrive:{ slot: 'special', name: 'Overdrive', cost: 150, note: 'A 4-second burst of 60% extra speed to escape or close in (every 18 s).' },
  jammer:   { slot: 'special', name: 'Jammer', cost: 175, note: 'Enemies nearby aim 20% worse and their missiles lose their lock.' },
  mines:    { slot: 'special', name: 'Mine Layer', cost: 175, note: 'Drops hidden mines behind it when enemies are about (three, rearming over time).' },
};
// How each special works.
const SPECIALS = {
  shock:     { range: 180, damage: 6, cooldown: 2, slow: 0.45, slowTime: 2.5 },
  cloak:     { on: 8, off: 7 },
  shield:    { frac: 0.35, delay: 4, regen: 0.08, reboot: 8 },
  sensor:    { every: 12, radius: 340, lasts: 4 },
  pointdef:  { radius: 110, cooldown: 1.2, chance: 0.7 },
  overdrive: { boost: 0.6, time: 4, cooldown: 18 },
  jammer:    { radius: 200, acc: 0.8 },
  mines:     { carry: 3, recharge: 20, damage: 140, splash: 45, arm: 1.5 },
};
const HEAVY_KINDS = ['tank', 'heavy', 'sentry', 'artillery', 'mobileRecycler'];
// Compound walls. `maxRun`: longest wall drawn in one go (tiles). `front`:
// how many squares in front of your wall nothing can be built. A Shield Wall
// (Forcefield Tech) costs `shield.cost` a tile, takes `shield.time` seconds,
// and its field has `shield.hp` a tile; it draws one Generator share per
// `shield.tilesPerPower` tiles. `mountReach`: a tower or radar on a bastion
// sees and shoots this much further. `vsArtillery`: shells hurt walls more.
// Walls snap to square centres and run in one of 8 directions (straight or
// 45°), a whole section (square to square) at a time; `snapReach`: how close
// (in squares) a wall end or bastion pulls the pivot or end onto it.
const WALL = { maxRun: 16, front: 4, angleStep: 45, snapReach: 1.5, mountReach: 1.15, vsArtillery: 1.25,
  shield: { cost: 30, time: 25, hp: 330, tilesPerPower: 6 } };
// Commanders: up to `max` per side (after Field Command research), each
// leading up to `size` vehicles (the commander included). A commander's
// rank lifts the whole group: aim ×(1 + acc × (rank + 1)), reload
// ×(1 - reload × (rank + 1)). A delegated group takes only general orders
// (through its commander) until you take back command. An attack that has lost `fallBack` of its strength falls
// back to regroup, then goes again after `regroup` seconds.
const COMMAND = { max: 2, size: 10, acc: 0.05, reload: 0.04, think: 3, fallBack: 0.55, regroup: 60 };
// Research topics for every weapon (key 'w_' + weapon), done at an Armory.
for (const [k, w] of Object.entries(WEAPONS)) RESEARCH['w_' + k] = { name: w.name, cost: w.cost, time: w.researchTime || Math.round(w.cost * 0.27), weapon: k };
// Stock weapons carry their slot type, name and count; extra stock weapons on
// one turret (a Tank Mk II's machine guns) are listed in altWeapons.
function annotateSlots(def) {
  if (!def.slots) return;
  def.altWeapons = [];
  for (const sl of def.slots) {
    if (sl.type === 'special' || !def[sl.field]) continue;
    Object.assign(def[sl.field], { slot: sl.type, count: sl.count, name: sl.stock });
    if (sl.field !== 'weapon' && sl.turret !== 2) def.altWeapons.push(def[sl.field]);
  }
}

// size is in map squares. produces = units this building can make.
const BUILDING_TYPES = {
  recycler: {
    // Made by deploying the mobile Recycler over a geyser (buildTime = deploy time).
    // It pumps that geyser very slowly: a twentieth of an Extractor.
    name: 'Recycler', cost: 0, buildTime: 10, hp: 4000, size: 3, sight: 300, buildable: false,
    income: 0.035, demolishable: false,
    produces: ['scavenger', 'constructor'], dropoff: true, capacity: 300, buildRadius: 14,
    // Upgrading (production pauses meanwhile) swaps in the better workers.
    upgrade: { name: 'Recycler II', cost: 250, time: 40, hp: 5000,
               produces: ['scavenger2', 'constructor', 'heavyBuilder', 'drone'] },
    weapon: { range: 210, damage: 24, cooldown: 0.8, projectile: 'bullet', vsBuilding: 1 },
    desc: 'Your headquarters, with a light defence gun. Lose it and you lose the battle.',
  },
  factory: {
    name: 'Factory', cost: 150, buildTime: 18, hp: 1400, size: 3, sight: 220,
    produces: ['scout', 'hornet', 'tank', 'heavy', 'sentry', 'artillery'], buildRadius: 10,
    upgrade: { name: 'Factory II', cost: 200, time: 30, hp: 1800,
               produces: ['scout', 'hornet', 'tank', 'heavy', 'sentry', 'artillery', 'scout2', 'hornet2', 'tank2', 'heavy2', 'sentry2', 'artillery2'] },
    desc: 'Builds combat vehicles. Upgrade to Factory II to build researched Mk II vehicles.',
  },
  // Not built by a Constructor: a Scavenger deploys onto a scrap geyser and
  // turns into one. buildTime is how long the deployment takes.
  extractor: {
    name: 'Extractor', cost: 0, buildTime: 8, hp: 900, size: 2, sight: 240,
    income: 0.749, store: 120, buildRadius: 9, buildable: false, salvageValue: 60,
    desc: 'Pumps scrap from a geyser straight into your total. When your storage is full it holds up to 120 until there is room. Upgrade it to an Extractor II for more.',
    // Upgraded: a beefier pump with storage tanks: 40% more scrap, more health, a bigger tank.
    upgrade: { name: 'Extractor II', cost: 200, time: 30, hp: 1500, income: 1.05, store: 180,
               desc: 'Pumps 40% faster (63 scrap a minute instead of 45), holds 180 when storage is full, and is much tougher (1,500 health).' },
  },
  // Built next to the Recycler: raises how much scrap you can hold.
  basesilo: {
    name: 'Base Silo', cost: 250, buildTime: 14, hp: 1100, size: 2, sight: 200,
    capacity: 300, dropoff: true, buildRadius: 8, placeNear: 'recycler', placeRange: 7,
    desc: 'Adds 300 to your scrap storage. Must be built next to your Recycler.',
  },
  lab: {
    name: 'Research Lab', cost: 200, buildTime: 20, hp: 900, size: 2, sight: 200, buildRadius: 6,
    researches: ['scout2', 'tank2', 'artillery2', 'hornet2', 'sentry2', 'heavy2', 'shields', 'command'],
    desc: 'Researches Mk II vehicles (a Factory II can then build them) and Forcefield Tech (Shield Projectors), one at a time.',
  },
  // Researches new weapons; a Factory then fits them to new vehicles (Loadouts).
  armory: {
    name: 'Armory', cost: 200, buildTime: 25, hp: 1000, size: 2, sight: 200, buildRadius: 6,
    researches: [],   // every weapon in WEAPONS: filled in below
    desc: 'Researches new weapons for every hardpoint, one at a time. Fit them with Loadouts at a Factory or Recycler, or to a tower.',
  },
  // Every `every` seconds it pings, revealing a wide circle for `lasts` seconds.
  radar: {
    // Can be built anywhere you have explored, not just in your territory,
    // and gives a small territory of its own (as small as a Lab's), so a
    // lone Radar can anchor Gun Towers far from home.
    name: 'Radar', cost: 150, buildTime: 16, hp: 600, size: 2, sight: 220, buildRadius: 6, anywhere: true,
    ping: { every: 30, radius: 750, lasts: 4 },
    // Upgraded twice, each dearer: much further and twice as often, then a
    // constant feed over a huge circle.
    levels: [
      { name: 'Radar II', cost: 250, time: 30, hp: 800, pingEvery: 15, radius: 1150, desc: 'Reaches much further (1,150 instead of 750) and pings every 15 seconds instead of 30.' },
      { name: 'Radar III', cost: 500, time: 45, hp: 1000, continuous: true, radius: 1600, desc: 'A constant radar feed over a huge circle (1,600): everything in it stays revealed.' },
    ],
    desc: 'Every 30 seconds, a radar ping briefly reveals everything in a wide circle (750, 2.5 times normal sight). Can be built anywhere you have explored, and lets you build around it. Upgrades reach much further: 1,150 pinging every 15 s, then a constant feed over 1,600.',
  },
  // A flat pad vehicles drive onto. Anything parked on it is repaired.
  repairpad: {
    name: 'Repair Pad', cost: 150, buildTime: 12, hp: 800, size: 3, sight: 180, walkable: true,
    repairRate: 30,
    desc: 'Every vehicle parked on the pad is repaired (30 health a second each). Vehicles parked here can be recycled for half their cost.',
  },
  tower: {
    name: 'Gun Tower', cost: 110, buildTime: 14, hp: 1000, size: 2, sight: 300,
    // Gun hardpoint: twin machine guns (same damage a second as the old shell gun).
    slots: [{ type: 'gun', count: 2, field: 'weapon', stock: 'Twin Machine Guns' }],
    weapon: { range: 250, damage: 11, cooldown: 0.45, projectile: 'bullet', vsBuilding: 1 },
    desc: 'Defensive turret. Guards your base and outposts. Can be upgraded to an Artillery Tower or a Heavy Gun Tower.',
    // A finished Gun Tower can be upgraded once, to one of these. Production
    // isn't involved; the tower keeps firing its old gun while it upgrades.
    upgrades: [
      { key: 'arttower', name: 'Artillery Tower', cost: 180, time: 30, hp: 1200,
        slots: [{ type: 'artillery', count: 1, field: 'weapon', stock: 'Howitzer' }],
        weapon: { range: 520, minRange: 120, damage: 70, cooldown: 4.5, projectile: 'artillery', splash: 60, vsBuilding: 1.6 },
        desc: 'Long-range shells with splash damage (range 520). Cannot hit anything closer than 120, and only hits what your side can see. Its weapon becomes an Artillery hardpoint.' },
      { key: 'heavytower', name: 'Heavy Gun Tower', cost: 150, time: 25, hp: 1600,
        slots: [{ type: 'cannon', count: 2, field: 'weapon', stock: 'Twin Heavy Cannons' }],
        weapon: { range: 280, damage: 30, cooldown: 0.6, projectile: 'shell', vsBuilding: 1 },
        desc: 'A tougher bunker with a fast twin heavy cannon and a little more reach (range 280). Its weapon becomes a Cannon hardpoint.' },
    ],
  },
  // --- Compound walls (built by a Heavy Constructor; see WALL) ---------------
  // A wall is drawn as a run of 1x1 pieces with a front (the outside). Nothing
  // can be built in front of your own wall. A gate lets your vehicles through
  // and keeps the enemy out. A bastion carries a Gun Tower or a Radar, which
  // goes down with it.
  wall: {
    name: 'Wall', cost: 35, buildTime: 3, hp: 1500, size: 1, sight: 100, wallPiece: true, anywhere: true, facing: true,
    desc: 'A compound wall: drag it out in a line (a run). Blocks vehicles; enemies must break through it, best with artillery, HE or Bunker Busters (Plasma does half). Nothing can be built in front of it. Upgrade a run to a Shield Wall once you have Forcefield Tech.',
  },
  // No longer built: leave a gap between two bastions instead. Kept so
  // older saved games load.
  gate: {
    buildable: false, name: 'Gate', cost: 110, buildTime: 9, hp: 2600, size: 3, sight: 120, wallPiece: true, gate: true, anywhere: true, facing: true,
    desc: 'Opens for your vehicles and stays shut to the enemy. Put one in your wall so your own vehicles can get out.',
  },
  bastion: {
    name: 'Bastion', cost: 170, buildTime: 14, hp: 4500, size: 3, sight: 160, wallPiece: true, bastion: true, anywhere: true, facing: true,
    desc: 'A thick 3x3 wall tower, centred on a wall (or on its own). A Constructor can build a Gun Tower or a Radar on top (15% more reach from up there); if the bastion falls, so does what is on it.',
  },
  // Powers Shield Projectors: each Generator powers up to `powers` of them,
  // and every powered projector burns `upkeep` scrap a second while its
  // field is up or rebooting.
  generator: {
    name: 'Power Generator', cost: 150, buildTime: 15, hp: 700, size: 2, sight: 180, powers: 4, upkeep: 0.1,
    desc: 'Powers up to 4 Shield Projectors. Each powered projector burns 0.1 scrap a second (6 a minute).',
  },
  // A directional forcefield: a wall of energy in front of the projector that
  // stops enemy shots coming from that side (vehicles drive straight
  // through, and shots from behind pass). Needs power from a Generator.
  shield: {
    name: 'Shield Projector', cost: 180, buildTime: 12, hp: 450, size: 2, sight: 200, facing: true, requires: 'shields',
    field: { length: 200, offset: 58, hp: 1985, regen: 25, regenDelay: 4, reboot: 13.5, rebootHp: 0.35, vsArtillery: 1.5 },
    // Shield Projector II: a wider, tougher field that comes back sooner, but
    // draws a third more power (one Generator runs 3 of them, not 4).
    upgrade: { name: 'Shield Projector II', cost: 200, time: 35, hp: 600, power: 4 / 3,
      field: { length: 280, offset: 58, hp: 2780, regen: 35, regenDelay: 4, reboot: 9, rebootHp: 0.35, vsArtillery: 1.5 },
      desc: 'A field 40% wider (280) and 40% tougher (2,780), back up 9 s after it falls. Draws more power: one Generator runs 3.' },
    desc: 'Needs Forcefield Tech (Research Lab). Projects a forcefield wall that stops enemy fire from the front. Turn it to face the threat while placing it. Build them side by side for a longer wall. Needs a Power Generator (one powers 4). The field can be shot down, then reboots after 13.5 s. Upgrade to Shield Projector II for a wider, tougher field.',
  },
};

// Hotkeys for the command buttons, in the order the buttons appear.
// The game's own page outside claude.ai, if it has one (null if not): the
// Full screen button points players there when full screen isn't allowed.
const STANDALONE_URL = 'https://rhodneylama.github.io/Main/';

// Call-ins (CONFIG.CALLIN_*).
const CALLINS = {
  supply:    { name: 'Supply drop', scrap: 300, desc: '+300 scrap, dropped beside your Recycler (any that doesn\'t fit is left as a pile to collect).' },
  reinforce: { name: 'Reinforcements', units: ['tank', 'tank', 'hornet', 'hornet'], desc: '2 Tanks and 2 Hornets, dropped where you choose on ground you have explored.' },
};

const HOTKEYS = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I'];

// How the computer opponent plays at each difficulty.
//   incomeMult       share of normal scrap income it gets
//   firstAttack      seconds before its first attack on you
//   waveEvery        seconds between attacks after that
//   waveBase/Growth  size of its first attack, and extra units per minute
//   maxArmy          most combat vehicles it will build
//   armyPerMinute    how fast its army may grow (0 = no limit)
//   maxExtractors    how many scrap geysers it will claim
//   maxBaseSilos     how many Base Silos it will build to store more scrap
//   maxScavengers    most scavengers it will build
//   thinkEvery       seconds between decisions (slower = sloppier)
//   artilleryAfter   seconds before it starts building artillery
//   upgradeBaseAfter seconds before it upgrades its Recycler (needed to claim geysers)
//   labAfter         seconds before it builds a Research Lab (0 = never)
//   radarAfter       seconds before it builds a Radar (0 = never)
//   towerUpgradeAfter seconds before it upgrades Gun Towers (0 = never)
//   towerEvery       one Gun Tower at home, then one per this many Extractors
//                    (one per Extractor sank too much scrap into towers on the
//                    bigger map and lost far more games; one per three won most)
//   tactics          battle tactics (null = simple waves, as on Easy). Each was
//                    tested on its own against the previous opponent:
//     hold           seconds during which it holds back and lets the enemy's waves
//                    break on its defences, unless it has beaten one off already
//                    or its army is holdArmy times the wave size (default 2)
//     counter        after beating off an attack, strike back at once once it has
//                    this share of a full wave at home
//     allIn          waves take everything at home, not just the wave size
//     flank          chance a wave swings round the flank with fewer seen defences
//     feint          chance a wave starts with a feigned retreat: two fast
//                    vehicles poke the enemy and lead pursuers into an ambush
//                    (0 on Hard: with combined arms it cost games; the trap
//                    does the same job there)
//     retreatAt      a group out fighting falls back when its strength drops below
//                    this share of the enemy vehicles near it (0 = never)
//     focus          vehicles in a fight shoot the weakest enemy in range
//     raid           sneak raids with spare fast vehicles on workers and outposts;
//                    raidAfter/raidEvery (seconds), raidSize, raidWithWave (raid
//                    round the other flank as a wave goes in), raidRetreat
//     cautious       how much seen defences put a raid off a target
//     repair         seconds before it builds a Repair Pad and sends badly
//                    damaged vehicles there (0 = never; it cost wins in tests)
//     combined       combined-arms assaults: Tanks go in first, Artillery shells
//                    from behind them, Scouts strike elsewhere; each kind also
//                    picks targets for its job in every fight
//     flankers       share of a wave's Scouts that swing round to hit a soft
//                    target (or enemy Artillery) while the Tanks go in
//     adapt          0 to 1: how strongly it changes what it builds to answer
//                    what it has seen of the enemy (towers, artillery)
//     trap           when a group falls back, vehicles at home lie in wait on
//                    its way home for whatever chases it
//     hornetsAfter   seconds before Hornets take half of the fast share of the
//                    army (0 = never); hornetRatio Hornets per Scout (default 1)
//     sentries       how many Sentries it digs in as defences (after
//                    sentriesAfter seconds): the first covers the approach to its
//                    base, the rest its outlying Extractors (over 600 px out)
const DIFFICULTY = {
  easy:   { label: 'Easy',   incomeMult: 0.5,  firstAttack: 600, waveEvery: 240, waveBase: 3, waveGrowth: 0.25,
            maxArmy: 8,  armyPerMinute: 0.7, maxExtractors: 3, maxBaseSilos: 1, maxScavengers: 3, thinkEvery: 2.5, artilleryAfter: 1200, secondFactory: false,
            upgradeBaseAfter: 300, labAfter: 0, radarAfter: 0, towerUpgradeAfter: 0, towerEvery: 2, tactics: null },
  normal: { label: 'Normal', incomeMult: 1.0,  firstAttack: 300, waveEvery: 150, waveBase: 5, waveGrowth: 0.8,
            maxArmy: 25, armyPerMinute: 3, maxExtractors: 6, maxBaseSilos: 2, maxScavengers: 6, thinkEvery: 1.0, artilleryAfter: 240, secondFactory: true,
            upgradeBaseAfter: 120, labAfter: 360, radarAfter: 480, towerUpgradeAfter: 900, towerEvery: 3, shieldsAfter: 540,
            tactics: { hold: 600, holdArmy: 2, counter: 0.6, allIn: true, flank: 0.7, feint: 0.4, retreatAt: 0.5, focus: true,
                       raid: true, raidAfter: 420, raidEvery: 240, raidSize: 3, raidWithWave: true, raidRetreat: 1, cautious: 0.5, repair: 0,
                       combined: true, flankers: 0.5, adapt: 0.5, trap: true,
                       hornetsAfter: 900, sentries: 1, sentriesAfter: 900 } },
  hard:   { label: 'Hard',   incomeMult: 1.35, firstAttack: 180, waveEvery: 100, waveBase: 6, waveGrowth: 1.5,
            maxArmy: 40, armyPerMinute: 0, maxExtractors: 7, maxBaseSilos: 3, maxScavengers: 7, thinkEvery: 0.5, artilleryAfter: 150, secondFactory: true,
            upgradeBaseAfter: 90, labAfter: 240, radarAfter: 360, towerUpgradeAfter: 600, towerEvery: 3, shieldsAfter: 420,
            tactics: { hold: 360, holdArmy: 1.2, counter: 0.6, allIn: true, flank: 0.7, feint: 0, retreatAt: 0.5, focus: true,
                       raid: true, raidAfter: 240, raidEvery: 150, raidSize: 4, raidWithWave: true, raidRetreat: 1.2, cautious: 1, repair: 0,
                       combined: true, flankers: 1, adapt: 1, trap: true,
                       hornetsAfter: 300, sentries: 1, sentriesAfter: 900 } },
};

// Hardpoints: annotate stock weapons, and let the Armory research every weapon.
for (const d of Object.values(UNIT_TYPES)) annotateSlots(d);
annotateSlots(BUILDING_TYPES.tower);
for (const up of BUILDING_TYPES.tower.upgrades) annotateSlots(up);
BUILDING_TYPES.armory.researches = Object.keys(WEAPONS).map(k => 'w_' + k);
