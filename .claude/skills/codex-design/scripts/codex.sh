#!/usr/bin/env bash
# Gibt dem Design-Agenten (Codex mit eingebautem Bildwerkzeug) eine Aufgabe und wartet auf
# das Ergebnis. Ablauf und Auftragsvorlage: ../SKILL.md.
#
# Warum es dieses Skript gibt:
#
#   * Die CLI liegt in der Desktop-App unter %LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\,
#     und der Hash wechselt mit Updates — gesucht wird die neueste codex.exe.
#   * codex.exe ist ein Windows-Programm: Pfade (-C, -i, -o) brauchen die
#     Windows-Schreibweise.
#   * Ohne Schreibrecht (workspace-write) darf Codex nichts ablegen; `exec resume`
#     kennt kein -s, dort geht es über -c sandbox_mode.
#   * Der Nutzer arbeitet parallel im Zielordner. Das Skript merkt sich vorher, was dort
#     schon geändert war, und meldet hinterher getrennt: neue Dateien, geänderte
#     versionierte Dateien und geänderte Dateien, die schon vorher in Arbeit waren.
#     Zurückgesetzt wird nichts. `vault/` ist ein eigenes Repo; git -C fragt das richtige.
#
# Nutzung:
#   codex.sh -C ZIELORDNER [--out DIR] [-i BILD]... "Auftrag"
#   codex.sh -C ZIELORDNER --resume SESSION_ID [--out DIR] [-i BILD]... "Nachbesserung"
#   echo "Auftrag" | codex.sh -C ZIELORDNER [--out DIR] -        # Auftrag von stdin
#
# ZIELORDNER ist Codex' Arbeitsverzeichnis und der einzige Ort mit Schreibrecht
# (Standard: static/). In DIR landen log.txt (ganzer Verlauf) und result.md (letzte
# Antwort von Codex). Am Ende stehen Sitzungs-ID, Verbrauch und Kontingent (aus der
# Sitzungsdatei unter %USERPROFILE%\.codex\sessions\) und die Dateiliste.
# Codex-Pfad per CODEX=..., Codex-Home per CODEX_HOME_WSL=... überschreibbar.
# Ein Lauf dauert einige Minuten — aus Claude Code im Hintergrund starten.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"

# </dev/null: cmd.exe liest sonst stdin leer, und der Auftrag über `-` kommt nie an.
win_var() { /mnt/c/Windows/System32/cmd.exe /c "echo %$1%" </dev/null 2>/dev/null | tr -d '\r'; }

