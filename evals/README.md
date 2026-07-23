# Prompt-Qualitäts-Evals

Test-Strecke, um die **Antwort-Qualität** der KI-Actions zu messen und Prompts zu
optimieren, ohne dass die Qualität sinkt. Läuft headless (ohne Tauri) über den
echten Produktionspfad (`runAiAction`); außerhalb von Tauri fällt der HTTP-Transport
via `src/lib/services/httpFetch.ts` auf das globale `fetch` zurück.

## Ausführen

Echte LLM-Calls über QualityMinds — daher per env-Key gated (ohne Key wird alles
übersprungen, kein CI-Bruch):

```bash
QM_API_KEY=…  EVAL_MODEL=<vLLM-Modell>  npm run eval
```

Optional: `EVAL_RUNS` (Default 5), `EVAL_THRESHOLD` (Default 0.9). `npm run eval:watch`
für den Watch-Modus.

## Aufbau

- `harness.ts` — generischer Runner: führt eine Action N-mal aus, prüft je Lauf die
  Assertions und aggregiert **Pass-Raten**. `compareVariants` misst mehrere
  Prompt-Varianten gegeneinander.
- `fixtures/` — definierte Inputs + Referenz-Erwartungen (z.B. Druide L3, Zirkel des Landes).
- `prompts/` — Prompt-Varianten. `BASELINE` wird aus der Produktions-Action gezogen
  (kein Drift); `CANDIDATE` ist die gekürzte Fassung zum Tunen.
- `cases/` — Assertions je Fall (Core = gaten den Schwellwert, Soft = nur berichtet).
- `*.eval.test.ts` — Vitest-Einstieg.

## Prompt optimieren

1. `npm run eval` → Baseline-Report (Pass-Rate je Assertion, Latenz, Fehler).
2. `prompts/featureEffects.ts` → `FEATURE_EFFECTS_CANDIDATE` kürzen/umformulieren.
3. Erneut `npm run eval` → die Vergleichs-Tabelle zeigt Baseline vs. Candidate je
   Assertion nebeneinander. Hält der Kandidat die Core-Pass-Raten, ist er sicher übernehmbar.

## Neuen Fall/Action ergänzen

Fixture + Case (Assertions) nach dem Muster von `featureEffects-druid-circle.ts`
anlegen und im Test einbinden. Der Harness ist generisch über den Action-Ergebnistyp.
