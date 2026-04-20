// ═══════════════════════════════════════════════════════════════════════
// QUEST SYSTEM — Ashenveil: Veilbound Chronicles
// ═══════════════════════════════════════════════════════════════════════
//
// DESIGN PHILOSOPHY (not Diablo/PoE):
// Quests are given by The Old Procession — three spirits who died walking
// the Veil together. Each quest is a fragment of what they need resolved
// before they can pass through. The flavor is ALWAYS about the dead
// finding peace, not about fetch-kill-loot.
//
// OBJECTIVES ARE HOOKS INTO GAMEPLAY:
//   - kill_enemy_type: slay N enemies of a given type (skeleton, wraith, etc.)
//   - kill_elite: slay N elite enemies (any type)
//   - kill_boss: slay any dungeon boss
//   - clear_dungeon: complete any dungeon
//   - reach_zone: travel to a specific zone for the first time
//   - reach_level: hit a specific character level
//
// QUEST STATE MACHINE:
//   locked → available → active → complete → turned_in
//   - locked: requirements not met (level, prerequisite quest)
//   - available: player could accept (shows at Procession)
//   - active: player accepted, tracking progress
//   - complete: all objectives met, can turn in
//   - turned_in: rewarded, done (may reopen for repeatables)
//
// GAMEPLAY HOOKS (called by game.js):
//   questOnEnemyKilled(enemy) — called from killEnemy()
//   questOnDungeonClear(dungeonId) — called from completeDungeon()
//   questOnZoneEnter(zoneId) — called from travelToZone()
//   questOnLevelUp(newLevel) — called from addXP() level-up cascade

// ─── QUEST DEFINITIONS ──────────────────────────────────────────────
// Each quest has:
//   id:          unique identifier (snake_case)
//   title:       display name (thematic, evocative)
//   giver:       who offers it (currently all from 'procession')
//   tier:        'story' | 'zone' | 'bounty' — affects XP reward
//   narrative:   1-2 sentences of flavor, shown on accept
//   objective:   {type, target, count} — what must be done
//   reward:      {xp, gold, materials?, gear?} — given on turn-in
//   requires:    level (minimum), prerequisiteId (another quest done first)
//   repeatable:  boolean (bounties usually, story quests never)
//
// Tier drives XP reward using the existing formula:
//   story       → computeKillXP(lv, lv, 'storyQuest')   (100x)
//   major       → computeKillXP(lv, lv, 'majorQuest')   (40x)
//   zone        → computeKillXP(lv, lv, 'stdQuest')     (20x)
//   bounty      → computeKillXP(lv, lv, 'smallQuest')   (10x)

