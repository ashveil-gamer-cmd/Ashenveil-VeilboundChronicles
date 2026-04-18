// ───── compatibility volume API ─────
function handleVolumeChange(value){
  const n = Math.max(0, Math.min(100, Number(value) || 0));
  setMasterVolume(n / 100);

  const valueEl = document.getElementById('volumeValue');
  if(valueEl) valueEl.textContent = `${n}%`;

  const slider = document.getElementById('volumeSlider');
  if(slider && String(slider.value) !== String(n)) slider.value = String(n);
}

function handleMuteToggle(){
  const muted = getMasterVolume() > 0;
  if(muted){
    setMasterVolume(0);
  } else {
    setMasterVolume(0.6);
  }

  const pct = Math.round(getMasterVolume() * 100);
  const valueEl = document.getElementById('volumeValue');
  if(valueEl) valueEl.textContent = `${pct}%`;

  const slider = document.getElementById('volumeSlider');
  if(slider) slider.value = String(pct);

  const btn = document.getElementById('volumeBtn');
  if(btn) btn.textContent = pct === 0 ? '🔇' : '🔊';
}

function toggleVolumePanel(){
  const panel = document.getElementById('volumePanel');
  if(!panel) return;
  panel.style.display = panel.style.display === 'none' || !panel.style.display ? 'block' : 'none';
}