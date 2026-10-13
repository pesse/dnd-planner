<script lang="ts">
  import './wizard.css';
  import { CharacterWizard, toolPickKey } from '../../services/wizard/characterWizard.svelte';
  import { equipmentIndex, startingItemName } from '../../services/wizard/startingEquipment';
  import { getToolChoices, displayName as itemDisplayName, type ItemIndex } from '../../itemLibrary';
  import { EQUIPMENT_CHOICE_LABEL, type EquipmentChoiceCategory, type StartingItem } from '../../schemas/startingEquipment';
  import TooltipSelect, { type TooltipOption } from '../TooltipSelect.svelte';

  let { w, done }: { w: CharacterWizard; done: boolean } = $props();

  const groups = $derived(w.equipmentGroups);

  let index = $state<ItemIndex | null>(null);
  $effect(() => { void equipmentIndex().then((i) => (index = i)).catch(() => {}); });

  function selectOption(groupIdx: number, optionIdx: number) {
    const next = [...w.equipmentSelection];
    next[groupIdx] = optionIdx;
    w.equipmentSelection = next;
  }
  function selected(groupIdx: number): number {
    return w.selectedOptionIndex(groupIdx);
  }
  function itemLabel(item: StartingItem): string {
    const name = item.choiceFrom ? EQUIPMENT_CHOICE_LABEL[item.choiceFrom] : startingItemName(index, item);
    return item.count > 1 ? `${item.count}× ${name}` : name;
  }

  let toolOptions = $state<Record<string, TooltipOption[]>>({});
  // Merker außerhalb der Runen: ein Lesen von `toolOptions` im Effekt würde ihn bei
  // jedem Nachladen erneut anstoßen.
  const toolsRequested = new Set<string>();
  async function loadToolOptions(category: EquipmentChoiceCategory) {
    if (toolsRequested.has(category)) return;
    toolsRequested.add(category);
    const items = await getToolChoices(category);
    toolOptions = {
      ...toolOptions,
      [category]: items.filter((i) => i.key).map((i) => ({ value: i.key!, label: itemDisplayName(i) })),
    };
  }
  function pickTool(key: string, itemKey: string) {
    w.toolPicks = { ...w.toolPicks, [key]: itemKey };
  }
  $effect(() => {
    for (const group of groups) {
      for (const opt of group.options) {
        for (const item of opt.items) if (item.choiceFrom) void loadToolOptions(item.choiceFrom);
      }
    }
  });
</script>

{#if !groups.length}
  <p class="hint">Keine Startausrüstung zum Auswählen (kann im Editor ergänzt werden).</p>
{:else}
  <p class="hint">Wähle je Herkunft eine Option. Die Gegenstände landen als Inventar im fertigen Charakter.</p>
  {#each groups as group, gi}
    <div class="field">
      <span>{group.source}</span>
      {#if !group.options.length}
        <p class="hint">{group.prose}</p>
      {:else}
        <div class="eq-options">
          {#each group.options as opt, oi}
            <button
              type="button"
              class="eq-option"
              class:sel={selected(gi) === oi}
              onclick={() => selectOption(gi, oi)}
            >
              <span class="eq-badge">{opt.label || String.fromCharCode(65 + oi)}</span>
              <span class="eq-desc">
                {opt.items.map(itemLabel).join(', ')}
                {#if opt.goldPieces > 0}<em>{opt.items.length ? ' · ' : ''}{opt.goldPieces} GM</em>{/if}
              </span>
            </button>
          {/each}
        </div>
        {#each group.options[selected(gi)]?.items ?? [] as item, ii}
          {#if item.choiceFrom}
            {@const key = toolPickKey(gi, selected(gi), ii)}
            <div class="eq-choice">
              <span class="eq-choice-label">{EQUIPMENT_CHOICE_LABEL[item.choiceFrom]} wählen</span>
              <TooltipSelect
                options={toolOptions[item.choiceFrom] ?? []}
                selected={w.toolPicks[key] ? [w.toolPicks[key]] : []}
                onchange={(sel) => pickTool(key, sel[0] ?? '')}
              />
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  {/each}
  {#if !done}
    <p class="hint">Die Regel nennt hier nur eine Kategorie — wähle den konkreten Gegenstand aus der Bibliothek.</p>
  {/if}
{/if}

<style>
  .eq-options { display: flex; flex-direction: column; gap: 0.4rem; }
  .eq-option {
    display: flex; align-items: flex-start; gap: 0.6rem; text-align: left; cursor: pointer;
    background: var(--surface); color: var(--ink); border: 1px solid var(--border);
    border-radius: 6px; padding: 0.5rem 0.65rem; font: inherit;
  }
  .eq-option:hover { border-color: var(--border-strong); }
  .eq-option.sel { border-color: var(--arcane, var(--gold)); box-shadow: inset 0 0 0 1px var(--arcane, var(--gold)); }
  .eq-badge {
    flex: 0 0 auto; min-width: 1.5rem; text-align: center; font-weight: 700;
    color: var(--arcane, var(--gold));
  }
  .eq-desc { font-size: 0.88rem; color: var(--ink-soft); }
  .eq-desc em { color: var(--ink-muted); font-style: normal; }
  .eq-choice { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.5rem; }
  .eq-choice-label { font-size: 0.82rem; color: var(--ink-soft); }
</style>
