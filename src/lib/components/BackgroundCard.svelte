<script lang="ts">
  import type { Background } from '$lib/types';
  import { type Benefit, type BenefitType, BENEFIT_TYPES, BENEFIT_TYPE_LABELS } from '$lib/schemas/background';
  import { parseBackground } from '$lib/utils/schemaValidation';
  import BackgroundEditForm from './BackgroundEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import CardParseError from './ui/CardParseError.svelte';
  import LibraryCardFrame from './ui/LibraryCardFrame.svelte';
  import CardEditWrap from './ui/CardEditWrap.svelte';
  import CardTools from './ui/CardTools.svelte';
  import Markdown from './Markdown.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import { translateBackground } from '$lib/services/aiActions/translateAction';
  import type { BackgroundTranslation } from '$lib/schemas/translation';
  import { createLibraryCardEditor } from '$lib/editor/libraryCard';
  import { activeFile } from '$lib/stores/campaign';
  import { invalidateBackgroundsCache } from '$lib/backgroundsLibrary';
  import { getFeats, featDisplayName, type FeatEntry } from '$lib/featsLibrary';
  import { abilityKeyOf, ABILITY_LABEL } from '$lib/schemas/abilities';
  import { skillLabelDe } from '$lib/services/proficiencyGrants';

  const ed = createLibraryCardEditor<Background>({
    type: 'background',
    label: 'Hintergrund',
    folder: 'backgrounds',
    validate: parseBackground,
    fallbackName: 'hintergrund',
    invalidateCache: invalidateBackgroundsCache,
  });

  let draft = $derived(ed.draft);

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
      const key = abilityKeyOf(en);
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
    dirty={ed.dirty}
    saveError={ed.saveError}
    onsave={() => ed.save()}
    ondiscard={() => ed.discard()}
    onsavejson={(json) => ed.saveJson(json)}
    getJson={() => draft ? JSON.stringify(draft, null, 2) : ed.lastSavedContent}
    style="--ep-accent: var(--teal)"
  >
    {#snippet karte()}
      <LibraryCardFrame accent="var(--teal)" name={draft!.name} nameDe={draft!.nameDe}>
        {#snippet head()}
          {#if abilityLabels.length}
            <div class="meta">{abilityLabels.join(' · ')}</div>
          {/if}
          {#if grantedSkills.length}
            <div class="chip-row">
              {#each grantedSkills as skill}<span class="chip">{skill}</span>{/each}
            </div>
          {/if}
        {/snippet}

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
      </LibraryCardFrame>
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <CardEditWrap accent="var(--teal)">
          <BackgroundEditForm bind:background={ed.draft} />
        </CardEditWrap>
        <CardTools accent="var(--teal)" actions={[{ label: '🌐 Übersetzen…', onclick: () => (showTranslate = true) }]} />
      {/if}
    {/snippet}
  </EditorPanel>
{:else}
  <CardParseError bind:tab={ed.tab} noun="Hintergrund" json={ed.lastSavedContent} onsavejson={(json) => ed.saveJson(json)} />
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
</style>
