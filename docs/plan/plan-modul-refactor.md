# Komplettes Refactor: kleine Module, Kommentare mit Mehrwert

> Umsetzungsplan, erstellt am 2026-07-31 auf Stand Commit `0a6e214` **plus** die noch nicht
> festgeschriebenen Änderungen im Arbeitsbaum; alle Zeilennummern beziehen sich auf diesen Stand.
> Noch nicht begonnen.
>
> Quer zu allen inhaltlichen Plänen in diesem Ordner: dieser hier ändert **kein Verhalten**, nur
> den Schnitt. Er setzt `plan-merkmals-seitenleiste.md` als abgeschlossen und gemergt voraus.

## Context

Die Codebase ist über 227 Commits organisch gewachsen und hat dabei drei Eigenschaften angenommen,
die sie für KI-assistierte Arbeit (und für Menschen) teuer machen:

1. **Dateien tragen mehrere Verantwortungen.** `levelUpMachine.ts` hat 986 Zeilen und 47 Exports
   über fünf Themen; `CharacterEditForm.svelte` hat 2.899 Zeilen. Wer eine Kleinigkeit ändern will,
   muss ein Vielfaches davon lesen.
2. **Struktur steckt in Kommentaren statt in Namen.** **323 Abschnitts-Banner**
   (`// ── Zauber ──────`, `// --- Klassen ---`) plus ~290 Narrationsköpfe gliedern das, was
   Funktionen und Module gliedern sollten. Die Banner sind eine direkte Landkarte der fehlenden
   Struktur: `buildWizardCharacter` ist eine 259-Zeilen-Funktion mit **12 Bannern** — das sind 12
   nicht extrahierte Helfer. `CharacterEditForm` hat 22 im Skript und 17 im Markup,
   `LevelUpAssistant` 20, `Sidebar` 12, `levelUpMachine` 10.
3. **Kommentare sind zu viel und beschreiben das Falsche.** 6.579 Kommentarzeilen = 13,5 % der
   48.644 Zeilen; 4.763 davon stecken in 1.330 JSDoc-Blöcken. `schemas/shared.ts` liegt bei 46 %,
   `featureDeclaration.ts` bei 38 %. Daneben stehen Zeilen wie `// Singleton-Cache` (fünfmal,
   über fünfmal demselben kopierten Code) und `// Angriffe` über `attacks: z.array(...)`.

