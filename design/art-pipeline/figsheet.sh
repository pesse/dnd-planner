# figsheet.sh <figur> — Basis + 28 Varianten auf ein Blatt
cd /mnt/c/dev/privat/dnd-planner; S=$(dirname "$0"); F=static/art/figures/$1
node $S/sharp/sheet.mjs $S/fig-$1.jpg 10 $F/species.webp $F/classes/*.webp $F/backgrounds/*.webp
