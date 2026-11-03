<script lang="ts">
  /** Was die Spielleitung am Tisch von einer Spielerfigur braucht, aus derselben Herleitung wie der Bogen. */
  import type { Character } from '../../../schemas/characterSchema';
  import type { CharacterSheetModel } from '../../../services/characterSheetModel.svelte';
  import { ABILITY_ABBR_DE, ABILITY_KEYS } from '../../../schemas/abilities';
  import { SKILL_DEFS } from '../../../domain/skills';
  import { computeAttackBonus, computeAttackDamage } from '../../../services/attackCalc';
  import { groupedSpellcasting } from '../../../services/spellcasting/grouped';
  import { spellsByLevel } from '../../../services/spellcasting/byLevel';
  import { rollNow } from '../../../services/battleMap/diceTray.svelte';
  import { sign } from '../../../utils/num';
  import { matchSpell, SCHOOL_COLORS, type SpellInfo } from '../../../spellLibrary';
  import { createSpellHover } from '../../spellHover.svelte';
  import SpellTooltip from '../../SpellTooltip.svelte';

  let { character: c, model: m }: { character: Character; model: CharacterSheetModel } = $props();

  const skillValue = (key: string): number => c.skills[key]?.value ?? 0;
  const passives = $derived([
    { label: 'Wahrnehmung', value: Number(c.passivePerception) || 10 + skillValue('Wahrnehmung') },
    { label: 'Motiv erkennen', value: 10 + skillValue('MotivErkennen') },
    { label: 'Nachforschungen', value: 10 + skillValue('Nachforschungen') },
  ]);
  const skills = $derived(SKILL_DEFS.filter((d) => c.skills[d.key]?.prof || c.skills[d.key]?.exp));
  const attacks = $derived(
    (m.shown?.attacks ?? []).map((a) => {
      const calc = a.auto && m.attackCtx;
      return { name: a.name, bonus: calc ? computeAttackBonus(a, calc) : a.bonus, damage: calc ? computeAttackDamage(a, calc) : a.damage };
    }),
  );
  const grouped = $derived(m.spellcasting ? groupedSpellcasting(m.spellcasting.state, m.spellcasting.lookup) : null);

  /** Mehrere Quellen derselben Klasse teilen SG und Angriff — eine Zeile je Wertepaar. */
  const casting = $derived.by(() => {
    const rows = new Map<string, { labels: string[]; saveDC: number | null; attackBonus: number | null }>();
    for (const src of grouped?.sources ?? []) {
      if (src.saveDC === null && src.attackBonus === null) continue;
      const row = rows.get(`${src.saveDC}|${src.attackBonus}`) ?? { labels: [], saveDC: src.saveDC, attackBonus: src.attackBonus };
      if (!row.labels.includes(src.label)) row.labels.push(src.label);
      rows.set(`${src.saveDC}|${src.attackBonus}`, row);
    }
    const legacy = m.spellcasting?.legacy.row;
    if (!rows.size && legacy) return [{ labels: [legacy.abilityDe], saveDC: legacy.saveDC, attackBonus: legacy.attackBonus }];
    return [...rows.values()];
  });

  const infoOf = (key: string, label: string): SpellInfo | undefined =>
    matchSpell(m.libs.spellIndex, { sourceKey: key || undefined, name: label });

  const spellLevels = $derived(
    spellsByLevel(
      [
        ...(grouped?.sources ?? []).flatMap((src) => src.quotas.flatMap((q) => q.spells)),
        ...(grouped?.extra ?? []),
        ...(m.spellcasting?.legacy.spells ?? []),
      ],
      infoOf,
    ),
  );

  const byLabel = $derived(
    new Map(spellLevels.flatMap((g) => g.spells).flatMap((s) => (s.info ? [[s.label, s.info] as const] : []))),
  );
  const hover = createSpellHover(() => byLabel, () => byLabel.keys());

  const isBonus = (s: string): boolean => /^[+-]\d+$/.test(s.trim());
</script>

