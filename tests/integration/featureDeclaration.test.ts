/**
 * Deklarierte Zweigwahlen (`grantsChoice.kind === 'optionList'`) — OHNE LLM, über den
 * ECHTEN Vault.
 *
 * Diese Datei hält die zwei Zusicherungen fest, die vorher am Prompt hingen:
 * die Optionen sind ZITATE aus dem Regeltext (ein erfundenes Label bricht die gespeicherte
 * Antwort still), und die Wirkung steht neben der Option (`determinesFurtherEffects` kann
 * damit nie wieder true werden). Begründung: `docs/plan/plan-wahlen-deklarieren.md`, Stufe 1.
 *
 *   npm run test -- featureDeclaration
 */
import { describe, expect, it } from 'vitest';
import { getClasses } from '../../src/lib/classLibrary';
import { libraryKey } from '../support/libraryKey';
import { getProgressionByKey } from '../../src/lib/services/classProgression';
import type { ClassFeature } from '../../src/lib/schemas/classProgression';
import { chosenOption, isOptionListFeature, optionChoiceId, optionListChoice, optionListNoteLines, optionListRiders } from '../../src/lib/services/declaration/optionList';
import { expertiseChoice, expertiseChoiceId, expertiseRider, isExpertiseFeature } from '../../src/lib/services/declaration/expertise';
import { riderChanges } from '../../src/lib/services/levelUp/changes';
import { forClassFeaturesField } from '../../src/lib/services/declaredFeature';
import { classFeatureSchema } from '../../src/lib/schemas/classProgression';
import { traitSchema, migrateSpeciesLegacy } from '../../src/lib/schemas/species';
import { featSchema, migrateFeatLegacy } from '../../src/lib/schemas/feat';
import { CLASS_TABLE_CHOICE_KINDS, featureChoiceGrantSchema } from '../../src/lib/schemas/featureChoice';
import { castingGrantSchema } from '../../src/lib/schemas/casting';
import { spellAccessGrantOf } from '../../src/lib/services/spellAccess';
import { optionListRider, optionSpellNames, unredactedChoiceFeatures } from '../../src/lib/services/declaration/optionList';
import { getSpeciesByKey } from '../../src/lib/speciesLibrary';
import { declaredFeatures as tagged } from '../../src/lib/services/declaredFeature';

const declaredFeatures = async (): Promise<{ klass: string; feature: ClassFeature }[]> => {
  const out: { klass: string; feature: ClassFeature }[] = [];
  for (const info of await getClasses()) {
    const key = libraryKey(info);
    const prog = await getProgressionByKey(key);
    for (const feature of prog?.features ?? []) {
      if (isOptionListFeature(feature)) out.push({ klass: key, feature });
    }
  }
  return out;
};

