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
  // Apply volume to any currently-playing MP3 audio element. HTML5 Audio
  // elements play through the browser directly, not through our Web Audio
  // bus, so we must set element.volume explicitly.
  applyMusicVolumeToMp3();
  try{ localStorage.setItem('ashenveil_music_volume', String(musicVolume)); }catch(e){}
}
function getMusicVolume(){ return musicVolume; }

// Internal helper — applies current music volume to the playing MP3 element.
// Respects mute state. Safe to call even when no track is playing.
function applyMusicVolumeToMp3(){
  if(typeof musicPlayer === 'undefined') return;
  const audio = musicPlayer.currentSource;
  if(!audio) return;
  try{
    const target = musicSettings.muted ? 0 : musicVolume;
    audio.volume = Math.max(0, Math.min(1, target));
  }catch(e){}
}

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
  // Also apply to the MP3 playback element
  applyMusicVolumeToMp3();
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

// ═══════ IMPROVED SFX SYNTHESIS ═══════════════════════════════════
// Helpers for creating weighty, layered, atmospheric sounds. Each helper
// is built around real acoustic principles (transient + body + tail)
// rather than single-oscillator blips.

// Shared reverb — ConvolverNode with a generated impulse response giving
// a "cavern" feel. SFX route a wet signal through this for atmospheric depth.
let _reverbNode = null;
let _reverbSend = null;
function getReverb(){
  if(_reverbNode) return _reverbNode;
  const ac = getAC();
  _reverbNode = ac.createConvolver();
  const sampleRate = ac.sampleRate;
  const duration = 1.8; // 1.8s tail — dungeon-cavern feel
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const impulse = ac.createBuffer(2, length, sampleRate);
  for(let ch = 0; ch < 2; ch++){
    const data = impulse.getChannelData(ch);
    for(let i = 0; i < length; i++){
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8);
    }
  }
  _reverbNode.buffer = impulse;
  _reverbSend = ac.createGain();
  _reverbSend.gain.value = 0.18;
  _reverbNode.connect(_reverbSend);
  _reverbSend.connect(audioDest());
  return _reverbNode;
}

// Play an oscillator with ADSR envelope + optional filter + optional reverb send.
// opts: {freq, endFreq, type, attack, decay, sustain, release, gain,
//        filterFreq, filterQ, filterType, detune, reverbAmount, delay}
function playOsc(opts){
  try{
    const ac = getAC();
    const t0 = ac.currentTime + (opts.delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = opts.type || 'sine';
    if(opts.detune) osc.detune.value = opts.detune;
    osc.frequency.setValueAtTime(opts.freq, t0);
    const attack = Math.max(0.002, opts.attack || 0.008);
    const decay = Math.max(0.01, opts.decay || 0.15);
    const release = Math.max(0.01, opts.release || 0.1);
    const peakGain = opts.gain || 0.2;
    const sustainLevel = (opts.sustain !== undefined ? opts.sustain : 0.0) * peakGain;
    if(opts.endFreq !== undefined && opts.endFreq !== opts.freq){
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.endFreq), t0 + attack + decay);
    }
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + attack);
    if(sustainLevel > 0.0001){
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustainLevel), t0 + attack + decay);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + release);
    } else {
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    }
    const totalDur = attack + decay + release + 0.05;
    let filterNode = null;
    if(opts.filterFreq !== undefined){
      filterNode = ac.createBiquadFilter();
      filterNode.type = opts.filterType || 'lowpass';
      filterNode.frequency.value = opts.filterFreq;
      if(opts.filterQ !== undefined) filterNode.Q.value = opts.filterQ;
      osc.connect(filterNode);
      filterNode.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(audioDest());
    if(opts.reverbAmount && opts.reverbAmount > 0){
      const send = ac.createGain();
      send.gain.value = opts.reverbAmount;
      gain.connect(send);
      send.connect(getReverb());
    }
    osc.start(t0);
    osc.stop(t0 + totalDur);
    osc.onended = () => {
      try{ osc.disconnect(); gain.disconnect(); if(filterNode) filterNode.disconnect(); }catch(e){}
    };
  }catch(e){}
}

