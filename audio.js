// ═══════ AUDIO 2.0 — ASHENVEIL ═════════════════════════════════════
// Rebuilt to feel closer to an action-RPG instead of simple UI bleeps.
// Goals:
// - Stronger combat impact through layered transient design
// - Separate mixer buses for master / music / ambience / SFX / UI
// - Better ambient identity per zone with tension and motion
// - Safer Web Audio lifecycle management (cleanup + anti-spam)
// - Zero required changes to the rest of the game code — keeps the same
//   public API surface used by game.js (SFX, startMusic, switchAmbientZone,
//   setMasterVolume, getMasterVolume, etc.)

let audioCtx = null;
let masterGainNode = null;
let musicGainNode = null;
let ambienceGainNode = null;
let sfxGainNode = null;
let uiGainNode = null;
let masterCompNode = null;
let limiterNode = null;

let masterVolume = 0.6;
try{
  const saved = localStorage.getItem('ashenveil_volume');
  if(saved !== null){
    const n = parseFloat(saved);
    if(!Number.isNaN(n)) masterVolume = Math.max(0, Math.min(1, n));
  }
}catch(e){}

const AUDIO_STATE = {
  unlocked:false,
  sfxCooldowns:Object.create(null),
  activeOneshots:new Set(),
  combatPulseTimer:null,
  uiHooksBound:false,
  monitorStarted:false,
  lastMusicLabel:'',
};

const MIX_DEFAULTS = {
  music: 0.82,
  ambience: 0.95,
  sfx: 1.00,
  ui: 0.75,
};

function getAC(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGainNode = audioCtx.createGain();
    musicGainNode = audioCtx.createGain();
    ambienceGainNode = audioCtx.createGain();
    sfxGainNode = audioCtx.createGain();
    uiGainNode = audioCtx.createGain();
    masterCompNode = audioCtx.createDynamicsCompressor();
    limiterNode = audioCtx.createDynamicsCompressor();

    masterGainNode.gain.value = masterVolume;
    musicGainNode.gain.value = MIX_DEFAULTS.music;
    ambienceGainNode.gain.value = MIX_DEFAULTS.ambience;
    sfxGainNode.gain.value = MIX_DEFAULTS.sfx;
    uiGainNode.gain.value = MIX_DEFAULTS.ui;

    masterCompNode.threshold.value = -20;
    masterCompNode.knee.value = 18;
    masterCompNode.ratio.value = 3;
    masterCompNode.attack.value = 0.004;
    masterCompNode.release.value = 0.2;

    limiterNode.threshold.value = -2;
    limiterNode.knee.value = 0;
    limiterNode.ratio.value = 20;
    limiterNode.attack.value = 0.001;
    limiterNode.release.value = 0.08;

    musicGainNode.connect(masterCompNode);
    ambienceGainNode.connect(masterCompNode);
    sfxGainNode.connect(masterCompNode);
    uiGainNode.connect(masterCompNode);
    masterCompNode.connect(limiterNode);
    limiterNode.connect(masterGainNode);
    masterGainNode.connect(audioCtx.destination);
  }
  if(audioCtx.state === 'suspended'){
    audioCtx.resume().catch(()=>{});
  }
  AUDIO_STATE.unlocked = true;
  bindAudioUnlock();
  bindUISoundHooks();
  startAudioMonitors();
  return audioCtx;
}

function audioDest(type='sfx'){
  if(!audioCtx) getAC();
  switch(type){
    case 'music': return musicGainNode;
    case 'ambience': return ambienceGainNode;
    case 'ui': return uiGainNode;
    case 'master': return masterGainNode;
    case 'sfx':
    default: return sfxGainNode;
  }
}

function setMasterVolume(v){
  masterVolume = Math.max(0, Math.min(1, v));
  if(masterGainNode && audioCtx){
    try{
      masterGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      masterGainNode.gain.setTargetAtTime(masterVolume, audioCtx.currentTime, 0.03);
    }catch(e){}
  }
  try{ localStorage.setItem('ashenveil_volume', String(masterVolume)); }catch(e){}
}
function getMasterVolume(){ return masterVolume; }