describe('deklarierte Zweigwahlen', () => {
  it('deklariert im ganzen Vault genau die redigierten Merkmale', async () => {
    const declared = await declaredFeatures();
    expect((await getClasses()).length, 'Vault-Shim aktiv?').toBeGreaterThan(5);
    expect(declared.map((d) => d.feature.key).sort()).toEqual([
      'srd-2024_cleric_divine-order',
      'srd-2024_druid_primal-order',
    ]);
  });

  it('nimmt jedes Options-Label WÖRTLICH aus dem Regeltext (beide Sprachen)', async () => {
    for (const { feature } of await declaredFeatures()) {
      for (const o of feature.grantsChoice!.options) {
        // Der englische Wert ist der Schlüssel, gegen den die gespeicherte Antwort matcht —
        // eine Paraphrase findet ihren Zweig nie wieder.
        expect(feature.desc, `${feature.key} / ${o.value}`).toContain(`**${o.value}.**`);
        // Das deutsche Label ist ein ZITAT aus descDe, keine Übersetzung.
        if (o.labelDe) expect(feature.descDe ?? '', `${feature.key} / ${o.labelDe}`).toContain(`**${o.labelDe}.**`);
      }
    }
  });

  it('gibt jeder Option eine Konsequenz — sonst wäre die Wahl folgenlos', async () => {
    for (const { feature } of await declaredFeatures()) {
      for (const o of feature.grantsChoice!.options) {
        expect(o.grants, `${feature.key} / ${o.value}`).toBeTruthy();
        expect(o.helpDe.trim(), `${feature.key} / ${o.value}`).not.toBe('');
      }
    }
  });

  it('baut die Wahl ohne Nach-Analyse-Bedarf', async () => {
    const prog = await getProgressionByKey('srd-2024_druid');
    const primal = prog!.features.find((f) => f.key === 'srd-2024_druid_primal-order')!;
    const choice = optionListChoice(primal)!;

    expect(choice.options).toEqual(['Magician', 'Warden']);
    expect(choice.optionsDe).toEqual(['Magier', 'Wächter']);
    expect(choice.questionDe).toContain('Urtümliche Ordnung');
    expect(choice.featureKey).toBe('srd-2024_druid_primal-order');
    // Die beiden Flaggen sind der Kern: dauerhaft, aber ohne Folge-Berechnung.
    expect(choice.isBuildDecision).toBe(true);
    expect(choice.determinesFurtherEffects).toBe(false);
  });

  it('liefert den Rider der getroffenen Wahl — und nur den', async () => {
    const prog = await getProgressionByKey('srd-2024_druid');
    const primal = prog!.features.find((f) => f.key === 'srd-2024_druid_primal-order')!;
    const id = optionChoiceId(primal);

    const warden = optionListRiders([primal], (q) => (q === id ? 'Warden' : ''), 1);
    expect(warden).toHaveLength(1);
    expect(warden[0].proficiencies.weapons).toEqual(['Martial']);
    expect(warden[0].proficiencies.armor).toEqual(['Medium']);
    expect(warden[0].extraCantrips).toBe(0);
    // Kein Protokoll-Eintrag: die Wahl schreibt `featureChoiceChanges` aus dem Fragebogen.
    expect(warden[0].decisions).toEqual([]);
    // Keine erfundene deutsche Notiz neben der englischen des Modells.
    expect(warden[0].sheetNote).toBe('');

    const magician = optionListRiders([primal], () => 'Magician', 1);
    expect(magician[0].extraCantrips).toBe(1);
    expect(magician[0].proficiencies.weapons).toEqual([]);

    // Unbeantwortet → kein Rider. Ein leerer Rider wäre ein Grant von nichts.
    expect(optionListRiders([primal], () => '', 1)).toEqual([]);
    // Ein Label, das nicht im Vokabular steht, gewährt nichts (statt irgendetwas).
    expect(chosenOption(primal, 'Wächter')).toBeNull();
    expect(optionListRiders([primal], () => 'Wächter', 1)).toEqual([]);
  });

  /**
   * Ohne diese Zeile wäre Stufe 1 eine REGRESSION: das Merkmal steht nicht mehr im
   * KI-Eingang, also schreibt Pass C keine `sheetNote` mehr dafür.
   */
  it('schreibt die getroffene Wahl deutsch auf den Bogen', async () => {
    const prog = await getProgressionByKey('srd-2024_druid');
    const primal = prog!.features.find((f) => f.key === 'srd-2024_druid_primal-order')!;
    const id = optionChoiceId(primal);

    expect(optionListNoteLines([primal], (q) => (q === id ? 'Warden' : ''))).toEqual([
      'Urtümliche Ordnung: Wächter — Übung mit Kriegswaffen, mittelschwere Rüstung',
    ]);
    expect(optionListNoteLines([primal], () => '')).toEqual([]);
  });

  it('bringt Waffen- und Rüstungsübung ins Änderungs-Dokument', async () => {
    const prog = await getProgressionByKey('srd-2024_druid');
    const primal = prog!.features.find((f) => f.key === 'srd-2024_druid_primal-order')!;
    const riders = optionListRiders([primal], () => 'Warden', 1);
    const changes = riderChanges(
      { riders, flagged: [], grantedCantrips: [], grantedPrepared: [] },
      'feature-effects',
    );
    expect(changes.filter((c) => c.target === 'weaponProficiency')).toEqual([
      { target: 'weaponProficiency', value: 'Martial', step: 'feature-effects', source: 'class-feature', label: 'Übung: Kriegswaffen' },
    ]);
    expect(changes.filter((c) => c.target === 'armorTraining').map((c) => c.value)).toEqual(['Medium']);
  });

  it('deklariert Expertise nur, wo die Regel sie kennt', async () => {
    const found: string[] = [];
    for (const info of await getClasses()) {
      const prog = await getProgressionByKey(libraryKey(info));
      for (const f of prog?.features ?? []) if (isExpertiseFeature(f)) found.push(f.key);
    }
    expect(found.sort()).toEqual(['srd-2024_bard_expertise', 'srd-2024_rogue_expertise']);
  });

  it('baut die Expertise-Wahl aus dem Übungsstand, nicht aus dem Vault', async () => {
    const prog = await getProgressionByKey('srd-2024_rogue');
    const feature = prog!.features.find((f) => f.key === 'srd-2024_rogue_expertise')!;

    const choice = expertiseChoice(feature, ['Stealth', 'Acrobatics', 'Perception'])!;
    expect(choice.type).toBe('multiselect');
    expect(choice.max).toBe(2);
    expect(choice.options).toEqual(['Stealth', 'Acrobatics', 'Perception']);
    expect(choice.optionsDe).toEqual(['Heimlichkeit', 'Akrobatik', 'Wahrnehmung']);
    expect(choice.determinesFurtherEffects).toBe(false);

    // Expertise stapelt nicht: auf Stufe 6 sind zwei WEITERE zu wählen.
    const second = expertiseChoice(feature, ['Stealth', 'Acrobatics', 'Perception'], ['Stealth'])!;
    expect(second.options).toEqual(['Acrobatics', 'Perception']);
    // Mehr Plätze als Optionen wäre eine unerfüllbare Pflichtfrage.
    expect(expertiseChoice(feature, ['Stealth'], [])!.max).toBe(1);
    // Ohne geübte Fertigkeit gar keine Frage (statt einer leeren Liste).
    expect(expertiseChoice(feature, [])).toBeNull();
  });

  it('macht aus der Expertise-Antwort einen Rider mit englischem Vokabular', async () => {
    const prog = await getProgressionByKey('srd-2024_rogue');
    const feature = prog!.features.find((f) => f.key === 'srd-2024_rogue_expertise')!;
    expect(expertiseChoiceId(feature)).toBe('expertise_srd-2024-rogue-expertise');

    const rider = expertiseRider(feature, ['Stealth', 'Sleight of Hand'])!;
    expect(rider.expertiseSkills).toEqual(['Stealth', 'Sleight of Hand']);
    expect(rider.featureKey).toBe('srd-2024_rogue_expertise');
    // Ein deutscher Wert wäre der stille Ausfall, den `skillSheetKey` abfangen soll —
    // hier fällt er stattdessen ganz heraus.
    expect(expertiseRider(feature, ['Heimlichkeit'])).toBeNull();
    expect(expertiseRider(feature, [])).toBeNull();
  });

  it('hält die deklarierten Merkmale aus dem KI-Eingang des Wizards heraus', async () => {
    const { buildFeaturePrep } = await import('../../src/lib/services/wizard/featurePrep');
    const prep = await buildFeaturePrep({
      species: { sourceKey: 'srd-2024_dwarf', name: 'Zwerg' },
      klass: { sourceKey: 'srd-2024_druid', name: 'Druide' },
      background: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
    });
    // EINE getaggte Liste, gefiltert nach Deklarations-Art — nicht zwei Felder je Art.
    expect(prep.declared.filter(isOptionListFeature).map((f) => f.key)).toEqual([
      'srd-2024_druid_primal-order',
    ]);
    expect(prep.declared.filter(isExpertiseFeature)).toEqual([]);
    expect(prep.gained.map((f) => f.name)).not.toContain('Primal Order');
    expect(prep.analysisGained.map((f) => f.name)).not.toContain('Primal Order');
  });
});

