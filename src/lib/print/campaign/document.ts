/**
 * Gewählte Teile → ein eigenständiges HTML-Dokument. Genau dieser String steht in der
 * Vorschau und geht an `printHtmlDocument`.
 */
import { buildPrintHtmlMarkdown } from '../../utils/printEncounter';
import { renderMarkdown } from '../../utils/markdown';
import { stripFrontmatter } from '../../utils/frontmatter';
import { campaignSections } from './sections';
import type { CampaignPrintData } from './data';

export function buildCampaignHtml(d: CampaignPrintData, selection: Record<string, boolean>): string {
  const body = campaignSections(d)
    .filter((s) => selection[s.id] !== false)
    .map((s) => `<div class="part">${renderMarkdown(stripFrontmatter(s.markdown))}</div>`)
    .join('');
  return buildPrintHtmlMarkdown(d.campaignName, body);
}