const QUEST_DEFINITIONS = [
  // ─── STORY QUESTS: The Procession's Request ─────────────────────
  // Each story quest advances the Procession's own journey. These are
  // the SPINE of the early game. Players should hit these naturally.
  {
    id: 'awakening',
    title: 'Awakening',
    giver: 'procession',
    tier: 'story',
    narrative:
      'The Procession speaks as one: "You arrived. That means you can still leave. ' +
      'Walk among the dead. Prove you can return."',
    objective: { type: 'reach_zone', target: 'ashen_wastes', count: 1 },
    reward: { xp: 'auto', gold: 100, materials: { scrap: 5 } },
    requires: { level: 1 },
    repeatable: false,
  },
  {
    id: 'the_first_count',
    title: 'The First Count',
    giver: 'procession',
    tier: 'zone',
    narrative:
      '"The bones remember who they were. Put them down a second time. ' +
      'Twenty of them. That number matters — we forget why."',
    objective: { type: 'kill_enemy_type', target: 'skeleton', count: 20 },
    reward: { xp: 'auto', gold: 80, materials: { bone: 3 } },
    requires: { level: 2, prerequisiteId: 'awakening' },
    repeatable: false,
  },
  {
    id: 'the_hollow_crawl',
    title: 'The Hollow Crawl',
    giver: 'procession',
    tier: 'zone',
    narrative:
      '"Something crawls under the ash. It was a child once. It deserves stillness."',
    objective: { type: 'kill_enemy_type', target: 'crawler', count: 15 },
    reward: { xp: 'auto', gold: 100, materials: { scrap: 8 } },
    requires: { level: 3, prerequisiteId: 'the_first_count' },
    repeatable: false,
  },
  {
    id: 'into_the_crypts',
    title: 'Into the Crypts',
    giver: 'procession',
    tier: 'major',
    narrative:
      '"There is a door beneath the wastes. Behind it, something we left behind. ' +
      'Find the Bone Revenant. Ask him why he stayed."',
    objective: { type: 'clear_dungeon', target: 'hollow_crypt', count: 1 },
    reward: { xp: 'auto', gold: 300, materials: { bone: 10, runecore: 1 } },
    requires: { level: 5, prerequisiteId: 'the_hollow_crawl' },
    repeatable: false,
  },
  {
    id: 'the_sanctum_calls',
    title: 'The Sanctum Calls',
    giver: 'procession',
    tier: 'story',
    narrative:
      '"The Wraith Sanctum hums with a voice we used to know. Silence it, or answer it. ' +
      'We do not know which is kinder."',
    objective: { type: 'clear_dungeon', target: 'wraith_sanctum', count: 1 },
    reward: { xp: 'auto', gold: 800, materials: { ether: 5, runecore: 2 } },
    requires: { level: 10, prerequisiteId: 'into_the_crypts' },
    repeatable: false,
  },

  // ─── ZONE OBJECTIVES: Standing work in each zone ────────────────
  // Repeatable quests tied to zone content. Think of them as "tasks the
  // Procession always needs done." XP is lower but they never run out.
  {
    id: 'zone_wastes_wraiths',
    title: 'The Wailing Chorus',
    giver: 'procession',
    tier: 'zone',
    narrative: '"The wraiths sing when we sleep. Ten of them. Please."',
    objective: { type: 'kill_enemy_type', target: 'wraith', count: 10 },
    reward: { xp: 'auto', gold: 60, materials: { ether: 2 } },
    requires: { level: 3 },
    repeatable: true,
  },
  {
    id: 'zone_elite_hunt',
    title: 'Name the Strongest',
    giver: 'procession',
    tier: 'zone',
    narrative:
      '"Sometimes one of them grows stronger than the rest. A champion. ' +
      'Three of them, before they teach the others."',
    objective: { type: 'kill_elite', target: 'any', count: 3 },
    reward: { xp: 'auto', gold: 150, materials: { runecore: 1 } },
    requires: { level: 5 },
    repeatable: true,
  },

  // ─── BOUNTIES: Small focused tasks ──────────────────────────────
  {
    id: 'bounty_boss_hunt',
    title: 'A Crown of Skulls',
    giver: 'procession',
    tier: 'bounty',
    narrative: '"A boss still wears a crown. Pull it from them."',
    objective: { type: 'kill_boss', target: 'any', count: 1 },
    reward: { xp: 'auto', gold: 400, materials: { runecore: 2, ether: 3 } },
    requires: { level: 5 },
    repeatable: true,
  },

  // ─── MILESTONE QUESTS: Rewarded for leveling ────────────────────
  {
    id: 'milestone_lv10',
    title: 'One Foot Through the Veil',
    giver: 'procession',
    tier: 'major',
    narrative:
      '"You passed a threshold. We felt it. Not everyone does. ' +
      'Take this as proof — the dead still mark their guests."',
    objective: { type: 'reach_level', target: 10, count: 1 },
    reward: { xp: 'auto', gold: 500, materials: { runecore: 3 } },
    requires: { level: 1 },
    repeatable: false,
  },
  {
    id: 'milestone_lv25',
    title: 'Beyond the Wastes',
    giver: 'procession',
    tier: 'major',
    narrative:
      '"You have outlived what most of us became. What will you do with that?"',
    objective: { type: 'reach_level', target: 25, count: 1 },
    reward: { xp: 'auto', gold: 1500, materials: { runecore: 5, ether: 10 } },
    requires: { level: 10 },
    repeatable: false,
  },
];

