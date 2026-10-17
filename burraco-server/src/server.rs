/* =========================================================================
 * server.rs — Hub WebSocket per le sessioni online del Burraco
 *
 * Architettura server-authoritative: il server è l'unica fonte di verità.
 * - Ogni stanza (`Room`) contiene una `Partita` e gli `UnboundedSender` dei
 *   posti occupati dagli umani. I rimanenti posti sono giocati dal bot.
 * - Il client invia solo azioni (`pesca`/`cala`/`lega`/`scarta`/`next`);
 *   il server le applica al motore, fa giocare i bot a cui tocca, e trasmette
 *   a ciascun umano lo `public_state` filtrato per lui (mano altrui nascosta).
 *
 * Flusso:
 *   GET /ws            -> crea una stanza (4 giocatori: 2 umani + 2 bot) e
 *                         assegna il primo posto umano, ritorna il codice.
 *   GET /ws?room=CODE  -> entra in una stanza esistente ( secondo posto umano ).
 * ========================================================================= */

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::mpsc::unbounded_channel;

use crate::ai;
use crate::engine::{Partita, PartitaOpts};

type Tx = tokio::sync::mpsc::UnboundedSender<String>;
type RoomMap = Mutex<HashMap<String, Arc<Room>>>;

/// Una stanza di gioco. I posti in `human_seats` vanno riempiti con WS umani;
/// gli altri sono pilotati dal bot.
pub struct Room {
    pub n_gioc: usize,
    pub human_seats: Vec<usize>,
    pub livello: String,
    partita: Mutex<Partita>,
    senders: Mutex<HashMap<usize, Tx>>,
    started: Mutex<bool>,
}

impl Room {
    fn new(n_gioc: usize, livello: &str) -> Room {
        let human_seats = if n_gioc == 4 { vec![0, 2] } else { vec![0] };
        Room {
            n_gioc,
            human_seats: human_seats.clone(),
            livello: livello.to_string(),
            partita: Mutex::new(Partita::new(PartitaOpts {
                target: 2005,
                nomi: None,
                giocatori: n_gioc,
                seed: Some(rand::random::<u32>()),
            })),
            senders: Mutex::new(HashMap::new()),
            started: Mutex::new(false),
        }
    }

    fn assign_seat(&self) -> Option<usize> {
        let occ: std::collections::HashSet<usize> =
            self.senders.lock().unwrap().keys().cloned().collect();
        self.human_seats.iter().find(|s| !occ.contains(s)).copied()
    }

    fn is_full(&self) -> bool {
        let occ: std::collections::HashSet<usize> =
            self.senders.lock().unwrap().keys().cloned().collect();
        self.human_seats.iter().all(|s| occ.contains(s))
    }

    /// Applica (se fornita) l'azione di un umano, fa giocare i bot a cui tocca,
    /// e trasmette lo stato a ogni umano connesso.
    fn step(&self, actor: Option<(usize, &Value)>) -> Result<(), String> {
        let mut p = self.partita.lock().unwrap();
        if let Some((seat, act)) = actor {
            let tipo = act["tipo"].as_str().unwrap_or("");
            if tipo != "next" && p.stato.turno != seat {
                return Err("Non è il tuo turno".into());
            }
            apply_action(&mut p, act)?;
        }
        if !p.stato.finita {
            loop {
                let t = p.stato.turno;
                if self.human_seats.contains(&t) {
                    break;
                }
                ai::gioca_turno(&mut p, &self.livello);
            }
        }
        let senders = self.senders.lock().unwrap();
        for &seat in &self.human_seats {
            if let Some(tx) = senders.get(&seat) {
                let s = p.public_state(seat);
                let _ = tx.send(json!({ "type": "state", "state": s }).to_string());
            }
        }
        Ok(())
    }
}

