// Saisonalität über exakte Datumsfenster — mit empirischem Nulltest.
//
// Nicht Kalendermonate, sondern Fenster wie "18. September bis 2. Oktober",
// also das, was sich handeln lässt.
//
// WARUM DER NULLTEST DER KERN IST
// -------------------------------
// Die naheliegende Regel — Trefferquote über 75 %, mindestens 10 Jahre —
// wurde gegen reine Zufallskurse geprüft und bestätigte dort massenhaft
// Muster. Sie ist wertlos, aus zwei Gründen:
//
//   * Die Rückblickfenster sind INEINANDER GESCHACHTELT. Das 20-Jahres-
//     Fenster enthält das 5-Jahres-Fenster. Vier gleiche Vorzeichen sind
//     keine vier Belege, sondern fast einer.
//   * Es werden über hundert Fenster gleichzeitig geprüft. Bei genug
//     Versuchen sieht immer eines gut aus.
//
// Deshalb wird hier gefragt: WIE GUT WÄRE DAS BESTE FENSTER, WENN ES GAR
// KEINE SAISONALITÄT GÄBE? Dazu werden die Renditen mehrere hundert Mal
// verwürfelt und jedes Mal der beste Fensterwert notiert. Ein Muster gilt
// nur, wenn es besser ist als 95 % dieser Zufallsbestwerte.
//
// ENTSCHEIDEND IST, WIE VERWÜRFELT WIRD: jedes Jahr FÜR SICH, nicht die
// Reihe am Stück. Verschiebt man die ganze Reihe, wandert ein echtes
// Jahresmuster geschlossen an eine andere Kalenderstelle und ist dort
// genauso stark — die Latte enthielte dann das Muster, das sie widerlegen
// soll, und ein echtes Signal fiele durch. Genau das ist beim Bau hier
// passiert und liess ein eingebautes Testmuster durchfallen. Siehe
// rotiertProJahr() unten.
'use strict';

const LOOKBACKS = [5, 10, 15, 20];
const TAG_MS = 86400000;

/** Kursreihe: { tage: number[] (UTC-Tagesindex), kurse: number[] } */
function reihe(punkte) {
  const sortiert = [...punkte].sort((a, b) => a.t - b.t);
  return {
    tage: sortiert.map((p) => Math.floor(p.t / TAG_MS)),
    kurse: sortiert.map((p) => p.close),
  };
}

/** Erster Kurs am oder nach `tag`. null, wenn die Reihe dort endet. */
function kursAb(r, tag, maxLuecke = 7) {
  let lo = 0, hi = r.tage.length - 1, tref = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (r.tage[m] >= tag) { tref = m; hi = m - 1; } else lo = m + 1;
  }
  if (tref === -1) return null;
  if (r.tage[tref] - tag > maxLuecke) return null;   // Lücke zu gross (Feiertage, fehlende Jahre)
  return r.kurse[tref];
}

