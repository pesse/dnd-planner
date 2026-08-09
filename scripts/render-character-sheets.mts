/**
 * Rendert Charakterbögen aus dem Repo-Vault als HTML-Dateien — dieselbe Kette wie der
 * Druck-Dialog (`print/character/`), nur ohne Tauri. Zum Ansehen im Browser, ohne die App
 * zu starten.
 *
 *   npm run sheets                    # alle Charaktere nach .sheets/, Server auf :8899
 *   npm run sheets -- 6c0699d48b20    # nur diese UIDs
 *   npm run sheets -- --no-serve
 *
 * Lauf über `vite-node -c vitest.config.ts`: von dort kommen beide Aliase (`$lib` und
 * `@tauri-apps/api/core` → Node-Shim der Teststrecke). Ein esbuild-Bündel täte es nicht —
 * das `?inline` an `ruleText.css` ist Vite-Syntax und käme dort leer an, der Regeltext
 * würde also unstyled drucken.
 */
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { characterSchema, type Character } from '$lib/schemas/characterSchema';
import { upgradeCharacter } from '$lib/schemas/characterUpgrades';
import { buildItemIndex, getItemsByDir, matchItem, type ItemInfo } from '$lib/itemLibrary';
import { DIR_TO_CATEGORY, masteryLabel } from '$lib/itemLabels';
import { coversWeapon, weaponNameSet } from '$lib/services/weaponProficiency';
import { loadCharacterPrintData } from '$lib/print/character/data';
import { buildCharacterSheetHtml } from '$lib/print/character/document';
import { defaultSelection, sheetSections } from '$lib/print/character/sections';

const CHARACTERS = './vault/characters';
const OUT = '.sheets';
const PORT = 8899;

const args = process.argv.slice(2);
const serve = !args.includes('--no-serve');
const uids = args.filter((a) => !a.startsWith('--'));

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.html': 'text/html; charset=utf-8',
};

const read = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

function portraitUrl(dir: string, file: string | undefined): string {
  if (!file) return '';
  try {
    const b64 = readFileSync(join(dir, file)).toString('base64');
    return `data:${MIME[extname(file).toLowerCase()] ?? 'image/png'};base64,${b64}`;
  } catch {
    return '';
  }
}

/** Derselbe Resolver wie in `CharacterSheet.svelte`: Eigenschaft am Item, Erlaubnis am Charakter. */
async function masteryResolver(character: Character): Promise<(name: string) => string | undefined> {
  const byDir: Record<string, ItemInfo[]> = {};
  for (const dir of Object.keys(DIR_TO_CATEGORY)) byDir[dir] = await getItemsByDir(dir);
  const index = buildItemIndex(byDir);
  const mastered = weaponNameSet(character.masteries ?? [], (n) => matchItem(index, { name: n }));
  return (name) => {
    const lib = matchItem(index, { name });
    return lib?.mastery && coversWeapon(mastered, lib) ? masteryLabel(lib.mastery) : undefined;
  };
}

async function renderSheet(uid: string): Promise<{ file: string; label: string }> {
  const dir = `${CHARACTERS}/${uid}`;
  const raw = JSON.parse(readFileSync(`${dir}/character.json`, 'utf8'));
  const character = characterSchema.parse(upgradeCharacter(raw).data);
  const data = await loadCharacterPrintData({
    character,
    portraitUrl: portraitUrl(dir, character.portraitFile),
    freetext: read(`${dir}/details.md`) ?? read(`${dir}/freitext.md`) ?? '',
    masteryOf: await masteryResolver(character),
  });

  const file = `${uid}.html`;
  writeFileSync(join(OUT, file), buildCharacterSheetHtml(data, defaultSelection(sheetSections(data))));
  return { file, label: `${character.name} — ${character.classLevel}` };
}

const indexPage = (sheets: { file: string; label: string }[]): string =>
  `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Charakterbögen</title>
<style>body{font:14px/1.6 system-ui;margin:2rem;background:#f4eddc}a{display:block;padding:.3rem 0}</style>
</head><body><h1>Charakterbögen</h1>
${sheets.map((s) => `<a href="${s.file}">${s.label}</a>`).join('\n')}</body></html>`;

mkdirSync(OUT, { recursive: true });
const targets = uids.length ? uids : readdirSync(CHARACTERS, { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name);

const sheets: { file: string; label: string }[] = [];
for (const uid of targets) {
  try {
    const sheet = await renderSheet(uid);
    sheets.push(sheet);
    console.log(`${OUT}/${sheet.file}  ${sheet.label}`);
  } catch (e) {
    console.error(`${uid}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
writeFileSync(join(OUT, 'index.html'), indexPage(sheets));

if (serve) {
  createServer((req, res) => {
    const name = (req.url ?? '/').split('?')[0].replace(/^\/+/, '') || 'index.html';
    const body = read(join(OUT, name));
    if (body === null) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(name).toLowerCase()] ?? 'text/plain' }).end(body);
  }).listen(PORT, () => console.log(`\nhttp://localhost:${PORT}/  (Strg-C beendet)`));
}
