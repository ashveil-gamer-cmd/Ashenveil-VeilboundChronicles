// ═══════ AUDIO ═══════════════════════════════════════════
// Shared AudioContext for SFX + ambient music. Volume controlled by masterVolume,
// persisted in localStorage. Ambient uses zone-specific oscillator layers that
// cross-fade cleanly on zone transitions without leaking Web Audio nodes.

let audioCtx = null;
// Master volume gain — all audio routes through this so one slider controls everything.
let masterGainNode = null;
// Persisted volume: 0 = muted, 1 = full. Defaults to 0.6.
let masterVolume = 0.6;
try{
  const saved = localStorage.getItem('ashenveil_volume');
  if(saved !== null){
    const n = parseFloat(saved);
    if(!Number.isNaN(n)) masterVolume = Math.max(0, Math.min(1, n));
  }
}catch(e){}

function getAC(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    // Route every sound through a single master gain for volume control
    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = masterVolume;
    masterGainNode.connect(audioCtx.destination);
  }
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
// Return the destination that all audio should connect to (master gain, not ctx.destination)
function audioDest(){
  if(!audioCtx) getAC();
  return masterGainNode;
}

// Public setter for volume — persists to localStorage and applies live
function setMasterVolume(v){
  masterVolume = Math.max(0, Math.min(1, v));
  if(masterGainNode){
    try{
      masterGainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      masterGainNode.gain.setValueAtTime(masterVolume, audioCtx.currentTime);
    }catch(e){}
  }
  try{ localStorage.setItem('ashenveil_volume', String(masterVolume)); }catch(e){}
}
function getMasterVolume(){ return masterVolume; }

