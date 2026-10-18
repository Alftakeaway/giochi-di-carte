# Burraco — gioco completo

Gioco del Burraco con regolamento italiano (F.I.Bur.), riscritto da zero.
Nessuna dipendenza esterna, nessun server: sono solo file statici.

## Come si apre

Apri `index.html` nel browser. Funziona anche da `file://`, senza installare nulla.

## Cosa c'è dentro

```
index.html              schermata iniziale + tavolo + overlay (regole, fine mano, menu)
css/burraco.css         tutto lo stile
js/burraco-engine.js    motore delle regole (puro, senza DOM)
js/burraco-ai.js        avversario automatico (3 livelli)
js/burraco-ui.js        interfaccia e interazione
test/                   test automatici e schermate
```

L'ordine degli script è importante: `engine` → `ai` → `ui`.

## Regolamento implementato

| Regola | Implementazione |
|---|---|
| Mazzo | 2 mazzi francesi da 52 + 4 jolly = 108 carte |
| Distribuzione | 11 carte a testa, 2 pozzetti da 11, 1 carta scoperta sul monte |
| Turno | pesca dal tallone **o** raccogli il monte → cala/lega → scarta |
| Gruppi | ≥ 3 carte dello stesso valore, max 2 per seme, max 1 matta, mai gruppi di soli 2 |
| Sequenze | ≥ 3 carte consecutive dello stesso seme, max 1 matta (2 con la pinella naturale del seme) |
| Matte | jolly e pinelle; mai rimosse: se possiedi la carta naturale **sostituisci** e la matta si sposta all'estremità |
| Burraco | 7+ carte: **pulito +200**, **semipulito +150** (solo pinelle, nessun jolly), **sporco +100** (con jolly) |
| Spostamenti | una carta può passare da una combinazione all'altra: la partenza deve restare valida e con ≥ 3 carte, un burraco non si scompone |
| Pozzetto | preso a mano vuota, «in diretta» (calando) o «con lo scarto» |
| Chiusura | ultima carta scartata non matta, con burraco fatto e pozzetto preso, +100 |
| Monte di 1 carta | non può essere riscartato nello stesso turno |
| Fine senza chiusura | quando restano 2 carte nel tallone; se nessuno ha preso il pozzetto la smazzata si ripete |
| Punteggi | Jolly 30, Pinella 20, Asso 15, figure e 8-10 10, dal 3 al 7 5 |
| Penalità | −100 pozzetto non preso, carte in mano sottratte a chi non chiude |
| Partita | a 505 / 1005 / 2005 punti |

## Disposizione del tavolo

Tallone e monte stanno **al centro del tavolo**, tra le combinazioni dei due
giocatori:

```
┌──────────────────────────────────────────────┐
│  COMPUTER  ·  carte in mano (coperte)        │
│ ┌───────────────┐ ┌────────┐ ┌─────────────┐ │
│ │ le sue        │ │TALLONE │ │ le tue      │ │
│ │ combinazioni  │ │ MONTE  │ │ combinazioni│ │
│ └───────────────┘ └────────┘ └─────────────┘ │
│  LA TUA MANO  ·  comandi                     │
└──────────────────────────────────────────────┘
```

Prima i mazzetti stavano in una fascia orizzontale in mezzo alle giocate, con
il registro a destra: lì si incastrava tutto e il resto del tavolo restava
verde e vuoto. Mettendoli al centro, ogni giocatore ha una **colonna intera**
di altezza, e su un portatile da 15,6" ci stanno due pile complete senza
scorrere niente. Sui telefoni le tre colonne si impilano una sotto l'altra.

## Interfaccia

- **Trascina una carta** dalla mano a una combinazione per attaccarla, o da una
  combinazione a un'altra per spostarla: se ci entra viene integrata subito e i
  punti delle due combinazioni si aggiornano. Le combinazioni che possono
  riceverla si illuminano durante il trascinamento; quella di partenza resta
  segnata con un bordo tratteggiato.
- Stesso risultato **senza trascinare** (comodo sul telefono): tocca la carta
  dentro la combinazione, poi tocca la combinazione di destinazione. `Esc` o un
  nuovo tocco sulla stessa carta annullano.
- Tocca una carta in mano per selezionarla.
- **3 o più carte** selezionate → il pulsante **Cala** si attiva e una riga ti dice se la combinazione è valida (tipo, punti, eventuale burraco e di che tipo).
- **1 carta** selezionata → le tue combinazioni a cui può essere attaccata si illuminano: toccale per legarla.
- **1 carta** selezionata → **Scarta** (diventa **Chiudi la smazzata** quando chiudere è possibile).
- **Suggerisci** seleziona la miglior combinazione calabile con le carte che hai.
- Si può pescare anche toccando direttamente il tallone o il monte.
- La mano si **ordina da sola**: le carte che formano già un tris o una scala
  stanno vicine, in blocchi separati, con un filetto colorato in alto; le carte
  sciolte restano in fondo.
