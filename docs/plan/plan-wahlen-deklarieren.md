# Alle Merkmalswahlen deklarieren — die KI-Deutung abbauen

> Umsetzungsplan, erstellt am 2026-07-30 im Worktree `analyse-prompts`.
> **Stand 2026-07-31: Stufe 0, 1, 2 und 2b sind umgesetzt**, Stufe 3–5 offen.
> Was die Umsetzung am Plan korrigiert hat, steht in Abschnitt „Korrekturen aus der
> Umsetzung"; die Stufen-Abschnitte selbst sind der ursprüngliche Entwurf.
> Übergeordnet zu `docs/plan/plan-zauberwirker-vereinfachung.md`: der zieht **einen** Fall
> (Eingeweihter der Magie) aus der Kette, dieser beschreibt den Endzustand, in dem die Kette nichts
> mehr zu deuten hat. Zahlengrundlage ist `docs/analysis/analyse-system-prompts.md` (Modell QM/vLLM
> `Qwen3.6-35B-A3B-AWQ-4bit`, `--runs 5`); Bestandszahlen sind am 2026-07-30 aus dem Vault
> gezählt. Zeilennummern: Stand `analyse-prompts-wt`.

## Befund

Die Merkmals-Deutung erzeugt zwei Dinge, und nur eines davon ist eine Wahl:

| Bestandteil | Wahl? | deterministische Quelle |
|---|---|---|
| `choices` (Frage, Optionen, `max`, `optionHelp`) | ja | **fehlt** — dieser Plan |
| `grantedSpells` | nein | `grantsSpells` (existiert, 6 Merkmale) |
| `proficiencies`, `expertiseSkills`, `abilityScoreIncrease`, `extraCantrips`, `extraPreparedCount` | nein | **fehlt** — dieser Plan |
| `levelUpEffects.hpMax` (+1/Stufe) | nein | **fehlt** — dieser Plan, Stufe 0 |
| `sheetNote` | nein | Text; bleibt zunächst KI (Stufe 5 offen) |

Ein Umzug nur der Wahlen halbiert die Arbeit nicht: solange ein Merkmal wegen seiner *Grants*
im KI-Eingang bleibt, laufen alle drei Reasoning-Durchläufe weiter. **Wahlen und Grants müssen
zusammen wandern**, sonst ist nichts gewonnen.

Der Weg ist zweimal vorgezeichnet: `grantsChoice` (`schemas/shared.ts:252`, vier `kind`s) und
`grantsSpells` (`spellGrantSchema`) nehmen ein Merkmal **vor** der KI aus dem Eingang
(`isFlowOwnedChoiceFeature`, `services/levelUp.ts:90`). Dieser Plan verallgemeinert dieselbe
Bewegung, statt eine neue zu erfinden.

## Die Naht: `FeatureRider` bleibt

Der Grund, weshalb das kein Umbau ist: **alles hinter dem Rider bleibt unangetastet.**
`featureRiderSchema` (`schemas/levelUp.ts:128`) ist heute die Ausgabe von Pass C — sie kann
genauso die Ausgabe eines deterministischen Builders sein. Unverändert weiter benutzt werden:

| Verbraucher | Datei |
|---|---|
| `validateRiderSpells` | `services/levelUpMachine.ts:313` |
| `buildDecisions` (Fragebogen) | `services/levelUpMachine.ts:364` |
| `sheetNoteLines` | `services/levelUpMachine.ts:776` |
| `learnInfo` | `services/levelUpMachine.ts:344` |
| `riderExtras` | `services/spellcasting.ts:182` |
| `AnalysisChoice` als **einziger** Wahl-Typ für UI und Ledger | `declaredChoice.ts`, `spellAccess.ts:131` |

Die Vorlage für den Builder existiert dreifach und ist klein: `services/spellAccess.ts` (261
Z.), `weaponMastery.ts` (190 Z.), `fightingStyle.ts` (109 Z.). Alle drei lesen eine
Deklaration, liefern `AnalysisChoice[]` und einen Grant. Neu ist nur die Verallgemeinerung
plus der Schritt „Deklaration + Antworten → `FeatureRider`".

## Die Deklaration

### 1 · `grants` — unbedingte Mechanik am Merkmal

Neues optionales Feld an `classFeatureSchema` (`schemas/classProgression.ts:50`),
`traitSchema` (`schemas/species.ts:28`) und `featSchema` (`schemas/feat.ts`):

