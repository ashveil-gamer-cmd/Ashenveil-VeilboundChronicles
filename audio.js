// ═══════ AUDIO ═══════════════════════════════════════════
let audioCtx = null;
function getAC(){
  if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(freq,endFreq,dur,gain,type='sine',delay=0){
  try{
    const ac=getAC(),o=ac.createOscillator(),g=ac.createGain();
    o.connect(g);g.connect(ac.destination);
    o.type=type;const t=ac.currentTime+delay;
    o.frequency.setValueAtTime(freq,t);
    if(endFreq!==freq)o.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),t+dur);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.start(t);o.stop(t+dur+0.05);
  }catch(e){}
}
function playNoise(dur,gain,filterFreq,filterType='lowpass',delay=0){
  try{
    const ac=getAC(),buf=ac.createBuffer(1,Math.ceil(ac.sampleRate*(dur+0.05)),ac.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const src=ac.createBufferSource(),flt=ac.createBiquadFilter(),g=ac.createGain();
    src.buffer=buf;flt.type=filterType;flt.frequency.value=filterFreq;
    src.connect(flt);flt.connect(g);g.connect(ac.destination);
    const t=ac.currentTime+delay;
    g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.start(t);src.stop(t+dur+0.05);
  }catch(e){}
}
const SFX={
  hit:()=>{playTone(120,55,0.08,0.22);playNoise(0.05,0.18,3000,'highpass');},
  crit:()=>{playTone(100,45,0.12,0.3);playNoise(0.07,0.25,4000,'highpass');playTone(800,1200,0.06,0.12,'sine',0.02);},
  spiritSummon:()=>{playTone(440,880,0.18,0.16);playTone(330,660,0.14,0.10,'sine',0.03);},
  veilmark:()=>{playTone(110,55,0.14,0.22);playNoise(0.10,0.12,500,'bandpass');},
  detonate:()=>{playTone(60,25,0.4,0.28);playNoise(0.3,0.26,300,'lowpass');playTone(900,200,0.1,0.14,'sine',0.01);},
  wrathTide:()=>{playTone(200,80,0.25,0.16);playNoise(0.22,0.18,1200,'bandpass');},
  levelUp:()=>{playTone(523,523,0.12,0.2);playTone(659,659,0.12,0.2,'sine',0.13);playTone(784,784,0.18,0.18,'sine',0.26);},
  enemyDeath:()=>{playTone(180,70,0.08,0.14);playNoise(0.06,0.10,800,'lowpass');},
  eliteDeath:()=>{playTone(100,35,0.22,0.22);playNoise(0.18,0.20,600,'lowpass');},
  playerHit:()=>{playTone(200,100,0.08,0.20);playNoise(0.06,0.18,1500,'bandpass');},
  pickup:()=>{playTone(660,990,0.07,0.14);playTone(990,1320,0.05,0.11,'sine',0.06);},
  // Rarity-tiered loot pickup sounds — higher rarity = more dramatic, layered
  pickupCommon:()=>{playTone(500,700,0.06,0.10);},
  pickupUncommon:()=>{playTone(660,990,0.08,0.14);playTone(880,1100,0.05,0.10,'sine',0.05);},
  pickupRare:()=>{playTone(550,880,0.12,0.18);playTone(880,1320,0.10,0.14,'sine',0.08);playTone(440,660,0.08,0.10,'triangle',0.15);},
  pickupEpic:()=>{playTone(440,660,0.20,0.22);playTone(660,990,0.16,0.18,'sine',0.08);playTone(990,1320,0.14,0.16,'sine',0.18);playNoise(0.08,0.14,2000,'highpass',0.05);},
  pickupLegendary:()=>{playTone(330,440,0.3,0.26);playTone(550,880,0.26,0.22,'sine',0.1);playTone(880,1320,0.22,0.20,'sine',0.22);playTone(1320,1760,0.18,0.16,'triangle',0.38);playNoise(0.15,0.18,3000,'highpass',0.05);},
  pickupMythic:()=>{playTone(220,330,0.4,0.28);playTone(440,660,0.35,0.24,'sine',0.12);playTone(880,1320,0.3,0.22,'sine',0.28);playTone(1760,2200,0.25,0.2,'triangle',0.48);playNoise(0.25,0.2,4000,'highpass',0.05);playTone(110,55,0.5,0.18,'sine',0.1);},
  zoneChange:()=>{playTone(220,440,0.35,0.18);playTone(330,660,0.25,0.14,'sine',0.1);playTone(440,880,0.2,0.12,'sine',0.2);},
};

// ═══════ MUSIC SYSTEM — ZONE-AWARE DYNAMIC AMBIENT ═══════════
// Procedural ambient music generated with Web Audio API. Each zone and dungeon
// has its own "sound identity" — drone frequencies, melodic notes, textures.
// Changes cross-fade smoothly when player moves between zones or enters dungeons.
// No external audio files needed.

// ─── AMBIENT PROFILES PER ZONE/DUNGEON ───
// Each profile describes the sonic character of a space:
//   drones:   constant low-frequency tones that give the space its "color"
//   notes:    list of frequencies played as random melodic accents
//   noteType: oscillator type for melodic notes (sine=pure, triangle=soft, sawtooth=eerie)
//   noteGain: how loud the accents are
//   noteInterval: average ms between melodic notes
//   hasShimmer: whether to add a high-frequency shimmering layer (bright zones)
//   hasPulse:   whether to add a rhythmic low-end pulse (tense zones)
const AMBIENT_PROFILES = {
  ashen: {
    // Ashen Wastes — cold grey windswept grief. Low drone, sparse distant tones.
    drones: [{freq:55,gain:0.045,type:'sine'},{freq:82.4,gain:0.02,type:'sine'}],
    notes: [220,165,275,330,247],
    noteType: 'sine',
    noteGain: 0.032,
    noteInterval: 9000,
    hasShimmer: false,
    hasPulse: false,
  },
  crypts: {
    // Bone Crypts — warm amber dread. Deeper drone, occasional distant bell-like tones.
    drones: [{freq:48,gain:0.05,type:'sine'},{freq:71,gain:0.025,type:'triangle'}],
    notes: [196,262,330,392,440],
    noteType: 'triangle',
    noteGain: 0.035,
    noteInterval: 11000,
    hasShimmer: false,
    hasPulse: true,
  },
  mire: {
    // Abyssal Mire — damp lush unease. Mid drone, watery textures, bright pollen-like notes.
    drones: [{freq:62,gain:0.04,type:'sine'},{freq:92.5,gain:0.022,type:'sine'},{freq:110,gain:0.015,type:'triangle'}],
    notes: [277,330,370,440,523],
    noteType: 'sine',
    noteGain: 0.028,
    noteInterval: 7500,
    hasShimmer: true,
    hasPulse: false,
  },
  spire: {
    // Veil's Spire — volcanic dread. Low distorted drone, rising tension tones.
    drones: [{freq:41,gain:0.055,type:'sawtooth'},{freq:65,gain:0.022,type:'sine'}],
    notes: [175,208,262,311,370],
    noteType: 'sawtooth',
    noteGain: 0.03,
    noteInterval: 6000,
    hasShimmer: false,
    hasPulse: true,
  },
  hollow_crypt: {
    // Hollow Crypt dungeon — suffocating dread. Very low drone + rare high bell.
    drones: [{freq:36,gain:0.055,type:'sine'},{freq:54,gain:0.025,type:'sine'}],
    notes: [131,196,262,330],
    noteType: 'triangle',
    noteGain: 0.038,
    noteInterval: 5500,
    hasShimmer: false,
    hasPulse: true,
  },
  wraith_sanctum: {
    // Wraith Sanctum dungeon — ethereal blue dread. Shimmery high layer, cold.
    drones: [{freq:58,gain:0.04,type:'sine'},{freq:87,gain:0.025,type:'sine'},{freq:130,gain:0.015,type:'sine'}],
    notes: [330,392,440,523,659],
    noteType: 'sine',
    noteGain: 0.035,
    noteInterval: 5000,
    hasShimmer: true,
    hasPulse: false,
  },
  ashen_cathedral: {
    // Ashen Cathedral dungeon — burning ruin. Warm low drone, crackling rhythmic pulse.
    drones: [{freq:43,gain:0.055,type:'sawtooth'},{freq:65,gain:0.028,type:'triangle'}],
    notes: [165,220,277,330,415],
    noteType: 'triangle',
    noteGain: 0.034,
    noteInterval: 4500,
    hasShimmer: false,
    hasPulse: true,
  },
};

// ─── STATE ───
let ambientState = {
  running: false,
  currentZoneId: null,     // which profile is currently playing
  droneLayers: [],          // array of {osc, gain} for the ambient drones
  shimmerLayer: null,       // optional high shimmer
  pulseLayer: null,         // optional rhythmic low pulse
  noteTimer: null,          // setTimeout for next melodic note
  masterGain: null,         // single master gain so we can fade the whole ambient
};

function startMusic(){
  // Entry point. Decides current zone and starts ambient for it.
  if(ambientState.running)return;
  const ac = getAC();
  ambientState.masterGain = ac.createGain();
  ambientState.masterGain.gain.value = 0;
  ambientState.masterGain.connect(ac.destination);
  // Fade master up over 3 seconds for a graceful fade-in
  ambientState.masterGain.gain.linearRampToValueAtTime(1.0, ac.currentTime + 3);
  ambientState.running = true;
  // Kick off appropriate profile
  const zid = currentZoneId();
  switchAmbientZone(zid);
}

// Returns the identifier of the currently-active zone or dungeon.
function currentZoneId(){
  if(typeof dungeonState!=='undefined' && dungeonState.active && dungeonState.def){
    return dungeonState.def.id;
  }
  if(typeof curZone!=='undefined' && curZone){
    return curZone.id;
  }
  return 'ashen';
}

// Called from game code when zone changes. Cross-fades from current ambient to new.
function switchAmbientZone(zoneId){
  if(!ambientState.running)return;
  if(ambientState.currentZoneId === zoneId)return;
  const profile = AMBIENT_PROFILES[zoneId] || AMBIENT_PROFILES.ashen;
  // Fade out old layers, then replace
  tearDownAmbientLayers(1.2, ()=>{
    ambientState.currentZoneId = zoneId;
    buildAmbientLayers(profile);
  });
}

// Tears down all currently-active ambient layers (drones, shimmer, pulse, note timer).
// Fades them out over `fadeSec` seconds, then runs `onDone`.
function tearDownAmbientLayers(fadeSec, onDone){
  const ac = getAC();
  const layers = [...ambientState.droneLayers];
  if(ambientState.shimmerLayer) layers.push(ambientState.shimmerLayer);
  if(ambientState.pulseLayer) layers.push(ambientState.pulseLayer);
  // Stop note timer immediately
  if(ambientState.noteTimer){
    clearTimeout(ambientState.noteTimer);
    ambientState.noteTimer = null;
  }
  if(!layers.length){ if(onDone)onDone(); return; }
  // Fade each gain to near-zero, then stop oscillator
  layers.forEach(l=>{
    try{
      l.gain.gain.cancelScheduledValues(ac.currentTime);
      const curGain = l.gain.gain.value;
      l.gain.gain.setValueAtTime(curGain, ac.currentTime);
      l.gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + fadeSec);
      setTimeout(()=>{ try{l.osc.stop();}catch(e){} }, (fadeSec+0.1)*1000);
    } catch(e){}
  });
  ambientState.droneLayers = [];
  ambientState.shimmerLayer = null;
  ambientState.pulseLayer = null;
  setTimeout(()=>{ if(onDone)onDone(); }, fadeSec*1000);
}

