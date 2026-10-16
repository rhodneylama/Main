/* Scrapline Command — unit & building sprites (vector, canvas).
 * Drop into js/ and load with <script src="js/sprites.js"></script> before render.js.
 * Coordinates are game pixels, centred on the unit, facing +x (angle 0 = right).
 * See UNIT_SPRITES.md for the API and animation rules. */
(function (root) {
'use strict';
const BASE = { h:'#9aa1aa', l:'#c9ced4', m:'#6b727b', d:'#3f444b', k:'#15171a', g:'#eaf6ff', gold:'#f0b93a', gr:'#4fd16a', gl:'#bfe6ff', tr:'#1b1d21', tc:'#4a5059' };
const TEAM = { blue:{ t:'#4aa3ff', td:'#1f6fc2' }, red:{ t:'#ff5a4a', td:'#b8352a' } };
const MASK = { h:'#4a4e55', l:'#5a5f66', m:'#3c4046', d:'#2d3035', k:'#15171a', g:'#6a6f76', gold:'#6a6f76', gr:'#6a6f76', gl:'#5a5f66', t:'#ffffff', td:'#d0d0d0', tr:'#15171a', tc:'#2d3035' };
const WRECK = { h:'#55585c', l:'#62656a', m:'#43464a', d:'#303235', k:'#15171a', g:'#62656a', gold:'#55585c', gr:'#55585c', gl:'#55585c', t:'#4a4d51', td:'#3c3f43', tr:'#1e2023', tc:'#303235' };
const SW = 0.6;
const tk = (x0, x1, y, hh, st) => { let d = ''; for (let x = x0; x <= x1; x += st) d += `M${x} ${y}v${hh}`; return ['s', d, 'tc', .6]; };
const chev = (x, y, s) => ['s', `M${x} ${y-s}L${x+s} ${y}L${x} ${y+s}M${x+s*1.3} ${y-s}L${x+s*2.3} ${y}L${x+s*1.3} ${y+s}`, 'gold', s*.5];
const plate = (a) => ['r', -a, -a, a*2, a*2, 'd', 3];
function hazard(S) {
  const a = S/2, b = a-8, L = [['r', -a, -a, S, S, 'gold']]; let d = '';
  for (let x = -a; x <= a-12; x += 8) d += `M${x} ${-a}h4l8 8h-4ZM${x} ${b}h4l8 8h-4Z`;
  for (let y = -b; y <= b-12; y += 8) d += `M${-a} ${y}v4l8 8v-4ZM${b} ${y}v4l8 8v-4Z`;
  L.push(['f', d, 'k']); return L;
}
const VEH = [
  { id:'tank', code:'V-01', name:'Tank', sub:'Line combat', D:30, R:15, reach:22, layers:'Hull · Team · Turret', mkName:'Mk II',
    role:'The reference silhouette: octagonal hull on full-length tracks, a dominant turret and a barrel that clears the nose. Everything else contrasts with it.',
    s:[['r',-14,-15,28,6,'tr',1.5],['r',-14,9,28,6,'tr',1.5],tk(-12,12,-15,6,3),tk(-12,12,9,6,3),
       ['p','M-9 -10H8L12 -6V6L8 10H-9L-12 7V-7Z','h'],['p','M8 -10L12 -6V6L8 10Z','l'],['r',-11.5,-6,3,12,'t'],['s','M-8 -8.5H6M-8 8.5H6','m',.6]],
    mk:[['r',-13,-11,22,2,'l',.5],['r',-13,9,22,2,'l',.5]],
    tur:{ m:[-1,0], s:[['r',5,-1.4,15,2.8,'d'],['p','M-7 -6H3L7 -3V3L3 6H-7L-9 3V-3Z','h'],['c',-3,0,2.2,'l'],['r',-8.5,-2,1.8,4,'t'],['r',18,-2,5,4,'k']] },
    tmk:[chev(1,0,2)] },
  { id:'scout', code:'V-02', name:'Scout', sub:'Recon', D:22, R:11, reach:11, layers:'Hull · Team', mkName:'Mk II',
    role:'The only sharp nose on the field, so heading reads instantly. Twin fixed guns, hover sleds with exhaust glow. Smallest unit.',
    s:[['r',-9,-10,13,3.5,'d',1.5],['r',-9,6.5,13,3.5,'d',1.5],['c',-9.5,-8.2,1.3,'g'],['c',-9.5,8.2,1.3,'g'],['r',1,-5.6,8,1.3,'d'],['r',1,4.3,8,1.3,'d'],
       ['p','M11 0L-3 -9L-9 -6.5V6.5L-3 9Z','h'],['p','M-3 -9L-9 -6.5L-6.5 -5Z','t'],['p','M-3 9L-9 6.5L-6.5 5Z','t'],['r',-8,-1,6,2,'t'],['p','M6.5 0L0 -3H-2V3H0Z','l']],
    mk:[['p','M-5 -8L-11 -11.5L-8.5 -6Z','d'],['p','M-5 8L-11 11.5L-8.5 6Z','d'],chev(-8,0,1.6)] },
  { id:'artillery', code:'V-03', name:'Artillery', sub:'Siege', D:30, R:15, reach:36, layers:'Hull · Team · Turret', mkName:'Mk II',
    role:'Tracked, with a barrel that overhangs the hull by more than a body length. It must stop to fire: four stabiliser legs swing out, it fires, then they fold back under the hull before it moves.', legs:true,
    s:[['r',-13,-13,24,4.5,'tr',1.2],['r',-13,8.5,24,4.5,'tr',1.2],tk(-11,9,-13,4.5,2.5),tk(-11,9,8.5,4.5,2.5),
       ['r',-13,-8.5,24,17,'h',1],['r',-12.5,-6,3.5,12,'t'],['s','M-8 -7H8M-8 7H8','m',.6]],
    tur:{ m:[0,0], s:[['r',4,-1.7,28,3.4,'d'],['r',4,-2.6,9,5.2,'m',.5],['r',31,-2.8,5,5.6,'k'],['r',-7,-6.5,13,13,'h',2],['r',-5.5,-4.5,7,9,'l',1],['r',-7,-2,1.8,4,'t']] },
    tmk:[chev(-4.5,0,2)] },
  { id:'constructor', code:'V-04', name:'Constructor', sub:'Builder', D:26, R:13, reach:13, layers:'Hull · Team', mkName:'Constructor II',
    role:'Six wheels and a flatbed with a crane arm where a gun would be. Wheels mark it as a worker at a glance.',
    s:[...[-9,-2,5].flatMap(x=>[['r',x-2.5,-13,5,3.5,'d',1.2],['r',x-2.5,9.5,5,3.5,'d',1.2]]),
       ['r',-12,-9.5,21,19,'h',1.2],['r',-11.5,-9,3.5,18,'t'],['r',4,-7.5,8,15,'l',1.5],['s','M9 -5V5','d',.8],['s','M-6 -9.5V9.5','m',.6],
       ['c',-3,0,4.2,'m'],['s','M-3 0L7 -9','d',2.4],['s','M7 -9L10.5 -10.5M7 -9L9 -12','k',1],['c',-3,0,1.6,'l']],
    mk:[chev(-1,7,1.4)] },
  { id:'scavenger', code:'V-05', name:'Scavenger', sub:'Harvester', D:26, R:13, reach:13, layers:'Hull · Team', mkName:'Scavenger II',
    role:'Open hopper full of scrap at the rear, collector mandibles at the front. Carries its cargo visibly so a loaded unit reads differently.',
    s:[['r',-11,-13,7,3.5,'d',1.2],['r',1,-13,7,3.5,'d',1.2],['r',-11,9.5,7,3.5,'d',1.2],['r',1,9.5,7,3.5,'d',1.2],
       ['p','M8 -6L13.5 -9L12 -3.5Z','d'],['p','M8 6L13.5 9L12 3.5Z','d'],
       ['p','M-11 -9.5H3V9.5H-11Q-13 9.5 -13 7.5V-7.5Q-13 -9.5 -11 -9.5Z','h'],['r',-11,-9.5,14,2,'t'],['r',-11,7.5,14,2,'t'],
       ['r',-10,-6,11,12,'m',1],['r',-8,-4,3,2.5,'l'],['r',-4,0,3.5,3,'l'],['r',-7,1.5,2.5,2.5,'l'],
       ['p','M3 -6.5H8L11 -3.5V3.5L8 6.5H3Z','l'],['c',8.5,0,2,'g']],
    mk:[chev(3.5,0,1.8),['s','M-13 -4H-15M-13 4H-15','k',1.2]] },
  { id:'transport', code:'V-06', name:'Transport', sub:'Hauler', D:28, R:14, reach:14, layers:'Hull · Team · Shield FX',
    role:'Four hover pads under a sealed cargo pod. The shield bubble is its signature; it flickers once the shield is hit and drops when it breaks.',
    s:[...[[-8,-10],[6,-10],[-8,10],[6,10]].flatMap(([x,y])=>[['c',x,y,4,'d'],['o',x,y,2.4,'g',.8]]),
       ['r',-13,-9,23,18,'h',3],['p','M6 -8H9Q13 -8 13 -4V4Q13 8 9 8H6Z','l'],['s','M9 -5V5','d',.8],
       ['r',-11,-7,15,14,'m',1.5],['r',-9.5,-5.5,12,11,'t',1],['s','M-9.5 0H2.5M-3.5 -5.5V5.5','td',.8]],
    shield:true },
  { id:'recyclerV', code:'V-07', name:'Recycler', sub:'Mobile HQ', D:44, R:22, reach:22, layers:'Hull · Team',
    role:'Unarmed mobile headquarters. Widest tracks in the game and a big processing drum that reads from any zoom. Deploys into the Recycler building.',
    s:[['r',-20,-22,38,8,'tr',2],['r',-20,14,38,8,'tr',2],tk(-18,16,-22,8,3.5),tk(-18,16,14,8,3.5),
       ['p','M-18 -14H12L20 -8V8L12 14H-18L-21 10V-10Z','h'],['r',-18,-13,28,2.5,'t'],['r',-18,10.5,28,2.5,'t'],
       ['p','M12 -14L20 -8V8L12 14Z','l'],['s','M14.5 -6V6M17 -4V4','d',.8],['r',-20.5,-8,3,16,'d',1],
       ['c',-4,0,9,'m'],['o',-4,0,6,'d',1],['c',-4,0,2.5,'l']] }
];
const BLD = [
  { id:'recycler', code:'B-01', name:'Recycler', sub:'HQ · 3×3', S:96, R:48, layers:'Base · Team · Core (spin)', mkName:'Recycler II',
    role:'Octagonal core on four pylons, intake bay facing forward, a slow-turning processing drum in the centre. Destroy it and the game ends, so it is the heaviest shape on the map.',
    s:[plate(46),...[[-45,-45],[33,-45],[-45,33],[33,33]].flatMap(([x,y])=>[['r',x,y,12,12,'m',2],['c',x+6,y+6,3,'t']]),
       ['p','M-26 -40H26L40 -26V26L26 40H-26L-40 26V-26Z','h'],['p','M-26 -40H26L22 -34H-22Z','l'],
       ['r',30,-14,10,28,'m',1],['s','M32 -10H38M32 -5H38M32 0H38M32 5H38M32 10H38','d',1],
       ['c',-24,-22,7,'l'],['c',-24,22,7,'l'],['o',-24,-22,4,'m',1],['o',-24,22,4,'m',1],['o',0,0,19,'t',3],['o',0,0,16,'m',1.5]],
    mk:[chev(-37,0,4)],
    spin:{ rate:25, s:[['c',0,0,12,'h'],['o',0,0,8.5,'m',1],['s','M0 -12V-8.5M0 8.5V12M-12 0H-8.5M8.5 0H12','d',1.4],['c',0,0,4,'l']] } },
  { id:'factory', code:'B-02', name:'Factory', sub:'Production · 3×3', S:96, R:48, layers:'Base · Team', mkName:'Factory II',
    role:'Ribbed hangar with a hazard-striped bay door facing forward, where new vehicles roll out. Team bands run along the roof edges.',
    s:[plate(46),['r',-40,-38,64,76,'h',2],['r',-40,-38,64,6,'t'],['r',-40,32,64,6,'t'],['s','M-28 -32V32M-16 -32V32M-4 -32V32M8 -32V32','m',1],
       ['r',-22,-6,40,12,'gl',1],['c',-32,-20,5,'m'],['o',-32,-20,2.5,'k',1],['c',-32,20,5,'m'],['o',-32,20,2.5,'k',1],
       ['r',24,-22,14,44,'d',1],['f','M26 -20h3l7 7v3ZM26 -10h3l7 7v3ZM26 0h3l7 7v3ZM26 10h3l7 7v3Z','gold'],['r',38,-18,7,36,'l',1]],
    pulse:[['c',41.5,-14,1.8,'g'],['c',41.5,14,1.8,'g']],
    mk:[chev(-12,-19,4)] },
  { id:'repair', code:'B-03', name:'Repair Pad', sub:'Service · 3×3 flat', S:96, R:48, layers:'Base · Team · Cross (pulse)',
    role:'Flat and drive-over: hazard-striped border, grid deck and a pulsing green cross. No height, so vehicles sit on top of it.',
    s:[...hazard(92),['r',-38,-38,76,76,'d',2],['s','M-38 -19H38M-38 0H38M-38 19H38M-19 -38V38M0 -38V38M19 -38V38','m',.6],
       ...[[-33,-33],[33,-33],[-33,33],[33,33]].map(([x,y])=>['c',x,y,2.5,'t'])],
    pulse:[['p','M-8 -24H8V-8H24V8H8V24H-8V8H-24V-8H-8Z','gr']] },
  { id:'extractor', code:'B-04', name:'Extractor', sub:'Geyser pump · 2×2', S:64, R:32, layers:'Base · Team · Pump (spin)',
    role:'A pump straddling the geyser on four legs. Its head spins while it pumps, and the outlet pipe points to where an Extractor Silo attaches.',
    s:[plate(30),['s','M-22 -22L-12 -12M22 -22L12 -12M-22 22L-12 12M22 22L12 12','k',2.4],...[[-28,-28],[20,-28],[-28,20],[20,20]].flatMap(([x,y])=>[['r',x,y,8,8,'m',1],['c',x+4,y+4,2,'t']]),
       ['r',18,-3,12,6,'m'],['p','M-12 -20H12L20 -12V12L12 20H-12L-20 12V-12Z','h'],['c',0,0,11,'m'],['o',0,0,8,'d',1.2]],
    spin:{ rate:120, s:[['s','M-7 0H7M0 -7V7','l',1.8]] },
    pulse:[['c',0,0,3.5,'g']] },
  { id:'silo', code:'B-05', name:'Base Silo', sub:'Storage · 2×2', S:64, R:32, layers:'Base · Team',
    role:'A single round tank with a team band. Round silhouette means storage; the chute points toward the base.',
    s:[plate(30),['r',20,-6,10,12,'m',1],['c',0,0,24,'h'],['o',0,0,20.5,'t',3],['o',0,0,16,'m',1],['s','M0 -16V-9M0 9V16M-16 0H-9M9 0H16','m',1],['c',0,0,8,'l'],['c',0,0,3,'m']] },
  { id:'exsilo', code:'B-06', name:'Extractor Silo', sub:'Storage · 2×2', S:64, R:32, layers:'Base · Team',
    role:'A smaller twin tank on a catwalk, with a pipe that joins onto an Extractor. It reads as a smaller version of the Base Silo.',
    s:[plate(30),['r',8,-3,22,6,'m',1],['r',-18,-4,26,8,'m',1],['c',-8,-12,11,'h'],['c',-8,12,11,'h'],['o',-8,-12,8,'t',2.4],['o',-8,12,8,'t',2.4],['c',-8,-12,4,'l'],['c',-8,12,4,'l'],['c',16,0,4.5,'h'],['c',16,0,1.8,'d']] },
  { id:'tower', code:'B-07', name:'Gun Tower', sub:'Defence · 2×2', S:64, R:32, layers:'Base · Team · Turret',
    role:'Octagonal bunker with a heavy single-barrel turret. The barrel is shorter than the Artillery’s but thicker than the Tank’s.',
    s:[plate(30),['p','M-16 -26H16L26 -16V16L16 26H-16L-26 16V-16Z','h'],['p','M-16 -26H16L14 -22H-14Z','t'],['p','M-16 26H16L14 22H-14Z','t'],['o',0,0,15,'m',1.5]],
    tur:{ m:[0,0], s:[['r',7,-2.4,21,4.8,'d'],['r',26,-3.4,5,6.8,'k'],['c',0,0,11,'h'],['p','M-5 -8H4L8 0L4 8H-5Z','l'],['c',-6,0,2,'t']] } },
  { id:'lab', code:'B-08', name:'Research Lab', sub:'Tech · 2×2', S:64, R:32, layers:'Base · Team · Dome (pulse)',
    role:'A square block with a glass dome that pulses while researching. Team colour sits on the rear wing.',
    s:[plate(30),['r',-26,-26,52,52,'h',3],['r',-26,-26,9,52,'t'],['r',18,-8,8,16,'m',1],['c',0,0,17,'m'],['c',0,0,14,'gl'],['s','M-10 -10L10 10M-10 10L10 -10M-14 0H14M0 -14V14','m',.5]],
    pulse:[['c',0,0,14,'g']] },
  { id:'radar', code:'B-09', name:'Radar', sub:'Sensor · 2×2', S:64, R:32, layers:'Base · Team · Dish (spin)',
    role:'A round plinth with a curved dish that rotates constantly. The only building that is always moving.',
    s:[plate(30),['c',0,0,22,'h'],['o',0,0,18,'t',3],['c',0,0,14,'m'],['c',0,0,5,'d']],
    spin:{ rate:90, s:[['s','M-2 0H12','d',1.6],['p','M-3 -19Q13 0 -3 19L-8 17Q5 0 -8 -17Z','l'],['c',12,0,2.2,'g']] } }
];
const ALL = [...VEH, ...BLD], BY = Object.create(null); ALL.forEach(d => { BY[d.id] = d; });

const DEG = Math.PI / 180;
// Parsed outlines are cached: building a Path2D from text every frame for
// every unit is costly on phones. (Added when integrating into the game.)
const PATHS = new Map();
const path = d => { let p = PATHS.get(d); if (!p) { p = new Path2D(d); PATHS.set(d, p); } return p; };
function paint(ctx, list, P) {
  for (const s of list) {
    ctx.lineWidth = SW; ctx.strokeStyle = P.k; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    switch (s[0]) {
      case 'r': ctx.beginPath(); if (s[6] && ctx.roundRect) ctx.roundRect(s[1], s[2], s[3], s[4], s[6]); else ctx.rect(s[1], s[2], s[3], s[4]);
        ctx.fillStyle = P[s[5]]; ctx.fill(); ctx.stroke(); break;
      case 'c': ctx.beginPath(); ctx.arc(s[1], s[2], s[3], 0, Math.PI*2); ctx.fillStyle = P[s[4]]; ctx.fill(); ctx.stroke(); break;
      case 'o': ctx.beginPath(); ctx.arc(s[1], s[2], s[3], 0, Math.PI*2); ctx.strokeStyle = P[s[4]]; ctx.lineWidth = s[5]; ctx.stroke(); break;
      case 'p': { const p = path(s[1]); ctx.fillStyle = P[s[2]]; ctx.fill(p); ctx.stroke(p); break; }
      case 'f': ctx.fillStyle = P[s[2]]; ctx.fill(path(s[1])); break;
      case 's': ctx.strokeStyle = P[s[2]]; ctx.lineWidth = s[3]; ctx.lineCap = 'round'; ctx.stroke(path(s[1])); break;
    }
  }
}
function palette(team, o) { return o.mask ? MASK : o.wreck ? WRECK : Object.assign({}, BASE, TEAM[team] || TEAM.blue); }

/* Draw one unit or building.
 * o: { x, y, heading (rad, vehicles only), turret (rad, relative to hull), team: 'blue'|'red',
 *      mk (bool: Mk II / Tier II / upgraded), t (seconds, drives spin + pulse),
 *      legE (0..1, artillery stabiliser extension), fire (seconds since last shot, or null),
 *      shield (bool, Transport shield up), shieldHit (bool, flicker), wreck (bool), mask (bool), scale } */
function drawSprite(ctx, id, o) {
  const def = BY[id]; if (!def) return;
  o = o || {}; const t = o.t || 0, P = palette(o.team, o);
  ctx.save();
  ctx.translate(o.x || 0, o.y || 0);
  if (o.scale) ctx.scale(o.scale, o.scale);
  if (!def.S && o.heading) ctx.rotate(o.heading);
  if (def.legs) { const e = o.wreck ? 0 : (o.legE || 0);
    if (e > 0) for (const [bx, by, dx, dy] of [[-8,-9,-6,-7],[-8,9,-6,7],[5,-9,4,-7],[5,9,4,7]]) {
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + dx*e, by + dy*e); ctx.strokeStyle = P.k; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.arc(bx + dx*e, by + dy*e, 1.2 + e, 0, Math.PI*2); ctx.fillStyle = P.d; ctx.fill(); ctx.lineWidth = SW; ctx.stroke(); } }
  paint(ctx, def.s, P);
  if (o.mk && def.mk) paint(ctx, def.mk, P);
  if (def.pulse && !o.wreck) { ctx.save(); ctx.globalAlpha *= .35 + .65*(.5 + .5*Math.sin(t*3)); paint(ctx, def.pulse, P); ctx.restore(); }
  if (def.spin) { ctx.save(); ctx.rotate(o.wreck ? 20*DEG : (t*def.spin.rate % 360)*DEG); paint(ctx, def.spin.s, P); ctx.restore(); }
  if (def.tur) { const m = def.tur.m, f = o.wreck ? null : o.fire, rc = f != null && f < .35 ? -3*(1 - f/.35) : 0;
    ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(o.wreck ? 35*DEG : (o.turret || 0));
    ctx.save(); ctx.translate(rc, 0); paint(ctx, def.tur.s, P); if (o.mk && def.tmk) paint(ctx, def.tmk, P); ctx.restore();
    if (f != null && f < .14) { ctx.translate(def.reach + 2, 0);
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI*2); ctx.fillStyle = 'rgba(255,246,220,.9)'; ctx.fill();
      ctx.fillStyle = '#f0b93a'; ctx.fill(path('M0 -6L1.5 -1.5L6 0L1.5 1.5L0 6L-1.5 1.5L-6 0L-1.5 -1.5Z')); }
    ctx.restore(); }
  if (def.shield && o.shield && (!o.shieldHit || Math.sin(t*20) > 0)) {
    ctx.save(); ctx.rotate(t*30*DEG); ctx.beginPath(); ctx.arc(0, 0, def.R + 3, 0, Math.PI*2);
    ctx.globalAlpha = .1; ctx.fillStyle = P.t; ctx.fill(); ctx.globalAlpha = .75; ctx.setLineDash([3, 1.5]); ctx.strokeStyle = P.t; ctx.lineWidth = .8; ctx.stroke(); ctx.restore(); }
  ctx.restore();
}

