<script lang="ts">
  import type { Background } from '$lib/types';
  import { type Benefit, type BenefitType, BENEFIT_TYPES, BENEFIT_TYPE_LABELS } from '$lib/schemas/background';
  import { parseBackground as _parseBackground } from '$lib/utils/schemaValidation';
  import BackgroundEditForm from './BackgroundEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import ParseError from './ui/ParseError.svelte';
  import CardTools from './ui/CardTools.svelte';
  import Markdown from './Markdown.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import { translateBackground } from '$lib/services/aiActions/translateAction';
  import type { BackgroundTranslation } from '$lib/schemas/translation';
  import { createCardEditor } from '$lib/editor/cardEditor.svelte';
  import { slugKeepUmlauts } from '$lib/utils/text';
  import { activeFile, invalidateVault } from '$lib/stores/campaign';
  import { invalidateBackgroundsCache } from '$lib/backgroundsLibrary';
  import { getFeats, featDisplayName, type FeatEntry } from '$lib/featsLibrary';
  import { ABILITY_FROM_EN } from '$lib/services/classProgression';
  import { ABILITY_LABEL } from '$lib/schemas/abilities';
  import { skillLabelDe } from '$lib/services/proficiencyGrants';

  function parseBackground(json: string): Background | null {
    try {
      const result = _parseBackground(JSON.parse(json));
      return result.ok ? result.data : null;
    } catch { return null; }
  }

  const ed = createCardEditor<Background>({
    type: 'background',
    label: 'Hintergrund',
    parse: parseBackground,
    // Dateiname aus dem ENGLISCHEN Namen — so liegen auch `species`/`feats`/`classes`
    // im Vault (`acolyte.json`, nicht `akolyth.json`), vgl. vault/CLAUDE.md.
    defaultName: (b) => slugKeepUmlauts(b.name || b.nameDe || 'hintergrund'),
    location: {
      resolvePath: (_b, name) => `./vault/backgrounds/${name}.json`,
    },
    onSaved: () => { invalidateBackgroundsCache(); invalidateVault(); },
  });

  let draft = $derived(ed.draft);
  let dirty = $derived(ed.dirty);
  let saveError = $derived(ed.saveError);
  let lastSavedContent = $derived(ed.lastSavedContent);
  const save = () => ed.save();
  const discard = () => ed.discard();
  const saveJson = (json: string) => ed.saveJson(json);

  const benefitName = (b: Benefit): string => b.nameDe || b.name;
  const benefitDesc = (b: Benefit): string => b.descDe || b.desc;

  let grantedSkills = $derived((draft?.proficiencyGrant.skills.fixed ?? []).map(skillLabelDe));

  // `skill_proficiency` fällt heraus, sobald der strukturierte Grant gefüllt ist — die
  // Chip-Reihe im Kopf zeigt dasselbe, nur deutsch beschriftet.
  let groupedBenefits = $derived.by(() => {
    const bs = draft?.benefits ?? [];
    const skipSkills = grantedSkills.length > 0;
    return BENEFIT_TYPES
      .filter((type) => !(skipSkills && type === 'skill_proficiency'))
      .map((type) => ({ type, items: bs.filter((b) => b.type === type) }))
      .filter((g) => g.items.length);
  });

  /** Unbekannte Werte bleiben unverändert stehen. */
  let abilityLabels = $derived(
    (draft?.abilityScores ?? []).map((en) => {
      const key = ABILITY_FROM_EN[en.trim().toLowerCase()];
      return key ? ABILITY_LABEL[key] : en;
    }),
  );

  // Fehlt das verlinkte Talent lokal, wird das sichtbar gemacht statt still verschluckt.
  let featIndex = $state<FeatEntry[]>([]);
  $effect(() => { void getFeats().then((f) => (featIndex = f)); });

  let linkedFeat = $derived(
    draft?.featKey ? (featIndex.find((f) => f.sourceKey === draft!.featKey) ?? null) : null,
  );

  function openFeatPage() {
    if (!linkedFeat?.path) return;
    activeFile.set({
      name: linkedFeat.path.split('/').pop()!.replace('.json', ''),
      path: linkedFeat.path,
      type: 'feat',
    });
  }

  let showTranslate = $state(false);

  function buildTranslationRun() {
    const b = ed.draft;
    if (!b) return null;
    const payload: Record<string, unknown> = {
      benefits: b.benefits.map((x) => ({ name: x.name, desc: x.desc })),
    };
    if (b.name) payload.name = b.name;
    if (b.desc) payload.desc = b.desc;
    if (!b.name && !b.desc && !b.benefits.length) return null;
    return translateBackground(payload);
  }

  /** Leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet. */
  function applyTranslation(t: BackgroundTranslation) {
    const b = ed.draft;
    if (!b) return;
    if (t.name_de) b.nameDe = t.name_de;
    if (t.desc_de) b.descDe = t.desc_de;
    t.benefits.forEach((bf, i) => {
      if (!b.benefits[i]) return;
      if (bf.nameDe) b.benefits[i].nameDe = bf.nameDe;
      if (bf.descDe) b.benefits[i].descDe = bf.descDe;
    });
  }

  const groupLabel = (t: BenefitType): string => BENEFIT_TYPE_LABELS[t];
</script>

