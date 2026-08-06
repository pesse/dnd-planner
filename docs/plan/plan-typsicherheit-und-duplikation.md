# Aufräum-Plan: Duplikation, Typsicherheit, Eindeutigkeit

## Context

Ein kritisches Review der Codebase (Duplikation / Type-safety / Eindeutigkeit) hat acht
Befundgruppen ergeben. Finding 2 (zwei parallele Zauberwirken-Mechaniken) ist ausgenommen — daran
wird auf `rework-spellcasting` schon gearbeitet.

Der Ausgangszustand ist gut: `npm run check` meldet **0 Fehler** (42 Warnungen, fast nur a11y),
jscpd findet über die TS-Strecke **0,11 % wörtliche Duplikation**, es gibt kein einziges `any`.
Die Befunde liegen eine Ebene höher: dieselbe *Tatsache* ist mehrfach kodiert, und an mehreren
Stellen degradiert ein geschlossenes Vokabular auf dem Weg zu seinem Verbraucher zu `string` — mit
stillen No-Ops als Folge.

Ziel: Jede Tatsache steht an genau einer Stelle, jedes geschlossene Vokabular bleibt bis zur Senke
geschlossen, und die vom Compiler geprüfte Totalität (`PROFICIENCY_DEFS`, `advance()`,
`riderGrantChanges`) gilt auch dort, wo sie heute umgangen wird.

### Der tragende Entschluss: ein englischer Attributs-Schlüsselsatz

Ein erster Entwurf wollte das Dateiformat schonen und nur die *Kürzel* auf Englisch ziehen. Das war
in sich widersprüchlich: es erklärte Deutsch zur Übersetzungsaufgabe und ließ gleichzeitig
`ges`/`kon`/`wei` als **technische Schlüssel** im Charakter stehen. Die Schlüssel sind das
fundamentalere Vokabular. Also:

- `character.ges/kon/wei` → **`dex`/`con`/`wis`**, ebenso `gesMod` → `mods.dex`,
  `gesSaveProf` → `saveProfs.dex`.
- Die drei Felderblöcke werden **verschachtelte Records**: `abilities`, `mods`, `saveProfs`.
- Deutsch überlebt an genau zwei Rändern: den **Anzeigelabels** (`ABILITY_ABBR_DE`,
  `ABILITY_LABEL`) und den **PDF-Feldnamen** des Taendler-Bogens (`Ges`, `GesMod`, `GesProf`), die
  das Formular diktiert.
- `CHARACTER_VERSION` **6 → 7**, genau ein Upgrade-Schritt.

Damit kollabiert der ganze Brücken-Apparat: `ABILITY_TO_EN`, `ABILITY_FROM_EN`,
`ABILITY_KEY_BY_EN`, der zweite Schlüsselsatz der Monster-/NPC-/Zauber-Seite und
`NpcCard.svelte:38 CHAR_ATTR_TO_NPC` verschwinden, weil Schlüssel und englischer Name danach
trivial zusammenhängen und beide Seiten denselben Satz benutzen.

### Zwei Folgen, die eingeplant sind

**`CLAUDE.md` muss mit.** Der Absatz „One legacy exception, at the PDF boundary" führt
`ges`/`wei`/`kon` in `character.*` ausdrücklich als sanktionierte Ausnahme. Danach bleiben dort nur
`skills.MitTierenUmgehen`, `alleskoenner`, `currency.km`, `personal.*`. Der Absatz wird Teil des
Commits, der das Schema ändert — sonst widerspricht die Doku dem Code.

