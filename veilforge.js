// ═══════════════════════════════════════════════════════════════════════
// VEILFORGE — The Echo Customization System
// ═══════════════════════════════════════════════════════════════════════
//
// DESIGN PHILOSOPHY (not Diablo/PoE runes):
// Every ability is a "conduit" to the Veil. As the player levels, they
// unlock conduit SLOTS on each ability. They collect VEIL ECHOES from
// bosses, zone events, and world content. Echoes plug into slots to
// fundamentally change how abilities work — shape, element, behavior.
//
// KEY DIFFERENCES FROM DIABLO RUNES:
//   - Echoes are COLLECTED from specific sources, not menu-unlocked
//   - Up to 5 echoes can STACK on one ability (slots unlock 10/20/35/50/75)
//   - Echoes combine multiplicatively — emergent behaviors
//   - Reforging costs materials, so commitments matter
//   - Some echoes are class-locked, most are universal
//
// ECHO TYPES:
//   Shape     — modifies geometry/appearance (beam → cone → orbital → chain)
//   Element   — modifies damage type/color (shadow → fire → void → blood)
//   Behavior  — modifies mechanics (pierce → bounce → home → persist)
//   Resonance — modifies interactions with other abilities/enemies
//
// SLOT UNLOCK SCHEDULE PER ABILITY:
//   Level 10: +1 Shape slot
//   Level 20: +1 Element slot
//   Level 35: +1 Behavior slot
//   Level 50: +1 Resonance slot
//   Level 75: +1 bonus slot (any type)
//
// A level 75 character has 5 slots × 5 abilities = 25 echoes active.

// ─── ECHO TYPES ─────────────────────────────────────────────────────
const ECHO_TYPES = {
  shape:     { color:'#c084fc', icon:'◇', label:'SHAPE' },
  element:   { color:'#ef4444', icon:'◆', label:'ELEMENT' },
  behavior:  { color:'#60a5fa', icon:'◈', label:'BEHAVIOR' },
  resonance: { color:'#fbbf24', icon:'✹', label:'RESONANCE' },
};

// ─── CONDUIT SLOT UNLOCKS PER LEVEL ─────────────────────────────────
// Returns array of slot definitions available at this level
// Each slot: {index, type, unlockLevel}
function getUnlockedConduitSlots(level){
  const slots = [];
  if(level >= 10) slots.push({index:0, type:'shape',     unlockLevel:10});
  if(level >= 20) slots.push({index:1, type:'element',   unlockLevel:20});
  if(level >= 35) slots.push({index:2, type:'behavior',  unlockLevel:35});
  if(level >= 50) slots.push({index:3, type:'resonance', unlockLevel:50});
  if(level >= 75) slots.push({index:4, type:'any',       unlockLevel:75});
  return slots;
}

// ─── ECHO CATALOG ───────────────────────────────────────────────────
// Each echo has:
//   id:           unique identifier (snake_case)
//   name:         display name (evocative, thematic)
//   type:         'shape' | 'element' | 'behavior' | 'resonance'
//   tier:         'common' | 'uncommon' | 'rare' | 'mythic' — affects rarity/power
//   classLock:    null | 'hollowcaller' | 'ironwake' — null = universal
//   abilityLock:  null | ['raise','veilmark',...] — which abilities it fits (null = all)
//   description:  flavor + mechanical summary
//   effects:      { key: value } — modifiers applied to the ability
//   dropSource:   lore-text hint about where it comes from (for hunt-lists)
//
// Effect keys (sampling — extend as abilities consume them):
//   dmgMult, radiusMult, countMult, speedMult — numeric stat changes
//   addPierce, addChain, addHoming — boolean-ish behavior flags
//   elementTint — color override for VFX
//   shapeOverride — 'cone', 'beam', 'orbit', 'chain', etc.