```ts
export const featureGrantSchema = z.object({
  proficiencies: riderProficienciesSchema,     // schemas/levelUp.ts:69
  abilityScoreIncrease: abilityDeltaSchema,    // schemas/levelUp.ts:52
  extraCantrips: z.number().int().default(0),
  extraPreparedCount: z.number().int().default(0),
  perLevel: z.object({ hpMax: z.number().int().default(0) }).default({ hpMax: 0 }),
});
```

Kein neuer Werte-Typ: beide Teilschemas existieren, sie sind heute nur **nicht exportiert**
(`const` in `levelUp.ts`) — sie wandern nach `shared.ts`, wo `proficiencyGrantSchema` schon
liegt. `grantedSpells` gehört bewusst **nicht** hierher; das ist `grantsSpells`.

`traitSchema.proficiencyGrant` (heute separat) geht in `grants.proficiencies` auf — sonst
gibt es zwei Übungs-Senken am selben Merkmal.

### 2 · `grantsChoice` bekommt drei `kind`s

`FEATURE_CHOICE_KINDS` (`shared.ts:243`) wächst von vier auf sieben:

| `kind` | deckt | Optionen kommen aus |
|---|---|---|
| `optionList` | Urtümlicher Orden, Göttlicher Orden, Gnomische/Drachen-/Elfen-Abstammung, Metamagie | der Deklaration |
| `expertise` | Expertise-Merkmale (Schurke St. 1, Barde) | **Laufzeit**: die geübten Fertigkeiten des Charakters |
| `abilityIncrease` | „+1 auf eines von …" an Talenten | `ABILITY_NAMES`, verengt durch die Deklaration |

`optionList` trägt die Konsequenz **neben** der Option:

```ts
const choiceOptionSchema = z.object({
  value: z.string(),                    // englisches Label, verbatim aus dem Regeltext
  labelDe: z.string().default(''),      // ZITAT aus descDe, keine Übersetzung
  helpDe: z.string().default(''),       // ≤60 Zeichen
  grants: featureGrantSchema.optional(),
  grantsSpells: spellGrantSchema.optional(),
  grantsChoice: featureChoiceGrantSchema.optional(),  // Folgewahl (z.B. Magician → Zaubertrick)
});
```

Damit fällt **`determinesFurtherEffects` weg** — und mit ihm `blocked` und die gesamte
Nach-Analyse (Call 2 der Kette, gemessen 30–40 s). Eine Option, deren Wirkung neben ihr steht,
kann nichts blockieren.

`expertise` ist der Fall, den kein Vault-Feld füllen kann: die Optionen sind die geübten
Fertigkeiten *dieses* Charakters. Deklariert wird nur `count`; die Optionen baut der Builder
aus `character.skills`. Genau deshalb ist es ein eigener `kind` und kein `optionList` mit
leeren Optionen.

### 3 · „geprüft und leer" ≠ „nie angesehen"

Die wichtigste Kleinigkeit: `grants` ist **optional ohne Default**. Fehlt das Feld, ist das
Merkmal nicht redigiert und geht weiter durch die KI-Kette. Steht `grants: {}` da, ist es
geprüft und gewährt nichts. Ohne diese Unterscheidung wird jede Deckungslücke still — ein
Homebrew- oder frisch importiertes Open5e-Merkmal verlöre seine Wahl, ohne dass es auffällt.

Daraus folgt zwingend: **kein Stichtag, kein Big Bang.** Die Kette schrumpft mit der
Abdeckung, jede Stufe ist einzeln lieferbar, und ein nicht deklariertes Merkmal verhält sich
wie heute.

## Umfang (gezählt am 2026-07-30)

| Bibliothek | Einträge | Merkmale | schon deklariert |
|---|---|---|---|
| `vault/classes` | 28 Dateien | **249** Merkmale | 17 `grantsChoice`, 6 `grantsSpells` |
| `vault/species` | 10 | **56** Traits | 0 (nur `proficiencyGrant`/`sheetValue`) |
| `vault/feats` | 23 | **23** | 1 geplant (Eingeweihter der Magie) |
| | | **328** | ~23 |

328 Einträge zu triagieren, davon trägt die große Mehrheit gar keine Mechanik (`grants: {}`).
Das ist die Größenordnung eines Redaktions-Nachmittags, nicht eines Projekts.

## Anlage und Pflege

