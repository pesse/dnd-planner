# Merkmalswahlen im Charakter-Editor: jederzeit treffen, offene sichtbar machen

> Umsetzungsplan, erstellt am 2026-07-31 auf Stand Commit `d5d05ec` **plus** die noch nicht
> festgeschriebenen Änderungen im Arbeitsbaum (`shared.ts`, `featureDeclaration.ts`,
> `levelUpMachine.ts`, `characterWizard.svelte.ts`, `LevelUpAssistant.svelte`); alle
> Zeilennummern beziehen sich auf diesen Stand. Noch nicht begonnen.
>
> Nachgeordnet zu `docs/plan/plan-wahlen-deklarieren.md`: der beschreibt, wie eine Wahl in die
> BIBLIOTHEK kommt, dieser, wie sie am CHARAKTER jederzeit erreichbar wird. Beide teilen
> sich die Voraussetzung — nur ein deklariertes Merkmal hat überhaupt eine Wahl, die man
> hier treffen könnte.

## Context

Eine deklarierte Merkmalswahl (`grantsChoice`) ist heute **nur im Moment ihres Entstehens**
beantwortbar: im Erstell-Wizard oder im Stufenaufstieg. Danach ist sie eingefroren.
`CharacterEditForm.svelte:210` trennt das Merkmals-Ledger beim Bearbeiten auf — `refFeats`
(Talent-Links, editierbar) und ein **nicht-reaktives `const choiceEntries`**, das unangetastet
durchgereicht wird; die Anzeige ist ein read-only Chip („Entscheidung: …", `:1490`).

Daraus folgen drei Löcher:

1. **Ein Charakter, der nie durch den Wizard lief** (PDF-Import, Altbestand, von Hand angelegt)
   hat keine einzige seiner Wahlen getroffen — und keinen Weg, sie zu treffen.
2. **Eine Deklaration, die erst später in den Vault kam**, erzeugt rückwirkend eine offene Wahl.
   Das ist der Normalfall, solange `docs/plan/plan-wahlen-deklarieren.md` Stufe 3 läuft: die Abdeckung
   wächst, die Charaktere hinken hinterher. Elf und Tiefling sind gerade erst dazugekommen.
3. **Ein Vertipper bleibt ein Vertipper.** Wer im Aufstieg „Wächter" statt „Magier" wählte, kann
   das nur über den JSON-Tab korrigieren.

Nichts im Code weiß heute, dass ein Charakter eine Wahl *schuldet*: alle Prädikate
(`isOptionListFeature`, `isExpertiseFeature`, `isFlowOwnedDeclaration`) sind **Eingangsfilter für
die KI-Kette**, nie Fragen an einen gespeicherten Charakter. `declarationCoverage.ts` misst die
Redaktion der *Bibliothek*, nicht die Antworten des *Charakters*.

**Ziel:** Im Bearbeiten-Tab trägt jedes Merkmal, das eine Wahl deklariert, seine Wahl — mit
Antwort oder als *offen* markiert. Offene Wahlen sind an der (zugeklappten) Sektion abzählbar.

**Entschieden (mit dem User geklärt):**
- Umfang: `kind: 'optionList'` und `kind: 'expertise'` — die beiden Arten, deren Antwort im
  Merkmals-Ledger landet. (`weaponMastery` hat mit `WeaponMasteryPicker`
  (`CharacterEditForm.svelte:1961`) längst seinen Platz im Editor, `spellcasting` gehört dem
  Zauber-Block, `spellAccess`/`featCategory` bleiben draußen.)
- Mechanik: **„Übernehmen" je Wahl**, nicht automatisch bei jeder Auswahl.
- Hervorhebung: **inline am Merkmal + Zähler-Badge an der Sektion**.

## Was der Bestand inzwischen mitbringt

Vier Dinge sind seit dem ersten Entwurf entstanden und ändern den Plan:

1. **`services/declaredFeature.ts`** — `DeclaredFeature` (Merkmal **samt Herkunft**:
   `class | subclass | species | feat`) und `declaredFeatures(source, features)`. Das ist die
   Sicht, aus der alle Deklarations-Verbraucher lesen; der Wahl-Platz baut darauf auf, statt
   einen eigenen Merkmalstyp zu erfinden.
2. **`characterFeatures.ts:383 declaredSpeciesFeatures(species)`** — liefert Speziesmerkmale
   schon als `DeclaredFeature[]` (englischer Text, weil die Zauber-Stufentabelle daraus gelesen
   wird). Für Klassen und Talente gibt es das noch nicht.
3. **`components/DeclarationBadge.svelte`** — die Darstellung eines `CoverageBadge`
   (`tone: 'open' | 'done'`, gold/grün) ist aus `ClassCard` extrahiert und direkt
   wiederverwendbar. Kein Kopieren von CSS mehr nötig.
4. **`options[].spells` (`shared.ts optionSpellRowSchema`)** — eine Option kann jetzt **benannte
   Zauber je Stufe** gewähren, kumulativ. Deshalb hat `optionListRider(f, answer, level)` einen
   dritten Parameter bekommen, und deshalb reicht `riderGrantChanges` für „Übernehmen" **nicht**:
   Elf und Tiefling gewähren über ihre Abstammungswahl Zauber, keine Übungen.

## Bestand im Vault (gezählt am 2026-07-31)

| `kind` | Einträge |
|---|---|
| `optionList` | Druide, Kleriker (Orden) · **Elf, Tiefling (Abstammung, mit `spells` 1/3/5)** |
| `expertise` | Schurke (`gainedAt: [1, 6]`), Barde (`[2, 9]`) |

Zwei Konsequenzen: **Spezies sind ein lebender Fall**, nicht hypothetisch — und
**Mehrfachvergabe ist der Normalfall**: ein Schurke der Stufe 6 schuldet ZWEI
Expertise-Wahlen. `resolveClassFeatures` faltet das heute auf ein Merkmal zusammen
(`firstGainedAt`, `characterFeatures.ts:47`); der neue Dienst darf das nicht.

## Entwurf

### 1 · `characterFeatures.ts` — zwei Geschwister zu `declaredSpeciesFeatures`

Der Bibliotheks-Lauf bleibt, wo er schon liegt:

```ts
/** Klassen- und Subklassenmerkmale bis zur jeweiligen Stufe, mit ihren Vergabe-Stufen. */
export async function declaredClassFeatures(
  classes: CharacterClass[],
): Promise<{ feature: DeclaredFeature & { gainedAt: number[] }; group: string; level: number }[]>;

/** Verlinkte Talente (inkl. Herkunftstalent des Hintergrunds) als Deklarationsquelle. */
export async function declaredFeatFeatures(
  features: CharacterFeatureEntry[], background?: CharacterBackground,
): Promise<DeclaredFeature[]>;
```

Beide nutzen dieselben Zugänge wie die vorhandenen Auflöser (`getProgressionByKey`,
`featuresUpTo`, `getFeats`/`matchFeatEntry`) und `declaredFeatures(source, …)` aus
`declaredFeature.ts`. `gainedAt: number[]` reist mit, weil `DeclaredFeature` es nicht trägt und
die Mehrfachvergabe genau daran hängt.

### 2 · `src/lib/services/characterChoices.ts` (neu)

Die eine Stelle, die fragt: *welche Wahlen schuldet dieser Charakter, und welche sind
beantwortet?* In zwei Hälften geschnitten, weil die Expertise-Optionen **live vom Übungsstand
des Formulars abhängen**:

```ts
/** Ein Wahl-Platz: deklariertes Merkmal + EINE seiner Vergabe-Stufen. */
export interface ChoiceSlot {
  feature: DeclaredFeature;   // key/name/nameDe/source/grantsChoice
  group: string;              // „Schurke 6" · „Elf" · „Talente" — die Gruppe der Anzeige
  gainedAt: number;           // Vergabe-Stufe = Ledger-Schlüssel
  /** Maßgebliche Stufe für `options[].spells`: KLASSENstufe am Klassenmerkmal,
   *  CHARAKTERstufe bei Spezies und Talent — dieselbe Unterscheidung wie
   *  `optionLevel` in LevelUpAssistant.runFinalize. */
  level: number;
}

export async function collectChoiceSlots(c: Character): Promise<ChoiceSlot[]>;

export function buildCharacterChoices(
  slots: ChoiceSlot[],
  ctx: { proficient: string[]; expertised: string[]; ledger: CharacterFeatureEntry[] },
): CharacterChoice[];

export interface CharacterChoice {
  slot: ChoiceSlot;
  choice: AnalysisChoice;   // aus optionListChoice / expertiseChoice
  answer: string[];         // kanonisch (englisch); leer = OFFEN
  answerDe: string;         // Anzeige
  open: boolean;
}
```

**Wiederverwendet, nicht neu gebaut:** `optionListChoice(f)` / `expertiseChoice(f, proficient,
already)` aus `featureDeclaration.ts`. **Kein zweiter Erzeuger** — die `AnalysisChoice` ist der
eine Wahl-Typ von Oberfläche und Ledger (`declaredChoice.ts`).

**Drei Feinheiten, die sonst still brechen:**
- *Ledger-Zuordnung:* exakt über `(sourceKey, gainedAt)` — dieselbe Regel wie der Upsert in
  `applyChanges.ts:148`. Hat ein Merkmal nur EINEN Platz, greift zusätzlich der Fallback „ein
  Eintrag mit diesem `sourceKey`, egal welches `gainedAt`" (Altbestand trägt oft keins; der
  Aufstieg matcht Spezies-Antworten über `storedChoiceOf` ohnehin nur am Key).
