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
  MAP_W: 223,          // map width, in squares (182 before it grew by half again in area; 96 originally)
  MAP_H: 168,          // map height, in squares (137 before; 72 originally)
  TICK_RATE: 30,       // game updates per second

  START_SCRAP: 300,    // scrap each side starts with (the Recycler's storage is full)
  UNIT_CAP: 50,        // most units a side can have at once
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
      'Sentry': 'Pylon', 'Sentry Mk II': 'Pylon Mk II',
      'Factory': 'Assembler', 'Factory II': 'Assembler II', 'Extractor': 'Siphon', 'Base Silo': 'Vault Orb',
      'Gun Tower': 'Prism Tower', 'Artillery Tower': 'Prism Lancer', 'Heavy Gun Tower': 'Heavy Prism',
      'Research Lab': 'Archive', 'Radar': 'Sensor Array', 'Repair Pad': 'Mending Lattice',
      'Advanced Scouts': 'Advanced Shards', 'Advanced Tanks': 'Advanced Bulwarks', 'Advanced Artillery': 'Advanced Spires',
      'Advanced Hornets': 'Advanced Talons', 'Advanced Sentries': 'Advanced Pylons',
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

// Formations for group moves (the Formation menu). Vehicles are placed by
// type: heavy (Tanks, Sentries), light (Scouts, Hornets) and soft
// (Artillery and workers). The shapes themselves are in sim.js
// (formationOffsets). 'free' is no formation.
const FORMATIONS = [
  { key: 'free',    name: 'Free',         desc: 'No formation: each vehicle takes the nearest spot and drives at its own speed.' },
  { key: 'column',  name: 'Column',       desc: 'Two abreast: fast units lead, armour in the middle, Artillery and workers at the back. For narrow passes.' },
  { key: 'line',    name: 'Battle line',  desc: 'A wide front: armour shoulder to shoulder, fast units on the wings, Artillery in a row behind.' },
  { key: 'wedge',   name: 'Wedge',        desc: 'A spearhead: armour forms the point and edges, fast units trail the wings, Artillery rides inside the V.' },
  { key: 'box',     name: 'Testudo',      desc: 'A shield ring: armour all round the outside, Artillery and workers safe in the middle.' },
  { key: 'echelon', name: 'Echelon',      desc: 'A staggered diagonal that covers the right flank as it advances, with the guns tucked behind.' },
  { key: 'screen',  name: 'Scout screen', desc: 'Fast units spread wide out front to spot ambushes; armour follows in a block, guns at the rear.' },
];

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
    name: 'Scavenger II', base: 'scavenger', role: 'harvester', cost: 80, buildTime: 7,
    hp: 180, speed: 43, radius: 13, sight: 200,
    carryMax: 25, gatherRate: 4, canDeploy: true,
    desc: 'Collects loose scrap, and can deploy onto a scrap geyser to become an Extractor.',
  },
  constructor: {
    name: 'Constructor', role: 'builder', cost: 80, buildTime: 8,
    hp: 160, speed: 43, radius: 13, sight: 220,
    desc: 'Builds structures. Cannot repair them (that needs a Constructor II).',
  },
  // Built by an upgraded Recycler (Recycler II).
  constructor2: {
    name: 'Constructor II', base: 'constructor', role: 'builder', cost: 110, buildTime: 9,
    hp: 200, speed: 43, radius: 13, sight: 220, repairRate: 25, canRepair: true,
    desc: 'Builds and repairs structures.',
  },
  // No gun. A shield soaks up damage first and recharges once out of combat.
  scout: {
    name: 'Scout', role: 'combat', cost: 50, buildTime: 5,
    hp: 140, speed: 98, radius: 11, sight: 330,
    weapon: { range: 170, damage: 8, cooldown: 0.35, projectile: 'bullet', vsBuilding: 0.5 },
    desc: 'Fast and far-sighted. Can scout the map on its own or as a roaming pack.',
  },
  tank: {
    name: 'Tank', role: 'combat', cost: 100, buildTime: 9,
    hp: 400, speed: 40, radius: 15, sight: 260,
    weapon: { range: 200, damage: 34, cooldown: 1.2, projectile: 'shell', vsBuilding: 1 },
    desc: 'The backbone of your army. Tough, steady damage. Can patrol between your buildings.',
  },
  artillery: {
    name: 'Artillery', role: 'combat', cost: 140, buildTime: 12,
    hp: 200, speed: 32, radius: 15, sight: 220,
    weapon: { range: 440, minRange: 110, damage: 60, cooldown: 3.5, projectile: 'artillery',
              splash: 55, vsBuilding: 1.6 },
    deployToFire: true,
    desc: 'Huge range, splash damage, very slow. Needs scouts to see targets. Can dig in to defend a building.',
  },
  // Light rocket tank: between a Scout and a Tank on cost, armour, speed and punch.
  hornet: {
    name: 'Hornet', role: 'combat', cost: 75, buildTime: 7,
    hp: 250, speed: 68, radius: 13, sight: 280,
    weapon: { range: 220, damage: 26, cooldown: 0.9, projectile: 'rocket', vsBuilding: 1.2 },
    desc: 'Light rocket tank, between a Scout and a Tank: cheaper and much faster than a Tank, with less armour, and its rockets hit hard.',
  },
  // Mobile turret, purely defensive: Deploy it and it digs in where it stands,
  // fires a rapid stream at anything in range and never moves or gives chase
  // until it is packed up again. It cannot fire while packed up.
  sentry: {
    name: 'Sentry', role: 'combat', cost: 90, buildTime: 8,
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
    name: 'Scout Mk II', base: 'scout', requires: 'scout2', role: 'combat', cost: 70, buildTime: 7,
    hp: 210, speed: 120, radius: 11, sight: 420,
    weapon: { range: 170, damage: 11, cooldown: 0.35, projectile: 'bullet', vsBuilding: 0.5 },
    desc: 'Upgraded Scout: tougher and faster, and it sees much further, so it spots for Artillery from safety.',
  },
  tank2: {
    name: 'Tank Mk II', base: 'tank', requires: 'tank2', role: 'combat', cost: 145, buildTime: 12,
    hp: 620, speed: 46, radius: 15, sight: 260,
    weapon: { range: 220, damage: 48, cooldown: 1.2, projectile: 'shell', vsBuilding: 1 },
    desc: 'Upgraded Tank: much heavier armour and a bigger gun that outranges a basic Tank.',
  },
  artillery2: {
    name: 'Artillery Mk II', base: 'artillery', requires: 'artillery2', role: 'combat', cost: 200, buildTime: 16,
    hp: 300, speed: 36, radius: 15, sight: 220,
    weapon: { range: 500, minRange: 110, damage: 80, cooldown: 3.5, projectile: 'artillery',
              splash: 70, vsBuilding: 1.6 },
    deployToFire: true,
    desc: 'Upgraded Artillery: tougher, reaches further and has a bigger blast.',
  },
  hornet2: {
    name: 'Hornet Mk II', base: 'hornet', requires: 'hornet2', role: 'combat', cost: 110, buildTime: 9,
    hp: 380, speed: 80, radius: 13, sight: 280,
    weapon: { range: 240, damage: 36, cooldown: 0.9, projectile: 'rocket', vsBuilding: 1.2 },
    desc: 'Upgraded Hornet: a third rocket, more armour and more speed.',
  },
  sentry2: {
    name: 'Sentry Mk II', base: 'sentry', requires: 'sentry2', role: 'combat', cost: 130, buildTime: 11,
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
};

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
               produces: ['scavenger2', 'constructor2'] },
    weapon: { range: 210, damage: 24, cooldown: 0.8, projectile: 'bullet', vsBuilding: 1 },
    desc: 'Your headquarters, with a light defence gun. Lose it and you lose the battle.',
  },
  factory: {
    name: 'Factory', cost: 150, buildTime: 18, hp: 1400, size: 3, sight: 220,
    produces: ['scout', 'hornet', 'tank', 'sentry', 'artillery'], buildRadius: 10,
    upgrade: { name: 'Factory II', cost: 200, time: 30, hp: 1800,
               produces: ['scout', 'hornet', 'tank', 'sentry', 'artillery', 'scout2', 'hornet2', 'tank2', 'sentry2', 'artillery2'] },
    desc: 'Builds combat vehicles. Upgrade to Factory II to build researched Mk II vehicles.',
  },
  // Not built by a Constructor: a Scavenger deploys onto a scrap geyser and
  // turns into one. buildTime is how long the deployment takes.
  extractor: {
    name: 'Extractor', cost: 0, buildTime: 8, hp: 900, size: 2, sight: 240,
    income: 0.7, store: 120, buildRadius: 9, buildable: false, salvageValue: 60,
    desc: 'Pumps scrap from a geyser straight into your total. When your storage is full it holds up to 120 until there is room.',
  },
  // Built next to the Recycler: raises how much scrap you can hold.
  basesilo: {
    name: 'Base Silo', cost: 250, buildTime: 14, hp: 1100, size: 2, sight: 200,
    capacity: 300, dropoff: true, buildRadius: 8, placeNear: 'recycler', placeRange: 7,
    desc: 'Adds 300 to your scrap storage. Must be built next to your Recycler.',
  },
  lab: {
    name: 'Research Lab', cost: 200, buildTime: 20, hp: 900, size: 2, sight: 200, buildRadius: 6,
    researches: ['scout2', 'tank2', 'artillery2', 'hornet2', 'sentry2'],
    desc: 'Researches Mk II vehicles, one at a time. A Factory II can then build them.',
  },
  // Every `every` seconds it pings, revealing a wide circle for `lasts` seconds.
  radar: {
    name: 'Radar', cost: 150, buildTime: 16, hp: 600, size: 2, sight: 220, buildRadius: 6,
    ping: { every: 30, radius: 750, lasts: 4 },
    desc: 'Every 30 seconds, a radar ping briefly reveals everything in a wide circle (2.5 times normal sight).',
  },
  // A flat pad vehicles drive onto. Anything parked on it is repaired.
  repairpad: {
    name: 'Repair Pad', cost: 150, buildTime: 12, hp: 800, size: 3, sight: 180, walkable: true,
    repairRate: 30,
    desc: 'Every vehicle parked on the pad is repaired (30 health a second each). Vehicles parked here can be recycled for half their cost.',
  },
  tower: {
    name: 'Gun Tower', cost: 110, buildTime: 14, hp: 1000, size: 2, sight: 300,
    weapon: { range: 250, damage: 22, cooldown: 0.9, projectile: 'shell', vsBuilding: 1 },
    desc: 'Defensive turret. Guards your base and outposts. Can be upgraded to an Artillery Tower or a Heavy Gun Tower.',
    // A finished Gun Tower can be upgraded once, to one of these. Production
    // isn't involved; the tower keeps firing its old gun while it upgrades.
    upgrades: [
      { key: 'arttower', name: 'Artillery Tower', cost: 180, time: 30, hp: 1200,
        weapon: { range: 520, minRange: 120, damage: 70, cooldown: 4.5, projectile: 'artillery', splash: 60, vsBuilding: 1.6 },
        desc: 'Long-range shells with splash damage (range 520). Cannot hit anything closer than 120, and only hits what your side can see.' },
      { key: 'heavytower', name: 'Heavy Gun Tower', cost: 150, time: 25, hp: 1600,
        weapon: { range: 280, damage: 30, cooldown: 0.6, projectile: 'shell', vsBuilding: 1 },
        desc: 'A tougher bunker with a fast twin cannon and a little more reach (range 280).' },
    ],
  },
};

