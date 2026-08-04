#!/usr/bin/env python3
"""Bestandsaufnahme der Kommentare im Repo: Arbeitsliste + Fortschritts-Ledger für einen Sweep.

    python3 comment_inventory.py --init          # Ledger anlegen/auffrischen, Liste ausgeben
    python3 comment_inventory.py --todo 5        # nächste 5 offene Dateien
    python3 comment_inventory.py --mark PATH done|unchanged|skipped [--note "..."]
    python3 comment_inventory.py --status        # Fortschritt

Die Signale sind billig und absichtlich grob — sie ordnen die Arbeit, sie urteilen nicht.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

LEDGER = Path('.comment-review/ledger.json')
EXTS = {'.ts', '.tsx', '.svelte', '.js', '.rs'}
SKIP_PARTS = ('node_modules', 'dist', 'build', '.svelte-kit', 'target', 'src-tauri/gen')
SKIP_RE = re.compile(r'(\.d\.ts$|exampleObjects/|/vault/)')

COMMENT = re.compile(r'^\s*(//|/\*|\*|#(?!\!))')
BANNER = re.compile(r'^\s*(//|#)\s*[─=—*#-]{3,}|^\s*(//|#).*[─=—]{3,}')
CODEISH = re.compile(r'^\s*//\s*(const |let |var |function |return |import |if \(|for \(|await |\w+\(.*\);?\s*$|\}\s*$)')
MARKER = re.compile(r'\b(TODO|FIXME|XXX|HACK)\b')
DECL = re.compile(r'^\s*(export\s+)?(const|let|function|class|interface|type|enum|async|pub|fn)\b')


def tracked_files(root: Path) -> list[Path]:
    out = subprocess.run(['git', '-C', str(root), 'ls-files'], capture_output=True, text=True, check=True)
    files = []
    for rel in out.stdout.splitlines():
        if Path(rel).suffix not in EXTS or SKIP_RE.search('/' + rel):
            continue
        if any(part in rel for part in SKIP_PARTS):
            continue
        files.append(Path(rel))
    return files


def curated_files(root: Path) -> set[str]:
    """Dateien, die schon einmal in einem Kommentar-Commit lagen — dort ist Zurückhaltung die Erwartung."""
    out = subprocess.run(
        ['git', '-C', str(root), 'log', '--name-only', '--format=', '-i', '--grep=kommentar'],
        capture_output=True, text=True)
    return {line.strip() for line in out.stdout.splitlines() if line.strip()}


def scan(path: Path) -> dict:
    lines = path.read_text(encoding='utf-8', errors='replace').splitlines()
    stats = {'lines': len(lines), 'comment_lines': 0, 'blocks': 0,
             'banners': 0, 'long_blocks': 0, 'commented_code': 0, 'markers': 0, 'orphans': 0}
    in_block, block_len = False, 0
    for i, line in enumerate(lines):
        is_comment = bool(COMMENT.match(line))
        if is_comment:
            stats['comment_lines'] += 1
            if not in_block:
                stats['blocks'] += 1
                in_block, block_len = True, 0
            block_len += 1
            if BANNER.search(line):
                stats['banners'] += 1
            if CODEISH.match(line):
                stats['commented_code'] += 1
            if MARKER.search(line):
                stats['markers'] += 1
        elif in_block:
            if block_len > 3:
                stats['long_blocks'] += 1
            # Kommentar, dann Leerzeile, dann Deklaration: hängt an einer Gruppe, nicht an einer Sache
            if not line.strip() and i + 1 < len(lines) and DECL.match(lines[i + 1]):
                stats['orphans'] += 1
            in_block = False
    if in_block and block_len > 3:
        stats['long_blocks'] += 1
    return stats


def score(s: dict, curated: bool) -> int:
    """Grob: wo steht viel Kommentar mit auffälliger Form? Kuratiertes rutscht nach hinten."""
    v = (s['comment_lines'] + 6 * s['banners'] + 4 * s['commented_code']
         + 3 * s['markers'] + 2 * s['orphans'] + s['long_blocks'])
    return v // 3 if curated else v


def build(root: Path) -> list[dict]:
    curated = curated_files(root)
    rows = []
    for rel in tracked_files(root):
        s = scan(root / rel)
        if not s['comment_lines']:
            continue
        rows.append({'file': str(rel), 'curated': str(rel) in curated, **s,
                     'score': score(s, str(rel) in curated)})
    rows.sort(key=lambda r: -r['score'])
    return rows


def load_ledger(root: Path) -> dict:
    p = root / LEDGER
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else {'files': {}}


def save_ledger(root: Path, data: dict) -> None:
    p = root / LEDGER
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')


def fmt(rows: list[dict], ledger: dict) -> str:
    out = [f"{'Score':>5}  {'Komm':>4}  {'Sig':>3}  {'Status':<9}  Datei"]
    for r in rows:
        st = ledger['files'].get(r['file'], {}).get('status', 'offen')
        sig = r['banners'] + r['commented_code'] + r['markers'] + r['orphans']
        flag = ' *' if r['curated'] else ''
        out.append(f"{r['score']:>5}  {r['comment_lines']:>4}  {sig:>3}  {st:<9}  {r['file']}{flag}")
    out.append("\n* = liegt bereits in einem Kommentar-Commit; dort ist „bleibt“ das erwartete Urteil.")
    return '\n'.join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='.')
    ap.add_argument('--init', action='store_true')
    ap.add_argument('--todo', type=int, metavar='N')
    ap.add_argument('--mark', nargs=2, metavar=('PATH', 'STATUS'))
    ap.add_argument('--note', default='')
    ap.add_argument('--status', action='store_true')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    root = Path(a.root).resolve()

    if a.mark:
        path, status = a.mark
        if status not in ('done', 'unchanged', 'skipped', 'open'):
            print('Status: done | unchanged | skipped | open', file=sys.stderr)
            return 2
        led = load_ledger(root)
        led['files'][path] = {'status': status, 'note': a.note}
        save_ledger(root, led)
        print(f'{path}: {status}')
        return 0

    led = load_ledger(root)
    rows = build(root)
    if a.init:
        led['inventory'] = {r['file']: r['score'] for r in rows}
        save_ledger(root, led)

    if a.json:
        print(json.dumps({'rows': rows, 'ledger': led}, indent=2, ensure_ascii=False))
        return 0

    if a.status:
        done = sum(1 for r in rows if led['files'].get(r['file'], {}).get('status') in ('done', 'unchanged', 'skipped'))
        left = sum(r['comment_lines'] for r in rows if led['files'].get(r['file'], {}).get('status', 'offen') == 'offen')
        print(f'{done}/{len(rows)} Dateien erledigt, {left} Kommentarzeilen offen')
        return 0

    if a.todo:
        rows = [r for r in rows if led['files'].get(r['file'], {}).get('status', 'offen') == 'offen'][:a.todo]
    print(fmt(rows, led))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
