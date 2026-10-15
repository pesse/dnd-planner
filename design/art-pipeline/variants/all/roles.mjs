import fs from 'node:fs';
// node roles.mjs <figur> <teil> <figurIndex> — gibt den Teil-Brief mit rotierter Szene je Bild aus
const [fig, part, figIdxS] = process.argv.slice(2);
const f = Number(figIdxS);
const species = fig.slice(0, fig.lastIndexOf('-'));

const CLASSES = {
  barbarian: 'Barbarian — furs or hide over bare scarred arms, war paint, a greataxe or greatsword; in a primal rage.',
  bard: 'Bard — colourful flamboyant clothes, a musical instrument (lute, flute, hand drum or bagpipes; never a fiddle or violin); magic woven through music, visible as shimmering golden sound.',
  cleric: 'Cleric — chainmail or scale with a tabard in a deity colour (plain symbol, no writing), a one-handed morningstar (short haft, single spiked ball, not a flail, not a pole weapon) and a holy symbol or shield; radiant divine light, fighting the assigned undead or demonic opponent.',
  druid: 'Druid — garments of leaf, bark, hide and wood, a gnarled staff or wooden shield; nature magic (roots, vines, thorns, animals, storms).',
  fighter: 'Fighter — heavy armour, a melee weapon (sword, axe or spear) and/or shield, no bow; disciplined masterful combat technique.',
  monk: 'Monk — simple belted wraps or robes, bare or bandaged forearms, no armour, unarmed or with a quarterstaff; acrobatic martial arts, a hint of focused inner energy.',
  paladin: 'Paladin — polished plate with a cloak, a longsword (held in one or both hands, optionally with a shield); holy warrior delivering a smite against the assigned undead or demonic opponent — divine light flares around the impact of the sword or radiates from the free hand, the sword strikes and never shoots beams. The blade is rigid steel, dead straight from guard to tip even mid-swing — show speed with trails behind it, never by bending or kinking the blade. Grip: one hand, or both hands stacked, wrapped around the hilt directly below the crossguard, knuckles facing the same way, the blade continuing the line of the forearm toward the opponent.',
  ranger: 'Ranger — hooded green-brown leathers, a longbow as the main weapon, drawn or loosing an arrow (short blades only sheathed as sidearms); a hunter of the wilds, maybe an animal companion.',
  rogue: 'Rogue — dark fitted leathers, hood pushed back so the face shows, ONE dagger or a short sword (straight blade, held by the hilt, edge toward the target); stealth, speed and precise strikes.',
  sorcerer: 'Sorcerer — travelling robes; raw innate magic erupting from the body itself (lightning, fire, frost or draconic power), hair lifted by it.',
  warlock: 'Warlock — dark layered coat, a pact amulet without symbols; crackling eldritch blast and an otherworldly patron presence hinted behind.',
  wizard: 'Wizard — scholar\'s robes, a spellbook (no writing) and/or staff; a precise, studied spell (fireball, force, arcane shapes).',
};
const BACKGROUNDS = {
  acolyte: 'Acolyte — temple vestments, censer, candles or holy texts (no writing); serving at a temple.',
  artisan: 'Artisan — leather apron, rolled sleeves, tools of a craft (smithing, carpentry, weaving, pottery or glassblowing).',
  charlatan: 'Charlatan — gaudy fake-noble finery, fake potions, marked cards or forged papers (no writing).',
  criminal: 'Criminal — dark hooded clothes, lockpicks, a stolen purse; a thief working ALONE (no accomplices), the theft itself clearly readable: picking a lock, opening a strongbox or chest, lifting a purse — the loot goes INTO their own bag; nothing spilled, dropped or thrown away. TENSE: sneaking, picking a lock, escaping pursuers — no gratuitous violence.',
  entertainer: 'Entertainer — bright performer\'s costume; juggling, acrobatics, fire-breathing, music or dancing. ALWAYS shown mid-performance before an audience, lively and joyful, whatever the assigned moment.',
  farmer: 'Farmer — homespun clothes, straw hat, farm tools, animals or crops.',
  guard: 'Guard — town-guard tabard, helmet, spear or halberd; keeping watch and order. MARTIAL: may hold back a threat, stop an intruder or defend a gate.',
  guide: 'Guide — outdoor gear, rope, a smooth perfectly straight walking pole (no knots, no bends); leading others, the guide always ahead and helping the travellers, through wild terrain.',
  hermit: 'Hermit — patched rough robe, a lantern or staff; solitary life of contemplation far from any town (never in a city or village; if the assigned setting is urban, use wilderness instead).',
  merchant: 'Merchant — fine practical coat, ledger (no writing), coin purse, goods and crates.',
  noble: 'Noble — rich formal garments in deep colours with gold trim, signet ring; commanding presence.',
  sage: 'Sage — scholar\'s robe, books and scrolls (no writing), spectacles or astrolabe.',
  sailor: 'Sailor — striped shirt, bandana, rope and rigging; life aboard a ship.',
  scribe: 'Scribe — ink-stained sleeves, quill, scroll case, papers (no writing).',
  soldier: 'Soldier — army uniform tunic, plain helmet, one straight spear or halberd held correctly; part of an army. MARTIAL: drilling, marching or fighting in formation.',
  wayfarer: 'Wayfarer — ragged travelling cloak, a smooth, perfectly straight, evenly thick walking staff like a shaped pole (no knots, no bends, no gnarled branch) and a bundle slung over the shoulder; a wanderer of the roads.',
};
const PARTS = {
  ca: ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk'],
  cb: ['paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'],
  ba: ['acolyte', 'artisan', 'charlatan', 'criminal', 'entertainer', 'farmer', 'guard', 'guide'],
  bb: ['hermit', 'merchant', 'noble', 'sage', 'sailor', 'scribe', 'soldier', 'wayfarer'],
};

