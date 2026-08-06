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
import { chosenOption, declaredChoiceRefs, isOptionListFeature, optionChoiceId, optionListChoice, optionListChoices, optionListNoteLines, optionListRefs, optionListRiders } from '../../src/lib/services/declaration/optionList';
import { expertiseChoice, expertiseChoiceId, expertiseChoices, expertiseRefs, expertiseRider, isExpertiseFeature } from '../../src/lib/services/declaration/expertise';
import { isLanguagesFeature, languageChoices, languageRiders } from '../../src/lib/services/declaration/languages';
import { buildFeatureChoices } from '../../src/lib/services/levelUp/questions';
import type { DeclaredChoiceSource } from '../../src/lib/services/declaration/source';
import { riderChanges } from '../../src/lib/services/levelUp/changes';
import { forClassFeaturesField } from '../../src/lib/services/declaredFeature';
import { classFeatureSchema } from '../../src/lib/schemas/classProgression';
import { traitSchema, migrateSpeciesLegacy } from '../../src/lib/schemas/species';
import { featSchema, migrateFeatLegacy } from '../../src/lib/schemas/feat';
import { CLASS_TABLE_CHOICE_KINDS, featureChoiceGrantSchema } from '../../src/lib/schemas/featureChoice';
import { castingGrantSchema } from '../../src/lib/schemas/casting';
import { spellAccessGrantOf } from '../../src/lib/services/spellcasting/access';
import { optionActivatesQuota, optionListRider, optionSpellNames, unredactedChoiceFeatures, withoutDeclaredChoiceFeatures } from '../../src/lib/services/declaration/optionList';
import { getSpeciesByKey } from '../../src/lib/speciesLibrary';
import { declaredFeatures as tagged, type DeclaredFeature } from '../../src/lib/services/declaredFeature';
import { withDeclaredGrants } from '../../src/lib/services/declaration/grants';