const ECHO_CATALOG = [
  // ═══ SHAPE ECHOES ═══════════════════════════════════════════════
  // These fundamentally change the geometry/visual of an ability.
  {
    id: 'echo_piercing_line',
    name: 'Echo of the Piercing Line',
    type: 'shape', tier: 'common',
    classLock: null, abilityLock: null,
    description: 'The ability becomes a straight line that passes through all enemies in its path.',
    effects: { shapeOverride:'line', addPierce:true, dmgMult:0.85 },
    dropSource: 'Skeletal Archers in the Ashen Wastes.',
  },
  {
    id: 'echo_scattering_burst',
    name: 'Echo of the Scattering Burst',
    type: 'shape', tier: 'common',
    classLock: null, abilityLock: null,
    description: 'The ability splits into a scattering cone of projectiles.',
    effects: { shapeOverride:'cone', countMult:3, dmgMult:0.55 },
    dropSource: 'Abominations in the Ashen Cathedral.',
  },
  {
    id: 'echo_wide_arc',
    name: 'Echo of the Wide Arc',
    type: 'shape', tier: 'uncommon',
    classLock: null, abilityLock: null,
    description: 'The ability sweeps in a broad arc around you.',
    effects: { shapeOverride:'arc', radiusMult:1.6 },
    dropSource: 'Elite wraiths in the Wraith Sanctum.',
  },
  {
    id: 'echo_orbital',
    name: 'Echo of the Orbiting Path',
    type: 'shape', tier: 'rare',
    classLock: null, abilityLock: null,
    description: 'Projectiles orbit around you before striking their target.',
    effects: { shapeOverride:'orbit', addPierce:true, dmgMult:1.2 },
    dropSource: 'The Sorrowed Specter boss.',
  },
  {
    id: 'echo_chain_lightning',
    name: 'Echo of the Forked Path',
    type: 'shape', tier: 'rare',
    classLock: null, abilityLock: null,
    description: 'The ability chains to up to 5 additional targets.',
    effects: { addChain:5, dmgMult:0.75 },
    dropSource: 'Void shrines scattered across all zones.',
  },
  {
    id: 'echo_meteoric',
    name: 'Echo of the Falling Sky',
    type: 'shape', tier: 'mythic',
    classLock: null, abilityLock: null,
    description: 'The ability crashes down from above in a massive impact.',
    effects: { shapeOverride:'meteor', radiusMult:2.0, dmgMult:2.2 },
    dropSource: 'Unknown. Rumored to drop from the First Hollow.',
  },

  // ═══ ELEMENT ECHOES ═════════════════════════════════════════════
  // These apply a damage-type theme and color.
  {
    id: 'echo_shadow',
    name: 'Echo of the Deep Shadow',
    type: 'element', tier: 'common',
    classLock: null, abilityLock: null,
    description: 'Ability damage becomes shadow. +15% damage vs living enemies.',
    effects: { elementTint:'#4c1d95', dmgMult:1.05, dmgVsLivingMult:1.15 },
    dropSource: 'Wraiths of any tier.',
  },
  {
    id: 'echo_ember',
    name: 'Echo of the Eternal Ember',
    type: 'element', tier: 'common',
    classLock: null, abilityLock: null,
    description: 'Ability ignites. Targets burn for 3s, taking damage over time.',
    effects: { elementTint:'#f59e0b', burnDuration:3000, burnDps:0.2 },
    dropSource: 'The Cathedral Warden boss (Ashen Cathedral).',
  },
  {
    id: 'echo_void',
    name: 'Echo of the Void Between',
    type: 'element', tier: 'uncommon',
    classLock: null, abilityLock: null,
    description: 'Ability corrodes reality. Enemies hit take 20% more damage from ALL sources for 4s.',
    effects: { elementTint:'#c084fc', vulnerabilityPct:20, vulnerabilityDuration:4000 },
    dropSource: 'Specters at night in the Wraith Sanctum.',
  },
  {
    id: 'echo_bloodsteal',
    name: 'Echo of the Red Current',
    type: 'element', tier: 'uncommon',
    classLock: null, abilityLock: null,
    description: 'Ability damage heals you for 10% dealt.',
    effects: { elementTint:'#ef4444', lifestealPct:10 },
    dropSource: 'The Bone Revenant boss (Hollow Crypt).',
  },
  {
    id: 'echo_frost',
    name: 'Echo of the Bitter Cold',
    type: 'element', tier: 'rare',
    classLock: null, abilityLock: null,
    description: 'Ability chills enemies, slowing them 40% for 2s.',
    effects: { elementTint:'#93c5fd', chillDuration:2000, chillSlowPct:40 },
    dropSource: 'Shades in the depths of the Wraith Sanctum.',
  },
  {
    id: 'echo_radiant',
    name: 'Echo of the Dawn',
    type: 'element', tier: 'mythic',
    classLock: null, abilityLock: null,
    description: 'Ability deals holy damage. +50% vs undead. Heals allies.',
    effects: { elementTint:'#fde68a', dmgMult:1.25, dmgVsUndeadMult:1.5, healsSpirits:true },
    dropSource: 'Dawn shrines that only appear at rare events.',
  },

  // ═══ BEHAVIOR ECHOES ════════════════════════════════════════════
  // Change how the ability acts mechanically — persistence, returning, etc.
  {
    id: 'echo_homing',
    name: 'Echo of the Seeking Hand',
    type: 'behavior', tier: 'uncommon',
    classLock: null, abilityLock: null,
    description: 'Ability homes toward the nearest enemy.',
    effects: { addHoming:true, dmgMult:1.1 },
    dropSource: 'Crawlers in the Ashen Wastes (drops rarely).',
  },
  {
    id: 'echo_splitting',
    name: 'Echo of the Splintering',
    type: 'behavior', tier: 'uncommon',
    classLock: null, abilityLock: null,
    description: 'On impact, ability splits into 3 smaller fragments.',
    effects: { splitOnImpact:3, splitDmgMult:0.4 },
    dropSource: 'Abominations in the Ashen Cathedral.',
  },
  {
    id: 'echo_returning',
    name: 'Echo of the Returning Tide',
    type: 'behavior', tier: 'rare',
    classLock: null, abilityLock: null,
    description: 'Ability returns to you after reaching peak range, dealing damage again.',
    effects: { returns:true, returnDmgMult:0.7 },
    dropSource: 'Wraith Sanctum at dawn.',
  },
  {
    id: 'echo_delayed_blast',
    name: 'Echo of the Pregnant Pause',
    type: 'behavior', tier: 'rare',
    classLock: null, abilityLock: null,
    description: 'Ability lingers for 1s before detonating, allowing enemies to gather.',
    effects: { delayMs:1000, dmgMult:1.8, radiusMult:1.3 },
    dropSource: 'Rare Veil storms in combat zones.',
  },
  {
    id: 'echo_persistent',
    name: 'Echo of the Lingering Wound',
    type: 'behavior', tier: 'rare',
    classLock: null, abilityLock: null,
    description: 'Ability leaves a 4-second damaging zone at impact.',
    effects: { leavesPool:true, poolDuration:4000, poolDmgPerSec:0.3 },
    dropSource: 'The Bone Revenant on high-level clears.',
  },
  {
    id: 'echo_echoing',
    name: 'Echo of the Echoing Self',
    type: 'behavior', tier: 'mythic',
    classLock: null, abilityLock: null,
    description: 'Ability casts itself a second time, 0.5s later, for 60% damage.',
    effects: { recastDelay:500, recastDmgMult:0.6 },
    dropSource: 'Completing all 3 dungeons without dying.',
  },

  // ═══ RESONANCE ECHOES ═══════════════════════════════════════════
  // High-level echoes that create cross-ability synergies.
  {
    id: 'echo_veilmark_resonance',
    name: 'Echo of the Marked Flesh',
    type: 'resonance', tier: 'rare',
    classLock: 'hollowcaller', abilityLock: null,
    description: 'Ability applies 2 Veilmark stacks on hit.',
    effects: { appliesVeilmark:2 },
    dropSource: 'Crimson Harvest events in the Mire.',
  },
  {
    id: 'echo_spirit_resonance',
    name: 'Echo of the Bound Chord',
    type: 'resonance', tier: 'rare',
    classLock: 'hollowcaller', abilityLock: null,
    description: 'Ability empowers your spirits — they deal +50% damage for 5s.',
    effects: { empowersSpirits:true, spiritEmpowerPct:50, spiritEmpowerDur:5000 },
    dropSource: 'Necrolord altars in Hollow Crypt.',
  },
  {
    id: 'echo_momentum_resonance',
    name: 'Echo of the Gathering Storm',
    type: 'resonance', tier: 'rare',
    classLock: 'ironwake', abilityLock: null,
    description: 'Ability grants 2 Momentum stacks per enemy hit.',
    effects: { grantsMomentum:2 },
    dropSource: 'Juggernaut trials in the Cathedral.',
  },
  {
    id: 'echo_bloodrush_resonance',
    name: 'Echo of the Crimson Tide',
    type: 'resonance', tier: 'rare',
    classLock: 'ironwake', abilityLock: null,
    description: 'Ability consumes 5% HP to deal +60% damage.',
    effects: { consumesHpPct:5, conditionalDmgMult:1.6 },
    dropSource: 'Bloodforged shrines in high-level zones.',
  },
  {
    id: 'echo_cooldown_resonance',
    name: 'Echo of the Unbound Time',
    type: 'resonance', tier: 'mythic',
    classLock: null, abilityLock: null,
    description: 'On kill, reduce this ability\'s remaining cooldown by 2s.',
    effects: { cdrOnKillMs:2000 },
    dropSource: 'Temporal anomalies. Very rare.',
  },
  {
    id: 'echo_execution_resonance',
    name: 'Echo of the Final Breath',
    type: 'resonance', tier: 'mythic',
    classLock: null, abilityLock: null,
    description: 'Ability deals triple damage to enemies below 20% HP.',
    effects: { executionThreshold:0.20, executionDmgMult:3.0 },
    dropSource: 'Slaying 100 elite enemies with executions.',
  },

  // ═══ CLASS-SPECIFIC SIGNATURE ECHOES ════════════════════════════
  // Deep class fantasy — these don't cross between classes.
  {
    id: 'echo_raise_legion',
    name: 'Echo of the Fallen Legion',
    type: 'shape', tier: 'mythic',
    classLock: 'hollowcaller', abilityLock: ['raise'],
    description: 'Raise Spirit summons 3 spirits at once, all empowered.',
    effects: { shapeOverride:'triple_summon', countMult:3, spiritDmgMult:1.3 },
    dropSource: 'The First Hollow in the Veilgate (endgame).',
  },
  {
    id: 'echo_detonate_cataclysm',
    name: 'Echo of the Cataclysm',
    type: 'behavior', tier: 'mythic',
    classLock: 'hollowcaller', abilityLock: ['detonate'],
    description: 'Detonate triggers a chain reaction — each enemy hit detonates their own marks.',
    effects: { chainDetonates:true, dmgMult:1.5 },
    dropSource: 'Final wave of Ashen Cathedral (elite kills unlock it).',
  },
  {
    id: 'echo_anchor_earthrend',
    name: 'Echo of the Earthrend',
    type: 'shape', tier: 'rare',
    classLock: 'ironwake', abilityLock: ['anchor'],
    description: 'Anchor Strike cracks the earth in a line, stunning enemies struck.',
    effects: { shapeOverride:'line_stun', stunDuration:1500, dmgMult:1.3 },
    dropSource: 'Stone shrines in the Crypts.',
  },
  {
    id: 'echo_bulwark_pillar',
    name: 'Echo of the Pillar',
    type: 'behavior', tier: 'rare',
    classLock: 'ironwake', abilityLock: ['bulwark'],
    description: 'Bulwark also pulls 3 enemies toward you on activation.',
    effects: { pullOnCast:3, pullRange:400 },
    dropSource: 'The Cathedral Warden on Hard clears.',
  },

  // ═══ COMMON FILLER ECHOES ═══════════════════════════════════════
  // Cheap drops that still do something useful. These ensure the player
  // ALWAYS has echoes to plug into newly-unlocked slots.
  {
    id: 'echo_sharpened',
    name: 'Echo of the Sharpened Edge',
    type: 'element', tier: 'common',
    classLock: null, abilityLock: null,
    description: 'Ability deals +10% damage.',
    effects: { dmgMult:1.10 },
    dropSource: 'Any enemy, very common.',
  },
  {
    id: 'echo_quickened',
    name: 'Echo of the Quickened Hand',
    type: 'behavior', tier: 'common',
    classLock: null, abilityLock: null,
    description: 'Ability cooldown reduced by 15%.',
    effects: { cdrMult:0.85 },
    dropSource: 'Any enemy, very common.',
  },
  {
    id: 'echo_expansive',
    name: 'Echo of the Wider Grasp',
    type: 'shape', tier: 'common',
    classLock: null, abilityLock: null,
    description: 'Ability radius increased by 20%.',
    effects: { radiusMult:1.20 },
    dropSource: 'Any enemy, moderately common.',
  },
  {
    id: 'echo_heavy',
    name: 'Echo of the Weighted Strike',
    type: 'element', tier: 'common',
    classLock: null, abilityLock: null,
    description: 'Ability deals +20% damage but cooldown +10%.',
    effects: { dmgMult:1.20, cdrMult:1.10 },
    dropSource: 'Any enemy, common.',
  },
  {
    id: 'echo_twin',
    name: 'Echo of the Twin Strike',
    type: 'behavior', tier: 'uncommon',
    classLock: null, abilityLock: null,
    description: 'Ability hits twice, each for 60% damage.',
    effects: { hitsCount:2, dmgMult:0.6 },
    dropSource: 'Elites of any tier.',
  },
];