/**
 * Die Zusicherung, auf die der Symmetrie-Umbau hinausläuft: DERSELBE `optionList`-Fall
 * liefert dieselbe Wahl und denselben Rider, egal ob er als Klassenmerkmal, als
 * Speziesmerkmal oder als Talent daherkommt. Fällt sie, ist irgendwo wieder ein
 * herkunfts-spezifischer Zweig eingezogen.
 */
describe('die Herkunft entscheidet nichts über die Mechanik', () => {
  const DECL = {
    key: 'test_order',
    name: 'Test Order',
    nameDe: 'Testorden',
    desc: 'Choose one.',
    grantsChoice: featureChoiceGrantSchema.parse({
      kind: 'optionList',
      options: [
        { value: 'Warden', labelDe: 'Wächter', helpDe: 'Kriegswaffen', grants: { proficiencies: { weapons: ['Martial'] } } },
        { value: 'Magician', labelDe: 'Magier', helpDe: 'Ein Zaubertrick', grants: { extraCantrips: 1 } },
      ],
    }),
  };
  const carriers = ['class', 'subclass', 'species', 'feat'] as const;

  it('liefert je Herkunft dieselbe Wahl', () => {
    const choices = carriers.map((source) => optionListChoice({ ...DECL, source }));
    for (const c of choices) {
      expect(c?.options).toEqual(['Warden', 'Magician']);
      expect(c?.optionsDe).toEqual(['Wächter', 'Magier']);
      expect(c?.determinesFurtherEffects, 'die Wirkung steht neben der Option').toBe(false);
    }
    // Bis auf nichts: die Wahl ist über alle Herkünfte identisch.
    expect(new Set(choices.map((c) => JSON.stringify(c))).size).toBe(1);
  });

  it('liefert je Herkunft denselben Rider — nur `source` unterscheidet sich', () => {
    const riders = carriers.map(
      (source) => optionListRiders([{ ...DECL, source }], () => 'Warden', 1)[0],
    );
    for (const [i, r] of riders.entries()) {
      expect(r.featureKey).toBe('test_order');
      expect(r.proficiencies.weapons).toEqual(['Martial']);
      // Die Provenienz folgt dem Merkmal statt pauschal 'class' zu sein.
      expect(r.source).toBe(carriers[i]);
    }
    expect(new Set(riders.map((r) => JSON.stringify({ ...r, source: '' }))).size).toBe(1);
  });

  it('gibt die Bogen-Zeile nur den Nicht-Spezies-Herkünften', () => {
    const all = carriers.map((source) => ({ ...DECL, source }));
    const lines = optionListNoteLines(all.filter(forClassFeaturesField), () => 'Warden');
    expect(lines.length, 'Klasse, Subklasse und Talent — nicht die Spezies').toBe(3);
    // Ein Trait steht im Volksmerkmale-Text und trägt seine Wahl dort.
    expect(all.filter(forClassFeaturesField).map((f) => f.source)).toEqual(['class', 'subclass', 'feat']);
  });
});

