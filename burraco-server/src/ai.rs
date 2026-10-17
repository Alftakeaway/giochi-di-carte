/* =========================================================================
 * ai.rs — Avversario automatico (bot) per il Burraco
 *
 * Port fedele di `burraco/js/burraco-ai.js`. Il bot NON modifica mai lo stato:
 * espone solo funzioni che, dato lo stato attuale, propongono la PROSSIMA
 * azione del giocatore di turno. Il chiamante (server o test) la esegue via
 * `esegui_azione`, che resta l'unica autorità sulle regole.
 *
 * Azioni:
 *   Azione::Pesca { sorgente: Sorgente }
 *   Azione::Cala  { ids: Vec<String> }
 *   Azione::Lega  { indice, id }
 *   Azione::Scarta{ id }
 * ========================================================================= */

use crate::engine::*;
use rand::Rng;

/// Sorgente da cui pescare.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Sorgente {
    Tallone,
    Monte,
}

/// Proposta di azione per il giocatore di turno.
#[derive(Debug, Clone)]
pub enum Azione {
    Pesca { sorgente: Sorgente },
    Cala { ids: Vec<String> },
    Lega { indice: usize, id: String },
    Scarta { id: String },
}

/// Parametri di comportamento per livello di difficoltà.
struct Conf {
    salta_calata: f64,
    rumore_scarto: f64,
    soglia_calata: f64,
    monte_prudente: bool,
}

fn conf(livello: &str) -> Conf {
    match livello {
        "facile" => Conf { salta_calata: 0.30, rumore_scarto: 6.0, soglia_calata: 12.0, monte_prudente: true },
        "difficile" => Conf { salta_calata: 0.0, rumore_scarto: 0.0, soglia_calata: 5.0, monte_prudente: false },
        _ => Conf { salta_calata: 0.08, rumore_scarto: 2.0, soglia_calata: 8.0, monte_prudente: false },
    }
}

/// Rumore casuale per rendere il bot meno prevedibile (livelli facile/normale).
fn rumore(max: f64) -> f64 {
    if max <= 0.0 { 0.0 } else { rand::thread_rng().gen::<f64>() * max }
}

/* -------------------------------------------------------------------------
 * Stima del valore potenziale di una carta nella mano del giocatore
 * ----------------------------------------------------------------------- */
fn utilita_potenziale(carta: &Carta, mano: &[Carta]) -> f64 {
    if is_matta(carta) { return 12.0; }
    let mut u = 0.0;
    let mut compagni = 0;
    let mut vicini = 0;
    for c in mano {
        if c.id == carta.id || is_matta(c) { continue; }
        if c.valore == carta.valore { compagni += 1; }
        if c.seme == carta.seme && (c.valore as i32 - carta.valore as i32).abs() <= 2 { vicini += 1; }
    }
    u += (compagni.min(2) as f64) * 3.0;
    u += (vicini.min(2) as f64) * 1.5;
    if carta.valore == 1 { u += 0.5; }
    u
}

/* -------------------------------------------------------------------------
 * Scelta della sorgente da cui pescare
 * ----------------------------------------------------------------------- */
fn scegli_sorgente(p: &Partita, g: usize, livello: &str) -> Sorgente {
    let s = &p.stato;
    if s.monte.is_empty() { return Sorgente::Tallone; }
    if s.tallone.is_empty() { return Sorgente::Monte; }

    let c = conf(livello);
    let cima = &s.monte[s.monte.len() - 1];
    let mano = &s.mani[g];
    let melds = &s.melds[g];

    /* Monte di una sola carta: è solo uno scambio. */
    if s.monte.len() == 1 {
        for m in melds {
            if prova_legatura(m, cima).is_some() { return Sorgente::Monte; }
        }
        if mano.len() <= 3 { return Sorgente::Tallone; }
        if is_matta(cima) { return Sorgente::Monte; }
        let mut compagni = 0;
        for x in mano {
            if !is_matta(x) && x.valore == cima.valore { compagni += 1; }
        }
        if compagni >= 2 { return Sorgente::Monte; }
        return Sorgente::Tallone;
    }

    /* La carta in cima si lega subito a una combinazione calata. */
    for m in melds {
        if prova_legatura(m, cima).is_some() { return Sorgente::Monte; }
    }

    if utilita_potenziale(cima, mano) >= 4.0 { return Sorgente::Monte; }

    if s.monte.len() >= 3 && mano.len() <= 7 { return Sorgente::Monte; }
    if s.monte.len() >= 6 { return Sorgente::Monte; }

    /* Il tallone sta finendo: il monte è l'unico modo per continuare. */
    if s.tallone.len() <= 6 && s.monte.len() >= 2 { return Sorgente::Monte; }

    if c.monte_prudente && s.monte.len() > 2 { return Sorgente::Tallone; }

    Sorgente::Tallone
}

