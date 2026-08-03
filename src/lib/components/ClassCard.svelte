<script lang="ts">
  import type { ClassProgression, ClassFeature } from '$lib/types';
  import { parseClass } from '$lib/utils/schemaValidation';
  import {
    abilityLabelDe, skillLabelDe, skillGrantSummary, ARMOR_LABEL_DE, WEAPON_LABEL_DE,
  } from '$lib/services/proficiencyGrants';
  import ClassEditForm from './ClassEditForm.svelte';
  import EditorPanel from './EditorPanel.svelte';
  import CardParseError from './ui/CardParseError.svelte';
  import LibraryCardFrame from './ui/LibraryCardFrame.svelte';
  import CardEditWrap from './ui/CardEditWrap.svelte';
  import CardTools from './ui/CardTools.svelte';
  import Markdown from './Markdown.svelte';
  import TranslateModal from './TranslateModal.svelte';
  import { translateRule } from '$lib/services/aiActions/translateAction';
  import type { RuleTranslation } from '$lib/schemas/translation';
  import { createLibraryCardEditor } from '$lib/editor/libraryCard';
  import { invalidateClassCache } from '$lib/classLibrary';
  import { declarationCoverage, coverageBadge } from '$lib/services/declarationCoverage';
  import DeclarationBadge from './DeclarationBadge.svelte';

  const ed = createLibraryCardEditor<ClassProgression>({
    type: 'class',
    label: 'Klasse',
    folder: 'classes',
    validate: parseClass,
    fallbackName: 'klasse',
    invalidateCache: invalidateClassCache,
  });

  let draft = $derived(ed.draft);

  const CASTER_LABELS: Record<string, string> = {
    NONE: 'Kein Zauberwirker', FULL: 'Voller Zauberwirker', HALF: 'Halber Zauberwirker',
    THIRD: 'Drittel-Zauberwirker', PACT: 'Paktmagie',
  };

  const featureName = (f: ClassFeature): string => f.nameDe || f.name;
  const featureDesc = (f: ClassFeature): string => f.descDe || f.desc;

  // Eine Subklasse ist eine eigene Progression und zählt mit ihrer eigenen Merkmalsliste.
  let coverage = $derived(declarationCoverage(draft?.features ?? []));
  let declBadge = $derived(coverageBadge(coverage));

  let coreRows = $derived.by(() => {
    const g = draft?.proficiencyGrant;
    if (!g) return [] as { label: string; value: string }[];
    const weapons = [...g.weapons.map((w) => WEAPON_LABEL_DE[w]), ...g.weaponsOther];
    return [
      { label: 'Rettungswürfe', value: g.savingThrows.map(abilityLabelDe).join(', ') },
      { label: 'Fertigkeiten', value: skillGrantSummary(g.skills) },
      { label: 'Waffen', value: weapons.join(', ') },
      { label: 'Rüstung', value: g.armor.map((a) => ARMOR_LABEL_DE[a]).join(', ') },
      { label: 'Bei Klassenkombination', value: skillGrantSummary(draft?.skillGrantMulticlass) },
    ].filter((r) => r.value);
  });

  let choiceList = $derived(
    (draft?.proficiencyGrant.skills.choose ?? 0) > 0
      ? (draft?.proficiencyGrant.skills.from ?? []).map((s) => skillLabelDe(s))
      : [],
  );

  let showTranslate = $state(false);

  function buildTranslationRun() {
    const c = ed.draft;
    if (!c) return null;
    const payload = {
      name: c.name,
      features: c.features.map((f) => ({ name: f.name, desc: f.desc })),
    };
    if (!payload.name && !payload.features.length) return null;
    return translateRule(payload);
  }

  /** Leere Felder bedeuten „nicht übersetzt" und bleiben unangetastet. */
  function applyTranslation(t: RuleTranslation) {
    const c = ed.draft;
    if (!c) return;
    if (t.name_de) c.nameDe = t.name_de;
    t.features.forEach((tf, i) => {
      if (!c.features[i]) return;
      if (tf.nameDe) c.features[i].nameDe = tf.nameDe;
      if (tf.descDe) c.features[i].descDe = tf.descDe;
    });
  }
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
    style="--ep-accent: var(--copper)"
  >
    {#snippet karte()}
      <LibraryCardFrame accent="var(--copper)" name={draft!.name} nameDe={draft!.nameDe}>
        {#snippet head()}
          <div class="meta">
            {CASTER_LABELS[draft!.casterType] ?? draft!.casterType}
            {#if draft!.hitDie} · Trefferwürfel W{draft!.hitDie}{/if}
          </div>
          {#if coverage.total}
            <DeclarationBadge badge={declBadge} />
          {/if}
        {/snippet}

        {#if coreRows.length || draft!.startingEquipmentDe || draft!.startingEquipment}
          <div class="core-traits">
            {#each coreRows as r}
              <div class="core-row">
                <span class="core-label">{r.label}</span>
                <span class="core-value">{r.value}</span>
              </div>
            {/each}
            {#if choiceList.length}
              <div class="core-row">
                <span class="core-label">Zur Wahl</span>
                <span class="core-value">{choiceList.join(', ')}</span>
              </div>
            {/if}
            {#if draft!.startingEquipmentDe || draft!.startingEquipment}
              <div class="core-row">
                <span class="core-label">Anfangsausrüstung</span>
                <!-- Deutsch, solange es da ist; Homebrew führt oft nur die englische Prosa. -->
                <span class="core-value">{draft!.startingEquipmentDe || draft!.startingEquipment}</span>
              </div>
            {/if}
          </div>
        {/if}
        {#if draft!.features.length}
          <div class="features">
            {#each draft!.features as f}
              <div class="feature">
                <div class="feature-head">
                  <span class="feature-name">{featureName(f)}</span>
                  {#if f.gainedAt.length}<span class="feature-lvl">Stufe {f.gainedAt.join(', ')}</span>{/if}
                </div>
                {#if featureDesc(f)}<div class="feature-desc"><Markdown source={featureDesc(f)} /></div>{/if}
              </div>
            {/each}
          </div>
        {:else}
          <p class="empty">Keine Merkmale.</p>
        {/if}
      </LibraryCardFrame>
    {/snippet}

    {#snippet bearbeiten()}
      {#if ed.draft}
        <CardEditWrap accent="var(--copper)">
          <ClassEditForm bind:klass={ed.draft} />
        </CardEditWrap>
        <CardTools accent="var(--copper)" actions={[{ label: '🌐 Übersetzen…', onclick: () => (showTranslate = true) }]} />
      {/if}
    {/snippet}
  </EditorPanel>
{:else}
  <CardParseError bind:tab={ed.tab} noun="Klassen" json={ed.lastSavedContent} onsavejson={(json) => ed.saveJson(json)} />
{/if}

{#if showTranslate && ed.draft}
  <TranslateModal
    entityName={ed.draft.nameDe || ed.draft.name || 'Klasse'}
    build={buildTranslationRun}
    onresult={applyTranslation}
    onclose={() => (showTranslate = false)}
  />
{/if}

<style>
  .meta { font-size: 0.8rem; color: color-mix(in srgb, var(--copper) 70%, var(--ink)); margin-top: 0.2rem; }

  .core-traits {
    padding: 0.6rem 1.2rem 0; display: flex; flex-direction: column; gap: 0.2rem;
    font-size: 0.82rem; line-height: 1.45;
  }
  .core-row { display: grid; grid-template-columns: 10.5rem 1fr; gap: 0.5rem; align-items: baseline; }
  .core-label { font-variant: small-caps; font-weight: 700; color: var(--copper); }
  .core-value { color: var(--ink); }

  .features { padding: 0.6rem 1.2rem 1rem; display: flex; flex-direction: column; gap: 0.7rem; }
  .feature-head { display: flex; align-items: baseline; gap: 0.5rem; }
  .feature-name { font-weight: 700; font-variant: small-caps; color: var(--copper); }
  .feature-lvl { font-size: 0.72rem; color: var(--ink-muted); font-style: italic; }
  .feature-desc { font-size: 0.85rem; line-height: 1.55; margin-top: 0.15rem; }
  .empty { padding: 1rem; color: var(--ink-muted); font-style: italic; }
</style>