function nowAC(){ return getAC().currentTime; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function rand(min,max){ return min + Math.random() * (max-min); }
function choice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function throttleSFX(name, ms){
  const t = performance.now();
  const prev = AUDIO_STATE.sfxCooldowns[name] || 0;
  if(t - prev < ms) return false;
  AUDIO_STATE.sfxCooldowns[name] = t;
  return true;
}

function withNodeCleanup(nodes){
  const list = nodes.filter(Boolean);
  const stopNode = list.find(n => typeof n.stop === 'function');
  if(!stopNode) return;
  stopNode.onended = ()=>{
    list.forEach(n=>{
      try{ n.disconnect(); }catch(e){}
      AUDIO_STATE.activeOneshots.delete(n);
    });
  };
  list.forEach(n=>AUDIO_STATE.activeOneshots.add(n));
}

function createNoiseBuffer(ac, seconds = 0.25){
  const buffer = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * seconds)), ac.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for(let i=0;i<data.length;i++){
    const white = Math.random() * 2 - 1;
    last = (last + (0.02 * white)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

function oneShotOsc({
  type='sine',
  freq=220,
  endFreq=null,
  duration=0.1,
  gain=0.2,
  attack=0.002,
  curve='exp',
  pan=0,
  dest='sfx',
  filterType=null,
  filterFreq=1200,
  q=1,
  delay=0,
  vibratoRate=0,
  vibratoAmount=0,
}){
  try{
    const ac = getAC();
    const t = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    const panNode = ac.createStereoPanner ? ac.createStereoPanner() : null;
    let filter = null;
    let vib = null;
    let vibGain = null;

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t);
    if(endFreq !== null){
      if(curve === 'linear') osc.frequency.linearRampToValueAtTime(Math.max(1, endFreq), t + duration);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + duration);
    }

    if(filterType){
      filter = ac.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(filterFreq, t);
      filter.Q.value = q;
      osc.connect(filter);
      filter.connect(amp);
    } else {
      osc.connect(amp);
    }

    if(vibratoRate > 0 && vibratoAmount > 0){
      vib = ac.createOscillator();
      vibGain = ac.createGain();
      vib.frequency.value = vibratoRate;
      vibGain.gain.value = vibratoAmount;
      vib.connect(vibGain);
      vibGain.connect(osc.frequency);
      vib.start(t);
    }

    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    if(panNode){
      panNode.pan.value = clamp(pan, -1, 1);
      amp.connect(panNode);
      panNode.connect(audioDest(dest));
    } else {
      amp.connect(audioDest(dest));
    }

    osc.start(t);
    osc.stop(t + duration + 0.03);
    withNodeCleanup([osc, amp, panNode, filter, vib, vibGain]);
    return {osc, amp};
  }catch(e){ return null; }
}

function oneShotNoise({
  duration=0.12,
  gain=0.15,
  attack=0.002,
  dest='sfx',
  filterType='lowpass',
  filterFreq=1800,
  q=1,
  pan=0,
  delay=0,
  playbackRate=1,
}){
  try{
    const ac = getAC();
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource();
    const amp = ac.createGain();
    const panNode = ac.createStereoPanner ? ac.createStereoPanner() : null;
    const filter = ac.createBiquadFilter();

    src.buffer = createNoiseBuffer(ac, duration + 0.08);
    src.playbackRate.value = playbackRate;
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.Q.value = q;

    src.connect(filter);
    filter.connect(amp);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    if(panNode){
      panNode.pan.value = clamp(pan, -1, 1);
      amp.connect(panNode);
      panNode.connect(audioDest(dest));
    } else {
      amp.connect(audioDest(dest));
    }

    src.start(t);
    src.stop(t + duration + 0.03);
    withNodeCleanup([src, amp, panNode, filter]);
    return {src, amp};
  }catch(e){ return null; }
}

function subBoom({freq=60, duration=0.22, gain=0.3, delay=0}){
  return oneShotOsc({ type:'sine', freq, endFreq: Math.max(28, freq * 0.48), duration, gain, attack:0.002, dest:'sfx', delay });
}

function tonalSweep({freq=400, endFreq=900, duration=0.12, gain=0.12, type='triangle', delay=0, pan=0}){
  return oneShotOsc({ type, freq, endFreq, duration, gain, attack:0.002, pan, dest:'sfx', delay });
}

