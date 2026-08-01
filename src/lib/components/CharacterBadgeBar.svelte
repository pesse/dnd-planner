<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { activeFile, fileContent, replaceContent } from '../stores/campaign';
  import { campaignCharacterData, reloadCampaignCharacters } from '../stores/context';
  import { parseFrontmatter, replaceFrontmatterCharacters } from '../utils/frontmatter';

  let activeSlugs = $derived(
    (() => {
      if ($activeFile?.type === 'campaign') {
        return $campaignCharacterData.map((c) => c.slug);
      }
      if ($activeFile?.type === 'session' && $fileContent) {
        const { frontmatter } = parseFrontmatter($fileContent);
        if (frontmatter.characters !== undefined) return frontmatter.characters;
        // Kein Frontmatter-Key heißt: implizit alle Kampagnen-Charaktere.
        return $campaignCharacterData.map((c) => c.slug);
      }
      return [] as string[];
    })()
  );

  let characterBadges = $derived(
    (() => {
      const slugSet = new Set(activeSlugs);
      const rich = $campaignCharacterData.filter((c) => slugSet.has(c.slug));
      const richSlugs = new Set(rich.map((c) => c.slug));
      const plain = activeSlugs
        .filter((s) => !richSlugs.has(s))
        .map((s) => ({ slug: s, name: s, classLevel: '', species: '', background: '', totalLevel: 0, playerName: '' }));
      return [...rich, ...plain];
    })()
  );

  let allVaultSlugs = $state<string[]>([]);
  let showCharPicker = $state(false);

  let pickerSlugs = $derived(
    (() => {
      const current = new Set(activeSlugs);
      const pool = $activeFile?.type === 'session'
        ? $campaignCharacterData.map((c) => c.slug)
        : allVaultSlugs;
      return pool.filter((s) => !current.has(s));
    })()
  );

  async function loadVaultSlugs() {
    try {
      const entries = await invoke<{ name: string; is_dir: boolean }[]>('list_entries', {
        path: './vault/characters',
      });
      allVaultSlugs = entries.filter((e) => e.is_dir).map((e) => e.name);
    } catch {
      allVaultSlugs = [];
    }
  }

  async function updateSlugs(newSlugs: string[]) {
    const newContent = replaceFrontmatterCharacters($fileContent, newSlugs);
    replaceContent(newContent);
    if ($activeFile?.type === 'campaign') {
      await reloadCampaignCharacters(newContent);
    }
  }

  function removeChar(slug: string) {
    updateSlugs(activeSlugs.filter((s) => s !== slug));
  }

  function addChar(slug: string) {
    showCharPicker = false;
    updateSlugs([...activeSlugs, slug]);
  }

  function togglePicker() {
    if (!showCharPicker) loadVaultSlugs();
    showCharPicker = !showCharPicker;
  }
</script>

<div class="char-badges-bar">
  {#each characterBadges as char}
    <span class="char-badge" title={char.playerName ? `Spieler: ${char.playerName}` : char.name}>
      {char.name}{char.classLevel ? ` · ${char.classLevel}` : ''}
      <button class="char-remove" onclick={() => removeChar(char.slug)} title="Entfernen">×</button>
    </span>
  {/each}

  <div class="char-picker-wrap">
    <button class="char-add-btn" onclick={togglePicker} title="Charakter hinzufügen">+</button>
    {#if showCharPicker}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="char-picker"
        onmouseleave={() => { showCharPicker = false; }}
      >
        {#if pickerSlugs.length === 0}
          <span class="picker-empty">Keine weiteren Chars</span>
        {:else}
          {#each pickerSlugs as slug}
            <button class="picker-item" onclick={() => addChar(slug)}>{slug}</button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .char-badges-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 1.5rem;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--surface);
  }

  .char-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.72rem;
    padding: 0.15rem 0.4rem 0.15rem 0.55rem;
    border-radius: 99px;
    background: var(--surface);
    color: var(--arcane);
    border: 1px solid var(--border);
    white-space: nowrap;
  }

  .char-remove {
    background: none;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0 0.1rem;
    border-radius: 99px;
    transition: color 0.1s;
  }
  .char-remove:hover { color: var(--danger); }

  .char-picker-wrap {
    position: relative;
  }

  .char-add-btn {
    background: none;
    border: 1px dashed var(--border);
    border-radius: 99px;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
    padding: 0.1rem 0.45rem;
    transition: color 0.1s, border-color 0.1s;
  }
  .char-add-btn:hover { color: var(--arcane); border-color: var(--arcane); }

  .char-picker {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.25rem;
    z-index: 50;
    min-width: 140px;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }

  .picker-item {
    background: none;
    border: none;
    color: var(--ink);
    cursor: pointer;
    font-size: 0.78rem;
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    text-align: left;
    transition: background 0.1s;
  }
  .picker-item:hover { background: var(--surface); color: var(--arcane); }

  .picker-empty {
    font-size: 0.75rem;
    color: var(--border);
    padding: 0.3rem 0.6rem;
  }
</style>
