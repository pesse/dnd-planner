/**
 * D&D-Beyond-Statblock → Open5e-Rohform → Vault-Monster. Der Statblock ist erfunden, trägt aber
 * die Markup-Eigenheiten der gespeicherten MM-Seiten, an denen der Parser schon gescheitert ist.
 */
import { describe, it, expect } from 'vitest';
import { parseStatBlock, statBlockHtml } from '../../scripts/mm/statBlocks';
import { mapOpen5eCreature } from '../../src/lib/services/open5eCreatureMapper';

const PAGE = `<p>Intro</p>
<div class="stat-block"><h3><a href="#x"></a><a>Test Lurker</a></h3>
<p>Large Aberration, Chaotic Evil</p>
<p><strong>AC</strong> 15 <strong>Initiative</strong> +2 (12)</p>
<p><strong>HP</strong> 52 (8d10 + 8)</p>
<p><strong>Speed</strong> 30 ft., Fly 40 ft. (hover)</p>
<div class="stats"><table><tbody>
<tr><th>Str</th><td>16</td><td>+3</td><td>+3</td></tr><tr><th>Dex</th><td>14</td><td>+2</td><td>+2</td></tr>
<tr><th>Con</th><td>12</td><td>+1</td><td>+4</td></tr><tr><th>Int</th><td>8</td><td>−1</td><td>−1</td></tr>
<tr><th>Wis</th><td>10</td><td>+0</td><td>+0</td></tr><tr><th>Cha</th><td>6</td><td>−2</td><td>−2</td></tr>
</tbody></table></div>
<p><strong>Immunities</strong> Poison; Charmed (with Mind Blank), Poisoned</p>
<p><strong>Gear</strong> Chain Mail, Spear</p>
<p><strong>Senses</strong> Darkvision 60 ft.; Passive Perception 10</p>
<p><strong>Languages</strong> Primordial (Aquan, Terran), Common</p>
<p><strong>CR</strong> 3 (XP 700; PB +2)</p>
<p class="monster-header">Traits</p>
<p><strong><em>Lightning Absorption</em></strong>. Whenever the lurker is subjected to Lightning damage, it regains Hit Points.</p>
<p class="monster-header">Actions</p>
<p><strong><em>Claw.</em></strong> <em>Melee Attack Roll:</em> +5, reach 10 ft. <em>Hit:</em> 10 (2d6 + 3) Slashing damage plus 3 (1d6) Acid damage.</p>
<p><strong><em>Eye Rays.</em></strong> The lurker shoots one ray (roll 1d4):</p>
<ol><li><strong>Fear Ray.</strong> <em>Wisdom Saving Throw:</em> DC 12. <em>Failure:</em> Frightened.</li>
<li><strong>Sleep Ray.</strong> <em>Wisdom Saving Throw:</em> DC 12. <em>Failure:</em> Unconscious.</li></ol>
<p><strong><em>Toxic Breath (Recharge</em></strong> 5–6). <em>Constitution Saving Throw:</em> DC 12.</p>
</div><p>Outro</p>`;

const parse = () => parseStatBlock(statBlockHtml(PAGE)[0]);

describe('parseStatBlock', () => {
  it('schneidet genau den Statblock samt verschachtelter Divs aus', () => {
    const [block] = statBlockHtml(PAGE);
    expect(block).toContain('Toxic Breath');
    expect(block).not.toContain('Outro');
  });

  it('hängt <li>-Listen als Markdown-Unterpunkte an den Eintrag davor', () => {
    const rays = parse().raw.actions as { name: string; desc: string }[];
    expect(rays[1].desc).toBe(
      'The lurker shoots one ray (roll 1d4):\n\n'
      + '- **Fear Ray:** Wisdom Saving Throw: DC 12. Failure: Frightened.\n'
      + '- **Sleep Ray:** Wisdom Saving Throw: DC 12. Failure: Unconscious.',
    );
  });

  it('lässt den Punkt hinter einem Namen außerhalb von <em> nicht im Text stehen', () => {
    const traits = parse().raw.traits as { name: string; desc: string }[];
    expect(traits[0]).toEqual({ name: 'Lightning Absorption', desc: 'Whenever the lurker is subjected to Lightning damage, it regains Hit Points.' });
  });

  it('teilt Sprachen nicht innerhalb von Klammern', () => {
    expect(mapOpen5eCreature(parse().raw).languages).toEqual(['Primordial (Aquan, Terran)', 'Common']);
  });

  it('macht Aufladung, Angriff und Abwehr-Zusätze zu Feldern', () => {
    const { raw, gear, defenseNotes } = parse();
    const monster = mapOpen5eCreature(raw);
    const breath = monster.actions.find((a) => a.name_en === 'Toxic Breath');
    expect(breath?.usage_limits).toEqual({ type: 'RECHARGE_ON_ROLL', param: 5 });
    expect(monster.actions[0].attacks[0]).toMatchObject({ to_hit_mod: 5, reach: 10 });
    expect(monster.condition_immunities).toEqual(['charmed', 'poisoned']);
    expect(defenseNotes).toEqual(['Charmed (with Mind Blank)']);
    expect(gear).toEqual(['Chain Mail', 'Spear']);
    expect(monster.saving_throws).toMatchObject({ con: 4 });
  });
});
