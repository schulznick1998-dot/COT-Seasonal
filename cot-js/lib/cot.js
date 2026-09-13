// Die COT-Mathematik. Kein Netzwerk, deshalb prüfbar.
'use strict';

/** Netto-Position: Kaufkontrakte minus Verkaufskontrakte. */
function netto(long, short) {
  return Number(long) - Number(short);
}

/**
 * COT-Index nach Larry Williams.
 *
 *   Index = 100 * (heute - Tief) / (Hoch - Tief)
 *
 * Hoch und Tief über die letzten `fenster` Wochen einschliesslich heute.
 * 100 = höchster Stand des Fensters, 0 = tiefster.
 *
 * Solange weniger als `fenster` Wochen vorliegen, steht null — bewusst kein
 * halb gefüllter Wert, weil ein Index über drei Wochen Historie wie ein
 * Extrem aussieht, ohne eines zu sein.
 *
 * Liegt das Fenster völlig flach (Hoch === Tief), ist der Index nicht
 * definiert und bleibt null statt auf 50 oder 100 gesetzt zu werden.
 */
function cotIndex(serie, fenster) {
  if (!Number.isInteger(fenster) || fenster < 2) {
    throw new Error('Fenster muss mindestens 2 Wochen umfassen');
  }
  const aus = [];
  for (let i = 0; i < serie.length; i++) {
    if (i + 1 < fenster) { aus.push(null); continue; }
    const teil = serie.slice(i + 1 - fenster, i + 1);
    let hoch = -Infinity, tief = Infinity;
    for (const v of teil) { if (v > hoch) hoch = v; if (v < tief) tief = v; }
    aus.push(hoch === tief ? null : (100 * (serie[i] - tief)) / (hoch - tief));
  }
  return aus;
}

/**
 * Steigt oder fällt das Open Interest gegenüber `wochen` zurück?
 *
 * Das Open Interest ist die Zahl der insgesamt offenen Kontrakte. Es
 * beantwortet, ob frisches Geld hineinläuft oder Positionen aufgelöst
 * werden — und genau das trennt ein reifes Extrem von einem, das sich
 * bereits abbaut. Schwelle bei 3 %, kleinere Ausschläge sind Rauschen.
 */
function oiRichtung(oi, wochen = 4) {
  const aus = [];
  for (let i = 0; i < oi.length; i++) {
    if (i < wochen || oi[i - wochen] === 0) { aus.push(null); continue; }
    const v = (oi[i] - oi[i - wochen]) / Math.abs(oi[i - wochen]);
    aus.push(v > 0.03 ? 'steigend' : v < -0.03 ? 'fallend' : 'flach');
  }
  return aus;
}

/**
 * Index und Open Interest zusammen gelesen.
 *
 * Der Index allein ist ein Warnschild, kein Einstieg. Erst das Open
 * Interest sagt, ob das Extrem noch gefüttert wird oder sich schon auflöst.
 */
function lage(index, richtung, schwelle = 80) {
  if (index == null) {
    return { text: 'Noch zu wenig Historie für ein Urteil.', stufe: 'neutral' };
  }
  const hoch = index >= schwelle;
  const tief = index <= 100 - schwelle;
  if (!hoch && !tief) {
    return { text: 'Positionierung im normalen Bereich.', stufe: 'neutral' };
  }
  const seite = hoch ? 'Kaufbereich' : 'Verkaufsbereich';
  const stufe = hoch ? 'kauf' : 'verkauf';
  if (richtung === 'steigend') {
    return { stufe, text: `${seite}, und das Open Interest steigt — frisches Geld läuft `
      + 'in die volle Seite. Das ist die reife, aber auch die riskante Lage.' };
  }
  if (richtung === 'fallend') {
    return { stufe, text: `${seite}, aber das Open Interest fällt — die Position wird `
      + 'bereits aufgelöst. Die Bewegung läuft vermutlich schon.' };
  }
  return { stufe, text: `${seite}, Open Interest seitwärts.` };
}

/**
 * Futures sind nullsummig: zu jedem Long gehört ein Short. Also muss gelten
 *
 *   Commercials + Large Specs + Small Specs = 0
 *
 * Das ist eine Identität, keine Näherung. Stimmt sie nicht, wurden Felder
 * falsch zugeordnet — dann ist die Zeile unbrauchbar. Genau dieser Test
 * fängt die Verwechslung von Legacy- und TFF-Format ab: beide sehen gleich
 * aus und haben völlig andere Spalten.
 */
function pruefeNullsumme(w) {
  const comm = w.commLong - w.commShort;
  const spec = w.specLong - w.specShort;
  const klein = w.kleinLong - w.kleinShort;
  return comm + spec + klein === 0;
}

module.exports = { netto, cotIndex, oiRichtung, lage, pruefeNullsumme };
