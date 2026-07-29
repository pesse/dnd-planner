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

### 1a Schema

`FEATURE_CHOICE_KINDS` (`schemas/shared.ts:214`) um `spellAccess` erweitern und
`featureChoiceGrantSchema` (`:217`) um drei optionale Felder:

```ts
spellLists: z.array(z.string()).default([])      // ["cleric","druid","wizard"]; Länge 1 = fest, keine Frage
spellAbilities: z.array(z.enum(ABILITY_NAMES)).default([])  // Länge 1 = fest
spellPicks: z.array(z.object({ level: z.number().int().min(0), count: z.number().int().min(1) })).default([])
```

`spellPicks` ersetzt `count` für diese Art (`count` bleibt bei `featCategory`). Danach
`npm run schema:examples`.

### 1b Das Feld an das Talent hängen

`featSchema` (`schemas/feat.ts`) kennt `grantsChoice` noch nicht — hinzufügen, analog
`classProgression.ts:63`. Dann in `vault/feats/magic-initiate.json`:

```json
"grantsChoice": {
  "kind": "spellAccess",
  "spellLists": ["cleric", "druid", "wizard"],
  "spellAbilities": ["Intelligence", "Wisdom", "Charisma"],
  "spellPicks": [{ "level": 0, "count": 2 }, { "level": 1, "count": 1 }]
}
```

Das ist eine Vault-Änderung → gegen `vault/CLAUDE.md` prüfen (Provenance `srd-2024`) und
darauf achten, dass ein Re-Import aus Open5e sie nicht wegwirft (dieselbe Klasse Problem wie
`skillGrantMulticlass`).

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
  Spezialisierung des Hintergrunds (`featurePrep.ts:52`, `featSpecialisation`) kürzt `lists` auf
  einen Wert — bei Akolyth, Führer und Weiser (die drei Hintergründe mit
  `magic-initiate`) fällt die Listen-Frage damit ganz weg.
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

## Reihenfolge

1. 1e entscheiden (Senke fürs Attribut).
2. 1a–1d bauen, `npm run check`, `npm run schema:examples`. **Keine** Prompt-Änderung dabei —
   die Kette wird dadurch schon schneller, weil das Talent aus dem Eingang fällt.
3. Kette Gnom messen (`--runs 5`): das ist die Baseline *ohne* Prompt-Schnitt.
4. Stufe 2 inventarisieren und deklarieren.
5. 1f (Prompt-Schnitt), erneut messen.
6. Stufe 3 separat entscheiden.
