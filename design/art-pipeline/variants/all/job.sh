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
  w=static/art/figures/$fig/$kind/$n.webp
  [ -f $dir/$n.png ] && { [ ! -f $w ] || [ $dir/$n.png -nt $w ]; } && node $SH/convert.mjs $dir/$n.png $w
done; }
if [ -z "$todo" ]; then publish; echo "SKIP $fig $part"; exit 0; fi

idx=$(awk -F'\t' -v f=$fig '$1==f{print NR-1}' $V/figures.tsv)
base=$(awk -F'\t' -v f=$fig '$1==f{print $2}' $V/figures.tsv)
identity=$(awk -F'\t' -v f=$fig '$1==f{print $3}' $V/figures.tsv)
case $species in
  dragonborn) sp='Dragonborn: tall draconic humanoid with a scaled reptilian head and short snout, no tail, no wings.' ;;
  dwarf) sp='Dwarf: 4–5 feet tall, stout and broad-shouldered with short legs.' ;;
  elf) sp='Elf: tall and slender with long pointed ears.' ;;
  fairy) sp='Fairy: small fey folk 3–4 feet tall with insect-like wings; uses flight naturally — hovers or flies in most scenes (shooting from the air, working while hovering).' ;;
  gnome) sp='Gnome: 3–4 feet tall, small and nimble, large expressive eyes, slightly pointed ears.' ;;
  goliath) sp='Goliath: 7–8 feet tall, massive giant-kin with grey stone-like skin and markings.' ;;
  halfling) sp='Halfling: about 3 feet tall, small and nimble, barefoot with hairy feet.' ;;
  human) sp='Human: average height.' ;;
  orc) sp='Orc: tall, broad and powerful with prominent lower tusks.' ;;
  tiefling) sp='Tiefling: human-like with horns, a long tail and solid-coloured eyes.' ;;
esac
extra=''
[ $look = androgynous ] && extra='
This person is ANDROGYNOUS: a viewer must not be able to tell whether they are a man or a woman. Image models drift toward a pretty feminine face — counter-steer. Add verbatim to every Subject block: "androgynous; no long eyelashes, no makeup look, no full or glossy lips, no high delicate cheekbones, no small pointed chin, no arched brows, no flowing glamorous hair, no hourglass figure; equally no beard, no stubble, no bulky muscle." Never use the words man, woman, he, she, male or female. Choose role clothing that is equally unisex.
'
# Nach einem Abbruch nur die fehlenden Rollen beauftragen — fertige Bilder bleiben unangetastet.
keep=$(sed 's/ *$//; s/ /|/g' <<<"$todo")
{ sed -e "s|__IDENTITY__|$identity|" -e "s|__SPECIES__|$sp|" $V/head.md | awk -v e="$extra" '{ if ($0=="__EXTRA__") print e; else print }'
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
