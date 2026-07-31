# Weibliche Namensformen für die Anzeige

> Umsetzungsplan, erstellt am 2026-07-28 auf Stand Commit `3ae88b8`,
> **überarbeitet am 2026-07-30 auf Stand Commit `6922cc6`** — noch nicht begonnen.
> Alle Zeilennummern beziehen sich auf `6922cc6`.
>
> Die Revision hat die tragende Architekturentscheidung **umgedreht** (ableiten statt
> persistieren), drei Schritte gestrichen und zwei Fallen ergänzt. Was sich gegenüber der
> ersten Fassung geändert hat und warum, steht in
> [„Was die Revision geändert hat"](#was-die-revision-geändert-hat) am Ende.

## Context

Der Charakterbogen zeigt Klasse, Subklasse, Volk, Hintergrund und Talente immer in der
maskulinen Form der Bibliothek — „Kämpfer 2 · Waldelf", „Hintergrund: Volksheld".
Für weibliche Charaktere soll die Anzeige die weibliche Form verwenden
(Kämpfer→Kämpferin, Volksheld→Volksheldin).

## Analyse-Ergebnis

**Deterministisch ja — aber über gepflegte Daten, nicht über eine Regel und nicht über
eine KI-Funktion zur Laufzeit.**

Die Namensmengen sind geschlossen und klein: 12 Klassen + 16 Subklassen + 10 Völker +
16 Hintergründe + 23 Talente = **77 Strings**. Eine Suffix-Regel (`+ "in"`) wäre bei
~40 % davon falsch:

| Fall | Beispiele |
|---|---|
| naives `+in` trägt | Kämpfer**in**, Kleriker**in**, Zwerg**in**, Soldat**in** |
| Stamm ändert sich | Bard**e**→Bard**in**, Druid**e**→Druid**in**, Schurk**e**→Schurk**in** |
| adjektivische Deklination | Krimineller→**Kriminelle**, Adliger→**Adlige**, Weiser→**Weise**, Drachenblütiger→**Drachenblütige**, Eingeweihter der Magie→**Eingeweihte der Magie** |
| unregelmäßig | Bauer→**Bäuerin**, Elf→**Elfe**, Seemann→**Seefrau**, Zauberer→**Zauberin** (nicht *Zaubererin*) |
| Kopfnomen steckt in einer Phrase | Krieger der offenen Hand→**Kriegerin** der offenen Hand |
| gar keine weibliche Form | Mensch, Fee, Wache, Champion, Glückspilz, Zirkel des Landes, Eid der Hingabe |

Eine Regel bräuchte für jeden dieser Fälle eine Ausnahme — das ist dieselbe Handtabelle,
nur mit mehr Code drumherum. Ein Modell zur Laufzeit zu fragen wäre für 77 feststehende
Strings zudem teuer, langsam und instabil (die Anzeige muss offline und über Läufe hinweg
identisch sein).

Also: ein **gepflegtes Feld `nameDeF`** neben dem bestehenden `nameDe` auf dem
Bibliotheks-Artefakt — dieselbe Bauart wie `nameDe` selbst und wie `MASTERY_INFO`.
KI wird nicht gebraucht; die 44 nicht-leeren Werte stehen unten fertig kuratiert
(→ [Schritt 7](#schritt-7--vault-daten-kuratiert)).

**Entscheidungen (mit dem User):**

1. Auslöser ist ein **neues, normalisiertes Genus-Feld** am Charakter — nicht der
   bestehende Freitext `personal.geschlecht` und kein globaler Schalter. Es liegt
   **top-level** in `characterSchema`, nicht in `personal`: `personal.*` ist der
   PDF-Spiegel („Do not extend it"), und so bleibt `emptyPersonal()` unberührt.
2. Umfang: **Klasse, Subklasse, Volk, Hintergrund und Talente**. Merkmale/Traits/Vorteile
   bleiben außen vor (meist keine Personenbezeichnungen).
3. Das exportierte PDF trägt die weibliche Form.
4. Der **KI-Prompt-Kontext** trägt die weibliche Form.
5. Der **Charakter-Erstell-Wizard fragt das Genus ab**.
6. Die Werte werden **von Hand kuratiert**, nicht per KI-Aktion generiert. Dabei nur
   **belegte** Formen: `Paladin`, `Halbling`, `Goliath`, `Tiefling` bleiben leer, statt
   „Paladinin"/„Halblingin"/… zu erfinden.

## Tragende Entscheidung: ableiten statt persistieren

Die erste Fassung wollte die weibliche Form **in** die abgeleiteten Anzeige-Strings
`classLevel` / `race` / `background` schreiben („dann sind Kopf, Party-Leiste und PDF
gratis dabei"). Das ist der falsche Hebel:

1. **Dirty-Tracking bricht.** `CharacterEditForm.svelte:1351-1430` ist ein **synchroner**
   `$effect`-Spiegel in `ed.draft` — kein Save-Handler, wie die erste Fassung annahm.
   `classLevelPreview` (`:73`) ist synchrones `$derived` **und** Dirty-Baseline
   (`dirOf(saved?.classLevel, classLevelPreview)`, `:1665`). Eine async
   Bibliotheks-Auflösung dort schreibt im ersten Frame — Index noch leer — den maskulinen
   String in den Draft, `ed.dirty` schlägt an, die Save-Leiste blitzt auf, und
   `registerEditorGuard().isDirty` meldet einen ungespeicherten Charakter.
2. **Der Anzeige-String wäre keine Funktion von `classes` mehr.** Er hat heute **vier**
   Schreiber — Editor-`$effect`, `CharacterSheet:249` (nach Stufenaufstieg),
   `assembleCharacter.ts:141-143` (Wizard), `parseCharacterData`
   (`pdf/characterFields.ts:252`). Der PDF-Import kann das Genus prinzipiell nicht kennen.
3. **Namens-Matching wäre an vier statt einer Stelle betroffen:** außer `exactMatch` matchen
   auch `featsLibrary.ts:139` (`matchFeatEntry`) und `proficiencyGrants.ts:150` Talente
   **über den Namen**.
4. **Ein Genus-Wechsel wäre kein Ein-Zeilen-Diff**, sondern schreibt drei Strings um.

Der behauptete Gewinn löst sich zudem auf: die Party-Leiste liest zwar `data.classLevel`
direkt aus der `character.json` (`Sidebar.svelte:309-314`, ohne `upgradeCharacter`, ohne
Bibliothek) — aber sie liest **dieselbe Datei**, also auch `data.genus`, und sie hat schon
eine Label-Tabelle. Ein `labelF` je `CLASS_INFO`-Eintrag genügt. Das PDF wird in
`exportToPdf` aus `{...character}` gebaut (`CharacterSheet.svelte:585-590`); die drei
Strings dort zu überschreiben ist **eine Zeile** und hält `pdf/characterExport.ts`
bibliotheksfrei.

> **Also: die weibliche Form wird nirgends persistiert. Sie entsteht nur zur Render- und
> Exportzeit.**

Damit bleiben `parseClassLevelText`, `classesFix`/`speciesFix`/`backgroundFix`,
`matchFeatEntry`, `assembleCharacter`, `CharacterSheet:249`, `classLevelPreview` und der
komplette Spiegel-`$effect` **unangetastet** — und das Dirty-Tracking kann gar nicht
kaputtgehen.

## Invariante

`nameDe` bleibt der **kanonische** Name — Link-Anker, Namens-Matching der
Altformat-Umstellung, Bibliotheks-Browser. `nameDeF` ist rein additiv;
**leer/fehlend = keine eigene weibliche Form** → Fallback auf `nameDe`, dann `name`.

Am Charakter bleiben **sowohl** die Links (`classes[].name`, `subclassName`,
`species.name`, `backgroundRef.name`) **als auch** die abgeleiteten Anzeige-Strings
(`classLevel`, `race`, `background`) **maskulin**. Damit bleibt das Namens-Matching intakt
und ein Genus-Wechsel w↔m ist verlustfrei — er berührt genau eine Zeile in der Datei.

## Zwei Fallen, die die Umsetzung sonst still beschädigen

* **`importPdfIntoExisting` (`CharacterSheet.svelte:554-556`) überschreibt den ganzen
  Charakter** und rettet nur `spells` aus dem alten. `genus` ginge bei jedem PDF-Import
  verloren → muss wie `spells` übernommen werden.
* **`onClassNameInput` (`:964-969`) löscht den `sourceKey` beim Tippen NICHT** (anders als
  `onSpeciesInput:1019`). Ein Charakter kann also einen verlinkten Eintrag mit
  **handgeändertem Namen** tragen — eine ungeschützte „Bibliothek gewinnt"-Regel würde den
  überschreiben.

---

## Schritt 1 — Bibliotheks-Schemas und -Indizes: `nameDeF`

Je ein `nameDeF: z.string().optional()` direkt hinter das bestehende `nameDe`:

| Datei | Schema | Zeile `nameDe` |
|---|---|---|
| `src/lib/schemas/classProgression.ts` | `classProgressionSchema` (Klassen **und** Subklassen) | 70 |
| `src/lib/schemas/species.ts` | `speciesSchema` | 33 |
| `src/lib/schemas/background.ts` | `backgroundSchema` | 54 |
| `src/lib/schemas/feat.ts` | `featSchema` | 16 |

**Nicht** in `classFeatureSchema` (L51), `traitSchema` (L23), `benefitSchema` (L45) —
Merkmale sind bewusst außen vor.

> Die Schemas sind plain `z.object()` und **strippen** unbekannte Keys
> (dokumentiert in `src/lib/utils/schemaValidation.ts:1-8`). Ohne Schema-Feld
> verschwindet ein `nameDeF` aus der Vault-JSON beim Parsen — deshalb Schema zuerst,
> Daten danach.

Danach die Beispiel-Objekte der vier Schemas erneuern: `npm run schema:examples`.

Index-Typen der Bibliotheks-Module um `nameDeF` erweitern (Typ **und** Folder-Scan):

* `src/lib/classLibrary.ts` — `ClassInfo` (L10), Scan L51
* `src/lib/speciesLibrary.ts` — `SpeciesInfo` (L12), Scan L73
* `src/lib/backgroundsLibrary.ts` — `BackgroundInfo` (L12), Scan L43
* `src/lib/featsLibrary.ts` — `FeatEntry` (L27), Scan L80

**Die vier Display-Helper bleiben unverändert** — kein Genus-Parameter:
`classDisplayName` (L26), `speciesDisplayName` (L21), `backgroundDisplayName` (L21),
`featDisplayName` (L46). Ihre ~50 Aufrufstellen sind Browser, Picker, Vorschlagslisten oder
Schreiber, also durchweg kanonisch. Genus-Wissen lebt in genau einem Modul (Schritt 3).

---

## Schritt 2 — Genus am Charakter (`CHARACTER_VERSION` 5 → 6)

In `src/lib/schemas/character.ts`:

* Top-level direkt hinter `race` (L174): `genus: z.enum(['', 'm', 'w']).default('')`, mit
  Kommentar „Anzeigeform der Bibliotheks-Namen; kein PDF-Feld".
* `CHARACTER_VERSION = 6` (L366) und **genau ein** Upgrade-Step in `CHARACTER_UPGRADES`
  (L376-454):

```ts
{
  to: 6,
  label: 'Anzeigeform (Genus) aus dem Freitext „Geschlecht" vorbelegt',
  apply: (c) => {
    // Idempotent: ein bereits gesetztes Genus bleibt. Inhaltsgesichert, weil Legacy-
    // Dateien oft kein/ein zu niedriges `_version` tragen, obwohl das Feld schon steht.
    if (typeof c.genus === 'string' && c.genus) return;
    const p = c.personal as Record<string, unknown> | undefined;
    const g = (typeof p?.geschlecht === 'string' ? p.geschlecht : '').trim().toLowerCase();
    if (/^(w|f|frau|female)/.test(g)) c.genus = 'w';
    else if (/^(m|männlich|mannlich|male|mann)/.test(g)) c.genus = 'm';
    // alles andere („Beides", leer, Unbekanntes) bleibt ungesetzt
  },
}
```

* Mitzuziehen (`npm run check` zeigt beide an): `blankCharacter`
  (`services/wizard/assembleCharacter.ts:68`) und `parseCharacterData`
  (`pdf/characterFields.ts:249`).

> **Ehrlich zur Erwartung:** im heutigen Vault stehen als `geschlecht` nur `""`, `""`,
> `"Beides"`, `"männlich"`. Der Prefill setzt **einen** Charakter auf `'m'` und **keinen**
> auf `'w'`. Der Schritt ist trotzdem Pflicht (Schemaänderung ⇒ Bump + genau ein Schritt),
> aber er ist kein Feature — die weibliche Form kommt aus dem Dropdown.

**UI:** Dropdown „Anzeigeform" (— / männlich / weiblich) direkt neben dem Freitextfeld
`Geschlecht` in `src/lib/components/CharacterEditForm.svelte:2088`, mit
`use:diffMark={dirOf(saved?.genus, genus)}` wie die Nachbarfelder. Im Spiegel-`$effect`
**in Zod-Schlüsselreihenfolge** eintragen: die heutige Zeile `character.race = race;
character.xp = xp;` (L1363) trennen und `character.genus = genus;` dazwischen setzen —
sonst wirkt ein frisch geladener Charakter dirty (Kommentar L1347-1350).

---

## Schritt 3 — Ein Modul für die Genus-Logik

Neu: `src/lib/services/genderedNames.ts` — pur, **synchron**, Svelte-frei.

* `export type Genus = '' | 'm' | 'w'` und `genusOf(character): Genus`
* `displayNameOf(e: { name; nameDe?; nameDeF? } | undefined, genus): string` — **die eine**
  Fallback-Kette: `genus === 'w' ? (nameDeF || nameDe || name) : (nameDe ?? name)`. Passt auf
  Index-Einträge **und** volle Artefakte.
* `linkedDisplayName(stored, lib, genus, fallbackKey): string` — mit dem Schutz gegen den
  handgeänderten Namen:

  ```
  genus === 'w'
    && lib?.nameDeF?.trim()                        // Bibliothek hat eine weibliche Form
    && stored.trim() === (lib.nameDe ?? lib.name)  // gespeicherter Name ist UNVERÄNDERT kanonisch
      ? lib.nameDeF
      : (stored.trim() || lib?.nameDe || lib?.name || fallbackKey)
  ```

  Freitext/Homebrew fällt automatisch durch (`lib == null` oder kein `nameDeF`) — es wird
  nichts geraten.
* `loadDisplayIndices(): Promise<DisplayIndices>` — `Promise.all` über die drei
  Singleton-Caches `getClasses()` / `getSpeciesList()` / `getBackgroundsList()`.
* `displayStrings(c: Character, ix: DisplayIndices | null): { classLevel; race; background }`
  — baut die Strings mit `formatClassLevel` / `formatSpecies` (`schemas/character.ts:283/292`,
  bleiben sync und unangetastet) aus einer flachen Kopie der `classes[]`/`species`-Objekte mit
  getauschtem `name`/`subclassName`. Bei `ix === null` oder `genus !== 'w'` kommen die
  gespeicherten Strings **unverändert** zurück (inkl. der heutigen Kette
  `c.race || formatSpecies(c.species)`) — nie „halb aufgelöst".

---

## Schritt 4 — Gruppen-Titel: Präzedenz umdrehen

`src/lib/services/characterFeatures.ts`. Die Titel kommen heute aus dem am Charakter
**persistierten** Namen, mit der Bibliothek nur als Fallback — `title: cls.name.trim() ||
cls.sourceKey` (L60). Da der persistierte Name maskulin bleibt, wäre ein bloß durchgereichtes
`genus` **wirkungslos**.

Die vier Funktionen bekommen `genus: Genus = ''` und rufen `linkedDisplayName` statt der
heutigen `stored || lib || key`-Kette:

* `resolveClassFeatures` (L51) — Basisklasse L60 **und** Subklassen-Zweig L77
* `resolveSpeciesTraits` (L98) — Spezies L104, Unterspezies L115
* `resolveBackground` (L130) — Titel L134 **und** `Herkunftstalent: …` L148
* `resolveFeatLinks` (L209) — Talent-Namen L217

Sie halten das **volle** Artefakt schon in der Hand (`prog`/`sub`/`base` via
`getProgressionByKey` / `getSpeciesByKey` / `getBackgroundByKey`), brauchen also keinen Index.
Ohne Parameter verhält sich alles wie heute.

**Genau ein Aufrufer macht opt-in:** `CharacterSheet.svelte:65` →
`resolveCharacterFeatures(c, genusOf(c))`. Weil das Genus top-level am Charakter hängt, muss
`resolveCharacterFeatures` (L251) es selbst lesen und weiterreichen — keine weitere
Aufrufstelle wird angefasst.

**Bewusst kanonisch** — das sind Prompt-Eingaben, keine Anzeige:
`characterContext.ts:310`, `LevelUpAssistant.svelte:688-693`, und
`CharacterEditForm.svelte:1153/1191` (sieht wie Anzeige aus, fließt aber über
`summaryFeaturesOf(… group: g.title)` in `fieldSummaryAction`).

---

## Schritt 5 — Die Lesestellen

| Stelle | Änderung |
|---|---|
| `CharacterSheet.svelte:775/779` (Kopf) | über `displayStrings(character, ix)`; `ix` per `$effect` aus `loadDisplayIndices()` in `$state` |
| `CharacterSheet.svelte:585-590` (`exportToPdf`) | die drei Strings im `json`-Spread überschreiben. Ist `async`, Bibliothek verfügbar; `pdf/characterExport.ts` bleibt unangetastet |
| `CharacterSheet.svelte:554-556` (`importPdfIntoExisting`) | `imported.genus = character?.genus ?? ''` — analog zur `spells`-Rettung (erste Falle oben) |
| `Sidebar.svelte:248-272` | `labelF?` an den 16 `CLASS_INFO`-Einträgen; `genus` in `loadCharacters` (L311) aus derselben JSON lesen und an `parseClasses`/`classLevelInfo` durchreichen. **Keine** neuen Schlüssel und **keine** Sortierung nach Schlüssellänge — die gespeicherten Strings bleiben maskulin, `zauberer` trifft weiter. `erfinder` und die ASCII-Varianten bleiben unberührt |
| `services/characterContext.ts:75-77` | `characterMinimum(c, slug, ix?)` bekommt die Indizes optional; beide Aufrufer (`stores/context.ts:154` und `:717`) liegen in `async`-Funktionen und können `loadDisplayIndices()` awaiten. `genus` **nicht** in `PERSONAL_FIELDS` (L265) aufnehmen — die feminisierten Namen tragen die Information, der Enum-Buchstabe gehört nicht in den Prompt |
| `services/characterLegacyLinks.ts:64-71` | `nameDeF?: string` in die Typschranke von `exactMatch`, dritter Vergleich in der `find`-Bedingung. **Nötig, weil das exportierte PDF feminin ist** und beim Re-Import wiedergefunden werden muss. Es ist die **einzige** Matcher-Stelle — CLAUDE.md: „Do not add a second matcher next to it." Bewusst **kein** Rückschluss auf `genus = 'w'` beim Verlinken |
| `CharacterWizard.svelte` | Genus-Auswahl (Entscheidung 5). `assembleCharacter` setzt nur `c.genus`; die Anzeige-Strings bleiben kanonisch |

**Unverändert, absichtlich:** `assembleCharacter.ts:141-143/294`, `CharacterSheet.svelte:249`,
`levelUp.ts:211`, `fightingStyle.ts:105`, `featCreate.ts:40`, `wizard/featurePrep.ts:80`,
`wizard/characterWizard.svelte.ts:324`, alle Picker- und Vorschlagslisten
(`CharacterEditForm.svelte:1517/1610/1652/1700`), die Karten-Header, sowie die
Herkunfts-Labels der Übungs-Grants (`services/proficiencyGrants.ts:177/214`) und der
Waffenbeherrschungs-Hinweis (`services/weaponMastery.ts`) — Provenienz, kein Personenbezug,
und `collectGrants` kennt den Genus nicht.

**Die Link-Chips im Bearbeiten-Tab bleiben maskulin** (`:1592/1635/1682`): sie sind
Bibliotheks-Links und Diff-Baseline. Der Bearbeiten-Tab ist die strukturelle Sicht, Kopf und
Karte die Anzeige.

---

## Schritt 6 — Bibliotheks-Editoren, dann von Hand testen

`nameDeF`-Eingabefeld hinter dem `nameDe`-Feld, Label „Weibliche Form (optional)",
Platzhalter = der maskuline Wert, leer = keine eigene Form:

* `ClassEditForm.svelte:88`
* `SpeciesEditForm.svelte:32`
* `BackgroundEditForm.svelte:45`
* `FeatEditForm.svelte:20`

Damit bekommen Homebrew- und importierte Einträge ihre Form ohne weiteren Code. Die
Karten-Header (`ClassCard.svelte:115`, `SpeciesCard.svelte:87`, `BackgroundCard.svelte:141`,
`FeatCard.svelte:83`) bleiben kanonisch-maskulin; die weibliche Form dort höchstens als
kleiner Zusatz „(w: Kämpferin)", falls gepflegt.

> **Reihenfolge-Empfehlung:** danach die drei Werte für `Kämpfer`, `Bauer`, `Elf` **von Hand**
> im Editor eintragen und die Strecke Ende-zu-Ende laufen lassen — erst dann das
> Migrationsskript schreiben. Das trennt „Mechanik falsch" von „Daten falsch".

---

## Schritt 7 — Vault-Daten (kuratiert)

Migrationsskript `scripts/migrate-female-names.mts`, Aufbau und Lauf-Recipe wörtlich nach
dem Muster von `scripts/migrate-proficiency-grants.mts` (Header-Kommentar L18-22:
esbuild-Bundle + node, `--dry-run`, Abbruch **bevor** eine Datei angefasst wird). Schlüssel
der Tabelle ist der Bibliotheks-`key`, nicht der Name. Die Tabelle **aus dem Vault heraus**
aufbauen (Skript listet `key` + `nameDe`), nicht die Namensliste unten abtippen — sie ist
eine Momentaufnahme und hatte nachweislich schon eine Lücke.

**Gates, alle vor dem ersten Write:**

1. jeder Tabellen-Schlüssel existiert im Vault (Tippfehler / umbenannter Key);
2. **jeder Vault-Eintrag kommt in der Tabelle vor, auch mit `''`** — sonst bleibt ein neu
   importierter Eintrag still ohne Form. Genau das hätte das fehlende „Fee" gefunden;
3. pro Bibliothek ist `nameDe ∪ nameDeF` **kollisionsfrei** — sonst verlinkt eine weibliche
   Form beim PDF-Re-Import über `exactMatch` einen fremden Eintrag;
4. `nameDeF !== nameDe` (redundante Doppelung = Datenfehler).

Schreiben: `nameDeF` **direkt hinter `nameDe`** einfügen (nicht anhängen), damit die Dateien
dieselbe Schlüsselreihenfolge haben wie ein späteres Speichern durch die App
(Zod-Objektreihenfolge) und der Vault-Diff klein bleibt.

Ins Skript als Kommentar: `nameDeF` teilt das Schicksal von `nameDe` — ein frischer
Open5e-Import über die Sidebar erzeugt einen Eintrag ohne beide (`services/classProgression.ts`
mappt kein `nameDe`). Gate 2 ist der Detektor dafür.

**Der Vault ist ein eigenes Git-Repo** → zwei Commits (App + Vault). Vor dem Vault-Commit
`python3 tools/build_packs.py --dry-run` (Pflicht laut `vault/CLAUDE.md`).

Nicht aufgeführt bzw. als *leer* markiert = bewusst keine eigene weibliche Form.

### Klassen (12)

Barbar→Barbarin · Barde→Bardin · Kleriker→Klerikerin · Druide→Druidin ·
Kämpfer→Kämpferin · Mönch→Mönchin · Waldläufer→Waldläuferin · Schurke→Schurkin ·
Zauberer→**Zauberin** · Hexenmeister→Hexenmeisterin · Magier→Magierin ·
*Paladin: leer*

> **Paladin** flektiert das deutsche PHB nicht; „Paladinin" wäre eine Erfindung
> (Entscheidung 6).

### Subklassen (16)

Assassine→Assassinin · Hervorrufer→Hervorruferin · Unhold-Patron→Unhold-Patronin ·
Jäger→Jägerin · Dieb→Diebin · Krieger der offenen Hand→**Kriegerin der offenen Hand**

*leer* (keine Personenbezeichnungen): Champion, Zirkel des Landes, Zirkel des Mondes,
Hochschule des Wissens, Drakonische Zauberei, Lebensdomäne, Eid der Hingabe,
Pfad des Berserkers, Weg des Schattens, Wildmagie-Zauberei

### Völker (10)

Drachenblütiger→**Drachenblütige** · Zwerg→Zwergin · Elf→**Elfe** · Gnom→Gnomin ·
Ork→Orkin

*leer:* Mensch · **Fee** (grammatisch schon feminin, ohne dass die Spezies weiblich wäre) ·
**Halbling** · **Goliath** · **Tiefling**

> Halblingin / Goliathin / Tieflingin wären regelmäßig gebildet, sind aber nicht offiziell
> belegt → nach Entscheidung 6 leer, Fallback auf die maskuline Form.

### Hintergründe (16)

Akolyth→Akolythin · Handwerker→Handwerkerin · Scharlatan→Scharlatanin ·
Krimineller→**Kriminelle** · Unterhaltungskünstler→Unterhaltungskünstlerin ·
Bauer→**Bäuerin** · Kundschafter→Kundschafterin · Einsiedler→Einsiedlerin ·
Händler→Händlerin · Adliger→**Adlige** · Weiser→**Weise** · Seemann→**Seefrau** ·
Schreiber→Schreiberin · Soldat→Soldatin · Wanderer→**Wanderin** ·
*Wache: leer* (bereits feminin)

### Talente (23) — nur Personenbezeichnungen

Handwerker→Handwerkerin · Heiler→Heilerin · Musiker→Musikerin · Ringer→Ringerin ·
Wilder Angreifer→**Wilde Angreiferin** · Eingeweihter der Magie→**Eingeweihte der Magie** ·
Kneipenschläger→Kneipenschlägerin

*leer:* Glückspilz, Wachsam, Bogenschießen, Begabt, Zäh, Verteidigung,
Attributswerterhöhung, Kampf mit großen Waffen, Zwei-Waffen-Kampf, die sieben „Gaben …"

### Bilanz — der Erwartungswert für den Dry-Run

| Typ | Vault | gepflegt | leer |
|---|---|---|---|
| Basisklassen | 12 | 11 | 1 |
| Subklassen | 16 | 6 | 10 |
| Völker | 10 | 5 | 5 |
| Hintergründe | 16 | 15 | 1 |
| Talente | 23 | 7 | 16 |
| **Summe** | **77** | **44** | **33** |

---

## Bekannte Grenzen (bewusst)

Nicht verlinkte Freitext-Einträge werden **nicht** geraten.

Konkret: `vault/characters/falbala/character.json` hat `background: "Volksheld"` mit
`sourceKey: ""` — „Volksheld" ist ein 5e-**2014**-Hintergrund und liegt gar nicht im
Vault. Damit „Volksheldin" erscheint, muss der Hintergrund entweder als Homebrew mit
`nameDeF` angelegt werden, oder der Name wird im Freitextfeld von Hand angepasst (das
Feld bleibt editierbar). Genauso `species.name: "Waldelf"` — eine Regel würde hier
„Waldelfin" statt „Waldelfe" produzieren, deshalb wird bewusst nicht geraten.

Der Kopf zeigt beim **ersten** geöffneten Charakter je Sitzung ~50–150 ms die maskuline
Form, bis die Indizes geladen sind (danach Singleton-Cache, 0 ms). Rein kosmetisch — es
wird nichts geschrieben, also kein Dirty-Effekt.

Homebrew-Klassen und nicht getroffene Namen zeigen in der Party-Leiste weiter den
Rohstring, also maskulin.

Nebenbefund, **nicht** in diesem Zug mitfixen: `BackgroundCard.svelte:33` nutzt
`slugify(b.name || b.nameDe)` — umgekehrte Priorität zu `ClassCard:29` / `SpeciesCard:27` /
`FeatCard:26` (`nameDe || name`).

---

## Verifikation

1. `npm run check` (svelte-check). Der Compiler-Hebel ist hier **nicht** die
   Helper-Signatur (die bleibt unverändert), sondern das neue Pflichtfeld `genus` — es zeigt
   `blankCharacter` und `parseCharacterData` an.
2. `npm run schema:examples` (`:check` schlägt bei veralteter Datei an) — die vier
   Beispiel-Objekte müssen `nameDeF` zeigen.
3. Migration trocken:
   ```bash
   npx esbuild --bundle --platform=node --format=esm --alias:\$lib=./src/lib \
     scripts/migrate-female-names.mts --outfile=/tmp/mig.mjs && node /tmp/mig.mjs --dry-run
   ```
   → **77 Einträge geprüft, 44 geplante Schreibvorgänge, 33 leer, 0 unbekannte Keys, keine
   Namenskollision**. Dann ohne `--dry-run`, `git -C vault diff` prüfen und
   `python3 tools/build_packs.py --dry-run`.
4. App auf Windows starten (`.\dev-windows.ps1`), Log via
   `tail -f /mnt/c/dev/privat/dnd-planner/tauri-dev.log`.
5. Upgrade — **es gibt kein Stapel-Upgrade in der Sidebar mehr.** Pro Charakter den
   Bearbeiten-Tab öffnen → Banner aus `pendingCharacterUpgrade` (`CharacterSheet.svelte:127`)
   → *Aktualisieren* (setzt nur `extraDirty`) → die normale Save-Leiste schreibt. Erwartung:
   das Protokoll nennt den v6-Schritt; genau **ein** Charakter erhält `"genus": "m"`, alle
   anderen `""`.
6. Ende-zu-Ende an `vault/characters/falbala`: Klasse über den Picker auf `Kämpfer` verlinken,
   „Anzeigeform: weiblich" setzen, speichern.
   * Kopf zeigt „**Kämpferin** 2"; Sidebar (Gruppe zu- und aufklappen, `loadCharacters` liest
     die Datei neu) zeigt ⚔️ + „**Kämpferin**".
   * **JSON-Tab — der Invarianten-Beweis:** `classes[0].name` ist weiterhin `"Kämpfer"`,
     `classLevel` weiterhin `"Kämpfer 2"`.
   * Hintergrund auf `Bauer` verlinken → „Hintergrund: **Bäuerin**".
   * Volk auf `Elf` → „**Elfe**"; auf `Mensch` wechseln → „Mensch"; auf `Tiefling` →
     „Tiefling" (bewusst kein Suffix).
   * Talent `Heiler` verknüpfen → „Heilerin"; `Zäh` → unverändert „Zäh".
   * Subklasse `Krieger der offenen Hand` an einem Mönch → „**Kriegerin** der offenen Hand".
   * Gruppentitel der verknüpften Merkmale: „**Kämpferin**" — **ohne** Stufe. (Der
     Doc-Kommentar an `ResolvedFeatureGroup` verspricht „Waldläufer 5", die Stufe steht dort
     aber nicht drin.)
   * Klasse `Zauberer` an einem anderen Charakter → Sidebar „**Zauberin**" + ✨.
   * Bearbeiten-Tab: die Link-Chips zeigen weiter „Kämpfer"/„Bauer"/„Elf" (erwartet).
7. **Handgeänderter Name:** bei verlinkter Klasse den Namen im Feld auf „Haudegen" tippen
   (`sourceKey` bleibt erhalten!) → der Titel bleibt „Haudegen", wird **nicht** zu
   „Kämpferin".
8. **Dirty-Regression:** Charakter mit `genus: 'w'` frisch öffnen, nichts anfassen,
   Index-Load abwarten → die Save-Leiste bleibt sauber, blitzt nicht auf, keine
   `diffMark`-Marker an Klasse/Volk/Hintergrund. Fenster neu laden und erneut prüfen (deckt
   den „Index noch nicht geladen"-Frame ab).
9. **Genus-Rücknahme:** auf „männlich" stellen, speichern → `git diff` der Charakterdatei
   zeigt **nur die `genus`-Zeile**; Kopf, Sidebar und Merkmale sind wieder maskulin.
10. **PDF-Rundlauf:** exportieren → `KlasseUndStufe` = „Kämpferin 2", `Hintergrund` =
    „Bäuerin", `Volk` = „Elfe". Dieselbe PDF re-importieren → `genus` ist **erhalten**
    (Carry-over), und das Altformat-Angebot findet Kämpfer/Bauer/Elf über `nameDeF` wieder
    und schreibt die maskulinen Namen zurück.
11. **KI-Kontext:** Stufenaufstieg-Assistent öffnen und den Kontext-Block prüfen →
    `Class & Level: Kämpferin 2`, `Species: Elfe`, `Background: Bäuerin`; **kein**
    `genus`-Feld im Personal-Block.
12. **Wizard:** neuen Charakter mit „weiblich" anlegen → Kopf und Party-Leiste stimmen
    sofort, ohne zweites Speichern.
13. **Bibliotheks-Browser gegenprüfen:** Sidebar-Listen, Karten-Header, alle Picker,
    Subklassen-Dropdown, Stufenaufstiegs-Optionen und der Wizard zeigen weiterhin die
    maskuline Form (kein Charakterkontext).

Keine Evals — die führt ausschließlich der User (`npm run eval`); diese Änderung berührt
keinen Prompt-*Text*, nur Kontext-*Werte*.

---

## Was die Revision geändert hat

Die erste Fassung entstand auf `3ae88b8`; seither liegen ~30 Commits dazwischen
(Charakter-Wizard, Merkmals-Ledger, Zauber-Migration, mehrstufiger KI-Kontext, Auslagerung
der Altformat-Umstellung). Der Kern — gepflegtes `nameDeF` statt Regel oder KI — hat
gehalten. Geändert hat sich:

| Erste Fassung | Jetzt |
|---|---|
| weibliche Form **in** `classLevel`/`race`/`background` schreiben | **nicht persistieren**, nur zur Render-/Exportzeit ableiten (siehe [Tragende Entscheidung](#tragende-entscheidung-ableiten-statt-persistieren)) |
| `async deriveDisplayStrings(character)` | `displayStrings(c, ix)` — sync, pur, mit Gate |
| Genus-Parameter an den vier Bibliotheks-Helpern | entfällt; Genus lebt nur in `genderedNames.ts` |
| „Save-Payload" in `CharacterEditForm` anpassen | es gibt **keinen** Save-Handler, nur einen synchronen `$effect`-Spiegel — und geschrieben wird nichts Feminines |
| `genus` durch `characterFeatures.ts` durchreichen | **wirkungslos** ohne Präzedenz-Umkehr, weil der Titel aus dem persistierten Namen kommt (Schritt 4) — plus Schutz gegen handgeänderte Namen |
| Matching an 3 Stellen in `CharacterEditForm` | **eine** Stelle: `exactMatch` in `services/characterLegacyLinks.ts:64-71` |
| Feat-Vorschlag `sug.nameDe ?? sug.name` umstellen | erledigt — `nameDe` kommt in `CharacterEditForm.svelte` nicht mehr vor |
| Genus an `LevelUpAssistant:873/895/1051` | **gestrichen, wäre schädlich**: Optionslisten, deren Auswahl als `classes[].name` / `chosenFeats[].name` persistiert wird |
| Sidebar: 12 neue `CLASS_INFO`-Schlüssel + Sortierung nach Schlüssellänge | entfällt; `labelF` je Eintrag + `genus` aus derselben JSON |
| `CHARACTER_VERSION` 3 → 4, Step `to: 4` | **5 → 6**, Step `to: 6` |
| `personal.genus` | **top-level `genus`** |
| 9 Völker, 76 Strings, „41 gepflegt / 35 leer" | **10 Völker** („Fee" fehlte), **77 Strings**, **44 gepflegt / 33 leer** (die alte Rechnung stimmte auch für sich nicht: ihre Tabellen ergaben 47/29) |
| Talente in `references.feats` | Merkmals-Ledger `character.features` (seit Upgrade `to: 4`) |
| Verifikation via „⬆-Batch-Upgrade in der Sidebar" | Banner pro Charakter im Bearbeiten-Tab |
| — | **neu:** `importPdfIntoExisting` muss `genus` übernehmen, sonst geht die Anzeigeform bei jedem PDF-Import verloren |
| — | **neu:** KI-Prompt-Kontext feminisieren (Entscheidung 4), Wizard fragt das Genus ab (Entscheidung 5) |
| — | **neu:** Gate 3 (`nameDe ∪ nameDeF` kollisionsfrei), weil `exactMatch` künftig auch auf `nameDeF` trifft |
