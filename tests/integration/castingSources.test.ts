/**
 * Zauberquellen gegen den ECHTEN Vault: `grantsCasting` an den Merkmalen → Kontingente,
 * Grade und Tauschtakte je Stufe.
 *
 *   npm run test -- castingSources
 */
import { describe, expect, it } from 'vitest';
import type { CharacterFeatureEntry } from '../../src/lib/schemas/characterSchema';
import { quotaContext, quotaViews, type QuotaView } from '../../src/lib/services/spellcasting/quota';
import {
  resolveCasting,
  type CastingCharacter,
  type CastingResolution,
} from '../../src/lib/services/spellcasting/resolve';
import { spellPools } from '../../src/lib/services/spellcasting/slots';
import { getSpellLibrary, resolveSpell } from '../../src/lib/spellLibrary';

/** Sources + Pools + Quotas zusammensetzen wird `state.ts` (Stufe 2 des Plans). */
async function resolveViews(c: CastingCharacter): Promise<{
  res: CastingResolution;
  views: Map<string, QuotaView[]>;
}> {
  const res = await resolveCasting(c);
  const lib = await getSpellLibrary();
  const spellKey = (name: string): string | undefined => resolveSpell(lib, name)?.key;
  const pools = spellPools(res.classes);
  const progOf = new Map(res.classes.map((k) => [k.prog.key, k.prog]));
  const views = new Map(
    res.sources.map((s) => [
      s.id,
      quotaViews(s, quotaContext(progOf.get(s.classKey) ?? null, s.level, pools, spellKey)),
    ]),
  );
  return { res, views };
}

const asClass = (sourceKey: string, level: number, subclassKey?: string): CastingCharacter => ({
  classes: [{ sourceKey, name: '', level, ...(subclassKey ? { subclassKey } : {}) }],
});

const answer = (sourceKey: string, choice: string): CharacterFeatureEntry => ({
  sourceKey, name: '', choice, choiceDe: '', choiceId: '', desc: '',
});

const link = (sourceKey: string, gainedAt = 1): CharacterFeatureEntry => ({
  sourceKey, name: '', choice: '', choiceDe: '', choiceId: '', desc: '', gainedAt,
});

const countsOf = (views: QuotaView[]): Record<string, number> =>
  Object.fromEntries(views.map((v) => [v.quotaId, v.count]));

const viewOf = (views: QuotaView[] | undefined, quotaId: string): QuotaView => {
  const hit = views?.find((v) => v.quotaId === quotaId);
  if (!hit) throw new Error(`Quota ${quotaId} fehlt (${views?.map((v) => v.quotaId).join(', ')})`);
  return hit;
};

/** Kontingente aus der Stufentabelle, Stand Vault. */
const CLASS_CASTING = [
  {
    key: 'srd-2024_bard',
    feature: 'srd-2024_bard_spellcasting',
    swap: { spells: 'level-up-one', cantrips: 'level-up-one' },
    counts: { 1: { cantrips: 2, prepared: 4 }, 5: { cantrips: 3, prepared: 9 }, 11: { cantrips: 4, prepared: 16 }, 20: { cantrips: 4, prepared: 22 } },
  },
  {
    key: 'srd-2024_cleric',
    feature: 'srd-2024_cleric_spellcasting',
    swap: { spells: 'long-rest-all', cantrips: 'level-up-one' },
    counts: { 1: { cantrips: 3, prepared: 4 }, 5: { cantrips: 4, prepared: 9 }, 11: { cantrips: 5, prepared: 16 }, 20: { cantrips: 5, prepared: 22 } },
  },
  {
    key: 'srd-2024_druid',
    feature: 'srd-2024_druid_spellcasting',
    swap: { spells: 'long-rest-all', cantrips: 'level-up-one' },
    counts: { 1: { cantrips: 2, prepared: 4 }, 5: { cantrips: 3, prepared: 9 }, 11: { cantrips: 4, prepared: 16 }, 20: { cantrips: 4, prepared: 22 } },
  },
  {
    key: 'srd-2024_sorcerer',
    feature: 'srd-2024_sorcerer_spellcasting',
    swap: { spells: 'level-up-one', cantrips: 'level-up-one' },
    counts: { 1: { cantrips: 4, prepared: 2 }, 5: { cantrips: 5, prepared: 9 }, 11: { cantrips: 6, prepared: 16 }, 20: { cantrips: 6, prepared: 22 } },
  },
  {
    key: 'srd-2024_warlock',
    feature: 'srd-2024_warlock_pact-magic',
    swap: { spells: 'level-up-one', cantrips: 'level-up-one' },
    counts: { 1: { cantrips: 2, prepared: 2 }, 5: { cantrips: 3, prepared: 6 }, 11: { cantrips: 4, prepared: 11 }, 20: { cantrips: 4, prepared: 15 } },
  },
  {
    key: 'srd-2024_wizard',
    feature: 'srd-2024_wizard_spellcasting',
    swap: { spells: 'long-rest-all', cantrips: 'long-rest-one' },
    counts: { 1: { cantrips: 3, book: 6, prepared: 4 }, 5: { cantrips: 4, book: 14, prepared: 9 }, 11: { cantrips: 5, book: 26, prepared: 16 }, 20: { cantrips: 5, book: 44, prepared: 25 } },
  },
  {
    // Halbe Zauberwirker haben keine Zaubertricks — die Quelle deklariert deshalb nur eine Quota.
    key: 'srd-2024_paladin',
    feature: 'srd-2024_paladin_spellcasting',
    swap: { spells: 'long-rest-one' },
    counts: { 1: { prepared: 2 }, 5: { prepared: 6 }, 11: { prepared: 10 }, 20: { prepared: 15 } },
  },
  {
    key: 'srd-2024_ranger',
    feature: 'srd-2024_ranger_spellcasting',
    swap: { spells: 'long-rest-one' },
    counts: { 1: { prepared: 2 }, 5: { prepared: 6 }, 11: { prepared: 10 }, 20: { prepared: 15 } },
  },
] as const;

