<script lang="ts">
  /**
   * Gegenstück zum `WeaponMasteryPicker`: rein präsentierend, die Optionen kommen aus der
   * Bibliothek, nie aus der KI. `selected` ist ein REINER Lesewert und die Änderung geht
   * über `onToggle` — so bleibt die Quelle des Aufrufers die einzige Wahrheit und es
   * entsteht kein zweiter, driftender Zustand.
   */
  import type { FightingStyleOffer } from '../services/fightingStyle';
  import type { DiffDir } from '../utils/diffHighlight';

  let {
    offer,
    selected,
    onToggle,
    diff = 'none',
  }: {
    offer: FightingStyleOffer | null;
    selected: string[];
    onToggle: (sourceKey: string) => void;
    diff?: DiffDir;
  } = $props();

  // Gewähltes, das (nicht mehr) wählbar ist: Talent aus der Bibliothek verschwunden,
  // Klasse getauscht. Wird ANGEZEIGT statt still gekappt.
  const overflow = $derived(
    offer ? selected.filter((key) => !offer.options.some((o) => o.sourceKey === key)) : [],
  );

  // Am Maximum blockieren statt die älteste Wahl herauszuschieben — der Tausch soll bewusst sein.
  function toggle(key: string) {
    if (selected.includes(key) || selected.length < (offer?.allowance ?? 0)) onToggle(key);
  }
</script>

{#if offer && offer.allowance > 0}
  <div class="style-panel" class:diff-up={diff === 'up'} class:diff-down={diff === 'down'}>
    <div class="head">
      <span class="title">
        Kampfstil — {offer.className}: {offer.allowance}
        {offer.allowance === 1 ? 'Stil' : 'Stile'}
      </span>
      <span class="count" class:full={selected.length >= offer.allowance}>
        {selected.length} von {offer.allowance} belegt
      </span>
    </div>

    {#if offer.options.length}
      <div class="options">
        {#each offer.options as o (o.sourceKey)}
          {@const picked = selected.includes(o.sourceKey)}
          <button
            type="button"
            class="opt"
            class:picked
            disabled={!picked && selected.length >= offer.allowance}
            title={o.desc}
            onclick={() => toggle(o.sourceKey)}
          >{o.name}</button>
        {/each}
      </div>
    {/if}

    {#if offer.options.length < offer.allowance}
      <p class="warn">
        Nur {offer.options.length} {offer.options.length === 1 ? 'Kampfstil' : 'Kampfstile'} in der Bibliothek —
        Kampfstil-Talente brauchen die Kategorie „Kampfstil" (vault/feats).
      </p>
    {/if}

    {#if overflow.length}
      <p class="warn">Nicht (mehr) wählbar — Talent fehlt in der Bibliothek:</p>
      <div class="options">
        {#each overflow as key}
          <button type="button" class="opt overflow" title="Entfernen" onclick={() => toggle(key)}>{key} ✕</button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .style-panel {
    border: 1px solid color-mix(in srgb, var(--copper) 35%, var(--surface));
    border-radius: 5px; background: color-mix(in srgb, var(--copper) 6%, var(--bg-panel));
    padding: 0.45rem 0.6rem;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--copper); }
  .count { font-size: 0.72rem; color: var(--ink-muted); }
  .count.full { color: var(--copper); }
  .options { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .opt {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 10px;
    color: var(--ink-soft); cursor: help; font-family: inherit; font-size: 0.74rem;
    padding: 0.05rem 0.45rem;
  }
  .opt:hover:not(:disabled) { border-color: var(--copper); color: var(--copper); }
  .opt.picked { background: color-mix(in srgb, var(--copper) 30%, var(--bg-panel)); color: var(--ink); border-color: var(--copper); }
  .opt:disabled { opacity: 0.45; cursor: not-allowed; }
  .opt.overflow { border-color: var(--danger); color: var(--danger); cursor: pointer; }
  .warn { margin: 0.1rem 0 0; font-size: 0.72rem; color: var(--danger); }
</style>