/* -------------------------------------------------------------------------
 * Verifica che una mossa lasci il giocatore in uno stato giocabile
 * (specchia i vincoli del motore)
 * ----------------------------------------------------------------------- */
fn ammissibile(p: &Partita, g: usize, ids_da_rimuovere: &[String], burrachi_proiettati: Option<usize>) -> bool {
    let s = &p.stato;
    let squadra = p.squadre[g];
    let rimossi: std::collections::HashSet<&str> = ids_da_rimuovere.iter().map(|x| x.as_str()).collect();
    let restanti: Vec<&Carta> = s.mani[g].iter().filter(|c| !rimossi.contains(c.id.as_str())).collect();
    let burrachi = burrachi_proiettati.unwrap_or_else(|| conta_burrachi(s, g));

    if restanti.is_empty() {
        if s.pozzetto_preso[squadra] { return false; }
        if s.pozzetti[squadra].is_empty() { return false; }
        return true;
    }
    if s.pozzetto_preso[squadra] {
        if restanti.iter().all(|c| is_matta(c)) { return false; }
        if restanti.len() == 1 && burrachi < 1 { return false; }
    }
    true
}

fn carte_da_ids(mano: &[Carta], ids: &[String]) -> Vec<Carta> {
    let map: std::collections::HashMap<&str, &Carta> = mano.iter().map(|c| (c.id.as_str(), c)).collect();
    ids.iter().filter_map(|id| map.get(id.as_str()).cloned().cloned()).collect()
}

/* -------------------------------------------------------------------------
 * Scelta della mossa di gioco (calata o legatura)
 * ----------------------------------------------------------------------- */
fn scegli_mossa(p: &Partita, g: usize, livello: &str) -> Option<Azione> {
    let s = &p.stato;
    let c = conf(livello);
    let mano = &s.mani[g];
    let melds = &s.melds[g];
    let burrachi_attuali = conta_burrachi(s, g);
    let mut opzioni: Vec<(f64, Azione)> = Vec::new();

    /* --- calate --- */
    let candidate = suggerisci_combinazioni(mano, 40);
    for cand in &candidate {
        let carte = carte_da_ids(mano, &cand.ids);
        let esito = valida_combinazione(&carte)?;
        let proiettati = burrachi_attuali + if esito.burraco { 1 } else { 0 };
        if !ammissibile(p, g, &cand.ids, Some(proiettati)) { continue; }
        let mut punteggio = esito.punti as f64;
        if esito.burraco { punteggio += if esito.pulito { 140.0 } else { 110.0 }; }
        punteggio -= (esito.matte as f64) * 16.0;
        punteggio += (cand.ids.len() as f64 - 3.0) * 2.5;
        if cand.ids.len() == 3 && esito.matte == 0 && esito.punti <= 15 { punteggio -= 3.0; }
        opzioni.push((punteggio, Azione::Cala { ids: cand.ids.clone() }));
    }

    /* --- legature --- */
    for (i, m) in melds.iter().enumerate() {
        for carta in mano {
            let (slots, sostituzione) = match prova_legatura(m, carta) { Some(x) => x, None => continue };
            let diventera_burraco = slots.len() >= 7 && !m.burraco;
            let proiettati = burrachi_attuali + if diventera_burraco { 1 } else { 0 };
            if !ammissibile(p, g, &[carta.id.clone()], Some(proiettati)) { continue; }
            let mut punteggio = carta.punti() as f64 + 7.0;
            if diventera_burraco { punteggio += 160.0; }
            if sostituzione { punteggio += 10.0; }
            punteggio += m.slots.len() as f64 * 0.6;
            opzioni.push((punteggio, Azione::Lega { indice: i, id: carta.id.clone() }));
        }
    }

    if opzioni.is_empty() { return None; }
    opzioni.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());

    let migliore = &opzioni[0];
    if migliore.0 < c.soglia_calata { return None; }
    if c.salta_calata > 0.0 && rand::thread_rng().gen::<f64>() < c.salta_calata { return None; }

    Some(migliore.1.clone())
}