Der Vorschlag steht ausdrücklich darauf, dass die Anlage billig ist — und die Messreihe belegt
das: im Endstand stehen **alle 24 Core-Assertions über drei Fälle auf 5/5**, erzeugt von einem
35B-4bit-Modell (`docs/analysis/analyse-system-prompts.md`, Abschnitt 9). Was die Kette heute pro
Aufstieg leistet, muss sie künftig nur einmal pro Bibliothekseintrag leisten.

Der Unterschied ist nicht die Fähigkeit, sondern die Fehlerfolge:

| | heute (Laufzeit) | künftig (Redaktion) |
|---|---|---|
| Aufrufe | 1 Kette je Aufstieg je Charakter | 1 Aufruf je Bibliothekseintrag, einmal |
| Fehler bleibt | still am Charakter (`max: 1` für zwei Zaubertricks kostet einen) | im Review sichtbar, vor dem Schreiben |
| Korrektur | nicht möglich — der Lauf ist weg | Vault-JSON, versioniert, editierbar |

**Das Werkzeug:** ein Skript (`scripts/` bzw. `npm run vault:declare`), **kein App-Feature**.
Es fährt `FEATURE_EFFECTS_ANALYSIS_SYSTEM` (`featureEffectsAction.ts:120`) — denselben Prompt,
nur mit dem Bibliothekseintrag als Eingang statt eines Charakter-Aufstiegs — und schreibt
`grants`/`grantsChoice`-**Vorschläge** in eine Datei je Bibliothek. Nichts landet ohne Abnahme
im Vault. Für das Review existiert die Oberfläche schon: `ClassEditForm.svelte:180-210` hat die
`grantsChoice`-UI, inklusive `'other'`-Anzeige für hand-editierte Werte.

Zwei Dinge machen den Batch-Lauf leichter als den Laufzeit-Lauf:

1. **Kein Zeitdruck** — kein `EVAL_MAX_TOKENS`-Korsett, kein wartender Nutzer. Der
   Reasoning-Runaway (2 von 13 Pass-A-Calls rissen das 16k-Budget, 193 s, Ergebnis verloren)
   ist hier ein Retry, kein Fehlschlag.
2. **Kein Kontext** — der Eintrag steht allein da, ohne `<class_context>`, ohne
   `<past_choices>`, ohne getroffene Wahlen. Die drei Prompt-Abschnitte, die im Bericht als
   „unbelegt" stehen (B6, B10, B12), betreffen genau diesen Kontext und entfallen im
   Redaktions-Prompt.

Zur **Pflege**: `grantsChoice`/`grantsSpells` werden laut `classProgression.ts:64` beim
Open5e-Re-Import nicht überschrieben (`mapV2` lässt sie leer). `grants` folgt derselben Regel —
und braucht denselben Satz im Re-Import-Pfad wie `skillGrantMulticlass`.

## Korrekturen aus der Umsetzung (2026-07-30)

Sechs Dinge sahen im Code anders aus als im Entwurf:

1. **`grants.proficiencies` ist `proficiencyGrantSchema`, nicht die Rider-Form.** Der Entwurf
   wollte `riderProficienciesSchema` aus `levelUp.ts` hochziehen. Falsch: der Vault hat für
   Übungen längst EINE Form über alle vier Artefakttypen — mit `weaponsOther`, mit
   `savingThrows` als Enum und mit `skills` als wahl-fähigem `skillGrant`. `proficiencyGrants.ts`
   summiert sie schon. Die Rider-Form ist die LLM-Ausgabe, nicht die Vault-Sprache.