<div class="table-block">
  <section>
    <h4>Passiv</h4>
    <div class="chips">
      {#each passives as p}<span class="chip"><b>{p.value}</b> {p.label}</span>{/each}
    </div>
  </section>

  {#if m.saves}
    <section>
      <h4>Rettungswürfe</h4>
      <div class="saves">
        {#each ABILITY_KEYS as k}
          {@const total = m.saves[k].total}
          <button class="save" class:prof={c.saveProfs[k]} title="Rettungswurf würfeln" onclick={() => rollNow(`W20${sign(total)}`)}>
            <span>{ABILITY_ABBR_DE[k]}</span><b>{sign(total)}</b>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if skills.length}
    <section>
      <h4>Geübte Fertigkeiten</h4>
      <div class="chips">
        {#each skills as d}
          <button class="chip roll" title="Probe würfeln" onclick={() => rollNow(`W20${sign(skillValue(d.key))}`)}>
            {d.label} <b>{sign(skillValue(d.key))}</b>{#if c.skills[d.key]?.exp}<span class="exp" title="Expertise">★</span>{/if}
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if attacks.length}
    <section>
      <h4>Angriffe</h4>
      <table>
        <tbody>
          {#each attacks as a}
            <tr>
              <td>{a.name}</td>
              <td>
                {#if isBonus(a.bonus)}<button class="roll" title="Angriffswurf" onclick={() => rollNow(`W20${a.bonus.trim()}`)}>{a.bonus}</button>
                {:else}{a.bonus}{/if}
              </td>
              <td>{a.damage}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  {#if casting.length || spellLevels.length}
    <section>
      <h4>Zauber</h4>
      {#each casting as s}
        <p class="line">
          {s.labels.join(', ')}{#if s.saveDC !== null} · <b>SG {s.saveDC}</b>{/if}{#if s.attackBonus !== null} · Angriff
            <button class="roll" title="Zauberangriff" onclick={() => rollNow(`W20${sign(s.attackBonus!)}`)}>{sign(s.attackBonus)}</button>{/if}
        </p>
      {/each}
      {#each spellLevels as g (g.level)}
        <p class="spell-row">
          <span class="lvl">{g.level === 0 ? 'Zaubertricks' : `Grad ${g.level}`}</span>
          {#each g.spells as sp (sp.label)}
            <span
              class="spell"
              style:color={SCHOOL_COLORS[sp.info?.school ?? ''] || null}
              role="note"
              onmouseenter={(e) => hover.show(e, sp.label)}
              onmousemove={(e) => hover.move(e)}
              onmouseleave={() => hover.hide()}
            >{sp.label}{#if sp.info?.concentration}<sup title="Konzentration">K</sup>{/if}</span>
          {/each}
        </p>
      {/each}
    </section>
  {/if}

  {#if m.defenses.length}
    <section>
      <h4>Resistenzen &amp; Immunitäten</h4>
      {#each m.defenses as d}<p class="line">{d.textDe} <span class="muted">({d.labelDe})</span></p>{/each}
    </section>
  {/if}

  {#if c.languages.length}
    <section>
      <h4>Sprachen</h4>
      <p class="line">{c.languages.join(', ')}</p>
    </section>
  {/if}
</div>

<SpellTooltip spell={hover.spell} x={hover.x} y={hover.y} />

<style>
  .spell-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.15rem 0.5rem;
    margin: 0.15rem 0 0;
    font-size: 0.82rem;
  }
  .lvl {
    min-width: 5.5rem;
    font-size: 0.7rem;
    color: var(--ink-muted);
  }
  .spell {
    cursor: help;
    border-bottom: 1px dotted currentColor;
  }
  .spell sup {
    margin-left: 0.1rem;
    font-size: 0.6rem;
  }
  .table-block {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0 1rem 0.8rem;
    font-size: 0.82rem;
  }
  h4 {
    margin: 0 0 0.25rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .chip {
    padding: 0.05rem 0.45rem;
    font-size: 0.78rem;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
  }
  .saves {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.25rem;
  }
  .save {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.15rem 0;
    font-size: 0.65rem;
    color: var(--ink-muted);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
  }
  .save b {
    font-size: 0.85rem;
    color: var(--ink);
  }
  .save.prof {
    border-color: var(--gold);
  }
  button.roll {
    cursor: pointer;
  }
  td button.roll,
  .line button.roll {
    padding: 0 0.3rem;
    font: inherit;
    color: var(--arcane);
    background: none;
    border: none;
    border-bottom: 1px dotted var(--arcane);
  }
  .exp {
    margin-left: 0.15rem;
    color: var(--gold);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  td {
    padding: 0.1rem 0.3rem 0.1rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  }
  .line {
    margin: 0;
  }
  .muted {
    color: var(--ink-muted);
    font-size: 0.75rem;
  }
</style>
