---
name: codex-design
description: Lässt den Design-Agenten (Codex mit eingebauter Bildgenerierung) Bilder erzeugen oder nachbessern – Charakterporträts, App-Icon, UI-Grafiken, Illustrationen. Verwenden, wenn ein neues Bild gebraucht wird oder ein vorhandenes geändert werden soll, auch bei „lass Codex …", „Design-Agent", „Icon generieren", „Bild erzeugen", „Porträt malen".
---

# Design-Agent über Codex

Bilder für dieses Projekt macht Codex (Desktop-App) mit seinem eingebauten Bildwerkzeug.
Claude gibt den Auftrag, wartet und prüft das Ergebnis. Aufgerufen wird nur über
`.claude/skills/codex-design/scripts/codex.sh`: Der Wrapper findet die CLI, rechnet die
Pfade um, gibt Schreibrecht **nur im Zielordner** (`-C`) und meldet hinterher, was sich dort
geändert hat.

## Zielordner

| Was | `-C` | Format |
|---|---|---|
| Charakterporträt | `vault/characters/<id>` | `portrait.png` oder `.jpg` (das `ImageField` nimmt nur diese beiden), Hochformat wie die vorhandenen (~1150 × 1400) |
| UI-Grafik (Logo, Hintergründe, Icons) | `static` → Laufzeitbild nach `branding/` | PNG/WebP mit Alpha, Größe nach Einsatzort |
| Stimmungsbild im Charakter-Wizard (Klasse, Volk, Hintergrund, Kombi Volk×Klasse) | `design/art/<typ>` | Roh-PNG 1024 × 1536. Die App lädt AVIF 640 × 960 aus `static/art/<typ>/<slug>.avif` (`slug` = Bibliotheks-Key ohne Quellpräfix, Kombi `<volk>-<klasse>`), Suche und Spiegelung in `services/wizard/originArt.ts`. Stilblock in `design/art/prompt.md` |
| Bibliotheks-Icon (Zauber, Monster, Gegenstand, Talent) | `design/art/<serie>-w<N>` | Quadratisch, echtes Alpha, ein Motiv ohne Kulisse. Die App lädt AVIF 512 × 512 aus `static/art/<serie>/<slug>.avif` (`libraryArt.ts`). Serienweise über `design/art-pipeline/icons/job.sh`, Stilblock in `icons/style.md` — **nicht** den Wizard-Stilblock nehmen |
| Figur je Volk × Äußeres (feminine/androgynous/masculine) und ihre Varianten je Klasse und Hintergrund | `design/art/figures-…` | Roh-PNG 1024 × 1536. Die App lädt `static/art/figures/<volk>-<äußeres>/species.avif`, `…/classes/<klasse>.avif` und `…/backgrounds/<hintergrund>.avif`; jede Variante bekommt das `species`-Bild der Figur als `-i`, damit es dieselbe Person bleibt |
| App-Icon | `static` → Quelle nach `branding/sources/` | 1024 × 1024-PNG mit Alpha. Die Größenvarianten erzeugt `npx tauri icon <quelle>` (unter Windows, über `powershell.exe`), nicht Codex. Danach die Ordner `android/`, `ios/` und `64x64.png` löschen, die `tauri.conf.json` nicht nutzt |

`static/` landet vollständig im Installer. Rohbilder, Vorschauen und Icon-Quellen gehören
nach dem Lauf nach `design/branding/`, in `static/branding/` bleibt nur, was die App lädt.
Wie die Serien ablaufen (Icons, Wizard-Figuren) und welche Skripte dazugehören, steht in
`design/art-pipeline/README.md`.
`design/art/` ist gitignored (Hunderte MB Roh-PNGs), dort liegt nur die lokale Arbeitskopie.

Ein Stimmungsbild, dessen Handlung **nach links** zeigt, gehört in `MIRRORED` in
`originArt.ts`: Links sitzt im Wizard die Karte und verdeckt sie sonst.

`vault/` ist ein eigenes Content-Repo mit eigenem `CLAUDE.md`. Vor einem Lauf dort lesen.
Ein neues Porträt wird erst über `portraitFile` in der Charakterdatei sichtbar. Das trägt
der Nutzer im Editor ein (Bild wählen), oder Claude nach Rückfrage.

## 1. Auftrag vorbereiten

- Zwei, drei vorhandene Bilder als Stilvorlage auswählen und mit `-i` anhängen
  (für Porträts z. B. `vault/characters/*/portrait.png`). Ohne Vorlage erfindet Codex
  einen eigenen Stil.
- In den Auftrag gehört:
  - **Was** (Motiv, Zweck in der App, Anzeigegröße). Bei Porträts die Beschreibung aus
    der Charakterdatei (Volk, Klasse, Aussehen) übernehmen, nicht ausdenken.
  - **Wohin**: Dateiname und Format aus der Tabelle oben. Rohbilder mit anderem Format
    oder anderer Größe dürfen in einen Unterordner `sources/`.
  - **Was Codex nicht anfassen darf**: „Ändere keine bestehenden Dateien, lege nur …
    an." Der Nutzer arbeitet parallel, und im Charakterordner liegt die Charakterdatei
    selbst. Ausnahme: Der Nutzer will ausdrücklich ein vorhandenes Bild ersetzt haben.
  - **Was Codex zurückmelden soll**: „Antworte knapp mit den Dateipfaden und dem
    verwendeten Prompt."
  - **Den Rückfall fürs Kopieren**, wörtlich: „If copying a generated image into the
    directory fails, list at the end one line per file in the form
    `<name>.png → <full raw path under generated_images>`." Siehe Abschnitt 3.
