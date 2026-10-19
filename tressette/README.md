# Tressette — anteprima locale

## Piano visivo
Continuità con Scopa, con un tavolo blu inchiostro. Palette: panno #244c63, bordo #102d40, pannello #193c50, testo #f1f2eb, oro #e5b957, carta #f7f4e9. Georgia per il titolo, Trebuchet/Segoe UI per i comandi. Il centro rappresenta la presa corrente: quattro posti disposti a croce, carta e nome associati. Mano in basso, comandi e punteggi ai margini. Configurazione orizzontale in due colonne, verticale solo sul telefono. Le immagini delle carte sono quelle originali già verificate in scopa/assets; nessuna dipendenza di rete.

Revisione del piano: il centro non è una griglia di pannelli, ma lo spazio condiviso della presa. Gerarchia basata su carte, turno e seme obbligatorio. Decorazioni ridotte, evidenza oro solo per selezione e turno. Le dimensioni si calcolano sullo spazio reale del browser.

## Separazione
Motore puro, computer basato su informazioni pubbliche e mano propria, interfaccia indipendente. Nessuna modifica al server Burraco o alla configurazione Render. Versione locale da revisionare prima della pubblicazione.

## Regole
Ordine 3,2,A,R,C,F,7,6,5,4; obbligo di rispondere al seme; nessuna briscola. Punti in terzi interi nel motore, arrotondati per difetto per ogni squadra a fine smazzata, un punto per l'ultima presa. Il mazziere ruota e apre il giocatore successivo. Tressette classico: quattro, coppie opposte. A perdere: quattro individuali, vince il totale minore alla durata scelta; cappotto opzionale quando un giocatore prende tutti i punti (zero a lui, 11 agli altri). Nessuna eliminazione intermedia. Accusi non attivi: è dichiarato nelle regole della pagina.

Pizzico confermato dall'utente: due mazzetti esposti per giocatore, non un mazzo comune. Dieci carte in mano e due mazzetti da cinque, sola cima giocabile. Obbligo di seme su mano e cime esposte. Asso, due e tre della cima possono essere pizzicati in mano durante il proprio turno, rivelando la carta sotto. Accusi e dichiarazioni non attivi; le regole della pagina lo indicano esplicitamente.

Fonti: https://www.sisal.it/regole-tresette ; https://www.pagat.com/tressette/spizzichino.html . Quest'ultima distingue la variante a mazzetti da quella a mazzo comune. Il mazzo condiviso con Scopa mantiene tutte le attribuzioni in `scopa/assets/credits.json`.

## Verifiche
`node tressette/test/engine.test.cjs`: ordine, punti in terzi, seme obbligatorio, cime esposte, pizzicare, cappotto, 150 partite complete con tutte le difficoltà, conservazione delle 40 carte e ripristino.

`node tressette/test/browser.test.cjs`: tavoli su 1366×630, 1173×637, 390×844, 844×390, selezione e conferma, privacy, salvataggi, mazzetti e immagini.

`node tressette/test/full-game.test.cjs`: partite complete attraverso i pulsanti dell'interfaccia, CPU e conteggio finale per tutte e tre le varianti. I soli ritardi di presentazione vengono accelerati nel browser di test.

È una versione locale con CPU e umani sullo stesso dispositivo; non implementa multiplayer a distanza. Render resta dedicato al Burraco.
