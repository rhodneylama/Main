// =============================================================================
// main.js — CONTROLS, SCREEN PANELS AND THE GAME LOOP
//
// Turns your mouse and keyboard into commands, keeps the panels at the top
// and bottom of the screen up to date, and runs the game clock.
// =============================================================================

const $ = id => document.getElementById(id);
// Phones and tablets get touch controls and touch wording in the help text.
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);
const canvas = $('game'), ctx = canvas.getContext('2d');
const mini = $('minimap'), miniCtx = mini.getContext('2d');

let game = null;
const view = {
  team: 1, cam: { x: 0, y: 0, zoom: 1 }, selected: [], placing: null, mouseWorld: null,
  drag: null, pings: [], alerts: [], revealAll: false, screenW: 0, screenH: 0, attackMode: false, aim: null,
};
const input = { keys: new Set(), mouseX: 0, mouseY: 0, inside: false, groups: {}, lastClick: 0, panning: null };
let paused = false, speed = 1, accumulator = 0, lastFrame = 0, spectating = false;

// -----------------------------------------------------------------------------
// Starting and ending a battle
// -----------------------------------------------------------------------------

function startGame(difficulty, watch = false) {
  spectating = watch;
  const seed = Number(new URLSearchParams(location.search).get('seed')) || Math.floor(Math.random() * 99999);
  game = createGame({ seed, difficulty, aiTeams: watch ? [1, 2] : [2] });
  buildTerrain(game);
  minimapBase = null;
  view.selected = []; view.placing = null; view.revealAll = watch; view.pings = []; view.alerts = [];
  input.groups = {};
  resize();
  // Small screens start zoomed out so more of the battlefield fits.
  view.cam.zoom = Math.max(0.55, Math.min(1, Math.min(view.screenW, view.screenH) / 700));
  centerOn(game.entities.find(e => e.team === 1 && e.type === 'recycler'));
  $('menu').classList.add('hidden');
  $('end').classList.add('hidden');
  $('log').innerHTML = '';
  paused = false; speed = 1; $('speedval').textContent = '×1';
  logMessage(watch ? 'Spectating: two AI commanders fight it out.' : 'Build up, defend your Recycler, and destroy the enemy base. Good luck, Commander.', 'info');
  refreshPanel();
}

function showEnd() {
  const won = game.winner === view.team;
  $('end-title').textContent = spectating ? `${TEAMS[game.winner].name} wins` : won ? 'Victory' : 'Defeat';
  $('end-title').className = won || spectating ? 'win' : 'lose';
  $('end-reason').textContent = game.endReason;
  const s1 = game.teams[1].stats, s2 = game.teams[2].stats;
  const mins = Math.floor(game.time / 60), secs = Math.floor(game.time % 60);
  $('end-stats').innerHTML = `
    <tr><th></th><th style="color:${TEAMS[1].color}">${TEAMS[1].name}</th><th style="color:${TEAMS[2].color}">${TEAMS[2].name}</th></tr>
    <tr><td>Vehicles built</td><td>${s1.built}</td><td>${s2.built}</td></tr>
    <tr><td>Enemies destroyed</td><td>${s1.killed}</td><td>${s2.killed}</td></tr>
    <tr><td>Vehicles lost</td><td>${s1.lost}</td><td>${s2.lost}</td></tr>
    <tr><td>Scrap gathered</td><td>${Math.round(s1.scrapGathered)}</td><td>${Math.round(s2.scrapGathered)}</td></tr>
    <tr><td colspan="3" class="dim">Battle length ${mins}:${String(secs).padStart(2, '0')}</td></tr>`;
  $('end').classList.remove('hidden');
}

// -----------------------------------------------------------------------------
// Camera
// -----------------------------------------------------------------------------

function resize() {
  const dpr = 1;
  canvas.width = window.innerWidth * dpr; canvas.height = window.innerHeight * dpr;
  view.screenW = canvas.width; view.screenH = canvas.height;
  const root = document.documentElement.style;
  root.setProperty('--top-h', `${$('topbar').offsetHeight}px`);
  root.setProperty('--panel-h', `${$('panel').offsetHeight}px`);
  clampCamera();
}

function clampCamera() {
  if (!game) return;
  const c = view.cam, T = CONFIG.TILE;
  const ww = game.map.W * T, wh = game.map.H * T;
  const vw = view.screenW / c.zoom, vh = view.screenH / c.zoom;
  c.x = Math.max(-100, Math.min(ww - vw + 100, c.x));
  c.y = Math.max(-100, Math.min(wh - vh + 260, c.y));
}

function centerOn(p) {
  if (!p) return;
  view.cam.x = p.x - view.screenW / view.cam.zoom / 2;
  view.cam.y = p.y - view.screenH / view.cam.zoom / 2;
  clampCamera();
}

const toWorld = (sx, sy) => ({ x: view.cam.x + sx / view.cam.zoom, y: view.cam.y + sy / view.cam.zoom });
const toScreen = (wx, wy) => ({ x: (wx - view.cam.x) * view.cam.zoom, y: (wy - view.cam.y) * view.cam.zoom });

function updateCamera(dt) {
  const k = input.keys, pan = 700 * dt / view.cam.zoom;
  if (k.has('ArrowLeft')) view.cam.x -= pan;
  if (k.has('ArrowRight')) view.cam.x += pan;
  if (k.has('ArrowUp')) view.cam.y -= pan;
  if (k.has('ArrowDown')) view.cam.y += pan;
  if (input.inside && !input.panning && document.hasFocus()) {
    const m = 14;
    if (input.mouseX < m) view.cam.x -= pan;
    if (input.mouseX > view.screenW - m) view.cam.x += pan;
    if (input.mouseY < m) view.cam.y -= pan;
    if (input.mouseY > view.screenH - m) view.cam.y += pan;
  }
  clampCamera();
}

