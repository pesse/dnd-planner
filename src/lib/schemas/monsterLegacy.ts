/**
 * Hebt eine Monsterdatei aus dem Vor-Open5e-Format an. Läuft an ZWEI Stellen mit demselben
 * Ergebnis: in `migrateMonsterLegacy` bei jedem Laden (alte Bibliothekspakete und akt-lokale
 * Dateien bleiben lesbar, ohne dass etwas hinter dem Rücken des Users geschrieben wird) und
 * in `scripts/migrate-monsters.mts`, das das Ergebnis festschreibt.
 *
 * Idempotent und inhaltsgeführt: eine bereits umgestellte Datei fällt beim ersten Test durch.
 */
import {
  legacyAbilityBonuses,
  legacyConditions,
  legacyDamageTypes,
  legacySkillBonuses,
  parseLegacyCr,
  parseLegacyDice,
  parseLegacyLanguages,
  parseLegacySenses,
  parseLegacySpeed,
} from './monsterLegacyStrings';

type Raw = Record<string, unknown>;

const asArray = (value: unknown): Raw[] =>
  Array.isArray(value) ? value.filter((e): e is Raw => !!e && typeof e === 'object') : [];

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
/** Fehlt der Wert, ist das `null` und nicht 0 — sonst verschluckt `??` den nächsten Kandidaten. */
const int = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  const text = str(value).trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** „giant-wolf-spider" → „Giant Wolf Spider" — dieselbe Form, die Open5e als `name` führt. */
const titleFromSlug = (slug: string): string =>
  slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/**
 * Das alte Format erkennt man am String-`cr`, an `stats` und an den vier getrennten
 * Aktionslisten. Die eine Datei mit den Aliasen `challenge_rating`/`hit_points`/`abilities`
 * trägt keins davon — sie fällt über `abilities`/`armor_class` auf.
 */
function isLegacy(raw: Raw): boolean {
  return (
    typeof raw.cr === 'string' ||
    'stats' in raw ||
    'abilities' in raw ||
    'ac' in raw ||
    'hp' in raw ||
    'reactions' in raw ||
    'legendary_actions' in raw ||
    typeof raw.speed === 'string' ||
    typeof raw.senses === 'string' ||
    typeof raw.languages === 'string'
  );
}

/** Eine alte Aktion/Eigenschaft: `description` ODER `desc`, Schaden als Array ODER String. */
function convertEntry(entry: Raw, actionType?: string): Raw {
  const desc = str(entry.description) || str(entry.desc);
  const out: Raw = { name: str(entry.name), name_en: '', desc, desc_en: '' };
  if (!actionType) return out;

  out.action_type = actionType;
  out.legendary_action_cost = 1;

  const bonus = int(entry.attack_bonus);
  const rolls = Array.isArray(entry.damage)
    ? entry.damage
    : typeof entry.damage === 'string'
      ? [entry.damage]
      : [];

  // Ein „Mehrfachangriff" trug den Platzhalter `attack_bonus: -1` ohne Schaden — das ist
  // kein Angriff, sondern Prosa, und bekommt deshalb keinen `attacks`-Eintrag.
  if (rolls.length === 0) {
    out.attacks = [];
    return out;
  }

  const damages = rolls.map((roll) => {
    if (typeof roll === 'string') {
      const cut = roll.lastIndexOf(' ');
      const dice = cut === -1 ? roll : roll.slice(0, cut);
      const type = cut === -1 ? '' : roll.slice(cut + 1);
      return { ...parseLegacyDice(dice), type: legacyDamageTypes([type]).values[0] };
    }
    const r = roll as Raw;
    return { ...parseLegacyDice(r.dice), type: legacyDamageTypes([str(r.type)]).values[0] };
  });

  out.attacks = [
    {
      name: str(entry.name),
      attack_type: 'WEAPON',
      to_hit_mod: bonus ?? 0,
      target_creature_only: false,
      damage: damages[0],
      ...(damages[1] ? { extra_damage: damages[1] } : {}),
    },
  ];
  return out;
}

const ACTION_LISTS: [string, string][] = [
  ['actions', 'ACTION'],
  ['bonus_actions', 'BONUS_ACTION'],
  ['reactions', 'REACTION'],
  ['legendary_actions', 'LEGENDARY_ACTION'],
];

export function upgradeLegacyMonster(raw: Raw): Raw {
  if (!isLegacy(raw)) return raw;

  const out: Raw = { ...raw };
  delete out.cr;
  delete out.stats;
  delete out.abilities;
  delete out.ac;
  delete out.hp;
  delete out.skills;
  delete out.reactions;
  delete out.legendary_actions;
  delete out.bonus_actions;
  delete out.index;
  delete out.armor_class;
  delete out.hit_points;
  delete out.challenge_rating;

  out.name = str(raw.name);
  // Das alte `index` ist der einzige englische Handle der Bestandsdateien — als Name
  // gerettet, sonst findet `import-open5e-creatures` das Monster nicht wieder und legt
  // es unter englischem Slug ein zweites Mal an.
  out.name_en = str(raw.name_en) || titleFromSlug(str(raw.index));
  out.challenge_rating = parseLegacyCr(raw.cr ?? raw.challenge_rating);

  const ac = (raw.ac ?? {}) as Raw;
  out.armor_class = int(ac.value) ?? int(raw.armor_class) ?? 10;
  out.armor_detail = str(ac.note);

  const hp = (raw.hp ?? {}) as Raw;
  out.hit_points = int(hp.average) ?? int(raw.hit_points) ?? 0;
  out.hit_dice = str(hp.formula);

  out.ability_scores = raw.stats ?? raw.abilities ?? undefined;
  out.saving_throws = legacyAbilityBonuses(raw.saving_throws);
  out.skill_bonuses = legacySkillBonuses(raw.skills);
  out.speed = parseLegacySpeed(raw.speed);
  out.senses = parseLegacySenses(raw.senses);

  const languages = parseLegacyLanguages(raw.languages);
  out.languages = languages.languages;
  out.languages_desc = [str(raw.languages_desc), languages.desc].filter(Boolean).join(', ');

  const resistances = legacyDamageTypes(raw.damage_resistances);
  const immunities = legacyDamageTypes(raw.damage_immunities);
  const vulnerabilities = legacyDamageTypes(raw.damage_vulnerabilities);
  const conditions = legacyConditions(raw.condition_immunities);
  out.damage_resistances = resistances.values;
  out.damage_immunities = immunities.values;
  out.damage_vulnerabilities = vulnerabilities.values;
  out.condition_immunities = conditions.values;
  out.defenses_desc = [
    str(raw.defenses_desc),
    ...resistances.leftovers,
    ...immunities.leftovers,
    ...vulnerabilities.leftovers,
    ...conditions.leftovers,
  ]
    .filter(Boolean)
    .join('; ');

  out.traits = asArray(raw.traits).map((t) => convertEntry(t));
  out.actions = ACTION_LISTS.flatMap(([field, actionType]) =>
    asArray(raw[field]).map((a) => convertEntry(a, actionType)),
  );

  return out;
}
