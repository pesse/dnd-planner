/** Deklarierte Zuschläge und Vorteil auf Fertigkeitswürfe; Editor, Bogen und Druck rechnen damit. */
import type { CheckEffect } from '../schemas/abilityCheck';
import type { AbilityScores } from '../schemas/abilities';
import type { FeatureGrant } from '../schemas/grants';
import { SKILL_DEFS, type SkillDef } from '../domain/skills';
import type { Character } from '../schemas/characterSchema';
import { featureIdOf } from '../utils/text';
import { resolveSaveBonus } from './savingThrows';

export interface CheckSource {
  labelDe: string;
  effect: CheckEffect;
}

export interface SkillCheckEffects {
  rows: { labelDe: string; value: number }[];
  notes: string[];
  /** Vorteil ohne Bedingung — steht als „V" neben dem Wert. */
  advantage: boolean;
}

export function checkSources(features: readonly { key?: string; name: string; grants?: FeatureGrant }[]): CheckSource[] {
  const seen = new Set<string>();
  return features.flatMap((f) => {
    const id = featureIdOf(f);
    if (seen.has(id)) return [];
    seen.add(id);
    return (f.grants?.checks ?? []).map((effect) => ({ labelDe: f.name, effect }));
  });
}

const applies = (e: CheckEffect, def: Pick<SkillDef, 'en' | 'attr'>): boolean =>
  (!e.abilities.length && !e.skills.length) || e.abilities.includes(def.attr) || e.skills.includes(def.en);

export function skillCheckEffects(
  def: Pick<SkillDef, 'en' | 'attr'>,
  sources: readonly CheckSource[],
  ctx: { mods: AbilityScores; profBonus: number },
): SkillCheckEffects {
  const out: SkillCheckEffects = { rows: [], notes: [], advantage: false };
  for (const { labelDe, effect } of sources) {
    if (!applies(effect, def)) continue;
    if (effect.kind === 'bonus') {
      out.rows.push({ labelDe, value: resolveSaveBonus(effect.value, ctx.mods, ctx.profBonus) });
      continue;
    }
    const when = effect.conditionDe?.trim() || effect.condition?.trim();
    out.notes.push(`Vorteil (${labelDe})${when ? `: ${when}` : ''}`);
    if (!when) out.advantage = true;
  }
  return out;
}

type SkillRows = Character['skills'];

/**
 * Der eine Rechenweg für Fertigkeitswerte. Der Bogen rechnet ihn ebenfalls, statt `value` aus der
 * Datei zu lesen: ein Stufenaufstieg im Karte-Tab ändert Übungen ohne das Formular, das sonst
 * nachrechnet, und gespeichert wird dann der alte Wert.
 */
export function skillValues(
  c: { skills: SkillRows; alleskoenner: boolean },
  checks: readonly CheckSource[],
  ctx: { mods: AbilityScores; profBonus: number },
): SkillRows {
  const out: SkillRows = { ...c.skills };
  for (const def of SKILL_DEFS) {
    const { prof = false, exp = false } = c.skills[def.key] ?? {};
    const pb = ctx.profBonus;
    const profPart = exp ? pb * 2 : prof ? pb : c.alleskoenner ? Math.floor(pb / 2) : 0;
    const bonus = skillCheckEffects(def, checks, ctx).rows.reduce((n, r) => n + r.value, 0);
    out[def.key] = { value: (ctx.mods[def.attr] ?? 0) + profPart + bonus, prof, exp };
  }
  return out;
}