// -----------------------------------------------------------------------------
// Mouse
// -----------------------------------------------------------------------------

function entityAt(wx, wy, pad = 0) {
  let best = null, bd = Infinity;
  for (const e of game.entities) {
    if (e.team !== view.team && !view.revealAll && !isVisibleTo(game, view.team, e)) continue;
    const d = Math.hypot(e.x - wx, e.y - wy);
    const r = (e.kind === 'building' ? e.radius : e.radius + 6) + pad;
    if (d < r && d < bd) { bd = d; best = e; }
  }
  return best;
}

function scrapAt(wx, wy, pad = 0) {
  return game.scrap.find(s => Math.hypot(s.x - wx, s.y - wy) < 18 + pad);
}

function mine(ents) { return ents.filter(e => e.team === view.team && e.hp > 0); }

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (!game) return;
  const w = toWorld(e.offsetX, e.offsetY);
  if (e.button === 1) { input.panning = { x: e.offsetX, y: e.offsetY, cx: view.cam.x, cy: view.cam.y }; e.preventDefault(); return; }
  if (e.button === 2) {
    if (view.placing || view.attackMode || view.aim) { cancelModes(); return; }
    rightClick(w);
    return;
  }
  if (e.button !== 0) return;
  if (view.placing) { placeBuilding(w, e.shiftKey); return; }
  if (view.attackMode) { attackMoveAt(w); return; }
  if (view.aim) { aimAt(w, 0); return; }
  view.drag = { x0: e.offsetX, y0: e.offsetY, x1: e.offsetX, y1: e.offsetY, shift: e.shiftKey };
});

window.addEventListener('mousemove', e => {
  if (!game) return;
  const r = canvas.getBoundingClientRect();
  input.mouseX = e.clientX - r.left; input.mouseY = e.clientY - r.top;
  input.inside = e.target === canvas;
  view.mouseWorld = toWorld(input.mouseX, input.mouseY);
  if (view.drag) { view.drag.x1 = input.mouseX; view.drag.y1 = input.mouseY; }
  if (input.panning) {
    view.cam.x = input.panning.cx - (input.mouseX - input.panning.x) / view.cam.zoom;
    view.cam.y = input.panning.cy - (input.mouseY - input.panning.y) / view.cam.zoom;
    clampCamera();
  }
  updateCursor();
});

window.addEventListener('mouseup', e => {
  if (e.button === 1) input.panning = null;
  if (e.button !== 0 || !view.drag || !game) return;
  const d = view.drag; view.drag = null;
  if (Math.abs(d.x1 - d.x0) < 5 && Math.abs(d.y1 - d.y0) < 5) {
    const w = toWorld(d.x0, d.y0);
    const hit = entityAt(w.x, w.y);
    let picked = hit ? pickWithDoubleTap(hit) : [];
    if (d.shift) picked = [...new Set([...view.selected, ...picked])].filter(e => e.team === view.team);
    select(picked);
  } else boxSelect(d, d.shift);
});

// Clicking the same kind of unit twice quickly selects every one on screen.
function pickWithDoubleTap(hit) {
  const now = performance.now();
  const double = hit.team === view.team && hit.kind === 'unit' && now - input.lastClick < 350 && input.lastType === hit.type;
  input.lastClick = now; input.lastType = hit.type;
  return double ? mine(game.entities).filter(u => u.type === hit.type && onScreen(u)) : [hit];
}

function boxSelect(d, additive) {
  const a = toWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
  const b = toWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
  let picked = mine(game.entities).filter(u => u.kind === 'unit' && u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y);
  // Box-selecting prefers fighting units over workers.
  if (picked.some(u => u.def.role === 'combat')) picked = picked.filter(u => u.def.role === 'combat');
  if (additive) picked = [...new Set([...view.selected, ...picked])].filter(e => e.team === view.team);
  select(picked);
}

function attackMoveAt(w, pad = 0) {
  const ids = mine(view.selected).filter(u => u.kind === 'unit').map(u => u.id);
  if (ids.length) {
    const t = entityAt(w.x, w.y, pad);
    if (t && t.team !== view.team) issueCommand(game, view.team, { type: 'attack', ids, targetId: t.id });
    else issueCommand(game, view.team, { type: 'move', ids, x: w.x, y: w.y, attackMove: true });
    ping(w, '#ff7a6a'); sound('ack');
  }
  view.attackMode = false; refreshPanel();
}

function cancelModes() {
  view.placing = null; view.placeReady = false; view.attackMode = false; view.aim = null;
  refreshPanel();
}

function geyserAt(wx, wy, pad = 0) {
  return game.geysers.find(g => Math.hypot(g.x - wx, g.y - wy) < 30 + pad && !geyserTaken(game, g));
}

const ofType = (list, type) => mine(list).filter(e => e.kind === 'unit' && e.type === type);

