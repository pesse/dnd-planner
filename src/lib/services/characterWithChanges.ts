/**
 * Ein Change-Set auf eine Kopie des Charakters — der Editor-Swap und die Vorschau des
 * Stufenaufstiegs rechnen hier denselben Endstand.
 */
import { parseCharacter } from '../utils/schemaValidation';
import { formatClassLevel } from '../schemas/classLevelText';
import { applyChanges, type ApplyContext } from './applyChanges';
import { proficiencyBonus } from './classProgression';
import type { Character } from '../schemas/characterSchema';
import type { Change } from '../schemas/levelUp';
import type { LevelUpDelta } from './levelUp';

/** `base` muss ein schlichtes Objekt sein (`$state.snapshot`) — `structuredClone` scheitert an Proxys. */
export function characterWithChanges(base: Character, changes: readonly Change[], ctx: ApplyContext, delta?: LevelUpDelta): Character {
  const next = structuredClone(base);
  if (delta) applyLevelStructure(next, delta);
  applyChanges(next, changes, delta ? { ...ctx, classIndex: delta.classIndex, isNewClass: delta.isNewClass } : ctx);
  if (delta) next.classLevel = formatClassLevel(next.classes);

  const r = parseCharacter(next);
  return r.ok ? r.data : next;
}

/** Nicht additiv, anders als das `changeSet`: Klassenstufe und Multiclass sind Identität. */
function applyLevelStructure(next: Character, delta: LevelUpDelta): void {
  if (delta.isNewClass) {
    next.classes.push({ sourceKey: delta.sourceKey, name: delta.klasseName, level: delta.toLevel });
  } else {
    const cls = next.classes[delta.classIndex];
    if (cls) cls.level = delta.toLevel;
  }
  // Sicherheitsnetz; das `changeSet` setzt den Übungsbonus ebenso.
  if (next.proficiencyBonus !== undefined) next.proficiencyBonus = proficiencyBonus(delta.newTotalLevel);
}