/** Die drei Deklarationen müssen an allen drei Trägern dasselbe Feld sein. */
describe('die Deklaration ist an allen Trägern dieselbe', () => {
  const decl = {
    grants: { proficiencies: { skills: { fixed: ['Stealth'] } } },
    grantsChoice: { kind: 'expertise', count: 2 },
    grantsSpells: { kind: 'levelTable' },
  };

  it('überlebt Klassenmerkmal, Speziesmerkmal und Talent gleich', () => {
    const parsed = [
      classFeatureSchema.parse({ name: 'X', ...decl }),
      traitSchema.parse({ name: 'X', ...decl }),
      featSchema.parse({ name: 'X', ...decl }),
    ];
    for (const p of parsed) {
      expect(p.grants?.proficiencies.skills.fixed).toEqual(['Stealth']);
      expect(p.grantsChoice?.count).toBe(2);
      expect(p.grantsSpells?.kind).toBe('levelTable');
    }
  });

  it('hebt ein Altformat-`proficiencyGrant` in die Deklaration und löscht es', () => {
    const legacy = { skills: { fixed: [], choose: 1, from: ['Insight'] } };
    const trait = traitSchema.parse(
      (migrateSpeciesLegacy({ traits: [{ name: 'Keen Senses', proficiencyGrant: legacy }] }).traits as unknown[])[0],
    );
    expect(trait.grants?.proficiencies.skills.choose).toBe(1);
    expect(trait.grants?.proficiencies.skills.from).toEqual(['Insight']);
    expect('proficiencyGrant' in trait, 'keine zweite Wahrheit').toBe(false);

    const feat = featSchema.parse(migrateFeatLegacy({ name: 'Skilled', proficiencyGrant: { skills: { choose: 3 } } }));
    expect(feat.grants?.proficiencies.skills.choose).toBe(3);
  });

  it('lässt eine vorhandene Deklaration gewinnen', () => {
    const folded = migrateFeatLegacy({
      name: 'X',
      proficiencyGrant: { skills: { fixed: ['Stealth'] } },
      grants: { proficiencies: { skills: { fixed: ['Arcana'] } } },
    });
    expect(featSchema.parse(folded).grants?.proficiencies.skills.fixed).toEqual(['Arcana']);
  });
});

