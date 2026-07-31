# LevelUp-KI-Aktionen: brauchen sie Thinking, brauchen sie Structured Output?

> Analyse, erstellt am 2026-07-29 auf Stand Commit `75adcd9`
> („fix: Offizielle Übungs-Terminologie im Charakterbogen"). Reine Bestandsaufnahme,
> nichts umgesetzt. Alle Zeilennummern beziehen sich auf diesen Stand.

## Auftrag

Für jede KI-Aktion im Stufenaufstieg klären: braucht sie ein Reasoning-Budget
(Thinking), und profitiert sie von serverseitig erzwungenem Structured Output?

## Der strukturelle Befund vorweg

Auf dem QM/vllm-Pfad sind **Thinking und Structured Output invers gekoppelt** — und
keine der Aktionen wählt eines von beiden bewusst.

`llmService.ts:249-251`: sobald ein `guidedJsonSchema` mitgeht, wird zwangsweise
`enable_thinking: false` gesetzt (per Server-Probe verifiziert, sonst greift die
Grammatik nicht). Umgekehrt heißt „kein Schema" automatisch „Thinking an"
(Server-Default). Es gibt keinen dritten Zustand.

Daraus ergibt sich der Ist-Zustand — als Nebenwirkung, nicht als Entscheidung:

| Schritt | Prompt | Thinking | Structured | wodurch erzwungen |
|---|---|---|---|---|
| Pass A Analyse | `FEATURE_EFFECTS_ANALYSIS_SYSTEM` | **an** | nein (Prosa + Fenced-JSON, tolerant geparst) | `qualitymindsChat` ohne Schema |
| Nach-Analyse | derselbe | **an** | nein | dito |
| Pass C Rider | `FEATURE_EFFECTS_SYSTEM` | aus | **ja** (guided) | `…GenerateStructuredFromMessages` |
| `levelup-ongoing-effects` | TP/Stufe | aus | **ja** | `runAiAction` → `generateStructured` |
| `levelup-narrative` | Zusammenfassung | aus | **ja** | dito |
| `sheet-field-summary` | Feld-Merge | aus | **ja** | dito |

Die einzige Stelle, die die Kopplung wirklich auflöst, ist der Zweipass der
Merkmals-Effekte: denken ohne Schema → im selben Verlauf ins Schema gießen. Genau
dieses Muster fehlt an einer Stelle und ist an zwei anderen überflüssig.

Zwei Stellschrauben, die es dafür heute nicht gibt:

* **Thinking ist kein Feld von `AiAction`** (`aiActions/types.ts:10-20`) — es ist
  Nebenwirkung davon, ob ein Schema mitgeht.
* **`AiAction` kennt keinen Plain-Text-Output** — `jsonSchema` ist Pflichtfeld
  (`types.ts:18`), `runAiAction` validiert immer gegen ein Schema
  (`runner.ts:106-109`).

---

## Pro Aktion

### 1. Pass A — `analyzeFeatureEffects` · Thinking ✅ · Structured ⚠️ teilweise

`featureEffectsAction.ts:103-138`, ausgeführt in `analyzeFeatureEffects` (Z. 317-326)
über `reason` (Z. 301-314).

Thinking ist hier korrekt und tragend. „Welche Wahl ist erzwungen", „welcher Grant
hängt an welcher Wahl", „blockiert das die Zauberliste" ist echte mehrstufige
Regelinferenz aus englischer Prosa. Seit dem letzten Stand ist die Last sogar
gewachsen — drei zusätzliche Urteile stecken jetzt im selben Call:

* `featureKey` verbatim aus `<gained_features>` kopieren (Z. 109),
* Options-Wortlaut **exakt** wie in `descDe` (Z. 110) — die Antwort wird später
  gegen genau diesen Text zurückgematcht,
* `isBuildDecision` (Z. 111): permanente Aufbau-Entscheidung vs. Option, die pro
  Einsatz neu gewählt wird (Kanalisierte Göttlichkeit, Cunning Strike). Das ist die
  subtilste Unterscheidung im ganzen Prompt.

Der Haken liegt nicht beim Denken, sondern beim **Manifest**. `parseManifest`
(Z. 232-253) fällt bei kaputtem JSON auf `{choices: [], spellsToGround: [],
blocked: false}` zurück — **stillschweigend**. Das ist kein sichtbarer Fehlerfall:
der Entscheidungs-Checkpoint entfällt einfach, der Flow läuft durch, der Spieler
wird nie gefragt.

Genauso `normalizeChoice` (Z. 206-226): `featureKey` defaultet auf `''`,
`isBuildDecision` auf `false`. Der Default ist bewusst vorsichtig gewählt — aber er
bedeutet auch, dass eine vom Modell vergessene oder verunglückte Angabe geräuschlos
dazu führt, dass die Wahl nicht im Ledger landet bzw. keinen Anker am Charakter
bekommt.

Fünf Felder werden deterministisch weiterverarbeitet und hängen alle an einem
tolerant geparsten JSON-Block ohne Schema-Garantie.

**→ Kandidat für den Split, den Pass C schon vormacht:** Thinking-Call liefert
Prosa, ein winziger guided Call extrahiert `{choices, spellsToGround, blocked}` aus
demselben Verlauf. Kostet einen Call, ersetzt aber einen stillen Ausfall durch eine
Schema-Garantie. Minimalvariante ohne Extra-Call: Parse-Fehlschlag sichtbar machen
statt den harmlosen Default zurückzugeben.

### 2. Nach-Analyse (zweiter `reason`-Call) · Thinking 🟡 fraglich

`featureEffectsAction.ts:359-364`.

Die schwere Arbeit — die Wahl überhaupt erkennen — ist gelaufen. Was bleibt:
Tabellen-Lookup („gemäßigt" → Misty Step / Shocking Grasp / Sleep) und
`determinesFurtherEffects` auf `false` ziehen.

Das ist der **billigste Kandidat für einen Thinking-aus-Test**, und er ist bereits
isoliert gemessen: `featureAnalysis.eval.test.ts:157` misst genau diesen Turn auf
fester Fixture. Ein Gegenlauf mit `body: {chat_template_kwargs: {enable_thinking:
false}}` über `promptCase` beantwortet die Frage **ohne jede Code-Änderung**.

### 3. Pass C — Rider · Thinking ❌ · Structured ✅

`featureEffectsAction.ts:73-96`, ausgeführt in `runPassC` (Z. 377-387).

Passt so, und die Begründung im Kommentar (Z. 68-72) trägt: reine Transkription
bereits erschlossener Prosa in ein tief geschachteltes Schema — ein Rider je
Merkmal, Reihenfolge erhalten, sechs Grant-Felder plus `decisions`. Ohne guided
decoding wäre das der fragilste Output im ganzen Flow.

Regel 5 (Z. 82-87) verlangt zusätzlich geschlossene Vokabulare
(`SKILL_NAMES`, `WEAPON_CATEGORIES`, `ARMOR_TRAININGS`) — auch das spricht für
guided decoding, nicht dagegen.

Einzige echte Urteilsleistung bleibt Regel 10 (`sheetNote` schreiben oder bewusst
leer lassen). Lokal pro Merkmal, kein Thinking nötig.

### 4. `levelup-ongoing-effects` — TP/Stufe · **Thinking fehlt** ⛔ · Structured überflüssig

`levelUpEffectsAction.ts:29-52`, aufgerufen aus `detectHpPerLevel`
(`LevelUpAssistant.svelte:710-753`).

**Das ist die klarste Fehlallokation im Flow.** Thinking ist abgeschaltet, obwohl
der Schritt die anspruchsvollste Unterscheidung des Aufstiegs trifft — und
Structured Output ist an, obwohl das Schema trivial ist.

Der Prompt verlangt:

* Regel 1: **fortlaufend pro Stufe** vs. **einmalig** aus Prosa unterscheiden;
* Regel 4: den Erwerbs-Bump ausschließen — Zwergische Zähigkeit: das erste +1 nicht
  mitzählen; Zäh: den „twice your level"-Sprung nicht mitzählen — dazu temporäre TP
  und KON-basierte TP abgrenzen.

Das ist eine Negativ-Abgrenzung über potenziell dutzende Merkmale (Spezies + alle
Klassen + Subklassen + alle Talente, gesammelt und dedupliziert in
`LevelUpAssistant.svelte:713-735`) — genau die Form, bei der ein Modell ohne
Reasoning-Budget entweder überfeuert oder das eine relevante Merkmal übersieht.

Der Output dagegen ist `{level, changes: [{target, valueChange, source}]}`
(`schemas/levelUp.ts:136-140`): drei flache Strings. Prompt-instruiertes JSON trägt
das mühelos.

Verschärfend:

* **Die Konsequenz ist unsichtbar.** Ein Fehltreffer verändert still `hpMax`
  (`LevelUpAssistant.svelte:742-748`), der umgebende `catch` (Z. 751-752) schluckt
  jeden Fehler.
* **Nicht gemessen.** In `evals/` liegen `featureAnalysis`, `featureEffects`,
  `promptLab` und `spell` — für diesen Schritt existiert kein Case.

**→ Empfehlung:** Thinking an, Schema per Prompt statt guided. Wenn die
Schema-Garantie bleiben soll, derselbe Zweipass wie Pass A/C. Vorher einen
Eval-Case anlegen, sonst ist die Änderung nicht bewertbar.

### 5. `levelup-narrative` · Thinking ❌ · **Structured sinnlos**

`levelUpAction.ts:43-63`, aufgerufen in `runNarrative`
(`LevelUpAssistant.svelte:562-576`).

Das Schema ist `{summary: string}` (`schemas/levelUp.ts:145-147`) — ein einziges
Freitext-Feld. Guided decoding kauft hier nichts, weil es nichts zu strukturieren
gibt. Es kostet Schema-Tokens plus JSON-Wrapper und schränkt den Sampler während
reiner Prosa-Generierung ein.

Thinking ebenso nicht: der Prompt sagt ausdrücklich, nichts nachzurechnen, und die
Aktion ist ohnehin optional (`catch` → `fallbackSummary()`, Z. 574-575).

**→ Weder Thinking noch Schema.** Sauber wäre ein normaler Text-Call, dessen Antwort
*ist* die Summary. Blockiert an `AiAction`: es gibt keinen Plain-Text-Pfad
(siehe oben).

### 6. `sheet-field-summary` · Thinking 🟡 · **Structured aktiv schädlich**

`fieldSummaryAction.ts:54-73` (+ `SHEET_NOTE_DOCTRINE`, Z. 33-52). Fünf Aufrufer:
der Level-Up-Merge (`LevelUpAssistant.svelte:601-611`), zwei Zusammenfassen-Knöpfe
im Charakter-Editor (`CharacterEditForm.svelte:1120`) und zweimal der Charakter-
Wizard (`characterWizard.svelte.ts:291, 307`).

Der Doc-Kommentar dieser Datei benennt die Kopplung schon selbst (Z. 14-15):
„auf QM/vllm heißt guided decoding zugleich `enable_thinking:false` (llmService),
also kein Reasoning-Vorlauf." Der Befund ist also bekannt, nur nicht aufgelöst.

Auch hier ein einziges Feld (`fieldSummarySchema`, `schemas/levelUp.ts:152-154`) —
diesmal aber mit echtem Risiko:

* Der Output ist **langer deutscher Freitext mit Zeilenumbrüchen**, der laut
  Doktrin-Beispiel (Z. 38-52) mehrzeilige Einträge mit Leerzeilen dazwischen führt
  und laut `SHEET_NOTE_MAX_CHARS`-Kontext auf ~1400 Zeichen zuwächst.
* Er muss **als JSON-String escaped** erzeugt werden — jeder Umbruch als `\n`.
* Lange, grammatik-eingeschränkte String-Generierung ist genau der Fall, vor dem
  `llmService.ts:240-243` warnt („davonlaufende Generierung … unter guided
  decoding"). Läuft `max_tokens` rein, ist das JSON unvollständig → ein
  Runner-Retry (`runner.ts:83-104`) → im Fehlerfall bleibt die Rohfassung stehen
  (`LevelUpAssistant.svelte:613-615`).

Zum Thinking: die Aufgabe ist inzwischen anspruchsvoll geworden. Sechs Regeln plus
Doktrin, disjunkte Feld-Zuständigkeit (`SHEET_FIELDS`, Z. 93-116), die `omit`-Liste
gegen deutschen Wortlaut matchen, und Regel 2 verlangt, jede neue Notiz gegen einen
**vom Spieler in eigenen Worten** geschriebenen Text zu verschmelzen. Argument dafür.
Gegenargument: Thinking-Budget direkt vor einem langen Output ist teuer, und der
Schritt ist fehlertolerant.

**→ Priorität hier ist nicht Thinking, sondern das Schema loswerden:** Antwort =
Feldtext, roh. Das eliminiert die Escaping- und Abschneide-Fehlerklasse komplett.
Braucht denselben Plain-Text-Pfad wie 5.

Auch dieser Prompt hat keinen Eval-Case — bei fünf Aufrufern die größte
Abdeckungslücke.

---

## Zusammenfassung

**Falsch herum verdrahtet**

* `levelup-ongoing-effects` — braucht Thinking, braucht kein Schema, bekommt exakt
  das Gegenteil. Höchste Priorität: schwere Regel-Diskriminierung, stille Wirkung
  auf `hpMax`, null Abdeckung.
* `levelup-narrative` und `sheet-field-summary` — Ein-Feld-Schemas, bei denen guided
  decoding nichts kauft und bei `sheet-field-summary` eine eigene Fehlerklasse
  einführt (JSON-Escaping eines langen, mehrzeiligen Feldtexts).

**Richtig verdrahtet**

* Pass A (Thinking) und Pass C (Structured), inklusive der Aufteilung dazwischen.

**Offene Lücke**

* Pass A hat Thinking, aber sein deterministisch weiterverarbeitetes Manifest hat
  keine Schema-Garantie und scheitert lautlos — bei jetzt fünf Feldern
  (`choices`, `featureKey`, `isBuildDecision`, `spellsToGround`, `blocked`).

**Fehlende Stellschrauben**

* Thinking ist kein Feld von `AiAction`, sondern Nebenwirkung des Schemas.
* `AiAction` hat keinen Plain-Text-Output (`jsonSchema` ist Pflicht).

Beides müsste angefasst werden, um 4-6 überhaupt umsetzen zu können.

**Abdeckungslücken in `evals/`**

* kein Case für `levelup-ongoing-effects`,
* kein Case für `sheet-field-summary` (fünf Aufrufer),
* kein Case für `levelup-narrative` (unkritisch, weil optional).

## Nächster Schritt (billigstes Experiment)

Den Nach-Analyse-Turn in `featureAnalysis.eval.test.ts:157` einmal mit
`body: {chat_template_kwargs: {enable_thinking: false}}` gegenlaufen lassen. Misst
ohne Code-Änderung, ob Thinking in Phase 2 überhaupt etwas trägt — und kalibriert
damit die Erwartung für die übrigen Flips.
