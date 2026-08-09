/**
 * Zauberwirken nach Quellen gruppiert: je Quelle ihre Kontingente mit der Auswahl, die
 * abgeleiteten Plätze, der quellenlose Bestand. Editor UND Charakter-Karte lesen diese eine
 * Form — nur der Editor schreibt, dafür trägt jedes Kontingent seine Ids.
 */
import type { AbilityName } from '$lib/schemas/abilities';
import { ABILITY_LABEL_BY_NAME } from '$lib/schemas/abilities';
import type { CastOption, SwapCadence } from '$lib/schemas/casting';
import type { SpellSchool } from '$lib/schemas/vocabulary';
import { sourceLabel, type ProjectionLookup } from './project';
import type { CastingIssue, CastingIssueKind } from './source';
import { poolQuotas, type QuotaState, type SpellcastingState } from './state';

export interface GroupedSpell {
  key: string;
  label: string;
  level: number;
}

export interface SpellQuotaGroup {
  sourceId: string;
  quotaId: string;
  label: string;
  /** Die deklarierten Wirkwege — `castNote` ist ihre ausformulierte Fassung. */
  cast: CastOption[];
  /** Wie diese Zauber gewirkt werden (`cast`). */
  castNote: string;
  /** Der Tauschtakt (`swap`); leer, wenn die Deklaration keinen nennt. */
  swapNote: string;
  /** Wählbare Grade; leer = ohne Gradschranke. */
  levels: number[];
  /** Zauberlisten als englische Klassen-Keys; leer = ganze Bibliothek oder `from`. */
  lists: string[];
  /** Zauberschulen, auf die der Pool eingegrenzt ist; leer = alle. */
  schools: SpellSchool[];
  /** `pool.from` aufgelöst; null = der Pool ist keine andere Quota. */
  from: QuotaPoolFrom | null;
  /** `into` aufgelöst; null = die Auswahl gehört nirgendwo sonst hin. */
  into: QuotaPoolInto | null;
  count: number;
  /** true = gewährt, nichts zu wählen. */
  fixed: boolean;
  spells: GroupedSpell[];
  open: number;
}

/**
 * `pool.from` mit dem, was daran hängt: die Kontingente, die den Pool stellen (das Zauberbuch
 * und was per `into` hineinlegt), samt ihrer Auswahl — genau diese Zauber sind wählbar, nicht
 * die Klassenliste.
 */
export interface QuotaPoolFrom {
  /** Das genannte Kontingent zuerst, danach seine Beiträge. */
  quotas: { sourceId: string; quotaId: string }[];
  /** Beschriftung des genannten Kontingents. */
  label: string;
  spells: GroupedSpell[];
}

/** Wohin eine Auswahl zusätzlich gehört (`into`) — für die Anzeige am Kontingent. */
export interface QuotaPoolInto {
  sourceId: string;
  quotaId: string;
  label: string;
}

export interface SpellSourceGroup {
  id: string;
  label: string;
  /** Das verantwortliche Merkmal; leer, wenn `label` es schon nennt (Trait, Talent, Subklasse). */
  featureDe: string;
  abilityDe: string;
  abilityOptions: AbilityName[];
  saveDC: number | null;
  attackBonus: number | null;
  quotas: SpellQuotaGroup[];
}

export interface GroupedSlot {
  level: number;
  total: number;
  used: number;
}

export interface GroupedIssue {
  kind: CastingIssueKind;
  text: string;
}

export interface GroupedSpellcasting {
  sources: SpellSourceGroup[];
  slots: GroupedSlot[];
  pact: GroupedSlot | null;
  /** true = keine Progression im Vault, die Plätze stehen von Hand. */
  manualSlots: boolean;
  extra: GroupedSpell[];
  /** Warum eine erwartete Quelle fehlt oder unvollständig ist — sonst schweigt der Fehlschlag. */
  issues: GroupedIssue[];
}

/**
 * Jede Meldung nennt die HANDLUNG, nicht nur den Zustand: sie ist das Einzige, was der Nutzer
 * von einem Deklarationsfehler zu sehen bekommt. Total getippt, damit eine neue Issue-Art hier
 * einen Compile-Fehler auslöst statt still zu verschwinden.
 */
