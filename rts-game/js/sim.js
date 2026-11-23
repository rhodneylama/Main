// =============================================================================
// sim.js — THE RULES OF THE WORLD
//
// This file runs the battle: moving units, shooting, collecting scrap,
// and building. It never draws anything.
//
// Every player action arrives as a "command" (see issueCommand below). That
// matters for online play later: instead of sending the whole game over the
// internet, each player's computer only needs to send its commands.
// =============================================================================

// The basic kind of a unit: a Tank Mk II is still a 'tank', a Scavenger II a 'scavenger'.
const baseType = e => (e.def && e.def.base) || e.type;
// A building's name, including its upgrade (e.g. 'Factory II').
// A side's name: its faction, plus its colour when both sides chose the same one.
const sideName = (game, t) => FACTIONS[game.teams[t].faction].name +
  (game.teams[1].faction === game.teams[2].faction ? ` (${t === 1 ? 'Blue' : 'Red'})` : '');
// Names are shown in the owner's faction's words ("Tank" is a Bulwark to the Kethra).
const nameOf = e => factionName(e.faction, e.level > 1 && e.def.levels ? e.def.levels[e.level - 2].name : (e.level > 1 && e.def.upgrade) ? e.def.upgrade.name : e.def.name);
// The upgrade a building is working on: its single upgrade (Recycler,
// Factory), or the option it picked (Gun Tower).
// The next upgrade: a chain (`levels`, the Radar), one of several (`upgrades`, the Gun Tower), or the one (`upgrade`).
const upgradeOf = b => b.def.levels ? b.def.levels[b.level - 1] : b.upgradeKey ? (b.def.upgrades || []).find(o => o.key === b.upgradeKey) : b.def.upgrade;
// What a building can make right now (upgraded buildings make more).
const producesOf = b => (b.level > 1 && b.def.upgrade && b.def.upgrade.produces) || b.def.produces || [];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const turnToward = (cur, target, maxStep) => {
  const d = wrapAngle(target - cur);
  return Math.abs(d) <= maxStep ? target : cur + Math.sign(d) * maxStep;
};

// factions: { 1: 'scrapline' | 'kethra', 2: ... } (both Scrapline if left out).
// Campaign battles also pass `mapSeed` (each battlefield keeps its own map
// while every fight there plays out differently) and `bonus`: extra
// vehicles per side, { 1: ['tank', 'hornet'], 2: [...] }, from the
// neighbouring battlefields that side holds.
// `uplinks`: three capture-and-hold points (hold two for UPLINK_WIN seconds
// to win). `tempo`: campaign battles run their economy and production this
// much faster, so a battle takes 10–15 minutes rather than half an hour.
function createGame({ seed = Date.now() % 100000, difficulty = 'normal', aiTeams = [2], factions = {}, mapSeed = seed, bonus = {}, uplinks = false, tempo = 1, mapType = 'wasteland' } = {}) {
  const map = mapType === 'urban' ? generateUrbanMap(mapSeed) : mapType === 'tidal' ? generateTidalMap(mapSeed) : generateMap(mapSeed);
  const game = {
    map, seed, difficulty, aiTeams, mapType,
    rng: makeRng(seed * 7 + 1),
    tick: 0, time: 0,
    entities: [], byId: new Map(), nextId: 1,
    projectiles: [], effects: [], events: [],
    occupied: new Uint8Array(map.W * map.H),
    // Compound walls: which side's wall (or gate) stands on each square, and
    // which piece it is. Rebuilt from the buildings when a game loads.
    wallGrid: new Uint8Array(map.W * map.H), gateGrid: new Uint8Array(map.W * map.H), wallId: new Int32Array(map.W * map.H), wallCount: 0, nextRunId: 1,
    scrap: map.scrap, geysers: map.geysers,
    packs: {}, nextPackId: 1,
    teams: {},
    tempo, drops: [],
    winner: 0,
    ai: {},
  };
  // Which corner each side starts in is decided at random for every game,
  // so neither side can count on a favourable spot.
  const swap = makeRng(seed * 31 + 7)() < 0.5;
  game.corner = { 1: swap ? 2 : 1, 2: swap ? 1 : 2 };
  for (const t of [1, 2]) {
    game.teams[t] = {
      id: t, scrap: CONFIG.START_SCRAP, faction: FACTIONS[factions[t]] ? factions[t] : 'scrapline',
      vis: new Uint8Array(map.W * map.H), explored: new Uint8Array(map.W * map.H),
      incomeMult: (aiTeams.includes(t) ? DIFFICULTY[difficulty].incomeMult : 1) * tempo,
      callins: CONFIG.CALLIN_START, callinProgress: 0,
      stats: { built: 0, lost: 0, killed: 0, scrapGathered: 0 },
      research: {},  // key -> true once researched
      loadouts: {},  // (unused since loadouts moved to each Factory: b.loadouts)
      commands: [],  // commanders and the groups they lead (see COMMAND)
      pings: [],     // active radar reveals: { x, y, r, until }
    };
    // Everyone starts on wheels: the Recycler must be deployed on a geyser.
    const b = map.bases[game.corner[t]];
    const home = { x: (b.x + 0.5) * CONFIG.TILE, y: (b.y + 0.5) * CONFIG.TILE };
    const dir = game.corner[t] === 1 ? 1 : -1;
    const spawn = (type, ox, oy) => addUnit(game, type, t, home.x + ox * dir * CONFIG.TILE, home.y + oy * dir * CONFIG.TILE);
    spawn('mobileRecycler', 0, -1.5);
    spawn('scavenger', 3, -1); spawn('scavenger', 3, 1);
    spawn('constructor', -1, -3);
    spawn('scout', 4, -3); spawn('scout', 5, -2); spawn('tank', 5, -4);
    (bonus[t] || []).forEach((type, i) => addUnitNear(game, type, t, home.x + (2 + (i % 4) * 1.6) * dir * CONFIG.TILE, home.y - (5.5 + Math.floor(i / 4) * 1.6) * dir * CONFIG.TILE));
  }
  if (uplinks) placeUplinks(game);
  updateVisibility(game);
  for (const e of game.entities) if (e.kind === 'unit' && e.def.role === 'harvester') autoHarvest(game, e);
  return game;
}

// ---------------------------------------------------------------------------
// Creating things
// ---------------------------------------------------------------------------

// New things face the middle of the map, whichever corner they're in.
function faceCentre(game, x, y) {
  return Math.atan2(game.map.H * CONFIG.TILE / 2 - y, game.map.W * CONFIG.TILE / 2 - x);
}

function addUnit(game, type, team, x, y) {
  const def = UNIT_TYPES[type];
  const u = {
    id: game.nextId++, kind: 'unit', type, def, team, x, y, faction: game.teams[team].faction,
    hp: def.hp, maxHp: def.hp, radius: def.radius,
    angle: faceCentre(game, x, y), turret: 0,
    order: { type: 'idle', gx: x, gy: y }, path: [], target: null,
    cooldown: 0, carry: 0, stuck: 0, retarget: 0, lastHitBy: null, hitFlash: 0,
    shield: def.shield || 0, shieldWait: 0, shieldFlash: 0,
  };
  u.turret = u.angle;
  if (def.weapon2) { u.turret2 = u.angle; u.cooldown2 = 0; }
  if (def.role === 'repairer') u.order = { type: 'automend', gx: x, gy: y };   // drones start on Auto repair
  game.entities.push(u); game.byId.set(u.id, u);
  return u;
}

// A new vehicle on the nearest open ground to (x, y).
function addUnitNear(game, type, team, x, y) {
  const T = CONFIG.TILE, spot = nearestOpenTile(game, Math.floor(x / T), Math.floor(y / T), 8) || { x: Math.floor(x / T), y: Math.floor(y / T) };
  return addUnit(game, type, team, (spot.x + 0.5) * T, (spot.y + 0.5) * T);
}

function addBuilding(game, type, team, tx, ty, complete) {
  const def = BUILDING_TYPES[type], T = CONFIG.TILE;
  const b = {
    id: game.nextId++, kind: 'building', type, def, team, tx, ty, size: def.size, faction: game.teams[team].faction,
    x: (tx + def.size / 2) * T, y: (ty + def.size / 2) * T, radius: def.size * T / 2,
    hp: complete ? def.hp : def.hp * 0.1, maxHp: def.hp,
    built: complete ? 1 : 0, queue: [], prodTime: 0, stored: 0, level: 1,
    upgrading: null, researching: null, pingTimer: 0,
    rally: null, cooldown: 0, turret: faceCentre(game, (tx + def.size / 2) * T, (ty + def.size / 2) * T),
    target: null, retarget: 0, hitFlash: 0, seen: {},
  };
  if (def.facing) b.facing = snapFacing(b.turret);
  setOccupied(game, b, 1);
  if (def.wallPiece) markWall(game, b, true);
  game.entities.push(b); game.byId.set(b.id, b);
  return b;
}

// Shield Projectors face one of eight directions.
const snapFacing = a => Math.round(a / (Math.PI / 4)) * (Math.PI / 4);

function setOccupied(game, b, delta) {
  if (b.def.walkable || b.def.gate) return;  // vehicles drive over repair pads; gates are handled by gateGrid
  for (let y = b.ty; y < b.ty + b.size; y++)
    for (let x = b.tx; x < b.tx + b.size; x++) game.occupied[y * game.map.W + x] += delta;
}

// --- Compound walls ---
function markWall(game, b, on) {
  const W = game.map.W;
  for (let y = b.ty; y < b.ty + b.size; y++) for (let x = b.tx; x < b.tx + b.size; x++) {
    const i = y * W + x;
    if (on) { if (b.def.gate) game.gateGrid[i] = b.team; else game.wallGrid[i] = b.team; game.wallId[i] = b.id; }
    else if (game.wallId[i] === b.id) { game.gateGrid[i] = 0; game.wallGrid[i] = 0; game.wallId[i] = 0; }
  }
  game.wallCount += on ? 1 : -1;
}
function rebuildWallGrids(game) {
  const N = game.map.W * game.map.H;
  game.wallGrid = new Uint8Array(N); game.gateGrid = new Uint8Array(N); game.wallId = new Int32Array(N); game.wallCount = 0;
  for (const e of game.entities) if (e.kind === 'building' && e.def.wallPiece && e.hp > 0) markWall(game, e, true);
}
// A building leaving the map: its wall squares, and anything on a bastion.
function releaseBuilding(game, e) {
  if (e.def.wallPiece) markWall(game, e, false);
  if (e.mountId) { const m = game.byId.get(e.mountId); if (m && m.hp > 0) { m.hp = 0; m.mountOn = 0; } }   // the bastion falls: what's on it goes too
  if (e.mountOn) { const bs = game.byId.get(e.mountOn); if (bs) bs.mountId = 0; }
  if (e.runShield === e.id) for (const x of game.entities) if (x.runShield === e.id) { x.runShield = 0; x.shieldWall = false; }
}
// The pieces of one wall run, in order along the wall.
function wallRun(game, p) {
  const ax = -Math.sin(p.facing || 0), ay = Math.cos(p.facing || 0);
  return game.entities.filter(e => e.type === 'wall' && e.team === p.team && e.runId === p.runId && e.hp > 0).sort((a, b) => (a.x * ax + a.y * ay) - (b.x * ax + b.y * ay));
}
// The squares of a wall drawn from one square to another: straight, or at
// 45° (with the corners filled, so nothing slips between the pieces).
function wallLine(x0, y0, x1, y1, max = WALL.maxRun) {
  let dx = x1 - x0, dy = y1 - y0;
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const sx = Math.round(Math.cos(a)), sy = Math.round(Math.sin(a));
  const n = Math.min(max - 1, Math.max(Math.abs(dx), Math.abs(dy)));
  const out = [];
  for (let k = 0; k <= n; k++) {
    out.push([x0 + sx * k, y0 + sy * k]);
    if (sx && sy && k < n) out.push([x0 + sx * (k + 1), y0 + sy * k]);
  }
  return out;
}
// Which way a wall drawn from A to B faces: across the line, toward the
// middle of the map unless flipped.
function wallFacing(game, x0, y0, x1, y1, flip) {
  const a = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * (Math.PI / 4) || 0;
  let f = a + Math.PI / 2;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, cx = game.map.W / 2, cy = game.map.H / 2;
  if (Math.cos(f) * (cx - mx) + Math.sin(f) * (cy - my) < 0) f += Math.PI;
  if (flip) f += Math.PI;
  return snapFacing(Math.atan2(Math.sin(f), Math.cos(f)));
}
// Is this footprint in front of one of your walls (where nothing may be built)?
function inFrontOfWall(game, team, tx, ty, size) {
  if (!game.wallCount) return false;
  for (const e of game.entities) {
    if (e.kind !== 'building' || !e.def.wallPiece || e.team !== team || e.hp <= 0) continue;
    const ex = e.tx + e.size / 2, ey = e.ty + e.size / 2;
    if (Math.abs(ex - (tx + size / 2)) > WALL.front + size + 3 || Math.abs(ey - (ty + size / 2)) > WALL.front + size + 3) continue;
    const fx = Math.cos(e.facing || 0), fy = Math.sin(e.facing || 0);
    for (let y = ty; y < ty + size; y++) for (let x = tx; x < tx + size; x++) {
      const vx = x + 0.5 - ex, vy = y + 0.5 - ey, along = vx * fx + vy * fy, side = Math.abs(-vx * fy + vy * fx);
      if (along > e.size / 2 && along <= e.size / 2 + WALL.front && side < e.size / 2 + 0.5) return true;
    }
  }
  return false;
}
// A Constructor building a Gun Tower or Radar on top of one of your bastions.
function bastionAt(game, team, type, tx, ty) {
  if (type !== 'tower' && type !== 'radar') return null;
  return game.entities.find(e => e.team === team && e.def.bastion && e.hp > 0 && Math.abs(e.tx - tx) <= 1 && Math.abs(e.ty - ty) <= 1) || null;
}
// The weapon a tower had before any bastion bonus: its stock gun or its upgrade's.
function stockWeaponOf(b) {
  const def = BUILDING_TYPES[b.type];
  if (b.variant && def.upgrades) { const up = def.upgrades.find(o => o.key === b.variant); if (up) return up.weapon; }
  return def.weapon;
}
// Up on a bastion: sees and shoots further.
function mountBoost(b) {
  const k = WALL.mountReach, def = BUILDING_TYPES[b.type];
  b.def = Object.assign({}, b.def, { sight: Math.round((def.sight || b.def.sight) * k) });
  if (b.def.weapon) b.def.weapon = Object.assign({}, b.def.weapon, { range: Math.round((b.fitted ? makeWeapon(stockWeaponOf(b), b.fitted) : stockWeaponOf(b)).range * k) });
}
// The wall piece (of another side) on this square, if any.
function enemyWallAt(game, team, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= game.map.W || ty >= game.map.H) return null;
  const i = ty * game.map.W + tx;
  if (!((game.wallGrid[i] && game.wallGrid[i] !== team) || (game.gateGrid[i] && game.gateGrid[i] !== team))) return null;
  const e = game.byId.get(game.wallId[i]);
  return e && e.hp > 0 ? e : null;
}

// Messages are written with Scrapline names and put into the team's own words.
function pushEvent(game, team, text, kind = 'info', x, y) {
  if (game.teams[team]) text = factionText(game.teams[team].faction, text);
  game.events.push({ team, text, kind, x, y, time: game.time });
}

// ---------------------------------------------------------------------------
// Scrap storage. A team can only hold as much scrap as its Recycler and Base
// Silos have room for. Anything that would go over the limit waits outside.
// ---------------------------------------------------------------------------

function scrapCapacity(game, team) {
  let cap = 0;
  for (const e of game.entities) {
    if (e.team !== team || !e.def.capacity) continue;
    // A Recycler holds your scrap even while driving or deploying.
    if (e.kind === 'unit' || e.type === 'recycler' || e.built >= 1) cap += e.def.capacity;
  }
  return cap;
}

// Adds up to `amount` scrap to the team's bank. Returns how much fitted.
function bankScrap(game, team, amount, quiet = false) {
  const tm = game.teams[team];
  const room = Math.max(0, scrapCapacity(game, team) - tm.scrap);
  const added = Math.min(room, amount);
  tm.scrap += added; tm.stats.scrapGathered += added;
  if (!quiet && added < amount && game.time - (tm.lastFullWarn || -99) > 20) {
    tm.lastFullWarn = game.time;
    pushEvent(game, team, 'Scrap storage full. Build a Base Silo next to your Recycler.', 'warn');
  }
  return added;
}

// What recycling a vehicle on a Repair Pad gives back: half its cost.
const recycleValue = u => Math.round(u.def.cost * 0.5);
// What a vehicle costs from this Factory: some weapons (Plasma) make it dearer.
function buildCost(b, type) {
  const def = UNIT_TYPES[type], lo = b && b.loadouts && b.loadouts[def.base || type];
  let mul = 1;
  if (lo && def.slots) for (const sl of def.slots) { const w = WEAPONS[lo[sl.type]]; if (w && w.buildMul && fitsSlot(sl, lo[sl.type])) mul *= w.buildMul; }
  return Math.round(def.cost * mul);
}

const isBank = b => b.kind === 'building' && b.built >= 1 && !!b.def.capacity;

// ---------------------------------------------------------------------------
// Building placement rules
// ---------------------------------------------------------------------------

function canPlaceBuilding(game, team, type, tx, ty) {
  const def = BUILDING_TYPES[type], m = game.map;
  const tm = game.teams[team];
  // A Gun Tower or Radar on top of a bastion.
  const bs = game.wallCount ? bastionAt(game, team, type, tx, ty) : null;
  if (bs && bs.tx === tx && bs.ty === ty) {
    if (bs.built < 1) return { ok: false, why: 'Finish the bastion first' };
    if (bs.mountId) return { ok: false, why: 'Something is already on this bastion' };
    return { ok: true, mount: bs.id };
  }
  for (let y = ty; y < ty + def.size; y++) for (let x = tx; x < tx + def.size; x++) {
    if (x < 1 || y < 1 || x >= m.W - 1 || y >= m.H - 1) return { ok: false, why: 'Off the map' };
    const i = y * m.W + x;
    if (!tm.explored[i]) return { ok: false, why: 'Unexplored ground' };
    if (isBlockedTile(game, x, y) || (game.gateGrid && game.gateGrid[i])) return { ok: false, why: 'Something is in the way' };
    if (m.noBuild && m.noBuild[i]) return { ok: false, why: m.tidalMap ? "Can't build on the sand or the causeways: build on solid ground" : "Can't build on the streets: use open lots, plazas and courtyards" };
  }
  // Repair pads don't block vehicles, but nothing can be built on top of one.
  for (const e of game.entities) {
    if (e.kind === 'building' && e.def.walkable &&
        tx < e.tx + e.size && e.tx < tx + def.size && ty < e.ty + e.size && e.ty < ty + def.size)
      return { ok: false, why: 'Something is in the way' };
  }
  for (const g of game.geysers) {
    if (g.tx > tx - 1 && g.tx < tx + def.size + 1 && g.ty > ty - 1 && g.ty < ty + def.size + 1)
      return { ok: false, why: 'Leave scrap geysers free for Extractors' };
  }
  const cx = tx + def.size / 2, cy = ty + def.size / 2;
  for (const e of game.entities) {
    if (e.kind === 'unit' && e.team !== team && dist(e, { x: cx * CONFIG.TILE, y: cy * CONFIG.TILE }) < def.size * CONFIG.TILE)
      return { ok: false, why: 'Enemy units too close' };
  }
  if (def.adjacent) {
    // Must touch one of your finished Extractors (a gap of at most one square).
    const touching = game.entities.some(e => e.team === team && e.type === def.placeNear && e.built >= 1 && footprintGap(e, tx, ty, def.size) <= 1);
    if (!touching) return { ok: false, why: `${def.name}s must be joined right onto one of your Extractors` };
  } else if (def.placeNear) {
    const T = CONFIG.TILE;
    const near = game.entities.some(e => e.team === team && e.type === def.placeNear && e.built >= 1 &&
      Math.hypot(e.x / T - cx, e.y / T - cy) <= def.placeRange + e.size / 2);
    if (!near) return { ok: false, why: `${def.name}s must be built next to ${def.placeNear === 'recycler' ? 'your Recycler' : 'one of your Extractors'}` };
  }
  if (!def.wallPiece && inFrontOfWall(game, team, tx, ty, def.size)) return { ok: false, why: "Can't build in front of your wall (its outside). Build behind it." };
  if (!def.anywhere && !inTerritory(game, team, cx, cy)) return { ok: false, why: 'Outside your territory. Build a Radar out there to extend it.' };
  return { ok: true };
}

// Squares of empty ground between a building and a footprint (0 = touching).
function footprintGap(b, tx, ty, size) {
  const gx = Math.max(0, b.tx - (tx + size), tx - (b.tx + b.size));
  const gy = Math.max(0, b.ty - (ty + size), ty - (b.ty + b.size));
  return Math.max(gx, gy);
}

