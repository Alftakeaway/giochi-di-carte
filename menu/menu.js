(function(){
 'use strict';
 // Navigation stays native: this script adds help and a local save indicator only.
 for(const button of document.querySelectorAll('[data-dialog]')){
  const dialog=document.getElementById(button.dataset.dialog);
  if(!dialog||typeof dialog.showModal!=='function')continue;
  button.disabled=false;button.onclick=()=>dialog.showModal();
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 }
 for(const badge of document.querySelectorAll('[data-save]')){
  try{const raw=localStorage.getItem(badge.dataset.save);if(!raw)continue;const data=JSON.parse(raw);if(data.version===1&&data.state&&!data.state.finished&&Array.isArray(data.state.hands)&&['play','trick-end','round-end'].includes(data.state.phase))badge.hidden=false;}catch{/* Storage may be unavailable; all games remain reachable. */}
 }
})();
