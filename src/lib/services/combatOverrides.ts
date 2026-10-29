/**
 * Eingetragene Altwerte von RK, TP-Maximum, Initiative und Bewegungsrate gegen den gerechneten
 * Wert. Der Editor stellt je Wert um: als benannte Anpassung übernehmen oder das Feld leeren.
 */
import { COMBAT_STATS, type CombatAdjustments, type CombatStat } from '../schemas/combatAdjustment';
import type { Character } from '../schemas/characterSchema';
import { displayName, matchItem, type ItemIndex } from '../itemLibrary';
import { mToFt } from '../itemFormat';
import { sign } from '../utils/num';
import type { CombatFallbacks } from './combatFallbacks';
import { idleItemsIn } from './wornItems';

export const COMBAT_STAT_LABEL_DE: Record<CombatStat, string> = {
  ac: 'RK',
  hpMax: 'TP-Maximum',
  initiative: 'Initiative',
  speed: 'Bewegungsrate',
};

export interface CombatOverride {
  stat: CombatStat;
  stored: string;
  /** Gerechnet samt bestehender Anpassungen, wie der Bogen ihn zeigt; null = nicht rechenbar. */
  computed: string | null;
  /** Die Anpassung, die den eingetragenen Wert hält — bei der Bewegungsrate in Fuß. */
  delta: number | null;
  /** Warum die Rechnung zu niedrig sein kann; eine Anpassung deckte das sonst dauerhaft zu. */
  hints: string[];
}

export type OverrideTarget = Record<CombatStat, string> & { combatAdjustments: CombatAdjustments };

const leadInt = (raw: string): number | null => {
  const m = raw.replace('−', '-').match(/^[+-]?\s*\d+/);
  return m ? Number(m[0].replace(/\s/g, '')) : null;
};

const meters = (raw: string): number | null => {
  const m = raw.match(/^\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
};

/**
 * Was die Bibliothek nicht kennt oder nicht wirkt, fehlt der RK. „13/14" und „11 (13)" meinten
 * „mit Schild" — der zählt jetzt nur angelegt.
 */
export function armorClassHints(index: ItemIndex, inventory: Character['inventory']): string[] {
  const unknown = inventory.filter((l) => l.name.trim() && !matchItem(index, { sourceKey: l.sourceKey, name: l.name }));
  const idle = idleItemsIn(index, inventory).filter(({ item }) => item.armor_class || item.armorClassEffects?.length);
  return [
    ...(unknown.length ? [`nicht verlinkt: ${unknown.map((l) => l.name.trim()).join(', ')}`] : []),
    ...idle.map(({ item, reason }) => `${displayName(item)}: ${reason === 'unequipped' ? 'nicht angelegt' : 'nicht eingestimmt'}`),
  ];
}

function computedOf(stat: CombatStat, fb: CombatFallbacks): { shown: string; value: number } | null {
  switch (stat) {
    case 'ac': return fb.ac === null ? null : { shown: String(fb.ac), value: fb.ac };
    case 'hpMax': return fb.hpMax === null ? null : { shown: String(fb.hpMax), value: fb.hpMax };
    case 'initiative': return { shown: fb.initiative, value: Number(fb.initiative) };
    case 'speed': return fb.speedRows.length
      ? { shown: `${fb.speed} m`, value: fb.speedRows.reduce((n, r) => n + r.feet, 0) }
      : null;
  }
}

function storedValue(stat: CombatStat, raw: string): number | null {
  if (stat === 'hpMax') return /^\d+$/.test(raw) ? Number(raw) : null;
  if (stat === 'speed') {
    const m = meters(raw);
    return m === null ? null : mToFt(m);
  }
  return leadInt(raw);
}

export function combatOverrides(input: {
  stored: Record<CombatStat, string>;
  fb: CombatFallbacks;
  /** Ohne gespeicherte Würfelsumme rechnet die TP-Herleitung aus dem Altwert selbst zurück. */
  hpDiceTotal: number | undefined;
  acHints: string[];
}): CombatOverride[] {
  const out: CombatOverride[] = [];
  for (const stat of COMBAT_STATS) {
    const stored = input.stored[stat].trim();
    if (!stored) continue;
    const hints = stat === 'ac' ? [...input.acHints] : [];
    let computed = computedOf(stat, input.fb);
    if (stat === 'hpMax' && input.hpDiceTotal === undefined) {
      computed = null;
      hints.push('erst die Würfelsumme eintragen');
    }
    if (stat === 'speed' && !computed) hints.push('kein verlinktes Volk mit Bewegungsrate');
    const value = storedValue(stat, stored);
    out.push({
      stat,
      stored,
      computed: computed?.shown ?? null,
      delta: computed && value !== null ? value - computed.value : null,
      hints,
    });
  }
  return out;
}

export const deltaLabel = (o: CombatOverride): string =>
  o.delta === null ? '' : o.stat === 'speed' ? `${sign(o.delta)} Fuß` : sign(o.delta);

/** Hält den eingetragenen Wert als Posten der Herleitung. */
export function adoptOverride(target: OverrideTarget, o: CombatOverride): void {
  if (o.delta) target.combatAdjustments[o.stat].push({ amount: o.delta, reason: 'aus dem eingetragenen Wert' });
  target[o.stat] = '';
}

export function clearOverride(target: OverrideTarget, o: CombatOverride): void {
  target[o.stat] = '';
}
