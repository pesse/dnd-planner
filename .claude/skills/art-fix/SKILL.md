---
name: art-fix
description: Arbeitet Kritikpunkte an gemalten App-Bildern (Monster-Szenen, Icons, Wizard-Figuren) ab — prüft zuerst, ob der Brief des Bildes den Fehler erzwingt, korrigiert dann Brief oder Bild und reiht alles in die Korrektur-Pipeline (`design/art-pipeline/fixes/`) ein. Verwenden, sobald der User Markierungen aus dem Katalog oder der Werkbank einfügt („[offen] vault/art/… Position … Ort …"), Tester-Kritik an Bildern weitergibt, einen Bildfehler meldet („Hand verdreht", „so hält man keine Armbrust", „zwei Schwänze") oder eine Korrektur als missglückt zurückweist.
---

# Bildkorrektur mit Brief-Triage

Viele Bildfehler stehen schon im Brief: Der Brief verlangt etwas, das sich nicht malen lässt, und
das Bildmodell improvisiert. Ein Edit am Bild kann so einen Fehler nicht beheben. Beim Zähen gab es
zwei Edit-Runden ohne Erfolg, weil der Brief drei Hände verlangte. Deshalb wird **jeder Kritikpunkt
zuerst gegen seinen Brief geprüft**.

## 1. Kritikpunkte aufnehmen

Eingabe wie aus dem Katalog:

```
1. [offen] vault/art/monster-scenes/tough.avif
   Position: x 67.9 %, y 37.5 % (Pixel 435, 360 von 640×960)
   Ort: catalog: catalog:monster · Dialog „Zäher"
   So wird keine Armbrust gehalten
```

Jeder Punkt wird eine Zeile in `design/art-pipeline/fixes/todo.md`, fortlaufend nach der höchsten
vorhandenen Nummer. Das Format steht im Kopf der Datei. Status `[ ]`, Notiz wörtlich vom User. Was
die Triage ergänzt, kommt in Klammern dahinter. Zeilen erst nach der Triage schreiben, denn sie
legt `edit` oder `neu` fest.

Bei vielen Punkten die Triage in Paketen an Subagenten geben (ca. 15 je Agent, `effort: "lower"`).
Jeder bekommt diesen Skill-Pfad, seine Punkte und den Auftrag, je Punkt das Ergebnis aus Schritt 3
zurückzumelden, ohne Dateien zu ändern. Brief-Korrekturen und `todo.md` schreibt nur die
Hauptsitzung.

## 2. Bild und Brief ansehen

- **Bild:** Das ganze AVIF und einen Ausschnitt um die Klickstelle ansehen:
  `node design/art-pipeline/sharp/crop.mjs vault/art/<pfad>.avif <scratchpad>/crop.png x y w h`
  (Pixel aus der Markierung, Ausschnitt etwa 300–400 px). Benennen, was dort tatsächlich zu sehen
  ist, nicht nur, was die Notiz behauptet.
- **Brief:**

| Bild unter `vault/art/` | Brief |
|---|---|
| `monster-scenes/<slug>` | Zeile `<slug>` in `design/art-pipeline/monster-scenes/scenes.tsv`, Stilblock `head.md` |
| `monsters/`, `items/`, `feats/`, `traps/<slug>` (Icons) | `design/art-pipeline/icons/motifs/<serie>.tsv`, Stil `icons/style.md` |
| `figures/<figur>/species` | `design/art-pipeline/variants/all/figures.tsv` |
| `figures/<figur>/classes/…`, `…/backgrounds/…` | `CLASSES` bzw. Hintergründe in `variants/all/roles.mjs` |
| `figures/<figur>/subclasses/…` | `SCENES` in `variants/subclasses/scenes.mjs` |

## 3. Triage: Wo liegt der Fehler?

Den Brief gegen diese Liste prüfen:

- **Hände-Budget:** Jede gehaltene oder geführte Sache und jede Handlung zählen. Zweihandwaffen
  (schwere Armbrust, Lang- und Kurzbogen, Zweihänder, Stangenwaffe, Kampfstab im Kampf, die meisten
  Instrumente) belegen beide Hände. Mehr Aufgaben als Hände → **widersprüchlich**.