Dazu kommt handfeste Duplikation: 7 `slugify`-Implementierungen in 2 unvereinbaren Semantiken,
7 kopierte Singleton-Cache-Loader, 4 parallele Attributs-Vokabulare, 6 Bibliotheks-Module gleicher
Bauart (deren Kopfkommentar wörtlich „Analog zu `speciesLibrary.ts`" sagt), 7 fast identische
Entity-Blöcke à ~100 Zeilen in `Sidebar.svelte`, 13 Modal-Komponenten ohne gemeinsame Hülle und
8.332 Zeilen scoped CSS gegen 156 Zeilen `app.css` (Verhältnis 53:1).

**Der wichtigste Befund:** Ein großer Teil der Infrastruktur **existiert bereits** und wird von den
großen Dateien trotzdem nachgebaut. Die kleinen Karten benutzen sie, die großen nicht — sie sind
älter. Das ist der billigste Teil des Refactors, weil nichts erfunden werden muss:

| Existiert schon | Benutzt von | Baut es nach |
|---|---|---|
| `editor/cardEditor.svelte.ts` `createCardEditor()` | 8 Karten inkl. `CharacterSheet` | **`ItemCard`** (~120 Zeilen Handarbeit), **`NpcCard`** |
| `components/spellHover.svelte.ts` `createSpellHover()` | `SpellPickField`, `SpellPickModal` | **`CharacterSheet`, `CharacterEditForm`, `NpcCard`** — 3 eigene Caches + Hover-Tripel |
| `editor/saveAs.ts` `openSaveAs()`/`slugify()` + global gemountetes `SaveAsDialog` | kleine Karten | **`ItemCard`** (eigene `.saveas-*`-Oberfläche), `Sidebar`, `LlmPanel` (eigenes `slugify`) |
| `components/TooltipSelect.svelte`, `FeatureChoicePicker.svelte` | `CharacterWizard`, `CharacterFeaturePanel` | **`LevelUpAssistant`** — rohes `<select>`; **die Options-Tooltips (`optionHelpDe`) fehlen dort deshalb heute** |
| `pdf/characterImport.ts` (`base64ToBytes`, PDF-Feld-Leseschleife) | — | **`CharacterSheet`** und **`Sidebar`** je einmal nachgebaut |
| `services/jsonFence.ts` | — | **`LlmPanel:165`** `stripJsonFences` |
| `utils/printSpell.ts` (`SCHOOL_LABELS`, `componentStr`) | `CharacterSheet` (teilweise) | `CharacterSheet` + `NpcCard` deklarieren `SCHOOL_LABELS` neu; `componentStr` existiert **4×** |
| `services/classProgression.ts` `proficiencyBonus()` | `CharacterSheet` | `CharacterEditForm` hält ihn als `$state`-Feld |
| `services/wizard/characterWizard.svelte.ts` (542 Zeilen ausgelagerter Zustand) | `CharacterWizard` | **das Vorbild** für `CharacterEditForm` und `LevelUpAssistant`, die alles in der Komponente halten |

Und eine Regelverletzung, die `CLAUDE.md` ausdrücklich verbietet („One Zod schema per artifact"):
**`NpcCard.svelte` schreibt vier Interfaces (`NpcStats`, `NpcSkill`, `NpcSpell`, `NpcData`) plus
Inline-Migrationen von Hand — NPC ist der einzige Entitätstyp ohne Zod-Schema.**

**Ziel:** kleine, wiederverwendbare Module; Funktionalität durch Funktionen gegliedert, nicht durch
`//`; Kommentare nur dort, wo sie eine Entscheidung schützen.

**Entschieden (mit dem User geklärt):**
- **Etappen, keine neuen Tests.** Jede Etappe ein Commit, Gate ist `npm run check`. (Ausnahme siehe
  Etappe 0: die 11 bereits vorhandenen LLM-freien Tests werden nur *ausführbar gemacht*, nicht neu
  geschrieben.)
- **Kommentar-Diät streng.** Banner raus, nachplappernde JSDoc raus, Modulkopf max. 3 Zeilen.
- **CSS gehört dazu.** UI-Atome + geteilte Klassen, inkl. gemeinsamer Modal-Hülle.
- **Die laufende Merkmals-Arbeit wird zuerst fertig und nach `main` gebracht.** Das Refactor startet
  auf sauberem `main`.

---

## Zielbild: die drei Regeln

Diese drei Regeln gehören **in `CLAUDE.md`** (Etappe 0). Sie sind der eigentliche Hebel — ohne sie
wächst der alte Zustand nach.

**1 · Eine Datei, eine Verantwortung.** Richtwert: Service-/Schema-Modul ≤ 300 Zeilen, Komponente
≤ 400 inkl. Markup, `<style>`-Block ≤ 150. Überschreitung ist erlaubt, aber sie muss sich
begründen lassen — „hier passiert nur eine Sache, sie ist eben groß".

**2 · Ein Abschnitts-Banner ist ein fehlendes Modul oder eine fehlende Funktion.** Wer
`// ── Zauber-Picker ──` schreiben will, schreibt stattdessen `function spellPicker()` oder eine
neue Datei. Nummerierte Schrittkommentare (`// 3) Encounter speichern`) heißen: die Funktion ist
eine Folge unbenannter Phasen.

**3 · Kommentar-Budget.** Modulkopf max. 3 Zeilen (was, nicht wie). JSDoc nur, wenn es etwas sagt,
das Name + Signatur nicht schon sagen — `/** Zeigt den deutschen Namen, falls vorhanden. */` über
`displayName()` fällt weg. Inline-Kommentare nur für die Kategorie, die `CLAUDE.md` bereits nennt:
Entscheidungen, die ein Leser sonst rückgängig macht, Zwänge, die der Typ nicht ausdrückt,
Kausalketten. Diese Kommentare **bleiben** — davon gibt es hier viele gute.

---

## Etappen

Reihenfolge ist nicht beliebig: von innen nach außen. Erst die geteilten Kleinteile, dann Schemas,
dann die Domänenmitte, dann die Ränder (Stores/UI). So werden spätere Etappen kleiner, statt
Konflikte zu erzeugen.

### Etappe 0 · Vorbereitung

- Merkmals-Arbeit auf `merkmals-seitenleiste` abschließen und nach `main` mergen.
- Branch `refactor/module-schnitt` von `main`.
- Die drei Regeln in `CLAUDE.md` unter „Conventions" schreiben; den bestehenden Abschnitt
  „Comments carry why-it-is-not-the-obvious-way" um das Banner-Verbot und das Budget ergänzen.
- ~~**Vorhandenes Netz nutzbar machen**~~ — **erledigt, vorgezogen.** Die LLM-freien Tests lagen
  in `evals/` und sind nach `tests/` umgezogen: `tests/unit/` (1, ohne externe Artefakte),
  `tests/integration/` (10, lesen den echten Vault über
  `tests/support/tauriInvokeShim.ts`), geteilte Inputs in `tests/fixtures/`. `evals/` enthält
  nur noch `*.eval.test.ts`. Zwei Configs: `vitest.config.ts` (Default, LLM-frei) und
  `vitest.evals.config.ts`. Neue Skripte `test` / `test:unit` / `test:integration` /
  `test:watch`. Stand: **11 Dateien, 88 Tests grün in ~23 s.** `tests/**` ist über
  `.svelte-kit/tsconfig.json` schon im `include`, die Tests laufen also auch durch `npm run check`.
  `spellChoiceCoverage.test.ts` wurde dabei gelöscht (bringt nichts).
- Sammel-Gate `npm run verify` = `check` + `check:evals` + `schema:examples:check` + `test`.

### Etappe 1 · Fundament: die geteilten Kleinteile

Reine Additionen + Ersetzung der Kopien. Kein Verhalten.

| Neu | Ersetzt |
|---|---|
| `utils/text.ts` — `slugAscii()`, `slugKeepUmlauts()`, `normName()`, `keySlug()`, `featureIdOf()` | 7 `slugify`-Kopien in Services/Schemas (`schemas/item.ts:80`, `schemas/spell.ts:67`, `services/backgroundData.ts:26`, `services/speciesData.ts:28`, `services/open5eApi.ts:223`, `editor/saveAs.ts:33`, `services/designEncounter.ts:59`) **plus** die Komponentenkopien (`Sidebar:120` und 3× inline, `ItemCard:77`, `LlmPanel:364`, `+page` 4× inline); 25+ inline `.trim().toLowerCase()`; das 3× wiederholte `f.key \|\| f.name.trim().toLowerCase()`; die zwei unvereinbaren Key→Slug-Idiome (`slice(indexOf('_')+1)` vs. `split('_').pop()`, **nicht äquivalent** bei Keys mit mehr als einem `_`) |
| `utils/num.ts` — `int()`, `numOr()` | `parseInt(x) \|\| 0` / `Number(m?.[1] ?? 0)` in `characterFields.ts`, `applyChanges.ts`, `classProgression.ts`, `open5eApi.ts`, `dndApi.ts` |
| `services/library/createLibrary.ts` — memoisierter Vault-Loader (`path`, `parse`, `displayName`) | 7 kopierte Singleton-Caches: `classLibrary:30`, `spellLibrary:33`, `backgroundsLibrary:25`, `featsLibrary:83`, `speciesLibrary:25`, `itemLibrary:382`, `classProgression:262` |
| `services/library/nameIndex.ts` — generisches `buildIndex`/`match`/`search` (byKey + byName + `ambiguous`) | `itemLibrary.ts:479-547` und die Zwillinge in `spellLibrary.ts` |
| `schemas/abilities.ts` — **ein** Attributs-Vokabular | `levelUpMachine.ts:158`, `proficiencyGrants.ts:42`+`:168`, `classProgression.ts:57` |
| `domain/skills.ts` — `SKILL_DEFS`, `mod()`, `totalLevel()`, `skillEnName()` | Layer-Inversion: `characterChoices.ts:26` und `proficiencyGrants.ts` importieren diese Domänenkonstanten heute aus `pdf/characterFields` |

`backgroundsLibrary.ts`/`speciesLibrary.ts`/`classLibrary.ts`/`featsLibrary.ts` schrumpfen damit auf
je ~30 Zeilen Spec. `itemLibrary.ts` (558) zerfällt zusätzlich in `itemLabels.ts` (die ~15
Label-/Farbtabellen), `itemFormat.ts` (Einheiten + Formatierung) und den Rest.

### Etappe 2 · Schemas entflechten

- **`schemas/shared.ts` (728 Zeilen, 67 Exports, 46 % Kommentar)** → `schemas/source.ts` (Herkunft +
  Migration), `schemas/vocabulary.ts` (die geschlossenen Regel-Vokabulare), `schemas/grants.ts`,
  `schemas/featureChoice.ts`, `utils/vaultJson.ts` (`toActLocalJson`/`toLibraryJson`). Ein
  `shared.ts` als Re-Export bleibt zunächst stehen, damit die 43 Importstellen nicht in einem
  Commit angefasst werden müssen; es fällt am Ende der Etappe weg.
- **`schemas/character.ts` (556)** → `characterSchema.ts` + `characterUpgrades.ts`
  (`CHARACTER_VERSION`, die 100-Zeilen-`CHARACTER_UPGRADES`-Tabelle, `upgradeCharacter`,
  `pendingCharacterUpgrade`) + `classLevelText.ts` (der Freitext-Parser).
  **`CHARACTER_VERSION` wird nicht angefasst** — das Refactor ändert kein Dateiformat.
- `featureDeclarationFields` bleibt **ein** Spread über alle drei Träger (Klassenmerkmal, Trait,
  Talent) — die Aufteilung darf diese Kopplung nicht auflösen.
- Kommentar-Diät in beiden Dateien; die Herkunfts- und Legacy-Erklärungen sind echte
  Why-Kommentare und bleiben, gekürzt.

### Etappe 3 · Zyklus auflösen und die Domänenmitte teilen

Es gibt **genau einen** Zyklus in `src/lib`, und er verbindet die zwei größten Domänenmodule:

```
services/aiActions/featureEffectsAction.ts:41  import { resolveSpell } from '../levelUpMachine'
services/levelUpMachine.ts:27                  import { optionLabel, GainedFeature, AnalysisChoice }
                                               from './aiActions/featureEffectsAction'
```

Beides sind Laufzeit-Imports; die zwei Dateien sind faktisch eine Einheit. Auflösung:

- `AnalysisChoice`, `GainedFeature`, `optionLabel`, `choiceLabelsDe` → neutrales
  `services/analysis/types.ts` (neben dem schon vorhandenen `services/declaredChoice.ts`). Das
  nimmt auch die auffällige Fan-in-11 von einem *AI-Action*-Modul weg.
- `resolveSpell` → `spellLibrary.ts`, wo es hingehört.
- **`levelUpMachine.ts` (986)** → `levelUp/steps.ts` (StepId, STEP_META, advance, TIMELINE),
  `levelUp/spells.ts` (Auflösung + Validierung von Zaubernamen), `levelUp/questions.ts`
  (`buildDecisions`, `buildFeatureChoices` — die vier Frageblöcke in `buildDecisions:415` werden
  vier Funktionen), `levelUp/changes.ts` (die 12 Change-Builder + `buildDoc`).
  Die Reihenfolge-Invariante von `STEP_ORDER` bleibt als Kommentar stehen — sie ist genau der Typ,
  der bleiben soll.
- **`featureEffectsAction.ts` (718)** → Prompt-Konstanten, Orchestrierung, Nachbearbeitung
  (`finalizeFeatureEffects:592` mit seinen sechs Phasen).
- **`featureDeclaration.ts` (476)** → je Deklarationsart eine Datei: `declaration/optionList.ts`,
  `declaration/expertise.ts`, `declaration/grants.ts`. Jeder Block ist heute schon in sich
  geschlossen (Prädikat/Id/Choice/Rider-Quartett).
- **`applyChanges.ts:63`** — der 130-Zeilen-`switch` mit ~20 Fällen wird eine Handler-Tabelle
  `Record<Change['target'], (…) => void>`. **Das `never`-Gate im `default` muss die Umstellung
  überleben** — es ist laut `CLAUDE.md` der Grund, warum eine Grant-Senke nicht mehr still fehlen
  kann; als totale Tabelle über `Change['target']` ist derselbe Schutz sogar stärker. Dasselbe gilt
  für `riderGrantChanges`/`proficiencyGrantChanges`/`PROPERTY_ROUTES`: sie bleiben Tabellen über
  `keyof`, es wird nichts danebengeschrieben.
- `classProgression.ts` (367) → `classTableParse.ts` (die 6 Markdown-Tabellen-Parser) +
  `classProgression.ts` (Cache, Mapper, Level-Abfragen).
- `open5eApi.ts` (501) → `open5eClient.ts` + `open5eItemMapper.ts` + `open5eSpellMapper.ts`.

### Etappe 4 · Lange Funktionen werden Funktionen

Hier wird die Regel „Banner = fehlende Funktion" mechanisch angewandt. Die Banner sind bereits die
Namensliste.

| Funktion | Zeilen | Banner | Ergebnis |
|---|---|---|---|
| `wizard/assembleCharacter.ts:104` `buildWizardCharacter` | 259 | 12 | 12 benannte Schritte (Links/Anzeige, Spezies-Bogenwerte, Point-Buy→ASI, HP+Trefferwürfel, Übungen, Fertigkeiten, Merkmals-Ledger, Zauberblock, Inventar, Währung) |
| `stores/context.ts:418` `systemPrompt` | 223 | – | `services/contextPrompt.ts` mit `renderCampaign()`, `renderParty()`, `renderActs()`, `renderEncounters()`, `renderMonsters()`, `renderFocus()`, `renderPins()`. **Nebenbei: `if (true) {` bei `:430` umschließt ~180 Zeilen toten Bedingungscode und wird entfernt.** |
| `pdf/characterExport.ts:150` | 195 | 16 | 16 Feldgruppen-Funktionen (Kopf, Attribute, Kampf, Rettungswürfe, Fertigkeiten, Angriffe, …) |
| `pdf/characterFields.ts:196` `parseCharacterData` | 180 | – | Schleifen (55 Inventarslots, 9 Slot-Level, 8 Zaubertrick-Reihen) je eine Funktion |
| `wizard/featurePrep.ts:91` `buildFeaturePrep` | 140 | – | 11 Phasen |
| `services/llmService.ts` | 512 | 5 | `llm/transport.ts` (`rustFetch`, `rustFetchStream`), `llm/ollama.ts`, `llm/openAiCompatible.ts` (Groq + QualityMinds), `llm/agentLoop.ts` |
| `services/levelUp.ts:121` | 106 | – | Delta-Bauteile je Quelle |

### Etappe 5 · Schichtung: Services greifen nicht mehr in Stores

- **`stores/context.ts` (729)** → `stores/context.ts` (nur noch Stores + Pin-Verwaltung),
  `services/contextLoad.ts` (die `invoke()`-Lader: `loadCampaignContent`, `loadEncounterContext`,
  `buildMonsterPathCache`, `loadActSummaries`), `services/contextPrompt.ts` (aus Etappe 4).
- `services/contextActions.ts` und `services/vaultLinks.ts` lesen heute per `get(store)`
  imperativ globalen UI-Zustand. Der Zustand wird stattdessen übergeben.
- Die Querschnitts-Kanäle (`logDebug`, `addTokenUsage`, Rate-Limit in `anthropicService.ts`,
  `llmService.ts`, `retry.ts`) bleiben vorerst — sie sind Nebenkanäle, kein Layering-Problem, das
  dieses Refactor lösen muss. **Bewusst außen vor.**

### Etappe 6 · UI-Atome und CSS

Neu: `src/lib/components/ui/` (heute existiert **kein** `ui/`- oder `shared/`-Unterordner).
Zuerst das, was schon existiert (Tabelle oben) tatsächlich benutzen, dann die echten Lücken.

**Dialog- und KI-Atome** — jede der 5–6 KI-Modalkomponenten verliert dadurch ~90 Zeilen:

| Atom | Ersetzt |
|---|---|
| `Modal.svelte` (Overlay + Kopf + Schließen + Ziehen) | 4 byte-identische `.overlay`-Blöcke, 5 nahezu identische `.dialog`-Blöcke; `.modal-header` in 7 Dateien, `.modal-title` in 8, `.close-btn` in 8 — über 13 Modal-Komponenten |
| `utils/dragDialog.svelte.ts` | **5 byte-identische** Kopien von `pos`/`dragOff`/`dragging`/`startDrag`/`onDrag`/`endDrag` (`LevelUpAssistant`, `AiEditModal`, `ContextActionModal`, `CreateCardModal`, `TranslateModal`) |
| `AiStatusBanner.svelte` | `<div class="ai-status"><span class="spinner">…KI arbeitet… ({elapsedSec}s)` — **6×** |
| `LlmProviderSelect.svelte` | `changeProvider`/`changeModel` + Modell-Liste — **6×** (`LevelUpAssistant`, `AiEditModal`, `ContextActionModal`, `CreateCardModal`, `TranslateModal`, Variante in `LlmPanel`) |
| `utils/runClock.svelte.ts` | `nowMs`/`elapsedSec`/`stalled` mit 50-s-Schwelle — **4×** |
| `promptDialog()`-Fabrik | Das 3× handgeschriebene Muster „Promise-auflösender Store + einmal gemountete Komponente" (`ConfirmDialog`, `SaveAsDialog`, `UnsavedChangesDialog`) |

**Form- und Anzeige-Atome:**

| Atom | Ersetzt |
|---|---|
| `Autocomplete.svelte` | Die `ArrowDown`/`ArrowUp`/`Escape`/`Enter`-Navigation über `xSugIndex` — **7 Kopien** (`CharacterEditForm` ×4, `NpcCard` ×2, `CharacterFeaturePanel`), plus `.autocomplete-wrap`/`.suggestions` ×3 |
| `AbilityScoreBlock`, `SkillGrid`, `SaveList`, `StatPill`, `SpellChip`, `TagList` | Die Bogen-Bausteine, je 2–3× nachgebaut in `CharacterSheet`, `NpcCard`, `CharacterEditForm` (`.attr-box` ×3, `.skill-grid` ×3, `.scard` ×2, `.save-row` ×2 …) |
| `Button.svelte` / geteilte Klassen | `.primary-btn` (8), `.secondary-btn` (7), `.cancel-btn` (7), `.save-btn` (6), `.ai-btn` (8) |
| `Field.svelte`, `NumberInput.svelte` | `.ef` (13 Dateien, identische 4 Regeln), `.num` (15), `.lbl-inline` (9) |
| `Hint.svelte` / `.hint`-Klasse | 14 identische Definitionen |
| `Collapsible.svelte` | 8× `<details>` + 5× handgerollte `expanded`-Booleans |
| `PickerList.svelte` | Basis für `FightingStylePicker`, `WeaponMasteryPicker`, `FeatureChoicePicker` |
| `utils/autosaveFile.svelte.ts` | Debounce-Autosave 4× (`CharacterSheet` ×2 — der Banner sagt selbst „wie Details" —, `NpcCard`, `MarkdownEditor`) |

Dazu die letzten Helfer-Kopien: `sign()` (5×), `modOf`/`modNum`/`modStr` (3×), `componentStr` (4×),
`SCHOOL_LABELS` (3×), `openItemPage` (3×), `inlineWeaponInfo` (2×), `blankSpell` (2×).

`app.css` (heute 156 Zeilen, nur Variablen; die Token-Abdeckung ist gut — nur 24 Hex-Werte im
ganzen Komponentenbaum) bekommt eine Utility-Schicht für die Wiederholungen
(`1px solid var(--border)` 119×, `background: var(--surface)` 99×). Erwartete Ersparnis:
~750–800 Zeilen wörtlich duplizierten CSS plus die lose Wiederholung darüber hinaus.

**Warnung:** `svelte-check` meldet ungenutzte Selektoren nur als *Warning*, nicht als Fehler. Beim
CSS-Teil ist die Warnliste deshalb die eigentliche Checkliste, und die visuelle Prüfung in der
laufenden App ist Pflicht (siehe Verifikation). Der Filewatch auf `/mnt/c` ist unter WSL unzuverlässig
— zur Verifikation ggf. einen frischen Vite-Start.

### Etappe 7 · Die großen Komponenten

- **`ItemCard.svelte` (1272) und `NpcCard.svelte` (1248) auf `createCardEditor`.** Beide rollen die
  Editor-Lebensdauer von Hand nach; bei ItemCard sind das ~120 Zeilen nahezu wörtlich derselben
  Logik (eigener `activeFile.subscribe`, eigener `registerEditorGuard`, eigenes `dirty`, eigenes
  Speichern/JSON — und eine eigene Save-as-Oberfläche, obwohl `SaveAsDialog` global gemountet ist).
  **`NpcCard` registriert gar keinen Guard und führt `dirty` manuell (`:112`, `:314`) —
  ungespeicherte NPC-Änderungen gehen beim Navigieren heute still verloren.** Das ist der eine
  echte Bug, den dieses Refactor nebenbei behebt.
  Dazu **`schemas/npc.ts`**: die vier handgeschriebenen Interfaces und die Inline-Migrationen in
  `parseNpc` (`:21-53`) werden ein Zod-Schema wie bei jedem anderen Entitätstyp. ItemCard zerfällt
  außerdem in `WeaponFields` / `ArmorFields` / `MagicFacetFields` / `CostWeightFields` /
  `Open5eImportPanel` (der `bearbeiten`-Snippet ist heute 365 Zeilen).
- **`Sidebar.svelte` (2553, Skript 1291)** — 12 Entity-Blöcke mit `// --- Klassen ---`-Bannern, davon
  7 (Klassen, Spezies, Talente, Hintergründe, Monster, Zauber, Gegenstände) fast wörtlich identisch à
  ~100 Zeilen: `xExpanded`/`loadX`/`toggleX`/`openX`/`createX`/`blankX`/`searchOpen5eX`/
  `loadOpen5eX`/`searchXLibrary`. Ergebnis: eine `SidebarSection.svelte` + eine
  `sidebarSections.ts`-Registry mit ~20 Zeilen Spec je Typ — dasselbe Spec-Muster, das
  `aiActions/spec.ts` schon fährt. Die drei gruppierten Bäume (Monster nach Typ, Zauber nach Schule
  *und* Stufe, Gegenstände nach Kategorie) teilen sich eine `GroupedSection.svelte`. Nicht in eine
  Navigationsleiste gehören `createCharacter`/`createFromWizard`/`importFromPdf` (`:349-485`) →
  `services/characterCreate.ts`. Erwartetes Ergebnis: **2553 → ~900 Zeilen.** Das nimmt zugleich den
  lange aufgeschobenen „Create-Dialoge"-Refactor mit.
- **`CharacterEditForm.svelte` (2899: Skript 1314 / Markup 853 / CSS 732; 120 `$state`, 75
  Funktionen, 22 Skript- + 17 Markup-Banner)** — der größte mechanische Block der Codebase ist der
  Schema-Spiegel: 120 `let x = $state(character.x ?? …)` plus ein **107-zeiliges Rückschreib-
  `$effect` (`:1211-1305`)**. Beides wird eine `characterFormState.svelte.ts`-Fabrik über eine
  Feldliste. Danach Unterformulare je Block (Attribute, Übungen/Rüstung, `AttackTable`,
  `InventoryTable`, `SpellBlock`, `PortraitField`, Persönliches). Die drei Bibliotheks-Link-Blöcke
  Klasse/Spezies/Hintergrund (`:909-1092`) sind fast identisch — die Banner sagen selbst „analog
  zur Klasse" / „analog zur Spezies" — und werden **ein** `LibraryRefPicker.svelte`. Die reaktiven
  Angriffsberechnungen (`:302-380`) gehören als reine Funktionen in `services/attackCalc.ts`.
  **Achtung Reference-Swap:** die Komponente hängt an der Objektidentität von `character` — beim
  Umbau auf eine Zustandsfabrik ist genau das die Stelle, an der eine Regression entsteht.
- **`LevelUpAssistant.svelte` (1527, Skript 1075, 20 Banner, 34 `$derived`)** — die dichteste
  abgeleitete Logik im Repo. Zwei Auslagerungen: `services/levelUp/choices.svelte.ts` (die ~90
  Zeilen Kette `baseOptionChoices → … → allBaseChoices`, gespiegelt für `feat*` — reine Ableitung,
  kein DOM) und `services/levelUp/run.svelte.ts` (`runSegment`/`pipelineBody`/`runStep`/
  `runAnalyze`/`runFinalize`/`runNarrative`/`mergeClassFeatures`, ~330 Zeilen; `advance()` liegt
  schon in `levelUpMachine`). Der `choiceBlock`-Snippet wird durch das vorhandene
  `FeatureChoicePicker` + `TooltipSelect` ersetzt — **damit kommen die fehlenden Options-Tooltips
  zurück**.
- **`LlmPanel.svelte` (2124, davon 987 CSS / 173 Regeln — der größte Style-Block im Repo)** — die
  vier Modi sind disjunkt und nur über `mode` gekoppelt: `LlmChatView`, `LlmGenerateView`,
  `LlmAgentView`, `LlmDebugView`, dazu `LlmSettingsPanel` und `ContextBadges`. Das CSS geht mit den
  Views mit. `extractJsonBlocks`/`looksLikeMarkdown`/`saveJsonBlock` → `services/responseArtifacts.ts`
  (und `stripJsonFences` fällt zugunsten von `services/jsonFence.ts` weg); der ~40-zeilige
  Agent-System-Prompt → `services/agentPrompt.ts`.
- **`CharacterSheet.svelte` (1773)** — der `karte`-Snippet ist allein 346 Zeilen und wird
  `CharacterSheetView.svelte` aus den Bogen-Atomen aus Etappe 6. Item- und Zauber-Tooltip (`:274`,
  `:341`, Kommentar sagt „analog Item-Tooltip") gehen auf `createSpellHover` + ein neues
  `createItemHover`. PDF-Import/-Export inkl. `base64ToBytes` → `pdf/characterPdfIo.ts`, gemeinsam
  mit `Sidebar.importFromPdf`, das dieselbe Formularfeld-Schleife nochmal hat.
- **`CharacterWizard.svelte` (998, 13 Banner)** — je Schritt eine Komponente (`PointBuyBlock`,
  `SkillPickStep`, `BackgroundAsiStep`, `EquipmentChoiceStep`). Der Zustand liegt bereits richtig in
  `services/wizard/characterWizard.svelte.ts` — diese Aufteilung ist die kleinste der Etappe.
- **`src/routes/+page.svelte` (973, null Strukturkommentare)** — 9 einzeilige Typprädikate
  (`isNpc`, `isMonster`, …) speisen eine 9-armige `{:else if}`-Kette (`:409-510`), in der dieselbe
  7-Zeilen-Toolbar neunmal steht. Ergebnis: eine `CARD_REGISTRY: Record<FileEntry['type'], {icon,
  component}>` + ein `CardHost`. Dazu `services/renameFile.ts` (~90 Zeilen mit vier Typzweigen),
  `CharacterBadgeBar.svelte` und `services/startupTasks.ts` für das 60-zeilige `onMount`
  (Legacy-Vault-Migration, Update-Check, Bibliotheks-Check, Regel-Index, Fehler-Handler).
- `translateAction.ts` hat eine **eigene Mini-Fabrik** (`TranslationSpec` + `buildTranslationRun`)
  direkt neben `aiActions/spec.ts`+`factory.ts`. Beide gehen in eine gemeinsame Prompt-Gerüst-Spec
  auf.

### Etappe 8 · Kommentar-Durchgang für den Rest

Die Diät läuft in jeder Etappe an der jeweils angefassten Datei mit. Am Ende bleibt ein Durchgang
über die Dateien, die strukturell nichts abbekommen haben — allen voran die mit hoher Quote und
ohne Split-Bedarf: `utils/markdown.ts` (148 %), `services/anthropicExtras.ts` (132 %),
`services/declaredFeature.ts` (111 %), `services/grantedSpells.ts` (94 %),
`services/weaponMastery.ts` (94 %), `services/fightingStyle.ts` (85 %),
`services/spellcasting.ts` (66 %).

**Vorsicht bei `aiActions/*`:** dort ist ein Teil der „Kommentare" Prompt-Doktrin (etwa die
`SHEET_NOTE_*`-Konstanten in `fieldSummaryAction.ts`). Prompt-nahe Erklärungen sind Inhalt, nicht
Kommentar — sie bleiben.

---

## Woran man das Ergebnis misst

| Kennzahl | heute | Ziel |
|---|---|---|
| Dateien > 700 Zeilen | 14 | 0 |
| Größte Datei | 2.899 | < 400 |
| Abschnitts-Banner (`// ── x ──`, `// --- x ---`) | 323 | 0 |
| Kommentarzeilen / Gesamtzeilen | 6.579 / 48.644 = 13,5 % | < 6 % |
| Scoped CSS in Komponenten | 8.332 Zeilen | ~6.000 + geteilte Schicht |
| Import-Zyklen | 1 | 0 |
| Services, die Stores per `get()` lesen | 2 | 0 |
| Entitätstypen ohne Zod-Schema | 1 (NPC) | 0 |

Die Zeilenzahl insgesamt soll deutlich sinken. Steigt sie in einer Etappe, wurde etwas ergänzt
statt umgestellt — das ist das Abbruchsignal für diese Etappe.

## Verifikation

Nach **jeder** Etappe, vor dem Commit:

1. `npm run verify` (aus Etappe 0) — Typecheck, Eval-Typecheck, Schema-Beispiele, die 11
   LLM-freien Tests.
2. `npm run check` auf **0 Fehler**; bei Etappe 6 zusätzlich die Warnliste zu ungenutzten
   Selektoren durchgehen (sie bricht den Build nicht).
3. `git diff --stat` gegen den Etappenstart: Zeilen sollen **sinken**.

Manuell in der laufenden App (`.\dev-windows.ps1` in PowerShell, `tail -f tauri-dev.log` in WSL),
pro Etappe nur die betroffenen Strecken — vollständig einmal am Ende:

- Charakter öffnen → alle Tabs (Karte, Bearbeiten, Details, GM, JSON) → eine Änderung speichern.
- Stufenaufstieg-Assistent einmal durchlaufen (der Weg mit den meisten beweglichen Teilen).
- Charakter-Wizard Stufe 1 komplett.
- PDF-Export und Vergleich mit einem vor dem Refactor exportierten Bogen — **byte-nah gleich**;
  das ist der schärfste Regressionstest, den es hier gibt.
- Je eine Karte pro Bibliothekstyp öffnen und speichern (Etappe 7).
- **Nach Etappe 7 gezielt:** in NpcCard etwas ändern und wegnavigieren → es muss jetzt der
  Unsaved-Dialog kommen (vorher stiller Verlust).
- Sidebar: jeden der 12 Abschnitte aufklappen, ein „Neu"-Modal je Typ öffnen (Etappe 7).

Playwright-MCP steht für die UI-Durchläufe zur Verfügung.

## Was ausdrücklich nicht passiert

- **Keine Verhaltensänderung, keine neuen Features.** Zwei Ausnahmen, beide behobene Mängel: der
  fehlende NpcCard-Navigations-Guard und die im `LevelUpAssistant` verlorenen Options-Tooltips.
- **`CHARACTER_VERSION` bleibt**, kein Upgrade-Schritt, kein Dateiformat wird angefasst.
- **`vault/` bleibt unberührt** — eigenes Content-Repo mit eigenen Regeln.
- **`src-tauri/` bleibt unberührt** (Rust-Recompile, andere Baustelle).
- Keine neuen Abhängigkeiten, kein Prettier/ESLint (`npm run check` bleibt das Gate).
- Kein Umbau der Debug-/Token-/Rate-Limit-Nebenkanäle (Etappe 5, bewusst).
- Die deutsch/englisch-Grenze aus `CLAUDE.md` bleibt exakt wie sie ist; insbesondere entsteht
  **keine dritte Übersetzungstabelle**.
