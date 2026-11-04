// node run.mjs prep <W> <N> <BATCH> <dir> | publish <dir> | mark <status> <nr>... — arbeitet todo.md ab
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const sharp = createRequire(join(HERE, '../sharp/package.json'))('sharp');
const TODO = join(HERE, 'todo.md');
const ART = join(ROOT, 'vault/art');
const RAW = join(ROOT, 'design/art/fixes');
const MAX_TRIES = 2;

const LINE = /^- \[(.)\] (\d{3}) (edit|neu)(\+ref)? · (\S+) · ([\d.]+)\/([\d.]+) · (.*)$/;
const parse = () =>
  readFileSync(TODO, 'utf8').split('\n').map((text) => {
    const m = LINE.exec(text);
    return m && { status: m[1], nr: m[2], mode: m[3], ref: !!m[4], path: m[5], x: m[6], y: m[7], note: m[8] };
  }).filter(Boolean);

function mark(status, nrs) {
  const set = new Set(nrs);
  const out = readFileSync(TODO, 'utf8').split('\n').map((text) => {
    const m = LINE.exec(text);
    return m && set.has(m[2]) ? text.replace(/^- \[.\]/, `- [${status}]`) : text;
  });
  writeFileSync(TODO, out.join('\n'));
  if (status === ' ') for (const nr of nrs) rmSync(join(RAW, 'tries', nr), { force: true });
}

const isIcon = (path) => /^(monsters|feats)\//.test(path);
const counterpart = (path) => {
  const [series, slug] = path.split('/');
  if (series === 'monster-scenes') return `monsters/${slug}`;
  if (series === 'monsters') return `monster-scenes/${slug}`;
  return null;
};
const tries = (nr) => Number(existsSync(join(RAW, 'tries', nr)) ? readFileSync(join(RAW, 'tries', nr), 'utf8') : 0);

async function toPng(avif, png, icon) {
  const img = sharp(join(ART, `${avif}.avif`));
  await (icon ? img.resize(1024, 1024) : img.resize(1024, 1536)).png().toFile(png);
}

const HAND_RULE = 'Hands: exactly five fingers (one thumb + four fingers), natural joints, the hand continuing the line of its forearm without a twisted wrist. Check handedness: for the figure\'s RIGHT hand the thumb is on the side facing the figure\'s body centre when the palm faces forward. A hand gripping a weapon or staff wraps all four fingers around the shaft with the thumb closing over them.';
// Ohne diese Geometrie setzt das Modell den gesenkten Bogen neben/hinter das Bein, Sehne zum Körper (Test 2026-11-04); die D-Form muss eigens dastehen, sonst wird der Stab S-förmig.
const BOW_RULE = 'Bows: a strung longbow is ONE smooth single arc like the letter D, farthest from the string at the grip in the middle and curving evenly toward the string at both ends; no S-curve, no kink or waist at the grip, no recurve. The hand closes around the stave at the grip. The string is one straight line from exactly the upper tip to exactly the lower tip (a V to the drawing hand when drawn). A bow held lowered at the side is on the camera side of the leg, overlapping it, and its string runs along the OUTER side of the forearm, away from the body.';
const BOOK_RULE = 'Books: the image model draws open books in perspective with impossible geometry. Unless the note insists on readable open pages, replace the book with a CLOSED thick tome (cover, spine and page-block edge clearly readable, a single coherent box shape). If it must stay open, draw it seen straight from the front, spine vertical in the middle, two equal page blocks fanning from the spine, the cover visible only behind both page blocks.';

function itemBrief(it, inputs) {
  const where = `around x ${it.x} %, y ${it.y} % of the image (measured from the top-left corner)`;
  const lines = [`### Item ${it.nr} → save as \`${it.nr}.png\``,
    `Original: \`in/${inputs.orig}\`${inputs.ref ? `; reference (${isIcon(it.path) ? 'the large scene painting' : 'the small library icon'} of the same creature): \`in/${inputs.ref}\`` : ''}${inputs.identity ? `; identity reference of this character: \`in/${inputs.identity}\`` : ''}.`,
    `Subject: ${it.path} (${it.path.split('/').slice(1).join(' / ')}).`,
    `User's review note (German, verbatim): „${it.note}"`,
    `The user clicked ${where}; that is where the problem is.`];
  if (it.mode === 'edit') {
    lines.push('Task: EDIT the original (give it to your image tool as the input image). Keep everything else identical: composition, framing, every figure\'s pose, faces, clothing, palette, lighting, background and painting style. Change ONLY what the note asks for.');
  } else {
    lines.push('Task: REPAINT this image from scratch as a new painting of the same subject, setting, palette and style (use the original as reference for content and style, not as an edit base). Fix what the note criticises with a clear, anatomically sound, readable pose. Keep the same drama and energy, do not make the scene tamer.');
    // Der alte Brief war widersprüchlich; das Original zeigt genau den Fehler, den er erzwungen hat.
    if (/Neuer Brief:/.test(it.note)) lines.push('The note contains a corrected brief ("Neuer Brief: …"). Paint the action, pose and held objects exactly as that brief says; where the original shows something different, the brief wins. Take only the character\'s identity, setting, palette and style from the original.');
  }
  if (inputs.ref) lines.push('Where the note refers to the small/large picture, match that reference image for the named features (face, clothing, colours, armour) while keeping this image\'s own composition and format.');
  if (/hand|finger|halt|arm/i.test(it.note)) lines.push(HAND_RULE);
  if (/buch|bücher/i.test(it.note)) lines.push(BOOK_RULE);
  if (/bogen|bögen|schütze|sehne/i.test(it.note)) lines.push(BOW_RULE);
  return lines.join('\n');
}

