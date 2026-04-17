// ═══════ ASHENVEIL GAME ENGINE ═══════

// ═══════════════════════════════════════════════════════════
// ASHENVEIL: VEILBOUND CHRONICLES — ENGINE v4
// Full rewrite: rich visuals, working music, smooth gameplay
// ═══════════════════════════════════════════════════════════

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H;
function resize(){ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; }
resize(); window.addEventListener('resize',resize);


// ═══════ ABILITY ICONS ════════════════════════════════
// Icons render to 52x52 canvases. Each ability has a distinct visual identity
// with layered effects: background glow + rune/sigil + foreground detail.
function drawAbilityIcons(){
  const S=52; // canvas size — must match width/height in index.html
  const CX=S/2, CY=S/2;

  // shared helper: draws a soft background glow and subtle outer ring
  function iconBG(x,color,bgInner='#1a0a30',bgOuter='#05000d'){
    // outer darkening vignette
    const bg=x.createRadialGradient(CX,CY,S*0.2,CX,CY,S*0.55);
    bg.addColorStop(0,bgInner);bg.addColorStop(1,bgOuter);
    x.fillStyle=bg;x.fillRect(0,0,S,S);
    // colored inner glow
    const g=x.createRadialGradient(CX,CY,0,CX,CY,S*0.5);
    g.addColorStop(0,color+'66');g.addColorStop(0.5,color+'22');g.addColorStop(1,color+'00');
    x.fillStyle=g;x.beginPath();x.arc(CX,CY,S*0.48,0,Math.PI*2);x.fill();
    // thin outer frame ring
    x.strokeStyle=color+'44';x.lineWidth=1;
    x.beginPath();x.arc(CX,CY,S*0.47,0,Math.PI*2);x.stroke();
  }

  // five ability icons — each draws onto a canvas 2d context
  const icons=[
    // ═══ Q: RAISE — ghost rising from soul-flame ═══
    (x)=>{
      x.clearRect(0,0,S,S);
      iconBG(x,'#9DC4B0');
      // soul-flame base (three flickering licks)
      x.shadowColor='#9DC4B0';x.shadowBlur=6;
      x.fillStyle='#9DC4B0';
      [[CX-8,40,5],[CX,42,7],[CX+8,40,5]].forEach(([fx,fy,fr])=>{
        x.beginPath();x.moveTo(fx-fr,fy);
        x.quadraticCurveTo(fx-fr,fy-fr*2,fx,fy-fr*2.5);
        x.quadraticCurveTo(fx+fr,fy-fr*2,fx+fr,fy);x.closePath();x.fill();
      });
      // ghost body (classic hovering wraith silhouette)
      x.shadowBlur=10;
      x.fillStyle='#e8d5ff';
      x.beginPath();
      x.arc(CX,CY-2,10,Math.PI,0);         // rounded head
      x.lineTo(CX+10,CY+10);                // right side down
      // wavy bottom edge
      x.quadraticCurveTo(CX+6,CY+14,CX+2,CY+10);
      x.quadraticCurveTo(CX-2,CY+14,CX-6,CY+10);
      x.quadraticCurveTo(CX-10,CY+14,CX-10,CY+10);
      x.closePath();x.fill();
      // hollow eyes
      x.shadowBlur=0;
      x.fillStyle='#1a0a30';
      x.beginPath();x.arc(CX-3.5,CY-3,1.8,0,Math.PI*2);x.fill();
      x.beginPath();x.arc(CX+3.5,CY-3,1.8,0,Math.PI*2);x.fill();
      // eye glow
      x.fillStyle='#9DC4B0';
      x.beginPath();x.arc(CX-3.5,CY-3,0.8,0,Math.PI*2);x.fill();
      x.beginPath();x.arc(CX+3.5,CY-3,0.8,0,Math.PI*2);x.fill();
    },

    // ═══ W: VEILMARK — occult targeting sigil ═══
    (x)=>{
      x.clearRect(0,0,S,S);
      iconBG(x,'#f43f5e');
      x.translate(CX,CY);
      // concentric targeting rings
      x.shadowColor='#f43f5e';x.shadowBlur=8;
      x.strokeStyle='#f43f5e';
      [16,11,6].forEach((r,i)=>{
        x.globalAlpha=0.4+i*0.25;x.lineWidth=1+i*0.3;
        x.beginPath();x.arc(0,0,r,0,Math.PI*2);x.stroke();
      });
      x.globalAlpha=1;
      // four crosshair ticks pointing inward
      x.lineWidth=1.5;
      for(let i=0;i<4;i++){
        x.rotate(Math.PI/2);
        x.beginPath();x.moveTo(0,-22);x.lineTo(0,-18);x.stroke();
      }
      // rotating runic marks between rings (small cross ticks)
      x.strokeStyle='#fda4af';x.lineWidth=0.8;
      for(let i=0;i<8;i++){
        const a=(i/8)*Math.PI*2, rr=13;
        const ex=Math.cos(a)*rr, ey=Math.sin(a)*rr;
        x.beginPath();x.moveTo(ex-1.5,ey);x.lineTo(ex+1.5,ey);x.moveTo(ex,ey-1.5);x.lineTo(ex,ey+1.5);x.stroke();
      }
      // bleeding-red core
      x.shadowBlur=10;
      const core=x.createRadialGradient(0,0,0,0,0,5);
      core.addColorStop(0,'#fff');core.addColorStop(0.3,'#fda4af');core.addColorStop(1,'#f43f5e');
      x.fillStyle=core;x.beginPath();x.arc(0,0,4,0,Math.PI*2);x.fill();
      x.translate(-CX,-CY);
    },

    // ═══ E: DETONATE — bursting fracture sigil ═══
    (x)=>{
      x.clearRect(0,0,S,S);
      iconBG(x,'#ff6b35');
      x.translate(CX,CY);
      // outer explosion star (8 long shards)
      x.shadowColor='#ff6b35';x.shadowBlur=10;
      const grad=x.createLinearGradient(0,-20,0,20);
      grad.addColorStop(0,'#fff4a0');grad.addColorStop(0.5,'#ff6b35');grad.addColorStop(1,'#8b1a00');
      x.fillStyle=grad;
      for(let i=0;i<8;i++){
        const a=(i/8)*Math.PI*2;
        x.beginPath();
        x.moveTo(Math.cos(a)*20,Math.sin(a)*20);
        x.lineTo(Math.cos(a+Math.PI/8)*6,Math.sin(a+Math.PI/8)*6);
        x.lineTo(Math.cos(a+Math.PI/4)*20,Math.sin(a+Math.PI/4)*20);
        x.lineTo(Math.cos(a+Math.PI/8)*9,Math.sin(a+Math.PI/8)*9);
        x.closePath();x.fill();
      }
      // inner flash
      x.shadowBlur=14;
      const flash=x.createRadialGradient(0,0,0,0,0,8);
      flash.addColorStop(0,'#fff');flash.addColorStop(0.4,'#fff4a0');flash.addColorStop(1,'#ff6b3500');
      x.fillStyle=flash;x.beginPath();x.arc(0,0,8,0,Math.PI*2);x.fill();
      // crack lines radiating out (fractures)
      x.strokeStyle='#1a0a30';x.lineWidth=0.8;x.shadowBlur=0;
      for(let i=0;i<4;i++){
        const a=(i/4)*Math.PI*2+Math.PI/8;
        x.beginPath();x.moveTo(Math.cos(a)*3,Math.sin(a)*3);
        x.lineTo(Math.cos(a)*14,Math.sin(a)*14);x.stroke();
      }
      x.translate(-CX,-CY);
    },

    // ═══ R: WRATH TIDE — skull in concentric shockwaves ═══
    (x)=>{
      x.clearRect(0,0,S,S);
      iconBG(x,'#a855f7');
      x.translate(CX,CY);
      // expanding shockwave rings
      x.shadowColor='#a855f7';x.shadowBlur=8;
      x.strokeStyle='#a855f7';
      [22,17,12].forEach((r,i)=>{
        x.globalAlpha=0.3+i*0.2;x.lineWidth=1.5-i*0.3;
        x.beginPath();x.arc(0,0,r,0,Math.PI*2);x.stroke();
      });
      x.globalAlpha=1;
      // skull core (simplified but recognizable)
      x.shadowBlur=6;
      x.fillStyle='#e8d5ff';
      // skull dome
      x.beginPath();x.arc(0,-2,7,Math.PI,0);
      // jaw
      x.lineTo(5,5);x.lineTo(3,7);x.lineTo(1,5);x.lineTo(-1,7);x.lineTo(-3,5);x.lineTo(-5,5);
      x.closePath();x.fill();
      // eye sockets
      x.shadowBlur=0;x.fillStyle='#1a0a30';
      x.beginPath();x.arc(-2.5,-2,1.8,0,Math.PI*2);x.fill();
      x.beginPath();x.arc(2.5,-2,1.8,0,Math.PI*2);x.fill();
      // nose
      x.beginPath();x.moveTo(0,0);x.lineTo(-1,2.5);x.lineTo(1,2.5);x.closePath();x.fill();
      // glowing eye pinpricks
      x.fillStyle='#a855f7';x.shadowColor='#a855f7';x.shadowBlur=4;
      x.beginPath();x.arc(-2.5,-2,0.7,0,Math.PI*2);x.fill();
      x.beginPath();x.arc(2.5,-2,0.7,0,Math.PI*2);x.fill();
      x.translate(-CX,-CY);
    },

    // ═══ F: SOUL NOVA — radiant star with orbiting souls ═══
    (x)=>{
      x.clearRect(0,0,S,S);
      iconBG(x,'#fbbf24');
      x.translate(CX,CY);
      // 8-pointed radiant star (four long + four short rays)
      x.shadowColor='#fbbf24';x.shadowBlur=12;
      const starGrad=x.createRadialGradient(0,0,0,0,0,20);
      starGrad.addColorStop(0,'#fff');starGrad.addColorStop(0.5,'#fbbf24');starGrad.addColorStop(1,'#7c2d12');
      x.fillStyle=starGrad;
      // long cardinal rays
      for(let i=0;i<4;i++){
        const a=(i/4)*Math.PI*2;
        x.beginPath();
        x.moveTo(Math.cos(a)*20,Math.sin(a)*20);
        x.lineTo(Math.cos(a+0.2)*4,Math.sin(a+0.2)*4);
        x.lineTo(Math.cos(a-0.2)*4,Math.sin(a-0.2)*4);
        x.closePath();x.fill();
      }
      // short diagonal rays
      for(let i=0;i<4;i++){
        const a=(i/4)*Math.PI*2+Math.PI/4;
        x.beginPath();
        x.moveTo(Math.cos(a)*12,Math.sin(a)*12);
        x.lineTo(Math.cos(a+0.3)*3,Math.sin(a+0.3)*3);
        x.lineTo(Math.cos(a-0.3)*3,Math.sin(a-0.3)*3);
        x.closePath();x.fill();
      }
      // brilliant inner core
      x.shadowBlur=16;
      const core=x.createRadialGradient(0,0,0,0,0,6);
      core.addColorStop(0,'#fff');core.addColorStop(0.6,'#fff4a0');core.addColorStop(1,'#fbbf2400');
      x.fillStyle=core;x.beginPath();x.arc(0,0,6,0,Math.PI*2);x.fill();
      // three orbiting soul-wisps (teal, for thematic tie to spirit mechanic)
      x.shadowColor='#9DC4B0';x.shadowBlur=5;
      x.fillStyle='#9DC4B0';
      for(let i=0;i<3;i++){
        const a=(i/3)*Math.PI*2;
        const ox=Math.cos(a)*16, oy=Math.sin(a)*16;
        x.beginPath();x.arc(ox,oy,2.2,0,Math.PI*2);x.fill();
      }
      x.translate(-CX,-CY);
    },
  ];

  for(let i=0;i<5;i++){
    const c=document.getElementById('ic'+i);
    if(c){
      const x=c.getContext('2d');
      // reset any inherited state from previous frame
      x.setTransform(1,0,0,1,0,0);
      x.globalAlpha=1;x.shadowBlur=0;
      icons[i](x);
    }
  }
}


// ═══════ GAME STATE ══════════════════════════════════════
let running=false,lastTime=0,kills=0;
let camX=WORLD_W/2,camY=WORLD_H/2;
let bossTarget=null;

let player={
  x:WORLD_W/2,y:WORLD_H/2,hp:1000,maxHp:1000,attack:15,
  level:1,xp:0,xpToNext:165,gold:0,
  vx:0,vy:0,facing:0,
  lastAttack:0,lastInput:0,
  isDead:false,iframes:0,
  soulMastery:0,glowPulse:0,hitFlash:0,walkCycle:0,
  afkWpX:WORLD_W/2,afkWpY:WORLD_H/2,
  afkTimer:0,afkCommit:5000,sector:0,
  visitedSectors:new Array(9).fill(false),
  maxBonds:MAX_SPIRITS,
};

let spirits=[],enemies=[],particles=[],dmgTexts=[],groundFX=[];
let spiritId=0,enemyId=0;
let abilityCDs=[0,0,0,0];
let spawnTimer=0;
let keys={},touchJoy={active:false,startX:0,startY:0,dx:0,dy:0},joyId=null;
let shakeTimer=0,shakeAmt=0;
let clusterTimer=0,clusterInterval=9000;
// Precomputed environment
let envProps=[];


// ═══════ ENVIRONMENT GENERATION ══════════════════════════
// Note: envProps is declared above in GAME STATE section
function rngF(s){return((s*16807)%2147483647)/2147483647;}
// Collision radius table — how big an invisible circle each prop has.
// Expressed as fraction of the prop's visual size (p.sz).
// Props not in this table have NO collision (purely decorative).
// Trunk-base defaults: big obstacles ~35-40%, small chunky ones ~30%.
const COLLISION_RADIUS={
  realTree:0.28,     // trunk only, canopy is air
  deadTree:0.20,     // skinny gnarled tree
  rockCluster:0.40,  // chunky cluster, tricky to pass through
  boulder:0.50,      // big solid stone
  stoneRuin:0.45,    // wall fragment, wide
  fallenLog:0.55,    // long wide obstacle
  cryptPillar:0.30,  // solid column
  obsidianPillar:0.30,
  sarcophagus:0.40,  // medium chunky
  cryptTomb:0.35,
  ashObelisk:0.35,
  // Everything else (grass, mushroom, water, bones, flecks, arches, torches) = no collision
};

function generateEnvironment(){
  envProps=[];
  const z=getActiveTheme();
  // Seed so it's deterministic per zone/dungeon
  const seedBase=(z.id||'').split('').reduce((a,c)=>a*31+c.charCodeAt(0),7919);
  const rnd=srand(seedBase+1);
  const propTypes=z.props||[];
  const counts=z.counts||[];
  // Combine into a list of (type, targetCount) pairs
  const typeBuckets=propTypes.map((t,i)=>({type:t,remaining:counts[i]||30}));

  // ─── PHASE 1: CLUSTERED HOTSPOTS ───
  // Generate 18-25 hotspot centers. Each spawns a dense cluster of 6-14 props.
  // Clusters prefer "big" props (trees, rocks, ruins) as anchors plus scattered
  // smaller props (grass, mushrooms) around them.
  const hotspotCount=18+Math.floor(rnd()*7);
  for(let h=0;h<hotspotCount;h++){
    const hx=(0.08+rnd()*0.84)*WORLD_W;
    const hy=(0.08+rnd()*0.84)*WORLD_H;
    const clusterSize=6+Math.floor(rnd()*9); // 6-14 props per cluster
    const clusterRadius=90+rnd()*130; // tight to medium spread
    // Pick a "theme" prop type for this cluster — biases which props appear
    const anchorType=typeBuckets[Math.floor(rnd()*typeBuckets.length)]?.type;
    for(let c=0;c<clusterSize;c++){
      // Pick a type for this prop — 40% anchor type, 60% random from zone pool
      let chosenType;
      if(anchorType && rnd()<0.4){
        chosenType=anchorType;
      } else {
        // Prefer buckets with remaining count
        const avail=typeBuckets.filter(b=>b.remaining>0);
        if(!avail.length)break;
        const pick=avail[Math.floor(rnd()*avail.length)];
        chosenType=pick.type;
      }
      // Find the bucket and decrement
      const bucket=typeBuckets.find(b=>b.type===chosenType);
      if(!bucket||bucket.remaining<=0)continue;
      bucket.remaining--;
      // Position with falloff — more dense at center, looser at edge
      const ca=rnd()*Math.PI*2;
      const cd=rnd()*rnd()*clusterRadius; // squared gives center bias
      const px=Math.max(40,Math.min(WORLD_W-40,hx+Math.cos(ca)*cd));
      const py=Math.max(40,Math.min(WORLD_H-40,hy+Math.sin(ca)*cd));
      const sz=16+rnd()*42;
      envProps.push({
        x:px,y:py,type:chosenType,
        sz,rot:rnd()*Math.PI*2,seed:Math.floor(rnd()*99991)+1,
        collRadius:(COLLISION_RADIUS[chosenType]||0)*sz,
      });
    }
  }

  // ─── PHASE 2: PATH-EDGE SCATTER ───
  // For each path point, scatter small decorative props (grass, mushrooms, flecks)
  // along both sides — makes paths look "worn" and "walked."
  if(terrainFeatures&&terrainFeatures.paths){
    const edgeProps=['grassTuft','mushroom','boneHeap'].filter(t=>propTypes.includes(t));
    terrainFeatures.paths.forEach(path=>{
      path.points.forEach((pt,i)=>{
        if(i===0||i===path.points.length-1)return;
        // 6-10 props scattered along each side of this path segment
        const edgeCount=6+Math.floor(rnd()*5);
        for(let e=0;e<edgeCount;e++){
          if(!edgeProps.length)break;
          const chosenType=edgeProps[Math.floor(rnd()*edgeProps.length)];
          const bucket=typeBuckets.find(b=>b.type===chosenType);
          if(!bucket||bucket.remaining<=0)continue;
          bucket.remaining--;
          // Perpendicular offset from path — random side, 50-140px out
          const side=rnd()<0.5?1:-1;
          const offset=(50+rnd()*90)*side;
          // Perpendicular direction: rotate by 90deg
          const prev=path.points[i-1];
          const dx=pt.x-prev.x, dy=pt.y-prev.y;
          const len=Math.sqrt(dx*dx+dy*dy)||1;
          const perpX=-dy/len, perpY=dx/len;
          const px=Math.max(40,Math.min(WORLD_W-40,pt.x+perpX*offset+(rnd()-0.5)*30));
          const py=Math.max(40,Math.min(WORLD_H-40,pt.y+perpY*offset+(rnd()-0.5)*30));
          const sz=14+rnd()*26;
          envProps.push({
            x:px,y:py,type:chosenType,
            sz,rot:rnd()*Math.PI*2,seed:Math.floor(rnd()*99991)+1,
            collRadius:(COLLISION_RADIUS[chosenType]||0)*sz,
          });
        }
      });
    });
  }

  // ─── PHASE 3: DRAIN REMAINING BUDGET as random scatter ───
  // Any leftover count goes into random uniform scatter to fill gaps
  typeBuckets.forEach(bucket=>{
    while(bucket.remaining>0){
      bucket.remaining--;
      const px=(0.06+rnd()*0.88)*WORLD_W;
      const py=(0.06+rnd()*0.88)*WORLD_H;
      const sz=16+rnd()*42;
      envProps.push({
        x:px,y:py,type:bucket.type,
        sz,rot:rnd()*Math.PI*2,seed:Math.floor(rnd()*99991)+1,
        collRadius:(COLLISION_RADIUS[bucket.type]||0)*sz,
      });
    }
  });

  // Build spatial grid for fast collision lookup. Only props with collRadius>0
  // are indexed — the rest are purely decorative.
  buildPropSpatialGrid();

  // Also regenerate terrain features (paths, patches) for the current theme
  if(typeof generateTerrainFeatures==='function')generateTerrainFeatures();
}

