<script lang="ts">
  /** Kontext-Umschalter des KI-Panels: Badges, gepinnte Einträge, System-Prompt-Vorschau. */
  import {
    contextFlags,
    systemPrompt,
    pinnedEntries,
    actSummaries,
    encounterSummaries,
    monsterLibrary,
    encounterMonsterDefs,
    campaignContent,
    campaignCharacterData,
    pinEntry,
    unpinEntry,
    setPinDetailLevel,
  } from '../../stores/context';
  import type { ContextFlags } from '../../services/contextTypes';
  import { CHARACTER_CONTEXT_LEVELS, CHARACTER_CONTEXT_LABELS, CHARACTER_CONTEXT_HINTS } from '../../services/characterContext';
  import { monsterTypeLabel } from '../../types';
  import { activeFile, fileContent } from '../../stores/campaign';

  let showPrompt = $state(false);

  function handlePinActive() {
    const file = $activeFile;
    const content = $fileContent;
    if (!file || !content) return;
    pinEntry(file, content);
  }

  function toggleFlag(key: keyof ContextFlags) {
    contextFlags.update((f) => ({ ...f, [key]: !f[key] }));
  }

  function toggleMonsterGroup(group: string) {
    contextFlags.update((f) => {
      const active = f.monsterGroups.includes(group)
        ? f.monsterGroups.filter((g) => g !== group)
        : [...f.monsterGroups, group];
      return { ...f, monsterGroups: active };
    });
  }

  let monsterGroupList = $derived.by(() => {
    const groups = new Map<string, number>();
    for (const m of $monsterLibrary) {
      groups.set(m.group, (groups.get(m.group) ?? 0) + 1);
    }
    return [...groups.entries()].map(([group, count]) => ({ group, count }));
  });
</script>

