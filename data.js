// ═══════ ASHENVEIL DATA ═══════

// ═══════ CONSTANTS ═══════════════════════════════════════
const WORLD_W=5000,WORLD_H=5000;
const PLAYER_SPEED=200;
const ATTACK_RANGE=230;
const ATTACK_CD=480;
const AFK_IDLE=2800;
const MAX_SPIRITS=5;
const MAX_LEVEL=100;
const ABILITY_CDS=[4000,3000,6000,12000];
const MAX_ENEMIES=20;


// ═══════ ZONE DEFINITIONS ═══════════════════════════════
const ZONES=[
  {id:'ashen',name:'Ashen Wastes',tier:'ZONE I',minLv:1,ambColor:'#c084fc',
   skyA:'#0e0420',skyB:'#080118',skyC:'#040010',
   groundBase:'#0c0820',tileA:'rgba(180,120,255,0.032)',tileB:'rgba(140,80,220,0.018)',
   gridC:'rgba(160,100,255,0.038)',fogC:'rgba(100,40,180,',lightC:'rgba(200,140,255,',
   hasPillars:true,edgeC:'rgba(80,20,120,0.35)',
   props:['ashStone','ashArch','veilCrystal','darkPool','ashPatch','veilTorch','ruinWall','bonePile'],
   counts:[55,18,30,28,55,22,15,40],bias:['wraith','skeleton','shade'],ashFx:true},
  {id:'crypts',name:'Bone Crypts',tier:'ZONE II',minLv:8,ambColor:'#d97706',
   skyA:'#080508',skyB:'#050305',skyC:'#020102',
   groundBase:'#0a0709',tileA:'rgba(200,160,80,0.028)',tileB:'rgba(160,120,60,0.016)',
   gridC:'rgba(180,140,70,0.036)',fogC:'rgba(80,60,30,',lightC:'rgba(220,170,80,',
   hasPillars:false,edgeC:'rgba(60,40,10,0.3)',
   props:['cryptPillar','sarcophagus','cryptTomb','bonePile','cobweb','skullPile','cryptTorch','cryptWall'],
   counts:[28,12,22,60,35,40,30,20],bias:['skeleton','golem','abomination'],boneDust:true},
  {id:'mire',name:'Abyssal Mire',tier:'ZONE III',minLv:18,ambColor:'#34d399',
   skyA:'#030d06',skyB:'#020904',skyC:'#010402',
   groundBase:'#040e05',tileA:'rgba(50,200,100,0.028)',tileB:'rgba(30,160,70,0.016)',
   gridC:'rgba(40,180,80,0.036)',fogC:'rgba(15,80,40,',lightC:'rgba(60,220,110,',
   hasPillars:true,edgeC:'rgba(10,60,25,0.32)',
   props:['swampTree','toxicPool','mushroom','mireRoot','toxicVent','mireVine','swampRock'],
   counts:[25,30,45,40,20,35,28],bias:['crawler','abomination','specter'],toxicFx:true},
  {id:'spire',name:"Veil's Spire",tier:'ZONE IV',minLv:30,ambColor:'#ef4444',
   skyA:'#130002',skyB:'#0a0001',skyC:'#050001',
   groundBase:'#120003',tileA:'rgba(255,60,60,0.03)',tileB:'rgba(200,30,30,0.016)',
   gridC:'rgba(240,50,50,0.038)',fogC:'rgba(140,10,10,',lightC:'rgba(255,90,70,',
   hasPillars:true,edgeC:'rgba(120,8,8,0.45)',
   props:['veilCrystal','lavaPool','obsidianPillar','veilRift','hellTorch','ashObelisk','crackGround'],
   counts:[28,25,22,14,28,18,40],bias:['specter','shade','wraith'],lavaFx:true,riftFx:true},
];
let curZone=ZONES[0],zoneTransiting=false;


// ═══════ FORMULAS ════════════════════════════════════════
function computeMaxHp(lv){return Math.round(800+lv*45+lv*lv*0.8);}
function computeAttack(lv){return 12+lv*2.2+lv*lv*0.04;}
function xpForLevel(lv){return Math.floor(100*Math.pow(lv,1.65));}
function enemyHpScale(lv){return lv<=5?0.72:lv<=10?0.88:lv<=20?1.05:1.4;}
function enemyDmgScale(lv){return lv<=5?0.65:lv<=10?0.82:lv<=20?0.98:1.25;}
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
  // Outer aura
  const ag=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size*2.5);
  ag.addColorStop(0,'rgba(168,85,247,0.15)');ag.addColorStop(1,'rgba(168,85,247,0)');
  ctx.fillStyle=ag;ctx.beginPath();ctx.arc(e.x,e.y,e.size*2.5,0,Math.PI*2);ctx.fill();
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
  // Body glow
  const bg=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size*1.5);
  bg.addColorStop(0,'rgba(239,68,68,0.2)');bg.addColorStop(1,'rgba(239,68,68,0)');
  ctx.fillStyle=bg;ctx.beginPath();ctx.arc(e.x,e.y,e.size*1.5,0,Math.PI*2);ctx.fill();
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
  // Outer toxic aura
  const ag=ctx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.size*3);
  ag.addColorStop(0,'rgba(52,211,153,0.1)');ag.addColorStop(1,'rgba(52,211,153,0)');
  ctx.fillStyle=ag;ctx.beginPath();ctx.arc(e.x,e.y,e.size*3,0,Math.PI*2);ctx.fill();
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
