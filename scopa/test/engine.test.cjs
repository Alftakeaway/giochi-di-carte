'use strict';
const a=require('node:assert/strict'),E=require('../engine.js'),AI=require('../ai.js');
const c=(value,suit='denari')=>({id:suit+'-'+String(value).padStart(2,'0'),value,suit});
const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
// Equal value is mandatory, including multiple equal cards: choose ONE.
a.deepEqual(E.captures(c(7,'coppe'),[c(3),c(4),c(7)]),[['denari-07']]);
a.deepEqual(E.captures(c(7,'spade'),[c(7),c(7,'coppe'),c(3),c(4)]),[['denari-07'],['coppe-07']]);
a.deepEqual(E.captures(c(7),[c(3),c(4)]),[['denari-03','denari-04']]);
a.deepEqual(E.captures(c(1),[c(3)]),[[]]);
const fixture=(variant='scopa')=>new E.Match({variant,rounds:1},seeded(16));
const f=fixture();f.state.turn=0;f.state.hands[0]=[c(7,'coppe'),c(8)];f.state.table=[c(3),c(4),c(7)];const before=f.export();a.equal(f.play(0,'coppe-07',['denari-03','denari-04']).ok,false);a.equal(f.export(),before);a.equal(f.play(1,'coppe-07',['denari-07']).ok,false);a.equal(f.play(0,'coppe-07',['denari-07','denari-07']).ok,false);a.equal(f.play(0,'coppe-07',['denari-07']).ok,true);a.equal(f.state.piles[0].length,2);
// Deal only when BOTH players finish their packet of three.
const deal=fixture(),deckBefore=deal.state.deck.length;for(let i=0;i<5;i++){const m=deal.moves()[0];a.ok(deal.play(deal.state.turn,m.card,m.take).ok);a.equal(deal.state.deck.length,deckBefore)}let m=deal.moves()[0];a.ok(deal.play(deal.state.turn,m.card,m.take).dealt);a.deepEqual(deal.state.hands.map(h=>h.length),[3,3]);
// Last capture only changes on a capture; final table goes to that team.
const last=fixture();last.state.deck=[];last.state.hands=[[c(2,'coppe')],[c(10,'spade')]];last.state.table=[c(2),c(6)];last.state.piles=[[],[]];last.state.sweeps=[0,0];last.play(0,'coppe-02',['denari-02']);a.equal(last.state.lastCapture,0);last.play(1,'spade-10',[]);a.equal(last.state.lastCapture,0);a.equal(last.state.piles[0].length,4);
const end=fixture();end.state.deck=[];end.state.hands=[[c(7,'coppe')],[]];end.state.table=[c(7)];end.state.piles=[[],[]];a.ok(end.play(0,'coppe-07',['denari-07']).ok);a.deepEqual(end.state.sweeps,[0,0]);
// Correct comparison of BOTH primieras without overwriting the first value.
const one=[c(7),c(7,'coppe'),c(7,'spade'),c(7,'bastoni')],two=[c(6),c(6,'coppe'),c(6,'spade'),c(6,'bastoni')];let score=E.score([one,two],[0,0]);a.deepEqual(score.points.map(p=>p.prime),[1,0]);a.deepEqual(score.raw.map(r=>r.prime),[84,72]);score=E.score([two,one],[0,0]);a.deepEqual(score.points.map(p=>p.prime),[0,1]);score=E.score([[c(7),c(3,'coppe')],[c(6),c(4,'coppe')]],[1,2]);a.deepEqual(score.points.map(p=>p.prime),[0,0]);a.deepEqual(score.points.map(p=>p.coins),[0,0]);
const four=fixture('scientifico');a.deepEqual(four.state.hands.map(h=>h.length),[10,10,10,10]);a.equal(four.state.table.length,0);a.equal(four.team(2),four.team(0));const nine=fixture('scopone');a.deepEqual(nine.state.hands.map(h=>h.length),[9,9,9,9]);a.equal(nine.state.table.length,4);
// AI gets a public observation only. Opponents' cards never occur in it.
const obs=four.observation(0);a.equal('hands' in obs,false);a.equal('deck' in obs,false);const pick=AI.choose(obs,'hard',seeded(1));a.ok(four.moves().some(m=>m.card===pick.card&&m.take.join()===pick.take.join()));
let simulations=0;
for(const variant of Object.keys(E.VARIANTS))for(let i=0;i<40;i++){
 const p=new E.Match({variant,rounds:i%3===0?3:1},seeded(i+1));let moves=0;
 while(!p.state.finished){while(p.state.phase==='play'){const move=AI.choose(p.observation(p.state.turn),i<3?'hard':'normal',seeded(i+30));a.ok(move);a.equal(p.play(p.state.turn,move.card,move.take).ok,true);const s=p.state,all=[...s.deck,...s.table,...s.hands.flat(),...s.piles.flat()];a.equal(all.length,40);a.equal(new Set(all.map(c=>c.id)).size,40);if(++moves>125)throw Error('Simulation did not terminate')}
  a.equal(p.state.piles.flat().length,40);a.equal(E.Match.restore(p.export()).export(),p.export());if(!p.state.finished)a.ok(p.nextRound());
 }
 a.equal(p.state.round,p.options.rounds);a.equal(p.nextRound(),false);simulations++;
}
const restored=E.Match.restore(four.export());a.equal(restored.export(),four.export());a.throws(()=>E.Match.restore('{"version":7}'));let invalid=JSON.parse(four.export());invalid.state.hands[0][0].value=42;a.throws(()=>E.Match.restore(JSON.stringify(invalid)));
console.log('PASS: equal-before-sum and choose-one, atomic validation, packet dealing, final capture, final sweep excluded, primiera, teams, restore, AI visibility and '+simulations+' full match simulations');
