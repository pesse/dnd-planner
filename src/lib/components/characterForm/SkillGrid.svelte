<script lang="ts">
  /** Fertigkeiten: Übung/Expertise als ein Umschalter, ◆-Herkunft und der errechnete Wert; dazu Alleskönner. */
  import { sign } from '../../utils/num';
  import { SKILL_DEFS } from '../../domain/skills';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { Character } from '../../schemas/characterSchema';
  import { ABILITY_ABBR_DE } from '../../schemas/abilities';
  import { textTip } from '../textTip.svelte';
  import './form.css';

  let { skillFlags, alleskoenner = $bindable(), computed, grantMarks, saved, dirOf }: {
    skillFlags: Record<string, { prof: boolean; exp: boolean }>;
    alleskoenner: boolean;
    computed: Character['skills'];
    /** Herkunftslabels je Bogen-Fertigkeit („Soldat", „Schurke (Wahl)"). */
    grantMarks: Map<string, string[]>;
    saved?: Character | null;
    dirOf: (old: unknown, now: unknown) => DiffDir;
  } = $props();

  type Level = 'none' | 'prof' | 'exp';
  const LEVEL_LABEL: Record<Level, string> = { none: 'Keine Übung', prof: 'Übung', exp: 'Expertise' };
  const NEXT: Record<Level, Level> = { none: 'prof', prof: 'exp', exp: 'none' };
  const levelOf = (f: { prof: boolean; exp: boolean }): Level => (f.exp ? 'exp' : f.prof ? 'prof' : 'none');

  function cycle(flags: { prof: boolean; exp: boolean }) {
    const next = NEXT[levelOf(flags)];
    flags.prof = next !== 'none';
    flags.exp = next === 'exp';
  }
</script>

<div class="skill-bar">
  <label class="check-row" use:diffMark={dirOf(saved?.alleskoenner, alleskoenner)}>
    <input type="checkbox" bind:checked={alleskoenner} />
    <span>Alleskönner</span>
  </label>
  <span class="legend"><span class="dot prof"></span> Übung <span class="dot exp"></span> Expertise</span>
</div>
<div class="skill-grid" style="grid-template-rows: repeat({Math.ceil(SKILL_DEFS.length / 2)}, auto)">
  {#each SKILL_DEFS as def}
    {@const flags = skillFlags[def.key]}
    {@const level = levelOf(flags)}
    {@const savedSkill = saved?.skills?.[def.key]}
    {@const skillDir = !saved ? 'none'
      : (flags.prof && !savedSkill?.prof) || (flags.exp && !savedSkill?.exp) ? 'up'
      : (!flags.prof && savedSkill?.prof) || (!flags.exp && savedSkill?.exp) ? 'down' : 'none'}
    <div class="skill-edit-row" use:diffMark={skillDir}>
      <button type="button" class="lvl {level}" title="{LEVEL_LABEL[level]} – klicken zum Wechseln"
        aria-label="{def.label}: {LEVEL_LABEL[level]}" onclick={() => cycle(flags)}>
        <span class="dot {level}"></span>
      </button>
      <span class="skill-val">{sign(computed[def.key].value)}</span>
      <span class="skill-name" class:proficient={flags.prof} class:expertise={flags.exp}>{def.label}</span>
      <span class="skill-attr">{ABILITY_ABBR_DE[def.attr]}</span>
      {#if grantMarks.has(def.key)}
        <span class="grant-mark" use:textTip={grantMarks.get(def.key)!.join(' · ')}>◆</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .skill-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }
  .legend { font-size: 0.68rem; color: var(--ink-muted); display: inline-flex; align-items: center; gap: 0.3rem; }
  .legend .exp { margin-left: 0.4rem; }
  .skill-grid { grid-auto-flow: column; }
  .lvl {
    background: none;
    border: none;
    padding: 0;
    width: 1.1rem;
    height: 1.1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .dot {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    border: 1.5px solid var(--ink-faint);
    box-sizing: border-box;
  }
  .dot.prof { background: var(--green); border-color: var(--green); }
  .dot.exp {
    background: var(--steel);
    border-color: var(--steel);
    box-shadow: 0 0 0 1.5px var(--bg), 0 0 0 3px var(--steel);
  }
  .skill-attr { font-size: 0.62rem; color: var(--ink-faint); letter-spacing: 0.04em; }
</style>