// Quick-lookup by id — populated at load
const ECHO_BY_ID = {};
ECHO_CATALOG.forEach(e => { ECHO_BY_ID[e.id] = e; });

// ─── PLAYER VEILFORGE STATE ─────────────────────────────────────────
// inventory: echoes the player has collected but not slotted (stackable by id, count)
// slotted:   map of {abilityId: [echoId|null × 5]}
//            5 slots per ability, indexed by slot.index. null = empty.
//
// This state is serialized to the save file. It's per-character.

let veilforgeState = {
  inventory: {},      // {echoId: count}
  slotted: {},        // {abilityId: [slot0, slot1, slot2, slot3, slot4]}
};

// ─── ABILITIES LOOKUP ───────────────────────────────────────────────
// Gets the current active abilities for the player's class (and preset if active).
// Returns [{id, name}] in slot order Q/W/E/R/Ult.
function getPlayerAbilities(){
  if(typeof player === 'undefined' || !player.classId) return [];
  const cls = CLASS_DEFS[player.classId];
  if(!cls) return [];
  return cls.abilities.slice(0, 5);
}

// Ensures the slotted structure exists for each ability. Returns it.
function ensureSlottedForAbility(abilityId){
  if(!veilforgeState.slotted[abilityId]){
    veilforgeState.slotted[abilityId] = [null, null, null, null, null];
  }
  return veilforgeState.slotted[abilityId];
}

