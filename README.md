# Giochi di Carte Italiani 🃏

Burraco · Briscola · Scopa — contro il computer (Single Player) o contro un avversario reale (Multiplayer P2P).

Sito web **reattivo (mobile-first)** in Vanilla HTML5, CSS3 e JavaScript (ES6, OOP), con infrastruttura **a costo zero**:

- **Nessun server di gioco**: il multiplayer usa WebRTC (PeerJS) con connessioni **P2P** dirette tra i browser via DataChannel.
- **Signaling gratuito**: cloud pubblico di PeerJS, usato solo per lo scambio iniziale degli ID (niente chiavi, niente abbonamenti).
- **IA locale**: il Single Player gira interamente nel tuo browser.
- **Mazzi di tutta Italia**: napoletane, piacentine, sarde, siciliane, trevisane, bergamasche, bresciane, bolognesi, genovesi, toscane — renderizzati in puro CSS.

## Struttura

```
├─ index.html      Dashboard: scelta gioco → mazzo → modalità (Bot/P2P) → stanza P2P
├─ game.html       Tavolo da gioco universale
├─ css/style.css   Tappeto verde, carte responsive, flip 3D, animazioni
├─ burraco/        Burraco completo, pagina autonoma (vedi burraco/README.md)
└─ js/
   ├─ network.js   WebRTC / PeerJS (initPeer, connectToPeer, broadcastGameState, handleIncomingData)
   ├─ engine.js    Carta, Mazzo (Fisher-Yates), GiocoBase → Scopa, Briscola
   ├─ bot.js       Intelligenza artificiale locale (mossaBotScopa/Briscola/Burraco)
   └─ ui.js        Rendering DOM, animaSpostamento, Controller
```

### Il Burraco è una pagina a sé

La carta **Burraco** della dashboard porta su `burraco/index.html`, un gioco autonomo
riscritto da zero sul regolamento F.I.Bur.: motore delle regole separato e testato
(149 controlli), avversario a tre livelli, trascinamento delle carte fra le
combinazioni, combinazioni impilate in verticale con la carta di traverso sul
burraco, punteggi a 505 / 1005 / 2005. Scopa e Briscola restano su `game.html`.

Non tocca `js/engine.js`, `js/ui.js` né le variabili globali del sito: i nomi sono
distinti (`BurracoEngine`, `BurracoAI`, `__burraco`), quindi i tre giochi convivono
senza interferenze.

## Gioca

Apri `index.html` in un browser oppure usa l'URL di Vercel.

Il multiplayer P2P richiede che entrambi i giocatori siano raggiungibili (NAT semplici): l'host condivide il **codice stanza**, il guest lo inserisce e si connette direttamente.

## Test

Il motore regole è verificato con suite Node (Fisher-Yates, prese Scopa, dominanza Briscola, validazione combinazioni Burraco, endgame e punteggi).