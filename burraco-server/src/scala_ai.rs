/* =========================================================================
 * scala_ai.rs — Bot Scala 40 (speculare al client `scala40/ai.js`).
 * gioca_turno fa giocare per intero il turno del giocatore di turno.
 * ========================================================================= */

use std::collections::HashSet;

use crate::scala::{partiziona, penalita, valida_meld, ScalaPartita, APERTURA_MIN, SCarta, SFase};

fn utili_scarti(hand: &[SCarta], top: &SCarta) -> bool {
    let altri: Vec<&SCarta> = hand.iter().filter(|c| c.id != top.id).collect();
    for a in 0..altri.len() {
        for b in (a + 1)..altri.len() {
            let trio = vec![altri[a].clone(), altri[b].clone(), top.clone()];
            if valida_meld(&trio).is_ok() {
                return true;
            }
        }
    }
    let mut coppie = 0;
    for c in &altri {
        if c.jolly || top.jolly {
            coppie += 1;
            continue;
        }
        if Some(c.valore) == Some(top.valore)
            || (c.seme == top.seme && (c.valore as i32 - top.valore as i32).abs() <= 2)
        {
            coppie += 1;
        }
    }
    coppie >= 2
}

/* Sottoinsiemi (3..=max) che formano un gioco valido. */
fn meld_validi(hand: &[SCarta], max: usize) -> Vec<Vec<String>> {
    let n = hand.len();
    let mut out = Vec::new();
    let mut comb: Vec<usize> = Vec::new();
    fn rec(
        hand: &[SCarta],
        start: usize,
        left: usize,
        comb: &mut Vec<usize>,
        out: &mut Vec<Vec<String>>,
    ) {
        if left == 0 {
            let sub: Vec<SCarta> = comb.iter().map(|&i| hand[i].clone()).collect();
            if valida_meld(&sub).is_ok() {
                out.push(sub.iter().map(|c| c.id.clone()).collect());
            }
            return;
        }
        for i in start..hand.len() {
            comb.push(i);
            rec(hand, i + 1, left - 1, comb, out);
            comb.pop();
        }
    }
    for k in 3..=max.min(n) {
        rec(hand, 0, k, &mut comb, &mut out);
    }
    out
}

fn cerca_apertura(hand: &[SCarta]) -> Option<Vec<String>> {
    if let Some(melds) = partiziona(hand) {
        if melds.iter().map(|m| m.punti).sum::<i32>() >= APERTURA_MIN {
            return Some(hand.iter().map(|c| c.id.clone()).collect());
        }
    }
    // greedy: giochi disgiunti fino a 40
    let mut ms = meld_validi(hand, 6);
    ms.sort_by_key(|ids| {
        let sub: Vec<SCarta> =
            ids.iter().filter_map(|id| hand.iter().find(|c| &c.id == id).cloned()).collect();
        std::cmp::Reverse(valida_meld(&sub).map(|(_, _, p)| p).unwrap_or(0))
    });
    let mut usate = HashSet::new();
    let mut scelte: Vec<String> = Vec::new();
    let mut tot = 0;
    for m in ms {
        if m.iter().any(|id| usate.contains(id)) {
            continue;
        }
        let sub: Vec<SCarta> =
            m.iter().filter_map(|id| hand.iter().find(|c| &c.id == id).cloned()).collect();
        let punti = valida_meld(&sub).map(|(_, _, p)| p).unwrap_or(0);
        for id in &m {
            usate.insert(id.clone());
        }
        scelte.extend(m);
        tot += punti;
        if tot >= APERTURA_MIN {
            return Some(scelte);
        }
    }
    None
}

fn punteggio_scarto(c: &SCarta, hand: &[SCarta]) -> i32 {
    if c.jolly {
        return -100;
    }
    let mut s = penalita(c, false);
    for o in hand {
        if o.id == c.id || o.jolly {
            continue;
        }
        if o.valore == c.valore {
            s -= 12;
        } else if o.seme == c.seme && (o.valore as i32 - c.valore as i32).abs() <= 2 {
            s -= 5;
        }
    }
    s
}

/// Fa giocare per intero il turno corrente (se tocca a un bot).
pub fn gioca_turno(p: &mut ScalaPartita, livello: &str) {
    let g = p.stato.turno;
    if p.stato.finita {
        return;
    }
    // pesca
    if p.stato.fase == SFase::Pesca {
        let prendi_scarti = livello != "facile"
            && p.stato.scarti.last().map(|top| utili_scarti(&p.stato.mani[g], top)).unwrap_or(false);
        let r = if prendi_scarti { p.prendi_scarti() } else { p.pesca_tallone() };
        if r.is_err() {
            return;
        }
        if p.stato.finita {
            return;
        }
    }
    if p.stato.fase != SFase::Gioco || p.stato.finita {
        return;
    }
    let team = p.team(g);
    // apertura / giochi
    if !p.stato.aperto_team[team] {
        let mano = p.stato.mani[g].clone();
        let ids = if livello == "facile" {
            partiziona(&mano)
                .filter(|ms| ms.iter().map(|m| m.punti).sum::<i32>() >= APERTURA_MIN)
                .map(|_| mano.iter().map(|c| c.id.clone()).collect())
        } else {
            cerca_apertura(&mano)
        };
        if let Some(ids) = ids {
            let _ = p.cala(&ids);
            if p.stato.finita {
                return;
            }
        }
    } else {
        // attacca tutto l'attaccabile (una carta alla volta)
        loop {
            let mano = p.stato.mani[g].clone();
            let mut fatto = None;
            'ext: for c in &mano {
                for idx in 0..p.stato.melds.len() {
                    let mut tutte = p.stato.melds[idx].carte.clone();
                    tutte.push(c.clone());
                    if valida_meld(&tutte).is_ok() {
                        fatto = Some((idx, c.id.clone()));
                        break 'ext;
                    }
                }
            }
            match fatto {
                Some((idx, id)) => {
                    let _ = p.lega(idx, &[id]);
                    if p.stato.finita {
                        return;
                    }
                }
                None => break,
            }
        }
        // un singolo gioco, se possibile
        if !p.stato.finita && livello != "facile" {
            let mano = p.stato.mani[g].clone();
            let mut ms = meld_validi(&mano, 5);
            ms.sort_by_key(|ids| {
                let sub: Vec<SCarta> =
                    ids.iter().filter_map(|id| mano.iter().find(|c| &c.id == id).cloned()).collect();
                std::cmp::Reverse(valida_meld(&sub).map(|(_, _, x)| x).unwrap_or(0))
            });
            if let Some(ids) = ms.into_iter().next() {
                let _ = p.cala(&ids);
                if p.stato.finita {
                    return;
                }
            }
        }
    }
    // scarta la meno utile
    if !p.stato.finita && p.stato.fase == SFase::Gioco && !p.stato.mani[g].is_empty() {
        let mano = p.stato.mani[g].clone();
        let mut best = &mano[0];
        let mut best_s = punteggio_scarto(best, &mano);
        for c in &mano[1..] {
            let s = punteggio_scarto(c, &mano);
            if s > best_s {
                best_s = s;
                best = c;
            }
        }
        let id = best.id.clone();
        let _ = p.scarta(&id);
    }
}