2. **`featureGrantSchema` wächst mit dem Bedarf, nicht auf Vorrat.** Stufe 0 hat nur
   `perLevel`, Stufe 1 hat `proficiencies`/`extraCantrips`/`extraPreparedCount` dazugelegt.
   `abilityScoreIncrease` fehlt weiter — im SRD 5.2 gibt es dafür keinen Vault-Fall (die
   FESTE Erhöhung; die Wahl „+1 auf eines von …" ist Stufe 2).
3. **Der synthetische Rider war richtig, aber nicht hinreichend.** Er deckt Zauber,
   `extraCantrips`, Fertigkeiten und Expertise über den bestehenden Pfad ab — Waffen- und
   Rüstungsübungen hatten im Aufstieg jedoch **gar kein Change-Ziel**, auch für KI-Rider
   nicht. Sie fielen still weg. Neu: `weaponProficiency`/`armorTraining` plus die einmalige
   Abbildung `markWeaponProficiency`/`markArmorTraining` (proficiencyGrants.ts).
4. **Eine Deklaration braucht ihre Bogen-Zeile.** Sobald ein Merkmal aus dem KI-Eingang
   fällt, schreibt Pass C keine `sheetNote` mehr dafür — ohne `optionListNoteLines` wäre
   Stufe 1 eine Regression. Damit ist ein Stück von Stufe 5 **vorgezogen** und beantwortet:
   für eine redigierte Option ist die Zeile ein Zitat (`labelDe`) plus eine redigierte
   Konsequenz (`helpDe`), keine Laufzeit-Übersetzung. Das stützt Stufe 5.
5. **Die Speziesabstammungen sind KEINE reine Zweigwahl** und deshalb nicht in Stufe 1.
   Gnomen- und Elfenabstammung tragen je eine ZWEITE Wahl in derselben Prosa („Intelligenz,
   Weisheit oder Charisma ist dein Zauberattribut") und die Elfen-Variante zusätzlich eine
   Stufentabelle (1/3/5) — das ist `spellAccess` mit Zweig, nicht `optionList`. Sie gehören
   zu `docs/plan/plan-zauberwirker-vereinfachung.md`. Die Drachenabstammung bleibt aus einem
   dritten Grund draußen: ihre Antwort ist Eingang für den TEXT ANDERER Merkmale
   (Odemwaffe, Schadensresistenz) — der interlockte Fall, der das Modell wirklich braucht.
6. **Subklassen-Merkmale nach der Subklassen-Wahl sind nicht abgedeckt.**
   `computeSubclassFeatures` projiziert auf `GainedFeature`, und dieser Typ trägt
   `grantsChoice` nicht. Heute betrifft das nichts (beide redigierten Merkmale sind
   Grundklassen-Merkmale der Stufe 1), aber eine Subklasse mit `optionList` würde ihre Wahl
   verlieren. Fällig, sobald eine redigiert wird.
7. **Eine Übungs-Senke am Merkmal, und `skills.choose` steht darin.** `trait.proficiencyGrant`
   und `feat.proficiencyGrant` sind nach `grants.proficiencies` gewandert (am Klassenkopf und
   Hintergrund bleiben sie — keine Merkmale). Der Satz aus Abschnitt 1, `skills.choose` sei
   „eine Wahl, kein Grant", war als Feldregel falsch: alle drei Vault-Fälle (Elf, Mensch,
   Skilled) sind offene Wahlen. Richtig ist die Senken-Trennung — `collectGrants` fragt die
   offene Wahl, `withGrant`/`proficiencyGrantChanges` wenden nur `skills.fixed` an.
8. **`grantsSpells` je Option hat keine lesbare Senke.** Abschnitt 1 wollte
   `grantsSpells: spellGrantSchema` an `choiceOptionSchema`. Nicht möglich: `spellGrantSchema`
   ist ein Diskriminator (`kind: 'levelTable'`), die Zaubernamen stehen in der Tabelle im
   `desc`. Eine Option hat kein eigenes `desc`, ein Options-`levelTable` würde alle Zweige
   parsen und jedem Zweig die Zauber der anderen geben. Wenn ein Zweig je Zauber gewährt, wäre
   die Form `options[].spells: string[]` → `rider.grantedSpells`. **Nicht erneut vorschlagen.**
   Am TRÄGER ist `grantsSpells` dagegen jetzt überall (Klassenmerkmal, Trait, Talent) — mit
   Senke in beiden Flows.
9. **Welche `kind`s ein Träger deklarieren darf, entscheidet die SENKE, nicht die Herkunft.**
   Der Editor führte kurz eine Hand-Liste je Artefakt („Klassenmerkmal kann alles, Trait und
   Talent zwei Formen") — genau die Asymmetrie, die die eine Deklaration löscht. Sie hatte
   `spellAccess` ganz verloren, obwohl ausgerechnet ein **Talent** der einzige Vault-Eintrag
   damit ist. Richtig ist `CLASS_TABLE_CHOICE_KINDS` (`schemas/shared.ts`): drei `kind`s lesen
   ihr Kontingent aus der Klassen-Stufentabelle und sind an Trait/Talent nicht auflösbar, alle
   übrigen gelten überall. Dafür musste die `spellAccess`-Senke von „nur Talent" auf die eine
   getaggte Liste beider Flows wachsen (`prep.declared`, `baseDeclared`/`featDeclared`) — der
   Hochelf-Zaubertrick ist mechanisch dasselbe wie „Eingeweihter der Magie".

## Stufe 0 — `levelUpEffectsAction` ersatzlos streichen ✅

Der billigste Beweis der ganzen Strecke: ein **kompletter KI-Call** fällt weg gegen zwei
Vault-Zeilen.

`LEVELUP_EFFECTS_SYSTEM` (`aiActions/levelUpEffectsAction.ts:29`) bekommt den **gesamten**
Merkmalsbestand des Charakters und sucht darin pro-Stufe-Effekte. Regel 2 nennt das einzige
relevante Ziel und beide existierenden Fälle selbst: Dwarven Toughness (+1) und Tough (+2).
Beide sind im Vault:

- `vault/species/dwarf.json`, Trait `srd-2024_dwarf_dwarven-toughness` → `grants.perLevel.hpMax: 1`
- `vault/feats/tough.json` → `grants.perLevel.hpMax: 2`

**Arbeit:** `featureGrantSchema` anlegen (nur `perLevel` gefüllt, Rest Default),
`schemas/levelUp.ts:52/69` exportieren bzw. nach `shared.ts` ziehen, die beiden Vault-Einträge
setzen, `services/perLevelEffects.ts` (~30 Z.) summiert `grants.perLevel.hpMax` über alle
Merkmale, `LevelUpAssistant.svelte:802` ruft es statt `runAiAction`. `levelUpEffectsAction.ts`
und `levelUpEffectsSchema` löschen.

**Verifikation:** `npm run check`; Unit-Test „Zwerg + Zäh auf Stufe 5 = +15 TP" (heute gibt es
dafür keinen Test — der Pfad hing an einem LLM). Sichtbar in der App: Aufstieg eines Zwergs.

## Stufe 1 — `optionList` mit Konsequenz je Option ✅ (ohne Spezies, siehe Korrektur 5)

Die Zweigwahl, an der die Kette heute am teuersten arbeitet. `docs/plan/plan-zauberwirker-vereinfachung.md`
nennt die Gnomische Abstammung ausdrücklich als „bleibt Modellarbeit, weil die Zauber am Zweig
hängen" — mit Grants **je Option** fällt dieses Argument, denn der Zweig steht dann als Daten da.

Fälle, die die Eval-Strecken schon kennen (Baseline vorhanden):

| Merkmal | Optionen | Konsequenz je Option |
|---|---|---|
| Primal Order (Druide) | Magician / Warden | `extraCantrips: 1` / Martial + Medium armor |
| Gnomische Abstammung | Forest / Rock Gnome | `grantsSpells` je Zweig (Minor Illusion, Speak with Animals) |
| Drachenabstammung | 10 Farben | Schadenstyp (Bogenwert, keine Übung) |
| Elfen-Abstammung | 3 Zweige | `grantsSpells` je Zweig |

**Arbeit:** `kind: 'optionList'` + `choiceOptionSchema`; `services/featureDeclaration.ts` als
Verallgemeinerung von `spellAccess.ts` — `declaredChoices(feature)` → `AnalysisChoice[]`,
`buildRider(feature, answers)` → `FeatureRider`; `isFlowOwnedChoiceFeature` deckt den Fall
schon ab (`!!f.grantsChoice`), aber der **Speziespfad** braucht dieselbe Filterung: heute gibt
es `withoutSpellAccessFeatures` (`spellAccess.ts:84`) nur für Zauber-Zugänge.

Achtung Reihenfolge: `withoutOwnedChoices` (`declaredChoice.ts`) existiert genau für Merkmale,
die im KI-Eingang **bleiben** müssen. Diese Ausnahme bleibt, solange Stufe 5 offen ist.
(Das Beispiel war die Größe von Mensch/Tiefling — seit Stufe 2b ist sie deklariert und fällt
über `withoutDeclaredChoiceFeatures` aus dem Eingang; übrig bleiben die Merkmale mit `grants`
ohne Wahl und die Zweigwahlen, deren Option nichts deklariert.)

**Verifikation:** die Druiden- und Gnom-Assertions aus `evals/cases/` werden zu Vitest-Tests
gegen `buildRider` — **ohne LLM-Kosten**. Der Druiden-Fall (Baseline 0/5 auf sechs
Core-Assertions, geheilt durch K1) wird damit von einer Prompt-Frage zu einer
Builder-Frage.

**Das muss im Bericht stehen:** dass eine Assertion grün ist, heißt ab hier nicht mehr
„der Prompt ist gut". Es ist dieselbe Warnung, die `docs/analysis/analyse-system-prompts.md` unter
Empfehlung 1 für `fillDecisions` formuliert — hier gilt sie für die ganze Strecke.

## Stufe 2 — `expertise` und `abilityIncrease` ✅ (nur `expertise`)

> `abilityIncrease` ist **nicht** gebaut: im SRD 5.2 gibt es dafür keinen Vault-Fall. Kein
> Herkunfts- oder Allgemein-Talent des Bestands gewährt „+1 auf eines von …" — der generische
> ASI ist ohnehin schon deterministisch (`asi_or_feat_*`). Ein `kind` ohne Fall wäre genau die
> Regel-für-einen-Eingang-den-es-nie-gibt, die der Analyse-Bericht als B2 aufgeschrieben hat.

Schließt die drei Pass-C-Regeln, die laut Bericht (B9) **keine positive Testabdeckung** haben:
Regel 4 (`expertiseSkills`), Regel 6 (`abilityScoreIncrease`) und die Klammer in Regel 5. Der
Bericht empfiehlt dafür zwei neue Eval-Fixtures; deklarativ **entfallen die Regeln**, und mit
ihnen der Bedarf an Fixtures.

**Arbeit:** `kind: 'expertise'` (Optionen aus den geübten Fertigkeiten des Charakters,
`count` deklariert), `kind: 'abilityIncrease'` (`abilities: ABILITY_NAMES[]`, `count`);
Vault: Schurke St. 1 + Barde (Expertise), `feats/tough.json` u.a. (feste Erhöhung ist
`grants`, keine Wahl — nur „+1 auf eines von …" wird `abilityIncrease`).

Der eingeschränkte Waffen-Grant („Martial weapons with the Light property") bleibt, was Regel 5
schon sagt: kein Grant, sondern Text — künftig ein deklarierter `sheetNoteDe` (Stufe 5) statt
einer Prompt-Regel.

**Verifikation:** Unit-Tests; `npm run check`. Ein Schurke St. 1 im Wizard.

## Stufe 2b — Grundeigenschaften: `grants.properties` + `kind: 'characterProperty'` ✅

Der Fall, den die bisherigen Stufen nicht erreichten, weil ihm die **Senke** fehlte: eine
Deklaration konnte Übungen, Zauber und TP je Stufe ausdrücken, aber nicht „setze Eigenschaft X
auf Wert Y". Also las die Größe sich aus dem englischen Merkmalstext (`services/speciesSize.ts`,
Wortsuche gegen `MONSTER_SIZES`) und die Bewegungsrate aus deutscher Prosa
(`metersFromSpeedText`) — zwei Heuristiken neben der Deklaration.

| | fest | Wahl |
|---|---|---|
| `size` | 7 Spezies (`grants.properties.size`) | 3 (`phb-2024_fairy`, `srd-2024_human`, `srd-2024_tiefling`) |
| `speedFeet` | 10 Spezies | 0 — bedingte Raten (Barbar, Mönch, Waldläufer) bleiben Prosa |

**Warum ein eigener `kind` und nicht `optionList` mit `grants` je Option:** die Optionen sind
ein geschlossenes Vokabular, das die App schon hat. Die Deklaration nennt nur Eigenschaft und
zugelassene Werte (`property`, `propertyValues`), Labels kommen aus `MONSTER_SIZES` — im Vault
stehen vier Zeilen statt vierzehn, und eine Homebrew-Spezies kann die Wahl anbieten, ohne
deutsche Labels zu pflegen.

**Der Weg an den Charakter ist `Change`, nicht Rider.** Der Rider ist das Ausgabevokabular des
Modells; eine Größe darin hieße, Pass C dürfte sie erfinden. Also `sizeCategory`/`speedFeet` in
`changeSchema` mit `case` in `applyChanges` — **dort** liegt die Übersetzungsgrenze
(`'Small'` → „Klein", 35 ft → „10,5"), wie bei Fertigkeit und Waffe.

**Drei Dinge, die im selben Schnitt zugehen mussten:** `isEmptyFeatureGrant` und `grantIsEmpty`
(`declarationCoverage.ts`) hätten ein Merkmal, dessen einziger Grant eine Eigenschaft ist, als
„geprüft, gewährt nichts" übersprungen — der Wert wäre still verschwunden, dieselbe Lücke wie
zuvor bei `weaponsOther`. Und `withGrant` zählt die Felder von `FeatureGrant` von Hand auf;
daneben steht jetzt `GRANT_SINKS`, total über `keyof`.

**Der Parser bleibt als Fallback.** `sizeChoiceOf` liefert für ein redigiertes Merkmal `null`
(`isRedacted`-Guard), sonst stünde die Größenfrage zweimal; für undeklarierte und frisch
importierte Spezies bleibt er der Weg. Ebenso die Namensregel für `speed`. `sheetValue` ist
davon unberührt und weiterhin nötig: `grants` allein nimmt ein Merkmal NICHT aus dem KI-Eingang.

**Verdrahtet in allen drei Flows** (Wizard, Aufstieg, Charakter-Editor). Der Aufstieg hat heute
keinen Vault-Fall — die Symmetrie kostet dort einen Aufrufparameter (`choiceSources` an
`buildDoc`), ihr Fehlen hätte später eine stille Lücke gekostet.

**Verifikation:** `tests/integration/characterProperties.test.ts` (neu, ohne LLM: Bestandsabdeckung,
Optionen aus dem Vokabular, Antwort → `Change` → Bogenwert, Wizard-Eingang genau einmal);
`tests/integration/speciesSize.test.ts` ist auf die Fallback-Rolle umgeschrieben.

**Nicht dabei:** Kreaturentyp und Dunkelsicht. Beide haben am Charakter kein Feld, im Bestand
keinen Wahl-Fall, und die App wertet sie nirgends aus — sie sind Bogen-Notiz (Stufe 5), keine
Eigenschaft.

## Stufe 3 — Batch-Redaktion der restlichen ~300 Einträge

**Arbeit:** das Skript aus „Anlage und Pflege"; Lauf über `classes` (249), `species` (56),
`feats` (23); Triage-Bericht als Artefakt (`docs/`), der je Bibliothek ausweist, wie viele
Einträge `grants: {}` bekamen, wie viele Mechanik tragen, und **welche das Modell nicht
zuordnen konnte** — letztere bleiben undeklariert und laufen weiter über die KI. Das ist keine
Lücke, sondern der Fallback.

Dazu ein **Bibliotheks-Linter**: welche Merkmale sind undeklariert? Als Badge in Klassen-/
Spezies-/Talent-Karte und als Zeile im Triage-Bericht. Ohne ihn ist die Abdeckung unsichtbar.

**Verifikation:** `npm run schema:examples` nach der Schema-Änderung (`:check` bricht sonst);
Stichproben-Review im Karteneditor; ein Aufstieg je Klasse in der App.

## Stufe 4 — Pass A abschalten

Wenn die Abdeckung steht, entfallen:

- `analyzeFeatureEffects` + `finalizeFeatureEffects`' Nach-Analyse → `FEATURE_EFFECTS_ANALYSIS_SYSTEM`
  (`featureEffectsAction.ts:120`, ~5 500 Zeichen) wird gelöscht
- `AnalysisChoice.determinesFurtherEffects`, `blocked`, `spellsToGround`, `<resolved_choices>`,
  `<past_choices>`, `fillDecisions` (`:601`) — und damit **Empfehlung 1 des Berichts erledigt
  sich von selbst**: ohne Modell kann keine unbeantwortete Wahl protokolliert werden
- T1 (`CHOICE_TRANSLATION_SYSTEM`, `featureTranslationAction.ts:65`) — Labels sind ab hier
  `labelDe`-Zitate aus dem Vault. Damit wandert die CLAUDE.md-Regel „ein deutsches Label ist
  ein **Zitat** aus `descDe`, keine Übersetzung" vom Prompt in die Daten
- `evals/featureAnalysis.eval.test.ts`, `wizardFeatures.eval.test.ts`, `spellPickRule.eval.test.ts`
  (bezahlte Läufe) → Vitest ohne LLM

Übrig bleibt **ein** Call: Pass C, nur noch für `sheetNote`. Gemessen 15–22 s statt 132 s
Median für die ganze Kette, und die drei Wiederholungen des `<gained_features>`-Blocks
(~15 000 gesendete Tokens je Lauf) fallen auf eine.

**Verifikation:** die Rider-Gleichheit ist die Abnahme — derselbe Charakter, derselbe Aufstieg,
Rider aus Builder gegen Rider aus der Kette (Fixtures aus `tests/fixtures`).

## Stufe 5 — offen: `sheetNoteDe` deklarieren?

Konsequent weitergedacht ist die Bogen-Notiz **für jeden Charakter dieselbe** — dann gehört
sie als `sheetNoteDe` an das Merkmal bzw. an die Option, und Pass C *und* T2 entfallen. Übrig
wäre nur noch `fieldSummaryAction` (Verschmelzen mit dem Spielertext) und das Aufstiegs-Narrativ.

**Der Vorbehalt, weshalb das eine eigene Entscheidung ist:** Pass C Regel 10 verlangt „write
only what is true AT THIS LEVEL". Ein Merkmal mit mehreren `gainedAt` (Heimlicher Angriff,
dessen Würfel eine Stufentabellen-Spalte ist) hat keine stufenfeste Notiz. Vor der Umsetzung
zählen: **wie viele Merkmale tragen eine stufenabhängige Notiz?** Sind es wenige, bleiben genau
die im generierten Pfad — dieselbe Fallback-Regel wie überall in diesem Plan. K5 und K7 (hartes
Zeichenbudget, keine Zauber-Aufzählung) wären dann Redaktionsregeln statt Prompt-Regeln.

## Was danach KI bleibt

| Aufgabe | Aktion |
|---|---|
| Verdichten | `fieldSummaryAction`, `NARRATIVE_SYSTEM`, (`sheetNote` bis Stufe 5) |
| Übersetzen | `translateAction` (Bibliothekskarten), T2 (bis Stufe 5) |
| Zuordnen | `equipmentMatchAction` — Prosa → Bibliotheks-Items; bleibt, solange `startingEquipment` Prosa ist |
| Erzeugen | Monster/Zauber/Item/Encounter/Talent create+edit, `designEncounter` (Agent-Loop) |
| Offener Chat | `LlmPanel.svelte` |

Nicht „nur Zusammenfassung", aber: **kein Pfad mehr, auf dem ein Modell eine Regelmechanik
erfindet, die still am Charakter landet.** Das ist der Gewinn, nicht die Token.

## Risiken und offene Entscheidungen

1. **Stille Deckungslücken** — entschärft durch die `grants`-Optionalität (Abschnitt 3) plus
   Linter (Stufe 3). Ohne beides ist der Plan nicht sicherer als der Status quo, nur billiger.
2. **Grants je Option ist ein rekursives Schema** (`grantsChoice` in der Option). Tiefe auf
   **eins** begrenzen: eine Option darf eine Folgewahl deklarieren, diese keine weitere. Sonst
   ist der Builder ein Interpreter.
3. **`expertise` braucht Charakterzustand** — der Builder ist damit nicht rein
   deklarations-getrieben. Bewusst so: die Alternative wäre eine Optionsliste im Vault, die vom
   Charakter abhängt.
4. **Keine Charakter-Migration.** Alles hier sind Bibliotheksdaten; `features[].choice` /
   `choiceDe` am Charakter bleiben unverändert, `CHARACTER_VERSION` wird nicht angefasst.
5. **Der Eval-Bericht wird zur Hälfte historisch.** K1–K7 beschreiben Prompt-Änderungen an
   Prompts, die dieser Plan löscht. `docs/analysis/analyse-system-prompts.md` bekommt am Kopf einen
   Satz, der auf diesen Plan zeigt — die Messungen bleiben die Begründung, nicht der Zustand.
6. **Reihenfolge ist verhandelbar, Stufe 0 nicht.** Sie ist der Beweis am kleinsten Fall: ein
   ganzer Call gegen zwei Vault-Zeilen, ohne jede Berührung der Rider-Kette.

## Nicht Teil dieses Plans

- KI-gestütztes **Erzeugen** von Homebrew-Talenten/-Klassen (der eigentliche Zielzustand der
  Umkehrung — eigener Plan, baut auf `spec.ts`/`factory.ts`)
- `startingEquipment` strukturieren (macht `equipmentMatchAction` überflüssig)
- Die Architektur-Frage aus `docs/analysis/analyse-system-prompts.md` §7 (drei Reasoning-Durchläufe über
  denselben Block) — sie **erledigt** sich hier, war aber nicht ihr Anlass
- `class_context.spellcastingAbility` vereinheitlichen (B12) — kleiner, unabhängiger Fix
