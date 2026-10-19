(function(root){
 'use strict';
 const SUITS=['denari','coppe','spade','bastoni'],ORDER=[2,4,5,6,7,8,9,10,3,1];
 const VARIANTS={duel:{players:2,label:'Briscola'},classic:{players:4,label:'Briscola a coppie'}};
 const deck=()=>SUITS.flatMap(suit=>Array.from({length:10},(_,i)=>({id:suit+'-'+String(i+1).padStart(2,'0'),suit,value:i+1})));
 const rank=c=>ORDER.indexOf(c.value),value=c=>({1:11,3:10,8:2,9:3,10:4}[c.value]||0);
 const label=c=>({1:'Asso',8:'Fante',9:'Cavallo',10:'Re'}[c.value]||c.value)+' di '+c.suit;
 function winner(trick,trump){const briscole=trick.filter(p=>p.card.suit===trump),eligible=briscole.length?briscole:trick.filter(p=>p.card.suit===trick[0].card.suit);return eligible.reduce((a,b)=>rank(a.card)>rank(b.card)?a:b).player}
 function shuffled(rng){const a=deck();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
 class Match{
  constructor(options={},rng=Math.random){this.rng=rng;const variant=VARIANTS[options.variant]?options.variant:'duel',n=VARIANTS[variant].players;this.options={variant,difficulty:['easy','normal','hard'].includes(options.difficulty)?options.difficulty:'normal',rounds:[1,2,3,4,5].includes(options.rounds)?options.rounds:1,humans:[...new Set([0,...(options.humans||[])])].filter(i=>Number.isInteger(i)&&i>=0&&i<n),names:Array.from({length:n},(_,i)=>String(options.names?.[i]||'Giocatore '+(i+1)).slice(0,24))};this.state={round:0,dealer:n-2,totals:[0,0],history:[],phase:'round-end',finished:false};this.nextRound()}
  team(g){return this.options.variant==='classic'?g%2:g}
  nextRound(){const s=this.state,n=VARIANTS[this.options.variant].players;if(s.finished||s.phase!=='round-end')return false;const cards=shuffled(this.rng);s.round++;s.dealer=(s.dealer+1)%n;s.turn=(s.dealer+1)%n;s.hands=Array.from({length:n},()=>cards.splice(0,3));s.exposed=cards.shift();s.trump=s.exposed.suit;s.deck=cards;s.piles=[[],[]];s.trick=[];s.lastTrick=null;s.tricks=0;s.result=null;s.phase='play';s.log=[];s.winners=[];return true}
  available(g){return this.state.hands[g].slice()}
  legal(g){return this.state.phase==='play'&&g===this.state.turn?this.available(g):[]}
  play(g,id){const s=this.state;if(s.phase!=='play'||s.turn!==g)return {ok:false,error:'Attendi il tuo turno.'};const i=s.hands[g].findIndex(c=>c.id===id);if(i<0)return {ok:false,error:'Scegli una carta della tua mano.'};const card=s.hands[g].splice(i,1)[0];s.trick.push({player:g,card});s.log.push({player:g,card,trick:s.tricks+1});if(s.trick.length===s.hands.length){s.phase='trick-end';s.turn=winner(s.trick,s.trump);return {ok:true,trickFinished:true}}s.turn=(g+1)%s.hands.length;return {ok:true,trickFinished:false}}
  collect(){const s=this.state;if(s.phase!=='trick-end')return false;const g=winner(s.trick,s.trump);s.lastTrick={plays:s.trick.slice(),winner:g};s.piles[this.team(g)].push(...s.trick.map(p=>p.card));s.trick=[];s.tricks++;s.turn=g;for(let offset=0;offset<s.hands.length;offset++){const who=(g+offset)%s.hands.length;if(s.deck.length)s.hands[who].push(s.deck.shift());else if(s.exposed){s.hands[who].push(s.exposed);s.exposed=null}}
   if(s.hands.every(h=>!h.length)){this.finish();return true}s.phase='play';return true}
  finish(){const s=this.state,points=s.piles.map(p=>p.reduce((a,c)=>a+value(c),0));s.result={points};s.totals=s.totals.map((v,i)=>v+points[i]);s.history.push({round:s.round,points:points.slice(),totals:s.totals.slice()});s.phase='round-end';s.winners=s.totals.flatMap((v,i)=>v===Math.max(...s.totals)?[i]:[]);s.finished=s.round>=this.options.rounds}
  observation(g){const s=this.state;return {player:g,variant:this.options.variant,hand:this.available(g),legal:this.legal(g),trick:s.trick.slice(),piles:s.piles.map(p=>p.slice()),counts:s.hands.map(h=>h.length),trump:s.trump,exposed:s.exposed,deckCount:s.deck.length+(s.exposed?1:0),turn:s.turn}}
  export(){return JSON.stringify({version:1,options:this.options,state:this.state})}
  static restore(json){const data=JSON.parse(json);if(data.version!==1||!VARIANTS[data.options?.variant])throw Error('Salvataggio non valido');const m=new Match(data.options),s=data.state,n=VARIANTS[m.options.variant].players,map=new Map(deck().map(c=>[c.id,c]));if(!s||s.hands?.length!==n||s.piles?.length!==2||!SUITS.includes(s.trump)||!['play','trick-end','round-end'].includes(s.phase)||!Number.isInteger(s.turn)||s.turn<0||s.turn>=n)throw Error('Stato non valido');const cards=[...s.hands.flat(),...s.deck,...(s.exposed?[s.exposed]:[]),...s.piles.flat(),...s.trick.map(p=>p.card)];if(cards.length!==40||new Set(cards.map(c=>c.id)).size!==40||cards.some(c=>!map.has(c.id)||map.get(c.id).suit!==c.suit||map.get(c.id).value!==c.value)||s.totals?.length!==2||s.totals.some(v=>!Number.isInteger(v)||v<0))throw Error('Carte o punti non validi');m.state=s;return m}
 }
 const api={Match,SUITS,VARIANTS,deck,rank,value,label,winner};if(typeof module!=='undefined')module.exports=api;else root.BriscolaEngine=api;
})(typeof window==='undefined'?globalThis:window);