// Second tap/click after pressing Defend or Deploy.
function aimAt(w, pad) {
  if (view.aim === 'defend') {
    const b = entityAt(w.x, w.y, pad);
    if (!b || b.team !== view.team || b.kind !== 'building') { logMessage('Tap one of your buildings to defend it', 'warn'); sound('error'); return; }
    issueCommand(game, view.team, { type: 'guard', ids: ofType(view.selected, 'artillery').map(u => u.id), targetId: b.id });
    ping(b, '#8cc8ff');
  } else if (view.aim === 'deploy') {
    const g = geyserAt(w.x, w.y, pad);
    if (!g) { logMessage('Tap a free, glowing scrap geyser', 'warn'); sound('error'); return; }
    issueCommand(game, view.team, { type: 'deploy', ids: ofType(view.selected, 'scavenger').map(u => u.id), geyserId: g.id });
    ping(g, '#f0c040');
  }
  sound('ack');
  view.aim = null; refreshPanel();
}

// The Army button opens a menu: everyone, or just one kind of vehicle.
function toggleArmyMenu() {
  const menu = $('armymenu');
  if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
  const all = mine(game.entities).filter(u => u.kind === 'unit' && u.def.role === 'combat');
  for (const b of menu.querySelectorAll('button')) {
    const t = b.dataset.army;
    const n = t === 'all' ? all.length : all.filter(u => u.type === t).length;
    b.querySelector('.n').textContent = n;
    b.disabled = n === 0;
  }
  menu.classList.remove('hidden');
}

function selectArmyType(type) {
  $('armymenu').classList.add('hidden');
  if (type === 'all') { selectArmy(); return; }
  const list = mine(game.entities).filter(u => u.kind === 'unit' && u.type === type);
  if (!list.length) { logMessage(`You have no ${UNIT_TYPES[type].name}s`, 'info'); return; }
  select(list);
}

function selectArmy() {
  const army = mine(game.entities).filter(u => u.kind === 'unit' && u.def.role === 'combat');
  if (!army.length) { logMessage('You have no combat vehicles', 'info'); return; }
  select(army);
}

// -----------------------------------------------------------------------------
// Touch screens (phones and tablets)
//   tap = select your own vehicle, or give selected vehicles an order
//   one-finger drag = scroll · pinch = zoom · press and hold, then drag = box select
// -----------------------------------------------------------------------------

const touch = { points: new Map(), mode: null, start: null, pinch: null, holdTimer: null };
const TOUCH_PAD = 14;  // fingers are less precise than a mouse pointer

function touchPos(t) {
  const r = canvas.getBoundingClientRect();
  return { x: t.clientX - r.left, y: t.clientY - r.top };
}

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  unlockAudio();
  if (!game) return;
  for (const t of e.changedTouches) touch.points.set(t.identifier, touchPos(t));
  clearTimeout(touch.holdTimer);
  const pts = [...touch.points.values()];
  if (pts.length === 1) {
    const p = pts[0];
    touch.start = { x: p.x, y: p.y, cx: view.cam.x, cy: view.cam.y };
    touch.mode = 'pending';
    touch.holdTimer = setTimeout(() => {
      if (touch.mode !== 'pending') return;
      touch.mode = 'box';
      view.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      try { navigator.vibrate && navigator.vibrate(15); } catch (err) { /* optional */ }
    }, 450);
  } else if (pts.length >= 2) {
    view.drag = null;
    const [a, b] = pts;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    touch.mode = 'pinch';
    touch.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.cam.zoom, world: toWorld(mid.x, mid.y) };
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!game) return;
  for (const t of e.changedTouches) if (touch.points.has(t.identifier)) touch.points.set(t.identifier, touchPos(t));
  const pts = [...touch.points.values()];
  if (touch.mode === 'pinch' && pts.length >= 2) {
    const [a, b] = pts;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    view.cam.zoom = Math.max(0.45, Math.min(1.8, touch.pinch.zoom * d / touch.pinch.d));
    view.cam.x = touch.pinch.world.x - mid.x / view.cam.zoom;
    view.cam.y = touch.pinch.world.y - mid.y / view.cam.zoom;
    clampCamera();
    return;
  }
  if (pts.length !== 1 || !touch.start) return;
  const p = pts[0];
  if (touch.mode === 'box') { view.drag.x1 = p.x; view.drag.y1 = p.y; return; }
  if (touch.mode === 'pending' && Math.hypot(p.x - touch.start.x, p.y - touch.start.y) > 10) {
    touch.mode = 'pan'; clearTimeout(touch.holdTimer);
  }
  if (touch.mode === 'pan') {
    view.cam.x = touch.start.cx - (p.x - touch.start.x) / view.cam.zoom;
    view.cam.y = touch.start.cy - (p.y - touch.start.y) / view.cam.zoom;
    clampCamera();
  }
}, { passive: false });

function touchEnd(e) {
  e.preventDefault();
  if (!game) return;
  const ended = [];
  for (const t of e.changedTouches) { if (touch.points.has(t.identifier)) ended.push(touch.points.get(t.identifier)); touch.points.delete(t.identifier); }
  clearTimeout(touch.holdTimer);
  if (touch.points.size > 0) {
    // Lifting one finger of a pinch: don't let the other one start a scroll jump.
    if (touch.mode === 'pinch') touch.mode = 'done';
    return;
  }
  if (e.type === 'touchend' && touch.mode === 'pending' && ended.length) handleTap(ended[0]);
  if (touch.mode === 'box' && view.drag) {
    const d = view.drag; view.drag = null;
    if (Math.abs(d.x1 - d.x0) > 12 || Math.abs(d.y1 - d.y0) > 12) boxSelect(d, false);
  }
  touch.mode = null; touch.start = null;
}
canvas.addEventListener('touchend', touchEnd, { passive: false });
canvas.addEventListener('touchcancel', touchEnd, { passive: false });