// Play filtered noise burst with attack envelope and optional reverb.
// opts: {dur, gain, freq, filterType, filterQ, attack, reverbAmount, delay}
function playNoiseBurst(opts){
  try{
    const ac = getAC();
    const t0 = ac.currentTime + (opts.delay || 0);
    const dur = opts.dur || 0.1;
    const bufSize = Math.ceil(ac.sampleRate * (dur + 0.05));
    const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
    const data = buf.getChannelData(0);
    for(let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = opts.filterType || 'lowpass';
    filter.frequency.value = opts.freq || 1000;
    if(opts.filterQ !== undefined) filter.Q.value = opts.filterQ;
    const gain = ac.createGain();
    const attack = Math.max(0.002, opts.attack || 0.005);
    const peakGain = opts.gain || 0.15;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audioDest());
    if(opts.reverbAmount && opts.reverbAmount > 0){
      const send = ac.createGain();
      send.gain.value = opts.reverbAmount;
      gain.connect(send);
      send.connect(getReverb());
    }
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    src.onended = () => {
      try{ src.disconnect(); filter.disconnect(); gain.disconnect(); }catch(e){}
    };
  }catch(e){}
}

// Tiny utility — random detune in cents for natural variation on repeated sfx
function rDetune(cents){ return (Math.random() - 0.5) * 2 * (cents || 20); }

