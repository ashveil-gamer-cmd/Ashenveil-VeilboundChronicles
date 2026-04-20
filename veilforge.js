// ═══════════════════════════════════════════════════════════════════════
// VEILGATE — Infinite Escalating Endgame Dungeon System
// ═══════════════════════════════════════════════════════════════════════
//
// PURPOSE: Give L40+ players a reason to keep playing. Infinite progression
// through increasingly lethal tiers, with exclusive rewards that can't be
// found anywhere else.
//
// STRUCTURE:
// - Unlocks at L40
// - 10 curated tiers (T1-T10) with hand-designed scaling
// - Beyond T10: "The Endless" — algorithmic scaling, leaderboard-style
// - Each tier has 5 waves + a boss
// - Rewards scale: gold, XP, guaranteed legendary at T5+, mythic uniques at T10+
//
// PLAYER STATE (persisted per-character):
// - bestTierCompleted: highest tier ever cleared
// - attemptedTier: last tier attempted (for quick resume)
// - tierDeaths: number of failed attempts per tier (for display)

const VEILGATE_UNLOCK_LEVEL = 40;

// ─── TIER DEFINITIONS ──────────────────────────────────────────────
// Each tier is a "difficulty stage" with its own HP/atk/count scaling.
// These feel hand-designed up to T10; past T10 is algorithmic.
const VEILGATE_TIERS = [
  // T1 — "Threshold" — slight step up from standard dungeons
  { tier:1,  name:'Threshold of the Veil',    enemyLvBonus:5,  hpMult:1.5,  dmgMult:1.3, waveCount:5, eliteChance:0.20, bossHpMult:150, bossDmgMult:3.5, minRarity:'epic',      bonusGold:500,  flavor:'The first step past the threshold. The Veil thickens here.' },
  { tier:2,  name:'Ashwhisper Chamber',       enemyLvBonus:10, hpMult:1.8,  dmgMult:1.5, waveCount:5, eliteChance:0.25, bossHpMult:180, bossDmgMult:4.0, minRarity:'epic',      bonusGold:800,  flavor:'The voices of the long dead. They speak of the ones behind them.' },
  { tier:3,  name:'Shroudgrave Depths',       enemyLvBonus:15, hpMult:2.2,  dmgMult:1.7, waveCount:5, eliteChance:0.30, bossHpMult:210, bossDmgMult:4.5, minRarity:'legendary', bonusGold:1200, flavor:'Where the first mourner stopped weeping, because they ran out of tears.' },
  { tier:4,  name:'The Fracture',              enemyLvBonus:20, hpMult:2.6,  dmgMult:1.9, waveCount:6, eliteChance:0.35, bossHpMult:240, bossDmgMult:5.0, minRarity:'legendary', bonusGold:1800, flavor:'The Veil is not whole here. Walk carefully.' },
  { tier:5,  name:'Bloodbind Sanctum',         enemyLvBonus:25, hpMult:3.0,  dmgMult:2.2, waveCount:6, eliteChance:0.40, bossHpMult:280, bossDmgMult:5.5, minRarity:'legendary', bonusGold:2500, flavor:'Every pillar is inscribed with a promise. None have been kept.' },
  { tier:6,  name:'Hollow Crown Vault',        enemyLvBonus:30, hpMult:3.5,  dmgMult:2.5, waveCount:7, eliteChance:0.45, bossHpMult:320, bossDmgMult:6.0, minRarity:'legendary', bonusGold:3500, flavor:'A treasury of forgotten kings. They do not like visitors.' },
  { tier:7,  name:'The Screaming Archive',     enemyLvBonus:35, hpMult:4.0,  dmgMult:2.8, waveCount:7, eliteChance:0.50, bossHpMult:360, bossDmgMult:6.5, minRarity:'legendary', bonusGold:5000, flavor:'Every shelf holds a life. Every life is still being lived, somehow.' },
  { tier:8,  name:'Cradle of Unmaking',        enemyLvBonus:40, hpMult:4.6,  dmgMult:3.2, waveCount:8, eliteChance:0.55, bossHpMult:400, bossDmgMult:7.0, minRarity:'mythic',    bonusGold:7500, flavor:'Here the Veil was first broken. Here it can break again.' },
  { tier:9,  name:'The Last Procession',       enemyLvBonus:45, hpMult:5.2,  dmgMult:3.6, waveCount:8, eliteChance:0.60, bossHpMult:450, bossDmgMult:7.5, minRarity:'mythic',    bonusGold:10000, flavor:'They walk in lines. They have been walking for centuries.' },
  { tier:10, name:'The First Hollow',          enemyLvBonus:50, hpMult:6.0,  dmgMult:4.0, waveCount:10, eliteChance:0.70, bossHpMult:500, bossDmgMult:8.0, minRarity:'mythic',    bonusGold:15000, flavor:'The original wound in the Veil. The source of everything that haunts.' },
];

