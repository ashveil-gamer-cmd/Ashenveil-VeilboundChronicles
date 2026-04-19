// ═══════ ASHENVEIL SYSTEMS (Gear + Professions) ═══════

// ═══════ GEAR SYSTEM ═════════════════════════════════════
const GEAR_SLOTS=['Weapon','Helmet','Chest','Gloves','Boots','Belt','Ring','Amulet'];
let equipped={Weapon:null,Helmet:null,Chest:null,Gloves:null,Boots:null,Belt:null,Ring:null,Amulet:null};

const ITEM_POOL=[
  {name:'Veil Staff',slot:'Weapon',rarity:'rare',stats:{sm:8,atk:12},setName:'Dirge of Hollows',setPiece:1},
  {name:'Pale Hood',slot:'Helmet',rarity:'uncommon',stats:{hp:80,sm:4}},
  {name:'Hollow Robes',slot:'Chest',rarity:'rare',stats:{hp:140,res:3}},
  {name:'Ashen Gloves',slot:'Gloves',rarity:'common',stats:{atk:6,crit:2}},
  {name:'Veilbound Cowl',slot:'Helmet',rarity:'rare',stats:{hp:180,sm:12},setName:'Dirge of Hollows',setPiece:2},
  {name:'Haunted Vestments',slot:'Chest',rarity:'epic',stats:{hp:240,spiritBonus:1},setName:'Dirge of Hollows',setPiece:3},
  {name:'Pale Grasp',slot:'Gloves',rarity:'rare',stats:{sm:8,crit:8},setName:'Dirge of Hollows',setPiece:4},
  {name:'Dirge Treads',slot:'Boots',rarity:'rare',stats:{hp:100,cdr:10},setName:'Dirge of Hollows',setPiece:5},
  {name:'Soulthread Belt',slot:'Belt',rarity:'uncommon',stats:{hp:60,lifeOnHit:5}},
  {name:'Hollow Ring',slot:'Ring',rarity:'rare',stats:{sm:6,atk:8}},
  {name:'Veil Pendant',slot:'Amulet',rarity:'epic',stats:{sm:14,crit:6}},
  {name:'Wraith Conduit',slot:'Weapon',rarity:'epic',stats:{sm:16,atk:18,spiritBonus:2},setName:'Dirge of Hollows',setPiece:0},
];
const SET_BONUSES={
  'Dirge of Hollows':{
    2:{desc:'Spirit bond cap +2',apply:()=>{player.maxBonds=(player.maxBonds||5)+2;}},
    3:{desc:'Spirits explode on death',apply:()=>{}},
    4:{desc:'Raise summons 2 spirits',apply:()=>{}},
    5:{desc:'HOLLOW SURGE: 7+ spirits → Echo 500% DMG',apply:()=>{}},
  }
};
function getSetPieceCount(sn){return Object.values(equipped).filter(i=>i&&i.setName===sn).length;}
// Rarity-based stat multiplier. Applied at roll time so gear upgrades feel
// transformative — a legendary piece is genuinely ~2x stronger than a common
// one, not +15%. This makes gear the primary damage/survival lever in the
// idle progression model (level gives passive speed; gear gives power).
const RARITY_STAT_MULT={
  common:    1.0,
  uncommon:  1.35,
  rare:      1.75,
  epic:      2.3,
  legendary: 3.0,
  mythic:    4.0,
};

// Scale an item's stats by a multiplier, rounding to sensible integers.
// Returns a new stats object; doesn't mutate the input.
function scaleItemStats(stats, mult){
  const out = {};
  for(const [key, val] of Object.entries(stats || {})){
    if(typeof val !== 'number'){ out[key] = val; continue; }
    // Small percent-like stats (crit, cdr, res) scale less aggressively so
    // they stay in a believable range. Big stats (hp, atk, sm) scale full.
    const smallStat = ['crit','cdr','res','moveSpdPct','critDmgPct'].includes(key);
    const scaled = smallStat ? val * (1 + (mult - 1) * 0.5) : val * mult;
    out[key] = Math.max(1, Math.round(scaled));
  }
  return out;
}

// ═══════ GEAR UPGRADE SYSTEM ═══════════════════════════════════
// Every item can be upgraded +1/+2/+3 to boost its stats by 15% per tier.
// Upgrades cost Scrap + Ether Dust (higher rarities cost more).
// This creates a meaningful long-term sink for salvaged materials and
// makes every piece of gear progressable — not just replaceable.
const MAX_UPGRADE_LEVEL = 3;
const UPGRADE_STAT_MULT = 0.15; // +15% stats per upgrade level

// Cost table — scales by rarity (better items cost more to upgrade).
// Lookup: UPGRADE_COST[rarity][targetLevel] = {scrap, etherDust, runecore?, soulbond?}
const UPGRADE_COST = {
  uncommon: {
    1: {scrap: 6,  etherDust: 1},
    2: {scrap: 12, etherDust: 3},
    3: {scrap: 20, etherDust: 6},
  },
  rare: {
    1: {scrap: 10, etherDust: 3},
    2: {scrap: 20, etherDust: 8,  runecore: 1},
    3: {scrap: 35, etherDust: 15, runecore: 3},
  },
  epic: {
    1: {scrap: 18, etherDust: 8,  runecore: 1},
    2: {scrap: 30, etherDust: 18, runecore: 3},
    3: {scrap: 50, etherDust: 30, runecore: 6, soulbond: 1},
  },
  legendary: {
    1: {scrap: 30, etherDust: 15, runecore: 3, soulbond: 1},
    2: {scrap: 50, etherDust: 30, runecore: 6, soulbond: 2},
    3: {scrap: 80, etherDust: 50, runecore: 12, soulbond: 4},
  },
  mythic: {
    1: {scrap: 50, etherDust: 30, runecore: 6,  soulbond: 2},
    2: {scrap: 80, etherDust: 50, runecore: 12, soulbond: 5},
    3: {scrap:120, etherDust: 80, runecore: 25, soulbond:10},
  },
};

// Returns the cost to upgrade this item to the next level, or null if it
// can't be upgraded further (already +3 or not upgradeable rarity).
function getUpgradeCost(item){
  if(!item) return null;
  const currentLevel = item.upgradeLevel || 0;
  if(currentLevel >= MAX_UPGRADE_LEVEL) return null;
  const targetLevel = currentLevel + 1;
  const rarityCosts = UPGRADE_COST[item.rarity];
  if(!rarityCosts) return null; // commons can't be upgraded (they auto-salvage anyway)
  return rarityCosts[targetLevel] || null;
}

// Returns true if the player has enough materials to upgrade this item.
function canAffordUpgrade(item){
  const cost = getUpgradeCost(item);
  if(!cost) return false;
  // Materials are shared across all professions (same value stored in each),
  // so just check against Weaponsmith's materials table.
  const mats = (professions.Weaponsmith && professions.Weaponsmith.materials) || {};
  for(const [mat, qty] of Object.entries(cost)){
    if((mats[mat] || 0) < qty) return false;
  }
  return true;
}

// Returns a preview of what the item's stats will look like at the next level.
// Used by UI to show "+X atk" hints before player confirms.
function previewUpgradedStats(item){
  const currentLevel = item.upgradeLevel || 0;
  if(currentLevel >= MAX_UPGRADE_LEVEL) return null;
  // Base stats (without any upgrade bonus) live in item.baseStats if it was
  // previously upgraded. Otherwise item.stats IS the base.
  const base = item.baseStats || item.stats;
  const targetMult = 1 + (currentLevel + 1) * UPGRADE_STAT_MULT;
  return scaleItemStats(base, targetMult);
}

// Execute the upgrade on an item. Finds the item in equipped or inventory,
// deducts materials, increments upgradeLevel, rebuilds stats from baseStats,
// awards profession XP, recalcs player stats if equipped.
// Returns {ok: true} on success, {ok: false, reason} on failure.
function upgradeItem(item){
  if(!item) return {ok:false, reason:'No item'};
  const cost = getUpgradeCost(item);
  if(!cost) return {ok:false, reason:'Cannot upgrade further'};
  if(!canAffordUpgrade(item)) return {ok:false, reason:'Not enough materials'};
  // Deduct cost from all profession material pools (they share values)
  Object.values(professions).forEach(p=>{
    for(const [mat, qty] of Object.entries(cost)){
      p.materials[mat] = Math.max(0, (p.materials[mat] || 0) - qty);
    }
  });
  // Save original base stats the first time so we can re-apply multipliers cleanly
  if(!item.baseStats){
    item.baseStats = {...item.stats};
  }
  // Bump upgrade level and rebuild stats from base
  item.upgradeLevel = (item.upgradeLevel || 0) + 1;
  const newMult = 1 + item.upgradeLevel * UPGRADE_STAT_MULT;
  item.stats = scaleItemStats(item.baseStats, newMult);
  // Award Weaponsmith profession XP proportional to rarity
  const upgradeXP = {uncommon:20, rare:50, epic:120, legendary:300, mythic:600}[item.rarity] || 20;
  addProfXP('Weaponsmith', upgradeXP);
  // If the item is equipped, recalc player stats
  const equipSlotKey = Object.keys(equipped).find(k => equipped[k] === item);
  if(equipSlotKey && typeof recalcStats === 'function') recalcStats();
  addFeed(`⚒ ${item.name} upgraded to +${item.upgradeLevel}`, RARITY_COLORS[item.rarity] || '#f59e0b');
  if(typeof checkSetBonuses === 'function') checkSetBonuses();
  if(typeof writeSave === 'function') writeSave();
  if(typeof renderInventory === 'function') renderInventory();
  if(typeof renderGear === 'function') renderGear();
  return {ok:true};
}

// Format an item's display name including upgrade level.
// "Bone-Hilt Sword +2" — used throughout the UI.
function itemDisplayName(item){
  if(!item) return '';
  const up = item.upgradeLevel || 0;
  return up > 0 ? `${item.name} +${up}` : item.name;
}

function rollLoot(level){
  // Tier is driven by level. Slowed again based on feedback.
  // Tier 0 (lv 1-19):  common + uncommon, rare case
  // Tier 1 (lv 20-39): uncommon + rare
  // Tier 2 (lv 40-59): rare + epic
  // Tier 3 (lv 60-79): epic + legendary
  // Tier 4 (lv 80+):   legendary + mythic
  const tierIdx=Math.min(Math.floor(level/20),4);
  const rarities=['common','uncommon','rare','epic','legendary'];
  // Weighted pick within the 2 rarities near this tier.
  // Bias HEAVILY toward the LOWER rarity (80%) so upgrades feel rare.
  const weightedRoll = Math.random();
  const rarityIdx = weightedRoll < 0.8 ? tierIdx : Math.min(tierIdx+1, 4);
  const rarity = rarities[rarityIdx];
  // Rarity bleed — 1.5% chance to pull from any rarity in the pool.
  // Very rare surprise drops remain possible but don't flood early game.
  const filtered=ITEM_POOL.filter(i=>i.rarity===rarity||Math.random()<0.015);
  const base = filtered.length?filtered[Math.floor(Math.random()*filtered.length)]:ITEM_POOL[Math.floor(Math.random()*ITEM_POOL.length)];
  // Build the rolled item — start from the template, apply rarity-based stat
  // scaling and a small level-based scaling bonus so higher-level drops are
  // meaningfully stronger.
  const levelBonus = 1 + Math.max(0, level - 1) * 0.03; // +3% per level past 1
  const rarityMult = (RARITY_STAT_MULT[base.rarity] || 1.0);
  const totalMult = rarityMult * levelBonus;
  return {
    ...base,
    stats: scaleItemStats(base.stats, totalMult),
  };
}
// Rarity color palette — single source of truth used by all gear UI
const RARITY_COLORS={common:'#9ca3af',uncommon:'#22c55e',rare:'#60a5fa',epic:'#c084fc',legendary:'#f59e0b',mythic:'#ff6b6b'};
const RARITY_LABELS={common:'COMMON',uncommon:'UNCOMMON',rare:'RARE',epic:'EPIC',legendary:'LEGENDARY',mythic:'MYTHIC'};

// Icon for each gear slot — used in gear panel and drop notifications
const SLOT_ICONS={Weapon:'⚔',Helmet:'🜲',Chest:'🛡',Gloves:'✋',Boots:'👞',Belt:'᎓',Ring:'○',Amulet:'◈'};

// ═══════ INVENTORY SYSTEM ═══════════════════════════════════
// 24-slot bag that receives drops when the equipment slot is already filled.
// - First-drop auto-equip: if the equip slot is empty, item goes straight to gear.
// - Subsequent drops accumulate in the bag until the player reviews them.
// - Rare+ discards require confirmation so legendaries can't be accidentally trashed.
// - Inventory persists through save/load (handled by buildSave/applySave in game.js).
const INVENTORY_MAX=24;
let inventory=[]; // array of full item objects

// Called by combat drop logic. Routes loot through the right pipeline.
// - Common items: ALWAYS auto-salvage into Scrap (never clutter bag)
// - Uncommon+: auto-equip if slot empty, otherwise go to bag
// - If bag is full, uncommons also auto-salvage silently; rare+ warns
// This keeps the bag for meaningful decisions only and turns AFK farming
// into a steady stream of Scrap for upgrades.
function acquireLoot(item){
  const current=equipped[item.slot];
  const col=RARITY_COLORS[item.rarity]||'#9ca3af';
  const label=RARITY_LABELS[item.rarity]||'ITEM';
  const icon=SLOT_ICONS[item.slot]||'✦';
  const rarityTier={common:0,uncommon:1,rare:2,epic:3,legendary:4,mythic:5}[item.rarity]||0;

  // Commons always auto-salvage — they never go in bag or equip
  // (still useful for feeding Scrap for upgrades)
  if(rarityTier === 0){
    const yields = salvageYieldFor(item);
    Object.entries(yields).forEach(([mat,qty])=>creditMaterial(mat,qty));
    // Small XP even from common auto-salvage
    Object.keys(professions).forEach(p=>addProfXP(p, 2));
    const gained=Object.entries(yields).map(([k,v])=>`+${v} ${MATERIAL_LABELS[k]}`).join(' ');
    // Quieter feed message — this happens a lot
    addFeed(`• ${gained}`, '#6b7280');
    if(typeof writeSave==='function')writeSave();
    return;
  }

  if(!current){
    // Slot empty — auto-equip for frictionless early game / first drops
    equipped[item.slot]=item;
    recalcStats();
    addFeed(`${icon} [${label}] ${item.name}`,col);
    addFeed(`  └ auto-equipped (${item.slot} was empty)`,'#5a7aa0');
    checkSetBonuses();
  } else if(inventory.length<INVENTORY_MAX){
    // Slot filled — goes to bag for player to decide
    inventory.push(item);
    addFeed(`${icon} ${label} ${item.name} → bag (${inventory.length}/${INVENTORY_MAX})`,col);
    updateInventoryBadge();
  } else {
    // Bag full — behavior depends on rarity
    if(rarityTier<=1){
      // Uncommon — auto-salvage silently into materials so AFK doesn't waste them
      const yields=salvageYieldFor(item);
      Object.entries(yields).forEach(([mat,qty])=>creditMaterial(mat,qty));
      // Small profession XP even from auto-salvage so AFK contributes to crafting
      const salvageXP = {uncommon:10}[item.rarity] || 5;
      Object.keys(professions).forEach(p=>addProfXP(p, salvageXP));
      const gained=Object.entries(yields).map(([k,v])=>`+${v} ${MATERIAL_LABELS[k]}`).join(' ');
      addFeed(`⚒ Bag full — auto-salvaged ${item.name} (${gained})`,'#a78bfa');
    } else {
      // Rare+ — warn player loud and clear, do NOT consume (they deserve a decision)
      addFeed(`⚠ BAG FULL — ${label} ${item.name} LOST! Clear space in your bag!`,'#ef4444');
      // Emergency pop-up via a ground FX so player notices mid-AFK
      if(typeof pushGroundFX==='function'&&typeof player!=='undefined'){
        pushGroundFX({type:'bloom',x:player.x,y:player.y,r:200,maxR:200,color:'#ef4444',life:1.2,maxLife:1.2});
      }
    }
  }
}

