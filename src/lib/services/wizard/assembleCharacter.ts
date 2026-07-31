/**
 * Setzt aus dem Wizard-Zustand einen vollständigen `Character` zusammen — die
 * deterministischen Schritte (Point-Buy, Hintergrund-ASI, Übungen, HP) UND die
 * fertigen KI-Ergebnisse (Merkmalswahlen/-zauber, Merkmals-Text, Ausrüstung).
 *
 * Bewusst OHNE Tauri/Dateizugriff: liefert nur das Objekt. Das Schreiben der
 * `character.json` + `gm-notes.md` bleibt am Aufrufer (Sidebar), der dafür schon
 * `write_file_content` nutzt — so bleibt diese Funktion rein und testbar.
 *
 * Reihenfolge der Attributsrechnung ist tragend: Point-Buy → Hintergrund-ASI →
 * Talent-/Merkmals-Erhöhungen → ERST DANN Modifikatoren und HP (Stufe 1 =
 * Trefferwürfel-Max + KON-Mod), sonst wäre der KON-Mod veraltet.
 */
import {
  CHARACTER_VERSION,
  formatClassLevel,
  formatSpecies,
  type Character,
} from '$lib/schemas/character';
import {
  SKILL_DEFS,
  mod,
  emptyProficiencies,
  emptyPersonal,
  emptySpells,
} from '$lib/pdf/characterFields';
import { type AbilityKey } from '$lib/schemas/classProgression';
import { type SkillName } from '$lib/schemas/shared';
import { collectGrants, proficiencyGrantChanges } from '../proficiencyGrants';
import { getSpeciesByKey } from '$lib/speciesLibrary';
import { getFeats, featDisplayName } from '$lib/featsLibrary';
import { choiceLabelsDe } from '../aiActions/featureEffectsAction';
import { getProgressionByKey, spellSlotsAt } from '../classProgression';
import { getSpellLibrary, buildSpellIndex, matchSpell } from '$lib/spellLibrary';
import {
  declaredSpellChanges,
  resolveDeclaredSpells,
  riderGrantChanges,
  validateRiderSpells,
} from '../levelUpMachine';
import { isSpellGrantFeature } from '../grantedSpells';
import {
  buildSpellSelection,
  CASTER_ABILITY_DE,
  CASTER_ABILITY_KEY,
  spellAttackBonus,
  spellcastingOffer,
  spellSaveDC,
} from '../spellcasting';
import { applyChanges } from '../applyChanges';
import { spellAccessNoteLines } from '../spellAccess';
import { declaredGrantChanges, optionListNoteLines } from '../featureDeclaration';
import { characterPropertyAnswerChanges } from '../characterProperties';
import { forClassFeaturesField } from '../declaredFeature';
import { resolveSizeCat, sizeChoiceId } from '../speciesSize';
import { applyAsi } from './backgroundAsi';
import { equipmentIndex } from './startingEquipment';
import { ftToMVal, matchItem } from '$lib/itemLibrary';
import { ABILITY_KEYS, type AbilityScores } from './pointBuy';
import type { CharacterWizard } from './characterWizard.svelte';

/**
 * `character.speed` ist eine reine Meterzahl (der Editor lässt nichts anderes zu, der Bogen
 * hängt das „m" selbst an). Das Speed-Merkmal liefert aber Prosa: „9 Meter" / „30 feet".
 * Die deutsche Seite ist bereits metrisch, die englische wird umgerechnet — sonst stünden
 * 30 Fuß als „30 Meter" im Bogen.
 */
function metersFromSpeedText(de?: string, en?: string): string {
  const deNum = (de ?? '').match(/\d+(?:[.,]\d+)?/)?.[0];
  if (deNum) return deNum.replace('.', ',');
  const feet = (en ?? '').match(/\d+(?:\.\d+)?/)?.[0];
  return feet ? String(ftToMVal(parseFloat(feet))).replace('.', ',') : '';
}

