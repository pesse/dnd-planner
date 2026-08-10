/**
 * Der Umzug der Altform `character.spells` nach `character.spellcasting`: jeder Zauber in ein
 * Kontingent, das ihn tragen kann, der Rest quellenlos. Läuft pro Charakter als Legacy-Fix,
 * weil er die aufgelösten Quellen der Bibliothek braucht.
 */
import type { CharacterSpells } from '$lib/schemas/characterSchema';
import type { CharacterSpellcasting } from '$lib/schemas/spellcasting';
import type { SpellInfo } from '$lib/spellLibrary';
import type { LooseSpell, ProjectionLookup } from './project';
import { poolQuotas, type QuotaState, type SourceState, type SpellcastingState } from './state';
import { SLOT_POOL } from '../resources/slots';
import { addExtra, setPicks, setSlotTotals } from './write';

/**
 * Ohne Attribut: das stand in der Altform nur als deutscher Freitext und als Antwort im
 * Merkmals-Ledger — von dort liest `spellcasting/resolve.ts` es ohnehin. Ein Umzug hätte es
 * bloß ein zweites Mal hingeschrieben.
 */
export interface FlatSpellPlan {
  /** Vollständige Auswahl je Quota — bestehende Picks plus die übernommenen. */
  picks: { sourceId: string; quotaId: string; keys: string[] }[];
  extra: string[];
  /** Nur wo die Progression keine Plätze hergibt. */
  slotTotals: number[];
  /** Namen ohne Bibliothekstreffer; sie bleiben in der Altform stehen. */
  unresolved: LooseSpell[];
  /** Zauber, die der Umzug bewegt. */
  moved: number;
}

const flatRefCount = (spells: CharacterSpells): number =>
  spells.cantrips.length + Object.values(spells.byLevel).reduce((n, refs) => n + refs.length, 0);

/** Was noch Umzugsgut ist. Leer heißt: die Altform darf aus der Datei verschwinden. */
export function hasFlatSpellContent(spells: CharacterSpells | undefined): boolean {
  if (!spells) return false;
  return (
    flatRefCount(spells) > 0 ||
    spells.slots.some((s) => s.total > 0 || s.used > 0) ||
    !!spells.spellcastingClass.trim() ||
    !!spells.spellcastingAbility.trim()
  );
}

/** Die Altform kennt keine Quelle, also entscheidet der Pool, was ein Kontingent aufnimmt. */
function accepts(quota: QuotaState, spell: LooseSpell, info: SpellInfo | undefined, taken: string[]): boolean {
  const { view } = quota;
  if (view.fixed || taken.length >= view.count) return false;
  if (view.levels.length && !view.levels.includes(spell.level)) return false;
  const { pool } = view;
  if (pool.keys.length && !pool.keys.includes(spell.key)) return false;
  if (pool.lists.length && !(info?.classes ?? []).some((c) => pool.lists.includes(c))) return false;
  if (pool.schools.length && !(info && (pool.schools as string[]).includes(info.school))) return false;
  return true;
}

/**
 * Ein Zauberbuch nimmt alles auf, die Vorbereitung nur, was die Altform als vorbereitet führt.
 * Ohne Buch gäbe diese Unterscheidung den unvorbereiteten Zaubern keinen Platz.
 */
function tierMatches(quota: QuotaState, source: SourceState, spell: LooseSpell): boolean {
  if (quota.view.tier === 'known' || spell.level === 0 || spell.prepared) return true;
  return !source.quotas.some((q) => q.view.tier === 'known' && !q.view.fixed);
}

