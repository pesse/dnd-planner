/**
 * Rohes Open5e-v2-Spell → internes `Spell`-Schema. Wie `open5eItemMapper` ohne `invoke`,
 * damit der Node-Importer ihn bündeln kann; die Deutsch-Konverter stehen deshalb hier
 * selbstständig, sonst trüge ein ungematchter Zauber gar keine deutschen Felder.
 */
import type { Spell } from '../schemas/spell';
import { keySlug } from '$lib/utils/text';
import { capitalize, DEFAULT_DOCUMENT, descToParagraphs } from './open5eSource';

const SPELL_SCHOOL_KEYS = new Set([
  'abjuration', 'conjuration', 'divination', 'enchantment',
  'evocation', 'illusion', 'necromancy', 'transmutation',
]);

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

function castingTokenToPhrase(token: string): string {
  const t = token.replace(/_/g, ' ').trim().toLowerCase();
  if (t === 'action') return '1 action';
  if (t === 'bonus action') return '1 bonus action';
  if (t === 'reaction') return '1 reaction';
  return token; // z.B. "1 minute" — convertCastingTime bildet das ab
}

/** `name` bleibt englisch — das gepflegte Deutsch setzt der Importer per `name_en`-Match. */
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
    index: keySlug(key),
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
      .map((c) => keySlug(c.key))
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
