/**
 * Der Encounter-Druck muss dieselben Monster finden wie die Karte — OHNE LLM.
 *
 * Er liest die ECHTEN Vault-Encounter über den fs-Shim. Im Bestand liegt KEIN Monster flach
 * in `vault/monsters`, alle stecken in Typ-Unterordnern: ein flach-only-Pfad findet global
 * also gar keines. Genau das war der Fehler.
 *
 *   npm run test -- encounterPrintMonsters
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPrintMonsters } from '../../src/lib/services/encounterPrint';
import { globalMonsterCandidates, findGlobalMonsterPath, MONSTERS_PATH } from '../../src/lib/monsterLibrary';
import type { Encounter } from '../../src/lib/types';

interface VaultEncounter {
  file: string;
  encounter: Encounter;
  /** Wie die Karte ihn übergibt; fehlt bei kampagnenweiten Encountern ohne Akt. */
  actMonsterBasePath?: string;
}

function vaultEncounters(dir = 'vault/campaigns', out: VaultEncounter[] = []): VaultEncounter[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) vaultEncounters(full, out);
    else if (e.name.endsWith('.json') && dir.replace(/\\/g, '/').endsWith('/encounters')) {
      const act = full.match(/^(vault\/campaigns\/[^/]+\/acts\/[^/]+)\//);
      out.push({
        file: full,
        encounter: JSON.parse(readFileSync(full, 'utf8')) as Encounter,
        actMonsterBasePath: act ? `./${act[1]}/monsters` : undefined,
      });
    }
  }
  return out;
}

const slugsOf = (e: Encounter) => (e.monsters ?? []).map((m) => m.slug).filter(Boolean);

describe('Monster-Auflösung für den Encounter-Druck', () => {
  const encounters = vaultEncounters();

  it('findet im Bestand Encounter mit Monstern', () => {
    expect(encounters.some((e) => slugsOf(e.encounter).length > 0)).toBe(true);
  });

  it('probiert den flachen Pfad zuerst und dann jede Gruppe', async () => {
    const paths = await globalMonsterCandidates('wolf');
    expect(paths[0]).toBe(`${MONSTERS_PATH}/wolf.json`);
    expect(paths).toContain(`${MONSTERS_PATH}/tiere/wolf.json`);
  });

  /**
   * Der eigentliche Regressionsschutz: mindestens ein Slug, den es NUR im Gruppen-Unterordner
   * gibt, muss ankommen. Mit dem alten flach-only-Pfad wäre diese Liste leer.
   */
  it('lädt global gruppierte Monster, nicht nur flach abgelegte', async () => {
    const resolved: string[] = [];
    for (const { encounter, actMonsterBasePath } of encounters) {
      const grouped = slugsOf(encounter).filter(
        (s) => !existsSync(`${MONSTERS_PATH}/${s}.json`.slice(2)) && !!findGrouped(s),
      );
      if (!grouped.length) continue;
      const loaded = await loadPrintMonsters(encounter, actMonsterBasePath);
      for (const s of grouped) {
        if (loaded.find((l) => l.slug === s)?.monster) resolved.push(s);
      }
    }
    expect(resolved.length).toBeGreaterThan(0);
  });

  it('lässt genau die Slugs als Lücke, zu denen keine Datei existiert', async () => {
    const gaps: string[] = [];
    const unreachable: string[] = [];
    for (const { file, encounter, actMonsterBasePath } of encounters) {
      for (const s of slugsOf(encounter)) {
        const actFile = actMonsterBasePath ? `${actMonsterBasePath}/${s}.json`.slice(2) : null;
        const reachable = (actFile && existsSync(actFile)) || !!findGrouped(s) || existsSync(`vault/monsters/${s}.json`);
        if (!reachable) unreachable.push(`${file}: ${s}`);
      }
      const loaded = await loadPrintMonsters(encounter, actMonsterBasePath);
      for (const entry of loaded) if (!entry.monster) gaps.push(`${file}: ${entry.slug}`);
    }
    expect([...new Set(gaps)].sort()).toEqual([...new Set(unreachable)].sort());
  });

  it('meldet einen unbekannten Slug als Lücke, statt zu werfen', async () => {
    expect(await findGlobalMonsterPath('gibt-es-nicht')).toBeNull();
    const loaded = await loadPrintMonsters(
      { name: 'x', monsters: [{ slug: 'gibt-es-nicht', count: 1, notes: '' }] } as Encounter,
      undefined,
    );
    expect(loaded[0].monster).toBeNull();
  });
});

function findGrouped(slug: string): string | null {
  for (const e of readdirSync('vault/monsters', { withFileTypes: true })) {
    if (e.isDirectory() && existsSync(`vault/monsters/${e.name}/${slug}.json`)) return e.name;
  }
  return null;
}
