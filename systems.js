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

function tryEquip(item){
  const oldItem=equipped[item.slot];
  equipped[item.slot]=item;
  recalcStats();
  const col=RARITY_COLORS[item.rarity]||'#9ca3af';
  const label=RARITY_LABELS[item.rarity]||'ITEM';
  const icon=SLOT_ICONS[item.slot]||'✦';
  // Rich drop notification: icon + rarity + name + replaced status
  addFeed(`${icon} [${label}] ${item.name}`,col);
  if(oldItem){
    // Show what was replaced, dimmed
    addFeed(`  └ replaced ${oldItem.name}`,'#5a4a7a');
  }
  checkSetBonuses();
}
function recalcStats(){
  let sm=0,atk=0,hp=0,sb=0;
  Object.values(equipped).forEach(i=>{if(!i)return;if(i.stats.sm)sm+=i.stats.sm;if(i.stats.atk)atk+=i.stats.atk;if(i.stats.hp)hp+=i.stats.hp;if(i.stats.spiritBonus)sb+=i.stats.spiritBonus;});
  player.soulMastery=sm; player.attack=computeAttack(player.level)+atk+sm*0.5;
  player.maxHp=computeMaxHp(player.level)+hp; player.hp=Math.min(player.hp,player.maxHp);
  player.maxBonds=MAX_SPIRITS+sb;
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

function openGear(){
  const slots=document.getElementById('gearSlots'); slots.innerHTML='';
  GEAR_SLOTS.forEach(slot=>{
    const item=equipped[slot];
    const div=document.createElement('div');div.className='gear-slot';
    const slotIcon=SLOT_ICONS[slot]||'◇';
    if(item){
      const rarityCol=RARITY_COLORS[item.rarity]||'#9ca3af';
      const rarityLabel=RARITY_LABELS[item.rarity]||'';
      // Apply rarity color as a left-border band via inline style
      div.style.borderLeft=`3px solid ${rarityCol}`;
      div.classList.add('has-item');
      const statsHtml=Object.entries(item.stats)
        .map(([k,v])=>`<span class="gear-stat-row">${formatStat(k,v)}</span>`)
        .join('');
      const setLine=item.setName
        ? `<div class="gear-set-line">◆ Set: ${item.setName} (${item.setPiece||'?'}/5)</div>`
        : '';
      div.innerHTML=`
        <div class="gear-slot-header">
          <span class="gear-slot-icon">${slotIcon}</span>
          <span class="gear-slot-name">${slot}</span>
          <span class="gear-rarity-tag" style="color:${rarityCol};border-color:${rarityCol}66">${rarityLabel}</span>
        </div>
        <div class="gear-item ${item.rarity}">${item.name}</div>
        <div class="gear-stats-block">${statsHtml}</div>
        ${setLine}
      `;
    } else {
      div.innerHTML=`
        <div class="gear-slot-header">
          <span class="gear-slot-icon gear-slot-icon-empty">${slotIcon}</span>
          <span class="gear-slot-name">${slot}</span>
        </div>
        <div class="gear-empty">— Empty —</div>
      `;
    }
    slots.appendChild(div);
  });
  document.getElementById('gearPanel').style.display='flex';
}
function closeGear(){document.getElementById('gearPanel').style.display='none';}

// ═══════ PROFESSION SYSTEM ═══════════════════════════════
let professions={
  Spiritweaving:{level:1,xp:0,xpToNext:120,materials:{soulWisps:0,veilCloth:0,hollowShards:0,paleEssence:0}},
  Veilscribing:{level:1,xp:0,xpToNext:120,materials:{veilDust:0,paleInk:0,runeFrag:0}},
  Veilstalking:{level:1,xp:0,xpToNext:120,materials:{predatorMarks:0,trophyShards:0,veilBlood:0}},
};
const RECIPES={
  Spiritweaving:[
    {name:'Veilbound Cowl',cost:{soulWisps:8,veilCloth:2},profLv:1,result:'Veilbound Cowl'},
    {name:'Haunted Vestments',cost:{soulWisps:14,veilCloth:3},profLv:1,result:'Haunted Vestments'},
    {name:'Pale Grasp',cost:{soulWisps:8,hollowShards:3},profLv:3,result:'Pale Grasp'},
    {name:'Dirge Treads',cost:{soulWisps:10,hollowShards:3},profLv:3,result:'Dirge Treads'},
    {name:'Wraith Conduit',cost:{veilCloth:6,hollowShards:4,paleEssence:8},profLv:5,result:'Wraith Conduit'},
  ],
  Veilscribing:[
    {name:"Pale Ink (×3)",cost:{veilDust:4},profLv:1,result:'paleInk',qty:3},
    {name:"Spirit's Touch",cost:{veilDust:4},profLv:1,result:'enchant_spirit'},
    {name:'Hollow Core',cost:{veilDust:4,paleInk:2},profLv:3,result:'enchant_core'},
  ],
  Veilstalking:[
    {name:"Hunter's Draught",cost:{predatorMarks:4},profLv:1,result:'hunters_draught'},
    {name:'Trophy Totem',cost:{predatorMarks:6,trophyShards:3},profLv:1,result:'trophy_totem'},
    {name:'Blood Rite',cost:{predatorMarks:8,veilBlood:8},profLv:5,result:'blood_rite'},
  ],
};
function addProfXP(n,amt){const p=professions[n];p.xp+=amt;while(p.xp>=p.xpToNext&&p.level<20){p.xp-=p.xpToNext;p.level++;p.xpToNext=p.level*120;addFeed(`${n} LV ${p.level}!`,'#9DC4B0');}}
function canCraft(n,r){const m=professions[n].materials;return Object.entries(r.cost).every(([k,v])=>(m[k]||0)>=v)&&professions[n].level>=r.profLv;}
function craft(n,r){
  if(!canCraft(n,r))return;
  const m=professions[n].materials;
  Object.entries(r.cost).forEach(([k,v])=>{m[k]=(m[k]||0)-v;});
  addProfXP(n,50);
  const found=ITEM_POOL.find(i=>i.name===r.result);
  if(found)tryEquip({...found});else addFeed(`CRAFTED: ${r.name}`,'#9DC4B0');
  renderProfPanel();
}
function openProf(){renderProfPanel();document.getElementById('profPanel').style.display='flex';}
function closeProf(){document.getElementById('profPanel').style.display='none';}
function renderProfPanel(){
  const cards=document.getElementById('profCards');cards.innerHTML='';
  Object.entries(professions).forEach(([name,prof])=>{
    const card=document.createElement('div');card.className='prof-card';
    const pct=prof.xp/prof.xpToNext*100;
    const matsHtml=Object.entries(prof.materials).map(([k,v])=>`<span class="mat${v>0?' has':''}">${k}: ${v}</span>`).join('');
    card.innerHTML=`<div class="prof-name">${name} — LV ${prof.level}</div><div class="prof-xp-bg"><div class="prof-xp-fill" style="width:${pct}%"></div></div><div class="mat-row">${matsHtml}</div>`;
    (RECIPES[name]||[]).forEach(r=>{
      const row=document.createElement('div');row.className='recipe';
      const cost=Object.entries(r.cost).map(([k,v])=>`${v} ${k}`).join(', ');
      row.innerHTML=`<span class="recipe-name">${r.name} <span style="color:#2d2040;font-size:8px">(${cost})</span></span>`;
      const btn=document.createElement('button');btn.className='craft-btn';btn.textContent='CRAFT';btn.disabled=!canCraft(name,r);
      btn.onclick=()=>craft(name,r);row.appendChild(btn);card.appendChild(row);
    });
    cards.appendChild(card);
  });
}