// Tapping EQUIP in the tooltip: swap bag item into slot, move old equipped to bag.
function equipFromBag(invIndex){
  const item=inventory[invIndex];
  if(!item)return;
  const oldItem=equipped[item.slot];
  equipped[item.slot]=item;
  inventory.splice(invIndex,1);
  if(oldItem&&inventory.length<INVENTORY_MAX){
    inventory.push(oldItem);
  }
  recalcStats();
  checkSetBonuses();
  const col=RARITY_COLORS[item.rarity]||'#9ca3af';
  addFeed(`✦ Equipped ${item.name}`,col);
  if(typeof writeSave==='function')writeSave();
  updateInventoryBadge();
  renderInventory();
}

// Tapping DISCARD in the tooltip: remove from bag permanently.
// Rare+ items trigger a confirmation so legendaries aren't accidentally trashed.
function discardFromBag(invIndex){
  const item=inventory[invIndex];
  if(!item)return;
  const rarityTier={common:0,uncommon:1,rare:2,epic:3,legendary:4,mythic:5}[item.rarity]||0;
  if(rarityTier>=2){
    if(!confirm(`Discard ${item.name}?\n\nThis ${RARITY_LABELS[item.rarity]||'item'} cannot be recovered.`))return;
  }
  inventory.splice(invIndex,1);
  // Offer rare+ discards as buyback in the shop (double price)
  if(typeof queueBuyback==='function'&&rarityTier>=2)queueBuyback(item);
  addFeed(`✗ Discarded ${item.name}`,'#6b4d8a');
  if(typeof writeSave==='function')writeSave();
  updateInventoryBadge();
  renderInventory();
}

// Legacy entry point — existing code (loot drops, dungeon rewards) calls tryEquip.
// Route it through the new acquireLoot so everything respects inventory rules.
function tryEquip(item){acquireLoot(item);}

// Updates the "X" count badge on the BAG menu button.
function updateInventoryBadge(){
  const btn=document.querySelector('[data-menu="bag"]');
  if(!btn)return;
  const existing=btn.querySelector('.menu-btn-badge');
  if(inventory.length>0){
    if(existing){
      existing.textContent=inventory.length;
    } else {
      const b=document.createElement('span');
      b.className='menu-btn-badge';
      b.textContent=inventory.length;
      btn.appendChild(b);
    }
  } else if(existing){
    existing.remove();
  }
}

// ═══════ STAT DISPLAY + UPGRADE CLASSIFICATION ═════════════════════
// Uses the STAT_LABELS + formatStat helpers defined below for consistent stat names.

// Returns the raw stats on an item as tooltip lines. Used when NO item is equipped
// in that slot yet — show what the item IS, not what it adds over nothing.
function computeStatLines(item){
  const lines=[];
  Object.entries(item.stats||{}).forEach(([k,v])=>{
    if(!v)return;
    const label=(typeof STAT_LABELS!=='undefined'?STAT_LABELS[k]:null)||k;
    lines.push({text:`+${v} ${label}`, color:'#d4c896'});
  });
  return lines;
}

// Compare a bag item's stats to what's equipped. Returns diff lines for tooltip.
function computeStatDiff(item){
  const current=equipped[item.slot];
  const lines=[];
  const allKeys=new Set([...Object.keys(item.stats||{}),...(current?Object.keys(current.stats||{}):[])]);
  allKeys.forEach(k=>{
    const newVal=item.stats[k]||0;
    const oldVal=current?(current.stats[k]||0):0;
    const diff=newVal-oldVal;
    if(diff===0 && newVal===0)return;
    const label=(typeof STAT_LABELS!=='undefined'?STAT_LABELS[k]:null)||k;
    const sign=diff>=0?'+':'';
    const col=diff>0?'#22c55e':(diff<0?'#ef4444':'#9ca3af');
    lines.push({text:`${sign}${diff} ${label}`, color:col});
  });
  return lines;
}

// Classify whether a bag item would be an upgrade, sidegrade, or downgrade vs equipped.
// Returns: 'upgrade' | 'sidegrade' | 'downgrade' | 'empty-slot'
// Logic: sum weighted stat values. Weights reflect Hollowcaller priorities
// (Soul Mastery > HP > Attack > Crit). Stat weight table kept small so it's tunable.
const STAT_WEIGHTS = {
  sm:2.5, atk:1.2, hp:0.2, crit:1.5, cdr:2.0, res:0.8,
  lifeOnHit:1.8, spiritBonus:3.0,
};
function classifyBagItem(item){
  const current=equipped[item.slot];
  if(!current)return 'empty-slot';
  const score = stats => Object.entries(stats||{}).reduce((s,[k,v])=>s+v*(STAT_WEIGHTS[k]||1), 0);
  const newScore = score(item.stats);
  const oldScore = score(current.stats);
  if(newScore > oldScore * 1.08) return 'upgrade';
  if(newScore < oldScore * 0.92) return 'downgrade';
  return 'sidegrade';
}

// ═══════ SALVAGE SYSTEM ══════════════════════════════════════════════
// Converts bag items into profession materials. Rarity determines material
// type + quantity. Materials flow into existing professions system so salvage
// is meaningful and not just "delete but with a different name."
const SALVAGE_YIELDS = {
  common:     { scrap:1 },
  uncommon:   { scrap:2 },
  rare:       { scrap:2, etherDust:1 },
  epic:       { etherDust:2, runecore:1 },
  legendary:  { runecore:2, soulbond:1 },
  mythic:     { runecore:3, soulbond:2 },
};
const MATERIAL_LABELS = {
  scrap:'Scrap Metal', etherDust:'Ether Dust',
  runecore:'Runecore', soulbond:'Soulbond Shard',
};
const MATERIAL_COLORS = {
  scrap:'#9ca3af', etherDust:'#60a5fa',
  runecore:'#c084fc', soulbond:'#f59e0b',
};

// Preview what a salvage would yield — used for tooltip display.
function salvageYieldFor(item){
  return SALVAGE_YIELDS[item.rarity] || {scrap:1};
}

// Execute salvage on a bag item. Removes from bag, credits materials + prof XP.
function salvageFromBag(invIndex){
  const item=inventory[invIndex];
  if(!item)return;
  const rarityTier={common:0,uncommon:1,rare:2,epic:3,legendary:4,mythic:5}[item.rarity]||0;
  // Rare+ still confirms — player might want to keep or sell via buyback
  if(rarityTier>=2){
    const yields=salvageYieldFor(item);
    const yieldSummary=Object.entries(yields).map(([k,v])=>`${v} ${MATERIAL_LABELS[k]}`).join(', ');
    if(!confirm(`Salvage ${item.name}?\n\nThis ${RARITY_LABELS[item.rarity]||'item'} will be broken down into: ${yieldSummary}`))return;
  }
  const yields=salvageYieldFor(item);
  Object.entries(yields).forEach(([mat,qty])=>{
    creditMaterial(mat, qty);
  });
  // Profession XP — scales with rarity. Salvage feeds ALL professions a little.
  const salvageXP = {common:5, uncommon:10, rare:25, epic:60, legendary:150, mythic:300}[item.rarity] || 5;
  Object.keys(professions).forEach(p=>addProfXP(p, salvageXP));
  inventory.splice(invIndex,1);
  const gained=Object.entries(yields).map(([k,v])=>`+${v} ${MATERIAL_LABELS[k]}`).join(' · ');
  addFeed(`⚒ Salvaged ${item.name} → ${gained} (+${salvageXP} prof XP)`,'#a78bfa');
  if(typeof writeSave==='function')writeSave();
  updateInventoryBadge();
  renderInventory();
}

// Credits materials to professions. All 3 professions share the same material
// pool so this just adds to all of them — each profession has its own copy of
// each material (no single shared pool) because save/load treats them per-prof.
function creditMaterial(material, qty){
  if(typeof professions==='undefined')return;
  Object.values(professions).forEach(p=>{
    if(!p.materials)p.materials={};
    p.materials[material] = (p.materials[material]||0) + qty;
  });
}

function recalcStats(){
  // Refresh aggregated talent bonuses first — all the layers below query them
  if(typeof computeTalentBonuses==='function')computeTalentBonuses();
  let sm=0,atk=0,hp=0,sb=0;
  Object.values(equipped).forEach(i=>{if(!i)return;if(i.stats.sm)sm+=i.stats.sm;if(i.stats.atk)atk+=i.stats.atk;if(i.stats.hp)hp+=i.stats.hp;if(i.stats.spiritBonus)sb+=i.stats.spiritBonus;});
  // Apply talent bonuses
  const hpPct=typeof getTalentBonus==='function'?getTalentBonus('hpPct'):0;
  const spiritCapBonus=typeof getTalentBonus==='function'?getTalentBonus('spiritCap'):0;
  player.soulMastery=sm; player.attack=computeAttack(player.level)+atk+sm*0.5;
  const baseMaxHp=computeMaxHp(player.level)+hp;
  player.maxHp=Math.floor(baseMaxHp*(1+hpPct/100));
  player.hp=Math.min(player.hp,player.maxHp);
  player.maxBonds=MAX_SPIRITS+sb+spiritCapBonus;
}
function checkSetBonuses(){
  const cnt=getSetPieceCount('Dirge of Hollows');
  const sp=document.getElementById('setProgress');
  if(cnt>0){sp.style.display='block';sp.innerHTML=`<div class="set-badge">✦ DIRGE ${cnt}/5</div>`;const b=SET_BONUSES['Dirge of Hollows'];if(b[cnt]){addFeed(`DIRGE ${cnt}PC: ${b[cnt].desc}`,'#f59e0b');}}
  else sp.style.display='none';
}
// Friendly stat labels — converts internal keys like "sm" to readable names like "Soul Mastery"
const STAT_LABELS={
  sm:'Soul Mastery',
  atk:'Attack Power',
  hp:'Max Health',
  res:'Resistance',
  crit:'Crit Chance',
  cdr:'Cooldown Reduction',
  lifeOnHit:'Life on Hit',
  spiritBonus:'Spirit Capacity',
};
const STAT_SUFFIX={crit:'%',cdr:'%',res:'%'}; // some stats are percentages

function formatStat(k,v){
  const label=STAT_LABELS[k]||k.toUpperCase();
  const suffix=STAT_SUFFIX[k]||'';
  const sign=v>=0?'+':'';
  return `${sign}${v}${suffix} ${label}`;
}

// ═══════ GEAR PANEL ═══════════════════════════════════════════════
// Interactive gear panel — shows all equipped items with rich tooltips,
// tap-to-interact buttons (MOVE TO BAG / SALVAGE), live set bonus tracking,
// and an aggregated stats summary. Matches the bag panel in polish.
let _gearSelectedSlot=null;

function openGear(){
  _gearSelectedSlot=null;
  renderGearPanel();
  document.getElementById('gearPanel').style.display='flex';
}
function closeGear(){
  _gearSelectedSlot=null;
  document.getElementById('gearPanel').style.display='none';
}

// Unequip an item into the bag. If bag is full and it's a rare+, warn.
function unequipToBag(slot){
  const item=equipped[slot];
  if(!item)return;
  if(inventory.length>=INVENTORY_MAX){
    addFeed(`⚠ Bag full — can't unequip ${item.name}`,'#ef4444');
    return;
  }
  inventory.push(item);
  equipped[slot]=null;
  recalcStats();
  checkSetBonuses();
  addFeed(`◇ ${item.name} → bag`,'#6b9acf');
  updateInventoryBadge();
  if(typeof writeSave==='function')writeSave();
  _gearSelectedSlot=null;
  renderGearPanel();
}

// Salvage a piece directly from equipped slots. Same rules/yields as bag salvage.
function salvageFromGear(slot){
  const item=equipped[slot];
  if(!item)return;
  const rarityTier={common:0,uncommon:1,rare:2,epic:3,legendary:4,mythic:5}[item.rarity]||0;
  if(rarityTier>=2){
    const yields=salvageYieldFor(item);
    const yieldSummary=Object.entries(yields).map(([k,v])=>`${v} ${MATERIAL_LABELS[k]}`).join(', ');
    if(!confirm(`Salvage equipped ${item.name}?\n\nYou will UNEQUIP and break down this ${RARITY_LABELS[item.rarity]||'item'} into: ${yieldSummary}`))return;
  }
  const yields=salvageYieldFor(item);
  Object.entries(yields).forEach(([mat,qty])=>creditMaterial(mat,qty));
  const salvageXP={common:5,uncommon:10,rare:25,epic:60,legendary:150,mythic:300}[item.rarity]||5;
  Object.keys(professions).forEach(p=>addProfXP(p,salvageXP));
  equipped[slot]=null;
  recalcStats();
  checkSetBonuses();
  const gained=Object.entries(yields).map(([k,v])=>`+${v} ${MATERIAL_LABELS[k]}`).join(' · ');
  addFeed(`⚒ Salvaged equipped ${item.name} → ${gained}`,'#a78bfa');
  if(typeof writeSave==='function')writeSave();
  _gearSelectedSlot=null;
  renderGearPanel();
}

// Computes a summary of aggregated stats from all equipped gear.
// Returns an array of {label, value, color} lines for rendering.
function computeEquippedStatsSummary(){
  const totals={};
  Object.values(equipped).forEach(item=>{
    if(!item||!item.stats)return;
    Object.entries(item.stats).forEach(([k,v])=>{
      totals[k]=(totals[k]||0)+v;
    });
  });
  return Object.entries(totals).map(([k,v])=>{
    const label=(typeof STAT_LABELS!=='undefined'?STAT_LABELS[k]:null)||k;
    const suffix=(typeof STAT_SUFFIX!=='undefined'?STAT_SUFFIX[k]:null)||'';
    return {label,value:`+${v}${suffix}`,color:'#d4c896'};
  });
}

// Computes active set bonus info — which sets are in progress, what bonuses
// are currently applying, and what the next tier would give.
function computeActiveSets(){
  const sets={};
  Object.values(equipped).forEach(item=>{
    if(!item||!item.setName)return;
    sets[item.setName]=(sets[item.setName]||0)+1;
  });
  return Object.entries(sets).map(([name,count])=>{
    const tiers=SET_BONUSES[name]||{};
    // Find active tier (highest tier <= count) and next tier
    const tierKeys=Object.keys(tiers).map(Number).sort((a,b)=>a-b);
    let activeTier=null, nextTier=null;
    tierKeys.forEach(t=>{
      if(t<=count)activeTier=t;
      else if(nextTier===null)nextTier=t;
    });
    return {
      name,
      count,
      maxPieces:5, // hardcoded for now — all sets are 5-piece
      activeTier,
      activeDesc:activeTier?tiers[activeTier].desc:null,
      nextTier,
      nextDesc:nextTier?tiers[nextTier].desc:null,
    };
  });
}

