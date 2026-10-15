#!/usr/bin/env bash
# Meldet je Figur einmal „FIGUR <name>“, sobald alle 28 Varianten als WebP vorliegen; dazu Lücken.
cd /mnt/c/dev/privat/dnd-planner
V=~/dnd-art-queue/variants/all; seen=~/dnd-art-queue/review/seen.txt; touch $seen
tail -n 0 -F $V/status2.log 2>/dev/null | while read -r st fig part rest; do
  case $st in LÜCKE|*rror*|*LIMIT*) echo "$st $fig $part $rest"; continue ;; OK|SKIP) ;; *) continue ;; esac
  grep -qx "$fig" $seen && continue
  n=$(( $(ls static/art/figures/$fig/classes/*.webp 2>/dev/null | wc -l) ))
  m=0; for p in ca cb ba bb; do m=$((m + $(ls design/art/figures-var2/$fig-$p/*.png 2>/dev/null | wc -l))); done
  [ $m -ge 28 ] && { echo "$fig" >> $seen; echo "FIGUR $fig fertig | ${rest#*| }"; }
done
