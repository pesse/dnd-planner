# Strukturierte Übungen aus der Kerntabelle (Fertigkeiten, Waffen, Rüstung, Rettungswürfe)

> Umsetzungsplan, erstellt am 2026-07-28, noch nicht begonnen. Folgearbeit zur
> Hintergrund-Bibliothek (Commit-Stand `rework-ai-functions`) — entstanden aus der Frage,
> ob die `benefits[]` der Hintergründe stärker typisiert werden sollten.
>
> Alle Datenaussagen sind gegen `api.open5e.com/v2` und den SRD-Auszug im Repo geprüft;
> die Zeilennummern beziehen sich auf den Stand bei Planerstellung.

## Context

Übungen („Proficiencies") sind in 5e 2024 **geschlossene Vokabulare** — 18 Fertigkeiten,
6 Rettungswürfe, 2 Waffenkategorien, 4 Rüstungsstufen. In den Bibliotheken liegen sie
heute als Prosa oder gar nicht:

* **Hintergründe** tragen `benefits[]` mit `desc: "Athletics and Intimidation"` — Freitext.
* **Klassen** tragen *nichts*. Open5e v2 liefert die Kerntabelle als Merkmal
  `srd-2024_barbarian_core-traits` (`feature_type: "CORE_TRAITS_TABLE"`, `gained_at: []`),
  aber `mapV2Class` wirft sie weg: `classProgression.ts:74` filtert
  `.filter(f => f.gained_at.length > 0)`. Damit gehen Fertigkeiten, Waffen, Rüstung und
  Anfangsausrüstung aller 12 Grundklassen still verloren.
* **Spezies** verstecken Grants in Trait-Prosa (nur Elf „Keen Senses", Mensch „Skillful").
* **Talente**: nur `srd-2024_skilled`.
* Der **KI-Rider-Pfad** ist deshalb kaputt: `featureEffectsAction.ts:90` verlangt bloß
  „short names", `CharacterSheet.svelte:173` schlägt sie gegen die *deutschen* Bogen-Keys
  nach (`next.skills[c.skill].prof = true`). Ein englisch geführter Prompt kann
  `MitTierenUmgehen` nie treffen — die Zuweisung fällt still durch.

Zwei Regeln geben der Umsetzung die Richtung:

1. **Grundmechanik ist immer englisch.** Übersetzung ist ein klarer Layer EN→DE an genau
   einer Grenze. Vorbild im Bestand: `background.abilityScores: ["Strength","Dexterity"]`
   plus `ABILITY_FROM_EN` (`classProgression.ts:34`).
2. **Deterministisch, nicht per KI geraten.** Fertigkeiten entstehen ausschließlich bei der
   Erschaffung und beim Stufenaufstieg und sind aus Bibliotheksdaten voll ableitbar.

Ergebnis: Bibliotheks-Artefakte tragen englische Enum-Werte, der Charakterbogen bleibt
deutsch (das PDF-Formular diktiert `skills`-Keys wie `Akrobatik`/`MitTierenUmgehen`), und
zwischen beidem liegt eine einzige, compilergeprüfte Übersetzungstabelle.

**Mit dem User entschieden:** Kerntabelle komplett (Fertigkeiten + Waffen + Rüstung), und
`savingThrows` wird im selben Durchgang auf englische Namen migriert.

## Datenlage (verifiziert)

`/v2/classes/?document__key=srd-2024` liefert für alle 12 Grundklassen die Kerntabelle als
Markdown im `desc` des `CORE_TRAITS_TABLE`-Merkmals:

```
|Saving Throw Proficiencies|Strength and Constitution|
|Skill Proficiencies|Choose 2: Animal Handling, Athletics, Intimidation, Nature, Perception, or Survival|
|Weapon Proficiencies|Simple and Martial weapons|
|Armor Training|Light and Medium armor and Shields|
|Starting Equipment|Choose A or B: (A) Greataxe, 4 Handaxes, Explorer's Pack, and 15 GP; or (B) 75 GP|
```

Gegengeprüft gegen den deutschen SRD-5.2-Auszug im Repo (`src/lib/data/rules-chunks.json`,
Tabellen „Hauptmerkmale des …", ab S. 33) — **beide Quellen stimmen in allen 12 Listen
überein**. Zwei Fallen:

* **Open5e hat Datenmüll:** „Na ture" (Druide), „In sight" (Magier) — eingestreute
  Leerzeichen mitten im Namen.
* **v2 kennt die Mehrklassen-Regel nicht** (`feature_types` sind `CORE_TRAITS_TABLE`,
  `CLASS_LEVEL_FEATURE`, `CLASS_TABLE_DATA`, `PROFICIENCY_BONUS`, `SPELL_SLOTS`,
  `CLASS_FEATURE_OPTION_LIST`). Sie steht nur im SRD-Auszug, Abschnitt „Als Charakter mit
  Klassenkombination": **9 von 12 Klassen gewähren beim Multiclassing keine Fertigkeit**,
  Barde 1 aus allen, Schurke 1 aus der Schurkenliste, Waldläufer 1 aus der Waldläuferliste.

**v1 nicht verwenden** — `/v1/classes/` hat zwar `prof_skills`, ist aber
`document__slug: "wotc-srd"` (SRD 5.1/2014) und weicht ab (2014er Kämpfer 8 Fertigkeiten,
2024er 9 inkl. Persuasion).

Vokabular-Quelle für die 18 Fertigkeiten: `/v2/skills/`, gefiltert auf `document: 'core'`
(liefert `key: 'animal-handling'`, `ability: 'wis'`; die zwei A5E-Einträge fliegen raus).

## 1. Vokabular — `src/lib/schemas/shared.ts`

Neben `SOURCE_KEYS` die geschlossenen Regel-Vokabulare, englisch, SRD-Schreibweise:

```ts
export const SKILL_NAMES = ['Acrobatics','Animal Handling','Arcana','Athletics','Deception',
  'History','Insight','Intimidation','Investigation','Medicine','Nature','Perception',
  'Performance','Persuasion','Religion','Sleight of Hand','Stealth','Survival'] as const;
export const ABILITY_NAMES = ['Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'] as const;
export const WEAPON_CATEGORIES = ['Simple','Martial'] as const;
export const ARMOR_TRAININGS   = ['Light','Medium','Heavy','Shields'] as const;

/** Wahl-fähiger Fertigkeits-Grant. `from: []` = beliebig. */
export const skillGrantSchema = z.object({
  fixed:  z.array(z.enum(SKILL_NAMES)).default([]),
  choose: z.number().int().min(0).default(0),
  from:   z.array(z.enum(SKILL_NAMES)).default([]),
});

/** Was ein Bibliotheks-Artefakt an Übungen gewährt. Einheitliche Form für alle vier Typen. */
export const proficiencyGrantSchema = z.object({
  skills:       skillGrantSchema.default({ fixed: [], choose: 0, from: [] }),
  savingThrows: z.array(z.enum(ABILITY_NAMES)).default([]),
  weapons:      z.array(z.enum(WEAPON_CATEGORIES)).default([]),
  weaponsOther: z.array(z.string()).default([]),   // Einzelwaffen, z.B. "Longsword"
  armor:        z.array(z.enum(ARMOR_TRAININGS)).default([]),
});
```

Eine Form für alle vier Artefakttypen — das ist der Punkt: die Summierung über
Hintergrund + Klasse + Spezies-Traits + Talente ist dann *eine* Funktion, nicht vier.
Hintergründe füllen nur `skills`, Klassen alles.

Normalisierung fürs Einlesen (fängt „Na ture" ab): Lookup-Key = kleingeschrieben **ohne
jedes Leerzeichen** (`animalhandling`, `nature`, `insight`). Ein Treffer daneben wirft
sichtbar statt still durchzurutschen.

## 2. Übersetzungs-Layer — `src/lib/pdf/characterFields.ts`

`SKILL_DEFS` (`:72`) **ist** schon die deutsche Tabelle (Bogen-Key + Label + Attribut).
Nur ein Feld anhängen, keine zweite Map:

```ts
export const SKILL_DEFS: { key: string; en: SkillName; label: string; attr: string; … }[] = [
  { key: 'Akrobatik', en: 'Acrobatics', label: 'Akrobatik', attr: 'ges', … },
  { key: 'MitTierenUmgehen', en: 'Animal Handling', … },
  …
];
export const skillSheetKey = (en: SkillName): string => …;   // aus SKILL_DEFS abgeleitet
```

Die Typannotation auf `SKILL_DEFS` macht Vollständigkeit und Tippfehler zu Compilerfehlern.
Für Rettungswürfe existiert die Richtung schon (`ABILITY_FROM_EN`,
`classProgression.ts:34`) — dort die Umkehrung `ABILITY_TO_EN` ergänzen.

**Ziele im Charakter — alle vorhanden, keine neuen Felder nötig:**

| Kerntabellen-Zeile | Ziel im Charakter |
|---|---|
| Skill Proficiencies | `skills[<dt. Key>].prof` (`character.ts:308`) |
| Saving Throw Proficiencies | `strSaveProf` … `chaSaveProf` |
| Weapon Proficiencies | `proficiencies.simpleWeapons` / `.martialWeapons` / `.otherWeapons` |
| Armor Training | `proficiencies.lightArmor` / `.mediumArmor` / `.heavyArmor` / `.shields` |
| Starting Equipment | **kein strukturiertes Ziel** — bleibt Prosa (siehe Offene Punkte) |

`proficiencyFlagsSchema` (`character.ts:179`) samt PDF-Feldern
(`characterExport.ts:233-240`, `characterFields.ts:250-256`) und Editor-Häkchen
(`CharacterEditForm.svelte:1575`) ist unverändert nutzbar.

## 3. Import: Kerntabelle parsen — `src/lib/services/classProgression.ts`

* Zeile 74 nicht mehr blind filtern: `CORE_TRAITS_TABLE` wird nicht verworfen.
* Neue Funktion `parseCoreTraits(desc)`: zerlegt die Markdown-Tabelle in
  `Record<Zeile, Wert>`, daraus:
  * `Skill Proficiencies` → `skillGrantSchema`. Muster: `"Choose N: A, B, or C"` →
    `{choose: N, from: [...]}`; `"Choose any 3 skills"` → `{choose: 3, from: []}`;
    Aufzählung ohne „Choose" → `fixed`.
  * `Saving Throw Proficiencies` → `["Strength","Constitution"]` (ersetzt die heutige
    Umrechnung auf `ges`/`wei`/`kon` in Zeile 95).
  * `Weapon Proficiencies` → `['Simple','Martial']`, Unbekanntes nach `weaponsOther`.
  * `Armor Training` → `['Light','Medium','Shields']`.
  * `Starting Equipment` → neues Prosa-Feld `startingEquipment: string` am Klassenkopf.
* `skillGrantMulticlass: skillGrantSchema` als zweites Feld: nur Barde `{choose:1}`,
  Schurke `{choose:1, from:<10>}`, Waldläufer `{choose:1, from:<8>}`, sonst leer. Quelle ist
  `rules-chunks.json` (v2 hat es nicht) — beim Import **nicht** ableitbar, also im Vault
  gepflegt und beim Re-Import erhalten, nicht mit Leerwerten überschreiben.

**Schema `classProgression.ts`:** `savingThrows: AbilityKey[]` entfällt und wird Teil von
`proficiencyGrant`. Migration im Parse-Gate (`schemaValidation.ts`, `libraryEntry`-Migrator):
`savingThrows: ['kon','str']` → `proficiencyGrant.savingThrows: ['Constitution','Strength']`
via `ABILITY_TO_EN`. Betroffene Leser sind nur drei: `types.ts:237` (Blanko-Template),
`ClassCard.svelte:105`, `ClassEditForm.svelte:35`.

## 4. Import der übrigen drei Typen

* **`services/backgroundData.ts`** — `mapV2Background`: den `type: 'skill_proficiency'`-Benefit
  parsen („Insight and Religion" → `fixed: ['Insight','Religion']`). Alle 16 Hintergründe
  haben genau **2 feste** Fertigkeiten, keine Wahl.
* **`services/speciesData.ts`** — `traitSchema` bekommt `proficiencyGrant`; `mapV2Species`
  liest pro Trait: „proficiency in the A, B, or C skill" → `{choose:1, from:[A,B,C]}`,
  „one skill of your choice" → `{choose:1, from:[]}`. Betrifft nur Elf und Mensch.
* **`services/featData.ts`** — `featSchema` bekommt `proficiencyGrant`. Betrifft nur
  `srd-2024_skilled` (siehe Offene Punkte).

Alle drei folgen dem `mapV2*`-Muster: mappen → `schema.parse()` (bewusst werfend).

## 5. Ableitung — `src/lib/services/proficiencyGrants.ts` (neu)

Vorbild `characterFeatures.ts`: liest die Links des Charakters und löst gegen die
Bibliothek auf.

```ts
export interface GrantSource { label: string; sourceKey: string; }   // „Schurke", „Soldat", „Elf: Keen Senses"
export interface OpenChoice  { source: GrantSource; choose: number; from: SkillName[]; }
export interface CollectedGrants {
  skills: { name: SkillName; source: GrantSource }[];   // ohne Wahl gewährt
  choices: OpenChoice[];
  savingThrows: AbilityName[];
  weapons: …; armor: …;
}
export async function collectGrants(c: Character): Promise<CollectedGrants>;
```

Quellen: `backgroundRef` → `getBackgroundByKey`; `classes[0]` → `proficiencyGrant`
(Startklasse), `classes[1..]` → `skillGrantMulticlass`; `species` + `subspeciesKey` →
Traits; `references.feats[]` → `getFeats()`. Die Reihenfolge in `classes[]` ist maßgeblich —
Multiclassing hängt hinten an (`isNewClass` in `levelUpMachine.ts`).

**Keine Provenienz im Charakter speichern.** Die Häkchen sind die Wahrheit; das Panel
vergleicht den Ist-Zustand gegen die Grants und zeigt „Schurke: 4 aus 10 — 3 von 4 belegt".
Damit ist die Ableitung idempotent und braucht keine Rücknahme-Logik.

## 6. Oberfläche

* **`ClassCard` / `ClassEditForm`** — `savingThrows` liest jetzt englische Werte und zeigt
  deutsche Labels (`ABILITY_LABEL` aus `levelUpMachine.ts`, ist exportiert); neu:
  Fertigkeits-Grant (fest/Wahl/Liste), Waffen, Rüstung, Anfangsausrüstung.
* **`BackgroundCard` / `BackgroundEditForm`** — Fertigkeiten als Chip-Reihe mit deutschen
  Labels, analog zur bestehenden `abilityScores`-Reihe (`BackgroundCard.svelte:59`). Der
  `skill_proficiency`-Benefit wird dann nicht mehr zusätzlich als Textblock gerendert.
* **`SpeciesEditForm`** — Grant je Trait; **`FeatEditForm`** — Grant am Kopf.
* **`CharacterEditForm`** — im Abschnitt „Fertigkeiten" (`:1287`) ein Grant-Panel:
  Herkunfts-Marker an den betroffenen Zeilen, Auswahl-Widgets für offene Wahlen, ein
  „Übernehmen"-Knopf, der in `skillFlags` (`:158`) schreibt. Waffen/Rüstung analog im
  vorhandenen Übungs-Abschnitt (`:1575`), Rettungswürfe an den `*SaveProf`-Häkchen.
  Deterministisch angeboten, per Klick übernommen — nicht still überschrieben.

## 7. KI-Rider-Pfad reparieren

* **`schemas/levelUp.ts:110`** — `riderProficienciesSchema.skills` und
  `featureRiderSchema.expertiseSkills` auf `z.enum(SKILL_NAMES)`; `armor`/`weapons` auf die
  neuen Enums. `languages`/`tools` bleiben Freitext.
* **`aiActions/featureEffectsAction.ts:90`** — statt „short names" das geschlossene
  Vokabular benennen (die Prompts sind ohnehin englisch).
* **`CharacterSheet.svelte:170-174`** — `case 'proficiency'`/`'expertise'` übersetzen den
  englischen Namen via `skillSheetKey()` in den Bogen-Key. Das behebt den heutigen stillen
  Fehlschlag.
* `levelUpMachine.ts:464-469` reicht die Werte nur durch — die `Change`-Objekte tragen ab
  jetzt englische Namen, übersetzt wird erst beim Anwenden.

## 8. Vault-Inhalte (eigenes Repo)

* **12 Grundklassen** — `proficiencyGrant` + `startingEquipment` (aus v2 abgeleitet) und
  `skillGrantMulticlass` (aus `rules-chunks.json`); `savingThrows` wandert in
  `proficiencyGrant`. Die 16 Subklassen bekommen leere Grants.
* **16 Hintergründe** — `proficiencyGrant.skills.fixed`, deterministisch aus dem
  vorhandenen englischen `desc` der `skill_proficiency`-Benefits.
* **`species/elf.json`, `species/human.json`** — Grant am betroffenen Trait.
* **`feats/skilled.json`** — Grant.
* **`vault/CLAUDE.md`** — Abschnitt „Grundmechanik ist englisch": geschlossene Vokabulare,
  `proficiencyGrant`, und dass der deutsche Bogen die Übersetzungsseite ist.

Kein `source` ändert sich → die Pack-Zuordnung bleibt, wie sie ist.

## 9. App-`CLAUDE.md`

Die EN→DE-Schichtung als Architektur-Invariante festhalten: Bibliothek englisch,
`character.*` deutsch (PDF-Formular), genau eine Übersetzungstabelle (`SKILL_DEFS.en`,
`ABILITY_FROM_EN`/`ABILITY_TO_EN`).

## Reihenfolge

1. Vokabular in `shared.ts` + `SKILL_DEFS.en` + `ABILITY_TO_EN` (Grundlage, für sich prüfbar)
2. `parseCoreTraits` + `mapV2Class` + `classProgression`-Schema + Migration in `schemaValidation.ts`
3. Die drei übrigen Schemas + `mapV2*`
4. `proficiencyGrants.ts`
5. Vault-Daten (Skript, das v2 zieht und die Dateien schreibt; Mehrklassen-Zeile aus `rules-chunks.json`)
6. Karten/Editoren
7. `CharacterEditForm`-Grant-Panel
8. Rider-Pfad + Prompt
9. Doku (beide `CLAUDE.md`)

Schritt 2 ist der Kern; ohne 5 zeigt die UI leere Grants. **Kein Rust betroffen** — kein
Recompile, kein Dev-Server-Neustart, kein `npm install`.

## Verifikation

Es gibt **keine Unit-Test-Strecke für `src/`** (`vitest.config.ts` deckt nur `evals/**`,
das sind LLM-Evals — die führt der User selbst aus). Also statisch + Skript + manuell:

1. **Kreuzvalidierung der Parser** (Wegwerf-Skript, das entscheidende Gate): die 12 aus v2
   geparsten `skillGrant`s gegen die deutschen Listen aus `rules-chunks.json` stellen
   (DE→EN über `SKILL_DEFS`). Muss in allen 12 Klassen deckungsgleich sein — beide Quellen
   sind bekannt übereinstimmend, jede Abweichung ist also ein Parser-Fehler.
2. `npm run check` (svelte-check) — muss sauber sein; besonders die
   `Record<SkillName, …>`-Vollständigkeit und die `savingThrows`-Umstellung.
3. `node scripts/gen-schema-overview.mjs` — die `//#region schema-overview`-Blöcke der
   berührten Schemas neu erzeugen (`npm run schema:overview` ist als
   `_disabled_schema:overview` abgeschaltet, Skript direkt aufrufen). Vorbestehende Drift in
   `levelUp.ts`/`spell.ts` ignorieren.
4. `cd vault && python3 tools/build_packs.py --dry-run` — muss grün bleiben,
   0 unklassifiziert.
5. `npx vite build` — Produktionsbau.
6. **Idempotenz:** einen unveränderten Charakter öffnen und erneut speichern, `git diff`
   prüfen. Die `savingThrows`-Migration darf nur Klassendateien anfassen, keine Charaktere.
7. **Manuell** (App auf Windows via `.\dev-windows.ps1`, Log mit `tail -f tauri-dev.log`):
   * Klassenkarte Schurke: „4 aus 10", Waffen, Rüstung, Rettungswürfe deutsch beschriftet
   * Hintergrundkarte Soldat: Athletik + Einschüchtern als Chips, kein doppelter Textblock
   * Charakter öffnen → Grant-Panel zeigt Hintergrund (2 fest) + Klasse (N zur Wahl) +
     Elf/Mensch; „Übernehmen" setzt die Häkchen; erneutes Öffnen zeigt die Wahlen als belegt
   * Multiclass-Probe: zweite Klasse anhängen → nur Barde/Schurke/Waldläufer bieten eine
     Fertigkeit an, die übrigen keine
   * Stufenaufstieg mit einem Merkmal, das Übung gewährt (z.B. Barbar „Urwissen") → das
     Häkchen landet jetzt tatsächlich im Bogen (heute stiller Fehlschlag)
   * PDF-Export: Fertigkeits-, Waffen- und Rüstungshäkchen stimmen

## Offene Punkte / bewusste Grenzen

* **Mehrklassen-Grant deckt nur Fertigkeiten** (`skillGrantMulticlass`). Die
  Mehrklassen-Zeile gewährt laut SRD auch Waffen/Rüstung — Folgearbeit in
  `todo-mehrklassen-grant.md`.
* **`srd-2024_skilled`** gewährt „any combination of three skills or tools" — Fertigkeiten
  *und* Werkzeuge gemischt. `skillGrant` kann das nicht ausdrücken; Vorschlag
  `{choose:3, from:[]}` plus Hinweis in der Prosa, dass Werkzeuge zulässig sind. Bewusste
  Ungenauigkeit statt erfundener Struktur.
* **Anfangsausrüstung** bleibt Prosa. `inventory[]` referenziert Gegenstände über freie
  Namen — ein strukturierter Grant hätte kein Ziel.
* **`character.tools` / `.languages`** bleiben deutscher Freitext
  (`['Diebeswerkzeug','Drachenschach']`). Werkzeuge wären ein geschlossenes Vokabular, aber
  das braucht eine eigene EN→DE-Schicht plus Migration der Bestandsdaten — außerhalb dieses
  Plans. Damit bleibt auch die **Werkzeugübung der Hintergründe** Prosa im Benefit.
* **`benefits[]` der Hintergründe** wird nicht umgebaut. Der Übersetzungs-Prompt
  (`buildBackgroundTranslationSystemPrompt`) hängt an gleicher Länge und Reihenfolge; die
  Liste bleibt die Anzeigeebene, `proficiencyGrant` ist die Mechanik. Dieselbe bewusste
  Redundanz wie bei `abilityScores`/`featKey`.
* **Sprachen sind in 2024 keine Übung mehr** — `languages` bleibt außen vor, richtigerweise.