function metallicTick({freq=1600, duration=0.04, gain=0.05, delay=0, pan=0}){
  oneShotOsc({ type:'square', freq, endFreq:freq*0.8, duration, gain, attack:0.001, pan, dest:'ui', delay, filterType:'highpass', filterFreq:1000, q:0.6 });
}function duckMusic(amount = 0.82, sec = 0.18){
  if(!musicGainNode || !audioCtx) return;
  try{
    const t = audioCtx.currentTime;
    musicGainNode.gain.cancelScheduledValues(t);
    musicGainNode.gain.setValueAtTime(musicGainNode.gain.value, t);
    musicGainNode.gain.linearRampToValueAtTime(MIX_DEFAULTS.music * amount, t + 0.01);
    musicGainNode.gain.linearRampToValueAtTime(MIX_DEFAULTS.music, t + sec);
  }catch(e){}
}

function duckAmbience(amount = 0.88, sec = 0.18){
  if(!ambienceGainNode || !audioCtx) return;
  try{
    const t = audioCtx.currentTime;
    ambienceGainNode.gain.cancelScheduledValues(t);
    ambienceGainNode.gain.setValueAtTime(ambienceGainNode.gain.value, t);
    ambienceGainNode.gain.linearRampToValueAtTime(MIX_DEFAULTS.ambience * amount, t + 0.01);
    ambienceGainNode.gain.linearRampToValueAtTime(MIX_DEFAULTS.ambience, t + sec);
  }catch(e){}
}

// Backward-compatible helpers used nowhere else externally, but kept so game.js
// remains able to call older signatures if needed.
function playTone(freq,endFreq,dur,gain,type='sine',delay=0){
  oneShotOsc({freq, endFreq, duration:dur, gain, type, delay, dest:'sfx'});
}
function playNoise(dur,gain,filterFreq,filterType='lowpass',delay=0){
  oneShotNoise({duration:dur, gain, filterFreq, filterType, delay, dest:'sfx'});
}

