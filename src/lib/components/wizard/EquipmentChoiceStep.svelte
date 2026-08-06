<script lang="ts">
  import './wizard.css';
  import { CharacterWizard, toolPickKey } from '../../services/wizard/characterWizard.svelte';
  import type { Job } from '../../services/wizard/job.svelte';
  import { getToolChoices, displayName as itemDisplayName } from '../../itemLibrary';
  import type { EquipmentChoiceCategory } from '../../schemas/wizardEquipment';
  import TooltipSelect, { type TooltipOption } from '../TooltipSelect.svelte';

  let { w, statusText, done }: {
    w: CharacterWizard;
    statusText: (job: Job<unknown>) => string;
    done: boolean;
  } = $props();

  const groups = $derived(w.equipment.result?.groups ?? []);

  function selectOption(groupIdx: number, optionIdx: number) {
    const next = [...w.equipmentSelection];
    next[groupIdx] = optionIdx;
    w.equipmentSelection = next;
  }
  function selected(groupIdx: number): number {
    return w.selectedOptionIndex(groupIdx);
  }

  // Kategorie-Einträge („Handwerkszeug", „Musikinstrument") auflösen: die Regel nennt
  // dort keine Sache, sondern eine Wahl — die Liste kommt aus der Bibliothek, nie aus
  // der KI (dasselbe Prinzip wie bei der Waffenmeisterschaft).
  const TOOL_CATEGORY_LABEL: Record<EquipmentChoiceCategory, string> = {
    'artisan-tools': 'Handwerkszeug',
    'instrument': 'Musikinstrument',
  };
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
      [category]: items.map((i) => ({ value: itemDisplayName(i), label: itemDisplayName(i) })),
    };
  }
  function pickTool(key: string, name: string) {
    w.toolPicks = { ...w.toolPicks, [key]: name };
  }
  $effect(() => {
    for (const group of groups) {
      for (const opt of group.options) {
        for (const item of opt.items) if (item.choiceFrom) void loadToolOptions(item.choiceFrom);
      }
    }
  });
</script>

{#if w.equipment.status === 'running' && !groups.length}
  <p class="hint">Die KI bereitet deine Startausrüstung als wählbare Optionen auf … ({statusText(w.equipment)})</p>
{:else if w.equipment.status === 'error'}
  <p class="warn">Ausrüstung konnte nicht aufbereitet werden ({w.equipment.error}). Du kannst sie später im Editor ergänzen.</p>
{:else if !groups.length}
  <p class="hint">Keine Startausrüstung zum Auswählen (kann im Editor ergänzt werden).</p>
{:else}
  <p class="hint">Wähle je Herkunft eine Option. Die Gegenstände landen als Inventar im fertigen Charakter.</p>
  {#each groups as group, gi}
    <div class="field">
      <span>{group.source || 'Ausrüstung'}</span>
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
              {opt.description || opt.items.map((i) => (i.count > 1 ? `${i.count}× ${i.name}` : i.name)).join(', ')}
              {#if opt.goldPieces > 0}<em> · {opt.goldPieces} GM</em>{/if}
            </span>
          </button>
        {/each}
      </div>
      {#each group.options[selected(gi)]?.items ?? [] as item, ii}
        {#if item.choiceFrom}
          {@const key = toolPickKey(gi, selected(gi), ii)}
          <div class="eq-choice">
            <span class="eq-choice-label">{TOOL_CATEGORY_LABEL[item.choiceFrom]} wählen</span>
            <TooltipSelect
              options={toolOptions[item.choiceFrom] ?? []}
              selected={w.toolPicks[key] ? [w.toolPicks[key]] : []}
              onchange={(sel) => pickTool(key, sel[0] ?? '')}
            />
          </div>
        {/if}
      {/each}
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