function renderGearPanel(){
  const slots=document.getElementById('gearSlots');
  if(!slots)return;
  slots.innerHTML='';

  // ── ACTIVE STATS SUMMARY ──
  const summary=computeEquippedStatsSummary();
  if(summary.length){
    const summaryCard=document.createElement('div');
    summaryCard.className='gear-summary';
    summaryCard.innerHTML=`
      <div class="gear-summary-label">TOTAL BONUSES FROM EQUIPMENT</div>
      <div class="gear-summary-grid">
        ${summary.map(s=>`
          <div class="gear-summary-stat">
            <span class="gear-summary-val" style="color:${s.color}">${s.value}</span>
            <span class="gear-summary-key">${s.label}</span>
          </div>
        `).join('')}
      </div>
    `;
    slots.appendChild(summaryCard);
  }

  // ── ACTIVE SET BONUSES ──
  const activeSets=computeActiveSets();
  if(activeSets.length){
    const setsCard=document.createElement('div');
    setsCard.className='gear-sets-card';
    setsCard.innerHTML=`
      <div class="gear-summary-label">SET BONUSES</div>
      ${activeSets.map(s=>`
        <div class="gear-set-row">
          <div class="gear-set-header">
            <span class="gear-set-name">◆ ${s.name}</span>
            <span class="gear-set-count">${s.count} / ${s.maxPieces}</span>
          </div>
          ${s.activeDesc?`<div class="gear-set-active">✓ ${s.activeTier}PC: ${s.activeDesc}</div>`:''}
          ${s.nextDesc?`<div class="gear-set-next">◇ ${s.nextTier}PC: ${s.nextDesc}</div>`:''}
        </div>
      `).join('')}
    `;
    slots.appendChild(setsCard);
  }

  // ── EQUIPMENT SLOTS ──
  const equipmentWrap=document.createElement('div');
  equipmentWrap.className='gear-slot-grid';
  GEAR_SLOTS.forEach(slot=>{
    const item=equipped[slot];
    const div=document.createElement('div');
    div.className='gear-slot';
    const slotIcon=SLOT_ICONS[slot]||'◇';
    if(item){
      const rarityCol=RARITY_COLORS[item.rarity]||'#9ca3af';
      const rarityLabel=RARITY_LABELS[item.rarity]||'';
      div.classList.add('has-item');
      div.style.borderLeft=`3px solid ${rarityCol}`;
      const statsHtml=Object.entries(item.stats||{})
        .map(([k,v])=>{
          const label=(typeof STAT_LABELS!=='undefined'?STAT_LABELS[k]:null)||k;
          const suffix=(typeof STAT_SUFFIX!=='undefined'?STAT_SUFFIX[k]:null)||'';
          return `<span class="gear-stat-row" style="color:#d4c896">+${v}${suffix} ${label}</span>`;
        })
        .join('');
      const setLine=item.setName
        ? `<div class="gear-set-line">◆ Part of ${item.setName} set</div>`
        : '';
      const craftedBadge=item.crafted?`<span class="gear-crafted-badge">⚒ CRAFTED</span>`:'';
      div.innerHTML=`
        <div class="gear-slot-header">
          <canvas class="gear-slot-icon-canvas" data-slot="${slot}" data-rarity="${item.rarity}" width="52" height="52"></canvas>
          <span class="gear-slot-name">${slot}</span>
          <span class="gear-rarity-tag" style="color:${rarityCol};border-color:${rarityCol}66;background:${rarityCol}22">${rarityLabel}</span>
        </div>
        <div class="gear-item-name" style="color:${rarityCol};text-shadow:0 0 8px ${rarityCol}44">${itemDisplayName(item)} ${craftedBadge}</div>
        <div class="gear-stats-block">${statsHtml}</div>
        ${setLine}
      `;
      // Render the gear icon into the canvas
      const iconCanvas = div.querySelector('.gear-slot-icon-canvas');
      if(iconCanvas && typeof drawGearIcon === 'function'){
        drawGearIcon(iconCanvas, slot, item.rarity);
      }
      // Click-to-select to reveal actions
      if(_gearSelectedSlot===slot){
        div.classList.add('selected');
        const actions=document.createElement('div');
        actions.className='gear-actions';
        // Base actions always available
        let actionsHtml=`
          <button class="gear-action-btn gear-action-move">◇ MOVE TO BAG</button>
        `;
        // Upgrade button — available for all upgradeable items
        const uCost=getUpgradeCost(item);
        if(UPGRADE_COST[item.rarity]){
          if(uCost){
            const canUp=canAffordUpgrade(item);
            const uCostText=Object.entries(uCost).map(([k,v])=>`${v} ${MATERIAL_LABELS[k]||k}`).join(', ');
            const upgradeTitle=canUp?`Upgrade to +${(item.upgradeLevel||0)+1} — ${uCostText}`:`Need: ${uCostText}`;
            actionsHtml+=`
              <button class="gear-action-btn gear-action-upgrade" ${canUp?'':'disabled'} title="${upgradeTitle}">▲ +${(item.upgradeLevel||0)+1}</button>
            `;
          } else if((item.upgradeLevel||0) >= MAX_UPGRADE_LEVEL){
            actionsHtml+=`
              <button class="gear-action-btn gear-action-upgrade" disabled title="Fully upgraded">▲ MAX</button>
            `;
          }
        }
        // Reforge button — only shown for crafted items
        if(item.crafted){
          const canReforgeThis=canReforge(item);
          const cost=reforgeCost(item);
          const costText=cost?Object.entries(cost).map(([k,v])=>`${v} ${MATERIAL_LABELS[k]||k}`).join(', '):'';
          const reforgeTitle=canReforgeThis
            ?`Reforge — ${costText}`
            :reforgeBlockReasons(item).join(' · ');
          actionsHtml+=`
            <button class="gear-action-btn gear-action-reforge" ${canReforgeThis?'':'disabled'} title="${reforgeTitle}">◈ REFORGE</button>
          `;
        }
        actionsHtml+=`
          <button class="gear-action-btn gear-action-salvage">⚒ SALVAGE</button>
        `;
        actions.innerHTML=actionsHtml;
        actions.querySelector('.gear-action-move').addEventListener('click',e=>{e.stopPropagation();unequipToBag(slot);});
        actions.querySelector('.gear-action-salvage').addEventListener('click',e=>{e.stopPropagation();salvageFromGear(slot);});
        // Upgrade wiring
        const upBtn=actions.querySelector('.gear-action-upgrade');
        if(upBtn && !upBtn.disabled){
          upBtn.addEventListener('click',e=>{
            e.stopPropagation();
            const it=equipped[slot];
            if(!it) return;
            const result=upgradeItem(it);
            if(!result.ok) addFeed(`⚠ ${result.reason}`, '#ef4444');
            else renderGearPanel();
          });
        }
        if(item.crafted){
          const reforgeBtn=actions.querySelector('.gear-action-reforge');
          if(reforgeBtn && !reforgeBtn.disabled){
            reforgeBtn.addEventListener('click',e=>{
              e.stopPropagation();
              // Confirm for rare+ since materials aren't cheap
              const rarityTier={common:0,uncommon:1,rare:2,epic:3,legendary:4,mythic:5}[item.rarity]||0;
              const cost=reforgeCost(item);
              const costText=Object.entries(cost).map(([k,v])=>`${v} ${MATERIAL_LABELS[k]||k}`).join(', ');
              if(rarityTier>=2){
                if(!confirm(`Reforge ${item.name}?\n\nThis will consume ${costText} and re-roll the stats.\n\nCurrent stats may become worse.`))return;
              }
              reforgeItem(item, ()=>renderGearPanel());
            });
          }
        }
        div.appendChild(actions);
      }
      div.addEventListener('click',()=>{
        _gearSelectedSlot=(_gearSelectedSlot===slot)?null:slot;
        renderGearPanel();
      });
    } else {
      div.innerHTML=`
        <div class="gear-slot-header">
          <span class="gear-slot-icon gear-slot-icon-empty">${slotIcon}</span>
          <span class="gear-slot-name">${slot}</span>
        </div>
        <div class="gear-empty">— Empty —</div>
      `;
    }
    equipmentWrap.appendChild(div);
  });
  slots.appendChild(equipmentWrap);
}

// ═══════ PROFESSION SYSTEM ═══════════════════════════════
// ═══════ PROFESSIONS ═══════════════════════════════════════════════
// Three profession specializations, each crafting a different gear category.
// Materials come from bag salvage (see salvageFromBag in the inventory section).
// Profession XP is earned from salvaging AND from crafting, creating a
// salvage → materials → craft → gear loop.
//
// Material flow (shared pool — any profession can use any material):
//   scrap        : every salvage yields this. Primarily used by Weaponsmith.
//   etherDust    : rare+ salvage. Primarily Armorer.
//   runecore    : epic+ salvage. Primarily Ritualist.
//   soulbond    : legendary+ only. Rare component for endgame crafts across all.
//
// Profession level determines which recipes are unlockable.
let professions={
  Weaponsmith:{level:1,xp:0,xpToNext:120,materials:{scrap:0,etherDust:0,runecore:0,soulbond:0}},
  Armorer:    {level:1,xp:0,xpToNext:120,materials:{scrap:0,etherDust:0,runecore:0,soulbond:0}},
  Ritualist:  {level:1,xp:0,xpToNext:120,materials:{scrap:0,etherDust:0,runecore:0,soulbond:0}},
};

// Recipes — structure:
//   profLv: profession level required to unlock
//   craftLv: base player level the crafted item scales to (uses current player level actually, but this tunes the rarity ceiling)
//   slot: gear slot the crafted item fills
//   rarity: the rarity of the crafted item
//   baseStats: weighted budget — the recipe's "stat personality"
//   cost: materials consumed
//
// Crafted items get random-ish stat values each craft, so re-crafting the same
// recipe gives you different rolls (ARPG-style).
const RECIPES={
  Weaponsmith:[
    {name:'Veilsteel Dagger',    profLv:1, rarity:'uncommon', slot:'Weapon', baseStats:{atk:14,crit:2}, cost:{scrap:4}},
    {name:'Bone-Hilt Sword',     profLv:3, rarity:'rare',     slot:'Weapon', baseStats:{atk:28,sm:6},    cost:{scrap:8,etherDust:2}},
    {name:'Wraith-Forged Blade', profLv:6, rarity:'rare',     slot:'Weapon', baseStats:{atk:36,crit:5,sm:4}, cost:{scrap:12,etherDust:4}},
    {name:'Obsidian Reaver',     profLv:10,rarity:'epic',     slot:'Weapon', baseStats:{atk:55,crit:8,sm:10}, cost:{scrap:20,etherDust:8,runecore:2}},
    {name:'Soulbound Scythe',    profLv:16,rarity:'legendary',slot:'Weapon', baseStats:{atk:85,crit:12,sm:18,lifeOnHit:4}, cost:{scrap:30,etherDust:15,runecore:6,soulbond:2}},
  ],
  Armorer:[
    {name:'Drifter\'s Cowl',     profLv:1, rarity:'uncommon', slot:'Helmet', baseStats:{hp:60,res:2},   cost:{scrap:3,etherDust:1}},
    {name:'Veilcloth Robes',     profLv:2, rarity:'uncommon', slot:'Chest',  baseStats:{hp:120,sm:4},   cost:{scrap:5,etherDust:2}},
    {name:'Bone-Plate Hauberk',  profLv:5, rarity:'rare',     slot:'Chest',  baseStats:{hp:200,res:6,atk:8}, cost:{scrap:8,etherDust:5}},
    {name:'Spirit-Weave Gloves', profLv:7, rarity:'rare',     slot:'Gloves', baseStats:{atk:14,crit:5,sm:6}, cost:{scrap:6,etherDust:4,runecore:1}},
    {name:'Reaver\'s Warplate',  profLv:12,rarity:'epic',     slot:'Chest',  baseStats:{hp:340,res:10,atk:14,sm:10}, cost:{scrap:15,etherDust:10,runecore:3}},
    {name:'Mantle of Undoing',   profLv:18,rarity:'legendary',slot:'Chest',  baseStats:{hp:520,res:15,atk:22,sm:22,lifeOnHit:6}, cost:{scrap:25,etherDust:18,runecore:8,soulbond:3}},
  ],
  Ritualist:[
    {name:'Whisperbound Ring',   profLv:1, rarity:'uncommon', slot:'Ring',   baseStats:{sm:8,crit:3},   cost:{scrap:2,etherDust:2}},
    {name:'Warden Sigil',        profLv:3, rarity:'rare',     slot:'Amulet', baseStats:{hp:80,sm:12,cdr:4}, cost:{scrap:4,etherDust:4,runecore:1}},
    {name:'Hollow Chain Belt',   profLv:5, rarity:'rare',     slot:'Belt',   baseStats:{hp:120,sm:8,spiritBonus:1}, cost:{scrap:6,etherDust:5,runecore:1}},
    {name:'Veilstep Boots',      profLv:8, rarity:'rare',     slot:'Boots',  baseStats:{hp:100,atk:10,crit:4}, cost:{scrap:6,etherDust:5,runecore:2}},
    {name:'Ring of Severance',   profLv:14,rarity:'epic',     slot:'Ring',   baseStats:{atk:22,crit:8,sm:14,lifeOnHit:3}, cost:{scrap:10,etherDust:10,runecore:5}},
    {name:'Soulwarden Amulet',   profLv:18,rarity:'legendary',slot:'Amulet', baseStats:{hp:250,sm:30,cdr:8,spiritBonus:2}, cost:{scrap:15,etherDust:15,runecore:8,soulbond:3}},
  ],
};

function addProfXP(n,amt){
  const p=professions[n]; if(!p)return;
  p.xp+=amt;
  while(p.xp>=p.xpToNext && p.level<20){
    p.xp-=p.xpToNext;
    p.level++;
    p.xpToNext=p.level*120;
    addFeed(`⚒ ${n} LV ${p.level}!`,'#9DC4B0');
  }
}

function canCraft(n,r){
  const m=professions[n].materials;
  return Object.entries(r.cost).every(([k,v])=>(m[k]||0)>=v) && professions[n].level>=r.profLv;
}

// Missing requirements for display — explains WHY a recipe is locked
function craftBlockReasons(n,r){
  const reasons=[];
  if(professions[n].level<r.profLv)reasons.push(`Requires ${n} LV ${r.profLv}`);
  const m=professions[n].materials;
  Object.entries(r.cost).forEach(([k,v])=>{
    const have=m[k]||0;
    if(have<v)reasons.push(`${v-have} more ${MATERIAL_LABELS[k]||k}`);
  });
  return reasons;
}

// Rolls stat values for a craft. Variance of ±20% around the recipe's baseStats,
// scaled up by player level so crafts at higher levels are stronger.
function rollCraftedStats(recipe){
  const lvFactor = 1 + Math.max(0, player.level-1) * 0.04; // +4% per level
  const stats={};
  Object.entries(recipe.baseStats).forEach(([k,base])=>{
    const variance = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
    stats[k] = Math.ceil(base * lvFactor * variance);
  });
  return stats;
}

function craft(n,r){
  if(!canCraft(n,r)){
    addFeed(`⚠ Cannot craft ${r.name}`,'#ef4444');
    return;
  }
  // Spend materials
  const m=professions[n].materials;
  Object.entries(r.cost).forEach(([k,v])=>{m[k]=(m[k]||0)-v;});
  // Craft XP — more for higher-tier recipes
  const xpReward = {uncommon:40, rare:80, epic:160, legendary:320}[r.rarity] || 40;
  addProfXP(n, xpReward);
  // Build the crafted item
  const crafted={
    name:r.name,
    slot:r.slot,
    rarity:r.rarity,
    stats:rollCraftedStats(r),
    crafted:true, // mark so we can show "crafted" label in tooltip
  };
  // Route through acquireLoot — handles empty-slot auto-equip vs. bag routing
  if(typeof acquireLoot==='function'){
    acquireLoot(crafted);
  } else {
    // Fallback for very old code paths
    tryEquip(crafted);
  }
  addFeed(`⚒ Crafted ${r.name} (+${xpReward} ${n} XP)`,'#9DC4B0');
  if(typeof writeSave==='function')writeSave();
  renderProfPanel();
}

// ═══════ REFORGE ═════════════════════════════════════════════════════
// Re-rolls stat values on a crafted item for material cost. Keeps name,
// slot, rarity — only stats change. Cost is ~60% of the original craft
// cost, making reforging a viable alternative to crafting a fresh piece
// but not free. Only works on items marked `crafted: true`.
// Which profession pays the cost depends on slot:
//   Weapon         → Weaponsmith
//   Helmet/Chest/Gloves → Armorer
//   Ring/Amulet/Belt/Boots → Ritualist

// Maps a slot name to the profession that handles it for reforging
function professionForSlot(slot){
  if(slot==='Weapon')return 'Weaponsmith';
  if(['Helmet','Chest','Gloves'].includes(slot))return 'Armorer';
  return 'Ritualist'; // Ring/Amulet/Belt/Boots
}

