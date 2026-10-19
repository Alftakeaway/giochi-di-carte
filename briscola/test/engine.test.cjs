const a=require('node:assert/strict'),E=require('../engine.js'),AI=require('../ai.js');
const c=(v,s='coppe')=>E.deck().find(c=>c.value===v&&c.suit===s);
a.equal(E.deck().reduce((s,c)=>s+E.value(c),0),120);
a.deepEqual([2,4,5,6,7,8,9,10,3,1].map(v=>E.rank(c(v))),[0,1,2,3,4,5,6,7,8,9]);
a.equal(E.winner([{player:0,card:c(1)},{player:1,card:c(2,'denari')}],'denari'),1);
a.equal(E.winner([{player:0,card:c(2)},{player:1,card:c(1,'spade')}],'denari'),0);
a.equal(E.winner([{player:0,card:c(4)},{player:1,card:c(7)}],'denari'),1);
for(const variant of ['duel','classic']){const m=new E.Match({variant}),s=m.state,n=s.hands.length;a.ok(s.hands.every(h=>h.length===3));a.equal(s.deck.length,39-n*3);const before=m.export();a.equal(m.play(1,s.hands[1][0].id).ok,false);a.equal(m.export(),before);a.ok(m.play(0,s.hands[0][0].id).ok);a.deepEqual(m.legal(1),s.hands[1]);}
// Final stock draw: winner first, exposed trump last, including four-player order.
for(const variant of ['duel','classic']){const m=new E.Match({variant}),s=m.state,n=s.hands.length;s.hands=Array.from({length:n},()=>[]);s.trump='denari';s.trick=Array.from({length:n},(_,i)=>({player:i,card:c(i===1?1:4+i)}));s.phase='trick-end';s.deck=E.deck().filter(c=>c.suit==='spade').slice(0,n-1);const order=s.deck.map(c=>c.id);s.exposed=c(2,'denari');m.collect();for(let i=0;i<n-1;i++)a.equal(s.hands[(1+i)%n][0].id,order[i]);a.equal(s.hands[0][0].id,'denari-02');a.equal(s.exposed,null);a.equal(s.turn,1)}
let seed=214;const rng=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
for(const variant of ['duel','classic'])for(let run=0;run<60;run++){let m=new E.Match({variant,rounds:1+run%5},rng),moves=0;while(!m.state.finished){const s=m.state;if(s.phase==='round-end'){m.nextRound();continue}if(s.phase==='trick-end'){m.collect();continue}const obs=m.observation(s.turn);a.equal(obs.deck,undefined);a.equal(obs.hands,undefined);a.ok(m.play(s.turn,AI.choose(obs,['easy','normal','hard'][run%3],rng)).ok);moves++;a.ok(moves<=200);const cards=[...s.hands.flat(),...s.deck,...(s.exposed?[s.exposed]:[]),...s.piles.flat(),...s.trick.map(p=>p.card)];a.equal(cards.length,40);a.equal(new Set(cards.map(c=>c.id)).size,40);if(moves%7===0){m=E.Match.restore(m.export());m.rng=rng}}a.equal(m.state.result.points.reduce((a,b)=>a+b),120);a.equal(m.state.totals.reduce((a,b)=>a+b),120*m.options.rounds);a.equal(m.state.tricks,variant==='duel'?20:10)}
const tie=new E.Match();tie.state.piles=[[],[]];tie.state.totals=[60,60];tie.finish();a.deepEqual(tie.state.winners,[0,1]);
console.log('PASS card values, trump and zero-point hierarchy, free suit, draw order, exposed trump last, 120 complete series, restore and 120-point conservation');
