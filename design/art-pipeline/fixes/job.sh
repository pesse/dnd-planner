#!/usr/bin/env bash
# job.sh <W> <N> — Worker W von N korrigiert offene Bilder aus todo.md in Paketen, bis nichts mehr offen ist, das Kontingent LIMIT erreicht oder out/STOP existiert
set -u
I=$(cd "$(dirname "$0")" && pwd)
cd "$I/../../.."
W=$1 N=$2 BATCH=${BATCH:-4} LIMIT=${LIMIT:-60} RUNS=${RUNS:-999}
dir=design/art/fixes/w$W run=$I/out log=$I/out/run.log
mkdir -p $dir $run
n=0 empty=0
while :; do
  [ $n -ge $RUNS ] && break
  [ -f $run/STOP ] && { echo "w$W: STOP" | tee -a $log; break; }
  rm -rf $dir/in $dir/*.png
  flock $I/.lock node $I/run.mjs prep $W $N $BATCH $dir; rc=$?
  [ $rc = 3 ] && { echo "w$W: FERTIG" | tee -a $log; break; }
  [ $rc != 0 ] && { echo "w$W: ABBRUCH Auftrag" | tee -a $log; exit 1; }
  n=$((n+1)) out=$run/w$W-$n items=$(tr '\n' ' ' < $dir/items.txt)
  # Ein früherer Lauf hinterlässt result.md; bricht Codex vorher ab, kopierte copy-raw.sh sonst dessen alte Bilder.
  rm -rf $out
  imgs=(); while read -r p; do imgs+=(-i "$p"); done < $dir/images.txt
  .claude/skills/codex-design/scripts/codex.sh -C $dir --out $out "${imgs[@]}" - < $dir/brief.md > $out.txt 2>&1
  [ -f $out/result.md ] && grep -q '→' $out/result.md && .claude/skills/codex-design/scripts/copy-raw.sh $out/result.md $dir >> $out.txt 2>&1
  made=$(ls $dir | grep -cE '^[0-9]{3}\.png$')
  k=$(grep -o 'Kontingent.*' $out.txt | head -1)
  pct=$(grep -oE '[0-9]+ % belegt' <<<"$k" | grep -oE '^[0-9]+')
  pub=$(flock $I/.lock node $I/run.mjs publish $dir)
  echo "$(date '+%F %T') w$W Paket $n [$items]: $made Bilder, $pub | $k | $(grep -o 'Verbrauch.*' $out.txt)" | tee -a $log
  grep -q 'LIMIT ERREICHT' $out.txt && { touch $run/STOP; echo "w$W: STOPP Limit" | tee -a $log; break; }
  [ -n "$pct" ] && [ "$pct" -ge "$LIMIT" ] && { touch $run/STOP; echo "w$W: STOPP Kontingent $pct %" | tee -a $log; break; }
  # Zwei Pakete ohne Bild hintereinander: Codex scheitert systematisch, weitere Läufe kosten nur Kontingent.
  if [ "$made" -le 0 ]; then empty=$((empty+1)); [ $empty -ge 2 ] && { echo "w$W: STOPP leer, siehe $out.txt" | tee -a $log; break; }; else empty=0; fi
done
exit 0
