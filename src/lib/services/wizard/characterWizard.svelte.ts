/**
 * Zustand des Charakter-Erstell-Wizards (Stufe 1). Alles kommt aus der Deklaration — die
 * Bogentexte fasst erst der Bearbeiten-Modus zusammen.
 */
import { type AnalysisChoice } from '../analysis/types';
import type { DeclaredAnswer } from '../declaredChoice';
import type { SpellAccessGrant } from '../spellcasting/access';
import { emptySpellcasting } from '../spellcasting/write';
import type { CharacterSpellcasting } from '$lib/schemas/spellcasting';
import type { OptionPick, Presentation } from '$lib/schemas/characterSchema';
import { buildFeaturePrep, type FeaturePrep } from './featurePrep';
import { hpFlatSum, hpPerLevelSources, hpPerLevelSum, type PerLevelSource } from '../perLevelEffects';
import { unredactedChoiceFeatures } from '../declaration/optionList';
import { declarationGapLines } from '../declarationGap';
import { wizardDeclaredChoices, wizardRiders } from './wizardChoices';
import { getItemsByDir } from '$lib/itemLibrary';
import type { ToolItem } from '../declaration/toolProficiency';
import type { DeclaredFeature } from '../declaredFeature';
import { gatherStartingEquipment, type EquipmentGroup } from './startingEquipment';
import { pointBuyStart, type AbilityScores } from './pointBuy';
import type { AsiAllocation } from './backgroundAsi';

export function toolPickKey(groupIdx: number, optionIdx: number, itemIdx: number): string {
  return `${groupIdx}:${optionIdx}:${itemIdx}`;
}

export interface SelectedItem {
  itemKey: string;
  count: number;
  noteDe?: string;
}

export interface WizardLink {
  sourceKey: string;
  name: string;
}

export class CharacterWizard {
  name = $state('');
  playerName = $state('');
  /** Zwei Standardsprachen; die Gemeinsprache kennt jeder und steht nicht in der Wahl. */
  languages = $state<string[]>([]);
  alignment = $state('');
  traits = $state('');
  ideals = $state('');
  bonds = $state('');
  flaws = $state('');
  appearance = $state('');
  abilityMethod = $state<'standard' | 'pointBuy'>('standard');

  species: WizardLink & { subspeciesKey?: string; subspeciesName?: string } = $state({ sourceKey: '', name: '' });
  presentation = $state<Presentation | ''>('');
  klass: WizardLink & { subclassKey?: string; subclassName?: string } = $state({ sourceKey: '', name: '' });
  background: WizardLink = $state({ sourceKey: '', name: '' });

  scores = $state<AbilityScores>(pointBuyStart());
  asi = $state<AsiAllocation>({});
  /** Englische Fertigkeitsnamen (das geschlossene Vokabular), nicht die Anzeigelabels. */
  chosenSkills = $state<string[]>([]);
  /** Gruppen-Index → Options-Index; fehlender Eintrag heißt erste Option. */
  equipmentSelection = $state<number[]>([]);
  /** `toolPickKey(...)` → Item-Key für Kategorie-Einträge (`choiceFrom`). */
  toolPicks = $state<Record<string, string>>({});
  equipmentGroups = $state<EquipmentGroup[]>([]);
  /** Waffenmeisterschaft: Bibliotheks-*Namen*, die Eigenschaft wird beim Rendern aufgelöst. */
  masteries = $state<string[]>([]);
  /** Kampfstile dagegen als Talent-`sourceKey` — das verlinkte Talent ist die Source of Truth. */
  fightingStyles = $state<string[]>([]);
  /** Talent-Keys je wählendem Speziesmerkmal (Vielseitig) — Links wie die Kampfstile. */
  traitFeats = $state<Record<string, string[]>>({});
  /** Options-Pools (Metamagie): dieselbe flache Liste wie am Charakter, über alle Pools. */
  optionPicks = $state<OptionPick[]>([]);

  /**
   * Schritt „Zauber": der fertige Block des Charakters, Kontingent für Kontingent
   * geschrieben — dieselbe Form, die der Editor führt.
   */
  spellcasting = $state<CharacterSpellcasting>(emptySpellcasting());
  /** Zauber einer `spell-pick`-Wahl ohne Quota je Wahl-`id` — sie werden quellenloser Bestand. */
  featureSpellPicks = $state<Record<string, string[]>>({});

  /**
   * Die vier folgenden Felder kommen aus `buildFeaturePrep`;
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
  /** Optionen der Werkzeug-Wahl, aus `items/tools/`; leer = Freitext. */
  toolLib = $state<ToolItem[]>([]);