// ─── ECHO INVENTORY MANAGEMENT ──────────────────────────────────────
function addEcho(echoId, count=1){
  if(!ECHO_BY_ID[echoId]){
    console.warn(`[VEILFORGE] Unknown echo id: ${echoId}`);
    return false;
  }
  veilforgeState.inventory[echoId] = (veilforgeState.inventory[echoId] || 0) + count;
  const echo = ECHO_BY_ID[echoId];
  if(typeof addFeed === 'function'){
    addFeed(`◇ ECHO COLLECTED: ${echo.name}`, ECHO_TYPES[echo.type]?.color || '#c4b5fd');
  }
  if(typeof writeSave === 'function') writeSave();
  return true;
}

function removeEcho(echoId, count=1){
  if(!veilforgeState.inventory[echoId]) return false;
  veilforgeState.inventory[echoId] -= count;
  if(veilforgeState.inventory[echoId] <= 0){
    delete veilforgeState.inventory[echoId];
  }
  return true;
}

function getInventoryCount(echoId){
  return veilforgeState.inventory[echoId] || 0;
}

// Returns echoes grouped by type for the inventory UI
function getInventoryByType(){
  const byType = { shape:[], element:[], behavior:[], resonance:[] };
  Object.entries(veilforgeState.inventory).forEach(([id, count])=>{
    const e = ECHO_BY_ID[id];
    if(!e || count <= 0) return;
    byType[e.type].push({ echo:e, count });
  });
  return byType;
}

