/**
 * Zugriff auf die Open5e-**v2**-API (api.open5e.com/v2).
 *
 * Läuft — wie `dndApi.ts` — über das Tauri-`http_request`-Kommando (Rust/reqwest),
 * um die CORS-Beschränkung des Webviews zu umgehen. Transport-Schicht: liefert das
 * rohe v2-JSON; die Abbildung auf den internen Typ passiert in `classProgression.ts`.
 *
 * v2 ist im Gegensatz zu v1 vollstrukturiert: `data_for_class_table` je Spalte,
 * `gained_at` je Merkmal, `caster_type`, `saving_throws`, `document` mit Quelle.
 * Es gibt SRD 5.1 (`srd-2014`) UND SRD 5.2 (`srd-2024`) als Dokumente.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Item } from '../schemas/item';
import { WEAPON_MASTERIES } from '../schemas/shared';

export const OPEN5E_V2 = 'https://api.open5e.com/v2';

/** Standard-Quelle: SRD 5.2 (passt zur deutschen 5.2.1-Terminologie der App). */
export const DEFAULT_DOCUMENT = 'srd-2024';

/** GET gegen die Open5e-v2-API via Rust-HTTP; liefert das geparste JSON. */
export async function apiGet(url: string): Promise<unknown> {
  const text = await invoke<string>('http_request', {
    req: { url, method: 'GET', headers: {}, body: '' },
  });
  return JSON.parse(text);
}

/** Holt eine Klasse (oder Subklasse) per v2-Key, z.B. "srd-2024_wizard". */
export async function getClass(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/classes/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2ClassRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
  subclass_of?: { key?: string; name?: string } | null;
}

// Session-Cache für die (große) Klassenliste — der Netzabruf lädt bis zu `limit`
// Klassen und ist teuer; innerhalb einer Session ändert er sich nicht.
let classListCache: V2ClassRef[] | null = null;

/** Listet Klassen-/Subklassen-Referenzen (für Quellen-Filter & Subklassen-Auswahl). */
export async function listClasses(limit = 400): Promise<V2ClassRef[]> {
  if (classListCache) return classListCache;
  const raw = (await apiGet(`${OPEN5E_V2}/classes/?format=json&limit=${limit}`)) as { results?: V2ClassRef[] };
  classListCache = raw.results ?? [];
  return classListCache;
}

/** Subklassen einer Basisklasse, gefiltert nach erlaubten Quellen (document.key). */
export async function getSubclasses(parentKey: string, allowedDocs: string[] = [DEFAULT_DOCUMENT]): Promise<V2ClassRef[]> {
  const all = await listClasses();
  const allow = new Set(allowedDocs);
  return all.filter((c) => c.subclass_of?.key === parentKey && allow.has(c.document?.key));
}

// ── Spezies ──────────────────────────────────────────────────────────────────
// WICHTIG: der v2-Endpunkt heißt `/v2/species/`, NICHT `/v2/races/`.

/** Holt eine Spezies per v2-Key, z.B. "srd-2024_dwarf". */
export async function getSpecies(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/species/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2SpeciesRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
}

/** Listet Spezies-Referenzen (für Quellen-Filter & Auswahl). */
export async function listSpecies(limit = 400): Promise<V2SpeciesRef[]> {
  const raw = (await apiGet(`${OPEN5E_V2}/species/?format=json&limit=${limit}`)) as { results?: V2SpeciesRef[] };
  return raw.results ?? [];
}

// ── Talente (Feats) ────────────────────────────────────────────────────────────

/** Holt ein Talent per v2-Key, z.B. "srd-2024_alert". */
export async function getFeat(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/feats/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2FeatRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
}

/** Listet Talent-Referenzen (für Suche & Auswahl). */
export async function listFeats(limit = 500): Promise<V2FeatRef[]> {
  const raw = (await apiGet(`${OPEN5E_V2}/feats/?format=json&limit=${limit}`)) as { results?: V2FeatRef[] };
  return raw.results ?? [];
}

