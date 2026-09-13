# COT und Saisonalität

Baut aus zwei amtlichen bzw. frei zugänglichen Quellen eine einzelne, in
sich geschlossene HTML-Seite:

- **Positionierung** — Commitments of Traders der CFTC: Netto-Positionen
  der drei Gruppen, Open Interest, COT-Index nach Larry Williams, für elf
  Märkte
- **Saisonalität** — exakte Datumsfenster mit empirischem Nulltest,
  mittlerer Jahresverlauf umschaltbar über 5/10/15/20 Jahre, Monatsbild

Alle Charts sind **interaktiv** (ECharts): hineinzoomen, Werte ablesen, und
auf der Saisonkurve einen Zeitraum aufziehen — darunter steht sofort, was
dieser Zeitraum in jedem einzelnen Jahr gebracht hat (Mittel, Median,
Trefferquote, bestes und schlechtestes Jahr). Die Chart-Bibliothek wird beim
Öffnen aus dem Netz geladen; ohne Internet erscheint statt der Charts ein
Hinweis, die Zahlen in den Tabellen bleiben lesbar.

## Starten

```bash
node run-cot.js
```

Das ist alles. **Keine Abhängigkeiten, kein `npm install`, kein Schlüssel,
kein Konto.** Node 18 oder neuer. Dauer: wenige Minuten, das meiste davon
Download.

```bash
node run-cot.js --ohne-saison     # nur COT, geht in Sekunden
node run-cot.js --ziehungen 500   # gründlichere Zufallslatte, langsamer
node run-cot.js --wochen 420      # mehr COT-Historie
```

Danach liegen zwei Dateien da:

- `cot.html` — die fertige Seite, direkt im Browser zu öffnen
- `cot_daten.json` — dieselben Zahlen als Datensatz

**Beide an Claude schicken**, wenn die Seite unter einer festen Adresse
liegen soll.

## Warum das Skript bei dir läuft und nicht bei Claude

Claudes Arbeitsumgebung darf weder die CFTC- noch die Yahoo-Schnittstelle
direkt anfragen; jeder Versuch endet mit `403`. Ein Umweg über ein
Werkzeug, das die Antwort zusammenfasst, wäre bei Kursdaten das Falsche —
bei zehntausenden Zahlen ist eine stille Verfälschung nicht auszuschliessen.
Deshalb holt das Skript die Daten dort, wo sie unverändert ankommen.

## Woher die Daten kommen

| Was | Quelle | Schlüssel |
|---|---|---|
| Positionierung | `publicreporting.cftc.gov` Reihe `6dca-aqww` (Legacy, Futures only) | nein |
| Tageskurse | `query1.finance.yahoo.com` — dieselben Symbole wie im alten System | nein |

COT wird über den **Kontraktcode** geschlüsselt, nicht über den Namen.
Namen ändern sich ("NEW ZEALAND DOLLAR" heisst in der Reihe "NZ DOLLAR"),
Codes nicht — und ein unscharfer Namensvergleich zieht Kreuz-Kontrakte
mit herein. Dieselbe Lehre stand schon im alten `cot-live.js`.

## Die eingebaute Gegenprobe

Futures sind nullsummig — zu jedem Long gehört ein Short. Also gilt als
Identität, nicht als Näherung:

```
Commercials + Large Specs + Small Specs = 0
```

Jede geladene Woche wird daraufhin geprüft. Eine Zeile, die sie verletzt,
hat falsch zugeordnete Felder und kommt **nicht** auf die Seite — sie wird
gemeldet, nicht repariert. Das fängt genau den Fehler ab, der bei diesen
Daten am leichtesten passiert: Legacy-Format und TFF-Format verwechseln.
Beide sehen gleich aus und haben völlig andere Spalten.

## Was der COT-Index misst

```
Index = 100 × (heute − Tief) / (Hoch − Tief)
```

Hoch und Tief über die letzten N Wochen. 100 = höchster Stand des Fensters,
0 = tiefster. Die Seite zeigt **zwei** Fenster nebeneinander:

- **26 Wochen** — reagiert schnell, meldet oft
- **156 Wochen** — Williams' klassische Einstellung, meldet selten

Dieselbe Zahl kann relativ zu einem ruhigen Halbjahr extrem aussehen und im
Dreijahresvergleich völlig unauffällig sein. Steht der kurze Index bei 100
und der lange bei 45, ist das kein historisches Extrem.

Solange weniger Wochen vorliegen als das Fenster verlangt, steht kein Wert —
bewusst kein halb gefüllter, weil ein Index über drei Wochen Historie wie
ein Extrem aussieht, ohne eines zu sein.

## Was der Index NICHT misst

Wegen der Nullsumme ist die Commercial-Position **kein unabhängiges zweites
Signal**, sondern das arithmetische Spiegelbild der Spekulanten. Ein
Commercial-Extrem *ist* ein Spekulanten-Extrem. Gemessen wird **Gedränge** —
wie voll der Trade ist — und nicht Insiderwissen.

Bei Gold und Öl fällt beides zusammen: Der Commercial ist dort ein Produzent
oder Verbraucher mit echtem Wissen über die Ware. Bei Währungen nicht — dort
besteht die Commercial-Seite überwiegend aus Bank-Händlern, die die
Gegenseite des Kundenflusses lagern. Die Seite schreibt das bei jedem Markt
dazu.

