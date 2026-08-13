<script lang="ts">
  import { untrack } from 'svelte';
  import { activeFile, vaultVersion } from '../../stores/campaign';
  import { confirmNavigation } from '../../stores/navigationGuard';
  import { deleteEntry } from '../../services/sidebar/deleteEntry';
  import type { GroupedSection, TreeGroup, TreeLeaf } from '../../services/sidebar/groupedSections';
  import SectionHeader from './SectionHeader.svelte';
  import './tree.css';

  let { section, oncreate }: { section: GroupedSection; oncreate: () => void } = $props();

  let expanded = $state(false);
  let groups = $state<TreeGroup[]>([]);
  let leavesByGroup = $state<Record<string, TreeLeaf[]>>({});
  let openGroups = $state<Record<string, boolean>>({});
  let search = $state('');
  let altMode = $state(false);

  let allLeaves = $derived(groups.flatMap((g) => leavesByGroup[g.id] ?? []));

  let searchResults = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return allLeaves.filter((leaf) => leaf.label.toLowerCase().includes(q));
  });

  let shownGroups = $derived(
    altMode && section.altMode ? section.altMode.build(allLeaves) : groups,
  );

  // Suche und zweite Gruppierung brauchen alle Blätter.
  $effect(() => {
    if (!(search.trim() || (expanded && altMode)) || !groups.length) return;
    untrack(() => {
      for (const g of groups) if (!leavesByGroup[g.id]) void loadLeaves(g.id);
    });
  });

  // `untrack` ist Pflicht: `reload` liest `groups` und `loadGroups` weist es neu zu — verfolgt
  // triggert der Effekt sich selbst endlos und wischt bei jedem Durchlauf `leavesByGroup`, sodass
  // eine offene Gruppe dauerhaft auf „Laden…" stehen bleibt.
  $effect(() => {
    const _v = $vaultVersion;
    if (section.live && expanded) untrack(() => void reload());
  });

  async function loadGroups() {
    groups = await section.loadGroups();
    for (const g of groups) if (g.leaves) leavesByGroup[g.id] = g.leaves;
  }

  async function loadLeaves(id: string) {
    if (leavesByGroup[id] || !section.loadLeaves) return;
    leavesByGroup[id] = await section.loadLeaves(id);
  }

  /** Verwirft alle Blätter und liest die offenen Gruppen neu ein. */
  export async function reload() {
    if (!expanded) return;
    for (const g of groups) section.invalidate?.(g.id);
    leavesByGroup = {};
    await loadGroups();
    for (const g of groups) if (openGroups[g.id]) await loadLeaves(g.id);
  }

  async function reloadGroup(id: string) {
    section.invalidate?.(id);
    if (!section.loadLeaves) { await loadGroups(); return; }
    delete leavesByGroup[id];
    await loadLeaves(id);
  }

  async function toggle() {
    expanded = !expanded;
    if (expanded) await loadGroups();
  }

  async function toggleGroup(id: string) {
    openGroups[id] = !openGroups[id];
    // In der zweiten Gruppierung ist die id ein Grad, kein Ordner — nichts nachzuladen.
    if (openGroups[id] && !altMode) await loadLeaves(id);
  }

  async function open(leaf: TreeLeaf) {
    if (!(await confirmNavigation())) return;
    activeFile.set({ name: leaf.entryName, path: leaf.path, type: section.type });
  }

  async function create() {
    if (!(await confirmNavigation())) return;
    expanded = true;
    if (section.live) await loadGroups();
    oncreate();
  }
</script>

{#snippet badgeMark(badge: TreeLeaf['badge'])}
  {#if badge?.kind === 'rarity'}
    <span class="rarity-dot" style="background:{badge.color}"></span>
  {:else if badge?.kind === 'level'}
    <span class="spell-level-badge" style="background: {badge.color}" title={badge.title || undefined}>{badge.text}</span>
  {:else if badge?.kind === 'cr'}
    <span class="monster-cr-badge" title={badge.title}>{badge.text}</span>
  {/if}
{/snippet}

<!-- `flat` = Suchtreffer oder zweite Gruppierung: dort nennt der Titel die Herkunftsgruppe. -->
{#snippet leafRow(leaf: TreeLeaf, flat: boolean)}
  <div class="entry-row">
    <button
      class="file-entry monster-subentry"
      class:active={$activeFile?.path?.endsWith(leaf.suffix)}
      onclick={() => open(leaf)}
      title={flat ? leaf.groupId : undefined}
    >
      {@render badgeMark(leaf.badge)}
      {leaf.label}
    </button>
    <button
      class="entry-del"
      title="Löschen"
      onclick={(e) => { e.stopPropagation(); deleteEntry(leaf.path, leaf.label, false, () => reloadGroup(leaf.groupId)); }}
    >🗑</button>
  </div>
{/snippet}

<div class="top-section">
  <SectionHeader label={section.label} {expanded} ontoggle={toggle} top>
    {#snippet actions()}
      <button class="add-btn" title={section.addTitle} onclick={create}>+</button>
    {/snippet}
  </SectionHeader>

  {#if expanded}
    {#if section.searchable}
      <div class="spell-search-row">
        <input class="spell-search-input" bind:value={search} placeholder="Suchen…" type="search" />
      </div>
    {/if}
    {#if section.altMode}
      <div class="spell-group-toggle">
        <button class:active={!altMode} onclick={() => (altMode = false)}>{section.altMode.primaryLabel}</button>
        <button class:active={altMode} onclick={() => (altMode = true)}>{section.altMode.label}</button>
      </div>
    {/if}

    <div class="file-list">
      {#if searchResults !== null}
        {#if searchResults.length}
          {#each searchResults as leaf}
            {@render leafRow(leaf, true)}
          {/each}
        {:else}
          <span class="empty">Keine Treffer</span>
        {/if}
      {:else if !shownGroups.length}
        <span class="empty">{altMode ? 'Laden…' : section.emptyLabel}</span>
      {:else}
        {#each shownGroups as group}
          {@const leaves = group.leaves ?? leavesByGroup[group.id]}
          <button
            class="monster-group-header {section.headerClass ?? ''}"
            style={group.color ? `color: ${group.color}` : undefined}
            onclick={() => toggleGroup(group.id)}
          >
            <span class="arrow" class:open={openGroups[group.id]}>›</span>
            {@render badgeMark(group.badge)}
            {group.label}
            {#if leaves}<span class="group-count">({leaves.length})</span>{/if}
          </button>
          {#if openGroups[group.id]}
            {#if leaves}
              {#each leaves as leaf}
                {@render leafRow(leaf, altMode)}
              {/each}
            {:else}
              <span class="empty">Laden…</span>
            {/if}
          {/if}
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .spell-search-row {
    padding: 0.3rem 0.75rem 0.2rem;
  }

  .spell-search-input {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink);
    padding: 0.2rem 0.5rem;
    font-size: 0.82rem;
    outline: none;
    font-family: inherit;
  }

  .spell-search-input:focus {
    border-color: var(--arcane);
  }

  .spell-search-input::placeholder {
    color: var(--border);
  }

  /* Umschalter Gruppierung Schule | Grad */
  .spell-group-toggle {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0 0.75rem 0.3rem;
    font-size: 0.72rem;
  }
  .spell-group-toggle button {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-soft);
    padding: 0.1rem 0.45rem;
    font-size: 0.72rem;
    font-family: inherit;
    cursor: pointer;
  }
  .spell-group-toggle button:hover {
    color: var(--ink);
  }
  .spell-group-toggle button.active {
    background: var(--arcane);
    border-color: var(--arcane);
    color: var(--bg);
  }
</style>
