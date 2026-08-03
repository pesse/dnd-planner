<script lang="ts">
  /** Rettungswurf-Übungen mit ◆-Herkunftsmarker und dem daraus errechneten Wurf. */
  import { sign } from '../../utils/num';
  import { diffMark, type DiffDir } from '../../utils/diffHighlight';
  import type { AbilityMods } from '../../services/characterFormFields';
  import './form.css';

  let {
    strSaveProf = $bindable(), gesSaveProf = $bindable(), konSaveProf = $bindable(),
    intSaveProf = $bindable(), weiSaveProf = $bindable(), chaSaveProf = $bindable(),
    mods, proficiencyBonus, sourceOf, dirOf,
  }: {
    strSaveProf: boolean; gesSaveProf: boolean; konSaveProf: boolean;
    intSaveProf: boolean; weiSaveProf: boolean; chaSaveProf: boolean;
    mods: AbilityMods;
    proficiencyBonus: number;
    /** Herkunftslabels zum englischen Attributsnamen; leer = kein Grant. */
    sourceOf: (english: string) => string;
    dirOf: (field: string, value: boolean) => DiffDir;
  } = $props();

  const rows = $derived([
    { label: 'STR', en: 'Strength', field: 'strSaveProf', checked: strSaveProf, mod: mods.strMod, set: (v: boolean) => (strSaveProf = v) },
    { label: 'GES', en: 'Dexterity', field: 'gesSaveProf', checked: gesSaveProf, mod: mods.gesMod, set: (v: boolean) => (gesSaveProf = v) },
    { label: 'KON', en: 'Constitution', field: 'konSaveProf', checked: konSaveProf, mod: mods.konMod, set: (v: boolean) => (konSaveProf = v) },
    { label: 'INT', en: 'Intelligence', field: 'intSaveProf', checked: intSaveProf, mod: mods.intMod, set: (v: boolean) => (intSaveProf = v) },
    { label: 'WEI', en: 'Wisdom', field: 'weiSaveProf', checked: weiSaveProf, mod: mods.weiMod, set: (v: boolean) => (weiSaveProf = v) },
    { label: 'CHA', en: 'Charisma', field: 'chaSaveProf', checked: chaSaveProf, mod: mods.chaMod, set: (v: boolean) => (chaSaveProf = v) },
  ]);
</script>

<div class="save-checks">
  {#each rows as row}
    {@const source = sourceOf(row.en)}
    <label class="check-row" use:diffMark={dirOf(row.field, row.checked)}>
      <input type="checkbox" checked={row.checked} onchange={(e) => row.set(e.currentTarget.checked)} />
      <span class="check-label">{row.label}</span>
      {#if source}<span class="grant-mark" title={source}>◆</span>{/if}
      <span class="check-val">{sign(row.mod + (row.checked ? proficiencyBonus : 0))}</span>
    </label>
  {/each}
</div>
