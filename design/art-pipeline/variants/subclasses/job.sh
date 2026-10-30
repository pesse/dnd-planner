#!/usr/bin/env bash
# job.sh <figur> <teil: sa|sb|sc> — ein Codex-Lauf für die fehlenden Subklassen-Bilder, danach veröffentlichen
set -u
# Rohbilder und Codex im Test-Klon (Windows-Pfade, Werkbank); die AVIF-Fassungen in den Klon, aus dem das Skript stammt.
V=$(cd "$(dirname "$0")" && pwd); SH=$V/../../sharp APP=${APP:-$(cd "$V/../../../.." && pwd)}
cd /mnt/c/dev/privat/dnd-planner
fig=$1 part=$2 species=${1%-*} look=${1##*-}
dir=design/art/figures-sub/$fig-$part out=$V/out/$fig-$part
names=$(node -e "import('$V/scenes.mjs').then(m => console.log(m.PARTS['$part'].join(' ')))")
total=$(wc -w <<<"$names")
missing() { for n in $names; do [ -f "$dir/$n.png" ] || echo $n; done; }
mkdir -p $dir $out
todo=$(missing | tr '\n' ' ')
flips=" $(node -e "import('$V/scenes.mjs').then(m => console.log(Object.keys(m.SCENES).filter((k) => m.SCENES[k].flip).join(' ')))") "
publish() { for n in $names; do
  w=$APP/vault/art/figures/$fig/subclasses/$n.avif f=
  [[ $flips == *" $n "* ]] && f=flip
  [ -f $dir/$n.png ] && { [ ! -f $w ] || [ $dir/$n.png -nt $w ]; } && node $SH/convert.mjs $dir/$n.png $w $f
done; }
if [ -z "$todo" ]; then publish; echo "SKIP $fig $part"; exit 0; fi

REVELATION=1 source $V/../all/figure.sh
keep=$(sed 's/ *$//; s/ /|/g' <<<"$todo")
{ figure_head
  node $V/brief.mjs $part | grep -E "^[^-]|^$|^- ($keep)\.png"; } > $out/brief.md
[ -n "${DRY:-}" ] && { cat $out/brief.md; exit 0; }

.claude/skills/codex-design/scripts/codex.sh -C $dir --out $out \
  -i $base -i design/art/combos/elf-ranger.png -i design/art/backgrounds/sailor.png - < $out/brief.md > $out/run.log 2>&1
[ -n "$(missing)" ] && [ -f $out/result.md ] && .claude/skills/codex-design/scripts/copy-raw.sh $out/result.md $dir >> $out/run.log 2>&1

publish
m=$(missing | tr '\n' ' ')
q=$(grep -oP 'Kontingent.*' $out/run.log | head -1)
if [ -z "$m" ]; then echo "OK $fig $part $total/$total | $q"; else echo "LÜCKE $fig $part fehlt: $m | $q"; fi
