const a=require('node:assert/strict'),E=require('../js/burraco-engine.js');
const c=(id,v,s='cuori')=>new E.Carta(id,v,s,false),j=id=>new E.Carta(id,0,null,true);
a.equal(E.validaCombinazione([c('2',2),c('3',3),c('4',4),j('j'),c('p',2,'picche')]),null);
a.ok(E.validaCombinazione([c('2',2),c('3',3),c('4',4),c('p',2,'picche')]));
a.ok(E.validaCombinazione([c('2',2),c('3',3),c('4',4),j('j')]));
a.equal(E.validaCombinazione([c('3',3),c('4',4),j('j'),c('p',2,'picche')]),null);
for(let rounds=1;rounds<=5;rounds++){
 const p=new E.Partita({smazzate:rounds,target:505,seed:7});
 for(let i=0;i<rounds;i++){const s=p.stato;s.pozzettoPreso=[true,true];s.chiusaDa=0;s.mani=[[],[]];s.totali=[10000,0];p._calcolaPunteggi();a.equal(s.partitaFinita,i===rounds-1);const old=s.smazzata;a.equal(p.smazzataSuccessiva(),i===rounds-1);a.equal(s.smazzata,old+(i===rounds-1?0:1));}
 a.equal(p.stato.vincitore,0);
}
const draw=new E.Partita({smazzate:1});draw.stato.pozzettoPreso=[true,true];draw.stato.mani=[[],[]];draw._calcolaPunteggi();a.ok(draw.stato.pareggio);a.ok(draw.smazzataSuccessiva());
const cancelled=new E.Partita({smazzate:1});cancelled._calcolaPunteggi();a.equal(cancelled.stato.storico.length,0);a.equal(cancelled.stato.partitaFinita,false);a.equal(cancelled.smazzataSuccessiva(),false);
const p=new E.Partita({giocatori:4});let s=p.stato;s.turno=2;s.fase='gioco';const aces=[c('a',1),c('b',1,'picche'),c('c',1,'quadri')];s.mani[2]=[...aces,c('keep',9)];a.ok(p.cala(aces.map(c=>c.id)).ok);s.turno=0;const more=[c('d',1),c('e',1,'picche'),c('f',1,'fiori')];s.mani[0]=[...more,c('stay',10)];a.equal(p.calaAmmissibile(0,more),false);a.equal(p.cala(more.map(c=>c.id)).ok,false);a.ok(p.legaMolte(0,more.map(c=>c.id),2).ok);a.equal(s.melds[2][0].slots.length,6);
s.turno=1;s.mani[1]=[c('opp1',1),c('opp2',1,'picche'),c('opp3',1,'fiori'),c('other',9)];a.ok(p.cala(['opp1','opp2','opp3']).ok);
console.log('PASS: 1–5 rounds; threshold ignored; tie; cancelled hand repeated; one wildcard; partner tris must extend; opponents may open same rank');
