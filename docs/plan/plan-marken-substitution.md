# Marken: Wahlen, die den Text benachbarter Merkmale parametrisieren

> Umsetzungsplan, erstellt am 2026-07-30 auf Stand Commit `ad91b32`
> („refactor: eine Senke für beide Charakter-Flows"), noch nicht begonnen.
> Alle Zeilennummern beziehen sich auf diesen Stand.
> Hebt Korrektur 5 aus `docs/plan/plan-wahlen-deklarieren.md` auf: der dort fehlende
> Verbraucher für den interlockten Fall entsteht hier.
> Umfang entschieden: **nur der Drachenblütige**. Tiefling, Elf und die beiden
> „Improved"-Merkmale folgen, wenn der Mechanismus steht.

## Context

Die Deklarations-Strecke deckt heute Merkmale ab, deren Wirkung **lokal** ist: `optionList` trägt
die Konsequenz neben der Option (`options[].grants`), und genau das macht
`determinesFurtherEffects` strukturell falsch.

Der Drachenblütige passt nicht. Seine Wahl steht in `srd-2024_dragonborn_draconic-ancestry`, die
Wirkung im Text **zweier anderer** Merkmale:

- `…_breath-weapon`: „takes 1d10 damage of the type determined by your Draconic Ancestry trait"
- `…_damage-resistance`: „You have Resistance to the damage type determined by your Draconic Ancestry trait."

`docs/plan/plan-wahlen-deklarieren.md`, Korrektur 5, hat ihn deshalb ausdrücklich aus Stufe 1
herausgenommen: *„ihre Antwort ist Eingang für den TEXT ANDERER Merkmale — der interlockte Fall,
der das Modell wirklich braucht."* Heute laufen alle drei Merkmale durch die KI-Deutung
(`services/wizard/featurePrep.ts:49-51` nennt „Drakonische Urahnen" ausdrücklich). Das Modell sieht
einen Verweis auf ein Merkmal, dessen Antwort es nicht kennt; im Charakter liest der Spieler nie
„Feuerschaden".

**Die Reihenfolge ist zwingend** (`docs/plan/plan-zauberwirker-vereinfachung.md`): *„Eine Deklaration
ohne Verbraucher würde die Wahl nicht deterministisch machen, sondern löschen. Erst der
Verbraucher, dann die Deklaration."* `withoutDeclaredChoiceFeatures`
(`services/featureDeclaration.ts:108`) wirft jedes Merkmal mit `grantsChoice` aus dem KI-Eingang —
Substitution und Vault-Deklaration müssen im **selben** Schritt landen.

## Analyse: wohin gehören „komplexe Grants"?

Der ursprüngliche Vorschlag war ein `mechanic`-Key (`replace_on_choice`) am konsumierenden
Merkmal. Geprüft an den real vorhandenen Fällen zerfällt jeder davon in **zwei bereits
existierende Achsen**:

| Achse | Frage | Erweiterungsstelle heute |
|---|---|---|
| **1 — Herkunft** | Woher kommt die Antwort? | `FEATURE_CHOICE_KINDS` (6 kinds), `schemas/shared.ts:366` |
| **2 — Wirkung** | Was tut die Antwort? | Felder von `featureGrantSchema`, `schemas/shared.ts:300` |

Beide sind an `choiceOptionSchema` (`schemas/shared.ts:384`) verheiratet: `value` ist Achse 1,
`grants` ist Achse 2. Das ist der dokumentierte Kern („die Konsequenz steht neben der Option").

Der Test — alle interlockten und absehbaren Fälle aus dem Vault:

| Fall | Achse 1 | Achse 2 | braucht `mechanic`? |
|---|---|---|---|
| Drachen-Schadensart in Odemwaffe/Resistenz | `optionList` ✅ vorhanden | **neu:** ein Wert, den ein Nachbar-Text liest | nein |
| Drow Dunkelsicht 60→120 ft | `optionList` ✅ | derselbe neue Wert (der Trait-Text **ist** die Senke) | nein |
| Waldelf Bewegung 30→35 ft | `optionList` ✅ | **neu:** echte Bogenwert-Senke — `sheetValue` *filtert* heute nur (`services/sheetValueTraits.ts`), es schreibt nichts | nein — ein Feld + `Change`-Variante |
| Resistenz als Charakter-Feld | `optionList` ✅ | **neu:** `grants.resistances` + `Change` (heute kennt `services/applyChanges.ts` keine solche Variante) | nein |
| Anwendungen je Rast, Würfel-Skalierung | — | **neu:** Feld + Senke | nein |
| Kleriker/Druide „die gewählte Option wird mächtiger" (`…_improved-blessed-strikes`, `…_improved-elemental-fury`) | `optionList` ✅ | Wert mit Satzlänge — oder bewusst weiter bei der KI | nein |

**Kein Residuum.** Ein `mechanic`-Key wäre eine **dritte** Dispatch-Achse neben zwei bestehenden,
und ein offener String-Key zusätzlich ein Regelbruch: „A grant field without a sink is a compile
error, not a silent gap" — eine unbekannte Mechanik würde still ignoriert, genau die Lücke, die
`weaponProficiency`/`armorTraining` und `savingThrows`/`tools` schon zweimal gerissen haben.

Daraus folgen die zwei Entscheidungen dieses Plans:

1. **Der neue Wert wird ein Feld von `featureGrantSchema` (`binds`), kein neues Konzept.** Damit
   erbt er die vorhandene Verheiratung: `options[].grants.binds` ist die Drachen-Wahl,
   `feature.grants.binds` wäre eine unbedingte Bindung — beides ohne Zusatzcode. Kein viertes Feld
   in `featureDeclarationFields`, kein neuer `kind`, kein Feld am konsumierenden Merkmal.
   **Die Marke im Text ist die Deklaration.**
2. **Modular wird das System nicht durch eine neue Achse, sondern durch einen Totalitäts-Guard auf
   Achse 2.** Der fehlt heute — siehe „Härtung".

## Design

### Marken-Syntax

```
[[<mark>|<Fallback im Text derselben Sprache>]]
```

Der Fallback ist der **unveränderte SRD-Wortlaut**. Zwei Folgen, die beide zählen:

- Ohne getroffene Wahl (Bibliotheksansicht, Wizard vor dem Checkpoint) liest der Text sich exakt
  wie heute — kein sichtbarer Platzhalter, kein Regressionsrisiko.
- Der deutsche Fallback steht im deutschen Text, der englische im englischen. Deutsch bleibt ein
  **Zitat**, keine Laufzeit-Übersetzung; es entsteht keine dritte Übersetzungstabelle.

Die Marke umspannt die **ganze Nominalphrase**, damit *eine* Bindung in beiden Merkmalen
grammatisch trägt:

```jsonc
// …_damage-resistance
"desc":   "You have Resistance to [[damage-type|the damage type determined by your Draconic Ancestry trait]].",
"descDe": "Du hast Resistenz gegen [[damage-type|die Schadensart, die durch dein Merkmal Drakonische Abstammung bestimmt wird]]."
// …_breath-weapon
"desc":   "… a creature takes 1d10 [[damage-type|damage of the type determined by your Draconic Ancestry trait]]. …",
"descDe": "… erleidet eine Kreatur 1W10 [[damage-type|Schaden der Art, die durch dein Merkmal Drakonische Abstammung bestimmt wird]]. …"
```

Aufgelöst: „Resistance to Acid damage" / „1d10 Acid damage" / „Resistenz gegen Säureschaden" /
„1W10 Säureschaden".

### Schema — ein Feld (`src/lib/schemas/shared.ts`)

Neu über `featureGrantSchema`:

```ts
export const markBindingSchema = z.object({
  mark:    z.string().describe('Markenname, wie er in [[…]] steht (klein, Bindestriche).'),
  value:   z.string().describe('Englische Nominalphrase, die die Marke ersetzt ("Acid damage").'),
  valueDe: z.string().default('').describe('Deutsche Nominalphrase ("Säureschaden"). Leer = englischer Wert.'),
});
```

und als Feld **in `featureGrantSchema`**:

```ts
binds: z.array(markBindingSchema).default([])
  .describe('Werte, die dieser Grant an Marken im Text derselben Entität bindet.'),
```

Array, nicht `z.record`: `toLlmJsonSchema` erzwingt `additionalProperties:false`, ein Record mit
freien Keys ist dort nicht ausdrückbar. Keine Rekursion — die Tiefenschranke „eins" aus
`docs/plan/plan-wahlen-deklarieren.md` (Risiko 2) bleibt unberührt.

### Auflösung — neu: `src/lib/services/featureMarks.ts`

```ts
export type MarkScope = ReadonlyMap<string, MarkBinding>;

/** Bindungen der GETROFFENEN Optionen einer Merkmalsliste (plus unbedingter grants.binds). */
export function collectMarkBindings(
  features: readonly DeclaredChoiceSource[],
  answerOf: (choiceId: string) => string,
): MarkScope;

/** Ersetzt Marken; unbekannte Marke → Fallback (bzw. Markenname, wenn keiner steht). */
export function resolveMarks(text: string, scope: MarkScope, lang: 'en' | 'de'): string;
```

Benutzt die vorhandenen `isOptionListFeature` / `optionChoiceId` / `chosenOption` aus
`services/featureDeclaration.ts` — **kein zweiter Matcher**.

**Scope = Trägerentität** (entschieden): Spezies-Traits sehen nur Bindungen von Spezies-Wahlen,
Klassenmerkmale nur die ihrer Klasse. Die Gruppierung liegt schon vor — `resolveSpeciesTraits` /
`resolveClassFeatures` (`services/characterFeatures.ts:106` / `:57`) liefern Gruppen mit
`features`. Eine Klassen-Marke `[[damage-type]]` kann so nie von der Drachen-Wahl gefüllt werden.

### Senken — wo `resolveMarks` läuft

| Verbraucher | Datei | Antwort da? |
|---|---|---|
| Anzeige im Charakter (`ResolvedFeature.desc`) | `services/characterFeatures.ts` — `resolveSpeciesTraits`, `resolveClassFeatures` | ja, aus `c.features[].choice` |
| KI-Eingang Aufstieg | `services/levelUpMachine.ts` — `gainedFeaturesFor` (:206) | ja, als `PastChoice` |
| KI-Eingang Wizard Stufe 1 | `services/wizard/featurePrep.ts` | **nein** → Fallback = heutiger Text |
| Deutscher Volksmerkmale-Text (PDF) | `summarySpecies` → `aiActions/fieldSummaryAction.ts`, angestoßen in `wizard/characterWizard.svelte.ts:389` (läuft bewusst NACH dem Checkpoint) | ja |
| Bibliotheks-/Kartenansicht | Species-Card | nein → Fallback |

`resolveSpeciesTraits(c.species)` bekommt dafür die Ledger-Einträge als zweiten Parameter (heute
kennt es sie nicht).

Nichts wird zurückgeschrieben — Auflösung geschieht beim Rendern, wie bei `item.mastery` und
`resolveSpellAccess`. Ein Wechsel der Urahnen-Wahl braucht darum kein Write-back und **keinen
`CHARACTER_VERSION`-Bump**.

### Härtung: Totalität auf Achse 2

Das eigentliche Modularitäts-Loch. `FeatureGrant` wird heute an **vier** Stellen von Hand
aufgezählt — ein neues Feld (`binds` jetzt, `resistances` später) fällt in allen vier still durch:

| Stelle | Datei |
|---|---|
| `isEmptyProficiencyGrant` | `schemas/shared.ts:317` |
| `isEmptyFeatureGrant` | `services/featureDeclaration.ts:284` |
| `grantIsEmpty` + `hasProficiency` | `services/declarationCoverage.ts:38,44` |
| `withGrant` (Projektion → `FeatureRider`) | `services/featureDeclaration.ts:324` |

Vorbild ist da: `proficiencyGrantChanges` (`services/proficiencyGrants.ts:193`) benutzt eine Mapped
Type über `keyof ProficiencyGrant` mit **Ausschluss**liste, damit ein neues Feld standardmäßig
behandelt wird und sonst den Build bricht. Dieselbe Form hier:

- Die drei Leer-Prüfungen auf **eine** Funktion zusammenziehen, total über `keyof FeatureGrant`.
  `binds` zählt als Inhalt: ein Merkmal, das nur eine Marke bindet, trägt Mechanik.
- `withGrant` total über `keyof FeatureGrant` mit expliziter Ausschlussliste — `perLevel` (läuft
  über `hpPerLevelSources`) und `binds` (hat kein Rider-Feld, wirkt beim Rendern) gehören dort
  hinein, sichtbar statt stillschweigend.

Ohne diesen Schritt ist der Plan lauffähig, aber die nächste Achse-2-Erweiterung wiederholt die
Lücke.

### Vault-Inhalt (`vault/species/dragonborn.json`)

- `…_draconic-ancestry` bekommt `grantsChoice: { kind: 'optionList', options: [10 Urahnen] }`.
  Je Option: `value` („Black"), `labelDe` (Zitat aus `descDe`: „Schwarz"), `helpDe`
  („Säureschaden"), `grants.binds: [{ mark: 'damage-type', value: 'Acid damage', valueDe: 'Säureschaden' }]`.
  Vorbild für die Form: `srd-2024_cleric_divine-order` / `srd-2024_druid_primal-order`.
- `…_breath-weapon` und `…_damage-resistance`: Marken in `desc`/`descDe`, **kein** neues Feld.
  `grants` bleibt **abwesend** (nicht `{}`): die Odemwaffe ist mechanisch nicht redigiert und soll
  weiter durch die KI-Kette laufen — sie hat auf diesem Bogen keine Senke.
- Danach `min_app_version` in `vault/libraries.yaml` hochziehen (CLAUDE.md: Inhalte mit neuem Feld
  sperren ältere Clients aus, statt die Mechanik still zu verlieren).

### Editoren & Abdeckung

- `components/ChoiceOptionEditForm.svelte`: `binds` je Option editierbar (Marke / Wert / Wert DE).
- `services/declarationCoverage.ts`: **ungebundene Marke** melden — jede Marke in einem Text der
  Entität, für die keine Option derselben Entität eine Bindung liefert. Das ersetzt die
  Validierung, die ein `mechanic.fromFeature`-Feld geboten hätte, ohne das Feld.
- `npm run schema:examples` nach der Schema-Änderung (`:check` bricht sonst).
- `docs/plan/plan-wahlen-deklarieren.md`: Korrektur 5 fortschreiben — der Verbraucher existiert jetzt.

## Verifikation

1. `npm run check` — der Gate. Erwartung: die Totalitäts-Umstellung bricht den Build an jeder
   Stelle, die `binds` noch nicht behandelt — das ist der Beweis, dass der Guard greift.
2. `npm run schema:examples:check`.
3. App auf Windows starten (`.\dev-windows.ps1`), Log via
   `tail -f /mnt/c/dev/privat/dnd-planner/tauri-dev.log`.
4. **Wizard:** Drachenblütigen erstellen. „Drakonische Abstammung" erscheint als *deterministische*
   Wahl im Checkpoint (10 deutsche Optionen, kein KI-Call), nicht mehr als KI-Frage. Nach „Rot":
   Volksmerkmale-Text enthält „Feuerschaden", nicht „die Schadensart, die durch dein Merkmal …
   bestimmt wird".
5. **Anzeige:** Charakter öffnen → Odemwaffe und Schadensresistenz zeigen „Feuerschaden".
   Urahnen-Wahl im Editor auf „Weiß" ändern → beide Texte zeigen „Kälteschaden" **ohne** Speichern
   (Render-Zeit-Auflösung).
6. **Fallback:** Spezies-Karte in der Bibliothek öffnen (kein Charakter-Kontext) → beide Texte
   lesen sich wie der SRD-Originalsatz.
7. **Regression:** einen Elfen (Marken-frei, aber mit Zweigwahl) durch Wizard und einen Aufstieg
   schicken — Texte, Grants und Bogen-Zeilen unverändert.
8. Evals (`npm run eval`) laufen **nur auf Wunsch des Users**.

## Nebenbefund (nicht in diesem Umfang)

`vault/classes/circle-of-the-land.json`: `…_natural-recovery` und `…_natures-sanctuary` tragen
**identischen** `desc`/`descDe`. Sieht nach Copy-Paste-Fehler in den Vault-Daten aus.
