/** Zauber einer Figur nach Grad, jeder einmal — für die knappe Übersicht am Spieltisch. */
import type { SpellInfo } from '../../spellLibrary';

export interface LevelSpell {
  label: string;
  info: SpellInfo | undefined;
}

export function spellsByLevel(
  spells: { key: string; label: string; level?: number }[],
  infoOf: (key: string, label: string) => SpellInfo | undefined,
): { level: number; spells: LevelSpell[] }[] {
  const seen = new Set<string>();
  const byLevel = new Map<number, LevelSpell[]>();
  for (const sp of spells) {
    const id = sp.key || sp.label;
    if (seen.has(id)) continue;
    seen.add(id);
    const info = infoOf(sp.key, sp.label);
    const level = info?.level ?? sp.level ?? 0;
    byLevel.set(level, [...(byLevel.get(level) ?? []), { label: sp.label, info }]);
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, list]) => ({ level, spells: list.sort((a, b) => a.label.localeCompare(b.label, 'de')) }));
}
