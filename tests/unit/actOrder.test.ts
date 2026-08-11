import { describe, it, expect } from 'vitest';
import { applyActOrder } from '../../src/lib/services/actOrder';

describe('applyActOrder', () => {
  it('folgt der gespeicherten Reihenfolge', () => {
    expect(applyActOrder(['b', 'a', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('hängt unbekannte Verzeichnisse alphabetisch hinten an', () => {
    expect(applyActOrder(['c', 'a', 'neu', 'b'], ['c', 'a'])).toEqual(['c', 'a', 'b', 'neu']);
  });

  it('lässt verwaiste Einträge weg', () => {
    expect(applyActOrder(['a', 'b'], ['geloescht', 'b', 'a'])).toEqual(['b', 'a']);
  });

  it('sortiert ohne gespeicherte Reihenfolge alphabetisch', () => {
    expect(applyActOrder(['akt-iii', 'akt-i', 'akt-ii'], [])).toEqual(['akt-i', 'akt-ii', 'akt-iii']);
  });

  it('verkraftet Duplikate in der Ordnungsdatei', () => {
    expect(applyActOrder(['a', 'b'], ['a', 'a', 'b'])).toEqual(['a', 'b']);
  });
});