describe('Zauberquellen der Klassen', () => {
  for (const entry of CLASS_CASTING) {
    for (const [level, counts] of Object.entries(entry.counts)) {
      it(`${entry.key} auf Stufe ${level}: Kontingente und Tauschtakt`, async () => {
        const { res, views } = await resolveViews(asClass(entry.key, Number(level)));
        expect(res.issues).toEqual([]);
        const own = views.get(entry.feature);
        expect(countsOf(own ?? [])).toEqual(counts);
        expect(viewOf(own, 'prepared').swap).toEqual(entry.swap);
        if ('cantrips' in counts) {
          expect(viewOf(own, 'cantrips').cast).toEqual([{ kind: 'at-will' }]);
          expect(viewOf(own, 'cantrips').levels).toEqual([0]);
        }
      });
    }
  }

  it('bindet das Zauberattribut je Klasse fest', async () => {
    const { res } = await resolveViews(asClass('srd-2024_wizard', 5));
    expect(res.sources[0].ability).toMatchObject({ fixed: 'Intelligence' });
    expect(res.sources[0].levelRef).toBe('class');
  });

  it('leitet die wählbaren Grade aus dem Platz-Pool ab', async () => {
    const l5 = await resolveViews(asClass('srd-2024_cleric', 5));
    expect(viewOf(l5.views.get('srd-2024_cleric_spellcasting'), 'prepared').levels).toEqual([1, 2, 3]);
    // Der Paladin hat auf Stufe 5 nur Grad 1–2 — die halbe Tabelle, nicht die Multiclass-Tabelle.
    const pal = await resolveViews(asClass('srd-2024_paladin', 5));
    expect(viewOf(pal.views.get('srd-2024_paladin_spellcasting'), 'prepared').levels).toEqual([1, 2]);
    // Der Hexenmeister wirkt mit seinem Paktplatz jeden Grad bis zu dessen Höhe.
    const lock = await resolveViews(asClass('srd-2024_warlock', 5));
    const prepared = viewOf(lock.views.get('srd-2024_warlock_pact-magic'), 'prepared');
    expect(prepared.levels).toEqual([1, 2, 3]);
    expect(prepared.cast).toEqual([{ kind: 'slots', pool: 'pact' }]);
  });
});

