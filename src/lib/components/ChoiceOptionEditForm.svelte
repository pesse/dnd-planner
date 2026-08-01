<script lang="ts">
  /**
   * Editor der Optionen einer deklarierten Zweigwahl (`grantsChoice.kind === 'optionList'`),
   * artefakt-neutral: nur `ChoiceOption[]`, damit dieselbe Komponente an Klassenmerkmal,
   * Trait und Talent hängt.
   *
   * Zwei Dinge, die still brechen, wenn die Oberfläche sie nicht zeigt: `value` ist der
   * stabile Schlüssel der gespeicherten Antwort und steht wörtlich im englischen Regeltext
   * — ein „verbessertes" Label findet seinen Zweig nie wieder; `labelDe` ist ein ZITAT aus
   * `descDe` (**Wächter.**), keine Übersetzung.
   */
  import { featureGrantSchema } from '$lib/schemas/grants';
  import { type ChoiceOption } from '$lib/schemas/featureChoice';
  import { isEmptyFeatureGrant } from '$lib/services/declaration/grants';
  import FeatureGrantEditForm from './FeatureGrantEditForm.svelte';

  let {
    options = $bindable<ChoiceOption[]>(),
    scope = 'full',
    onchange = () => void 0,
  }: {
    /** Muss mit `bind:` übergeben werden — Hinzufügen/Entfernen/Ordnen ersetzt das Array. */
    options: ChoiceOption[];
    scope?: 'full' | 'skills';
    onchange?: () => void;
  } = $props();

  /** Richtwert: die Zeile landet so auf dem Charakterbogen. */
  const HELP_MAX = 60;

  function mark() {
    onchange();
  }

  function addOption() {
    options = [...options, { value: '', labelDe: '', helpDe: '', spells: [] }];
    onchange();
  }

  // EIN Zauber je Zeile statt einer Komma-Liste: `optionSpellsUpTo` vereinigt Zeilen gleicher
  // Stufe, und ein Textfeld ohne Trennzeichen-Parsing braucht keinen lokalen Zustand.
  function addSpellRow(option: ChoiceOption) {
    option.spells = [...option.spells, { level: 1, names: [''] }];
    onchange();
  }

  function removeSpellRow(option: ChoiceOption, i: number) {
    option.spells = option.spells.filter((_, idx) => idx !== i);
    onchange();
  }

  function removeOption(i: number) {
    options = options.filter((_, idx) => idx !== i);
    onchange();
  }

  function moveOption(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= options.length) return;
    const next = [...options];
    [next[i], next[j]] = [next[j], next[i]];
    options = next;
    onchange();
  }

  // An/aus statt Dauer-Block: eine Option ohne `grants` ist eine ohne mechanische Wirkung
  // (Drachenabstammung — die Farbe ist Bogenwert, kein Grant).
  function toggleGrants(option: ChoiceOption, on: boolean) {
    option.grants = on ? featureGrantSchema.parse({}) : undefined;
    onchange();
  }
</script>

