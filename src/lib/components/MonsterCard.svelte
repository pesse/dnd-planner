<script lang="ts">
  import type { Monster } from '../types';
  import { MONSTER_TYPES, MONSTER_TYPE_DIR } from '../types';
  import MonsterStatBlock from './MonsterStatBlock.svelte';
  import MonsterEditForm from './MonsterEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import ParseError from './ui/ParseError.svelte';
  import CardTools from './ui/CardTools.svelte';
  import AiEditModal from './AiEditModal.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import DndApiSearch from './DndApiSearch.svelte';
  import { translateMonster } from '../services/aiActions/translateAction';
  import type { MonsterTranslation } from '../schemas/translation';
  import { convertDistances } from '$lib/utils/distanceText';
  import { parseMonster as _parseMonster, normalizeMonster } from '../utils/schemaValidation';
  import { createCardEditor } from '../editor/cardEditor.svelte';
  import { editMonsterAction } from '../services/aiActions/monsterAction';
  import { searchMonsters, getResource, mapApiResourceToMonster, type DndApiRef } from '../services/dndApi';
  import { slugKeepUmlauts } from '../utils/text';
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
    defaultName: (m) => slugKeepUmlauts(m.name || 'monster'),
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

  let showAi = $state(false);
  let importError = $state('');

  /** Übernimmt das von der KI überarbeitete Monster in den Draft. */
  function applyAiResult(revised: Monster) {
    ed.draft = normalizeMonster(revised);
  }

  /** Lädt einen SRD-Statblock und übernimmt ihn als Draft. */
  async function importFromApi(ref: DndApiRef) {
    importError = '';
    try {
      ed.draft = normalizeMonster(mapApiResourceToMonster(await getResource(ref.url)));
    } catch (e) {
      importError = `Import fehlgeschlagen: ${e instanceof Error ? e.message : e}`;
    }
  }

  let showTranslate = $state(false);

  /** Baut den Übersetzungslauf; null, wenn es nichts zu übersetzen gibt. */
  function buildTranslationRun() {
    const m = ed.draft;
    if (!m) return null;
    const toTranslate: Record<string, unknown> = {};
    if (m.name) toTranslate.name = m.name;
    if (m.languages) toTranslate.languages = m.languages;
    if (m.damage_resistances.length) toTranslate.damage_resistances = m.damage_resistances;
    if (m.damage_immunities.length) toTranslate.damage_immunities = m.damage_immunities;
    if (m.condition_immunities.length) toTranslate.condition_immunities = m.condition_immunities;
    for (const key of ['traits', 'actions', 'reactions', 'legendary_actions'] as const) {
      if (m[key].length > 0) toTranslate[key] = m[key].map((a) => ({ name: a.name, description: a.description }));
    }
    if (Object.keys(toTranslate).length === 0) return null;
    return translateMonster(toTranslate);
  }

  /** Übernimmt die Übersetzung; leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet. */
  function applyTranslation(t: MonsterTranslation) {
    const m = ed.draft;
    if (!m) return;
    if (t.name) m.name = t.name;
    if (t.languages) m.languages = t.languages;
    if (t.damage_resistances.length) m.damage_resistances = t.damage_resistances;
    if (t.damage_immunities.length) m.damage_immunities = t.damage_immunities;
    if (t.condition_immunities.length) m.condition_immunities = t.condition_immunities;
    for (const key of ['traits', 'actions', 'reactions', 'legendary_actions'] as const) {
      t[key].forEach((x, i) => {
        if (!m[key][i]) return;
        if (x.name) m[key][i].name = x.name;
        if (x.description) m[key][i].description = convertDistances(x.description);
      });
    }
  }
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
      <ParseError message="Kein gültiger Monster-Datensatz." onjson={() => (ed.tab = 'json')} />
    {/if}
  {/snippet}

  {#snippet bearbeiten()}
    {#if ed.draft}
      <div class="stat-block">
        <MonsterEditForm bind:monster={ed.draft} />
      </div>
      <CardTools accent="var(--red)"
        actions={[
          { label: '🌐 Übersetzen…', onclick: () => (showTranslate = true) },
          { label: '✨ KI überarbeiten…', onclick: () => (showAi = true) },
        ]}
      >
        <DndApiSearch placeholder="SRD-Monster importieren…" onsearch={searchMonsters} onselect={importFromApi} />
        {#if importError}<span class="import-error">{importError}</span>{/if}
      </CardTools>
    {:else}
      <ParseError message="Ungültiges Monster-JSON." onjson={() => (ed.tab = 'json')} />
    {/if}
  {/snippet}
</EditorPanel>

{#if showAi && ed.draft}
  <AiEditModal
    entityName={ed.draft.name || 'Monster'}
    buildAction={() => editMonsterAction($state.snapshot(ed.draft) as Monster)}
    onresult={applyAiResult}
    onclose={() => (showAi = false)}
  />
{/if}

{#if showTranslate && ed.draft}
  <TranslateModal
    entityName={ed.draft.name || 'Monster'}
    build={buildTranslationRun}
    onresult={applyTranslation}
    onclose={() => (showTranslate = false)}
  />
{/if}

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

  .import-error { color: var(--danger); font-size: 0.78rem; }
</style>