<div class="context-bar">
  <div class="ctx-badges">
    {#if $campaignContent}
      <button class="ctx-badge narrative" class:off={!$contextFlags.campaign} onclick={() => toggleFlag('campaign')}>
        Kampagne
      </button>
    {/if}
    {#if $campaignCharacterData.length > 0}
      <button class="ctx-badge narrative" class:off={!$contextFlags.characters} onclick={() => toggleFlag('characters')}
        title={$campaignCharacterData.map((c) => c.name).join(', ')}>
        {$campaignCharacterData.length === 1 ? $campaignCharacterData[0].name : `${$campaignCharacterData.length} Chars`}
      </button>
    {/if}
    {#if $actSummaries.length > 0}
      <button class="ctx-badge narrative" class:off={!$contextFlags.acts} onclick={() => toggleFlag('acts')}>
        {$actSummaries.length} Akte
      </button>
    {/if}
    {#if $encounterSummaries.length > 0}
      <button class="ctx-badge narrative" class:off={!$contextFlags.encounters} onclick={() => toggleFlag('encounters')}>
        {$encounterSummaries.length} Enc
      </button>
    {/if}
    {#each monsterGroupList as { group, count }}
      <button
        class="ctx-badge level-library"
        class:off={!$contextFlags.monsterGroups.includes(group)}
        title="Monster-Gruppe: {monsterTypeLabel(group)}"
        onclick={() => toggleMonsterGroup(group)}
      >{monsterTypeLabel(group)} ({count})</button>
    {/each}
    {#if $activeFile}
      {@const fileLevelClass = {
        campaign: 'level-campaign', npc: 'level-campaign', world: 'level-campaign', character: 'level-campaign', notes: 'level-campaign',
        act: 'level-act',
        session: 'level-session',
        encounter: 'level-encounter',
        monster: 'level-library', spell: 'level-library', item: 'level-library',
        class: 'level-library', species: 'level-library', feat: 'level-library', background: 'level-library',
      }[$activeFile.type] ?? 'level-campaign'}
      <button class="ctx-badge {fileLevelClass}" class:off={!$contextFlags.activeFile} onclick={() => toggleFlag('activeFile')}
        title={$activeFile.name}>
        📄 {$activeFile.name.length > 14 ? $activeFile.name.slice(0, 13) + '…' : $activeFile.name}
      </button>
    {/if}
    {#if $activeFile?.type === 'encounter'}
      <button class="ctx-badge level-encounter" class:off={!$contextFlags.encounterMonsters} onclick={() => toggleFlag('encounterMonsters')}
        title="Vollständige Monster-Definitionen dieses Encounters">
        {$encounterMonsterDefs.length > 0 ? $encounterMonsterDefs.length : '?'} Mon↑
      </button>
    {/if}
    {#if $activeFile}
      <button class="ctx-badge pin-badge" onclick={handlePinActive} title="Anpinnen">+ Pin</button>
    {/if}
  </div>
  <button
    class="icon-btn"
    onclick={() => (showPrompt = !showPrompt)}
    title="System-Prompt anzeigen">{showPrompt ? '▲' : '▼'}</button
  >
</div>

{#if $pinnedEntries.length > 0}
  <div class="pinned-list">
    {#each $pinnedEntries as pin}
      <div class="pin-row" class:is-char={pin.isCharacter}>
        <span class="pin-icon">{pin.isCharacter ? '⚔' : '📌'}</span>
        <span class="pin-name">{pin.entry.name}</span>

        {#if pin.isCharacter}
          <div class="detail-toggle">
            {#each CHARACTER_CONTEXT_LEVELS as level}
              <button
                class="detail-btn"
                class:active={pin.detailLevel === level}
                title={CHARACTER_CONTEXT_HINTS[level]}
                onclick={() => setPinDetailLevel(pin.entry.path, level)}>{CHARACTER_CONTEXT_LABELS[level]}</button
              >
            {/each}
          </div>
        {/if}

        <button class="remove-btn" onclick={() => unpinEntry(pin.entry.path)}>×</button>
      </div>
    {/each}
  </div>
{/if}

{#if showPrompt}
  <div class="prompt-preview">
    <pre>{$systemPrompt}</pre>
  </div>
{/if}

<style>
  .context-bar {
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--surface);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--bg);
    flex-shrink: 0;
  }

  .ctx-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }

  .ctx-badge {
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.1rem 0.55rem;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, background 0.15s;
    white-space: nowrap;
  }

  .ctx-badge:hover { background: var(--border); }

  .ctx-badge.off {
    opacity: 0.35;
    text-decoration: line-through;
  }

  /* Kampagnen-Ebene: Kampagne, Akte, Enc + campaign/npc/world/character-Dateien */
  .ctx-badge.narrative,
  .ctx-badge.level-campaign { border-color: var(--green); color: var(--green); }
  .ctx-badge.narrative.off,
  .ctx-badge.level-campaign.off { border-color: var(--border); color: var(--ink-muted); }

  /* Akt-Ebene */
  .ctx-badge.level-act { border-color: var(--red); color: var(--red); }
  .ctx-badge.level-act.off { border-color: var(--border); color: var(--ink-muted); }

  /* Session-Ebene (Chronik) */
  .ctx-badge.level-session { border-color: var(--teal); color: var(--teal); }
  .ctx-badge.level-session.off { border-color: var(--border); color: var(--ink-muted); }

  /* Encounter-Ebene: encounter-Datei + Mon↑ */
  .ctx-badge.level-encounter { border-color: var(--arcane); color: var(--arcane); }
  .ctx-badge.level-encounter.off { border-color: var(--border); color: var(--ink-muted); }

  /* Bibliotheks-Ebene: monster-Datei + Mon-Bibliothek */
  .ctx-badge.mechanic,
  .ctx-badge.level-library { border-color: var(--copper); color: var(--copper); }
  .ctx-badge.mechanic.off,
  .ctx-badge.level-library.off { border-color: var(--border); color: var(--ink-muted); }

  .ctx-badge.pin-badge {
    border-color: var(--ink-muted);
    color: var(--ink-muted);
    background: transparent;
  }
  .ctx-badge.pin-badge:hover { background: var(--surface); }

  .icon-btn {
    background: transparent;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.15rem 0.3rem;
  }

  .pinned-list {
    border-bottom: 1px solid var(--surface);
    background: var(--bg);
    flex-shrink: 0;
  }

  .pin-row {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.75rem;
    border-bottom: 1px solid var(--bg-raised);
    font-size: 0.72rem;
  }

  .pin-row:last-child { border-bottom: none; }

  .pin-icon { flex-shrink: 0; font-size: 0.7rem; }

  .pin-name {
    flex: 1;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pin-row.is-char .pin-name { color: var(--danger); }

  .detail-toggle {
    display: flex;
    gap: 0.15rem;
    flex-shrink: 0;
  }

  .detail-btn {
    background: var(--surface);
    color: var(--ink-muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.1rem 0.3rem;
    font-size: 0.65rem;
    cursor: pointer;
    font-weight: 600;
  }

  .detail-btn.active {
    background: var(--danger);
    color: var(--bg);
    border-color: var(--danger);
  }

  .remove-btn {
    background: transparent;
    border: none;
    color: var(--border);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    padding: 0;
    flex-shrink: 0;
    line-height: 1;
  }

  .remove-btn:hover { color: var(--danger); }

  .prompt-preview {
    background: var(--bg-deep);
    border-bottom: 1px solid var(--surface);
    padding: 0.5rem 0.75rem;
    resize: vertical;
    overflow: auto;
    height: 150px;
    min-height: 60px;
    flex-shrink: 0;
  }

  .prompt-preview pre {
    margin: 0;
    font-size: 0.65rem;
    color: var(--ink-muted);
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