// For tiers beyond T10, generate "endless" tiers algorithmically
function generateEndlessTier(tierNumber){
  if(tierNumber <= 10) return VEILGATE_TIERS[tierNumber - 1];
  // Past T10: each tier adds +6% HP, +5% damage, +3% elite chance
  const base = VEILGATE_TIERS[9]; // T10 as baseline
  const steps = tierNumber - 10;
  return {
    tier: tierNumber,
    name: `The Endless · Stratum ${tierNumber}`,
    enemyLvBonus: 50 + steps * 3,
    hpMult: base.hpMult * Math.pow(1.06, steps),
    dmgMult: base.dmgMult * Math.pow(1.05, steps),
    waveCount: 10,
    eliteChance: Math.min(0.95, base.eliteChance + steps * 0.02),
    bossHpMult: base.bossHpMult * Math.pow(1.08, steps),
    bossDmgMult: base.bossDmgMult * Math.pow(1.06, steps),
    minRarity: 'mythic',
    bonusGold: base.bonusGold + steps * 1000,
    flavor: 'Beyond the last of them. The Veil simply... continues.',
  };
}

function getVeilgateTier(tierNumber){
  if(tierNumber <= 10) return VEILGATE_TIERS[tierNumber - 1];
  return generateEndlessTier(tierNumber);
}

// ─── PLAYER STATE ──────────────────────────────────────────────────
let veilgateState = {
  unlocked: false,
  bestTierCompleted: 0,
  highestTierAttempted: 0,
  tierDeaths: {},   // { tier: deathCount }
  tierClears: {},   // { tier: clearCount }
  activeTier: null, // currently running tier (null when not in Veilgate)
};

// Check if Veilgate should become available to this player
function checkVeilgateUnlock(){
  if(!veilgateState.unlocked && player.level >= VEILGATE_UNLOCK_LEVEL){
    veilgateState.unlocked = true;
    if(typeof addFeed === 'function'){
      addFeed('⚡ THE VEILGATE HAS OPENED ⚡', '#fbbf24');
      addFeed('  The Veilwarden awaits in camp.', '#c4b5fd');
    }
    if(typeof writeSave === 'function') writeSave();
    return true;
  }
  return false;
}

// Unlock conditions for specific tiers — must have cleared previous tier
function canEnterTier(tierNumber){
  if(!veilgateState.unlocked) return { ok:false, reason:'Veilgate not yet unlocked' };
  if(tierNumber < 1) return { ok:false, reason:'Invalid tier' };
  if(tierNumber === 1) return { ok:true };
  // For higher tiers, must have cleared the previous one
  if(veilgateState.bestTierCompleted < tierNumber - 1){
    return { ok:false, reason:`Must clear Tier ${tierNumber - 1} first` };
  }
  return { ok:true };
}

