<script lang="ts">
  import './sheet.css';
  import { sign } from '../../utils/num';
  import { SKILL_DEFS, type SkillDef } from '../../domain/skills';
  import { skillCheckEffects, type CheckSource, type SkillCheckEffects } from '../../services/abilityChecks';
  import { effectiveProficiencyBonus } from '../../services/classProgression';
  import { ABILITY_ABBR_DE, ABILITY_KEYS, type AbilityKey } from '../../schemas/abilities';
  import { attrModTip, skillTip } from '../../services/characterSheetTips';
  import type { ItemIndex } from '../../itemLibrary';
  import type { SpellIndex } from '../../spellLibrary';
  import type { WeaponMastery } from '../../schemas/vocabulary';
  import type { Character } from '../../schemas/characterSchema';
  import type { LoadedSpellcasting } from '../../services/spellcasting/project';
  import type { AbilityResolution } from '../../services/effectiveAbilities';
  import type { AttackCalcContext } from '../../services/attackCalc';
  import type { SavingThrowDerivation } from '../../services/savingThrows';
  import type { CharacterAura } from '../../services/auras';
  import type { CharacterDefense } from '../../services/defenses';
  import type { MovementLine } from '../../services/movement';
  import type { CombatTips } from '../../services/characterSheetTips';
  import SheetCombatBlock from './SheetCombatBlock.svelte';
  import SheetProficiencyBlock from './SheetProficiencyBlock.svelte';
  import SheetAuraBlock from './SheetAuraBlock.svelte';
  import SheetDefenseBlock from './SheetDefenseBlock.svelte';
  import SheetMovementBlock from './SheetMovementBlock.svelte';
  import SheetInventoryBlock from './SheetInventoryBlock.svelte';
  import SheetSpellBlock from './SheetSpellBlock.svelte';

  let { character, itemIndex, spellIndex, spellcasting, masteryOf, masteryChips,
        companionImageUrl, figureUrl, abilities, combatTips, hpTipHtml, acTipHtml, attackCtx, saves, deathSaveAdvantage, auras, defenses, movement, attackNotes, checks }: {
    character: Character;
    itemIndex: ItemIndex;
    spellIndex: SpellIndex;
    spellcasting: LoadedSpellcasting | null;
    masteryOf: (name: string) => WeaponMastery | undefined;
    masteryChips: { name: string; mastery: WeaponMastery | undefined }[];
    companionImageUrl: string;
    figureUrl: string;
    abilities: Record<AbilityKey, AbilityResolution>;
    combatTips: CombatTips;
    hpTipHtml: string;
    acTipHtml: string;
    attackCtx: AttackCalcContext | null;
    saves: Record<AbilityKey, SavingThrowDerivation>;
    auras: CharacterAura[];
    deathSaveAdvantage: string[];
    defenses: CharacterDefense[];
    attackNotes: string[];
    movement: MovementLine[];
    checks: readonly CheckSource[];
  } = $props();

  // Bewusst `Map<string, …>`: die Schlüssel kommen aus `character.skills` (offener
  // Record) und können auch Fremd-/Altbestand enthalten.
  const skillDefMap = new Map<string, SkillDef>(SKILL_DEFS.map((s) => [s.key, s]));
  const checkEffectsOf = (name: string): SkillCheckEffects | undefined => {
    const def = skillDefMap.get(name);
    return def && skillCheckEffects(def, checks, { mods: character.mods, profBonus: effectiveProficiencyBonus(character) });
  };
</script>

<div class="content">
  <div class="section attributes">
    {#each ABILITY_KEYS as key}
      <div class="attr-box">
        <div class="attr-label">{ABILITY_ABBR_DE[key]}</div>
        <div class="has-tip attr-mod">
          {sign(character.mods[key])}
          <span class="tip">{@html attrModTip(ABILITY_ABBR_DE[key], abilities[key], character.mods[key])}</span>
        </div>
        <div class="attr-score">{abilities[key].score}</div>
      </div>
    {/each}
  </div>

  <div class="two-col">
    <SheetCombatBlock {character} tips={combatTips} {masteryOf} {hpTipHtml} {acTipHtml} {attackCtx} {attackNotes} />
    <SheetProficiencyBlock {character} {saves} {deathSaveAdvantage} {masteryChips} />
  </div>

  {#if movement.length}<SheetMovementBlock lines={movement} />{/if}
  {#if defenses.length}<SheetDefenseBlock {defenses} />{/if}
  {#if auras.length}<SheetAuraBlock {auras} />{/if}

  <div class="section">
    <h3>Fertigkeiten {character.alleskoenner ? '<small>(Alleskönner)</small>' : ''}</h3>
    <div class="skill-grid">
      {#each Object.entries(character.skills) as [name, skill]}
        {@const fx = checkEffectsOf(name)}
        <div class="skill-row has-tip" class:proficient={skill.prof} class:expertise={skill.exp}>
          <span class="prof-dot">{skill.exp ? '★' : skill.prof ? '●' : '○'}</span>
          <span class="skill-name">{skillDefMap.get(name)?.label ?? name}</span>
          <span class="skill-val">{sign(skill.value)}{fx?.advantage ? ' V' : ''}</span>
          <span class="tip">{@html skillTip(character, skillDefMap.get(name)?.attr, skill, fx)}</span>
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
    {@const hasAnyPersonal = p.alter || p.sizeCat || p.koerpergroesse || p.gewicht || p.gesinnung || p.glaube || p.lebensstil || p.taeglicheKosten || p.augenfarbe || p.haarfarbe || p.hautfarbe || p.aussehen || p.rassenmerkmale}
    {#if hasAnyPersonal}
      <div class="two-col">
        <div class="section">
          <h3>Persönliches</h3>
          <div class="personal-stats">
            {#if p.alter}<div class="stat"><span class="sl">Alter</span><span class="sv">{p.alter}</span></div>{/if}
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

  {#if character.companion?.text || companionImageUrl}
    <div class="section companion">
      <h3>Gefährte</h3>
      <div class="companion-body">
        {#if companionImageUrl}
          <img class="companion-img" src={companionImageUrl} alt="Gefährte von {character.name}" />
        {/if}
        {#if character.companion?.text}
          <p class="preformatted">{character.companion.text}</p>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Merkmale stehen in der rechten Seitenleiste (CharacterFeaturePanel) — auf
       jedem Tab sichtbar und dort auch änderbar. -->

  <SheetInventoryBlock {character} {itemIndex} {figureUrl} dexMod={attackCtx?.dexMod ?? character.mods.dex} />
  <SheetSpellBlock characterName={character.name} casting={spellcasting} {spellIndex} />
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

  .companion-body {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .companion-img {
    width: 120px;
    height: 150px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .personal-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.2rem 0.5rem;
    margin-bottom: 0.75rem;
  }
</style>
