# Briscola — anteprima locale

## Piano e revisione visiva
Stessa famiglia di Scopa e Tressette: Georgia per titolo e risultati, Trebuchet/Segoe UI per azioni. Panno verde #315a42, bordo #173c2a, pannello #234532, testo #f1f2eb, oro #e5b957, carta #f7f4e9. Configurazione orizzontale, tre carte in mano grandi, presa centrale a croce e briscola scoperta accanto al tallone. I punteggi della smazzata sono sempre visibili. Sul telefono riduzione dello spazio accessorio, senza nascondere briscola o carte giocabili. Revisione: il mazzo con la carta scoperta caratterizza il gioco; mantenere questi elementi chiari, evitando pannelli decorativi.

Motore, computer e interfaccia indipendenti dai vecchi giochi. Immagini condivise da scopa/assets, fonti in credits.json. Nessuna modifica a Render.

## Regole
Due singoli o quattro in coppie opposte. Tre carte per giocatore. Nessun obbligo di seme. Ordine A,3,R,C,F,7,6,5,4,2. Punti 11,10,4,3,2,0: 120 complessivi. Vince la briscola più alta; in assenza di briscole vince la carta più alta del seme di apertura. Pesca prima il vincitore, poi gli altri nell'ordine del turno; il vincitore apre. La carta di briscola scoperta viene pescata per ultima. Nessun punto extra all'ultima presa. 60–60 è pari. Durata da una a cinque smazzate, vince il totale dei punti. Non è una serie al meglio di N. Nessuno scambio di mani fra compagni o segnali impliciti.

Fonti: https://www.sisal.it/regole-briscola e https://www.sisal.it/regole-briscola/varianti . Il vecchio multiplayer P2P resta accessibile attraverso un collegamento esplicito; la nuova interfaccia supporta CPU e umani sullo stesso dispositivo.

## Verifiche

Test motore: ordine e valore delle carte, briscola, libertà di seme, ordine di pesca, ultima carta scoperta, 120 serie complete da 1 a 5 smazzate, 40 carte e 120 punti per smazzata, ripristino. Test browser: partite complete a 2 e 4, risultato e salvataggi, privacy delle mani, 1366×630, 1173×637, 390×844 e 844×390. La nuova versione rimane locale per la revisione.