// ─── SLOT MANAGEMENT ────────────────────────────────────────────────
// Place an echo from inventory into a specific slot on an ability.
// - Validates slot is unlocked for player's level
// - Validates echo type matches slot type (except slot 4 = 'any')
// - Validates class/ability lock
// - Returns {success, reason}
function slotEcho(abilityId, slotIndex, echoId){
  const echo = ECHO_BY_ID[echoId];
  if(!echo) return { success:false, reason:'Unknown echo' };
  if(!getInventoryCount(echoId)) return { success:false, reason:'Not in inventory' };
  // Validate slot unlocked
  const slots = getUnlockedConduitSlots(player.level);
  const slot = slots.find(s => s.index === slotIndex);
  if(!slot) return { success:false, reason:`Slot ${slotIndex+1} not yet unlocked` };
  // Validate echo type matches slot type (or slot is 'any')
  if(slot.type !== 'any' && echo.type !== slot.type){
    return { success:false, reason:`${echo.name} is ${echo.type.toUpperCase()}, slot wants ${slot.type.toUpperCase()}` };
  }
  // Validate class lock
  if(echo.classLock && echo.classLock !== player.classId){
    return { success:false, reason:`${echo.name} is for ${echo.classLock.toUpperCase()} only` };
  }
  // Validate ability lock
  if(echo.abilityLock && !echo.abilityLock.includes(abilityId)){
    return { success:false, reason:`${echo.name} only fits: ${echo.abilityLock.join(', ')}` };
  }
  // If slot currently has another echo, return it to inventory first
  const slots_arr = ensureSlottedForAbility(abilityId);
  const existing = slots_arr[slotIndex];
  if(existing){
    veilforgeState.inventory[existing] = (veilforgeState.inventory[existing] || 0) + 1;
  }
  // Place the new echo, consume from inventory
  slots_arr[slotIndex] = echoId;
  removeEcho(echoId, 1);
  if(typeof writeSave === 'function') writeSave();
  return { success:true };
}

// Remove an echo from a slot (returns to inventory)
function unslotEcho(abilityId, slotIndex){
  const slots_arr = ensureSlottedForAbility(abilityId);
  const existing = slots_arr[slotIndex];
  if(!existing) return { success:false, reason:'Slot already empty' };
  veilforgeState.inventory[existing] = (veilforgeState.inventory[existing] || 0) + 1;
  slots_arr[slotIndex] = null;
  if(typeof writeSave === 'function') writeSave();
  return { success:true };
}

// Returns the full echo objects currently slotted on an ability
function getSlottedEchoes(abilityId){
  const slots_arr = veilforgeState.slotted[abilityId] || [null,null,null,null,null];
  return slots_arr.map((id, idx) => {
    if(!id) return { index:idx, echo:null };
    return { index:idx, echo:ECHO_BY_ID[id] || null };
  });
}

// ─── ABILITY EFFECT AGGREGATION ─────────────────────────────────────
// This is what ability code calls to learn what echoes have been applied.
// Returns a merged effect object — all effects from all slotted echoes
// combined multiplicatively where appropriate, additively where noted.
//
// Usage pattern in ability code:
//   const mods = getAbilityEchoModifiers('raise');
//   const finalDmg = baseDmg * (mods.dmgMult || 1);
//   if(mods.addHoming) enableHomingOnProjectile();
//
// NOTE: Ability code has to opt in — echoes only matter if the ability
// reads the relevant key. We'll wire this into the ability code over
// successive sessions.

function getAbilityEchoModifiers(abilityId){
  const mods = {
    dmgMult: 1.0,
    radiusMult: 1.0,
    countMult: 1.0,
    speedMult: 1.0,
    cdrMult: 1.0,
    // Booleans default to false — echoes set them true
    addPierce: false,
    addChain: 0,
    addHoming: false,
    returns: false,
    leavesPool: false,
    chainDetonates: false,
    appliesVeilmark: 0,
    grantsMomentum: 0,
    // Rich data
    shapeOverride: null,
    elementTint: null,
    activeEchoes: [],  // list of echo objects applied (for UI display)
  };
  const slotted = getSlottedEchoes(abilityId);
  slotted.forEach(({echo}) => {
    if(!echo) return;
    mods.activeEchoes.push(echo);
    const e = echo.effects || {};
    // Multiplicatives
    if(typeof e.dmgMult === 'number')    mods.dmgMult    *= e.dmgMult;
    if(typeof e.radiusMult === 'number') mods.radiusMult *= e.radiusMult;
    if(typeof e.countMult === 'number')  mods.countMult  *= e.countMult;
    if(typeof e.speedMult === 'number')  mods.speedMult  *= e.speedMult;
    if(typeof e.cdrMult === 'number')    mods.cdrMult    *= e.cdrMult;
    // Additives (for counts)
    if(typeof e.addChain === 'number')    mods.addChain        += e.addChain;
    if(typeof e.appliesVeilmark === 'number') mods.appliesVeilmark += e.appliesVeilmark;
    if(typeof e.grantsMomentum === 'number')  mods.grantsMomentum  += e.grantsMomentum;
    // Booleans — any echo enabling means yes
    if(e.addPierce)       mods.addPierce = true;
    if(e.addHoming)       mods.addHoming = true;
    if(e.returns)         mods.returns = true;
    if(e.leavesPool)      mods.leavesPool = true;
    if(e.chainDetonates)  mods.chainDetonates = true;
    // Last-write-wins for overrides
    if(e.shapeOverride)   mods.shapeOverride = e.shapeOverride;
    if(e.elementTint)     mods.elementTint = e.elementTint;
    // Merge richer fields
    Object.keys(e).forEach(k => {
      if(!(k in mods)) mods[k] = e[k];
    });
  });
  return mods;
}

