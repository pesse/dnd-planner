# Bild-Workflows

Alle Bilder malt Codex über `.claude/skills/codex-design/scripts/codex.sh` (Skill `codex-design`: Aufruf, Rückfall beim Kopieren, Verbrauchsmeldung). Roh-PNGs liegen ungetrackt unter `design/art/`, die App lädt komprimierte Fassungen aus `vault/art/`. Einmalig `npm install` in `sharp/` (WSL).

| Workflow | Stil | Roh → App | Ablauf |
|---|---|---|---|
| Bibliotheks-Icons: Zauber, Monster, Gegenstände, Talente | kleines Einzelmotiv, freigestellt mit echtem Alpha | `design/art/<serie>/<slug>.png` (1254² RGBA) → `vault/art/<serie>/<slug>.avif` (512², q55) | [Icons](#bibliotheks-icons) |
| Stimmungsbilder im Charakter-Wizard: Klasse, Volk, Hintergrund, Volk×Klasse | Hochformat mit Handlung und Kulisse, deckend | `design/art/<typ>/<slug>.png` (1024×1536) → `vault/art/<typ>/<slug>.avif` (640×960) | Stilblock `design/art/prompt.md`, Einzelläufe nach Skill |
| Wizard-Figuren je Volk × Äußeres, mit Varianten je Klasse, Hintergrund und Subklasse | wie Stimmungsbilder, dieselbe Person über alle Varianten | `design/art/figures-…` → `vault/art/figures/<volk>-<äußeres>/…` | [Figuren](#wizard-figuren) |
| Porträts, UI-Grafik, App-Icon | je nach Einsatz | siehe Tabelle im Skill | Einzelläufe nach Skill |

Die beiden Familien teilen nur die PHB-Malweise. Ein Icon ist kein Wizard-Bild in klein: kein Schauplatz, keine Figur in Aktion, kein Pergamentrand. Die App legt es selbst auf Karten und Listen.

## Bibliotheks-Icons

Die App findet ein Icon über den Bibliotheks-Key ohne Quellpräfix (`srd-2024_fireball` → `fireball`, `src/lib/libraryArt.ts`). Nicht jeder Eintrag hat ein Bild; ob es eins gibt, entscheidet erst das `<img>`.

| Datei | Inhalt |
|---|---|
| `icons/style.md` | der gemeinsame Auftrag mit Stilblock, Platzhalter `{{…}}` je Serie |
| `icons/series.json` | Werte je Serie: Bildanteil des Motivs, Farbe, Freistellung, Stilvorlagen (`refs`) |
| `icons/motifs/<serie>.tsv` | eine Zeile je Bild: `slug⇥englischer Name⇥Motiv` |

1. **Motive schreiben**, eins pro Eintrag, Englisch, ein klarer Gegenstand oder eine Kreatur. Bei vielen Einträgen übernehmen Subagenten je einen Block aus Name, Typ und Regeltext.
2. **Probe**: `RUNS=1 BATCH=3 bash icons/job.sh <serie> 0 1`, dann das Blatt prüfen (Schritt 4). Erst danach die ganze Serie.
3. **Malen**: mehrere Worker parallel, jeder mit eigenem Ordner `design/art/<serie>-w<W>`. Jeder Codex-Lauf malt ein Paket von `BATCH` (10) Bildern. Der Worker hört auf, wenn nichts mehr offen ist, das Kontingent `LIMIT` (44 %) erreicht oder `icons/out/<serie>/STOP` existiert. Ein gestoppter Worker setzt beim nächsten Start mit dem Fehlenden fort.
   ```bash
   for w in 0 1 2 3; do bash design/art-pipeline/icons/job.sh feats $w 4 & sleep 5; done; wait
   ```
   Zum Schluss wandelt `sharp/icon.mjs` jedes Bild nach `vault/art/<serie>/` und schiebt die Roh-PNGs in `design/art/<serie>`. Das Protokoll mit Verbrauch und Kontingent je Paket steht in `icons/out/<serie>/run.log`.
4. **Prüfen**: `node sharp/iconsheet.mjs <blatt.png> design/art/<serie>` legt ein Übersichtsblatt auf dunklem Grund an und meldet Bilder mit deckendem Rand. Bei diesen hat Codex den Hintergrund nicht freigestellt. Verworfene Bilder einzeln löschen, ebenso ihr `.avif`, und den Worker erneut starten.

**Gegenstände mit Varianten** (`+1 Langschwert`, `Flammenzunge …`, `Gürtel der Riesenstärke (…)`) malt Codex nicht neu. Er bearbeitet das Bild des Grundgegenstands: gleiche Form, gleicher Ausschnitt, nur der Effekt kommt dazu. Dafür bekommt der Auftrag Gruppen aus Wurzel und Varianten, die Wurzel als `-i`, und eine Effektzeile je Familie. Der Abschnitt dazu ersetzt im Auftrag die Überschrift `Items:`:

> Items come in GROUPS. A group starts with its ROOT (the plain base item) followed by VARIANTS. If the root is listed as "generate", create it first from its line. If the root is listed as "already exists", it is attached as an image: do NOT regenerate it. Create every VARIANT by EDITING the root image (give the root image to your image tool as the input/reference image): keep the object identical in shape, proportions, angle, framing, scale, palette and lighting, and apply ONLY the described change. Variants of the same root must look like the same object with different enchantments, never a redesign.

## Wizard-Figuren

Malt die Figuren (`vault/art/figures/<volk>-<äußeres>/`) und bessert markierte Bilder nach. Erwartet den Symlink `~/dnd-art-queue` auf diesen Ordner, weil die Skripte mit absoluten Pfaden rechnen.

| Schritt | Befehl (aus dem Repo-Root) |
|---|---|
| Werkbank zum Sichten und Markieren | `npm run artlab` → :8898, Markierungen in `design/art/figures/redo.json` |
| Alle Varianten malen (fehlende Rollen) | `xargs -P 6 -L 1 bash ~/dnd-art-queue/variants/all/job.sh < jobs.txt` mit Zeilen `<figur> <teil>` |
| Markierte Bilder einplanen | `cd ~/dnd-art-queue/redraw && node plan.mjs --apply` |
| Eingeplante neu malen | `xargs -P 10 -L 1 bash ~/dnd-art-queue/redraw/job3.sh < ~/dnd-art-queue/redraw/jobs.txt` |
| Subklassen malen (feste Szene je Subklasse, `variants/subclasses/scenes.mjs`) | `xargs -P 6 -L 1 bash ~/dnd-art-queue/variants/subclasses/job.sh < jobs.txt` mit Zeilen `<figur> <sa\|sb\|sc>` |
| Vergleichsblatt der Prüffiguren je Subklasse | `node design/art-pipeline/sharp/subsheet.mjs <zielordner> [slug,slug]` |
| KI-Review einer Figur | Subagent mit `review/prompt.md`, Ergebnis `review/<figur>.json` → `node review/post.mjs <figur>` |

Bildregeln stehen in `variants/all/head.md` (für alle), `variants/all/roles.mjs` (je Rolle, Szenen-Rotation, Gegner) und `variants/subclasses/scenes.mjs` (eine feste Szene je Subklasse — ein Fehler dort wird im Brief korrigiert, nicht mit einer anderen Szene umgangen). Figuren-Identität und Volksbeschreibung: `variants/all/figure.sh`. Eine Notiz mit „komplett neu“, „neu machen“ oder „andere Szene“ — oder drei verworfene Fassungen in `old/` — erzwingt eine neue Szene. Rohbilder liegen ungetrackt in `design/art/figures-var2/` und `design/art/figures-sub/`.
