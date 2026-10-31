<script lang="ts">
  /** Die mechanischen Deklarationen eines Gegenstands im Karten-Editor. */
  import type { Item } from '$lib/types';
  import { abilityEffectSchema } from '$lib/schemas/item';
  import { armorClassEffectSchema } from '$lib/schemas/armorClass';
  import { savingThrowEffectSchema } from '$lib/schemas/savingThrow';
  import { attackEffectSchema } from '$lib/schemas/attackEffect';
  import { EQUIPMENT_SLOTS, SLOT_LABEL_DE, type EquipmentSlot } from '$lib/schemas/equipmentSlot';
  import { itemDeclarationLines } from '$lib/services/itemDeclarations';
  import AbilityEffectRow from './effects/AbilityEffectRow.svelte';
  import ArmorClassEffectRow from './effects/ArmorClassEffectRow.svelte';
  import SaveEffectRow from './effects/SaveEffectRow.svelte';
  import AttackEffectRow from './effects/AttackEffectRow.svelte';
  import ResistanceChoiceField from './effects/ResistanceChoiceField.svelte';

  let { draft = $bindable() }: { draft: Item } = $props();

  type ListField = 'abilityEffects' | 'armorClassEffects' | 'savingThrowEffects' | 'attackEffects';

  // Ein Gegenstand ohne Effekte bekommt kein `[]`: das Feld fehlt, wie in den übrigen Vault-Dateien.
  function add<K extends ListField>(field: K, effect: NonNullable<Item[K]>[number]) {
    draft[field] = [...(draft[field] ?? []), effect] as Item[K];
  }
  function remove(field: ListField, i: number) {
    const next = (draft[field] ?? []).filter((_, j) => j !== i);
    draft[field] = (next.length ? next : undefined) as never;
  }

  function setSlot(raw: string) {
    draft.slot = raw ? (raw as EquipmentSlot) : undefined;
  }

  // Vorräte, Zauber und feste Abwehr pflegt bisher nur die JSON-Ansicht.
  const jsonOnly = $derived(
    itemDeclarationLines({ ...draft, abilityEffects: undefined, armorClassEffects: undefined, savingThrowEffects: undefined, attackEffects: undefined, resistanceChoice: undefined, slot: undefined }),
  );
</script>

<details class="edit-section edit-section-collapsible effects" open={itemDeclarationLines(draft).length > 0}>
  <summary class="edit-section-label">Mechanik</summary>

  <div class="group">
    <span class="prop-label">Attribute</span>
    {#each draft.abilityEffects ?? [] as _, i}
      <div class="line"><AbilityEffectRow bind:effect={draft.abilityEffects![i]} /><button class="rm" onclick={() => remove('abilityEffects', i)} title="Entfernen">×</button></div>
    {/each}
    <button class="add" onclick={() => add('abilityEffects', abilityEffectSchema.parse({ kind: 'set', ability: 'str', value: 19 }))}>+ Attribut</button>
  </div>

  <div class="group">
    <span class="prop-label">Rüstungsklasse</span>
    {#each draft.armorClassEffects ?? [] as _, i}
      <div class="line"><ArmorClassEffectRow bind:effect={draft.armorClassEffects![i]} /><button class="rm" onclick={() => remove('armorClassEffects', i)} title="Entfernen">×</button></div>
    {/each}
    <button class="add" onclick={() => add('armorClassEffects', armorClassEffectSchema.parse({ kind: 'bonus', value: 1 }))}>+ RK</button>
  </div>

  <div class="group">
    <span class="prop-label">Rettungswürfe</span>
    {#each draft.savingThrowEffects ?? [] as _, i}
      <div class="line"><SaveEffectRow bind:effect={draft.savingThrowEffects![i]} /><button class="rm" onclick={() => remove('savingThrowEffects', i)} title="Entfernen">×</button></div>
    {/each}
    <button class="add" onclick={() => add('savingThrowEffects', savingThrowEffectSchema.parse({ kind: 'bonus', value: 1 }))}>+ Rettungswurf</button>
  </div>

  <div class="group">
    <span class="prop-label">Angriffe</span>
    {#each draft.attackEffects ?? [] as _, i}
      <div class="line"><AttackEffectRow bind:effect={draft.attackEffects![i]} /><button class="rm" onclick={() => remove('attackEffects', i)} title="Entfernen">×</button></div>
    {/each}
    <button class="add" onclick={() => add('attackEffects', attackEffectSchema.parse({ kind: 'bonus', attack: 1, damage: 1 }))}>+ Angriff</button>
  </div>

  <ResistanceChoiceField bind:draft />

  <div class="prop-row">
    <span class="prop-label">Platz</span>
    <select class="edit-select" value={draft.slot ?? ''} onchange={(e) => setSlot((e.target as HTMLSelectElement).value)}>
      <option value="">aus Kategorie und Name</option>
      {#each EQUIPMENT_SLOTS as s}<option value={s}>{SLOT_LABEL_DE[s]}</option>{/each}
    </select>
  </div>

  {#if jsonOnly.length}
    <div class="group">
      <span class="prop-label">Nur im JSON</span>
      {#each jsonOnly as line}<span class="json-line">{line.label}: {line.text}</span>{/each}
    </div>
  {/if}
</details>

<style>
  .effects { gap: 0.6rem; }
  .group { display: flex; flex-direction: column; gap: 0.3rem; align-items: flex-start; }
  .line { display: flex; gap: 0.4rem; align-items: flex-start; width: 100%; }
  .rm {
    margin-left: auto; border: none; background: none; cursor: pointer;
    font-size: 1rem; line-height: 1; color: var(--ink-soft);
  }
  .rm:hover { color: var(--danger); }
  .add {
    background: none; border: 1px dashed var(--border); border-radius: 4px;
    color: var(--ink-muted); font-size: 0.78rem; padding: 0.1rem 0.5rem; cursor: pointer; font-family: inherit;
  }
  .add:hover { color: var(--ink); border-color: var(--ink-muted); }
  .json-line { font-size: 0.82rem; color: var(--ink-soft); }
</style>