// ── Hintergründe (Backgrounds) ─────────────────────────────────────────────────
// ACHTUNG: nur 4 der ~58 Einträge sind 5e-2024 (`document.key === 'srd-2024'`).
// Der Rest stammt aus SRD 5.1, A5E und Drittanbieter-Quellen und ist 2014-Mechanik
// (Feature + Suggested Characteristics statt Attributswerte + Herkunftstalent).
// `toSourceKey` zieht solche Importe auf `homebrew-sam` — bewusst, damit nichts mit
// ungeklärter Lizenz in einem offen verteilten Pack landet.

/** Holt einen Hintergrund per v2-Key, z.B. "srd-2024_soldier". */
export async function getBackground(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/backgrounds/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

export interface V2BackgroundRef {
  key: string;
  name: string;
  document: { key: string; gamesystem?: { key?: string }; display_name?: string };
}

/** Listet Hintergrund-Referenzen (für Suche & Auswahl). */
export async function listBackgrounds(limit = 100): Promise<V2BackgroundRef[]> {
  const raw = (await apiGet(`${OPEN5E_V2}/backgrounds/?format=json&limit=${limit}`)) as { results?: V2BackgroundRef[] };
  return raw.results ?? [];
}

// ── Gegenstände (Items) ──────────────────────────────────────────────────────
//
// Open5e v2 splittet Gegenstände auf ZWEI Endpunkte, beide mit inline
// weapon/armor-Detailobjekten und identischem Datensatz-Schema:
//   • `/v2/items/`      — gewöhnliche Ausrüstung (keine rarity)
//   • `/v2/magicitems/` — magische Gegenstände (mit rarity/attunement)
// Beide werden importiert/durchsucht; `mapOpen5eItem` bildet beide gleich ab.
//
// WICHTIG zu den v2-Query-Parametern (verifiziert): der Quellen-Filter heißt
// `document=<key>` (NICHT `document__key`, das wird still ignoriert und liefert
// alle Dokumente), und Freitextsuche geht über `name__icontains=` (`search=`
// wird ebenfalls ignoriert). Alle Zugriffe filtern hart auf srd-2024.

/** Holt einen Ausrüstungs-Datensatz (`/v2/items/`) per v2-Key, z.B. "srd-2024_battleaxe". */
export async function getItem(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/items/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

/** Holt einen magischen Gegenstand (`/v2/magicitems/`) per v2-Key, z.B. "srd-2024_ring-of-protection". */
export async function getMagicItem(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/magicitems/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

/**
 * Lädt einen Gegenstand per Key ohne den Endpunkt zu kennen — erst `/v2/items/`,
 * bei 404 `/v2/magicitems/`. Die srd-2024-Keys der beiden Endpunkte kollidieren
 * nicht, der Fallback ist also eindeutig. Für UI/KI, die nur einen Key haben.
 */
export async function getOpen5eItem(key: string): Promise<Record<string, unknown>> {
  try {
    return await getItem(key);
  } catch {
    return await getMagicItem(key);
  }
}

/** Listet die rohen srd-2024-Ausrüstungs-Datensätze (mit inline weapon/armor). */
export async function listItems(limit = 500): Promise<Record<string, unknown>[]> {
  const raw = (await apiGet(
    `${OPEN5E_V2}/items/?document=${DEFAULT_DOCUMENT}&format=json&limit=${limit}`,
  )) as { results?: Record<string, unknown>[] };
  return raw.results ?? [];
}

/** Such-Treffer für die manuelle Import-UI (`DndApiSearch`-kompatibel: {index,name,url}). */
export interface Open5eItemSearchResult {
  index: string; // = v2-Key
  name: string;
  url: string; // = v2-Key (an getOpen5eItem übergeben)
  tag: string; // 'ausrüstung' | 'magisch'
}

/** Ein `/v2/…`-Suchendpunkt → {index,name,url,tag}-Treffer (srd-2024, name__icontains). */
async function searchOpen5eEndpoint(path: string, q: string, tag: string, limit: number): Promise<Open5eItemSearchResult[]> {
  const raw = (await apiGet(
    `${OPEN5E_V2}/${path}/?document=${DEFAULT_DOCUMENT}&name__icontains=${encodeURIComponent(q)}&format=json&limit=${limit}`,
  )) as { results?: Array<Record<string, unknown>> };
  return (raw.results ?? []).map((r) => ({
    index: String(r.key ?? ''),
    name: String(r.name ?? ''),
    url: String(r.key ?? ''),
    tag,
  }));
}

/** Durchsucht srd-2024-Ausrüstung UND -Magie; liefert bis zu `limit` Treffer (Ausrüstung zuerst). */
export async function searchOpen5eItems(q: string, limit = 20): Promise<Open5eItemSearchResult[]> {
  const [gear, magic] = await Promise.all([
    searchOpen5eEndpoint('items', q, 'ausrüstung', limit),
    searchOpen5eEndpoint('magicitems', q, 'magisch', limit),
  ]);
  return [...gear, ...magic].slice(0, limit);
}

// ── Reiner Mapper: rohes Open5e-v2-Item → internes `Item`-Schema ───────────────
//
// Bewusst OHNE `invoke`, damit der Node-Importer (`scripts/import-open5e-items.mts`)
// die Funktion direkt importieren kann (esbuild tree-shakt die Transport-Schicht +
// den `@tauri-apps/api/core`-Import weg). Gleiche Technik wie `parseCoreTraits`.

interface Open5eWeapon {
  key?: string;
  damage_dice?: string;
  damage_type?: { key: string; name: string };
  properties?: Array<{ property?: { name?: string; type?: string | null }; detail?: string | null }>;
  is_simple?: boolean;
  is_martial?: boolean;
}

interface Open5eArmor {
  key?: string;
  category?: string;
  ac_base?: number;
  ac_add_dexmod?: boolean;
  ac_cap_dexmod?: number | null;
  grants_stealth_disadvantage?: boolean;
  strength_score_required?: number | null;
}

const slugName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Einzeiliger `desc`-String → Absatz-Array; Array wird durchgereicht. */
function descToParagraphs(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) return raw.split(/\n\n+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

/** Open5e-Kosten (Dezimal-gp-String) → {quantity, unit}; 0/leer → undefined. */
function parseOpen5eCost(raw: unknown): Item['cost'] | undefined {
  const n = typeof raw === 'string' ? parseFloat(raw) : typeof raw === 'number' ? raw : NaN;
  if (!isFinite(n) || n <= 0) return undefined;
  if (n >= 1) return { quantity: Math.round(n * 100) / 100, unit: 'gp' };
  const sp = n * 10;
  if (Math.abs(sp - Math.round(sp)) < 1e-9 && sp >= 1) return { quantity: Math.round(sp), unit: 'sp' };
  return { quantity: Math.round(n * 100), unit: 'cp' };
}

/** "Range 150/600; Arrow" → {normal:150, long:600}; Einzelwert → normal=long. */
function parseRangePair(detail: string | null | undefined): { normal: number; long: number } | undefined {
  if (!detail) return undefined;
  const pair = detail.match(/(\d+)\s*\/\s*(\d+)/);
  if (pair) return { normal: Number(pair[1]), long: Number(pair[2]) };
  const single = detail.match(/(\d+)/);
  return single ? { normal: Number(single[1]), long: Number(single[1]) } : undefined;
}

/** +1/+2/+3 aus dem englischen Namen (best effort; nur so drückt Open5e den Bonus aus). */
function magicBonusFromName(name: string): number | undefined {
  const m = name.match(/\+([123])\b/);
  return m ? Number(m[1]) : undefined;
}

function applyWeapon(item: Item, w: Open5eWeapon): void {
  const wc = w.is_martial ? 'Martial' : w.is_simple ? 'Simple' : undefined;
  if (wc) item.weapon_category = wc;
  if (w.damage_dice && w.damage_type) {
    item.damage = { damage_dice: w.damage_dice, damage_type: { index: w.damage_type.key, name: w.damage_type.name } };
  }
  const props: NonNullable<Item['properties']> = [];
  let ranged = false;
  for (const p of w.properties ?? []) {
    const name = p.property?.name ?? '';
    if (!name) continue;
    // Meisterschaft (5e 2024) ist eine Eigenschaft mit type "Mastery" — sie landet im
    // eigenen `mastery`-Feld, NICHT in properties.
    if (p.property?.type === 'Mastery') {
      if ((WEAPON_MASTERIES as readonly string[]).includes(name)) item.mastery = name as Item['mastery'];
      continue;
    }
    props.push({ index: slugName(name), name });
    if (name === 'Versatile' && p.detail && item.damage) {
      item.two_handed_damage = { damage_dice: p.detail, damage_type: item.damage.damage_type };
    }
    if (name === 'Ammunition') {
      ranged = true;
      const r = parseRangePair(p.detail);
      if (r) item.range = r;
    }
    if (name === 'Thrown') {
      const r = parseRangePair(p.detail);
      if (r) item.throw_range = r;
    }
  }
  if (props.length) item.properties = props;
  item.weapon_range = ranged ? 'Ranged' : 'Melee';
}

function applyArmor(item: Item, a: Open5eArmor): void {
  // Open5e labelt Schilde fälschlich als armor.category "heavy"; verlässliches Signal
  // ist der kleine Flat-AC-Bonus (ac_base < 10) statt eines Rüstungs-Grundwerts (≥10).
  const isShield = typeof a.ac_base === 'number' && a.ac_base < 10;
  const cat = isShield ? 'Shield' : capitalize(String(a.category ?? ''));
  if (cat) item.armor_category = cat;
  if (typeof a.ac_base === 'number') {
    item.armor_class = { base: a.ac_base, dex_bonus: Boolean(a.ac_add_dexmod), max_bonus: a.ac_cap_dexmod ?? null };
  }
  item.str_minimum = a.strength_score_required ?? 0;
  item.stealth_disadvantage = Boolean(a.grants_stealth_disadvantage);
}

/**
 * Rohes Open5e-v2-Item (`/v2/items/` oder `/v2/magicitems/`) → internes `Item`.
 * Adaptiert die inline `weapon`/`armor`-Detailobjekte in die bestehenden Feldformen;
 * `name_de`/`desc_de` bleiben leer (Open5e ist englisch, DE wird separat gepflegt).
 */
export function mapOpen5eItem(raw: Record<string, unknown>): Item {
  const doc = raw.document as { key?: string; gamesystem?: { key?: string } } | undefined;
  const category = raw.category as { key?: string; name?: string } | undefined;
  const weapon = raw.weapon as Open5eWeapon | null | undefined;
  const armor = raw.armor as Open5eArmor | null | undefined;
  const key = String(raw.key ?? '');
  const baseKey = weapon?.key ?? armor?.key ?? key;

  const item: Item = {
    key,
    index: baseKey ? baseKey.slice(baseKey.indexOf('_') + 1) : '',
    name: String(raw.name ?? ''),
    equipment_category: {
      index: String(category?.key ?? 'adventuring-gear'),
      name: String(category?.name ?? 'Adventuring Gear'),
    },
    desc: descToParagraphs(raw.desc),
    source: (doc?.key ?? DEFAULT_DOCUMENT) as Item['source'],
    document: { key: doc?.key ?? '', gamesystem: doc?.gamesystem?.key ?? '' },
  };

  const cost = parseOpen5eCost(raw.cost);
  if (cost) item.cost = cost;
  const weight = parseFloat(String(raw.weight ?? ''));
  if (isFinite(weight) && weight > 0) item.weight = weight;

  // Magie-Felder nur, wenn die Quelle sie trägt (magicitems; bei /items nie vorhanden).
  const rarity = raw.rarity as { name?: string; rank?: number } | undefined;
  if (rarity?.name) item.rarity = { name: rarity.name, rank: rarity.rank };
  if ('requires_attunement' in raw) item.attunement = Boolean(raw.requires_attunement);
  if (raw.attunement_detail) item.attunement_by = String(raw.attunement_detail);
  const bonus = magicBonusFromName(item.name);
  if (bonus) item.magic_bonus = bonus;

  if (weapon) applyWeapon(item, weapon);
  if (armor) applyArmor(item, armor);

  return item;
}
