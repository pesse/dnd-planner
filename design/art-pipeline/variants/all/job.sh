#!/usr/bin/env bash
# job.sh <figur> <teil: ca|cb|ba|bb> — ein Codex-Lauf für die fehlenden Bilder, danach prüfen und veröffentlichen
set -u
V=$(cd "$(dirname "$0")" && pwd); SH=$V/../../sharp
cd /mnt/c/dev/privat/dnd-planner
fig=$1 part=$2 species=${1%-*} look=${1##*-}
kind=$([[ $part == c* ]] && echo classes || echo backgrounds)
dir=design/art/figures-var2/$fig-$part out=$V/out2/$fig-$part
case $part in
  ca) names='barbarian bard cleric druid fighter monk' ;;
  cb) names='paladin ranger rogue sorcerer warlock wizard' ;;
  ba) names='acolyte artisan charlatan criminal entertainer farmer guard guide' ;;
  bb) names='hermit merchant noble sage sailor scribe soldier wayfarer' ;;
esac
total=$(wc -w <<<"$names")
missing() { for n in $names; do [ -f "$dir/$n.png" ] || echo $n; done; }
mkdir -p $dir $out
todo=$(missing | tr '\n' ' ')
# Auch übersprungene Teile veröffentlichen: ein Abbruch kann zwischen Malen und Umwandeln liegen.
publish() { for n in $names; do
  w=vault/art/figures/$fig/$kind/$n.avif
  [ -f $dir/$n.png ] && { [ ! -f $w ] || [ $dir/$n.png -nt $w ]; } && node $SH/convert.mjs $dir/$n.png $w
done; }
if [ -z "$todo" ]; then publish; echo "SKIP $fig $part"; exit 0; fi

source $V/figure.sh
# Nach einem Abbruch nur die fehlenden Rollen beauftragen — fertige Bilder bleiben unangetastet.
keep=$(sed 's/ *$//; s/ /|/g' <<<"$todo")
{ figure_head
  node $V/roles.mjs $fig $part $idx | grep -E "^[^-]|^$|^- ($keep)\.png"; } > $out/brief.md
[ -n "${DRY:-}" ] && { cat $out/brief.md; exit 0; }

.claude/skills/codex-design/scripts/codex.sh -C $dir --out $out \
  -i $base -i design/art/combos/elf-ranger.png -i design/art/backgrounds/sailor.png - < $out/brief.md > $out/run.log 2>&1
[ -n "$(missing)" ] && [ -f $out/result.md ] && .claude/skills/codex-design/scripts/copy-raw.sh $out/result.md $dir >> $out/run.log 2>&1

publish
[ -f $out/result.md ] && cp $out/result.md design/art/figures/identities-$fig-$part.md
m=$(missing | tr '\n' ' ')
q=$(grep -oP 'Kontingent.*' $out/run.log | head -1)
if [ -z "$m" ]; then echo "OK $fig $part $total/$total | $q"; else echo "LÜCKE $fig $part fehlt: $m | $q"; fi