const ISSUE_TEXT: Record<CastingIssueKind, (issue: CastingIssue, className: (key: string) => string) => string> = {
  unlinkedClass: (i) =>
    `${i.detail || 'Eine Klasse'} ist nicht mit der Bibliothek verknüpft — ohne Link kennt die App ihr Zauberwirken nicht.`,
  unknownClassKey: (i) => `„${i.detail}" fehlt in der Bibliothek — Bibliothek aktualisieren.`,
  undeclaredCasting: (i, className) =>
    `${className(i.featureKey) || i.featureKey} ist als Zauberwirker geführt, aber die installierte ` +
    'Bibliotheks-Fassung deklariert kein Zauberwirken — Bibliothek aktualisieren.',
  unresolvedPatch: (i) =>
    `Die Bibliothek ändert ein Kontingent, das es nicht gibt (${i.detail}) — die Änderung bleibt aus.`,
  unresolvedPool: (i) =>
    `Ein Kontingent speist sich aus einem Pool, den es nicht gibt (${i.detail}) — es bietet die ganze Liste an.`,
  unresolvedPoolTarget: (i) =>
    `Ein Kontingent legt seine Zauber in ein Kontingent, das es nicht gibt (${i.detail}) — sie bleiben für sich.`,
  unresolvedAbilityRef: (i) =>
    `Das Zauberattribut soll dem Merkmal „${i.detail}" folgen, das dieser Charakter nicht hat.`,
  unreadableSpellTable: (i) =>
    `Die Zauber-Tabelle im Merkmalstext ist nicht lesbar (${i.detail}) — die gewährten Zauber fehlen.`,
  unknownBranchKey: (i) =>
    `Die Bibliothek stellt eine Bedingung, die diese App nicht kennt (${i.detail}) — das Kontingent bleibt aus.`,
  unknownSpell: (i) => `„${i.detail}" ist in der Zauber-Bibliothek nicht zu finden.`,
};

export const groupedIssue = (issue: CastingIssue, lookup: ProjectionLookup): GroupedIssue => ({
  kind: issue.kind,
  text: ISSUE_TEXT[issue.kind](issue, lookup.className),
});

/**
 * Die Quota-Id ist ein technischer Schlüssel; angezeigt wird, was sie mechanisch ist.
 * Bei fester Gewährung nennt die Zeile nur die Herkunft, die Zauber stehen daneben.
 */
export function quotaLabel(quota: QuotaState): string {
  const view = quota.view;
  const cantripsOnly = view.levels.length > 0 && view.levels.every((l) => l === 0);
  if (cantripsOnly) return 'Zaubertricks';
  if (view.fixed) return 'Gewährt';
  if (view.tier === 'known') return 'Zauberbuch';
  const range = view.levels.filter((l) => l > 0);
  if (!range.length) return 'Vorbereitet';
  return `Vorbereitet (Grad ${range[0]}–${range[range.length - 1]})`;
}

/**
 * Wie gewirkt wird. Mehrere Möglichkeiten sind der Normalfall („1× gratis ODER über einen
 * Platz"), leeres `cast` heißt: das Kontingent ist Bestand, aus sich heraus nicht wirkbar.
 */
export function castNote(quota: QuotaState, intoLabel = ''): string {
  // Die aufgelöste Zahl gehört zur ERSTEN `uses`-Option (`state.ts`) — bei mehreren nennt die
  // Zeile keine, statt die falsche zu behaupten.
  const single = quota.view.cast.filter((c) => c.kind === 'uses').length === 1;
  const parts = quota.view.cast.map((option) => {
    switch (option.kind) {
      case 'slots':
        return option.pool === 'pact' ? 'über Pakt-Plätze' : 'über Zauberplätze';
      case 'uses': {
        const per = option.per === 'short-rest' ? 'Kurze Rast' : 'Lange Rast';
        const n = single ? quota.uses?.max : undefined;
        return `${n ? `${n}× ` : ''}ohne Zauberplatz pro ${per}`;
      }
      case 'at-will':
        return 'beliebig oft';
      case 'ritual':
        return option.requiresPrepared ? 'als Ritual' : 'als Ritual, auch unvorbereitet';
    }
  });
  if (parts.length) return parts.join(' oder ');
  return intoLabel ? `Bestand im Kontingent „${intoLabel}"` : 'Bestand, nicht wirkbar';
}

const CADENCE_DE: Record<SwapCadence, string> = {
  none: 'nicht austauschbar',
  'level-up-one': '1 austauschen je Stufenaufstieg',
  'long-rest-one': '1 austauschen pro Lange Rast',
  'long-rest-all': 'nach jeder Langen Rast frei neu wählen',
};

