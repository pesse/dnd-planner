# Zauberwirker-Anteile aus der KI-Merkmalsdeutung herausziehen

> Umsetzungsplan, erstellt am 2026-07-29 im Worktree `analyse-prompts`, noch nicht begonnen.
> Folgearbeit zu `docs/analyse-system-prompts.md` — dort war die Architektur der Kette
> (Anzahl der Calls, Sprachgrenze) ausdrücklich außerhalb des Auftrags; hier ist sie das Thema.
>
> Alle Latenz-/Token-Zahlen stammen aus den dort gemessenen Läufen (Modell: QM/vLLM,
> `--runs 5`). Was geschätzt ist, steht als Schätzung da. Zeilennummern: Stand
> `analyse-prompts-wt`.

## Befund

Der Reasoning-Pass soll Entscheidungen finden. Bei „Magiekundiger" (`vault/feats/magic-initiate.json`)
findet er zwei — und trägt daneben vier Dinge, die keine Deutung brauchen:

| Bestandteil des Talents | heute | geschlossene Menge? |
|---|---|---|
| Zauberliste (Cleric / Druid / Wizard) | KI-`choice`, meist schon durch den Hintergrund als `choice` gesetzt | **ja**, drei Werte |
| Zauberattribut (Int / Wis / Cha) | KI-`choice`, weich, **3/5** | **ja**, drei Werte |
| 2 Zaubertricks + 1 Grad-1-Zauber | KI liefert `type`/`spellLevels`/`spellClass`/`max`; die Namen kommen deterministisch aus `vault/spells` | **ja**, Zahlen stehen im Text |
| „stets vorbereitet, 1×/Lange Rast ohne Platz" | Pass C `sheetNote` (EN) → T2 (DE) | statischer Satz, für jeden Charakter gleich |
| „bei jeder Stufe einen Zauber tauschen" | Pass A muss erkennen, dass das **keine** Jetzt-Wahl ist (Regel aus K1) | entfällt |
| „mehrfach nehmbar, andere Liste" | dito | entfällt |

Anders gesagt: an diesem Talent gibt es **nichts**, was ein Modell besser kann als eine
Deklaration. Die Auswahl der Zauber ist ohnehin schon deterministisch — der Zauber-Schritt
löst Optionen aus `vault/spells` auf (`CharacterWizard.svelte:300-330`), die KI liefert nur
Grad, Liste und Anzahl.

Zwei Nebenbefunde dazu:

1. **Das Zauberattribut hat heute keine Senke.** `character.spells.spellcastingAbility`
   (`schemas/character.ts:44`) ist ein *einzelnes* Feld und wird aus der Klasse gesetzt
   (`assembleCharacter.ts:219`). Die Antwort auf die KI-Frage landet nur als Protokollzeile in
   `features[].choice`. Der Kommentar an der Assertion sagt es selbst: „weich, weil der Bogen
   sie (noch) nicht führt". Das Modell arbeitet hier also an einer Frage, deren Antwort die App
   nicht anwenden kann — und schafft sie in 3 von 5 Läufen.