find_codex() {
	local local_app
	local_app="$(win_var LOCALAPPDATA)"
	[[ -n "$local_app" ]] || return 1
	ls -t "$(wslpath -u "$local_app")"/OpenAI/Codex/bin/*/codex.exe 2>/dev/null | head -1
}

CODEX="${CODEX:-$(find_codex)}"
if [[ -z "$CODEX" || ! -x "$CODEX" ]]; then
	echo "FEHLER: codex.exe nicht gefunden (Desktop-App installiert? sonst CODEX=… setzen)" >&2
	exit 1
fi

resume="" out="" images=() prompt="" target="static"
while [[ $# -gt 0 ]]; do
	case "$1" in
		-C) target="$2"; shift 2 ;;
		--resume) resume="$2"; shift 2 ;;
		--out) out="$2"; shift 2 ;;
		-i) images+=(-i "$(wslpath -w "$(realpath "$2")")"); shift 2 ;;
		-h|--help) sed -n '2,30p' "$0"; exit 0 ;;
		*) prompt="$1"; shift ;;
	esac
done
if [[ -z "$prompt" ]]; then
	echo "FEHLER: kein Auftrag angegeben (oder - für stdin)" >&2
	exit 1
fi
[[ "$prompt" == "-" ]] && prompt="$(cat)"

[[ "$target" = /* ]] || target="$ROOT/$target"
if [[ ! -d "$target" ]]; then
	echo "FEHLER: Zielordner $target existiert nicht" >&2
	exit 1
fi
ASSETS="$(realpath "$target")"
REPO="$(git -C "$ASSETS" rev-parse --show-toplevel)"

out="${out:-$(mktemp -d)}"
mkdir -p "$out"
out="$(realpath "$out")"
LOG="$out/log.txt"
RESULT="$out/result.md"

# Stand im Zielordner vorher: Statuszeilen und Prüfsummen der schon geänderten Dateien.
status_assets() { git -C "$REPO" -c core.quotePath=false status --porcelain --untracked-files=all -- "$ASSETS"; }
sums_of() { while IFS= read -r f; do [[ -f "$REPO/$f" ]] && md5sum "$REPO/$f"; done; }
before="$(status_assets)"
before_sums="$(cut -c4- <<<"$before" | sums_of)"

if [[ -n "$resume" ]]; then
	args=(exec resume "$resume" -c 'sandbox_mode="workspace-write"')
else
	args=(exec -C "$(wslpath -w "$ASSETS")" -s workspace-write)
fi
args+=("${images[@]}" -o "$(wslpath -w "$RESULT")" -)

echo ">> Codex: $("$CODEX" --version </dev/null 2>/dev/null | tr -d '\r')  →  $out"
# Der Auftrag geht über stdin: Umlaute und Anführungszeichen überleben so die
# Windows-Kommandozeile. cd, weil `exec resume` kein -C kennt.
(cd "$ASSETS" && printf '%s' "$prompt" | "$CODEX" "${args[@]}") 2>&1 | tr -d '\r' >"$LOG"
rc=${PIPESTATUS[0]}

session="$(grep -a -m1 -oP '^session id: \K\S+' "$LOG")"
echo ">> Exit: $rc"
# Sicherheitsnetz, falls ein weiterer Aufruf vor dem Lesen stdin verbraucht.
if grep -aq '^No prompt provided via stdin' "$LOG"; then
	echo ">> FEHLER: Codex hat keinen Auftrag erhalten (${#prompt} Zeichen gesendet)." >&2
	echo ">>   Nochmal versuchen, den Auftrag als Argument statt mit - übergeben:" >&2
	echo ">>   codex.sh -C … \"\$(cat auftrag.md)\"" >&2
fi
echo ">> Sitzung: ${session:-unbekannt}   (nachbessern: codex.sh -C ${ASSETS#$ROOT/} --resume ${session:-<id>} …)"
echo ">> Rohbilder: ~/.codex/generated_images/${session:-<id>}/"

# Verbrauch: das letzte token_count-Ereignis der Sitzung. Codex nennt kein Geld, nur
# Tokens und den belegten Anteil des Abo-Kontingents (ganze Prozent je Zeitfenster).
codex_home="${CODEX_HOME_WSL:-$(wslpath -u "$(win_var USERPROFILE)" 2>/dev/null)/.codex}"
rollout="$([[ -n "$session" ]] && find "$codex_home/sessions" -name "*$session.jsonl" 2>/dev/null | head -1)"
if [[ -n "$rollout" ]]; then
	python3 - "$rollout" <<'PY'
import json, sys, datetime
last = None
for line in open(sys.argv[1], encoding="utf-8"):
    if '"token_count"' in line:
        p = json.loads(line).get("payload", {})
        if p.get("type") == "token_count":
            last = p
if not last:
    print(">> Verbrauch: unbekannt (kein token_count in der Sitzung)")
    sys.exit()
t = (last.get("info") or {}).get("total_token_usage") or {}
n = lambda k: f"{t.get(k, 0):,}".replace(",", ".")
print(f">> Verbrauch (Sitzung gesamt): {n('total_tokens')} Tokens, "
      f"davon {n('cached_input_tokens')} aus dem Cache, {n('output_tokens')} Ausgabe")
rl = last.get("rate_limits") or {}
for key, name in (("primary", "Kontingent"), ("secondary", "Kontingent 2")):
    w = rl.get(key)
    if not w:
        continue
    win = w.get("window_minutes") or 0
    span = f"{win // 1440} Tage" if win >= 1440 else f"{win // 60} h"
    reset = datetime.datetime.fromtimestamp(w["resets_at"]).strftime("%d.%m. %H:%M") if w.get("resets_at") else "?"
    used = w.get("used_percent", 0)
    print(f">> {name} ({span}): {used:g} % belegt, {100 - used:g} % frei, neu ab {reset}")
plan = rl.get("plan_type")
if plan:
    print(f">> Abo: {plan}" + ("  — LIMIT ERREICHT" if rl.get("rate_limit_reached_type") else ""))
PY
fi
echo ">> Antwort: $RESULT"
[[ -f "$RESULT" ]] && { sed "s/^/   /" "$RESULT"; echo; }

echo ">> Änderungen unter ${ASSETS#$ROOT/}/:"
after="$(status_assets)"
while IFS= read -r line; do
	[[ -z "$line" ]] && continue
	f="${line:3}"
	if ! grep -qxF -- "$line" <<<"$before"; then
		case "${line:0:2}" in
			'??') echo "   neu:                          $f" ;;
			*)    echo "   WARNUNG bestehende Datei:     $f  (${line:0:2})" ;;
		esac
	elif [[ -f "$REPO/$f" ]] && ! grep -qF -- "$(md5sum "$REPO/$f")" <<<"$before_sums"; then
		echo "   WARNUNG war schon in Arbeit:  $f  (Codex hat sie weiter verändert)"
	fi
done <<<"$after"

exit "$rc"
