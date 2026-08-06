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
import {
  isSkillProficiencyFeature, skillProficiencyChoice, skillProficiencyRefs, skillProficiencyRiders,
} from '../../src/lib/services/declaration/skillProficiency';
import { isLanguagesFeature, languageChoices, languageRiders } from '../../src/lib/services/declaration/languages';
import { SKILL_NAMES } from '../../src/lib/schemas/vocabulary';
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
      // Zweigwahl MIT modellierter Wirkung (`options[].grants`)…
      'srd-2024_cleric_divine-order',
      'srd-2024_druid_primal-order',
      // …und die, deren Wirkung `featureGrantSchema` nicht ausdrückt: deterministisch ist bei
      // ihnen die FRAGE, die Prosa deutet weiterhin Pass C.
      'srd-2024_cleric_blessed-strikes',
      'srd-2024_druid_elemental-fury',
      'srd-2024_ranger_hunter_defensive-tactics',
      'srd-2024_ranger_hunter_hunters-prey',
      'srd-2024_sorcerer_draconic-sorcery_elemental-affinity',
    ].sort());
  });

  /**
   * Wörtlich, aber nicht mehr nur als Fettmarke `**Option.**`: Optionen stehen auch in einer
   * Tabelle (Drakonische Urahnen) oder als Prosa-Aufzählung.
   */
  it('nimmt jedes Options-Label WÖRTLICH aus dem Regeltext (beide Sprachen)', async () => {
    for (const { feature } of await declaredFeatures()) {
      for (const o of feature.grantsChoice!.flatMap((g) => g.options)) {
        // Der englische Wert ist der Schlüssel, gegen den die gespeicherte Antwort matcht.
        expect(feature.desc, `${feature.key} / ${o.value}`).toContain(o.value);
        // Das deutsche Label ist ein ZITAT aus descDe, keine Übersetzung.
        if (o.labelDe) expect(feature.descDe ?? '', `${feature.key} / ${o.labelDe}`).toContain(o.labelDe);
      }
    }
  });

  /**
   * `helpDe` ist Pflicht, `grants` nicht: die Konsequenz muss benannt sein (sie ist die
   * Bogen-Zeile), modellierbar ist sie nur, soweit `featureGrantSchema` reicht — Zusatzschaden
   * und Resistenz kennt es nicht. Ohne `grants` deutet Pass C die Prosa.
   */
  it('gibt jeder Option eine benannte Konsequenz — sonst wäre die Wahl folgenlos', async () => {
    for (const { feature } of await declaredFeatures()) {
      for (const o of feature.grantsChoice!.flatMap((g) => g.options)) {
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
      'srd-2024_ranger_expertise',
      'srd-2024_rogue_expertise',
      // Expertise aus SECHS Fertigkeiten — die einzige eingegrenzte Wahl im Vault.
      'srd-2024_wizard_scholar',
    ]);
  });

  /**
   * Ohne Deklaration fiele das Merkmal in den KI-Pfad, der den Übungsstand nicht kennt
   * (`buildFeatureEffectsInput` schickt keine Charakter-Zusammenfassung mit) — die Frage käme
   * optionslos zurück. Regelseitig gehört Expertise beim Waldläufer auf Stufe 2 und 9.
   */
  it('deklariert die Expertise des Waldläufers mit der Anzahl der Regel', async () => {
    const prog = await getProgressionByKey('srd-2024_ranger');
    const deft = prog!.features.find((f) => f.key === 'srd-2024_ranger_deft-explorer')!;
    const nine = prog!.features.find((f) => f.key === 'srd-2024_ranger_expertise')!;
    expect(deft.gainedAt).toEqual([2]);
    expect(nine.gainedAt).toEqual([9]);
    expect(expertiseRef(deft).grant.count).toBe(1);
    expect(expertiseRef(nine).grant.count).toBe(2);
    expect(expertiseChoice(expertiseRef(nine), ['Stealth', 'Survival'])!.max).toBe(2);
  });

  it('grenzt die Wahl des Gelehrten auf die sechs Fertigkeiten der Regel ein', async () => {
    const prog = await getProgressionByKey('srd-2024_wizard');
    const scholar = prog!.features.find((f) => f.key === 'srd-2024_wizard_scholar')!;
    const ref = expertiseRef(scholar);
    expect(ref.grant.count).toBe(1);

    // Geschnitten wird der Übungsstand: nur was BEIDES ist, geübt und erlaubt.
    const choice = expertiseChoice(ref, ['Stealth', 'Arcana', 'Perception', 'History'])!;
    expect(choice.options).toEqual(['Arcana', 'History']);
    expect(choice.optionsDe).toEqual(['Arkane Kunde', 'Geschichte']);
    expect(choice.max).toBe(1);
    // Keine der sechs geübt → gar keine Frage statt einer leeren.
    expect(expertiseChoice(ref, ['Stealth', 'Perception'])).toBeNull();
    // Und ohne Eingrenzung bleibt der ganze Übungsstand wählbar.
    const rogue = await getProgressionByKey('srd-2024_rogue');
    const open = rogue!.features.find((f) => f.key === 'srd-2024_rogue_expertise')!;
    expect(expertiseChoice(expertiseRef(open), ['Stealth', 'Arcana'])!.options).toEqual(['Stealth', 'Arcana']);
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
 * `skillProficiency` ist der Gegenschnitt zu `expertise` — dieselbe Fertigkeitsliste, gewählt
 * wird das noch nicht Geübte. Steht hier, damit die beiden Schnitte nicht auseinanderlaufen.
 */
describe('deklarierte Fertigkeitsübung', () => {
  const SKILLPROF_ID = 'skillprof_srd-2024-college-of-lore-bonus-proficiencies';
  const lore = async () => {
    const prog = await getProgressionByKey('srd-2024_college-of-lore');
    const f = prog?.features.find((x) => x.key === 'srd-2024_college-of-lore_bonus-proficiencies');
    expect(f, 'Zusätzliche Übungen im Vault').toBeTruthy();
    return tagged('subclass', [f!])[0];
  };

  it('deklariert die Übungswahl im ganzen Vault nur, wo sie der ganze Inhalt ist', async () => {
    const found: string[] = [];
    for (const info of await getClasses()) {
      const prog = await getProgressionByKey(libraryKey(info));
      for (const f of prog?.features ?? []) if (isSkillProficiencyFeature(f)) found.push(f.key);
    }
    // Barbar „Urtümliches Wissen" gewährt daneben den STÄRKE-Wurf im Kampfrausch — deshalb
    // trägt es `aiInterpretsRest` (eigener Test unten), sonst fiele diese Hälfte still weg.
    expect(found.sort()).toEqual([
      'srd-2024_barbarian_primal-knowledge',
      'srd-2024_college-of-lore_bonus-proficiencies',
    ]);
  });

  it('grenzt die Wahl des Barbaren auf seine Klassen-Fertigkeiten ein', async () => {
    const prog = await getProgressionByKey('srd-2024_barbarian');
    const f = prog!.features.find((x) => x.key === 'srd-2024_barbarian_primal-knowledge')!;
    const ref = skillProficiencyRefs(f)[0];
    expect(ref.grant.count).toBe(1);
    // Die Liste der Klasse aus Stufe 1 — NICHT alle 18 Fertigkeiten.
    expect(ref.grant.skills).toEqual(prog!.proficiencyGrant?.skills.from ?? []);

    const choice = skillProficiencyChoice(ref, ['Athletics', 'Arcana'])!;
    // Athletics ist geübt (fällt heraus), Arcana steht der Klasse gar nicht offen.
    expect(choice.options).toEqual(['Animal Handling', 'Intimidation', 'Nature', 'Perception', 'Survival']);
    expect(choice.max).toBe(1);
  });

  it('bietet die noch NICHT geübten Fertigkeiten an', async () => {
    const f = await lore();
    const ref = skillProficiencyRefs(f)[0];
    const choice = skillProficiencyChoice(ref, ['Stealth', 'Arcana'])!;
    expect(choice.id).toBe(SKILLPROF_ID);
    expect(choice.type).toBe('multiselect');
    expect(choice.max).toBe(3);
    expect(choice.options).not.toContain('Stealth');
    expect(choice.options).toContain('Perception');
    expect(choice.options).toHaveLength(SKILL_NAMES.length - 2);
    expect(choice.optionsDe[choice.options.indexOf('Perception')]).toBe('Wahrnehmung');
    // Mehr Plätze als Optionen wäre eine unerfüllbare Pflichtfrage.
    expect(skillProficiencyChoice(ref, SKILL_NAMES.slice(0, 16))!.max).toBe(2);
    // Alles geübt → gar keine Frage statt einer leeren (wie bei Expertise).
    expect(skillProficiencyChoice(ref, SKILL_NAMES)).toBeNull();
  });

  /** Sonst zeigte der Editor eine beantwortete Wahl als „passt zu keiner Option". */
  it('behält die schon getroffene Antwort in den Optionen', async () => {
    const ref = skillProficiencyRefs(await lore())[0];
    const choice = skillProficiencyChoice(ref, ['Stealth', 'Arcana'], ['Arcana'])!;
    expect(choice.options).toContain('Arcana');
    expect(choice.options).not.toContain('Stealth');
  });

  it('macht aus der Antwort einen Übungs-Rider und daraus Änderungen', async () => {
    const f = await lore();
    const riders = skillProficiencyRiders([f], (id) => (id === SKILLPROF_ID ? 'History, Insight' : ''));
    expect(riders).toHaveLength(1);
    expect(riders[0].proficiencies.skills).toEqual(['History', 'Insight']);
    // Keine Expertise: das ist der andere Schnitt und ein anderes Bogen-Flag.
    expect(riders[0].expertiseSkills).toEqual([]);
    expect(riders[0].source).toBe('subclass');

    const changes = riderChanges(
      { riders, flagged: [], grantedCantrips: [], grantedPrepared: [] },
      'feature-effects',
    );
    expect(changes.filter((c) => c.target === 'proficiency').map((c) => c.skill)).toEqual(['History', 'Insight']);
    expect(changes.some((c) => c.target === 'expertise')).toBe(false);

    // Deutsch gewählt → kein Rider: `skillSheetKey` erwartet das englische Vokabular.
    expect(skillProficiencyRiders([f], () => 'Geschichte')).toEqual([]);
    expect(skillProficiencyRiders([f], () => '')).toEqual([]);
  });

  it('nimmt das Merkmal aus dem KI-Eingang — sonst würde zweimal gefragt', async () => {
    const f = await lore();
    expect(withoutDeclaredChoiceFeatures([f])).toEqual([]);
  });
});

/**
 * `aiInterpretsRest` schiebt das Merkmal nur in Pass C zurück, NICHT in die Analyse — dort
 * käme die deklarierte Frage ein zweites Mal.
 */
describe('Teil-Deklaration mit KI für den Rest', () => {
  const primal = async () => {
    const prog = await getProgressionByKey('srd-2024_barbarian');
    const f = prog?.features.find((x) => x.key === 'srd-2024_barbarian_primal-knowledge');
    expect(f, 'Urtümliches Wissen im Vault').toBeTruthy();
    return tagged('class', [f!])[0];
  };

  it('bleibt aus der Analyse heraus, kommt aber in Pass C', async () => {
    const f = await primal();
    expect(f.aiInterpretsRest, 'Flagge im Vault').toBe(true);
    // Analyse: draußen — die Übungswahl stellt die Deklaration.
    expect(withoutDeclaredChoiceFeatures([f])).toEqual([]);
    // Pass C: drin — dort deutet die KI den Stärke-Wurf im Kampfrausch.
    const passC = unredactedChoiceFeatures([f], () => '');
    expect(passC.map((x) => x.key)).toEqual(['srd-2024_barbarian_primal-knowledge']);
    // Leer: die getroffene Wahl reist über `resolvedChoices`, nicht zweimal.
    expect(passC[0].choice).toBe('');
  });

  it('lässt ein vollständig deklariertes Merkmal weiterhin aus Pass C heraus', async () => {
    const prog = await getProgressionByKey('srd-2024_college-of-lore');
    const lore = tagged('subclass', [prog!.features.find((x) => x.key === 'srd-2024_college-of-lore_bonus-proficiencies')!])[0];
    expect(lore.aiInterpretsRest ?? false).toBe(false);
    expect(unredactedChoiceFeatures([lore], () => 'History')).toEqual([]);
  });

  it('zählt höchstens einmal, auch neben einer unredigierten Zweigwahl', () => {
    const both = {
      key: 'test_both', name: 'Both', nameDe: 'Beides', source: 'class' as const,
      aiInterpretsRest: true,
      grantsChoice: [featureChoiceGrantSchema.parse({
        kind: 'optionList',
        options: [{ value: 'A', labelDe: 'A', helpDe: 'Folge A' }],
      })],
    };
    expect(unredactedChoiceFeatures([both], () => 'A')).toHaveLength(1);
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
