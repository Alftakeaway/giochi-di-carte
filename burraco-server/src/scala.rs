/* =========================================================================
 * scala.rs — Motore Scala 40 per il server (speculare a engine.rs).
 *
 * Stesse regole del client (`scala40/engine.js`): apertura 40 in un'unica
 * azione, solo i jolly come matte, asso alto/basso mai a giro, chiusura
 * anche in mano, penalità asso 11 (1 se unica carta), figure 10, jolly 25.
 * ========================================================================= */

use serde_json::{json, Value};

use crate::engine::{Rng, Seme};

pub const APERTURA_MIN: i32 = 40;
pub const CARTE_MANO: usize = 13;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SCarta {
    pub id: String,
    pub valore: u8, // 0 = jolly
    pub seme: Option<Seme>,
    pub jolly: bool,
    pub colore: Option<String>, // "red" | "black" per i jolly
}

impl SCarta {
    pub fn img(&self) -> String {
        if self.jolly {
            let c = self.colore.as_deref().unwrap_or("black");
            return format!("../burraco/img/carte/Joker_{}.webp", if c == "red" { "red" } else { "black" });
        }
        let r = match self.valore {
            1 => "Ace".to_string(),
            11 => "Jack".to_string(),
            12 => "Queen".to_string(),
            13 => "King".to_string(),
            v => v.to_string(),
        };
        let s = match self.seme {
            Some(Seme::Cuori) => "Hearts",
            Some(Seme::Quadri) => "Diamonds",
            Some(Seme::Fiori) => "Clubs",
            Some(Seme::Picche) => "Spades",
            None => "Hearts",
        };
        format!("../burraco/img/carte/{}_of_{}.webp", r, s)
    }
    pub fn etichetta(&self) -> String {
        if self.jolly {
            return "Jolly".to_string();
        }
        let r = match self.valore {
            1 => "A".to_string(),
            11 => "J".to_string(),
            12 => "Q".to_string(),
            13 => "K".to_string(),
            v => v.to_string(),
        };
        format!("{}{}", r, self.seme.unwrap().simbolo())
    }
    pub fn view(&self) -> Value {
        json!({
            "id": self.id,
            "valore": self.valore,
            "seme": self.seme.map(|s| s.as_str()),
            "jolly": self.jolly,
            "etichetta": self.etichetta(),
            "img": self.img(),
        })
    }
}

fn mk_mazzo(decks: usize) -> Vec<SCarta> {
    let mut out = Vec::new();
    for d in 1..=decks {
        for &seme in &[Seme::Cuori, Seme::Quadri, Seme::Fiori, Seme::Picche] {
            for v in 1..=13u8 {
                out.push(SCarta {
                    id: format!("s40-{}-{}-m{}", seme.as_str(), v, d),
                    valore: v,
                    seme: Some(seme),
                    jolly: false,
                    colore: None,
                });
            }
        }
        for colore in ["red", "black"] {
            out.push(SCarta {
                id: format!("s40-jolly-{}-m{}", colore, d),
                valore: 0,
                seme: None,
                jolly: true,
                colore: Some(colore.to_string()),
            });
        }
    }
    out
}

pub fn penalita(c: &SCarta, unica: bool) -> i32 {
    if c.jolly {
        return 25;
    }
    match c.valore {
        1 => {
            if unica {
                1
            } else {
                11
            }
        }
        11 | 12 | 13 => 10,
        v => v as i32,
    }
}

fn valore_apertura(c: &SCarta, asso_basso: bool) -> i32 {
    if c.jolly {
        return 25;
    }
    match c.valore {
        1 => {
            if asso_basso {
                1
            } else {
                11
            }
        }
        11 | 12 | 13 => 10,
        v => v as i32,
    }
}

