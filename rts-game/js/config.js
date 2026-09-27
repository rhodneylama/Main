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
  MAP_W: 96,           // map width, in squares
  MAP_H: 72,           // map height, in squares
  TICK_RATE: 30,       // game updates per second

  START_SCRAP: 300,    // scrap each side starts with (the Recycler's storage is full)
  UNIT_CAP: 50,        // most units a side can have at once

  WRECK_SCRAP_FRACTION: 0.3, // share of a destroyed unit's cost left as salvage
  SCRAP_NODE_AMOUNT: 400,    // scrap in each fresh scrap pile
};

const TEAMS = {
  1: { name: 'Blue Command', color: '#4aa3ff', dark: '#1b4a78', light: '#a9d4ff' },
  2: { name: 'Red Legion',   color: '#ff5a4a', dark: '#7a2018', light: '#ffb0a6' },
};

// role: 'harvester' collects scrap, 'builder' constructs buildings,
//       'combat' fights. Weapons: range and sight are in pixels.
// Speeds (pixels per second) follow a chain: Transport is the slowest worker,
// Scavengers are 10% faster, Constructors match Scavengers. Artillery is
// kept the slowest of all.
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
  transport: {
    name: 'Transport', role: 'hauler', cost: 70, buildTime: 7,
    hp: 120, speed: 39, radius: 14, sight: 200,
    carryMax: 60, shield: 150, shieldRegen: 20, shieldDelay: 3,
    desc: 'Ferries scrap from Extractors that have no Extractor Silo back to base. Unarmed, but shielded.',
  },
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
    desc: 'Huge range, splash damage, very slow. Needs scouts to see targets. Can dig in to defend a building.',
  },
  // Mk II versions: researched at a Research Lab, built by a Factory II.
  // Roughly +40% armour, +30% damage, +20% speed, for +50% cost.
  scout2: {
    name: 'Scout Mk II', base: 'scout', requires: 'scout2', role: 'combat', cost: 75, buildTime: 7,
    hp: 196, speed: 118, radius: 11, sight: 330,
    weapon: { range: 170, damage: 10, cooldown: 0.35, projectile: 'bullet', vsBuilding: 0.5 },
    desc: 'Upgraded scout: tougher, harder-hitting and faster.',
  },
  tank2: {
    name: 'Tank Mk II', base: 'tank', requires: 'tank2', role: 'combat', cost: 150, buildTime: 12,
    hp: 560, speed: 48, radius: 15, sight: 260,
    weapon: { range: 200, damage: 44, cooldown: 1.2, projectile: 'shell', vsBuilding: 1 },
    desc: 'Upgraded tank: heavier armour, bigger gun, faster tracks.',
  },
  artillery2: {
    name: 'Artillery Mk II', base: 'artillery', requires: 'artillery2', role: 'combat', cost: 210, buildTime: 16,
    hp: 280, speed: 38, radius: 15, sight: 220,
    weapon: { range: 440, minRange: 110, damage: 78, cooldown: 3.5, projectile: 'artillery',
              splash: 55, vsBuilding: 1.6 },
    desc: 'Upgraded artillery: tougher, harder-hitting, a little quicker.',
  },
};

// What a Research Lab can research. Each one unlocks a Mk II unit, which a
// Factory II can then build.
const RESEARCH = {
  scout2:     { name: 'Advanced Scouts',    cost: 150, time: 45 },
  tank2:      { name: 'Advanced Tanks',     cost: 200, time: 60 },
  artillery2: { name: 'Advanced Artillery', cost: 250, time: 75 },
};

