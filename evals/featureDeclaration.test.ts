/**
 * Deklarierte Zweigwahlen (`grantsChoice.kind === 'optionList'`) — OHNE LLM, über den
 * ECHTEN Vault.
 *
 * Diese Datei hält die zwei Zusicherungen fest, die vorher am Prompt hingen:
 * die Optionen sind ZITATE aus dem Regeltext (ein erfundenes Label bricht die gespeicherte
 * Antwort still), und die Wirkung steht neben der Option (`determinesFurtherEffects` kann
 * damit nie wieder true werden). Begründung: `docs/plan-wahlen-deklarieren.md`, Stufe 1.
 *
 *   npm run eval -- --eval featureDeclaration
 */
import { describe, expect, it } from 'vitest';
import { getClasses } from '../src/lib/classLibrary';
import { getProgressionByKey } from '../src/lib/services/classProgression';
import type { ClassFeature } from '../src/lib/schemas/classProgression';
import {
  chosenOption,
  isOptionListFeature,
  optionChoiceId,
  optionListChoice,
  optionListRiders,
} from '../src/lib/services/featureDeclaration';

const declaredFeatures = async (): Promise<{ klass: string; feature: ClassFeature }[]> => {
  const out: { klass: string; feature: ClassFeature }[] = [];
  for (const info of await getClasses()) {
    const prog = await getProgressionByKey(info.key);
    for (const feature of prog?.features ?? []) {
      if (isOptionListFeature(feature)) out.push({ klass: info.key, feature });
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
    expect(choice.questionDe).toContain('Urtümlicher Orden');
    expect(choice.featureKey).toBe('srd-2024_druid_primal-order');
    // Die beiden Flaggen sind der Kern: dauerhaft, aber ohne Folge-Berechnung.
    expect(choice.isBuildDecision).toBe(true);
    expect(choice.determinesFurtherEffects).toBe(false);
  });

  it('liefert den Rider der getroffenen Wahl — und nur den', async () => {
    const prog = await getProgressionByKey('srd-2024_druid');
    const primal = prog!.features.find((f) => f.key === 'srd-2024_druid_primal-order')!;
    const id = optionChoiceId(primal);

    const warden = optionListRiders([primal], (q) => (q === id ? 'Warden' : ''));
    expect(warden).toHaveLength(1);
    expect(warden[0].proficiencies.weapons).toEqual(['Martial']);
    expect(warden[0].proficiencies.armor).toEqual(['Medium']);
    expect(warden[0].extraCantrips).toBe(0);
    // Kein Protokoll-Eintrag: die Wahl schreibt `featureChoiceChanges` aus dem Fragebogen.
    expect(warden[0].decisions).toEqual([]);
    // Keine erfundene deutsche Notiz neben der englischen des Modells.
    expect(warden[0].sheetNote).toBe('');

    const magician = optionListRiders([primal], () => 'Magician');
    expect(magician[0].extraCantrips).toBe(1);
    expect(magician[0].proficiencies.weapons).toEqual([]);

    // Unbeantwortet → kein Rider. Ein leerer Rider wäre ein Grant von nichts.
    expect(optionListRiders([primal], () => '')).toEqual([]);
    // Ein Label, das nicht im Vokabular steht, gewährt nichts (statt irgendetwas).
    expect(chosenOption(primal, 'Wächter')).toBeNull();
    expect(optionListRiders([primal], () => 'Wächter')).toEqual([]);
  });

  it('hält die deklarierten Merkmale aus dem KI-Eingang des Wizards heraus', async () => {
    const { buildFeaturePrep } = await import('../src/lib/services/wizard/featurePrep');
    const prep = await buildFeaturePrep({
      species: { sourceKey: 'srd-2024_dwarf', name: 'Zwerg' },
      klass: { sourceKey: 'srd-2024_druid', name: 'Druide' },
      background: { sourceKey: 'srd-2024_sage', name: 'Weiser' },
    });
    expect(prep.optionListFeatures.map((f) => f.key)).toEqual(['srd-2024_druid_primal-order']);
    expect(prep.gained.map((f) => f.name)).not.toContain('Primal Order');
    expect(prep.analysisGained.map((f) => f.name)).not.toContain('Primal Order');
  });
});
