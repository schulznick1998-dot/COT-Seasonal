// Beschaffung. Zwei Quellen, beide kostenlos und ohne Schlüssel.
//
//   CFTC   publicreporting.cftc.gov — Commitments of Traders, Legacy, Futures only
//   Yahoo  query1.finance.yahoo.com — Tageskurse, rund 20 Jahre
//
// Leitlinie: lieber ein gemeldetes Loch als ein still gefüllter Wert. Jede
// Reihe, die nicht kommt, steht am Ende im Bericht. Nichts wird ersetzt,
// nichts geschätzt.
'use strict';

const MELDUNGEN = [];
function melde(text) { MELDUNGEN.push(text); process.stderr.write('   ' + text + '\n'); }

async function hole(url, versuche = 3, timeoutMs = 20000) {
  for (let n = 0; n < versuche; n++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                   Accept: 'text/csv,application/json,*/*' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (r.ok) return await r.text();
      melde(`HTTP ${r.status} bei ${url.split('?')[0]}`);
    } catch (e) {
      melde(`Fehler (${n + 1}/${versuche}) bei ${url.split('?')[0]}: ${e.message}`);
    }
    await new Promise((res) => setTimeout(res, 1500 * (n + 1)));
  }
  return null;
}

// ── CFTC ───────────────────────────────────────────────────────────────
const CFTC_FELDER = [
  'cftc_contract_market_code', 'market_and_exchange_names', 'report_date_as_yyyy_mm_dd',
  'open_interest_all', 'noncomm_positions_long_all', 'noncomm_positions_short_all',
  'comm_positions_long_all', 'comm_positions_short_all',
  'nonrept_positions_long_all', 'nonrept_positions_short_all',
];

