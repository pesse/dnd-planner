/**
 * Zustand und KI-Jobs des Charakter-Erstell-Wizards (Stufe 1).
 * Bewusst ohne Worker/Tauri-Hintergrundtask: ein nicht-awaitetes Promise blockiert die UI
 * nicht. Fehlt QM, entfallen Analyse und Effekte — der Rest läuft über jeden Anbieter.
 */
import { getFeats, featDesc, featDisplayName } from '$lib/featsLibrary';
import { analyzeFeatureEffects, finalizeFeatureEffects, type FeatureAnalysis } from '../aiActions/featureEffectsAction';
import { choiceLabelsDe, type AnalysisChoice, type ResolvedChoice } from '../analysis/types';
import { spellAccessChoices, spellListChoiceId, type SpellAccessGrant } from '../spellAccess';
import { withoutOwnedChoices } from '../declaredChoice';
import { runAiAction } from '../aiActions/runner';
import {
  buildFieldSummaryAction,
  buildFieldSummaryInput,
  SHEET_FIELDS,
  type SummaryFeature,
} from '../aiActions/fieldSummaryAction';
import { buildFeaturePrep, type FeaturePrep } from './featurePrep';
import { buildEquipmentOptionsAction, buildEquipmentOptionsInput } from '../aiActions/equipmentMatchAction';
import { hpPerLevelSources, hpPerLevelSum, type PerLevelSource } from '../perLevelEffects';
import { expertiseChoice, expertiseChoiceId, expertiseRider } from '../declaration/expertise';
import { optionListChoices, optionListRiders, optionChoiceId, unredactedChoiceFeatures } from '../declaration/optionList';
import { withDeclaredGrants } from '../declaration/grants';
import { characterPropertyChoices } from '../characterProperties';
import type { DeclaredFeature } from '../declaredFeature';
import type { ClassFeature } from '$lib/schemas/classProgression';
import type { LlmConfig } from '$lib/types';
import type { FeatureEffects, FeatureRider, FieldSummary } from '$lib/schemas/levelUp';
import type { EquipmentOptions } from '$lib/schemas/wizardEquipment';
import { equipmentCandidateNames, gatherStartingEquipment } from './startingEquipment';
import { pointBuyStart, type AbilityScores } from './pointBuy';
import type { AsiAllocation } from './backgroundAsi';

export type JobStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

export function toolPickKey(groupIdx: number, optionIdx: number, itemIdx: number): string {
  return `${groupIdx}:${optionIdx}:${itemIdx}`;
}

/** Münz-„Items" gehören in die Währung, nicht ins Inventar (siehe `selectedEquipment`). */
function isCoinItem(name: string): boolean {
  const n = name.trim();
  return /\b\w*münzen?\b/i.test(n) || /\bgold(stücke?|)\b/i.test(n) || /^\d+\s*(gm|sm|km|em|pm|gp|sp|cp|ep|pp)$/i.test(n);
}

