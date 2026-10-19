(function(root){
'use strict';
/* =========================================================================
 * Scala 40 — motore delle regole (gioco locale, stile template scopa/
 * briscola/tressette: IIFE, `Match`, export/restore per il salvataggio).
 *
 * Regole implementate (standard italiano):
 * - 2 giocatori = 1 mazzo francese (54); 4 giocatori a coppie = 2 mazzi.
 * - 13 carte a testa; ogni turno: pesca (tallone o prima carta degli scarti),
 *   eventuali giochi, scarto di 1 carta. Chi resta senza carte chiude.
 * - Apertura: nella stessa azione si calano giochi per ALMENO 40 punti
 *   (asso 11, 1 in A-2-3; figure 10; numeri il nominale; jolly 25).
 * - Giochi: tris/poker dello stesso valore (min 3 carte) o sequenze dello
 *   stesso seme (min 3); l'asso vale A-2-3 oppure Q-K-A, mai K-A-2.
 *   Solo i jolly sono matte (i 2 NO). I jolly restano fissi dove messi.
 * - Dopo l'apertura della squadra si può attaccare a qualsiasi gioco.
 * - Chiusura in mano (senza scarto) ammessa. Tallone esaurito: gli scarti
 *   (meno la prima) vengono rimescolati; se non ci sono carte si chiude
 *   per stallo. Penalità: asso 11 (1 se unica carta rimasta), figure 10,
 *   jolly 25, numeri il nominale. Vince il totale più basso dopo N smazzate.
 * ========================================================================= */
const SUITS=['cuori','quadri','fiori','picche'];
const IMG_SUIT={cuori:'Hearts',quadri:'Diamonds',fiori:'Clubs',picche:'Spades'};
const IMG_RANK={1:'Ace',11:'Jack',12:'Queen',13:'King'};
const VARIANTS={due:{players:2,decks:1,label:'Scala 40 a due'},quattro:{players:4,decks:2,label:'Scala 40 a coppie'}};
const APERTURA_MIN=40, CARTE_MANO=13, JOLLY_APERTURA=25, JOLLY_MANO=25;
const ASSETS='../burraco/img/carte/';

function imgFor(suit,value,jolly,colore){
  if(jolly) return ASSETS+'Joker_'+(colore==='red'?'red':'black')+'.webp';
  return ASSETS+(IMG_RANK[value]||value)+'_of_'+IMG_SUIT[suit]+'.webp';
}
function mkCard(suit,value,deck,jolly,colore){
  const id=jolly?('s40-jolly-'+colore+'-m'+deck):('s40-'+suit+'-'+value+'-m'+deck);
  return {id,suit,value:!!jolly?0:value,jolly:!!jolly,colore:jolly?colore:null,img:imgFor(suit,value,!!jolly,colore)};
}
function deck(decks){
  const out=[];
  for(let d=1;d<=decks;d++){
    for(const suit of SUITS) for(let v=1;v<=13;v++) out.push(mkCard(suit,v,d,false,null));
    out.push(mkCard(null,0,d,true,'red')); out.push(mkCard(null,0,d,true,'black'));
  }
  return out;
}
function shuffled(cards,rng){const a=cards.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=a[i];a[i]=a[j];a[j]=t}return a}
function penalty(c,sole){if(c.jolly) return JOLLY_MANO;if(c.value===1) return sole?1:11;if(c.value>10) return 10;return c.value}
function openVal(c,aceLow){if(c.jolly) return JOLLY_APERTURA;if(c.value===1) return aceLow?1:11;if(c.value>10) return 10;return c.value}
function label(c){
  if(c.jolly) return 'Jolly';
  const n={1:'Asso',11:'Fante',12:'Donna',13:'Re'}[c.value]||c.value;
  return n+' di '+c.suit;
}

/* Valida un gioco (gruppo o scala). Ritorna {ok, tipo, aceLow, error}. */
function validaMeld(cards){
  if(!cards||cards.length<3) return {ok:false,error:'Servono almeno 3 carte.'};
  const ids=cards.map(c=>c.id);
  if(new Set(ids).size!==ids.length) return {ok:false,error:'Carta duplicata.'};
  const nat=cards.filter(c=>!c.jolly), nj=cards.length-nat.length;
  if(nat.length<2) return {ok:false,error:'Servono almeno 2 carte naturali.'};
  // gruppo: stesso valore
  if(nat.every(c=>c.value===nat[0].value)) return {ok:true,tipo:'gruppo',aceLow:nat[0].value===1?false:undefined,punti:nat.reduce((a,c)=>a+openVal(c,false),0)+nj*JOLLY_APERTURA};
  // scala: stesso seme, valori distinti e consecutivi (jolly compresi)
  if(!nat.every(c=>c.suit===nat[0].suit)) return {ok:false,error:'Né gruppo né scala valida.'};
  const vals=nat.map(c=>c.value);
  if(new Set(vals).size!==vals.length) return {ok:false,error:'Valore ripetuto nella scala.'};
  const prova=(mapAce)=>{
    const mapped=vals.map(v=>v===1?mapAce:v);
    if(new Set(mapped).size!==mapped.length) return null;
    const mn=Math.min.apply(null,mapped), mx=Math.max.apply(null,mapped);
    const gaps=(mx-mn+1)-mapped.length;
    if(gaps<0||gaps>nj) return null;
    return {gaps,mn,mx};
  };
  const low=prova(1), high=prova(14);
  if(!low&&!high) return {ok:false,error:'Scala non consecutiva.'};
  const useLow=low&&(!high||low.gaps<=high.gaps);
  const aceLow=!!useLow;
  const punti=nat.reduce((a,c)=>a+openVal(c,aceLow),0)+nj*JOLLY_APERTURA;
  return {ok:true,tipo:'scala',aceLow,punti};
}

/* Ordina le carte di una scala per la visualizzazione (jolly nei buchi/estremità). */
function ordinaScala(cards,aceLow){
  const nat=cards.filter(c=>!c.jolly).slice().sort((a,b)=>((a.value===1?(aceLow?1:14):a.value))-((b.value===1?(aceLow?1:14):b.value)));
  const jok=cards.filter(c=>c.jolly);
  if(!jok.length) return nat;
  const val=c=>c.value===1?(aceLow?1:14):c.value;
  const out=[];let j=0;
  // jolly prima dell'inizio se la scala non parte dall'asso basso naturale
  for(let i=0;i<nat.length;i++){
    if(i>0){
      let want=val(nat[i-1])+1;
      while(want<val(nat[i])&&j<jok.length){out.push(Object.assign({},jok[j],{_pos:want}));j++;want++}
    }
    out.push(nat[i]);
  }
  while(j<jok.length){out.push(jok[j]);j++}
  return out;
}

/* Partiziona TUTTE le carte in giochi validi (exact cover su bitmask, n<=14). */
function partiziona(cards){
  const n=cards.length;
  if(n<3||n>14) return null;
  const valid=[];
  const total=1<<n;
  for(let mask=1;mask<total;mask++){
    let cnt=0;for(let m=mask;m;m>>=1) cnt+=m&1;
    if(cnt<3) continue;
    const sub=[];for(let i=0;i<n;i++) if(mask&(1<<i)) sub.push(cards[i]);
    const v=validaMeld(sub);
    if(v.ok) valid.push({mask,meld:{tipo:v.tipo,aceLow:v.aceLow,carte:sub,punti:v.punti}});
  }
  const dp=new Array(total).fill(null);dp[0]=[];
  for(let mask=1;mask<total;mask++){
    for(const v of valid){
      if((v.mask&mask)!==v.mask) continue;
      const prev=dp[mask&~v.mask];
      if(prev){dp[mask]=prev.concat([v.meld]);break}
    }
  }
  return dp[total-1];
}

class Match{
  constructor(options,rng){
    options=options||{};this.rng=rng||Math.random;
    const variant=VARIANTS[options.variant]?options.variant:'due';
    const n=VARIANTS[variant].players;
    const rounds=[1,2,3,4,5].indexOf(options.rounds)>=0?options.rounds:3;
    this.options={variant,difficulty:['easy','normal','hard'].indexOf(options.difficulty)>=0?options.difficulty:'normal',
      rounds,humans:[...new Set([0].concat(options.humans||[]))].filter(i=>Number.isInteger(i)&&i>=0&&i<n),
      names:Array.from({length:n},(_,i)=>String((options.names&&options.names[i])||'Giocatore '+(i+1)).slice(0,24))};
    const teams=variant==='quattro'?2:n;
    this.state={round:0,dealer:n-2,turn:0,fase:'pesca',hands:[],tallone:[],scarti:[],melds:[],
      apertoTeam:Array(teams).fill(false),totals:Array(teams).fill(0),history:[],
      fineMano:false,finished:false,winners:[],chiusura:null,stallo:false};
    this.nextRound();
  }
  team(g){return this.options.variant==='quattro'?g%2:g}
  nTeams(){return this.options.variant==='quattro'?2:VARIANTS[this.options.variant].players}
  nextRound(){
    const s=this.state;
    if(s.finished||!s.fineMano&&s.round>0&&s.phase!=='mano-finita') {/* primo giro */}
    if(s.finished) return false;
    if(s.round>0&&!s.fineMano) return false;
    const n=VARIANTS[this.options.variant].players;
    const cards=shuffled(deck(VARIANTS[this.options.variant].decks),this.rng);
    s.round++;s.dealer=(s.dealer+1)%n;s.turn=(s.dealer+1)%n;s.fase='pesca';
    s.hands=Array.from({length:n},()=>cards.splice(0,CARTE_MANO));
    s.tallone=cards;s.scarti=[cards.pop()];s.melds=[];
    s.apertoTeam=s.apertoTeam.map(()=>false);
    s.fineMano=false;s.chiusura=null;s.stallo=false;s.phase='play';
    return true;
  }
  _prendi(g,from){
    const s=this.state;
    if(s.phase!=='play'||s.fineMano||s.turn!==g||s.fase!=='pesca') return {ok:false,error:'Non puoi pescare ora.'};
    if(from==='scarti'){
      if(!s.scarti.length) return {ok:false,error:'Scarti vuoti.'};
      s.hands[g].push(s.scarti.pop());
    }else{
      if(!s.tallone.length) this._rimescola();
      if(!s.tallone.length){this._chiudiStallo();return {ok:true,stallo:true}}
      s.hands[g].push(s.tallone.pop());
    }
    s.fase='gioco';
    return {ok:true};
  }
  pescaTallone(g){return this._prendi(g,'tallone')}
  prendiScarti(g){return this._prendi(g,'scarti')}
  _rimescola(){
    const s=this.state;
    if(s.scarti.length<=1) return;
    const top=s.scarti.pop();
    s.tallone=shuffled(s.scarti.splice(0),this.rng);
    s.scarti=[top];
  }
  _inMano(g,ids){
    const hand=this.state.hands[g];
    const out=[];
    for(const id of ids){const c=hand.find(c=>c.id===id);if(!c) return null;out.push(c)}
    return out;
  }
  _togliMano(g,ids){const hand=this.state.hands[g];for(const id of ids){const i=hand.findIndex(c=>c.id===id);if(i>=0) hand.splice(i,1)}}
  _checkChiusura(g,inMano){
    const s=this.state;
    if(s.hands[g].length!==0||s.fineMano) return false;
    s.fineMano=true;s.phase='mano-finita';
    const t=this.team(g);
    s.chiusura={team:t,inMano:!!inMano};
    const squadre=this.nTeams();
    for(let q=0;q<squadre;q++){
      if(q===t) continue;
      let pen=0;
      for(let p=0;p<s.hands.length;p++){
        if(this.team(p)!==q) continue;
        const h=s.hands[p];
        for(const c of h) pen+=penalty(c,h.length===1&&c.value===1);
      }
      s.totals[q]+=pen;
    }
    s.history.push({round:s.round,totals:s.totals.slice(),chiusura:s.chiusura});
    if(s.round>=this.options.rounds){
      s.finished=true;
      const best=Math.min.apply(null,s.totals);
      s.winners=s.totals.map((v,i)=>v===best?i:-1).filter(i=>i>=0);
    }
    return true;
  }
  /* Cala giochi nuovi: se la squadra non ha aperto, `ids` deve partizionarsi
   * in giochi da ALMENO 40 punti; altrimenti deve essere un singolo gioco. */
  cala(g,ids){
    const s=this.state;
    if(s.phase!=='play'||s.fineMano||s.turn!==g||s.fase!=='gioco') return {ok:false,error:'Non puoi calare ora.'};
    const cards=this._inMano(g,ids);
    if(!cards||!cards.length) return {ok:false,error:'Carte non in mano.'};
    const t=this.team(g);
    if(!s.apertoTeam[t]){
      const melds=partiziona(cards);
      if(!melds) return {ok:false,error:'Le carte non formano giochi validi.'};
      const tot=melds.reduce((a,m)=>a+m.punti,0);
      if(tot<APERTURA_MIN) return {ok:false,error:'Apertura: servono almeno 40 punti (qui '+tot+').'};
      for(const m of melds) s.melds.push({team:t,tipo:m.tipo,aceLow:m.aceLow,carte:m.tipo==='scala'?ordinaScala(m.carte,m.aceLow):m.carte,punti:m.punti});
      s.apertoTeam[t]=true;
      this._togliMano(g,ids);
      const chiusa=this._checkChiusura(g,true);
      return {ok:true,apertura:true,punti:tot,chiusa};
    }
    const v=validaMeld(cards);
    if(!v.ok) return {ok:false,error:v.error};
    s.melds.push({team:t,tipo:v.tipo,aceLow:v.aceLow,carte:v.tipo==='scala'?ordinaScala(cards,v.aceLow):cards.slice(),punti:v.punti});
    this._togliMano(g,ids);
    const chiusa=this._checkChiusura(g,true);
    return {ok:true,apertura:false,chiusa};
  }
  /* Attacca carte a un gioco esistente (qualsiasi squadra, se la tua ha aperto). */
  lega(g,idx,ids){
    const s=this.state;
    if(s.phase!=='play'||s.fineMano||s.turn!==g||s.fase!=='gioco') return {ok:false,error:'Non puoi legare ora.'};
    if(!s.apertoTeam[this.team(g)]) return {ok:false,error:'Prima devi aprire (40 punti).'};
    const m=s.melds[idx];
    if(!m) return {ok:false,error:'Gioco non trovato.'};
    const cards=this._inMano(g,ids);
    if(!cards||!cards.length) return {ok:false,error:'Carte non in mano.'};
    const v=validaMeld(m.carte.concat(cards));
    if(!v.ok) return {ok:false,error:v.error};
    m.carte=v.tipo==='scala'?ordinaScala(m.carte.concat(cards),v.aceLow):m.carte.concat(cards);
    m.tipo=v.tipo;m.aceLow=v.aceLow;m.punti=v.punti;
    this._togliMano(g,ids);
    const chiusa=this._checkChiusura(g,true);
    return {ok:true,chiusa};
  }
  scarta(g,id){
    const s=this.state;
    if(s.phase!=='play'||s.fineMano||s.turn!==g||s.fase!=='gioco') return {ok:false,error:'Non puoi scartare ora.'};
    const i=s.hands[g].findIndex(c=>c.id===id);
    if(i<0) return {ok:false,error:'Carta non in mano.'};
    const c=s.hands[g].splice(i,1)[0];
    s.scarti.push(c);
    if(this._checkChiusura(g,false)) return {ok:true,chiusa:true};
    const n=VARIANTS[this.options.variant].players;
    s.turn=(g+1)%n;s.fase='pesca';
    return {ok:true};
  }
  _chiudiStallo(){
    const s=this.state;
    s.fineMano=true;s.phase='mano-finita';s.stallo=true;s.chiusura=null;
    const squadre=this.nTeams();
    for(let q=0;q<squadre;q++){
      let pen=0;
      for(let p=0;p<s.hands.length;p++){
        if(this.team(p)!==q) continue;
        const h=s.hands[p];
        for(const c of h) pen+=penalty(c,h.length===1&&c.value===1);
      }
      s.totals[q]+=pen;
    }
    s.history.push({round:s.round,totals:s.totals.slice(),chiusura:null,stallo:true});
    if(s.round>=this.options.rounds){
      s.finished=true;
      const best=Math.min.apply(null,s.totals);
      s.winners=s.totals.map((v,i)=>v===best?i:-1).filter(i=>i>=0);
    }
  }
  observation(g){
    const s=this.state;
    return {player:g,turn:s.turn,fase:s.fase,fineMano:s.fineMano,hand:s.hands[g].slice(),
      handCounts:s.hands.map(h=>h.length),talloneCount:s.tallone.length,
      scartiTop:s.scarti.length?s.scarti[s.scarti.length-1]:null,scartiCount:s.scarti.length,
      melds:s.melds.map(m=>({team:m.team,tipo:m.tipo,carte:m.carte.slice(),punti:m.punti})),
      aperto:s.apertoTeam.slice(),totals:s.totals.slice(),round:s.round,rounds:this.options.rounds};
  }
  export(){return JSON.stringify({version:1,options:this.options,state:this.state})}
  static restore(json){
    const data=JSON.parse(json);
    if(data.version!==1||!VARIANTS[data.options&&data.options.variant]) throw Error('Salvataggio non valido');
    const m=new Match(data.options,()=>0.5);
    const s=data.state,n=VARIANTS[m.options.variant].players,decks=VARIANTS[m.options.variant].decks;
    const canonical=new Map(deck(decks).map(c=>[c.id,c]));
    if(!s||s.hands.length!==n) throw Error('Stato non valido');
    if(!['play','mano-finita'].includes(s.phase)) throw Error('Stato non valido');
    if(!['pesca','gioco'].includes(s.fase)) throw Error('Fase non valida');
    const all=[].concat(s.hands.flat(),s.tallone,s.scarti,s.melds.flatMap(x=>x.carte));
    if(all.length!==54*decks) throw Error('Conteggio carte non valido');
    if(new Set(all.map(c=>c.id)).size!==all.length) throw Error('Carte duplicate');
    for(const c of all){const k=canonical.get(c.id);if(!k||k.suit!==c.suit||k.value!==c.value||!!k.jolly!==!!c.jolly) throw Error('Carta non valida')}
    if(!Number.isInteger(s.turn)||s.turn<0||s.turn>=n) throw Error('Turno non valido');
    m.state=s;return m;
  }
}
const api={Match,SUITS,VARIANTS,deck,penalty,openVal,label,validaMeld,partiziona,ordinaScala,APERTURA_MIN,CARTE_MANO};
if(typeof module!=='undefined') module.exports=api;else root.ScalaEngine=api;
})(typeof window==='undefined'?globalThis:window);
