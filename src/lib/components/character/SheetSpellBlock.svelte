<script lang="ts">
  import './sheet.css';
  import { sign } from '../../utils/num';
  import { activeFile } from '../../stores/campaign';
  import { confirmNavigation } from '../../stores/navigationGuard';
  import { matchSpell, SCHOOL_COLORS, type SpellIndex, type SpellInfo } from '../../spellLibrary';
  import { prepareMultiSpellPrint } from '../../utils/printSpell';
  import { spellSchoolLabel } from '../../types';
  import { createSpellHover, loadSpellCached } from '../spellHover.svelte';
  import SpellTooltip from '../SpellTooltip.svelte';
  import type { Spell } from '../../types';
  import type { SheetSpell, SheetSpellcasting } from '../../services/spellcasting/project';

  let { characterName, view, spellIndex }: {
    characterName: string;
    view: SheetSpellcasting | null;
    spellIndex: SpellIndex;
  } = $props();

  const LEVEL_LABEL: Record<number, string> = {
    0: 'Zaubertricks',
    1: 'Stufe 1', 2: 'Stufe 2', 3: 'Stufe 3', 4: 'Stufe 4', 5: 'Stufe 5',
    6: 'Stufe 6', 7: 'Stufe 7', 8: 'Stufe 8', 9: 'Stufe 9',
  };

  const infoOf = (s: SheetSpell): SpellInfo | undefined =>
    matchSpell(spellIndex, { sourceKey: s.key || undefined, name: s.label });

  const spells = $derived((view?.levels ?? []).flatMap((l) => l.spells));
  const byLabel = $derived(
    new Map(
      spells
        .map((s) => [s.label, infoOf(s)] as const)
        .filter((e): e is [string, SpellInfo] => !!e[1]),
    ),
  );
  const hover = createSpellHover(() => byLabel, () => byLabel.keys());

  async function openSpellPage(s: SheetSpell) {
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

{#if view?.hasContent}
  <div class="section">
    <div class="section-head-row">
      <h3>Zauberwirken</h3>
      <button class="btn-spell-pdf" onclick={printSpellList} disabled={printingSpells}
        title="Alle Zauber als druckbare Karten (A6, 9/Seite)">
        {printingSpells ? '…' : '🖨 PDF'}
      </button>
    </div>

    {#each view.sources as src}
      <div class="stats-grid" class:spell-access={src.kind === 'feature'} style="margin-bottom:0.6rem">
        <div class="stat"><span class="sl">{src.kind === 'class' ? 'Klasse' : 'Merkmal'}</span><span class="sv">{src.label}</span></div>
        {#if src.abilityDe}
          <div class="stat"><span class="sl">Fähigkeit</span><span class="sv">{src.abilityDe}</span></div>
        {:else if src.abilityOptionsDe.length}
          <div class="stat"><span class="sl">Fähigkeit</span><span class="sv open">{src.abilityOptionsDe.join(' / ')}</span></div>
        {/if}
        {#if src.saveDC !== null}<div class="stat"><span class="sl">Zauber-SG</span><span class="sv">{src.saveDC}</span></div>{/if}
        {#if src.attackBonus !== null}<div class="stat"><span class="sl">Angriffsbonus</span><span class="sv">{sign(src.attackBonus)}</span></div>{/if}
      </div>
    {/each}

    {#if view.pact}
      <div class="stats-grid" style="margin-bottom:0.6rem">
        <div class="stat"><span class="sl">Pakt-Plätze</span><span class="sv">{view.pact.total} × Grad {view.pact.level}</span></div>
        <div class="stat"><span class="sl">Auffrischen</span><span class="sv">Kurze Rast</span></div>
      </div>
    {/if}

    {#each view.levels as level}
      <div class="spell-level-header">
        <span>{LEVEL_LABEL[level.level]}</span>
        {#if level.slots}
          <span class="slot-badge">{level.slots.total} Slots</span>
        {/if}
      </div>
      <div class="spell-cards">
        {#each level.spells as spell}
          {@const info = infoOf(spell)}
          {@const color = info?.school ? (SCHOOL_COLORS[info.school] ?? '') : ''}
          <div class="scard" class:prepared={spell.prepared} class:scard-linked={!!info?.path}
            style="--sc:{color || 'var(--border-strong)'}"
            role="button" tabindex="0"
            onclick={() => openSpellPage(spell)}
            onkeydown={(e) => e.key === 'Enter' && openSpellPage(spell)}
            onmouseenter={(e) => hover.show(e, spell.label)}
            onmousemove={(e) => hover.move(e)}
            onmouseleave={() => hover.hide()}>
            <div class="scard-head">
              {#if level.level > 0}
                <span class="scard-prep">{spell.prepared ? '●' : '○'}</span>
              {/if}
              <span class="scard-name">{spell.label}</span>
              <span class="scard-badges">
                {#if spell.source}<span class="scard-source">{spell.source}</span>{/if}
                {#if info?.school}<span class="scard-school">{spellSchoolLabel(info.school)}</span>{/if}
              </span>
            </div>
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<SpellTooltip spell={hover.spell} x={hover.x} y={hover.y} />

<style>
  /* Zweiter Zauberblock: abgesetzt, damit er nicht als Klassen-Zauberwirken gelesen wird. */
  .spell-access {
    border-left: 2px solid var(--copper);
    padding-left: 0.5rem;
  }

  .sv.open { color: var(--ink-muted); font-style: italic; }

  .spell-level-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
    border-bottom: 1px solid var(--surface);
    padding-bottom: 0.2rem;
    margin: 0.5rem 0 0.25rem;
  }

  .slot-badge {
    font-size: 0.7rem;
    background: var(--surface);
    color: var(--red);
    border-radius: 4px;
    padding: 0.05rem 0.4rem;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
  }

  .section-head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
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

  .spell-cards {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.3rem;
  }

  .scard {
    border-left: 3px solid var(--sc);
    background: var(--bg);
    border-radius: 0 5px 5px 0;
    cursor: help;
    user-select: none;
    transition: background 0.1s;
  }
  .scard.scard-linked { cursor: pointer; }
  .scard:hover { background: var(--bg-raised); }

  .scard-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem 0.3rem 0.6rem;
    font-size: 0.83rem;
  }

  .scard-prep { font-size: 0.6rem; color: var(--border); flex-shrink: 0; }
  .scard.prepared .scard-prep { color: var(--green); }

  .scard-name { flex: 1; color: var(--sc); font-weight: 500; }

  .scard-badges { display: flex; gap: 0.3rem; align-items: center; }
  .scard-source {
    font-size: 0.68rem;
    color: var(--copper);
    letter-spacing: 0.02em;
  }
  .scard-school {
    font-size: 0.68rem;
    color: var(--border);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