{#if draft}
  <EditorPanel
    bind:tab={ed.tab}
    {dirty}
    {saveError}
    onsave={save}
    ondiscard={discard}
    onsavejson={saveJson}
    getJson={() => draft ? JSON.stringify(draft, null, 2) : lastSavedContent}
    style="--ep-accent: var(--teal)"
  >
    {#snippet karte()}
      <div class="bg-card">
        <div class="head">
          <div class="name">{draft!.nameDe || draft!.name}</div>
          {#if draft!.nameDe && draft!.name && draft!.nameDe !== draft!.name}
            <div class="name-en">{draft!.name}</div>
          {/if}
          {#if abilityLabels.length}
            <div class="meta">{abilityLabels.join(' · ')}</div>
          {/if}
          {#if grantedSkills.length}
            <div class="chip-row">
              {#each grantedSkills as skill}<span class="chip">{skill}</span>{/each}
            </div>
          {/if}
        </div>

        {#if draft!.descDe || draft!.desc}
          <div class="intro"><Markdown source={draft!.descDe || draft!.desc} /></div>
        {/if}

        {#if draft!.featKey}
          <div class="feat-link-row">
            <span class="feat-link-label">Herkunftstalent</span>
            {#if linkedFeat}
              <button class="feat-link" onclick={openFeatPage}>{featDisplayName(linkedFeat)}</button>
            {:else}
              <span class="feat-missing" title={draft!.featKey}>⚠ nicht in der Bibliothek</span>
            {/if}
          </div>
        {/if}

        {#if groupedBenefits.length}
          <div class="benefits">
            {#each groupedBenefits as group}
              <div class="group">
                <div class="group-title">{groupLabel(group.type)}</div>
                {#each group.items as b}
                  <div class="benefit">
                    {#if benefitName(b) && benefitName(b) !== groupLabel(group.type)}
                      <div class="benefit-name">{benefitName(b)}</div>
                    {/if}
                    {#if benefitDesc(b)}
                      <div class="benefit-desc"><Markdown source={benefitDesc(b)} /></div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty">Keine Vorteile.</p>
        {/if}
      </div>
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <div class="edit-wrap">
          <BackgroundEditForm bind:background={ed.draft} />
        </div>
        <CardTools accent="var(--teal)" actions={[{ label: '🌐 Übersetzen…', onclick: () => (showTranslate = true) }]} />
      {/if}
    {/snippet}
  </EditorPanel>
{:else}
  <EditorPanel
    bind:tab={ed.tab}
    dirty={false}
    onsavejson={saveJson}
    getJson={() => lastSavedContent}
  >
    {#snippet karte()}
      <ParseError message="Kein gültiger Hintergrund-Datensatz." />
    {/snippet}
    {#snippet bearbeiten()}
      <ParseError message="Ungültiges Hintergrund-JSON." onjson={() => (ed.tab = 'json')} />
    {/snippet}
  </EditorPanel>
{/if}

{#if showTranslate && ed.draft}
  <TranslateModal
    entityName={ed.draft.nameDe || ed.draft.name || 'Hintergrund'}
    build={buildTranslationRun}
    onresult={applyTranslation}
    onclose={() => (showTranslate = false)}
  />
{/if}

<style>
  .bg-card {
    width: 100%; max-width: 560px; background: var(--bg);
    border: 1.5px solid var(--teal); border-radius: 8px;
    color: var(--ink); font-family: 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
    overflow: hidden;
  }
  .head {
    padding: 0.9rem 1.2rem; text-align: center;
    background: linear-gradient(to bottom,
      color-mix(in srgb, var(--teal) 40%, var(--bg)) 0%,
      color-mix(in srgb, var(--teal) 8%, var(--bg)) 100%);
  }
  .name { font-size: 1.3rem; font-weight: 700; font-variant: small-caps; letter-spacing: 0.02em; }
  .name-en { font-size: 0.85rem; font-style: italic; color: var(--ink-soft); }
  .meta { font-size: 0.8rem; color: color-mix(in srgb, var(--teal) 70%, var(--ink)); margin-top: 0.2rem; }

  .chip-row {
    display: flex; flex-wrap: wrap; gap: 0.3rem; justify-content: center; margin-top: 0.35rem;
  }
  .chip {
    background: color-mix(in srgb, var(--teal) 18%, var(--bg));
    border: 1px solid color-mix(in srgb, var(--teal) 45%, var(--bg));
    border-radius: 10px; padding: 0.05rem 0.5rem; font-size: 0.76rem; color: var(--ink);
  }

  .intro { padding: 0.7rem 1.2rem 0; font-size: 0.85rem; line-height: 1.55; }

  .feat-link-row {
    display: flex; align-items: baseline; gap: 0.4rem;
    padding: 0.6rem 1.2rem 0; font-size: 0.85rem;
  }
  .feat-link-label {
    font-variant: small-caps; font-weight: 700; color: var(--teal);
  }
  .feat-link {
    background: none; border: none; padding: 0; cursor: pointer;
    color: var(--red); font-family: inherit; font-size: 0.85rem; text-decoration: underline;
  }
  .feat-link:hover { color: var(--red-bright); }
  .feat-missing { color: var(--ink-muted); font-style: italic; font-size: 0.8rem; }

  .benefits { padding: 0.6rem 1.2rem 1rem; display: flex; flex-direction: column; gap: 0.7rem; }
  .group { display: flex; flex-direction: column; gap: 0.2rem; }
  .group-title { font-weight: 700; font-variant: small-caps; color: var(--teal); }
  .benefit-name { font-size: 0.85rem; font-weight: 600; }
  .benefit-desc { font-size: 0.85rem; line-height: 1.55; }
  .empty { padding: 1rem; color: var(--ink-muted); font-style: italic; }

  .edit-wrap {
    background: var(--bg);
    border: 1px solid color-mix(in srgb, var(--teal) 25%, var(--surface));
    border-radius: 6px; padding: 1rem 1.25rem; max-width: 560px; width: 100%;
    --mef-accent: var(--teal);
  }
</style>
