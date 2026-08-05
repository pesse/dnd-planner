/**
 * `SpellcastingState` → Bogen-Sicht, KI-Kontext und offene Wahlen.
 */
import type { AbilityName } from '$lib/schemas/abilities';
import { ABILITY_LABEL_DE } from '$lib/schemas/abilities';
import type { Character, CharacterFeatureEntry, CharacterSpells } from '$lib/schemas/characterSchema';
import type { CharacterSpellcasting } from '$lib/schemas/spellcasting';
import { getSpellLibrary, resolveSpell, type SpellInfo } from '$lib/spellLibrary';
import { sign } from '$lib/utils/num';
import { legacySpellcasting } from './legacy';
import { resolveCasting } from './resolve';
import { spellPools } from './slots';
import type { CastingSource } from './source';
import { spellcastingState, type SpellcastingState } from './state';

export interface ProjectionLookup {
  /** `spell.key` → Bibliothekseintrag. */
  spell: (key: string) => SpellInfo | undefined;
  /** Anzeigename (deutsch oder englisch) → Bibliothekseintrag. */
  spellByName: (name: string) => SpellInfo | undefined;
  /** Klassen-Key → deutscher Klassenname. */
  className: (classKey: string) => string;
}

export interface SheetSpell {
  /** Leer nur bei Altbestand ohne Bibliotheks-Treffer. */
  key: string;
  label: string;
  prepared: boolean;
  /** Leer = Altbestand ohne Quelle. */
  source: string;
}

export interface SheetLevel {
  /** 0 = Zaubertricks. */
  level: number;
  slots: { total: number; used: number } | null;
  spells: SheetSpell[];
}

export interface SheetSourceRow {
  id: string;
  /** Entscheidet nur die Beschriftung der ersten Zelle. */
  kind: 'class' | 'feature';
  label: string;
  abilityDe: string;
  saveDC: number | null;
  attackBonus: number | null;
  /** Offene Attributwahl, deutsch. */
  abilityOptionsDe: string[];
}

export interface SheetSpellcasting {
  sources: SheetSourceRow[];
  levels: SheetLevel[];
  /** Pakt-Plätze; null = die Figur hat keine. */
  pact: { level: number; total: number; used: number } | null;
  hasContent: boolean;
}

export const abilityDe = (a: AbilityName | null): string => (a ? ABILITY_LABEL_DE[a] : '');

/** Nur die Grundklasse steht als Klassenname; alles andere nennt sein Merkmal. */
export function sourceLabel(source: CastingSource, lookup: ProjectionLookup): string {
  if (source.origin === 'class') {
    const klass = lookup.className(source.classKey);
    if (klass) return klass;
  }
  return source.labelDe;
}

function sourceRows(state: SpellcastingState, lookup: ProjectionLookup): SheetSourceRow[] {
  return state.sources
    .filter((s) => s.ability || s.abilityOptions.length)
    .map((s) => ({
      id: s.source.id,
      kind: s.source.origin === 'class' || s.source.origin === 'subclass' ? ('class' as const) : ('feature' as const),
      label: sourceLabel(s.source, lookup),
      abilityDe: abilityDe(s.ability),
      saveDC: s.saveDC,
      attackBonus: s.attackBonus,
      abilityOptionsDe: s.abilityOptions.map((a) => ABILITY_LABEL_DE[a]),
    }));
}

/** Zauber, die keiner Quota zugeordnet sind (`manual.extra`, Altbestand). */
export interface LooseSpell {
  key: string;
  label: string;
  level: number;
  prepared: boolean;
}

/** Was `services/spellcasting/legacy.ts` bis Stufe 4 beisteuert. */
export interface LegacySheetInput {
  /** Greift nur, wenn keine aufgelöste Quelle ein Attribut trägt. */
  row: SheetSourceRow | null;
  spells: LooseSpell[];
}

const NO_LEGACY: LegacySheetInput = { row: null, spells: [] };

export function sheetSpellcasting(
  state: SpellcastingState,
  lookup: ProjectionLookup,
  legacy: LegacySheetInput = NO_LEGACY,
): SheetSpellcasting {
  const byLevel = new Map<number, SheetSpell[]>();
  const seen = new Set<string>();
  const put = (level: number, spell: SheetSpell): void => {
    const arr = byLevel.get(level) ?? [];
    arr.push(spell);
    byLevel.set(level, arr);
  };

  for (const source of state.sources) {
    const label = sourceLabel(source.source, lookup);
    for (const quota of source.quotas) {
      // `known` ist Bestand, nicht wirkbar — der Bogen zeigt die Vorbereitung.
      if (quota.view.tier !== 'prepared') continue;
      for (const key of quota.spells) {
        if (seen.has(key)) continue;
        seen.add(key);
        const info = lookup.spell(key);
        put(info?.level ?? 0, { key, label: info?.name ?? key, prepared: true, source: label });
      }
    }
  }
  // Quellenloser Bestand: `manual.extra` und, solange die Datei sie führt, die Altform.
  for (const key of state.extra) {
    if (seen.has(key)) continue;
    seen.add(key);
    const info = lookup.spell(key);
    put(info?.level ?? 0, { key, label: info?.name ?? key, prepared: true, source: '' });
  }
  for (const spell of legacy.spells) {
    if (spell.key && seen.has(spell.key)) continue;
    if (spell.key) seen.add(spell.key);
    put(spell.level, { key: spell.key, label: spell.label, prepared: spell.prepared, source: '' });
  }

  let pactLevel = 0;
  state.pools.pact.total.forEach((n, i) => { if (n > 0) pactLevel = i + 1; });
  const levels: SheetLevel[] = [];
  for (let level = 0; level <= 9; level++) {
    const spells = byLevel.get(level) ?? [];
    const total = level === 0 ? 0 : (state.pools.standard.total[level - 1] ?? 0);
    if (!spells.length && total === 0) continue;
    levels.push({
      level,
      slots: total > 0 ? { total, used: state.pools.standard.used[level - 1] ?? 0 } : null,
      spells,
    });
  }

  const derived = sourceRows(state, lookup);
  const sources = derived.length ? derived : (legacy.row ? [legacy.row] : []);
  return {
    sources,
    levels,
    pact: pactLevel > 0
      ? { level: pactLevel, total: state.pools.pact.total[pactLevel - 1] ?? 0, used: state.pools.pact.used }
      : null,
    hasContent: sources.length > 0 || levels.length > 0,
  };
}

