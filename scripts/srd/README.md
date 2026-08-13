# SRD-Datengenerierung (offline, manuell)

Erzeugt die committeten Regel-Nachschlagewerk-Daten aus dem **deutschen** SRD-PDF
(SRD 5.2.1). Läuft **nicht** beim App-Build — der Maintainer führt die Scripts bei
Bedarf aus und committet die JSON-Ausgaben.

**Voraussetzung:** poppler-utils (`pdftotext`, `pdftohtml`) im PATH.
Die PDFs liegen unter `docs/srd/` (`DE_SRD_CC_v5.2.1.pdf`, dazu das englische Original).

## Stufe 1 — Regelglossar (Term + Definition)

```bash
node scripts/srd/extract-glossary.mjs "<DE-SRD.pdf>" 203 225
# → src/lib/data/rules-glossary.json   (155 Einträge: {de,en,cat,page,definition,seeAlso})
```

- Headwords = GillSans-SemiBold, D&D-Rot `#8c2220`, Größe 17–20; Definition = der
  Cambria-Fließtext dazwischen.
- **A–Z-Schnitt + en/cat** entstehen durch JOIN mit `src/lib/data/glossary.json`
  (autoritativ): nur die 155 Regelterme werden übernommen, Anhang-Kataloge
  (Flüche/Krankheiten/Gifte/Gefahren) fallen weg.
- Diagnose erwartet: `155/155`, keine FEHLEND-/LEERE-Warnungen.

## Stufe 2 — Regel-Prosa-Chunks (Volltextsuche)

```bash
node scripts/srd/extract-chunks.mjs "<DE-SRD.pdf>" 5 121
# → src/lib/data/rules-chunks.json   ({id,section,heading,page,text})
```

- Überschriften rot `#8c2220`, Größe 27/21/18 (H1/H2/H3); Chunk je Überschrift,
  lange Sektionen an Satzgrenzen gesplittet (~1400 Zeichen).
- Seitenbereich 5–121 = Regeln/Charaktererstellung/Klassen/Ausrüstung +
  Spellcasting-Regeln. Zauberliste (ab 122), Monster und magische Gegenstände bleiben
  draußen: die kommen als Bibliotheksinhalt aus Open5e (Stufe 3 für ihr Deutsch). Das
  Regelglossar (Stufe 1) wird bewusst NICHT mit-indiziert (keine Duplikate).

Beide Ausgaben werden vom Runtime-Modul `src/lib/services/rulesReference.ts`
geladen (Tier-1-Lookup + MiniSearch-Index).

## Stufe 3 — Deutsche Monster-Statblöcke (Import-Quelle, nicht Laufzeit)

```bash
node scripts/srd/extract-monsters.mjs "docs/srd/DE_SRD_CC_v5.2.1.pdf" 300-412 251
# → scripts/srd/monsters-de.json   (331 × {name,type_line,ac,hp,cr,abilities,page,groups})
```

- Die Statblock-Struktur steckt in den Fontspecs (Details im Kopf des Scripts): Name,
  Abschnitt („Merkmale"/„Aktionen"/…), Kopfzeile, Attributstabelle, Fließtext. Ein
  Merkmal beginnt an einem fett-kursiven Lauf — die einzige verlässliche Eintragsgrenze.
- Seite 251 gehört dazu, weil die **Riesenfliege** als Wertekasten im Magiegegenstände-
  Kapitel steht und im Anhang fehlt. Seiten ohne Statblöcke schaden nicht.
- Diagnose erwartet: `Statblöcke: 331`, dazu genau zwei Warnungen (ein Attributswert des
  ausgewachsenen weißen Drachen ist nicht lesbar; die Riesenfliege hat auch im Original
  keine Aktionen).
- Gelesen wird die Datei von `scripts/import-open5e-creatures.mts` und
  `scripts/migrate-monsters.mts`; die Zuordnung zu den englischen Kreaturen macht
  `scripts/srd/germanCreatures.ts` über die Zahlen des Statblocks, nicht über Namen.
