<script lang="ts" generics="T extends { key?: string }">
  /** Ein einzelner Bibliotheks-Link (Volk, Hintergrund) als Auswahlliste samt Altformat-Angebot. */
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import './form.css';

  let { title, options, label, name, sourceKey, diff, hasFix, onfix, onopen, onselect }: {
    title: string;
    options: T[];
    label: (option: T) => string;
    name: string;
    sourceKey: string;
    diff: DiffDir;
    hasFix: boolean;
    onfix: () => void;
    onopen: () => void;
    /** `null` = Auswahl geleert. */
    onselect: (option: T | null) => void;
  } = $props();

  const FREE = '\u0000free';
  const linkable = $derived(
    options.filter((o) => o.key).sort((a, b) => label(a).localeCompare(label(b), 'de')),
  );
  const unlinked = $derived(!sourceKey && !!name.trim());
  // Ein Link, den die Bibliothek (noch) nicht kennt, bleibt wählbar stehen, statt still auf „—" zu fallen.
  const orphan = $derived(!!sourceKey && !linkable.some((o) => o.key === sourceKey));
  const current = $derived(sourceKey || (unlinked ? FREE : ''));

  function onchange(e: Event & { currentTarget: HTMLSelectElement }) {
    const value = e.currentTarget.value;
    if (value === FREE || value === sourceKey) return;
    onselect(value ? linkable.find((o) => o.key === value) ?? null : null);
  }
</script>

<div class="ref-block species-block" use:diffMark={diff}>
  <h4>{title}</h4>
  {#if hasFix}
    <div class="legacy-banner">
      <span class="legacy-banner-text">
        Altes Freitext-Format erkannt: „{name}" lässt sich mit der Bibliothek verknüpfen.
      </span>
      <button type="button" class="legacy-banner-btn" onclick={onfix}>Verknüpfen</button>
    </div>
  {/if}
  <div class="ref-select-row">
    <select value={current} {onchange}>
      <option value="">—</option>
      {#if unlinked}<option value={FREE}>„{name}" (nicht verlinkt)</option>{/if}
      {#if orphan}<option value={sourceKey}>{name || sourceKey}</option>{/if}
      {#each linkable as option (option.key)}
        <option value={option.key}>{label(option)}</option>
      {/each}
    </select>
    {#if sourceKey && !orphan}
      <button type="button" class="ref-open" title="Bibliotheksseite öffnen" onclick={onopen}>↗</button>
    {/if}
  </div>
  {#if unlinked && !hasFix}
    <p class="species-hint">Nicht in der Bibliothek verlinkt – aus der Liste wählen.</p>
  {/if}
</div>

<style>
  .ref-select-row { display: flex; align-items: center; gap: 0.4rem; }
  .ref-select-row select { flex: 1; min-width: 0; }
  .ref-open {
    background: none; border: none; cursor: pointer; padding: 0 0.2rem;
    color: var(--ink-muted); font-size: 0.9rem;
  }
  .ref-open:hover { color: var(--arcane); }
</style>
