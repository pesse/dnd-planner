<script lang="ts">
  /**
   * Zauberwirken auf der Karte — dieselbe Gruppierung wie im Editor
   * (`services/spellcasting/grouped.ts`): je Quelle ihre Kontingente, dann Plätze und Bestand.
   * Read-only, aber mit den Zauber-Verknüpfungen und dem Kartendruck.
   */
  import './sheet.css';
  import { sign } from '../../utils/num';
  import { activeFile } from '../../stores/campaign';
  import { confirmNavigation } from '../../stores/navigationGuard';
  import { matchSpell, SCHOOL_COLORS, type SpellIndex, type SpellInfo } from '../../spellLibrary';
  import { prepareMultiSpellPrint } from '../../utils/printSpell';
  import { createSpellHover, loadSpellCached } from '../spellHover.svelte';
  import { CLASS_NAME_DE_BY_SLUG } from '../../services/classProgression';
  import { ABILITY_LABEL_BY_NAME } from '../../schemas/abilities';
  import { resourceViews } from '../../services/resources/project';
  import { groupedSpellcasting } from '../../services/spellcasting/grouped';
  import type { LoadedSpellcasting } from '../../services/spellcasting/project';
  import SpellTooltip from '../SpellTooltip.svelte';
  import type { Spell } from '../../types';

  let { characterName, casting, spellIndex }: {
    characterName: string;
    casting: LoadedSpellcasting | null;
    spellIndex: SpellIndex;
  } = $props();

  interface CardSpell {
    key: string;
    label: string;
    /** Nur beim Altbestand aussagekräftig: dort steht die Vorbereitung am Zauber. */
    prepared: boolean;
  }

  const view = $derived(casting ? groupedSpellcasting(casting.state, casting.lookup) : null);
  /** Noch nicht umgezogene Dateien: Kopfzeile und Zauber stehen im alten Block (`spellsFix`). */
  const legacy = $derived(casting?.legacy ?? { row: null, spells: [] });
  const resources = $derived(resourceViews(view?.resources ?? []));

  const loose = $derived<CardSpell[]>([
    ...(view?.extra ?? []).map((s) => ({ key: s.key, label: s.label, prepared: true })),
    ...legacy.spells.map((s) => ({ key: s.key, label: s.label, prepared: s.prepared })),
  ]);
  const spells = $derived<CardSpell[]>([
    ...(view?.sources ?? []).flatMap((src) =>
      src.quotas.flatMap((q) => q.spells.map((s) => ({ key: s.key, label: s.label, prepared: true }))),
    ),
    ...loose,
  ]);
  const hasContent = $derived(
    !!view &&
      (view.sources.length > 0 ||
        resources.length > 0 ||
        spells.length > 0 ||
        !!legacy.row ||
        // Ohne die Issues bliebe die Karte leer und verschwiege, dass etwas fehlt.
        view.issues.length > 0),
  );

  const listLabel = (lists: string[]): string => lists.map((l) => CLASS_NAME_DE_BY_SLUG[l] ?? l).join(', ');

  const infoOf = (s: CardSpell): SpellInfo | undefined =>
    matchSpell(spellIndex, { sourceKey: s.key || undefined, name: s.label });
  const colorOf = (s: CardSpell): string => SCHOOL_COLORS[infoOf(s)?.school ?? ''] ?? '';

  const byLabel = $derived(
    new Map(
      spells
        .map((s) => [s.label, infoOf(s)] as const)
        .filter((e): e is [string, SpellInfo] => !!e[1]),
    ),
  );
  const hover = createSpellHover(() => byLabel, () => byLabel.keys());

  async function openSpellPage(s: CardSpell) {
    const info = infoOf(s);
    if (!info?.path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    const name = info.path.split('/').pop()?.replace('.json', '') ?? s.label;
    activeFile.set({ name, path: info.path, type: 'spell' });
  }

  let printingSpells = $state(false);

  async function printSpellList() {
    printingSpells = true;
    try {
      const spellObjects: Spell[] = [];
      for (const s of spells) {
        const info = infoOf(s);
        const data = info?.path ? await loadSpellCached(s.label, info.path) : null;
        if (data) spellObjects.push(data);
      }
      if (!spellObjects.length) return;

      const html = prepareMultiSpellPrint(spellObjects, document);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open(); doc.write(html); doc.close();
      setTimeout(() => {
        const prev = document.title;
        document.title = `${characterName || 'Charakter'} – Zauberkarten`;
        iframe.contentWindow!.focus();
        iframe.contentWindow!.print();
        document.title = prev;
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }, 0);
    } finally {
      printingSpells = false;
    }
  }
</script>

{#snippet chip(s: CardSpell)}
  {@const info = infoOf(s)}
  <span class="tag spell-chip" class:linked={!!info?.path} class:unprepared={!s.prepared}
    style="color:{colorOf(s) || 'inherit'}"
    role="button" tabindex="0"
    title={s.prepared ? '' : 'nicht vorbereitet'}
    onclick={() => openSpellPage(s)}
    onkeydown={(e) => e.key === 'Enter' && openSpellPage(s)}
    onmouseenter={(e) => hover.show(e, s.label)}
    onmousemove={(e) => hover.move(e)}
    onmouseleave={() => hover.hide()}>{s.label}</span>
{/snippet}

{#if hasContent && view}
  <div class="section">
    <div class="section-head-row">
      <h3>Zauberwirken</h3>
      <button class="btn-spell-pdf" onclick={printSpellList} disabled={printingSpells}
        title="Alle Zauber als druckbare Karten (A6, 9/Seite)">
        {printingSpells ? '…' : '🖨 PDF'}
      </button>
    </div>

    {#each view.issues as issue (issue.kind + issue.text)}
      <p class="casting-issue">{issue.text}</p>
    {/each}

    {#each view.sources as source (source.id)}
      <div class="source-block">
        <div class="source-head">
          <div class="source-title">
            <span class="source-label">{source.label}</span>
            {#if source.featureDe}<span class="source-feature">{source.featureDe}</span>{/if}
          </div>
          {#if source.abilityDe}
            <span class="source-values">
              {source.abilityDe}{#if source.saveDC !== null} · SG {source.saveDC}{/if}{#if source.attackBonus !== null} · Angriff {sign(source.attackBonus)}{/if}
            </span>
          {:else if source.abilityOptions.length}
            <span class="source-open">
              Zauberattribut offen ({source.abilityOptions.map((a) => ABILITY_LABEL_BY_NAME[a]).join('/')})
            </span>
          {/if}
        </div>

        {#each source.quotas as quota (quota.quotaId)}
          <div class="quota-row">
            <span class="quota-label">
              {quota.label}
              {#if !quota.fixed}<span class="quota-count">{quota.spells.length} / {quota.count}</span>{/if}
              {#if quota.lists.length}<span class="quota-lists">{listLabel(quota.lists)}</span>
            {:else if quota.from}<span class="quota-lists">aus „{quota.from.label}"</span>{/if}
              <span class="quota-cast">{quota.castNote}</span>
            </span>
            <div class="tag-list quota-spells">
              {#each quota.spells as spell (spell.key)}
                {@render chip({ key: spell.key, label: spell.label, prepared: true })}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/each}

    {#if legacy.row}
      <!-- Freitext-Kopfzeile einer Datei vor dem Umzug: ungerechnet, wie sie dort steht. -->
      <div class="source-block">
        <div class="source-head">
          <div class="source-title">
            <span class="source-label">{legacy.row.label}</span>
            <span class="source-feature">aus dem alten Zauberblock</span>
          </div>
          <span class="source-values">
            {legacy.row.abilityDe}{#if legacy.row.saveDC !== null} · SG {legacy.row.saveDC}{/if}{#if legacy.row.attackBonus !== null} · Angriff {sign(legacy.row.attackBonus)}{/if}
          </span>
        </div>
      </div>
    {/if}

    {#each resources as pool (pool.id)}
      <div class="quota-row">
        <span class="quota-label">{pool.label}{#if pool.hint}<span class="quota-cast">{pool.hint}</span>{/if}</span>
        <div class="tag-list">
          {#each pool.cells as cell (cell.label)}
            <span class="tag slot-tag">{cell.label ? `${cell.label}: ` : ''}{cell.count}</span>
          {/each}
        </div>
      </div>
    {/each}

    {#if loose.length}
      <div class="quota-row">
        <span class="quota-label">Ohne Quelle</span>
        <div class="tag-list quota-spells">
          {#each loose as spell (spell.key || spell.label)}
            {@render chip(spell)}
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<SpellTooltip spell={hover.spell} x={hover.x} y={hover.y} />

<style>
  .casting-issue {
    font-size: 0.75rem;
    color: var(--danger);
    margin: 0 0 0.4rem;
    padding-left: 0.55rem;
    border-left: 2px solid var(--danger);
  }
  .source-block {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.4rem 0.55rem;
    margin-bottom: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .source-head { display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; }
  .source-title { display: flex; flex-direction: column; gap: 0.05rem; }
  .source-label { font-weight: 600; font-family: var(--font-display, inherit); }
  .source-feature { font-size: 0.72rem; color: var(--ink-muted); }
  .source-values { font-size: 0.78rem; color: var(--ink-muted); }
  .source-open { font-size: 0.75rem; color: var(--ink-muted); font-style: italic; }

  .quota-row { display: flex; align-items: flex-start; gap: 0.5rem; flex-wrap: wrap; }
  .quota-label {
    font-size: 0.75rem;
    color: var(--ink-muted);
    min-width: 11rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .quota-count { font-variant-numeric: tabular-nums; }
  .quota-lists { font-style: italic; }
  .quota-cast { font-size: 0.7rem; color: var(--ink-faint); }
  .quota-spells { flex: 1 1 12rem; margin-bottom: 0; }

  .spell-chip { cursor: help; user-select: none; }
  .spell-chip.linked { cursor: pointer; }
  .spell-chip:hover { background: var(--bg-raised); }
  .spell-chip.unprepared { opacity: 0.6; font-style: italic; }

  .slot-tag { font-variant-numeric: tabular-nums; color: var(--ink-soft); }

  .section-head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.3rem;
  }
  .section-head-row h3 { margin-bottom: 0; }

  .btn-spell-pdf {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--ink-soft);
    border-radius: 5px;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-spell-pdf:hover:not(:disabled) { color: var(--red); border-color: var(--red); }
  .btn-spell-pdf:disabled { opacity: 0.5; cursor: default; }
</style>
