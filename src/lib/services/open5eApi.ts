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
import type { Spell } from '../schemas/spell';
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

// ── Zauber (Spells) ────────────────────────────────────────────────────────────
//
// Open5e v2 splittet Zauber NICHT auf zwei Endpunkte. Aber der Quellen-Filter ist
// hier — anders als bei Items — `document__key=<key>` (NICHT `document=`, das wird
// still ignoriert und liefert alle 1955 Dokumente). Freitextsuche wie bei Items via
// `name__icontains=`.

/** Holt einen Zauber (`/v2/spells/`) per v2-Key, z.B. "srd-2024_acid-arrow". */
export async function getSpell(key: string): Promise<Record<string, unknown>> {
  return (await apiGet(`${OPEN5E_V2}/spells/${encodeURIComponent(key)}/?format=json`)) as Record<string, unknown>;
}

/** Durchsucht srd-2024-Zauber (`name__icontains`); liefert `{index,name,url}`-Treffer (url = v2-Key). */
export async function searchOpen5eSpells(q: string, limit = 20): Promise<Open5eItemSearchResult[]> {
  const raw = (await apiGet(
    `${OPEN5E_V2}/spells/?document__key=${DEFAULT_DOCUMENT}&name__icontains=${encodeURIComponent(q)}&format=json&limit=${limit}`,
  )) as { results?: Array<Record<string, unknown>> };
  return (raw.results ?? []).map((r) => ({
    index: String(r.key ?? ''),
    name: String(r.name ?? ''),
    url: String(r.key ?? ''),
    tag: 'zauber',
  }));
}

// ── Reiner Mapper: rohes Open5e-v2-Spell → internes `Spell`-Schema ──────────────
//
// Wie `mapOpen5eItem` bewusst OHNE `invoke`, damit der Node-Importer
// (`scripts/import-open5e-spells.mts`) ihn direkt bündeln kann. Selbstständige
// Deutsch-Konverter (portiert aus dem alten `dndApi.ts`), damit auch ungematchte
// Zauber vernünftige deutsche Felder tragen; für gematchte Zauber überschreibt der
// Importer casting_time/range/duration ohnehin mit den gepflegten Vault-Werten.

const SPELL_SCHOOL_KEYS = new Set([
  'abjuration', 'conjuration', 'divination', 'enchantment',
  'evocation', 'illusion', 'necromancy', 'transmutation',
]);

/** Fuß → Meter (0,3-Konstante), selbstständig gehalten für den Node-Importer. */
function spellFtToM(feet: number): string {
  return `${Math.round(feet * 3) / 10} m`.replace('.', ',');
}

function convertRange(r: string): string {
  return r
    .replace(/(\d+)-foot[-\s]/gi, (_, n) => `${spellFtToM(parseInt(n))}-`)
    .replace(/(\d+)\s*feet?/gi, (_, n) => spellFtToM(parseInt(n)))
    .replace(/\bTouch\b/gi, 'Berührung').replace(/\bSelf\b/gi, 'Selbst')
    .replace(/\bSight\b/gi, 'Sichtlinie').replace(/\bUnlimited\b/gi, 'Unbegrenzt')
    .replace(/\bSpecial\b/gi, 'Besonders').replace(/\bsphere\b/gi, 'Sphäre')
    .replace(/\bcone\b/gi, 'Kegel').replace(/\bcube\b/gi, 'Würfel')
    .replace(/\bline\b/gi, 'Linie').replace(/\bcylinder\b/gi, 'Zylinder')
    .replace(/\bradius\b/gi, 'Radius');
}

function convertDuration(d: string): string {
  return d
    .replace(/\bConcentration,\s*up to\s*/gi, 'Konzentration, bis zu ')
    .replace(/(\d+)\s*minutes?/gi, (_, n) => `${n} Minute${n === '1' ? '' : 'n'}`)
    .replace(/(\d+)\s*hours?/gi, (_, n) => `${n} Stunde${n === '1' ? '' : 'n'}`)
    .replace(/(\d+)\s*days?/gi, (_, n) => `${n} Tag${n === '1' ? '' : 'e'}`)
    .replace(/(\d+)\s*rounds?/gi, (_, n) => `${n} Runde${n === '1' ? '' : 'n'}`)
    .replace(/\bInstantaneous\b/gi, 'Unmittelbar').replace(/\bUntil dispelled\b/gi, 'Bis aufgelöst')
    .replace(/\bPermanent\b/gi, 'Dauerhaft').replace(/\bSpecial\b/gi, 'Besonders');
}

