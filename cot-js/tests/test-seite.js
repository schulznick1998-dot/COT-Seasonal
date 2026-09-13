// Baut die ganze Seite aus erzeugten Daten — ohne Netz.
//
// Zweck: prüfen, dass Rechnung und Darstellung zusammenpassen, bevor echte
// Daten fliessen. Die Zahlen hier sind erfunden und als solche markiert.
'use strict';

const fs = require('fs');
const { MAERKTE, SAISON_PAARE } = require('../lib/maerkte');
const { pruefeNullsumme } = require('../lib/cot');
const S = require('../lib/saison');
const { baue } = require('../lib/seite');
const { aufbereiten } = (() => {
  // aufbereiten liegt in run-cot.js; hier nachgebaut, damit der Test die
  // Datei nicht ausführt (sie würde sofort Netzaufrufe starten).
  const { netto, cotIndex, oiRichtung, lage } = require('../lib/cot');
  return { aufbereiten(markt, wochen) {
    const s = wochen.filter(pruefeNullsumme);
    const comm = s.map((w) => netto(w.commLong, w.commShort));
    const spec = s.map((w) => netto(w.specLong, w.specShort));
    const klein = s.map((w) => netto(w.kleinLong, w.kleinShort));
    const oi = s.map((w) => w.oi);
    const i26 = cotIndex(comm, 26);
    const i156 = comm.length >= 156 ? cotIndex(comm, 156) : comm.map(() => null);
    const r = oiRichtung(oi, 4);
    const l = lage(i26.at(-1), r.at(-1));
    return { kurz: markt.kurz, name: markt.name,
      commercialIstInsider: markt.commercialIstInsider,
      stichtag: s.at(-1).datum, wochen: s.length,
      commNetto: comm.at(-1), specNetto: spec.at(-1), kleinNetto: klein.at(-1),
      oi: oi.at(-1), idx26: i26.at(-1), idx156: i156.at(-1),
      oiRichtung: r.at(-1), lageText: l.text, stufe: l.stufe,
      commReihe: comm, specReihe: spec, kleinReihe: klein, oiReihe: oi,
      idx26Reihe: i26, idx156Reihe: i156, datumReihe: s.map((w) => w.datum) };
  } };
})();

let seed = 3;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
const TAG = 86400000;

// ── COT-Wochen erzeugen, Nullsumme exakt eingehalten ───────────────────
function cotWelt(phase, groesse, n = 300) {
  const aus = [];
  for (let i = 0; i < n; i++) {
    const zyklus = Math.sin((2 * Math.PI * i) / 64 + phase);
    const comm = Math.round(groesse * zyklus + rnd() * groesse * 0.1);
    const klein = Math.round(-0.08 * comm + rnd() * groesse * 0.02);
    const spec = -(comm + klein);                       // erzwingt die Identität
    const basis = groesse * 3;
    const d = new Date(Date.UTC(2021, 0, 5) + i * 7 * TAG);
    aus.push({
      datum: d.toISOString().slice(0, 10),
      oi: Math.round(groesse * 6 + groesse * 1.5 * Math.sin((2 * Math.PI * i) / 40)),
      commLong: basis + Math.max(comm, 0), commShort: basis - Math.min(comm, 0),
      specLong: basis + Math.max(spec, 0), specShort: basis - Math.min(spec, 0),
      kleinLong: basis + Math.max(klein, 0), kleinShort: basis - Math.min(klein, 0),
    });
  }
  return aus;
}

// ── Kursreihe erzeugen ─────────────────────────────────────────────────
function kurse(jahre, muster) {
  const p = []; let k = 1.2;
  const start = Date.UTC(2026 - jahre, 0, 1);
  for (let d = 0; d < jahre * 365; d++) {
    const t = start + d * TAG, dt = new Date(t);
    if (dt.getUTCDay() % 6 === 0) continue;
    let r = rnd() * 0.012;
    if (muster && dt.getUTCMonth() === 8 && dt.getUTCDate() >= 14 && dt.getUTCDate() <= 28) r -= 0.0018;
    k *= Math.exp(r); p.push({ t, close: k });
  }
  return p;
}

let ok = 0; const fehler = [];
const pruefe = (name, bed) => { if (bed) ok++; else fehler.push(name); };

const maerkte = MAERKTE.map((m, i) => {
  const w = cotWelt(i * 0.7, 40000 + 9000 * i);
  pruefe(`${m.kurz}: erzeugte Wochen halten die Nullsumme`, w.every(pruefeNullsumme));
  return aufbereiten(m, w);
});