const SFX = {
  hit(){
    if(!throttleSFX('hit', 24)) return;
    const pan = rand(-0.25, 0.25);
    subBoom({ freq: rand(62, 84), duration:0.12, gain:0.18 });
    oneShotNoise({ duration:0.05, gain:0.12, filterType:'bandpass', filterFreq: rand(900, 1800), q:1.3, pan });
    oneShotOsc({ type:'triangle', freq: rand(140, 190), endFreq: rand(78, 110), duration:0.07, gain:0.12, pan, dest:'sfx' });
    duckMusic(0.93, 0.08);
  },
  crit(){
    if(!throttleSFX('crit', 70)) return;
    const pan = rand(-0.35, 0.35);
    subBoom({ freq: rand(52, 66), duration:0.18, gain:0.26 });
    oneShotNoise({ duration:0.08, gain:0.18, filterType:'highpass', filterFreq: 2100, pan });
    tonalSweep({ freq: rand(700, 880), endFreq: rand(1500, 2100), duration:0.08, gain:0.12, type:'sine', delay:0.01, pan });
    tonalSweep({ freq: rand(450, 560), endFreq: rand(980, 1220), duration:0.10, gain:0.08, type:'triangle', delay:0.03, pan:-pan });
    duckMusic(0.88, 0.16);
    duckAmbience(0.90, 0.12);
  },
  spiritSummon(){
    if(!throttleSFX('spiritSummon', 90)) return;
    const pan = rand(-0.2, 0.2);
    oneShotNoise({ duration:0.12, gain:0.07, filterType:'bandpass', filterFreq: rand(1000, 1800), q:0.8, pan });
    oneShotOsc({ type:'sine', freq: rand(220, 300), endFreq: rand(560, 740), duration:0.18, gain:0.12, pan, dest:'sfx', vibratoRate:5, vibratoAmount:4 });
    oneShotOsc({ type:'triangle', freq: rand(310, 390), endFreq: rand(740, 980), duration:0.16, gain:0.08, delay:0.03, pan:-pan, dest:'sfx' });
  },
  veilmark(){
    if(!throttleSFX('veilmark', 100)) return;
    oneShotNoise({ duration:0.07, gain:0.11, filterType:'bandpass', filterFreq: 700, q:1.2 });
    oneShotOsc({ type:'sawtooth', freq: 180, endFreq: 92, duration:0.16, gain:0.08, filterType:'lowpass', filterFreq:1200, q:0.6, dest:'sfx' });
    tonalSweep({ freq: 840, endFreq: 420, duration:0.12, gain:0.07, type:'sine', delay:0.02 });
  },
  detonate(){
    if(!throttleSFX('detonate', 110)) return;
    subBoom({ freq: rand(42, 58), duration:0.30, gain:0.33 });
    oneShotNoise({ duration:0.22, gain:0.20, filterType:'lowpass', filterFreq: 540, q:0.7 });
    oneShotNoise({ duration:0.06, gain:0.12, filterType:'highpass', filterFreq: 3200, delay:0.01 });
    oneShotOsc({ type:'triangle', freq: 140, endFreq: 48, duration:0.20, gain:0.14, filterType:'lowpass', filterFreq:700, q:1.1, dest:'sfx' });
    tonalSweep({ freq: 980, endFreq: 180, duration:0.10, gain:0.08, type:'sine', delay:0.015 });
    duckMusic(0.78, 0.22);
    duckAmbience(0.82, 0.22);
  },
  wrathTide(){
    if(!throttleSFX('wrathTide', 150)) return;
    subBoom({ freq: 55, duration:0.26, gain:0.30 });
    oneShotNoise({ duration:0.18, gain:0.14, filterType:'bandpass', filterFreq: 1100, q:0.9 });
    oneShotOsc({ type:'sawtooth', freq: 220, endFreq: 82, duration:0.24, gain:0.12, filterType:'lowpass', filterFreq: 1100, q:0.7, dest:'sfx' });
    tonalSweep({ freq: 420, endFreq: 660, duration:0.09, gain:0.08, type:'triangle', delay:0.05 });
    duckMusic(0.84, 0.25);
  },
  levelUp(){
    oneShotOsc({ type:'sine', freq:523, endFreq:523, duration:0.14, gain:0.14, dest:'ui' });
    oneShotOsc({ type:'sine', freq:659, endFreq:659, duration:0.15, gain:0.13, delay:0.12, dest:'ui' });
    oneShotOsc({ type:'triangle', freq:784, endFreq:784, duration:0.22, gain:0.13, delay:0.24, dest:'ui' });
    oneShotOsc({ type:'sine', freq:1046, endFreq:1320, duration:0.30, gain:0.08, delay:0.28, dest:'ui' });
  },
  enemyDeath(){
    if(!throttleSFX('enemyDeath', 35)) return;
    oneShotOsc({ type:'triangle', freq: rand(170, 240), endFreq: rand(60, 90), duration:0.10, gain:0.09, dest:'sfx' });
    oneShotNoise({ duration:0.05, gain:0.06, filterType:'lowpass', filterFreq: 900, dest:'sfx' });
  },
  eliteDeath(){
    if(!throttleSFX('eliteDeath', 160)) return;
    subBoom({ freq: 48, duration:0.25, gain:0.28 });
    oneShotNoise({ duration:0.16, gain:0.15, filterType:'bandpass', filterFreq: 780, q:0.8 });
    oneShotOsc({ type:'sawtooth', freq: 220, endFreq: 66, duration:0.22, gain:0.12, dest:'sfx' });
    tonalSweep({ freq: 1200, endFreq: 380, duration:0.16, gain:0.08, type:'sine', delay:0.02 });
    duckMusic(0.82, 0.18);
  },
  playerHit(){
    if(!throttleSFX('playerHit', 70)) return;
    subBoom({ freq: rand(74, 96), duration:0.11, gain:0.15 });
    oneShotNoise({ duration:0.06, gain:0.12, filterType:'bandpass', filterFreq: 1500, q:1.2 });
    oneShotOsc({ type:'square', freq: rand(210, 260), endFreq: rand(110, 140), duration:0.07, gain:0.07, filterType:'lowpass', filterFreq:900, q:0.7, dest:'sfx' });
    duckMusic(0.90, 0.09);
  },
  pickup(){ this.pickupRare(); },
  pickupCommon(){
    oneShotOsc({ type:'triangle', freq: 500, endFreq: 720, duration:0.07, gain:0.06, dest:'ui' });
  },
  pickupUncommon(){
    oneShotOsc({ type:'triangle', freq: 620, endFreq: 920, duration:0.08, gain:0.07, dest:'ui' });
    oneShotOsc({ type:'sine', freq: 860, endFreq: 1020, duration:0.05, gain:0.05, delay:0.05, dest:'ui' });
  },
  pickupRare(){
    oneShotOsc({ type:'sine', freq: 520, endFreq: 840, duration:0.11, gain:0.08, dest:'ui' });
    oneShotOsc({ type:'sine', freq: 860, endFreq: 1280, duration:0.08, gain:0.06, delay:0.06, dest:'ui' });
  },
  pickupEpic(){
    oneShotOsc({ type:'triangle', freq: 430, endFreq: 640, duration:0.18, gain:0.10, dest:'ui' });
    oneShotOsc({ type:'sine', freq: 660, endFreq: 980, duration:0.15, gain:0.09, delay:0.08, dest:'ui' });
    oneShotOsc({ type:'sine', freq: 990, endFreq: 1380, duration:0.12, gain:0.07, delay:0.18, dest:'ui' });
    oneShotNoise({ duration:0.07, gain:0.05, filterType:'highpass', filterFreq: 2400, delay:0.05, dest:'ui' });
  },
  pickupLegendary(){
    subBoom({ freq: 110, duration:0.12, gain:0.08, delay:0.02 });
    oneShotOsc({ type:'triangle', freq: 330, endFreq: 440, duration:0.28, gain:0.12, dest:'ui' });
    oneShotOsc({ type:'sine', freq: 550, endFreq: 880, duration:0.24, gain:0.11, delay:0.10, dest:'ui' });
    oneShotOsc({ type:'sine', freq: 880, endFreq: 1320, duration:0.22, gain:0.10, delay:0.22, dest:'ui' });
    oneShotOsc({ type:'triangle', freq: 1320, endFreq: 1760, duration:0.18, gain:0.08, delay:0.38, dest:'ui' });
  },
  pickupMythic(){
    subBoom({ freq: 88, duration:0.16, gain:0.11, delay:0.03 });
    oneShotOsc({ type:'triangle', freq: 220, endFreq: 330, duration:0.34, gain:0.13, dest:'ui' });
    oneShotOsc({ type:'sine', freq: 440, endFreq: 660, duration:0.30, gain:0.11, delay:0.12, dest:'ui' });
    oneShotOsc({ type:'sine', freq: 880, endFreq: 1320, duration:0.26, gain:0.10, delay:0.28, dest:'ui' });
    oneShotOsc({ type:'triangle', freq: 1760, endFreq: 2200, duration:0.24, gain:0.08, delay:0.48, dest:'ui' });
    oneShotNoise({ duration:0.16, gain:0.06, filterType:'highpass', filterFreq: 4200, delay:0.06, dest:'ui' });
  },
  zoneChange(){
    if(!throttleSFX('zoneChange', 350)) return;
    oneShotOsc({ type:'triangle', freq: 210, endFreq: 420, duration:0.28, gain:0.12, dest:'ui' });
    oneShotOsc({ type:'sine', freq: 320, endFreq: 620, duration:0.22, gain:0.09, delay:0.08, dest:'ui' });
    oneShotOsc({ type:'sine', freq: 430, endFreq: 860, duration:0.20, gain:0.07, delay:0.16, dest:'ui' });
  },
  uiOpen(){
    metallicTick({ freq: 1180, duration:0.03, gain:0.03 });
    oneShotOsc({ type:'triangle', freq: 320, endFreq: 520, duration:0.05, gain:0.03, dest:'ui' });
  },
  uiClose(){
    metallicTick({ freq: 820, duration:0.03, gain:0.028 });
    oneShotOsc({ type:'triangle', freq: 520, endFreq: 280, duration:0.05, gain:0.028, dest:'ui' });
  },
  uiHover(){
    if(!throttleSFX('uiHover', 45)) return;
    metallicTick({ freq: 1500, duration:0.02, gain:0.018 });
  },
  lowHealthPulse(){
    if(!throttleSFX('lowHealthPulse', 650)) return;
    subBoom({ freq: 62, duration:0.10, gain:0.09 });
    oneShotOsc({ type:'sine', freq: 150, endFreq: 110, duration:0.10, gain:0.04, dest:'sfx' });
  },
};

