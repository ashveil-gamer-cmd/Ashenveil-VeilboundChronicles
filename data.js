// ═══════ ASHENVEIL DATA ═══════

// ═══════ CONSTANTS ═══════════════════════════════════════
const WORLD_W=5000,WORLD_H=5000;
const PLAYER_SPEED=200;
const ATTACK_RANGE=230;
const ATTACK_CD=480;
const AFK_IDLE=2800;
const MAX_SPIRITS=5;
const MAX_LEVEL=100;
const ABILITY_CDS=[4000,3000,6000,12000,25000];
const MAX_ENEMIES=20;

// ═══════ LANDMARKS ════════════════════════════════════════
// One hero sprite per zone. Placed at a deterministic world position so it
// always appears in the same spot, becoming the "Oh that's the X zone" anchor.
// `spriteKey` must match a key in SPRITE_MANIFEST. If the sprite fails to load
// a labeled placeholder renders in its place.
// Collision radius keeps the player from walking through the landmark.
const LANDMARKS={
  // Scale values reduced so painted sprites are prominent but don't overwhelm
  // the procedural zone. Collision radii kept large to match visible footprint.
  ashen:       {spriteKey:'obelisk_ashen',      x:1800,y:1800,scale:0.9, collRadius:110},
  crypts:      {spriteKey:'sarcophagus_crypts', x:3100,y:1900,scale:1.0, collRadius:120},
  mire:        {spriteKey:'shrine_mire',        x:2100,y:3200,scale:1.05,collRadius:130},
  spire:       {spriteKey:'shrine_spire',       x:3300,y:3100,scale:1.0, collRadius:120},
  // Dungeons
  hollow_crypt:    {spriteKey:'sarcophagus_crypts', x:2100,y:1900,scale:0.9, collRadius:110},
  wraith_sanctum:  {spriteKey:'candelabra_sanctum', x:2900,y:1900,scale:0.9, collRadius:85},
  ashen_cathedral: {spriteKey:'pew_cathedral',      x:2500,y:1800,scale:1.0, collRadius:115},
};


// ═══════ ZONE DEFINITIONS ═══════════════════════════════
// ── THE PROCESSION ── the moving camp / hub zone
// Not a combat zone. isCamp=true flag tells game loop to skip enemy spawning,
// portal generation, and ambient combat music. NPCs render instead.
const CAMP_ZONE = {
  id:'procession', name:'The Procession', tier:'CAMP', minLv:0,
  isCamp: true,
  ambColor:'#d4a555',
  skyA:'#1c1208', skyB:'#0d0804', skyC:'#050301',
  groundBase:'#1a140a',
  patchA:'rgba(180,140,80,0.20)',
  patchB:'rgba(60,42,20,0.28)',
  patchC:'rgba(240,200,140,0.10)',
  pathColor:'rgba(200,170,110,0.28)',
  canopyTint:'#5a4220', canopyDark:'#2a1e10', trunkColor:'#2a1f10',
  grassColor:'#5a4a30', grassDark:'#2e2418', mossColor:'#4a3820',
  mushroomCap:'#6a4a28',
  tileA:'rgba(220,180,100,0.025)', tileB:'rgba(180,140,70,0.014)',
  gridC:'rgba(200,160,80,0.028)', fogC:'rgba(160,120,60,', lightC:'rgba(255,215,140,',
  hasPillars:false, edgeC:'rgba(30,22,8,0.50)',
  // Minimal props — the procession grounds are deliberately sparse (just
  // a few rocks, scrub, and burned stumps). NPCs and campfire are what fill the space.
  props:['boulder','rockCluster','grassTuft','deadTree','ashStone'],
  counts:[8, 6, 24, 4, 6],
  bias:[], // no enemy bias — no enemies spawn here
};

// ── NPC DEFINITIONS ──
// Each NPC is positioned relative to the world center. They render as
// upright figures with a small label above when the player is near.
// onInteract is the function called when player presses E in range.
const CAMP_NPCS = [
  {
    id:'marken', name:'Marken, the Pathfinder', role:'pathfinder',
    x:0, y:-340,   // placed at the TOP-center of the world (north of campfire)
    color:'#d4a555',
    accent:'#f4c977',
    description:'Knows the paths between broken places.',
    flavor:'"Where do you need to be?"',
    onInteract:'openZoneTravel',
  },
  {
    id:'old_bren', name:'Old Bren, the Toothsmith', role:'weaponsmith',
    x:-280, y:-120,
    color:'#c86a32',
    accent:'#e89458',
    description:'Forges weapons from what the earth gives back.',
    flavor:'"Show me what you\'ve brought me, and I\'ll show you what it wants to be."',
    onInteract:'openWeaponsmith',
  },
  {
    id:'seris', name:'Seris, the Threadbare', role:'armorer',
    x:280, y:-120,
    color:'#e8d4a0',
    accent:'#fff2cc',
    description:'Weaves bone, cloth, and sorrow into armor.',
    flavor:'"Hands to me, child. Let me feel what you need."',
    onInteract:'openArmorer',
  },
  {
    id:'voryn', name:'Voryn, the Ashkeeper', role:'merchant',
    x:-280, y:160,
    color:'#a89dc4',
    accent:'#d4c4f0',
    description:'Keeps a cart of what the world discarded.',
    flavor:'"Something you\'ve outgrown? Something you\'d rather have?"',
    onInteract:'openMerchant',
  },
  {
    id:'sublime', name:'The Sublime', role:'ritualist',
    x:280, y:160,
    color:'#9DC4B0',
    accent:'#b8e0c8',
    description:'No one remembers their arrival. No one has heard them speak.',
    flavor:'"..." (they nod.)',
    onInteract:'openRitualist',
  },
];

// Special world position: where the central campfire sits
const CAMP_CAMPFIRE = { x: 0, y: 40 };

