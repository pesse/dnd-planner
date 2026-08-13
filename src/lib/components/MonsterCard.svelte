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
  import { translateMonster } from '../services/aiActions/translateAction';
  import type { MonsterTranslation } from '../schemas/translation';
  import { convertDistances } from '$lib/utils/distanceText';
  import { parseMonster, normalizeMonster, jsonParser } from '../utils/schemaValidation';
  import { createCardEditor } from '../editor/cardEditor.svelte';
  import { editMonsterAction } from '../services/aiActions/monsterAction';
  import { slugKeepUmlauts } from '../utils/text';
  import { invalidateVault } from '../stores/campaign';

  const ed = createCardEditor<Monster>({
    type: 'monster',
    label: 'Monster',
    parse: jsonParser(parseMonster),
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

  /** Übernimmt das von der KI überarbeitete Monster in den Draft. */
  function applyAiResult(revised: Monster) {
    ed.draft = normalizeMonster(revised);
  }

  let showTranslate = $state(false);

  /** Baut den Übersetzungslauf; null, wenn es nichts zu übersetzen gibt. */
  function buildTranslationRun() {
    const m = ed.draft;
    if (!m) return null;
    const toTranslate: Record<string, unknown> = {};
    if (m.name) toTranslate.name = m.name;
    if (m.armor_detail) toTranslate.armor_detail = m.armor_detail;
    if (m.languages.length) toTranslate.languages = m.languages;
    if (m.languages_desc) toTranslate.languages_desc = m.languages_desc;
    if (m.defenses_desc) toTranslate.defenses_desc = m.defenses_desc;
    for (const key of ['traits', 'actions'] as const) {
      if (m[key].length > 0) toTranslate[key] = m[key].map((a) => ({ name: a.name, desc: a.desc }));
    }
    if (Object.keys(toTranslate).length === 0) return null;
    return translateMonster(toTranslate);
  }

  /**
   * Übernimmt die Übersetzung; leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet.
   * Der englische Stand wandert in die `*_en`-Felder, sofern dort noch nichts steht — sonst
   * verliert der Re-Import seinen Match-Schlüssel.
   */
  function applyTranslation(t: MonsterTranslation) {
    const m = ed.draft;
    if (!m) return;
    if (t.name) {
      m.name_en ||= m.name;
      m.name = t.name;
    }
    if (t.armor_detail) m.armor_detail = t.armor_detail;
    if (t.languages.length) m.languages = t.languages;
    if (t.languages_desc) m.languages_desc = t.languages_desc;
    if (t.defenses_desc) m.defenses_desc = t.defenses_desc;
    for (const key of ['traits', 'actions'] as const) {
      t[key].forEach((x, i) => {
        const entry = m[key][i];
        if (!entry) return;
        if (x.name) {
          entry.name_en ||= entry.name;
          entry.name = x.name;
        }
        if (x.desc) {
          entry.desc_en ||= entry.desc;
          entry.desc = convertDistances(x.desc);
        }
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
      />
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
</style>
