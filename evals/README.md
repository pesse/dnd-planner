# Prompt-Qualitäts-Evals

Test-Strecke, um die **Antwort-Qualität** der KI-Actions zu messen und Prompts zu
optimieren, ohne dass die Qualität sinkt. Läuft headless (ohne Tauri) über den
**echten Produktionspfad** (z.B. der QM-Dreipass `generateFeatureEffects`); außerhalb
von Tauri fällt der HTTP-Transport via `src/lib/services/httpFetch.ts` auf das globale
`fetch` zurück.

Ein Lauf wertet immer die **echten Action-Prompts** aus und schreibt **einen Report**.
Einen Prompt tunt man, indem man ihn **direkt in der Action** ändert und die Eval
erneut laufen lässt — die entstehenden Reports (jeweils mit eigenem `EVAL_TITLE`)
legt man extern nebeneinander und vergleicht die Core-Pass-Raten.

Es gibt **eine Strecke je Datei** (`*.eval.test.ts`); jede schreibt ihren eigenen
Report. Eine neue Strecke für einen einfachen Prompt ist eine Datei mit
`defineEval({ name, cases })` — siehe [Neue Strecke in 5 Minuten](#neue-strecke-in-5-minuten).

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
npm run eval -- --title kurz-v1 --desc "ASI-Regel gekürzt"
npm run eval -- --runs 3 --concurrency 1        # saubere Einzel-Latenz
npm run eval -- --eval spell                     # nur die Zauber-Strecke
npm run eval -- --help                           # alle Flags
```

**`--eval <muster>`** filtert die Dateien (Vitest-Filter). Ohne das Flag laufen **alle**
Strecken — bei echten LLM-Calls schnell teuer, deshalb beim Prompt-Tunen immer auf die
eine Strecke einschränken.

Verfügbare Flags: `--title --desc --runs --threshold --concurrency --model --api-key`
(jeweils auf die gleichnamige `EVAL_*`-Variable gemappt).

Von **Windows PowerShell** ausführen, nicht WSL (dort sind die `node_modules` installiert;
WSL scheitert an plattform-spezifischen Native-Binaries). Die Eval selbst braucht kein Tauri.

Optionale env-Variablen (auch in der `.env`):
- `EVAL_TITLE` / `EVAL_DESC` — Label + Beschreibung des Laufs. Das Label wird an den
  Namen der Strecke angehängt (`reports/<timestamp>-<strecke>-<label>/`) und macht
  mehrere Läufe derselben Strecke unterscheidbar. Ohne Label: `…-<strecke>/`.
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

- `defineEval.ts` — **Schnell-Baukasten**: `defineEval({ name, cases })` baut die
  komplette Vitest-Suite (Gate, Config, Capture, N Läufe, Report, Qualitäts-Gate).
  Das ist der Einstieg für neue Strecken.
- `checks.ts` — Einzeiler-Helfer für Assertions (`nonEmpty`, `minChars`, `mentions`,
  `unchanged`, `inRange`, `same`, `text`).
- `env.ts` — gemeinsame Env-Auswertung (Key-Gate, LlmConfig, Läufe/Schwellwert/…).
- `harness.ts` — generischer Runner: führt einen Fall N-mal aus (echter Produktionspfad
  via `step.run`, sonst `runAiAction`), prüft je Lauf die Assertions und aggregiert
  **Pass-Raten** (`runEval`).
- `report.ts` — Capture der echten Requests/Responses + die vier Report-Artefakte.
- `fixtures/` / `cases/` — **nur bei größeren Fällen**: geladene Inputs bzw. Assertions
  in eigenen Dateien (Muster: `druid-l3-circle-of-land.ts` + `featureEffects-druid-circle.ts`).
- `*.eval.test.ts` — eine Strecke je Datei.

Bestehende Strecken:
- `spell.eval.test.ts` — Zauber anlegen/überarbeiten (einfacher Ein-Call-Prompt, alles in
  einer Datei) — die Vorlage zum Abschauen.
- `featureEffects.eval.test.ts` — Merkmals-Effekte beim Stufenaufstieg (mehrstufiger
  Produktionspfad, Fall-Aufbau lädt Vault-Daten).

## Neue Strecke in 5 Minuten

Eine Datei `evals/<name>.eval.test.ts` anlegen — mehr braucht es nicht. Fälle sind
`{ label, action, input, core, soft }`; die Assertion-Objekte sind **Label → Prüfung**:

```ts
import type { Item } from '../src/lib/types';
import { createItemAction } from '../src/lib/services/aiActions/itemAction';
import { defineEval } from './defineEval';
import { mentions, minChars, nonEmpty } from './checks';

defineEval<Item>({
  name: 'item',
  description: 'Gegenstand per KI anlegen',
  cases: [
    {
      label: 'Magischer Umhang',
      action: () => createItemAction({ name: 'Umhang der Nebel' }),
      input: 'Ein seltener magischer Umhang, der einmal pro Tag unsichtbar macht.',
      core: {
        'Name gesetzt': (i) => nonEmpty(i.name),
        'Beschreibung ≥ 150 Zeichen': (i) => minChars(i.desc, 150),
        'als selten eingestuft': (i) => mentions(i.rarity?.name, 'rare'),
      },
      soft: { 'Einstimmung angegeben': (i) => i.attunement != null },
    },
  ],
});
```

Dann `npm run eval -- --eval item --runs 3`. Regeln der Praxis:

- **core** = harte Vorgaben aus dem Input (Grad, Schule, Pflichtfelder). Diese Pass-Raten
  gaten den Schwellwert — nur reinnehmen, was der Prompt wirklich garantieren soll.
- **soft** = Wunsch-Verhalten (Stil, optionale Felder). Wird berichtet, bricht aber nichts.
- Für „überarbeiten"-Prompts ist `unchanged(vorlage, ergebnis, 'feld', …)` die wichtigste
  Prüfung: die KI soll **nur** das Gewünschte anfassen.
- Braucht ein Fall mehrere verkettete Calls oder geladene Vault-Daten, statt
  `action`/`input` ein `run: (config) => Promise<T>` setzen und `cases` als (async)
  Funktion übergeben — siehe `cases/featureEffects-druid-circle.ts`.

## Prompt optimieren

1. `npm run eval -- --eval spell --title baseline` → Referenz-Report (Pass-Rate je
   Assertion, Latenz, Fehler).
2. Den Prompt **direkt in der Action** ändern (z.B. in
   `src/lib/services/aiActions/spellAction.ts`).
3. `npm run eval -- --eval spell --title kandidat` → eigener Report. Beide `report.html`
   nebeneinander öffnen und die Core-Pass-Raten vergleichen. Hält der Kandidat sie,
   ist er sicher übernehmbar.

Es gibt bewusst **keinen A/B-Modus im Code**: ein Lauf misst genau einen Prompt-Stand.
Vergleiche entstehen durch mehrere Läufe mit unterschiedlichem `--title`.
