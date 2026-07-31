# Merkmale als dauerhafte rechte Seitenleiste am Charakter

> Umsetzungsplan, erstellt am 2026-07-31 auf Stand Commit `89c8d24` **plus** die noch nicht
> festgeschriebenen Änderungen im Arbeitsbaum (`characterChoices.ts`, `FeatureChoicePicker.svelte`,
> `CharacterEditForm.svelte`, `applyChanges.ts`, `characterFeatures.ts`); alle Zeilennummern
> beziehen sich auf diesen Stand. Noch nicht begonnen.
>
> Nachgeordnet zu `plan-wahlen-im-charakter-editor.md`: der beschreibt, wie eine Wahl am Charakter
> überhaupt beantwortbar wird, dieser, wo Merkmale und Wahlen **wohnen**. Er setzt jenen als
> umgesetzt voraus.

## Context

Merkmale gehören zum Wichtigsten an einem Charakter, sind heute aber **zweimal hinter einem
zugeklappten `<details>` versteckt**:

- Karte-Tab: `CharacterSheet.svelte:975-1001` („Verknüpfte Merkmale (Klasse, Volk, Hintergrund,
  Talente)"), read-only, Auflösung sogar erst beim Aufklappen (`featuresOpen`, `:74-90`).
- Bearbeiten-Tab: `CharacterEditForm.svelte:2097-2161` („Verknüpfte Merkmale & Talente"), mit den
  Talent-Links und — seit `plan-wahlen-im-charakter-editor.md` — den `FeatureChoicePicker`-Zeilen
  der deklarierten Wahlen.

Auf Details, GM-Notizen und JSON sind Merkmale gar nicht erreichbar. Genau in dem Moment, in dem
sie **editierbar** geworden sind, ist „zugeklappt im dritten Abschnitt eines 3300-Zeilen-Formulars"
der falsche Ort.

**Ziel:** Eine rechte Seitenleiste im Charakter-Bereich, dauerhaft sichtbar **unabhängig vom Tab**,
in der Merkmale gelesen *und* geändert werden — und jede Änderung geht in den Draft, macht also die
Save-Bar scharf. Danach existiert die Merkmalsdarstellung **genau einmal**.

**Entschieden (mit dem User geklärt):**
- **Umfang:** aufgelöste Klassen-/Volks-/Hintergrundmerkmale + deklarierte Wahlen + Talent-Links
  wandern komplett in die Leiste; **beide** `<details>`-Blöcke verschwinden. Die PDF-Freitextfelder
  „Klassenmerkmale & Eigenschaften" / „Volksmerkmale" bleiben mit ihren KI-Knöpfen im Formular.
- **Leiste:** rechts im Charakter-Bereich (links vom KI-Panel), Lasche zum Auf-/Zuklappen,
  Ziehgriff für die Breite, Zustand in `localStorage`, **Standard offen**.
- **JSON-Tab:** der Rohtext folgt dem Draft, solange niemand hineingetippt hat; danach Hinweis +
  „Neu laden" statt stillem Überschreiben.

## Entwurf

### 1 · Die Hülle in `CharacterSheet.svelte`

`.sheet` ist heute eine Flex-Spalte aus `.header` (bleibt über allen Tabs sichtbar) und
`<EditorPanel>`. Neu: ein Zeilen-Container um alles unterhalb des Headers — dasselbe Muster, das
`+page.svelte:595-618` für das KI-Panel schon fährt (Panel-Wrap mit Breite, `resize-handle`,
absolut positionierte Lasche):

```svelte
<div class="sheet-body">          <!-- flex:1; min-height:0; display:flex; position:relative -->
  <EditorPanel …>…</EditorPanel>  <!-- bleibt flex:1 und der vertikale Scroll-Container -->
  <div class="feat-handle" class:hidden={featsCollapsed} role="separator"
       aria-label="Merkmals-Leiste verbreitern" onmousedown={startFeatResize}></div>
  <div class="feat-wrap" class:no-transition={featsDragging} style="width: {effFeatWidth}px">
    {#if ed.draft}
      <CharacterFeaturePanel character={ed.draft} saved={savedCharacter}
                             onApplyChanges={applyChoiceGrants} bind:badge={featBadge} />
    {/if}
  </div>
  <button class="feat-toggle" style="right: {effFeatWidth}px" onclick={toggleFeats} …>…</button>
</div>
```

- Zustand analog `+page.svelte:279-318`: `featsWidth` (`localStorage` `char-features-width`,
  Default 360), `featsCollapsed` (`char-features-collapsed`, **Default offen**),
  `effFeatWidth = $derived(featsCollapsed ? 0 : featsWidth)` → Zuklappen ist eine
  Breiten-Transition, die Komponente bleibt montiert. Grenzen: min 240, max 720.
- Die Lasche trägt den Zähler der offenen Wahlen mit (`openChoiceBadge`), damit er auch
  **zugeklappt** sichtbar ist.
- Der Header bleibt, wo er ist: die Leiste beginnt unter ihm und läuft bis zum unteren Rand.

### 2 · Neu: `src/lib/components/CharacterFeaturePanel.svelte`

Die eine Stelle für Merkmale. Besitzt **`character.features`** (das Merkmals-Ledger) und die
Bibliotheksauflösung. Props:

```ts
{ character: Character;               // der ed.draft-Proxy — wird IN PLACE mutiert
  saved?: Character | null;           // Baseline fürs Diff-Highlighting (dirOf/featDir)
  onApplyChanges?: (changes: Change[]) => void;   // „Übernehmen" → Referenz-Swap im Eltern
  badge?: CoverageBadge | null }      // $bindable: Zähler offener Wahlen für die Lasche
```

Inhalt (Blöcke von oben): Klassenmerkmale · Volksmerkmale · Hintergrund · Talente · Entscheidungen
ohne zugeordnetes Merkmal. Übernommen wird **wörtlich** aus `CharacterEditForm.svelte`:

| Was | heute |
|---|---|
| Auflösungs-`$effect` (`rawClassGroups`/`rawSpeciesGroups`/`rawBackgroundGroups`/`choiceSlots`) | `:1166-1189` |
| `featureAnnotations` + `withChoices`-Derived | `:1191-1196` |
| `sheetSkills`, `characterChoices`, `choicesByFeature`, `choiceGrants`, `choiceBadge` | `:1201-1232` |
| `savedChoiceEntries` / `savedAnswerOf` | `:1235-1243` |
| Talent-Bibliothek, Picker, Tooltip, `pickFeat`, `featDir`, `openFeatPage`, `createFeatCard` | `:1329-1434` |
| Snippets `choiceRow`, `featureGroups`, `featPicker` | `:1558-1660` |
| Markup der vier `.ref-block`s | `:2101-2160` |
| `<FeatTooltip>` + `<CreateCardModal type="feat">` | `:2571`, `:2575-2586` |
| CSS `.fp-*`, `.feat-row*`, `.ref-hint`, Picker-/Suggestion-Stile | `:2739-2760`, `:3100ff` |

Vier Änderungen gegenüber dem Formular-Original:

1. **Übungsstand kommt aus dem Draft, nicht aus Formular-Runes:**
   `sheetSkillProficiencies(character.skills)` statt `…(computedSkills)`. Der Sync-`$effect` des
   Formulars schreibt `character.skills = computedSkills` (`:1462`), die Expertise-Optionen bleiben
   also live — und funktionieren jetzt auch, wenn das Formular gar nicht montiert ist.
2. **`character` ist die Ledger-Quelle**, statt lokaler `refFeats`/`choiceEntries`:
   ```ts
   const featRows = $derived.by(() =>
     character.features.map((e, i) => ({ e, i })).filter(({ e }) => !e.choice.trim()));
   ```
   Talent-Zeilen adressieren ihren echten Ledger-Index. Schreiben immer immutabel über die
   Gesamtliste (`character.features = …`) — das ist gleichzeitig das Dirty-Signal.
3. **Auflösung läuft immer**, nicht lazy: der `featuresOpen`-Gate der Karte (`:74-90`) fällt weg.
   Die Leiste ist standardmäßig offen, und der Zähler an der Lasche braucht die Wahlen auch im
   zugeklappten Zustand. Die Bibliotheken sind ohnehin gecacht (`getFeats`, `getProgressionByKey`,
   `getSpellLibrary`).
4. **Talent-Wahlen werden gerendert:** in der Talent-Zeile wie in `featureGroups` —
   `{#each choicesByFeature.get(featKey) ?? [] as s}{@render choiceRow(s.ch, s.i)}{/each}`.
   Ein Talent kann selbst eine Wahl deklarieren; heute fehlt diese Zeile.

**Verwaiste Entscheidungen** exakt über die Zuordnung, die `buildCharacterChoices` schon getroffen
hat, statt über einen zweiten Key-Vergleich:

```ts
const claimed = $derived(new Set(characterChoices.map((c) => c.entry).filter((i) => i >= 0)));
const orphanRows = $derived.by(() =>
  character.features.map((e, i) => ({ e, i })).filter(({ e, i }) => e.choice.trim() && !claimed.has(i)));
```

Das ist strikt besser als der Karte-Test von heute (`isOrphanChoice` über `keysOf(groups)`), der
eine talent-deklarierte Wahl fälschlich als verwaist zeigt. Jede solche Zeile bekommt ein ✕ zum
Löschen — sonst bleibt ein Vertipper wieder nur über den JSON-Tab erreichbar.

Zauberbibliothek für `choiceGrantChanges`/`changesWouldAlter` lädt die Leiste selbst
(`getSpellLibrary()` ist gecacht; `buildSpellIndex`/`matchSpell` wie im Formular `:601-613`).

### 3 · `characterChoices.ts`: das ganze Ledger darf herein

`buildCharacterChoices` bekommt heute nur die Wahl-Einträge, `CharacterChoice.entry` ist ein Index
in *diese gefilterte Liste*, und `withChoiceAnswer` spleißt an dieser Stelle. Die Leiste hätte damit
zwei schlechte Möglichkeiten: Index-Rückabbildung — oder Ledger neu zusammensetzen, was die
**Reihenfolge ändert und jeden Charakter beim Öffnen dirty macht** (die Leiste ist immer montiert,
anders als das Formular).

Deshalb: beide `findIndex`-Prädikate (`:131`, `:136`) um `!!e.choice.trim()` erweitern, damit das
**vollständige** `character.features` übergeben werden kann. `entry` ist dann ein Index ins echte
Ledger, `withChoiceAnswer` schreibt reihenfolge-treu, und ein Talent-Link kann nicht mehr von einem
Wahl-Platz beansprucht werden (der Slot eines Talent-Merkmals trägt **denselben** `sourceKey` wie
sein Link — mit dem vollen Ledger wäre das ohne den Guard ein Datenverlust).

Kommentar dazugeben: „Nur ein Eintrag MIT Antwort ist beanspruchbar — `choice` ist der
Diskriminator (`schemas/character.ts`), sonst überschriebe eine Wahl ihren eigenen Talent-Link."

### 4 · `applyChoiceGrants` in `CharacterSheet.svelte`

Existiert noch nicht (`onApplyChanges` ist im Formular deklariert, aber unverdrahtet — „Übernehmen"
tut heute nichts). Muster `applyLevelUp` (`:167-193`):

```ts
async function applyChoiceGrants(changes: Change[]) {
  if (!ed.draft || !changes.length) return;
  await tick();   // der Sync-$effect des Formulars muss geflusht sein, sonst verliert
                  // der Referenz-Swap die letzten Eingaben
  const next = structuredClone($state.snapshot(ed.draft)) as Character;
  applyChanges(next, changes, { classIndex: 0, resolveSpellKey: (n) => matchSpell(spellIndex, { name: n })?.key });
  const r = parseCharacter(next);
  ed.draft = r.ok ? r.data : next;   // Referenz-Swap → {#key ed.draft} remountet das Formular
}
```

Die Leiste liegt **außerhalb** des `{#key}` und bleibt beim Swap stehen; ihr `$effect` löst neu auf,
weil die Props sich geändert haben.

### 5 · `CharacterEditForm.svelte`: der Merkmalsteil geht raus

Ersatzlos zu löschen: `refFeats`/`choiceEntries`/`savedFeatLinks` (`:224-227`), der
Auflösungs-`$effect` und alle Wahl-Derived (`:1166-1243`), die Talent-Bibliothek samt Picker,
Tooltip und Create-Modal (`:1329-1434`, `:2571-2586`), die Snippets `choiceRow`/`featureGroups`/
`featPicker`, die `<details class="ref-section">`-Sektion (`:2093-2162`), `cleanRefs` und die Zeile
`character.features = …` (`:1470-1471`), das Prop `onApplyChanges` (`:72`) und die dann toten
Imports. CSS: `.fp-*`, `.feat-*`, `.ref-hint`, `.ref-section` weg — **`.ref-block` bleibt**, das
nutzen die Klassen-/Volks-/Hintergrund-Blöcke oben (`:1670`, `:1712`, `:1754`).

Zwei Stellen lesen Merkmale weiter und ziehen künftig direkt aus dem Draft:

- `grantLinks` (`:783-789`) → `character.features.filter((e) => !e.choice.trim()).map(…)`.
  Nebeneffekt und Gewinn: die ◆-Herkunftsmarker aktualisieren sich, sobald in der Leiste ein
  Talent dazukommt. Kein Read-after-Write, weil das Formular `features` nicht mehr schreibt.
- `summarizeField` (`:1272ff`) → einmal `await resolveCharacterFeatures($state.snapshot(character))`
  im Klick-Handler; das liefert `classGroups`/`speciesGroups`/`backgroundGroups`/`featEntries` in
  einem Zug und ersetzt sowohl die drei Derived als auch `resolveFeatLinks(refFeats)`.

### 6 · `EditorPanel.svelte`: Save-Bar überall, JSON folgt dem Draft

- Neues Opt-in-Prop `saveBarAllTabs = false`; Bedingung (`:89`) wird
  `{#if dirty && (saveBarAllTabs || (tab !== 'karte' && !isExtraTab))}`. `CharacterSheet` setzt es,
  alle anderen Karten bleiben unverändert. Ohne das wäre eine Merkmalsänderung auf Karte, Details
  oder GM-Notizen dirty **ohne** erreichbaren Speichern-Knopf. Kommentar: „Der Charakter hat eine
  Seitenleiste, die auf jedem Tab schreibt — die Leiste ohne Save-Bar wäre eine Falle."
- JSON-Tab: `rawJson` wird heute nur beim Umschalten geholt (`:52-58`) und würde beim Speichern eine
  Leisten-Änderung verschlucken. Neu:
  ```ts
  let jsonTouched = $state(false);   // im Textarea getippt
  let jsonStale   = $state(false);   // Draft weitergezogen, Text von Hand geändert
  let lastSynced  = $state('');
  $effect(() => {
    if (tab !== 'json') return;
    const fresh = getJson();          // liest ed.draft reaktiv
    if (fresh === lastSynced) return;
    if (jsonTouched) { jsonStale = true; return; }
    rawJson = fresh; lastSynced = fresh;
  });
  ```
  `oninput` setzt `jsonTouched`, `switchTab('json')` setzt alle drei zurück; bei `jsonStale` eine
  Hinweiszeile über dem Textarea mit „Neu laden" (setzt zurück wie `switchTab`).

### 7 · Karte-Tab entschlacken

`CharacterSheet.svelte`: `featuresOpen`, der Auflösungs-`$effect` (`:74-90`), `hasFeatureRefs`
(`:93-101`), die Snippets `featureList`/`groupBlock` (`:953-974`), der `<details class="ref-view">`
(`:975-1001`) und die `.ref-view*`-CSS entfallen. `spellAccessRows` (`:59-73`) **bleibt** — das ist
der Zauber-Block, nicht die Merkmalsliste.

### 8 · `src/lib/utils/panelResize.ts` (neu, klein)

Die Ziehlogik von `+page.svelte:292-318` ist die einzige Stelle, die es gibt; eine zweite Kopie im
`CharacterSheet` wäre die dritte Fassung in Sichtweite. Deshalb einmal herausziehen:

```ts
/** Spaltenbreite per Maus ziehen. `invert` für Panels, die am RECHTEN Rand hängen. */
export function dragPanelWidth(e: MouseEvent, o: {
  start: number; min: number; max: number; invert?: boolean;
  onWidth: (w: number) => void; ondone?: () => void;
}): void
```

`+page.svelte` (beide Griffe) und `CharacterSheet` rufen sie; das `no-transition`-Flag setzt der
Aufrufer um den Aufruf herum.

## Betroffene Dateien

| Datei | Rolle |
|---|---|
| `src/lib/components/CharacterFeaturePanel.svelte` *(neu)* | die Leiste: Auflösung, Wahlen, Talente, Verwaiste — schreibt `character.features` |
| `src/lib/components/CharacterSheet.svelte` | Hülle (Breite/Zuklappen/Griff/Lasche), `applyChoiceGrants`, Karte-`<details>` raus |
| `src/lib/components/CharacterEditForm.svelte` | Merkmalsteil raus; `grantLinks` + `summarizeField` lesen aus dem Draft |
| `src/lib/components/EditorPanel.svelte` | `saveBarAllTabs`, JSON-Text folgt dem Draft |
| `src/lib/services/characterChoices.ts` | `findIndex`-Guard `!!e.choice.trim()` → volles Ledger erlaubt |
| `src/lib/utils/panelResize.ts` *(neu)* + `src/routes/+page.svelte` | geteilte Ziehlogik |

Kein Zod-Schema ändert sich → **kein `CHARACTER_VERSION`-Bump, kein Upgrade-Schritt, kein
`npm run schema:examples`**.

## Fallen (die Dinge, die sonst still brechen)

1. **Nie beim Montieren normalisieren oder umsortieren.** Das Formular durfte das (`cleanRefs`, und
   Wahl-Einträge hinten anhängen), weil es nur im Bearbeiten-Tab lebt. Die Leiste ist immer
   montiert: jede Normalisierung beim Laden macht **jeden** Charakter sofort dirty. Nur echte
   Bedienschritte schreiben, und immer an der vorhandenen Position.
2. **Genau ein Schreiber für `character.features`.** Bleibt die Zeile `character.features = …` im
   Sync-`$effect` des Formulars stehen, überschreibt der nächste Tastendruck in *irgendeinem*
   Formularfeld alle Leisten-Änderungen (der Effekt läuft mit veralteten lokalen Kopien).
3. **`await tick()` in `applyChoiceGrants`** — ohne das verliert der Referenz-Swap die letzte,
   noch nicht gespiegelte Formulareingabe.
4. **Der `$effect` der Leiste darf `character.features` nicht lesen**, wo er die Bibliothek auflöst
   — sonst löst jede Antwort eine neue Auflösung aus. Abhängigkeit sind die **Links**
   (`classes`, `species`, `backgroundRef`, Talent-Links); die Verknüpfung mit dem Ledger sind
   `$derived`. Genau so steht es heute im Formular (`:1163-1165`), der Kommentar reist mit.
5. **Talent-Namen ohne Bibliothekstreffer bleiben stehen** (⚠-Zeile + ✎), wie heute — die Leiste
   darf Altbestand nicht wegfiltern.

## Bewusst nicht enthalten

- Die PDF-Freitextfelder und ihre KI-Knöpfe (bleiben im Bearbeiten-Formular).
- `WeaponMasteryPicker` (hat seinen Platz im Übungs-Abschnitt), Zauberwahlen (Zauber-Block).
- **Dass Tippen im JSON-Textarea dirty setzt** — heute tut es das nicht (`rawJson` steckt in keinem
  `snapshot`/`extraDirty`-Hook). Eigener Vorgang; dieser Plan macht den Text nur ehrlich.
- Rücknahme schon übernommener Wirkungen (`applyChanges` ist additiv) — unverändert das, was
  `choiceHint` ansagt.

## Verifikation

1. `npm run check` — das Gate (Typecheck + Lint).
2. App auf Windows starten (`.\dev-windows.ps1`), Log über
   `tail -f /mnt/c/dev/privat/dnd-planner/tauri-dev.log`.
3. **Sichtbarkeit:** Charakter öffnen → Leiste ist offen und zeigt Klassen-/Volks-/Hintergrund-
   merkmale und Talente. Durch alle fünf Tabs schalten (Karte, Bearbeiten, Details, GM-Notizen,
   JSON) → Leiste bleibt stehen und gefüllt. Zuklappen/Aufklappen, Breite ziehen, App neu starten →
   Zustand und Breite sind zurück.
4. **Kein Falsch-Dirty:** Charakter öffnen und **nichts** tun → keine Save-Bar. Danach Tabs
   wechseln → weiterhin keine. Ein Altbestands-Charakter (Wahl-Eintrag vor Talent-Link, kein
   `gainedAt`) ebenso.
5. **Ändern auf jedem Tab:** auf dem **Karte**-Tab in der Leiste ein Talent hinzufügen → Save-Bar
   erscheint, Speichern schreibt. Dasselbe auf **GM-Notizen** (die .md-Autosave-Anzeige daneben
   bleibt unberührt).
6. **Wahlen:** Druide Stufe 1 (Urtümlicher Orden) → „Wächter" wählen → dirty; „Übernehmen" setzt
   Kriegswaffen + mittlere Rüstung, der Knopf verschwindet. Elf Stufe 5 (Abstammung mit `spells`
   1/3/5) → „Übernehmen" trägt die Zauber kumulativ bis Stufe 5 ein, ein zweiter Klick ändert
   nichts. Schurke Stufe 6 → **zwei** Expertise-Zeilen („Stufe 1"/„Stufe 6"), die eigene Antwort
   bleibt in ihrer Zeile wählbar. Optionen der Expertise ändern sich live, wenn im
   Bearbeiten-Formular ein Übungshäkchen umgesetzt wird.
7. **Talent mit eigener Wahl:** ein Talent verlinken, das `grantsChoice` deklariert → seine
   Wahl-Zeile steht in der Talent-Zeile, nicht unter „Entscheidungen ohne zugeordnetes Merkmal".
8. **JSON-Tab:** JSON öffnen, in der Leiste ein Talent entfernen → der Text zieht mit. Dann von
   Hand ins Textarea tippen, in der Leiste erneut ändern → Hinweis + „Neu laden", kein stilles
   Überschreiben. Speichern aus dem JSON-Tab schreibt, was zu sehen ist.
9. **Reihenfolge:** vor/nach einer Wahländerung die Datei prüfen → nur der betroffene Eintrag
   ändert sich, `features[]` bleibt in seiner Reihenfolge.
10. **Regression Aufstieg:** derselbe Schurke ein Level höher — der Checkpoint fragt die Expertise
    unverändert und schreibt an dieselbe Ledger-Stelle (kein Doppel-Eintrag).
11. `npm run eval` **nicht** ausführen — das macht der User.
