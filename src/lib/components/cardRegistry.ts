/** Welcher Entitätstyp welche Karte öffnet — Titelzeile inklusive. */
import type { Component } from 'svelte';
import type { FileEntryType } from '../types';
import BackgroundCard from './BackgroundCard.svelte';
import ClassCard from './ClassCard.svelte';
import EncounterCard from './EncounterCard.svelte';
import FeatCard from './FeatCard.svelte';
import ItemCard from './ItemCard.svelte';
import MonsterCard from './MonsterCard.svelte';
import NpcCard from './NpcCard.svelte';
import SpeciesCard from './SpeciesCard.svelte';
import SpellCard from './SpellCard.svelte';

export interface CardSpec {
  icon: string;
  component: Component;
  /** Der Dateiname ist beim Gegenstand der Schlüssel — nur dort umbenennbar. */
  renamable?: boolean;
  /** Endung, die im Titel nicht mit angezeigt wird. */
  stripExt?: RegExp;
}

/** Widen jeden Eintrag auf `CardSpec` — sonst verliert `CARD_REGISTRY[type]` optionale Felder, die nicht jede Karte setzt. */
const card = (s: CardSpec): CardSpec => s;

export const CARD_REGISTRY = {
  npc: card({ icon: '👤', component: NpcCard }),
  monster: card({ icon: '⚔', component: MonsterCard }),
  encounter: card({ icon: '⚡', component: EncounterCard }),
  spell: card({ icon: '✦', component: SpellCard }),
  item: card({ icon: '◆', component: ItemCard, renamable: true, stripExt: /\.json$/ }),
  class: card({ icon: '📖', component: ClassCard }),
  species: card({ icon: '🧬', component: SpeciesCard }),
  feat: card({ icon: '✴', component: FeatCard }),
  background: card({ icon: '🎭', component: BackgroundCard }),
} satisfies Partial<Record<FileEntryType, CardSpec>>;

/** Fehlt ein Schlüssel in `CARD_REGISTRY` in `FileEntryType`, meldet `satisfies` oben den Fehler. */
export type CardType = keyof typeof CARD_REGISTRY;

function isCardType(type: FileEntryType): type is CardType {
  return Object.hasOwn(CARD_REGISTRY, type);
}

export const cardTypeOf = (type: FileEntryType | undefined): CardType | null =>
  type !== undefined && isCardType(type) ? type : null;
