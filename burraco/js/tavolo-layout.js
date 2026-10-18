/* Presentation only. Game rules and server actions remain in their adapters. */
(function () {
 'use strict';
 const byId=id=>document.getElementById(id);
 const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text)e.textContent=text;return e};
 let current=null, raf=0;
 function fit(){
  if(!current)return;
  const root=byId('tavolo');if(!root||root.hidden)return;
  const rows=[];
  for(const team of root.querySelectorAll('.approved-team')){
   const area=team.querySelector('.approved-rows'), melds=[...area.querySelectorAll('.meld')];
   for(let i=0;i<2;i++)rows.push({area,items:melds.slice(i*8,i*8+8),index:i});
  }
  const base=innerWidth<=700?74:innerWidth<=1100?84:90;
  const gap=4;let rowGap=94;
  // Reserve eight columns even when only one combination has been laid.
  let cw=90;
  for(const row of rows){
   const actual=row.items.reduce((n,m)=>n+(m.classList.contains('burraco')?1.405:1),0);
   const capacity=Math.max(8.405,actual);
   cw=Math.min(cw,(row.area.clientWidth-7*gap-4)/capacity);
   // Two complete thirteen-card burrachi, with readable short groups.
   cw=Math.min(cw,(row.area.clientHeight/2-23)/2.6,row.area.clientHeight/2-121);
  }
  for(const row of rows){
   const needed=Math.max(23+cw*2.6,121+cw);
   rowGap=Math.min(rowGap,Math.max(0,row.area.clientHeight-2*needed));
  }
  const hw=base*Math.pow(1.2,3);
  root.style.setProperty('--layout-cw',cw+'px');root.style.setProperty('--layout-hw',hw+'px');
  for(const row of rows){
   let left=0;const height=(row.area.clientHeight-rowGap)/2;
   const footprint=row.items.reduce((n,m)=>n+cw*(m.classList.contains('burraco')?1.405:1),0);
   const spacing=Math.max(0,Math.min(4,(row.area.clientWidth-footprint)/Math.max(1,row.items.length-1)));
   for(const m of row.items){
    const cards=[...m.querySelector('.pila-meld').children],bur=m.classList.contains('burraco');
    const room=height-21-(bur?cw+2:cw*1.4);
    const step=Math.min(26,Math.max(1,Math.floor(room/Math.max(1,cards.length-1)))), width=cw*(bur?1.405:1);
    m.style.setProperty('--layout-step',step+'px');
    m.style.left=left+'px';m.style.top=(row.index*(height+rowGap)+18)+'px';
    m.style.width=width+'px';m.style.height=((cards.length-1)*step+(bur?cw+2:cw*1.4))+'px';
    cards.forEach((c,i)=>{c.style.top=(i*step)+'px';c.style.marginTop='0'});
    left+=width+spacing;
   }
  }
  const hand=byId('mano-giocatore');
  [...hand.children].forEach((c,i)=>{c.style.marginLeft='0';c.style.width=(i===hand.children.length-1?hw:22)+'px';c.style.height='70px';c.setAttribute('role','button');c.tabIndex=0;c.setAttribute('aria-label',c.querySelector('img')?.alt||'Carta');c.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();c.click()}}});
 }
 function schedule(){cancelAnimationFrame(raf);raf=requestAnimationFrame(fit)}
 function decorate(p,ui,options){
  current={p,ui,options:options||{}};const root=byId('tavolo'),field=byId('campo-gioco'),footer=root.querySelector('.footer-tavolo');
  root.classList.add('approved-board');
  const me=ui.manoVisibile, count=p.nGioc, partner=count===4?(me+2)%4:null;
  root.classList.toggle('layout-two',count===2);
  const others=Array.from({length:count},(_,i)=>i).filter(g=>g!==me&&g!==partner);
  if(!field.querySelector('.approved-teams')){
   const oldDraw=footer.querySelector('.approved-draw');if(oldDraw)oldDraw.remove();
   const center=field.querySelector('.col-centro');
   const teams=node('div','approved-teams');
   for(const own of [true,false]){
    const section=node('section','approved-team '+(own?'ours':'theirs'));
    section.append(node('h2','',own?'Le vostre combinazioni':'Le loro combinazioni'));
    const rows=node('div','approved-rows');
    for(const g of own?[me,partner].filter(x=>x!==null):others){
     const list=byId('melds-'+g);if(list){const col=list.closest('.colonna');rows.append(col);col.dataset.layoutOwner=String(g);}
    }
    section.append(rows);teams.append(section);
   }
   field.replaceChildren(teams,node('div','approved-side west'),node('div','approved-side east'));
   if(center){center.classList.add('approved-draw');footer.prepend(center);}
  }
  let tools=footer.querySelector('.approved-tools');if(!tools){tools=node('div','approved-tools');footer.append(tools);}
  const bar=byId('barra-azioni');footer.querySelector('.area-mano').append(bar);const nativeButtons=[...bar.querySelectorAll('button')];
  let ord=bar.querySelector('#ordinamento');if(!ord&&!tools.querySelector('#ordinamento')&&!options){ord=node('div','ordinamento');ord.id='ordinamento';for(const [value,label] of [['combinazioni','Combinazioni'],['numero','Numero'],['seme','Seme']]){const b=node('button','ord-btn',label);b.type='button';b.dataset.ordine=value;ord.append(b)}}if(ord){const old=tools.querySelector('#ordinamento');if(old)old.remove();tools.prepend(ord);}
  let pots=tools.querySelector('.approved-pots');if(!pots){pots=node('div','approved-pots');tools.append(pots);}
  const team=p.squadre?p.squadre[me]:me;
  pots.textContent='Pozzetto: '+(p.stato.pozzettoPreso[team]?'preso':'da prendere');
  let details=tools.querySelector('.approved-details');if(!details){details=node('button','btn approved-details','Punteggi');details.type='button';details.onclick=()=>{if(current.options.details)current.options.details();else byId('btn-menu').click()};tools.append(details);}
  const extra=nativeButtons.find(b=>b.textContent.includes('Suggerisci'));if(extra){const old=tools.querySelector('.approved-hint');if(old)old.remove();extra.classList.add('approved-hint');tools.append(extra);}
  let info=footer.querySelector('.approved-hand-info');if(!info){info=node('div','approved-hand-info');footer.querySelector('.area-mano').append(info);}
  info.textContent='La tua mano '+p.stato.mani[me].length+' carte';
  const active=!p.stato.finita&&p.stato.turno===me&&!ui.botInCorso&&!ui.attesaConsegna;
  const playing=active&&p.stato.fase==='gioco',selected=[...ui.selezione];
  const api=options||{};
  const run=(method,args,type)=>{if(api[method])return api[method](...(args||[]));return window.__burraco.azione(()=>p[method](...(args||[])),type||method)};
  const make=(text,disabled,fn)=>{const b=node('button','btn',text);b.type='button';b.disabled=disabled;b.onclick=fn;return b};
  const drawing=active&&p.stato.fase==='pesca';
  const tallone=make('Pesca dal tallone',!drawing||!(p.stato.tallone?.length||p.stato.talloneCount),()=>run('pescaTallone',[],'pesca'));
  const monte=make('Prendi il monte',!drawing||!p.stato.monte.length,()=>run('prendiMonte',[],'pesca'));
  const cala=nativeButtons.find(b=>b.textContent.includes('Cala'))||make('Cala',!(playing&&selected.length>=3),()=>run('cala',[selected],'cala'));
  const scarta=nativeButtons.find(b=>b.textContent.includes('Scarta')||b.textContent.includes('Chiudi la smazzata'))||make('Scarta',!(playing&&selected.length===1),()=>run('scarta',[selected[0]],'scarta'));
  if(!scarta.textContent.includes('Chiudi'))scarta.textContent='Scarta';cala.textContent='Cala';
  const lega=make('Lega',!(playing&&selected.length===1),()=>{root.dataset.lega='true';const target=field.querySelector('.meld.target');if(target)target.focus();const status=byId('log-mosse');if(status)status.textContent='Scegli una combinazione tua o del compagno per legare la carta.';});
  const badge=byId('turno-badge');badge.textContent=p.stato.finita?'Smazzata finita':active?'È il tuo turno':'Attendi il turno';badge.classList.toggle('layout-active',active);
  const preview=bar.querySelector('#anteprima');
  bar.replaceChildren(tallone,monte,cala,lega,scarta,badge);if(preview)bar.append(preview);
  const bots=[...byId('mano-avversario').querySelectorAll('.mano-bot')];
  const labels=others.map((g,i)=>({g,text:'Avv. '+(i+1)}));
  for(const [i,cls] of ['west','east'].entries()){
   const side=field.querySelector('.'+cls),item=count===2?null:labels[i];side.textContent=item?item.text+' · '+p.stato.mani[item.g].length+' carte':'';
  }
  const header=root.querySelector('.barra-superiore');
  if(!header.querySelector('.approved-fullscreen')){
   const full=node('button','btn approved-fullscreen','⛶');full.type='button';
   const sync=()=>{const on=!!document.fullscreenElement;full.setAttribute('aria-label',on?'Esci da schermo intero':'Schermo intero');full.title=on?'Esci da schermo intero (Esc)':'Schermo intero';full.setAttribute('aria-pressed',String(on));full.textContent=on?'⛶ Esci':'⛶ Schermo intero';schedule()};
   full.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch(e){full.title='Schermo intero non disponibile: prova F11';const note=byId('notifiche');if(note)note.textContent='Schermo intero non disponibile: prova F11.'}};
   full.hidden=!document.fullscreenEnabled;byId('btn-menu').after(full);document.addEventListener('fullscreenchange',sync);sync();
  }
  let comp=header.querySelector('.approved-partner');if(!comp){comp=node('div','approved-partner');header.append(comp);}
  const partnerBot=partner!==null?bots.find(b=>b.dataset.layoutSeat===String(partner))||bots[others.indexOf(partner)]:null;
  comp.replaceChildren();
  const opposite=partner!==null?partner:count===2?others[0]:null;
  if(opposite!==null){comp.append(node('span','', (partner!==null?'Compagno':'Avversario')+' · '+p.stato.mani[opposite].length+' carte'));for(let i=0;i<Math.min(5,p.stato.mani[opposite].length);i++){const im=node('img');im.src='img/carte/retro.webp';im.alt='Carta coperta';comp.append(im)}}
  for(let g=0;g<count;g++){
   for(const m of byId('melds-'+g)?.querySelectorAll('.meld')||[]){
    m.setAttribute('tabindex','0');m.dataset.layoutName=g===me?'Tu':g===partner?'Comp.':labels.find(x=>x.g===g)?.text||'Avv.';
    const stamp=m.querySelector('.timbro');if(stamp){const kind=m.classList.contains('semipulito')?'semipulito':m.classList.contains('pulito')?'pulito':'sporco';stamp.textContent='★';stamp.title='Burraco '+kind;stamp.setAttribute('aria-label','Burraco '+kind);}
   }
  }
  if(!root.dataset.layoutEvents){
   root.dataset.layoutEvents='true';
   root.addEventListener('click',ev=>{const m=ev.target.closest('.meld');if(!m||root.dataset.lega!=='true')return;const c=current;const owner=Number(m.dataset.giocatore);if(c.p.squadre[owner]!==c.p.squadre[c.ui.manoVisibile])return;const id=[...c.ui.selezione][0];if(!id)return;ev.stopImmediatePropagation();root.dataset.lega='';const idx=Number(m.dataset.indice);if(c.options.lega)c.options.lega(idx,id,owner);else window.__burraco.azione(()=>c.p.lega(idx,id,owner),'lega');},true);
  }
  schedule();
 }
 window.BurracoApproved={decorate,fit:schedule};
 addEventListener('resize',schedule);
})();
