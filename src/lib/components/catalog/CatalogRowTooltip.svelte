<script lang="ts">
  /** Tooltip aus den Spalten einer Katalogzeile — für Schubladen, deren Einträge keinen eigenen haben. */
  import type { CatalogRow, CatalogSpec } from '../../services/catalog/catalogTypes';
  import ArtFrame from '../ui/ArtFrame.svelte';
  import TooltipFrame from '../ui/TooltipFrame.svelte';

  let { row, spec, groupLabel, x, y }: {
    row: CatalogRow | null;
    spec: CatalogSpec;
    groupLabel: (id: string) => string;
    x: number;
    y: number;
  } = $props();

  const cells = $derived(
    row ? Object.entries(spec.columns).flatMap(([id, col]) => (row.cells[id]?.text ? [{ label: col.label, text: row.cells[id].text }] : [])) : [],
  );
</script>

{#if row}
  <TooltipFrame {x} {y} content={row}>
    <div class="tt-head">
      <div class="tt-title">
        <div class="tt-name">
          {row.name}
          {#if row.altName && row.altName !== row.name}<span class="tt-name-en">{row.altName}</span>{/if}
        </div>
        {#if row.group}<div class="tt-meta">{groupLabel(row.group)}</div>{/if}
      </div>
      {#if row.icon}<ArtFrame src={row.icon} color={row.iconColor} />{/if}
    </div>
    {#each cells as c (c.label)}
      <div class="tt-section"><span class="tt-label">{c.label}</span><span>{c.text}</span></div>
    {/each}
  </TooltipFrame>
{/if}
