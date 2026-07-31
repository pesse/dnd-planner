/**
 * Immer-vorbereitete Zauberlisten einer Subklasse — Kreissprüche, Domänenzauber, Eidzauber,
 * Patronenzauber, Drachenzauber. Deterministisch aus dem Merkmalstext gelesen, ohne LLM.
 *
 * Warum überhaupt: die Listen stehen im `desc` als Markdown-Tabelle `|Stufe|Zauber|`, also
 * als Daten. Sie von einem Modell aufzählen zu lassen, war der teuerste Posten der ganzen
 * Kette — und der unzuverlässigste: gemessen 2026-07-29 brauchte allein diese Aufzählung den
 * Reasoning-Vorlauf (thinking-frei kamen in 4 von 5 Läufen NULL statt zwölf Kreissprüchen).
 *
 * Gelesen statt in den Vault kopiert, wie `parseCoreTraits` (services/classProgression.ts):
 * die Tabelle kommt aus dem Import und überlebt jeden Re-Import. Eine zweite, gepflegte
 * Fassung derselben Liste wäre die Quelle, die irgendwann auseinanderläuft.
 *
 * Erkannt wird über die Deklaration `grantsSpells` (shared.ts), nie am Merkmalsnamen — die
 * sechs Vault-Merkmale heißen alle anders. Die englische Zusicherung „always have … prepared"
 * bleibt Fallback für ungepflegte Einträge, wie `isWeaponMasteryFeature` neben `grantsChoice`.
 * `tests/integration/grantedSpells.test.ts` fegt den Vault und hält die Deckung fest.
 */

import type { SpellGrant } from '$lib/schemas/shared';

/** Eine Tabellenzeile: ab dieser Klassenstufe sind diese Zauber dauerhaft vorbereitet. */
export interface SpellGrantRow {
  level: number;
  /** Kanonische ENGLISCHE Namen, wie der Merkmalstext sie schreibt. */
  names: string[];
}

/**
 * Die Zusicherung „dauerhaft vorbereitet" in beiden Formulierungen, die das SRD nutzt:
 * „you thereafter always have the listed spells prepared" (Domäne/Eid/Patron/Drache) und
 * „you have the spells listed for your Druid level and lower prepared" (Landzirkel).
 */
const ALWAYS_PREPARED = /always have the listed spells prepared|have the spells listed[^.]*prepared/i;

/** `|3|Blur, Burning Hands, Fire Bolt|` — Stufe, dann die Zauber der Stufe. */
const TABLE_ROW = /^\|\s*(\d{1,2})\s*\|\s*([^|]+?)\s*\|\s*$/gm;

/**
 * Liest alle Stufen→Zauber-Zeilen. Mehrere Tabellen im selben Merkmal werden VEREINIGT —
 * beim Landzirkel sind das die vier Landarten, und die App führt sie bewusst alle: die
 * Landart wird nach jeder Langen Rast neu gewählt, ist also keine Aufbau-Entscheidung
 * (dieselbe Regel, die der Analyse-Prompt seit K1 vorgibt).
 */
export function parseSpellGrantRows(desc: string): SpellGrantRow[] {
  const byLevel = new Map<number, string[]>();
  for (const m of desc.matchAll(TABLE_ROW)) {
    const level = Number(m[1]);
    if (!Number.isFinite(level)) continue;
    const cell = m[2].trim();
    // Trennzeilen (`|---|---|`) und Zahlenzellen fallen hier schon durch das Zellmuster.
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

/** Die Quelle, aus der die Erkennung liest: Deklaration bevorzugt, Prosa als Fallback. */
export interface SpellGrantSource {
  desc?: string;
  grantsSpells?: SpellGrant;
}

/**
 * Trägt dieses Merkmal eine immer-vorbereitete Zauberliste?
 *
 * Auch bei Deklaration muss die Tabelle lesbar sein: sonst fiele das Merkmal aus dem
 * KI-Eingang, ohne dass jemand die Zauber gewährt. Solche Fälle bleiben beim Modell und
 * werden über `unreadableSpellGrant` gemeldet.
 */
export function isSpellGrantFeature(f: SpellGrantSource): boolean {
  const desc = f.desc ?? '';
  if (!f.grantsSpells && !ALWAYS_PREPARED.test(desc)) return false;
  return parseSpellGrantRows(desc).length > 0;
}

/**
 * Kündigt eine Zauberliste an, deren Form der Parser nicht lesen kann. Sieht gedeckt aus,
 * ist es nicht — deshalb gemeldet statt still zur KI zurückgefallen.
 */
export function unreadableSpellGrant(f: SpellGrantSource): boolean {
  const desc = f.desc ?? '';
  if (!f.grantsSpells && !ALWAYS_PREPARED.test(desc)) return false;
  return parseSpellGrantRows(desc).length === 0;
}

/**
 * Alle Zauber, die die übergebenen Merkmale auf `classLevel` dauerhaft gewähren
 * („für deine Stufe und niedriger"), englisch und dedupliziert.
 */
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

/** Die Merkmale OHNE die deklarativ gewährten Zauberlisten — der Eingang der KI-Deutung. */
export function withoutSpellGrantFeatures<T extends SpellGrantSource>(features: T[]): T[] {
  return features.filter((f) => !isSpellGrantFeature(f));
}