describe('Zauberbuch des Magiers', () => {
  it('ist ein Bestand, aus dem die Vorbereitung zieht', async () => {
    const { views } = await resolveViews(asClass('srd-2024_wizard', 5));
    const own = views.get('srd-2024_wizard_spellcasting');
    const book = viewOf(own, 'book');
    expect(book.tier).toBe('known');
    expect(book.pool.lists).toEqual(['wizard']);
    expect(book.swap.spells).toBe('none');

    const prepared = viewOf(own, 'prepared');
    expect(prepared.tier).toBe('prepared');
    expect(prepared.pool.from).toEqual({ sourceId: 'srd-2024_wizard_spellcasting', quotaId: 'book' });
    expect(prepared.pool.lists).toEqual([]);
  });

  it('wird erst durch Ritual Adept wirkbar', async () => {
    const { views } = await resolveViews(asClass('srd-2024_wizard', 5));
    expect(viewOf(views.get('srd-2024_wizard_spellcasting'), 'book').cast).toEqual([
      { kind: 'ritual', requiresPrepared: false },
    ]);
    // Ritual Adept hat keine eigene Quota und ist damit keine Quelle.
    expect([...views.keys()]).not.toContain('srd-2024_wizard_ritual-adept');
  });

  it('speist Spell Mastery und Signature Spells auf Stufe 18 und 20', async () => {
    const l18 = await resolveViews(asClass('srd-2024_wizard', 18));
    const mastery = viewOf(l18.views.get('srd-2024_wizard_spell-mastery'), 'mastery1');
    expect(mastery.pool.from).toEqual({ sourceId: 'srd-2024_wizard_spellcasting', quotaId: 'book' });
    expect(mastery.cast).toEqual([{ kind: 'at-will' }]);
    expect(l18.views.has('srd-2024_wizard_signature-spells')).toBe(false);

    const l20 = await resolveViews(asClass('srd-2024_wizard', 20));
    const signature = viewOf(l20.views.get('srd-2024_wizard_signature-spells'), 'signature');
    expect(signature.count).toBe(2);
    expect(signature.levels).toEqual([3]);
    expect(signature.cast).toEqual([
      { kind: 'uses', per: 'short-rest', count: 1 },
      { kind: 'slots', pool: 'standard' },
    ]);
  });
});

