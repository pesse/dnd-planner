<script lang="ts">
  /** Resistenzen und Immunitäten: die aus Merkmalen und Gegenständen zum Lesen, darunter eigene Einträge. */
  import { CONDITIONS, CONDITION_KEYS, DAMAGE_TYPES } from '../../schemas/vocabulary';
  import type { ManualDefense } from '../../schemas/defense';
  import { DAMAGE_TYPE_LABELS } from '../../itemLabels';
  import { defenseWhenDe, type CharacterDefense } from '../../services/defenses';
  import './form.css';

  let { derived, entries }: {
    derived: CharacterDefense[];
    entries: ManualDefense[];
  } = $props();

  type ListKey = 'resistances' | 'immunities' | 'conditionImmunities';
  const GROUPS: { list: ListKey; labelDe: string; chipDe: string; keys: readonly string[]; nameOf: (k: string) => string }[] = [
    { list: 'resistances', labelDe: 'Resistenz', chipDe: 'Resistenz', keys: DAMAGE_TYPES, nameOf: (k) => DAMAGE_TYPE_LABELS[k] },
    { list: 'immunities', labelDe: 'Immun gegen Schaden', chipDe: 'Immun', keys: DAMAGE_TYPES, nameOf: (k) => DAMAGE_TYPE_LABELS[k] },
    { list: 'conditionImmunities', labelDe: 'Immun gegen Zustand', chipDe: 'Immun', keys: CONDITION_KEYS, nameOf: (k) => CONDITIONS[k as keyof typeof CONDITIONS] },
  ];

  /** Optionswert `list:key`, damit ein Auswahlfeld alle drei Listen bedient. */
  function addFromSelect(entry: ManualDefense, select: HTMLSelectElement): void {
    const [list, key] = select.value.split(':') as [ListKey, string];
    select.value = '';
    if (!key || (entry[list] as string[]).includes(key)) return;
    (entry[list] as string[]).push(key);
  }

  const blank = (): ManualDefense => ({ labelDe: '', resistances: [], immunities: [], conditionImmunities: [] });
</script>

{#if derived.length}
  <ul class="def-derived">
    {#each derived as d, i (i)}
      <li>
        {d.textDe}{#if defenseWhenDe(d.effect)}<span class="def-when"> – {defenseWhenDe(d.effect)}</span>{/if}
        <span class="def-source">({d.labelDe})</span>
      </li>
    {/each}
  </ul>
{/if}

{#each entries as entry, i (i)}
  <div class="def-row">
    <input class="def-label" bind:value={entry.labelDe} placeholder="Woher? („Trank der Feuerresistenz“)" />
    <div class="tag-editor">
      {#each GROUPS as g (g.list)}
        {#each entry[g.list] as key, j (key)}
          <span class="tag">{g.chipDe}: {g.nameOf(key)}
            <button type="button" title="Entfernen" onclick={() => entry[g.list].splice(j, 1)}>✕</button>
          </span>
        {/each}
      {/each}
      <select class="def-add" onchange={(e) => addFromSelect(entry, e.currentTarget)}>
        <option value="">hinzufügen…</option>
        {#each GROUPS as g (g.list)}
          <optgroup label={g.labelDe}>
            {#each g.keys.filter((k) => !(entry[g.list] as string[]).includes(k)) as k (k)}
              <option value={`${g.list}:${k}`}>{g.nameOf(k)}</option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </div>
    <button type="button" class="remove-btn" title="Eintrag entfernen" onclick={() => entries.splice(i, 1)}>✕</button>
  </div>
{/each}
<button type="button" class="btn-add" onclick={() => entries.push(blank())}>+ Resistenz/Immunität</button>

<style>
  .def-derived { margin: 0 0 0.5rem; padding-left: 1.1rem; font-size: 0.8rem; color: var(--ink); }
  .def-when { color: var(--ink-soft); font-style: italic; }
  .def-source { color: var(--ink-muted); font-size: 0.75rem; }
  .def-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
  .def-label { flex: 0 0 16rem; }
  .def-row .tag-editor { flex: 1; }
  .def-add { width: auto; font-size: 0.75rem; }
</style>