// Finds the original recipe for a crafted item by matching its name across all
// recipe lists. Returns null if item isn't from any recipe (e.g. drop-loot).
function findRecipeFor(item){
  if(!item||!item.crafted)return null;
  for(const profName of Object.keys(RECIPES)){
    const found=RECIPES[profName].find(r=>r.name===item.name);
    if(found)return {profName, recipe:found};
  }
  return null;
}

// Computes reforge cost for a crafted item. ~60% of original cost, rounded up,
// minimum of 1 of each material.
function reforgeCost(item){
  const lookup=findRecipeFor(item);
  if(!lookup)return null;
  const cost={};
  Object.entries(lookup.recipe.cost).forEach(([k,v])=>{
    cost[k]=Math.max(1,Math.ceil(v*0.6));
  });
  return cost;
}

// Whether an item can be reforged right now — must be crafted, recipe must exist,
// and the paying profession must have enough materials.
function canReforge(item){
  if(!item||!item.crafted)return false;
  const lookup=findRecipeFor(item);
  if(!lookup)return false;
  const cost=reforgeCost(item);
  const profName=professionForSlot(item.slot);
  const mats=professions[profName].materials;
  return Object.entries(cost).every(([k,v])=>(mats[k]||0)>=v);
}

// Missing requirements for display — explains WHY a reforge is blocked
function reforgeBlockReasons(item){
  if(!item||!item.crafted)return ['Only crafted items can be reforged'];
  const lookup=findRecipeFor(item);
  if(!lookup)return ['Recipe not found for this item'];
  const cost=reforgeCost(item);
  const profName=professionForSlot(item.slot);
  const mats=professions[profName].materials;
  const reasons=[];
  Object.entries(cost).forEach(([k,v])=>{
    const have=mats[k]||0;
    if(have<v)reasons.push(`${v-have} more ${MATERIAL_LABELS[k]||k}`);
  });
  return reasons;
}

// Executes the reforge on an item. Takes the item reference directly so it works
// whether the item is in the bag OR equipped — the caller just passes the object.
// Returns true on success, false on any failure.
function reforgeItem(item, onSuccess){
  if(!canReforge(item)){
    addFeed(`⚠ Cannot reforge ${item.name}`,'#ef4444');
    return false;
  }
  const lookup=findRecipeFor(item);
  const cost=reforgeCost(item);
  const profName=professionForSlot(item.slot);
  // Snapshot old stats for comparison feedback
  const oldStats={...item.stats};
  // Spend materials
  const mats=professions[profName].materials;
  Object.entries(cost).forEach(([k,v])=>{mats[k]=(mats[k]||0)-v;});
  // Small prof XP for reforging — feeds the "keep doing it" loop
  const xpReward={uncommon:15,rare:30,epic:60,legendary:120}[item.rarity]||15;
  addProfXP(profName, xpReward);
  // Roll new stats — note this MUTATES the item so equipped references stay valid
  item.stats=rollCraftedStats(lookup.recipe);
  // Compare total stat value to give the player a verdict
  const oldSum=Object.entries(oldStats).reduce((s,[k,v])=>s+v*(STAT_WEIGHTS[k]||1),0);
  const newSum=Object.entries(item.stats).reduce((s,[k,v])=>s+v*(STAT_WEIGHTS[k]||1),0);
  const delta=newSum-oldSum;
  const verdict = delta > oldSum*0.05 ? 'UPGRADED' : (delta < -oldSum*0.05 ? 'DOWNGRADED' : 'SIDEGRADED');
  const verdictCol = delta > 0 ? '#22c55e' : (delta < 0 ? '#ef4444' : '#9ca3af');
  addFeed(`◈ Reforged ${item.name} — ${verdict}`,verdictCol);
  // If the item is equipped, stats on player must be recalculated
  const isEquipped=Object.values(equipped).includes(item);
  if(isEquipped){
    recalcStats();
    checkSetBonuses();
  }
  if(typeof writeSave==='function')writeSave();
  if(onSuccess)onSuccess();
  return true;
}

function openProf(){renderProfPanel();document.getElementById('profPanel').style.display='flex';}
function closeProf(){document.getElementById('profPanel').style.display='none';}

// ═══════ SETTINGS PANEL ═══════════════════════════════════
function openSettings(){
  const panel = document.getElementById('settingsPanel');
  if(!panel) return;
  panel.style.display = 'flex';
  renderSettingsPanel();
}
function closeSettings(){
  const panel = document.getElementById('settingsPanel');
  if(panel) panel.style.display = 'none';
}

// Build the settings panel UI from current state each time it opens
function renderSettingsPanel(){
  // ─── Volume sliders ───
  const mv = typeof getMusicVolume === 'function' ? getMusicVolume() : 0.5;
  const sv = typeof getSfxVolume === 'function' ? getSfxVolume() : 0.6;
  const mSlider = document.getElementById('musicVolumeSlider');
  const sSlider = document.getElementById('sfxVolumeSlider');
  const mLabel = document.getElementById('musicVolumeLabel');
  const sLabel = document.getElementById('sfxVolumeLabel');
  if(mSlider){ mSlider.value = Math.round(mv * 100); }
  if(sSlider){ sSlider.value = Math.round(sv * 100); }
  if(mLabel){ mLabel.textContent = Math.round(mv * 100) + '%'; }
  if(sLabel){ sLabel.textContent = Math.round(sv * 100) + '%'; }
  // ─── Mute buttons ───
  const mMuteBtn = document.getElementById('musicMuteBtn');
  const sMuteBtn = document.getElementById('sfxMuteBtn');
  if(mMuteBtn){
    mMuteBtn.textContent = musicSettings.muted ? '🔇' : '🔊';
    mMuteBtn.classList.toggle('muted', !!musicSettings.muted);
  }
  if(sMuteBtn){
    sMuteBtn.textContent = musicSettings.sfxMuted ? '🔇' : '🔊';
    sMuteBtn.classList.toggle('muted', !!musicSettings.sfxMuted);
  }
  // ─── Shuffle toggle ───
  const shuffleEl = document.getElementById('shuffleToggle');
  if(shuffleEl) shuffleEl.checked = !!musicSettings.shuffle;
  // ─── Track playlist ───
  renderSettingsPlaylist();
  // ─── Now playing ───
  updateSettingsNowPlaying();
}

function renderSettingsPlaylist(){
  const container = document.getElementById('settingsPlaylist');
  const hint = document.getElementById('playlistHint');
  if(!container) return;
  container.innerHTML = '';
  const tracks = (typeof musicPlayer !== 'undefined' && musicPlayer.tracks) ? musicPlayer.tracks : [];
  if(!tracks.length){
    hint.textContent = 'No music tracks added yet. Upload MP3 files to the music/ folder in your repo and add them to the MUSIC_TRACKS list in audio.js. Procedural ambient music will play in the meantime.';
    return;
  }
  hint.textContent = 'Uncheck a track to skip it. Changes take effect on the next track.';
  const currentFile = musicPlayer.currentIdx >= 0 ? tracks[musicPlayer.currentIdx]?.file : null;
  tracks.forEach(track => {
    const row = document.createElement('div');
    row.className = 'settings-track-row';
    if(track.file === currentFile) row.classList.add('playing');
    if(track.loadError) row.classList.add('error');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = musicSettings.enabled[track.file] !== false;
    cb.onchange = () => {
      musicSettings.enabled[track.file] = cb.checked;
      if(typeof onPlaylistChanged === 'function') onPlaylistChanged();
      // Re-render so the "now playing" row updates if we skipped
      setTimeout(renderSettingsPlaylist, 200);
    };
    const label = document.createElement('span');
    label.className = 'settings-track-name';
    label.textContent = track.name + (track.loadError ? ' (failed to load)' : '');
    row.appendChild(cb);
    row.appendChild(label);
    container.appendChild(row);
  });
}

// Called whenever the currently-playing track changes, to update the "Now Playing" label
function updateSettingsNowPlaying(){
  const el = document.getElementById('nowPlayingTrack');
  if(!el) return;
  if(typeof musicPlayer === 'undefined' || musicPlayer.currentIdx < 0){
    // Procedural ambient or nothing
    if(typeof ambientState !== 'undefined' && ambientState.running){
      el.textContent = 'Procedural ambient (' + (ambientState.currentZoneId || 'zone') + ')';
    } else {
      el.textContent = '—';
    }
    return;
  }
  const track = musicPlayer.tracks[musicPlayer.currentIdx];
  el.textContent = track ? track.name : '—';
}

// ─── Event handlers for settings controls ───
function onMusicVolumeChange(val){
  const v = Math.max(0, Math.min(100, parseInt(val, 10))) / 100;
  if(typeof setMusicVolume === 'function') setMusicVolume(v);
  const label = document.getElementById('musicVolumeLabel');
  if(label) label.textContent = Math.round(v * 100) + '%';
  // If the user was muted, bumping the slider implicitly unmutes
  if(v > 0 && musicSettings.muted){
    musicSettings.muted = false;
    if(typeof setMusicMuted === 'function') setMusicMuted(false);
    const btn = document.getElementById('musicMuteBtn');
    if(btn){ btn.textContent = '🔊'; btn.classList.remove('muted'); }
  }
}
function onSfxVolumeChange(val){
  const v = Math.max(0, Math.min(100, parseInt(val, 10))) / 100;
  if(typeof setSfxVolume === 'function') setSfxVolume(v);
  const label = document.getElementById('sfxVolumeLabel');
  if(label) label.textContent = Math.round(v * 100) + '%';
  if(v > 0 && musicSettings.sfxMuted){
    musicSettings.sfxMuted = false;
    if(typeof setSfxMuted === 'function') setSfxMuted(false);
    const btn = document.getElementById('sfxMuteBtn');
    if(btn){ btn.textContent = '🔊'; btn.classList.remove('muted'); }
  }
}
function toggleMusicMute(){
  const newMuted = !musicSettings.muted;
  if(typeof setMusicMuted === 'function') setMusicMuted(newMuted);
  const btn = document.getElementById('musicMuteBtn');
  if(btn){
    btn.textContent = newMuted ? '🔇' : '🔊';
    btn.classList.toggle('muted', newMuted);
  }
}
function toggleSfxMute(){
  const newMuted = !musicSettings.sfxMuted;
  if(typeof setSfxMuted === 'function') setSfxMuted(newMuted);
  const btn = document.getElementById('sfxMuteBtn');
  if(btn){
    btn.textContent = newMuted ? '🔇' : '🔊';
    btn.classList.toggle('muted', newMuted);
  }
}
function onShuffleToggle(checked){
  musicSettings.shuffle = !!checked;
  if(typeof persistMusicSettings === 'function') persistMusicSettings();
}
function skipMusicTrack(){
  if(typeof skipToNextMp3 === 'function') skipToNextMp3();
  // Re-render to show updated "now playing"
  setTimeout(() => {
    updateSettingsNowPlaying();
    renderSettingsPlaylist();
  }, 500);
}
function renderProfPanel(){
  const cards=document.getElementById('profCards');
  if(!cards)return;
  cards.innerHTML='';
  Object.entries(professions).forEach(([name,prof])=>{
    const card=document.createElement('div');
    card.className='prof-card';
    const pct=prof.xp/prof.xpToNext*100;
    // Render materials with labels and colors
    const matsHtml=Object.entries(prof.materials)
      .filter(([k,v])=>v>0 || ['scrap','etherDust','runecore','soulbond'].includes(k))
      .map(([k,v])=>{
        const label = MATERIAL_LABELS[k] || k;
        const color = MATERIAL_COLORS[k] || '#9ca3af';
        return `<span class="mat${v>0?' has':''}" style="color:${color}${v>0?'':'88'}">${label}: ${v}</span>`;
      }).join('');
    card.innerHTML=`
      <div class="prof-name">⚒ ${name} — LV ${prof.level}</div>
      <div class="prof-xp-row">
        <div class="prof-xp-bg"><div class="prof-xp-fill" style="width:${pct}%"></div></div>
        <span class="prof-xp-text">${prof.xp} / ${prof.xpToNext} XP</span>
      </div>
      <div class="mat-row">${matsHtml}</div>
      <div class="recipe-list"></div>
    `;
    const recipeList=card.querySelector('.recipe-list');
    (RECIPES[name]||[]).forEach(r=>{
      const row=document.createElement('div');
      row.className='recipe';
      const canMake=canCraft(name,r);
      const reasons=craftBlockReasons(name,r);
      const rarityCol = RARITY_COLORS[r.rarity] || '#9ca3af';
      const rarityLabel = RARITY_LABELS[r.rarity] || '?';
      const icon = SLOT_ICONS[r.slot] || '✦';
      // Stats preview — show baseline numbers with "~" prefix to indicate
      // these are rough values (actual rolls vary by ~±15% per craft due to
      // the reforge RNG). "~" is clearer and more polished than "-ish".
      const statsPreview = Object.entries(r.baseStats).map(([k,v])=>{
        const lbl = (typeof STAT_LABELS!=='undefined'?STAT_LABELS[k]:null) || k;
        return `~${v} ${lbl}`;
      }).join(' · ');
      // Cost with material labels + color
      const costHtml = Object.entries(r.cost).map(([k,v])=>{
        const lbl = MATERIAL_LABELS[k] || k;
        const col = MATERIAL_COLORS[k] || '#9ca3af';
        const have = prof.materials[k] || 0;
        const ok = have >= v;
        return `<span style="color:${ok?col:'#ef4444'}">${v} ${lbl}</span>`;
      }).join(' · ');
      row.innerHTML=`
        <div class="recipe-head">
          <span class="recipe-icon" style="color:${rarityCol}">${icon}</span>
          <span class="recipe-name" style="color:${rarityCol}">${r.name}</span>
          <span class="recipe-rarity" style="background:${rarityCol}22;color:${rarityCol}">${rarityLabel}</span>
        </div>
        <div class="recipe-stats">${statsPreview}</div>
        <div class="recipe-cost">${costHtml}</div>
        ${!canMake && reasons.length ? `<div class="recipe-block">${reasons.join(' · ')}</div>` : ''}
      `;
      const btn=document.createElement('button');
      btn.className='craft-btn';
      btn.textContent = canMake ? 'CRAFT' : 'LOCKED';
      btn.disabled = !canMake;
      btn.onclick = ()=>craft(name,r);
      row.appendChild(btn);
      recipeList.appendChild(row);
    });
    cards.appendChild(card);
  });
}


// ═══════ TALENT SYSTEM ═══════════════════════════════════════
// Per-talent rank tracking. learned[talentId] = currentRank (0 if unlearned).
let talentState={
  points:0,         // unspent talent points
  pointsEarned:0,   // total points ever earned (used to validate on load)
  learned:{},       // talentId -> rank
};

// Award points when the player levels up. Called from addXP().
function awardTalentPoint(){
  talentState.points+=1;
  talentState.pointsEarned+=1;
  addFeed('✦ +1 Talent Point','#c4b5fd');
  // Alert the talent menu button so player notices they have unspent points
  const btn=document.querySelector('[data-menu="talents"]');
  if(btn)btn.classList.add('alert');
}

// Look up how many points the player has spent in a specific branch
function pointsInBranch(branchName){
  const branch=TALENT_TREE[branchName];
  if(!branch)return 0;
  let total=0;
  branch.talents.forEach(t=>{total+=talentState.learned[t.id]||0;});
  return total;
}

// Attempt to spend a point on a talent. Returns true if successful.
function learnTalent(branchName,talentId){
  if(talentState.points<=0)return false;
  const talent=TALENT_TREE[branchName]?.talents.find(t=>t.id===talentId);
  if(!talent)return false;
  const current=talentState.learned[talentId]||0;
  if(current>=talent.maxRank)return false;
  // Check gate — minimum points spent in this branch to unlock
  if(pointsInBranch(branchName)<talent.gate)return false;
  // Spend the point
  talentState.learned[talentId]=current+1;
  talentState.points-=1;
  recalcStats();
  renderTalentPanel(); // refresh UI
  // Clear alert on menu button if no more unspent points
  if(talentState.points<=0){
    const btn=document.querySelector('[data-menu="talents"]');
    if(btn)btn.classList.remove('alert');
  }
  return true;
}

