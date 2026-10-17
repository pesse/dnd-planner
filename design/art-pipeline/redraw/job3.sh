#!/usr/bin/env bash
# job3.sh <figur> <teil> — Neu-Mal-Lauf: markierte Bilder (redraw/fixes/<figur>-<teil>.tsv) beiseitelegen und mit der Notiz neu malen
set -u
R=$(cd "$(dirname "$0")" && pwd); V=$R/../variants/all; SH=$R/../sharp
cd /mnt/c/dev/privat/dnd-planner
fig=$1 part=$2 species=${1%-*} look=${1##*-}
kind=$([[ $part == c* ]] && echo classes || echo backgrounds)
dir=design/art/figures-var2/$fig-$part out=$R/out/$fig-$part fixes=$R/fixes/$fig-$part.tsv
case $part in
  ca) names='barbarian bard cleric druid fighter monk' ;;
  cb) names='paladin ranger rogue sorcerer warlock wizard' ;;
  ba) names='acolyte artisan charlatan criminal entertainer farmer guard guide' ;;
  bb) names='hermit merchant noble sage sailor scribe soldier wayfarer' ;;
esac
total=$(wc -w <<<"$names")
fixed() { cut -f1 $fixes | grep -qx "$1"; }
# Fehlend = gar nicht da, oder markiert und älter als der Plan (nach einem Abbruch bleibt Neugemaltes stehen).
missing() { for n in $names; do { [ ! -f "$dir/$n.png" ] || { fixed $n && [ "$dir/$n.png" -ot $fixes ]; }; } && echo $n; done; }
mkdir -p $dir $out $dir/old
[ -f $fixes ] || { echo "KEINE FIXES $fig $part"; exit 0; }
todo=$(missing | tr '\n' ' ')
# Auch übersprungene Teile veröffentlichen: ein Abbruch kann zwischen Malen und Umwandeln liegen.
publish() { for n in $names; do
  w=static/art/figures/$fig/$kind/$n.avif
  [ -f $dir/$n.png ] && { [ ! -f $w ] || [ $dir/$n.png -nt $w ]; } && node $SH/convert.mjs $dir/$n.png $w
done; }
if [ -z "$todo" ]; then publish; echo "SKIP $fig $part"; exit 0; fi

source $V/figure.sh
# Nach einem Abbruch nur die fehlenden Rollen beauftragen — fertige Bilder bleiben unangetastet.
keep=$(sed 's/ *$//; s/ /|/g' <<<"$todo")
{ figure_head
  REROLL=$(awk -F'\t' '$3=="reroll"{printf "%s,", $1}' $fixes) node $V/roles.mjs $fig $part $idx | grep -E "^[^-]|^$|^- ($keep)\.png"
  echo
  echo "CORRECTIONS: an earlier version of these images was rejected by the art director. Their notes (German) say what was wrong — fix exactly that while following everything above:"
  awk -F'\t' -v k="^($keep)$" '$1 ~ k { print "- " $1 ".png: " ($2 == "" ? "(no note — make it a clearly better, rule-conforming image)" : $2) }' $fixes; } > $out/brief.md
grep -q "^- [a-z]*\.png: [A-Z]" $out/brief.md || { echo "FAIL $fig $part: Brief ohne Rollenbeschreibung (roles.mjs kaputt?)"; exit 1; }
[ -n "${DRY:-}" ] && { cat $out/brief.md; exit 0; }
for n in $todo; do [ -f $dir/$n.png ] && mv $dir/$n.png $dir/old/$n-$(date +%s).png; done

.claude/skills/codex-design/scripts/codex.sh -C $dir --out $out \
  -i $base -i design/art/combos/elf-ranger.png -i design/art/backgrounds/sailor.png - < $out/brief.md > $out/run.log 2>&1
[ -n "$(missing)" ] && [ -f $out/result.md ] && .claude/skills/codex-design/scripts/copy-raw.sh $out/result.md $dir >> $out/run.log 2>&1

publish
cut -f1 $fixes | while read -r n; do
  [ -f $dir/$n.png ] && [ $dir/$n.png -nt $fixes ] && curl -s -o /dev/null -X POST --data "{\"redrawn\":\"/static/art/figures/$fig/$kind/$n.avif\"}" http://localhost:8898/redo.json
done
[ -f $out/result.md ] && cp $out/result.md design/art/figures/identities-$fig-$part-redo.md
m=$(missing | tr '\n' ' ')
q=$(grep -oP 'Kontingent.*' $out/run.log | head -1)
if [ -z "$m" ]; then echo "OK $fig $part $total/$total | $q"; else echo "LÜCKE $fig $part fehlt: $m | $q"; fi