/** Zyklisch verschobene RENDITEN — zerstört den Kalenderbezug, nichts sonst. */
function rotiert(r, k) {
  const n = r.kurse.length;
  if (n < 3) return r;
  const ren = new Array(n - 1);
  for (let i = 1; i < n; i++) ren[i - 1] = Math.log(r.kurse[i] / r.kurse[i - 1]);
  const m = ren.length;
  const schritt = ((k % m) + m) % m;
  const kurse = new Array(n);
  kurse[0] = r.kurse[0];
  let s = 0;
  for (let i = 0; i < m; i++) {
    s += ren[(i + schritt) % m];
    kurse[i + 1] = r.kurse[0] * Math.exp(s);
  }
  return { tage: r.tage, kurse };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ein Fenster über alle verfügbaren Jahre: Rendite je Jahr. */
function fensterJahre(r, monat, tag, laenge, bisJahr) {
  const proJahr = {};
  for (let jahr = bisJahr - 25; jahr < bisJahr; jahr++) {
    const start = Math.floor(Date.UTC(jahr, monat, tag) / TAG_MS);
    const ende = start + laenge;
    const a = kursAb(r, start);
    const b = kursAb(r, ende);
    if (a == null || b == null || a <= 0) continue;
    const ret = (b - a) / a;
    if (Math.abs(ret) < 0.25) proJahr[jahr] = ret;   // >25 % in drei Wochen ist ein Datenfehler
  }
  return proJahr;
}

/**
 * Bewertung eines Fensters. Note 0, wenn es die Grundbedingungen reisst:
 * gleiches Vorzeichen über alle Rückblickperioden, und der Median folgt
 * dem Mittelwert (sonst tragen ein, zwei Ausreisserjahre alles).
 */
function bewerte(proJahr, bisJahr) {
  const jahre = Object.keys(proJahr).map(Number).sort((a, b) => a - b);
  if (jahre.length < 8) return null;

  const perLookback = {};
  let vorzeichen = 0, konsistent = true, medianFolgt = true;
  let summeBetrag = 0, anzahl = 0, minTreffer = 1;

  for (const n of LOOKBACKS) {
    const rel = jahre.filter((j) => j >= bisJahr - n);
    if (rel.length < Math.min(5, n)) { konsistent = false; break; }
    const werte = rel.map((j) => proJahr[j]);
    const mittel = werte.reduce((a, b) => a + b, 0) / werte.length;
    const med = median(werte);
    const vz = Math.sign(mittel);
    if (vorzeichen === 0) vorzeichen = vz;
    else if (vz !== vorzeichen) konsistent = false;
    if (Math.sign(med) !== vz) medianFolgt = false;
    const treffer = werte.filter((w) => (vz > 0 ? w > 0 : w < 0)).length / werte.length;
    minTreffer = Math.min(minTreffer, treffer);
    summeBetrag += Math.abs(mittel); anzahl++;
    perLookback[n] = {
      jahre: werte.length,
      mittel: mittel * 100,
      median: med * 100,
      treffer: treffer * 100,
    };
  }
  if (!konsistent || anzahl < LOOKBACKS.length) return null;

  const effekt = summeBetrag / anzahl;                 // mittlerer Betrag über die Perioden
  const note = medianFolgt ? effekt * 100 * minTreffer : 0;
  return {
    richtung: vorzeichen > 0 ? 'long' : 'short',
    note, minTreffer: minTreffer * 100, medianFolgt, perLookback,
  };
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];

function etikett(monat, tag, laenge, bisJahr) {
  const a = new Date(Date.UTC(bisJahr, monat, tag));
  const b = new Date(a.getTime() + laenge * TAG_MS);
  return `${a.getUTCDate()}. ${MONATE[a.getUTCMonth()]} bis `
       + `${b.getUTCDate()}. ${MONATE[b.getUTCMonth()]}`;
}

/** Alle Fenster, die laufen oder in `horizont` Tagen beginnen. */
function scan(r, heute, horizont = 21, laengen = [5, 8, 11, 14, 17, 20, 25]) {
  const bisJahr = heute.getUTCFullYear();
  const aus = [];
  for (let d = -7; d <= horizont; d++) {
    const tagX = new Date(heute.getTime() + d * TAG_MS);
    const monat = tagX.getUTCMonth(), tag = tagX.getUTCDate();
    for (const laenge of laengen) {
      const proJahr = fensterJahre(r, monat, tag, laenge, bisJahr);
      const b = bewerte(proJahr, bisJahr);
      if (b && b.note > 0) {
        aus.push({ ...b, monat, tag, laenge, label: etikett(monat, tag, laenge, bisJahr) });
      }
    }
  }
  aus.sort((a, b) => b.note - a.note);
  return aus;
}

/**
 * JEDES JAHR FÜR SICH zyklisch verschieben.
 *
 * Warum nicht die ganze Reihe am Stück: Ein echtes Saisonmuster wiederholt
 * sich jährlich. Verschiebt man die Reihe als Ganzes, wandert das Muster
 * geschlossen an eine andere Stelle des Kalenders — und ist dort genauso
 * stark. Die Zufallslatte würde dann das Muster enthalten, das sie
 * widerlegen soll, und ein echtes Signal fiele durch.
 *
 * Geprüft wird aber genau die Behauptung: DASSELBE Kalenderfenster zeigt
 * ÜBER DIE JAHRE dieselbe Richtung. Verschiebt man jedes Jahr um einen
 * eigenen Betrag, bleibt die Renditestruktur jedes einzelnen Jahres exakt
 * erhalten — nur der Gleichklang zwischen den Jahren verschwindet. Das ist
 * die Nullhypothese, die hierher gehört.
 */
function rotiertProJahr(r, ziehung) {
  const n = r.kurse.length;
  if (n < 3) return r;
  const ren = new Array(n - 1);
  for (let i = 1; i < n; i++) ren[i - 1] = Math.log(r.kurse[i] / r.kurse[i - 1]);

  // Renditeindizes nach Kalenderjahr gruppieren (Index i gehört zu Tag i+1).
  const proJahr = new Map();
  for (let i = 0; i < ren.length; i++) {
    const jahr = new Date(r.tage[i + 1] * 86400000).getUTCFullYear();
    if (!proJahr.has(jahr)) proJahr.set(jahr, []);
    proJahr.get(jahr).push(i);
  }

  const neu = ren.slice();
  let mischer = (ziehung + 1) * 2654435761 >>> 0;   // deterministisch, je Ziehung anders
  for (const idx of proJahr.values()) {
    const m = idx.length;
    if (m < 3) continue;
    mischer = (mischer * 1664525 + 1013904223) >>> 0;
    const versatz = mischer % m;
    for (let j = 0; j < m; j++) neu[idx[j]] = ren[idx[(j + versatz) % m]];
  }

  const kurse = new Array(n);
  kurse[0] = r.kurse[0];
  let s = 0;
  for (let i = 0; i < ren.length; i++) { s += neu[i]; kurse[i + 1] = r.kurse[0] * Math.exp(s); }
  return { tage: r.tage, kurse };
}

/** Die Zufallslatte: bestes Fenster, wenn der Gleichklang zwischen den Jahren fehlt. */
function latte(r, heute, ziehungen = 300, q = 0.95, scanArgs = {}) {
  const besten = [];
  for (let i = 0; i < ziehungen; i++) {
    const treffer = scan(rotiertProJahr(r, i), heute, scanArgs.horizont, scanArgs.laengen);
    besten.push(treffer.length ? treffer[0].note : 0);
  }
  besten.sort((a, b) => a - b);
  const idx = Math.min(besten.length - 1, Math.floor(q * besten.length));
  return { schwelle: besten[idx], verteilung: besten };
}

/** Vollständiger Durchlauf: scannen, Latte bestimmen, Muster prüfen. */
function bestaetige(punkte, heute, ziehungen = 300, scanArgs = {}) {
  const r = reihe(punkte);
  const gefunden = scan(r, heute, scanArgs.horizont, scanArgs.laengen);
  const { schwelle, verteilung } = latte(r, heute, ziehungen, 0.95, scanArgs);
  for (const f of gefunden) {
    f.latte = schwelle;
    f.p = verteilung.filter((v) => v >= f.note).length / verteilung.length;
  }
  return { gefunden, schwelle, bestaetigt: gefunden.filter((f) => f.note > schwelle) };
}

module.exports = { LOOKBACKS, reihe, rotiert, rotiertProJahr, kursAb, scan, latte, bestaetige, bewerte, etikett };

// ───────────────────────────────────────────────────────────────────────
// Jahreskurve und Monatsbild — das, was im alten System umschaltbar war.
// Methode wie dort: je Jahr den Pfad als kumulierte Prozent-Performance ab
// Jahresanfang, auf den Tag im Jahr gelegt, dann über die Jahre des
// Fensters gemittelt und auf 100 rebasiert.
// ───────────────────────────────────────────────────────────────────────

function tagImJahr(ms) {
  const d = new Date(ms);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    - Date.UTC(d.getUTCFullYear(), 0, 1)) / TAG_MS);
}

