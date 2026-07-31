# Grant-Panel aus der Bearbeiten-Karte in Setup- und Level-Up-Flow verschieben

> Umsetzungsplan, erstellt am 2026-07-28 auf Stand Commit `d180c0d`
> („CLAUDE.md auf Regeln reduziert"), noch nicht begonnen.
> Alle Zeilennummern beziehen sich auf diesen Stand.

## Context

Das „Grant-Panel" (`.grant-panel`, Titel „Aus Hintergrund, Klasse, Volk & Talenten")
berechnet deterministisch aus den Bibliotheks-Referenzen eines Charakters (Klasse, Spezies,
Hintergrund, Talente), welche Übungen er bekommen sollte, und bietet einen additiv/idempotenten
„Übernehmen"-Button an. Es lebt heute vollständig im Bearbeiten-Tab
(`src/lib/components/CharacterEditForm.svelte`).

**Problem:** Im Bearbeiten-Kontext ist das Panel Rauschen. Die Entscheidungen sind bereits
gesetzt; das Panel gehört konzeptionell zu *Setup*-Momenten (Erstanlage, nachträgliche
Referenz-Änderung), nicht zum reinen Bearbeiten. Es soll in einen Charakter-Setup-Flow und in
den Level-Up-Flow wandern.

**Zwei Befunde, die aus „verschieben" mehr als ein Verschieben machen:**

1. **Es gibt keinen Creator-Wizard.** Ein neuer Charakter ist ein leeres, hart kodiertes
   Objektliteral in `Sidebar.createCharacter` (`src/lib/components/Sidebar.svelte:349-397`):
   `classes: []`, `backgroundRef/species` leer, `references.feats: []`. Er landet direkt im
   Bearbeiten-Tab; die Referenzen werden *ausschließlich* dort gesetzt. Es gibt keinen
   separaten Auswahlschritt und kein zentrales `makeCharacter`.

2. **Der Level-Up-Flow setzt Proficiencies bereits — aber über einen anderen Mechanismus.**
   Er ist eine reife Zustandsmaschine (`LevelUpAssistant.svelte`, `services/levelUpMachine.ts`,
   `services/levelUp.ts`), die ein uniformes `changeSet` aus additiven `Change`-Einträgen
   projiziert und via `CharacterSheet.applyLevelUp` (`CharacterSheet.svelte:118-207`) anwendet.
   Proficiencies kommen dort aus **KI-gedeuteten Ridern** (`riderChanges`,
   `levelUpMachine.ts:463-482`), **nicht** aus `collectGrants`. Die Change-Targets `proficiency`
   und `expertise` existieren im Schema bereits.

Die zwei Flows adressieren also dieselbe Domäne (Übungen) auf zwei getrennten Wegen —
deterministisch aus Links (Panel) vs. KI-Rider (Level-Up). Beim Verschieben ist das zu
vereinheitlichen, nicht nur umzuhängen.

## Domänen-Aufteilung: welcher Grant gehört wohin

`collectGrants` (`src/lib/services/proficiencyGrants.ts:163-218`) zieht aus vier Quellen. Nach
dem Zeitpunkt, zu dem eine Quelle im Charakterleben entsteht:

| Quelle | Grant | Zeitpunkt |
|---|---|---|
| Hintergrund (inkl. Herkunftstalent `bg.featKey`) | feste Skills + Talent-Übungen | **Setup** (Stufe 1) |
| Startklasse `classes[0]` | volle Kerntabelle (Skill-Wahl, RW, Waffen, Rüstung) | **Setup** (Stufe 1) |
| Spezies + Unterspezies | Merkmals-Übungen | **Setup** (Stufe 1) |
| Zweitklasse `classes[1..]` | Mehrklassen-Zeile (Skills **+ Waffen/Rüstung**, siehe `docs/todo/todo-mehrklassen-grant.md`) | **Level-Up** (Klasse dazu) |
| Talente `references.feats[]` | `proficiencyGrant` je Feat | **Level-Up** (ASI-Stufe) bzw. Setup (Herkunftstalent) |

Das ergibt eine saubere Trennung: **Setup** trägt den vollständigen Stufe-1-Grant, **Level-Up**
trägt Mehrklassen-Zeile und Feat-Übungen.

## Leitprinzip des Refactors

Das Panel schreibt heute **direkt** in geteilte Formular-Runes (`skillFlags`, die
`*SaveProf`-Flags, `profSimpleWeapons`/…/`profShields`) über `applyGrants`/`applySave`
(`CharacterEditForm.svelte:629-670`). Das ist der Grund, warum es an die Edit-Form gekettet ist.

