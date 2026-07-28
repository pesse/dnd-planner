# TODO: Mehrklassen-Grant auf den vollen Übungs-Grant erweitern

> Folgearbeit aus `plan-uebungen-kerntabelle.md`, offen seit 2026-07-28.
> Bewusst dort ausgeklammert, weil der Plan `skillGrantMulticlass` als
> `skillGrantSchema` festgelegt hatte.

## Problem

Beim Multiclassing gewährt eine dazukommende Klasse laut SRD 5.2 („Als Charakter mit
Klassenkombination") nicht nur Fertigkeiten, sondern auch **Waffen- und
Rüstungsübungen**. Heute trägt `classProgressionSchema.skillGrantMulticlass` nur
einen `skillGrant` — `collectGrants` kann für eine zweite Klasse deshalb *nur* eine
Fertigkeitswahl anbieten.

Die Folge ist eine Halbwahrheit im Grant-Panel: es behauptet, die Grants einer Quelle
vollständig aufzuzählen, lässt bei Zweitklassen aber Waffen/Rüstung weg. Beispiele
aus dem deutschen SRD-Auszug (`src/lib/data/rules-chunks.json`, Abschnitte
„Als Charakter mit Klassenkombination"):

| Zweitklasse | gewährt zusätzlich |
|---|---|
| Barbar | Kriegswaffen, Schilde |
| Kämpfer | Kriegswaffen, leichte + mittelschwere Rüstung, Schilde |
| Paladin | Kriegswaffen, leichte + mittelschwere Rüstung, Schilde |
| Waldläufer | Kriegswaffen, leichte + mittelschwere Rüstung, Schilde |
| Barde, Druide, Hexenmeister, Kleriker, Schurke | leichte Rüstung (Kleriker/Druide zusätzlich Schilde) |
| Magier, Mönch, Zauberer | nichts außer Trefferpunktewürfel |

**Achtung:** die Mehrklassen-Zeile ist *nicht* die Kerntabelle. Ein Kämpfer als
Zweitklasse gewährt z.B. **keine** schwere Rüstung und **keine** Fertigkeit, obwohl
seine Kerntabelle beides führt. Die Werte müssen also weiterhin aus dem SRD-Abschnitt
kommen, nicht aus `proficiencyGrant`.

## Umsetzung

1. **`src/lib/schemas/classProgression.ts`** — `skillGrantMulticlass: skillGrantSchema`
   → `proficiencyGrantMulticlass: proficiencyGrantSchema`. Migration im bestehenden
   `migrateClassLegacy`: alter `skillGrantMulticlass` → `…Multiclass.skills`
   (idempotent, altes Feld entfernen).
2. **`src/lib/services/proficiencyGrants.ts`** — in `collectGrants` für `classes[1..]`
   `addGrant(…)` statt `addSkillGrant(…)`. Sonst nichts: die Summierung ist schon eine
   Funktion für alle Arten.
3. **`scripts/migrate-proficiency-grants.mts`** — die Tabelle oben als
   `MULTICLASS_GRANTS` hinterlegen (heute nur `MULTICLASS_SKILLS`, nur drei Klassen)
   und beim Schreiben gegen `rules-chunks.json` kreuzvalidieren, analog zum
   Kerntabellen-Gate. Vorhandene, handgepflegte Werte weiterhin nicht überschreiben.
4. **`src/lib/components/ClassEditForm.svelte`** — der Abschnitt „Bei
   Klassenkombination" nutzt dann `ProficiencyGrantEditForm` (scope `full`) statt
   `SkillGrantEditForm`; `ClassCard` zeigt Waffen/Rüstung in der Zeile mit.
5. **Vault** — Skript laufen lassen; `vault/CLAUDE.md`, Abschnitt „Grundmechanik ist
   englisch", auf den neuen Feldnamen ziehen.

## Verifikation

* `npm run check`, `node scripts/gen-schema-overview.mjs`, `npx vite build`
* Skript zweimal laufen lassen → zweiter Lauf ändert keine Datei (Idempotenz)
* Manuell: zweite Klasse Kämpfer anhängen → Panel bietet Kriegswaffen + leichte und
  mittelschwere Rüstung + Schilde, **keine** schwere Rüstung, **keine** Fertigkeit
