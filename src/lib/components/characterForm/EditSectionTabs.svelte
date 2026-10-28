<script lang="ts">
  import { EDIT_SECTIONS, type EditSectionId } from '../../services/characterEditSections';

  let { active = $bindable(), changed }: {
    active: EditSectionId;
    changed: Set<EditSectionId>;
  } = $props();
</script>

<div class="section-tabs" role="tablist">
  {#each EDIT_SECTIONS as s (s.id)}
    <button type="button" role="tab" class="section-tab" class:active={active === s.id}
      aria-selected={active === s.id} onclick={() => (active = s.id)}>
      {s.label}
      {#if changed.has(s.id)}<span class="changed-dot" title="Ungespeicherte Änderungen"></span>{/if}
    </button>
  {/each}
</div>

<style>
  .section-tabs {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.35rem 0;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  .section-tab {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--ink-muted);
    cursor: pointer;
    font: inherit;
    font-size: 0.8rem;
    padding: 0.2rem 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .section-tab:hover { color: var(--ink); }
  .section-tab.active {
    color: var(--bg);
    background: var(--arcane, var(--red));
    border-color: var(--arcane, var(--red));
  }
  .changed-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--gold);
  }
</style>