// Territory: you can only build near your own finished buildings.
function inTerritory(game, team, cx, cy) {
  const T = CONFIG.TILE;
  for (const e of game.entities) {
    if (e.kind !== 'building' || e.team !== team || e.built < 1) continue;
    const r = e.def.buildRadius || 0;
    if (r && Math.hypot(e.x / T - cx, e.y / T - cy) <= r) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Commands — the ONLY way players (human or AI) change the game.
// ---------------------------------------------------------------------------

function issueCommand(game, team, cmd) {
  if (game.winner) return;
  const own = id => { const e = game.byId.get(id); return e && e.team === team && e.hp > 0 ? e : null; };
  let units = (cmd.ids || []).map(own).filter(e => e && e.kind === 'unit');
  // Any new order ends a trip to the Repair Pad (Go repair sets it again
  // below) and a pull-back for repairs.
  for (const u of units) { u.repairTrip = 0; if (cmd.type !== 'stance') { u.retreating = false; u.autoReturn = null; } }
  // Vehicles under a commander take only its orders: yours go through the
  // commander as general orders (Command ▾) until you take back command.
  if (!cmd.byCommander && !/^cmd/.test(cmd.type) && cmd.type !== 'promote' && units.some(u => u.cmdId)) {
    const before = units.length;
    units = units.filter(u => !u.cmdId);
    if (!units.length && before) { pushEvent(game, team, 'Those vehicles are under a commander: give it a general order from its Command menu', 'warn'); return; }
  }
  // Sentries: Dig in stays put; any order that moves it packs it up first.
  if (cmd.type === 'dig' || cmd.type === 'packup') {
    for (const u of units) if (u.def.deployable) {
      u.deployed = cmd.type === 'dig';
      u.order = { type: 'idle', gx: u.x, gy: u.y }; u.path = []; u.target = null;
    }
    return;
  }
  if (['move', 'attack', 'patrol', 'guard', 'scout', 'hunt', 'gorepair'].includes(cmd.type)) {
    // A dug-in Sentry ignores attack orders it can't reach and stays dug in.
    if (cmd.type === 'attack') {
      const t = game.byId.get(cmd.targetId);
      for (const u of units) if (u.def.deployable && u.deployed && t && edgeDist(u, t) <= u.def.weapon.range) u.target = t;
      units = units.filter(u => !(u.def.deployable && u.deployed));
    } else for (const u of units) if (u.def.deployable) u.deployed = false;
  }

  switch (cmd.type) {
    case 'move': {
      const slots = arrivalSlots(game, cmd.x, cmd.y, units);
      // A mixed group of fighting vehicles travels together at the pace of its
      // slowest member, so the fast ones don't arrive alone and get picked off.
      const fighters = units.filter(u => u.def.role === 'combat' && !u.def.deployable);
      const speeds = fighters.map(u => u.def.speed), pace = fighters.length > 1 && Math.max(...speeds) > Math.min(...speeds) * 1.2 ? Math.min(...speeds) : 0;
      units.forEach((u, i) => {
        u.order = { type: 'move', gx: slots[i].x, gy: slots[i].y, attackMove: !!cmd.attackMove, pace: fighters.includes(u) ? pace : 0 };
        u.target = null;
        planPath(game, u, slots[i].x, slots[i].y);
      });
      break;
    }
    case 'attack': {
      const t = game.byId.get(cmd.targetId);
      if (!t || t.team === team) return;
      for (const u of units) if (u.def.weapon) { u.order = { type: 'attack', targetId: t.id }; u.target = t; u.path = []; u.repath = 0; }
      break;
    }
    case 'harvest': {
      const node = game.scrap.find(s => s.id === cmd.nodeId);
      if (!node) return;
      for (const u of units) if (u.def.role === 'harvester') { u.order = { type: 'harvest', nodeId: node.id, phase: 'toNode' }; planPath(game, u, node.x, node.y); }
      break;
    }
    case 'stop':
      for (const u of units) { u.order = { type: 'idle', gx: u.x, gy: u.y }; u.path = []; u.target = null; }
      break;
    case 'build': {
      const def = BUILDING_TYPES[cmd.building];
      if (!def || def.buildable === false) return;
      // Walls, gates and bastions need a Heavy Constructor; everything else a Constructor.
      const u = units.find(x => x.def.role === 'builder' && !!x.def.wallBuilder === !!def.wallPiece);
      if (!u) { if (units.some(x => x.def.role === 'builder')) pushEvent(game, team, def.wallPiece ? 'Walls, gates and bastions are built by a Heavy Constructor (Recycler II)' : 'A Heavy Constructor only builds walls, gates and bastions', 'warn'); return; }
      const tm = game.teams[team];
      if (def.requires && !tm.research[def.requires]) { pushEvent(game, team, `Research ${RESEARCH[def.requires].name} at a Research Lab first`, 'warn'); return; }
      if (tm.scrap < def.cost) { pushEvent(game, team, 'Not enough scrap', 'warn'); return; }
      const check = canPlaceBuilding(game, team, cmd.building, cmd.tx, cmd.ty);
      if (!check.ok) { pushEvent(game, team, check.why, 'warn'); return; }
      tm.scrap -= def.cost;
      const b = addBuilding(game, cmd.building, team, cmd.tx, cmd.ty, false);
      if (def.facing) b.facing = typeof cmd.facing === 'number' ? snapFacing(cmd.facing) : snapFacing(b.turret);
      if (def.gate || def.bastion) b.facing = Math.round(b.facing / (Math.PI / 2)) * (Math.PI / 2);   // gates and bastions square to the map
      if (check.mount) { b.mountOn = check.mount; game.byId.get(check.mount).mountId = b.id; mountBoost(b); }
      u.order = { type: 'build', targetId: b.id };
      planPathNear(game, u, b);
      break;
    }
    case 'buildWall': {
      // A run of wall: one piece per square, paid for as they are laid out,
      // built one after another by the Heavy Constructor.
      const u = units.find(x => x.def.wallBuilder);
      if (!u) { if (units.some(x => x.def.role === 'builder')) pushEvent(game, team, 'Walls are built by a Heavy Constructor (Recycler II)', 'warn'); return; }
      const tm = game.teams[team], def = BUILDING_TYPES.wall;
      const facing = typeof cmd.facing === 'number' ? snapFacing(cmd.facing) : 0, runId = game.nextRunId++;
      const placed = [];
      let short = false;
      for (const [tx, ty] of (cmd.tiles || []).slice(0, WALL.maxRun * 2)) {
        if (tm.scrap < def.cost) { short = true; break; }
        if (!canPlaceBuilding(game, team, 'wall', tx, ty).ok) continue;
        tm.scrap -= def.cost;
        const b = addBuilding(game, 'wall', team, tx, ty, false);
        b.facing = facing; b.runId = runId; placed.push(b.id);
      }
      if (!placed.length) { pushEvent(game, team, short ? 'Not enough scrap' : 'No room for a wall there', 'warn'); return; }
      if (short) pushEvent(game, team, `Not enough scrap: ${placed.length} wall pieces laid out`, 'warn');
      u.order = { type: 'build', targetId: placed[0], queue: placed.slice(1) };
      planPathNear(game, u, game.byId.get(placed[0]));
      break;
    }
    case 'wallShield': {
      // Wall II: a forcefield along the whole run, in front of it.
      const tm = game.teams[team], p = own(cmd.buildingId);
      if (!p || p.type !== 'wall' || !p.runId) return;
      if (!tm.research.shields) { pushEvent(game, team, 'Research Forcefield Tech at a Research Lab first', 'warn'); return; }
      const run = wallRun(game, p);
      if (run.some(x => x.built < 1)) { pushEvent(game, team, 'Finish building the wall first', 'warn'); return; }
      if (run.some(x => x.runShield)) return;
      const n = run.length, cost = n * WALL.shield.cost;
      if (tm.scrap < cost) { pushEvent(game, team, 'Not enough scrap', 'warn'); return; }
      const a = run[0], z = run[n - 1], anchor = run[Math.floor((n - 1) / 2)], T = CONFIG.TILE;
      anchor.fieldAt = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 };
      anchor.def = Object.assign({}, anchor.def, { upgrade: { name: 'Shield Wall', cost, time: WALL.shield.time, hp: anchor.maxHp,
        field: { length: Math.hypot(z.x - a.x, z.y - a.y) + T, offset: 22, hp: n * WALL.shield.hp, regen: 25, regenDelay: 4, reboot: 13.5, rebootHp: 0.35, vsArtillery: 1.5 },
        power: Math.max(1, n / WALL.shield.tilesPerPower) } });
      for (const x of run) x.runShield = anchor.id;
      tm.scrap -= cost; anchor.upgrading = 0; anchor.upgradeKey = null;
      pushEvent(game, team, `Upgrading ${n} wall pieces to a Shield Wall`, 'info', anchor.x, anchor.y);
      break;
    }
    case 'repair': {
      // Drones repair your buildings and vehicles; Constructors only finish
      // construction sites.
      const b = own(cmd.targetId);
      if (!b) return;
      const drones = units.filter(u => u.def.role === 'repairer' && u !== b);
      for (const u of drones) { u.order = { type: 'mend', targetId: b.id }; u.path = []; }
      if (b.kind !== 'building') break;
      const able = units.filter(u => u.def.role === 'builder' && b.built < 1);
      if (!able.length && !drones.length && units.some(u => u.def.role === 'builder')) { pushEvent(game, team, 'Repairs need a Repair Drone (built by a Recycler II)', 'warn'); return; }
      for (const u of able) { u.order = { type: 'build', targetId: b.id }; planPathNear(game, u, b); }
      break;
    }
    case 'follow': {
      // Repair Drones stay with one of your vehicles and keep it repaired.
      const v = own(cmd.targetId);
      if (!v || v.kind !== 'unit') return;
      for (const u of units) if (u.def.role === 'repairer' && u !== v) { u.order = { type: 'follow', targetId: v.id }; u.path = []; }
      break;
    }
    case 'loadout': {
      // Which weapon new vehicles of one kind, built at this Factory (or
      // Recycler), get in one kind of hardpoint. Each building has its own.
      const def = UNIT_TYPES[cmd.unit], tm = game.teams[team], fb = own(cmd.buildingId);
      if (!fb || fb.kind !== 'building' || !fb.def.produces) return;
      const sl = def && def.slots && (def.slots.find(x => x.type === cmd.slot) || Object.values(UNIT_TYPES).filter(d => (d.base || '') === cmd.unit && d.slots).flatMap(d => d.slots).find(x => x.type === cmd.slot));
      if (!sl || !fitsSlot(sl, cmd.weapon)) return;
      if (cmd.weapon !== 'stock' && !tm.research['w_' + cmd.weapon]) { pushEvent(game, team, `Research the ${WEAPONS[cmd.weapon].name} at an Armory first`, 'warn'); return; }
      fb.loadouts = fb.loadouts || {};
      fb.loadouts[cmd.unit] = Object.assign({}, fb.loadouts[cmd.unit], { [cmd.slot]: cmd.weapon });
      break;
    }
    case 'fitTower': {
      // Pick a tower's weapon: once, for good.
      const b = own(cmd.buildingId);
      if (!b || b.kind !== 'building' || !b.def.slots || b.built < 1) return;
      if (b.weaponLocked) { pushEvent(game, team, "This tower's weapon is already fitted for good", 'warn'); return; }
      if (cmd.weapon !== 'stock' && (!fitsSlot(b.def.slots[0], cmd.weapon) || !game.teams[team].research['w_' + cmd.weapon])) return;
      fitTower(game, b, cmd.weapon);
      break;
    }
    case 'promote': {
      // Make one vehicle of a battle group its commander: it leads the group
      // (up to COMMAND.size vehicles, the most experienced first).
      const tm = game.teams[team], c = own(cmd.unitId);
      if (!tm.research.command) { pushEvent(game, team, 'Research Field Command at a Research Lab first', 'warn'); return; }
      if (!c || c.kind !== 'unit' || c.def.role !== 'combat') return;
      if (c.cmdId) { pushEvent(game, team, 'Already under a commander', 'warn'); return; }
      tm.commands = tm.commands || [];
      if (tm.commands.length >= COMMAND.max) { pushEvent(game, team, `You can have ${COMMAND.max} commanders at most`, 'warn'); return; }
      const others = units.filter(u => u !== c && u.def.role === 'combat' && !u.cmdId).sort(byRank).slice(0, COMMAND.size - 1);
      const id = (tm.nextCmdId = (tm.nextCmdId || 0) + 1);
      // It keeps the battle group's number (★1 for battle group 1).
      const k = cmd.n && !tm.commands.some(x => x.n === +cmd.n) ? +cmd.n : [1, 2, 3, 4, 5].find(n => !tm.commands.some(x => x.n === n));
      const group = { id, n: k, cmdrId: c.id, members: [c.id, ...others.map(u => u.id)], order: null, think: 0 };
      tm.commands.push(group);
      for (const u of [c, ...others]) { u.cmdId = id; u.cmdTask = null; }
      pushEvent(game, team, `${c.def.name} takes command of Command ${k} (${group.members.length} vehicles). Give it a general order.`, 'good', c.x, c.y);
      break;
    }
    case 'cmdOrder': {
      // A general order: the commander works out how to carry it out.
      const group = (game.teams[team].commands || []).find(x => x.id === cmd.cmdId);
      if (!group || !['attack', 'hunt', 'guard'].includes(cmd.kind)) return;
      group.order = { kind: cmd.kind, target: cmd.target || 'base' };
      group.style = chooseStyle(game, group); group.plan = null; group.think = 0; group.startPower = groupPower(game, group); group.fallback = 0;
      pushEvent(game, team, `Command ${group.n}: ${STYLE_TEXT[group.style]}`, 'info');
      break;
    }
    case 'cmdAssign': {
      // Put more vehicles under a commander (up to COMMAND.size in all).
      const group = (game.teams[team].commands || []).find(x => x.id === cmd.cmdId);
      if (!group) return;
      let added = 0;
      for (const u of units) {
        if (group.members.length >= COMMAND.size) { pushEvent(game, team, `A commander leads ${COMMAND.size} vehicles at most`, 'warn'); break; }
        if (u.cmdId || u.def.role !== 'combat') continue;
        group.members.push(u.id); u.cmdId = group.id; u.cmdTask = null; added++;
      }
      if (added) { group.plan = null; group.think = 0; }
      break;
    }
    case 'cmdRelease': {
      // Take the group back under your own direct command.
      const tm = game.teams[team], group = (tm.commands || []).find(x => x.id === cmd.cmdId);
      if (!group) return;
      for (const id of group.members) { const u = game.byId.get(id); if (u) { u.cmdId = 0; u.cmdBonus = 0; u.cmdTask = null; } }
      tm.commands = tm.commands.filter(x => x !== group);
      pushEvent(game, team, `Command ${group.n} is back under your direct command`, 'info');
      break;
    }
    case 'autorepair': {
      for (const u of units) if (u.def.role === 'repairer') { u.order = { type: 'automend', gx: u.x, gy: u.y }; u.path = []; }
      break;
    }
    case 'produce': {
      const b = own(cmd.buildingId);
      const def = UNIT_TYPES[cmd.unit];
      if (!b || b.kind !== 'building' || b.built < 1 || !def || !producesOf(b).includes(cmd.unit)) return;
      const tm = game.teams[team];
      if (def.requires && !tm.research[def.requires]) { pushEvent(game, team, `Research ${RESEARCH[def.requires].name} at a Research Lab first`, 'warn'); return; }
      // Queues can be as long as you like. Each vehicle is paid for when its
      // turn comes (see updateBuilding), so a long queue just waits for scrap.
      if (b.queue.length >= CONFIG.QUEUE_MAX) { pushEvent(game, team, 'Build queue is full', 'warn'); return; }
      const n = Math.max(1, Math.min(cmd.count || 1, CONFIG.QUEUE_MAX - b.queue.length));
      for (let i = 0; i < n; i++) b.queue.push(cmd.unit);
      break;
    }
    case 'cancel': {
      // Removes one vehicle from the queue: the last one of `unit` if given
      // (so the one already being built goes last), otherwise the one at
      // `index`. Only the one being built has been paid for, and only it is
      // refunded.
      const b = own(cmd.buildingId);
      if (!b || b.kind !== 'building' || !b.queue.length) return;
      const index = cmd.unit ? b.queue.lastIndexOf(cmd.unit) : cmd.index;
      if (index < 0 || index >= b.queue.length) return;
      const [type] = b.queue.splice(index, 1);
      if (index === 0) {
        if (b.paid) bankScrap(game, team, b.paidCost || UNIT_TYPES[type].cost);
        b.paid = false; b.prodTime = 0;
      }
      break;
    }
    case 'scout': {
      // Several scouts together roam as one pack; otherwise each goes alone.
      const scouts = units.filter(u => u.def.weapon);
      if (cmd.pack && scouts.length > 1) {
        const id = game.nextPackId++;
        game.packs[id] = { target: null, chosenAt: 0, members: scouts.map(u => u.id) };
        scouts.forEach((u, i) => { u.order = { type: 'scout', packId: id, slot: i }; u.path = []; u.target = null; });
      } else {
        for (const u of scouts) { u.order = { type: 'scout', target: null, chosenAt: 0 }; u.path = []; u.target = null; }
      }
      break;
    }
    case 'callin': {
      // Call-ins: a supply drop (scrap, at your Recycler) or reinforcements
      // (vehicles dropped where you choose, on ground your side has explored).
      const tm = game.teams[team], kind = CALLINS[cmd.kind];
      if (!kind || tm.callins < 1) { pushEvent(game, team, 'No call-ins ready', 'warn'); return; }
      let x = cmd.x, y = cmd.y;
      if (cmd.kind === 'supply') {
        const hq = game.entities.find(e => e.team === team && (e.type === 'recycler' || e.type === 'mobileRecycler'));
        if (!hq) return;
        const a = angleTo(hq, { x: game.map.W * CONFIG.TILE / 2, y: game.map.H * CONFIG.TILE / 2 });
        x = hq.x + Math.cos(a) * 110; y = hq.y + Math.sin(a) * 110;
      } else {
        const T = CONFIG.TILE, tx = Math.floor(x / T), ty = Math.floor(y / T);
        if (!(x >= 0 && y >= 0) || !tm.explored[ty * game.map.W + tx] || isBlockedTile(game, tx, ty)) { pushEvent(game, team, 'Reinforcements can only land on open ground you have explored', 'warn'); return; }
      }
      tm.callins--;
      game.drops.push({ team, kind: cmd.kind, x, y, at: game.time + CONFIG.CALLIN_DELAY, cmdr: !!cmd.cmdr });
      game.effects.push({ kind: 'droppod', x, y, t: 0, life: CONFIG.CALLIN_DELAY + 0.6, team });
      pushEvent(game, team, `${kind.name} inbound`, 'good', x, y);
      break;
    }
    case 'stance': {
      // How vehicles behave on the move and when idle (see stanceOf).
      if (!['aggressive', 'return', 'stealth', 'repair'].includes(cmd.stance)) return;
      for (const u of units) if (u.def.weapon) { u.stance = cmd.stance; if (cmd.stance === 'stealth') u.target = null; }
      break;
    }
    case 'hunt': {
      // Seek and destroy: as one pack, or each vehicle on its own.
      const hunters = units.filter(u => u.def.weapon && !u.def.deployable);
      if (cmd.pack && hunters.length > 1) {
        const id = game.nextPackId++;
        game.packs[id] = { hunt: true, target: null, chosenAt: -99, members: hunters.map(u => u.id) };
        hunters.forEach((u, i) => { u.order = { type: 'hunt', packId: id, slot: i }; u.path = []; u.target = null; });
      } else {
        for (const u of hunters) { u.order = { type: 'hunt', goal: null, chosenAt: -99 }; u.path = []; u.target = null; }
      }
      break;
    }
    case 'patrol': {
      const route = patrolRoute(game, team);
      if (!route.length || !units.length) return;
      // Start everyone at the stop nearest the group, so they travel together.
      const cx = units.reduce((a, u) => a + u.x, 0) / units.length, cy = units.reduce((a, u) => a + u.y, 0) / units.length;
      let start = 0, bd = Infinity;
      route.forEach((p, i) => { const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; start = i; } });
      for (const u of units) if (u.def.weapon) { u.order = { type: 'patrol', stop: start }; u.path = []; u.target = null; }
      break;
    }
    case 'guard': {
      const b = own(cmd.targetId);
      if (!b) return;
      const guards = units.filter(u => u.def.weapon && !u.def.deployable && u !== b);
      const T = CONFIG.TILE;
      if (b.kind === 'unit') {
        // Escort another vehicle: each guard keeps its own spot around it.
        guards.forEach((u, i) => {
          u.order = { type: 'guard', targetId: b.id, follow: true, slot: i * 2.39996 + angleTo(b, u) };
          u.target = null; u.path = [];
        });
        break;
      }
      guards.forEach((u, i) => {
        // Spread the defenders evenly around the building.
        const a = angleTo(b, u) + (i - (guards.length - 1) / 2) * (Math.PI * 2 / Math.max(3, guards.length)) * 0.5;
        let px = b.x + Math.cos(a) * (b.radius + 60), py = b.y + Math.sin(a) * (b.radius + 60);
        const t = nearestOpenTile(game, Math.floor(px / T), Math.floor(py / T), 4);
        if (t) { px = (t.x + 0.5) * T; py = (t.y + 0.5) * T; }
        u.order = { type: 'guard', targetId: b.id, px, py }; u.target = null;
        planPath(game, u, px, py);
      });
      break;
    }
    case 'deploy': {
      const g = game.geysers.find(x => x.id === cmd.geyserId);
      // The mobile Recycler takes priority; otherwise the nearest Scavenger goes.
      const hqs = units.filter(u => u.def.role === 'hq');
      const deployers = hqs.length ? hqs : units.filter(u => u.def.canDeploy);
      if (!deployers.length && units.some(u => u.def.role === 'harvester')) {
        pushEvent(game, team, 'Only a Scavenger II can deploy on a geyser. Upgrade your Recycler to build them.', 'warn'); return;
      }
      const scav = deployers.sort((a, b) => dist(a, g) - dist(b, g))[0];
      if (!g || !scav) return;
      if (geyserTaken(game, g)) { pushEvent(game, team, 'That geyser already has an Extractor', 'warn'); return; }
      scav.order = { type: 'deploy', geyserId: g.id }; scav.target = null;
      planPath(game, scav, g.x, g.y);
      break;
    }
    case 'upgrade': {
      const b = own(cmd.buildingId);
      if (!b || b.kind !== 'building' || b.built < 1 || b.upgrading !== null) return;
      if (b.level > (b.def.levels ? b.def.levels.length : 1)) return;
      // Gun Towers choose one of several upgrades; the Radar has a chain; others have just one.
      const up = b.def.levels ? b.def.levels[b.level - 1] : b.def.upgrades ? b.def.upgrades.find(o => o.key === cmd.option) : b.def.upgrade;
      if (!up) return;
      const tm = game.teams[team];
      if (tm.scrap < up.cost) { pushEvent(game, team, 'Not enough scrap', 'warn'); return; }
      tm.scrap -= up.cost;
      b.upgradeKey = b.def.upgrades ? up.key : null;
      b.upgrading = 0;
      pushEvent(game, team, `Upgrading to ${up.name}`, 'info', b.x, b.y);
      break;
    }
    case 'research': {
      const b = own(cmd.buildingId), r = RESEARCH[cmd.key];
      if (!b || b.kind !== 'building' || b.built < 1 || !r || !(b.def.researches || []).includes(cmd.key)) return;
      const tm = game.teams[team];
      if (b.researching) { pushEvent(game, team, 'This lab is already researching', 'warn'); return; }
      const busy = game.entities.some(e => e.team === team && e.researching && e.researching.key === cmd.key);
      if (tm.research[cmd.key] || busy) return;
      if (tm.scrap < r.cost) { pushEvent(game, team, 'Not enough scrap', 'warn'); return; }
      tm.scrap -= r.cost;
      b.researching = { key: cmd.key, t: 0 };
      break;
    }
    case 'gorepair': {
      // Drive to the nearest Repair Pad and park on it.
      const pads = game.entities.filter(e => e.team === team && e.type === 'repairpad' && e.built >= 1);
      if (!pads.length) { pushEvent(game, team, 'Build a Repair Pad first', 'warn'); return; }
      if (!units.length) return;
      const cx = units.reduce((a, u) => a + u.x, 0) / units.length, cy = units.reduce((a, u) => a + u.y, 0) / units.length;
      const pad = pads.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
      issueCommand(game, team, { type: 'move', ids: units.map(u => u.id), x: pad.x, y: pad.y });
      // Remember the trip, so they drive off again once repaired.
      for (const u of units) u.repairTrip = pad.id;
      break;
    }
    case 'rally': {
      const b = own(cmd.buildingId);
      if (b && b.kind === 'building') b.rally = cmd.clear ? null : { x: cmd.x, y: cmd.y };
      break;
    }
    case 'recycle': {
      // Only vehicles parked on one of your Repair Pads can be recycled, and
      // never the Recycler. Half the cost goes back into storage (the same
      // share as demolishing); anything that doesn't fit is left on the pad
      // as loose scrap.
      let value = 0, count = 0, at = null;
      for (const u of units) {
        if (u.def.role === 'hq' || !(u.def.cost > 0)) continue;
        const pad = padUnder(game, u);
        if (!pad) continue;
        const refund = recycleValue(u);
        const banked = bankScrap(game, team, refund, true);
        if (refund - banked > 0) game.scrap.push({ id: 300000 + u.id, x: u.x, y: u.y, amount: refund - banked, max: refund - banked, wreck: true });
        u.recycled = true; u.hp = 0;
        value += refund; count++; at = pad;
      }
      if (!count) { pushEvent(game, team, 'Only vehicles parked on a Repair Pad can be recycled', 'warn'); return; }
      pushEvent(game, team, `${count > 1 ? count + ' vehicles' : 'Vehicle'} recycled for ${value} scrap`, 'good', at.x, at.y);
      break;
    }
    case 'demolish': {
      const b = own(cmd.buildingId);
      if (!b || b.kind !== 'building' || b.def.demolishable === false) return;
      b.demolished = true; b.hp = 0;
      break;
    }
  }
}

