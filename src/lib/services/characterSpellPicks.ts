/**
 * Brücke zwischen dem Zauber-Formular (`SpellRef`/`SpellEntry`, mit `sourceKey`/`prepared`)
 * und den flachen `encodePick`-Strings des `SpellPickModal` — in beide Richtungen.
 * `buildSpellSelection` (spellcasting.ts) taugt hier nicht: es baut die Menge neu auf und
 * liefert nur Namen, ein bestehender `sourceKey` ginge dabei verloren.
 */
import { CASTER_ABILITY_KEY, decodePick, encodePick, type PrepRegime, type SpellcastingOffer } from './spellcasting';
import type { CharacterClass, SpellEntry, SpellRef } from '../schemas/characterSchema';

export interface CasterRow {
  classKey: string;
  klasseName: string;
  /** Klassen-Stufe der Zauber-Klasse, nicht die Charakter-Gesamtstufe. */
  level: number;
}

/**
 * Bei leerem `spellcastingClass` greift eine Klassenzeile nur, wenn GENAU eine ein
 * Zauberwirker ist — sonst bliebe im Multiclass unklar, welche Klassentabelle gilt.
 */
export function casterRowOf(
  f: { classes: CharacterClass[]; spellcastingClass: string },
  resolve: (name: string) => string | null,
): CasterRow | null {
  const toRow = (c: CharacterClass): CasterRow | null =>
    c.sourceKey ? { classKey: c.sourceKey, klasseName: c.name, level: c.level } : null;

  const wanted = f.spellcastingClass.trim() ? resolve(f.spellcastingClass) : null;
  if (wanted) {
    const hit = f.classes.find((c) => resolve(c.name) === wanted);
    return hit ? toRow(hit) : null;
  }
  const casters = f.classes.filter((c) => {
    const slug = resolve(c.name);
    return !!slug && slug in CASTER_ABILITY_KEY;
  });
  return casters.length === 1 ? toRow(casters[0]) : null;
}

export const cantripQuota = (o: SpellcastingOffer | null): number => (o?.isCaster ? o.cantrips : 0);
export const spellQuota = (o: SpellcastingOffer | null): number => (o?.isCaster ? o.known || o.prepared : 0);

export interface LevelPickScope {
  /** Zugleich Modal-Filter UND Schreib-Scope: ein Grad, den `mergeSpellPicks` nicht mitnimmt,
   *  das Modal aber doch anzeigt, würde beim Schließen als „entfernt" gelesen. */
  levels: number[];
  picks: string[];
}

/** Bestehende, zu hohe Grade bleiben wählbar statt beim Grad-Gating stumm zu verschwinden. */
export function levelPickScope(byLevel: Record<string, SpellEntry[]>, maxSpellLevel: number): LevelPickScope {
  const upTo = Array.from({ length: Math.max(0, maxSpellLevel) }, (_, i) => i + 1);
  const existing = Object.entries(byLevel)
    .filter(([, entries]) => entries.length > 0)
    .map(([lvl]) => Number(lvl))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 9);
  const levels = [...new Set([...upTo, ...existing])].sort((a, b) => a - b);
  const picks = levels.flatMap((lvl) => (byLevel[String(lvl)] ?? []).map((e) => encodePick(lvl, e.name)));
  return { levels, picks };
}

export function cantripPicks(cantrips: SpellRef[]): string[] {
  return cantrips.map((c) => encodePick(0, c.name));
}

/** Bestehende Einträge bleiben dieselben Objekte — das erhält `sourceKey` und `diffMark`. */
export function mergeCantripPicks(
  current: SpellRef[],
  picks: string[],
  resolveKey: (name: string) => string | undefined,
): SpellRef[] {
  const byName = new Map(current.map((c) => [c.name, c]));
  const names = [...new Set(picks.map((p) => decodePick(p).name))];
  return names.map((name) => byName.get(name) ?? linkedRef(name, resolveKey(name)));
}

/**
 * Grade außerhalb von `scope.levels` reicht sie unverändert durch (dort war der Dialog nicht
 * offen); innerhalb ersetzt sie die Liste durch die Picks, neue Namen bekommen `prepared` nach
 * Regime — nur im Zauberbuch ist die Auswahl NICHT automatisch die Vorbereitung.
 */
export function mergeSpellPicks(
  current: Record<string, SpellEntry[]>,
  picks: string[],
  opts: { levels: number[]; regime: PrepRegime; resolveKey: (name: string) => string | undefined },
): Record<string, SpellEntry[]> {
  const scope = new Set(opts.levels);
  const byLevelName = new Map<string, SpellEntry>();
  for (const [lvl, entries] of Object.entries(current))
    for (const e of entries) byLevelName.set(`${lvl}::${e.name}`, e);

  const grouped = new Map<number, string[]>();
  for (const p of picks) {
    const { level, name } = decodePick(p);
    if (!scope.has(level)) continue; // defensiv — das Modal sieht ohnehin nur den Scope
    const arr = grouped.get(level) ?? [];
    if (!arr.includes(name)) arr.push(name);
    grouped.set(level, arr);
  }

  const next: Record<string, SpellEntry[]> = {};
  for (const [lvl, entries] of Object.entries(current)) if (!scope.has(Number(lvl))) next[lvl] = entries;
  for (const level of opts.levels) {
    const names = grouped.get(level);
    if (!names?.length) continue; // kein manufaktierter leerer Grad — sonst keine Rundreise-Identität
    next[String(level)] = names.map((name) => {
      const existing = byLevelName.get(`${level}::${name}`);
      if (existing) return existing;
      return { ...linkedRef(name, opts.resolveKey(name)), prepared: opts.regime !== 'spellbook' };
    });
  }
  return next;
}

const linkedRef = (name: string, key: string | undefined): SpellRef => ({ name, ...(key ? { sourceKey: key } : {}) });