- **Unvereinbare Handlungen:** zielen und zuschlagen, rennen und sorgfältig zaubern, ein Objekt
  ablegen und zugleich schwingen.
- **Ziel und Blick:** Richtung von Blick, Waffe und Wirkung stimmen überein. Die Handlung zeigt nach
  rechts, das linke Drittel verdeckt die Oberfläche.
- **Was das Modell nicht kann:** aufgeschlagene Bücher in Schräglage, Instrumente mit Saiten,
  ausdrücklich verlangte Händigkeit, Finger in Nahaufnahme, verschränkte Gliedmaßen. Der Brief
  sollte die Form wählen, die das Modell kann: geschlossener Foliant, Faust am Griff, Arme getrennt.
- **Die Notiz gegen den Brief:** Verlangt der User etwas, das der Brief ausschließt (anderes
  Geschlecht, andere Farbe, andere Waffe)? Dann muss der Brief mit, sonst taucht der Fehler beim
  nächsten Neumalen wieder auf.

Ergebnis je Punkt, mit einem Satz Begründung:

| Befund | Was tun | Modus |
|---|---|---|
| **Brief widersprüchlich** oder schließt den Wunsch aus | Brief an der Quelle korrigieren und den korrigierten Satz als `Neuer Brief: …` in die Notiz schreiben | `neu` |
| **Brief lädt zum Fehler ein** (Liste oben) | Brief an der Quelle vereinfachen. Lokaler Fehler: `edit` mit dem neuen Satz in der Notiz; sonst `neu` | `edit`/`neu` |
| **Brief sauber, Malfehler** | wie bisher, gezielter Edit am Original | `edit` |

**Ausschmückung streichen statt präzisieren.** Ein Detail, das für das Motiv nichts trägt (Umhang vor
dem Mund, Keule zusätzlich in der Hand), fliegt aus dem Brief, statt genauer beschrieben zu werden.
Beim jungen grünen Drachen hat „Umhang als Maske" zweimal eine dritte Hand am Gesicht erzeugt, erst
ohne die Maske stimmte der Schütze.

Notizen kurz halten. Je mehr Einzelvorgaben eine Edit-Notiz macht (Fingerstellung, Winkel), desto
eher erfindet das Modell eine neue falsche Haltung. Lieber den Sollzustand in einem Satz beschreiben
und die Hand-Regel von `run.mjs` greifen lassen.

`neu` mit `Neuer Brief:` malt die Handlung nach dem neuen Brief und nimmt vom Original nur Figur,
Schauplatz und Stil (`run.mjs`). Ohne `Neuer Brief:` übernimmt `neu` den Bildinhalt des Originals
und damit einen Brief-Fehler gleich mit.

## 4. Malen und prüfen

Läufe, Vorher/Nachher-Blatt und Status stehen in `design/art-pipeline/README.md` unter
„Korrekturen aus den Katalog-Markierungen". Danach jedes Ergebnis gegen die Notiz **und** die
Triage prüfen: Hat sich die kritisierte Stelle wirklich geändert, und ist kein neuer Fehler
entstanden? Dazu einen Ausschnitt mit `crop.mjs` ansehen und **jeden Arm von der Hand bis zur
Schulter und jede Sehne oder jeden Schaft von Ende zu Ende verfolgen**. Ein Blick aufs Gesamtbild
reicht nicht, so ist ein Bogen mit losem Sehnenende durchgerutscht. Bei Händen die Händigkeit prüfen (siehe Memory „Bildfehler per Edit statt Neumalen").
Ist ein Punkt zum zweiten Mal gescheitert, kommt keine dritte Edit-Runde: zurück zu Schritt 3, der
Brief ist dann fast immer der Grund.

## 5. Abschluss

- Brief-Korrekturen und `todo.md` im App-Repo committen, Bilder im Vault-Repo (`fix: …`, deutsch).
- Dem User melden: wie viele Punkte auf `edit` und `neu` entfallen und **welche Briefs korrigiert
  wurden**, mit dem Muster dahinter (z. B. „7× Zweihandwaffe plus zweite Waffe in der Hand"). Ein
  Muster, das öfter auftritt, gehört als Regel in den Stilblock der Serie (`head.md`, `style.md`,
  `variants/all/head.md`).
- Verbrauch und Kontingent wörtlich aus `fixes/out/run.log`.
