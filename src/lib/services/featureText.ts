/**
 * Der Merkmalstext für die Anzeige neben einer Frage: ohne die Absätze, die seine eigenen
 * Optionen ausbuchstabieren. Die gehören an die Option (Tooltip im Picker) — sonst stünden
 * über dem Auswahlfeld der Kampfüberlegenheit zwanzig Manöver.
 */
import type { DeclaredFeature } from './declaredFeature';

export interface FeatureNote {
  titleDe: string;
  text: string;
}

/** `**Wächter.**` wie `***Ambush.***` — beide Schreibweisen stehen im Vault. */
const BOLD_LEAD = /^\*{2,3}\s*(.+?)\s*[.:]?\s*\*{2,3}/;

const norm = (s: string): string => s.trim().toLowerCase().replace(/[.:]+$/, '');

const leadOf = (paragraph: string): string | null => {
  const m = BOLD_LEAD.exec(paragraph.trim());
  return m ? norm(m[1]) : null;
};

/**
 * Bis zum ERSTEN Options-Absatz, nicht filternd: die Optionen stehen am Stück am Ende, und
 * ein Absatz dazwischen („Rettungswürfe") gehört zum Merkmal, nicht zu einer Option.
 */
export function textWithoutOptions(desc: string, optionLabels: readonly string[] = []): string {
  const labels = new Set(optionLabels.map(norm).filter(Boolean));
  if (!labels.size) return desc.trim();

  const paragraphs = desc.split(/\n\s*\n/);
  const cut = paragraphs.findIndex((p) => {
    const lead = leadOf(p);
    return lead !== null && labels.has(lead);
  });
  return (cut < 0 ? paragraphs : paragraphs.slice(0, cut)).join('\n\n').trim();
}

/** Deutsch, wo der Vault es führt — der englische Text ist die Regel-, nicht die Anzeigeseite. */
export function featureNote(
  feature: Pick<DeclaredFeature, 'name' | 'nameDe' | 'desc' | 'descDe'> | undefined,
  optionLabels: readonly string[] = [],
): FeatureNote | null {
  if (!feature) return null;
  const text = textWithoutOptions(feature.descDe?.trim() || feature.desc?.trim() || '', optionLabels);
  return text ? { titleDe: feature.nameDe?.trim() || feature.name, text } : null;
}
