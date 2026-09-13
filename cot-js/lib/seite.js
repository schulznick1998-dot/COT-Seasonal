// Baut die Seite. Interaktive Charts aus ECharts, keine selbstgebauten SVGs.
//
// Die Daten liegen als JSON im Dokument, die Charts werden daraus im Browser
// aufgebaut. Damit kann man hineinzoomen, Werte antippen und auf der
// Saisonkurve eine Zeitspanne aufziehen, um sie auszuwerten.
//
// ECharts kommt vom CDN. Ohne Internet erscheint statt der Charts ein
// Hinweis — bewusst kein stiller leerer Kasten.
'use strict';

const ECHARTS = 'https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.1/echarts.min.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function zahl(n, nk = 0, vz = true) {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: nk, maximumFractionDigits: nk });
  if (n < 0) return '−' + s;
  return vz && n > 0 ? '+' + s : s;
}
const idx = (n) => zahl(n, 0, false);

function pille(stufe, kurz = false) {
  const k = { kauf: ['v-bull', kurz ? 'Kauf' : 'Kaufbereich'],
              verkauf: ['v-bear', kurz ? 'Verkauf' : 'Verkaufsbereich'] };
  const [cls, text] = k[stufe] || ['v-neu', 'neutral'];
  return `<span class="v ${cls}">${text}</span>`;
}

function fensterKarte(f) {
  const richtung = f.richtung === 'short' ? 'Short' : 'Long';
  const cls = f.richtung === 'short' ? 'v-bear' : 'v-bull';
  const zeilen = Object.entries(f.perLookback).map(([n, d]) =>
    `<tr><td>${n} Jahre</td><td class="n">${d.jahre}</td><td class="n">${zahl(d.mittel, 2)}&nbsp;%</td>
<td class="n">${zahl(d.median, 2)}&nbsp;%</td><td class="n">${Math.round(d.treffer)}&nbsp;%</td></tr>`).join('');
  return `<div class="karte">
<div class="kopf"><span class="v ${cls}">${richtung}</span>
<span class="kv"><b>${esc(f.label)}</b></span>
<span class="kv">p&nbsp;= <b>${f.p.toFixed(3)}</b></span>
<span class="kv">Note <b>${f.note.toFixed(2)}</b> gegen Latte <b>${f.latte.toFixed(2)}</b></span></div>
<div class="tablewrap" style="margin:10px 0 0"><table style="min-width:430px">
<thead><tr><th>Rückblick</th><th class="n">Jahre</th><th class="n">Mittel</th><th class="n">Median</th><th class="n">Treffer</th></tr></thead>
<tbody>${zeilen}</tbody></table></div>
<p class="fuss">Die ehrliche Zahl ist die <strong>schwächste</strong> Trefferquote, nicht die beste:
${Math.round(f.minTreffer)}&nbsp;%. Auch ein bestätigtes Fenster ist eine Wahrscheinlichkeit, keine Zusage.</p></div>`;
}

