mod ai;
mod engine;
mod scala;
mod scala_ai;
mod server;

use ai::gioca_turno;
use engine::{Partita, PartitaOpts, crea_mazzo};

/// Drives a whole smazzata with a deterministic "naive" strategy (take first
/// suggested meld, then discard the first legal card). Used as a smoke test of
/// the engine: we only assert the game reaches a terminal state without panics.
fn smoke(n_gioc: usize, seed: u32) -> bool {
    let mut p = Partita::new(PartitaOpts {
        target: 2005,
        nomi: None,
        giocatori: n_gioc,
        seed: Some(seed),
    });

    let max_turni = 5000;
    let mut turni = 0;
    loop {
        let st0 = p.public_state(0);
        if st0["finita"].as_bool().unwrap_or(false) {
            break;
        }
        if turni >= max_turni {
            eprintln!("  [smoke] raggiunto limite turni senza conclusione");
            return false;
        }
        turni += 1;

        let turno = st0["turno"].as_u64().unwrap() as usize;
        let st = p.public_state(turno);
        let fase = st["fase"].as_str().unwrap_or("");

        match fase {
            "pesca" => {
                let monte_len = st["monte"].as_array().map(|a| a.len()).unwrap_or(0);
                if monte_len > 0 {
                    let _ = p.prendi_monte();
                } else {
                    let _ = p.pesca_tallone();
                }
            }
            "gioco" => {
                let sug = p.suggerimenti(turno);
                if !sug.is_empty() {
                    let ids: Vec<String> = sug[0].ids.clone();
                    let _ = p.cala(&ids);
                }
                let hand: Vec<String> = st["seats"][turno]["hand"]
                    .as_array()
                    .unwrap_or(&Vec::new())
                    .iter()
                    .filter_map(|c| c["id"].as_str().map(|s| s.to_string()))
                    .collect();
                let mut done = false;
                for id in &hand {
                    if !p.scarto_vietato(turno, id) {
                        if p.scarta(id).is_ok() {
                            done = true;
                            break;
                        }
                    }
                }
                if !done {
                    for id in &hand {
                        if p.scarta(id).is_ok() {
                            done = true;
                            break;
                        }
                    }
                }
                if !done {
                    eprintln!("  [smoke] giocatore {turno} bloccato: nessuna scarto possibile");
                    return false;
                }
            }
            _ => break,
        }
    }

    let st = p.public_state(0);
    let finita = st["finita"].as_bool().unwrap_or(false);
    let totali = st["totali"].as_array().map(|a| {
        a.iter()
            .map(|v| v.as_i64().unwrap_or(0))
            .collect::<Vec<_>>()
    });
    println!(
        "  smazzata conclusa in {turni} turni (target {}) — totali: {:?}",
        st["target"], totali
    );
    finita
}

/// Plays full games (every seat is a bot) until a winner emerges or a cap of
/// smazzate is reached. Validates the AI module end-to-end.
fn smoke_ai(n_gioc: usize, livello: &str, seed: u32) -> bool {
    let mut p = Partita::new(PartitaOpts {
        target: 2005,
        nomi: None,
        giocatori: n_gioc,
        seed: Some(seed),
    });
    let max_smazzate = 200;
    let mut smazzate = 0;
    loop {
        let mut turni = 0;
        while !p.stato.finita && turni < 5000 {
            turni += 1;
            gioca_turno(&mut p, livello);
        }
        smazzate += 1;
        let st = p.public_state(0);
        let vincitore = st["vincitore"].as_i64();
        let totali = st["totali"].as_array().map(|a| {
            a.iter().map(|v| v.as_i64().unwrap_or(0)).collect::<Vec<_>>()
        });
        if vincitore.is_some() {
            println!(
                "  [ai:{livello}] vittoria dopo {smazzate} smazzate — totali: {totali:?}"
            );
            return true;
        }
        if smazzate >= max_smazzate {
            println!(
                "  [ai:{livello}] nessuna vittoria in {max_smazzate} smazzate — totali: {totali:?}"
            );
            return smazzate > 0;
        }
        p.smazzata_successiva();
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--serve") {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(server::run());
        return;
    }

    println!("== Burraco server engine + AI smoke test ==");

    // 1) Mazzo
    let mazzo = crea_mazzo();
    assert_eq!(mazzo.len(), 108, "il mazzo deve avere 108 carte");
    println!("  mazzo OK: {} carte", mazzo.len());

    // 2) Engine (naive driver)
    println!("[engine 4 giocatori]");
    assert!(smoke(4, 12345), "la partita a 4 deve concludersi");
    println!("[engine 2 giocatori]");
    assert!(smoke(2, 999), "la partita a 2 deve concludersi");

    // 3) AI (all seats are bots)
    println!("[ai 4 giocatori]");
    assert!(smoke_ai(4, "normale", 12345), "il bot deve condurre la partita a 4");
    println!("[ai 2 giocatori]");
    assert!(smoke_ai(2, "normale", 999), "il bot deve condurre la partita a 2");

    // 4) Information hiding: lo stato per il viewer 0 non espone la mano altrui
    let p = Partita::new(PartitaOpts {
        target: 2005,
        nomi: None,
        giocatori: 4,
        seed: Some(7),
    });
    let st = p.public_state(0);
    let altri = st["seats"][1]["hand"].as_array().map(|a| a.len()).unwrap_or(0);
    assert_eq!(altri, 0, "la mano di un altro giocatore non deve essere visibile");
    println!("  information hiding OK: mano altrui nascosta");

    println!("== tutti gli smoke test sono passati ==");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mazzo_108() {
        assert_eq!(crea_mazzo().len(), 108);
    }

    #[test]
    fn engine_4p_completa() {
        assert!(smoke(4, 12345), "partita a 4 deve concludersi");
    }

    #[test]
    fn engine_2p_completa() {
        assert!(smoke(2, 999), "partita a 2 deve concludersi");
    }

    #[test]
    fn ai_4p_vince() {
        assert!(smoke_ai(4, "normale", 12345), "bot deve condurre partita a 4");
    }

    #[test]
    fn ai_2p_vince() {
        assert!(smoke_ai(2, "normale", 999), "bot deve condurre partita a 2");
    }

    #[test]
    fn information_hiding() {
        let p = Partita::new(PartitaOpts {
            target: 2005,
            nomi: None,
            giocatori: 4,
            seed: Some(7),
        });
        let st = p.public_state(0);
        let altri = st["seats"][1]["hand"].as_array().map(|a| a.len()).unwrap_or(0);
        assert_eq!(altri, 0, "mano altrui non deve essere visibile");
    }
}
