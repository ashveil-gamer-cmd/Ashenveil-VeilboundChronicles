// ═══════ AUDIO ═══════════════════════════════════════════
// Architecture:
//   masterGainNode (single exit to speakers)
//     ├── sfxBus (one-shot sound effects)
//     └── musicBus (procedural ambient + MP3 playlist)
//          ├── ambMasterGain (procedural ambient — fallback when no MP3 playing)
//          └── fileMusicGain (MP3 tracks via MusicPlayer)
//
// Volumes for SFX and music are independently controlled and persisted.

let audioCtx = null;
let masterGainNode = null;
let sfxBus = null;
let musicBus = null;
let fileMusicGain = null;

// Persisted settings: both default to sensible audible levels.
let sfxVolume = 0.6;
let musicVolume = 0.5;
// Playlist settings — which tracks are enabled, whether shuffle is on.
// The actual track file list comes from MUSIC_TRACKS (defined at bottom of file).
let musicSettings = {
  enabled: {},      // { 'filename.mp3': true/false } — user's track whitelist
  shuffle: true,    // random order vs sequential
  muted: false,
  sfxMuted: false,
};

// Load persisted settings from localStorage on startup
try{
  const sv = localStorage.getItem('ashenveil_sfx_volume');
  if(sv !== null){ const n = parseFloat(sv); if(!Number.isNaN(n)) sfxVolume = Math.max(0, Math.min(1, n)); }
  const mv = localStorage.getItem('ashenveil_music_volume');
  if(mv !== null){ const n = parseFloat(mv); if(!Number.isNaN(n)) musicVolume = Math.max(0, Math.min(1, n)); }
  const ms = localStorage.getItem('ashenveil_music_settings');
  if(ms){
    const parsed = JSON.parse(ms);
    if(parsed && typeof parsed === 'object') Object.assign(musicSettings, parsed);
  }
  // Back-compat: old single 'ashenveil_volume' key (pre-split) migrates to both
  const oldV = localStorage.getItem('ashenveil_volume');
  if(oldV !== null && sv === null){
    const n = parseFloat(oldV);
    if(!Number.isNaN(n)){
      sfxVolume = Math.max(0, Math.min(1, n));
      musicVolume = Math.max(0, Math.min(1, n * 0.85));
    }
  }
}catch(e){}