function handleTap(p) {
  const w = toWorld(p.x, p.y);
  if (view.placing) {
    // First tap positions the building; the "Build here" button confirms it.
    view.placeAt = w; view.placeReady = true; refreshPanel();
    return;
  }
  if (view.attackMode) { attackMoveAt(w, TOUCH_PAD); return; }
  if (view.aim) { aimAt(w, TOUCH_PAD); return; }
  const hit = entityAt(w.x, w.y, TOUCH_PAD);
  const sel = mine(view.selected);
  const hasBuilder = sel.some(u => u.kind === 'unit' && u.def.role === 'builder');
  const needsWork = hit && hit.team === view.team && hit.kind === 'building' && (hit.built < 1 || hit.hp < hit.maxHp);
  const artyDefend = hit && hit.team === view.team && hit.kind === 'building' && !hasBuilder && sel.some(u => u.type === 'artillery');
  if (hit && hit.team === view.team && !(hasBuilder && needsWork) && !artyDefend) { select(pickWithDoubleTap(hit)); return; }
  if (sel.length && !spectating) {
    // Tap targets are a little bigger for fingers.
    const node = scrapAt(w.x, w.y, TOUCH_PAD);
    rightClick(hit ? { x: hit.x, y: hit.y } : node ? { x: node.x, y: node.y } : w, TOUCH_PAD);
    return;
  }
  select(hit ? [hit] : []);
}

// Minimap works with a finger too: touch or drag to move the camera.
mini.addEventListener('touchstart', e => { e.preventDefault(); if (game) centerOn(minimapWorld(e.touches[0])); }, { passive: false });
mini.addEventListener('touchmove', e => { e.preventDefault(); if (game) centerOn(minimapWorld(e.touches[0])); }, { passive: false });

