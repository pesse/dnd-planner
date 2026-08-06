<script lang="ts">
  import './wizard.css';
  import type { CharacterWizard } from '../../services/wizard/characterWizard.svelte';
  import type { Job } from '../../services/wizard/job.svelte';
  import type { SpellStepValues } from '../../services/wizard/spellStep.svelte';
  import type { SpellStepRow } from '../../services/wizard/spellRows';
  import { knownSpellGroups, knownSpells, NO_KNOWN_SPELLS } from '../../services/spellcasting/known';
  import { pickerKnown, pickLevels, pickLibrary } from '../../services/spellcasting/picker';
  import { pickedKeys, setExtra, setPicks } from '../../services/spellcasting/write';
  import type { SpellInfo } from '../../spellLibrary';
  import SpellPickField from '../SpellPickField.svelte';

  let { w, library, v, statusText }: {
    w: CharacterWizard;
    library: SpellInfo[];
    v: SpellStepValues;
    statusText: (job: Job<unknown>) => string;
  } = $props();

  // Gelesen wird aus dem BLOCK, nicht aus `row.spells`: die Sicht entsteht asynchron neu, ein
  // offener Dialog sähe seine eigenen Schreibvorgänge nie und könnte nichts abwählen.
  const picksOf = (sourceId: string, quotaId: string) => pickedKeys(w.spellcasting, sourceId, quotaId);

  function writePicks(sourceId: string, quotaId: string, keys: string[]) {
    setPicks(w.spellcasting, sourceId, quotaId, keys);
    w.spellcasting = { ...w.spellcasting };
  }

  function writeExtra(keys: string[]) {
    setExtra(w.spellcasting, keys);
    w.spellcasting = { ...w.spellcasting };
  }

  const rowTitle = (row: SpellStepRow) => `${row.source} — ${row.label}`;
  const extraKeys = $derived(w.spellcasting.manual?.extra ?? []);
  const featurePickBinding = (id: string) =>
    [
      () => w.featureSpellPicks[id] ?? [],
      (val: string[]) => (w.featureSpellPicks = { ...w.featureSpellPicks, [id]: val }),
    ] as const;
</script>

{#if v.error}
  <p class="warn">Zauberquellen konnten nicht aufgelöst werden: {v.error}</p>
{/if}

{#each v.view?.issues ?? [] as issue (issue.kind + issue.text)}
  <p class="warn">{issue.text}</p>
{/each}

{#each v.rows as row (row.quota.sourceId + row.quota.quotaId)}
  <div class="field">
    <span>
      {row.source} · {row.label}
      {#if row.hint}<span class="info" title={row.hint}>ⓘ</span>{/if}
    </span>
    {#if row.fixed}
      <div class="granted-chips">
        {#each row.spells as spell (spell.key)}<span class="granted">◆ {spell.label}</span>{/each}
      </div>
    {:else}
      <SpellPickField
        title={rowTitle(row)}
        library={pickLibrary(row.quota, library)}
        spellLevels={pickLevels(row.quota)}
        spellClass={row.quota.lists[0] ?? ''}
        max={row.count}
        known={v.view ? pickerKnown(v.view, row.quota) : NO_KNOWN_SPELLS}
        bind:picks={
          () => picksOf(row.quota.sourceId, row.quota.quotaId),
          (keys) => writePicks(row.quota.sourceId, row.quota.quotaId, keys)
        }
        bind:prepared={
          () => (row.prepared ? picksOf(row.prepared.sourceId, row.prepared.quotaId) : undefined),
          (keys) => { if (row.prepared) writePicks(row.prepared.sourceId, row.prepared.quotaId, keys ?? []); }
        }
        preparedMax={row.prepared?.count ?? 0}
      />
    {/if}
  </div>
{/each}

{#if v.granted.length || v.extraMax > 0}
  <div class="field">
    <span>
      Aus Merkmalen (kein Kontingent)
      <span class="info" title="Diese Zauber hängen an keinem Kontingent — am Charakter stehen sie unter „Ohne Quelle“.">ⓘ</span>
    </span>
    {#if v.granted.length}
      <div class="granted-chips">
        {#each v.granted as g (g.name)}
          <span class="granted">◆ {g.level > 0 ? `${g.name} (Grad ${g.level})` : g.name}</span>
        {/each}
      </div>
    {/if}
    {#if v.extraMax > 0}
      <SpellPickField
        title="Ohne Quelle"
        {library}
        spellLevels={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}
        max={v.extraMax}
        known={v.view ? knownSpells(knownSpellGroups(v.view), ['extra']) : NO_KNOWN_SPELLS}
        bind:picks={() => extraKeys, (keys) => writeExtra(keys)}
      />
    {/if}
  </div>
{/if}

{#each v.loose as choice (choice.id)}
  {@const bind = featurePickBinding(choice.id)}
  <div class="field">
    <span>
      {choice.featureDe || choice.feature}: {choice.questionDe || choice.question}
      {#if choice.helpDe || choice.help}<span class="info" title={choice.helpDe || choice.help}>ⓘ</span>{/if}
    </span>
    <SpellPickField
      title={choice.feature}
      {library}
      spellLevels={choice.spellLevels}
      spellClass={choice.spellClass}
      max={choice.max}
      known={v.view ? knownSpells(knownSpellGroups(v.view), ['extra']) : NO_KNOWN_SPELLS}
      bind:picks={bind[0], bind[1]}
    />
  </div>
{/each}

{#if w.effects.status === 'running'}
  <p class="hint">
    Die KI leitet noch die Merkmals-Effekte ab ({statusText(w.effects)}) — kommt dabei ein
    zusätzlicher Zaubertrick heraus, wächst das Angebot oben nach. Getroffene Wahlen bleiben
    erhalten.
  </p>
{:else if !v.rows.length && !v.loose.length && !v.error}
  <p class="hint">Diese Figur wirkt auf Stufe 1 keine Zauber.</p>
{/if}

<style>
  .granted-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .granted {
    background: var(--surface); border: 1px dashed var(--border); border-radius: 999px;
    padding: 0.12rem 0.5rem; font-size: 0.74rem; color: var(--ink-soft);
  }
</style>