// Wipe all spent talents and refund the points. Free respec for now.
function resetTalents(){
  if(!confirm('Reset all talents? All spent points will be returned.'))return;
  talentState.learned={};
  talentState.points=talentState.pointsEarned;
  recalcStats();
  renderTalentPanel();
  addFeed('✦ Talents reset','#c4b5fd');
}

// Aggregate all talent effects into a single bonus object the engine reads.
// Called every recalcStats(). The engine queries getTalentBonus(key) to apply effects.
let _talentBonusCache={};
function computeTalentBonuses(){
  _talentBonusCache={};
  Object.entries(TALENT_TREE).forEach(([branchName,branch])=>{
    branch.talents.forEach(talent=>{
      const rank=talentState.learned[talent.id]||0;
      if(rank<=0)return;
      const bonuses=talent.apply(rank);
      Object.entries(bonuses).forEach(([k,v])=>{
        _talentBonusCache[k]=(_talentBonusCache[k]||0)+v;
      });
    });
  });
}
function getTalentBonus(key){return _talentBonusCache[key]||0;}

// Render the talent panel UI. Called whenever it opens or a talent is learned.
function renderTalentPanel(){
  const container=document.getElementById('talentTree');
  if(!container)return;
  container.innerHTML='';
  // Points header
  const header=document.createElement('div');
  header.className='talent-header';
  header.innerHTML=`
    <div class="talent-points-label">Available Points: <span class="talent-points-num">${talentState.points}</span></div>
    <button class="talent-reset-btn" id="_resetTalentsBtn">Reset All</button>
  `;
  container.appendChild(header);
  const resetBtn=document.getElementById('_resetTalentsBtn');
  if(resetBtn)resetBtn.addEventListener('click',resetTalents);
  // Branches
  Object.entries(TALENT_TREE).forEach(([branchName,branch])=>{
    const spent=pointsInBranch(branchName);
    const branchDiv=document.createElement('div');
    branchDiv.className='talent-branch';
    branchDiv.style.borderLeft=`3px solid ${branch.color}`;
    branchDiv.innerHTML=`
      <div class="talent-branch-hdr" style="color:${branch.color}">
        <span class="talent-branch-icon">${branch.icon}</span>
        <span class="talent-branch-name">${branchName}</span>
        <span class="talent-branch-spent">${spent} pts</span>
      </div>
      <div class="talent-grid" id="tgrid-${branchName}"></div>
    `;
    container.appendChild(branchDiv);
    const grid=branchDiv.querySelector(`#tgrid-${branchName}`);
    branch.talents.forEach(talent=>{
      const rank=talentState.learned[talent.id]||0;
      const locked=spent<talent.gate;
      const maxed=rank>=talent.maxRank;
      const canLearn=!locked&&!maxed&&talentState.points>0;
      const node=document.createElement('div');
      node.className='talent-node';
      if(rank>0)node.classList.add('learned');
      if(locked)node.classList.add('locked');
      if(maxed)node.classList.add('maxed');
      if(canLearn)node.classList.add('available');
      const effectText=rank>0?talent.effect(rank):talent.effect(1);
      const gateText=locked?`<div class="tn-gate">Unlocks at ${talent.gate} pts</div>`:'';
      node.innerHTML=`
        <span class="tn-icon" style="color:${branch.color}">${talent.icon}</span>
        <div class="tn-name">${talent.name}</div>
        <div class="tn-desc">${talent.desc}</div>
        <div class="tn-effect">${effectText}</div>
        <div class="tn-rank">${rank}/${talent.maxRank}</div>
        ${gateText}
      `;
      if(canLearn){
        node.addEventListener('click',()=>learnTalent(branchName,talent.id));
      }
      grid.appendChild(node);
    });
  });
}

function openTalents(){
  renderTalentPanel();
  if(typeof renderPresetSelector === 'function') renderPresetSelector();
  document.getElementById('talentPanel').style.display='flex';
}
function closeTalents(){
  document.getElementById('talentPanel').style.display='none';
}


// ═══════ DUNGEON PANEL UI ═══════════════════════════════════════
function openDungeons(){
  const list=document.getElementById('dungeonList');
  if(!list)return;
  list.innerHTML='';
  DUNGEONS.forEach(d=>{
    const card=document.createElement('div');
    card.className='dungeon-card';
    const locked=player.level<d.minLevel;
    if(locked)card.classList.add('locked');
    card.style.borderLeft=`3px solid ${d.color}`;
    const tierNames={1:'Tier I',2:'Tier II',3:'Tier III'};
    const rarityLabel={common:'COMMON',uncommon:'UNCOMMON',rare:'RARE',epic:'EPIC',legendary:'LEGENDARY',mythic:'MYTHIC'}[d.reward.minRarity];
    card.innerHTML=`
      <div class="dg-header">
        <div class="dg-name" style="color:${d.color}">⚑ ${d.name}</div>
        <div class="dg-tier" style="color:${d.color};border-color:${d.color}66">${tierNames[d.tier]||'T?'}</div>
      </div>
      <div class="dg-desc">${d.desc}</div>
      <div class="dg-meta-row">
        <span class="dg-meta">⚔ Level ${d.minLevel}+</span>
        <span class="dg-meta">⊞ ${d.waves.length} waves + boss</span>
        <span class="dg-meta" style="color:${d.color}">✦ ${rarityLabel}+ loot</span>
      </div>
      <div class="dg-rewards-row">
        <span class="dg-reward">+${d.reward.bonusGold} gold</span>
        <span class="dg-reward">+${d.reward.bonusXP} XP</span>
      </div>
      <button class="dg-enter-btn" ${locked?'disabled':''}>
        ${locked?`LOCKED · Requires Level ${d.minLevel}`:'⚡ ENTER'}
      </button>
    `;
    if(!locked){
      const btn=card.querySelector('.dg-enter-btn');
      if(btn)btn.addEventListener('click',()=>enterDungeon(d.id));
    }
    list.appendChild(card);
  });
  document.getElementById('dungeonPanel').style.display='flex';
}
function closeDungeons(){
  const p=document.getElementById('dungeonPanel');
  if(p)p.style.display='none';
}


// ═══════ INVENTORY PANEL UI ══════════════════════════════════════
// Renders a 6×4 grid of bag slots. Tapping an item expands an inline tooltip
// showing stats + diff vs currently equipped + EQUIP/DISCARD buttons.
let _bagSelectedIndex=null; // index of currently-expanded item, or null

function openInventory(){
  _bagSelectedIndex=null;
  _stashSelectedIndex=null;
  const panel=document.getElementById('inventoryPanel');
  if(!panel)return;
  panel.style.display='flex';
  // Default to main bag tab every time panel opens
  switchBagTab('main');
  renderInventory();
  if(typeof renderSetStash === 'function') renderSetStash();
}
function closeInventory(){
  const panel=document.getElementById('inventoryPanel');
  if(panel)panel.style.display='none';
  _bagSelectedIndex=null;
  _stashSelectedIndex=null;
}

// Switches between the main bag grid and the set stash grid.
// Called by the tab buttons in index.html. Each tab is just show/hide with
// the other hidden; both render functions keep their own state (selection,
// grouping) so switching back restores what was there.
function switchBagTab(which){
  const mainTab  = document.getElementById('bagTabMain');
  const stashTab = document.getElementById('bagTabStash');
  const mainLayout  = document.getElementById('bagLayout');
  const stashLayout = document.getElementById('setStashLayout');
  if(!mainTab || !stashTab || !mainLayout || !stashLayout) return;
  if(which === 'stash'){
    mainTab.classList.remove('active');
    stashTab.classList.add('active');
    mainLayout.style.display = 'none';
    stashLayout.style.display = '';
    if(typeof renderSetStash === 'function') renderSetStash();
  } else {
    mainTab.classList.add('active');
    stashTab.classList.remove('active');
    mainLayout.style.display = '';
    stashLayout.style.display = 'none';
    if(typeof renderInventory === 'function') renderInventory();
  }
}

function renderInventory(){
  const grid=document.getElementById('bagGrid');
  const tooltip=document.getElementById('bagTooltip');
  const countEl=document.getElementById('bagCountText');
  if(!grid)return;

  if(countEl)countEl.textContent=`${inventory.length} / ${INVENTORY_MAX}`;

  // Classification-to-indicator mapping. Each slot gets a small visual based on
  // whether it's an upgrade (▲ green), sidegrade (◆ gray), downgrade (▼ red),
  // or slot is empty (✦ yellow — "wear this, nothing's there").
  const UPGRADE_MARKS = {
    'upgrade':    {symbol:'▲', color:'#22c55e', title:'Upgrade'},
    'sidegrade':  {symbol:'◆', color:'#9ca3af', title:'Sidegrade'},
    'downgrade':  {symbol:'▼', color:'#ef4444', title:'Downgrade'},
    'empty-slot': {symbol:'✦', color:'#f59e0b', title:'Slot is empty — equip freely'},
  };

  // Render the grid
  grid.innerHTML='';
  for(let i=0;i<INVENTORY_MAX;i++){
    const slot=document.createElement('div');
    slot.className='bag-slot';
    const item=inventory[i];
    if(item){
      const col=RARITY_COLORS[item.rarity]||'#9ca3af';
      const classification=classifyBagItem(item);
      const mark=UPGRADE_MARKS[classification];
      slot.classList.add('filled');
      slot.style.borderColor=col;
      slot.innerHTML=`
        <span class="bag-slot-mark" style="color:${mark.color};text-shadow:0 0 8px ${mark.color}88" title="${mark.title}">${mark.symbol}</span>
        <canvas class="bag-slot-icon-canvas" width="52" height="52"></canvas>
        <span class="bag-slot-rarity" style="background:${col}22;color:${col}">${RARITY_LABELS[item.rarity]||'?'}</span>
      `;
      // Render the hand-crafted gear icon into the canvas
      const iconCanvas = slot.querySelector('.bag-slot-icon-canvas');
      if(iconCanvas && typeof drawGearIcon === 'function'){
        drawGearIcon(iconCanvas, item.slot, item.rarity);
      }
      if(i===_bagSelectedIndex)slot.classList.add('selected');
      slot.addEventListener('click',()=>{
        _bagSelectedIndex=(_bagSelectedIndex===i)?null:i;
        renderInventory();
      });
    } else {
      slot.classList.add('empty');
    }
    grid.appendChild(slot);
  }

  // Render the tooltip for the selected item — or hide it
  if(tooltip){
    if(_bagSelectedIndex===null||!inventory[_bagSelectedIndex]){
      tooltip.style.display='none';
    } else {
      const item=inventory[_bagSelectedIndex];
      const col=RARITY_COLORS[item.rarity]||'#9ca3af';
      const current=equipped[item.slot];
      const statLines=computeStatLines(item);        // raw stats on THIS item
      const diffLines=current?computeStatDiff(item):null; // comparison vs equipped

      // Classification banner
      const classification=classifyBagItem(item);
      const mark=UPGRADE_MARKS[classification];
      const classBanner = current
        ? `<div class="bag-tt-verdict" style="background:${mark.color}22;color:${mark.color};border-color:${mark.color}66">
             ${mark.symbol} ${mark.title.toUpperCase()}
           </div>`
        : `<div class="bag-tt-verdict" style="background:${mark.color}22;color:${mark.color};border-color:${mark.color}66">
             ${mark.symbol} ${mark.title.toUpperCase()}
           </div>`;

      // Raw stats section (always shown — answers "what does this item have?")
      const statsHtml = statLines.length
        ? statLines.map(l=>`<div class="bag-stat-line" style="color:${l.color}">${l.text}</div>`).join('')
        : '<div class="bag-stat-line" style="color:#6b4d8a">— no stats —</div>';

      // Comparison section (only shown if slot has equipped item)
      const diffHtml = diffLines
        ? diffLines.map(l=>`<div class="bag-stat-line" style="color:${l.color}">${l.text}</div>`).join('')
        : '';

      // Salvage yield preview
      const salvage=salvageYieldFor(item);
      const salvagePreview=Object.entries(salvage)
        .map(([k,v])=>`<span style="color:${MATERIAL_COLORS[k]||'#fff'}">${v} ${MATERIAL_LABELS[k]||k}</span>`)
        .join(' · ');

      // Reforge info — only shown for crafted items
      let reforgeSection='';
      let reforgeButton='';
      if(item.crafted){
        const rCost=reforgeCost(item);
        if(rCost){
          const canRef=canReforge(item);
          const costText=Object.entries(rCost)
            .map(([k,v])=>`<span style="color:${MATERIAL_COLORS[k]||'#fff'}">${v} ${MATERIAL_LABELS[k]||k}</span>`)
            .join(' · ');
          reforgeSection=`
            <div class="bag-tt-section">
              <div class="bag-tt-section-label">Reforge Cost</div>
              <div class="bag-stat-line">${costText}</div>
              ${!canRef?`<div class="bag-stat-line" style="color:#ef4444;font-style:italic">${reforgeBlockReasons(item).join(' · ')}</div>`:''}
            </div>
          `;
          reforgeButton=`<button class="bag-btn bag-btn-reforge" ${canRef?'':'disabled'}>◈ REFORGE</button>`;
        }
      }

      // Upgrade info — shown for all upgradeable items (uncommon+)
      let upgradeSection='';
      let upgradeButton='';
      const uCost=getUpgradeCost(item);
      const currentUpgradeLv=item.upgradeLevel||0;
      if(UPGRADE_COST[item.rarity]){
        if(uCost){
          // Can still upgrade — show cost + preview
          const canUp=canAffordUpgrade(item);
          const uCostText=Object.entries(uCost)
            .map(([k,v])=>`<span style="color:${MATERIAL_COLORS[k]||'#fff'}">${v} ${MATERIAL_LABELS[k]||k}</span>`)
            .join(' · ');
          upgradeSection=`
            <div class="bag-tt-section">
              <div class="bag-tt-section-label">Upgrade to +${currentUpgradeLv+1}</div>
              <div class="bag-stat-line">${uCostText}</div>
              <div class="bag-stat-line" style="color:#9ca3af;font-size:11px">+15% all stats</div>
              ${!canUp?`<div class="bag-stat-line" style="color:#ef4444;font-style:italic">Not enough materials</div>`:''}
            </div>
          `;
          upgradeButton=`<button class="bag-btn bag-btn-upgrade" ${canUp?'':'disabled'}>▲ UPGRADE</button>`;
        } else if(currentUpgradeLv >= MAX_UPGRADE_LEVEL){
          upgradeSection=`
            <div class="bag-tt-section">
              <div class="bag-stat-line" style="color:#f59e0b">✦ Fully upgraded (+${MAX_UPGRADE_LEVEL})</div>
            </div>
          `;
        }
      }

      tooltip.innerHTML=`
        <div class="bag-tooltip-header" style="border-color:${col}88">
          <span class="bag-tt-name" style="color:${col};text-shadow:0 0 10px ${col}66">${itemDisplayName(item)}</span>
          <span class="bag-tt-rarity" style="background:${col}22;color:${col}">${RARITY_LABELS[item.rarity]||'?'}</span>
        </div>
        <div class="bag-tt-slot">${SLOT_ICONS[item.slot]||'✦'} ${item.slot.toUpperCase()}${item.crafted?' <span class="gear-crafted-badge">⚒ CRAFTED</span>':''}</div>
        ${item.setName?`<div class="bag-tt-set">◈ ${item.setName} set</div>`:''}
        ${classBanner}
        <div class="bag-tt-section">
          <div class="bag-tt-section-label">Item Stats</div>
          ${statsHtml}
        </div>
        ${current?`<div class="bag-tt-section">
          <div class="bag-tt-section-label">vs. Equipped (${itemDisplayName(current)})</div>
          ${diffHtml||'<div class="bag-stat-line" style="color:#6b4d8a">— identical —</div>'}
        </div>`:''}
        ${upgradeSection}
        ${reforgeSection}
        <div class="bag-tt-section bag-tt-salvage-preview">
          <div class="bag-tt-section-label">Salvage Yield</div>
          <div class="bag-stat-line">${salvagePreview}</div>
        </div>
        <div class="bag-tt-actions">
          <button class="bag-btn bag-btn-equip">⚔ EQUIP</button>
          ${upgradeButton}
          ${reforgeButton}
          <button class="bag-btn bag-btn-salvage">⚒ SALVAGE</button>
          <button class="bag-btn bag-btn-discard">✗ DISCARD</button>
        </div>
      `;
      tooltip.style.display='flex';
      tooltip.style.borderColor=col+'55';
      const idx=_bagSelectedIndex;
      tooltip.querySelector('.bag-btn-equip').addEventListener('click',()=>equipFromBag(idx));
      tooltip.querySelector('.bag-btn-salvage').addEventListener('click',()=>salvageFromBag(idx));
      tooltip.querySelector('.bag-btn-discard').addEventListener('click',()=>discardFromBag(idx));
      // Upgrade button
      const upgradeBtn=tooltip.querySelector('.bag-btn-upgrade');
      if(upgradeBtn && !upgradeBtn.disabled){
        upgradeBtn.addEventListener('click',()=>{
          const it=inventory[idx];
          if(!it)return;
          const result=upgradeItem(it);
          if(!result.ok) addFeed(`⚠ ${result.reason}`, '#ef4444');
          else renderInventory();
        });
      }
      // Reforge button only exists for crafted items
      const reforgeBtn=tooltip.querySelector('.bag-btn-reforge');
      if(reforgeBtn && !reforgeBtn.disabled){
        reforgeBtn.addEventListener('click',()=>{
          const it=inventory[idx];
          if(!it)return;
          const rarityTier={common:0,uncommon:1,rare:2,epic:3,legendary:4,mythic:5}[it.rarity]||0;
          const cost=reforgeCost(it);
          const costText=Object.entries(cost).map(([k,v])=>`${v} ${MATERIAL_LABELS[k]||k}`).join(', ');
          if(rarityTier>=2){
            if(!confirm(`Reforge ${it.name}?\n\nThis will consume ${costText} and re-roll the stats.\n\nCurrent stats may become worse.`))return;
          }
          reforgeItem(it, ()=>renderInventory());
        });
      }
    }
  }
}