/** Leerer Charakter im aktuellen Schemaformat (wie `Sidebar.createCharacter`). */
function blankCharacter(name: string): Character {
  return {
    _version: CHARACTER_VERSION,
    name,
    classes: [], classLevel: '', playerName: '',
    backgroundRef: { sourceKey: '', name: '' }, background: '',
    species: { sourceKey: '', name: '' }, race: '', xp: '',
    str: 10, ges: 10, kon: 10, int: 10, wei: 10, cha: 10,
    strMod: 0, gesMod: 0, konMod: 0, intMod: 0, weiMod: 0, chaMod: 0,
    ac: '', initiative: '', speed: '', hpMax: '', hpCurrent: '', hpTemp: '',
    proficiencyBonus: 2, passivePerception: '', hitDice: '',
    strSaveProf: false, gesSaveProf: false, konSaveProf: false,
    intSaveProf: false, weiSaveProf: false, chaSaveProf: false,
    skills: {},
    attacks: [],
    classFeatures: '', traits: '', ideals: '', bonds: '', flaws: '',
    languages: [], tools: [], alleskoenner: false,
    currency: { km: '', sm: '', em: '', gm: '', pm: '' },
    inventory: [], inventoryNotes: '', totalWeight: '',
    spells: emptySpells(),
    personal: emptyPersonal(),
    proficiencies: emptyProficiencies(),
    masteries: [],
    features: [],
  };
}