/**
 * Ein KI-Job: reaktiver Status, abbrechbar. Ein neuer `run()` bricht den vorigen ab; dessen
 * verspätetes Settle wird über das abgebrochene Signal verworfen.
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

  /** Bewusst kein await — der Job läuft, während der Nutzer weiterarbeitet. */
  run(fn: (signal: AbortSignal) => Promise<T>): void {
    const signal = this.#begin();
    this.#running = fn(signal).then(
      (r) => { if (!signal.aborted) { this.result = r; this.status = 'done'; } },
      (e) => { if (!signal.aborted) { this.error = e instanceof Error ? e.message : String(e); this.status = 'error'; } },
    );
  }

  /** Nie rejektierend — der Zusammenbau soll an einem gescheiterten Job nicht hängenbleiben. */
  settle(): Promise<void> { return this.#running.then(() => {}, () => {}); }

  skip(): void { this.abort(); this.status = 'skipped'; }
  abort(): void { this.#ctrl?.abort(); this.#ctrl = null; }
  reset(): void { this.abort(); this.status = 'idle'; this.result = null; this.error = ''; }
}

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
  /** Englische Fertigkeitsnamen (das geschlossene Vokabular), nicht die Anzeigelabels. */
  chosenSkills = $state<string[]>([]);
  /** Gruppen-Index → Options-Index; fehlender Eintrag heißt erste Option. */
  equipmentSelection = $state<number[]>([]);
  /**
   * `toolPickKey(...)` → Bibliotheks-Name für Kategorie-Einträge (`choiceFrom`). Nicht am
   * Options-Objekt selbst, weil das KI-Ergebnis bei jedem `restart()` ersetzt wird.
   */
  toolPicks = $state<Record<string, string>>({});
  /** Waffenmeisterschaft: Bibliotheks-*Namen*, die Eigenschaft wird beim Rendern aufgelöst. */
  masteries = $state<string[]>([]);
  /** Kampfstile dagegen als Talent-`sourceKey` — das verlinkte Talent ist die Source of Truth. */
  fightingStyles = $state<string[]>([]);

  // ── Zauberwahl (Schritt „Zauber"; alle Listen `encodePick`-kodiert) ──
  pickedCantrips = $state<string[]>([]);
  /** Nur im `spellbook`-Regime der bekannt-Bestand; sonst unmittelbar die Vorbereitung. */
  pickedKnown = $state<string[]>([]);
  /** Bleibt außerhalb von `spellbook` leer — dort IST die Auswahl die Vorbereitung. */
  pickedPrepared = $state<string[]>([]);
  /**
   * Zauber aus `spell-pick`-Wahlen je Wahl-`id`. Getrennt vom Klassenkontingent, weil sie
   * nicht dagegen zählen und stets vorbereitet sind.
   */
  featureSpellPicks = $state<Record<string, string[]>>({});

  // ── Merkmalswahlen (Checkpoint, Schritt 5) ──
  /** Antworten auf die Wahlen der KI-ANALYSE — genau das, was als `<resolved_choices>` zurückgeht. */
  resolvedChoices = $state<ResolvedChoice[]>([]);
  /**
   * Die vier folgenden Felder kommen aus `buildFeaturePrep` und stehen ohne KI und ohne QM;
   * `$state` statt Getter, weil die Aufbereitung async ist.
   */
  spellAccess = $state<SpellAccessGrant[]>([]);
  sizeChoice = $state<AnalysisChoice | null>(null);
  hpPerLevel = $state<PerLevelSource[]>([]);
  /** ALLE Stufe-1-Merkmale; gefiltert wird nach Deklarationsart, nie nach Herkunft. */
  declared = $state<DeclaredFeature[]>([]);
  /**
   * Fest gewährte Fertigkeitsübungen aus `collectGrants`. Zusammen mit `chosenSkills` die
   * Optionsliste der Expertise-Wahl — ein Vault-Feld kann sie nicht tragen, sie ist der
   * Übungsstand DIESES Charakters.
   */
  grantedSkills = $state<string[]>([]);
  /**
   * Antworten auf die DEKLARIERTEN Wahlen. Bewusst ein zweiter Kanal: diese Merkmale stehen
   * nicht im KI-Eingang, und Pass C schreibt pro Eintrag in `<resolved_choices>` ein Protokoll
   * — eine ihm unbekannte id kann er nur einem erfundenen Rider zuordnen.
   */
  declaredAnswers = $state<ResolvedChoice[]>([]);

  // ── KI-Jobs ──
  analysis = new Job<FeatureAnalysis>();
  classText = new Job<FieldSummary>();
  speciesText = new Job<FieldSummary>();
  effects = new Job<FeatureEffects>();
  equipment = new Job<EquipmentOptions>();

  /** Letztes KI-Lebenszeichen (für die Stall-Anzeige der UI). */
  lastActivityMs = $state(0);

  #getConfig: () => LlmConfig;
  #prep: Promise<FeaturePrep> | null = null;

  constructor(getConfig: () => LlmConfig) {
    this.#getConfig = getConfig;
  }

  get basicsComplete(): boolean {
    return !!(this.species.sourceKey && this.klass.sourceKey && this.background.sourceKey);
  }

  get isQm(): boolean {
    return this.#getConfig().provider === 'qualityminds';
  }

  /**
   * Hängt reaktiv an `declaredAnswers`: erst die beantwortete Zauberliste macht aus dem
   * Kontingent eine benutzbare Zauber-Wahl (der Bibliotheks-Filter hängt daran).
   */
  get declaredChoices(): AnalysisChoice[] {
    const spells = this.spellAccess.flatMap((grant) => {
      const answer = this.declaredAnswers.find((a) => a.id === spellListChoiceId(grant))?.choice ?? '';
      return spellAccessChoices(grant, answer);
    });
    // EIN Durchgang über alle Herkünfte: beide Builder liefern `null` für Merkmale des
    // jeweils anderen `kind`, ein Vorsortieren wäre ein zweiter Filter.
    const branches = optionListChoices(this.declared);
    // Auf Stufe 1 hat nichts Expertise — der dritte Parameter ist bewusst leer.
    const expertise = this.declared
      .map((f) => expertiseChoice(f, this.proficientSkills, []))
      .filter((c): c is AnalysisChoice => c !== null);
    // Deklarierte Grundeigenschaften; `sizeChoice` daneben ist der Parser-Fallback für
    // Spezies ohne Deklaration und liefert für eine redigierte nichts mehr.
    const properties = characterPropertyChoices(this.declared);
    return [...(this.sizeChoice ? [this.sizeChoice] : []), ...properties, ...branches, ...expertise, ...spells];
  }

  /** Erzwungene Merkmalswahlen: deklarierte zuerst, dann die von der KI erkannten. */
  get featureChoices(): AnalysisChoice[] {
    const declared = this.declaredChoices;
    return [...declared, ...withoutOwnedChoices(declared, this.analysis.result?.choices ?? [])];
  }

  get proficientSkills(): string[] {
    return [...new Set([...this.grantedSkills, ...this.chosenSkills])];
  }

  get spellPickChoices() {
    return this.featureChoices.filter((c) => c.type === 'spell-pick');
  }

  get plainChoices() {
    return this.featureChoices.filter((c) => c.type !== 'spell-pick');
  }

  /**
   * `withDeclaredGrants` liegt NUR auf den KI-Ridern: die Rider der Zweigwahlen tragen die
   * Grants der GEWÄHLTEN OPTION, die das unbedingte `grants` des Merkmals nicht ersetzen darf.
   */
  get riders() {
    const answerOf = (id: string): string => this.declaredAnswers.find((a) => a.id === id)?.choice ?? '';
    // Stufe 1: nur die erste Zeile einer Options-Zauberliste greift (Elfenabstammung).
    const declared = optionListRiders(this.declared, answerOf, 1);
    const expertise = this.declared
      .map((f) => expertiseRider(f, answerOf(expertiseChoiceId(f)).split(',').map((x) => x.trim())))
      .filter((r): r is FeatureRider => r !== null);
    const ai = withDeclaredGrants(this.effects.result?.riders ?? [], this.declared);
    return [...ai, ...declared, ...expertise];
  }

  #touch = (): void => { this.lastActivityMs = performance.now(); };

  #prepare(): Promise<FeaturePrep> {
    if (!this.#prep) {
      this.#prep = buildFeaturePrep({ species: this.species, klass: this.klass, background: this.background });
    }
    return this.#prep;
  }

  kickoff(): void {
    const cfg = this.#getConfig();
    this.#prep = null; // frische Aufbereitung für die aktuelle Grundwahl

    // Deklarierte Zauber-Zugänge: unabhängig vom Anbieter und vom KI-Status. Der Guard gegen
    // die eigene Prep-Promise verwirft ein verspätetes Settle nach `restart()`.
    const pending = this.#prepare();
    void pending.then((prep) => {
      if (this.#prep !== pending) return;
      this.spellAccess = prep.spellAccess;
      this.sizeChoice = prep.sizeChoice;
      this.hpPerLevel = hpPerLevelSources(prep.effectFeatures);
      this.declared = prep.declared;
    }, () => {});

    // Klassen- UND Speziesmerkmale, damit Volks-Wahlen (Drakonische Urahnen) als erzwungene
    // Wahl erkannt werden.
    if (this.isQm) {
      this.analysis.run(async (signal) => {
        const prep = await this.#prepare();
        return analyzeFeatureEffects(
          cfg,
          { classContext: prep.classContext, features: [...prep.analysisGained, ...prep.analysisSpeciesFeatures], pastChoices: [] },
          { signal, onActivity: this.#touch },
        );
      });
    } else {
      this.analysis.skip();
      this.effects.skip();
    }

    // classText/speciesText laufen BEWUSST NICHT hier, sondern erst in `summarizeFeatures()`.

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
    this.declaredAnswers = [];
    this.spellAccess = [];
    this.sizeChoice = null;
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

  /** DEUTSCHE Labels: das Ziel ist der Bogen-Freitext, nicht der Prompt-Kanal. */
  #choiceByFeatureKey(): Map<string, string> {
    const byId = new Map(this.featureChoices.map((c) => [c.id, c]));
    const map = new Map<string, string>();
    for (const rc of [...this.resolvedChoices, ...this.declaredAnswers]) {
      const choice = byId.get(rc.id);
      const key = choice?.featureKey;
      if (!key || !choice || !rc.choice.trim()) continue;
      // Gewählte Zauber stehen im Zauber-Block des Bogens; im Merkmalstext wären sie die
      // Dublette, die die Doktrin ausdrücklich draußen haben will.
      if (choice.type === 'spell-pick') continue;
      const label = choiceLabelsDe(choice, rc.choice);
      map.set(key, map.has(key) ? `${map.get(key)}, ${label}` : label);
    }
    return map;
  }

  /**
   * Läuft erst NACH dem Wahl-Checkpoint: sonst steht im Text ein Platzhalter („Resistenz
   * gegen [Schadensart]") statt der getroffenen Wahl. Über jeden Anbieter.
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
      // Das Kampfstil-Merkmal ist flow-eigen und daher aus der KI-Analyse gefiltert; ohne
      // diese Zeilen fehlte die getroffene Wahl im Klassenmerkmale-Text ganz.
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

  /** QM-only; ohne Analyse-Ergebnis bleibt der Effekt-Job übersprungen. */
  finalizeFeatures(): void {
    const cfg = this.#getConfig();
    if (!this.isQm || this.analysis.status !== 'done' || !this.analysis.result) {
      this.effects.skip();
      return;
    }
    const analysis = this.analysis.result;
    const answerOf = (id: string): string => this.declaredAnswers.find((a) => a.id === id)?.choice ?? '';
    this.effects.run(async (signal) => {
      const prep = await this.#prepare();
      // Merkmale, deren Zweig nichts deklariert: die Wahl steht, die Prosa der Option deutet
      // Pass C. `gainedAt: 1` — im Wizard ist alles Stufe 1.
      const unredacted = unredactedChoiceFeatures(prep.declared, (f) => answerOf(optionChoiceId(f)))
        .map((f) => ({ ...f, desc: f.desc ?? '', gainedAt: 1 }));
      return finalizeFeatureEffects(
        cfg,
        {
          classContext: prep.classContext,
          features: [...prep.analysisGained, ...prep.analysisSpeciesFeatures, ...unredacted],
          pastChoices: [],
          resolvedChoices: this.resolvedChoices,
        },
        analysis,
        { signal, onActivity: this.#touch },
      );
    });
  }

  selectedOptionIndex(groupIdx: number): number {
    const options = this.equipment.result?.groups[groupIdx]?.options ?? [];
    const idx = this.equipmentSelection[groupIdx] ?? 0;
    return options[idx] ? idx : 0;
  }

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
        // Kategorie-Eintrag ohne Wahl fällt weg — „Handwerkszeug" ist kein Gegenstand.
        const picked = item.choiceFrom ? this.toolPicks[toolPickKey(gi, oi, ii)] : item.name;
        if (picked) items.push({ name: picked, count: item.count });
      });
      goldPieces += opt.goldPieces;
    });
    return { items, goldPieces };
  }

  pendingToolChoices(): number {
    const groups = this.equipment.result?.groups ?? [];
    return groups.reduce((sum, group, gi) => {
      const oi = this.selectedOptionIndex(gi);
      const opt = group.options[oi];
      if (!opt) return sum;
      return sum + opt.items.filter((it, ii) => it.choiceFrom && !this.toolPicks[toolPickKey(gi, oi, ii)]).length;
    }, 0);
  }

  hpPerLevelBonus(): number {
    return hpPerLevelSum(this.hpPerLevel);
  }

  async awaitPending(): Promise<void> {
    await Promise.all([
      this.effects.settle(),
      this.classText.settle(),
      this.speciesText.settle(),
      this.equipment.settle(),
    ]);
  }

  dispose(): void {
    this.analysis.abort();
    this.classText.abort();
    this.speciesText.abort();
    this.effects.abort();
    this.equipment.abort();
  }
}
