/**
 * Der Charakter-Draft und seine drei Miteigentümer (Formular, Merkmalsleiste, Level-Up).
 * Jede Änderung von außen läuft über `apply`/`applyLevelUp` — nur dort steht der Swap.
 */
import { tick } from 'svelte';
import { createCardEditor, type CardEditor } from '../editor/cardEditor.svelte';
import { parseCharacter } from '../utils/schemaValidation';
import { pendingCharacterUpgrade, type PendingCharacterUpgrade } from '../schemas/characterUpgrades';
import { formatClassLevel } from '../schemas/classLevelText';
import { invalidateVault } from '../stores/campaign';
import { matchWeaponName, type ItemIndex } from '../itemLibrary';
import { matchSpell, type SpellIndex } from '../spellLibrary';
import { applyChanges, type ApplyContext } from './applyChanges';
import { proficiencyBonus } from './classProgression';
import type { Character } from '../schemas/characterSchema';
import type { Change, LevelUpChangeSet } from '../schemas/levelUp';
import type { LevelUpDelta } from './levelUp';

export interface CharacterEditor {
  /** Tabs, Speichern-Leiste und JSON-Tab bleiben Sache des Karten-Editors. */
  readonly card: CardEditor<Character>;
  readonly character: Character | null;
  /** Baseline des Diff-Highlightings. */
  readonly saved: Character | null;
  readonly pendingUpgrade: PendingCharacterUpgrade | null;
  readonly upgradeAccepted: boolean;
  /**
   * Für Vorschauen (`changesWouldAlter`) — sie MÜSSEN denselben Kontext benutzen wie `apply`,
   * sonst simulieren sie einen Freitext-Schreib, den `resolveWeaponName` gar nicht ausführt.
   */
  readonly applyContext: ApplyContext;
  acceptUpgrade(): void;
  discard(): void;
  apply(changes: Change[]): Promise<void>;
  applyLevelUp(changeSet: LevelUpChangeSet, delta: LevelUpDelta): Promise<void>;
}

export function createCharacterEditor(deps: {
  /** Getter, weil die Bibliotheken asynchron nachladen. */
  itemIndex: () => ItemIndex;
  spellIndex: () => SpellIndex;
}): CharacterEditor {
  const card = createCardEditor<Character>({
    type: 'character',
    label: 'Charakter',
    parse: (content) => {
      const r = parseCharacter(JSON.parse(content));
      return r.ok ? r.data : null;
    },
    // Das angenommene Schema-Upgrade ist die einzige Änderung, die den Draft NICHT anfasst
    // (`parse` hat sie beim Laden längst angewandt) — ohne diesen Hook bliebe der Editor
    // sauber und die Speichern-Leiste unerreichbar. Rückgabetyp annotiert, weil
    // `pendingUpgrade` seinerseits `card.lastSavedContent` liest (Inferenzkreis).
    extraDirty: (): boolean => upgradeAccepted && !!pendingUpgrade,
    onSaved: () => invalidateVault(),
  });

  // `save()` ersetzt `card.draft` nicht, setzt aber `lastSavedContent` neu — dieser Derived
  // rechnet nach, die Tönungen des Diff-Highlightings verschwinden.
  const saved = $derived.by<Character | null>(() => {
    if (!card.lastSavedContent) return null;
    try {
      const r = parseCharacter(JSON.parse(card.lastSavedContent));
      return r.ok ? r.data : null;
    } catch {
      return null;
    }
  });

  // Gegen den ROHEN Dateiinhalt geprüft, nicht gegen den Draft: `parseCharacter`
  // zieht beim Laden ohnehin die Pipeline durch, veraltet ist nur die Datei.
  const pendingUpgrade = $derived.by(() => {
    if (!card.lastSavedContent) return null;
    try {
      return pendingCharacterUpgrade(JSON.parse(card.lastSavedContent));
    } catch {
      return null; // ungültiges JSON — dafür meldet sich bereits der Lade-Fehler
    }
  });

  let upgradeAccepted = $state(false);
  // Beim Dateiwechsel zurücksetzen, sonst wirkt der nächste Charakter ungespeichert.
  $effect(() => {
    void card.lastSavedContent;
    upgradeAccepted = false;
  });

  /** Die Auflöser lesen die Bibliotheken bei jedem Aufruf — sie laden asynchron nach. */
  function context(delta?: LevelUpDelta): ApplyContext {
    return {
      classIndex: delta?.classIndex ?? 0,
      isNewClass: delta?.isNewClass,
      resolveSpellKey: (name) => matchSpell(deps.spellIndex(), { name })?.key,
      resolveWeaponName: (name) => matchWeaponName(deps.itemIndex(), name),
    };
  }

  /**
   * Der Referenz-Swap am Ende ist tragend: er löst `{#key card.draft}` (Formular-Remount →
   * Diff-Highlighting) und `card.dirty` aus. Das `await tick()` davor ebenso — der
   * Sync-$effect des Formulars muss seine Runes im Draft haben, sonst verliert der Swap
   * die letzten Eingaben.
   */
  async function mutate(changes: Change[], delta?: LevelUpDelta): Promise<void> {
    if (!card.draft) return;
    await tick();
    const next = structuredClone($state.snapshot(card.draft)) as Character;

    if (delta) applyLevelStructure(next, delta);
    applyChanges(next, changes, context(delta));
    if (delta) next.classLevel = formatClassLevel(next.classes);

    const r = parseCharacter(next);
    card.draft = r.ok ? r.data : next;
  }

  return {
    card,
    get character() { return card.draft; },
    get saved() { return saved; },
    get pendingUpgrade() { return pendingUpgrade; },
    get upgradeAccepted() { return upgradeAccepted; },
    get applyContext() { return context(); },
    acceptUpgrade() { upgradeAccepted = true; },
    discard() {
      upgradeAccepted = false;
      card.discard();
    },
    async apply(changes) {
      if (!changes.length) return;
      await mutate(changes);
    },
    applyLevelUp(changeSet, delta) {
      return mutate(changeSet.changes, delta);
    },
  };
}

/** Nicht additiv, anders als das `changeSet`: Klassenstufe und Multiclass sind Identität. */
function applyLevelStructure(next: Character, delta: LevelUpDelta): void {
  if (delta.isNewClass) {
    next.classes.push({ sourceKey: delta.sourceKey, name: delta.klasseName, level: delta.toLevel });
  } else {
    const cls = next.classes[delta.classIndex];
    if (cls) cls.level = delta.toLevel;
  }
  // Sicherheitsnetz; das `changeSet` setzt den Übungsbonus ebenso.
  next.proficiencyBonus = proficiencyBonus(delta.newTotalLevel);
}