const CLASS_MOMENTS = [
  'a headlong charge into the enemy',
  'holding the line alone against overwhelming odds',
  'an evasive leap or dodge that turns into a counterattack',
  'striking while leaping down from a height',
  'shielding a fallen ally or a terrified civilian behind them',
  'the decisive instant after landing a blow, the foe reeling',
  'fending off several small foes at once',
  'bursting out of cover in an ambush',
  'using their power at long range across difficult terrain',
  'fighting on unstable ground (a swaying bridge, a pitching deck, a crumbling ledge)',
];
const BACKGROUND_MOMENTS = [
  'the peak moment of their craft, in full concentration',
  'hurrying with the tools of their trade through obstacles',
  'a mishap in their work, saving the situation at the last second',
  'showing, teaching or leading others',
  'serving a customer, patron or traveller in a friendly way',
  'working on through harsh weather',
  'plying their trade far from home, in an unusual place, with onlookers',
  'a triumphant moment of success, celebrated',
];
const SETTINGS = [
  'a city street or market', 'open wilderness', 'mountains or highlands', 'underground, a cave or ancient ruins',
  'a coast, river or ship', 'an interior hall, workshop or temple', 'a fortress or battlefield', 'a village or countryside',
];
const TIMES = ['at dawn', 'in blazing noon light', 'in golden evening light', 'at night under moon or lanterns', 'in rain or storm', 'in snow or mist'];
const CULTURE = {
  dragonborn: 'ancient draconic highland temples and windswept ridges',
  dwarf: 'carved stone halls, forges and mountain holds',
  elf: 'ancient forests and graceful silver-white architecture',
  fairy: 'fey meadows, oversized flowers and twilight glades',
  gnome: 'cosy workshops, clockwork gadgets and burrow villages',
  goliath: 'high snowy peaks, giant ruins and stone cairns',
  halfling: 'green countryside, round-door villages and riversides',
  human: 'market towns, castles and busy roads',
  orc: 'wide steppes, war camps and rugged hills',
  tiefling: 'twilight cities, rooftops and lantern-lit alleys',
};

