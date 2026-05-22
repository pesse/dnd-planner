#!/usr/bin/env node
/**
 * Migriert alle Zauber-JSON-Dateien in vault/spells/ auf das neue Schema:
 *
 *  - level: "1" | "cantrip" → level: number (0 = Zaubertrick)
 *  - description: string    → desc_de: [string]  +  desc: []
 *  - higher_levels: string  → higher_level_de: [string]
 *  - concentration          → false (wenn fehlt)
 *
 * Idempotent: bereits migrierte Dateien werden nicht doppelt konvertiert.
 *
 * Ausführen: node scripts/migrate-spells.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT_SPELLS = join(__dirname, '..', 'vault', 'spells');

let total = 0;
let changed = 0;

function migrateSpell(obj) {
  let dirty = false;

  // level: string → number
  if (typeof obj.level === 'string') {
    obj.level = (obj.level === 'cantrip' || obj.level === '0')
      ? 0
      : (parseInt(obj.level) || 0);
    dirty = true;
  }

  // description (alt) → desc_de
  if (typeof obj.description === 'string') {
    obj.desc_de = obj.desc_de ?? [obj.description];
    delete obj.description;
    dirty = true;
  }

  // higher_levels (alt) → higher_level_de
  if ('higher_levels' in obj) {
    if (obj.higher_levels) {
      obj.higher_level_de = obj.higher_level_de ?? [obj.higher_levels];
    }
    delete obj.higher_levels;
    dirty = true;
  }

  // Neue Pflichtfelder setzen (wenn fehlen)
  if (!('desc' in obj)) {
    obj.desc = [];
    dirty = true;
  }
  if (!('concentration' in obj)) {
    obj.concentration = false;
    dirty = true;
  }

  return dirty;
}

function walkDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkDir(full);
    } else if (entry.endsWith('.json')) {
      total++;
      try {
        const raw = readFileSync(full, 'utf8');
        const obj = JSON.parse(raw);
        const dirty = migrateSpell(obj);
        if (dirty) {
          writeFileSync(full, JSON.stringify(obj, null, 2) + '\n', 'utf8');
          changed++;
        }
      } catch (e) {
        console.error(`Fehler in ${full}: ${e.message}`);
      }
    }
  }
}

walkDir(VAULT_SPELLS);
console.log(`Migration abgeschlossen: ${changed} von ${total} Dateien aktualisiert.`);