// ═══════ SHOP SYSTEM ═══════════════════════════════════════════════
// Merchant with rotating gear inventory, consumables, mystery box, buyback slot.
// Gear prices scale with rarity + player level so mid-game can afford mid-tier
// items without trivializing endgame costs.
// Inventory refreshes automatically every SHOP_REFRESH_MS, or instantly for gold.

const SHOP_REFRESH_MS = 5 * 60 * 1000;   // auto-refresh every 5 minutes
const SHOP_INSTANT_REFRESH_COST = 150;   // gold to refresh inventory on demand
const SHOP_GEAR_COUNT = 6;               // how many gear slots the shop shows

// Consumables catalog. Prices are flat (don't scale with level).
const SHOP_CONSUMABLES = [
  {
    id:'potion_heal',name:'Veil-Touched Elixir',icon:'✦',
    desc:'Instantly restores 50% of max HP.',
    price:80,
    onBuy:()=>{const heal=Math.ceil(player.maxHp*0.5);player.hp=Math.min(player.maxHp,player.hp+heal);addFeed(`✦ +${heal} HP`,'#22c55e');},
  },
  {
    id:'potion_xp',name:'Scroll of Insight',icon:'◈',
    desc:'Immediately grants XP equal to 40% of the amount needed for next level.',
    price:220,
    onBuy:()=>{const gain=Math.ceil(player.xpToNext*0.4);addXP(gain);addFeed(`◈ +${gain} XP`,'#60a5fa');},
  },
  {
    id:'respec',name:'Veilwright Reforge',icon:'✧',
    desc:'Resets all talent points, refunding them to spend again.',
    price:500,
    onBuy:()=>{
      if(typeof talentState!=='undefined'){
        const refunded=talentState.pointsEarned;
        talentState.points=refunded;
        talentState.learned={};
        if(typeof recalcStats==='function')recalcStats();
        addFeed(`✧ Talents refunded: ${refunded} points`,'#c084fc');
      }
    },
  },
];

// Mystery box — random gear at escalating cost (one per day... or per shop refresh for now)
let shopMysteryBoxUses = 0; // how many times bought this rotation
function mysteryBoxCost(){ return 250 + shopMysteryBoxUses * 100; }

// Shop state
const shopState = {
  gear: [],                 // array of gear items currently for sale
  lastRefresh: 0,           // timestamp of last refresh
  buyback: null,            // last discarded rare+ item, available to buy back
  buybackPrice: 0,
  materials: [],            // array of {material, qty, price} for this rotation
};

// Base gold price per unit for each material. Multiplied by player level for scaling.
const MATERIAL_PRICES = {
  scrap:      8,    // common salvage output — cheap
  etherDust:  22,   // rare+ salvage — moderate
  runecore:   60,   // epic+ salvage — expensive
  soulbond:   180,  // legendary+ salvage only — rare luxury
};

// Max stack size per listing, per material tier. Higher tiers sell fewer.
const MATERIAL_STACK_SIZES = {
  scrap:      [2, 5],   // 2-5 per listing
  etherDust:  [1, 3],
  runecore:   [1, 2],
  soulbond:   [1, 1],   // always exactly 1 — rare
};

// Probability each material appears in a given rotation slot.
// Weights determine relative frequency — scrap common, soulbond rare.
const MATERIAL_ROLL_WEIGHTS = {
  scrap:     50,
  etherDust: 30,
  runecore:  15,
  soulbond:  5,
};

// How many material listings per shop rotation (random within range).
const SHOP_MATERIALS_COUNT = [1, 3];

// Picks a random material key weighted by MATERIAL_ROLL_WEIGHTS.
function rollShopMaterial(){
  const entries = Object.entries(MATERIAL_ROLL_WEIGHTS);
  const total = entries.reduce((s,[,w])=>s+w, 0);
  let roll = Math.random() * total;
  for (const [mat, w] of entries){
    if ((roll -= w) < 0) return mat;
  }
  return entries[0][0];
}

// Compute a material listing's price: base * quantity * level multiplier.
function priceForMaterial(material, qty){
  const base = MATERIAL_PRICES[material] || 10;
  const levelMult = 1 + Math.max(1, player.level) * 0.08;
  return Math.ceil(base * qty * levelMult);
}

// Compute a gear item's shop price from its rarity + level
function priceForItem(item){
  const rarityMult = {common:1,uncommon:2.5,rare:6,epic:14,legendary:35,mythic:80}[item.rarity] || 1;
  const levelMult = 1 + Math.max(1, player.level) * 0.12;
  return Math.ceil(45 * rarityMult * levelMult);
}

// Generate a fresh shop rotation of gear + materials
function refreshShop(silent = false){
  shopState.gear = [];
  // Bias the rotation toward items near player level + their rarities
  for (let i = 0; i < SHOP_GEAR_COUNT; i++){
    const item = rollLoot(player.level);
    item.shopPrice = priceForItem(item);
    shopState.gear.push(item);
  }
  // Roll materials — random count within SHOP_MATERIALS_COUNT, weighted by tier
  shopState.materials = [];
  const matCount = SHOP_MATERIALS_COUNT[0] + Math.floor(Math.random() * (SHOP_MATERIALS_COUNT[1] - SHOP_MATERIALS_COUNT[0] + 1));
  const usedMaterials = new Set(); // avoid duplicate material types in same rotation
  let attempts = 0;
  while (shopState.materials.length < matCount && attempts < 20){
    attempts++;
    const mat = rollShopMaterial();
    if (usedMaterials.has(mat)) continue;
    usedMaterials.add(mat);
    const [minQ, maxQ] = MATERIAL_STACK_SIZES[mat] || [1, 1];
    const qty = minQ + Math.floor(Math.random() * (maxQ - minQ + 1));
    shopState.materials.push({
      material: mat,
      qty,
      price: priceForMaterial(mat, qty),
    });
  }
  shopState.lastRefresh = Date.now();
  shopMysteryBoxUses = 0;
  if (!silent) addFeed('✦ Shop inventory refreshed','#f59e0b');
}

// Call periodically (from the main game loop) to auto-refresh the shop
function checkShopAutoRefresh(){
  if (!shopState.lastRefresh) { refreshShop(true); return; }
  if (Date.now() - shopState.lastRefresh >= SHOP_REFRESH_MS){
    refreshShop(true);
    addFeed('✦ Merchant has new wares','#f59e0b');
    if (typeof updateShopBadge === 'function') updateShopBadge();
  }
}

// Called from discardFromBag when a rare+ item is thrown away — offer buyback
function queueBuyback(item){
  const rarityTier = {common:0,uncommon:1,rare:2,epic:3,legendary:4,mythic:5}[item.rarity] || 0;
  if (rarityTier < 2) return; // only rare+ goes to buyback
  shopState.buyback = {...item};
  // Buyback costs 2x normal shop price — emergency rescue, not farming
  shopState.buybackPrice = priceForItem(item) * 2;
}

// Attempt a gear purchase. Returns true on success.
function buyGearFromShop(index){
  const item = shopState.gear[index];
  if (!item) return false;
  if (player.gold < item.shopPrice){
    addFeed('⚠ Not enough gold','#ef4444');
    return false;
  }
  // If bag is full AND slot is filled, can't take it
  const slotEmpty = !equipped[item.slot];
  const bagHasRoom = inventory.length < INVENTORY_MAX;
  if (!slotEmpty && !bagHasRoom){
    addFeed('⚠ Bag full — free a slot first','#ef4444');
    return false;
  }
  player.gold -= item.shopPrice;
  const bought = {...item};
  delete bought.shopPrice;
  acquireLoot(bought);
  // Remove from shop rotation so it can't be bought twice
  shopState.gear.splice(index, 1);
  if (typeof writeSave === 'function') writeSave();
  if (typeof renderShop === 'function') renderShop();
  return true;
}

function buyConsumable(id){
  const c = SHOP_CONSUMABLES.find(x => x.id === id);
  if (!c) return false;
  if (player.gold < c.price){
    addFeed('⚠ Not enough gold','#ef4444');
    return false;
  }
  player.gold -= c.price;
  c.onBuy();
  if (typeof writeSave === 'function') writeSave();
  if (typeof renderShop === 'function') renderShop();
  return true;
}

function buyMysteryBox(){
  const cost = mysteryBoxCost();
  if (player.gold < cost){
    addFeed('⚠ Not enough gold','#ef4444');
    return false;
  }
  // Check room before spending
  const sample = rollLoot(player.level);
  const slotEmpty = !equipped[sample.slot];
  const bagHasRoom = inventory.length < INVENTORY_MAX;
  if (!slotEmpty && !bagHasRoom){
    addFeed('⚠ Bag full — free a slot first','#ef4444');
    return false;
  }
  player.gold -= cost;
  shopMysteryBoxUses++;
  // 70% chance base tier, 25% chance one tier higher, 5% chance jackpot (legendary+)
  const roll = Math.random();
  let item;
  if (roll < 0.05){
    // Jackpot — roll legendary+
    const legendaries = (typeof ITEM_POOL !== 'undefined' ? ITEM_POOL.filter(i => i.rarity === 'legendary' || i.rarity === 'mythic') : []);
    item = legendaries.length ? {...legendaries[Math.floor(Math.random()*legendaries.length)]} : rollLoot(player.level+10);
    addFeed('✦✦ JACKPOT! ✦✦','#f59e0b');
  } else if (roll < 0.30){
    item = rollLoot(player.level + 5);
  } else {
    item = rollLoot(player.level);
  }
  acquireLoot(item);
  if (typeof writeSave === 'function') writeSave();
  if (typeof renderShop === 'function') renderShop();
  return true;
}

function buyBuyback(){
  if (!shopState.buyback) return false;
  if (player.gold < shopState.buybackPrice){
    addFeed('⚠ Not enough gold','#ef4444');
    return false;
  }
  const slotEmpty = !equipped[shopState.buyback.slot];
  const bagHasRoom = inventory.length < INVENTORY_MAX;
  if (!slotEmpty && !bagHasRoom){
    addFeed('⚠ Bag full — free a slot first','#ef4444');
    return false;
  }
  player.gold -= shopState.buybackPrice;
  acquireLoot({...shopState.buyback});
  shopState.buyback = null;
  shopState.buybackPrice = 0;
  if (typeof writeSave === 'function') writeSave();
  if (typeof renderShop === 'function') renderShop();
  return true;
}

// Purchase a stack of materials. Uses creditMaterial (same path as salvage)
// so materials flow to all 3 professions exactly as they do from salvage.
function buyMaterial(index){
  const listing = shopState.materials[index];
  if (!listing) return false;
  if (player.gold < listing.price){
    addFeed('⚠ Not enough gold','#ef4444');
    return false;
  }
  player.gold -= listing.price;
  creditMaterial(listing.material, listing.qty);
  const label = MATERIAL_LABELS[listing.material] || listing.material;
  addFeed(`⚒ Purchased ${listing.qty} ${label} (-${listing.price}G)`,MATERIAL_COLORS[listing.material] || '#fff');
  // Remove from shop rotation so it can't be bought twice
  shopState.materials.splice(index, 1);
  if (typeof writeSave === 'function') writeSave();
  if (typeof renderShop === 'function') renderShop();
  return true;
}

function instantRefreshShop(){
  if (player.gold < SHOP_INSTANT_REFRESH_COST){
    addFeed('⚠ Not enough gold','#ef4444');
    return;
  }
  player.gold -= SHOP_INSTANT_REFRESH_COST;
  refreshShop(false);
  if (typeof writeSave === 'function') writeSave();
  if (typeof renderShop === 'function') renderShop();
}

function updateShopBadge(){
  const btn = document.querySelector('[data-menu="shop"]');
  if (!btn) return;
  const existing = btn.querySelector('.menu-btn-badge');
  // Show badge only if a new rotation is ready and shop hasn't been opened
  // Simple: show badge if shop is never-opened since last refresh
  if (shopState.gear.length > 0 && !shopState._opened){
    if (existing) existing.textContent = '!';
    else {
      const b = document.createElement('span');
      b.className = 'menu-btn-badge';
      b.textContent = '!';
      btn.appendChild(b);
    }
  } else if (existing){
    existing.remove();
  }
}

// ═══════ SHOP UI ═══════════════════════════════════════════════

function openShop(){
  checkShopAutoRefresh();
  if (!shopState.gear.length) refreshShop(true);
  shopState._opened = true;
  updateShopBadge();
  const panel = document.getElementById('shopPanel');
  if (!panel) return;
  panel.style.display = 'flex';
  renderShop();
}

function closeShop(){
  const panel = document.getElementById('shopPanel');
  if (panel) panel.style.display = 'none';
}