const heute = new Date(Date.UTC(2026, 8, 13));
const paare = SAISON_PAARE.slice(0, 2).map((paar, i) => {
  const pts = kurse(21, i === 0);
  const { gefunden, schwelle } = S.bestaetige(pts, heute, 60, { horizont: 21 });
  return {
    paar, jahre: 21, von: '2005-01-03', bis: '2026-09-11',
    latte: schwelle,
    fenster: gefunden.filter((f) => f.note > schwelle).slice(0, 3),
    kurven: [5, 10, 15, 20].map((j) => S.jahresKurve(pts, j, 2026)).filter(Boolean),
    monatsBild: S.monatsBild(pts, 20, 2026),
    jahresMatrix: S.jahresMatrix(pts, 20, 2026),
  };
});

const saison = { stichtag: '2026-09-13', horizont: 21,
  heuteDoy: S.tagImJahr(heute.getTime()), paare };

const html = baue(maerkte, ['Beispiel: Reihe XYZ nicht erreichbar (erfundene Meldung)'], saison);
fs.writeFileSync('probe.html', html);
fs.writeFileSync('probe-ansicht.html',
  '<!doctype html><html><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<style>body{margin:0}</style></head><body>' + html + '</body></html>');

pruefe('Alle Märkte gerendert', maerkte.every((m) => html.includes(`id="m-${m.kurz}"`)));
pruefe('Index bleibt zwischen 0 und 100',
  maerkte.every((m) => m.idx26Reihe.every((v) => v == null || (v >= 0 && v <= 100))));
pruefe('156-Wochen-Index vorhanden', maerkte.some((m) => m.idx156 != null));
pruefe('Drei Chart-Behälter je Markt', (html.match(/class="ch[ "]/g) || []).length >= 3 * maerkte.length);
pruefe('Chart-Bibliothek eingebunden', html.includes('echarts.min.js'));
pruefe('Daten als JSON eingebettet', html.includes('id="cot-daten"'));
pruefe('Ohne Netz erscheint ein Hinweis', html.includes('brauchen eine Internetverbindung'));
pruefe('Nullsummen-Erklärung steht drin', html.includes('nullsummig'));
pruefe('Händler-Warnung bei Währungen', html.includes('Gegenseite des Kundenflusses'));
pruefe('Insider-Hinweis bei Rohstoffen', html.includes('Produzent oder Verbraucher der Ware'));
// "undefined" darf im Skriptteil vorkommen (v === undefined), aber nie im sichtbaren Text.
const sichtbar = html.replace(/<script[\s\S]*?<\/script>/g, '');
pruefe('Keine Platzhalter im sichtbaren Text',
  !sichtbar.includes('TODO') && !sichtbar.includes('undefined') && !sichtbar.includes('NaN'));
pruefe('Kein doctype (Artifact ergänzt ihn)', !html.trimStart().startsWith('<!doctype'));

// Saisonalität
pruefe('Vier Rückblick-Knöpfe je Paar', (html.match(/class="jb[ "]/g) || []).length >= 4 * paare.length);
pruefe('Vier Kurven je Paar berechnet', paare.every((p) => p.kurven.length === 4));
pruefe('Umschalten verdrahtet', html.includes(".jbs[data-gruppe="));
pruefe('Zeitraum-Auswertung verdrahtet', html.includes("brushSelected"));
pruefe('Jahresmatrix mitgeliefert', paare.every((p) => Object.keys(p.jahresMatrix).length >= 15));
pruefe('Monats-Chart angelegt', (html.match(/id="c-monat-/g) || []).length === paare.length);
pruefe('Nulltest wird erklärt', html.includes('jedes Jahr für sich'));
pruefe('Gepflanztes Muster erscheint', paare[0].fenster.length > 0 && html.includes('Short'));
pruefe('Zufallsreihe bestätigt nichts', paare[1].fenster.length === 0);
pruefe('Leere Reihe wird benannt', html.includes('Kein Fenster überspringt'));
pruefe('Ohne Saisondaten steht die Anleitung',
  baue(maerkte, [], null).includes('node run-saison.js') || baue(maerkte, [], null).includes('Noch keine Kursdaten'));

const blob = html.match(/id="cot-daten">([\s\S]*?)<\/script>/);
pruefe('Eingebettetes JSON ist gültig', (() => { try { JSON.parse(blob[1]); return true; } catch { return false; } })());

console.log(`\n${ok} von ${ok + fehler.length} Prüfungen bestanden`);
fehler.forEach((f) => console.log('  FEHLGESCHLAGEN:', f));
console.log(`probe.html geschrieben (${html.length} Zeichen, ${maerkte.length} Märkte, ${paare.length} Kursreihen)`);
process.exit(fehler.length ? 1 : 0);