- *Expertise stapelt nicht:* das `already` einer Vergabe sind die verdoppelten Fertigkeiten des
  Bogens **ohne die eigene Antwort** — sonst kann der Schurke seine Stufe-1-Wahl nicht mehr
  sehen, geschweige denn ändern.
- *Spezies und Talente bekommen `gainedAt: 1`* bzw. die Stufe ihres Link-Eintrags — dieselbe
  Belegung, die `assembleCharacter.ts:195` und `featureChoiceChanges` schreiben.

Dazu die Antwort → `Change[]`:

```ts
/** Die Wirkung einer getroffenen Wahl. Braucht die Zauberbibliothek, weil eine
 *  Abstammungs-Option benannte Zauber gewährt (Elf, Tiefling) — nicht nur Übungen. */
export function choiceGrantChanges(ch: CharacterChoice, library: SpellInfo[]): Change[];
```
baut über `optionListRider(f, answer, slot.level)` bzw. `expertiseRider(f, picked)` einen
`FeatureRider` und schickt ihn durch **`validateRiderSpells(riders, library)` → `riderChanges(v,
'feature-effects')`** (beide `levelUpMachine.ts`, beide schon exportiert und mit der
Wizard-Assembly geteilt). Damit deckt eine Funktion Übungen, Expertise, Zaubertricks und
vorbereitete Zauber ab — und die `keyof RiderProficiencies`-Totalität von `riderGrantChanges`
gilt weiter: ein neues Grant-Feld bricht den Build.

