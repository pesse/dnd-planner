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
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  .section-tab {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    color: var(--ink-muted);
    cursor: pointer;
    font: inherit;
    font-size: 0.82rem;
    padding: 0.4rem 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    transition: color 0.1s, border-color 0.1s;
  }
  .section-tab:hover { color: var(--ink); }
  .section-tab.active {
    color: var(--ep-accent, var(--red));
    border-bottom-color: var(--ep-accent, var(--red));
  }
  .changed-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--gold);
  }
</style>
