// Prüfungen gegen Fälle, deren richtige Antwort vorher feststeht. Kein Netz.
'use strict';

const { netto, cotIndex, oiRichtung, lage, pruefeNullsumme } = require('../lib/cot');
const S = require('../lib/saison');

let ok = 0; const fehler = [];
const pruefe = (name, bed) => { if (bed) ok++; else fehler.push(name); };

// ── Netto ───────────────────────────────────────────────────────────────
pruefe('Netto = long minus short', netto(120532, 155402) === -34870);
pruefe('Netto kann positiv sein', netto(178791, 167995) === 10796);

// ── COT-Index: die Randfälle, auf die es ankommt ────────────────────────
const i4 = cotIndex([0, 1, 2, 3, 4], 4);
pruefe('Vor vollem Fenster steht null', i4[0] === null && i4[1] === null && i4[2] === null);
pruefe('Höchster Wert ergibt 100', i4[3] === 100 && i4[4] === 100);
pruefe('Tiefster Wert ergibt 0', cotIndex([4, 3, 2, 1], 4)[3] === 0);
pruefe('Mitte ergibt 50', cotIndex([0, 10, 5], 3)[2] === 50);
pruefe('Flaches Fenster ist nicht definiert, nicht 100', cotIndex([7, 7, 7], 3)[2] === null);

// Der Index ist RELATIV: dieselbe Zahl kann kurzfristig extrem und
// langfristig unauffällig sein — genau deshalb stehen beide auf der Seite.
const lang = [100, 0, 40, 41, 42, 43];
pruefe('Kurzes Fenster meldet Extrem', cotIndex(lang, 3).at(-1) === 100);
pruefe('Langes Fenster sieht dasselbe als unauffällig', cotIndex(lang, 6).at(-1) === 43);
pruefe('Altes Tief fällt aus dem Fenster', cotIndex([50, 0, 10, 11, 12], 3).at(-1) === 100);

let warf = false;
try { cotIndex([1, 2], 1); } catch { warf = true; }
pruefe('Fenster unter 2 wird abgelehnt', warf);

// ── Open Interest ───────────────────────────────────────────────────────
const r = oiRichtung([100, 100, 100, 100, 110, 90, 100.5], 4);
pruefe('Ohne Vorlauf keine Richtung', r.slice(0, 4).every((v) => v === null));
pruefe('Plus 10 Prozent ist steigend', r[4] === 'steigend');
pruefe('Minus 10 Prozent ist fallend', r[5] === 'fallend');
pruefe('Halbes Prozent ist flach, kein Signal', r[6] === 'flach');
pruefe('Nulldivision wird abgefangen', oiRichtung([0, 0, 0, 0, 5], 4)[4] === null);

// ── Lage ────────────────────────────────────────────────────────────────
pruefe('Ohne Index kein Urteil', lage(null, 'steigend').stufe === 'neutral');
pruefe('Mitte ist neutral', lage(50, 'steigend').stufe === 'neutral');
pruefe('Hoher Index ist Kaufbereich', lage(85, 'flach').stufe === 'kauf');
pruefe('Tiefer Index ist Verkaufsbereich', lage(15, 'flach').stufe === 'verkauf');
pruefe('Genau auf der Schwelle zählt', lage(80, 'flach').stufe === 'kauf');
pruefe('Steigendes OI wird benannt', lage(85, 'steigend').text.includes('frisches Geld'));
pruefe('Fallendes OI wird benannt', lage(85, 'fallend').text.includes('aufgelöst'));

// ── Die Identität, um die es fachlich geht ──────────────────────────────
// Kanadischer Dollar, CFTC-Bericht vom 08.09.2026, wörtlich aus dem Bericht.
const cad = { commLong: 244052, commShort: 169623, specLong: 54444,
  specShort: 124943, kleinLong: 29559, kleinShort: 33489 };