// ─── QUEST STATE ────────────────────────────────────────────────────
// Single source of truth for what the player has accepted, completed, etc.
// Serialized to save file. Structure:
//   active:     {questId: {progress: currentCount, acceptedAt: ms}}
//   completed:  {questId: true}  — done and turned in
//   available:  []               — computed on demand, not stored
let questState = {
  active: {},
  completed: {},
  // For repeatables: how many times the player has turned this in.
  // Useful for future features (bounty reputation, etc.)
  turnInCount: {},
};

// Quick lookup by id — populated on init so we don't array-scan every frame
const QUEST_BY_ID = {};
QUEST_DEFINITIONS.forEach(q => { QUEST_BY_ID[q.id] = q; });

// ─── PREREQUISITE & AVAILABILITY CHECKS ─────────────────────────────
function isQuestAvailable(quest){
  if(!quest || !player) return false;
  // Already active?
  if(questState.active[quest.id]) return false;
  // Already completed and not repeatable?
  if(questState.completed[quest.id] && !quest.repeatable) return false;
  // Level gate
  if((quest.requires?.level || 1) > player.level) return false;
  // Prerequisite quest
  if(quest.requires?.prerequisiteId){
    if(!questState.completed[quest.requires.prerequisiteId]) return false;
  }
  return true;
}

// Returns all quests the player could currently accept.
function getAvailableQuests(){
  return QUEST_DEFINITIONS.filter(q => isQuestAvailable(q));
}

// Returns all quests the player has actively accepted.
function getActiveQuests(){
  return Object.keys(questState.active)
    .map(id => QUEST_BY_ID[id])
    .filter(q => q); // filter out unknown IDs (from old saves)
}

// Returns quests that are active AND have met their objective count.
function getCompletedQuests(){
  return getActiveQuests().filter(q => {
    const prog = questState.active[q.id]?.progress || 0;
    return prog >= q.objective.count;
  });
}

// ─── ACCEPT / TURN-IN ───────────────────────────────────────────────
function acceptQuest(questId){
  const q = QUEST_BY_ID[questId];
  if(!q){
    if(typeof addFeed === 'function') addFeed(`Unknown quest: ${questId}`, '#ef4444');
    return false;
  }
  if(!isQuestAvailable(q)){
    if(typeof addFeed === 'function') addFeed(`Cannot accept ${q.title}`, '#ef4444');
    return false;
  }
  questState.active[questId] = {
    progress: 0,
    acceptedAt: performance.now(),
  };
  // Check if the player has ALREADY met a state-based objective (e.g. reach_level
  // when they're already past that level). Auto-advance progress.
  questOnAccept(q);
  if(typeof addFeed === 'function'){
    addFeed(`✦ QUEST ACCEPTED: ${q.title}`, '#fbbf24');
    addFeed(`  └ ${q.narrative.replace(/"/g, '')}`, '#c4b5fd');
  }
  if(typeof writeSave === 'function') writeSave();
  return true;
}

