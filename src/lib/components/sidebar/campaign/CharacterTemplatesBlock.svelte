<script lang="ts">
  /** Die Charaktervorlagen der Kampagne: öffnen im Charakter-Editor, aus einem Charakter anlegen, löschen. */
  import { activeFile } from '../../../stores/campaign';
  import { navigateTo } from '../../../services/navigation';
  import { confirmAction } from '../../../stores/confirmDialog';
  import { listCharacterRefs, type CharacterRef } from '../../../services/characterDirectory';
  import type { CharacterTemplateRef } from '../../../services/templates/templates';
  import {
    characterTemplatesDir, deleteCharacterTemplate, listCampaignCharacterTemplates, saveCharacterAsTemplate, templateLevelPath,
  } from '../../../services/templates/campaignCharacterTemplates';
  import SectionHeader from '../SectionHeader.svelte';
  import type { Campaign } from '../../../types';
  import '../tree.css';

  let { campaign }: { campaign: Campaign } = $props();

  let expanded = $state(false);
  let templates = $state<CharacterTemplateRef[]>([]);
  let candidates = $state<CharacterRef[] | null>(null);

  async function load() {
    templates = await listCampaignCharacterTemplates(campaign.path);
  }

  async function toggle() {
    expanded = !expanded;
    if (expanded) await load();
  }

  async function startAdd() {
    expanded = true;
    await load();
    candidates = candidates ? null : await listCharacterRefs();
  }

  const open = (t: CharacterTemplateRef, level: number) =>
    navigateTo({ name: `${t.name} (Vorlage)`, path: templateLevelPath(t, level), type: 'character', dirPath: t.dir });

  async function add(c: CharacterRef) {
    candidates = null;
    const id = await saveCharacterAsTemplate(campaign.path, c.uid);
    await load();
    const created = templates.find((t) => t.dir === `${characterTemplatesDir(campaign.path)}/${id}`);
    if (created) await open(created, 1);
  }

  async function remove(t: CharacterTemplateRef) {
    const ok = await confirmAction({
      title: 'Vorlage löschen?',
      message: `„${t.name}" verschwindet aus den Vorlagen dieser Kampagne. Charaktere, die schon daraus angelegt wurden, bleiben.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    await deleteCharacterTemplate(t);
    await load();
  }
</script>

<div class="section">
  <SectionHeader label="Charaktervorlagen" {expanded} ontoggle={toggle}>
    {#snippet actions()}
      <button class="add-btn" title="Einen Charakter als Vorlage speichern" onclick={startAdd}>+</button>
    {/snippet}
  </SectionHeader>

  {#if expanded}
    <div class="file-list">
      {#if candidates}
        <p class="hint">Welcher Charakter wird zur Vorlage?</p>
        {#each candidates as c (c.uid)}
          <button class="file-entry pick" onclick={() => add(c)}>{c.name || 'Unbenannt'}{c.classLevel ? ` · ${c.classLevel}` : ''}</button>
        {:else}
          <span class="empty">Noch keine Charaktere</span>
        {/each}
      {/if}
      {#each templates as t (t.dir)}
        {#each t.levels as l (l.level)}
          <div class="row">
            <button
              class="file-entry"
              class:active={$activeFile?.path === templateLevelPath(t, l.level)}
              title={l.classLevel}
              onclick={() => open(t, l.level)}
            >
              {t.name}{t.levels.length > 1 ? ` · Stufe ${l.level}` : ''}
            </button>
            {#if l.level === 1}
              <button class="del" title="Vorlage löschen" onclick={() => remove(t)}>✕</button>
            {/if}
          </div>
        {/each}
      {:else}
        {#if !candidates}<span class="empty">Keine Vorlagen</span>{/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .section {
    padding: 0 0 0.25rem 0;
  }
  .row {
    display: flex;
    align-items: center;
  }
  .row .file-entry {
    flex: 1;
    min-width: 0;
  }
  .del {
    padding: 0 0.6rem;
    background: none;
    border: none;
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.7rem;
    opacity: 0;
  }
  .row:hover .del {
    opacity: 1;
  }
  .del:hover {
    color: var(--danger);
  }
  .hint {
    margin: 0.2rem 1rem 0.1rem 2.5rem;
    font-size: 0.75rem;
    color: var(--ink-muted);
  }
  .pick {
    font-style: italic;
  }
</style>
