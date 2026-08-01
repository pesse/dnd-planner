<script lang="ts">
  /** Fertigkeiten: Übung, Expertise, ◆-Herkunft und der errechnete Wert; dazu Alleskönner. */
  import { sign } from '../../utils/num';
  import { SKILL_DEFS } from '../../domain/skills';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { Character } from '../../schemas/characterSchema';
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
</script>

<label class="check-row alleskoenner" use:diffMark={dirOf(saved?.alleskoenner, alleskoenner)}>
  <input type="checkbox" bind:checked={alleskoenner} />
  <span>Alleskönner</span>
</label>
<div class="skill-grid">
  {#each SKILL_DEFS as def}
    {@const flags = skillFlags[def.key]}
    {@const savedSkill = saved?.skills?.[def.key]}
    {@const skillDir = !saved ? 'none'
      : (flags.prof && !savedSkill?.prof) || (flags.exp && !savedSkill?.exp) ? 'up'
      : (!flags.prof && savedSkill?.prof) || (!flags.exp && savedSkill?.exp) ? 'down' : 'none'}
    <div class="skill-edit-row" use:diffMark={skillDir}>
      <input
        type="checkbox"
        checked={flags.prof}
        title="Übung"
        onchange={(e) => { flags.prof = e.currentTarget.checked; if (!flags.prof) flags.exp = false; }}
      />
      <input
        type="checkbox"
        checked={flags.exp}
        title="Expertise"
        disabled={!flags.prof}
        onchange={(e) => { flags.exp = e.currentTarget.checked; }}
      />
      <span class="skill-name" class:proficient={flags.prof} class:expertise={flags.exp}>{def.label}</span>
      {#if grantMarks.has(def.key)}
        <span class="grant-mark" title={grantMarks.get(def.key)!.join(' · ')}>◆</span>
      {/if}
      <span class="skill-val">{sign(computed[def.key].value)}</span>
    </div>
  {/each}
</div>
