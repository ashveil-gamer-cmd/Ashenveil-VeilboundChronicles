// ═══════ ASHENVEIL GAME ENGINE ═══════

// ═══════════════════════════════════════════════════════════
// ASHENVEIL: VEILBOUND CHRONICLES — ENGINE v4
// Full rewrite: rich visuals, working music, smooth gameplay
// ═══════════════════════════════════════════════════════════

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

// Guard against negative-radius bugs in createRadialGradient anywhere in the
// code base. Rather than audit every one of 29 call sites, we override the
// method to clamp radii to 0 before calling the native impl. This turns a
// throw into a silent no-render for the bad frame, which is far safer.
(function(){
  const origCreateRadialGradient = ctx.createRadialGradient.bind(ctx);
  ctx.createRadialGradient = function(x0, y0, r0, x1, y1, r1){
    // Clamp any negative radius to 0 — the native API accepts 0, rejects <0
    const safeR0 = Math.max(0, r0 || 0);
    const safeR1 = Math.max(0, r1 || 0);
    return origCreateRadialGradient(x0, y0, safeR0, x1, y1, safeR1);
  };
})();

// Same guard for ctx.arc — 131 arc call sites throughout the codebase,
// and a single negative radius from ANY of them will throw and abort the
// render loop for that frame, causing a blank screen bug. Clamp to 0.
// This is the fix for "player and mobs not visible but game is running".
(function(){
  const origArc = ctx.arc.bind(ctx);
  ctx.arc = function(x, y, r, start, end, ccw){
    const safeR = Math.max(0, r || 0);
    return origArc(x, y, safeR, start, end, ccw);
  };
  // Also guard ellipse since it has a similar failure mode
  const origEllipse = ctx.ellipse.bind(ctx);
  ctx.ellipse = function(x, y, rx, ry, rot, start, end, ccw){
    const safeRx = Math.max(0, rx || 0);
    const safeRy = Math.max(0, ry || 0);
    return origEllipse(x, y, safeRx, safeRy, rot, start, end, ccw);
  };
})();

let W, H;
// WORLD_ZOOM — Scale factor for the world rendering (not UI).
// On mobile/narrow screens stays 1.0 so the existing mobile layout works.
// On desktop-sized viewports, zooms in 1.5x so the player, enemies, and
// props feel appropriately sized (not tiny) on a large monitor.
// Set on every resize.
let WORLD_ZOOM = 1.0;
function computeWorldZoom(){
  // Anything 900px or narrower (phones, tablets in portrait): no zoom
  // Anything 1200px+ (laptops, desktops): full 1.5x zoom
  // Between: lerp smoothly
  const w = window.innerWidth;
  if(w <= 900) return 1.0;
  if(w >= 1200) return 1.5;
  return 1.0 + (w - 900) / 300 * 0.5; // linear 1.0→1.5 over 900→1200
}
function resize(){
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  WORLD_ZOOM = computeWorldZoom();
}
resize(); window.addEventListener('resize',resize);


// ═══════ SPRITE SYSTEM ═══════════════════════════════
// Preloads image assets from the sprites/ folder. Each sprite is referenced by
// a short name. If an image fails to load (404, bad path), it's recorded as
// failed and render functions draw a labeled placeholder so missing files are
// immediately obvious rather than silently invisible.
//
// To add a new sprite: upload the PNG to sprites/ in GitHub with EXACTLY the
// filename listed below, then reference it by key. No code changes needed.
const SPRITE_MANIFEST = {
  // Tier 1 — essentials
  shrine_spire:      'sprites/sprite_L1_shrine_spire.png',
  obelisk_ashen:     'sprites/sprite_L2_obelisk_ashen.png',
  sarcophagus_crypts:'sprites/sprite_L3_sarcophagus_crypts.png',
  shrine_mire:       'sprites/sprite_L4_shrine_mire.png',
  tree_dead:         'sprites/sprite_L5_tree_dead.png',
  tree_living:       'sprites/sprite_L6_tree_living.png',
  boulder:           'sprites/sprite_L7_boulder.png',
  ruin_wall:         'sprites/sprite_L8_ruin_wall.png',
  // Tier 2 — density
  tree_swamp:        'sprites/sprite_L9_tree_swamp.png',
  rocks_small:       'sprites/sprite_L10_rocks_small.png',
  bones:             'sprites/sprite_L11_bones.png',
  mushrooms:         'sprites/sprite_L12_mushrooms.png',
  crystals:          'sprites/sprite_L13_crystals.png',
  log:               'sprites/sprite_L14_log.png',
  // Tier 3 — atmosphere
  pond:              'sprites/sprite_L15_pond.png',
  lava:              'sprites/sprite_L16_lava.png',
  torch:             'sprites/sprite_L17_torch.png',
  tombstone:         'sprites/sprite_L18_tombstone.png',
  // Tier 4 — dungeon flair
  pillar_crypt:      'sprites/sprite_L19_pillar_crypt.png',
  candelabra_sanctum:'sprites/sprite_L20_candelabra_sanctum.png',
  pew_cathedral:     'sprites/sprite_L21_pew_cathedral.png',
  grass_dry:         'sprites/sprite_L22_grass_dry.png',
  grass_lush:        'sprites/sprite_L23_grass_lush.png',
};

// Runtime state — populated as images load
const sprites = {};          // key → HTMLImageElement (only when loaded)
const spriteStatus = {};     // key → 'loading' | 'loaded' | 'failed'
let spritesTotal = 0;
let spritesLoaded = 0;
let spritesFailed = 0;

// Kicks off loading all sprites in the manifest. Returns a promise that
// resolves when all have either loaded or failed — game can start either way.
function loadSprites(){
  const keys = Object.keys(SPRITE_MANIFEST);
  spritesTotal = keys.length;
  spritesLoaded = 0;
  spritesFailed = 0;
  return Promise.all(keys.map(key => new Promise(resolve => {
    const img = new Image();
    spriteStatus[key] = 'loading';
    img.onload = () => {
      sprites[key] = img;
      spriteStatus[key] = 'loaded';
      spritesLoaded++;
      resolve({key, status:'loaded'});
    };
    img.onerror = () => {
      spriteStatus[key] = 'failed';
      spritesFailed++;
      // Don't spam console — failures are expected while art is being generated
      resolve({key, status:'failed'});
    };
    img.src = SPRITE_MANIFEST[key];
  })));
}

// Returns true if a sprite loaded successfully. Use this before trying to draw.
function hasSprite(key){ return spriteStatus[key] === 'loaded'; }

// Renders a sprite at world coords with optional scale/rotation.
// If the sprite isn't loaded, draws a labeled placeholder rectangle so you can
// see which ones are still missing.
// Assumes ctx is already translated to world-space by the caller.
function drawSpriteProp(key, x, y, scale = 1, rotation = 0){
  const img = sprites[key];
  if (!img || !img.width) {
    // Placeholder: dashed rectangle with filename written on it
    ctx.save();
    ctx.translate(x, y);
    const sz = 80 * scale;
    ctx.fillStyle = 'rgba(255, 80, 120, 0.25)';
    ctx.strokeStyle = 'rgba(255, 80, 120, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.fillRect(-sz/2, -sz/2, sz, sz);
    ctx.strokeRect(-sz/2, -sz/2, sz, sz);
    ctx.setLineDash([]);
    // Label so you know which file is missing
    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[missing]', 0, -4);
    ctx.fillText(key, 0, 10);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  const w = img.width * scale;
  const h = img.height * scale;
  // Soft radial blend disc beneath the sprite — darkens the procedural ground
  // in a circle around the landmark so the painted sprite doesn't sit on top
  // of the procedural world with a hard visual edge. This is the "visual bridge."
  const blendRadius = Math.max(w, h) * 0.42;
  const blend = ctx.createRadialGradient(0, h*0.25, 0, 0, h*0.25, blendRadius);
  blend.addColorStop(0, 'rgba(0,0,0,0.55)');
  blend.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  blend.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = blend;
  ctx.beginPath();
  ctx.ellipse(0, h*0.25, blendRadius, blendRadius*0.5, 0, 0, Math.PI*2);
  ctx.fill();
  // Drop shadow under sprite — tighter, darker
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(w*0.05, h*0.4, w*0.32, h*0.08, 0, 0, Math.PI*2);
  ctx.fill();
  // Draw the actual sprite centered around (x,y). The sprite's "anchor" is
  // bottom-center — the point that "touches the ground." So we shift up.
  ctx.drawImage(img, -w/2, -h + h*0.15, w, h);
  ctx.restore();
}


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

  // Ironwake icon set — 5 melee/guardian themed icons.
  // Style-matched to Hollowcaller (same iconBG helper, rune accents) but warm/red palette.
  const icons_ironwake = [
    // ═══ 0: ANCHOR STRIKE — greatsword overhead slam with shockwave ═══
    // Vertical blade buried into cracked earth, dust rising, heavy impact.
    // Reads as "heavy downward strike" at a glance.
    (x)=>{
      x.clearRect(0,0,S,S);
      iconBG(x,'#ef4444','#2a0a10','#0a0005');
      // Cracked ground at bottom — jagged lines fanning out from impact
      x.strokeStyle='#8b2e1f';x.lineWidth=1.2;x.shadowBlur=0;
      x.beginPath();
      x.moveTo(CX-18,CY+16);x.lineTo(CX-8,CY+12);x.lineTo(CX-3,CY+16);
      x.moveTo(CX+18,CY+16);x.lineTo(CX+8,CY+12);x.lineTo(CX+3,CY+16);
      x.moveTo(CX-12,CY+19);x.lineTo(CX-6,CY+15);
      x.moveTo(CX+12,CY+19);x.lineTo(CX+6,CY+15);
      x.stroke();
      // Impact dust cloud — semi-transparent ember puffs at ground level
      x.fillStyle='rgba(180,120,80,0.4)';x.shadowColor='#ff6633';x.shadowBlur=6;
      [[CX-10,CY+13,4],[CX+10,CY+13,4],[CX,CY+15,3],[CX-14,CY+11,3],[CX+14,CY+11,3]].forEach(([px,py,pr])=>{
        x.beginPath();x.arc(px,py,pr,0,Math.PI*2);x.fill();
      });
      x.shadowBlur=0;
      // Greatsword — vertical orientation, blade pointing up
      // Blade: tapered, metallic gradient, catches light on one edge
      const bladeGrad=x.createLinearGradient(CX-3,0,CX+3,0);
      bladeGrad.addColorStop(0,'#6a6a7a');
      bladeGrad.addColorStop(0.5,'#f4f4f8');
      bladeGrad.addColorStop(1,'#8a8a96');
      x.fillStyle=bladeGrad;
      x.shadowColor='#ff8866';x.shadowBlur=5;
      x.beginPath();
      x.moveTo(CX-3,CY-18);
      x.lineTo(CX-2,CY+8);
      x.lineTo(CX+2,CY+8);
      x.lineTo(CX+3,CY-18);
      x.lineTo(CX,CY-22);  // pointed tip
      x.closePath();
      x.fill();
      x.shadowBlur=0;
      // Blade highlight line — catches the light
      x.strokeStyle='rgba(255,255,255,0.7)';x.lineWidth=0.7;
      x.beginPath();x.moveTo(CX-1.5,CY-17);x.lineTo(CX-1,CY+6);x.stroke();
      // Crossguard — wide, flared, brass color
      x.fillStyle='#b8860b';
      x.shadowColor='#ffb347';x.shadowBlur=4;
      x.fillRect(CX-10,CY+7,20,4);
      // Crossguard decorative endcaps
      x.fillStyle='#8b6914';
      x.fillRect(CX-11,CY+7,2,4);
      x.fillRect(CX+9,CY+7,2,4);
      x.shadowBlur=0;
      // Crossguard top highlight
      x.strokeStyle='rgba(255,220,160,0.6)';x.lineWidth=0.5;
      x.beginPath();x.moveTo(CX-9,CY+7.5);x.lineTo(CX+9,CY+7.5);x.stroke();
      // Hilt — dark leather wrap
      x.fillStyle='#2a1810';
      x.fillRect(CX-2,CY+11,4,4);
      // Anchor cross on the blade — signature detail for this ability
      x.strokeStyle='rgba(255,220,160,0.5)';x.lineWidth=0.8;
      x.beginPath();
      x.moveTo(CX-3,CY-8);x.lineTo(CX+3,CY-8);
      x.stroke();
      // Impact sparks at tip of crossguard (strike moment)
      x.fillStyle='#fff4a0';
      x.shadowColor='#ffee88';x.shadowBlur=4;
      [[CX-12,CY+9,1.5],[CX+12,CY+9,1.5],[CX-14,CY+11,1],[CX+14,CY+11,1]].forEach(([px,py,pr])=>{
        x.beginPath();x.arc(px,py,pr,0,Math.PI*2);x.fill();
      });
    },

    // ═══ 1: BULWARK — kite shield with golden emanation ═══
    // Broad tower shield, angled to show depth, radiating divine light.
    // Reads as "defensive shield wall" immediately.
    (x)=>{
      x.clearRect(0,0,S,S);
      iconBG(x,'#d4c896','#231e10','#08060a');
      // Radial light emanation behind shield — soft golden halo
      const halo=x.createRadialGradient(CX,CY,4,CX,CY,22);
      halo.addColorStop(0,'rgba(255,240,160,0.4)');
      halo.addColorStop(0.6,'rgba(255,200,80,0.12)');
      halo.addColorStop(1,'rgba(255,200,80,0)');
      x.fillStyle=halo;
      x.beginPath();x.arc(CX,CY,22,0,Math.PI*2);x.fill();
      // Shield — tall kite shape with subtle 3D via gradient
      const shieldGrad=x.createLinearGradient(CX-13,0,CX+13,0);
      shieldGrad.addColorStop(0,'#8b6914');
      shieldGrad.addColorStop(0.4,'#d4c896');
      shieldGrad.addColorStop(0.6,'#fff4a0');
      shieldGrad.addColorStop(1,'#8b6914');
      x.fillStyle=shieldGrad;
      x.shadowColor='#ffdd66';x.shadowBlur=6;
      x.beginPath();
      x.moveTo(CX,CY-17);
      x.quadraticCurveTo(CX+13,CY-15,CX+13,CY-2);
      x.quadraticCurveTo(CX+11,CY+13,CX,CY+19);
      x.quadraticCurveTo(CX-11,CY+13,CX-13,CY-2);
      x.quadraticCurveTo(CX-13,CY-15,CX,CY-17);
      x.closePath();
      x.fill();
      x.shadowBlur=0;
      // Shield rim — darker border for definition
      x.strokeStyle='#5a4a0a';x.lineWidth=1.2;
      x.beginPath();
      x.moveTo(CX,CY-17);
      x.quadraticCurveTo(CX+13,CY-15,CX+13,CY-2);
      x.quadraticCurveTo(CX+11,CY+13,CX,CY+19);
      x.quadraticCurveTo(CX-11,CY+13,CX-13,CY-2);
      x.quadraticCurveTo(CX-13,CY-15,CX,CY-17);
      x.stroke();
      // Central vertical ridge (shield boss running top to bottom)
      x.strokeStyle='rgba(90,74,10,0.7)';x.lineWidth=0.8;
      x.beginPath();x.moveTo(CX,CY-15);x.lineTo(CX,CY+17);x.stroke();
      // Shield boss — raised center disc with jewel
      x.fillStyle='#8b6914';
      x.beginPath();x.arc(CX,CY-2,4.5,0,Math.PI*2);x.fill();
      x.fillStyle='#fff4a0';
      x.shadowColor='#fff4a0';x.shadowBlur=8;
      x.beginPath();x.arc(CX,CY-2,3,0,Math.PI*2);x.fill();
      // Boss inner gem
      x.shadowBlur=0;
      x.fillStyle='#ffb347';
      x.beginPath();x.arc(CX,CY-2,1.5,0,Math.PI*2);x.fill();
      x.fillStyle='#ffffff';
      x.beginPath();x.arc(CX-0.5,CY-2.8,0.6,0,Math.PI*2);x.fill();
      // Decorative stud rivets at cardinal points
      x.fillStyle='#b8860b';
      [[CX,CY-14],[CX+10,CY-5],[CX-10,CY-5],[CX+8,CY+9],[CX-8,CY+9]].forEach(([rx,ry])=>{
        x.beginPath();x.arc(rx,ry,1.2,0,Math.PI*2);x.fill();
      });
      // Protective light rays emanating outward — 8 short lines
      x.strokeStyle='rgba(255,244,160,0.7)';x.lineWidth=1;
      x.shadowColor='#fff4a0';x.shadowBlur=4;
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4 + Math.PI/8;
        const r1=19, r2=24;
        x.beginPath();
        x.moveTo(CX+Math.cos(a)*r1,CY+Math.sin(a)*r1);
        x.lineTo(CX+Math.cos(a)*r2,CY+Math.sin(a)*r2);
        x.stroke();
      }
      x.shadowBlur=0;
    },

    // ═══ 2: GROUND SHATTER — earth-rending stomp impact ═══
    // Warhammer head slammed into ground, radial cracks, debris chunks flying.
    // Reads as "earth-shaking AoE strike."
    (x)=>{
      x.clearRect(0,0,S,S);
      iconBG(x,'#fbbf24','#2a1a05','#080500');
      // Ground plane — horizontal shadow band
      x.fillStyle='rgba(40,25,10,0.6)';
      x.fillRect(0,CY+10,S,4);
      // Deep radial crack fissures — 6 jagged lines radiating from center
      x.strokeStyle='#b8860b';x.lineWidth=1.8;x.shadowColor='#ffaa44';x.shadowBlur=3;
      x.beginPath();
      // Draw 6 zigzag fissures
      const fissures=[
        [[-20,8],[-14,5],[-10,8],[-5,3]],
        [[20,8],[14,5],[10,8],[5,3]],
        [[-22,-4],[-16,-2],[-12,-4]],
        [[22,-4],[16,-2],[12,-4]],
        [[-6,20],[-4,14],[-2,10]],
        [[6,20],[4,14],[2,10]],
      ];
      fissures.forEach(f=>{
        x.moveTo(CX+f[0][0],CY+f[0][1]);
        f.slice(1).forEach(([dx,dy])=>x.lineTo(CX+dx,CY+dy));
      });
      x.stroke();
      x.shadowBlur=0;
      // Upturned debris chunks — irregular rock shards
      x.fillStyle='#6a5020';
      [
        [CX-16,CY+3,4,3],
        [CX+15,CY+5,3,3],
        [CX-12,CY+16,5,3],
        [CX+14,CY+14,4,3],
      ].forEach(([rx,ry,rw,rh])=>{
        x.beginPath();
        x.moveTo(rx,ry);
        x.lineTo(rx+rw,ry-1);
        x.lineTo(rx+rw+1,ry+rh);
        x.lineTo(rx-1,ry+rh);
        x.closePath();x.fill();
      });
      // Warhammer — large head dominating the upper half
      // Hammer head — trapezoidal with metallic gradient
      const hammerGrad=x.createLinearGradient(0,CY-18,0,CY-4);
      hammerGrad.addColorStop(0,'#3a3a44');
      hammerGrad.addColorStop(0.5,'#8a8a96');
      hammerGrad.addColorStop(1,'#5a5a66');
      x.fillStyle=hammerGrad;
      x.shadowColor='#ffaa44';x.shadowBlur=6;
      x.beginPath();
      x.moveTo(CX-11,CY-17);
      x.lineTo(CX+11,CY-17);
      x.lineTo(CX+13,CY-4);
      x.lineTo(CX-13,CY-4);
      x.closePath();x.fill();
      x.shadowBlur=0;
      // Hammer head top highlight
      x.strokeStyle='rgba(255,255,255,0.4)';x.lineWidth=0.8;
      x.beginPath();x.moveTo(CX-10,CY-16);x.lineTo(CX+10,CY-16);x.stroke();
      // Hammer head rivets/studs
      x.fillStyle='#2a2a34';
      [[CX-7,CY-11],[CX+7,CY-11],[CX-7,CY-7],[CX+7,CY-7]].forEach(([rx,ry])=>{
        x.beginPath();x.arc(rx,ry,1,0,Math.PI*2);x.fill();
      });
      // Haft extending down — thin wooden shaft
      x.fillStyle='#5a3c1e';
      x.fillRect(CX-2,CY-4,4,8);
      // Shockwave ring — soft golden circle pulsing outward from impact
      x.strokeStyle='rgba(251,191,36,0.7)';x.lineWidth=1.5;
      x.shadowColor='#fbbf24';x.shadowBlur=8;
      x.beginPath();x.arc(CX,CY,20,0,Math.PI*1.5);x.stroke();
      x.strokeStyle='rgba(255,244,160,0.4)';x.lineWidth=1;
      x.beginPath();x.arc(CX,CY,23,Math.PI*0.2,Math.PI*1.2);x.stroke();
      x.shadowBlur=0;
      // Center impact flash
      const flash=x.createRadialGradient(CX,CY-3,0,CX,CY-3,8);
      flash.addColorStop(0,'rgba(255,255,255,0.9)');
      flash.addColorStop(0.4,'rgba(255,244,160,0.5)');
      flash.addColorStop(1,'rgba(251,191,36,0)');
      x.fillStyle=flash;
      x.beginPath();x.arc(CX,CY-3,8,0,Math.PI*2);x.fill();
    },

    // ═══ 3: RETRIBUTION — shield with reflecting sword arcs ═══
    // Tight shield center with two curved deflection arcs (swords bouncing back)
    // plus accent sparks where blows were turned. Reads as "damage returned."
    (x)=>{
      x.clearRect(0,0,S,S);
      iconBG(x,'#a78bfa','#1a0d2e','#06020a');
      // Arcane pulse backdrop — faint purple halo
      const halo=x.createRadialGradient(CX,CY,3,CX,CY,22);
      halo.addColorStop(0,'rgba(167,139,250,0.25)');
      halo.addColorStop(1,'rgba(167,139,250,0)');
      x.fillStyle=halo;
      x.beginPath();x.arc(CX,CY,22,0,Math.PI*2);x.fill();
      // Shield — smaller, round, purple-lavender rim (reflects attacks)
      const shieldGrad=x.createRadialGradient(CX-3,CY-3,2,CX,CY,13);
      shieldGrad.addColorStop(0,'#d4bff8');
      shieldGrad.addColorStop(0.6,'#8a6ef0');
      shieldGrad.addColorStop(1,'#4a2a8a');
      x.fillStyle=shieldGrad;
      x.shadowColor='#a78bfa';x.shadowBlur=8;
      x.beginPath();x.arc(CX,CY,11,0,Math.PI*2);x.fill();
      x.shadowBlur=0;
      // Shield rim
      x.strokeStyle='#4a2a8a';x.lineWidth=1.2;
      x.beginPath();x.arc(CX,CY,11,0,Math.PI*2);x.stroke();
      // Inner boss
      x.fillStyle='#1a0d2e';
      x.beginPath();x.arc(CX,CY,5,0,Math.PI*2);x.fill();
      x.fillStyle='#a78bfa';
      x.shadowColor='#d4bff8';x.shadowBlur=5;
      x.beginPath();x.arc(CX,CY,3,0,Math.PI*2);x.fill();
      x.shadowBlur=0;
      // Center gem sparkle
      x.fillStyle='#ffffff';
      x.beginPath();x.arc(CX-0.8,CY-0.8,0.8,0,Math.PI*2);x.fill();
      // Deflection arcs — four curved paths showing attacks bouncing off
      x.strokeStyle='#c4b5fd';x.lineWidth=1.8;
      x.shadowColor='#a78bfa';x.shadowBlur=6;
      // Top-left incoming → deflected up-left
      x.beginPath();
      x.moveTo(CX-22,CY-18);
      x.quadraticCurveTo(CX-14,CY-14,CX-22,CY-4);
      x.stroke();
      // Top-right incoming → deflected up-right
      x.beginPath();
      x.moveTo(CX+22,CY-18);
      x.quadraticCurveTo(CX+14,CY-14,CX+22,CY-4);
      x.stroke();
      // Bottom-left
      x.beginPath();
      x.moveTo(CX-22,CY+18);
      x.quadraticCurveTo(CX-14,CY+14,CX-22,CY+4);
      x.stroke();
      // Bottom-right
      x.beginPath();
      x.moveTo(CX+22,CY+18);
      x.quadraticCurveTo(CX+14,CY+14,CX+22,CY+4);
      x.stroke();
      x.shadowBlur=0;
      // Arrowheads at the deflected tips — showing the damage returning
      x.fillStyle='#c4b5fd';
      x.shadowColor='#a78bfa';x.shadowBlur=4;
      const arrows=[[-22,-4,-1,0.3],[22,-4,1,0.3],[-22,4,-1,-0.3],[22,4,1,-0.3]];
      arrows.forEach(([ax,ay,dx,dy])=>{
        x.beginPath();
        x.moveTo(CX+ax,CY+ay);
        x.lineTo(CX+ax-dx*3,CY+ay-dy*3-2);
        x.lineTo(CX+ax-dx*3,CY+ay-dy*3+2);
        x.closePath();x.fill();
      });
      x.shadowBlur=0;
      // Deflection sparks at shield rim — four small bursts where blows struck
      x.fillStyle='#fff4a0';
      x.shadowColor='#fff4a0';x.shadowBlur=3;
      [[CX-10,CY-6],[CX+10,CY-6],[CX-10,CY+6],[CX+10,CY+6]].forEach(([px,py])=>{
        x.beginPath();x.arc(px,py,1.2,0,Math.PI*2);x.fill();
      });
    },

    // ═══ 4: IRONWAKE'S FURY — armored berserker mid-charge ═══
    // Figure leaning forward with weapon raised, motion lines, fire trail.
    // Reads as "devastating forward charge."
    (x)=>{
      x.clearRect(0,0,S,S);
      iconBG(x,'#ff4400','#2a0a00','#0a0300');
      // Fire trail behind — flame licks streaming from bottom-left
      x.shadowColor='#ff6600';x.shadowBlur=6;
      // Larger flame shapes
      const flameGrad=x.createLinearGradient(2,CY+8,18,CY);
      flameGrad.addColorStop(0,'rgba(255,68,0,0.7)');
      flameGrad.addColorStop(0.5,'rgba(255,160,40,0.5)');
      flameGrad.addColorStop(1,'rgba(255,68,0,0)');
      x.fillStyle=flameGrad;
      x.beginPath();
      x.moveTo(4,CY+10);
      x.quadraticCurveTo(8,CY-2,16,CY-4);
      x.quadraticCurveTo(14,CY+4,10,CY+8);
      x.quadraticCurveTo(8,CY+14,4,CY+10);
      x.closePath();x.fill();
      // Smaller flame wisps
      x.fillStyle='rgba(255,100,20,0.5)';
      [[6,CY-2,3],[10,CY+3,2],[3,CY+6,2.5]].forEach(([fx,fy,fr])=>{
        x.beginPath();
        x.moveTo(fx-fr,fy);
        x.quadraticCurveTo(fx,fy-fr*2,fx+fr,fy);
        x.closePath();x.fill();
      });
      x.shadowBlur=0;
      // Motion blur streaks — horizontal lines behind figure
      x.strokeStyle='rgba(255,68,0,0.35)';x.lineWidth=1;
      for(let i=0;i<4;i++){
        x.beginPath();
        x.moveTo(2,CY-6+i*4);
        x.lineTo(14-i*2,CY-6+i*4);
        x.stroke();
      }
      // Armored figure — forward-leaning warrior with raised weapon
      x.save();
      x.translate(CX+4,CY);
      x.rotate(0.18); // forward lean — charging posture
      // Helm — conical, faceplate shadowed
      const helmGrad=x.createLinearGradient(-5,-20,5,-12);
      helmGrad.addColorStop(0,'#5a4028');
      helmGrad.addColorStop(0.5,'#8b6914');
      helmGrad.addColorStop(1,'#5a4028');
      x.fillStyle=helmGrad;
      x.shadowColor='#ff6600';x.shadowBlur=6;
      x.beginPath();
      x.moveTo(-5,-10);
      x.quadraticCurveTo(-5,-20,0,-22);
      x.quadraticCurveTo(5,-20,5,-10);
      x.closePath();x.fill();
      x.shadowBlur=0;
      // Helm slit — dark eye gap
      x.fillStyle='#0a0500';
      x.fillRect(-3,-14,6,2);
      // Helm glow from slit
      x.fillStyle='#ff4400';
      x.shadowColor='#ff4400';x.shadowBlur=3;
      x.fillRect(-3,-14,6,1);
      x.shadowBlur=0;
      // Torso armor — layered plates
      const torsoGrad=x.createLinearGradient(-7,0,7,0);
      torsoGrad.addColorStop(0,'#4a2818');
      torsoGrad.addColorStop(0.5,'#8b4a2a');
      torsoGrad.addColorStop(1,'#4a2818');
      x.fillStyle=torsoGrad;
      x.beginPath();
      x.moveTo(-6,-10);
      x.lineTo(6,-10);
      x.lineTo(7,6);
      x.lineTo(-7,6);
      x.closePath();x.fill();
      // Chest plate central rune — fiery mark
      x.fillStyle='#ff4400';
      x.shadowColor='#ff4400';x.shadowBlur=5;
      x.beginPath();
      x.moveTo(0,-6);x.lineTo(2,-2);x.lineTo(0,2);x.lineTo(-2,-2);
      x.closePath();x.fill();
      x.shadowBlur=0;
      // Shoulder pauldrons — spiked
      x.fillStyle='#3a1810';
      x.beginPath();
      x.moveTo(-8,-10);x.lineTo(-10,-6);x.lineTo(-6,-4);
      x.closePath();x.fill();
      x.beginPath();
      x.moveTo(8,-10);x.lineTo(10,-6);x.lineTo(6,-4);
      x.closePath();x.fill();
      // Sword raised forward — dynamic diagonal
      x.strokeStyle='#d4c896';x.lineWidth=2.5;
      x.shadowColor='#fff4a0';x.shadowBlur=5;
      x.beginPath();
      x.moveTo(3,-2);
      x.lineTo(16,-14);
      x.stroke();
      // Sword tip flare — bright gold spark
      x.fillStyle='#fff4a0';
      x.shadowColor='#fff4a0';x.shadowBlur=6;
      x.beginPath();x.arc(16,-14,2.2,0,Math.PI*2);x.fill();
      x.shadowBlur=0;
      // Sword pommel
      x.fillStyle='#8b6914';
      x.fillRect(2,-1,2,3);
      x.restore();
      // Fire burst at the leading edge — impact ready to explode
      x.fillStyle='#fff4a0';
      x.shadowColor='#ffee88';x.shadowBlur=5;
      [[CX+18,CY-11,2.5],[CX+20,CY-7,2],[CX+19,CY-3,3],[CX+22,CY-9,1.5]].forEach(([px,py,pr])=>{
        x.beginPath();x.arc(px,py,pr,0,Math.PI*2);x.fill();
      });
    },
  ];

  // Pick the icon set based on current class
  const activeIcons = (player.classId === 'ironwake') ? icons_ironwake : icons;
  const cls = CLASS_DEFS[player.classId] || CLASS_DEFS.hollowcaller;

  for(let i=0;i<5;i++){
    const c=document.getElementById('ic'+i);
    if(c){
      const x=c.getContext('2d');
      // reset any inherited state from previous frame
      x.setTransform(1,0,0,1,0,0);
      x.globalAlpha=1;x.shadowBlur=0;
      activeIcons[i](x);
    }
    // Update the ability label under the icon
    const lbl=document.getElementById('abName'+i);
    if(lbl && cls.abilities[i]){
      lbl.textContent = cls.abilities[i].name;
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════
// GEAR ICON SYSTEM — Hand-crafted Canvas2D icons for each equipment slot.
// ═══════════════════════════════════════════════════════════════════════
// Each gear slot gets its own detailed icon, designed in the same visual
// language as the ability icons: layered background vignette, colored inner
// glow, thin outer frame ring, then custom shapes representing the item.
//
// Rarity is expressed through the frame/glow color and intensity, plus
// subtle overlays at higher rarities (legendary gets gem accents, mythic
// gets animated embers).
//
// Usage:
//   const canvas = document.createElement('canvas');
//   canvas.width = 52; canvas.height = 52;
//   drawGearIcon(canvas, 'Weapon', 'epic');
//
// Icons are drawn once at request time (not per frame) — the calling code
// should cache the canvas in the DOM after drawing.

// Rarity → { color, bgInner, bgOuter, glowIntensity, overlay } mapping.
// Frame color matches the rarity palette used everywhere else in the game.
const GEAR_RARITY_STYLE = {
  common:    { color:'#b8b8c8', bgInner:'#1a1a26', bgOuter:'#05050d', glow:0.35, hasGem:false, hasEmber:false },
  uncommon:  { color:'#3dd574', bgInner:'#0d1f14', bgOuter:'#030a06', glow:0.55, hasGem:false, hasEmber:false },
  rare:      { color:'#60a5fa', bgInner:'#0e1428', bgOuter:'#03050d', glow:0.70, hasGem:false, hasEmber:false },
  epic:      { color:'#c084fc', bgInner:'#1a0d2e', bgOuter:'#05020d', glow:0.85, hasGem:true,  hasEmber:false },
  legendary: { color:'#fbbf24', bgInner:'#2a1a05', bgOuter:'#0a0603', glow:1.00, hasGem:true,  hasEmber:false },
  mythic:    { color:'#ff6b6b', bgInner:'#2a0a0a', bgOuter:'#0a0303', glow:1.20, hasGem:true,  hasEmber:true  },
};

// Slot → draw function. Each takes (ctx, size, rarityColor). The rarity
// color is pre-applied to the background/glow by the caller; the slot
// function only draws the object itself.
const GEAR_ICON_DRAWERS = {

  // ═══ WEAPON — An upright longsword, diagonal-tipped for readability. ═══
  // Straight orientation reads more clearly at 44px than a diagonal curve.
  // Centered blade with prominent crossguard and pommel for iconic silhouette.
  Weapon: (x, S, rc) => {
    const CX=S/2, CY=S/2;
    // Blade shadow
    x.fillStyle = 'rgba(0,0,0,0.5)';
    x.beginPath();
    x.moveTo(CX-2.5, CY-16);
    x.lineTo(CX-3, CY+6);
    x.lineTo(CX+3, CY+6);
    x.lineTo(CX+2.5, CY-16);
    x.lineTo(CX, CY-20);
    x.closePath();
    x.fill();
    // Blade — bright metallic gradient (top is bright, tapering to darker)
    const bladeGrad = x.createLinearGradient(CX-3, 0, CX+3, 0);
    bladeGrad.addColorStop(0, '#6a6a7a');
    bladeGrad.addColorStop(0.4, '#d8d8e0');
    bladeGrad.addColorStop(0.55, '#ffffff');
    bladeGrad.addColorStop(0.7, '#d8d8e0');
    bladeGrad.addColorStop(1, '#6a6a7a');
    x.fillStyle = bladeGrad;
    x.shadowColor = '#ffffff'; x.shadowBlur = 5;
    x.beginPath();
    x.moveTo(CX-2.5, CY-16);
    x.lineTo(CX-3, CY+6);
    x.lineTo(CX+3, CY+6);
    x.lineTo(CX+2.5, CY-16);
    x.lineTo(CX, CY-20);  // pointed tip
    x.closePath();
    x.fill();
    x.shadowBlur = 0;
    // Blade fuller (the groove down the center) — subtle dark line
    x.strokeStyle = 'rgba(40,40,60,0.4)';
    x.lineWidth = 0.8;
    x.beginPath();
    x.moveTo(CX, CY-18);
    x.lineTo(CX, CY+4);
    x.stroke();
    // Blade tip highlight
    x.strokeStyle = 'rgba(255,255,255,0.7)';
    x.lineWidth = 0.6;
    x.beginPath();
    x.moveTo(CX-1, CY-16);
    x.lineTo(CX-0.5, CY-19);
    x.stroke();
    // Crossguard — wide horizontal bar with rarity-tinted endcaps
    x.fillStyle = '#2a1a08';
    x.fillRect(CX-12, CY+6, 24, 4);
    // Crossguard flare at ends (rarity-colored)
    x.fillStyle = rc;
    x.shadowColor = rc; x.shadowBlur = 6;
    x.fillRect(CX-13, CY+6, 2, 4);
    x.fillRect(CX+11, CY+6, 2, 4);
    x.shadowBlur = 0;
    // Crossguard top highlight
    x.strokeStyle = 'rgba(212, 180, 140, 0.5)';
    x.lineWidth = 0.6;
    x.beginPath();
    x.moveTo(CX-11, CY+6.5);
    x.lineTo(CX+11, CY+6.5);
    x.stroke();
    // Grip — wrapped handle below crossguard
    x.fillStyle = '#3a2410';
    x.fillRect(CX-2, CY+10, 4, 6);
    // Grip wrap stripes
    x.strokeStyle = '#1a0c04';
    x.lineWidth = 0.6;
    for(let i=0; i<3; i++){
      x.beginPath();
      x.moveTo(CX-2, CY+11 + i*2);
      x.lineTo(CX+2, CY+12 + i*2);
      x.stroke();
    }
    // Pommel — round jewel at bottom
    x.fillStyle = rc;
    x.shadowColor = rc; x.shadowBlur = 8;
    x.beginPath(); x.arc(CX, CY+18, 3, 0, Math.PI*2); x.fill();
    x.shadowBlur = 0;
    // Pommel highlight
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(CX-1, CY+17, 1, 0, Math.PI*2); x.fill();
  },

  // ═══ HELMET — Hooded silhouette suggesting the Veil-touched. ═══
  // A pointed hood with shadowed interior rather than a generic metal helm —
  // fits the occult theme. Could evolve into crown/helm variants later.
  Helmet: (x, S, rc) => {
    const CX=S/2, CY=S/2;
    // Hood outer silhouette — tall pointed shape
    x.fillStyle = '#1a1220';
    x.shadowColor = rc; x.shadowBlur = 10;
    x.beginPath();
    x.moveTo(CX, CY-18);              // peak of hood
    x.quadraticCurveTo(CX+14, CY-10, CX+16, CY+4);  // right outer
    x.quadraticCurveTo(CX+14, CY+12, CX+12, CY+14); // right drape
    x.lineTo(CX-12, CY+14);                          // bottom
    x.quadraticCurveTo(CX-14, CY+12, CX-16, CY+4);  // left drape
    x.quadraticCurveTo(CX-14, CY-10, CX, CY-18);    // left to peak
    x.closePath();
    x.fill();
    x.shadowBlur = 0;
    // Hood rim — rarity-colored trim
    x.strokeStyle = rc;
    x.lineWidth = 1.4;
    x.shadowColor = rc; x.shadowBlur = 6;
    x.beginPath();
    x.moveTo(CX, CY-18);
    x.quadraticCurveTo(CX+14, CY-10, CX+16, CY+4);
    x.moveTo(CX, CY-18);
    x.quadraticCurveTo(CX-14, CY-10, CX-16, CY+4);
    x.stroke();
    x.shadowBlur = 0;
    // Inner darkness — hood interior shadow
    x.fillStyle = 'rgba(0,0,0,0.85)';
    x.beginPath();
    x.moveTo(CX, CY-10);
    x.quadraticCurveTo(CX+9, CY-4, CX+10, CY+6);
    x.lineTo(CX-10, CY+6);
    x.quadraticCurveTo(CX-9, CY-4, CX, CY-10);
    x.closePath();
    x.fill();
    // Glowing eyes inside — two pinpricks
    x.fillStyle = rc;
    x.shadowColor = rc; x.shadowBlur = 4;
    x.beginPath(); x.arc(CX-3, CY-1, 1.2, 0, Math.PI*2); x.fill();
    x.beginPath(); x.arc(CX+3, CY-1, 1.2, 0, Math.PI*2); x.fill();
    // Bright inner dot for life
    x.shadowBlur = 0;
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(CX-3, CY-1.2, 0.4, 0, Math.PI*2); x.fill();
    x.beginPath(); x.arc(CX+3, CY-1.2, 0.4, 0, Math.PI*2); x.fill();
    // Top peak jewel — small gem at the hood's point
    x.fillStyle = rc;
    x.shadowColor = rc; x.shadowBlur = 5;
    x.beginPath(); x.arc(CX, CY-16.5, 1.4, 0, Math.PI*2); x.fill();
  },

  // ═══ CHEST — Layered armor plates with rune-etched breastplate. ═══
  Chest: (x, S, rc) => {
    const CX=S/2, CY=S/2;
    // Shoulder pauldrons — curved shapes on either side
    x.fillStyle = '#3a3040';
    x.shadowColor = rc; x.shadowBlur = 6;
    // Left pauldron
    x.beginPath();
    x.moveTo(CX-16, CY-10);
    x.quadraticCurveTo(CX-20, CY-6, CX-18, CY);
    x.quadraticCurveTo(CX-14, CY-2, CX-10, CY-8);
    x.closePath();
    x.fill();
    // Right pauldron
    x.beginPath();
    x.moveTo(CX+16, CY-10);
    x.quadraticCurveTo(CX+20, CY-6, CX+18, CY);
    x.quadraticCurveTo(CX+14, CY-2, CX+10, CY-8);
    x.closePath();
    x.fill();
    // Breastplate main body — trapezoidal shape with metallic gradient
    const plateGrad = x.createLinearGradient(0, CY-12, 0, CY+16);
    plateGrad.addColorStop(0, '#5a5060');
    plateGrad.addColorStop(0.4, '#7a708a');
    plateGrad.addColorStop(0.7, '#4a4058');
    plateGrad.addColorStop(1, '#2a2030');
    x.fillStyle = plateGrad;
    x.shadowBlur = 0;
    x.beginPath();
    x.moveTo(CX-12, CY-10);
    x.lineTo(CX+12, CY-10);
    x.quadraticCurveTo(CX+14, CY, CX+10, CY+16);
    x.lineTo(CX-10, CY+16);
    x.quadraticCurveTo(CX-14, CY, CX-12, CY-10);
    x.closePath();
    x.fill();
    // Plate edge highlight
    x.strokeStyle = 'rgba(255,255,255,0.3)';
    x.lineWidth = 0.8;
    x.beginPath();
    x.moveTo(CX-11, CY-9);
    x.lineTo(CX+11, CY-9);
    x.stroke();
    // Central rune channel — vertical groove down the middle
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.fillRect(CX-1.5, CY-8, 3, 20);
    // Rune glow — three small circles down the channel
    x.fillStyle = rc;
    x.shadowColor = rc; x.shadowBlur = 5;
    x.beginPath(); x.arc(CX, CY-4, 1.3, 0, Math.PI*2); x.fill();
    x.beginPath(); x.arc(CX, CY+2, 1.3, 0, Math.PI*2); x.fill();
    x.beginPath(); x.arc(CX, CY+8, 1.3, 0, Math.PI*2); x.fill();
    // Rivets along the edges
    x.shadowBlur = 0;
    x.fillStyle = '#1a1018';
    [[CX-10, CY-6], [CX+10, CY-6], [CX-9, CY+4], [CX+9, CY+4], [CX-8, CY+12], [CX+8, CY+12]]
      .forEach(([rx, ry]) => {
        x.beginPath(); x.arc(rx, ry, 1, 0, Math.PI*2); x.fill();
      });
    // Neckline V-cut
    x.fillStyle = 'rgba(0,0,0,0.5)';
    x.beginPath();
    x.moveTo(CX-4, CY-10);
    x.lineTo(CX, CY-5);
    x.lineTo(CX+4, CY-10);
    x.closePath();
    x.fill();
  },

  // ═══ GLOVES — A gauntlet catching light, fingers splayed. ═══
  Gloves: (x, S, rc) => {
    const CX=S/2, CY=S/2;
    x.save();
    x.translate(CX, CY);
    x.rotate(-0.25); // slight diagonal so it doesn't read as a flat hand
    // Forearm cuff / bracer
    x.fillStyle = '#3a2820';
    x.shadowColor = rc; x.shadowBlur = 6;
    x.beginPath();
    x.moveTo(-10, 8);
    x.lineTo(8, 12);
    x.lineTo(8, 16);
    x.lineTo(-10, 12);
    x.closePath();
    x.fill();
    // Bracer trim — rarity-colored band
    x.fillStyle = rc;
    x.fillRect(-10, 12, 18, 1.4);
    x.shadowBlur = 0;
    // Back of hand — main armor plate
    const handGrad = x.createLinearGradient(-4, -12, 6, 8);
    handGrad.addColorStop(0, '#5a4a3a');
    handGrad.addColorStop(0.5, '#7a6a5a');
    handGrad.addColorStop(1, '#3a2a1a');
    x.fillStyle = handGrad;
    x.beginPath();
    x.moveTo(-8, 8);
    x.quadraticCurveTo(-6, -4, 0, -8);
    x.quadraticCurveTo(6, -4, 8, 8);
    x.closePath();
    x.fill();
    // Fingers — four segmented plates rising from the hand
    x.fillStyle = '#4a3a2a';
    const fingerData = [[-6, -8, -5, -14], [-2, -10, -1, -16], [2, -10, 3, -16], [6, -8, 7, -14]];
    fingerData.forEach(([fx1, fy1, fx2, fy2]) => {
      x.beginPath();
      x.moveTo(fx1, fy1);
      x.lineTo(fx1+2, fy1);
      x.lineTo(fx2+1, fy2);
      x.lineTo(fx2-1, fy2);
      x.closePath();
      x.fill();
    });
    // Knuckle studs — small rivets on each finger
    x.fillStyle = rc;
    x.shadowColor = rc; x.shadowBlur = 4;
    [[-5, -10], [-1, -12], [3, -12], [7, -10]].forEach(([rx, ry]) => {
      x.beginPath(); x.arc(rx, ry, 1, 0, Math.PI*2); x.fill();
    });
    // Palm gem — centerpiece on back of hand
    x.shadowBlur = 6;
    x.fillStyle = rc;
    x.beginPath(); x.arc(0, -1, 2, 0, Math.PI*2); x.fill();
    x.fillStyle = '#ffffff';
    x.shadowBlur = 0;
    x.beginPath(); x.arc(-0.5, -1.5, 0.6, 0, Math.PI*2); x.fill();
    x.restore();
  },

  // ═══ BOOTS — A greaved boot in side profile, sole visible. ═══
  Boots: (x, S, rc) => {
    const CX=S/2, CY=S/2;
    // Boot shadow
    x.fillStyle = 'rgba(0,0,0,0.5)';
    x.beginPath();
    x.ellipse(CX, CY+15, 14, 2, 0, 0, Math.PI*2);
    x.fill();
    // Boot body — L-shape in profile
    const bootGrad = x.createLinearGradient(0, CY-12, 0, CY+14);
    bootGrad.addColorStop(0, '#5a4030');
    bootGrad.addColorStop(0.6, '#3a2418');
    bootGrad.addColorStop(1, '#1a0f08');
    x.fillStyle = bootGrad;
    x.shadowColor = rc; x.shadowBlur = 6;
    x.beginPath();
    // Top of boot (shin opening)
    x.moveTo(CX-7, CY-14);
    x.lineTo(CX-3, CY-14);
    // Down the back of calf
    x.lineTo(CX-3, CY+8);
    // Heel out
    x.lineTo(CX-10, CY+8);
    x.lineTo(CX-12, CY+12);
    // Sole
    x.lineTo(CX+10, CY+12);
    // Toe
    x.quadraticCurveTo(CX+14, CY+10, CX+10, CY+6);
    // Front of boot up
    x.lineTo(CX+4, CY+6);
    // Ankle
    x.quadraticCurveTo(CX+2, CY, CX+2, CY-14);
    x.lineTo(CX-7, CY-14);
    x.closePath();
    x.fill();
    x.shadowBlur = 0;
    // Sole — darker band at bottom
    x.fillStyle = '#0a0604';
    x.fillRect(CX-12, CY+11, 24, 2);
    // Cuff — rarity-tinted band at top of boot
    x.fillStyle = rc;
    x.shadowColor = rc; x.shadowBlur = 5;
    x.fillRect(CX-7, CY-14, 9, 2);
    x.shadowBlur = 0;
    // Lace cross-detail on ankle
    x.strokeStyle = 'rgba(212, 180, 140, 0.7)';
    x.lineWidth = 0.7;
    for(let i=0; i<3; i++){
      x.beginPath();
      x.moveTo(CX-2, CY-8+i*4);
      x.lineTo(CX+2, CY-6+i*4);
      x.stroke();
      x.beginPath();
      x.moveTo(CX-2, CY-6+i*4);
      x.lineTo(CX+2, CY-8+i*4);
      x.stroke();
    }
    // Buckle on side — small gem detail
    x.fillStyle = rc;
    x.shadowColor = rc; x.shadowBlur = 4;
    x.beginPath(); x.arc(CX-4, CY+1, 1.5, 0, Math.PI*2); x.fill();
    x.shadowBlur = 0;
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(CX-4.4, CY+0.6, 0.5, 0, Math.PI*2); x.fill();
  },

  // ═══ BELT — A leather belt with central gemmed buckle. ═══
  Belt: (x, S, rc) => {
    const CX=S/2, CY=S/2;
    // Belt main strap — horizontal band
    const beltGrad = x.createLinearGradient(0, CY-6, 0, CY+6);
    beltGrad.addColorStop(0, '#5a3818');
    beltGrad.addColorStop(0.5, '#3a2410');
    beltGrad.addColorStop(1, '#1a0e05');
    x.fillStyle = beltGrad;
    x.shadowColor = rc; x.shadowBlur = 6;
    x.beginPath();
    x.moveTo(CX-20, CY-5);
    x.lineTo(CX+20, CY-5);
    x.quadraticCurveTo(CX+21, CY, CX+20, CY+5);
    x.lineTo(CX-20, CY+5);
    x.quadraticCurveTo(CX-21, CY, CX-20, CY-5);
    x.closePath();
    x.fill();
    x.shadowBlur = 0;
    // Leather stitching along top/bottom edges
    x.strokeStyle = '#2a1a0a';
    x.lineWidth = 0.5;
    for(let i=-18; i<=18; i+=4){
      x.beginPath(); x.moveTo(CX+i, CY-4); x.lineTo(CX+i+1.5, CY-4); x.stroke();
      x.beginPath(); x.moveTo(CX+i, CY+4); x.lineTo(CX+i+1.5, CY+4); x.stroke();
    }
    // Central metal buckle — ornate square frame
    x.fillStyle = '#3a2a1a';
    x.fillRect(CX-8, CY-8, 16, 16);
    // Buckle inner darker recess
    x.fillStyle = '#1a1008';
    x.fillRect(CX-6, CY-6, 12, 12);
    // Buckle frame — rarity-colored metal
    x.strokeStyle = rc;
    x.lineWidth = 2;
    x.shadowColor = rc; x.shadowBlur = 6;
    x.strokeRect(CX-8, CY-8, 16, 16);
    // Central gem
    x.shadowBlur = 10;
    x.fillStyle = rc;
    x.beginPath();
    // Faceted diamond shape
    x.moveTo(CX, CY-5);
    x.lineTo(CX+5, CY);
    x.lineTo(CX, CY+5);
    x.lineTo(CX-5, CY);
    x.closePath();
    x.fill();
    // Gem highlights — white facet reflections
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,0.7)';
    x.beginPath();
    x.moveTo(CX-2, CY-2);
    x.lineTo(CX+1, CY-3);
    x.lineTo(CX, CY);
    x.closePath();
    x.fill();
    // Small accent rivets on the strap ends
    x.fillStyle = rc;
    x.shadowColor = rc; x.shadowBlur = 3;
    x.beginPath(); x.arc(CX-16, CY, 1.2, 0, Math.PI*2); x.fill();
    x.beginPath(); x.arc(CX+16, CY, 1.2, 0, Math.PI*2); x.fill();
  },

  // ═══ RING — A single ornate ring with gem center, seen face-on. ═══
  Ring: (x, S, rc) => {
    const CX=S/2, CY=S/2;
    // Ring outer shadow
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.beginPath(); x.arc(CX+1, CY+2, 14, 0, Math.PI*2); x.fill();
    // Ring band — metal torus
    const bandGrad = x.createRadialGradient(CX, CY, 10, CX, CY, 14);
    bandGrad.addColorStop(0, '#5a4a3a');
    bandGrad.addColorStop(0.5, '#8a7a5a');
    bandGrad.addColorStop(0.8, '#d4b878');
    bandGrad.addColorStop(1, '#5a4018');
    x.strokeStyle = bandGrad;
    x.lineWidth = 4;
    x.shadowColor = rc; x.shadowBlur = 8;
    x.beginPath();
    x.arc(CX, CY, 12, 0, Math.PI*2);
    x.stroke();
    x.shadowBlur = 0;
    // Inner edge highlight
    x.strokeStyle = 'rgba(255,240,200,0.4)';
    x.lineWidth = 1;
    x.beginPath();
    x.arc(CX, CY, 10, Math.PI*0.3, Math.PI*1.2);
    x.stroke();
    // Ornamental filigree — small decorative marks at cardinal points
    x.fillStyle = '#3a2a1a';
    [[CX-14, CY], [CX+14, CY], [CX, CY-14], [CX, CY+14]].forEach(([fx, fy]) => {
      x.beginPath(); x.arc(fx, fy, 1.5, 0, Math.PI*2); x.fill();
    });
    // Setting (prongs) around the gem
    x.strokeStyle = '#2a1a0a';
    x.lineWidth = 1.2;
    const prongs = [[-4, -4], [4, -4], [-4, 4], [4, 4]];
    prongs.forEach(([px, py]) => {
      x.beginPath();
      x.moveTo(CX+px, CY+py);
      x.lineTo(CX+px*0.5, CY+py*0.5);
      x.stroke();
    });
    // Central gemstone — multi-facet radial
    x.shadowColor = rc; x.shadowBlur = 12;
    const gemGrad = x.createRadialGradient(CX-1, CY-1, 0, CX, CY, 6);
    gemGrad.addColorStop(0, '#ffffff');
    gemGrad.addColorStop(0.3, rc);
    gemGrad.addColorStop(1, rc.replace('#','#') + '88');
    x.fillStyle = rc;
    // Diamond cut shape
    x.beginPath();
    x.moveTo(CX, CY-6);
    x.lineTo(CX+5, CY-2);
    x.lineTo(CX+4, CY+5);
    x.lineTo(CX-4, CY+5);
    x.lineTo(CX-5, CY-2);
    x.closePath();
    x.fill();
    // Gem highlight — sparkle
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath();
    x.moveTo(CX-2, CY-3);
    x.lineTo(CX, CY-4);
    x.lineTo(CX+1, CY-1);
    x.lineTo(CX-1, CY);
    x.closePath();
    x.fill();
    // Additional tiny sparkle
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(CX+2, CY+2, 0.5, 0, Math.PI*2); x.fill();
  },

  // ═══ AMULET — A pendant on a chain, gem centered. ═══
  Amulet: (x, S, rc) => {
    const CX=S/2, CY=S/2;
    // Chain — arc of small links across the top
    x.strokeStyle = '#7a6a4a';
    x.lineWidth = 1.4;
    x.beginPath();
    x.arc(CX, CY+4, 16, Math.PI*1.1, Math.PI*1.9);
    x.stroke();
    // Individual chain links
    x.fillStyle = '#8a7a5a';
    for(let a=Math.PI*1.15; a<Math.PI*1.85; a+=Math.PI*0.08){
      const lx = CX + Math.cos(a)*16;
      const ly = CY+4 + Math.sin(a)*16;
      x.beginPath(); x.arc(lx, ly, 1.2, 0, Math.PI*2); x.fill();
    }
    // Pendant housing — outer ornamental shape
    x.fillStyle = '#3a2a1a';
    x.shadowColor = rc; x.shadowBlur = 10;
    x.beginPath();
    // Teardrop / shield pendant shape
    x.moveTo(CX, CY-9);
    x.quadraticCurveTo(CX+10, CY-7, CX+9, CY+4);
    x.quadraticCurveTo(CX+6, CY+14, CX, CY+16);
    x.quadraticCurveTo(CX-6, CY+14, CX-9, CY+4);
    x.quadraticCurveTo(CX-10, CY-7, CX, CY-9);
    x.closePath();
    x.fill();
    x.shadowBlur = 0;
    // Metal rim — rarity-tinted edge
    x.strokeStyle = rc;
    x.lineWidth = 1.6;
    x.shadowColor = rc; x.shadowBlur = 6;
    x.beginPath();
    x.moveTo(CX, CY-9);
    x.quadraticCurveTo(CX+10, CY-7, CX+9, CY+4);
    x.quadraticCurveTo(CX+6, CY+14, CX, CY+16);
    x.quadraticCurveTo(CX-6, CY+14, CX-9, CY+4);
    x.quadraticCurveTo(CX-10, CY-7, CX, CY-9);
    x.stroke();
    x.shadowBlur = 0;
    // Bail — the loop at top that holds the chain
    x.fillStyle = '#8a7a5a';
    x.beginPath();
    x.ellipse(CX, CY-11, 2.5, 2, 0, 0, Math.PI*2);
    x.fill();
    x.strokeStyle = '#3a2a1a';
    x.lineWidth = 0.8;
    x.stroke();
    // Central gem — large oval stone filling most of the pendant
    const gemGrad = x.createRadialGradient(CX-1, CY+1, 0, CX, CY+3, 7);
    gemGrad.addColorStop(0, '#ffffff');
    gemGrad.addColorStop(0.3, rc);
    gemGrad.addColorStop(1, rc);
    x.fillStyle = gemGrad;
    x.shadowColor = rc; x.shadowBlur = 10;
    x.beginPath();
    x.ellipse(CX, CY+3, 5.5, 7, 0, 0, Math.PI*2);
    x.fill();
    // Gem highlight — crescent sheen
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,0.75)';
    x.beginPath();
    x.ellipse(CX-2, CY, 2, 3, -0.3, 0, Math.PI*2);
    x.fill();
    // Inner sparkle pinprick
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(CX-1.5, CY-0.5, 0.6, 0, Math.PI*2); x.fill();
    // Accent marks — small filigree on pendant sides
    x.strokeStyle = rc;
    x.lineWidth = 0.7;
    x.beginPath(); x.moveTo(CX-7, CY-3); x.lineTo(CX-6, CY+1); x.stroke();
    x.beginPath(); x.moveTo(CX+7, CY-3); x.lineTo(CX+6, CY+1); x.stroke();
  },
};

// Shared background routine for gear icons — vignette + colored glow + frame.
// Same visual language as iconBG used in drawAbilityIcons, matched to rarity.
function gearIconBG(x, S, rarity){
  const style = GEAR_RARITY_STYLE[rarity] || GEAR_RARITY_STYLE.common;
  const CX=S/2, CY=S/2;
  // Outer vignette background
  const bg = x.createRadialGradient(CX, CY, S*0.2, CX, CY, S*0.55);
  bg.addColorStop(0, style.bgInner);
  bg.addColorStop(1, style.bgOuter);
  x.fillStyle = bg;
  x.fillRect(0, 0, S, S);
  // Colored inner glow (scales with rarity)
  const alphaHex = (v) => Math.round(v*255).toString(16).padStart(2,'0');
  const glowInner = alphaHex(0.40 * style.glow);
  const glowMid   = alphaHex(0.16 * style.glow);
  const g = x.createRadialGradient(CX, CY, 0, CX, CY, S*0.5);
  g.addColorStop(0, style.color + glowInner);
  g.addColorStop(0.5, style.color + glowMid);
  g.addColorStop(1, style.color + '00');
  x.fillStyle = g;
  x.beginPath(); x.arc(CX, CY, S*0.48, 0, Math.PI*2); x.fill();
  // Outer frame ring — thicker/brighter for higher rarity
  const frameAlpha = alphaHex(Math.min(1, 0.35 + style.glow*0.4));
  x.strokeStyle = style.color + frameAlpha;
  x.lineWidth = rarity === 'mythic' || rarity === 'legendary' ? 1.6 : 1;
  x.beginPath(); x.arc(CX, CY, S*0.47, 0, Math.PI*2); x.stroke();
  return style;
}

// Legendary/mythic overlay — small corner gem stud that signals premium tier.
// Draws in the bottom-right of the icon.
function gearIconOverlay(x, S, rarity){
  const style = GEAR_RARITY_STYLE[rarity];
  if(!style) return;
  if(style.hasGem){
    // Corner gem — small faceted stone at bottom-right
    const gx = S - 8, gy = S - 8;
    x.save();
    x.fillStyle = style.color;
    x.shadowColor = style.color;
    x.shadowBlur = 6;
    x.beginPath();
    x.moveTo(gx, gy-3);
    x.lineTo(gx+3, gy);
    x.lineTo(gx, gy+3);
    x.lineTo(gx-3, gy);
    x.closePath();
    x.fill();
    // Gem sparkle
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath();
    x.moveTo(gx-1, gy-1);
    x.lineTo(gx+0.5, gy-1.5);
    x.lineTo(gx, gy);
    x.closePath();
    x.fill();
    x.restore();
  }
  if(style.hasEmber){
    // Mythic — animated embers floating up (drawn as static particles here;
    // caller can redraw periodically for animation if desired)
    x.save();
    x.fillStyle = '#ff6b6b';
    x.shadowColor = '#ff6b6b'; x.shadowBlur = 4;
    [[8,46],[12,42],[44,44],[46,40]].forEach(([px, py]) => {
      x.beginPath(); x.arc(px, py, 1, 0, Math.PI*2); x.fill();
    });
    x.restore();
  }
}

// Main entry point — draws a full gear icon onto a given canvas.
// Canvas should be 52x52 (matches ability icon size for visual cohesion).
function drawGearIcon(canvas, slot, rarity){
  if(!canvas || !canvas.getContext) return;
  const S = canvas.width;
  const x = canvas.getContext('2d');
  x.clearRect(0, 0, S, S);
  const style = gearIconBG(x, S, rarity);
  const drawer = GEAR_ICON_DRAWERS[slot];
  if(drawer){
    drawer(x, S, style.color);
  }
  gearIconOverlay(x, S, rarity);
}


// ═══════ GAME STATE ══════════════════════════════════════
let running=false,lastTime=0,kills=0;
let camX=WORLD_W/2,camY=WORLD_H/2;
let bossTarget=null;

// ═══════ CLASSES ════════════════════════════════════════════════════
// Two playable classes, each with radically different stats, resources,
// abilities, and playstyle. Class is chosen at new game and saved.
// Ability cooldowns defined here; actual ability logic lives in the ability-
// handler section further down.
const CLASS_DEFS = {
  hollowcaller: {
    id: 'hollowcaller',
    name: 'Hollowcaller',
    tagline: 'Ranged Summoner',
    description: 'Commands spirits from afar. Glass cannon — fragile but deals massive burst damage through spirit detonations.',
    baseHp: 1000,
    baseAtk: 15,
    speedMult: 1.0,
    resourceName: 'Spirit',
    resourceColor: '#c084fc',
    attackRange: 220,      // ranged auto-attack distance
    abilities: [
      // Existing Hollowcaller abilities: Raise Spirit, Veilmark, Detonate, Wrath Tide, Soul Nova
      {id:'raise',    name:'Raise Spirit',  cd:1000, icon:'spirit'},
      {id:'veilmark', name:'Veilmark',      cd:3000, icon:'mark'},
      {id:'detonate', name:'Detonate',      cd:4000, icon:'detonate'},
      {id:'wrath',    name:'Wrath Tide',    cd:8000, icon:'wrath'},
      {id:'nova',     name:'Soul Nova',     cd:12000,icon:'nova'},
    ],
  },
  ironwake: {
    id: 'ironwake',
    name: 'Ironwake',
    tagline: 'Bound Guardian',
    description: 'Melee juggernaut. Walks into enemies and absorbs blows. Builds Wrath from damage taken, unleashes devastating armored strikes.',
    baseHp: 2000,          // 2x Hollowcaller
    baseAtk: 20,           // 1.3x Hollowcaller
    // Speed: previous 0.75 made Ironwake painfully slow to close gaps in AFK,
    // especially vs ranged wraiths that kite. Bumped to 0.85 — still slower
    // than Hollowcaller's 1.0 but closes fights in reasonable time.
    speedMult: 0.85,
    resourceName: 'Wrath',
    resourceColor: '#ef4444',
    // Attack range: was 85 which required touching the enemy sprite. Bumped
    // to 110 so Ironwake can reach enemies during approach, not just AFTER
    // collision. Still firmly melee (Hollowcaller is 220).
    attackRange: 110,
    abilities: [
      {id:'anchor',       name:'Anchor Strike',    cd:1500,  icon:'anchor'},
      {id:'bulwark',      name:'Bulwark',          cd:4000,  icon:'bulwark'},
      {id:'shatter',      name:'Ground Shatter',   cd:8000,  icon:'shatter'},
      {id:'retribution',  name:'Retribution',      cd:12000, icon:'retribution'},
      {id:'fury',         name:"Ironwake's Fury",  cd:25000, icon:'fury'},
    ],
  },
};

// Shortcut: returns the currently-active class definition for player
function getPlayerClass(){
  return CLASS_DEFS[player.classId] || CLASS_DEFS.hollowcaller;
}

let player={
  // Class system — defaults to hollowcaller for saves from before class system existed
  classId:'hollowcaller',
  wrath:0, wrathMax:100,   // Ironwake resource (unused by Hollowcaller)
  bulwarkUntil:0,          // Ironwake: Bulwark active window
  retributionUntil:0,      // Ironwake: Retribution active window
  furyChargeUntil:0,       // Ironwake: Fury channel window
  // Base player fields
  x:WORLD_W/2,y:WORLD_H/2,hp:1000,maxHp:1000,attack:15,
  level:1,xp:0,xpToNext:60,gold:0,
  vx:0,vy:0,facing:0,
  lastAttack:0,lastInput:0,
  isDead:false,iframes:0,
  soulMastery:0,glowPulse:0,hitFlash:0,walkCycle:0,
  afkWpX:WORLD_W/2,afkWpY:WORLD_H/2,
  afkTimer:0,afkCommit:5000,sector:0,
  visitedSectors:new Array(9).fill(false),
  maxBonds:MAX_SPIRITS,
  // AFK mode — OFF by default. Player toggles via HUD button or 'F' key.
  // When OFF: player stands still when not providing input. When ON: auto-
  // paths through the world and fights. ALWAYS OFF in camp regardless of flag.
  afkEnabled:false,};

let spirits=[],enemies=[],particles=[],dmgTexts=[],groundFX=[],enemyProjectiles=[];
// Projectiles — used by Voidweaver Void Bolt and other future projectile abilities.
// Each: {x, y, vx, vy, life, maxLife, dmg, hitSet:Set, pierces, chains, homing:enemy|null,
//        type:'voidBolt'|..., color, size, trail:[]}
let projectiles=[];
let spiritId=0,enemyId=0;
let abilityCDs=[0,0,0,0,0];
let spawnTimer=0;
let keys={},touchJoy={active:false,startX:0,startY:0,dx:0,dy:0},joyId=null;
let shakeTimer=0,shakeAmt=0;
let clusterTimer=0,clusterInterval=9000;
// Precomputed environment
let envProps=[];
// World chests — lootable treasure chests placed deterministically in each zone.
// Separate from envProps because they have mutable state (opened/closed) and
// animated glow effects. Structure: {x, y, tier, opened, openTime, seed}.
let worldChests=[];
// Offering altars — grant a temporary buff when touched. One-time use per visit.
// Structure: {x, y, consumed, consumedTime, seed, buffType}
let worldAltars=[];
// Bone caches — small reward nodes that give gold + crafting scrap when touched.
// Destroyed on pickup. Structure: {x, y, looted, lootedTime, seed}
let worldCaches=[];
// Active temporary buffs from altars. Each: {type, expires, value}
// type: 'damage', 'speed', 'regen', 'crit'. value is the magnitude.
let activeBuffs=[];


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
  tallDeadTree:0.22, // bigger trunk than deadTree
  rockCluster:0.40,  // chunky cluster, tricky to pass through
  boulder:0.50,      // big solid stone
  stoneRuin:0.45,    // wall fragment, wide
  fallenLog:0.55,    // long wide obstacle
  cryptPillar:0.30,  // solid column
  obsidianPillar:0.30,
  sarcophagus:0.40,  // medium chunky
  cryptTomb:0.35,
  ashObelisk:0.35,
  standingStone:0.26,// tall monolith — thin but blocking
  brokenStatue:0.38, // chunky statue base
  ruinWall:0.38,     // standing wall chunk
  // fireBrazier: no collision — player should be able to walk near the light
  // Everything else (grass, mushroom, water, bones, flecks, arches, torches) = no collision
};

// Per-type size multiplier applied at spawn time. Base prop size is ~16-58.
// Large landmark props (tall trees, monoliths, statues, braziers) need to
// be BIGGER than normal rocks to feel imposing — the zones were bland in
// part because everything was the same small size.
const PROP_SIZE_MULT={
  tallDeadTree: 2.4,  // towering — meant to dominate nearby space
  standingStone: 2.2, // tall vertical landmark
  brokenStatue: 2.0,  // large monument
  fireBrazier: 1.5,   // elevated + light source
  // Existing props also get a bump so they feel less like pebbles:
  boulder: 1.4,       // boulders should feel boulder-sized
  deadTree: 1.6,      // bigger than default
  realTree: 1.7,      // canopy deserves space
  stoneRuin: 1.3,
  cryptPillar: 1.6,   // pillars should be TALL
  obsidianPillar: 1.7,
  ashObelisk: 1.7,
  sarcophagus: 1.3,
  cryptTomb: 1.35,
  ruinWall: 1.4,
  fallenLog: 1.3,
  // Small clutter stays at 1.0 (grassTuft, mushroom, boneHeap, etc.)
};

function generateEnvironment(){
  envProps=[];
  const z=getActiveTheme();
  // Generate terrain features FIRST so prop placement can avoid path corridors.
  // Previously this was called at the end, which meant path-exclusion during
  // prop gen always read an empty path array.
  if(typeof generateTerrainFeatures==='function') generateTerrainFeatures();
  // Seed so it's deterministic per zone/dungeon
  const seedBase=(z.id||'').split('').reduce((a,c)=>a*31+c.charCodeAt(0),7919);
  const rnd=srand(seedBase+1);
  const propTypes=z.props||[];
  const counts=z.counts||[];
  // World is now 6500×6500 (was 5000×5000) — 1.69x area. To keep natural
  // density, scale prop count targets by 1.3x so density drops slightly
  // (walkable corridors feel more open) but the world doesn't feel empty.
  const WORLD_PROP_MULT = 1.3;
  // Combine into a list of (type, targetCount) pairs
  const typeBuckets=propTypes.map((t,i)=>({type:t,remaining:Math.round((counts[i]||30) * WORLD_PROP_MULT)}));

  // ─── PATH EXCLUSION ZONES ───
  // Prop-dense hotspots should avoid the generated paths so there's a
  // walkable corridor through the world. Distance-to-nearest-path-point
  // must exceed this radius or we skip that hotspot position.
  const PATH_CLEARANCE = 130;
  const pathPoints = [];
  if(terrainFeatures && terrainFeatures.paths){
    terrainFeatures.paths.forEach(path => {
      if(path.points){
        path.points.forEach(pt => pathPoints.push(pt));
      }
    });
  }
  // Helper: true if (x,y) is inside any path's clearance band
  function _isOnPath(x, y){
    for(let i = 0; i < pathPoints.length; i++){
      const pt = pathPoints[i];
      const dx = x - pt.x, dy = y - pt.y;
      if(dx*dx + dy*dy < PATH_CLEARANCE*PATH_CLEARANCE) return true;
    }
    return false;
  }

  // ─── PHASE 1: CLUSTERED HOTSPOTS ───
  // Generate 18-25 hotspot centers. Each spawns a dense cluster of 6-14 props.
  // Clusters prefer "big" props (trees, rocks, ruins) as anchors plus scattered
  // smaller props (grass, mushrooms) around them.
  const hotspotCount=18+Math.floor(rnd()*7);
  for(let h=0;h<hotspotCount;h++){
    let hx, hy;
    // Try up to 12 times to place this hotspot off the paths
    let placed = false;
    for(let tries = 0; tries < 12; tries++){
      hx = (0.08+rnd()*0.84)*WORLD_W;
      hy = (0.08+rnd()*0.84)*WORLD_H;
      if(!_isOnPath(hx, hy)){ placed = true; break; }
    }
    if(!placed) continue; // skip this hotspot — too close to paths
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
      // Also skip individual props that landed on a path
      if(_isOnPath(px, py)) continue;
      // Base size 16-58, then scaled by per-type multiplier
      const mult=PROP_SIZE_MULT[chosenType]||1;
      const sz=(16+rnd()*42)*mult;
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
          const mult=PROP_SIZE_MULT[chosenType]||1;
          const sz=(14+rnd()*26)*mult;
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
  // Any leftover count goes into random uniform scatter to fill gaps.
  // Also respects path clearance — leftover scatter avoids path corridors.
  typeBuckets.forEach(bucket=>{
    while(bucket.remaining>0){
      bucket.remaining--;
      let px, py, placed = false;
      for(let tries = 0; tries < 6; tries++){
        px = (0.06+rnd()*0.88)*WORLD_W;
        py = (0.06+rnd()*0.88)*WORLD_H;
        if(!_isOnPath(px, py)){ placed = true; break; }
      }
      if(!placed) continue; // skip props that can't find a path-clear spot
      const mult=PROP_SIZE_MULT[bucket.type]||1;
      const sz=(16+rnd()*42)*mult;
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

  // Terrain features (paths, patches) were already regenerated at the start
  // of this function so prop placement could avoid the path corridors.

  // Generate world chests for this zone (skip in camp)
  generateWorldChests(seedBase);
  // Generate world altars (buff shrines) and caches (gold nodes)
  generateWorldAltars(seedBase);
  generateWorldCaches(seedBase);
}

// ═══════ WORLD CHESTS ════════════════════════════════════
// Lootable treasure chests placed deterministically in each zone.
// Player walks within 70 units → chest auto-opens → 2-4 items + gold drop.
// Works in both manual and AFK mode. Chests stay open (opened=true) for the
// rest of the session so players can't farm the same chest.
//
// Tiers: 0=bronze (common/uncommon), 1=silver (rare/epic), 2=gold (epic/legendary/mythic).
// Each zone gets a mix weighted toward its tier level.
function generateWorldChests(seedBase){
  worldChests = [];
  if(!curZone || curZone.isCamp) return; // no chests in camp
  const rnd = srand(seedBase + 424242);
  // 4-6 chests per zone, scaled slightly by zone tier (higher-tier zones get more)
  const zoneLv = curZone.minLv || 1;
  const count = 4 + Math.floor(rnd()*3) + Math.floor(zoneLv/20);
  for(let i=0; i<count; i++){
    // Deterministic placement — spread roughly but avoid edges and landmark area
    const px = (0.08 + rnd()*0.84) * WORLD_W;
    const py = (0.08 + rnd()*0.84) * WORLD_H;
    // Tier weighting: mostly bronze in early zones, more silver/gold in late zones
    let tier = 0;
    const tierRoll = rnd();
    if(zoneLv >= 30){
      // Spire: 30% bronze, 45% silver, 25% gold
      tier = tierRoll < 0.3 ? 0 : tierRoll < 0.75 ? 1 : 2;
    } else if(zoneLv >= 18){
      // Mire: 45% bronze, 45% silver, 10% gold
      tier = tierRoll < 0.45 ? 0 : tierRoll < 0.9 ? 1 : 2;
    } else if(zoneLv >= 8){
      // Crypts: 60% bronze, 35% silver, 5% gold
      tier = tierRoll < 0.6 ? 0 : tierRoll < 0.95 ? 1 : 2;
    } else {
      // Ashen: 75% bronze, 22% silver, 3% gold
      tier = tierRoll < 0.75 ? 0 : tierRoll < 0.97 ? 1 : 2;
    }
    worldChests.push({
      x: px, y: py, tier: tier,
      opened: false, openTime: 0,
      seed: Math.floor(rnd()*99991)+1,
    });
  }
}

// Called each frame — checks if player is near an unopened chest and opens it.
// Separate from prop collision because chests are state-based and don't block movement.
function updateWorldChests(now){
  if(!worldChests || worldChests.length === 0) return;
  for(let i=0; i<worldChests.length; i++){
    const c = worldChests[i];
    if(c.opened) continue;
    const dx = player.x - c.x, dy = player.y - c.y;
    if(dx*dx + dy*dy < 70*70){
      openChest(c, now);
    }
  }
}

// Opens a chest — drops loot, plays effects, marks as opened.
function openChest(chest, now){
  chest.opened = true;
  chest.openTime = now;
  // Determine loot count and quality based on tier
  // tier 0=bronze: 1-2 items + 20-50 gold
  // tier 1=silver: 2-3 items + 50-120 gold (min rarity: rare)
  // tier 2=gold:   3-4 items + 150-400 gold (min rarity: epic)
  let itemCount, goldMin, goldMax, rarityFloor;
  if(chest.tier === 0){
    itemCount = 1 + Math.floor(Math.random() * 2);
    goldMin = 20; goldMax = 50;
    rarityFloor = null;
  } else if(chest.tier === 1){
    itemCount = 2 + Math.floor(Math.random() * 2);
    goldMin = 50; goldMax = 120;
    rarityFloor = 'rare';
  } else {
    itemCount = 3 + Math.floor(Math.random() * 2);
    goldMin = 150; goldMax = 400;
    rarityFloor = 'epic';
  }
  // Scale gold by player level slightly
  const goldScale = 1 + player.level * 0.05;
  const gold = Math.floor((goldMin + Math.random()*(goldMax-goldMin)) * goldScale);
  player.gold += gold;
  // Drop items — use existing rollLoot, re-roll if tier demands higher rarity
  const tierNames = ['BRONZE', 'SILVER', 'GOLD'];
  const tierColors = ['#b8946a', '#c4d0dc', '#f59e0b'];
  addFeed(`◆ ${tierNames[chest.tier]} CHEST OPENED`, tierColors[chest.tier]);
  addFeed(`+${gold} gold`, '#f59e0b');
  for(let j=0; j<itemCount; j++){
    let item = (typeof rollLoot === 'function') ? rollLoot(player.level) : null;
    if(!item) continue;
    // Enforce rarity floor for silver/gold chests — re-roll up to 5 times if too common
    if(rarityFloor){
      const rarityOrder = ['common','uncommon','rare','epic','legendary','mythic'];
      const floorIdx = rarityOrder.indexOf(rarityFloor);
      let attempts = 0;
      while(item && rarityOrder.indexOf(item.rarity) < floorIdx && attempts < 5){
        item = rollLoot(player.level);
        attempts++;
      }
      // Force rarity upgrade if we still failed
      if(item && rarityOrder.indexOf(item.rarity) < floorIdx){
        item.rarity = rarityFloor;
      }
    }
    if(item && typeof tryEquip === 'function'){
      tryEquip(item);
    }
  }
  // Visual effects — beam + shake
  if(typeof pushGroundFX === 'function'){
    pushGroundFX({type:'beam', x:chest.x, y:chest.y, r:50, maxR:50, color:tierColors[chest.tier], life:1.8, maxLife:1.8});
    pushGroundFX({type:'bloom', x:chest.x, y:chest.y, r:120, maxR:120, color:tierColors[chest.tier], life:0.6, maxLife:0.6});
  }
  if(typeof screenShake === 'function') screenShake(4 + chest.tier*3, 200);
  // Sound — play rarity-appropriate pickup
  const sfxMap = ['pickupUncommon', 'pickupRare', 'pickupLegendary'];
  const sfxName = sfxMap[chest.tier];
  if(typeof SFX !== 'undefined' && SFX[sfxName]) SFX[sfxName]();
}

// Draw all chests currently in view. Called inside drawEnvironment.
function drawWorldChests(now, vl, vr, vt, vb){
  if(!worldChests || worldChests.length === 0) return;
  for(let i=0; i<worldChests.length; i++){
    const c = worldChests[i];
    if(c.x < vl || c.x > vr || c.y < vt || c.y > vb) continue;
    drawChest(c, now);
  }
}

// Canvas-drawn chest. 3 tiers with distinct colors, pulsing glow when closed,
// open-lid animation when first opened, then settled open state.
function drawChest(chest, now){
  const S = 40; // chest base size
  ctx.save();
  ctx.translate(chest.x, chest.y);
  // Tier palettes
  const palettes = [
    {body:'#6a4a28', trim:'#8a6a48', dark:'#2a1a0c', light:'#a08060', glow:'#d9a558'},  // bronze
    {body:'#8a96a4', trim:'#b4c0cc', dark:'#3a4250', light:'#d0dce8', glow:'#a0b4c8'},  // silver
    {body:'#a87820', trim:'#e0a838', dark:'#3a2808', light:'#f8c860', glow:'#ffd060'},  // gold
  ];
  const pal = palettes[chest.tier] || palettes[0];

  if(!chest.opened){
    // ═══ CLOSED CHEST — pulsing glow, enticing ═══
    const glowPulse = 0.7 + Math.sin(now/500 + chest.seed) * 0.3;
    // Ground glow halo
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = 22 * glowPulse;
    const haloGrad = ctx.createRadialGradient(0, S*0.3, 0, 0, S*0.3, S*0.95);
    haloGrad.addColorStop(0, pal.glow + '55');
    haloGrad.addColorStop(1, pal.glow + '00');
    ctx.fillStyle = haloGrad;
    ctx.beginPath(); ctx.ellipse(0, S*0.3, S*0.95, S*0.35, 0, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    // Shadow under chest
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.ellipse(S*0.05, S*0.38, S*0.55, S*0.14, 0, 0, Math.PI*2); ctx.fill();
    // Chest body — box
    ctx.fillStyle = pal.dark;
    ctx.fillRect(-S*0.48, -S*0.05, S*0.96, S*0.45);
    ctx.fillStyle = pal.body;
    ctx.fillRect(-S*0.44, -S*0.02, S*0.88, S*0.4);
    // Body highlight on left edge
    ctx.fillStyle = pal.light;
    ctx.fillRect(-S*0.43, 0, S*0.04, S*0.35);
    // Iron bands — two horizontal strips
    ctx.fillStyle = pal.dark;
    ctx.fillRect(-S*0.48, S*0.08, S*0.96, S*0.05);
    ctx.fillRect(-S*0.48, S*0.25, S*0.96, S*0.05);
    // Corner reinforcements
    ctx.fillRect(-S*0.48, S*0.3, S*0.1, S*0.08);
    ctx.fillRect(S*0.38, S*0.3, S*0.1, S*0.08);
    // LID (closed, slightly domed shape)
    ctx.fillStyle = pal.dark;
    ctx.beginPath();
    ctx.moveTo(-S*0.5, -S*0.05);
    ctx.quadraticCurveTo(0, -S*0.32, S*0.5, -S*0.05);
    ctx.lineTo(S*0.48, 0);
    ctx.quadraticCurveTo(0, -S*0.27, -S*0.48, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.moveTo(-S*0.46, -S*0.05);
    ctx.quadraticCurveTo(0, -S*0.28, S*0.46, -S*0.05);
    ctx.lineTo(S*0.44, 0);
    ctx.quadraticCurveTo(0, -S*0.23, -S*0.44, 0);
    ctx.closePath(); ctx.fill();
    // Lid highlight arc
    ctx.strokeStyle = pal.light;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-S*0.4, -S*0.1);
    ctx.quadraticCurveTo(0, -S*0.26, S*0.4, -S*0.1);
    ctx.stroke();
    // LOCK — central golden lock with glowing keyhole
    ctx.fillStyle = pal.trim;
    ctx.fillRect(-S*0.08, S*0.05, S*0.16, S*0.17);
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = 1;
    ctx.strokeRect(-S*0.08, S*0.05, S*0.16, S*0.17);
    // Keyhole — glowing
    ctx.fillStyle = pal.glow;
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = 8 * glowPulse;
    ctx.beginPath(); ctx.arc(0, S*0.11, S*0.025, 0, Math.PI*2); ctx.fill();
    ctx.fillRect(-S*0.008, S*0.11, S*0.016, S*0.05);
    ctx.shadowBlur = 0;
    // Tier indicator floating above
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = 10 * glowPulse;
    ctx.fillStyle = pal.glow;
    ctx.globalAlpha = 0.5 + glowPulse * 0.3;
    // Small shimmer dots above the chest
    for(let i=0; i<3; i++){
      const angle = (now/600 + i*2.09 + chest.seed) % (Math.PI*2);
      const dist = S*0.5 + Math.sin(now/400 + i)*S*0.08;
      const sx = Math.cos(angle)*dist*0.4;
      const sy = -S*0.3 + Math.sin(angle*2)*S*0.12;
      ctx.beginPath(); ctx.arc(sx, sy, S*0.04, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  } else {
    // ═══ OPENED CHEST — lid thrown back, darker hollow interior ═══
    const timeSinceOpen = Math.min(1, (now - chest.openTime) / 800);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(S*0.05, S*0.38, S*0.55, S*0.14, 0, 0, Math.PI*2); ctx.fill();
    // Body (same as closed)
    ctx.fillStyle = pal.dark;
    ctx.fillRect(-S*0.48, -S*0.05, S*0.96, S*0.45);
    ctx.fillStyle = pal.body;
    ctx.fillRect(-S*0.44, -S*0.02, S*0.88, S*0.4);
    ctx.fillStyle = pal.dark;
    ctx.fillRect(-S*0.48, S*0.08, S*0.96, S*0.05);
    ctx.fillRect(-S*0.48, S*0.25, S*0.96, S*0.05);
    // DARK INTERIOR — visible through open top
    ctx.fillStyle = '#080604';
    ctx.fillRect(-S*0.4, -S*0.08, S*0.8, S*0.15);
    // Interior shadow gradient
    const inGrad = ctx.createLinearGradient(0, -S*0.08, 0, S*0.07);
    inGrad.addColorStop(0, 'rgba(0,0,0,0.9)');
    inGrad.addColorStop(1, 'rgba(20,10,5,0.7)');
    ctx.fillStyle = inGrad;
    ctx.fillRect(-S*0.4, -S*0.08, S*0.8, S*0.15);
    // LID — thrown back behind the chest
    const lidAngle = -Math.PI * 0.55 * timeSinceOpen;
    ctx.save();
    ctx.translate(0, -S*0.05);
    ctx.rotate(lidAngle);
    ctx.fillStyle = pal.dark;
    ctx.beginPath();
    ctx.moveTo(-S*0.5, 0);
    ctx.quadraticCurveTo(0, -S*0.27, S*0.5, 0);
    ctx.lineTo(S*0.48, S*0.05);
    ctx.quadraticCurveTo(0, -S*0.22, -S*0.48, S*0.05);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.moveTo(-S*0.46, 0);
    ctx.quadraticCurveTo(0, -S*0.23, S*0.46, 0);
    ctx.lineTo(S*0.44, S*0.05);
    ctx.quadraticCurveTo(0, -S*0.18, -S*0.44, S*0.05);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // Lingering glow if recently opened
    if(timeSinceOpen < 1){
      const fadeGlow = 1 - timeSinceOpen;
      ctx.shadowColor = pal.glow;
      ctx.shadowBlur = 20 * fadeGlow;
      ctx.fillStyle = pal.glow + Math.floor(fadeGlow*120).toString(16).padStart(2,'0');
      ctx.globalAlpha = fadeGlow * 0.7;
      ctx.beginPath(); ctx.ellipse(0, S*0.02, S*0.4, S*0.08, 0, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
}

// ═══════ OFFERING ALTARS ═══════════════════════════════════
// Small stone altars with glowing runes. Walking near consumes the altar
// and grants a random temporary buff for 90 seconds. One-time use per
// zone visit. Clear visual telegraph so player can decide whether to
// engage or save for later.

const ALTAR_BUFF_TYPES = [
  {type:'damage', value:0.25, color:'#ff6b2c', label:'+25% Damage'},
  {type:'speed',  value:0.30, color:'#60a5fa', label:'+30% Speed'},
  {type:'regen',  value:0.02, color:'#22c55e', label:'HP Regen'},    // 2% max HP per sec
  {type:'crit',   value:0.15, color:'#c084fc', label:'+15% Crit'},
];
const ALTAR_BUFF_DURATION_MS = 90000;

function generateWorldAltars(seedBase){
  worldAltars = [];
  if(!curZone || curZone.isCamp) return;
  const rnd = srand(seedBase + 333444);
  const count = 2 + Math.floor(rnd()*2); // 2-3 per zone
  for(let i=0; i<count; i++){
    const px = (0.1 + rnd()*0.8) * WORLD_W;
    const py = (0.1 + rnd()*0.8) * WORLD_H;
    const buffIdx = Math.floor(rnd() * ALTAR_BUFF_TYPES.length);
    worldAltars.push({
      x: px, y: py,
      consumed: false, consumedTime: 0,
      seed: Math.floor(rnd()*99991)+1,
      buffIdx: buffIdx,
    });
  }
}

function updateWorldAltars(now){
  if(!worldAltars || worldAltars.length === 0) return;
  for(let i=0; i<worldAltars.length; i++){
    const a = worldAltars[i];
    if(a.consumed) continue;
    const dx = player.x - a.x, dy = player.y - a.y;
    if(dx*dx + dy*dy < 70*70){
      consumeAltar(a, now);
    }
  }
}

function consumeAltar(altar, now){
  altar.consumed = true;
  altar.consumedTime = now;
  const buff = ALTAR_BUFF_TYPES[altar.buffIdx];
  // Remove existing buff of same type (replace with new)
  activeBuffs = activeBuffs.filter(b => b.type !== buff.type);
  activeBuffs.push({
    type: buff.type,
    value: buff.value,
    expires: now + ALTAR_BUFF_DURATION_MS,
  });
  addFeed(`✦ ALTAR BLESSING — ${buff.label} for 90s`, buff.color);
  // Big visual effect
  if(typeof pushGroundFX === 'function'){
    pushGroundFX({type:'bloom', x:altar.x, y:altar.y, r:180, maxR:180, color:buff.color, life:1.2, maxLife:1.2});
    pushGroundFX({type:'beam', x:altar.x, y:altar.y, r:80, maxR:80, color:buff.color, life:2.0, maxLife:2.0});
  }
  if(typeof screenShake === 'function') screenShake(5, 250);
  if(typeof SFX !== 'undefined' && SFX.portalOpen) SFX.portalOpen();
}

function drawWorldAltars(now, vl, vr, vt, vb){
  if(!worldAltars || worldAltars.length === 0) return;
  for(let i=0; i<worldAltars.length; i++){
    const a = worldAltars[i];
    if(a.x < vl || a.x > vr || a.y < vt || a.y > vb) continue;
    drawAltar(a, now);
  }
}

function drawAltar(altar, now){
  const S = 44;
  const buff = ALTAR_BUFF_TYPES[altar.buffIdx];
  const stone = '#1f1a14';
  const stoneDark = '#0a0805';
  const stoneMid = '#161210';
  const stoneLight = '#3a2e22';
  ctx.save();
  ctx.translate(altar.x, altar.y);
  if(!altar.consumed){
    // ═══ ACTIVE ALTAR — pulsing rune, ember wisps, inviting glow ═══
    const pulse = 0.65 + Math.sin(now/600 + altar.seed) * 0.35;
    // Ground halo in buff color
    const haloGrad = ctx.createRadialGradient(0, S*0.25, 0, 0, S*0.25, S*1.6);
    haloGrad.addColorStop(0, buff.color + '40');
    haloGrad.addColorStop(1, buff.color + '00');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();ctx.ellipse(0, S*0.25, S*1.6, S*0.6, 0, 0, Math.PI*2);ctx.fill();
    // Base shadow
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();ctx.ellipse(S*0.04, S*0.35, S*0.65, S*0.16, 0, 0, Math.PI*2);ctx.fill();
    // ─── STEPPED STONE BASE (2 steps) ───
    ctx.fillStyle = stoneDark;
    ctx.fillRect(-S*0.52, S*0.18, S*1.04, S*0.18);
    ctx.fillStyle = stone;
    ctx.fillRect(-S*0.48, S*0.14, S*0.96, S*0.16);
    // Lit front edge
    ctx.fillStyle = stoneLight;
    ctx.fillRect(-S*0.48, S*0.14, S*0.96, S*0.02);
    // Upper step
    ctx.fillStyle = stoneDark;
    ctx.fillRect(-S*0.42, S*0.02, S*0.84, S*0.14);
    ctx.fillStyle = stone;
    ctx.fillRect(-S*0.38, -S*0.02, S*0.76, S*0.14);
    ctx.fillStyle = stoneLight;
    ctx.fillRect(-S*0.38, -S*0.02, S*0.76, S*0.02);
    // ─── ALTAR SLAB TOP ───
    ctx.fillStyle = stoneMid;
    ctx.fillRect(-S*0.42, -S*0.12, S*0.84, S*0.12);
    ctx.fillStyle = stone;
    ctx.fillRect(-S*0.4, -S*0.14, S*0.8, S*0.04);
    // Top lit edge
    ctx.fillStyle = stoneLight;
    ctx.fillRect(-S*0.4, -S*0.14, S*0.8, S*0.015);
    // ─── CENTRAL RUNE — big pulsing symbol on top face ───
    ctx.shadowColor = buff.color;
    ctx.shadowBlur = 22 * pulse;
    ctx.strokeStyle = buff.color;
    ctx.fillStyle = buff.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + pulse * 0.4;
    // Circle
    ctx.beginPath();
    ctx.ellipse(0, -S*0.06, S*0.14, S*0.04, 0, 0, Math.PI*2);
    ctx.stroke();
    // Inner triangle
    ctx.beginPath();
    ctx.moveTo(-S*0.08, -S*0.05);
    ctx.lineTo(S*0.08, -S*0.05);
    ctx.lineTo(0, -S*0.09);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    // ─── EMBER WISPS rising — animated particles ───
    for(let w=0; w<4; w++){
      const wt = ((now/40 + altar.seed + w*73) % 100) / 100;
      const wx = Math.sin(now/500 + w*1.57 + altar.seed)*S*0.12;
      const wy = -S*0.15 - wt*S*0.9;
      const wa = (1-wt)*0.9;
      ctx.globalAlpha = wa;
      ctx.shadowColor = buff.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = buff.color;
      ctx.beginPath();ctx.arc(wx, wy, S*0.035*(1-wt*0.4), 0, Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    // Peak shimmer above
    ctx.shadowColor = buff.color;
    ctx.shadowBlur = 15 * pulse;
    ctx.fillStyle = buff.color;
    ctx.globalAlpha = 0.7 * pulse;
    ctx.beginPath();ctx.arc(0, -S*1.0, S*0.08, 0, Math.PI*2);ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  } else {
    // ═══ CONSUMED ALTAR — dim, dormant, no glow ═══
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();ctx.ellipse(S*0.04, S*0.35, S*0.6, S*0.14, 0, 0, Math.PI*2);ctx.fill();
    // Base (no highlights, darker)
    ctx.fillStyle = stoneDark;
    ctx.fillRect(-S*0.52, S*0.18, S*1.04, S*0.18);
    ctx.fillStyle = stoneMid;
    ctx.fillRect(-S*0.48, S*0.14, S*0.96, S*0.16);
    ctx.fillStyle = stoneDark;
    ctx.fillRect(-S*0.42, S*0.02, S*0.84, S*0.14);
    ctx.fillStyle = stoneMid;
    ctx.fillRect(-S*0.38, -S*0.02, S*0.76, S*0.14);
    ctx.fillStyle = stoneMid;
    ctx.fillRect(-S*0.42, -S*0.12, S*0.84, S*0.12);
    ctx.fillStyle = stoneDark;
    ctx.fillRect(-S*0.4, -S*0.14, S*0.8, S*0.04);
    // Faded dormant rune
    ctx.strokeStyle = 'rgba(80,70,60,0.4)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(0, -S*0.06, S*0.14, S*0.04, 0, 0, Math.PI*2);
    ctx.stroke();
  }
  ctx.restore();
}

// ═══════ BONE CACHES ═══════════════════════════════════════
// Small pile of bones with gold coins glinting through. Walking near
// grants gold and a small chance at crafting scrap. Destroyed on pickup.

function generateWorldCaches(seedBase){
  worldCaches = [];
  if(!curZone || curZone.isCamp) return;
  const rnd = srand(seedBase + 555777);
  // More caches in crypts + ashen (lore-appropriate), fewer in mire/spire
  let count = 3 + Math.floor(rnd()*3);
  if(curZone.id === 'crypts' || curZone.id === 'ashen') count += 2;
  for(let i=0; i<count; i++){
    const px = (0.08 + rnd()*0.84) * WORLD_W;
    const py = (0.08 + rnd()*0.84) * WORLD_H;
    worldCaches.push({
      x: px, y: py,
      looted: false, lootedTime: 0,
      seed: Math.floor(rnd()*99991)+1,
    });
  }
}

function updateWorldCaches(now){
  if(!worldCaches || worldCaches.length === 0) return;
  for(let i=0; i<worldCaches.length; i++){
    const c = worldCaches[i];
    if(c.looted) continue;
    const dx = player.x - c.x, dy = player.y - c.y;
    if(dx*dx + dy*dy < 60*60){
      lootCache(c, now);
    }
  }
}

function lootCache(cache, now){
  cache.looted = true;
  cache.lootedTime = now;
  // Gold reward scaled by level — 15-40 gold base, +5% per level
  const base = 15 + Math.floor(Math.random()*26);
  const gold = Math.floor(base * (1 + player.level * 0.05));
  player.gold += gold;
  addFeed(`+${gold} gold (cache)`, '#f59e0b');
  // Visual + sound
  if(typeof pushGroundFX === 'function'){
    pushGroundFX({type:'bloom', x:cache.x, y:cache.y, r:80, maxR:80, color:'#f59e0b', life:0.6, maxLife:0.6});
  }
  if(typeof SFX !== 'undefined' && SFX.goldPickup) SFX.goldPickup();
}

function drawWorldCaches(now, vl, vr, vt, vb){
  if(!worldCaches || worldCaches.length === 0) return;
  for(let i=0; i<worldCaches.length; i++){
    const c = worldCaches[i];
    if(c.x < vl || c.x > vr || c.y < vt || c.y > vb) continue;
    if(c.looted){
      // Show only briefly after looting (fading afterglow)
      const age = now - c.lootedTime;
      if(age < 600) drawCacheAfterglow(c, age);
      continue;
    }
    drawCache(c, now);
  }
}

function drawCache(cache, now){
  const S = 34;
  const bone = '#c8bca0';
  const boneDark = '#6a5c40';
  const boneShadow = '#2a2218';
  const gold = '#f59e0b';
  ctx.save();
  ctx.translate(cache.x, cache.y);
  const pulse = 0.7 + Math.sin(now/450 + cache.seed)*0.3;
  // Gold halo
  ctx.shadowColor = gold;
  ctx.shadowBlur = 14 * pulse;
  const haloGrad = ctx.createRadialGradient(0, S*0.1, 0, 0, S*0.1, S*0.9);
  haloGrad.addColorStop(0, 'rgba(255,200,100,0.3)');
  haloGrad.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath();ctx.ellipse(0, S*0.1, S*0.9, S*0.4, 0, 0, Math.PI*2);ctx.fill();
  ctx.shadowBlur = 0;
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();ctx.ellipse(S*0.04, S*0.2, S*0.45, S*0.1, 0, 0, Math.PI*2);ctx.fill();
  // ─── BONE PILE ─── scattered bones forming a low mound
  for(let i=0; i<4; i++){
    const angle = ((i*2.137)%1) * Math.PI*2;
    const dist = ((i*1.713)%1) * S*0.3;
    const bx = Math.cos(angle)*dist;
    const by = Math.sin(angle)*dist*0.5;
    const blen = S*(0.15 + ((i*3.61)%1)*0.12);
    const brot = ((i*1.91)%1) * Math.PI*2;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(brot);
    // Bone shadow
    ctx.strokeStyle = boneShadow;
    ctx.lineWidth = S*0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-blen/2 + 1, 1);
    ctx.lineTo(blen/2 + 1, 1);
    ctx.stroke();
    // Bone main
    ctx.strokeStyle = bone;
    ctx.lineWidth = S*0.09;
    ctx.beginPath();
    ctx.moveTo(-blen/2, 0);
    ctx.lineTo(blen/2, 0);
    ctx.stroke();
    // Bone knob ends
    ctx.fillStyle = bone;
    ctx.beginPath();ctx.arc(-blen/2, 0, S*0.055, 0, Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(blen/2, 0, S*0.055, 0, Math.PI*2);ctx.fill();
    ctx.restore();
  }
  // A small skull sitting in the middle
  ctx.fillStyle = boneShadow;
  ctx.beginPath();ctx.ellipse(S*0.02, S*0.02, S*0.16, S*0.14, 0, 0, Math.PI*2);ctx.fill();
  ctx.fillStyle = bone;
  ctx.beginPath();ctx.ellipse(0, 0, S*0.15, S*0.13, 0, 0, Math.PI*2);ctx.fill();
  // Skull eye sockets
  ctx.fillStyle = '#0a0604';
  ctx.beginPath();ctx.arc(-S*0.05, -S*0.02, S*0.03, 0, Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(S*0.05, -S*0.02, S*0.03, 0, Math.PI*2);ctx.fill();
  // ─── GOLD COINS glinting in the pile ───
  ctx.shadowColor = gold;
  ctx.shadowBlur = 10 * pulse;
  for(let c=0; c<3; c++){
    const cx = ((c*3.13)%1 - 0.5) * S*0.35;
    const cy = S*0.1 + ((c*1.79)%1 - 0.5)*S*0.1;
    ctx.fillStyle = '#ffc850';
    ctx.beginPath();ctx.ellipse(cx, cy, S*0.07, S*0.025, 0, 0, Math.PI*2);ctx.fill();
    // Coin shine
    ctx.fillStyle = '#fff5c0';
    ctx.globalAlpha = 0.7 + pulse*0.3;
    ctx.beginPath();ctx.ellipse(cx - S*0.02, cy - S*0.005, S*0.025, S*0.01, 0, 0, Math.PI*2);ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
  // Shimmer sparkles
  for(let s=0; s<2; s++){
    const st = ((now/60 + s*167 + cache.seed) % 100)/100;
    const sx = Math.sin(st*Math.PI*2 + s)*S*0.25;
    const sy = -S*0.3 + st*S*0.2;
    ctx.globalAlpha = (1-st)*0.8;
    ctx.fillStyle = '#ffee90';
    ctx.beginPath();ctx.arc(sx, sy, S*0.03, 0, Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawCacheAfterglow(cache, age){
  const fade = 1 - (age/600);
  ctx.save();
  ctx.translate(cache.x, cache.y);
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 30*fade;
  ctx.fillStyle = `rgba(255,200,80,${0.5*fade})`;
  ctx.beginPath();ctx.arc(0, 0, 30*fade + 10, 0, Math.PI*2);ctx.fill();
  ctx.restore();
}

// ═══════ ACTIVE BUFF MANAGEMENT ════════════════════════════
// Called each frame to expire old buffs. Buff values are read by combat
// code via getActiveBuffValue().

function updateActiveBuffs(now){
  if(!activeBuffs || activeBuffs.length === 0) return;
  const remaining = [];
  for(let i=0; i<activeBuffs.length; i++){
    if(activeBuffs[i].expires > now){
      remaining.push(activeBuffs[i]);
    } else {
      // Buff just expired — notify player
      addFeed(`− ${activeBuffs[i].type.toUpperCase()} blessing faded`, '#8a7a6a');
    }
  }
  activeBuffs = remaining;
  // Apply per-tick effects (regen)
  const regenBuff = activeBuffs.find(b => b.type === 'regen');
  if(regenBuff && player.hp < player.maxHp){
    // 2% max HP per sec → per frame at ~60fps = 0.033% per frame
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * regenBuff.value / 60);
  }
}

// Returns the current multiplier for a given buff type.
// Used by combat/movement code to apply buffs.
function getActiveBuffValue(type){
  if(!activeBuffs) return 0;
  for(let i=0; i<activeBuffs.length; i++){
    if(activeBuffs[i].type === type) return activeBuffs[i].value;
  }
  return 0;
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
  // Landmark collision — add the zone's focal structure to the spatial grid
  // so the player can't walk through it. Only spans one grid cell (landmarks
  // are big but still fit in a single PROP_GRID_SIZE cell for lookup).
  const lm = (typeof getActiveLandmark === 'function') ? getActiveLandmark() : null;
  if (lm && lm.collRadius > 0) {
    const gx=Math.floor(lm.x/PROP_GRID_SIZE);
    const gy=Math.floor(lm.y/PROP_GRID_SIZE);
    const key=gx+','+gy;
    if(!propGrid[key])propGrid[key]=[];
    propGrid[key].push({x:lm.x, y:lm.y, collRadius:lm.collRadius, type:'landmark'});
  }
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
  // Blocked both ways. Check if we're ALREADY inside a prop (stuck).
  // If so, eject the player outward along the prop→player vector.
  const stuckProp = getPropCollisionAt(fromX,fromY,radius);
  if(stuckProp){
    const edx = fromX - stuckProp.x, edy = fromY - stuckProp.y;
    const ed = Math.max(0.01, Math.sqrt(edx*edx + edy*edy));
    const ejectDist = radius + stuckProp.collRadius + 2;
    const ex = stuckProp.x + (edx/ed) * ejectDist;
    const ey = stuckProp.y + (edy/ed) * ejectDist;
    // Clamp to world bounds
    const cx = Math.max(30, Math.min(WORLD_W-30, ex));
    const cy = Math.max(30, Math.min(WORLD_H-30, ey));
    // Only eject if the ejection point itself is clear
    if(!getPropCollisionAt(cx,cy,radius)){
      return {x:cx, y:cy};
    }
  }
  // Last resort — stay put
  return {x:fromX,y:fromY};
}

// Finds a clear point within a max radius of a target point. Used for
// enemy spawning and teleport-in placements so we don't spawn inside props.
// Finds a clear point within a reasonable distance of (cx,cy).
// Tries expanding rings so even large collision radii (landmarks, 100px+) can be escaped.
function findClearPosition(cx,cy,r,maxAttempts=16){
  if(!getPropCollisionAt(cx,cy,r))return {x:cx,y:cy};
  // Try 4 expanding rings of search, each wider than the last.
  const ringDistances=[
    {min:40,max:140},   // close ring — normal enemy spawns
    {min:120,max:240},  // medium — escape from a large prop
    {min:200,max:360},  // wide — escape from clustered collision
    {min:300,max:500},  // desperate — landmark surrounded by other props
  ];
  for(const ring of ringDistances){
    for(let i=0;i<maxAttempts;i++){
      const a=Math.random()*Math.PI*2;
      const d=ring.min+Math.random()*(ring.max-ring.min);
      const nx=cx+Math.cos(a)*d;
      const ny=cy+Math.sin(a)*d;
      if(nx<40||nx>WORLD_W-40||ny<40||ny>WORLD_H-40)continue;
      if(!getPropCollisionAt(nx,ny,r))return {x:nx,y:ny};
    }
  }
  // Absolute fallback: return world-center rather than leaving the caller stuck.
  return {x:WORLD_W/2, y:WORLD_H/2};
}

function drawEnvironment(now){
  const halfVW = W/(2*WORLD_ZOOM), halfVH = H/(2*WORLD_ZOOM);
  const margin=320,vl=camX-halfVW-margin,vr=camX+halfVW+margin,vt=camY-halfVH-margin,vb=camY+halfVH+margin;
  // Draw the zone landmark FIRST so other props render in front of it
  // (the landmark is meant to be a distant anchor, not foreground clutter)
  drawActiveLandmark(now, vl, vr, vt, vb);
  envProps.forEach(p=>{if(p.x>vl&&p.x<vr&&p.y>vt&&p.y<vb)drawProp(p,now);});
  // Interactables render AFTER props so they're always visible
  drawWorldChests(now, vl, vr, vt, vb);
  drawWorldAltars(now, vl, vr, vt, vb);
  drawWorldCaches(now, vl, vr, vt, vb);
  // Necrolord banners — drawn last so they sit on top of everything
  if(typeof drawNecroBanners === 'function') drawNecroBanners(now);
  // Voidweaver entities — seals, singularities, rifts
  if(typeof drawVoidweaverEntities === 'function') drawVoidweaverEntities(now);
}

// Looks up the landmark for the current zone/dungeon and draws it.
// Canvas-drawn — no asset dependency. Big focal structures that anchor
// each zone visually. See drawZoneLandmark for the actual drawing.
function drawActiveLandmark(now, vl, vr, vt, vb){
  const lm = getActiveLandmark();
  if (!lm) return;
  // Landmark bounding check — landmarks are large, expand the view test margin
  const lmMargin = 500;
  if (lm.x < vl - lmMargin || lm.x > vr + lmMargin || lm.y < vt - lmMargin || lm.y > vb + lmMargin) return;
  drawZoneLandmark(lm.drawId, lm.x, lm.y, (lm.scale || 1), now);
}

// Returns the landmark for the current active zone or dungeon, or null.
function getActiveLandmark(){
  if (dungeonState.active && dungeonState.def) {
    return LANDMARKS[dungeonState.def.id] || null;
  }
  if (curZone && curZone.id) {
    return LANDMARKS[curZone.id] || null;
  }
  return null;
}

// Dispatches to the correct canvas-drawn landmark function.
// Each landmark is rendered at ~300 world-unit base size × the scale factor.
function drawZoneLandmark(drawId, x, y, scale, now){
  ctx.save();
  ctx.translate(x, y);
  switch(drawId){
    case 'shatteredTower': drawLandmarkShatteredTower(scale, now); break;
    case 'giantSkull':     drawLandmarkGiantSkull(scale, now); break;
    case 'sunkenAltar':    drawLandmarkSunkenAltar(scale, now); break;
    case 'obsidianMonolith': drawLandmarkObsidianMonolith(scale, now); break;
  }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// LANDMARK DRAW FUNCTIONS — massive focal structures per zone
// Each draws in world-local coordinates (translated to landmark's x,y)
// Base size ~300 world units so they're visible from far away.
// ═══════════════════════════════════════════════════════════════

// ─── ASHEN WASTES: Shattered Tower ───
// Half-collapsed stone spire reaching toward the purple sky, rubble at base,
// broken top with rebar-like exposed structure, cracked facade.
function drawLandmarkShatteredTower(scale, now){
  const S = 300 * scale; // base size
  const stone = '#1a1230';
  const stoneDark = '#0a0518';
  const stoneMid = '#130c24';
  const stoneLight = '#2d1f52';
  const stoneCrack = '#050210';
  // Rubble-shadow on ground
  ctx.fillStyle='rgba(0,0,0,0.65)';
  ctx.beginPath();ctx.ellipse(S*0.08, S*0.48, S*0.95, S*0.22, 0, 0, Math.PI*2);ctx.fill();
  // ─── RUBBLE PILE around base ───
  for(let i=0;i<8;i++){
    const rngA = (i*2.137)%1;
    const rngB = (i*3.561)%1;
    const rngC = (i*5.891)%1;
    const rx = (rngA-0.5)*S*1.5;
    const ry = S*0.38 + rngB*S*0.1;
    const rs = S*(0.05+rngC*0.07);
    // Rubble chunk — irregular polygon
    ctx.fillStyle = stoneDark;
    ctx.beginPath();
    for(let v=0;v<6;v++){
      const va=(v/6)*Math.PI*2;
      const vr=rs*(0.7+((i+v)*0.7)%1*0.5);
      const vx=rx+Math.cos(va)*vr, vy=ry+Math.sin(va)*vr*0.6;
      if(v===0) ctx.moveTo(vx,vy); else ctx.lineTo(vx,vy);
    }
    ctx.closePath();ctx.fill();
    ctx.fillStyle = stone;
    ctx.beginPath();
    for(let v=0;v<6;v++){
      const va=(v/6)*Math.PI*2;
      const vr=rs*(0.6+((i+v)*0.7)%1*0.4);
      const vx=rx+Math.cos(va)*vr-rs*0.08, vy=ry+Math.sin(va)*vr*0.55-rs*0.04;
      if(v===0) ctx.moveTo(vx,vy); else ctx.lineTo(vx,vy);
    }
    ctx.closePath();ctx.fill();
  }
  // ─── TOWER BASE (wide) ───
  const baseY = S*0.38;
  const baseTopY = S*0.18;
  const baseHalfW = S*0.4;
  const baseTopHalfW = S*0.32;
  // Base shadow offset
  ctx.fillStyle = stoneDark;
  ctx.beginPath();
  ctx.moveTo(-baseHalfW+S*0.06, baseY+S*0.04);
  ctx.lineTo(baseHalfW+S*0.06, baseY+S*0.04);
  ctx.lineTo(baseTopHalfW+S*0.06, baseTopY+S*0.04);
  ctx.lineTo(-baseTopHalfW+S*0.06, baseTopY+S*0.04);
  ctx.closePath();ctx.fill();
  // Base body
  ctx.fillStyle = stone;
  ctx.beginPath();
  ctx.moveTo(-baseHalfW, baseY);
  ctx.lineTo(baseHalfW, baseY);
  ctx.lineTo(baseTopHalfW, baseTopY);
  ctx.lineTo(-baseTopHalfW, baseTopY);
  ctx.closePath();ctx.fill();
  // ─── TOWER SHAFT (tall, tapered, leaning slightly, broken top) ───
  const shaftBotY = baseTopY;
  const shaftTopY = -S*1.4; // very tall
  const shaftBotHalfW = S*0.24;
  const shaftTopHalfW = S*0.16;
  const leanX = -S*0.06; // slight lean to left
  // Jagged broken top — irregular edge
  const topJags = [];
  const topY = shaftTopY;
  for(let j=0;j<=6;j++){
    const t = j/6;
    const jagX = -shaftTopHalfW + t*shaftTopHalfW*2 + leanX;
    const jagY = topY + ((j*3.7+0.2)%1)*S*0.18 - S*0.02;
    topJags.push({x: jagX, y: jagY});
  }
  // Build shaft path
  const shaftPath = [
    {x: -shaftBotHalfW, y: shaftBotY},
    {x: -shaftTopHalfW+leanX, y: topY+S*0.15},
    ...topJags,
    {x: shaftTopHalfW+leanX, y: topY+S*0.15},
    {x: shaftBotHalfW, y: shaftBotY},
  ];
  // Shaft shadow
  ctx.fillStyle = stoneDark;
  ctx.beginPath();
  shaftPath.forEach((p,i)=>{
    const x=p.x+S*0.04, y=p.y+S*0.02;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.closePath();ctx.fill();
  // Shaft mid
  ctx.fillStyle = stoneMid;
  ctx.beginPath();
  shaftPath.forEach((p,i)=>{
    if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
  });
  ctx.closePath();ctx.fill();
  // Shaft main (slightly inset for bevel)
  ctx.fillStyle = stone;
  ctx.beginPath();
  shaftPath.forEach((p,i)=>{
    const x = p.x*0.93, y = p.y;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.closePath();ctx.fill();
  // Lit left edge — vertical band suggesting light from upper-left
  ctx.fillStyle = stoneLight;
  ctx.fillRect(-shaftBotHalfW*0.88+leanX*0.2, shaftTopY+S*0.18, S*0.03, shaftBotY - (shaftTopY+S*0.18));
  // ─── WINDOWS (dark rectangular openings going up the shaft) ───
  const windowCount = 5;
  for(let w=0;w<windowCount;w++){
    const wy = shaftTopY + S*0.3 + w*(S*0.28);
    const ww = S*0.05;
    const wh = S*0.09;
    const wxOffset = leanX * ((wy - shaftBotY)/(shaftTopY - shaftBotY));
    ctx.fillStyle = stoneCrack;
    ctx.fillRect(-ww/2 + wxOffset, wy, ww, wh);
    // Window sill
    ctx.fillStyle = stoneDark;
    ctx.fillRect(-ww/2 - 1 + wxOffset, wy+wh, ww+2, 2);
  }
  // ─── DIAGONAL CRACKS across the shaft ───
  ctx.strokeStyle = stoneCrack;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-shaftBotHalfW*0.8, shaftTopY+S*0.55);
  ctx.lineTo(shaftBotHalfW*0.3, shaftTopY+S*0.85);
  ctx.lineTo(-shaftBotHalfW*0.4, shaftBotY-S*0.15);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(shaftBotHalfW*0.7, shaftTopY+S*0.4);
  ctx.lineTo(shaftBotHalfW*0.2, shaftBotY-S*0.3);
  ctx.stroke();
  // ─── EXPOSED REBAR at broken top ───
  ctx.strokeStyle = '#3a2818';
  ctx.lineWidth = 2;
  for(let r=0;r<3;r++){
    const rx = leanX + (r-1)*S*0.06;
    const ry = topY - S*0.08 + ((r*2.17)%1)*S*0.05;
    ctx.beginPath();
    ctx.moveTo(rx, topY+S*0.1);
    ctx.lineTo(rx + ((r*1.3)%1-0.5)*S*0.04, ry);
    ctx.stroke();
  }
  // ─── AURA at the peak (tower still haunted by residual magic) ───
  const auraPulse = 0.6 + Math.sin(now/1800) * 0.3;
  ctx.shadowColor = '#c084fc';
  ctx.shadowBlur = 40 * auraPulse;
  ctx.fillStyle = `rgba(192,132,252,${0.15 * auraPulse})`;
  ctx.beginPath();
  ctx.arc(leanX, topY + S*0.05, S*0.08, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

// ─── BONE CRYPTS: Giant Half-Buried Skull ───
// Massive cracked skull the size of 20 players, partially sunk into the earth,
// eye sockets glowing amber with ancient fire, jaw mostly buried.
function drawLandmarkGiantSkull(scale, now){
  const S = 320 * scale;
  const bone = '#c8b890';
  const boneDark = '#6a5c40';
  const boneShadow = '#2a2218';
  const boneMid = '#a08060';
  const earthColor = '#1a0f08';
  // Ground disturbance — dark patch around where it emerges
  ctx.fillStyle='rgba(0,0,0,0.5)';
  ctx.beginPath();ctx.ellipse(0, S*0.4, S*1.2, S*0.25, 0, 0, Math.PI*2);ctx.fill();
  // Earth mound surrounding the skull — suggests buried
  ctx.fillStyle = earthColor;
  ctx.beginPath();
  ctx.ellipse(0, S*0.32, S*1.1, S*0.18, 0, 0, Math.PI*2);
  ctx.fill();
  // Scattered bone fragments around the base
  for(let i=0;i<6;i++){
    const ang = (i*1.37)%1 * Math.PI*2;
    const dist = S*0.8 + ((i*2.3)%1)*S*0.2;
    const fx = Math.cos(ang)*dist;
    const fy = S*0.3 + Math.sin(ang)*dist*0.3;
    const flen = S*(0.06+((i*3.7)%1)*0.05);
    ctx.strokeStyle = boneShadow;
    ctx.lineWidth = S*0.018;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx-flen/2+2, fy+2);
    ctx.lineTo(fx+flen/2+2, fy+2);
    ctx.stroke();
    ctx.strokeStyle = bone;
    ctx.lineWidth = S*0.012;
    ctx.beginPath();
    ctx.moveTo(fx-flen/2, fy);
    ctx.lineTo(fx+flen/2, fy);
    ctx.stroke();
  }
  // ─── SKULL DOME (upper half — mostly exposed) ───
  // Main skull outline — huge
  const skullR = S*0.55;
  // Cast shadow of skull
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(S*0.1, S*0.3, skullR*1.08, skullR*0.4, 0, 0, Math.PI*2);
  ctx.fill();
  // Deep shadow layer of skull
  ctx.fillStyle = boneShadow;
  ctx.beginPath();
  ctx.ellipse(S*0.04, S*0.04, skullR*1.02, skullR*0.88, 0, 0, Math.PI*2);
  ctx.fill();
  // Dark mid layer
  ctx.fillStyle = boneDark;
  ctx.beginPath();
  ctx.ellipse(S*0.02, S*0.02, skullR*0.99, skullR*0.86, 0, 0, Math.PI*2);
  ctx.fill();
  // Main skull body
  ctx.fillStyle = bone;
  ctx.beginPath();
  ctx.ellipse(0, 0, skullR, skullR*0.85, 0, 0, Math.PI*2);
  ctx.fill();
  // Darker half for dimensional shading
  ctx.fillStyle = boneMid;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.ellipse(skullR*0.15, skullR*0.05, skullR*0.75, skullR*0.65, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // ─── EYE SOCKETS — huge, deep, glowing ───
  const eyeR = skullR*0.22;
  const eyeY = -skullR*0.1;
  const eyeOffX = skullR*0.32;
  // Deep dark interior
  ctx.fillStyle = '#030201';
  ctx.beginPath();ctx.ellipse(-eyeOffX, eyeY, eyeR, eyeR*1.2, 0, 0, Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(eyeOffX, eyeY, eyeR, eyeR*1.2, 0, 0, Math.PI*2);ctx.fill();
  // Ember glow in sockets — pulsing
  const emberPulse = 0.7 + Math.sin(now/600) * 0.25;
  ctx.shadowColor = '#d97706';
  ctx.shadowBlur = 25 * emberPulse;
  ctx.fillStyle = `rgba(255,140,40,${0.35*emberPulse})`;
  ctx.beginPath();ctx.ellipse(-eyeOffX, eyeY+eyeR*0.3, eyeR*0.5, eyeR*0.6, 0, 0, Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(eyeOffX, eyeY+eyeR*0.3, eyeR*0.5, eyeR*0.6, 0, 0, Math.PI*2);ctx.fill();
  // Hot core
  ctx.fillStyle = `rgba(255,220,120,${0.6*emberPulse})`;
  ctx.beginPath();ctx.arc(-eyeOffX, eyeY+eyeR*0.3, eyeR*0.18, 0, Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(eyeOffX, eyeY+eyeR*0.3, eyeR*0.18, 0, Math.PI*2);ctx.fill();
  ctx.shadowBlur = 0;
  // ─── NASAL CAVITY — large downward triangle ───
  ctx.fillStyle = '#050403';
  ctx.beginPath();
  ctx.moveTo(0, skullR*0.05);
  ctx.lineTo(-skullR*0.12, skullR*0.32);
  ctx.quadraticCurveTo(0, skullR*0.38, skullR*0.12, skullR*0.32);
  ctx.closePath();
  ctx.fill();
  // ─── CRANIAL SUTURE — curved line across the top ───
  ctx.strokeStyle = boneDark;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(-skullR*0.75, -skullR*0.55);
  ctx.quadraticCurveTo(0, -skullR*0.82, skullR*0.75, -skullR*0.55);
  ctx.stroke();
  // Vertical suture down the middle
  ctx.beginPath();
  ctx.moveTo(0, -skullR*0.82);
  ctx.lineTo(-skullR*0.02, -skullR*0.1);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // ─── MAJOR CRACKS across the skull ───
  ctx.strokeStyle = boneShadow;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-skullR*0.5, -skullR*0.6);
  ctx.lineTo(-skullR*0.3, -skullR*0.2);
  ctx.lineTo(-skullR*0.45, skullR*0.1);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(skullR*0.5, -skullR*0.4);
  ctx.lineTo(skullR*0.7, -skullR*0.1);
  ctx.lineTo(skullR*0.45, skullR*0.2);
  ctx.stroke();
  // Sub-cracks
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-skullR*0.3, -skullR*0.2);
  ctx.lineTo(-skullR*0.15, -skullR*0.5);
  ctx.stroke();
  // ─── UPPER TEETH (partial — most is buried) ───
  ctx.strokeStyle = boneDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-skullR*0.35, skullR*0.45);
  ctx.lineTo(skullR*0.35, skullR*0.45);
  ctx.stroke();
  // Tooth gaps
  ctx.lineWidth = 1;
  for(let t=-3;t<=3;t++){
    const tx = t * skullR*0.1;
    ctx.beginPath();
    ctx.moveTo(tx, skullR*0.42);
    ctx.lineTo(tx, skullR*0.48);
    ctx.stroke();
  }
}

// ─── ABYSSAL MIRE: Sunken Altar ───
// Circle of runed stones partially submerged in dark water, chains rising
// from the depths, central altar slab with glowing green runes.
function drawLandmarkSunkenAltar(scale, now){
  const S = 280 * scale;
  const stone = '#1a2410';
  const stoneDark = '#0a1005';
  const stoneLight = '#2a3a1a';
  const waterColor = '#040a05';
  const runeGreen = '#34d399';
  // ─── DARK WATER POOL surrounding the altar ───
  ctx.fillStyle = waterColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, S*0.95, S*0.55, 0, 0, Math.PI*2);
  ctx.fill();
  // Water highlight ring
  ctx.strokeStyle = 'rgba(100,180,130,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, S*0.9, S*0.5, 0, 0, Math.PI*2);
  ctx.stroke();
  // Ripples — animated
  for(let i=0;i<3;i++){
    const rippleT = ((now/4000 + i*0.33)%1);
    ctx.strokeStyle = `rgba(100,200,140,${(1-rippleT)*0.12})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, S*(0.2 + rippleT*0.6), S*(0.11 + rippleT*0.35), 0, 0, Math.PI*2);
    ctx.stroke();
  }
  // ─── STONE CIRCLE — 5 runed standing stones partially in water ───
  const stoneCount = 5;
  for(let i=0;i<stoneCount;i++){
    const ang = (i/stoneCount)*Math.PI*2 - Math.PI/2;
    const dist = S*0.75;
    const sx = Math.cos(ang)*dist;
    const sy = Math.sin(ang)*dist*0.45; // flatten elliptically for perspective
    // Stone height
    const sh = S*0.28;
    // Shadow on water
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.ellipse(sx+4, sy+sh-4, S*0.065, S*0.02, 0, 0, Math.PI*2);
    ctx.fill();
    // Stone body
    ctx.fillStyle = stoneDark;
    ctx.beginPath();
    ctx.moveTo(sx-S*0.055, sy+sh);
    ctx.lineTo(sx-S*0.045, sy-sh*0.2);
    ctx.lineTo(sx-S*0.02, sy-sh);
    ctx.lineTo(sx+S*0.04, sy-sh*0.95);
    ctx.lineTo(sx+S*0.05, sy+sh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.moveTo(sx-S*0.045, sy+sh);
    ctx.lineTo(sx-S*0.04, sy-sh*0.2);
    ctx.lineTo(sx-S*0.015, sy-sh);
    ctx.lineTo(sx+S*0.035, sy-sh*0.95);
    ctx.lineTo(sx+S*0.045, sy+sh);
    ctx.closePath();
    ctx.fill();
    // Rune on stone — pulsing green
    const runePulse = 0.6 + Math.sin(now/900 + i*0.7) * 0.3;
    ctx.shadowColor = runeGreen;
    ctx.shadowBlur = 12 * runePulse;
    ctx.strokeStyle = `rgba(52,211,153,${0.5 + runePulse*0.4})`;
    ctx.lineWidth = 1.2;
    // Simple rune symbol
    ctx.beginPath();
    ctx.arc(sx, sy-sh*0.3, S*0.015, 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx, sy-sh*0.3 - S*0.02);
    ctx.lineTo(sx, sy-sh*0.3 + S*0.02);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx-S*0.02, sy-sh*0.3);
    ctx.lineTo(sx+S*0.02, sy-sh*0.3);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  // ─── CENTRAL ALTAR SLAB ───
  // Lower shadow
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.ellipse(S*0.03, S*0.08, S*0.3, S*0.08, 0, 0, Math.PI*2);
  ctx.fill();
  // Stepped base
  ctx.fillStyle = stoneDark;
  ctx.fillRect(-S*0.26, -S*0.04, S*0.52, S*0.12);
  ctx.fillStyle = stone;
  ctx.fillRect(-S*0.24, -S*0.08, S*0.48, S*0.1);
  // Top slab — the altar table
  ctx.fillStyle = stoneLight;
  ctx.fillRect(-S*0.28, -S*0.11, S*0.56, S*0.04);
  ctx.fillStyle = stoneDark;
  ctx.fillRect(-S*0.28, -S*0.07, S*0.56, S*0.005);
  // Blood / stain / rune pattern on altar top
  const altarPulse = 0.5 + Math.sin(now/800) * 0.3;
  ctx.shadowColor = runeGreen;
  ctx.shadowBlur = 20 * altarPulse;
  ctx.strokeStyle = `rgba(52,211,153,${0.6 * altarPulse})`;
  ctx.lineWidth = 2;
  // Central circle
  ctx.beginPath();
  ctx.ellipse(0, -S*0.09, S*0.08, S*0.02, 0, 0, Math.PI*2);
  ctx.stroke();
  // Inscribed triangle
  ctx.beginPath();
  ctx.moveTo(-S*0.06, -S*0.09);
  ctx.lineTo(S*0.06, -S*0.09);
  ctx.lineTo(0, -S*0.07);
  ctx.closePath();
  ctx.stroke();
  ctx.shadowBlur = 0;
  // ─── CHAINS rising from water around the altar ───
  ctx.strokeStyle = '#2a2418';
  ctx.lineWidth = 3;
  for(let c=0;c<3;c++){
    const cang = -Math.PI/2 + (c-1)*0.8;
    const cr = S*0.45;
    const sway = Math.sin(now/1500 + c) * 5;
    const sx = Math.cos(cang) * cr + sway;
    const sy = Math.sin(cang) * cr * 0.5 + S*0.05;
    const ex = sx + Math.sin(cang + now/3000)*S*0.04;
    const ey = sy - S*0.3 - c*S*0.04;
    // Chain link pattern — alternating ovals
    const segments = 8;
    for(let seg=0; seg<segments; seg++){
      const t = seg/segments;
      const lx = sx + (ex-sx)*t + Math.sin(now/800 + c + seg*0.3)*2;
      const ly = sy + (ey-sy)*t;
      const ls = S*0.012;
      ctx.fillStyle = seg%2===0 ? '#3a3428' : '#1a1408';
      ctx.beginPath();
      ctx.ellipse(lx, ly, ls, ls*1.3, t*Math.PI, 0, Math.PI*2);
      ctx.fill();
    }
  }
}

// ─── VEIL'S SPIRE: Obsidian Monolith ───
// Jagged black glass spire crackling with red veil energy, surrounded by
// cracked ground with molten fissures, towering above the landscape.
function drawLandmarkObsidianMonolith(scale, now){
  const S = 290 * scale;
  const obsidian = '#0a0206';
  const obsidianMid = '#15040a';
  const obsidianHighlight = '#2a0a14';
  const veilRed = '#ff2020';
  const veilGlow = 'rgba(255,40,40,';
  // ─── CRACKED GROUND with molten fissures around the base ───
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();ctx.ellipse(0, S*0.4, S*0.95, S*0.2, 0, 0, Math.PI*2);ctx.fill();
  // Molten fissures radiating from base — glowing red cracks
  const cracksPulse = 0.6 + Math.sin(now/1200)*0.3;
  for(let f=0;f<6;f++){
    const fang = (f/6)*Math.PI*2 + 0.3;
    const fLen = S*(0.5 + (f*0.37)%1 * 0.3);
    ctx.save();
    ctx.rotate(fang);
    // Outer glow
    ctx.shadowColor = veilRed;
    ctx.shadowBlur = 15 * cracksPulse;
    ctx.strokeStyle = veilGlow + (0.3*cracksPulse) + ')';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(S*0.3, S*0.4);
    ctx.lineTo(S*0.3 + fLen*0.4, S*0.38);
    ctx.lineTo(S*0.3 + fLen*0.7, S*0.45);
    ctx.lineTo(S*0.3 + fLen, S*0.42);
    ctx.stroke();
    // Inner bright line
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#ffaa60';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  // ─── MONOLITH SHAFT — jagged obsidian spire ───
  const monoBotY = S*0.4;
  const monoTopY = -S*1.3; // very tall
  // Build irregular angular silhouette
  const leftPath = [];
  const rightPath = [];
  const baseHalfW = S*0.22;
  const topHalfW = S*0.08;
  const segments = 8;
  for(let i=0;i<=segments;i++){
    const t = i/segments;
    const y = monoBotY + (monoTopY - monoBotY) * t;
    // Taper
    const taperW = baseHalfW * (1-t) + topHalfW * t;
    // Jagged irregularity
    const jaggyL = ((i*3.7+0.2)%1 - 0.5) * S*0.04;
    const jaggyR = ((i*4.3+0.6)%1 - 0.5) * S*0.04;
    leftPath.push({x: -taperW + jaggyL, y: y});
    rightPath.push({x: taperW + jaggyR, y: y});
  }
  // Shadow offset
  ctx.fillStyle = '#000';
  ctx.beginPath();
  leftPath.forEach((p,i)=>{
    const x=p.x+S*0.05, y=p.y+S*0.02;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  for(let i=rightPath.length-1;i>=0;i--){
    const p=rightPath[i];
    ctx.lineTo(p.x+S*0.05, p.y+S*0.02);
  }
  ctx.closePath();ctx.fill();
  // Main body
  ctx.fillStyle = obsidian;
  ctx.beginPath();
  leftPath.forEach((p,i)=>{
    if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
  });
  for(let i=rightPath.length-1;i>=0;i--){
    const p=rightPath[i];
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();ctx.fill();
  // Left lit edge — obsidian catches light along one side
  ctx.strokeStyle = obsidianHighlight;
  ctx.lineWidth = 2;
  ctx.beginPath();
  leftPath.forEach((p,i)=>{
    if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
  });
  ctx.stroke();
  // ─── RED VEIL VEINS — glowing cracks pulsing up the shaft ───
  ctx.save();
  const veinPulse = 0.55 + Math.sin(now/600)*0.35;
  ctx.shadowColor = veilRed;
  ctx.shadowBlur = 20 * veinPulse;
  // Main vertical vein — zigzag up the monolith
  ctx.strokeStyle = veilGlow + (0.7*veinPulse) + ')';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, monoBotY - S*0.05);
  ctx.lineTo(S*0.04, monoBotY - S*0.3);
  ctx.lineTo(-S*0.03, monoBotY - S*0.6);
  ctx.lineTo(S*0.02, monoBotY - S*0.9);
  ctx.lineTo(-S*0.02, monoTopY + S*0.15);
  ctx.stroke();
  // Bright inner core
  ctx.strokeStyle = '#ffccdd';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Branch veins
  ctx.strokeStyle = veilGlow + (0.5*veinPulse) + ')';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(S*0.04, monoBotY - S*0.3);
  ctx.lineTo(S*0.12, monoBotY - S*0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-S*0.03, monoBotY - S*0.6);
  ctx.lineTo(-S*0.12, monoBotY - S*0.75);
  ctx.stroke();
  ctx.restore();
  // ─── PEAK GLOW — pulsing aura at the top ───
  const peakPulse = 0.7 + Math.sin(now/400)*0.3;
  ctx.shadowColor = veilRed;
  ctx.shadowBlur = 50 * peakPulse;
  ctx.fillStyle = `rgba(255,80,80,${0.3 * peakPulse})`;
  ctx.beginPath();
  ctx.arc(0, monoTopY + S*0.1, S*0.12, 0, Math.PI*2);
  ctx.fill();
  // Hot core
  ctx.fillStyle = `rgba(255,220,200,${0.7 * peakPulse})`;
  ctx.beginPath();
  ctx.arc(0, monoTopY + S*0.1, S*0.04, 0, Math.PI*2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // ─── OBSIDIAN SHARDS around the base ───
  for(let s2=0; s2<5; s2++){
    const sang = (s2/5)*Math.PI*2 + 0.4;
    const sdist = S*0.35 + ((s2*1.37)%1)*S*0.1;
    const sx = Math.cos(sang)*sdist;
    const sy = Math.sin(sang)*sdist*0.4 + S*0.35;
    const ss = S*(0.06+((s2*2.13)%1)*0.04);
    ctx.fillStyle = obsidian;
    ctx.beginPath();
    ctx.moveTo(sx, sy-ss);
    ctx.lineTo(sx+ss*0.5, sy);
    ctx.lineTo(sx, sy+ss*0.3);
    ctx.lineTo(sx-ss*0.5, sy);
    ctx.closePath();
    ctx.fill();
    // Highlight edge
    ctx.strokeStyle = obsidianHighlight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy-ss);
    ctx.lineTo(sx-ss*0.5, sy);
    ctx.stroke();
  }
}

function drawProp(p,now){
  const z=getActiveTheme(),s=p.sz,seed=p.seed;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);
  switch(p.type){
    case 'ashStone':{
      // Purple-gray ashen stone — angular silhouette with layered tones
      const stone='#2a1f3a';
      const stoneDark='#120a22';
      const stoneMid='#1f1530';
      const stoneLight='#3d2a52';
      const stoneCrack='#080416';
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.5)';
      ctx.beginPath();ctx.ellipse(s*.06,s*.2,s*.62,s*.14,0,0,Math.PI*2);ctx.fill();
      // 6-8 vertex irregular silhouette
      const verts=6+Math.floor(rngF(seed+5)*3);
      const pts=[];
      for(let v=0;v<verts;v++){
        const a=(v/verts)*Math.PI*2+rngF(seed+v*11)*0.3;
        const r=s*(0.5+rngF(seed+v*17)*0.26);
        // Squashed flat — ashen stones are lower profile
        pts.push({x:Math.cos(a)*r, y:Math.sin(a)*r*0.52});
      }
      // Layer 1: deep shadow
      ctx.fillStyle=stoneDark;
      ctx.beginPath();
      pts.forEach((pt,idx)=>{
        const x=pt.x+s*0.08, y=pt.y+s*0.12;
        if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.closePath();
      ctx.fill();
      // Layer 2: mid body
      ctx.fillStyle=stoneMid;
      ctx.beginPath();
      pts.forEach((pt,idx)=>{
        if(idx===0)ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y);
      });
      ctx.closePath();
      ctx.fill();
      // Layer 3: main stone body
      ctx.fillStyle=stone;
      ctx.beginPath();
      pts.forEach((pt,idx)=>{
        const x=pt.x*0.94, y=pt.y*0.94 - s*0.02;
        if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.closePath();
      ctx.fill();
      // Layer 4: dark outline
      ctx.strokeStyle=stoneCrack;
      ctx.lineWidth=0.9;
      ctx.stroke();
      // Lit upper facet
      const litPts=[];
      pts.forEach(pt=>{
        if(pt.y < 0 && pt.x < s*0.15){
          litPts.push({x:pt.x*0.7 - s*0.06, y:pt.y*0.7 - s*0.04});
        }
      });
      if(litPts.length >= 3){
        ctx.fillStyle=stoneLight;
        ctx.beginPath();
        litPts.forEach((pt,idx)=>{
          if(idx===0)ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y);
        });
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
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
    case 'ruinWall':{
      // Weathered stone wall fragment — angular broken top, layered tones,
      // cracks and moss. Reads as a ruined structure, not a narrow rectangle.
      const wallMain='#1a1238';
      const wallShadow='#0a0620';
      const wallMid='#120c2a';
      const wallLight='#2a1e52';
      const wallMoss=z.mossColor||'#2a4018';
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.beginPath();ctx.ellipse(s*.02,s*.8,s*.32,s*.12,0,0,Math.PI*2);ctx.fill();
      // Wall silhouette — vertical rectangle with jagged broken top
      // Start at bottom-left, go up to jagged top, across, and back down
      const topJags=5+Math.floor(rngF(seed)*3);
      const wallWidth=s*0.5;
      const wallHeight=s*1.7;
      const halfW=wallWidth/2;
      const topY=-s*0.85;
      const botY=topY+wallHeight;
      // Build path
      const pathPts=[];
      pathPts.push({x:-halfW, y:botY}); // bottom-left
      pathPts.push({x:-halfW, y:topY + s*0.1 + rngF(seed+1)*s*0.15}); // up left side (slightly irregular)
      // Jagged top
      for(let i=0;i<=topJags;i++){
        const t=i/topJags;
        const jagX=-halfW + t*wallWidth;
        const jagY=topY + (rngF(seed+i*13)*s*0.22) + Math.sin(t*Math.PI*2.3)*s*0.05;
        pathPts.push({x:jagX, y:jagY});
      }
      pathPts.push({x:halfW, y:topY + s*0.12 + rngF(seed+7)*s*0.15}); // right side upper
      pathPts.push({x:halfW, y:botY}); // bottom-right
      // Layer 1: deep shadow offset
      ctx.fillStyle=wallShadow;
      ctx.beginPath();
      pathPts.forEach((pt,idx)=>{
        const x=pt.x+s*0.06, y=pt.y+s*0.05;
        if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.closePath();
      ctx.fill();
      // Layer 2: mid
      ctx.fillStyle=wallMid;
      ctx.beginPath();
      pathPts.forEach((pt,idx)=>{
        if(idx===0)ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y);
      });
      ctx.closePath();
      ctx.fill();
      // Layer 3: main body (slightly inset for bevel look)
      ctx.fillStyle=wallMain;
      ctx.beginPath();
      pathPts.forEach((pt,idx)=>{
        const x=pt.x*0.93, y=pt.y;
        if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.closePath();
      ctx.fill();
      // Layer 4: left-side lit facet (suggests upper-left light source)
      ctx.fillStyle=wallLight;
      ctx.fillRect(-halfW*0.88, topY+s*0.15, s*0.06, wallHeight*0.82);
      // Dark outline
      ctx.strokeStyle=wallShadow;
      ctx.lineWidth=1.2;
      ctx.beginPath();
      pathPts.forEach((pt,idx)=>{
        if(idx===0)ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y);
      });
      ctx.closePath();
      ctx.stroke();
      // Cracks — diagonal fissures
      ctx.strokeStyle=wallShadow;
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(-halfW*0.3, topY+s*0.35);
      ctx.lineTo(halfW*0.1, topY+s*0.6);
      ctx.lineTo(-halfW*0.2, botY-s*0.3);
      ctx.stroke();
      // Secondary crack
      ctx.lineWidth=0.7;
      ctx.beginPath();
      ctx.moveTo(halfW*0.4, topY+s*0.5);
      ctx.lineTo(halfW*0.6, botY-s*0.4);
      ctx.stroke();
      // Moss at base
      ctx.fillStyle=wallMoss;
      ctx.globalAlpha=0.6;
      ctx.beginPath();ctx.ellipse(-halfW*0.3, botY-s*0.06, s*0.14, s*0.05, 0, 0, Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(halfW*0.4, botY-s*0.04, s*0.1, s*0.04, 0, 0, Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
      break;
    }
    case 'bonePile':{
      // A pile of bones — long bones (with knobbed ends), skull, ribs.
      // Reads as a real pile, not a spider silhouette.
      const boneCol='#c8bca0';     // bleached bone
      const boneDark='#7a6c4a';    // shadow side
      const boneShadow='#3a3020';  // cast shadow
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.4)';
      ctx.beginPath();ctx.ellipse(0,s*.15,s*.55,s*.18,0,0,Math.PI*2);ctx.fill();
      // 2-3 long bones, each with knobbed ends (femur-style)
      const boneCount=2+Math.floor(rngF(seed+1)%1*2);
      for(let i=0;i<boneCount;i++){
        const angle=rngF(seed+i*11)*Math.PI*2;
        const len=s*(0.55+rngF(seed+i*13)*0.25);
        const cx=Math.cos(angle+Math.PI/2)*s*0.1*(i-boneCount/2);
        const cy=Math.sin(angle+Math.PI/2)*s*0.1*(i-boneCount/2) + s*0.05;
        const x1=cx-Math.cos(angle)*len*0.5;
        const y1=cy-Math.sin(angle)*len*0.5;
        const x2=cx+Math.cos(angle)*len*0.5;
        const y2=cy+Math.sin(angle)*len*0.5;
        // Shaft shadow
        ctx.strokeStyle=boneShadow;
        ctx.lineWidth=s*0.11;
        ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(x1+1,y1+1.5);
        ctx.lineTo(x2+1,y2+1.5);
        ctx.stroke();
        // Shaft main body
        ctx.strokeStyle=boneCol;
        ctx.lineWidth=s*0.085;
        ctx.beginPath();
        ctx.moveTo(x1,y1);
        ctx.lineTo(x2,y2);
        ctx.stroke();
        // Knobbed ends (epiphyses)
        ctx.fillStyle=boneShadow;
        ctx.beginPath();ctx.arc(x1+0.5,y1+0.8,s*0.085,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(x2+0.5,y2+0.8,s*0.085,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=boneCol;
        ctx.beginPath();ctx.arc(x1,y1,s*0.07,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(x2,y2,s*0.07,0,Math.PI*2);ctx.fill();
        // Darker socket detail on one end
        ctx.fillStyle=boneDark;
        ctx.beginPath();ctx.arc(x1,y1,s*0.025,0,Math.PI*2);ctx.fill();
      }
      // Skull — small, centered, partially buried
      const skullX=rngF(seed+7)*s*0.12;
      const skullY=s*0.02+rngF(seed+3)*s*0.05;
      const skullR=s*0.15;
      // Skull shadow
      ctx.fillStyle=boneShadow;
      ctx.beginPath();ctx.ellipse(skullX+1,skullY+1.5,skullR*1.05,skullR*0.82,0,0,Math.PI*2);ctx.fill();
      // Skull dome
      ctx.fillStyle=boneCol;
      ctx.beginPath();ctx.ellipse(skullX,skullY,skullR,skullR*0.78,0,0,Math.PI*2);ctx.fill();
      // Eye sockets
      ctx.fillStyle='#0c0805';
      ctx.beginPath();ctx.ellipse(skullX-skullR*0.34,skullY-skullR*0.05,skullR*0.22,skullR*0.28,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(skullX+skullR*0.34,skullY-skullR*0.05,skullR*0.22,skullR*0.28,0,0,Math.PI*2);ctx.fill();
      // Nasal cavity — small triangle
      ctx.beginPath();
      ctx.moveTo(skullX,skullY+skullR*0.1);
      ctx.lineTo(skullX-skullR*0.1,skullY+skullR*0.28);
      ctx.lineTo(skullX+skullR*0.1,skullY+skullR*0.28);
      ctx.closePath();ctx.fill();
      // Teeth line
      ctx.strokeStyle=boneDark;
      ctx.lineWidth=0.8;
      ctx.beginPath();ctx.moveTo(skullX-skullR*0.3,skullY+skullR*0.42);ctx.lineTo(skullX+skullR*0.3,skullY+skullR*0.42);ctx.stroke();
      // Rib fragments scattered — small curves
      ctx.strokeStyle=boneCol;
      ctx.lineWidth=s*0.03;
      ctx.lineCap='round';
      for(let r=0;r<2;r++){
        const ra=rngF(seed+r*19+101)*Math.PI*2;
        const rd=s*(0.32+rngF(seed+r*23)*0.15);
        const rx=Math.cos(ra)*rd;
        const ry=Math.sin(ra)*rd*0.5+s*0.08;
        ctx.beginPath();
        ctx.arc(rx,ry,s*0.11,ra-0.4,ra+0.4);
        ctx.stroke();
      }
      break;
    }
    case 'cryptPillar':{
      // Classical stone pillar — base, fluted shaft, crumbled top (capital broken off).
      // Proper architectural silhouette with tonal layers.
      const stone='#1a1410';
      const stoneShadow='#0a0804';
      const stoneMid='#120e0a';
      const stoneLight='#2a2016';
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.beginPath();ctx.ellipse(s*.02,s*.9,s*.48,s*.15,0,0,Math.PI*2);ctx.fill();
      const shaftW=s*0.28;
      const shaftHalf=shaftW/2;
      const baseY=s*0.82;
      const shaftTop=-s*0.55;
      const topBrokenY=-s*0.85;
      // Base: wide stepped plinth
      // Bottom step
      ctx.fillStyle=stoneShadow;
      ctx.fillRect(-s*0.42, baseY-s*0.02, s*0.84, s*0.1);
      ctx.fillStyle=stoneMid;
      ctx.fillRect(-s*0.4, baseY-s*0.06, s*0.8, s*0.1);
      // Upper step
      ctx.fillStyle=stone;
      ctx.fillRect(-s*0.34, baseY-s*0.12, s*0.68, s*0.08);
      // Shaft with irregular broken top — polygon
      const shaftPts=[
        {x:-shaftHalf, y:baseY-s*0.12},
        {x:-shaftHalf, y:topBrokenY+s*0.08+rngF(seed)*s*0.05},
      ];
      // Broken top — irregular jagged edge
      const tt=4+Math.floor(rngF(seed+3)*3);
      for(let i=0;i<=tt;i++){
        const t=i/tt;
        shaftPts.push({
          x: -shaftHalf + t*shaftW,
          y: topBrokenY + rngF(seed+i*17)*s*0.12 + Math.sin(t*Math.PI*2)*s*0.04,
        });
      }
      shaftPts.push({x:shaftHalf, y:topBrokenY+s*0.1+rngF(seed+5)*s*0.06});
      shaftPts.push({x:shaftHalf, y:baseY-s*0.12});
      // Layer 1: shaft shadow
      ctx.fillStyle=stoneShadow;
      ctx.beginPath();
      shaftPts.forEach((pt,idx)=>{
        const x=pt.x+s*0.03, y=pt.y+s*0.02;
        if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.closePath();ctx.fill();
      // Layer 2: shaft body
      ctx.fillStyle=stone;
      ctx.beginPath();
      shaftPts.forEach((pt,idx)=>{
        if(idx===0)ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y);
      });
      ctx.closePath();ctx.fill();
      // Layer 3: left-side lit edge — thin vertical band
      ctx.fillStyle=stoneLight;
      ctx.fillRect(-shaftHalf+1, topBrokenY+s*0.1, s*0.04, baseY-s*0.12-(topBrokenY+s*0.1));
      // Flutes — vertical grooves on shaft (3 grooves)
      ctx.strokeStyle=stoneShadow;
      ctx.lineWidth=0.9;
      for(let i=1;i<=3;i++){
        const fx=-shaftHalf + (i/4)*shaftW;
        ctx.beginPath();
        ctx.moveTo(fx, topBrokenY+s*0.18);
        ctx.lineTo(fx, baseY-s*0.14);
        ctx.stroke();
      }
      // Outline
      ctx.strokeStyle=stoneShadow;
      ctx.lineWidth=1.1;
      ctx.beginPath();
      shaftPts.forEach((pt,idx)=>{
        if(idx===0)ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y);
      });
      ctx.closePath();ctx.stroke();
      // Crack on shaft
      ctx.strokeStyle=stoneShadow;
      ctx.lineWidth=0.8;
      ctx.beginPath();
      ctx.moveTo(-shaftHalf*0.5, shaftTop+s*0.2);
      ctx.lineTo(shaftHalf*0.3, baseY-s*0.4);
      ctx.stroke();
      break;
    }
    case 'sarcophagus':
      ctx.fillStyle='#18120a';ctx.strokeStyle='#2a1e10';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.roundRect(-s*.32,-s*.62,s*.64,s*1.24,4);ctx.fill();ctx.stroke();
      ctx.strokeStyle='#32261a';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,-s*.22,s*.14,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,-s*.45);ctx.lineTo(0,s*.3);ctx.stroke();
      ctx.shadowColor='#d97706';ctx.shadowBlur=5;ctx.strokeStyle='rgba(217,119,6,0.18)';ctx.lineWidth=.8;
      ctx.beginPath();ctx.moveTo(-s*.05,-s*.3);ctx.lineTo(s*.08,s*.2);ctx.stroke();break;
    case 'cryptTomb':{
      // Stone tomb structure with beveled sides, sunken recess, arched alcove.
      // Reads as a proper crypt structure, not a flat rectangle.
      const stone='#1a1410';
      const stoneShadow='#0a0704';
      const stoneMid='#130e0a';
      const stoneLight='#2a2218';
      const arcDark='#050302';
      const emberColor='rgba(217,119,6,0.25)';
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.beginPath();ctx.ellipse(s*.02,s*.32,s*.52,s*.12,0,0,Math.PI*2);ctx.fill();
      // Base body — trapezoidal (wider at bottom)
      const topY=-s*0.35;
      const botY=s*0.22;
      const topHalf=s*0.38;
      const botHalf=s*0.44;
      // Shadow offset
      ctx.fillStyle=stoneShadow;
      ctx.beginPath();
      ctx.moveTo(-topHalf+s*0.04, topY+s*0.03);
      ctx.lineTo(topHalf+s*0.04, topY+s*0.03);
      ctx.lineTo(botHalf+s*0.04, botY+s*0.03);
      ctx.lineTo(-botHalf+s*0.04, botY+s*0.03);
      ctx.closePath();ctx.fill();
      // Main body
      ctx.fillStyle=stone;
      ctx.beginPath();
      ctx.moveTo(-topHalf, topY);
      ctx.lineTo(topHalf, topY);
      ctx.lineTo(botHalf, botY);
      ctx.lineTo(-botHalf, botY);
      ctx.closePath();ctx.fill();
      // Left-side lit bevel
      ctx.fillStyle=stoneLight;
      ctx.beginPath();
      ctx.moveTo(-topHalf, topY);
      ctx.lineTo(-topHalf+s*0.05, topY+s*0.02);
      ctx.lineTo(-botHalf+s*0.06, botY);
      ctx.lineTo(-botHalf, botY);
      ctx.closePath();ctx.fill();
      // Outline
      ctx.strokeStyle=stoneShadow;
      ctx.lineWidth=1.2;
      ctx.beginPath();
      ctx.moveTo(-topHalf, topY);
      ctx.lineTo(topHalf, topY);
      ctx.lineTo(botHalf, botY);
      ctx.lineTo(-botHalf, botY);
      ctx.closePath();ctx.stroke();
      // Archway recess — dark arched opening in the front face
      const arcW=s*0.28;
      const arcH=s*0.4;
      const arcCenterY=s*0.02;
      // Recess shadow (deep dark)
      ctx.fillStyle=arcDark;
      ctx.beginPath();
      ctx.moveTo(-arcW/2, arcCenterY+arcH/2);
      ctx.lineTo(-arcW/2, arcCenterY-arcH/4);
      ctx.quadraticCurveTo(-arcW/2, arcCenterY-arcH/2, 0, arcCenterY-arcH/2);
      ctx.quadraticCurveTo(arcW/2, arcCenterY-arcH/2, arcW/2, arcCenterY-arcH/4);
      ctx.lineTo(arcW/2, arcCenterY+arcH/2);
      ctx.closePath();ctx.fill();
      // Arch frame
      ctx.strokeStyle=stoneMid;
      ctx.lineWidth=1.5;
      ctx.stroke();
      // Ember glow inside the arch (subtle)
      ctx.shadowColor='#d97706';
      ctx.shadowBlur=10;
      ctx.fillStyle=emberColor;
      ctx.beginPath();ctx.ellipse(0, arcCenterY+arcH*0.2, arcW*0.3, arcH*0.15, 0, 0, Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;
      // Cracks on the facade
      ctx.strokeStyle=stoneShadow;
      ctx.lineWidth=0.9;
      ctx.beginPath();
      ctx.moveTo(-topHalf*0.7, topY+s*0.05);
      ctx.lineTo(-arcW*0.7, arcCenterY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(topHalf*0.75, topY+s*0.08);
      ctx.lineTo(arcW*0.6, arcCenterY-s*0.05);
      ctx.stroke();
      break;
    }
    case 'skullPile':{
      // Stack of 3-4 skulls — proper anatomy (eye sockets, nasal cavity, teeth)
      // with shadow layering and cast shadows for depth.
      const boneCol='#b8ac92';
      const boneDark='#6a5c40';
      const boneShadow='#2a2218';
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.45)';
      ctx.beginPath();ctx.ellipse(0,s*.22,s*.58,s*.16,0,0,Math.PI*2);ctx.fill();
      // 3-4 skulls arranged as a pile — some stacked, some spread
      const skullCount=3+Math.floor(rngF(seed+1)%1*2);
      const skulls=[];
      for(let i=0;i<skullCount;i++){
        const sa=rngF(seed+i*19)*Math.PI*2;
        const sd=rngF(seed+i*23)*s*0.25;
        // Stack roughly — offset y based on which "layer" of the pile
        const row=Math.floor(i/2);
        skulls.push({
          x: Math.cos(sa)*sd + (i%2 === 0 ? -s*0.12 : s*0.12),
          y: s*0.12 - row*s*0.18 + Math.sin(sa)*sd*0.3,
          r: s*(0.17+rngF(seed+i*29)*0.06),
          tilt: (rngF(seed+i*31)-0.5)*0.5,
        });
      }
      // Sort by y so farther-back skulls draw first (correct painter's order)
      skulls.sort((a,b)=>a.y-b.y);
      skulls.forEach(sk=>{
        ctx.save();
        ctx.translate(sk.x, sk.y);
        ctx.rotate(sk.tilt);
        const r=sk.r;
        // Cast shadow
        ctx.fillStyle=boneShadow;
        ctx.beginPath();ctx.ellipse(r*0.08, r*0.1, r*1.02, r*0.85, 0, 0, Math.PI*2);ctx.fill();
        // Main skull dome
        ctx.fillStyle=boneCol;
        ctx.beginPath();ctx.ellipse(0, 0, r, r*0.82, 0, 0, Math.PI*2);ctx.fill();
        // Subtle dark shadow on one side for dimension
        ctx.fillStyle=boneDark;
        ctx.globalAlpha=0.35;
        ctx.beginPath();ctx.ellipse(r*0.25, r*0.1, r*0.6, r*0.55, 0, 0, Math.PI*2);ctx.fill();
        ctx.globalAlpha=1;
        // Eye sockets — deep dark holes
        ctx.fillStyle='#080604';
        ctx.beginPath();ctx.ellipse(-r*0.34, -r*0.08, r*0.22, r*0.28, 0, 0, Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(r*0.34, -r*0.08, r*0.22, r*0.28, 0, 0, Math.PI*2);ctx.fill();
        // Subtle highlight dot inside each socket (catches the eye)
        ctx.fillStyle='rgba(180,40,40,0.25)';
        ctx.beginPath();ctx.arc(-r*0.34, -r*0.08, r*0.06, 0, Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(r*0.34, -r*0.08, r*0.06, 0, Math.PI*2);ctx.fill();
        // Nasal cavity — upside-down teardrop
        ctx.fillStyle='#080604';
        ctx.beginPath();
        ctx.moveTo(0, r*0.08);
        ctx.lineTo(-r*0.11, r*0.3);
        ctx.lineTo(r*0.11, r*0.3);
        ctx.closePath();
        ctx.fill();
        // Teeth line
        ctx.strokeStyle=boneDark;
        ctx.lineWidth=0.9;
        ctx.beginPath();ctx.moveTo(-r*0.32, r*0.44);ctx.lineTo(r*0.32, r*0.44);ctx.stroke();
        // Tiny tooth gaps
        ctx.lineWidth=0.5;
        for(let t=-3;t<=3;t++){
          ctx.beginPath();ctx.moveTo(t*r*0.1, r*0.42);ctx.lineTo(t*r*0.1, r*0.48);ctx.stroke();
        }
        // Cranial suture line — subtle curved line across top
        ctx.strokeStyle=boneDark;
        ctx.lineWidth=0.6;
        ctx.globalAlpha=0.6;
        ctx.beginPath();
        ctx.moveTo(-r*0.4, -r*0.4);
        ctx.quadraticCurveTo(0, -r*0.58, r*0.4, -r*0.4);
        ctx.stroke();
        ctx.globalAlpha=1;
        ctx.restore();
      });
      break;
    }
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
      // 3-5 angular stone clusters with proper rock silhouettes, not circles
      // Each rock is a jagged polygon (6-8 vertices) with deterministic
      // per-vertex variance giving natural stone shape.
      const baseGray='#4a4a52';
      const shadowGray='#25252c';
      const midGray='#3a3a42';
      const highlightGray='#6a6a74';
      const crackGray='#18181e';
      // Ground shadow pool
      ctx.fillStyle='rgba(0,0,0,0.45)';
      ctx.beginPath();ctx.ellipse(0,s*.08,s*.58,s*.2,0,0,Math.PI*2);ctx.fill();
      const rockCount=3+Math.floor(rngF(seed)*3);
      for(let i=0;i<rockCount;i++){
        const ra=rngF(seed+i*17)*Math.PI*2;
        const rd=rngF(seed+i*23)*s*.28;
        const rx=Math.cos(ra)*rd;
        const ry=Math.sin(ra)*rd*0.55; // flatter vertical distribution
        const rs=s*(.16+rngF(seed+i*41)*.22);
        // Build the rock's jagged silhouette — 6-8 vertices around center
        const verts=6+Math.floor(rngF(seed+i*53)%1*3);
        const pts=[];
        for(let v=0;v<verts;v++){
          const a=(v/verts)*Math.PI*2+rngF(seed+i*61+v*7)*0.4;
          // Radius varies per-vertex for irregular silhouette
          const r=rs*(0.78+rngF(seed+i*83+v*11)*0.32);
          // Squash vertically so rocks look grounded, not round
          pts.push({x:Math.cos(a)*r, y:Math.sin(a)*r*0.78});
        }
        // Layer 1: deep shadow body (offset down-right, darker)
        ctx.fillStyle=shadowGray;
        ctx.beginPath();
        pts.forEach((pt,idx)=>{
          const x=rx+pt.x+rs*0.15, y=ry+pt.y+rs*0.25;
          if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
        });
        ctx.closePath();
        ctx.fill();
        // Layer 2: main rock body (base color)
        ctx.fillStyle=baseGray;
        ctx.beginPath();
        pts.forEach((pt,idx)=>{
          const x=rx+pt.x, y=ry+pt.y;
          if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
        });
        ctx.closePath();
        ctx.fill();
        // Layer 3: dark edge outline for definition
        ctx.strokeStyle=crackGray;
        ctx.lineWidth=1;
        ctx.stroke();
        // Layer 4: top-left lit facet (lighter polygon in upper quadrant)
        // Build a smaller polygon using only upper vertices, gives the impression of a lit face
        ctx.fillStyle=highlightGray;
        ctx.beginPath();
        const upperPts=[];
        pts.forEach(pt=>{
          if(pt.y < rs*0.1){ // upper half
            // Pull slightly toward center for lit facet size
            upperPts.push({x:pt.x*0.75 - rs*0.05, y:pt.y*0.75 - rs*0.1});
          }
        });
        if(upperPts.length >= 3){
          upperPts.forEach((pt,idx)=>{
            const x=rx+pt.x, y=ry+pt.y;
            if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
          });
          ctx.closePath();
          ctx.fill();
        }
        // Layer 5: crack detail (thin line across the stone)
        if(rs > s*0.2){  // only on larger rocks
          ctx.strokeStyle=crackGray;
          ctx.lineWidth=0.8;
          const ca=rngF(seed+i*71)*Math.PI*2;
          const cl=rs*0.5;
          ctx.beginPath();
          ctx.moveTo(rx+Math.cos(ca)*cl*-0.4, ry+Math.sin(ca)*cl*-0.4);
          ctx.lineTo(rx+Math.cos(ca+0.3)*cl*0.2, ry+Math.sin(ca+0.3)*cl*0.2);
          ctx.lineTo(rx+Math.cos(ca)*cl*0.5, ry+Math.sin(ca)*cl*0.5);
          ctx.stroke();
        }
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
      // Single large angular stone — proper polygonal silhouette with
      // multiple tonal layers and crack details. Reads as a sculpted rock.
      const stone='#555560';
      const stoneDark='#25252c';
      const stoneMid='#3c3c44';
      const stoneLight='#72727c';
      const stoneCrack='#15151a';
      const stoneMoss=z.mossColor||'#3a5a2a';
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.6)';
      ctx.beginPath();ctx.ellipse(s*.1,s*.55,s*.7,s*.2,0,0,Math.PI*2);ctx.fill();
      // Build boulder silhouette — 8-10 vertices, more asymmetric than rock cluster
      const verts=8+Math.floor(rngF(seed+3)*3);
      const pts=[];
      for(let v=0;v<verts;v++){
        const a=(v/verts)*Math.PI*2+rngF(seed+v*13)*0.35;
        const r=s*(0.6+rngF(seed+v*19)*0.28);
        // Squash vertically so boulder sits on ground
        pts.push({x:Math.cos(a)*r, y:Math.sin(a)*r*0.72});
      }
      // Layer 1: deep shadow body (offset, darker — gives weight)
      ctx.fillStyle=stoneDark;
      ctx.beginPath();
      pts.forEach((pt,idx)=>{
        const x=pt.x+s*0.12, y=pt.y+s*0.18;
        if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.closePath();
      ctx.fill();
      // Layer 2: mid-tone transition
      ctx.fillStyle=stoneMid;
      ctx.beginPath();
      pts.forEach((pt,idx)=>{
        const x=pt.x+s*0.05, y=pt.y+s*0.06;
        if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.closePath();
      ctx.fill();
      // Layer 3: main stone body
      ctx.fillStyle=stone;
      ctx.beginPath();
      pts.forEach((pt,idx)=>{
        if(idx===0)ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y);
      });
      ctx.closePath();
      ctx.fill();
      // Layer 4: dark outline
      ctx.strokeStyle=stoneCrack;
      ctx.lineWidth=1.2;
      ctx.stroke();
      // Layer 5: lit top-left facet — polygon of upper vertices pulled inward
      const litPts=[];
      pts.forEach(pt=>{
        if(pt.y < s*0.08 && pt.x < s*0.2){ // upper-left quadrant
          litPts.push({x:pt.x*0.72 - s*0.08, y:pt.y*0.72 - s*0.04});
        }
      });
      if(litPts.length >= 3){
        ctx.fillStyle=stoneLight;
        ctx.beginPath();
        litPts.forEach((pt,idx)=>{
          if(idx===0)ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y);
        });
        ctx.closePath();
        ctx.fill();
      }
      // Layer 6: crack details — branching fissure across the main face
      ctx.strokeStyle=stoneCrack;
      ctx.lineWidth=1.4;
      ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(-s*.32,-s*.08);
      ctx.lineTo(-s*.08,s*.1);
      ctx.lineTo(s*.18,s*.04);
      ctx.lineTo(s*.3,s*.12);
      ctx.stroke();
      // Branch crack
      ctx.lineWidth=0.9;
      ctx.beginPath();
      ctx.moveTo(-s*.08,s*.1);
      ctx.lineTo(-s*.04,s*.28);
      ctx.stroke();
      // Layer 7: moss patches — zone-themed accent color on upper surface
      ctx.fillStyle=stoneMoss;
      ctx.globalAlpha=0.75;
      ctx.beginPath();ctx.ellipse(s*.13,-s*.28,s*.2,s*.08,0.3,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=0.55;
      ctx.beginPath();ctx.ellipse(-s*.22,-s*.22,s*.12,s*.05,-0.2,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;
      break;
    }

    // ═══════════════════════════════════════════════════════════════
    // NEW PROP TYPES — added for zone density/variety overhaul
    // ═══════════════════════════════════════════════════════════════

    case 'tallDeadTree':{
      // Towering withered tree — 2x taller than deadTree, more branching,
      // gnarled limbs reaching up like skeleton fingers against the sky.
      // Adds vertical variety the zones desperately need.
      const trunk='#1a0f06';
      const trunkLight='#3a2818';
      const branch='#2a1a0c';
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.beginPath();ctx.ellipse(s*.08,s*.9,s*.45,s*.15,0,0,Math.PI*2);ctx.fill();
      const sway=Math.sin(now/2200+seed*0.008)*3;
      // TRUNK — tall, slightly crooked, tapers toward top
      const trunkBot=s*0.85, trunkMid=-s*0.2, trunkTop=-s*1.4;
      ctx.strokeStyle=trunk;ctx.lineWidth=s*.14;ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(0, trunkBot);
      ctx.bezierCurveTo(sway*0.6, s*0.1, sway*-0.4, trunkMid, sway*0.3, trunkTop);
      ctx.stroke();
      // Trunk lit highlight
      ctx.strokeStyle=trunkLight;ctx.lineWidth=s*.04;
      ctx.beginPath();
      ctx.moveTo(-s*0.05, trunkBot-s*0.1);
      ctx.bezierCurveTo(sway*0.6-s*0.05, s*0.1, sway*-0.4-s*0.06, trunkMid, sway*0.3-s*0.06, trunkTop);
      ctx.stroke();
      // MAJOR BRANCHES — 4-5 large branches reaching up and outward
      const bbCount=4+Math.floor(rngF(seed)*2);
      for(let i=0;i<bbCount;i++){
        const bt=rngF(seed+i*11); // branching point: 0=top, 1=middle
        const by=trunkTop + bt*(trunkMid-trunkTop);
        const bside=i%2===0?1:-1;
        const bAngle=bside*(0.4+rngF(seed+i*13)*0.5);
        const bLen=s*(0.45+rngF(seed+i*17)*0.3);
        const bx1=sway*0.3 + (bt*0.3)*sway*0.5; // branch origin on trunk
        const bx2=bx1 + Math.sin(bAngle)*bLen;
        const by2=by - Math.cos(bAngle)*bLen*0.8; // branches go UP
        ctx.strokeStyle=branch;ctx.lineWidth=s*0.06;
        ctx.beginPath();
        ctx.moveTo(bx1, by);
        ctx.quadraticCurveTo((bx1+bx2)/2 + bside*s*0.08, (by+by2)/2, bx2, by2);
        ctx.stroke();
        // Sub-branches (twigs)
        for(let j=0;j<3;j++){
          const tt=0.5+rngF(seed+i*19+j*7)*0.5;
          const tx=bx1 + (bx2-bx1)*tt;
          const ty=by + (by2-by)*tt;
          const tAng=bAngle + (rngF(seed+i*23+j*11)-0.5)*0.8;
          const tLen=s*(0.12+rngF(seed+i*29+j)*0.15);
          const tx2=tx + Math.sin(tAng)*tLen;
          const ty2=ty - Math.cos(tAng)*tLen*0.7;
          ctx.strokeStyle=branch;ctx.lineWidth=s*0.025;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx2, ty2);
          ctx.stroke();
        }
      }
      // Top crown — a cluster of bare finger-like twigs
      for(let i=0;i<5;i++){
        const a=-Math.PI/2 + (i-2)*0.25 + rngF(seed+i*31)*0.2;
        const l=s*(0.2+rngF(seed+i*37)*0.2);
        const tx=sway*0.3;
        const ty=trunkTop;
        ctx.strokeStyle=branch;ctx.lineWidth=s*0.022;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + Math.cos(a)*l, ty + Math.sin(a)*l*0.9);
        ctx.stroke();
      }
      break;
    }

    case 'standingStone':{
      // Tall monolith with glowing runes — mysterious, atmospheric,
      // zone-agnostic landmark. Taller than the character, should draw the eye.
      const stone='#2a2418';
      const stoneShadow='#0e0a06';
      const stoneMid='#1f1a10';
      const stoneLight='#42362a';
      // Pick rune glow color per zone
      let runeColor='#c084fc', runeGlow='rgba(192,132,252,';
      if(curZone && curZone.id==='spire'){runeColor='#ff4444'; runeGlow='rgba(255,70,70,';}
      else if(curZone && curZone.id==='mire'){runeColor='#34d399'; runeGlow='rgba(52,211,153,';}
      else if(curZone && curZone.id==='crypts'){runeColor='#d97706'; runeGlow='rgba(217,119,6,';}
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.6)';
      ctx.beginPath();ctx.ellipse(s*.05,s*.92,s*.4,s*.14,0,0,Math.PI*2);ctx.fill();
      // Monolith silhouette — vertical rectangle with tapered irregular top
      const w=s*0.28, halfW=w/2;
      const topY=-s*1.2, botY=s*0.88;
      const tapeAmt=rngF(seed)*s*0.08;
      const topJag1=topY+rngF(seed+1)*s*0.1;
      const topJag2=topY+rngF(seed+2)*s*0.08;
      const pathPts=[
        {x:-halfW, y:botY},
        {x:-halfW, y:topY+s*0.4},
        {x:-halfW+tapeAmt, y:topJag1},
        {x:halfW-tapeAmt, y:topJag2},
        {x:halfW, y:topY+s*0.5},
        {x:halfW, y:botY},
      ];
      // Shadow offset layer
      ctx.fillStyle=stoneShadow;
      ctx.beginPath();
      pathPts.forEach((pt,idx)=>{
        const x=pt.x+s*0.05, y=pt.y+s*0.04;
        if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.closePath();ctx.fill();
      // Mid body
      ctx.fillStyle=stoneMid;
      ctx.beginPath();
      pathPts.forEach((pt,idx)=>{
        if(idx===0)ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y);
      });
      ctx.closePath();ctx.fill();
      // Main
      ctx.fillStyle=stone;
      ctx.beginPath();
      pathPts.forEach((pt,idx)=>{
        const x=pt.x*0.9, y=pt.y;
        if(idx===0)ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.closePath();ctx.fill();
      // Lit left edge
      ctx.fillStyle=stoneLight;
      ctx.fillRect(-halfW*0.82, topY+s*0.5, s*0.04, botY-(topY+s*0.5));
      // Outline
      ctx.strokeStyle=stoneShadow;
      ctx.lineWidth=1.1;
      ctx.beginPath();
      pathPts.forEach((pt,idx)=>{
        if(idx===0)ctx.moveTo(pt.x,pt.y); else ctx.lineTo(pt.x,pt.y);
      });
      ctx.closePath();ctx.stroke();
      // RUNES — glowing etched symbols pulsing softly
      const runePulse=0.6+Math.sin(now/900+seed)*0.4;
      ctx.shadowColor=runeColor;
      ctx.shadowBlur=10*runePulse;
      ctx.strokeStyle=runeGlow+(0.5+runePulse*0.4)+')';
      ctx.lineWidth=1.3;
      // Rune 1: triangle with inscribed line
      const r1y=topY+s*0.85;
      ctx.beginPath();
      ctx.moveTo(-s*0.06, r1y-s*0.06);
      ctx.lineTo(s*0.06, r1y-s*0.06);
      ctx.lineTo(0, r1y+s*0.04);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();ctx.moveTo(0, r1y-s*0.06); ctx.lineTo(0, r1y+s*0.04);ctx.stroke();
      // Rune 2: circle with cross
      const r2y=r1y+s*0.3;
      ctx.beginPath();ctx.arc(0, r2y, s*0.05, 0, Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(-s*0.05, r2y);ctx.lineTo(s*0.05, r2y);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0, r2y-s*0.05);ctx.lineTo(0, r2y+s*0.05);ctx.stroke();
      // Rune 3: angular zigzag
      const r3y=r2y+s*0.28;
      ctx.beginPath();
      ctx.moveTo(-s*0.05, r3y-s*0.04);
      ctx.lineTo(0, r3y);
      ctx.lineTo(-s*0.02, r3y+s*0.04);
      ctx.lineTo(s*0.05, r3y+s*0.02);
      ctx.stroke();
      ctx.shadowBlur=0;
      break;
    }

    case 'brokenStatue':{
      // Ruined angel/warrior statue — headless, wings broken, kneeling on plinth.
      // Vertical element that reads as narrative — "once revered, now fallen."
      const stone='#242018';
      const stoneShadow='#0e0b06';
      const stoneMid='#1a1710';
      const stoneLight='#3a342a';
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.beginPath();ctx.ellipse(s*.06,s*.85,s*.55,s*.18,0,0,Math.PI*2);ctx.fill();
      // PLINTH (stepped base)
      ctx.fillStyle=stoneShadow;
      ctx.fillRect(-s*0.42, s*0.62, s*0.84, s*0.28);
      ctx.fillStyle=stone;
      ctx.fillRect(-s*0.38, s*0.55, s*0.76, s*0.22);
      ctx.fillStyle=stoneLight;
      ctx.fillRect(-s*0.36, s*0.54, s*0.72, s*0.03);
      // TORSO — chunky, robed silhouette
      const torsoTop=-s*0.3;
      const torsoBot=s*0.55;
      // Shadow
      ctx.fillStyle=stoneShadow;
      ctx.beginPath();
      ctx.moveTo(-s*0.22, torsoBot);
      ctx.lineTo(-s*0.26, torsoTop+s*0.2);
      ctx.bezierCurveTo(-s*0.2, torsoTop, -s*0.08, torsoTop-s*0.05, 0, torsoTop-s*0.08);
      ctx.bezierCurveTo(s*0.08, torsoTop-s*0.05, s*0.2, torsoTop, s*0.26, torsoTop+s*0.2);
      ctx.lineTo(s*0.22, torsoBot);
      ctx.closePath();
      ctx.translate(s*0.04, s*0.03); ctx.fill(); ctx.translate(-s*0.04, -s*0.03);
      // Main torso
      ctx.fillStyle=stone;
      ctx.beginPath();
      ctx.moveTo(-s*0.22, torsoBot);
      ctx.lineTo(-s*0.26, torsoTop+s*0.2);
      ctx.bezierCurveTo(-s*0.2, torsoTop, -s*0.08, torsoTop-s*0.05, 0, torsoTop-s*0.08);
      ctx.bezierCurveTo(s*0.08, torsoTop-s*0.05, s*0.2, torsoTop, s*0.26, torsoTop+s*0.2);
      ctx.lineTo(s*0.22, torsoBot);
      ctx.closePath();
      ctx.fill();
      // Lit left edge of torso
      ctx.strokeStyle=stoneLight;
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(-s*0.22, torsoBot);
      ctx.lineTo(-s*0.26, torsoTop+s*0.2);
      ctx.bezierCurveTo(-s*0.2, torsoTop, -s*0.08, torsoTop-s*0.05, 0, torsoTop-s*0.08);
      ctx.stroke();
      // Robe folds
      ctx.strokeStyle=stoneShadow;
      ctx.lineWidth=0.8;
      ctx.beginPath();ctx.moveTo(-s*0.08, torsoTop+s*0.1);ctx.lineTo(-s*0.06, torsoBot-s*0.05);ctx.stroke();
      ctx.beginPath();ctx.moveTo(s*0.08, torsoTop+s*0.1);ctx.lineTo(s*0.06, torsoBot-s*0.05);ctx.stroke();
      ctx.beginPath();ctx.moveTo(0, torsoTop);ctx.lineTo(0, torsoBot);ctx.stroke();
      // NECK STUMP (head broken off) — jagged break
      ctx.fillStyle=stoneShadow;
      ctx.beginPath();
      ctx.moveTo(-s*0.06, torsoTop-s*0.06);
      ctx.lineTo(-s*0.04, torsoTop-s*0.1);
      ctx.lineTo(0, torsoTop-s*0.08);
      ctx.lineTo(s*0.03, torsoTop-s*0.12);
      ctx.lineTo(s*0.06, torsoTop-s*0.07);
      ctx.lineTo(s*0.07, torsoTop);
      ctx.lineTo(-s*0.07, torsoTop);
      ctx.closePath();
      ctx.fill();
      // BROKEN WING — one wing remains, partially shattered
      ctx.fillStyle=stone;
      ctx.beginPath();
      ctx.moveTo(-s*0.18, torsoTop+s*0.18);
      ctx.quadraticCurveTo(-s*0.45, torsoTop-s*0.1, -s*0.38, torsoTop-s*0.3);
      ctx.lineTo(-s*0.32, torsoTop-s*0.22);
      ctx.lineTo(-s*0.3, torsoTop-s*0.05);
      ctx.quadraticCurveTo(-s*0.38, torsoTop+s*0.1, -s*0.22, torsoTop+s*0.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle=stoneShadow;
      ctx.lineWidth=1;
      ctx.stroke();
      // Feather detail lines on wing
      ctx.strokeStyle=stoneShadow;
      ctx.lineWidth=0.6;
      for(let f=0;f<4;f++){
        ctx.beginPath();
        ctx.moveTo(-s*0.2-f*s*0.04, torsoTop+s*0.12);
        ctx.lineTo(-s*0.32-f*s*0.03, torsoTop-s*0.12+f*s*0.05);
        ctx.stroke();
      }
      // Small rubble at the base (head fragment?)
      ctx.fillStyle=stoneMid;
      ctx.beginPath();ctx.ellipse(s*0.3, s*0.7, s*0.08, s*0.05, 0.3, 0, Math.PI*2);ctx.fill();
      ctx.fillStyle=stoneShadow;
      ctx.beginPath();ctx.arc(s*0.3, s*0.7, s*0.02, 0, Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(s*0.34, s*0.69, s*0.018, 0, Math.PI*2);ctx.fill();
      break;
    }

    case 'fireBrazier':{
      // Bronze/iron brazier with burning pyre — animated flames, heat haze,
      // light halo. Provides a light source and dynamic element to static zones.
      const metal='#2a1810';
      const metalLight='#5a3820';
      const metalDark='#100804';
      const fireInner='#fff5c0';
      const fireMid='#ffa020';
      const fireOuter='#ff5010';
      // Ground shadow
      ctx.fillStyle='rgba(0,0,0,0.6)';
      ctx.beginPath();ctx.ellipse(0,s*.42,s*.35,s*.14,0,0,Math.PI*2);ctx.fill();
      // Light halo on ground — big glow radiating from brazier
      const flicker=0.85+Math.sin(now/90+seed)*0.12+Math.sin(now/47+seed*2)*0.06;
      const haloGrad=ctx.createRadialGradient(0,s*0.05,0,0,s*0.05,s*0.8);
      haloGrad.addColorStop(0, `rgba(255,180,80,${0.28*flicker})`);
      haloGrad.addColorStop(0.5, `rgba(255,120,40,${0.14*flicker})`);
      haloGrad.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle=haloGrad;
      ctx.beginPath();ctx.ellipse(0, s*0.1, s*0.8, s*0.35, 0, 0, Math.PI*2);ctx.fill();
      // TRIPOD LEGS — 3 iron legs
      ctx.strokeStyle=metal;
      ctx.lineWidth=s*0.045;
      ctx.lineCap='round';
      for(let leg=0;leg<3;leg++){
        const la = -Math.PI/2 + (leg-1)*0.7;
        ctx.beginPath();
        ctx.moveTo(Math.cos(la)*s*0.25, s*0.38);
        ctx.lineTo(Math.cos(la)*s*0.12, -s*0.05);
        ctx.stroke();
      }
      // BOWL — wide iron basin
      ctx.fillStyle=metalDark;
      ctx.beginPath();
      ctx.ellipse(0, s*0.05, s*0.32, s*0.13, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle=metal;
      ctx.beginPath();
      ctx.ellipse(0, s*0.02, s*0.3, s*0.12, 0, 0, Math.PI*2);
      ctx.fill();
      // Bowl rim highlight
      ctx.strokeStyle=metalLight;
      ctx.lineWidth=1.3;
      ctx.beginPath();ctx.ellipse(0, s*0.02, s*0.3, s*0.12, 0, 0, Math.PI, true);ctx.stroke();
      // FLAMES — layered, animated
      ctx.shadowColor=fireOuter;
      ctx.shadowBlur=20*flicker;
      // Outer flame (biggest)
      ctx.fillStyle=fireOuter;
      ctx.globalAlpha=0.75*flicker;
      ctx.beginPath();
      const fh=s*0.45*flicker;
      ctx.moveTo(-s*0.2, s*0.02);
      ctx.quadraticCurveTo(-s*0.22+Math.sin(now/180+seed)*4, -s*0.15, -s*0.1, -s*0.25);
      ctx.quadraticCurveTo(-s*0.04+Math.sin(now/120)*3, -fh*0.7, 0, -fh);
      ctx.quadraticCurveTo(s*0.04+Math.cos(now/140)*3, -fh*0.7, s*0.1, -s*0.25);
      ctx.quadraticCurveTo(s*0.22+Math.cos(now/180+seed)*4, -s*0.15, s*0.2, s*0.02);
      ctx.closePath();
      ctx.fill();
      // Middle flame
      ctx.fillStyle=fireMid;
      ctx.globalAlpha=0.85*flicker;
      const fh2=fh*0.75;
      ctx.beginPath();
      ctx.moveTo(-s*0.14, s*0.02);
      ctx.quadraticCurveTo(-s*0.12+Math.sin(now/140)*2, -s*0.1, -s*0.06, -s*0.18);
      ctx.quadraticCurveTo(-s*0.02+Math.sin(now/100)*2, -fh2*0.7, 0, -fh2);
      ctx.quadraticCurveTo(s*0.02+Math.cos(now/110)*2, -fh2*0.7, s*0.06, -s*0.18);
      ctx.quadraticCurveTo(s*0.12+Math.cos(now/140)*2, -s*0.1, s*0.14, s*0.02);
      ctx.closePath();
      ctx.fill();
      // Inner hot core
      ctx.fillStyle=fireInner;
      ctx.globalAlpha=0.9*flicker;
      const fh3=fh*0.5;
      ctx.beginPath();
      ctx.moveTo(-s*0.08, s*0.02);
      ctx.quadraticCurveTo(-s*0.05, -s*0.08, -s*0.02, -s*0.12);
      ctx.quadraticCurveTo(0, -fh3, 0, -fh3);
      ctx.quadraticCurveTo(s*0.02, -s*0.12, s*0.05, -s*0.08);
      ctx.quadraticCurveTo(s*0.08, s*0, s*0.08, s*0.02);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha=1;
      ctx.shadowBlur=0;
      // Embers rising (simple particles)
      ctx.fillStyle=fireMid;
      for(let e=0;e<3;e++){
        const et=(now/30+seed+e*137) % 100 / 100;
        const ey=-s*0.2 - et*s*0.8;
        const ex=Math.sin(now/200+e*2+seed)*s*0.1;
        const ea=(1-et)*0.7;
        ctx.globalAlpha=ea;
        ctx.beginPath();ctx.arc(ex, ey, s*0.025*(1-et*0.5), 0, Math.PI*2);ctx.fill();
      }
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
  ctx.translate(p.x,p.y);

  // Aura under player — draw BEFORE sprite/canvas body so it sits behind
  const auraR=30+spCount*5;
  const aura=ctx.createRadialGradient(0,15,0,0,15,auraR);
  aura.addColorStop(0,`rgba(157,196,176,${0.08+spCount*0.012})`);
  aura.addColorStop(1,'rgba(157,196,176,0)');
  ctx.fillStyle=aura;ctx.beginPath();ctx.ellipse(0,18,auraR,auraR*0.4,0,0,Math.PI*2);ctx.fill();

  // ═══ Try rendering the sprite first (Hollowcaller only for now) ═══
  // If sprites are loaded for this class, draw them. Otherwise fall through to
  // the Canvas drawing below (safety net so the game never breaks if sprites
  // fail to load).
  const spriteDrawn = drawPlayerSprite(p, t, fl, glow, spCount);

  if(!spriteDrawn){
    // ═══ FALLBACK: Canvas-drawn Hollowcaller (original implementation) ═══
    const flipX=Math.cos(p.facing)<0;
    if(flipX)ctx.scale(-1,1);

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
  }

  ctx.restore();

  // Movement robe particles
  if(Math.abs(p.vx)+Math.abs(p.vy)>8&&Math.random()<0.1){
    particles.push({x:p.x+(Math.random()-0.5)*10,y:p.y+20,vx:(Math.random()-0.5)*25,vy:12+Math.random()*18,life:0.55,maxLife:0.55,color:'rgba(192,132,252,0.35)',size:2+Math.random()*2});
  }
}

// ═══════ PLAYER SPRITE SYSTEM ═══════════════════════════════════
// Loads 8-directional character sprites (pixel art PNGs) and renders
// based on player.facing angle. Falls back to Canvas drawing if sprites
// aren't loaded yet or fail to load entirely.

// Sprite catalog per class — maps class ID to the 8 direction files.
// The paths try the subfolder version first (sprites/hollowcaller/north.png),
// with a fallback to flat sprites/north.png if the subfolder doesn't exist.
const PLAYER_SPRITE_CATALOG = {
  hollowcaller: {
    basePath: 'sprites/hollowcaller/',
    fallbackPath: 'sprites/',
    directions: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'],
    // Pixel dimensions of each sprite (68×68 from Pixellab)
    pixelSize: 68,
    // How big the sprite should appear in world units. Bumped from 56 → 88
    // so the character has real presence. Old canvas character was ~40 tall,
    // but the pixel art looks small at that scale — it needs breathing room.
    displaySize: 88,
    // Vertical offset from player center — the character's feet should sit
    // near player.y so movement feels grounded. Slightly up so the visible
    // feet align with the aura/shadow.
    yOffset: -6,
  },
  // Ironwake + others fall through to Canvas drawing (no sprites yet)
};

// Per-class sprite state. Each entry: {images: {dirName: Image}, loaded: bool, failed: bool}
const _playerSpriteState = {};

// Preload sprites for a class. Safe to call multiple times — idempotent.
// Tries the subfolder path first. If a sprite fails there, retries the fallback
// path (flat sprites/ folder).
function preloadPlayerSprites(classId){
  const catalog = PLAYER_SPRITE_CATALOG[classId];
  if(!catalog) return;
  if(_playerSpriteState[classId]) return; // already loading/loaded
  const state = {images: {}, loaded: false, failed: false, loadedCount: 0};
  _playerSpriteState[classId] = state;
  const total = catalog.directions.length;
  catalog.directions.forEach(dir => {
    const img = new Image();
    // Try subfolder path first
    const primaryUrl = catalog.basePath + dir + '.png';
    img.onload = () => {
      state.loadedCount++;
      state.images[dir] = img;
      if(state.loadedCount >= total) state.loaded = true;
    };
    img.onerror = () => {
      // Try fallback (flat sprites/ folder)
      const fbImg = new Image();
      const fbUrl = catalog.fallbackPath + dir + '.png';
      fbImg.onload = () => {
        state.loadedCount++;
        state.images[dir] = fbImg;
        if(state.loadedCount >= total) state.loaded = true;
      };
      fbImg.onerror = () => {
        // Give up on this direction — will use Canvas fallback
        state.loadedCount++;
        state.failed = true;
        console.warn('[sprite] missing:', primaryUrl, 'and', fbUrl);
      };
      fbImg.src = fbUrl;
    };
    img.src = primaryUrl;
  });
}

// Convert player.facing angle (radians) to one of 8 compass directions.
// Canvas angle convention: 0 rad = east (+x), π/2 = south (+y), π = west, -π/2 = north.
// We slice the circle into 8 segments of 45° (π/4 rad) each.
function facingToDirection(facing){
  // Normalize to 0..2π
  let a = facing;
  while(a < 0) a += Math.PI * 2;
  while(a >= Math.PI * 2) a -= Math.PI * 2;
  // Each direction covers π/4 rad (45°), centered on its canonical angle.
  // east = 0, south-east = π/4, south = π/2, south-west = 3π/4, etc.
  // Offset by π/8 so each wedge is centered on the cardinal angle.
  const idx = Math.floor((a + Math.PI / 8) / (Math.PI / 4)) % 8;
  // idx: 0=east, 1=southeast, 2=south, 3=southwest, 4=west, 5=northwest, 6=north, 7=northeast
  const dirs = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  return dirs[idx];
}

// Draw the sprite for the current class. Returns true if drawn, false if we
// should fall back to Canvas drawing. Called inside drawPlayer's ctx.save()
// transform so it operates in player-local coordinates.
function drawPlayerSprite(p, t, fl, glow, spCount){
  const catalog = PLAYER_SPRITE_CATALOG[p.classId];
  if(!catalog) return false;
  const state = _playerSpriteState[p.classId];
  if(!state) return false;
  // Even partial load is OK — we just need the CURRENT direction to be loaded.
  // If the facing direction's sprite isn't loaded yet, fall back to canvas.
  const dir = facingToDirection(p.facing);
  const img = state.images[dir];
  if(!img || !img.complete || img.naturalWidth === 0) return false;

  // Compute display size scaled to match the old Canvas character visually
  const size = catalog.displaySize;
  const half = size / 2;

  // ═══ Walk bob — sprite bounces up/down slightly while moving ═══
  // Without this, a static pixel-art sprite looks like it's floating across
  // the ground. Bob is tied to walkCycle (which advances when moving) so it
  // naturally starts/stops with motion. Uses abs(sin) so the character only
  // bobs UPWARD from resting position, not below it — feet stay grounded.
  const moving = (Math.abs(p.vx) + Math.abs(p.vy)) > 5;
  const bobAmount = moving ? Math.abs(Math.sin(p.walkCycle * 1.8)) * 3 : 0;
  const drawY = (catalog.yOffset || 0) - bobAmount;

  // Glow behind the sprite — class identity color
  ctx.save();
  ctx.shadowColor = fl ? '#ff4444' : '#9DC4B0';
  ctx.shadowBlur = fl ? 18 : (10 + spCount * 2) * glow;
  // Draw shadow-only pass first so the glow is visible without pixel artifacts
  // on the sprite itself
  ctx.globalAlpha = 0.35;
  ctx.drawImage(img, -half, drawY - half, size, size);
  ctx.restore();

  // Main sprite — crisp, no blur
  ctx.save();
  // Pixel art should NOT be smoothed when scaled
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // Hit flash: tint sprite red by drawing it with a red overlay
  if(fl){
    // Draw normally first (so shape is preserved through tint)
    ctx.drawImage(img, -half, drawY - half, size, size);
    // Red multiply tint
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255, 90, 90, 0.55)';
    ctx.fillRect(-half, drawY - half, size, size);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.drawImage(img, -half, drawY - half, size, size);
  }
  ctx.imageSmoothingEnabled = prevSmoothing;
  ctx.restore();

  return true;
}

// ═══════ SPIRIT DRAW ════════════════════════════════════
function drawSpirit(s,t){
  if(s.dead)return;
  const pulse=0.8+Math.sin(t/700+s.id)*0.2;
  ctx.save();
  ctx.globalAlpha=0.93*pulse;
  if(!isFinite(s.x)||!isFinite(s.y)){ctx.restore();return;}
  // Archetype-driven visuals — falls back to ghost-teal if no archetype
  const color = s.archColor || '#9DC4B0';
  const sizeMult = s.archSizeMult || 1.0;
  const isNexus = s.archetype === 'nexus';
  const isWarden = s.archetype === 'warden';
  const isReaver = s.archetype === 'reaver';
  ctx.shadowColor = color;
  ctx.shadowBlur = isNexus ? 28 : 18;
  // Nexus aura — big pulsing golden halo
  if(isNexus){
    const haloR = 28 + Math.sin(t/250+s.id)*6;
    const hg = ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,haloR);
    hg.addColorStop(0,'rgba(251,191,36,0.4)');
    hg.addColorStop(1,'rgba(251,191,36,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();ctx.arc(s.x,s.y,haloR,0,Math.PI*2);ctx.fill();
  }
  // Warden protective ring — faint blue shield arc
  if(isWarden){
    ctx.strokeStyle = 'rgba(96,165,250,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x,s.y,14*sizeMult,0,Math.PI*2);
    ctx.stroke();
  }
  // Glow core
  const coreR = 16 * sizeMult;
  const g=ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,coreR);
  g.addColorStop(0,'#ffffff');
  g.addColorStop(0.35,color);
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(s.x,s.y,coreR,0,Math.PI*2);ctx.fill();
  // Body — reavers are angular (more solid), others are rounded
  const bodyR = 7 * sizeMult;
  ctx.fillStyle = isReaver
    ? `rgba(239,68,68,0.82)`
    : `rgba(${_hexToRgbTriplet(color)},0.75)`;
  ctx.beginPath();ctx.arc(s.x,s.y-6*sizeMult,bodyR,Math.PI,0);ctx.lineTo(s.x+bodyR,s.y+2*sizeMult);
  for(let i=0;i<3;i++)ctx.arc(s.x+5*sizeMult-i*4.5*sizeMult,s.y+2*sizeMult,2*sizeMult,0,Math.PI,true);
  ctx.lineTo(s.x-bodyR,s.y+2*sizeMult);ctx.closePath();ctx.fill();
  // Wisp tail
  ctx.fillStyle = `rgba(${_hexToRgbTriplet(color)},0.4)`;
  ctx.beginPath();ctx.moveTo(s.x-5*sizeMult,s.y+7*sizeMult);
  ctx.bezierCurveTo(
    s.x-3*sizeMult,s.y+14*sizeMult+Math.sin(t/280+s.id)*4,
    s.x+3*sizeMult,s.y+14*sizeMult-Math.sin(t/280+s.id)*4,
    s.x+5*sizeMult,s.y+7*sizeMult
  );
  ctx.closePath();ctx.fill();
  // Eyes — reavers have red, nexus gold, others dark
  ctx.shadowBlur=0;
  const eyeColor = isNexus ? 'rgba(251,191,36,0.95)' :
                   isReaver ? 'rgba(150,20,20,0.9)' : 'rgba(0,0,0,0.7)';
  ctx.fillStyle = eyeColor;
  ctx.beginPath();ctx.arc(s.x-2.5*sizeMult,s.y-7*sizeMult,2.8*sizeMult,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(s.x+2.5*sizeMult,s.y-7*sizeMult,2.8*sizeMult,0,Math.PI*2);ctx.fill();
  // Eye highlights — always bright
  ctx.fillStyle='#fff';
  ctx.beginPath();ctx.arc(s.x-2.5*sizeMult,s.y-7*sizeMult,1.1*sizeMult,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(s.x+2.5*sizeMult,s.y-7*sizeMult,1.1*sizeMult,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

// Convert "#rrggbb" to "R,G,B" triplet for rgba() use. Handles shorthand.
function _hexToRgbTriplet(hex){
  if(!hex || typeof hex !== 'string') return '157,196,176';
  let h = hex.replace('#','');
  if(h.length === 3) h = h.split('').map(c=>c+c).join('');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  if(isNaN(r) || isNaN(g) || isNaN(b)) return '157,196,176';
  return `${r},${g},${b}`;
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
  // Each is a series of connected points that flow smoothly — no jitter.
  // The curves come from overlaid low-frequency sine waves (coherent motion),
  // not random per-point wobble (which produced the old zigzag look).
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
      // Dense sample — more points = smoother curves
      const steps=28+Math.floor(rnd()*10);
      // Each path gets its own wave phase/frequency for variety
      const phase=rnd()*Math.PI*2;
      const freq1=0.8+rnd()*0.5;   // primary undulation
      const freq2=2.1+rnd()*1.2;   // secondary small wiggle
      const amp1=WORLD_W*(0.10+rnd()*0.08);
      const amp2=WORLD_W*0.025;
      // Perpendicular direction for offset (so sine moves perpendicular to path heading)
      const dx=ex-sx,dy=ey-sy,len=Math.sqrt(dx*dx+dy*dy)||1;
      const perpX=-dy/len,perpY=dx/len;
      // Base width varies per path (narrow trail vs wide road)
      const baseWidth=42+rnd()*54;
      const widthVar=18+rnd()*20;
      for(let s=0;s<=steps;s++){
        const t=s/steps;
        // Smooth lateral offset from the direct line: sum of two sines
        const offset=Math.sin(t*Math.PI*freq1+phase)*amp1
                    +Math.sin(t*Math.PI*freq2+phase*1.7)*amp2;
        // Width pulses gently along the path — wider in the middle, narrows at ends
        const widthCurve=Math.sin(t*Math.PI); // 0 at ends, 1 at midpoint
        const w=baseWidth+widthVar*widthCurve+Math.sin(t*Math.PI*3+phase)*6;
        points.push({
          x:sx+(ex-sx)*t+perpX*offset,
          y:sy+(ey-sy)*t+perpY*offset,
          width:Math.max(24,w),
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
  ctx.save();
  // Apply world zoom: scale first, then translate so camera math still works
  // in world coordinates. Screen center of world origin = (W/2, H/2).
  // At 1.0 zoom this is identical to the original translate(W/2-camX, H/2-camY).
  ctx.translate(W/2, H/2);
  ctx.scale(WORLD_ZOOM, WORLD_ZOOM);
  ctx.translate(-camX, -camY);
  // Ground base — solid fill in the theme's ground color
  ctx.fillStyle=z.groundBase;ctx.fillRect(0,0,WORLD_W,WORLD_H);

  // Visible culling bounds — only draw what's near the camera for performance.
  // Expand the visible rect by 1/zoom because fewer world-units are visible
  // when zoomed in.
  const halfVW = W/(2*WORLD_ZOOM), halfVH = H/(2*WORLD_ZOOM);
  const margin=400,vl=camX-halfVW-margin,vr=camX+halfVW+margin,vt=camY-halfVH-margin,vb=camY+halfVH+margin;

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
  // Render with smooth quadratic curves passing through midpoints between
  // consecutive points. This gives a naturally flowing appearance — no more
  // visible corners between straight segments.
  terrainFeatures.paths.forEach(path=>{
    if(path.points.length < 3) return;
    // Cull the whole path if its bounding box is fully offscreen
    let bbMinX=Infinity,bbMaxX=-Infinity,bbMinY=Infinity,bbMaxY=-Infinity;
    path.points.forEach(pt=>{
      if(pt.x<bbMinX)bbMinX=pt.x; if(pt.x>bbMaxX)bbMaxX=pt.x;
      if(pt.y<bbMinY)bbMinY=pt.y; if(pt.y>bbMaxY)bbMaxY=pt.y;
    });
    if(bbMaxX<vl||bbMinX>vr||bbMaxY<vt||bbMinY>vb)return;
    // Average width for the stroke thickness (variable width isn't supported by stroke directly,
    // so we approximate — the width variation per point is used for edge prop scattering elsewhere)
    let avgWidth=0;
    path.points.forEach(pt=>{avgWidth+=pt.width;});
    avgWidth/=path.points.length;
    // Layer 1: subtle darker outline for depth (wider, slightly darker)
    const outlineColor = path.color.replace(/[\d.]+\)$/,(m)=>((parseFloat(m)*0.5).toFixed(2)+')'));
    ctx.strokeStyle=outlineColor;
    ctx.lineWidth=avgWidth*1.15;
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(path.points[0].x,path.points[0].y);
    for(let i=1;i<path.points.length-1;i++){
      const p0=path.points[i], p1=path.points[i+1];
      const midX=(p0.x+p1.x)/2, midY=(p0.y+p1.y)/2;
      ctx.quadraticCurveTo(p0.x,p0.y,midX,midY);
    }
    const last=path.points[path.points.length-1];
    ctx.lineTo(last.x,last.y);
    ctx.stroke();
    // Layer 2: main path surface (normal width, base color)
    ctx.strokeStyle=path.color;
    ctx.lineWidth=avgWidth;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x,path.points[0].y);
    for(let i=1;i<path.points.length-1;i++){
      const p0=path.points[i], p1=path.points[i+1];
      const midX=(p0.x+p1.x)/2, midY=(p0.y+p1.y)/2;
      ctx.quadraticCurveTo(p0.x,p0.y,midX,midY);
    }
    ctx.lineTo(last.x,last.y);
    ctx.stroke();
    // Layer 3: brighter inner core (narrower, bright — suggests worn trodden earth)
    const innerColor = path.color.replace(/[\d.]+\)$/,(m)=>((parseFloat(m)*1.8).toFixed(2)+')'));
    ctx.strokeStyle=innerColor;
    ctx.lineWidth=avgWidth*0.35;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x,path.points[0].y);
    for(let i=1;i<path.points.length-1;i++){
      const p0=path.points[i], p1=path.points[i+1];
      const midX=(p0.x+p1.x)/2, midY=(p0.y+p1.y)/2;
      ctx.quadraticCurveTo(p0.x,p0.y,midX,midY);
    }
    ctx.lineTo(last.x,last.y);
    ctx.stroke();
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
  // Zone ambient FX — beefed up for atmospheric density
  // ASHEN WASTES: drifting ash motes + god-ray shafts through the purple haze
  if(z.ashFx){
    // Drifting ash motes — tripled count and slower drift for more atmosphere
    for(let i=0;i<28;i++){
      const px=(camX+Math.sin(now/4000+i*1.7)*(W*.5)+WORLD_W)%WORLD_W;
      const py=(camY-H*.4+Math.sin(now/3500+i*0.9)*(H*.5)+WORLD_H)%WORLD_H;
      ctx.globalAlpha=.18+Math.sin(now/1500+i)*.1;
      ctx.fillStyle='rgba(200,150,255,0.55)';
      ctx.beginPath();ctx.arc(px,py,1.4+Math.sin(now/800+i)*.6,0,Math.PI*2);ctx.fill();
    }
    // Larger slower dust particles closer to ground
    for(let i=0;i<12;i++){
      const px=(camX+Math.sin(now/6000+i*2.3)*(W*.6)+WORLD_W)%WORLD_W;
      const py=(camY+Math.cos(now/5500+i*1.4)*(H*.45)+WORLD_H)%WORLD_H;
      ctx.globalAlpha=.08+Math.sin(now/2200+i)*.04;
      ctx.fillStyle='rgba(180,140,220,0.5)';
      ctx.beginPath();ctx.arc(px,py,2.8+Math.sin(now/1200+i)*1,0,Math.PI*2);ctx.fill();
    }
    // God-ray light shafts — diagonal atmospheric beams
    ctx.globalAlpha=0.035;
    for(let r=0;r<3;r++){
      const rx=(camX - W*0.4 + r*W*0.35 + WORLD_W)%WORLD_W;
      const ry=camY - H*0.6;
      const rg=ctx.createLinearGradient(rx, ry, rx+W*0.3, ry+H*1.3);
      rg.addColorStop(0, 'rgba(230,200,255,0.35)');
      rg.addColorStop(0.5, 'rgba(200,160,255,0.18)');
      rg.addColorStop(1, 'rgba(180,140,250,0)');
      ctx.fillStyle=rg;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx+W*0.08, ry);
      ctx.lineTo(rx+W*0.38, ry+H*1.3);
      ctx.lineTo(rx+W*0.3, ry+H*1.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  // BONE CRYPTS: drifting bone dust motes + amber haze shafts
  if(z.boneDust){
    // Amber/gold dust particles — drifting bone powder
    for(let i=0;i<30;i++){
      const px=(camX+Math.sin(now/3800+i*1.8)*(W*.5)+WORLD_W)%WORLD_W;
      const py=(camY-H*.35+Math.sin(now/3200+i*1.1)*(H*.5)+WORLD_H)%WORLD_H;
      ctx.globalAlpha=.2+Math.sin(now/1400+i)*.1;
      ctx.fillStyle='rgba(255,210,140,0.6)';
      ctx.beginPath();ctx.arc(px,py,1.3+Math.sin(now/700+i)*.5,0,Math.PI*2);ctx.fill();
    }
    // Larger settling dust
    for(let i=0;i<14;i++){
      const px=(camX+Math.sin(now/5500+i*2.1)*(W*.55)+WORLD_W)%WORLD_W;
      const py=(camY+Math.cos(now/5000+i*1.3)*(H*.45)+WORLD_H)%WORLD_H;
      ctx.globalAlpha=.09+Math.sin(now/2000+i)*.04;
      ctx.fillStyle='rgba(220,170,90,0.5)';
      ctx.beginPath();ctx.arc(px,py,2.5+Math.sin(now/1100+i)*1,0,Math.PI*2);ctx.fill();
    }
    // Warm amber god-rays
    ctx.globalAlpha=0.045;
    for(let r=0;r<3;r++){
      const rx=(camX - W*0.3 + r*W*0.4 + WORLD_W)%WORLD_W;
      const ry=camY - H*0.6;
      const rg=ctx.createLinearGradient(rx, ry, rx+W*0.3, ry+H*1.3);
      rg.addColorStop(0, 'rgba(255,210,140,0.4)');
      rg.addColorStop(0.5, 'rgba(230,170,100,0.2)');
      rg.addColorStop(1, 'rgba(200,140,60,0)');
      ctx.fillStyle=rg;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx+W*0.08, ry);
      ctx.lineTo(rx+W*0.38, ry+H*1.3);
      ctx.lineTo(rx+W*0.3, ry+H*1.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  // VEIL'S SPIRE: heat haze + larger ember glows
  if(z.lavaFx){
    // More heat glow pools — doubled from 4 to 8
    for(let i=0;i<8;i++){
      ctx.globalAlpha=(.5+Math.sin(now/300+i)*.3)*.06;
      const px=(camX+(-3.5+i)*W*.22+WORLD_W)%WORLD_W;
      const py=camY+Math.sin(i+now/800)*H*0.35;
      const hg=ctx.createRadialGradient(px,py,0,px,py,170);
      hg.addColorStop(0,'rgba(255,80,0,0.55)');
      hg.addColorStop(0.6,'rgba(220,50,0,0.25)');
      hg.addColorStop(1,'rgba(255,80,0,0)');
      ctx.fillStyle=hg;
      ctx.beginPath();ctx.arc(px,py,170,0,Math.PI*2);ctx.fill();
    }
    // Rising embers — orange sparks floating upward
    for(let i=0;i<24;i++){
      const lifeT=(now/40+i*157)%100/100;
      const px=(camX+Math.sin(i*3.1+now/4000)*(W*.5)+WORLD_W)%WORLD_W;
      const baseY=camY+H*0.4;
      const py=(baseY - lifeT*H*0.9 + WORLD_H)%WORLD_H;
      ctx.globalAlpha=(1-lifeT)*0.6;
      ctx.fillStyle=i%3===0 ? 'rgba(255,240,180,0.8)' : 'rgba(255,120,40,0.7)';
      ctx.beginPath();ctx.arc(px,py,1.5+(1-lifeT)*1.2,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  // ABYSSAL MIRE: more toxic spores + green glow haze
  if(z.toxicFx){
    // Rising spores — tripled from 6 to 20
    for(let i=0;i<20;i++){
      ctx.globalAlpha=.24+Math.sin(now/600+i)*.12;
      ctx.fillStyle='rgba(52,211,153,0.6)';
      const px=(camX+(i-9.5)*W*.12+WORLD_W)%WORLD_W;
      const py=((camY+H*.3-((now/2000+i*0.3)%1)*H*.9)+WORLD_H)%WORLD_H;
      ctx.beginPath();ctx.arc(px,py,2.2+Math.sin(now/400+i)*0.8,0,Math.PI*2);ctx.fill();
    }
    // Swamp fog patches — low-lying mist
    for(let i=0;i<6;i++){
      ctx.globalAlpha=0.08+Math.sin(now/3000+i)*0.03;
      const px=(camX+(i-2.5)*W*.25+WORLD_W)%WORLD_W;
      const py=camY+H*0.2+Math.sin(now/2500+i)*H*0.1;
      const fg=ctx.createRadialGradient(px,py,0,px,py,220);
      fg.addColorStop(0,'rgba(140,220,160,0.5)');
      fg.addColorStop(1,'rgba(100,180,130,0)');
      ctx.fillStyle=fg;
      ctx.beginPath();ctx.ellipse(px,py,220,110,0,0,Math.PI*2);ctx.fill();
    }
    // Green god-rays (sunlight filtered through canopy)
    ctx.globalAlpha=0.04;
    for(let r=0;r<3;r++){
      const rx=(camX - W*0.3 + r*W*0.4 + WORLD_W)%WORLD_W;
      const ry=camY - H*0.6;
      const rg=ctx.createLinearGradient(rx, ry, rx+W*0.3, ry+H*1.3);
      rg.addColorStop(0, 'rgba(180,255,200,0.35)');
      rg.addColorStop(0.5, 'rgba(100,220,150,0.2)');
      rg.addColorStop(1, 'rgba(60,180,120,0)');
      ctx.fillStyle=rg;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx+W*0.08, ry);
      ctx.lineTo(rx+W*0.38, ry+H*1.3);
      ctx.lineTo(rx+W*0.3, ry+H*1.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  // Edge vignette — darkens the world edges for depth
  const ev=ctx.createRadialGradient(WORLD_W/2,WORLD_H/2,WORLD_W*.32,WORLD_W/2,WORLD_H/2,WORLD_W*.76);ev.addColorStop(0,'rgba(0,0,0,0)');ev.addColorStop(1,z.edgeC);ctx.fillStyle=ev;ctx.fillRect(0,0,WORLD_W,WORLD_H);
  // Props (trees, rocks, pillars, etc) drawn last so they're on top of ground
  drawEnvironment(now);
  ctx.restore();
}


// ═══════ SPAWN SYSTEMS ══════════════════════════════════
function spawnEnemy(typeOverride=null){
  // No combat spawns in camp zones — The Procession is a safe hub
  if(curZone?.isCamp) return;
  // Mob density scales with player level (idle-game feel: higher levels = busier world)
  const densityMult = (typeof mobDensityMult === 'function') ? mobDensityMult(player.level) : 1.0;
  const cap = Math.round(MAX_ENEMIES * densityMult);
  const living=enemies.filter(e=>!e.dead).length;
  if(living>=cap)return;
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
  // Enemy stats scale from player level. Fights are always level-appropriate;
  // breakthrough difficulty comes from gear, not level gaps.
  const hs=enemyHpScale(player.level),ds=enemyDmgScale(player.level);
  // Base HP tuned so autoattack TTK at lv 1 is ~10-12 hits (~5-6s), with
  // abilities closing the fight faster. Scales modestly with level; gear
  // is the real damage lever that makes later fights satisfying.
  const base = 200 + player.level * 5;
  const baseAtk = 20 + player.level * 0.7;
  enemies.push({
    id:enemyId++,x,y,vx:0,vy:0,
    hp:base*hs*typeData.hp*(isElite?2.4:1),
    maxHp:base*hs*typeData.hp*(isElite?2.4:1),
    attack:baseAtk*ds*typeData.dmg*(isElite?1.6:1),
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
  // Switch ambient music to the dungeon's sonic profile
  if(typeof switchAmbientZone==='function')switchAmbientZone(def.id);
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
      const base = 200 + player.level * 5;
      const baseAtk = 20 + player.level * 0.7;
      // DUNGEON HP MULTIPLIER: dungeons should feel genuinely tougher than
      // open world — each mob is a threat, not a speed bump.
      const DUNGEON_MOB_HP_MULT = isElite ? 4.5 : 3.0;
      const DUNGEON_MOB_DMG_MULT = 1.6; // enemies hit hard — player must actively play
      enemies.push({
        id:enemyId++,x,y,vx:0,vy:0,
        hp:base*hs*typeData.hp*(isElite?2.4:1)*DUNGEON_MOB_HP_MULT,
        maxHp:base*hs*typeData.hp*(isElite?2.4:1)*DUNGEON_MOB_HP_MULT,
        attack:baseAtk*ds*typeData.dmg*(isElite?1.6:1)*DUNGEON_MOB_DMG_MULT,
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
  const base = 200 + player.level * 5;
  const baseAtk = 20 + player.level * 0.7;
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
    attack:baseAtk*ds*typeData.dmg*bd.atkMult,
    speed:typeData.spd*0.85, // bosses a bit slower but hit like a truck
    dead:false,isElite:true,typeData,
    lastAttack:0,hitFlash:0,
    veilmarkStacks:0,veilmarkExpiry:0,
    size:typeData.r*bd.sizeMult,
    isBoss:true,bossName:bd.name,
    bossTier:bd.bossTier||'minorBoss', // drives XP multiplier (minorBoss/majorBoss/finalBoss)
    // Signature ability state — tracks cooldown + current cast if any
    ability:bd.ability||null,
    abilityNextCast:performance.now()+(bd.ability?.cooldown||6000)*0.5, // first cast half-cd in
    abilityCasting:null, // {warmupUntil, type, ...state} while channeling
    invulnUntil:0, // set by phaseShift to make boss unhittable briefly
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

// ═══════ BOSS ABILITIES ═════════════════════════════════════════════
// Each boss has a signature ability defined in data.js. This function runs each
// frame for any boss entity and handles the cooldown → warmup → resolve cycle.
// During warmup, telegraph FX warn the player of what's coming.
// ═══════════════════════════════════════════════════════════════════
// PER-TYPE ENEMY AI
// ═══════════════════════════════════════════════════════════════════
// Each function handles ONE enemy archetype. Called from the main enemy
// update loop instead of the generic walk-up-and-hit behavior.

// ─── WRAITH — ranged caster. Keeps distance, fires purple bolts. ───
function _aiWraith(e, d, dx, dy, now, dt){
  const preferredRange = 340;
  const minRange = 220;
  // Back off if too close, advance if too far
  if(d < minRange){
    // Retreat
    e.x -= (dx/d) * e.speed * 0.9 * dt;
    e.y -= (dy/d) * e.speed * 0.9 * dt;
  } else if(d > preferredRange * 1.2){
    // Close the gap
    e.x += (dx/d) * e.speed * 0.7 * dt;
    e.y += (dy/d) * e.speed * 0.7 * dt;
  } else {
    // Strafe perpendicular — makes them hard to hit
    e.x += (-dy/d) * e.speed * 0.45 * dt;
    e.y += (dx/d) * e.speed * 0.45 * dt;
  }
  // Cast interval — 2.4s between bolts, 1.8s for elite
  const castCd = e.isElite ? 1800 : 2400;
  if(!e.nextCast) e.nextCast = now + 900 + Math.random()*600; // stagger initial cast
  if(now >= e.nextCast && d < 450){
    e.nextCast = now + castCd;
    // Warmup flash — brief telegraph
    e.castFlashUntil = now + 180;
    // Fire after short warmup
    setTimeout(()=>{
      if(e.dead) return;
      const aimDx = player.x - e.x, aimDy = player.y - e.y;
      const aimD = Math.max(0.01, Math.sqrt(aimDx*aimDx + aimDy*aimDy));
      enemyProjectiles.push({
        x: e.x, y: e.y,
        vx: (aimDx/aimD) * 320, vy: (aimDy/aimD) * 320,
        life: 2.5, maxLife: 2.5,
        dmg: e.attack * 0.9, // slightly less than melee
        radius: 10,
        color: '#a855f7',
        source: 'wraith',
      });
      if(typeof SFX !== 'undefined' && SFX.veilmark) SFX.veilmark();
    }, 180);
  }
}

// ─── CRAWLER — lunges at player. Fast but predictable. ───
function _aiCrawler(e, d, dx, dy, now, dt){
  // If currently mid-lunge, continue lunge
  if(e.lungeUntil && now < e.lungeUntil){
    const lx = e.lungeVx || 0, ly = e.lungeVy || 0;
    e.x += lx * dt;
    e.y += ly * dt;
    return;
  }
  // Out of lunge — normal approach
  if(d > e.size + 24){
    e.x += (dx/d) * e.speed * dt;
    e.y += (dy/d) * e.speed * dt;
  }
  // Start a lunge if in lunge range, not recently used
  if(!e.nextLunge) e.nextLunge = now + 1500 + Math.random()*800;
  const lungeRange = 220;
  if(now >= e.nextLunge && d < lungeRange){
    e.nextLunge = now + (e.isElite ? 2500 : 3500);
    // Windup — very brief visual pause
    e.castFlashUntil = now + 220;
    setTimeout(()=>{
      if(e.dead) return;
      // Lunge directly at player's current position
      const ldx = player.x - e.x, ldy = player.y - e.y;
      const ld = Math.max(0.01, Math.sqrt(ldx*ldx + ldy*ldy));
      e.lungeVx = (ldx/ld) * 520;
      e.lungeVy = (ldy/ld) * 520;
      e.lungeUntil = performance.now() + 260;
      // During the lunge, hitting the player triggers baseline attack logic
      // (next frame will pick up proximity check). We just set a fast-move state.
      if(typeof SFX !== 'undefined' && SFX.hit) SFX.hit();
    }, 220);
  }
}

// ─── SHADE — teleports. Flickers in and out. ───
function _aiShade(e, d, dx, dy, now, dt){
  // Normal approach — same as baseline but faster
  if(!e.nextTeleport) e.nextTeleport = now + 2800 + Math.random()*1200;
  if(now >= e.nextTeleport){
    e.nextTeleport = now + (e.isElite ? 3000 : 4500);
    // Teleport to a position BEHIND the player relative to player facing.
    const behindD = 100 + Math.random() * 60;
    const facing = player.facing || 0;
    const tx = player.x - Math.cos(facing) * behindD + (Math.random()-0.5)*60;
    const ty = player.y - Math.sin(facing) * behindD + (Math.random()-0.5)*60;
    // VFX at departure
    pushGroundFX({type:'bloom', x:e.x, y:e.y, r:40, maxR:40, color:'#818cf8', life:0.3, maxLife:0.3});
    pushGroundFX({type:'ring', x:e.x, y:e.y, maxR:50, r:10, color:'#818cf8', life:0.4, maxLife:0.4, expand:true});
    // Teleport
    e.x = tx; e.y = ty;
    // VFX at arrival
    pushGroundFX({type:'bloom', x:e.x, y:e.y, r:40, maxR:40, color:'#c4b5fd', life:0.3, maxLife:0.3});
    pushGroundFX({type:'ring', x:e.x, y:e.y, maxR:50, r:10, color:'#c4b5fd', life:0.4, maxLife:0.4, expand:true});
    if(typeof SFX !== 'undefined' && SFX.veilmark) SFX.veilmark();
    // Reset attack timer so they don't instantly attack after teleporting
    e.lastAttack = now - 600;
    return;
  }
  // Between teleports — approach normally, slightly faster than base
  if(d > e.size + 24){
    e.x += (dx/d) * e.speed * 1.15 * dt;
    e.y += (dy/d) * e.speed * 1.15 * dt;
  }
  // Standard attack windup
  if(d < e.size + 30 && !e.chargingUntil && now - e.lastAttack > 1150){
    e.chargingUntil = now + 650;
    e.attackRange = e.size + 40;
  }
}

// ─── GOLEM — slow walker, telegraphed ground-pound AOE ───
function _aiGolem(e, d, dx, dy, now, dt){
  // Slow approach
  if(d > e.size + 40 && !e.poundCastUntil){
    e.x += (dx/d) * e.speed * dt;
    e.y += (dy/d) * e.speed * dt;
  }
  // Ground pound — AOE when in medium range
  if(!e.nextPound) e.nextPound = now + 3000 + Math.random()*1500;
  const poundRange = 180;
  if(now >= e.nextPound && d < poundRange && !e.poundCastUntil){
    e.nextPound = now + (e.isElite ? 3500 : 5500);
    // Long telegraph — 1.2s windup, visible warning circle
    e.poundCastUntil = now + 1200;
    e.poundRadius = 140;
    // Spawn a pulsing warning ring
    pushGroundFX({
      type:'ring', x:e.x, y:e.y,
      maxR:e.poundRadius, r:e.poundRadius, // static ring
      color:'#f59e0b', life:1.2, maxLife:1.2,
      expand:false,
    });
  }
  // Resolve pound
  if(e.poundCastUntil && now >= e.poundCastUntil){
    e.poundCastUntil = 0;
    // Deal damage if player is in radius
    const pd2 = (player.x - e.x)**2 + (player.y - e.y)**2;
    if(pd2 < e.poundRadius**2 && player.iframes <= 0){
      // Use same damage path as normal attack (with all the reductions)
      // by injecting a fake "charged attack". Simpler: fake the damage here.
      const dmg = e.attack * 1.4;
      // Quick path: apply straight to player hp with minimal flair
      // — but respects basic reductions. Simpler: call into existing
      // attack resolution by setting chargingUntil and letting next-frame resolve.
      // For now, direct: subtract with basic DR
      const gearRes = typeof getGearBonus === 'function' ? getGearBonus('res') : 0;
      const dmgReducePct = _tb('dmgReducePct');
      const finalDmg = dmg * (1 - Math.min(dmgReducePct + gearRes, 80)/100);
      player.hp -= finalDmg;
      player.iframes = 400;
      player.hitFlash = 0.2;
      spawnDmgText(player.x, player.y - 20, Math.round(finalDmg), '#ef4444', false);
      if(typeof SFX !== 'undefined' && SFX.playerHit) SFX.playerHit();
      screenShake(16, 400);
    }
    // Visual impact regardless
    pushGroundFX({type:'bloom', x:e.x, y:e.y, r:e.poundRadius, maxR:e.poundRadius, color:'#f59e0b', life:0.5, maxLife:0.5});
    pushGroundFX({type:'scorch', x:e.x, y:e.y, r:e.poundRadius-20, maxR:e.poundRadius-20, color:'#7c2d12', life:1.5, maxLife:1.5});
    screenShake(10, 280);
  }
  // Normal melee attack fallback
  if(d < e.size + 30 && !e.chargingUntil && !e.poundCastUntil && now - e.lastAttack > 1500){
    e.chargingUntil = now + 900;
    e.attackRange = e.size + 40;
  }
}

// ─── ABOMINATION — spawns 2 crawler minions when first hit below 50% HP ───
function _aiAbomination(e, d, dx, dy, now, dt){
  if(!e.spawnedMinions && e.hp < e.maxHp * 0.5){
    e.spawnedMinions = true;
    // Spawn 2 crawlers near the abomination
    for(let i = 0; i < 2; i++){
      const a = (i/2) * Math.PI * 2 + Math.random();
      const sx = e.x + Math.cos(a) * 40;
      const sy = e.y + Math.sin(a) * 40;
      spawnEnemyAt('crawler', sx, sy);
    }
    if(typeof addFeed === 'function'){
      addFeed('⚠ ABOMINATION SPAWNS CRAWLERS', '#ef4444');
    }
    pushGroundFX({type:'ring', x:e.x, y:e.y, maxR:80, r:15, color:'#34d399', life:0.6, maxLife:0.6, expand:true});
  }
  // Baseline behavior continues after this (movement + attack)
}

// Helper to spawn an enemy at specific coords using the same stat formula
// as the main spawnEnemy path. Used by abomination minion spawns.
function spawnEnemyAt(typeName, x, y){
  const td = typeof ENEMY_TYPES !== 'undefined' ? ENEMY_TYPES.find(t=>t.type===typeName) : null;
  if(!td) return;
  const hs = enemyHpScale(player.level);
  const ds = enemyDmgScale(player.level);
  const base = 200 + player.level * 5;
  const baseAtk = 20 + player.level * 0.7;
  enemies.push({
    id: enemyId++, x, y, vx:0, vy:0,
    hp: base * hs * td.hp,
    maxHp: base * hs * td.hp,
    attack: baseAtk * ds * td.dmg,
    speed: td.spd,
    dead: false, isElite: false, typeData: td,
    lastAttack: 0, hitFlash: 0,
    veilmarkStacks: 0, veilmarkExpiry: 0,
    size: td.r,
    chargingUntil: 0,
  });
}

// Enemy projectile tick — moves projectiles, checks collision with player,
// expires when life runs out. Wraiths are the primary user.
function updateEnemyProjectiles(now, dt){
  enemyProjectiles = enemyProjectiles.filter(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    // Trail particle
    if(Math.random() < 0.5){
      particles.push({
        x:p.x, y:p.y, vx:(Math.random()-0.5)*20, vy:(Math.random()-0.5)*20,
        life:0.4, maxLife:0.4, color:p.color, size:2+Math.random(), soul:true,
      });
    }
    // Hit the player
    const pdx = p.x - player.x, pdy = p.y - player.y;
    const pd2 = pdx*pdx + pdy*pdy;
    const hitR = (p.radius || 10) + 18;
    if(pd2 < hitR*hitR && player.iframes <= 0){
      const gearRes = typeof getGearBonus === 'function' ? getGearBonus('res') : 0;
      const dmgReducePct = _tb('dmgReducePct');
      const finalDmg = p.dmg * (1 - Math.min(dmgReducePct + gearRes, 80)/100);
      player.hp -= finalDmg;
      player.iframes = 240;
      player.hitFlash = 0.18;
      spawnDmgText(player.x, player.y - 20, Math.round(finalDmg), p.color, false);
      pushGroundFX({type:'bloom', x:p.x, y:p.y, r:40, maxR:40, color:p.color, life:0.3, maxLife:0.3});
      if(typeof SFX !== 'undefined' && SFX.playerHit) SFX.playerHit();
      return false; // consumed
    }
    return p.life > 0;
  });
}

// Render pass for enemy projectiles — simple colored orb with glow
function drawEnemyProjectiles(){
  enemyProjectiles.forEach(p => {
    ctx.save();
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius || 10, 0, Math.PI*2);
    ctx.fill();
    // Inner bright core
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (p.radius || 10) * 0.35, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

function updateBossAbility(boss,now,dt){
  if(!boss.ability||boss.dead)return;

  // RESOLVE: if we're currently casting and warmup is done, execute the ability
  if(boss.abilityCasting){
    if(now>=boss.abilityCasting.warmupUntil){
      resolveBossAbility(boss);
      boss.abilityCasting=null;
      boss.abilityNextCast=now+boss.ability.cooldown;
    }
    return;
  }

  // COOLDOWN: only cast when ready AND player is close enough to matter
  if(now<boss.abilityNextCast)return;
  const dx=player.x-boss.x, dy=player.y-boss.y;
  const dist=Math.sqrt(dx*dx+dy*dy);
  if(dist>700)return; // don't cast if player has run far away

  // Start the warmup — show telegraph, freeze boss movement briefly
  beginBossAbility(boss);
}

// Kicks off a boss ability cast. Displays telegraph FX so the player can see it coming.
function beginBossAbility(boss){
  const now=performance.now();
  const ab=boss.ability;
  boss.abilityCasting={type:ab.type, warmupUntil:now+ab.warmup};

  if(ab.type==='summonThralls'){
    // Purple glow and dark ring at boss feet — thralls spawning
    pushGroundFX({type:'bloom',x:boss.x,y:boss.y,r:160,maxR:160,color:'#a78bfa',life:ab.warmup/1000,maxLife:ab.warmup/1000});
    pushGroundFX({type:'ring',x:boss.x,y:boss.y,r:40,maxR:180,color:'#a78bfa',life:ab.warmup/1000,maxLife:ab.warmup/1000,expand:true,follow:boss});
    addFeed(`⚠ ${boss.bossName} CALLS THE DEAD`,'#a78bfa');
  }
  else if(ab.type==='phaseShift'){
    // Swirling blue telegraph — boss becoming incorporeal
    pushGroundFX({type:'bloom',x:boss.x,y:boss.y,r:120,maxR:120,color:'#60a5fa',life:ab.warmup/1000,maxLife:ab.warmup/1000,follow:boss});
    addFeed(`⚠ ${boss.bossName} FADES`,'#60a5fa');
  }
  else if(ab.type==='fireCross'){
    // Red rising ring + four directional indicators showing the incoming fire lines
    const colors=['#ff4400','#ff6a00'];
    pushGroundFX({type:'bloom',x:boss.x,y:boss.y,r:160,maxR:160,color:colors[0],life:ab.warmup/1000,maxLife:ab.warmup/1000,follow:boss});
    // Four line indicators — N/S/E/W telegraph rectangles
    const directions=[[1,0],[-1,0],[0,1],[0,-1]];
    directions.forEach(([dirX,dirY])=>{
      pushGroundFX({
        type:'line',
        x:boss.x, y:boss.y,
        endX:boss.x+dirX*ab.lineLength,
        endY:boss.y+dirY*ab.lineLength,
        width:ab.lineWidth*0.5,
        color:colors[0],
        life:ab.warmup/1000, maxLife:ab.warmup/1000,
        telegraph:true,
      });
    });
    addFeed(`⚠ ${boss.bossName} CHANNELS THE PYRE`,'#ff4400');
    screenShake(6,ab.warmup);
  }
}

// Executes a boss ability at the end of its warmup.
function resolveBossAbility(boss){
  const ab=boss.ability;
  const now=performance.now();

  if(ab.type==='summonThralls'){
    // Summon skeleton thralls at the boss's position
    const typeData=ENEMY_TYPES.find(t=>t.type==='skeleton')||ENEMY_TYPES[0];
    const hs=enemyHpScale(player.level),ds=enemyDmgScale(player.level);
    const base = 200 + player.level * 5;
    const baseAtk = 20 + player.level * 0.7;
    for(let i=0;i<(ab.count||2);i++){
      const a=(i/ab.count)*Math.PI*2;
      const tx=boss.x+Math.cos(a)*boss.size*1.2;
      const ty=boss.y+Math.sin(a)*boss.size*1.2;
      const clear=findClearPosition(tx,ty,22);
      enemies.push({
        id:enemyId++,x:clear.x,y:clear.y,vx:0,vy:0,
        hp:base*hs*typeData.hp*0.6, // thralls are weaker than normal skeletons
        maxHp:base*hs*typeData.hp*0.6,
        attack:baseAtk*ds*typeData.dmg*0.8,
        speed:typeData.spd*1.1, // but a bit faster
        dead:false,isElite:false,typeData,
        lastAttack:0,hitFlash:0,
        veilmarkStacks:0,veilmarkExpiry:0,
        size:typeData.r*0.9,
        isThrall:true, // mark as thrall so we can identify them
      });
      // Summon puff effect
      pushGroundFX({type:'bloom',x:clear.x,y:clear.y,r:80,maxR:80,color:'#a78bfa',life:0.4,maxLife:0.4});
    }
  }
  else if(ab.type==='phaseShift'){
    // Make boss briefly invulnerable, teleport far away, leave a dark echo behind
    boss.invulnUntil=now+(ab.invulnMs||1500);
    // Pick teleport destination — opposite side of player from boss
    const dx=boss.x-player.x, dy=boss.y-player.y;
    const d=Math.sqrt(dx*dx+dy*dy)||1;
    const td=ab.teleportDist||320;
    // Teleport past the player on the current axis
    let newX=player.x-(dx/d)*td;
    let newY=player.y-(dy/d)*td;
    // Keep in bounds
    newX=Math.max(80,Math.min(WORLD_W-80,newX));
    newY=Math.max(80,Math.min(WORLD_H-80,newY));
    const clear=findClearPosition(newX,newY,boss.size);
    // Echo at old position
    pushGroundFX({type:'bloom',x:boss.x,y:boss.y,r:200,maxR:200,color:'#60a5fa',life:0.8,maxLife:0.8});
    pushGroundFX({type:'ring',x:boss.x,y:boss.y,r:30,maxR:180,color:'#60a5fa',life:0.6,maxLife:0.6,expand:true});
    boss.x=clear.x;boss.y=clear.y;
    // Arrival FX at new position
    pushGroundFX({type:'bloom',x:boss.x,y:boss.y,r:140,maxR:140,color:'#60a5fa',life:0.4,maxLife:0.4});
    pushGroundFX({type:'ring',x:boss.x,y:boss.y,r:20,maxR:140,color:'#60a5fa',life:0.5,maxLife:0.5,expand:true,follow:boss});
    screenShake(8,200);
  }
  else if(ab.type==='fireCross'){
    // Fire hit — 4 lines damage player if they're in the cross
    const directions=[[1,0],[-1,0],[0,1],[0,-1]];
    const dmg=boss.attack*(ab.damageMult||1.5);
    directions.forEach(([dirX,dirY])=>{
      // Check if player is in this line's path. Line extends from boss in direction, length lineLength, width lineWidth
      // Project player position onto line direction
      const px=player.x-boss.x, py=player.y-boss.y;
      const alongLine=px*dirX+py*dirY; // distance along line's direction
      const perpLine=Math.abs(px*(-dirY)+py*dirX); // perpendicular distance to line
      if(alongLine>0 && alongLine<=ab.lineLength && perpLine<=ab.lineWidth/2){
        // Player is in the danger zone
        if(player.iframes<=0){
          const now=performance.now();
          let finalDmg = dmg;
          if(player.classId==='ironwake' && player.bulwarkUntil && now < player.bulwarkUntil){
            finalDmg *= 0.3;
            spawnDmgText(player.x, player.y-20, 'BLOCKED', '#d4c896', false);
          }
          if(player.classId==='ironwake' && player.retributionUntil && now < player.retributionUntil){
            if(!boss.dead)hitEnemy(boss, finalDmg*0.5, false, player.x, player.y);
            spawnDmgText(boss.x, boss.y-boss.size, 'REFLECT', '#a78bfa', false);
          }
          player.hp=Math.max(0,player.hp-finalDmg);
          if(player.classId==='ironwake'){
            const wrathGain = (player.bulwarkUntil && now < player.bulwarkUntil) ? 20 : 10;
            player.wrath = Math.min(player.wrathMax, (player.wrath||0) + wrathGain);
          }
          player.hitFlash=0.4;
          player.iframes=400;
          addFeed(`-${Math.ceil(finalDmg)} · Fire Cross`,'#ff4400');
          screenShake(12,300);
        }
      }
      // Draw persistent fire line FX (visible damage zone)
      pushGroundFX({
        type:'line',
        x:boss.x, y:boss.y,
        endX:boss.x+dirX*ab.lineLength,
        endY:boss.y+dirY*ab.lineLength,
        width:ab.lineWidth,
        color:'#ff4400',
        life:(ab.lingerMs||2000)/1000,
        maxLife:(ab.lingerMs||2000)/1000,
      });
    });
    screenShake(14,400);
  }
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
  // Dungeon clear XP — computed via formula, treated as a "standard quest"
  // worth of bonus XP (20x normal mob baseline, scaled to current level).
  // The boss already awarded major-boss XP on its own kill; this is
  // additional completion reward.
  const clearXP = (typeof computeKillXP === 'function')
    ? computeKillXP(player.level, player.level, 'stdQuest')
    : reward.bonusXP;
  addXP(clearXP);
  // Guaranteed loot at minimum rarity — UNLESS a unique drops from this boss
  // (35% chance per completeDungeon call, filtered by bossId + class lock).
  let item = null;
  if(typeof rollUniqueDropFromBoss === 'function'){
    const unique = rollUniqueDropFromBoss(def.id, player.level);
    if(unique){
      item = unique;
    }
  }
  if(!item){
    // Fallback: standard guaranteed rarity drop
    const allRarities=['common','uncommon','rare','epic','legendary','mythic'];
    const minIdx=allRarities.indexOf(reward.minRarity);
    // Pick a random rarity at or above min
    const maxIdx=Math.min(minIdx+2,allRarities.length-1);
    const chosenIdx=minIdx+Math.floor(Math.random()*(maxIdx-minIdx+1));
    const targetRarity=allRarities[chosenIdx];
    // Filter item pool for that rarity, fall back if empty
    const pool=ITEM_POOL.filter(i=>i.rarity===targetRarity);
    item = pool.length
      ? {...pool[Math.floor(Math.random()*pool.length)]}
      : rollLoot(player.level);
  }
  tryEquip(item);
  // Beam FX + dramatic exit
  const rarityColors={common:'#9ca3af',uncommon:'#22c55e',rare:'#60a5fa',epic:'#c084fc',legendary:'#f59e0b',mythic:'#ff6b6b'};
  const col=rarityColors[item.rarity]||'#fff';
  pushGroundFX({type:'beam',x:player.x,y:player.y,r:60,maxR:60,color:col,life:2.5,maxLife:2.5});
  pushGroundFX({type:'bloom',x:player.x,y:player.y,r:300,maxR:300,color:col,life:0.8,maxLife:0.8});
  screenShake(14,400);
  addFeed(`✦ ${def.name.toUpperCase()} CLEARED!`,def.color);
  // Extra celebration for unique drops
  if(item.unique){
    addFeed(`◆◆◆ UNIQUE: ${item.name.toUpperCase()} ◆◆◆`, '#f59e0b');
    addFeed(`  "${item.flavor}"`, '#c4b5fd');
    screenShake(20, 600);
  }
  addFeed(`+${reward.bonusGold} gold · +${clearXP} XP`,'#f59e0b');
  // Quest system hook — advance clear_dungeon objectives
  if(typeof questOnDungeonClear === 'function') questOnDungeonClear(def.id);
  // Veilgate hook — special bonus rewards if this was a Veilgate tier clear
  if(def.isVeilgate && typeof onVeilgateTierComplete === 'function'){
    onVeilgateTierComplete(def.veilgateTier);
  }
  // Save immediately — never lose a dungeon clear
  if(typeof writeSave==='function')writeSave();
  // Exit after a brief celebration pause
  setTimeout(()=>exitDungeon(true),2400);
}

function exitDungeon(success){
  if(!dungeonState.active)return;
  // Veilgate failure hook — fires when a Veilgate run is abandoned or died
  if(!success && dungeonState.def?.isVeilgate && typeof onVeilgateTierFailed === 'function'){
    onVeilgateTierFailed(dungeonState.def.veilgateTier);
  }
  dungeonState.active=false;
  dungeonState.phase='idle';
  dungeonState.bossEntity=null;
  bossTarget=null;
  // Clear enemies (they don't belong in the normal zone)
  enemies=[];
  // Switch ambient music back to the open-world zone's profile
  if(typeof switchAmbientZone==='function'&&curZone)switchAmbientZone(curZone.id);
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
  // Cull offscreen in world space (account for zoom)
  const halfVW = W/(2*WORLD_ZOOM), halfVH = H/(2*WORLD_ZOOM);
  if(p.x<camX-halfVW-300||p.x>camX+halfVW+300||p.y<camY-halfVH-300||p.y>camY+halfVH+300)return;
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
// Spirit archetypes — each summon gets a role with distinct combat behavior.
// Variety makes large spirit counts (Legion Commander etc) feel more epic
// than "10 identical blobs." Rolled probabilistically on spawn.
const SPIRIT_ARCHETYPES = {
  wailer: {
    name: 'Wailer',
    weight: 40,
    color: '#c4b5fd',
    sizeMult: 1.0,
    orbitRadius: 95,      // wider orbit — ranged role
    dmgMult: 0.9,
    attackReach: 110,     // can damage enemies farther from spirit
    style: 'ranged',
  },
  reaver: {
    name: 'Reaver',
    weight: 35,
    color: '#ef4444',
    sizeMult: 1.05,
    orbitRadius: 55,      // close orbit — aggressive
    dmgMult: 1.25,
    attackReach: 70,
    style: 'melee',
  },
  warden: {
    name: 'Warden',
    weight: 15,
    color: '#60a5fa',
    sizeMult: 1.15,
    orbitRadius: 40,      // hugs player
    dmgMult: 0.7,
    attackReach: 70,
    style: 'defender',
    drAura: 3,           // +3% DR per warden nearby (stacks with Procession)
  },
  nexus: {
    name: 'Nexus',
    weight: 10,
    color: '#fbbf24',
    sizeMult: 1.35,
    orbitRadius: 75,
    dmgMult: 2.0,
    attackReach: 100,
    style: 'ranged',
    rare: true,
  },
};

function _rollSpiritArchetype(){
  const keys = Object.keys(SPIRIT_ARCHETYPES);
  const totalWeight = keys.reduce((s,k)=>s+SPIRIT_ARCHETYPES[k].weight, 0);
  let roll = Math.random() * totalWeight;
  for(const k of keys){
    roll -= SPIRIT_ARCHETYPES[k].weight;
    if(roll <= 0) return k;
  }
  return 'wailer';
}

function spawnSpirit(isTemp=false){
  const perms=spirits.filter(s=>!s.isTemp&&!s.dead);
  if(!isTemp&&perms.length>=(player.maxBonds||MAX_SPIRITS))return false;
  const a=Math.random()*Math.PI*2;
  // Roll archetype for this spirit — determines visual + combat role
  let archetype = _rollSpiritArchetype();
  // ═════ UNIQUE EFFECT: The Pale Choir ═════
  // Every 3rd spirit summoned is forced to be a Nexus (the rare golden one).
  // Counter persists across session but not across character — fine for idle.
  if(typeof hasUniqueEffect === 'function' && hasUniqueEffect('pale_choir_nexus')){
    player._paleChoirCount = (player._paleChoirCount || 0) + 1;
    if(player._paleChoirCount % 3 === 0){
      archetype = 'nexus';
    }
  }
  const arch = SPIRIT_ARCHETYPES[archetype];
  spirits.push({
    id: spiritId++,
    x: player.x + Math.cos(a)*40,
    y: player.y + Math.sin(a)*40,
    dead: false, isTemp,
    lifetime: isTemp ? 45000 : Infinity,
    lastAttack: 0,
    orbitAngle: Math.random() * Math.PI*2,
    hauntTarget: null,
    attackCount: 0,
    wobble: Math.random() * Math.PI*2,
    empoweredUntil: 0,
    // Archetype fields
    archetype,
    archColor: arch.color,
    archSizeMult: arch.sizeMult,
    archOrbit: arch.orbitRadius,
    archDmgMult: arch.dmgMult,
    archReach: arch.attackReach,
    archStyle: arch.style,
    archDrAura: arch.drAura || 0,
  });
  // Feed announce rare archetypes so player feels the RNG moment
  if(arch.rare && typeof addFeed === 'function'){
    addFeed(`✦ A ${arch.name.toUpperCase()} ANSWERS THE CALL`, arch.color);
  }
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
  // Try up to 16 points within the chosen sector for a clear one
  let wx=col*sw+100+Math.random()*(sw-200);
  let wy=row*sh+100+Math.random()*(sh-200);
  let found = false;
  for(let tries=0;tries<16;tries++){
    if(!getPropCollisionAt(wx,wy,18)){ found = true; break; }
    wx=col*sw+100+Math.random()*(sw-200);
    wy=row*sh+100+Math.random()*(sh-200);
  }
  // Last resort — use findClearPosition to guarantee a clear point
  if(!found){
    const safe = findClearPosition(wx, wy, 18);
    wx = safe.x; wy = safe.y;
  }
  player.afkWpX=wx;
  player.afkWpY=wy;
}

// ═══════ ABILITY CASTS ══════════════════════════════════
// Helper: shortcut to talent bonus lookup with safe fallback
function _tb(k){return typeof getTalentBonus==='function'?getTalentBonus(k):0;}

// Compute effective cooldown for an ability after all CDR talents.
// Reads from the current class's ability definitions.
function effectiveCD(idx){
  const cls = CLASS_DEFS[player.classId] || CLASS_DEFS.hollowcaller;
  let base = cls.abilities[idx]?.cd || ABILITY_CDS[idx] || 16000;
  let cdrPct=_tb('cdrPct');
  // Gear 'cdr' stat stacks with talent cdrPct (both are flat % reductions)
  if(typeof getGearBonus === 'function'){
    cdrPct += getGearBonus('cdr');
  }
  // Hollowcaller Raise-specific CDR bonus (only applies to its slot 0)
  if(idx===0 && player.classId==='hollowcaller')cdrPct+=_tb('raiseCdrPct');
  let cd = base*(1-Math.min(cdrPct,70)/100); // cap CDR at 70% to prevent infinite loops
  // Apply level-based attack speed bonus — faster abilities at higher levels.
  // 0.3% per level past 1 (15% at level 50, 30% at level 100).
  const atkSpdMult = (typeof playerAttackSpeedBonus === 'function')
    ? playerAttackSpeedBonus(player.level)
    : 1.0;
  cd = cd / atkSpdMult;
  return cd;
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
  // AOE damage bonus (Veilcraft Searing Eruption)
  const aoePct = _tb('aoeDmgPct');
  if(aoePct>0) mult += aoePct/100;
  // Legion Mode (Binding capstone) — 8+ spirits grants +50% damage
  if(_tb('legionMode') > 0){
    const aliveSpirits = spirits.filter(sp => !sp.dead && !sp.isTemp).length;
    if(aliveSpirits >= 8) mult += 0.50;
  }
  // Altar damage buff — adds flat multiplier when active
  if(typeof getActiveBuffValue === 'function'){
    mult += getActiveBuffValue('damage');
  }
  return mult;
}

// ═══════ ABILITY CAST CONTEXT ══════════════════════════════════
// Set to the ability ID currently being cast. Read by hitEnemy so that
// echo damage modifiers apply universally — including to preset abilities
// that never explicitly read getAbilityEchoModifiers themselves.
//
// Lifecycle: set at top of playerCast, cleared after the ability finishes.
// Nested calls are safe — hitEnemy just reads whatever's current.
let _currentCastAbilityId = null;

// ═══════ AFK ABILITY GATING ═══════════════════════════════════════
// Returns true if the given ability slot should be cast right now given
// the current combat situation. Per-class + per-ability rules.
//
// Philosophy: don't waste cooldowns. An ultimate on a single trash mob is
// a massive loss. Detonate with 0 stacks is nothing. Wrath Tide on one
// enemy is fine but better on three. This gating dramatically improves
// the feel of AFK play.
function shouldAfkCast(idx, target, crowdCount, now){
  if(!target) return false; // never cast with no enemies visible
  const cls = player.classId || 'hollowcaller';
  const targetD2 = (target.x - player.x)**2 + (target.y - player.y)**2;
  const inRangeFor = (radius) => targetD2 < radius * radius;
  // Hollowcaller ability logic
  if(cls === 'hollowcaller'){
    if(idx === 0){
      // Raise Spirit — always good to cast if we have spirit room
      return true;
    }
    if(idx === 1){
      // Veilmark — apply to nearest enemy. Only cast if not already marked
      // to stack capacity, and target has > 20% HP (don't waste on dying)
      if(!inRangeFor(950)) return false;
      if(target.veilmarkStacks >= 8) return false;
      if(target.hp < target.maxHp * 0.20) return false;
      return true;
    }
    if(idx === 2){
      // Detonate — only fire if SOMEONE has 3+ stacks (Detonate's minimum)
      let hasMarked = false;
      enemies.forEach(e=>{
        if(!e.dead && e.veilmarkStacks >= 3) hasMarked = true;
      });
      return hasMarked;
    }
    if(idx === 3){
      // Wrath Tide — AOE that applies marks. Worth casting at 2+ enemies,
      // or 1 enemy if that enemy is an elite.
      if(crowdCount >= 2) return true;
      if(target.isElite && inRangeFor(340)) return true;
      return false;
    }
    if(idx === 4){
      // Soul Nova — ultimate. Only fire at 4+ enemies OR an elite/boss in range.
      if(crowdCount >= 4) return true;
      if((target.isElite || target.isBoss) && inRangeFor(460)) return true;
      return false;
    }
  }
  // Ironwake ability logic
  if(cls === 'ironwake'){
    if(idx === 0){
      // Anchor Strike — 120 unit melee. Fire whenever target is close.
      return inRangeFor(130);
    }
    if(idx === 1){
      // Bulwark — defensive CD. Fire when multiple enemies nearby OR HP < 60%.
      if(crowdCount >= 2) return true;
      if(player.hp < player.maxHp * 0.6) return true;
      return false;
    }
    if(idx === 2){
      // Ground Shatter — AOE + stun. Fire at 2+ enemies.
      return crowdCount >= 2;
    }
    if(idx === 3){
      // Retribution — reflect window. Fire when actively being hit (crowd >= 2)
      // or target is an elite.
      if(crowdCount >= 2) return true;
      if(target.isElite || target.isBoss) return true;
      return false;
    }
    if(idx === 4){
      // Ironwake's Fury — charge ult. Need target within charge range.
      // Only fire at elite/boss or 4+ enemies.
      if(crowdCount >= 4) return true;
      if(target.isElite || target.isBoss) return true;
      return false;
    }
  }
  return true; // unknown class — fallback to always-fire
}

function playerCast(idx){
  const now=performance.now();
  if(now<abilityCDs[idx]||player.isDead)return;
  // Set cast context — hitEnemy will apply echo dmgMult to any hits during this window
  const cls = CLASS_DEFS[player.classId] || CLASS_DEFS.hollowcaller;
  _currentCastAbilityId = cls.abilities[idx]?.id || null;
  // Blood Price talent — set flag; first hit after this cast gets bonus dmg
  if(_tb('bloodPricePct') > 0) player._bloodPriceReady = true;
  try {
    _playerCastDispatch(idx, now);
  } finally {
    // Clear context AFTER cast finishes. Any follow-up damage triggered
    // synchronously (explosions, chains, spirit hits) happens within this
    // window and inherits the echo mods for the cast. Delayed setTimeout
    // callbacks (Cataclysm chains) fire later; they don't inherit.
    _currentCastAbilityId = null;
  }
}

// Internal dispatcher — split out so try/finally above can wrap cleanly.
function _playerCastDispatch(idx, now){
  // Route to class-specific ability handler
  if(player.classId==='ironwake'){
    // ═══ PRESET OVERRIDES (Ironwake) ═══
    // Same pattern as Hollowcaller — preset handler returns true to
    // intercept, false to fall through to the default Ironwake ability.
    if(typeof castIronwakePresetOverride === 'function'){
      if(castIronwakePresetOverride(idx, now)) return;
    }
    return castIronwake(idx, now);
  }
  // ═══ PRESET OVERRIDES (Hollowcaller) ═══
  if(typeof castHollowcallerPresetOverride === 'function'){
    if(castHollowcallerPresetOverride(idx, now)) return;
  }
  // Default: Hollowcaller (existing behavior)
  castHollowcallerBase(idx, now);
}

function castHollowcallerBase(idx, now){
  if(idx===0){
    // Raise — summon one spirit, or two with Echoing Call talent
    // Echoes can further multiply the count, shorten cooldown, tint visuals.
    const mods = (typeof getAbilityEchoModifiers === 'function')
      ? getAbilityEchoModifiers('raise') : null;
    const doubles=_tb('raiseDoubles')>0;
    const plusOne=_tb('raisePlusOne')>0;
    // Base count is 1 (or 2 if talent), +1 if Greater Summoning, × echo countMult
    let summonCount = doubles ? 2 : 1;
    if(plusOne) summonCount += 1;
    if(mods && mods.countMult > 1.0){
      summonCount = Math.round(summonCount * mods.countMult);
    }
    let anySummoned = false;
    for(let s = 0; s < summonCount; s++){
      if(spawnSpirit()) anySummoned = true;
    }
    if(anySummoned){
      // Echo-modified cooldown
      const cd = effectiveCD(0) * (mods?.cdrMult || 1);
      abilityCDs[0]=now+cd;
      SFX.spiritSummon();
      // Echo-modified visual tint
      const tint = mods?.elementTint || '#9DC4B0';
      addFeed(summonCount > 1 ? `✦×${summonCount} SPIRITS RAISED` : '✦ SPIRIT RAISED', tint);
      emitSpiritBurst(player.x,player.y);
      pushGroundFX({type:'ring',x:player.x,y:player.y,maxR:110,r:10,color:tint,life:0.55,maxLife:0.55,expand:true});
      pushGroundFX({type:'scorch',x:player.x,y:player.y,r:90,maxR:90,color:tint,life:0.9,maxLife:0.9});
      // Bound Chord resonance — empower spirits for a duration
      if(mods?.empowersSpirits){
        spirits.forEach(sp => {
          if(sp.dead) return;
          sp.empoweredUntil = now + (mods.spiritEmpowerDur || 5000);
          sp._echoEmpowerPct = mods.spiritEmpowerPct || 50;
        });
      }
    }
  } else if(idx===1){
    // Veilmark — apply stacks to nearest enemy (up to 950u range)
    // Echoes can boost stacks applied, reduce cooldown, tint visuals
    const mods = (typeof getAbilityEchoModifiers === 'function')
      ? getAbilityEchoModifiers('veilmark') : null;
    const t=getNearestEnemy(950);
    if(t){
      const vmMax=10+_tb('veilmarkMax');
      // Base stack is 1, echoes can add more via appliesVeilmark
      const stacksToApply = 1 + (mods?.appliesVeilmark || 0);
      t.veilmarkStacks=Math.min(t.veilmarkStacks + stacksToApply, vmMax);
      t.veilmarkExpiry=now+8000+_tb("veilmarkDurationMs");
      const cd = effectiveCD(1) * (mods?.cdrMult || 1);
      abilityCDs[1]=now+cd;
      SFX.veilmark();
      const tint = mods?.elementTint || '#f43f5e';
      addFeed(`VEILMARK ×${t.veilmarkStacks}`, tint);
      pushGroundFX({type:'bloom',x:t.x,y:t.y,r:80,maxR:80,color:tint,life:0.35,maxLife:0.35});
    }
  } else if(idx===2){
    // Detonate — AOE around a marked enemy
    // Echoes can boost damage, radius, cooldown, tint, and unlock Cataclysm chaining
    const mods = (typeof getAbilityEchoModifiers === 'function')
      ? getAbilityEchoModifiers('detonate') : null;
    const t=getNearestMarkedEnemy();
    if(t&&t.veilmarkStacks>=3){
      const detoDmgMult=1+_tb('detoDmgPct')/100;
      // Echo dmgMult is now applied universally in hitEnemy via _currentCastAbilityId
      const echoRadius = mods?.radiusMult || 1.0;
      // Final Eruption capstone — triple radius, half damage (zone-clear style)
      const finalEruption = _tb('finalEruption') > 0;
      const fr = finalEruption ? 3.0 : 1.0;
      const fd = finalEruption ? 0.5 : 1.0;
      const radius=(240+_tb('detoRadius')) * echoRadius * fr;
      const dmg=player.attack*2*t.veilmarkStacks*damageMult()*detoDmgMult*fd;
      let hits=0;
      const markedForChain = []; // collect other marked enemies for chain-detonate
      enemies.forEach(e=>{
        if(!e.dead&&dist2(t.x,t.y,e.x,e.y)<radius){
          hitEnemy(e,dmg,false,t.x,t.y);
          hits++;
          // If Cataclysm echo active, collect other marked enemies for chain
          if(mods?.chainDetonates && e !== t && e.veilmarkStacks > 0){
            markedForChain.push(e);
          }
        }
      });
      t.veilmarkStacks=0;
      const cd = effectiveCD(2) * (mods?.cdrMult || 1);
      abilityCDs[2]=now+cd;
      SFX.detonate();
      screenShake(14,320);
      const tint = mods?.elementTint || '#ff6b35';
      emitExplosion(t.x,t.y,tint);
      pushGroundFX({type:'ring',x:t.x,y:t.y,maxR:radius,r:20,color:tint,life:0.5,maxLife:0.5,expand:true});
      pushGroundFX({type:'scorch',x:t.x,y:t.y,r:radius-40,maxR:radius-40,color:tint,life:1.8,maxLife:1.8});
      pushGroundFX({type:'bloom',x:t.x,y:t.y,r:radius-60,maxR:radius-60,color:'#fff4a0',life:0.25,maxLife:0.25});
      // Lingering Wound echo — leaves a damaging zone
      if(mods?.leavesPool){
        // Use existing worldCaches/scorch pattern — emit scorch + queue pool damage
        const poolDuration = mods.poolDuration || 4000;
        const poolDps = mods.poolDmgPerSec || 0.3;
        pushGroundFX({type:'scorch',x:t.x,y:t.y,r:radius*0.8,maxR:radius*0.8,color:tint,life:poolDuration/1000,maxLife:poolDuration/1000});
        // Register a ticking damage pool
        if(!window.__damagePools) window.__damagePools = [];
        window.__damagePools.push({
          x:t.x, y:t.y, radius:radius*0.8,
          dmgPerTick: dmg * poolDps,
          expiresAt: now + poolDuration,
          lastTick: now,
        });
      }
      addFeed(`💥 DETONATE! ${hits} HIT · ${Math.round(dmg)}`, tint);
      // Cataclysm echo — trigger detonation on ALL other marked enemies (0.3s delay each)
      // Capture the echo dmg multiplier so chain-detonations (which fire
      // async via setTimeout) still get the bonus. Sync hits go through
      // hitEnemy during the active cast window, which applies dmgMult there.
      const echoCapturedDmgMult = mods?.dmgMult || 1.0;
      if(mods?.chainDetonates && markedForChain.length > 0){
        markedForChain.forEach((me, i) => {
          setTimeout(() => {
            if(me.dead) return;
            const chainRadius = radius * 0.85;
            // chainDmg pre-applies the captured echo mult since the cast
            // context is cleared by the time this setTimeout runs.
            const chainDmg = dmg * 0.7 * echoCapturedDmgMult;
            enemies.forEach(ce=>{
              if(!ce.dead && dist2(me.x, me.y, ce.x, ce.y) < chainRadius){
                hitEnemy(ce, chainDmg, false, me.x, me.y);
              }
            });
            me.veilmarkStacks = 0;
            pushGroundFX({type:'ring',x:me.x,y:me.y,maxR:chainRadius,r:15,color:tint,life:0.4,maxLife:0.4,expand:true});
            pushGroundFX({type:'bloom',x:me.x,y:me.y,r:chainRadius*0.7,maxR:chainRadius*0.7,color:tint,life:0.3,maxLife:0.3});
            emitExplosion(me.x, me.y, tint);
          }, 200 + i * 150);
        });
        addFeed(`  ↳ CATACLYSM — chained ${markedForChain.length}`, '#fbbf24');
      }
      // Cataclysm talent: 30% chance base, + Endless Harvest stacks additively
      const baseEchoChance = _tb('detoEcho') > 0 ? 0.3 : 0;
      const extraEchoChance = _tb('detoEchoChance') / 100;
      const totalEchoChance = baseEchoChance + extraEchoChance;
      if(totalEchoChance > 0 && Math.random() < totalEchoChance){
        setTimeout(()=>{
          let hits2=0;
          // chain damage pre-applies the captured echo mult (context is cleared by now)
          const chainDmg2 = dmg * 0.7 * echoCapturedDmgMult;
          enemies.forEach(e=>{if(!e.dead&&dist2(t.x,t.y,e.x,e.y)<radius){hitEnemy(e,chainDmg2,false,t.x,t.y);hits2++;}});
          pushGroundFX({type:'ring',x:t.x,y:t.y,maxR:radius,r:20,color:'#fff4a0',life:0.4,maxLife:0.4,expand:true});
          if(hits2>0)addFeed(`  ↳ CATACLYSM ECHO · ${hits2}`,'#fff4a0');
        },180);
      }
    }
  } else if(idx===3){
    // Wrath Tide — AOE around player that also applies Veilmark
    const mods = (typeof getAbilityEchoModifiers === 'function')
      ? getAbilityEchoModifiers('wrath') : null;
    // Echo dmgMult applied in hitEnemy universally
    const echoRadius = mods?.radiusMult || 1.0;
    const radius=(340+_tb('wrathRadius')) * echoRadius;
    const dmg=player.attack*1.6*damageMult();
    let hits=0;
    const vmMax=10+_tb('veilmarkMax');
    // Base 1 stack applied, echo appliesVeilmark can add more
    const stacksApplied = 1 + (mods?.appliesVeilmark || 0);
    enemies.forEach(e=>{
      if(!e.dead&&dist2(player.x,player.y,e.x,e.y)<radius){
        hitEnemy(e,dmg,false,player.x,player.y);
        e.veilmarkStacks=Math.min(e.veilmarkStacks+stacksApplied,vmMax);
        e.veilmarkExpiry=now+8000+_tb("veilmarkDurationMs");
        hits++;
      }
    });
    const cd = effectiveCD(3) * (mods?.cdrMult || 1);
    abilityCDs[3]=now+cd;
    SFX.wrathTide();
    emitWave(player.x,player.y);
    const tint = mods?.elementTint || '#a855f7';
    pushGroundFX({type:'ring',x:player.x,y:player.y,maxR:radius,r:20,color:tint,life:0.6,maxLife:0.6,expand:true});
    pushGroundFX({type:'scorch',x:player.x,y:player.y,r:radius-20,maxR:radius-20,color:tint,life:1.5,maxLife:1.5});
    addFeed(`⚡ WRATH TIDE — ${hits} MARKED`, tint);
  } else if(idx===4){
    // Soul Nova — Hollowcaller ultimate AOE
    const mods = (typeof getAbilityEchoModifiers === 'function')
      ? getAbilityEchoModifiers('nova') : null;
    // Echo dmgMult applied in hitEnemy universally
    const echoRadius = mods?.radiusMult || 1.0;
    const radius = 460 * echoRadius;
    const dmg=player.attack*3.2*damageMult();
    let hits=0;
    enemies.forEach(e=>{
      if(!e.dead&&dist2(player.x,player.y,e.x,e.y)<radius){
        hitEnemy(e,dmg,false,player.x,player.y);
        hits++;
      }
    });
    const cd = effectiveCD(4) * (mods?.cdrMult || 1);
    abilityCDs[4]=now+cd;
    if(SFX.eliteDeath)SFX.eliteDeath();
    screenShake(20,500);
    const tint = mods?.elementTint || '#fbbf24';
    pushGroundFX({type:'bloom',x:player.x,y:player.y,r:300,maxR:300,color:tint,life:0.5,maxLife:0.5});
    pushGroundFX({type:'ring',x:player.x,y:player.y,maxR:radius,r:30,color:tint,life:0.8,maxLife:0.8,expand:true});
    pushGroundFX({type:'scorch',x:player.x,y:player.y,r:radius-20,maxR:radius-20,color:tint,life:2.2,maxLife:2.2});
    addFeed(`★ SOUL NOVA — ${hits} STRUCK · ${Math.round(dmg)}`, tint);
  }
}

// ═══════ IRONWAKE ABILITIES ═════════════════════════════════════════
// Melee juggernaut. Abilities focus on area melee strikes, damage reduction,
// threat-based counters, and decisive commitments. Wrath resource builds from
// taking damage — see applyPlayerHit hook.
function castIronwake(idx, now){
  const cls = CLASS_DEFS.ironwake;
  // Ironwake ability IDs in slot order — used to look up echo modifiers
  const ironwakeIds = ['anchor','bulwark','shatter','retribution','fury'];
  const abilityId = ironwakeIds[idx];
  const mods = (typeof getAbilityEchoModifiers === 'function')
    ? getAbilityEchoModifiers(abilityId) : null;
  // echoDmg is now applied universally in hitEnemy via _currentCastAbilityId
  const echoRadius = mods?.radiusMult || 1.0;
  const echoCdr = mods?.cdrMult || 1.0;

  if(idx===0){
    // Anchor Strike — 180° cleave in facing direction, short range, high damage
    const range = 120 * echoRadius;
    const dmg = player.attack * 1.8 * damageMult();
    const dir = player.facing || 0;
    let hits = 0;
    enemies.forEach(e=>{
      if(e.dead)return;
      const dx = e.x - player.x, dy = e.y - player.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if(d > range) return;
      // Angle from player to enemy
      const ang = Math.atan2(dy, dx);
      let diff = ang - dir;
      while(diff > Math.PI) diff -= Math.PI*2;
      while(diff < -Math.PI) diff += Math.PI*2;
      if(Math.abs(diff) > Math.PI/2) return; // 180° arc = 90° each side
      hitEnemy(e, dmg, false, player.x, player.y);
      // Echo-applied veilmark (resonance echo)
      if(mods?.appliesVeilmark > 0){
        const vmMax=10+_tb('veilmarkMax');
        e.veilmarkStacks = Math.min(e.veilmarkStacks + mods.appliesVeilmark, vmMax);
        e.veilmarkExpiry = now + 8000;
      }
      // Echo-granted momentum on hit (Gathering Storm resonance)
      if(mods?.grantsMomentum > 0 && player.momentumStacks !== undefined){
        player.momentumStacks = Math.min(20, (player.momentumStacks||0) + mods.grantsMomentum);
        player.momentumLastGainedAt = now;
      }
      hits++;
    });
    abilityCDs[0] = now + effectiveCD(0) * echoCdr;
    // ═════ WRATH GENERATION ON HIT ═════
    // Previously Ironwake only built Wrath from damage TAKEN. That made the
    // kit feel passive — you just stood there waiting to be hit. Now Anchor
    // Strike grants +4 Wrath per enemy hit, rewarding aggression and giving
    // a clear feedback loop: swing → wrath → bigger swing.
    if(hits > 0){
      const wrathGain = hits * 4;
      player.wrath = Math.min(player.wrathMax || 100, (player.wrath || 0) + wrathGain);
      if(typeof spawnDmgText === 'function'){
        spawnDmgText(player.x, player.y - 48, `+${wrathGain} WRATH`, '#ef4444', false);
      }
    }
    const tint = mods?.elementTint || '#ef4444';
    pushGroundFX({type:'ring', x:player.x, y:player.y, maxR:range, r:30, color:tint, life:0.4, maxLife:0.4, expand:true});
    pushGroundFX({type:'bloom', x:player.x+Math.cos(dir)*60, y:player.y+Math.sin(dir)*60, r:90*echoRadius, maxR:90*echoRadius, color:tint, life:0.35, maxLife:0.35});
    screenShake(8, 180);
    if(typeof SFX!=='undefined' && SFX.hit) SFX.hit();
    addFeed(`⚔ ANCHOR STRIKE — ${hits} HIT`, tint);
  }
  else if(idx===1){
    // Bulwark — raise shield. 70% damage reduction for 2s, double wrath gain from hits.
    player.bulwarkUntil = now + 2000;
    abilityCDs[1] = now + effectiveCD(1) * echoCdr;
    const tint = mods?.elementTint || '#d4c896';
    pushGroundFX({type:'bloom', x:player.x, y:player.y, r:120*echoRadius, maxR:120*echoRadius, color:'#8b7355', life:0.5, maxLife:0.5, follow:player});
    pushGroundFX({type:'rimlight', x:player.x, y:player.y, r:80*echoRadius, maxR:80*echoRadius, color:tint, life:2, maxLife:2, follow:player});
    addFeed(`🛡 BULWARK RAISED`, tint);
    if(typeof SFX!=='undefined' && SFX.hit) SFX.hit();
  }
  else if(idx===2){
    // Ground Shatter — AoE stun + heavy damage
    const radius = 280 * echoRadius;
    const dmg = player.attack * 2.2 * damageMult();
    let hits = 0;
    enemies.forEach(e=>{
      if(e.dead) return;
      const d = dist2(player.x, player.y, e.x, e.y);
      if(d > radius) return;
      hitEnemy(e, dmg, false, player.x, player.y);
      // Stun: cancel windup, push lastAttack forward so they can't attack for 1.2s
      e.chargingUntil = 0;
      e.lastAttack = now + 200; // delay their next attack window
      e.stunUntil = now + 1200;
      // Echo-applied veilmark
      if(mods?.appliesVeilmark > 0){
        const vmMax=10+_tb('veilmarkMax');
        e.veilmarkStacks = Math.min(e.veilmarkStacks + mods.appliesVeilmark, vmMax);
        e.veilmarkExpiry = now + 8000;
      }
      hits++;
    });
    abilityCDs[2] = now + effectiveCD(2) * echoCdr;
    screenShake(16, 400);
    const tint = mods?.elementTint || '#fbbf24';
    pushGroundFX({type:'ring', x:player.x, y:player.y, maxR:radius, r:20, color:tint, life:0.6, maxLife:0.6, expand:true});
    pushGroundFX({type:'scorch', x:player.x, y:player.y, r:radius-40, maxR:radius-40, color:'#b8860b', life:1.4, maxLife:1.4});
    pushGroundFX({type:'bloom', x:player.x, y:player.y, r:180*echoRadius, maxR:180*echoRadius, color:'#fff4a0', life:0.3, maxLife:0.3});
    // Lingering Wound — damage pool
    if(mods?.leavesPool){
      if(!window.__damagePools) window.__damagePools = [];
      window.__damagePools.push({
        x:player.x, y:player.y, radius:radius*0.85,
        dmgPerTick: dmg * (mods.poolDmgPerSec || 0.3) * 0.5,
        expiresAt: now + (mods.poolDuration || 4000),
        lastTick: now,
      });
    }
    if(typeof SFX!=='undefined' && SFX.detonate) SFX.detonate();
    addFeed(`💥 GROUND SHATTER — ${hits} STUNNED`, tint);
  }
  else if(idx===3){
    // Retribution — reflect 50% damage for 5s
    player.retributionUntil = now + 5000;
    abilityCDs[3] = now + effectiveCD(3) * echoCdr;
    const tint = mods?.elementTint || '#a78bfa';
    pushGroundFX({type:'bloom', x:player.x, y:player.y, r:180*echoRadius, maxR:180*echoRadius, color:tint, life:0.6, maxLife:0.6});
    pushGroundFX({type:'rimlight', x:player.x, y:player.y, r:110*echoRadius, maxR:110*echoRadius, color:tint, life:5, maxLife:5, follow:player});
    addFeed(`◈ RETRIBUTION ACTIVE`, tint);
    if(typeof SFX!=='undefined' && SFX.veilmark) SFX.veilmark();
  }
  else if(idx===4){
    // Ironwake's Fury — charge 400px forward in facing direction, hit all in path
    const charge = 400 * echoRadius;
    const dmg = player.attack * 3.5 * damageMult();
    const dir = player.facing || 0;
    const startX = player.x, startY = player.y;
    const endX = player.x + Math.cos(dir)*charge;
    const endY = player.y + Math.sin(dir)*charge;
    // Hit everything in a line between start and end
    let hits = 0;
    enemies.forEach(e=>{
      if(e.dead) return;
      // Project enemy position onto charge line
      const px = e.x - startX, py = e.y - startY;
      const projAlong = px*Math.cos(dir) + py*Math.sin(dir); // how far along the line
      const perpLine = Math.abs(px*(-Math.sin(dir)) + py*Math.cos(dir)); // perpendicular distance
      if(projAlong > 0 && projAlong <= charge && perpLine < 100){
        hitEnemy(e, dmg, false, startX, startY);
        // Knockdown: big lastAttack delay
        e.chargingUntil = 0;
        e.lastAttack = now + 500;
        e.stunUntil = now + 1800;
        // Echo momentum grant
        if(mods?.grantsMomentum > 0 && player.momentumStacks !== undefined){
          player.momentumStacks = Math.min(20, (player.momentumStacks||0) + mods.grantsMomentum);
          player.momentumLastGainedAt = now;
        }
        hits++;
      }
    });
    // Teleport player to end of charge (only if clear)
    if(typeof findClearPosition==='function'){
      const clear = findClearPosition(endX, endY, 22);
      player.x = clear.x;
      player.y = clear.y;
    } else {
      player.x = endX; player.y = endY;
    }
    if(typeof camX!=='undefined'){ camX = player.x; camY = player.y; }
    abilityCDs[4] = now + effectiveCD(4) * echoCdr;
    screenShake(22, 600);
    // Visual trail
    pushGroundFX({type:'line', x:startX, y:startY, endX:player.x, endY:player.y, width:150, color:'#ff4400', life:1.2, maxLife:1.2});
    pushGroundFX({type:'bloom', x:player.x, y:player.y, r:200, maxR:200, color:'#ff4400', life:0.4, maxLife:0.4});
    pushGroundFX({type:'ring', x:player.x, y:player.y, maxR:280, r:20, color:'#ff4400', life:0.7, maxLife:0.7, expand:true});
    if(typeof SFX!=='undefined' && SFX.eliteDeath) SFX.eliteDeath();
    addFeed(`★ IRONWAKE'S FURY — ${hits} STRUCK`, '#ff4400');
  }
}

// ═══════ COMBAT ═════════════════════════════════════════
function getNearestEnemy(maxR=Infinity){let b=null,bd=maxR;enemies.forEach(e=>{if(e.dead)return;const d=dist2(player.x,player.y,e.x,e.y);if(d<bd){bd=d;b=e;}});return b;}
function getNearestMarkedEnemy(){const now=performance.now();let b=null,bd=Infinity;enemies.forEach(e=>{if(e.dead||e.veilmarkStacks<=0||now>e.veilmarkExpiry)return;const d=dist2(player.x,player.y,e.x,e.y);if(d<bd){bd=d;b=e;}});return b;}

function hitEnemy(e,dmg,isCrit=false,fromX,fromY){
  if(e.dead)return;
  // Boss invulnerability during phase shift — hits pass through, no damage
  if(e.invulnUntil&&performance.now()<e.invulnUntil){
    spawnDmgText(e.x,e.y-e.size,'IMMUNE','#60a5fa',false);
    return;
  }
  // Specter phase — intangible 65% of the time. Damage reduced to 25%
  // during phase. Full damage only in the brief tangible window.
  if(e.specterIntangible){
    dmg *= 0.25;
    spawnDmgText(e.x, e.y - e.size - 14, 'PHASED', '#9DC4B0', false);
  }
  const now = performance.now();
  // ─── UNIVERSAL ECHO DAMAGE HOOK ───────────────────────────────
  // If a cast is in progress (set by playerCast), apply its echo dmgMult
  // to every hit. This makes echoes affect preset abilities without
  // requiring changes to every preset ability body.
  if(_currentCastAbilityId && typeof getAbilityEchoModifiers === 'function'){
    const castMods = getAbilityEchoModifiers(_currentCastAbilityId);
    if(castMods && castMods.dmgMult && castMods.dmgMult !== 1.0){
      dmg *= castMods.dmgMult;
    }
  }
  // ─── IRONWAKE PRESET DAMAGE BUFFS ─────────────────────────────
  // Juggernaut — Momentum stacks give +5% per stack (max 20 = +100%)
  if(player.momentumStacks && player.momentumStacks > 0){
    dmg *= (1 + player.momentumStacks * 0.05);
  }
  // Blood Price — first hit after cast deals bonus damage.
  // Flag is set by playerCast; consumed here on first hitEnemy.
  if(player._bloodPriceReady && _tb('bloodPricePct') > 0){
    player._bloodPriceReady = false;
    const pct = _tb('bloodPricePct');
    dmg *= (1 + pct/100);
    // Small HP sacrifice — 3% of current
    const cost = Math.floor(player.hp * 0.03);
    if(cost > 0) player.hp = Math.max(1, player.hp - cost);
  }
  // ═════ UNIQUE EFFECT: Shroud-Walker's Tread ═════
  // +50% damage while the momentum buff is active.
  if(player._shroudBuffUntil && now < player._shroudBuffUntil){
    dmg *= 1.5;
  }
  // Ruinous Strike — every Nth hit deals +100% damage
  // Savage Joy talent lowers N from 5 → 3.
  if(_tb('ruinousStrike') > 0){
    player._ruinousCount = (player._ruinousCount || 0) + 1;
    const every = _tb('ruinousStrikeEvery') || 5;
    if(player._ruinousCount >= every){
      player._ruinousCount = 0;
      dmg *= 2.0;
      spawnDmgText(e.x, e.y - e.size - 12, 'RUIN', '#ef4444', true);
    }
  }
  // ─── IRONWAKE TALENT TREE BONUSES ─────────────────────────────
  // Warborn Iron Edge — melee damage (Ironwake only)
  if(player.classId === 'ironwake'){
    const meleePct = _tb('meleeDmgPct');
    if(meleePct > 0) dmg *= (1 + meleePct/100);
  }
  // Warborn Executioner's Mark — bonus vs wounded enemies
  const executePct = _tb('executeDmgPct');
  if(executePct > 0 && e.hp < e.maxHp * 0.5){
    dmg *= (1 + executePct/100);
  }
  // Bloodbound Pain Offering — bonus dmg when YOU are wounded
  const painPct = _tb('painOfferingPct');
  if(painPct > 0 && player.hp < player.maxHp * 0.5){
    dmg *= (1 + painPct/100);
  }
  const buffCrit = typeof getActiveBuffValue === 'function' ? getActiveBuffValue('crit') : 0;
  const gearCrit = typeof getGearBonus === 'function' ? getGearBonus('crit') : 0;
  // Bonus crit chance vs wounded enemies (Warborn Executioner's Resolve)
  let lowHpCritBonus = 0;
  const lowHpCritPct = _tb('lowHpCritPct');
  if(lowHpCritPct > 0 && e.hp < e.maxHp * 0.5){
    lowHpCritBonus = lowHpCritPct / 100;
  }
  const critChance=0.12+_tb('critPct')/100 + buffCrit + gearCrit/100 + lowHpCritBonus;
  let critRoll = Math.random() < critChance;
  // ═════ UNIQUE EFFECT: Crown of the Unmaking ═════
  // Guaranteed crit vs enemies below 30% HP.
  if(typeof hasUniqueEffect === 'function' && hasUniqueEffect('crown_execute')){
    if(e.hp < e.maxHp * 0.30) critRoll = true;
  }
  // ─── Reaver-Saint Bloodvow: force crit + extra lifesteal on empowered hits ───
  let bloodvowBonus = 0;
  if(typeof applyBloodvowBonusToHit === 'function'){
    const bv = applyBloodvowBonusToHit(dmg);
    if(bv.isCrit){
      critRoll = true;
      dmg = bv.dmg;
      bloodvowBonus = bv.healPct; // bonus lifesteal % for this hit only
    }
  }
  // Crit damage multiplier — base 2.2x, plus talent critDmgPct bonus
  const critDmgBonus = _tb('critDmgPct');
  const critMult = 2.2 + critDmgBonus/100;
  let finalDmg = critRoll ? dmg * critMult : dmg;
  // Veilmark vulnerability talent — marked enemies take bonus damage per stack
  const vulnPct = _tb('veilmarkVulnPct');
  if(vulnPct > 0 && e.veilmarkStacks > 0){
    finalDmg *= (1 + (vulnPct * e.veilmarkStacks) / 100);
  }
  // ─── UNBOUND (Bloodforged Ult) — execute enemies below threshold ───
  if(player.unboundUntil && now < player.unboundUntil && !e.isBoss){
    const hpPctAfter = (e.hp - finalDmg) / e.maxHp;
    if(hpPctAfter < (player.unboundThreshold || 0.5)){
      finalDmg = e.hp; // kill shot
      spawnDmgText(e.x, e.y - e.size - 10, 'UNBOUND', '#ef4444', true);
    }
  }
  e.hp-=finalDmg;e.hitFlash=0.18;
  // ═════ UNIQUE EFFECT: Mournblade ═════
  // Every 5th player hit fears the target for 1 second.
  if(typeof hasUniqueEffect === 'function' && hasUniqueEffect('mournblade_fear')){
    player._mournbladeHits = (player._mournbladeHits || 0) + 1;
    if(player._mournbladeHits >= 5){
      player._mournbladeHits = 0;
      e.fearedUntil = performance.now() + 1000;
      spawnDmgText(e.x, e.y - e.size - 16, 'FEARED', '#a78bfa', true);
      if(typeof pushGroundFX === 'function'){
        pushGroundFX({type:'ring', x:e.x, y:e.y, maxR:70, r:10, color:'#a78bfa', life:0.5, maxLife:0.5, expand:true});
      }
    }
  }
  // Magnitude-aware damage text. Tier is computed from damage/maxHp ratio.
  // If this hit will kill the enemy, use execute color (amber) even at low tiers
  // to signal "the killing blow." Otherwise, standard crit/normal palette.
  const isKillingBlow = e.hp <= 0;
  const dmgColor = isKillingBlow
    ? '#fbbf24'                              // golden — execution
    : (critRoll ? '#fde68a' : '#fff');
  spawnDmgText(
    e.x, e.y - e.size,
    Math.round(finalDmg),
    dmgColor,
    critRoll,
    { targetMaxHp: e.maxHp }
  );
  // ─── Reaver-Saint passive lifesteal: heal for % of damage dealt ───
  if(typeof reaverSaintOnHit === 'function') reaverSaintOnHit(finalDmg);
  // ─── Bloodbound Crimson Thirst — Ironwake talent lifesteal ───
  const lsPct = _tb('lifestealPct');
  if(lsPct > 0 && !player.isDead){
    const heal = Math.floor(finalDmg * lsPct/100);
    const actual = Math.min(heal, player.maxHp - player.hp);
    if(actual > 0){
      player.hp += actual;
      // Quiet heal — no text spam per hit
    }
  }
  // Bloodvow bonus lifesteal
  if(bloodvowBonus > 0 && player && !player.isDead){
    const heal = Math.floor(finalDmg * bloodvowBonus);
    const actual = Math.min(heal, player.maxHp - player.hp);
    if(actual > 0){
      player.hp += actual;
      spawnDmgText(player.x, player.y - 30, `+${actual}`, '#ef4444', false);
    }
  }
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

// Death flourish — scales to the enemy type. Called from killEnemy.
function _spawnDeathFlourish(e){
  const color = e.typeData?.color || '#d4a555';
  if(e.isBoss){
    // BOSS DEATH — cinematic implosion
    if(typeof screenShake === 'function') screenShake(28, 900);
    if(typeof pushGroundFX === 'function'){
      pushGroundFX({type:'bloom', x:e.x, y:e.y, r:300, maxR:300, color, life:0.9, maxLife:0.9});
      pushGroundFX({type:'bloom', x:e.x, y:e.y, r:220, maxR:220, color:'#fbbf24', life:0.7, maxLife:0.7});
      pushGroundFX({type:'ring', x:e.x, y:e.y, maxR:520, r:30, color:'#fbbf24', life:1.2, maxLife:1.2, expand:true});
      pushGroundFX({type:'ring', x:e.x, y:e.y, maxR:380, r:20, color, life:1.0, maxLife:1.0, expand:true});
      pushGroundFX({type:'scorch', x:e.x, y:e.y, r:240, maxR:240, color:'#7c2d12', life:4.0, maxLife:4.0});
    }
    // 40 soul fragments burst outward
    for(let i = 0; i < 40; i++){
      const a = (i/40) * Math.PI*2 + Math.random()*0.2;
      const sp = 200 + Math.random()*200;
      particles.push({
        x: e.x, y: e.y,
        vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
        life: 0.9 + Math.random()*0.6,
        maxLife: 1.5,
        color: i % 3 === 0 ? '#fbbf24' : color,
        size: 3 + Math.random()*3,
        soul: true,
      });
    }
    if(typeof SFX !== 'undefined' && SFX.eliteDeath) SFX.eliteDeath();
  } else if(e.isElite){
    // ELITE DEATH — satisfying burst
    if(typeof screenShake === 'function') screenShake(12, 350);
    if(typeof pushGroundFX === 'function'){
      pushGroundFX({type:'bloom', x:e.x, y:e.y, r:160, maxR:160, color, life:0.6, maxLife:0.6});
      pushGroundFX({type:'ring', x:e.x, y:e.y, maxR:240, r:15, color, life:0.7, maxLife:0.7, expand:true});
      pushGroundFX({type:'scorch', x:e.x, y:e.y, r:110, maxR:110, color:'#2a1810', life:2.5, maxLife:2.5});
    }
    // 18 particles
    for(let i = 0; i < 18; i++){
      const a = (i/18) * Math.PI*2 + Math.random()*0.3;
      const sp = 140 + Math.random()*120;
      particles.push({
        x: e.x, y: e.y,
        vx: Math.cos(a)*sp, vy: Math.sin(a)*sp,
        life: 0.7 + Math.random()*0.4,
        maxLife: 1.1,
        color, size: 2 + Math.random()*2,
        soul: true,
      });
    }
    if(typeof SFX !== 'undefined' && SFX.eliteDeath) SFX.eliteDeath();
  } else {
    // NORMAL DEATH — light puff
    if(typeof pushGroundFX === 'function'){
      pushGroundFX({type:'bloom', x:e.x, y:e.y, r:40, maxR:40, color, life:0.3, maxLife:0.3});
    }
    for(let i = 0; i < 6; i++){
      const a = Math.random() * Math.PI*2;
      const sp = 60 + Math.random()*60;
      particles.push({
        x: e.x, y: e.y,
        vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 30,
        life: 0.4 + Math.random()*0.2,
        maxLife: 0.6,
        color, size: 1.5 + Math.random()*1.5,
      });
    }
    if(typeof SFX !== 'undefined' && SFX.enemyDeath) SFX.enemyDeath();
  }
}

function killEnemy(e){
  e.dead=true;kills++;
  document.getElementById('killCount').textContent=`☠ ${kills}`;
  // ═════ DEATH FLOURISH — scales to enemy significance ═════
  _spawnDeathFlourish(e);
  // ═════ UNIQUE EFFECT: Whisperbone Cleaver ═════
  // Melee kills (Ironwake) restore 4% max HP.
  if(typeof hasUniqueEffect === 'function' && hasUniqueEffect('whisperbone_heal')){
    if(player.classId === 'ironwake' && !player.isDead){
      const heal = Math.floor(player.maxHp * 0.04);
      const actual = Math.min(heal, player.maxHp - player.hp);
      if(actual > 0){
        player.hp += actual;
        spawnDmgText(player.x, player.y - 30, `+${actual}`, '#22c55e', false);
      }
    }
  }
  // Juggernaut momentum refresh — kills sustain your stack window and add 1 stack.
  // Without this, momentum dies between fights even with full set.
  if(player.momentumStacks !== undefined){
    const now = performance.now();
    player.momentumStacks = Math.min(20, (player.momentumStacks || 0) + 1);
    player.momentumLastGainedAt = now;
  }
  // Bloodbound Ravage — refund % of all cooldowns on kill (Ironwake talent)
  const ravPct = _tb('ravageCdrPct');
  if(ravPct > 0){
    const now = performance.now();
    for(let i = 0; i < abilityCDs.length; i++){
      if(abilityCDs[i] > now){
        const remaining = abilityCDs[i] - now;
        abilityCDs[i] = now + remaining * (1 - ravPct/100);
      }
    }
  }
  // Warborn Warbringer — elite kills refresh one random ability CD entirely
  if(e.isElite && _tb('warbringerRefresh') > 0){
    const now = performance.now();
    // Pick a random ability still on cooldown
    const onCooldown = [];
    for(let i = 0; i < abilityCDs.length; i++){
      if(abilityCDs[i] > now) onCooldown.push(i);
    }
    if(onCooldown.length > 0){
      const pick = onCooldown[Math.floor(Math.random() * onCooldown.length)];
      abilityCDs[pick] = now;
      addFeed(`⚔ WARBRINGER — ${['Q','W','E','R','ULT'][pick]} refreshed`, '#f59e0b');
    }
  }
  // Warborn capstone — anyKillRefreshChance — any kill has % chance
  const anyRefreshPct = _tb('anyKillRefreshChance');
  if(anyRefreshPct > 0 && Math.random() * 100 < anyRefreshPct){
    const now = performance.now();
    const onCD = [];
    for(let i = 0; i < abilityCDs.length; i++){
      if(abilityCDs[i] > now) onCD.push(i);
    }
    if(onCD.length > 0){
      const pick = onCD[Math.floor(Math.random() * onCD.length)];
      abilityCDs[pick] = now;
    }
  }
  // ─── XP REWARD via the new band-rate / activity-multiplier / delta system ───
  // Enemy level is approximated from current zone's minLv (or player level as fallback).
  // Activity type drives the multiplier (normal/elite/minor boss/major boss).
  let enemyLevel = player.level;
  if(typeof curZone !== 'undefined' && curZone && typeof curZone.minLv === 'number'){
    enemyLevel = Math.max(1, curZone.minLv);
  }
  // Determine activity category for the XP formula
  let activity;
  if(e.isBoss){
    // bossTier defaults to 'minorBoss' if not specified. Dungeon boss records
    // can set bossTier: 'majorBoss' or 'finalBoss' per their design.
    activity = e.bossTier || 'minorBoss';
  } else if(e.isElite){
    activity = 'eliteMob';
  } else {
    activity = 'normalMob';
  }
  const xpG = (typeof computeKillXP === 'function')
    ? computeKillXP(player.level, enemyLevel, activity)
    : (e.isBoss ? 80 : e.isElite ? 20 : 8); // fallback if formula missing
  const goldG = e.isBoss ? (60 + player.level*2) : (e.isElite ? 40 : 8);
  addXP(xpG);player.gold+=goldG;
  SFX[e.isElite?'eliteDeath':'enemyDeath']();
  spawnDmgText(e.x,e.y-40,`+${xpG}XP`,'#8b5cf6',false);
  // Pale Vitality talent + gear 'lifeOnHit' stat: heal on kill
  let heal=_tb('lifeOnHit');
  if(typeof getGearBonus === 'function') heal += getGearBonus('lifeOnHit');
  if(heal>0&&!player.isDead){
    const actualHeal=Math.min(heal,player.maxHp-player.hp);
    if(actualHeal>0){
      player.hp+=actualHeal;
      spawnDmgText(player.x,player.y-30,`+${actualHeal}`,'#22c55e',false);
    }
  }
  // Materials — small-chance drops on every kill, feeds all professions via creditMaterial
  // (which internally adds to shared material pool). Uses the new unified material names.
  if(Math.random()<0.09){creditMaterial('scrap',1);addFeed('+1 Scrap','#9ca3af');}
  if(e.isElite&&Math.random()<0.28){creditMaterial('scrap',2);}
  if(e.isElite){creditMaterial('etherDust',1);}
  if(e.isElite&&Math.random()<0.18){creditMaterial('etherDust',1);}
  if(Math.random()<0.05){creditMaterial('scrap',1);}
  if(e.veilmarkStacks>0&&Math.random()<0.14){creditMaterial('etherDust',1);}
  // Loot drop — common 5%, elite 16% (reduced from 7%/22%). Combined with
  // the tightened rarity curve, this gives the player ~3 uncommons per minute
  // instead of 6, and rares feel like real events.
  // In dungeons, drop rates are cut 40% because the dungeon gives a guaranteed
  // clear reward + heavy material drops. Prevents bag-flooding from 52 mobs.
  const inDungeon = (typeof dungeonState !== 'undefined' && dungeonState.active);
  const baseDropRate = e.isElite ? 0.16 : 0.05;
  const dropRate = inDungeon ? baseDropRate * 0.6 : baseDropRate;
  // Elite unique roll — 2% per elite, bypasses normal drop slot.
  // Filters by zone and class lock.
  if(e.isElite && typeof rollUniqueDropFromElite === 'function'){
    const zoneId = (typeof curZone !== 'undefined' && curZone) ? curZone.id : null;
    const unique = rollUniqueDropFromElite(zoneId, player.level);
    if(unique){
      tryEquip(unique);
      if(typeof SFX !== 'undefined' && SFX.pickupLegendary) SFX.pickupLegendary();
      pushGroundFX({type:'beam',x:e.x,y:e.y,r:60,maxR:60,color:'#f59e0b',life:3.0,maxLife:3.0});
      pushGroundFX({type:'bloom',x:e.x,y:e.y,r:220,maxR:220,color:'#f59e0b',life:0.7,maxLife:0.7});
      screenShake(14, 500);
      addFeed(`◆◆◆ UNIQUE: ${unique.name.toUpperCase()} ◆◆◆`, '#f59e0b');
      addFeed(`  "${unique.flavor}"`, '#c4b5fd');
      if(typeof writeSave === 'function') writeSave();
      // Skip the normal drop — unique takes its place
      // (fall through to materials/death FX below)
    }
  }
  if(Math.random()<dropRate){
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
  // Quest system hook — advance kill-based objectives
  if(typeof questOnEnemyKilled === 'function') questOnEnemyKilled(e);
  // Veilforge echo drop roll — chance to award an echo based on enemy tier
  if(typeof rollEchoDropOnKill === 'function') rollEchoDropOnKill(e);
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
    if(player.level%5===0){creditMaterial('runecore',1);addFeed('+1 Runecore','#c084fc');}
    // Quest system hook — advance reach_level objectives
    if(typeof questOnLevelUp === 'function') questOnLevelUp(player.level);
    // Veilgate unlock check — level 40+ triggers the endgame dungeon
    if(typeof checkVeilgateUnlock === 'function') checkVeilgateUnlock();
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
    // Guard against negative/invalid radii — fx radii can shrink with life
    // to below 0 during rapid transitions; arc() throws on negative values.
    if(typeof fx.r === 'number' && fx.r < 0.5) return;
    if(typeof fx.maxR === 'number' && fx.maxR < 0.5) return;
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
    } else if(fx.type==='line'){
      // Straight-line damage zone. Used for fire cross telegraphs and active
      // damage lines. During telegraph phase (fx.telegraph=true), thinner and
      // pulsing to show where danger is about to land. During live phase,
      // fills the full width with fire visual.
      const dx=fx.endX-fx.x, dy=fx.endY-fx.y;
      const len=Math.sqrt(dx*dx+dy*dy)||1;
      const angle=Math.atan2(dy,dx);
      ctx.save();
      ctx.translate(fx.x,fx.y);
      ctx.rotate(angle);
      const w=fx.width||60;
      if(fx.telegraph){
        // TELEGRAPH: dashed outline + pulsing fill to warn player
        const pulse=0.5+0.5*Math.sin(now*0.012);
        ctx.globalAlpha=a*(0.25+pulse*0.25);
        const grad=ctx.createLinearGradient(0,-w/2,0,w/2);
        grad.addColorStop(0,fx.color+'22');
        grad.addColorStop(0.5,fx.color+'66');
        grad.addColorStop(1,fx.color+'22');
        ctx.fillStyle=grad;
        ctx.fillRect(0,-w/2,len,w);
        // Dashed border for clarity
        ctx.globalAlpha=a*0.8;
        ctx.strokeStyle=fx.color;
        ctx.lineWidth=2;
        ctx.setLineDash([10,6]);
        ctx.strokeRect(0,-w/2,len,w);
        ctx.setLineDash([]);
      } else {
        // ACTIVE: burning line with bright center and hot edges
        ctx.globalAlpha=a*0.85;
        const grad=ctx.createLinearGradient(0,-w/2,0,w/2);
        grad.addColorStop(0,fx.color+'22');
        grad.addColorStop(0.3,fx.color+'aa');
        grad.addColorStop(0.5,'#fff8cc');
        grad.addColorStop(0.7,fx.color+'aa');
        grad.addColorStop(1,fx.color+'22');
        ctx.fillStyle=grad;
        ctx.fillRect(0,-w/2,len,w);
        // Rising ember streaks along the line for extra fire feel
        ctx.globalAlpha=a*0.6;
        ctx.fillStyle='#ffcc66';
        for(let k=0;k<8;k++){
          const ex=(k/8)*len+(Math.sin(now*0.004+k)*8);
          const ey=Math.sin(now*0.006+k*1.7)*w*0.3;
          ctx.beginPath();ctx.arc(ex,ey,1.5+Math.sin(now*0.008+k)*0.8,0,Math.PI*2);ctx.fill();
        }
      }
      ctx.restore();
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
// ═══════ IMPACT FEEDBACK ═══════════════════════════════════
// Damage text with magnitude tiers. Tier determines size/color/shake:
//   0 (tiny)    — <5% of target maxHP — faded small text
//   1 (normal)  — 5-15% — standard text
//   2 (solid)   — 15-30% — larger, golden accent
//   3 (big)     — 30-50% — large, warm color, emits small spark particles
//   4 (massive) — 50%+ — huge, screen pulse, golden burst
// Crit adds one tier. Overkill (damage exceeds remaining HP by 2x+) adds bonus flair.
function spawnDmgText(wx, wy, val, color, isCrit, opts){
  opts = opts || {};
  // Allow callers to pass a tier directly, or we infer from magnitude
  let tier = opts.tier;
  if(tier === undefined){
    const maxHp = opts.targetMaxHp || 0;
    const numeric = typeof val === 'number' ? val : parseFloat(val);
    if(maxHp > 0 && !isNaN(numeric)){
      const ratio = numeric / maxHp;
      if(ratio < 0.05)      tier = 0;
      else if(ratio < 0.15) tier = 1;
      else if(ratio < 0.30) tier = 2;
      else if(ratio < 0.50) tier = 3;
      else                  tier = 4;
    } else {
      tier = isCrit ? 2 : 1;
    }
  }
  if(isCrit) tier = Math.min(4, tier + 1);
  dmgTexts.push({
    wx, wy,
    val: isCrit ? 'CRIT ' + String(val) : String(val),
    color, isCrit, tier,
    life: 1.4 + tier * 0.15,
    maxLife: 1.4 + tier * 0.15,
    vy: -70 - Math.random()*25 - tier*8,
    vx: (Math.random()-0.5) * (35 + tier*6),
  });
  // Magnitude-appropriate screen shake. Bigger hits shake more.
  if(tier >= 3){
    if(typeof screenShake === 'function'){
      screenShake(3 + tier*2, 120 + tier*40);
    }
  }
  // Big/massive hits emit spark particles at impact point
  if(tier >= 3 && typeof particles !== 'undefined'){
    const sparks = tier === 4 ? 12 : 6;
    for(let i = 0; i < sparks; i++){
      const a = (i/sparks) * Math.PI*2 + Math.random()*0.3;
      const sp = 120 + Math.random()*120;
      particles.push({
        x: wx, y: wy,
        vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 50,
        life: 0.5 + Math.random()*0.3,
        maxLife: 0.8,
        color, size: 2 + Math.random()*2,
      });
    }
  }
}
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
// Death screen presenter — shows stats + 30s auto-respawn countdown.
// Player can still click Rise Again for instant respawn; countdown cancels
// if they do. If countdown reaches 0, respawn() is called automatically.
// This prevents AFK players from being stuck on the death screen forever.
let _deathCountdownTimer = null;
function showDeathScreen(){
  document.getElementById('deathStats').textContent = `${kills} slain · Level ${player.level}`;
  document.getElementById('deathScreen').style.display = 'flex';
  if(typeof writeSave === 'function') writeSave();
  // Start 30-second auto-respawn countdown
  let remaining = 30;
  const numEl = document.getElementById('deathCountdownNum');
  if(numEl) numEl.textContent = String(remaining);
  if(_deathCountdownTimer) clearInterval(_deathCountdownTimer);
  _deathCountdownTimer = setInterval(() => {
    remaining -= 1;
    if(numEl) numEl.textContent = String(remaining);
    if(remaining <= 0){
      clearInterval(_deathCountdownTimer);
      _deathCountdownTimer = null;
      if(player.isDead) respawn();
    }
  }, 1000);
}

function respawn(){player.hp=player.maxHp;player.isDead=false;player.iframes=3000;player.x=WORLD_W/2;player.y=WORLD_H/2;const _rc=findClearPosition(player.x,player.y,22);player.x=_rc.x;player.y=_rc.y;enemies=[];spirits=[];player._cheatDeathUsed=false;player._cheatDeathUses=0;document.getElementById('deathScreen').style.display='none';addFeed('RISEN FROM THE VEIL','#9DC4B0');if(_deathCountdownTimer){clearInterval(_deathCountdownTimer);_deathCountdownTimer=null;}}

// ═══════ UPDATE ═════════════════════════════════════════
function update(dt,now){
  if(player.isDead)return;
  // Check for chest/altar/cache auto-loot (works in AFK and manual play)
  if(typeof updateWorldChests === 'function') updateWorldChests(now);
  if(typeof updateWorldAltars === 'function') updateWorldAltars(now);
  if(typeof updateWorldCaches === 'function') updateWorldCaches(now);
  if(typeof updateActiveBuffs === 'function') updateActiveBuffs(now);
  // Necrolord preset — tick active banners (damage enemies in radius, expire)
  if(typeof updateNecroBanners === 'function') updateNecroBanners(now);
  // Voidweaver preset — tick seals, singularities, rifts
  if(typeof updateVoidweaverEntities === 'function') updateVoidweaverEntities(now);
  // Enemy projectiles — wraiths cast these. Tick position, check player collision.
  if(typeof updateEnemyProjectiles === 'function') updateEnemyProjectiles(now, dt);
  // Veilforge damage pools (Lingering Wound echo, etc.) — tick damage,
  // expire when duration is up. Pools are simple {x,y,radius,dmgPerTick,expiresAt,lastTick}.
  if(window.__damagePools && window.__damagePools.length > 0){
    window.__damagePools = window.__damagePools.filter(p => {
      if(now >= p.expiresAt) return false;
      // Damage tick every 500ms
      if(now - p.lastTick >= 500){
        p.lastTick = now;
        enemies.forEach(e => {
          if(e.dead) return;
          if(dist2(p.x, p.y, e.x, e.y) < p.radius){
            hitEnemy(e, p.dmgPerTick, false, p.x, p.y);
          }
        });
      }
      return true;
    });
  }
  let ix=0,iy=0;
  if(keys['ArrowLeft']||keys['a']||keys['A'])ix=-1;
  if(keys['ArrowRight']||keys['d']||keys['D'])ix=1;
  if(keys['ArrowUp']||keys['w']||keys['W'])iy=-1;
  if(keys['ArrowDown']||keys['s']||keys['S'])iy=1;
  // In camp, E interacts with NPCs; in combat, E fires ability 2.
  // Q/R are ability-only (no NPC-safe bindings needed).
  if(!curZone?.isCamp){
    if(keys['q']||keys['Q'])playerCast(0);
    if(keys['e']||keys['E'])playerCast(2);
    if(keys['r']||keys['R'])playerCast(3);
  }
  if(touchJoy.active){ix=touchJoy.dx;iy=touchJoy.dy;}
  if(ix!==0||iy!==0)player.lastInput=now;
  // AFK only activates when:
  //   1. Player explicitly enabled it (afkEnabled flag)
  //   2. Not in camp (camp is always a safe pause zone)
  //   3. Player has been idle long enough
  const inCamp = curZone?.isCamp === true;
  const isAfk = player.afkEnabled && !inCamp && (now - player.lastInput > AFK_IDLE);
  // Class-specific speed multiplier — Ironwake is slower than Hollowcaller
  const classSpdMult = (CLASS_DEFS[player.classId]||CLASS_DEFS.hollowcaller).speedMult || 1.0;
  // Level-based passive speed bonus (idle-game feel — leveling makes you faster).
  // 0.5% per level past 1. At level 50: +25%. At level 100: +50%.
  const levelSpdBonus = (typeof playerSpeedBonus === 'function')
    ? playerSpeedBonus(player.level)
    : 1.0;

  if(ix!==0||iy!==0){
    const m=Math.sqrt(ix*ix+iy*iy)||1;
    const buffSpd = typeof getActiveBuffValue === 'function' ? getActiveBuffValue('speed') : 0;
    const gearMoveSpd = typeof getGearBonus === 'function' ? getGearBonus('moveSpdPct') : 0;
    const spdMult=(1+(_tb('moveSpdPct')+gearMoveSpd)/100) * classSpdMult * levelSpdBonus * (1 + buffSpd);
    player.vx=(ix/m)*PLAYER_SPEED*spdMult;player.vy=(iy/m)*PLAYER_SPEED*spdMult;
    player.facing=Math.atan2(iy,ix);
    // Player touched keys — cancel any pending quest auto-walk
    if(player._questNavTarget) player._questNavTarget = null;
  } else if(inCamp && player._questNavTarget && typeof CAMP_NPCS !== 'undefined'){
    // ═══ CAMP AUTO-WALK (quest navigation) ═══
    // Walk toward the target NPC. On arrival, fire their interaction handler.
    const npc = CAMP_NPCS.find(n => n.id === player._questNavTarget);
    if(!npc){
      player._questNavTarget = null;
    } else {
      const npcX = WORLD_W/2 + (npc.x||0);
      const npcY = WORLD_H/2 + (npc.y||0);
      const dx = npcX - player.x, dy = npcY - player.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if(d < 60){
        // Arrived — fire interaction
        player.vx = 0; player.vy = 0;
        const savedTarget = player._questNavTarget;
        player._questNavTarget = null;
        if(typeof executeNpcInteraction === 'function') executeNpcInteraction(npc);
        else if(typeof addFeed === 'function') addFeed(`Reached ${npc.name}`, '#c4b5fd');
      } else {
        const gearMoveSpd2 = typeof getGearBonus === 'function' ? getGearBonus('moveSpdPct') : 0;
        const spdMult2 = (1+(_tb('moveSpdPct')+gearMoveSpd2)/100) * classSpdMult * levelSpdBonus;
        const spd = PLAYER_SPEED * 0.8 * spdMult2;
        player.vx = (dx/d) * spd;
        player.vy = (dy/d) * spd;
        player.facing = Math.atan2(dy, dx);
      }
    }
  } else if(isAfk){
    player.afkTimer+=dt*1000;
    // ═════════════════════════════════════════════════════════════
    // AFK COMBAT STATE MACHINE
    //
    // Three states, chosen fresh each frame:
    //   ENGAGE     — at least one enemy in fighting distance; commit to fight
    //   REPOSITION — in a crowd (>= 4 enemies nearby); kite outward
    //   WANDER     — no threats nearby; move toward exploration waypoint
    //
    // ENGAGE is sticky — once you enter it, you hold position within
    // attackRange of the target rather than drifting past. This fixes
    // the old bug where players would run in wide circles around enemies
    // because waypoint direction won over enemy-direction.
    // ═════════════════════════════════════════════════════════════
    const classAttackRangeAfk = (CLASS_DEFS[player.classId]||CLASS_DEFS.hollowcaller).attackRange || ATTACK_RANGE;
    const isMelee = classAttackRangeAfk < 120;
    const idealRange = classAttackRangeAfk * 0.80;       // where we want to be
    const engageRange = classAttackRangeAfk * 1.15;      // "fight me now" threshold
    const dangerRange = isMelee ? 60 : 140;              // "back off!" threshold

    // Find threats — the nearest enemy for targeting, the cluster center for avoidance
    let nearest = null, nearestDist = Infinity;
    let crowdCount = 0;
    let crowdX = 0, crowdY = 0, crowdN = 0;
    let nearestElite = null, nearestEliteDist = Infinity;
    enemies.forEach(e=>{
      if(e.dead)return;
      const ddx=e.x-player.x, ddy=e.y-player.y;
      const d2=ddx*ddx+ddy*ddy;
      const d=Math.sqrt(d2);
      // Track nearest enemy overall
      if(d < nearestDist){ nearest = e; nearestDist = d; }
      // Track nearest elite separately (used for prioritization)
      if(e.isElite && d < nearestEliteDist){ nearestElite = e; nearestEliteDist = d; }
      // Crowd detection — within ~200 units
      if(d2 < 200*200){
        crowdCount++;
        crowdX+=e.x; crowdY+=e.y; crowdN++;
      }
    });
    // Prefer engaging the nearest elite if one is within engagement range.
    // This makes AFK play favor the valuable target rather than peel off
    // the elite to chase a trash mob that wandered closer.
    let target = nearest;
    let targetDist = nearestDist;
    if(nearestElite && nearestEliteDist < engageRange * 1.5){
      target = nearestElite;
      targetDist = nearestEliteDist;
    }

    const inCrowd = crowdCount >= 4;
    let state = 'wander';
    if(target && targetDist < engageRange) state = 'engage';
    if(inCrowd && !isMelee) state = 'reposition'; // only caster-classes kite out
    // Melee Bloodforged/Juggernaut WANT to be in the crowd — override
    if(isMelee && state === 'reposition') state = 'engage';

    let mx, my, md;
    if(state === 'engage' && target){
      const edx = target.x - player.x, edy = target.y - player.y;
      const eDist = Math.max(0.01, Math.sqrt(edx*edx + edy*edy));
      if(eDist < dangerRange){
        // Too close — step back (caster) or strafe (melee)
        if(isMelee){
          // Strafe perpendicular so we don't get surrounded while still attacking
          mx = -edy; my = edx; md = eDist;
        } else {
          mx = -edx; my = -edy; md = eDist;
        }
      } else if(eDist > idealRange * 1.1){
        // Close distance — walk straight at them
        mx = edx; my = edy; md = eDist;
      } else {
        // In sweet spot — hold position (near zero velocity) with tiny orbit
        // so we don't freeze completely and look broken.
        const hold = Math.sin(now*0.002) * 0.3;
        mx = -edy * hold; my = edx * hold; md = Math.max(0.1, eDist);
      }
    } else if(state === 'reposition'){
      // Kite away from the cluster center
      const cx = crowdX/crowdN, cy = crowdY/crowdN;
      mx = player.x - cx; my = player.y - cy;
      md = Math.max(0.01, Math.sqrt(mx*mx+my*my));
    } else {
      // WANDER — if a portal is active, walk toward it; auto-enter when close.
      // Otherwise follow the normal exploration waypoint.
      let targetX = player.afkWpX, targetY = player.afkWpY;
      if(typeof portalState !== 'undefined' && portalState.active && !dungeonState.active){
        const p = portalState.active;
        targetX = p.x;
        targetY = p.y;
        // Auto-enter when close enough to trigger the portal prompt radius
        const pdx = p.x - player.x, pdy = p.y - player.y;
        const pd2 = pdx*pdx + pdy*pdy;
        const entryR = (typeof PORTAL_ENTRY_RADIUS !== 'undefined' ? PORTAL_ENTRY_RADIUS : 50);
        if(pd2 < entryR*entryR){
          if(typeof confirmPortalEntry === 'function') confirmPortalEntry();
        }
      }
      const tx = targetX - player.x, ty = targetY - player.y;
      mx = tx; my = ty; md = Math.max(0.01, Math.sqrt(tx*tx+ty*ty));
    }
    // Rotate waypoint if we've reached it or been committed too long
    const waypointDist = Math.sqrt(
      (player.afkWpX-player.x)**2 + (player.afkWpY-player.y)**2
    );
    if(waypointDist<80 || player.afkTimer>player.afkCommit){
      player.visitedSectors[player.sector]=true;
      setAfkWaypoint();
    }
    const buffSpdAfk = typeof getActiveBuffValue === 'function' ? getActiveBuffValue('speed') : 0;
    const gearMoveSpdAfk = typeof getGearBonus === 'function' ? getGearBonus('moveSpdPct') : 0;
    const spdMult=(1+(_tb('moveSpdPct')+gearMoveSpdAfk)/100) * classSpdMult * levelSpdBonus * (1 + buffSpdAfk);
    // Speed depends on state:
    //  engage   — slow to let attacks / spirits catch up (0.55x)
    //  reposition — fast escape (1.0x)
    //  wander   — exploration pace (0.75x)
    let spdBase;
    if(state === 'engage')      spdBase = PLAYER_SPEED * 0.55;
    else if(state === 'reposition') spdBase = PLAYER_SPEED * 1.0;
    else                        spdBase = PLAYER_SPEED * 0.75;
    const spd = spdBase * spdMult;
    player.vx=(mx/md)*spd; player.vy=(my/md)*spd;
    player.facing=Math.atan2(my,mx);
    // Always face the target while in combat — so auto-attacks + cones hit right
    if(target){
      const fdx=target.x-player.x, fdy=target.y-player.y;
      player.facing=Math.atan2(fdy,fdx);
    }
    // Store current target so AFK ability logic can make smart choices
    player._afkTarget = target;
    player._afkState = state;
    player._afkCrowdCount = crowdCount;
  } else{player.vx*=0.78;player.vy*=0.78;}

  // Proposed next position — clamped to world bounds
  const proposedX=Math.max(30,Math.min(WORLD_W-30,player.x+player.vx*dt));
  const proposedY=Math.max(30,Math.min(WORLD_H-30,player.y+player.vy*dt));
  // Resolve against prop collisions — player slides along prop edges rather than
  // stopping dead. Player collision radius ~18px matches their visible body.
  const resolved=resolvePlayerMovement(player.x,player.y,proposedX,proposedY,18);
  const oldX = player.x, oldY = player.y;
  player.x=resolved.x;
  player.y=resolved.y;
  player.glowPulse+=dt*2.2;
  if(player.iframes>0)player.iframes-=dt*1000;
  if(player.hitFlash>0)player.hitFlash-=dt;
  // ═════ UNIQUE EFFECT: Shroud-Walker's Tread ═════
  // Track continuous movement. If player moves 200+ units without stopping,
  // grant +50% damage for 3 seconds. "Stopping" = moving under 0.2 units/frame.
  if(typeof hasUniqueEffect === 'function' && hasUniqueEffect('shroud_momentum')){
    const movedThisFrame = Math.sqrt((player.x-oldX)**2 + (player.y-oldY)**2);
    if(movedThisFrame < 0.2){
      // Stopped — reset accumulator
      player._shroudMomentum = 0;
    } else {
      player._shroudMomentum = (player._shroudMomentum || 0) + movedThisFrame;
      if(player._shroudMomentum >= 200 && (!player._shroudBuffUntil || now >= player._shroudBuffUntil - 500)){
        // Activate / refresh buff
        player._shroudBuffUntil = now + 3000;
        player._shroudMomentum = 0; // start fresh
        if(typeof addFeed === 'function') addFeed('✦ SHROUD-WALKER — +50% damage', '#c4b5fd');
        if(typeof pushGroundFX === 'function'){
          pushGroundFX({type:'ring', x:player.x, y:player.y, maxR:80, r:12, color:'#c4b5fd', life:0.5, maxLife:0.5, expand:true});
        }
      }
    }
  }

  // ─── JUGGERNAUT MOMENTUM DECAY ─────────────────────────────────
  // Stacks decay 1 per 1.5s when NOT in the locked window AND idle.
  // The momentumLastGainedAt updates on any Warpath cast or enemy kill
  // (see killEnemy). Hitting enemies refreshes the window indirectly via
  // cast timing; the lock gives breathing room.
  if(player.momentumStacks && player.momentumStacks > 0){
    const locked = player.momentumLockedUntil && now < player.momentumLockedUntil;
    if(!locked){
      const lastGain = player.momentumLastGainedAt || 0;
      const timeSinceGain = now - lastGain;
      // Momentum's Edge / Perfect Form talents extend the decay grace window.
      // Base grace is 1500ms; bonus adds ms per rank.
      const decayGrace = 1500 + (_tb('momentumDecayBonus') || 0);
      if(timeSinceGain > decayGrace){
        // Decay 1 stack every decayGrace window since last gain
        const decays = Math.floor(timeSinceGain / decayGrace);
        player.momentumStacks = Math.max(0, player.momentumStacks - decays);
        // Shift the timer forward so we don't over-decay next frame
        player.momentumLastGainedAt = now - (timeSinceGain - decays * decayGrace);
      }
    }
  }
  // ─── IRONCLAD LAST BREATH — regen below 30% HP ────────────────
  const lbRegen = _tb('lastBreathRegen');
  if(lbRegen > 0 && player.hp < player.maxHp * 0.3 && player.hp > 0 && !player.isDead){
    player.hp = Math.min(player.maxHp, player.hp + lbRegen * dt);
  }

  // Auto attack — uses class attack range (Hollowcaller 220, Ironwake 85)
  const classAttackRange = (CLASS_DEFS[player.classId]||CLASS_DEFS.hollowcaller).attackRange || ATTACK_RANGE;
  // Level-based attack speed bonus shortens the attack interval
  const atkSpdBonus = (typeof playerAttackSpeedBonus === 'function')
    ? playerAttackSpeedBonus(player.level)
    : 1.0;
  const effAtkCD = ATTACK_CD / atkSpdBonus;
  if(now-player.lastAttack>effAtkCD){
    const t=getNearestEnemy(classAttackRange);
    if(t){player.lastAttack=now;hitEnemy(t,player.attack);SFX.hit();
      // Attack arc particles — Ironwake red, Hollowcaller purple
      const arcColor = player.classId==='ironwake' ? '#ef4444' : '#c084fc';
      const dx=t.x-player.x,dy=t.y-player.y,d=Math.sqrt(dx*dx+dy*dy)||1;
      for(let i=0;i<4;i++)particles.push({x:player.x+dx/d*(40+i*30),y:player.y+dy/d*(40+i*30),vx:(Math.random()-0.5)*60,vy:(Math.random()-0.5)*60,life:0.25,maxLife:0.25,color:arcColor,size:2+Math.random()*2});
    }
  }

  // AFK auto-cast — smart per-ability gating.
  // Bad: fire every ability on CD (wastes Soul Nova on lone mobs).
  // Good: each ability only fires when its context is favorable.
  if(isAfk){
    const afkTarget = player._afkTarget;
    const crowd = player._afkCrowdCount || 0;
    for(let i=0; i<5; i++){
      if(now < abilityCDs[i]) continue;
      if(shouldAfkCast(i, afkTarget, crowd, now)) playerCast(i);
    }
  }

  // Spirits
  spirits=spirits.filter(s=>!s.dead);
  spirits.forEach(s=>{
    if(s.isTemp){s.lifetime-=dt*1000;if(s.lifetime<=0){s.dead=true;return;}}
    s.wobble+=dt*2.2;
    // Archetype-driven orbit radius. Defenders stick close, rangers hang back.
    const baseOrbit = s.archOrbit || 70;
    const or = baseOrbit + Math.sin(s.wobble)*10;
    const dmgMultArch = s.archDmgMult || 1.0;
    const reachArch = s.archReach || 70;
    const isDefender = s.archStyle === 'defender';
    // Defenders ignore haunt targets — they stay near player as bodyguards
    let haunt = null;
    if(!isDefender){
      haunt = s.hauntTarget && !s.hauntTarget.dead && s.hauntTarget.veilmarkStacks>0 ? s.hauntTarget : null;
      if(!haunt){s.hauntTarget=null;let bd=950;enemies.forEach(e=>{if(e.dead||e.veilmarkStacks<=0)return;const d=dist2(s.x,s.y,e.x,e.y);if(d<bd){bd=d;haunt=e;}});s.hauntTarget=haunt;}
    }
    // Necrolord preset bonuses
    const _inBanner = (typeof isSpiritInBanner === 'function') ? isSpiritInBanner(s) : false;
    const _speedBurst = (s._necroSpeedUntil && s._necroSpeedUntil > now);
    const _bannerDmgMult = _inBanner ? 1.40 : 1.0;
    const _speedMult = (_inBanner ? 1.25 : 1.0) * (_speedBurst ? 1.50 : 1.0);
    if(haunt){
      s.orbitAngle+=dt*3.8*_speedMult;
      const tx=haunt.x+Math.cos(s.orbitAngle)*or,ty=haunt.y+Math.sin(s.orbitAngle)*or;
      s.x+=(tx-s.x)*Math.min(1,dt*4.5*_speedMult);s.y+=(ty-s.y)*Math.min(1,dt*4.5*_speedMult);
      const atkInterval = _inBanner ? 700 : 850;
      if(now-s.lastAttack>atkInterval){
        s.lastAttack=now;s.attackCount++;
        haunt.veilmarkStacks=Math.min(haunt.veilmarkStacks+1,10);
        hitEnemy(haunt, player.attack*0.32*_bannerDmgMult*dmgMultArch);
      }
    } else {
      // Hunt mode — find a nearby enemy and attack, OR orbit player (defender).
      if(isDefender){
        // Wardens stay close to player; attack anything in reach
        s.orbitAngle+=dt*2.4*_speedMult;
        const tx=player.x+Math.cos(s.orbitAngle)*or,ty=player.y+Math.sin(s.orbitAngle)*or;
        s.x+=(tx-s.x)*Math.min(1,dt*3.8*_speedMult);
        s.y+=(ty-s.y)*Math.min(1,dt*3.8*_speedMult);
        // Attack any enemy that comes near
        let ne2=null,nd=reachArch*1.8;
        enemies.forEach(e=>{if(e.dead)return;const d=dist2(s.x,s.y,e.x,e.y);if(d<nd){nd=d;ne2=e;}});
        if(ne2 && nd < reachArch && now-s.lastAttack > 950){
          s.lastAttack = now;
          const spiritDmg = player.attack*1.15*(1+_tb('spiritDmgPct')/100)*_bannerDmgMult*dmgMultArch;
          hitEnemy(ne2, spiritDmg);
        }
      } else {
        let ne2=null,nd=720;
        enemies.forEach(e=>{if(e.dead)return;const d=dist2(s.x,s.y,e.x,e.y);if(d<nd){nd=d;ne2=e;}});
        if(ne2&&nd<340){
          const sdx=ne2.x-s.x,sdy=ne2.y-s.y,sd=Math.sqrt(sdx*sdx+sdy*sdy)||1;
          s.x+=sdx/sd*260*dt*_speedMult;s.y+=sdy/sd*260*dt*_speedMult;
          const atkInterval2 = _inBanner ? 800 : 950;
          if(now-s.lastAttack>atkInterval2&&sd<reachArch){
            s.lastAttack=now;s.attackCount++;
            const spiritDmg = player.attack*1.15*(1+_tb('spiritDmgPct')/100)*_bannerDmgMult*dmgMultArch;
            hitEnemy(ne2, spiritDmg);
            // Sanguine Pact — spirits heal you for % of their damage dealt
            const spiritLsPct = _tb('spiritLifestealPct');
            if(spiritLsPct > 0 && !player.isDead){
              const heal = Math.floor(spiritDmg * spiritLsPct / 100);
              const actual = Math.min(heal, player.maxHp - player.hp);
              if(actual > 0) player.hp += actual;
            }
          }
        } else {
          s.orbitAngle+=dt*2.4*_speedMult;
          const tx=player.x+Math.cos(s.orbitAngle)*or,ty=player.y+Math.sin(s.orbitAngle)*or;
          s.x+=(tx-s.x)*Math.min(1,dt*3.2*_speedMult);s.y+=(ty-s.y)*Math.min(1,dt*3.2*_speedMult);
        }
      }
    }
    if(Math.random()<0.05)particles.push({x:s.x,y:s.y,vx:(Math.random()-0.5)*30,vy:-18-Math.random()*18,life:0.45,maxLife:0.45,color:'#9DC4B0',size:1.8});
  });

  // Enemies
  enemies.forEach(e=>{
    if(e.dead)return;
    if(e.hitFlash>0)e.hitFlash-=dt;
    // Boss ability tick — check cooldown, start warmup, resolve casts
    if(e.isBoss&&e.ability){
      updateBossAbility(e,now,dt);
    }
    // Boss doesn't move while actively casting — locks in place to commit to ability
    if(e.abilityCasting){return;}
    // Ironwake stun — enemy is frozen, no movement, no attack windup
    if(e.stunUntil && now < e.stunUntil){
      e.chargingUntil = 0;
      return;
    }
    const dx=player.x-e.x,dy=player.y-e.y,d=Math.sqrt(dx*dx+dy*dy)||1;
    // Mournblade fear — enemy flees from player, cannot attack
    if(e.fearedUntil && now < e.fearedUntil){
      e.chargingUntil = 0;
      e.x -= (dx/d) * e.speed * 1.2 * dt;
      e.y -= (dy/d) * e.speed * 1.2 * dt;
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // PER-TYPE ENEMY AI
    // Each enemy type has a distinct behavior profile. The `etype` field
    // lets us route behavior without touching the render code.
    // Bosses bypass this — they have their own updateBossAbility logic.
    // ═══════════════════════════════════════════════════════════
    const etype = e.type || e.typeData?.type;
    if(!e.isBoss){
      if(etype === 'wraith'){
        _aiWraith(e, d, dx, dy, now, dt);
        return;
      }
      if(etype === 'crawler'){
        _aiCrawler(e, d, dx, dy, now, dt);
        return;
      }
      if(etype === 'shade'){
        _aiShade(e, d, dx, dy, now, dt);
        return;
      }
      if(etype === 'golem'){
        _aiGolem(e, d, dx, dy, now, dt);
        return;
      }
      if(etype === 'abomination'){
        _aiAbomination(e, d, dx, dy, now, dt);
        // Abomination still uses the baseline movement/attack below after
        // triggering its minion spawn, so no return.
      }
      if(etype === 'specter'){
        // Specter phases — reduce damage when "intangible". Handled in hitEnemy check.
        // Apply a periodic "tangible window" by clearing the flag.
        const cycle = 2400; // 2.4s cycle
        const phase = (now % cycle) / cycle;
        e.specterIntangible = phase > 0.35; // 65% of the time intangible
        // Falls through to baseline AI below
      }
    }

    // Move toward player if out of attack range (baseline movement)
    if(d>e.size+24)e.chargingUntil=0; // cancel windup if player moves out
    if(d>e.size+24&&!e.chargingUntil){e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt;}
    // Begin attack windup when in range
    if(d<e.size+30&&!e.chargingUntil&&now-e.lastAttack>1150){
      const windupMs=e.isElite?900:700; // elites take longer to wind up — bigger hit
      e.chargingUntil=now+windupMs;
      e.attackRange=(e.size+40); // snapshot range at cast time
    }
    // Resolve attack at end of windup
    if(e.chargingUntil&&now>=e.chargingUntil){
      e.chargingUntil=0;e.lastAttack=now;
      // Recompute distance now — player may have dodged out of range
      const ndx=player.x-e.x,ndy=player.y-e.y,nd=Math.sqrt(ndx*ndx+ndy*ndy)||1;
      if(nd<=e.attackRange&&player.iframes<=0){
        // Apply damage reduction talent + gear 'res' stat (both capped together at 80%)
        const dmgReducePct=_tb('dmgReducePct');
        const gearRes = typeof getGearBonus === 'function' ? getGearBonus('res') : 0;
        // Procession of the Dead — each living permanent spirit grants DR
        const perSpiritDr = _tb('perSpiritDrPct');
        let spiritDr = 0;
        if(perSpiritDr > 0){
          const aliveSpirits = spirits.filter(sp => !sp.dead && !sp.isTemp).length;
          spiritDr = aliveSpirits * perSpiritDr;
        }
        // Legion Mode — if 8+ spirits alive, bonus 25% DR on top
        let legionBonus = 0;
        if(_tb('legionMode') > 0){
          const aliveSpirits = spirits.filter(sp => !sp.dead && !sp.isTemp).length;
          if(aliveSpirits >= 8) legionBonus = 25;
        }
        // Warden archetype aura — each warden spirit near the player
        // contributes its archDrAura to incoming damage reduction.
        let wardenAura = 0;
        spirits.forEach(sp=>{
          if(sp.dead || !sp.archDrAura) return;
          const sdx = sp.x - player.x, sdy = sp.y - player.y;
          if(sdx*sdx + sdy*sdy < 200*200) wardenAura += sp.archDrAura;
        });
        let incomingDmg=e.attack*(1-Math.min(dmgReducePct+gearRes+spiritDr+legionBonus+wardenAura,80)/100);
        // ═════ UNIQUE EFFECT: Amulet of the Hollowed Name ═════
        // Hits below the 10%-max-HP threshold are absorbed entirely.
        // Huge vs chip damage, negligible vs real threats.
        if(typeof hasUniqueEffect === 'function' && hasUniqueEffect('hollowed_threshold')){
          if(incomingDmg < player.maxHp * 0.10){
            incomingDmg = 0;
            spawnDmgText(player.x, player.y - 20, 'ABSORBED', '#c4b5fd', false);
          }
        }
        // ─── IRONCLAD STEELFALL — chance to fully block ───
        const blockPct = _tb('blockChance');
        if(blockPct > 0 && Math.random()*100 < blockPct){
          // Riposte talent — reflect % of the blocked damage back to attacker
          const reflectPct = _tb('blockReflectPct');
          if(reflectPct > 0 && !e.dead){
            const reflect = incomingDmg * (reflectPct / 100);
            hitEnemy(e, reflect, false, player.x, player.y);
            spawnDmgText(e.x, e.y - e.size, 'RIPOSTE', '#60a5fa', true);
          }
          incomingDmg = 0;
          spawnDmgText(player.x, player.y-20, 'BLOCK', '#60a5fa', true);
        }
        // Ironwake Bulwark — 70% damage reduction during active window
        if(player.classId==='ironwake' && player.bulwarkUntil && now < player.bulwarkUntil){
          incomingDmg *= 0.3;
          spawnDmgText(player.x, player.y-20, 'BLOCKED', '#d4c896', false);
        }
        // Ironwake Retribution — reflect 50% of damage back at attacker
        if(player.classId==='ironwake' && player.retributionUntil && now < player.retributionUntil){
          const reflectDmg = incomingDmg * 0.5;
          if(!e.dead)hitEnemy(e, reflectDmg, false, player.x, player.y);
          spawnDmgText(e.x, e.y-e.size, 'REFLECT', '#a78bfa', false);
        }
        // ─── IRONGUARD PRESET BUFFS ─────────────────────────────────
        // Unbroken Pillar — full invulnerability window
        if(player.unbrokenPillarUntil && now < player.unbrokenPillarUntil){
          incomingDmg = 0;
          spawnDmgText(player.x, player.y-20, 'IMMUNE', '#60a5fa', false);
        }
        // Iron Tortoise — 90% damage reduction + reflect 200%
        else if(player.ironTortoiseUntil && now < player.ironTortoiseUntil){
          const reflectDmg = incomingDmg * 2.0;
          if(!e.dead) hitEnemy(e, reflectDmg, false, player.x, player.y);
          spawnDmgText(e.x, e.y-e.size, 'TORTOISE', '#60a5fa', true);
          incomingDmg *= 0.1; // 90% reduction
        }
        // Thornguard — reflect multiplier (whatever was set by cast)
        if(player.thornguardUntil && now < player.thornguardUntil){
          const reflectDmg = incomingDmg * (player.thornguardPct || 1.5);
          if(!e.dead) hitEnemy(e, reflectDmg, false, player.x, player.y);
          spawnDmgText(e.x, e.y-e.size, 'THORNS', '#60a5fa', false);
        }
        // ─── BLOODFORGED PRESET BUFFS ───────────────────────────────
        // Bloodrush — taking more damage AND dealing more (tracked in hitEnemy)
        if(player.bloodrushUntil && now < player.bloodrushUntil){
          incomingDmg *= (player.bloodrushTakenMult || 1.5);
        }
        player.hp-=incomingDmg;
        // Crimson Ascendance talent — triggers when HP drops below 20%.
        // Resets all ability CDs and grants a 4s guaranteed-crit window.
        // Crimson Sovereign capstone doubles the number of triggers per fight.
        if(_tb('crimsonAscendance') > 0 && player.hp > 0 && player.hp < player.maxHp * 0.20){
          const maxTriggers = _tb('crimsonAscendanceCount') || 1;
          const usedThisFight = player._crimsonAscendanceUses || 0;
          if(usedThisFight < maxTriggers){
            player._crimsonAscendanceUses = usedThisFight + 1;
            // Reset all cooldowns
            for(let i = 0; i < abilityCDs.length; i++) abilityCDs[i] = now;
            // Guarantee crits for 4s
            player.crimsonAscendanceUntil = now + 4000;
            addFeed('★ CRIMSON ASCENDANCE — CDs reset, guaranteed crits', '#ef4444');
            pushGroundFX({type:'ring',x:player.x,y:player.y,maxR:300,r:25,color:'#ef4444',life:1.0,maxLife:1.0,expand:true});
            pushGroundFX({type:'bloom',x:player.x,y:player.y,r:220,maxR:220,color:'#7f1d1d',life:0.7,maxLife:0.7});
            screenShake(18, 500);
          }
        }
        // Ironwake Wrath generation — hits build wrath. Bulwark doubles rate.
        if(player.classId==='ironwake'){
          const wrathGain = (player.bulwarkUntil && now < player.bulwarkUntil) ? 20 : 10;
          player.wrath = Math.min(player.wrathMax, (player.wrath||0) + wrathGain);
        }
        player.hitFlash=0.18;player.iframes=220;
        screenShake(e.isElite?10:6,e.isElite?180:130);SFX.playerHit();
        // Red ground bloom — only on significant hits, not every tick of combat.
        // Previous behavior spammed a red pulse around the player constantly
        // which looked like a blinking red box during continuous combat.
        if(incomingDmg > player.maxHp * 0.08){
          pushGroundFX({type:'bloom',x:player.x,y:player.y,r:60,maxR:60,color:'#ef4444',life:0.3,maxLife:0.3});
        }
        if(player.hp<=0){
          // Bloodvow — Bloodforged preset active-revive
          if(player.bloodvowActive){
            player.bloodvowActive = false;
            player.hp = Math.floor(player.maxHp * (player.bloodvowReviveHpPct || 0.30));
            addFeed('⊕ BLOODVOW — you refuse to die','#ef4444');
            pushGroundFX({type:'ring', x:player.x, y:player.y, maxR:200, r:20, color:'#ef4444', life:1.0, maxLife:1.0, expand:true});
            pushGroundFX({type:'bloom', x:player.x, y:player.y, r:150, maxR:150, color:'#7f1d1d', life:0.8, maxLife:0.8});
          }
          // Everlasting talent: cheat death triggers N times per life.
          // Deep talents (The Still Heart / Immortal / Crimson Sovereign) extend
          // both the number of triggers and the heal amount.
          else if(_tb('cheatDeath')>0){
            const cheatMax = Math.max(1, _tb('cheatDeathCount') || 1);
            const cheatUsed = player._cheatDeathUses || 0;
            if(cheatUsed < cheatMax){
              player._cheatDeathUses = cheatUsed + 1;
              player._cheatDeathUsed = true; // legacy flag kept for compat
              const healPct = _tb('cheatDeathHealPct');
              player.hp = healPct > 0
                ? Math.floor(player.maxHp * (healPct / 100))
                : 1;
              addFeed('✦ EVERLASTING','#fff4a0');
              pushGroundFX({type:'ring',x:player.x,y:player.y,maxR:120,r:10,color:'#fff4a0',life:0.8,maxLife:0.8,expand:true});
            } else {
              player.hp=0;player.isDead=true;
              showDeathScreen();
              if(dungeonState.active)exitDungeon(false);
            }
          } else {
            player.hp=0;player.isDead=true;
            showDeathScreen();
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
  // Voidweaver projectiles — homing, piercing, chain logic
  if(typeof updateProjectiles === 'function') updateProjectiles(dt, now);
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
  // Apply zoom to the main entity render pass so enemies, player, props,
  // and FX all scale up together with the world background.
  ctx.translate(W/2 + sx, H/2 + sy);
  ctx.scale(WORLD_ZOOM, WORLD_ZOOM);
  ctx.translate(-camX, -camY);

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
    const a=Math.max(0, p.life/p.maxLife);
    const r=Math.max(0.5, p.size*(p.soul?a:1));
    ctx.globalAlpha=a;ctx.fillStyle=p.color;
    ctx.shadowColor=p.color;ctx.shadowBlur=p.soul?12:5;
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
  });
  ctx.globalAlpha=1;ctx.shadowBlur=0;

  // Projectiles (Voidweaver void bolts, future abilities)
  if(typeof drawProjectiles === 'function') drawProjectiles(now);

  // Enemy projectiles (wraiths cast these)
  if(typeof drawEnemyProjectiles === 'function') drawEnemyProjectiles();

  // Spirits
  spirits.forEach(s=>drawSpirit(s,now));

  // Camp NPCs — only rendered when in the procession zone
  if(curZone?.isCamp && typeof drawCampNPCs === 'function'){
    drawCampNPCs(now);
  }
  // Zone quest-giver NPCs — render when in a non-camp, non-dungeon zone
  if(!curZone?.isCamp && !dungeonState.active && typeof drawZoneNPCs === 'function'){
    drawZoneNPCs(now);
  }

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
      ctx.textAlign='start';
    }
  });

  // Player
  drawPlayer(now);

  // Damage numbers
  dmgTexts.forEach(d=>{
    const a = Math.min(1, d.life/d.maxLife * 2);
    ctx.globalAlpha = a;
    // Tier-based sizing. Base 13, scales up per tier.
    const tier = d.tier ?? (d.isCrit ? 2 : 1);
    const fontSize = 11 + tier * 4;                // tier0=11, tier4=27
    const weight = tier >= 2 ? 'bold' : 'normal';
    ctx.font = `${weight} ${fontSize}px 'Cinzel', serif`;
    ctx.textAlign = 'center';
    // Tier 4 — golden outline shimmer
    if(tier === 4){
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 20;
      ctx.strokeText(d.val, d.wx, d.wy);
    }
    ctx.fillStyle = d.color;
    ctx.shadowColor = d.color;
    ctx.shadowBlur = 4 + tier * 3;                 // tier0=4, tier4=16
    ctx.fillText(d.val, d.wx, d.wy);
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
  const isIronwake = player.classId === 'ironwake';
  document.getElementById('hpFill').style.width=(player.hp/player.maxHp*100)+'%';
  document.getElementById('xpFill').style.width=(player.xp/player.xpToNext*100)+'%';
  // Class name + portrait icon update
  const nameEl=document.getElementById('hudClassName');
  const portraitEl=document.getElementById('hudPortrait');
  if(nameEl){
    const cls = CLASS_DEFS[player.classId] || CLASS_DEFS.hollowcaller;
    nameEl.textContent = cls.name.toUpperCase();
  }
  if(portraitEl){
    portraitEl.textContent = isIronwake ? '⚔' : '🔮';
  }
  // Show Spirit bar for Hollowcaller, Wrath bar for Ironwake
  const spRow = document.getElementById('spRow');
  const wrathRow = document.getElementById('wrathRow');
  if(spRow) spRow.style.display = isIronwake ? 'none' : 'flex';
  if(wrathRow) wrathRow.style.display = isIronwake ? 'flex' : 'none';
  if(isIronwake){
    const wrathFill=document.getElementById('wrathFill');
    if(wrathFill) wrathFill.style.width = ((player.wrath||0)/(player.wrathMax||100)*100)+'%';
  } else {
    const sc=spirits.filter(s=>!s.dead).length;
    document.getElementById('spFill').style.width=(sc/(player.maxBonds||MAX_SPIRITS)*100)+'%';
  }
  document.getElementById('levelBadge').textContent=`LV ${player.level}`;
  document.getElementById('hpNum').textContent=`${Math.ceil(player.hp)}`;
  document.getElementById('goldLabel').textContent=`💰 ${player.gold} G`;
  // Zone label (top-right) — always reflects current zone, including camp
  const zn = document.getElementById('zoneName');
  const zt = document.getElementById('zoneTier');
  if(zn && curZone) zn.textContent = curZone.name;
  if(zt && curZone) zt.textContent = curZone.tier;
  // Spirit pips — only shown for Hollowcaller
  const sp=document.getElementById('spiritPanel');
  if(sp){
    if(isIronwake){
      sp.style.display='none';
    } else {
      sp.style.display='';
      const sc=spirits.filter(s=>!s.dead).length;
      sp.innerHTML='';
      const mb=player.maxBonds||MAX_SPIRITS;
      for(let i=0;i<mb;i++){const d=document.createElement('div');d.className='spip'+(i<sc?'':' dead');d.style.animationDelay=(i*0.18)+'s';sp.appendChild(d);}
    }
  }
  // Ability CDs — iterate through all 5 slots, using class-specific cooldowns
  const cls = CLASS_DEFS[player.classId] || CLASS_DEFS.hollowcaller;
  for(let i=0;i<5;i++){
    const baseCD = cls.abilities[i]?.cd || ABILITY_CDS[i] || 1000;
    const rem=Math.max(0,abilityCDs[i]-now);
    const pct=baseCD>0?rem/baseCD:0;
    const ov=document.getElementById('ov'+i);
    if(ov) ov.style.height=(pct*100)+'%';
    const cdEl=document.getElementById('cd'+i);
    if(cdEl){
      if(rem>0){cdEl.style.opacity='1';cdEl.textContent=Math.ceil(rem/1000)+'s';}else cdEl.style.opacity='0';
    }
    const abEl=document.getElementById('ab'+i);
    if(abEl) abEl.classList.toggle('ready',rem<=0);
  }
}

// ═══════ LOOP ════════════════════════════════════════════
function loop(ts){
  if(!running)return;
  const dt=Math.min((ts-lastTime)/1000,0.05);lastTime=ts;
  update(dt,ts);render(ts);
  requestAnimationFrame(loop);
}

// ═══════ SAVE / LOAD — MULTI-CHARACTER PROFILE SYSTEM ═══════════════
// Profile structure in localStorage:
//   ashenveil_profile_v2 = {
//     v: 2,
//     activeSlot: 0,          // which character index is currently loaded
//     characters: [           // up to MAX_CHARACTERS entries; slot 0 is char 1
//       {id, name, createdAt, lastPlayedAt, save: {...same shape as old buildSave}},
//       ...
//     ]
//   }
// Migration: if ashenveil_profile_v2 doesn't exist but ashenveil_save_v1 does,
// we auto-wrap the v1 save as character 0 of a new v2 profile. Old key is kept
// for one release in case something goes wrong with migration, then can be
// deleted in a future cleanup pass.

const SAVE_KEY='ashenveil_save_v1';       // legacy key — still read for migration
const PROFILE_KEY='ashenveil_profile_v2'; // current key
const SAVE_VERSION=2;
const MAX_CHARACTERS=10;
let lastSaveTime=0;
const AUTOSAVE_INTERVAL=10000; // ms — save every 10s during play

// The current in-memory profile (loaded from localStorage).
// Stays in sync with localStorage via writeProfile.
let profile = {
  v: SAVE_VERSION,
  activeSlot: 0,
  characters: []
};

// Build a full character save snapshot from current game state.
// This is what goes into profile.characters[i].save — the character-specific data.
function buildSave(){
  return {
    v:SAVE_VERSION,
    savedAt:Date.now(),
    player:{
      level:player.level,xp:player.xp,xpToNext:player.xpToNext,
      hp:player.hp,maxHp:player.maxHp,
      gold:player.gold,attack:player.attack,
      soulMastery:player.soulMastery,maxBonds:player.maxBonds,
      classId:player.classId||'hollowcaller',
      wrath:player.wrath||0,
      // _testSetsGranted can be true | 'removed' | false. Preserve string.
      _testSetsGranted: player._testSetsGranted || false,
      // AFK mode toggle — persist so it survives reloads
      afkEnabled: !!player.afkEnabled,
    },
    stats:{kills},
    zoneId:curZone?.id||1,
    equipped:JSON.parse(JSON.stringify(equipped)),
    inventory:typeof inventory!=='undefined'?JSON.parse(JSON.stringify(inventory)):[],
    gearStash:typeof gearStash!=='undefined'?JSON.parse(JSON.stringify(gearStash)):[],
    autoEquipUpgrades:typeof autoEquipUpgrades!=='undefined'?autoEquipUpgrades:false,
    setStash:typeof setStash!=='undefined'?JSON.parse(JSON.stringify(setStash)):[],
    setStashData:typeof setStashData!=='undefined'?JSON.parse(JSON.stringify(setStashData)):{},
    shopState:typeof shopState!=='undefined'?JSON.parse(JSON.stringify(shopState)):null,
    professions:JSON.parse(JSON.stringify(professions)),
    talents:typeof talentState!=='undefined'?JSON.parse(JSON.stringify(talentState)):null,
    // Quest system — active quests, completed quests, turn-in counts
    quests:typeof serializeQuestState==='function' ? serializeQuestState() : null,
    // Veilforge — echo inventory and slotted echoes per ability
    veilforge:typeof serializeVeilforgeState==='function' ? serializeVeilforgeState() : null,
    // Veilgate — endgame tier progression
    veilgate:typeof serializeVeilgateState==='function' ? serializeVeilgateState() : null,
  };
}

// Read the full profile from localStorage. If a v1 save exists but no v2 profile,
// migrate it to a new v2 profile seamlessly (old character becomes slot 0).
// Returns a valid profile object always (empty if no data).
function readProfile(){
  try{
    const raw=localStorage.getItem(PROFILE_KEY);
    if(raw){
      const data=JSON.parse(raw);
      if(data && data.v===SAVE_VERSION && Array.isArray(data.characters)){
        return data;
      }
    }
    // No valid v2 profile — check for legacy v1 save
    const legacyRaw=localStorage.getItem(SAVE_KEY);
    if(legacyRaw){
      const legacySave=JSON.parse(legacyRaw);
      if(legacySave && typeof legacySave==='object'){
        // Wrap legacy save as character 0 of fresh v2 profile
        const now=Date.now();
        const cls = legacySave.player?.classId || 'hollowcaller';
        const clsName = (typeof CLASS_DEFS!=='undefined' && CLASS_DEFS[cls]?.name) || 'Hollowcaller';
        const migratedProfile = {
          v:SAVE_VERSION,
          activeSlot:0,
          characters:[{
            id: 'migrated_'+now,
            name: clsName + ' I',
            classId: cls,                      // stored directly for consistency
            createdAt: legacySave.savedAt || now,
            lastPlayedAt: legacySave.savedAt || now,
            save: { ...legacySave, v:SAVE_VERSION }, // stamp new version
          }]
        };
        // Save the migrated profile immediately so future loads skip migration
        try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(migratedProfile)); }catch(e){}
        return migratedProfile;
      }
    }
    // No data anywhere — return empty profile
    return { v:SAVE_VERSION, activeSlot:0, characters:[] };
  }catch(e){
    console.warn('Profile read failed:', e);
    return { v:SAVE_VERSION, activeSlot:0, characters:[] };
  }
}

// Persist the full profile to localStorage.
function writeProfile(){
  try{
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return true;
  }catch(e){
    console.warn('Profile write failed:', e);
    return false;
  }
}

// Save the active character's current state into profile.characters[activeSlot].save,
// update lastPlayedAt, and persist the whole profile. Called by autosave + emergencySave.
function writeSave(){
  try{
    if(!profile.characters[profile.activeSlot]){
      // No active character — can't save. Should never happen during play.
      return false;
    }
    const chr = profile.characters[profile.activeSlot];
    chr.save = buildSave();
    chr.lastPlayedAt = Date.now();
    // Mirror key fields to character metadata for character-select preview display
    chr.name = chr.name || autoCharacterName(chr.save.player?.classId);
    return writeProfile();
  }catch(e){
    console.warn('Save failed:', e);
    return false;
  }
}

// Read the currently-active character's save (what the game should load on start)
function readSave(){
  const chr = profile.characters[profile.activeSlot];
  return chr?.save || null;
}

// Compatibility wrapper: true if any character exists in the profile
function hasSave(){
  return profile.characters.length > 0;
}

// Delete a character at a specific slot index. Returns true on success.
// After deletion, activeSlot shifts to 0 if it was deleted or out of range.
function deleteCharacterAt(index){
  if(index < 0 || index >= profile.characters.length) return false;
  profile.characters.splice(index, 1);
  // Reclamp activeSlot
  if(profile.activeSlot >= profile.characters.length){
    profile.activeSlot = Math.max(0, profile.characters.length - 1);
  }
  return writeProfile();
}

// Compatibility shim — some old code calls deleteSave(). Now means "delete active char".
function deleteSave(){
  if(profile.characters.length === 0) return;
  deleteCharacterAt(profile.activeSlot);
}

// Auto-generate a name like "Hollowcaller III" based on how many of that class exist.
function autoCharacterName(classId){
  const cls = (typeof CLASS_DEFS!=='undefined' && CLASS_DEFS[classId]) || {name:'Character'};
  const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
  // Count existing characters of same class. Check both the character's direct
  // classId (populated at creation time, so it's immediately available) AND
  // the nested save (for safety against legacy data). Either match counts.
  const count = profile.characters.filter(c => {
    if(c.classId === classId) return true;
    if(c.save?.player?.classId === classId) return true;
    return false;
  }).length;
  return cls.name + ' ' + (roman[count] || String(count+1));
}

// Create a new character slot for a given class. Returns true on success,
// false if the profile is full. Sets activeSlot to the new character.
function createCharacter(classId){
  if(profile.characters.length >= MAX_CHARACTERS){
    return false;
  }
  const now = Date.now();
  const newChar = {
    id: 'char_' + now + '_' + Math.floor(Math.random()*1000),
    name: autoCharacterName(classId),
    classId: classId,              // stored directly so autoCharacterName can count before first writeSave
    createdAt: now,
    lastPlayedAt: now,
    save: null, // will be populated by first writeSave after game starts
  };
  profile.characters.push(newChar);
  profile.activeSlot = profile.characters.length - 1;
  writeProfile();
  return true;
}

// Select an existing character by slot index. Returns true if valid slot.
function selectCharacter(index){
  if(index < 0 || index >= profile.characters.length) return false;
  profile.activeSlot = index;
  writeProfile();
  return true;
}

// Initialize: load profile from storage on script boot.
profile = readProfile();

// Apply a loaded save to the live game state. Called from startGame when continuing.
function applySave(data){
  // Class — restore FIRST so HP/attack compute functions use correct multipliers
  player.classId=data.player?.classId||'hollowcaller';
  player.wrath=data.player?.wrath||0;
  player.bulwarkUntil=0; player.retributionUntil=0; player.furyChargeUntil=0;
  // Player — use `?? default` so missing fields fall back safely
  player.level=data.player?.level??1;
  player.xp=data.player?.xp??0;
  // Always recompute xpToNext from the current formula — if we changed the
  // XP curve, existing characters should see the new curve on their next
  // level-up (not the old value persisted in their save).
  player.xpToNext=xpForLevel(player.level);
  // If saved xp somehow exceeds the new requirement, trigger an immediate
  // level-up cascade on next addXP call by just clamping xp at xpToNext-1.
  // This prevents weird states where a loaded character has more XP than
  // needed for their current level.
  if(player.xp >= player.xpToNext){
    player.xp = Math.max(0, player.xpToNext - 1);
  }
  player.maxHp=data.player?.maxHp??computeMaxHp(player.level);
  player.hp=Math.min(data.player?.hp??player.maxHp,player.maxHp);
  player.gold=data.player?.gold??0;
  player.attack=data.player?.attack??computeAttack(player.level);
  player.soulMastery=data.player?.soulMastery??0;
  player.maxBonds=data.player?.maxBonds??MAX_SPIRITS;
  // AFK toggle persists across reloads so player's preference sticks
  player.afkEnabled = !!data.player?.afkEnabled;
  // Test gear state — can be true | 'removed' | false. Preserve string.
  const rawTestFlag = data.player?._testSetsGranted;
  player._testSetsGranted = (rawTestFlag === 'removed') ? 'removed' : !!rawTestFlag;
  // Kills
  kills=data.stats?.kills??0;
  // Zone — handle camp specially since it lives outside the ZONES array
  const zoneId=data.zoneId??1;
  if(zoneId === 'procession' || zoneId === CAMP_ZONE.id){
    curZone = CAMP_ZONE;
    // Place player at camp spawn point so they're next to NPCs on reload
    player.x = WORLD_W/2 + CAMP_SPAWN_POINT.x;
    player.y = WORLD_H/2 + CAMP_SPAWN_POINT.y;
  } else {
    curZone = ZONES.find(z=>z.id===zoneId) || ZONES[0];
  }
  // Equipped gear
  if(data.equipped){
    Object.keys(equipped).forEach(slot=>{
      equipped[slot]=data.equipped[slot]||null;
    });
  }
  // Inventory (bag)
  if(typeof inventory!=='undefined'){
    inventory.length=0;
    if(Array.isArray(data.inventory)){
      data.inventory.forEach(item=>inventory.push(item));
    }
    if(typeof updateInventoryBadge==='function')updateInventoryBadge();
  }
  // Gear Stash — unlimited overflow bag. Introduced in the inventory overhaul.
  if(typeof gearStash!=='undefined'){
    gearStash.length=0;
    if(Array.isArray(data.gearStash)){
      data.gearStash.forEach(item=>gearStash.push(item));
    }
  }
  // Auto-equip upgrades toggle
  if(typeof autoEquipUpgrades!=='undefined' && typeof data.autoEquipUpgrades === 'boolean'){
    autoEquipUpgrades = data.autoEquipUpgrades;
  }
  // Set Stash — separate inventory tab for set pieces
  if(typeof setStash!=='undefined'){
    setStash.length = 0;
    if(Array.isArray(data.setStash)){
      data.setStash.forEach(item=>setStash.push(item));
    }
  }
  // New nested structure — preset tabs with chosen + spare split
  if(typeof setStashData !== 'undefined'){
    if(data.setStashData && typeof data.setStashData === 'object'){
      // Wipe and reassign
      Object.keys(setStashData).forEach(k => delete setStashData[k]);
      Object.entries(data.setStashData).forEach(([k,v])=>{ setStashData[k] = v; });
    }
    if(typeof ensureSetStashDataInitialized === 'function') ensureSetStashDataInitialized();
    // Migration: if an old save has stuff in legacy setStash[], move it over
    if(typeof migrateLegacySetStash === 'function') migrateLegacySetStash();
  }
  // Testing flag: if a saved character has _testSetsGranted, preserve it.
  // Otherwise, it's a new character or a character from before this system.
  if(data.player && data.player._testSetsGranted !== undefined){
    player._testSetsGranted = data.player._testSetsGranted;
  }
  // Quest state — hydrate active/completed/turnInCount from save
  if(data.quests && typeof hydrateQuestState === 'function'){
    hydrateQuestState(data.quests);
  }
  // Veilforge state — echo inventory + slotted echoes
  if(data.veilforge && typeof hydrateVeilforgeState === 'function'){
    hydrateVeilforgeState(data.veilforge);
  }
  // Veilgate state — endgame tier progression
  if(data.veilgate && typeof hydrateVeilgateState === 'function'){
    hydrateVeilgateState(data.veilgate);
  }
  // Shop state — restore rotation, buyback, last refresh time
  if(typeof shopState!=='undefined'&&data.shopState){
    shopState.gear=data.shopState.gear||[];
    shopState.lastRefresh=data.shopState.lastRefresh||0;
    shopState.buyback=data.shopState.buyback||null;
    shopState.buybackPrice=data.shopState.buybackPrice||0;
    shopState.materials=data.shopState.materials||[];
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
  // Also check shop auto-refresh timer
  if(typeof checkShopAutoRefresh==='function')checkShopAutoRefresh();
}

// Refresh the title screen's buttons based on whether a save exists.
// Shows "Continue" + "New Game" if save present; just "Enter the Veil" if not.
function refreshTitleButtons(){
  // With the multi-character profile, the title always shows just the
  // "Enter the Veil" button which routes to Character Select. Continue/NewGame
  // buttons are legacy and hidden; Character Select handles those flows.
  const startBtn=document.getElementById('startBtn');
  const continueBtn=document.getElementById('continueBtn');
  const newGameBtn=document.getElementById('newGameBtn');
  if(!startBtn)return;
  startBtn.style.display='inline-block';
  // Update label based on whether player has any characters
  if(profile && profile.characters && profile.characters.length > 0){
    startBtn.textContent = '⚡ Enter the Veil';
  } else {
    startBtn.textContent = '⚡ Begin Your Journey';
  }
  if(continueBtn) continueBtn.style.display='none';
  if(newGameBtn) newGameBtn.style.display='none';
}

// ═══════ START ═══════════════════════════════════════════
// Tracked setTimeout IDs from the current game so stopGame can cancel them all.
// Prevents old game's setTimeouts (enemy spawns, delayed FX) from firing into
// the new game and polluting its world state.
let _gameTimeouts = [];
function trackTimeout(fn, delay){
  const id = setTimeout(() => {
    // Remove ourselves from the array once we run
    const idx = _gameTimeouts.indexOf(id);
    if(idx >= 0) _gameTimeouts.splice(idx, 1);
    fn();
  }, delay);
  _gameTimeouts.push(id);
  return id;
}

// Stops the running game loop and clears all world-state arrays so a fresh
// game can start cleanly without the old loop's timers/enemies/particles
// bleeding into the new game. Called when switching characters or returning
// to character select mid-game.
function stopGame(){
  running=false;
  // Cancel any pending tracked timeouts from the previous game session
  _gameTimeouts.forEach(id => clearTimeout(id));
  _gameTimeouts.length = 0;
  // Clear world-state arrays so starting a new character doesn't inherit the old one's world
  if(typeof enemies!=='undefined') enemies.length=0;
  if(typeof particles!=='undefined') particles.length=0;
  if(typeof groundFX!=='undefined') groundFX.length=0;
  if(typeof dmgTexts!=='undefined') dmgTexts.length=0;
  if(typeof spirits!=='undefined') spirits.length=0;
  if(typeof envProps!=='undefined') envProps.length=0;
  // Clear ability cooldowns so the new character doesn't see old CDs
  if(typeof abilityCDs!=='undefined'){
    for(let i=0;i<abilityCDs.length;i++) abilityCDs[i]=0;
  }
  // Clear any in-progress bosses, dungeons, portals
  if(typeof bossTarget!=='undefined') bossTarget=null;
  if(typeof dungeonState!=='undefined' && dungeonState){
    dungeonState.active=false;
    dungeonState.def=null;
    if(typeof dungeonState.wave!=='undefined') dungeonState.wave=0;
  }
  if(typeof portals!=='undefined') portals.length=0;
  // Stop ambient music cleanly so it doesn't fight the next character's startMusic
  if(typeof ambientState!=='undefined' && ambientState.running){
    ambientState.running=false;
    if(typeof tearDownAmbientLayers==='function'){
      tearDownAmbientLayers(0.3, ()=>{});
    }
    ambientState.currentZoneId=null;
  }
  // Reset shake/cluster timers
  if(typeof shakeTimer!=='undefined') shakeTimer=0;
  if(typeof clusterTimer!=='undefined') clusterTimer=0;
  // Player transient state — invuln frames, ability timers
  if(typeof player!=='undefined'){
    player.iframes=0;
    player.hitFlash=0;
    player.isDead=false;
    player.bulwarkUntil=0;
    player.retributionUntil=0;
    player.furyChargeUntil=0;
    player._cheatDeathUsed=false;player._cheatDeathUses=0;
    player.afkTimer=0;
  }
}

// Exit from in-game back to the Character Select screen. Saves current
// character's progress first, then stops the game and shows the select screen.
// Called by the "EXIT" menu button during gameplay.
function exitToCharacterSelect(){
  if(!confirm('Return to Character Select?\n\nYour progress will be saved.')) return;
  // Save current character's state
  if(typeof writeSave==='function') writeSave();
  // Stop the game loop + clear world state
  stopGame();
  // Hide all in-game UI
  ['hud','abilityBar','feedLog','spiritPanel','menuBar','zoneLabel','minimap'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display='none';
  });
  // Close any open panels
  ['gearPanel','inventoryPanel','shopPanel','talentPanel','profPanel'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display='none';
  });
  // Open character select
  if(typeof openCharacterSelect==='function') openCharacterSelect();
}

function startGame(continueFromSave=false){
  // Stop any previous game cleanly before starting this one
  stopGame();
  getAC(); // unlock audio context on user gesture
  // Start preloading player sprites for whichever class is active.
  // If the class isn't known yet (first-time), chooseClass() will also call this.
  if(typeof preloadPlayerSprites === 'function' && player.classId){
    preloadPlayerSprites(player.classId);
  }
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
  // Preload sprites AFTER save is applied — player.classId is now correct
  if(typeof preloadPlayerSprites === 'function' && player.classId){
    preloadPlayerSprites(player.classId);
  }
  if(!continueFromSave){
    // Full reset to level 1 baseline
    player.level=1;player.xp=0;player.xpToNext=xpForLevel(1);player.gold=0;
    player.soulMastery=0;player._cheatDeathUsed=false;player._cheatDeathUses=0;
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
    // New characters begin in The Procession camp — a safe place to meet the NPCs
    // before venturing out. They can use Marken the Pathfinder to travel to zones.
    curZone = CAMP_ZONE;
    player.x = WORLD_W/2 + CAMP_SPAWN_POINT.x;
    player.y = WORLD_H/2 + CAMP_SPAWN_POINT.y;
  }
  setAfkWaypoint();
  generateEnvironment();
  // Safety: after environment + landmarks are placed, make sure the player
  // isn't trapped inside a newly-spawned prop or landmark (e.g. loaded save
  // where player position landed on the same coords as a landmark).
  if(typeof findClearPosition==='function'){
    const clear=findClearPosition(player.x,player.y,24);
    player.x=clear.x;player.y=clear.y;
    camX=player.x;camY=player.y;
  }
  drawAbilityIcons();
  startMusic();
  // Don't spawn combat enemies in camp — it's a safe zone
  if(!curZone?.isCamp){
    for(let i=0;i<8;i++)trackTimeout(()=>spawnEnemy(),i*400);
  }
  running=true;lastTime=performance.now();
  requestAnimationFrame(loop);
  // Initial AFK toggle UI sync so button shows correct state (camp = SAFE)
  if(typeof updateAfkToggleUI === 'function') updateAfkToggleUI();
  // Initial quest HUD tracker sync
  if(typeof updateQuestHUDTracker === 'function') updateQuestHUDTracker();
  // Sync Veilgate menu button visibility with unlock state (handles reload case)
  if(typeof refreshVeilgateMenuVisibility === 'function') refreshVeilgateMenuVisibility();
  if(continueFromSave){
    addFeed(`✦ WELCOME BACK · LV ${player.level}`,'#c084fc');
  } else {
    addFeed('✦ YOU ARRIVE AT THE PROCESSION','#d4a555');
    const _isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    addFeed(_isTouch ? 'Walk to an NPC and tap them' : 'Walk to an NPC and press E','#c4b8dd');
    // New characters — write their initial save immediately so they persist
    if(typeof writeSave==='function') writeSave();
  }
  // ═══ Backward-compat: clean out commons that accumulated in the bag
  // before the auto-salvage system was added. Runs once per game start.
  if(typeof inventory !== 'undefined' && inventory.length > 0){
    const before = inventory.length;
    let scrapGained = 0;
    for(let i = inventory.length - 1; i >= 0; i--){
      if(inventory[i] && inventory[i].rarity === 'common'){
        const yields = (typeof salvageYieldFor === 'function') ? salvageYieldFor(inventory[i]) : {scrap:1};
        if(typeof creditMaterial === 'function'){
          Object.entries(yields).forEach(([mat, qty])=>{
            creditMaterial(mat, qty);
            if(mat === 'scrap') scrapGained += qty;
          });
        }
        inventory.splice(i, 1);
      }
    }
    const cleared = before - inventory.length;
    if(cleared > 0){
      addFeed(`⚒ Auto-salvaged ${cleared} common items → +${scrapGained} Scrap`, '#a78bfa');
      if(typeof updateInventoryBadge === 'function') updateInventoryBadge();
      if(typeof writeSave === 'function') writeSave();
    }
  }
  // TEST MODE: grant all 6 preset sets to the setStash so any build can be
  // tested immediately. Runs ONCE per character (gated by _testSetsGranted flag).
  // Remove this call before public launch so players have to earn their sets.
  if(typeof grantAllPresetSetsForTesting === 'function'){
    grantAllPresetSetsForTesting();
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
document.addEventListener('keydown',e=>{
  const wasPressed = keys[e.key];
  keys[e.key]=true;
  player.lastInput=performance.now();
  // In camp, E interacts with the nearest camp NPC; outside camp, E interacts
  // with nearby zone NPCs. Edge-triggered — fires only on initial keydown.
  if(!wasPressed && (e.key === 'e' || e.key === 'E')){
    const anyPanelOpen = ['gearPanel','inventoryPanel','shopPanel','talentPanel','profPanel','zoneTravelOverlay','questPanel','processionDialogue','veilforgePanel','veilgatePanel','zoneNpcDialogue'].some(id => {
      const el = document.getElementById(id);
      return el && el.style.display !== 'none' && el.style.display !== '';
    });
    if(!anyPanelOpen){
      if(curZone?.isCamp && typeof handleCampInteraction === 'function'){
        handleCampInteraction();
      } else if(!curZone?.isCamp && typeof handleZoneNpcInteraction === 'function'){
        handleZoneNpcInteraction();
      }
    }
  }
  // F key toggles AFK mode (edge-triggered). Not usable in camp (camp disables AFK).
  if(!wasPressed && (e.key === 'f' || e.key === 'F')){
    // Skip if user is typing in an input field
    const active = document.activeElement;
    if(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    if(typeof toggleAfkMode === 'function') toggleAfkMode();
  }
});
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

// ═══════ UI SOUND WIRING ═══════════════════════════════════════
// Global click handler — plays a subtle click for menu buttons and panel
// close buttons. Keeps SFX calls out of every individual open/close function.
// Tap-to-dismiss respects mute (via the sfx bus).
document.addEventListener('click', (e) => {
  try {
    const t = e.target;
    if(!t || !t.classList) return;
    // Menu bar buttons (GEAR, BAG, SHOP, etc.)
    if(t.classList.contains('menu-btn')){
      if(typeof SFX !== 'undefined' && SFX.uiClick) SFX.uiClick();
      return;
    }
    // Panel close buttons (← BACK)
    if(t.classList.contains('panel-close')){
      if(typeof SFX !== 'undefined' && SFX.uiClose) SFX.uiClose();
      return;
    }
  } catch(err){}
}, true); // capture phase so we fire before panel-hide animations

// Start flow: if starting a new game (no continue), show class-select first.
// Continue-from-save goes straight into the game with the saved class.
// ─── VOLUME CONTROL HANDLERS ───────────────────────────────
// Global functions called by inline onclick handlers in index.html.
// masterVolume and setMasterVolume are defined in audio.js.
let _preMuteVolume = 0.6;
function toggleVolumePanel(){
  const panel = document.getElementById('volumePanel');
  if(!panel) return;
  panel.style.display = (panel.style.display === 'none') ? 'flex' : 'none';
  // Sync slider to current value when opening
  if(panel.style.display === 'flex'){
    const slider = document.getElementById('volumeSlider');
    if(slider) slider.value = Math.round(getMasterVolume() * 100);
    const val = document.getElementById('volumeValue');
    if(val) val.textContent = Math.round(getMasterVolume() * 100) + '%';
  }
}
function handleVolumeChange(v){
  const num = parseFloat(v);
  setMasterVolume(num / 100);
  const val = document.getElementById('volumeValue');
  if(val) val.textContent = Math.round(num) + '%';
  // Update button icon based on level
  const btn = document.getElementById('volumeBtn');
  if(btn){
    btn.textContent = num <= 0 ? '🔇' : (num < 33 ? '🔈' : (num < 66 ? '🔉' : '🔊'));
  }
  const muteBtn = document.querySelector('.vol-mute-btn');
  if(muteBtn) muteBtn.classList.toggle('muted', num <= 0);
}
function handleMuteToggle(){
  const cur = getMasterVolume();
  if(cur > 0){
    _preMuteVolume = cur;
    setMasterVolume(0);
    handleVolumeChange(0);
    const slider = document.getElementById('volumeSlider');
    if(slider) slider.value = 0;
  } else {
    const restore = _preMuteVolume > 0 ? _preMuteVolume : 0.6;
    setMasterVolume(restore);
    handleVolumeChange(restore * 100);
    const slider = document.getElementById('volumeSlider');
    if(slider) slider.value = restore * 100;
  }
}
// Initialize slider with saved volume on load
(function initVolumeUI(){
  const slider = document.getElementById('volumeSlider');
  if(slider){
    const v = Math.round((typeof getMasterVolume === 'function' ? getMasterVolume() : 0.6) * 100);
    slider.value = v;
    handleVolumeChange(v);
  }
})();

// ─── MOBILE MENU TOGGLE ────────────────────────────────────────────
// Phone portrait hides the menu bar by default. The ☰ toggle button shows/
// hides it. Also auto-closes when the player opens any panel so it never
// stays stuck behind a modal.
function toggleMobileMenu(){
  document.body.classList.toggle('menu-open');
}
function closeMobileMenu(){
  document.body.classList.remove('menu-open');
}

// ─── AFK MODE TOGGLE ──────────────────────────────────────────────
// Explicit player-controlled AFK. Defaults OFF. F key or UI button toggles.
// Auto-disables when entering camp. Re-enables nothing — player must choose.
function toggleAfkMode(){
  // Cannot enable AFK in camp — camp is always a safe pause zone
  if(curZone?.isCamp){
    if(typeof addFeed === 'function') addFeed('AFK disabled in camp', '#9ca3af');
    return;
  }
  player.afkEnabled = !player.afkEnabled;
  updateAfkToggleUI();
  if(typeof addFeed === 'function'){
    if(player.afkEnabled){
      addFeed('⚙ AFK MODE: ON — auto-fighting enabled', '#f59e0b');
    } else {
      addFeed('⚙ AFK MODE: OFF — manual control', '#9ca3af');
      // Clear AFK movement immediately
      player.vx = 0; player.vy = 0;
      player.afkTimer = 0;
    }
  }
  if(typeof writeSave === 'function') writeSave();
}
function updateAfkToggleUI(){
  const btn = document.getElementById('afkToggle');
  const ind = document.getElementById('afkIndicator');
  const lbl = document.getElementById('afkLabel');
  if(!btn) return;
  const inCamp = curZone?.isCamp === true;
  if(inCamp){
    btn.classList.add('afk-disabled');
    btn.classList.remove('afk-on');
    if(ind) ind.textContent = '◯';
    if(lbl) lbl.textContent = 'SAFE';
    btn.title = 'AFK disabled in camp (safe zone)';
  } else if(player.afkEnabled){
    btn.classList.add('afk-on');
    btn.classList.remove('afk-disabled');
    if(ind) ind.textContent = '●';
    if(lbl) lbl.textContent = 'AFK';
    btn.title = 'AFK mode ON — click to disable (F)';
  } else {
    btn.classList.remove('afk-on');
    btn.classList.remove('afk-disabled');
    if(ind) ind.textContent = '◯';
    if(lbl) lbl.textContent = 'AFK';
    btn.title = 'AFK mode OFF — click to enable (F)';
  }
}
// Call once on init + whenever zone changes — called from checkZone handler
if(typeof window !== 'undefined'){
  window.toggleAfkMode = toggleAfkMode;
  window.updateAfkToggleUI = updateAfkToggleUI;
}

// Close the mobile menu whenever the player taps a menu button (since it
// will immediately open a panel). The timeout lets the click register first.
document.addEventListener('click', e => {
  if(e.target && e.target.classList && e.target.classList.contains('menu-btn')){
    setTimeout(closeMobileMenu, 50);
  }
});

// ─── ORIENTATION WATCHER ─────────────────────────────────────────
// Previously gated the game to landscape only. Now the game works in all
// orientations and viewport sizes — CSS media queries handle the layout
// adaptation. This function stays as a no-op for compat with old save paths.
function updateOrientationNotice(){
  // Force-hide the rotate notice if it exists from a previous session or
  // cached HTML — we no longer require a specific orientation.
  const notice = document.getElementById('rotateNotice');
  if(notice) notice.classList.remove('active');
  // Apply orientation-specific body class so CSS can adapt
  const w = window.innerWidth;
  const h = window.innerHeight;
  document.body.classList.toggle('portrait', h > w);
  document.body.classList.toggle('phone', Math.min(w, h) < 500);
  document.body.classList.toggle('phone-portrait', h > w && w < 500);
  document.body.classList.toggle('phone-landscape', w > h && h < 500);
}
updateOrientationNotice();
window.addEventListener('resize', updateOrientationNotice);
window.addEventListener('orientationchange', ()=>{
  setTimeout(updateOrientationNotice, 120);
});

// Title button wiring — route through Character Select screen.
// Clicking "Enter the Veil" opens the character select. From there player can:
//  - pick an existing character (loads their save, enters game)
//  - create a new character (goes to class select, then into game)
//  - delete a character (confirmation for level 10+)
document.getElementById('startBtn').addEventListener('click',()=>{
  openCharacterSelect();
});
// Legacy continue/newgame buttons — now also route through character select
const _continueBtn=document.getElementById('continueBtn');
if(_continueBtn)_continueBtn.addEventListener('click',()=>openCharacterSelect());
const _newGameBtn=document.getElementById('newGameBtn');
if(_newGameBtn)_newGameBtn.addEventListener('click',()=>openCharacterSelect());

// ═══════ CHARACTER SELECT SCREEN ══════════════════════════════
function openCharacterSelect(){
  const titleScr = document.getElementById('titleScreen');
  const classScr = document.getElementById('classSelectScreen');
  const charScr  = document.getElementById('characterSelectScreen');
  if(titleScr) titleScr.style.display='none';
  if(classScr) classScr.style.display='none';
  if(charScr)  charScr.style.display='flex';
  renderCharacterSelect();
}
function closeCharacterSelect(){
  const titleScr = document.getElementById('titleScreen');
  const charScr  = document.getElementById('characterSelectScreen');
  if(charScr)  charScr.style.display='none';
  if(titleScr) titleScr.style.display='flex';
}
function renderCharacterSelect(){
  const grid = document.getElementById('characterSelectGrid');
  const countEl = document.getElementById('charSelectCount');
  if(!grid) return;
  grid.innerHTML='';
  const characters = profile.characters;
  if(countEl) countEl.textContent = `${characters.length} / ${MAX_CHARACTERS} slots used`;
  // Sort by lastPlayedAt DESC so most recent is on top
  const ordered = characters.map((c,i)=>({chr:c, origIndex:i}))
    .sort((a,b) => (b.chr.lastPlayedAt||0) - (a.chr.lastPlayedAt||0));
  // Render existing character cards
  ordered.forEach(({chr, origIndex})=>{
    // Classify character by classId (stored on creation) falling back to save if present
    const chrClassId = chr.classId || chr.save?.player?.classId || 'hollowcaller';
    const cls = (typeof CLASS_DEFS!=='undefined' && CLASS_DEFS[chrClassId]) || {name:'Unknown',resourceColor:'#9ca3af'};
    const level = chr.save?.player?.level || 1;
    const gold = chr.save?.player?.gold || 0;
    const kills = chr.save?.stats?.kills || 0;
    const lastPlayedDays = chr.lastPlayedAt ? Math.floor((Date.now() - chr.lastPlayedAt) / 86400000) : 0;
    const lastPlayedStr = (()=>{
      if(!chr.lastPlayedAt) return 'Never';
      const diff = Date.now() - chr.lastPlayedAt;
      if(diff < 60000) return 'Just now';
      if(diff < 3600000) return Math.floor(diff/60000) + ' min ago';
      if(diff < 86400000) return Math.floor(diff/3600000) + ' hrs ago';
      return lastPlayedDays + ' day' + (lastPlayedDays===1?'':'s') + ' ago';
    })();
    const icon = chrClassId === 'ironwake' ? '⚔' : '🜲';
    const card = document.createElement('div');
    card.className = 'char-card';
    card.style.borderColor = cls.resourceColor + '66';
    card.innerHTML = `
      <div class="char-card-icon" style="color:${cls.resourceColor};text-shadow:0 0 16px ${cls.resourceColor}88">${icon}</div>
      <div class="char-card-name">${chr.name}</div>
      <div class="char-card-class" style="color:${cls.resourceColor}">${cls.name}</div>
      <div class="char-card-stats">
        <div class="char-stat"><span class="char-stat-label">LV</span><span class="char-stat-val">${level}</span></div>
        <div class="char-stat"><span class="char-stat-label">GOLD</span><span class="char-stat-val">${gold}</span></div>
        <div class="char-stat"><span class="char-stat-label">KILLS</span><span class="char-stat-val">${kills}</span></div>
      </div>
      <div class="char-card-lastplayed">${lastPlayedStr}</div>
      <div class="char-card-actions">
        <button class="char-action-play" style="color:${cls.resourceColor};border-color:${cls.resourceColor}66">▶ PLAY</button>
        <button class="char-action-delete">✗ DELETE</button>
      </div>
    `;
    card.querySelector('.char-action-play').addEventListener('click',()=>{
      selectCharacter(origIndex);
      const charScr = document.getElementById('characterSelectScreen');
      if(charScr) charScr.style.display='none';
      startGame(true); // continue from save
    });
    card.querySelector('.char-action-delete').addEventListener('click',()=>{
      // Confirmation threshold — higher level = more investment lost
      const lv = chr.save?.player?.level || 1;
      let msg = `Delete ${chr.name}?\n\nThis character will be permanently removed.`;
      if(lv >= 10){
        msg = `⚠ Delete ${chr.name} (Level ${lv})?\n\nThis character has meaningful progress. This action cannot be undone.`;
      }
      if(confirm(msg)){
        deleteCharacterAt(origIndex);
        renderCharacterSelect();
      }
    });
    grid.appendChild(card);
  });
  // Render "create new" card if we have room
  if(characters.length < MAX_CHARACTERS){
    const createCard = document.createElement('div');
    createCard.className = 'char-card char-card-empty';
    createCard.innerHTML = `
      <div class="char-card-icon char-card-plus">+</div>
      <div class="char-card-name">Create New</div>
      <div class="char-card-class">${MAX_CHARACTERS - characters.length} slot${MAX_CHARACTERS - characters.length===1?'':'s'} remaining</div>
      <button class="char-action-create">CHOOSE CLASS</button>
    `;
    createCard.querySelector('.char-action-create').addEventListener('click',()=>{
      openClassSelect(); // existing function, chooseClass now creates a new char
    });
    grid.appendChild(createCard);
  }
  const cancelBtn = document.getElementById('charSelectCancelBtn');
  if(cancelBtn){
    cancelBtn.onclick = ()=>closeCharacterSelect();
  }
}

// Class-select screen: shows both classes as big cards, player picks one, then starts game.
function openClassSelect(){
  const titleScr = document.getElementById('titleScreen');
  const classScr = document.getElementById('classSelectScreen');
  const charScr  = document.getElementById('characterSelectScreen');
  if(titleScr) titleScr.style.display='none';
  if(charScr)  charScr.style.display='none';
  if(classScr) classScr.style.display='flex';
  renderClassSelect();
}
function closeClassSelect(){
  const charScr  = document.getElementById('characterSelectScreen');
  const classScr = document.getElementById('classSelectScreen');
  if(classScr) classScr.style.display='none';
  // Return to character select if we have any chars, else to title
  if(charScr && profile.characters.length > 0){
    charScr.style.display='flex';
    renderCharacterSelect();
  } else {
    const titleScr = document.getElementById('titleScreen');
    if(titleScr) titleScr.style.display='flex';
  }
}
function renderClassSelect(){
  const grid = document.getElementById('classSelectGrid');
  if(!grid) return;
  grid.innerHTML='';
  Object.values(CLASS_DEFS).forEach(cls=>{
    const card = document.createElement('div');
    card.className = 'class-card';
    card.style.borderColor = cls.resourceColor + '66';
    card.innerHTML = `
      <div class="class-card-icon" style="color:${cls.resourceColor};text-shadow:0 0 20px ${cls.resourceColor}88">${cls.id==='hollowcaller'?'🜲':'⚔'}</div>
      <div class="class-card-name" style="color:${cls.resourceColor}">${cls.name.toUpperCase()}</div>
      <div class="class-card-tagline">${cls.tagline}</div>
      <div class="class-card-desc">${cls.description}</div>
      <div class="class-card-stats">
        <div class="class-stat"><span class="class-stat-label">HP</span><span class="class-stat-val">${cls.baseHp}</span></div>
        <div class="class-stat"><span class="class-stat-label">Attack</span><span class="class-stat-val">${cls.baseAtk}</span></div>
        <div class="class-stat"><span class="class-stat-label">Speed</span><span class="class-stat-val">${Math.round(cls.speedMult*100)}%</span></div>
        <div class="class-stat"><span class="class-stat-label">Range</span><span class="class-stat-val">${cls.attackRange}px</span></div>
        <div class="class-stat"><span class="class-stat-label">Resource</span><span class="class-stat-val" style="color:${cls.resourceColor}">${cls.resourceName}</span></div>
      </div>
      <button class="class-card-choose" style="color:${cls.resourceColor};border-color:${cls.resourceColor}66">CHOOSE ${cls.name.toUpperCase()}</button>
    `;
    card.querySelector('.class-card-choose').addEventListener('click',()=>{
      chooseClass(cls.id);
    });
    grid.appendChild(card);
  });
  const cancelBtn = document.getElementById('classSelectCancelBtn');
  if(cancelBtn){
    cancelBtn.onclick = ()=>closeClassSelect();
  }
}
function chooseClass(classId){
  // Check if profile is full before creating
  if(profile.characters.length >= MAX_CHARACTERS){
    alert(`Character slots are full (${MAX_CHARACTERS}). Delete a character from the Character Select screen to make room.`);
    return;
  }
  // Create a new character slot for this class — this sets activeSlot to the new char
  const created = createCharacter(classId);
  if(!created){
    alert('Could not create character.');
    return;
  }
  // Initialize live player state for the new character
  player.classId = classId;
  player.wrath = 0;
  player.bulwarkUntil = 0;
  player.retributionUntil = 0;
  player.furyChargeUntil = 0;
  // Hide class-select, start game fresh (no save to load — this is a new char)
  const classScr = document.getElementById('classSelectScreen');
  if(classScr) classScr.style.display='none';
  startGame(false);
}

// Helper: check if user confirms New Game when a save exists.
// Returns true if user accepted (proceed with New Game), false if declined.
function newGameConfirmCheck(){
  if(!hasSave()) return true;
  return confirm('Starting a new game will overwrite your current save. Are you sure?');
}
// Paint correct buttons on page load
refreshTitleButtons();

// ═══════ TAP-TO-INTERACT ═══════════════════════════════════════════
// Mobile-friendly interaction: tap an NPC directly (or near them) to trigger
// their interaction. Works alongside the touch joystick — a brief tap that
// doesn't drag is treated as an interaction attempt, not movement.
// On desktop this also handles mouse clicks in the game world.
//
// How it distinguishes tap from joystick:
//  - Records touch start position + time
//  - On touch end, if the finger moved less than TAP_MAX_DRIFT and was held
//    less than TAP_MAX_HOLD_MS, it's a tap
//  - Tap world coords are checked against all camp NPCs; nearest within
//    TAP_INTERACT_RADIUS triggers that NPC's interaction
const TAP_MAX_DRIFT = 35;      // px — finger movement above this = drag, not tap
const TAP_MAX_HOLD_MS = 600;   // ms — hold time above this = drag, not tap
const TAP_INTERACT_RADIUS = 120; // world-units radius around tap point to find NPC
let _tapTracker = { active:false, sx:0, sy:0, startTime:0 };

// Convert a screen position (client coords) to world coords using current camera
function screenToWorld(sx, sy){
  // Inverse of the render transform: first subtract screen center, then
  // divide by zoom (because at higher zoom, a screen pixel covers fewer
  // world units), then add camera offset.
  return {
    x: camX + (sx - W/2) / WORLD_ZOOM,
    y: camY + (sy - H/2) / WORLD_ZOOM,
  };
}

// Find nearest camp NPC within interact range of a given world coord.
// Returns the NPC object or null.
function getNpcAtWorld(wx, wy, radius = TAP_INTERACT_RADIUS){
  if(!curZone?.isCamp || typeof CAMP_NPCS === 'undefined') return null;
  let closest = null, closestDist = radius;
  CAMP_NPCS.forEach(npc => {
    if(!isNpcAvailable(npc)) return; // skip locked NPCs
    const pos = campWorldPos(npc);
    const dx = wx - pos.x, dy = wy - pos.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if(d < closestDist){ closest = npc; closestDist = d; }
  });
  return closest;
}

// Returns true if this NPC should be visible/interactable right now.
// NPCs without unlockCondition are always available. Conditional ones
// (Veilwarden etc) only show when their gating condition is met.
function isNpcAvailable(npc){
  if(!npc.unlockCondition) return true;
  if(npc.unlockCondition === 'veilgate'){
    return (typeof veilgateState !== 'undefined') && veilgateState.unlocked;
  }
  return true;
}

// Execute NPC interaction — centralized so touch and keyboard both call it
function executeNpcInteraction(npc){
  if(!npc) return false;
  const handlers = {
    openZoneTravel: ()=>{ if(typeof openZoneTravelScreen === 'function') openZoneTravelScreen(); },
    openMerchant:   ()=>{ if(typeof openShop === 'function') openShop(); },
    openWeaponsmith:()=>{ if(typeof openProf === 'function') openProf(); },
    openArmorer:    ()=>{ if(typeof openProf === 'function') openProf(); },
    openRitualist:  ()=>{ if(typeof openProf === 'function') openProf(); },
    // Quest hub — The Old Procession. Opens the Procession's dialogue
    // where the player can accept available quests, turn in completed ones,
    // and review active work.
    openQuestHub:   ()=>{
      if(typeof openProcessionDialogue === 'function'){
        openProcessionDialogue();
      } else if(typeof addFeed === 'function'){
        addFeed(`"We have been waiting..."`, '#c4b5fd');
        addFeed(`  └ The Procession stirs. Quest system not yet loaded.`, '#9ca3af');
      }
    },
    // Veilgate — The Veilwarden. Opens the endgame tier selection panel.
    // NPC is filtered by isNpcAvailable() so this only fires when unlocked.
    openVeilgate:   ()=>{
      if(typeof openVeilgate === 'function'){
        openVeilgate();
      } else if(typeof addFeed === 'function'){
        addFeed(`"You are not ready for what lies beyond."`, '#fbbf24');
      }
    },
  };
  const fn = handlers[npc.onInteract];
  if(fn){ fn(); return true; }
  return false;
}

// Handle a tap at a given screen position. Returns true if an interaction fired.
function handleTapAt(screenX, screenY){
  // Don't interact if any modal/panel is already open — tapping through them
  // would be confusing
  const openPanel = ['gearPanel','inventoryPanel','shopPanel','talentPanel','profPanel','zoneTravelOverlay','questPanel','processionDialogue','veilforgePanel','veilgatePanel','zoneNpcDialogue'].find(id => {
    const el = document.getElementById(id);
    return el && getComputedStyle(el).display !== 'none' && el.style.display !== '';
  });
  if(openPanel) return false;
  // Convert screen to world
  const wp = screenToWorld(screenX, screenY);
  // Camp NPC first (only relevant in camp zone)
  if(curZone?.isCamp){
    const campNpc = getNpcAtWorld(wp.x, wp.y);
    if(campNpc){
      executeNpcInteraction(campNpc);
      return true;
    }
    return false;
  }
  // Outside camp — check for zone NPC at tap location
  if(!dungeonState.active && typeof getZoneNpcAtWorld === 'function'){
    const zoneNpc = getZoneNpcAtWorld(wp.x, wp.y);
    if(zoneNpc){
      if(typeof openZoneNpcDialogue === 'function') openZoneNpcDialogue(zoneNpc);
      return true;
    }
  }
  return false;
}

// Desktop mouse click — triggers tap-to-interact anywhere in the game world
canvas.addEventListener('click', e => {
  // Only fires for mouse clicks; touches on mobile dispatch click too but
  // our touchend handler gets there first with preventDefault. This is a
  // belt-and-suspenders approach for desktop mouse.
  if(e.isTrusted === false) return;
  handleTapAt(e.clientX, e.clientY);
});

// ═══════ TOUCH HANDLERS ═══════════════════════════════════════════
// Left-half touch = virtual joystick for movement (original behavior).
// Right-half touch = handled as potential tap; if the finger doesn't drag,
// it fires a tap-to-interact at the tap location.
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  for(let i=0; i<e.changedTouches.length; i++){
    const t = e.changedTouches[i];
    // Skip touches that originated on a UI element (ability button, menu, etc).
    // This prevents the joystick from hijacking ability taps.
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if(el && (el.closest('#abilityBar') || el.closest('.menu-btn') || el.closest('#afkToggle') || el.closest('#questTracker'))){
      continue;
    }
    if(t.clientX < W/2 && !touchJoy.active){
      // Left side — joystick for movement
      joyId = t.identifier;
      touchJoy.startX = t.clientX;
      touchJoy.startY = t.clientY;
      touchJoy.active = true;
      touchJoy.dx = 0;
      touchJoy.dy = 0;
    } else {
      // Right side OR left side while joystick active — candidate tap
      _tapTracker = {
        active: true,
        id: t.identifier,
        sx: t.clientX,
        sy: t.clientY,
        startTime: performance.now(),
      };
    }
  }
}, {passive:false});
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for(let i=0; i<e.changedTouches.length; i++){
    const t = e.changedTouches[i];
    if(t.identifier === joyId){
      const dx = t.clientX - touchJoy.startX;
      const dy = t.clientY - touchJoy.startY;
      const m = Math.sqrt(dx*dx + dy*dy) || 1;
      touchJoy.dx = dx / Math.max(m, 50);
      touchJoy.dy = dy / Math.max(m, 50);
      player.lastInput = performance.now();
    }
    if(_tapTracker.active && t.identifier === _tapTracker.id){
      // Check if finger drifted too far — if so, invalidate the tap
      const dx = t.clientX - _tapTracker.sx;
      const dy = t.clientY - _tapTracker.sy;
      if(Math.sqrt(dx*dx + dy*dy) > TAP_MAX_DRIFT){
        _tapTracker.active = false;
      }
    }
  }
}, {passive:false});
canvas.addEventListener('touchend', e => {
  for(let i=0; i<e.changedTouches.length; i++){
    const t = e.changedTouches[i];
    if(t.identifier === joyId){
      touchJoy.active = false;
      touchJoy.dx = 0;
      touchJoy.dy = 0;
      joyId = null;
    }
    if(_tapTracker.active && t.identifier === _tapTracker.id){
      // Was this a valid brief tap? If so, attempt NPC interaction.
      const elapsed = performance.now() - _tapTracker.startTime;
      if(elapsed < TAP_MAX_HOLD_MS){
        handleTapAt(t.clientX, t.clientY);
      }
      _tapTracker.active = false;
    }
  }
});

// ═══════ ABILITY BUTTON TOUCH HANDLERS ════════════════════════════
// Inline onclick is unreliable on mobile when a joystick finger is already
// held down (the browser can defer click until joystick releases). Adding
// touchstart directly fires on first touch, completely independent of other
// touches. This is why holding movement and tapping an ability can fail —
// the click event is queued behind the joystick's ongoing touch stream.
for(let i = 0; i < 5; i++){
  const btn = document.getElementById(`ab${i}`);
  if(!btn) continue;
  const idx = i;
  btn.addEventListener('touchstart', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    // Fire the cast immediately; onclick as a safety fallback
    if(typeof playerCast === 'function') playerCast(idx);
    player.lastInput = performance.now();
  }, {passive:false});
}


// ════════ ZONE TRANSITIONS ════════════════════════════════════════════
// ═══════ THE PROCESSION — CAMP RENDERING & INTERACTION ════════════
// The camp's world-anchored positions are relative to world center. We
// convert them to absolute world coords on access so rendering and collision
// use the same coordinate space as everything else in the game.

// Get absolute world coords for a camp element (NPC or campfire).
function campWorldPos(entry){
  return { x: WORLD_W/2 + (entry.x||0), y: WORLD_H/2 + (entry.y||0) };
}

// Returns the NPC the player is currently within interaction range of,
// or null if none. Used by render to highlight, and by E key to trigger.
const CAMP_INTERACT_RADIUS = 80;
function getNearbyCampNpc(){
  if(!curZone?.isCamp) return null;
  let closest = null, closestDist = CAMP_INTERACT_RADIUS;
  CAMP_NPCS.forEach(npc => {
    if(!isNpcAvailable(npc)) return; // locked NPCs not interactable
    const pos = campWorldPos(npc);
    const dx = player.x - pos.x, dy = player.y - pos.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if(d < closestDist){ closest = npc; closestDist = d; }
  });
  return closest;
}

// Draw an NPC figure — each NPC has a unique silhouette proportions AND a
// signature accent object. Different enough to identify at a glance.
function drawCampNpcFigure(npc, pos, now){
  const bob = Math.sin(now*0.001 + (npc.x+npc.y)*0.01) * 1.4;
  const y = pos.y + bob;
  const x = pos.x;

  // ─── SILHOUETTE PROPORTIONS PER NPC TYPE ───
  // Different body shapes so NPCs look distinct even without accents.
  let bodyW = 14, bodyTop = 10, bodyHeight = 32, headR = 7, headY = -18;
  const npcType = npc.npcType || 'ghost-scholar';
  if(npcType === 'ghost-warrior'){
    // Stocky, broad-shouldered — the Warden
    bodyW = 18; bodyTop = 14; bodyHeight = 34; headR = 8; headY = -19;
  } else if(npcType === 'ghost-scholar'){
    // Tall, slender — Cartographer, Keeper
    bodyW = 13; bodyTop = 9; bodyHeight = 36; headR = 6.5; headY = -22;
  } else if(npcType === 'ghost-merchant'){
    // Hooded, hunched — Veilbroker
    bodyW = 15; bodyTop = 11; bodyHeight = 30; headR = 7.5; headY = -16;
  } else if(npcType === 'ghost-procession'){
    // Three shrouded figures huddled together — draw as one wide shape
    bodyW = 22; bodyTop = 16; bodyHeight = 32; headR = 0; headY = -18;
  } else if(npcType === 'living-mender'){
    // Seris — looks warmer, more human. Slightly shorter.
    bodyW = 13; bodyTop = 10; bodyHeight = 30; headR = 7; headY = -17;
  } else if(npcType === 'ghost-warden'){
    // The Veilwarden — tall, imposing, crowned presence.
    // Stocky like a warrior but TALLER, signaling elevated status.
    bodyW = 17; bodyTop = 12; bodyHeight = 42; headR = 8; headY = -26;
  }

  // ─── SHADOW ───
  ctx.fillStyle='rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(x, y + bodyHeight*0.65, bodyW*1.25, 5, 0, 0, Math.PI*2);
  ctx.fill();

  // ─── GHOSTLY AURA for dead NPCs (everyone except Seris) ───
  if(npcType !== 'living-mender'){
    const auraPulse = 0.5 + Math.sin(now*0.003 + npc.x*0.01)*0.3;
    const auraR = bodyW * 1.8;
    const auraGrad = ctx.createRadialGradient(x, y-4, 0, x, y-4, auraR);
    auraGrad.addColorStop(0, `${npc.accent}22`);
    auraGrad.addColorStop(0.6, `${npc.color}15`);
    auraGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = auraGrad;
    ctx.globalAlpha = auraPulse * 0.85;
    ctx.beginPath();ctx.arc(x, y-4, auraR, 0, Math.PI*2);ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ─── BODY ───
  ctx.fillStyle=npc.color;
  ctx.shadowColor=npc.accent; ctx.shadowBlur=14;
  ctx.beginPath();
  ctx.moveTo(x - bodyW, y + bodyHeight*0.5);
  ctx.lineTo(x - bodyTop, y - bodyHeight*0.35);
  ctx.lineTo(x + bodyTop, y - bodyHeight*0.35);
  ctx.lineTo(x + bodyW, y + bodyHeight*0.5);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur=0;

  // ─── HEAD ───
  if(headR > 0){
    ctx.fillStyle=npc.accent;
    ctx.beginPath();ctx.arc(x, y + headY, headR, 0, Math.PI*2);ctx.fill();
    // Inner hood shadow (gives face depth)
    ctx.fillStyle='rgba(0,0,0,0.4)';
    ctx.beginPath();ctx.arc(x, y + headY + 1, headR*0.65, 0, Math.PI*2);ctx.fill();
    // For dead NPCs — glowing eye slits
    if(npcType !== 'living-mender'){
      ctx.fillStyle = npc.accent;
      ctx.shadowColor = npc.accent; ctx.shadowBlur = 6;
      ctx.beginPath();ctx.arc(x - headR*0.3, y + headY + 1, 1.2, 0, Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(x + headR*0.3, y + headY + 1, 1.2, 0, Math.PI*2);ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // ─── ROLE-SPECIFIC SIGNATURE OBJECT ───
  ctx.save();
  ctx.translate(x, y);
  if(npc.role === 'travel'){
    // Silent Cartographer — a floating scroll/map beside her
    ctx.fillStyle='#e8d8a8';
    ctx.shadowColor='#d4a555'; ctx.shadowBlur=8;
    ctx.fillRect(14, -8, 10, 14);
    // Scroll lines
    ctx.shadowBlur=0;
    ctx.strokeStyle='#6a4a28';
    ctx.lineWidth=0.5;
    for(let i=0;i<3;i++){
      ctx.beginPath();ctx.moveTo(15, -5+i*4); ctx.lineTo(23, -5+i*4); ctx.stroke();
    }
    // A drifting pencil/charcoal — animated
    const penBob = Math.sin(now*0.003)*2;
    ctx.strokeStyle='#2a1810';
    ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(18, 4+penBob); ctx.lineTo(22, 10+penBob); ctx.stroke();
  } else if(npc.role === 'weaponsmith'){
    // Hollowed Warden — anvil + forever-burning spirit ember
    ctx.fillStyle='#2a1f10';
    ctx.fillRect(-16, 18, 32, 4);
    ctx.fillRect(-12, 22, 24, 3);
    // Sitting hammer on anvil
    ctx.fillStyle='#4a3525';
    ctx.fillRect(-4, 15, 3, 7);
    ctx.fillRect(-7, 14, 9, 3);
    // Ghostly ember glow (burns without wood)
    const emberPulse = 0.7 + Math.sin(now*0.008)*0.3;
    ctx.fillStyle='#ff6b2c';
    ctx.shadowColor='#ff6b2c'; ctx.shadowBlur=14 * emberPulse;
    ctx.globalAlpha = emberPulse;
    ctx.beginPath();ctx.arc(6, 19, 2.5, 0, Math.PI*2);ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur=0;
  } else if(npc.role === 'armorer'){
    // Seris — loom + threads (still standard needlework)
    ctx.strokeStyle='#6a4a28';
    ctx.lineWidth=1.4;
    ctx.strokeRect(-18, -6, 10, 22);
    // Threads
    ctx.strokeStyle=npc.accent;
    ctx.lineWidth=0.6;
    for(let i=0;i<4;i++){
      ctx.beginPath();ctx.moveTo(-18, -4+i*6); ctx.lineTo(-8, -4+i*6); ctx.stroke();
    }
    // Living warmth — small candle (differentiates her as the ONLY living NPC)
    ctx.fillStyle='#fbbf24';
    ctx.shadowColor='#fbbf24'; ctx.shadowBlur=10;
    ctx.beginPath();ctx.arc(14, -12, 2, 0, Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle='#7a4a24';
    ctx.fillRect(13, -10, 2, 6);
  } else if(npc.role === 'merchant'){
    // Veilbroker — a small floating cache of regrets (glowing shards)
    // Instead of a cart. His wares float around him eerily.
    const shardBob = Math.sin(now*0.004)*2;
    ctx.fillStyle='#a89dc4';
    ctx.shadowColor='#c4b5fd'; ctx.shadowBlur=12;
    // Three floating shards orbiting at different phases
    for(let i=0;i<3;i++){
      const ang = now*0.0012 + i*(Math.PI*2/3);
      const orbX = 18 + Math.cos(ang)*5;
      const orbY = -2 + shardBob + Math.sin(ang)*5;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(orbX, orbY-2.5);
      ctx.lineTo(orbX+1.5, orbY);
      ctx.lineTo(orbX, orbY+2.5);
      ctx.lineTo(orbX-1.5, orbY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur=0;
  } else if(npc.role === 'ritualist'){
    // Keeper of Last Words — floating tome above her, rune circle at feet
    // (she collects the last words of the dying into a book)
    const bookBob = Math.sin(now*0.003)*1.5;
    ctx.fillStyle='#8a6a4a';
    ctx.shadowColor='#9DC4B0'; ctx.shadowBlur=8;
    ctx.fillRect(-5, -36+bookBob, 10, 8);
    // Glowing pages
    ctx.fillStyle='#e8f4ec';
    ctx.shadowBlur=12;
    ctx.fillRect(-4, -35+bookBob, 8, 2);
    ctx.shadowBlur=0;
    // Rune circle at feet
    const runeAngle = now*0.0008;
    ctx.strokeStyle='#9DC4B0';
    ctx.lineWidth=0.8;
    ctx.globalAlpha=0.45;
    ctx.beginPath();ctx.arc(0, 20, 20, 0, Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;
    for(let i=0;i<4;i++){
      const a = runeAngle + i*(Math.PI*2/4);
      ctx.fillStyle='#9DC4B0';
      ctx.beginPath();ctx.arc(Math.cos(a)*20, 20+Math.sin(a)*4, 1.4, 0, Math.PI*2);ctx.fill();
    }
  } else if(npc.role === 'questhub'){
    // The Old Procession — three huddled shrouded figures instead of one.
    // Each slightly different to imply they're three distinct spirits.
    ctx.translate(0, -bodyHeight*0.5);
    const heads = [
      {ox:-12, oy:-4, r:5.5, c:'#a78bfa'},
      {ox:0,   oy:-8, r:6,   c:'#c4b5fd'},
      {ox:12,  oy:-4, r:5.5, c:'#8b5cf6'},
    ];
    heads.forEach((h, i)=>{
      ctx.fillStyle = h.c;
      ctx.shadowColor = h.c; ctx.shadowBlur = 10;
      // Hooded head
      ctx.beginPath();ctx.arc(h.ox, h.oy, h.r, 0, Math.PI*2);ctx.fill();
      // Inner shadow (face)
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();ctx.arc(h.ox, h.oy+0.5, h.r*0.6, 0, Math.PI*2);ctx.fill();
      // Glowing eye - one per hood (they speak as one)
      ctx.fillStyle = h.c;
      ctx.shadowColor = h.c; ctx.shadowBlur = 6;
      ctx.beginPath();ctx.arc(h.ox, h.oy, 1, 0, Math.PI*2);ctx.fill();
      ctx.shadowBlur = 0;
    });
    // Floating quest-rune above them (placeholder visual for "they have work for you")
    const questPulse = 0.6 + Math.sin(now*0.004)*0.4;
    ctx.globalAlpha = questPulse;
    ctx.fillStyle = '#fbbf24';
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 14 * questPulse;
    // Diamond shape
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(4, -18);
    ctx.lineTo(0, -14);
    ctx.lineTo(-4, -18);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  } else if(npc.role === 'veilgate'){
    // The Veilwarden — halo of golden runic marks rotating above his head.
    // Signals "he holds the key to something powerful."
    ctx.translate(0, -bodyHeight*0.55);
    const spin = now * 0.0012;
    const glow = 0.75 + Math.sin(now*0.003)*0.25;
    // Central radiant glyph — diamond with inner cross
    ctx.save();
    ctx.rotate(spin * 0.6);
    ctx.globalAlpha = glow;
    ctx.fillStyle = '#fbbf24';
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 18 * glow;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(6, -8);
    ctx.lineTo(0, -2);
    ctx.lineTo(-6, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Four orbiting runic sparks (golden halo)
    const haloR = 22;
    for(let i = 0; i < 4; i++){
      const a = spin + (i * Math.PI / 2);
      const rx = Math.cos(a) * haloR;
      const ry = Math.sin(a) * haloR * 0.4 - 10; // flatten into a "crown" ellipse
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#fde68a';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(rx, ry, 1.8, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    // Faint overall aura behind him — golden light bleeding into the air
    ctx.save();
    ctx.globalAlpha = 0.18 * glow;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, -8, 32, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  // ─── INTERACTION HINT (above head when player is nearby) ───
  const isNearby = getNearbyCampNpc() === npc;
  if(isNearby){
    ctx.save();
    // Pulsing hint box
    const hintPulse = 0.8 + Math.sin(now*0.006)*0.2;
    ctx.globalAlpha = hintPulse;
    ctx.font = '600 11px Cinzel, serif';
    ctx.textAlign = 'center';
    // Name label
    const nameY = y + headY - headR - 20;
    const nameW = ctx.measureText(npc.name).width;
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(x - nameW/2 - 10, nameY - 10, nameW + 20, 16);
    ctx.strokeStyle = npc.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - nameW/2 - 10, nameY - 10, nameW + 20, 16);
    ctx.fillStyle = npc.accent;
    ctx.fillText(npc.name, x, nameY + 2);
    // Press E / Tap prompt
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const prompt = isTouch ? '[Tap to Speak]' : '[E] Speak';
    ctx.font = '600 9px Cinzel, serif';
    const promptW = ctx.measureText(prompt).width;
    ctx.fillStyle = 'rgba(251,191,36,0.95)';
    ctx.fillRect(x - promptW/2 - 6, nameY + 8, promptW + 12, 13);
    ctx.fillStyle = '#1a1020';
    ctx.fillText(prompt, x, nameY + 18);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
    ctx.restore();
  }
}

// Draw the central campfire with warm flicker
function drawCampfire(now){
  const pos = campWorldPos(CAMP_CAMPFIRE);
  const x = pos.x, y = pos.y;
  // Glow pool on ground
  const g = ctx.createRadialGradient(x, y, 0, x, y, 220);
  g.addColorStop(0, 'rgba(255,180,80,0.35)');
  g.addColorStop(0.5, 'rgba(255,140,60,0.15)');
  g.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = g;
  ctx.beginPath();ctx.arc(x, y, 220, 0, Math.PI*2);ctx.fill();
  // Logs
  ctx.fillStyle='#2a1810';
  ctx.fillRect(x-20, y, 40, 6);
  ctx.fillRect(x-14, y-4, 28, 5);
  // Fire — flickering triangle stack
  const flickerA = 12 + Math.sin(now*0.015)*3;
  const flickerB = 18 + Math.sin(now*0.011+1.2)*4;
  // Outer flame (orange)
  ctx.fillStyle='#ff7f2a';
  ctx.shadowColor='#ff7f2a'; ctx.shadowBlur=22;
  ctx.beginPath();
  ctx.moveTo(x, y-flickerB);
  ctx.lineTo(x-10, y);
  ctx.lineTo(x+10, y);
  ctx.closePath();
  ctx.fill();
  // Inner flame (yellow)
  ctx.fillStyle='#ffcc44';
  ctx.shadowColor='#ffcc44'; ctx.shadowBlur=14;
  ctx.beginPath();
  ctx.moveTo(x, y-flickerA);
  ctx.lineTo(x-5, y-2);
  ctx.lineTo(x+5, y-2);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur=0;
  // Sparks rising
  for(let i=0;i<3;i++){
    const sparkT = (now*0.001 + i*0.3) % 1;
    const sx = x + Math.sin(now*0.004 + i)*8;
    const sy = y - sparkT*50;
    ctx.globalAlpha = 1 - sparkT;
    ctx.fillStyle='#ffd060';
    ctx.beginPath();ctx.arc(sx, sy, 1.4, 0, Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
}

// Main NPC draw call. Called from render() when in camp zone.
function drawCampNPCs(now){
  // Campfire first (behind NPCs in z-order but anchored at y=40)
  drawCampfire(now);
  // Draw each NPC
  const nearby = getNearbyCampNpc();
  CAMP_NPCS.forEach(npc => {
    if(!isNpcAvailable(npc)) return; // skip drawing locked NPCs
    const pos = campWorldPos(npc);
    drawCampNpcFigure(npc, pos, now);
    // When NOT nearby, show a subtle name label above the NPC so player
    // can identify everyone at a glance. When nearby, drawCampNpcFigure
    // handles the richer "name + prompt" UI so we skip the simple label.
    if(nearby !== npc){
      const labelY = pos.y - 46;
      ctx.font = '600 10px Cinzel, serif';
      ctx.textAlign = 'center';
      const textW = ctx.measureText(npc.name).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(pos.x - textW/2 - 6, labelY - 10, textW + 12, 14);
      ctx.fillStyle = npc.color;
      ctx.globalAlpha = 0.75;
      ctx.fillText(npc.name, pos.x, labelY);
      ctx.globalAlpha = 1;
    }
  });
  ctx.textAlign = 'start';
}

// Handle E keypress for NPC interaction. Called from key handler.
function handleCampInteraction(){
  if(!curZone?.isCamp) return false;
  const npc = getNearbyCampNpc();
  if(!npc) return false;
  return executeNpcInteraction(npc);
}

// ═══════════════════════════════════════════════════════════════════
// ZONE NPCs — quest-giver NPCs scattered throughout overworld zones.
// Rendered when player is in a non-camp, non-dungeon zone. Uses world
// coords directly (as opposed to camp NPCs which are relative to center).
// ═══════════════════════════════════════════════════════════════════

// Get all ZONE_NPCS that belong to the current zone.
function _getActiveZoneNpcs(){
  if(typeof ZONE_NPCS === 'undefined' || !curZone?.id) return [];
  return ZONE_NPCS.filter(n => n.zoneId === curZone.id);
}

// Zone NPCs use absolute world coords (their x/y is already world-anchored).
function _zoneNpcWorldPos(npc){
  return { x: npc.x, y: npc.y };
}

// Returns the zone NPC the player is within interact range of, or null.
const ZONE_NPC_INTERACT_RADIUS = 80;
function getNearbyZoneNpc(){
  if(curZone?.isCamp || dungeonState.active) return null;
  const npcs = _getActiveZoneNpcs();
  if(!npcs.length) return null;
  let closest = null, closestDist = ZONE_NPC_INTERACT_RADIUS;
  npcs.forEach(npc => {
    const pos = _zoneNpcWorldPos(npc);
    const dx = player.x - pos.x, dy = player.y - pos.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if(d < closestDist){ closest = npc; closestDist = d; }
  });
  return closest;
}

// Zone NPC at given world coords (for tap-to-interact).
function getZoneNpcAtWorld(wx, wy, radius = TAP_INTERACT_RADIUS){
  if(curZone?.isCamp || dungeonState.active) return null;
  const npcs = _getActiveZoneNpcs();
  if(!npcs.length) return null;
  let closest = null, closestDist = radius;
  npcs.forEach(npc => {
    const pos = _zoneNpcWorldPos(npc);
    const dx = wx - pos.x, dy = wy - pos.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    if(d < closestDist){ closest = npc; closestDist = d; }
  });
  return closest;
}

// Draw all zone NPCs for the current zone.
function drawZoneNPCs(now){
  const npcs = _getActiveZoneNpcs();
  if(!npcs.length) return;
  const nearby = getNearbyZoneNpc();
  npcs.forEach(npc => {
    const pos = _zoneNpcWorldPos(npc);
    // Cull off-screen
    const halfVW = W/(2*WORLD_ZOOM), halfVH = H/(2*WORLD_ZOOM);
    if(pos.x < camX - halfVW - 60 || pos.x > camX + halfVW + 60) return;
    if(pos.y < camY - halfVH - 60 || pos.y > camY + halfVH + 60) return;
    // Quest indicator — golden "!" above NPC if they have an available quest.
    // Used to be always shown; now we check via questGiverHasWork().
    const hasWork = (typeof questGiverHasWork === 'function') ? questGiverHasWork(npc.id) : true;
    // Draw NPC figure
    drawCampNpcFigure(npc, pos, now);
    // Floating "!" / "?" indicator
    if(hasWork.available > 0 || hasWork.turnIn > 0){
      const bob = Math.sin(now*0.003 + npc.x*0.01) * 2.5;
      const markY = pos.y - 55 + bob;
      const markColor = hasWork.turnIn > 0 ? '#fbbf24' : '#c4b5fd';
      const markChar = hasWork.turnIn > 0 ? '?' : '!';
      ctx.save();
      ctx.shadowColor = markColor;
      ctx.shadowBlur = 10;
      ctx.font = 'bold 22px "Cinzel", serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = markColor;
      ctx.fillText(markChar, pos.x, markY);
      ctx.restore();
    }
    // Name label when not hovering nearby
    if(nearby !== npc){
      const labelY = pos.y - 46;
      ctx.font = '600 10px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(220,210,240,0.7)';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 3;
      ctx.fillText(npc.name, pos.x, labelY);
      ctx.shadowBlur = 0;
    } else {
      // Nearby — show a "Press E / Tap" prompt
      const labelY = pos.y - 56;
      ctx.font = '600 11px Cinzel, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c4b5fd';
      ctx.shadowColor = '#8b5cf6';
      ctx.shadowBlur = 6;
      ctx.fillText(npc.name, pos.x, labelY);
      ctx.font = '600 9px Cinzel, serif';
      ctx.fillStyle = '#fde68a';
      ctx.fillText('▸ TAP / E TO TALK', pos.x, labelY + 14);
      ctx.shadowBlur = 0;
    }
  });
  ctx.textAlign = 'start';
}

// E keypress handler — opens zone NPC dialogue when nearby.
function handleZoneNpcInteraction(){
  const npc = getNearbyZoneNpc();
  if(!npc) return false;
  if(typeof openZoneNpcDialogue === 'function'){
    openZoneNpcDialogue(npc);
    return true;
  }
  return false;
}

// Zone travel overlay — shown when player interacts with Marken.
// A modal listing each zone with its level requirement and a teleport button.
function openZoneTravelScreen(){
  let overlay = document.getElementById('zoneTravelOverlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'zoneTravelOverlay';
    overlay.className = 'panel';
    overlay.style.cssText = 'display:flex;flex-direction:column;z-index:450;';
    document.body.appendChild(overlay);
  }
  const zonesHtml = ZONES.map(z => {
    const locked = player.level < (z.minLv||0);
    const cls = locked ? 'zt-card zt-locked' : 'zt-card';
    const btnCls = locked ? 'zt-btn zt-btn-locked' : 'zt-btn';
    const btnText = locked ? `Requires LV ${z.minLv}` : '► Travel';
    return `
      <div class="${cls}" style="border-color:${z.ambColor}55">
        <div class="zt-tier" style="color:${z.ambColor}">${z.tier}</div>
        <div class="zt-name">${z.name}</div>
        <div class="zt-minlv">Minimum level ${z.minLv || 1}</div>
        <button class="${btnCls}" data-zone="${z.id}" ${locked?'disabled':''}
                style="${!locked?`color:${z.ambColor};border-color:${z.ambColor}88;`:''}">
          ${btnText}
        </button>
      </div>`;
  }).join('');
  overlay.innerHTML = `
    <div class="panel-header">
      <h2 style="color:#d4a555">✦ PATHFINDER</h2>
      <button class="panel-close" onclick="document.getElementById('zoneTravelOverlay').style.display='none'">← BACK</button>
    </div>
    <div style="padding:20px;max-width:900px;width:100%;margin:0 auto">
      <div class="zt-preface">Marken traces a finger across his compass:</div>
      <div class="zt-flavor">"Where do you need to be?"</div>
      <div class="zt-grid">${zonesHtml}</div>
    </div>
  `;
  overlay.style.display = 'flex';
  // Wire up travel buttons
  overlay.querySelectorAll('.zt-btn:not(.zt-btn-locked)').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const zoneId = btn.getAttribute('data-zone');
      overlay.style.display = 'none';
      travelToZone(zoneId);
    });
  });
}

// Auto-zone-transition on level up. With the new camp model, the player
// chooses their zone explicitly via Marken the Pathfinder, so this function
// only has work to do when called from a non-camp zone (e.g. after a level-up
// in the Ashen Wastes, we don't force-move them to Bone Crypts). In practice
// this is now a near no-op — kept for compat with existing call sites.
function checkZone(){
  // Never auto-transition out of camp — player explicitly travels via Marken
  if(curZone?.isCamp) return;
  // Respect player's current zone choice. Only auto-upgrade if they're in
  // a zone whose min-level they've far exceeded AND they've never visited a higher one.
  // For session 1, no auto-transition at all — let the player return to camp
  // and pick their next zone deliberately.
}

// Menu button wrapper — called by the CAMP button in the HUD.
// No confirm if already in camp (just flash a hint).
function returnToCamp(){
  if(curZone?.isCamp){
    addFeed('You are already at the Procession', '#c4b8dd');
    return;
  }
  travelToCamp();
}

// Travel from camp to a named zone. Called by Marken's interaction.
// Sets curZone to the target, regenerates environment, spawns enemies.
function travelToZone(zoneId){
  const target = ZONES.find(z => z.id === zoneId);
  if(!target){ addFeed('Unknown destination','#ef4444'); return; }
  // Confirm player meets minimum level
  if(player.level < (target.minLv||0)){
    addFeed(`Too weak. Need LV ${target.minLv}`, '#ef4444');
    return;
  }
  curZone = target;
  zoneTransiting = true;
  SFX.zoneChange();
  if(typeof switchAmbientZone==='function') switchAmbientZone(target.id);
  showZTrans(target.name, target.tier, target.ambColor);
  // Clear world state — no camp-fire lingering into combat zone
  enemies = [];
  particles.length = 0;
  groundFX.length = 0;
  if(typeof portals !== 'undefined') portals.length = 0;
  generateEnvironment();
  // Place player at world center for a clean start in the new zone
  player.x = WORLD_W/2;
  player.y = WORLD_H/2;
  camX = player.x; camY = player.y;
  const clear = findClearPosition(player.x, player.y, 24);
  player.x = clear.x; player.y = clear.y;
  setAfkWaypoint();
  // Stagger initial spawns
  for(let i=0;i<8;i++) trackTimeout(()=>spawnEnemy(), i*350);
  addFeed('★ ZONE: ' + target.name, '#e8b84b');
  if(typeof writeSave==='function') writeSave();
  setTimeout(()=>zoneTransiting=false, 2600);
  // Refresh AFK toggle UI — it shows differently in camp vs combat zones
  if(typeof updateAfkToggleUI === 'function') updateAfkToggleUI();
  // Quest system hook — advance reach_zone objectives
  if(typeof questOnZoneEnter === 'function') questOnZoneEnter(target.id);
  // Refresh quest HUD — tracker hides in camp, shows in combat
  if(typeof updateQuestHUDTracker === 'function') updateQuestHUDTracker();
}

// Travel back to The Procession camp from any zone
function travelToCamp(){
  curZone = CAMP_ZONE;
  zoneTransiting = true;
  SFX.zoneChange();
  if(typeof switchAmbientZone==='function') switchAmbientZone('procession');
  showZTrans(CAMP_ZONE.name, CAMP_ZONE.tier, CAMP_ZONE.ambColor);
  // Clear world state
  enemies = [];
  particles.length = 0;
  groundFX.length = 0;
  if(typeof portals !== 'undefined') portals.length = 0;
  if(typeof bossTarget !== 'undefined') bossTarget = null;
  if(typeof dungeonState !== 'undefined' && dungeonState) dungeonState.active = false;
  generateEnvironment();
  // Place player at the camp's spawn point (south of campfire)
  player.x = WORLD_W/2 + CAMP_SPAWN_POINT.x;
  player.y = WORLD_H/2 + CAMP_SPAWN_POINT.y;
  camX = player.x; camY = player.y;
  setAfkWaypoint();
  addFeed('★ ' + CAMP_ZONE.name, CAMP_ZONE.ambColor);
  if(typeof writeSave==='function') writeSave();
  setTimeout(()=>zoneTransiting=false, 2600);
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
  // Minimap disabled — see index.html. Function kept as no-op so any
  // legacy call sites don't error.
  return;
}

// ═══════ SPRITE PRELOAD ═════════════════════════════════════
// DISABLED — sprite system paused pending future revisit. When ready to
// re-enable sprites: uncomment the block below and re-enable rendering in
// drawEnvironment() and buildPropSpatialGrid().
// loadSprites().then(() => {
//   console.log(`[sprites] ${spritesLoaded} loaded, ${spritesFailed} failed of ${spritesTotal}`);
// });
