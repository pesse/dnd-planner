/**
 * Der Katalog dessen, was in den Kampagnenausdruck kann: die Kampagnenseite und je ein
 * Eintrag pro Akt. Die Id eines Aktes ist sein Verzeichnisname, damit die Auswahl ein
 * Neuladen und Umsortieren übersteht.
 */
import type { CampaignPrintData } from './data';

export interface CampaignPrintSection {
  id: string;
  label: string;
  markdown: string;
}

export const CAMPAIGN_SECTION_ID = 'campaign';

export function campaignSections(d: CampaignPrintData): CampaignPrintSection[] {
  const intro = d.intro.trim()
    ? [{ id: CAMPAIGN_SECTION_ID, label: 'Kampagnenseite', markdown: d.intro }]
    : [];
  return [...intro, ...d.acts.map((a) => ({ id: a.dir, label: a.title, markdown: a.markdown }))];
}

export const defaultSelection = (sections: CampaignPrintSection[]): Record<string, boolean> =>
  Object.fromEntries(sections.map((s) => [s.id, true]));
