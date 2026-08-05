# Stand: Umsetzung `plan-typsicherheit-und-duplikation.md`

Stand 2026-08-05, Branch `refactor/typsicherheit-und-duplikation` (ab `rework-spellcasting`).
**Alle Phasen umgesetzt** außer den zwei begründeten Abweichungen unten; offen sind nur noch der
Eval-Lauf und die Handprüfung in der App.

## Worktree-Vorbereitung

`/mnt/c/dev/privat/dnd-planner-typsicherheit` hatte weder `node_modules` noch `vault`. Beides
liegt jetzt als Symlink auf `/mnt/c/dev/privat/dnd-planner/` — ohne sie läuft `npm run verify`
hier nicht (18 von 25 Testdateien brauchen den echten Vault). Nicht löschen, kein `npm install`.

## Commits

| SHA | Betreff | Plan |
|---|---|---|
| `8b6d58f` | docs: Aufräum-Plan Typsicherheit und Duplikation | — |
| `d79f8a2` | feat: ein englischer Attributs-Schlüsselsatz (abilities.ts) | 1 (§1a) |
| `fa05a29` | feat!: Attribute als verschachtelte Records, CHARACTER_VERSION 7 | 2–6 (§1b–§1g) |
| `c6a830b` | fix: Change-Vokabular bis zur Senke geschlossen | 7 (§2a) |
| `111763d` | refactor: Übungs-Häkchen aus PROFICIENCY_DEFS statt if-Kette | 8 (§2b/2c) |
| `c07152a` | refactor: Entitätstyp-Unions abgeleitet | 9 (§3a) |
| `b88a81b` | refactor: eine Herkunfts-Aufzählung für Merkmale und Quellen | 10 (§3b) |
| `b81683d` | refactor: Bibliotheks-Status als zwei Achsen | 11 (§3c) |
| `65b4d42` | refactor: Aufstiegs-Laufzustand als Union | 12 (§3d) |
| `489724f` | refactor: Kleinduplikate auf vorhandene Helfer zurückgeführt | 14 (§4) |
| `55aa1e0` | refactor: leerer Charakter aus dem Schema | 15 (§4) |
| `d83ff87` | refactor: createLibrary trägt die gemeinsame Info-Form | 16 (§4) |
| `5fcc7a6` | refactor: nur noch ein Importpfad für AbilityKey | Nachtrag §1a |
| `e813a4a` | refactor: characterWizard aufgeteilt | 17 (§5a) |
| `444dc18` | refactor: Wahl- und Rider-Ableitung des Wizards als Funktionen | 17 (§5a) |
| `922a16a` | refactor: ItemCard aufgeteilt | 18ff (§5b) |
| `c3ba74e` | refactor: LevelUpAssistant aufgeteilt | 18ff (§5b) |
| `945a896` | refactor: NpcCard aufgeteilt | 18ff (§5b) |
| `edd6261` | refactor: CampaignTree aufgeteilt | 18ff (§5b) |
| `7d4cd0c` | refactor: MonsterMiniCard aufgeteilt | 18ff (§5b) |
| `ed911ef` | refactor: MonsterEditForm aufgeteilt | 18ff (§5b) |
| `3cccb6e` | refactor: LlmPanel aufgeteilt | 18ff (§5b) |
| `db393d4` | refactor: tote CSS-Regel .wide-sm entfernt | Nachtrag §5b |
| `fb30fa3` | refactor: CharacterSheet aufgeteilt | 18ff (§5b) |
| `a3388a2` | refactor: Sidebar aufgeteilt | 18ff (§5b) |
| `7c37b11` | refactor: CharacterEditForm aufgeteilt | 18ff (§5b) |
| `cc3c9c3` | fix: Kompaktansicht bringt ihr Aussehen selbst mit | Nachlese |
| `c3d399d` | refactor: Grant-Leerheit an einer Stelle, total über keyof | Nachlese |
| `c404164` | refactor: komponenteneigenes Monster-Formular-CSS in die Komponente | Nachlese |