- In alto a destra della mano ci sono tre comandi con un clic:
  **Combinazioni** (default), **Numero** (dall'asso al re) e **Seme**.
- Le carte disegnano il **numero in grande due volte** — in alto a sinistra e
  in basso a destra a testa in giù, come nelle carte da poker — così il valore
  si legge da qualsiasi verso si tenga la carta. Il seme sta al centro, bello
  grande, e non viene ripetuto negli angoli: lo spazio guadagnato va al numero.
- Le carte sono state **ingrandite del 20%** (62→74 px su schermo grande,
  50→60 sui portatili, 44→53 sui telefoni): con più cose disegnate dentro,
  numero, segni e seme non si toccano — come in un mazzo vero, dove gli angoli
  e il centro restano ben separati.
- Le **pinelle** portano agli angoli il segno del jolly — in alto a destra e in
  basso a sinistra a testa in giù — **nero o rosso secondo il seme**, come nelle
  carte italiane. I **jolly** hanno lo stesso segno ma colorato (viola e oro): la
  corona in alto, la scritta JOLLY subito sotto e sopra il segno in basso, così
  non si coprono a vicenda. Il bollino «MATTA» è stato eliminato: copriva il
  numero e non serviva, il segno agli angoli dice già tutto.
- Le combinazioni sono **impilate in verticale** e di ogni carta resta visibile
  la striscia in alto con valore e seme. Nel burraco la prima carta è messa
  **di traverso in basso**; un timbro dice se è `PULITO`, `SEMIPULITO` o `SPORCO`.
- Il tavolo si adatta all'altezza dello schermo: su un portatile 1366×768 le
  carte rimpiccioliscono quel tanto che basta per far vedere tutto senza
  scorrere; sotto i 620 px di altezza la pagina scorre e la mano resta ancorata.
- La barra delle azioni ha **altezza fissa**: l'esito della selezione compare in
  basso a sinistra, fuori dal flusso, così a ogni pescata la mano non salta.
  Sul telefono i pulsanti stanno su una riga sola e, se non entrano, si
  scorrono di lato.
- Le matte calate mostrano al centro il valore che rappresentano (es. `J ♥`), così
  la sequenza si legge a colpo d'occhio; il filetto viola e lo sfondo lilla
  ricordano che la carta è un jolly o una pinella.

## Test

```bash
node test/engine.test.js        # regole, punteggi, casi limite (149 controlli)
node test/simulazione.test.js   # 200 partite AI vs AI, invarianti su ogni smazzata
node test/browser.test.js       # gioca partite vere in Chromium (richiede playwright-core)
node test/chiusura.test.js      # chiusura end-to-end: click reali e punti assegnati
node test/drag.test.js          # trascinamento, pile verticali, tre tipi di burraco (44 controlli)
node test/layout.test.js        # niente tagliato sui laptop: didascalie, combinazioni, ordinamento, carte, mano che non salta, numero in basso a destra, niente che si tocca (81 controlli)
node test/dettaglio.js          # primo piano delle carte (solo controllo visivo)
node test/anteprima.js          # schermate del tavolo (solo controllo visivo)
```

I test del browser hanno bisogno di `playwright-core` e di un Chromium locale:

```bash
NODE_PATH=<workspace>/node_modules node test/drag.test.js
```

La simulazione verifica a ogni smazzata che: le 108 carte siano sempre tutte
tracciate, nessuna carta sia duplicata, ogni combinazione calata resti valida,
i punteggi tornino con il dettaglio mostrato e i totali con lo storico.

I test del browser cliccano e trascinano la vera interfaccia (non chiamano il
motore): sono quelli che hanno scoperto i difetti invisibili ai test unitari —
la schermata iniziale che intercettava i click, il pulsante «Cala» attivo su
mosse che il motore avrebbe rifiutato, gli avvisi che coprivano le carte, il
clic che scattava anche dopo un trascinamento, le scritte Tallone/Monte tagliate
sui portatili.

Ultimo esito: 149/149 controlli sul motore, 400 partite simulate senza errori,
14/14 sulla chiusura, 44/44 sul trascinamento e sui burraco, 38/38 sul layout,
0 errori in console nel browser.

## Integrazione nel sito esistente

Il gioco è isolato: per aggiungerlo al sito `giochi-di-carte.vercel.app` basta
copiare la cartella e collegarla dalla dashboard.

```html
<!-- nella dashboard, al posto del collegamento a game.html?gioco=burraco -->
<a href="burraco/index.html">Burraco</a>
```

Se preferisci tenerlo sulla stessa pagina `game.html`, carica i tre script e
istanzia il gioco:

```html
<script src="js/burraco-engine.js"></script>
<script src="js/burraco-ai.js"></script>
<script src="js/burraco-ui.js"></script>
```

I file non toccano `window.MAZZI_ITALIANI`, `engine.js` o `ui.js` del sito
originale: nomi e variabili globali sono distinti (`BurracoEngine`,
`BurracoAI`, `__burraco`), quindi Scopa e Briscola continuano a funzionare.

## Note tecniche

- Il motore è deterministico se gli si passa un `seed`: `new BurracoEngine.Partita({ seed: 42 })`.
- Tutta la logica di regole vive nel motore: l'interfaccia non prende mai
  decisioni, si limita a chiamare metodi e a mostrare lo stato. Per questo i
  test possono giocare migliaia di partite senza browser.
- `window.__burraco` espone lo stato per il debug dalla console.


## Posti umani e computer (rilascio preparato)

Tavoli da 2 o 4 posti. A quattro, squadra A = posti 1 e 3, squadra B = posti 2 e 4.
Il primo posto è umano; ogni altro posto si può impostare come umano o computer.
Sono disponibili tutte le 10 configurazioni, incluse coppie di umani avversari,
3 umani + 1 PC e 4 umani. Non è inclusa la variante a 3 posti.

Sul medesimo dispositivo scegliere «Umani e computer». Al cambio fra umani
un pannello nasconde la mano finché il dispositivo non è stato consegnato.
Online il creatore sceglie i posti e condivide il codice. Gli umani entrano
nell'ordine dei posti configurati; il server attende che siano tutti presenti.
I restanti posti sono controllati dal computer. Le mani avversarie sono filtrate
sul server. Le nuove configurazioni richiedono /capabilities versione 2;
il vecchio server continua a supportare la configurazione originale.

Test nuovi: mixed-local.test.cjs, mixed-online.test.cjs (richiede server locale
127.0.0.1:3150 e frontend 127.0.0.1:3140). I test online provano tutte le
composizioni con browser separati e un giro completo di turni.

Il rilascio del backend richiede un riavvio Render: le stanze attive sono in
memoria e vanno perse. Pubblicare solo dopo conferma e a partite concluse.
Dockerfile, dipendenze, porte e protocollo delle azioni sono invariati.


### Giochi del compagno e ultima carta

Lega accetta una destinazione facoltativa `proprietario` (indice del posto).
Se omessa mantiene il comportamento precedente; il motore verifica che il
proprietario sia della stessa squadra. Le carte restano nelle combinazioni
del compagno, mentre vengono rimosse dalla mano del giocatore di turno.
Burraco e chiusura sono valutati per squadra, senza duplicare i punti dei giochi.
Il client attende il supporto `teamMelds` del server prima di inviare una
destinazione diversa dal proprio posto. Test: team-rules.test.cjs,
team-ui.test.cjs e test Rust per motore e comando ricevuto dal server.

La pesca dipende dalla fase del turno, non dal numero di carte. I test riproducono
il cambio 4→1 con una sola carta: entrambe le fonti di pesca funzionano e lo
scarto è disabilitato prima della pesca. Il blocco segnalato con una sola carta
non è stato riprodotto nella versione corrente; nessuna pesca aggiuntiva è
abilitata dopo aver già pescato nello stesso turno.


### Asso alto, legature multiple e pinelle visibili

Q-K-A è valido; A-2-…-K-A è vietato, così come una sequenza oltre 13 carte.
L’asso alto usa internamente lo slot 14 ma rimane fisicamente un asso da 15 punti.
Lega accetta `ids` per una mossa con più carte: il motore cerca un ordine valido,
valuta la mano residua e applica la mossa solo dopo aver validato tutto. Nessuna
carta si sposta se la mossa complessiva non è valida. Il precedente campo `id`
rimane compatibile. Il client richiede `multiAttach` prima di inviare più carte.
Pinelle sempre rappresentate con il valore 2 e il seme originale; nessun velo
viola per i 2. I tooltip spiegano l’eventuale valore sostituito.
Test: ace-multi.test.cjs, multi-pinella-ui.test.cjs e test Rust corrispondenti.
