/** Vorschläge für die Sprachen- und Werkzeug-Chips im Charakter-Editor. Freitext bleibt erlaubt. */
import { COMMON_LANGUAGE, RARE_LANGUAGES, STANDARD_LANGUAGES } from './wizard/personal';
import { toolsOfCategory, type ItemInfo } from '../itemLibrary';
import { toolLabel } from './declaration/toolProficiency';

export interface TagSuggestion {
  value: string;
  hint?: string;
}

const LANGUAGE_SUGGESTIONS: TagSuggestion[] = [
  { value: COMMON_LANGUAGE, hint: 'Standard' },
  ...STANDARD_LANGUAGES.map((value) => ({ value, hint: 'Standard' })),
  ...RARE_LANGUAGES.map((value) => ({ value, hint: 'Selten' })),
];

/** Leere Eingabe zeigt die ganze Liste — sie ist kurz genug zum Durchblättern. */
function filterByQuery(all: readonly TagSuggestion[], query: string): TagSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...all];
  return all
    .filter((s) => s.value.toLowerCase().includes(q))
    .sort((a, b) => {
      const as = a.value.toLowerCase().startsWith(q), bs = b.value.toLowerCase().startsWith(q);
      return as === bs ? a.value.localeCompare(b.value, 'de') : as ? -1 : 1;
    });
}

export const suggestLanguages = (query: string): TagSuggestion[] => filterByQuery(LANGUAGE_SUGGESTIONS, query);

/** Labels wie bei der Werkzeug-Wahl in Wizard und Stufenaufstieg — dieselbe Schreibweise landet auf dem Bogen. */
export function toolSuggestions(tools: readonly ItemInfo[]): TagSuggestion[] {
  const artisan = new Set(toolsOfCategory(tools, 'artisan-tools'));
  return tools
    .map((t) => ({ value: toolLabel(t), hint: artisan.has(t) ? 'Handwerkszeug' : undefined }))
    .sort((a, b) => a.value.localeCompare(b.value, 'de'));
}

export const suggestTools = (all: readonly TagSuggestion[], query: string): TagSuggestion[] =>
  filterByQuery(all, query);
