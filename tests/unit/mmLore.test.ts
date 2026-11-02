/**
 * D&D-Beyond-Kapitelseite → Familien-Beschreibung als Markdown. Die Seite ist erfunden, trägt aber
 * die Markup-Eigenheiten der gespeicherten MM-Seiten.
 */
import { describe, it, expect } from 'vitest';
import { loreFamilies } from '../../scripts/mm/lore';

const stat = (name: string) => `<div class="stat-block"><h3><a href="#x"></a>${name}</h3><div class="stats"><p>AC 12</p></div></div>`;

const PAGE = `<header><h2>Monsters (T)</h2></header>
<div class="p-article-content u-typography-format">
<h2 class="compendium-hr monster-with-metadata heading-anchor" id="Lurkers"><a href="#Lurkers" aria-hidden="true"></a>Test Lurkers</h2>
<p>Hungry Shadows of the Deep</p>
<p class="treasure-habitat"><strong>Habitat:</strong> Underdark; <strong>Treasure:</strong> <a href="#r">Relics</a></p>
<figure><img src="x.png"><figcaption>Ignorieren</figcaption></figure>
<div class="flexible-double-column"><div><p>Lurkers wait in the dark and cast <a class="spell-tooltip" href="#s">Darkness</a> on <em>anyone</em>.</p></div></div>
<div class="table-overflow-wrapper"><table><caption><h3 id="LurkerMoods">Lurker Moods</h3></caption>
<thead><tr><th>1d2</th><th>The Lurker...</th></tr></thead>
<tbody><tr><td>1</td><td>Sulks | broods.</td></tr><tr><td>2</td><td>Hunts.</td></tr></tbody></table></div>
<h3 id="LurkerLairs">Lurker Lairs</h3>
<p><strong>Gloom.</strong> Light dims within 1 mile.</p>
<h3 id="LesserLurker">Lesser Lurker</h3>
<p>Lesser lurkers hunt in packs.</p>
${stat('Lesser Lurker')}
<aside class="monster-lore"><p>“It ate my lantern.”</p><p>—Bram, Miner</p></aside>
${stat('Lurker Tyrant')}
<h2 class="compendium-hr monster-with-metadata heading-anchor" id="Single">Single</h2>
<p>One of a Kind</p>
<p class="treasure-habitat"><strong>Habitat:</strong> Any; <strong>Treasure:</strong> None</p>
<p>Only one stat block.</p>
${stat('Single')}
</div>
<footer class="p-article-footer"><p>Footer</p></footer>`;

describe('loreFamilies', () => {
  const [lurkers, single] = loreFamilies(PAGE);

  it('liest Kopf und Metadaten jeder Familie', () => {
    expect(lurkers).toMatchObject({ name: 'Test Lurkers', tagline: 'Hungry Shadows of the Deep', habitat: 'Underdark', treasure: 'Relics' });
    expect(single).toMatchObject({ name: 'Single', tagline: 'One of a Kind', habitat: 'Any', treasure: 'None' });
  });

  it('ordnet die Einleitung unter einem h3 dem folgenden Statblock zu', () => {
    expect(lurkers.monsters).toEqual([
      { statBlock: 'Lesser Lurker', intro: 'Lesser lurkers hunt in packs.' },
      { statBlock: 'Lurker Tyrant', intro: '' },
    ]);
    expect(single.monsters).toEqual([{ statBlock: 'Single', intro: '' }]);
  });

  it('setzt Fließtext, Tabellen, Abschnitte und Zitate als Markdown zusammen', () => {
    expect(lurkers.intro).toBe(
      [
        'Lurkers wait in the dark and cast Darkness on *anyone*.',
        '**Lurker Moods**\n\n| 1d2 | The Lurker... |\n| --- | --- |\n| 1 | Sulks \\| broods. |\n| 2 | Hunts. |',
        '### Lurker Lairs',
        '**Gloom.** Light dims within 1 mile.',
        '> “It ate my lantern.”\n>\n> —Bram, Miner',
      ].join('\n\n'),
    );
    expect(single.intro).toBe('Only one stat block.');
  });
});