/** Der Tauschtakt; beide Grade werden nur benannt, wenn die Quota beide führt. */
export function swapNote(quota: QuotaState): string {
  const { levels, swap } = quota.view;
  const anyLevel = levels.length === 0;
  const parts: string[] = [];
  if ((anyLevel || levels.some((l) => l > 0)) && swap.spells) parts.push(CADENCE_DE[swap.spells]);
  if ((anyLevel || levels.includes(0)) && swap.cantrips) parts.push(CADENCE_DE[swap.cantrips]);
  if (parts.length < 2) return parts[0] ?? '';
  return `Zauber: ${parts[0]} · Zaubertricks: ${parts[1]}`;
}

const spellOf = (key: string, lookup: ProjectionLookup): GroupedSpell => {
  const info = lookup.spell(key);
  return { key, label: info?.name ?? key, level: info?.level ?? 0 };
};

export function groupedSpellcasting(state: SpellcastingState, lookup: ProjectionLookup): GroupedSpellcasting {
  // Vorab über ALLE Quellen, weil `pool.from` auch auf eine später kommende zeigen darf.
  const byId = new Map<string, QuotaState>();
  for (const source of state.sources)
    for (const quota of source.quotas) byId.set(`${quota.view.sourceId}::${quota.view.quotaId}`, quota);

  const labelOf = (ref: { sourceId: string; quotaId: string }): string => {
    const src = byId.get(`${ref.sourceId}::${ref.quotaId}`);
    return src ? quotaLabel(src) : ref.quotaId;
  };

  const poolFromOf = (quota: QuotaState): QuotaPoolFrom | null => {
    const from = quota.view.pool.from;
    if (!from) return null;
    const parts = poolQuotas(state, from);
    const keys = [...new Set(parts.flatMap((q) => q.spells))];
    return {
      quotas: parts.map((q) => ({ sourceId: q.view.sourceId, quotaId: q.view.quotaId })),
      label: labelOf(from),
      spells: keys.map((key) => spellOf(key, lookup)),
    };
  };

  const poolIntoOf = (quota: QuotaState): QuotaPoolInto | null => {
    const into = quota.view.into;
    return into ? { ...into, label: labelOf(into) } : null;
  };

  // `resolveCasting` filtert über die DEKLARIERTEN Quotas, der Zweigfilter greift erst in
  // `activeQuotas` — ohne diesen Filter steht „Kleriker · Göttliche Ordnung" samt SG und
  // Angriffsbonus als Überschrift ohne Inhalt da, solange Thaumaturg nicht gewählt ist.
  const sources: SpellSourceGroup[] = state.sources.filter((s) => s.quotas.length > 0).map((source) => {
    const label = sourceLabel(source.source, lookup);
    return {
      id: source.source.id,
      label,
      featureDe: source.source.labelDe === label ? '' : source.source.labelDe,
      abilityDe: source.ability ? ABILITY_LABEL_BY_NAME[source.ability] : '',
      abilityOptions: source.ability ? [] : [...source.abilityOptions],
      saveDC: source.saveDC,
      attackBonus: source.attackBonus,
      quotas: source.quotas.map((quota) => {
        const into = poolIntoOf(quota);
        return {
          sourceId: source.source.id,
          quotaId: quota.view.quotaId,
          label: quotaLabel(quota),
          cast: [...quota.view.cast],
          castNote: castNote(quota, into?.label),
          swapNote: swapNote(quota),
          levels: [...quota.view.levels],
          lists: [...quota.view.pool.lists],
          schools: [...quota.view.pool.schools],
          from: poolFromOf(quota),
          into,
          count: quota.view.count,
          fixed: quota.view.fixed,
          spells: quota.spells.map((key) => spellOf(key, lookup)),
          open: quota.open,
        };
      }),
    };
  });

  const slots: GroupedSlot[] = [];
  state.pools.standard.total.forEach((total, i) => {
    if (total > 0) slots.push({ level: i + 1, total, used: state.pools.standard.used[i] ?? 0 });
  });
  let pactLevel = 0;
  state.pools.pact.total.forEach((n, i) => { if (n > 0) pactLevel = i + 1; });

  return {
    sources,
    slots,
    pact: pactLevel
      ? { level: pactLevel, total: state.pools.pact.total[pactLevel - 1] ?? 0, used: state.pools.pact.used }
      : null,
    manualSlots: state.manualSlots,
    extra: state.extra.map((key) => spellOf(key, lookup)),
    issues: state.issues.map((issue) => groupedIssue(issue, lookup)),
  };
}
