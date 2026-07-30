/**
 * Lädt und cached den Zauber-Index aus vault/spells.
 * Stellt Suchfunktionen bereit inkl. Klassen-Filterung.
 */
import { invoke } from '@tauri-apps/api/core';
import { slugify } from './editor/saveAs';
import type { Spell } from './types';

export interface SpellInfo {
  name: string;
  /** Kanonischer englischer SRD-Name (für EN↔DE-Matching); leer, wenn nicht hinterlegt. */
  name_en?: string;
  /** Open5e-Key (z.B. "srd-2024_moonbeam"); bei Zaubern meist leer — Identität ist der Name. */
  key?: string;
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

/** Entwertet den Zauber-Index-Cache; nächster `getSpellLibrary()`-Aufruf lädt neu. */
export function invalidateSpellLibrary(): void {
  cache = null;
  loading = null;
}

// school (englisch im JSON) → Ordnername (deutsch im Vault); identisch zu SpellCard.svelte.
const SPELL_SCHOOL_DIR: Record<string, string> = {
  abjuration: 'bannmagie', conjuration: 'beschwörung', divination: 'erkenntnismagie',
  enchantment: 'verzauberung', evocation: 'hervorrufung', illusion: 'illusionsmagie',
  necromancy: 'nekromantie', transmutation: 'verwandlung',
};

/**
 * Legt einen Zauber direkt im Vault an (`vault/spells/{schule}/{slug}.json`), ohne einen
 * CardEditor zu öffnen — für die Inline-Anlage im Stufenaufstieg. Invalidiert danach den
 * Index-Cache und lädt ihn neu, damit der neue Zauber sofort auflöst. Gibt die
 * kanonische (getrimmte) Namensform zurück.
 */
export async function createSpellInline(spell: Spell): Promise<string> {
  const dir = SPELL_SCHOOL_DIR[spell.school] ?? 'hervorrufung';
  const name = (spell.name || 'Neuer Zauber').trim();
  const path = `./vault/spells/${dir}/${slugify(name)}.json`;
  await invoke('write_file_content', { path, content: JSON.stringify({ ...spell, name }, null, 2) });
  invalidateSpellLibrary();
  await getSpellLibrary();
  return name;
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
 *
 * **Zauberer = sorcerer, Magier = wizard** — maßgeblich ist `DE_TO_SLUG` in
 * `services/classProgression.ts` (und `nameDe` der Vault-Klassen). Die Verwechslung ist
 * teuer: sie filtert die Zauberauswahl eines Zauberers auf die Magier-Liste.
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

/** Die englischen Klassen-Keys, wie sie in `SpellInfo.classes` stehen. */
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
 * Normalisiert einen Klassennamen auf den englischen Key oder gibt null zurück.
 * Nimmt deutsche Anzeigenamen („Magier", „Zauberer Level 5") UND bereits englische Keys —
 * letztere kommen aus Merkmals-Prosa und LLM-Antworten („pick two cantrips from the Cleric
 * spell list"), wo kein deutscher Name auftaucht.
 */
export function resolveClass(germanClass: string): string | null {
  const key = germanClass.toLowerCase().trim();
  if (!key) return null;
  // Bereits ein englischer Key
  if (ENGLISH_CLASS_KEYS.has(key)) return key;
  // Direkter Treffer
  if (CLASS_MAP[key]) return CLASS_MAP[key];
  if (TRADITION_MAP[key]) return TRADITION_MAP[key];
  // Teilstring-Treffer (z.B. "Zauberer Level 5" → "sorcerer")
  for (const [de, en] of CLASS_NAMES_BY_LENGTH) {
    if (key.includes(de)) return en;
  }
  // Englischer Key als Teilstring („Cleric spell list", „Magic Initiate (Wizard)")
  for (const en of ENGLISH_CLASS_KEYS) {
    if (key.includes(en)) return en;
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
    // EN↔DE: auch am englischen Namen matchen, damit "Moonbeam" den lokalen "Mondstrahl" findet.
    return s.name.toLowerCase().includes(q) || (s.name_en ?? '').toLowerCase().includes(q);
  });

  // Sortierung: Klassen-Treffer zuerst, dann alphabetisch
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

// ── Key-Index + Matcher (analog itemLibrary.ts) ─────────────────────────────────

export interface SpellIndex {
  byKey: Map<string, SpellInfo>;
  /** Kleingeschrieben, deutscher (`name`) UND englischer (`name_en`) Name. */
  byName: Map<string, SpellInfo>;
  /** Namen, die mehr als einen Zauber treffen: anzeigen ja, automatisch verlinken nein. */
  ambiguous: Set<string>;
}

export function buildSpellIndex(library: SpellInfo[]): SpellIndex {
  const byKey = new Map<string, SpellInfo>();
  const byName = new Map<string, SpellInfo>();
  const ambiguous = new Set<string>();

  const addName = (name: string | undefined, spell: SpellInfo) => {
    const k = name?.trim().toLowerCase();
    if (!k) return;
    if (byName.has(k)) {
      if (byName.get(k)?.path !== spell.path) ambiguous.add(k);
      return;
    }
    byName.set(k, spell);
  };

  for (const spell of library) {
    if (spell.key) byKey.set(spell.key, spell);
    addName(spell.name, spell);
    addName(spell.name_en, spell);
  }

  return { byKey, byName, ambiguous };
}

/** Bibliothekseintrag zu einem Verweis; `undefined` = die Bibliothek kennt ihn nicht. */
export function matchSpell(
  index: SpellIndex,
  ref: { sourceKey?: string; name?: string },
): SpellInfo | undefined {
  const key = ref.sourceKey?.trim();
  if (key) {
    const hit = index.byKey.get(key);
    // Kein früher Ausstieg bei Fehltreffer: ein Key aus einer nicht installierten
    // Bibliothek darf trotzdem über den Namen auflösen.
    if (hit) return hit;
  }
  const name = ref.name?.trim().toLowerCase();
  return name ? index.byName.get(name) : undefined;
}
