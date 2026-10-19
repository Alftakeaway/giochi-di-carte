const assert=require('node:assert/strict'),E=require('../engine.js'),AI=require('../ai.js');
const c=(v,s='coppe')=>E.deck().find(c=>c.value===v&&c.suit===s);
assert.deepEqual([4,5,6,7,8,9,10,1,2,3].map(v=>E.rank(c(v))),[0,1,2,3,4,5,6,7,8,9]);
assert.equal(E.deck().reduce((a,c)=>a+E.value(c),0),32);
assert.equal(E.winner([{player:0,card:c(4)},{player:1,card:c(3,'denari')}]),0);
assert.equal(E.winner([{player:0,card:c(1)},{player:1,card:c(2)},{player:2,card:c(3)},{player:3,card:c(10)}]),2);
assert.deepEqual(E.legal([c(7),c(3,'denari')],[{player:0,card:c(4)}]),[c(7)]);
{
 const m=new E.Match({variant:'pizzico'}),s=m.state;s.hands[1]=[c(3,'denari')];s.packets[1]=[[c(4),c(1,'bastoni')],[]];s.trick=[{player:0,card:c(7)}];s.turn=1;
 assert.deepEqual(m.legal(1),[c(4)]);const before=JSON.stringify(s);assert.equal(m.play(1,c(3,'denari').id).ok,false);assert.equal(JSON.stringify(s),before);assert.equal(m.play(1,c(4).id).ok,true);assert.equal(s.packets[1][0][0].id,c(1,'bastoni').id);assert.equal(s.phase,'trick-end');m.collect();assert.equal(s.turn,0);
 s.turn=1;s.phase='play';assert.ok(m.pluck(1,c(1,'bastoni').id).ok);assert.equal(s.hands[1].length,2);assert.equal(s.packets[1][0].length,0);assert.equal(m.pluck(0,c(3).id).ok,false);
}
{
 const m=new E.Match({variant:'lose',rounds:1});m.state.piles=[E.deck(),[],[],[]];m.state.lastWinner=0;m.finish();assert.deepEqual(m.state.result.points,[0,11,11,11]);assert.deepEqual(m.state.winners,[0]);assert.equal(m.state.finished,true);
 const noCoat=new E.Match({variant:'lose',rounds:1,cappotto:false});noCoat.state.piles=[E.deck(),[],[],[]];noCoat.state.lastWinner=0;noCoat.finish();assert.deepEqual(noCoat.state.result.points,[11,0,0,0]);assert.deepEqual(noCoat.state.winners,[1,2,3]);
}
let seed=123;const rng=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
for(const variant of ['classic','lose','pizzico'])for(let run=0;run<50;run++){
 let m=new E.Match({variant,rounds:run%2?1:3},rng),moves=0;
 while(!m.state.finished){const s=m.state;if(s.phase==='round-end'){assert.ok(m.nextRound());continue}if(s.phase==='trick-end'){assert.ok(m.collect());continue}
  const obs=m.observation(s.turn);assert.equal(obs.hands,undefined);assert.equal(obs.packets,undefined);const id=AI.choose(obs,['easy','normal','hard'][run%3],rng);assert.ok(m.legal(s.turn).some(c=>c.id===id));assert.ok(m.play(s.turn,id).ok);moves++;assert.ok(moves<=120);
  const all=[...s.hands.flat(),...s.packets.flat(2),...s.piles.flat(),...s.trick.map(p=>p.card)];assert.equal(all.length,40);assert.equal(new Set(all.map(c=>c.id)).size,40);
  if(moves%9===0){m=E.Match.restore(m.export());m.rng=rng}
 }
 assert.equal(m.state.piles.flat().length,40);assert.equal(m.state.result.thirds.reduce((a,b)=>a+b,0),35);assert.equal(m.state.tricks,variant==='pizzico'?20:10);if(variant!=='lose')assert.equal(m.state.result.points.reduce((a,b)=>a+b,0),11);
}
const bad=JSON.parse(new E.Match().export());bad.state.hands[0][0]=bad.state.hands[0][1];assert.throws(()=>E.Match.restore(JSON.stringify(bad)));
console.log('PASS priority, suit obligation including exposed packets, plucking, points, cappotto, 150 complete matches, conservation, restore and AI legal moves');