// Je Figur ein anderer Gegner — sonst kämpfen alle Paladine gegen dasselbe Skelett.
const HOLY_FOES = [
  'a rotting zombie (human-sized, shambling, torn grave clothes)',
  'a hulking horned demon with leathery wings (at most half again a human\'s height)',
  'a gaunt, clawed ghoul with grey skin, crouched to spring',
  'a spectral wraith — a translucent, hooded shadow with glowing eyes, floating',
  'an armoured skeleton warrior with sword and rusted shield',
  'a death knight in blackened plate with a skull face and cold blue eye-fire',
  'a small red imp-like fiend swarm of two or three, wings and barbed tails',
];
const isClass = part.startsWith('c');
const roles = PARTS[part];
const base = { ca: 0, cb: 6, ba: 0, bb: 8 }[part];
const moments = isClass ? CLASS_MOMENTS : BACKGROUND_MOMENTS;

console.log(isClass
  ? 'These are CLASS variants: the figure is now an adventurer of that class, with its typical gear, in combat or using their class power. The role core below is what must be recognizable; pose, moment and setting are assigned per image — follow the assignment, invent the concrete scene and opponent yourself.'
  : 'These are BACKGROUND variants: what the figure did before adventuring, shown mid-action in that profession. The TEMPER of each scene follows the role: civilian roles show peaceful everyday work (no fights, quarrels, angry customers or hostile crowds); roles marked MARTIAL may confront, defend or fight; roles marked TENSE may show stealth, chases and close calls. In every case the profession must be readable at first glance from the activity itself, not only from the costume; no armour, no class weapons, no spell effects (tools of the trade only). The role core below is what must be recognizable; moment and setting are assigned per image — follow the assignment, invent the concrete scene yourself. A setting the role cannot exist without (a ship for a sailor, a field for a farmer) wins over the assigned one; then use the assigned one as its surroundings.');
console.log(`Setting flavour for this figure's people: ${CULTURE[species]} — use it where it fits the assigned setting, not in every image.\n`);
// REROLL=rolle,rolle: festgefahrene Bilder bekommen eine andere Szene statt derselben Komposition.
const reroll = (process.env.REROLL ?? '').split(',').filter(Boolean);
// Jeder Fehlversuch liegt in old/ — der Zähler verschiebt Szene und Gegner, sonst landet ein Reroll immer auf derselben Kombination.
const OLD = `/mnt/c/dev/privat/dnd-planner/design/art/figures-var2/${fig}-${part}/old`;
const attemptsOf = (role) => { try { return fs.readdirSync(OLD).filter((n) => n.startsWith(`${role}-`)).length; } catch { return 0; } };
const isReroll = (role) => reroll.includes(role) || attemptsOf(role) >= 3;
const shift = (role) => (isReroll(role) ? 5 + 7 * attemptsOf(role) : 0);
roles.forEach((role, i) => {
  const r = base + i + shift(role);
  const moment = moments[(r * 3 + f * 7) % moments.length];
  const setting = SETTINGS[(r * 5 + f * 3) % SETTINGS.length];
  const time = TIMES[(r + f * 5) % TIMES.length];
  const core = isClass ? CLASSES[role] : BACKGROUNDS[role];
  const foe = role === 'paladin' || role === 'cleric' ? ` Opponent: ${HOLY_FOES[(f + (role === 'cleric' ? 3 : 0) + (isReroll(role) ? attemptsOf(role) : 0)) % HOLY_FOES.length]}.` : '';
  const fresh = isReroll(role) ? ' COMPLETELY NEW COMPOSITION: earlier attempts failed repeatedly — do not reuse their pose, camera angle or staging.' : '';
  console.log(`- ${role}.png: ${core}${foe} Moment: ${moment}. Setting: ${setting}, ${time}.${fresh}`);
});