function playTone(freq,endFreq,dur,gain,type='sine',delay=0){
  try{
    const ac=getAC(),o=ac.createOscillator(),g=ac.createGain();
    o.connect(g);g.connect(audioDest());
    o.type=type;const t=ac.currentTime+delay;
    o.frequency.setValueAtTime(freq,t);
    if(endFreq!==freq)o.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),t+dur);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.start(t);o.stop(t+dur+0.05);
    // Critical: disconnect after stop so nodes can be garbage-collected
    o.onended = ()=>{ try{o.disconnect();g.disconnect();}catch(e){} };
  }catch(e){}
}
function playNoise(dur,gain,filterFreq,filterType='lowpass',delay=0){
  try{
    const ac=getAC(),buf=ac.createBuffer(1,Math.ceil(ac.sampleRate*(dur+0.05)),ac.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const src=ac.createBufferSource(),flt=ac.createBiquadFilter(),g=ac.createGain();
    src.buffer=buf;flt.type=filterType;flt.frequency.value=filterFreq;
    src.connect(flt);flt.connect(g);g.connect(audioDest());
    const t=ac.currentTime+delay;
    g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.start(t);src.stop(t+dur+0.05);
    src.onended = ()=>{ try{src.disconnect();flt.disconnect();g.disconnect();}catch(e){} };
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
  pickupCommon:()=>{playTone(500,700,0.06,0.10);},
  pickupUncommon:()=>{playTone(660,990,0.08,0.14);playTone(880,1100,0.05,0.10,'sine',0.05);},
  pickupRare:()=>{playTone(550,880,0.12,0.18);playTone(880,1320,0.10,0.14,'sine',0.08);playTone(440,660,0.08,0.10,'triangle',0.15);},
  pickupEpic:()=>{playTone(440,660,0.20,0.22);playTone(660,990,0.16,0.18,'sine',0.08);playTone(990,1320,0.14,0.16,'sine',0.18);playNoise(0.08,0.14,2000,'highpass',0.05);},
  pickupLegendary:()=>{playTone(330,440,0.3,0.26);playTone(550,880,0.26,0.22,'sine',0.1);playTone(880,1320,0.22,0.20,'sine',0.22);playTone(1320,1760,0.18,0.16,'triangle',0.38);playNoise(0.15,0.18,3000,'highpass',0.05);},
  pickupMythic:()=>{playTone(220,330,0.4,0.28);playTone(440,660,0.35,0.24,'sine',0.12);playTone(880,1320,0.3,0.22,'sine',0.28);playTone(1760,2200,0.25,0.2,'triangle',0.48);playNoise(0.25,0.2,4000,'highpass',0.05);playTone(110,55,0.5,0.18,'sine',0.1);},
  zoneChange:()=>{playTone(220,440,0.35,0.18);playTone(330,660,0.25,0.14,'sine',0.1);playTone(440,880,0.2,0.12,'sine',0.2);},
};

// ═══════ ZONE AMBIENT (procedural, leak-free) ══════════════════════
// Each zone has a sonic profile. Cross-fades cleanly on switches, tracks every
// Web Audio node created, disconnects fully on teardown.
const AMBIENT_PROFILES = {
  ashen:           {drones:[{freq:55,gain:0.045,type:'sine'},{freq:82.4,gain:0.02,type:'sine'}],                                       notes:[220,165,275,330,247], noteType:'sine',     noteGain:0.032, noteInterval:9000,  hasShimmer:false, hasPulse:false},
  crypts:          {drones:[{freq:48,gain:0.05,type:'sine'},{freq:71,gain:0.025,type:'triangle'}],                                     notes:[196,262,330,392,440], noteType:'triangle', noteGain:0.035, noteInterval:11000, hasShimmer:false, hasPulse:true},
  mire:            {drones:[{freq:62,gain:0.04,type:'sine'},{freq:92.5,gain:0.022,type:'sine'},{freq:110,gain:0.015,type:'triangle'}], notes:[277,330,370,440,523], noteType:'sine',     noteGain:0.028, noteInterval:7500,  hasShimmer:true,  hasPulse:false},
  spire:           {drones:[{freq:41,gain:0.055,type:'sawtooth'},{freq:65,gain:0.022,type:'sine'}],                                    notes:[175,208,262,311,370], noteType:'sawtooth', noteGain:0.03,  noteInterval:6000,  hasShimmer:false, hasPulse:true},
  hollow_crypt:    {drones:[{freq:36,gain:0.055,type:'sine'},{freq:54,gain:0.025,type:'sine'}],                                        notes:[131,196,262,330],     noteType:'triangle', noteGain:0.038, noteInterval:5500,  hasShimmer:false, hasPulse:true},
  wraith_sanctum:  {drones:[{freq:58,gain:0.04,type:'sine'},{freq:87,gain:0.025,type:'sine'},{freq:130,gain:0.015,type:'sine'}],       notes:[330,392,440,523,659], noteType:'sine',     noteGain:0.035, noteInterval:5000,  hasShimmer:true,  hasPulse:false},
  ashen_cathedral: {drones:[{freq:43,gain:0.055,type:'sawtooth'},{freq:65,gain:0.028,type:'triangle'}],                                notes:[165,220,277,330,415], noteType:'triangle', noteGain:0.034, noteInterval:4500,  hasShimmer:false, hasPulse:true},
};

// Ambient state — every Web Audio node is tracked here so teardown can disconnect all.
// `generation` counter is incremented on every zone switch — prevents orphan callbacks
// from a previous zone's scheduler from adding layers to the current zone.
let ambientState = {
  running: false,
  currentZoneId: null,
  generation: 0,              // increment on every switch to invalidate stale callbacks
  layers: [],                  // {osc, gain, extra?} for drones/shimmer/pulse
  noteTimer: null,
  ambMasterGain: null,         // submaster for ambient music only
  transitioning: false,        // while true, switchAmbientZone is a no-op
};

function startMusic(){
  if(ambientState.running) return;
  const ac = getAC();
  ambientState.ambMasterGain = ac.createGain();
  ambientState.ambMasterGain.gain.value = 0;
  ambientState.ambMasterGain.connect(audioDest());
  ambientState.ambMasterGain.gain.linearRampToValueAtTime(1.0, ac.currentTime + 3);
  ambientState.running = true;
  switchAmbientZone(currentZoneId());
}

function currentZoneId(){
  if(typeof dungeonState!=='undefined' && dungeonState.active && dungeonState.def) return dungeonState.def.id;
  if(typeof curZone!=='undefined' && curZone) return curZone.id;
  return 'ashen';
}

// CRITICAL FIX: debounced + guarded. Silently ignores same-zone calls, ignores
// calls during an in-progress transition. This prevents the frame-loop spam from
// creating duplicate nodes.
function switchAmbientZone(zoneId){
  if(!ambientState.running) return;
  if(ambientState.currentZoneId === zoneId) return;
  if(ambientState.transitioning) return; // already fading — don't stack
  const profile = AMBIENT_PROFILES[zoneId] || AMBIENT_PROFILES.ashen;
  ambientState.transitioning = true;
  ambientState.generation++;
  const myGeneration = ambientState.generation;
  tearDownAmbientLayers(1.2, ()=>{
    // Verify we're still the current generation — if another switch happened while we faded, abort
    if(myGeneration !== ambientState.generation){
      ambientState.transitioning = false;
      return;
    }
    ambientState.currentZoneId = zoneId;
    buildAmbientLayers(profile, myGeneration);
    ambientState.transitioning = false;
  });
}

// Tears down ALL ambient nodes, disconnecting + stopping every one.
// Uses tracked `layers` array so nothing is missed.
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
      layer.gain.gain.setValueAtTime(layer.gain.gain.value, ac.currentTime);
      layer.gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + fadeSec);
    }catch(e){}
    // After fade completes, stop + fully disconnect everything
    setTimeout(()=>{
      try{ layer.osc.stop(); }catch(e){}
      try{ layer.osc.disconnect(); }catch(e){}
      try{ layer.gain.disconnect(); }catch(e){}
      if(layer.lfo){
        try{ layer.lfo.stop(); }catch(e){}
        try{ layer.lfo.disconnect(); }catch(e){}
      }
      if(layer.lfoGain){
        try{ layer.lfoGain.disconnect(); }catch(e){}
      }
    }, (fadeSec + 0.15) * 1000);
  });
  setTimeout(()=>{ if(onDone) onDone(); }, fadeSec * 1000);
}

