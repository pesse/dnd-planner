/** Fallenwerte als deutsche Kurzzeilen — für Bibliothekskarte und Kampfkarte gleich. */
import { ABILITY_ABBR_DE, ABILITY_LABEL } from '../schemas/abilities';
import type { Trap, TrapCheck, TrapDamage, TrapTier } from '../schemas/trap';
import { skillLabelDe } from '../domain/skills';
import { DAMAGE_TYPE_LABELS } from '../itemLabels';
import { parsePool, poolDe } from '../utils/dice';

export function checkDe(c: TrapCheck): string {
  const what = c.skill ? skillLabelDe(c.skill) : c.ability ? ABILITY_LABEL[c.ability] : 'Wurf';
  const note = c.noteDe || c.note;
  return `${what} SG ${c.dc}${note ? ` (${note})` : ''}`;
}

export const formulaDe = (dice: string): string => {
  const pool = parsePool(dice);
  return pool ? poolDe(pool) : dice;
};

export const damageDe = (damage: TrapDamage[]): string =>
  damage.map((d) => `${formulaDe(d.dice)} ${DAMAGE_TYPE_LABELS[d.type]}`).join(' + ');

/** Alle Schadenswürfel als ein Wurf für die Würfel-Box; leer ohne Schaden. */
export const damageFormula = (damage: TrapDamage[]): string => damage.map((d) => formulaDe(d.dice)).join(' + ');

export const saveDe = (save: NonNullable<Trap['save']>, dc = save.dc): string => `RW ${ABILITY_ABBR_DE[save.ability]} SG ${dc}`;

/** Grundwerte und höhere Stufen als eine Liste, damit die Kampfkarte die passende Stufe wählen kann. */
export function trapTiers(trap: Trap): TrapTier[] {
  const base: TrapTier = { levels: trap.levels, saveDc: trap.save?.dc, damage: trap.damage };
  return [base, ...trap.tiers];
}
