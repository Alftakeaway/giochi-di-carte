(function(root){
 'use strict';const E=typeof module!=='undefined'?require('./engine.js'):root.TressetteEngine;
 function choose(view,level='normal',rng=Math.random){
  if(!view.legal.length)return null;if(level==='easy'&&rng()<.65)return view.legal[Math.floor(rng()*view.legal.length)].id;
  const known=new Set([...view.hand,...view.piles.flat(),...view.trick.map(p=>p.card),...view.tops.flat().filter(Boolean)].map(c=>c.id));const unseen=E.deck().filter(c=>!known.has(c.id));
  const scored=view.legal.map(c=>{const plays=[...view.trick,{player:view.player,card:c}],win=E.winner(plays),partner=view.variant==='classic'&&win%2===view.player%2,ours=win===view.player||partner,points=plays.reduce((a,p)=>a+E.value(p.card),0),last=plays.length===view.counts.length;let score=0;
   if(view.variant==='lose'){score=ours?-(points*4+6):E.value(c)*5+E.rank(c);if(!last&&ours){const higher=unseen.filter(x=>x.suit===plays[0].card.suit&&E.rank(x)>E.rank(plays.find(p=>p.player===win).card)).length;score+=higher*2}if(!view.trick.length)score-=E.rank(c)*1.5}
   else{score=ours?points*4+8: -E.value(c)*3;score-=E.rank(c)*.65;if(partner&&win!==view.player)score+=E.value(c)*4;if(!last&&ours){const top=plays.find(p=>p.player===win).card,higher=unseen.filter(x=>x.suit===top.suit&&E.rank(x)>E.rank(top)).length;score-=higher*(level==='hard'?5:2)}if(!view.trick.length){const length=view.available.filter(x=>x.suit===c.suit).length;score+=length*1.2;if(!unseen.some(x=>x.suit===c.suit&&E.rank(x)>E.rank(c)))score+=12}}
   return {id:c.id,score:score+rng()*.3};});scored.sort((a,b)=>b.score-a.score);return scored[0].id;
 }
 const api={choose};if(typeof module!=='undefined')module.exports=api;else root.TressetteAI=api;
})(typeof window==='undefined'?globalThis:window);