// ═══════ PROP COLLISION SYSTEM ═══════════════════════════
// Spatial grid for fast "which props are near this point" queries.
// Bucket size chosen so 2-4 big props fit per cell typically.
const PROP_GRID_SIZE=160; // px per cell
let propGrid={}; // key "gx,gy" → array of props with collision

function buildPropSpatialGrid(){
  propGrid={};
  envProps.forEach(p=>{
    if(!p.collRadius||p.collRadius<=0)return;
    const gx=Math.floor(p.x/PROP_GRID_SIZE);
    const gy=Math.floor(p.y/PROP_GRID_SIZE);
    const key=gx+','+gy;
    if(!propGrid[key])propGrid[key]=[];
    propGrid[key].push(p);
  });
}

// Returns the first prop at (x,y) that collides with a circle of radius r,
// or null if the position is clear. Also returns null for the spatial grid
// not being built yet (safety fallback).
function getPropCollisionAt(x,y,r){
  if(!propGrid)return null;
  const gx=Math.floor(x/PROP_GRID_SIZE);
  const gy=Math.floor(y/PROP_GRID_SIZE);
  // Check the 3x3 neighborhood of grid cells
  for(let dx=-1;dx<=1;dx++){
    for(let dy=-1;dy<=1;dy++){
      const bucket=propGrid[(gx+dx)+','+(gy+dy)];
      if(!bucket)continue;
      for(let i=0;i<bucket.length;i++){
        const p=bucket[i];
        const ddx=x-p.x, ddy=y-p.y;
        const minDist=r+p.collRadius;
        if(ddx*ddx+ddy*ddy<minDist*minDist)return p;
      }
    }
  }
  return null;
}

// Resolves a proposed player movement against prop collisions.
// Returns the final {x,y} after collision resolution.
// Strategy: try full move → if blocked, try x-only → if blocked, try y-only → if blocked, stay.
// This creates a "slide along walls" feel.
function resolvePlayerMovement(fromX,fromY,toX,toY,radius){
  // Full move
  if(!getPropCollisionAt(toX,toY,radius)){
    return {x:toX,y:toY};
  }
  // Try x only
  if(!getPropCollisionAt(toX,fromY,radius)){
    return {x:toX,y:fromY};
  }
  // Try y only
  if(!getPropCollisionAt(fromX,toY,radius)){
    return {x:fromX,y:toY};
  }
  // Blocked both ways — stay put
  return {x:fromX,y:fromY};
}

// Finds a clear point within a max radius of a target point. Used for
// enemy spawning and teleport-in placements so we don't spawn inside props.
function findClearPosition(cx,cy,r,maxAttempts=16){
  if(!getPropCollisionAt(cx,cy,r))return {x:cx,y:cy};
  for(let i=0;i<maxAttempts;i++){
    const a=Math.random()*Math.PI*2;
    const d=40+Math.random()*100;
    const nx=cx+Math.cos(a)*d;
    const ny=cy+Math.sin(a)*d;
    if(nx<40||nx>WORLD_W-40||ny<40||ny>WORLD_H-40)continue;
    if(!getPropCollisionAt(nx,ny,r))return {x:nx,y:ny};
  }
  // Fallback — just return the original even if blocked
  return {x:cx,y:cy};
}

function drawEnvironment(now){
  const margin=320,vl=camX-W/2-margin,vr=camX+W/2+margin,vt=camY-H/2-margin,vb=camY+H/2+margin;
  envProps.forEach(p=>{if(p.x>vl&&p.x<vr&&p.y>vt&&p.y<vb)drawProp(p,now);});
}

