/* Kethra Concord (alien faction) — unit & building sprites (vector, canvas).
 * Load after sprites.js:  <script src="js/sprites_kethra.js"></script>   → window.KethraSprites
 * Same conventions as UnitSprites: game pixels, centred, facing +x. See KETHRA_SPRITES.md. */
(function (root) {
'use strict';
const BASE = { h:'#6d6a86', l:'#cfd0e4', m:'#4a4862', d:'#2a2840', k:'#12111d', f:'#8a5cff', g:'#f4e9ff', gl:'#b9a8ff90', gold:'#e8c35a', gr:'#4fe0b0', pool:'#2f8f63' };
const TEAM = { blue:{ t:'#35d9ff', td:'#1186ad' }, red:{ t:'#ff4f8b', td:'#b3195a' } };
const MASK = { h:'#4a4e55', l:'#5a5f66', m:'#3c4046', d:'#2d3035', k:'#15171a', f:'#6a6f76', g:'#6a6f76', gl:'#5a5f66', gold:'#6a6f76', gr:'#6a6f76', pool:'#4a4e55', t:'#ffffff', td:'#d0d0d0' };
const WRECK = { h:'#4b4a52', l:'#66656e', m:'#3b3a42', d:'#2b2a31', k:'#121115', f:'#4b4a52', g:'#55545c', gl:'#55545ca0', gold:'#4b4a52', gr:'#4b4a52', pool:'#34363a', t:'#403f46', td:'#323137' };
const SW = 0.6, RAD = Math.PI/180;
const f1 = v => +v.toFixed(1);
function poly(n, r, rot, cx, cy) { cx = cx || 0; cy = cy || 0; let d = ''; for (let i = 0; i < n; i++) { const a = (rot + i*360/n)*RAD; d += (i ? 'L' : 'M') + f1(cx + Math.cos(a)*r) + ' ' + f1(cy + Math.sin(a)*r); } return d + 'Z'; }
function arcs(r, n, span, off) { let d = ''; for (let i = 0; i < n; i++) { const a0 = (off + i*360/n)*RAD, a1 = a0 + span*RAD; d += `M${f1(Math.cos(a0)*r)} ${f1(Math.sin(a0)*r)}A${r} ${r} 0 0 1 ${f1(Math.cos(a1)*r)} ${f1(Math.sin(a1)*r)}`; } return d; }
function wedge(r0, r1, a0, a1) { const P = (r, a) => `${f1(Math.cos(a*RAD)*r)} ${f1(Math.sin(a*RAD)*r)}`; return `M${P(r1, a0)}A${r1} ${r1} 0 0 1 ${P(r1, a1)}L${P(r0, a1)}A${r0} ${r0} 0 0 0 ${P(r0, a0)}Z`; }
function blades(n, len, w) { const o = []; for (let i = 0; i < n; i++) { const a = i*360/n*RAD, c = Math.cos(a), s = Math.sin(a), q = (x, y) => `${f1(x*c - y*s)} ${f1(x*s + y*c)}`; o.push(['p', `M${q(1.5, 0)}L${q(len, -w)}L${q(len, w)}Z`, 'l']); } return o; }
const ev = (x, y) => ['c', x, y, .9, 'gold'];
const VEH = [
  { id:'bulwark', code:'V-01', name:'Bulwark', sub:'Line combat · Tank', D:30, R:15, reach:22, hover:14, layers:'Hull · Team · Lance', mkName:'Upgraded',
    role:'Arrowhead hull flanked by two floating armour blades, with a visible gap of air between. A twin-rail lance floats on a hex mount. No tracks, no legs: it rides a gravity ring.',
    s:[['p','M8 -9.5L-9 -11.5L-11.5 -8.5L-8 -7.4L7 -7.6Z','l'],['p','M8 9.5L-9 11.5L-11.5 8.5L-8 7.4L7 7.6Z','l'],['p','M13.5 0L7 -6L-9 -6.2L-13 -3L-13 3L-9 6.2L7 6Z','h'],['s','M6 -9.2L-8 -10.4M6 9.2L-8 10.4','t',1.1],['p','M-13 -2.4L-16 0L-13 2.4Z','t'],['s','M-9 -4V4','d',.8],['p','M10.5 0L7 -2.6L7 2.6Z','m']],
    mk:[['s','M3 -8.6L-2 -9.1M3 8.6L-2 9.1','gold',.9],['s','M-6 -4.2V4.2','gold',.9]],
    tur:{ m:[0,0], s:[['p','M3 -2.8L21 -1.9L22.4 -1.2L3 -1.2Z','l'],['p','M3 1.2L22.4 1.2L21 1.9L3 2.8Z','l'],['s','M4 0H20','t',1],['p','M-6 0L-3 -5L3 -5L6 0L3 5L-3 5Z','m'],['p','M-4 0L-2 -3L2 -3L4 0L2 3L-2 3Z','h'],['c',0,0,1.5,'g']] } },
  { id:'shard', code:'V-02', name:'Shard', sub:'Recon · Scout', D:22, R:11, reach:12, hover:10.5, layers:'Hull · Team', mkName:'Upgraded',
    role:'A swept dart with a hollow tail. The sharpest, smallest silhouette in the faction, so heading reads instantly.',
    s:[['p','M12 0L2 -3.5L-8 -9.5L-6 -2.5L-9 0L-6 2.5L-8 9.5L2 3.5Z','h'],['p','M9 0L1 -1.6L-6 0L1 1.6Z','l'],['p','M-1 -4.6L-6 -7.6L-5.4 -3.6Z','t'],['p','M-1 4.6L-6 7.6L-5.4 3.6Z','t'],['c',-1,0,1.3,'g']],
    mk:[['p','M-6.4 -1.2L-9.4 -1.2L-9.4 1.2L-6.4 1.2Z','gold']] },
  { id:'spire', code:'V-03', name:'Spire', sub:'Siege · Artillery', D:30, R:15, reach:36, hover:14, layers:'Hull · Team · Coil lance', mkName:'Upgraded', anch:[[-8,-9,-6,-6],[-8,9,-6,6],[7,-8,5,-6],[7,8,5,6]],
    role:'A long coil-lance on a compact platform. It must stop to fire: four gravity anchors drop, the coils charge and discharge, then the anchors retract before it moves.',
    s:[['p','M-13 0L-7 -10L6 -8.5L11 -4L11 4L6 8.5L-7 10Z','h'],['p','M-8 -8L5 -6.5L5 -2.8L-8 -3.2Z','l'],['p','M-8 8L5 6.5L5 2.8L-8 3.2Z','l'],['e',-10,0,2.8,1.8,'t']],
    mk:[['s','M-5 -5L2 -4.4M-5 5L2 4.4','gold',.8]],
    tur:{ m:[0,0], s:[['p','M0 -2.2L34 -.9L36 0L34 .9L0 2.2Z','l'],['r',8,-3.6,2.2,7.2,'d',.6],['r',16,-3.2,2.2,6.4,'d',.6],['r',24,-2.8,2.2,5.6,'d',.6],['s','M9.1 -3.4V3.4M17.1 -3V3M25.1 -2.6V2.6','t',.8],['p','M-6 0L-3 -5.5L3 -5.5L6 0L3 5.5L-3 5.5Z','m'],['c',0,0,2.6,'g']] } },
  { id:'loom', code:'V-04', name:'Loom', sub:'Builder · Constructor', D:26, R:13, reach:16, hover:12.5, layers:'Hull · Team · Ring (spin)', mkName:'Upgraded',
    role:'A round work-pod with a single fabrication beam and a slow-turning ring of arcs. The ring is the signal that it is a worker.',
    s:[['p','M-9 -4.5L-13 -3L-13 3L-9 4.5Z','m'],['c',0,0,9,'h'],['c',0,0,6,'d'],['c',0,0,2.6,'g'],['p','M3.5 -3.2L14 -1.2L16 0L14 1.2L3.5 3.2Z','l'],['s','M6 0H13','t',.9]],
    spin:{ rate:40, s:[['s',arcs(12, 3, 70, 0),'t',2]] },
    mk:[['o',0,0,7.5,'gold',.8]] },
  { id:'skimmer', code:'V-05', name:'Skimmer', sub:'Harvester · Scavenger', D:26, R:13, reach:15, hover:12.5, layers:'Hull · Team', mkName:'Upgraded',
    role:'Crescent intake arms scoop scrap into a glass cargo bay. Crystals inside show how full it is.',
    s:[['p','M14 -9C9 -5.5 9 5.5 14 9C11.2 5 11.2 -5 14 -9Z','l'],['p','M9 -6.5L-8 -9L-12 -5L-12 5L-8 9L9 6.5Z','h'],['r',-9,-4.6,12,9.2,'gl',2],['p','M-6 0L-4 -2.2L-2 0L-4 2.2Z','f'],['p','M-1.5 -2.5L0 -4L1.5 -2.5L0 -1Z','l'],['r',-8,-9.4,10,1.6,'t',.5],['r',-8,7.8,10,1.6,'t',.5],['p','M9 -2L12 0L9 2Z','m'],['c',10.6,0,.8,'g']],
    mk:[['r',-15,-3.8,3,2.4,'gold',.4],['r',-15,1.4,3,2.4,'gold',.4]] },
  { id:'ferry', code:'V-06', name:'Ferry', sub:'Hauler · Transport', D:28, R:14, reach:14, hover:13.5, layers:'Hull · Team · Shield FX', shield:true,
    role:'Two detached pontoons carry a sealed cargo hull between them. The shield is a rotating energy bubble that flickers when hit and collapses when broken.',
    s:[['r',-11,-13.5,20,4,'l',2],['r',-11,9.5,20,4,'l',2],['s','M-8 -11.5H6M-8 11.5H6','t',1],['p','M13.5 0L8 -8L-11 -8L-13 -5V5L-11 8L8 8Z','h'],['r',-9,-5,13,10,'d',1],['s','M-6 -5V5M-2 -5V5M2 -5V5','m',.7],['p','M11 0L8.2 -3L8.2 3Z','t']],
    pulse:[['c',-4,0,1.6,'g']] },
  { id:'monad', code:'V-07', name:'Monad', sub:'Mobile HQ · Recycler', D:44, R:22, reach:24, hover:21, layers:'Hull · Team · Core ring (spin)',
    role:'Three armour petals around a glowing core, with the narrow forward petal marking heading. Unarmed. Roots down into a Nexus.',
    s:[['p',wedge(14, 24, -30, 30),'h'],['p',wedge(14, 21, 78, 162),'h'],['p',wedge(14, 21, 198, 282),'h'],['p',wedge(15.5, 17, -24, 24),'t'],['p',wedge(15.5, 17, 84, 156),'t'],['p',wedge(15.5, 17, 204, 276),'t'],['c',0,0,13.5,'d'],['o',0,0,11,'m',1.4],['c',0,0,7.5,'gl'],['c',0,0,3.5,'t']],
    pulse:[['c',0,0,1.6,'g']], spin:{ rate:40, s:[['s',arcs(9.5, 3, 60, 0),'l',1.6]] } }
];
VEH.push(
  { id:'talon', code:'V-08', name:'Talon', sub:'Rocket tank · light', D:26, R:13, reach:17, hover:12.5, layers:'Hull · Team · Missile rack',
    role:'Quicker and lighter than the Bulwark: swept fins, a slim hull and a three-rail missile rack on a floating hex mount.',
    s:[['p','M4 -5.5L-6 -10.5L-9.5 -9.5L-3 -5.5Z','l'],['p','M4 5.5L-6 10.5L-9.5 9.5L-3 5.5Z','l'],['p','M12 0L5 -5.5L-8 -6L-12 -3L-12 3L-8 6L5 5.5Z','h'],['s','M2 -8.2L-6 -9.4M2 8.2L-6 9.4','t',1],['p','M-12 -2L-14.8 0L-12 2Z','t'],['s','M-8 -3.5V3.5','d',.8]],
    tur:{ m:[0,0], s:[['r',2,-4.6,14,1.6,'l',.5],['r',2,-.8,14,1.6,'l',.5],['r',2,3,14,1.6,'l',.5],['c',16.8,-3.8,.8,'t'],['c',16.8,0,.8,'t'],['c',16.8,3.8,.8,'t'],['p','M-5 0L-2.5 -4.5L2.5 -4.5L5 0L2.5 4.5L-2.5 4.5Z','m'],['p','M-3 0L-1.5 -2.7L1.5 -2.7L3 0L1.5 2.7L-1.5 2.7Z','h'],['c',0,0,1.2,'g']] } },
  { id:'pylon', code:'V-09', name:'Pylon', sub:'Mobile turret', D:24, R:12, reach:18, hover:11, rapid:true, layers:'Hull · Team · Needle guns', anch:[[-5.5,-8,-4,-5],[-5.5,8,-4,5],[5.5,-8,4,-5],[5.5,8,4,5]],
    role:'Mobile quick-defence emitter. It glides on its gravity ring but must stop to fire: four anchors lock to the ground, then twin needle emitters stream rapid shots. Retract to move.',
    s:[['p',poly(6,10.5,0),'h'],['o',0,0,8.4,'t',1.2]],
    tur:{ m:[0,0], s:[['r',4,-3.4,13,1.3,'l',.4],['r',4,2.1,13,1.3,'l',.4],['r',8,-4,2,8,'d',.5],['p','M-5 0L-2.5 -4.5L2.5 -4.5L5 0L2.5 4.5L-2.5 4.5Z','m'],['c',0,0,2,'g'],['c',17,-2.7,.7,'t'],['c',17,2.7,.7,'t']] } }
);
const BLD = [
  { id:'nexus', code:'B-01', name:'Nexus', sub:'HQ · Recycler · 3×3', S:96, R:48, layers:'Plate · Core · Team · Core (pulse)', mkName:'Upgraded',
    role:'A hex landing plate with a pulsing core, two pylons and a framed gate facing forward. A ring of arcs turns around the core. No turret.',
    s:[['p',poly(6,46,0),'d'],['o',0,0,40,'m',1.5],['s','M0 0L-16 27.7M0 0L-16 -27.7','f',1.6],
       ...[[-16,-27.7],[-16,27.7]].flatMap(([x,y])=>[['p',poly(6,9,0,x,y),'h'],['p',poly(6,5,0,x,y),'d'],['c',x,y,2.2,'t']]),
       ['c',21,-36.4,2,'t'],['c',21,36.4,2,'t'],['c',-21,-36.4,2,'t'],['c',-21,36.4,2,'t'],
       ['p','M27 -13L44 -9L44 9L27 13Z','l'],['p','M31 -8L40 -6L40 6L31 8Z','k'],['c',43,-9,1.6,'t'],['c',43,9,1.6,'t'],
       ['c',0,0,21,'h'],['o',0,0,18,'t',2],['c',0,0,14.5,'d'],['c',0,0,12,'m']],
    beat:[['c',0,0,8,'gl'],['c',0,0,5,'t'],['c',0,0,2.2,'g']], spin:{ rate:30, s:[['s',arcs(13.4, 3, 70, 0),'l',1.8]] },
    mk:[['o',-16,-27.7,8,'gold',1.2],['o',-16,27.7,8,'gold',1.2]] },
  { id:'assembler', code:'B-02', name:'Assembler', sub:'Production · Factory · 3×3', S:96, R:48, layers:'Plate · Hull · Team · Bay light (pulse)', mkName:'Upgraded',
    role:'A rear fabrication block feeds a dark bay that ends in a gantry arch at the front. New machines slide out through the arch.',
    s:[['p','M-42 -34L-30 -42L30 -42L44 -28L44 28L30 42L-30 42L-42 34Z','d'],['p','M-38 -22L-26 -31L-8 -31L-8 31L-26 31L-38 22Z','h'],['r',-34,-14,4,28,'t',1],['s','M-22 -26V26M-14 -28V28','m',1.2],
       ['r',-6,-17,44,34,'k',2],['s','M-2 -11H34M-2 11H34','m',1],['r',34,-28,8,56,'l',2],['c',38,-23,2.2,'t'],['c',38,23,2.2,'t']],
    pulse:[['r',-2,-.8,36,1.6,'g']],
    mk:[...[-18,-11].flatMap(x=>[ev(x,-24),ev(x,24)])] },
  { id:'lattice', code:'B-03', name:'Mending Lattice', sub:'Service · Repair · 3×3 flat', S:96, R:48, layers:'Plate · Lattice · Team · Rings (pulse)',
    role:'A flat hex pad of crossed light-lines. Machines hover over it and green rings pulse outward while repair beams run.',
    s:[['p',poly(6,46,0),'d'],['p',poly(6,41,0),'l'],['p',poly(6,37,0),'d'],['s','M-37 0H37M-18.5 -32L18.5 32M-18.5 32L18.5 -32','m',1.2],['p',poly(6,11,0),'h'],
       ...[0,60,120,180,240,300].map(a=>['c',f1(43.5*Math.cos(a*RAD)),f1(43.5*Math.sin(a*RAD)),2.4,'t'])],
    pulse:[['p',poly(6,8,0),'gr'],['o',0,0,18,'gr',1.4],['o',0,0,28,'gr',1]] },
  { id:'siphon', code:'B-04', name:'Siphon', sub:'Geyser · Extractor · 2×2', S:64, R:32, layers:'Plate · Funnel · Team · Iris (spin)',
    role:'A funnel sunk into the geyser, held by four struts. A three-blade iris spins as it draws. Its outlet pipe points toward the Siphon Cell.',
    s:[['p',poly(6,30,0),'d'],['s','M-15 -26L-8.5 -13M-15 26L-8.5 13M15 -26L8.5 -13M15 26L8.5 13','m',2],['r',15,-3,14,6,'m',1],['c',29,0,2.5,'t'],['c',0,0,15,'h'],['o',0,0,13,'t',1.2],['c',0,0,10,'k']],
    spin:{ rate:90, s:blades(3, 9.5, 3.4) }, pulse:[['c',0,0,2.2,'g']] },
  { id:'vault', code:'B-05', name:'Vault Orb', sub:'Storage · Base Silo · 2×2', S:64, R:32, layers:'Plate · Orb · Team · Charge (pulse)',
    role:'A sealed sphere with four marker diamonds. Its core brightens as it fills. The chute points toward the Nexus.',
    s:[['p',poly(6,30,0),'d'],['r',18,-4,13,8,'m',1],['c',0,0,22,'h'],['o',0,0,19,'m',1],['c',0,0,16,'d'],['c',0,0,13,'gl'],['p','M0 -26L2.5 -23L0 -20L-2.5 -23Z','l'],['p','M0 26L2.5 23L0 20L-2.5 23Z','l'],['p','M-26 0L-23 2.5L-20 0L-23 -2.5Z','l'],['o',0,0,10,'t',1.6]],
    pulse:[['c',0,0,5,'t'],['c',0,0,2.2,'g']] },
  { id:'cell', code:'B-06', name:'Siphon Cell', sub:'Storage · Extractor Silo · 2×2', S:64, R:32, layers:'Plate · Orbs · Team',
    role:'Two small orbs on a shared line, ending in a coupling that clamps onto a Siphon. A smaller sibling of the Vault Orb.',
    s:[['p',poly(6,30,0),'d'],['s','M-8 0H16','m',4],['c',-8,-12,10.5,'h'],['c',-8,12,10.5,'h'],['o',-8,-12,7.5,'t',1.4],['o',-8,12,7.5,'t',1.4],['c',-8,-12,4,'d'],['c',-8,12,4,'d'],['c',16,0,4,'l'],['c',16,0,1.8,'k']],
    pulse:[['c',-8,-12,2,'g'],['c',-8,12,2,'g']] },
  { id:'prism', code:'B-07', name:'Prism Tower', sub:'Defence · Gun Tower · 2×2', S:64, R:32, layers:'Plate · Base · Team · Lance',
    role:'A hex base with a floating hex emitter and one thick lance. The glowing line along the barrel is the team marker.',
    s:[['p',poly(6,30,0),'d'],['p',poly(6,24,30),'h'],['o',0,0,19,'m',1.4]],
    tur:{ m:[0,0], s:[['p','M6 -3.4L26 -2.2L32 0L26 2.2L6 3.4Z','l'],['s','M8 0H27','t',1.4],['p',poly(6,11,0),'m'],['p',poly(6,8,0),'h'],['c',0,0,3,'g']] } },
  { id:'archive', code:'B-08', name:'Archive', sub:'Tech · Research Lab · 2×2', S:64, R:32, layers:'Plate · Dome · Team · Lattice (spin)',
    role:'A glass dome around a slowly turning pair of interlocked triangles. Team colour sits on the rear plate.',
    s:[['p',poly(6,30,0),'d'],['r',-26,-9,4,18,'t',1],['c',0,0,18,'h'],['o',0,0,16,'m',1.2],['c',0,0,14,'gl'],['c',0,0,3,'d']],
    spin:{ rate:35, s:[['s','M0 -9L7.8 4.5L-7.8 4.5Z','l',1],['s','M0 9L7.8 -4.5L-7.8 -4.5Z','l',1]] }, pulse:[['c',0,0,2.2,'g']] },
  { id:'array', code:'B-09', name:'Sensor Array', sub:'Sensor · Radar · 2×2', S:64, R:32, layers:'Plate · Pedestal · Team · Dish (spin)',
    role:'A crescent dish on a team-ringed pedestal sweeps the field. The only structure that always moves.',
    s:[['p',poly(6,30,0),'d'],['c',0,0,21,'h'],['o',0,0,17,'t',2.2],['c',0,0,13,'m'],['c',0,0,4,'d']],
    spin:{ rate:80, s:[['s','M-3 -17A21 21 0 0 1 -3 17','l',3],['s','M-3 0H13','m',2],['p','M12 0L15 -2.5L18 0L15 2.5Z','g']] } }
];
const ALL = [...VEH, ...BLD], BY = Object.create(null); ALL.forEach(d => { BY[d.id] = d; });
// Parsed outlines are cached: building a Path2D from text every frame for
// every unit is costly on phones. (Added when integrating into the game.)
const PATHS = new Map();
const path = d => { let p = PATHS.get(d); if (!p) { p = new Path2D(d); PATHS.set(d, p); } return p; };
function paint(ctx, list, P) {
  for (const s of list) {
    ctx.lineWidth = SW; ctx.strokeStyle = P.k; ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    switch (s[0]) {
      case 'r': ctx.beginPath(); if (s[6] && ctx.roundRect) ctx.roundRect(s[1], s[2], s[3], s[4], s[6]); else ctx.rect(s[1], s[2], s[3], s[4]); ctx.fillStyle = P[s[5]]; ctx.fill(); ctx.stroke(); break;
      case 'c': ctx.beginPath(); ctx.arc(s[1], s[2], s[3], 0, Math.PI*2); ctx.fillStyle = P[s[4]]; ctx.fill(); ctx.stroke(); break;
      case 'e': ctx.beginPath(); ctx.ellipse(s[1], s[2], s[3], s[4], (s[6] || 0)*RAD, 0, Math.PI*2); ctx.fillStyle = P[s[5]]; ctx.fill(); ctx.stroke(); break;
      case 'o': ctx.beginPath(); ctx.arc(s[1], s[2], s[3], 0, Math.PI*2); ctx.strokeStyle = P[s[4]]; ctx.lineWidth = s[5]; ctx.stroke(); break;
      case 'p': { const p = path(s[1]); ctx.fillStyle = P[s[2]]; ctx.fill(p); ctx.stroke(p); break; }
      case 's': ctx.strokeStyle = P[s[2]]; ctx.lineWidth = s[3]; ctx.lineCap = 'round'; ctx.stroke(path(s[1])); break;
    }
  }
}
function palette(team, o) { return o.mask ? MASK : o.wreck ? WRECK : Object.assign({}, BASE, TEAM[team] || TEAM.blue); }
/* o: { x, y, heading (rad, vehicles), turret (rad, relative to hull), team:'blue'|'red', mk, t (seconds),
 *      thrust (bool: moving -> exhaust glow), legE (0..1 anchor extension: spire, pylon), fire (seconds since shot or null),
 *      shield, shieldHit (ferry), wreck, mask, scale } */
function drawSprite(ctx, id, o) {
  const def = BY[id]; if (!def) return; o = o || {};
  const t = o.t || 0, P = palette(o.team, o), R = def.R, bld = !!def.S;
  ctx.save(); ctx.translate(o.x || 0, o.y || 0); if (o.scale) ctx.scale(o.scale, o.scale);
  if (!bld && o.heading) ctx.rotate(o.heading);
  if (def.hover && !o.wreck) {
    const a = .35 + .15*Math.sin(t*3) + (o.thrust ? .25 : 0);
    ctx.save(); ctx.rotate(t*50*RAD); ctx.beginPath(); ctx.arc(0, 0, def.hover, 0, Math.PI*2);
    ctx.globalAlpha = a*.18; ctx.fillStyle = P.t; ctx.fill(); ctx.globalAlpha = a; ctx.strokeStyle = P.t; ctx.lineWidth = 1.1; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.restore();
    if (o.thrust) { const L = (5 + 2.5*Math.sin(t*35))*(R/15 + .5); ctx.beginPath(); ctx.moveTo(-R*.8, -R*.2); ctx.lineTo(-R*.8 - L, 0); ctx.lineTo(-R*.8, R*.2); ctx.closePath(); ctx.globalAlpha = .85; ctx.fillStyle = P.t; ctx.fill(); ctx.globalAlpha = 1; }
  }
  const e = o.wreck ? 0 : (o.legE || 0);
  if (def.anch && e > 0) for (const [bx, by, dx, dy] of def.anch) {
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + dx*e, by + dy*e); ctx.lineCap = 'round';
    ctx.strokeStyle = P.k; ctx.lineWidth = 3.2; ctx.stroke(); ctx.strokeStyle = P.l; ctx.lineWidth = 1.9; ctx.stroke();
    ctx.beginPath(); ctx.arc(bx + dx*e, by + dy*e, 1.3, 0, Math.PI*2); ctx.fillStyle = P.t; ctx.fill(); ctx.lineWidth = SW; ctx.strokeStyle = P.k; ctx.stroke(); }
  ctx.save(); const br = bld ? 1 : 1 + .012*Math.sin(t*2.2) + (def.anch ? .04*e : 0); ctx.scale(br, br);
  paint(ctx, def.s, P); if (o.mk && def.mk) paint(ctx, def.mk, P); ctx.restore();
  if (def.beat) { const sc = 1 + .1*Math.pow(Math.max(0, Math.sin(t*2.6)), 3); ctx.save(); ctx.scale(sc, sc); paint(ctx, def.beat, P); ctx.restore(); }
  if (def.pulse && !o.wreck) { ctx.save(); ctx.globalAlpha *= .35 + .65*(.5 + .5*Math.sin(t*3)); paint(ctx, def.pulse, P); ctx.restore(); }
  if (def.spin) { ctx.save(); ctx.rotate(o.wreck ? 20*RAD : (t*def.spin.rate % 360)*RAD); paint(ctx, def.spin.s, P); ctx.restore(); }
  if (def.tur) { const m = def.tur.m, f = o.wreck ? null : o.fire, rc = f != null && f < .35 ? -3*(1 - f/.35) : 0;
    ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(o.wreck ? 35*RAD : (o.turret || 0));
    ctx.save(); ctx.translate(rc, 0); paint(ctx, def.tur.s, P); if (o.mk && def.tmk) paint(ctx, def.tmk, P); ctx.restore();
    if (f != null && f < .16) { ctx.translate(def.reach + 2, 0); const k = 1 - f/.3;
      ctx.globalAlpha = .95; ctx.fillStyle = '#f4e9ff'; ctx.beginPath(); ctx.arc(0, 0, 5*k, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = .5; ctx.fillStyle = P.t; ctx.beginPath(); ctx.arc(0, 0, 8*k, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = .9; ctx.strokeStyle = P.t; ctx.lineWidth = 1; ctx.stroke(path('M-9 0H9M0 -5V5')); }
    ctx.restore(); }
  if (def.shield && o.shield && (!o.shieldHit || Math.sin(t*20) > 0)) {
    ctx.save(); ctx.rotate(t*30*RAD); ctx.beginPath(); ctx.arc(0, 0, R + 3, 0, Math.PI*2); ctx.globalAlpha = .1; ctx.fillStyle = P.t; ctx.fill();
    ctx.globalAlpha = .85; ctx.setLineDash([4, 2]); ctx.strokeStyle = P.t; ctx.lineWidth = 1; ctx.stroke(); ctx.restore(); }
  ctx.restore();
}
function drawDamage(ctx, id, x, y, t) {
  const R = BY[id].R; ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(18,17,29,.4)';
  ctx.beginPath(); ctx.arc(-R*.35, -R*.2, R*.2, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(R*.3, R*.35, R*.14, 0, Math.PI*2); ctx.fill();
  for (let i = 0; i < 3; i++) { const q = ((t*.5) + i/3) % 1; ctx.beginPath(); ctx.arc(-R*.2 + q*R*.5 + Math.sin(q*6 + i)*R*.08, -R*.1 - q*R*1.1, R*(.1 + .25*q), 0, Math.PI*2); ctx.fillStyle = 'rgba(93,92,102,' + ((1 - q)*.45) + ')'; ctx.fill(); }
  if (Math.sin(t*23) > .55) { ctx.strokeStyle = '#f4e9ff'; ctx.lineWidth = .9; ctx.beginPath(); ctx.moveTo(R*.3 - 3, R*.35); ctx.lineTo(R*.3 + 3, R*.35); ctx.moveTo(R*.3, R*.35 - 3); ctx.lineTo(R*.3, R*.35 + 3); ctx.stroke(); }
  ctx.restore();
}
function drawExplosion(ctx, id, x, y, p, team) {
  const R = BY[id].R, tc = (TEAM[team] || TEAM.blue).t; ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha = Math.max(0, 1 - p*1.5); ctx.fillStyle = '#f4e9ff'; ctx.beginPath(); ctx.arc(0, 0, R*(.4 + 1.4*p), 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = Math.max(0, .8 - p); ctx.fillStyle = tc; ctx.beginPath(); ctx.arc(0, 0, R*(.3 + .9*p), 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#f4e9ff'; ctx.lineWidth = R*.12*(1 - p); ctx.beginPath(); ctx.arc(0, 0, R*(.5 + 1.6*p), 0, Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 1 - p*.8;
  for (let i = 0; i < 10; i++) { const a = i*2.3 + .5, d = R*(.3 + 1.4*Math.pow(p, .6)); ctx.save(); ctx.translate(Math.cos(a)*d, Math.sin(a)*d); ctx.rotate((p*500 + i*36)*RAD); ctx.fillStyle = i % 2 ? WRECK.l : tc; ctx.fillRect(-R*.1, -R*.04, R*.2, R*.08); ctx.restore(); }
  ctx.restore();
}
function drawCrater(ctx, id, x, y) {
  const R = BY[id].R; ctx.save(); ctx.translate(x, y); ctx.fillStyle = 'rgba(18,17,29,.28)'; ctx.beginPath(); ctx.arc(0, 0, R*.8, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(18,17,29,.3)'; ctx.beginPath(); ctx.arc(R*.1, -R*.05, R*.45, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = WRECK.m;
  for (let i = 0; i < 8; i++) { const a = i*2.1 + .4, d = R*(.2 + .55*((i*37 % 10)/10)); ctx.save(); ctx.translate(Math.cos(a)*d, Math.sin(a)*d); ctx.rotate(i*47*RAD); ctx.fillRect(-R*.07, -R*.035, R*.14, R*.07); ctx.restore(); }
  ctx.restore();
}
const ARTILLERY = { deploy: 0.6, retract: 0.6 };
const SENTRY = { deploy: 0.6, retract: 0.6, shotInterval: 0.2 };
function rapidFire(sec) { return (sec % 0.2)*1.4; }
root.KethraSprites = { DEFS: BY, VEHICLES: VEH.map(d => d.id), BUILDINGS: BLD.map(d => d.id), TEAM, drawSprite, drawDamage, drawExplosion, drawCrater, ARTILLERY, SENTRY, rapidFire };
if (typeof module !== 'undefined' && module.exports) module.exports = root.KethraSprites;
})(typeof window !== 'undefined' ? window : globalThis);