function convertCastingTime(ct: string): string {
  return ct
    .replace(/\b1 action\b/gi, '1 Aktion').replace(/\b1 bonus action\b/gi, '1 Bonusaktion')
    .replace(/\b1 reaction\b/gi, '1 Reaktion')
    .replace(/(\d+)\s*minutes?/gi, (_, n) => `${n} Minute${n === '1' ? '' : 'n'}`)
    .replace(/(\d+)\s*hours?/gi, (_, n) => `${n} Stunde${n === '1' ? '' : 'n'}`)
    .replace(/\bwhich you take when\b/gi, 'die du nimmst, wenn');
}

/** Open5e-casting_time-Token ("action", "bonus_action", "reaction") → englische Phrase. */
function castingTokenToPhrase(token: string): string {
  const t = token.replace(/_/g, ' ').trim().toLowerCase();
  if (t === 'action') return '1 action';
  if (t === 'bonus action') return '1 bonus action';
  if (t === 'reaction') return '1 reaction';
  return token; // z.B. "1 minute" — convertCastingTime bildet das ab
}

/**
 * Rohes Open5e-v2-Spell → internes `Spell`. `name` = englischer Name (das gepflegte
 * Deutsch übernimmt der Importer per `name_en`-Match); `desc_de`/`higher_level_de`
 * bleiben leer.
 */
export function mapOpen5eSpell(raw: Record<string, unknown>): Spell {
  const doc = raw.document as { key?: string; gamesystem?: { key?: string } } | undefined;
  const school = (raw.school as { key?: string } | undefined)?.key ?? '';
  const key = String(raw.key ?? '');
  const level = Number(raw.level ?? 0);
  const source = (doc?.key ?? DEFAULT_DOCUMENT) as Spell['source'];
  const rangeText = String(raw.range_text ?? (raw.range != null ? `${raw.range} feet` : ''));
  const higher = typeof raw.higher_level === 'string' && raw.higher_level ? raw.higher_level : '';
  const materialSpec = String(raw.material_specified ?? '');
  const dtypes = Array.isArray(raw.damage_types) ? (raw.damage_types as string[]) : [];
  const droll = typeof raw.damage_roll === 'string' ? raw.damage_roll : '';
  const saveAbility = String(raw.saving_throw_ability ?? '');

  const spell: Spell = {
    key,
    index: key ? key.slice(key.indexOf('_') + 1) : '',
    name: String(raw.name ?? ''),
    name_en: String(raw.name ?? ''),
    level,
    school: (SPELL_SCHOOL_KEYS.has(school) ? school : 'evocation') as Spell['school'],
    casting_time: convertCastingTime(castingTokenToPhrase(String(raw.casting_time ?? ''))),
    range: convertRange(rangeText),
    components: {
      verbal: Boolean(raw.verbal),
      somatic: Boolean(raw.somatic),
      material: Boolean(raw.material),
      materials_needed: materialSpec || null,
    },
    duration: convertDuration(String(raw.duration ?? '')),
    concentration: Boolean(raw.concentration),
    ritual: Boolean(raw.ritual),
    classes: ((raw.classes as Array<{ key?: string }>) ?? [])
      .map((c) => (c.key ? c.key.slice(c.key.indexOf('_') + 1) : ''))
      .filter(Boolean),
    desc: descToParagraphs(raw.desc),
    desc_de: [],
    higher_level: higher ? [higher] : null,
    higher_level_de: [],
    source,
    document: { key: doc?.key ?? DEFAULT_DOCUMENT, gamesystem: doc?.gamesystem?.key ?? '' },
  };

  if (dtypes.length && droll) {
    spell.damage = {
      damage_type: { index: dtypes[0], name: capitalize(dtypes[0]) },
      damage_at_slot_level: { [String(level)]: droll },
    };
  }
  if (saveAbility) {
    spell.dc = {
      dc_type: { index: saveAbility.slice(0, 3), name: capitalize(saveAbility) },
      dc_success: droll ? 'half' : 'none',
    };
  }
  const shapeType = raw.shape_type;
  const shapeSize = raw.shape_size;
  if (shapeType && shapeSize != null) {
    spell.area_of_effect = { type: String(shapeType), size: Number(shapeSize) };
  }

  return spell;
}
