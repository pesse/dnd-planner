/**
 * Grounding zwischen Pass A und Pass C: Zaubernamen gegen die Bibliothek auflösen und die
 * Zauber abziehen, die eine Deklaration schon deterministisch gewährt — sonst zählte
 * derselbe Grant zweimal.
 */
import { getSpellLibrary, resolveSpell } from '../../spellLibrary';
import { chosenOption } from '../declaration/optionList';
import type { FeatureEffects } from '../../schemas/levelUp';
import type { GainedFeature } from '../analysis/types';

/**
 * Auflösung gegen die VOLLE Bibliothek, nie klassengefiltert — sonst fallen off-list-
 * Grants von Unterklassen und Domänen weg. Liefert nur Fakten, schließt nichts aus.
 */
export async function buildSpellResolution(spellsToGround: string[], klasseName: string): Promise<string> {
  if (!spellsToGround.length) return '';
  const library = await getSpellLibrary();
  const lines = spellsToGround.map((name) => {
    const info = resolveSpell(library, name, klasseName);
    return info
      ? `${name} → ${info.name_en ?? info.name} (Level ${info.level})`
      : `${name} → NICHT in Bibliothek gefunden`;
  });
  return `<spell_resolution>\n${lines.join('\n')}\n</spell_resolution>`;
}

/**
 * Die Zauber, die eine bereits getroffene Zweigwahl deterministisch gewährt
 * (`options[].spells` der gewählten Option, ALLE Stufenzeilen).
 *
 * Als Code-Regel und nicht nur als Prompt-Regel, aus demselben Grund wie
 * `withDeclaredGrants`: das Modell sieht die Deklaration gar nicht —
 * `buildFeatureEffectsInput` projiziert nur die Prosa, in der die volle Zweig-Tabelle steht.
 * Die Prompt-Regel allein hielt messbar nicht (evals/unredactedChoice: 2/5 bzw. 4/5 am
 * 2026-07-30, während die Ergänzung im Prompt bleibt, weil sie die Quote deutlich hebt).
 *
 * ALLE Zeilen, nicht nur die bis zur aktuellen Stufe: eine Zeile für Stufe 3 ist auf Stufe 1
 * ein Vorgriff, und auf Stufe 3 liefert sie `optionListRider` selbst — in beiden Fällen ist
 * die Nennung durch das Modell überzählig.
 */
export function declaredBranchSpells(features: GainedFeature[]): Set<string> {
  const out = new Set<string>();
  for (const f of features) {
    if (!f.choice) continue;
    for (const row of chosenOption(f, f.choice)?.spells ?? [])
      for (const name of row.names) if (name.trim()) out.add(name.trim().toLowerCase());
  }
  return out;
}

/** Dieselben Zauber aus den Ridern streichen — der Grant kommt aus der Deklaration. */
export function withoutDeclaredSpells(effects: FeatureEffects, declared: Set<string>): FeatureEffects {
  if (!declared.size) return effects;
  return {
    ...effects,
    riders: effects.riders.map((r) => ({
      ...r,
      grantedSpells: r.grantedSpells.filter((s) => !declared.has(s.trim().toLowerCase())),
    })),
  };
}

/**
 * Der letzte Turn vor der Ausgabe. `settled` sind die Merkmale mit bereits getroffener
 * Zweigwahl: sie NAMENTLICH zu nennen wirkt, wo die allgemeine Regel 10 nicht trug (gemessen
 * 4/5 Notizen zählten die Zauber weiter auf, evals/unredactedChoice). Bewusst OHNE die
 * Zaubernamen — eine Verbotsliste im Prompt ist die halbe Einladung, sie abzuschreiben.
 */
export function buildTranscriptionInstruction(spellResolution: string, settled: string[] = []): string {
  const parts = [
    'Now emit the result in exactly the required schema — one rider per feature in ' +
      '<gained_features>, in the same order, with featureName and featureKey copied verbatim. ' +
      'For every choice listed in <resolved_choices>, add one entry to the matching rider\'s ' +
      'decisions[] with its id copied verbatim and question/answer left EMPTY, and let its ' +
      'outcome flow into the concrete grants (grantedSpells / expertiseSkills / ' +
      'abilityScoreIncrease). Anything NOT listed there gets no decision — leave decisions[] ' +
      'empty for those riders.\n' +
      'Set sheetNote only where the character sheet genuinely needs the information (rule 10); ' +
      'leave it empty otherwise. Keep it short and ENGLISH — it gets translated, and space on ' +
      'the sheet is tight.',
  ];
  if (settled.length) {
    parts.push(
      `These features arrive with their choice already settled: ${settled.join(', ')}. ` +
        'The app has read their chosen branch itself and records every spell it grants, at this ' +
        'level and at later ones. So give each of them an EMPTY grantedSpells, and let its ' +
        'sheetNote carry only what the prose adds on top of that branch table — no spell names ' +
        'at all, not even as a reminder of what is prepared. Watch which half of the prose is ' +
        'already in force: a clause the feature ties to a LATER level ("when you reach character ' +
        'levels 3 and 5 … you can cast it once without a spell slot") is not true yet and would ' +
        'promise the player a mechanic they do not have. Where only the branch\'s current line ' +
        'remains, a single short clause IS the whole note.',
    );
  }
  if (spellResolution) {
    parts.push(
      'For grantedSpells use only the canonical English names from <spell_resolution>; ' +
        'reconsider names marked as NOT FOUND instead of forcing them.\n' +
        spellResolution,
    );
  }
  return parts.join('\n\n');
}