canvas.addEventListener('wheel', e => {
  if (!game) return;
  e.preventDefault();
  const before = toWorld(e.offsetX, e.offsetY);
  view.cam.zoom = Math.max(0.45, Math.min(1.8, view.cam.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
  view.cam.x = before.x - e.offsetX / view.cam.zoom;
  view.cam.y = before.y - e.offsetY / view.cam.zoom;
  clampCamera();
}, { passive: false });

canvas.addEventListener('mouseleave', () => { input.inside = false; });

function onScreen(e) {
  const s = toScreen(e.x, e.y);
  return s.x >= 0 && s.y >= 0 && s.x <= view.screenW && s.y <= view.screenH;
}

function rightClick(w, pad = 0) {
  const sel = mine(view.selected);
  if (!sel.length) return;
  const units = sel.filter(e => e.kind === 'unit');
  const buildings = sel.filter(e => e.kind === 'building');
  if (!units.length) {
    for (const b of buildings) if (b.def.produces) issueCommand(game, view.team, { type: 'rally', buildingId: b.id, x: w.x, y: w.y });
    ping(w, '#8cffa0');
    return;
  }
  const ids = units.map(u => u.id);
  const t = entityAt(w.x, w.y, pad);
  const node = scrapAt(w.x, w.y, pad);
  const geyser = geyserAt(w.x, w.y, pad);
  const arty = units.filter(u => u.type === 'artillery');
  if (geyser && units.some(u => u.def.role === 'harvester')) {
    issueCommand(game, view.team, { type: 'deploy', ids, geyserId: geyser.id });
    ping(geyser, '#f0c040');
  } else if (t && t.team === view.team && t.kind === 'building' && arty.length && !units.some(u => u.def.role === 'builder')) {
    // Artillery told to go to one of your buildings digs in to defend it.
    issueCommand(game, view.team, { type: 'guard', ids: arty.map(u => u.id), targetId: t.id });
    const rest = ids.filter(id => !arty.some(a => a.id === id));
    if (rest.length) issueCommand(game, view.team, { type: 'move', ids: rest, x: w.x, y: w.y });
    ping(t, '#8cc8ff');
  } else if (t && t.team !== view.team && units.some(u => u.def.weapon)) {
    issueCommand(game, view.team, { type: 'attack', ids, targetId: t.id });
    ping(t, '#ff7a6a');
  } else if (t && t.team === view.team && t.kind === 'building' && units.some(u => u.def.role === 'builder') && (t.built < 1 || t.hp < t.maxHp)) {
    issueCommand(game, view.team, { type: 'repair', ids, targetId: t.id });
    ping(t, '#f0c040');
  } else if (node && units.some(u => u.def.role === 'harvester')) {
    const scavs = units.filter(u => u.def.role === 'harvester').map(u => u.id);
    issueCommand(game, view.team, { type: 'harvest', ids: scavs, nodeId: node.id });
    const rest = ids.filter(id => !scavs.includes(id));
    if (rest.length) issueCommand(game, view.team, { type: 'move', ids: rest, x: w.x, y: w.y });
    ping(node, '#f0c040');
  } else {
    issueCommand(game, view.team, { type: 'move', ids, x: w.x, y: w.y });
    ping(w, '#8cffa0');
  }
  sound('ack');
}

function confirmPlacement() {
  // Use the spot tapped on the map, not wherever the finger is now (the button).
  if (view.placing && view.placeAt) placeBuilding(view.placeAt, false);
}

function placeBuilding(w, keepPlacing) {
  const builder = mine(view.selected).find(u => u.kind === 'unit' && u.def.role === 'builder');
  const def = BUILDING_TYPES[view.placing];
  if (!builder || !def) { view.placing = null; return; }
  const { tx, ty } = placementTile(w, def.size);
  const check = canPlaceBuilding(game, view.team, view.placing, tx, ty);
  if (!check.ok) { logMessage(check.why, 'warn'); sound('error'); return; }
  if (game.teams[view.team].scrap < def.cost) { logMessage('Not enough scrap', 'warn'); sound('error'); return; }
  issueCommand(game, view.team, { type: 'build', ids: [builder.id], building: view.placing, tx, ty });
  sound('build');
  if (!keepPlacing) { view.placing = null; view.placeReady = false; view.placeAt = null; }
  refreshPanel();
}

function ping(p, color) { view.pings.push({ x: p.x, y: p.y, color, t: 0 }); }

function updateCursor() {
  if (!game) return;
  let c = 'default';
  if (view.placing) c = 'copy';
  else if (view.attackMode || view.aim) c = 'crosshair';
  else if (view.mouseWorld && view.selected.length) {
    const t = entityAt(view.mouseWorld.x, view.mouseWorld.y);
    if (t && t.team !== view.team && mine(view.selected).some(u => u.kind === 'unit' && u.def.weapon)) c = 'crosshair';
    else if (scrapAt(view.mouseWorld.x, view.mouseWorld.y) && mine(view.selected).some(u => u.def && u.def.role === 'harvester')) c = 'cell';
    else if (t) c = 'pointer';
  }
  canvas.style.cursor = c;
}

// Minimap: left-click jumps the camera, right-click sends selected units.
function minimapWorld(e) {
  const r = mini.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * game.map.W * CONFIG.TILE, y: (e.clientY - r.top) / r.height * game.map.H * CONFIG.TILE };
}
mini.addEventListener('contextmenu', e => e.preventDefault());
mini.addEventListener('mousedown', e => {
  if (!game) return;
  const w = minimapWorld(e);
  if (e.button === 2) { rightClick(w); return; }
  centerOn(w); input.miniDrag = true;
});
mini.addEventListener('mousemove', e => { if (input.miniDrag && game) centerOn(minimapWorld(e)); });
window.addEventListener('mouseup', () => { input.miniDrag = false; });

// -----------------------------------------------------------------------------
// Keyboard
// -----------------------------------------------------------------------------

window.addEventListener('keydown', e => {
  if (!game || !$('menu').classList.contains('hidden')) return;
  input.keys.add(e.key);
  const key = e.key.toUpperCase();
  if (e.key === 'Escape') {
    if (view.placing || view.attackMode || view.aim) cancelModes();
    else if (!$('help').classList.contains('hidden')) $('help').classList.add('hidden');
    else select([]);
    return;
  }
  if (/^[0-9]$/.test(e.key)) {
    if (e.ctrlKey || e.metaKey) { input.groups[e.key] = mine(view.selected).map(x => x.id); logMessage(`Group ${e.key} set`, 'info'); e.preventDefault(); }
    else {
      const g = (input.groups[e.key] || []).map(id => game.byId.get(id)).filter(Boolean);
      if (g.length) {
        const now = performance.now();
        if (input.lastGroup === e.key && now - input.lastGroupAt < 350) centerOn(g[0]);
        input.lastGroup = e.key; input.lastGroupAt = now;
        select(g);
      }
    }
    return;
  }
  if (e.key === 'Enter' && view.placing) { confirmPlacement(); return; }
  if (key === 'P' || e.key === 'Pause') { togglePause(); return; }
  if (key === 'H') { centerOn(game.entities.find(x => x.team === view.team && x.type === 'recycler')); return; }
  if (key === 'M') { toggleMute(); return; }
  if (e.key === ' ') { if (view.selected[0]) centerOn(view.selected[0]); e.preventDefault(); return; }
  if (e.key === 'F1' || e.key === '?') { $('help').classList.toggle('hidden'); e.preventDefault(); return; }
  if (key === 'A' && !view.placing && mine(view.selected).some(u => u.kind === 'unit' && u.def.weapon)) { view.attackMode = true; refreshPanel(); return; }
  if (key === 'S' && !view.placing) { issueCommand(game, view.team, { type: 'stop', ids: mine(view.selected).map(u => u.id) }); return; }
  if (key === 'X' && !view.placing) { idleWorker(); return; }
  const btn = document.querySelector(`#commands button[data-hotkey="${key}"]`);
  if (btn && !btn.disabled) btn.click();
});
window.addEventListener('keyup', e => input.keys.delete(e.key));
window.addEventListener('blur', () => input.keys.clear());
window.addEventListener('resize', resize);
// On small screens the bars change height with their content; keep overlays clear of them.
const barObserver = window.ResizeObserver && new ResizeObserver(() => {
  const root = document.documentElement.style;
  root.setProperty('--top-h', `${$('topbar').offsetHeight}px`);
  root.setProperty('--panel-h', `${$('panel').offsetHeight}px`);
});
if (window.ResizeObserver) for (const el of [$('topbar'), $('panel')]) barObserver.observe(el);

function idleWorker() {
  const idle = mine(game.entities).filter(u => u.kind === 'unit' && u.def.role !== 'combat' &&
    (u.order.type === 'idle' || (u.order.type === 'harvest' && u.order.phase === 'wait')));
  if (!idle.length) { logMessage('No idle workers', 'info'); return; }
  input.idleIdx = ((input.idleIdx || 0) + 1) % idle.length;
  select([idle[input.idleIdx]]); centerOn(idle[input.idleIdx]);
}

function togglePause() {
  paused = !paused;
  $('paused').classList.toggle('hidden', !paused);
}

// -----------------------------------------------------------------------------
// Selection and the command panel
// -----------------------------------------------------------------------------

function select(list) {
  // Buildings can only be selected one at a time.
  const units = list.filter(e => e.kind === 'unit');
  view.selected = units.length ? units : list.slice(0, 1);
  view.placing = null; view.placeReady = false; view.attackMode = false; view.aim = null;
  $('armymenu').classList.add('hidden');
  if (view.selected.length && view.selected[0].team === view.team) sound('select');
  refreshPanel();
}

// Buttons react on mouse-down, so a click still counts if the panel redraws.
function onPress(el, fn) {
  el.addEventListener('mousedown', e => { if (e.button === 0) { e.preventDefault(); fn(); } });
  el.addEventListener('click', e => { if (e.detail === 0) fn(); });  // keyboard hotkeys
}

let panelKey = '';
function refreshPanel() {
  const info = $('selinfo'), cmds = $('commands');
  const sel = view.selected.filter(e => e.hp > 0);
  // Only rebuild the buttons when something about them actually changed.
  const key = game ? JSON.stringify([sel.map(e => e.id), view.placing, view.placeReady, view.attackMode, view.aim, spectating,
    sel.map(e => [e.built >= 1, e.queue && e.queue.join(), e.queue && e.queue.length && Math.floor(e.prodTime), e.blocked]),
    Object.values(UNIT_TYPES).concat(Object.values(BUILDING_TYPES)).map(d => game.teams[view.team].scrap >= d.cost)]) : '';
  const rebuild = key !== panelKey;
  panelKey = key;
  if (rebuild) cmds.innerHTML = '';
  if (!game || !sel.length) {
    info.innerHTML = `<div class="dim">Nothing selected.<br>Left-click or drag a box to select your vehicles.</div>`;
    return;
  }
  const own = sel[0].team === view.team && !spectating;
  if (sel.length === 1) {
    const e = sel[0], d = e.def;
    let extra = '';
    if (e.kind === 'unit' && e.def.role === 'harvester') extra = `Carrying ${Math.floor(e.carry)} / ${d.carryMax} scrap`;
    if (e.kind === 'unit' && d.weapon) extra = `Damage ${d.weapon.damage} · Range ${d.weapon.range} · Speed ${d.speed}`;
    if (e.kind === 'building' && e.built < 1) extra = `Under construction — ${Math.floor(e.built * 100)}%`;
    if (e.kind === 'building' && d.weapon && e.built >= 1) extra = `Damage ${d.weapon.damage} · Range ${d.weapon.range}`;
    if (e.kind === 'building' && d.income) extra = e.built >= 1 ? `Pumping about ${Math.round(d.income * 60)} scrap a minute` : `Setting up — ${Math.floor(e.built * 100)}%`;
    if (e.kind === 'unit' && e.order.type === 'scout') extra = e.order.packId ? 'Scouting with the pack' : 'Scouting alone';
    if (e.kind === 'unit' && e.order.type === 'patrol') extra = 'On patrol';
    if (e.kind === 'unit' && e.order.type === 'guard') extra = 'Defending a building';
    info.innerHTML = `<div class="selname" style="color:${TEAMS[e.team].color}">${d.name}</div>
      <div>Health ${Math.ceil(e.hp)} / ${e.maxHp}</div><div class="dim">${extra}</div><div class="dim small">${d.desc}</div>`;
  } else {
    const counts = {};
    for (const e of sel) counts[e.def.name] = (counts[e.def.name] || 0) + 1;
    info.innerHTML = `<div class="selname">${sel.length} vehicles</div>` +
      Object.entries(counts).map(([n, c]) => `<div>${c} × ${n}</div>`).join('');
  }
  if (!own || !rebuild) return;

  const addBtn = (label, cost, hotkey, onClick, opts = {}) => {
    const b = document.createElement('button');
    b.dataset.hotkey = hotkey;
    b.innerHTML = `<span class="hk">${hotkey}</span><span class="lbl">${label}</span>${cost !== null ? `<span class="cost">${cost}</span>` : ''}`;
    if (opts.title) b.title = opts.title;
    if (opts.active) b.classList.add('active');
    if (opts.primary) b.classList.add('primary');
    if (cost && game.teams[view.team].scrap < cost) b.classList.add('poor');
    onPress(b, () => { onClick(); sound('click'); });
    cmds.appendChild(b);
  };

  const first = sel[0];
  if (first.kind === 'building' && first.built >= 1 && first.def.produces) {
    first.def.produces.forEach((type, i) => {
      const d = UNIT_TYPES[type];
      addBtn(d.name, d.cost, HOTKEYS[i], () => issueCommand(game, view.team, { type: 'produce', buildingId: first.id, unit: type }),
        { title: `${d.name} — ${d.cost} scrap, ${d.buildTime}s\n${d.desc}` });
    });
    if (first.queue.length) {
      const q = document.createElement('div'); q.className = 'queue';
      q.innerHTML = '<span class="dim small">Queue (click to cancel):</span>';
      first.queue.forEach((type, i) => {
        const chip = document.createElement('button'); chip.className = 'chip';
        chip.textContent = UNIT_TYPES[type].name + (i === 0 ? ` ${Math.floor(first.prodTime / UNIT_TYPES[type].buildTime * 100)}%` : '');
        onPress(chip, () => { issueCommand(game, view.team, { type: 'cancel', buildingId: first.id, index: i }); refreshPanel(); });
        q.appendChild(chip);
      });
      if (first.blocked) q.innerHTML += '<span class="warn small">Unit limit reached</span>';
      cmds.appendChild(q);
    }
    const tip = document.createElement('div'); tip.className = 'dim small tip';
    tip.textContent = 'Right-click the map to set where new vehicles go.';
    cmds.appendChild(tip);
    return;
  }
  const builder = sel.find(e => e.kind === 'unit' && e.def.role === 'builder');
  if (builder && sel.length === 1) {
    const types = Object.keys(BUILDING_TYPES).filter(t => BUILDING_TYPES[t].buildable !== false);
    types.forEach((type, i) => {
      const d = BUILDING_TYPES[type];
      addBtn(d.name, d.cost, HOTKEYS[i], () => { view.placing = type; refreshPanel(); },
        { active: view.placing === type, title: `${d.name} — ${d.cost} scrap\n${d.desc}` });
    });
    if (view.placing && isTouch && view.placeReady) addBtn('Build here', null, '↵', confirmPlacement, { primary: true });
    if (view.placing) addBtn('Cancel', null, 'Esc', () => { view.placing = null; view.placeReady = false; refreshPanel(); });
    const tip = document.createElement('div'); tip.className = 'dim small tip';
    tip.textContent = !view.placing ? `Pick a building, then ${isTouch ? 'tap' : 'click'} where it should go.`
      : isTouch ? 'Tap inside the green zone to position it, then press Build here.'
      : 'Click inside the green zone to build. Shift-click to place several. Right-click cancels.';
    cmds.appendChild(tip);
    return;
  }
  // Special orders for each kind of vehicle in the selection.
  const keys = [...HOTKEYS];
  const scouts = ofType(sel, 'scout'), tanks = ofType(sel, 'tank'), arty = ofType(sel, 'artillery'), scavs = ofType(sel, 'scavenger');
  const order = (type, list, extra = {}) => { issueCommand(game, view.team, { type, ids: list.map(u => u.id), ...extra }); sound('ack'); };
  if (scouts.length > 1) {
    addBtn('Scout as pack', null, keys.shift(), () => order('scout', scouts, { pack: true }), { title: 'The scouts roam the map together' });
    addBtn('Scout solo', null, keys.shift(), () => order('scout', scouts, { pack: false }), { title: 'Each scout explores on its own' });
  } else if (scouts.length) addBtn('Scout', null, keys.shift(), () => order('scout', scouts), { title: 'Explore the map on its own' });
  if (tanks.length) addBtn('Patrol', null, keys.shift(), () => order('patrol', tanks), { title: 'Loop around your buildings, fighting anything met' });
  if (arty.length) addBtn('Defend', null, keys.shift(), () => { view.aim = 'defend'; refreshPanel(); },
    { active: view.aim === 'defend', title: 'Then pick one of your buildings to guard' });
  if (scavs.length) addBtn('Deploy on geyser', null, keys.shift(), () => { view.aim = 'deploy'; refreshPanel(); },
    { active: view.aim === 'deploy', title: 'Turn into an Extractor on a scrap geyser' });
  if (view.aim) {
    addBtn('Cancel', null, 'Esc', cancelModes);
    const tip = document.createElement('div'); tip.className = 'dim small tip';
    tip.textContent = view.aim === 'defend' ? `${isTouch ? 'Tap' : 'Click'} one of your buildings to defend it.`
      : `${isTouch ? 'Tap' : 'Click'} a glowing scrap geyser. The Scavenger drives there and becomes an Extractor.`;
    cmds.appendChild(tip);
  }
  if (sel.some(e => e.kind === 'unit' && e.def.weapon)) {
    addBtn('Attack-move', null, 'A', () => { view.attackMode = true; refreshPanel(); }, { active: view.attackMode, title: 'Move, but stop to fight anything on the way' });
    if (view.attackMode) addBtn('Cancel', null, 'Esc', () => { view.attackMode = false; refreshPanel(); });
  }
  if (sel.some(e => e.kind === 'unit')) addBtn('Stop', null, 'S', () => issueCommand(game, view.team, { type: 'stop', ids: sel.map(e => e.id) }));
}

// -----------------------------------------------------------------------------
// Top bar, message log, sound
// -----------------------------------------------------------------------------

function updateHud() {
  const me = game.teams[view.team];
  const units = game.entities.filter(e => e.kind === 'unit' && e.team === view.team).length;
  const scavs = game.entities.filter(e => e.type === 'scavenger' && e.team === view.team).length;
  $('scrap').textContent = Math.floor(me.scrap);
  $('income').textContent = `${scavs} scavenger${scavs === 1 ? '' : 's'}`;
  $('units').textContent = `${units} / ${CONFIG.UNIT_CAP}`;
  // Base health bars. You only know the enemy's once you have seen it.
  const hq = t => game.entities.find(e => e.team === t && e.type === 'recycler');
  const myHq = hq(view.team), theirs = hq(3 - view.team);
  const pct = e => e ? Math.max(0, e.hp / e.maxHp * 100) : 0;
  $('hq-me').textContent = `${Math.round(pct(myHq))}%`;
  $('hq-me-bar').style.width = `${pct(myHq)}%`;
  const known = theirs && (spectating || theirs.seen[view.team]);
  $('hq-foe').textContent = known ? `${Math.round(pct(theirs))}%` : '?';
  $('hq-foe-bar').style.width = known ? `${pct(theirs)}%` : '0%';
  const m = Math.floor(game.time / 60), s = Math.floor(game.time % 60);
  $('clock').textContent = `${m}:${String(s).padStart(2, '0')}${speed > 1 ? ` ×${speed}` : ''}`;
}

function logMessage(text, kind = 'info') {
  const log = $('log');
  const last = log.lastElementChild;
  if (last && last.dataset.text === text && performance.now() - Number(last.dataset.at) < 3000) return;
  const div = document.createElement('div');
  div.className = `msg ${kind}`; div.textContent = text;
  div.dataset.text = text; div.dataset.at = performance.now();
  log.appendChild(div);
  while (log.children.length > 6) log.firstChild.remove();
  setTimeout(() => div.classList.add('fade'), 6000);
  setTimeout(() => div.remove(), 7000);
}

let audio = null, muted = false;
// Phones only allow sound after the player touches the screen.
function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch (err) { /* sound is optional */ }
}
window.addEventListener('pointerdown', unlockAudio);
function toggleMute() { muted = !muted; logMessage(muted ? 'Sound off' : 'Sound on', 'info'); }
// Tiny synthesised sound effects — no audio files needed.
function sound(kind, vol = 1) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    const presets = {
      click:  ['square', 660, 660, 0.05, 0.04],
      select: ['triangle', 520, 700, 0.07, 0.06],
      ack:    ['triangle', 440, 330, 0.08, 0.06],
      build:  ['square', 220, 440, 0.15, 0.06],
      error:  ['sawtooth', 180, 120, 0.15, 0.05],
      bullet: ['square', 900, 300, 0.04, 0.025],
      shell:  ['sawtooth', 200, 60, 0.12, 0.05],
      artillery: ['sawtooth', 140, 40, 0.25, 0.06],
      boom:   ['sawtooth', 90, 30, 0.35, 0.08],
      alert:  ['square', 520, 520, 0.25, 0.05],
    };
    const [type, f0, f1, dur, v] = presets[kind] || presets.click;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(v * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch (err) { /* sound is optional */ }
}

