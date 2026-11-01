#!/usr/bin/env bash
# job.sh <W> <N> — Worker W von N malt Pakete offener Monster-Szenen, bis alles da ist, RUNS Pakete gemalt sind, das Kontingent LIMIT erreicht oder out/STOP existiert
set -u
I=$(cd "$(dirname "$0")" && pwd); SH=$I/../sharp
cd "$I/../../.."
W=$1 N=$2 BATCH=${BATCH:-4} LIMIT=${LIMIT:-44} RUNS=${RUNS:-999}
dir=design/art/monster-scenes-w$W main=design/art/monster-scenes run=$I/out log=$I/out/run.log
mkdir -p $dir $main $run
refs=$(for r in classes-fighter classes-ranger figures-dwarf-feminine-classes-paladin; do echo -i design/art/monster-scenes-refs/$r.png; done)
publish() { for p in $dir/*.png; do [ -f "$p" ] && node $SH/convert.mjs $p vault/art/monster-scenes/$(basename $p .png).avif; done; }
n=0 empty=0
while :; do
  [ $n -ge $RUNS ] && break
  [ -f $run/STOP ] && { echo "w$W: STOP" | tee -a $log; break; }
  node $I/brief.mjs $W $N $BATCH > $run/brief-w$W.md; rc=$?
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
