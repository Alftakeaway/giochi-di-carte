/* Adapter from the existing server state to the approved view. No socket changes. */
(function(){
 'use strict';
 const el=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text)e.textContent=text;return e};
 const suits={cuori:'Hearts',quadri:'Diamonds',fiori:'Clubs',picche:'Spades'};
 let order='combinazioni';
 function card(c,hidden){
  const d=el('div','carta');d.dataset.id=c?.id||'';
  const im=el('img');
  const rank={1:'Ace',11:'Jack',12:'Queen',13:'King'}[c?.valore]||c?.valore;
  const file=hidden?'retro':c.jolly?'Joker_red':rank+'_of_'+suits[c.seme];
  im.src='img/carte/'+file+'.webp';im.alt=hidden?'Carta coperta':c.etichetta;im.style.cssText='width:100%;height:100%;display:block';d.append(im);
  return d;
 }
 function attach(i,selection,owner){
  const ids=Array.isArray(selection)?selection:[selection];
  if((owner!==seat&&!last.teamMelds)||(ids.length>1&&!last.multiAttach)){status('Il server sta aggiornando le legature: riprova fra poco.','err');return}
  act({tipo:'lega',indice:i,...(ids.length===1?{id:ids[0]}:{ids}),proprietario:owner});
 }
 function meld(m,g,i){
  const d=el('div','meld'+(m.burraco?' burraco '+(m.pulito?'pulito':m.semipulito?'semipulito':'sporco'):''));d.dataset.giocatore=g;d.dataset.indice=i;
  const head=el('div','testata');if(m.burraco)head.append(el('span','timbro','★'));d.append(head);
  const pile=el('div','pila-meld');
  const slots=m.slots.slice().reverse();slots.forEach((s,idx)=>{const c=card(s.carta);c.style.zIndex=String(100+idx);if(m.burraco&&idx===slots.length-1){const holder=el('div','slot-traverso');c.classList.add('di-traverso');holder.style.zIndex='200';holder.append(c);pile.append(holder)}else pile.append(c)});d.append(pile);
  d.addEventListener('click',()=>{if(last.squadre[g]!==last.squadre[seat]||!myTurn()||last.fase!=='gioco'||sel.size<1)return;attach(i,[...sel],g)});
  return d;
 }
 const root=el('div','tavolo');root.id='tavolo';root.hidden=true;
 root.innerHTML='<header class="barra-superiore"><button class="btn" id="btn-menu" type="button" aria-label="Connessione e partita">☰</button><div class="marchio">Burraco</div><div class="punteggi" id="punteggi"></div><span id="turno-badge"></span></header><section class="area-avversario"><div id="mano-avversario"></div></section><section class="campo-gioco" id="campo-gioco"></section><footer class="footer-tavolo"><div class="area-mano"><div class="mano" id="mano-giocatore"></div></div><div id="barra-azioni"></div></footer>';
 document.body.append(root);
 const oldRender=render;
 function update(st){
  if(seat<0||!st.seats[seat])return;
  root.hidden=false;document.body.classList.add('layout-online');
  const connectionNote=document.querySelector('.approved-net-status');if(connectionNote)connectionNote.textContent='Stanza '+roomCode;
  if(!document.getElementById('melds-0')){
   const f=document.getElementById('campo-gioco');
   for(const s of st.seats){const col=el('div','colonna');col.innerHTML='<div class="etichetta-zona"></div>';const list=el('div','lista-melds');list.id='melds-'+s.seat;col.append(list);f.append(col)}
   const c=el('div','colonna col-centro');c.innerHTML='<div class="mazzetti"><div class="mazzetto" id="mazzetto-tallone"><div class="pila" id="tallone-pila"></div><div class="didascalia" id="tallone-didascalia"></div></div><div class="mazzetto" id="mazzetto-monte"><div class="pila" id="monte-pila"></div><div class="didascalia" id="monte-didascalia"></div></div></div><div class="centro-destra"><div id="log-mosse"></div><div class="notifiche" id="notifiche" role="status"></div></div>';f.append(c);
   document.getElementById('mazzetto-tallone').onclick=()=>{if(myTurn()&&last.fase==='pesca'&&last.talloneCount)pesca('tallone')};
   document.getElementById('mazzetto-monte').onclick=()=>{if(myTurn()&&last.fase==='pesca'&&last.monte.length)pesca('monte')};
  }
  for(const s of st.seats){const list=document.getElementById('melds-'+s.seat);list.replaceChildren(...s.melds.map((m,i)=>meld(m,s.seat,i)))}
  const hand=document.getElementById('mano-giocatore');hand.replaceChildren();let cards=st.seats[seat].hand.slice();
  if(order==='numero')cards.sort((a,b)=>a.valore-b.valore);if(order==='seme')cards.sort((a,b)=>(a.seme||'z').localeCompare(b.seme||'z')||a.valore-b.valore);
  for(const c of cards){const d=card(c);d.classList.add('cliccabile');d.setAttribute('role','button');d.tabIndex=0;d.setAttribute('aria-label',c.etichetta);d.classList.toggle('selezionata',sel.has(c.id));const select=()=>{if(!myTurn())return;if(sel.has(c.id))sel.delete(c.id);else sel.add(c.id);render(last)};d.onclick=select;d.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}};hand.append(d)}
  document.getElementById('tallone-pila').replaceChildren(...(st.talloneCount?[card(null,true)]:[]));document.getElementById('monte-pila').replaceChildren(...(st.monte.length?[card(st.monte[st.monte.length-1])]:[]));
  document.getElementById('tallone-didascalia').textContent='Tallone · '+st.talloneCount;document.getElementById('monte-didascalia').textContent='Monte · '+st.monte.length;
  document.getElementById('punteggi').replaceChildren(...st.totaliSquadra.map((t,i)=>el('div','punteggio-box',(i===st.squadre[seat]?'Voi ':'Loro ')+t)));
  document.getElementById('mano-avversario').replaceChildren();
  const bar=document.getElementById('barra-azioni');const badge=document.getElementById('turno-badge');if(badge)root.querySelector('header').append(badge);bar.replaceChildren();
  const ord=el('div','ordinamento');ord.id='ordinamento';for(const [v,t] of [['combinazioni','Combinazioni'],['numero','Numero'],['seme','Seme']]){const b=el('button','ord-btn'+(order===v?' attivo':''),t);b.type='button';b.onclick=()=>{order=v;render(last)};ord.append(b)}bar.append(ord);
  const fake={nGioc:st.nGioc,squadre:st.squadre,stato:{...st,mani:st.seats.map(s=>s.seat===seat?s.hand:Array(s.handCount).fill(null)),pozzettoPreso:st.pozzetti.map(p=>p.taken)}};
  const ui={manoVisibile:seat,selezione:sel,botInCorso:false,attesaConsegna:false};
  window.BurracoApproved.decorate(fake,ui,{pescaTallone:()=>pesca('tallone'),prendiMonte:()=>pesca('monte'),cala:()=>calaSel(),scarta:()=>scartaSel(),lega:(i,ids,owner)=>attach(i,ids,owner),details:()=>showScores(st)});
 }
 function showScores(st){let dlg=document.getElementById('online-scores');if(!dlg){dlg=el('dialog');dlg.id='online-scores';document.body.append(dlg)}dlg.replaceChildren(el('h2','',st.finita?'Smazzata conclusa':'Punteggi'),el('p','',st.totaliSquadra.map((v,i)=>(i===st.squadre[seat]?'Voi: ':'Loro: ')+v).join(' · ')));if(st.finita&&st.vincitore==null){const next=el('button','btn','Smazzata successiva');next.onclick=()=>{act({tipo:'next'});dlg.close()};dlg.append(next)}const close=el('button','btn','Chiudi');close.onclick=()=>dlg.close();dlg.append(close);dlg.showModal()}
 document.getElementById('btn-menu').onclick=()=>document.body.classList.toggle('show-online-connection');
 render=function(st){oldRender(st);update(st)};
 // Preserve reconnect feedback; the connection panel remains available from Menu.
 const notice=el('div','approved-net-status');notice.setAttribute('role','status');document.body.append(notice);
 new MutationObserver(()=>{notice.textContent=document.getElementById('status').textContent;notice.classList.toggle('error',document.getElementById('status').classList.contains('err'))}).observe(document.getElementById('status'),{childList:true,characterData:true,subtree:true});
})();