function handleEvents() {
  let sounds = 0;
  for (const ev of game.events) {
    if (ev.sound) {
      // Only play sounds for fights you can see, and not too many at once.
      const s = toScreen(ev.x, ev.y);
      if (sounds < 4 && s.x > -50 && s.y > -50 && s.x < view.screenW + 50 && s.y < view.screenH + 50) { sound(ev.sound, ev.big ? 1.5 : 0.7); sounds++; }
      continue;
    }
    if (spectating ? ev.team !== 1 : ev.team !== view.team) continue;
    logMessage(ev.text, ev.kind);
    if (ev.kind === 'bad' && ev.x !== undefined) { view.alerts.push({ x: ev.x, y: ev.y, at: performance.now() }); sound('alert'); }
  }
  game.events.length = 0;
  view.alerts = view.alerts.filter(a => performance.now() - a.at < 2000);
}

// -----------------------------------------------------------------------------
// The game loop
// -----------------------------------------------------------------------------

let panelTimer = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  if (!game) return;
  updateCamera(dt);
  if (!paused && !game.winner) {
    accumulator += dt * speed;
    const step = 1 / CONFIG.TICK_RATE;
    let n = 0;
    while (accumulator >= step && n < 12) {
      const ais = game.tick % 2 ? game.aiTeams.slice().reverse() : game.aiTeams;
      for (const t of ais) aiUpdate(game, t);
      stepGame(game); accumulator -= step; n++;
    }
    if (game.winner) setTimeout(showEnd, 1200);
  }
  view.selected = view.selected.filter(e => e.hp > 0);
  for (const p of view.pings) p.t += dt;
  view.pings = view.pings.filter(p => p.t < 0.5);
  handleEvents();
  drawGame(ctx, game, view);
  drawMinimap(miniCtx, game, view);
  panelTimer += dt;
  if (panelTimer > 0.25) { panelTimer = 0; updateHud(); refreshPanel(); }
}

