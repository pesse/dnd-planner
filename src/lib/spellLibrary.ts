/**
 * Lädt und cached den Zauber-Index aus vault/spells.
 * Stellt Suchfunktionen bereit inkl. Klassen-Filterung.
 */
import { invoke } from '@tauri-apps/api/core';

export interface SpellInfo {
  name: string;
  level: number;
  classes: string[];
  school: string;
  path: string;
}

/** Farbe pro Zauberschule (Catppuccin Mocha Palette) */
export const SCHOOL_COLORS: Record<string, string> = {
  abjuration:    'var(--steel)',
  conjuration:   'var(--green)',
  divination:    'var(--gold)',
  enchantment:   'var(--magenta)',
  evocation:     'var(--red)',
  illusion:      'var(--teal)',
  necromancy:    'var(--arcane)',
  transmutation: 'var(--copper)',
};

// Singleton-Cache
let cache: SpellInfo[] | null = null;
let loading: Promise<SpellInfo[]> | null = null;

export async function getSpellLibrary(): Promise<SpellInfo[]> {
  if (cache) return cache;
  if (!loading) {
    loading = invoke<SpellInfo[]>('load_spells_index', { path: './vault/spells' })
      .then(spells => { cache = spells; return spells; })
      .catch(() => { loading = null; return []; });
  }
  return loading;
}

/** Lädt die vollständigen Zauberdaten für einen bekannten Pfad. */
export async function loadSpellByPath(path: string): Promise<import('./types').Spell | null> {
  try {
    const content = await invoke<string>('read_file_content', { path });
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Deutsch → Englisch Klassenmapping für die Bibliotheks-Filterung.
 * Mehrere deutsche Varianten können auf denselben englischen Key zeigen.
 */
const CLASS_MAP: Record<string, string> = {
  'zauberer': 'wizard', 'magier': 'wizard',
  'kleriker': 'cleric', 'priester': 'cleric',
  'druide': 'druid',
  'barde': 'bard',
  'waldläufer': 'ranger', 'waldlaeufer': 'ranger',
  'hexenmeister': 'warlock',
  'paladin': 'paladin',
  'barbar': 'barbarian', 'barbar(in)': 'barbarian',
  'kämpfer': 'fighter', 'kaempfer': 'fighter',
  'schurke': 'rogue',
  'mönch': 'monk', 'moench': 'monk',
  'blutmagier': 'sorcerer', 'hexer': 'sorcerer', 'sorcerer': 'sorcerer',
};

/** Normalisiert einen Klassennamen auf den englischen Key oder gibt null zurück. */
export function resolveClass(germanClass: string): string | null {
  const key = germanClass.toLowerCase().trim();
  // Direkter Treffer
  if (CLASS_MAP[key]) return CLASS_MAP[key];
  // Teilstring-Treffer (z.B. "Zauberer Level 5" → "wizard")
  for (const [de, en] of Object.entries(CLASS_MAP)) {
    if (key.includes(de)) return en;
  }
  return null;
}

export interface SpellSuggestion {
  spell: SpellInfo;
  /** true = Zauber gehört zur Klasse des Charakters */
  inClass: boolean;
}

/**
 * Sucht Zauber nach Eingabetext.
 * @param query      Suchbegriff (mindestens 1 Zeichen)
 * @param levelFilter  null = alle (Zaubertricks), number = nur diese Stufe
 * @param spellClass   Zauberwirkerklasse des Charakters (Deutsch)
 * @param maxResults   Maximale Anzahl Vorschläge
 */
export function searchSpells(
  library: SpellInfo[],
  query: string,
  levelFilter: number | null,
  spellClass: string,
  maxResults = 10,
): SpellSuggestion[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const englishClass = spellClass ? resolveClass(spellClass) : null;

  const matches = library.filter(s => {
    if (levelFilter !== null && s.level !== levelFilter) return false;
    return s.name.toLowerCase().includes(q);
  });

  // Sortierung: Klassen-Treffer zuerst, dann alphabetisch
  matches.sort((a, b) => {
    const aIn = englishClass ? a.classes.includes(englishClass) : false;
    const bIn = englishClass ? b.classes.includes(englishClass) : false;
    if (aIn !== bIn) return aIn ? -1 : 1;
    // Exakter Prefix-Treffer bevorzugen
    const aStart = a.name.toLowerCase().startsWith(q);
    const bStart = b.name.toLowerCase().startsWith(q);
    if (aStart !== bStart) return aStart ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return matches.slice(0, maxResults).map(spell => ({
    spell,
    inClass: englishClass ? spell.classes.includes(englishClass) : true,
  }));
}
