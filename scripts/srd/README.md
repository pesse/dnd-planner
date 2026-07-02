# SRD-Datengenerierung (offline, manuell)

Erzeugt die committeten Regel-Nachschlagewerk-Daten aus dem **deutschen** SRD-PDF
(SRD 5.2.1). Läuft **nicht** beim App-Build — der Maintainer führt die Scripts bei
Bedarf aus und committet die JSON-Ausgaben.

**Voraussetzung:** poppler-utils (`pdftotext`, `pdftohtml`) im PATH.
Das PDF liegt NICHT im Repo (Pfad als Argument übergeben).

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
  Spellcasting-Regeln. Zauberliste (ab 122), Monster, magische Gegenstände sind
  ausgeschlossen (DnD-API-Domäne). Das Regelglossar (Stufe 1) wird bewusst NICHT
  mit-indiziert (keine Duplikate).

Beide Ausgaben werden vom Runtime-Modul `src/lib/services/rulesReference.ts`
geladen (Tier-1-Lookup + MiniSearch-Index).
