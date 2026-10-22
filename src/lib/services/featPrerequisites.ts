/**
 * Prüft die englische `prerequisite` eines Talents („Level 4+, Strength or Dexterity 13+",
 * „Spellcasting Feature") gegen den Charakter.
 */
import { abilityKeyOf, type AbilityKey } from '$lib/schemas/abilities';

export interface FeatPrereqContext {
  level: number;
  ability: (k: AbilityKey) => number;
  spellcasting: boolean;
  fightingStyle: boolean;
}

const LEVEL_RE = /^level (\d+)\+?$/;
const ABILITY_RE = /^([a-z ]+?) (\d+)\+?$/;

function clauseMet(clause: string, ctx: FeatPrereqContext): boolean {
  const c = clause.trim().toLowerCase();
  const level = LEVEL_RE.exec(c);
  if (level) return ctx.level >= Number(level[1]);
  if (c === 'spellcasting feature' || c === 'pact magic feature' || c === 'spellcasting or pact magic feature') return ctx.spellcasting;
  if (c === 'fighting style feature') return ctx.fightingStyle;
  const ability = ABILITY_RE.exec(c);
  if (ability) {
    const keys = ability[1].split(' or ').map(abilityKeyOf);
    if (keys.every((k) => k)) return keys.some((k) => ctx.ability(k!) >= Number(ability[2]));
  }
  // Freitext, den diese Prüfung nicht versteht (Homebrew), sperrt nichts — der Spieler entscheidet.
  return true;
}

export const featPrereqMet = (prerequisite: string | undefined, ctx: FeatPrereqContext): boolean =>
  (prerequisite ?? '').split(',').filter((c) => c.trim()).every((c) => clauseMet(c, ctx));