// -----------------------------------------------------------------------------
// Menu buttons
// -----------------------------------------------------------------------------

let chosenDifficulty = 'normal';
document.querySelectorAll('[data-difficulty]').forEach(b => b.addEventListener('click', () => {
  chosenDifficulty = b.dataset.difficulty;
  document.querySelectorAll('[data-difficulty]').forEach(x => x.classList.toggle('active', x === b));
}));
$('start').onclick = () => startGame(chosenDifficulty);
$('watch').onclick = () => startGame(chosenDifficulty, true);
$('again').onclick = () => { $('end').classList.add('hidden'); $('menu').classList.remove('hidden'); };
$('helpbtn').onclick = () => $('help').classList.toggle('hidden');
$('helpclose').onclick = () => $('help').classList.add('hidden');
$('pausebtn').onclick = togglePause;
onPress($('q-army'), () => game && toggleArmyMenu());
for (const b of document.querySelectorAll('#armymenu button')) onPress(b, () => game && selectArmyType(b.dataset.army));
onPress($('q-base'), () => game && centerOn(game.entities.find(x => x.team === view.team && x.type === 'recycler')));
onPress($('q-idle'), () => game && idleWorker());
onPress($('q-clear'), () => game && select([]));
$('speedbtn').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; $('speedval').textContent = `×${speed}`; };

resize();
requestAnimationFrame(frame);
if (new URLSearchParams(location.search).has('watch')) startGame('normal', true);
