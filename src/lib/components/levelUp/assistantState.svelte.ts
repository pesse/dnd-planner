/**
 * Nicht-persistenter UI-Zustand des Stufenaufstieg-Assistenten: Klassen-/Zielstufen-Wahl,
 * Fragebogen-Antworten, TP-Würfe, Inline-Zauberanlage, Talentsuche und der Abschluss.
 */
import { type StepId, STEP_META } from '$lib/services/levelUp/steps';
import { stepOf } from '$lib/services/levelUp/runState';
import type { LevelUpRun } from '$lib/services/levelUp/run.svelte';
import { computeLevelUpDelta, type LevelUpDelta } from '$lib/services/levelUp';
import { baseDeltaChanges, decisionChanges } from '$lib/services/levelUp/changes';
import { mod } from '$lib/domain/skills';
import { loadBaseClasses } from '$lib/services/wizard/originCatalog';
import type { ClassProgression } from '$lib/types';
import { blankSpell, getSpellLibrary, createSpellInline } from '$lib/spellLibrary';
import { type Change, type LevelUpQuestion, type LevelUpChangeSet } from '$lib/schemas/levelUp';
import { FEAT_CATEGORY_DE, searchFeats, featDesc, featDisplayName, type FeatEntry } from '$lib/featsLibrary';
import type { FeatCategory } from '$lib/schemas/vocabulary';
import { featCategoryOptions, pickableFeats, type FightingStyleOption } from '$lib/services/fightingStyle';
import { slotTotal, type CategorySlot } from '$lib/services/levelUp/featUnlocks';
import { type Character } from '$lib/schemas/characterSchema';
import { type AbilityKey } from '$lib/schemas/abilities';
import { cappedScore } from '$lib/services/declaration/abilityIncrease';
import { SPELL_SCHOOLS } from '$lib/types';

export const SCHOOL_KEYS = Object.keys(SPELL_SCHOOLS);

export interface SpellCreatorState {
  targetQ: string | null;
  name: string;
  nameEn: string;
  level: number;
  school: string;
  levels: number[];
}

export interface NewFeature { id: string; key: string; name: string; text: string; subclass: boolean }

export class LevelUpAssistantUi {
  #run: LevelUpRun;
  #getCharacter: () => Character;
  #onApply: (changeSet: LevelUpChangeSet, delta: LevelUpDelta) => void;
  #onclose: () => void;

  classChoice = $state('');
  baseClasses = $state<ClassProgression[]>([]);
  newClassKey = $state('');
  newClassName = $state('');
  targetLevel = $state(1);

  hpRolls = $state<Record<string, number[]>>({});

  /** Das Delta der aktuellen Klassen- und Stufenwahl, bevor „Weiter" den Lauf startet. */
  classPreview = $state<LevelUpDelta | null>(null);

  spellCreator = $state<SpellCreatorState | null>(null);
  creatingSpell = $state(false);

  featQuery = $state('');
  featCategory = $state<FeatCategory | ''>('');
  /** Das Talent der Detailkarte — zuletzt angeklickt, gewählt oder nicht. */
  focusedFeat = $state<FeatEntry | null>(null);

  constructor(run: LevelUpRun, getCharacter: () => Character, onApply: (changeSet: LevelUpChangeSet, delta: LevelUpDelta) => void, onclose: () => void) {
    this.#run = run;
    this.#getCharacter = getCharacter;
    this.#onApply = onApply;
    this.#onclose = onclose;
    this.classChoice = (getCharacter().classes ?? []).length ? '0' : 'new';

    $effect(() => { loadBaseClasses().then((cs) => { this.baseClasses = cs; }); });
    $effect(() => {
      const newClass = this.isNewClass && this.newClassKey ? { sourceKey: this.newClassKey, name: this.newClassName } : undefined;
      if ((this.isNewClass && !newClass) || (!this.isNewClass && !this.hasClasses)) {
        this.classPreview = null;
        return;
      }
      let cancelled = false;
      computeLevelUpDelta(this.#getCharacter(), this.classIndex, this.targetLevel, newClass).then(
        (d) => { if (!cancelled) this.classPreview = d.atLevelCap || d.isHomebrew ? null : d; },
        () => { if (!cancelled) this.classPreview = null; },
      );
      return () => { cancelled = true; };
    });
    $effect(() => {
      if (this.targetLevel <= this.effectiveFrom || this.targetLevel > 20) this.targetLevel = Math.min(20, this.effectiveFrom + 1);
    });
  }

