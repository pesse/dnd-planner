# Prompt-Qualitäts-Evals

Test-Strecke, um die **Antwort-Qualität** der KI-Actions zu messen und Prompts zu
optimieren, ohne dass die Qualität sinkt. Läuft headless (ohne Tauri) über den
echten Produktionspfad (`runAiAction`); außerhalb von Tauri fällt der HTTP-Transport
via `src/lib/services/httpFetch.ts` auf das globale `fetch` zurück.

Ein Lauf wertet immer **genau einen Prompt** aus und schreibt **einen Report**.
Prompts vergleicht man, indem man die Eval mehrmals mit unterschiedlichem
`EVAL_PROMPT`/`EVAL_TITLE` laufen lässt und die entstehenden Reports (jeweils mit
eigenem Titel/Beschreibung) extern nebeneinanderlegt.

## Ausführen

Echte LLM-Calls über QualityMinds — daher per env-Key gated (ohne Key wird alles
übersprungen, kein CI-Bruch). Am einfachsten über eine `.env` im Projekt-Root
(`.env.example` kopieren, `.env` ist gitignored):

```bash
cp .env.example .env   # dann QM_API_KEY + EVAL_MODEL eintragen
npm run eval
```

Alternativ direkt inline (überschreibt die `.env`):

```bash
QM_API_KEY=…  EVAL_MODEL=<vLLM-Modell>  npm run eval
```

Alle Optionen gibt es auch als **CLI-Flags** (bequemer als env, v.a. für Titel/Beschreibung;
funktioniert auch aus Windows PowerShell). Flags überschreiben die `.env`:

```bash
npm run eval -- --prompt candidate --title kurz-v1 --desc "ASI-Regel gekürzt"
npm run eval -- --runs 3 --concurrency 1        # saubere Einzel-Latenz
npm run eval -- --help                           # alle Flags
```

Verfügbare Flags: `--prompt --title --desc --runs --threshold --concurrency --model --api-key`
(jeweils auf die gleichnamige `EVAL_*`-Variable gemappt).

Von **Windows PowerShell** ausführen, nicht WSL (dort sind die `node_modules` installiert;
WSL scheitert an plattform-spezifischen Native-Binaries). Die Eval selbst braucht kein Tauri.

Optionale env-Variablen (auch in der `.env`):
- `EVAL_PROMPT` — welcher Prompt getestet wird (Default `baseline`; verfügbare Namen
  in `prompts/featureEffects.ts` → `FEATURE_EFFECTS_PROMPTS`).
- `EVAL_TITLE` / `EVAL_DESC` — Titel + Beschreibung des Reports. Der Titel landet im
  Ordnernamen (`reports/<timestamp>-<titel>/`) und macht mehrere Läufe unterscheidbar
  (Default-Titel = Prompt-Name).
- `EVAL_RUNS` — Läufe pro Assertion (Default 5). **Bei langsamen Modellen 2–3 wählen** —
  es sind echte LLM-Calls (Steps × RUNS Calls gesamt).
- `EVAL_THRESHOLD` — Mindest-Pass-Rate der Core-Assertions (Default 0.9).
- `EVAL_CONCURRENCY` — parallele Läufe **je Step** (Default 4; Varianten/Steps bleiben
  sequenziell). vLLM batcht das server-seitig → deutlich schneller. **`EVAL_CONCURRENCY=1`
  für saubere Einzel-Latenz** — unter Last (>1) sind die Latenz-Zahlen queue-/batch-bedingt
  höher; der Report vermerkt die verwendete concurrency.
- `EVAL_TIMEOUT_MS` — Gesamt-Test-Timeout (Default 30 min). Hoch, weil viele echte Calls laufen.
- `EVAL_CALL_TIMEOUT_MS` — Per-Call-Timeout (Default 2 min); kappt einen hängenden LLM-Request,
  der Lauf wird als Fehler verbucht und die Strecke läuft weiter.

Während des Laufs zeigt die Konsole live pro Call eine Zeile
(`· <Step>: run i/N …` → `→ ok 21.3s (server 20.9s), 340 tok, core 4/5`), sodass du
den Fortschritt und die Dauer je Request direkt siehst.

`npm run eval:watch` für den Watch-Modus. Die `.env` wird von `vitest.config.ts` geladen.
Der Report wird **nach jedem Step inkrementell** geschrieben — ein Timeout verliert also
keine bereits gemessenen Daten.

## Ergebnisse (Dateien)

Jeder Lauf schreibt nach `evals/reports/<timestamp>-<titel>/` (gitignored):

- `report.html` — **self-contained** (kein Server/JS): Ergebnis-Tabellen (Pass-Raten,
  Latenz, Tokens) + je Lauf aufklappbar Prompt, rohe Response, geparstes Ergebnis und
  Assertions (grün/rot). Einfach im Browser öffnen — der beste Weg, lange Prompts/Antworten zu lesen.
- `summary.md` — menschenlesbar: Pass-Raten je Assertion, **Latenz** (min/median/avg/p95/max
  + Gesamtdauer), Server-Zeit und Token-Verbrauch je Step.
- `summary.json` — dieselben Aggregate maschinenlesbar.
- `runs.jsonl` — **ein Lauf pro Zeile** mit dem **echten Request** (URL, redigierte Header,
  Body = voller Prompt + Schema), der **rohen Response** (content/usage), dem geparsten
  Ergebnis sowie Wall-Clock- und Server-Zeit. Der Pfad wird am Ende in die Konsole geloggt.

Die Konsole zeigt zusätzlich Live-Tabellen (Pass-Raten, Latenz, Tokens); Vitest selbst
gibt die Gesamtlaufzeit der Suite aus.

## Aufbau

- `harness.ts` — generischer Runner: führt eine Action N-mal aus, prüft je Lauf die
  Assertions und aggregiert **Pass-Raten** (`runEval` — genau ein Prompt).
- `fixtures/` — definierte Inputs + Referenz-Erwartungen (z.B. Druide L3, Zirkel des Landes).
- `prompts/` — Prompt-Registry. `baseline` wird aus der Produktions-Action gezogen
  (kein Drift); weitere Einträge (z.B. `candidate`) sind gekürzte Fassungen zum Tunen.
- `cases/` — Assertions je Fall (Core = gaten den Schwellwert, Soft = nur berichtet).
- `*.eval.test.ts` — Vitest-Einstieg.

## Prompt optimieren

1. `npm run eval` → Baseline-Report (Pass-Rate je Assertion, Latenz, Fehler);
   liegt unter `reports/<timestamp>-baseline/`.
2. `prompts/featureEffects.ts` → `FEATURE_EFFECTS_CANDIDATE` kürzen/umformulieren
   (oder einen neuen Eintrag in `FEATURE_EFFECTS_PROMPTS` anlegen).
3. `EVAL_PROMPT=candidate npm run eval` → eigener Report unter
   `reports/<timestamp>-candidate/`. Baseline- und Candidate-`report.html`
   nebeneinander öffnen und die Core-Pass-Raten vergleichen. Hält der Kandidat sie,
   ist er sicher übernehmbar.

## Neuen Fall/Action ergänzen

Fixture + Case (Assertions) nach dem Muster von `featureEffects-druid-circle.ts`
anlegen und im Test einbinden. Der Harness ist generisch über den Action-Ergebnistyp.