Kern der Extraktion: **Das Panel produziert künftig einen Change-Set und mutiert keine
Runes mehr direkt** — analog zu `applyLevelUp`s `changeSet`. Dann können beide Konsumenten
(Setup und Level-Up) den Grant uniform anwenden, und die Edit-Form wird das Panel los.

## Vorhandene Bausteine

* **`applyLevelUp`-Muster** (`CharacterSheet.svelte:118-207`) — Vorlage für eine
  Change-Set-Anwendung, die per Referenz-Swap `ed.draft = …` Remount + Diff-Highlight auslöst.
  Change-Targets `proficiency`/`expertise` sind schon vorhanden (Schema
  `src/lib/schemas/levelUp.ts:210-230`, Anwendung `CharacterSheet.svelte:177-186`).
* **`collectGrants` + `CollectedGrants`/`OpenChoice`** (`proficiencyGrants.ts`) — die Rechen-Hälfte
  bleibt unverändert; nur ihre Anbindung ändert sich.
* **`docs/todo/todo-mehrklassen-grant.md`** — deckt bereits ab, dass `classes[1..]` auch Waffen/Rüstung
  gewähren muss; ist die Voraussetzung dafür, dass die Level-Up-Integration (Phase 2) ehrlich ist.

## Umsetzung (phasiert)

### Phase 0 — Panel entkoppeln (kein Verhaltenswechsel)

Ziel: Panel und Grant-Anwendung von den Edit-Form-Runes lösen, **noch am selben Ort gerendert**.

1. **Neuer reiner Baustein** `src/lib/services/grantChanges.ts` — `buildGrantChanges(grants,
   picks, sheet)` liefert aus `CollectedGrants` + den vorgemerkten Wahlen einen Change-Set im
   Vokabular von `levelUp.ts` (`proficiency` für Skills; für RW/Waffen/Rüstung entweder
   passende bestehende Targets nutzen oder minimal ergänzen). Reine Funktion, testbar ohne UI.
2. **Neue Komponente** `src/lib/components/GrantPanel.svelte` — bekommt `links` (die
   Referenz-Auswahl) und den relevanten Ist-Zustand des Bogens als Props, rendert das heutige
   Markup (`CharacterEditForm.svelte:1468-1527`) und emittiert bei „Übernehmen" via
   `onApply(changeSet)` statt Runes zu setzen. Mit umziehen (Extraktions-Kandidaten aus
   `CharacterEditForm.svelte`): `grants` (559), `choicePicks` (561), `grantLinks` (565-570),
   der `$effect` (572-579), `grantMarks` (582-594), `grantSourcesFor` (597-599),
   `profGrantSources` (602-609), `choiceTaken` (612-615), `choiceOptions` (617-619),
   `togglePick` (621-626), `applySave` (629-638), `applyGrants` (645-670), `hasGrants` (673-677),
   die Importe aus `proficiencyGrants` (10-12).
3. **`CharacterEditForm.svelte`** rendert vorerst `<GrantPanel … onApply={applyGrantChanges} />`,
   wobei `applyGrantChanges` den Change-Set auf die lokalen Runes anwendet (dünner Adapter). Das
   Verhalten bleibt bit-genau; der Diff ist eine reine Umschichtung.

Verifikation Phase 0: `npm run check`; manuell prüfen, dass „Übernehmen" weiterhin dieselben
Häkchen setzt.

### Phase 1 — Setup-Flow (Stufe-1-Grant)

Da kein Wizard existiert, der **kleine** Weg zuerst (siehe Offene Entscheidung 1):

1. **Setup-Sichtbarkeit** in `CharacterSheet.svelte`: einen „Charakter einrichten"-Abschnitt
   bzw. Dialog zeigen, wenn der Charakter *unkonfiguriert* ist (Referenzen gesetzt, Grant nie
   angewandt — als Delta: `buildGrantChanges` liefert noch nicht-belegte Einträge). Dort
   `GrantPanel` rendern und den Change-Set über einen `applyGrant`-Handler nach dem Muster von
   `applyLevelUp` (`:118-207`) auf `ed.draft` anwenden (Referenz-Swap → Remount).