export function planFlatSpellMigration(
  block: CharacterSpellcasting,
  state: SpellcastingState,
  lookup: ProjectionLookup,
  loose: LooseSpell[],
): FlatSpellPlan {
  // Ein gewährtes Kontingent steht nur im `covered`-Satz: als Auswahl geschrieben verdoppelte
  // es die Gewährung.
  const taken: { sourceId: string; quotaId: string; keys: string[] }[] = [];
  const covered = new Set<string>();
  for (const source of state.sources) {
    for (const quota of source.quotas) {
      for (const key of quota.spells) covered.add(key);
      if (!quota.view.fixed)
        taken.push({ sourceId: source.source.id, quotaId: quota.view.quotaId, keys: [...quota.spells] });
    }
  }
  const slotOf = (sourceId: string, quotaId: string): string[] =>
    taken.find((t) => t.sourceId === sourceId && t.quotaId === quotaId)?.keys ?? [];

  const extra: string[] = [];
  const unresolved: LooseSpell[] = [];
  let moved = 0;
  for (const spell of loose) {
    if (!spell.key) {
      unresolved.push(spell);
      continue;
    }
    if (covered.has(spell.key)) continue;
    covered.add(spell.key);
    const info = lookup.spell(spell.key);
    // Innerhalb einer Quelle nehmen Buch UND Vorbereitung denselben Zauber; über Quellen
    // hinweg zählte er sonst zweimal gegen ein Kontingent.
    let placed = false;
    for (const source of state.sources) {
      for (const quota of source.quotas) {
        const slot = slotOf(source.source.id, quota.view.quotaId);
        const from = quota.view.pool.from;
        // Der Pool sind ALLE Kontingente, die ihn stellen — ein Zauberbuch plus was per `into`
        // hineinlegt; sonst fände ein Altbestands-Zauber die Vorbereitung nicht.
        if (from && !poolQuotas(state, from).some((q) => slotOf(q.view.sourceId, q.view.quotaId).includes(spell.key)))
          continue;
        if (!tierMatches(quota, source, spell) || !accepts(quota, spell, info, slot)) continue;
        slot.push(spell.key);
        placed = true;
      }
      if (placed) break;
    }
    if (!placed) extra.push(spell.key);
    moved++;
  }

  const picks = taken.filter(
    (t) => t.keys.length > (block.sources[t.sourceId]?.picks[t.quotaId]?.length ?? 0),
  );

  // Ein Vorrat mit `origin: 'manual'` steht für Plätze, die keine Stufentabelle hergibt: erst
  // die Altform trägt sie, und mit ihr verschwänden sie.
  const hand = state.resources.find((p) => p.shared === SLOT_POOL && p.origin === 'manual');
  return {
    picks,
    extra,
    slotTotals: hand && !block.manual?.slotTotals.length ? hand.max : [],
    unresolved,
    moved,
  };
}

export const planIsEmpty = (plan: FlatSpellPlan): boolean =>
  !plan.moved && !plan.slotTotals.some((n) => n > 0);

export function applyFlatSpellPlan(block: CharacterSpellcasting, plan: FlatSpellPlan): void {
  for (const { sourceId, quotaId, keys } of plan.picks) setPicks(block, sourceId, quotaId, keys);
  for (const key of plan.extra) addExtra(block, key);
  if (plan.slotTotals.length) setSlotTotals(block, plan.slotTotals);
}

/** Nach dem Umzug bleibt in der Altform nur, was die Bibliothek nicht kennt. */
export function reduceFlatSpells(spells: CharacterSpells, plan: FlatSpellPlan): void {
  const byLevel: CharacterSpells['byLevel'] = {};
  for (const spell of plan.unresolved) {
    if (spell.level === 0) continue;
    (byLevel[String(spell.level)] ??= []).push({ name: spell.label, prepared: spell.prepared });
  }
  spells.spellcastingClass = '';
  spells.spellcastingAbility = '';
  spells.saveDC = 0;
  spells.attackBonus = 0;
  spells.slots = spells.slots.map(() => ({ total: 0, used: 0 }));
  spells.cantrips = plan.unresolved.filter((s) => s.level === 0).map((s) => ({ name: s.label }));
  spells.byLevel = byLevel;
}
