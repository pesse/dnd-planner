/**
 * Zustand und KI-Jobs des Charakter-Erstell-Wizards (Stufe 1).
 * Bewusst ohne Worker/Tauri-Hintergrundtask: ein nicht-awaitetes Promise blockiert die UI
 * nicht. Mechanik kommt vollständig aus der Deklaration; die KI schreibt nur Bogen-Freitext.
 */
import { getFeats, featDesc, featDisplayName } from '$lib/featsLibrary';
import { choiceLabelsDe, type AnalysisChoice } from '../analysis/types';
import type { DeclaredAnswer } from '../declaredChoice';
import type { SpellAccessGrant } from '../spellcasting/access';
import { emptySpellcasting } from '../spellcasting/write';
import type { CharacterSpellcasting } from '$lib/schemas/spellcasting';
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
import { unredactedChoiceFeatures } from '../declaration/optionList';
import { declarationGapLines } from '../declarationGap';
import { wizardDeclaredChoices, wizardRiders } from './wizardChoices';
import type { DeclaredFeature } from '../declaredFeature';
import type { ClassFeature } from '$lib/schemas/classProgression';
import type { LlmConfig } from '$lib/types';
import type { FieldSummary } from '$lib/schemas/levelUp';
import type { EquipmentOptions } from '$lib/schemas/wizardEquipment';
import { equipmentCandidateNames, gatherStartingEquipment } from './startingEquipment';
import { pointBuyStart, type AbilityScores } from './pointBuy';
import type { AsiAllocation } from './backgroundAsi';
import { Job } from './job.svelte';

export function toolPickKey(groupIdx: number, optionIdx: number, itemIdx: number): string {
  return `${groupIdx}:${optionIdx}:${itemIdx}`;
}

/** Münz-„Items" gehören in die Währung, nicht ins Inventar (siehe `selectedEquipment`). */
function isCoinItem(name: string): boolean {
  const n = name.trim();
  return /\b\w*münzen?\b/i.test(n) || /\bgold(stücke?|)\b/i.test(n) || /^\d+\s*(gm|sm|km|em|pm|gp|sp|cp|ep|pp)$/i.test(n);
}

export interface WizardLink {
  sourceKey: string;
  name: string;
}

export class CharacterWizard {
  name = $state('');
  playerName = $state('');

  species: WizardLink & { subspeciesKey?: string; subspeciesName?: string } = $state({ sourceKey: '', name: '' });
  klass: WizardLink & { subclassKey?: string; subclassName?: string } = $state({ sourceKey: '', name: '' });
  background: WizardLink = $state({ sourceKey: '', name: '' });

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

  /**
   * Schritt „Zauber": der fertige Block des Charakters, Kontingent für Kontingent
   * geschrieben — dieselbe Form, die der Editor führt.
   */
  spellcasting = $state<CharacterSpellcasting>(emptySpellcasting());
  /** Zauber einer `spell-pick`-Wahl ohne Quota je Wahl-`id` — sie werden quellenloser Bestand. */
  featureSpellPicks = $state<Record<string, string[]>>({});

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
  /** Antworten auf die deklarierten Wahlen — der einzige Antwort-Kanal des Wizards. */
  declaredAnswers = $state<DeclaredAnswer[]>([]);

  classText = new Job<FieldSummary>();
  speciesText = new Job<FieldSummary>();
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

  get declaredChoices(): AnalysisChoice[] {
    return wizardDeclaredChoices({
      spellAccess: this.spellAccess,
      declaredAnswers: this.declaredAnswers,
      declared: this.declared,
      proficientSkills: this.proficientSkills,
      sizeChoice: this.sizeChoice,
    });
  }

  get proficientSkills(): string[] {
    return [...new Set([...this.grantedSkills, ...this.chosenSkills])];
  }

  get spellPickChoices() {
    return this.declaredChoices.filter((c) => c.type === 'spell-pick');
  }

  get plainChoices() {
    return this.declaredChoices.filter((c) => c.type !== 'spell-pick');
  }

  get riders() {
    return wizardRiders({ declared: this.declared, declaredAnswers: this.declaredAnswers });
  }

  /**
   * Merkmale, deren Prosa eine Mechanik ankündigt, für die keine Deklaration steht — sie fällt
   * aus, und der Spieler muss das sehen. Dieselbe Regel wie im Aufstieg.
   */
  get gaps(): string[] {
    const answerOf = (id: string): string => this.declaredAnswers.find((a) => a.id === id)?.choice ?? '';
    return declarationGapLines(this.declared, unredactedChoiceFeatures(this.declared, answerOf));
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
    this.classText.reset();
    this.speciesText.reset();
    this.declaredAnswers = [];
    this.spellAccess = [];
    this.sizeChoice = null;
    this.equipmentSelection = [];
    this.toolPicks = {};
    this.masteries = [];
    this.fightingStyles = [];
    this.spellcasting = emptySpellcasting();
    this.featureSpellPicks = {};
    this.kickoff();
  }

  /** DEUTSCHE Labels: das Ziel ist der Bogen-Freitext, nicht der Prompt-Kanal. */
  #choiceByFeatureKey(): Map<string, string> {
    const byId = new Map(this.declaredChoices.map((c) => [c.id, c]));
    const map = new Map<string, string>();
    for (const rc of this.declaredAnswers) {
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
    await Promise.all([this.classText.settle(), this.speciesText.settle(), this.equipment.settle()]);
  }

  dispose(): void {
    this.classText.abort();
    this.speciesText.abort();
    this.equipment.abort();
  }
}
