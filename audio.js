// ═══════ ASHENVEIL AUDIO 2.0 (UPGRADED SYSTEM) ═══════

// ───────── CORE CONTEXT ─────────
let audioCtx = null;
let masterGain, musicGain, sfxGain, uiGain;

function initAudio(){
  if(audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioCtx.createGain();
  musicGain  = audioCtx.createGain();
  sfxGain    = audioCtx.createGain();
  uiGain     = audioCtx.createGain();

  masterGain.connect(audioCtx.destination);
  musicGain.connect(masterGain);
  sfxGain.connect(masterGain);
  uiGain.connect(masterGain);

  masterGain.gain.value = 0.7;
  musicGain.gain.value  = 0.4;
  sfxGain.gain.value    = 0.9;
  uiGain.gain.value     = 0.8;
}

function getAC(){
  if(!audioCtx) initAudio();
  if(audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// ───────── SOUND BUILDERS ─────────

function impactLayer(freqStart, freqEnd, duration, gain){
  const ac = getAC();

  const osc = ac.createOscillator();
  const g   = ac.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freqStart, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, ac.currentTime + duration);

  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

  osc.connect(g);
  g.connect(sfxGain);

  osc.start();
  osc.stop(ac.currentTime + duration);
}

function noiseBurst(duration, gain){
  const ac = getAC();
  const buffer = ac.createBuffer(1, ac.sampleRate * duration, ac.sampleRate);
  const data = buffer.getChannelData(0);

  for(let i=0;i<data.length;i++){
    data[i] = Math.random() * 2 - 1;
  }

  const src = ac.createBufferSource();
  const g   = ac.createGain();
  const filter = ac.createBiquadFilter();

  filter.type = 'highpass';
  filter.frequency.value = 800;

  src.buffer = buffer;
  src.connect(filter);
  filter.connect(g);
  g.connect(sfxGain);

  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

  src.start();
  src.stop(ac.currentTime + duration);
}

// ───────── SFX SYSTEM ─────────

const SFX = {

  hit(){
    impactLayer(140, 50, 0.12, 0.5);
    noiseBurst(0.08, 0.25);
  },

  crit(){
    impactLayer(200, 40, 0.18, 0.8);
    noiseBurst(0.12, 0.35);
    impactLayer(1200, 2000, 0.1, 0.2);
  },

  abilityCast(){
    impactLayer(400, 800, 0.2, 0.2);
    noiseBurst(0.1, 0.1);
  },

  detonate(){
    impactLayer(80, 20, 0.5, 0.9);
    noiseBurst(0.3, 0.6);
  },

  enemyDeath(){
    impactLayer(120, 30, 0.2, 0.5);
    noiseBurst(0.1, 0.2);
  },

  eliteDeath(){
    impactLayer(90, 20, 0.4, 0.8);
    noiseBurst(0.2, 0.5);
  },

  levelUp(){
    impactLayer(400, 800, 0.2, 0.4);
    impactLayer(600, 1200, 0.3, 0.3);
  },

  pickup(){
    impactLayer(800, 1200, 0.1, 0.2);
  },

  uiClick(){
    const ac = getAC();
    const osc = ac.createOscillator();
    const g = ac.createGain();

    osc.frequency.value = 1000;
    g.gain.value = 0.1;

    osc.connect(g);
    g.connect(uiGain);

    osc.start();
    osc.stop(ac.currentTime + 0.05);
  }

};

// ───────── AMBIENT SYSTEM (UPGRADED) ─────────

let ambientOscs = [];

function stopAmbient(){
  ambientOscs.forEach(o=>{
    try{o.stop()}catch(e){}
  });
  ambientOscs = [];
}

function playAmbient(freq){
  stopAmbient();
  const ac = getAC();

  const base = ac.createOscillator();
  const g = ac.createGain();

  base.type = 'sine';
  base.frequency.value = freq;

  g.gain.value = 0.05;

  base.connect(g);
  g.connect(musicGain);

  base.start();

  ambientOscs.push(base);
}

// ───────── AUTO INIT ─────────
document.addEventListener('click', () => {
  getAC();
});
