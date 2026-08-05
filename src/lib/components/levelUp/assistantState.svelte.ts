/**
 * Nicht-persistenter UI-Zustand des Stufenaufstieg-Assistenten: Klassen-/Zielstufen-Wahl,
 * Fragebogen-Antworten, TP-Würfe, Inline-Zauberanlage, Talentsuche und der Abschluss.
 */
import { type StepId, STEP_META } from '$lib/services/levelUp/steps';
import { stepOf } from '$lib/services/levelUp/runState';
import type { LevelUpRun } from '$lib/services/levelUp/run.svelte';
import { type LevelUpDelta } from '$lib/services/levelUp';
import { getClasses, classDisplayName, type ClassInfo } from '$lib/classLibrary';
import { blankSpell, getSpellLibrary, createSpellInline } from '$lib/spellLibrary';
import { type Change, type LevelUpQuestion, type LevelUpChangeSet } from '$lib/schemas/levelUp';
import { searchFeats, featDesc, featDisplayName, type FeatEntry } from '$lib/featsLibrary';
import { type Character } from '$lib/schemas/characterSchema';
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

export class LevelUpAssistantUi {
  #run: LevelUpRun;
  #getCharacter: () => Character;
  #onApply: (changeSet: LevelUpChangeSet, delta: LevelUpDelta) => void;
  #onclose: () => void;

  classChoice = $state('');
  libClasses = $state<ClassInfo[]>([]);
  newClassKey = $state('');
  newClassName = $state('');
  targetLevel = $state(1);

  hpRolls = $state<Record<string, number[]>>({});

  spellCreator = $state<SpellCreatorState | null>(null);
  creatingSpell = $state(false);

  featQuery = $state('');

  jsonCopied = $state(false);

  constructor(run: LevelUpRun, getCharacter: () => Character, onApply: (changeSet: LevelUpChangeSet, delta: LevelUpDelta) => void, onclose: () => void) {
    this.#run = run;
    this.#getCharacter = getCharacter;
    this.#onApply = onApply;
    this.#onclose = onclose;
    this.classChoice = (getCharacter().classes ?? []).length ? '0' : 'new';

    $effect(() => { getClasses().then((cs) => { this.libClasses = cs.filter((c) => c.key && !c.subclassOf); }); });
    $effect(() => {
      if (this.targetLevel <= this.effectiveFrom || this.targetLevel > 20) this.targetLevel = Math.min(20, this.effectiveFrom + 1);
    });
  }

  get st() { return this.#run.st; }
  get choices() { return this.#run.choices; }
  get run() { return this.#run; }

  classList = $derived.by(() => this.#getCharacter().classes ?? []);
  hasClasses = $derived(this.classList.length > 0);
  isNewClass = $derived(this.classChoice === 'new');
  classIndex = $derived(this.isNewClass ? this.classList.length : Number(this.classChoice));
  effectiveFrom = $derived(this.isNewClass ? 0 : (this.classList[this.classIndex]?.level ?? 1));

  allAnswered = $derived.by(() => this.#run.choices.isAnswered(this.st.decisions));

  selectNewClass(key: string) {
    this.newClassKey = key;
    const found = this.libClasses.find((c) => c.key === key);
    this.newClassName = found ? classDisplayName(found) : '';
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
    // Der auslösende Name ist oft der englische KI-Vorschlag — als `name_en` vormerken,
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

  featResults(): FeatEntry[] {
    return this.featQuery.trim() ? searchFeats(this.st.featLib, this.featQuery, 8) : [];
  }

  toggleFeat(entry: FeatEntry): void {
    const st = this.st;
    const key = entry.sourceKey ?? '';
    const nameDe = featDisplayName(entry);
    const name = entry.name || nameDe;
    const idx = st.chosenFeats.findIndex((f) => f.name === name);
    if (idx >= 0) { st.chosenFeats = st.chosenFeats.filter((_, i) => i !== idx); return; }
    if (st.chosenFeats.length >= st.featsToPick) return;
    // `grantsChoice`/`grants` reisen mit — nur damit lesen `feat-links` Zauber-Zugang und
    // pro-Stufe-Effekte deterministisch aus der Bibliothek statt aus der KI.
    st.chosenFeats = [...st.chosenFeats, { key, name, nameDe, gainedAt: st.delta!.toLevel, desc: entry.desc || featDesc(entry), descDe: entry.descDe, grantsChoice: entry.grantsChoice, grants: entry.grants, grantsSpells: entry.grantsSpells, grantsCasting: entry.grantsCasting }];
    this.featQuery = '';
  }

  confirmClassFeatures(): void {
    this.st.run = { kind: 'paused', at: 'review' };
  }

  apply(): void {
    const st = this.st;
    if (st.delta) this.#onApply($state.snapshot(this.#run.doc) as LevelUpChangeSet, st.delta);
    st.run = { kind: 'paused', at: 'done' };
    this.#onclose();
  }

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

  // `doc.changes` steht bereits in kanonischer Schritt-Reihenfolge — kein Sortieren nötig.
  progressionGroups = $derived.by<{ heading: string; lines: string[] }[]>(() => {
    const groups: { heading: string; lines: string[] }[] = [];
    const idx = new Map<string, number>();
    for (const c of this.#run.doc.changes) {
      let i = idx.get(c.step);
      if (i === undefined) {
        i = groups.length;
        idx.set(c.step, i);
        groups.push({ heading: STEP_META[c.step as StepId]?.label ?? c.step, lines: [] });
      }
      groups[i].lines.push(this.changeLine(c));
    }
    return groups;
  });

  reviewLines = $derived.by(() => this.#run.doc.changes.map((c) => this.changeLine(c)));
  docJson = $derived.by(() => JSON.stringify(this.#run.doc, null, 2));

  async copyDoc(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.docJson);
      this.jsonCopied = true;
      setTimeout(() => (this.jsonCopied = false), 1500);
    } catch { /* Clipboard nicht verfügbar → ignorieren */ }
  }
}

export function createLevelUpAssistantUi(
  run: LevelUpRun,
  getCharacter: () => Character,
  onApply: (changeSet: LevelUpChangeSet, delta: LevelUpDelta) => void,
  onclose: () => void,
): LevelUpAssistantUi {
  return new LevelUpAssistantUi(run, getCharacter, onApply, onclose);
}