// Hotkeys for the command buttons, in the order the buttons appear.
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
//                    (2: one per Extractor sank too much scrap into towers on
//                    the bigger map and lost far more games)
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
            upgradeBaseAfter: 120, labAfter: 360, radarAfter: 480, towerUpgradeAfter: 900, towerEvery: 2,
            tactics: { hold: 600, holdArmy: 2, counter: 0.6, allIn: true, flank: 0.7, feint: 0.4, retreatAt: 0.5, focus: true,
                       raid: true, raidAfter: 420, raidEvery: 240, raidSize: 3, raidWithWave: true, raidRetreat: 1, cautious: 0.5, repair: 0,
                       combined: true, flankers: 0.5, adapt: 0.5, trap: true,
                       hornetsAfter: 900, sentries: 1, sentriesAfter: 900 } },
  hard:   { label: 'Hard',   incomeMult: 1.35, firstAttack: 180, waveEvery: 100, waveBase: 6, waveGrowth: 1.5,
            maxArmy: 40, armyPerMinute: 0, maxExtractors: 7, maxBaseSilos: 3, maxScavengers: 7, thinkEvery: 0.5, artilleryAfter: 150, secondFactory: true,
            upgradeBaseAfter: 90, labAfter: 240, radarAfter: 360, towerUpgradeAfter: 600, towerEvery: 3,
            tactics: { hold: 360, holdArmy: 1.2, counter: 0.6, allIn: true, flank: 0.7, feint: 0, retreatAt: 0.5, focus: true,
                       raid: true, raidAfter: 240, raidEvery: 150, raidSize: 4, raidWithWave: true, raidRetreat: 1.2, cautious: 1, repair: 0,
                       combined: true, flankers: 1, adapt: 1, trap: true,
                       hornetsAfter: 300, sentries: 1, sentriesAfter: 900 } },
};