function buildAmbientLayers(profile, generation){
  if(!audioCtx || !ambientState.ambMasterGain) return;
  // Guard: if generation no longer matches, the zone was switched again — abort
  if(generation !== ambientState.generation) return;
  const ac = audioCtx;
  const dest = ambientState.ambMasterGain;
  // DRONES
  profile.drones.forEach(d=>{
    try{
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = d.type || 'sine';
      osc.frequency.value = d.freq;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      gain.gain.linearRampToValueAtTime(d.gain, ac.currentTime + 3.5);
      ambientState.layers.push({osc, gain});
    }catch(e){}
  });
  // SHIMMER
  if(profile.hasShimmer){
    try{
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200 + Math.random()*200;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      gain.gain.linearRampToValueAtTime(0.008, ac.currentTime + 4);
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.frequency.value = 0.15;
      lfoGain.gain.value = 0.004;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      ambientState.layers.push({osc, gain, lfo, lfoGain});
    }catch(e){}
  }
  // PULSE
  if(profile.hasPulse){
    try{
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 32;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.frequency.value = 0.25;
      lfoGain.gain.value = 0.022;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      gain.gain.linearRampToValueAtTime(0.018, ac.currentTime + 3);
      ambientState.layers.push({osc, gain, lfo, lfoGain});
    }catch(e){}
  }
  scheduleNextAmbientNote(profile, generation);
}

// FIX: generation-checked scheduler. If the zone changed since this was scheduled,
// the callback bails out without playing or rescheduling. Notes self-clean via onended.
function scheduleNextAmbientNote(profile, generation){
  const jitter = profile.noteInterval * (0.6 + Math.random()*0.8);
  ambientState.noteTimer = setTimeout(()=>{
    // Generation check — if zone switched, abort
    if(generation !== ambientState.generation) return;
    if(!ambientState.running) return;
    if(!audioCtx || !ambientState.ambMasterGain) return;
    try{
      const ac = audioCtx;
      const note = profile.notes[Math.floor(Math.random()*profile.notes.length)];
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = profile.noteType || 'sine';
      osc.frequency.value = note;
      osc.connect(gain);
      gain.connect(ambientState.ambMasterGain);
      const t = ac.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(profile.noteGain, t + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      osc.start(t);
      osc.stop(t + 4.1);
      // CRITICAL: clean up after the note finishes so nodes don't pile up
      osc.onended = ()=>{
        try{ osc.disconnect(); }catch(e){}
        try{ gain.disconnect(); }catch(e){}
      };
    }catch(e){}
    // Reschedule self if still current
    if(generation === ambientState.generation && ambientState.running){
      scheduleNextAmbientNote(profile, generation);
    }
  }, jitter);
}
