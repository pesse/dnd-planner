/**
 * Was der Charakter beim Aufstieg schon beherrscht: der gespeicherte Bestand plus die Zauber,
 * die dieser Lauf gerade an einer ANDEREN Frage wählt.
 */
import { groupedSpellcasting } from '../spellcasting/grouped';
import { loadSpellcasting } from '../spellcasting/project';
import { knownSpellGroups, knownSpells, type KnownSpellGroup, type KnownSpells } from '../spellcasting/known';
import type { Character } from '../../schemas/characterSchema';
import type { LevelUpQuestion } from '../../schemas/levelUp';

export interface LevelUpKnownSpells {
  /** Alles außer den Zaubern, die GENAU diese Frage schreibt. */
  except: (questionId: string) => KnownSpells;
}

export function createLevelUpKnownSpells(src: {
  character: Character;
  questions: () => LevelUpQuestion[];
  answers: () => Record<string, string | string[]>;
}): LevelUpKnownSpells {
  let stored = $state<KnownSpellGroup[]>([]);
  $effect(() => {
    let current = true;
    void loadSpellcasting(src.character).then(({ state, lookup }) => {
      if (current) stored = knownSpellGroups(groupedSpellcasting(state, lookup));
    });
    return () => { current = false; };
  });

  const pending = $derived<KnownSpellGroup[]>(
    src
      .questions()
      .filter((q) => q.type === 'spell-picker')
      .map((q) => {
        const answer = src.answers()[q.id];
        return { id: q.id, label: q.prompt, keys: Array.isArray(answer) ? answer : answer ? [answer] : [] };
      }),
  );

  return { except: (questionId) => knownSpells([...stored, ...pending], [questionId]) };
}