<div class="opt-block">
  <p class="hint">
    <strong>Wert (EN)</strong> ist der Schlüssel, gegen den die gespeicherte Antwort matcht —
    wörtlich aus dem englischen Regeltext. <strong>Anzeige (DE)</strong> ist ein Zitat aus der
    deutschen Beschreibung, keine Übersetzung.
  </p>

  <!-- Nach Options-IDENTITÄT gekeyed, nicht nach Index: sonst tauscht das Ordnen nur die
       Props der bestehenden Zeilen, und der lokale Zustand der Unter-Editoren
       (`weaponsOther`-Textzeile in ProficiencyGrantEditForm) landete an der falschen Option. -->
  {#each options as option, i (option)}
    <div class="opt-row">
      <div class="opt-line">
        <span class="opt-idx">{i + 1}</span>
        <input class="ef opt-value" bind:value={option.value} oninput={mark} placeholder="Wert (EN), z.B. Warden" />
        <input class="ef opt-label" bind:value={option.labelDe} oninput={mark} placeholder="Anzeige (DE), Zitat" />
        <button class="opt-move" disabled={i === 0} onclick={() => moveOption(i, -1)} title="nach oben">↑</button>
        <button class="opt-move" disabled={i === options.length - 1} onclick={() => moveOption(i, 1)} title="nach unten">↓</button>
        <button class="opt-del" onclick={() => removeOption(i)} title="Option entfernen">×</button>
      </div>

      <label class="lbl-block">
        <span class="lbl-line">
          Konsequenz (DE, für den Bogen)
          <span class="count" class:over={option.helpDe.length > HELP_MAX}>{option.helpDe.length}/{HELP_MAX}</span>
        </span>
        <input class="ef" bind:value={option.helpDe} oninput={mark} placeholder="z.B. Übung mit Kriegswaffen, mittlere Rüstung" />
      </label>

      <!-- Benannte Zauber DIESER Option (Elfenabstammung 1/3/5). Nicht `grantsSpells`: das
           zeigt auf eine Tabelle im desc des Trägers, den alle Zweige teilen. -->
      {#each option.spells as row, ri}
        <div class="spell-row">
          <label class="lbl-inline">ab Stufe
            <input class="ef num" type="number" min="1" max="20" bind:value={row.level} oninput={mark} />
          </label>
          <input class="ef spell-name" bind:value={row.names[0]} oninput={mark} placeholder="Zauber (EN), z.B. Misty Step" />
          <button class="opt-del" onclick={() => removeSpellRow(option, ri)} title="Zauberzeile entfernen">×</button>
        </div>
      {/each}
      <button class="add-spell" onclick={() => addSpellRow(option)}>+ Zauber je Stufe</button>

      <label class="chk" class:off={!option.grants}>
        <input
          type="checkbox"
          checked={!!option.grants}
          onchange={(e) => toggleGrants(option, (e.target as HTMLInputElement).checked)}
        />
        Gewährt Mechanik
        {#if option.grants && isEmptyFeatureGrant(option.grants)}
          <span class="warn">— noch nichts eingetragen</span>
        {/if}
      </label>

      {#if option.grants}
        <div class="opt-grant">
          <FeatureGrantEditForm bind:grant={option.grants} {scope} {onchange} />
        </div>
      {/if}
    </div>
  {/each}

  <button class="add-opt" onclick={addOption}>+ Option</button>
</div>

<style>
  .ef { width: 100%; }

  .opt-block { display: flex; flex-direction: column; gap: 0.3rem; }
  .hint { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; margin: 0 0 0.1rem; line-height: 1.45; }
  .hint strong { color: var(--ink-soft); font-weight: 600; }

  .opt-row {
    display: flex; flex-direction: column; gap: 0.2rem;
    border-left: 2px solid var(--surface); padding: 0.25rem 0 0.35rem 0.5rem;
  }
  .opt-line { display: flex; align-items: center; gap: 0.3rem; }
  .opt-idx { font-size: 0.7rem; color: var(--ink-muted); width: 1rem; flex-shrink: 0; }
  .opt-value { flex: 1; font-style: italic; color: var(--ink-soft); }
  .opt-label { flex: 1; font-weight: 600; }

  .opt-move, .opt-del {
    background: none; border: none; color: var(--ink-muted); cursor: pointer;
    font-size: 0.9rem; line-height: 1; flex-shrink: 0; padding: 0 0.15rem;
  }
  .opt-move:disabled { opacity: 0.3; cursor: default; }
  .opt-move:hover:not(:disabled) { color: var(--mef-accent, var(--arcane)); }
  .opt-del { font-size: 1.1rem; }
  .opt-del:hover { color: var(--danger); }

  .lbl-block {
    display: flex; flex-direction: column; gap: 0.1rem;
    font-size: 0.78rem; color: var(--ink-soft);
  }
  .lbl-line { display: flex; align-items: baseline; gap: 0.4rem; }
  .count { font-size: 0.68rem; color: var(--ink-muted); }
  .count.over { color: var(--danger); }

  .chk {
    display: inline-flex; align-items: center; gap: 0.25rem;
    font-size: 0.78rem; color: var(--ink-soft); cursor: pointer; margin-top: 0.25rem;
  }
  .chk.off { color: var(--ink-muted); opacity: 0.7; }
  .warn { color: var(--danger); font-style: italic; }

  .opt-grant {
    border-left: 1px dashed var(--border); padding-left: 0.5rem; margin-top: 0.1rem;
  }

  .spell-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.15rem; }
  .lbl-inline { gap: 0.25rem; font-size: 0.75rem; flex-shrink: 0; }
  .num { width: 48px; text-align: center; }
  .spell-name { flex: 1; }

  .add-opt, .add-spell {
    align-self: flex-start; background: var(--surface); border: 1px solid var(--border);
    border-radius: 4px; color: var(--ink-soft); cursor: pointer;
    font-family: inherit; font-size: 0.78rem; padding: 0.2rem 0.55rem; margin-top: 0.2rem;
  }
  .add-opt:hover, .add-spell:hover { border-color: var(--mef-accent, var(--arcane)); color: var(--mef-accent, var(--arcane)); }
  .add-spell { font-size: 0.72rem; margin-top: 0.15rem; }
</style>