// Turn in a completed quest. Awards XP/gold/materials.
function turnInQuest(questId){
  const q = QUEST_BY_ID[questId];
  if(!q){
    if(typeof addFeed === 'function') addFeed(`Unknown quest: ${questId}`, '#ef4444');
    return false;
  }
  const active = questState.active[questId];
  if(!active){
    if(typeof addFeed === 'function') addFeed(`${q.title} is not active`, '#ef4444');
    return false;
  }
  if(active.progress < q.objective.count){
    if(typeof addFeed === 'function'){
      addFeed(`${q.title} not complete (${active.progress}/${q.objective.count})`, '#ef4444');
    }
    return false;
  }
  // ─── AWARD REWARDS ───
  const reward = q.reward || {};
  // XP — 'auto' means use the formula based on tier
  if(reward.xp === 'auto'){
    const tierToActivity = {
      story:  'storyQuest',
      major:  'majorQuest',
      zone:   'stdQuest',
      bounty: 'smallQuest',
    };
    const activity = tierToActivity[q.tier] || 'stdQuest';
    if(typeof computeKillXP === 'function'){
      const xp = computeKillXP(player.level, player.level, activity);
      if(typeof addXP === 'function') addXP(xp);
      if(typeof addFeed === 'function'){
        addFeed(`  └ +${xp} XP`, '#8b5cf6');
      }
    }
  } else if(typeof reward.xp === 'number' && reward.xp > 0){
    if(typeof addXP === 'function') addXP(reward.xp);
  }
  // Gold
  if(reward.gold > 0){
    player.gold += reward.gold;
    if(typeof addFeed === 'function') addFeed(`  └ +${reward.gold} gold`, '#fbbf24');
  }
  // Materials
  if(reward.materials){
    Object.entries(reward.materials).forEach(([mat, count])=>{
      if(typeof creditMaterial === 'function'){
        for(let i = 0; i < count; i++) creditMaterial(mat, 1);
      }
      if(typeof addFeed === 'function'){
        addFeed(`  └ +${count} ${mat}`, '#9DC4B0');
      }
    });
  }
  // Gear drop (future — wire to loot pool)
  // if(reward.gear){ ... }

  // ─── BOOKKEEPING ───
  delete questState.active[questId];
  questState.completed[questId] = true;
  questState.turnInCount[questId] = (questState.turnInCount[questId] || 0) + 1;
  if(typeof addFeed === 'function'){
    addFeed(`★ QUEST COMPLETE: ${q.title}`, '#fbbf24');
  }
  if(typeof writeSave === 'function') writeSave();
  return true;
}

// Abandon an active quest (lose progress). No penalty currently.
function abandonQuest(questId){
  const q = QUEST_BY_ID[questId];
  if(!q || !questState.active[questId]) return false;
  delete questState.active[questId];
  if(typeof addFeed === 'function') addFeed(`⊗ ABANDONED: ${q.title}`, '#9ca3af');
  if(typeof writeSave === 'function') writeSave();
  return true;
}

// ─── GAMEPLAY HOOKS ────────────────────────────────────────────────
// Called from game.js when events fire. All check against active quests
// and advance progress where relevant.

// Called immediately after acceptQuest() to handle state-based objectives
// that might already be satisfied (e.g. player is L15 accepting "reach L10").
function questOnAccept(quest){
  const obj = quest.objective;
  if(obj.type === 'reach_level'){
    if(player.level >= obj.target){
      questState.active[quest.id].progress = obj.count;
    }
  }
  // Other types require an actual event, so they start at 0.
}

// Called from game.js killEnemy() — advances kill_enemy_type and kill_elite quests
function questOnEnemyKilled(enemy){
  if(!enemy) return;
  let updated = false;
  Object.keys(questState.active).forEach(qid => {
    const q = QUEST_BY_ID[qid];
    if(!q) return;
    const active = questState.active[qid];
    if(active.progress >= q.objective.count) return; // already done
    const obj = q.objective;
    // Normalize enemy type — kill_enemy_type uses e.typeData.id or e.type
    const enemyType = enemy.typeData?.id || enemy.type || '';
    if(obj.type === 'kill_enemy_type' && enemyType === obj.target){
      active.progress = Math.min(obj.count, active.progress + 1);
      updated = true;
      _questNotifyProgress(q, active);
    } else if(obj.type === 'kill_elite' && enemy.isElite && !enemy.isBoss){
      if(obj.target === 'any' || enemyType === obj.target){
        active.progress = Math.min(obj.count, active.progress + 1);
        updated = true;
        _questNotifyProgress(q, active);
      }
    } else if(obj.type === 'kill_boss' && enemy.isBoss){
      if(obj.target === 'any' || enemy.bossName === obj.target){
        active.progress = Math.min(obj.count, active.progress + 1);
        updated = true;
        _questNotifyProgress(q, active);
      }
    }
  });
  if(updated) _updateQuestHUD();
}

