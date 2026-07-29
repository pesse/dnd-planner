/**
 * Orchestrator des Charakter-Erstell-Wizards (Stufe 1).
 *
 * Hält den gesamten Wizard-Zustand (Grundwahl, Point-Buy, Hintergrund-ASI,
 * Übungswahlen, Ausrüstung) UND die langlaufenden KI-Jobs. Der Kern ist die
 * Nebenläufigkeit: sobald Volk/Klasse/Hintergrund feststehen, feuert `kickoff()`
 * die KI-Jobs (fire-and-forget, KEIN await), während der Nutzer parallel Point-Buy
 * usw. bedient. Jeder Job trägt Status/Ergebnis reaktiv (`$state`), ist per
 * `AbortController` abbrechbar und wird bei geänderter Grundwahl neu gestartet.
 *
 * Es gibt bewusst KEINE Worker/Tauri-Hintergrundtasks — reines JS-`async` reicht:
 * ein nicht-awaited Promise blockiert die UI nicht. Muster wie `LevelUpAssistant`
 * (Stall-Clock, run-Guard), nur entkoppelt vom Bearbeiten der deterministischen Schritte.
 *
 * Graceful Degradation: die Merkmals-Deutung ist QM-only (`featureEffectsAction`),
 * fehlt QM, werden Analyse/Effekte übersprungen; der Merkmals-Text läuft über jeden
 * Provider (`runAiAction`), das Ausrüstungs-Matching ebenso.
 */
import { getProgressionByKey, featuresUpTo } from '../classProgression';
import type { ClassProgression } from '$lib/schemas/classProgression';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { getFeats, featDesc, featDisplayName } from '$lib/featsLibrary';
import { isFlowOwnedChoiceFeature } from '../levelUp';
import {
  analyzeFeatureEffects,
  finalizeFeatureEffects,
  type FeatureAnalysis,
  type FeatureClassContext,
  type GainedFeature,
  type ResolvedChoice,
} from '../aiActions/featureEffectsAction';
import { runAiAction } from '../aiActions/runner';
import {
  buildFieldSummaryAction,
  buildFieldSummaryInput,
  SHEET_FIELDS,
  type SummaryFeature,
} from '../aiActions/fieldSummaryAction';
import { buildEquipmentOptionsAction, buildEquipmentOptionsInput } from '../aiActions/equipmentMatchAction';
import {
  buildLevelUpEffectsAction,
  buildLevelUpEffectsInput,
  type EffectFeature,
} from '../aiActions/levelUpEffectsAction';
import { getItemsByDir, displayName as itemDisplayName } from '$lib/itemLibrary';
import type { LlmConfig } from '$lib/types';
import type { FeatureEffects, FieldSummary, LevelUpEffects } from '$lib/schemas/levelUp';
import type { EquipmentOptions } from '$lib/schemas/wizardEquipment';
import { gatherStartingEquipment } from './startingEquipment';
import { pointBuyStart, type AbilityScores } from './pointBuy';
import type { AsiAllocation } from './backgroundAsi';

export type JobStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

/** Item-Kategorien, deren Namen als Match-Kandidaten für die Startausrüstung dienen. */
const EQUIPMENT_CANDIDATE_DIRS = ['weapon', 'armor', 'shield', 'ammunition', 'adventuring-gear', 'equipment-pack', 'tools'];

/** Erkennt reine Münz-„Items" (Goldmünzen, 15 GM …) — die gehören in die Währung, nicht ins Inventar. */
function isCoinItem(name: string): boolean {
  const n = name.trim();
  return /\b\w*münzen?\b/i.test(n) || /\bgold(stücke?|)\b/i.test(n) || /^\d+\s*(gm|sm|km|em|pm|gp|sp|cp|ep|pp)$/i.test(n);
}

/**
 * Ein einzelner KI-Job: reaktiver Status + Ergebnis, abbrechbar, mit Guard gegen
 * veraltete Läufe (ein neuer `begin()` bricht den vorherigen ab; dessen verspätetes
 * Settle wird über das abgebrochene Signal verworfen).
 */
export class Job<T> {
  status = $state<JobStatus>('idle');
  result = $state<T | null>(null);
  error = $state('');
  #ctrl: AbortController | null = null;
  #running: Promise<unknown> = Promise.resolve();