const SFX={
  // ═══ HIT — basic attack impact ═══
  // Three layers: low thud (body), mid click (transient), high hiss (air/edge)
  // Detune varies slightly each hit so 50 hits in a row don't feel identical.
  hit:()=>{
    const d = rDetune(40);
    playOsc({freq:180, endFreq:70, type:'sine', attack:0.003, decay:0.08, gain:0.22, detune:d, reverbAmount:0.10});
    playOsc({freq:85, endFreq:45, type:'triangle', attack:0.003, decay:0.11, gain:0.14, detune:d});
    playNoiseBurst({dur:0.05, gain:0.17, freq:2800, filterType:'bandpass', filterQ:2, attack:0.002, reverbAmount:0.08});
  },

  // ═══ CRIT — bigger, brighter version of hit with metallic ring ═══
  crit:()=>{
    const d = rDetune(30);
    playOsc({freq:200, endFreq:60, type:'sine', attack:0.002, decay:0.12, gain:0.3, detune:d, reverbAmount:0.14});
    playOsc({freq:75, endFreq:40, type:'triangle', attack:0.003, decay:0.18, gain:0.22, detune:d});
    playOsc({freq:1100, endFreq:1850, type:'triangle', attack:0.003, decay:0.09, gain:0.13, delay:0.015, reverbAmount:0.25});
    playOsc({freq:2200, endFreq:2800, type:'sine', attack:0.004, decay:0.06, gain:0.09, delay:0.02, reverbAmount:0.3});
    playNoiseBurst({dur:0.08, gain:0.22, freq:4500, filterType:'highpass', attack:0.001, reverbAmount:0.12});
  },

  // ═══ SPIRIT SUMMON — ethereal rising chime ═══
  spiritSummon:()=>{
    playOsc({freq:392, endFreq:784, type:'sine', attack:0.04, decay:0.3, gain:0.16, reverbAmount:0.35});
    playOsc({freq:293, endFreq:587, type:'triangle', attack:0.05, decay:0.26, gain:0.11, delay:0.05, reverbAmount:0.4});
    playOsc({freq:1568, endFreq:2349, type:'sine', attack:0.06, decay:0.22, gain:0.06, delay:0.08, reverbAmount:0.5});
    playNoiseBurst({dur:0.2, gain:0.05, freq:3500, filterType:'bandpass', filterQ:3, attack:0.08, reverbAmount:0.5});
  },

  // ═══ VEILMARK — dark targeting chime, gothic descent ═══
  veilmark:()=>{
    playOsc({freq:330, endFreq:165, type:'triangle', attack:0.008, decay:0.18, gain:0.2, reverbAmount:0.3});
    playOsc({freq:440, endFreq:220, type:'sine', attack:0.01, decay:0.14, gain:0.12, delay:0.02, reverbAmount:0.3});
    playNoiseBurst({dur:0.15, gain:0.1, freq:700, filterType:'bandpass', filterQ:5, attack:0.015, reverbAmount:0.25});
  },

  // ═══ DETONATE — big explosion ═══
  detonate:()=>{
    playOsc({freq:90, endFreq:30, type:'sine', attack:0.003, decay:0.6, gain:0.35, reverbAmount:0.3});
    playOsc({freq:180, endFreq:55, type:'triangle', attack:0.004, decay:0.4, gain:0.22, reverbAmount:0.2});
    playNoiseBurst({dur:0.45, gain:0.3, freq:600, filterType:'lowpass', attack:0.005, reverbAmount:0.35});
    playNoiseBurst({dur:0.2, gain:0.15, freq:3500, filterType:'highpass', attack:0.008, delay:0.04, reverbAmount:0.2});
    playOsc({freq:1200, endFreq:200, type:'sawtooth', attack:0.001, decay:0.08, gain:0.14, reverbAmount:0.15});
  },

  // ═══ WRATH TIDE — sweeping energy wash ═══
  wrathTide:()=>{
    playOsc({freq:220, endFreq:110, type:'sawtooth', attack:0.04, decay:0.3, gain:0.18, reverbAmount:0.3});
    playOsc({freq:330, endFreq:165, type:'triangle', attack:0.05, decay:0.28, gain:0.14, delay:0.03, reverbAmount:0.3});
    playNoiseBurst({dur:0.28, gain:0.18, freq:1400, filterType:'bandpass', filterQ:2, attack:0.06, reverbAmount:0.4});
    playOsc({freq:440, endFreq:880, type:'sine', attack:0.08, decay:0.2, gain:0.08, delay:0.1, reverbAmount:0.4});
  },

  // ═══ LEVEL UP — triumphant three-chord fanfare with bass punch ═══
  levelUp:()=>{
    playOsc({freq:131, endFreq:131, type:'triangle', attack:0.01, decay:0.5, gain:0.16, reverbAmount:0.25});
    playOsc({freq:523, endFreq:523, type:'triangle', attack:0.01, decay:0.25, gain:0.22, reverbAmount:0.3});
    playOsc({freq:784, endFreq:784, type:'triangle', attack:0.01, decay:0.25, gain:0.2, reverbAmount:0.3, delay:0.13});
    playOsc({freq:1047, endFreq:1047, type:'triangle', attack:0.01, decay:0.35, gain:0.22, reverbAmount:0.35, delay:0.26});
    playOsc({freq:1568, endFreq:2093, type:'sine', attack:0.02, decay:0.5, gain:0.1, reverbAmount:0.5, delay:0.3});
    playNoiseBurst({dur:0.3, gain:0.08, freq:5000, filterType:'highpass', attack:0.1, reverbAmount:0.4, delay:0.26});
  },

  // ═══ ENEMY DEATH — soft disintegration / bone crumble ═══
  enemyDeath:()=>{
    playOsc({freq:220, endFreq:60, type:'triangle', attack:0.005, decay:0.15, gain:0.14, detune:rDetune(60), reverbAmount:0.2});
    playNoiseBurst({dur:0.15, gain:0.15, freq:1800, filterType:'bandpass', filterQ:2, attack:0.005, reverbAmount:0.15});
    playNoiseBurst({dur:0.08, gain:0.08, freq:450, filterType:'lowpass', attack:0.02, delay:0.06});
  },

  // ═══ ELITE DEATH — deeper, more dramatic fall ═══
  eliteDeath:()=>{
    playOsc({freq:120, endFreq:35, type:'triangle', attack:0.01, decay:0.35, gain:0.28, reverbAmount:0.35});
    playOsc({freq:220, endFreq:80, type:'sine', attack:0.008, decay:0.25, gain:0.18, reverbAmount:0.3});
    playNoiseBurst({dur:0.3, gain:0.22, freq:900, filterType:'lowpass', attack:0.01, reverbAmount:0.35});
    playOsc({freq:55, endFreq:35, type:'sine', attack:0.04, decay:0.5, gain:0.15, reverbAmount:0.4, delay:0.08});
  },

  // ═══ PLAYER HIT — taking damage ═══
  playerHit:()=>{
    playOsc({freq:280, endFreq:140, type:'sawtooth', attack:0.002, decay:0.1, gain:0.16, reverbAmount:0.1});
    playNoiseBurst({dur:0.08, gain:0.15, freq:1800, filterType:'bandpass', filterQ:3, attack:0.002, reverbAmount:0.15});
    playOsc({freq:65, endFreq:40, type:'sine', attack:0.006, decay:0.14, gain:0.14});
  },

  // ═══ PICKUP — generic small chime ═══
  pickup:()=>{
    playOsc({freq:880, endFreq:1320, type:'sine', attack:0.004, decay:0.1, gain:0.14, reverbAmount:0.15});
    playOsc({freq:1320, endFreq:1760, type:'triangle', attack:0.008, decay:0.08, gain:0.1, delay:0.04, reverbAmount:0.25});
  },

  // ═══ RARITY PICKUPS — progressively more dramatic ═══
  pickupCommon:()=>{
    playOsc({freq:660, endFreq:880, type:'sine', attack:0.003, decay:0.08, gain:0.11, reverbAmount:0.1});
  },
  pickupUncommon:()=>{
    playOsc({freq:784, endFreq:1047, type:'sine', attack:0.004, decay:0.1, gain:0.14, reverbAmount:0.15});
    playOsc({freq:1175, endFreq:1568, type:'triangle', attack:0.008, decay:0.08, gain:0.09, delay:0.05, reverbAmount:0.2});
  },
  pickupRare:()=>{
    playOsc({freq:659, endFreq:880, type:'sine', attack:0.005, decay:0.15, gain:0.18, reverbAmount:0.25});
    playOsc({freq:988, endFreq:1318, type:'sine', attack:0.008, decay:0.13, gain:0.15, delay:0.08, reverbAmount:0.3});
    playOsc({freq:1760, endFreq:2349, type:'triangle', attack:0.012, decay:0.1, gain:0.08, delay:0.14, reverbAmount:0.4});
  },
  pickupEpic:()=>{
    playOsc({freq:523, endFreq:659, type:'sine', attack:0.01, decay:0.2, gain:0.2, reverbAmount:0.3});
    playOsc({freq:659, endFreq:880, type:'sine', attack:0.01, decay:0.2, gain:0.18, delay:0.08, reverbAmount:0.3});
    playOsc({freq:988, endFreq:1318, type:'triangle', attack:0.012, decay:0.2, gain:0.15, delay:0.16, reverbAmount:0.35});
    playOsc({freq:1318, endFreq:1760, type:'sine', attack:0.015, decay:0.22, gain:0.12, delay:0.22, reverbAmount:0.4});
    playNoiseBurst({dur:0.2, gain:0.1, freq:5000, filterType:'highpass', attack:0.06, reverbAmount:0.5, delay:0.1});
  },
  pickupLegendary:()=>{
    playOsc({freq:131, endFreq:131, type:'triangle', attack:0.01, decay:0.5, gain:0.18, reverbAmount:0.3});
    playOsc({freq:392, endFreq:523, type:'triangle', attack:0.01, decay:0.35, gain:0.22, reverbAmount:0.3});
    playOsc({freq:523, endFreq:659, type:'sine', attack:0.015, decay:0.32, gain:0.2, delay:0.1, reverbAmount:0.35});
    playOsc({freq:784, endFreq:988, type:'sine', attack:0.02, decay:0.3, gain:0.18, delay:0.2, reverbAmount:0.35});
    playOsc({freq:1047, endFreq:1318, type:'triangle', attack:0.02, decay:0.35, gain:0.15, delay:0.3, reverbAmount:0.4});
    playOsc({freq:1760, endFreq:2349, type:'sine', attack:0.03, decay:0.4, gain:0.12, delay:0.4, reverbAmount:0.5});
    playNoiseBurst({dur:0.35, gain:0.14, freq:6000, filterType:'highpass', attack:0.1, reverbAmount:0.55, delay:0.15});
  },
  pickupMythic:()=>{
    playOsc({freq:98, endFreq:65, type:'triangle', attack:0.01, decay:0.8, gain:0.24, reverbAmount:0.4});
    playOsc({freq:196, endFreq:262, type:'triangle', attack:0.01, decay:0.55, gain:0.22, delay:0.05, reverbAmount:0.35});
    playOsc({freq:330, endFreq:392, type:'sine', attack:0.015, decay:0.5, gain:0.2, delay:0.15, reverbAmount:0.4});
    playOsc({freq:523, endFreq:659, type:'sine', attack:0.02, decay:0.45, gain:0.2, delay:0.25, reverbAmount:0.4});
    playOsc({freq:784, endFreq:988, type:'triangle', attack:0.025, decay:0.45, gain:0.18, delay:0.35, reverbAmount:0.45});
    playOsc({freq:1175, endFreq:1568, type:'sine', attack:0.03, decay:0.45, gain:0.15, delay:0.45, reverbAmount:0.5});
    playOsc({freq:2349, endFreq:3136, type:'sine', attack:0.04, decay:0.5, gain:0.12, delay:0.55, reverbAmount:0.6});
    playNoiseBurst({dur:0.5, gain:0.16, freq:7000, filterType:'highpass', attack:0.15, reverbAmount:0.65, delay:0.2});
    playOsc({freq:44, endFreq:44, type:'sine', attack:0.08, decay:1.0, gain:0.18, reverbAmount:0.4, delay:0.1});
  },

  // ═══ ZONE CHANGE — transition swell ═══
  zoneChange:()=>{
    playOsc({freq:220, endFreq:440, type:'triangle', attack:0.08, decay:0.4, gain:0.16, reverbAmount:0.4});
    playOsc({freq:330, endFreq:660, type:'sine', attack:0.1, decay:0.35, gain:0.13, delay:0.08, reverbAmount:0.45});
    playOsc({freq:440, endFreq:880, type:'sine', attack:0.12, decay:0.3, gain:0.1, delay:0.16, reverbAmount:0.5});
    playNoiseBurst({dur:0.4, gain:0.07, freq:1500, filterType:'bandpass', filterQ:1.5, attack:0.15, reverbAmount:0.55});
  },

  // ═══ UI SOUNDS — subtle clicks and panel transitions ═══
  // Added for future use — can be wired into menu buttons and panels.

  // UI click — short, tactile tap
  uiClick:()=>{
    playOsc({freq:1800, endFreq:1200, type:'sine', attack:0.002, decay:0.04, gain:0.08});
    playNoiseBurst({dur:0.02, gain:0.05, freq:4000, filterType:'highpass', attack:0.001});
  },

  // Panel open — soft upward swoosh
  uiOpen:()=>{
    playOsc({freq:330, endFreq:660, type:'triangle', attack:0.01, decay:0.15, gain:0.1, reverbAmount:0.2});
    playNoiseBurst({dur:0.1, gain:0.05, freq:2500, filterType:'bandpass', filterQ:2, attack:0.02, reverbAmount:0.2});
  },

  // Panel close — soft downward sigh
  uiClose:()=>{
    playOsc({freq:660, endFreq:330, type:'triangle', attack:0.008, decay:0.12, gain:0.09, reverbAmount:0.15});
  },

  // Error — negative feedback for invalid actions
  uiError:()=>{
    playOsc({freq:220, endFreq:165, type:'sawtooth', attack:0.003, decay:0.08, gain:0.12});
    playOsc({freq:165, endFreq:110, type:'sawtooth', attack:0.003, decay:0.1, gain:0.1, delay:0.05});
  },

  // Gold pickup — quick bright chime, distinct from item pickup
  goldPickup:()=>{
    playOsc({freq:1047, endFreq:1568, type:'sine', attack:0.003, decay:0.08, gain:0.12, reverbAmount:0.2});
    playOsc({freq:1568, endFreq:2093, type:'triangle', attack:0.006, decay:0.07, gain:0.08, delay:0.03, reverbAmount:0.3});
  },

  // Portal spawn — ominous rising drone announcing new content
  portalOpen:()=>{
    playOsc({freq:110, endFreq:165, type:'sawtooth', attack:0.3, decay:0.5, gain:0.14, reverbAmount:0.45});
    playOsc({freq:220, endFreq:330, type:'triangle', attack:0.4, decay:0.4, gain:0.1, delay:0.1, reverbAmount:0.5});
    playNoiseBurst({dur:0.6, gain:0.08, freq:1200, filterType:'bandpass', filterQ:2.5, attack:0.3, reverbAmount:0.6});
  },

  // Boss appear — dramatic low growl with rising harmonic
  bossAppear:()=>{
    playOsc({freq:55, endFreq:55, type:'sawtooth', attack:0.1, decay:0.9, gain:0.22, reverbAmount:0.4});
    playOsc({freq:82, endFreq:110, type:'sawtooth', attack:0.2, decay:0.7, gain:0.16, delay:0.1, reverbAmount:0.45});
    playOsc({freq:220, endFreq:165, type:'triangle', attack:0.15, decay:0.6, gain:0.12, delay:0.3, reverbAmount:0.5});
    playNoiseBurst({dur:0.6, gain:0.18, freq:400, filterType:'lowpass', attack:0.08, reverbAmount:0.5});
    playNoiseBurst({dur:0.4, gain:0.12, freq:2500, filterType:'bandpass', filterQ:3, attack:0.2, reverbAmount:0.5, delay:0.2});
  },
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
  // If the player has MP3 tracks configured, also launch the file-based music
  // player. It will fade out the procedural ambient once the first track starts
  // playing. If no tracks are configured, procedural ambient is the full music.
  if(typeof startMp3Music === 'function' && MUSIC_TRACKS && MUSIC_TRACKS.length > 0){
    // Small delay — lets the audio context settle after user-gesture unlock.
    setTimeout(() => {
      try{ startMp3Music(); }catch(e){ console.warn('Music start failed:', e); }
    }, 500);
  }
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
  {file: 'music/graveward_oath.mp3',   name: 'Graveward Oath'},
  {file: 'music/iron_symphony.mp3',    name: 'Iron Symphony'},
  {file: 'music/ruined_clockwork.mp3', name: 'Ruined Clockwork'},
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
    // Compute user's effective music volume (respects mute)
    const userVol = musicSettings.muted ? 0 : musicVolume;
    audio.volume = userVol;
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
    // Fade in the new track — target the user's current music volume, not 1.0
    audio.volume = 0;
    const fadeInMs = musicPlayer.crossfadeSec * 1000;
    const steps = 30;
    const stepMs = fadeInMs / steps;
    let i = 0;
    const fadeIn = setInterval(() => {
      i++;
      // Re-read target each step so mid-fade volume changes apply immediately
      const tgt = musicSettings.muted ? 0 : musicVolume;
      try{ audio.volume = Math.min(tgt, (i/steps) * tgt); }catch(e){}
      if(i >= steps){
        clearInterval(fadeIn);
        // Ensure final volume matches exactly (in case user moved slider mid-fade)
        try{ audio.volume = musicSettings.muted ? 0 : musicVolume; }catch(e){}
      }
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
