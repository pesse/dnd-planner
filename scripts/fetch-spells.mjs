#!/usr/bin/env node
// Lädt alle D&D-Zauber von MythicalInk herunter und speichert sie als JSON im Vault.
// Ausführen: node scripts/fetch-spells.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT_DIR = path.join(__dirname, '..', 'vault', 'spells');
const BASE_URL = 'https://mythical.ink/de/rpg-tools/dnd-spell-list';

// Schulen auf deutsche Ordnernamen (entspricht MythicalInk-Bezeichnungen)
const SCHOOL_MAP = {
  abjuration:   'bannmagie',
  conjuration:  'beschwörung',
  divination:   'erkenntnismagie',
  enchantment:  'verzauberung',
  evocation:    'hervorrufung',
  illusion:     'illusionsmagie',
  necromancy:   'nekromantie',
  transmutation:'verwandlung',
};

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stripHtml(html) {
  if (!html) return null;
  return html
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchAllSpells() {
  const res = await fetch(BASE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DnD-Planner-Bot/1.0)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  // Next.js bettet alle Props in <script id="__NEXT_DATA__" type="application/json"> ein
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('__NEXT_DATA__ nicht gefunden – Seitenstruktur hat sich geändert');

  const data = JSON.parse(match[1]);
  const spells = data?.props?.pageProps?.sourceTable?.spells;
  if (!Array.isArray(spells)) throw new Error('Kein spells-Array unter props.pageProps.sourceTable.spells');
  return spells;
}

function transformSpell(raw) {
  return {
    name: raw.name,
    level: raw.level,             // "cantrip" oder "1"–"9"
    school: raw.school,           // Englisch (Originalwert für Konsistenz)
    casting_time: raw.casting_time,
    range: raw.range,
    components: {
      verbal:           raw.components?.verbal   ?? false,
      somatic:          raw.components?.somatic  ?? false,
      material:         raw.components?.material ?? false,
      materials_needed: raw.components?.materials_needed ?? null,
    },
    duration:     raw.duration,
    ritual:       raw.ritual ?? false,
    classes:      raw.classes ?? [],
    description:  stripHtml(raw.description),
    higher_levels: raw.higher_levels ? stripHtml(raw.higher_levels) : null,
    source:       raw.source,
  };
}

async function main() {
  console.log('Lade Zauberliste von MythicalInk...');
  const raw = await fetchAllSpells();
  console.log(`${raw.length} Zauber gefunden. Speichere...`);

  // Verzeichnisse anlegen
  for (const de of Object.values(SCHOOL_MAP)) {
    fs.mkdirSync(path.join(VAULT_DIR, de), { recursive: true });
  }
  fs.mkdirSync(path.join(VAULT_DIR, 'unbekannt'), { recursive: true });

  const counts = {};
  for (const spell of raw) {
    const school = SCHOOL_MAP[spell.school] ?? 'unbekannt';
    const filename = slugify(spell.name) + '.json';
    const filepath = path.join(VAULT_DIR, school, filename);
    fs.writeFileSync(filepath, JSON.stringify(transformSpell(spell), null, 2), 'utf-8');
    counts[school] = (counts[school] ?? 0) + 1;
  }

  console.log(`\n✓ ${raw.length} Zauber gespeichert unter vault/spells/`);
  console.log('\nOrdnerstruktur:');
  for (const [school, count] of Object.entries(counts).sort()) {
    console.log(`  ${school}/ (${count} Zauber)`);
  }
}

main().catch(err => { console.error('Fehler:', err); process.exit(1); });