const AMBIENT_PROFILES = {
  ashen: {
    display:'Ashen Wastes',
    drones:[{freq:55,gain:0.040,type:'sine'},{freq:82,gain:0.018,type:'triangle'}],
    shimmer:[{freq:780,gain:0.004,rate:0.12},{freq:1220,gain:0.003,rate:0.07}],
    notes:[165,220,247,330], noteType:'sine', noteGain:0.020, noteInterval:7600,
    pulse:{freq:36,gain:0.012,rate:0.11},
  },
  crypts: {
    display:'Bone Crypts',
    drones:[{freq:48,gain:0.045,type:'triangle'},{freq:72,gain:0.020,type:'sine'}],
    shimmer:[{freq:980,gain:0.0035,rate:0.10}],
    notes:[196,262,330,392], noteType:'triangle', noteGain:0.024, noteInterval:8400,
    pulse:{freq:33,gain:0.015,rate:0.16},
  },
  mire: {
    display:'Abyssal Mire',
    drones:[{freq:62,gain:0.036,type:'sine'},{freq:93,gain:0.022,type:'triangle'},{freq:124,gain:0.010,type:'sine'}],
    shimmer:[{freq:960,gain:0.004,rate:0.18},{freq:1480,gain:0.0025,rate:0.09}],
    notes:[277,330,370,440,523], noteType:'sine', noteGain:0.018, noteInterval:6200,
    pulse:null,
  },
  spire: {
    display:"Veil's Spire",
    drones:[{freq:41,gain:0.048,type:'sawtooth'},{freq:65,gain:0.022,type:'triangle'}],
    shimmer:[{freq:1320,gain:0.0035,rate:0.10}],
    notes:[175,208,262,311,370], noteType:'sawtooth', noteGain:0.021, noteInterval:5600,
    pulse:{freq:32,gain:0.018,rate:0.20},
  },
  hollow_crypt: {
    display:'Hollow Crypt',
    drones:[{freq:38,gain:0.050,type:'sine'},{freq:57,gain:0.020,type:'triangle'}],
    shimmer:[{freq:760,gain:0.003,rate:0.07}],
    notes:[131,196,262,330], noteType:'triangle', noteGain:0.024, noteInterval:5200,
    pulse:{freq:31,gain:0.016,rate:0.18},
  },
  wraith_sanctum: {
    display:'Wraith Sanctum',
    drones:[{freq:58,gain:0.036,type:'sine'},{freq:87,gain:0.020,type:'sine'},{freq:130,gain:0.010,type:'triangle'}],
    shimmer:[{freq:1180,gain:0.004,rate:0.14},{freq:1640,gain:0.003,rate:0.08}],
    notes:[330,392,440,523,659], noteType:'sine', noteGain:0.020, noteInterval:4200,
    pulse:null,
  },
  ashen_cathedral: {
    display:'Ashen Cathedral',
    drones:[{freq:43,gain:0.050,type:'sawtooth'},{freq:65,gain:0.020,type:'triangle'}],
    shimmer:[{freq:1040,gain:0.003,rate:0.08}],
    notes:[165,220,277,330,415], noteType:'triangle', noteGain:0.022, noteInterval:4800,
    pulse:{freq:30,gain:0.015,rate:0.22},
  },
  procession: {
    display:'The Procession',
    drones:[{freq:73,gain:0.026,type:'sine'},{freq:110,gain:0.010,type:'triangle'}],
    shimmer:[{freq:1320,gain:0.0028,rate:0.09}],
    notes:[220,277,330,392,494], noteType:'sine', noteGain:0.016, noteInterval:9000,
    pulse:null,
  },
};

