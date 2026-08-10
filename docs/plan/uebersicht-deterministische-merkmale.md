# Übersicht: Was fehlt noch zur deterministischen Merkmals-Mechanik?

> Bestandsaufnahme vom 2026-07-31, gezählt aus `vault/` (28 Klassen/Subklassen mit 250
> Merkmalen, 10 Spezies mit 56 Traits, 23 Talente). **Kein Umsetzungsplan** — eine Landkarte
> der offenen Modellierungsfragen. Der Umsetzungsweg steht in
> `docs/plan/plan-wahlen-deklarieren.md` (Stufe 0–2 fertig, 3–5 offen); diese Übersicht ist
> dessen Stufe-3-Triage, geschärft durch die Entscheidung:
>
> **Jeder merkmalsbasierte Wahl- und Grant-Mechanismus wird deterministisch, sofern er auf
> Charakter-Mechanik wirkt.** Größenwahl → deterministisch. Dunkelsicht-Reichweite → nicht,
> weil sie am Charakter nichts berechnet: sie ist Prosa.

## 0 · Das Kriterium ist eine Frage nach der SENKE

„Wirkt auf Charakter-Mechanik" ist genau dann entscheidbar, wenn der Charakter ein Feld hat,
in das der Wert fließt. Deshalb steht am Anfang jeder Zeile unten die Senke, nicht die Regel.

| Senke am Charakter | existiert | Deklarationsform |
|---|---|---|
| `skills[].prof` / `.exp` | ✅ | `grants.proficiencies.skills`, `kind: expertise` |
| `proficiencies.*` (Waffen/Rüstung), `*SaveProf` | ✅ | `grants.proficiencies` |
| `hpMax` je Stufe | ✅ | `grants.perLevel.hpMax` |
| `spells.*`, `masteries[]` | ✅ | `grantsSpells`, `kind: spellcasting/spellAccess/weaponMastery` |
| `personal.sizeCat`, `speed` | ✅ | **neu**: `grants.properties`, `kind: characterProperty` |
| `str/ges/kon/int/wei/cha` | ✅ (`Change` `ability`) | **fehlt** — keine Deklaration |
| `languages[]`, `tools[]` | ✅ (`Change` `language`/`toolProficiency`) | **fehlt** — keine Wahl-Form |
| `attacks[].modifiers` (Angriffs-/Schadensbonus) | ✅ | **fehlt** — nie deklarativ befüllt |
| `ac`, `initiative` | nur Freitext-Feld, keine Berechnung | offene Entscheidung |
| Vorräte (Wut, Tiergestalt, Zauberpunkte, Kanal, Zauberplätze) | ✅ abgeleitet aus `grantsResource` | ✅ deklariert |
| Resistenzen, Sinne, Bewegungsarten, Kreaturentyp, Tragkraft | ❌ kein Feld | offene Entscheidung |

Wo keine Senke existiert, ist „deterministisch machen" **zwei** Entscheidungen: erst ein
Charakterfeld (also `CHARACTER_VERSION`-Arbeit), dann die Deklaration. Das trennt die billigen
Fälle von den teuren.

## 1 · Abdeckungsstand

| Bibliothek | Merkmale | deklariert | Anteil |
|---|---|---|---|
| `vault/classes` | 250 | 27 | 11 % |
| `vault/species` | 56 | 5 (+ 18 `sheetValue`) | 9 % |
| `vault/feats` | 23 | 3 | 13 % |
| **gesamt** | **329** | **35** | **11 %** |

Deklariert sind heute ausschließlich die Muster, für die ein `kind` gebaut wurde:
Zauberwirken (8×), Waffenbeherrschung (5×), Kampfstil (5×), Zauberlisten (6×), Expertise (2×),
Zweigwahl (2×), Zauber-Zugang (1×), TP je Stufe (2×), Fertigkeits-Wahl (2×).

## 2 · Fehlende WAHL-Arten (`FEATURE_CHOICE_KINDS`)

### 2.1 `abilityIncrease` — der billigste offene Fall

**9 Vault-Fälle**, Senke existiert (`Change` `ability`), Vokabular existiert (`ABILITY_NAMES`).

| Fall | Form |
|---|---|
| `ability-score-improvement` | +2 auf eines **oder** +1 auf zwei |
| 7 Epic Boons | +1 auf eines, teils verengt (Str/Dex; Int/Wis/Cha) |
| `grappler` | +1 auf Str oder Dex |

