/**
 * Das Zauberblatt: oben der Vorrat (Plätze, Klassen-Ressourcen, Metamagie), darunter ein Kasten
 * je Satz Zauberwerte — Quellen mit gleichem Attribut, gleicher SG und gleichem Angriffsbonus
 * stehen zusammen. Die Kästen nehmen die ganze Breite und spalten sich innen, damit die Grade
 * beieinander bleiben.
 */
import { resourceViews } from '$lib/services/resources/project';
import type { GroupedSpell, SpellQuotaGroup, SpellSourceGroup } from '$lib/services/spellcasting/grouped';
import { sign } from '$lib/utils/num';
import type { CharacterPrintData } from '../data';
import { block, checkbox, esc, slotCircles, tickBoxes } from '../html';
import { renderOptionPools } from './extras';

const LEVEL_LABEL = (level: number): string => (level === 0 ? 'Zaubertricks' : `Grad ${level}`);

/** Gradkopf wie auf dem Taendler-Zauberblatt: Ziffer im Wappen, Bezeichnung in der Kapsel. */
const levelHead = (badge: string, name: string, note = ''): string =>
  `<div class="spell-level-head"><span class="lvl-badge">${esc(badge)}</span>` +
  `<span class="lvl-name">${esc(name)}</span>${note}</div>`;

/** Ein Zauber, wie er auf dem Bogen steht: einmal, mit dem Hinweis seines Kontingents. */
interface SheetSpell {
  label: string;
  level: number;
  note: string;
  /** Aus einem `prepared`-Kontingent — das Häkchen ist gesetzt, nicht am Tisch zu setzen. */
  prepared: boolean;
}

/**
 * Der Normalweg bekommt keinen Hinweis: die Zauberplätze stehen als eigener Kasten, die
 * Ritualfähigkeit hängt am Zauber statt am Kontingent, und Zaubertricks gehen ohnehin beliebig
 * oft. Ein Kontingent ganz ohne Wirkweg schweigt nur, wenn ein anderes daraus schöpft (das
 * Zauberbuch) — sonst ist „nicht wirkbar" die Nachricht.
 */
const isOrdinaryCast = (q: SpellQuotaGroup, level: number, feeders: Set<string>): boolean =>
  q.cast.length === 0
    ? feeders.has(`${q.sourceId}::${q.quotaId}`)
    : q.cast.every((o) => o.kind === 'slots' || o.kind === 'ritual' || (o.kind === 'at-will' && level === 0));

/**
 * Quellen mit gleichem Attribut, gleicher SG und gleichem Angriffsbonus. Mechanisch sind sie
 * dasselbe Zauberwirken — nur die Herkunft unterscheidet sie, und die steht im Kopfhinweis.
 */
export interface SheetSpellGroup {
  /** Die erste Quelle der Gruppe; ihre Id trägt die Sektion. */
  id: string;
  label: string;
  hint: string;
  sources: SpellSourceGroup[];
}

export function spellSourceGroups(d: CharacterPrintData): SheetSpellGroup[] {
  const groups: SheetSpellGroup[] = [];
  const byValues = new Map<string, SheetSpellGroup>();
  for (const source of d.grouped.sources) {
    const key = `${source.abilityDe}|${source.saveDC}|${source.attackBonus}`;
    const hit = byValues.get(key);
    if (hit) hit.sources.push(source);
    else {
      const group = { id: source.id, label: source.label, hint: '', sources: [source] };
      byValues.set(key, group);
      groups.push(group);
    }
  }
  return groups.map((g) => ({
    ...g,
    // Der Kastentitel ist schon das Label der ersten Quelle; doppelte Herkunft sagt nichts dazu.
    hint: [...new Set([g.sources[0].featureDe, ...g.sources.slice(1).map((s) => s.label)])]
      .filter((part) => part && part !== g.label).join(' · '),
  }));
}

/** Kontingente, aus denen ein anderes seinen Pool zieht — ihre Auswahl steht schon in dessen Liste. */
function poolFeeders(quotas: SpellQuotaGroup[]): Set<string> {
  const ids = new Set(quotas.map((q) => `${q.sourceId}::${q.quotaId}`));
  return new Set(
    quotas
      .flatMap((q) => q.from?.quotas ?? [])
      .map((ref) => `${ref.sourceId}::${ref.quotaId}`)
      .filter((id) => ids.has(id)),
  );
}