Die drei „Nachlese"-Commits stammen aus der Durchsicht unter der Frage, wie viele Dateien **eine**
Änderung anfasst — sie standen nicht im Plan.

`npm run verify` ist nach jedem Commit grün. Warnungen: **42 → 38**, allein durch das Aufteilen
(drei gleiche `autofocus`-Stellen wurden eine geteilte `NewEntryRow`, eine tote CSS-Regel fiel).
Keine Komponente liegt mehr über 400 Zeilen.

## Abweichungen vom Plan

**Plan-Commits 2–6 sind ein Commit** (`fa05a29`). Ein Rettungs-Commit aus einem abgebrochenen Lauf
hatte sie schon vermischt; retroaktiv getrennt hätten die Teilcommits einzeln nicht kompiliert —
der Schemawechsel und seine Senken hängen zusammen.

**§3e (`encodePick`/`decodePick`) entfällt.** Der Plan macht ihn vom Zustand des Branches
`rework-spellcasting` abhängig; dessen Commit `41c5082` fasst genau die `encodePick`-Verbraucher an
(`CharacterWizard`, `SpellStep`, `spellStep.svelte.ts`). Bleibt offen und hängt ohnehin an
`character.spells`.

**Zwei Dateien bleiben bewusst über dem Richtwert**, beide eine zusammenhängende `$state`-Einheit,
deren Aufteilung private Felder öffnen oder dieselben veränderlichen Records über Dateigrenzen
fädeln müsste:

| Datei | Zeilen | Grund |
|---|---|---|
| `services/wizard/characterWizard.svelte.ts` | 400 (von 465) | Getter lesen quer über die Felder, Job-Steuerung hängt an `#prep`/`#getConfig`; die reinen Wahl-/Rider-Ableitungen sind heraus (`wizard/wizardChoices.ts`) |
| `components/sidebar/campaign/campaignTreeState.svelte.ts` | 342 (neu) | eine Lade-/Anlege-/Navigier-Zustandsmaschine über ein Dutzend voneinander abhängige `Record`-Felder |

**Die `createCardEditor`-Migration wurde nicht mitgemacht.** Der Plan erwog sie für `ItemCard` /
`NpcCard` / `MonsterMiniCard` als „natürlichen Schnitt". `ItemCard` und `NpcCard` liefen schon
darüber; `MonsterMiniCard` läuft weiter mit eigener Lade-/Speicher-Logik, weil ihr Copy-on-write
(global → akt-lokale Kopie → befördern) in `CardEditorConfig<T>` kein Gegenstück hat — das wäre
eine Erweiterung von `cardEditor.svelte.ts`, kein reiner Aufruf, und damit die offene
Gestaltungsentscheidung, nicht Beiwerk eines Struktur-Refactors.

## Funde, die kein Plan-Punkt waren

- **`_version` hatte `.optional()` ohne Default**, weshalb `characterSchema.parse({name})` nicht
  feldgleich zum handgeschriebenen leeren Charakter war. Default gesetzt (`55aa1e0`); sicher, weil
  `characterVersionOf` eine fehlende `_version` als `1` liest und beide Lesepfade über
  `upgradeCharacter` stempeln, bevor das Schema greift — der Default greift nur bei frisch
  entstandenen Charakteren. Nebenwirkung: `_version` ist Pflichtfeld im `Character`-Typ und deckte
  drei echte Stellen auf, darunter toten Code in `characterPdfIo.ts`.
- **`schemas/classProgression.ts` reichte `AbilityKey`/`ABILITY_KEYS` weiter** — zweiter Importpfad
  für dasselbe Vokabular, behoben in `5fcc7a6`.
- **Svelte-scoped-CSS-Falle beim Aufteilen:** `.act-row:hover .entry-del` verlor sein Ziel, als der
  Knopf in eine Kindkomponente wanderte — der Löschen-Knopf der Akt-Zeile wäre stillschweigend
  dauerhaft unsichtbar geworden, sichtbar nur als „unused CSS selector". Behoben in `edd6261`.
  Jede solche Warnung ist entweder eine zu verschiebende oder eine zu löschende Regel; eine
  unscoped `.css`-Datei versteckt sie nur (`db393d4`).
