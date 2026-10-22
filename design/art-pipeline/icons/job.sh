#!/usr/bin/env bash
# job.sh <serie> <W> <N> — Worker W von N malt Pakete offener Motive, bis alles da ist, RUNS Pakete gemalt sind, das Kontingent LIMIT erreicht oder icons/out/<serie>/STOP existiert
set -u
I=$(cd "$(dirname "$0")" && pwd); SH=$I/../sharp
cd /mnt/c/dev/privat/dnd-planner
serie=$1 W=$2 N=$3 BATCH=${BATCH:-10} LIMIT=${LIMIT:-44} RUNS=${RUNS:-999}
dir=design/art/$serie-w$W main=design/art/$serie run=$I/out/$serie log=$I/out/$serie/run.log
mkdir -p $dir $main $run
refs=$(node -e 'for (const r of require(process.argv[1])[process.argv[2]].refs) console.log("-i", r)' $I/series.json $serie)
publish() { for p in $dir/*.png; do [ -f "$p" ] && node $SH/icon.mjs $p static/art/$serie/$(basename $p .png).avif; done; }
n=0 empty=0
while :; do
  [ $n -ge $RUNS ] && break
  [ -f $run/STOP ] && { echo "w$W: STOP" | tee -a $log; break; }
  node $I/brief.mjs $serie $W $N $BATCH > $run/brief-w$W.md; rc=$?
  [ $rc = 3 ] && { echo "w$W: FERTIG" | tee -a $log; break; }
  [ $rc != 0 ] && { echo "w$W: ABBRUCH Auftrag" | tee -a $log; exit 1; }
  n=$((n+1)) out=$run/w$W-$n before=$(ls $dir | wc -l)
  .claude/skills/codex-design/scripts/codex.sh -C $dir --out $out $refs - < $run/brief-w$W.md > $out.txt 2>&1
  [ -f $out/result.md ] && grep -q '→' $out/result.md && .claude/skills/codex-design/scripts/copy-raw.sh $out/result.md $dir >> $out.txt 2>&1
  after=$(ls $dir | wc -l) k=$(grep -o 'Kontingent.*' $out.txt | head -1)
  pct=$(grep -oE '[0-9]+ % belegt' <<<"$k" | grep -oE '^[0-9]+')
  echo "$(date '+%F %T') w$W Paket $n: +$((after-before)) | $k | $(grep -o 'Verbrauch.*' $out.txt)" | tee -a $log
  grep -q 'LIMIT ERREICHT' $out.txt && { touch $run/STOP; echo "w$W: STOPP Limit" | tee -a $log; break; }
  [ -n "$pct" ] && [ "$pct" -ge "$LIMIT" ] && { touch $run/STOP; echo "w$W: STOPP Kontingent $pct %" | tee -a $log; break; }
  # Zwei Pakete ohne Bild hintereinander: Codex scheitert systematisch, weitere Läufe kosten nur Kontingent.
  if [ $((after-before)) -le 0 ]; then empty=$((empty+1)); [ $empty -ge 2 ] && { echo "w$W: STOPP leer, siehe $out.txt" | tee -a $log; break; }; else empty=0; fi
done
publish
mv -n $dir/*.png $main/ 2>/dev/null; rmdir $dir 2>/dev/null
exit 0
