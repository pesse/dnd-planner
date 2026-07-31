# TODO: Zauberattribut für `optionList`-Zweige mit Zaubern

> Folgearbeit aus `docs/plan/plan-wahlen-deklarieren.md`, Stufe 2. Aufgefallen 2026-07-31 beim
> A/B-Vergleich der Eval-Strecke `declaredVsAi` (Höllische Abstammung, Tiefling Stufe 1).
> Es ist der **einzige** gemessene Punkt, an dem die Deklaration heute schlechter ist als
> der KI-Pfad, den sie ersetzt.

## Problem

Elfenabstammung und Höllische Abstammung sagen beide denselben Satz:

> Intelligence, Wisdom, or Charisma is your spellcasting ability for the spells you cast
> with this trait (choose the ability when you select the lineage).

Solange das Merkmal undeklariert durch die KI-Kette lief, stellte Pass A diese Frage — in
der Messung in **3 von 5 Läufen**. Seit `grantsChoice.kind = 'optionList'` fällt das Merkmal
aus dem KI-Eingang, und der Flow stellt die Frage nicht: in **0 von 5 Läufen**. Der Charakter
bekommt die Zauber (`options[].spells` → `optionListRider`), aber kein Attribut dazu — SG und
Angriffsbonus dieser Zauber sind damit unbestimmt.

## Was schon da ist

`kind = 'spellAccess'` löst genau dieselbe Aufgabe bereits vollständig, und zwar über
Felder, die **am gemeinsamen Schema hängen, nicht am Zweig**:

| Baustein | Ort |
|---|---|
| `spellAbilities: AbilityName[]` | `featureChoiceGrantSchema`, `schemas/shared.ts` |
| Frage, sobald `length > 1` | `spellAccessChoices` / `spellAbilityChoiceId`, `services/spellAccess.ts` |
| Antwort → Ledger → SG/Angriff | `spellAccessValues`, dasselbe Modul |

`featureChoiceGrantSchema` ist EIN Objekt für alle `kind`s — `spellAbilities` ist also
bereits parsebar, wenn `kind = 'optionList'` ist. Nur der Kommentar daneben („Nur bei
kind=spellAccess") und die Auswertung fehlen. Das macht die Lücke klein: **kein
Schema-Bruch, keine Charakter-Migration.**

## Umsetzung

1. **`schemas/shared.ts`** — den Geltungsbereich von `spellAbilities` (und ggf.
   `spellLists`) im `.describe()` auf „`spellAccess` **und** `optionList` mit Zaubern"
   erweitern. Reine Doku-Änderung am Feld, kein neues Feld.
2. **`services/featureDeclaration.ts`** — neben `optionChoiceId(f)` eine zweite Frage-ID
   (`optionAbilityChoiceId`) und eine Frage, wenn `grantsChoice.spellAbilities.length > 1`
   **und** der gewählte Zweig überhaupt `spells` führt. Bei Länge 1 keine Frage, wie bei
   `spellAccess` — die Deklaration sagt nicht „frag das ab", sondern welche Werte gelten.
3. **Senke** — die Antwort gehört ins selbe Ledger wie beim `spellAccess`
   (`sourceKey`/`choice`-Paar), damit `spellAccessValues` SG und Angriffsbonus ohne
   zweiten Rechenweg liefert. Prüfen, ob dafür ein `SpellAccessGrant` aus der
   `optionList`-Deklaration synthetisiert werden kann — das wäre die Variante ohne
   zweiten Wertepfad.
4. **Vault** — `spellAbilities: ["Intelligence","Wisdom","Charisma"]` an
   `species/elf.json` (`srd-2024_elf_elven-lineage`) und `species/tiefling.json`
   (`srd-2024_tiefling_fiendish-legacy`). Beide Regeltexte nennen die drei wörtlich.
5. **Bogen** — die Zeile aus `optionListNoteLines` muss das Attribut mitnennen, sonst
   steht die Zahl nirgends (dieselbe Begründung wie bei `spellAccessNoteLines`).

## Verifikation

* `npm run check`
* `tests/integration/featureDeclaration.test.ts`: Frage entsteht bei drei Attributen, keine bei einem,
  keine bei einem Zweig ohne Zauber
* Eval-Strecke `declaredVsAi` (der Fall, der die Lücke gefunden hat): die Soft-Probe
  „Zauberattribut wird erfragt" muss im deklarierten Pfad von 0/5 auf 5/5 gehen —
  **besser** als die 3/5 des KI-Pfads, denn deterministisch statt gewürfelt

## Nicht Teil davon

Die zweite Auffälligkeit derselben Messung: beide Pfade erfinden eine Frage „Choose your
Size", obwohl die Größe ein gefiltertes `sheetValue`-Merkmal ist und `prep.sizeChoice` sie
längst stellt. Im deklarierten Pfad ist sie die einzige verbliebene Frage und damit der
alleinige Grund, warum T1 und die Nach-Analyse überhaupt laufen (5 Calls statt 3). Eigenes
Thema, eigener Fix.
