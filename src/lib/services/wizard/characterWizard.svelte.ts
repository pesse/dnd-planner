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
import { buildFeaturePrep, type FeatOwner, type FeaturePrep } from './featurePrep';
import { choiceOwnerOf, ownedSpellAccessFacts, type ChoiceOwner } from './choiceOwners';
import { unredactedChoiceFeatures } from '../declaration/optionList';
import { declarationGapLines } from '../declarationGap';
import { declaredGrantRiders } from '../declaration/grants';
import { isLanguageChoice } from '../declaration/languages';
import { splitChoiceAnswer } from '../declaration/source';
import { COMMON_LANGUAGE } from './personal';
import { wizardAnswers, wizardDeclaredChoices, wizardRiders } from './wizardChoices';
import { getItemsByDir } from '$lib/itemLibrary';
import type { ToolItem } from '../declaration/toolProficiency';
import type { DeclaredFeature } from '../declaredFeature';
import { gatherStartingEquipment, type EquipmentGroup } from './startingEquipment';
import { pointBuyStart, type AbilityScores } from './pointBuy';
import type { AsiAllocation } from './backgroundAsi';
import { collectGrants, type CollectedGrants, type OpenChoice } from '../proficiencyGrants';
import { SKILL_NAMES } from '$lib/schemas/vocabulary';
import { spellInfoByKey, type SpellInfo } from '$lib/spellLibrary';
import { traitFeatPicks, wizardGrantInput } from './castingDraft';
import { Keyed } from './keyed.svelte';

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

