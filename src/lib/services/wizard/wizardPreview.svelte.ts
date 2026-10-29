/** Der entstehende Charakter für die Vorschau — dieselbe Assembly wie „Charakter erstellen". */
import type { CharacterWizard } from './characterWizard.svelte';
import { buildWizardCharacter } from './assembleCharacter';
import { withShownCombatValues } from '../combatFallbacks';
import type { Character } from '../../schemas/characterSchema';

export function createWizardPreview(w: CharacterWizard) {
  let character = $state<Character | null>(null);

  // Die Signatur liest jedes Feld, das die Assembly liest — so läuft der Neubau bei jeder
  // Wahl, aber gebündelt statt je Tastendruck.
  $effect(() => {
    const sig = JSON.stringify($state.snapshot({
      k: w.klass, s: w.species, b: w.background, sc: w.scores, asi: w.asi, l: w.languages,
      cs: w.chosenSkills, gs: w.grantedSkills, m: w.masteries, fs: w.fightingStyles, tf: w.traitFeats,
      op: w.optionPicks, sp: w.spellcasting, da: w.declaredAnswers, d: w.declared.length,
    }));
    if (!w.species.sourceKey) { character = null; return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      void buildWizardCharacter(w).then(withShownCombatValues).then(
        (c) => { if (!cancelled) character = c; },
        () => { if (!cancelled) character = null; },
      );
    }, 250);
    void sig;
    return () => { cancelled = true; clearTimeout(timer); };
  });

  return {
    get character() { return character; },
    get pending() {
      return [!w.background.sourceKey && 'Hintergrund', !w.klass.sourceKey && 'Klasse'].filter(Boolean).join(' und ');
    },
  };
}