// ─── DROP INTEGRATION ───────────────────────────────────────────────
// Called from game.js when an enemy dies. Rolls echo drops based on
// enemy type / boss status / zone. This is a simple first-pass system
// — can be extended with curated boss tables later.
function rollEchoDropOnKill(enemy){
  if(!enemy || enemy.dead === false) return;
  // Drop rate varies by enemy strength
  let dropChance = 0;
  if(enemy.isBoss) dropChance = 1.0;        // guaranteed on boss kill
  else if(enemy.isElite) dropChance = 0.04; // 4% on elites
  else dropChance = 0.005;                   // 0.5% on commons
  if(Math.random() > dropChance) return;

  // Filter pool by class lock (show class-locked echoes only for that class)
  // and by tier (bosses drop rarer echoes)
  let pool = ECHO_CATALOG.filter(e => !e.classLock || e.classLock === player.classId);
  if(enemy.isBoss){
    // Bosses prefer rare/mythic
    const rareOrMythic = pool.filter(e => e.tier === 'rare' || e.tier === 'mythic');
    if(rareOrMythic.length > 0) pool = rareOrMythic;
  } else if(enemy.isElite){
    // Elites prefer uncommon/rare
    const uncommonOrRare = pool.filter(e => e.tier === 'uncommon' || e.tier === 'rare');
    if(uncommonOrRare.length > 0) pool = uncommonOrRare;
  } else {
    // Commons prefer common filler
    const commonOnly = pool.filter(e => e.tier === 'common');
    if(commonOnly.length > 0) pool = commonOnly;
  }

  // Pick one at random
  if(pool.length === 0) return;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  addEcho(picked.id, 1);
}

// ─── SAVE / LOAD HOOKS ──────────────────────────────────────────────
function serializeVeilforgeState(){
  return JSON.parse(JSON.stringify(veilforgeState));
}
function hydrateVeilforgeState(data){
  if(!data || typeof data !== 'object') return;
  veilforgeState.inventory = data.inventory || {};
  veilforgeState.slotted = data.slotted || {};
}

// ─── DEV HELPERS ────────────────────────────────────────────────────
function devGrantAllEchoes(count=2){
  ECHO_CATALOG.forEach(e => addEcho(e.id, count));
  if(typeof addFeed === 'function') addFeed(`⚡ DEV: granted ${count} of every echo`, '#f59e0b');
}
function devClearVeilforge(){
  veilforgeState.inventory = {};
  veilforgeState.slotted = {};
  if(typeof addFeed === 'function') addFeed('⟲ Veilforge cleared', '#9ca3af');
  if(typeof writeSave === 'function') writeSave();
}

// Expose global API
if(typeof window !== 'undefined'){
  window.ECHO_CATALOG = ECHO_CATALOG;
  window.ECHO_BY_ID = ECHO_BY_ID;
  window.ECHO_TYPES = ECHO_TYPES;
  window.getUnlockedConduitSlots = getUnlockedConduitSlots;
  window.addEcho = addEcho;
  window.removeEcho = removeEcho;
  window.getInventoryCount = getInventoryCount;
  window.getInventoryByType = getInventoryByType;
  window.slotEcho = slotEcho;
  window.unslotEcho = unslotEcho;
  window.getSlottedEchoes = getSlottedEchoes;
  window.getAbilityEchoModifiers = getAbilityEchoModifiers;
  window.rollEchoDropOnKill = rollEchoDropOnKill;
  window.serializeVeilforgeState = serializeVeilforgeState;
  window.hydrateVeilforgeState = hydrateVeilforgeState;
  window.devGrantAllEchoes = devGrantAllEchoes;
  window.devClearVeilforge = devClearVeilforge;
}

// ═══════════════════════════════════════════════════════════════════════
// VEILFORGE UI — Panel rendering, slot interaction, echo picker
// ═══════════════════════════════════════════════════════════════════════

// Current filter tab in the inventory view. Memory only.
let _vfActiveTab = 'all';

// Track which slot is currently awaiting an echo pick (for the modal)
let _vfPickerContext = null; // {abilityId, slotIndex} | null

function openVeilforge(){
  const panel = document.getElementById('veilforgePanel');
  if(!panel) return;
  panel.style.display = 'block';
  renderVeilforgePanel();
}
function closeVeilforge(){
  const panel = document.getElementById('veilforgePanel');
  if(panel) panel.style.display = 'none';
  closeVeilforgePicker();
}
function switchVeilforgeTab(tab){
  _vfActiveTab = tab;
  document.querySelectorAll('.vf-type-tab').forEach(el=>{
    el.classList.toggle('active', el.getAttribute('data-vftab') === tab);
  });
  renderVeilforgeInventory();
}

function renderVeilforgePanel(){
  renderVeilforgeAbilities();
  renderVeilforgeInventory();
  // Inventory count header
  const totalCount = Object.values(veilforgeState.inventory).reduce((a,b)=>a+b, 0);
  const countEl = document.getElementById('vfInvCount');
  if(countEl) countEl.textContent = `${totalCount} echoes`;
}

