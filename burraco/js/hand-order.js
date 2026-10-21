/* Local presentation order only: never reorders the engine or sends a server action. */
(function(){
 'use strict';
 const local=new WeakMap(),online=new Map();let current=null,suppressUntil=0;
 const hand=()=>document.getElementById('mano-giocatore');
 const cards=()=>[...hand().children].filter(e=>e.classList.contains('carta'));
 function state(){const key=current.options.handKey||current.p,store=typeof key==='string'?online:local;let owners=store.get(key);if(!owners){owners=new Map();store.set(key,owners)}const owner=current.ui.manoVisibile;if(!owners.has(owner))owners.set(owner,{manual:false,ids:[]});return owners.get(owner)}
 function controls(){const s=state();for(const b of document.querySelectorAll('#ordinamento .ord-btn')){const chosen=s.manual?b.dataset.ordine==='manuale':b.dataset.ordine===current.ui.ordineMano;b.classList.toggle('attivo',chosen);b.setAttribute('aria-pressed',String(chosen))}}
 function apply(){const s=state();if(!s.manual){controls();return}const nodes=cards(),byId=new Map(nodes.map(c=>[c.dataset.id,c]));s.ids=[...s.ids.filter(id=>byId.has(id)),...nodes.map(c=>c.dataset.id).filter(id=>!s.ids.includes(id))];hand().append(...s.ids.map(id=>byId.get(id)));current.ui.ordineMano='manuale';controls()}
 function remember(nodes){const s=state();s.manual=true;s.ids=nodes.map(c=>c.dataset.id);apply();window.BurracoApproved?.fit()}
 function allowed(){return current&&!current.p.stato.finita&&!current.ui.attesaConsegna}
 function handTarget(x,y){const r=hand().getBoundingClientRect(),area=hand().closest('.area-mano').getBoundingClientRect();return y>=r.top-24&&y<=Math.min(innerHeight,area.bottom+24)&&x>=area.left-24&&x<=Math.max(area.right,r.right)+24}
 function insertAt(nodes,x){const i=nodes.findIndex(n=>{const r=n.getBoundingClientRect();return x<r.left+Math.min(r.width,22)/2});return i<0?nodes.length:i}
 function bind(){const box=hand();if(box.dataset.handOrderBound)return;box.dataset.handOrderBound='true';
  box.addEventListener('click',e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation()}},true);
  box.addEventListener('keydown',e=>{if(!e.altKey||!['ArrowLeft','ArrowRight'].includes(e.key)||!allowed())return;const card=e.target.closest('.carta');if(!card)return;e.preventDefault();e.stopImmediatePropagation();const nodes=cards(),i=nodes.indexOf(card),j=Math.max(0,Math.min(nodes.length-1,i+(e.key==='ArrowLeft'?-1:1)));nodes.splice(i,1);nodes.splice(j,0,card);remember(nodes);card.focus()},true);
  box.addEventListener('pointerdown',e=>{
   const source=e.target.closest('.carta');if(!source||e.button!==0||!allowed())return;
   // Hand gestures take priority over the older hand-to-meld-only drag handler.
   e.stopImmediatePropagation();const initialState=state(),id=source.dataset.id,start={x:e.clientX,y:e.clientY},pointer=e.pointerId;
   let dragging=false,ghost=null,marker=null;
   const cleanup=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);ghost?.remove();marker?.remove();source.classList.remove('hand-order-source')};
   const move=ev=>{if(ev.pointerId!==pointer)return;if(!dragging){if(Math.hypot(ev.clientX-start.x,ev.clientY-start.y)<6)return;dragging=true;source.classList.add('hand-order-source');ghost=document.createElement('div');ghost.className='hand-order-ghost';const image=source.querySelector('img');if(image)ghost.append(image.cloneNode(true));const w=parseFloat(getComputedStyle(document.getElementById('tavolo')).getPropertyValue('--layout-hw'))||100;ghost.style.width=w+'px';ghost.style.height=w*1.4+'px';document.body.append(ghost);marker=document.createElement('div');marker.className='hand-order-marker';document.body.append(marker)}ev.preventDefault();ghost.style.left=ev.clientX+12+'px';ghost.style.top=ev.clientY-24+'px';const targets=cards().filter(n=>n.dataset.id!==id),index=insertAt(targets,ev.clientX),rect=(targets[index]||targets[targets.length-1]||source).getBoundingClientRect();marker.hidden=!handTarget(ev.clientX,ev.clientY);marker.style.left=(index<targets.length?rect.left:rect.right)+'px';marker.style.top=hand().getBoundingClientRect().top-8+'px'};
   const up=ev=>{if(ev.pointerId!==pointer)return;cleanup();if(!dragging)return;suppressUntil=Date.now()+180;ev.preventDefault();if(!current||state()!==initialState||!allowed())return;const sourceNow=cards().find(c=>c.dataset.id===id);if(!sourceNow)return;
    if(handTarget(ev.clientX,ev.clientY)){const nodes=cards().filter(n=>n!==sourceNow);nodes.splice(insertAt(nodes,ev.clientX),0,sourceNow);remember(nodes);return}
    const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.meld'),s=current.p.stato,g=current.ui.manoVisibile;
    if(target&&s.turno===g&&s.fase==='gioco'&&!current.ui.botInCorso){const owner=Number(target.dataset.giocatore),index=Number(target.dataset.indice);if(current.p.squadre[owner]!==current.p.squadre[g])return;if(current.options.lega)current.options.lega(index,[id],owner);else window.__burraco.azione(()=>current.p.lega(index,id,owner),'lega')}
   };
   const cancel=()=>{cleanup();if(dragging)suppressUntil=Date.now()+180};
   document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);
  },true);
 }
 function decorate(context){current=context;bind();const sort=document.getElementById('ordinamento');if(sort&&!sort.querySelector('[data-ordine="manuale"]')){const b=document.createElement('button');b.type='button';b.className='ord-btn';b.dataset.ordine='manuale';b.textContent='Manuale';b.title='Trascina le carte per scegliere il tuo ordine (Alt + frecce da tastiera)';b.onclick=()=>remember(cards());sort.prepend(b)}
  if(sort&&!sort.dataset.handOrderBound){sort.dataset.handOrderBound='true';sort.addEventListener('click',e=>{const b=e.target.closest('.ord-btn');if(b&&b.dataset.ordine!=='manuale'){const s=state();s.manual=false;s.ids=[]}},true)}apply();
 }
 window.BurracoHandOrder={decorate};
})();