  #begin(): AbortSignal {
    this.#ctrl?.abort();
    this.#ctrl = new AbortController();
    this.status = 'running';
    this.error = '';
    return this.#ctrl.signal;
  }

  /** Startet `fn` fire-and-forget; kein await. Settles landen nur, wenn nicht abgebrochen. */
  run(fn: (signal: AbortSignal) => Promise<T>): void {
    const signal = this.#begin();
    this.#running = fn(signal).then(
      (r) => { if (!signal.aborted) { this.result = r; this.status = 'done'; } },
      (e) => { if (!signal.aborted) { this.error = e instanceof Error ? e.message : String(e); this.status = 'error'; } },
    );
  }

  /** Wartet auf das Settle des letzten Laufs — fürs finale Zusammenbauen. Nie rejektierend. */
  settle(): Promise<void> { return this.#running.then(() => {}, () => {}); }

  skip(): void { this.abort(); this.status = 'skipped'; }
  abort(): void { this.#ctrl?.abort(); this.#ctrl = null; }
  reset(): void { this.abort(); this.status = 'idle'; this.result = null; this.error = ''; }
}

/** Ein Bibliotheks-Link (Klasse/Volk/Hintergrund) — sourceKey + Anzeigename. */
export interface WizardLink {
  sourceKey: string;
  name: string;
}

/** Was `buildPrep` einmalig aufbereitet (von allen Merkmals-Jobs geteilt). */
interface Prep {
  /** Klassen-/Subklassen-/Talent-Merkmale — Eingang für Merkmals-Analyse UND Klassentext. */
  gained: GainedFeature[];
  /** Speziesmerkmale als Analyse-Eingang: erzwungene Wahlen (Drakonische Urahnen,
   *  Elfenlinie …) stecken hier, nicht in `gained` (das wäre sonst im Klassentext). */
  speciesFeatures: GainedFeature[];
  /** Kompletter Merkmalsbestand für die fortlaufenden Effekte (TP/Stufe). */
  effectFeatures: EffectFeature[];
  summaryClass: SummaryFeature[];
  summarySpecies: SummaryFeature[];
  classContext: FeatureClassContext;
}

/** Grobe Zuordnung Zauberattribut je Grundklasse (nur KI-Kontext; unkritisch). */
const SPELL_ABILITY_DE: Record<string, string> = {
  bard: 'Charisma', cleric: 'Weisheit', druid: 'Weisheit', paladin: 'Charisma',
  ranger: 'Weisheit', sorcerer: 'Charisma', warlock: 'Charisma', wizard: 'Intelligenz',
};

export class CharacterWizard {
  // ── Kopf ──
  name = $state('');
  playerName = $state('');

  // ── Grundwahl (Schritt 1) ──
  species: WizardLink & { subspeciesKey?: string; subspeciesName?: string } = $state({ sourceKey: '', name: '' });
  klass: WizardLink & { subclassKey?: string; subclassName?: string } = $state({ sourceKey: '', name: '' });
  background: WizardLink = $state({ sourceKey: '', name: '' });

  // ── Deterministische Schritte ──
  scores = $state<AbilityScores>(pointBuyStart());
  asi = $state<AsiAllocation>({});
  /** Aus offenen Fertigkeitswahlen des Übungs-Angebots gewählte Fertigkeiten (englische Namen). */
  chosenSkills = $state<string[]>([]);
  /** Gewählte Ausrüstungs-Option je Gruppe (Gruppen-Index → Options-Index). Default: erste Option. */
  equipmentSelection = $state<number[]>([]);
  /** Gewählte Waffen der Waffenmeisterschaft (Bibliotheks-Namen; nur wenn die Klasse sie gewährt). */
  masteries = $state<string[]>([]);

  // ── Merkmalswahlen (Checkpoint, Schritt 5) ──
  resolvedChoices = $state<ResolvedChoice[]>([]);

  // ── KI-Jobs ──
  analysis = new Job<FeatureAnalysis>();
  classText = new Job<FieldSummary>();
  speciesText = new Job<FieldSummary>();
  effects = new Job<FeatureEffects>();
  equipment = new Job<EquipmentOptions>();
  /** Fortlaufende TP-Effekte (Zäh, Zwergische Zähigkeit …) — für die HP-Berechnung. */
  hpEffects = new Job<LevelUpEffects>();

  /** Letztes KI-Lebenszeichen (für die Stall-Anzeige der UI). */
  lastActivityMs = $state(0);

  #getConfig: () => LlmConfig;
  #prep: Promise<Prep> | null = null;

  constructor(getConfig: () => LlmConfig) {
    this.#getConfig = getConfig;
  }

  // ── Ableitungen (reaktiv, weil sie $state lesen) ──
  get basicsComplete(): boolean {
    return !!(this.species.sourceKey && this.klass.sourceKey && this.background.sourceKey);
  }

  get isQm(): boolean {
    return this.#getConfig().provider === 'qualityminds';
  }

  /** Erzwungene Merkmalswahlen der Analyse (leer, solange nichts erkannt/kein QM). */
  get featureChoices() {
    return this.analysis.result?.choices ?? [];
  }

  #touch = (): void => { this.lastActivityMs = performance.now(); };

  // ── Aufbereitung (einmal, von allen Merkmals-Jobs geteilt) ──
  #prepare(): Promise<Prep> {
    if (!this.#prep) this.#prep = this.#buildPrep();
    return this.#prep;
  }

  async #buildPrep(): Promise<Prep> {
    const [prog, sub, spec, bg, feats] = await Promise.all([
      getProgressionByKey(this.klass.sourceKey),
      this.klass.subclassKey ? getProgressionByKey(this.klass.subclassKey) : Promise.resolve(null),
      getSpeciesByKey(this.species.sourceKey),
      getBackgroundByKey(this.background.sourceKey),
      getFeats(),
    ]);

    const level1 = (p: ClassProgression | null, source: 'class' | 'subclass'): GainedFeature[] =>
      p
        ? featuresUpTo(p, 1)
            .filter((f) => !isFlowOwnedChoiceFeature(f))
            .map((f) => ({ name: f.nameDe || f.name, desc: f.desc, descDe: f.descDe, source, gainedAt: 1, key: f.key }))
        : [];

    const gained: GainedFeature[] = [...level1(prog, 'class'), ...level1(sub, 'subclass')];

    // Herkunftstalent als eigenes Merkmal (steht nicht in features[], kommt aus dem Hintergrund).
    if (bg?.featKey) {
      const feat = feats.find((f) => f.sourceKey === bg.featKey);
      if (feat) gained.push({ name: featDisplayName(feat), desc: featDesc(feat), descDe: featDesc(feat), source: 'feat', gainedAt: 1, key: bg.featKey });
    }

    const toSummary = (g: GainedFeature): SummaryFeature => ({
      name: g.name,
      desc: g.descDe || g.desc,
      source: g.source === 'subclass' ? 'class' : g.source,
      group: g.source === 'feat' ? this.background.name : this.klass.name,
      gainedAt: g.gainedAt,
    });

    const summaryClass = gained.map(toSummary);
    const traits = spec?.traits ?? [];
    const summarySpecies: SummaryFeature[] = traits.map((t) => ({
      name: t.nameDe || t.name,
      desc: t.descDe || t.desc,
      source: 'species',
      group: this.species.name,
    }));

    // Speziesmerkmale als Analyse-Eingang: nur so erkennt die KI erzwungene Volks-Wahlen
    // (Drakonische Urahnen, Elfenlinie …). desc = EN-Regeltext (maßgeblich), descDe = DE.
    const speciesFeatures: GainedFeature[] = traits.map((t) => ({
      name: t.nameDe || t.name,
      desc: t.desc,
      descDe: t.descDe,
      source: 'species',
      gainedAt: 1,
      key: t.key,
    }));

    // Voller Merkmalsbestand für die fortlaufenden TP-Effekte (Zäh, Zwergische Zähigkeit).
    const effectFeatures: EffectFeature[] = [...gained, ...speciesFeatures].map((f) => ({
      key: f.key ?? '',
      name: f.name,
      desc: f.descDe || f.desc,
    }));

    const slug = this.klass.sourceKey.split('_').pop() ?? '';
    const classContext: FeatureClassContext = {
      klasseName: this.klass.name,
      subclassName: this.klass.subclassName ?? '',
      casterType: prog?.casterType ?? 'NONE',
      casterKind: (prog?.casterType ?? 'NONE') === 'NONE' ? 'none' : 'prepared',
      spellcastingAbility: SPELL_ABILITY_DE[slug] ?? '',
      toLevel: 1,
    };

    return { gained, speciesFeatures, effectFeatures, summaryClass, summarySpecies, classContext };
  }

  // ── Hintergrund-Jobs starten (fire-and-forget) ──
  kickoff(): void {
    const cfg = this.#getConfig();
    this.#prep = null; // frische Aufbereitung für die aktuelle Grundwahl

    // Merkmals-Deutung: QM-only. Klassen- UND Speziesmerkmale, damit Volks-Wahlen
    // (Drakonische Urahnen usw.) als erzwungene Wahl erkannt werden.
    if (this.isQm) {
      this.analysis.run(async (signal) => {
        const prep = await this.#prepare();
        return analyzeFeatureEffects(
          cfg,
          { classContext: prep.classContext, features: [...prep.gained, ...prep.speciesFeatures], pastChoices: [] },
          { signal, onActivity: this.#touch },
        );
      });
    } else {
      this.analysis.skip();
      this.effects.skip();
    }

    // Fortlaufende TP-Effekte (Zäh/Zwergische Zähigkeit): über jeden strukturfähigen
    // Provider; fließt in die HP-Berechnung der Assembly ein.
    this.hpEffects.run(async (signal) => {
      const prep = await this.#prepare();
      if (!prep.effectFeatures.length) return { level: 1, changes: [] };
      return runAiAction(
        cfg,
        buildLevelUpEffectsAction(),
        buildLevelUpEffectsInput({ level: 1, features: prep.effectFeatures }),
        { signal, onActivity: this.#touch },
      );
    });

    // Der Merkmals-Text (classText/speciesText) läuft BEWUSST NICHT hier: er wird erst
    // nach dem Wahl-Checkpoint über `summarizeFeatures()` gestartet, sonst steht im Text
    // ein Platzhalter statt der Wahl (z.B. „Resistenz gegen [Schadensart]").

    // Ausrüstung: die englische Prosa (Klasse + Hintergrund) sofort in wählbare deutsche
    // Optionen aufbereiten, damit Schritt 6 direkt eine echte Auswahl anbieten kann.
    this.equipmentSelection = [];
    this.equipment.run(async (signal) => {
      const [sources, candidates] = await Promise.all([
        gatherStartingEquipment(this.klass.sourceKey, this.background.sourceKey),
        this.#equipmentCandidates(),
      ]);
      if (!sources.classProse && !sources.backgroundProse) return { groups: [] };
      return runAiAction(
        cfg,
        buildEquipmentOptionsAction(),
        buildEquipmentOptionsInput({
          classProse: sources.classProse,
          backgroundProse: sources.backgroundProse,
          libraryItems: candidates,
        }),
        { signal, onActivity: this.#touch },
      );
    });
  }

  /** Grundwahl nach dem Start geändert → laufende Jobs verwerfen und neu starten. */
  restart(): void {
    this.effects.reset();
    this.classText.reset();
    this.speciesText.reset();
    this.resolvedChoices = [];
    this.equipmentSelection = [];
    this.masteries = [];
    this.kickoff();
  }

  /** Getroffene Aufbau-Wahlen je Merkmals-Key (resolvedChoices × Analyse-Choices) — damit
   *  der Merkmals-Text die Wahl statt eines Platzhalters trägt (`SummaryFeature.choice`). */
  #choiceByFeatureKey(): Map<string, string> {
    const byId = new Map(this.featureChoices.map((c) => [c.id, c]));
    const map = new Map<string, string>();
    for (const rc of this.resolvedChoices) {
      const key = byId.get(rc.id)?.featureKey;
      if (!key || !rc.choice.trim()) continue;
      map.set(key, map.has(key) ? `${map.get(key)}, ${rc.choice}` : rc.choice);
    }
    return map;
  }

  /**
   * Merkmals-Texte (Klassen-/Volksmerkmale) NACH dem Wahl-Checkpoint verdichten: erst wenn
   * die getroffene Wahl feststeht, steht sie auch im Text (sonst Platzhalter wie „Resistenz
   * gegen [Schadensart]"). Läuft über jeden Provider; die Wahl geht je Merkmal als `choice`
   * mit ein (per featureKey den passenden Summary-Feature zugeordnet).
   */
  summarizeFeatures(): void {
    const cfg = this.#getConfig();
    const choiceByKey = this.#choiceByFeatureKey();
    const withChoice = (s: SummaryFeature, key: string | undefined): SummaryFeature => {
      const choice = choiceByKey.get(key ?? '');
      return choice ? { ...s, choice } : s;
    };

    this.classText.run(async (signal) => {
      const prep = await this.#prepare();
      const features = prep.summaryClass.map((s, i) => withChoice(s, prep.gained[i]?.key));
      return runAiAction(
        cfg,
        buildFieldSummaryAction(),
        buildFieldSummaryInput({
          target: SHEET_FIELDS.classFeatures,
          currentText: '',
          features,
          chosenSubclass: this.klass.subclassKey ? { key: this.klass.subclassKey, name: this.klass.subclassName ?? '' } : null,
        }),
        { signal, onActivity: this.#touch },
      );
    });

    this.speciesText.run(async (signal) => {
      const prep = await this.#prepare();
      if (!prep.summarySpecies.length) return { text: '' };
      const features = prep.summarySpecies.map((s, i) => withChoice(s, prep.speciesFeatures[i]?.key));
      return runAiAction(
        cfg,
        buildFieldSummaryAction(),
        buildFieldSummaryInput({ target: SHEET_FIELDS.speciesTraits, currentText: '', features }),
        { signal, onActivity: this.#touch },
      );
    });
  }

  /** Nach dem Merkmals-Checkpoint: Effekte (Rider + gewährte Zauber) finalisieren. QM-only. */
  finalizeFeatures(): void {
    const cfg = this.#getConfig();
    if (!this.isQm || this.analysis.status !== 'done' || !this.analysis.result) {
      this.effects.skip();
      return;
    }
    const analysis = this.analysis.result;
    this.effects.run(async (signal) => {
      const prep = await this.#prepare();
      return finalizeFeatureEffects(
        cfg,
        {
          classContext: prep.classContext,
          features: [...prep.gained, ...prep.speciesFeatures],
          pastChoices: [],
          resolvedChoices: this.resolvedChoices,
        },
        analysis,
        { signal, onActivity: this.#touch },
      );
    });
  }

  /** Gewählte Ausrüstungs-Option je Gruppe (Default: erste Option), robust gegen Lücken.
   *  Münzeinträge werden aus den Items verworfen — die Münzen stecken bereits in
   *  `goldPieces` (→ Währung), sonst stünde das Gold zusätzlich im Inventar. */
  selectedEquipment(): { items: { name: string; count: number }[]; goldPieces: number } {
    const groups = this.equipment.result?.groups ?? [];
    const items: { name: string; count: number }[] = [];
    let goldPieces = 0;
    groups.forEach((group, gi) => {
      const opt = group.options[this.equipmentSelection[gi] ?? 0] ?? group.options[0];
      if (!opt) return;
      items.push(...opt.items.filter((i) => !isCoinItem(i.name)));
      goldPieces += opt.goldPieces;
    });
    return { items, goldPieces };
  }

  /** Summe der pro-Stufe wirkenden TP-Effekte (auf Stufe 1 einmal angewandt). */
  hpPerLevelBonus(): number {
    return (this.hpEffects.result?.changes ?? [])
      .filter((c) => c.target === 'hpMax')
      .reduce((sum, c) => sum + (parseInt(c.valueChange, 10) || 0), 0);
  }

  async #equipmentCandidates(): Promise<string[]> {
    const lists = await Promise.all(EQUIPMENT_CANDIDATE_DIRS.map((dir) => getItemsByDir(dir).catch(() => [])));
    return [...new Set(lists.flat().map((i) => itemDisplayName(i)))];
  }

  /** Wartet, bis die für den Zusammenbau nötigen KI-Jobs settled sind (fürs „Erstellen"). */
  async awaitPending(): Promise<void> {
    await Promise.all([
      this.effects.settle(),
      this.classText.settle(),
      this.speciesText.settle(),
      this.equipment.settle(),
      this.hpEffects.settle(),
    ]);
  }

  /** Bricht alle laufenden Jobs ab (beim Schließen des Wizards). */
  dispose(): void {
    this.analysis.abort();
    this.classText.abort();
    this.speciesText.abort();
    this.effects.abort();
    this.equipment.abort();
    this.hpEffects.abort();
  }
}