let ambientState = {
  running:false,
  currentZoneId:null,
  generation:0,
  layers:[],
  noteTimer:null,
  ambMasterGain:null,
  transitioning:false,
};function startMusic(){
  if(ambientState.running) return;
  const ac = getAC();
  ambientState.ambMasterGain = ac.createGain();
  ambientState.ambMasterGain.gain.value = 0.0001;
  ambientState.ambMasterGain.connect(audioDest('ambience'));
  ambientState.ambMasterGain.gain.exponentialRampToValueAtTime(1.0, ac.currentTime + 2.8);
  ambientState.running = true;
  switchAmbientZone(currentZoneId());
}

function stopMusic(fadeSec = 0.5){
  if(!ambientState.running) return;
  ambientState.generation++;
  ambientState.running = false;
  if(ambientState.noteTimer){
    clearTimeout(ambientState.noteTimer);
    ambientState.noteTimer = null;
  }
  tearDownAmbientLayers(fadeSec, ()=>{});
  if(ambientState.ambMasterGain && audioCtx){
    try{
      ambientState.ambMasterGain.gain.cancelScheduledValues(audioCtx.currentTime);
      ambientState.ambMasterGain.gain.setValueAtTime(Math.max(0.0001, ambientState.ambMasterGain.gain.value), audioCtx.currentTime);
      ambientState.ambMasterGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + fadeSec);
    }catch(e){}
  }
  setTimeout(()=>{
    try{ ambientState.ambMasterGain.disconnect(); }catch(e){}
    ambientState.ambMasterGain = null;
  }, (fadeSec + 0.15) * 1000);
}