fn apply_action(p: &mut Partita, act: &Value) -> Result<(), String> {
    let tipo = act["tipo"].as_str().ok_or("azione senza tipo")?;
    match tipo {
        "pesca" => {
            let sorg = act["sorgente"].as_str().unwrap_or("tallone");
            if sorg == "monte" {
                p.prendi_monte()
            } else {
                p.pesca_tallone()
            }
        }
        "cala" => {
            let ids: Vec<String> = act["ids"]
                .as_array()
                .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
                .ok_or("ids mancanti")?;
            p.cala(&ids)
        }
        "lega" => {
            let indice = act["indice"].as_u64().ok_or("indice mancante")? as usize;
            let id = act["id"].as_str().ok_or("id mancante")?.to_string();
            p.lega(indice, &id)
        }
        "scarta" => {
            let id = act["id"].as_str().ok_or("id mancante")?.to_string();
            p.scarta(&id)
        }
        "next" => {
            p.smazzata_successiva();
            Ok(())
        }
        _ => Err(format!("azione sconosciuta: {tipo}")),
    }
}

fn gen_code(map: &mut HashMap<String, Arc<Room>>) -> String {
    loop {
        let c = format!("{:04X}", rand::random::<u16>());
        if !map.contains_key(&c) {
            return c;
        }
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
    State(rooms): State<Arc<RoomMap>>,
) -> Response {
    let room_code = params.get("room").cloned();
    // Risolve/crea la stanza e RILASCIA il lock PRIMA di on_upgrade
    // (il MutexGuard non è Send oltre un await).
    let resolved: Result<(Arc<Room>, String), String> = {
        let mut map = rooms.lock().unwrap();
        match &room_code {
            None => {
                let code = gen_code(&mut map);
                let r = Arc::new(Room::new(4, "normale"));
                map.insert(code.clone(), r.clone());
                Ok((r, code))
            }
            Some(c) => match map.get(c) {
                Some(r) => Ok((r.clone(), c.clone())),
                None => Err("Stanza inesistente".into()),
            },
        }
    };
    ws.on_upgrade(move |socket| handle_socket(socket, resolved))
}

async fn handle_socket(socket: WebSocket, resolved: Result<(Arc<Room>, String), String>) {
    let (room, code) = match resolved {
        Ok(v) => v,
        Err(msg) => {
            let (mut s, _) = socket.split();
            let _ = s
                .send(Message::Text(
                    json!({ "type": "error", "msg": msg }).to_string().into(),
                ))
                .await;
            let _ = s.close().await;
            return;
        }
    };
    let (mut sender_ws, mut receiver_ws) = socket.split();

    // Stanza piena?
    let full = room.senders.lock().unwrap().len() >= room.human_seats.len();
    if full {
        let _ = sender_ws
            .send(Message::Text(
                json!({ "type": "error", "msg": "Stanza piena" }).to_string().into(),
            ))
            .await;
        return;
    }

    let seat = room.assign_seat().unwrap_or(0);
    let (tx, mut rx) = unbounded_channel::<String>();
    room.senders.lock().unwrap().insert(seat, tx);

    // Task che pompa i messaggi del canale verso il socket WebSocket.
    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender_ws.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Benvenuto.
    if let Some(tx) = room.senders.lock().unwrap().get(&seat) {
        let _ = tx.send(
            json!({
                "type": "welcome",
                "room": code,
                "seat": seat,
                "nGioc": room.n_gioc,
                "humanSeats": room.human_seats,
                "started": *room.started.lock().unwrap(),
            })
            .to_string(),
        );
    }

    // Se la stanza è completa, avvia la partita (eventuali turni iniziali dei bot).
    let mut start = false;
    {
        let mut started = room.started.lock().unwrap();
        if !*started && room.is_full() {
            *started = true;
            start = true;
        }
    }
    if start {
        let _ = room.step(None);
    } else if let Some(tx) = room.senders.lock().unwrap().get(&seat) {
        let _ = tx.send(
            json!({ "type": "waiting", "msg": "In attesa di un altro giocatore…" }).to_string(),
        );
    }

    // Loop di ricezione dei comandi dal client.
    while let Some(Ok(msg)) = receiver_ws.next().await {
        match msg {
            Message::Text(text) => {
                let s = String::from_utf8_lossy(text.as_ref()).to_string();
                if let Ok(v) = serde_json::from_str::<Value>(&s) {
                    if v["type"].as_str() == Some("action") {
                        if let Some(act) = v.get("action") {
                            if let Err(e) = room.step(Some((seat, act))) {
                                if let Some(tx) = room.senders.lock().unwrap().get(&seat) {
                                    let _ = tx.send(
                                        json!({ "type": "error", "msg": e }).to_string(),
                                    );
                                }
                            }
                        }
                    }
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    room.senders.lock().unwrap().remove(&seat);
    send_task.abort();
}

const INDEX_HTML: &str = r#"<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Burraco online (Rust)</title>
<style>
  body{font-family:system-ui,Arial,sans-serif;background:#0b3d2e;color:#eee;margin:0;padding:16px}
  h1{font-size:18px}
  button{background:#1b6e4f;color:#fff;border:0;border-radius:8px;padding:10px 14px;margin:4px;cursor:pointer;font-size:14px}
  button:disabled{opacity:.4;cursor:default}
  #status{margin:8px 0;font-weight:600}
  .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}
  .card{background:#fff;color:#111;border-radius:6px;padding:4px 8px;min-width:34px;text-align:center;cursor:pointer;border:2px solid transparent}
  .card.sel{border-color:#ffd34d}
  .matta{background:#2b2b3a;color:#fff}
  pre{background:#062b20;padding:10px;border-radius:8px;overflow:auto;max-height:240px;font-size:11px}
  table{border-collapse:collapse;margin:6px 0}
  td,th{border:1px solid #2c6b54;padding:3px 6px;font-size:12px}
</style></head><body>
<h1>Burraco online — server Rust</h1>
<div class="row">
  <button id="btnCrea" onclick="crea()">Crea partita</button>
  <button id="btnEntra" onclick="entra()">Entra con codice</button>
  <button id="btnPt" onclick="pesca('tallone')">Pesca tallone</button>
  <button id="btnPm" onclick="pesca('monte')">Pesca monte</button>
  <button id="btnCala" onclick="calaSel()" disabled>Cala</button>
  <button id="btnScarta" onclick="scartaSel()" disabled>Scarta</button>
  <button id="btnNext" onclick='act({tipo:"next"})' style="display:none">Smazzata successiva</button>
</div>
<div id="status">Premi «Crea partita» per iniziare, poi condividi il codice.</div>
<div class="row" id="hand"></div>
<div class="row" id="board"></div>
<pre id="json"></pre>
<script>
let ws, seat=-1, roomCode='', sel=new Set(), last=null;
const $=id=>document.getElementById(id);
function crea(){ open(null); }
function entra(){ const c=prompt("Codice stanza?"); if(c) open(c.toUpperCase()); }
function open(room){
  const url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws'+(room?('?room='+room):'');
  ws=new WebSocket(url);
  ws.onmessage=e=>handle(JSON.parse(e.data));
  ws.onclose=()=>status('Connessione chiusa');
}
function status(t){ $('status').textContent=t; }
function handle(m){
  if(m.type==='welcome'){ seat=m.seat; roomCode=m.room; status('Stanza '+m.room+' — sei il giocatore '+seat+' (di '+m.nGioc+')'); }
  else if(m.type==='waiting'){ status('Stanza '+roomCode+' — '+m.msg); }
  else if(m.type==='state'){ last=m.state; sel.clear(); render(last); }
  else if(m.type==='error'){ status('Errore: '+m.msg); }
}
function myTurn(){ return last && last.turno===seat && last.fase!=='fine' && !last.finita; }
function render(st){
  $('json').textContent=JSON.stringify(st,null,1);
  const me=st.seats[seat];
  // mano
  const hand=$('hand'); hand.innerHTML='';
  for(const c of me.hand){
    const d=document.createElement('div');
    d.className='card'+(c.jolly?' matta':'')+(sel.has(c.id)?' sel':'');
    d.textContent=c.etichetta;
    d.onclick=()=>{ if(sel.has(c.id)) sel.delete(c.id); else sel.add(c.id); render(last); };
    hand.appendChild(d);
  }
  // stato bottoni azione
  const puoPescare = st.fase==='pesca' && myTurn();
  $('btnPt').disabled = !puoPescare;
  $('btnPm').disabled = !(puoPescare && st.monte.length>0);
  $('btnCala').disabled = !(st.fase==='gioco' && myTurn() && sel.size>=3);
  $('btnScarta').disabled = !(st.fase==='gioco' && myTurn() && sel.size===1);
  // tabella riepilogo
  const board=$('board'); board.innerHTML='';
  const t=document.createElement('table');
  for(const s of st.seats){
    const tr=document.createElement('tr');
    tr.innerHTML='<th>P'+s.seat+' ('+s.team+')</th><td>mano:'+s.handCount+'</td><td>burrachi:'+s.burrachi+'</td><td>melds:'+s.melds.length+'</td>';
    t.appendChild(tr);
  }
  const tr=document.createElement('tr');
  tr.innerHTML='<th>Turno</th><td>'+st.turno+(myTurn()?' (TUO)':'')+'</td><th>Tallone</th><td>'+st.talloneCount+'</td><th>Monte</th><td>'+st.monte.length+'</td>';
  t.appendChild(tr);
  const tr2=document.createElement('tr');
  tr2.innerHTML='<th>Totali squadra</th><td>'+JSON.stringify(st.totaliSquadra)+'</td><th>Fase</th><td>'+st.fase+'</td>';
  t.appendChild(tr2);
  board.appendChild(t);
  // le mie combinazioni (cliccabili per legare se 1 carta selezionata)
  const mt=document.createElement('div');
  mt.innerHTML='<b>Le tue combinazioni</b> — seleziona 1 carta e clicca una per legare:';
  for(let i=0;i<me.melds.length;i++){
    const m=me.melds[i];
    const b=document.createElement('button');
    const desc=m.slots.map(s=>s.carta.etichetta).join(' ')+(m.burraco?' ★BURRACO':'');
    b.textContent='#'+i+' '+desc;
    b.disabled=!(st.fase==='gioco' && myTurn() && sel.size===1);
    b.onclick=()=>{ const id=[...sel][0]; act({tipo:'lega',indice:i,id}); };
    mt.appendChild(b);
  }
  board.appendChild(mt);
  $('btnNext').style.display=(st.finita && st.vincitore==null)?'inline-block':'none';
}
function pesca(s){ act({tipo:'pesca',sorgente:s}); }
function calaSel(){ if(sel.size>=3){ act({tipo:'cala',ids:[...sel]}); } }
function scartaSel(){ if(sel.size===1){ act({tipo:'scarta',id:[...sel][0]}); } }
function act(obj){ if(ws&&ws.readyState===1) ws.send(JSON.stringify({type:'action',action:obj})); }
</script>
</body></html>"#;

async fn index() -> impl IntoResponse {
    Html(INDEX_HTML)
}

/// Avvia il server (chiamato da `main` con `--serve`).
pub async fn run() {
    let rooms: Arc<RoomMap> = Arc::new(RoomMap::new(HashMap::new()));
    let app = Router::new()
        .route("/", get(index))
        .route("/healthz", get(|| async { (StatusCode::OK, "ok") }))
        .route("/favicon.ico", get(|| async { (StatusCode::NO_CONTENT, "") }))
        .route("/ws", get(ws_handler))
        .with_state(rooms);

    // Render/Fly/Koyeb espongono la porta tramite $PORT; resta possibile
    // sovrascrivere con BURRACO_ADDR per test in locale.
    let addr = if let Ok(a) = std::env::var("BURRACO_ADDR") {
        a
    } else if let Ok(port) = std::env::var("PORT") {
        format!("0.0.0.0:{port}")
    } else {
        "0.0.0.0:3000".into()
    };
    println!("Burraco server in ascolto su http://{addr}  (WebSocket: ws://{addr}/ws)");
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