/**
 * Alle Kontingente einer Gruppe in EINE Liste. Derselbe Zauber steht in mehreren (Zauberbuch,
 * vorbereitet, Zaubermeisterschaft) — gedruckt wird er einmal, und zwar mit dem Hinweis, der
 * etwas sagt.
 */
function mergedSpells(quotas: SpellQuotaGroup[]): SheetSpell[] {
  const feeders = poolFeeders(quotas);
  const byKey = new Map<string, SheetSpell>();
  for (const q of quotas) {
    for (const s of q.spells) {
      // Aus welchem Kontingent er stammt, bleibt bewusst weg: am Tisch ändert allein der
      // Wirkweg etwas, und der steht im Kastenkopf oder hier.
      const note = isOrdinaryCast(q, s.level, feeders) ? '' : q.castNote;
      const seen = byKey.get(s.key);
      const prepared = q.tier === 'prepared';
      if (!seen) byKey.set(s.key, { label: s.label, level: s.level, note, prepared });
      else {
        if (!seen.note) seen.note = note;
        seen.prepared ||= prepared;
      }
    }
  }
  return [...byKey.values()];
}

const asSheetSpells = (spells: GroupedSpell[]): SheetSpell[] =>
  spells.map((s) => ({ label: s.label, level: s.level, note: '', prepared: false }));

function byLevel(spells: SheetSpell[]): [number, SheetSpell[]][] {
  const map = new Map<number, SheetSpell[]>();
  for (const s of [...spells].sort((a, b) => a.label.localeCompare(b.label, 'de'))) {
    const bucket = map.get(s.level);
    if (bucket) bucket.push(s);
    else map.set(s.level, [s]);
  }
  return [...map].sort((a, b) => a[0] - b[0]);
}

/** Das Häkchen heißt „vorbereitet": beim Zauberbuch leer, bei der Vorbereitung gesetzt. */
const spellLine = (s: SheetSpell): string =>
  `<div class="spell">${checkbox(s.prepared)}<span class="sname">${esc(s.label)}</span>` +
  (s.note ? `<span class="spell-note">${esc(s.note)}</span>` : '') + '</div>';

/** Eine Zeile für eine Wahl, die noch offen ist — der einzige Platz, der beschrieben wird. */
const writeSpell = `<div class="spell">${checkbox(false)}<span class="sname write"></span></div>`;

const spellList = (spells: SheetSpell[]): string =>
  byLevel(spells).map(([level, list]) => `<div class="spell-level">
      ${levelHead(String(level), LEVEL_LABEL(level))}
      ${list.map(spellLine).join('')}
    </div>`).join('');

/**
 * Zwei Innenspalten erst, wenn es etwas zu verteilen gibt: eine einzelne Gradgruppe ist
 * `break-inside: avoid` und ließe die zweite Spalte des Vollbreiten-Kastens leer.
 */
const listWidth = (levels: number): string => (levels > 1 ? 'wide cols' : '');

/**
 * Leerzeilen für offene Plätze — der Bogen soll am Tisch beschreibbar bleiben. Das Wappen bleibt
 * leer: es trägt sonst den Zaubergrad, und die Anzahl darin liest sich als einer. Der Tauschtakt
 * steht hier und nur hier: er betrifft die Wahl, nicht das Wirken.
 */
const openGroup = (q: SpellQuotaGroup): string =>
  `<div class="spell-level">
     ${levelHead('', `${q.open}× offen: ${q.label}`,
       q.swapNote ? `<span class="lvl-note">${esc(q.swapNote)}</span>` : '')}
     ${writeSpell.repeat(q.open)}
   </div>`;

const castVal = (label: string, value: string): string =>
  `<span class="cast-val"><span class="cast-lbl">${esc(label)}</span>${value}</span>`;

/**
 * Attribut, SG und Bonus als eine Zeile statt als Kastenreihe: als Kästen wiederholt eine Figur
 * mit fünf Quellen dasselbe Tripel fünfmal. Ohne eigene Werte erbt die Quelle sie — dann nichts.
 */
function castHead(source: SpellSourceGroup): string {
  const vals = [
    source.abilityDe ? castVal('Zauberattribut', esc(source.abilityDe)) : '',
    source.saveDC === null ? '' : castVal('Rettungswurf-SG', String(source.saveDC)),
    source.attackBonus === null ? '' : castVal('Angriffsbonus', sign(source.attackBonus)),
  ].join('');
  return vals ? `<div class="cast-head full">${vals}</div>` : '';
}

