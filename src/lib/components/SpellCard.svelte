<script lang="ts">
  import type { Spell } from '$lib/types';
  import { SPELL_SCHOOLS } from '$lib/types';
  import { prepareSpellPrint } from '$lib/utils/printSpell';
  import { printHtmlDocument } from '$lib/utils/printFrame';
  import { SCHOOL_COLORS } from '$lib/spellLibrary';
  import SpellCardView from './libraryView/SpellCardView.svelte';
  import { parseSpell as _parseSpell, jsonParser } from '$lib/utils/schemaValidation';
  import SpellEditForm from './SpellEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import CardParseError from './ui/CardParseError.svelte';
  import CardEditWrap from './ui/CardEditWrap.svelte';
  import CardTools from './ui/CardTools.svelte';
  import AiEditModal from './AiEditModal.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import DndApiSearch from './DndApiSearch.svelte';
  import { translateSpell } from '$lib/services/aiActions/translateAction';
  import type { SpellTranslation } from '$lib/schemas/translation';
  import { convertDistances } from '$lib/utils/distanceText';
  import { createCardEditor } from '$lib/editor/cardEditor.svelte';
  import { editSpellAction } from '$lib/services/aiActions/spellAction';
  import { searchOpen5eSpells, getSpell, type Open5eItemSearchResult } from '$lib/services/open5eClient';
  import { mapOpen5eSpell } from '$lib/services/open5eSpellMapper';
  import { slugKeepUmlauts } from '$lib/utils/text';
  import { invalidateVault } from '$lib/stores/campaign';

  // Schule englisch im JSON, Ordnername deutsch im Vault.
  const SCHOOL_TO_DIR: Record<string, string> = {
    abjuration: 'bannmagie', conjuration: 'beschwörung', divination: 'erkenntnismagie',
    enchantment: 'verzauberung', evocation: 'hervorrufung', illusion: 'illusionsmagie',
    necromancy: 'nekromantie', transmutation: 'verwandlung',
  };

  const ed = createCardEditor<Spell>({
    type: 'spell',
    label: 'Zauber',
    parse: jsonParser(_parseSpell),
    defaultName: (s) => slugKeepUmlauts(s.name || 'zauber'),
    location: {
      bucketLabel: 'Schule',
      bucketOf: (s) => SCHOOL_TO_DIR[s.school],
      buckets: () => Object.entries(SCHOOL_TO_DIR).map(([key, dir]) => ({
        value: dir,
        label: SPELL_SCHOOLS[key as keyof typeof SPELL_SCHOOLS] ?? dir,
      })),
      resolvePath: (_s, name, bucket) => `./vault/spells/${bucket}/${name}.json`,
    },
    onSaved: () => invalidateVault(),
  });

  let draft = $derived(ed.draft);

  let showAi = $state(false);
  let showTranslate = $state(false);
  let importError = $state('');

  function applyAiResult(revised: Spell) {
    const r = _parseSpell(revised);
    ed.draft = r.ok ? r.data : revised;
  }

  async function importFromApi(result: Open5eItemSearchResult) {
    importError = '';
    try {
      const mapped = mapOpen5eSpell(await getSpell(result.url));
      const r = _parseSpell(mapped);
      ed.draft = r.ok ? r.data : mapped;
    } catch (e) {
      importError = `Import fehlgeschlagen: ${e instanceof Error ? e.message : e}`;
    }
  }

  function buildTranslationRun() {
    const s = ed.draft;
    if (!s) return null;
    const payload: Record<string, unknown> = {};
    if (s.desc?.length) payload.desc = s.desc;
    if (s.higher_level?.length) payload.higher_level = s.higher_level;
    if (s.components.material && s.components.materials_needed) payload.materials_needed = s.components.materials_needed;
    if (s.desc?.length) { payload.casting_time = s.casting_time; payload.range = s.range; payload.duration = s.duration; }
    if (!Object.keys(payload).length) return null;
    return translateSpell(payload);
  }

  /** Leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet. */
  function applyTranslation(t: SpellTranslation) {
    const s = ed.draft;
    if (!s) return;
    if (t.desc_de.length) s.desc_de = t.desc_de.map(convertDistances);
    if (t.higher_level_de.length) s.higher_level_de = t.higher_level_de.map(convertDistances);
    if (t.materials_needed) s.components.materials_needed = convertDistances(t.materials_needed);
    if (t.casting_time) s.casting_time = convertDistances(t.casting_time);
    if (t.range) s.range = convertDistances(t.range);
    if (t.duration) s.duration = convertDistances(t.duration);
  }

  function printSpell() {
    if (!draft) return;
    printHtmlDocument(prepareSpellPrint(draft, document), draft.name);
  }
</script>

{#if draft}
  {@const color = SCHOOL_COLORS[draft.school] ?? 'var(--arcane)'}
  <EditorPanel
    bind:tab={ed.tab}
    dirty={ed.dirty}
    saveError={ed.saveError}
    onsave={() => ed.save()}
    ondiscard={() => ed.discard()}
    onsavejson={(json) => ed.saveJson(json)}
    getJson={() => draft ? JSON.stringify(draft, null, 2) : ed.lastSavedContent}
    style="--ep-accent: {color}"
  >
    {#snippet tabactions()}
      <button class="pdf-tab-btn" onclick={printSpell}>PDF</button>
    {/snippet}
    {#snippet karte()}
      <div class="card-wrap">
        <SpellCardView spell={draft!} />
      </div>
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <CardEditWrap accent={color}>
          <SpellEditForm bind:spell={ed.draft} />
        </CardEditWrap>
        <CardTools accent="var(--red)"
          actions={[
            { label: '🌐 Übersetzen…', onclick: () => (showTranslate = true) },
            { label: '✨ KI überarbeiten…', onclick: () => (showAi = true) },
          ]}
        >
          <DndApiSearch placeholder="SRD-Zauber importieren…" onsearch={searchOpen5eSpells} onselect={importFromApi} />
          {#if importError}<span class="import-error">{importError}</span>{/if}
        </CardTools>
      {/if}
    {/snippet}
  </EditorPanel>
{:else}
  <CardParseError bind:tab={ed.tab} noun="Zauber" json={ed.lastSavedContent} onsavejson={(json) => ed.saveJson(json)} />
{/if}

{#if showAi && ed.draft}
  <AiEditModal
    entityName={ed.draft.name || 'Zauber'}
    buildAction={() => editSpellAction($state.snapshot(ed.draft) as Spell)}
    onresult={applyAiResult}
    onclose={() => (showAi = false)}
  />
{/if}

{#if showTranslate && ed.draft}
  <TranslateModal
    entityName={ed.draft.name || 'Zauber'}
    build={buildTranslationRun}
    onresult={applyTranslation}
    onclose={() => (showTranslate = false)}
  />
{/if}

<style>
  .import-error { color: var(--danger); font-size: 0.78rem; }

  .card-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  .pdf-tab-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--ink-muted);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.15rem 0.55rem;
    border-radius: 4px;
    font-family: inherit;
  }
  .pdf-tab-btn:hover {
    color: var(--ink);
    border-color: var(--ink-muted);
  }

</style>