// ─── DUNGEON DEFINITION GENERATION ─────────────────────────────────
// Build a dungeon def on the fly for the requested tier. The existing
// dungeon engine consumes this shape just like the 3 fixed dungeons.
function buildVeilgateDungeonDef(tierNumber){
  const tier = getVeilgateTier(tierNumber);
  const availableTypes = ['skeleton','crawler','wraith','shade','specter','abomination','golem'];
  // Higher tiers have more enemy variety
  const typeCount = Math.min(3 + Math.floor(tierNumber/3), availableTypes.length);
  const types = availableTypes.slice(0, typeCount);

  // Build waves programmatically from tier config
  const waves = [];
  for(let w = 0; w < tier.waveCount; w++){
    // Early waves: mostly normals. Later waves: more elites.
    const waveProgress = w / Math.max(1, tier.waveCount - 1); // 0..1
    const totalCount = 10 + Math.floor(waveProgress * 12); // 10 → 22 enemies
    const eliteCount = Math.floor(totalCount * tier.eliteChance * (0.6 + waveProgress * 0.8));
    waves.push({
      count: totalCount,
      elites: Math.min(eliteCount, totalCount),
      types: types,
    });
  }
  // Final wave is all elites (capstone before boss)
  waves.push({ count: 8, elites: 8, types: types });

  // Boss — enemy type scales by tier; visual pops at higher tiers
  const bossType = types[types.length - 1]; // use rarest type for boss
  return {
    id: `veilgate_t${tierNumber}`,
    name: tier.name,
    desc: tier.flavor,
    minLevel: VEILGATE_UNLOCK_LEVEL,
    tier: Math.min(tierNumber, 10), // visual tier for UI colors
    color: tierNumber >= 10 ? '#fbbf24' : tierNumber >= 5 ? '#c084fc' : '#60a5fa',
    enemyTypes: types,
    // Use theme from a matching existing dungeon for visual variety
    theme: _pickVeilgateTheme(tierNumber),
    waves: waves,
    boss: {
      name: _generateBossName(tierNumber),
      baseType: bossType,
      hpMult: tier.bossHpMult,
      atkMult: tier.bossDmgMult,
      sizeMult: 2.5 + tierNumber * 0.1,
      bossTier: tierNumber >= 7 ? 'majorBoss' : 'minorBoss',
      ability: {
        type: tierNumber >= 5 ? 'bigSwing' : 'summonThralls',
        cooldown: Math.max(3000, 8000 - tierNumber * 300),
        warmup: 1200,
        count: 2 + Math.floor(tierNumber / 3),
      },
    },
    reward: {
      minRarity: tier.minRarity,
      bonusGold: tier.bonusGold,
      bonusXP: 200 + tierNumber * 80,
    },
    // Flag this as a Veilgate run so completion can trigger special rewards
    isVeilgate: true,
    veilgateTier: tierNumber,
  };
}

// Rotate through existing dungeon themes so each Veilgate tier has visual variety
function _pickVeilgateTheme(tierNumber){
  if(typeof DUNGEONS === 'undefined' || !DUNGEONS.length) return null;
  const themes = DUNGEONS.map(d => d.theme).filter(Boolean);
  if(themes.length === 0) return null;
  return themes[(tierNumber - 1) % themes.length];
}

// Procedurally-named bosses — mythic, evocative, unique per tier
const VEILGATE_BOSS_TITLES = [
  'The Unremembered',
  'Sorrow Incarnate',
  'The Fractured Sibling',
  'Voice of the Last Mourner',
  'Bone of the Silent Crown',
  'The One Who Walks Ahead',
  'The Shroudbroken',
  'The Deepest Grief',
  'The Final Procession',
  'The First Hollow',
];

