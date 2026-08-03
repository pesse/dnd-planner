<script lang="ts">
  import type { Spell } from '$lib/types';
  import { spellLevelLabel, spellDesc, spellHigherLevel, spellComponents, SPELL_SCHOOLS, SPELL_CLASS_LABELS } from '$lib/types';
  import { prepareSpellPrint } from '$lib/utils/printSpell';
  import { printHtmlDocument } from '$lib/utils/printFrame';
  import { SCHOOL_COLORS } from '$lib/spellLibrary';
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
  import Markdown from './Markdown.svelte';
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
      {@const higherLevel = spellHigherLevel(draft!)}
      {@const comps = spellComponents(draft!)}
      {@const pc = SCHOOL_COLORS[draft!.school] ?? 'var(--ink-muted)'}
      <div class="card-wrap">
        <div class="spell-card" style="--c: {pc}">
          <div class="head">
            <div class="name">
              {draft!.name}{#if draft!.ritual} <span class="ritual">Ritual</span>{/if}
            </div>
            <div class="meta">{spellLevelLabel(draft!.level)} · {SPELL_SCHOOLS[draft!.school] ?? draft!.school}</div>
          </div>
          <div class="orndiv"><div class="ol"></div><span class="og">✦</span><div class="ol"></div></div>
          <div class="props">
            <div class="prop-row">
              <span class="pc"><span class="icon">⚡</span>{draft!.casting_time}</span>
              <span class="pc"><span class="icon">◎</span>{draft!.range}</span>
              <span class="pc"><span class="icon">⌛</span>{draft!.duration.replace('Konzentration, ', 'Konz. ')}</span>
            </div>
            <div class="prop">
              <span class="icon">✦</span>
              <span>{comps}{#if draft!.components.materials_needed} <span class="mat">({draft!.components.materials_needed})</span>{/if}</span>
            </div>
          </div>
          <div class="orndiv"><div class="ol"></div><span class="og">✦</span><div class="ol"></div></div>
          <!-- Kein Splitting auf mehrere Karten: die Karte darf beliebig hoch werden, das
               EditorPanel scrollt. Aufteilen ist allein eine Druck-Anforderung (printSpell.ts). -->
          <div class="desc"><Markdown source={spellDesc(draft!)} /></div>
          {#if higherLevel}
            <div class="higher"><span class="higher-lbl">Auf höheren Graden.</span> <Markdown source={higherLevel} inline /></div>
          {/if}
          <div class="foot">
            <span>{draft!.classes.map(c => SPELL_CLASS_LABELS[c] ?? c).join(' · ')}</span>
          </div>
        </div>
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

  .spell-card {
    width: 100%;
    max-width: 380px;
    background: var(--bg);
    border: 1.5px solid var(--gold);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 3px 16px rgba(0,0,0,0.23);
    display: flex;
    flex-direction: column;
    color: var(--ink);
    font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    position: relative;
  }
  .spell-card::after {
    content: '';
    position: absolute;
    inset: 3px;
    border: 1px solid var(--gold);
    border-radius: 5px;
    pointer-events: none;
    z-index: 5;
  }

  .head {
    padding: 0.9rem 1.2rem 0.65rem;
    text-align: center;
    flex-shrink: 0;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--c) 55%, var(--bg)) 0%,
      color-mix(in srgb, var(--c) 10%, var(--bg)) 100%);
  }
  .name {
    font-size: 1.05rem;
    font-weight: 700;
    font-variant: small-caps;
    color: var(--ink);
    line-height: 1.2;
    letter-spacing: 0.02em;
  }
  .ritual {
    font-size: 0.58rem;
    font-weight: 700;
    font-variant: normal;
    background: var(--c);
    color: white;
    border-radius: 2px;
    padding: 1px 4px;
    vertical-align: middle;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .meta {
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--c) 80%, var(--ink));
    margin-top: 0.2rem;
    font-style: italic;
  }

  .orndiv {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 10px;
    flex-shrink: 0;
  }
  .ol {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, transparent, var(--c) 30%, var(--c) 70%, transparent);
  }
  .orndiv .ol:last-child {
    background: linear-gradient(to left, transparent, var(--c) 30%, var(--c) 70%, transparent);
  }
  .og {
    font-size: 0.65rem;
    color: var(--c);
    line-height: 1;
  }

  .props {
    padding: 0.45rem 1.1rem;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    line-height: 1.4;
  }
  .pc {
    display: inline;
    margin-right: 0.65rem;
  }
  .prop {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }
  .icon {
    color: var(--c);
    flex-shrink: 0;
    width: 0.9rem;
    text-align: center;
    display: inline-block;
  }
  .mat {
    color: var(--ink-muted);
    font-style: italic;
  }

  .desc {
    padding: 0.55rem 1.1rem;
    font-size: 0.82rem;
    line-height: 1.55;
    color: var(--ink);
  }

  .higher {
    padding: 0 1.1rem 0.55rem;
    font-size: 0.77rem;
    line-height: 1.45;
    color: var(--ink-soft);
  }
  .higher-lbl {
    font-weight: 700;
    color: var(--c);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 1.1rem;
    border-top: 1px solid var(--gold);
    background: color-mix(in srgb, var(--c) 6%, var(--bg));
    font-size: 0.72rem;
    color: var(--ink-muted);
    font-style: italic;
    flex-shrink: 0;
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
