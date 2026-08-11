/**
 * Der Import einer Klasse aus Open5e v2: die Stufentabelle entsteht aus den Merkmalen, die
 * eine Spalte tragen. Ohne Netz — die Rohform kommt von Hand herein.
 */
import { describe, expect, it } from 'vitest';
import { mapV2 } from '../../src/lib/services/classTableParse';

const columnFeature = (key: string, name: string, rows: [number, string][]) => ({
  key,
  name,
  data_for_class_table: rows.map(([level, column_value]) => ({ level, column_value })),
});

describe('Stufentabelle aus Open5e v2', () => {
  it('benennt die Spalte nach dem Merkmal', () => {
    const prog = mapV2({ key: 'srd-2024_monk', features: [columnFeature('srd-2024_monk_focus', 'Focus Points', [[2, '2']])] });

    expect(prog.levels).toEqual([{ level: 2, columns: { 'Focus Points': '2' } }]);
  });

  it('folgt dem Merkmals-Key, wo die Quelle sich selbst widerspricht', () => {
    const prog = mapV2({
      key: 'srd-2024_druid',
      features: [
        columnFeature('srd-2024_druid_cantrips', 'Cantrips', [[2, '2']]),
        // Dasselbe Label zweimal würde die echte Zaubertrick-Spalte überschreiben.
        columnFeature('srd-2024_druid_wild-shape-uses', 'Cantrips Known', [[2, '2'], [6, '3']]),
      ],
    });

    expect(prog.levels[0].columns).toEqual({ Cantrips: '2', 'Wild Shape': '2' });
    expect(prog.levels[1].columns).toEqual({ 'Wild Shape': '3' });
  });
});
