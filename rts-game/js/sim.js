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
function createGame({ seed = Date.now() % 100000, difficulty = 'normal', aiTeams = [2], factions = {}, mapSeed = seed, bonus = {}, uplinks = false, tempo = 1 } = {}) {
  const map = generateMap(mapSeed);
  const game = {
    map, seed, difficulty, aiTeams,
    rng: makeRng(seed * 7 + 1),
    tick: 0, time: 0,
    entities: [], byId: new Map(), nextId: 1,
    projectiles: [], effects: [], events: [],
    occupied: new Uint8Array(map.W * map.H),
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
  game.entities.push(b); game.byId.set(b.id, b);
  return b;
}

// Shield Projectors face one of eight directions.
const snapFacing = a => Math.round(a / (Math.PI / 4)) * (Math.PI / 4);

function setOccupied(game, b, delta) {
  if (b.def.walkable) return;  // vehicles drive over repair pads
  for (let y = b.ty; y < b.ty + b.size; y++)
    for (let x = b.tx; x < b.tx + b.size; x++) game.occupied[y * game.map.W + x] += delta;
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

const isBank = b => b.kind === 'building' && b.built >= 1 && !!b.def.capacity;

// ---------------------------------------------------------------------------
// Building placement rules
// ---------------------------------------------------------------------------

function canPlaceBuilding(game, team, type, tx, ty) {
  const def = BUILDING_TYPES[type], m = game.map;
  const tm = game.teams[team];
  for (let y = ty; y < ty + def.size; y++) for (let x = tx; x < tx + def.size; x++) {
    if (x < 1 || y < 1 || x >= m.W - 1 || y >= m.H - 1) return { ok: false, why: 'Off the map' };
    const i = y * m.W + x;
    if (!tm.explored[i]) return { ok: false, why: 'Unexplored ground' };
    if (isBlockedTile(game, x, y)) return { ok: false, why: 'Something is in the way' };
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
  // Any new order ends a trip to the Repair Pad (Go repair sets it again below).
  for (const u of units) u.repairTrip = 0;
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
      units.forEach((u, i) => {
        u.order = { type: 'move', gx: slots[i].x, gy: slots[i].y, attackMove: !!cmd.attackMove };
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
      const u = units.find(x => x.def.role === 'builder');
      const def = BUILDING_TYPES[cmd.building];
      if (!u || !def || def.buildable === false) return;
      const tm = game.teams[team];
      if (def.requires && !tm.research[def.requires]) { pushEvent(game, team, `Research ${RESEARCH[def.requires].name} at a Research Lab first`, 'warn'); return; }
      if (tm.scrap < def.cost) { pushEvent(game, team, 'Not enough scrap', 'warn'); return; }
      const check = canPlaceBuilding(game, team, cmd.building, cmd.tx, cmd.ty);
      if (!check.ok) { pushEvent(game, team, check.why, 'warn'); return; }
      tm.scrap -= def.cost;
      const b = addBuilding(game, cmd.building, team, cmd.tx, cmd.ty, false);
      if (def.facing) b.facing = typeof cmd.facing === 'number' ? cmd.facing : snapFacing(b.turret);
      u.order = { type: 'build', targetId: b.id };
      planPathNear(game, u, b);
      break;
    }
    case 'repair': {
      const b = own(cmd.targetId);
      if (!b || b.kind !== 'building') return;
      // Finishing construction is any Constructor's job; repairing needs a Constructor II.
      const able = units.filter(u => u.def.role === 'builder' && (b.built < 1 || u.def.canRepair));
      if (!able.length && units.some(u => u.def.role === 'builder')) { pushEvent(game, team, 'Only a Constructor II can repair buildings', 'warn'); return; }
      for (const u of able) { u.order = { type: 'build', targetId: b.id }; planPathNear(game, u, b); }
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
        if (b.paid) bankScrap(game, team, UNIT_TYPES[type].cost);
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
      if (!['aggressive', 'return', 'stealth'].includes(cmd.stance)) return;
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
  u.path = findPath(game, u.x, u.y, x, y);
  u.lastPlan = { x, y, t: game.time, failed: !u.path.length };
  u.stuck = 0;
}

function planPathNear(game, u, b) {
  const a = angleTo(b, u);
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
      if (b.upgradeKey) {
        // A Gun Tower becomes a different kind of tower: new name and gun.
        b.variant = up.key;
        b.def = Object.assign({}, b.def, { name: up.name, weapon: up.weapon, desc: up.desc, upgrades: null });
        b.cooldown = 0;
      }
      pushEvent(game, b.team, `${up.name} ready`, 'good', b.x, b.y);
    }
  }
  if (b.researching) {
    const r = RESEARCH[b.researching.key];
    b.researching.t += dt * (game.tempo || 1);
    if (b.researching.t >= r.time) {
      game.teams[b.team].research[b.researching.key] = true;
      pushEvent(game, b.team, r.unlocks ? `${r.name} researched: you can build ${r.unlocks}.` : `${r.name} researched. Build them at a Factory II.`, 'good', b.x, b.y);
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
        game.teams[b.team].pings.push({ x: b.x, y: b.y, r: b.def.ping.radius, until: game.time + 0.7 });
        if ((b.sweep = (b.sweep || 0) + 1) % 8 === 1) game.effects.push({ kind: 'ping', team: b.team, x: b.x, y: b.y, r: b.def.ping.radius, t: 0, life: 1.6 });
      }
    } else if (b.pingTimer <= 0) {
      const p = b.def.ping;
      b.pingTimer = lv && lv.pingEvery ? lv.pingEvery : p.every;
      game.teams[b.team].pings.push({ x: b.x, y: b.y, r: p.radius, until: game.time + p.lasts });
      game.effects.push({ kind: 'ping', team: b.team, x: b.x, y: b.y, r: p.radius, t: 0, life: 1.6 });
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
      if (tm.scrap >= def.cost) { tm.scrap -= def.cost; b.paid = true; b.waiting = false; }
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
    if (u.shieldWait > 0) u.shieldWait -= dt;
    else u.shield = Math.min(u.def.shield, u.shield + u.def.shieldRegen * dt);
  }
  if (u.def.deployable && u.deployed) { updateDugIn(game, u, dt); return; }
  const o = u.order;
  switch (o.type) {
    case 'idle': {
      const st = u.def.weapon ? stanceOf(game, u) : null;
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
      const st = o.attackMove ? 'aggressive' : stanceOf(game, u);
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
    case 'deploy': updateDeploy(game, u, dt); break;
  }
}

// How a vehicle behaves on the move and when idle:
//   'aggressive'  fights anything it meets, chasing a little (the default)
//   'return'      fires at what's in range but keeps to its course or spot
//   'stealth'     holds fire and just goes where it's sent
// The computer opponent gives its orders exactly (attack-move or not), so
// its vehicles have no stance (null) and behave as they always have.
const stanceOf = (game, u) => u.stance || (game.aiTeams.includes(u.team) && !u.cmdr ? null : 'aggressive');

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
    if (hasClearLine(game, u.x, u.y, gx, gy)) u.path = [{ x: gx, y: gy }]; else planPath(game, u, gx, gy);
  }
  if (followPath(game, u, dt, 30) && !goal.id) { holder.target = null; o.planned = null; }
  aimAtNearby(game, u, dt);
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
  const want = avoidSteer(game, u, angleTo(u, wp));
  u.movingTick = game.tick;
  u.angle = turnToward(u.angle, want, 5 * dt);
  const facing = Math.cos(wrapAngle(want - u.angle));
  const step = Math.min(d, u.def.speed * dt * Math.max(0.25, facing) * (u.slowF || 1));
  const ox = u.x, oy = u.y;
  moveWithCollision(game, u, Math.cos(want) * step, Math.sin(want) * step);
  const moved = Math.hypot(u.x - ox, u.y - oy);
  if (moved < step * 0.3) u.stuck += dt; else u.stuck = Math.max(0, u.stuck - dt);
  if (u.stuck > 1.2) {
    const goal = u.path[u.path.length - 1];
    if (u.stuck > 3.5 || dist(u, goal) < 50) { u.path = []; u.stuck = 0; return true; }
    u.path = findPath(game, u.x, u.y, goal.x, goal.y);
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
  u.slowF = 1;
  if (ahead === Infinity) return want;
  // A friend ahead driving the same way: fall in behind it at its pace
  // instead of swerving round (that's what made columns jostle and spread).
  if (blocker.team === u.team && blocker.movingTick >= game.tick - 1 && Math.cos(wrapAngle(blocker.angle - want)) > 0.7) {
    u.slowF = Math.max(0.35, Math.min(1, (ahead - clear * 0.6) / look + 0.25));
    return want + (lat > 3 ? -0.2 : 0.2) * (1 - Math.abs(lat) / clear);
  }
  // The closer and more central the obstacle, the harder the turn.
  const turn = 0.95 * (1 - Math.abs(lat) / clear) * (1 - 0.5 * ahead / look) + 0.25;
  return want + (lat > 3 ? -turn : turn);
}

function moveWithCollision(game, u, dx, dy) {
  const wasBlocked = isBlockedAt(game, u.x, u.y);
  const nx = u.x + dx, ny = u.y + dy;
  if (wasBlocked || !isBlockedAt(game, nx, ny)) { u.x = nx; u.y = ny; return; }
  if (!isBlockedAt(game, nx, u.y)) { u.x = nx; return; }
  if (!isBlockedAt(game, u.x, ny)) { u.y = ny; }
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
      if (hasClearLine(game, u.x, u.y, gx, gy)) u.path = [{ x: gx, y: gy }];
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
function hitChance(game, e, t, d) {
  if (t.kind === 'building') return 1;
  const w = e.def.weapon;
  let k = (CONFIG.ACCURACY[w.projectile] || 0.9) * (1 - CONFIG.ACC_RANGE * Math.min(1, d / w.range));
  if (e.kind === 'unit' && e.movingTick >= game.tick - 1) k *= CONFIG.ACC_SHOOTER_MOVING;
  if (t.movingTick >= game.tick - 1) k *= 1 - CONFIG.ACC_TARGET_SPEED * t.def.speed;
  return Math.max(CONFIG.ACC_MIN, Math.min(0.98, k));
}

function aimAndFire(game, e, t, dt) {
  const w = e.def.weapon;
  const d = edgeDist(e, t);
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
  e.cooldown = w.cooldown;
  e.lastShot = game.time;  // drives barrel recoil and the muzzle flash
  const mx = e.x + Math.cos(e.turret) * (e.radius + 4), my = e.y + Math.sin(e.turret) * (e.radius + 4);
  const p = { kind: w.projectile, team: e.team, owner: e.id, x: mx, y: my, sx: mx, sy: my, damage: w.damage, splash: w.splash || 0, vsBuilding: w.vsBuilding };
  if (w.projectile === 'artillery') {
    const spread = 20 + d * 0.06;
    p.tx = t.x + (game.rng() - 0.5) * spread; p.ty = t.y + (game.rng() - 0.5) * spread;
    p.speed = 260; p.total = Math.hypot(p.tx - mx, p.ty - my);
  } else {
    p.speed = w.projectile === 'bullet' ? 900 : w.projectile === 'rocket' ? 520 : 620;
    if (game.rng() < hitChance(game, e, t, d)) { p.targetId = t.id; p.tx = t.x; p.ty = t.y; }
    else {
      // A miss: it flies a little wide and lands beyond the target.
      const a = angleTo(e, t) + (game.rng() < 0.5 ? -1 : 1) * (0.08 + game.rng() * 0.12);
      const len = dist(e, t) + 30 + game.rng() * 60;
      p.tx = mx + Math.cos(a) * len; p.ty = my + Math.sin(a) * len; p.miss = true;
    }
  }
  game.projectiles.push(p);
  game.effects.push({ kind: 'flash', x: mx, y: my, a: e.turret, t: 0, life: 0.08, big: w.projectile !== 'bullet' });
  game.events.push({ sound: w.projectile, x: mx, y: my });
}

function updateProjectiles(game, dt) {
  const fields = game.activeFields || [];
  for (const p of game.projectiles) {
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
        for (const o of game.entities) {
          if (o.hp <= 0 || o.team === p.team) continue;
          const od = Math.max(0, Math.hypot(o.x - p.tx, o.y - p.ty) - o.radius * 0.5);
          if (od < p.splash) damage(game, o, p.damage * (1 - 0.6 * od / p.splash), p);
        }
        game.effects.push({ kind: 'boom', x: p.tx, y: p.ty, t: 0, life: 0.6, size: p.splash });
        game.events.push({ sound: 'boom', x: p.tx, y: p.ty });
      } else if (p.miss) {
        game.effects.push({ kind: 'dust', x: p.tx, y: p.ty, t: 0, life: 0.4 });
      } else {
        const t = game.byId.get(p.targetId);
        if (t && t.hp > 0) damage(game, t, p.damage, p);
        game.effects.push({ kind: 'spark', x: p.tx, y: p.ty, t: 0, life: 0.25, big: p.kind !== 'bullet' });
      }
    } else {
      p.x += (p.tx - p.x) / d * step; p.y += (p.ty - p.y) / d * step;
    }
  }
  game.projectiles = game.projectiles.filter(p => !p.done);
}

function damage(game, e, amount, p) {
  if (e.kind === 'building') amount *= p.vsBuilding || 1;
  if (e.shield > 0) {
    const soak = Math.min(e.shield, amount);
    e.shield -= soak; amount -= soak; e.shieldFlash = 0.15;
  }
  if (e.def.shield) e.shieldWait = e.def.shieldDelay;
  e.hp -= amount;
  e.hitFlash = 0.1;
  const shooter = game.byId.get(p.owner);
  if (shooter && shooter.hp > 0) { e.lastHitBy = shooter; e.lastHitAt = game.time; }
  // Fight back if we were just standing around (unless told to hold fire).
  if (e.kind === 'unit' && e.def.weapon && shooter && e.order.type === 'idle' && !e.target && stanceOf(game, e) !== 'stealth') e.target = shooter;
  if (e.kind === 'unit' && !e.def.weapon && shooter && e.hp > 0) warnUnderAttack(game, e);
  if (e.kind === 'building' && e.hp > 0) warnUnderAttack(game, e);
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
      setOccupied(game, e, -1);
      // Explosion, then a crater where the building stood.
      game.effects.push({ kind: 'explode', type: e.type, team: e.team, faction: e.faction, x: e.x, y: e.y, t: 0, life: 1.2, size: e.radius * 1.6 });
      game.effects.push({ kind: 'crater', type: e.type, faction: e.faction, x: e.x, y: e.y, t: 0, life: 90 });
      pushEvent(game, e.team, `${nameOf(e)} destroyed`, 'bad', e.x, e.y);
      pushEvent(game, 3 - e.team, `Enemy ${nameOf(e)} destroyed`, 'good', e.x, e.y);
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
  setOccupied(game, b, -1);
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
    if (s.amount <= 0) continue;
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
    let node = game.scrap.find(s => s.id === o.nodeId && s.amount > 0);
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
  if (!b || b.hp <= 0 || (b.built >= 1 && (b.hp >= b.maxHp || !u.def.canRepair))) { u.order = { type: 'idle', gx: u.x, gy: u.y }; u.path = []; return; }
  const close = edgeDist(u, b) < b.radius * 0.2 + u.radius + 30;
  if (!close) {
    if (followPath(game, u, dt, 10)) planPathNear(game, u, b);
    return;
  }
  u.path = [];
  u.angle = turnToward(u.angle, angleTo(u, b), 4 * dt);
  if (game.tick % 5 === 0) game.effects.push({ kind: 'weld', x: b.x + (Math.random() - 0.5) * b.radius * 1.4, y: b.y + (Math.random() - 0.5) * b.radius * 1.4, t: 0, life: 0.3 });
  if (b.built < 1) {
    const step = dt * (game.tempo || 1) / b.def.buildTime;
    b.built = Math.min(1, b.built + step);
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * step);
    if (b.built >= 1) {
      pushEvent(game, b.team, `${nameOf(b)} complete`, 'good', b.x, b.y);
    }
  } else {
    b.hp = Math.min(b.maxHp, b.hp + u.def.repairRate * dt);
  }
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
  const F = b.def.field, dx = Math.cos(b.facing), dy = Math.sin(b.facing);
  const cx = b.x + dx * F.offset, cy = b.y + dy * F.offset, h = F.length / 2;
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
    const projectors = game.entities.filter(e => e.team === t && e.type === 'shield' && e.hp > 0 && e.built >= 1).sort((a, b) => a.id - b.id);
    const gens = game.entities.filter(e => e.team === t && e.type === 'generator' && e.hp > 0 && e.built >= 1).sort((a, b) => a.id - b.id);
    // How many projectors each Generator is powering (shown on it).
    let left = Math.min(projectors.length, gens.reduce((n, g) => n + g.def.powers, 0));
    for (const g of gens) { g.powering = Math.min(g.def.powers, left); left -= g.powering; }
    if (!projectors.length) continue;
    const tm = game.teams[t];
    let capacity = gens.reduce((n, g) => n + g.def.powers, 0);
    const upkeep = BUILDING_TYPES.generator.upkeep;
    for (const b of projectors) {
      const F = b.def.field;
      if (!b.field) b.field = { hp: 0, state: 'down', t: F.reboot, lastHit: -99 };
      const powered = capacity > 0 && tm.scrap > 0;
      if (capacity > 0) capacity--;
      if (powered !== b.powered && b.powered !== undefined && !powered && b.field.state === 'up')
        pushEvent(game, t, tm.scrap > 0 ? 'Shield Projector has no power: build another Power Generator' : 'Out of scrap: shields are down', 'warn', b.x, b.y);
      b.powered = powered;
      if (!powered) { if (b.field.state === 'up') { b.field.state = 'down'; b.field.t = F.reboot; } b.field.hp = 0; continue; }
      tm.scrap = Math.max(0, tm.scrap - upkeep * dt);
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
  const { rng, byId, events, ugrid, activeFields, ...rest } = game;
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
  // Saves from before formations were removed: those vehicles just stop.
  for (const e of game.entities) if (e.kind === 'unit' && e.order.type === 'formation') e.order = { type: 'idle', gx: e.x, gy: e.y };
  delete game.formations; delete game.nextFormationId;
  game.events = [];
  return { game, extra: snap.extra || {} };
}