// Spread a group out around the clicked point so they don't pile up.
// Like route-finding, this always works from the same half of the map so
// both sides get mirror-image results.
function arrivalSlots(game, x, y, units) {
  if (units.length <= 1) return [{ x, y }];
  const cx = units.reduce((a, u) => a + u.x, 0) / units.length, cy = units.reduce((a, u) => a + u.y, 0) / units.length;
  if (inMirroredHalf(game, cx, cy)) {
    const WW = game.map.W * CONFIG.TILE, HH = game.map.H * CONFIG.TILE;
    const flipped = units.map(u => ({ x: WW - u.x, y: HH - u.y }));
    return arrivalSlotsOn(mirroredView(game), WW - x, HH - y, flipped).map(p => ({ x: WW - p.x, y: HH - p.y }));
  }
  return arrivalSlotsOn(game, x, y, units);
}

function arrivalSlotsOn(game, x, y, units) {
  const spacing = 34, slots = [], used = new Set();
  const T = CONFIG.TILE;
  const cols = Math.ceil(Math.sqrt(units.length));
  const rows = Math.ceil(units.length / cols);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let sx = x + (c - (cols - 1) / 2) * spacing, sy = y + (r - (rows - 1) / 2) * spacing;
    if (isBlockedAt(game, sx, sy)) {
      // Move the slot to the nearest open square no other slot has taken.
      const tx = Math.floor(sx / T), ty = Math.floor(sy / T);
      let best = null, bd = Infinity;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const nx = tx + dx, ny = ty + dy, d = dx * dx + dy * dy;
        if (d < bd && !isBlockedTile(game, nx, ny) && !used.has(nx + ',' + ny)) { bd = d; best = { x: nx, y: ny }; }
      }
      if (best) { used.add(best.x + ',' + best.y); sx = (best.x + 0.5) * T; sy = (best.y + 0.5) * T; }
    }
    slots.push({ x: sx, y: sy });
  }
  // Give each unit the nearest remaining slot.
  const out = [];
  for (const u of units) {
    let bi = 0, bd = Infinity;
    slots.forEach((s, i) => { const d = dist(u, s); if (d < bd) { bd = d; bi = i; } });
    out.push(slots.splice(bi, 1)[0]);
  }
  return out;
}

function planPath(game, u, x, y) {
  // Don't search again straight away for the same spot: many orders ask for a
  // new route every tick while they have none, and on the big map a route
  // that can't be found costs a whole-map search. A failed search waits 2 s
  // before retrying; any other repeat waits half a second.
  const last = u.lastPlan;
  if (last && Math.abs(last.x - x) < 16 && Math.abs(last.y - y) < 16 && game.time - last.t < (last.failed ? 2 : 0.5)) {
    u.path = []; u.stuck = 0;
    return;
  }
  u.path = routeFor(game, u, x, y);
  u.lastPlan = { x, y, t: game.time, failed: !u.path.length };
  u.stuck = 0;
}

// A route for this vehicle: armed vehicles may plan through an enemy wall
// (and break through it on the way); everyone uses their own side's gates.
function routeFor(game, u, x, y) {
  return findPath(game, u.x, u.y, x, y, u.team, !!(u.def.weapon && u.def.role === 'combat'));
}

