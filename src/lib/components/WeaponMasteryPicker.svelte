<script lang="ts">
  /**
   * Gemeinsames Picker-UI für Charakterbogen UND Erstell-Wizard, rein präsentierend:
   * Kontingent und wählbare Waffen beschafft der Aufrufer über `masteryOffer(...)`, weil
   * beide Kontexte anderswo über die Sichtbarkeit entscheiden. `diff` blendet die Tönung
   * selbst ein — eine `use:diffMark` des Aufrufers griffe hier nicht.
   */
  import { masteryName, type MasteryOffer } from '../services/weaponMastery';
  import { MASTERY_INFO, masteryLabel } from '../itemLabels';
  import type { DiffDir } from '../utils/diffHighlight';

  let {
    offer,
    masteries = $bindable(),
    diff = 'none',
  }: {
    offer: MasteryOffer | null;
    masteries: string[];
    diff?: DiffDir;
  } = $props();

  // Gewähltes, das (nicht mehr) wählbar ist: Übung abgewählt, Waffe aus dem Vault
  // verschwunden, Klasse getauscht. Wird ANGEZEIGT statt still gekappt.
  const overflow = $derived(
    offer ? masteries.filter((n) => !offer.weapons.some((w) => masteryName(w) === n)) : [],
  );

  // Am Maximum blockieren statt die älteste Wahl herauszuschieben — der Tausch soll bewusst sein.
  function toggle(name: string) {
    if (masteries.includes(name)) masteries = masteries.filter((n) => n !== name);
    else if (masteries.length < (offer?.allowance ?? 0)) masteries = [...masteries, name];
  }
</script>

{#if offer && offer.allowance > 0}
  <div class="mastery-panel" class:diff-up={diff === 'up'} class:diff-down={diff === 'down'}>
    <div class="head">
      <span class="title">
        Waffenbeherrschung — {offer.className}: {offer.allowance}
        {offer.allowance === 1 ? 'Waffe' : 'Waffen'}
      </span>
      <span class="count" class:full={masteries.length >= offer.allowance}>
        {masteries.length} von {offer.allowance} belegt
      </span>
    </div>
    <p class="hint">
      Nach jeder langen Rast änderbar.{#if offer.meleeOnly} Nur Nahkampfwaffen.{/if}
    </p>

    {#if offer.weapons.length}
      <div class="options">
        {#each offer.weapons as w (w.path)}
          {@const name = masteryName(w)}
          {@const picked = masteries.includes(name)}
          <button
            type="button"
            class="opt"
            class:picked
            disabled={!picked && masteries.length >= offer.allowance}
            title={MASTERY_INFO[w.mastery].descDe}
            onclick={() => toggle(name)}
          >{name} <span class="prop">({masteryLabel(w.mastery)})</span></button>
        {/each}
      </div>
    {/if}

    {#if offer.weapons.length < offer.allowance}
      <p class="warn">
        Nur {offer.weapons.length} wählbare {offer.weapons.length === 1 ? 'Waffe' : 'Waffen'} in der Bibliothek —
        Waffen brauchen eine gepflegte Meisterschaftseigenschaft und eine passende Kategorie.
      </p>
    {/if}

    {#if overflow.length}
      <p class="warn">Nicht (mehr) wählbar — Übung abgewählt oder Waffe fehlt in der Bibliothek:</p>
      <div class="options">
        {#each overflow as name}
          <button type="button" class="opt overflow" title="Entfernen" onclick={() => toggle(name)}>{name} ✕</button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .mastery-panel {
    border: 1px solid color-mix(in srgb, var(--copper) 35%, var(--surface));
    border-radius: 5px; background: color-mix(in srgb, var(--copper) 6%, var(--bg-panel));
    padding: 0.45rem 0.6rem;
    display: flex; flex-direction: column; gap: 0.3rem;
  }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .title { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--copper); }
  .count { font-size: 0.72rem; color: var(--ink-muted); }
  .count.full { color: var(--copper); }
  .hint { margin: 0; font-size: 0.72rem; color: var(--ink-muted); font-style: italic; }
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
  .prop { color: var(--ink-muted); }
  .opt.picked .prop { color: var(--ink-soft); }
  .warn { margin: 0.1rem 0 0; font-size: 0.72rem; color: var(--danger); }
</style>