pruefe('Die drei Gruppen summieren sich auf null', pruefeNullsumme(cad));
pruefe('Commercial ist das Spiegelbild der Specs',
  (cad.commLong - cad.commShort) === -((cad.specLong - cad.specShort) + (cad.kleinLong - cad.kleinShort)));
pruefe('Verfälschte Zeile fällt durch', !pruefeNullsumme({ ...cad, commLong: 244053 }));

// ── Saisonalität: Bausteine ─────────────────────────────────────────────
const TAG = 86400000;
function welt(jahre, muster) {
  // Zufall mit festem Keim, damit die Prüfung reproduzierbar ist.
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const punkte = []; let kurs = 1.2;
  const start = Date.UTC(2026 - jahre, 0, 1);
  for (let d = 0; d < jahre * 365; d++) {
    const t = start + d * TAG;
    const dt = new Date(t);
    if (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) continue;
    let ret = rnd() * 0.012;
    if (muster && dt.getUTCMonth() === 8 && dt.getUTCDate() >= 14 && dt.getUTCDate() <= 28) ret -= 0.0018;
    kurs *= Math.exp(ret);
    punkte.push({ t, close: kurs });
  }
  return punkte;
}

const rr = S.reihe(welt(21, false));
pruefe('Reihe ist nach Datum sortiert', rr.tage.every((v, i, a) => i === 0 || a[i - 1] <= v));
const rot = S.rotiert(rr, 500);
pruefe('Rotation ändert die Kurse', rot.kurse.at(-1) !== rr.kurse.at(-1));
pruefe('Rotation erhält die Länge', rot.kurse.length === rr.kurse.length);
const renA = rr.kurse.slice(1).map((v, i) => Math.log(v / rr.kurse[i])).sort((a, b) => a - b);
const renB = rot.kurse.slice(1).map((v, i) => Math.log(v / rot.kurse[i])).sort((a, b) => a - b);
pruefe('Rotation erhält die Renditeverteilung exakt',
  renA.every((v, i) => Math.abs(v - renB[i]) < 1e-9));

pruefe('Kurs vor Reihenbeginn gibt null', S.kursAb(rr, rr.tage[0] - 500) === null);
pruefe('Kurs nach Reihenende gibt null', S.kursAb(rr, rr.tage.at(-1) + 500) === null);

// ── Saisonalität: die zwei entscheidenden Läufe ─────────────────────────
const heute = new Date(Date.UTC(2026, 8, 13));
const zufall = S.bestaetige(welt(21, false), heute, 120, { horizont: 21 });
pruefe('Reine Zufallswelt bestätigt nichts', zufall.bestaetigt.length === 0);

const gepflanzt = S.bestaetige(welt(21, true), heute, 120, { horizont: 21 });
pruefe('Gepflanztes Muster wird gefunden', gepflanzt.bestaetigt.length > 0);
if (gepflanzt.bestaetigt.length) {
  const b = gepflanzt.bestaetigt[0];
  pruefe('Richtung des Musters stimmt (short)', b.richtung === 'short');
  pruefe('Note liegt über der Latte', b.note > b.latte);
  pruefe('p-Wert ist klein', b.p <= 0.05);
  pruefe('Alle vier Rückblickperioden vorhanden',
    S.LOOKBACKS.every((n) => b.perLookback[n] && b.perLookback[n].jahre > 0));
}
pruefe('Latte ist positiv', zufall.schwelle > 0);

// Ein Muster, das nur von Ausreissern lebt, muss durchfallen:
// Mittelwert positiv, Median negativ → medianFolgt = false → Note 0.
const ausreisser = {};
for (let j = 2006; j < 2026; j++) ausreisser[j] = j % 5 === 0 ? 0.09 : -0.004;
const bw = S.bewerte(ausreisser, 2026);
pruefe('Ausreisser-Muster bekommt Note 0', bw === null || bw.note === 0);

console.log(`\n${ok} von ${ok + fehler.length} Prüfungen bestanden`);
fehler.forEach((f) => console.log('  FEHLGESCHLAGEN:', f));
process.exit(fehler.length ? 1 : 0);
