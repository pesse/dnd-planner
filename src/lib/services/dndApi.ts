/**
 * Geteilte Zugriffe auf die offizielle D&D-5e-SRD-API (dnd5eapi.co).
 *
 * Läuft über das Tauri-`http_request`-Kommando (Rust/reqwest) — umgeht die
 * CORS-Beschränkung des Webviews, genau wie der LLM-HTTP-Pfad. Wird sowohl von
 * der `ItemCard` (manueller Import) als auch vom KI-Tool-Executor genutzt.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Item } from '../types';

export const DND_API = 'https://www.dnd5eapi.co/api/2014';

export interface DndApiRef {
  index: string;
  name: string;
  url: string;
}

/** Such-Treffer aus der DnD-API inkl. Quell-Kategorie und deutschem Tag. */
export interface DndApiItemRef extends DndApiRef {
  source: 'magic' | 'equipment';
  tag: string;
}

/** GET gegen die DnD-API via Rust-HTTP; liefert das geparste JSON. */
export async function apiGet(url: string): Promise<unknown> {
  const text = await invoke<string>('http_request', {
    req: { url, method: 'GET', headers: {}, body: '' },
  });
  return JSON.parse(text);
}

async function searchCategory(category: 'equipment' | 'magic-items', q: string): Promise<DndApiRef[]> {
  const raw = (await apiGet(`${DND_API}/${category}?name=${encodeURIComponent(q)}`)) as Record<string, unknown>;
  return (raw.results as DndApiRef[]) ?? [];
}

export const searchEquipment = (q: string): Promise<DndApiRef[]> => searchCategory('equipment', q);
export const searchMagicItems = (q: string): Promise<DndApiRef[]> => searchCategory('magic-items', q);

/** Holt eine vollständige Ressource per API-URL (relativ wie `/api/2014/equipment/warhammer` oder absolut). */
export async function getResource(urlOrPath: string): Promise<Record<string, unknown>> {
  const url = urlOrPath.startsWith('http') ? urlOrPath : `https://www.dnd5eapi.co${urlOrPath}`;
  return (await apiGet(url)) as Record<string, unknown>;
}

/**
 * Durchsucht Ausrüstung und magische Gegenstände der DnD-API gleichzeitig und
 * liefert maximal 15 kombinierte Treffer (magisch zuerst).
 */
export async function searchDndApiItems(q: string): Promise<DndApiItemRef[]> {
  const [magicRaw, equipRaw] = await Promise.all([
    apiGet(`${DND_API}/magic-items?name=${encodeURIComponent(q)}`),
    apiGet(`${DND_API}/equipment?name=${encodeURIComponent(q)}`),
  ]);
  const magic = ((magicRaw as Record<string, unknown>).results as DndApiRef[] ?? [])
    .map((r) => ({ ...r, source: 'magic' as const, tag: 'magisch' }));
  const equip = ((equipRaw as Record<string, unknown>).results as DndApiRef[] ?? [])
    .map((r) => ({ ...r, source: 'equipment' as const, tag: 'ausrüstung' }));
  return [...magic, ...equip].slice(0, 15);
}

/**
 * Wandelt eine rohe DnD-API-Ressource (via {@link getResource}) in unser
 * `Item`-Schema. Übernimmt Spielwerte 1:1, leitet `item_type` aus Quelle und
 * Feldern ab und extrahiert die Einstimmung aus der Beschreibung magischer
 * Gegenstände. `source` ist immer `"SRD"`.
 */
export function mapApiResourceToItem(
  data: Record<string, unknown>,
  source: 'magic' | 'equipment',
): Item {
  let descArr = (data.desc as string[]) ?? [];
  let attunement = false;
  let attunement_by: string | null = null;

  if (source === 'magic') {
    const firstLine = descArr[0] ?? '';
    if (firstLine.toLowerCase().includes('requires attunement')) {
      attunement = true;
      const match = firstLine.match(/requires attunement(?: by ([^)]+))?/i);
      attunement_by = match?.[1]?.trim() ?? null;
      descArr = descArr.length > 1 ? descArr.slice(1) : descArr;
    }
  }

  let item_type: Item['item_type'];
  if (source === 'magic') {
    item_type = 'magic';
  } else if (data.weapon_category) {
    item_type = 'weapon';
  } else if (data.armor_category || data.armor_class) {
    item_type = 'armor';
  } else {
    item_type = 'gear';
  }

  return {
    index:                data.index as string,
    name:                 data.name as string,
    name_de:              undefined,
    item_type,
    equipment_category:   data.equipment_category as Item['equipment_category'],
    rarity:               data.rarity as Item['rarity'],
    attunement,
    attunement_by,
    variant:              data.variant as boolean | undefined,
    variants:             data.variants as string[] | undefined,
    weapon_category:      data.weapon_category as string | undefined,
    weapon_range:         data.weapon_range as string | undefined,
    damage:               data.damage as Item['damage'],
    two_handed_damage:    data.two_handed_damage as Item['two_handed_damage'],
    range:                data.range as Item['range'],
    throw_range:          data.throw_range as Item['throw_range'],
    properties:           data.properties as Item['properties'],
    armor_category:       data.armor_category as string | undefined,
    armor_class:          data.armor_class as Item['armor_class'],
    str_minimum:          data.str_minimum as number | undefined,
    stealth_disadvantage: data.stealth_disadvantage as boolean | undefined,
    desc:                 descArr,
    desc_de:              undefined,
    cost:                 data.cost as Item['cost'],
    weight:               data.weight as number | undefined,
    source:               'SRD',
    url:                  data.url as string,
  };
}