function currentZoneId(){
  if(typeof dungeonState !== 'undefined' && dungeonState.active && dungeonState.def) return dungeonState.def.id;
  if(typeof curZone !== 'undefined' && curZone) return curZone.id;
  return 'ashen';
}

function switchAmbientZone(zoneId){
  if(!ambientState.running) return;
  if(ambientState.currentZoneId === zoneId) return;
  if(ambientState.transitioning) return;
  ambientState.transitioning = true;
  ambientState.generation++;
  const myGeneration = ambientState.generation;
  const profile = AMBIENT_PROFILES[zoneId] || AMBIENT_PROFILES.ashen;
  tearDownAmbientLayers(1.1, ()=>{
    if(myGeneration !== ambientState.generation){
      ambientState.transitioning = false;
      return;
    }
    ambientState.currentZoneId = zoneId;
    buildAmbientLayers(profile, myGeneration);
    updateMusicLabel(profile.display || zoneId);
    ambientState.transitioning = false;
  });
}

function tearDownAmbientLayers(fadeSec, onDone){
  if(!audioCtx){ if(onDone) onDone(); return; }
  const ac = audioCtx;
  const layersToKill = ambientState.layers.slice();
  ambientState.layers = [];
  if(ambientState.noteTimer){
    clearTimeout(ambientState.noteTimer);
    ambientState.noteTimer = null;
  }
  if(!layersToKill.length){ if(onDone) onDone(); return; }
  layersToKill.forEach(layer=>{
    try{
      layer.gain.gain.cancelScheduledValues(ac.currentTime);
      layer.gain.gain.setValueAtTime(Math.max(0.0001, layer.gain.gain.value), ac.currentTime);
      layer.gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + fadeSec);
    }catch(e){}
    setTimeout(()=>{
      [layer.osc, layer.gain, layer.lfo, layer.lfoGain, layer.filter].forEach(node=>{
        if(!node) return;
        try{ if(typeof node.stop === 'function') node.stop(); }catch(e){}
        try{ node.disconnect(); }catch(e){}
      });
    }, (fadeSec + 0.16) * 1000);
  });
  setTimeout(()=>{ if(onDone) onDone(); }, fadeSec * 1000);
}

function buildAmbientLayers(profile, generation){
  if(!audioCtx || !ambientState.ambMasterGain) return;
  if(generation !== ambientState.generation) return;
  const ac = audioCtx;
  const dest = ambientState.ambMasterGain;

  (profile.drones || []).forEach(layer=>{
    try{
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = layer.type || 'sine';
      osc.frequency.value = layer.freq;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, layer.gain), ac.currentTime + 3.8);
      ambientState.layers.push({osc, gain});
    }catch(e){}
  });

  (profile.shimmer || []).forEach(layer=>{
    try{
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      const filter = ac.createBiquadFilter();
      osc.type = 'triangle';
      osc.frequency.value = layer.freq;
      filter.type = 'highpass';
      filter.frequency.value = Math.max(600, layer.freq * 0.45);
      gain.gain.value = 0.0001;
      lfo.frequency.value = layer.rate || 0.1;
      lfoGain.gain.value = layer.gain * 0.55;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      osc.start();
      lfo.start();
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, layer.gain), ac.currentTime + 4.0);
      ambientState.layers.push({osc, gain, lfo, lfoGain, filter});
    }catch(e){}
  });

  if(profile.pulse){
    try{
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = profile.pulse.freq;
      gain.gain.value = 0.0001;
      lfo.frequency.value = profile.pulse.rate;
      lfoGain.gain.value = profile.pulse.gain;
      osc.connect(gain);
      gain.connect(dest);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      osc.start();
      lfo.start();
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, profile.pulse.gain * 0.72), ac.currentTime + 3.0);
      ambientState.layers.push({osc, gain, lfo, lfoGain});
    }catch(e){}
  }

  scheduleNextAmbientNote(profile, generation);
}

