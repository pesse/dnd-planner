/**
 * Ein Regelbegriff aus einem Regelglossar (SRD, PHB, DMG, Eberron oder eigenes Material),
 * zweisprachig wie Talente. Regeltexte verweisen darauf als `[Name](rule:<key>)`.
 */
import { z } from 'zod';
import { sourceField } from './source';

/** Die Klammer-Tags des SRD-Glossars („Blind (Zustand)"); `rule` = ohne Tag. */
export const RULE_CATEGORIES = ['rule', 'condition', 'action', 'area_of_effect', 'hazard', 'attitude'] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

export const RULE_CATEGORY_DE: Record<RuleCategory, string> = {
  rule: 'Regel',
  condition: 'Zustand',
  action: 'Aktion',
  area_of_effect: 'Wirkungsbereich',
  hazard: 'Gefahr',
  attitude: 'Einstellung',
};

export const ruleSchema = z.object({
  key: z.string().describe('{source}_{slug(name)}, z.B. "srd-2024_heroic-inspiration".'),
  source: sourceField(),
  name: z.string().describe('Englischer Begriff in SRD-Schreibweise.'),
  nameDe: z.string().optional(),
  category: z.enum(RULE_CATEGORIES).default('rule'),
  desc: z.string().default(''),
  descDe: z.string().optional(),
});

export type Rule = z.infer<typeof ruleSchema>;