export function renderSpellSource(d: CharacterPrintData, groupId: string): string {
  const group = spellSourceGroups(d).find((g) => g.id === groupId);
  if (!group) return '';
  const quotas = group.sources.flatMap((s) => s.quotas);
  const ritual = quotas.some((q) => q.cast.some((o) => o.kind === 'ritual'));
  const head = castHead(group.sources[0]) +
    // Kein Verweis auf ein gedrucktes Kennzeichen: `GroupedSpell` führt das Ritual-Flag nicht.
    (ritual ? '<div class="cast-note full">Ritualwirken: Rituale dieser Liste gehen auch ohne ' +
      'Zauberplatz (Wirkzeit +10 Minuten)</div>' : '');
  const open = quotas.filter((q) => q.open > 0).map(openGroup).join('');

  const spells = mergedSpells(quotas);
  const groups = byLevel(spells).length + quotas.filter((q) => q.open > 0).length;
  return block(group.label, head + spellList(spells) + open,
    { cls: `sp-list ${listWidth(groups)}`, hint: group.hint });
}

/**
 * Ein Kasten je Vorrat: Plätze zerfallen in Kreisreihen je Grad, Zähler und Punkte stehen als
 * eine Kästchenreihe unter dem Kastentitel.
 */
function resourcesBox(d: CharacterPrintData): string {
  return resourceViews(d.resources)
    .map((view) => {
      const cells = view.cells
        .map(({ label, count }) =>
          label
            ? `<div class="sp-slot"><span class="sp-slot-lbl">${esc(label)}</span>${slotCircles(count)}</div>`
            : `<div class="sp-slot">${tickBoxes(count)}<span class="pick-help">max. ${count}</span></div>`,
        )
        .join('');
      return block(view.label, `<div class="sp-slots">${cells}</div>`, { cls: 'sp-tight', hint: view.hint });
    })
    .join('');
}

/** Die skalierenden Klassenspalten daneben: Rauschschaden, Hinterhältiger Angriff, Bardenwürfel. */
function valuesBox(d: CharacterPrintData): string {
  const tracks = d.values.flatMap((cls) => cls.tracks);
  if (!tracks.length) return '';
  const body = tracks.map((t) => `<div class="sp-points">
      <span class="sp-slot-lbl">${esc(t.label)}</span>
      <span class="res-value">${esc(t.text)}</span>
    </div>`).join('');
  const classes = [...new Set(d.values.map((cls) => cls.className))];
  return block('Werte', body, { cls: 'sp-tight', hint: classes.length === 1 ? classes[0] : '' });
}

/**
 * Der Kopf des Zauberblatts: alles, was vor dem Wirken gezählt wird — Plätze, Klassen-Vorräte,
 * Options-Pools — in einer Reihe, damit die Zauberlisten darunter ungestört stehen. Plätze und
 * Vorräte sind Kreisreihen und schmal; die Pools tragen Namen samt Regeltext und den Rest.
 */
export function renderSpellTop(d: CharacterPrintData): string {
  const boxes = resourcesBox(d) + valuesBox(d) + renderOptionPools(d, 'sp-grow');
  return boxes ? `<div class="sp-top">${boxes}</div>` : '';
}

/**
 * `manual.extra` führt Altbestand, der nach einer Migration zusätzlich in einem Kontingent
 * steht — wer schon oben in seiner Quelle steht, kommt hier nicht ein zweites Mal.
 */
function unplacedSpells(d: CharacterPrintData): GroupedSpell[] {
  const placed = new Set(d.grouped.sources.flatMap((s) => s.quotas).flatMap((q) => q.spells).map((s) => s.key));
  return d.grouped.extra.filter((s) => !placed.has(s.key));
}

export function renderExtraSpells(d: CharacterPrintData): string {
  const spells = unplacedSpells(d);
  if (!spells.length) return '';
  // Ohne Quelle gibt es keine gerechneten Werte — der Kasten bleibt eine reine Liste.
  return block('Weitere Zauber', spellList(asSheetSpells(spells)),
    { cls: `sp-list ${listWidth(byLevel(asSheetSpells(spells)).length)}`,
      hint: 'keiner Quelle zugeordnet' });
}