function _generateBossName(tierNumber){
  if(tierNumber <= VEILGATE_BOSS_TITLES.length){
    return VEILGATE_BOSS_TITLES[tierNumber - 1];
  }
  // Endless mode — procedurally compose
  const prefixes = ['The Hollow','The Forgotten','The Nameless','The Endless','The Sundered'];
  const cores = ['Weeper','Warden','Crown','Keeper','Echo','Vessel','Wraith','Hollow'];
  const suffixes = ['of Stratum','in the Depths','Beyond the Veil'];
  const p = prefixes[(tierNumber * 7) % prefixes.length];
  const c = cores[(tierNumber * 13) % cores.length];
  const s = suffixes[(tierNumber * 23) % suffixes.length];
  return `${p} ${c} ${s} ${tierNumber}`;
}

// ─── ENTER / EXIT ──────────────────────────────────────────────────
function enterVeilgate(tierNumber){
  const check = canEnterTier(tierNumber);
  if(!check.ok){
    if(typeof addFeed === 'function') addFeed(`✗ ${check.reason}`, '#ef4444');
    return false;
  }
  const def = buildVeilgateDungeonDef(tierNumber);
  // Track attempt before entering
  veilgateState.activeTier = tierNumber;
  veilgateState.highestTierAttempted = Math.max(veilgateState.highestTierAttempted, tierNumber);
  // Inject def into DUNGEONS temporarily so enterDungeon can find it
  if(typeof DUNGEONS !== 'undefined'){
    const existingIdx = DUNGEONS.findIndex(d => d.id === def.id);
    if(existingIdx >= 0){
      DUNGEONS[existingIdx] = def;
    } else {
      DUNGEONS.push(def);
    }
  }
  // Use existing dungeon entry path
  if(typeof enterDungeon === 'function'){
    enterDungeon(def.id);
    if(typeof addFeed === 'function'){
      addFeed(`⚡ VEILGATE · TIER ${tierNumber}`, '#fbbf24');
      addFeed(`  "${def.desc}"`, '#c4b5fd');
    }
    return true;
  }
  return false;
}

// Called from completeDungeon when a Veilgate run succeeds
function onVeilgateTierComplete(tierNumber){
  veilgateState.tierClears[tierNumber] = (veilgateState.tierClears[tierNumber] || 0) + 1;
  if(tierNumber > veilgateState.bestTierCompleted){
    veilgateState.bestTierCompleted = tierNumber;
    if(typeof addFeed === 'function'){
      addFeed(`★★ NEW BEST · TIER ${tierNumber} CLEARED ★★`, '#fbbf24');
    }
  }
  veilgateState.activeTier = null;
  if(typeof writeSave === 'function') writeSave();
  // Bonus rewards — mythic unique chance, bonus echoes
  _awardVeilgateBonus(tierNumber);
}

// Called when a Veilgate run fails (death in dungeon)
function onVeilgateTierFailed(tierNumber){
  veilgateState.tierDeaths[tierNumber] = (veilgateState.tierDeaths[tierNumber] || 0) + 1;
  veilgateState.activeTier = null;
  if(typeof writeSave === 'function') writeSave();
}

// Bonus reward logic on Veilgate clear
function _awardVeilgateBonus(tierNumber){
  // Echo drops scale with tier
  const echoCount = Math.min(5, 1 + Math.floor(tierNumber / 2));
  if(typeof ECHO_CATALOG !== 'undefined' && typeof addEcho === 'function'){
    // Prefer rare/mythic echoes at higher tiers
    let pool = ECHO_CATALOG.filter(e => !e.classLock || e.classLock === player.classId);
    if(tierNumber >= 7){
      const mythics = pool.filter(e => e.tier === 'mythic');
      if(mythics.length > 0) pool = pool.concat(mythics, mythics); // triple-weight
    } else if(tierNumber >= 4){
      const rares = pool.filter(e => e.tier === 'rare' || e.tier === 'mythic');
      if(rares.length > 0) pool = pool.concat(rares);
    }
    for(let i = 0; i < echoCount; i++){
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if(pick) addEcho(pick.id, 1);
    }
  }
  // Tier 10+ : chance at mythic unique from a curated pool
  if(tierNumber >= 10){
    _awardVeilgateMythicUnique(tierNumber);
  }
}

