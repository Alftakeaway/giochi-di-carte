(function(){
 'use strict';
 const E=ScalaEngine,A=ScalaAI,$=id=>document.getElementById(id),KEY='scala40-v1';
 let match=null,variant='due',difficulty='normal',rounds=3,view=0,sel=new Set(),meldPick=null,timer=null,ticket=0,paused=false;
 const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const btn=(text,fn,cls='')=>{const b=node('button',cls,text);b.type='button';b.onclick=fn;return b};
 const nPlayers=()=>E.VARIANTS[variant].players;
 const teamName=t=>variant==='quattro'?(t===0?'Coppia A':'Coppia B'):(t===0?'Tu':'Avversario');
 const name=g=>match.options.names[g],human=g=>match.options.humans.includes(g);
 function exists(){try{return !!localStorage.getItem(KEY)}catch{return false}}
 function save(){try{localStorage.setItem(KEY,match.export())}catch{$('setup-notice').textContent='Salvataggio non disponibile in questo browser.'}}
 function stop(){ticket++;clearTimeout(timer);timer=null}
 function active(){return match&&match.state.phase==='play'&&match.state.turn===view&&human(view)&&!paused&&$('handover').hidden&&!document.hidden}
 function choices(id,key,fn){const list=[...$(id).querySelectorAll('button')];for(const b of list)b.onclick=()=>{list.forEach(x=>{x.classList.toggle('chosen',x===b);x.setAttribute('aria-pressed',String(x===b))});fn(b.dataset[key])}}
 function seats(){const n=nPlayers();$('seats').replaceChildren();for(let g=0;g<n;g++){const l=node('label');l.append(node('span','',g===0?'Tu':variant==='quattro'&&g===2?'Compagno':'Avversario '+g));const s=node('select');s.dataset.seat=g;s.setAttribute('aria-label','Tipo giocatore '+(g+1));for(const [v,t] of [['bot','Computer'],['human','Umano']]){const o=node('option','',t);o.value=v;s.append(o)}s.value=g===0?'human':'bot';s.disabled=g===0;l.append(s);$('seats').append(l)}$('variant-note').textContent=variant==='quattro'?'Tredici carte a testa, due coppie con un compagno di fronte. Vince la coppia con meno penalità.':'Tredici carte a testa, uno contro uno. Vince chi ha meno penalità.'}
 choices('variants','variant',v=>{variant=v;seats()});choices('levels','level',v=>difficulty=v);choices('duration','duration',v=>rounds=+v.slice(1));seats();$('resume').hidden=!exists();
 function openGame(){stop();paused=false;sel.clear();meldPick=null;view=match.options.humans[0];$('setup').hidden=true;$('game').hidden=false;$('handover').hidden=true;if(match.options.humans.length>1&&match.state.phase==='play'&&human(match.state.turn)){view=match.state.turn;handover()}render();if(match.state.fineMano)scores();else advance()}
 $('start').onclick=()=>{const n=nPlayers(),humans=[...$('seats').querySelectorAll('select')].filter(s=>s.value==='human').map(s=>+s.dataset.seat),names=Array.from({length:n},(_,g)=>humans.length>1?'Giocatore '+(g+1):g===0?'Tu':variant==='quattro'&&g===2?'Compagno':'Computer '+g);match=new E.Match({variant,difficulty,rounds,humans,names});save();openGame()};
 $('resume').onclick=()=>{try{match=E.Match.restore(localStorage.getItem(KEY));variant=match.options.variant;difficulty=match.options.difficulty;rounds=match.options.rounds;openGame()}catch{$('setup-notice').textContent='Salvataggio non valido. Puoi iniziare una nuova partita.'}};
 function cardBtn(c,enabled){const b=btn('',()=>{if(sel.has(c.id))sel.delete(c.id);else sel.add(c.id);render()},'playing-card'+(sel.has(c.id)?' marked':''));b.dataset.card=c.id;b.disabled=!enabled;const im=node('img');im.src=c.img;im.alt=E.label(c);im.draggable=false;b.append(im);b.setAttribute('aria-label',E.label(c));return b}
 function handover(){$('handover-name').textContent=name(view);$('handover').hidden=false;sel.clear();meldPick=null}
 function seat(id,g){const box=$(id);box.replaceChildren();box.hidden=g===null;if(g===null)return;const s=match.state;box.classList.toggle('active',s.turn===g&&s.phase==='play');const info=node('div');info.append(node('strong','',name(g)),node('span','',(s.hands[g]?s.hands[g].length:0)+' carte in mano'));box.append(info);const backs=node('div','backs');for(let i=0;i<Math.min(3,s.hands[g].length);i++){const im=node('img');im.src='../burraco/img/carte/retro.webp';im.alt='';backs.append(im)}backs.setAttribute('aria-hidden','true');box.append(backs)}
 function render(){if(!match)return;const s=match.state,n=s.hands.length,own=match.team(view),isActive=active();
  $('game-title').textContent=E.VARIANTS[match.options.variant].label;
  $('round-label').textContent='Smazzata '+s.round+'/'+match.options.rounds;
  $('match-score').replaceChildren(...s.totals.map((v,i)=>{const span=node('span');span.append(node('small','',teamName(i)),node('strong','',v));return span}));
  seat('opposite',(view+Math.floor(n/2))%n);seat('west',n===4?(view+1)%n:null);seat('east',n===4?(view+3)%n:null);
  $('deck-count').textContent='Tallone: '+s.tallone.length;
  const top=s.scarti[s.scarti.length-1];
  if(top){$('discard-top').src=top.img;$('discard-top').alt=E.label(top);$('discard-label').textContent='Scarti: '+s.scarti.length}else{$('discard-top').removeAttribute('src');$('discard-label').textContent='Scarti vuoti'}
  $('deck-pile').disabled=!(isActive&&s.fase==='pesca');$('discard-pile').disabled=!(isActive&&s.fase==='pesca'&&s.scarti.length>0);
  const note=$('apertura-note');note.replaceChildren();
  note.append(node('span','',s.fase==='pesca'?'Pesca dal tallone o prendi lo scarto in cima.':s.fase==='gioco'?'Cala i giochi, lega alle combinazioni, poi scarta.':'Mano conclusa.'));
  if(!s.apertoTeam[own])note.append(node('span','aperta','Apertura: servono 40 punti in una sola calata'));
  else note.append(node('span','aperta','Hai aperto: puoi legare'));
  const mz=$('melds');mz.replaceChildren();
  if(!s.melds.length)mz.append(node('p','','Nessun gioco calato.'));
  s.melds.forEach((m,i)=>{const d=node('div','meld'+(meldPick===i?' picked':'')+(s.fineMano&&s.chiusura&&s.chiusura.team===m.team?' chiusa-evidenza':''));d.tabIndex=0;d.setAttribute('role','button');d.setAttribute('aria-label','Gioco '+i+' di '+teamName(m.team));
   d.append(node('span','owner',teamName(m.team)+' · '+(m.tipo==='gruppo'?'gruppo':'scala')));
   const imgs=node('div','cards');for(const c of m.carte){const im=node('img');im.src=c.img;im.alt=E.label(c);imgs.append(im)}d.append(imgs);d.append(node('div','punti',m.punti+' punti'));
   d.onclick=()=>{if(!isActive||s.fase!=='gioco')return;meldPick=meldPick===i?null:i;render()};
   mz.append(d)});
  $('hand-label').textContent=name(view)+' · '+s.hands[view].length+' carte';
  const order={quadri:0,cuori:1,fiori:2,picche:3};
  $('hand').replaceChildren(...(!$('handover').hidden?[]:s.hands[view].slice().sort((a,b)=>(a.jolly?9:order[a.suit]||0)-(b.jolly?9:order[b.suit]||0)||a.value-b.value).map(c=>cardBtn(c,isActive))));
  const can=isActive&&!s.fineMano;
  $('btn-pesca-t').hidden=!(can&&s.fase==='pesca');$('btn-pesca-s').hidden=!(can&&s.fase==='pesca');
  $('btn-cala').hidden=!(can&&s.fase==='gioco');$('btn-cala').disabled=sel.size<3;
  $('btn-lega').hidden=!(can&&s.fase==='gioco');$('btn-lega').disabled=!(sel.size>=1&&meldPick!==null);
  $('btn-scarta').hidden=!(can&&s.fase==='gioco');$('btn-scarta').disabled=sel.size!==1;
  $('btn-next').hidden=!s.fineMano;$('cancel').hidden=!sel.size;
  const ids=[...sel];$('move-note').textContent=sel.size?ids.length+' selezionata/e'+(meldPick!==null?' · gioco '+meldPick+' scelto':''):'Seleziona le carte dalla mano; tocca un gioco per legare.';
  if(paused)$('prompt').textContent='Partita in pausa';
  else if(s.fineMano)$('prompt').textContent=s.stallo?'Mano chiusa per stallo.':(s.chiusura?(teamName(s.chiusura.team)+' ha chiuso'+(s.chiusura.inMano?' in mano':'')+'.'):'Mano conclusa.');
  else if(!isActive)$('prompt').textContent=name(s.turn)+' sta giocando…';
  else if(s.fase==='pesca')$('prompt').textContent='Tocca a te: pesca dal tallone o prendi lo scarto.';
  else if(!s.apertoTeam[own])$('prompt').textContent='Tocca a te: apri con 40+ punti in una sola calata, oppure scarta.';
  else $('prompt').textContent='Tocca a te: cala, lega e poi scarta una carta.';
  requestAnimationFrame(fit);
 }
 function fit(){if($('game').hidden)return;const hand=$('hand'),h=hand.getBoundingClientRect(),count=hand.children.length;if(!count)return;const r=hand.firstChild.getBoundingClientRect(),w=r.width||80;hand.style.setProperty('--hand-overlap',Math.max(-w+18,Math.min(8,(h.width-w-8)/Math.max(1,count-1)-w))+'px')}
 function doAct(fn){const r=fn();if(!r||!r.ok){$('prompt').textContent=r&&r.error?r.error:'Mossa non valida.';render();return}sel.clear();meldPick=null;save();render();advance()}
 $('deck-pile').onclick=()=>{if(active())doAct(()=>match.pescaTallone(view))};
 $('discard-pile').onclick=()=>{if(active())doAct(()=>match.prendiScarti(view))};
 $('btn-pesca-t').onclick=$('deck-pile').onclick;$('btn-pesca-s').onclick=$('discard-pile').onclick;
 $('btn-cala').onclick=()=>{if(active())doAct(()=>match.cala(view,[...sel]))};
 $('btn-lega').onclick=()=>{if(active()&&meldPick!==null)doAct(()=>match.lega(view,meldPick,[...sel]))};
 $('btn-scarta').onclick=()=>{if(active())doAct(()=>match.scarta(view,[...sel][0]))};
 $('btn-next').onclick=()=>{if(match.state.fineMano){if(match.state.finished){close();setup()}else{match.nextRound();save();openGame()}}};
 $('cancel').onclick=()=>{sel.clear();meldPick=null;render()};
 function advance(){stop();if(!match||paused||document.hidden||!$('setup').hidden||!$('handover').hidden)return;const s=match.state,stamp=ticket;if(s.fineMano){scores();return}if(human(s.turn)){if(view!==s.turn){view=s.turn;handover()}render();return}render();timer=setTimeout(()=>{if(stamp!==ticket)return;const pick=A.suggerisci(match,s.turn);if(!pick){advance();return}let r=null;if(pick.tipo==='pesca')r=pick.sorgente==='scarti'?match.prendiScarti(s.turn):match.pescaTallone(s.turn);else if(pick.tipo==='cala')r=match.cala(s.turn,pick.ids);else if(pick.tipo==='lega')r=match.lega(s.turn,pick.idx,pick.ids);else if(pick.tipo==='scarta')r=match.scarta(s.turn,pick.id);if(r&&r.ok)save();render();advance()},700)}
 $('hint').onclick=()=>{if(!active())return;const p=A.suggerisci(match,view);sel.clear();meldPick=null;if(!p)return;if(p.tipo==='cala'||p.tipo==='lega'){for(const id of p.ids)sel.add(id);if(p.tipo==='lega')meldPick=p.idx;$('prompt').textContent=p.tipo==='cala'?'Suggerimento: cala le carte evidenziate.':'Suggerimento: lega al gioco '+p.idx+'.'}else if(p.tipo==='scarta'){sel.add(p.id);$('prompt').textContent='Suggerimento: scarta la carta evidenziata.'}else $('prompt').textContent='Suggerimento: pesca '+(p.sorgente==='scarti'?'lo scarto.':'dal tallone.');render()};
 $('show-hand').onclick=()=>{$('handover').hidden=true;render();advance()};
 function open(title,parts){stop();paused=true;render();$('dialog-body').replaceChildren(node('h2','',title),...parts);if(!$('dialog').open)$('dialog').showModal()}
 function close(){if($('dialog').open)$('dialog').close();paused=false;render();if(match&&!match.state.fineMano)advance()}
 $('dialog-close').onclick=close;$('dialog').addEventListener('cancel',e=>{e.preventDefault();close()});
 function setup(){stop();paused=false;sel.clear();meldPick=null;$('handover').hidden=true;$('game').hidden=true;$('setup').hidden=false;$('resume').hidden=!exists()}
 function scores(){const s=match.state,table=node('table','score-table'),head=node('tr');['Squadra / giocatore','Smazzata','Totale'].forEach(t=>head.append(node('th','',t)));table.append(head);s.totals.forEach((v,i)=>{const tr=node('tr');tr.append(node('td','',teamName(i)),node('td','',s.history.length?String(s.history[s.history.length-1].totals[i]):'—'),node('td','',String(v)));table.append(tr)});const parts=[node('p','',s.stallo?'Mano chiusa per stallo: nessuno ha chiuso, penalità contate a tutti.':s.chiusura?teamName(s.chiusura.team)+' ha chiuso'+(s.chiusura.inMano?' in mano (senza scarto)':'')+'. Penalità segnate agli altri.':'Mano conclusa.'),table];
  if(match.state.finished)parts.push(node('p','',(s.winners.length>1?'Partita in parità: ':'Vince ')+s.winners.map(teamName).join(' e ')+' con il totale più basso.'));
  parts.push(btn(s.finished?'Nuova partita':'Prossima mano',()=>{if(s.finished){close();setup()}else{match.nextRound();save();close();openGame()}},'primary'));parts.push(btn('Cronologia',history));const title=s.finished?(s.winners.length>1?'Partita in parità':teamName(s.winners[0])+' vince'):'Mano conclusa';open(title,parts)}
 function history(){const list=node('ol','history');for(const m of match.state.history)list.append(node('li','','Smazzata '+m.round+': '+m.totals.map((v,i)=>teamName(i)+' '+v).join(' · ')+(m.stallo?' · stallo':m.chiusura?' · chiude '+teamName(m.chiusura.team):'')));open('Le mani e i risultati',[list])}
 $('scores').onclick=()=>{if(match)scores()};
 function rules(){const list=node('ol');for(const text of ['Tredici carte a testa. A ogni turno peschi dal tallone o prendi la prima carta degli scarti, poi puoi calare o legare, e chiudi il turno scartando una carta. Vince la partita chi ha meno penalità dopo le smazzate scelte.','Apertura: la prima calata della squadra deve valere almeno 40 punti in un’unica azione. Asso 11 (1 in A-2-3), figure 10, numeri il nominale, jolly 25. Dopo aver aperto puoi calare giochi singoli e attaccare carte a qualsiasi gioco.','Giochi validi: tris o poker dello stesso valore (minimo 3 carte) oppure scale dello stesso seme (minimo 3 carte). L’asso vale A-2-3 oppure Dama-Re-Asso, mai Re-Asso-2. Solo i jolly sono matte e restano fissi dove vengono messi.','Attacchi: dopo l’apertura puoi legare una o più carte a un gioco esistente, tuo o avversario, se l’unione resta un gioco valido. Chiudi quando resti senza carte: con scarto, oppure in mano se cali o leghi l’ultima carta senza scartare.','Tallone esaurito: gli scarti (tranne la prima carta) vengono rimescolati e diventano il nuovo tallone. Se non ci sono carte da rimescolare la mano si chiude per stallo e tutti contano le penalità.','Penalità a fine mano: asso 11 (1 se è l’unica carta rimasta), figure 10, jolly 25, numeri il nominale. Chi chiude non segna nulla.','Gli umani condividono il dispositivo passando attraverso una schermata che copre la mano. Il computer conosce solo la propria mano, gli scarti e i giochi sul tavolo.'])list.append(node('li','',text));open('Le regole del tavolo',[list])}
 $('help-start').onclick=rules;
 $('menu').onclick=()=>open('Il tuo tavolo',[btn('Riprendi',close,'primary'),btn('Regole',rules),btn('Cronologia',history),btn('Configurazione',()=>{close();setup()}),node('p','','Salvataggio automatico in questo browser.')]);
 $('fullscreen').hidden=!document.fullscreenEnabled;$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{$('prompt').textContent='Schermo intero non disponibile: prova F11.'}};
 document.addEventListener('fullscreenchange',fit);window.addEventListener('resize',fit);document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();if(match)save()}else if(!$('dialog').open)advance()});
 window.ScalaApp={get match(){return match},render,advance,stop,scores,get view(){return view}};
})();
