/**
 * Immer-vorbereitete Zauberlisten einer Subklasse, deterministisch aus der Markdown-Tabelle im
 * `desc` gelesen: ein Modell zählte sie unzuverlässig auf (thinking-frei 4 von 5 Läufen leer).
 * GELESEN statt in den Vault kopiert — eine zweite Fassung liefe beim Re-Import auseinander.
 */

import type { SpellGrant } from '$lib/schemas/grants';

export interface SpellGrantRow {
  /** Ab dieser Klassenstufe. */
  level: number;
  /** Kanonische ENGLISCHE Namen, wie der Merkmalstext sie schreibt. */
  names: string[];
}

/**
 * Fallback für Merkmale ohne `grantsSpells`: die zwei SRD-Formulierungen der Zusicherung
 * „dauerhaft vorbereitet".
 */
const ALWAYS_PREPARED = /always have the listed spells prepared|have the spells listed[^.]*prepared/i;

/** `|3|Blur, Burning Hands, Fire Bolt|` — Stufe, dann die Zauber der Stufe. */
const TABLE_ROW = /^\|\s*(\d{1,2})\s*\|\s*([^|]+?)\s*\|\s*$/gm;

/**
 * Mehrere Tabellen im selben Merkmal werden VEREINIGT (Landzirkel: vier Landarten): die
 * Landart wird nach jeder Langen Rast neu gewählt, ist also keine Aufbau-Entscheidung.
 */
export function parseSpellGrantRows(desc: string): SpellGrantRow[] {
  const byLevel = new Map<number, string[]>();
  for (const m of desc.matchAll(TABLE_ROW)) {
    const level = Number(m[1]);
    if (!Number.isFinite(level)) continue;
    const cell = m[2].trim();
    if (!cell || /^-+$/.test(cell)) continue;
    const names = cell
      .split(',')
      .map((s) => s.replace(/\*/g, '').trim())
      .filter((s) => s.length > 1 && /[a-zA-Z]/.test(s));
    if (!names.length) continue;
    const arr = byLevel.get(level) ?? [];
    for (const n of names) if (!arr.includes(n)) arr.push(n);
    byLevel.set(level, arr);
  }
  return [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, names]) => ({ level, names }));
}

export interface SpellGrantSource {
  desc?: string;
  grantsSpells?: SpellGrant;
}

/**
 * Auch bei Deklaration muss die Tabelle lesbar sein: sonst fiele das Merkmal aus dem
 * KI-Eingang, ohne dass jemand die Zauber gewährt.
 */
export function isSpellGrantFeature(f: SpellGrantSource): boolean {
  const desc = f.desc ?? '';
  if (!f.grantsSpells && !ALWAYS_PREPARED.test(desc)) return false;
  return parseSpellGrantRows(desc).length > 0;
}

/** Sieht gedeckt aus, ist es nicht — deshalb gemeldet statt still zur KI zurückgefallen. */
export function unreadableSpellGrant(f: SpellGrantSource): boolean {
  const desc = f.desc ?? '';
  if (!f.grantsSpells && !ALWAYS_PREPARED.test(desc)) return false;
  return parseSpellGrantRows(desc).length === 0;
}

/** Kumulativ: „für deine Stufe und niedriger", englisch und dedupliziert. */
export function declaredSpellGrants(features: SpellGrantSource[], classLevel: number): string[] {
  const out: string[] = [];
  for (const f of features) {
    if (!isSpellGrantFeature(f)) continue;
    for (const row of parseSpellGrantRows(f.desc ?? '')) {
      if (row.level > classLevel) continue;
      for (const name of row.names) if (!out.includes(name)) out.push(name);
    }
  }
  return out;
}

export function withoutSpellGrantFeatures<T extends SpellGrantSource>(features: T[]): T[] {
  return features.filter((f) => !isSpellGrantFeature(f));
}