// Spawn position when player arrives at the camp (south of campfire, facing north)
const CAMP_SPAWN_POINT = { x: 0, y: 260 };

const ZONES=[
  // ── ASHEN WASTES ── dusty cool-gray plains with scattered dead trees and bone piles
  // Enemy levels 1-10 — the starter zone
  {id:'ashen',name:'Ashen Wastes',tier:'ZONE I',minLv:1,ambColor:'#8a7e9a',
   skyA:'#1a1620',skyB:'#0f0c14',skyC:'#07060a',
   groundBase:'#1c1a24',
   patchA:'rgba(90,82,100,0.22)',
   patchB:'rgba(40,35,48,0.28)',
   patchC:'rgba(170,155,175,0.09)',
   pathColor:'rgba(150,140,150,0.22)',
   canopyTint:'#4a4840',canopyDark:'#2a2820',trunkColor:'#2a1f18',
   grassColor:'#4a5040',grassDark:'#2d3228',mossColor:'#3a4230',
   mushroomCap:'#6a4030',
   tileA:'rgba(180,120,255,0.032)',tileB:'rgba(140,80,220,0.018)',
   gridC:'rgba(160,100,255,0.038)',fogC:'rgba(90,85,105,',lightC:'rgba(200,190,210,',
   hasPillars:true,edgeC:'rgba(40,30,55,0.5)',
   // Dense forest-ish mix: dead trees, boulders, rock clusters, grass, stone ruins, fallen logs
   props:['deadTree','boulder','rockCluster','stoneRuin','grassTuft','fallenLog','boneHeap','bonePile','ashStone'],
   counts:[45,22,38,18,70,14,18,22,28],
   bias:['wraith','skeleton','shade'],ashFx:true},

  // ── BONE CRYPTS ── warm amber-lit ruins, tan sandstone, buried bones
  // Enemy levels 8-22 — overlaps with late Ashen for smooth transition
  {id:'crypts',name:'Bone Crypts',tier:'ZONE II',minLv:8,ambColor:'#d4a04a',
   skyA:'#1a0e06',skyB:'#0d0703',skyC:'#050301',
   groundBase:'#241a0c',
   patchA:'rgba(180,130,60,0.22)',
   patchB:'rgba(60,40,18,0.32)',
   patchC:'rgba(240,200,130,0.10)',
   pathColor:'rgba(200,160,90,0.26)',
   canopyTint:'#6a5020',canopyDark:'#3a2810',trunkColor:'#3a2410',
   grassColor:'#7a6838',grassDark:'#4a3820',mossColor:'#5a4a28',
   mushroomCap:'#8a5030',
   tileA:'rgba(200,160,80,0.028)',tileB:'rgba(160,120,60,0.016)',
   gridC:'rgba(180,140,70,0.036)',fogC:'rgba(160,110,50,',lightC:'rgba(255,210,120,',
   hasPillars:false,edgeC:'rgba(30,20,5,0.45)',
   // Ruins-heavy zone: stone walls, tombs, bone piles, the odd tree
   props:['stoneRuin','boulder','boneHeap','sarcophagus','cryptTomb','skullPile','deadTree','rockCluster','cryptTorch','grassTuft'],
   counts:[30,20,38,16,22,35,20,28,24,32],
   bias:['skeleton','golem','abomination'],boneDust:true},

  // ── ABYSSAL MIRE ── lush green swamp, mossy rocks, actual live trees, water ponds
  // Enemy levels 20-38 — middle grind
  {id:'mire',name:'Abyssal Mire',tier:'ZONE III',minLv:18,ambColor:'#4ec96e',
   skyA:'#081a0a',skyB:'#040c05',skyC:'#020602',
   groundBase:'#0a1e0c',
   patchA:'rgba(60,120,70,0.26)',
   patchB:'rgba(15,45,25,0.32)',
   patchC:'rgba(150,220,170,0.09)',
   pathColor:'rgba(90,130,80,0.28)',
   canopyTint:'#3a8030',canopyDark:'#205518',trunkColor:'#3a2810',
   grassColor:'#5ea044',grassDark:'#355a28',mossColor:'#4a8030',
   mushroomCap:'#c8402a', // bright red fly-agaric caps
   tileA:'rgba(50,200,100,0.028)',tileB:'rgba(30,160,70,0.016)',
   gridC:'rgba(40,180,80,0.036)',fogC:'rgba(40,140,70,',lightC:'rgba(100,230,130,',
   hasPillars:true,edgeC:'rgba(5,35,15,0.48)',
   // Heavy forest zone: lots of live trees, mushrooms, water, grass everywhere
   props:['realTree','realTree','rockCluster','grassTuft','mushroom','stoneRuin','waterPond','fallenLog','boulder','mireRoot'],
   counts:[60,40,30,80,48,14,22,18,20,30],
   bias:['crawler','abomination','specter'],toxicFx:true},

  // ── VEIL'S SPIRE ── volcanic red wasteland, black obsidian, lava cracks
  // Enemy levels 35-60 — endgame zone
  {id:'spire',name:"Veil's Spire",tier:'ZONE IV',minLv:30,ambColor:'#ff6b2c',
   skyA:'#200602',skyB:'#100301',skyC:'#080100',
   groundBase:'#1a0805',
   patchA:'rgba(180,50,20,0.26)',
   patchB:'rgba(40,8,4,0.32)',
   patchC:'rgba(255,160,60,0.14)',
   pathColor:'rgba(220,80,40,0.28)',
   canopyTint:'#503020',canopyDark:'#281510',trunkColor:'#1a0806',
   grassColor:'#7a4028',grassDark:'#3a1a10',mossColor:'#5a2810',
   mushroomCap:'#e05030',
   tileA:'rgba(255,60,60,0.03)',tileB:'rgba(200,30,30,0.016)',
   gridC:'rgba(240,50,50,0.038)',fogC:'rgba(180,40,10,',lightC:'rgba(255,140,60,',
   hasPillars:true,edgeC:'rgba(90,8,0,0.55)',
   // Volcanic: boulders, obsidian pillars, lava pools, charred dead trees, cracks
   props:['boulder','rockCluster','obsidianPillar','lavaPool','crackGround','hellTorch','deadTree','ashObelisk','veilCrystal','stoneRuin'],
   counts:[32,40,22,28,40,22,22,14,18,14],
   bias:['specter','shade','wraith'],lavaFx:true,riftFx:true},
];
let curZone=ZONES[0],zoneTransiting=false;