- Keine Schrift im Bild, es sei denn, der Nutzer will sie ausdrücklich.
- **Bei einer Serie** jedem Bild Pose, Effekt und Schauplatz einzeln vorgeben. Mit nur
  „vary the poses" malt Codex 30 Mal denselben Ausfallschritt nach rechts. Die Figur sollte
  nicht beiläufig auf ein Volk festgelegt werden: „human unless noted" ergab eine Reihe
  aus lauter Menschen.

## 2. Starten und warten

Ein Lauf dauert ein paar Minuten, bei mehreren Bildern länger. Deshalb **im Hintergrund**
starten (`run_in_background`) und auf die Benachrichtigung warten, nicht pollen:

```bash
.claude/skills/codex-design/scripts/codex.sh -C vault/characters/<id> \
  --out <scratchpad>/codex-<thema> \
  -i vault/characters/b3abde4e480b/portrait.png \
  "<Auftrag>"
```

**Parallel** laufen mehrere Sitzungen, aber nie dieselbe Sitzung zweimal. Jedem
Parallellauf einen eigenen Zielordner geben, sonst meldet der Wrapper die Dateien der
anderen Läufe als `neu:` mit. Eine neue Sitzung kennt den Stil nur aus den `-i`-Vorlagen
und dem wörtlich mitgegebenen Stilblock.

Den Auftrag als **ein** Argument übergeben oder mit `-` über stdin. Lange Aufträge vorher
in eine Datei schreiben und `codex.sh -C … - < auftrag.md` verwenden. Der Wrapper gibt
den Auftrag ohnehin über stdin weiter, Umlaute kommen also an.

## 3. Ergebnis prüfen

Die Ausgabe enthält die **Sitzungs-ID**, Codex' Antwort (`result.md`, der ganze Verlauf
steht in `log.txt`) und die Änderungen im Zielordner:

- `neu:` – erwartet.
- `WARNUNG bestehende Datei` oder `war schon in Arbeit` – Codex hat gegen den Auftrag
  etwas geändert. **Nicht selbst zurücksetzen**, dem Nutzer zeigen. Die Datei kann seine
  laufende Arbeit enthalten.

Steht in `result.md` „Copying failed …", sind die Bilder trotzdem fertig. Unter Windows
kann Codex, vor allem bei parallelen Läufen, seinen Hilfsprozess nicht starten. Dann
kopiert der Rückfall aus Abschnitt 1:

```bash
.claude/skills/codex-design/scripts/copy-raw.sh <out>/result.md <zielordner>          # legt nur neue Dateien an
.claude/skills/codex-design/scripts/copy-raw.sh <out>/result.md <zielordner> --force  # wenn ersetzt werden soll
```

Danach jedes erzeugte Bild mit `Read` ansehen, neben einer Stilvorlage. Prüfen: Stil,
Motiv gegen die Beschreibung, Bildgröße und Format (`file <bild>`). Bei Icons auch den
Alphakanal prüfen. Eine Serie über Übersichtsblätter prüfen statt Bild für Bild: WSL
hat weder PIL noch ImageMagick, `sharp` per `npm i` in einen Scratch-Ordner tut es
(Raster aus `resize` + `composite`). Damit entstehen auch die WebP-Fassungen.

## 4. Nachbessern

In **derselben** Sitzung, damit Codex Auftrag, Vorlagen und Prompt noch kennt:

```bash
.claude/skills/codex-design/scripts/codex.sh -C <zielordner> --resume <sitzungs-id> \
  --out <scratchpad>/codex-<thema>-2 "Gesicht etwas älter, sonst gleich"
```

Meldet `log.txt` `already has an active writer`, hält ein anderer Prozess die Sitzung
offen, meist weil sie in der Desktop-App oder mit `codex resume` geöffnet ist. Den Nutzer
bitten, sie dort zu schließen, oder einen neuen Lauf mit dem Bild als `-i` starten.

## 5. Abschluss

- Dem Nutzer melden: Dateien, Sitzungs-ID und Eindruck, auch was nicht passt.
- **Immer auch den Verbrauch melden**, wörtlich aus der Ausgabe des Wrappers: die Zeilen
  `Verbrauch`, `Kontingent` (belegt, frei, ab wann es zurückgesetzt wird) und `Abo`.
  Geld nennt Codex nicht, das Abo rechnet nicht pro Lauf ab. Das Kontingent steht nur in
  ganzen Prozent. Steigt es während eines Laufs nicht, war der Lauf kleiner als 1 %, nicht
  kostenlos. Steht dort `LIMIT ERREICHT` oder sind weniger als 10 % frei, gehört das an
  den Anfang der Meldung.
- Verworfene Bilder einzeln benannt löschen, nie per Wildcard.

## Gut zu wissen

- `exec`-Läufe erscheinen **nicht** in der Thread-Liste der Desktop-App. Sie haben
  `source: exec` und keinen Eintrag in `session_index.jsonl`. Im Terminal öffnet sie
  `codex resume <id>`.
- Die Rohbilder jeder Sitzung liegen zusätzlich unter
  `~/.codex/generated_images/<sitzungs-id>/`, falls Codex beim Kopieren etwas verloren hat.
- Ein Lauf geht über das ChatGPT-Abo des Nutzers. Im monster-slam-Projekt kostete das
  erste Icon rund 500.000 Tokens (fast alles aus dem Cache). Mehrere Bilder lieber in
  einem Auftrag bestellen als in vielen. Bei `--resume` zählt `Verbrauch` die ganze
  Sitzung, nicht nur den letzten Auftrag.