  #prep: Promise<FeaturePrep> | null = null;
  #equipmentLoad: Promise<EquipmentGroup[]> | null = null;

  get basicsComplete(): boolean {
    return !!(this.species.sourceKey && this.klass.sourceKey && this.background.sourceKey);
  }

  get declaredChoices(): AnalysisChoice[] {
    return wizardDeclaredChoices({
      spellAccess: this.spellAccess,
      declaredAnswers: this.declaredAnswers,
      declared: this.declared,
      proficientSkills: this.proficientSkills,
      sizeChoice: this.sizeChoice,
      tools: this.toolLib,
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

  #prepare(): Promise<FeaturePrep> {
    if (!this.#prep) {
      this.#prep = buildFeaturePrep({
        species: this.species,
        klass: this.klass,
        background: this.background,
        traitFeats: Object.values(this.traitFeats).flat(),
      });
    }
    return this.#prep;
  }

  /** Der Guard gegen die eigene Prep-Promise verwirft ein verspätetes Settle nach `restart()`. */
  #loadPrep(): void {
    this.#prep = null;
    const pending = this.#prepare();
    void pending.then((prep) => {
      if (this.#prep !== pending) return;
      this.spellAccess = prep.spellAccess;
      this.sizeChoice = prep.sizeChoice;
      this.hpPerLevel = hpPerLevelSources(prep.effectFeatures);
      this.declared = prep.declared;
    }, () => {});
  }

  /** Ein gewähltes Talent bringt eigene Deklarationen mit (Begabt: drei Fertigkeiten). */
  setTraitFeats(featureKey: string, keys: string[]): void {
    this.traitFeats = { ...this.traitFeats, [featureKey]: keys };
    this.#loadPrep();
  }

  /** Lädt alles, was aus Klasse, Volk und Hintergrund folgt. */
  kickoff(): void {
    if (!this.toolLib.length) void getItemsByDir('tools').then((t) => { this.toolLib = t; }, () => {});
    this.#loadPrep();

    this.equipmentSelection = [];
    this.toolPicks = {};
    const pending = gatherStartingEquipment(this.klass.sourceKey, this.background.sourceKey);
    this.#equipmentLoad = pending;
    void pending.then((groups) => {
      if (this.#equipmentLoad === pending) this.equipmentGroups = groups;
    }, () => {});
  }

  /** Grundwahl nach dem Start geändert → abhängige Wahlen verwerfen und neu laden. */
  restart(): void {
    this.declaredAnswers = [];
    this.spellAccess = [];
    this.sizeChoice = null;
    this.equipmentSelection = [];
    this.toolPicks = {};
    this.masteries = [];
    this.fightingStyles = [];
    this.traitFeats = {};
    this.optionPicks = [];
    this.spellcasting = emptySpellcasting();
    this.featureSpellPicks = {};
    this.kickoff();
  }

  selectedOptionIndex(groupIdx: number): number {
    const options = this.equipmentGroups[groupIdx]?.options ?? [];
    const idx = this.equipmentSelection[groupIdx] ?? 0;
    return options[idx] ? idx : 0;
  }

  selectedEquipment(): { items: SelectedItem[]; goldPieces: number } {
    const items: SelectedItem[] = [];
    let goldPieces = 0;
    this.equipmentGroups.forEach((group, gi) => {
      const oi = this.selectedOptionIndex(gi);
      const opt = group.options[oi];
      if (!opt) return;
      opt.items.forEach((item, ii) => {
        // Kategorie-Eintrag ohne Wahl fällt weg — „Handwerkszeug" ist kein Gegenstand.
        const itemKey = item.choiceFrom ? this.toolPicks[toolPickKey(gi, oi, ii)] : item.itemKey;
        if (itemKey) items.push({ itemKey, count: item.count, ...(item.choiceFrom ? {} : { noteDe: item.noteDe }) });
      });
      goldPieces += opt.goldPieces;
    });
    return { items, goldPieces };
  }

  pendingToolChoices(): number {
    const groups = this.equipmentGroups;
    return groups.reduce((sum, group, gi) => {
      const oi = this.selectedOptionIndex(gi);
      const opt = group.options[oi];
      if (!opt) return sum;
      return sum + opt.items.filter((it, ii) => it.choiceFrom && !this.toolPicks[toolPickKey(gi, oi, ii)]).length;
    }, 0);
  }

  /** Auf Stufe 1 zählt ein Bonus je Stufe genau einmal. */
  hpBonusAtLevelOne(): number {
    return hpPerLevelSum(this.hpPerLevel) + hpFlatSum(this.hpPerLevel);
  }
}