// ─── ABILITY LIST + SLOTS ───────────────────────────────────────
function renderVeilforgeAbilities(){
  const list = document.getElementById('vfAbilityList');
  if(!list) return;
  list.innerHTML = '';
  const abilities = getPlayerAbilities();
  const unlockedSlots = getUnlockedConduitSlots(player.level);
  const hotkeys = ['Q','W','E','R','Ult'];
  abilities.forEach((ability, idx) => {
    const card = document.createElement('div');
    card.className = 'vf-ability-card';
    // Header
    const hdr = document.createElement('div');
    hdr.className = 'vf-ability-hdr';
    hdr.innerHTML = `
      <span class="vf-ability-name">${_vfEscHTML(ability.name)}</span>
      <span class="vf-ability-hotkey">${hotkeys[idx] || '—'}</span>
    `;
    card.appendChild(hdr);
    // Slots row — render all 5 slots, lock icons for ones not yet unlocked
    const slotsRow = document.createElement('div');
    slotsRow.className = 'vf-slots';
    for(let s = 0; s < 5; s++){
      const slotDef = _vfSlotDefAtIndex(s);
      const isUnlocked = unlockedSlots.some(u => u.index === s);
      const slotEl = document.createElement('div');
      slotEl.className = `vf-slot ${slotDef.type}`;
      const slotted = getSlottedEchoes(ability.id);
      const currentEcho = slotted[s]?.echo;
      if(currentEcho){
        slotEl.classList.add('filled');
        slotEl.innerHTML = `
          <div class="vf-slot-icon">${ECHO_TYPES[currentEcho.type]?.icon || '◇'}</div>
          <div class="vf-slot-label" title="${_vfEscHTML(currentEcho.name)}">${_vfTruncate(currentEcho.name, 14)}</div>
        `;
      } else if(isUnlocked){
        slotEl.innerHTML = `
          <div class="vf-slot-icon">${ECHO_TYPES[slotDef.type]?.icon || '—'}</div>
          <div class="vf-slot-label">${slotDef.type.toUpperCase()}</div>
        `;
      } else {
        slotEl.classList.add('locked');
        slotEl.innerHTML = `
          <div class="vf-slot-icon">🔒</div>
          <div class="vf-slot-lock">L${slotDef.unlockLevel}</div>
        `;
      }
      // Click handler
      if(isUnlocked){
        slotEl.addEventListener('click', ()=>{
          openVeilforgePicker(ability.id, s);
        });
      } else {
        slotEl.addEventListener('click', ()=>{
          if(typeof addFeed === 'function'){
            addFeed(`Slot unlocks at level ${slotDef.unlockLevel}`, '#9ca3af');
          }
        });
      }
      slotsRow.appendChild(slotEl);
    }
    card.appendChild(slotsRow);
    list.appendChild(card);
  });
}

// Definition for slot at index — used for labels when slot not unlocked
function _vfSlotDefAtIndex(index){
  const defaults = [
    { index:0, type:'shape',     unlockLevel:10 },
    { index:1, type:'element',   unlockLevel:20 },
    { index:2, type:'behavior',  unlockLevel:35 },
    { index:3, type:'resonance', unlockLevel:50 },
    { index:4, type:'any',       unlockLevel:75 },
  ];
  return defaults[index] || defaults[0];
}

// ─── INVENTORY LIST ─────────────────────────────────────────────
function renderVeilforgeInventory(){
  const list = document.getElementById('vfInventoryList');
  if(!list) return;
  list.innerHTML = '';
  // Gather inventory filtered by tab
  const entries = [];
  Object.entries(veilforgeState.inventory).forEach(([id, count])=>{
    if(count <= 0) return;
    const e = ECHO_BY_ID[id];
    if(!e) return;
    if(_vfActiveTab !== 'all' && e.type !== _vfActiveTab) return;
    entries.push({ echo:e, count });
  });
  // Sort: tier desc (mythic first), then by name
  const tierRank = { mythic:4, rare:3, uncommon:2, common:1 };
  entries.sort((a,b) => {
    const tr = (tierRank[b.echo.tier]||0) - (tierRank[a.echo.tier]||0);
    if(tr !== 0) return tr;
    return a.echo.name.localeCompare(b.echo.name);
  });
  if(entries.length === 0){
    list.innerHTML = `<div class="vf-empty-msg">No echoes ${_vfActiveTab === 'all' ? 'collected yet' : `of type ${_vfActiveTab.toUpperCase()}`}. Defeat enemies to gather them.</div>`;
    return;
  }
  entries.forEach(({echo, count}) => {
    list.appendChild(_vfRenderEchoCard(echo, count));
  });
}

function _vfRenderEchoCard(echo, count){
  const card = document.createElement('div');
  card.className = `vf-echo-card tier-${echo.tier}`;
  const typeMeta = ECHO_TYPES[echo.type] || {};
  card.innerHTML = `
    <div class="vf-echo-head">
      <span class="vf-echo-name">
        <span class="vf-echo-type" style="background:${typeMeta.color}22;color:${typeMeta.color}">${typeMeta.icon || '◇'} ${echo.type.toUpperCase()}</span>
        ${_vfEscHTML(echo.name)}
      </span>
      <span class="vf-echo-count">×${count}</span>
    </div>
    <div class="vf-echo-desc">${_vfEscHTML(echo.description)}</div>
    <div class="vf-echo-source">↳ ${_vfEscHTML(echo.dropSource)}</div>
  `;
  return card;
}

