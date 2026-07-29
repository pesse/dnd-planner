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

## Erwartete Wirkung

**Gemessen (Ausgangsstand, Gnom-Kette, 5 Läufe):**

| | Latenz avg / median | sent / received |
|---|---|---|
| Pass A | 75,4 s / 78,1 s | 5 050 / 6 725 |
| Pass C | 127,4 s / 131,8 s | 14 974 / 11 287 |

**Geschätzt für Stufe 1 (nicht gemessen):**

* Eingang: −1 100 Zeichen Merkmalstext (≈ 280 Tokens) in jedem der drei Kettenschritte.
* System-Prompt nach 1f: ≈ −550 Tokens, ebenfalls dreifach.
* Ausgabe: zwei Manifest-Wahlen und ein Rider weniger (≈ 1 600 empfangene Tokens in Pass C)
  plus die Prosa dazu → **grob 15–20 % der erzeugten Tokens der Kette**.
* Qualität: die 3/5-Attributsfrage wird zu 5/5-deterministisch, und „Anzahl der wählbaren
  Zauber stimmt" kann nicht mehr kippen (der Fehler kostete dem Charakter einen Zaubertrick).

**Stufe 3** wäre der Faktor-Hebel (Pass C ist zwei Drittel der Wartezeit), Stufe 1 der
risikofreie.

## Umsetzungsstand Stufe 1 (2026-07-29)

Gebaut: Schema (`shared.ts`, `feat.ts`), Vault-Deklaration, `services/spellAccess.ts`,
`featurePrep.analysisGained`/`spellAccess`, zwei Antwort-Kanäle im Wizard
(`resolvedChoices` vs. `declaredAnswers`), Ledger in `assembleCharacter`, Oberfläche
(deklarierte Wahlen unabhängig vom KI-Status) und ein LLM-freier Test
(`evals/spellAccess.test.ts`).

## Reihenfolge

1. 1e entscheiden (Senke fürs Attribut).
2. 1a–1d bauen, `npm run check`, `npm run schema:examples`. **Keine** Prompt-Änderung dabei —
   die Kette wird dadurch schon schneller, weil das Talent aus dem Eingang fällt.
3. Kette Gnom messen (`--runs 5`): das ist die Baseline *ohne* Prompt-Schnitt.
4. Stufe 2 inventarisieren und deklarieren.
5. 1f (Prompt-Schnitt), erneut messen.
6. Stufe 3 separat entscheiden.