2. **Der Prompt trägt die Kosten dieser Zuständigkeit dreifach.** Zauber-spezifische Passagen
   stehen in Pass A (`featureEffectsAction.ts:132` spell-pick-Absatz, `:134` Regel 3,
   `:157`/`:158`/`:161` Manifest-Zeilen) und in Pass C (`:95` extraCantrips-Doppelzählung,
   `:109` „NEVER spell out the names you put in grantedSpells", `:101` Rettungswurf-Abgrenzung)
   — zusammen gut 2 200 Zeichen, und der System-Prompt geht pro Kette dreimal raus (Analyse,
   Nach-Analyse, Pass C).

Das Muster ist im Repo schon zweimal gelöst: Waffenbeherrschung und Kampfstil werden über
`grantsChoice` **deklariert** und fliegen deshalb vor der KI aus dem Eingang
(`levelUp.ts:90`, `isFlowOwnedChoiceFeature`). Magiekundiger ist derselbe Fall — nur an einem
**Talent** statt an einem Klassenmerkmal, und dort gibt es das Feld noch nicht.

## Was bleibt KI-Arbeit

Damit die Grenze klar ist: Die Gnomische Abstammung bleibt beim Modell. Ihre Zauber hängen am
**Zweig** der Wahl (`Forest Gnome` → *Minor Illusion* + *Speak with Animals*), die Namen stehen
in Options-Absätzen im Prosatext, und genau diese Zweig-Auflösung ist der Grund, weshalb Pass A
`blocked` kennt. Deterministisches Zaubernamen-Fischen im `desc` wäre hier ein Rückschritt: es
müsste den Options-Absatz parsen und würde „you can cast X" (pro Einsatz) nicht von „you always
have X prepared" (dauerhaft) unterscheiden.

**Die Regel, die sich daraus ergibt:** zweig-abhängige Grants sind Modellarbeit, abzählbare
Vokabulare nicht.

## Stufe 1 — Zauber-Zugang deklarieren

### 1a Warum ein EIGENER `kind` neben `spellcasting`

`kind: "spellcasting"` (Kleriker, Zauberer …) ist ein **Zeiger**: „dies ist das Zauberwirken
der Klasse". Es trägt bewusst keine Parameter, weil alle vier aus dem Besitzer ableitbar sind —
Kontingente aus der Stufentabelle, Liste aus der Klasse selbst, Attribut aus
`CASTER_ABILITY_KEY`. `count` ist dort ausdrücklich „ignoriert" (`shared.ts:210-212`).

Magiekundiger ist der umgekehrte Fall: ein Talent hat keine Stufentabelle, keine eigene
Zauberliste und kein Attribut. Nichts ist ableitbar, alles muss **in** der Deklaration stehen.

Derselbe Mechanismus, andere Herkunft der Zahlen — deshalb ein zweiter `kind` statt
Parameter am ersten:

> `spellcasting` = **ableiten** (die Klasse besitzt die Zahlen).
> `spellAccess` = **deklarieren** (das Merkmal besitzt sie).

Dazu ein handfester Grund: `isSpellcastingFeature` (`spellcasting.ts:69`) bedeutet „dies ist
das Klassen-Zauberwirken" und entscheidet über `spellcastingOffer`. Ein Talent mit
`kind: "spellcasting"` würde dieses Prädikat wahr machen — der Preis wäre eine
Zusatzbedingung („… und es deklariert keine Listen"), also genau die implizite Kopplung, die
die Deklaration abschaffen soll.

### 1b Schema

`FEATURE_CHOICE_KINDS` (`schemas/shared.ts:214`) um `spellAccess` erweitern,
`featureChoiceGrantSchema` (`:217`) um drei optionale Felder:

```ts
spellLists: z.array(z.string()).default([])
  .describe('Nur bei kind="spellAccess": Zauberlisten (englische Klassen-Keys), aus denen gewählt wird. Länge 1 = fest.'),
spellAbilities: z.array(z.enum(ABILITY_NAMES)).default([])
  .describe('Nur bei kind="spellAccess": zulässige Zauberattribute. Länge 1 = fest.'),
spellPicks: z.array(z.object({
  level: z.number().int().min(0),   // 0 = Zaubertrick
  count: z.number().int().min(1),
})).default([])
  .describe('Nur bei kind="spellAccess": wie viele Zauber je Gradband gewählt werden.'),
```

**Die eine Regel, die beide Listen tragen: Länge 1 = fest, Länge > 1 = protokollierte
Entscheidung.** Die Deklaration sagt nicht „frag das ab", sondern welche Werte zulässig sind;
gefragt wird nur, wo es mehr als einen gibt. Damit fällt der Sonderfall Hintergrund von selbst
weg (siehe 1d), und ein Homebrew-Talent „Magiekundiger (Magier)" ist eine Datenzeile, kein
Code-Zweig.

`count` bleibt unberührt bei `featCategory`; `spellPicks` ist die Kontingent-Angabe dieser Art.
Danach `npm run schema:examples`.

Was **nicht** ins JSON kommt, obwohl es im Regeltext steht:

* *„stets vorbereitet, zählt nicht gegen das Kontingent"* — `buildSpellSelection` behandelt
  `featurePicks` schon so (`spellcasting.ts:216-249`). Ein Feld, das niemand liest, wäre nur
  eine zweite Wahrheit.
* *„1× ohne Zauberplatz je Lange Rast"*, *„bei jeder Stufe einen Zauber tauschen"* — Bogen-Prosa.
  Die deutsche Zeile schreibt der Feld-Zusammenfassungs-Call ohnehin aus `descDe`; es geht
  nichts verloren.

### 1c Das Feld an das Talent hängen

`featSchema` (`schemas/feat.ts`) kennt `grantsChoice` noch nicht — hinzufügen, analog
`classProgression.ts:63`. Dann in `vault/feats/magic-initiate.json`:

```json
"grantsChoice": {
  "kind": "spellAccess",
  "spellLists": ["cleric", "druid", "wizard"],
  "spellAbilities": ["Intelligence", "Wisdom", "Charisma"],
  "spellPicks": [
    { "level": 0, "count": 2 },
    { "level": 1, "count": 1 }
  ]
}
```

Vokabular-Herkunft, damit keine vierte Tabelle entsteht:

* `spellLists` trägt genau die Werte, die `AnalysisChoice.spellClass` heute trägt (kleine
  englische Klassen-Keys) — der Zauberfilter im Schritt bleibt unangetastet. Deutsch für die
  Anzeige kommt aus der Klassenbibliothek, EN→Key aus `resolveClass` (`spellLibrary.ts:137`,
  kennt „Wizard" wie „Magier").
* `spellAbilities` nutzt `ABILITY_NAMES` (`shared.ts:160`) — das geschlossene englische
  Vokabular, wie `background.abilityScores`. Deutsch über `ABILITY_TO_EN`/`ABILITY_FROM_EN`
  (`classProgression.ts:36`) und `CASTER_ABILITY_DE` (`spellcasting.ts:44`).

Das ist eine Vault-Änderung → gegen `vault/CLAUDE.md` prüfen (Provenance `srd-2024`) und
darauf achten, dass ein Re-Import aus Open5e sie nicht wegwirft (dieselbe Klasse Problem wie
`skillGrantMulticlass`).

### 1c′ Protokollieren — ohne Schema-Änderung am Charakter

Beide Entscheidungen sind Aufbau-Entscheidungen und landen im vorhandenen Merkmals-Ledger:
`assembleCharacter.ts:199-211` schreibt **einen `features[]`-Eintrag pro getroffener Wahl**, also
zwei Einträge mit demselben `sourceKey` `srd-2024_magic-initiate` (`choice: "Wizard"` /
`choice: "Intelligence"`, `choiceDe` „Magier" / „Intelligenz"). Mehrere Einträge pro Key sind
schon der Bestand (Expertise auf 1 und 6, `characterFeatureSchema:100`).

Zurücklesen ist dadurch eindeutig, **weil die Vokabulare in der Deklaration stehen**: ein Wert
aus `spellLists` ist die Liste, einer aus `spellAbilities` das Attribut. Kein neues
Charakterfeld, kein `_version`-Bump, und `collectPastChoices` nimmt beide ohne Zutun mit.

Nebeneffekt, den erst die Deklaration möglich macht: „mehrfach nehmbar, aber jedes Mal eine
andere Liste" wird zu einem Filter über die vorhandenen Einträge desselben `sourceKey`.

### 1c Den Eingang filtern

`featurePrep.ts:74` wendet `isFlowOwnedChoiceFeature` nur auf Klassenmerkmale an; das
Herkunftstalent wird bei `:81-95` **bedingungslos** in `gained` geschoben. Der Filter darf hier
aber *nicht* an `gained` hängen: `summaryClass` ist index-parallel dazu
(`characterWizard.svelte.ts:319`), und der deutsche Bogen-Text soll die Zeile weiter bekommen —
er entsteht aus `descDe` im Feld-Zusammenfassungs-Call, der ohnehin läuft.

Also: `gained` bleibt vollständig, und der **Analyse-Eingang** wird gefiltert
(`characterWizard.svelte.ts:221` und die Nach-Analyse bei `:371`). Genau das Muster, das der
Kampfstil schon fährt (`:320-330`: flow-eigen, aus der KI-Analyse heraus, im Merkmalstext drin).

### 1d Die Wahlen deterministisch erzeugen

Neuer Service `services/spellAccess.ts` — Vorbild `weaponMastery.ts` / `fightingStyle.ts`:

* `spellAccessOffer(feature, specialisation)` → `{ lists, abilities, picks }`. Die
  Spezialisierung des Hintergrunds (`featurePrep.ts:52`, `featSpecialisation`) läuft durch
  `resolveClass` und kürzt `lists` auf einen Wert — bei Akolyth, Führer und Weiser (die drei
  Hintergründe mit `magic-initiate`) fällt die Listen-Frage nach der Regel aus 1b damit ganz
  weg, ohne Sonderbehandlung. Trifft die Angabe keinen Wert aus `spellLists`, bleibt die Frage
  stehen — das ist der sichere Ausgang, nicht ein Fehler.
* Liste und Attribut werden **flow-eigene** Fragen, keine `AnalysisChoice`. Deutsch kommt aus
  vorhandenen Tabellen (`CASTER_ABILITY_DE` in `spellcasting.ts:44`, Klassennamen aus der
  Bibliothek) — **keine neue Übersetzungstabelle**, und kein Übersetzungs-Call.
* Die Zauber-Slots erzeugt derselbe Pfad wie heute, nur mit Zahlen aus der Deklaration statt aus
  `choice.max`. Betrifft `spellPickChoices` (`characterWizard.svelte.ts:186`),
  `CharacterWizard.svelte:368` und im Aufstieg `levelUpMachine.ts:377/387`.

### 1e Senke für das Attribut entscheiden

Offene Frage, die vor 1d beantwortet werden muss (siehe Nebenbefund 1). Drei Wege:

* **A** Frage stellen, Antwort weiter nur protokollieren (Status quo, aber deterministisch und
  zu 100 % statt 3/5).
* **B** `character.spells` um ein Feld pro Merkmals-Zauberzugang erweitern (`_version`-Bump,
  ein Upgrade-Schritt) und Angriffs-/SG-Berechnung daran hängen. Regelrichtig, aber
  `CharacterEditForm` und PDF-Export tragen bisher genau ein Attribut.
* **C** Frage weglassen und implizit die Attributs-Vorgabe der Liste nehmen (Kleriker/Druide →
  Weisheit, Magier → Intelligenz). **Regelwidrig** — der Spieler darf frei wählen —, aber der
  billigste Weg, wenn der Bogen es nie führen wird.

Empfehlung: **A** jetzt, **B** wenn der Bogen die Zauberwerte je Quelle rechnen soll.

### 1f Erst dann den Prompt schrumpfen

Nachdem `spellAccess` deklariert ist und der Vault-Bestand vollständig gepflegt ist (siehe
Stufe 2), können weg: der spell-pick-Absatz in Pass-A-Regel 1 (`:132`), die
`spellLevels`/`spellClass`-Zeile (`:158`), „always false for spell-pick" (`:157`) und der Halbsatz
„never a spell the player PICKS" in Regel 3 (`:134`). Der Typ `spell-pick` selbst bleibt im
Schema (`:233`) als Fallback für undeklariertes Homebrew — aber **nicht** als Prompt-Regel, sonst
steht Text im Prompt, dessen Verletzung keine Assertion mehr messen kann.

Wichtig: das ist eine Prompt-Änderung und braucht damit eine Messung (Kette Gnom, `--runs 5`,
eine Änderung pro Lauf). Das Budget des Analyse-Auftrags ist aufgebraucht.

## Stufe 2 — die übrigen Zauber-Wahlen inventarisieren

Dieselbe Deklaration passt auf jedes Merkmal, dessen Inhalt „wähle N Zauber vom Grad X aus
Liste Y" ist. Vor der Umsetzung braucht es eine Bestandsaufnahme über `vault/classes`
(Mystischer Arkanum des Hexenmeisters, Zaubermeisterschaft und Signaturzauber des Magiers,
Magische Geheimnisse des Barden) — **noch nicht erhoben**, die Namensliste hier ist die
Erwartung aus dem SRD, nicht der geprüfte Vault-Stand. Erst wenn jeder SRD-Fall deklariert ist,
ist der Prompt-Schnitt aus 1f gefahrlos.

## Stufe 3 (größerer Hebel, eigene Entscheidung) — Pass C nur für strukturtragende Merkmale

Die Messung sagt klar, wo die Zeit liegt: Pass C kostet im Gnom-Fall **127 s** (Median 132)
gegen 75 s für Pass A, und er erzeugt ~11 300 Tokens für sieben Rider. Fünf dieser sieben
Merkmale (Angeborene Zauberei, Größe, Bewegungsrate, Dunkelsicht, Gnomische Gerissenheit)
tragen **keine** Wahl und **keinen** strukturellen Grant — ihr einziger Beitrag ist eine
`sheetNote`, also genau die Zeile, die der deutsche Feld-Zusammenfassungs-Call ohnehin aus
`descDe` schreibt.

Wenn Pass C nur die Merkmale bekäme, die Pass A als wahl- oder grant-tragend benannt hat,
schrumpft seine Ausgabe grob auf ein Drittel. Risiko: Pass A entscheidet dann mit, was Pass C
überhaupt sieht — ein Fehlurteil in Pass A verliert stillschweigend einen Grant. Das ist eine
echte Architekturentscheidung, keine Prompt-Optimierung, und sie braucht eine eigene Assertion
(„kein Merkmal mit Grant fällt aus dem Eingang").

## Wirkung — gemessen

Gnom-Kette, je 5 Läufe, Modell `cyankiwi/Qwen3.6-35B-A3B-AWQ-4bit`, concurrency 4.
Baseline = Report `19-33-23-wizardfeatures-k7-keine-zauberliste` (Stand vor Stufe 1),
danach `20-58-43-wizardfeatures-stufe1-spellaccess`.

| | Baseline | Stufe 1 | Δ |
|---|---|---|---|
| Call 1 Median | 67,6 s | **42,2 s** | −38 % |
| Call 1 avg | 94,3 s | 52,1 s | −45 % |
| Call 1 Tokens ↑/↓ | 4 479 / 8 483 | 4 077 / **4 857** | −9 % / **−43 %** |
| Call C Median | 136,3 s | **104,9 s** | −23 % |
| Call C avg | 134,4 s | 114,2 s | −15 % |
| Call C Tokens ↑/↓ | 16 268 / 11 492 | **12 040** / 10 578 | **−26 %** / −8 % |
| Kette (Median Call 1 + Call C) | 203,9 s | **147,1 s** | **−28 %** |

Die Schätzung „15–20 % der erzeugten Tokens" war zu vorsichtig: die eingesparte Arbeit steckte
vor allem im Reasoning-Vorlauf von Call 1 (−43 % Ausgabe-Tokens), nicht nur im Rider.

**Qualität** (Details in `docs/analyse-system-prompts.md`, Abschnitt zu dieser Strecke):

* Call 1: alle **14** Core-Assertions 5/5, keine Fehler (Baseline: 1 Runaway-Lauf, daher 4/5).
* Call C: alle Assertions 4/5 — der eine Ausfall ist ein Reasoning-Runaway von Pass A
  (leere Antwort, `received` am Limit), kein Deutungsfehler. Auf den verwertbaren Läufen 4/4.
* „protokolliert keine unbeantwortete Wahl" war in der Baseline 4/5 **ohne** Runaway, jetzt
  4/4 verwertbar: die unbeantworteten Wahlen WAREN die Zauber-Wahlen des Talents. Mit der
  Deklaration kann dieser Fehler nicht mehr entstehen.
* Der Runaway blieb: 1 von 5 Ketten verliert ihr Ergebnis (in der Baseline traf es Call 1,
  jetzt Call C). Das ist der größte verbleibende Einzelposten und **keine** Prompt-Frage.

Nicht neu gemessen: Druide und Schurke. Beide Fixtures enthalten kein Talent, `analysisGained`
ist dort elementweise gleich `gained` — der Eingang ist beweisbar unverändert.

**Stufe 3** bleibt der Faktor-Hebel (Call C ist weiter ~⅔ der Wartezeit), Stufe 1 war der
risikofreie.

## Umsetzungsstand Stufe 1 (2026-07-29) — fertig und gemessen

Gebaut: Schema (`shared.ts`, `feat.ts`, `featsLibrary.FeatEntry`), Vault-Deklaration,
`services/spellAccess.ts`, `featurePrep.analysisGained`/`spellAccess`, zwei Antwort-Kanäle im
Wizard (`resolvedChoices` vs. `declaredAnswers`), Ledger in `assembleCharacter`, Oberfläche
(deklarierte Wahlen unabhängig vom KI-Status) und ein LLM-freier Test
(`evals/spellAccess.test.ts`, 5 Tests, ~0,4 s).

Beim Bauen gefunden und behoben: die id einer Zauber-Wahl trug die Liste nicht, also überlebte
eine Auswahl den Wechsel der Zauberliste (zurück in den Merkmals-Schritt, Kleriker statt Magier
→ die Magier-Zauber standen weiter auf dem Bogen). Jetzt trägt die id die Liste, und
`assembleCharacter` nimmt nur Picks zu aktuell existierenden Wahlen.

Nicht angefasst: der Prompt (Punkt 1f). Der Schnitt gehört hinter Stufe 2 — sonst fehlt dem
Modell die Regel, während undeklarierte Fälle (Mystischer Arkanum &c.) noch bei ihm liegen.

## Der Reasoning-Vorlauf: was er kostet und was er kauft (2026-07-29)

Gemessen wurde die ganze Kette einmal thinking-frei (`chat_template_kwargs.enable_thinking:
false` für Pass A und die Nach-Analyse; Experiment danach zurückgenommen). Ergebnis, je 5 Läufe:

| | mit Denken | thinking-frei |
|---|---|---|
| Gnom Call 1 Median | 42,2 s | **12,9 s** |
| Gnom Call C Median | 104,9 s | **42,7 s** |
| Gnom Kette (Median) | 147,1 s | **55,6 s** (−62 %) |
| Gnom Assertions | alle 5/5, 1 Runaway | **alle 5/5, 0 Fehler** |
| Druide Call 1 Median | 24 s | **8,4 s** |
| Druide „erdet alle vier Landarten" | **5/5** | **1/5** |

Die Trennlinie ist scharf: **Entscheidungen finden braucht kein Denken, Zauber aufzählen
schon.** Thinking-frei kamen in 4 von 5 Druiden-Läufen `spellsToGround: []` heraus — die zwölf
Kreissprüche standen auch in der Prosa nicht, es war also kein Parser-Problem, sondern ein
Fähigkeitsverlust.

Daraus folgt die Arbeit, die inzwischen gebaut ist: **die Aufzählung ist gar keine
Modellaufgabe.** Die Listen stehen als Markdown-Tabelle im Merkmalstext
(`|3|Blur, Burning Hands, Fire Bolt|` × vier Landarten), also als Daten.
`services/grantedSpells.ts` liest sie — strukturell erkannt (Stufen-Tabelle plus die
Zusicherung „always have … prepared"), nicht am Merkmalsnamen, denn die sechs SRD-Merkmale
heißen alle anders (Kreissprüche, Life Domain Spells, Draconic Spells …). Kein Vault-Duplikat,
wie bei `parseCoreTraits`: die Tabelle kommt aus dem Import und überlebt jeden Re-Import.

Zwei Gewinne über die Zuverlässigkeit hinaus:

* Die Grants hängen am **deterministischen Subklassen-Schritt**. Ohne QM-Modell (Analyse
  übersprungen) bekam ein Charakter seine Domänen-/Kreiszauber vorher überhaupt nicht.
* Ein Name ohne Bibliothekstreffer wird **gemeldet** (dieselbe Inline-Anlage wie bei
  KI-Namen) statt still verworfen.

### Gemessen: Kreissprüche deterministisch (Druiden-Kette, je 5 Läufe)

Baseline `19-30-26-featureeffects-k7`, danach `21-54-18-featureeffects-kreisspruch-det`:

| | Baseline | deterministisch | Δ |
|---|---|---|---|
| Call 1 Median | 23,7 s | **16,3 s** | −31 % |
| Call 1 Tokens ↑/↓ | 2 510 / 2 149 | 2 184 / **1 415** | −13 % / **−34 %** |
| Call C Median | 39,1 s | **18,8 s** | −52 % |
| Call C Tokens ↑/↓ | 6 756 / 3 163 | 5 322 / **1 773** | −21 % / **−44 %** |
| Kette (Median) | 62,8 s | **35,1 s** | **−44 %** |

Alle Core-Assertions 5/5, keine Fehler. Der Schurke (unveränderter Eingang) bleibt
unverändert — Kontrollstrecke.

### Nebeneffekt, der dabei sichtbar wurde: die Notiz wächst, wenn der Eingang schrumpft

Dieselbe Bogen-Notiz („Land's Aid"), dieselbe Regel, aber **107–146 Zeichen mit zwei
Merkmalen im Eingang und 185–254 Zeichen als einziges Merkmal** — die weiche Probe
„einzeilig und ≤ 180 Zeichen" fiel damit von 5/5 auf 0/5. Der Schurke (drei Merkmale, 5/5)
zeigt, dass es an der Anzahl hängt und nicht an der Regel: allein gelassen, holt das Modell
mehr Details in die Zeile — vier von fünf Notizen kosteten ihr Budget an derselben Zutat, der
Skalierung auf Stufe 10/14.

Daraus K8 (Regel 10): „Write only what is true AT THIS LEVEL." Die Begründung steckt in der
Doktrin selbst — der Bogen wird bei jedem Aufstieg neu geschrieben, künftige Würfel sind noch
keine Tischinformation.

**Gemessen (K8, Druiden-Kette, 5 Läufe):** „einzeilig und ≤ 180 Zeichen" **0/5 → 5/5**, Notizen
158–174 statt 185–254 Zeichen. Core-Assertions unverändert 5/5, Latenz unverändert
(19,4 s Median). Die Regel steht in Regel 10 von Pass C und NICHT in `SHEET_NOTE_CONTENT` —
die geteilte Doktrin hat drei Leser, und im Merkmalstext-Feld (mehr Platz) ist ein Hinweis auf
die Skalierung legitim.

### Der Runaway — korrigierte Zahl

Nicht „einer von fünf": über alle 110 gespeicherten Läufe **2**, beide auf der Gnom-Strecke
(50 Läufe → 4 %; Druide und Schurke je 30 Läufe → 0). Selten, aber teuer: 170 s Wartezeit
*und* Totalverlust. Behoben in `featureEffectsAction.reason()` (zweiter Versuch) plus
`llmService` (`delta.reasoning` wird gelesen → Lebenszeichen während des Denkens, Denk-Text
im Mitschnitt, wenn die Antwort leer blieb). Festgenagelt in `evals/runawayRetry.test.ts`.

## Thinking-frei — gemessen und übernommen (2026-07-30)

Nachdem die Aufzählung deterministisch ist, wurde der Vorlauf erneut gemessen: Pass A **und**
Nach-Analyse thinking-frei, je 5 Läufe, alle drei Strecken, jeweils gegen eine Baseline auf dem
aktuellen Stand (die Gnom-Baseline musste dafür neu erhoben werden — die alte lag vor K8).

| Strecke | Kette (Median) mit Denken | thinking-frei | Δ |
|---|---|---|---|
| Gnom Stufe 1 | 143,1 s | **58,1 s** | −59 % |
| Druide 2→3 | 34,2 s | **17,1 s** | −50 % |
| Schurke 2→3 | 41,1 s | **20,4 s** | −50 % |

Ausgabe-Tokens −45…70 % (Gnom Call 1: 4 015 → 1 223), Eingabe-Tokens in Call C leicht **höher**
(+1…12 %), weil die jetzt sichtbare Prosa im Verlauf steht, wo vorher der unsichtbare Vorlauf war.

**Alle Proben aller drei Strecken 5/5.** Keine Fähigkeit ist weggebrochen — insbesondere hält die
Zweig-Auflösung des Gnoms (Waldgnom-Zauber gewährt, Felsgnom-Zweig nicht, je 5/5). Die einzige
0/5-Probe ist das Zauberattribut der Abstammung, das schon vorher zwischen 0 und 1/5 schwankte
(siehe 1e: es hat keine Senke). Der Einwand vom 29.07. — thinking-frei kostete die Zauber-Erdung —
ist erledigt, weil die Erdung dieser Listen keine Modellaufgabe mehr ist.

Der Schalter gilt **je Call** (`noThinking` in `llmService.openAiCompatChat`), nicht global: der
Agent-Loop und die übrigen Aktionen behalten ihren Vorlauf.

Zwei Folgen für die Tests:

* Der **Runaway kann auf diesem Pfad nicht mehr entstehen** (30 Läufe, keiner). `runawayRetry.test.ts`
  ließ sich damit nicht mehr herstellen — ein winziges Budget liefert jetzt abgeschnittenen, aber
  nicht leeren Inhalt. Ersetzt durch `evals/featureAnalysisCall.test.ts`: dieselben drei
  Zusicherungen, aber über einen gestubten `fetch` statt über echte Calls — **plus** die neue
  Zusicherung, dass `enable_thinking:false` wirklich auf der Leitung liegt (die Regression, die
  die halbierte Wartezeit still zurücknehmen würde). Der zweite Versuch bleibt im Code: er kostet
  nichts und fängt eine leere Antwort aus anderem Grund weiter auf.
* Ein **anderer** Ausfallmodus wurde dabei sichtbar und ist NICHT behoben: in der Gnom-Baseline
  brachen 2 von 5 Pass-C-Läufen mit `terminated` ab — der guided Stream wird mitten in der
  Generierung gekappt (einmal nach 147 s). Thinking-frei trat es nicht auf, aber Pass C war immer
  schon thinking-frei; die Läufe sind nur kürzer. Das ist der nächste Kandidat, kein erledigter Punkt.

## Erkennung der Zauberlisten: Diskriminator statt Prosa (2026-07-30)

Der Einwand: die Erkennung war „deterministisch geraten" — eine anders gebaute Tabelle schlägt
fehl. Er trifft, aber ungleichmäßig. Die beiden Signale hatten sehr verschiedenes Risiko:

| Signal | Herkunft | bricht wann? |
|---|---|---|
| Tabellenform `\|3\|Blur, …\|` | maschinell, aus dem Open5e-Import | nur wenn der Importer sein Markdown ändert — dann alle sechs gleichzeitig und laut |
| Prosa-Zusicherung „always have … prepared" | handgeschrieben, pro Eintrag, englisch | bei jeder Umformulierung, bei Homebrew, bei deutschem `desc` — einzeln und still |

Gemessen (Sweep über `vault/classes`, 28 Dateien): **6/6 erkannt, keine Fehltreffer.** Die
Stufentabellen von `druid.json`/`sorcerer.json` fallen korrekt heraus (drei Spalten, keine
Zusicherung). Die deutschen `descDe` parsen ebenfalls — nur die *Erkennung* war englisch, ein
rein deutsches Homebrew-Merkmal fiel also stumm zur KI zurück.

**Umgesetzt:** `grantsSpells: { kind: "levelTable" }` am Klassenmerkmal
(`spellGrantSchema`, shared.ts), an den sechs Vault-Merkmalen deklariert und in
`vault/CLAUDE.md` als re-import-fest vermerkt. Die Prosa bleibt Fallback.

**Verworfen: Regex oder Parse-Rezept im JSON.** Ein Regex ist Code; im Content ist er nicht von
`npm run check` gedeckt, hat keinen Test an der Stelle seiner Wirkung, ist über beliebig langem
`desc` die klassische ReDoS-Form und skaliert mit der Zahl der *Einträge* statt der *Formen*.
Der Diskriminator wählt stattdessen unter Parsern aus, die in Code stehen — geschlossenes
Vokabular, typisiert, testbar. **Ebenfalls verworfen: die Zaubernamen selbst ins JSON** (`alwaysPreparedSpells`)
— wer die Tabelle lesbar pflegen kann, braucht die Doppelpflege nicht, und zwei Fassungen
derselben zwölf Namen laufen auseinander.

Drei Zusicherungen tragen das jetzt (`evals/grantedSpells.test.ts`, LLM-frei):
Deckung über den ganzen Vault (jeder erkannte Fall ist deklariert, kein Tabellen-Merkmal bleibt
unerkannt), Erkennung ohne englische Prosa, und eine Ankündigung ohne lesbare Tabelle bleibt im
KI-Eingang **und** wird im Aufstiegs-Protokoll gemeldet statt still zu verschwinden.

## 1g Der Aufstieg zieht nach (2026-07-30)

Stufe 1 hing nur am Erstell-Wizard. Im Aufstieg schob `LevelUpAssistant.featuresFor('feat')`
jedes gewählte Talent über `featToGainedFeature` **komplett** an die Deutung — die Deklaration
am Talent wurde dort nie gelesen. Wer Magiekundiger auf Stufe 4 nimmt, ließ Liste, Attribut und
Kontingent also erneut vom Modell suchen, obwohl sie als Daten im Vault stehen.

### Hypothese und Erwartung (notiert VOR der Messung)

**Hypothese.** Der KI-Pfad findet die vier Wahlen des Talents nicht zuverlässig; vor allem das
Kontingent („two cantrips" → `max: 2`) ist die Stelle, an der ein Fehler still teuer ist: bei
`max: 1` wählt der Spieler einen Zaubertrick statt zwei und merkt es nie. Der deklarierte Pfad
kann diese Fehler strukturell nicht machen, weil die Zahlen nicht gedeutet, sondern gelesen
werden.

**Erwartung.** Fall B (deklariert) hält alle Core-Assertions 5/5 bei ~0 ms und 0 Tokens.
Fall A (KI) hält die weichen Formvorgaben eher als die Zahlen; die drei Prüfungen, die ich am
ehesten fallen sehe, sind das Zaubertrick-Kontingent, `spellClass` als geschlossenes Vokabular
(„Wizard"/„Magier" statt `wizard`) und „genau vier Wahlen". Latenz von Fall A: die Kette ist
Analyse + Finalisierung auf **einem** Merkmal, thinking-frei also grob 15–25 s.

**Abweichung von „Baseline, dann Änderung" — bewusst.** Beide Stände stecken in EINEM Report
als Fall A und Fall B derselben Strecke, mit demselben Satz Assertions. Grund: der Unterschied
liegt nicht in einem Prompt, sondern darin, welchen Weg die Svelte-Komponente nimmt — und die
ist aus dem Node-Eval nicht erreichbar. Ein zweiter Lauf nach der Umstellung würde exakt
denselben Code messen (`spellAccess.ts` wird von der Umstellung nicht angefasst). Ein Report
mit beiden Armen ist dafür der stärkere Vergleich: gleiches Modell, gleiche Serverlast, gleiche
Fixture, kein Stand-Drift. Dass die Komponente danach wirklich Arm B fährt, sichert
`evals/levelUpFeatAccess.test.ts` deterministisch — bis in die entstehenden `Change`s.

### Ergebnis (2 × 5 Läufe, `--concurrency 1`)

Reports: `2026-07-30T08-31-27-483Z-levelupfeat-ki-vs-deklariert` (vor der Umstellung) und
`…T08-41-06-483Z-levelupfeat-nach-umstellung` (danach, unveränderte Dienste — die
Wiederholung ist die Varianz-Probe). Modell `cyankiwi/Qwen3.6-35B-A3B-AWQ-4bit`.

| Prüfung | KI-Pfad (A), Lauf 1 | A, Lauf 2 | deklariert (B) |
|---|---:|---:|---:|
| Zaubertricks: eine Wahl mit `max: 2` | 40 % | 40 % | **100 %** |
| Grad-1-Zauber: eine Wahl mit `max: 1` | 40 % | 40 % | **100 %** |
| genau zwei Zauber-Wahlen | 40 % | 40 % | **100 %** |
| `spellClass` ist ein erlaubter Listen-Key | 0 % | 0 % | **100 %** |
| Zauberliste als Wahl aus genau drei Listen | 100 % | 80 % | **100 %** |
| Zauberattribut als Wahl aus Int/Wei/Cha | 20 % | 0 % | **100 %** |
| genau vier Wahlen | 0 % | 0 % | **100 %** |
| nennt keine Zaubernamen | 100 % | 100 % | **100 %** |
| jede Wahl hängt am Talent-Key | 100 % | 80 % | **100 %** |

Latenz A: 49,1 s bzw. 57,8 s im Schnitt (Median 46,5 / 41,2; einmal 142 s), ~17–18 k Input-
und ~6–7 k Output-Tokens **je Lauf** — für ein einzelnes Talent. Latenz B: 1 ms, 0 Tokens.

**Die Hypothese traf im Ergebnis, nicht im Mechanismus — Korrektur.** Erwartet hatte ich das
verpatzte Kontingent (`max: 1` statt 2). Die Rohdaten sagen etwas anderes: *wenn* die
Zauber-Wahlen kamen (2 von 5), waren `max: 2` und `max: 1` **richtig**. In den anderen drei
Läufen fehlten sie **ganz** — die Analyse stellte nur die Listen-Frage (einmal Liste +
Attribut) und keine einzige Zauber-Wahl. Der Spieler nimmt Magiekundiger und wählt dann
überhaupt keinen Zauber. Das ist kein Off-by-one, das ist Totalverlust, und es erklärt die drei
40-%-Zeilen: sie messen dasselbe Ereignis dreimal.

Der zweite Befund war gar nicht vorhergesehen: **`spellClass` war in 10 von 10 Läufen leer.**
`buildFeatureChoices` gibt das Feld unverändert an den `SpellPicker` weiter — ohne Klassenfilter
bietet er die *ganze* Zauberbibliothek an. Selbst der beste der fünf Läufe hätte den Spieler also
Zauber wählen lassen, die das Talent nicht gewährt.

### Umgesetzt

* `withoutSpellAccessFeatures` (spellAccess.ts) — EIN Filter für Wizard und Aufstieg; der
  Wizard nutzt jetzt denselben statt seiner eigenen zwei Zeilen.
* `LevelUpAssistant`: `grantsChoice` reist am gewählten Talent mit, der deterministische Schritt
  `feat-links` liest daraus die Zugänge, `featAccessChoices` erzeugt die Wahlen reaktiv (die
  Zauber-Wahlen entstehen erst mit der beantworteten Liste), und `featChoiceQs` = KI-erkannt +
  deklariert speist Checkpoint, Antwort-Gatter, Schritt-Übergang und Dokument.
* Der Übergang zählt die deklarierten Wahlen mit: sonst überspringt die Maschine den
  Talent-Checkpoint, weil die KI nichts mehr zu erkennen hat — und niemand wählt die Zauber.
* Was an das Modell zurückgeht (`gatherDecisions`), bleibt auf die KI-erkannten Wahlen
  beschränkt: das deklarierte Merkmal steht nicht in seinem Eingang.

Fünf deterministische Zusicherungen (`evals/levelUpFeatAccess.test.ts`, LLM-frei) — darunter
die Kette bis in die `Change`s (zwei `cantrip`, ein `preparedSpell` Grad 1, `featureChoice` für
Liste und Attribut) und zwei Deckungs-Proben: jedes Talent mit `spellAccess` ist auflösbar, und
**kein Klassenmerkmal** deklariert einen Zugang — täte es eins, fiele es stumm aus, weil nur der
Talent-Pfad ihn abfragt.

### Offen

* Ein Talent darf mehrfach genommen werden, „but you must choose a different spell list each
  time". Die schon belegte Liste wird nicht aus den Optionen entfernt — regelwidrig wählbar.
* Nicht deklarierte Talente gehen weiter komplett an die KI (richtig: sie tragen echte
  Deutungsarbeit). Ein *zauber*-gewährendes Talent ohne Deklaration fiele aber in Fall A —
  dagegen steht nur der Deckungstest über `vault/feats`.

## Reihenfolge

1. 1e entscheiden (Senke fürs Attribut).
2. 1a–1d bauen, `npm run check`, `npm run schema:examples`. **Keine** Prompt-Änderung dabei —
   die Kette wird dadurch schon schneller, weil das Talent aus dem Eingang fällt.
3. Kette Gnom messen (`--runs 5`): das ist die Baseline *ohne* Prompt-Schnitt.
4. Stufe 2 inventarisieren und deklarieren.
5. 1f (Prompt-Schnitt), erneut messen.
6. Stufe 3 separat entscheiden.
