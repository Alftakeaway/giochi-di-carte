//! Motore delle regole del Burraco (port Rust fedele di burraco-engine.js).
//! Nessuna dipendenza esterna oltre a serde. Logica pura, nessun I/O.

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

/* ============================ COSTANTI ============================ */
const SEMI: [Seme; 4] = [Seme::Cuori, Seme::Quadri, Seme::Fiori, Seme::Picche];

const PT_JOLLY: i32 = 30;
const PT_PINELLA: i32 = 20;
const PT_ASSO: i32 = 15;
const PT_ALTA: i32 = 10; // 8,9,10,J,Q,K
const PT_BASSA: i32 = 5; // 3,4,5,6,7

const BONUS_BURRACO_PULITO: i32 = 200;
const BONUS_BURRACO_SEMIPULITO: i32 = 150;
const BONUS_BURRACO_SPORCO: i32 = 100;
const BONUS_CHIUSURA: i32 = 100;
const PENALE_POZZETTO: i32 = 100;

const CARTE_MANO: usize = 11;
const CARTE_POZZETTO: usize = 11;
const CARTE_TALLONE_FINE: usize = 2;

const LIMITE_TURNI_SMAZZATA: u32 = 400;
const TARGET_VALIDI: [i32; 3] = [505, 1005, 2005];

/* ============================ SEME / CARTA ============================ */
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
pub enum Seme {
    Cuori,
    Quadri,
    Fiori,
    Picche,
}

