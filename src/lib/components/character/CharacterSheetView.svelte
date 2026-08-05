<script lang="ts">
  import './sheet.css';
  import { sign } from '../../utils/num';
  import { SKILL_DEFS } from '../../domain/skills';
  import { attrModTip, skillTip } from '../../services/characterSheetTips';
  import type { ItemIndex } from '../../itemLibrary';
  import type { SpellIndex } from '../../spellLibrary';
  import type { WeaponMastery } from '../../schemas/vocabulary';
  import type { Character } from '../../schemas/characterSchema';
  import type { SheetSpellcasting } from '../../services/spellcasting/project';
  import SheetCombatBlock from './SheetCombatBlock.svelte';
  import SheetProficiencyBlock from './SheetProficiencyBlock.svelte';
  import SheetInventoryBlock from './SheetInventoryBlock.svelte';
  import SheetSpellBlock from './SheetSpellBlock.svelte';

  let { character, itemIndex, spellIndex, spellcasting, masteryOf, masteryChips }: {
    character: Character;
    itemIndex: ItemIndex;
    spellIndex: SpellIndex;
    spellcasting: SheetSpellcasting | null;
    masteryOf: (name: string) => WeaponMastery | undefined;
    masteryChips: { name: string; mastery: WeaponMastery | undefined }[];
  } = $props();

  const ATTRS = [
    { key: 'str', label: 'STR', mod: 'strMod' },
    { key: 'ges', label: 'GES', mod: 'gesMod' },
    { key: 'kon', label: 'KON', mod: 'konMod' },
    { key: 'int', label: 'INT', mod: 'intMod' },
    { key: 'wei', label: 'WEI', mod: 'weiMod' },
    { key: 'cha', label: 'CHA', mod: 'chaMod' },
  ] as const;

  // Bewusst `Map<string, …>`: die Schlüssel kommen aus `character.skills` (offener
  // Record) und können auch Fremd-/Altbestand enthalten.
  const skillAttrMap = new Map<string, string>(SKILL_DEFS.map((s) => [s.key, s.attr]));
  const skillLabelMap = new Map<string, string>(SKILL_DEFS.map((s) => [s.key, s.label]));

  const num = (key: string): number => (character as unknown as Record<string, number>)[key];
</script>