/** Mittlere Jahreskurve über die letzten `jahre` abgeschlossenen Jahre. */
function jahresKurve(punkte, jahre, bisJahr) {
  const abJahr = bisJahr - jahre;
  const proJahr = new Map();
  for (const p of punkte) {
    const j = new Date(p.t).getUTCFullYear();
    if (j < abJahr || j >= bisJahr) continue;
    if (!proJahr.has(j)) proJahr.set(j, []);
    proJahr.get(j).push({ doy: tagImJahr(p.t), close: p.close });
  }
  const kurven = [];
  for (const [, pts] of proJahr) {
    if (pts.length < 50) continue;                     // angebrochene Jahre raus
    pts.sort((a, b) => a.doy - b.doy);
    const basis = pts[0].close;
    if (!(basis > 0)) continue;
    const map = new Map();
    for (const p of pts) map.set(p.doy, ((p.close - basis) / basis) * 100);
    kurven.push(map);
  }
  if (!kurven.length) return null;

  const kurve = [];
  for (let doy = 0; doy <= 365; doy += 2) {
    const werte = [];
    for (const map of kurven) {
      let v = map.get(doy);
      for (let b = 1; b <= 6 && v === undefined; b++) v = map.get(doy - b);   // Feiertage überbrücken
      if (v !== undefined) werte.push(v);
    }
    if (werte.length) kurve.push({ doy, wert: 100 + werte.reduce((a, b) => a + b, 0) / werte.length });
  }
  return { jahre, genutzt: kurven.length, kurve };
}

