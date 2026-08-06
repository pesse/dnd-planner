/**
 * Die Kontingente des Charakters als Zeilen des Wizard-Schritts — dieselbe Projektion, die
 * der Editor zeigt (`spellcasting/grouped.ts`), nur flach und mit einem Feld je Zeile.
 */
import { CLASS_NAME_DE_BY_SLUG } from '../classProgression';
import type { GroupedSpell, GroupedSpellcasting, SpellQuotaGroup, SpellSourceGroup } from '../spellcasting/grouped';

export interface SpellStepRow {
  /** Kontingent, in das die Zeile schreibt. */
  quota: SpellQuotaGroup;
  /** Die Quelle, deutsch: „Kleriker · Göttliche Ordnung". */
  source: string;
  /** Was das Kontingent mechanisch ist: „Zaubertricks", „Zauberbuch". */
  label: string;
  /** Liste, Wirkart und Tauschtakt für den ⓘ-Titel. */
  hint: string;
  count: number;
  fixed: boolean;
  spells: GroupedSpell[];
  /**
   * Das Kontingent, das sich AUS DIESEM speist (Vorbereitung aus dem Zauberbuch) — im Wizard
   * bewusst keine eigene Zeile, sondern der ●/○-Schalter im selben Dialog.
   */
  prepared: { sourceId: string; quotaId: string; count: number; spells: GroupedSpell[] } | null;
}

const listLabel = (lists: string[]): string => lists.map((l) => CLASS_NAME_DE_BY_SLUG[l] ?? l).join(', ');

const groupKey = (sourceId: string, quotaId: string): string => `${sourceId}::${quotaId}`;

function rowOf(source: SpellSourceGroup, quota: SpellQuotaGroup): SpellStepRow {
  return {
    quota,
    source: source.featureDe ? `${source.label} · ${source.featureDe}` : source.label,
    label: quota.label,
    hint: [quota.lists.length ? `${listLabel(quota.lists)}-Liste` : '', quota.castNote, quota.swapNote]
      .filter(Boolean)
      .join(' · '),
    count: quota.count,
    fixed: quota.fixed,
    spells: quota.spells,
    prepared: null,
  };
}

export function spellStepRows(view: GroupedSpellcasting): SpellStepRow[] {
  const rows: SpellStepRow[] = [];
  const byQuota = new Map<string, SpellStepRow>();
  const fromPool: { source: SpellSourceGroup; quota: SpellQuotaGroup }[] = [];

  for (const source of view.sources) {
    for (const quota of source.quotas) {
      if (quota.from) {
        fromPool.push({ source, quota });
        continue;
      }
      const row = rowOf(source, quota);
      rows.push(row);
      byQuota.set(groupKey(quota.sourceId, quota.quotaId), row);
    }
  }

  for (const { source, quota } of fromPool) {
    const target = quota.from ? byQuota.get(groupKey(quota.from.sourceId, quota.from.quotaId)) : undefined;
    // Ohne Ziel-Zeile bleibt es eine eigene Zeile; `pickLibrary` engt den Dialog trotzdem ein.
    if (!target) {
      rows.push(rowOf(source, quota));
      continue;
    }
    target.prepared = {
      sourceId: quota.sourceId,
      quotaId: quota.quotaId,
      count: quota.count,
      spells: quota.spells,
    };
  }

  return rows;
}

/** Gewährte Kontingente sind nichts zu tun; ein Zauberbuch ist erst mit Vorbereitung fertig. */
export const spellStepDone = (rows: SpellStepRow[]): boolean =>
  rows.every(
    (r) =>
      r.fixed ||
      (r.spells.length >= r.count && (!r.prepared || r.prepared.spells.length >= r.prepared.count)),
  );
