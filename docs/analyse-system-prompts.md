# Analyse der System-Prompts der Merkmals-Deutung

Gegenstand: die fünf Prompts der Kette (Pass A, Pass C, Transkriptions-Turn, T1, T2) und die
geteilte Bogen-Doktrin in `fieldSummaryAction.ts`. Modell aller Messungen:
`cyankiwi/Qwen3.6-35B-A3B-AWQ-4bit` über QualityMinds, `EVAL_MAX_TOKENS=16384`,
`concurrency=4`, `--runs 5`, `noRetry`.

Aufbau: erst die statische Befundliste (Regel für Regel, jeder Befund mit Beleg und der
Angabe, ob er gemessen wurde), dann Baseline/Endstand je Assertion, dann die übernommenen
und die verworfenen Kandidaten.

---

## 1. Statische Befundliste

Legende der Spalte *Status*: **gemessen** = eine Assertion zeigt den Befund und er wurde in
einem Lauf beobachtet · **messbar, ungemessen** = eine Assertion existiert, der Befund wurde
aber nicht separat provoziert · **unbelegt** = es gibt keine Assertion, die den Verstoß fangen
würde (der interessanteste Fall).

### B1 — Pass A erdet keinen Zaubertrick, den man „kennt"; Pass C darf es dann nicht mehr

