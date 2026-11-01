#!/usr/bin/env bash
# publish.sh <ordner>… — Roh-PNGs nach vault/art/monster-scenes wandeln, wenn das AVIF fehlt oder älter ist, und Neumal-Aufträge abhaken
I=$(cd "$(dirname "$0")" && pwd)
cd "$I/../../.."
for dir in "$@"; do
  for p in $dir/*.png; do
    [ -f "$p" ] || continue
    a=vault/art/monster-scenes/$(basename $p .png).avif
    [ -f "$a" ] && [ "$a" -nt "$p" ] && continue
    node $I/../sharp/convert.mjs $p $a
  done
  [ -d "$dir" ] && node $I/redrawn.mjs $dir
done