function csvZeilen(text) {
  const zeilen = text.trim().split('\n');
  const kopf = zeilen[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return zeilen.slice(1).map((z) => {
    // einfache CSV-Zerlegung mit Anführungszeichen
    const felder = []; let akt = '', inStr = false;
    for (const c of z) {
      if (c === '"') inStr = !inStr;
      else if (c === ',' && !inStr) { felder.push(akt); akt = ''; }
      else akt += c;
    }
    felder.push(akt);
    const o = {};
    kopf.forEach((h, i) => { o[h] = (felder[i] ?? '').trim(); });
    return o;
  });
}

const zahl = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Die letzten `anzahl` Wochenberichte eines Kontrakts, älteste zuerst. */
async function cotWochen(code, anzahl = 320) {
  const frage = new URLSearchParams({
    $select: CFTC_FELDER.join(','),
    $where: `cftc_contract_market_code='${code}'`,
    $order: 'report_date_as_yyyy_mm_dd DESC',
    $limit: String(anzahl),
  });
  const roh = await hole(`https://publicreporting.cftc.gov/resource/6dca-aqww.csv?${frage}`);
  if (roh == null) { melde(`Kontrakt ${code}: nicht erreichbar — Markt entfällt.`); return null; }

  const zeilen = csvZeilen(roh);
  if (!zeilen.length) { melde(`Kontrakt ${code}: keine Zeilen — Markt entfällt.`); return null; }

  const aus = []; let verworfen = 0;
  for (const z of zeilen) {
    const w = {
      datum: String(z.report_date_as_yyyy_mm_dd || '').slice(0, 10),
      oi: zahl(z.open_interest_all),
      specLong: zahl(z.noncomm_positions_long_all),
      specShort: zahl(z.noncomm_positions_short_all),
      commLong: zahl(z.comm_positions_long_all),
      commShort: zahl(z.comm_positions_short_all),
      kleinLong: zahl(z.nonrept_positions_long_all),
      kleinShort: zahl(z.nonrept_positions_short_all),
    };
    const vollstaendig = w.datum && ['oi', 'specLong', 'specShort', 'commLong',
      'commShort', 'kleinLong', 'kleinShort'].every((k) => w[k] != null);
    if (!vollstaendig) { verworfen++; continue; }   // Lücke wird ausgelassen, nicht geschätzt
    aus.push(w);
  }
  if (verworfen) melde(`Kontrakt ${code}: ${verworfen} unvollständige Woche(n) ausgelassen.`);
  if (!aus.length) { melde(`Kontrakt ${code}: keine vollständige Woche — Markt entfällt.`); return null; }

  aus.sort((a, b) => a.datum.localeCompare(b.datum));
  return aus;
}

// ── Yahoo: Tageskurse ──────────────────────────────────────────────────
// Symbole wie im alten System (api/seasonal.js) — dort erprobt.
const YAHOO = {
  'EUR/USD': 'EURUSD=X', 'GBP/USD': 'GBPUSD=X', 'USD/JPY': 'JPY=X',
  'AUD/USD': 'AUDUSD=X', 'NZD/USD': 'NZDUSD=X', 'USD/CAD': 'CAD=X',
  'USD/CHF': 'CHF=X', 'XAU/USD': 'GC=F',
  'EUR/GBP': 'EURGBP=X', 'EUR/JPY': 'EURJPY=X', 'EUR/CHF': 'EURCHF=X',
  'EUR/AUD': 'EURAUD=X', 'EUR/CAD': 'EURCAD=X', 'EUR/NZD': 'EURNZD=X',
  'GBP/JPY': 'GBPJPY=X', 'GBP/CHF': 'GBPCHF=X', 'GBP/AUD': 'GBPAUD=X',
  'GBP/CAD': 'GBPCAD=X', 'GBP/NZD': 'GBPNZD=X',
  'AUD/JPY': 'AUDJPY=X', 'AUD/NZD': 'AUDNZD=X', 'AUD/CAD': 'AUDCAD=X',
  'AUD/CHF': 'AUDCHF=X', 'NZD/JPY': 'NZDJPY=X', 'NZD/CAD': 'NZDCAD=X',
  'NZD/CHF': 'NZDCHF=X', 'CAD/JPY': 'CADJPY=X', 'CAD/CHF': 'CADCHF=X',
  'CHF/JPY': 'CHFJPY=X',
};

/**
 * Tageskurse der letzten `jahre` Jahre. Gibt { punkte, hinweise } zurück.
 *
 * Geprüft wird, was man einer Kurve nicht ansieht: zu kurze Historie,
 * grobe Auflösung, und Kurssprünge, die kein Kurs sein können.
 */
async function yahooKurse(paar, jahre = 21) {
  const symbol = YAHOO[paar];
  if (!symbol) { melde(`${paar}: kein Yahoo-Symbol hinterlegt.`); return null; }

  const bis = Math.floor(Date.now() / 1000);
  const von = bis - Math.floor(jahre * 365.25 * 86400);
  const roh = await hole(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
    + `?interval=1d&period1=${von}&period2=${bis}`);
  if (roh == null) { melde(`${paar}: Kurse nicht erreichbar.`); return null; }

  let j;
  try { j = JSON.parse(roh); } catch { melde(`${paar}: Antwort nicht lesbar.`); return null; }
  const erg = j?.chart?.result?.[0];
  const ts = erg?.timestamp || [];
  const cl = erg?.indicators?.quote?.[0]?.close || [];
  if (ts.length < 200) { melde(`${paar}: nur ${ts.length} Kurstage — zu wenig.`); return null; }

  const punkte = [];
  for (let i = 0; i < ts.length; i++) {
    const c = cl[i];
    if (c == null || !Number.isFinite(c) || c <= 0) continue;
    punkte.push({ t: ts[i] * 1000, close: c });
  }
  punkte.sort((a, b) => a.t - b.t);
  if (punkte.length < 200) { melde(`${paar}: zu wenige brauchbare Kurse.`); return null; }

  const spanneJahre = (punkte.at(-1).t - punkte[0].t) / (365.25 * 86400000);
  if (spanneJahre < 8) {
    melde(`${paar}: Historie nur ${spanneJahre.toFixed(1)} Jahre — für Saisonalität zu kurz.`);
    return null;
  }
  // Kurssprung über 25 % an einem Tag ist bei diesen Märkten kein Kurs.
  for (let i = 1; i < punkte.length; i++) {
    const v = punkte[i].close / punkte[i - 1].close;
    if (v > 1.25 || v < 0.8) {
      melde(`${paar}: Kurssprung ${((v - 1) * 100).toFixed(0)} % am `
        + `${new Date(punkte[i].t).toISOString().slice(0, 10)} — Reihe nicht verwendet.`);
      return null;
    }
  }
  return { punkte, jahre: spanneJahre, von: punkte[0].t, bis: punkte.at(-1).t };
}

module.exports = { MELDUNGEN, melde, cotWochen, yahooKurse, YAHOO, csvZeilen };
