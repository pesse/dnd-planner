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
import { getFeats, featDesc, featDisplayName } from '$lib/featsLibrary';
import {
  analyzeFeatureEffects,
  finalizeFeatureEffects,
  type FeatureAnalysis,
  type ResolvedChoice,
} from '../aiActions/featureEffectsAction';
import { runAiAction } from '../aiActions/runner';
import {
  buildFieldSummaryAction,
  buildFieldSummaryInput,
  SHEET_FIELDS,
  type SummaryFeature,
} from '../aiActions/fieldSummaryAction';
import { buildFeaturePrep, type FeaturePrep } from './featurePrep';
import { buildEquipmentOptionsAction, buildEquipmentOptionsInput } from '../aiActions/equipmentMatchAction';
import { buildLevelUpEffectsAction, buildLevelUpEffectsInput } from '../aiActions/levelUpEffectsAction';
import type { LlmConfig } from '$lib/types';
import type { FeatureEffects, FieldSummary, LevelUpEffects } from '$lib/schemas/levelUp';
import type { EquipmentOptions } from '$lib/schemas/wizardEquipment';
import { equipmentCandidateNames, gatherStartingEquipment } from './startingEquipment';
import { pointBuyStart, type AbilityScores } from './pointBuy';
import type { AsiAllocation } from './backgroundAsi';

export type JobStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

