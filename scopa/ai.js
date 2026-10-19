(function(root){
 'use strict';const E=typeof module!=='undefined'?require('./engine.js'):root.ScopaEngine;
 const worth=c=>c.suit==='denari'&&c.value===7?13:c.value===7?3.6:c.value===6?2.1:c.suit==='denari'?1.8:1;
 function choose(view,level='normal',rng=Math.random){
  const moves=view.hand.flatMap(c=>E.captures(c,view.table).map(take=>({card:c.id,take})));
  if(!moves.length)return null;
  if(level==='easy'&&rng()<.65)return moves[Math.floor(rng()*moves.length)];
  const known=new Set([...view.hand,...view.table,...view.piles.flat()].map(c=>c.id));
  const unseen=E.deck().filter(c=>!known.has(c.id));
  const next=(view.player+1)%view.counts.length,enemy=next%2!==view.team;
  const final=view.deckCount===0&&view.counts.reduce((a,b)=>a+b,0)===1;
  const evaluated=moves.map(move=>{
   const card=view.hand.find(c=>c.id===move.card),taken=view.table.filter(c=>move.take.includes(c.id));
   const table=taken.length?view.table.filter(c=>!move.take.includes(c.id)):view.table.concat(card);
   const ownPrime=E.summary(view.piles[view.team]);
   let value=taken.length?worth(card)+taken.reduce((n,c)=>n+worth(c),0):-.14*worth(card);
   for(const c of [card,...taken])if(taken.length&&E.prime(c.value)>(ownPrime.best[E.SUITS.indexOf(c.suit)]?E.prime(ownPrime.best[E.SUITS.indexOf(c.suit)].value):0))value+=.6;
   if(taken.length&&!table.length&&!final)value+=24;
   if(final&&taken.length)value+=table.reduce((n,c)=>n+worth(c),0);
   if(level!=='easy'&&enemy&&unseen.length){
    let threat=0,sweepProbability=0;
    for(const hypothetical of unseen){
     const opts=E.captures(hypothetical,table);let best=0;
     for(const ids of opts){const gain=table.filter(c=>ids.includes(c.id));let risk=gain.reduce((n,c)=>n+worth(c),0);if(ids.length&&ids.length===table.length){risk+=24;sweepProbability+=1/opts.length}
      if(level==='hard'&&ids.length){const left=table.filter(c=>!ids.includes(c.id));const replies=view.hand.filter(c=>c.id!==card.id).flatMap(c=>E.captures(c,left).map(t=>t.length===left.length&&t.length?8:0));risk-=Math.max(0,...replies)*.4}
      best=Math.max(best,risk);
     }threat+=best;
    }
    value-=threat/unseen.length*(level==='hard'?1.45:.8);
    value-=Math.min(1,sweepProbability/unseen.length*Math.max(1,view.counts[next]))*(level==='hard'?15:6);
   }
   return {...move,value};
  });
  evaluated.sort((a,b)=>b.value-a.value||a.card.localeCompare(b.card)||a.take.join().localeCompare(b.take.join()));
  const best=evaluated[0];return {card:best.card,take:best.take,reason:best.take.length?'Prende '+best.take.length+' '+(best.take.length===1?'carta':'carte')+' e valuta il tavolo lasciato.':'Limita le prese e le scope che può concedere.'};
 }
 const API={choose};if(typeof module!=='undefined')module.exports=API;root.ScopaAI=API;
})(typeof window!=='undefined'?window:globalThis);