// Mythic-exclusive uniques only found in Veilgate T10+
function _awardVeilgateMythicUnique(tierNumber){
  const chance = tierNumber === 10 ? 0.50 : Math.min(0.80, 0.50 + (tierNumber - 10) * 0.05);
  if(Math.random() > chance) return;
  if(typeof VEILGATE_MYTHIC_UNIQUES === 'undefined') return;
  const pool = VEILGATE_MYTHIC_UNIQUES.filter(u => !u.classLock || u.classLock === player.classId);
  if(pool.length === 0) return;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  const instance = {
    name: picked.name,
    slot: picked.slot,
    rarity: 'mythic',
    unique: true,
    flavor: picked.flavor,
    classLock: picked.classLock,
    stats: (typeof scaleItemStats === 'function')
      ? scaleItemStats(picked.stats, 1 + Math.max(0, player.level - 1) * 0.01)
      : picked.stats,
    upgradeLevel: 0,
    crafted: false,
  };
  if(typeof tryEquip === 'function') tryEquip(instance);
  if(typeof addFeed === 'function'){
    addFeed(`◆◆◆◆ MYTHIC: ${instance.name.toUpperCase()} ◆◆◆◆`, '#ff6b6b');
    addFeed(`  "${instance.flavor}"`, '#c4b5fd');
  }
  if(typeof screenShake === 'function') screenShake(24, 700);
}

// ─── MYTHIC UNIQUE POOL (Veilgate-only drops) ──────────────────────
// These only drop from T10+ Veilgate clears. Stats significantly higher
// than standard legendary uniques. Class-locked to tie to class identity.
const VEILGATE_MYTHIC_UNIQUES = [
  {
    name: 'The Throatless Choir',
    slot: 'Weapon',
    classLock: 'hollowcaller',
    flavor: 'Every voice that ever fell silent, bound into one weapon. It sings constantly.',
    stats: { atk:60, sm:50, spiritBonus:3, cdr:20 },
  },
  {
    name: 'Bone of the First',
    slot: 'Weapon',
    classLock: 'ironwake',
    flavor: 'Pulled from the skeleton of the first thing that ever died.',
    stats: { atk:80, crit:24, lifeOnHit:15, hp:200 },
  },
  {
    name: 'Crown of the Unmaking',
    slot: 'Helmet',
    classLock: null,
    flavor: 'Worn by no one. Worn by everyone. Worn, regardless.',
    stats: { hp:500, sm:30, atk:25, crit:15 },
  },
  {
    name: 'Mantle of the First Hollow',
    slot: 'Chest',
    classLock: null,
    flavor: 'The first thing to cross the Veil. It has not stopped crossing since.',
    stats: { hp:650, atk:30, cdr:20, res:15 },
  },
  {
    name: 'The Thousand Hands',
    slot: 'Gloves',
    classLock: null,
    flavor: 'Each finger is a different person. All of them dead. All of them yours.',
    stats: { cdr:35, atk:30, crit:18 },
  },
  {
    name: 'Shroud-Walker\'s Tread',
    slot: 'Boots',
    classLock: null,
    flavor: 'Leaves no footprint. Leaves no memory of having been worn.',
    stats: { hp:350, moveSpdPct:25, cdr:18, res:10 },
  },
  {
    name: 'Girdle of Endless Echoes',
    slot: 'Belt',
    classLock: null,
    flavor: 'Every breath you take comes back to you, a hundred thousand times.',
    stats: { hp:400, sm:28, cdr:15, atk:20 },
  },
  {
    name: 'The Final Ring',
    slot: 'Ring',
    classLock: null,
    flavor: 'A circle that closes around everything you have ever lost.',
    stats: { sm:35, crit:20, cdr:18, atk:18 },
  },
  {
    name: 'Amulet of the Hollowed Name',
    slot: 'Amulet',
    classLock: null,
    flavor: 'You wore this before you could remember. You were someone else then.',
    stats: { hp:300, sm:40, atk:25, crit:14, cdr:12 },
  },
];