const skillChoiceKey = (ch: OpenChoice): string => `${ch.source.sourceKey}|${ch.source.label}`;

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

  // Je Grundwahl, von der die Wahl abhängt — der Schlüssel ist die Abhängigkeit.
  #asi = new Keyed<AsiAllocation>(() => this.background.sourceKey, () => ({}));
  #masteries = new Keyed<string[]>(() => this.klass.sourceKey, () => []);
  #fightingStyles = new Keyed<string[]>(() => this.klass.sourceKey, () => []);
  #optionPicks = new Keyed<OptionPick[]>(() => this.klass.sourceKey, () => []);
  // Der Hintergrund gehört dazu: sein Herkunftstalent fällt aus dem Angebot.
  #traitFeats = new Keyed<Record<string, string[]>>(() => `${this.species.sourceKey}|${this.background.sourceKey}`, () => ({}));
  #equipmentSelection = new Keyed<number[]>(() => this.#equipmentKey, () => []);
  #toolPicks = new Keyed<Record<string, string>>(() => this.#equipmentKey, () => ({}));
  #spellcasting = new Keyed<CharacterSpellcasting>(() => this.originSig, emptySpellcasting);

  get asi() { return this.#asi.value; }
  set asi(v) { this.#asi.value = v; }
  /** Waffenmeisterschaft: Bibliotheks-*Namen*, die Eigenschaft wird beim Rendern aufgelöst. */
  get masteries() { return this.#masteries.value; }
  set masteries(v) { this.#masteries.value = v; }
  /** Kampfstile dagegen als Talent-`sourceKey` — das verlinkte Talent ist die Source of Truth. */
  get fightingStyles() { return this.#fightingStyles.value; }
  set fightingStyles(v) { this.#fightingStyles.value = v; }
  /** Options-Pools (Metamagie): dieselbe flache Liste wie am Charakter, über alle Pools. */
  get optionPicks() { return this.#optionPicks.value; }
  set optionPicks(v) { this.#optionPicks.value = v; }
  /** Talent-Keys je wählendem Speziesmerkmal (Vielseitig) — Links wie die Kampfstile. */
  get traitFeats() { return this.#traitFeats.value; }
  /** Gruppen-Index → Options-Index; fehlender Eintrag heißt erste Option. */
  get equipmentSelection() { return this.#equipmentSelection.value; }
  set equipmentSelection(v) { this.#equipmentSelection.value = v; }
  /** `toolPickKey(...)` → Item-Key für Kategorie-Einträge (`choiceFrom`). */
  get toolPicks() { return this.#toolPicks.value; }
  set toolPicks(v) { this.#toolPicks.value = v; }
  /**
   * Schritt „Zauber": der fertige Block des Charakters, Kontingent für Kontingent
   * geschrieben — dieselbe Form, die der Editor führt.
   */
  get spellcasting() { return this.#spellcasting.value; }
  set spellcasting(v) { this.#spellcasting.value = v; }

  equipmentGroups = $state<EquipmentGroup[]>([]);
  /** Zauber einer `spell-pick`-Wahl ohne Quota je Wahl-`id` — sie werden quellenloser Bestand. */
  featureSpellPicks = $state<Record<string, string[]>>({});
  /** Rohantworten des Merkmals-Schritts je Wahl-`id`; was davon gilt, sagt `declaredAnswers`. */
  choiceAnswers = $state<Record<string, string[]>>({});
  /** Für den Antworttext einer Zauber-Wahl ohne Quota (Namen statt Keys). */
  spellLib = $state<SpellInfo[]>([]);

  /**
   * Die vier folgenden Felder kommen aus `buildFeaturePrep`;
   * `$state` statt Getter, weil die Aufbereitung async ist.
   */
  spellAccess = $state<SpellAccessGrant[]>([]);
  sizeChoice = $state<AnalysisChoice | null>(null);
  /** ALLE Stufe-1-Merkmale; gefiltert wird nach Deklarationsart, nie nach Herkunft. */
  declared = $state<DeclaredFeature[]>([]);
  featOwners = $state<FeatOwner[]>([]);
  grants = $state<CollectedGrants | null>(null);
  /** Optionen der Werkzeug-Wahl, aus `items/tools/`; leer = Freitext. */
  toolLib = $state<ToolItem[]>([]);
  /** Fertigkeitswahlen je Quelle — eine andere Klasse hat eine andere Quelle. */
  #skillPicks = $state<Record<string, string[]>>({});

  #prep: Promise<FeaturePrep> | null = null;
  #grantsLoad: Promise<CollectedGrants> | null = null;
  #equipmentLoad: Promise<EquipmentGroup[]> | null = null;
  #loadedSig = '';

  get originSig(): string {
    return `${this.species.sourceKey}|${this.klass.sourceKey}|${this.background.sourceKey}`;
  }

  get #equipmentKey(): string {
    return `${this.klass.sourceKey}|${this.background.sourceKey}`;
  }

  get basicsComplete(): boolean {
    return !!(this.species.sourceKey && this.klass.sourceKey && this.background.sourceKey);
  }

  /**
   * Fest gewährte Fertigkeitsübungen aus `collectGrants`. Zusammen mit `chosenSkills` die
   * Optionsliste der Expertise-Wahl — ein Vault-Feld kann sie nicht tragen, sie ist der
   * Übungsstand DIESES Charakters.
   */
  grantedSkills = $derived(this.grants?.skills.map((g) => g.value) ?? []);
  /** Fest gewährte Rettungswurf-Übungen — Bedingung der Ersatz-Wahl. */
  grantedSaves = $derived(this.grants?.savingThrows.map((g) => g.value) ?? []);

  /** Je offener Fertigkeitswahl die gültige Auswahl, in der Reihenfolge von `grants.choices`. */
  get skillPicks(): string[][] {
    const granted = new Set<string>(this.grantedSkills);
    return (this.grants?.choices ?? []).map((ch) => {
      const allowed = new Set<string>(ch.from.length ? ch.from : SKILL_NAMES);
      return (this.#skillPicks[skillChoiceKey(ch)] ?? [])
        .filter((s) => allowed.has(s) && !granted.has(s))
        .slice(0, ch.choose);
    });
  }
  set skillPicks(picks: string[][]) {
    const next = { ...this.#skillPicks };
    (this.grants?.choices ?? []).forEach((ch, i) => { next[skillChoiceKey(ch)] = picks[i] ?? []; });
    this.#skillPicks = next;
  }

  /** Englische Fertigkeitsnamen (das geschlossene Vokabular), nicht die Anzeigelabels. */
  chosenSkills = $derived([...new Set(this.skillPicks.flat())]);

  get skillPicksDone(): boolean {
    const picks = this.skillPicks;
    return !!this.grants && this.grants.choices.every((ch, i) => picks[i].length === ch.choose);
  }

  get proficientSkills(): string[] {
    return [...new Set([...this.grantedSkills, ...this.chosenSkills])];
  }

  /** Liest die ROHEN Antworten: erst die beantwortete Zauberliste macht aus dem Kontingent eine Wahl. */
  declaredChoices = $derived(
    wizardDeclaredChoices({
      spellAccess: this.spellAccess,
      declaredAnswers: Object.entries(this.choiceAnswers).map(([id, v]) => ({ id, choice: v.join(', ') })),
      declared: this.declared,
      proficientSkills: this.proficientSkills,
      proficientSaves: this.grantedSaves,
      sizeChoice: this.sizeChoice,
      tools: this.toolLib,
    }),
  );

  /** Die gültigen Antworten — der einzige Antwort-Kanal in den Charakter. */
  declaredAnswers: DeclaredAnswer[] = $derived(
    wizardAnswers(this.declaredChoices, this.choiceAnswers, (ch) =>
      // Eine Zauber-Wahl MIT Quota beantwortet der Zauber-Block; ihre Zauber hier noch
      // einmal als Antworttext wären die zweite Wahrheit.
      ch.sourceId && ch.quotaId
        ? ''
        : (this.featureSpellPicks[ch.id] ?? []).map((v) => spellInfoByKey(this.spellLib, v)?.name ?? v).join(', '),
    ),
  );

  get spellPickChoices() {
    return this.declaredChoices.filter((c) => c.type === 'spell-pick');
  }

  get plainChoices() {
    return this.declaredChoices.filter((c) => c.type !== 'spell-pick');
  }

  #ownerOf = $derived(choiceOwnerOf({
    backgroundKey: this.background.sourceKey,
    featOwners: this.featOwners,
    spellAccess: this.spellAccess,
  }));

  /** Die Wahlen, die im Schritt von `owner` stehen. */
  choicesOf(owner: ChoiceOwner) {
    return this.plainChoices.filter((c) => this.#ownerOf(c) === owner);
  }

  factsOf(owner: ChoiceOwner) {
    return ownedSpellAccessFacts(owner, this.featOwners, this.spellAccess);
  }

  /** Pflicht: ohne die Antwort bliebe die Zauberliste offen und der Zauber-Schritt hätte nichts anzubieten. */
  choicesDone(owner: ChoiceOwner): boolean {
    const answered = new Set(this.declaredAnswers.map((a) => a.id));
    return this.choicesOf(owner).every((c) => answered.has(c.id));
  }

  /** Was Merkmale an Sprachen bringen, fest oder gewählt — im Sprachen-Schritt nicht noch einmal wählbar. */
  get featureLanguages(): string[] {
    const ids = new Set(this.plainChoices.filter(isLanguageChoice).map((c) => c.id));
    const chosen = this.declaredAnswers.filter((a) => ids.has(a.id)).flatMap((a) => splitChoiceAnswer(a.choice));
    return [...new Set([...this.#grantedLanguages, ...chosen])];
  }

  /** Was der Charakter ohne Sprachwahl eines Merkmals spricht. */
  get fixedLanguages(): string[] {
    return [...new Set([COMMON_LANGUAGE, ...this.languages, ...this.#grantedLanguages])];
  }

  get #grantedLanguages(): string[] {
    return declaredGrantRiders(this.declared).flatMap((r) => r.proficiencies.languages);
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

  /** Der Guard gegen die eigene Promise verwirft ein verspätetes Settle nach einem Neuladen. */
  #loadPrep(): void {
    const pending = buildFeaturePrep({
      species: this.species,
      klass: this.klass,
      background: this.background,
      traitFeats: traitFeatPicks(this.traitFeats),
    });
    this.#prep = pending;
    void pending.then((prep) => {
      if (this.#prep !== pending) return;
      this.spellAccess = prep.spellAccess;
      this.sizeChoice = prep.sizeChoice;
      this.declared = prep.declared;
      this.featOwners = prep.featOwners;
    }, () => {});
  }

  /** Übungsschritt und Montage fragen dieselben Quellen — Talent-Links eingeschlossen (Begabt). */
  #loadGrants(): void {
    const pending = collectGrants(wizardGrantInput(this));
    this.#grantsLoad = pending;
    void pending.then((g) => {
      if (this.#grantsLoad === pending) this.grants = g;
    }, () => {});
  }

  /** Ein gewähltes Talent bringt eigene Deklarationen mit (Begabt: drei Fertigkeiten). */
  setTraitFeats(featureKey: string, keys: string[]): void {
    this.#traitFeats.value = { ...this.traitFeats, [featureKey]: keys };
    this.#loadPrep();
    this.#loadGrants();
  }

  /**
   * Lädt alles, was aus Klasse, Volk und Hintergrund folgt — nach jeder Änderung der
   * Grundwahl neu. Abhängige Wahlen bleiben dabei stehen; was nicht mehr passt, filtern die
   * Ableitungen heraus. Merkmale schon vor der Klasse: Hintergrund und Volks-Talent fragen
   * ihre Wahlen in ihrem eigenen Schritt.
   */
  kickoff(): void {
    if (this.#loadedSig === this.originSig) return;
    this.#loadedSig = this.originSig;
    if (!this.toolLib.length) void getItemsByDir('tools').then((t) => { this.toolLib = t; }, () => {});
    this.#loadPrep();
    this.#loadGrants();
    if (!this.basicsComplete) return;

    const pending = gatherStartingEquipment(this.klass.sourceKey, this.background.sourceKey);
    this.#equipmentLoad = pending;
    void pending.then((groups) => {
      if (this.#equipmentLoad === pending) this.equipmentGroups = groups;
    }, () => {});
  }

  /** Bis alles Nachgeladene steht — auch was ein Settle seinerseits neu angestoßen hat. */
  async settled(): Promise<void> {
    for (;;) {
      const pending = [this.#prep, this.#grantsLoad, this.#equipmentLoad];
      await Promise.allSettled(pending);
      if (pending.every((p, i) => p === [this.#prep, this.#grantsLoad, this.#equipmentLoad][i])) return;
    }
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
}
