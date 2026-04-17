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
};

// ─── MP3 MUSIC PLAYER ────────────────────────────
const TRACKS = ['Ruined_Clockwork.mp3','Graveward_Oath.mp3','Iron_Symphony.mp3'];
const TRACK_LABELS = ['Ruined Clockwork','Graveward Oath','Iron Symphony'];
let musicEl = null, curTrack = 0, musicReady = false;

function startMusic(){
  if(musicReady) return;
  musicReady = true;
  loadTrack(curTrack);
}
function loadTrack(idx){
  curTrack = idx % TRACKS.length;
  if(musicEl){ musicEl.pause(); musicEl.src=''; }
  musicEl = new Audio(TRACKS[curTrack]);
  musicEl.volume = 0;
  musicEl.loop = false;
  musicEl.play().then(()=>{
    fadeVolume(musicEl, 0, 0.45, 3000);
    const lbl = document.getElementById('musicLabel');
    if(lbl){ lbl.style.display='block'; lbl.textContent='♪ '+TRACK_LABELS[curTrack]; }
    addFeed('♪ '+TRACK_LABELS[curTrack].toUpperCase(),'#3d2555');
  }).catch(()=>{
    // If files not found, silently generate ambient
    startAmbient();
  });
  musicEl.addEventListener('ended',()=>{
    fadeVolume(musicEl, musicEl.volume, 0, 1500, ()=>loadTrack(curTrack+1));
  });
}
function fadeVolume(el, from, to, ms, cb){
  let t=0; const step=50;
  el.volume = from;
  const iv = setInterval(()=>{
    t+=step;
    el.volume = Math.max(0,Math.min(1, from+(to-from)*(t/ms)));
    if(t>=ms){ clearInterval(iv); if(cb) cb(); }
  },step);
}
// Fallback ambient if no MP3s
let ambiRunning=false;
function startAmbient(){
  if(ambiRunning)return; ambiRunning=true;
  try{
    const ac=getAC();
    const g1=ac.createGain(),g2=ac.createGain(),g3=ac.createGain();
    g1.gain.setValueAtTime(0,ac.currentTime); g1.gain.linearRampToValueAtTime(0.04,ac.currentTime+4);
    g2.gain.setValueAtTime(0,ac.currentTime); g2.gain.linearRampToValueAtTime(0.02,ac.currentTime+5);
    g3.gain.setValueAtTime(0,ac.currentTime); g3.gain.linearRampToValueAtTime(0.015,ac.currentTime+3);
    g1.connect(ac.destination); g2.connect(ac.destination); g3.connect(ac.destination);
    const o1=ac.createOscillator(),o2=ac.createOscillator(),o3=ac.createOscillator();
    o1.type='sine';o1.frequency.value=55;o1.connect(g1);o1.start();
    o2.type='sine';o2.frequency.value=82.4;o2.connect(g2);o2.start();
    o3.type='triangle';o3.frequency.value=110;o3.connect(g3);o3.start();
    // Slow LFO on pitch
    const lfo=ac.createOscillator(),lfoG=ac.createGain();
    lfo.frequency.value=0.08;lfo.type='sine';lfoG.gain.value=1.5;
    lfo.connect(lfoG);lfoG.connect(o1.frequency);lfo.start();
    setInterval(()=>{
      try{const a=ac,o=a.createOscillator(),gn=a.createGain();
        o.type='sine';o.frequency.value=[220,165,275,330,247][Math.floor(Math.random()*5)];
        o.connect(gn);gn.connect(a.destination);
        const t=a.currentTime;gn.gain.setValueAtTime(0,t);gn.gain.linearRampToValueAtTime(0.035,t+0.1);gn.gain.exponentialRampToValueAtTime(0.0001,t+4);
        o.start(t);o.stop(t+4.1);
      }catch(e){}
    },8000+Math.random()*6000);
  }catch(e){}
}

