# Scopa e Scopone

Versione locale in revisione. Aprire `/scopa/` attraverso un server statico; nessun servizio Render necessario. Il sito pubblicato e i vecchi giochi restano invariati finché la nuova versione non viene approvata.

## Architettura

- `engine.js`: regole pure, partite da due e quattro, punteggio e serializzazione.
- `ai.js`: sceglie una mossa da una osservazione che contiene soltanto mano propria, tavolo, carte già prese e conteggi pubblici. Non riceve le mani altrui o l'ordine del mazzo.
- `app.js`: tavolo, selezione della presa, passaggio privato del dispositivo, salvataggio locale, conteggio e cronologia.
- `assets/credits.json`: provenienza, autore e licenza verificati per ciascuna delle 41 immagini. Le carte sono ridimensionate a WebP; fonti originali conservate nel manifest.

## Direzione visiva

Un tavolo da gioco orizzontale, non una dashboard. Il dettaglio delle carte napoletane è l'elemento principale. Palette: panno petrolio `#195b60`, bordo scuro `#092d31`, pannelli `#123f43`, testo `#edf2ed`, oro funzionale `#e5b957`, carta `#f7f4e9`. Georgia solo per il nome del gioco e i risultati; Trebuchet/Segoe UI per i comandi. Punteggi a destra nell'intestazione, compagno di fronte, avversari ai lati. La configurazione usa lo spazio orizzontale e si impila solo sul telefono. Le carte si adattano all'area disponibile. Il panno è una scelta specifica per il tavolo, le altre decorazioni sono ridotte al minimo. Nessun carattere o servizio esterno necessario durante una partita.

## Regole applicate

Scopa: 3 carte per giocatore, 4 a terra; nuove mani distribuite insieme. Scopone: 9 a testa, 4 a terra; scientifico: 10 a testa, tavolo vuoto. Coppie 0+2 contro 1+3. Si prende una carta uguale se disponibile, altrimenti una somma, scegliendo tra le prese legali; una presa possibile è obbligatoria. L'ultima giocata non dà scopa. Le carte restanti vanno all'ultima presa effettiva. Primiera calcolata separatamente per ciascuna coppia, con un seme mancante uguale a zero; nessun punto alle categorie in parità. Con almeno tre re nelle quattro carte iniziali si ridistribuisce. Nessuna variante asso-pigliatutto, napola o rebello attiva implicitamente.

Fonte: [Regolamento FIGS](https://www.ilfalo.it/Torneo2018/Regolamento-Tornei-Figs.pdf). Varianti di distribuzione presentate esplicitamente all'utente.

## Verifiche

`node scopa/test/engine.test.cjs`: regressioni delle regole, conservazione delle 40 carte, completamento delle partite e salvataggi. Le prove del browser verificano scelta della presa, privacy nei turni umani, conteggio finale, ripresa e dimensioni del tavolo.

## Limiti dichiarati

La nuova versione supporta il computer e gli umani sullo stesso dispositivo. Il multiplayer P2P precedente a due resta raggiungibile da un collegamento esplicito, senza attribuirgli le nuove regole del motore. Non introduce un nuovo server Scopa o Scopone. Tressette resta una fase successiva.
