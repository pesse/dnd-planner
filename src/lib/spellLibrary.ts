/** Lädt und cached den Zauber-Index aus `vault/spells`, inkl. Klassen-Filterung. */
import { invoke } from '@tauri-apps/api/core';
import { normName, slugKeepUmlauts } from './utils/text';
import { buildNameIndex, matchByRef, type NameIndex } from './services/library/nameIndex';
import { memoOnce } from './services/library/memo';
import { OWN_SOURCE } from './schemas/source';
import type { Spell } from './types';

export function blankSpell(name: string, level = 1, school = 'evocation', nameEn = ''): Spell {
  return {
    name: name || 'Neuer Zauber', name_en: nameEn.trim() || undefined, level, school: school as Spell['school'],
    casting_time: '1 Aktion', range: '9 Meter',
    components: { verbal: true, somatic: false, material: false, materials_needed: null },
    duration: 'Unmittelbar', concentration: false, ritual: false,
    classes: [], desc: [''], source: OWN_SOURCE,
  };
}

export interface SpellInfo {
  name: string;
  /** Kanonischer englischer SRD-Name (für EN↔DE-Matching); leer, wenn nicht hinterlegt. */
  name_en?: string;
  /** Bei Zaubern meist leer — die Identität ist der Name. */
  key?: string;
  level: number;
  classes: string[];
  school: string;
  path: string;
}

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

const index = memoOnce(() =>
  invoke<SpellInfo[]>('load_spells_index', { path: './vault/spells' }).catch(() => [] as SpellInfo[]),
);

export const getSpellLibrary = index.get;
export const invalidateSpellLibrary = index.invalidate;

// school (englisch im JSON) → Ordnername (deutsch im Vault); auch in SpellCard.svelte.
const SPELL_SCHOOL_DIR: Record<string, string> = {
  abjuration: 'bannmagie', conjuration: 'beschwörung', divination: 'erkenntnismagie',
  enchantment: 'verzauberung', evocation: 'hervorrufung', illusion: 'illusionsmagie',
  necromancy: 'nekromantie', transmutation: 'verwandlung',
};

/**
 * Ohne CardEditor, für die Inline-Anlage im Stufenaufstieg: entwertet danach den Cache und
 * lädt neu, damit der Zauber sofort auflöst.
 */
export async function createSpellInline(spell: Spell): Promise<string> {
  const dir = SPELL_SCHOOL_DIR[spell.school] ?? 'hervorrufung';
  const name = (spell.name || 'Neuer Zauber').trim();
  const slug = slugKeepUmlauts(name);
  const path = `./vault/spells/${dir}/${slug}.json`;
  // Ohne `key` wäre der Zauber am Charakter nicht verlinkbar (Picks tragen nur Keys) — derselbe
  // Slug wie im Dateipfad, damit beide zusammen eindeutig bleiben.
  await invoke('write_file_content', { path, content: JSON.stringify({ ...spell, name, key: `${OWN_SOURCE}_${slug}` }, null, 2) });
  invalidateSpellLibrary();
  await getSpellLibrary();
  return name;
}

export function spellInfoByKey(library: SpellInfo[], key: string): SpellInfo | undefined {
  return key ? library.find((s) => s.key === key) : undefined;
}

