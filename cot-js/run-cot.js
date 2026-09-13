#!/usr/bin/env node
// Holt COT-Historie und Tageskurse, rechnet, schreibt die Seite.
//
//   node run-cot.js                 alles, schreibt cot.html
//   node run-cot.js --ohne-saison   nur COT (schnell)
//   node run-cot.js --wochen 320    wie viel COT-Historie
//   node run-cot.js --ziehungen 300 Genauigkeit der Zufallslatte
//
// Keine Abhängigkeiten. Node 18 oder neuer.
'use strict';

const fs = require('fs');
const { MAERKTE, SAISON_PAARE } = require('./lib/maerkte');
const Q = require('./lib/quellen');
const { netto, cotIndex, oiRichtung, lage, pruefeNullsumme } = require('./lib/cot');
const S = require('./lib/saison');
const { baue } = require('./lib/seite');

const KURZ = 26, LANG = 156;

function arg(name, standard) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? standard : process.argv[i + 1];
}
const hat = (name) => process.argv.includes('--' + name);

function aufbereiten(markt, wochen) {
  const sauber = wochen.filter(pruefeNullsumme);
  const verworfen = wochen.length - sauber.length;
  if (verworfen) {
    Q.melde(`${markt.kurz}: ${verworfen} Woche(n) verletzen die Nullsummen-Identität und wurden verworfen.`);
  }
  if (sauber.length < KURZ + 4) {
    Q.melde(`${markt.kurz}: nur ${sauber.length} brauchbare Wochen — zu wenig für einen Index über ${KURZ} Wochen. Markt entfällt.`);
    return null;
  }
  const comm = sauber.map((w) => netto(w.commLong, w.commShort));
  const spec = sauber.map((w) => netto(w.specLong, w.specShort));
  const klein = sauber.map((w) => netto(w.kleinLong, w.kleinShort));
  const oi = sauber.map((w) => w.oi);

  // Der Index läuft auf den COMMERCIALS. Wegen der Nullsumme ist er das
  // Spiegelbild des Spekulanten-Index; das steht auf der Seite dabei.
  const i26 = cotIndex(comm, KURZ);
  const i156 = comm.length >= LANG ? cotIndex(comm, LANG) : comm.map(() => null);
  const richtung = oiRichtung(oi, 4);
  const l = lage(i26.at(-1), richtung.at(-1));

  return {
    kurz: markt.kurz, name: markt.name,
    commercialIstInsider: markt.commercialIstInsider,
    stichtag: sauber.at(-1).datum, wochen: sauber.length,
    commNetto: comm.at(-1), specNetto: spec.at(-1), kleinNetto: klein.at(-1),
    oi: oi.at(-1), idx26: i26.at(-1), idx156: i156.at(-1),
    oiRichtung: richtung.at(-1), lageText: l.text, stufe: l.stufe,
    commReihe: comm, specReihe: spec, kleinReihe: klein, oiReihe: oi,
    idx26Reihe: i26, idx156Reihe: i156, datumReihe: sauber.map((w) => w.datum),
  };
}

async function saisonalitaet(ziehungen, horizont) {
  const heute = new Date();
  const bisJahr = heute.getUTCFullYear();
  const paare = [];
  for (const paar of SAISON_PAARE) {
    process.stderr.write(`-> ${paar}\n`);
    const k = await Q.yahooKurse(paar, 21);
    if (!k) continue;
    const { gefunden, schwelle } = S.bestaetige(k.punkte, heute, ziehungen, { horizont });
    const bestaetigt = gefunden.filter((f) => f.note > schwelle).slice(0, 4);
    process.stderr.write(`   ${k.jahre.toFixed(0)} Jahre · ${bestaetigt.length} bestätigte(s) Fenster (Latte ${schwelle.toFixed(2)})\n`);
    paare.push({
      paar, jahre: k.jahre,
      von: new Date(k.von).toISOString().slice(0, 10),
      bis: new Date(k.bis).toISOString().slice(0, 10),
      latte: schwelle, fenster: bestaetigt,
      kurven: [5, 10, 15, 20].map((j) => S.jahresKurve(k.punkte, j, bisJahr)).filter(Boolean),
      monatsBild: S.monatsBild(k.punkte, 20, bisJahr),
      jahresMatrix: S.jahresMatrix(k.punkte, 20, bisJahr),
    });
  }
  return paare.length ? {
    stichtag: heute.toISOString().slice(0, 10), horizont,
    heuteDoy: S.tagImJahr(heute.getTime()), paare,
  } : null;
}

(async () => {
  const wochen = Number(arg('wochen', 320));
  const ziehungen = Number(arg('ziehungen', 300));
  const horizont = Number(arg('horizont', 21));
  const aus = arg('aus', 'cot.html');

  process.stderr.write('COT-Historie von der CFTC holen\n');
  const fertig = [];
  for (const m of MAERKTE) {
    process.stderr.write(`-> ${m.kurz} (${m.name})\n`);
    const roh = await Q.cotWochen(m.code, wochen);
    if (!roh) continue;
    const a = aufbereiten(m, roh);
    if (a) {
      process.stderr.write(`   ${a.wochen} Wochen, Stichtag ${a.stichtag}\n`);
      fertig.push(a);
    }
  }
  if (!fertig.length) {
    process.stderr.write('\nAbbruch: Kein einziger Markt geladen. Die Meldungen oben sagen warum.\n'
      + 'Diesen Block bitte an Claude schicken.\n');
    process.exit(1);
  }

  let saison = null;
  if (!hat('ohne-saison')) {
    process.stderr.write('\nTageskurse von Yahoo Finance holen (Saisonalität)\n');
    saison = await saisonalitaet(ziehungen, horizont);
  }

  // Ausgabeordner anlegen, falls der Pfad einen enthält (z. B. site/index.html).
  const ordner = require('path').dirname(aus);
  if (ordner && ordner !== '.') fs.mkdirSync(ordner, { recursive: true });

  fs.writeFileSync('cot_daten.json', JSON.stringify({ maerkte: fertig, saison }, null, 1));

  // Vollständiges HTML-Dokument — die Seite soll allein stehen können,
  // als Datei auf der Festplatte wie unter einer eigenen Adresse.
  const inhalt = baue(fertig, Q.MELDUNGEN, saison);
  fs.writeFileSync(aus,
    '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '<meta name="color-scheme" content="light dark">\n'
    + '<meta name="robots" content="noindex">\n'
    + '</head>\n<body>\n' + inhalt + '\n</body>\n</html>\n');

  process.stderr.write(`\nGeschrieben: ${aus} und cot_daten.json\n`);
  process.stderr.write(`${fertig.length} von ${MAERKTE.length} Märkten auf der Seite.\n`);
  if (saison) {
    const n = saison.paare.reduce((s, p) => s + p.fenster.length, 0);
    process.stderr.write(`${saison.paare.length} Kursreihen, ${n} bestätigte(s) Fenster insgesamt.\n`);
    if (n === 0) process.stderr.write('Kein bestätigtes Fenster ist das häufigste Ergebnis und kein Fehler.\n');
  }
  if (Q.MELDUNGEN.length) {
    process.stderr.write('\nMeldungen aus der Beschaffung:\n');
    Q.MELDUNGEN.forEach((t) => process.stderr.write('  ' + t + '\n'));
  }
})();