impl Seme {
    pub fn as_str(&self) -> &'static str {
        match self {
            Seme::Cuori => "cuori",
            Seme::Quadri => "quadri",
            Seme::Fiori => "fiori",
            Seme::Picche => "picche",
        }
    }
    pub fn simbolo(&self) -> &'static str {
        match self {
            Seme::Cuori => "\u{2665}",
            Seme::Quadri => "\u{2666}",
            Seme::Fiori => "\u{2663}",
            Seme::Picche => "\u{2660}",
        }
    }
    pub fn from_str(s: &str) -> Option<Seme> {
        match s {
            "cuori" => Some(Seme::Cuori),
            "quadri" => Some(Seme::Quadri),
            "fiori" => Some(Seme::Fiori),
            "picche" => Some(Seme::Picche),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Carta {
    pub id: String,
    pub valore: u8,
    pub seme: Option<Seme>,
    pub jolly: bool,
}

impl Carta {
    pub fn new(id: &str, valore: u8, seme: Option<Seme>, jolly: bool) -> Carta {
        Carta { id: id.to_string(), valore, seme, jolly }
    }
    pub fn is_jolly(&self) -> bool { self.jolly }
    pub fn is_pinella(&self) -> bool { !self.jolly && self.valore == 2 }
    pub fn is_matta(&self) -> bool { self.is_jolly() || self.is_pinella() }
    pub fn punti(&self) -> i32 {
        if self.jolly { return PT_JOLLY; }
        match self.valore {
            2 => PT_PINELLA,
            1 => PT_ASSO,
            v if v >= 8 => PT_ALTA,
            _ => PT_BASSA,
        }
    }
    pub fn etichetta(&self) -> String {
        if self.jolly { return "Jolly".to_string(); }
        let r = match self.valore {
            1 => "A",
            11 => "J",
            12 => "Q",
            13 => "K",
            v => return v.to_string(),
        };
        format!("{}{}", r, self.seme.unwrap().simbolo())
    }
    pub fn rossa(&self) -> bool {
        matches!(self.seme, Some(Seme::Cuori) | Some(Seme::Quadri))
    }
    pub fn view(&self) -> Value {
        json!({
            "id": self.id,
            "valore": self.valore,
            "seme": self.seme.map(|s| s.as_str()),
            "jolly": self.jolly,
            "punti": self.punti(),
            "etichetta": self.etichetta(),
            "rossa": self.rossa()
        })
    }
}

pub fn is_jolly(c: &Carta) -> bool { c.is_jolly() }
pub fn is_pinella(c: &Carta) -> bool { c.is_pinella() }
pub fn is_matta(c: &Carta) -> bool { c.is_matta() }
pub fn punti_carta(c: &Carta) -> i32 { c.punti() }

/* ============================ RNG (xorshift, seed) ============================ */
pub struct Rng {
    s: u32,
}
impl Rng {
    pub fn new(seed: Option<u32>) -> Rng {
        let mut s = match seed {
            Some(v) => v,
            None => rand::random::<u32>(),
        };
        if s == 0 { s = 0x9e37_79b9; }
        Rng { s }
    }
    pub fn next_f64(&mut self) -> f64 {
        let mut x = self.s;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.s = x;
        (x as f64) / 4_294_967_296.0
    }
    pub fn shuffle<T>(&mut self, arr: &mut [T]) {
        for i in (1..arr.len()).rev() {
            let j = (self.next_f64() * (i as f64 + 1.0)) as usize;
            let j = j.min(i);
            arr.swap(i, j);
        }
    }
}

/* ============================ COMBINAZIONI ============================ */
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Slot {
    pub carta: Carta,
    pub valore: u8,
    pub wild: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum MeldTipo {
    Gruppo,
    Sequenza,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Meld {
    pub id: String,
    pub tipo: MeldTipo,
    pub seme: Option<Seme>,
    pub slots: Vec<Slot>,
    pub punti: i32,
    pub burraco: bool,
    pub pulito: bool,
    pub semipulito: bool,
    pub sporco: bool,
    pub matte: usize,
    pub lunghezza: usize,
    pub nuovo: bool,
}

#[derive(Debug, Clone)]
pub struct Esito {
    pub tipo: MeldTipo,
    pub seme: Option<Seme>,
    pub slots: Vec<Slot>,
    pub punti: i32,
    pub matte: usize,
    pub lunghezza: usize,
    pub burraco: bool,
    pub pulito: bool,
    pub semipulito: bool,
    pub sporco: bool,
}

#[derive(Debug, Clone)]
pub struct SpostamentoEsito {
    pub restanti: Vec<Slot>,
    pub prova: (Vec<Slot>, bool),
    pub carta: Carta,
}

#[derive(Debug, Clone)]
pub struct Classifica {
    pub burraco: bool,
    pub matte: usize,
    pub jolly: usize,
    pub pinelle: usize,
    pub pulito: bool,
    pub semipulito: bool,
    pub sporco: bool,
}

pub fn classifica_burraco(slots: &[Slot]) -> Classifica {
    let mut matte = 0usize;
    let mut jolly = 0usize;
    for s in slots {
        if !s.wild { continue; }
        matte += 1;
        if s.carta.is_jolly() { jolly += 1; }
    }
    let burraco = slots.len() >= 7;
    Classifica {
        burraco,
        matte,
        jolly,
        pinelle: matte - jolly,
        pulito: burraco && matte == 0,
        semipulito: burraco && matte > 0 && jolly == 0,
        sporco: burraco && jolly > 0,
    }
}

pub fn bonus_burraco(m: &Meld) -> i32 {
    if !m.burraco { return 0; }
    if m.pulito { BONUS_BURRACO_PULITO }
    else if m.semipulito { BONUS_BURRACO_SEMIPULITO }
    else { BONUS_BURRACO_SPORCO }
}

fn verifica_slots_sequenza(slots: &[Slot], seme: Seme) -> bool {
    if slots.len() < 3 || slots.len() > 13 { return false; }
    let valori: Vec<u8> = slots.iter().map(|s| s.valore).collect();
    if valori[0] < 1 || *valori.last().unwrap() > 14 || (valori[0]==1 && valori.contains(&14)) { return false; }
    for i in 1..valori.len() {
        if valori[i] != valori[i - 1] + 1 { return false; }
    }
    let mut visti = HashSet::new();
    for s in slots {
        if visti.contains(&s.carta.id) { return false; }
        visti.insert(s.carta.id.clone());
        if s.wild {
            if !is_matta(&s.carta) { return false; }
        } else {
            if s.carta.is_jolly() { return false; }
            if s.carta.seme != Some(seme) { return false; }
            if s.carta.valore != (if s.valore==14 {1}else{s.valore}) { return false; }
        }
    }
    let naturali: Vec<&Slot> = slots.iter().filter(|s| !s.wild).collect();
    if naturali.len() < 2 { return false; }
    let matte = slots.len() - naturali.len();
    let max_matte = 1;
    if matte > max_matte { return false; }
    true
}

fn verifica_slots_gruppo(slots: &[Slot]) -> bool {
    if slots.len() < 3 { return false; }
    let v = slots[0].valore;
    if v == 2 { return false; }
    if slots.iter().any(|s| s.valore != v) { return false; }
    let mut visti = HashSet::new();
    let mut cont_semi: HashMap<Seme, usize> = HashMap::new();
    let mut naturali = 0usize;
    let mut matte = 0usize;
    for s in slots {
        if visti.contains(&s.carta.id) { return false; }
        visti.insert(s.carta.id.clone());
        if s.wild {
            if !is_matta(&s.carta) { return false; }
            matte += 1;
        } else {
            if s.carta.is_jolly() { return false; }
            if s.carta.valore != v { return false; }
            naturali += 1;
            if let Some(seme) = s.carta.seme {
                *cont_semi.entry(seme).or_insert(0) += 1;
            }
        }
    }
    if naturali < 2 { return false; }
    if matte > 1 { return false; }
    if cont_semi.values().any(|&c| c > 2) { return false; }
    true
}

pub fn slots_validi(tipo: MeldTipo, seme: Option<Seme>, slots: &[Slot]) -> bool {
    match tipo {
        MeldTipo::Gruppo => verifica_slots_gruppo(slots),
        MeldTipo::Sequenza => verifica_slots_sequenza(slots, seme.unwrap()),
    }
}

fn prova_sequenza(naturals: &[Carta], wilds: &[Carta], seme: Seme, asso_alto: bool) -> Option<Vec<Slot>> {
    if naturals.len() < 2 { return None; }
    let mut valori: Vec<u8> = naturals.iter().map(|c| if c.valore==1 && asso_alto {14}else{c.valore}).collect();
    valori.sort();
    for i in 1..valori.len() {
        if valori[i] == valori[i - 1] { return None; }
    }
    let min = valori[0];
    let max = *valori.last().unwrap();
    let span = max - min + 1;
    let buchi = span - naturals.len() as u8;
    let w = wilds.len();
    let max_matte = 1;
    if w > max_matte as usize { return None; }
    if (w as u8) < buchi { return None; }

    let mut extra = w as i32 - buchi as i32;
    let mut per_valore: HashMap<u8, &Carta> = HashMap::new();
    for c in naturals { per_valore.insert(if c.valore==1 && asso_alto {14}else{c.valore}, c); }
    let mut pool: Vec<&Carta> = wilds.iter().collect();
    let mut slots = Vec::new();
    for v in min..=max {
        if let Some(c) = per_valore.get(&v) {
            slots.push(Slot { carta: (*c).clone(), valore: v, wild: false });
        } else {
            let wc = pool.remove(0);
            slots.push(Slot { carta: (*wc).clone(), valore: v, wild: true });
        }
    }
    let mut alto = max;
    while extra > 0 && alto + 1 <= 13 {
        alto += 1;
        let wc = pool.remove(0);
        slots.push(Slot { carta: (*wc).clone(), valore: alto, wild: true });
        extra -= 1;
    }
    let mut basso = min;
    while extra > 0 && basso as i32 - 1 >= 1 {
        basso -= 1;
        let wc = pool.remove(0);
        slots.insert(0, Slot { carta: (*wc).clone(), valore: basso, wild: true });
        extra -= 1;
    }
    if extra > 0 { return None; }
    if !verifica_slots_sequenza(&slots, seme) { return None; }
    Some(slots)
}

fn costruisci_sequenza(carte: &[Carta]) -> Option<Vec<Slot>> {
    let jollys: Vec<&Carta> = carte.iter().filter(|c| c.is_jolly()).collect();
    let non_jolly: Vec<&Carta> = carte.iter().filter(|c| !c.is_jolly()).collect();
    if non_jolly.len() < 2 { return None; }

    let mut semi_presenti: Vec<Seme> = Vec::new();
    for c in &non_jolly {
        if let Some(seme) = c.seme {
            if !semi_presenti.contains(&seme) { semi_presenti.push(seme); }
        }
    }
    let mut migliore: Option<Vec<Slot>> = None;
    for &seme in &semi_presenti {
        let del_seme: Vec<&Carta> = non_jolly.iter().filter(|c| c.seme == Some(seme)).cloned().collect();
        let altri: Vec<&Carta> = non_jolly.iter().filter(|c| c.seme != Some(seme)).cloned().collect();
        if altri.iter().any(|c| c.valore != 2) { continue; }
        let due_del_seme: Vec<&Carta> = del_seme.iter().filter(|c| c.valore == 2).cloned().collect();
        let altri_del_seme: Vec<&Carta> = del_seme.iter().filter(|c| c.valore != 2).cloned().collect();
        let n2 = due_del_seme.len();
        for mask in 0..(1u32 << n2) {
            let mut nat_due = Vec::new();
            let mut wild_due = Vec::new();
            for i in 0..n2 {
                if mask & (1 << i) != 0 { nat_due.push(due_del_seme[i]); }
                else { wild_due.push(due_del_seme[i]); }
            }
            let naturals: Vec<Carta> = altri_del_seme.iter().chain(nat_due.iter()).cloned().cloned().collect();
            let wilds: Vec<Carta> = jollys.iter().chain(altri.iter()).chain(wild_due.iter()).cloned().cloned().collect();
            if let Some(slots) = prova_sequenza(&naturals, &wilds, seme, false).or_else(||prova_sequenza(&naturals, &wilds, seme, true)) {
                let better = match &migliore {
                    None => true,
                    Some(m) => {
                        slots.len() > m.len() ||
                        (slots.len() == m.len() && slots.iter().filter(|s| s.wild).count() < m.iter().filter(|s| s.wild).count())
                    }
                };
                if better { migliore = Some(slots); }
            }
        }
    }
    migliore
}

fn costruisci_gruppo(carte: &[Carta]) -> Option<Vec<Slot>> {
    let jollys: Vec<&Carta> = carte.iter().filter(|c| c.is_jolly()).collect();
    let non_jolly: Vec<&Carta> = carte.iter().filter(|c| !c.is_jolly()).collect();
    if non_jolly.len() < 2 { return None; }
    let pinelle: Vec<&Carta> = non_jolly.iter().filter(|c| c.valore == 2).cloned().collect();
    let naturali: Vec<&Carta> = non_jolly.iter().filter(|c| c.valore != 2).cloned().collect();
    if naturali.len() < 2 { return None; }
    let v = naturali[0].valore;
    if !naturali.iter().all(|c| c.valore == v) { return None; }
    let wilds: Vec<Carta> = jollys.iter().chain(pinelle.iter()).cloned().cloned().collect();
    if wilds.len() > 1 { return None; }
    if naturali.len() + wilds.len() < 3 { return None; }
    let mut slots = Vec::new();
    for c in &naturali { slots.push(Slot { carta: (*c).clone(), valore: v, wild: false }); }
    for w in &wilds { slots.push(Slot { carta: (*w).clone(), valore: v, wild: true }); }
    if !verifica_slots_gruppo(&slots) { return None; }
    Some(slots)
}

fn esito_da_slots(slots: Vec<Slot>, tipo: MeldTipo, seme: Option<Seme>) -> Esito {
    let punti: i32 = slots.iter().map(|s| s.carta.punti()).sum();
    let lunghezza = slots.len();
    let cls = classifica_burraco(&slots);
    Esito {
        tipo,
        seme,
        slots,
        punti,
        matte: cls.matte,
        lunghezza,
        burraco: cls.burraco,
        pulito: cls.pulito,
        semipulito: cls.semipulito,
        sporco: cls.sporco,
    }
}

pub fn valida_combinazione(carte: &[Carta]) -> Option<Esito> {
    let lista: Vec<Carta> = carte.iter().filter(|c| c.id != "").cloned().collect();
    if lista.len() < 3 { return None; }
    let mut ids = HashSet::new();
    for c in &lista {
        if ids.contains(&c.id) { return None; }
        ids.insert(c.id.clone());
    }
    if let Some(sg) = costruisci_gruppo(&lista) {
        return Some(esito_da_slots(sg, MeldTipo::Gruppo, None));
    }
    if let Some(sq) = costruisci_sequenza(&lista) {
        let seme = sq.iter().find(|s| !s.wild).unwrap().carta.seme;
        return Some(esito_da_slots(sq, MeldTipo::Sequenza, seme));
    }
    None
}

pub fn motivo_non_valida(carte: &[Carta]) -> String {
    let lista: Vec<Carta> = carte.iter().filter(|c| c.id != "").cloned().collect();
    if lista.len() < 3 { return "Servono almeno 3 carte per calare una combinazione.".to_string(); }
    let non_jolly: Vec<&Carta> = lista.iter().filter(|c| !c.is_jolly()).collect();
    if non_jolly.len() < 2 { return "Una combinazione non può essere formata solo da jolly e pinelle.".to_string(); }
    let mut semi = Vec::new();
    for c in &non_jolly { if !semi.contains(&c.seme) { semi.push(c.seme); } }
    let mut valori = Vec::new();
    for c in &non_jolly { if !valori.contains(&c.valore) { valori.push(c.valore); } }
    let matte = lista.iter().filter(|c| c.is_matta()).count();

    if semi.len() == 1 && valori.len() == 1 && valori[0] != 2 {
        if matte > 1 { return "Massimo 1 matta per combinazione.".to_string(); }
        return "Gruppo non valido.".to_string();
    }
    if valori.len() == 1 && valori[0] == 2 {
        return "Non si possono calare gruppi di soli 2 (pinelle): il 2 vale come matta.".to_string();
    }
    if valori.len() == 1 {
        if matte > 1 { return "Massimo 1 matta per gruppo.".to_string(); }
        return "Gruppo non valido.".to_string();
    }
    let semi_diversi = semi.len() > 1;
    if semi_diversi {
        let estranei = lista.iter().filter(|c| !c.is_jolly() && c.valore != 2 && !semi.contains(&c.seme)).count();
        if estranei > 0 { return "In una sequenza tutte le carte devono essere dello stesso seme.".to_string(); }
    }
    if matte > 2 { return "Troppe matte (jolly/pinelle) in questa sequenza.".to_string(); }
    if matte > 1 { return "Massimo una carta sostitutiva; una seconda pinella è ammessa solo come 2 naturale del seme.".to_string(); }
    "Le carte non formano una sequenza consecutiva dello stesso seme.".to_string()
}

fn clona_slots(slots: &[Slot]) -> Vec<Slot> { slots.to_vec() }

fn lega_sequenza(slots: &[Slot], carta: &Carta) -> Option<Vec<Slot>> {
    let seme = slots.iter().find(|s| !s.wild).unwrap().carta.seme.unwrap();
    let min = slots[0].valore;
    let max = slots.last().unwrap().valore;
    let valore=if carta.valore==1 && min>1 {14}else{carta.valore};

    let prova_come_matta = || -> Option<Vec<Slot>> {
        let mut copia = clona_slots(slots);
        if max + 1 <= 13 {
            copia.push(Slot { carta: carta.clone(), valore: max + 1, wild: true });
        } else if (min as i32) - 1 >= 1 {
            copia.insert(0, Slot { carta: carta.clone(), valore: min - 1, wild: true });
        } else {
            return None;
        }
        if verifica_slots_sequenza(&copia, seme) { Some(copia) } else { None }
    };

    if carta.is_matta() {
        if carta.is_jolly() || carta.seme != Some(seme) {
            return prova_come_matta();
        }
    }

    if !carta.is_jolly() && carta.seme == Some(seme) {
        if valore == max + 1 {
            let mut nuovi = clona_slots(slots);
            nuovi.push(Slot { carta: carta.clone(), valore: valore, wild: false });
            if verifica_slots_sequenza(&nuovi, seme) { return Some(nuovi); }
        }
        if (valore as i32) == (min as i32) - 1 {
            let mut nuovi = clona_slots(slots);
            nuovi.insert(0, Slot { carta: carta.clone(), valore: valore, wild: false });
            if verifica_slots_sequenza(&nuovi, seme) { return Some(nuovi); }
        }
    }

    if carta.is_matta() { return prova_come_matta(); }
    if carta.seme != Some(seme) { return None; }

    if let Some(idx) = slots.iter().position(|s| s.wild && s.valore == valore) {
        let mut nuovi = clona_slots(slots);
        let matta = nuovi[idx].carta.clone();
        nuovi[idx] = Slot { carta: carta.clone(), valore: valore, wild: false };
        let n_max = nuovi.last().unwrap().valore;
        let n_min = nuovi[0].valore;
        if n_max + 1 <= 13 {
            nuovi.push(Slot { carta: matta.clone(), valore: n_max + 1, wild: true });
        } else if (n_min as i32) - 1 >= 1 {
            nuovi.insert(0, Slot { carta: matta.clone(), valore: n_min - 1, wild: true });
        } else {
            return None;
        }
        if verifica_slots_sequenza(&nuovi, seme) { return Some(nuovi); }
    }
    None
}

fn prova_legatura_multipla(meld:&Meld, carte:&[Carta]) -> Option<(Vec<Slot>,bool)> {
 fn visit(m:&Meld,rest:&[Carta],changed:bool,seen:&mut HashSet<String>)->Option<(Vec<Slot>,bool)>{
  if rest.is_empty(){return Some((m.slots.clone(),changed))}
  let mut ids=rest.iter().map(|c|c.id.clone()).collect::<Vec<_>>();ids.sort();
  let key=format!("{:?}/{:?}",m.slots.iter().map(|s|(&s.carta.id,s.valore,s.wild)).collect::<Vec<_>>(),ids);
  if !seen.insert(key){return None}
  for c in rest {if let Some((slots,sub))=prova_legatura(m,c){let mut next=m.clone();next.slots=slots;aggiorna_meld(&mut next);let remaining=rest.iter().filter(|x|x.id!=c.id).cloned().collect::<Vec<_>>();if let Some(result)=visit(&next,&remaining,changed||sub,seen){return Some(result)}}}None
 }
 let mut sorted=carte.to_vec();sorted.sort_by_key(|c|c.is_matta());visit(meld,&sorted,false,&mut HashSet::new())
}

fn lega_gruppo(slots: &[Slot], carta: &Carta) -> Option<Vec<Slot>> {
    let mut nuovi = clona_slots(slots);
    let v = slots[0].valore;
    if carta.is_matta() {
        nuovi.push(Slot { carta: carta.clone(), valore: v, wild: true });
    } else {
        if carta.valore != v { return None; }
        nuovi.push(Slot { carta: carta.clone(), valore: v, wild: false });
    }
    if verifica_slots_gruppo(&nuovi) { Some(nuovi) } else { None }
}

/// Restituisce i nuovi slot e se si tratta di una sostituzione.
pub fn prova_legatura(meld: &Meld, carta: &Carta) -> Option<(Vec<Slot>, bool)> {
    if meld.slots.iter().any(|s| s.carta.id == carta.id) { return None; }
    let slots = match meld.tipo {
        MeldTipo::Gruppo => lega_gruppo(&meld.slots, carta),
        MeldTipo::Sequenza => lega_sequenza(&meld.slots, carta),
    }?;
    let sostituzione = meld.tipo == MeldTipo::Sequenza
        && slots.len() == meld.slots.len() + 1
        && slots.iter().filter(|s| s.wild).count() == meld.slots.iter().filter(|s| s.wild).count()
        && (0..slots.len()).any(|i| meld.slots.get(i).map_or(true, |m| m.carta.id != slots[i].carta.id));
    Some((slots, sostituzione))
}

/* ============================ SUGGERIMENTI ============================ */
#[derive(Debug, Clone)]
pub struct Suggerimento {
    pub ids: Vec<String>,
    pub punti: i32,
    pub burraco: bool,
}

pub fn suggerisci_combinazioni(mano: &[Carta], limite: usize) -> Vec<Suggerimento> {
    let mut out: Vec<Vec<String>> = Vec::new();
    let matte: Vec<&Carta> = mano.iter().filter(|c| c.is_matta()).collect();
    let naturali: Vec<&Carta> = mano.iter().filter(|c| !c.is_matta()).collect();

    let mut per_rango: HashMap<u8, Vec<&Carta>> = HashMap::new();
    for c in &naturali {
        per_rango.entry(c.valore).or_default().push(c);
    }
    for (_, gruppo) in per_rango.iter() {
        let mut cont: HashMap<Seme, usize> = HashMap::new();
        let mut sel = Vec::new();
        for c in gruppo {
            if let Some(seme) = c.seme {
                let e = cont.entry(seme).or_insert(0);
                if *e < 2 { sel.push(*c); *e += 1; }
            }
        }
        if sel.len() >= 3 {
            out.push(sel.iter().map(|c| c.id.clone()).collect());
        }
        if sel.len() >= 2 {
            for m in &matte {
                let mut v = sel.iter().map(|c| c.id.clone()).collect::<Vec<_>>();
                v.push(m.id.clone());
                out.push(v);
            }
        }
    }

    for &seme in &SEMI {
        let del_seme: Vec<&Carta> = naturali.iter().filter(|c| c.seme == Some(seme)).cloned().collect();
        if del_seme.len() < 2 { continue; }
        let mut per_val: HashMap<u8, Vec<&Carta>> = HashMap::new();
        for c in &del_seme { per_val.entry(c.valore).or_default().push(c); }
        if let Some(aces)=per_val.get(&1).cloned(){per_val.insert(14,aces);}
        let mut valori: Vec<u8> = per_val.keys().cloned().collect();
        valori.sort();
        for i in 0..valori.len() {
            for j in i..valori.len() {
                let lo = valori[i];
                let hi = valori[j];
                let span = hi - lo + 1;
                if span < 2 { continue; }
                let buchi = span - (j as u8 - i as u8 + 1);
                if buchi > 1 { continue; }
                let mut sel = Vec::new();
                for v in lo..=hi {
                    if let Some(cards) = per_val.get(&v) { sel.push(cards[0]); }
                }
                let usate: HashSet<String> = sel.iter().map(|c| c.id.clone()).collect();
                let matte_libere: Vec<&&Carta> = matte.iter().filter(|m| !usate.contains(&m.id)).collect();
                let mut ids: Vec<String> = sel.iter().map(|c| c.id.clone()).collect();
                if buchi == 1 {
                    if matte_libere.is_empty() { continue; }
                    ids.push(matte_libere[0].id.clone());
                } else {
                    if sel.len() >= 3 { out.push(ids.clone()); }
                    if !matte_libere.is_empty() && sel.len() >= 2 {
                        let mut v = ids.clone();
                        v.push(matte_libere[0].id.clone());
                        out.push(v);
                    }
                }
            }
        }
    }

    let mut visti = HashSet::new();
    let mut validi: Vec<Suggerimento> = Vec::new();
    let carte_map: HashMap<&str, &Carta> = mano.iter().map(|c| (c.id.as_str(), c)).collect();
    for ids in &out {
        let mut chiave = ids.clone();
        chiave.sort();
        let key = chiave.join(",");
        if visti.contains(&key) { continue; }
        visti.insert(key);
        let sel: Vec<Carta> = ids.iter().filter_map(|id| carte_map.get(id.as_str()).cloned().cloned()).collect();
        if sel.len() != ids.len() { continue; }
        if let Some(esito) = valida_combinazione(&sel) {
            validi.push(Suggerimento { ids: ids.clone(), punti: esito.punti, burraco: esito.burraco });
        }
    }
    validi.sort_by(|a, b| (b.punti, b.ids.len()).cmp(&(a.punti, a.ids.len())));
    if limite > 0 && validi.len() > limite { validi.truncate(limite); }
    validi
}

/* ============================ STATO ============================ */
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fase {
    Pesca,
    Gioco,
    Fine,
}

#[derive(Debug, Clone)]
pub struct Stato {
    pub smazzata: usize,
    pub mazziere: usize,
    pub turno: usize,
    pub fase: Fase,
    pub tallone: Vec<Carta>,
    pub monte: Vec<Carta>,
    pub mani: Vec<Vec<Carta>>,
    pub pozzetti: Vec<Vec<Carta>>,
    pub pozzetto_preso: Vec<bool>,
    pub melds: Vec<Vec<Meld>>,
    pub totali: Vec<i32>,
    pub punteggi_ultima: Option<Value>,
    pub storico: Vec<Value>,
    pub chiusa_da: Option<usize>,
    pub finita: bool,
    pub limite_smazzate: Option<usize>,
    pub partita_finita: bool,
    pub vincitore: Option<usize>,
    pub monte_bloccato: Option<String>,
    pub ultima_azione: Option<Value>,
    pub log: Vec<String>,
    pub num_meld: usize,
    pub turni_smazzata: u32,
    pub pozzetto_da_giocare: Vec<bool>,
}

pub struct Partita {
    pub target: i32,
    pub n_gioc: usize,
    pub squadre: Vec<usize>,
    pub nomi: Vec<String>,
    pub stato: Stato,
    rng: Rng,
}

impl Partita {
    pub fn new(opts: PartitaOpts) -> Partita {
        let n_gioc = if opts.giocatori == 4 { 4 } else { 2 };
        let squadre = if n_gioc == 4 { vec![0, 1, 0, 1] } else { vec![0, 1] };
        let nomi = opts.nomi.unwrap_or_else(|| {
            (0..n_gioc).map(|i| format!("Giocatore {}", i + 1)).collect()
        });
        let mut p = Partita {
            target: if TARGET_VALIDI.contains(&opts.target) { opts.target } else { 2005 },
            n_gioc,
            squadre,
            nomi,
            stato: Stato {
                smazzata: 0, mazziere: 0, turno: 0, fase: Fase::Pesca,
                tallone: Vec::new(), monte: Vec::new(), mani: Vec::new(),
                pozzetti: Vec::new(), pozzetto_preso: Vec::new(), melds: Vec::new(),
                totali: Vec::new(), punteggi_ultima: None, storico: Vec::new(),
                chiusa_da: None, finita: false, limite_smazzate: None, partita_finita: false, vincitore: None,
                monte_bloccato: None, ultima_azione: None, log: Vec::new(),
                num_meld: 0, turni_smazzata: 0, pozzetto_da_giocare: Vec::new(),
            },
            rng: Rng::new(opts.seed),
        };
        p.nuova_partita();
        p
    }

    pub fn nuova_partita(&mut self) {
        let n = self.n_gioc;
        let limite = self.stato.limite_smazzate;
        self.stato = Stato {
            smazzata: 0, mazziere: 0, turno: 0, fase: Fase::Pesca,
            tallone: Vec::new(), monte: Vec::new(),
            mani: rep_vec(n, Vec::new()),
            pozzetti: vec![Vec::new(), Vec::new()],
            pozzetto_preso: vec![false, false],
            melds: rep_vec(n, Vec::new()),
            totali: zeri(n),
            punteggi_ultima: None, storico: Vec::new(),
            chiusa_da: None, finita: false, limite_smazzate: limite, partita_finita: false, vincitore: None,
            monte_bloccato: None, ultima_azione: None, log: Vec::new(),
            num_meld: 0, turni_smazzata: 0, pozzetto_da_giocare: vec![false, false],
        };
        self.nuova_smazzata();
    }

    pub fn nuova_smazzata(&mut self) {
        let s = &mut self.stato;
        let n = self.n_gioc;
        s.smazzata += 1;
        s.mazziere = (s.mazziere + 1) % n;
        s.turno = (s.mazziere + 1) % n;
        s.fase = Fase::Pesca;
        s.chiusa_da = None;
        s.finita = false;
        s.monte_bloccato = None;
        s.turni_smazzata = 0;
        s.ultima_azione = None;
        s.pozzetto_preso = vec![false, false];
        s.melds = rep_vec(n, Vec::new());
        s.pozzetto_da_giocare = vec![false, false];

        let mut mazzo = crea_mazzo();
        self.rng.shuffle(&mut mazzo);
        s.tallone = mazzo;
        s.mani = rep_vec(n, Vec::new());
        for _ in 0..CARTE_MANO {
            for g in 0..n {
                if let Some(c) = s.tallone.pop() { s.mani[g].push(c); }
            }
        }
        s.pozzetti = vec![Vec::new(), Vec::new()];
        for _ in 0..CARTE_POZZETTO {
            for t in 0..2 {
                if let Some(c) = s.tallone.pop() { s.pozzetti[t].push(c); }
            }
        }
        if let Some(c) = s.tallone.pop() { s.monte = vec![c]; }
        s.log = vec![format!("Nuova smazzata n. {}. Inizia {}.", s.smazzata, self.nomi[s.turno])];
    }

    /* --- info/query (free functions) --- */
    pub fn puo_chiudere(&self, g: usize) -> bool {
        puo_chiudere(&self.stato, &self.squadre, g)
    }
    pub fn melds_compatibili(&self, g: usize, id: &str) -> Vec<usize> {
        melds_compatibili(&self.stato, &self.squadre, g, id)
    }
    pub fn cala_ammissibile(&self, g: usize, carte: &[Carta]) -> bool {
        cala_ammissibile(&self.stato, &self.squadre, g, carte)
    }
    pub fn scarto_vietato(&self, g: usize, id: &str) -> bool {
        scarto_vietato(&self.stato, &self.squadre, g, id)
    }
    pub fn chiude_con(&self, g: usize, id: &str) -> bool {
        chiude_con(&self.stato, &self.squadre, g, id)
    }
    pub fn suggerimenti(&self, g: usize) -> Vec<Suggerimento> {
        suggerimenti(&self.stato, &self.squadre, g)
    }
    pub fn totali_squadra(&self) -> [i32; 2] {
        totali_squadra(&self.stato, &self.squadre)
    }

    /* --- pesca --- */
    pub fn pesca_tallone(&mut self) -> Result<(), String> {
        let s = &mut self.stato;
        if s.fase != Fase::Pesca { return Err("Devi prima pescare una carta.".to_string()); }
        if s.tallone.is_empty() { return Err("Il tallone è esaurito.".to_string()); }
        let carta = s.tallone.pop().unwrap();
        s.mani[s.turno].push(carta);
        s.fase = Fase::Gioco;
        s.monte_bloccato = None;
        s.ultima_azione = Some(json!({"tipo":"pesca","giocatore":s.turno,"sorgente":"tallone"}));
        Ok(())
    }
    pub fn prendi_monte(&mut self) -> Result<(), String> {
        let s = &mut self.stato;
        if s.fase != Fase::Pesca { return Err("Devi prima pescare una carta.".to_string()); }
        if s.monte.is_empty() { return Err("Il monte è vuoto.".to_string()); }
        let carte = s.monte.clone();
        s.monte = Vec::new();
        for c in &carte { s.mani[s.turno].push(c.clone()); }
        s.monte_bloccato = if carte.len() == 1 { Some(carte[0].id.clone()) } else { None };
        s.fase = Fase::Gioco;
        s.ultima_azione = Some(json!({"tipo":"pesca","giocatore":s.turno,"sorgente":"monte","quante":carte.len()}));
        Ok(())
    }

    /* --- calata --- */
    pub fn cala(&mut self, ids: &[String]) -> Result<(), String> {
        let s = &mut self.stato;
        if s.fase != Fase::Gioco { return Err("Devi prima pescare una carta.".to_string()); }
        let g = s.turno;
        let mut carte = Vec::new();
        for id in ids {
            match s.mani[g].iter().find(|c| &c.id == id) {
                Some(c) => carte.push(c.clone()),
                None => return Err("Carta non in mano.".to_string()),
            }
        }
        let esito = match valida_combinazione(&carte) {
            Some(e) => e,
            None => return Err(motivo_non_valida(&carte)),
        };
        if gruppo_gia_presente(s, &self.squadre, g, &esito) { return Err("Esiste già un tris di questo valore nella tua squadra: usa Lega.".into()); }
        let restanti: Vec<Carta> = s.mani[g].iter().filter(|c| !ids.contains(&c.id)).cloned().collect();
        let burrachi_pro = conta_burrachi_squadra(s, &self.squadre, g) + if esito.burraco { 1 } else { 0 };
        if let Err(m) = controlla_mano_dopo_calata(s, &self.squadre, g, &restanti, burrachi_pro) {
            return Err(m);
        }
        let meld = Meld {
            id: format!("m{}", s.num_meld),
            tipo: esito.tipo,
            seme: esito.seme,
            slots: esito.slots,
            punti: esito.punti,
            burraco: esito.burraco,
            pulito: esito.pulito,
            semipulito: esito.semipulito,
            sporco: esito.sporco,
            matte: esito.matte,
            lunghezza: esito.lunghezza,
            nuovo: true,
        };
        s.num_meld += 1;
        s.melds[g].push(meld);
        s.mani[g] = restanti;
        s.ultima_azione = Some(json!({"tipo":"cala","giocatore":g,"meld":s.melds[g].last().unwrap().id}));
        dopo_mano_svuotata(s, &self.squadre, g);
        Ok(())
    }

    /* --- legatura --- */
    pub fn lega(&mut self, indice: usize, id: &str) -> Result<(), String> {
        self.lega_a(indice,id,self.stato.turno)
    }
    pub fn lega_a(&mut self, indice: usize, id: &str, owner: usize) -> Result<(), String> {self.lega_molte(indice,&[id.to_string()],owner)}
    pub fn lega_molte(&mut self, indice: usize, ids: &[String], owner: usize) -> Result<(), String> {
        let s = &mut self.stato;
        if s.fase != Fase::Gioco { return Err("Devi prima pescare una carta.".to_string()); }
        let g = s.turno;
        if owner>=self.n_gioc || self.squadre[owner]!=self.squadre[g] {return Err("Puoi legare solo ai giochi della tua squadra.".into())}
        let meld = match s.melds[owner].get(indice) {
            Some(m) => m.clone(),
            None => return Err("Combinazione inesistente.".to_string()),
        };
        if ids.is_empty()||ids.len()>13||ids.iter().collect::<HashSet<_>>().len()!=ids.len(){return Err("Seleziona carte diverse da legare.".into())}
        let carte=ids.iter().map(|id|s.mani[g].iter().find(|c|&c.id==id).cloned().ok_or("Carta non in mano.".to_string())).collect::<Result<Vec<_>,_>>()?;
        let (nuovi_slots, sostituzione) = match prova_legatura_multipla(&meld, &carte) {
            Some(x) => x,
            None => return Err("Mossa non valida.".to_string()),
        };
        let restanti: Vec<Carta> = s.mani[g].iter().filter(|c| !ids.contains(&c.id)).cloned().collect();
        let diventa_burraco = nuovi_slots.len() >= 7 && !meld.burraco;
        let burrachi_pro = conta_burrachi_squadra(s, &self.squadre, g) + if diventa_burraco { 1 } else { 0 };
        if let Err(m) = controlla_mano_dopo_calata(s, &self.squadre, g, &restanti, burrachi_pro) {
            return Err(m);
        }
        let era_burraco = meld.burraco;
        let m = &mut s.melds[owner][indice];
        m.slots = nuovi_slots;
        aggiorna_meld(m);
        s.mani[g] = restanti;
        s.ultima_azione = Some(json!({"tipo":"lega","giocatore":g,"meld":m.id,"carta":ids[0],"carte":ids,
            "sostituzione":sostituzione,"nuovoBurraco": m.burraco && !era_burraco}));
        dopo_mano_svuotata(s, &self.squadre, g);
        Ok(())
    }

    pub fn valuta_spostamento(&self, orig: usize, id: &str, dest: usize) -> Result<SpostamentoEsito, String> {
        let s = &self.stato;
        if s.finita { return Err("La smazzata è conclusa.".to_string()); }
        if s.fase != Fase::Gioco { return Err("Puoi spostare le carte solo dopo aver pescato.".to_string()); }
        let melds = &s.melds[s.turno];
        let da = match melds.get(orig) { Some(m) => m, None => return Err("Combinazione inesistente.".to_string()) };
        let a = match melds.get(dest) { Some(m) => m, None => return Err("Combinazione inesistente.".to_string()) };
        if da.id == a.id { return Err("La carta è già in quella combinazione.".to_string()); }
        let i = da.slots.iter().position(|x| x.carta.id == id);
        let i = match i { Some(i) => i, None => return Err("Carta non presente in quella combinazione.".to_string()) };
        let carta = da.slots[i].carta.clone();
        let mut restanti = da.slots.clone();
        restanti.remove(i);
        if restanti.len() < 3 { return Err("La combinazione di partenza resterebbe con meno di 3 carte.".to_string()); }
        if da.burraco && restanti.len() < 7 { return Err("Un burraco non si può scomporre.".to_string()); }
        if !slots_validi(da.tipo, da.seme, &restanti) {
            return Err(format!("Togliendo {} la combinazione di partenza non sarebbe più valida.", carta.etichetta()));
        }
        let prova = match prova_legatura(a, &carta) {
            Some(x) => x,
            None => return Err(format!("{} non può entrare in quella combinazione.", carta.etichetta())),
        };
        Ok(SpostamentoEsito { restanti, prova, carta })
    }

    pub fn sposta(&mut self, orig: usize, id: &str, dest: usize) -> Result<(), String> {
        let giudizio = self.valuta_spostamento(orig, id, dest)?;
        let s = &mut self.stato;
        let g = s.turno;
        let melds = &mut s.melds[g];
        let era_burraco = melds[dest].burraco;
        melds[orig].slots = giudizio.restanti;
        aggiorna_meld(&mut melds[orig]);
        melds[dest].slots = giudizio.prova.0;
        aggiorna_meld(&mut melds[dest]);
        melds[dest].nuovo = true;
        s.ultima_azione = Some(json!({
            "tipo":"sposta","giocatore":g,"carta":id,
            "origine":melds[orig].id,"destinazione":melds[dest].id,
            "sostituzione": giudizio.prova.1,
            "nuovoBurraco": melds[dest].burraco && !era_burraco
        }));
        Ok(())
    }

    /* --- scarto --- */
    pub fn scarta(&mut self, id: &str) -> Result<(), String> {
        let s = &mut self.stato;
        if s.fase != Fase::Gioco { return Err("Devi prima pescare una carta.".to_string()); }
        let g = s.turno;
        let carta = match s.mani[g].iter().find(|c| c.id == id) {
            Some(c) => c.clone(),
            None => return Err("Carta non in mano.".to_string()),
        };
        if s.monte_bloccato.as_deref() == Some(id) && s.mani[g].len() > 1 {
            return Err("La carta appena presa da un monte di una sola carta non può essere riscartata.".to_string());
        }
        let ultima = s.mani[g].len() == 1;
        let squadra = self.squadre[g];

        if ultima && !s.pozzetto_preso[squadra] {
            if s.pozzetti[squadra].is_empty() {
                return Err("Non hai più carte e non hai un pozzetto: impossibile proseguire.".to_string());
            }
            scarta_carta(s, g, &carta);
            prendi_pozzetto(s, &self.squadre, g);
            fine_turno(s, &self.squadre, self.n_gioc, self.target);
            return Ok(());
        }
        if ultima && s.pozzetto_preso[squadra] {
            if carta.is_matta() {
                return Err("Non puoi chiudere scartando una matta.".to_string());
            }
            if conta_burrachi_squadra(s, &self.squadre, g) < 1 {
                return Err("Per chiudere devi aver calato almeno un burraco.".to_string());
            }
            scarta_carta(s, g, &carta);
            chiudi(s, &self.squadre, self.n_gioc, g, self.target);
            return Ok(());
        }
        scarta_carta(s, g, &carta);
        s.ultima_azione = Some(json!({"tipo":"scarta","giocatore":g,"carta":id}));
        fine_turno(s, &self.squadre, self.n_gioc, self.target);
        Ok(())
    }

    pub fn smazzata_successiva(&mut self) -> bool {
        let s = &self.stato;
        if !s.finita { return false; }
        if s.partita_finita || s.vincitore.is_some() { return true; }
        self.nuova_smazzata();
        false
    }

    pub fn public_state(&self, viewer: usize) -> Value {
        let s = &self.stato;
        let seats: Vec<Value> = (0..self.n_gioc).map(|g| {
            let mano_completa = g == viewer;
            let hand: Vec<Value> = if mano_completa {
                s.mani[g].iter().map(|c| c.view()).collect()
            } else { Vec::new() };
            json!({
                "seat": g,
                "name": self.nomi[g],
                "team": self.squadre[g],
                "hand": hand,
                "handCount": s.mani[g].len(),
                "melds": s.melds[g].iter().map(|m| meld_view(m)).collect::<Vec<_>>(),
                "burrachi": conta_burrachi(s, g)
            })
        }).collect();
        json!({
            "you": viewer,
            "nGioc": self.n_gioc,
            "squadre": self.squadre,
            "smazzata": s.smazzata,
            "turno": s.turno,
            "fase": match s.fase { Fase::Pesca => "pesca", Fase::Gioco => "gioco", Fase::Fine => "fine" },
            "monte": s.monte.iter().map(|c| c.view()).collect::<Vec<_>>(),
            "talloneCount": s.tallone.len(),
            "pozzetti": (0..2).map(|t| json!({
                "count": s.pozzetti[t].len(),
                "taken": s.pozzetto_preso[t]
            })).collect::<Vec<_>>(),
            "seats": seats,
            "totali": s.totali,
            "totaliSquadra": totali_squadra(s, &self.squadre),
            "chiusaDa": s.chiusa_da,
            "finita": s.finita,
            "vincitore": s.vincitore,
            "smazzate": s.limite_smazzate,
            "smazzateCompletate": s.storico.len(),
            "partitaFinita": s.partita_finita,
            "pareggio": s.partita_finita && s.vincitore.is_none(),
            "punteggiUltima": s.punteggi_ultima,
            "log": s.log,
            "monteBloccato": s.monte_bloccato,
            "target": self.target
        })
    }
}

/* ============================ FUNZIONI LIBERE (stato) ============================ */
fn rep_vec<T: Clone>(n: usize, v: T) -> Vec<T> { vec![v; n] }
fn zeri(n: usize) -> Vec<i32> { vec![0; n] }

fn squadra_di(squadre: &[usize], g: usize) -> usize { squadre[g] }
pub fn avversari_di(squadre: &[usize], g: usize) -> Vec<usize> {
    let mia = squadre[g];
    (0..squadre.len()).filter(|&i| squadre[i] != mia).collect()
}

fn totali_squadra(stato: &Stato, squadre: &[usize]) -> [i32; 2] {
    let mut t = [0i32; 2];
    for g in 0..stato.totali.len() { t[squadre[g]] += stato.totali[g]; }
    t
}
fn punti_meld(stato: &Stato, g: usize) -> i32 {
    stato.melds[g].iter().map(|m| m.punti).sum()
}
fn bonus_meld(stato: &Stato, g: usize) -> i32 {
    stato.melds[g].iter().map(|m| bonus_burraco(m)).sum()
}
fn punti_in_mano(stato: &Stato, g: usize) -> i32 {
    stato.mani[g].iter().map(|c| c.punti()).sum()
}
pub fn conta_burrachi(stato: &Stato, g: usize) -> usize {
    stato.melds[g].iter().filter(|m| m.burraco).count()
}
fn conta_burrachi_squadra(stato: &Stato, squadre: &[usize], g: usize) -> usize {
    stato.melds.iter().enumerate().filter(|(i,_)|squadre[*i]==squadre[g]).map(|(_,ms)|ms.iter().filter(|m|m.burraco).count()).sum()
}
fn puo_chiudere(stato: &Stato, squadre: &[usize], g: usize) -> bool {
    stato.pozzetto_preso[squadre[g]] && conta_burrachi_squadra(stato, squadre, g) >= 1
}

fn aggiorna_meld(meld: &mut Meld) {
    let cls = classifica_burraco(&meld.slots);
    meld.lunghezza = meld.slots.len();
    meld.matte = cls.matte;
    meld.punti = meld.slots.iter().map(|x| x.carta.punti()).sum();
    meld.burraco = cls.burraco;
    meld.pulito = cls.pulito;
    meld.semipulito = cls.semipulito;
    meld.sporco = cls.sporco;
}

pub fn meld_view(meld: &Meld) -> Value {
    json!({
        "id": meld.id,
        "tipo": if meld.tipo == MeldTipo::Gruppo { "gruppo" } else { "sequenza" },
        "seme": meld.seme.map(|s| s.as_str()),
        "punti": meld.punti,
        "burraco": meld.burraco,
        "pulito": meld.pulito,
        "semipulito": meld.semipulito,
        "sporco": meld.sporco,
        "matte": meld.matte,
        "lunghezza": meld.lunghezza,
        "slots": meld.slots.iter().map(|s| json!({
            "valore": s.valore, "wild": s.wild, "carta": s.carta.view()
        })).collect::<Vec<_>>()
    })
}

fn scarta_carta(stato: &mut Stato, g: usize, carta: &Carta) {
    stato.mani[g].retain(|c| c.id != carta.id);
    stato.monte.push(carta.clone());
}

fn prendi_pozzetto(stato: &mut Stato, squadre: &[usize], g: usize) {
    let t = squadre[g];
    let stack = std::mem::take(&mut stato.pozzetti[t]);
    if stack.is_empty() { return; }
    for c in stack { stato.mani[g].push(c); }
    stato.pozzetto_preso[t] = true;
}

fn dopo_mano_svuotata(stato: &mut Stato, squadre: &[usize], g: usize) {
    let t = squadre[g];
    if !stato.mani[g].is_empty() { return; }
    if stato.pozzetto_preso[t] { return; }
    if stato.pozzetti[t].is_empty() { return; }
    prendi_pozzetto(stato, squadre, g);
    if let Some(ua) = stato.ultima_azione.as_mut().and_then(|v| v.as_object_mut()) {
        ua.insert("pozzettoInDiretta".to_string(), json!(true));
    }
}

fn controlla_mano_dopo_calata(
    stato: &Stato, squadre: &[usize], g: usize, restanti: &[Carta], burrachi_pro: usize,
) -> Result<(), String> {
    let t = squadre[g];
    if restanti.is_empty() {
        if stato.pozzetto_preso[t] {
            return Err("Per chiudere devi scartare l'ultima carta: non puoi calare tutte le carte.".to_string());
        }
        if stato.pozzetti[t].is_empty() {
            return Err("Non puoi restare senza carte.".to_string());
        }
        return Ok(());
    }
    if stato.pozzetto_preso[t] {
        if restanti.iter().all(|c| c.is_matta()) {
            return Err("Non puoi restare con sole matte in mano: devi tenere una carta da scartare.".to_string());
        }
        if restanti.len() == 1 && burrachi_pro < 1 {
            return Err("Restando con una sola carta dovresti poter chiudere: ti manca ancora un burraco.".to_string());
        }
    }
    Ok(())
}

fn fine_turno(stato: &mut Stato, squadre: &[usize], n_gioc: usize, target: i32) {
    if stato.finita { return; }
    stato.turno = (stato.turno + 1) % n_gioc;
    stato.fase = Fase::Pesca;
    stato.monte_bloccato = None;
    stato.turni_smazzata += 1;
    if stato.tallone.len() <= CARTE_TALLONE_FINE {
        fine_senza_chiusura(stato, squadre, n_gioc, target);
    } else if stato.turni_smazzata > LIMITE_TURNI_SMAZZATA {
        stato.log.push("Smazzata chiusa d'ufficio: troppi turni senza progressi.".to_string());
        fine_senza_chiusura(stato, squadre, n_gioc, target);
    }
}

fn chiudi(stato: &mut Stato, squadre: &[usize], n_gioc: usize, g: usize, target: i32) {
    stato.chiusa_da = Some(g);
    calcola_punteggi(stato, squadre, n_gioc, target);
}
fn fine_senza_chiusura(stato: &mut Stato, squadre: &[usize], n_gioc: usize, target: i32) {
    stato.chiusa_da = None;
    calcola_punteggi(stato, squadre, n_gioc, target);
}

fn calcola_punteggi(stato: &mut Stato, squadre: &[usize], _n_gioc: usize, target: i32) {
    let n = stato.totali.len();
    let mut punti = vec![0i32; n];
    let mut dettaglio = Vec::new();
    for i in 0..n {
        let meld = punti_meld(stato, i);
        let bonus = bonus_meld(stato, i);
        punti[i] = meld + bonus;
        dettaglio.push(json!({
            "giocatore": i,
            "squadra": squadre[i],
            "puntiCarte": meld,
            "bonusBurraco": bonus,
            "burrachi": conta_burrachi(stato, i),
            "chiusura": 0,
            "carteInMano": punti_in_mano(stato, i),
            "penalePozzetto": if stato.pozzetto_preso[squadre[i]] { 0 } else { PENALE_POZZETTO },
            "totale": 0
        }));
    }
    let annullata = stato.chiusa_da.is_none() && !stato.pozzetto_preso[0] && !stato.pozzetto_preso[1];
    if annullata {
        stato.punteggi_ultima = Some(json!({
            "annullata": true, "punti": punti, "dettaglio": dettaglio,
            "chiusaDa": null, "smazzata": stato.smazzata
        }));
        stato.log.push("Smazzata annullata: nessuno ha preso il pozzetto. Si ripete.".to_string());
        stato.finita = true;
        return;
    }
    if let Some(v) = stato.chiusa_da {
        punti[v] += BONUS_CHIUSURA;
        dettaglio[v]["chiusura"] = json!(BONUS_CHIUSURA);
        for avv in avversari_di(squadre, v) {
            punti[avv] -= (dettaglio[avv]["carteInMano"].as_i64().unwrap_or(0) as i32)
                + (dettaglio[avv]["penalePozzetto"].as_i64().unwrap_or(0) as i32);
        }
    } else {
        for i in 0..n {
            punti[i] -= (dettaglio[i]["carteInMano"].as_i64().unwrap_or(0) as i32)
                + (dettaglio[i]["penalePozzetto"].as_i64().unwrap_or(0) as i32);
        }
    }
    for i in 0..n {
        dettaglio[i]["totale"] = json!(punti[i]);
        stato.totali[i] += punti[i];
    }
    stato.finita = true;
    stato.fase = Fase::Fine;
    let t_sq = totali_squadra(stato, squadre);
    let senza_chiusura = stato.chiusa_da.is_none();
    stato.punteggi_ultima = Some(json!({
        "annullata": false,
        "punti": punti,
        "dettaglio": dettaglio,
        "chiusaDa": stato.chiusa_da,
        "smazzata": stato.smazzata,
        "senzaChiusura": senza_chiusura,
        "totali": stato.totali,
        "totaliSquadra": t_sq
    }));
    stato.storico.push(stato.punteggi_ultima.clone().unwrap());
    if stato.limite_smazzate.map_or(t_sq[0] >= target || t_sq[1] >= target, |n| stato.storico.len() >= n) {
        stato.partita_finita = stato.limite_smazzate.is_some() || t_sq[0] != t_sq[1];
        if t_sq[0] == t_sq[1] { stato.vincitore = None; }
        else { stato.vincitore = Some(if t_sq[0] > t_sq[1] { 0 } else { 1 }); }
    }
    stato.log.push(format!("Smazzata conclusa. Punti: {}", punti.iter().map(|v| v.to_string()).collect::<Vec<_>>().join(" / ")));
}

fn gruppo_gia_presente(stato: &Stato, squadre: &[usize], g: usize, esito: &Esito) -> bool {
    esito.tipo == MeldTipo::Gruppo && stato.melds.iter().enumerate().any(|(owner, lista)| squadre[owner] == squadre[g] && lista.iter().any(|m| m.tipo == MeldTipo::Gruppo && m.slots[0].valore == esito.slots[0].valore))
}

fn cala_ammissibile(stato: &Stato, squadre: &[usize], g: usize, carte: &[Carta]) -> bool {
    let lista: Vec<Carta> = carte.iter().filter(|c| c.id != "").cloned().collect();
    let esito = match valida_combinazione(&lista) { Some(e) => e, None => return false };
    if gruppo_gia_presente(stato, squadre, g, &esito) { return false; }
    let ids: HashSet<String> = lista.iter().map(|c| c.id.clone()).collect();
    let restanti: Vec<Carta> = stato.mani[g].iter().filter(|c| !ids.contains(&c.id)).cloned().collect();
    controlla_mano_dopo_calata(stato, squadre, g, &restanti, conta_burrachi_squadra(stato, squadre, g) + if esito.burraco { 1 } else { 0 }).is_ok()
}

fn scarto_vietato(stato: &Stato, squadre: &[usize], g: usize, id: &str) -> bool {
    let carta = match stato.mani[g].iter().find(|c| c.id == id) { Some(c) => c, None => return true };
    if stato.monte_bloccato.as_deref() == Some(id) && stato.mani[g].len() > 1 { return true; }
    if stato.mani[g].len() == 1 && stato.pozzetto_preso[squadre[g]] {
        if carta.is_matta() { return true; }
        if conta_burrachi_squadra(stato, squadre, g) < 1 { return true; }
    }
    false
}

fn chiude_con(stato: &Stato, squadre: &[usize], g: usize, id: &str) -> bool {
    let carta = match stato.mani[g].iter().find(|c| c.id == id) { Some(c) => c, None => return false };
    stato.mani[g].len() == 1 && stato.pozzetto_preso[squadre[g]] && conta_burrachi_squadra(stato, squadre, g) >= 1 && !carta.is_matta()
}

fn carta_by_id(stato: &Stato, g: usize, id: &str) -> Carta {
    stato.mani[g].iter().find(|c| c.id == id).cloned().unwrap_or_else(|| Carta::new("", 0, None, false))
}

fn melds_compatibili(stato: &Stato, squadre: &[usize], g: usize, id: &str) -> Vec<usize> {
    let carta = match stato.mani[g].iter().find(|c| c.id == id) { Some(c) => c, None => return Vec::new() };
    let restanti: Vec<Carta> = stato.mani[g].iter().filter(|c| c.id != id).cloned().collect();
    let burrachi = conta_burrachi_squadra(stato, squadre, g);
    let mut out = Vec::new();
    for (i, m) in stato.melds[g].iter().enumerate() {
        let prova = match prova_legatura(m, carta) { Some(x) => x, None => continue };
        let diventa = prova.0.len() >= 7 && !m.burraco;
        if controlla_mano_dopo_calata(stato, squadre, g, &restanti, burrachi + if diventa { 1 } else { 0 }).is_ok() {
            out.push(i);
        }
    }
    out
}

fn suggerimenti(stato: &Stato, squadre: &[usize], g: usize) -> Vec<Suggerimento> {
    suggerisci_combinazioni(&stato.mani[g], 40)
        .into_iter()
        .filter(|x| {
            let carte: Vec<Carta> = x.ids.iter().map(|id| carta_by_id(stato, g, id)).filter(|c| c.id != "").collect();
            cala_ammissibile(stato, squadre, g, &carte)
        })
        .take(8)
        .collect()
}

/* ============================ Mazzo / opzioni ============================ */
pub fn crea_mazzo() -> Vec<Carta> {
    let mut carte = Vec::new();
    let mut n = 0u32;
    for _ in 0..2 {
        for &seme in &SEMI {
            for v in 1..=13 {
                carte.push(Carta::new(&format!("c{}", n), v, Some(seme), false));
                n += 1;
            }
        }
    }
    for i in 0..4 {
        carte.push(Carta::new(&format!("j{}", i), 0, None, true));
    }
    carte
}

#[derive(Default)]
pub struct PartitaOpts {
    pub target: i32,
    pub nomi: Option<Vec<String>>,
    pub giocatori: usize,
    pub seed: Option<u32>,
}

#[cfg(test)]
mod team_regression_tests {
 use super::*;
 fn card(id:&str,v:u8,s:Seme)->Carta {Carta::new(id,v,Some(s),false)}
 fn game()->Partita {Partita::new(PartitaOpts{target:2005,nomi:None,giocatori:4,seed:Some(31)})}
 #[test] fn attach_to_partner_and_reject_opponent(){
  let mut p=game();p.stato.turno=2;p.stato.fase=Fase::Gioco;
  p.stato.mani[2]=vec![card("h3",3,Seme::Cuori),card("h4",4,Seme::Cuori),card("h5",5,Seme::Cuori),card("extra",9,Seme::Picche)];
  p.cala(&["h3".into(),"h4".into(),"h5".into()]).unwrap();
  p.stato.turno=0;p.stato.mani[0]=vec![card("h6",6,Seme::Cuori),card("rest",9,Seme::Quadri)];
  assert!(p.lega_a(0,"h6",1).is_err());assert_eq!(p.stato.mani[0].len(),2);
  p.lega_a(0,"h6",2).unwrap();assert_eq!(p.stato.melds[2][0].slots.len(),4);assert_eq!(p.stato.mani[0].len(),1);assert!(p.stato.melds[0].is_empty());
 }
 #[test] fn partner_burraco_allows_team_close(){
  let mut p=game();p.stato.turno=2;p.stato.fase=Fase::Gioco;
  p.stato.mani[2]=(3..=9).map(|v|card(&format!("h{v}"),v,Seme::Cuori)).collect();p.stato.mani[2].push(card("extra",10,Seme::Picche));
  p.cala(&(3..=9).map(|v|format!("h{v}")).collect::<Vec<_>>()).unwrap();
  p.stato.turno=0;p.stato.pozzetto_preso[0]=true;p.stato.mani[0]=vec![card("last",10,Seme::Quadri)];
  assert!(p.puo_chiudere(0));p.scarta("last").unwrap();assert!(p.stato.finita);
 }
 #[test] fn one_card_new_turn_can_draw_both_sources(){for monte in [false,true]{
  let mut p=game();p.stato.turno=3;p.stato.fase=Fase::Gioco;p.stato.mani[0]=vec![card("last",7,Seme::Cuori)];p.stato.mani[3]=vec![card("discard",9,Seme::Quadri),card("keep",10,Seme::Picche)];
  p.scarta("discard").unwrap();assert_eq!(p.stato.turno,0);assert_eq!(p.stato.fase,Fase::Pesca);assert_eq!(p.stato.mani[0].len(),1);
  if monte {p.prendi_monte().unwrap()}else{p.pesca_tallone().unwrap()};assert!(p.stato.mani[0].len()>=2);assert_eq!(p.stato.fase,Fase::Gioco);
 }}
}