*Warum das gefahrlos ist:* alle so erzeugten Ziele sind idempotent (Flags setzen, Zauber mit
Dedup anhängen). Das einzige additive Ziel in `riderChanges` ist `ability` — und das kann hier
nicht entstehen, weil `featureGrantSchema` kein Attributsfeld hat und `emptyRider` es auf null
lässt.

Und der Zähler, in der vorhandenen Sprache:
```ts
export function openChoiceBadge(list: CharacterChoice[]): CoverageBadge | null; // null = keine Wahlen
```

Dazu, weil `LevelUpAssistant.svelte:390-398` sie heute inline hält und der Editor sie braucht:
```ts
export function sheetSkillProficiencies(c: { skills }): { prof: string[]; exp: string[] };
```
`LevelUpAssistant` ruft sie danach statt seines eigenen `sheetSkills`-Blocks.

### 3 · `src/lib/components/FeatureChoicePicker.svelte` (neu)

Präsentational, nach dem Muster von `WeaponMasteryPicker` / `FightingStylePicker`: Props rein,
Ereignisse raus, kein Bibliotheks- und kein Charakterzugriff.

```
choice: AnalysisChoice   answer: string[]   open: boolean   gainedAt: number
pendingGrants: boolean   hint: string   onchange(next: string[])   onapply()   diff: DiffDir
```

- Gerendert über **`TooltipSelect`** (existiert; der Wizard nutzt es für exakt diese
  `plainChoices`): `multiple={choice.type === 'multiselect'}`, `max={choice.max}`, Optionen aus
  `choice.options` (Wert) / `choice.optionsDe` (Anzeige) / `choice.optionHelpDe` (Tooltip),
  `placeholder="— offen —"`.
