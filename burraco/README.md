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
- Le carte disegnano il **numero in grande in alto a sinistra** (una volta sola)
  e il seme al centro: così si legge il valore senza avvicinare gli occhi, e il
  seme non viene ripetuto su tutta la carta.
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
node test/layout.test.js        # niente tagliato sui laptop: didascalie, combinazioni, ordinamento, carte, mano che non salta (73 controlli)
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
