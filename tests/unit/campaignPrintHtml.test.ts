import { describe, it, expect } from 'vitest';
import { buildCampaignHtml } from '../../src/lib/print/campaign/document';
import { campaignSections, defaultSelection } from '../../src/lib/print/campaign/sections';
import type { CampaignPrintData } from '../../src/lib/print/campaign/data';

const data: CampaignPrintData = {
  campaignName: 'Zwei Reisende',
  intro: '---\ncharacters:\n  - abc123\n---\n# Zwei Reisende\n\nEine Reise.\n',
  acts: [
    { dir: 'akt-i', title: 'Akt I', markdown: '# Akt I\n\nDer Angriff beginnt.\n' },
    { dir: 'akt-ii', title: 'Akt II', markdown: '# Akt II\n\nKrieg im Inneren.\n' },
  ],
};

const all = defaultSelection(campaignSections(data));

describe('buildCampaignHtml', () => {
  it('nimmt standardmäßig Kampagnenseite und alle Akte', () => {
    const html = buildCampaignHtml(data, all);
    expect(html).toContain('Eine Reise.');
    expect(html).toContain('Der Angriff beginnt.');
    expect(html).toContain('Krieg im Inneren.');
  });

  it('lässt abgewählte Teile weg', () => {
    const html = buildCampaignHtml(data, { ...all, 'akt-i': false });
    expect(html).not.toContain('Der Angriff beginnt.');
    expect(html).toContain('Krieg im Inneren.');
  });

  it('hält die Reihenfolge der Akte', () => {
    const html = buildCampaignHtml(data, all);
    expect(html.indexOf('Der Angriff beginnt.')).toBeLessThan(html.indexOf('Krieg im Inneren.'));
  });

  it('setzt je Teil einen Umbruch-Container', () => {
    expect(buildCampaignHtml(data, all).match(/<div class="part">/g)).toHaveLength(3);
    expect(buildCampaignHtml(data, { ...all, 'akt-i': false, 'akt-ii': false })
      .match(/<div class="part">/g)).toHaveLength(1);
  });

  it('druckt das Frontmatter nicht mit', () => {
    const html = buildCampaignHtml(data, all);
    expect(html).not.toContain('abc123');
  });

  it('bietet ohne Kampagnentext nur die Akte an', () => {
    const sections = campaignSections({ ...data, intro: '   ' });
    expect(sections.map((s) => s.id)).toEqual(['akt-i', 'akt-ii']);
  });
});
