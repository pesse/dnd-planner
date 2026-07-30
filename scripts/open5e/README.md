# Open5e-Anbindung

Die App bindet **Open5e v2** (`https://api.open5e.com/v2`) direkt zur Laufzeit an —
es gibt **kein** Build-/Extraktions-Skript und **kein** gebündeltes JSON-Artefakt mehr.

## Warum kein Extraktions-Skript?

v1 lieferte die Klassen-Progression nur als Markdown-Tabelle → früher nötig: ein
fragiler Parser + committetes JSON. **v2 ist vollstrukturiert:**

- Stufentabelle datengetrieben: jede Spalte („1st"…„9th", „Proficiency Bonus",
  „Cantrips", „Rages", „Weapon Mastery", …) ist ein Feature mit `data_for_class_table`.
- Merkmale mit `gained_at: [{level}]` (mehrere Stufen möglich).
- `caster_type`, `saving_throws`, `hit_points`, `document` (Quelle inkl. `gamesystem`).
- Dokumente: **`srd-2024` = SRD 5.2** (Default, passt zu 5.2.1) *und* `srd-2014` = 5.1.

Damit wird die API direkt konsumiert; kein Zwischenartefakt zu pflegen.

## Codepfad

- `src/lib/services/open5eApi.ts` — Transport (Tauri `http_request`, wie `dndApi.ts`):
  `getClass(key)`, `listClasses()`, `getSubclasses(parentKey, allowedDocs)`.
- `src/lib/services/classProgression.ts` — `mapV2()` bildet rohes v2 auf den offenen
  internen Zod-Typ ab; `getProgression(klasseDe)` holt+cached (In-Memory, pro Session);
  Reader `spellSlotsAt` / `columnValue` / `featuresGainedAt` / `proficiencyBonus`.
- `src/lib/schemas/classProgression.ts` — dünner Adapter-Typ (offene `levels[].columns`,
  `features[].gainedAt`, `document`), entkoppelt von Open5es Schema; Zod-validiert für
  graceful degradation bei fremden/Homebrew-Dokumenten.
- `src/lib/services/characterRules.ts` — baut den `<class_progression>`-Prompt-Block und
  `applyClassMechanics()` (deterministischer Schluss-Pass).

## Grenzen

- **Rüstungs-/Waffen-/Fertigkeits-Übungen** liefert v2 NICHT strukturiert (nur Prosa im
  Feature „Core … Traits") → die bleiben der LLM-Schicht überlassen, nicht dem
  deterministischen Verifier.
- **Multiclassing**: Zauberplätze aktuell additiv je Klasse (vereinfachte Regel), nicht
  über die kombinierte Caster-Tabelle. Volle Regeln später.
- **Offline**: Klassendaten kommen zur Laufzeit aus dem Netz (In-Memory-Cache pro
  Session). Ein persistenter Cache wäre optional nachrüstbar, falls Offline-Charakterbau
  gefordert ist.
- **Quellen/Lizenz**: Nicht-SRD-Quellen (OGL/Drittanbieter) sind über `document.key`
  filterbar; beim Anzeigen/Export ist Attribution mitzuführen.