describe('Quotas über mehrere Stufen', () => {
  it('schaltet Mystic Arcanum Grad für Grad frei', async () => {
    const at = async (level: number): Promise<string[]> => {
      const { views } = await resolveViews(asClass('srd-2024_warlock', level));
      return (views.get('srd-2024_warlock_mystic-arcanum') ?? []).map((v) => v.quotaId);
    };
    expect(await at(10)).toEqual([]);
    expect(await at(11)).toEqual(['arcanum6']);
    expect(await at(15)).toEqual(['arcanum6', 'arcanum7', 'arcanum8']);
    expect(await at(20)).toEqual(['arcanum6', 'arcanum7', 'arcanum8', 'arcanum9']);

    const { views } = await resolveViews(asClass('srd-2024_warlock', 20));
    const arcanum = viewOf(views.get('srd-2024_warlock_mystic-arcanum'), 'arcanum9');
    expect(arcanum.levels).toEqual([9]);
    expect(arcanum.cast).toEqual([{ kind: 'uses', per: 'long-rest', count: 1 }]);
  });

  it('verbreitert den Barden-Pool ab Stufe 10, ohne einen Zauber zu gewähren', async () => {
    const l9 = await resolveViews(asClass('srd-2024_bard', 9));
    expect(viewOf(l9.views.get('srd-2024_bard_spellcasting'), 'prepared').pool.lists).toEqual(['bard']);
    expect(viewOf(l9.views.get('srd-2024_bard_spellcasting'), 'prepared').count).toBe(14);

    const l10 = await resolveViews(asClass('srd-2024_bard', 10));
    const prepared = viewOf(l10.views.get('srd-2024_bard_spellcasting'), 'prepared');
    expect(prepared.pool.lists).toEqual(['bard', 'cleric', 'druid', 'wizard']);
    expect(prepared.count).toBe(15);
  });

  it('gibt Magische Entdeckungen als eigenes Kontingent daneben', async () => {
    const { views, res } = await resolveViews(asClass('srd-2024_bard', 10, 'srd-2024_college-of-lore'));
    expect(res.issues).toEqual([]);
    const discoveries = viewOf(views.get('srd-2024_college-of-lore_magical-discoveries'), 'discoveries');
    expect(discoveries.count).toBe(2);
    expect(discoveries.pool.lists).toEqual(['cleric', 'druid', 'wizard']);
    // „a cantrip or a spell for which you have spell slots"
    expect(discoveries.levels).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('Zweigwahlen und Tabellen im Merkmalstext', () => {
  it('gewährt den Extra-Zaubertrick erst mit der beantworteten Wahl', async () => {
    const level = 1;
    const without = await resolveViews(asClass('srd-2024_cleric', level));
    expect(without.views.get('srd-2024_cleric_divine-order')).toEqual([]);

    const withAnswer = await resolveViews({
      ...asClass('srd-2024_cleric', level),
      features: [answer('srd-2024_cleric_divine-order', 'Thaumaturge')],
    });
    const cantrip = viewOf(withAnswer.views.get('srd-2024_cleric_divine-order'), 'thaumaturgeCantrip');
    expect(cantrip.count).toBe(1);
    expect(cantrip.pool.lists).toEqual(['cleric']);
    expect(cantrip.swap).toEqual({ cantrips: 'level-up-one' });
  });

  it('liest die Kreiszauber kumulativ aus der Tabelle im desc', async () => {
    const l3 = await resolveViews(asClass('srd-2024_druid', 3, 'srd-2024_circle-of-the-land'));
    const at3 = viewOf(l3.views.get('srd-2024_druid_circle-of-the-land_spell-list'), 'circleSpells');
    expect(at3.fixed).toBe(true);
    // Alle vier Landarten vereinigt.
    expect(at3.pool.keys).toContain('srd-2024_burning-hands');
    expect(at3.pool.keys).toContain('srd-2024_fog-cloud');
    expect(at3.pool.keys).not.toContain('srd-2024_fireball');
    expect(at3.count).toBe(at3.pool.keys.length);

    const l5 = await resolveViews(asClass('srd-2024_druid', 5, 'srd-2024_circle-of-the-land'));
    const at5 = viewOf(l5.views.get('srd-2024_druid_circle-of-the-land_spell-list'), 'circleSpells');
    expect(at5.pool.keys).toContain('srd-2024_fireball');
    expect(at5.count).toBeGreaterThan(at3.count);
  });

  it('zählt freie Wirkungen aus der Klassentabelle', async () => {
    const { views } = await resolveViews(asClass('srd-2024_ranger', 11));
    const mark = viewOf(views.get('srd-2024_ranger_favored-enemy'), 'huntersMark');
    expect(mark.pool.keys).toEqual(['srd-2024_hunters-mark']);
    expect(mark.cast).toEqual([
      { kind: 'uses', per: 'long-rest', count: { column: 'Favored Enemy' } },
      { kind: 'slots', pool: 'standard' },
    ]);
  });
});

describe('Quellen jenseits der Klasse', () => {
  it('indiziert Spezies-Zauber an der CHARAKTERstufe', async () => {
    const fairySorcerer: CastingCharacter = {
      classes: [{ sourceKey: 'srd-2024_sorcerer', name: '', level: 5 }],
      species: { sourceKey: 'phb-2024_fairy', name: '' },
    };
    const { res, views } = await resolveViews(fairySorcerer);
    const fairy = views.get('phb-2024_fairy_fairy-magic');
    expect(fairy?.map((v) => v.quotaId)).toEqual(['fairyCantrip', 'fairy3', 'fairy5']);
    expect(viewOf(fairy, 'fairy5').pool.keys).toEqual(['srd-2024_enlargereduce']);
    const source = res.sources.find((s) => s.id === 'phb-2024_fairy_fairy-magic');
    expect(source?.levelRef).toBe('character');
    expect(source?.ability?.choose).toEqual(['Intelligence', 'Wisdom', 'Charisma']);

    const l2 = await resolveViews({ ...fairySorcerer, classes: [{ sourceKey: 'srd-2024_sorcerer', name: '', level: 2 }] });
    expect(l2.views.get('phb-2024_fairy_fairy-magic')?.map((v) => v.quotaId)).toEqual(['fairyCantrip']);
  });

  it('trennt die Zweige der Elfenabstammung über die Antwort im Ledger', async () => {
    const { views } = await resolveViews({
      classes: [{ sourceKey: 'srd-2024_fighter', name: '', level: 5 }],
      species: { sourceKey: 'srd-2024_elf', name: '' },
      features: [answer('srd-2024_elf_elven-lineage', 'High Elf')],
    });
    const lineage = views.get('srd-2024_elf_elven-lineage');
    expect(lineage?.map((v) => v.quotaId)).toEqual(['lineageCantrip', 'lineage3', 'lineage5']);
    const cantrip = viewOf(lineage, 'lineageCantrip');
    expect(cantrip.pool.keys).toEqual(['srd-2024_prestidigitation']);
    // Vorgabe plus Tauschpool.
    expect(cantrip.pool.lists).toEqual(['wizard']);
    expect(cantrip.swap).toEqual({ spells: 'none', cantrips: 'long-rest-one' });
    expect(viewOf(lineage, 'lineage5').pool.keys).toEqual(['srd-2024_misty-step']);
  });

  it('bindet das Attribut eines Merkmals an das eines anderen', async () => {
    const { res } = await resolveViews({
      classes: [{ sourceKey: 'srd-2024_fighter', name: '', level: 5 }],
      species: { sourceKey: 'srd-2024_tiefling', name: '' },
      features: [answer('srd-2024_tiefling_fiendish-legacy', 'Infernal')],
    });
    expect(res.issues).toEqual([]);
    const presence = res.sources.find((s) => s.featureKey === 'srd-2024_tiefling_otherworldly-presence');
    expect(presence?.ability?.sameAs).toBe('srd-2024_tiefling_fiendish-legacy');
  });

  /**
   * Die Instanz-Id trägt die Vergabe-Stufe, nicht die Position im Ledger: nur so findet jede
   * Instanz ihre eigene Antwort und ihre eigene gespeicherte Auswahl wieder. Die früheste
   * behält den blanken Key, damit die Persistenz einer einmaligen Vergabe gültig bleibt.
   */
  it('führt ein zweimal genommenes Talent als zwei Quellen', async () => {
    const { res, views } = await resolveViews({
      classes: [{ sourceKey: 'srd-2024_fighter', name: '', level: 8 }],
      features: [link('srd-2024_magic-initiate', 4), link('srd-2024_magic-initiate', 1)],
    });
    const ids = res.sources.filter((s) => s.featureKey === 'srd-2024_magic-initiate').map((s) => s.id);
    expect(ids).toEqual(['srd-2024_magic-initiate', 'srd-2024_magic-initiate@4']);
    const first = views.get('srd-2024_magic-initiate');
    expect(countsOf(first ?? [])).toEqual({ cantrips: 2, spell1: 1 });
    expect(viewOf(first, 'cantrips').pool.listMode).toBe('choose-one');
    expect(viewOf(first, 'spell1').cast).toEqual([
      { kind: 'uses', per: 'long-rest', count: 1 },
      { kind: 'slots', pool: 'standard' },
    ]);
  });

  /** „A different list each time": jede Antwort gilt der Instanz, an deren Stufe sie steht. */
  it('gibt jeder Instanz ihre eigene Liste und ihr eigenes Attribut', async () => {
    const key = 'srd-2024_magic-initiate';
    const { res, views } = await resolveViews({
      classes: [{ sourceKey: 'srd-2024_fighter', name: '', level: 8 }],
      features: [
        link(key, 1),
        link(key, 4),
        { ...answer(key, 'wizard'), gainedAt: 1 },
        { ...answer(key, 'Intelligence'), gainedAt: 1 },
        { ...answer(key, 'cleric'), gainedAt: 4 },
        { ...answer(key, 'Wisdom'), gainedAt: 4 },
      ],
    });
    const abilityOf = (id: string) => res.sources.find((s) => s.id === id)?.ability?.fixed;
    expect([abilityOf(key), abilityOf(`${key}@4`)]).toEqual(['Intelligence', 'Wisdom']);
    expect(viewOf(views.get(key), 'cantrips').pool.lists).toEqual(['wizard']);
    expect(viewOf(views.get(`${key}@4`), 'cantrips').pool.lists).toEqual(['cleric']);
  });

  /**
   * Der Hintergrund legt die Liste seines Herkunftstalents fest („Weiser" ist immer Magier) —
   * zur LESEZEIT, nicht nur beim Erstellen. Sonst zeigte der Zauberblock die volle Union.
   */
  it('verengt die Liste des Herkunftstalents auf die Vorgabe des Hintergrunds', async () => {
    const { res, views } = await resolveViews({
      classes: [{ sourceKey: 'srd-2024_fighter', name: '', level: 4 }],
      backgroundRef: { sourceKey: 'srd-2024_sage', name: '' },
    });
    const source = res.sources.find((s) => s.featureKey === 'srd-2024_magic-initiate');
    expect(source?.id).toBe('srd-2024_magic-initiate');
    expect(viewOf(views.get('srd-2024_magic-initiate'), 'cantrips').pool.lists).toEqual(['wizard']);
  });

  it('meldet einen Zauberwirker ohne Deklaration, statt still nichts zu gewähren', async () => {
    const { res } = await resolveViews(asClass('srd-2024_wizard', 5));
    expect(res.issues).toEqual([]);
    const fighter = await resolveViews(asClass('srd-2024_fighter', 5));
    expect(fighter.res.issues).toEqual([]);
    expect(fighter.res.sources).toEqual([]);
  });
});