/** Die erste (hier: einzige) Wahl ihrer Art am Merkmal. */
const optionRef = <T extends DeclaredChoiceSource>(f: T) => optionListRefs(f)[0];
const expertiseRef = <T extends DeclaredChoiceSource>(f: T) => expertiseRefs(f)[0];

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
      for (const o of feature.grantsChoice!.flatMap((g) => g.options)) {
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
      for (const o of feature.grantsChoice!.flatMap((g) => g.options)) {
        expect(o.grants, `${feature.key} / ${o.value}`).toBeTruthy();
        expect(o.helpDe.trim(), `${feature.key} / ${o.value}`).not.toBe('');
      }
    }
  });

  it('baut die Wahl ohne Nach-Analyse-Bedarf', async () => {
    const prog = await getProgressionByKey('srd-2024_druid');
    const primal = prog!.features.find((f) => f.key === 'srd-2024_druid_primal-order')!;
    const choice = optionListChoice(optionRef(primal))!;

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
    const id = optionChoiceId(optionRef(primal));

    const warden = optionListRiders([primal], (q) => (q === id ? 'Warden' : ''), 1);
    expect(warden).toHaveLength(1);
    expect(warden[0].proficiencies.weapons).toEqual(['Martial']);
    expect(warden[0].proficiencies.armor).toEqual(['Medium']);
    expect(warden[0].extraCantrips).toBe(0);
    // Kein Protokoll-Eintrag: die Wahl schreibt `featureChoiceChanges` aus dem Fragebogen.
    expect(warden[0].decisions).toEqual([]);
    // Keine erfundene deutsche Notiz neben der englischen des Modells.
    expect(warden[0].sheetNote).toBe('');

    // Unbeantwortet → kein Rider. Ein leerer Rider wäre ein Grant von nichts.
    expect(optionListRiders([primal], () => '', 1)).toEqual([]);
    // Ein Label, das nicht im Vokabular steht, gewährt nichts (statt irgendetwas).
    expect(chosenOption(primal, 'Wächter')).toBeNull();
    expect(optionListRiders([primal], () => 'Wächter', 1)).toEqual([]);
  });

  /**
   * Kleriker und Druide deklarieren ihren Zusatz-Zaubertrick DOPPELT: als `extraCantrips` der
   * Option und als Quota mit `when.option`. Zählte der Rider mit, böte der Wizard 4 statt 3+1
   * Zaubertricks an und schriebe alle vier in die Klassen-Quota.
   */
  it('überlässt der Quota die Zahl, wenn die Option eine einschaltet', async () => {
    for (const [classKey, featureKey, option] of [
      ['srd-2024_druid', 'srd-2024_druid_primal-order', 'Magician'],
      ['srd-2024_cleric', 'srd-2024_cleric_divine-order', 'Thaumaturge'],
    ]) {
      const prog = await getProgressionByKey(classKey);
      const feature = prog!.features.find((f) => f.key === featureKey)!;
      expect(optionActivatesQuota(feature, option)).toBe(true);
      // Die Option gewährt SONST nichts — der Rider entfällt damit ganz.
      expect(optionListRiders([feature], () => option, 1)).toEqual([]);
    }
  });

  it('behält den Rider, wo keine Quota die Zahl führt', async () => {
    const feature = {
      key: 'homebrew-sam_test',
      name: 'Test',
      grantsChoice: [featureChoiceGrantSchema.parse({
        kind: 'optionList',
        options: [{ value: 'Extra', grants: { extraCantrips: 1 } }],
      })],
    };
    expect(optionActivatesQuota(feature, 'Extra')).toBe(false);
    expect(optionListRiders([feature], () => 'Extra', 1)[0].extraCantrips).toBe(1);
  });

  /**
   * Ohne diese Zeile wäre Stufe 1 eine REGRESSION: das Merkmal steht nicht mehr im
   * KI-Eingang, also schreibt Pass C keine `sheetNote` mehr dafür.
   */
  it('schreibt die getroffene Wahl deutsch auf den Bogen', async () => {
    const prog = await getProgressionByKey('srd-2024_druid');
    const primal = prog!.features.find((f) => f.key === 'srd-2024_druid_primal-order')!;
    const id = optionChoiceId(optionRef(primal));

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
    expect(found.sort()).toEqual([
      'srd-2024_bard_expertise',
      // Nicht das Expertise-Merkmal der Klasse, sondern eine von ZWEI Wahlen an einem Merkmal.
      'srd-2024_ranger_deft-explorer',
      'srd-2024_rogue_expertise',
    ]);
  });

  it('baut die Expertise-Wahl aus dem Übungsstand, nicht aus dem Vault', async () => {
    const prog = await getProgressionByKey('srd-2024_rogue');
    const feature = prog!.features.find((f) => f.key === 'srd-2024_rogue_expertise')!;

    const choice = expertiseChoice(expertiseRef(feature), ['Stealth', 'Acrobatics', 'Perception'])!;
    expect(choice.type).toBe('multiselect');
    expect(choice.max).toBe(2);
    expect(choice.options).toEqual(['Stealth', 'Acrobatics', 'Perception']);
    expect(choice.optionsDe).toEqual(['Heimlichkeit', 'Akrobatik', 'Wahrnehmung']);
    expect(choice.determinesFurtherEffects).toBe(false);

    // Expertise stapelt nicht: auf Stufe 6 sind zwei WEITERE zu wählen.
    const second = expertiseChoice(expertiseRef(feature), ['Stealth', 'Acrobatics', 'Perception'], ['Stealth'])!;
    expect(second.options).toEqual(['Acrobatics', 'Perception']);
    // Mehr Plätze als Optionen wäre eine unerfüllbare Pflichtfrage.
    expect(expertiseChoice(expertiseRef(feature), ['Stealth'], [])!.max).toBe(1);
    // Ohne geübte Fertigkeit gar keine Frage (statt einer leeren Liste).
    expect(expertiseChoice(expertiseRef(feature), [])).toBeNull();
  });

  it('macht aus der Expertise-Antwort einen Rider mit englischem Vokabular', async () => {
    const prog = await getProgressionByKey('srd-2024_rogue');
    const feature = prog!.features.find((f) => f.key === 'srd-2024_rogue_expertise')!;
    expect(expertiseChoiceId(expertiseRef(feature))).toBe('expertise_srd-2024-rogue-expertise');

    const rider = expertiseRider(expertiseRef(feature), ['Stealth', 'Sleight of Hand'])!;
    expect(rider.expertiseSkills).toEqual(['Stealth', 'Sleight of Hand']);
    expect(rider.featureKey).toBe('srd-2024_rogue_expertise');
    // Ein deutscher Wert wäre der stille Ausfall, den `skillSheetKey` abfangen soll —
    // hier fällt er stattdessen ganz heraus.
    expect(expertiseRider(expertiseRef(feature), ['Heimlichkeit'])).toBeNull();
    expect(expertiseRider(expertiseRef(feature), [])).toBeNull();
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
    grantsChoice: [featureChoiceGrantSchema.parse({
      kind: 'optionList',
      options: [
        { value: 'Warden', labelDe: 'Wächter', helpDe: 'Kriegswaffen', grants: { proficiencies: { weapons: ['Martial'] } } },
        { value: 'Magician', labelDe: 'Magier', helpDe: 'Ein Zaubertrick', grants: { extraCantrips: 1 } },
      ],
    })],
  };
  const carriers = ['class', 'subclass', 'species', 'feat'] as const;

  it('liefert je Herkunft dieselbe Wahl', () => {
    const choices = carriers.map((source) => optionListChoice(optionRef({ ...DECL, source })));
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
      expect(p.grantsChoice?.[0].count).toBe(2);
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

  /**
   * Gelesen wird immer eine Liste. Das Einzelobjekt bleibt gültige Eingabe, sonst müsste der
   * ganze Vault umgeschrieben werden, ehe ein Merkmal seine zweite Wahl bekommen darf.
   */
  it('liest ein Einzelobjekt wie eine Liste mit einem Eintrag', () => {
    const one = featSchema.parse({ name: 'X', grantsChoice: { kind: 'expertise', count: 2 } });
    const many = featSchema.parse({
      name: 'X',
      grantsChoice: [{ kind: 'expertise', count: 2 }, { kind: 'optionList', options: [{ value: 'Forest' }] }],
    });

    expect(one.grantsChoice?.map((g) => g.kind)).toEqual(['expertise']);
    expect(many.grantsChoice?.map((g) => g.kind)).toEqual(['expertise', 'optionList']);
    // Die leere Liste ist die geprüfte Form („angesehen, gewährt keine Wahl") und bleibt
    // vom fehlenden Feld unterscheidbar.
    expect(featSchema.parse({ name: 'X', grantsChoice: [] }).grantsChoice).toEqual([]);
    expect(featSchema.parse({ name: 'X' }).grantsChoice).toBeUndefined();
  });

  it('stellt jede Wahl eines Merkmals einzeln — mit eigener Frage-id', () => {
    const deft = tagged('feat', [featSchema.parse({
      key: 'test_deft',
      name: 'Deft Explorer',
      grantsChoice: [
        { kind: 'expertise', count: 1 },
        { kind: 'optionList', options: [{ value: 'Forest', labelDe: 'Wald' }, { value: 'Desert' }] },
      ],
    })])[0];

    expect(optionListChoices([deft]).map((c) => c.id)).toEqual(['optionlist_test-deft']);
    expect(expertiseChoices([deft], ['Stealth']).map((c) => c.id)).toEqual(['expertise_test-deft']);
    // Beide zusammen, in Deklarationsreihenfolge — das ist, was die Merkmalsleiste anzeigt.
    expect(declaredChoiceRefs(deft).map((r) => r.grant.kind)).toEqual(['expertise', 'optionList']);
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

/**
 * Die Sprachwahl hat als einziger `kind` KEIN Vokabular. Diese Datei hält deshalb fest, dass
 * sie eine Freitextfrage stellt statt einer leeren Optionsliste — ein Picker ohne Optionen
 * wäre unbeantwortbar — und dass die getippten Namen unverändert bis zur Änderung durchkommen.
 */
describe('deklarierte Sprachwahl', () => {
  const LANGUAGE_ID = 'languages_srd-2024-ranger-deft-explorer';
  const deft = async () => {
    const prog = await getProgressionByKey('srd-2024_ranger');
    const f = prog?.features.find((x) => x.key === 'srd-2024_ranger_deft-explorer');
    expect(f, 'Geschickte Erkundung im Vault').toBeTruthy();
    return tagged('class', [f!])[0];
  };

  it('deklariert die Sprachwahl im ganzen Vault nur dort, wo sie der ganze Rest ist', async () => {
    const found: string[] = [];
    for (const info of await getClasses()) {
      const prog = await getProgressionByKey(libraryKey(info));
      for (const f of prog?.features ?? []) if (isLanguagesFeature(f)) found.push(f.key);
    }
    // „Diebessprache" gewährt neben der freien Wahl eine FESTE Sprache. Die steht in
    // `grants.languages`, sonst fiele sie mit dem Merkmal aus der KI-Deutung.
    expect(found.sort()).toEqual(['srd-2024_ranger_deft-explorer', 'srd-2024_rogue_thieves-cant']);
  });

  it('fragt als Freitext, nicht als Optionsliste', async () => {
    const [choice, ...rest] = languageChoices([await deft()]);
    expect(rest).toEqual([]);
    expect(choice.id).toBe(LANGUAGE_ID);
    expect(choice.type).toBe('text');
    expect(choice.max).toBe(2);
    expect(choice.options, 'ohne Vokabular gibt es nichts anzubieten').toEqual([]);
    // Der Fragebogen macht daraus ein Eingabefeld — als `choice` bliebe die Frage tot.
    expect(buildFeatureChoices([choice])[0].type).toBe('text');
  });

  it('schreibt die getippten Sprachen ins Änderungs-Dokument', async () => {
    const f = await deft();
    const riders = languageRiders([f], (id) => (id === LANGUAGE_ID ? 'Elbisch, Zwergisch' : ''));
    const changes = riderChanges(
      { riders, flagged: [], grantedCantrips: [], grantedPrepared: [] },
      'feature-effects',
    );
    // Deutsch bis auf den Bogen: es gibt keine Liste, aus der eine englische Kanonform käme.
    expect(changes.filter((c) => c.target === 'language').map((c) => c.value)).toEqual(['Elbisch', 'Zwergisch']);
    expect(languageRiders([f], () => '')).toEqual([]);
  });

  /**
   * Beide Hälften desselben Merkmals stehen nebeneinander — deklarierte man nur die Sprachen,
   * fiele das Merkmal aus dem KI-Eingang und die Expertise verschwände still.
   */
  it('stellt Expertise und Sprachen als zwei Fragen an einem Merkmal', async () => {
    const f = await deft();
    expect(declaredChoiceRefs(f).map((r) => r.grant.kind)).toEqual(['expertise', 'languages']);
    expect([...expertiseChoices([f], ['Stealth']), ...languageChoices([f])].map((c) => c.id))
      .toEqual(['expertise_srd-2024-ranger-deft-explorer', LANGUAGE_ID]);
  });
});

/**
 * Die feste Sprache steht in `grants.languages`, NEBEN `proficiencies` — in 2024 ist sie keine
 * Übung. Am Vault hängt daran die Frage, ob eine Deklaration das Merkmal aus der KI-Deutung
 * nimmt: `grantsChoice` tut es, ein reines `grants` nicht.
 */
describe('fest gewährte Sprache', () => {
  const classFeature = async (classKey: string, featureKey: string) => {
    const prog = await getProgressionByKey(classKey);
    const f = prog?.features.find((x) => x.key === featureKey);
    expect(f, `${featureKey} im Vault`).toBeTruthy();
    return tagged('class', [f!])[0];
  };
  const languagesOf = (features: DeclaredFeature[], answerOf: (id: string) => string = () => '') =>
    riderChanges(
      {
        riders: [...withDeclaredGrants([], features), ...languageRiders(features, answerOf)],
        flagged: [], grantedCantrips: [], grantedPrepared: [],
      },
      'feature-effects',
    ).filter((c) => c.target === 'language').map((c) => c.value);

  it('bringt „Druidisch" auf den Bogen und lässt das Merkmal trotzdem in der KI-Deutung', async () => {
    const druidic = await classFeature('srd-2024_druid', 'srd-2024_druid_druidic');
    expect(languagesOf([druidic])).toEqual(['Druidisch']);
    // Der Dauerzauber und die Bogen-Notiz bleiben Sache des Modells — nur `grantsChoice` filtert.
    expect(withoutDeclaredChoiceFeatures([druidic])).toEqual([druidic]);
  });

  it('trägt bei „Diebessprache" feste und gewählte Sprache nebeneinander', async () => {
    const cant = await classFeature('srd-2024_rogue', 'srd-2024_rogue_thieves-cant');
    expect(withoutDeclaredChoiceFeatures([cant]), 'die Wahl nimmt es aus der KI-Deutung').toEqual([]);
    expect(languagesOf([cant], () => 'Elbisch')).toEqual(['Diebessprache', 'Elbisch']);
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
      grantsChoice: [featureChoiceGrantSchema.parse({
        kind: 'spellAccess',
        spellLists: ['wizard'],
        spellAbilities: ['Intelligence'],
        spellPicks: [{ level: 0, count: 1 }],
      })],
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
      expect(g?.picks).toEqual([{ level: 0, count: 1, sourceId: 'test_cantrip', quotaId: 'cantrip' }]);
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
    expect(f.grantsChoice?.flatMap((g) => g.options).map((o) => o.value)).toEqual(['Drow', 'High Elf', 'Wood Elf']);
  });

  it('staffelt die Zauber des gewählten Zweigs über die Stufen', async () => {
    const f = await lineage();
    expect(optionListRider(optionRef(f), 'High Elf', 1)?.grantedSpells).toEqual(['Prestidigitation']);
    expect(optionListRider(optionRef(f), 'High Elf', 3)?.grantedSpells).toEqual(['Prestidigitation', 'Detect Magic']);
    expect(optionListRider(optionRef(f), 'High Elf', 5)?.grantedSpells)
      .toEqual(['Prestidigitation', 'Detect Magic', 'Misty Step']);
    // Kein Zweig bekommt die Zauber eines anderen — genau das konnte `grantsSpells` nicht.
    expect(optionListRider(optionRef(f), 'Drow', 5)?.grantedSpells).toEqual(['Dancing Lights', 'Faerie Fire', 'Darkness']);
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
      grantsChoice: [featureChoiceGrantSchema.parse({
        kind: 'optionList',
        options: [{ value: 'Drow', grants: {} }],
      })],
    };
    expect(unredactedChoiceFeatures([redacted], () => 'Drow')).toEqual([]);
  });
});
