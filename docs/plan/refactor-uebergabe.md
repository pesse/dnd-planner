# Modul-Refactor: Übergabe-Stand

> Abschlussstand zu `plan-modul-refactor.md`. Branch **`refactor/module-schnitt`**, abgezweigt von
> `main` auf `1e3b16c`. Jede Etappe ist ein Commit. Alle acht sind umgesetzt; was offen blieb,
> steht unter „Was nicht erreicht ist".

## Erledigt

| Etappe | Commit | Ergebnis |
|---|---|---|
| 0 · Vorbereitung | `b59c3ac` | Drei Regeln in `CLAUDE.md`; `npm run verify` |
| 1 · Geteilte Kleinteile | `5cb7489` | `utils/text.ts`, `utils/num.ts`, `schemas/abilities.ts`, `domain/skills.ts`, `services/library/{createLibrary,nameIndex}.ts`; `itemLibrary` → `itemLabels`/`itemFormat` |
| 2 · Schemas entflechten | `7673740` | `shared.ts` weg → `source`/`vocabulary`/`grants`/`featureChoice`/`llmJson` + `utils/vaultJson`; `character.ts` → `characterSchema`/`characterUpgrades`/`classLevelText` |
| 3 · Zyklus + Domänenmitte | `0352eeb` | `analysis/types.ts`; `levelUp/*` (7), `declaration/*` (5), `featureEffects*` (4), `open5e*` (4), `classTableParse`; `applyChanges` als Tabelle. **0 Import-Zyklen** |
| 4 · Lange Funktionen | `da062c8` | `contextPrompt`/`contextJsonFormat`/`contextTypes`, `llm/*` (4, `llmService.ts` entfällt); `if (true)`-Block weg |
| 5 · Schichtung | `0751685` | `services/contextLoad.ts`; **0 `get(store)`-Lesezugriffe** in Services, `stores/context.ts` 438 → 230 |
| 6 · UI-Atome und CSS | `f447258`, `1e7dfd1` | `components/ui/` mit 9 Atomen; `dragDialog`/`runClock`/`autosaveFile`; `promptDialog()`-Fabrik |
| 7a · Karten-Editoren | `681ec00` | `schemas/npc.ts`; ItemCard 1248 → 718, NpcCard über `createCardEditor` (**Guard-Bugfix**) |
| 7b · Seitenleiste, Rahmen | `1e2e5ff` | Sidebar 2522 → 452, `+page.svelte` 974 → 349; Registry statt 12 Blöcke |
| 7c · Charakter | `8c62f86`, `36bbfd3` | CharacterSheet 1770 → 685, Wizard 994 → 424, **CharacterEditForm 2898 → 421** |
| 7d · LLM, Aufstieg | `2487848` | LlmPanel 2116 → 495, LevelUpAssistant 1438 → 628 (**Tooltip-Bugfix**) |
| 8 · Kommentare | `617e899` | 13,8 % → 8,6 %; Banner 101 → 20 |
| 9 · Autocomplete, NpcCard | `8f110e7` | `utils/suggestNav.svelte.ts` (8 Kopien), `ui/FeatureRow.svelte` (3); NpcCard 1056 → 549 |
| 10 · Hover, Kartengerüst | `2065bdd` | `utils/hoverTip.svelte.ts` (7 Nutzer), `services/toolDef.ts` (5), `editor/libraryCard.ts` + 3 UI-Atome (6 Karten) |

## Was nicht erreicht ist

| Kennzahl | Start | Ende | Ziel |
|---|---|---|---|
| Dateien > 700 Zeilen | 14 | **1** (`EncounterCard`, 750) | 0 |
| Größte Datei | 2.899 | **750** | < 400 |
| Abschnitts-Banner | 323 | **20** | 0 |
| Kommentarquote | 13,5 % | **8,6 %** | < 6 % |
| Scoped CSS | 8.332 | **6.163** | ~6.000 ✓ |
| Import-Zyklen | 1 | **0** ✓ | 0 |
| Services mit `get(store)` | 2 | **4** ✗ verschlechtert | 0 |
| Entitätstypen ohne Zod-Schema | 1 | **0** ✓ | 0 |

Priorisierte Restliste:

1. **`EncounterCard` (750) zerlegen** — die letzte Datei über der Grenze. `NpcCard` und
   `CharacterFeaturePanel` sind in Etappe 9 darunter gerutscht.
2. **Die vier `get(store)`-Lesestellen auflösen**: `services/renameFile.ts`,
   `services/levelUp/runSteps.ts`, `services/sidebar/deleteEntry.ts`, `editor/cardEditor.svelte.ts`.
   Die letzten drei sind bei Zerlegungen aus Komponenten mitgewandert — **die Kennzahl ist heute
   schlechter als vor dem Refactor.**
3. **`vaultTools.ts` dreiteilen** (4 Banner, 18 Importstellen).
4. **`schemas/levelUp.ts` je Artefakt trennen** — fünf Artefakte in einer Datei, „One Zod schema
   per artifact" gilt dort noch nicht.
