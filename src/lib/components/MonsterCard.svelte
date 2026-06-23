<script lang="ts">
  import type { Monster } from '../types';
  import { MONSTER_TYPES, MONSTER_TYPE_DIR } from '../types';
  import MonsterStatBlock from './MonsterStatBlock.svelte';
  import MonsterEditForm from './MonsterEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import { parseMonster as _parseMonster } from '../utils/schemaValidation';
  import { createCardEditor } from '../editor/cardEditor.svelte';
  import { slugify } from '../editor/saveAs';
  import { invalidateVault } from '../stores/campaign';

  function parseMonster(json: string): Monster | null {
    try {
      const result = _parseMonster(JSON.parse(json));
      return result.ok ? result.data : null;
    } catch { return null; }
  }

  const ed = createCardEditor<Monster>({
    type: 'monster',
    label: 'Monster',
    parse: parseMonster,
    defaultName: (m) => slugify(m.name || 'monster'),
    location: {
      // Ablage nach Creature-Type (Bucket). Typwechsel im Editor verschiebt die Datei.
      bucketLabel: 'Typ',
      bucketOf: (m) => MONSTER_TYPE_DIR[m.type],
      buckets: () => Object.entries(MONSTER_TYPE_DIR).map(([key, dir]) => ({
        value: dir,
        label: MONSTER_TYPES[key as keyof typeof MONSTER_TYPES],
      })),
      resolvePath: (_m, name, bucket) =>
        bucket ? `./vault/monsters/${bucket}/${name}.json` : `./vault/monsters/${name}.json`,
    },
    onSaved: () => invalidateVault(),
  });
</script>

<EditorPanel
  bind:tab={ed.tab}
  dirty={ed.dirty}
  saveError={ed.saveError}
  onsave={() => ed.save()}
  ondiscard={() => ed.discard()}
  onsavejson={(json) => ed.saveJson(json)}
  getJson={() => ed.draft ? JSON.stringify(ed.draft, null, 2) : ed.lastSavedContent}
  style="--ep-accent: var(--danger)"
>
  {#snippet karte()}
    {#if ed.draft}
      <MonsterStatBlock monster={ed.draft} />
    {:else}
      <p class="parse-error">
        Kein gültiger Monster-Datensatz.
        <button onclick={() => ed.tab = 'json'}>JSON bearbeiten</button>
      </p>
    {/if}
  {/snippet}

  {#snippet bearbeiten()}
    {#if ed.draft}
      <div class="stat-block">
        <MonsterEditForm bind:monster={ed.draft} />
      </div>
    {:else}
      <p class="parse-error">
        Ungültiges Monster-JSON.
        <button onclick={() => ed.tab = 'json'}>JSON bearbeiten</button>
      </p>
    {/if}
  {/snippet}
</EditorPanel>

<style>
  .stat-block {
    background: var(--bg-raised);
    border: 1px solid var(--red);
    border-radius: 6px;
    padding: 1rem 1.25rem;
    max-width: 560px;
    width: 100%;
    font-size: 0.88rem;
    color: var(--ink);
  }

  .parse-error { color: var(--danger); font-size: 0.9rem; }
  .parse-error button {
    background: none; border: none; color: var(--red);
    cursor: pointer; text-decoration: underline; font-family: inherit;
  }
</style>
