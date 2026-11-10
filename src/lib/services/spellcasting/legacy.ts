/**
 * Übergang von der alten Zauber-Persistenz: fällt mit der letzten Datei, die `spells` trägt
 * (der Umzug dorthin ist `spellsFix` in `services/characterLegacyLinks.ts`).
 */
import type { CharacterSpells } from '$lib/schemas/characterSchema';
import type { CharacterSpellcasting } from '$lib/schemas/spellcasting';
import type { LegacySheetInput, LooseSpell, ProjectionLookup } from './project';
import { cloneSpellcasting } from './write';

/**
 * ÜBERGANG für Dateien vor dem Umzug: aus dem gespeicherten `spells`-Block entstehen
 * Platz-Verbrauch, Kopfzeile und die quellenlosen Zauber — alles, was noch keiner Quota
 * zugeordnet ist. `spellsFix` schreibt genau das fest. Das Zauberattribut ist NICHT dabei: es
 * steht im Merkmals-Ledger, und `resolve.ts` trägt es in die Quelle ein.
 */
export function legacySpellcasting(
  c: { spellcasting?: CharacterSpellcasting; spells?: CharacterSpells },
  derivedSlots: number[],
  lookup: ProjectionLookup,
): { stored: CharacterSpellcasting; sheet: LegacySheetInput } {
  const spells = c.spells;
  // Additiv über den gespeicherten Block: ein Aufstieg schreibt noch die Altform, und ein
  // „neue Form gewinnt" ließe seine Zauber verschwinden.
  const stored: CharacterSpellcasting = c.spellcasting ? cloneSpellcasting(c.spellcasting) : { sources: {} };

  // Nur wo die Progression nichts hergibt (unverlinkte Klasse).
  if (!derivedSlots.some((n) => n > 0) && (spells?.slots ?? []).some((s) => s.total > 0) && !stored.manual?.slotTotals.length)
    stored.manual = { slotTotals: (spells?.slots ?? []).map((s) => s.total), extra: stored.manual?.extra ?? [] };

  const picked = new Set(
    Object.values(stored.sources).flatMap((s) => Object.values(s.picks).flat()),
  );
  const looseSpells: LooseSpell[] = [];
  const add = (ref: { name: string; sourceKey?: string }, level: number, prepared: boolean): void => {
    const info = (ref.sourceKey ? lookup.spell(ref.sourceKey) : undefined) ?? lookup.spellByName(ref.name);
    if (info?.key && picked.has(info.key)) return;
    looseSpells.push({ key: info?.key ?? '', label: info?.name ?? ref.name, level, prepared });
  };
  for (const ref of spells?.cantrips ?? []) add(ref, 0, true);
  for (const [level, entries] of Object.entries(spells?.byLevel ?? {}))
    for (const entry of entries) add(entry, Number(level) || 0, entry.prepared);

  return { stored, sheet: { row: legacyRow(spells), spells: looseSpells } };
}

/** Klasse, Attribut und Werte, wie sie in der Datei stehen — Freitext, ungerechnet. */
function legacyRow(spells: CharacterSpells | undefined): LegacySheetInput['row'] {
  const label = spells?.spellcastingClass.trim() ?? '';
  const ability = spells?.spellcastingAbility.trim() ?? '';
  if (!label && !ability) return null;
  return {
    id: '',
    kind: 'class',
    label,
    abilityDe: ability,
    saveDC: spells?.saveDC || null,
    attackBonus: spells?.attackBonus || null,
    abilityOptionsDe: [],
  };
}
