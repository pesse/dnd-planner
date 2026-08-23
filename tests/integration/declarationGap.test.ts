/**
 * Der Lückenmelder am ECHTEN Vault — OHNE LLM.
 *
 * Seit die KI keine Wahl und keine Zaubergewährung mehr deutet, fällt eine undeklarierte
 * Mechanik aus. Diese Datei ist die Zusicherung, dass sie dabei LAUT ist: der offene Fall
 * (Invokationen #25) muss gemeldet werden, ein deklariertes Merkmal darf keine Zeile erzeugen.
 *
 *   npm run test -- declarationGap
 */
import { describe, expect, it } from 'vitest';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import { getFeats } from '../../src/lib/featsLibrary';
import {
  declarationGapLines,
  declarationGaps,
  type GapCandidate,
} from '../../src/lib/services/declarationGap';

const classFeature = async (classKey: string, featureKey: string): Promise<GapCandidate> => {
  const prog = await getProgressionByKey(classKey);
  const f = prog?.features.find((x) => x.key === featureKey);
  expect(f, `${featureKey} im Vault — Shim aktiv?`).toBeTruthy();
  return f as GapCandidate;
};

const feat = async (sourceKey: string): Promise<GapCandidate> => {
  const f = (await getFeats()).find((x) => x.sourceKey === sourceKey);
  expect(f, `${sourceKey} im Vault — Shim aktiv?`).toBeTruthy();
  return f as GapCandidate;
};

describe('Lückenmelder', () => {
  it('meldet eine undeklarierte Wahl genau einmal', async () => {
    const sculpt = await classFeature('srd-2024_evoker', 'srd-2024_wizard_evoker_sculpt-spells');
    const lines = declarationGapLines([sculpt]);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Zauber formen');
    expect(lines[0]).toContain('eine Wahl');
    // Die Zeile muss sagen, was zu tun ist — sie steht im Schritt-Log und im Merkmalsfeld.
    expect(lines[0]).toContain('im Editor nachtragen');
  });

  // `aiInterpretsRest` ist die Entscheidung „Bogenzeile ja, Mechanik nein" — der Melder darf
  // sie nicht als Lücke wiederholen. Magische Geheimnisse deklariert seinen weiteren Pool als
  // Patch, also war die Meldung dort ohnehin falsch.
  it('schweigt, wo `aiInterpretsRest` die Prosa der KI überlässt', async () => {
    const secrets = await classFeature('srd-2024_bard', 'srd-2024_bard_magical-secrets');
    expect(secrets.aiInterpretsRest, 'die Deklaration im Vault').toBe(true);
    expect(declarationGapLines([secrets])).toEqual([]);
  });

  /**
   * Die Anrufungen sind als Pool deklariert, ihre Optionstexte wirken aber Zauber („cast
   * *Mage Armor* … without expending a spell slot"), und ein Pool gewährt keine Mechanik.
   * Die Meldung wechselt damit von `choice` auf `spells` — sie bleibt richtig.
   */
  it('meldet am deklarierten Pool die Zauber seiner Optionen', async () => {
    const invocations = await classFeature('srd-2024_warlock', 'srd-2024_warlock_eldritch-invocations');
    expect(invocations.grantsChoice, 'die Deklaration im Vault').toBeTruthy();

    const lines = declarationGapLines([invocations]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Schauerliche Anrufungen');
    expect(lines[0]).toContain('Zauber an, die die Bibliothek nicht deklariert');
  });

  it('schweigt, wo die Bibliothek die Wahl deklariert', async () => {
    const primalOrder = await classFeature('srd-2024_druid', 'srd-2024_druid_primal-order');
    expect(primalOrder.grantsChoice, 'die Deklaration im Vault').toBeTruthy();
    expect(declarationGapLines([primalOrder])).toEqual([]);
  });

  /** Die zwei Formen, die bis #30/#31 keine Senke hatten und deshalb gemeldet wurden. */
  it('schweigt an den Talenten, die Attribut und Werkzeug jetzt deklarieren', async () => {
    const [grappler, boon, crafter] = await Promise.all([
      feat('srd-2024_grappler'),
      feat('srd-2024_boon-of-truesight'),
      feat('phb-2024_crafter'),
    ]);

    expect(declarationGaps([grappler, boon, crafter])).toEqual([]);
  });

  it('gibt einem Merkmal mit zwei Signalen nur eine Zeile', () => {
    // „Increase one ability score of your choice" trifft `ability` UND `choice`.
    const boon: GapCandidate = { name: 'Boon of Nothing', desc: 'Increase one ability score of your choice by 1.' };
    expect(declarationGapLines([boon])).toHaveLength(1);
    // Und dasselbe Merkmal zweimal im Bestand meldet auch nur einmal.
    expect(declarationGapLines([boon, boon])).toHaveLength(1);
  });

  it('lässt sich mit aiInterpretsRest abstellen', async () => {
    const invocations = await classFeature('srd-2024_warlock', 'srd-2024_warlock_eldritch-invocations');
    expect(declarationGapLines([{ ...invocations, aiInterpretsRest: true }])).toEqual([]);
    // Ohne Prosa gibt es kein Signal — ein leeres `desc` ist keine Lücke.
    expect(declarationGapLines([{ ...invocations, desc: '' }])).toEqual([]);
  });

  it('meldet den unredigierten Zweig einer getroffenen Wahl getrennt', async () => {
    const lines = declarationGapLines([], [{ name: 'Elven Lineage', nameDe: 'Elfen-Abstammung' }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Elfen-Abstammung');
    expect(lines[0]).toContain('die gewählte Option deklariert keine Wirkung');
  });
});
