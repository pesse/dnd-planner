#!/usr/bin/env bash
# jobsub.sh <figur> <teil: sa…sh> — markierte Subklassen-Bilder (fixes/<figur>-<teil>.tsv) beiseitelegen und mit der Notiz neu malen
set -u
R=$(cd "$(dirname "$0")" && pwd); V=$R/../variants/subclasses; SH=$R/../sharp APP=$(cd "$R/../../.." && pwd)
cd /mnt/c/dev/privat/dnd-planner
fig=$1 part=$2 species=${1%-*} look=${1##*-}
dir=design/art/figures-sub/$fig-$part out=$R/out/$fig-$part fixes=$R/fixes/$fig-$part.tsv
[ -f $fixes ] || { echo "KEINE FIXES $fig $part"; exit 0; }
names=$(cut -f1 $fixes | tr '\n' ' ')
flips=" $(node -e "import('$V/scenes.mjs').then(m => console.log(Object.keys(m.SCENES).filter((k) => m.SCENES[k].flip).join(' ')))") "
# Fehlend = gar nicht da oder älter als der Plan (nach einem Abbruch bleibt Neugemaltes stehen).
missing() { for n in $names; do { [ ! -f "$dir/$n.png" ] || [ "$dir/$n.png" -ot $fixes ]; } && echo $n; done; }
publish() { for n in $names; do
  w=$APP/vault/art/figures/$fig/subclasses/$n.avif f=
  [[ $flips == *" $n "* ]] && f=flip
  [ -f $dir/$n.png ] && { [ ! -f $w ] || [ $dir/$n.png -nt $w ]; } && node $SH/convert.mjs $dir/$n.png $w $f
done; }
mkdir -p $dir/old $out
todo=$(missing | tr '\n' ' ')
if [ -z "$todo" ]; then publish; echo "SKIP $fig $part"; exit 0; fi

source $R/../variants/all/figure.sh
keep=$(sed 's/ *$//; s/ /|/g' <<<"$todo")
{ figure_head
  node $V/brief.mjs $part | grep -E "^[^-]|^$|^- ($keep)\.png"
  echo
  echo "CORRECTIONS: an earlier version of these images was rejected by the art director. Their notes (German) say what was wrong — fix exactly that while keeping the fixed scene:"
  awk -F'\t' -v k="^($keep)$" '$1 ~ k { print "- " $1 ".png: " $2 }' $fixes; } > $out/brief.md
[ -n "${DRY:-}" ] && { cat $out/brief.md; exit 0; }
for n in $todo; do [ -f $dir/$n.png ] && mv $dir/$n.png $dir/old/$n-$(date +%s).png; done

.claude/skills/codex-design/scripts/codex.sh -C $dir --out $out \
  -i $base -i design/art/combos/elf-ranger.png -i design/art/backgrounds/sailor.png - < $out/brief.md > $out/run.log 2>&1
[ -n "$(missing)" ] && [ -f $out/result.md ] && .claude/skills/codex-design/scripts/copy-raw.sh $out/result.md $dir >> $out/run.log 2>&1

publish
for n in $names; do
  [ -f $dir/$n.png ] && [ $dir/$n.png -nt $fixes ] && curl -s -o /dev/null -X POST --data "{\"redrawn\":\"/vault/art/figures/$fig/subclasses/$n.avif\"}" http://localhost:8898/redo.json
done
m=$(missing | tr '\n' ' ')
q=$(grep -oP 'Kontingent.*' $out/run.log | head -1)
if [ -z "$m" ]; then echo "OK $fig $part $(wc -w <<<"$names") neu | $q"; else echo "LÜCKE $fig $part fehlt: $m | $q"; fi