<div class="content">
  <div class="section attributes">
    {#each ATTRS as attr}
      <div class="attr-box">
        <div class="attr-label">{attr.label}</div>
        <div class="has-tip attr-mod">
          {sign(num(attr.mod))}
          <span class="tip">{@html attrModTip(attr.label, num(attr.key))}</span>
        </div>
        <div class="attr-score">{num(attr.key)}</div>
      </div>
    {/each}
  </div>

  <div class="two-col">
    <SheetCombatBlock {character} {masteryOf} />
    <SheetProficiencyBlock {character} {masteryChips} />
  </div>

  <div class="section">
    <h3>Fertigkeiten {character.alleskoenner ? '<small>(Alleskönner)</small>' : ''}</h3>
    <div class="skill-grid">
      {#each Object.entries(character.skills) as [name, skill]}
        <div class="skill-row has-tip" class:proficient={skill.prof} class:expertise={skill.exp}>
          <span class="prof-dot">{skill.exp ? '★' : skill.prof ? '●' : '○'}</span>
          <span class="skill-name">{skillLabelMap.get(name) ?? name}</span>
          <span class="skill-val">{sign(skill.value)}</span>
          <span class="tip">{@html skillTip(character, skillAttrMap.get(name), skill)}</span>
        </div>
      {/each}
    </div>
  </div>

  <div class="two-col">
    <div class="section">
      <h3>Persönlichkeit</h3>
      {#if character.traits}<p><strong>Merkmale:</strong> {character.traits}</p>{/if}
      {#if character.ideals}<p><strong>Ideale:</strong> {character.ideals}</p>{/if}
      {#if character.bonds}<p><strong>Bindungen:</strong> {character.bonds}</p>{/if}
      {#if character.flaws}<p><strong>Makel:</strong> {character.flaws}</p>{/if}
    </div>
    <div class="section">
      <h3>Klassenmerkmale</h3>
      <p class="preformatted">{character.classFeatures}</p>
    </div>
  </div>

  {#if character.personal}
    {@const p = character.personal}
    {@const hasAnyPersonal = p.alter || p.geschlecht || p.sizeCat || p.koerpergroesse || p.gewicht || p.gesinnung || p.glaube || p.lebensstil || p.taeglicheKosten || p.augenfarbe || p.haarfarbe || p.hautfarbe || p.aussehen || p.rassenmerkmale}
    {#if hasAnyPersonal}
      <div class="two-col">
        <div class="section">
          <h3>Persönliches</h3>
          <div class="personal-stats">
            {#if p.alter}<div class="stat"><span class="sl">Alter</span><span class="sv">{p.alter}</span></div>{/if}
            {#if p.geschlecht}<div class="stat"><span class="sl">Geschlecht</span><span class="sv">{p.geschlecht}</span></div>{/if}
            {#if p.gesinnung}<div class="stat"><span class="sl">Gesinnung</span><span class="sv">{p.gesinnung}</span></div>{/if}
            {#if p.glaube}<div class="stat"><span class="sl">Glaube</span><span class="sv">{p.glaube}</span></div>{/if}
            {#if p.sizeCat}<div class="stat"><span class="sl">Größe</span><span class="sv">{p.sizeCat}</span></div>{/if}
            {#if p.koerpergroesse}<div class="stat"><span class="sl">Körpergröße</span><span class="sv">{p.koerpergroesse}</span></div>{/if}
            {#if p.gewicht}<div class="stat"><span class="sl">Gewicht</span><span class="sv">{p.gewicht}</span></div>{/if}
            {#if p.augenfarbe}<div class="stat"><span class="sl">Augen</span><span class="sv">{p.augenfarbe}</span></div>{/if}
            {#if p.haarfarbe}<div class="stat"><span class="sl">Haar</span><span class="sv">{p.haarfarbe}</span></div>{/if}
            {#if p.hautfarbe}<div class="stat"><span class="sl">Haut</span><span class="sv">{p.hautfarbe}</span></div>{/if}
            {#if p.lebensstil}<div class="stat"><span class="sl">Lebensstil</span><span class="sv">{p.lebensstil}</span></div>{/if}
            {#if p.taeglicheKosten}<div class="stat"><span class="sl">Tägl. Kosten</span><span class="sv">{p.taeglicheKosten}</span></div>{/if}
          </div>
          {#if p.aussehen}<p class="preformatted"><strong>Aussehen:</strong> {p.aussehen}</p>{/if}
        </div>
        {#if p.rassenmerkmale}
          <div class="section">
            <h3>Volksmerkmale</h3>
            <p class="preformatted">{p.rassenmerkmale}</p>
          </div>
        {/if}
      </div>
    {/if}
  {/if}

  <!-- Merkmale stehen in der rechten Seitenleiste (CharacterFeaturePanel) — auf
       jedem Tab sichtbar und dort auch änderbar. -->

  <SheetInventoryBlock {character} {itemIndex} />
  <SheetSpellBlock characterName={character.name} view={spellcasting} {spellIndex} />
</div>

<style>
  .content {
    width: 100%;
    box-sizing: border-box;
    padding: 1rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .attributes {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .attr-box {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    text-align: center;
    min-width: 52px;
  }

  .attr-label { font-size: 0.7rem; color: var(--ink-muted); text-transform: uppercase; }
  .attr-mod { font-size: 1.2rem; font-weight: 700; color: var(--arcane); }
  .attr-score { font-size: 0.75rem; color: var(--ink-soft); }

  .skill-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.1rem 0.5rem;
  }
  .skill-row { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; }
  .skill-row.proficient .skill-val { color: var(--green); }
  .skill-row.expertise .skill-val { color: var(--steel); }
  .skill-name { color: var(--ink-soft); }
  .skill-val { font-weight: 600; }

  .personal-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.2rem 0.5rem;
    margin-bottom: 0.75rem;
  }
</style>
