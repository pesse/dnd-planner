<script lang="ts">
  /**
   * Editor einer deklarierten Grundeigenschafts-WAHL (`grantsChoice.kind === 'characterProperty'`)
   * — „Klein oder Mittelgroß" bei Feenwesen, Mensch und Tiefling.
   *
   * Optionen und deutsche Labels stehen NICHT in der Deklaration: sie kommen aus dem Vokabular
   * der Eigenschaft (`characterPropertyPickers`, services/characterProperties.ts). Deklariert
   * wird nur, WELCHE Eigenschaft und welche Werte davon zulässig sind — genau darum kann eine
   * Homebrew-Spezies dieselbe Wahl anbieten, ohne dass jemand Labels pflegt.
   *
   * Die Regel, die die Oberfläche zeigen muss: WENIGER ALS ZWEI Werte ergeben keine Frage —
   * ein fester Wert gehört unter „Gewährt Mechanik" (`grants.properties`), nicht hierher.
   */
  import type { FeatureChoiceGrant } from '$lib/schemas/shared';
  import { characterPropertyPickers } from '$lib/services/characterProperties';

  let {
    grant = $bindable<FeatureChoiceGrant>(),
    onchange = () => void 0,
  }: {
    grant: FeatureChoiceGrant;
    onchange?: () => void;
  } = $props();

  const pickers = characterPropertyPickers();
  let picker = $derived(pickers.find((p) => p.property === grant.property) ?? pickers[0]);
  /** Leer = das ganze Vokabular ist zugelassen (so liest es auch `characterPropertyOptions`). */
  let allowed = $derived(grant.propertyValues.length ? grant.propertyValues : picker.values.map((v) => v.value));

  function setProperty(value: string) {
    grant.property = pickers.find((p) => p.property === value)?.property ?? pickers[0].property;
    grant.propertyValues = [];
    onchange();
  }

  function toggleValue(value: string, checked: boolean) {
    const next = checked ? [...allowed, value] : allowed.filter((v) => v !== value);
    // Alles angehakt wird als leere Liste gespeichert — „alle" ist der Default und soll nicht
    // als Aufzählung im Vault stehen, die bei einem neuen Wert veraltet.
    grant.propertyValues = next.length === picker.values.length ? [] : next;
    onchange();
  }
</script>

<div class="cp-block">
  <p class="hint">
    Nur die <strong>Wahl</strong> gehört hierher. Ein fester Wert steht unter
    <em>Gewährt Mechanik</em> — weniger als zwei zugelassene Werte ergeben keine Frage.
  </p>

  <label class="lbl-inline">Eigenschaft
    <select class="ef sel" value={picker.property} onchange={(e) => setProperty((e.target as HTMLSelectElement).value)}>
      {#each pickers as p}
        <option value={p.property}>{p.labelDe}</option>
      {/each}
    </select>
  </label>

  <div class="sub-title">Zugelassene Werte</div>
  <div class="flag-grid">
    {#each picker.values as v}
      <label class="chk">
        <input
          type="checkbox"
          checked={allowed.includes(v.value)}
          onchange={(e) => toggleValue(v.value, (e.target as HTMLInputElement).checked)}
        />
        {v.labelDe}
      </label>
    {/each}
  </div>
  {#if allowed.length < 2}
    <span class="note">Weniger als zwei Werte — der Flow stellt keine Frage.</span>
  {/if}
</div>

<style>
  .ef {
    background: var(--bg-panel); border: 1px solid transparent; border-radius: 3px;
    color: var(--ink); font-family: inherit; font-size: 0.88rem; padding: 0.15rem 0.3rem; outline: none;
  }
  .ef:hover { border-color: var(--border); }
  .ef:focus { border-color: var(--mef-accent, var(--arcane)); }
  .sel { font-size: 0.8rem; }

  .cp-block { display: flex; flex-direction: column; gap: 0.3rem; }
  .hint { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; margin: 0 0 0.1rem; line-height: 1.45; }
  .hint strong { color: var(--ink-soft); font-weight: 600; }
  .note { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; }

  .sub-title {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--ink-muted); margin-top: 0.2rem;
  }
  .lbl-inline { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.78rem; color: var(--ink-soft); }

  .flag-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.15rem 0.4rem; }
  .chk {
    display: inline-flex; align-items: center; gap: 0.25rem;
    font-size: 0.78rem; color: var(--ink-soft); cursor: pointer;
  }
</style>
