# Modul-Refactor: Übergabe-Stand

> Arbeitsstand zu `plan-modul-refactor.md`. Branch **`refactor/module-schnitt`**, abgezweigt von
> `main` auf `1e3b16c`. Jede Etappe ist ein Commit. Dieses Dokument ist der Einstieg für jede
> Etappe, die noch offen ist — es hält fest, was schon gilt und welche Fallen die ersten vier
> Etappen gekostet haben.

## Erledigt

| Etappe | Commit | Ergebnis |
|---|---|---|
| 0 · Vorbereitung | `b59c3ac` | Drei Regeln in `CLAUDE.md`; `npm run verify` |
| 1 · Geteilte Kleinteile | `5cb7489` | `utils/text.ts`, `utils/num.ts`, `schemas/abilities.ts`, `domain/skills.ts`, `services/library/{createLibrary,nameIndex}.ts`; `itemLibrary` → `itemLabels`/`itemFormat` |
| 2 · Schemas entflechten | `7673740` | `shared.ts` weg → `source`/`vocabulary`/`grants`/`featureChoice`/`llmJson` + `utils/vaultJson`; `character.ts` → `characterSchema`/`characterUpgrades`/`classLevelText` |
| 3 · Zyklus + Domänenmitte | `0352eeb` | `analysis/types.ts`; `levelUp/*` (7), `declaration/*` (5), `featureEffects*` (4), `open5e*` (4), `classTableParse`; `applyChanges` als Tabelle. **0 Import-Zyklen** |

## Offen

Etappe 4 bis 8 aus `plan-modul-refactor.md`. Reihenfolge einhalten — 4 und 5 verkleinern die
Dateien, die 7 dann anfasst.

## Das Gate

`npm run verify` = `check` + `check:evals` + `schema:examples:check` + `test`. Vor jedem Commit,
und **0 Fehler** ist die Grenze (56 Warnungen sind der Bestand, sie dürfen nicht wachsen).
Zyklen prüft `npx madge --circular --extensions ts,svelte src/lib` — muss „No circular
dependency found" sagen.

Referenzstand nach Etappe 3: **870 Dateien, 0 Fehler, 56 Warnungen, 88 Tests grün.**

## Fallen, die schon Zeit gekostet haben

- **Dateien nicht über Zeilennummern zerschneiden.** Zweimal saß eine Bereichsgrenze mitten in
  einer Funktion oder einem Doc-Kommentar, und der Fehler fiel erst im Typecheck auf (einmal
  erst über eine irreführende „has no exported member"-Meldung, weil TS bei Syntaxfehlern die
  Exporte der Datei vergisst). Lieber die Datei lesen und die neuen Module schreiben.
- **Ein `export { X } from './y'` bringt `X` NICHT in den lokalen Scope.** Wer das Symbol in
  derselben Datei noch benutzt, braucht `import` *und* `export`.
- **In `src/lib/schemas/` sind Imports relativ, nie `$lib/…`.** Der Beispiel-Generator
  (`scripts/gen-schema-examples.mjs`) lädt die Schemas über eine eigene Vite-Instanz ohne
  SvelteKit-Aliase; `$lib` bricht dort, aber erst in `schema:examples:check`, nicht im
  Typecheck.
- **Nach einer Schema-Änderung `npm run schema:examples`.** `:check` schlägt sonst fehl. Jede
  Datei in `schemas/` wird gescannt (der frühere Sonderfall `shared.ts` ist weg).
- **Beim Verschieben von Symbolen alle vier Bäume anfassen:** `src/`, `tests/`, `evals/`,
  `scripts/`. Die Eval-Strecke wird nicht ausgeführt, aber typgeprüft.
- **Kein Re-Export-Shim stehen lassen.** Wenn ein Modul aufgeteilt wird, zeigen die
  Importstellen direkt aufs neue Modul; sonst bleibt die alte Kopplung als Sichtachse zurück.

## Was in diesen Etappen entstanden ist und benutzt werden soll

- `utils/text.ts` — `normName`, `slugKeepUmlauts(name, sep)` (Dateinamen, Umlaute bleiben),
  `slugAscii` (Bibliotheks-Keys), `slugToName`, `keySlug`, `featureIdOf`. **Keine achte
  Slug-Kopie.**
- `utils/num.ts` — `int`, `numOr`, `firstInt`, `sign`.
- `schemas/abilities.ts` — das EINE Attributs-Vokabular inkl. der deutschen Labels
  (`ABILITY_LABEL`, `ABILITY_LABEL_DE`) und `abilityKeyOf`.
- `domain/skills.ts` — `SKILL_DEFS`, `skillSheetKey`, `skillEnName`, `mod`.
- `services/library/createLibrary.ts` — `createLibrary({path, read, displayName, key})` für jede
  flache Vault-Bibliothek, plus `scanJsonFolder` für den Ordner-Scan allein.
- `services/library/nameIndex.ts` — `buildNameIndex`/`matchByRef` (byKey + byName + ambiguous).
- `services/analysis/types.ts` — die Typen der Merkmals-Deutung, neutral.
