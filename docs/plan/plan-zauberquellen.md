# Zauberquellen — das Zaubersystem auf eine Abstraktion stellen

> Umsetzungsplan, erstellt am 2026-08-04, noch nicht begonnen. Folgearbeit zu
> `plan-zauberwirker-vereinfachung.md`: dort wurde Magic Initiate als **deklarierter
> Zauber-Zugang** (`grantsChoice.kind='spellAccess'`) aus der KI-Kette gezogen. Dieser Plan
> zieht die Konsequenz daraus — dieselbe Form trägt auch das Klassen-Zauberwirken.
>
> Alpha-Stand: Abwärtskompatibilität ist **kein** Kriterium. Die sechs Charaktere in
> `vault/characters/` werden von Hand nachgezogen, es gibt keinen `CHARACTER_UPGRADES`-Schritt.
> Zeilennummern: Stand `main` @ c04be0c.

## Befund

`services/spellAccess.ts` beschreibt einen Zauber-Zugang als `{lists, abilities, picks[{level,count}]}`
und erzeugt daraus Fragen (`:101`), Werte (`:180`) und Bogenzeilen (`:204`). Das
Klassen-Zauberwirken hat dieselbe Form: Magier-`Spellcasting` ist
`{lists:['wizard'], abilities:['Intelligence'], picks:[{0,3},{1,4}]}`. Es unterscheidet sich in
**Parametern**, nicht in **Art** — zwei Dinge kommen hinzu, Kontingente aus der Stufentabelle
statt aus der Deklaration, und Zauberplätze.

Trotzdem gibt es dafür drei Services mit je eigenem Pfad durch den Flow:

| Datei | deckt ab | eigener Pfad |
|---|---|---|
| `services/spellcasting.ts` (209) | Klassen-Zauberwirken | `SpellcastingOffer`, `PrepRegime` |
| `services/spellAccess.ts` (226) | Talent/Trait-Zugänge | `SpellAccessGrant`, eigene Choice-Ids |
| `services/grantedSpells.ts` (85) | immer-vorbereitete Listen | Markdown-Parser, eigener Filter |

Das ist der Fall, den `CLAUDE.md` unter „Never build a second mechanism" verbietet — hier
allerdings gewachsen, nicht gebaut: jeder Service war für sich richtig geschnitten, die
Gemeinsamkeit wurde erst mit `spellAccess` sichtbar.

### Was daran heute nachweislich falsch ist

1. **Multiclass-Slots existieren nicht.** `casterRowOf` (`characterSpellPicks.ts:22`) gibt bei
   zwei Zauberwirkern `null` zurück; geschrieben werden Slots aus **einer** `prog`
   (`wizard/assembleCharacter.ts:226`, `levelUp.ts:167`). Der Slot-Block eines Magier/Kleriker
   ist schlicht falsch. Die kombinierte Zauberwirkerstufe (voll 1, halb ÷2, Drittel ÷3) ist
   nirgends berechnet.
2. **`PrepRegime` faltet zwei Achsen in eine.** `'spellbook' | 'open-list' | 'fixed-list'`
   (`spellcasting.ts:17`) mischt Zwei-Stufigkeit mit Tauschtakt und bildet den Takt gar nicht ab.
   Deshalb sitzt der Paladin (Lange Rast, einer) im selben Eimer wie der Barde (Stufenaufstieg,
   einer), und die Herleitung ist ein Klassennamen-Regex (`:24`).
3. **Der Zaubereintrag hat keine Herkunft.** `characterSchema.ts:41` kennt `name`/`sourceKey`/
   `prepared` — nicht, *welche Quelle* den Zauber verschafft hat. Also ist „gewährt, zählt nicht"
   nicht von „gewählt" unterscheidbar, kein Kontingent prüfbar, und im Multiclass ist unklar,
   welcher Zauber zu welcher Klasse gehört.
4. **Ein Charakter hat genau ein Zauberattribut.** `characterSchema.ts:48`. Ein Magier mit Magic
   Initiate (WEI) und Fiendish Legacy (CHA) hat drei SGs; zwei davon existieren nur zur
   Anzeigezeit (`spellAccessValues`) und gehen nirgends in den Zustand ein.
5. **Abgeleiteter Zustand wird als Wahrheit gespeichert.** `slots[].total` ist ein handgetipptes
   Zahlenfeld (`SpellBlock.svelte:214`), `saveDC` wird berechnet **und** geschrieben. Beides
   veraltet stillschweigend.