Der Plan hatte das mit „kein Vault-Fall" abgelegt — das galt für Herkunfts-/Allgemein-Talente,
nicht für die Boons. Zwei Details, die keine Prompt-Regel je zuverlässig traf:
das **Maximum ist 30 statt 20** bei Boons, und die ASI-Form ist „2×1 oder 1×2", also keine
einfache Einzelwahl.

### 2.2 Werkzeug- und Sprachwahl

| Fall | Merkmal |
|---|---|
| 3 Handwerkszeuge | `crafter` |
| 3 Musikinstrumente | `musician` |
| „3 Fertigkeiten **oder** Werkzeuge" | `skilled` (heute als 3× Fertigkeit deklariert — **inhaltlich falsch**) |
| 2 Sprachen | Ranger `Deft Explorer` |
| 1 Sprache + Diebeszinken | Rogue `Thieves' Cant` |
| 1 Werkzeug je Hintergrund | alle 16 `vault/backgrounds` (heute Prosa im `benefit`) |

Blockierend ist hier nicht die Senke (beide `Change`-Ziele existieren), sondern das **fehlende
Vokabular**: `vault/tools` enthält Build-Skripte, keine Werkzeugliste, und die CLAUDE.md-Regel
sagt ausdrücklich „Werkzeuge und Sprachen bleiben deutscher Freitext". Damit ist die Frage:
Freitext-Wahl mit Vorschlagsliste, oder doch ein geschlossenes Vokabular (= die dritte
Übersetzungstabelle, die die Regel verbietet)?

### 2.3 Zauberwahl jenseits von `spellAccess`

`kind: spellAccess` kann „N Zauber vom Grad G aus Liste L". Nicht ausdrückbar:

| Fall | fehlender Parameter |
|---|---|
| Evoker `Evocation Savant` | Schule + Höchstgrad („2 Bannzauber ≤ Grad 2") |
| Bard `Magical Secrets`, Lore `Magical Discoveries` | Liste = Vereinigung mehrerer Klassen, Grad folgt der Stufentabelle |
| Warlock `Mystic Arcanum` | 1 Zauber Grad 6, wächst mit 7/8/9 auf höheren Stufen |
| Wizard `Signature Spells`, `Spell Mastery` | Optionen = **das Zauberbuch dieses Charakters** (Laufzeit, wie `expertise`) |

### 2.4 Zweigwahl-Fälle, die `optionList` heute nicht trägt

`optionList` funktioniert für Urtümlicher/Göttlicher Orden. Offen bleiben:

| Fall | warum nicht |
|---|---|
| Cleric `Blessed Strikes`, Druid `Elemental Fury` | passt formal — nur noch nicht redigiert |
| Hunter `Hunter's Prey`, `Defensive Tactics` | **pro Rast neu wählbar** → keine Aufbau-Entscheidung, gehört nicht ins Ledger |
| Goliath `Giant Ancestry` | Zweig ohne mechanische Konsequenz am Bogen (reine Aktions-Option) |
| Gnome `Gnomish Lineage` | Zweig **plus** Zauberattribut-Wahl in derselben Prosa → siehe 4.1 |
| Dragonborn `Draconic Ancestry` | Antwort ist Eingang für den TEXT zweier anderer Merkmale → siehe 4.2 |

### 2.5 Wachsender Options-Pool

Sorcerer `Metamagic` (2 aus 8, +1 auf Stufe 10/17) und Warlock `Eldritch Invocations`
(1, wachsend, mit Voraussetzungen und Austausch pro Stufe). Das ist kein `optionList`: die
Wahl **akkumuliert über Stufen**, das Kontingent kommt aus der Stufentabelle, und die Optionen
stehen als Prosa-Abschnitt im Klassentext, nicht als Merkmalsliste. Braucht eine eigene Form
(Options-Pool als Bibliotheks-Artefakt) oder bleibt bewusst KI-geführt.

### 2.6 Flow-eigene Wahlen ohne Deklaration

Subklassen-Wahl (14 Merkmale) und ASI/Epic-Boon-Merkmale (28) werden heute **am Namen** erkannt
(`isFlowOwnedChoiceFeature`, `services/levelUp.ts:90` — Regex auf „subclass", `ASI_HINTS`).
Sie tragen keine Mechanik, aber sie sind die letzten Namensheuristiken in der Kette. Eine
Deklaration „diese Wahl führt der Flow" (z.B. `kind: 'subclass'` / `featCategory: General`)
würde sie schließen — und ist Voraussetzung dafür, dass eine Homebrew-Klasse ohne das Wort
„Subclass" im Namen funktioniert.

## 3 · Fehlende GRANT-Felder (`featureGrantSchema`)

| Mechanik | Fälle | Senke | Aufwand |
|---|---|---|---|
| Feste Attributserhöhung | im SRD keiner (nur Wahl, → 2.1) | vorhanden | – |
| **Bewegungsrate additiv** | Ranger `Roving` (+10 ft), Monk `Unarmored Movement` (Tabellenspalte) | `speed` | klein, aber: `characterProperties.speedFeet` ist **setzend**; ein Bonus braucht eine zweite Form |
| **Angriffs-/Schadensbonus** | `archery` (+2 Fernkampf), `defense` (+1 RK), `two-weapon-fighting`, `great-weapon-fighting` | `attacks[].modifiers` — existiert, wird von keiner Deklaration befüllt | mittel |
| Rüstungsklasse-Formel | Barbar/Mönch `Unarmored Defense`, `draconic-resilience` | `ac` ist Freitext, wird nicht berechnet | groß (RK-Berechnung fehlt ganz) |
| Initiative-Bonus | `alert` (+Übungsbonus) | `initiative` ist Freitext | klein, sobald man das Feld berechnen will |
| Bewegungsarten (Fliegen/Klettern/Schwimmen) | Fairy `Flight`, Dragonborn `Draconic Flight`, Ranger `Roving` | **kein Feld** | Feld + Bogenfrage |
| Schadensresistenz | Dwarf, Draconic Ancestry, `boon-of-the-night-spirit`, Monk `Superior Defense`, Draconic Sorcery | **kein Feld** | Feld + Bogenfrage |
| ~~Ressourcen-Pools (Fokus, Wut, Glück, Kanalisierte Göttlichkeit)~~ | ~15 Merkmale, Zahl meist aus Stufentabellenspalte | **erledigt**: `grantsResource` → `services/resources/`, kein Charakterfeld nötig (nichts wird verbraucht) | — |

Die untere Hälfte dieser Tabelle ist die eigentliche Grundsatzfrage: **wie weit soll der
Charakterbogen rechnen?** Solange RK, Initiative und Resistenzen Freitextfelder sind, ist
„deterministisch" dort nicht erreichbar — nicht wegen der Deklaration, sondern weil es nichts
gibt, worauf sie wirken könnte.

## 4 · Strukturelle Grenzen (kein neues Feld, sondern eine Formfrage)

### 4.1 Ein Merkmal, mehrere Wahlen

`grantsChoice` ist **singulär**. Zwei Fälle sprengen das schon heute:

- Ranger `Deft Explorer` = Expertise-Wahl **+** 2 Sprachen
- Gnome/Elf-Abstammung = Zweigwahl **+** Zauberattribut

`spellAccess` hat das ad hoc gelöst (zweite Frage `spellaccess_*_ability`, `spellAccess.ts:96`).
Verallgemeinern hieße: `grantsChoice` wird eine Liste — oder jede `kind` trägt ihre
Zusatzfragen selbst weiter. Das ist die teuerste Einzelentscheidung dieser Übersicht, weil
`AnalysisChoice`, Ledger-Anker (`optionChoiceId` & Co.) und der Checkpoint daran hängen.

### 4.2 Verkettete Wahlen

Draconic Ancestry entscheidet den Schadenstyp von `Breath Weapon` **und** `Damage Resistance` —
drei Merkmale, eine Antwort. `options[].grants` kann Konsequenzen nur am **eigenen** Merkmal
tragen. Ohne eine Form „diese Antwort parametriert jenes Merkmal" bleibt der Fall genau der,
für den die KI-Kette gebaut wurde.

### 4.3 Wahl vs. Aufbau-Entscheidung

`isBuildDecision` unterscheidet heute richtig, aber die **pro-Rast neu wählbaren** Merkmale
(Hunter's Prey, Defensive Tactics, Fiendish Resilience, Circle-of-the-Land-Landart) haben gar
keine Modellierung: sie werden weder gefragt noch protokolliert, und ihre Grants gelten
unbedingt für alle Zweige. Das ist eine bewusste Vereinfachung — sie sollte als solche
deklarierbar sein, statt aus dem Fehlen einer Deklaration zu folgen.

### 4.4 Stufenabhängige Grants

`grants` gilt unbedingt, `perLevel` gilt je Charakterstufe. Nicht ausdrückbar: „ab Stufe X",
„Wert aus Tabellenspalte Y" (Martial Arts-Würfel, Unarmored Movement, Sneak Attack). Die
Spalten liegen als `levels[].columns` bereits im Vault — es fehlt nur die Verbindung
Merkmal → Spalte.

### 4.5 Verengung bei `expertise`

Wizard `Scholar` erlaubt Expertise nur aus 6 benannten Fertigkeiten. `kind: expertise` kennt
nur `count`. Ein `from`-Feld analog `skillGrant.from` fehlt.

## 5 · Bewusst Prosa (nach dem Kriterium **kein** Kandidat)

Dunkelsicht/Wahrer Blick-Reichweiten · Vorteil auf Rettungswürfe (Gnomish Cunning, Fey
Ancestry, Brave, Dwarven Resilience) · Kreaturentyp (Fairy) · Tragkraft (Powerful Build) ·
alle Aktions-Optionen (Wild Shape, Channel Divinity, Stonecunning, Adrenaline Rush …) ·
Neuwurf-/Vorteilsregeln (Lucky, Savage Attacker, Halfling Luck).

Merkregel für die Triage: **wenn kein Zahlenfeld des Bogens sich ändert, ist es `grants: {}`
plus Bogen-Notiz** — geprüft, ohne Wirkung. Das ist kein Verzicht, sondern die Zeile, die die
Abdeckung sichtbar macht.

## 6 · Kleine Befunde am laufenden Umbau

1. **`declarationCoverage.grantIsEmpty` kennt `properties` nicht.** Ein Merkmal, das *nur*
   Größe oder Bewegungsrate festlegt, zählt im Linter als „geprüft ohne Wirkung"
   (`services/declarationCoverage.ts:42` gegen `services/featureDeclaration.ts:359` — zwei
   Leer-Prädikate, eines vollständig, eines nicht).
2. **Drei Wege zur Größe gleichzeitig**: `sheetValue`-Trait (18 Merkmale),
   `services/speciesSize.ts` (Textparser als Fallback) und neu `grants.properties` /
   `kind: characterProperty`. Sobald der Vault redigiert ist, sollten zwei davon verschwinden
   — sonst ist unklar, wer gewinnt.
3. **`characterProperties.speedFeet` hat kein Wahl-Vokabular** (`PROPERTY_VOCABULARY` deckt nur
   `size`), und `characterPropertyAnswerChanges` verzweigt deshalb von Hand auf `size`. Beim
   zweiten wählbaren Zahlenwert wird das eine Sonderregel zu viel.
4. **Korrektur 6 des Plans steht noch offen**: `computeSubclassFeatures` projiziert auf
   `GainedFeature` — sobald eine Subklasse `grantsChoice` trägt, verliert sie ihre Wahl.
   Mit Blessed Strikes/Elemental Fury (2.4) wird das akut.

## 7 · Reihenfolge-Empfehlung (nur Sortierung, kein Plan)

1. `abilityIncrease` — 9 Fälle, Senke da, Vokabular da.
2. Verengung bei `expertise` (`from`) + `Scholar`/`Deft Explorer`-Teil.
3. Werkzeug-/Sprachwahl — erst die Vokabular-Entscheidung, dann der `kind`.
4. Batch-Redaktion `grants: {}` über die ~250 wirkungslosen Merkmale (macht die Lücke sichtbar).
5. Mehrfachwahl je Merkmal (4.1) — Voraussetzung für Abstammungen und `Deft Explorer`.
6. Charakterfelder: Resistenzen / Bewegungsarten / berechnete RK+Initiative — eigene
   Entscheidung, eigener `CHARACTER_VERSION`-Schritt.
7. Verkettete Wahlen (4.2) und Options-Pools (2.5) — die zwei Fälle, für die es gute Gründe
   gibt, sie bei der KI zu lassen.