`featureEffectsAction.ts:133` (Pass A, Regel 3) definiert `spellsToGround` ausschließlich über
*„Spells granted as ALWAYS PREPARED for free"*. Pass C, Regel 2 (`:94`) kennt dagegen
ausdrücklich den zweiten Fall: *„A cantrip the feature makes you KNOW BY NAME ('You know the
Minor Illusion cantrip') is such a grant and belongs here too"*. Zwischen beiden sitzt
`buildTranscriptionInstruction` (`:444`) mit *„For grantedSpells use only the canonical English
names from `<spell_resolution>`"* — und `<spell_resolution>` entsteht allein aus
`manifest.spellsToGround` (`:546`).

Damit ist die Kette geschlossen gegen einen Fall, den Pass C ausdrücklich will: was Pass A
nicht erdet, darf Pass C nicht eintragen. Genau das ist der Waldgnom-Zaubertrick *Minor
Illusion* („You know the *Minor Illusion* cantrip", `descDe`: „Du beherrschst den Zaubertrick
*Einfache Illusion*").

*Assertion:* `Einfache Illusion kommt als benannter Grant an`
(weich, `wizardFeatures-gnome-sorcerer.ts:299`, für diesen Auftrag verschärft — siehe T-3).
**Status: gemessen und behoben** (K3).

### B2 — Waffenmeisterschaft/Kampfstil: eine Regel für einen Eingang, den es nie gibt

Pass A, Regel 1 (`:127`) klammert ein: *„(Weapon Mastery and Fighting Style are handled OUTSIDE
this analysis …)"*. `isFlowOwnedChoiceFeature` (`services/levelUp.ts:90`) filtert genau diese
Merkmale vor der Deutung heraus — die Regel beschreibt einen Eingang, den kein Aufrufer
erzeugt. **Status: unbelegt** (kein Fall enthält ein solches Merkmal; ein Verstoß ist deshalb
prinzipiell nicht messbar).

### B3 — Pass C Regel 8 wiederholt die Doktrin

Regel 8 (`:105`, *„Do NOT restate deterministic numbers (spell slots, proficiency bonus, hit
die)"*) steht wortnah schon zweimal im selben Prompt-Text: in `SHEET_NOTE_CONTENT`
(`fieldSummaryAction.ts:48`, *„LEAVE OUT … spell slots, proficiency bonus, hit dice"*), das
Pass C direkt einbindet. **Status: unbelegt** — keine Assertion prüft, ob Übungsbonus oder
Zauberplätze im Rider auftauchen.

### B4 — T2 bekommt eine Layout-Vorlage für ein Format, das es nicht schreiben darf

`SHEET_NOTE_TRANSLATION_SYSTEM`, Regel 4 (`featureTranslationAction.ts:84`) verlangt
*„HARD LIMIT … per note, single line, no markdown"*. Der gemeinsame Baustein
`SHEET_NOTE_GERMAN_FORM` (`fieldSummaryAction.ts:64`), den derselbe Prompt anhängt, zeigt
darunter das Gegenteil: Einträge mit Namen **auf eigener Zeile**, Leerzeile zwischen den
Einträgen und Abschnitts-Überschriften `[Klassenmerkmale]` / `[Volksmerkmale]`. Der Baustein
ist für `FIELD_SUMMARY_SYSTEM` geschrieben (das ein ganzes Feld formatiert), nicht für einen
Übersetzer einzelner Zeilen.

Der Verstoß ist im Code unsichtbar: `translateSheetNotes` glättet Zeilenumbrüche
(`featureTranslationAction.ts:208`, `.replace(/\s*[\r\n]+\s*/g, ' ')`), bevor eine Assertion sie
sieht. Die Prüfung `Bogen-Notizen sind einzeilig` kann also gar nicht fehlschlagen; sichtbar
wird der Effekt nur an der **Länge** der Notiz. **Status: gemessen** (über Notiz-Längen) — und die
Messung hat den Befund als Ursache **ausgeschlossen**, siehe V1.

### B5 — Die Doktrin-Beispiele nennen eine konkurrierende Zahl

`SHEET_NOTE_GERMAN_FORM` enthält die Zeile `Dunkelsicht 36 m` (`fieldSummaryAction.ts:76`),
`SHEET_NOTE_EXAMPLE_EN` das englische `Darkvision 120 ft` (`:60`) — beides wörtlich aus
`vault/species/dwarf.json`. Der Gnom des Wizard-Falls hat 60 ft / 18 m. Ein Beispiel, das die
Zieldimension mit einer anderen Zahl vorbelegt, ist ein Kandidat für Abschreib-Fehler.
*Assertion:* `Dunkelsicht-Notiz nennt die deutsche Reichweite (18 m)` (weich,
`wizardFeatures-gnome-sorcerer.ts:321`). **Status: gemessen, kein Effekt** — die Prüfung stand in
jedem Lauf bei 100 %, mit und ohne die konkurrierende Zahl (V1).

### B6 — Pass C behauptet einen Verlauf, den es in zwei von drei Fällen nicht gibt

Der Kopf von `FEATURE_EFFECTS_SYSTEM` (`:88`) beschreibt den Verlauf als *„… plus class
context, your analysis of them, the player's answers to the forced choices
(`<resolved_choices>`) and the re-done analysis that takes those answers into account"* —
unbedingt, als wäre beides immer da. `finalizeFeatureEffects` hängt Antwort-Turn und
Nach-Analyse aber nur an, wenn es aufgelöste Wahlen gibt (`:538`). Für Druide und Schurke
existieren weder `<resolved_choices>` noch eine Nach-Analyse. Dasselbe gilt für
`buildTranscriptionInstruction` (`:434`): *„For every choice listed in `<resolved_choices>` …"*
steht auch dann im letzten Turn, wenn die Liste leer ist. Ein Prompt, der eine Sektion
ankündigt, die fehlt, lädt zum Erfinden ein.
*Assertion:* `protokolliert keine Entscheidung` (core, Druide `:97` und Schurke `:66`).
**Status: gemessen**; die Klausel „No `<resolved_choices>` in the conversation → `decisions`: []"
ist in K2 mit eingegangen. Beim Druiden fiel die Prüfung in der Baseline auf 0/5 — allerdings
als Folgeschaden von B19, nicht wegen des Prompt-Kopfes.

### B7 — „Do NOT produce any final data structures or grants here" widerspricht Regel 3

Pass A (`:123`) verbietet Datenstrukturen und Grants; Regel 3 (`:133`) und das Manifest-Feld
`spellsToGround` (`:152`) verlangen genau eine Grant-Liste als Datenstruktur. Gemeint ist „keine
Rider", gesagt ist mehr. *Assertion:* `erdet die Stufe-3-Kreissprüche ALLER vier Landarten`
(core, Druide `:67`) würde ein wortwörtliches Befolgen fangen. **Status: messbar, ungemessen**
(die Baseline zeigt hier keinen Ausfall — der Widerspruch bleibt Papier).

### B8 — „only fill sheetNote" gegen „Empty string where the doctrine wants no entry"

Pass C Regel 1 (`:93`): ein Merkmal ohne Grant *„still gets its rider — leave the grant fields at
their empty defaults and only fill sheetNote"*. Regel 10 (`:109`) und das englische Beispiel
(*„a sense with a range DOES earn its line, size and speed do NOT"*) sagen für Größe und
Bewegungsrate das Gegenteil: leerer String. Regel 1 steht 16 Zeilen früher.
*Assertion:* `Größe und Bewegungsrate tragen keine Bogen-Notiz` (weich, `:312`).
**Status: gemessen, ohne eigenen Kandidaten** — die Prüfung lag in Baseline (3/3 verwertbar) wie
Endstand (5/5) grün; der Widerspruch ist belegt, aber ohne beobachtete Folge. Deshalb
unverändert gelassen.

### B9 — Drei Pass-C-Regeln haben nur eine Negativ-Abdeckung

Kein Fixture enthält Expertise, eine feste Attributserhöhung oder einen eingeschränkten
Waffen-Grant. Damit sind Regel 4 (`:96`, `expertiseSkills`), Regel 6 (`:103`,
`abilityScoreIncrease`) und die Klammer in Regel 5 (`:99`, *„Martial weapons with the Light
property"*) nur von der Verbotsseite geprüft (`erfindet keine Expertise`,
`trägt keine Attributserhöhung ein`). Ob sie im Positivfall funktionieren, weiß die Strecke
nicht. **Status: unbelegt** (fehlender Fall, nicht überflüssige Regel).

### B10 — `<past_choices>` ist in keinem Fall im Eingang

Der Abschnitt (`:136`) inkl. der Sonderregel für deutsche Alt-Einträge erreicht in keiner der
beiden Strecken das Modell: der Gnom übergibt `pastChoices: []`, Druide und Schurke gar nichts.
In Produktion ist der Fall der Regelfall (jeder Aufstieg ab der zweiten Wahl).
**Status: unbelegt** — hier fehlt ein Fall, kein Prompt-Text.

### B11 — Kleinteilige Regeln ohne Prüfung

- Traditions-Mapping *„Arcane→wizard, Divine→cleric, Primal→druid"* (`:131`): kein Fixture
  benennt eine Liste per Tradition. **unbelegt.**
- `type: "text"` (`:156`): kein Fall erzeugt eine Freitext-Wahl. **unbelegt.**
- `optionHelp` *„≤60 chars each"* (`:159`) und T1 Regel 6 (`featureTranslationAction.ts:74`,
  ebenfalls ≤60): die Assertions prüfen nur, *dass* eine Konsequenz dasteht, nie ihre Länge.
  **unbelegt.**
- `SHEET_NOTE_LIMIT = 180` (`evals/cases/featureEffectsStep.ts:25`) liegt über der harten
  Grenze des Übersetzers (`SHEET_NOTE_MAX_CHARS = 160`). Notizen zwischen 161 und 180 Zeichen
  verletzen den Prompt und passieren die Eval. Bewusst so gebaut (Größenordnung statt
  Zeichenzählung), aber es heißt: die harte Grenze ist **unbelegt**.

### B12 — `<class_context>.spellcastingAbility` trägt zwei verschiedene Wertformen, eine davon deutsch

Der Wizard-Pfad füllt das Feld mit dem deutschen Anzeigewort (`featurePrep.ts:143`,
`CASTER_ABILITY_DE` → „Charisma", beim Druiden „Weisheit"), der Aufstiegs-Pfad mit dem deutschen
Bogen-Schlüssel (`LevelUpAssistant.svelte:161` → `wei`). Kein Prompt sagt über das Feld etwas,
keine Assertion liest es. In einem Prompt, der „Write ENGLISH throughout" verlangt, ist ein
deutsches Wort im Eingang eine Einladung. **Status: unbelegt.** Die Behebung wäre eine
Code-Änderung außerhalb dieses Auftrags — hier nur notiert.

### B13 — Pass As `choice`-Beispiel ist der Eval-Fall selbst

`:122` nennt als Beispiel *„the Sage background grants Magic Initiate with its spell list named:
'Wizard'"* — genau die Fixture des Wizard-Falls. Die beiden Assertions dazu
(`übernimmt die vom Hintergrund gesetzte Zauberliste`, `fragt die schon festgelegte Zauberliste
nicht ab`) messen daher vor allem Beispiel-Treue, nicht Verallgemeinerung. Kein Grund, das
Beispiel zu entfernen (es trägt messbar), aber die 100 % dort sind weniger wert als sie aussehen.
**Status: gemessen, aber überbewertet.**

### B14 — Die Per-Einsatz-Klausel widerspricht der Schurken-Erwartung

Pass A Regel 1, Unterpunkt `isBuildDecision` (`:130`): Optionen, die der Spieler *„anew on each
USE"* wählt, *„still need asking when the feature demands it now"*. „Flinke Hände" ist genau so
eine Optionsliste (*„As a Bonus Action, you can do one of the following: Sleight of Hand / Use an
Object"*). Der Schurken-Fall verlangt dagegen `choices.length === 0`
(`featureEffects-rogue-thief.ts:43`). Der Prompt lädt also zu einer Wahl ein, die die Strecke als
Fehler zählt — entschärft nur durch „when the feature demands it now" (tut es nicht).
**Status: gemessen** (Schurken-Strecke, Baseline unten).

### B15 — Die Schurken-Strecke war abgeschaltet

`evals/featureEffects.eval.test.ts:36–40` war auskommentiert. Damit lief die einzige
**Positiv**-Probe der Bogen-Notizen (`jedes Merkmal trägt eine Bogen-Notiz`) und die gesamte
Negativ-Abdeckung von Pass C Regel 4/6/9 ins Leere. Für diesen Auftrag wieder aktiviert
(Begründung unter „Test-Änderungen").

### B16 — T1 bekommt den englischen Regeltext doppelt

`sourcesForChoices` schickt je Merkmal `desc` **und** `descDe` (`featureTranslationAction.ts:110`),
obwohl `<choices>` alle englischen Zeichenketten, auf die T1 abbilden muss, schon enthält und
Regel 1 ausschließlich aus `descDe` zitieren lässt. Beim Gnom sind das ~1.500 Zeichen
Regeltext, den ein thinking-freier 4-Sekunden-Call nicht braucht. **Status: unbelegt**
(nicht gemessen — der Call ist ~6 % der Kette, das Budget ging in wirksamere Kandidaten).

### B17 — Pass C protokolliert Wahlen, die niemand beantwortet hat

Regel 7 (`:104`) bindet `decisions` an `<resolved_choices>`. Gemessen (Baseline, Gnom, Call C):
in 2 von 3 verwertbaren Läufen trug der Magiekundigen-Rider zwei `decisions` für die beiden
**Zauber**-Wahlen — die im Wizard erst im Zauber-Schritt fallen und hier unbeantwortet sind.
`fillDecisions` findet dann keine Antwort und schreibt einen Protokoll-Eintrag mit leerem
`answer` an den Charakter. Keine Assertion fing das; eine neue tut es jetzt
(`protokolliert keine unbeantwortete Wahl`, siehe „Test-Änderungen").
**Status: gemessen, Baseline 1/3.**

### B18 — Pass A verbrennt gelegentlich das ganze Token-Budget (der eigentliche Ausreißer)

Der 213-s-Ausreißer aus dem Auftrag hat eine Ursache, und sie ist nicht Langsamkeit:
in 2 von 13 Pass-A-Calls der Baseline kam `usage.received` auf **exakt 16384** — das Limit —
und `content` war **leer** (193 s). Der Reasoning-Vorlauf hat das gesamte Budget verbraucht,
für die Antwort blieb nichts; `reason()` wirft dann (`:477`). Beide Male traf es den ersten
Call des Call-C-Falls, also *denselben Request*, der im Call-1-Fall 5/5-mal in 4,7k–7,4k Tokens
fertig wurde. Es ist also ein schwerer Verteilungsschwanz, kein Kontextproblem.

Konsequenz für die Messung: jeder verlorene Lauf kostet 20 Prozentpunkte auf **allen**
Call-C-Assertions. Die Baseline-Tabelle führt deshalb beide Zahlen — rohe Pass-Rate und die
Rate über die verwertbaren Läufe. `EVAL_MAX_TOKENS` habe ich **nicht** angehoben: die
Produktion hat dasselbe Limit, und ein Prompt, der es reißt, ist ein Prompt-Befund, kein
Messartefakt. **Status: gemessen (2/13 Calls).**

### B19 — Das Landart-Beispiel im Prompt ist auf dem Stand von 2014

Pass A Regel 1 nennt „a terrain" als Beispiel einer erzwungenen Wahl und
*„(e.g. a Circle of the Land terrain decides which spells are granted)"* als Beispiel für
`determinesFurtherEffects`; der `isBuildDecision`-Unterpunkt führt „a terrain" zusätzlich als
DAUERHAFTE Aufbau-Wahl. Der Vault-Text von SRD 5.2 sagt dagegen *„Whenever you finish a Long
Rest, choose one type of land"* — die Wahl fällt nach jeder Rast neu.

Der Prompt weist das Modell also ausdrücklich zu dem Verhalten an, das die Druiden-Strecke als
Fehler zählt: **alle vier Core-Assertions von Call 1 und beide von Call C stehen auf 0/5.**
Sechs rote Core-Assertions an einem Beispielsatz. **Status: gemessen** (Kandidat K1).

---

## 2. Baseline (je 5 Läufe, `concurrency=4`)

Wo Läufe an B18 (leeres Reasoning-Budget) verloren gingen, steht die rohe Rate und dahinter
die Rate über die **verwertbaren** Läufe — nur letztere ist ein Qualitätssignal.

### wizardFeatures — Call 1 (Analyse + T1), ø 68 s, 4631↑/6241↓ Tokens, 0 Ausfälle

| Assertion | Baseline |
|---|---|
| alle 15 Core-Assertions | 5/5 |
| ○ fragt auch das Zauberattribut der Abstammung ab | **0/5** |
| ○ Anzahl der wählbaren Zauber stimmt | **2/5** |
| ○ optionHelp (beide Zweige / mechanisch getrennt), help ≤ 120, ≤ 5 Wahlen, Prosa-Abhängigkeit | 5/5 |

### wizardFeatures — Call C (5-Call-Kette), ø 157 s, 9974↑/13379↓, **2 von 5 Läufen verloren**

| Assertion | roh | verwertbar |
|---|---|---|
| 8 Core-Assertions (Rider je Merkmal, Waldgnom-Zauber, kein Felsgnom, Wahl protokolliert, featureKey, keine Magiekundigen-Zauber, keine RW-Übung, keine Attributserhöhung) | 3/5 | 3/3 |
| ● protokolliert keine unbeantwortete Wahl *(neu, retroaktiv aus `runs.jsonl`)* | 1/5 | **1/3** |
| ○ Einfache Illusion als benannter Grant *(verschärft, retroaktiv)* | 2/5 | **2/3** |
| ○ Bogen-Notizen einzeilig ≤ 180 | 2/5 | **2/3** |
| ○ Größe/Bewegungsrate ohne Notiz · Angeborene Zauberei mit Notiz · Dunkelsicht 18 m · deutsch | 3/5 | 3/3 |

### featureEffects — Druide (Zirkel des Landes)

| Assertion | Baseline |
|---|---|
| Call 1 (ø 47 s): erkennt keine Wahl · keine Landart · nicht blockiert · erdet alle vier Landarten | **0/5** (alle vier) |
| Call 1 soft: keine höheren Stufen · nicht mehr als zwölf | 5/5 |
| Call C (ø 55 s): gewährt die zwölf Kreissprüche · protokolliert keine Entscheidung | **0/5** (beide) |
| Call C soft: ≥ 1 Notiz · einzeilig ≤ 180 | 5/5 |
| Call C soft: Notiz nennt die Rast · zählt Kreissprüche NICHT auf | **0/5** / **2/5** |

### featureEffects — Schurke (Dieb), Gegenprobe

Call 1 (ø 15 s) und Call C (ø 27 s): **alle Core- und Soft-Assertions 5/5.** Die Strecke war
abgeschaltet (B15) und ist damit die billigste Wiederherstellung von Abdeckung in diesem
Auftrag: 4 + 9 Assertions für 40 Calls.

---

## 3. Übernommene Änderungen

### K1 — Pass A trennt „jetzt zu entscheiden" von „am Spieltisch" (B19)

*Hypothese:* Regel 1 nannte „a terrain" als erzwungene Wahl, das
`determinesFurtherEffects`-Beispiel war „a Circle of the Land terrain decides which spells are
granted", und `isBuildDecision` führte „a terrain" als DAUERHAFTE Wahl. Alles drei ist der Stand
von 2014; der Vault-Text von SRD 5.2 lässt die Landart nach jeder Langen Rast neu wählen. Der
Prompt wies das Modell also zu dem Verhalten an, das die Strecke als Fehler zählt.

*Messung (5 Läufe):*

| | Baseline | K1 |
|---|---|---|
| Druide Call 1, alle vier Core | 0/5 | **5/5** |
| Druide Call C, beide Core | 0/5 | **5/5** |
| Druide Latenz Call 1 / Call C | 47 s / 55 s | **21 s / 31 s** |
| Druide `spellsToGround`-Tokens (Call 1, empfangen) | 4375 | **2000** |
| Schurke, alle 13 Assertions | 5/5 | 5/5 |
| Gnom, alle Core Call C | 3/3 | **5/5** (0 Ausfälle) |
| Gnom Latenz Call C | 157 s | 137 s |

*Entscheidung:* übernommen. Sechs rote Core-Assertions an einem veralteten Beispielsatz — und
die Hälfte der Latenz des Druiden-Falls bestand darin, über eine Frage nachzudenken, die es
nicht gibt.

### K2 — Pass C protokolliert nur beantwortete Wahlen (B17)

*Hypothese:* Regel 7 sagt, was ins `decisions`-Feld gehört, nie was nicht. Ergebnis: Einträge
für die beiden noch offenen Zauber-Wahlen, die über `fillDecisions` mit LEERER Antwort am
Charakter landen. Die Verneinung muss an beide Stellen, an denen die Regel steht — der letzte
User-Turn ist der, an dem das Modell handelt.

*Messung:* `protokolliert keine unbeantwortete Wahl` 0/5 → **3/5**, alle übrigen Call-C-Cores
unverändert 5/5.

*Entscheidung:* übernommen, aber **nicht erledigt**. Die Restfälle sind immer dieselben zwei
Magiekundigen-Wahlen. Der saubere Riegel ist deterministisch und gehört in `fillDecisions`:
die App weiß genau, welche ids beantwortet wurden, und kann jede andere verwerfen. Ich habe
ihn NICHT gebaut, weil er die Assertion per Konstruktion grün macht und damit das
Prompt-Signal blendet — die Entscheidung gehört dem Auftraggeber.

### K3 — Zauber-Wahlen vollständig beschreiben (B1 + `max`)

Zwei Änderungen in einem Lauf, weil ihre Assertions disjunkt sind:

1. Die Regel, die `spell-pick` erzeugt, sagte nichts über `max`; die generische Zeile
   („max = how many may be picked (1 for single)") steht 25 Zeilen später im Output-Block.
   Gemessen: `max=1` bei „zwei Zaubertricks" in 3 von 5 Läufen — und
   `CharacterWizard.svelte:368` öffnet genau `max` Plätze, der Charakter verlor also einen
   Zaubertrick.
2. Pass A Regel 3 definierte `spellsToGround` nur über „always prepared". Pass C Regel 2 kennt
   zusätzlich den benannten Zaubertrick, aber `buildTranscriptionInstruction` macht die geerdete
   Liste zur Whitelist („use only the canonical English names from `<spell_resolution>`"). In dem
   Lauf, in dem *Minor Illusion* fehlte, trug Pass C stattdessen `extraCantrips: 1` ein — ein
   FREIER Zaubertrick statt des benannten.

*Messung:* `Anzahl der wählbaren Zauber stimmt` 2/5 → **5/5**; `Einfache Illusion als benannter
Grant` 2/5 → **5/5**; Call 1 erstmals alle 16 Core-Assertions 5/5.

*Entscheidung:* beide übernommen.

### K4 — „Vorteil auf Rettungswürfe" ist keine Rettungswurf-Übung

*Hypothese:* Regel 5 nennt `savingThrows` als geschlossenes Vokabular, warnt aber nicht vor der
klassischen Verwechslung. Im K3-Lauf trat sie in 2 von 5 Läufen auf (Gnomische Gerissenheit →
`savingThrows: [Intelligence, Wisdom, Charisma]`, also ein Übungsbonus, den die Regeln nie geben).

*Messung:* `deutet Gnomische Gerissenheit nicht als Rettungswurf-Übung` 3/5 → **5/5**.

*Entscheidung:* übernommen. Vorsicht bei der Interpretation: die Prüfung stand vor K3 dreimal
auf 5/5, der Ausfall trat erst im K3-Lauf auf. Entweder waren die 15 Läufe davor Glück oder K3
hat Aufmerksamkeit umverteilt — die Warnung kostet vier Zeilen und schließt beides ab.

---

## 4. Verworfene Kandidaten

### V1 — T2 bekommt eine Einzeiler-Vorlage statt des Feld-Layouts (B4/B5)

*Hypothese:* T2 schreibt zu lange Notizen, weil ihm über `SHEET_NOTE_GERMAN_FORM` die
Layout-Vorlage des FELD-Prompts gezeigt wird (Namen auf eigener Zeile, Leerzeilen,
Abschnitts-Überschriften `[Klassenmerkmale]`) — das Gegenteil seiner eigenen Regel 4
(„single line, no markdown"). Dazu gibt das Beispiel mit „Dunkelsicht 36 m" eine
konkurrierende Reichweite vor.

*Messung (25 Notizen je Stand):*

| | vorher | mit Einzeiler-Vorlage |
|---|---|---|
| Notizen über dem harten Budget (160) | 7 | 6 |
| Maximum | 195 | 183 |
| Mittelwert | 112 | 114 |
| `Dunkelsicht-Notiz nennt 18 m` | 5/5 | 5/5 |

*Entscheidung:* **zurückgenommen** (Revert-Commit im Branch). Kein Effekt — und die Daten
zeigen, warum: **10 der 25 ENGLISCHEN Notizen reißen bereits Pass Cs eigenes Budget von 135
Zeichen** (max 177), während T2 sogar verkürzt (Deutsch/Englisch = Faktor 1,09, nicht die
angenommenen 1,17). Das Längen-Thema gehört in Pass C Regel 10, nicht in den Übersetzer. Der
Widerspruch in T2 bleibt damit im Code — er ist belegt, aber messbar wirkungslos, und die
geteilte Doktrin hat drei Leser: eine Änderung dort ohne Wirkungsnachweis kostet mehr
Risiko als sie bringt.

### V2 — „Be ECONOMICAL": Pass A zur Kürze auffordern (Latenz-Kandidat)

*Hypothese:* Pass A fordert Prosa ohne jede Mengenangabe. Eine Vorgabe („zwei bis drei Zeilen je
Merkmal, EINE Zeile für ein Merkmal ohne Wahl und ohne Grant") sollte den Reasoning-Vorlauf
kürzen — der Gnom-Fall bringt sieben Merkmale mit, fünf davon ohne jede Wahl.

*Messung (wizardFeatures Call 1, 5 Läufe):*

| | ohne | mit |
|---|---|---|
| Latenz | ø 68–71 s | ø 75 s |
| empfangene Tokens | 6241–6386 | 6725 |
| alle 16 Core-Assertions | 5/5 | 5/5 |

*Entscheidung:* **zurückgenommen.** Kein Gewinn, tendenziell das Gegenteil. Die Reasoning-Länge
dieses Modells reagiert nicht auf Appelle, sondern darauf, wie viele Fälle es prüfen muss —
K1 belegt genau das (halbe Latenz durch eine weggefallene Frage). Mitgenommen aus demselben
Lauf und **behalten** wurden nur die beiden statisch belegten Streichungen (B2, B7): unerreichbarer
Eingang bzw. Selbstwiderspruch, beide ohne messbare Wirkung in beide Richtungen.

---

## 5. Test-Änderungen — jede einzeln begründet

**T-1 · Schurken-Strecke wieder aktiviert** (`evals/featureEffects.eval.test.ts`).
Sie war auskommentiert. Damit lief die einzige POSITIV-Probe der Bogen-Notizen (`jedes Merkmal
trägt eine Bogen-Notiz`) und die Negativ-Abdeckung von Pass C Regel 4/6/9 ins Leere. Keine
Abschwächung — reine Wiederherstellung von Abdeckung, und mit 4 Calls je Lauf die billigste im
ganzen Auftrag. Sie war und blieb bei 100 %.

**T-2 · Neue Core-Prüfung `protokolliert keine unbeantwortete Wahl`** (Gnom, Call C).
Fand einen Befund, den keine Prüfung fangen konnte (B17): Protokoll-Einträge zu Wahlen, die
niemand beantwortet hat, landen mit leerem `answer` am Charakter. Die Baseline dazu ist
**retroaktiv aus `runs.jsonl` des Baseline-Laufs** berechnet (1 von 3 verwertbaren Läufen) —
die gespeicherten Ergebnisse erlauben das, ohne einen Lauf zu bezahlen. Core, weil die
Schwester-Prüfung in beiden anderen Fällen (`protokolliert keine Entscheidung`) ebenfalls Core
ist.

**T-3 · Verschärft: `Einfache Illusion kommt als benannter Grant an`** (vorher „… als Grant
ODER zusätzlicher Zaubertrick"). Das ODER ließ `extraCantrips: 1` als Erfolg durchgehen — das
gibt dem Spieler aber einen FREI wählbaren Zaubertrick, statt ihm den benannten zu gewähren.
Pass C Regel 3 verbietet genau das („A cantrip you named in grantedSpells is not a free pick").
Die Prüfung war also selbst falsch: sie akzeptierte ein fehlerhaftes Modell des Merkmals. Das
ist eine **Verschärfung**, keine Lockerung; Baseline ebenfalls retroaktiv (2 von 3).

**Nicht angetastet:** kein Schwellwert, kein `noRetry`, kein `EVAL_MAX_TOKENS`. Insbesondere
wurde das Token-Budget NICHT erhöht, obwohl das die verlorenen Läufe (B18) gerettet hätte: die
Produktion hat dasselbe Limit, ein Prompt, der es reißt, ist ein Prompt-Befund.

---

## 6. Was nicht gemessen wurde — und warum

| Befund | Warum ungemessen |
|---|---|
| B2 Waffenmeisterschaft/Kampfstil-Klammer | Kein Fall kann sie erreichen (`isFlowOwnedChoiceFeature` filtert vorher). Entfernt als Teil des Latenz-Kandidaten; „keine Regression" ist alles, was dazu messbar ist. |
| B3 Pass C Regel 8 (Dublette der Doktrin) | Keine Assertion prüft, ob Übungsbonus/Zauberplätze im Rider oder in der Notiz auftauchen. Regel steht weiterhin drin — sie zu löschen wäre geraten. |
| B9 Expertise / feste Attributserhöhung / eingeschränkter Waffen-Grant | Kein Fixture enthält so ein Merkmal. Nur die Verbotsseite ist geprüft. **Empfehlung: ein Fall mit Talent „Zäh" (+1 KON) und einem Expertise-Merkmal (Schurke Stufe 1) schließt drei Regeln auf einmal.** |
| B10 `<past_choices>` | In keiner Strecke im Eingang, obwohl in Produktion Regelfall. **Empfehlung: den Gnom-Fall um einen zweiten Aufstieg mit gesetzter Abstammung erweitern.** |
| B11 Traditions-Mapping, `type: "text"`, die 60-Zeichen-Budgets, das harte 160-Zeichen-Budget | Keine Assertion. Das 180er-Limit der Eval liegt bewusst über der harten Grenze — dadurch ist gerade der Bereich 161–180 unsichtbar, in dem die Verstöße tatsächlich liegen. |
| B12 `spellcastingAbility` deutsch bzw. als Bogen-Schlüssel | Kein Prompt spricht über das Feld, keine Assertion liest es. Die Behebung wäre eine Code-Änderung (`featurePrep.ts` vs. `LevelUpAssistant.svelte`) — außerhalb des Auftrags, hier nur notiert. |
| B16 T1 bekommt `desc` doppelt | Reine Token-Diät an einem 4-Sekunden-Call (~6 % der Kette). Das Budget war in wirksameren Kandidaten besser angelegt. |
| `NARRATIVE_SYSTEM`, `LEVELUP_EFFECTS_SYSTEM`, `EQUIPMENT_OPTIONS_SYSTEM`, `spec.ts`/`factory.ts` | Auftragsgemäß nicht angefasst. Aufgefallen ist dort nichts, was über die schon bekannten Punkte hinausgeht. |
| Die zwei Rest-Fehlschläge von K2 | Prompt-seitig ausgereizt (siehe K2); der deterministische Riegel wäre eine Code-Entscheidung des Auftraggebers. |

---

## 7. Latenz — was tatsächlich hilft

Der Auftrag nennt Latenz als Ergebnis, nicht als Nebenschauplatz; nachträglich wurde sie zum
Hauptziel. Die Messungen sagen dazu etwas Unbequemes und etwas Nützliches.

**Was hilft: dem Modell Arbeit wegnehmen, nicht es zur Eile mahnen.**

| Änderung | Druide Call 1 | Druide Call C | Gnom Call C (ganze Kette) |
|---|---|---|---|
| Baseline | ø 47 s | ø 55 s | ø 157 s (2 von 5 Läufen verloren) |
| K1 (Zeitachse) | **ø 21 s** | **ø 31 s** | ø 137 s (0 verloren) |
| K2 / K3 / K4 | — | — | ø 135 s / 118 s / 131 s |

K1 halbiert die Latenz des Druiden-Falls, weil das Modell nicht mehr über eine Wahl
nachdenkt, die es nicht gibt: die empfangenen Tokens von Call 1 fielen von 4375 auf 2000.
Dieselbe Mechanik erklärt den Gewinn beim Gnom.

**Was nicht hilft: eine Sparaufforderung.** Der Kandidat „Be ECONOMICAL — zwei bis drei Zeilen
je Merkmal, eine Zeile für ein Merkmal ohne Wahl und ohne Grant" verlängerte Call 1 leicht
(ø 75 s statt 68–71 s, 6725 statt 6241–6386 empfangene Tokens). Reasoning-Länge lässt sich
über Prosa-Appelle offenbar nicht steuern; über die Menge der zu prüfenden Fälle schon.

**Der teuerste Einzelposten ist der Verteilungsschwanz (B18), nicht der Mittelwert.**
Ein Runaway kostet 193 s **und** das Ergebnis. In der Baseline traf es 2 von 13 Pass-A-Calls,
in den Läufen danach 1 von 25. Das ist zu wenig für eine belastbare Rate, aber die Richtung
passt zur Erklärung: kürzeres Reasoning reißt das Budget seltener.
`EVAL_CALL_TIMEOUT_MS` (240 s) hat gegen einen 193-s-Ausreißer nur 47 s Reserve — beim
nächsten langsamen Server-Tag erscheint derselbe Befund als „Timeout".

**Wo die Zeit sonst liegt** (Gnom, ganze Kette, gemessen): Pass A 68–78 s · Nach-Analyse
30–40 s · Guided 15–22 s · T1 4 s · T2 3 s. Die beiden Übersetzungs-Calls sind zusammen unter
6 % — jede Token-Diät dort (B16) ist Kosmetik. Alles Weitere ist eine Frage der Architektur
(drei Reasoning-Durchläufe über denselben `<gained_features>`-Block, der im Call-C-Verlauf
dreimal steht: ~15.000 gesendete Tokens je Lauf) und war ausdrücklich nicht Gegenstand
dieses Auftrags.

---

## 8. Empfehlungen für den nächsten Durchgang

Nach Nutzen sortiert; die ersten drei sind aus dieser Messreihe heraus fällig.

1. **Deterministischer Riegel in `fillDecisions`.** Die App weiß, welche Choice-ids beantwortet
   wurden — jede andere id gehört verworfen, statt sie mit leerer Antwort an den Charakter zu
   schreiben. Der Prompt-Weg ist bei 3/5 ausgereizt (K2). Wenn dieser Riegel kommt, muss die
   Assertion `protokolliert keine unbeantwortete Wahl` bleiben, aber ihre Aussage wandert vom
   Prompt zum Code — im Bericht dokumentieren, sonst liest die grüne Zeile später als
   Prompt-Qualität.
2. **Zwei fehlende Fälle schließen sechs unbelegte Regeln** (B9/B10): ein Fall mit fester
   Attributserhöhung (Talent „Zäh") und Expertise (Schurke Stufe 1) deckt Pass C Regel 4 und 6
   von der Positivseite; ein Gnom-Aufstieg MIT `<past_choices>` deckt den ganzen
   `<past_choices>`-Abschnitt.
3. **`EVAL_CALL_TIMEOUT_MS` hochsetzen oder Pass A abbrechen, bevor das Budget leer ist.**
   193 s Runaway gegen 240 s Timeout ist keine Reserve. Produktionsseitig fängt der Wurf in
   `reason()` den Fall zwar ab, aber der Nutzer sieht nach über drei Minuten einen Fehler.
4. **`class_context.spellcastingAbility` vereinheitlichen** (B12): der Wizard-Pfad schickt
   „Charisma"/„Weisheit", der Aufstiegs-Pfad `wei`. Ein englischer Attributname wäre in einem
   englischsprachigen Prompt das Naheliegende.
5. **Das 180-Zeichen-Limit der Eval auf die harte Grenze (160) nachziehen** — aber erst, wenn
   die Notizlängen dort stabil liegen (Endstand: 3 von 25 darüber). Solange es 180 ist, bleibt
   genau der Bereich unsichtbar, in dem die Verstöße stattfinden.
6. **Nicht nochmal versuchen:** eine Sparaufforderung an Pass A (gemessen, wirkungslos) und die
   Aufspaltung der Bogen-Doktrin für T2 (gemessen, wirkungslos — siehe V1).

---

## 9. Baseline gegen Endstand, je Assertion (jeweils 5 Läufe)

### featureEffects — Druide, Call 1

| Assertion | Baseline | Endstand |
|---|---|---|
| ● erkennt keine erzwungene Wahl | 0/5 | **5/5** |
| ● fragt insbesondere keine Landart ab | 0/5 | **5/5** |
| ● nicht blockiert | 0/5 | **5/5** |
| ● erdet die Kreissprüche aller vier Landarten | 0/5 | **5/5** |
| ○ keine Kreissprüche höherer Stufen | 5/5 | 4/5 |
| ○ nicht mehr als die zwölf | 5/5 | 4/5 |
| Latenz / empfangene Tokens | 47 s / 4375 | **24 s / 2208** |

### featureEffects — Druide, Call C

| Assertion | Baseline | Endstand |
|---|---|---|
| ● gewährt die zwölf Kreissprüche | 0/5 | **5/5** |
| ● protokolliert keine Entscheidung | 0/5 | **5/5** |
| ○ keine höheren Stufen · nicht mehr als zwölf · ≥ 1 Notiz | 5/5 | 5/5 |
| ○ Bogen-Notizen einzeilig ≤ 180 | 5/5 | **2/5** |
| ○ Notiz nennt die Rast | 0/5 | **3/5** |
| ○ zählt die Kreissprüche NICHT auf | 2/5 | 2/5 |
| Latenz | 55 s | **32 s** |

Die beiden roten Zeilen sind derselbe Befund und der Gegenstand von K7: die Notiz zählt die
zwölf Kreissprüche auf und wird dadurch bis zu 241 Zeichen lang. In der Baseline war sie kurz,
weil das Modell blockierte und gar keine Zauber kannte — der Rückgang ist also der Preis dafür,
dass Call C jetzt überhaupt etwas zu erzählen hat.

### featureEffects — Schurke (Gegenprobe)

Alle 7 Core- und 2 Soft-Assertions in Baseline **und** Endstand 5/5. Latenz 15 s / 27 s
(Baseline 15 s / 27 s) — die Strecke ohne Wahl und ohne Zauber ist von allen Änderungen
unberührt, genau wie beabsichtigt.

### wizardFeatures — Call 1

| Assertion | Baseline | Endstand |
|---|---|---|
| ● alle 16 Core-Assertions | 5/5 | 5/5 |
| ○ fragt auch das Zauberattribut ab | 0/5 | 2/5 |
| ○ Anzahl der wählbaren Zauber stimmt | **2/5** | **5/5** |
| ○ optionHelp (beide/mechanisch), help ≤ 120, ≤ 5 Wahlen, Prosa | 5/5 | 5/5 |
| Latenz / empfangene Tokens | 68 s / 6241 | 68 s / 6115 |

### wizardFeatures — Call C

| Assertion | Baseline (roh / verwertbar) | Endstand |
|---|---|---|
| ● 8 Core-Assertions (Rider, Zauber, Wahl, featureKey, keine RW-Übung, keine ASI …) | 3/5 / 3/3 | **5/5** |
| ● protokolliert keine unbeantwortete Wahl | 1/5 / 1/3 | **0/5** |
| ○ Einfache Illusion als benannter Grant | 2/5 / 2/3 | **5/5** |
| ○ Bogen-Notizen einzeilig ≤ 180 | 2/5 / 2/3 | **5/5** |
| ○ Größe/Speed ohne Notiz · Angeborene Zauberei mit · Dunkelsicht 18 m · deutsch | 3/5 / 3/3 | **5/5** |
| verlorene Läufe (B18) | **2 von 5** | 0 von 5 |
| Latenz (Median) | 157 s (142 s) | 155 s (**132 s**) |
| EN-Notizen über 135 Zeichen | 10 von 25 | **3 von 25** |

**Zur roten Zeile:** `protokolliert keine unbeantwortete Wahl` ist über die fünf Läufe seit K2
bei 3/5, 2/5, 3/5, 2/5, 0/5 gelandet — gegen eine Baseline von 1/3. Der in K2 gemessene Sprung
0/5 → 3/5 hält der Wiederholung **nicht** stand: die Prüfung streut bei n=5 über die volle
Breite, und der Prompt-Weg ist hier am Ende. Die Änderung bleibt drin, weil sie inhaltlich
richtig und nachweislich harmlos ist — aber sie ist **nicht belegt**, und der Riegel gehört in
`fillDecisions` (Empfehlung 1).

---

## 10. K7 — die Bogen-Notiz zählt keine gewährten Zauber auf

*Hypothese:* Die Doktrin schließt „granted spells" aus, Regel 10 macht daraus keine
Handlungsanweisung. Beim Druiden schrieb Pass C deshalb die zwölf Kreissprüche in die Notiz —
das erklärt beide roten Zeilen des Endstands auf einmal (Länge UND Dublette), denn die Zauber
stehen ohnehin in der Zauberliste des Charakters.

*Messung (5 Läufe):*

| Assertion (Druide Call C) | Endstand vor K7 | K7 |
|---|---|---|
| ○ zählt die Kreissprüche NICHT in der Notiz auf | 2/5 | **5/5** |
| ○ Bogen-Notizen einzeilig ≤ 180 Zeichen | 2/5 | **5/5** |
| ○ Notiz nennt die Landart-Wahl pro Rast | 3/5 | **4/5** |
| ● beide Core-Assertions | 5/5 | 5/5 |
| Schurke (alle 9) | 5/5 | 5/5 |

*Gegenprobe Gnom:* Call C alle Core-Assertions 5/5, alle fünf Notiz-Prüfungen 5/5 — die Notizen
verlieren nichts Mechanisches, obwohl sie die gewährten Zauber nicht mehr nennen dürfen.
(Call 1 zeigt in diesem Lauf 4/5 auf allen Cores: ein weiterer B18-Ausfall. Call 1 sieht die
Änderung gar nicht — sie sitzt in Pass C.)

*Entscheidung:* übernommen.

---

## 11. Fazit

**Was die Kette vorher falsch machte, war überwiegend nicht Modell-Schwäche, sondern
Prompt-Inhalt.** Von den 24 Core-Assertions über die drei Fälle standen zwölf auf 0/5 oder
waren durch verlorene Läufe entwertet; nach fünf übernommenen Änderungen stehen alle auf 5/5,
mit einer Ausnahme (`protokolliert keine unbeantwortete Wahl`, siehe unten). Die größten
Einzelposten:

1. Ein **veraltetes Beispiel** („a Circle of the Land terrain") ließ sechs Core-Assertions
   scheitern und verdoppelte die Latenz des Falls.
2. Eine **Regel ohne Verneinung** (`decisions`) schrieb leere Protokoll-Einträge an den
   Charakter.
3. Eine **Regel, die ihre Zahl nicht nennt** (`max` beim `spell-pick`), kostete den Charakter
   einen Zaubertrick.
4. Eine **Lücke zwischen zwei Pässen** (benannte Zaubertricks in `spellsToGround`) verwandelte
   einen benannten Zauber in einen freien.
5. Ein **weiches Budget** („max ~135 characters") wurde in 40 % der Notizen gerissen.

**Zur Latenz:** die Kette wurde schneller, weil das Modell weniger Falsches zu prüfen hat —
Druide 47 s → 24 s (Call 1) und 55 s → 32 s (Call C), Schurke 15 s → 13 s, Gnom-Kette im Median
142 s → 132 s. Eine direkte Aufforderung zur Kürze half nicht (V2). Der teuerste Posten bleibt
der Reasoning-Runaway: 193 s und ein verlorenes Ergebnis, in der Baseline 2 von 13 Pass-A-Calls.

**Was offen bleibt:** die Protokoll-Einträge zu unbeantworteten Zauber-Wahlen (Prompt-Weg
ausgereizt, Riegel gehört in `fillDecisions`), sechs Regeln ohne jede Testabdeckung (B9/B10),
und die Frage, ob der Gnom-Fall den Reasoning-Vorlauf von Pass A überhaupt in unter 60 s
schaffen kann — dort liegen 68 s Median bei 6100 empfangenen Tokens, und das ist reine
Modell-Zeit.

### Läufe, Modell, Budget

12 Eval-Läufe (Budget-Obergrenze), alle mit `--runs 5`, `concurrency=4`, Modell
`cyankiwi/Qwen3.6-35B-A3B-AWQ-4bit`, `EVAL_MAX_TOKENS=16384`, `noRetry`. Ein dreizehnter
Aufruf brach nach 9 s an einem Import-Fehler ab (kein LLM-Call, kein Budget).
Reihenfolge: Baseline (wf, fe) · K1 (fe, wf) · K2 (wf) · K3 (wf) · K4+V1 (wf) · K6 (wf) ·
Endstand (fe, wf) · K7 (fe, wf).