// Creates all ambient layers for a given profile and starts them.
function buildAmbientLayers(profile){
  const ac = getAC();
  const master = ambientState.masterGain;
  if(!master)return;
  // DRONES — each gets its own oscillator + gain, fading in smoothly
  profile.drones.forEach(d=>{
    try{
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = d.type || 'sine';
      osc.frequency.value = d.freq;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      gain.gain.linearRampToValueAtTime(d.gain, ac.currentTime + 3.5);
      ambientState.droneLayers.push({osc, gain});
    } catch(e){}
  });
  // SHIMMER — high sine with subtle amplitude modulation (bright zones only)
  if(profile.hasShimmer){
    try{
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200 + Math.random()*200;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      gain.gain.linearRampToValueAtTime(0.008, ac.currentTime + 4);
      // LFO to modulate shimmer gain subtly
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.frequency.value = 0.15;
      lfoGain.gain.value = 0.004;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      ambientState.shimmerLayer = {osc, gain, lfo};
    } catch(e){}
  }
  // PULSE — rhythmic low-frequency sub-bass (tense zones only)
  if(profile.hasPulse){
    try{
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 32;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      // LFO makes the pulse actually pulse
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.frequency.value = 0.25; // ~4 second cycle
      lfoGain.gain.value = 0.022;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      // Baseline gain + LFO on top
      gain.gain.linearRampToValueAtTime(0.018, ac.currentTime + 3);
      ambientState.pulseLayer = {osc, gain, lfo};
    } catch(e){}
  }
  // NOTES — schedule first melodic accent. It self-schedules the next.
  scheduleNextAmbientNote(profile);
}

// Schedules a single ambient melodic note, then recurs to schedule the next.
function scheduleNextAmbientNote(profile){
  const jitter = profile.noteInterval * (0.6 + Math.random()*0.8); // ±40% variance
  ambientState.noteTimer = setTimeout(()=>{
    try{
      const ac = getAC();
      const master = ambientState.masterGain;
      if(!master || !ambientState.running) return;
      const note = profile.notes[Math.floor(Math.random()*profile.notes.length)];
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = profile.noteType || 'sine';
      osc.frequency.value = note;
      osc.connect(gain);
      gain.connect(master);
      const t = ac.currentTime;
      // Soft attack, long release, fades to near-silence naturally
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(profile.noteGain, t + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      osc.start(t);
      osc.stop(t + 4.1);
    } catch(e){}
    // Recur for next note — only if still in same zone
    if(ambientState.running)scheduleNextAmbientNote(profile);
  }, jitter);
}