Der Effekt bleibt brauchbar: Ein überfüllter Trade hat wenig verbleibende
Käufer. Aber die Begründung sagt auch, wann er versagt — im echten Trend,
wenn die Menge recht behält.

## Warum das Open Interest danebensteht

Der Index allein ist ein Warnschild, kein Einstieg. Das Open Interest trennt
die zwei Fälle, die ein Extrem haben kann:

- **steigend** → frisches Geld läuft noch in die volle Seite. Reif, aber riskant.
- **fallend** → die Position wird bereits aufgelöst. Die Bewegung läuft schon.

Schwelle 3 % über vier Wochen; kleinere Ausschläge sind Rauschen.

## Saisonalität — und warum der Nulltest der Kern ist

Gesucht werden Fenster wie „18. September bis 2. Oktober" — exakte
Datumsfenster, nicht Kalendermonate. Also das, was sich handeln lässt.

Die naheliegende Regel — Trefferquote über 75 % bei mindestens 10 Jahren —
ist wertlos, und zwar aus zwei Gründen:

- Die Rückblickperioden sind **ineinander geschachtelt**. Das 20-Jahres-
  Fenster enthält das 5-Jahres-Fenster. Vier gleiche Vorzeichen sind keine
  vier Belege, sondern fast einer.
- Es werden **über hundert Fenster gleichzeitig** geprüft. Bei genug
  Versuchen sieht immer eines gut aus.

Stattdessen wird gefragt: *Wie gut wäre das beste Fenster, wenn es gar keine
Saisonalität gäbe?* Dazu werden die Renditen mehrere hundert Mal verwürfelt
und jedes Mal der beste Fensterwert notiert. Ein Muster gilt nur, wenn es
besser ist als 95 % dieser Zufallsbestwerte.

### Wie verwürfelt wird — der Punkt, an dem es beim Bauen schiefging

**Jedes Jahr für sich**, nicht die Reihe am Stück.

Der erste Entwurf verschob die ganze Reihe zyklisch. Das klingt richtig, ist
es aber nicht: Ein echtes Jahresmuster wandert dabei geschlossen an eine
andere Kalenderstelle und ist dort genauso stark. Die Zufallslatte enthielt
dann das Muster, das sie widerlegen soll — und ein eingebautes Testmuster
fiel durch, obwohl es eindeutig da war.

Geprüft wird aber genau die Behauptung: *dasselbe* Kalenderfenster zeigt
*über die Jahre* dieselbe Richtung. Verschiebt man jedes Jahr um einen
eigenen Betrag, bleibt die Renditestruktur jedes einzelnen Jahres exakt
erhalten — nur der Gleichklang zwischen den Jahren verschwindet. Das ist die
Nullhypothese, die hierher gehört.

Zusätzlich müssen gelten: gleiches Vorzeichen über alle vier Rückblick-
perioden, und der Median folgt dem Mittelwert (sonst tragen ein, zwei
Ausreisserjahre alles).

**Kein bestätigtes Fenster ist das häufigste Ergebnis und kein Fehler.**

### Der mittlere Jahresverlauf

Umschaltbar über 5, 10, 15 und 20 Jahre, mit senkrechter Linie für „heute",
darunter das Monatsbild mit mittlerer Monatsrendite und Trefferquote.
Methode wie im alten System: je Jahr der Pfad als kumulierte Prozent-
Performance ab Jahresanfang, auf den Tag im Jahr gelegt, über die Jahre des
Fensters gemittelt.

## Selbst nachprüfen

```bash
node tests/test-mathe.js    # 40 Prüfungen der Rechnung, ohne Netz
node tests/test-seite.js    # 29 Prüfungen, baut probe.html aus erzeugten Daten
```

Die beiden entscheidenden stehen in `test-mathe.js`:

- In einer **reinen Zufallswelt** über 21 Jahre darf **nichts** bestätigt werden.
- Dieselbe Welt mit einem **eingebauten September-Muster**: es muss gefunden
  werden, mit der richtigen Richtung und p ≤ 0,05.

Fallen diese beiden nicht auseinander, ist der Nulltest kaputt und jedes
Ergebnis wertlos.

Dazu die Randfälle, an denen ein Index still falsch wird: flaches Fenster
(nicht definiert statt 100), zu kurze Historie (leer statt geraten), ein
Extrem das aus dem Fenster fällt — und die Nullsummen-Identität an echten
Zahlen des kanadischen Dollars vom 8. September 2026.

## Dateien

```
run-cot.js            Ablauf: holen, rechnen, Seite schreiben
lib/maerkte.js        welche Kontrakte, welche Paare, wo der Commercial ein Insider ist
lib/quellen.js        CFTC und Yahoo, meldet jede Lücke im Klartext
lib/cot.js            COT-Index, Open-Interest-Richtung, Nullsummen-Prüfung
lib/saison.js         Datumsfenster, Nulltest, Jahreskurve, Monatsbild
lib/seite.js          HTML und SVG-Charts, ohne Bibliothek
tests/test-mathe.js   40 Prüfungen gegen bekannte Antworten
tests/test-seite.js   29 Prüfungen, baut die komplette Seite
```

## Wenn etwas nicht geht

Das Skript bricht nicht still ab. Jede fehlgeschlagene Quelle steht unter
„Meldungen aus der Beschaffung" mit Grund, und die fertige Seite führt sie
oben unter „Nicht beschafft" auf. Diesen Block kopieren und schicken.