/* Valida un gioco. Ok(tipo, asso_basso, punti). */
pub fn valida_meld(carte: &[SCarta]) -> Result<(String, bool, i32), String> {
    if carte.len() < 3 {
        return Err("Servono almeno 3 carte.".into());
    }
    let mut ids: Vec<&str> = carte.iter().map(|c| c.id.as_str()).collect();
    ids.sort_unstable();
    ids.dedup();
    if ids.len() != carte.len() {
        return Err("Carta duplicata.".into());
    }
    let nat: Vec<&SCarta> = carte.iter().filter(|c| !c.jolly).collect();
    let nj = carte.len() - nat.len();
    if nat.len() < 2 {
        return Err("Servono almeno 2 carte naturali.".into());
    }
    if nat.iter().all(|c| c.valore == nat[0].valore) {
        let punti: i32 = nat.iter().map(|c| valore_apertura(c, false)).sum::<i32>() + nj as i32 * 25;
        return Ok(("gruppo".into(), false, punti));
    }
    if !nat.iter().all(|c| c.seme == nat[0].seme) {
        return Err("Né gruppo né scala valida.".into());
    }
    let mut vals: Vec<u8> = nat.iter().map(|c| c.valore).collect();
    vals.sort_unstable();
    vals.dedup();
    if vals.len() != nat.len() {
        return Err("Valore ripetuto nella scala.".into());
    }
    // prova asso=1 e asso=14
    let mut scelta: Option<(bool, i32)> = None;
    for asso_basso in [true, false] {
        let mapped: Vec<i32> = vals
            .iter()
            .map(|&v| {
                if v == 1 {
                    if asso_basso {
                        1
                    } else {
                        14
                    }
                } else {
                    v as i32
                }
            })
            .collect();
        let mut m = mapped.clone();
        m.sort_unstable();
        m.dedup();
        if m.len() != mapped.len() {
            continue;
        }
        let mn = m[0];
        let mx = m[m.len() - 1];
        let gaps = (mx - mn + 1) as usize - m.len();
        if gaps <= nj {
            let punti: i32 =
                nat.iter().map(|c| valore_apertura(c, asso_basso)).sum::<i32>() + nj as i32 * 25;
            match scelta {
                None => scelta = Some((asso_basso, punti)),
                Some((_, p0)) => {
                    // preferisci meno buchi (a parità, l'asso alto)
                    let gaps0 = {
                        let (ab0, _) = scelta.unwrap();
                        let mm: Vec<i32> = vals
                            .iter()
                            .map(|&v| {
                                if v == 1 {
                                    if ab0 {
                                        1
                                    } else {
                                        14
                                    }
                                } else {
                                    v as i32
                                }
                            })
                            .collect();
                        let mut s2 = mm.clone();
                        s2.sort_unstable();
                        (s2[s2.len() - 1] - s2[0] + 1) as usize - s2.len()
                    };
                    if gaps < gaps0 || (gaps == gaps0 && !asso_basso) {
                        scelta = Some((asso_basso, punti));
                    } else {
                        let _ = p0;
                    }
                }
            }
        }
    }
    match scelta {
        Some((ab, punti)) => Ok(("scala".into(), ab, punti)),
        None => Err("Scala non consecutiva.".into()),
    }
}

/* Ordina una scala per la visualizzazione (jolly nei buchi, resto in coda). */
fn ordina_scala(carte: &[SCarta], asso_basso: bool) -> Vec<SCarta> {
    let mut nat: Vec<SCarta> = carte.iter().filter(|c| !c.jolly).cloned().collect();
    let jok: Vec<SCarta> = carte.iter().filter(|c| c.jolly).cloned().collect();
    if jok.is_empty() {
        return nat;
    }
    let val = |c: &SCarta| -> i32 {
        if c.valore == 1 {
            if asso_basso {
                1
            } else {
                14
            }
        } else {
            c.valore as i32
        }
    };
    nat.sort_by_key(|c| val(c));
    let mut out: Vec<SCarta> = Vec::with_capacity(carte.len());
    let mut j = 0;
    for (i, c) in nat.iter().enumerate() {
        if i > 0 {
            let mut want = val(&nat[i - 1]) + 1;
            while want < val(c) && j < jok.len() {
                out.push(jok[j].clone());
                j += 1;
                want += 1;
            }
        }
        out.push(c.clone());
    }
    while j < jok.len() {
        out.push(jok[j].clone());
        j += 1;
    }
    out
}

#[derive(Debug, Clone)]
pub struct SMeld {
    pub team: usize,
    pub tipo: String,
    pub asso_basso: bool,
    pub carte: Vec<SCarta>,
    pub punti: i32,
}

impl SMeld {
    fn view(&self) -> Value {
        json!({
            "team": self.team,
            "tipo": self.tipo,
            "carte": self.carte.iter().map(|c| c.view()).collect::<Vec<_>>(),
            "punti": self.punti,
        })
    }
}

