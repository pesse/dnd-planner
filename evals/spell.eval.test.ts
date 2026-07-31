/**
 * Eval: Zauber anlegen / überarbeiten (createSpellAction, editSpellAction).
 *
 * Beispiel für eine SCHNELLE Strecke: ein Ein-Call-Prompt, Fälle direkt hier, keine
 * eigenen fixtures/cases-Dateien. Wächst der Fall (geladene Vault-Daten, mehrere
 * verkettete Calls), zieht man Fixture + Fälle nach `fixtures/` bzw. `cases/` um —
 * siehe featureEffects.
 *
 * Gemessen wird der echte Produktionspfad inkl. DnD-API-Tools, genau wie in
 * CreateCardModal/AiEditModal: `runAiAction(config, action, <Nutzereingabe>)`.
 *
 *   npm run eval -- --eval spell --runs 3
 */
import type { Spell } from '../src/lib/types';
import { createSpellAction, editSpellAction } from '../src/lib/services/aiActions/spellAction';
import { defineEval } from './defineEval';
import { inRange, mentions, minChars, nonEmpty, unchanged } from './checks';

/** Kleiner Homebrew-Zauber als Ausgangsstand für die Überarbeitung. */
const RANKENFESSEL: Spell = {
  name: 'Rankenfessel',
  name_en: 'Vine Snare',
  level: 2,
  school: 'conjuration',
  casting_time: '1 Aktion',
  range: '18 Meter',
  components: { verbal: true, somatic: true, material: false, materials_needed: null },
  duration: 'Konzentration, bis zu 1 Minute',
  concentration: true,
  ritual: false,
  classes: ['Druide', 'Waldläufer'],
  desc: [
    'Thorny vines erupt from the ground at a point you can see within range. ' +
      'A creature in that space must succeed on a Strength saving throw or be restrained.',
  ],
  desc_de: [
    'Dornige Ranken brechen an einem sichtbaren Punkt in Reichweite aus dem Boden. ' +
      'Eine Kreatur dort muss einen Rettungswurf auf Stärke bestehen oder wird festgesetzt.',
  ],
  source: 'homebrew-sam',
};

defineEval<Spell>({
  name: 'spell',
  description: 'Zauber per KI anlegen und überarbeiten — Schema-Treue, Vorgaben-Treue, Feld-Erhalt',
  cases: [
    {
      label: 'Anlage aus Beschreibung',
      action: () => createSpellAction({ name: 'Aschenregen' }),
      input:
        'Ein Zauber des 3. Grades aus der Schule der Hervorrufung: Über einem Punkt in Reichweite ' +
        'regnet glühende Asche herab und fügt Feuerschaden in einem Bereich zu. Rettungswurf auf ' +
        'Geschicklichkeit für halben Schaden. Wirkzeit 1 Aktion, Reichweite 36 Meter, keine Konzentration. ' +
        'Für Magier und Hexenmeister.',
      core: {
        'Name gesetzt': (s) => nonEmpty(s.name),
        'Grad 3': (s) => s.level === 3,
        'Schule evocation': (s) => s.school === 'evocation',
        'keine Konzentration': (s) => s.concentration === false,
        'Wirkzeit gefüllt': (s) => nonEmpty(s.casting_time),
        'Reichweite gefüllt': (s) => nonEmpty(s.range),
        'Beschreibung ≥ 150 Zeichen': (s) => minChars(s.desc, 150),
        'Beschreibung nennt Feuerschaden': (s) => mentions(s.desc, 'fire', 'feuer'),
      },
      soft: {
        'gewünschter Name übernommen': (s) => mentions(s.name, 'Aschenregen'),
        'deutsche Beschreibung vorhanden': (s) => nonEmpty(s.desc_de),
        'Klassen enthalten Magier/Wizard': (s) => mentions(s.classes, 'magier', 'wizard'),
        'Schadenswürfel hinterlegt': (s) => nonEmpty(Object.values(s.damage?.damage_at_slot_level ?? {})),
        'Rettungswurf auf Geschicklichkeit im dc-Feld': (s) => mentions(s.dc?.dc_type.index, 'dex', 'ges'),
      },
    },
    {
      label: 'Überarbeitung: Ritual + größere Reichweite',
      action: () => editSpellAction(RANKENFESSEL),
      input: 'Mach daraus einen Ritualzauber und erhöhe die Reichweite auf 27 Meter.',
      core: {
        'ritual gesetzt': (s) => s.ritual === true,
        'Reichweite auf 27 Meter': (s) => mentions(s.range, '27'),
        'Name unverändert': (s) => unchanged(RANKENFESSEL, s, 'name'),
        'Grad/Schule unverändert': (s) => unchanged(RANKENFESSEL, s, 'level', 'school'),
        'Konzentration + Komponenten unverändert': (s) =>
          unchanged(RANKENFESSEL, s, 'concentration', 'components'),
        'Beschreibung erhalten': (s) => minChars(s.desc, 100),
      },
      soft: {
        'Klassen unverändert': (s) => unchanged(RANKENFESSEL, s, 'classes'),
        'deutsche Beschreibung erhalten': (s) => nonEmpty(s.desc_de),
        'Grad weiterhin 1–9': (s) => inRange(s.level, 1, 9),
      },
    },
  ],
});
