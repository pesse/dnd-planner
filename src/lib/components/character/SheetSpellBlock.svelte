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
  import type { Character } from '../../schemas/characterSchema';
  import type { SpellAccessValues } from '../../services/spellAccess';

  let { character, spellIndex, spellAccessRows }: {
    character: Character;
    spellIndex: SpellIndex;
    spellAccessRows: SpellAccessValues[];
  } = $props();

  const LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const LEVEL_LABEL: Record<string, string> = {
    '1': 'Stufe 1', '2': 'Stufe 2', '3': 'Stufe 3', '4': 'Stufe 4', '5': 'Stufe 5',
    '6': 'Stufe 6', '7': 'Stufe 7', '8': 'Stufe 8', '9': 'Stufe 9',
  };

  const resolveSpell = (ref: { name: string; sourceKey?: string }): SpellInfo | undefined =>
    matchSpell(spellIndex, ref);
  function spellColor(ref: { name: string; sourceKey?: string }): string {
    const school = resolveSpell(ref)?.school;
    return school ? (SCHOOL_COLORS[school] ?? '') : '';
  }

  const refs = $derived([
    ...(character.spells?.cantrips ?? []),
    ...LEVELS.flatMap((lvl) => character.spells?.byLevel[lvl] ?? []),
  ]);
  // Über den EINTRAG aufgelöst (Key vor Name), damit ein umbenannter Zauber seinen
  // Tooltip behält; der Hover kennt danach nur noch den angezeigten Namen.
  const byName = $derived(
    new Map(
      refs
        .map((r) => [r.name, resolveSpell(r)] as const)
        .filter((e): e is [string, SpellInfo] => !!e[1]),
    ),
  );
  const hover = createSpellHover(() => byName, () => byName.keys());

  async function openSpellPage(ref: { name: string; sourceKey?: string }) {
    const info = resolveSpell(ref);
    if (!info?.path) return;
    if (!(await confirmNavigation())) return; // ungespeicherte Charakter-Änderungen
    const name = info.path.split('/').pop()?.replace('.json', '') ?? ref.name;
    activeFile.set({ name, path: info.path, type: 'spell' });
  }

  let printingSpells = $state(false);

  async function printSpellList() {
    if (!character.spells) return;
    printingSpells = true;
    try {
      const spellObjects: Spell[] = [];
      for (const ref of refs) {
        const info = resolveSpell(ref);
        const data = info?.path ? await loadSpellCached(ref.name, info.path) : null;
        if (data) spellObjects.push(data);
      }
      if (!spellObjects.length) return;

      const html = prepareMultiSpellPrint(spellObjects, document);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;visibility:hidden;';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open(); doc.write(html); doc.close();
      const charName = character.name || 'Charakter';
      setTimeout(() => {
        const prev = document.title;
        document.title = `${charName} – Zauberkarten`;
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

{#if character.spells?.cantrips.length || Object.keys(character.spells?.byLevel ?? {}).length || character.spells?.spellcastingClass}
  <div class="section">
    <div class="section-head-row">
      <h3>Zauberwirken</h3>
      <button class="btn-spell-pdf" onclick={printSpellList} disabled={printingSpells}
        title="Alle Zauber als druckbare Karten (A6, 9/Seite)">
        {printingSpells ? '…' : '🖨 PDF'}
      </button>
    </div>
    {#if character.spells.spellcastingClass || character.spells.saveDC}
      <div class="stats-grid" style="margin-bottom:0.6rem">
        {#if character.spells.spellcastingClass}<div class="stat"><span class="sl">Klasse</span><span class="sv">{character.spells.spellcastingClass}</span></div>{/if}
        {#if character.spells.spellcastingAbility}<div class="stat"><span class="sl">Fähigkeit</span><span class="sv">{character.spells.spellcastingAbility}</span></div>{/if}
        {#if character.spells.saveDC}<div class="stat"><span class="sl">Zauber-SG</span><span class="sv">{character.spells.saveDC}</span></div>{/if}
        {#if character.spells.attackBonus}<div class="stat"><span class="sl">Angriffsbonus</span><span class="sv">{sign(character.spells.attackBonus)}</span></div>{/if}
      </div>
    {/if}
    {#each spellAccessRows as acc}
      <div class="stats-grid spell-access" style="margin-bottom:0.6rem">
        <div class="stat"><span class="sl">Merkmal</span><span class="sv">{acc.featureDe}</span></div>
        <div class="stat"><span class="sl">Fähigkeit</span><span class="sv">{acc.abilityDe}</span></div>
        <div class="stat"><span class="sl">Zauber-SG</span><span class="sv">{acc.saveDC}</span></div>
        <div class="stat"><span class="sl">Angriffsbonus</span><span class="sv">{sign(acc.attackBonus)}</span></div>
      </div>
    {/each}

    {#if character.spells.cantrips.length}
      <div class="spell-level-header"><span>Zaubertricks</span></div>
      <div class="spell-cards">
        {#each character.spells.cantrips as c}
          {@const info = resolveSpell(c)}
          {@const color = spellColor(c)}
          <div class="scard" class:scard-linked={!!info?.path}
            style="--sc:{color || 'var(--border-strong)'}"
            role="button" tabindex="0"
            onclick={() => openSpellPage(c)}
            onkeydown={(e) => e.key === 'Enter' && openSpellPage(c)}
            onmouseenter={(e) => hover.show(e, c.name)}
            onmousemove={(e) => hover.move(e)}
            onmouseleave={() => hover.hide()}>
            <div class="scard-head">
              <span class="scard-name">{c.name}</span>
              <span class="scard-badges">
                {#if info?.school}<span class="scard-school">{spellSchoolLabel(info.school)}</span>{/if}
              </span>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#each LEVELS as lvl}
      {@const slots = character.spells.slots[Number(lvl) - 1]}
      {@const lvlSpells = character.spells.byLevel[lvl] ?? []}
      {#if lvlSpells.length || (slots?.total ?? 0) > 0}
        <div class="spell-level-header">
          <span>{LEVEL_LABEL[lvl]}</span>
          {#if slots?.total}
            <span class="slot-badge">{slots.total} Slots</span>
          {/if}
        </div>
        <div class="spell-cards">
          {#each lvlSpells as spell}
            {@const info = resolveSpell(spell)}
            {@const color = spellColor(spell)}
            <div class="scard" class:prepared={spell.prepared} class:scard-linked={!!info?.path}
              style="--sc:{color || 'var(--border-strong)'}"
              role="button" tabindex="0"
              onclick={() => openSpellPage(spell)}
              onkeydown={(e) => e.key === 'Enter' && openSpellPage(spell)}
              onmouseenter={(e) => hover.show(e, spell.name)}
              onmousemove={(e) => hover.move(e)}
              onmouseleave={() => hover.hide()}>
              <div class="scard-head">
                <span class="scard-prep">{spell.prepared ? '●' : '○'}</span>
                <span class="scard-name">{spell.name}</span>
                <span class="scard-badges">
                  {#if info?.school}<span class="scard-school">{spellSchoolLabel(info.school)}</span>{/if}
                </span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
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
  .scard-school {
    font-size: 0.68rem;
    color: var(--border);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
