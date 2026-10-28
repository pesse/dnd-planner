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
import { vaultFeatures } from '../support/vaultFeatures';
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

/** Nur die Prosa — so prüft der Test das SIGNAL, das die Deklarationen im Vault sonst überdecken. */
const signalOf = async (id: string) => {
  const v = (await vaultFeatures()).find((x) => x.id === id);
  expect(v, `${id} im Vault — Shim aktiv?`).toBeTruthy();
  const { name, nameDe, desc } = v!.feature;
  return declarationGaps([{ name, nameDe, desc }])[0]?.kind;
};

const feat = async (sourceKey: string): Promise<GapCandidate> => {
  const f = (await getFeats()).find((x) => x.sourceKey === sourceKey);
  expect(f, `${sourceKey} im Vault — Shim aktiv?`).toBeTruthy();
  return f as GapCandidate;
};

describe('Lückenmelder', () => {
  it('meldet eine undeklarierte Wahl genau einmal', () => {
    const sculpt: GapCandidate = {
      name: 'Sculpt Spells',
      nameDe: 'Zauber formen',
      desc: 'You can choose a number of them equal to 1 plus the spell’s level.',
    };
    const lines = declarationGapLines([sculpt]);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Zauber formen');
    expect(lines[0]).toContain('eine Wahl');
    // Die Zeile muss sagen, was zu tun ist — sie steht im Schritt-Log und im Merkmalsfeld.
    expect(lines[0]).toContain('im Editor nachtragen');
    // `grantsChoice: []` heißt „Wahl am Spieltisch, nicht im Flow" — geprüft, keine Lücke.
    expect(declarationGapLines([{ ...sculpt, grantsChoice: [] }])).toEqual([]);
  });

  it('meldet die einmal-pro-Rast-Formel als Vorrat', () => {
    const surge: GapCandidate = {
      name: 'Action Surge',
      desc: 'You can take one additional action. Once you do so, you can’t do so again until you finish a Short or Long Rest.',
    };
    expect(declarationGaps([surge])).toEqual([{ name: 'Action Surge', kind: 'resource' }]);
    expect(declarationGaps([{ ...surge, grantsResource: { pools: [], mods: [] } }])).toEqual([]);
  });

  it('hält Heilung und erwähnte Zaubertricks für keine Lücke', () => {
    const heal: GapCandidate = { name: 'Heal', desc: 'The creature regains Hit Points equal to your Wisdom modifier.' };
    const blessed: GapCandidate = { name: 'Blessed', desc: 'Add your Wisdom modifier to the damage of any Cleric cantrip.' };
    expect(declarationGaps([heal, blessed])).toEqual([]);
  });

  // `aiInterpretsRest` ist die Entscheidung „Bogenzeile ja, Mechanik nein" — der Melder darf
  // sie nicht als Lücke wiederholen. Magische Geheimnisse deklariert seinen weiteren Pool als
  // Patch, also war die Meldung dort ohnehin falsch.
  it('schweigt, wo `aiInterpretsRest` die Prosa der KI überlässt', async () => {
    const secrets = await classFeature('srd-2024_bard', 'srd-2024_bard_magical-secrets');
    expect(secrets.aiInterpretsRest, 'die Deklaration im Vault').toBe(true);
    expect(declarationGapLines([secrets])).toEqual([]);
  });

  /** Die Zauber der Anrufungen tragen Kontingente mit `when.pick` — der Pool ist damit gedeckt. */
  it('schweigt am Pool, dessen Options-Zauber deklariert sind', async () => {
    const invocations = await classFeature('srd-2024_warlock', 'srd-2024_warlock_eldritch-invocations');
    expect(invocations.grantsCasting, 'die Deklaration im Vault').toBeTruthy();
    expect(declarationGapLines([invocations])).toEqual([]);
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

  // #50: Prosa, die Zaubertricks VERÄNDERT oder „the location of" kennt, ist keine Gewährung.
  it.each([
    'srd-2024_cleric_blessed-strikes',
    'srd-2024_cleric_improved-blessed-strikes',
    'srd-2024_druid_elemental-fury',
    'srd-2024_druid_improved-elemental-fury',
    'srd-2024_wizard_evoker_potent-cantrip',
    'srd-2024_rogue_thief_use-magic-device',
    'srd-2024_paladin_channel-divinity',
  ])('hält %s für keine Zaubergewährung', async (id) => {
    expect(await signalOf(id)).not.toBe('spells');
  });

  // Die Gegenprobe: ein geschärftes Signal darf die echten Fälle nicht still verlieren.
  it.each([
    ['srd-2024_druid_druidic', 'spells'],
    ['srd-2024_paladin_fighting-style', 'spells'],
    ['srd-2024_ranger_fighting-style', 'spells'],
    ['srd-2024_college-of-lore_magical-discoveries', 'spells'],
    ['homebrew-sam_fairy_fairy-magic', 'spells'],
    ['srd-2024_warlock_mystic-arcanum', 'choice'],
    ['srd-2024_wizard_signature-spells', 'choice'],
  ])('erkennt %s ohne Deklaration als %s', async (id, kind) => {
    expect(await signalOf(id)).toBe(kind);
  });

  // `skills.choose` ist eine Fertigkeitswahl, die der Flow stellt — kein `grantsChoice` nötig.
  it.each(['srd-2024_human_skillful', 'srd-2024_skilled'])('zählt die offene Fertigkeitswahl von %s als deklariert', async (id) => {
    const v = (await vaultFeatures()).find((x) => x.id === id)!;
    expect(v.feature.grantsChoice, 'die Probe braucht ein Merkmal OHNE grantsChoice').toBeUndefined();
    expect(await signalOf(id)).toBe('choice');
    expect(declarationGaps([v.feature])).toEqual([]);
  });
});