function baue(maerkte, meldungen, saison) {
  const stand = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const stichtag = maerkte[0]?.stichtag ?? '—';

  const zeilen = maerkte.map((m) => `<tr>
<td class="cur">${esc(m.kurz)}</td><td>${esc(m.name)}</td>
<td class="n">${zahl(m.commNetto)}</td><td class="n">${zahl(m.specNetto)}</td>
<td class="n"><strong>${idx(m.idx26)}</strong></td><td class="n">${idx(m.idx156)}</td>
<td>${esc(m.oiRichtung ?? '—')}</td><td>${pille(m.stufe, true)}</td></tr>`).join('');

  const karten = maerkte.map((m) => {
    const hinweis = m.commercialIstInsider
      ? 'Bei diesem Markt ist der Commercial tatsächlich ein Produzent oder Verbraucher der Ware — hier trägt die Einheimischen-Logik.'
      : 'Achtung: Bei diesem Kontrakt besteht die Commercial-Seite überwiegend aus Händlern, die die Gegenseite des Kundenflusses lagern — kein Insiderwissen, sondern ein Buch.';
    return `<h3 class="sec" id="m-${esc(m.kurz)}">${esc(m.name)}
<span style="font-weight:400;color:var(--muted);font-size:14px">· ${esc(m.kurz)}</span></h3>
<div class="karte">
<div class="kopf">${pille(m.stufe)}
<span class="kv">COT-Index 26&nbsp;W <b>${idx(m.idx26)}</b></span>
<span class="kv">156&nbsp;W <b>${idx(m.idx156)}</b></span>
<span class="kv">Open Interest <b>${esc(m.oiRichtung ?? '—')}</b></span></div>
<p class="urteil">${esc(m.lageText)}</p>
<div class="clab">Netto-Positionen · ${m.wochen} Wochen · Ziehen zum Zoomen, Doppelklick setzt zurück</div>
<div class="ch" id="c-netto-${esc(m.kurz)}"></div>
<div class="clab">Open Interest · offene Kontrakte insgesamt</div>
<div class="ch klein" id="c-oi-${esc(m.kurz)}"></div>
<div class="clab">COT-Index der Commercials · 0 = Tief des Fensters, 100 = Hoch</div>
<div class="ch" id="c-idx-${esc(m.kurz)}"></div>
<p class="fuss">${hinweis}</p></div>`;
  }).join('');

  // ── Saisonalität ─────────────────────────────────────────────────────
  let saisonHtml;
  if (!saison || !saison.paare?.length) {
    saisonHtml = `<div class="note"><p><strong>Noch keine Kursdaten geladen.</strong>
Starte <code>node run-cot.js</code> ohne <code>--ohne-saison</code> — die Tageskurse kommen von
Yahoo Finance, kostenlos und ohne Schlüssel, rund zwanzig Jahre zurück.</p></div>`;
  } else {
    const teile = [`<p class="sub">Exakte Datumsfenster, nicht Kalendermonate. Stichtag
${esc(saison.stichtag)}. Geprüft werden Fenster, die laufen oder in den nächsten
${saison.horizont} Tagen beginnen.</p>
<div class="note warn">
<p><strong>Warum hier selten etwas bestätigt wird.</strong> Bei zwanzig Jahren Historie und über
hundert möglichen Fenstern sieht rein zufällig immer eines gut aus. Geprüft wird deshalb gegen die
Frage: <em>Wie gut wäre das beste Fenster, wenn es gar keine Saisonalität gäbe?</em> Dazu wird
<strong>jedes Jahr für sich</strong> verwürfelt — die Struktur jedes einzelnen Jahres bleibt exakt
erhalten, nur der Gleichklang zwischen den Jahren verschwindet. Ein Muster gilt nur, wenn es besser
ist als 95&nbsp;% dieser Zufallsbestwerte.</p>
<p><strong>Kein bestätigtes Fenster ist das häufigste Ergebnis</strong> — und kein Fehler, sondern
die Antwort.</p></div>`];

    for (const p of saison.paare) {
      const id = p.paar.replace('/', '');
      const knoepfe = [5, 10, 15, 20].filter((j) => p.kurven.some((k) => k.jahre === j))
        .map((j) => `<button type="button" class="jb${j === 20 ? ' an' : ''}" data-ziel="${id}" data-jahre="${j}">${j}J</button>`).join('');
      teile.push(`<h3 class="sec" id="s-${id}">${esc(p.paar)}
<span style="font-weight:400;color:var(--muted);font-size:14px">· ${p.jahre.toFixed(0)} Jahre,
${esc(p.von)} bis ${esc(p.bis)}</span></h3>
<div class="karte">
  <div class="clab">Mittlerer Jahresverlauf · Rückblick umschaltbar · Linie = heute</div>
  <div class="jbs" data-gruppe="${id}">${knoepfe}</div>
  <div class="ch gross" id="c-saison-${id}"></div>
  <div class="hinw">Zieh mit der Maus über einen Zeitraum im Chart — darunter steht sofort,
  was dieser Zeitraum in jedem einzelnen Jahr gebracht hat.</div>
  <div class="brush" id="b-${id}">Noch kein Zeitraum gewählt.</div>
  <div class="clab">Monatsbild · mittlere Monatsrendite und Trefferquote, 20 Jahre</div>
  <div class="ch klein" id="c-monat-${id}"></div>
</div>`);
      teile.push(p.fenster.length
        ? p.fenster.map(fensterKarte).join('')
        : `<div class="karte"><p class="urteil">Kein Fenster überspringt die Zufallslatte
(${p.latte.toFixed(2)}). In diesem Zeitraum liegt kein Muster, das sich vom Zufall
unterscheiden lässt.</p></div>`);
    }
    saisonHtml = teile.join('');
  }

  const fehlblock = meldungen.length
    ? `<div class="note neg"><p><strong>Nicht beschafft:</strong></p><ul>${
        meldungen.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`
    : '<div class="note"><p>Alle Märkte vollständig geladen, keine Lücken.</p></div>';

  // Daten für die Charts — knapp gehalten, keine doppelten Reihen.
  const daten = {
    maerkte: maerkte.map((m) => ({
      kurz: m.kurz, datum: m.datumReihe, comm: m.commReihe, spec: m.specReihe,
      klein: m.kleinReihe, oi: m.oiReihe, i26: m.idx26Reihe, i156: m.idx156Reihe,
    })),
    saison: saison ? {
      heuteDoy: saison.heuteDoy,
      paare: saison.paare.map((p) => ({
        id: p.paar.replace('/', ''), paar: p.paar,
        kurven: p.kurven.map((k) => ({ jahre: k.jahre, kurve: k.kurve })),
        monatsBild: p.monatsBild, jahresMatrix: p.jahresMatrix,
      })),
    } : null,
  };

  return `<title>COT und Saisonalität</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root{--bg:#EDF0F2;--surface:#FCFCFB;--surface-2:#F3F6F7;--sunk:#E4E9EC;
 --ink:#0E1418;--ink-2:#2E3940;--muted:#5A666E;--faint:#8A959C;
 --line:#D8DFE4;--line-strong:#BDC7CE;--accent:#9C5F00;
 --pos:#15607E;--pos-soft:#DCE9EF;--neg:#A6432B;--neg-soft:#F4E3DE;
 --warn:#8C5E06;--warn-bg:#F6ECD9}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
 --bg:#0C1013;--surface:#161C22;--surface-2:#1D252C;--sunk:#11171C;
 --ink:#E7EDF1;--ink-2:#C3CDD4;--muted:#94A0A9;--faint:#6E7B84;
 --line:#29323A;--line-strong:#3A464F;--accent:#D9A047;
 --pos:#4FA0C4;--pos-soft:#152731;--neg:#D2735C;--neg-soft:#2C1B18;
 --warn:#D9A047;--warn-bg:#2A2418}}
:root[data-theme="dark"]{--bg:#0C1013;--surface:#161C22;--surface-2:#1D252C;--sunk:#11171C;
 --ink:#E7EDF1;--ink-2:#C3CDD4;--muted:#94A0A9;--faint:#6E7B84;
 --line:#29323A;--line-strong:#3A464F;--accent:#D9A047;
 --pos:#4FA0C4;--pos-soft:#152731;--neg:#D2735C;--neg-soft:#2C1B18;
 --warn:#D9A047;--warn-bg:#2A2418}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Source Serif 4",Georgia,serif;font-size:16.5px;line-height:1.6}
.wrap{max-width:900px;margin:0 auto;padding:40px 18px 80px}
.eyebrow{font-family:"Archivo",system-ui,sans-serif;font-size:11.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin:0 0 14px}
h1{font-family:"Archivo",system-ui,sans-serif;font-weight:700;font-size:clamp(28px,5.5vw,40px);line-height:1.07;margin:0 0 14px;max-width:16ch}
.lede{font-size:18px;color:var(--ink-2);max-width:62ch;margin:0}
p{max-width:68ch;margin:0 0 14px}
h2{font-family:"Archivo",system-ui,sans-serif;font-weight:700;font-size:21px;margin:46px 0 4px;scroll-margin-top:16px}
h3.sec{font-family:"Archivo",system-ui,sans-serif;font-weight:700;font-size:17px;margin:34px 0 6px;scroll-margin-top:16px}
.sub{color:var(--muted);font-size:15px;margin:0 0 18px;max-width:64ch}
strong{font-weight:600;color:var(--ink)}
.note{border-left:3px solid var(--accent);background:var(--surface-2);padding:15px 18px;border-radius:0 8px 8px 0;margin:20px 0}
.note p{margin:0;font-size:15px}.note p+p{margin-top:10px}
.note.neg{border-left-color:var(--neg)}.note.warn{border-left-color:var(--warn)}
.note ul{margin:8px 0 0;padding-left:20px;font-size:14.5px}
.v{display:inline-block;font-family:"Archivo",system-ui,sans-serif;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px;border-radius:5px;white-space:nowrap}
.v-bull{background:var(--pos-soft);color:var(--pos)}.v-neu{background:var(--sunk);color:var(--muted)}.v-bear{background:var(--neg-soft);color:var(--neg)}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--surface);margin:18px 0}
table{border-collapse:collapse;width:100%;min-width:790px;font-family:"Archivo",system-ui,sans-serif;font-size:13.5px}
th{text-align:left;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);padding:11px 12px;border-bottom:1px solid var(--line-strong);background:var(--surface-2);white-space:nowrap;font-weight:700}
td{padding:11px 12px;border-bottom:1px solid var(--line);color:var(--ink-2)}
tr:last-child td{border-bottom:none}
td.n{text-align:right;font-family:"JetBrains Mono",monospace;font-variant-numeric:tabular-nums}
.cur{font-weight:700;color:var(--ink)}
.karte{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:0 0 10px}
.kopf{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.kv{font-family:"Archivo",system-ui,sans-serif;font-size:12.5px;color:var(--muted)}
.kv b{font-family:"JetBrains Mono",monospace;color:var(--ink);font-weight:500}
.urteil{font-family:"Archivo",system-ui,sans-serif;font-size:14.5px;color:var(--ink-2);margin:0 0 14px}
.clab{font-family:"Archivo",system-ui,sans-serif;font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);margin:16px 0 5px}
.ch{width:100%;height:230px;background:var(--surface-2);border:1px solid var(--line);border-radius:7px}
.ch.klein{height:150px}.ch.gross{height:300px}
.hinw{font-family:"Archivo",system-ui,sans-serif;font-size:12px;color:var(--faint);margin:6px 0 0}
.brush{font-family:"Archivo",system-ui,sans-serif;font-size:13.5px;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line);border-radius:7px;padding:10px 13px;margin-top:8px}
.brush b{font-family:"JetBrains Mono",monospace;font-weight:500;color:var(--ink)}
.brush .rr{display:flex;gap:16px;flex-wrap:wrap;margin-top:6px}
.fuss{font-family:"Archivo",system-ui,sans-serif;font-size:12.5px;color:var(--muted);margin:14px 0 0;padding-top:12px;border-top:1px solid var(--line)}
.jump,.jbs{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0 8px}
.jump a,.jb{font-family:"Archivo",system-ui,sans-serif;font-size:12.5px;font-weight:600;text-decoration:none;color:var(--ink-2);background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:5px 12px;cursor:pointer}
.jump a:hover,.jb:hover{border-color:var(--accent);color:var(--accent)}
.jb.an{background:var(--accent);color:var(--surface);border-color:var(--accent)}
.kaputt{display:flex;align-items:center;justify-content:center;height:100%;font-family:"Archivo",system-ui,sans-serif;font-size:13px;color:var(--muted);text-align:center;padding:12px}
hr{border:none;border-top:1px solid var(--line);margin:48px 0 0}
.foot{padding-top:22px;color:var(--muted);font-size:14px}
</style>

<div class="wrap">
<p class="eyebrow">Commitments of Traders · Stichtag ${esc(stichtag)}</p>
<h1>COT und Saisonalität</h1>
<p class="lede">Wie die drei Gruppen positioniert sind, wie extrem das im historischen
Vergleich ist, ob frisches Geld hineinläuft — und welche Datumsfenster sich vom Zufall
unterscheiden lassen. Alle Charts lassen sich zoomen und antippen.</p>

<div class="jump">${maerkte.map((m) => `<a href="#m-${esc(m.kurz)}">${esc(m.kurz)}</a>`).join('')}
<a href="#saison">Saisonalität</a></div>

<h2 id="ueberblick">Überblick</h2>
<p class="sub">COT-Index der <strong>Commercials</strong>: 100 heisst höchster Stand des
Rückblickfensters, 0 der tiefste. Zwei Fenster nebeneinander, weil dieselbe Zahl über
26 Wochen extrem und über 156 Wochen unauffällig sein kann.</p>

<div class="tablewrap"><table>
<thead><tr><th></th><th>Markt</th><th class="n">Commercials</th><th class="n">Large Specs</th>
<th class="n">Index 26&nbsp;W</th><th class="n">Index 156&nbsp;W</th><th>Open Interest</th><th>Lage</th></tr></thead>
<tbody>${zeilen}</tbody></table></div>

${fehlblock}

<div class="note warn">
<p><strong>Was der COT-Index misst — und was nicht.</strong> Futures sind nullsummig:
Commercials, Large Specs und Small Specs summieren sich auf exakt null. Die Commercial-Position
ist deshalb keine unabhängige zweite Meinung, sondern das arithmetische Spiegelbild der beiden
anderen. Ein Commercial-Extrem <em>ist</em> ein Spekulanten-Extrem.</p>
<p>Gemessen wird damit <strong>Gedränge</strong>, nicht Insiderwissen. Bei Rohstoffen fällt beides
zusammen, weil der Commercial dort ein Produzent mit echtem Wissen über die Ware ist. Bei Währungen
nicht: Dort besteht die Commercial-Seite überwiegend aus Bank-Händlern, die die Gegenseite des
Kundenflusses lagern. Der Effekt bleibt brauchbar — ein überfüllter Trade hat wenig verbleibende
Käufer — aber die Begründung sagt auch, wann er versagt: im echten Trend, wenn die Menge recht behält.</p>
<p><strong>Deshalb steht das Open Interest daneben.</strong> Extrem plus steigendes Open Interest
heisst, frisches Geld läuft noch in die volle Seite. Extrem plus fallendes Open Interest heisst,
die Position wird bereits aufgelöst — die Bewegung läuft schon.</p></div>

<h2 id="maerkte">Die Märkte einzeln</h2>
<p class="sub">Drei Charts je Markt. Ziehen zoomt hinein, Doppelklick setzt zurück,
Zeigen liest die Werte ab.</p>
${karten}

<h2 id="saison">Saisonalität</h2>
${saisonHtml}

<hr>
<p class="foot"><strong>Quellen.</strong> Positionierung: Commitments of Traders der U.S. Commodity
Futures Trading Commission, Legacy-Format, Futures only, Datenreihe
<em>publicreporting.cftc.gov / 6dca-aqww</em>. Netto = Kaufpositionen minus Verkaufspositionen.
Jede Woche wird gegen die Identität <em>Commercials + Large Specs + Small Specs = 0</em> geprüft;
Zeilen, die sie verletzen, kommen nicht auf die Seite. Der Bericht erscheint freitags 21:30
deutscher Zeit mit Datenstand vom Dienstag davor — er ist bei Erscheinen bereits drei Tage alt.
Kurse für die Saisonalität: Yahoo Finance, Tagesschlusskurse, rund zwanzig Jahre.
Erzeugt am ${esc(stand)} Uhr (Berlin).<br><br>
Fehlt eine Zahl, steht sie nicht da. Werte werden nie geschätzt oder fortgeschrieben.</p>
</div>

<script type="application/json" id="cot-daten">${JSON.stringify(daten)}</script>
<script src="${ECHARTS}"></script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('cot-daten').textContent);

  if (typeof echarts === 'undefined') {
    document.querySelectorAll('.ch').forEach(function (el) {
      el.innerHTML = '<div class="kaputt">Charts brauchen eine Internetverbindung '
        + '(die Chart-Bibliothek wird geladen). Alle Zahlen stehen trotzdem in den Tabellen.</div>';
    });
    return;
  }

  var dunkel = matchMedia('(prefers-color-scheme: dark)').matches
    && document.documentElement.dataset.theme !== 'light';
  var stil = getComputedStyle(document.documentElement);
  var F = function (n) { return stil.getPropertyValue(n).trim(); };
  var FARBE = { pos: F('--pos'), neg: F('--neg'), faint: F('--faint'),
    ink: F('--ink-2'), accent: F('--accent'), linie: F('--line') };

  var charts = [];
  function mach(id, option) {
    var el = document.getElementById(id);
    if (!el) return null;
    var c = echarts.init(el, dunkel ? 'dark' : null, { renderer: 'canvas' });
    c.setOption(option);
    charts.push(c);
    return c;
  }
  addEventListener('resize', function () { charts.forEach(function (c) { c.resize(); }); });

  var GRUND = {
    backgroundColor: 'transparent',
    grid: { left: 52, right: 16, top: 16, bottom: 46 },
    tooltip: { trigger: 'axis', confine: true,
      textStyle: { fontFamily: 'Archivo, system-ui, sans-serif', fontSize: 12 } },
    textStyle: { fontFamily: 'Archivo, system-ui, sans-serif' },
    animation: false,
  };
  function zoom() {
    return [{ type: 'inside', throttle: 50 },
            { type: 'slider', height: 16, bottom: 10, brushSelect: false }];
  }
  function achseY(extra) {
    return Object.assign({ type: 'value', scale: true, splitLine: { lineStyle: { color: FARBE.linie } },
      axisLabel: { fontSize: 10, formatter: function (v) { return v.toLocaleString('de-DE'); } } }, extra || {});
  }

  // ── COT je Markt ──────────────────────────────────────────────────────
  D.maerkte.forEach(function (m) {
    mach('c-netto-' + m.kurz, Object.assign({}, GRUND, {
      legend: { data: ['Commercials', 'Large Specs', 'Small Specs'], top: 0, itemHeight: 8,
        textStyle: { fontSize: 11, color: FARBE.ink } },
      grid: { left: 58, right: 16, top: 34, bottom: 46 },
      xAxis: { type: 'category', data: m.datum, axisLabel: { fontSize: 10 } },
      yAxis: achseY(),
      dataZoom: zoom(),
      series: [
        { name: 'Commercials', type: 'line', data: m.comm, showSymbol: false, lineStyle: { width: 1.8, color: FARBE.neg }, itemStyle: { color: FARBE.neg } },
        { name: 'Large Specs', type: 'line', data: m.spec, showSymbol: false, lineStyle: { width: 1.8, color: FARBE.pos }, itemStyle: { color: FARBE.pos } },
        { name: 'Small Specs', type: 'line', data: m.klein, showSymbol: false, lineStyle: { width: 1.4, color: FARBE.faint }, itemStyle: { color: FARBE.faint } },
      ],
    }));

    mach('c-oi-' + m.kurz, Object.assign({}, GRUND, {
      xAxis: { type: 'category', data: m.datum, axisLabel: { fontSize: 10 } },
      yAxis: achseY(),
      dataZoom: zoom(),
      series: [{ name: 'Open Interest', type: 'line', data: m.oi, showSymbol: false,
        lineStyle: { width: 1.6, color: FARBE.ink }, itemStyle: { color: FARBE.ink },
        areaStyle: { opacity: 0.08 } }],
    }));

    mach('c-idx-' + m.kurz, Object.assign({}, GRUND, {
      legend: { data: ['26 Wochen', '156 Wochen'], top: 0, itemHeight: 8,
        textStyle: { fontSize: 11, color: FARBE.ink } },
      grid: { left: 44, right: 16, top: 34, bottom: 46 },
      xAxis: { type: 'category', data: m.datum, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', min: 0, max: 100, splitLine: { lineStyle: { color: FARBE.linie } },
        axisLabel: { fontSize: 10 } },
      dataZoom: zoom(),
      series: [
        { name: '26 Wochen', type: 'line', data: m.i26, showSymbol: false, connectNulls: false,
          lineStyle: { width: 1.8, color: FARBE.accent }, itemStyle: { color: FARBE.accent },
          markArea: { silent: true, itemStyle: { opacity: 0.13 }, data: [
            [{ yAxis: 80, itemStyle: { color: FARBE.pos } }, { yAxis: 100 }],
            [{ yAxis: 0, itemStyle: { color: FARBE.neg } }, { yAxis: 20 }]] } },
        { name: '156 Wochen', type: 'line', data: m.i156, showSymbol: false, connectNulls: false,
          lineStyle: { width: 1.5, type: 'dashed', color: FARBE.ink }, itemStyle: { color: FARBE.ink } },
      ],
    }));
  });

  // ── Saisonalität ──────────────────────────────────────────────────────
  if (!D.saison) return;
  var MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  function doyLabel(doy) {
    var d = new Date(Date.UTC(2001, 0, 1) + doy * 86400000);
    return d.getUTCDate() + '. ' + MON[d.getUTCMonth()];
  }

  D.saison.paare.forEach(function (p) {
    var kurvenNach = {};
    p.kurven.forEach(function (k) { kurvenNach[k.jahre] = k.kurve; });

    function option(jahre) {
      var k = kurvenNach[jahre] || [];
      return Object.assign({}, GRUND, {
        grid: { left: 52, right: 16, top: 18, bottom: 56 },
        tooltip: { trigger: 'axis', confine: true,
          formatter: function (ps) {
            if (!ps.length) return '';
            return doyLabel(ps[0].value[0]) + '<br><b>'
              + ps[0].value[1].toFixed(2) + '</b> (Jahresanfang = 100)';
          } },
        xAxis: { type: 'value', min: 0, max: 365, interval: 30.4,
          axisLabel: { fontSize: 10, formatter: function (v) { return MON[Math.min(11, Math.round(v / 30.4))]; } },
          splitLine: { lineStyle: { color: FARBE.linie } } },
        yAxis: achseY({ axisLabel: { fontSize: 10, formatter: function (v) { return v.toFixed(1); } } }),
        dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 12, brushSelect: false }],
        brush: { toolbox: ['lineX', 'clear'], xAxisIndex: 0, throttleType: 'debounce', throttleDelay: 200,
          brushStyle: { color: 'rgba(156,95,0,0.12)', borderColor: FARBE.accent } },
        toolbox: { show: false },
        series: [{ type: 'line', showSymbol: false, smooth: false,
          data: k.map(function (q) { return [q.doy, q.wert]; }),
          lineStyle: { width: 2, color: FARBE.pos }, itemStyle: { color: FARBE.pos },
          markLine: { silent: true, symbol: 'none',
            lineStyle: { color: FARBE.accent, width: 1.5 },
            label: { formatter: 'heute', fontSize: 10, color: FARBE.accent },
            data: [{ xAxis: D.saison.heuteDoy }] } }],
      });
    }

    var c = mach('c-saison-' + p.id, option(20));
    if (!c) return;
    c.dispatchAction({ type: 'takeGlobalCursor', key: 'brush',
      brushOption: { brushType: 'lineX', brushMode: 'single' } });

    // Zeitraum aufziehen → Auswertung je Jahr
    var kasten = document.getElementById('b-' + p.id);
    c.on('brushSelected', function (e) {
      var a = e.batch && e.batch[0] && e.batch[0].areas && e.batch[0].areas[0];
      if (!a || !a.coordRange) { kasten.textContent = 'Noch kein Zeitraum gewählt.'; return; }
      var von = Math.max(0, Math.round(a.coordRange[0]));
      var bis = Math.min(365, Math.round(a.coordRange[1]));
      if (bis - von < 2) { kasten.textContent = 'Zeitraum zu kurz — etwas weiter ziehen.'; return; }
      var iA = Math.round(von / 2), iB = Math.round(bis / 2);
      var rs = [];
      Object.keys(p.jahresMatrix).forEach(function (jahr) {
        var z = p.jahresMatrix[jahr];
        if (!z || z[iA] == null || z[iB] == null) return;
        rs.push({ jahr: jahr, ret: z[iB] - z[iA] });
      });
      if (rs.length < 3) { kasten.textContent = 'Zu wenige Jahre mit Daten in diesem Zeitraum.'; return; }
      var werte = rs.map(function (r) { return r.ret; }).sort(function (x, y) { return x - y; });
      var mittel = werte.reduce(function (x, y) { return x + y; }, 0) / werte.length;
      var med = werte.length % 2 ? werte[(werte.length - 1) / 2]
        : (werte[werte.length / 2 - 1] + werte[werte.length / 2]) / 2;
      var hoch = werte.filter(function (v) { return mittel > 0 ? v > 0 : v < 0; }).length;
      var quote = Math.round((hoch / werte.length) * 100);
      var f = mittel > 0 ? 'var(--pos)' : 'var(--neg)';
      kasten.innerHTML = '<b>' + doyLabel(von) + ' bis ' + doyLabel(bis) + '</b> · '
        + rs.length + ' Jahre'
        + '<div class="rr"><span>Mittel <b style="color:' + f + '">'
        + (mittel > 0 ? '+' : '') + mittel.toFixed(2) + ' %</b></span>'
        + '<span>Median <b>' + (med > 0 ? '+' : '') + med.toFixed(2) + ' %</b></span>'
        + '<span>Trefferquote <b>' + quote + ' %</b></span>'
        + '<span>bestes <b>' + werte[werte.length - 1].toFixed(2) + ' %</b></span>'
        + '<span>schlechtestes <b>' + werte[0].toFixed(2) + ' %</b></span></div>';
    });

    // Rückblick umschalten
    var leiste = document.querySelector('.jbs[data-gruppe="' + p.id + '"]');
    if (leiste) {
      leiste.addEventListener('click', function (ev) {
        var b = ev.target.closest('.jb');
        if (!b) return;
        leiste.querySelectorAll('.jb').forEach(function (x) { x.classList.toggle('an', x === b); });
        c.setOption(option(Number(b.dataset.jahre)), true);
        c.dispatchAction({ type: 'takeGlobalCursor', key: 'brush',
          brushOption: { brushType: 'lineX', brushMode: 'single' } });
      });
    }

    // Monatsbild
    mach('c-monat-' + p.id, Object.assign({}, GRUND, {
      grid: { left: 44, right: 16, top: 14, bottom: 28 },
      tooltip: { trigger: 'axis', confine: true,
        formatter: function (ps) {
          var m = p.monatsBild[ps[0].dataIndex];
          return MON[m.monat] + '<br>Mittel <b>' + (m.mittel == null ? '—' : m.mittel.toFixed(2) + ' %')
            + '</b><br>Trefferquote ' + (m.treffer == null ? '—' : Math.round(m.treffer) + ' %')
            + '<br>' + m.jahre + ' Jahre';
        } },
      xAxis: { type: 'category', data: MON, axisLabel: { fontSize: 10 } },
      yAxis: achseY({ axisLabel: { fontSize: 10, formatter: function (v) { return v.toFixed(1); } } }),
      series: [{ type: 'bar', data: p.monatsBild.map(function (m) {
        return { value: m.mittel, itemStyle: { color: m.mittel == null ? FARBE.faint
          : m.mittel >= 0 ? FARBE.pos : FARBE.neg } };
      }) }],
    }));
  });
})();
</script>
`;
}

module.exports = { baue, zahl, esc };