// ─── SLOT PICKER MODAL ──────────────────────────────────────────
// When player clicks a slot, show a modal with all valid echoes they own
// that can fit that slot (type match + class lock + ability lock).
function openVeilforgePicker(abilityId, slotIndex){
  _vfPickerContext = { abilityId, slotIndex };
  // Build modal
  let modal = document.getElementById('vfPickerModal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'vfPickerModal';
    modal.className = 'vf-picker-overlay';
    modal.addEventListener('click', e => {
      if(e.target === modal) closeVeilforgePicker();
    });
    document.body.appendChild(modal);
  }
  const slotDef = _vfSlotDefAtIndex(slotIndex);
  const ability = getPlayerAbilities().find(a => a.id === abilityId);
  const slotted = getSlottedEchoes(abilityId);
  const currentEcho = slotted[slotIndex]?.echo;
  // Filter inventory for valid echoes
  const eligible = [];
  Object.entries(veilforgeState.inventory).forEach(([id, count])=>{
    if(count <= 0) return;
    const e = ECHO_BY_ID[id];
    if(!e) return;
    // Type match (unless slot is 'any')
    if(slotDef.type !== 'any' && e.type !== slotDef.type) return;
    // Class lock
    if(e.classLock && e.classLock !== player.classId) return;
    // Ability lock
    if(e.abilityLock && !e.abilityLock.includes(abilityId)) return;
    eligible.push({ echo:e, count });
  });
  // Sort by tier desc
  const tierRank = { mythic:4, rare:3, uncommon:2, common:1 };
  eligible.sort((a,b) => (tierRank[b.echo.tier]||0) - (tierRank[a.echo.tier]||0));
  // Render
  let html = `
    <div class="vf-picker-panel">
      <div class="vf-picker-hdr">
        <div>
          <div class="vf-picker-title">${_vfEscHTML(ability?.name || abilityId)}</div>
          <div style="font-size:10px;color:#9ca3af;letter-spacing:1.5px;margin-top:3px;">
            Slot ${slotIndex+1} · ${slotDef.type.toUpperCase()}
          </div>
        </div>
        <button class="vf-picker-close" onclick="closeVeilforgePicker()">✕</button>
      </div>
  `;
  if(currentEcho){
    html += `
      <button class="vf-picker-unslot" onclick="_vfDoUnslot('${abilityId}', ${slotIndex})">
        ⊗ Remove ${_vfEscHTML(currentEcho.name)} (return to inventory)
      </button>
    `;
  }
  if(eligible.length === 0){
    html += `<div class="vf-empty-msg">No eligible echoes in your inventory. Go hunt for ${slotDef.type} echoes.</div>`;
  } else {
    html += '<div class="vf-picker-list">';
    eligible.forEach(({echo, count}) => {
      const tierLabel = echo.tier.toUpperCase();
      html += `
        <div class="vf-echo-card tier-${echo.tier}" onclick="_vfDoSlot('${abilityId}', ${slotIndex}, '${echo.id}')" style="cursor:pointer;">
          <div class="vf-echo-head">
            <span class="vf-echo-name">${_vfEscHTML(echo.name)}</span>
            <span class="vf-echo-count">×${count} [${tierLabel}]</span>
          </div>
          <div class="vf-echo-desc">${_vfEscHTML(echo.description)}</div>
        </div>
      `;
    });
    html += '</div>';
  }
  html += '</div>';
  modal.innerHTML = html;
  modal.style.display = 'flex';
}

function closeVeilforgePicker(){
  const modal = document.getElementById('vfPickerModal');
  if(modal) modal.style.display = 'none';
  _vfPickerContext = null;
}

// Called from the picker when player clicks an echo to slot
function _vfDoSlot(abilityId, slotIndex, echoId){
  const result = slotEcho(abilityId, slotIndex, echoId);
  if(result.success){
    if(typeof addFeed === 'function'){
      const e = ECHO_BY_ID[echoId];
      addFeed(`⚡ SLOTTED: ${e.name}`, '#c4b5fd');
    }
    closeVeilforgePicker();
    renderVeilforgePanel();
  } else {
    if(typeof addFeed === 'function') addFeed(`✗ ${result.reason}`, '#ef4444');
  }
}
function _vfDoUnslot(abilityId, slotIndex){
  const result = unslotEcho(abilityId, slotIndex);
  if(result.success){
    if(typeof addFeed === 'function') addFeed('↩ Echo returned to inventory', '#c4b5fd');
    closeVeilforgePicker();
    renderVeilforgePanel();
  }
}

// ─── UTIL HELPERS ───────────────────────────────────────────────
function _vfEscHTML(s){
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _vfTruncate(s, n){
  if(!s) return '';
  if(s.length <= n) return s;
  return s.slice(0, n-1) + '…';
}

// Expose globally for HTML onclick and menu wiring
if(typeof window !== 'undefined'){
  window.openVeilforge = openVeilforge;
  window.closeVeilforge = closeVeilforge;
  window.switchVeilforgeTab = switchVeilforgeTab;
  window.renderVeilforgePanel = renderVeilforgePanel;
  window.openVeilforgePicker = openVeilforgePicker;
  window.closeVeilforgePicker = closeVeilforgePicker;
  window._vfDoSlot = _vfDoSlot;
  window._vfDoUnslot = _vfDoUnslot;
}