  get character() { return this.#getCharacter(); }
  get st() { return this.#run.st; }
  get choices() { return this.#run.choices; }
  get run() { return this.#run; }

  classList = $derived.by(() => this.#getCharacter().classes ?? []);
  hasClasses = $derived(this.classList.length > 0);
  isNewClass = $derived(this.classChoice === 'new');
  classIndex = $derived(this.isNewClass ? this.classList.length : Number(this.classChoice));
  /** Bibliotheks-Key der Klasse, die aufsteigt — Detailspalte und Bild hängen daran. */
  selectedClassKey = $derived(this.isNewClass ? this.newClassKey : (this.classList[this.classIndex]?.sourceKey ?? ''));
  effectiveFrom = $derived(this.isNewClass ? 0 : (this.classList[this.classIndex]?.level ?? 1));

  allAnswered = $derived.by(() => this.#run.choices.isAnswered(this.st.decisions));

  selectNewClass(key: string) {
    this.newClassKey = key;
    const found = this.baseClasses.find((c) => c.key === key);
    this.newClassName = found ? found.nameDe || found.name : '';
  }

  startFlow() {
    const st = this.st;
    if (st.run.kind === 'running') return;
    if (this.isNewClass && !this.newClassKey) {
      st.run = { kind: 'error', at: 'choose-class', message: 'Bitte eine Klasse für das Multiclassing wählen.' };
      return;
    }
    if (!this.isNewClass && !this.hasClasses) return;
    this.#run.start(this.classIndex, this.targetLevel, this.isNewClass && this.newClassKey ? { sourceKey: this.newClassKey, name: this.newClassName } : undefined);
  }

  setIn(id: string, v: string): void {
    this.st.answers[id] = v;
  }

  toggleIn(id: string, v: string, max?: number): void {
    const cur = (this.st.answers[id] as string[]) ?? [];
    let nextArr = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    if (max && nextArr.length > max) nextArr = nextArr.slice(nextArr.length - max);
    this.st.answers[id] = nextArr;
  }

  setList(id: string, values: string[]): void {
    this.st.answers[id] = values;
  }

  /**
   * Der Bogenwert plus allem, was dieser Aufstieg VOR der Tabellen-Verbesserung schon erhöht —
   * sonst zeigte das Vorher/Nachher eine Erhöhung des Merkmals ein zweites Mal als offen an.
   */
  abilityBefore(ability: AbilityKey): number {
    const base = this.#getCharacter().abilities[ability] ?? 10;
    return this.#run.doc.changes.reduce(
      (score, c) => (c.target === 'ability' && c.ability === ability && c.source !== 'asi' ? cappedScore(score, c.value, c.max) : score),
      base,
    );
  }

  answerList(id: string): string[] {
    const v = this.st.answers[id];
    return Array.isArray(v) ? v : v ? [v] : [];
  }

  setAnswerList(q: LevelUpQuestion, next: string[]): void {
    this.st.answers[q.id] = q.type === 'multiselect' ? next : (next[0] ?? '');
  }

  pickBinding(id: string) {
    return [() => (this.st.answers[id] as string[]) ?? [], (v: string[]) => (this.st.answers[id] = v)] as const;
  }

  rollHp(q: LevelUpQuestion): void {
    const sides = q.dieSides ?? 6;
    const count = Math.max(1, q.rollCount ?? 1);
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
    this.hpRolls[q.id] = rolls;
    this.st.answers[q.id] = String(rolls.reduce((a, b) => a + b, 0));
  }

  openSpellCreator(name: string, levels: number[], targetQ: string | null): void {
    const lv = levels.length ? levels : [1];
    const trimmed = name.trim();
    // Der auslösende Name stammt aus dem englischen Regeltext — als `name_en` vormerken,
    // damit künftige EN↔DE-Treffer greifen.
    this.spellCreator = { targetQ, name: trimmed, nameEn: trimmed, level: lv[0], school: 'evocation', levels: lv };
  }

  async saveInlineSpell(): Promise<void> {
    if (!this.spellCreator || this.creatingSpell) return;
    this.creatingSpell = true;
    const st = this.st;
    const s = this.spellCreator;
    try {
      const canonical = await createSpellInline(blankSpell(s.name, s.level, s.school, s.nameEn));
      st.spellLib = await getSpellLibrary();
      if (s.targetQ) {
        const key = st.spellLib.find((sp) => sp.name === canonical)?.key;
        if (key) {
          const [read, write] = this.pickBinding(s.targetQ);
          if (!read().includes(key)) write([...read(), key]);
        }
      } else {
        if (s.level === 0) {
          if (!st.validatedBase.grantedCantrips.includes(canonical)) st.validatedBase.grantedCantrips = [...st.validatedBase.grantedCantrips, canonical];
        } else if (!st.validatedBase.grantedPrepared.some((p) => p.name === canonical)) {
          st.validatedBase.grantedPrepared = [...st.validatedBase.grantedPrepared, { level: s.level, name: canonical }];
        }
        st.flagged = st.flagged.filter((f) => f.toLowerCase() !== s.name.toLowerCase() && f.toLowerCase() !== s.nameEn.toLowerCase());
      }
      this.spellCreator = null;
    } catch (e) {
      st.run = {
        kind: 'error', at: stepOf(st.run),
        message: `Zauber konnte nicht angelegt werden: ${e instanceof Error ? e.message : String(e)}`,
      };
    } finally {
      this.creatingSpell = false;
    }
  }

  /** Neue Kampfstile sind Pflicht, soweit die Bibliothek sie hergibt; ein Tausch braucht beide Seiten. */
  get stylesDone(): boolean {
    const offer = this.st.styleOffer;
    if (!offer) return true;
    const need = Math.min(offer.allowance, pickableFeats(offer.options, this.st.ownedFeats).length);
    return this.st.chosenStyles.length === need && this.st.styleSwaps.every((s) => !s.from === !s.to);
  }

  /** Talentwahlen ohne Kategorie — die beschränkten (`featSlots`) wählt je ihr eigener Picker. */
  get openFeats(): number {
    return this.st.featsToPick - slotTotal(this.st.featSlots);
  }

  slotOffer(slot: CategorySlot): { allowance: number; options: FightingStyleOption[] } {
    return { allowance: slot.count, options: featCategoryOptions(this.st.featLib, slot.category) };
  }

  slotChosen(category: FeatCategory): string[] {
    return this.st.chosenFeats.filter((f) => f.slot === category).map((f) => f.key);
  }

  /** Eine beschränkte Wahl ist Pflicht, soweit die Bibliothek Talente der Kategorie führt. */
  get featsDone(): boolean {
    const chosen = this.st.chosenFeats;
    return chosen.filter((f) => !f.slot).length === this.openFeats
      && this.st.featSlots.every((s) =>
        chosen.filter((f) => f.slot === s.category).length === Math.min(s.count, pickableFeats(this.slotOffer(s).options, this.st.ownedFeats).length));
  }

  /** `owned` (✓ vorhanden) oder `blocked` (vorhanden, nicht wiederholbar) — für die freie Suche. */
  featMark(entry: FeatEntry): { owned: boolean; blocked: boolean } {
    const owned = !!entry.sourceKey && this.st.ownedFeats.includes(entry.sourceKey);
    return { owned, blocked: owned && !entry.repeatable };
  }

  featCategories = $derived(
    (Object.keys(FEAT_CATEGORY_DE) as FeatCategory[]).filter((c) => this.st.featLib.some((f) => f.category === c)),
  );

  featList = $derived.by<FeatEntry[]>(() => {
    const pool = this.featCategory ? this.st.featLib.filter((f) => f.category === this.featCategory) : this.st.featLib;
    const q = this.featQuery.trim();
    return q ? searchFeats(pool, q, pool.length) : [...pool].sort((a, b) => featDisplayName(a).localeCompare(featDisplayName(b), 'de'));
  });

  isOpenFeatChosen(entry: FeatEntry): boolean {
    const name = entry.name || featDisplayName(entry);
    return this.st.chosenFeats.some((f) => !f.slot && f.name === name);
  }

  pickOpenFeat(entry: FeatEntry): void {
    this.focusedFeat = entry;
    // Bei genau einer Wahl tauscht der Klick die bisherige aus, statt am Maximum zu blockieren.
    if (this.openFeats === 1 && !this.isOpenFeatChosen(entry) && !this.featMark(entry).blocked)
      this.st.chosenFeats = this.st.chosenFeats.filter((f) => f.slot);
    this.#toggleChosen(entry, undefined, this.openFeats);
  }

  toggleSlotFeat(slot: CategorySlot, sourceKey: string): void {
    const entry = this.st.featLib.find((f) => f.sourceKey === sourceKey);
    if (entry) this.#toggleChosen(entry, slot.category, slot.count);
  }

  /** `true`, wenn das Talent neu dazukam. */
  #toggleChosen(entry: FeatEntry, slot: FeatCategory | undefined, limit: number): boolean {
    const st = this.st;
    const key = entry.sourceKey ?? '';
    const nameDe = featDisplayName(entry);
    const name = entry.name || nameDe;
    const idx = st.chosenFeats.findIndex((f) => f.name === name && f.slot === slot);
    if (idx >= 0) { st.chosenFeats = st.chosenFeats.filter((_, i) => i !== idx); return false; }
    if (st.chosenFeats.filter((f) => f.slot === slot).length >= limit) return false;
    if (!entry.repeatable && (this.featMark(entry).blocked || st.chosenFeats.some((f) => f.name === name))) return false;
    // `grantsChoice`/`grants` reisen mit — nur damit lesen `feat-links` Zauber-Zugang und
    // pro-Stufe-Effekte aus der Bibliothek.
    st.chosenFeats = [...st.chosenFeats, { key, name, nameDe, gainedAt: st.delta!.toLevel, desc: entry.desc || featDesc(entry), descDe: entry.descDe, grantsChoice: entry.grantsChoice, grants: entry.grants, grantsSpells: entry.grantsSpells, grantsCasting: entry.grantsCasting, slot }];
    return true;
  }


  apply(): void {
    const st = this.st;
    if (st.delta) this.#onApply($state.snapshot(this.#run.doc) as LevelUpChangeSet, st.delta);
    st.run = { kind: 'paused', at: 'done' };
    this.#onclose();
  }

  #atClassChoice = $derived(stepOf(this.st.run) === 'choose-class');

  /** An der Klassenwahl zeigt die Seitenleiste den Entwurf, danach das Dokument des Laufs. */
  shownDelta = $derived(this.#atClassChoice ? this.classPreview : this.st.delta);

  shownChanges = $derived.by<Change[]>(() => {
    if (!this.#atClassChoice) return this.#run.doc.changes;
    const d = this.classPreview;
    if (!d) return [];
    const c = this.#getCharacter();
    return [
      ...baseDeltaChanges(d, c.hitDice ?? ''),
      // Ohne Antworten: Trefferpunkte nach Durchschnitt, bis die Entscheidung fällt.
      ...decisionChanges({ delta: d, answers: {}, conMod: mod(c.abilities.con), pickedCantrips: [], pickedLearned: [] }),
    ];
  });

  /**
   * Die neuen Merkmale dieses Aufstiegs, deutsch. `subclassFeaturesGained` (Subklasse schon
   * gewählt) und `subFeatures` (in diesem Aufstieg gewählt) schließen sich aus — der Schlüssel
   * fängt nur Dubletten im Vault.
   */
  newFeatures = $derived.by<NewFeature[]>(() => {
    const d = this.shownDelta;
    if (!d) return [];
    const seen = new Set<string>();
    const out: NewFeature[] = [];
    const add = (f: { key?: string; name: string; nameDe?: string; desc?: string; descDe?: string }, subclass: boolean) => {
      const id = f.key || f.name;
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ id, key: f.key ?? '', name: f.nameDe || f.name, text: f.descDe || f.desc || '', subclass });
    };
    d.featuresGained.forEach((f) => add(f, false));
    d.subclassFeaturesGained.forEach((f) => add(f, true));
    if (!this.#atClassChoice) this.st.subFeatures.forEach((f) => add(f, true));
    return out;
  });

  changeLine(c: Change): string {
    switch (c.target) {
      case 'hpMax':
      case 'spellSlot':
        return `${c.label}: +${c.value}`;
      case 'hitDice':
        return `${c.label}: ${c.value}`;
      default:
        return c.label; // Label trägt Wert/Detail bereits (z.B. „Stärke +1", „Talent: X")
    }
  }

  // `shownChanges` steht bereits in kanonischer Schritt-Reihenfolge — kein Sortieren nötig.
  progressionGroups = $derived.by<{ heading: string; changes: Change[] }[]>(() => {
    const groups: { heading: string; changes: Change[] }[] = [];
    const idx = new Map<string, number>();
    for (const c of this.shownChanges) {
      let i = idx.get(c.step);
      if (i === undefined) {
        i = groups.length;
        idx.set(c.step, i);
        groups.push({ heading: STEP_META[c.step as StepId]?.label ?? c.step, changes: [] });
      }
      groups[i].changes.push(c);
    }
    return groups;
  });

}

export function createLevelUpAssistantUi(
  run: LevelUpRun,
  getCharacter: () => Character,
  onApply: (changeSet: LevelUpChangeSet, delta: LevelUpDelta) => void,
  onclose: () => void,
): LevelUpAssistantUi {
  return new LevelUpAssistantUi(run, getCharacter, onApply, onclose);
}