#[cfg(test)]
mod ace_multi_tests {
 use super::*;
 fn card(id:&str,v:u8)->Carta{Carta::new(id,v,Some(Seme::Cuori),false)}
 fn sequence(vals:&[u8])->Esito{valida_combinazione(&vals.iter().enumerate().map(|(i,v)|card(&format!("s{i}"),*v)).collect::<Vec<_>>()).unwrap()}
 #[test] fn high_ace_no_wrap(){let high=sequence(&[12,13,1]);assert_eq!(high.slots.iter().map(|s|s.valore).collect::<Vec<_>>(),vec![12,13,14]);let low=sequence(&(1..=13).collect::<Vec<_>>());assert!(lega_sequenza(&low.slots,&card("second_ace",1)).is_none());assert!(lega_sequenza(&sequence(&[10,11,12,13]).slots,&card("high_ace",1)).is_some());let mut two_aces=(1..=13).map(|v|card(&format!("v{v}"),v)).collect::<Vec<_>>();two_aces.push(card("second_ace",1));assert!(valida_combinazione(&two_aces).is_none());}
 #[test] fn batch_is_atomic_and_reorders(){let mut p=Partita::new(PartitaOpts{target:2005,nomi:None,giocatori:4,seed:Some(17)});p.stato.turno=2;p.stato.fase=Fase::Gioco;p.stato.mani[2]=vec![card("h3",3),card("h4",4),card("h5",5),card("keep",9)];p.cala(&["h3".into(),"h4".into(),"h5".into()]).unwrap();p.stato.turno=0;p.stato.mani[0]=vec![card("six",6),card("seven",7),card("nine",9),card("ten",10)];let before=p.public_state(0);assert!(p.lega_molte(0,&["six".into(),"nine".into()],2).is_err());assert_eq!(p.public_state(0),before);p.lega_molte(0,&["seven".into(),"six".into()],2).unwrap();assert_eq!(p.stato.melds[2][0].slots.iter().map(|s|s.valore).collect::<Vec<_>>(),vec![3,4,5,6,7]);assert_eq!(p.stato.mani[0].len(),2);}
}