// ─── SAVE / LOAD ───────────────────────────────────────────────────
function serializeVeilgateState(){
  return JSON.parse(JSON.stringify(veilgateState));
}
function hydrateVeilgateState(data){
  if(!data || typeof data !== 'object') return;
  veilgateState.unlocked = !!data.unlocked;
  veilgateState.bestTierCompleted = data.bestTierCompleted || 0;
  veilgateState.highestTierAttempted = data.highestTierAttempted || 0;
  veilgateState.tierDeaths = data.tierDeaths || {};
  veilgateState.tierClears = data.tierClears || {};
  veilgateState.activeTier = null; // always reset on load — can't resume a run
}

// ─── DEV HELPERS ───────────────────────────────────────────────────
function devUnlockVeilgate(){
  veilgateState.unlocked = true;
  if(typeof addFeed === 'function') addFeed('⚡ DEV: Veilgate unlocked', '#f59e0b');
  if(typeof writeSave === 'function') writeSave();
}
function devSetBestTier(tier){
  veilgateState.bestTierCompleted = tier;
  veilgateState.unlocked = true;
  if(typeof addFeed === 'function') addFeed(`⚡ DEV: best tier = ${tier}`, '#f59e0b');
  if(typeof writeSave === 'function') writeSave();
}

// Expose globals
if(typeof window !== 'undefined'){
  window.VEILGATE_UNLOCK_LEVEL = VEILGATE_UNLOCK_LEVEL;
  window.VEILGATE_TIERS = VEILGATE_TIERS;
  window.VEILGATE_MYTHIC_UNIQUES = VEILGATE_MYTHIC_UNIQUES;
  window.veilgateState = veilgateState;
  window.getVeilgateTier = getVeilgateTier;
  window.canEnterTier = canEnterTier;
  window.enterVeilgate = enterVeilgate;
  window.onVeilgateTierComplete = onVeilgateTierComplete;
  window.onVeilgateTierFailed = onVeilgateTierFailed;
  window.checkVeilgateUnlock = checkVeilgateUnlock;
  window.serializeVeilgateState = serializeVeilgateState;
  window.hydrateVeilgateState = hydrateVeilgateState;
  window.devUnlockVeilgate = devUnlockVeilgate;
  window.devSetBestTier = devSetBestTier;
}

// ═══════════════════════════════════════════════════════════════════════
// VEILGATE UI — Panel render + tier cards
// ═══════════════════════════════════════════════════════════════════════

function openVeilgate(){
  const panel = document.getElementById('veilgatePanel');
  if(!panel) return;
  panel.style.display = 'block';
  renderVeilgate();
}
function closeVeilgate(){
  const panel = document.getElementById('veilgatePanel');
  if(panel) panel.style.display = 'none';
}

