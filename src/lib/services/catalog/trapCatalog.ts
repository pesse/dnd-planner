import { getTraps, invalidateTrapsCache, trapDisplayName } from '../../trapsLibrary';
import { TRAP_ICON_URL } from '../../conditionIcon';
import { TRAP_SEVERITIES, type TrapCheck, type TrapDamage } from '../../schemas/trap';
import { parsePool } from '../../utils/dice';
import { checkDe, damageDe, saveDe } from '../trapFormat';
import { sourceFacet, SOURCE_FACET, type CatalogCell, type CatalogSpec } from './catalogTypes';

function averageDamage(damage: TrapDamage[]): number {
  return damage.reduce((sum, d) => {
    const pool = parsePool(d.dice);
    return sum + (pool ? pool.dice.reduce((s, x) => s + (x.count * (x.sides + 1)) / 2, pool.bonus) : 0);
  }, 0);
}

/** Die Zelle nennt nur Fertigkeit und SG; woran gewürfelt wird, steht im Tooltip. */
function checksCell(checks: TrapCheck[]): CatalogCell {
  return {
    text: checks.map((c) => checkDe({ ...c, note: undefined, noteDe: undefined })).join(' · '),
    sort: Math.min(...checks.map((c) => c.dc), 99),
    title: checks.map(checkDe).join('\n'),
  };
}

/** Die Gefahr ist der Filter; Stufen-, SG- und Schadenswerte zeigen die Grundstufe. */
export const trapCatalog: CatalogSpec = {
  kind: 'trap',
  type: 'trap',
  label: 'Fallen',
  groupLabel: 'Gefahr',
  columns: {
    levels: { label: 'Stufen' },
    save: { label: 'Rettungswurf' },
    damage: { label: 'Schaden' },
    detect: { label: 'Entdecken', wrap: true },
    disarm: { label: 'Entschärfen', wrap: true },
  },
  columnSets: { '': ['levels', 'save', 'damage', 'detect', 'disarm'] },
  facets: { source: SOURCE_FACET },
  invalidate: invalidateTrapsCache,
  async load() {
    const traps = await getTraps();
    const rows = traps.map((t) => ({
      path: t.path,
      entryName: t.path.slice(t.path.lastIndexOf('/') + 1).replace('.json', ''),
      name: trapDisplayName(t),
      altName: t.name,
      group: t.severity,
      icon: TRAP_ICON_URL,
      iconColor: 'var(--danger)',
      cells: {
        levels: { text: t.levels, sort: parseInt(t.levels) || 0 },
        save: t.save ? { text: saveDe(t.save), sort: t.save.dc } : { text: '', sort: 0 },
        damage: { text: damageDe(t.damage), sort: averageDamage(t.damage) },
        detect: checksCell(t.detect),
        disarm: checksCell(t.disarm),
      },
      facets: { source: sourceFacet(t.source) },
    }));
    const groups = (Object.keys(TRAP_SEVERITIES) as (keyof typeof TRAP_SEVERITIES)[])
      .map((id) => ({ id, label: TRAP_SEVERITIES[id] }));
    return { rows, groups };
  },
};