function renderShop(){
  const goldEl = document.getElementById('shopGold');
  if (goldEl) goldEl.textContent = `${player.gold} G`;

  // Time-until-next-refresh
  const timerEl = document.getElementById('shopRefreshTimer');
  if (timerEl){
    if (!shopState.lastRefresh) timerEl.textContent = '';
    else {
      const msLeft = Math.max(0, SHOP_REFRESH_MS - (Date.now() - shopState.lastRefresh));
      const mins = Math.floor(msLeft/60000);
      const secs = Math.floor((msLeft%60000)/1000);
      timerEl.textContent = `Next rotation in ${mins}:${secs.toString().padStart(2,'0')}`;
    }
  }

  // Gear grid
  const gearGrid = document.getElementById('shopGearGrid');
  if (gearGrid){
    gearGrid.innerHTML = '';
    if (!shopState.gear.length){
      gearGrid.innerHTML = '<div class="shop-empty">Merchant is restocking...</div>';
    } else {
      shopState.gear.forEach((item, idx) => {
        const col = RARITY_COLORS[item.rarity] || '#9ca3af';
        const label = RARITY_LABELS[item.rarity] || '?';
        const icon = SLOT_ICONS[item.slot] || '✦';
        // Brief stat summary
        const statsSummary = Object.entries(item.stats || {})
          .map(([k,v]) => `+${v} ${k}`).join(' · ') || '—';
        const canAfford = player.gold >= item.shopPrice;
        const card = document.createElement('div');
        card.className = 'shop-gear-card' + (canAfford ? '' : ' disabled');
        card.style.borderColor = col + 'aa';
        card.innerHTML = `
          <div class="shop-gear-top">
            <canvas class="shop-gear-icon-canvas" width="52" height="52"></canvas>
            <span class="shop-gear-rarity" style="background:${col}22;color:${col}">${label}</span>
          </div>
          <div class="shop-gear-name" style="color:${col}">${item.name}</div>
          <div class="shop-gear-slot">${item.slot}</div>
          <div class="shop-gear-stats">${statsSummary}</div>
          <button class="shop-buy-btn" ${canAfford?'':'disabled'}>${item.shopPrice} G</button>
        `;
        // Render the detailed gear icon into the card's canvas
        const iconCanvas = card.querySelector('.shop-gear-icon-canvas');
        if(iconCanvas && typeof drawGearIcon === 'function'){
          drawGearIcon(iconCanvas, item.slot, item.rarity);
        }
        const btn = card.querySelector('.shop-buy-btn');
        if (canAfford) btn.addEventListener('click', () => buyGearFromShop(idx));
        gearGrid.appendChild(card);
      });
    }
  }

  // Consumables
  const consumablesEl = document.getElementById('shopConsumables');
  if (consumablesEl){
    consumablesEl.innerHTML = '';
    SHOP_CONSUMABLES.forEach(c => {
      const canAfford = player.gold >= c.price;
      const row = document.createElement('div');
      row.className = 'shop-consumable' + (canAfford ? '' : ' disabled');
      row.innerHTML = `
        <div class="shop-consumable-icon">${c.icon}</div>
        <div class="shop-consumable-info">
          <div class="shop-consumable-name">${c.name}</div>
          <div class="shop-consumable-desc">${c.desc}</div>
        </div>
        <button class="shop-buy-btn" ${canAfford?'':'disabled'}>${c.price} G</button>
      `;
      const btn = row.querySelector('.shop-buy-btn');
      if (canAfford) btn.addEventListener('click', () => buyConsumable(c.id));
      consumablesEl.appendChild(row);
    });

    // Mystery box — always visible, escalating cost
    const mbCost = mysteryBoxCost();
    const mbAfford = player.gold >= mbCost;
    const mb = document.createElement('div');
    mb.className = 'shop-consumable shop-mystery' + (mbAfford ? '' : ' disabled');
    mb.innerHTML = `
      <div class="shop-consumable-icon">?</div>
      <div class="shop-consumable-info">
        <div class="shop-consumable-name">Mystery Box</div>
        <div class="shop-consumable-desc">Random gear. 5% chance of legendary+. Cost rises each buy this rotation.</div>
      </div>
      <button class="shop-buy-btn" ${mbAfford?'':'disabled'}>${mbCost} G</button>
    `;
    const mbBtn = mb.querySelector('.shop-buy-btn');
    if (mbAfford) mbBtn.addEventListener('click', () => buyMysteryBox());
    consumablesEl.appendChild(mb);
  }

  // Materials section — crafting ingredients this rotation
  const materialsEl = document.getElementById('shopMaterials');
  if (materialsEl){
    materialsEl.innerHTML = '';
    if (!shopState.materials || !shopState.materials.length){
      materialsEl.innerHTML = '<div class="shop-empty">No materials this rotation — check back later</div>';
    } else {
      shopState.materials.forEach((listing, idx) => {
        const col = MATERIAL_COLORS[listing.material] || '#fff';
        const label = MATERIAL_LABELS[listing.material] || listing.material;
        const canAfford = player.gold >= listing.price;
        const row = document.createElement('div');
        row.className = 'shop-consumable shop-material-row' + (canAfford ? '' : ' disabled');
        row.style.borderColor = col + '44';
        row.innerHTML = `
          <div class="shop-consumable-icon" style="color:${col};background:${col}15;text-shadow:0 0 10px ${col}66">⚒</div>
          <div class="shop-consumable-info">
            <div class="shop-consumable-name" style="color:${col}">${listing.qty}× ${label}</div>
            <div class="shop-consumable-desc">Crafting material — split between all professions on purchase.</div>
          </div>
          <button class="shop-buy-btn" ${canAfford?'':'disabled'}>${listing.price} G</button>
        `;
        const btn = row.querySelector('.shop-buy-btn');
        if (canAfford) btn.addEventListener('click', () => buyMaterial(idx));
        materialsEl.appendChild(row);
      });
    }
  }

  // Buyback slot
  const bbEl = document.getElementById('shopBuyback');
  if (bbEl){
    if (!shopState.buyback){
      bbEl.innerHTML = '<div class="shop-empty">No recently discarded items</div>';
    } else {
      const item = shopState.buyback;
      const col = RARITY_COLORS[item.rarity] || '#9ca3af';
      const canAfford = player.gold >= shopState.buybackPrice;
      bbEl.innerHTML = `
        <div class="shop-consumable shop-buyback-item${canAfford?'':' disabled'}" style="border-color:${col}88">
          <div class="shop-consumable-icon" style="color:${col}">${SLOT_ICONS[item.slot]||'✦'}</div>
          <div class="shop-consumable-info">
            <div class="shop-consumable-name" style="color:${col}">${item.name}</div>
            <div class="shop-consumable-desc">Recently discarded — recover at 2× price.</div>
          </div>
          <button class="shop-buy-btn" ${canAfford?'':'disabled'}>${shopState.buybackPrice} G</button>
        </div>
      `;
      const btn = bbEl.querySelector('.shop-buy-btn');
      if (canAfford) btn.addEventListener('click', () => buyBuyback());
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BUILD PRESET SYSTEM
// ═══════════════════════════════════════════════════════════════════════
// 6 pre-designed builds (3 per class) that give distinct playstyles through
// talent distribution + matching set gear. Each preset has:
//   - id, name, classId, description
//   - talentPoints: {talentId: rank} — how talents should be distributed
//   - setName: which set this preset uses
//   - autoApply(): function that respec talents + equips best set gear
//
// In testing mode, new characters receive all 6 sets in their setStash so
// they can test any build instantly.

// ─── Set stash storage ───
// Separate inventory for set pieces. Doesn't clutter main bag.
// Persisted through save/load.
let setStash = []; // array of full item objects, same shape as inventory items

// ═══════ PRESET DEFINITIONS ═══════════════════════════════════════
const BUILD_PRESETS = {
  necrolord: {
    id: 'necrolord',
    name: 'Necrolord',
    classId: 'hollowcaller',
    tagline: 'Commander of the dead',
    description: 'Command a massive army of spirits. Up to 8 permanent bonds. Spirits are your weapon.',
    color: '#9DC4B0',
    setName: 'Bonemarshal\'s Regalia',
    // Talent points to spend (stacking to maxRank per talent)
    // Focus: Binding tree — all spirit-related upgrades
    talentPoints: {
      b1: 3,  // Greater Bond — max spirit cap
      b2: 3,  // Vicious Spirits — +30% spirit damage
      b3: 2,  // Swift Summoning — -30% Raise cooldown
      b4: 1,  // Echoing Call — Raise summons 2 at once
      b5: 3,  // Spirit Pact — +9% dmg per spirit
      b6: 1,  // Soul Eruption — spirits explode on death
    },
  },
  voidweaver: {
    id: 'voidweaver',
    name: 'Voidweaver',
    classId: 'hollowcaller',
    tagline: 'The storm itself',
    description: 'Pure spellcaster. No pets. Chain-cast void magic, crit-focused, massive burst.',
    color: '#c084fc',
    setName: 'Voidshard Vestments',
    talentPoints: {
      v1: 3,  // Searing Mark — +36% Detonate
      v2: 3,  // Widening Veil — +75 Detonate radius
      v3: 2,  // Deep Mark — +4 Veilmark max stacks
      v4: 3,  // Unbound Wrath — +90 Wrath Tide radius
      v5: 3,  // Relentless Veil — -18% all cooldowns
      v6: 1,  // Cataclysm — Detonate echoes
    },
  },
  reaverSaint: {
    id: 'reaverSaint',
    name: 'Reaver-Saint',
    classId: 'hollowcaller',
    tagline: 'Hollow yourself, wear death as armor',
    description: 'Aggressive melee hybrid. Fewer but tankier spirits. Lifesteal and reflection.',
    color: '#f43f5e',
    setName: 'Carmine Reaver\'s Panoply',
    talentPoints: {
      // Mixed tree — Hollow focus for tankiness + some Binding
      b1: 2,  // Greater Bond — some extra spirits
      b2: 2,  // Vicious Spirits — stronger spirits
      h1: 3,  // Hollow tree — TBD mapped to actual talents
      h2: 3,
      h3: 3,
      h4: 3,
      h5: 2,
    },
  },
  ironguard: {
    id: 'ironguard',
    name: 'Ironguard',
    classId: 'ironwake',
    tagline: 'The fortress',
    description: 'Pure defensive tank. Pull enemies to you. Absorb pain, return it tenfold.',
    color: '#60a5fa',
    setName: 'Unyielding Bulwark',
    // Focus: HP + damage reduction + lifesteal
    // NOTE: Using Hollow-tree talents as placeholders until Ironwake-specific
    // talents are added. These are generic survival talents that work for tanks.
    talentPoints: {
      h1: 3,  // Veiled Flesh — +24% max HP
      h2: 1,  // Hollow Step — small speed (tanks don't need much)
      h3: 3,  // Pale Vitality — heal per kill
      h5: 3,  // Hollow Resilience — -15% damage taken
      h6: 1,  // Everlasting — cheat death
    },
  },
  juggernaut: {
    id: 'juggernaut',
    name: 'Juggernaut',
    classId: 'ironwake',
    tagline: 'The unstoppable force',
    description: 'Aggressive momentum-based warrior. Charge through enemies, snowball damage.',
    color: '#f59e0b',
    setName: 'Titan\'s Momentum',
    // Focus: movement speed + crit + lifesteal
    talentPoints: {
      h1: 2,  // Some HP — still melee
      h2: 3,  // Hollow Step — max movement speed
      h3: 2,  // Pale Vitality — some heal per kill
      h4: 3,  // Deft Casting — +9% crit chance
      h5: 1,  // Hollow Resilience — minor DR
    },
  },
  bloodforged: {
    id: 'bloodforged',
    name: 'Bloodforged',
    classId: 'ironwake',
    tagline: 'Pain is fuel',
    description: 'Glass-tank berserker. Low HP = massive damage. Risk/reward lifesteal.',
    color: '#ef4444',
    setName: 'Bloodforged Harness',
    // Focus: crit + lifesteal + cheat death (you need it at low HP)
    talentPoints: {
      h2: 2,  // Some speed
      h3: 3,  // Pale Vitality — heals per kill
      h4: 3,  // Deft Casting — max crit
      h6: 1,  // Everlasting — survive a fatal blow
    },
  },
};

// ═══════ SET PIECE CATALOG ═══════════════════════════════════════
// 6 sets × 8 pieces each = 48 set items. Each piece covers one gear slot
// and has stats themed to the preset's playstyle.
// Created at "rare" rarity baseline — can be upgraded +1/+2/+3 via scrap.

function buildPresetSetItems(){
  const items = [];
  // Helper to build a single set piece
  const piece = (setName, slot, name, rarity, stats) => ({
    name, slot, rarity, stats, setName, crafted: false, upgradeLevel: 0,
  });

  // ─── NECROLORD — Bonemarshal's Regalia (spirit commander set) ───
  const NECRO = 'Bonemarshal\'s Regalia';
  items.push(piece(NECRO, 'Weapon', 'Bonemarshal Scepter',  'epic', {sm:22, atk:18, spiritBonus:2}));
  items.push(piece(NECRO, 'Helmet', 'Crown of the Cortege', 'epic', {hp:180, sm:16, spiritBonus:1}));
  items.push(piece(NECRO, 'Chest',  'Mantle of the Legion', 'epic', {hp:260, sm:18, spiritBonus:1}));
  items.push(piece(NECRO, 'Gloves', 'Conductor\'s Grasp',   'rare', {sm:12, crit:6, atk:10}));
  items.push(piece(NECRO, 'Boots',  'Tread of the Dead',    'rare', {hp:120, cdr:10, moveSpdPct:8}));
  items.push(piece(NECRO, 'Belt',   'Binding Chain Girdle', 'rare', {hp:100, sm:10, spiritBonus:1}));
  items.push(piece(NECRO, 'Ring',   'Seal of Command',      'rare', {sm:14, atk:8}));
  items.push(piece(NECRO, 'Amulet', 'Amulet of Legions',    'epic', {sm:28, crit:5, spiritBonus:2}));

  // ─── VOIDWEAVER — Voidshard Vestments (spellcaster set) ───
  const VOID = 'Voidshard Vestments';
  items.push(piece(VOID, 'Weapon', 'Voidshard Rod',       'epic', {sm:14, atk:28, crit:14}));
  items.push(piece(VOID, 'Helmet', 'Crown of the Abyss',  'epic', {hp:120, sm:20, crit:8}));
  items.push(piece(VOID, 'Chest',  'Robes of the Fissure','epic', {hp:180, sm:22, crit:6}));
  items.push(piece(VOID, 'Gloves', 'Voidtouched Grasp',   'rare', {atk:20, crit:12, sm:8}));
  items.push(piece(VOID, 'Boots',  'Stride of the Rift',  'rare', {hp:80, cdr:12, moveSpdPct:10}));
  items.push(piece(VOID, 'Belt',   'Girdle of the Void',  'rare', {hp:70, sm:12, crit:8}));
  items.push(piece(VOID, 'Ring',   'Ring of Annihilation','rare', {atk:14, crit:10}));
  items.push(piece(VOID, 'Amulet', 'Voidheart Pendant',   'epic', {sm:18, crit:14, atk:12}));

  // ─── REAVER-SAINT — Carmine Reaver's Panoply (melee hybrid set) ───
  const REAV = 'Carmine Reaver\'s Panoply';
  items.push(piece(REAV, 'Weapon', 'Crimson Reaver',      'epic', {atk:32, lifeOnHit:6, sm:8}));
  items.push(piece(REAV, 'Helmet', 'Sanguine Helm',       'epic', {hp:280, atk:12, lifeOnHit:3}));
  items.push(piece(REAV, 'Chest',  'Blood-Iron Cuirass',  'epic', {hp:380, res:8, lifeOnHit:4}));
  items.push(piece(REAV, 'Gloves', 'Gauntlets of Carnage','rare', {atk:18, crit:8, lifeOnHit:3}));
  items.push(piece(REAV, 'Boots',  'Ironstride Greaves',  'rare', {hp:160, res:5, moveSpdPct:6}));
  items.push(piece(REAV, 'Belt',   'Covenant Belt',       'rare', {hp:140, atk:10, lifeOnHit:2}));
  items.push(piece(REAV, 'Ring',   'Ring of the Covenant','rare', {atk:12, lifeOnHit:4}));
  items.push(piece(REAV, 'Amulet', 'Amulet of Saints',    'epic', {hp:120, atk:16, lifeOnHit:5}));

  // ─── IRONGUARD — Unyielding Bulwark (tank set) ───
  const GUARD = 'Unyielding Bulwark';
  items.push(piece(GUARD, 'Weapon', 'Bulwark Hammer',      'epic', {atk:30, hp:150, res:6}));
  items.push(piece(GUARD, 'Helmet', 'Helm of the Unyielding','epic',{hp:360, res:10}));
  items.push(piece(GUARD, 'Chest',  'Mountainous Cuirass', 'epic', {hp:520, res:14}));
  items.push(piece(GUARD, 'Gloves', 'Gauntlets of Iron',   'rare', {hp:180, res:6, atk:12}));
  items.push(piece(GUARD, 'Boots',  'Rooted Greaves',      'rare', {hp:200, res:8}));
  items.push(piece(GUARD, 'Belt',   'Girdle of Stone',     'rare', {hp:220, res:7}));
  items.push(piece(GUARD, 'Ring',   'Signet of the Wall',  'rare', {hp:140, res:5, atk:8}));
  items.push(piece(GUARD, 'Amulet', 'Amulet of the Pillar','epic', {hp:260, res:12, atk:10}));

  // ─── JUGGERNAUT — Titan's Momentum (mobile warrior set) ───
  const JUG = 'Titan\'s Momentum';
  items.push(piece(JUG, 'Weapon', 'Charging Warmaul',   'epic', {atk:42, crit:10, moveSpdPct:6}));
  items.push(piece(JUG, 'Helmet', 'Helm of Charging',   'epic', {hp:240, atk:14, moveSpdPct:8}));
  items.push(piece(JUG, 'Chest',  'Cuirass of Momentum','epic', {hp:340, atk:16, moveSpdPct:6}));
  items.push(piece(JUG, 'Gloves', 'Charging Gauntlets', 'rare', {atk:24, crit:8, moveSpdPct:4}));
  items.push(piece(JUG, 'Boots',  'Stride of Titans',   'rare', {hp:140, moveSpdPct:18, atk:10}));
  items.push(piece(JUG, 'Belt',   'Girdle of Thrust',   'rare', {hp:140, atk:12, moveSpdPct:6}));
  items.push(piece(JUG, 'Ring',   'Ring of Pursuit',    'rare', {atk:14, moveSpdPct:6}));
  items.push(piece(JUG, 'Amulet', 'Amulet of the Charge','epic',{atk:22, crit:12, moveSpdPct:8}));

  // ─── BLOODFORGED — Bloodforged Harness (berserker set) ───
  const BLOOD = 'Bloodforged Harness';
  items.push(piece(BLOOD, 'Weapon', 'Bloodforged Cleaver', 'epic', {atk:48, crit:16, lifeOnHit:5}));
  items.push(piece(BLOOD, 'Helmet', 'Crimson Visage',      'epic', {hp:240, atk:18, crit:8}));
  items.push(piece(BLOOD, 'Chest',  'Harness of Fury',     'epic', {hp:320, atk:22, crit:6}));
  items.push(piece(BLOOD, 'Gloves', 'Gauntlets of Rage',   'rare', {atk:28, crit:12, lifeOnHit:3}));
  items.push(piece(BLOOD, 'Boots',  'Boots of Frenzy',     'rare', {hp:140, atk:14, crit:6}));
  items.push(piece(BLOOD, 'Belt',   'Sash of the Bloodrage','rare',{hp:160, atk:16, crit:5}));
  items.push(piece(BLOOD, 'Ring',   'Band of Rage',        'rare', {atk:16, crit:10, lifeOnHit:3}));
  items.push(piece(BLOOD, 'Amulet', 'Bloodbound Amulet',   'epic', {atk:24, crit:14, lifeOnHit:6}));

  return items;
}

// ═══════ GRANT TEST SETS TO NEW CHARACTERS ═══════════════════════
// Called once on character init. Puts all 6 sets into setStash so player
// can test any preset immediately. Set a flag on player so we don't
// double-grant on reload.
function grantAllPresetSetsForTesting(){
  if(player._testSetsGranted) return;
  const items = buildPresetSetItems();
  // Deep copy each item and scale its stats to player's current level (so
  // test gear doesn't feel weaker than level-scaled drops)
  const levelScale = 1 + Math.max(0, player.level - 1) * 0.03;
  items.forEach(tpl=>{
    const copy = {
      ...tpl,
      stats: scaleItemStats(tpl.stats, (RARITY_STAT_MULT[tpl.rarity]||1.0) * levelScale),
    };
    setStash.push(copy);
  });
  player._testSetsGranted = true;
  addFeed(`⚒ TEST MODE: ${items.length} set pieces added to Set Stash`, '#f59e0b');
  addFeed(`  └ Open Talents panel to apply a preset`, '#9ca3af');
  if(typeof writeSave === 'function') writeSave();
}

// ═══════ PRESET APPLICATION ═══════════════════════════════════════
// Main entry point: wipe current talents, respec into preset's distribution,
// and auto-equip best-matching set gear from stash.
function applyPreset(presetId){
  const preset = BUILD_PRESETS[presetId];
  if(!preset){ addFeed(`Unknown preset: ${presetId}`, '#ef4444'); return; }
  // Guard: preset must match current class
  if(preset.classId !== player.classId){
    addFeed(`${preset.name} is for ${preset.classId.toUpperCase()}, not your class`, '#ef4444');
    return;
  }
  // ─── STEP 1: RESPEC TALENTS ───
  // Refund all current talent points
  const refundedPoints = talentState.pointsEarned || 0;
  talentState.points = refundedPoints;
  talentState.learned = {};
  // Apply preset talent distribution. Skip any talents that don't exist
  // in the current TALENT_TREE (for cross-class or future expansion safety).
  let applied = 0;
  let skipped = 0;
  Object.entries(preset.talentPoints).forEach(([talentId, rank])=>{
    // Find the talent in any branch
    let found = null;
    Object.values(TALENT_TREE).forEach(branch=>{
      if(found) return;
      found = branch.talents.find(t=>t.id === talentId);
    });
    if(!found){
      skipped++;
      return;
    }
    const actualRank = Math.min(rank, found.maxRank);
    if(talentState.points >= actualRank){
      talentState.learned[talentId] = actualRank;
      talentState.points -= actualRank;
      applied += actualRank;
    }
  });
  if(typeof computeTalentBonuses === 'function') computeTalentBonuses();
  // ─── STEP 2: AUTO-EQUIP SET GEAR ───
  // For each gear slot: find the best piece from setStash matching this
  // preset's setName. Move currently equipped item to bag if any.
  let equippedCount = 0;
  GEAR_SLOTS.forEach(slot=>{
    // Find all stash pieces for this preset's set AND this slot
    const candidates = setStash
      .map((item, idx)=>({item, idx}))
      .filter(c => c.item.setName === preset.setName && c.item.slot === slot);
    if(candidates.length === 0) return;
    // Pick the best (highest upgrade level, then highest rarity tier)
    candidates.sort((a,b)=>{
      const aUp = a.item.upgradeLevel || 0;
      const bUp = b.item.upgradeLevel || 0;
      if(aUp !== bUp) return bUp - aUp;
      const rarityOrder = {common:0, uncommon:1, rare:2, epic:3, legendary:4, mythic:5};
      return (rarityOrder[b.item.rarity]||0) - (rarityOrder[a.item.rarity]||0);
    });
    const chosen = candidates[0];
    // Move currently equipped to bag (if any)
    const currentlyEquipped = equipped[slot];
    if(currentlyEquipped){
      if(inventory.length < INVENTORY_MAX){
        inventory.push(currentlyEquipped);
      } else {
        // Bag full — move current equipped to setStash as fallback
        setStash.push(currentlyEquipped);
      }
    }
    // Equip the set piece and remove from setStash
    equipped[slot] = chosen.item;
    setStash.splice(chosen.idx, 1);
    equippedCount++;
  });
  // Refresh everything
  if(typeof recalcStats === 'function') recalcStats();
  if(typeof checkSetBonuses === 'function') checkSetBonuses();
  // Feed messages
  addFeed(`◆ Applied ${preset.name.toUpperCase()} preset`, preset.color);
  addFeed(`  └ ${applied} talent points spent, ${equippedCount} set pieces equipped`, '#9ca3af');
  if(skipped > 0){
    addFeed(`  └ (${skipped} talents skipped — not in ${player.classId} tree yet)`, '#6b7280');
  }
  // Save + refresh UI
  if(typeof writeSave === 'function') writeSave();
  if(typeof renderTalents === 'function') renderTalents();
  if(typeof renderGearPanel === 'function') renderGearPanel();
  if(typeof renderInventory === 'function') renderInventory();
  if(typeof renderSetStash === 'function') renderSetStash();
  return {applied, equippedCount};
}

// ═══════ SET STASH UI ═══════════════════════════════════════════════
// Renders the stash as a grid inside a dedicated tab in the bag panel.
// Players can click to equip-in-place or move to bag.

let _stashSelectedIndex = null;

function renderSetStash(){
  const grid = document.getElementById('setStashGrid');
  const tooltip = document.getElementById('setStashTooltip');
  const countEl = document.getElementById('setStashCountText');
  if(!grid) return;
  if(countEl) countEl.textContent = `${setStash.length} pieces`;
  grid.innerHTML = '';
  // Group by set for nicer display — show one row/section per set
  const bySet = {};
  setStash.forEach((item, idx)=>{
    const setName = item.setName || 'Unknown';
    if(!bySet[setName]) bySet[setName] = [];
    bySet[setName].push({item, idx});
  });
  Object.entries(bySet).forEach(([setName, members])=>{
    const setSection = document.createElement('div');
    setSection.className = 'stash-set-section';
    const header = document.createElement('div');
    header.className = 'stash-set-header';
    header.textContent = `◆ ${setName}  (${members.length} pieces)`;
    setSection.appendChild(header);
    const pieceGrid = document.createElement('div');
    pieceGrid.className = 'stash-piece-grid';
    members.forEach(({item, idx})=>{
      const slot = document.createElement('div');
      slot.className = 'bag-slot filled';
      const col = RARITY_COLORS[item.rarity] || '#9ca3af';
      slot.style.borderColor = col;
      slot.innerHTML = `
        <canvas class="bag-slot-icon-canvas" width="52" height="52"></canvas>
        <span class="bag-slot-rarity" style="background:${col}22;color:${col}">${item.slot}</span>
      `;
      const iconCanvas = slot.querySelector('.bag-slot-icon-canvas');
      if(iconCanvas && typeof drawGearIcon === 'function'){
        drawGearIcon(iconCanvas, item.slot, item.rarity);
      }
      if(idx === _stashSelectedIndex) slot.classList.add('selected');
      slot.addEventListener('click', ()=>{
        _stashSelectedIndex = (_stashSelectedIndex === idx) ? null : idx;
        renderSetStash();
      });
      pieceGrid.appendChild(slot);
    });
    setSection.appendChild(pieceGrid);
    grid.appendChild(setSection);
  });
  // Tooltip for selected item
  if(tooltip){
    if(_stashSelectedIndex === null || !setStash[_stashSelectedIndex]){
      tooltip.style.display = 'none';
    } else {
      const item = setStash[_stashSelectedIndex];
      const col = RARITY_COLORS[item.rarity] || '#9ca3af';
      const statLines = computeStatLines(item);
      const statsHtml = statLines.length
        ? statLines.map(l=>`<div class="bag-stat-line" style="color:${l.color}">${l.text}</div>`).join('')
        : '<div class="bag-stat-line" style="color:#6b4d8a">— no stats —</div>';
      tooltip.innerHTML = `
        <div class="bag-tooltip-header" style="border-color:${col}88">
          <span class="bag-tt-name" style="color:${col}">${itemDisplayName(item)}</span>
          <span class="bag-tt-rarity" style="background:${col}22;color:${col}">${RARITY_LABELS[item.rarity]||'?'}</span>
        </div>
        <div class="bag-tt-slot">${SLOT_ICONS[item.slot]||'✦'} ${item.slot.toUpperCase()}</div>
        <div class="bag-tt-set" style="color:#f59e0b">◆ ${item.setName}</div>
        <div class="bag-tt-section">
          <div class="bag-tt-section-label">Item Stats</div>
          ${statsHtml}
        </div>
        <div class="bag-tt-actions">
          <button class="bag-btn bag-btn-equip">⚔ EQUIP NOW</button>
          <button class="bag-btn bag-btn-tobag">◇ MOVE TO BAG</button>
        </div>
      `;
      tooltip.style.display = 'flex';
      tooltip.style.borderColor = col + '55';
      tooltip.querySelector('.bag-btn-equip').addEventListener('click', ()=>{
        equipFromStash(_stashSelectedIndex);
      });
      tooltip.querySelector('.bag-btn-tobag').addEventListener('click', ()=>{
        moveStashToBag(_stashSelectedIndex);
      });
    }
  }
}

function equipFromStash(stashIdx){
  const item = setStash[stashIdx];
  if(!item) return;
  // Move currently-equipped to inventory (if any)
  const current = equipped[item.slot];
  if(current){
    if(inventory.length < INVENTORY_MAX){
      inventory.push(current);
    } else {
      setStash.push(current); // fallback — bag full, goes to stash
    }
  }
  // Equip the stash item + remove from stash
  equipped[item.slot] = item;
  setStash.splice(stashIdx, 1);
  _stashSelectedIndex = null;
  if(typeof recalcStats === 'function') recalcStats();
  if(typeof checkSetBonuses === 'function') checkSetBonuses();
  addFeed(`✦ Equipped ${item.name}`, RARITY_COLORS[item.rarity] || '#9ca3af');
  if(typeof writeSave === 'function') writeSave();
  renderSetStash();
  if(typeof renderGearPanel === 'function') renderGearPanel();
  if(typeof renderInventory === 'function') renderInventory();
}

function moveStashToBag(stashIdx){
  const item = setStash[stashIdx];
  if(!item) return;
  if(inventory.length >= INVENTORY_MAX){
    addFeed('⚠ Bag is full', '#ef4444');
    return;
  }
  inventory.push(item);
  setStash.splice(stashIdx, 1);
  _stashSelectedIndex = null;
  addFeed(`◇ ${item.name} → bag`, '#6b9acf');
  if(typeof writeSave === 'function') writeSave();
  renderSetStash();
  if(typeof updateInventoryBadge === 'function') updateInventoryBadge();
}

// ═══════ PRESET SELECTOR UI ═══════════════════════════════════════
// Renders available presets for the player's current class. One-click apply.

function renderPresetSelector(){
  const container = document.getElementById('presetSelector');
  if(!container) return;
  container.innerHTML = '';
  // Filter presets to this class
  const available = Object.values(BUILD_PRESETS).filter(p => p.classId === player.classId);
  if(available.length === 0){
    container.innerHTML = '<div class="preset-empty">No presets available for this class yet.</div>';
    return;
  }
  available.forEach(preset=>{
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.style.borderLeft = `4px solid ${preset.color}`;
    // Count how many set pieces player has for this preset
    const inStash = setStash.filter(i => i.setName === preset.setName).length;
    const equippedCount = Object.values(equipped).filter(i => i && i.setName === preset.setName).length;
    const totalSet = inStash + equippedCount;
    card.innerHTML = `
      <div class="preset-card-header">
        <span class="preset-name" style="color:${preset.color}">${preset.name}</span>
        <span class="preset-set-count">${totalSet}/8 set pieces</span>
      </div>
      <div class="preset-tagline">"${preset.tagline}"</div>
      <div class="preset-desc">${preset.description}</div>
      <div class="preset-actions">
        <button class="preset-apply-btn" style="background:${preset.color}22;color:${preset.color};border-color:${preset.color}66">
          ▲ APPLY PRESET
        </button>
      </div>
    `;
    card.querySelector('.preset-apply-btn').addEventListener('click', ()=>{
      if(!confirm(`Apply ${preset.name} preset?\n\nThis will:\n• Respec all talents\n• Auto-equip ${preset.setName} pieces\n• Move currently equipped gear to bag`)){
        return;
      }
      applyPreset(preset.id);
    });
    container.appendChild(card);
  });
}