// Called from game.js completeDungeon() — advances clear_dungeon quests
function questOnDungeonClear(dungeonId){
  let updated = false;
  Object.keys(questState.active).forEach(qid => {
    const q = QUEST_BY_ID[qid];
    if(!q) return;
    const active = questState.active[qid];
    if(active.progress >= q.objective.count) return;
    const obj = q.objective;
    if(obj.type === 'clear_dungeon'){
      if(obj.target === 'any' || obj.target === dungeonId){
        active.progress = Math.min(obj.count, active.progress + 1);
        updated = true;
        _questNotifyProgress(q, active);
      }
    }
  });
  if(updated) _updateQuestHUD();
}

// Called from game.js travelToZone() — advances reach_zone quests
function questOnZoneEnter(zoneId){
  let updated = false;
  Object.keys(questState.active).forEach(qid => {
    const q = QUEST_BY_ID[qid];
    if(!q) return;
    const active = questState.active[qid];
    if(active.progress >= q.objective.count) return;
    const obj = q.objective;
    if(obj.type === 'reach_zone' && obj.target === zoneId){
      active.progress = obj.count; // one-shot objective
      updated = true;
      _questNotifyProgress(q, active);
    }
  });
  if(updated) _updateQuestHUD();
}

// Called from game.js addXP() level-up cascade — advances reach_level quests
function questOnLevelUp(newLevel){
  let updated = false;
  Object.keys(questState.active).forEach(qid => {
    const q = QUEST_BY_ID[qid];
    if(!q) return;
    const active = questState.active[qid];
    if(active.progress >= q.objective.count) return;
    const obj = q.objective;
    if(obj.type === 'reach_level' && newLevel >= obj.target){
      active.progress = obj.count;
      updated = true;
      _questNotifyProgress(q, active);
    }
  });
  if(updated) _updateQuestHUD();
}

// ─── INTERNAL: progress notification ────────────────────────────────
function _questNotifyProgress(quest, active){
  if(typeof addFeed !== 'function') return;
  if(active.progress >= quest.objective.count){
    addFeed(`✓ ${quest.title} — READY TO TURN IN`, '#22c55e');
  } else {
    // Throttle — only show every 5 kills or key milestones
    const p = active.progress, n = quest.objective.count;
    if(p === n || p === Math.floor(n/2) || p % 5 === 0){
      addFeed(`${quest.title}: ${p}/${n}`, '#c4b5fd');
    }
  }
}

function _updateQuestHUD(){
  if(typeof updateQuestHUDTracker === 'function') updateQuestHUDTracker();
}

// ─── SAVE / LOAD INTEGRATION ────────────────────────────────────────
// game.js writeSave() serializes questState. loadSave hydrates it.
// We expose these helpers for game.js to call directly.
function serializeQuestState(){
  return JSON.parse(JSON.stringify(questState));
}
function hydrateQuestState(data){
  if(!data || typeof data !== 'object') return;
  questState.active = data.active || {};
  questState.completed = data.completed || {};
  questState.turnInCount = data.turnInCount || {};
}

// ─── DEV HELPERS ────────────────────────────────────────────────────
// Exposed for dev panel to skip/complete quests during testing.
function devCompleteQuest(questId){
  const q = QUEST_BY_ID[questId];
  if(!q) return false;
  if(!questState.active[questId]){
    acceptQuest(questId);
  }
  const active = questState.active[questId];
  if(active){
    active.progress = q.objective.count;
    _questNotifyProgress(q, active);
  }
  return true;
}
function devResetAllQuests(){
  questState.active = {};
  questState.completed = {};
  questState.turnInCount = {};
  if(typeof addFeed === 'function') addFeed('⟲ All quest progress reset', '#f59e0b');
  if(typeof writeSave === 'function') writeSave();
}

// Make globally accessible so HTML onclick handlers can reach them
if(typeof window !== 'undefined'){
  window.acceptQuest = acceptQuest;
  window.turnInQuest = turnInQuest;
  window.abandonQuest = abandonQuest;
  window.devCompleteQuest = devCompleteQuest;
  window.devResetAllQuests = devResetAllQuests;
}