2. Die Referenz-Auswahl selbst (Klasse/Volk/Hintergrund/Talent) bleibt zunächst in der
   Edit-Form; der Setup-Schritt konsumiert nur deren Ergebnis. Ein echter Auswahl-Wizard ist
   Sache des ausgelagerten [`plan-create-dialog`-Themas](#) und nicht Teil dieses Plans.

### Phase 2 — Level-Up-Integration (Mehrklassen-Zeile + Feat-Übungen)

Voraussetzung: `docs/todo/todo-mehrklassen-grant.md` umgesetzt (sonst zählt `collectGrants` für
Zweitklassen Waffen/Rüstung nicht auf).

1. In der Level-Up-Zustandsmaschine die **deterministischen** Grant-Changes für `classes[1..]`
   (Mehrklassen-Zeile) und für neu gewählte Talente aus `buildGrantChanges` in den bestehenden
   `changeSet` einspeisen — an den passenden Schritten (`choose-class` / `feat-*`).
2. **Reconciliation** mit dem KI-Rider-Pfad (Offene Entscheidung 3): deterministische Grants
   aus dem strukturierten `proficiencyGrant`/der Mehrklassen-Zeile sind maßgeblich; der KI-Rider
   deckt nur, was *nicht* strukturiert abgebildet ist (Freitext-Merkmalseffekte). Doppelte
   `proficiency`-Changes für denselben Skill deduplizieren.

### Phase 3 — Panel aus der Bearbeiten-Karte entfernen

1. `CharacterEditForm.svelte`: Panel-Markup (1468-1527) und die in Phase 0 ausgelagerte Logik
   entfernen; den Adapter `applyGrantChanges` löschen.
2. **◆-Marker** (Skill-Grid 1556-1558, Waffen/Rüstung 1819-1824): Fate offen (Offene
   Entscheidung 2). Empfehlung: als **rein informativen, read-only Provenienz-Hinweis** behalten
   (billig, nicht verwirrend, kein „Übernehmen"), was den lesenden Import von `collectGrants` in
   der Edit-Form belässt, aber keine Interaktion.

## Betroffene Dateien

| Datei | Rolle im Refactor |
|---|---|
| `src/lib/components/CharacterEditForm.svelte` | Quelle: Panel-Markup (1468-1527) + exklusive Logik (559-677) raus; ggf. ◆-Marker read-only behalten |
| `src/lib/components/GrantPanel.svelte` *(neu)* | extrahiertes Panel, `onApply(changeSet)` statt Rune-Mutation |
| `src/lib/services/grantChanges.ts` *(neu)* | reine `buildGrantChanges(...)` → Change-Set |
| `src/lib/components/CharacterSheet.svelte` | Setup-Sichtbarkeit + `applyGrant`-Handler (Muster `applyLevelUp` 118-207); Level-Up-Trigger 755-761 |
| `src/lib/services/levelUpMachine.ts` | Grant-Changes an `choose-class`/`feat-*` einspeisen; Reconciliation mit `riderChanges` (463-482) |
| `src/lib/schemas/levelUp.ts` | ggf. Change-Targets für RW/Waffen/Rüstung ergänzen (Skills via `proficiency` vorhanden) |
| `src/lib/services/proficiencyGrants.ts` | unverändert (nur nach Mehrklassen-TODO angepasst) |
| `docs/todo/todo-mehrklassen-grant.md` | Voraussetzung für Phase 2 |

## Offene Entscheidungen (mit dem User zu klären)

1. **Setup-UX:** kontextueller „Einrichten"-Schritt in `CharacterSheet` (klein, empfohlen) —
   oder direkt den vollen Create-Wizard bauen (koppelt an das ausgelagerte
   Create-Dialog-Refactor, groß).
2. **◆-Marker in der Edit-Form:** read-only Provenienz-Hinweis behalten (empfohlen) oder ganz
   entfernen.
3. **Reconciliation im Level-Up:** deterministische Grants **ersetzen** die KI-Rider-Proficiencies
   für strukturierte Quellen (empfohlen) oder **ergänzen** sie nur.
4. **Reihenfolge:** `docs/todo/todo-mehrklassen-grant.md` vor Phase 2 — bestätigen, dass diese Abhängigkeit
   so gewollt ist.

## Verifikation

* `npm run check` (die Verifikations-Gate), zusätzlich `npx vite build`.
* Phase 0: „Übernehmen" setzt bit-genau dieselben Häkchen wie zuvor.
* Phase 1: neuer Charakter → Referenzen setzen → Setup-Schritt bietet den vollen Stufe-1-Grant;
  nach Anwenden verschwindet der Schritt (Delta leer).
* Phase 2: zweite Klasse Kämpfer anhängen → Level-Up bietet Kriegswaffen + leichte/mittelschwere
  Rüstung + Schilde, **keine** schwere Rüstung, **keine** Fertigkeit (Konsistenz mit
  `docs/todo/todo-mehrklassen-grant.md`).
* Phase 3: Bearbeiten-Tab zeigt kein interaktives Grant-Panel mehr; bestehende Charaktere
  behalten ihre Häkchen unverändert.
