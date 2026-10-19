(function(root){
 'use strict';
 const SUITS=['denari','coppe','spade','bastoni'];
 const VARIANTS={scopa:{players:2,hand:3,table:4,label:'Scopa'},scopone:{players:4,hand:9,table:4,label:'Scopone classico'},scientifico:{players:4,hand:10,table:0,label:'Scopone scientifico'}};
 const prime=v=>({1:16,2:12,3:13,4:14,5:15,6:18,7:21}[v]||10);
 const deck=()=>SUITS.flatMap(suit=>Array.from({length:10},(_,i)=>({id:suit+'-'+String(i+1).padStart(2,'0'),suit,value:i+1})));
 const label=c=>({1:'Asso',8:'Fante',9:'Cavallo',10:'Re'}[c.value]||c.value)+' di '+c.suit;
 function shuffle(cards,rng){for(let i=cards.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]]}return cards}
 function captures(card,table){
  const equals=table.filter(c=>c.value===card.value);
  if(equals.length)return equals.map(c=>[c.id]);
  const out=[];
  function visit(start,total,ids){if(total===card.value){out.push(ids);return}for(let i=start;i<table.length;i++)if(total+table[i].value<=card.value)visit(i+1,total+table[i].value,ids.concat(table[i].id))}
  visit(0,0,[]);return out.length?out:[[]];
 }
 function summary(cards){const best=SUITS.map(s=>Math.max(0,...cards.filter(c=>c.suit===s).map(c=>prime(c.value))));return {cards:cards.length,coins:cards.filter(c=>c.suit==='denari').length,settebello:cards.some(c=>c.suit==='denari'&&c.value===7)?1:0,prime:best.every(Boolean)?best.reduce((a,b)=>a+b,0):0,best:SUITS.map(s=>cards.filter(c=>c.suit===s).sort((a,b)=>prime(b.value)-prime(a.value))[0]||null)}}
 function score(piles,sweeps){
  const raw=piles.map(summary),points=raw.map((r,i)=>({cards:r.cards>raw[1-i].cards?1:0,coins:r.coins>raw[1-i].coins?1:0,settebello:r.settebello,prime:r.prime>raw[1-i].prime?1:0,sweeps:sweeps[i]}));
  return {raw,points,totals:points.map(p=>Object.values(p).reduce((a,b)=>a+b,0))};
 }
 class Match{
  constructor(options={},rng=Math.random){
   this.rng=rng;this.options={variant:VARIANTS[options.variant]?options.variant:'scopa',target:[11,16,21].includes(options.target)?options.target:11,rounds:[1,3,5].includes(options.rounds)?options.rounds:null,difficulty:['easy','normal','hard'].includes(options.difficulty)?options.difficulty:'normal'};
   const n=VARIANTS[this.options.variant].players;
   this.options.humans=Array.isArray(options.humans)&&options.humans.includes(0)?[...new Set(options.humans)].filter(i=>Number.isInteger(i)&&i>=0&&i<n):[0];
   this.options.names=Array.from({length:n},(_,i)=>String(options.names?.[i]||(i===0?'Tu':n===4&&i===2?'Compagno':'Computer '+i)).slice(0,20));
   this.state={version:1,round:0,dealer:n-2,totals:[0,0],history:[],finished:false,winner:null};this.nextRound();
  }
  team(g){return g%2}
  nextRound(){
   const s=this.state,v=VARIANTS[this.options.variant],n=v.players;
   if(s.finished||s.phase==='play')return false;
   s.round++;s.dealer=(s.dealer+1)%n;s.turn=(s.dealer+1)%n;s.phase='play';s.lastCapture=null;s.piles=[[],[]];s.sweeps=[0,0];s.log=[];s.lastMove=null;s.result=null;
   // Three kings among the four opening cards void the deal: shuffle again.
   let attempts=0;
   do{s.deck=shuffle(deck(),this.rng);s.hands=Array.from({length:n},()=>[]);this.deal(v.hand);s.table=s.deck.splice(0,v.table);if(++attempts>100)throw Error('Distribuzione non valida: riprova.')}while(v.table&&s.table.filter(c=>c.value===10).length>=3);
   return true;
  }
  deal(amount){const s=this.state,n=VARIANTS[this.options.variant].players;for(let i=0;i<amount;i++)for(let offset=1;offset<=n;offset++){const g=(s.dealer+offset)%n;if(s.deck.length)s.hands[g].push(s.deck.shift())}}
  moves(g=this.state.turn){const s=this.state;if(s.phase!=='play'||s.finished||g!==s.turn)return [];return s.hands[g].flatMap(c=>captures(c,s.table).map(take=>({card:c.id,take})))}
  play(g,id,take){
   const s=this.state;if(s.phase!=='play'||s.finished)return {ok:false,error:'La smazzata è conclusa.'};if(g!==s.turn)return {ok:false,error:'Attendi il tuo turno.'};
   const card=s.hands[g].find(c=>c.id===id);if(!card)return {ok:false,error:'Questa carta non è nella tua mano.'};
   const choices=captures(card,s.table);
   if(take===undefined){if(choices.length!==1)return {ok:false,error:'Scegli quali carte prendere.'};take=choices[0]}
   if(!Array.isArray(take)||new Set(take).size!==take.length||!choices.some(ids=>ids.length===take.length&&ids.every(id=>take.includes(id))))return {ok:false,error:'Questa presa non è consentita.'};
   const captured=s.table.filter(c=>take.includes(c.id)),team=this.team(g);
   const last=s.deck.length===0&&s.hands.reduce((n,h)=>n+h.length,0)===1;
   s.hands[g]=s.hands[g].filter(c=>c.id!==id);
   let sweep=false;
   if(captured.length){s.table=s.table.filter(c=>!take.includes(c.id));s.piles[team].push(card,...captured);s.lastCapture=g;if(s.table.length===0&&!last){s.sweeps[team]++;sweep=true}}
   else s.table.push(card);
   s.lastMove={player:g,card,captured,sweep,last};s.log.push(s.lastMove);
   s.turn=(g+1)%s.hands.length;
   let dealt=false;
   if(s.hands.every(h=>!h.length)){if(s.deck.length){this.deal(3);dealt=true}else this.finishRound()}
   return {ok:true,sweep,dealt,roundFinished:s.phase==='round-end',move:s.lastMove};
  }
  finishRound(){
   const s=this.state;if(s.phase!=='play')return;
   if(s.table.length){s.piles[this.team(s.lastCapture??s.dealer)].push(...s.table);s.table=[]}
   s.result=score(s.piles,s.sweeps);s.totals=s.totals.map((v,i)=>v+s.result.totals[i]);s.history.push({round:s.round,result:s.result,totals:s.totals.slice()});s.phase='round-end';
   const tied=s.totals[0]===s.totals[1];
   s.finished=this.options.rounds?s.round>=this.options.rounds:Math.max(...s.totals)>=this.options.target&&!tied;
   s.winner=s.finished&&!tied?(s.totals[0]>s.totals[1]?0:1):null;
  }
  observation(g){const s=this.state;return {hand:s.hands[g].map(c=>({...c})),table:s.table.map(c=>({...c})),piles:s.piles.map(p=>p.map(c=>({...c}))),sweeps:s.sweeps.slice(),counts:s.hands.map(h=>h.length),player:g,team:this.team(g),deckCount:s.deck.length,variant:this.options.variant,lastCapture:s.lastCapture}}
  export(){return JSON.stringify({version:1,options:this.options,state:this.state})}
  static restore(text,rng=Math.random){const data=JSON.parse(text);if(data.version!==1||!VARIANTS[data.options?.variant])throw Error('Salvataggio non compatibile');const p=new Match(data.options,rng);p.state=data.state;const s=p.state,n=VARIANTS[p.options.variant].players;const all=[...s.deck,...s.table,...s.hands.flat(),...s.piles.flat()];const canonical=new Map(deck().map(c=>[c.id,c]));if(s.version!==1||s.hands.length!==n||s.piles.length!==2||!['play','round-end'].includes(s.phase)||!Number.isInteger(s.turn)||s.turn<0||s.turn>=n||all.length!==40||new Set(all.map(c=>c.id)).size!==40||all.some(c=>!canonical.has(c.id)||canonical.get(c.id).value!==c.value||canonical.get(c.id).suit!==c.suit))throw Error('Salvataggio danneggiato');return p}
 }
 const API={Match,VARIANTS,SUITS,deck,captures,score,summary,prime,label};if(typeof module!=='undefined')module.exports=API;root.ScopaEngine=API;
})(typeof window!=='undefined'?window:globalThis);
