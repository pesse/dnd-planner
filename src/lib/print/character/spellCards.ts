/**
 * Die Zauberkarten des Bogens. Sie messen ihre Textmenge im DOM aus (`utils/printSpell.ts`),
 * entstehen deshalb hier beim Laden des Bündels und nicht in den reinen Sektions-Bauern.
 */
import type { GroupedSpellcasting } from '$lib/services/spellcasting/grouped';
import type { ProjectionLookup } from '$lib/services/spellcasting/project';
import { loadSpellByPath } from '$lib/spellLibrary';
import type { Spell } from '$lib/types';
import { spellCardPages } from '$lib/utils/printSpell';

/** Der Klassenname, unter dem `css/cards.ts` das 3×3-Raster setzt. */
const CARDS_PAGE_CLASS = 'cards';

/** Jeder Zauber des Bogens einmal, in derselben Ordnung wie die Liste: erst Grad, dann Name. */
function orderedKeys(g: GroupedSpellcasting): string[] {
  const seen = new Map<string, { label: string; level: number }>();
  for (const source of g.sources)
    for (const quota of source.quotas)
      for (const s of quota.spells) if (!seen.has(s.key)) seen.set(s.key, s);
  for (const s of g.extra) if (!seen.has(s.key)) seen.set(s.key, s);

  return [...seen]
    .sort(([, a], [, b]) => a.level - b.level || a.label.localeCompare(b.label, 'de'))
    .map(([key]) => key);
}

export async function loadSpellCardPages(
  g: GroupedSpellcasting,
  lookup: ProjectionLookup,
  doc: Document,
): Promise<string> {
  const spells: Spell[] = [];
  for (const key of orderedKeys(g)) {
    const path = lookup.spell(key)?.path;
    const spell = path ? await loadSpellByPath(path).catch(() => null) : null;
    if (spell) spells.push(spell);
  }
  return spells.length ? spellCardPages(spells, doc, CARDS_PAGE_CLASS) : '';
}