function planPathNear(game, u, b) {
  // Wall pieces are reached from behind (inside), not along the wall itself.
  const a = b.def && b.def.wallPiece && u.team === b.team ? (b.facing || 0) + Math.PI : angleTo(b, u);
  const r = b.radius + u.radius + 12;
  planPath(game, u, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
}

// ---------------------------------------------------------------------------
// The main update, run TICK_RATE times per second.
// ---------------------------------------------------------------------------

function stepGame(game) {
  if (game.winner) return;
  const dt = 1 / CONFIG.TICK_RATE;
  game.tick++; game.time += dt;
  if (game.map.tidalMap) updateTide(game);
  updateBattlefield(game, dt);
  if (game.tick % 15 === 0) for (const t of [1, 2]) if (game.teams[t].commands && game.teams[t].commands.length) updateCommands(game, t, 0.5);
  // Losing a Base Silo loses whatever no longer fits.
  if (game.tick % 15 === 0) for (const t of [1, 2]) game.teams[t].scrap = Math.min(game.teams[t].scrap, scrapCapacity(game, t));

  // Shuffle the update order every tick so neither side can get a steady
  // head start from always acting first (or last) on some kind of tick.
  buildUnitGrid(game);
  const order = shuffled(game, game.entities);
  for (const e of order) {
    if (e.hp <= 0) continue;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    if (e.kind === 'building') updateBuilding(game, e, dt);
    else updateUnit(game, e, dt);
  }
  separateUnits(game);
  if (game.uplinks && game.tick % 6 === 0) updateUplinks(game, dt * 6);
  updateShields(game, dt);
  if (game.drops && game.drops.length) updateDrops(game);
  updateProjectiles(game, dt);
  removeDead(game);
  if (game.tick % 3 === 0) updateVisibility(game);
  for (const fx of game.effects) fx.t += dt;
  game.effects = game.effects.filter(fx => fx.t < fx.life);
  checkVictory(game);
}

// A copy of the list in random order, using the game's seeded randomness so a
// replay (or the other player's computer, online) gets the same order.
function shuffled(game, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(game.rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function updateBuilding(game, b, dt) {
  if (b.built < 1) {
    // Extractors set themselves up after a Scavenger deploys.
    if (b.selfBuild) {
      b.built = Math.min(1, b.built + dt / b.def.buildTime);
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * dt / b.def.buildTime);
      if (b.built >= 1) pushEvent(game, b.team, `${nameOf(b)} online`, 'good', b.x, b.y);
    }
    return;
  }
  if (b.cooldown > 0) b.cooldown -= dt;  // reload the gun (towers, Recycler)
  if (b.upgrading !== null) {
    // Upgrading: production waits until it's done.
    const up = upgradeOf(b);
    b.upgrading += dt * (game.tempo || 1);
    if (b.upgrading >= up.time) {
      b.upgrading = null; b.level++;
      if (b.def.ping) b.pingTimer = 0;   // an upgraded Radar starts its new rhythm at once
      b.hp += up.hp - b.maxHp; b.maxHp = up.hp;
      if (up.income) b.def = Object.assign({}, b.def, { income: up.income, store: up.store, upgrade: up });   // Extractor II pumps faster
      if (up.field) { b.def = Object.assign({}, b.def, { field: up.field, power: up.power, upgrade: up }); if (b.field && b.field.state === 'up') b.field.hp = Math.min(up.field.hp, b.field.hp * up.field.hp / BUILDING_TYPES.shield.field.hp); }   // Shield Projector II
      if (b.upgradeKey) {
        // A Gun Tower becomes a different kind of tower: new name and gun.
        b.variant = up.key;
        b.def = Object.assign({}, b.def, { name: up.name, weapon: up.weapon, slots: up.slots, desc: up.desc, upgrades: null });
        b.weaponLocked = false; b.fitted = null;   // the new hardpoint gets its own choice
        b.cooldown = 0;
        if (b.mountOn) mountBoost(b);
      }
      if (b.runShield === b.id) for (const x of game.entities) if (x.runShield === b.id) x.shieldWall = true;   // Shield Wall up
      pushEvent(game, b.team, `${up.name} ready`, 'good', b.x, b.y);
    }
  }
  if (b.researching) {
    const r = RESEARCH[b.researching.key];
    b.researching.t += dt * (game.tempo || 1);
    if (b.researching.t >= r.time) {
      game.teams[b.team].research[b.researching.key] = true;
      pushEvent(game, b.team, r.weapon ? `${r.name} ready. Fit it to your vehicles at a Factory: Loadouts.` : r.unlocks ? `${r.name} researched: you can build ${r.unlocks}.` : `${r.name} researched. Build them at a Factory II.`, 'good', b.x, b.y);
      b.researching = null;
    }
  }
  if (b.def.ping) {
    b.pingTimer -= dt;
    const lv = b.level > 1 && b.def.levels ? b.def.levels[b.level - 2] : null;
    if (lv && lv.continuous) {
      // Radar III: a constant feed, renewed twice a second, with a sweep now and then.
      if (b.pingTimer <= 0) {
        b.pingTimer = 0.5;
        game.teams[b.team].pings.push({ x: b.x, y: b.y, r: (lv.radius || b.def.ping.radius) * (b.mountOn ? WALL.mountReach : 1), until: game.time + 0.7 });
      }
    } else if (b.pingTimer <= 0) {
      const p = b.def.ping;
      b.pingTimer = lv && lv.pingEvery ? lv.pingEvery : p.every;
      game.teams[b.team].pings.push({ x: b.x, y: b.y, r: ((lv && lv.radius) || p.radius) * (b.mountOn ? WALL.mountReach : 1), until: game.time + p.lasts });
      updateVisibility(game);
    }
  }
  if (b.def.repairRate) repairOnPad(game, b, dt);
  if (b.type === 'recycler') bankScrap(game, b.team, b.def.income * game.teams[b.team].incomeMult * dt, true);
  else if (b.def.income) pumpExtractor(game, b, dt);
  if (b.queue.length && b.upgrading === null) {
    const def = UNIT_TYPES[b.queue[0]];
    const count = game.entities.filter(e => e.kind === 'unit' && e.team === b.team).length;
    const tm = game.teams[b.team];
    // Pay for the next vehicle when its turn comes; wait until there's enough.
    if (!b.paid) {
      const price = buildCost(b, b.queue[0]);
      if (tm.scrap >= price) { tm.scrap -= price; b.paid = true; b.paidCost = price; b.waiting = false; }
      else b.waiting = true;
    }
    if (!b.paid) { /* waiting for scrap */ }
    else if (count >= CONFIG.UNIT_CAP) { b.blocked = true; }
    else {
      b.blocked = false;
      b.prodTime += dt * (game.tempo || 1);
      if (b.prodTime >= def.buildTime) {
        b.prodTime = 0; b.paid = false;
        const type = b.queue.shift();
        spawnFromBuilding(game, b, type);
      }
    }
  }
  if (b.def.weapon) combatThink(game, b, dt);
}

// Vehicles of the pad's side parked on it are repaired, shields too.
// Is this vehicle parked on (inside the footprint of) this Repair Pad?
function onPad(b, u) {
  const T = CONFIG.TILE;
  return u.x >= b.tx * T && u.x <= (b.tx + b.size) * T && u.y >= b.ty * T && u.y <= (b.ty + b.size) * T;
}

// The finished Repair Pad of its own side that a vehicle is parked on, if any.
function padUnder(game, u) {
  for (const b of game.entities) if (b.type === 'repairpad' && b.team === u.team && b.built >= 1 && b.hp > 0 && onPad(b, u)) return b;
  return null;
}

const needsRepair = u => u.hp < u.maxHp || (u.def.shield && u.shield < u.def.shield);

// A repaired vehicle drives off the pad so it doesn't block the next one:
// to the pad's waypoint if it has one, otherwise to a spot just beside the pad
// on the side facing the middle of the map. Each vehicle gets its own spot
// around that point (a spiral by its id), so they don't pile up there either.
// Workers simply go back to work.
function leavePad(game, u, pad) {
  u.repairTrip = 0;
  if (u.def.role === 'harvester') return;
  if (u.autoReturn) { returnFromRepair(game, u); return; }
  let x, y;
  if (pad.rally) { x = pad.rally.x; y = pad.rally.y; }
  else {
    const a = faceCentre(game, pad.x, pad.y);
    x = pad.x + Math.cos(a) * (pad.radius + 70); y = pad.y + Math.sin(a) * (pad.radius + 70);
  }
  const k = u.id % 12, r = 26 * Math.sqrt(k), t = k * 2.4;
  issueCommand(game, u.team, { type: 'move', ids: [u.id], x: x + Math.cos(t) * r, y: y + Math.sin(t) * r, attackMove: !!u.def.weapon });
}

// Every kind of vehicle parked on the pad is repaired, workers included.
function repairOnPad(game, b, dt) {
  for (const u of game.entities) {
    // Never "repair" something already destroyed or recycled this tick.
    if (u.kind !== 'unit' || u.team !== b.team || u.hp <= 0 || !onPad(b, u)) continue;
    if (!needsRepair(u)) {
      // Sent here by Go repair and now fixed: clear the pad.
      if (u.repairTrip === b.id && u.order.type === 'idle') leavePad(game, u, b);
      continue;
    }
    u.hp = Math.min(u.maxHp, u.hp + b.def.repairRate * dt);
    if (u.def.shield) u.shield = Math.min(u.def.shield, u.shield + b.def.repairRate * dt);
    u.repairing = 0.3;  // lets the renderer show the repair glow
    if ((game.tick + u.id) % 6 === 0) game.effects.push({ kind: 'heal', x: u.x + (game.rng() - 0.5) * 20, y: u.y, t: 0, life: 0.8 });
  }
}

// An Extractor sends its scrap straight into the team's total. When storage
// is full, the scrap waits in the Extractor (up to its `store`) and flows in
// as soon as there is room.
function pumpExtractor(game, b, dt) {
  const tm = game.teams[b.team];
  let amt = b.def.income * dt + b.stored;
  amt -= bankScrap(game, b.team, amt * tm.incomeMult, true) / tm.incomeMult;
  b.stored = Math.min(b.def.store, Math.max(0, amt));
}

function spawnFromBuilding(game, b, type) {
  const T = CONFIG.TILE;
  // Vehicles roll out of the corner facing the middle of the map.
  const lowerLeft = inMirroredHalf(game, b.x, b.y);
  const exitY = lowerLeft ? b.ty - 1 : b.ty + b.size;
  const exitX = lowerLeft ? b.tx + b.size : b.tx - 1;
  const spot = nearestOpenTile(game, exitX, exitY, 6) || { x: b.tx, y: b.ty };
  const u = addUnit(game, type, b.team, (spot.x + 0.5) * T, (spot.y + 0.5) * T);
  applyLoadout(game, u, b);
  game.teams[b.team].stats.built++;
  // Campaign reinforcements: an allied commander hands every few fighting
  // vehicles it builds to the player fighting beside it.
  const tm = game.teams[b.team];
  if (tm.shareEvery && u.def.role === 'combat' && !u.def.deployable && (tm.shared = (tm.shared || 0) + 1) % tm.shareEvery === 0) {
    u.cmdr = 'player';
    pushEvent(game, b.team, `Allied command sends you a ${u.def.name}`, 'good', u.x, u.y);
    return;
  }
  // With a waypoint set, every new vehicle drives straight to it. Workers
  // then get back to work on their own from there.
  if (b.rally) {
    issueCommand(game, b.team, { type: 'move', ids: [u.id], x: b.rally.x, y: b.rally.y, attackMove: !!u.def.weapon });
  } else if (u.def.role === 'harvester') { autoHarvest(game, u); return; }
  pushEvent(game, b.team, `${u.def.name} ready`, 'good', u.x, u.y);
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

function updateUnit(game, u, dt) {
  if (u.cooldown > 0) u.cooldown -= dt;
  if (u.repairing > 0) u.repairing -= dt;
  if (u.def.shield) {
    if (u.shieldFlash > 0) u.shieldFlash -= dt;
    if (u.shieldDown > 0) { u.shieldDown -= dt; if (u.shieldDown <= 0) u.shield = u.def.shield * 0.3; }   // rebooting after a collapse
    else if (u.shieldWait > 0) u.shieldWait -= dt;
    else u.shield = Math.min(u.def.shield, u.shield + u.def.shieldRegen * dt);
  }
  if (u.def.special) updateSpecial(game, u, dt);
  if (u.empUntil > game.time) { u.path = []; return; }   // stalled by an EMP
  if (WORKER_SAFETY[u.def.role] && workerSurvival(game, u, dt)) return;
  if (u.def.deployable && u.deployed) { updateDugIn(game, u, dt); return; }
  if (u.def.weapon2) secondaryFire(game, u, dt);
  if (u.def.weapon && stanceOf(game, u) === 'repair') fightThenRepair(game, u);
  const o = u.order;
  switch (o.type) {
    case 'idle': {
      const st = u.def.weapon ? actingStance(game, u) : null;
      if (st === 'stealth' || st === 'return') {
        // Hold fire entirely, or fire at what's in range without leaving the spot.
        if (st === 'return') shootWhileMoving(game, u, dt); else u.target = null;
        if (dist(u, { x: o.gx, y: o.gy }) > 40) { if (!u.path.length) planPath(game, u, o.gx, o.gy); followPath(game, u, dt); }
        else u.path = [];
        break;
      }
      if (u.def.weapon) {
        if (st === 'aggressive' && !u.target) helpFriends(game, u, dt);
        const engaged = combatThink(game, u, dt, true);
        if (!engaged && dist(u, { x: o.gx, y: o.gy }) > 40) {
          if (!u.path.length) planPath(game, u, o.gx, o.gy);
          followPath(game, u, dt);
        } else if (!engaged) u.path = [];
      } else if (needsRepair(u) && padUnder(game, u)) {
        // Workers parked on a Repair Pad wait there until they're fixed,
        // instead of driving straight back to work.
        followPath(game, u, dt);
      } else if (u.def.role === 'harvester') {
        // Idle scavengers go back to work on any scrap nearby.
        if (!followPath(game, u, dt) || game.tick % 30 !== u.id % 30) break;
        const node = nearestScrap(game, u, 450);
        if (node) { u.order = { type: 'harvest', nodeId: node.id, phase: 'toNode' }; planPath(game, u, node.x, node.y); }
      }
      break;
    }
    case 'move': {
      const st = o.attackMove && !u.retreating ? 'aggressive' : actingStance(game, u);
      let engaged = false;
      if (u.def.weapon && st === 'aggressive') engaged = combatThink(game, u, dt, true);
      if (engaged) { o.fought = true; break; }
      // Back on course after a fight on the way. (The computer opponent's
      // tactics expect its vehicles to stay where the fight left them.)
      if (o.fought && o.gx !== undefined && stanceOf(game, u)) { o.fought = false; planPath(game, u, o.gx, o.gy); }
      if (followPath(game, u, dt)) { u.order = { type: 'idle', gx: u.x, gy: u.y }; break; }
      if (!u.def.weapon || st === 'stealth') { u.target = null; break; }
      if (st === 'return') shootWhileMoving(game, u, dt);
      else aimAtNearby(game, u, dt);
      break;
    }
    case 'attack': {
      const t = game.byId.get(o.targetId);
      // A building your side has seen can be attacked out of sight (you drive
      // there); a vehicle must be in sight. (The computer opponent's orders
      // assume the old rule: out of sight, the order ends.)
      const known = t && t.hp > 0 && (isVisibleTo(game, u.team, t) || (t.kind === 'building' && t.seen[u.team] && stanceOf(game, u)));
      if (!known) { u.order = { type: 'idle', gx: u.x, gy: u.y }; u.target = null; u.path = []; break; }
      u.target = t;
      engageTarget(game, u, t, dt);
      break;
    }
    case 'harvest': updateHarvester(game, u, dt); break;
    case 'build': updateBuilder(game, u, dt); break;
    case 'scout': updateScout(game, u, dt); break;
    case 'patrol': updatePatrol(game, u, dt); break;
    case 'guard': updateGuard(game, u, dt); break;
    case 'hunt': updateHunt(game, u, dt); break;
    case 'mend': case 'automend': case 'follow': updateDrone(game, u, dt); break;
    case 'deploy': updateDeploy(game, u, dt); break;
  }
}

// How a vehicle behaves on the move and when idle:
//   'aggressive'  fights anything it meets, chasing a little (the default)
//   'return'      fires at what's in range but keeps to its course or spot
//   'stealth'     holds fire and just goes where it's sent
// The computer opponent gives its orders exactly (attack-move or not), so
// its vehicles have no stance (null) and behave as they always have.
//   'repair'      fights like Aggressive until its health turns yellow (60%),
//                 then goes for repairs and comes back (fightThenRepair)
const stanceOf = (game, u) => u.stance || (game.aiTeams.includes(u.team) && !u.cmdr ? null : 'aggressive');
// How it behaves right now: a 'repair' vehicle on its way to be fixed only returns fire.
const actingStance = (game, u) => { const st = stanceOf(game, u); return st === 'repair' ? (u.retreating ? 'return' : 'aggressive') : st; };

// An idle, aggressive vehicle goes to the help of a friend under fire nearby.
function helpFriends(game, u, dt) {
  u.helpCheck = (u.helpCheck || 0) - dt;
  if (u.helpCheck > 0) return;
  u.helpCheck = 0.5 + game.rng() * 0.2;
  let best = null, bd = Infinity;
  const consider = f => {
    if (f.team !== u.team || f === u || f.hp <= 0 || !(f.lastHitAt > game.time - 2)) return;
    const a = f.lastHitBy;
    if (!a || a.hp <= 0 || a.team === u.team || !isVisibleTo(game, u.team, a)) return;
    const d = dist(u, a);
    if (d < bd && dist(a, { x: u.order.gx, y: u.order.gy }) < u.def.weapon.range + 520) { bd = d; best = a; }
  };
  forUnitsNear(game, u.x, u.y, 380, consider);
  for (const b of (game.ugrid ? game.ugrid.buildings : [])) if (dist(u, b) < 420) consider(b);
  if (best) { u.target = best; u.order.helping = true; }
}

// --- Hunting -------------------------------------------------------------------
// Seek and destroy: head for the nearest enemy this side knows about (in
// sight now, or a building seen before); with none known, search unexplored
// and fogged ground. Fights everything met on the way.
function pickHuntTarget(game, team, from) {
  let best = null, bd = Infinity;
  for (const e of game.entities) {
    if (e.team === team || e.hp <= 0) continue;
    const known = e.kind === 'building' ? e.seen[team] || isVisibleTo(game, team, e) : isVisibleTo(game, team, e);
    if (!known) continue;
    const d = dist(from, e) + (e.kind === 'building' ? 250 : e.def.weapon ? 0 : 120);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) return { x: best.x, y: best.y, id: best.id };
  const p = pickScoutTarget(game, team, from);
  return p && { x: p.x, y: p.y, id: 0 };
}

function updateHunt(game, u, dt) {
  const o = u.order;
  if (combatThink(game, u, dt, true)) { o.planned = null; return; }
  let goal, slot = 0, holder = o;
  if (o.packId) {
    const pack = game.packs[o.packId];
    if (!pack) { goIdle(u); return; }
    const alive = pack.members.map(id => game.byId.get(id)).filter(m => m && m.hp > 0 && m.order.packId === o.packId);
    holder = pack; slot = o.slot;
    // Keep the pack together: anyone well ahead of the rest waits for them.
    const cx = alive.reduce((a, m) => a + m.x, 0) / alive.length, cy = alive.reduce((a, m) => a + m.y, 0) / alive.length;
    if (pack.target && alive.length > 1 && Math.hypot(u.x - cx, u.y - cy) > 200 &&
        Math.hypot(pack.target.x - u.x, pack.target.y - u.y) < Math.hypot(pack.target.x - cx, pack.target.y - cy)) {
      aimAtNearby(game, u, dt); return;
    }
    if (pack.target && alive.some(m => Math.hypot(m.x - pack.target.x, m.y - pack.target.y) < 120) && !pack.target.id) pack.target = null;
  }
  // The quarry: still there and still known? Otherwise pick another.
  const t = holder.target && holder.target.id ? game.byId.get(holder.target.id) : null;
  if (t && t.hp > 0 && isVisibleTo(game, u.team, t)) { holder.target.x = t.x; holder.target.y = t.y; }
  else if (holder.target && holder.target.id && (!t || t.hp <= 0 || (t.kind === 'unit' && Math.hypot(u.x - t.x, u.y - t.y) < u.def.sight))) holder.target = null;
  if (!holder.target || game.time - holder.chosenAt > 40 || (!holder.target.id && game.time - holder.chosenAt > 8 && game.tick % 60 === u.id % 60)) {
    const next = pickHuntTarget(game, u.team, u);
    // A new known enemy takes over from searching; otherwise keep going.
    if (next && (!holder.target || next.id || game.time - holder.chosenAt > 40)) { holder.target = next; holder.chosenAt = game.time; }
  }
  goal = holder.target;
  if (!goal) { aimAtNearby(game, u, dt); return; }
  const a = (slot % 6) * Math.PI / 3, r = slot ? 36 + Math.floor(slot / 6) * 30 : 0;
  const gx = goal.x + Math.cos(a) * r, gy = goal.y + Math.sin(a) * r;
  if (!o.planned || Math.hypot(o.planned.x - gx, o.planned.y - gy) > 100 || !u.path.length) {
    o.planned = { x: gx, y: gy };
    if (hasClearLine(game, u.x, u.y, gx, gy, u.team)) u.path = [{ x: gx, y: gy }]; else planPath(game, u, gx, gy);
  }
  if (followPath(game, u, dt, 30) && !goal.id) { holder.target = null; o.planned = null; }
  aimAtNearby(game, u, dt);
}

// 'Fight, then repair': at yellow health, head for the nearest Repair Pad
// (or, with none, back to base where drones can reach it), remembering where
// it was; once fixed it drives back there (see leavePad, returnFromRepair).
function fightThenRepair(game, u) {
  if (u.retreating) {
    if (u.hp >= u.maxHp * 0.98 && !u.repairTrip) returnFromRepair(game, u);
    return;
  }
  if (u.hp > u.maxHp * 0.6) return;
  const spot = u.order.type === 'move' ? { x: u.order.gx, y: u.order.gy } : { x: u.x, y: u.y };
  const pads = game.entities.filter(e => e.team === u.team && e.type === 'repairpad' && e.built >= 1);
  const drones = game.entities.some(e => e.team === u.team && e.def.role === 'repairer' && e.hp > 0);
  if (!pads.length && !drones) return;   // nothing to fix it: fight on
  if (pads.length) issueCommand(game, u.team, { type: 'gorepair', ids: [u.id] });
  else {
    const hq = game.entities.find(e => e.team === u.team && (e.type === 'recycler' || e.type === 'mobileRecycler'));
    if (hq) issueCommand(game, u.team, { type: 'move', ids: [u.id], x: hq.x + (game.rng() - 0.5) * 120, y: hq.y + (game.rng() - 0.5) * 120 });
  }
  u.retreating = true; u.target = null;
  u.autoReturn = spot;
  pushEvent(game, u.team, `${nameOf(u)} pulling back for repairs`, 'info', u.x, u.y);
}
function returnFromRepair(game, u) {
  const back = u.autoReturn;
  u.retreating = false; u.autoReturn = null;
  if (back) issueCommand(game, u.team, { type: 'move', ids: [u.id], x: back.x, y: back.y, attackMove: true });
}

// --- Repair Drones -------------------------------------------------------------
// 'mend': fly to one damaged building or vehicle of yours and fix it.
// 'automend': keep finding the most urgent repair nearby (lowest health, then
// nearest), or wait by the Recycler.
function needsMend(e, u) {
  return e && e.team === u.team && e.hp > 0 && e !== u && e.hp < e.maxHp && (e.kind === 'unit' || e.built >= 1);
}
// How urgent a repair is (lower first): badly damaged first, vehicles before
// buildings (they're the ones about to be lost), then nearest.
const mendScore = (u, e) => dist(u, e) + (e.hp / e.maxHp) * 900 - (e.kind === 'unit' ? 300 : 0);
function updateDrone(game, u, dt) {
  const o = u.order;
  if (o.type === 'follow') return followAndMend(game, u, dt);
  let t = o.targetId ? game.byId.get(o.targetId) : null;
  if (!needsMend(t, u)) { t = null; o.targetId = 0; }
  if (!t && o.type === 'mend') { u.order = { type: 'automend', gx: u.x, gy: u.y }; return updateDrone(game, u, dt); }
  // On Auto repair, look around now and then and switch to anything clearly more urgent.
  if (o.type === 'automend' && (u.scan = (u.scan || 0) - dt) <= 0) {
    u.scan = t ? 2 : 0.8;
    let best = null, bs = Infinity;
    for (const e of game.entities) {
      if (!needsMend(e, u) || workerThreat(game, e.kind === 'unit' ? e : { x: e.x, y: e.y, team: u.team }, 200)) continue;   // not into the thick of a fight
      const s = mendScore(u, e);
      if (s < bs) { bs = s; best = e; }
    }
    if (best && (!t || bs < mendScore(u, t) - 150)) { o.targetId = best.id; t = best; u.path = []; }
  }
  if (!t) {
    {
      // Nothing to fix: wait beside the Recycler.
      const hq = game.entities.find(e => e.team === u.team && (e.type === 'recycler' || e.type === 'mobileRecycler'));
      if (hq && dist(u, hq) > 160) { if (!u.path.length) planPath(game, u, hq.x + 70, hq.y + 70); followPath(game, u, dt, 20); }
      return;
    }
  }
  const reach = u.def.repairReach + t.radius;
  if (dist(u, t) > reach) {
    if (!u.path.length || (u.repath = (u.repath || 0) - dt) <= 0) {
      u.repath = 0.7;
      // Aim for a spot just beside it (a building's middle is solid).
      const a = angleTo(t, u), gx = t.x + Math.cos(a) * (t.radius + 22), gy = t.y + Math.sin(a) * (t.radius + 22);
      if (hasClearLine(game, u.x, u.y, gx, gy, u.team)) u.path = [{ x: gx, y: gy }]; else planPath(game, u, gx, gy);
    }
    followPath(game, u, dt, 8);
    return;
  }
  u.path = [];
  u.angle = turnToward(u.angle, angleTo(u, t), 4 * dt);
  t.hp = Math.min(t.maxHp, t.hp + u.def.repairRate * dt);
  t.repairing = 0.3; u.mending = game.time;
  if ((game.tick + u.id) % 6 === 0) game.effects.push({ kind: 'heal', x: t.x + (game.rng() - 0.5) * 20, y: t.y, t: 0, life: 0.8 });
}

// Follow: keep close behind one vehicle and repair it whenever it is hurt.
// When it is destroyed, go back to Auto repair.
function followAndMend(game, u, dt) {
  const v = game.byId.get(u.order.targetId);
  if (!v || v.hp <= 0) { u.order = { type: 'automend', gx: u.x, gy: u.y }; u.path = []; return; }
  const hurt = v.hp < v.maxHp, reach = u.def.repairReach + v.radius;
  // A spot just behind it (or right beside it while repairing).
  const back = v.angle + Math.PI + ((u.id % 3) - 1) * 0.6, off = hurt ? v.radius + 16 : v.radius + 34;
  const gx = v.x + Math.cos(back) * off, gy = v.y + Math.sin(back) * off;
  const d = Math.hypot(u.x - gx, u.y - gy);
  if (d > (hurt ? 14 : 40)) {
    if (!u.path.length || (u.repath = (u.repath || 0) - dt) <= 0) {
      u.repath = 0.5;
      if (hasClearLine(game, u.x, u.y, gx, gy, u.team)) u.path = [{ x: gx, y: gy }]; else planPath(game, u, gx, gy);
    }
    followPath(game, u, dt, 8);
  } else u.path = [];
  if (hurt && dist(u, v) <= reach) {
    if (!u.path.length) u.angle = turnToward(u.angle, angleTo(u, v), 4 * dt);
    v.hp = Math.min(v.maxHp, v.hp + u.def.repairRate * dt);
    v.repairing = 0.3; u.mending = game.time;
    if ((game.tick + u.id) % 6 === 0) game.effects.push({ kind: 'heal', x: v.x + (game.rng() - 0.5) * 20, y: v.y, t: 0, life: 0.8 });
  }
}

// --- A second turret (the Juggernaut's minigun): picks its own target in
// range (another one than the main gun's when there's a choice) and fires on
// the move, unless told to hold fire.
function secondaryFire(game, u, dt) {
  const w = u.def.weapon2;
  if (u.cooldown2 > 0) u.cooldown2 -= dt;
  if (actingStance(game, u) === 'stealth') { u.target2 = null; return; }
  u.retarget2 = (u.retarget2 || 0) - dt;
  const t0 = u.target2;
  if (t0 && (t0.hp <= 0 || edgeDist(u, t0) > w.range || !isVisibleTo(game, u.team, t0))) u.target2 = null;
  if (u.retarget2 <= 0) {
    u.retarget2 = 0.35;
    let best = null, bs = Infinity;
    forUnitsNear(game, u.x, u.y, w.range + 20, o => {
      if (o.team === u.team || o.hp <= 0 || !isVisibleTo(game, u.team, o)) return;
      const d = edgeDist(u, o);
      if (d > w.range) return;
      const s = d + (o === u.target ? 150 : 0) + (o.def.weapon ? 0 : 60);
      if (s < bs) { bs = s; best = o; }
    });
    if (!best) for (const b of (game.ugrid ? game.ugrid.buildings : [])) {
      if (b.team !== u.team && b.hp > 0 && edgeDist(u, b) <= w.range && (isVisibleTo(game, u.team, b))) { best = b; break; }
    }
    u.target2 = best;
  }
  const t = u.target2;
  if (!t) { u.turret2 = turnToward(u.turret2, u.angle, 4 * dt); return; }
  const want = angleTo(u, t);
  u.turret2 = turnToward(u.turret2, want, 6 * dt);
  if (u.cooldown2 > 0 || Math.abs(wrapAngle(want - u.turret2)) > 0.3) return;
  u.cooldown2 = w.cooldown * (1 - CONFIG.VET_RELOAD * (u.rank || 0));
  u.lastShot2 = game.time;
  const mx = u.x + Math.cos(u.turret2) * (u.radius * 0.6), my = u.y + Math.sin(u.turret2) * (u.radius * 0.6);
  launchShot(game, u, t, w, mx, my, u.turret2, edgeDist(u, t), false);
}

const goIdle = u => { u.order = { type: 'idle', gx: u.x, gy: u.y }; u.path = []; };

// Shoot at anything in range without stopping or chasing.
function shootWhileMoving(game, u, dt) {
  const w = u.def.weapon;
  u.retarget -= dt;
  if (u.target && (u.target.hp <= 0 || edgeDist(u, u.target) > w.range || !isVisibleTo(game, u.team, u.target))) u.target = null;
  if (!u.target && u.retarget <= 0) { u.retarget = 0.4; u.target = findTarget(game, u, w.range); }
  if (u.target) aimAndFire(game, u, u.target, dt);
  else u.turret = turnToward(u.turret, u.angle, 3 * dt);
}

// --- Scouting ---------------------------------------------------------------
// Pick somewhere worth looking at: unexplored ground first, then places
// under fog that we can't currently see.
function pickScoutTarget(game, team, from) {
  const { W, H } = game.map, T = CONFIG.TILE, tm = game.teams[team];
  let best = null, bestScore = -Infinity;
  for (let k = 0; k < 40; k++) {
    const tx = 1 + Math.floor(game.rng() * (W - 2)), ty = 1 + Math.floor(game.rng() * (H - 2));
    if (isBlockedTile(game, tx, ty)) continue;
    const i = ty * W + tx, x = (tx + 0.5) * T, y = (ty + 0.5) * T;
    const d = Math.hypot(x - from.x, y - from.y);
    const score = (tm.explored[i] ? 0 : 1000) + (tm.vis[i] ? -600 : 0) - Math.abs(d - 1100) * 0.3 + game.rng() * 150;
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  return best;
}

function updateScout(game, u, dt) {
  const o = u.order;
  shootWhileMoving(game, u, dt);
  if (o.packId) {
    const pack = game.packs[o.packId];
    const alive = pack.members.map(id => game.byId.get(id)).filter(m => m && m.hp > 0 && m.order.packId === o.packId);
    // The pack picks a new destination once anyone arrives, or after a while.
    const arrived = pack.target && alive.some(m => dist(m, pack.target) < 110);
    if (!pack.target || arrived || game.time - pack.chosenAt > 40) {
      pack.target = pickScoutTarget(game, u.team, u); pack.chosenAt = game.time;
    }
    if (!pack.target) return;
    if (o.goal !== pack.target) {
      o.goal = pack.target;
      const a = (o.slot % 6) * Math.PI / 3, r = o.slot ? 34 : 0;
      planPath(game, u, pack.target.x + Math.cos(a) * r, pack.target.y + Math.sin(a) * r);
    }
    followPath(game, u, dt, 20);
    return;
  }
  if (!o.target || game.time - o.chosenAt > 45) {
    o.target = pickScoutTarget(game, u.team, u); o.chosenAt = game.time;
    if (o.target) planPath(game, u, o.target.x, o.target.y);
  }
  if (!o.target) return;
  if (followPath(game, u, dt, 30)) o.target = null;
}

// --- Patrolling ---------------------------------------------------------------
// A loop around all of this team's finished buildings, just outside each one.
function patrolRoute(game, team) {
  const bs = game.entities.filter(e => e.kind === 'building' && e.team === team && e.built >= 1);
  if (!bs.length) return [];
  const cx = bs.reduce((a, b) => a + b.x, 0) / bs.length, cy = bs.reduce((a, b) => a + b.y, 0) / bs.length;
  let stops = bs.map(b => {
    const a = Math.atan2(b.y - cy, b.x - cx) || 0;
    return { x: b.x + Math.cos(a) * (b.radius + 70), y: b.y + Math.sin(a) * (b.radius + 70), a };
  });
  if (stops.length === 1) {
    const b = bs[0];
    stops = [0, 1, 2, 3].map(k => ({ x: b.x + Math.cos(k * Math.PI / 2) * (b.radius + 110), y: b.y + Math.sin(k * Math.PI / 2) * (b.radius + 110), a: k }));
  }
  return stops.sort((p, q) => p.a - q.a);
}

function updatePatrol(game, u, dt) {
  const o = u.order;
  if (combatThink(game, u, dt, true)) { o.moving = false; return; }
  const route = patrolRoute(game, u.team);
  if (!route.length) { goIdle(u); return; }
  const stop = route[o.stop % route.length];
  if (!o.moving || !u.path.length) { planPath(game, u, stop.x, stop.y); o.moving = true; }
  if (followPath(game, u, dt, 24)) { o.stop = (o.stop + 1) % route.length; o.moving = false; }
  else aimAtNearby(game, u, dt);
}

// --- Defending a building -------------------------------------------------------
// Hold a post beside the building and fire at anything in range. No chasing.
function updateGuard(game, u, dt) {
  const o = u.order, b = game.byId.get(o.targetId);
  if (!b || b.hp <= 0) { goIdle(u); return; }
  if (o.follow) { updateEscort(game, u, b, dt); return; }
  const w = u.def.weapon;
  // The building is under attack: go after whoever is hitting it (as far as
  // GUARD_LEASH from it), then come back to the post.
  const GUARD_LEASH = 650;
  const fair = t => t && t.hp > 0 && t.team !== u.team && isVisibleTo(game, u.team, t) && dist(t, b) < GUARD_LEASH;
  if (b.lastHitAt > game.time - 3 && fair(b.lastHitBy) && !fair(o.chase) && !u.def.deployToFire) o.chase = b.lastHitBy;
  if (o.chase && !fair(o.chase)) { o.chase = null; u.path = []; }
  if (o.chase) { u.target = o.chase; engageTarget(game, u, o.chase, dt); return; }
  u.retarget -= dt;
  if (u.target && (u.target.hp <= 0 || !isVisibleTo(game, u.team, u.target) || edgeDist(u, u.target) > w.range ||
      (w.minRange && edgeDist(u, u.target) < w.minRange))) u.target = null;
  if (!u.target && u.retarget <= 0) { u.retarget = 0.4 + game.rng() * 0.2; u.target = findTarget(game, u, w.range); }
  if (Math.hypot(u.x - o.px, u.y - o.py) > 30) {
    if (!u.path.length) planPath(game, u, o.px, o.py);
    followPath(game, u, dt, 12);
    if (u.target) aimAndFire(game, u, u.target, dt);
    return;
  }
  u.path = [];
  if (u.target) aimAndFire(game, u, u.target, dt);
  else u.turret = turnToward(u.turret, angleTo(b, u), 2 * dt);
}

// Guarding a vehicle: stay close to it, shoot anything in range, and go after
// whoever attacks it, but never stray more than LEASH from it.
function updateEscort(game, u, b, dt) {
  const o = u.order, w = u.def.weapon, LEASH = 320;
  const valid = t => t && t.hp > 0 && isVisibleTo(game, u.team, t) && dist(t, b) < LEASH + w.range;
  u.retarget -= dt;
  if (u.target && !valid(u.target)) u.target = null;
  if (u.retarget <= 0) {
    u.retarget = 0.4 + game.rng() * 0.2;
    // Whoever is shooting at the guarded vehicle comes first.
    const attacker = b.lastHitBy && b.lastHitBy.team !== u.team && valid(b.lastHitBy) ? b.lastHitBy : null;
    u.target = attacker || findTarget(game, u, w.range) || (u.target && valid(u.target) ? u.target : null);
  }
  if (u.target) {
    const d = edgeDist(u, u.target);
    if (d > w.range * 0.9 && dist(u, b) < LEASH) {
      // Close in, re-planning now and then as the target moves.
      if (!u.path.length || (u.repath = (u.repath || 0) - dt) <= 0) { u.repath = 0.6; planPath(game, u, u.target.x, u.target.y); }
      followPath(game, u, dt, 12);
    } else u.path = [];
    aimAndFire(game, u, u.target, dt);
    return;
  }
  // Keep station beside the guarded vehicle.
  const r = b.radius + u.radius + 34;
  const gx = b.x + Math.cos(o.slot) * r, gy = b.y + Math.sin(o.slot) * r;
  if (Math.hypot(u.x - gx, u.y - gy) > 40) {
    if (!u.path.length || Math.hypot((o.gx || 0) - gx, (o.gy || 0) - gy) > 48) { o.gx = gx; o.gy = gy; planPath(game, u, gx, gy); }
    followPath(game, u, dt, 12);
  } else {
    u.path = [];
    u.turret = turnToward(u.turret, b.angle !== undefined ? b.angle : u.turret, 2 * dt);
  }
}

// --- Scavenger deploying onto a geyser -------------------------------------------
function geyserTaken(game, g) {
  const b = g.extractorId && game.byId.get(g.extractorId);
  return !!(b && b.hp > 0);
}

function updateDeploy(game, u, dt) {
  const g = game.geysers.find(x => x.id === u.order.geyserId);
  if (!g || geyserTaken(game, g)) { pushEvent(game, u.team, 'Geyser already taken', 'warn', u.x, u.y); goIdle(u); return; }
  if (dist(u, g) > 28) {
    if (followPath(game, u, dt, 10) && dist(u, g) > 60) planPath(game, u, g.x, g.y);
    return;
  }
  const type = u.def.role === 'hq' ? 'recycler' : 'extractor';
  const size = BUILDING_TYPES[type].size;
  // A 3x3 Recycler can't be centred on a grid corner, so it sits one square
  // off; mirror that choice on the far half so both sides are identical.
  const off = size === 3 && inMirroredHalf(game, g.x, g.y) ? 2 : 1;
  const tx = g.tx - off, ty = g.ty - off;
  for (let y = ty; y < ty + size; y++) for (let x = tx; x < tx + size; x++) {
    if (isBlockedTile(game, x, y)) { pushEvent(game, u.team, 'Something is blocking the geyser', 'warn', u.x, u.y); goIdle(u); return; }
  }
  const b = addBuilding(game, type, u.team, tx, ty, false);
  b.selfBuild = true; b.geyserId = g.id;
  g.extractorId = b.id;
  u.hp = 0; u.deployed = true;  // the vehicle becomes the building
  pushEvent(game, u.team, type === 'recycler' ? 'Recycler deploying. Your base is being set up.' : 'Scavenger deploying as an Extractor', 'good', b.x, b.y);
}

// Move along the current path. Returns true once the end is reached.
function followPath(game, u, dt, stopDist = 6) {
  if (!u.path.length) return true;
  // Deployed Artillery and Sentries must fold their legs away before they can drive.
  if (u.legE > 0) {
    u.legE = Math.max(0, u.legE - dt / CONFIG.ARTILLERY_RETRACT);
    u.movingTick = game.tick;
    return false;
  }
  const wp = u.path[0];
  const d = dist(u, wp);
  const last = u.path.length === 1;
  if (d < (last ? stopDist : 14)) { u.path.shift(); return u.path.length === 0; }
  if (last) {
    // Crowded destination: if we're close but haven't got any closer for a
    // couple of seconds (other vehicles are in the way), call it arrived.
    if (wp !== u.nearWp) { u.nearWp = wp; u.bestD = d; u.noGain = 0; }
    if (d < u.bestD - 1) { u.bestD = d; u.noGain = 0; } else u.noGain += dt;
    if (u.noGain > 2 && d < 120) { u.path = []; return true; }
  }
  // An enemy wall or gate in the way: armed vehicles stop and break through.
  if (game.wallCount && u.def.weapon) {
    const T = CONFIG.TILE, a = angleTo(u, wp), r = u.radius + 10;
    const w = enemyWallAt(game, u.team, Math.floor((u.x + Math.cos(a) * r) / T), Math.floor((u.y + Math.sin(a) * r) / T));
    if (w) {
      const wpn = u.def.weapon;
      if (!(wpn.minRange && edgeDist(u, w) < wpn.minRange)) {
        u.breachId = w.id; u.stuck = 0;
        aimAndFire(game, u, w, dt);
        return false;
      }
    }
  }
  const want = avoidSteer(game, u, angleTo(u, wp));
  u.movingTick = game.tick;
  u.angle = turnToward(u.angle, want, 5 * dt);
  const facing = Math.cos(wrapAngle(want - u.angle));
  // Keeping pace with a mixed group until close to the destination or in a fight.
  const o = u.order, paced = o && o.pace && !u.target && Math.hypot(u.x - o.gx, u.y - o.gy) > 250;
  const step = Math.min(d, (paced ? Math.min(u.def.speed, o.pace * 1.05) : u.def.speed) * dt * Math.max(0.25, facing) * (u.slowF || 1) * (u.shockUntil > game.time ? u.shockMul : 1) * (u.boostUntil > game.time ? 1 + SPECIALS.overdrive.boost : 1));
  const ox = u.x, oy = u.y;
  moveWithCollision(game, u, Math.cos(want) * step, Math.sin(want) * step);
  const moved = Math.hypot(u.x - ox, u.y - oy);
  if (moved < step * 0.3) u.stuck += dt; else u.stuck = Math.max(0, u.stuck - dt);
  if (u.stuck > 1.2) {
    const goal = u.path[u.path.length - 1];
    if (u.stuck > 3.5 || dist(u, goal) < 50) { u.path = []; u.stuck = 0; return true; }
    u.path = routeFor(game, u, goal.x, goal.y);
    u.stuck = 1.21 + (u.stuck - 1.2) * 0.5;
  }
  return false;
}

// --- Who is near whom ----------------------------------------------------------
// A grid of 64-pixel cells listing the vehicles in each, rebuilt every tick,
// so a vehicle only checks its neighbours instead of every vehicle on the
// map (big battles have 200 or more).
const GRID_CELL = 64;
function buildUnitGrid(game) {
  const cols = Math.ceil(game.map.W * CONFIG.TILE / GRID_CELL) + 1, rows = Math.ceil(game.map.H * CONFIG.TILE / GRID_CELL) + 1;
  let g = game.ugrid;
  if (!g || g.cols !== cols) g = game.ugrid = { cols, rows, cells: Array.from({ length: cols * rows }, () => []) };
  for (const c of g.used || []) g.cells[c].length = 0;
  g.used = []; g.buildings = [];
  for (const e of game.entities) {
    if (e.kind === 'building') { g.buildings.push(e); continue; }
    if (e.hp <= 0) continue;
    const cx = Math.max(0, Math.min(cols - 1, Math.floor(e.x / GRID_CELL))), cy = Math.max(0, Math.min(rows - 1, Math.floor(e.y / GRID_CELL)));
    const k = cy * cols + cx, cell = g.cells[k];
    if (!cell.length) g.used.push(k);
    cell.push(e);
  }
}
// Calls fn(unit) for every vehicle that might be within r of (x, y).
function forUnitsNear(game, x, y, r, fn) {
  const g = game.ugrid;
  if (!g) { for (const e of game.entities) if (e.kind === 'unit' && e.hp > 0) fn(e); return; }
  const x0 = Math.max(0, Math.floor((x - r) / GRID_CELL)), x1 = Math.min(g.cols - 1, Math.floor((x + r) / GRID_CELL));
  const y0 = Math.max(0, Math.floor((y - r) / GRID_CELL)), y1 = Math.min(g.rows - 1, Math.floor((y + r) / GRID_CELL));
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const cell = g.cells[cy * g.cols + cx];
    for (let i = 0; i < cell.length; i++) fn(cell[i]);
  }
}

// Look a little way ahead for another vehicle in the way and steer round it.
// Something dead ahead is passed on the right, so two vehicles meeting head-on
// both turn the same way and slide past each other instead of shoving.
function avoidSteer(game, u, want) {
  const look = u.radius * 2 + u.def.speed * 0.7;
  const fx = Math.cos(want), fy = Math.sin(want);
  let ahead = Infinity, lat = 0, clear = 0, blocker = null;
  forUnitsNear(game, u.x, u.y, look + 30, o => {
    if (o === u || o.hp <= 0) return;
    const rx = o.x - u.x, ry = o.y - u.y;
    const a = rx * fx + ry * fy;
    if (a <= 0 || a > look || a >= ahead) return;
    const l = -rx * fy + ry * fx;               // how far to our right it is
    const c = u.radius + o.radius + 4;
    if (Math.abs(l) >= c) return;
    ahead = a; lat = l; clear = c; blocker = o;
  });
  u.slowF = 1; u.followId = 0;
  if (ahead === Infinity) return want;
  // Two side by side can each see the other as "ahead": then the lower id
  // leads at full speed, or both would crawl along at the minimum pace.
  if (blocker.team === u.team && blocker.followId === u.id && u.id < blocker.id) return want;
  // A friend ahead driving the same way: fall in behind it at its pace
  // instead of swerving round (that's what made columns jostle and spread).
  if (blocker.team === u.team && blocker.movingTick >= game.tick - 1 && Math.cos(wrapAngle(blocker.angle - want)) > 0.7) {
    u.followId = blocker.id;
    u.slowF = Math.max(0.35, Math.min(1, (ahead - clear * 0.6) / look + 0.25));
    return want + (lat > 3 ? -0.2 : 0.2) * (1 - Math.abs(lat) / clear);
  }
  // The closer and more central the obstacle, the harder the turn.
  const turn = 0.95 * (1 - Math.abs(lat) / clear) * (1 - 0.5 * ahead / look) + 0.25;
  return want + (lat > 3 ? -turn : turn);
}

function moveWithCollision(game, u, dx, dy) {
  // An enemy's gate is as solid as a wall; your own opens for you.
  const blocked = game.wallCount ? (x, y) => {
    if (isBlockedAt(game, x, y)) return true;
    const i = Math.floor(y / CONFIG.TILE) * game.map.W + Math.floor(x / CONFIG.TILE), g = game.gateGrid[i];
    return !!g && g !== u.team;
  } : (x, y) => isBlockedAt(game, x, y);
  const wasBlocked = blocked(u.x, u.y);
  const nx = u.x + dx, ny = u.y + dy;
  if (wasBlocked || !blocked(nx, ny)) { u.x = nx; u.y = ny; return; }
  if (!blocked(nx, u.y)) { u.x = nx; return; }
  if (!blocked(u.x, ny)) { u.y = ny; }
}

// Keep units from overlapping each other or driving inside buildings.
function separateUnits(game) {
  const units = shuffled(game, game.entities.filter(e => e.kind === 'unit' && e.hp > 0));
  units.forEach((u, i) => { u.sepIdx = i; });
  buildUnitGrid(game);
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    forUnitsNear(game, a.x, a.y, 48, b => {
      if (b.sepIdx <= i) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      // Two Scavengers of the same side may squeeze closer, so they can
      // slip past each other on busy runs between a field and the base.
      const workers = a.team === b.team && a.def.role === 'harvester' && b.def.role === 'harvester';
      const min = (a.radius + b.radius) * (workers ? 0.6 : 1);
      if (Math.abs(dx) > min || Math.abs(dy) > min) return;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d < min) {
        // A moving vehicle shoulders a parked one aside rather than both
        // stopping: the parked one takes most of the push.
        const am = a.movingTick === game.tick, bm = b.movingTick === game.tick;
        let ka = am === bm ? 0.3 : am ? 0.1 : 0.5, kb = am === bm ? 0.3 : bm ? 0.1 : 0.5;
        // A dug-in Sentry doesn't budge; the other vehicle goes round it.
        if (a.deployed) { kb += ka; ka = 0; }
        if (b.deployed) { ka += kb; kb = 0; }
        const over = min - d, ux = dx / d, uy = dy / d;
        moveWithCollision(game, a, -ux * over * ka, -uy * over * ka);
        moveWithCollision(game, b, ux * over * kb, uy * over * kb);
      }
    });
  }
  // Nudge units that ended up inside a building's footprint back out.
  for (const u of units) {
    if (!isBlockedAt(game, u.x, u.y)) continue;
    const T = CONFIG.TILE;
    const t = nearestOpenTile(game, Math.floor(u.x / T), Math.floor(u.y / T), 5);
    if (t) {
      const a = angleTo(u, { x: (t.x + 0.5) * T, y: (t.y + 0.5) * T });
      u.x += Math.cos(a) * 3; u.y += Math.sin(a) * 3;
    }
  }
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

function isVisibleTo(game, team, e) {
  if (e.team === team) return true;
  const T = CONFIG.TILE, W = game.map.W;
  if (e.kind === 'building') {
    for (let y = e.ty; y < e.ty + e.size; y++) for (let x = e.tx; x < e.tx + e.size; x++)
      if (game.teams[team].vis[y * W + x]) return true;
    return false;
  }
  // Cloaked, or inside a smoke cloud: unseen unless a Sensor Pulse found it.
  if ((e.cloakOn || (game.smokes && game.smokes.length && game.smokes.some(c => Math.hypot(c.x - e.x, c.y - e.y) < c.r))) && !(e.revealed && e.revealed[team] > game.time)) return false;
  const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
  return game.teams[team].vis[ty * W + tx] === 1;
}

// Distance between the edges of two things, so a gun on a big building
// reaches as far past its walls as a vehicle's gun does.
function edgeDist(a, b) {
  const edge = e => e.kind === 'building' ? e.radius * 0.8 : 0;
  return Math.max(0, dist(a, b) - edge(a) - edge(b));
}

// Pick the best nearby enemy. Prefers things that can shoot back.
function findTarget(game, e, radius) {
  let best = null, bestScore = Infinity;
  const w = e.def.weapon;
  const consider = o => {
    if (o.team === e.team || o.hp <= 0) return;
    if (o.def.wallPiece) return;   // walls: only when they're in the way (see followPath) or you order it
    const d = edgeDist(e, o);
    if (d > radius || (w.minRange && d < w.minRange)) return;
    if (!isVisibleTo(game, e.team, o)) return;
    let score = d;
    if (o.kind === 'building') score += o.def.weapon ? 40 : 200;
    else if (!o.def.weapon) score += 120;
    if (o === e.lastHitBy) score -= 150;
    if (score < bestScore) { bestScore = score; best = o; }
  };
  const g = game.ugrid;
  if (!g) { for (const o of game.entities) consider(o); return best; }
  forUnitsNear(game, e.x, e.y, radius, consider);
  for (const b of g.buildings) consider(b);
  return best;
}

// A dug-in Sentry: legs down, fires at whatever its side can see in range,
// never moves and never chases.
function updateDugIn(game, u, dt) {
  const w = u.def.weapon;
  u.path = [];
  u.retarget -= dt;
  if (u.target && (u.target.hp <= 0 || edgeDist(u, u.target) > w.range || !isVisibleTo(game, u.team, u.target))) u.target = null;
  if (u.retarget <= 0) { u.retarget = 0.3; const t = findTarget(game, u, w.range); if (t && (!u.target || edgeDist(u, t) < edgeDist(u, u.target) - 60)) u.target = t; }
  if (u.target) aimAndFire(game, u, u.target, dt);   // lowers the legs first
  else if ((u.legE || 0) < 1) u.legE = Math.min(1, (u.legE || 0) + dt / CONFIG.ARTILLERY_DEPLOY);
}

// Look for, chase and shoot enemies. Returns true if busy fighting.
function combatThink(game, e, dt, canChase = false) {
  const w = e.def.weapon;
  if (e.def.deployable && !e.deployed) return false;   // a packed-up Sentry can't fire
  e.retarget -= dt;
  if (e.target && (e.target.hp <= 0 || !isVisibleTo(game, e.team, e.target))) e.target = null;
  // Vehicles look as far as they can see or shoot, whichever is further, so
  // Artillery fires on anything its side can see (spotted by a Tank, a Scout,
  // a Radar...) out to its full range.
  const reach = canChase ? Math.max(e.def.sight, w.range) + (e.order && e.order.helping ? 450 : 0) : w.range;
  if (e.target && edgeDist(e, e.target) > reach) e.target = null;
  if (e.retarget <= 0) {
    e.retarget = 0.4 + game.rng() * 0.2;
    const radius = reach;
    const t = findTarget(game, e, radius);
    if (t && (!e.target || edgeDist(e, t) < edgeDist(e, e.target) - 60)) e.target = t;
  }
  if (!e.target) { if (e.order && e.order.helping) e.order.helping = false; return false; }
  if (e.kind === 'building') { aimAndFire(game, e, e.target, dt); return true; }
  // Idle units only chase a limited distance from where they were told to stand.
  if (e.order.type === 'idle' && dist(e.target, { x: e.order.gx, y: e.order.gy }) > w.range + (e.order.helping ? 520 : 220)) { e.target = null; e.order.helping = false; return false; }
  engageTarget(game, e, e.target, dt);
  return true;
}

function engageTarget(game, u, t, dt) {
  const w = u.def.weapon, d = edgeDist(u, t);
  if (d > w.range * 0.92) {
    u.repath = (u.repath || 0) - dt;
    if (!u.path.length || u.repath <= 0) {
      u.repath = 0.8;
      // Close in to a firing spot of its own on an arc around the target,
      // so a group fans out instead of piling into one clump.
      const a = angleTo(t, u) + (((u.id * 0.618034) % 1) - 0.5) * 1.2;
      const r = Math.max(w.minRange || 0, w.range * 0.8) + (t.kind === 'building' ? t.radius * 0.8 : 0);
      let gx = t.x + Math.cos(a) * r, gy = t.y + Math.sin(a) * r;
      if (isBlockedAt(game, gx, gy)) { gx = t.x; gy = t.y; }
      if (hasClearLine(game, u.x, u.y, gx, gy, u.team)) u.path = [{ x: gx, y: gy }];
      else planPath(game, u, gx, gy);
    }
    followPath(game, u, dt, 12);
    aimAtNearby(game, u, dt);
  } else {
    // In range: against anything that shoots back, keep moving (harder to
    // hit) and fire on the move; otherwise stop for a steady aim.
    if (u.kind === 'unit' && !u.def.deployToFire && u.def.role === 'combat' && t.def.weapon) strafe(game, u, t, dt);
    else u.path = [];
    aimAndFire(game, u, t, dt);
  }
}

// Circle the target sideways, switching direction every few seconds (or
// when blocked), drifting in or out to stay between 60% and 88% of range.
function strafe(game, u, t, dt) {
  u.path = [];
  const R = u.def.weapon.range + (t.kind === 'building' ? t.radius * 0.8 : 0), d = dist(u, t);
  if (!u.strafeDir || game.time >= (u.strafeUntil || 0)) { u.strafeDir = game.rng() < 0.5 ? -1 : 1; u.strafeUntil = game.time + 1.5 + game.rng() * 2; }
  const a = angleTo(t, u), radial = d > R * 0.88 ? -0.7 : d < R * 0.6 ? 0.7 : 0;
  const mx = -Math.sin(a) * u.strafeDir + Math.cos(a) * radial, my = Math.cos(a) * u.strafeDir + Math.sin(a) * radial;
  const want = Math.atan2(my, mx);
  u.angle = turnToward(u.angle, want, 4 * dt);
  const step = u.def.speed * CONFIG.STRAFE_SPEED * dt * Math.max(0.3, Math.cos(wrapAngle(want - u.angle)));
  const ox = u.x, oy = u.y;
  moveWithCollision(game, u, Math.cos(u.angle) * step, Math.sin(u.angle) * step);
  u.movingTick = game.tick;
  if (Math.hypot(u.x - ox, u.y - oy) < step * 0.3) { u.strafeDir = -u.strafeDir; u.strafeUntil = game.time + 1.5; }
}

// While driving, point the gun at anything in range and shoot it.
function aimAtNearby(game, u, dt) {
  if (u.def.deployable && !u.deployed) { u.turret = turnToward(u.turret, u.angle, 3 * dt); return; }
  const t = u.target && edgeDist(u, u.target) <= u.def.weapon.range ? u.target : null;
  if (t) aimAndFire(game, u, t, dt);
  else u.turret = turnToward(u.turret, u.angle, 3 * dt);
}

// The chance a shot from `e` at `t` (edge distance d) hits (CONFIG.ACCURACY).
function hitChance(game, e, t, d, w = e.def.weapon) {
  if (t.kind === 'building') return 1;
  const jammed = (game.jammers || []).some(j => j.team !== e.team && Math.hypot(j.x - e.x, j.y - e.y) < j.def.special.radius);
  if (w.sure) return jammed ? 0.8 : 0.98;
  const rank = e.rank || 0, fixed = isFixedGun(e);
  let k = (CONFIG.ACCURACY[w.projectile] || 0.9) * (w.acc || 1) * (1 - CONFIG.ACC_RANGE * Math.min(1, d / w.range)) * (1 + CONFIG.VET_ACC[rank]);
  if (fixed) k *= CONFIG.ACC_FIXED;
  if (e.cmdBonus) k *= 1 + COMMAND.acc * e.cmdBonus;   // a commander's experience lifts the group
  // Veterans lose less accuracy firing on the move (a third less per rank).
  if (e.kind === 'unit' && e.movingTick >= game.tick - 1) k *= 1 - (1 - CONFIG.ACC_SHOOTER_MOVING) * (1 - rank / 3);
  // Homing missiles follow a moving target (unless jammed).
  if (t.movingTick >= game.tick - 1 && !(w.homing && !jammed)) k *= 1 - CONFIG.ACC_TARGET_SPEED * t.def.speed * (fixed ? CONFIG.ACC_FIXED_TRACK : 1);
  if (jammed) k *= SPECIALS.jammer.acc;
  return Math.max(CONFIG.ACC_MIN, Math.min(0.98, k));
}
// Fires from a fixed spot: a building, or a Sentry or Artillery with its legs down.
const isFixedGun = e => e.kind === 'building' || (!!e.def.deployToFire && (e.legE || 0) >= 1);

function aimAndFire(game, e, t, dt) {
  const d = edgeDist(e, t);
  const w = e.kind === 'unit' ? chooseWeapon(game, e, t, d) : e.def.weapon;
  const want = angleTo(e, t);
  e.turret = turnToward(e.turret, want, 4 * dt);
  if (d > w.range || (w.minRange && d < w.minRange)) return;
  if (e.kind === 'unit' && e.def.deployToFire) {
    // Artillery and Sentries fire only when stopped with their legs down.
    if (e.movingTick === game.tick) return;
    if ((e.legE || 0) < 1) {
      e.legE = Math.min(1, (e.legE || 0) + dt / CONFIG.ARTILLERY_DEPLOY);
      if (e.legE < 1) return;
    }
  }
  if (e.cooldown > 0) return;
  if (Math.abs(wrapAngle(want - e.turret)) > 0.25) return;
  e.cooldown = w.cooldown * (1 - CONFIG.VET_RELOAD * (e.rank || 0)) * (1 - COMMAND.reload * (e.cmdBonus || 0));
  e.lastShot = game.time;  // drives barrel recoil and the muzzle flash
  const mx = e.x + Math.cos(e.turret) * (e.radius + 4), my = e.y + Math.sin(e.turret) * (e.radius + 4);
  launchShot(game, e, t, w, mx, my, e.turret, d, w.projectile !== 'bullet');
}

// Speeds of each kind of shot, in pixels a second.
const SHOT_SPEED = { bullet: 900, shell: 620, rocket: 520, missile: 440, rail: 3200, laser: 4000, flame: 420, flak: 800, plasma: 300, shock: 1100 };
// Fires one trigger pull of weapon w from (mx, my) at t: a salvo of shots
// (salvoGap seconds apart), each from `count` barrels side by side sharing
// the damage. Each shot rolls to hit; a miss flies a little wide and lands
// beyond the target.
function launchShot(game, e, t, w, mx, my, aim, d, big) {
  if (e.cloakOn) { e.cloakOn = false; e.cloakT = (e.def.special && e.def.special.off) || 7; }   // firing breaks a cloak
  const n = w.salvo || 1, barrels = Math.max(1, w.count || 1), each = w.damage / barrels;
  for (let k = 0; k < n; k++) for (let j = 0; j < barrels; j++) {
    const off = barrels > 1 ? (j - (barrels - 1) / 2) * 6 : (n > 1 && !w.salvoGap ? (k - (n - 1) / 2) * 7 : 0);
    const sx = mx - Math.sin(aim) * off, sy = my + Math.cos(aim) * off;
    const p = { kind: w.projectile, team: e.team, owner: e.id, x: sx, y: sy, sx, sy, damage: each, splash: w.splash || 0,
                vsBuilding: w.vsBuilding, vsWall: w.vsWall, vsHeavy: w.vsHeavy, vsLight: w.vsLight, slow: w.slow, slowTime: w.slowTime,
                pierceShield: w.pierceShield, emp: w.emp, empTime: w.empTime, smoke: w.smoke, smokeTime: w.smokeTime,
                fire: w.fire, fireTime: w.fireTime, fireDps: w.fireDps, delay: w.salvoGap ? k * w.salvoGap : 0 };
    if (w.projectile === 'artillery') {
      const spread = (20 + d * 0.06) * (isFixedGun(e) ? CONFIG.ARTY_SPREAD_FIXED : 1) * (w.spread || 1);
      p.tx = t.x + (game.rng() - 0.5) * spread; p.ty = t.y + (game.rng() - 0.5) * spread;
      p.speed = 260; p.total = Math.hypot(p.tx - sx, p.ty - sy);
    } else {
      p.speed = SHOT_SPEED[w.projectile] || 620;
      if (game.rng() < hitChance(game, e, t, d, w)) { p.targetId = t.id; p.tx = t.x; p.ty = t.y; }
      else {
        const a = angleTo(e, t) + (game.rng() < 0.5 ? -1 : 1) * (0.08 + game.rng() * 0.12);
        const len = dist(e, t) + 30 + game.rng() * 60;
        p.tx = sx + Math.cos(a) * len; p.ty = sy + Math.sin(a) * len; p.miss = true;
      }
    }
    if ((w.projectile === 'rail' || w.projectile === 'laser') && !p.delay) game.effects.push({ kind: 'beam', x: sx, y: sy, x2: p.tx, y2: p.ty, t: 0, life: w.projectile === 'laser' ? 0.12 : 0.25, team: e.team, laser: w.projectile === 'laser' });
    game.projectiles.push(p);
  }
  game.effects.push({ kind: 'flash', x: mx, y: my, a: aim, t: 0, life: 0.08, big, fx: w.projectile });
  const loud = { rail: 'shell', laser: 'bullet', flame: 'shell', flak: 'bullet', plasma: 'shell', missile: 'rocket', shock: 'shell' };
  game.events.push({ sound: loud[w.projectile] || w.projectile, x: mx, y: my });
}

function updateProjectiles(game, dt) {
  const fields = game.activeFields || [];
  const pd = game.pointDefence || [];
  for (const p of game.projectiles) {
    if (p.delay > 0) { p.delay -= dt; continue; }   // the next rocket of a salvo, still in the tube
    // Point Defence shoots down rockets, missiles and shells that come near.
    if (pd.length && (p.kind === 'rocket' || p.kind === 'missile' || p.kind === 'artillery') && !p.pdTried) {
      const u = pd.find(u => u.team !== p.team && u.hp > 0 && (u.pdCd || 0) <= 0 && Math.hypot(u.x - p.x, u.y - p.y) < u.def.special.radius);
      if (u) {
        p.pdTried = true; u.pdCd = u.def.special.cooldown;
        game.effects.push({ kind: 'beam', x: u.x, y: u.y, x2: p.x, y2: p.y, t: 0, life: 0.1, team: u.team, laser: true });
        if (game.rng() < u.def.special.chance) { p.done = true; game.effects.push({ kind: 'spark', x: p.x, y: p.y, t: 0, life: 0.3, big: true }); continue; }
      }
    }
    if (p.targetId) {
      const t = game.byId.get(p.targetId);
      if (t && t.hp > 0) { p.tx = t.x; p.ty = t.y; }
    }
    const d = Math.hypot(p.tx - p.x, p.ty - p.y), step = p.speed * dt;
    // An enemy forcefield in the way, facing this shot, stops it.
    if (fields.length) {
      const k = Math.min(1, step / (d || 1)), nx = p.x + (p.tx - p.x) * k, ny = p.y + (p.ty - p.y) * k;
      const f = fields.find(f => f.team !== p.team && (nx - p.x) * f.dx + (ny - p.y) * f.dy < 0 && segmentsCross(p.x, p.y, nx, ny, f.ax, f.ay, f.bx, f.by));
      if (f) { p.done = true; hitField(game, f, p); continue; }
    }
    if (d <= step) {
      p.done = true;
      if (p.kind === 'artillery') {
        if (p.damage > 0) for (const o of game.entities) {
          if (o.hp <= 0 || o.team === p.team) continue;
          const od = Math.max(0, Math.hypot(o.x - p.tx, o.y - p.ty) - o.radius * 0.5);
          if (od < p.splash) damage(game, o, p.damage * (1 - 0.6 * od / p.splash), p);
        }
        if (p.splash) game.effects.push({ kind: 'boom', x: p.tx, y: p.ty, t: 0, life: 0.6, size: p.splash });
        game.events.push({ sound: 'boom', x: p.tx, y: p.ty });
        impactExtras(game, p);
      } else if (p.miss) {
        game.effects.push({ kind: 'dust', x: p.tx, y: p.ty, t: 0, life: 0.4 });
      } else {
        const t = game.byId.get(p.targetId);
        if (t && t.hp > 0) {
          damage(game, t, p.damage, p);
          // Shock: the target is slowed for a while.
          if (p.slow && t.kind === 'unit') { t.shockUntil = game.time + p.slowTime; t.shockMul = 1 - p.slow; }
        }
        // Flames (and anything else with splash) burn what stands around the hit.
        if (p.splash) for (const o of game.entities) {
          if (o === t || o.hp <= 0 || o.team === p.team) continue;
          const od = Math.max(0, Math.hypot(o.x - p.tx, o.y - p.ty) - o.radius * 0.5);
          if (od < p.splash) damage(game, o, p.damage * 0.5 * (1 - 0.5 * od / p.splash), p);
        }
        game.effects.push({ kind: p.kind === 'flame' ? 'burn' : p.kind === 'shock' ? 'zap' : p.kind === 'plasma' ? 'boom' : p.kind === 'flak' ? 'burst' : 'spark', x: p.tx, y: p.ty, t: 0, life: p.kind === 'flame' ? 0.45 : 0.3, big: p.kind !== 'bullet', r: p.splash, size: p.splash || 20 });
        impactExtras(game, p);
      }
    } else {
      p.x += (p.tx - p.x) / d * step; p.y += (p.ty - p.y) / d * step;
    }
  }
  game.projectiles = game.projectiles.filter(p => !p.done);
}

// --- Hardpoints, Armory weapons and loadouts ---
// The weapon an Armory weapon makes of a slot's stock weapon (see WEAPONS).
function makeWeapon(stock, key) {
  if (!key || key === 'stock' || !WEAPONS[key] || WEAPONS[key].slot === 'special') return stock;
  const m = WEAPONS[key].mod, w = Object.assign({}, stock, { key, name: WEAPONS[key].name });
  w.damage = Math.round(stock.damage * (m.damage ?? 1) * 10) / 10;
  w.cooldown = Math.round(stock.cooldown * (m.cooldown || 1) * 100) / 100;
  w.range = Math.round(stock.range * (m.rangeMul || 1) + (m.rangeAdd || 0));
  if (stock.minRange) w.minRange = Math.round(stock.minRange * (m.minRangeMul || 1));
  if (m.splash !== undefined) w.splash = m.splash; else if (stock.splash) w.splash = Math.round(stock.splash * (m.splashMul || 1));
  if (m.spreadMul) w.spread = m.spreadMul;
  for (const k of ['vsHeavy', 'vsLight']) if (m[k] !== undefined) w[k] = Math.round((stock[k] || 1) * m[k] * 100) / 100;
  for (const k of ['projectile', 'vsBuilding', 'vsWall', 'salvo', 'salvoGap', 'acc', 'sure', 'homing', 'unguided', 'pierceShield', 'emp', 'empTime', 'smoke', 'smokeTime', 'fire', 'fireTime', 'fireDps'])
    if (m[k] !== undefined) w[k] = m[k];
  return w;
}
// A special ability fitted to a vehicle.
function makeSpecial(key) { return key && SPECIALS[key] ? Object.assign({ key, name: WEAPONS[key].name }, SPECIALS[key]) : null; }
// Can this weapon go in this slot (of this vehicle kind)?
function fitsSlot(slot, key) {
  if (key === 'stock') return true;
  const w = WEAPONS[key];
  return !!w && w.slot === slot.type && (!slot.allow || slot.allow.includes(key));
}
// A vehicle kind's stats with a loadout fitted (shared by every vehicle with
// the same loadout). A loadout maps slot type -> weapon key ('stock' or none
// for the stock weapon; specials have no stock and start empty). Basic (Mk I)
// vehicles use the slots they have; a Mk II has more.
const LOADOUT_DEFS = new Map();
function loadoutDef(type, lo) {
  const def = UNIT_TYPES[type];
  if (!def.slots || !lo) return def;
  const used = def.slots.filter(sl => lo[sl.type] && lo[sl.type] !== 'stock' && fitsSlot(sl, lo[sl.type]));
  if (!used.length) return def;
  const key = type + ':' + used.map(sl => sl.type + '=' + lo[sl.type]).join(',');
  let d = LOADOUT_DEFS.get(key);
  if (!d) {
    d = Object.assign({}, def, { loadout: {} });
    for (const sl of used) {
      const k = lo[sl.type];
      d.loadout[sl.type] = k;
      if (sl.type === 'special') {
        d.special = makeSpecial(k);
        if (k === 'shield') Object.assign(d, { shield: Math.round(def.hp * SPECIALS.shield.frac), shieldDelay: SPECIALS.shield.delay,
          shieldRegen: Math.round(def.hp * SPECIALS.shield.frac * SPECIALS.shield.regen), shieldReboot: SPECIALS.shield.reboot });
      } else d[sl.field] = Object.assign(makeWeapon(def[sl.field], k), { slot: sl.type, count: sl.count });
    }
    // The longest-reaching weapon on the main turret leads; the rest are alternatives.
    const main = def.slots.filter(sl => sl.type !== 'special' && sl.turret !== 2).map(sl => d[sl.field]).sort((a, b) => b.range - a.range);
    if (main.length) { d.weapon = main[0]; d.altWeapons = main.slice(1); }
    LOADOUT_DEFS.set(key, d);
  }
  return d;
}
function applyLoadout(game, u, b) {
  const lo = b && b.loadouts && b.loadouts[baseType(u)];
  if (!lo) return;
  u.def = loadoutDef(u.type, lo);
  if (u.def.shield) u.shield = u.def.shield;
  if (u.def.special && u.def.special.key === 'mines') u.mines = u.def.special.carry;
}
// A tower's weapon: chosen once per tower (and once more after its upgrade),
// then locked for good.
function fitTower(game, b, key) {
  const sl = b.def.slots && b.def.slots[0];
  if (!sl || b.weaponLocked) return false;
  b.def = Object.assign({}, b.def, { weapon: Object.assign(makeWeapon(b.def.weapon, key), { slot: sl.type, count: sl.count, name: key === 'stock' ? sl.stock : WEAPONS[key].name }) });
  b.weaponLocked = true; b.fitted = key;
  if (b.mountOn) mountBoost(b);
  return true;
}
// How well a weapon does against a target: damage a second, with its
// armour multipliers (and a little extra for splash).
function weaponScore(w, t) {
  const mult = t.kind === 'building' ? (w.vsBuilding || 1) : (HEAVY_KINDS.includes(baseType(t)) ? (w.vsHeavy || 1) : (w.vsLight || 1));
  return w.damage * (w.salvo || 1) * mult / w.cooldown * (w.splash ? 1.15 : 1) * (w.smoke ? 0 : 1) + (w.emp && t.shield > 0 ? 50 : 0);
}
// Vehicles with more than one weapon on their turret switch to the one that
// suits the target and can reach it (half a second to switch).
function chooseWeapon(game, e, t, d) {
  const alts = e.def.altWeapons;
  if (!alts || !alts.length) return e.def.weapon;
  const all = [e.def.weapon, ...alts], inRange = w => d <= w.range && !(w.minRange && d < w.minRange);
  const cur = all[e.wIdx || 0] || e.def.weapon;
  let best = cur, bs = inRange(cur) ? weaponScore(cur, t) : -1;
  for (const w of all) { const sc = inRange(w) ? weaponScore(w, t) : -1; if (sc > bs * 1.15 + 0.01) { best = w; bs = sc; } }
  if (best !== cur && game.time >= (e.switchAt || 0)) { e.wIdx = all.indexOf(best); e.switchAt = game.time + 0.5; e.cooldown = Math.max(e.cooldown, 0.4); return best; }
  return cur;
}

// --- Commanders ---
// Most experienced first: rank, then kills, then health.
const byRank = (a, b) => (b.rank || 0) - (a.rank || 0) || (b.kills || 0) - (a.kills || 0) || b.hp / b.maxHp - a.hp / a.maxHp;
const STYLE_TEXT = {
  ring: 'guarding the base: a ring of posts facing the enemy',
  patrolBase: 'guarding the base: half on patrol, half at the front gate',
  posts: 'guarding the Extractors: a guard on each, the rest on patrol',
  reserve: 'guarding the Extractors: guards on the most exposed, a reserve ready to strike',
  assault: 'attacking the enemy base head-on',
  pincer: 'attacking the enemy base from two sides at once',
  raid: 'raiding enemy Extractors one after another',
  splitRaid: 'raiding two enemy Extractors at once',
  pack: 'hunting enemy units as one pack',
  wolves: 'hunting enemy units in two packs',
};
// The commander picks how to carry out a general order. It varies: fast
// groups favour pincers and split raids, and an experienced commander takes
// the bolder option more often.
function chooseStyle(game, group) {
  const units = group.members.map(id => game.byId.get(id)).filter(u => u && u.hp > 0);
  const fast = units.filter(u => u.def.speed >= 60).length / Math.max(1, units.length);
  const cmdr = game.byId.get(group.cmdrId), bold = 0.35 + 0.15 * ((cmdr && cmdr.rank) || 0) + 0.3 * fast;
  const pick = (a, b) => game.rng() < bold ? b : a;
  const o = group.order;
  if (o.kind === 'guard') return o.target === 'extractors' ? pick('posts', 'reserve') : pick('ring', 'patrolBase');
  if (o.kind === 'attack') return o.target === 'extractors' ? pick('raid', 'splitRaid') : pick('assault', 'pincer');
  return units.length >= 6 ? pick('pack', 'wolves') : 'pack';
}
const groupPower = (game, group) => group.members.reduce((a, id) => { const u = game.byId.get(id); return a + (u && u.hp > 0 ? u.hp : 0); }, 0);
function updateCommands(game, team, dt) {
  const tm = game.teams[team];
  for (const group of tm.commands.slice()) {
    // The fallen leave; if the commander fell, the most experienced takes over.
    group.members = group.members.filter(id => { const u = game.byId.get(id); return u && u.hp > 0 && u.cmdId === group.id; });
    if (!group.members.length) { tm.commands = tm.commands.filter(x => x !== group); pushEvent(game, team, `Command ${group.n} has been wiped out`, 'bad'); continue; }
    let cmdr = game.byId.get(group.cmdrId);
    if (!cmdr || cmdr.hp <= 0 || cmdr.cmdId !== group.id) {
      cmdr = group.members.map(id => game.byId.get(id)).sort(byRank)[0];
      group.cmdrId = cmdr.id;
      pushEvent(game, team, `Command ${group.n}: the commander has fallen. ${cmdr.def.name} takes command.`, 'warn', cmdr.x, cmdr.y);
    }
    const bonus = (cmdr.rank || 0) + 1;
    for (const id of group.members) game.byId.get(id).cmdBonus = bonus;
    if ((group.think -= dt) > 0 || !group.order) continue;
    group.think = COMMAND.think;
    commandThink(game, team, group, cmdr);
  }
}
// Order one vehicle on the commander's behalf, only if its task changed (or
// it has finished it), so they aren't constantly re-ordered.
function cmdTask(game, team, u, key, cmd) {
  if (u.cmdTask === key && u.order.type !== 'idle') return;
  if (u.cmdTask === key && cmd.type === 'move' && Math.hypot(u.x - cmd.x, u.y - cmd.y) < 120) return;   // there already
  u.cmdTask = key;
  issueCommand(game, team, Object.assign({ ids: [u.id], byCommander: true }, cmd));
}
function commandThink(game, team, group, cmdr) {
  const T = CONFIG.TILE, tm = game.teams[team];
  const units = group.members.map(id => game.byId.get(id));
  if (!units.length) return;
  const foe = 3 - team;
  const home = game.entities.find(e => e.team === team && (e.type === 'recycler' || e.type === 'mobileRecycler'));
  const known = e => e.seen && e.seen[team];
  const theirBase = game.entities.find(e => e.team === foe && e.type === 'recycler' && e.hp > 0 && known(e));
  const pads = game.entities.some(e => e.team === team && e.type === 'repairpad' && e.built >= 1);
  // Badly hurt vehicles go for repairs (with a Repair Pad), then rejoin.
  for (const u of units) if (pads && u.hp < u.maxHp * 0.4 && !u.repairTrip) { u.cmdTask = 'repair'; issueCommand(game, team, { type: 'gorepair', ids: [u.id], byCommander: true }); }
  const fit = units.filter(u => u.cmdTask !== 'repair' || u.hp >= u.maxHp * 0.95);
  for (const u of fit) if (u.cmdTask === 'repair' && u.hp >= u.maxHp * 0.95) u.cmdTask = null;
  // An attack that has bled too much falls back to regroup, then goes again.
  const o = group.order;
  if (o.kind !== 'guard') {
    if (!group.fallback && groupPower(game, group) < group.startPower * (1 - COMMAND.fallBack)) {
      group.fallback = game.time + COMMAND.regroup;
      pushEvent(game, team, `Command ${group.n} has taken heavy losses and is falling back to regroup`, 'warn', cmdr.x, cmdr.y);
    }
    if (group.fallback && game.time > group.fallback) { group.fallback = 0; group.startPower = groupPower(game, group); pushEvent(game, team, `Command ${group.n} is going in again`, 'info'); }
  }
  const style = group.fallback ? 'regroup' : group.style;
  const half = (list, k) => list.filter((u, i) => i % 2 === k);
  const toward = (from, to, d) => { const a = Math.atan2(to.y - from.y, to.x - from.x); return { x: from.x + Math.cos(a) * d, y: from.y + Math.sin(a) * d }; };
  const centre = { x: game.map.W * T / 2, y: game.map.H * T / 2 };
  switch (style) {
    case 'regroup':
      if (home) fit.forEach((u, i) => { const p = toward(home, centre, 220 + (i % 3) * 40); cmdTask(game, team, u, 'regroup', { type: 'move', x: p.x + ((i % 4) - 1.5) * 36, y: p.y + (Math.floor(i / 4) - 1) * 36 }); });
      break;
    case 'ring': {
      if (!home) break;
      const face = Math.atan2(centre.y - home.y, centre.x - home.x);
      fit.forEach((u, i) => { const a = face + (i - (fit.length - 1) / 2) * 0.35, r = 240 + (i % 2) * 50; cmdTask(game, team, u, 'ring' + i, { type: 'move', x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r }); });
      break;
    }
    case 'patrolBase': {
      if (!home) break;
      const gate = toward(home, centre, 260);
      half(fit, 0).forEach(u => cmdTask(game, team, u, 'patrol', { type: 'patrol' }));
      half(fit, 1).forEach((u, i) => cmdTask(game, team, u, 'gate' + i, { type: 'move', x: gate.x + ((i % 3) - 1) * 40, y: gate.y + Math.floor(i / 3) * 40 }));
      break;
    }
    case 'posts':
    case 'reserve': {
      // The most exposed Extractors first: nearest the enemy (or the middle).
      const threat = theirBase || centre;
      const ex = game.entities.filter(e => e.team === team && e.type === 'extractor' && e.hp > 0).sort((a, b) => dist(a, threat) - dist(b, threat));
      if (!ex.length) { fit.forEach(u => cmdTask(game, team, u, 'patrol', { type: 'patrol' })); break; }
      const guards = style === 'posts' ? Math.min(fit.length, ex.length) : Math.min(2, fit.length, ex.length);
      fit.slice(0, guards).forEach((u, i) => cmdTask(game, team, u, 'guard' + ex[i].id, { type: 'guard', targetId: ex[i].id }));
      const rest = fit.slice(guards);
      if (style === 'posts') rest.forEach(u => cmdTask(game, team, u, 'patrol', { type: 'patrol' }));
      else {
        // The reserve waits in the middle of the Extractors and strikes where one is attacked.
        const hit = ex.find(e => e.lastHitAt > game.time - 8);
        const spot = hit || { x: ex.reduce((a, e) => a + e.x, 0) / ex.length, y: ex.reduce((a, e) => a + e.y, 0) / ex.length };
        rest.forEach((u, i) => cmdTask(game, team, u, (hit ? 'strike' + hit.id : 'reserve') + i, { type: 'move', x: spot.x + ((i % 3) - 1) * 40, y: spot.y + Math.floor(i / 3) * 40, attackMove: true }));
      }
      break;
    }
    case 'assault':
    case 'pincer': {
      if (!theirBase) { fit.forEach(u => cmdTask(game, team, u, 'search', { type: 'hunt', pack: false })); break; }
      if (style === 'assault' || !group.plan) {
        if (style === 'pincer') group.plan = { stage: 0 };
        if (style === 'assault') { fit.forEach((u, i) => cmdTask(game, team, u, 'assault', { type: 'move', x: theirBase.x + ((i % 3) - 1) * 40, y: theirBase.y + (Math.floor(i / 3) - 1) * 40, attackMove: true })); break; }
      }
      // Pincer: two halves swing out to either side, then close in together.
      const sides = [half(fit, 0), half(fit, 1)];
      const back = Math.atan2(cmdr.y - theirBase.y, cmdr.x - theirBase.x);
      if (group.plan.stage === 0) {
        const ready = sides.every((side, k) => side.every(u => { const a = back + (k ? 0.7 : -0.7); return Math.hypot(u.x - (theirBase.x + Math.cos(a) * 450), u.y - (theirBase.y + Math.sin(a) * 450)) < 180; }));
        if (ready) group.plan.stage = 1;
        sides.forEach((side, k) => side.forEach((u, i) => { const a = back + (k ? 0.7 : -0.7); cmdTask(game, team, u, 'flank' + k, { type: 'move', x: theirBase.x + Math.cos(a) * 450 + ((i % 3) - 1) * 36, y: theirBase.y + Math.sin(a) * 450, attackMove: true }); }));
        if (game.time - (group.plan.at || (group.plan.at = game.time)) > 90) group.plan.stage = 1;   // don't wait for ever
      } else fit.forEach((u, i) => cmdTask(game, team, u, 'close', { type: 'move', x: theirBase.x + ((i % 3) - 1) * 40, y: theirBase.y, attackMove: true }));
      break;
    }
    case 'raid':
    case 'splitRaid': {
      const ex = game.entities.filter(e => e.team === foe && e.type === 'extractor' && e.hp > 0 && known(e)).sort((a, b) => dist(a, cmdr) - dist(b, cmdr));
      if (!ex.length) { fit.forEach(u => cmdTask(game, team, u, 'search', { type: 'hunt', pack: false })); break; }
      const squads = style === 'splitRaid' && ex.length > 1 && fit.length > 2 ? [half(fit, 0), half(fit, 1)] : [fit];
      squads.forEach((sq, k) => { const t = ex[k] || ex[0]; sq.forEach(u => cmdTask(game, team, u, 'raid' + t.id, { type: 'attack', targetId: t.id })); });
      break;
    }
    case 'pack':
    case 'wolves': {
      const packs = style === 'wolves' && fit.length >= 4 ? [half(fit, 0), half(fit, 1)] : [fit];
      packs.forEach((p, k) => {
        if (p.some(u => u.cmdTask !== 'hunt' + k || u.order.type !== 'hunt')) {
          for (const u of p) u.cmdTask = 'hunt' + k;
          const ids = p.map(u => u.id);
          if (ids.length) issueCommand(game, team, { type: 'hunt', ids, pack: ids.length > 1, byCommander: true });
        }
      });
      break;
    }
  }
}

// --- Workers look after themselves ---
// Scavengers, Constructors and Repair Drones keep out of harm's way: they back
// off from enemy combat units and from anything shooting at them, go and get
// patched up when badly hurt, and Scavengers leave scrap where there's been
// fighting recently (such as the killing ground in front of your gun towers)
// until it has been quiet for a while. Their job resumes afterwards.
const WORKER_SAFETY = { harvester: 320, builder: 260, repairer: 230 };
const FIGHT_MEMORY = 25, FIGHT_RADIUS = 280;
// Where shots have landed lately (a sparse list of spots, any side).
function noteFighting(game, x, y) {
  const list = game.fighting || (game.fighting = []);
  if (list.some(f => game.time - f.t < 3 && Math.abs(f.x - x) < 120 && Math.abs(f.y - y) < 120)) return;
  list.push({ x, y, t: game.time });
  if (list.length > 200 || (list[0] && game.time - list[0].t > FIGHT_MEMORY)) game.fighting = list.filter(f => game.time - f.t < FIGHT_MEMORY);
}
// Scrap is dangerous while enemy combat units are near it, or while there has
// been fighting close by in the last FIGHT_MEMORY seconds.
function scrapIsDangerous(game, team, s) {
  for (const f of game.fighting || []) if (game.time - f.t < FIGHT_MEMORY && Math.abs(f.x - s.x) < FIGHT_RADIUS && Math.abs(f.y - s.y) < FIGHT_RADIUS && Math.hypot(f.x - s.x, f.y - s.y) < FIGHT_RADIUS) return true;
  let threat = false;
  forUnitsNear(game, s.x, s.y, 360, o => { if (!threat && o.team !== team && o.hp > 0 && o.def.role === 'combat' && isVisibleTo(game, team, o)) threat = true; });
  return threat;
}
// The nearest enemy that could hurt this worker: a combat vehicle it can see
// within reach, or an enemy tower it is about to drive into.
function workerThreat(game, u, R) {
  let best = null, bd = R;
  forUnitsNear(game, u.x, u.y, R, o => {
    if (o.team === u.team || o.hp <= 0 || o.def.role !== 'combat' || !isVisibleTo(game, u.team, o)) return;
    const d = dist(u, o); if (d < bd) { bd = d; best = o; }
  });
  if (!best) for (const b of game.entities) {
    if (b.kind !== 'building' || b.team === u.team || b.hp <= 0 || !b.def.weapon || b.built < 1) continue;
    if (dist(u, b) < b.def.weapon.range + 40 && isVisibleTo(game, u.team, b)) { best = b; break; }
  }
  return best;
}
// Returns true while it is busy keeping itself alive (its job waits).
function workerSurvival(game, u, dt) {
  if (u.repairTrip || u.order.type === 'deploy') return false;   // you sent it somewhere: it goes
  const T = CONFIG.TILE;
  const home = game.entities.find(e => e.team === u.team && (e.type === 'recycler' || e.type === 'mobileRecycler') && e.hp > 0);
  const goTo = (x, y) => {
    if (!u.path.length || (u.safeRepath = (u.safeRepath || 0) - dt) <= 0) { u.safeRepath = 0.8; planPath(game, u, x, y); }
    followPath(game, u, dt, 10);
  };
  // 1. Badly hurt: to a Repair Pad (or home, where Repair Drones can reach it).
  if (!u.patching && u.hp < u.maxHp * 0.5) {
    const pads = game.entities.filter(e => e.team === u.team && e.type === 'repairpad' && e.built >= 1);
    const pad = pads.sort((a, b) => dist(a, u) - dist(b, u))[0];
    const drones = u.def.role !== 'repairer' && game.entities.some(e => e.team === u.team && e.def.role === 'repairer' && e.hp > 0);
    if (pad) u.patching = { padId: pad.id };
    else if (drones && home) u.patching = { home: true, until: game.time + 30 };
    if (u.patching) { u.path = []; pushEvent(game, u.team, `${u.def.name} pulling back for repairs`, 'info', u.x, u.y); }
  }
  if (u.patching) {
    const pad = u.patching.padId && game.byId.get(u.patching.padId);
    const done = u.hp >= u.maxHp * 0.98 || (u.patching.padId && (!pad || pad.hp <= 0)) || (u.patching.home && (game.time > u.patching.until || !home));
    if (done) { u.patching = null; u.path = []; return false; }
    if (pad) { if (dist(u, pad) > pad.radius * 0.5) goTo(pad.x, pad.y); else u.path = []; }
    else if (home && dist(u, home) > home.radius + 90) goTo(home.x + 60, home.y + 60);
    else u.path = [];
    return true;
  }
  // 2. Danger close: back off toward home until it's quiet again.
  if ((u.safeCheck = (u.safeCheck || 0) - dt) <= 0) {
    u.safeCheck = 0.3;
    const th = workerThreat(game, u, WORKER_SAFETY[u.def.role]);
    const shotAt = u.lastHitAt > game.time - 1.5 && u.lastHitBy && u.lastHitBy.hp > 0 ? u.lastHitBy : null;
    if (th || shotAt) { u.fleeFrom = th || shotAt; u.fleeUntil = game.time + 4; }
  }
  if (u.fleeUntil > game.time && u.fleeFrom) {
    const f = u.fleeFrom;
    let x, y;
    if (home && dist(home, f) > dist(home, u) * 0.7) { x = home.x; y = home.y; }   // home is away from the danger
    else { const a = angleTo(f, u); x = u.x + Math.cos(a) * 260; y = u.y + Math.sin(a) * 260; }   // just away from it
    if (Math.hypot(u.x - x, u.y - y) > 80) goTo(x, y); else u.path = [];
    if (u.fleeUntil - game.time < 0.05) { u.fleeFrom = null; u.path = []; }
    return true;
  }
  return false;
}

// --- Specials, EMP, smoke, fire and mines ---
// What a shot leaves behind where it lands.
function impactExtras(game, p) {
  if (p.emp) {
    // EMP: shields drop and every vehicle in the blast stalls, friend or foe.
    for (const o of game.entities) {
      if (o.hp <= 0 || Math.hypot(o.x - p.tx, o.y - p.ty) > p.emp + (o.radius || 0)) continue;
      if (o.kind === 'unit') { o.empUntil = game.time + p.empTime; if (o.def.shield) { o.shield = 0; if (o.def.shieldReboot) o.shieldDown = o.def.shieldReboot; } }
    }
    for (const f of game.activeFields || []) {
      const b = game.byId.get(f.id);
      if (b && b.field && segmentDist(p.tx, p.ty, f.ax, f.ay, f.bx, f.by) < p.emp) b.field.hp = Math.max(0, b.field.hp - b.def.field.hp * 0.5);
    }
    game.effects.push({ kind: 'emp', x: p.tx, y: p.ty, t: 0, life: 0.6, r: p.emp });
  }
  if (p.smoke) (game.smokes = game.smokes || []).push({ x: p.tx, y: p.ty, r: p.smoke, until: game.time + p.smokeTime, born: game.time });
  if (p.fire) (game.fires = game.fires || []).push({ x: p.tx, y: p.ty, r: p.fire, until: game.time + p.fireTime, dps: p.fireDps, team: p.team, owner: p.owner, born: game.time });
}
const segmentDist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
};
// Every tick: who jams and who shoots down shells; smoke clears; fires burn; mines go off.
function updateBattlefield(game, dt) {
  game.jammers = []; game.pointDefence = [];
  for (const e of game.entities) {
    if (e.kind !== 'unit' || e.hp <= 0 || !e.def.special) continue;
    if (e.def.special.key === 'jammer') game.jammers.push(e);
    else if (e.def.special.key === 'pointdef') game.pointDefence.push(e);
  }
  if (game.smokes && game.smokes.length) game.smokes = game.smokes.filter(c => c.until > game.time);
  if (game.fires && game.fires.length) {
    game.fires = game.fires.filter(f => f.until > game.time);
    for (const f of game.fires) for (const o of game.entities)
      if (o.hp > 0 && o.team !== f.team && Math.hypot(o.x - f.x, o.y - f.y) < f.r + (o.radius || 0) * 0.5) damage(game, o, f.dps * dt, { kind: 'artillery', team: f.team, owner: f.owner, vsBuilding: 1 });
  }
  if (game.mines && game.mines.length) {
    for (const m of game.mines) {
      if (game.time < m.armAt) continue;
      let hit = null;
      forUnitsNear(game, m.x, m.y, 40, o => { if (!hit && o.team !== m.team && o.hp > 0 && Math.hypot(o.x - m.x, o.y - m.y) < 16 + o.radius) hit = o; });
      if (!hit) continue;
      m.done = true;
      for (const o of game.entities) if (o.hp > 0 && o.team !== m.team && Math.hypot(o.x - m.x, o.y - m.y) < m.splash + (o.radius || 0) * 0.5) damage(game, o, m.damage, { kind: 'artillery', team: m.team, owner: m.owner, vsBuilding: 0.5 });
      game.effects.push({ kind: 'boom', x: m.x, y: m.y, t: 0, life: 0.6, size: m.splash });
      game.events.push({ sound: 'boom', x: m.x, y: m.y });
    }
    game.mines = game.mines.filter(m => !m.done);
  }
}
// A vehicle's special ability, used on its own judgement.
function updateSpecial(game, u, dt) {
  const sp = u.def.special;
  u.spCd = (u.spCd || 0) - dt;
  switch (sp.key) {
    case 'shock': {
      const t = u.target;
      if (u.spCd <= 0 && t && t.hp > 0 && t.kind === 'unit' && edgeDist(u, t) <= sp.range && isVisibleTo(game, u.team, t) && stanceOf(game, u) !== 'stealth') {
        u.spCd = sp.cooldown;
        launchShot(game, u, t, { projectile: 'shock', damage: sp.damage, cooldown: sp.cooldown, range: sp.range, slow: sp.slow, slowTime: sp.slowTime, vsBuilding: 0.3 }, u.x, u.y, angleTo(u, t), edgeDist(u, t), false);
      }
      break;
    }
    case 'cloak': {
      // On for `on` seconds, then off for `off` while it recharges. Wanted on
      // Stealth, by unarmed vehicles, and by anything on the move with no target.
      u.cloakT = (u.cloakT || 0) - dt;
      if (u.cloakOn) { if (u.cloakT <= 0) { u.cloakOn = false; u.cloakT = sp.off; } }
      else if (u.cloakT <= 0) {
        const want = !u.def.weapon || stanceOf(game, u) === 'stealth' || (!u.target && u.movingTick >= game.tick - 1);
        if (want) { u.cloakOn = true; u.cloakT = sp.on; }
      }
      break;
    }
    case 'sensor': {
      if (u.spCd > 0) break;
      u.spCd = sp.every;
      const until = game.time + sp.lasts;
      game.teams[u.team].pings.push({ x: u.x, y: u.y, r: sp.radius, until });
      for (const e of game.entities) if (e.team !== u.team && e.hp > 0 && Math.hypot(e.x - u.x, e.y - u.y) < sp.radius) (e.revealed = e.revealed || {})[u.team] = until;
      for (const m of game.mines || []) if (m.team !== u.team && Math.hypot(m.x - u.x, m.y - u.y) < sp.radius) (m.seen = m.seen || {})[u.team] = until;
      game.effects.push({ kind: 'pulse', x: u.x, y: u.y, t: 0, life: 0.8, r: sp.radius, team: u.team });
      break;
    }
    case 'pointdef': u.pdCd = (u.pdCd || 0) - dt; break;
    case 'overdrive': {
      // Burst away when badly hurt under fire, or to close on a target out of reach.
      if (u.spCd > 0) break;
      const hurt = u.hp < u.maxHp * 0.5 && u.lastHitAt > game.time - 2;
      const chasing = u.target && u.target.hp > 0 && u.def.weapon && edgeDist(u, u.target) > u.def.weapon.range + 60 && u.movingTick >= game.tick - 1;
      if (hurt || chasing || u.retreating) { u.boostUntil = game.time + sp.time; u.spCd = sp.cooldown; game.effects.push({ kind: 'dust', x: u.x, y: u.y, t: 0, life: 0.5 }); }
      break;
    }
    case 'mines': {
      if (u.mines === undefined) u.mines = sp.carry;
      if (u.mines < sp.carry && u.spCd <= 0) { u.mines++; u.spCd = sp.recharge; }
      u.mineGap = (u.mineGap || 0) - dt;
      if (u.mines > 0 && u.mineGap <= 0 && u.movingTick >= game.tick - 1) {
        let near = false;
        forUnitsNear(game, u.x, u.y, 380, o => { if (!near && o.team !== u.team && o.hp > 0 && o.def.weapon && isVisibleTo(game, u.team, o)) near = true; });
        if (near) {
          const back = u.angle + Math.PI;
          (game.mines = game.mines || []).push({ x: u.x + Math.cos(back) * (u.radius + 10), y: u.y + Math.sin(back) * (u.radius + 10), team: u.team, owner: u.id, armAt: game.time + sp.arm, damage: sp.damage, splash: sp.splash });
          u.mines--; u.mineGap = 4; if (u.spCd <= 0) u.spCd = sp.recharge;
        }
      }
      break;
    }
  }
}

// --- Tidal Flats: the sea comes in over the sand and goes out again. ---
function tideIsHigh(game) {
  const T = CONFIG.TIDE, c = game.time % (T.low + T.high);
  return c >= T.low;
}
function updateTide(game) {
  const T = CONFIG.TIDE, c = game.time % (T.low + T.high), dt = 1 / CONFIG.TICK_RATE;
  // Warnings a little before it turns.
  for (const [at, text] of [[T.low - T.warn, `The tide is coming in: the sand flats flood in ${T.warn} seconds. Get off the sand!`],
                            [T.low + T.high - T.warn, `The tide is going out in ${T.warn} seconds: the sand flats will open up.`]])
    if (c >= at && c - dt < at) for (const t of [1, 2]) pushEvent(game, t, text, 'warn');
  const high = tideIsHigh(game);
  if ((game.map.tide === 'high') === high) return;
  setTide(game, high);
}
function setTide(game, high) {
  const m = game.map, T = CONFIG.TIDE, W = m.W, TL = CONFIG.TILE;
  m.tide = high ? 'high' : 'low';
  for (let i = 0; i < W * m.H; i++) if (m.tidal[i]) m.tiles[i] = high ? TILE_WATER : TILE_DIRT;
  m.tideVersion = (m.tideVersion || 0) + 1;   // tells the renderer to repaint
  for (const s of game.scrap) s.wet = high && !!m.tidal[Math.floor(s.y / TL) * W + Math.floor(s.x / TL)];
  if (high) {
    // Anything still on the sand is swamped and washed up on dry ground.
    for (const u of game.entities) {
      if (u.kind !== 'unit' || u.hp <= 0) continue;
      const tx = Math.floor(u.x / TL), ty = Math.floor(u.y / TL);
      if (!m.tidal[ty * W + tx]) continue;
      const spot = nearestOpenTile(game, tx, ty, 30);
      if (spot) { u.x = (spot.x + 0.5) * TL; u.y = (spot.y + 0.5) * TL; }
      damage(game, u, u.maxHp * T.swamp, { kind: 'artillery', team: 0, owner: 0 });
      game.effects.push({ kind: 'dust', x: u.x, y: u.y, t: 0, life: 0.6 });
    }
    for (const t of [1, 2]) pushEvent(game, t, 'High tide: the sand flats are under water. Only the causeways are open.', 'warn');
  } else {
    // Low tide washes fresh scrap up on the sand, the same on both sides.
    const flats = [];
    for (let i = 0; i < W * m.H; i++) if (m.tidal[i] && i < W * m.H - 1 - i) flats.push(i);
    for (let k = 0; k < T.washup && flats.length; k++) {
      const i = flats[Math.floor(game.rng() * flats.length)], x = (i % W + 0.5) * TL, y = (Math.floor(i / W) + 0.5) * TL;
      const id = Math.max(0, ...game.scrap.map(s => s.id)) + 1;
      game.scrap.push({ id, x, y, amount: T.washAmount, max: T.washAmount }, { id: id + 1, x: W * TL - x, y: m.H * TL - y, amount: T.washAmount, max: T.washAmount });
    }
    for (const t of [1, 2]) pushEvent(game, t, 'Low tide: the sand flats are open, and fresh scrap has washed up.', 'info');
  }
  // Routes planned across the sand (or round it) are out of date.
  for (const u of game.entities) if (u.kind === 'unit' && u.path && u.path.length) { const g = u.path[u.path.length - 1]; planPath(game, u, g.x, g.y); }
}

function damage(game, e, amount, p) {
  if (e.kind === 'building') amount *= p.vsBuilding || 1;
  // Walls: shells and HE / Bunker Busters hurt most, Plasma least.
  if (e.def.wallPiece) amount *= p.vsWall || (p.kind === 'artillery' ? WALL.vsArtillery : 1);
  else if (p.vsHeavy || p.vsLight) amount *= (HEAVY_KINDS.includes(baseType(e)) ? p.vsHeavy : p.vsLight) || 1;
  // Armour facing: a vehicle hit on the side or rear takes more (not by Artillery's splash).
  if (e.kind !== 'building' && p.kind !== 'artillery' && p.sx !== undefined) {
    const rel = Math.abs(wrapAngle(Math.atan2(p.sy - e.y, p.sx - e.x) - e.angle));
    if (rel > Math.PI * 2 / 3) amount *= CONFIG.ARMOR_REAR;
    else if (rel > Math.PI / 3) amount *= CONFIG.ARMOR_SIDE;
  }
  const wasAlive = e.hp > 0;
  if (e.shield > 0 && !p.pierceShield) {
    const soak = Math.min(e.shield, amount);
    e.shield -= soak; amount -= soak; e.shieldFlash = 0.15;
    if (e.shield <= 0 && e.def.shieldReboot) { e.shieldDown = e.def.shieldReboot; game.effects.push({ kind: 'shieldhit', x: e.x, y: e.y, t: 0, life: 0.5 }); }   // overwhelmed: it collapses
  }
  if (e.def.shield) e.shieldWait = e.def.shieldDelay;
  e.hp -= amount;
  e.hitFlash = 0.1;
  const shooter = game.byId.get(p.owner);
  if (shooter && shooter.hp > 0) { e.lastHitBy = shooter; e.lastHitAt = game.time; }
  noteFighting(game, e.x, e.y);
  if (wasAlive && e.hp <= 0 && shooter && shooter.kind === 'unit' && shooter.team !== e.team) creditKill(game, shooter);
  // Fight back if we were just standing around (unless told to hold fire).
  if (e.kind === 'unit' && e.def.weapon && shooter && e.order.type === 'idle' && !e.target && stanceOf(game, e) !== 'stealth') e.target = shooter;
  if (e.kind === 'unit' && !e.def.weapon && shooter && e.hp > 0) warnUnderAttack(game, e);
  if (e.kind === 'building' && e.hp > 0) warnUnderAttack(game, e);
}

// A kill for a vehicle: enough of them and it's promoted (CONFIG.VET_*).
function creditKill(game, u) {
  u.kills = (u.kills || 0) + 1;
  const rank = CONFIG.VET_KILLS.filter(k => u.kills >= k).length;
  if (rank <= (u.rank || 0)) return;
  u.rank = rank;
  const hp = Math.round(u.def.hp * (1 + CONFIG.VET_HP * rank));
  u.hp = Math.min(hp, u.hp + (hp - u.maxHp) + hp * 0.25); u.maxHp = hp;
  pushEvent(game, u.team, `${nameOf(u)} promoted to ${CONFIG.VET_NAMES[rank]}`, 'good', u.x, u.y);
}

function warnUnderAttack(game, e) {
  const tm = game.teams[e.team];
  if (game.time - (tm.lastAlarm || -99) < 12) return;
  tm.lastAlarm = game.time;
  pushEvent(game, e.team, `${nameOf(e)} under attack!`, 'bad', e.x, e.y);
}

function removeDead(game) {
  const dead = game.entities.filter(e => e.hp <= 0);
  if (!dead.length) return;
  for (const e of dead) {
    game.byId.delete(e.id);
    if (e.deployed) continue;
    if (e.kind === 'building' && e.geyserId) { const g = game.geysers.find(x => x.id === e.geyserId); if (g) g.extractorId = 0; }
    if (e.demolished) { demolishInto(game, e); continue; }
    if (e.recycled) { game.effects.push({ kind: 'recycle', team: e.team, x: e.x, y: e.y, t: 0, life: 0.9, r: e.radius }); continue; }
    if (e.kind === 'building') {
      setOccupied(game, e, -1); releaseBuilding(game, e);
      // Explosion, then a crater where the building stood.
      game.effects.push({ kind: 'explode', type: e.type, team: e.team, faction: e.faction, x: e.x, y: e.y, t: 0, life: 1.2, size: e.radius * 1.6 });
      game.effects.push({ kind: 'crater', type: e.type, faction: e.faction, x: e.x, y: e.y, t: 0, life: 90 });
      // Walls come down a piece at a time: one message every few seconds is enough.
      const quiet = e.def.wallPiece && game.time - (game.teams[e.team].wallMsgAt || -99) < 8;
      if (e.def.wallPiece && !quiet) game.teams[e.team].wallMsgAt = game.time;
      if (!quiet) {
        pushEvent(game, e.team, e.def.wallPiece ? `${nameOf(e)} breached` : `${nameOf(e)} destroyed`, 'bad', e.x, e.y);
        pushEvent(game, 3 - e.team, e.def.wallPiece ? `Enemy ${nameOf(e).toLowerCase()} breached` : `Enemy ${nameOf(e)} destroyed`, 'good', e.x, e.y);
      }
    } else {
      // Explosion, then a burnt-out wreck in the vehicle's own shape.
      game.effects.push({ kind: 'explode', type: baseType(e), team: e.team, faction: e.faction, x: e.x, y: e.y, t: 0, life: 1.2, size: e.radius * 2.2 });
      game.effects.push({ kind: 'wreck', type: baseType(e), team: e.team, faction: e.faction, mk: !!e.def.base, x: e.x, y: e.y, a: e.angle, t: 0, life: 20, r: e.radius });
      const salvage = Math.round(e.def.cost * CONFIG.WRECK_SCRAP_FRACTION);
      if (salvage > 0) game.scrap.push({ id: 100000 + e.id, x: e.x, y: e.y, amount: salvage, max: salvage, wreck: true });
      game.teams[e.team].stats.lost++;
      game.teams[3 - e.team].stats.killed++;
    }
    game.events.push({ sound: 'boom', x: e.x, y: e.y, big: e.kind === 'building' });
  }
  game.entities = game.entities.filter(e => e.hp > 0);
  for (const e of game.entities) {
    if (e.target && e.target.hp <= 0) e.target = null;
    if (e.lastHitBy && e.lastHitBy.hp <= 0) e.lastHitBy = null;
  }
}

// Taking a building down returns half of what it cost, as loose scrap piles
// on the ground where it stood. Scavengers can collect them.
function demolishInto(game, b) {
  setOccupied(game, b, -1); releaseBuilding(game, b);
  const value = Math.round((b.def.salvageValue ?? b.def.cost) * 0.5);
  const piles = Math.max(1, Math.ceil(value / 40));
  for (let i = 0; i < piles && value > 0; i++) {
    const a = i / piles * Math.PI * 2, r = piles > 1 ? b.radius * 0.5 : 0;
    const amt = i < piles - 1 ? Math.floor(value / piles) : value - Math.floor(value / piles) * (piles - 1);
    game.scrap.push({ id: 200000 + game.nextId++, x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r, amount: amt, max: amt, wreck: true });
  }
  game.effects.push({ kind: 'dust', x: b.x, y: b.y, t: 0, life: 0.8 });
  pushEvent(game, b.team, `${nameOf(b)} demolished: ${value} scrap left on the ground`, 'info', b.x, b.y);
}

// ---------------------------------------------------------------------------
// Scavengers and constructors
// ---------------------------------------------------------------------------

function nearestScrap(game, u, maxDist = Infinity) {
  let best = null, bd = maxDist;
  for (const s of game.scrap) {
    if (s.amount <= 0 || s.wet || scrapIsDangerous(game, u.team, s)) continue;
    if (!game.teams[u.team].explored[Math.floor(s.y / CONFIG.TILE) * game.map.W + Math.floor(s.x / CONFIG.TILE)]) continue;
    // Stay away from scrap that enemy combat units are sitting on.
    const d = dist(u, s);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function nearestDropoff(game, u) {
  let best = null, bd = Infinity;
  for (const e of game.entities) {
    if (e.kind !== 'building' || e.team !== u.team || !e.def.dropoff || e.built < 1) continue;
    const d = dist(u, e);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function autoHarvest(game, u) {
  const node = nearestScrap(game, u);
  if (node) { u.order = { type: 'harvest', nodeId: node.id, phase: 'toNode' }; planPath(game, u, node.x, node.y); }
  else u.order = { type: 'idle', gx: u.x, gy: u.y };
}

function updateHarvester(game, u, dt) {
  const o = u.order;
  if (o.phase === 'toNode' || o.phase === 'gather') {
    let node = game.scrap.find(s => s.id === o.nodeId && s.amount > 0 && !s.wet && !scrapIsDangerous(game, u.team, s));
    if (!node) {
      if (u.carry > 0 && u.carry >= u.def.carryMax * 0.5) { o.phase = 'return'; u.path = []; return; }
      node = nearestScrap(game, u, 900);
      if (!node) { o.phase = u.carry > 0 ? 'return' : 'wait'; u.path = []; return; }
      o.nodeId = node.id; o.phase = 'toNode'; planPath(game, u, node.x, node.y);
    }
    if (o.phase === 'toNode') {
      if (dist(u, node) < 22 || followPath(game, u, dt, 16)) {
        if (dist(u, node) < 40) o.phase = 'gather';
        else planPath(game, u, node.x, node.y);
      }
    } else {
      const take = Math.min(u.def.gatherRate * dt, node.amount, u.def.carryMax - u.carry);
      node.amount -= take; u.carry += take;
      if (game.tick % 8 === 0) game.effects.push({ kind: 'dust', x: node.x + (Math.random() - 0.5) * 16, y: node.y + (Math.random() - 0.5) * 16, t: 0, life: 0.5 });
      if (node.amount <= 0) game.scrap = game.scrap.filter(s => s !== node);
      if (u.carry >= u.def.carryMax - 0.01) { o.phase = 'return'; u.path = []; }
    }
  } else if (o.phase === 'return') {
    const drop = nearestDropoff(game, u);
    if (!drop) { o.phase = 'wait'; return; }
    if (o.dropId !== drop.id) { o.dropId = drop.id; u.path = []; }
    if (!u.path.length) planPathNear(game, u, drop);
    const arrived = followPath(game, u, dt, 12);
    if (edgeDist(u, drop) < drop.radius * 0.4 + u.radius + 20 || (arrived && edgeDist(u, drop) < 70)) {
      u.path = [];
      // If storage is full, wait at the base and retry once a second.
      if (o.fullWait && game.tick % 30 !== u.id % 30) return;
      const tm = game.teams[u.team];
      u.carry -= bankScrap(game, u.team, u.carry * tm.incomeMult) / tm.incomeMult;
      o.fullWait = u.carry > 0.5;
      if (u.carry > 0.5) return;
      u.carry = 0;
      o.phase = 'toNode';
      const node = game.scrap.find(s => s.id === o.nodeId && s.amount > 0) || nearestScrap(game, u);
      if (node) { o.nodeId = node.id; planPath(game, u, node.x, node.y); } else o.phase = 'wait';
    } else if (arrived) planPathNear(game, u, drop);
  } else if (o.phase === 'wait') {
    if (game.tick % 30 === u.id % 30) {
      const node = nearestScrap(game, u);
      if (node) { o.nodeId = node.id; o.phase = 'toNode'; planPath(game, u, node.x, node.y); }
      else if (u.carry > 0) o.phase = 'return';
    }
  }
}

function updateBuilder(game, u, dt) {
  const b = game.byId.get(u.order.targetId);
  if (!b || b.hp <= 0 || b.built >= 1) {
    // A wall run: on to the next piece.
    const q = u.order.queue || [];
    while (q.length) { const n = game.byId.get(q.shift()); if (n && n.hp > 0 && n.built < 1) { u.order.targetId = n.id; planPathNear(game, u, n); return; } }
    u.order = { type: 'idle', gx: u.x, gy: u.y }; u.path = []; return;
  }
  const close = edgeDist(u, b) < b.radius * 0.2 + u.radius + 30;
  if (!close) {
    if (followPath(game, u, dt, 10)) planPathNear(game, u, b);
    return;
  }
  u.path = [];
  u.angle = turnToward(u.angle, angleTo(u, b), 4 * dt);
  if (game.tick % 5 === 0) game.effects.push({ kind: 'weld', x: b.x + (Math.random() - 0.5) * b.radius * 1.4, y: b.y + (Math.random() - 0.5) * b.radius * 1.4, t: 0, life: 0.3 });
  const step = dt * (game.tempo || 1) / b.def.buildTime;
  b.built = Math.min(1, b.built + step);
  b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * step);
  // (A wall run is announced once, when its last piece is done.)
  if (b.built >= 1 && !(b.type === 'wall' && (u.order.queue || []).length)) pushEvent(game, b.team, b.type === 'wall' ? 'Wall complete' : `${nameOf(b)} complete`, 'good', b.x, b.y);
}

// ---------------------------------------------------------------------------
// Vision and victory
// ---------------------------------------------------------------------------

function updateVisibility(game) {
  const T = CONFIG.TILE, W = game.map.W, H = game.map.H;
  for (const t of [1, 2]) game.teams[t].vis.fill(0);
  for (const e of game.entities) {
    if (e.kind === 'building' && e.built < 1 && e.built < 0.05) continue;
    const tm = game.teams[e.team];
    const r = e.def.sight / T, cx = e.x / T, cy = e.y / T;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.floor(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.floor(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) {
        tm.vis[y * W + x] = 1; tm.explored[y * W + x] = 1;
      }
    }
  }
  // Radar pings light up a wide circle for a few seconds.
  for (const t of [1, 2]) {
    const tm = game.teams[t];
    tm.pings = tm.pings.filter(p => p.until > game.time);
    for (const p of tm.pings) {
      const r = p.r / T, cx = p.x / T, cy = p.y / T;
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.floor(cy + r)); y++)
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.floor(cx + r)); x++)
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) { tm.vis[y * W + x] = 1; tm.explored[y * W + x] = 1; }
    }
  }
  // Remember enemy buildings once you've seen them.
  for (const e of game.entities) if (e.kind === 'building') for (const t of [1, 2]) if (t !== e.team && isVisibleTo(game, t, e)) e.seen[t] = true;
}

