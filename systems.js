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
function rollLoot(level){
  const tierIdx=Math.min(Math.floor(level/20),4);
  const rarities=['common','uncommon','rare','epic','legendary'];
  const rarity=rarities[Math.min(tierIdx+Math.floor(Math.random()*2),4)];
  const filtered=ITEM_POOL.filter(i=>i.rarity===rarity||Math.random()<0.12);
  return {...(filtered.length?filtered[Math.floor(Math.random()*filtered.length)]:ITEM_POOL[Math.floor(Math.random()*ITEM_POOL.length)])};
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

// Called by combat drop logic. Decides: auto-equip if slot empty, else route to bag.
// If bag is full, common/uncommon items auto-salvage into materials so AFK drops
// aren't silently lost. Rare+ items WARN the player but don't auto-consume — the
// player should make that decision.
function acquireLoot(item){
  const current=equipped[item.slot];
  const col=RARITY_COLORS[item.rarity]||'#9ca3af';
  const label=RARITY_LABELS[item.rarity]||'ITEM';
  const icon=SLOT_ICONS[item.slot]||'✦';
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
    const rarityTier={common:0,uncommon:1,rare:2,epic:3,legendary:4,mythic:5}[item.rarity]||0;
    if(rarityTier<=1){
      // Common/uncommon — auto-salvage silently into materials so AFK doesn't waste them
      const yields=salvageYieldFor(item);
      Object.entries(yields).forEach(([mat,qty])=>creditMaterial(mat,qty));
      // Small profession XP even from auto-salvage so AFK contributes to crafting
      const salvageXP = {common:5, uncommon:10}[item.rarity] || 5;
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
          <span class="gear-slot-icon" style="color:${rarityCol}">${slotIcon}</span>
          <span class="gear-slot-name">${slot}</span>
          <span class="gear-rarity-tag" style="color:${rarityCol};border-color:${rarityCol}66;background:${rarityCol}22">${rarityLabel}</span>
        </div>
        <div class="gear-item-name" style="color:${rarityCol};text-shadow:0 0 8px ${rarityCol}44">${item.name} ${craftedBadge}</div>
        <div class="gear-stats-block">${statsHtml}</div>
        ${setLine}
      `;
      // Click-to-select to reveal actions
      if(_gearSelectedSlot===slot){
        div.classList.add('selected');
        const actions=document.createElement('div');
        actions.className='gear-actions';
        actions.innerHTML=`
          <button class="gear-action-btn gear-action-move">◇ MOVE TO BAG</button>
          <button class="gear-action-btn gear-action-salvage">⚒ SALVAGE</button>
        `;
        actions.querySelector('.gear-action-move').addEventListener('click',e=>{e.stopPropagation();unequipToBag(slot);});
        actions.querySelector('.gear-action-salvage').addEventListener('click',e=>{e.stopPropagation();salvageFromGear(slot);});
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
function openProf(){renderProfPanel();document.getElementById('profPanel').style.display='flex';}
function closeProf(){document.getElementById('profPanel').style.display='none';}
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
      // Stats preview — just keys and base numbers so player knows personality
      const statsPreview = Object.entries(r.baseStats).map(([k,v])=>{
        const lbl = (typeof STAT_LABELS!=='undefined'?STAT_LABELS[k]:null) || k;
        return `+${v}-ish ${lbl}`;
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
  const panel=document.getElementById('inventoryPanel');
  if(!panel)return;
  panel.style.display='flex';
  renderInventory();
}
function closeInventory(){
  const panel=document.getElementById('inventoryPanel');
  if(panel)panel.style.display='none';
  _bagSelectedIndex=null;
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
      const icon=SLOT_ICONS[item.slot]||'✦';
      const classification=classifyBagItem(item);
      const mark=UPGRADE_MARKS[classification];
      slot.classList.add('filled');
      slot.style.borderColor=col;
      slot.innerHTML=`
        <span class="bag-slot-mark" style="color:${mark.color};text-shadow:0 0 8px ${mark.color}88" title="${mark.title}">${mark.symbol}</span>
        <span class="bag-slot-icon" style="color:${col};text-shadow:0 0 8px ${col}66">${icon}</span>
        <span class="bag-slot-rarity" style="background:${col}22;color:${col}">${RARITY_LABELS[item.rarity]||'?'}</span>
      `;
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

      tooltip.innerHTML=`
        <div class="bag-tooltip-header" style="border-color:${col}88">
          <span class="bag-tt-name" style="color:${col};text-shadow:0 0 10px ${col}66">${item.name}</span>
          <span class="bag-tt-rarity" style="background:${col}22;color:${col}">${RARITY_LABELS[item.rarity]||'?'}</span>
        </div>
        <div class="bag-tt-slot">${SLOT_ICONS[item.slot]||'✦'} ${item.slot.toUpperCase()}</div>
        ${item.setName?`<div class="bag-tt-set">◈ ${item.setName} set</div>`:''}
        ${classBanner}
        <div class="bag-tt-section">
          <div class="bag-tt-section-label">Item Stats</div>
          ${statsHtml}
        </div>
        ${current?`<div class="bag-tt-section">
          <div class="bag-tt-section-label">vs. Equipped (${current.name})</div>
          ${diffHtml||'<div class="bag-stat-line" style="color:#6b4d8a">— identical —</div>'}
        </div>`:''}
        <div class="bag-tt-section bag-tt-salvage-preview">
          <div class="bag-tt-section-label">Salvage Yield</div>
          <div class="bag-stat-line">${salvagePreview}</div>
        </div>
        <div class="bag-tt-actions">
          <button class="bag-btn bag-btn-equip">⚔ EQUIP</button>
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
};

// Compute a gear item's shop price from its rarity + level
function priceForItem(item){
  const rarityMult = {common:1,uncommon:2.5,rare:6,epic:14,legendary:35,mythic:80}[item.rarity] || 1;
  const levelMult = 1 + Math.max(1, player.level) * 0.12;
  return Math.ceil(45 * rarityMult * levelMult);
}

// Generate a fresh shop rotation of gear
function refreshShop(silent = false){
  shopState.gear = [];
  // Bias the rotation toward items near player level + their rarities
  for (let i = 0; i < SHOP_GEAR_COUNT; i++){
    const item = rollLoot(player.level);
    item.shopPrice = priceForItem(item);
    shopState.gear.push(item);
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
            <span class="shop-gear-icon" style="color:${col};text-shadow:0 0 8px ${col}66">${icon}</span>
            <span class="shop-gear-rarity" style="background:${col}22;color:${col}">${label}</span>
          </div>
          <div class="shop-gear-name" style="color:${col}">${item.name}</div>
          <div class="shop-gear-slot">${item.slot}</div>
          <div class="shop-gear-stats">${statsSummary}</div>
          <button class="shop-buy-btn" ${canAfford?'':'disabled'}>${item.shopPrice} G</button>
        `;
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
