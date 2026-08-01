<script lang="ts">
  import { activeFile, vaultVersion } from '../../stores/campaign';
  import { confirmNavigation } from '../../stores/navigationGuard';
  import { deleteEntry } from '../../services/sidebar/deleteEntry';
  import type { LibraryEntry, LibrarySection } from '../../services/sidebar/librarySections';
  import SectionHeader from './SectionHeader.svelte';
  import './tree.css';

  let { section, oncreate }: { section: LibrarySection; oncreate: () => void } = $props();

  let expanded = $state(false);
  let entries = $state<LibraryEntry[]>([]);

  const load = async () => { entries = await section.load(); };

  // Bibliotheken halten sich aktuell: neue/gespeicherte Einträge tauchen sofort auf.
  $effect(() => {
    const _v = $vaultVersion;
    if (expanded) void load();
  });

  export async function reload() {
    if (expanded) await load();
  }

  async function toggle() {
    expanded = !expanded;
    if (expanded) await load();
  }

  async function open(path: string) {
    if (!(await confirmNavigation())) return;
    activeFile.set({ name: path.split('/').pop()!.replace('.json', ''), path, type: section.type });
  }

  async function create() {
    if (!(await confirmNavigation())) return;
    expanded = true;
    oncreate();
  }
</script>

<div class="top-section">
  <SectionHeader label={section.label} {expanded} ontoggle={toggle} top>
    {#snippet actions()}
      <button class="add-btn" title={section.addTitle} onclick={create}>+</button>
    {/snippet}
  </SectionHeader>

  {#if expanded}
    <div class="file-list">
      {#if entries.length}
        {#each entries as entry}
          <div class="entry-row">
            <button
              class="file-entry lib-entry"
              class:active={$activeFile?.path === entry.path}
              onclick={() => entry.path && open(entry.path)}
            >
              {section.icon} {entry.name}
            </button>
            {#if entry.path}
              <button
                class="entry-del"
                title="Löschen"
                onclick={(e) => { e.stopPropagation(); deleteEntry(entry.path!, entry.name, false, load); }}
              >🗑</button>
            {/if}
          </div>
          {#each entry.children ?? [] as sub}
            <div class="entry-row">
              <button
                class="file-entry class-subentry"
                class:active={$activeFile?.path === sub.path}
                onclick={() => sub.path && open(sub.path)}
              >
                ↳ {sub.name}
              </button>
              {#if sub.path}
                <button
                  class="entry-del"
                  title="Löschen"
                  onclick={(e) => { e.stopPropagation(); deleteEntry(sub.path!, sub.name, false, load); }}
                >🗑</button>
              {/if}
            </div>
          {/each}
        {/each}
      {:else}
        <span class="empty">{section.emptyLabel}</span>
      {/if}
    </div>
  {/if}
</div>