6. **Der Tauschtakt fehlt vollständig.** Aus dem Vault belegt (`vault/classes/*.json`,
   „Changing Your Prepared Spells"):

   | Klasse | Zauber Grad 1+ | Zaubertricks |
   |---|---|---|
   | Kleriker, Druide, **Magier** | Lange Rast, **alle** ersetzbar | Aufstieg / **Magier: Lange Rast** |
   | Paladin, Waldläufer | Lange Rast, **einer** | — |
   | Barde, Zauberer, Hexenmeister | **Aufstieg**, einer | Aufstieg |

## Das Modell: die Zauberquelle

Eine `CastingSource` ist alles, was Zauber verschafft — Klasse, Unterklasse, Spezies-Trait,
Talent, Anrufung, Gegenstand. Ihre Felder sind genau die sieben Achsen, auf denen sich die
Mechaniken unterscheiden: Kontingent-Quelle, Pool, Tauschtakt, Zwei-Stufigkeit, Wirk-Ressource,
Attributbindung, Bezugsstufe.

**Die Deklaration hängt am Merkmal, nicht an einer erfundenen Quellen-Entität.** `grantsCasting`
wird das vierte Feld in `featureDeclarationFields` (`schemas/featureChoice.ts:119`) und erreicht
damit Klassenmerkmal, Trait und Talent durch denselben Spread wie `grants`/`grantsChoice`/
`grantsSpells`. Die Identität einer Quelle **ist** der Merkmals-Key
(`srd-2024_wizard_spellcasting`).

Was daraus folgt: `origin`, `labelDe` und `levelRef` stehen **nicht** in der Deklaration.
`labelDe` ist `nameDe` des Merkmals; `origin` kennt der Flow, nicht der Vault („a trait does not
know it is a trait"); und `levelRef` ist bereits eine Regel dieses Repos — Klassenmerkmal →
KLASSEN-Stufe, Trait/Talent → CHARAKTER-Stufe. Ein Feld dafür wäre eine zweite, abweichbare
Fassung derselben Aussage.

```ts
/** Vierter Eintrag in featureDeclarationFields — was ein Merkmal an Zauberwirken gewährt. */
interface CastingGrant {
  ability?: AbilityBinding;            // fest | Wahl aus N
  quotas?: Quota[];
  patches?: QuotaPatch[];              // amendiert die Quota eines ANDEREN Merkmals
  swap?: SwapRule;                     // Vorgabe, je Quota überschreibbar — cast NICHT, siehe unten
}

/** Ritual Adept ergänzt das Wirken am Zauberbuch, Magische Geheimnisse den Pool der Vorbereitung. */
interface QuotaPatch {
  feature: string;                     // Merkmals-Key
  quota: string;
  set: Partial<Quota>;
}

/** EIN Gradband. Was `spellPickGrantSchema` (schemas/featureChoice.ts:37) schon ist — plus Pool und Wirkung. */
interface Quota {
  id: string;                          // nur INNERHALB des Merkmals eindeutig
  since?: number;                      // Vorgabe: min(gainedAt) des Merkmals — nur nötig, wenn EIN
                                       // Merkmal über mehrere Stufen Verschiedenes gibt (Mystic Arcanum)
  when?: Record<string, string>;       // Zweig-Bedingung auf dem optionList DIESES Merkmals
  tier: 'known' | 'prepared';          // 'known' = Bestand, nicht wirkbar
  levels?: number[] | 'slotted' | 'cantrip-or-slotted';   // entfällt bei pool.names — der Grad steht am Zauber
  count: { column: string } | { base: number; perLevel?: number };
  pool: SpellPool;
  swap?: SwapRule;
  cast: CastOption[];                  // PFLICHT, keine Vererbung von der Quelle
}

interface SpellPool {
  lists?: string[];                    // woraus gewählt (und getauscht) werden darf
  listMode?: 'choose-one' | 'union';   // Vorgabe 'union'; 'choose-one' = eine Liste je Quelle
  schools?: SpellSchool[];             // Eldritch Knight
  from?: { feature?: string; quota: string };   // Pool IST eine andere Quota — das Zauberbuch
  names?: string[];                    // Vorgabe ohne Wahl; mit `lists` zusammen = Tauschpool
}

type CastOption =
  | { kind: 'slots'; pool: 'standard' | 'pact' }
  | { kind: 'uses'; per: 'long-rest' | 'short-rest'; count: number | 'proficiency-bonus' }
  | { kind: 'at-will' }
  | { kind: 'ritual'; requiresPrepared: boolean };   // Ritual Adept = false

/** EIN Vokabular für beide Felder — die Anzahl steckt im Wert, auch beim Zaubertrick. */
type SwapCadence = 'none' | 'level-up-one' | 'long-rest-one' | 'long-rest-all';
interface SwapRule { spells?: SwapCadence; cantrips?: SwapCadence }
```

`count` hat genau zwei Formen: aus der Stufentabelle (`{column}`) oder als Formel
`base + perLevel × (Stufe − 1)`. Das Zauberbuch ist `{base: 6, perLevel: 2}` — und **nur eine
Untergrenze**, weil Abschreiben aus Schriftrollen es darüber hinaus wachsen lässt.

`pool.fromQuota` ist der Angelpunkt: **Zwei-Stufigkeit ist keine Eigenschaft der Klasse, sondern
eine Pool-Komposition.** Das Zauberbuch ist eine Quota `book` (`tier:'known'`), die Vorbereitung
eine Quota `prepared` mit `pool.fromQuota:'book'`. Damit fällt `PrepRegime` ersatzlos weg.

### Die Mechaniken als Koordinaten

| Mechanik | im Modell |
|---|---|
| Zauberbuch | zwei Quotas am selben Merkmal, `prepared.pool.from={quota:'book'}` |
| Ritual Adept | eigenes Merkmal, `patches` setzt `cast` der `book`-Quota |
| Spell Mastery / Signature Spells | eigene Merkmale, `pool.from={feature:'…_spellcasting', quota:'book'}` |
| Kleriker/Druide | eine Quota, `swap.spells='long-rest-all'` |
| Paladin/Waldläufer | dieselbe, `swap.spells='long-rest-one'` |
| Barde/Zauberer/Hexenmeister | dieselbe, `swap.spells='level-up-one'` |
| Barde ab 10 (Magical Secrets) | eigenes Merkmal, `patches` auf `bard_spellcasting/prepared`: `pool.lists` vierelementig — **kein Zauber mehr** |
| Magical Discoveries (Lore) | eigenes Merkmal mit eigener Quota — echte Zusatzzauber |
| Mondzirkel / Domänenzauber | Quota mit `pool.names`, `since` je Tabellenzeile |
| Paktmagie | `cast:[{slots:'pact'}]`; Kurze Rast hängt am Pool, nicht am Zauber |
| Mystic Arcanum | vier Quotas à `count:1`, je `cast:[{uses:1,per:'long-rest'}]` |
| Elfenlinie / Fiendish Legacy | `levelRef:'character'`, `pool.names`, `cast:[{uses:1,LR},{slots:'standard'}]` |
| Magic Initiate | `count:{declared}`, `listMode:'choose-one'`, `ability` = Wahl aus drei |
| Spell Mastery (18) | `count:1` je Grad 1/2, `pool.fromQuota:'book'`, `cast:[{at-will}]` |
| Signature Spells (20) | `count:2` Grad 3, `cast:[{uses:1,per:'short-rest'}]`, ohne `countsAgainst` |
| Ritual Adept | `cast:[{ritual, requiresPrepared:false}]` auf der `book`-Quota |
| Eldritch Knight / Arcane Trickster | `origin:'subclass'`, `pool.schools` |
| Multiclass | mehrere Einträge in `sources[]`; Poolung erst in `slots.ts` |

## Beispiele

`docs/plan/zauberquellen-beispiele.json` enthält **13 `grantsCasting`-Deklarationen**, jede mit
dem Vault-Pfad des Merkmals, an dem sie hängen würde: Magier (Spellcasting, Ritual Adept, Spell
Mastery, Signature Spells), Hexenmeister (Pact Magic, Mystic Arcanum), Barde (Spellcasting,
Magical Secrets), Zauberer, Kolleg des Wissens, Fee, Elf, Magic Initiate. Alle Keys sind gegen
den echten Vault geprüft.

Dazu unter `exampleCharacters` zwei durchgerechnete Fälle.

### Fee-Zauberer, Charakterstufe 5

`class:sorcerer` + `species:fairy` an einem Bogen. Zeigt die Persistenzseite, die aus den
Quellendefinitionen allein nicht ablesbar ist:

- **Zwei Quellen, ein Slot-Pool.** Feenmagie wirkt *Faerie Fire* und *Enlarge/Reduce* wahlweise
  gratis (1×/Lange Rast, je eigener Zähler) oder „using any spell slots you have" — und das sind
  die Slots des **Zauberers**. Genau deshalb steht `pools` oben und nicht in der Quelle.
- **Zwei Zauberattribute, unabhängig geführt.** Der Zauberer hat Charisma fest, die Fee wählt aus
  Int/Wei/Cha. Beide SG sind hier 14 — aber nicht, weil sich zwei Quellen ein Feld teilen, sondern
  weil der Spieler zweimal Charisma gewählt hat. Ein Wei-Fee-Zauberer bekäme zwei SG, ohne dass
  sich am Modell etwas ändert.
- **Die Fee speichert keine einzige Zauberwahl.** Ihre drei Zauber stehen als `pool.names` in der
  Quelle; persistiert werden nur `bindings.ability` und ein Verbrauchszähler. Picks entstehen nur
  dort, wo es wirklich etwas zu wählen gibt — das ist die Persistenz-Umkehr an einem konkreten
  Fall.
- **Zwei Bezugsstufen, hier zufällig gleich.** Die Fee indiziert die Charakterstufe, der Zauberer
  die Klassenstufe. Bei einer Einzelklasse fällt das zusammen; ein Zauberer 3 / Hexenmeister 2
  hätte trotzdem *Enlarge/Reduce* noch nicht, aber die Fee-Stufe-3-Zeile schon.

### Barde (Kolleg des Wissens), Klassenstufe 10

Der Fall, an dem die beiden Erweiterungsarten nebeneinander stehen — und der eine bewusste
Abweichung vom Regeltext sichtbar macht.

- **Magische Geheimnisse verbreitern den Pool, sie geben nichts.** `class:bard` hat auf Stufe 10
  15 vorbereitete Zauber (auf Stufe 9 waren es 14) — dieselbe Quota-`id`, nur mit `since:10` und
  vierelementiger `pool.lists`. Im Beispiel ist *Wall of Force* (Magier-Liste) einer der 15,
  nicht der sechzehnte.
- **Magische Entdeckungen geben zwei Zauber obendrauf.** `subclass:college-of-lore` ist eine
  eigene Quelle mit eigener Quota — *Counterspell* und *Spirit Guardians* zählen nicht gegen die
  15. Zwei Mechanismen, die im Regeltext leicht verwechselt werden, sind hier strukturell
  verschieden, ohne dass es dafür ein Unterscheidungsfeld braucht.
- **`levels: 'cantrip-or-slotted'`** kommt aus dem Wortlaut der Entdeckungen („must be a cantrip
  or a spell for which you have spell slots"). Zweites und letztes Sentinel neben `'slotted'`.

**Bewusste Abweichung, die dieses Beispiel aufdeckt:** RAW gilt die Pool-Verbreiterung nur für die
*neu hinzukommenden* Zauber (auf Stufe 10 also für genau **einen** der 15) und für später
ersetzte. Das `since:10`-Modell verbreitert den Pool für alle 15 — der Picker böte die vier Listen
auch für Zauber an, die auf Stufe 3 gewählt wurden. Präzise wäre nur mit einem Stufenstempel je
Pick zu haben. Das fällt in dieselbe Schublade wie die Nicht-Durchsetzung des Tauschtakts (siehe
„Nicht Teil dieses Plans"): die App plant, sie schiedsrichtert nicht. Es muss aber eine
Entscheidung sein, kein Versehen.

**Wichtig zur Einordnung:** das ist die **aufgelöste Laufzeitform**, nicht das Vault-Format. Der
Vault bleibt kompakt — die Elfen-Abstammung steht dort als *drei* `optionList`-Optionen mit je
drei Zaubern und wird vom Resolver zu *neun* `when`-gebundenen Quotas expandiert. Wer die
Beispiel-JSON von Hand pflegen müsste, hätte den Resolver nicht gebaut.

Die Beispiele haben den Entwurf an sechs Stellen korrigiert:

1. **`cast` ist Pflicht an jeder Quota, ohne Vererbung von der Quelle.** Spell Mastery wirkt
   *at will*, während dieselbe Quelle sonst Slots verbraucht; Zaubertricks sind **immer**
   `at-will`. Eine Quellen-Vorgabe wäre damit für die häufigste Quota-Art jeder Zauberklasse
   systematisch falsch — beim Magier überschreiben alle sechs Quotas, die Vorgabe wäre toter
   Code, der genau dort zuschlägt, wo man ihn vergisst. Ein fehlendes `cast` muss ein Typfehler
   sein, kein stilles Erben („a grant field without a sink is a compile error").

   **`swap` bleibt vererbbar**, und die Asymmetrie ist begründet: `SwapRule` hat zwei
   unabhängige Unterfelder, und eine Quota liest immer nur eines (Trick-Quota → `cantrips`,
   Zauber-Quota → `spells`). Beim Magier ist `{spells:'long-rest-all', cantrips:'long-rest-one'}`
   für beide Arten zugleich richtig. Bei `cast` gibt es keine solche Aufteilung.

   Beide Felder teilen sich **ein** Vokabular (`SwapCadence`). Ein eigenes für Zaubertricks
   (`'level-up'` statt `'level-up-one'`) verschwiege die Anzahl, die im Regeltext ausdrücklich
   dasteht: „you can replace **one** of your cantrips". Jede Trick-Tauschregel im 2024er
   Regelwerk ist „einer" — Klassen beim Stufenaufstieg, Magier und Hochelf nach Langer Rast.
2. **`since` an der Quota**, gleiche `id` mehrfach, höchstes passendes `since` gewinnt. Das trägt
   Magical Secrets (Pool-Verbreiterung *ohne* Zusatzzauber), Mystic Arcanum (11/13/15/17), Spell
   Mastery (18), Signature Spells (20) und die Tabellenzeilen von Mondzirkel/Domäne — mit **einem**
   Mechanismus.
3. **`countsAgainst` gestrichen.** Jede Quota hat ihr eigenes Kontingent, damit ist „zählt nicht
   gegen die Vorbereitung" automatisch wahr. Beim Ausformulieren fand sich kein Fall, in dem eine
   Quota das Budget einer anderen verbraucht.
4. **`pool.names` + `pool.lists` zusammen** = Vorgabe plus Tauschpool. Der Hochelf *kennt*
   Prestidigitation, darf es aber nach jeder Langen Rast gegen einen Magier-Trick tauschen. Bei
   gesetztem `names` entfällt `levels` — der Grad steht am Zauber.
5. **`uses.count` braucht `'proficiency-bonus'`.** Der Waldgnom wirkt *Speak with Animals*
   übungsbonus-oft pro Langer Rast, nicht einmal.
6. **Zweigwahlen werden gelesen, nicht zweitgespeichert.** `when: {option: 'High Elf'}` bezieht
   sich auf das `grantsChoice.optionList` **desselben** Merkmals, dessen Antwort schon im
   Merkmals-Ledger steht. Kein `bindings`-Block, kein Fremdverweis. Nur `ability` und `list` —
   Antworten, die es heute nirgends gibt — landen in `spellcasting.sources[].bindings`.

7. **`since` ist meistens überflüssig**, weil `gainedAt` am Merkmal schon sagt, ab welcher Stufe
   es gilt. Ausgeschrieben wird es nur, wo **ein** Merkmal über mehrere Stufen Verschiedenes gibt:
   Mystic Arcanum (`gainedAt: [11,13,15,17]`, vier Grade) und die Tabellen von Fee/Elf/Mondzirkel.
   Vorgabe ist `min(gainedAt)`.

8. **Die leere `cast`-Liste ist zulässig und aussagekräftig.** Das Zauberbuch für sich ist nicht
   wirkbar (`cast: []`); erst Ritual Adept patcht die Ritual-Option hinein. Damit ist die Wirkung
   dieses Merkmals sichtbar, statt in der Basis-Deklaration mitgedacht zu sein.

## Persistenz: umkehren, und pro Quelle

Der Charakter hält nur noch, was eine **Entscheidung des Spielers** ist. Quellen, Kontingente,
Pools, Slots, SG, Angriffsbonus, Immer-vorbereitet-Listen und Bogenzeilen entstehen beim Laden
aus `classes[]`/`species`/`feats[]` + Vault. Das ist dieselbe Doktrin, die der Charakter für
Klasse, Volk und Talente bereits anwendet (Links + Laufzeitauflösung); Zauber sind die letzte
Stelle, an der die App abgeleiteten Zustand einfriert.

```ts
spellcasting: {
  // Geteilte Ressourcen — NICHT pro Quelle: im Multiclass speisen alle Klassen denselben Pool.
  pools: {
    standard: { used: number[] },      // Index 0 = Grad 1
    pact:     { used: number },
  },
  // Quellenbesitz: stirbt mit der Quelle.
  sources: Record<string, {
    bindings: { ability?: AbilityName; list?: string },
    picks:    Record<string /* quotaId */, SpellRef[]>,
    uses:     Record<string /* quotaId */, number>,
  }>,
  // Homebrew-Ausweg, bewusst schmal.
  manual?: { slotTotals?: number[]; extra?: SpellRef[] },
}
```

Die Trennlinie ist **geteilte Ressource vs. Quellenbesitz** — nicht „Zustand vs. Wahl". Slots
sind geteilt (Multiclass), Freiwirkungen gehören je einer Quota (Mystic Arcanum hat vier
unabhängige). Ein flaches `uses: Record<string, number>` bräuchte zusammengesetzte Schlüssel und
wäre wieder eine implizite Beziehung.

`(source, quota)` als Pick-Schlüssel ersetzt zugleich die `encodePick`-Strings
(`spellcasting.ts:154`) **und** die Id-Gymnastik in `spellAccess.ts:82`, die die Liste in die
Choice-Id kodiert, damit eine Auswahl beim Listenwechsel verfällt. Nested ist das eine lokale
Invalidierung.

### Zwei Fallen

**Die Quellen-Id ist der Merkmals-Key — aber instanz-stabil.** Magic Initiate ist mehrfach nehmbar
(„choosing a different list"). Der blanke Key `srd-2024_magic-initiate` ließe die zweite Instanz
die erste überschreiben; die Laufzeit-Id trägt deshalb einen Zusatz aus dem Merkmals-Ledger-Eintrag
(`character.features[]`). Für alles Nicht-Wiederholbare — Klassenmerkmale, Traits — **ist** der Key
die Id, ohne Zusatz.

**Nie aufgrund einer fehlgeschlagenen Auflösung aufräumen.** Ist die Bibliothek beim Laden nicht
verfügbar, löst der Resolver weniger Quellen auf; ein „unbekannte Quelle → löschen" beim nächsten
Speichern vernichtet dann die Auswahl. Verwaiste Blöcke bleiben stehen und werden nur bei
expliziter Nutzeraktion entfernt.

## Modulschnitt

```
services/spellcasting/
  source.ts     CastingSource, Quota, SpellPool, CastOption, SwapRule
  resolve.ts    Klassen/Traits/Talente/Deklaration → CastingSource[]   (die EINE Auflösung)
  quota.ts      Quota × Stufe → { count, levels, pool }
  slots.ts      Standard-Pool (multiclass-kombiniert) + Pakt-Pool
  state.ts      sources + persistierte Picks → SpellcastingState
  project.ts    State → Bogen | KI-Kontext | offene Wahlen
```

Darin gehen auf: `spellcasting.ts`, `spellAccess.ts`, `grantedSpells.ts`, `characterSpellPicks.ts`
(635 Zeilen). `grantedSpells.ts` bleibt als Markdown-Parser erhalten, verliert aber seinen eigenen
Flow-Pfad — es wird ein Quota-Produzent (`pool.names`) unter vielen. `spellAccessChoices` wird
generisch `openChoices(source)`.

Was ersatzlos verschwindet: `PrepRegime`, `OPEN_LIST_CLASSES` (`:24`), `isSpellbookClass` (`:59`),
`CASTING_FEATURE_NAMES` (`:51`), `buildSpellSelection` (`:175`), `spellPickChoiceId` (`spellAccess.ts:82`).
`SPELLBOOK_START_SPELLS` überlebt als `QuotaCount` der Buch-Quota — und **als Untergrenze**: das
Abschreiben aus Schriftrollen kann das Buch über `6 + 2×(Stufe−1)` hinaus wachsen lassen, die
heutige Formel (`:137`) ist als Obergrenze falsch.

## PDF: ausdrücklich nicht Teil dieses Plans

Das Bogen-Template ist nicht für mehrere Zauberquellen ausgelegt (ein SG, ein Attribut, neun
Slot-Felder) und wird ohnehin neu gedacht. Der Export darf hier aber nicht brechen:
`pdf/characterExport.ts:310` liest `sp.slots`, und dieses Feld verschwindet.

Deshalb bekommt `project.ts` **eine** zusätzliche, ausdrücklich befristete Ausgabe:

```ts
/** ÜBERGANG: die flache Alt-Form für den PDF-Export, gespeist aus der primären Quelle.
 *  Fällt mit der Template-Neufassung weg — keine zweite Projektion aufbauen. */
export function legacyFlatView(state: SpellcastingState): CharacterSpellsFlat
```

Primäre Quelle = die Klassen-Quelle mit der höchsten Klassenstufe. Der Export bleibt damit
unverändert und ungetestet-stabil, und die Template-Arbeit ist eine eigene Aufgabe.

## Reihenfolge

Nach Stufe 2 steht fest, ob das Modell die Regeln trifft — und es ist noch nichts weggeworfen.

### Stufe 1 — rein additiv, kein UI
- [ ] `source.ts`, `quota.ts`, `slots.ts`, `resolve.ts` neu, nichts gelöscht
- [ ] `slots.ts`: kombinierte Zauberwirkerstufe + Pakt-Pool daneben
- [x] **`grantsCasting` als viertes Feld in `featureDeclarationFields`** (2026-08-04) —
      `schemas/casting.ts` neu, in `featureChoice.ts` eingehängt. **Musste vor die Vault-Arbeit**:
      Zod strippt unbekannte Keys, ohne Schema hätte der erste Speichervorgang im Klassen-Editor
      die Deklarationen wieder gelöscht.
- [x] **Alle 35 Deklarationen im Vault** (2026-08-04) — erst 13 aus den Beispielen, dann die
      Inventur über den ganzen Bestand: die vier fehlenden Kern-Zauberwirken (Kleriker, Druide,
      Paladin, Waldläufer), sechs Immer-vorbereitet-Tabellen (Mond-/Landzirkel, Lebensdomäne,
      Drachenmagie, Unhold, Hingabe), sieben Einzelzauber-Merkmale (Göttlicher Ansturm, Treues
      Reittier, Bevorzugter Feind, Worte der Schöpfung, Patron kontaktieren, Mondlichtschritt,
      Drachengefährte), die zwei Extra-Zaubertricks (Göttlicher Orden, Urtümliche Ordnung) und
      drei Spezies-Merkmale (Gnom, Tiefling ×2). Geprüft: alle parsen, alle `when`-Werte treffen
      ein `optionList` am selben Merkmal, alle `patches`/`from`/`sameAs`-Keys existieren,
      `npm run verify` grün, `build_packs.py --dry-run` 0 unklassifiziert.

Vier Schema-Erweiterungen, die die Inventur erzwungen hat — jede mit genau einem Regelfall:

| Feld | Warum | Fall |
|---|---|---|
| `pool.fromDescTable` | Namen bleiben im `desc`, kopieren liefe beim Re-Import auseinander | die sechs Kreis-/Domänen-Tabellen |
| `count` optional | fester Pool = alles gewährt; eine Zahl daneben wäre die Listenlänge doppelt | Elf, Fee, Tiefling, alle Einzelzauber |
| `uses.count` als Union | freie Wirkungen hängen an Tabelle oder Attribut | Bevorzugter Feind (`{column}`), Mondlichtschritt (`{abilityMod}`), Waldgnom (`'proficiency-bonus'`) |
| `ability.sameAs` | „uses the same spellcasting ability you use for your Fiendish Legacy trait" | Anderweltliche Präsenz |

**Eine dokumentierte Entscheidung ist damit umgekehrt:** `plan-zauberwirker-vereinfachung.md`
hielt die Gnomische Abstammung ausdrücklich beim Modell, weil ihre Zauber am Zweig hängen und
„deterministisches Zaubernamen-Fischen im `desc`" ein Rückschritt wäre. Das Argument trifft eine
*Deklaration* nicht — Elf und Tiefling machen es längst so. Der Gnom hat jetzt `optionList` +
`grantsCasting` und fliegt aus dem KI-Eingang; `tests/integration/sheetValueTraits.test.ts` ist
entsprechend nachgezogen.

**Bewusst nicht deklariert** (Erwähnung ist keine Gewährung): Göttliches Eingreifen (wählt den
Zauber erst beim Wirken, kein vorab gewählter Pool), Natürliche Erholung und Wilder Begleiter
(freie Wirkung eines *ohnehin* vorbereiteten Zaubers bzw. Platzverbrauch), Magische Gegenstände
benutzen (Gegenstände sind außerhalb dieses Plans), Schattenkünste (die Vault-Datei trägt einen
⚠️-Vorbehalt „FROM MEMORY / NOT SRD" — unbestätigter Inhalt wird nicht deklariert).
- [ ] `resolve.ts` liest `grantsCasting`, wendet `patches` an, leitet `origin`/`labelDe`/`levelRef`
      aus der Herkunft ab; die alten Pfade (`grantsChoice.kind='spellcasting'|'spellAccess'`,
      `grantsSpells`) und die Namens-Fallbacks bleiben, solange der Vault nicht deklariert
- [ ] `quota.ts` löst `since` (Vorgabe `min(gainedAt)`), `when` (optionList desselben Merkmals)
      und `pool.from` (auch merkmalsübergreifend) auf
- [ ] Tests in `tests/integration` gegen den echten Vault: je Klasse die Quotas und der
      Tauschtakt auf Stufe 1, 5, 11, 20
- [ ] `zauberquellen-beispiele.json` als Fixture: die 13 Deklarationen müssen zu den erwarteten
      Quellen auflösen, und `state.ts` (Stufe 2) die zwei Beispielcharaktere reproduzieren

### Stufe 2 — Verifikation gegen den Bestand
- [ ] `state.ts`, noch ohne Schreibpfad
- [ ] Diff-Lauf über die sechs Charaktere in `vault/characters/`: abgeleiteter Zustand gegen
      gespeichertes `character.spells`. Jede Abweichung ist entweder ein Modellfehler oder ein
      Bestandsfehler — beides muss benannt werden, bevor es weitergeht

### Stufe 3 — Lesen umstellen
- [ ] `project.ts` inkl. `legacyFlatView`
- [ ] `SheetSpellBlock.svelte` und `characterContext.ts:182ff` lesen die Projektion
- [ ] `characterExport.ts` bleibt unangetastet, hängt an `legacyFlatView`

### Stufe 4 — Schema umkehren
- [ ] `characterSchema.ts`: `spells` → `spellcasting` (siehe „Persistenz")
- [ ] `SpellBlock.svelte`, `SpellPickModal.svelte`, `wizard/assembleCharacter.ts`, `levelUp.ts`
      schreiben Picks statt abgeleiteter Werte
- [ ] Slot-Zahlenfelder aus dem Editor entfernen (`manual.slotTotals` bleibt als Ausweg)
- [ ] die vier Alt-Services löschen
- [ ] die sechs Vault-Charaktere von Hand nachziehen, **kein** `CHARACTER_UPGRADES`-Schritt

### Stufe 5 — Deklarationsdurchgang im Vault
- [ ] `grantsCasting` an allen Zauber-Merkmalen ergänzen (9 Klassen, Unterklassen, Spezies,
      Talente) — die 13 Beispiele sind die Vorlage
- [ ] `grantsChoice.kind='spellcasting'` und `'spellAccess'` sowie `grantsSpells` entfallen; sie
      gehen in `grantsCasting` auf
- [ ] erst danach fallen die Namens-Fallbacks aus `resolve.ts`

## Risiken

- **Die Deklarationsdeckung ist heute dünn.** `grantsChoice.kind='spellcasting'` trägt nur den
  `kind`. Bis Stufe 5 braucht `resolve.ts` weiterhin Spaltennamen-Heuristik — der Gewinn „keine
  Namenserkennung mehr" ist verzögert, nicht sofort.
- **`patches` ist ein Fremdverweis zwischen Vault-Einträgen** und damit die einzige Stelle, an der
  ein Merkmal etwas über ein anderes wissen muss. Ein Tippfehler im `feature`-Key wirkt still (das
  Merkmal gewährt dann nichts), deshalb muss `resolve.ts` einen unauflösbaren Patch **melden**, wie
  `unreadableSpellGrant` es heute für unlesbare Tabellen tut.
- **Größter Umbau bisher.** ~1500 Zeilen über vier Services, drei Komponenten, Wizard, Level-Up
  und KI-Kontext. Die Stufung hält den Zauberblock durchgehend benutzbar; ein Umbau in einem Zug
  täte das nicht.
- **Abgeleitete Slots verlieren die Handeingabe.** Für Homebrew-Klassen ohne Progression im Vault
  ist `manual.slotTotals` der einzige Weg. Wenn sich zeigt, dass das häufig gebraucht wird, ist
  das ein Signal gegen die Persistenz-Umkehr, nicht gegen das Quellenmodell.

## Nicht Teil dieses Plans

- **PDF-Template.** Siehe oben — eigene Arbeit, `legacyFlatView` überbrückt.
- **Spielzeit-Mechanik.** Metamagie, Zauberpunkte, Arcane/Natural Recovery, Konzentration,
  Komponenten und Materialkosten, Gegenstands-Ladungen. `pools`/`uses` bleiben absichtlich dünn;
  angezeigt wird nur, was auf einen Bogen gehört (u.a. „Pakt-Slots: Kurze Rast").
- **Durchsetzung des Tauschtakts.** `SwapRule` wird modelliert und **angezeigt** („Barde: Tausch
  nur beim Stufenaufstieg"), aber nicht erzwungen — dafür bräuchte die App einen Vorzustand je
  Rast, den sie als Planer nicht führt.

  Randfall dazu, entschieden: Magic Initiate ist die einzige Quelle **ohne** wörtliche
  Trick-Tausch-Regel — sie hat nur den Sammelsatz „replace one of the spells you chose for this
  feat with a different spell of the same level". Gelesen wird das eng: `cantrips: 'none'`, nur
  der Grad-1-Zauber ist tauschbar. Die weite Lesart („of the same level" wäre sonst tot, und
  Zaubertricks sind Grad-0-Zauber) ist vertretbar, aber sie steht nicht da.