**Ein LLM-Prompt ändert sich, also braucht es einen Eval-Lauf.**
`services/aiActions/featureEffectsPrompts.ts:37` erklärt dem Modell heute:
*„German keys (the sheet's, not a language choice): str, ges (dex), kon, int, wei (wis), cha."*
Der Satz entfällt, weil die Rider-Schlüssel englisch werden — inhaltlich eine Verbesserung, aber
eine Prompt-Änderung. **`npm run eval` läuft beim Nutzer, nicht bei Claude.** Der Plan markiert die
Stelle, an der der Lauf fällig ist, und wartet dort.

### Sichtbare UI-Folge, die kein Bug ist

Heute zeigen `MonsterEditForm.svelte:14` und `MonsterMiniCard.svelte:183` `DEX/CON/WIS`, während
`MonsterStatBlock.svelte:10` und `printEncounter.ts:19` **für dieselben Daten** `KON/WEI` zeigen.
Nach Phase 1 sind alle vier deutsch (`GES/KON/WEI`) — „UI labels … German" entscheidet. Der
Monster-Editor sieht danach an zwei Stellen anders aus. Beabsichtigt.

### Weitere Nutzer-Entscheidungen

- **§8 in voller Breite** — inklusive der zehn Komponenten über dem Richtwert.
- **Branch:** neuer Branch **ab dem aktuellen `rework-spellcasting`**, thematisch getrennte Commits.

---

## Phase 1 — Ein Attributs-Vokabular (§1)

Größter Hebel und der einzige Teil mit Formatwechsel. Heute existieren wegen der flachen deutschen
Felder: **neun** Kürzeltabellen, **drei** Schlüsselsätze, **vier** `as unknown as`-Casts, eine
lokale Brückentabelle und drei hand-aufgezählte PDF-Blöcke.

Gemessener Umfang: **23 Dateien**. `CHARACTER_VERSION` steht auf 6; der Zauber-Umbau hat bewusst
keinen Bump gemacht (optionales Feld plus Fallback), Schritt 7 ist also frei.

### 1a) `schemas/abilities.ts` wird der alleinige Besitzer

```ts
export const ABILITY_KEYS = ['str','dex','con','int','wis','cha'] as const;
export type  AbilityKey   = (typeof ABILITY_KEYS)[number];
export type  AbilityScores = Record<AbilityKey, number>;      // existiert schon

export const ABILITY_ABBR:    Record<AbilityKey, string>;     // STR/DEX/CON/INT/WIS/CHA
export const ABILITY_ABBR_DE: Record<AbilityKey, string>;     // STR/GES/KON/INT/WEI/CHA
export const ABILITY_LABEL:   Record<AbilityKey, string>;     // Stärke/… (existiert)
export const ABILITY_NAMES;                                   // Strength/… (existiert)

export const abilityScoresSchema;   // aus ABILITY_KEYS, default 10
export const abilityModsSchema;     // aus ABILITY_KEYS, default 0
export const abilityFlagsSchema;    // aus ABILITY_KEYS, default false
export const abilityStatsSchema;    // für Monster/NPC (siehe 1e)
```

Ersatzlos gestrichen, weil Schlüssel = kleingeschriebener englischer Name:
`ABILITY_TO_EN`, `ABILITY_FROM_EN`, `ABILITY_KEY_BY_EN`. `abilityKeyOf()` bleibt als tolerante
Eingangsnormalisierung („Wisdom", „wisdom", „ wis ") — sie ist der LLM-/Open5e-Rand.

`SaveProfFlags` (`services/proficiencyGrants.ts:120`) und die Zugriffs-Helfer entfallen komplett:
`c.mods[k]` und `c.saveProfs[k]` brauchen keinen Template-Literal-Apparat mehr.
`levelUp/changes.ts:43 type AbilityMap` ist ein Zweitname für `AbilityScores` → konsolidieren.

### 1b) `characterSchema` verschachtelt

`schemas/characterSchema.ts:177-192` (18 Felder) →

```ts
abilities: abilityScoresSchema,
mods:      abilityModsSchema,
saveProfs: abilityFlagsSchema,
```

Ebenfalls in dieser Datei: `attackSchema.ability` (Z. 27) `z.enum(['str','ges','finesse'])` →
`['str','dex','finesse']`. Das ist ein **Datenfeld** und braucht Migration.

`schemas/levelUp.ts`: `abilityDeltaSchema` (Z. 40-47) und `changeSchema`-Variante `ability`
(Z. 164) auf `ABILITY_KEYS` umstellen, `z.enum(ABILITY_KEYS)` statt der Inline-Aufzählung.
Der Default `{str:0, ges:0, …}` (Z. 98) und `declaration/rider.ts:22` werden aus `ABILITY_KEYS`
generiert.

Danach `npm run schema:examples` (nicht `:check`).

### 1c) Upgrade-Schritt 7

`CHARACTER_VERSION = 7`, **genau ein** Schritt mit `to: 7`, `apply` idempotent **und**
inhaltsgeprüft — Altdateien tragen oft kein oder ein veraltetes `_version`, obwohl die Änderung
schon passiert ist (`CLAUDE.md`). Der Schritt muss vier Zustände überleben: rein deutsch-flach,
schon englisch-verschachtelt, gemischt, und gar keine Attributsfelder.

Er migriert:
1. `str…cha` → `abilities{str,dex,con,int,wis,cha}` (Umbenennung + Verschachtelung),
2. `strMod…chaMod` → `mods{…}`,
3. `strSaveProf…chaSaveProf` → `saveProfs{…}`,
4. `attacks[].ability === 'ges'` → `'dex'`.

Die alten Felder werden **entfernt**, sonst kann eine spätere Bearbeitung aus der Altkopie lesen.

Test in `tests/unit/characterUpgrades.test.ts` (existiert schon auf diesem Branch), Fixtures in
`tests/fixtures/legacyCharacterFiles.ts` (ebenfalls neu) — je ein Fall pro Zustand oben plus
zweifache Anwendung (Idempotenz).

**UX-Folge, die zu erwarten ist:** jeder Charakter im Vault steht auf 6 und zeigt danach das
`UpgradeBanner` im Bearbeiten-Tab, bis er einmal gespeichert wurde. Das ist die entworfene
Mechanik (pro Charakter, kein Bulk, `pendingCharacterUpgrade` + `extraDirty`, geschrieben wird über
die normale Speicherleiste) — aber es sind so viele Banner, wie es Charaktere gibt. Nichts bricht
in der Zwischenzeit: das Laden fährt die Pipeline immer im Speicher, der Draft ist also aktuell,
während die Datei es noch nicht ist.

### 1d) Der PDF-Rand wird eine Tabelle

`pdf/characterExport.ts:144-149` und `:172-177` sowie `pdf/characterFields.ts:257-292` zählen die
sechs Attribute drei- bzw. zweimal von Hand auf. Die PDF-Feldnamen sind ein zusammenhängender
Satz — eine Tabelle treibt alle drei Formen (`Ges`, `GesMod`, `GesProf`):

```ts
// pdf/characterFields.ts — der legitime Übersetzungsrand, vom Taendler-Formular diktiert
const PDF_ABILITY_FIELD: Record<AbilityKey, string> =
  { str: 'Str', dex: 'Ges', con: 'Kon', int: 'Int', wis: 'Wei', cha: 'Cha' };
```

Export und Import werden Schleifen über `ABILITY_KEYS`. `parseSkills(r, attrMods, …)` bekommt
`attrMods` als `AbilityScores` statt `Record<string, number>`.

### 1e) Die vier Casts, die neun Kürzeltabellen, der Stats-Klon

**Casts weg** (die Records machen sie überflüssig):
`character/CharacterSheetView.svelte:39`, `character/SheetProficiencyBlock.svelte:28-29`,
`services/characterSheetTips.ts:27,40`, `services/applyChanges.ts:94`.

**Kürzeltabellen → `ABILITY_ABBR_DE`:**
`CharacterSheetView.svelte:26` · `SheetProficiencyBlock.svelte:20` ·
`characterForm/AttributeRow.svelte:18` · `characterForm/SavingThrowGrid.svelte:23` ·
`characterSheetTips.ts:8` · `MonsterEditForm.svelte:14-16` · `MonsterMiniCard.svelte:183-185` ·
`MonsterStatBlock.svelte:9-10` · `utils/printEncounter.ts:18-19` · `SpellEditForm.svelte:19-23` ·
`NpcCard.svelte:33-40` (dessen `CHAR_ATTR_TO_NPC` entfällt ersatzlos) ·
`services/attackCalc.ts:34` (`{str:'STR', ges:'GES', finesse:'Finesse'}` → `ABILITY_ABBR_DE`
plus Sonderfall `finesse`).

Die zwei lokalen `type StatKey` (`MonsterEditForm.svelte:15`, `MonsterMiniCard.svelte:184`) und
die vier `as const`-Arrays daneben werden `ABILITY_KEYS`.

**Stats-Klon:** `schemas/monster.ts:45-54` und `schemas/npc.ts` (`npcStatsSchema`) deklarieren
dieselben sechs Felder — jscpd meldet sie als Klon. Beide auf `abilityStatsSchema`.

### 1f) Svelte-Bindings und Formularschicht

- `characterForm/AttributeRow.svelte`: 6 `$bindable`-Props → ein `$bindable` `AbilityScores`,
  Zeilen aus `ABILITY_KEYS.map(...)`.
- `characterForm/SavingThrowGrid.svelte`: 6 `$bindable`-Props → ein `$bindable` Flag-Record; das
  `sourceOf(english)`-Prop nimmt danach `AbilityKey` statt des englischen Langnamens.
- `CharacterEditForm.svelte:274-296`: aus 12 `bind:` werden 2.
- `services/characterFormFields.ts`: `CharacterFormFields` (Z. 31, 38-39) und `AbilityMods`
  (Z. 73-76) verschachteln; `abilityMods()` und `computeSkills()` bekommen `AbilityScores` statt
  `Record<string, number>` (Z. 96 verliert damit seinen offenen Record).
- `services/wizard/pointBuy.ts:20` `pointBuyStart()` — Schlüssel umbenennen; der Modulkommentar
  („auf den sechs DEUTSCHEN Attribut-Schlüsseln") wird falsch und muss mit.
- Weitere reine Umschreibstellen: `services/characterCreate.ts`,
  `services/wizard/assembleCharacter.ts`, `services/levelUp/runSteps.ts:53`,
  `services/levelUp/changes.ts`, `services/spellcasting/project.ts:260`,
  `services/attackCalc.ts`, `characterForm/AttackTable.svelte`, `CharacterSheet.svelte`.

### 1g) `CLAUDE.md`

Den Absatz „One legacy exception, at the PDF boundary" um `ges`/`wei`/`kon` kürzen und den
PDF-Feldnamen-Rand als das benennen, was er dann ist. Im selben Commit wie 1b/1c.

**Verifikation Phase 1**

1. `npm run verify` (`schema:examples` vorher laufen lassen).
2. `tests/unit/characterUpgrades.test.ts` — die vier Zustände plus Idempotenz.
3. `tests/unit/characterFormFields.test.ts` und
   `tests/integration/characterProficienciesPdf.test.ts` sind die schärfsten Wächter.
4. **Roundtrip von Hand, der einzige Test, der den Formatwechsel wirklich prüft:** einen
   bestehenden Charakter öffnen (Banner erscheint) → *Aktualisieren* → speichern → `character.json`
   gegen die Vorversion diffen: nur die Attributsfelder dürfen sich unterscheiden, kein Wert darf
   sich ändern → PDF exportieren und gegen einen vor der Umstellung erzeugten Export vergleichen →
   dasselbe PDF wieder importieren.
5. In der App: Bogen, Editor, Monster-Karte, Monster-Editor, NPC-Karte, Zauber-Editor,
   Encounter-Druck. Überall `GES/KON/WEI`, Zahlen unverändert.
6. **Halt für den Nutzer:** `npm run eval` wegen `featureEffectsPrompts.ts`. Erst danach Phase 2.

---

## Phase 2 — Vokabular an den Senken schließen (§3, §4)

### 2a) `changeSchema` auf Enums (§3)

`schemas/levelUp.ts:167-172`. Der Kommentar über `changeSchema` sagt es selbst: das Schema geht
**nicht** an ein LLM. Beide Produzenten — `proficiencyGrantChanges`
(`services/proficiencyGrants.ts:133`, total über `keyof ProficiencyGrant`) und `riderGrantChanges`
(`services/levelUp/changes.ts:130`, total über `keyof RiderProficiencies`) — liefern schon narrow
getippte Werte. Nur der Transport weitet sie:

```
expertise.skill          z.string() → z.enum(SKILL_NAMES)
proficiency.skill        z.string() → z.enum(SKILL_NAMES)
weaponProficiency.value  z.string() → z.enum(WEAPON_CATEGORIES)
armorTraining.value      z.string() → z.enum(ARMOR_TRAININGS)
```

Damit fällt `applyChanges.ts:105,110` `c.skill as SkillName` — der Cast, hinter dem heute ein
stiller No-Op sitzt (unpassender Skill-Name → `skillSheetKey` gibt die Eingabe zurück →
`next.skills[…]` ist `undefined` → `if (row)` schluckt es).

`savingThrow.value` ist der Sonderfall: der Vault-Grant ist streng (`grants.ts:45`
`z.enum(ABILITY_NAMES)`), der LLM-Rider bewusst tolerant (`levelUp.ts:57` `z.array(z.string())`,
normalisiert über `readAbilityName`). Deshalb **Toleranz nach vorne ziehen**: `riderGrantChanges`
normalisiert mit `readAbilityName` und lässt Unlesbares fallen, dann darf `savingThrow.value`
ebenfalls `z.enum(ABILITY_NAMES)` sein und `markSavingThrow` schrumpft auf einen Lookup. Der
LLM-Rand bleibt tolerant, der Transport wird streng.

### 2b) Die Hand-Aufzählung neben `PROFICIENCY_DEFS` (§4)

`services/proficiencyGrants.ts:107-117`. `markWeaponProficiency` / `markArmorTraining` schreiben
die Zuordnung `'Simple' ↔ simpleWeapons` als if-Kette, die `domain/proficiencies.ts:38-47` schon
als compilergeprüft totale Tabelle hält — genau das, was `CLAUDE.md` verbietet („**No
hand-enumerated field list** next to … `PROFICIENCY_DEFS`"):

```ts
function markProficiency(flags: ProficiencyFlags, kind: 'weapons' | 'armor', value: string): void {
  const hit = PROFICIENCY_FLAGS.find((f) => f.def.kind === kind && f.def.value === value);
  if (hit) flags[hit.field] = true;
}
```

Parameter auf `WeaponCategory` / `ArmorTraining` verengen, sobald 2a durch ist.

### 2c) Geteilte Change-Emitter (§4, Zusatzbefund)

`proficiencyGrantChanges` und `riderGrantChanges` müssen zwei Tabellen bleiben — jede ist über
ihre *eigene* Quellform total, das ist der Sinn. Ihre vier gemeinsamen Routen-Körper sind aber
Zeile für Zeile gleich, Label-Formel inklusive. Vier kleine Emitter in `proficiencyGrants.ts`, von
beiden Tabellen aufgerufen; die Totalität bleibt unberührt.

**Verifikation Phase 2:** `npm run verify`. `tests/unit/weaponProficiency.test.ts`,
`tests/integration/featureDeclaration.test.ts`, `tests/integration/levelUpFeatAccess.test.ts`.
Dann einen Stufenaufstieg durchspielen: Übungen, Rettungswürfe und Expertise müssen im
Änderungsdokument ankommen. 2a macht aus einem stillen Fehlschlag einen Compile-Fehler, kann aber
einen bisher stillen *Datenfehler* sichtbar machen.

---

## Phase 3 — Unions ableiten statt wiederholen (§5, §6)

### 3a) Drei Entitätstyp-Unions (§5)

`types.ts:54` (`FileEntry['type']`, 15 Werte, inline), `components/cardRegistry.ts:23` (`CardType`,
9) und `services/sidebar/createSpecs.ts:32` (`CreateKind`, 7) stehen unabgeleitet nebeneinander.
Deshalb braucht `cardTypeOf` (`cardRegistry.ts:37`) einen Laufzeit-`in`-Check plus Cast, um
zwischen Unions zu vermitteln, die per Konstruktion in Teilmengenbeziehung stehen.

- `CardType = keyof typeof CARD_REGISTRY`, `CreateKind = keyof typeof CREATE_SPECS`
- `FileEntry['type']` als benannten Typ herausziehen, Registries per
  `satisfies Record<CardType, …>` daran binden — ein Karten-Typ ohne Datei-Typ wird Compile-Fehler
- `cardTypeOf` wird ein Lookup ohne Cast

### 3b) `CastingOrigin` ≡ `FeatureSource` (§5)

`services/declaredFeature.ts:9` und `services/spellcasting/source.ts:10` sind zeichengleich und
meinen dasselbe. `declaredFeature.ts` bleibt (älter, breiter genutzt), der andere re-exportiert.
Dazu die zweimal ausgeschriebene Frage `origin === 'class' || origin === 'subclass'`
(`spellcasting/resolve.ts:100`, `spellcasting/project.ts:77`) als **eine** Funktion — sie
beantwortet „zählt hier die Klassenstufe", und `.claude/rules/character-flows.md` erklärt, warum
das eine tragende Unterscheidung ist.
*Berührt `spellcasting/`* — mit dem laufenden Umbau abgleichen, notfalls hinten anstellen.

### 3c) `LibraryState` in zwei Achsen (§6)

`stores/libraries.ts:19-25`. Der Doc-Kommentar trennt selbst: `installed`/`update`/`available` sind
Installationsstände, `locked`/`staleCode`/`appOutdated` Sperrgründe. Eine gesperrte Bibliothek
*hat* trotzdem einen Installationsstand — im heutigen Union unrepräsentierbar. Nach
`{ install: InstallState; block?: BlockReason }`. Betroffen: `Library.status`, `updateCount()`,
`LibraryManager.svelte`.
**Klärungspunkt beim Umsetzen:** `src-tauri/src/libraries.rs` liefert den Status. Wenn die Achsen
dort getrennt werden müssten, ist das ein Rust-Recompile und ein eigener Commit — dann lieber im
Frontend beim Einlesen trennen und 3c klein halten.

### 3d) Laufzustand des Stufenaufstiegs (§6)

`services/levelUp/runState.ts:20,49-50`. `phase: StepId | 'running'`, `running: boolean` und
`error: string` kodieren denselben Sachverhalt dreifach; `run.svelte.ts:85-95` hält sie in
`runSegment` von Hand synchron. Die Übergangsfunktion `steps.ts:73 advance()` bleibt unangetastet
— sie ist vorbildlich. Nur der Laufzustand wird ein Union:

```ts
type RunPhase =
  | { kind: 'idle' }
  | { kind: 'running'; step: StepId }
  | { kind: 'paused';  at: StepId }
  | { kind: 'error';   at: StepId; message: string };
```

`reachedStep` bleibt eigenständig (anderer Zweck: Dokument-Reihenfolge), `resumePhase` geht im
Union auf. Hauptleser ist `LevelUpAssistant.svelte` → kollidiert mit Phase 5, deshalb **3d vor 5**.

### 3e) `encodePick`/`decodePick` (§6)

`services/spellcasting.ts:154-162` transportiert `{level, name}` als `"3::Fireball"` durch fünf
Komponenten (`CharacterWizard`, `LevelUpAssistant`, `SpellPickField`, `SpellPickModal`,
`characterForm/SpellBlock`) — ein Tupel als String, und es trägt den *Namen*, während der Rest der
Codebase auf `spell.key` verlinkt.

**Vorsicht:** Restschuld desselben Umbaus wie Finding 2, hängt an `character.spells`. Hier nur die
*Form* geraderücken (String-Paar → `{ level, key }`), **nicht** die Namens-→-Key-Umstellung. Vorher
`git log rework-spellcasting -- src/lib/services/spellcasting.ts` prüfen; falls dort schon daran
gearbeitet wird: **auslassen** und als offen vermerken.

**Verifikation Phase 3:** `npm run verify`. In der App: Karten aller Typen öffnen (3a), „Neues X"
für alle Typen (3a), Bibliotheksverwaltung mit gesperrter *und* aktualisierbarer Bibliothek (3c),
vollständiger Stufenaufstieg inkl. Abbruch und Fehlerfall (3d).

---

## Phase 4 — Kleinduplikate mit vorhandener Zielstelle (§7)

Alle haben ein bestehendes Ziel; reines Zurückführen.

| Befund | Stellen | Ziel |
|---|---|---|
| `slugAscii` dreifach | `services/speciesData.ts:24`, `services/backgroundData.ts:18` | `utils/text.ts:33` |
| `inTauri()` dreifach | `stores/libraries.ts:55`, `stores/update.ts:22` | `services/httpFetch.ts:5` exportieren oder nach `utils/` |
| `.trim().toLowerCase()` ~15× inline | `characterLegacyLinks.ts` (5×), `attackCalc.ts:130-131`, `glossary.ts:83`, `proficiencyGrants.ts:173`, `characterFeatures.ts:412`, `spellLibrary.ts:154`, `itemLibrary.ts:207` | `normName` (`utils/text.ts:4`) |
| Leerer Charakter zweimal wörtlich (27 Zeilen, jscpd-Klon) | `services/characterCreate.ts:20-48`, `services/wizard/assembleCharacter.ts:45-70` | `characterSchema.parse({ name })` — `name` ist das einzige Feld ohne Default |
| `SPELL_CLASS_LABELS` + `SPELL_CLASS_KEYS` | `types.ts:60,71` | Keys aus der Map ableiten, Map über den Key-Typ tippen |
| `MAP[x as Key] ?? x` viermal | `types.ts:78,165,168,171` | eine generische `labelOf(map, value)` |

Dazu die Bibliotheks-Dreifachung in `services/sidebar/createSpecs.ts:145-176`:
`searchClassLibrary` / `searchSpeciesLibrary` / `searchBackgroundLibrary` sind dasselbe Skelett mit
ausgetauschtem Parser, dahinter `ClassInfo` / `SpeciesInfo` / `BackgroundInfo` mit identischer Form
`{name, nameDe?, path, key?}` und identischem `read`-Callback.
`services/library/createLibrary.ts` bringt diese Form als Default mit (`displayName = nameDe ?? name`,
Standard-`read`) und eine `searchWithParser`-Variante; die drei Bibliotheksmodule schrumpfen
entsprechend, `ClassInfo` behält `subclassOf` als Erweiterung.

**Verifikation Phase 4:** `npm run verify`. In der App: neuen leeren Charakter anlegen,
Wizard-Charakter anlegen, beide `character.json` gegen einen vorher angelegten diffen — sie müssen
**feldgleich** sein (der schärfste Test für `characterSchema.parse`, und er prüft Phase 1 gleich
mit). Danach „Neues X" für Klasse, Spezies, Hintergrund (Bibliotheks- **und** Open5e-Suche).

---

## Phase 5 — Struktur (§8)

Rein mechanisch, kein Verhalten. **Zuletzt**, weil Phase 1–4 in dieselben Dateien fassen.

### 5a) `services/wizard/characterWizard.svelte.ts` (465 Zeilen)

Sechs Abschnittsbanner (Z. 88-151) — laut `CLAUDE.md` „ein fehlendes Modul oder eine fehlende
Funktion". Sie benennen die Schnittkanten selbst: Kopf/Grundwahl · deterministische Wahlen ·
Zauberwahl · Merkmalswahlen · KI-Jobs. `Job<T>` (Z. 52-84) ist ohnehin eigenständig und geht nach
`services/wizard/job.svelte.ts`.

### 5b) Die zehn Komponenten über dem Richtwert

Richtwert: Komponente ≤ 400 Zeilen inkl. Markup, `<style>` ≤ 150.

| Datei | Zeilen | | Datei | Zeilen |
|---|---|---|---|---|
| `ItemCard.svelte` | 679 | | `LlmPanel.svelte` | 491 |
| `LevelUpAssistant.svelte` | 600 | | `Sidebar.svelte` | 439 |
| `NpcCard.svelte` | 549 | | `MonsterEditForm.svelte` | 435 |
| `sidebar/CampaignTree.svelte` | 545 | | `CharacterSheet.svelte` | 422 |
| `MonsterMiniCard.svelte` | 529 | | `CharacterEditForm.svelte` | 419 |

Vorgehen, **ein Commit je Datei** (jeder einzeln zurückrollbar):

1. Muster aus `components/character/` und `components/characterForm/` übernehmen — Unterordner plus
   `sheet.css` / `form.css` ist dort schon vorgezeichnet.
2. Erst reine Präsentations-Blöcke heraus (Markup + eigenes CSS, Props rein), dann Logik in ein
   `*.svelte.ts` daneben.
3. `ItemCard` / `NpcCard` / `MonsterMiniCard`: prüfen, ob sie über `createCardEditor`
   (`editor/cardEditor.svelte.ts`) laufen. `.claude/rules/editors.md` nennt Item und Character als
   offen — wenn die Migration ohnehin ansteht, ist sie der natürliche Schnitt und ersetzt ein
   reines Zerteilen.
4. `Sidebar.svelte`: **nur** aufteilen. Die „Neue X"-Verdrahtung in per-Typ Create-Specs ist ein
   separater, bewusst zurückgestellter Refactor — nicht mit aufmachen.
5. `LevelUpAssistant.svelte` erst **nach** 3d.

**Verifikation Phase 5:** `npm run verify` fängt hier fast nichts — Aufteilen ist typkorrekt und
trotzdem kaputt möglich. Deshalb pro Datei manuell: Karte öffnen, bearbeiten, speichern, verwerfen,
Tab wechseln, mit ungespeicherten Änderungen navigieren (der `confirmNavigation`-Guard ist die
empfindlichste Stelle). Screenshot vor/nach vergleichen.

---

## Reihenfolge und Commits

Neuer Branch ab dem aktuellen `rework-spellcasting`. Commit-Nachrichten deutsch. Nach jedem Commit
`npm run verify`.

```
 1  feat: ein englischer Attributs-Schlüsselsatz (abilities.ts)          §1a
 2  feat!: Attribute als verschachtelte Records, CHARACTER_VERSION 7     §1b/1c/1g
 3  refactor: PDF-Attributsfelder als Tabelle                           §1d
 4  refactor: Attributs-Casts und Kürzeltabellen entfernt               §1e
 5  refactor: geteiltes Attributs-Stats-Schema für Monster und NPC      §1e
 6  refactor: Attributs-Bindings und Formularschicht verschachtelt      §1f
    ── HALT: npm run eval (Nutzer) ──
 7  fix: Change-Vokabular bis zur Senke geschlossen                     §2a
 8  refactor: Übungs-Häkchen aus PROFICIENCY_DEFS statt if-Kette        §2b/2c
 9  refactor: Entitätstyp-Unions abgeleitet                             §3a
10  refactor: eine Herkunfts-Aufzählung für Merkmale und Quellen        §3b
11  refactor: Bibliotheks-Status als zwei Achsen                        §3c
12  refactor: Aufstiegs-Laufzustand als Union                           §3d
13  refactor: Zauber-Picks als Objekt statt String-Paar                 §3e  (evtl. entfällt)
14  refactor: Kleinduplikate auf vorhandene Helfer zurückgeführt        §4
15  refactor: leerer Charakter aus dem Schema                           §4
16  refactor: createLibrary trägt die gemeinsame Info-Form              §4
17  refactor: characterWizard aufgeteilt                                §5a
18… refactor: <Komponente> aufgeteilt                                   §5b, ein Commit je Datei
```

Commits 1–6 hängen zusammen und sollten in einem Zug entstehen; 2 ist der einzige mit
Formatwechsel und trägt deshalb auch die `CLAUDE.md`-Änderung.

## Gesamt-Verifikation

- `npm run verify` (= `check` + `check:evals` + `schema:examples:check` + `test`) nach jedem
  Commit grün. Ausgangslage: **0 Fehler, 42 Warnungen** — die Warnungszahl darf nicht steigen.
- `npm run schema:examples` nach 1b und 1e (`character.json`, `monster.json`, `npc.json`,
  `levelUp`-Beispiele); `:check` schlägt sonst fehl.
- **`npm run eval` nach Commit 6, durch den Nutzer.** Der einzige Prompt-Berührungspunkt ist
  `featureEffectsPrompts.ts:37`; erwartet wird eine Verbesserung, weil die Erklärung der deutschen
  Schlüssel entfällt.
- Charakter-Roundtrip als Kernabsicherung von Phase 1: Laden → Upgrade → Speichern → Diff →
  PDF-Export gegen Vor-Export → Re-Import.
- App-Durchlauf am Ende (`.\dev-windows.ps1`, Log via `tail -f tauri-dev.log`): Charakter anlegen ·
  Wizard-Charakter · Bogen · bearbeiten und speichern · PDF export/import · Stufenaufstieg
  vollständig · Monster-/NPC-/Zauber-/Item-Karte · „Neues X" je Typ · Bibliotheksverwaltung ·
  Encounter drucken.

## Bewusst nicht im Plan

- **Finding 2** (zwei Zauberwirken-Mechaniken) — läuft auf `rework-spellcasting`.
- **`mods` als abgeleiteten Zustand streichen.** `mods` ist zu 100 % aus `abilities` berechenbar
  (`mod(score)`) und damit redundanter Speicher — ein echter Befund, aber eine eigene Entscheidung:
  der PDF-Import liest Modifikatoren aus dem Formular, und das Streichen wäre ein zweiter
  Formatwechsel. Nach Phase 1 sauber nachholbar.
- **`character.skills` als geschlossener Record.** `domain/skills.ts:18` bekommt ein exportiertes
  `SkillKey = (typeof SKILL_DEFS)[number]['key']`, und die SKILL_DEFS-getriebenen Schleifen
  (`characterFormFields.ts:39` `skillFlags`) dürfen es benutzen. Das *Laufzeit*-Schema
  (`characterSchema.ts:193` `z.record(z.string(), …)`) bleibt offen — `CharacterSheetView.svelte:36`
  begründet das ausdrücklich: die Schlüssel können Fremd- und Altbestand enthalten. Zumachen hieße
  Altdaten verlieren.
- **Die 42 a11y-Warnungen** — eigenes Thema, kein Typ- oder Duplikationsbefund.
