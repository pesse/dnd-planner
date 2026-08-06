<script lang="ts">
  /**
   * Zauberwirken je Quelle: Kontingente mit ihrer Auswahl, abgeleitete Plätze, quellenloser
   * Bestand. Geschrieben werden nur Entscheidungen (`services/spellcasting/write.ts`) —
   * Plätze, SG und Angriffsbonus stehen hier read-only, außer die Klasse hat keine
   * Progression im Vault.
   */
  import { activeFile } from '../../stores/campaign';
  import { confirmNavigation } from '../../stores/navigationGuard';
  import { sign } from '../../utils/num';
  import { ABILITY_LABEL_DE } from '../../schemas/abilities';
  import { SCHOOL_COLORS, type SpellInfo } from '../../spellLibrary';
  import { CLASS_NAME_DE_BY_SLUG } from '../../services/classProgression';
  import { groupedSpellcasting, type SpellQuotaGroup } from '../../services/spellcasting/grouped';
  import type { LoadedSpellcasting } from '../../services/spellcasting/project';
  import { addExtra, removeExtra, setPicks, setSlotTotals, setSlotUsed } from '../../services/spellcasting/write';
  import type { CharacterFormFields } from '../../services/characterFormFields';
  import { createSpellHover } from '../spellHover.svelte';
  import SpellTooltip from '../SpellTooltip.svelte';
  import SpellPickModal from '../SpellPickModal.svelte';
  import SpellCreateModal from '../SpellCreateModal.svelte';
  import type { Character } from '../../schemas/characterSchema';
  import './form.css';

  let { form, casting, spellLibrary, saved, fixLabel, onfix, onlibraryreload }: {
    form: CharacterFormFields;
    casting: LoadedSpellcasting | null;
    spellLibrary: SpellInfo[];
    saved?: Character | null;
    fixLabel?: string;
    onfix: () => void;
    onlibraryreload: () => Promise<void> | void;
  } = $props();

  const block = $derived(form.spellcasting);
  const view = $derived(casting ? groupedSpellcasting(casting.state, casting.lookup) : null);

  const byKey = $derived(new Map(spellLibrary.filter((s) => s.key).map((s) => [s.key as string, s])));
  const infoOf = (key: string): SpellInfo | undefined => byKey.get(key);

  async function openSpellPage(key: string) {
    const info = infoOf(key);
    if (!info?.path) return;
    if (!(await confirmNavigation())) return;
    const name = info.path.split('/').pop()?.replace('.json', '') ?? key;
    activeFile.set({ name, path: info.path, type: 'spell' });
  }

  let picking = $state<SpellQuotaGroup | null>(null);
  let creating = $state<{ name: string; levels: number[] } | null>(null);
  let extraQuery = $state('');

  const listLabel = (lists: string[]): string =>
    lists.map((l) => CLASS_NAME_DE_BY_SLUG[l] ?? l).join(', ');

  const pickLevels = (quota: SpellQuotaGroup): number[] =>
    quota.levels.length ? quota.levels : Array.from({ length: 10 }, (_, i) => i);

  /**
   * Ist der Pool eine andere Quota (Vorbereitung aus dem Zauberbuch), darf der Dialog NUR
   * deren Zauber anbieten — die Klassenliste wäre die falsche Menge.
   */
  const pickLibrary = (quota: SpellQuotaGroup): SpellInfo[] => {
    if (!quota.from) return spellLibrary;
    const keys = new Set(quota.from.spells.map((s) => s.key));
    return spellLibrary.filter((s) => s.key && keys.has(s.key));
  };

  function applyPicks(quota: SpellQuotaGroup, keys: string[]) {
    setPicks(block, quota.sourceId, quota.quotaId, keys);
    form.spellcasting = { ...block };
  }

  function onSlotUsed(level: number, used: number) {
    setSlotUsed(block, level, used);
    form.spellcasting = { ...block };
  }

  function onSlotTotals(level: number, total: number) {
    const totals = Array.from({ length: 9 }, (_, i) => block.manual?.slotTotals[i] ?? 0);
    totals[level - 1] = total;
    setSlotTotals(block, totals);
    form.spellcasting = { ...block };
  }

  function addExtraSpell(info: SpellInfo | undefined) {
    if (!info?.key) return;
    addExtra(block, info.key);
    form.spellcasting = { ...block };
    extraQuery = '';
  }

  function dropExtra(key: string) {
    removeExtra(block, key);
    form.spellcasting = { ...block };
  }

  async function onSpellCreated(canonical: string) {
    creating = null;
    await onlibraryreload();
    addExtraSpell(spellLibrary.find((s) => s.name === canonical));
  }

  const extraMatches = $derived.by(() => {
    const q = extraQuery.trim().toLowerCase();
    if (!q) return [];
    return spellLibrary
      .filter((s) => s.name.toLowerCase().includes(q) || (s.name_en ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  });

  const hover = createSpellHover(() => new Map(spellLibrary.map((s) => [s.name, s])));
  const spellColor = (key: string): string => SCHOOL_COLORS[infoOf(key)?.school ?? ''] ?? '';
  const savedKeys = $derived(
    new Set(
      Object.values(saved?.spellcasting?.sources ?? {}).flatMap((s) => Object.values(s.picks).flat()),
    ),
  );
</script>

{#if fixLabel}
  <button class="btn-link-all" onclick={onfix}
    title="Übernimmt den alten Zauberblock in Kontingente und quellenlosen Bestand. Wird beim Speichern geschrieben.">
    🔗 {fixLabel}
  </button>
{/if}

{#if !view}
  <p class="auto-hint">Zauberquellen werden aufgelöst …</p>
{:else}
  {#if !view.sources.length}
    <p class="auto-hint">Keine Zauberquelle — Klasse, Volk oder Talent müssen mit der Bibliothek verknüpft sein.</p>
  {/if}

  {#each view.sources as source (source.id)}
    <div class="source-block">
      <div class="source-head">
        <div class="source-title">
          <span class="source-label">{source.label}</span>
          {#if source.featureDe}<span class="source-feature">{source.featureDe}</span>{/if}
        </div>
        {#if source.abilityOptions.length}
          <!-- Nur der Hinweis: die Wahl gehört zum MERKMAL und steht in der Merkmalsleiste. -->
          <span class="ability-open" title="Zauberattribut in der Merkmals-Leiste wählen">
            Zauberattribut offen ({source.abilityOptions.map((a) => ABILITY_LABEL_DE[a]).join('/')})
          </span>
        {:else if source.abilityDe}
          <span class="source-values">
            {source.abilityDe}{#if source.saveDC !== null} · SG {source.saveDC}{/if}{#if source.attackBonus !== null} · Angriff {sign(source.attackBonus)}{/if}
          </span>
        {/if}
      </div>

      {#each source.quotas as quota (quota.quotaId)}
        <div class="quota-row">
          <span class="quota-label">
            {quota.label}
            {#if !quota.fixed}<span class="quota-count" class:over={quota.spells.length > quota.count}>{quota.spells.length} / {quota.count}</span>{/if}
            {#if quota.lists.length}<span class="quota-lists">{listLabel(quota.lists)}</span>
            {:else if quota.from}<span class="quota-lists">aus „{quota.from.label}"</span>{/if}
            <span class="quota-cast">{quota.castNote}</span>
          </span>
          <div class="tag-editor">
            {#each quota.spells as spell (spell.key)}
              <span class="tag" style="color:{spellColor(spell.key) || 'inherit'}"
                class:fresh={!savedKeys.has(spell.key) && !quota.fixed}>
                <span class="spell-link" class:linked={!!infoOf(spell.key)?.path}
                  role="button" tabindex="0"
                  onclick={() => openSpellPage(spell.key)}
                  onkeydown={(e) => e.key === 'Enter' && openSpellPage(spell.key)}
                  onmouseenter={(e) => hover.show(e, spell.label)}
                  onmousemove={hover.move}
                  onmouseleave={hover.hide}>{spell.label}</span>
                {#if !quota.fixed}
                  <button onclick={() => applyPicks(quota, quota.spells.filter((s) => s.key !== spell.key).map((s) => s.key))}>✕</button>
                {/if}
              </span>
            {/each}
          </div>
          {#if !quota.fixed}
            <button type="button" class="btn-pick" disabled={!spellLibrary.length}
              title={quota.swapNote || 'Zauber dieses Kontingents wählen'}
              onclick={() => (picking = quota)}>
              📖 Wählen
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/each}

  <h3 style="margin-top:0.75rem">Zauberplätze</h3>
  {#if view.manualSlots}
    <p class="auto-hint">Keine Progression in der Bibliothek — Plätze von Hand.</p>
    <div class="slot-edit-row">
      {#each Array.from({ length: 9 }, (_, i) => i + 1) as level}
        <label class="slot-label">S{level}
          <input type="number" min="0" max="9"
            value={block.manual?.slotTotals[level - 1] ?? 0}
            onchange={(e) => onSlotTotals(level, Number(e.currentTarget.value) || 0)} />
        </label>
      {/each}
    </div>
  {:else if !view.slots.length}
    <p class="auto-hint">Keine Zauberplätze auf dieser Stufe.</p>
  {/if}
  {#if view.slots.length}
    <div class="slot-edit-row">
      {#each view.slots as slot (slot.level)}
        <label class="slot-label" title="Verbraucht von {slot.total}">S{slot.level}
          <input type="number" min="0" max={slot.total} value={slot.used}
            onchange={(e) => onSlotUsed(slot.level, Number(e.currentTarget.value) || 0)} />
          <span class="slot-total">/ {slot.total}</span>
        </label>
      {/each}
    </div>
  {/if}
  {#if view.pact}
    <p class="auto-hint">Pakt-Plätze: {view.pact.total} × Grad {view.pact.level} (Kurze Rast)</p>
  {/if}

  <h3 style="margin-top:0.75rem">Ohne Quelle</h3>
  <div class="tag-editor">
    {#each view.extra as spell (spell.key)}
      <span class="tag" style="color:{spellColor(spell.key) || 'inherit'}">
        <span class="spell-link" class:linked={!!infoOf(spell.key)?.path}
          role="button" tabindex="0"
          onclick={() => openSpellPage(spell.key)}
          onkeydown={(e) => e.key === 'Enter' && openSpellPage(spell.key)}
          onmouseenter={(e) => hover.show(e, spell.label)}
          onmousemove={hover.move}
          onmouseleave={hover.hide}>{spell.label}</span>
        <button onclick={() => dropExtra(spell.key)}>✕</button>
      </span>
    {/each}
  </div>
  <div class="extra-add">
    <input class="input" placeholder="Zauber suchen…" bind:value={extraQuery} />
    {#if extraMatches.length}
      <ul class="extra-list">
        {#each extraMatches as match (match.key ?? match.name)}
          <li><button type="button" onclick={() => addExtraSpell(match)}>{match.name}</button></li>
        {/each}
      </ul>
    {:else if extraQuery.trim()}
      <button type="button" class="create-btn" onclick={() => (creating = { name: extraQuery.trim(), levels: [] })}>
        ＋ „{extraQuery.trim()}" anlegen
      </button>
    {/if}
  </div>
{/if}

{#if picking}
  {@const quota = picking}
  <SpellPickModal title={quota.from ? `${quota.label} — aus „${quota.from.label}"` : quota.label}
    library={pickLibrary(quota)}
    spellLevels={pickLevels(quota)} spellClass={quota.lists[0] ?? ''} max={quota.count} enforceMax={false}
    bind:picks={() => quota.spells.map((s) => s.key), (keys) => applyPicks(quota, keys)}
    onclose={() => (picking = null)} />
{/if}

{#if creating}
  <SpellCreateModal name={creating.name} levels={creating.levels}
    onclose={() => (creating = null)} oncreated={onSpellCreated} />
{/if}

<SpellTooltip spell={hover.spell} x={hover.x} y={hover.y} />

<style>
  .source-block {
    border: 1px solid var(--border); border-radius: 6px;
    padding: 0.5rem 0.6rem; margin-bottom: 0.5rem;
    display: flex; flex-direction: column; gap: 0.4rem;
  }
  .source-head { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
  .source-title { display: flex; flex-direction: column; gap: 0.05rem; }
  .source-label { font-weight: 600; font-family: var(--font-display, inherit); }
  .source-feature { font-size: 0.72rem; color: var(--ink-muted); }
  .source-values { font-size: 0.78rem; color: var(--ink-muted); }
  .ability-open { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; }
  .quota-row { display: flex; align-items: flex-start; gap: 0.5rem; flex-wrap: wrap; }
  .quota-label {
    font-size: 0.75rem; color: var(--ink-muted); min-width: 11rem;
    display: flex; flex-direction: column; gap: 0.1rem;
  }
  .quota-count { font-variant-numeric: tabular-nums; }
  .quota-count.over { color: var(--red); font-weight: 600; }
  .quota-lists { font-style: italic; }
  .quota-cast { font-size: 0.7rem; color: var(--ink-faint); }
  .tag-editor { flex: 1 1 12rem; }
  .tag.fresh { outline: 1px solid var(--gold); }
  .slot-total { font-size: 0.7rem; color: var(--ink-muted); }
  .extra-add { display: flex; flex-direction: column; gap: 0.25rem; max-width: 22rem; }
  .extra-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .extra-list button {
    background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
    font-size: 0.78rem; padding: 0.15rem 0.55rem; cursor: pointer; color: var(--ink-soft);
  }
  .create-btn {
    background: none; border: none; cursor: pointer; font-style: italic;
    font-size: 0.78rem; color: var(--arcane, var(--red)); text-align: left; padding: 0;
  }
</style>
