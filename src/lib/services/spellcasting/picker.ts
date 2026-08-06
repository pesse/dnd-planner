/**
 * Was ein Zauber-Picker über EIN Kontingent wissen muss. Editor und Wizard fragen hier —
 * zwei Fassungen böten im selben Kontingent verschiedene Zauber an.
 */
import type { SpellInfo } from '$lib/spellLibrary';
import type { GroupedSpellcasting, SpellQuotaGroup } from './grouped';
import { knownSpellGroups, knownSpells, quotaGroupId, type KnownSpells } from './known';

/** Ohne Gradschranke steht die ganze Bibliothek zur Wahl. */
export const pickLevels = (quota: SpellQuotaGroup): number[] =>
  quota.levels.length ? quota.levels : Array.from({ length: 10 }, (_, i) => i);

/**
 * Ist der Pool eine andere Quota (Vorbereitung aus dem Zauberbuch), darf der Dialog NUR
 * deren Zauber anbieten — die Klassenliste wäre die falsche Menge. Der Schul-Filter gilt
 * zusätzlich: „Hervorrufungszauber" ist eine Schranke des Pools, keine Empfehlung.
 */
export function pickLibrary(quota: SpellQuotaGroup, library: SpellInfo[]): SpellInfo[] {
  let out = library;
  if (quota.from) {
    const keys = new Set(quota.from.spells.map((s) => s.key));
    out = out.filter((s) => s.key && keys.has(s.key));
  }
  if (quota.schools.length) {
    const schools = quota.schools as string[];
    out = out.filter((s) => schools.includes(s.school));
  }
  return out;
}

/**
 * Das eigene Kontingent ist nicht „schon bekannt", und speist es sich aus einem anderen
 * (Vorbereitung aus dem Zauberbuch), gilt das für dessen Zauber genauso — sonst wäre im
 * Vorbereitungs-Dialog jede Option ausgegraut.
 */
export function pickerKnown(view: GroupedSpellcasting, quota: SpellQuotaGroup): KnownSpells {
  const exclude = [quotaGroupId(quota.sourceId, quota.quotaId)];
  if (quota.from) exclude.push(quotaGroupId(quota.from.sourceId, quota.from.quotaId));
  return knownSpells(knownSpellGroups(view), exclude);
}