5. **`contextJsonFormat.ts`**: Encounter-, Monster- und NPC-Schema stehen dort als Prosa. Seit
   `schemas/npc.ts` existiert, ließen sich alle drei Blöcke generieren.
6. **`pdf/characterFields.ts` ist noch Typ-Fassade** für `Character`/`Attack`/… aus
   `characterSchema`.

## Bestandsfehler, die dabei sichtbar wurden (nicht behoben)

- **Der PDF-Export scheitert bei `vault/characters/silvara`**: der `classFeatures`-Text enthält
  ein Emoji (U+1F532), das pdf-lib nicht in WinAnsi kodieren kann. Vor dem Refactor genauso —
  feldweise gegen die alte Fassung nachgewiesen.
- Nach „Neues Monster"/„Neuer Zauber" bleibt die Sektion leer, bis man sie zu- und aufklappt
  (nur Gegenstände hängen an `vaultVersion`).
- `class:active={$activeFile?.path === info.path}` markiert bei Talenten *ohne* `path` alle
  Einträge aktiv, sobald keine Datei offen ist.
- `npm run dev` (Browser ohne Tauri) rendert die App nicht mehr: `runStartupTasks` ruft `invoke`
  und wirft. Damit ist die browserbasierte Sichtprüfung tot.

## Das Gate

`npm run verify` = `check` + `check:evals` + `schema:examples:check` + `test`. Vor jedem Commit,
und **0 Fehler** ist die Grenze (**39 Warnungen** sind der Bestand, sie dürfen nicht wachsen —
zu Beginn waren es 56). Zyklen prüft `npx madge --circular --extensions ts,svelte src/lib` — muss
„No circular dependency found" sagen.

**Die Warnliste namentlich vergleichen, nicht nur zählen.** Eine verwaiste CSS-Regel und ein neu
greifender Selektor heben sich in der Summe auf.

Referenzstand am Ende: **976 Dateien, 0 Fehler, 39 Warnungen, 88 Tests grün, 44.346 Zeilen in
`src`** (Start: 48.433).

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

## Was die manuelle Prüfung in der laufenden App noch schuldet

Kein Agent konnte die App starten (Tauri läuft nur unter Windows, der Browser-Server rendert
nicht mehr). Der PDF-Export ist feldweise geprüft, der Rest nicht. Zuerst:

1. **Ein vollständiger Stufenaufstieg**, danach muss das Charakterformular die Änderungen zeigen
   (Reference-Swap) — und die Wahl-Boxen tragen jetzt Tooltips.
2. **PDF-Export und -Import** an einem echten Charakter.
3. **NPC ändern und sofort wegklicken** → der „Ungespeicherte Änderungen"-Dialog muss kommen.
4. **Gegenstand mit Kategoriewechsel speichern** → die Datei muss umziehen.
5. Alle 12 Seitenleisten-Abschnitte, je eine Karte pro Bibliothekstyp, die vier KI-Modi.

## Verbliebene CSS-Duplikate (nach Etappe 9)

Echte Duplikation: **428 Zeilen in 56 Gruppen** (vor Etappe 9: 587 in 67). Die lohnenden Reste:

- `MonsterEditForm` ↔ `SpellEditForm` (`.meta-sel`, `.meta-row`, `.prop`, `.ability-desc`, `.ef`;
  ~45 Z.) — die beiden Editoren sind sich so ähnlich, dass ein `libraryEditor.css` naheliegt.
- `CharacterFeaturePanel` ↔ `form.css` (`input`, `.btn-add`, `.remove-btn`; 35 Z.) — nur zusammen
  mit der Entscheidung, ob `form.css` zur globalen Formularsprache wird. Die Leiste lebt bewusst
  außerhalb von `.edit-form`.
- `.ornament-top::before` ↔ `toolbar.css` (21 Z.), `.resize-handle` ×2.
- `.add-opt`/`.add-spell`/`.add-pick` gegen `.add-feat` (7 Z., braucht eine Größenvariante).

**Nicht anfassen — Scheinduplikation.** Ein Skript, das identische *Deklarationen* statt
identischer *Regelkörper* zählt, meldet „~2.300 Zeilen sparbar", weil `color: var(--danger)` 30×
vorkommt. Das sind 30 verschiedene Selektoren mit derselben einen Zeile. Dazu kommt: Svelte 5
hängt `:where(.svelte-hash)` an jeden Selektorteil außer dem ersten, weshalb eine lokale Regel
eine globale Utility-Klasse fast immer schlägt.

## Zwei Befunde aus Etappe 10, die eine Entscheidung brauchen

- **`EncounterCard` baut `parseEncounter` von Hand** (Struktur-Check ohne Zod), obwohl
  `parseEncounter` in `schemaValidation.ts` existiert. Unverändert übernommen — die Umstellung
  wäre eine Verhaltensänderung.
- **`BackgroundCard` bildet den Dateinamen aus dem ENGLISCHEN Namen**, `Feat`/`Species`/`Class`
  aus dem deutschen. Der Kommentar dort behauptet, alle vier täten dasselbe. Entweder ist der
  Dateiname falsch oder der Kommentar; Verhalten unverändert gelassen.