/* Partiziona TUTTE le carte in giochi validi (exact cover, n<=14). */
pub fn partiziona(carte: &[SCarta]) -> Option<Vec<SMeld>> {
    let n = carte.len();
    if !(3..=14).contains(&n) {
        return None;
    }
    let total = 1usize << n;
    let mut validi: Vec<(usize, SMeld)> = Vec::new();
    for mask in 1..total {
        let cnt = mask.count_ones() as usize;
        if cnt < 3 {
            continue;
        }
        let sub: Vec<SCarta> = (0..n).filter(|&i| mask & (1 << i) != 0).map(|i| carte[i].clone()).collect();
        if let Ok((tipo, ab, punti)) = valida_meld(&sub) {
            let mostra =
                if tipo == "scala" { ordina_scala(&sub, ab) } else { sub.clone() };
            validi.push((mask, SMeld { team: 0, tipo, asso_basso: ab, carte: mostra, punti }));
        }
    }
    let mut dp: Vec<Option<Vec<SMeld>>> = vec![None; total];
    dp[0] = Some(Vec::new());
    for mask in 1..total {
        for (vmask, meld) in &validi {
            if vmask & mask != *vmask {
                continue;
            }
            if let Some(prev) = dp[mask & !vmask].clone() {
                let mut v = prev;
                v.push(meld.clone());
                dp[mask] = Some(v);
                break;
            }
        }
    }
    dp[total - 1].clone()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SFase {
    Pesca,
    Gioco,
}
impl SFase {
    fn as_str(&self) -> &'static str {
        match self {
            SFase::Pesca => "pesca",
            SFase::Gioco => "gioco",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Chiusura {
    pub team: usize,
    pub in_mano: bool,
}

#[derive(Debug, Clone)]
pub struct SStato {
    pub turno: usize,
    pub fase: SFase,
    pub mani: Vec<Vec<SCarta>>,
    pub tallone: Vec<SCarta>,
    pub scarti: Vec<SCarta>,
    pub melds: Vec<SMeld>,
    pub aperto_team: Vec<bool>,
    pub totali: Vec<i32>,
    pub round: usize,
    pub finita: bool,
    pub finished: bool,
    pub winners: Vec<usize>,
    pub chiusura: Option<Chiusura>,
    pub stallo: bool,
}

#[derive(Debug, Clone)]
pub struct ScalaOpts {
    pub giocatori: usize, // 2 o 4
    pub rounds: usize,    // 1..=5
    pub seed: Option<u32>,
}

pub struct ScalaPartita {
    pub stato: SStato,
    pub rounds: usize,
    pub giocatori: usize,
    pub seed: Option<u32>,
}

impl ScalaPartita {
    pub fn team(&self, g: usize) -> usize {
        if self.giocatori == 4 {
            g % 2
        } else {
            g
        }
    }
    pub fn n_teams(&self) -> usize {
        if self.giocatori == 4 {
            2
        } else {
            self.giocatori
        }
    }
    pub fn new(opts: ScalaOpts) -> ScalaPartita {
        let giocatori = if opts.giocatori == 4 { 4 } else { 2 };
        let rounds = opts.rounds.clamp(1, 5);
        let mut p = ScalaPartita {
            stato: SStato {
                turno: 0,
                fase: SFase::Pesca,
                mani: Vec::new(),
                tallone: Vec::new(),
                scarti: Vec::new(),
                melds: Vec::new(),
                aperto_team: vec![false; if giocatori == 4 { 2 } else { giocatori }],
                totali: vec![0; if giocatori == 4 { 2 } else { giocatori }],
                round: 0,
                finita: false,
                finished: false,
                winners: Vec::new(),
                chiusura: None,
                stallo: false,
            },
            rounds,
            giocatori,
            seed: opts.seed,
        };
        p.nuova_mano(giocatori - 1);
        p
    }
    fn nuova_mano(&mut self, dealer: usize) {
        let s = &mut self.stato;
        let decks = if self.giocatori == 4 { 2 } else { 1 };
        let mut rng = Rng::new(self.seed);
        let mut mazzo = mk_mazzo(decks);
        rng.shuffle(&mut mazzo);
        s.round += 1;
        s.turno = (dealer + 1) % self.giocatori;
        s.fase = SFase::Pesca;
        s.mani = (0..self.giocatori)
            .map(|_| mazzo.drain(0..CARTE_MANO).collect())
            .collect();
        s.scarti = vec![mazzo.pop().unwrap()];
        s.tallone = mazzo;
        s.melds.clear();
        s.aperto_team = s.aperto_team.iter().map(|_| false).collect();
        s.finita = false;
        s.chiusura = None;
        s.stallo = false;
    }
    pub fn smazzata_successiva(&mut self) -> bool {
        if self.stato.finished || !self.stato.finita {
            return false;
        }
        let dealer = self.stato.turno % self.giocatori;
        self.nuova_mano(dealer);
        true
    }
    fn rimescola(&mut self) {
        let s = &mut self.stato;
        if s.scarti.len() <= 1 {
            return;
        }
        let top = s.scarti.pop().unwrap();
        let mut resto = std::mem::take(&mut s.scarti);
        let mut rng = Rng::new(self.seed);
        rng.shuffle(&mut resto);
        s.tallone = resto;
        s.scarti = vec![top];
    }
    fn prendi(&mut self, g: usize, dagli_scarti: bool) -> Result<(), String> {
        let s = &mut self.stato;
        if s.finita || s.turno != g || s.fase != SFase::Pesca {
            return Err("Non puoi pescare ora.".into());
        }
        if dagli_scarti {
            match s.scarti.pop() {
                Some(c) => s.mani[g].push(c),
                None => return Err("Scarti vuoti.".into()),
            }
        } else {
            if s.tallone.is_empty() {
                self.rimescola();
                let s = &mut self.stato;
                if s.tallone.is_empty() {
                    self.chiudi_stallo();
                    return Ok(());
                }
            }
            let s = &mut self.stato;
            let c = s.tallone.pop().unwrap();
            s.mani[g].push(c);
        }
        self.stato.fase = SFase::Gioco;
        Ok(())
    }
    pub fn pesca_tallone(&mut self) -> Result<(), String> {
        self.prendi(self.stato.turno, false)
    }
    pub fn prendi_scarti(&mut self) -> Result<(), String> {
        self.prendi(self.stato.turno, true)
    }
    fn carte_in_mano(&self, g: usize, ids: &[String]) -> Option<Vec<SCarta>> {
        let mut out = Vec::new();
        for id in ids {
            out.push(self.stato.mani[g].iter().find(|c| &c.id == id)?.clone());
        }
        Some(out)
    }
    fn togli_mano(&mut self, g: usize, ids: &[String]) {
        for id in ids {
            if let Some(i) = self.stato.mani[g].iter().position(|c| &c.id == id) {
                self.stato.mani[g].remove(i);
            }
        }
    }
    fn check_chiusura(&mut self, g: usize, in_mano: bool) -> bool {
        if !self.stato.mani[g].is_empty() || self.stato.finita {
            return false;
        }
        let t = self.team(g);
        self.stato.finita = true;
        self.stato.chiusura = Some(Chiusura { team: t, in_mano });
        let squadre = self.n_teams();
        for q in 0..squadre {
            if q == t {
                continue;
            }
            let mut pen = 0;
            for (p, h) in self.stato.mani.iter().enumerate() {
                if self.team(p) != q {
                    continue;
                }
                for c in h {
                    pen += penalita(c, h.len() == 1 && c.valore == 1);
                }
            }
            self.stato.totali[q] += pen;
        }
        if self.stato.round >= self.rounds {
            self.stato.finished = true;
            let best = *self.stato.totali.iter().min().unwrap();
            self.stato.winners =
                self.stato.totali.iter().enumerate().filter(|(_, &v)| v == best).map(|(i, _)| i).collect();
        }
        true
    }
    /// Cala giochi nuovi. Se la squadra non ha aperto, `ids` deve partizionarsi
    /// in giochi da almeno 40 punti; altrimenti deve essere un singolo gioco.
    pub fn cala(&mut self, ids: &[String]) -> Result<bool, String> {
        let g = self.stato.turno;
        if self.stato.finita || self.stato.fase != SFase::Gioco {
            return Err("Non puoi calare ora.".into());
        }
        let cards = self.carte_in_mano(g, ids).ok_or("Carte non in mano.")?;
        if cards.is_empty() {
            return Err("Carte non in mano.".into());
        }
        let t = self.team(g);
        let mut apertura = false;
        if !self.stato.aperto_team[t] {
            let melds = partiziona(&cards).ok_or("Le carte non formano giochi validi.")?;
            let tot: i32 = melds.iter().map(|m| m.punti).sum();
            if tot < APERTURA_MIN {
                return Err(format!("Apertura: servono almeno 40 punti (qui {}).", tot));
            }
            for mut m in melds {
                m.team = t;
                self.stato.melds.push(m);
            }
            self.stato.aperto_team[t] = true;
            apertura = true;
        } else {
            let (tipo, ab, punti) = valida_meld(&cards)?;
            let mostra =
                if tipo == "scala" { ordina_scala(&cards, ab) } else { cards.clone() };
            self.stato.melds.push(SMeld { team: t, tipo, asso_basso: ab, carte: mostra, punti });
        }
        let idsc: Vec<String> = ids.to_vec();
        self.togli_mano(g, &idsc);
        self.check_chiusura(g, true);
        Ok(apertura)
    }
    /// Attacca carte a un gioco esistente (qualsiasi squadra, se la tua ha aperto).
    pub fn lega(&mut self, indice: usize, ids: &[String]) -> Result<(), String> {
        let g = self.stato.turno;
        if self.stato.finita || self.stato.fase != SFase::Gioco {
            return Err("Non puoi legare ora.".into());
        }
        if !self.stato.aperto_team[self.team(g)] {
            return Err("Prima devi aprire (40 punti).".into());
        }
        if indice >= self.stato.melds.len() {
            return Err("Gioco non trovato.".into());
        }
        let cards = self.carte_in_mano(g, ids).ok_or("Carte non in mano.")?;
        if cards.is_empty() {
            return Err("Carte non in mano.".into());
        }
        let mut tutte = self.stato.melds[indice].carte.clone();
        tutte.extend(cards.clone());
        let (tipo, ab, punti) = valida_meld(&tutte)?;
        let m = &mut self.stato.melds[indice];
        m.carte = if tipo == "scala" { ordina_scala(&tutte, ab) } else { tutte };
        m.tipo = tipo;
        m.asso_basso = ab;
        m.punti = punti;
        let idsc: Vec<String> = ids.to_vec();
        self.togli_mano(g, &idsc);
        self.check_chiusura(g, true);
        Ok(())
    }
    pub fn scarta(&mut self, id: &str) -> Result<bool, String> {
        let g = self.stato.turno;
        if self.stato.finita || self.stato.fase != SFase::Gioco {
            return Err("Non puoi scartare ora.".into());
        }
        let i = self.stato.mani[g].iter().position(|c| c.id == id).ok_or("Carta non in mano.")?;
        let c = self.stato.mani[g].remove(i);
        self.stato.scarti.push(c);
        if self.check_chiusura(g, false) {
            return Ok(true);
        }
        self.stato.turno = (g + 1) % self.giocatori;
        self.stato.fase = SFase::Pesca;
        Ok(false)
    }
    fn chiudi_stallo(&mut self) {
        self.stato.finita = true;
        self.stato.stallo = true;
        self.stato.chiusura = None;
        let squadre = self.n_teams();
        for q in 0..squadre {
            let mut pen = 0;
            for (p, h) in self.stato.mani.iter().enumerate() {
                if self.team(p) != q {
                    continue;
                }
                for c in h {
                    pen += penalita(c, h.len() == 1 && c.valore == 1);
                }
            }
            self.stato.totali[q] += pen;
        }
        if self.stato.round >= self.rounds {
            self.stato.finished = true;
            let best = *self.stato.totali.iter().min().unwrap();
            self.stato.winners =
                self.stato.totali.iter().enumerate().filter(|(_, &v)| v == best).map(|(i, _)| i).collect();
        }
    }
    pub fn public_state(&self, viewer: usize) -> Value {
        let s = &self.stato;
        let seats: Vec<Value> = (0..self.giocatori)
            .map(|p| {
                json!({
                    "seat": p,
                    "team": self.team(p),
                    "hand": if p == viewer { s.mani[p].iter().map(|c| c.view()).collect::<Vec<_>>() } else { Vec::<Value>::new() },
                    "handCount": s.mani[p].len(),
                    "melds": s.melds.iter().enumerate()
                        .filter(|(_, m)| m.team == self.team(p))
                        .map(|(i, m)| { let mut v = m.view(); v["indice"] = json!(i); v })
                        .collect::<Vec<_>>(),
                    "aperto": s.aperto_team[self.team(p)],
                })
            })
            .collect();
        json!({
            "gioco": "scala40",
            "turno": s.turno,
            "fase": s.fase.as_str(),
            "finita": s.finita,
            "finished": s.finished,
            "round": s.round,
            "rounds": self.rounds,
            "talloneCount": s.tallone.len(),
            "monte": s.scarti.iter().map(|c| c.view()).collect::<Vec<_>>(),
            "seats": seats,
            "melds": s.melds.iter().map(|m| m.view()).collect::<Vec<_>>(),
            "totali": s.totali,
            "vincitore": if s.finished { s.winners.first().copied().map(|w| json!(w)).unwrap_or(Value::Null) } else { Value::Null },
            "chiusura": s.chiusura.as_ref().map(|c| json!({"team": c.team, "inMano": c.in_mano})).unwrap_or(Value::Null),
            "stallo": s.stallo,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(suit: Option<Seme>, v: u8, id: &str) -> SCarta {
        SCarta { id: id.into(), valore: v, seme: suit, jolly: false, colore: None }
    }
    fn j(id: &str) -> SCarta {
        SCarta { id: id.into(), valore: 0, seme: None, jolly: true, colore: Some("red".into()) }
    }

    #[test]
    fn meld_base() {
        assert!(valida_meld(&[c(Some(Seme::Cuori), 7, "a"), c(Some(Seme::Quadri), 7, "b"), c(Some(Seme::Picche), 7, "c")]).is_ok());
        assert!(valida_meld(&[c(Some(Seme::Cuori), 7, "a"), c(Some(Seme::Quadri), 7, "b")]).is_err());
        assert!(valida_meld(&[c(Some(Seme::Cuori), 1, "a"), c(Some(Seme::Cuori), 2, "b"), c(Some(Seme::Cuori), 3, "c")]).is_ok());
        assert!(valida_meld(&[c(Some(Seme::Cuori), 12, "a"), c(Some(Seme::Cuori), 13, "b"), c(Some(Seme::Cuori), 1, "c")]).is_ok());
        assert!(valida_meld(&[c(Some(Seme::Cuori), 13, "a"), c(Some(Seme::Cuori), 1, "b"), c(Some(Seme::Cuori), 2, "c")]).is_err());
        assert!(valida_meld(&[c(Some(Seme::Cuori), 3, "a"), j("j"), c(Some(Seme::Cuori), 5, "c")]).is_ok());
        assert!(valida_meld(&[j("j1"), j("j2"), c(Some(Seme::Cuori), 7, "c")]).is_err());
    }

    #[test]
    fn apertura_e_chiusura() {
        let mut p = ScalaPartita::new(ScalaOpts { giocatori: 2, rounds: 1, seed: Some(5) });
        p.stato.turno = 0;
        p.stato.fase = SFase::Gioco;
        // tris di K (30) + scala 3-4-5 cuori (12) = 42
        let mut mano = vec![
            c(Some(Seme::Cuori), 13, "k1"), c(Some(Seme::Quadri), 13, "k2"), c(Some(Seme::Picche), 13, "k3"),
            c(Some(Seme::Cuori), 3, "s3"), c(Some(Seme::Cuori), 4, "s4"), c(Some(Seme::Cuori), 5, "s5"),
            c(Some(Seme::Fiori), 9, "x9"),
        ];
        p.stato.mani[0] = mano.drain(..).collect();
        let ids: Vec<String> =
            ["k1", "k2", "k3", "s3", "s4", "s5"].iter().map(|s| s.to_string()).collect();
        assert_eq!(p.cala(&ids).unwrap(), true);
        assert!(p.stato.aperto_team[0]);
        // apertura insufficiente
        let mut q = ScalaPartita::new(ScalaOpts { giocatori: 2, rounds: 1, seed: Some(5) });
        q.stato.turno = 0;
        q.stato.fase = SFase::Gioco;
        q.stato.mani[0] = vec![
            c(Some(Seme::Cuori), 3, "a3"), c(Some(Seme::Cuori), 4, "a4"), c(Some(Seme::Cuori), 5, "a5"),
            c(Some(Seme::Fiori), 9, "a9"),
        ];
        let ids2: Vec<String> = ["a3", "a4", "a5"].iter().map(|s| s.to_string()).collect();
        assert!(q.cala(&ids2).is_err());
    }

    #[test]
    fn partita_bot_termina() {
        for giocatori in [2usize, 4] {
            let mut p = ScalaPartita::new(ScalaOpts { giocatori, rounds: 1, seed: Some(11) });
            let mut turni = 0;
            while !p.stato.finished && turni < 20000 {
                turni += 1;
                if p.stato.finita {
                    break;
                }
                crate::scala_ai::gioca_turno(&mut p, "normale");
            }
            assert!(p.stato.finished, "la partita a {} deve finire", giocatori);
        }
    }
}