/* Damage smoke/scorch overlay (call after drawSprite while HP < ~50%, and on vehicle wrecks). */
function drawDamage(ctx, id, x, y, t) {
  const R = BY[id].R; ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(21,23,26,.35)';
  ctx.beginPath(); ctx.arc(-R*.35, -R*.2, R*.2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(R*.3, R*.35, R*.14, 0, Math.PI*2); ctx.fill();
  for (let i = 0; i < 3; i++) { const q = ((t*.5) + i/3) % 1;
    ctx.beginPath(); ctx.arc(-R*.2 + q*R*.5 + Math.sin(q*6 + i)*R*.08, -R*.1 - q*R*1.1, R*(.1 + .25*q), 0, Math.PI*2);
    ctx.fillStyle = 'rgba(93,95,99,' + ((1 - q)*.45) + ')'; ctx.fill(); }
  if (Math.sin(t*23) > .55) { ctx.beginPath(); ctx.arc(R*.3, R*.35, R*.07, 0, Math.PI*2); ctx.fillStyle = '#fff6dc'; ctx.fill(); }
  ctx.restore();
}

/* Explosion, p = 0..1 over ~1.2 s. Swap vehicle to wreck:true once p > 0.3; buildings: stop drawing, call drawCrater. */
function drawExplosion(ctx, id, x, y, p, team) {
  const R = BY[id].R; ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha = Math.max(0, 1 - p*1.5); ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.arc(0, 0, R*(.4 + 1.4*p), 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = Math.max(0, .85 - p); ctx.fillStyle = '#f0b93a'; ctx.beginPath(); ctx.arc(0, 0, R*(.3 + .9*p), 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#f0b93a'; ctx.lineWidth = R*.15*(1 - p); ctx.beginPath(); ctx.arc(0, 0, R*(.5 + 1.6*p), 0, Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 1 - p*.8;
  for (let i = 0; i < 10; i++) { const a = i*2.3 + .5, d = R*(.3 + 1.4*Math.pow(p, .6));
    ctx.save(); ctx.translate(Math.cos(a)*d, Math.sin(a)*d); ctx.rotate((p*400 + i*40)*DEG);
    ctx.fillStyle = i % 2 ? WRECK.m : (TEAM[team] || TEAM.blue).t; ctx.fillRect(-R*.08, -R*.06, R*.16, R*.12); ctx.restore(); }
  ctx.restore();
}
function drawCrater(ctx, id, x, y) {
  const R = BY[id].R; ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(29,31,32,.18)';
  ctx.beginPath(); ctx.arc(0, 0, R*.8, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(29,31,32,.22)'; ctx.beginPath(); ctx.arc(R*.1, -R*.05, R*.45, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = WRECK.m;
  for (let i = 0; i < 7; i++) { const a = i*2.1 + .4, d = R*(.25 + .5*((i*37 % 10)/10));
    ctx.save(); ctx.translate(Math.cos(a)*d, Math.sin(a)*d); ctx.rotate(i*50*DEG); ctx.fillRect(-R*.06, -R*.05, R*.12, R*.1); ctx.restore(); }
  ctx.restore();
}

/* Artillery stabiliser timing. Deploy/retract take ARTILLERY.deploy / .retract seconds; movement is blocked while legE > 0. */
const ARTILLERY = { deploy: 0.6, retract: 0.6 };

/* Pre-render a static sprite (no turret) to an offscreen canvas at 4x — optional cache for performance. */
function bake(id, team, mk, res) {
  res = res || 4; const def = BY[id], half = (def.S ? def.S/2 + 2 : Math.max(def.R, def.reach || def.R) + 3);
  const c = document.createElement('canvas'); c.width = c.height = Math.ceil(half*2*res);
  const ctx = c.getContext('2d'); ctx.scale(res, res); ctx.translate(half, half);
  const saved = def.tur; def.tur = null; drawSprite(ctx, id, { team, mk }); def.tur = saved;
  return { canvas: c, half, res };
}

const api = { DEFS: BY, VEHICLES: VEH.map(d => d.id), BUILDINGS: BLD.map(d => d.id), TEAM, drawSprite, drawDamage, drawExplosion, drawCrater, bake, ARTILLERY };
root.UnitSprites = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