// ---------------------------------------------------------------------------
// Shields. A Shield Projector throws a straight wall of force across the
// direction it faces, `offset` in front of it, `length` long. Enemy shots
// crossing the wall from the front are stopped and drain the field; at zero
// it collapses and reboots after `reboot` seconds (coming back at
// `rebootHp`), leaving the projector open. Untouched for `regenDelay`
// seconds it recharges. Projectors need power: each finished Power
// Generator powers `powers` of them (oldest first), and each powered one
// burns `upkeep` scrap a second; with the bank empty, the fields drop.
// ---------------------------------------------------------------------------

function fieldGeometry(b) {
  const F = b.def.field, dx = Math.cos(b.facing), dy = Math.sin(b.facing), at = b.fieldAt || b;   // a Shield Wall's field spans its whole run
  const cx = at.x + dx * F.offset, cy = at.y + dy * F.offset, h = F.length / 2;
  return { dx, dy, ax: cx - dy * h, ay: cy + dx * h, bx: cx + dy * h, by: cy - dx * h, cx, cy };
}

function segmentsCross(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (!d) return false;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d, u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function updateShields(game, dt) {
  const active = [];
  for (const t of [1, 2]) {
    const projectors = game.entities.filter(e => e.team === t && e.def.field && e.hp > 0 && e.built >= 1).sort((a, b) => a.id - b.id);
    const gens = game.entities.filter(e => e.team === t && e.type === 'generator' && e.hp > 0 && e.built >= 1).sort((a, b) => a.id - b.id);
    // How many projectors each Generator is powering (shown on it).
    // (A Shield Projector II draws 4/3 of a normal share.)
    const need = projectors.reduce((n, b) => n + (b.def.power || 1), 0);
    let left = Math.min(need, gens.reduce((n, g) => n + g.def.powers, 0));
    for (const g of gens) { g.powering = Math.min(g.def.powers, left); left -= g.powering; }
    if (!projectors.length) continue;
    const tm = game.teams[t];
    let capacity = gens.reduce((n, g) => n + g.def.powers, 0);
    const upkeep = BUILDING_TYPES.generator.upkeep;
    for (const b of projectors) {
      const F = b.def.field;
      if (!b.field) b.field = { hp: 0, state: 'down', t: F.reboot, lastHit: -99 };
      const draw = b.def.power || 1, powered = capacity >= draw - 1e-6 && tm.scrap > 0;
      if (powered) capacity -= draw;
      if (powered !== b.powered && b.powered !== undefined && !powered && b.field.state === 'up')
        pushEvent(game, t, tm.scrap > 0 ? 'Shield Projector has no power: build another Power Generator' : 'Out of scrap: shields are down', 'warn', b.x, b.y);
      b.powered = powered;
      if (!powered) { if (b.field.state === 'up') { b.field.state = 'down'; b.field.t = F.reboot; } b.field.hp = 0; continue; }
      tm.scrap = Math.max(0, tm.scrap - upkeep * draw * dt);
      const f = b.field;
      if (f.state === 'down') {
        f.t -= dt;
        if (f.t <= 0) { f.state = 'up'; f.hp = F.hp * F.rebootHp; pushEvent(game, t, 'Shield back up', 'good', b.x, b.y); }
        continue;
      }
      if (game.time - f.lastHit > F.regenDelay) f.hp = Math.min(F.hp, f.hp + F.regen * dt);
      active.push({ b, team: t, ...fieldGeometry(b) });
    }
  }
  game.activeFields = active;
}

function hitField(game, f, p) {
  const F = f.b.def.field, fld = f.b.field;
  fld.hp -= p.damage * (p.kind === 'artillery' ? F.vsArtillery : 1);
  fld.lastHit = game.time;
  // Where along the wall it struck, for the ripple.
  game.effects.push({ kind: 'shieldhit', x: p.x, y: p.y, t: 0, life: 0.35, team: f.team });
  if (fld.hp <= 0) {
    fld.hp = 0; fld.state = 'down'; fld.t = F.reboot;
    game.activeFields = game.activeFields.filter(x => x !== f);
    game.effects.push({ kind: 'shielddown', x: f.cx, y: f.cy, a: Math.atan2(f.dy, f.dx), len: F.length, t: 0, life: 0.8, team: f.team });
    pushEvent(game, f.team, `Shield collapsed: rebooting in ${F.reboot} s`, 'bad', f.b.x, f.b.y);
    pushEvent(game, 3 - f.team, 'Enemy shield down', 'good', f.b.x, f.b.y);
  }
}

// ---------------------------------------------------------------------------
// Uplinks: three capture-and-hold points, the middle of the map and two
// mirror-image points either side of it. Combat vehicles standing on one
// capture it (faster with more, up to three); both sides there: no change.
// Hold two at once for UPLINK_WIN seconds to win. Each one held also earns
// call-ins.
// ---------------------------------------------------------------------------

function placeUplinks(game) {
  const T = CONFIG.TILE, W = game.map.W, H = game.map.H;
  const c = { x: W / 2, y: H / 2 };
  const b1 = game.map.bases[1], b2 = game.map.bases[2];
  // Across the line between the two corners, a third of the way to the edge.
  let px = -(b2.y - b1.y), py = b2.x - b1.x;
  const n = Math.hypot(px, py) || 1; px /= n; py /= n;
  const reach = Math.min(W, H) * 0.3;
  const spots = [c, { x: c.x + px * reach, y: c.y + py * reach }, { x: c.x - px * reach, y: c.y - py * reach }];
  game.uplinks = spots.map((p, i) => {
    const t = nearestOpenTile(game, Math.floor(p.x), Math.floor(p.y), 12) || { x: Math.floor(p.x), y: Math.floor(p.y) };
    return { id: i + 1, x: (t.x + 0.5) * T, y: (t.y + 0.5) * T, owner: 0, p: 0, contested: false };
  });
  game.uplinkHold = { team: 0, since: 0 };
}

function updateUplinks(game, dt) {
  const R = CONFIG.UPLINK_RADIUS;
  for (const u of game.uplinks) {
    const n = { 1: 0, 2: 0 };
    forUnitsNear(game, u.x, u.y, R, e => { if (e.hp > 0 && e.def.role === 'combat' && dist(e, u) <= R) n[e.team]++; });
    u.contested = n[1] > 0 && n[2] > 0;
    const was = u.owner;
    if (!u.contested && (n[1] || n[2])) {
      const t = n[1] ? 1 : 2, sign = t === 1 ? 1 : -1;
      u.p = Math.max(-1, Math.min(1, u.p + sign * Math.min(3, n[t]) * dt / CONFIG.UPLINK_CAPTURE));
      if (u.p >= 1) u.owner = 1; else if (u.p <= -1) u.owner = 2;
      else if ((u.owner === 1 && u.p <= 0) || (u.owner === 2 && u.p >= 0)) u.owner = 0;
    }
    if (u.owner !== was) {
      if (u.owner) { pushEvent(game, u.owner, 'Uplink captured', 'good', u.x, u.y); pushEvent(game, 3 - u.owner, 'Uplink lost to the enemy', 'bad', u.x, u.y); }
      else if (was) pushEvent(game, was, 'Uplink lost', 'bad', u.x, u.y);
    }
  }
  for (const t of [1, 2]) {
    const tm = game.teams[t], held = game.uplinks.filter(u => u.owner === t).length;
    // Call-ins earned by the uplinks held.
    if (held && tm.callins < CONFIG.CALLIN_MAX) {
      tm.callinProgress += held * dt / CONFIG.CALLIN_EARN;
      if (tm.callinProgress >= 1) { tm.callinProgress -= 1; tm.callins++; pushEvent(game, t, 'Call-in ready', 'good'); }
    }
  }
  const holder = game.time < CONFIG.UPLINK_ONLINE ? 0 : [1, 2].find(t => game.uplinks.filter(u => u.owner === t).length >= 2) || 0;
  if (!game.uplinksOnline && game.time >= CONFIG.UPLINK_ONLINE) {
    game.uplinksOnline = true;
    for (const t of [1, 2]) pushEvent(game, t, 'Uplinks online: hold two of the three to win', 'info');
  }
  if (holder !== game.uplinkHold.team) {
    game.uplinkHold = { team: holder, since: game.time };
    if (holder) { pushEvent(game, holder, 'You hold two uplinks: keep them to win', 'good'); pushEvent(game, 3 - holder, 'The enemy holds two uplinks: take one back!', 'bad'); }
  }
}

// Call-ins land a few seconds after they're called.
function updateDrops(game) {
  for (const d of game.drops) {
    if (game.time < d.at) continue;
    d.done = true;
    if (d.kind === 'supply') {
      const amount = CALLINS.supply.scrap, banked = bankScrap(game, d.team, amount, true);
      if (amount - banked > 0) game.scrap.push({ id: 400000 + game.nextId++, x: d.x, y: d.y, amount: amount - banked, max: amount - banked, wreck: true });
      pushEvent(game, d.team, `Supply drop: +${amount} scrap`, 'good', d.x, d.y);
    } else {
      const ids = CALLINS.reinforce.units.map((type, i) => {
        const a = i * Math.PI / 2;
        const u = addUnitNear(game, type, d.team, d.x + Math.cos(a) * 30, d.y + Math.sin(a) * 30);
        if (d.cmdr) u.cmdr = 'player';
        return u.id;
      });
      pushEvent(game, d.team, 'Reinforcements have landed', 'good', d.x, d.y);
      game.lastDrop = { team: d.team, ids, at: game.time };
    }
    game.effects.push({ kind: 'boom', x: d.x, y: d.y, size: 40, t: 0, life: 0.6 });
  }
  game.drops = game.drops.filter(d => !d.done);
}

function checkVictory(game) {
  const hold = game.uplinkHold;
  if (hold && hold.team && game.time - hold.since >= CONFIG.UPLINK_WIN) {
    game.winner = hold.team;
    game.endReason = `${sideName(game, hold.team)} held two uplinks for ${Math.round(CONFIG.UPLINK_WIN / 60 * 10) / 10} minutes.`;
    return;
  }
  for (const t of [1, 2]) {
    // The one rule of victory: destroy the enemy Recycler.
    if (!game.entities.some(e => e.team === t && (e.type === 'recycler' || e.type === 'mobileRecycler'))) {
      game.winner = 3 - t; game.endReason = `${sideName(game, t)} lost their ${factionName(game.teams[t].faction, 'Recycler')}.`; return;
    }
  }
}

// ---------------------------------------------------------------------------
// Saving and loading. A save is the whole game object as text: everything
// in it is plain data except the random-number generator (saved as its
// position in the sequence) and links between objects (a vehicle's target,
// a squad's objective, a route point), which are saved as references so a
// loaded game is the same web of objects and plays on exactly as it would
// have. Unit and building definitions are saved by name; typed arrays
// (terrain, fog) as base64 text.
// ---------------------------------------------------------------------------

const SAVE_VERSION = 1;

function saveDefs() {
  const m = new Map();
  for (const [k, d] of Object.entries(UNIT_TYPES)) m.set(d, 'u:' + k);
  for (const [k, d] of Object.entries(BUILDING_TYPES)) {
    m.set(d, 'b:' + k);
    if (d.upgrade) m.set(d.upgrade, 'bu:' + k);
    (d.upgrades || []).forEach((o, i) => m.set(o, 'bo:' + k + ':' + i));
  }
  for (const [k, d] of Object.entries(RESEARCH)) m.set(d, 'r:' + k);
  return m;
}

function bytesToB64(v) {
  const u8 = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(text) {
  const s = atob(text), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

// The game as text. `extra` is anything the screen wants back (camera, ...).
function saveGame(game, extra = {}) {
  const defs = saveDefs(), ids = new Map();
  let next = 1;
  const enc = v => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    if (defs.has(v)) return { $s: defs.get(v) };
    if (ids.has(v)) return { $r: ids.get(v) };
    const id = next++; ids.set(v, id);
    if (ArrayBuffer.isView(v)) return { $id: id, $t: v.constructor.name, d: bytesToB64(v) };
    if (v instanceof Map) return { $id: id, $m: [...v.entries()].map(([k, x]) => [enc(k), enc(x)]) };
    if (Array.isArray(v)) return { $id: id, $a: v.map(enc) };
    const o = { $id: id };
    for (const k in v) { const x = enc(v[k]); if (x !== undefined) o[k] = x; }
    return o;
  };
  const { rng, byId, events, ugrid, activeFields, wallGrid, gateGrid, wallId, ...rest } = game;
  return JSON.stringify({ v: SAVE_VERSION, rng: rng.state(), game: enc(rest), extra });
}

// Back from text to a game. Returns { game, extra }; throws on a bad file.
function loadGame(text) {
  const snap = JSON.parse(text);
  if (!snap || snap.v !== SAVE_VERSION || !snap.game) throw new Error('Not a Scrapline save (or from a different version)');
  const defs = new Map([...saveDefs()].map(([d, k]) => [k, d])), objs = new Map();
  const dec = v => {
    if (v === null || typeof v !== 'object') return v;
    if ('$n' in v) return Number(v.$n);
    if ('$s' in v) return defs.get(v.$s);
    if ('$r' in v) return objs.get(v.$r);
    if ('$t' in v) {
      const bytes = b64ToBytes(v.d), T = globalThis[v.$t];
      const out = T === Uint8Array ? bytes : new T(bytes.buffer, 0, bytes.byteLength / T.BYTES_PER_ELEMENT);
      objs.set(v.$id, out); return out;
    }
    if ('$m' in v) { const m = new Map(); objs.set(v.$id, m); for (const [k, x] of v.$m) m.set(dec(k), dec(x)); return m; }
    if ('$a' in v) { const a = []; objs.set(v.$id, a); for (const x of v.$a) a.push(dec(x)); return a; }
    const o = {};
    objs.set(v.$id, o);
    for (const k in v) if (k !== '$id') o[k] = dec(v[k]);
    return o;
  };
  const game = dec(snap.game);
  game.rng = makeRng(0); game.rng.setState(snap.rng);
  game.byId = new Map(game.entities.map(e => [e.id, e]));
  rebuildWallGrids(game);
  // Saves from before formations were removed: those vehicles just stop.
  for (const e of game.entities) if (e.kind === 'unit' && e.order.type === 'formation') e.order = { type: 'idle', gx: e.x, gy: e.y };
  delete game.formations; delete game.nextFormationId;
  game.events = [];
  return { game, extra: snap.extra || {} };
}

