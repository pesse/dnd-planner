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

### Übersicht aller Reports (`reports/index.html`)

`evals/reports/index.html` listet alle vorhandenen Reports (Titel, Beschreibung,
Core-/Soft-Pass-Rate, Ø-Latenz, Modell) und verlinkt jeweils die `report.html` zum
Öffnen. Die Seite lädt ihre Daten zur Laufzeit aus `reports/manifest.json` — daher
**über localhost/HTTP öffnen** (per `file://` blockt der Browser das `fetch`), z.B.:

```bash
npx serve evals/reports        # dann http://localhost:3000/ öffnen
```

Das `manifest.json` wird **nach jedem Eval-Lauf automatisch** aktualisiert (aus
`writeEvalReport`), ein separater Bau-Schritt ist nicht nötig. Nur wenn du Report-Ordner
von Hand löschst/verschiebst, einmal manuell neu bauen:

```bash
npm run eval:index
```

## Aufbau

- `defineEval.ts` — **Schnell-Baukasten**: `defineEval({ name, cases })` baut die
  komplette Vitest-Suite (Gate, Config, Capture, N Läufe, Report, Qualitäts-Gate).
  Das ist der Einstieg für neue Strecken.
- `promptCase.ts` — **Prompt-Werkstatt**: rohe Prompts ohne `AiAction` messen —
  `promptCase(…)` für einen Call, `chatCase(…)` für einen ganzen Turn-Verlauf.
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
- `promptLab.eval.test.ts` — roher Prompt ohne Action (Vorlage für Prompt-Entwürfe).
- `featureAnalysis.eval.test.ts` — Pass-A-Manifest als Prompt-Entwurf: ein Call vs.
  Verlauf mit fester Analyse-Antwort und nachgereichter Wahl (Vorlage für `chatCase`).
- `featureEffects.eval.test.ts` — Merkmals-Effekte beim Stufenaufstieg (mehrstufiger
  Produktionspfad, Fall-Aufbau lädt Vault-Daten).
- `levelUpFeat.eval.test.ts` — der Talent-Pfad des Aufstiegs (Kämpfer 3→4, „Magiekundiger"):
  KI-Deutung (Fall A, Referenz) gegen deklarierten Zauber-Zugang (Fall B, gatet, ohne LLM) mit
  denselben Prüfungen.
- `wizardFeatures.eval.test.ts` — Merkmalsanalyse im Charakter-Erstell-Wizard (Stufe 1,
  Gnom-Zauberer / Weiser): Volks-Wahl blockiert die Zauber, das Herkunftstalent ist eine
  Zauber-Wahl, fünf wahllose Merkmale sind die Negativprobe. Eingang über
  `buildFeaturePrep` — denselben Weg, den `CharacterWizard.kickoff()` nimmt.

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

## Nur einen Prompt testen (ohne Action)

Für Prompt-**Entwürfe** — es gibt noch keine `AiAction`, du willst System-Prompt,
User-Nachricht und Server-Parameter direkt messen. `promptCase(...)` liefert einen
normalen Fall für `defineEval`; der Call läuft über dieselbe Transport-Schicht
(`rawChatCompletion` in `llmService.ts`), landet also mit Request/Response/Tokens im
Report. Vorlage: `promptLab.eval.test.ts`.

```ts
const npcSchema = z.object({ name: z.string(), merkmale: z.array(z.string()) });
type Npc = z.infer<typeof npcSchema>;

defineEval<Npc>({
  name: 'npc-prompt',
  cases: [
    promptCase<Npc>({
      label: 'Steckbrief',
      system: 'You are a D&D 5e assistant. All field values must be German.',
      user: 'Erfinde einen zwielichtigen Hafenmeister.',
      schema: npcSchema,        // Zod → JSON-Schema für den Server UND Validierung je Lauf
      structured: 'native',     // 'native' | 'prompt' | 'off'
      temperature: 0.7,
      body: { top_p: 0.9 },     // beliebige weitere /chat/completions-Properties
      core: { 'Name gesetzt': (n) => nonEmpty(n.name) },
    }),
  ],
});
```

Die Stellschrauben:

| Feld | Bedeutung |
|---|---|
| `system` / `user` | die beiden Turns; alternativ `messages` für einen vollen Verlauf (Few-Shot, vorgegebener `assistant`-Turn) |
| `schema` | Zod-Schema (wird zusätzlich je Lauf validiert → Schema-Verstoß = Fehlschlag) oder fertiges JSON-Schema |
| `structured` | `'native'` = `structured_outputs.json` (vllm guided decoding, setzt `enable_thinking:false`) · `'prompt'` = Schema als Instruktion in den Prompt, Antwort tolerant geparst · `'parse'` = Request bleibt unverändert, Schema nur zum Parsen/Validieren (richtig, wenn der Prompt das Format schon selbst beschreibt) · `'off'` = roher Text (Ergebnistyp `string`) |
| `temperature` / `maxTokens` | pro Fall; ohne Angabe gilt die Server- bzw. `.env`-Vorgabe |
| `body` | beliebige Body-Properties, gewinnen gegen alles andere |
| `callLabel` | Label des Calls im Report-Mitschnitt |

`'native'` vs. `'prompt'` ist der direkte Weg, „mit/ohne Structured Output" zu
vergleichen — entweder als zwei Fälle in einem Report (wie in `promptLab`) oder als
zwei Läufe mit unterschiedlichem `--title`.

### Mehrere Turns: `chatCase`

Wenn der Prompt einen **Verlauf** braucht — Analyse, dann eine nachgereichte
Entscheidung, dann die eigentliche Antwort — stellt `chatCase` die Turns frei
zusammen (`user(…)`, `assistant(…)`, `reply(…)`):

```ts
chatCase<Manifest>({
  label: 'Wahl auf vorgegebene Analyse nachgereicht',
  system: SYSTEM,
  schema: manifestSchema,
  structured: 'parse',
  turns: [
    user(INPUT),
    assistant(ANALYSIS_FIXTURE),          // feste Antwort #1 — kein Call
    user('<resolved_choices>…</resolved_choices> Gib das aktualisierte Manifest aus.'),
    reply<Manifest>({ label: 'nach-wahl' }),  // ECHTE Antwort — das wird gemessen
  ],
  core: { 'Zauber jetzt gewährt': (m) => m.spellsToGround.length > 0 },
});
```

- **`assistant(…)`** ist eine Fixture: deterministischer Ausgangspunkt, ein Call je
  Lauf, und gemessen wird nur der Prompt, um den es geht. Der Regelfall.
- **`reply(…)`** ist ein echter Call. Mehrere davon in einem Verlauf ketten die
  Antworten (jede landet als `assistant`-Turn im Verlauf) — dann misst man aber den
  ganzen Ablauf; dafür ist meist die Action-Strecke der bessere Ort.
- `user(…)`/`assistant(…)` nehmen statt eines Strings auch eine Funktion über den
  bisherigen Verlauf (`c.last`, `c.outputs`, `c.messages`) — z.B. um die Wahl aus den
  Optionen zu bauen, die das Modell gerade angeboten hat.
- Assertions: `core`/`soft` am Fall gelten der Antwort des **letzten** `reply(…)`;
  jeder `reply(…)` kann eigene mitbringen (im Report als `[label] …`).
- Jeder Live-Turn ist im Report ein eigener Call mit Request/Response/Tokens.

Vorlage: `featureAnalysis.eval.test.ts`.

Trägt der Prompt, gießt man ihn in eine `AiAction` und stellt die Fälle auf
`action`/`input` um — die Assertions bleiben unverändert.

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
