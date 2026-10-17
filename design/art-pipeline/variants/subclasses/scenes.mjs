// Je Subklasse EINE feste Szene für alle Figuren. Gegner nur, wo die Subklasse ohne sie nicht lesbar ist,
// und dann groß und nicht-humanoid — Maßstab und Blickziel gegen Menschen waren die häufigsten Nachmal-Gründe.
// status: 'frozen' → Kalibrierung an den Prüffiguren; 'frozen' → Massenlauf.
export const SCENES = {
  'path-of-the-berserker': {
    cls: 'barbarian', status: 'frozen',
    core: 'Barbarian (Path of the Berserker) — furs and hide over bare scarred arms, war paint, a greataxe; pure unstoppable frenzy.',
    scene: 'The frenzied charge: sprinting toward the right through the gap of a palisade gate that has just been smashed apart, splinters and planks still flying. The greataxe is carried in ONE hand, low at the side and trailing behind — that hand grips the haft near its end, the arm hanging naturally downward, the axe head behind the figure close to the ground; the haft is one straight, rigid piece of wood. A fairy flies this charge low over the ground on beating wings instead of running. The other arm is thrust forward with a clenched fist. Head forward, mouth wide open in a roaring war cry, a faint red heat-haze of rage around the body. No opponent; the burning fort lies ahead to the right.',
    camera: 'Full figure in full stride, low three-quarter view.',
    setting: 'A burning hill-fort at dusk, smoke and embers.',
  },
  'college-of-lore': {
    cls: 'bard', status: 'frozen',
    core: 'Bard (College of Lore) — layered colourful scholar-performer clothes, a satchel of old books, a lute (never a fiddle or violin).',
    scene: 'Telling an old legend by the hearth: seated on the edge of a table, playing the lute; out of the music rise glowing golden illusory figures of the legend (a tiny knight facing a tiny dragon) floating above a small listening audience of three or four ordinary townsfolk on the right. The bard looks at the listeners with lively, joyful storytelling energy.',
    camera: 'Waist-up to knee-up, eye level.',
    setting: 'A warm tavern interior at night, firelight.',
  },
  'life-domain': {
    cls: 'cleric', status: 'frozen',
    core: 'Cleric (Life Domain) — chainmail with a white-and-gold tabard (plain symbol, no writing), a morningstar hanging at the belt (not in the hand), a holy symbol held high; a conduit of overwhelming divine life.',
    scene: 'Mass healing on the battlefield: standing upright in the middle of the fallen, the holy symbol raised high overhead in one hand, the other hand open toward the ground; a great column of golden radiance pours down from the clouds onto the cleric and spreads outward across the ground in a shining wave. To the right, three or four wounded soldiers of mixed peoples (human-sized, bandaged, no blood) rise from the ground within the light, their wounds closing, looking up in awe. The cleric looks at the rising soldiers with fervent, triumphant compassion.',
    camera: 'Full figure, low three-quarter view.',
    setting: 'A battlefield at dusk after the fighting, smoke clearing, broken banners without symbols.',
  },
  'circle-of-the-land': {
    cls: 'druid', status: 'frozen',
    core: 'Druid (Circle of the Land) — garments of leaf, bark and hide, a STRAIGHT wooden staff with a gnarled, root-wrapped top (the shaft itself straight and rigid).',
    scene: 'A ritual in a ring of standing stones (plain stones, no carvings): the staff planted firmly on the ground in one hand, the other hand raised with open fingers; from the staff\'s foot new grass, flowers and roots spread across bare earth in a widening ring toward the right, and a swirl of leaves, snowflakes and sand — the seasons and lands — circles the druid. Eyes on the spreading growth, calm concentration.',
    camera: 'Full figure, slightly low three-quarter view.',
    setting: 'A windswept hilltop stone circle at dawn.',
  },
  'circle-of-the-moon': {
    cls: 'druid', status: 'frozen',
    core: 'Druid (Circle of the Moon) — garments of hide, fur and leaf, bone and moonstone charms; no staff.',
    scene: 'Wild Shape beginning: running forward to the right, and a huge translucent silver-blue spirit of a bear is forming AROUND the druid, enveloping their body like a glowing aura (the druid\'s own body stays fully intact and visible inside it, no half-transformed anatomy). Fierce, wild focus; eyes fixed ahead to the right.',
    camera: 'Knee-up, low three-quarter view.',
    setting: 'A moonlit forest clearing under a full moon, mist.',
  },
  champion: {
    cls: 'fighter', status: 'frozen',
    core: 'Fighter (Champion) — heavy armour, a longsword and a round shield on the forearm; peak athletic prowess.',
    scene: 'Victory in the arena: standing on the sand, the longsword raised high overhead in triumph (blade dead straight, pointing up), the shield on the forearm, chest heaving; a cheering crowd on the stands to the right. Proud, exhilarated expression, looking up at the crowd. A broken practice post or a dropped wooden shield lies on the sand — no fallen person.',
    camera: 'Full figure, low three-quarter view.',
    setting: 'A sunlit stone arena at noon, dust in the air.',
  },
  'battle-master': {
    // Gespiegelt gemalt: nach rechts blickend setzt Codex die rechte Hand an den vorderen, linken Arm
    cls: 'fighter', status: 'frozen', flip: true,
    core: 'Fighter (Battle Master) — practical heavy armour, no shield; a superbly trained, technical warrior. The only weapon is a longsword held in the right hand: one straight, unbroken, double-edged steel blade about as long as the arm, a plain cross-guard and a leather grip.',
    scene: 'The instant after a disarm in the thick of battle: the hobgoblin soldier\'s sword spins away through the air above them while the human-sized hobgoblin in iron armour stumbles back, empty-handed. Pose: the fighter faces LEFT, toward the opponent; the right arm is the sword arm and, in this view, the arm nearer to the viewer, extended straight forward at shoulder height, the fist closed around the grip with the knuckles up, and the blade continues the line of the forearm in one straight line toward the hobgoblin\'s chest — no bent or rotated wrist; the left arm, on the far side of the body, drawn back at hip height with an open hand for balance, weight on the front foot; shoulders, arms and hips form one coherent motion. The single opponent stands at close range on the LEFT side of the frame, on the same ground. Controlled, focused fury, eyes on the disarmed hobgoblin.',
    camera: 'Knee-up, eye level three-quarter view.',
    setting: 'The middle of a battle on rolling grassland under a stormy grey sky, fighting soldiers and banners without symbols in the background.',
  },
  'warrior-of-the-open-hand': {
    cls: 'monk', status: 'frozen',
    core: 'Monk (Warrior of the Open Hand) — simple belted wraps, bandaged forearms, barefoot, no armour, no weapon.',
    scene: 'A flurry of blows against a wooden training dummy: one open palm strike lands, the dummy\'s arm splinters off, and a ring of pale blue focused energy pulses from the point of impact; the other arm is pulled back for the next strike. Balanced, grounded stance, intense calm focus, eyes on the dummy.',
    camera: 'Full figure, eye level three-quarter view.',
    setting: 'A mountain monastery courtyard at dawn, falling cherry blossoms.',
  },
  'way-of-shadow': {
    cls: 'monk', status: 'frozen',
    core: 'Monk (Warrior of Shadow) — dark close-fitting wraps, a scarf pulled down so the face shows, barefoot or soft shoes, no weapon.',
    scene: 'Stepping out of the shadows: the monk emerges mid-stride from a pool of living darkness on a wall (the darkness clings to the trailing leg and shoulder like smoke), one hand reaching toward a hanging lantern on the right whose flame is being snuffed by tendrils of shadow from the fingers. Silent, focused; eyes on the lantern.',
    camera: 'Knee-up, slightly low three-quarter view.',
    setting: 'A rooftop of a sleeping city at night, moonlight, no people.',
  },
  'oath-of-devotion': {
    cls: 'paladin', status: 'frozen',
    core: 'Paladin (Oath of Devotion) — polished plate with a white cloak, a longsword; a holy protector.',
    scene: 'Sacred Weapon: the longsword raised vertically before the face in both stacked hands (blade dead straight, point up), blazing with white holy light; a dome of radiance spreads from the paladin and shelters three frightened villagers huddled on the right. At the edge of the light, dark shadowy undead silhouettes recoil. The paladin\'s face is solemn and resolute, eyes on the villagers and the shadows beyond.',
    camera: 'Knee-up, low three-quarter view.',
    setting: 'A village square at night, the only light the paladin\'s radiance.',
  },
  hunter: {
    cls: 'ranger', status: 'frozen',
    core: 'Ranger (Hunter) — hooded green-brown leathers (hood down), a longbow, a quiver; a hunter of great beasts.',
    scene: 'The killing shot: kneeling on a mossy boulder, the longbow fully drawn to the cheek, aiming at a huge owlbear that bursts out of the undergrowth on the right at close range, at the same height as the ranger. Focused, steady, eyes along the arrow on the owlbear.',
    camera: 'Full figure kneeling, eye level three-quarter view.',
    setting: 'A dense old forest in golden evening light.',
  },
  thief: {
    cls: 'rogue', status: 'frozen',
    core: 'Rogue (Thief) — dark fitted leathers, hood pushed back so the face shows, a belt of lockpicks; nimble fingers and climbing skill.',
    scene: 'The getaway climb: clinging to the outside of a manor tower, one hand gripping a stone ledge, both feet on the wall, the other hand clutching a glittering stolen necklace; glancing back to the right at a lit window they just left. Tense but pleased, a sly half-smile allowed. No rope.',
    camera: 'Full figure, view from slightly below and to the side.',
    setting: 'A manor tower at night under moonlight, rooftops below.',
  },
  assassin: {
    cls: 'rogue', status: 'frozen',
    core: 'Rogue (Assassin) — dark fitted leathers, hood pushed back so the face shows, a single straight dagger with a faint green sheen of poison.',
    scene: 'The strike from the shadows: lunging out of pitch darkness toward a big armoured bodyguard (human-sized, half-turned away, only now noticing) on the right, the straight dagger thrust forward toward the gap in the armour — the moment just BEFORE the blow lands, no wound, no blood. The free arm stays bent close to the body for balance (natural length, not stretched out behind). Cold, deadly focus, eyes on the target. The assassin\'s trailing cloak still dissolves into the darkness behind.',
    camera: 'Knee-up, slightly low three-quarter view.',
    setting: 'A castle corridor at night, very dark and low-key: deep black shadows, the only light a single torch on the wall that rims the figures in orange.',
  },
  'draconic-sorcery': {
    cls: 'sorcerer', status: 'frozen',
    core: 'Sorcerer (Draconic Sorcery) — travelling robes; gleaming draconic scales showing along the forearms and neck.',
    scene: 'Draconic power awakening: at a cliff edge, a great pair of translucent, fiery spectral dragon wings unfurls from the sorcerer\'s back (in addition to any wings the species already has), one hand thrust out to the right releasing a roaring cone of dragon fire over a canyon. Hair lifted by the power, fierce exultation, eyes on the flames.',
    camera: 'Knee-up, low three-quarter view.',
    setting: 'A mountain cliff above a red-rock canyon at dusk.',
  },
  'wild-magic-sorcery': {
    cls: 'sorcerer', status: 'frozen',
    core: 'Sorcerer (Wild Magic) — mismatched colourful travelling robes.',
    scene: 'A wild magic surge: a spell erupts unpredictably from the sorcerer\'s cupped hands — a burst of butterflies, blossoms, tiny rainclouds, floating teacups and bright sparks in every colour spiral up and to the right. The sorcerer leans back, astonished and delighted, eyes on the chaos.',
    camera: 'Knee-up, eye level three-quarter view.',
    setting: 'A sunny village market at noon, a couple of startled onlookers on the right.',
  },
  'fiend-patron': {
    cls: 'warlock', status: 'frozen',
    core: 'Warlock (Fiend Patron) — dark layered coat, a pact amulet without symbols.',
    scene: 'The pact answered: standing in a scorched ring on the floor (a plain burnt circle, no glyphs), the warlock holds up one cupped hand in which a flame of dark-red hellfire burns; behind them, filling the background, the vast shadowy horned silhouette of the fiend patron with burning eyes leans over their shoulder. Grim, intent; eyes on the hellfire.',
    camera: 'Waist-up to knee-up, low three-quarter view.',
    setting: 'A ruined chapel at night, embers in the air.',
  },
  evoker: {
    cls: 'wizard', status: 'frozen',
    core: 'Wizard (Evoker) — scholar\'s robes, a spellbook (no writing) held open in one hand; a battle mage of raw destructive power.',
    scene: 'Battle magic: the free hand thrust forward to the right hurls a roaring fireball into a charging war band of gnolls (hyena-headed humanoids, human-sized); the fireball bursts at close range among the lead gnolls, which recoil and are thrown back by the blast. Wind and heat whip the robes and hair. Fierce, commanding concentration, eyes on the explosion.',
    camera: 'Knee-up, low three-quarter view.',
    setting: 'A ruined battlefield ridge at night under a stormy sky, lit by the fire.',
  },
  abjurer: {
    cls: 'wizard', status: 'frozen',
    core: 'Wizard (Abjurer) — scholar\'s robes, a staff (dead straight, rigid) in one hand.',
    scene: 'Arcane Ward: the free hand thrust forward to the right holding up a shimmering translucent shield of interlocking hexagons (geometric shapes only, no glyphs), against which a torrent of fire coming from the right splashes and breaks apart. Braced stance, strained but steady, eyes on the impact.',
    camera: 'Knee-up, eye level three-quarter view.',
    setting: 'A ruined stone hall, firelight and drifting ash.',
  },
};

// Teile à 6 — ein Codex-Lauf malt einen Teil einer Figur (die Identität hält innerhalb eines Laufs am besten).
const slugs = Object.keys(SCENES);
export const PARTS = { sa: slugs.slice(0, 6), sb: slugs.slice(6, 12), sc: slugs.slice(12, 18) };

// Kalibrierung: klein, groß, geflügelt, Schwanz + Androgyn-Rezept.
export const PROBE_FIGURES = ['halfling-feminine', 'goliath-masculine', 'fairy-androgynous', 'tiefling-androgynous'];