- **`MonsterEditForm::addAction` vergibt in allen vier Kategorien hart `name: 'Neue Aktion'`**, auch
  bei „Eigenschaft"/„Reaktion". Beim Aufteilen bewusst unverändert übernommen — echter kleiner Bug,
  eigene Entscheidung.

## Funde der Lokalitäts-Durchsicht

Kriterium: wie viele Dateien muss anfassen, wer *eine* Sache ändert.

- **Behoben.** Die Grant-Leerheit stand dreimal als handgeschriebene Feldkette (`c3d399d`), das
  komponenteneigene Aussehen der Monster-Formularteile in einer von fünf Komponenten geteilten
  `.css` (`c404164`), und `MonsterCompactView` hatte beim Aufteilen gar keinen eigenen Stil
  mitbekommen (`cc3c9c3`).
- **`.ef` steht zweimal**, in `app.css` und in `monsterEditForm.css`, mit unterschiedlichen Werten.
  Beide sind global, also entscheidet die Bündelreihenfolge, und die Monster-Variante gilt heute für
  jedes Formular der App. Nicht angefasst: jede Auflösung ändert sichtbar das Aussehen und gehört
  in eine eigene Entscheidung.
- **`libraries.rs`/`lib.rs` zählen die Bibliothekstypen an neun Stellen von Hand auf.** Derselbe
  Schnitt wie hier, aber auf der Rust-Seite — braucht einen vollen Recompile und liegt außerhalb
  dieses Branches.
- **Kein Fund:** dass `templates` in den Export-/Import-Stellen fehlt, ist Absicht —
  `vault/libraries.yaml:71-73` führt sie als „funktional erforderlich … nicht als Inhalt behandelt".

## Offen

1. **`npm run eval` durch den Nutzer** — Halt nach Plan-Commit 6. Berührter Prompt:
   `services/aiActions/featureEffectsPrompts.ts` Regel 6, die die deutschen Schlüssel nicht mehr
   erklärt, sondern `str, dex, con, int, wis, cha` nennt. Erwartet wird eine Verbesserung.
2. **Handprüfung in der App** (`.\dev-windows.ps1`, Log via `tail -f tauri-dev.log`) —
   `npm run verify` deckt weder den Formatwechsel noch die Komponenten-Aufteilung ab:
   - **Charakter-Roundtrip, die Kernabsicherung von Phase 1:** Charakter laden (Banner erscheint) →
     *Aktualisieren* → speichern → `character.json` gegen die Vorversion diffen (nur Attributsfelder
     dürfen sich unterscheiden, kein Wert sich ändern) → PDF exportieren und gegen einen vor der
     Umstellung erzeugten Export vergleichen → dasselbe PDF wieder importieren.
   - Neuen leeren Charakter und Wizard-Charakter anlegen, beide `character.json` feldgleich zu einem
     vorher angelegten (schärfster Test für `characterSchema.parse`).
   - `GES/KON/WEI` in Bogen, Editor, Monster-Karte, Monster-Editor, NPC-Karte, Zauber-Editor,
     Encounter-Druck — überall deutsch, Zahlen unverändert.
   - Karten aller Typen öffnen, „Neues X" je Typ, Bibliotheksverwaltung mit gesperrter **und**
     aktualisierbarer Bibliothek, Stufenaufstieg vollständig inkl. Abbruch und Fehlerfall.
   - Je aufgeteilte Komponente: öffnen, bearbeiten, speichern, verwerfen, Tab wechseln, mit
     ungespeicherten Änderungen navigieren (`confirmNavigation` ist die empfindlichste Stelle).
     Zwei Stellen verdienen einen gezielten Blick: der Hover-Reveal von Papierkorb und „+" in der
     Akt-Zeile der Kampagnen-Leiste, und die Übernahme eines Stufenaufstiegs ins Bearbeiten-Formular.
3. **Der Branch hängt hinter `rework-spellcasting`** (`41c5082` fehlt hier) — vor dem Merge
   abgleichen.
