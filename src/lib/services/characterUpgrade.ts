/**
 * Stapel-Upgrade aller Charaktere des Vaults.
 *
 * Die versionierte Pipeline selbst liegt im Schema (`schemas/character.ts`:
 * `CHARACTER_VERSION`, `CHARACTER_UPGRADES`, `upgradeCharacter`) und läuft ohnehin
 * bei jedem Laden. Dieses Modul macht daraus einen expliziten, sichtbaren Vorgang:
 * erst einen Plan über ALLE Dateien (was würde sich ändern?), dann auf Bestätigung
 * schreiben — damit nichts darauf wartet, dass ein Charakter irgendwann manuell
 * geöffnet und gespeichert wird.
 *
 * Geschrieben wird der MIGRIERTE ROHDATENSATZ, nicht die schema-normalisierte Form:
 * das Upgrade soll die Datei aktualisieren, nicht sie mit allen Schema-Defaults
 * aufblähen. Ein Charakter, an dem sich nichts ändert, wird nicht angefasst.
 */
import { invoke } from '@tauri-apps/api/core';
import { CHARACTER_VERSION, characterVersionOf, upgradeCharacter } from '$lib/schemas/character';

export const CHARACTERS_PATH = './vault/characters';

interface EntryInfo {
  name: string;
  is_dir: boolean;
}

export interface CharacterUpgradePlan {
  /** Verzeichnisname im Vault (= Ordner des Charakters). */
  dir: string;
  path: string;
  /** Anzeigename aus der Datei; Fallback ist der Verzeichnisname. */
  name: string;
  fromVersion: number;
  toVersion: number;
  /** Beschreibungen der Schritte, die dieser Charakter durchläuft. */
  applied: string[];
  /** true = die Datei würde sich beim Schreiben tatsächlich ändern. */
  changed: boolean;
  /** Gesetzt, wenn die Datei nicht gelesen/geparst werden konnte. */
  error?: string;
  /** Das Ergebnis des Upgrades — von `applyCharacterUpgrades` geschrieben. */
  data?: Record<string, unknown>;
}

/**
 * Liest jede `character.json` unter `vault/characters`, wendet die Pipeline
 * probeweise an und meldet je Charakter, was passieren würde. Schreibt nichts.
 */
export async function planCharacterUpgrades(): Promise<CharacterUpgradePlan[]> {
  let entries: EntryInfo[] = [];
  try {
    entries = await invoke<EntryInfo[]>('list_entries', { path: CHARACTERS_PATH });
  } catch {
    return [];
  }

  const plans = await Promise.all(
    entries
      .filter((e) => e.is_dir)
      .map(async (entry): Promise<CharacterUpgradePlan> => {
        const path = `${CHARACTERS_PATH}/${entry.name}/character.json`;
        const base = {
          dir: entry.name, path, name: entry.name,
          fromVersion: CHARACTER_VERSION, toVersion: CHARACTER_VERSION,
          applied: [], changed: false,
        };
        try {
          const raw = JSON.parse(await invoke<string>('read_file_content', { path })) as Record<string, unknown>;
          const result = upgradeCharacter(raw);
          return {
            ...base,
            name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : entry.name,
            fromVersion: characterVersionOf(raw),
            toVersion: result.toVersion,
            applied: result.applied,
            // Vergleich der geparsten Objekte: die Pipeline hängt neue Schlüssel nur
            // an, die Reihenfolge der bestehenden bleibt — also ist der Vergleich
            // aussagekräftig. Im Zweifel wird einmal zu viel geschrieben (idempotent).
            changed: JSON.stringify(raw) !== JSON.stringify(result.data),
            data: result.data,
          };
        } catch (e) {
          return { ...base, error: e instanceof Error ? e.message : String(e) };
        }
      }),
  );

  plans.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return plans;
}

export interface CharacterUpgradeReport {
  written: number;
  skipped: number;
  errors: string[];
}

/**
 * Schreibt die Charaktere aus dem Plan, bei denen sich etwas ändert. Formatierung
 * wie überall beim Charakter-Speichern (2 Leerzeichen Einrückung).
 */
export async function applyCharacterUpgrades(plans: CharacterUpgradePlan[]): Promise<CharacterUpgradeReport> {
  const report: CharacterUpgradeReport = { written: 0, skipped: 0, errors: [] };
  for (const plan of plans) {
    if (plan.error || !plan.changed || !plan.data) {
      report.skipped++;
      continue;
    }
    try {
      await invoke('write_file_content', { path: plan.path, content: JSON.stringify(plan.data, null, 2) });
      report.written++;
    } catch (e) {
      report.errors.push(`${plan.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return report;
}
