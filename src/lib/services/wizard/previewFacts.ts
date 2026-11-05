/** Was der entstehende Charakter mitbringt, als Gruppen der Wizard-Seitenleiste — dieselben Auflöser wie der Bogen. */
import type { Character } from '$lib/schemas/characterSchema';
import type { Fact, FactGroup } from '$lib/components/ui/factList';
import { getBackgroundByKey } from '$lib/backgroundsLibrary';
import { getSpellLibrary, spellInfoByKey } from '$lib/spellLibrary';
import { resolveCharacterFeatures, type ResolvedFeatureGroup } from '../characterFeatures';
import { featInstances } from '../declaration/featInstances';
import { ownedGrantFeatures } from '../hitPoints';
import { characterMovement } from '../movement';
import { characterDefenses } from '../defenses';
import { effectiveProficiencyBonus } from '../classProgression';

const text = (t: string): Fact => ({ kind: 'text', text: t });
const group = (heading: string, facts: Fact[]): FactGroup[] => (facts.length ? [{ heading, facts }] : []);

function origin(c: Character): Fact[] {
  const sub = c.species.subspeciesName?.trim();
  const classes = c.classes
    .filter((k) => k.name.trim())
    .map((k) => (k.subclassName?.trim() ? `${k.name} (${k.subclassName})` : k.name));
  return [
    ...(c.species.name.trim() ? [text(`Volk: ${c.species.name}${sub ? ` (${sub})` : ''}`)] : []),
    ...(c.backgroundRef.name.trim() ? [text(`Hintergrund: ${c.backgroundRef.name}`)] : []),
    ...(classes.length ? [text(`Klasse: ${classes.join(' / ')}`)] : []),
  ];
}

async function feats(c: Character): Promise<Fact[]> {
  const [instances, bg] = await Promise.all([
    featInstances(c.features, c.backgroundRef),
    c.backgroundRef.sourceKey ? getBackgroundByKey(c.backgroundRef.sourceKey) : null,
  ]);
  return instances.map((i) => ({
    kind: 'feat',
    prefix: i.featureKey === bg?.featKey && !i.grantedBy ? 'Herkunftstalent: ' : '',
    feat: i.entry,
  }));
}

/** Der Hintergrund fehlt: seine Vorteile stehen schon als Werte oben, sein Talent unter „Talente". */
const featureGroups = (groups: ResolvedFeatureGroup[]): FactGroup[] =>
  groups.flatMap((g) => group(g.title, g.features
    .filter((f) => f.name.trim())
    .map((f) => ({ kind: 'feature', name: f.name, text: f.desc, choice: f.choice }))));

async function spells(c: Character): Promise<Fact[]> {
  const keys = [
    ...Object.values(c.spellcasting.sources).flatMap((s) => Object.values(s.picks).flat()),
    ...(c.spellcasting.manual?.extra ?? []),
  ];
  if (!keys.length) return [];
  const lib = await getSpellLibrary();
  return [...new Set(keys)]
    .map((key) => ({ key, info: spellInfoByKey(lib, key) }))
    .sort((a, b) => (a.info?.level ?? 0) - (b.info?.level ?? 0))
    .map(({ key, info }) => ({
      kind: 'spell',
      prefix: info?.level === 0 ? 'Zaubertrick: ' : `Grad ${info?.level ?? '?'}: `,
      name: info?.name ?? key,
      key,
    }));
}

export async function previewFacts(c: Character): Promise<FactGroup[]> {
  const [featFacts, resolved, spellFacts, owned] = await Promise.all([
    feats(c), resolveCharacterFeatures(c), spells(c), ownedGrantFeatures(c),
  ]);
  const movement = characterMovement(owned, null)
    .filter((l) => l.valueDe !== '+0 m')
    .map((l) => text(`${l.labelDe} ${l.valueDe}${l.whenDe ? ` – ${l.whenDe}` : ''} (${l.sourcesDe.join(', ')})`));
  const defenses = characterDefenses(owned, effectiveProficiencyBonus(c))
    .map((d) => text(`${d.textDe} (${d.labelDe})`));
  return [
    ...group('Herkunft', origin(c)),
    ...group('Talente', featFacts),
    ...featureGroups([...resolved.speciesGroups, ...resolved.classGroups]),
    ...group('Zauber', spellFacts),
    ...group('Bewegung & Sinne', movement),
    ...group('Resistenzen', defenses),
  ];
}