const HEAD = (icon) => `You are correcting paintings for a D&D app, one by one, from a user's review notes. For EACH item below make exactly one new image with your image generation tool and save it in the current directory under the given file name. Never touch any other file.

Format: ${icon ? '1024 × 1024 PNG with a TRANSPARENT background (real alpha), a single isolated motif, exactly like the original library icon. No backdrop, no ground, no frame.' : '1024 × 1536 portrait PNG with the original\'s edge treatment: the painting fades out into a cream parchment border with torn, brushy edges, exactly like the original.'}
Style: the original's own style — painterly D&D Player's Handbook illustration, rich colours, dramatic light. No text, letters or signatures anywhere.
Reading the notes: "links/rechts" for body parts means the depicted figure's OWN left/right unless the note says otherwise; the clicked position shows which part is meant. A note "ändere nur …" means: nothing else may change. Bodies: every figure has two arms and two legs that clearly attach to its torso; feet stand ON the ground (never sinking into it); weapon shafts and staffs are dead straight and rigid; nobody is hurt or hit on screen (show the moment before contact).
After saving each image, look at it and compare it with the note. If the fix did not land (e.g. still six fingers, the limb still missing), edit again before moving on.

Answer briefly: one line per item, "<nr>.png – what you changed". If copying a generated image into the directory fails, list at the end one line per file in the form \`<name>.png → <full raw path under generated_images>\`.
`;

async function prep(W, N, BATCH, dir) {
  const open = parse().filter((it) => it.status === ' ' && Number(it.nr) % N === W && tries(it.nr) < MAX_TRIES);
  if (!open.length) process.exit(3);
  const icon = isIcon(open[0].path);
  const batch = open.filter((it) => isIcon(it.path) === icon).slice(0, BATCH);
  const inDir = join(dir, 'in');
  mkdirSync(inDir, { recursive: true });
  mkdirSync(join(RAW, 'tries'), { recursive: true });
  const images = [], parts = [];
  for (const it of batch) {
    const inputs = { orig: `${it.nr}-original.png` };
    await toPng(it.path, join(inDir, inputs.orig), icon);
    images.push(join(inDir, inputs.orig));
    const cp = it.ref && counterpart(it.path);
    if (cp && existsSync(join(ART, `${cp}.avif`))) {
      inputs.ref = `${it.nr}-reference.png`;
      await toPng(cp, join(inDir, inputs.ref), isIcon(cp));
      images.push(join(inDir, inputs.ref));
    }
    const fig = it.path.match(/^figures\/([^/]+)\//)?.[1];
    if (it.mode === 'neu' && fig && existsSync(join(ART, `figures/${fig}/species.avif`))) {
      inputs.identity = `${it.nr}-identity.png`;
      await toPng(`figures/${fig}/species`, join(inDir, inputs.identity), false);
      images.push(join(inDir, inputs.identity));
    }
    parts.push(itemBrief(it, inputs));
    writeFileSync(join(RAW, 'tries', it.nr), String(tries(it.nr) + 1));
  }
  writeFileSync(join(dir, 'brief.md'), `${HEAD(icon)}\nThe attached images are, in order (also on disk under in/): ${images.map((p) => p.split("/").pop()).join(", ")}.\n\n${parts.join('\n\n')}\n`);
  writeFileSync(join(dir, 'images.txt'), images.join('\n'));
  writeFileSync(join(dir, 'items.txt'), batch.map((it) => it.nr).join('\n'));
}

// Rohbild → vault/art in Originalgröße; das alte AVIF bleibt für den Vorher/Nachher-Vergleich in design/art/fixes/old.
async function publish(dir) {
  const items = parse();
  const done = [];
  for (const name of readdirSync(dir).filter((n) => /^\d{3}\.png$/.test(n))) {
    const it = items.find((i) => i.nr === name.slice(0, 3));
    if (!it) continue;
    const dst = join(ART, `${it.path}.avif`);
    const { width, height } = await sharp(dst).metadata();
    mkdirSync(join(RAW, 'old'), { recursive: true });
    mkdirSync(join(RAW, 'out'), { recursive: true });
    const old = join(RAW, 'old', `${it.nr}.avif`);
    if (!existsSync(old)) copyFileSync(dst, old);
    await sharp(join(dir, name)).resize(width, height).avif({ quality: 55, effort: 5 }).toFile(`${dst}.tmp`);
    renameSync(`${dst}.tmp`, dst);
    renameSync(join(dir, name), join(RAW, 'out', name));
    done.push(it.nr);
  }
  if (done.length) mark('~', done);
  console.log(`veröffentlicht: ${done.join(' ') || '–'}`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'prep') await prep(Number(args[0]), Number(args[1]), Number(args[2]), args[3]);
else if (cmd === 'publish') await publish(args[0]);
else if (cmd === 'mark') mark(args[0], args.slice(1));
else { console.error('prep | publish | mark'); process.exit(1); }