/** Zeilen des `Spellcasting`-Abschnitts im KI-Kontext. */
export function contextLines(view: SheetSpellcasting): string[] {
  const lines: string[] = [];
  for (const s of view.sources) {
    const bits = [
      s.abilityDe && `Ability: ${s.abilityDe}`,
      s.saveDC !== null && `Save DC: ${s.saveDC}`,
      s.attackBonus !== null && `Attack Bonus: ${sign(s.attackBonus)}`,
      !s.abilityDe && s.abilityOptionsDe.length > 0 && `Ability: offen (${s.abilityOptionsDe.join('/')})`,
    ].filter(Boolean);
    lines.push(`- Source: ${s.label}${bits.length ? ` — ${bits.join(', ')}` : ''}`);
  }

  const slotLines = view.levels
    .filter((l) => l.slots)
    .map((l) => `  - Grad ${l.level}: ${l.slots!.total - l.slots!.used}/${l.slots!.total} frei`);
  if (slotLines.length) lines.push('- Slots:', ...slotLines);
  if (view.pact) lines.push(`- Pakt-Slots: ${view.pact.total} × Grad ${view.pact.level} (Kurze Rast)`);

  for (const level of view.levels) {
    if (!level.spells.length) continue;
    const names = level.spells
      .map((s) => {
        const notes = [level.level > 0 && s.prepared && 'vorbereitet', s.source].filter(Boolean);
        return `${s.label}${notes.length ? ` (${notes.join(', ')})` : ''}`;
      })
      .join(', ');
    lines.push(level.level === 0 ? `- Zaubertricks: ${names}` : `- Grad ${level.level}: ${names}`);
  }
  return lines;
}

export interface OpenSpellChoice {
  sourceId: string;
  sourceLabel: string;
  quotaId: string;
  count: number;
  /** Zulässige Grade; leer = keine Gradschranke. */
  levels: number[];
  /** Zauberlisten als englische Klassen-Keys. */
  lists: string[];
  /** Der Pool ist die Auswahl einer anderen Quota (Zauberbuch). */
  fromQuota: string;
}

export function openSpellChoices(state: SpellcastingState, lookup: ProjectionLookup): OpenSpellChoice[] {
  const out: OpenSpellChoice[] = [];
  for (const source of state.sources) {
    const label = sourceLabel(source.source, lookup);
    for (const quota of source.quotas) {
      if (quota.open <= 0) continue;
      out.push({
        sourceId: source.source.id,
        sourceLabel: label,
        quotaId: quota.view.quotaId,
        count: quota.open,
        levels: quota.view.levels,
        lists: quota.view.pool.lists,
        fromQuota: quota.view.pool.from?.quotaId ?? '',
      });
    }
  }
  return out;
}

export interface LoadedSpellcasting {
  state: SpellcastingState;
  lookup: ProjectionLookup;
  legacy: LegacySheetInput;
}

export async function loadSpellcasting(
  c: Character,
  stored?: CharacterSpellcasting,
): Promise<LoadedSpellcasting> {
  const library = await getSpellLibrary();
  const byKey = new Map(library.filter((s) => s.key).map((s) => [s.key as string, s]));
  const resolution = await resolveCasting(c);
  const classNames = new Map(resolution.classes.map((k) => [k.prog.key, k.prog.nameDe || k.prog.name]));
  for (const cls of c.classes ?? []) if (cls.sourceKey && cls.name.trim()) classNames.set(cls.sourceKey, cls.name.trim());

  const lookup: ProjectionLookup = {
    spell: (key) => byKey.get(key),
    spellByName: (name) => resolveSpell(library, name) ?? undefined,
    className: (classKey) => classNames.get(classKey) ?? '',
  };

  const legacy = legacySpellcasting({ ...c, spellcasting: stored ?? c.spellcasting }, spellPools(resolution.classes).standard, lookup);
  const state = spellcastingState({
    resolution,
    stored: legacy.stored,
    profBonus: c.proficiencyBonus,
    mods: { str: c.strMod, ges: c.gesMod, kon: c.konMod, int: c.intMod, wei: c.weiMod, cha: c.chaMod },
    spellKey: (name) => resolveSpell(library, name)?.key,
  });
  return { state, lookup, legacy: legacy.sheet };
}

export async function loadSheetSpellcasting(c: Character): Promise<SheetSpellcasting> {
  const { state, lookup, legacy } = await loadSpellcasting(c);
  return sheetSpellcasting(state, lookup, legacy);
}