/** Monatsbild: mittlere Monatsrendite und Trefferquote je Monat. */
function monatsBild(punkte, jahre, bisJahr) {
  const abJahr = bisJahr - jahre;
  const proMonat = Array.from({ length: 12 }, () => []);
  const monate = new Map();
  for (const p of punkte) {
    const d = new Date(p.t);
    const j = d.getUTCFullYear();
    if (j < abJahr || j >= bisJahr) continue;
    const k = `${j}-${d.getUTCMonth()}`;
    if (!monate.has(k)) monate.set(k, { m: d.getUTCMonth(), erst: p.close, letzt: p.close });
    else monate.get(k).letzt = p.close;
  }
  for (const { m, erst, letzt } of monate.values()) {
    if (erst > 0 && letzt > 0) {
      const r = ((letzt - erst) / erst) * 100;
      if (Math.abs(r) < 20) proMonat[m].push(r);
    }
  }
  return proMonat.map((rs, m) => {
    if (!rs.length) return { monat: m, mittel: null, treffer: null, jahre: 0 };
    const mittel = rs.reduce((a, b) => a + b, 0) / rs.length;
    return {
      monat: m, mittel,
      treffer: (rs.filter((r) => (mittel > 0 ? r > 0 : r < 0)).length / rs.length) * 100,
      jahre: rs.length,
    };
  });
}

module.exports.jahresKurve = jahresKurve;
module.exports.monatsBild = monatsBild;
module.exports.tagImJahr = tagImJahr;
module.exports.MONATE = MONATE;

/**
 * Jahresmatrix: je Jahr die kumulierte Prozent-Performance ab Jahresanfang,
 * auf ein Zwei-Tage-Raster gelegt.
 *
 * Damit kann die Seite eine beliebig gezogene Zeitspanne auswerten: Wert am
 * Ende minus Wert am Anfang, je Jahr — ohne die Kurse selbst mitzuliefern.
 */
function jahresMatrix(punkte, jahre, bisJahr) {
  const abJahr = bisJahr - jahre;
  const proJahr = new Map();
  for (const p of punkte) {
    const j = new Date(p.t).getUTCFullYear();
    if (j < abJahr || j >= bisJahr) continue;
    if (!proJahr.has(j)) proJahr.set(j, []);
    proJahr.get(j).push({ doy: tagImJahr(p.t), close: p.close });
  }
  const aus = {};
  for (const [j, pts] of proJahr) {
    if (pts.length < 50) continue;
    pts.sort((a, b) => a.doy - b.doy);
    const basis = pts[0].close;
    if (!(basis > 0)) continue;
    const map = new Map();
    for (const p of pts) map.set(p.doy, ((p.close - basis) / basis) * 100);
    const zeile = [];
    for (let doy = 0; doy <= 365; doy += 2) {
      let v = map.get(doy);
      for (let b = 1; b <= 6 && v === undefined; b++) v = map.get(doy - b);
      zeile.push(v === undefined ? null : Math.round(v * 1000) / 1000);
    }
    aus[j] = zeile;
  }
  return aus;
}

module.exports.jahresMatrix = jahresMatrix;
