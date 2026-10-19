# Scala 40

Ramino italiano a punti: 13 carte a testa, apertura a 40, attacchi e chiusura.
A due con 1 mazzo francese, a quattro in coppia con 2 mazzi.

## Regole implementate

- Pesca dal tallone oppure prima carta degli scarti, poi eventuali calate/legature, poi scarto di 1 carta.
- Apertura: la prima calata della squadra deve valere **almeno 40 punti in un'unica azione** (asso 11, 1 in A-2-3; figure 10; numeri il nominale; jolly 25).
- Giochi: tris/poker dello stesso valore (min 3 carte) o scale dello stesso seme (min 3); l'asso vale A-2-3 oppure D-Q-K-A, mai K-A-2.
- Solo i **jolly** sono matte (i 2 no).
- Dopo l'apertura la squadra può calare giochi singoli e attaccare carte a qualsiasi gioco.
- Chiusura con scarto oppure **in mano** (senza scarto); tallone esaurito: gli scarti (meno la prima) vengono rimescolati.
- Penalità: asso 11 (1 se unica carta rimasta), figure 10, jolly 25, numeri il nominale. Vince il totale più basso dopo N smazzate.

## Semplificazioni dichiarate

- I jolly restano fissi nei giochi dove vengono messi (non si spostano mai).
- L'apertura va fatta in un'unica azione di calata (niente aperture in più tempi).
- Solo 2 jolly per mazzo (niente 2 come matte).
- Tallone rimescolato dagli scarti (meno la carta in cima); se non ci sono carte la mano si chiude per stallo.
- L'asso come unica carta rimasta in mano vale 1 punto.

## Comandi test

```sh
node test/engine.test.cjs
node --check app.js
```
