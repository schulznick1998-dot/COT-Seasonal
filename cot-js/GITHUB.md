# In drei Schritten online

Danach hast du eine feste Adresse, die sich jeden Sonntag selbst aktualisiert.
Alles im Browser — kein Terminal, keine Installation.

## 1. Repository anlegen

Auf github.com oben rechts auf **+** → **New repository**

- **Repository name:** `cot`
- **Public** auswählen (für eine kostenlose Adresse nötig)
- **Create repository**

## 2. Dateien hochladen

Auf der neuen Seite: **uploading an existing file**

Entpack das ZIP und zieh **den kompletten Inhalt** ins Browserfenster —
also `run-cot.js`, den Ordner `lib`, den Ordner `tests` und den Ordner
`.github`.

> Wichtig: Der Ordner **`.github`** muss mit. Er ist der, der die
> Automatik enthält. Manche Systeme blenden Ordner mit Punkt am Anfang
> aus — falls er fehlt, im Explorer unter *Ansicht* die versteckten
> Elemente einschalten.

Unten auf **Commit changes**.

## 3. Veröffentlichung einschalten

Im Repository auf **Settings** → links auf **Pages** →
bei *Source* **GitHub Actions** auswählen.

Fertig.

---

## Was dann passiert

Der erste Lauf startet von allein und dauert ein paar Minuten. Du siehst
ihn oben unter **Actions**. Ist er grün, ist die Seite da:

```
https://DEINNAME.github.io/cot/
```

Diese Adresse kannst du weitergeben. Kollegen brauchen kein Konto und
keinen Login.

## Danach

Nichts. Jeden Sonntag um 10:00 deutscher Zeit holt sich die Seite die
neuen Daten selbst.

Wenn du zwischendurch aktualisieren willst: **Actions** →
**Seite aktualisieren** → **Run workflow**.

## Wenn ein Lauf rot ist

Vor dem Veröffentlichen laufen 75 Prüfungen. Schlägt eine fehl, wird
**nicht** veröffentlicht — dann bleibt lieber die alte Seite stehen, als
dass eine falsche Zahl online geht.

Klick den roten Lauf an, kopier die Ausgabe und schick sie mir. Da steht
immer im Klartext, welche Quelle nicht durchkam.
