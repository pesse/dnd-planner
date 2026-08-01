/** Welcher Entitätstyp welche Karte öffnet — Titelzeile inklusive. */
import type { Component } from 'svelte';
import type { FileEntry } from '../types';
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

export type CardType = 'npc' | 'monster' | 'encounter' | 'spell' | 'item' | 'class' | 'species' | 'feat' | 'background';

export const CARD_REGISTRY: Record<CardType, CardSpec> = {
  npc: { icon: '👤', component: NpcCard },
  monster: { icon: '⚔', component: MonsterCard },
  encounter: { icon: '⚡', component: EncounterCard },
  spell: { icon: '✦', component: SpellCard },
  item: { icon: '◆', component: ItemCard, renamable: true, stripExt: /\.json$/ },
  class: { icon: '📖', component: ClassCard },
  species: { icon: '🧬', component: SpeciesCard },
  feat: { icon: '✴', component: FeatCard },
  background: { icon: '🎭', component: BackgroundCard },
};

export const cardTypeOf = (type: FileEntry['type'] | undefined): CardType | null =>
  type && type in CARD_REGISTRY ? (type as CardType) : null;