- `open` → goldene Markierung neben dem Merkmalsnamen (`DeclarationBadge`-Sprache).
- „Übernehmen" erscheint **nur**, wenn die Antwort steht und ihre Changes am Bogen noch etwas
  ändern würden. Sonst greift `hint`, und der hat drei ehrliche Fassungen:
  „✓ übernommen" · „keine deklarierte Mechanik — die Wirkung deutet die KI beim Aufstieg"
  (Option ohne `grants` und ohne `spells`, siehe `unredactedChoiceFeatures`) ·
  „Zaubertrick zählt im Zauber-Block" (`extraCantrips`/`extraPreparedCount`, siehe Grenzen).

### 4 · Die Mechanik: über den EINEN Applier, nicht daneben

**`services/applyChanges.ts`** bekommt den „schon angewandt?"-Test — ohne zweite Zielliste:
```ts
/** Ob diese Changes am Charakter noch etwas ändern würden. Geprüft am KLON, nicht an einer
 *  handgeführten Liste von Zielfeldern — die wäre die Kopie von `applyChanges` und liefe
 *  auseinander, sobald eine Variante dazukommt. */
export function changesWouldAlter(c: Character, changes: readonly Change[], ctx: ApplyContext): boolean;
```

**`CharacterSheet.svelte`** wendet an, nach dem Muster von `applyLevelUp` (`:167-193`):
```ts
async function applyChoiceGrants(changes: Change[]) {
  if (!ed.draft || !changes.length) return;
  await tick();   // der Sync-$effect des Formulars muss seine Runes im Draft haben,
                  // sonst verliert der Referenz-Swap die letzten Eingaben
  const next = structuredClone($state.snapshot(ed.draft)) as Character;
  applyChanges(next, changes, { classIndex: 0, resolveSpellKey: (n) => resolveSpell({ name: n })?.key });
  const r = parseCharacter(next);
  ed.draft = r.ok ? r.data : next;   // Referenz-Swap → {#key ed.draft} remountet, Diff greift
}
```
und reicht es als Prop weiter: `<CharacterEditForm … onApplyChanges={applyChoiceGrants} />` —
dieselbe Verdrahtung wie `onAcceptUpgrade` (`CharacterSheet.svelte:1161`).

### 5 · `CharacterEditForm.svelte`

Die Datei ist seit der Erkundung unverändert; alle Zeilennummern gelten.

**Antwort-Zustand.** `choiceEntries` (`:210`) wird von `const` zu `$state`. Der Sync-Effekt
(`:1456`) bleibt wörtlich stehen; beim Schreiben gilt:
- Upsert/Löschen über `(sourceKey, gainedAt)` — mit Kommentar, der `applyChanges.ts:148` als
  Geschwister-Regel nennt.
- Eine **geleerte** Antwort löscht ihren Eintrag. Ein Eintrag mit leerem `choice` wäre sonst ein
  Phantom-Talent-Link (`choice` ist der Diskriminator, `character.ts:97`).
- Geschrieben wird `{ sourceKey, name: '', choice, choiceDe, gainedAt, desc: '' }` — genau die
  Form, die `applyChanges` upsertet.

**Auflösung.** Der `$effect` bei `:1150` bekommt `collectChoiceSlots` dazu (gleiche
Abhängigkeiten: Klassen/Stufe/Subklasse/Spezies, plus die Talent-Links). Wichtig: `choiceEntries`
darf **nicht** in diesen Effekt hineinlesen, sonst löst jede Antwort eine neue
Bibliotheksauflösung aus — die Verknüpfung mit Ledger und Übungsstand ist ein `$derived` über
`buildCharacterChoices(slots, { ...sheetSkillProficiencies(computedSkills), ledger: choiceEntries })`.
Die heutige `annotations`-Berechnung (`:1157`) wandert aus demselben Grund in ein `$derived`.
Die Zauberbibliothek liegt schon bereit (`spellLibrary`, `:586-593`).

**Rendering.** Im Snippet `featureGroups` (`:1474`): Merkmale mit Plätzen zeigen statt des
read-only Chips (`:1490`) je Platz eine `FeatureChoicePicker`-Zeile (mehrere bei
Mehrfachvergabe, jede mit ihrer Stufe beschriftet), `use:diffMark={dirOf(gespeicherteAntwort,
answer)}` nach dem Muster von `featDir`. Talent-Plätze erscheinen analog in der Talente-Zeile
(`:2015`).

**Badge.** `<DeclarationBadge badge={openChoiceBadge(...)} />` am `<summary>` von „Verknüpfte
Merkmale & Talente" (`:1995`) — die Sektion ist ein zugeklapptes `<details>`, ein rein inliner
Marker wäre unsichtbar.