/* -------------------------------------------------------------------------
 * Scelta della carta da scartare
 * ----------------------------------------------------------------------- */
fn scegli_scarto(p: &Partita, g: usize, livello: &str) -> Option<String> {
    let s = &p.stato;
    let c = conf(livello);
    let mano = &s.mani[g];
    let melds = &s.melds[g];
    let avversari = avversari_di(&p.squadre, g);

    if mano.len() == 1 && p.chiude_con(g, &mano[0].id) { return Some(mano[0].id.clone()); }

    let scartabili: Vec<&Carta> = mano.iter().filter(|x| !p.scarto_vietato(g, &x.id)).collect();
    if scartabili.is_empty() { return None; }

    let mut migliore: Option<&Carta> = None;
    let mut punteggio_minimo = f64::INFINITY;
    for carta in &scartabili {
        let mut u = 0.0;
        if is_matta(carta) { u += 70.0; }

        let mut compagni = 0;
        let mut vicini = 0;
        for x in mano {
            if x.id == carta.id || is_matta(x) { continue; }
            if x.valore == carta.valore { compagni += 1; }
            if x.seme == carta.seme && (x.valore as i32 - carta.valore as i32).abs() <= 2 { vicini += 1; }
        }
        u += (compagni.min(2) as f64) * 7.0;
        u += (vicini.min(2) as f64) * 3.5;

        for m in melds {
            if prova_legatura(m, carta).is_some() { u += 14.0; break; }
        }
        for avv in &avversari {
            for m in &s.melds[*avv] {
                if prova_legatura(m, carta).is_some() { u += 18.0; break; }
            }
        }

        u += carta.punti() as f64 * 0.4;
        u += rumore(c.rumore_scarto);

        if u < punteggio_minimo {
            punteggio_minimo = u;
            migliore = Some(carta);
        }
    }
    migliore.map(|c| c.id.clone())
}

/* -------------------------------------------------------------------------
 * API pubblica
 * ----------------------------------------------------------------------- */

/// Propone la prossima azione per il giocatore di turno.
/// `solo_scarto` forza la proposta diretta dello scarto (usato in ripiego).
pub fn prossima_azione(p: &Partita, livello: &str, solo_scarto: bool) -> Option<Azione> {
    let s = &p.stato;
    if s.finita { return None; }
    let g = s.turno;

    if s.fase == Fase::Pesca {
        return Some(Azione::Pesca { sorgente: scegli_sorgente(p, g, livello) });
    }
    if !solo_scarto {
        if let Some(mossa) = scegli_mossa(p, g, livello) { return Some(mossa); }
    }
    scegli_scarto(p, g, livello).map(|id| Azione::Scarta { id })
}

/// Esegue l'azione proposta direttamente sul motore.
pub fn esegui_azione(p: &mut Partita, azione: &Azione) -> Result<(), String> {
    match azione {
        Azione::Pesca { sorgente } => {
            if *sorgente == Sorgente::Monte { p.prendi_monte() } else { p.pesca_tallone() }
        }
        Azione::Cala { ids } => p.cala(ids),
        Azione::Lega { indice, id } => p.lega(*indice, id),
        Azione::Scarta { id } => p.scarta(id),
    }
}

/// Gioca un intero turno del bot e restituisce le azioni eseguite (per log/animazione).
pub fn gioca_turno(p: &mut Partita, livello: &str) -> Vec<Azione> {
    let mut azioni = Vec::new();
    let g_iniziale = p.stato.turno;
    let mut guardia = 0;
    while guardia < 60 {
        guardia += 1;
        if p.stato.finita { break; }
        if p.stato.turno != g_iniziale { break; }
        let az = match prossima_azione(p, livello, false) {
            None => break,
            Some(a) => a,
        };
        match esegui_azione(p, &az) {
            Ok(()) => {
                let is_scarto = matches!(az, Azione::Scarta { .. });
                azioni.push(az);
                if is_scarto { break; }
            }
            Err(_) => {
                let az2 = match prossima_azione(p, livello, true) {
                    None => break,
                    Some(a) => a,
                };
                if esegui_azione(p, &az2).is_ok() {
                    azioni.push(az2);
                }
                break;
            }
        }
    }
    azioni
}

/// Elenco dei livelli disponibili.
pub const LIVELLI: &[&str] = &["facile", "normale", "difficile"];