export async function loadSpellByPath(path: string): Promise<import('./types').Spell | null> {
  try {
    const content = await invoke<string>('read_file_content', { path });
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * **Zauberer = sorcerer, Magier = wizard**; maßgeblich ist `DE_TO_SLUG` in
 * `services/classProgression.ts`. Die Verwechslung filtert die Zauberauswahl eines
 * Zauberers auf die Magier-Liste.
 */
const CLASS_MAP: Record<string, string> = {
  'magier': 'wizard',
  'zauberer': 'sorcerer', 'blutmagier': 'sorcerer', 'hexer': 'sorcerer',
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
};

/**
 * Die Namen für den Teilstring-Pass, LÄNGSTE zuerst: „Blutmagier Stufe 3" enthält auch
 * „magier", und in Einfügereihenfolge gewinnt sonst der kürzere, falsche Treffer.
 */
const CLASS_NAMES_BY_LENGTH: [string, string][] = Object.entries(CLASS_MAP).sort(
  (a, b) => b[0].length - a[0].length,
);

const ENGLISH_CLASS_KEYS = new Set(Object.values(CLASS_MAP));

/**
 * 2024 benennt manche Zauberlisten nach der Tradition statt nach der Klasse — der
 * Hintergrund „Kundschafter" gewährt „Magic Initiate (Primal)". Nur EXAKT gematcht, nicht
 * als Teilstring: „Divine Soul Sorcerer" darf nicht zum Kleriker werden.
 */
const TRADITION_MAP: Record<string, string> = {
  arcane: 'wizard', arkan: 'wizard',
  divine: 'cleric', göttlich: 'cleric', goettlich: 'cleric',
  primal: 'druid', urtümlich: 'druid', urtuemlich: 'druid',
};

/**
 * Nimmt deutsche Anzeigenamen UND englische Keys — letztere kommen aus Merkmals-Prosa und
 * LLM-Antworten, wo kein deutscher Name auftaucht.
 */
export function resolveClass(germanClass: string): string | null {
  const key = normName(germanClass);
  if (!key) return null;
  if (ENGLISH_CLASS_KEYS.has(key)) return key;
  if (CLASS_MAP[key]) return CLASS_MAP[key];
  if (TRADITION_MAP[key]) return TRADITION_MAP[key];
  for (const [de, en] of CLASS_NAMES_BY_LENGTH) {
    if (key.includes(de)) return en;
  }
  for (const en of ENGLISH_CLASS_KEYS) {
    if (key.includes(en)) return en;
  }
  return null;
}

/**
 * Der Name kommt oft ENGLISCH von der KI: gematcht wird gegen `name`, `name_en` und `key`,
 * Exakttreffer zuerst.
 */
export function resolveSpell(library: SpellInfo[], name: string, klasseName = ''): SpellInfo | null {
  const q = normName(name);
  if (!q) return null;
  const eq = (s: SpellInfo) =>
    s.name.toLowerCase() === q || (s.name_en ?? '').toLowerCase() === q || (s.key ?? '').toLowerCase() === q;
  const exact = library.find(eq);
  if (exact) return exact;
  const hit = searchSpells(library, name.trim(), null, klasseName, 1)[0];
  // Nur akzeptieren, wenn der Treffer denselben Namen (DE oder EN) trägt (kein loser Teilstring).
  return hit && eq(hit.spell) ? hit.spell : null;
}

export interface SpellSuggestion {
  spell: SpellInfo;
  /** true = Zauber gehört zur Klasse des Charakters */
  inClass: boolean;
}

/** `levelFilter` null = alle Grade; `spellClass` ist der DEUTSCHE Klassenname. */
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
    // EN↔DE: auch am englischen Namen matchen, damit "Moonbeam" den lokalen "Mondstrahl" findet.
    return s.name.toLowerCase().includes(q) || (s.name_en ?? '').toLowerCase().includes(q);
  });

  matches.sort((a, b) => {
    const aIn = englishClass ? a.classes.includes(englishClass) : false;
    const bIn = englishClass ? b.classes.includes(englishClass) : false;
    if (aIn !== bIn) return aIn ? -1 : 1;
    // Exakter Prefix-Treffer bevorzugen (DE- oder EN-Name)
    const aStart = a.name.toLowerCase().startsWith(q) || (a.name_en ?? '').toLowerCase().startsWith(q);
    const bStart = b.name.toLowerCase().startsWith(q) || (b.name_en ?? '').toLowerCase().startsWith(q);
    if (aStart !== bStart) return aStart ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return matches.slice(0, maxResults).map(spell => ({
    spell,
    inClass: englishClass ? spell.classes.includes(englishClass) : true,
  }));
}

export type SpellIndex = NameIndex<SpellInfo>;

export function buildSpellIndex(library: SpellInfo[]): SpellIndex {
  return buildNameIndex(library, {
    key: (s) => s.key,
    names: (s) => [s.name, s.name_en],
    identity: (s) => s.path,
  });
}

export const matchSpell = matchByRef<SpellInfo>;
