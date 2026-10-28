import { describe, expect, it } from 'vitest';
import { collectGrants } from '../../src/lib/services/proficiencyGrants';

describe('Werkzeug-Übung aus dem Hintergrund', () => {
  it('sammelt das feste Werkzeug des Hintergrunds mit Herkunft', async () => {
    const grants = await collectGrants({ backgroundRef: { sourceKey: 'srd-2024_sage' } });
    expect(grants.tools.map((g) => [g.value, g.source.sourceKey])).toEqual([['Kalligrafiewerkzeug', 'srd-2024_sage']]);
  });

  it('sammelt bei einer Werkzeug-Wahl nichts — die bleibt Prosa im Vorteil', async () => {
    const grants = await collectGrants({ backgroundRef: { sourceKey: 'phb-2024_artisan' } });
    expect(grants.tools).toEqual([]);
  });
});