function drawProp(p,now){
  const z=getActiveTheme(),s=p.sz,seed=p.seed;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);
  switch(p.type){
    case 'ashStone':
      ctx.fillStyle='#1a1030';ctx.strokeStyle='#2d1a50';ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(0,0,s*.65,s*.38,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='#110820';ctx.beginPath();ctx.ellipse(-s*.14,-s*.05,s*.32,s*.19,0.4,0,Math.PI*2);ctx.fill();break;
    case 'ashArch':
      ctx.shadowColor='#c084fc';ctx.shadowBlur=8;ctx.strokeStyle='#2d1a5a';ctx.lineWidth=3.5;
      ctx.beginPath();ctx.arc(0,8,s*.42,Math.PI,0);ctx.stroke();ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(-s*.42,8);ctx.lineTo(-s*.42,s*.55);ctx.stroke();
      ctx.beginPath();ctx.moveTo(s*.42,8);ctx.lineTo(s*.42,s*.55);ctx.stroke();
      ctx.fillStyle='rgba(192,132,252,0.22)';ctx.shadowBlur=6;ctx.beginPath();ctx.arc(0,8-s*.42,4,0,Math.PI*2);ctx.fill();break;
    case 'veilCrystal':{
      const ch=curZone.id==='spire'?5:270;
      ctx.shadowColor='hsl('+ch+',80%,55%)';ctx.shadowBlur=12+Math.sin(now/700+seed)*5;
      ctx.strokeStyle='hsl('+ch+',70%,40%)';ctx.lineWidth=2.2;
      const pts=3+Math.floor(rngF(seed)*3);
      for(let i=0;i<pts;i++){const a=(i/pts)*Math.PI*2+p.rot*.5,h=s*(.4+rngF(seed+i)*.45);
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*h,Math.sin(a)*h);ctx.stroke();
        ctx.fillStyle='hsla('+ch+',65%,55%,'+(0.38+Math.sin(now/500+seed+i)*.14)+')';
        ctx.beginPath();ctx.arc(Math.cos(a)*h,Math.sin(a)*h,3.5,0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=.35+Math.sin(now/550+seed)*.1;ctx.fillStyle='hsl('+ch+',70%,42%)';
      ctx.beginPath();ctx.arc(0,0,s*.12,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;break;}
    case 'darkPool':{
      const dp=ctx.createRadialGradient(0,0,0,0,0,s);dp.addColorStop(0,'rgba(15,0,40,0.72)');dp.addColorStop(.6,'rgba(8,0,25,0.45)');dp.addColorStop(1,'rgba(5,0,15,0)');
      ctx.fillStyle=dp;ctx.beginPath();ctx.ellipse(0,0,s,s*.42,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='rgba(120,60,220,'+(0.06+Math.sin(now/1300+seed)*.03)+')';ctx.lineWidth=.9;
      ctx.beginPath();ctx.ellipse(0,0,s*.65,s*.27,0,0,Math.PI*2);ctx.stroke();break;}
    case 'ashPatch':{
      const ap=ctx.createRadialGradient(0,0,0,0,0,s);ap.addColorStop(0,'rgba(40,25,70,0.28)');ap.addColorStop(1,'rgba(15,8,30,0)');
      ctx.fillStyle=ap;ctx.beginPath();ctx.ellipse(0,0,s,s*.5,0,0,Math.PI*2);ctx.fill();break;}
    case 'veilTorch':case 'cryptTorch':case 'hellTorch':{
      const tc=p.type==='hellTorch'?'rgba(255,60,10,':p.type==='veilTorch'?'rgba(200,100,30,':'rgba(220,150,40,';
      ctx.strokeStyle='#2a1a10';ctx.lineWidth=2.2;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,s*.62);ctx.stroke();
      const fp=.62+Math.sin(now/110+seed)*.32;ctx.shadowColor=tc+'1)';ctx.shadowBlur=22*fp;
      const fg=ctx.createRadialGradient(0,-s*.1,0,0,-s*.1,s*.26);
      fg.addColorStop(0,'rgba(255,250,200,.95)');fg.addColorStop(.35,tc+'.82)');fg.addColorStop(1,tc+'0)');
      ctx.fillStyle=fg;ctx.beginPath();ctx.ellipse(0,-s*.05,s*.11,s*.25*fp,0,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.12+Math.sin(now/200+seed)*.06;ctx.fillStyle='#aaa';
      ctx.beginPath();ctx.ellipse(Math.sin(now/300+seed)*4,-s*.45,s*.06,s*.2,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;break;}
    case 'ruinWall':
      ctx.fillStyle='#140c2a';ctx.strokeStyle='#2a1545';ctx.lineWidth=1.5;
      ctx.fillRect(-s*.08,-s*.8,s*.16,s*1.6);ctx.strokeRect(-s*.08,-s*.8,s*.16,s*1.6);
      ctx.fillStyle='#0e0820';ctx.fillRect(-s*.12,-s*.85,s*.06,s*.12);ctx.fillRect(s*.04,-s*.82,s*.08,s*.1);break;
    case 'bonePile':
      ctx.strokeStyle='#3a3020';ctx.lineWidth=2;ctx.lineCap='round';
      for(let i=0;i<5;i++){const a=rngF(seed+i)*Math.PI*2,bl=s*(.2+rngF(seed+i*3)*.32);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*bl,Math.sin(a)*bl);ctx.stroke();}
      ctx.fillStyle='#2a2218';ctx.beginPath();ctx.arc(0,0,s*.12,0,Math.PI*2);ctx.fill();break;
    case 'cryptPillar':
      ctx.fillStyle='#14100a';ctx.strokeStyle='#2a2010';ctx.lineWidth=1.5;
      ctx.fillRect(-s*.2,-s*.85,s*.4,s*1.7);ctx.strokeRect(-s*.2,-s*.85,s*.4,s*1.7);
      ctx.fillRect(-s*.28,-s*.88,s*.56,s*.14);ctx.fillRect(-s*.28,s*.74,s*.56,s*.14);
      ctx.strokeStyle='#1a1408';ctx.lineWidth=.8;
      for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(-s*.2,-s*.85+s*i*.42);ctx.lineTo(s*.2,-s*.85+s*i*.42);ctx.stroke();}break;
    case 'sarcophagus':
      ctx.fillStyle='#18120a';ctx.strokeStyle='#2a1e10';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.roundRect(-s*.32,-s*.62,s*.64,s*1.24,4);ctx.fill();ctx.stroke();
      ctx.strokeStyle='#32261a';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,-s*.22,s*.14,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,-s*.45);ctx.lineTo(0,s*.3);ctx.stroke();
      ctx.shadowColor='#d97706';ctx.shadowBlur=5;ctx.strokeStyle='rgba(217,119,6,0.18)';ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(-s*.05,-s*.3);ctx.lineTo(s*.08,s*.2);ctx.stroke();break;
    case 'cryptTomb':
      ctx.fillStyle='#14100c';ctx.strokeStyle='#221a10';ctx.lineWidth=1.5;
      ctx.fillRect(-s*.4,-s*.22,s*.8,s*.44);ctx.beginPath();ctx.arc(0,-s*.22,s*.4,Math.PI,0);ctx.fill();ctx.stroke();
      ctx.strokeStyle='rgba(217,119,6,0.15)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(0,-s*.52);ctx.lineTo(0,s*.18);ctx.moveTo(-s*.18,-s*.12);ctx.lineTo(s*.18,-s*.12);ctx.stroke();break;
    case 'skullPile':
      for(let i=0;i<4;i++){const sx2=(-1.5+i)*s*.22,sy2=(i%2)*s*.1-s*.05;
        ctx.fillStyle='#2a2218';ctx.beginPath();ctx.arc(sx2,sy2,s*.16,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#0e0c08';ctx.beginPath();ctx.arc(sx2-s*.05,sy2-s*.04,s*.04,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(sx2+s*.05,sy2-s*.04,s*.04,0,Math.PI*2);ctx.fill();}break;
    case 'cobweb':
      ctx.strokeStyle='rgba(200,200,210,0.1)';ctx.lineWidth=.7;
      for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*s*.5,Math.sin(a)*s*.5);ctx.stroke();}
      for(let r=1;r<=3;r++){ctx.beginPath();for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2;i===0?ctx.moveTo(Math.cos(a)*s*(r*.15),Math.sin(a)*s*(r*.15)):ctx.lineTo(Math.cos(a)*s*(r*.15),Math.sin(a)*s*(r*.15));}ctx.closePath();ctx.stroke();}break;
    case 'cryptWall':
      ctx.fillStyle='#100c08';ctx.strokeStyle='#1e1810';ctx.lineWidth=1;
      ctx.fillRect(-s*.06,-s*.7,s*.12,s*1.4);ctx.strokeRect(-s*.06,-s*.7,s*.12,s*1.4);
      for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-s*.06,-s*.7+i*s*.28);ctx.lineTo(s*.06,-s*.7+i*s*.28);ctx.stroke();}break;
    case 'swampTree':
      ctx.strokeStyle='#0a1808';ctx.lineWidth=3.5;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(s*.1,-s*.3,-s*.1,-s*.6,0,-s*.85);ctx.stroke();
      ctx.lineWidth=2;
      for(let i=0;i<6;i++){const a=(rngF(seed+i)-.4)*Math.PI*.75,bl=s*(.18+rngF(seed+i*2)*.28),by=-s*(.3+i*.1);
        ctx.beginPath();ctx.moveTo(0,by);ctx.lineTo(Math.cos(a)*bl,by+Math.sin(a)*bl*.5);ctx.stroke();}
      ctx.strokeStyle='rgba(50,120,60,0.22)';ctx.lineWidth=1;
      for(let i=0;i<4;i++){const mx=(rngF(seed+i*5)-.5)*s*.4,my=-s*(.4+rngF(seed+i*3)*.3);ctx.beginPath();ctx.moveTo(mx,my);ctx.lineTo(mx+Math.sin(now/800+i)*3,my+s*.25);ctx.stroke();}break;
    case 'toxicPool':{
      const tp=ctx.createRadialGradient(0,0,0,0,0,s);tp.addColorStop(0,'rgba(20,80,30,0.75)');tp.addColorStop(.5,'rgba(10,50,18,0.5)');tp.addColorStop(1,'rgba(5,30,10,0)');
      ctx.fillStyle=tp;ctx.beginPath();ctx.ellipse(0,0,s,s*.42,0,0,Math.PI*2);ctx.fill();
      ctx.shadowColor='#34d399';ctx.shadowBlur=8+Math.sin(now/1000+seed)*3;
      ctx.strokeStyle='rgba(52,211,153,'+(0.08+Math.sin(now/1100+seed)*.04)+')';ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(0,0,s*.68,s*.28,0,0,Math.PI*2);ctx.stroke();break;}
    case 'mushroom':
      ctx.strokeStyle='#0a1808';ctx.lineWidth=1.8;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,s*.55);ctx.stroke();
      ctx.fillStyle='hsl('+(145+rngF(seed)*35)+',45%,'+(18+rngF(seed*2)*12)+'%)';ctx.shadowColor='#34d399';ctx.shadowBlur=7;
      ctx.beginPath();ctx.ellipse(0,s*.54,s*.38,s*.22,0,0,Math.PI,true);ctx.fill();
      ctx.fillStyle='rgba(52,211,153,0.18)';ctx.beginPath();ctx.ellipse(0,s*.52,s*.26,s*.14,0,0,Math.PI,true);ctx.fill();
      ctx.fillStyle='rgba(52,211,153,0.35)';
      for(let i=0;i<3;i++){ctx.beginPath();ctx.arc((rngF(seed+i)-.5)*s*.3,s*.48,2,0,Math.PI*2);ctx.fill();}break;
    case 'mireRoot':
      ctx.strokeStyle='#0a1005';ctx.lineWidth=2.5;ctx.lineCap='round';
      for(let i=0;i<3;i++){const a=rngF(seed+i)*Math.PI,bl=s*(.28+rngF(seed+i*4)*.32);
        ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(Math.cos(a)*bl*.4,Math.sin(a)*bl*.3+s*.1,Math.cos(a)*bl*.8,Math.sin(a)*bl*.6+s*.1,Math.cos(a)*bl,Math.sin(a)*bl*.5+s*.1);ctx.stroke();}break;
    case 'toxicVent':{
      ctx.fillStyle='#080e06';ctx.beginPath();ctx.arc(0,0,s*.22,0,Math.PI*2);ctx.fill();
      const tv=.5+Math.sin(now/260+seed)*.5;ctx.globalAlpha=tv*.62;ctx.fillStyle='#34d399';ctx.shadowColor='#34d399';ctx.shadowBlur=14;
      ctx.beginPath();ctx.ellipse(Math.sin(now/180+seed)*4,-s*.18,s*.12,s*.32,0,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=tv*.32;ctx.beginPath();ctx.ellipse(Math.sin(now/250+seed)*6,-s*.38,s*.08,s*.22,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;break;}
    case 'mireVine':
      ctx.strokeStyle='rgba(40,90,30,0.38)';ctx.lineWidth=1.5;ctx.lineCap='round';
      for(let i=0;i<4;i++){const a=(i/4)*Math.PI*2;ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(Math.cos(a)*s*.3+Math.sin(now/600+i)*5,Math.sin(a)*s*.3,Math.cos(a)*s*.6,Math.sin(a)*s*.6);ctx.stroke();}break;
    case 'swampRock':
      ctx.fillStyle='#080e06';ctx.strokeStyle='#0e1a0a';ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(0,0,s*.58,s*.34,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle='rgba(52,211,153,0.055)';ctx.beginPath();ctx.ellipse(-s*.1,s*.05,s*.18,s*.1,0.4,0,Math.PI*2);ctx.fill();break;
    case 'lavaPool':{
      const lv=ctx.createRadialGradient(0,0,0,0,0,s);lv.addColorStop(0,'rgba(255,80,0,0.8)');lv.addColorStop(.4,'rgba(180,40,0,0.55)');lv.addColorStop(1,'rgba(60,10,0,0)');
      ctx.fillStyle=lv;ctx.beginPath();ctx.ellipse(0,0,s,s*.42,0,0,Math.PI*2);ctx.fill();
      ctx.shadowColor='#ff5500';ctx.shadowBlur=18+Math.sin(now/600+seed)*6;
      ctx.strokeStyle='rgba(255,120,0,'+(0.12+Math.sin(now/800+seed)*.06)+')';ctx.lineWidth=1.2;
      ctx.beginPath();ctx.ellipse(0,0,s*.6,s*.25,0,0,Math.PI*2);ctx.stroke();break;}
    case 'obsidianPillar':
      ctx.fillStyle='#120002';ctx.strokeStyle='rgba(255,60,60,0.2)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(-s*.16,-s*.95);ctx.lineTo(s*.16,-s*.95);ctx.lineTo(s*.22,s*.32);ctx.lineTo(-s*.22,s*.32);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.shadowColor='#ff4444';ctx.shadowBlur=10;ctx.strokeStyle='rgba(255,80,80,0.35)';ctx.lineWidth=.9;
      ctx.beginPath();ctx.moveTo(-s*.06,-s*.78);ctx.lineTo(s*.08,s*.18);ctx.stroke();break;
    case 'veilRift':{
      const rp=.38+Math.sin(now/360+seed)*.22;ctx.globalAlpha=rp;ctx.strokeStyle='rgba(255,80,80,0.7)';ctx.lineWidth=2;ctx.shadowColor='#ff4444';ctx.shadowBlur=14;
      ctx.beginPath();ctx.moveTo(-s*.55,0);ctx.bezierCurveTo(-s*.2,-s*.22,s*.2,s*.22,s*.55,0);ctx.stroke();
      ctx.globalAlpha=rp*.6;ctx.fillStyle='rgba(255,60,60,0.12)';ctx.beginPath();ctx.ellipse(0,0,s*.45,s*.14,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;break;}
    case 'ashObelisk':
      ctx.fillStyle='#150003';ctx.strokeStyle='rgba(200,30,30,0.15)';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(0,-s*.95);ctx.lineTo(s*.14,-s*.2);ctx.lineTo(s*.2,s*.3);ctx.lineTo(-s*.2,s*.3);ctx.lineTo(-s*.14,-s*.2);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle='rgba(255,60,60,0.12)';ctx.shadowColor='#ff4444';ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(0,-s*.7,4,0,Math.PI*2);ctx.fill();break;
    case 'crackGround':
      ctx.strokeStyle='rgba(255,50,50,0.18)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(-s*.5,0);
      for(let i=1;i<8;i++){ctx.lineTo(-s*.5+i*s*.14,(rngF(seed+i)-.5)*s*.18);}
      ctx.lineTo(s*.5,0);ctx.stroke();
      ctx.globalAlpha=.2;ctx.strokeStyle='rgba(255,100,0,0.4)';ctx.lineWidth=.6;
      ctx.beginPath();ctx.moveTo(-s*.35,s*.06);ctx.lineTo(s*.35,-s*.06);ctx.stroke();ctx.globalAlpha=1;break;

    // ═══ NEW NATURAL PROPS ═══
    // These use real-world colors (brown bark, green leaves, gray stone, white bone)
    // rather than zone-tinted variations. Canopy color can vary per zone via the
    // `canopyTint` theme property for things like dead trees vs live trees.
    case 'realTree':{
      // Get the canopy color from active theme — lets zones have different foliage
      const canopy=z.canopyTint||'#2d5a2d';      // default green
      const canopyDark=z.canopyDark||'#1a3a1a';   // shadow side
      const trunk=z.trunkColor||'#3a2814';
      const trunkShadow='#1a0f06';
      // Ground shadow below the tree (oval, offset down-right for sun angle)
      ctx.fillStyle='rgba(0,0,0,0.45)';
      ctx.beginPath();ctx.ellipse(s*.08,s*.52,s*.52,s*.18,0,0,Math.PI*2);ctx.fill();
      // Sway amount for this tree (seed-based so each sways at different offset)
      const sway=Math.sin(now/1400+seed*0.01)*3;
      // Trunk — brown tapered rectangle
      ctx.fillStyle=trunk;
      ctx.beginPath();
      ctx.moveTo(-s*.08,s*.5);
      ctx.lineTo(-s*.04+sway*0.3,-s*.1);
      ctx.lineTo(s*.04+sway*0.3,-s*.1);
      ctx.lineTo(s*.08,s*.5);
      ctx.closePath();ctx.fill();
      // Trunk shadow on left
      ctx.fillStyle=trunkShadow;
      ctx.beginPath();
      ctx.moveTo(-s*.08,s*.5);
      ctx.lineTo(-s*.04+sway*0.3,-s*.1);
      ctx.lineTo(-s*.01+sway*0.3,-s*.1);
      ctx.lineTo(-s*.03,s*.5);
      ctx.closePath();ctx.fill();
      // Canopy — layered circles for volume
      ctx.fillStyle=canopyDark;
      ctx.beginPath();ctx.arc(sway,-s*.25,s*.48,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=canopy;
      ctx.beginPath();ctx.arc(-s*.15+sway,-s*.3,s*.32,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(s*.18+sway,-s*.28,s*.35,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(sway*0.5,-s*.5,s*.28,0,Math.PI*2);ctx.fill();
      // Highlight on canopy (upper-left catches light)
      ctx.fillStyle='rgba(255,255,255,0.08)';
      ctx.beginPath();ctx.arc(-s*.18+sway,-s*.45,s*.14,0,Math.PI*2);ctx.fill();
      break;
    }
    case 'deadTree':{
      // A gnarled dead tree — brown-gray, bare branches, no canopy
      const trunk='#2a1a0c';
      const branch='#3a2818';
      ctx.fillStyle='rgba(0,0,0,0.4)';
      ctx.beginPath();ctx.ellipse(s*.06,s*.48,s*.32,s*.12,0,0,Math.PI*2);ctx.fill();
      const sway=Math.sin(now/1600+seed*0.01)*2.5;
      // Trunk
      ctx.strokeStyle=trunk;ctx.lineWidth=s*.09;ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(0,s*.5);
      ctx.quadraticCurveTo(sway*0.5,s*.1,sway-s*.06,-s*.2);
      ctx.stroke();
      // Branches
      ctx.strokeStyle=branch;ctx.lineWidth=s*.035;
      ctx.beginPath();ctx.moveTo(sway-s*.06,-s*.2);ctx.lineTo(sway-s*.3,-s*.5);ctx.stroke();
      ctx.beginPath();ctx.moveTo(sway-s*.06,-s*.2);ctx.lineTo(sway+s*.3,-s*.55);ctx.stroke();
      ctx.beginPath();ctx.moveTo(sway-s*.06,-s*.35);ctx.lineTo(sway-s*.45,-s*.65);ctx.stroke();
      // Smaller twigs
      ctx.strokeStyle=branch;ctx.lineWidth=s*.018;
      ctx.beginPath();ctx.moveTo(sway-s*.3,-s*.5);ctx.lineTo(sway-s*.5,-s*.6);ctx.stroke();
      ctx.beginPath();ctx.moveTo(sway+s*.3,-s*.55);ctx.lineTo(sway+s*.45,-s*.75);ctx.stroke();
      ctx.beginPath();ctx.moveTo(sway-s*.06,-s*.2);ctx.lineTo(sway+s*.08,-s*.6);ctx.stroke();
      break;
    }
    case 'rockCluster':{
      // 3-5 gray stones clustered with shadows and highlights
      const baseGray='#4a4a52';
      const shadowGray='#2a2a32';
      const highlightGray='#6a6a72';
      // Ground shadow pool
      ctx.fillStyle='rgba(0,0,0,0.4)';
      ctx.beginPath();ctx.ellipse(0,s*.05,s*.55,s*.18,0,0,Math.PI*2);ctx.fill();
      // 3-5 rocks of varying sizes, deterministic by seed
      const rockCount=3+Math.floor(rngF(seed)*3);
      for(let i=0;i<rockCount;i++){
        const ra=rngF(seed+i*17)*Math.PI*2;
        const rd=rngF(seed+i*23)*s*.3;
        const rx=Math.cos(ra)*rd;
        const ry=Math.sin(ra)*rd*0.5; // flatter vertical distribution
        const rs=s*(.15+rngF(seed+i*41)*.22);
        // Dark base
        ctx.fillStyle=shadowGray;
        ctx.beginPath();ctx.ellipse(rx,ry+rs*0.3,rs*1.05,rs*0.55,0,0,Math.PI*2);ctx.fill();
        // Main stone body
        ctx.fillStyle=baseGray;
        ctx.beginPath();ctx.ellipse(rx,ry,rs,rs*0.7,0,0,Math.PI*2);ctx.fill();
        // Highlight
        ctx.fillStyle=highlightGray;
        ctx.beginPath();ctx.ellipse(rx-rs*0.25,ry-rs*0.3,rs*0.5,rs*0.3,0,0,Math.PI*2);ctx.fill();
      }
      break;
    }
    case 'grassTuft':{
      // Tufts of green grass blades
      const grass=z.grassColor||'#4a7c3a';
      const grassDark=z.grassDark||'#2d4a22';
      ctx.strokeStyle=grassDark;ctx.lineWidth=1.6;ctx.lineCap='round';
      const bladeCount=5+Math.floor(rngF(seed)*4);
      for(let i=0;i<bladeCount;i++){
        const ba=(rngF(seed+i*7)-0.5)*Math.PI*0.6-Math.PI/2; // mostly upward
        const bl=s*(.25+rngF(seed+i*11)*.35);
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(Math.cos(ba)*bl,Math.sin(ba)*bl);
        ctx.stroke();
      }
      ctx.strokeStyle=grass;ctx.lineWidth=1.2;
      for(let i=0;i<bladeCount;i++){
        const ba=(rngF(seed+i*7+1)-0.5)*Math.PI*0.6-Math.PI/2;
        const bl=s*(.2+rngF(seed+i*11+1)*.3);
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(Math.cos(ba)*bl*0.9,Math.sin(ba)*bl*0.9);
        ctx.stroke();
      }
      break;
    }
    case 'stoneRuin':{
      // Broken gray stone wall fragment — moss-covered at base
      const stone='#5a5a64';
      const stoneDark='#353540';
      const moss=z.mossColor||'#3a5a2a';
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.45)';
      ctx.beginPath();ctx.ellipse(0,s*.45,s*.55,s*.15,0,0,Math.PI*2);ctx.fill();
      // Main stone wall — jagged top
      ctx.fillStyle=stone;
      ctx.beginPath();
      ctx.moveTo(-s*.4,s*.5);
      ctx.lineTo(-s*.4,-s*.1);
      ctx.lineTo(-s*.25,-s*.25);
      ctx.lineTo(-s*.05,-s*.15);
      ctx.lineTo(s*.15,-s*.35);
      ctx.lineTo(s*.28,-s*.22);
      ctx.lineTo(s*.4,-s*.3);
      ctx.lineTo(s*.4,s*.5);
      ctx.closePath();
      ctx.fill();
      // Shadow side (left is darker)
      ctx.fillStyle=stoneDark;
      ctx.beginPath();
      ctx.moveTo(-s*.4,s*.5);
      ctx.lineTo(-s*.4,-s*.1);
      ctx.lineTo(-s*.25,-s*.25);
      ctx.lineTo(-s*.15,-s*.2);
      ctx.lineTo(-s*.15,s*.5);
      ctx.closePath();
      ctx.fill();
      // Stone block lines (horizontal mortar joints)
      ctx.strokeStyle=stoneDark;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(-s*.4,s*.1);ctx.lineTo(s*.4,s*.1);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-s*.4,s*.3);ctx.lineTo(s*.4,s*.3);ctx.stroke();
      // Moss at the base
      ctx.fillStyle=moss;
      ctx.globalAlpha=0.75;
      ctx.beginPath();ctx.ellipse(-s*.15,s*.48,s*.2,s*.08,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(s*.12,s*.5,s*.15,s*.06,0,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
      break;
    }
    case 'boneHeap':{
      // White/cream real bone pile — skulls and ribs, not stylized
      ctx.fillStyle='rgba(0,0,0,0.35)';
      ctx.beginPath();ctx.ellipse(0,s*.25,s*.55,s*.15,0,0,Math.PI*2);ctx.fill();
      // Scattered ribs (long white curves)
      ctx.strokeStyle='#d4ccb8';ctx.lineWidth=2.2;ctx.lineCap='round';
      for(let i=0;i<3;i++){
        const ra=rngF(seed+i*7)*Math.PI*2;
        const rx=Math.cos(ra)*s*.3;
        const ry=Math.sin(ra)*s*.12;
        const rl=s*(.2+rngF(seed+i*11)*.15);
        ctx.save();
        ctx.translate(rx,ry);
        ctx.rotate(ra);
        ctx.beginPath();
        ctx.arc(0,0,rl,-Math.PI*0.35,Math.PI*0.35);
        ctx.stroke();
        ctx.restore();
      }
      // A skull in the middle
      ctx.fillStyle='#e8dfc8';
      ctx.beginPath();ctx.arc(0,0,s*.18,0,Math.PI*2);ctx.fill();
      // Skull eye sockets
      ctx.fillStyle='#2a2418';
      ctx.beginPath();ctx.arc(-s*.06,-s*.02,s*.04,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(s*.06,-s*.02,s*.04,0,Math.PI*2);ctx.fill();
      // Nose cavity
      ctx.beginPath();
      ctx.moveTo(-s*.015,s*.02);
      ctx.lineTo(0,s*.08);
      ctx.lineTo(s*.015,s*.02);
      ctx.closePath();
      ctx.fill();
      // Small highlight on skull
      ctx.fillStyle='rgba(255,255,255,0.3)';
      ctx.beginPath();ctx.arc(-s*.08,-s*.08,s*.04,0,Math.PI*2);ctx.fill();
      break;
    }
    case 'waterPond':{
      // Blue pond/puddle — always blue regardless of zone, with shimmer animation
      // Dark outer rim (muddy edge)
      ctx.fillStyle='rgba(30,30,35,0.6)';
      ctx.beginPath();ctx.ellipse(0,0,s*.7,s*.42,0,0,Math.PI*2);ctx.fill();
      // Water body — blue gradient
      const wg=ctx.createRadialGradient(0,-s*.05,0,0,0,s*.6);
      wg.addColorStop(0,'#3d7a9e');
      wg.addColorStop(0.6,'#2a5878');
      wg.addColorStop(1,'#1a3850');
      ctx.fillStyle=wg;
      ctx.beginPath();ctx.ellipse(0,0,s*.62,s*.35,0,0,Math.PI*2);ctx.fill();
      // Animated sparkles on the surface — slow shimmer
      ctx.fillStyle='rgba(180,220,255,0.6)';
      for(let i=0;i<4;i++){
        const sa=seed*0.01+i*1.7+now*0.0008;
        const sx2=Math.cos(sa)*s*.38;
        const sy2=Math.sin(sa)*s*.2;
        const sr2=1.5+Math.sin(now*0.003+seed+i)*0.8;
        if(sr2>0.6){
          ctx.beginPath();ctx.arc(sx2,sy2,sr2,0,Math.PI*2);ctx.fill();
        }
      }
      // Small bright highlight
      ctx.fillStyle='rgba(220,240,255,0.3)';
      ctx.beginPath();ctx.ellipse(-s*.15,-s*.1,s*.18,s*.06,0,0,Math.PI*2);ctx.fill();
      break;
    }
    case 'fallenLog':{
      // Horizontal fallen log — brown wood with darker rings
      const wood='#3a2410';
      const woodLight='#5a3820';
      const woodDark='#1a0f06';
      // Shadow on ground
      ctx.fillStyle='rgba(0,0,0,0.35)';
      ctx.beginPath();ctx.ellipse(0,s*.12,s*.7,s*.12,0,0,Math.PI*2);ctx.fill();
      // Main log body (long ellipse)
      ctx.fillStyle=wood;
      ctx.beginPath();ctx.ellipse(0,0,s*.65,s*.15,0,0,Math.PI*2);ctx.fill();
      // Highlight on top
      ctx.fillStyle=woodLight;
      ctx.beginPath();ctx.ellipse(0,-s*.05,s*.58,s*.06,0,0,Math.PI*2);ctx.fill();
      // Tree rings on both ends
      ctx.fillStyle=woodDark;
      ctx.beginPath();ctx.ellipse(-s*.62,0,s*.08,s*.15,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(s*.62,0,s*.08,s*.15,0,0,Math.PI*2);ctx.fill();
      // Ring details
      ctx.strokeStyle=wood;ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(-s*.62,0,s*.05,s*.1,0,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.ellipse(s*.62,0,s*.05,s*.1,0,0,Math.PI*2);ctx.stroke();
      // Bark texture lines
      ctx.strokeStyle=woodDark;ctx.lineWidth=0.8;
      for(let i=0;i<4;i++){
        const bx=-s*.45+i*s*.3;
        ctx.beginPath();ctx.moveTo(bx,-s*.1);ctx.lineTo(bx+s*.03,s*.1);ctx.stroke();
      }
      break;
    }
    case 'mushroom':{
      // Red/white cap mushroom cluster (fly agaric style) — 2-4 mushrooms
      const capColor=z.mushroomCap||'#a83f3f';
      const stem='#ddcfb8';
      const spotColor='#f4ecd8';
      const mushCount=2+Math.floor(rngF(seed)*3);
      for(let i=0;i<mushCount;i++){
        const ma=rngF(seed+i*19)*Math.PI*2;
        const md=rngF(seed+i*29)*s*.18;
        const mx=Math.cos(ma)*md;
        const my=Math.sin(ma)*md*0.4;
        const ms=s*(.18+rngF(seed+i*37)*.14);
        // Ground shadow
        ctx.fillStyle='rgba(0,0,0,0.35)';
        ctx.beginPath();ctx.ellipse(mx,my+ms*0.45,ms*0.5,ms*0.12,0,0,Math.PI*2);ctx.fill();
        // Stem
        ctx.fillStyle=stem;
        ctx.fillRect(mx-ms*0.12,my-ms*0.15,ms*0.24,ms*0.55);
        // Cap
        ctx.fillStyle=capColor;
        ctx.beginPath();
        ctx.arc(mx,my-ms*0.1,ms*0.55,Math.PI,0);
        ctx.fill();
        // Cap shadow underside
        ctx.fillStyle='rgba(60,20,20,0.5)';
        ctx.fillRect(mx-ms*0.45,my-ms*0.1,ms*0.9,ms*0.08);
        // White spots on cap
        ctx.fillStyle=spotColor;
        ctx.beginPath();ctx.arc(mx-ms*0.2,my-ms*0.2,ms*0.07,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(mx+ms*0.15,my-ms*0.3,ms*0.06,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(mx+ms*0.25,my-ms*0.12,ms*0.05,0,Math.PI*2);ctx.fill();
      }
      break;
    }
    case 'boulder':{
      // Single large gray boulder — bigger, more detailed than rockCluster's rocks
      const stone='#545458';
      const stoneDark='#2a2a30';
      const stoneLight='#70707a';
      const stoneMoss=z.mossColor||'#3a5a2a';
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.beginPath();ctx.ellipse(s*.08,s*.5,s*.7,s*.18,0,0,Math.PI*2);ctx.fill();
      // Base dark shadow
      ctx.fillStyle=stoneDark;
      ctx.beginPath();
      ctx.ellipse(0,s*.15,s*.75,s*.55,0,0,Math.PI*2);
      ctx.fill();
      // Main stone body
      ctx.fillStyle=stone;
      ctx.beginPath();
      ctx.ellipse(0,0,s*.65,s*.48,0,0,Math.PI*2);
      ctx.fill();
      // Top highlight face
      ctx.fillStyle=stoneLight;
      ctx.beginPath();
      ctx.ellipse(-s*.12,-s*.18,s*.38,s*.25,0,0,Math.PI*2);
      ctx.fill();
      // Crack details
      ctx.strokeStyle=stoneDark;ctx.lineWidth=1.2;
      ctx.beginPath();
      ctx.moveTo(-s*.3,-s*.1);
      ctx.lineTo(-s*.1,s*.1);
      ctx.lineTo(s*.15,s*.05);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s*.2,-s*.15);
      ctx.lineTo(s*.35,-s*.02);
      ctx.stroke();
      // Moss patch on top
      ctx.fillStyle=stoneMoss;
      ctx.globalAlpha=0.7;
      ctx.beginPath();ctx.ellipse(s*.15,-s*.25,s*.22,s*.08,0.3,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
      break;
    }
  }
  ctx.restore();
}


// ═══════ PLAYER DRAW ════════════════════════════════════
function drawPlayer(t){
  const p=player;
  if(p.isDead)return;
  const fl=p.hitFlash>0;
  const glow=0.8+Math.sin(p.glowPulse)*0.2;
  const spCount=spirits.filter(s=>!s.dead).length;
  p.walkCycle+=(Math.abs(p.vx)+Math.abs(p.vy))>5?0.15:0;

  ctx.save();
  const flipX=Math.cos(p.facing)<0;
  ctx.translate(p.x,p.y);
  if(flipX)ctx.scale(-1,1);

  // Aura under player
  const auraR=30+spCount*5;
  const aura=ctx.createRadialGradient(0,15,0,0,15,auraR);
  aura.addColorStop(0,`rgba(157,196,176,${0.08+spCount*0.012})`);
  aura.addColorStop(1,'rgba(157,196,176,0)');
  ctx.fillStyle=aura;ctx.beginPath();ctx.ellipse(0,18,auraR,auraR*0.4,0,0,Math.PI*2);ctx.fill();

  ctx.shadowColor=fl?'#ff4444':'#9DC4B0';
  ctx.shadowBlur=fl?20:(12+spCount*3)*glow;

  // Robe body
  ctx.fillStyle=fl?'#ffaaaa':'#1a1235';
  ctx.beginPath();ctx.ellipse(0,4,10,15,0,0,Math.PI*2);ctx.fill();
  // Robe bottom (flowing)
  ctx.fillStyle=fl?'#ffaaaa':'#110c28';
  ctx.beginPath();ctx.moveTo(-10,7);ctx.bezierCurveTo(-14,17,-9,24,-4,23);ctx.bezierCurveTo(-1,28,1,28,4,23);ctx.bezierCurveTo(9,24,14,17,10,7);ctx.closePath();ctx.fill();
  // Robe arcane trim
  ctx.strokeStyle=fl?'#fff':`rgba(192,132,252,${0.3+glow*0.25})`;ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(-10,7);ctx.bezierCurveTo(-14,17,-9,24,-4,23);ctx.bezierCurveTo(-1,28,1,28,4,23);ctx.bezierCurveTo(9,24,14,17,10,7);ctx.stroke();
  // Chest rune
  ctx.fillStyle=fl?'#fff':'rgba(192,132,252,0.5)';ctx.shadowColor='#c084fc';ctx.shadowBlur=8;
  ctx.beginPath();ctx.arc(0,1,3,0,Math.PI*2);ctx.fill();

  // Left arm
  const armSwing=Math.sin(p.walkCycle)*7;
  ctx.strokeStyle=fl?'#ffaaaa':'#2d2060';ctx.lineWidth=5;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(-11-armSwing*0.6,10);ctx.stroke();
  // Right arm + staff
  ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(12+armSwing,11);ctx.stroke();
  // Staff shaft
  ctx.strokeStyle=fl?'#fff':'#9DC4B0';ctx.lineWidth=2;ctx.lineCap='square';
  ctx.beginPath();ctx.moveTo(12+armSwing,11);ctx.lineTo(17+armSwing,-10);ctx.stroke();
  // Staff head
  ctx.strokeStyle=fl?'#fff':'#c084fc';ctx.lineWidth=2;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(14+armSwing,-10);ctx.lineTo(20+armSwing,-10);ctx.stroke();
  ctx.beginPath();ctx.moveTo(17+armSwing,-13);ctx.lineTo(17+armSwing,-7);ctx.stroke();
  // Staff orb
  const orbPulse=0.42+Math.sin(t/380)*0.18;
  ctx.fillStyle='#c084fc';ctx.shadowColor='#c084fc';ctx.shadowBlur=16;
  ctx.beginPath();ctx.arc(17+armSwing,-10,4.5,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=orbPulse;ctx.fillStyle='#e9d5ff';
  ctx.beginPath();ctx.arc(17+armSwing,-10,8,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=1;

  // Head/hood
  ctx.shadowColor=fl?'#ff4444':'#c084fc';ctx.shadowBlur=10;
  ctx.fillStyle=fl?'#ffaaaa':'#1a1235';
  ctx.beginPath();ctx.arc(0,-12,10,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=fl?'#ffaaaa':'#0d0820';
  ctx.beginPath();ctx.moveTo(-11,-12);ctx.lineTo(0,-30);ctx.lineTo(11,-12);ctx.closePath();ctx.fill();
  ctx.fillStyle='rgba(0,0,0,0.4)';
  ctx.beginPath();ctx.ellipse(0,-12,8,5,0,0,Math.PI);ctx.fill();
  // Eyes
  ctx.fillStyle=fl?'#ff4444':'#9DC4B0';ctx.shadowColor='#9DC4B0';ctx.shadowBlur=10;
  ctx.beginPath();ctx.arc(-3.5,-13,2.2,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(3.5,-13,2.2,0,Math.PI*2);ctx.fill();

  ctx.restore();

  // Movement robe particles
  if(Math.abs(p.vx)+Math.abs(p.vy)>8&&Math.random()<0.1){
    particles.push({x:p.x+(Math.random()-0.5)*10,y:p.y+20,vx:(Math.random()-0.5)*25,vy:12+Math.random()*18,life:0.55,maxLife:0.55,color:'rgba(192,132,252,0.35)',size:2+Math.random()*2});
  }
}

// ═══════ SPIRIT DRAW ════════════════════════════════════
function drawSpirit(s,t){
  if(s.dead)return;
  const pulse=0.8+Math.sin(t/700+s.id)*0.2;
  ctx.save();
  ctx.globalAlpha=0.93*pulse;
  ctx.shadowColor='#9DC4B0';ctx.shadowBlur=18;
  if(!isFinite(s.x)||!isFinite(s.y)){ctx.restore();return;}
  // Glow core
  const g=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,16);
  g.addColorStop(0,'#ffffff');g.addColorStop(0.35,'#9DC4B0');g.addColorStop(1,'rgba(157,196,176,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(s.x,s.y,16,0,Math.PI*2);ctx.fill();
  // Ghost body
  ctx.fillStyle='rgba(157,196,176,0.75)';
  ctx.beginPath();ctx.arc(s.x,s.y-6,7,Math.PI,0);ctx.lineTo(s.x+7,s.y+2);
  for(let i=0;i<3;i++)ctx.arc(s.x+5-i*4.5,s.y+2,2,0,Math.PI,true);
  ctx.lineTo(s.x-7,s.y+2);ctx.closePath();ctx.fill();
  // Wisp tail
  ctx.fillStyle='rgba(157,196,176,0.4)';
  ctx.beginPath();ctx.moveTo(s.x-5,s.y+7);
  ctx.bezierCurveTo(s.x-3,s.y+14+Math.sin(t/280+s.id)*4,s.x+3,s.y+14-Math.sin(t/280+s.id)*4,s.x+5,s.y+7);
  ctx.closePath();ctx.fill();
  // Eyes
  ctx.fillStyle='rgba(0,0,0,0.7)';ctx.shadowBlur=0;
  ctx.beginPath();ctx.arc(s.x-2.5,s.y-7,2.8,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(s.x+2.5,s.y-7,2.8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(s.x-2.5,s.y-7,1.1,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(s.x+2.5,s.y-7,1.1,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// ═══════ BACKGROUND & FOG ═══════════════════════════════
function drawBackground(now){}// kept for compat
function drawGroundPlane(now){}// kept for compat
// Returns the currently active visual theme. In a dungeon, uses the dungeon's
// theme; in the open world, uses the current zone. This is the single source
// of truth for all environmental rendering.
function getActiveTheme(){
  if(dungeonState.active && dungeonState.def && dungeonState.def.theme){
    return dungeonState.def.theme;
  }
  return curZone;
}

// ═══════ TERRAIN GENERATION ═══════════════════════════════════
// Procedural terrain features (patches of different ground, paths). Generated
// once at zone entry, cached in terrainFeatures. Deterministic per zone so it
// doesn't swim around between frames.
let terrainFeatures={patches:[],paths:[]};

// Deterministic pseudo-random from a seed — same seed always gives same output.
function srand(seed){
  let s=seed;
  return ()=>{s=(s*1664525+1013904223)|0;return ((s>>>0)%1000000)/1000000;};
}

function generateTerrainFeatures(){
  terrainFeatures.patches=[];
  terrainFeatures.paths=[];
  const z=getActiveTheme();
  // Seed differs by zone so each looks unique but stable within a session
  const seedBase=(z.id||'').split('').reduce((a,c)=>a*31+c.charCodeAt(0),7919);
  const rnd=srand(seedBase);
  // Layer 1: ~18 large soft ground patches of slightly varied color (big blobs)
  for(let i=0;i<18;i++){
    terrainFeatures.patches.push({
      x:rnd()*WORLD_W,y:rnd()*WORLD_H,
      rx:280+rnd()*520,ry:180+rnd()*380,
      color:z.patchA||'rgba(0,0,0,0.2)',
      rotate:rnd()*Math.PI,
      layer:'large',
    });
  }
  // Layer 2: ~32 medium patches of a slightly different tint (variety)
  for(let i=0;i<32;i++){
    terrainFeatures.patches.push({
      x:rnd()*WORLD_W,y:rnd()*WORLD_H,
      rx:90+rnd()*180,ry:60+rnd()*120,
      color:z.patchB||'rgba(255,255,255,0.03)',
      rotate:rnd()*Math.PI,
      layer:'medium',
    });
  }
  // Layer 3: ~140 small detail patches (pebbles, moss, cracks feel)
  for(let i=0;i<140;i++){
    terrainFeatures.patches.push({
      x:rnd()*WORLD_W,y:rnd()*WORLD_H,
      rx:16+rnd()*32,ry:10+rnd()*22,
      color:z.patchC||'rgba(255,255,255,0.04)',
      rotate:rnd()*Math.PI,
      layer:'small',
    });
  }
  // Paths: 2-3 winding paths cutting through the world.
  // Each is a series of 8-12 connected points with variable width.
  if(z.hasPaths!==false){  // default yes unless theme opts out
    const pathCount=2+Math.floor(rnd()*2);
    for(let p=0;p<pathCount;p++){
      const points=[];
      // Start on one edge, end on the opposite
      const startEdge=Math.floor(rnd()*4);
      let sx,sy,ex,ey;
      if(startEdge===0){sx=rnd()*WORLD_W;sy=0;ex=rnd()*WORLD_W;ey=WORLD_H;}
      else if(startEdge===1){sx=WORLD_W;sy=rnd()*WORLD_H;ex=0;ey=rnd()*WORLD_H;}
      else if(startEdge===2){sx=rnd()*WORLD_W;sy=WORLD_H;ex=rnd()*WORLD_W;ey=0;}
      else{sx=0;sy=rnd()*WORLD_H;ex=WORLD_W;ey=rnd()*WORLD_H;}
      const steps=10+Math.floor(rnd()*4);
      for(let s=0;s<=steps;s++){
        const t=s/steps;
        // Base interpolation + sinusoidal wander for a curving path
        const wobble=(rnd()-0.5)*WORLD_W*0.18;
        const wobble2=(rnd()-0.5)*WORLD_H*0.18;
        points.push({
          x:sx+(ex-sx)*t+Math.sin(t*Math.PI*1.3+p)*WORLD_W*0.09+wobble,
          y:sy+(ey-sy)*t+Math.cos(t*Math.PI*1.1+p*2)*WORLD_H*0.09+wobble2,
          width:50+rnd()*42,
        });
      }
      terrainFeatures.paths.push({points,color:z.pathColor||'rgba(140,110,80,0.18)'});
    }
  }
}

function drawWorld(now){
  const z=getActiveTheme();
  // Zone-specific sky gradient (background behind everything)
  const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,z.skyA);sky.addColorStop(.5,z.skyB);sky.addColorStop(1,z.skyC);
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.translate(W/2-camX,H/2-camY);
  // Ground base — solid fill in the theme's ground color
  ctx.fillStyle=z.groundBase;ctx.fillRect(0,0,WORLD_W,WORLD_H);

  // Visible culling bounds — only draw what's near the camera for performance
  const margin=400,vl=camX-W/2-margin,vr=camX+W/2+margin,vt=camY-H/2-margin,vb=camY+H/2+margin;

  // ─── Layer 1: LARGE soft patches (the "this area is dirt, that area is stone" feel) ───
  terrainFeatures.patches.forEach(p=>{
    if(p.layer!=='large')return;
    if(p.x<vl||p.x>vr||p.y<vt||p.y>vb)return;
    ctx.save();
    ctx.translate(p.x,p.y);
    ctx.rotate(p.rotate);
    // Soft radial gradient for a natural-looking blob
    const grad=ctx.createRadialGradient(0,0,0,0,0,Math.max(p.rx,p.ry));
    grad.addColorStop(0,p.color);
    grad.addColorStop(1,p.color.replace(/[\d.]+\)$/,'0)'));
    ctx.fillStyle=grad;
    ctx.beginPath();ctx.ellipse(0,0,p.rx,p.ry,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
  });

  // ─── Paths ───
  terrainFeatures.paths.forEach(path=>{
    // Draw as a single flowing stroke with variable width along the points
    for(let i=0;i<path.points.length-1;i++){
      const p1=path.points[i],p2=path.points[i+1];
      // Cull offscreen path segments
      const minX=Math.min(p1.x,p2.x),maxX=Math.max(p1.x,p2.x);
      const minY=Math.min(p1.y,p2.y),maxY=Math.max(p1.y,p2.y);
      if(maxX<vl||minX>vr||maxY<vt||minY>vb)continue;
      ctx.strokeStyle=path.color;
      ctx.lineWidth=(p1.width+p2.width)/2;
      ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();
      // Slightly brighter inner core
      ctx.strokeStyle=path.color.replace(/[\d.]+\)$/,(m)=>((parseFloat(m)*1.8).toFixed(2)+')'));
      ctx.lineWidth=((p1.width+p2.width)/2)*0.35;
      ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();
    }
  });

  // ─── Layer 2: medium patches (smaller ground variance) ───
  terrainFeatures.patches.forEach(p=>{
    if(p.layer!=='medium')return;
    if(p.x<vl||p.x>vr||p.y<vt||p.y>vb)return;
    ctx.save();
    ctx.translate(p.x,p.y);
    ctx.rotate(p.rotate);
    const grad=ctx.createRadialGradient(0,0,0,0,0,Math.max(p.rx,p.ry));
    grad.addColorStop(0,p.color);
    grad.addColorStop(1,p.color.replace(/[\d.]+\)$/,'0)'));
    ctx.fillStyle=grad;
    ctx.beginPath();ctx.ellipse(0,0,p.rx,p.ry,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
  });

  // ─── Layer 3: small detail patches (texture/grit) ───
  terrainFeatures.patches.forEach(p=>{
    if(p.layer!=='small')return;
    if(p.x<vl||p.x>vr||p.y<vt||p.y>vb)return;
    ctx.fillStyle=p.color;
    ctx.beginPath();ctx.ellipse(p.x,p.y,p.rx,p.ry,p.rotate,0,Math.PI*2);ctx.fill();
  });

  // Light pillars (ambient light beams cast by unseen sources)
  if(z.hasPillars){
    for(let i=0;i<5;i++){
      const lx=((camX/WORLD_W+i*.18)*WORLD_W)%WORLD_W;const ly=((camY/WORLD_H+i*.25)*WORLD_H)%WORLD_H;
      const lr=178+Math.sin(now/2800+i)*55;
      const lg=ctx.createRadialGradient(lx,ly,0,lx,ly,lr);
      lg.addColorStop(0,z.lightC+'.055)');lg.addColorStop(1,z.lightC+'0)');
      ctx.fillStyle=lg;ctx.beginPath();ctx.arc(lx,ly,lr,0,Math.PI*2);ctx.fill();
    }
  }
  // Animated fog layers
  for(let i=0;i<6;i++){
    const fx=((now/5200+i*.19)*WORLD_W)%WORLD_W-WORLD_W*.12;
    const fy=camY-H*.22+Math.sin(now/6500+i*1.4)*H*.18;
    const fw=W*(.52+Math.sin(now/5500+i)*.16);
    const fg=ctx.createRadialGradient(fx,fy,0,fx,fy,fw);
    fg.addColorStop(0,z.fogC+(.04+Math.sin(now/2200+i)*.022)+')');fg.addColorStop(1,z.fogC+'0)');
    ctx.fillStyle=fg;ctx.beginPath();ctx.ellipse(fx,fy,fw,fw*.28,0,0,Math.PI*2);ctx.fill();
  }
  // Zone ambient FX
  if(z.ashFx){for(let i=0;i<8;i++){ctx.globalAlpha=.14+Math.sin(now/1500+i)*.07;ctx.fillStyle='rgba(200,150,255,0.5)';ctx.beginPath();ctx.arc((camX+Math.sin(now/4000+i*1.7)*(W*.4)+WORLD_W)%WORLD_W,(camY-H*.3+Math.sin(now/3500+i)*(H*.4)+WORLD_H)%WORLD_H,1.2+Math.sin(now/800+i)*.5,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
  if(z.lavaFx){for(let i=0;i<4;i++){ctx.globalAlpha=(.5+Math.sin(now/300+i)*.3)*.055;const hg=ctx.createRadialGradient((camX+(-2+i)*W*.28+WORLD_W)%WORLD_W,camY+H*.3,0,(camX+(-2+i)*W*.28+WORLD_W)%WORLD_W,camY+H*.3,150);hg.addColorStop(0,'rgba(255,80,0,0.5)');hg.addColorStop(1,'rgba(255,80,0,0)');ctx.fillStyle=hg;ctx.beginPath();ctx.arc((camX+(-2+i)*W*.28+WORLD_W)%WORLD_W,camY+H*.3,150,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
  if(z.toxicFx){for(let i=0;i<6;i++){ctx.globalAlpha=.2+Math.sin(now/600+i)*.1;ctx.fillStyle='rgba(52,211,153,0.5)';ctx.beginPath();ctx.arc((camX+(i-.5)*W*.3+WORLD_W)%WORLD_W,((camY+H*.3-((now/2000+i)%1)*H*.8)+WORLD_H)%WORLD_H,2+Math.sin(now/400+i),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;}
  // Edge vignette — darkens the world edges for depth
  const ev=ctx.createRadialGradient(WORLD_W/2,WORLD_H/2,WORLD_W*.32,WORLD_W/2,WORLD_H/2,WORLD_W*.76);ev.addColorStop(0,'rgba(0,0,0,0)');ev.addColorStop(1,z.edgeC);ctx.fillStyle=ev;ctx.fillRect(0,0,WORLD_W,WORLD_H);
  // Props (trees, rocks, pillars, etc) drawn last so they're on top of ground
  drawEnvironment(now);
  ctx.restore();
}


// ═══════ SPAWN SYSTEMS ══════════════════════════════════
function spawnEnemy(typeOverride=null){
  const living=enemies.filter(e=>!e.dead).length;
  if(living>=MAX_ENEMIES)return;
  const angle=Math.random()*Math.PI*2;
  const d=300+Math.random()*260;
  let x=Math.max(60,Math.min(WORLD_W-60,player.x+Math.cos(angle)*d));
  let y=Math.max(60,Math.min(WORLD_H-60,player.y+Math.sin(angle)*d));
  // Nudge away from any collidable prop so enemies don't spawn stuck
  const clear=findClearPosition(x,y,22);
  x=clear.x;y=clear.y;
  let typeData;
  if(typeOverride)typeData=ENEMY_TYPES.find(t=>t.type===typeOverride)||ENEMY_TYPES[0];
  else{
    const bias=curZone.bias||[];
    if(Math.random()<0.55&&bias.length){const t=bias[Math.floor(Math.random()*bias.length)];typeData=ENEMY_TYPES.find(e=>e.type===t);}
    if(!typeData){const pool=ENEMY_TYPES.filter(t=>!t.elite||(player.level>=8&&Math.random()<0.12));typeData=pool[Math.floor(Math.random()*pool.length)];}
  }
  const isElite=player.level>=5&&Math.random()<0.08;
  const hs=enemyHpScale(player.level),ds=enemyDmgScale(player.level);
  const base=player.level<=5?150:player.level<=10?175:200;
  enemies.push({
    id:enemyId++,x,y,vx:0,vy:0,
    hp:base*hs*typeData.hp*(isElite?2.4:1),
    maxHp:base*hs*typeData.hp*(isElite?2.4:1),
    attack:(player.level<=5?22:player.level<=10?26:30)*ds*typeData.dmg*(isElite?1.6:1),
    speed:typeData.spd*(isElite?1.12:1),
    dead:false,isElite,typeData,
    lastAttack:0,hitFlash:0,
    veilmarkStacks:0,veilmarkExpiry:0,
    size:typeData.r*(isElite?1.35:1),
  });
}
function spawnCluster(){
  const clusters=[{type:'skeleton',count:4},{type:'crawler',count:5},{type:'wraith',count:3},{type:'shade',count:4},{type:'golem',count:2},{type:'abomination',count:1}];
  const cl=clusters[Math.floor(Math.random()*clusters.length)];
  for(let i=0;i<cl.count;i++)setTimeout(()=>spawnEnemy(cl.type),i*220);
  addFeed(`☠ ${cl.type.toUpperCase()} HORDE!`,'#ef4444');
}

// ═══════ DUNGEON SYSTEM ═══════════════════════════════════
// Sealed arena runs with escalating waves and a named boss.
// While in a dungeon, regular spawn is disabled and zone progression is paused.
// On boss death OR player death, auto-return to where they came from.
let dungeonState={
  active:false,
  def:null,           // the DUNGEON object from data.js
  waveIdx:0,          // 0..waves.length-1, then boss
  phase:'idle',       // 'wave' | 'bossIntro' | 'boss' | 'complete'
  phaseTimer:0,       // ms into current phase
  returnX:0,returnY:0,// position to teleport back to after run
  bossEntity:null,    // reference to boss for tracking
};

function enterDungeon(dungeonId){
  const def=DUNGEONS.find(d=>d.id===dungeonId);
  if(!def){addFeed('Dungeon not found','#ef4444');return;}
  if(player.level<def.minLevel){
    addFeed(`Requires level ${def.minLevel}`,'#ef4444');
    return;
  }
  if(dungeonState.active)return;
  // Save entry point so we can return here
  dungeonState.returnX=player.x;
  dungeonState.returnY=player.y;
  // Teleport to a clean center arena position
  player.x=WORLD_W/2;player.y=WORLD_H/2;
  camX=player.x;camY=player.y;
  // Clear existing enemies — dungeon is fresh
  enemies=[];
  // Begin run
  dungeonState.active=true;
  dungeonState.def=def;
  dungeonState.waveIdx=0;
  dungeonState.phase='wave';
  dungeonState.phaseTimer=0;
  dungeonState.bossEntity=null;
  // Regenerate environment props for the new theme — this is what makes the
  // dungeon look visually different from the open world
  generateEnvironment();
  // AFTER props exist, nudge player to a clear spot if center is blocked
  const clear=findClearPosition(player.x,player.y,22);
  player.x=clear.x;player.y=clear.y;
  camX=player.x;camY=player.y;
  // Spawn first wave immediately
  spawnDungeonWave(0);
  // UI feedback — show dungeon HUD, hide zone label (dungeon HUD replaces it)
  const overlay=document.getElementById('dungeonStatus');
  if(overlay){overlay.style.display='flex';updateDungeonHUD();}
  const zoneLbl=document.getElementById('zoneLabel');
  if(zoneLbl)zoneLbl.style.display='none';
  const panel=document.getElementById('dungeonPanel');
  if(panel)panel.style.display='none';
  addFeed(`⚑ ENTERED: ${def.name.toUpperCase()}`,def.color);
  SFX.zoneChange&&SFX.zoneChange();
  // Dramatic screen flash
  pushGroundFX({type:'bloom',x:player.x,y:player.y,r:400,maxR:400,color:def.color,life:0.8,maxLife:0.8});
}

function spawnDungeonWave(waveIndex){
  const wave=dungeonState.def.waves[waveIndex];
  if(!wave)return;
  // Spawn enemies in a ring around the player, staggered
  for(let i=0;i<wave.count;i++){
    setTimeout(()=>{
      if(!dungeonState.active)return; // guard: dungeon may have ended
      const type=wave.types[Math.floor(Math.random()*wave.types.length)];
      const typeData=ENEMY_TYPES.find(t=>t.type===type)||ENEMY_TYPES[0];
      const isElite=i<wave.elites;
      const angle=Math.random()*Math.PI*2;
      const dist=340+Math.random()*80;
      let x=Math.max(60,Math.min(WORLD_W-60,player.x+Math.cos(angle)*dist));
      let y=Math.max(60,Math.min(WORLD_H-60,player.y+Math.sin(angle)*dist));
      // Nudge away from collidable props
      const clear=findClearPosition(x,y,22);
      x=clear.x;y=clear.y;
      const hs=enemyHpScale(player.level),ds=enemyDmgScale(player.level);
      const base=player.level<=5?150:player.level<=10?175:200;
      enemies.push({
        id:enemyId++,x,y,vx:0,vy:0,
        hp:base*hs*typeData.hp*(isElite?2.4:1),
        maxHp:base*hs*typeData.hp*(isElite?2.4:1),
        attack:(player.level<=5?22:player.level<=10?26:30)*ds*typeData.dmg*(isElite?1.6:1),
        speed:typeData.spd*(isElite?1.12:1),
        dead:false,isElite,typeData,
        lastAttack:0,hitFlash:0,
        veilmarkStacks:0,veilmarkExpiry:0,
        size:typeData.r*(isElite?1.35:1),
      });
    },i*200);
  }
}

function spawnDungeonBoss(){
  const bd=dungeonState.def.boss;
  const typeData=ENEMY_TYPES.find(t=>t.type===bd.baseType)||ENEMY_TYPES[0];
  const hs=enemyHpScale(player.level),ds=enemyDmgScale(player.level);
  const base=player.level<=5?150:player.level<=10?175:200;
  // Spawn boss directly in front of player for a heroic entrance
  const angle=player.facing||0;
  let x=player.x+Math.cos(angle)*280;
  let y=player.y+Math.sin(angle)*280;
  // Boss is large — use bigger radius to make sure it lands clear
  const clear=findClearPosition(x,y,Math.max(40,typeData.r*bd.sizeMult*0.5));
  x=clear.x;y=clear.y;
  const boss={
    id:enemyId++,x,y,vx:0,vy:0,
    hp:base*hs*typeData.hp*bd.hpMult,
    maxHp:base*hs*typeData.hp*bd.hpMult,
    attack:(player.level<=5?22:player.level<=10?26:30)*ds*typeData.dmg*bd.atkMult,
    speed:typeData.spd*0.85, // bosses a bit slower but hit like a truck
    dead:false,isElite:true,typeData,
    lastAttack:0,hitFlash:0,
    veilmarkStacks:0,veilmarkExpiry:0,
    size:typeData.r*bd.sizeMult,
    isBoss:true,bossName:bd.name,
  };
  enemies.push(boss);
  dungeonState.bossEntity=boss;
  bossTarget=boss;
  // Big dramatic entrance effect
  pushGroundFX({type:'ring',x:boss.x,y:boss.y,maxR:260,r:30,color:dungeonState.def.color,life:0.8,maxLife:0.8,expand:true});
  pushGroundFX({type:'bloom',x:boss.x,y:boss.y,r:240,maxR:240,color:dungeonState.def.color,life:0.5,maxLife:0.5});
  screenShake(18,600);
  addFeed(`☠ ${bd.name.toUpperCase()} AWAKENS`,'#ef4444');
}

function updateDungeon(now){
  if(!dungeonState.active)return;
  // If player died inside a dungeon, abort the run when they hit the death screen
  if(player.isDead){exitDungeon(false);return;}

  const livingEnemies=enemies.filter(e=>!e.dead).length;

  if(dungeonState.phase==='wave'){
    // Wait until enemies are cleared, then advance
    if(livingEnemies===0){
      // Brief pause before next wave for readability
      dungeonState.phaseTimer+=16; // assume ~16ms/frame; coarse is fine
      if(dungeonState.phaseTimer>1200){
        dungeonState.phaseTimer=0;
        dungeonState.waveIdx++;
        if(dungeonState.waveIdx>=dungeonState.def.waves.length){
          dungeonState.phase='bossIntro';
          addFeed('━━ BOSS INCOMING ━━','#ef4444');
        } else {
          spawnDungeonWave(dungeonState.waveIdx);
          addFeed(`WAVE ${dungeonState.waveIdx+1}/${dungeonState.def.waves.length}`,'#c084fc');
        }
      }
    } else {
      dungeonState.phaseTimer=0;
    }
  } else if(dungeonState.phase==='bossIntro'){
    // 1.5s dramatic pause then spawn boss
    dungeonState.phaseTimer+=16;
    if(dungeonState.phaseTimer>1500){
      dungeonState.phaseTimer=0;
      dungeonState.phase='boss';
      spawnDungeonBoss();
    }
  } else if(dungeonState.phase==='boss'){
    if(dungeonState.bossEntity&&dungeonState.bossEntity.dead){
      // Victory! Pay out rewards then exit
      completeDungeon();
    }
  }
  updateDungeonHUD();
}

function completeDungeon(){
  const def=dungeonState.def;
  const reward=def.reward;
  // Bonus rewards
  player.gold+=reward.bonusGold;
  addXP(reward.bonusXP);
  // Guaranteed loot at minimum rarity
  const allRarities=['common','uncommon','rare','epic','legendary','mythic'];
  const minIdx=allRarities.indexOf(reward.minRarity);
  // Pick a random rarity at or above min
  const maxIdx=Math.min(minIdx+2,allRarities.length-1);
  const chosenIdx=minIdx+Math.floor(Math.random()*(maxIdx-minIdx+1));
  const targetRarity=allRarities[chosenIdx];
  // Filter item pool for that rarity, fall back if empty
  const pool=ITEM_POOL.filter(i=>i.rarity===targetRarity);
  const item=pool.length
    ? {...pool[Math.floor(Math.random()*pool.length)]}
    : rollLoot(player.level);
  tryEquip(item);
  // Beam FX + dramatic exit
  const rarityColors={common:'#9ca3af',uncommon:'#22c55e',rare:'#60a5fa',epic:'#c084fc',legendary:'#f59e0b',mythic:'#ff6b6b'};
  const col=rarityColors[item.rarity]||'#fff';
  pushGroundFX({type:'beam',x:player.x,y:player.y,r:60,maxR:60,color:col,life:2.5,maxLife:2.5});
  pushGroundFX({type:'bloom',x:player.x,y:player.y,r:300,maxR:300,color:col,life:0.8,maxLife:0.8});
  screenShake(14,400);
  addFeed(`✦ ${def.name.toUpperCase()} CLEARED!`,def.color);
  addFeed(`+${reward.bonusGold} gold · +${reward.bonusXP} XP`,'#f59e0b');
  // Save immediately — never lose a dungeon clear
  if(typeof writeSave==='function')writeSave();
  // Exit after a brief celebration pause
  setTimeout(()=>exitDungeon(true),2400);
}

function exitDungeon(success){
  if(!dungeonState.active)return;
  dungeonState.active=false;
  dungeonState.phase='idle';
  dungeonState.bossEntity=null;
  bossTarget=null;
  // Clear enemies (they don't belong in the normal zone)
  enemies=[];
  // Teleport back to entry position
  player.x=dungeonState.returnX;
  player.y=dungeonState.returnY;
  camX=player.x;camY=player.y;
  // Clear velocity + reset AFK waypoint so player doesn't immediately drift away
  player.vx=0;player.vy=0;
  player.lastInput=performance.now(); // prevents AFK pathing for a few seconds
  // Regenerate environment with open-world theme (getActiveTheme() now returns curZone)
  generateEnvironment();
  // AFTER regenerating, nudge player clear in case a prop is now at returnX/Y
  const clear=findClearPosition(player.x,player.y,22);
  player.x=clear.x;player.y=clear.y;
  camX=player.x;camY=player.y;
  if(typeof setAfkWaypoint==='function')setAfkWaypoint();
  // Hide dungeon HUD, restore normal zone label
  const overlay=document.getElementById('dungeonStatus');
  if(overlay)overlay.style.display='none';
  const bossBar=document.getElementById('bossHpBar');
  if(bossBar)bossBar.style.display='none';
  const zoneLbl=document.getElementById('zoneLabel');
  if(zoneLbl)zoneLbl.style.display='block';
  if(!success)addFeed('Dungeon failed','#6b4d8a');
}

// Player-triggered forfeit. Confirms so a misclick doesn't cost progress.
function abandonDungeon(){
  if(!dungeonState.active)return;
  if(!confirm('Abandon this dungeon run?\n\nAll progress in this run will be lost.'))return;
  addFeed('⚑ Run abandoned','#6b4d8a');
  exitDungeon(false);
}

// Update the boss HP bar. Called each frame while a boss fight is active.
function updateBossHpBar(){
  const bar=document.getElementById('bossHpBar');
  if(!bar)return;
  const boss=dungeonState.bossEntity;
  if(!boss||boss.dead||dungeonState.phase!=='boss'){
    bar.style.display='none';
    return;
  }
  bar.style.display='flex';
  const nameEl=bar.querySelector('.boss-hp-name');
  const fillEl=bar.querySelector('.boss-hp-fill');
  if(nameEl)nameEl.textContent=boss.bossName||'Boss';
  if(fillEl){
    const pct=Math.max(0,Math.min(100,(boss.hp/boss.maxHp)*100));
    fillEl.style.width=pct+'%';
  }
}

function updateDungeonHUD(){
  if(!dungeonState.active)return;
  const overlay=document.getElementById('dungeonStatus');
  if(!overlay)return;
  const def=dungeonState.def;
  let title,sub;
  if(dungeonState.phase==='wave'){
    const total=def.waves.length;
    const cur=dungeonState.waveIdx+1;
    const remaining=enemies.filter(e=>!e.dead).length;
    title=`${def.name}`;
    sub=`Wave ${cur}/${total} · ${remaining} enemies`;
  } else if(dungeonState.phase==='bossIntro'){
    title=def.name;
    sub='BOSS INCOMING...';
  } else if(dungeonState.phase==='boss'){
    title=def.boss.name.toUpperCase();
    sub='FINAL BATTLE';
  }
  const titleEl=overlay.querySelector('.dungeon-status-title');
  const subEl=overlay.querySelector('.dungeon-status-sub');
  if(titleEl)titleEl.textContent=title;
  if(subEl)subEl.textContent=sub;
  if(titleEl)titleEl.style.color=def.color;
  // Keep boss HP bar in sync
  updateBossHpBar();
}

// ═══════ PORTAL SYSTEM ═══════════════════════════════════
// Portals spawn naturally in the world as the player plays.
// Stepping on one channels for 0.8s then enters the dungeon. Walking away cancels.
// Only ONE portal exists at a time. Lifespan is 90s — last 15s visually dim + warn.

const PORTAL_LIFESPAN=90000;       // total ms before expire
const PORTAL_WARN_MS=15000;         // last N ms play warning dim/pulse
const PORTAL_ENTRY_RADIUS=62;       // px within which channeling starts
const PORTAL_CHANNEL_MS=800;        // ms to channel before being pulled in
const PORTAL_SPAWN_MIN_MS=90000;    // minimum wait before first portal (90s)
const PORTAL_SPAWN_COOLDOWN_MIN=120000; // after portal resolves, min wait (2m)
const PORTAL_SPAWN_COOLDOWN_MAX=240000; // ...up to 4m

let portalState={
  active:null,       // the live portal {x,y,def,spawnAt,expiresAt,channelStart}
  nextSpawnAt:performance.now()+PORTAL_SPAWN_MIN_MS, // when next portal can spawn
  totalSpawned:0,    // stats / save
};

// Pick which tier of dungeon to spawn a portal to, based on player level + chance.
function rollPortalDungeon(){
  const lv=player.level;
  // Only dungeons the player meets the level req for
  const eligible=DUNGEONS.filter(d=>lv>=d.minLevel);
  if(!eligible.length)return null;
  // Weight higher tiers less so they're rarer
  // tier 1: weight 60, tier 2: weight 30, tier 3: weight 10
  const weights={1:60,2:30,3:10};
  let totalW=0;
  eligible.forEach(d=>totalW+=weights[d.tier]||10);
  let roll=Math.random()*totalW;
  for(const d of eligible){
    roll-=weights[d.tier]||10;
    if(roll<=0)return d;
  }
  return eligible[0];
}

function spawnPortal(){
  if(portalState.active)return;           // already one out
  if(dungeonState.active)return;          // don't spawn mid-dungeon
  const def=rollPortalDungeon();
  if(!def)return;
  // Spawn 400-700px from player in a random direction that stays in-bounds
  let x,y,tries=0;
  do{
    const angle=Math.random()*Math.PI*2;
    const dist=400+Math.random()*300;
    x=player.x+Math.cos(angle)*dist;
    y=player.y+Math.sin(angle)*dist;
    tries++;
  } while((x<200||x>WORLD_W-200||y<200||y>WORLD_H-200)&&tries<10);
  x=Math.max(200,Math.min(WORLD_W-200,x));
  y=Math.max(200,Math.min(WORLD_H-200,y));
  const now=performance.now();
  portalState.active={
    x,y,def,
    spawnAt:now,
    expiresAt:now+PORTAL_LIFESPAN,
    channelStart:0,  // set when player is inside entry radius, reset when they leave
    phase:'idle',    // 'idle' | 'channeling' | 'entering'
  };
  portalState.totalSpawned++;
  // Spawn FX: dramatic pop-in
  pushGroundFX({type:'ring',x,y,maxR:220,r:40,color:def.color,life:1.0,maxLife:1.0,expand:true});
  pushGroundFX({type:'bloom',x,y,r:200,maxR:200,color:def.color,life:0.6,maxLife:0.6});
  pushGroundFX({type:'scorch',x,y,r:100,maxR:100,color:def.color,life:2.0,maxLife:2.0});
  SFX.zoneChange&&SFX.zoneChange();
  addFeed(`⚑ A rift to ${def.name} opens nearby...`,def.color);
}

// Called every frame from update()
function updatePortal(dt,now){
  // If no portal, try to spawn one
  if(!portalState.active){
    if(!dungeonState.active && now>=portalState.nextSpawnAt){
      spawnPortal();
    }
    return;
  }
  const p=portalState.active;
  // Expiry
  if(now>=p.expiresAt){
    pushGroundFX({type:'ring',x:p.x,y:p.y,maxR:140,r:20,color:'#6b4d8a',life:0.6,maxLife:0.6,expand:true});
    addFeed('⚑ Portal collapsed.','#6b4d8a');
    portalState.active=null;
    portalState.nextSpawnAt=now+PORTAL_SPAWN_COOLDOWN_MIN+Math.random()*(PORTAL_SPAWN_COOLDOWN_MAX-PORTAL_SPAWN_COOLDOWN_MIN);
    // Hide the portal prompt if it was showing
    const promptEl=document.getElementById('portalPrompt');
    if(promptEl)promptEl.style.display='none';
    return;
  }
  // Dim-warn threshold
  const remaining=p.expiresAt-now;
  if(remaining<=PORTAL_WARN_MS&&!p.warned){
    p.warned=true;
    addFeed('⚑ Portal fading — go now!','#f59e0b');
  }
  // Check player proximity — show/hide the confirmation prompt instead of auto-channeling
  const dx=player.x-p.x, dy=player.y-p.y, d=Math.sqrt(dx*dx+dy*dy);
  const nearPortal=d<PORTAL_ENTRY_RADIUS*1.8; // slightly bigger radius for prompt visibility
  const promptEl=document.getElementById('portalPrompt');
  if(promptEl){
    if(nearPortal){
      // Show the prompt if not already showing
      if(!p.promptVisible){
        p.promptVisible=true;
        const dgNameEl=promptEl.querySelector('.portal-prompt-name');
        if(dgNameEl){
          dgNameEl.textContent=p.def.name;
          dgNameEl.style.color=p.def.color;
        }
        promptEl.style.display='flex';
        promptEl.style.borderColor=p.def.color+'88';
      }
    } else {
      // Hide the prompt when walking away
      if(p.promptVisible){
        p.promptVisible=false;
        promptEl.style.display='none';
      }
    }
  }
}

// Called when player taps the ENTER button on the portal prompt.
// This is now the ONLY way to enter a portal — no more walk-in-by-accident.
function confirmPortalEntry(){
  if(!portalState.active)return;
  const p=portalState.active;
  const def=p.def;
  // Hide the prompt immediately
  const promptEl=document.getElementById('portalPrompt');
  if(promptEl)promptEl.style.display='none';
  // Consume portal
  portalState.active=null;
  portalState.nextSpawnAt=performance.now()+PORTAL_SPAWN_COOLDOWN_MIN+Math.random()*(PORTAL_SPAWN_COOLDOWN_MAX-PORTAL_SPAWN_COOLDOWN_MIN);
  enterDungeon(def.id);
}

// Called from render() AFTER the canvas has been translated into world space.
// Draws the portal at p.x, p.y in world coordinates.
function drawPortal(now){
  if(!portalState.active)return;
  const p=portalState.active;
  // Cull offscreen in world space
  if(p.x<camX-W/2-300||p.x>camX+W/2+300||p.y<camY-H/2-300||p.y>camY+H/2+300)return;
  const remaining=p.expiresAt-now;
  const dimming=remaining<PORTAL_WARN_MS;
  const age=now-p.spawnAt;
  const pulse=0.7+0.3*Math.sin(age*0.005);
  const channelProgress=p.phase==='channeling'?(now-p.channelStart)/PORTAL_CHANNEL_MS:0;
  const baseColor=dimming?'#6b4d8a':p.def.color;
  ctx.save();
  // Outer glow bloom
  const bloomR=70*pulse*(1+channelProgress*0.5);
  const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,bloomR);
  grad.addColorStop(0,baseColor+'cc');
  grad.addColorStop(0.5,baseColor+'55');
  grad.addColorStop(1,baseColor+'00');
  ctx.fillStyle=grad;
  ctx.beginPath();ctx.arc(p.x,p.y,bloomR,0,Math.PI*2);ctx.fill();
  // Spinning ring (outer, slow)
  ctx.strokeStyle=baseColor;
  ctx.lineWidth=3;
  ctx.globalAlpha=dimming?0.5+0.5*Math.sin(age*0.01):0.9;
  const ringR=38+2*Math.sin(age*0.004);
  ctx.beginPath();
  ctx.arc(p.x,p.y,ringR,age*0.002,age*0.002+Math.PI*1.5);
  ctx.stroke();
  // Inner ring counter-rotating
  ctx.beginPath();
  ctx.arc(p.x,p.y,ringR*0.65,-age*0.003,-age*0.003+Math.PI*1.2);
  ctx.stroke();
  // Vertical column of light
  const colH=70*pulse;
  const colGrad=ctx.createLinearGradient(p.x,p.y-colH,p.x,p.y);
  colGrad.addColorStop(0,baseColor+'00');
  colGrad.addColorStop(0.7,baseColor+'88');
  colGrad.addColorStop(1,baseColor+'dd');
  ctx.globalAlpha=0.8;
  ctx.fillStyle=colGrad;
  ctx.fillRect(p.x-4,p.y-colH,8,colH);
  // Center white-hot dot
  ctx.globalAlpha=1;
  ctx.fillStyle='#fff';
  ctx.shadowColor=baseColor;ctx.shadowBlur=12;
  ctx.beginPath();ctx.arc(p.x,p.y,3+2*pulse,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;
  // Channel progress ring (while player is standing on portal)
  if(channelProgress>0){
    ctx.strokeStyle='#fff';
    ctx.lineWidth=4;
    ctx.globalAlpha=1;
    ctx.beginPath();
    ctx.arc(p.x,p.y,50,-Math.PI/2,-Math.PI/2+channelProgress*Math.PI*2);
    ctx.stroke();
  }
  // Floating dungeon name above
  ctx.globalAlpha=dimming?0.5:1;
  ctx.textAlign='center';
  ctx.font='700 12px Cinzel, serif';
  ctx.fillStyle='#000';
  ctx.fillText(p.def.name.toUpperCase(),p.x+1,p.y-colH-9);
  ctx.fillStyle=baseColor;
  ctx.fillText(p.def.name.toUpperCase(),p.x,p.y-colH-10);
  ctx.restore();
  // Emit embers occasionally into the particle system
  if(Math.random()<0.3){
    particles.push({
      x:p.x+(Math.random()-0.5)*20,y:p.y+(Math.random()-0.5)*20,
      vx:(Math.random()-0.5)*20,vy:-30-Math.random()*30,
      life:1.2,maxLife:1.2,
      color:baseColor,size:1.5+Math.random()*1.5,soul:true
    });
  }
}
function spawnSpirit(isTemp=false){
  const perms=spirits.filter(s=>!s.isTemp&&!s.dead);
  if(!isTemp&&perms.length>=(player.maxBonds||MAX_SPIRITS))return false;
  const a=Math.random()*Math.PI*2;
  spirits.push({id:spiritId++,x:player.x+Math.cos(a)*40,y:player.y+Math.sin(a)*40,dead:false,isTemp,lifetime:isTemp?45000:Infinity,lastAttack:0,orbitAngle:Math.random()*Math.PI*2,hauntTarget:null,attackCount:0,wobble:Math.random()*Math.PI*2,empoweredUntil:0});
  return true;
}

// ═══════ AFK PATHFINDING ════════════════════════════════
function setAfkWaypoint(){
  player.afkTimer=0;
  let next=-1;
  for(let i=0;i<9;i++){const c=(player.sector+i+1)%9;if(!player.visitedSectors[c]){next=c;break;}}
  if(next===-1){player.visitedSectors.fill(false);next=Math.floor(Math.random()*9);}
  player.sector=next;
  const col=next%3,row=Math.floor(next/3),sw=WORLD_W/3,sh=WORLD_H/3;
  // Try up to 8 points within the chosen sector until we find a clear one.
  // Falls back to the last attempt if nothing clear was found — avoids infinite loops.
  let wx=col*sw+100+Math.random()*(sw-200);
  let wy=row*sh+100+Math.random()*(sh-200);
  for(let tries=0;tries<8;tries++){
    if(!getPropCollisionAt(wx,wy,18))break;
    wx=col*sw+100+Math.random()*(sw-200);
    wy=row*sh+100+Math.random()*(sh-200);
  }
  player.afkWpX=wx;
  player.afkWpY=wy;
}

// ═══════ ABILITY CASTS ══════════════════════════════════
// Helper: shortcut to talent bonus lookup with safe fallback
function _tb(k){return typeof getTalentBonus==='function'?getTalentBonus(k):0;}

// Compute effective cooldown for an ability after all CDR talents.
// idx 0 = Raise (also gets raiseCdrPct bonus), others just get generic cdrPct.
function effectiveCD(idx){
  let base=ABILITY_CDS[idx]||16000;
  let cdrPct=_tb('cdrPct');
  if(idx===0)cdrPct+=_tb('raiseCdrPct');
  return base*(1-Math.min(cdrPct,70)/100); // cap CDR at 70% to prevent infinite loops
}

// Damage multiplier applied to every ability. Stacks with per-spirit bonus.
function damageMult(){
  let mult=1+_tb('dmgPct')/100;
  // Per-spirit damage: each living permanent spirit adds perSpiritDmgPct%
  const perSpiritPct=_tb('perSpiritDmgPct');
  if(perSpiritPct>0){
    const alive=spirits.filter(s=>!s.dead&&!s.isTemp).length;
    mult+=(alive*perSpiritPct)/100;
  }
  return mult;
}

function playerCast(idx){
  const now=performance.now();
  if(now<abilityCDs[idx]||player.isDead)return;
  if(idx===0){
    // Raise — summon one spirit, or two with Echoing Call talent
    const doubles=_tb('raiseDoubles')>0;
    const summoned=spawnSpirit();
    if(summoned){
      if(doubles)spawnSpirit(); // second summon if the talent is learned (silent failure if cap)
      abilityCDs[0]=now+effectiveCD(0);SFX.spiritSummon();
      addFeed(doubles?'✦✦ SPIRITS RAISED':'✦ SPIRIT RAISED','#9DC4B0');
      emitSpiritBurst(player.x,player.y);
      pushGroundFX({type:'ring',x:player.x,y:player.y,maxR:110,r:10,color:'#9DC4B0',life:0.55,maxLife:0.55,expand:true});
      pushGroundFX({type:'scorch',x:player.x,y:player.y,r:90,maxR:90,color:'#9DC4B0',life:0.9,maxLife:0.9});
    }
  } else if(idx===1){
    const t=getNearestEnemy(950);
    if(t){
      const vmMax=10+_tb('veilmarkMax');
      t.veilmarkStacks=Math.min(t.veilmarkStacks+1,vmMax);t.veilmarkExpiry=now+8000;
      abilityCDs[1]=now+effectiveCD(1);SFX.veilmark();addFeed(`VEILMARK ×${t.veilmarkStacks}`,'#f43f5e');
      pushGroundFX({type:'bloom',x:t.x,y:t.y,r:80,maxR:80,color:'#f43f5e',life:0.35,maxLife:0.35});
    }
  } else if(idx===2){
    const t=getNearestMarkedEnemy();
    if(t&&t.veilmarkStacks>=3){
      const detoDmgMult=1+_tb('detoDmgPct')/100;
      const radius=240+_tb('detoRadius');
      const dmg=player.attack*2*t.veilmarkStacks*damageMult()*detoDmgMult;
      let hits=0;
      enemies.forEach(e=>{if(!e.dead&&dist2(t.x,t.y,e.x,e.y)<radius){hitEnemy(e,dmg,false,t.x,t.y);hits++;}});
      t.veilmarkStacks=0;abilityCDs[2]=now+effectiveCD(2);SFX.detonate();
      screenShake(14,320);emitExplosion(t.x,t.y,'#ff6b35');
      pushGroundFX({type:'ring',x:t.x,y:t.y,maxR:radius,r:20,color:'#ff6b35',life:0.5,maxLife:0.5,expand:true});
      pushGroundFX({type:'scorch',x:t.x,y:t.y,r:radius-40,maxR:radius-40,color:'#ff6b35',life:1.8,maxLife:1.8});
      pushGroundFX({type:'bloom',x:t.x,y:t.y,r:radius-60,maxR:radius-60,color:'#fff4a0',life:0.25,maxLife:0.25});
      addFeed(`💥 DETONATE! ${hits} HIT · ${Math.round(dmg)}`,'#ff6b35');
      // Cataclysm talent: 30% chance to echo the detonation
      if(_tb('detoEcho')>0&&Math.random()<0.3){
        setTimeout(()=>{
          let hits2=0;
          enemies.forEach(e=>{if(!e.dead&&dist2(t.x,t.y,e.x,e.y)<radius){hitEnemy(e,dmg*0.7,false,t.x,t.y);hits2++;}});
          pushGroundFX({type:'ring',x:t.x,y:t.y,maxR:radius,r:20,color:'#fff4a0',life:0.4,maxLife:0.4,expand:true});
          if(hits2>0)addFeed(`  ↳ CATACLYSM ECHO · ${hits2}`,'#fff4a0');
        },180);
      }
    }
  } else if(idx===3){
    const radius=340+_tb('wrathRadius');
    const dmg=player.attack*1.6*damageMult();
    let hits=0;
    const vmMax=10+_tb('veilmarkMax');
    enemies.forEach(e=>{if(!e.dead&&dist2(player.x,player.y,e.x,e.y)<radius){hitEnemy(e,dmg,false,player.x,player.y);e.veilmarkStacks=Math.min(e.veilmarkStacks+1,vmMax);e.veilmarkExpiry=now+8000;hits++;}});
    abilityCDs[3]=now+effectiveCD(3);SFX.wrathTide();
    emitWave(player.x,player.y);
    pushGroundFX({type:'ring',x:player.x,y:player.y,maxR:radius,r:20,color:'#a855f7',life:0.6,maxLife:0.6,expand:true});
    pushGroundFX({type:'scorch',x:player.x,y:player.y,r:radius-20,maxR:radius-20,color:'#a855f7',life:1.5,maxLife:1.5});
    addFeed(`⚡ WRATH TIDE — ${hits} MARKED`,'#a855f7');
  } else if(idx===4){
    const dmg=player.attack*3.2*damageMult();let hits=0;
    enemies.forEach(e=>{if(!e.dead&&dist2(player.x,player.y,e.x,e.y)<460){hitEnemy(e,dmg,false,player.x,player.y);hits++;}});
    abilityCDs[4]=now+effectiveCD(4);
    if(SFX.eliteDeath)SFX.eliteDeath();
    screenShake(20,500);
    pushGroundFX({type:'bloom',x:player.x,y:player.y,r:300,maxR:300,color:'#fbbf24',life:0.5,maxLife:0.5});
    pushGroundFX({type:'ring',x:player.x,y:player.y,maxR:460,r:30,color:'#fbbf24',life:0.8,maxLife:0.8,expand:true});
    pushGroundFX({type:'scorch',x:player.x,y:player.y,r:440,maxR:440,color:'#fbbf24',life:2.2,maxLife:2.2});
    addFeed(`★ SOUL NOVA — ${hits} STRUCK · ${Math.round(dmg)}`,'#fbbf24');
  }
}

// ═══════ COMBAT ═════════════════════════════════════════
function getNearestEnemy(maxR=Infinity){let b=null,bd=maxR;enemies.forEach(e=>{if(e.dead)return;const d=dist2(player.x,player.y,e.x,e.y);if(d<bd){bd=d;b=e;}});return b;}
function getNearestMarkedEnemy(){const now=performance.now();let b=null,bd=Infinity;enemies.forEach(e=>{if(e.dead||e.veilmarkStacks<=0||now>e.veilmarkExpiry)return;const d=dist2(player.x,player.y,e.x,e.y);if(d<bd){bd=d;b=e;}});return b;}

function hitEnemy(e,dmg,isCrit=false,fromX,fromY){
  if(e.dead)return;
  const critChance=0.12+_tb('critPct')/100;
  const critRoll=Math.random()<critChance;
  const finalDmg=critRoll?dmg*2.2:dmg;
  e.hp-=finalDmg;e.hitFlash=0.18;
  spawnDmgText(e.x,e.y-e.size,Math.round(finalDmg),critRoll?'#fde68a':'#fff',critRoll);
  // Directional impact sparks (if we know where the hit came from, sparks fly away from source)
  if(typeof fromX==='number'){
    emitImpactSparks(e.x,e.y,fromX,fromY,e.typeData?.color||'#ffd166',critRoll?14:7);
  } else {
    for(let i=0;i<6;i++)particles.push({x:e.x,y:e.y,vx:(Math.random()-0.5)*180,vy:(Math.random()-0.5)*180,life:0.38,maxLife:0.38,color:e.typeData?.color||'#ef4444',size:2.5+Math.random()*3});
  }
  // Crit bloom — brief radial flash on the target
  if(critRoll){
    pushGroundFX({type:'bloom',x:e.x,y:e.y,r:80,maxR:80,color:'#fde68a',life:0.3,maxLife:0.3});
    screenShake(5,90);
  }
  if(e.hp<=0)killEnemy(e);
}

function killEnemy(e){
  e.dead=true;kills++;
  document.getElementById('killCount').textContent=`☠ ${kills}`;
  const xpG=e.isElite?60:14,goldG=e.isElite?30:6;
  addXP(xpG);player.gold+=goldG;
  SFX[e.isElite?'eliteDeath':'enemyDeath']();
  spawnDmgText(e.x,e.y-40,`+${xpG}XP`,'#8b5cf6',false);
  // Pale Vitality talent: heal on kill
  const heal=_tb('lifeOnHit');
  if(heal>0&&!player.isDead){
    const actualHeal=Math.min(heal,player.maxHp-player.hp);
    if(actualHeal>0){
      player.hp+=actualHeal;
      spawnDmgText(player.x,player.y-30,`+${actualHeal}`,'#22c55e',false);
    }
  }
  // Materials
  if(Math.random()<0.09){professions.Spiritweaving.materials.soulWisps++;addProfXP('Spiritweaving',2);addFeed('+Soul Wisp','#9DC4B048');}
  if(e.isElite&&Math.random()<0.28){professions.Spiritweaving.materials.veilCloth++;addProfXP('Spiritweaving',6);}
  if(e.isElite){professions.Veilstalking.materials.predatorMarks++;addProfXP('Veilstalking',14);}
  if(e.isElite&&Math.random()<0.18){professions.Veilstalking.materials.trophyShards++;}
  if(Math.random()<0.05){professions.Veilscribing.materials.veilDust++;addProfXP('Veilscribing',1);}
  if(e.veilmarkStacks>0&&Math.random()<0.14){professions.Spiritweaving.materials.paleEssence++;addProfXP('Spiritweaving',5);}
  // Loot
  if(Math.random()<(e.isElite?0.38:0.07)){
    const item=rollLoot(player.level);tryEquip(item);
    // Rarity-tiered pickup sound
    const rarityToSFX={common:'pickupCommon',uncommon:'pickupUncommon',rare:'pickupRare',epic:'pickupEpic',legendary:'pickupLegendary',mythic:'pickupMythic'};
    const sfxName=rarityToSFX[item.rarity]||'pickup';
    (SFX[sfxName]||SFX.pickup)();
    // Loot beam — colored column of light matching rarity, scales in intensity
    const rarityColors={common:'#9ca3af',uncommon:'#22c55e',rare:'#60a5fa',epic:'#c084fc',legendary:'#f59e0b',mythic:'#ff6b6b'};
    const rarityLife={common:0.6,uncommon:0.9,rare:1.3,epic:1.8,legendary:2.6,mythic:3.2};
    const col=rarityColors[item.rarity]||'#9ca3af';
    const life=rarityLife[item.rarity]||0.6;
    pushGroundFX({type:'beam',x:e.x,y:e.y,r:40,maxR:40,color:col,life,maxLife:life});
    // For higher rarities, add a bigger drop bloom + screen shake to make the drop feel significant
    const dramaTier={common:0,uncommon:0,rare:1,epic:2,legendary:3,mythic:4}[item.rarity]||0;
    if(dramaTier>=1){
      pushGroundFX({type:'bloom',x:e.x,y:e.y,r:100+dramaTier*40,maxR:100+dramaTier*40,color:col,life:0.4+dramaTier*0.1,maxLife:0.4+dramaTier*0.1});
    }
    if(dramaTier>=2)screenShake(4+dramaTier*2,200);
    // Save on any loot drop so players never lose their gear to a closed tab
    if(typeof writeSave==='function')writeSave();
  }
  // Death burst
  for(let i=0;i<14;i++){const a=Math.random()*Math.PI*2;particles.push({x:e.x,y:e.y,vx:Math.cos(a)*90,vy:Math.sin(a)*90-60,life:1.0,maxLife:1.0,color:e.typeData.color,size:3+Math.random()*4,soul:true});}
  // Update boss bar if this was the target
  if(bossTarget===e)bossTarget=null;
}

function addXP(amt){
  player.xp+=amt;
  let leveledUp=false;
  while(player.xp>=player.xpToNext&&player.level<MAX_LEVEL){
    player.xp-=player.xpToNext;player.level++;player.xpToNext=xpForLevel(player.level);
    // Award a talent point starting at level 2 (first level up)
    if(typeof awardTalentPoint==='function'&&player.level>=2)awardTalentPoint();
    // Recalc stats so talent bonuses (like hpPct) apply to the new level's maxHp
    if(typeof recalcStats==='function')recalcStats();
    else{player.maxHp=computeMaxHp(player.level);player.attack=computeAttack(player.level)+player.soulMastery*0.5;}
    player.hp=Math.min(player.hp+player.maxHp*0.3,player.maxHp);
    SFX.levelUp();showLevelUp();checkZone();
    if(player.level%5===0){professions.Spiritweaving.materials.hollowShards++;addProfXP('Spiritweaving',10);}
    leveledUp=true;
  }
  // Save the moment they level up — protect player progress from a closed tab
  if(leveledUp&&typeof writeSave==='function')writeSave();
}

// ═══════ VFX ════════════════════════════════════════════

// ─── GROUND FX LAYER ───
// Ground effects render below entities but above terrain.
// Every significant combat action produces a ground mark, giving
// abilities weight and telegraphing enemy attacks so the player can dodge.
//
// Types:
//  'telegraph'  — pulsing warning circle before an attack lands
//  'scorch'     — lingering burn/impact mark that fades
//  'ring'       — expanding ring (ability cast signature)
//  'beam'       — vertical column of light (loot drops)
//  'bloom'      — brief radial flash (crits, impacts)
//  'rimlight'   — pulsing glow anchored to an entity (elites)
function pushGroundFX(opts){
  groundFX.push(Object.assign({
    type:'scorch',x:0,y:0,r:60,maxR:60,
    color:'#ff6b35',life:1.0,maxLife:1.0,
    expand:false,  // if true, radius grows from 0 to maxR over lifetime
    pulse:false,   // if true, opacity pulses (for telegraphs)
    follow:null,   // optional entity reference — FX follows it
    onExpire:null, // optional callback when FX expires
    fired:false,   // telegraph use: whether damage has resolved yet
  },opts));
}

// Updates ground FX each frame. Called from update().
function updateGroundFX(dt,now){
  for(let i=groundFX.length-1;i>=0;i--){
    const fx=groundFX[i];
    fx.life-=dt;
    // Entity-followed FX track their target
    if(fx.follow){
      if(fx.follow.dead){fx.life=0;}
      else{fx.x=fx.follow.x;fx.y=fx.follow.y;}
    }
    // Expanding FX grow outward over time
    if(fx.expand){
      const prog=1-(fx.life/fx.maxLife);
      fx.r=fx.maxR*prog;
    }
    if(fx.life<=0){
      if(fx.onExpire)fx.onExpire(fx);
      groundFX.splice(i,1);
    }
  }
}

// Renders ground FX. Called from render() BEFORE entities are drawn,
// so effects look like they're painted on the floor beneath characters.
function drawGroundFX(now){
  groundFX.forEach(fx=>{
    const a=Math.max(0,fx.life/fx.maxLife);
    ctx.save();
    if(fx.type==='telegraph'){
      // Pulsing red warning circle — opacity oscillates to grab attention
      const pulse=0.55+0.35*Math.sin(now*0.015);
      const baseAlpha=Math.min(1, (1-a)*2); // fade IN as lifetime progresses
      ctx.globalAlpha=baseAlpha*pulse;
      // Filled semi-transparent zone
      const g=ctx.createRadialGradient(fx.x,fx.y,0,fx.x,fx.y,fx.r);
      g.addColorStop(0,fx.color+'44');
      g.addColorStop(0.7,fx.color+'22');
      g.addColorStop(1,fx.color+'00');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(fx.x,fx.y,fx.r,0,Math.PI*2);ctx.fill();
      // Hard outline ring to define the zone edge
      ctx.globalAlpha=baseAlpha;
      ctx.strokeStyle=fx.color;ctx.lineWidth=2.2;
      ctx.shadowColor=fx.color;ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(fx.x,fx.y,fx.r,0,Math.PI*2);ctx.stroke();
    } else if(fx.type==='scorch'){
      // Lingering burn mark on the ground — radial gradient fading out
      ctx.globalAlpha=a*0.75;
      const g=ctx.createRadialGradient(fx.x,fx.y,0,fx.x,fx.y,fx.r);
      g.addColorStop(0,fx.color+'aa');
      g.addColorStop(0.4,fx.color+'55');
      g.addColorStop(1,fx.color+'00');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(fx.x,fx.y,fx.r,0,Math.PI*2);ctx.fill();
    } else if(fx.type==='ring'){
      // Expanding outline ring — signature cast effect
      ctx.globalAlpha=a;
      ctx.strokeStyle=fx.color;ctx.lineWidth=3;
      ctx.shadowColor=fx.color;ctx.shadowBlur=15;
      ctx.beginPath();ctx.arc(fx.x,fx.y,fx.r,0,Math.PI*2);ctx.stroke();
      // Inner soft fill
      ctx.globalAlpha=a*0.3;
      const g=ctx.createRadialGradient(fx.x,fx.y,fx.r*0.6,fx.x,fx.y,fx.r);
      g.addColorStop(0,fx.color+'00');
      g.addColorStop(1,fx.color+'66');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(fx.x,fx.y,fx.r,0,Math.PI*2);ctx.fill();
    } else if(fx.type==='beam'){
      // Vertical column of light — loot drops. Rises from the ground.
      const beamH=100;
      ctx.globalAlpha=a*0.85;
      const g=ctx.createLinearGradient(fx.x,fx.y-beamH,fx.x,fx.y+10);
      g.addColorStop(0,fx.color+'00');
      g.addColorStop(0.7,fx.color+'66');
      g.addColorStop(1,fx.color+'ee');
      ctx.fillStyle=g;
      ctx.fillRect(fx.x-fx.r*0.5,fx.y-beamH,fx.r,beamH+10);
      // Ground ring where beam touches down
      ctx.globalAlpha=a;
      ctx.strokeStyle=fx.color;ctx.lineWidth=2;
      ctx.shadowColor=fx.color;ctx.shadowBlur=12;
      ctx.beginPath();ctx.arc(fx.x,fx.y,fx.r*0.75,0,Math.PI*2);ctx.stroke();
    } else if(fx.type==='bloom'){
      // Fast radial flash
      const prog=1-a;
      const r=fx.r*prog;
      ctx.globalAlpha=a*0.9;
      const g=ctx.createRadialGradient(fx.x,fx.y,0,fx.x,fx.y,r);
      g.addColorStop(0,'#fff');
      g.addColorStop(0.3,fx.color+'cc');
      g.addColorStop(1,fx.color+'00');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(fx.x,fx.y,r,0,Math.PI*2);ctx.fill();
    } else if(fx.type==='rimlight'){
      // Pulsing aura around an entity — elites
      const pulse=0.6+0.4*Math.sin(now*0.004);
      ctx.globalAlpha=a*pulse*0.8;
      const g=ctx.createRadialGradient(fx.x,fx.y,fx.r*0.4,fx.x,fx.y,fx.r);
      g.addColorStop(0,fx.color+'00');
      g.addColorStop(0.7,fx.color+'44');
      g.addColorStop(1,fx.color+'00');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(fx.x,fx.y,fx.r,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  });
  ctx.globalAlpha=1;ctx.shadowBlur=0;
}

// ─── Directional impact sparks — used when an enemy is hit ───
// Sparks shoot AWAY from the attacker's position so hits feel directional.
function emitImpactSparks(ex,ey,fromX,fromY,color,count=8){
  const baseAngle=Math.atan2(ey-fromY,ex-fromX);
  for(let i=0;i<count;i++){
    const a=baseAngle+(Math.random()-0.5)*1.2;
    const s=160+Math.random()*180;
    particles.push({x:ex,y:ey,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,
      life:0.4,maxLife:0.4,color:color||'#ffd166',size:2+Math.random()*2.5});
  }
}

function emitExplosion(x,y,color){for(let i=0;i<22;i++){const a=(i/22)*Math.PI*2,s=180+Math.random()*120;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0.65,maxLife:0.65,color,size:5+Math.random()*5});}}
function emitWave(x,y){for(let i=0;i<28;i++){const a=Math.random()*Math.PI*2,s=120+Math.random()*180;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0.55,maxLife:0.55,color:'#a855f7',size:4+Math.random()*5});}}
function emitSpiritBurst(x,y){for(let i=0;i<16;i++){const a=(i/16)*Math.PI*2;particles.push({x,y,vx:Math.cos(a)*100,vy:Math.sin(a)*100,life:0.7,maxLife:0.7,color:'#9DC4B0',size:4+Math.random()*3,soul:true});}}
function spawnDmgText(wx,wy,val,color,isCrit){dmgTexts.push({wx,wy,val:isCrit?'CRIT '+String(val):String(val),color,isCrit,life:1.4,maxLife:1.4,vy:-70-Math.random()*25,vx:(Math.random()-0.5)*35});}
function screenShake(amt,ms){shakeAmt=Math.max(shakeAmt,amt);shakeTimer=Math.max(shakeTimer,ms);}
function addFeed(msg,color='#9DC4B0'){const l=document.getElementById('feedLog');const el=document.createElement('div');el.className='feed';el.style.color=color;el.textContent=msg;l.prepend(el);setTimeout(()=>el.remove(),3800);}
function showLevelUp(){
  const unlocks={3:'Shop Unlocked',5:'Talents + Dungeons',8:'Soul Fissure',10:'Echoing Dirge',15:'Pale Eruption',20:'Veil Rupture'};
  document.getElementById('lvlUpTxt').textContent=`LEVEL ${player.level}`;
  document.getElementById('lvlUpUnlock').textContent=unlocks[player.level]||'Power Grows';
  const b=document.getElementById('lvlUpBanner');b.style.display='flex';
  setTimeout(()=>b.style.display='none',2600);
  addFeed(`✦ LEVEL ${player.level} ✦`,'#c084fc');
}
function respawn(){player.hp=player.maxHp;player.isDead=false;player.iframes=3000;player.x=WORLD_W/2;player.y=WORLD_H/2;const _rc=findClearPosition(player.x,player.y,22);player.x=_rc.x;player.y=_rc.y;enemies=[];spirits=[];player._cheatDeathUsed=false;document.getElementById('deathScreen').style.display='none';addFeed('RISEN FROM THE VEIL','#9DC4B0');}

// ═══════ UPDATE ═════════════════════════════════════════
function update(dt,now){
  if(player.isDead)return;
  let ix=0,iy=0;
  if(keys['ArrowLeft']||keys['a']||keys['A'])ix=-1;
  if(keys['ArrowRight']||keys['d']||keys['D'])ix=1;
  if(keys['ArrowUp']||keys['w']||keys['W'])iy=-1;
  if(keys['ArrowDown']||keys['s']||keys['S'])iy=1;
  if(keys['q']||keys['Q'])playerCast(0);
  if(keys['e']||keys['E'])playerCast(2);
  if(keys['r']||keys['R'])playerCast(3);
  if(touchJoy.active){ix=touchJoy.dx;iy=touchJoy.dy;}
  if(ix!==0||iy!==0)player.lastInput=now;
  const isAfk=now-player.lastInput>AFK_IDLE;

  if(ix!==0||iy!==0){
    const m=Math.sqrt(ix*ix+iy*iy)||1;
    const spdMult=1+_tb('moveSpdPct')/100;
    player.vx=(ix/m)*PLAYER_SPEED*spdMult;player.vy=(iy/m)*PLAYER_SPEED*spdMult;
    player.facing=Math.atan2(iy,ix);
  } else if(isAfk){
    player.afkTimer+=dt*1000;
    const tx=player.afkWpX-player.x,ty=player.afkWpY-player.y,d=Math.sqrt(tx*tx+ty*ty)||1;
    const ne=getNearestEnemy(320);
    let mx=tx,my=ty,md=d;
    if(ne){mx=ne.x-player.x;my=ne.y-player.y;md=Math.sqrt(mx*mx+my*my)||1;}
    if(d<80||player.afkTimer>player.afkCommit){player.visitedSectors[player.sector]=true;setAfkWaypoint();}
    const spdMult=1+_tb('moveSpdPct')/100;
    const spd=(ne&&md<320?PLAYER_SPEED*0.9:PLAYER_SPEED*0.72)*spdMult;
    player.vx=(mx/md)*spd;player.vy=(my/md)*spd;
    player.facing=Math.atan2(my,mx);
  } else{player.vx*=0.78;player.vy*=0.78;}

  // Proposed next position — clamped to world bounds
  const proposedX=Math.max(30,Math.min(WORLD_W-30,player.x+player.vx*dt));
  const proposedY=Math.max(30,Math.min(WORLD_H-30,player.y+player.vy*dt));
  // Resolve against prop collisions — player slides along prop edges rather than
  // stopping dead. Player collision radius ~18px matches their visible body.
  const resolved=resolvePlayerMovement(player.x,player.y,proposedX,proposedY,18);
  player.x=resolved.x;
  player.y=resolved.y;
  player.glowPulse+=dt*2.2;
  if(player.iframes>0)player.iframes-=dt*1000;
  if(player.hitFlash>0)player.hitFlash-=dt;

  // Auto attack
  if(now-player.lastAttack>ATTACK_CD){
    const t=getNearestEnemy(ATTACK_RANGE);
    if(t){player.lastAttack=now;hitEnemy(t,player.attack);SFX.hit();
      // Attack arc particles
      const dx=t.x-player.x,dy=t.y-player.y,d=Math.sqrt(dx*dx+dy*dy)||1;
      for(let i=0;i<4;i++)particles.push({x:player.x+dx/d*(40+i*30),y:player.y+dy/d*(40+i*30),vx:(Math.random()-0.5)*60,vy:(Math.random()-0.5)*60,life:0.25,maxLife:0.25,color:'#c084fc',size:2+Math.random()*2});
    }
  }

  // AFK auto-cast
  if(isAfk){for(let i=0;i<4;i++)if(now>=abilityCDs[i])playerCast(i);}

  // Spirits
  spirits=spirits.filter(s=>!s.dead);
  spirits.forEach(s=>{
    if(s.isTemp){s.lifetime-=dt*1000;if(s.lifetime<=0){s.dead=true;return;}}
    s.wobble+=dt*2.2;
    const or=70+Math.sin(s.wobble)*10;
    let haunt=s.hauntTarget&&!s.hauntTarget.dead&&s.hauntTarget.veilmarkStacks>0?s.hauntTarget:null;
    if(!haunt){s.hauntTarget=null;let bd=950;enemies.forEach(e=>{if(e.dead||e.veilmarkStacks<=0)return;const d=dist2(s.x,s.y,e.x,e.y);if(d<bd){bd=d;haunt=e;}});s.hauntTarget=haunt;}
    if(haunt){
      s.orbitAngle+=dt*3.8;
      const tx=haunt.x+Math.cos(s.orbitAngle)*or,ty=haunt.y+Math.sin(s.orbitAngle)*or;
      s.x+=(tx-s.x)*Math.min(1,dt*4.5);s.y+=(ty-s.y)*Math.min(1,dt*4.5);
      if(now-s.lastAttack>850){s.lastAttack=now;s.attackCount++;haunt.veilmarkStacks=Math.min(haunt.veilmarkStacks+1,10);hitEnemy(haunt,player.attack*0.32);}
    } else {
      let ne2=null,nd=720;
      enemies.forEach(e=>{if(e.dead)return;const d=dist2(s.x,s.y,e.x,e.y);if(d<nd){nd=d;ne2=e;}});
      if(ne2&&nd<340){
        const sdx=ne2.x-s.x,sdy=ne2.y-s.y,sd=Math.sqrt(sdx*sdx+sdy*sdy)||1;
        s.x+=sdx/sd*260*dt;s.y+=sdy/sd*260*dt;
        if(now-s.lastAttack>950&&sd<70){s.lastAttack=now;s.attackCount++;hitEnemy(ne2,player.attack*1.15*(1+_tb('spiritDmgPct')/100));}
      } else {
        s.orbitAngle+=dt*2.4;
        const tx=player.x+Math.cos(s.orbitAngle)*or,ty=player.y+Math.sin(s.orbitAngle)*or;
        s.x+=(tx-s.x)*Math.min(1,dt*3.2);s.y+=(ty-s.y)*Math.min(1,dt*3.2);
      }
    }
    if(Math.random()<0.05)particles.push({x:s.x,y:s.y,vx:(Math.random()-0.5)*30,vy:-18-Math.random()*18,life:0.45,maxLife:0.45,color:'#9DC4B0',size:1.8});
  });

  // Enemies
  enemies.forEach(e=>{
    if(e.dead)return;
    if(e.hitFlash>0)e.hitFlash-=dt;
    const dx=player.x-e.x,dy=player.y-e.y,d=Math.sqrt(dx*dx+dy*dy)||1;
    // Move toward player if out of attack range
    if(d>e.size+24)e.chargingUntil=0; // cancel windup if player moves out
    if(d>e.size+24&&!e.chargingUntil){e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt;}
    // Begin attack windup when in range
    if(d<e.size+30&&!e.chargingUntil&&now-e.lastAttack>1150){
      const windupMs=e.isElite?900:700; // elites take longer to wind up — bigger hit
      e.chargingUntil=now+windupMs;
      e.attackRange=(e.size+40); // snapshot range at cast time
      // Spawn telegraph FX that follows the enemy and marks the danger zone
      pushGroundFX({
        type:'telegraph',x:e.x,y:e.y,
        r:e.attackRange,maxR:e.attackRange,
        color:e.isElite?'#fbbf24':'#ef4444',
        life:windupMs/1000,maxLife:windupMs/1000,
        follow:e,
        pulse:true,
      });
    }
    // Resolve attack at end of windup
    if(e.chargingUntil&&now>=e.chargingUntil){
      e.chargingUntil=0;e.lastAttack=now;
      // Recompute distance now — player may have dodged out of range
      const ndx=player.x-e.x,ndy=player.y-e.y,nd=Math.sqrt(ndx*ndx+ndy*ndy)||1;
      if(nd<=e.attackRange&&player.iframes<=0){
        // Apply damage reduction talent
        const dmgReducePct=_tb('dmgReducePct');
        const incomingDmg=e.attack*(1-Math.min(dmgReducePct,80)/100);
        player.hp-=incomingDmg;
        player.hitFlash=0.18;player.iframes=220;
        screenShake(e.isElite?10:6,e.isElite?180:130);SFX.playerHit();
        pushGroundFX({type:'bloom',x:player.x,y:player.y,r:60,maxR:60,color:'#ef4444',life:0.3,maxLife:0.3});
        if(player.hp<=0){
          // Everlasting talent: first fatal hit per life is reduced to 1 HP
          if(_tb('cheatDeath')>0&&!player._cheatDeathUsed){
            player._cheatDeathUsed=true;
            player.hp=1;
            addFeed('✦ EVERLASTING','#fff4a0');
            pushGroundFX({type:'ring',x:player.x,y:player.y,maxR:120,r:10,color:'#fff4a0',life:0.8,maxLife:0.8,expand:true});
          } else {
            player.hp=0;player.isDead=true;
            document.getElementById('deathStats').textContent=`${kills} slain · Level ${player.level}`;
            document.getElementById('deathScreen').style.display='flex';
            if(typeof writeSave==='function')writeSave();
            // If inside a dungeon, fail the run
            if(dungeonState.active)exitDungeon(false);
          }
        }
      }
    }
    // Track nearest elite for boss bar
    if(e.isElite&&(!bossTarget||e.isElite)){
      const bd=dist2(player.x,player.y,e.x,e.y);
      if(bd<500)bossTarget=e;
    }
    // Elite rim light — spawn occasionally so every elite has a persistent warm aura
    if(e.isElite&&(!e.nextRim||now>=e.nextRim)){
      e.nextRim=now+600;
      pushGroundFX({
        type:'rimlight',x:e.x,y:e.y,
        r:e.size*2.8,maxR:e.size*2.8,
        color:'#fbbf24',
        life:0.9,maxLife:0.9,
        follow:e,
      });
    }
  });
  enemies=enemies.filter(e=>!e.dead);

  // Spawn — regular enemies only outside dungeons
  if(!dungeonState.active){
    spawnTimer+=dt*1000;
    const si=Math.max(1400,3000-player.level*42);
    if(spawnTimer>si){spawnTimer=0;spawnEnemy();}
    clusterTimer+=dt*1000;
    if(clusterTimer>clusterInterval){clusterTimer=0;clusterInterval=12000+Math.random()*9000;spawnCluster();}
    // Portals spawn during normal play only (never during a dungeon run)
    updatePortal(dt,now);
  } else {
    updateDungeon(now);
  }

  // Particles
  particles=particles.filter(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.soul)p.vy-=dt*38;p.vx*=0.92;p.vy*=0.92;return p.life>0;});
  dmgTexts=dmgTexts.filter(d=>{d.life-=dt;d.wy+=d.vy*dt;d.wx+=d.vx*dt;d.vy*=0.9;return d.life>0;});
  updateGroundFX(dt,now);
  if(shakeTimer>0)shakeTimer-=dt*1000;else shakeAmt*=0.75;

  camX+=(player.x-camX)*Math.min(1,dt*5.5);
  camY+=(player.y-camY)*Math.min(1,dt*5.5);

  // Periodic autosave — cheap, skip during death screen
  if(!player.isDead)maybeAutoSave(now);
}

// ═══════ RENDER ═════════════════════════════════════════
function render(now){
  let sx=0,sy=0;
  if(shakeTimer>0&&shakeAmt>0.1){sx=(Math.random()-0.5)*shakeAmt;sy=(Math.random()-0.5)*shakeAmt;}

  // Screen-space background
  drawWorld(now);

  ctx.save();
  ctx.translate(W/2-camX+sx,H/2-camY+sy);

  // Ground FX — render on the floor BEFORE entities so characters stand on top
  drawGroundFX(now);

  // Portal visual — render above ground FX but below entities
  drawPortal(now);

  // Veilmark rings on enemies (behind them)
  enemies.forEach(e=>{
    if(e.dead||e.veilmarkStacks<=0||performance.now()>e.veilmarkExpiry)return;
    const sa=e.veilmarkStacks/10;
    const ct=(performance.now()%1100)/1100;
    ctx.save();
    ctx.globalAlpha=0.4*sa;ctx.strokeStyle='#f43f5e';ctx.lineWidth=2;
    ctx.shadowColor='#f43f5e';ctx.shadowBlur=8;
    ctx.beginPath();ctx.arc(e.x,e.y,e.size*2*(1-ct*0.25),0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
    ctx.fillStyle='#f43f5e';ctx.font='bold 11px monospace';ctx.textAlign='center';
    ctx.fillText(e.veilmarkStacks,e.x,e.y-e.size-6);
    ctx.restore();
  });

  // Particles (behind entities)
  particles.forEach(p=>{
    const a=p.life/p.maxLife;
    ctx.globalAlpha=a;ctx.fillStyle=p.color;
    ctx.shadowColor=p.color;ctx.shadowBlur=p.soul?12:5;
    ctx.beginPath();ctx.arc(p.x,p.y,p.size*(p.soul?a:1),0,Math.PI*2);ctx.fill();
  });
  ctx.globalAlpha=1;ctx.shadowBlur=0;

  // Spirits
  spirits.forEach(s=>drawSpirit(s,now));

  // Enemies
  enemies.forEach(e=>{
    if(e.dead)return;
    (e.typeData?.draw||drawWraith)(e,now);
    // HP bar
    const hpP=e.hp/e.maxHp,bw=e.size*3.2;
    ctx.fillStyle='rgba(0,0,0,0.7)';ctx.beginPath();ctx.roundRect(e.x-bw/2,e.y-e.size-16,bw,6,2);ctx.fill();
    const hpColor=hpP>0.6?'#22c55e':hpP>0.3?'#f59e0b':'#ef4444';
    ctx.fillStyle=hpColor;ctx.shadowColor=hpColor;ctx.shadowBlur=4;
    ctx.beginPath();ctx.roundRect(e.x-bw/2,e.y-e.size-16,bw*hpP,6,2);ctx.fill();
    ctx.shadowBlur=0;
    if(e.isElite){
      ctx.strokeStyle='#fbbf24';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.roundRect(e.x-bw/2,e.y-e.size-16,bw,6,2);ctx.stroke();
      // Elite crown
      ctx.fillStyle='#fbbf24';ctx.shadowColor='#fbbf24';ctx.shadowBlur=6;
      ctx.font='10px serif';ctx.textAlign='center';ctx.fillText('👑',e.x,e.y-e.size-20);
      ctx.shadowBlur=0;
    }
  });

  // Player
  drawPlayer(now);

  // Damage numbers
  dmgTexts.forEach(d=>{
    const a=Math.min(1,d.life/d.maxLife*2);
    ctx.globalAlpha=a;
    ctx.font=`${d.isCrit?'bold ':''} ${d.isCrit?20:13}px 'Cinzel',serif`;
    ctx.fillStyle=d.color;ctx.textAlign='center';
    ctx.shadowColor=d.color;ctx.shadowBlur=d.isCrit?12:6;
    ctx.fillText(d.val,d.wx,d.wy);
  });
  ctx.globalAlpha=1;ctx.shadowBlur=0;

  ctx.restore();

  // ── Boss bar update ──
  if(bossTarget&&!bossTarget.dead){
    document.getElementById('bossBar').style.display='flex';
    document.getElementById('bossName').textContent=`⚔ ${bossTarget.typeData.name.toUpperCase()} — ELITE`;
    document.getElementById('bossBarFill').style.width=(bossTarget.hp/bossTarget.maxHp*100)+'%';
  } else {
    document.getElementById('bossBar').style.display='none';
    if(bossTarget&&bossTarget.dead)bossTarget=null;
  }

  updateHUD(now);
}

// ═══════ HUD UPDATE ═════════════════════════════════════
function updateHUD(now){
  document.getElementById('hpFill').style.width=(player.hp/player.maxHp*100)+'%';
  document.getElementById('xpFill').style.width=(player.xp/player.xpToNext*100)+'%';
  const sc=spirits.filter(s=>!s.dead).length;
  document.getElementById('spFill').style.width=(sc/(player.maxBonds||MAX_SPIRITS)*100)+'%';
  document.getElementById('levelBadge').textContent=`LV ${player.level}`;
  document.getElementById('hpNum').textContent=`${Math.ceil(player.hp)}`;
  document.getElementById('goldLabel').textContent=`💰 ${player.gold} G`;
  // Spirit pips
  const sp=document.getElementById('spiritPanel');sp.innerHTML='';
  const mb=player.maxBonds||MAX_SPIRITS;
  for(let i=0;i<mb;i++){const d=document.createElement('div');d.className='spip'+(i<sc?'':' dead');d.style.animationDelay=(i*0.18)+'s';sp.appendChild(d);}
  // Ability CDs
  for(let i=0;i<4;i++){
    const rem=Math.max(0,abilityCDs[i]-now),pct=rem/ABILITY_CDS[i];
    document.getElementById('ov'+i).style.height=(pct*100)+'%';
    const cdEl=document.getElementById('cd'+i);
    if(rem>0){cdEl.style.opacity='1';cdEl.textContent=Math.ceil(rem/1000)+'s';}else cdEl.style.opacity='0';
    document.getElementById('ab'+i).classList.toggle('ready',rem<=0);
  }
}

// ═══════ LOOP ════════════════════════════════════════════
function loop(ts){
  if(!running)return;
  const dt=Math.min((ts-lastTime)/1000,0.05);lastTime=ts;
  update(dt,ts);render(ts);
  requestAnimationFrame(loop);
}

// ═══════ SAVE / LOAD ═══════════════════════════════════════
// Save format is versioned. Bumping SAVE_VERSION lets us change shape later
// without breaking old saves — loadSave() gracefully handles missing fields.
const SAVE_KEY='ashenveil_save_v1';
const SAVE_VERSION=1;
let lastSaveTime=0;
const AUTOSAVE_INTERVAL=10000; // ms — save every 10s during play

function buildSave(){
  return {
    v:SAVE_VERSION,
    savedAt:Date.now(),
    player:{
      level:player.level,xp:player.xp,xpToNext:player.xpToNext,
      hp:player.hp,maxHp:player.maxHp,
      gold:player.gold,attack:player.attack,
      soulMastery:player.soulMastery,maxBonds:player.maxBonds,
    },
    stats:{kills},
    zoneId:curZone?.id||1,
    equipped:JSON.parse(JSON.stringify(equipped)), // deep clone so mutations don't corrupt save
    professions:JSON.parse(JSON.stringify(professions)),
    talents:typeof talentState!=='undefined'?JSON.parse(JSON.stringify(talentState)):null,
  };
}

function writeSave(){
  try{
    const data=buildSave();
    localStorage.setItem(SAVE_KEY,JSON.stringify(data));
    lastSaveTime=performance.now();
    return true;
  }catch(e){
    // localStorage can fail in private mode or when full — fail silent, don't crash game
    console.warn('Save failed:',e);
    return false;
  }
}

function readSave(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw)return null;
    const data=JSON.parse(raw);
    if(!data||typeof data!=='object')return null;
    if(data.v!==SAVE_VERSION)return null; // future: handle migration here
    return data;
  }catch(e){
    console.warn('Save read failed:',e);
    return null;
  }
}

function hasSave(){return readSave()!==null;}

function deleteSave(){
  try{localStorage.removeItem(SAVE_KEY);}catch(e){}
}

// Apply a loaded save to the live game state. Called from startGame when continuing.
function applySave(data){
  // Player — use `?? default` so missing fields fall back safely
  player.level=data.player?.level??1;
  player.xp=data.player?.xp??0;
  player.xpToNext=data.player?.xpToNext??xpForLevel(player.level);
  player.maxHp=data.player?.maxHp??computeMaxHp(player.level);
  player.hp=Math.min(data.player?.hp??player.maxHp,player.maxHp);
  player.gold=data.player?.gold??0;
  player.attack=data.player?.attack??computeAttack(player.level);
  player.soulMastery=data.player?.soulMastery??0;
  player.maxBonds=data.player?.maxBonds??MAX_SPIRITS;
  // Kills
  kills=data.stats?.kills??0;
  // Zone
  const zoneId=data.zoneId??1;
  curZone=ZONES.find(z=>z.id===zoneId)||ZONES[0];
  // Equipped gear
  if(data.equipped){
    Object.keys(equipped).forEach(slot=>{
      equipped[slot]=data.equipped[slot]||null;
    });
  }
  // Professions
  if(data.professions){
    Object.keys(professions).forEach(pname=>{
      const saved=data.professions[pname];
      if(saved){
        professions[pname].level=saved.level??1;
        professions[pname].xp=saved.xp??0;
        professions[pname].xpToNext=saved.xpToNext??120;
        if(saved.materials){
          Object.keys(professions[pname].materials).forEach(m=>{
            professions[pname].materials[m]=saved.materials[m]??0;
          });
        }
      }
    });
  }
  // Talents
  if(data.talents&&typeof talentState!=='undefined'){
    talentState.points=data.talents.points??0;
    talentState.pointsEarned=data.talents.pointsEarned??0;
    talentState.learned=data.talents.learned||{};
  }
  // Recalc derived stats after equipping gear
  recalcStats();
  checkSetBonuses();
}

// Hook save triggers into the game loop. Called from update() each frame.
// Saves periodically during play — cheap operation, negligible cost.
function maybeAutoSave(now){
  if(now-lastSaveTime>AUTOSAVE_INTERVAL){writeSave();}
}

// Refresh the title screen's buttons based on whether a save exists.
// Shows "Continue" + "New Game" if save present; just "Enter the Veil" if not.
function refreshTitleButtons(){
  const startBtn=document.getElementById('startBtn');
  const continueBtn=document.getElementById('continueBtn');
  const newGameBtn=document.getElementById('newGameBtn');
  if(!continueBtn||!newGameBtn||!startBtn)return;
  if(hasSave()){
    const save=readSave();
    const lv=save?.player?.level||1;
    startBtn.style.display='none';
    continueBtn.style.display='inline-block';
    newGameBtn.style.display='inline-block';
    continueBtn.textContent=`⚡ CONTINUE — LV ${lv}`;
  } else {
    startBtn.style.display='inline-block';
    continueBtn.style.display='none';
    newGameBtn.style.display='none';
  }
}

// ═══════ START ═══════════════════════════════════════════
function startGame(continueFromSave=false){
  getAC(); // unlock audio context on user gesture
  document.getElementById('titleScreen').style.display='none';
  ['hud','abilityBar','feedLog','spiritPanel','menuBar','zoneLabel','minimap'].forEach(id=>{

    document.getElementById(id).style.display=
      (id==='abilityBar'||id==='menuBar')?'flex':'block';
  });
  // Apply saved state BEFORE baseline init so baseline doesn't overwrite it
  if(continueFromSave){
    const save=readSave();
    if(save){applySave(save);}
    else {continueFromSave=false;} // save mysteriously gone — fall through to new game
  }
  if(!continueFromSave){
    // Full reset to level 1 baseline
    player.level=1;player.xp=0;player.xpToNext=xpForLevel(1);player.gold=0;
    player.soulMastery=0;player._cheatDeathUsed=false;
    kills=0;
    // Wipe equipped gear
    Object.keys(equipped).forEach(k=>{equipped[k]=null;});
    // Wipe talents
    if(typeof talentState!=='undefined'){
      talentState.points=0;talentState.pointsEarned=0;talentState.learned={};
    }
    // Recalc baseline so HP/attack are set correctly from level 1 (and talents are zero)
    if(typeof recalcStats==='function')recalcStats();
    else{player.maxHp=computeMaxHp(1);player.attack=computeAttack(1);player.maxBonds=MAX_SPIRITS;}
    player.hp=player.maxHp;
  }
  setAfkWaypoint();
  generateEnvironment();
  drawAbilityIcons();
  startMusic();
  for(let i=0;i<8;i++)setTimeout(()=>spawnEnemy(),i*400);
  running=true;lastTime=performance.now();
  requestAnimationFrame(loop);
  if(continueFromSave){
    addFeed(`✦ WELCOME BACK · LV ${player.level}`,'#c084fc');
  } else {
    addFeed('THE VEIL CALLS YOU','#c084fc');
    addFeed('WASD/Arrow keys · Q W E R abilities','#3d2555');
  }
  lastSaveTime=performance.now(); // prevent immediate auto-save on load
}

function newGameConfirm(){
  const save=readSave();
  const lv=save?.player?.level||0;
  // Only confirm if there's significant progress to lose
  if(lv>=3){
    if(!confirm(`Start a new game?\n\nYour Level ${lv} Hollowcaller will be permanently deleted.`))return;
  }
  deleteSave();
  refreshTitleButtons();
  startGame(false);
}

// ═══════ INPUT ═══════════════════════════════════════════
document.addEventListener('keydown',e=>{keys[e.key]=true;player.lastInput=performance.now();});
document.addEventListener('keyup',e=>{keys[e.key]=false;});

// ─── EMERGENCY SAVE TRIGGERS ───
// If the tab is hidden, minimized, closed, or the phone locks, save immediately.
// This catches: closing tab, switching apps on mobile, phone screen lock, browser
// backgrounded on iOS, page reload, and accidental navigation away.
// Without these, short play sessions can lose all progress between 10-second autosaves.
function emergencySave(){
  if(typeof writeSave!=='function')return;
  if(!running)return; // don't save on title screen
  writeSave();
}
// Fires when tab becomes hidden — most reliable cross-browser signal
document.addEventListener('visibilitychange',()=>{if(document.hidden)emergencySave();});
// Fires just before the page unloads — catches close/reload/navigate-away
window.addEventListener('pagehide',emergencySave);
// Fires when the browser loses focus (desktop)
window.addEventListener('blur',emergencySave);
document.getElementById('startBtn').addEventListener('click',()=>startGame(false));
// New continue/newgame buttons — only present if HTML has been updated
const _continueBtn=document.getElementById('continueBtn');
if(_continueBtn)_continueBtn.addEventListener('click',()=>startGame(true));
const _newGameBtn=document.getElementById('newGameBtn');
if(_newGameBtn)_newGameBtn.addEventListener('click',newGameConfirm);
// Paint correct buttons on page load
refreshTitleButtons();

canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  const t=e.changedTouches[0];
  if(t.clientX<W/2){joyId=t.identifier;touchJoy.startX=t.clientX;touchJoy.startY=t.clientY;touchJoy.active=true;touchJoy.dx=0;touchJoy.dy=0;}
},{passive:false});
canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  for(let i=0;i<e.changedTouches.length;i++){
    const t=e.changedTouches[i];
    if(t.identifier===joyId){const dx=t.clientX-touchJoy.startX,dy=t.clientY-touchJoy.startY,m=Math.sqrt(dx*dx+dy*dy)||1;touchJoy.dx=dx/Math.max(m,50);touchJoy.dy=dy/Math.max(m,50);player.lastInput=performance.now();}
  }
},{passive:false});
canvas.addEventListener('touchend',e=>{for(let i=0;i<e.changedTouches.length;i++)if(e.changedTouches[i].identifier===joyId){touchJoy.active=false;touchJoy.dx=0;touchJoy.dy=0;joyId=null;}});

// ════════ ZONE TRANSITIONS ════════════════════════════════════════════
function checkZone(){
  const nz=ZONES.filter(z=>player.level>=z.minLv).pop();
  if(nz&&nz.id!==curZone.id){
    if(zoneTransiting)return;zoneTransiting=true;curZone=nz;
    SFX.zoneChange();
    showZTrans(nz.name,nz.tier,nz.ambColor);
    generateEnvironment();enemies=[];
    for(let i=0;i<8;i++)setTimeout(()=>spawnEnemy(),i*350);
    addFeed('★ ZONE: '+nz.name,'#e8b84b');
    setTimeout(()=>zoneTransiting=false,2600);
  }
}
function showZTrans(name,sub,color){
  const zt=document.getElementById('zoneTransition');
  const zn=document.getElementById('lvlUpTxt'),zs=document.getElementById('lvlUpUnlock');
  // Use a dedicated overlay
  let overlay=document.getElementById('ztOverlay');
  if(!overlay){overlay=document.createElement('div');overlay.id='ztOverlay';overlay.style.cssText='position:fixed;inset:0;z-index:350;pointer-events:none;opacity:0;transition:opacity 0.6s;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px';document.body.appendChild(overlay);}
  overlay.innerHTML='<div style="font-family:Cinzel,serif;font-size:clamp(1.5rem,5vw,2.8rem);font-weight:900;letter-spacing:0.3em;color:'+color+';filter:drop-shadow(0 0 20px '+color+')">'+name+'</div><div style="font-family:Cinzel,serif;font-size:0.7rem;letter-spacing:4px;color:'+color+';opacity:0.6">'+sub+'</div>';
  overlay.style.opacity='1';setTimeout(()=>{overlay.style.opacity='0';},2400);
}

// ════════ MINIMAP ═════════════════════════════════════════════════════
let _mmT=0;
function updateMinimapZ(){
  _mmT+=16;if(_mmT<200)return;_mmT=0;
  let mc=document.getElementById('minimapCanvas');
  if(!mc){mc=document.createElement('canvas');mc.id='minimapCanvas';mc.width=80;mc.height=80;mc.style.cssText='border-radius:50%;border:1px solid rgba(192,132,252,0.16);box-shadow:0 2px 10px rgba(0,0,0,0.6)';let wrap=document.getElementById('minimap');if(!wrap){wrap=document.createElement('div');wrap.id='minimap';wrap.style.cssText='position:fixed;top:10px;right:130px;z-index:50;pointer-events:none';document.body.appendChild(wrap);}wrap.appendChild(mc);if(running)wrap.style.display='block';}
  const mx=mc.getContext('2d'),mw=80,sc=mw/WORLD_W;
  mx.clearRect(0,0,mw,mw);mx.fillStyle='rgba(5,0,15,0.9)';mx.fillRect(0,0,mw,mw);
  enemies.forEach(e=>{if(e.dead)return;mx.fillStyle=e.isElite?'#fbbf24':'#ef4444';mx.beginPath();mx.arc(e.x*sc,e.y*sc,1.5,0,Math.PI*2);mx.fill();});
  spirits.forEach(s=>{if(s.dead)return;mx.fillStyle='#9DC4B0';mx.beginPath();mx.arc(s.x*sc,s.y*sc,1.2,0,Math.PI*2);mx.fill();});
  // Portal marker — pulsing tier-color dot so player can spot it from afar
  if(portalState.active){
    const p=portalState.active;
    const pulse=0.6+0.4*Math.sin(performance.now()*0.005);
    mx.fillStyle=p.def.color;mx.shadowColor=p.def.color;mx.shadowBlur=6;
    mx.beginPath();mx.arc(p.x*sc,p.y*sc,3*pulse+1.5,0,Math.PI*2);mx.fill();
    mx.shadowBlur=0;
  }
  mx.fillStyle='#c084fc';mx.shadowColor='#c084fc';mx.shadowBlur=4;
  mx.beginPath();mx.arc(player.x*sc,player.y*sc,2.8,0,Math.PI*2);mx.fill();mx.shadowBlur=0;
}