// ═══════ FORMULAS ════════════════════════════════════════
function computeMaxHp(lv){
  // Base formula scaled by class baseHp as a multiplier vs 1000 (Hollowcaller baseline)
  const base = Math.round(800+lv*45+lv*lv*0.8);
  if(typeof player!=='undefined' && player && player.classId && typeof CLASS_DEFS!=='undefined'){
    const cls = CLASS_DEFS[player.classId] || CLASS_DEFS.hollowcaller;
    return Math.round(base * (cls.baseHp/1000));
  }
  return base;
}
function computeAttack(lv){
  const base = 12+lv*2.2+lv*lv*0.04;
  if(typeof player!=='undefined' && player && player.classId && typeof CLASS_DEFS!=='undefined'){
    const cls = CLASS_DEFS[player.classId] || CLASS_DEFS.hollowcaller;
    return base * (cls.baseAtk/15);
  }
  return base;
}
// XP curve — classic-WoW-style slow progression. Shape:
//   Levels 1-10: fast hook (<30 min)
//   Levels 10-30: moderate grind (~5 hours)
//   Levels 30-50: commitment (~15 hours) — the classic WoW "wall"
//   Levels 50-100: long haul (~100 hours)
// Total time to level 50 at ~5s per kill: ~20 hours.
// Total time to level 100: ~125 hours.
// Shape: xp_for_level(lv) = 60 * lv^1.6
function xpForLevel(lv){return Math.floor(60*Math.pow(lv,1.6));}
// ═══════ ENEMY SCALING (player-relative) ═══════════════════════════
// Design philosophy: This is an AFK-friendly idle ARPG, not classic WoW.
// Enemies should always feel appropriate to the player's level — not
// trivial, not impossible. The player's sense of progression comes from:
//  1. Gear upgrades (the primary damage/survival lever)
//  2. Level-based passive bonuses (speed, attack speed)
//  3. Mob density scaling (more enemies at higher levels)
// Enemy HP/damage scales with the player's level so every fight is in the
// right ballpark. Breakthrough difficulty comes from gear, not level gaps.

// Enemy HP scale — grows with player level.
// At level 1: base HP. At level 50: ~3.5x. At level 100: ~6x.
// Tuned so a same-level enemy takes 3-5 seconds of basic attacks to kill.
function enemyHpScale(lv){
  // Base curve: 1.0 + 0.065 per level, flattening slightly at high levels
  return 1.0 + 0.065 * lv - 0.0003 * lv * lv;
}

// Enemy damage scale — grows with player level.
// Slightly slower growth than HP so fights don't get progressively deadlier.
function enemyDmgScale(lv){
  return 0.85 + 0.035 * lv - 0.0001 * lv * lv;
}

// ═══════ PLAYER PASSIVE LEVEL BONUSES ══════════════════════════════
// Gain a small amount of speed and attack speed per level. These make
// leveling *feel* like something even before gear enters the picture.

// Movement speed multiplier based on level.
// Level 1: 1.00x (baseline). Level 50: 1.25x. Level 100: 1.50x.
// Applied on top of class.speedMult.
function playerSpeedBonus(lv){
  return 1.0 + 0.005 * (lv - 1); // 0.5% per level past 1
}

// Attack speed multiplier based on level.
// Level 1: 1.00x. Level 50: 1.15x. Level 100: 1.30x.
// Reduces cooldowns on abilities and basic attack intervals.
function playerAttackSpeedBonus(lv){
  return 1.0 + 0.003 * (lv - 1); // 0.3% per level past 1
}

// Mob density scaling — how many enemies can exist at once.
// Level 1: 1.00x. Level 50: 1.5x. Level 100: 2.0x.
// Creates a sense that the world gets busier as you grow.
function mobDensityMult(lv){
  return 1.0 + 0.01 * (lv - 1); // 1% per level
}

// ═══════ COMPAT STUBS ═══════════════════════════════════════════════
// The following are stubs for code that was calling the old level-bracket
// system. They return neutral values (1.0 multiplier) so any straggler
// calls behave as no-ops. They can be removed once all call sites are
// cleaned up.
function rollEnemyLevel(){return 1;}
function playerVsEnemyDmgMult(){return 1.0;}
function enemyVsPlayerDmgMult(){return 1.0;}
function xpRewardMult(){return 1.0;}
function enemyDifficultyColor(){return '#ffffff';}

function dist2(x1,y1,x2,y2){return Math.sqrt((x2-x1)**2+(y2-y1)**2);}

// ═══════ ENEMY TYPES ═════════════════════════════════════
// Forward-declare draw functions then assign to types
const ENEMY_TYPES=[
  {type:'wraith',name:'Ashen Wraith',color:'#a855f7',r:14,hp:1.0,dmg:1.0,spd:110,draw:null},
  {type:'skeleton',name:'Hollow Boneman',color:'#d1d5db',r:13,hp:0.8,dmg:0.9,spd:95,draw:null},
  {type:'crawler',name:'Veil Crawler',color:'#ef4444',r:10,hp:0.6,dmg:1.2,spd:145,draw:null},
  {type:'golem',name:'Ash Golem',color:'#f59e0b',r:20,hp:2.5,dmg:0.8,spd:65,draw:null},
  {type:'shade',name:'Pale Shade',color:'#818cf8',r:12,hp:0.7,dmg:1.4,spd:130,draw:null},
  {type:'abomination',name:'Veil Abomination',color:'#34d399',r:22,hp:3.5,dmg:1.1,spd:55,draw:null},
  {type:'specter',name:'Hollow Specter',color:'#9DC4B0',r:11,hp:0.5,dmg:0.8,spd:165,draw:null,elite:true},
];