#[cfg(test)]
mod rounds_rules_tests {
 use super::*;
 fn c(id:&str,v:u8,s:Seme)->Carta{Carta::new(id,v,Some(s),false)}
 fn game()->Partita{Partita::new(PartitaOpts{giocatori:4,target:505,seed:Some(7),nomi:None})}
 #[test] fn matte_limit(){let mut cards=vec![c("2",2,Seme::Cuori),c("3",3,Seme::Cuori),c("4",4,Seme::Cuori),c("p",2,Seme::Picche)];assert!(valida_combinazione(&cards).is_some());cards.push(Carta::new("j",0,None,true));assert!(valida_combinazione(&cards).is_none());}
 #[test] fn fixed_one_to_five(){for n in 1..=5{let mut p=game();p.stato.limite_smazzate=Some(n);for i in 0..n {p.stato.pozzetto_preso=vec![true,true];p.stato.chiusa_da=Some(0);p.stato.mani=rep_vec(4,Vec::new());p.stato.totali=vec![10000,0,0,0];calcola_punteggi(&mut p.stato,&p.squadre,4,p.target);assert_eq!(p.stato.partita_finita,i==n-1);assert_eq!(p.smazzata_successiva(),i==n-1);}assert_eq!(p.stato.vincitore,Some(0));}}
 #[test] fn draw_and_cancelled(){let mut p=game();p.stato.limite_smazzate=Some(1);calcola_punteggi(&mut p.stato,&p.squadre,4,p.target);assert_eq!(p.stato.storico.len(),0);assert!(!p.smazzata_successiva());p.stato.pozzetto_preso=vec![true,true];p.stato.mani=rep_vec(4,Vec::new());calcola_punteggi(&mut p.stato,&p.squadre,4,p.target);assert!(p.stato.partita_finita);assert_eq!(p.stato.vincitore,None);assert!(p.smazzata_successiva());assert_eq!(p.public_state(0)["pareggio"],true);}
 #[test] fn duplicate_partner_group_blocked(){let mut p=game();p.stato.turno=2;p.stato.fase=Fase::Gioco;p.stato.mani[2]=vec![c("a",1,Seme::Cuori),c("b",1,Seme::Picche),c("c",1,Seme::Quadri),c("keep",9,Seme::Cuori)];p.cala(&["a".into(),"b".into(),"c".into()]).unwrap();p.stato.turno=0;p.stato.mani[0]=vec![c("d",1,Seme::Cuori),c("e",1,Seme::Picche),c("f",1,Seme::Fiori),c("stay",10,Seme::Cuori)];let ids=vec!["d".into(),"e".into(),"f".into()];assert!(!p.cala_ammissibile(0,&p.stato.mani[0][0..3]));assert!(p.cala(&ids).is_err());p.lega_molte(0,&ids,2).unwrap();assert_eq!(p.stato.melds[2][0].slots.len(),6);}
}
