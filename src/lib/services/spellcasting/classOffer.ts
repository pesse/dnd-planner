/**
 * Das Zauberwirken der GEWÄHLTEN Klasse als Angebot für den Wizard-Schritt „Zauber" — die
 * offenen (nicht fest gewährten) Quotas ihrer Klassen-/Subklassen-Quellen. Fest gewährte
 * Quotas (Domänenzauber etc.) brauchen keinen Picker: sie entstehen beim Laden von selbst.
 */
import { getSpellLibrary, resolveSpell } from '$lib/spellLibrary';
import type { AbilityName } from '$lib/schemas/abilities';
import type { ClassProgression } from '$lib/schemas/classProgression';
import { classQuotaRoles, NO_SCALE, quotaContext, quotaViews, type QuotaView } from './quota';
import { resolveCasting } from './resolve';
import { slotLookup } from '../resources/project';
import { resolveResources } from '../resources/resolve';

/**
 * Das Zauberattribut der Klasse steht in ihrer Deklaration (`grantsCasting.ability.fixed`) —
 * eine Klasse→Attribut-Tabelle im Code wäre die zweite Quelle und blind für Homebrew. Ohne
 * Stufengrenze: das Attribut gehört der Klasse, auch wenn Paladin und Waldläufer erst auf
 * Stufe 2 zu wirken beginnen.
 */
export function classCastingAbility(prog: ClassProgression | null): AbilityName | '' {
  return prog?.features.find((f) => f.grantsCasting?.ability?.fixed)?.grantsCasting?.ability?.fixed ?? '';
}

export interface ClassCastingOffer {
  isCaster: boolean;
  klasseName: string;
  /** Englischer Bibliotheks-Key für den Zauberfilter; leer, wenn unauflösbar. */
  spellClass: string;
  cantrips: QuotaView | null;
  spells: QuotaView | null;
  prepared: QuotaView | null;
}

/** Auch für den Aufstieg: die Spanne VOR einer neuen Klasse (`fromLevel` 0) hat kein Angebot. */
export const emptyClassCastingOffer = (klasseName: string): ClassCastingOffer => ({
  isCaster: false, klasseName, spellClass: '', cantrips: null, spells: null, prepared: null,
});

export async function classCastingOffer(input: {
  classKey: string;
  klasseName: string;
  subclassKey?: string;
  subclassName?: string;
  level: number;
}): Promise<ClassCastingOffer> {
  if (!input.classKey) return emptyClassCastingOffer(input.klasseName);

  const classes = [{
    sourceKey: input.classKey,
    name: input.klasseName,
    level: input.level,
    ...(input.subclassKey ? { subclassKey: input.subclassKey, subclassName: input.subclassName } : {}),
  }];
  const [spellLib, resolution, resources] = await Promise.all([
    getSpellLibrary(),
    resolveCasting({ classes }),
    resolveResources({ classes }),
  ]);

  const prog = resolution.classes.find((c) => c.prog.key === input.classKey)?.prog ?? null;
  const slotsOf = slotLookup(resources.pools);
  const spellKey = (name: string): string | undefined => resolveSpell(spellLib, name, input.klasseName)?.key;

  const views = resolution.sources
    .filter((s) => s.origin === 'class' || s.origin === 'subclass')
    .flatMap((source) => {
      const ctx = quotaContext(prog, source.level, slotsOf, spellKey, NO_SCALE);
      return quotaViews(source, ctx).filter((v) => !v.fixed);
    });

  const { cantrips, spells, prepared } = classQuotaRoles(views);
  return {
    isCaster: !!(cantrips || spells),
    klasseName: input.klasseName,
    spellClass: spells?.pool.lists[0] ?? cantrips?.pool.lists[0] ?? '',
    cantrips,
    spells,
    prepared,
  };
}
