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

  START_SCRAP: 300,    // scrap each side starts with
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
const UNIT_TYPES = {
  scavenger: {
    name: 'Scavenger', role: 'harvester', cost: 60, buildTime: 6,
    hp: 180, speed: 70, radius: 13, sight: 200,
    carryMax: 35, gatherRate: 7,
    desc: 'Collects loose scrap and hauls it home. Can deploy onto a scrap geyser to become an Extractor.',
  },
  constructor: {
    name: 'Constructor', role: 'builder', cost: 80, buildTime: 8,
    hp: 160, speed: 66, radius: 13, sight: 220, repairRate: 25,
    desc: 'Builds and repairs structures.',
  },
  scout: {
    name: 'Scout', role: 'combat', cost: 50, buildTime: 5,
    hp: 140, speed: 130, radius: 11, sight: 330,
    weapon: { range: 170, damage: 8, cooldown: 0.35, projectile: 'bullet', vsBuilding: 0.5 },
    desc: 'Fast and far-sighted. Can scout the map on its own or as a roaming pack.',
  },
  tank: {
    name: 'Tank', role: 'combat', cost: 100, buildTime: 9,
    hp: 400, speed: 80, radius: 15, sight: 260,
    weapon: { range: 200, damage: 34, cooldown: 1.2, projectile: 'shell', vsBuilding: 1 },
    desc: 'The backbone of your army. Tough, steady damage. Can patrol between your buildings.',
  },
  artillery: {
    name: 'Artillery', role: 'combat', cost: 140, buildTime: 12,
    hp: 200, speed: 42, radius: 15, sight: 220,
    weapon: { range: 440, minRange: 110, damage: 60, cooldown: 3.5, projectile: 'artillery',
              splash: 55, vsBuilding: 1.6 },
    desc: 'Huge range, splash damage, very slow. Needs scouts to see targets. Can dig in to defend a building.',
  },
};

// size is in map squares. produces = units this building can make.
const BUILDING_TYPES = {
  recycler: {
    name: 'Recycler', cost: 0, buildTime: 1, hp: 4000, size: 3, sight: 300, buildable: false,
    produces: ['scavenger', 'constructor'], dropoff: true, buildRadius: 14,
    weapon: { range: 210, damage: 24, cooldown: 0.8, projectile: 'bullet', vsBuilding: 1 },
    desc: 'Your headquarters, with a light defence gun. Lose it and you lose the battle.',
  },
  factory: {
    name: 'Factory', cost: 150, buildTime: 18, hp: 1400, size: 3, sight: 220,
    produces: ['scout', 'tank', 'artillery'], buildRadius: 10,
    desc: 'Builds combat vehicles.',
  },
  // Not built by a Constructor: a Scavenger deploys onto a scrap geyser and
  // turns into one. buildTime is how long the deployment takes.
  extractor: {
    name: 'Extractor', cost: 0, buildTime: 8, hp: 900, size: 2, sight: 240,
    income: 1.2, dropoff: true, buildRadius: 9, buildable: false,
    desc: 'Pumps scrap from a geyser forever. Also a drop-off point, and expands the area you can build in.',
  },
  tower: {
    name: 'Gun Tower', cost: 110, buildTime: 14, hp: 1000, size: 2, sight: 300,
    weapon: { range: 250, damage: 22, cooldown: 0.9, projectile: 'shell', vsBuilding: 1 },
    desc: 'Defensive turret. Guards your base and outposts.',
  },
};

// Hotkeys for the command buttons, in the order the buttons appear.
const HOTKEYS = ['Q', 'W', 'E', 'R', 'T'];

// How the computer opponent plays at each difficulty.
//   incomeMult       share of normal scrap income it gets
//   firstAttack      seconds before its first attack on you
//   waveEvery        seconds between attacks after that
//   waveBase/Growth  size of its first attack, and extra units per minute
//   maxArmy          most combat vehicles it will build
//   armyPerMinute    how fast its army may grow (0 = no limit)
//   maxExtractors    how many scrap geysers it will claim
//   maxScavengers    most scavengers it will build
//   thinkEvery       seconds between decisions (slower = sloppier)
//   artilleryAfter   seconds before it starts building artillery
const DIFFICULTY = {
  easy:   { label: 'Easy',   incomeMult: 0.5,  firstAttack: 600, waveEvery: 240, waveBase: 3, waveGrowth: 0.25,
            maxArmy: 8,  armyPerMinute: 0.7, maxExtractors: 1, maxScavengers: 3, thinkEvery: 2.5, artilleryAfter: 1200, secondFactory: false },
  normal: { label: 'Normal', incomeMult: 1.0,  firstAttack: 300, waveEvery: 150, waveBase: 5, waveGrowth: 0.8,
            maxArmy: 25, armyPerMinute: 3, maxExtractors: 3, maxScavengers: 6, thinkEvery: 1.0, artilleryAfter: 240, secondFactory: true },
  hard:   { label: 'Hard',   incomeMult: 1.35, firstAttack: 180, waveEvery: 100, waveBase: 6, waveGrowth: 1.5,
            maxArmy: 40, armyPerMinute: 0, maxExtractors: 4, maxScavengers: 7, thinkEvery: 0.5, artilleryAfter: 150, secondFactory: true },
};
