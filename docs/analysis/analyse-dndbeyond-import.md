# D&D-Beyond-Import

Stand 2026-10-31. Importiert einen **öffentlichen** D&D-Beyond-Charakter über den Link als
Wizard (Seitenleiste „Charaktere" → ⇪).

## Warum der Link und nicht das PDF

Untersucht wurden zuerst zwei PDF-Exporte. Sie tragen alle Spielwerte als Formularfelder, aber:

- D&D Beyond **kürzt Freitexte** (Hintergrundgeschichte, Ideale …) beim Export auf die Feldgröße.
- Das PDF zeigt **Ergebnisse, keine Wahlen**: keine Unterklasse, keine Optionswahlen, kein
  „ausgerüstet", keine Buchquelle, keine Beschreibung fehlender Inhalte.

Der inoffizielle Character-Service (`character-service.dndbeyond.com/character/v5/character/{id}`)
liefert all das, auch ohne Anmeldung, wenn der Charakter öffentlich ist. Der PDF-Weg ist entfernt.
Vorbild für die abgeleiteten Werte (RK, TP, Fertigkeiten): [@natowb/ddb-parser](https://npmjs.com/package/%40natowb%2Fddb-parser),
[charactercheck](https://github.com/chaoz23/charactercheck).

## Ablauf

```
Link → fetchCharacter → ddbCharacterJsonSchema (nur gelesene Teilmenge, alles nullish)
     → parseJson → DdbSheet (englisch, ohne Bibliothek)
     → buildDdbCharacter(sheet, libs, {resolutions}) → Character + details.md + Befunde
```

`services/ddbImport/`:

| Datei | Aufgabe |
|---|---|
| `fetchCharacter.ts` | Link → ID, Abruf, deutsche Fehlermeldungen (privat, 404, Formatwechsel) |
| `jsonDerived.ts` | Attribute, RK, TP, Fertigkeiten, Bewegung aus Grundwerten + Modifikatoren |
| `parseJson.ts` | JSON → `DdbSheet`, mit Buchquelle, Homebrew-Flag und Beschreibung (HTML → Text) |
| `assemble.ts` | Werte, die ohne Bibliothek feststehen |
| `linkEntities.ts` | Entscheidungen anwenden, dann `collectLegacyFixes`; Unterklasse, Talente, Zauber |
| `declaredChoices.ts` | Zweigwahlen („Forest Gnome", „Primal Order: Warden") gegen `optionList` |
| `findings.ts` | Befunde und Entscheidungen (`link` / `create` / `freetext` / `drop`) |
| `sources.ts` | Quellenkatalog `www.dndbeyond.com/api/config/json`: Buchtitel, 2014/2024 |
| `createEntries.ts` | Talent/Gegenstand aus D&D Beyond als Vault-Eintrag |
| `session.ts` | Ablauf des Wizards: analysieren, Bibliothek durchsuchen, anlegen |

Ohne Entscheidung gilt **Freitext**: Talente bleiben als unverknüpfter Eintrag mit Beschreibung,
Gegenstände als Inventarzeile ohne Link, Zauber landen mit Beschreibung in `details.md`.

## Wizard

Schritte: Charakter laden → Grundlagen → Talente → Ausrüstung → Zauber → Prüfen & anlegen.
Schritte ohne Befund entfallen. Jeder Befund nennt das Buch und gibt einen Hinweis:

- **2014er-Regeln** (Kategorien „5e Core/Expanded Rules", „Legacy"): mit dem 2024er-Gegenstück verknüpfen.
- **2024er-Grundregeln**, aber nicht in der Bibliothek: vermutlich fehlt ein Inhaltspaket.
- **Anderes Buch** (z. B. The Crooked Moon): anlegen unter der Herkunft `<buch>-import`.
- **Homebrew in D&D Beyond**: anlegen als `homebrew-sam`.
- **Mehrdeutig** (zwei Bibliothekseinträge gleichen Namens): Kandidaten zur Wahl, der erste ist vorbelegt.

## Import-Herkünfte `<buch>-import`

`schemas/source.ts` lässt neben den festen Herkünften die Familie `^[a-z0-9-]+-import$` zu
(`importSourceFromTitle` schlägt den Kurznamen aus dem Buchtitel vor). Solche Einträge sind
nur lokal: Der Dateiname trägt die Herkunft (`dark-bargain.crooked-moon-import.json`), damit
`.gitignore` des Vaults sie fernhält. `build_packs.py` überspringt sie. Diese Vault-Änderung
steht noch aus (eigener Vault-Worktree).

Angelegt wird mit dem englischen Text aus D&D Beyond und **ohne `grants`**: Das fehlende Feld
schickt den Eintrag durch die KI-Analyse. Übersetzung und Mechanik kommen danach im Editor dazu.

## Grenzen

- Der Endpunkt ist undokumentiert; ändert er sich, meldet der Import „unerwartetes Format".
- Zauber kommen als Zusatzbestand (`spellcasting.manual.extra`) und sind im Editor den Quellen zuzuordnen.
- Kein Porträt, kein Spielzustand (aktuelle TP, verbrauchte Slots).
- Sprachen bleiben englisch.
- Neue Capability-URLs (`character-service.dndbeyond.com`, `www.dndbeyond.com/api/config/json`)
  brauchen einen Rust-Neubau.
