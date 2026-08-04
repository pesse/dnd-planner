<script lang="ts">
  /**
   * Waffenübungen & Rüstungsausbildung. ◆ = aus einem Bibliotheks-Link gewährt (Titel
   * nennt die Quelle); übernommen wird in Erstellung/Level-Up, nicht hier.
   */
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import { displayName, matchItem, searchItems, type ItemIndex, type ItemInfo } from '../../itemLibrary';
  import { MASTERY_INFO, masteryLabel } from '../../itemLabels';
  import { PROFICIENCY_FLAGS, proficiencyLabel } from '../../domain/proficiencies';
  import type { ProficiencyFlags } from '../../schemas/characterSchema';
  import TagEditor from './TagEditor.svelte';
  import './form.css';

  let { proficiencies, savedProficiencies, weaponItems, itemIndex, sourceOf, dirOf }: {
    proficiencies: ProficiencyFlags;
    savedProficiencies?: ProficiencyFlags;
    weaponItems: ItemInfo[];
    itemIndex: ItemIndex;
    /** Herkunftslabels zum Grant-Wert („Simple", „Light", …); leer = kein Grant. */
    sourceOf: (kind: 'weapons' | 'armor', value: string) => string;
    dirOf: (old: unknown, now: unknown) => DiffDir;
  } = $props();

  const suggestWeapon = (query: string) =>
    searchItems({ weapon: weaponItems }, query, 8).map((sug) => ({
      value: displayName(sug.item),
      hint: sug.item.mastery ? masteryLabel(sug.item.mastery) : undefined,
    }));

  /** Leer, wenn die Bibliothek die Waffe nicht kennt — Homebrew bleibt erklärbar. */
  function masteryNote(name: string) {
    const mastery = matchItem(itemIndex, { name })?.mastery;
    return mastery ? { suffix: masteryLabel(mastery), title: MASTERY_INFO[mastery].descDe } : undefined;
  }
</script>

<div class="prof-grid">
  {#each PROFICIENCY_FLAGS as { field, def }}
    {@const source = sourceOf(def.kind, def.value)}
    <label class="check-row" use:diffMark={dirOf(savedProficiencies?.[field], proficiencies[field])}>
      <input type="checkbox" checked={proficiencies[field]}
        onchange={(e) => (proficiencies[field] = e.currentTarget.checked)} />
      <span class="check-label">{proficiencyLabel(def)}</span>
      {#if source}<span class="grant-mark" title={source}>◆</span>{/if}
    </label>
  {/each}
</div>

<!-- Die Kategorie-Häkchen können „nur einfache Waffen, dazu das Kurzschwert" nicht
     ausdrücken. Diese Liste wirkt (Waffenbeherrschung, Übungsbonus am Angriff), der
     Freitext darunter nicht. -->
<div class="block-label">
  Einzelne Waffen (geübt)
  <TagEditor
    values={proficiencies.individualWeapons}
    savedValues={savedProficiencies?.individualWeapons}
    placeholder="Waffe…"
    suggest={suggestWeapon}
    annotate={masteryNote}
  />
</div>

<label class="block-label" use:diffMark={dirOf(savedProficiencies?.otherWeapons, proficiencies.otherWeapons)}>
  Sonstige Waffenübungen (Freitext)
  <input bind:value={proficiencies.otherWeapons} placeholder="z.B. Kriegswaffen mit Finesse" />
</label>