function scheduleNextAmbientNote(profile, generation){
  const jitter = (profile.noteInterval || 8000) * rand(0.62, 1.22);
  ambientState.noteTimer = setTimeout(()=>{
    if(generation !== ambientState.generation) return;
    if(!ambientState.running || !audioCtx || !ambientState.ambMasterGain) return;
    try{
      const ac = audioCtx;
      const note = choice(profile.notes || [220,330]);
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const filter = ac.createBiquadFilter();
      osc.type = profile.noteType || 'sine';
      osc.frequency.value = note;
      filter.type = 'lowpass';
      filter.frequency.value = Math.max(500, note * 5);
      gain.gain.value = 0.0001;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ambientState.ambMasterGain);
      const t = ac.currentTime;
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, profile.noteGain || 0.02), t + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + rand(2.6, 4.3));
      osc.start(t);
      osc.stop(t + 4.4);
      withNodeCleanup([osc, gain, filter]);
    }catch(e){}
    if(generation === ambientState.generation && ambientState.running){
      scheduleNextAmbientNote(profile, generation);
    }
  }, jitter);
}

function updateMusicLabel(text){
  const el = document.getElementById('musicLabel');
  if(!el) return;
  const next = `♪ ${text || '—'}`;
  if(AUDIO_STATE.lastMusicLabel === next) return;
  AUDIO_STATE.lastMusicLabel = next;
  el.textContent = next;
  el.style.display = 'block';
}

function bindAudioUnlock(){
  if(window.__ashenveilAudioUnlockBound) return;
  window.__ashenveilAudioUnlockBound = true;
  const unlock = ()=>{ try{ getAC(); }catch(e){} };
  ['pointerdown','touchstart','keydown','mousedown'].forEach(evt=>{
    window.addEventListener(evt, unlock, { passive:true, capture:true });
  });
}

function bindUISoundHooks(){
  if(AUDIO_STATE.uiHooksBound) return;
  AUDIO_STATE.uiHooksBound = true;
  document.addEventListener('click', (e)=>{
    const target = e.target && e.target.closest ? e.target.closest('button, .menu-btn, .ab, .panel-close, .craft-btn, .gear-action-btn, .class-card-choose') : null;
    if(!target) return;
    try{ getAC(); }catch(err){}
    const txt = (target.textContent || '').toLowerCase();
    if(txt.includes('back') || txt.includes('exit') || txt.includes('close') || txt.includes('cancel')) SFX.uiClose();
    else SFX.uiOpen();
  }, true);
  document.addEventListener('pointerover', (e)=>{
    const target = e.target && e.target.closest ? e.target.closest('button, .menu-btn, .ab, .craft-btn, .gear-action-btn') : null;
    if(!target) return;
    SFX.uiHover();
  }, true);
}

function startAudioMonitors(){
  if(AUDIO_STATE.monitorStarted) return;
  AUDIO_STATE.monitorStarted = true;
  setInterval(()=>{
    if(!audioCtx) return;
    try{
      // Low-health pulse — subtle but useful, no changes required in game.js.
      if(typeof player !== 'undefined' && player && !player.isDead && player.maxHp > 0){
        const hpPct = player.hp / player.maxHp;
        if(hpPct <= 0.28) SFX.lowHealthPulse();
      }
      // If zone changed outside of the normal path, correct the ambient bed.
      if(ambientState.running && !ambientState.transitioning){
        const zid = currentZoneId();
        if(zid !== ambientState.currentZoneId) switchAmbientZone(zid);
      }
    }catch(e){}
  }, 180);
}

// Optional manual mix controls for Claude or future tuning.
function setAudioBusLevel(bus, value){
  const v = clamp(value, 0, 1.4);
  const ac = getAC();
  const node = bus === 'music' ? musicGainNode : bus === 'ambience' ? ambienceGainNode : bus === 'ui' ? uiGainNode : sfxGainNode;
  if(!node) return;
  try{
    node.gain.cancelScheduledValues(ac.currentTime);
    node.gain.setTargetAtTime(v, ac.currentTime, 0.03);
  }catch(e){}
}
function getAudioBusLevel(bus){
  const node = bus === 'music' ? musicGainNode : bus === 'ambience' ? ambienceGainNode : bus === 'ui' ? uiGainNode : sfxGainNode;
  return node ? node.gain.value : 0;
}