// size is in map squares. produces = units this building can make.
const BUILDING_TYPES = {
  recycler: {
    // Made by deploying the mobile Recycler over a geyser (buildTime = deploy time).
    // It pumps that geyser very slowly: a twentieth of an Extractor.
    name: 'Recycler', cost: 0, buildTime: 10, hp: 4000, size: 3, sight: 300, buildable: false,
    income: 0.05, demolishable: false,
    produces: ['scavenger', 'constructor', 'transport'], dropoff: true, capacity: 300, buildRadius: 14,
    // Upgrading (production pauses meanwhile) swaps in the better workers.
    upgrade: { name: 'Recycler II', cost: 250, time: 40, hp: 5000,
               produces: ['scavenger2', 'constructor2', 'transport'] },
    weapon: { range: 210, damage: 24, cooldown: 0.8, projectile: 'bullet', vsBuilding: 1 },
    desc: 'Your headquarters, with a light defence gun. Lose it and you lose the battle.',
  },
  factory: {
    name: 'Factory', cost: 150, buildTime: 18, hp: 1400, size: 3, sight: 220,
    produces: ['scout', 'tank', 'artillery'], buildRadius: 10,
    upgrade: { name: 'Factory II', cost: 200, time: 30, hp: 1800,
               produces: ['scout', 'tank', 'artillery', 'scout2', 'tank2', 'artillery2'] },
    desc: 'Builds combat vehicles. Upgrade to Factory II to build researched Mk II vehicles.',
  },
  // Not built by a Constructor: a Scavenger deploys onto a scrap geyser and
  // turns into one. buildTime is how long the deployment takes.
  extractor: {
    name: 'Extractor', cost: 0, buildTime: 8, hp: 900, size: 2, sight: 240,
    income: 1.0, store: 30, buildRadius: 9, buildable: false, salvageValue: 60,
    desc: 'Pumps scrap from a geyser. With an Extractor Silo joined on, scrap goes straight to your total; without one it fills a small tank for Transports.',
  },
  // Built next to the Recycler: raises how much scrap you can hold.
  basesilo: {
    name: 'Base Silo', cost: 250, buildTime: 14, hp: 1100, size: 2, sight: 200,
    capacity: 300, dropoff: true, buildRadius: 8, placeNear: 'recycler', placeRange: 7,
    desc: 'Adds 300 to your scrap storage. Must be built next to your Recycler.',
  },
  // Joined directly onto an Extractor: that Extractor's scrap then goes
  // straight into your total, no Transport needed. Pricey and small.
  outsilo: {
    name: 'Extractor Silo', cost: 500, buildTime: 12, hp: 800, size: 2, sight: 200,
    capacity: 125, dropoff: true, buildRadius: 5, placeNear: 'extractor', adjacent: true,
    desc: 'Must touch an Extractor. Sends its scrap straight to your total and adds 125 storage.',
  },
  lab: {
    name: 'Research Lab', cost: 200, buildTime: 20, hp: 900, size: 2, sight: 200, buildRadius: 6,
    researches: ['scout2', 'tank2', 'artillery2'],
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
    desc: 'Vehicles parked on the pad are repaired (30 health a second each). Transports get their shields back too.',
  },
  tower: {
    name: 'Gun Tower', cost: 110, buildTime: 14, hp: 1000, size: 2, sight: 300,
    weapon: { range: 250, damage: 22, cooldown: 0.9, projectile: 'shell', vsBuilding: 1 },
    desc: 'Defensive turret. Guards your base and outposts.',
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
const DIFFICULTY = {
  easy:   { label: 'Easy',   incomeMult: 0.5,  firstAttack: 600, waveEvery: 240, waveBase: 3, waveGrowth: 0.25,
            maxArmy: 8,  armyPerMinute: 0.7, maxExtractors: 1, maxBaseSilos: 1, maxScavengers: 3, thinkEvery: 2.5, artilleryAfter: 1200, secondFactory: false,
            upgradeBaseAfter: 300, labAfter: 0, radarAfter: 0 },
  normal: { label: 'Normal', incomeMult: 1.0,  firstAttack: 300, waveEvery: 150, waveBase: 5, waveGrowth: 0.8,
            maxArmy: 25, armyPerMinute: 3, maxExtractors: 3, maxBaseSilos: 2, maxScavengers: 6, thinkEvery: 1.0, artilleryAfter: 240, secondFactory: true,
            upgradeBaseAfter: 120, labAfter: 360, radarAfter: 480 },
  hard:   { label: 'Hard',   incomeMult: 1.35, firstAttack: 180, waveEvery: 100, waveBase: 6, waveGrowth: 1.5,
            maxArmy: 40, armyPerMinute: 0, maxExtractors: 4, maxBaseSilos: 3, maxScavengers: 7, thinkEvery: 0.5, artilleryAfter: 150, secondFactory: true,
            upgradeBaseAfter: 90, labAfter: 240, radarAfter: 360 },
};