/** Baut den vollständigen Charakter aus dem Wizard-Zustand. */
export async function buildWizardCharacter(w: CharacterWizard): Promise<Character> {
  const c = blankCharacter(w.name.trim() || 'Neuer Charakter');
  const [prog, spec] = await Promise.all([
    getProgressionByKey(w.klass.sourceKey),
    w.species.sourceKey ? getSpeciesByKey(w.species.sourceKey) : Promise.resolve(null),
  ]);

  // ── Links + Anzeige-Strings ──
  c.classes = [{
    sourceKey: w.klass.sourceKey,
    name: w.klass.name,
    ...(w.klass.subclassKey ? { subclassKey: w.klass.subclassKey, subclassName: w.klass.subclassName } : {}),
    level: 1,
  }];
  c.species = {
    sourceKey: w.species.sourceKey,
    name: w.species.name,
    ...(w.species.subspeciesKey ? { subspeciesKey: w.species.subspeciesKey, subspeciesName: w.species.subspeciesName } : {}),
  };
  c.backgroundRef = { sourceKey: w.background.sourceKey, name: w.background.name };
  c.classLevel = formatClassLevel(c.classes);
  c.race = formatSpecies(c.species);
  c.background = w.background.name;

  // ── Bogenwerte der Spezies (deutsch aus den Merkmalen; die Felder selbst sind leer) ──
  const speedTrait = spec?.traits.find((t) => /(_speed$|^speed$)/i.test(t.key) || t.name.toLowerCase() === 'speed');
  c.speed = metersFromSpeedText(speedTrait?.descDe, speedTrait?.desc || spec?.speed);
  const declaredAnswerOf = (id: string): string => w.declaredAnswers.find((a) => a.id === id)?.choice ?? '';
  c.personal.sizeCat = resolveSizeCat(spec?.traits ?? [], declaredAnswerOf(sizeChoiceId(spec?.key ?? '')));

  // ── Attribute: Point-Buy → Hintergrund-ASI → (Rider-Erhöhungen weiter unten) ──
  let scores: AbilityScores = applyAsi(w.scores, w.asi);
  const inc = w.effects.result?.riders?.reduce<Record<AbilityKey, number>>(
    (acc, r) => { for (const k of ABILITY_KEYS) acc[k] += r.abilityScoreIncrease[k] ?? 0; return acc; },
    { str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 },
  );
  if (inc) scores = ABILITY_KEYS.reduce((s, k) => ({ ...s, [k]: s[k] + inc[k] }), scores);

  for (const k of ABILITY_KEYS) {
    c[k] = scores[k];
    c[`${k}Mod` as const] = mod(scores[k]);
  }

  // ── HP Stufe 1 + Trefferwürfel (deterministisch + fortlaufende Merkmals-Effekte) ──
  // Trefferwürfel-Max + KON-Mod + pro-Stufe-Boni (Zäh, Zwergische Zähigkeit) einmal für Stufe 1.
  const hitDie = prog?.hitDie ?? 0;
  if (hitDie > 0) {
    c.hitDice = `1W${hitDie}`;
    c.hpMax = String(Math.max(1, hitDie + mod(scores.kon) + w.hpPerLevelBonus()));
    c.hpCurrent = c.hpMax;
  }

  // ── Übungen: verlinkte Artefakte + eigene Wahl + Rider, alles über EINE Senke ──
  // Die Assembly wendete dieselben Daten früher von Hand an, während der Aufstieg über
  // `Change[]` ging. Zwei Senken, die auseinanderliefen: die des Aufstiegs verlor
  // Rettungswürfe, Werkzeuge, Sprachen und die eingeschränkten Waffen-Übungen still.
  // Jetzt bauen beide Flows Changes und `applyChanges` wendet sie an.
  const grants = await collectGrants({
    classes: c.classes,
    species: { sourceKey: w.species.sourceKey, subspeciesKey: w.species.subspeciesKey },
    backgroundRef: { sourceKey: w.background.sourceKey },
  });
  // Die Zeilen müssen VOR dem Applier stehen: der setzt Häkchen an bestehenden Zeilen,
  // er legt keine an (am Bogen existieren sie immer, hier entstehen sie gerade erst).
  for (const def of SKILL_DEFS) c.skills[def.key] = { value: 0, prof: false, exp: false };

  // Der GETTER, nicht das rohe Job-Ergebnis: er hängt die Rider der deklarierten
  // Zweigwahlen an (Urtümlicher Orden → Kriegswaffen), die kein Modell geliefert hat.
  const riders = w.riders;
  applyChanges(
    c,
    [
      ...proficiencyGrantChanges(
        {
          // Feste Grants und die im Fertigkeitsschritt getroffene Wahl sind am Charakter
          // dasselbe Häkchen — die Provenienz bleibt in `collectGrants`, nicht am Bogen.
          skills: { fixed: [...grants.skills.map((g) => g.value), ...(w.chosenSkills as SkillName[])], choose: 0, from: [] },
          savingThrows: grants.savingThrows.map((g) => g.value),
          weapons: grants.weapons.map((g) => g.value),
          weaponsOther: grants.weaponsOther.map((g) => g.value),
          armor: grants.armor.map((g) => g.value),
        },
        { step: 'wizard-links', source: 'library-link' },
      ),
      ...riderGrantChanges(riders, { step: 'wizard-features', source: 'class-feature' }),
      // Was die Deklaration gewährt, der Rider aber nicht tragen kann (eingeschränkte
      // Waffen-Übungen, Grundeigenschaften) — im Aufstieg macht das `buildDoc` an derselben
      // Stelle. Steht bewusst NACH `c.speed`/`c.personal.sizeCat` oben: der deklarierte Wert
      // überschreibt den geparsten, Reihenfolge ist der Vorrang.
      ...declaredGrantChanges(w.declared, { step: 'wizard-features', source: 'class-feature' }),
      ...characterPropertyAnswerChanges(w.declared, declaredAnswerOf, {
        step: 'wizard-features',
        source: 'species-trait',
      }),
    ],
    { classIndex: 0 },
  );

  // ── Fertigkeitswerte aus den gesetzten Häkchen (Attribut-Mod + Übungsbonus, Expertise ×2) ──
  const profBonus = c.proficiencyBonus;
  for (const def of SKILL_DEFS) {
    const row = c.skills[def.key];
    const attrMod = mod(scores[def.attr]);
    row.value = row.prof ? attrMod + profBonus * (row.exp ? 2 : 1) : attrMod;
  }

  // ── Merkmals-Ledger: getroffene Aufbau-Entscheidungen (KI-Analyse UND deklarierte) ──
  // Beide Kanäle, weil beide Aufbau-Entscheidungen sind: der Zauber-Zugang eines Talents
  // (Liste, Attribut) ist so dauerhaft wie eine Subklassen-Wahl. Zauber-Wahlen tragen
  // `isBuildDecision: false` — die gewählten Zauber stehen im Zauber-Block.
  const keyById = new Map(w.featureChoices.map((ch) => [ch.id, ch]));
  for (const rc of [...w.resolvedChoices, ...w.declaredAnswers]) {
    const ch = keyById.get(rc.id);
    // `choice` englisch (Prompt-Kanal späterer Stufen), `choiceDe` als Anzeige.
    if (ch?.isBuildDecision && ch.featureKey)
      c.features.push({
        sourceKey: ch.featureKey,
        name: '',
        choice: rc.choice,
        choiceDe: choiceLabelsDe(ch, rc.choice),
        gainedAt: 1,
        desc: '',
      });
  }

  // ── Zauber-Block: Klassenwerte (det.) → eigene Wahl → gewährte Zauber aus Merkmalen ──
  const slug = w.klass.sourceKey.split('_').pop() ?? '';
  const abilityKey = CASTER_ABILITY_KEY[slug];
  if (prog && prog.casterType !== 'NONE' && abilityKey) {
    const abilityMod = mod(scores[abilityKey]);
    c.spells.spellcastingClass = w.klass.name;
    c.spells.spellcastingAbility = CASTER_ABILITY_DE[abilityKey];
    c.spells.autoCalc = true;
    c.spells.saveDC = spellSaveDC(profBonus, abilityMod);
    c.spells.attackBonus = spellAttackBonus(profBonus, abilityMod);
    c.spells.slots = spellSlotsAt(prog, 1).map((total) => ({ total, used: 0 }));
  }

  // Nur Picks zu Wahlen, die es JETZT noch gibt: wer im Merkmals-Schritt die Zauberliste
  // wechselt (oder dessen Analyse neu lief), lässt sonst die Zauber der alten Liste im
  // Zustand zurück — sie würden hier stumm mit auf den Bogen wandern.
  const livePickIds = new Set(w.spellPickChoices.map((c) => c.id));
  const featurePicks = Object.entries(w.featureSpellPicks)
    .filter(([id]) => livePickIds.has(id))
    .flatMap(([, picks]) => picks);
  const hasPicks =
    w.pickedCantrips.length > 0 || w.pickedKnown.length > 0 || featurePicks.length > 0;
  // Merkmale mit deklarierter Zauberliste (Abstammung, Talent). Vorgefiltert, damit ein
  // Nicht-Zauberwirker ohne solche Deklaration die Bibliothek nicht lädt.
  const spellGrantFeatures = w.declared.filter(isSpellGrantFeature);
  if (hasPicks || riders.length || spellGrantFeatures.length) {
    // Zauber per Key an die Bibliothek binden (wie inventory[].sourceKey); Namens-Fallback
    // bleibt, wenn kein eindeutiger Key auflöst. Index einmal für beide Zweige.
    const spellLib = await getSpellLibrary();
    const spellIndex = buildSpellIndex(spellLib);
    const linkRef = (name: string): { sourceKey?: string } => {
      const hit = matchSpell(spellIndex, { name });
      const unique = !spellIndex.ambiguous.has(name.trim().toLowerCase());
      return hit?.key && unique ? { sourceKey: hit.key } : {};
    };

    // Die eigene Wahl zuerst — ihre Namen sind bereits kanonisch (aus der Bibliothek
    // gewählt), sie legt also die Vorbereitungs-Markierung fest. Ein Zauber, der DANACH
    // noch als gewährt hereinkommt, überschreibt sie nicht.
    if (hasPicks) {
      const offer = await spellcastingOffer({
        classKey: w.klass.sourceKey,
        klasseName: w.klass.name,
        level: 1,
      });
      const sel = buildSpellSelection({
        regime: offer.regime,
        cantripPicks: w.pickedCantrips,
        knownPicks: w.pickedKnown,
        preparedPicks: w.pickedPrepared,
        featurePicks,
      });
      c.spells.cantrips = sel.cantrips.map((name) => ({ name, ...linkRef(name) }));
      for (const [level, entries] of sel.byLevel)
        c.spells.byLevel[String(level)] = entries.map((e) => ({ name: e.name, prepared: e.prepared, ...linkRef(e.name) }));
    }

    // Gewährte Zauber (Elfenlinie, Domänenzauber …): stets vorbereitet, zählen nicht gegen
    // das Kontingent. Namen kommen vom LLM und müssen erst kanonisiert werden.
    if (riders.length) {
      const validated = validateRiderSpells(riders, spellLib, w.klass.name);
      for (const name of validated.grantedCantrips)
        if (!c.spells.cantrips.some((e) => e.name === name)) c.spells.cantrips.push({ name, ...linkRef(name) });
      for (const { level, name } of validated.grantedPrepared) {
        const lvl = String(level);
        const arr = c.spells.byLevel[lvl] ?? [];
        const seen = arr.find((e) => e.name === name);
        if (seen) seen.prepared = true;
        else arr.push({ name, prepared: true, ...linkRef(name) });
        c.spells.byLevel[lvl] = arr;
      }
    }

    // Deklarierte Zauberlisten auf Charakterstufe 1 — über dieselbe Senke wie der Aufstieg
    // (`declaredSpellChanges` → `applyChanges`) statt einer dritten Hand-Anwendung. ZULETZT,
    // weil die eigene Wahl die Vorbereitungs-Markierung festlegt; der Applier dedupliziert.
    if (spellGrantFeatures.length) {
      applyChanges(c, declaredSpellChanges(resolveDeclaredSpells(spellGrantFeatures, 1, spellLib, w.klass.name)), {
        classIndex: 0,
        resolveSpellKey: (name) => linkRef(name).sourceKey,
      });
    }
  }

  // ── Waffenmeisterschaft (deterministisch, im Wizard gewählt) ──
  c.masteries = [...w.masteries];

  // ── Kampfstile (deterministisch, im Wizard gewählt) → Talent-Links im Merkmals-Ledger ──
  // Ein Kampfstil ist ein echtes Talent (z.B. Verteidigung), daher ein Link per sourceKey —
  // NICHT ein bloßer Name wie bei der Waffenbeherrschung. Die Mechanik löst der Bogen wie
  // bei jedem Talent-Link auf.
  if (w.fightingStyles.length) {
    const feats = await getFeats();
    for (const key of w.fightingStyles) {
      const feat = feats.find((f) => f.sourceKey === key);
      c.features.push({ sourceKey: key, name: feat ? featDisplayName(feat) : '', choice: '', choiceDe: '', gainedAt: 1, desc: '' });
    }
  }

  // ── Merkmals-Text (KI) + die deterministische Zeile deklarierter Zauber-Zugänge ──
  // Dieselbe Funktion wie im Aufstieg: der Zugang hat keinen Rider, der eine Notiz schreiben
  // könnte, und ohne die Zeile stünde das gewählte Attribut nirgends auf dem Bogen.
  const accessNotes = spellAccessNoteLines(
    w.spellAccess,
    Object.fromEntries(w.declaredAnswers.map((a) => [a.id, a.choice])),
  );
  // `forClassFeaturesField` ist die EINZIGE Stelle, an der die Herkunft entscheidet.
  const branchNotes = optionListNoteLines(w.declared.filter(forClassFeaturesField), declaredAnswerOf);
  c.classFeatures = [w.classText.result?.text?.trim() ?? '', ...branchNotes, ...accessNotes]
    .filter(Boolean)
    .join('\n');
  c.personal.rassenmerkmale = w.speciesText.result?.text?.trim() ?? '';

  // ── Ausrüstung (gewählte Optionen der KI-Aufbereitung) ──
  const eq = w.selectedEquipment();
  if (eq.items.length || eq.goldPieces > 0) {
    // Verfehlt der KI-gelieferte Name die Bibliothek, bleibt die Zeile Freitext.
    const index = await equipmentIndex();
    c.inventory = eq.items.map((i) => {
      const lib = matchItem(index, { name: i.name });
      // Mehrdeutig → kein Link: welcher Gleichnamige gemeint ist, entscheidet der Nutzer.
      const unique = !index.ambiguous.has(i.name.trim().toLowerCase());
      return {
        name: i.name,
        ...(lib?.key && unique ? { sourceKey: lib.key } : {}),
        count: i.count > 1 ? String(i.count) : '',
        weight: typeof lib?.weight === 'number' ? String(lib.weight) : '',
      };
    });
    if (eq.goldPieces > 0) c.currency.gm = String(eq.goldPieces);
  }

  return c;
}
