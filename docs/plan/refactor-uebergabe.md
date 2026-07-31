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
| 4 · Lange Funktionen | `da062c8` | `contextPrompt`/`contextJsonFormat`/`contextTypes`, `llm/*` (4, `llmService.ts` entfällt); `if (true)`-Block weg; `SKILL_DEFS` und die Zauber-Feldzahlen entdoppelt |

## Offen

Etappe 5 bis 8 aus `plan-modul-refactor.md`. Reihenfolge einhalten — 5 verkleinert die Dateien,
die 7 dann anfasst.

Was Etappe 4 für die nächsten hinterlässt:

- **Etappe 5 kann direkt aufsetzen.** `stores/context.ts` (438) hält nur noch Stores, `invoke()`-Lader
  und Pin-Verwaltung; die Datenformen liegen schon in `contextTypes.ts`, also entsteht kein Zyklus,
  wenn `services/contextLoad.ts` die Lader übernimmt. `refreshCharacterContexts` ist ein DRITTER
  `get(store)`-Zugriff — der Plan nennt zwei.
- **`pdf/characterFields.ts` ist noch Typ-Fassade** für `Character`/`CharacterData`/`Attack`/… aus
  `characterSchema`; vier große Komponenten hängen daran. Bewusst stehengelassen, weil Etappe 7
  dieselben Komponenten zerlegt.
- **`contextJsonFormat.ts` ist die konkrete Verletzung von „One Zod schema per artifact"**:
  Encounter-, Monster- und NPC-Schema stehen dort als Prosa. Sobald Etappe 7 `schemas/npc.ts`
  anlegt, lassen sich die drei Blöcke generieren — dafür liegt die Datei isoliert.
- **`writeSaves` in `characterExport.ts` schreibt erst alle 6 Häkchen, dann alle 6 Werte.** Das ist
  die Feldreihenfolge des Originals; nicht zu einer Schleife zusammenziehen.
- `vaultTools.ts` ist noch stärker der Sammelpunkt „Typen + Temperatur + Toolset" und trägt eigene
  Banner — Kandidat für Etappe 8.

## Das Gate

`npm run verify` = `check` + `check:evals` + `schema:examples:check` + `test`. Vor jedem Commit,
und **0 Fehler** ist die Grenze (56 Warnungen sind der Bestand, sie dürfen nicht wachsen).
Zyklen prüft `npx madge --circular --extensions ts,svelte src/lib` — muss „No circular
dependency found" sagen.

Referenzstand nach Etappe 4: **876 Dateien, 0 Fehler, 56 Warnungen, 88 Tests grün, 48.737 Zeilen
in `src`.**

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
- **„Keine Verhaltensänderung" ist messbar, nicht behauptbar.** Etappe 4 hat jede umgebaute
  Funktion gegen ihren Vorgänger aus `git show HEAD` laufen lassen (Prompt-Bau über 481
  Kombinationen, PDF-Export feldweise, Aufstiegs-Delta über 12 Klassen × 9 Stufen) und die
  Vergleichsdateien danach gelöscht. Das ist der Nachweis, den ein reiner Typecheck nicht führt —
  und der Grund, warum kein neuer Testbestand entstanden ist.

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