function getAC(){
  if(!audioCtx){
    audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = 1.0;
    masterGainNode.connect(audioCtx.destination);
    // Two buses under master
    sfxBus = audioCtx.createGain();
    sfxBus.gain.value = musicSettings.sfxMuted ? 0 : sfxVolume;
    sfxBus.connect(masterGainNode);
    musicBus = audioCtx.createGain();
    musicBus.gain.value = musicSettings.muted ? 0 : musicVolume;
    musicBus.connect(masterGainNode);
    // fileMusicGain is the node MP3s route through
    fileMusicGain = audioCtx.createGain();
    fileMusicGain.gain.value = 1.0;
    fileMusicGain.connect(musicBus);
  }
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
// SFX destination (for one-shot effects — hits, abilities, UI)
function audioDest(){ if(!audioCtx) getAC(); return sfxBus; }
// Music destination (for the procedural ambient music)
function musicDest(){ if(!audioCtx) getAC(); return musicBus; }

// ═══ Volume controls — separate SFX and music ═══

function setSfxVolume(v){
  sfxVolume = Math.max(0, Math.min(1, v));
  if(sfxBus){
    try{
      const target = musicSettings.sfxMuted ? 0 : sfxVolume;
      sfxBus.gain.cancelScheduledValues(audioCtx.currentTime);
      sfxBus.gain.setValueAtTime(target, audioCtx.currentTime);
    }catch(e){}
  }
  try{ localStorage.setItem('ashenveil_sfx_volume', String(sfxVolume)); }catch(e){}
}
function getSfxVolume(){ return sfxVolume; }

function setMusicVolume(v){
  musicVolume = Math.max(0, Math.min(1, v));
  if(musicBus){
    try{
      const target = musicSettings.muted ? 0 : musicVolume;
      musicBus.gain.cancelScheduledValues(audioCtx.currentTime);
      musicBus.gain.setValueAtTime(target, audioCtx.currentTime);
    }catch(e){}
  }
  try{ localStorage.setItem('ashenveil_music_volume', String(musicVolume)); }catch(e){}
}
function getMusicVolume(){ return musicVolume; }

function setSfxMuted(m){
  musicSettings.sfxMuted = !!m;
  if(sfxBus){
    try{
      const target = musicSettings.sfxMuted ? 0 : sfxVolume;
      sfxBus.gain.cancelScheduledValues(audioCtx.currentTime);
      sfxBus.gain.linearRampToValueAtTime(target, audioCtx.currentTime + 0.15);
    }catch(e){}
  }
  persistMusicSettings();
}
function setMusicMuted(m){
  musicSettings.muted = !!m;
  if(musicBus){
    try{
      const target = musicSettings.muted ? 0 : musicVolume;
      musicBus.gain.cancelScheduledValues(audioCtx.currentTime);
      musicBus.gain.linearRampToValueAtTime(target, audioCtx.currentTime + 0.15);
    }catch(e){}
  }
  persistMusicSettings();
}

function persistMusicSettings(){
  try{ localStorage.setItem('ashenveil_music_settings', JSON.stringify(musicSettings)); }catch(e){}
}

// Back-compat wrapper — lots of existing code calls setMasterVolume.
// Route it to SFX since that's what the old slider mostly affected.
function setMasterVolume(v){ setSfxVolume(v); }
function getMasterVolume(){ return sfxVolume; }

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
  // Route ambient through MUSIC bus (not SFX) so it's controlled by the music volume
  ambientState.ambMasterGain.connect(musicDest());
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

// ═══════ MP3 MUSIC PLAYER ══════════════════════════════════════
// Plays pre-recorded MP3 tracks from the /music folder with crossfading
// between tracks and a user-curated playlist. Falls back gracefully when
// no tracks are configured or files are missing.
//
// HOW TO ADD TRACKS:
// 1. Upload MP3 files to a `music/` folder in the repo
// 2. Add an entry to the MUSIC_TRACKS array below with {file, name}
// 3. Done — settings panel will show it automatically
//
// When MUSIC_TRACKS is empty (no files added yet), the procedural ambient
// music plays instead. When tracks are added, procedural ambient fades out
// and MP3s take over.

const MUSIC_TRACKS = [
  // Example entries — REPLACE these with your actual uploaded files:
  // {file: 'music/dirge_of_hollows.mp3', name: 'Dirge of Hollows'},
  // {file: 'music/veiled_wanderer.mp3',  name: 'Veiled Wanderer'},
  // {file: 'music/ashen_requiem.mp3',    name: 'Ashen Requiem'},
];

// Music player state — tracks what's loaded and playing
const musicPlayer = {
  tracks: [],         // [{file, name, audio, loaded}] populated on init
  currentIdx: -1,     // index of currently playing track in tracks[]
  currentSource: null, // HTMLAudioElement currently playing
  nextSource: null,   // preloaded next track for fast transitions
  playing: false,
  fadeTimer: null,
  endTimer: null,
  onTrackEndBound: null,
  // How many seconds of crossfade between tracks
  crossfadeSec: 2,
};

function initMusicPlayer(){
  // Read tracks list — user can modify MUSIC_TRACKS directly in code,
  // OR admin tool could push entries via musicPlayer.tracks
  musicPlayer.tracks = MUSIC_TRACKS.map(t => ({
    file: t.file,
    name: t.name,
    loaded: false,
    loadError: false,
  }));
  // Apply defaults to musicSettings.enabled for any new tracks
  let changed = false;
  musicPlayer.tracks.forEach(t => {
    if(musicSettings.enabled[t.file] === undefined){
      musicSettings.enabled[t.file] = true; // opt-in by default
      changed = true;
    }
  });
  if(changed) persistMusicSettings();
}

// Returns the tracks the user has currently enabled in settings
function getEnabledTracks(){
  return musicPlayer.tracks.filter(t => musicSettings.enabled[t.file] !== false);
}

// Pick the next track to play — respects shuffle setting, avoids repeating the current one if possible
function pickNextTrack(){
  const enabled = getEnabledTracks();
  if(enabled.length === 0) return null;
  if(enabled.length === 1) return 0;
  const currentFile = musicPlayer.currentIdx >= 0 ? musicPlayer.tracks[musicPlayer.currentIdx].file : null;
  if(musicSettings.shuffle){
    // Random but avoid immediate repeat
    const candidates = enabled.filter(t => t.file !== currentFile);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return musicPlayer.tracks.indexOf(pick);
  } else {
    // Sequential: find current in enabled list, go to next; wrap around
    const idx = enabled.findIndex(t => t.file === currentFile);
    const next = enabled[(idx + 1) % enabled.length];
    return musicPlayer.tracks.indexOf(next);
  }
}

// Load an audio element for a given track, returns a Promise<HTMLAudioElement>
function loadTrack(track){
  return new Promise((resolve, reject) => {
    const a = new Audio();
    a.preload = 'auto';
    a.src = track.file;
    a.onloadeddata = () => { track.loaded = true; resolve(a); };
    a.onerror = () => { track.loadError = true; reject(new Error(`Failed to load ${track.file}`)); };
    // Stop loading if it takes too long — don't block forever
    setTimeout(() => {
      if(!track.loaded && !track.loadError){
        track.loadError = true;
        reject(new Error(`Timeout loading ${track.file}`));
      }
    }, 20000);
  });
}

// Start the music system. Call this once when the game is ready to play.
// If no tracks are configured, this is a no-op and procedural ambient continues.
function startMp3Music(){
  if(!musicPlayer.tracks.length){
    // No user-uploaded tracks — procedural ambient stays as the music layer
    return;
  }
  getAC(); // ensure audio context exists
  playNextMp3();
}

async function playNextMp3(){
  const nextIdx = pickNextTrack();
  if(nextIdx === -1 || nextIdx === null){
    musicPlayer.playing = false;
    return;
  }
  const track = musicPlayer.tracks[nextIdx];
  try{
    const audio = await loadTrack(track);
    audio.volume = 1.0; // scaled by musicBus — don't double-attenuate here
    await audio.play();
    // Fade out procedural ambient if this is our first real track
    if(ambientState.running && ambientState.ambMasterGain){
      try{
        const ac = audioCtx;
        ambientState.ambMasterGain.gain.cancelScheduledValues(ac.currentTime);
        ambientState.ambMasterGain.gain.setValueAtTime(ambientState.ambMasterGain.gain.value, ac.currentTime);
        ambientState.ambMasterGain.gain.linearRampToValueAtTime(0, ac.currentTime + 2);
      }catch(e){}
    }
    // Start crossfade-out if there was a previous track
    if(musicPlayer.currentSource){
      const old = musicPlayer.currentSource;
      const fadeMs = musicPlayer.crossfadeSec * 1000;
      const steps = 30;
      const stepMs = fadeMs / steps;
      const startVol = old.volume;
      let i = 0;
      const fadeOut = setInterval(() => {
        i++;
        try{ old.volume = startVol * (1 - i/steps); }catch(e){}
        if(i >= steps){
          clearInterval(fadeOut);
          try{ old.pause(); old.src = ''; }catch(e){}
        }
      }, stepMs);
    }
    // Fade in the new track
    audio.volume = 0;
    const fadeInMs = musicPlayer.crossfadeSec * 1000;
    const steps = 30;
    const stepMs = fadeInMs / steps;
    let i = 0;
    const fadeIn = setInterval(() => {
      i++;
      try{ audio.volume = Math.min(1.0, i/steps); }catch(e){}
      if(i >= steps) clearInterval(fadeIn);
    }, stepMs);
    // Set up end-of-track handler
    audio.onended = () => {
      try{ audio.src = ''; }catch(e){}
      musicPlayer.currentSource = null;
      // Auto-play next after a tiny gap
      setTimeout(() => playNextMp3(), 200);
    };
    musicPlayer.currentSource = audio;
    musicPlayer.currentIdx = nextIdx;
    musicPlayer.playing = true;
    // Notify UI if settings panel is open
    if(typeof updateSettingsNowPlaying === 'function') updateSettingsNowPlaying();
  }catch(err){
    console.warn('Music load failed:', err.message);
    // Try the next track after a small delay
    setTimeout(() => playNextMp3(), 1000);
  }
}

// Manually skip to next track (used by settings skip button)
function skipToNextMp3(){
  if(musicPlayer.currentSource){
    try{ musicPlayer.currentSource.pause(); }catch(e){}
  }
  setTimeout(() => playNextMp3(), 100);
}

// Call when settings playlist changes — if current track was disabled, skip it
function onPlaylistChanged(){
  persistMusicSettings();
  if(musicPlayer.currentIdx >= 0){
    const cur = musicPlayer.tracks[musicPlayer.currentIdx];
    if(cur && musicSettings.enabled[cur.file] === false){
      skipToNextMp3();
    }
  } else if(getEnabledTracks().length > 0){
    // No track currently playing but playlist now has enabled tracks — start
    startMp3Music();
  }
}

// Initialize tracks list on script load
initMusicPlayer();
