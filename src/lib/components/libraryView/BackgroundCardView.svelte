<script lang="ts">
  import type { Background } from '$lib/types';
  import { type Benefit, type BenefitType, BENEFIT_TYPES, BENEFIT_TYPE_LABELS } from '$lib/schemas/background';
  import LibraryCardFrame from '../ui/LibraryCardFrame.svelte';
  import Markdown from '../Markdown.svelte';
  import { getFeats, featDisplayName, type FeatEntry } from '$lib/featsLibrary';
  import { abilityKeyOf, ABILITY_LABEL } from '$lib/schemas/abilities';
  import { skillLabelDe } from '$lib/services/proficiencyGrants';

  let { background, onOpenFeat }: {
    background: Background;
    /** Ohne Handler steht das Talent als Text da. */
    onOpenFeat?: (feat: FeatEntry) => void;
  } = $props();

  const benefitName = (b: Benefit): string => b.nameDe || b.name;
  const benefitDesc = (b: Benefit): string => b.descDe || b.desc;
  const groupLabel = (t: BenefitType): string => BENEFIT_TYPE_LABELS[t];

  const grantedSkills = $derived(background.proficiencyGrant.skills.fixed.map(skillLabelDe));

  // `skill_proficiency` fällt heraus, sobald der strukturierte Grant gefüllt ist — die
  // Chip-Reihe im Kopf zeigt dasselbe, nur deutsch beschriftet.
  const groupedBenefits = $derived.by(() => {
    const skipSkills = grantedSkills.length > 0;
    return BENEFIT_TYPES
      .filter((type) => !(skipSkills && type === 'skill_proficiency'))
      .map((type) => ({ type, items: background.benefits.filter((b) => b.type === type) }))
      .filter((g) => g.items.length);
  });

  /** Unbekannte Werte bleiben unverändert stehen. */
  const abilityLabels = $derived(
    background.abilityScores.map((en) => {
      const key = abilityKeyOf(en);
      return key ? ABILITY_LABEL[key] : en;
    }),
  );

  // Fehlt das verlinkte Talent lokal, wird das sichtbar gemacht statt still verschluckt.
  let featIndex = $state<FeatEntry[]>([]);
  $effect(() => { void getFeats().then((f) => (featIndex = f)); });
  const linkedFeat = $derived(
    background.featKey ? (featIndex.find((f) => f.sourceKey === background.featKey) ?? null) : null,
  );
</script>

<LibraryCardFrame accent="var(--teal)" name={background.name} nameDe={background.nameDe}>
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

  {#if background.descDe || background.desc}
    <div class="intro"><Markdown source={background.descDe || background.desc} /></div>
  {/if}
  {#if background.featKey}
    <div class="feat-link-row">
      <span class="feat-link-label">Herkunftstalent</span>
      {#if linkedFeat && onOpenFeat}
        <button class="feat-link" onclick={() => onOpenFeat(linkedFeat)}>{featDisplayName(linkedFeat)}</button>
      {:else if linkedFeat}
        <span>{featDisplayName(linkedFeat)}</span>
      {:else}
        <span class="feat-missing" title={background.featKey}>⚠ nicht in der Bibliothek</span>
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
  .feat-link-label { font-variant: small-caps; font-weight: 700; color: var(--teal); }
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
