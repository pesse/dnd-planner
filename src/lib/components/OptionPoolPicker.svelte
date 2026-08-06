<script lang="ts">
  /**
   * Gemeinsames Picker-UI für Charakterbogen UND Erstell-Wizard, rein präsentierend wie der
   * `WeaponMasteryPicker`: Kontingent und Optionen beschafft der Aufrufer über
   * `optionPoolOffers(...)`. Gebunden ist die GANZE Liste des Charakters — den Schnitt auf
   * diesen Pool macht `poolPicks`, damit es nur einen Schreibweg gibt.
   */
  import type { OptionPick } from '../schemas/characterSchema';
  import { poolPicks, toggleOptionPick, type OptionPoolOffer } from '../services/declaration/optionPool';
  import type { DiffDir } from '../utils/diffHighlight';

  let {
    offer,
    picks = $bindable(),
    diff = 'none',
  }: {
    offer: OptionPoolOffer;
    picks: OptionPick[];
    diff?: DiffDir;
  } = $props();

  const mine = $derived(poolPicks(picks, offer.featureKey));

  // Gewähltes, das die Deklaration nicht mehr anbietet — ANGEZEIGT statt still gekappt.
  const overflow = $derived(mine.filter((p) => !offer.options.some((o) => o.value === p.value)));

  const drop = (value: string) => {
    picks = picks.filter((p) => p.sourceKey !== offer.featureKey || p.value !== value);
  };
</script>

<div class="pool-panel" class:diff-up={diff === 'up'} class:diff-down={diff === 'down'}>
  <div class="head">
    <span class="title">{offer.titleDe} — {offer.className}: {offer.allowance} Optionen</span>
    <span class="count" class:full={mine.length >= offer.allowance}>
      {mine.length} von {offer.allowance} belegt
    </span>
  </div>

  <div class="options">
    {#each offer.options as o (o.value)}
      {@const picked = mine.some((p) => p.value === o.value)}
      <button
        type="button"
        class="opt"
        class:picked
        disabled={!picked && mine.length >= offer.allowance}
        title={o.helpDe}
        onclick={() => (picks = toggleOptionPick(picks, offer, o))}
      >{o.labelDe || o.value}</button>
    {/each}
  </div>

  {#if overflow.length}
    <p class="warn">Nicht (mehr) angeboten — Deklaration geändert:</p>
    <div class="options">
      {#each overflow as p (p.value)}
        <button type="button" class="opt overflow" title="Entfernen" onclick={() => drop(p.value)}>
          {p.valueDe || p.value} ✕
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pool-panel {
    border: 1px solid color-mix(in srgb, var(--arcane, var(--gold)) 35%, var(--surface));
    border-radius: 5px; background: color-mix(in srgb, var(--arcane, var(--gold)) 6%, var(--bg-panel));
    padding: 0.45rem 0.6rem;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--arcane, var(--gold)); }
  .count { font-size: 0.72rem; color: var(--ink-muted); }
  .count.full { color: var(--arcane, var(--gold)); }
  .options { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .opt {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 10px;
    color: var(--ink-soft); cursor: help; font-family: inherit; font-size: 0.74rem;
    padding: 0.05rem 0.45rem;
  }
  .opt:hover:not(:disabled) { border-color: var(--arcane, var(--gold)); color: var(--arcane, var(--gold)); }
  .opt.picked {
    background: color-mix(in srgb, var(--arcane, var(--gold)) 30%, var(--bg-panel));
    color: var(--ink); border-color: var(--arcane, var(--gold));
  }
  .opt:disabled { opacity: 0.45; cursor: not-allowed; }
  .opt.overflow { border-color: var(--danger); color: var(--danger); cursor: pointer; }
  .warn { margin: 0.1rem 0 0; font-size: 0.72rem; color: var(--danger); }
</style>