/** Adresse eines Kategorie-Eintrags in `toolPicks` (Gruppe/Option/Item). */
export function toolPickKey(groupIdx: number, optionIdx: number, itemIdx: number): string {
  return `${groupIdx}:${optionIdx}:${itemIdx}`;
}

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
  /**
   * Konkreter Gegenstand für die Kategorie-Einträge der Ausrüstung (`choiceFrom`):
   * Schlüssel ist `toolPickKey(...)`, Wert der Bibliotheks-Name. Nicht am Options-
   * Objekt selbst, weil das KI-Ergebnis bei jedem `restart()` ersetzt wird.
   */
  toolPicks = $state<Record<string, string>>({});
  /** Gewählte Waffen der Waffenmeisterschaft (Bibliotheks-Namen; nur wenn die Klasse sie gewährt). */
  masteries = $state<string[]>([]);
  /** Gewählte Kampfstile als Talent-Keys (sourceKey); nur wenn die Klasse einen Kampfstil gewährt. */
  fightingStyles = $state<string[]>([]);

  // ── Zauberwahl (Schritt „Zauber"; alle Listen `encodePick`-kodiert) ──
  /** Zaubertricks (Grad 0) aus dem Klassenkontingent. */
  pickedCantrips = $state<string[]>([]);
  /**
   * Zauber ab Grad 1 aus dem Klassenkontingent. Im `spellbook`-Regime ist das der
   * bekannt-Bestand (das Zauberbuch), sonst unmittelbar die Vorbereitung.
   */
  pickedKnown = $state<string[]>([]);
  /**
   * Teilmenge von `pickedKnown`, die als vorbereitet gilt — nur das `spellbook`-Regime
   * pflegt sie (der Magier wählt „kennen" und „vorbereitet" getrennt). Bei allen anderen
   * Klassen ist die Auswahl selbst die Vorbereitung, das Feld bleibt leer.
   */
  pickedPrepared = $state<string[]>([]);
  /**
   * Zauber aus Merkmals-Wahlen (`spell-pick`), je Wahl-`id`. Getrennt vom Klassenkontingent,
   * weil sie nicht dagegen zählen und stets vorbereitet sind (z.B. „Magiekundiger").
   */
  featureSpellPicks = $state<Record<string, string[]>>({});

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
  #prep: Promise<FeaturePrep> | null = null;

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

  /** Merkmals-Wahlen, die eine ZAUBER-Wahl sind — Optionen kommen aus `vault/spells`. */
  get spellPickChoices() {
    return this.featureChoices.filter((c) => c.type === 'spell-pick');
  }

  /** Merkmals-Wahlen, die im Merkmals-Schritt gerendert werden (alles außer Zauber-Wahlen). */
  get plainChoices() {
    return this.featureChoices.filter((c) => c.type !== 'spell-pick');
  }

  /** Fertige Merkmals-Rider (leer, solange der Effekt-Job läuft/übersprungen ist). */
  get riders() {
    return this.effects.result?.riders ?? [];
  }

  #touch = (): void => { this.lastActivityMs = performance.now(); };

  // ── Aufbereitung (einmal, von allen Merkmals-Jobs geteilt) ──
  #prepare(): Promise<FeaturePrep> {
    if (!this.#prep) {
      this.#prep = buildFeaturePrep({ species: this.species, klass: this.klass, background: this.background });
    }
    return this.#prep;
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
    this.toolPicks = {};
    this.equipment.run(async (signal) => {
      const [sources, candidates] = await Promise.all([
        gatherStartingEquipment(this.klass.sourceKey, this.background.sourceKey),
        equipmentCandidateNames(),
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
    this.toolPicks = {};
    this.masteries = [];
    this.fightingStyles = [];
    this.pickedCantrips = [];
    this.pickedKnown = [];
    this.pickedPrepared = [];
    this.featureSpellPicks = {};
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
      // Gewählte Kampfstile als eigene Klassenmerkmal-Zeilen: das Kampfstil-Merkmal ist
      // flow-eigen und daher aus `gained`/der KI-Analyse gefiltert (kein Halluzinieren), die
      // getroffene Wahl steckt im verlinkten Talent (Source of Truth). Im Klassenmerkmale-Text
      // soll sie trotzdem erscheinen — hier als Klassen-Merkmal mit der Talent-Beschreibung.
      if (this.fightingStyles.length) {
        const feats = await getFeats();
        for (const key of this.fightingStyles) {
          const feat = feats.find((f) => f.sourceKey === key);
          if (feat) features.push({ name: featDisplayName(feat), desc: featDesc(feat), source: 'class', group: this.klass.name });
        }
      }
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

  /** Index der gewählten Option einer Gruppe (Default: erste), robust gegen Lücken. */
  selectedOptionIndex(groupIdx: number): number {
    const options = this.equipment.result?.groups[groupIdx]?.options ?? [];
    const idx = this.equipmentSelection[groupIdx] ?? 0;
    return options[idx] ? idx : 0;
  }

  /** Gewählte Ausrüstungs-Option je Gruppe, mit den Kategorie-Einträgen aufgelöst.
   *  Münzeinträge werden aus den Items verworfen — die Münzen stecken bereits in
   *  `goldPieces` (→ Währung), sonst stünde das Gold zusätzlich im Inventar. */
  selectedEquipment(): { items: { name: string; count: number }[]; goldPieces: number } {
    const groups = this.equipment.result?.groups ?? [];
    const items: { name: string; count: number }[] = [];
    let goldPieces = 0;
    groups.forEach((group, gi) => {
      const oi = this.selectedOptionIndex(gi);
      const opt = group.options[oi];
      if (!opt) return;
      opt.items.forEach((item, ii) => {
        if (isCoinItem(item.name)) return;
        // Kategorie-Eintrag ohne Wahl fällt weg, statt „Handwerkszeug" ins Inventar zu
        // schreiben — einen solchen Gegenstand gibt es nicht.
        const picked = item.choiceFrom ? this.toolPicks[toolPickKey(gi, oi, ii)] : item.name;
        if (picked) items.push({ name: picked, count: item.count });
      });
      goldPieces += opt.goldPieces;
    });
    return { items, goldPieces };
  }

  /** Kategorie-Einträge der gewählten Optionen, denen noch ein Gegenstand fehlt. */
  pendingToolChoices(): number {
    const groups = this.equipment.result?.groups ?? [];
    return groups.reduce((sum, group, gi) => {
      const oi = this.selectedOptionIndex(gi);
      const opt = group.options[oi];
      if (!opt) return sum;
      return sum + opt.items.filter((it, ii) => it.choiceFrom && !this.toolPicks[toolPickKey(gi, oi, ii)]).length;
    }, 0);
  }

  /** Summe der pro-Stufe wirkenden TP-Effekte (auf Stufe 1 einmal angewandt). */
  hpPerLevelBonus(): number {
    return (this.hpEffects.result?.changes ?? [])
      .filter((c) => c.target === 'hpMax')
      .reduce((sum, c) => sum + (parseInt(c.valueChange, 10) || 0), 0);
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