describe('die Senke des kind entscheidet, nicht der Träger', () => {
  // Der Editor leitet sein Dropdown aus dieser Liste ab. Stünde `spellAccess` darin, verlöre
  // „Eingeweihter der Magie" seinen Editor — und es ist der einzige Vault-Eintrag mit `kind`.
  it('braucht nur die drei Stufentabellen-kinds die Klasse', () => {
    expect([...CLASS_TABLE_CHOICE_KINDS].sort()).toEqual(['featCategory', 'spellcasting', 'weaponMastery']);
  });

  it('liest denselben Zauber-Zugang an Klassenmerkmal, Speziesmerkmal und Talent', () => {
    const decl = {
      key: 'test_cantrip',
      name: 'Cantrip',
      grantsChoice: featureChoiceGrantSchema.parse({
        kind: 'spellAccess',
        spellLists: ['wizard'],
        spellAbilities: ['Intelligence'],
        spellPicks: [{ level: 0, count: 1 }],
      }),
      // Die Zahlen liest `spellAccessGrantOf` inzwischen von hier, `grantsChoice` bleibt nur
      // das Zugehörigkeits-Signal.
      grantsCasting: castingGrantSchema.parse({
        ability: { choose: ['Intelligence'] },
        quotas: [
          { id: 'cantrip', tier: 'prepared', levels: [0], count: { base: 1 }, pool: { lists: ['wizard'] }, cast: [{ kind: 'at-will' }] },
        ],
      }),
    };
    const grants = (['class', 'species', 'feat'] as const).map(
      (src) => spellAccessGrantOf(tagged(src, [decl])[0]),
    );
    for (const g of grants) {
      expect(g?.lists).toEqual(['wizard']);
      expect(g?.abilities).toEqual(['Intelligence']);
      expect(g?.picks).toEqual([{ level: 0, count: 1 }]);
    }
  });
});

describe('Elfenabstammung: Zweig entscheidet, Stufe staffelt', () => {
  const lineage = async () => {
    const spec = await getSpeciesByKey('srd-2024_elf');
    const t = spec?.traits.find((x) => x.key === 'srd-2024_elf_elven-lineage');
    expect(t, 'Elfenabstammung im Vault').toBeTruthy();
    return { ...t!, source: 'species' as const };
  };

  it('deklariert die drei Abstammungen', async () => {
    const f = await lineage();
    expect(isOptionListFeature(f)).toBe(true);
    expect(f.grantsChoice?.options.map((o) => o.value)).toEqual(['Drow', 'High Elf', 'Wood Elf']);
  });

  it('staffelt die Zauber des gewählten Zweigs über die Stufen', async () => {
    const f = await lineage();
    expect(optionListRider(f, 'High Elf', 1)?.grantedSpells).toEqual(['Prestidigitation']);
    expect(optionListRider(f, 'High Elf', 3)?.grantedSpells).toEqual(['Prestidigitation', 'Detect Magic']);
    expect(optionListRider(f, 'High Elf', 5)?.grantedSpells)
      .toEqual(['Prestidigitation', 'Detect Magic', 'Misty Step']);
    // Kein Zweig bekommt die Zauber eines anderen — genau das konnte `grantsSpells` nicht.
    expect(optionListRider(f, 'Drow', 5)?.grantedSpells).toEqual(['Dancing Lights', 'Faerie Fire', 'Darkness']);
  });

  it('liest die Stufen 3 und 5 später aus der gespeicherten Antwort', async () => {
    const f = await lineage();
    expect(optionSpellNames([f], () => 'Wood Elf', 1)).toEqual(['Druidcraft']);
    expect(optionSpellNames([f], () => 'Wood Elf', 5))
      .toEqual(['Druidcraft', 'Longstrider', 'Pass without Trace']);
    expect(optionSpellNames([f], () => '', 5), 'ohne Antwort keine Zauber').toEqual([]);
  });

  it('bleibt für die Prosa-Mechanik im Eingang von Pass C', async () => {
    const f = await lineage();
    const passed = unredactedChoiceFeatures([f], () => 'Drow');
    expect(passed).toHaveLength(1);
    expect(passed[0].choice, 'die Antwort reist als FINAL mit').toBe('Drow');

    // Sobald der Zweig seine Mechanik deklariert — auch als geprüft-und-leer — gibt es
    // nichts zu deuten und der Call fällt weg.
    const redacted = {
      ...f,
      grantsChoice: featureChoiceGrantSchema.parse({
        kind: 'optionList',
        options: [{ value: 'Drow', grants: {} }],
      }),
    };
    expect(unredactedChoiceFeatures([redacted], () => 'Drow')).toEqual([]);
  });
});