## Betroffene Dateien

| Datei | Rolle |
|---|---|
| `src/lib/services/characterChoices.ts` *(neu)* | Wahlen bauen, Grants projizieren, Übungsstand, Badge |
| `src/lib/components/FeatureChoicePicker.svelte` *(neu)* | eine Wahl: `TooltipSelect` + Offen-Markierung + „Übernehmen" |
| `src/lib/services/characterFeatures.ts` | `declaredClassFeatures` / `declaredFeatFeatures` neben `declaredSpeciesFeatures` |
| `src/lib/components/CharacterEditForm.svelte` | `choiceEntries` als `$state`, Derived, Rendering, Badge |
| `src/lib/components/CharacterSheet.svelte` | `applyChoiceGrants` (Muster `applyLevelUp`) + neues Prop |
| `src/lib/services/applyChanges.ts` | `changesWouldAlter` |
| `src/lib/components/LevelUpAssistant.svelte` | nutzt `sheetSkillProficiencies` statt inline-`sheetSkills` |

Kein Zod-Schema ändert sich → **kein `CHARACTER_VERSION`-Bump, kein Upgrade-Schritt, kein
`npm run schema:examples`**. Auch `ResolvedFeature` bleibt unverändert; die Zuordnung im
Rendering läuft über `featureKey`.

## Bewusst nicht enthalten

- `spellAccess`, `featCategory`, `spellcasting` (siehe Entscheidung oben).
- **`extraCantrips` / `extraPreparedCount` einer Option** (Druide → Magier) erzeugen keinen
  `Change`: sie sind Zauber-Kontingent, das `spellcastingOffer` (`services/spellcasting.ts`) aus
  den Ridern zieht, kein Bogenfeld. Der Picker sagt das, statt einen Knopf anzubieten, der
  nichts tut.
- **Rücknahme alter Wirkungen.** Wer Wächter → Magier ändert, behält die Kriegswaffen-Übung:
  `applyChanges` ist durchgehend additiv, und ein Entfernen-Pfad wäre ein eigener Entwurf. Der
  Picker weist beim Wechsel einer bereits übernommenen Antwort darauf hin.
- Bogen-Notizen (`optionListNoteLines`) neu erzeugen — der Freitext gehört dem Nutzer bzw. dem
  KI-Verdichtungsknopf, der schon daneben sitzt.
- Nicht auflösbare Zaubernamen (`validateRiderSpells().flagged`) werden im Picker gemeldet, aber
  nicht repariert — dieselbe Behandlung wie im Aufstieg.

## Verifikation

1. `npm run check` — das Gate (Typecheck + Lint).
2. App auf Windows starten (`.\dev-windows.ps1`), Log via
   `tail -f /mnt/c/dev/privat/dnd-planner/tauri-dev.log`.
3. **Druide Stufe 1** (Urtümlicher Orden, `optionList` mit Übungen): Bearbeiten-Tab → die
   zugeklappte Sektion zeigt „1 offene Entscheidung". Aufklappen → „Wächter" → Speichern-Leiste
   wird aktiv → „Übernehmen" setzt Kriegswaffen + mittlere Rüstung; der Knopf verschwindet
   danach. Speichern, Datei neu laden: Antwort und Häkchen stehen.
4. **Elf Stufe 5** (Abstammung, `optionList` mit `spells` 1/3/5): „Übernehmen" trägt die Zauber
   **bis Stufe 5 kumulativ** in den Zauber-Block ein (Charakterstufe, nicht Klassenstufe).
   Erneut klicken ändert nichts (Dedup).
5. **Schurke Stufe 6** (Expertise, `gainedAt [1,6]`): **zwei** Wahl-Zeilen, je „Stufe 1"/„Stufe
   6". Optionen sind nur geübte Fertigkeiten; eine in Zeile 1 verdoppelte fehlt in Zeile 2,
   steht in Zeile 1 aber weiterhin (eigene Antwort). „Übernehmen" setzt `prof`+`exp`.
6. **Regression Aufstieg:** derselbe Schurke ein Level höher — der Checkpoint fragt die
   Expertise unverändert und schreibt sie an derselben Ledger-Stelle (kein Doppel-Eintrag).
7. **Altbestand:** ein Charakter mit deutschem `choice` und ohne `gainedAt` zeigt seine Antwort
   (Einzel-Platz-Fallback) statt „offen".
8. `npm run eval` **nicht** ausführen — das macht der User.