function drawWraith(e,t){
  const fl=e.hitFlash>0,p=0.88+Math.sin(t/600+e.id)*0.12;
  ctx.save();
  ctx.shadowColor=e.typeData.color; ctx.shadowBlur=fl?28:16;
  // Outer aura — softened so crowds don't visually stack into overload
  const ag=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size*2.2);
  ag.addColorStop(0,'rgba(168,85,247,0.07)');ag.addColorStop(1,'rgba(168,85,247,0)');
  ctx.fillStyle=ag;ctx.beginPath();ctx.arc(e.x,e.y,e.size*2.2,0,Math.PI*2);ctx.fill();
  // Robe
  ctx.fillStyle=fl?'#fff':e.typeData.color; ctx.globalAlpha=0.92*p;
  ctx.beginPath();ctx.ellipse(e.x,e.y,e.size*0.72,e.size,0,0,Math.PI*2);ctx.fill();
  // Flowing robe bottom
  ctx.beginPath();
  ctx.moveTo(e.x-e.size*0.8,e.y+e.size*0.5);
  ctx.bezierCurveTo(e.x-e.size*1.1,e.y+e.size*1.3+Math.sin(t/300)*4,e.x-e.size*0.3,e.y+e.size*1.5,e.x,e.y+e.size*1.6);
  ctx.bezierCurveTo(e.x+e.size*0.3,e.y+e.size*1.5,e.x+e.size*1.1,e.y+e.size*1.3-Math.sin(t/300)*4,e.x+e.size*0.8,e.y+e.size*0.5);
  ctx.closePath();ctx.fill();
  // Hood
  ctx.fillStyle=fl?'#fff':'#2d0060';ctx.globalAlpha=1;
  ctx.beginPath();ctx.arc(e.x,e.y-e.size*0.5,e.size*0.58,0,Math.PI*2);ctx.fill();
  // Glowing eyes
  ctx.fillStyle='#e879f9';ctx.shadowColor='#e879f9';ctx.shadowBlur=10;
  ctx.beginPath();ctx.arc(e.x-4,e.y-e.size*0.55,2.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(e.x+4,e.y-e.size*0.55,2.5,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawSkeleton(e,t){
  const fl=e.hitFlash>0,walk=Math.sin(t/180+e.id)*0.22;
  ctx.save();
  ctx.shadowColor='#e5e7eb'; ctx.shadowBlur=fl?22:8;
  ctx.strokeStyle=fl?'#fff':'#d1d5db'; ctx.lineWidth=2.5; ctx.lineCap='round';
  // Spine
  ctx.beginPath();ctx.moveTo(e.x,e.y-e.size*0.4);ctx.lineTo(e.x,e.y+e.size*0.4);ctx.stroke();
  // Ribcage lines
  ctx.lineWidth=1.5; ctx.strokeStyle=fl?'#fff':'#9ca3af';
  for(let i=0;i<3;i++){const ry=e.y-e.size*0.2+i*e.size*0.2;ctx.beginPath();ctx.moveTo(e.x-e.size*0.5,ry);ctx.lineTo(e.x+e.size*0.5,ry);ctx.stroke();}
  // Arms with swing
  ctx.lineWidth=2.2;ctx.strokeStyle=fl?'#fff':'#d1d5db';
  ctx.beginPath();ctx.moveTo(e.x-e.size*0.55,e.y-e.size*0.1);ctx.lineTo(e.x-e.size*0.8,e.y+e.size*0.3+Math.sin(walk)*5);ctx.lineTo(e.x-e.size*0.7,e.y+e.size*0.7+Math.sin(walk)*8);ctx.stroke();
  ctx.beginPath();ctx.moveTo(e.x+e.size*0.55,e.y-e.size*0.1);ctx.lineTo(e.x+e.size*0.8,e.y+e.size*0.3-Math.sin(walk)*5);ctx.lineTo(e.x+e.size*0.7,e.y+e.size*0.7-Math.sin(walk)*8);ctx.stroke();
  // Legs
  ctx.beginPath();ctx.moveTo(e.x,e.y+e.size*0.4);ctx.lineTo(e.x-e.size*0.38,e.y+e.size+Math.sin(walk+1)*6);ctx.lineTo(e.x-e.size*0.3,e.y+e.size*1.6);ctx.stroke();
  ctx.beginPath();ctx.moveTo(e.x,e.y+e.size*0.4);ctx.lineTo(e.x+e.size*0.38,e.y+e.size-Math.sin(walk+1)*6);ctx.lineTo(e.x+e.size*0.3,e.y+e.size*1.6);ctx.stroke();
  // Skull
  ctx.fillStyle=fl?'#fff':'#e5e7eb'; ctx.shadowBlur=fl?22:4;
  ctx.beginPath();ctx.arc(e.x,e.y-e.size*0.72,e.size*0.46,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#111';
  ctx.beginPath();ctx.arc(e.x-e.size*0.16,e.y-e.size*0.78,e.size*0.12,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(e.x+e.size*0.16,e.y-e.size*0.78,e.size*0.12,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawCrawler(e,t){
  const fl=e.hitFlash>0,scurry=Math.sin(t/80+e.id)*4;
  ctx.save();
  ctx.shadowColor='#ef4444'; ctx.shadowBlur=fl?22:10;
  // Body glow — soft rather than a bright red ring so many crawlers on screen
  // don't visually overload the player
  const bg=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size*1.3);
  bg.addColorStop(0,'rgba(239,68,68,0.08)');bg.addColorStop(1,'rgba(239,68,68,0)');
  ctx.fillStyle=bg;ctx.beginPath();ctx.arc(e.x,e.y,e.size*1.3,0,Math.PI*2);ctx.fill();
  // Legs (8)
  ctx.strokeStyle=fl?'#fff':'#7f1d1d'; ctx.lineWidth=1.8;
  for(let i=0;i<4;i++){
    const a=(i/4-0.5)*Math.PI*0.85;
    const lx=Math.cos(a)*e.size*1.2,ly=Math.sin(a)*e.size*0.6;
    const sc=i%2===0?scurry:-scurry;
    ctx.beginPath();ctx.moveTo(e.x+lx,e.y+ly);ctx.quadraticCurveTo(e.x+lx*1.5,e.y+ly*1.5+sc,e.x+lx*2,e.y+ly*2+sc*1.5);ctx.stroke();
    ctx.beginPath();ctx.moveTo(e.x-lx,e.y+ly);ctx.quadraticCurveTo(e.x-lx*1.5,e.y+ly*1.5-sc,e.x-lx*2,e.y+ly*2-sc*1.5);ctx.stroke();
  }
  // Body
  ctx.fillStyle=fl?'#fff':'#991b1b';
  ctx.beginPath();ctx.ellipse(e.x,e.y,e.size*1.25,e.size*0.75,0,0,Math.PI*2);ctx.fill();
  // Carapace plates
  ctx.fillStyle=fl?'#fff':'#7f1d1d';
  for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(e.x-e.size*0.4+i*e.size*0.4,e.y-e.size*0.1,e.size*0.25,e.size*0.35,0,0,Math.PI*2);ctx.fill();}
  // Eyes row
  ctx.fillStyle='#fca5a5';ctx.shadowColor='#ef4444';ctx.shadowBlur=6;
  for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(e.x-e.size*0.45+i*e.size*0.3,e.y-e.size*0.45,2,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}

function drawGolem(e,t){
  const fl=e.hitFlash>0,sway=Math.sin(t/400+e.id)*2;
  ctx.save();
  ctx.shadowColor='#f59e0b'; ctx.shadowBlur=fl?30:18;
  const s=e.size;
  ctx.translate(e.x,e.y+sway);
  // Outer lava glow
  const lg=ctx.createRadialGradient(0,0,0,0,0,s*2.5);
  lg.addColorStop(0,'rgba(245,158,11,0.12)');lg.addColorStop(1,'rgba(245,158,11,0)');
  ctx.fillStyle=lg;ctx.beginPath();ctx.arc(0,0,s*2.5,0,Math.PI*2);ctx.fill();
  // Legs
  ctx.fillStyle=fl?'#fff':'#5c2d00';
  ctx.fillRect(-s*0.6,s*0.8,s*0.5,s*0.8);ctx.fillRect(s*0.1,s*0.8,s*0.5,s*0.8);
  // Body
  ctx.fillStyle=fl?'#fff':'#78350f';
  ctx.beginPath();ctx.roundRect(-s*0.8,-s*0.7,s*1.6,s*1.6,4);ctx.fill();
  // Chest crack glow
  ctx.strokeStyle='#f59e0b';ctx.lineWidth=2;ctx.shadowBlur=12;
  ctx.beginPath();ctx.moveTo(-s*0.2,-s*0.4);ctx.lineTo(0,s*0.2);ctx.lineTo(s*0.15,s*0.6);ctx.stroke();
  // Arms
  ctx.fillStyle=fl?'#fff':'#6b2d00';
  ctx.fillRect(-s*1.45,-s*0.5,s*0.65,s*1.1);ctx.fillRect(s*0.8,-s*0.5,s*0.65,s*1.1);
  // Fists
  ctx.fillStyle=fl?'#fff':'#92400e';
  ctx.beginPath();ctx.arc(-s*1.12,s*0.55,s*0.38,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(s*1.12,s*0.55,s*0.38,0,Math.PI*2);ctx.fill();
  // Head
  ctx.fillStyle=fl?'#fff':'#92400e';
  ctx.beginPath();ctx.roundRect(-s*0.6,-s*1.6,s*1.2,s*0.95,4);ctx.fill();
  // Eyes (glowing rectangular)
  ctx.fillStyle='#fde68a';ctx.shadowColor='#f59e0b';ctx.shadowBlur=14;
  ctx.fillRect(-s*0.42,-s*1.4,s*0.34,s*0.22);ctx.fillRect(s*0.08,-s*1.4,s*0.34,s*0.22);
  ctx.restore();
}

function drawShade(e,t){
  const fl=e.hitFlash>0,p=0.65+Math.sin(t/380+e.id*2)*0.35;
  ctx.save();
  ctx.globalAlpha=p;
  ctx.shadowColor='#818cf8'; ctx.shadowBlur=fl?25:18;
  // Shifting form
  ctx.fillStyle=fl?'rgba(255,255,255,0.85)':'rgba(30,27,75,0.92)';
  ctx.beginPath();
  for(let i=0;i<7;i++){
    const a=(i/7)*Math.PI*2,r=e.size*(0.78+Math.sin(t/180+i*1.3)*0.35);
    i===0?ctx.moveTo(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r):ctx.lineTo(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r);
  }
  ctx.closePath();ctx.fill();
  // Inner glow
  ctx.globalAlpha=0.9;
  const cg=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size*0.6);
  cg.addColorStop(0,'#818cf8');cg.addColorStop(1,'transparent');
  ctx.fillStyle=cg;ctx.beginPath();ctx.arc(e.x,e.y,e.size*0.6,0,Math.PI*2);ctx.fill();
  // Orbiting motes
  for(let i=0;i<3;i++){
    const a=t/600+i*(Math.PI*2/3);
    const mx=e.x+Math.cos(a)*e.size*1.4,my=e.y+Math.sin(a)*e.size*1.4;
    ctx.fillStyle='#c7d2fe';ctx.globalAlpha=0.7;ctx.beginPath();ctx.arc(mx,my,2.5,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

function drawAbomination(e,t){
  const fl=e.hitFlash>0;
  ctx.save();
  ctx.shadowColor='#34d399'; ctx.shadowBlur=fl?35:22;
  // Outer toxic aura — softened
  const ag=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size*2.5);
  ag.addColorStop(0,'rgba(52,211,153,0.05)');ag.addColorStop(1,'rgba(52,211,153,0)');
  ctx.fillStyle=ag;ctx.beginPath();ctx.arc(e.x,e.y,e.size*2.5,0,Math.PI*2);ctx.fill();
  // Blob body parts
  for(let i=0;i<7;i++){
    const a=(i/7)*Math.PI*2+t/2200;
    const r=e.size*(0.65+Math.sin(i*2.1)*0.45);
    const ox=e.x+Math.cos(a)*e.size*0.45,oy=e.y+Math.sin(a)*e.size*0.45;
    ctx.fillStyle=fl?'#fff':`hsl(${155+i*12},45%,${14+i*2}%)`;
    ctx.globalAlpha=0.88;
    ctx.beginPath();ctx.arc(ox,oy,r*0.9,0,Math.PI*2);ctx.fill();
  }
  // Main body
  ctx.globalAlpha=1;ctx.fillStyle=fl?'#fff':'#064e3b';
  ctx.beginPath();ctx.arc(e.x,e.y,e.size*0.7,0,Math.PI*2);ctx.fill();
  // Rotating eyes
  ctx.fillStyle='#6ee7b7';ctx.shadowColor='#34d399';ctx.shadowBlur=10;
  for(let i=0;i<5;i++){
    const a=(i/5)*Math.PI*2+t/1200;
    ctx.beginPath();ctx.arc(e.x+Math.cos(a)*e.size*0.5,e.y+Math.sin(a)*e.size*0.5,3,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

function drawSpecter(e,t){
  const fl=e.hitFlash>0,p=0.55+Math.sin(t/480+e.id)*0.45;
  ctx.save();
  ctx.globalAlpha=p;ctx.shadowColor='#9DC4B0';ctx.shadowBlur=fl?35:24;
  // Ghostly form
  ctx.fillStyle=fl?'#fff':'rgba(157,196,176,0.85)';
  ctx.beginPath();
  ctx.arc(e.x,e.y-e.size*0.3,e.size*0.72,Math.PI,0);
  ctx.bezierCurveTo(e.x+e.size,e.y+e.size*0.5,e.x+e.size*0.3,e.y+e.size,e.x,e.y+e.size*0.85);
  ctx.bezierCurveTo(e.x-e.size*0.3,e.y+e.size,e.x-e.size,e.y+e.size*0.5,e.x-e.size,e.y-e.size*0.3);
  ctx.closePath();ctx.fill();
  // Trailing wisps
  for(let i=1;i<=3;i++){
    ctx.globalAlpha=p*(1-i*0.25);
    ctx.beginPath();ctx.arc(e.x+Math.sin(t/300+i)*3,e.y+e.size*0.7+i*e.size*0.25,e.size*(0.3-i*0.07),0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=0.9;
  ctx.fillStyle='rgba(0,0,0,0.75)';
  ctx.beginPath();ctx.ellipse(e.x,e.y-e.size*0.2,e.size*0.38,e.size*0.48,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.shadowBlur=6;ctx.globalAlpha=1;
  ctx.beginPath();ctx.arc(e.x-e.size*0.17,e.y-e.size*0.28,2.2,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(e.x+e.size*0.17,e.y-e.size*0.28,2.2,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// Assign draw functions
ENEMY_TYPES[0].draw=drawWraith;
ENEMY_TYPES[1].draw=drawSkeleton;
ENEMY_TYPES[2].draw=drawCrawler;
ENEMY_TYPES[3].draw=drawGolem;
ENEMY_TYPES[4].draw=drawShade;
ENEMY_TYPES[5].draw=drawAbomination;
ENEMY_TYPES[6].draw=drawSpecter;


// ═══════ TALENT TREE DATA ════════════════════════════════
// Three branches, six talents each. Talents have 1-3 ranks.
// "gate" is the minimum number of points that must be spent in this branch before unlocking.
// "effect" describes what each rank does in plain language for the tooltip.
// "apply(rank)" returns a partial bonus object the engine reads via getTalentBonus().
//
// Supported bonus keys (engine reads these in game.js):
//   hpPct         — % increase to max HP
//   dmgPct        — % increase to all ability damage
//   cdrPct        — % cooldown reduction across all abilities
//   critPct       — % added crit chance
//   moveSpdPct    — % added movement speed
//   spiritCap     — flat increase to spirit bond cap
//   spiritDmgPct  — % increase to spirit auto-attack damage
//   lifeOnHit     — flat HP gained per enemy killed
//   detoRadius    — flat pixels added to Detonate radius
//   detoDmgPct    — % increase to Detonate damage specifically
//   veilmarkMax   — flat increase to max Veilmark stacks
//   wrathRadius   — flat pixels added to Wrath Tide radius

const TALENT_TREE={
  Binding:{
    color:'#9DC4B0',
    icon:'✦',
    talents:[
      {id:'b1',name:'Greater Bond',icon:'◉',maxRank:3,gate:0,
       desc:'Increase spirit bond cap.',
       effect:r=>`+${r} spirit cap`,
       apply:r=>({spiritCap:r})},
      {id:'b2',name:'Vicious Spirits',icon:'▲',maxRank:3,gate:0,
       desc:'Your spirits hit harder.',
       effect:r=>`+${r*10}% spirit damage`,
       apply:r=>({spiritDmgPct:r*10})},
      {id:'b3',name:'Swift Summoning',icon:'↯',maxRank:2,gate:2,
       desc:'Raise cooldown reduced.',
       effect:r=>`-${r*15}% Raise cooldown`,
       apply:r=>({raiseCdrPct:r*15})},
      {id:'b4',name:'Echoing Call',icon:'◈',maxRank:1,gate:3,
       desc:'Raise now summons two spirits at once.',
       effect:_=>'Raise summons 2 spirits',
       apply:_=>({raiseDoubles:1})},
      {id:'b5',name:'Spirit Pact',icon:'✪',maxRank:3,gate:4,
       desc:'Each living spirit increases your damage.',
       effect:r=>`+${r*3}% damage per spirit`,
       apply:r=>({perSpiritDmgPct:r*3})},
      {id:'b6',name:'Soul Eruption',icon:'✺',maxRank:1,gate:6,
       desc:'Spirits explode on death, damaging nearby enemies.',
       effect:_=>'Spirits detonate on death',
       apply:_=>({spiritExplode:1})},
    ],
  },
  Veilcraft:{
    color:'#f43f5e',
    icon:'✖',
    talents:[
      {id:'v1',name:'Searing Mark',icon:'◎',maxRank:3,gate:0,
       desc:'Detonate hits harder.',
       effect:r=>`+${r*12}% Detonate damage`,
       apply:r=>({detoDmgPct:r*12})},
      {id:'v2',name:'Widening Veil',icon:'○',maxRank:3,gate:0,
       desc:'Detonate affects a larger area.',
       effect:r=>`+${r*25} Detonate radius`,
       apply:r=>({detoRadius:r*25})},
      {id:'v3',name:'Deep Mark',icon:'◆',maxRank:2,gate:2,
       desc:'Veilmark stacks cap higher.',
       effect:r=>`+${r*2} max Veilmark stacks`,
       apply:r=>({veilmarkMax:r*2})},
      {id:'v4',name:'Unbound Wrath',icon:'⟐',maxRank:3,gate:3,
       desc:'Wrath Tide strikes a wider area.',
       effect:r=>`+${r*30} Wrath Tide radius`,
       apply:r=>({wrathRadius:r*30})},
      {id:'v5',name:'Relentless Veil',icon:'⚡',maxRank:3,gate:4,
       desc:'All ability cooldowns reduced.',
       effect:r=>`-${r*6}% all cooldowns`,
       apply:r=>({cdrPct:r*6})},
      {id:'v6',name:'Cataclysm',icon:'✹',maxRank:1,gate:6,
       desc:'Detonate has a 30% chance to trigger a second time.',
       effect:_=>'Detonate echoes 30% of the time',
       apply:_=>({detoEcho:1})},
    ],
  },
  Hollow:{
    color:'#c084fc',
    icon:'♰',
    talents:[
      {id:'h1',name:'Veiled Flesh',icon:'♡',maxRank:3,gate:0,
       desc:'Increase your max health.',
       effect:r=>`+${r*8}% max HP`,
       apply:r=>({hpPct:r*8})},
      {id:'h2',name:'Hollow Step',icon:'↦',maxRank:3,gate:0,
       desc:'Move faster.',
       effect:r=>`+${r*4}% movement speed`,
       apply:r=>({moveSpdPct:r*4})},
      {id:'h3',name:'Pale Vitality',icon:'❂',maxRank:3,gate:2,
       desc:'Heal HP every time an enemy dies.',
       effect:r=>`Heal ${r*8} HP per kill`,
       apply:r=>({lifeOnHit:r*8})},
      {id:'h4',name:'Deft Casting',icon:'◇',maxRank:3,gate:3,
       desc:'Increased critical strike chance.',
       effect:r=>`+${r*3}% crit chance`,
       apply:r=>({critPct:r*3})},
      {id:'h5',name:'Hollow Resilience',icon:'⊠',maxRank:3,gate:4,
       desc:'Reduces damage taken.',
       effect:r=>`-${r*5}% damage taken`,
       apply:r=>({dmgReducePct:r*5})},
      {id:'h6',name:'Everlasting',icon:'✦',maxRank:1,gate:6,
       desc:'Once per life, fatal damage is reduced to 1 HP instead.',
       effect:_=>'Cheat death once per life',
       apply:_=>({cheatDeath:1})},
    ],
  },
};


// ═══════ DUNGEON DEFINITIONS ═══════════════════════════════
// Each dungeon is a sealed arena run. Waves spawn in order; when all enemies
// die the next wave begins. Final wave is the boss — a beefed-up elite with
// inflated HP and a unique name. On boss kill, guaranteed loot of at least
// the specified minimum rarity.
const DUNGEONS=[
  {
    id:'hollow_crypt',
    name:'Hollow Crypt',
    desc:'A forgotten burial site where the restless dead stir beneath cracked flagstones.',
    minLevel:3,
    tier:1,
    color:'#9ca3af',
    enemyTypes:['skeleton','crawler','wraith'],
    // Visual theme — cold gray crypt, pale stone, heavy shadow
    theme:{
      id:'hollow_crypt',
      ambColor:'#b8b8c4',
      skyA:'#060607',skyB:'#040405',skyC:'#020203',
      groundBase:'#18181c',
      patchA:'rgba(140,140,155,0.20)',   // pale stone flagstone patches
      patchB:'rgba(25,25,30,0.32)',       // dark crypt shadow hollows
      patchC:'rgba(210,210,220,0.09)',    // dust/bone chip flecks
      pathColor:'rgba(180,175,185,0.22)', // worn crypt stone path
      canopyTint:'#3a3840',canopyDark:'#1e1c22',trunkColor:'#1a1612',
      grassColor:'#4a484a',grassDark:'#2a282a',mossColor:'#3a4030',
      tileA:'rgba(200,200,215,0.045)',tileB:'rgba(140,140,160,0.022)',
      gridC:'rgba(200,200,220,0.08)',
      fogC:'rgba(180,180,200,',
      lightC:'rgba(220,220,240,',
      hasPillars:true,
      edgeC:'rgba(10,10,15,0.6)',
      props:['cryptPillar','stoneRuin','sarcophagus','boneHeap','skullPile','rockCluster','cobweb'],
      counts:[8,12,6,18,10,14,12],
    },
    waves:[
      {count:6,elites:0,types:['skeleton','crawler']},
      {count:8,elites:1,types:['skeleton','wraith']},
      {count:10,elites:1,types:['crawler','wraith','skeleton']},
    ],
    boss:{
      name:'Bone Revenant',
      baseType:'skeleton',
      hpMult:20,
      atkMult:1.8,
      sizeMult:2.2,
      // Signature ability: summons skeleton thralls to swarm the player
      ability:{type:'summonThralls',cooldown:8000,warmup:1500,count:2},
    },
    reward:{
      minRarity:'rare',
      bonusGold:200,
      bonusXP:100,
    },
  },
  {
    id:'wraith_sanctum',
    name:'Wraith Sanctum',
    desc:'An echoing temple where spirits scream louder than the living ever did.',
    minLevel:8,
    tier:2,
    color:'#60a5fa',
    enemyTypes:['wraith','shade','specter'],
    // Visual theme — ethereal blue temple with cold mist
    theme:{
      id:'wraith_sanctum',
      ambColor:'#60a5fa',
      skyA:'#04081a',skyB:'#020514',skyC:'#01020a',
      groundBase:'#080f1c',
      patchA:'rgba(60,130,220,0.22)',   // marbled blue stone patches
      patchB:'rgba(10,25,60,0.32)',      // dark temple alcoves
      patchC:'rgba(160,210,255,0.10)',   // ethereal blue sparkles
      pathColor:'rgba(120,170,220,0.24)', // shimmering veil path
      canopyTint:'#3058a0',canopyDark:'#15305a',trunkColor:'#1a1a28',
      grassColor:'#3a7080',grassDark:'#224050',mossColor:'#3060a0',
      tileA:'rgba(120,180,255,0.055)',tileB:'rgba(60,110,200,0.025)',
      gridC:'rgba(100,165,255,0.09)',
      fogC:'rgba(50,110,200,',
      lightC:'rgba(140,190,255,',
      hasPillars:true,
      edgeC:'rgba(3,10,30,0.55)',
      props:['cryptPillar','stoneRuin','veilCrystal','rockCluster','ashArch','veilTorch'],
      counts:[14,16,18,18,10,12],
    },
    waves:[
      {count:7,elites:0,types:['wraith','shade']},
      {count:9,elites:2,types:['wraith','shade','specter']},
      {count:11,elites:2,types:['shade','specter']},
    ],
    boss:{
      name:'Sorrowed Specter',
      baseType:'specter',
      hpMult:26,
      atkMult:2.1,
      sizeMult:2.4,
      // Signature ability: phase shift — become invulnerable, teleport, leave a shade echo
      ability:{type:'phaseShift',cooldown:6000,warmup:800,invulnMs:1500,teleportDist:320},
    },
    reward:{
      minRarity:'epic',
      bonusGold:500,
      bonusXP:250,
    },
  },
  {
    id:'ashen_cathedral',
    name:'Ashen Cathedral',
    desc:'A ruined cathedral where ancient wardens refuse to accept their death.',
    minLevel:15,
    tier:3,
    color:'#f59e0b',
    enemyTypes:['golem','abomination','specter'],
    // Visual theme — warm firelit ruin, glowing amber embers, scorched stone
    theme:{
      id:'ashen_cathedral',
      ambColor:'#f59e0b',
      skyA:'#180a02',skyB:'#0e0601',skyC:'#050200',
      groundBase:'#1a0e04',
      patchA:'rgba(180,90,30,0.24)',   // scorched warm stone patches
      patchB:'rgba(50,15,3,0.32)',      // charred black burn marks
      patchC:'rgba(255,180,90,0.12)',   // glowing ember specks
      pathColor:'rgba(200,130,60,0.26)', // ash-stained stone aisle
      canopyTint:'#5a2810',canopyDark:'#2a1408',trunkColor:'#180802',
      grassColor:'#7a4828',grassDark:'#3a2410',mossColor:'#603020',
      tileA:'rgba(245,180,60,0.055)',tileB:'rgba(180,120,40,0.028)',
      gridC:'rgba(230,160,50,0.09)',
      fogC:'rgba(180,90,20,',
      lightC:'rgba(255,200,100,',
      hasPillars:true,
      edgeC:'rgba(30,10,0,0.58)',
      props:['obsidianPillar','stoneRuin','lavaPool','rockCluster','crackGround','hellTorch','ashObelisk'],
      counts:[12,14,14,16,18,18,8],
    },
    waves:[
      {count:6,elites:1,types:['golem','abomination']},
      {count:8,elites:2,types:['golem','specter']},
      {count:10,elites:3,types:['golem','abomination','specter']},
    ],
    boss:{
      name:'Cathedral Warden',
      baseType:'golem',
      hpMult:35,
      atkMult:2.5,
      sizeMult:2.8,
      // Signature ability: fire cross — 4 lines of fire shoot out in +-pattern
      ability:{type:'fireCross',cooldown:10000,warmup:1800,lineLength:520,lineWidth:80,damageMult:1.6,lingerMs:2000},
    },
    reward:{
      minRarity:'legendary',
      bonusGold:1200,
      bonusXP:600,
    },
  },
];