function renderVeilgate(){
  const list = document.getElementById('vgTierList');
  const lockBanner = document.getElementById('vgUnlockBanner');
  const statsBanner = document.getElementById('vgStatsBanner');
  if(!list) return;
  list.innerHTML = '';

  // Check unlock state — show banner if not yet unlocked by level
  const isUnlocked = veilgateState.unlocked || player.level >= VEILGATE_UNLOCK_LEVEL;
  if(!isUnlocked){
    if(lockBanner){
      lockBanner.style.display = 'block';
      const lvEl = document.getElementById('vgCurLv');
      if(lvEl) lvEl.textContent = player.level;
      const unlockEl = document.getElementById('vgUnlockLv');
      if(unlockEl) unlockEl.textContent = VEILGATE_UNLOCK_LEVEL;
    }
    if(statsBanner) statsBanner.style.display = 'none';
    return;
  }
  // Unlocked — show stats, hide lock banner
  if(lockBanner) lockBanner.style.display = 'none';
  if(statsBanner){
    statsBanner.style.display = 'flex';
    const best = document.getElementById('vgBestTier');
    const highest = document.getElementById('vgHighestAttempt');
    if(best) best.textContent = veilgateState.bestTierCompleted || 0;
    if(highest) highest.textContent = veilgateState.highestTierAttempted || 0;
  }

  // Ensure unlocked state is set (in case of first time through the check)
  if(!veilgateState.unlocked){
    veilgateState.unlocked = true;
    if(typeof writeSave === 'function') writeSave();
  }

  // Render the 10 curated tiers
  VEILGATE_TIERS.forEach(tier => {
    list.appendChild(_renderVeilgateTierCard(tier.tier));
  });

  // Endless mode — only shown after clearing T10
  if(veilgateState.bestTierCompleted >= 10){
    const endlessDivider = document.createElement('div');
    endlessDivider.className = 'vg-endless-section';
    endlessDivider.innerHTML = '<div class="vg-endless-hdr">✦ THE ENDLESS ✦</div>';
    list.appendChild(endlessDivider);
    // Show current next endless tier + ability to go higher
    const nextEndless = Math.max(11, veilgateState.highestTierAttempted + 1);
    list.appendChild(_renderVeilgateTierCard(nextEndless, true));
    if(veilgateState.highestTierAttempted > 11){
      list.appendChild(_renderVeilgateTierCard(veilgateState.highestTierAttempted, true));
    }
  }
}

function _renderVeilgateTierCard(tierNumber, isEndless=false){
  const tier = getVeilgateTier(tierNumber);
  const check = canEnterTier(tierNumber);
  const cleared = (veilgateState.tierClears[tierNumber] || 0) > 0;
  const deaths = veilgateState.tierDeaths[tierNumber] || 0;
  const clears = veilgateState.tierClears[tierNumber] || 0;

  const card = document.createElement('div');
  card.className = 'vg-tier-card';
  if(check.ok) card.classList.add('available');
  else card.classList.add('locked');
  if(cleared) card.classList.add('completed');
  if(isEndless || tierNumber > 10) card.classList.add('endless');

  const statsHtml = [];
  statsHtml.push(`<span class="vg-tier-stat-chip">LV+${tier.enemyLvBonus}</span>`);
  statsHtml.push(`<span class="vg-tier-stat-chip">${tier.waveCount+1} waves</span>`);
  statsHtml.push(`<span class="vg-tier-stat-chip">${Math.round(tier.hpMult*100)}% HP</span>`);
  if(clears > 0) statsHtml.push(`<span class="vg-tier-stat-chip cleared">${clears} clears</span>`);
  if(deaths > 0) statsHtml.push(`<span class="vg-tier-stat-chip deaths">${deaths} deaths</span>`);

  card.innerHTML = `
    <div class="vg-tier-info">
      <div class="vg-tier-hdr">
        <span class="vg-tier-num">T${tierNumber}</span>
        <span class="vg-tier-name">${_vgEsc(tier.name)}</span>
      </div>
      <div class="vg-tier-flavor">${_vgEsc(tier.flavor)}</div>
      <div class="vg-tier-stats">${statsHtml.join('')}</div>
    </div>
    <button class="vg-tier-enter-btn" ${check.ok ? '' : 'disabled'}>
      ${check.ok ? '⚡ ENTER' : '🔒 LOCKED'}
    </button>
  `;
  if(check.ok){
    const btn = card.querySelector('.vg-tier-enter-btn');
    btn.addEventListener('click', ()=>{
      closeVeilgate();
      enterVeilgate(tierNumber);
    });
  }
  return card;
}

function _vgEsc(s){
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

if(typeof window !== 'undefined'){
  window.openVeilgate = openVeilgate;
  window.closeVeilgate = closeVeilgate;
  window.renderVeilgate = renderVeilgate;
}
