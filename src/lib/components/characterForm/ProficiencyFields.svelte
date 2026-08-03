<script lang="ts">
  /**
   * Waffenübungen & Rüstungsausbildung. ◆ = aus einem Bibliotheks-Link gewährt (Titel
   * nennt die Quelle); übernommen wird in Erstellung/Level-Up, nicht hier.
   */
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { ProficiencyFlags } from '../../schemas/characterSchema';
  import './form.css';

  let { proficiencies, savedProficiencies, sourceOf, dirOf }: {
    proficiencies: ProficiencyFlags;
    savedProficiencies?: ProficiencyFlags;
    /** Herkunftslabels zum Grant-Wert („Simple", „Light", …); leer = kein Grant. */
    sourceOf: (kind: 'weapons' | 'armor', value: string) => string;
    dirOf: (old: unknown, now: unknown) => DiffDir;
  } = $props();

  type BoolField = Exclude<keyof ProficiencyFlags, 'otherWeapons'>;
  const CHECKS: { field: BoolField; label: string; kind: 'weapons' | 'armor'; value: string }[] = [
    { field: 'simpleWeapons', label: 'Einfache Waffen', kind: 'weapons', value: 'Simple' },
    { field: 'martialWeapons', label: 'Kriegswaffen', kind: 'weapons', value: 'Martial' },
    { field: 'lightArmor', label: 'Leichte Rüstung', kind: 'armor', value: 'Light' },
    { field: 'mediumArmor', label: 'Mittlere Rüstung', kind: 'armor', value: 'Medium' },
    { field: 'heavyArmor', label: 'Schwere Rüstung', kind: 'armor', value: 'Heavy' },
    { field: 'shields', label: 'Schilde', kind: 'armor', value: 'Shields' },
  ];
</script>

<div class="prof-grid">
  {#each CHECKS as check}
    {@const source = sourceOf(check.kind, check.value)}
    <label class="check-row" use:diffMark={dirOf(savedProficiencies?.[check.field], proficiencies[check.field])}>
      <input type="checkbox" checked={proficiencies[check.field]}
        onchange={(e) => (proficiencies[check.field] = e.currentTarget.checked)} />
      <span class="check-label">{check.label}</span>
      {#if source}<span class="grant-mark" title={source}>◆</span>{/if}
    </label>
  {/each}
</div>
<label class="block-label" use:diffMark={dirOf(savedProficiencies?.otherWeapons, proficiencies.otherWeapons)}>
  Weitere Waffen
  <input bind:value={proficiencies.otherWeapons} placeholder="z.B. Steinhammer, Wurfdolch" />
</label>
