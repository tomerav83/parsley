#!/usr/bin/env bash
#
# Start / stop / restart the Parsley dev services (backend + frontend).
#
# Each service runs in its own process session (via setsid) so that reloader
# child processes are killed cleanly along with the parent. PIDs and logs live
# under .run/ (gitignored).
#
# Usage:
#   scripts/services.sh start   [backend|frontend|all]
#   scripts/services.sh stop    [backend|frontend|all]
#   scripts/services.sh restart [backend|frontend|all]
#   scripts/services.sh status  [backend|frontend|all]
#   scripts/services.sh logs    [backend|frontend]        # follow (tail -f)
#
# Defaults to "all" when no service is given.
#
# On start/restart, if the frontend is (re)started its URL is printed (clickable
# in most terminals) so you can jump straight to the app.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
mkdir -p "$RUN_DIR"

# Set to 1 by start_one when the frontend is (re)started in this invocation, so
# the dispatcher knows to print its (clickable) URL afterwards.
OPEN_FRONTEND=0

# --- service definitions ---------------------------------------------------
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:${FRONTEND_PORT}}"
# Exported so the detached `setsid bash` child (which re-runs the *_cmd
# functions) inherits ROOT/ports/CORS rather than seeing them unset.
export ROOT BACKEND_PORT FRONTEND_PORT CORS_ORIGINS

backend_cmd() {
  cd "$ROOT/backend"
  CORS_ORIGINS="$CORS_ORIGINS" \
    exec uv run uvicorn app.main:app --reload --port "$BACKEND_PORT"
}

frontend_cmd() {
  cd "$ROOT/frontend"
  exec npm run dev -- --port "$FRONTEND_PORT"
}

port_for() { [[ "$1" == backend ]] && echo "$BACKEND_PORT" || echo "$FRONTEND_PORT"; }

# --- helpers ---------------------------------------------------------------
pidfile() { echo "$RUN_DIR/$1.pid"; }
logfile() { echo "$RUN_DIR/$1.log"; }

# Substring/regex a live PID's command must match to be accepted as this
# service — guards against PID reuse: if a service crashed and its PID was
# later recycled by an unrelated process, a stale pidfile must NOT make us
# treat it as running (nor group-kill that innocent process on stop).
svc_pattern() {
  case "$1" in
    backend)  echo "uvicorn" ;;
    frontend) echo "vite|npm run dev" ;;
    *)        echo "" ;;
  esac
}

is_running() {
  local svc="$1" pf pid
  pf="$(pidfile "$svc")"
  [[ -f "$pf" ]] || return 1
  pid="$(cat "$pf" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  # PID is alive — confirm it's actually our service, not a recycled PID.
  local cmd pat
  cmd="$(ps -o args= -p "$pid" 2>/dev/null || true)"
  pat="$(svc_pattern "$svc")"
  [[ -z "$pat" || "$cmd" =~ $pat ]]
}

start_one() {
  local svc="$1"
  if is_running "$svc"; then
    echo "✓ $svc already running (pid $(cat "$(pidfile "$svc")"))"
    return 0
  fi
  local log; log="$(logfile "$svc")"
  # setsid gives the service its own session/process-group so we can later
  # signal the whole group (uvicorn --reload / vite spawn children).
  setsid bash -c "$(declare -f backend_cmd frontend_cmd); ${svc}_cmd" \
    >"$log" 2>&1 < /dev/null &
  local pid=$!
  echo "$pid" > "$(pidfile "$svc")"
  sleep 0.3
  if is_running "$svc"; then
    echo "▶ started $svc (pid $pid) on :$(port_for "$svc")  → $log"
    if [[ "$svc" == frontend ]]; then OPEN_FRONTEND=1; fi
  else
    echo "✗ $svc failed to start; last log lines:"
    tail -n 15 "$log" || true
    # The leader died but may have spawned children first (e.g. npm launched
    # node/esbuild before exiting) — group-kill so nothing orphans and holds
    # the port. Negative PID targets the whole process group.
    kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    rm -f "$(pidfile "$svc")"
    return 1
  fi
}

stop_one() {
  local svc="$1"
  local pf; pf="$(pidfile "$svc")"
  if ! is_running "$svc"; then
    echo "· $svc not running"
    rm -f "$pf"
    return 0
  fi
  local pid; pid="$(cat "$pf")"
  # Negative PID targets the whole process group (setsid leader == group id).
  kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    is_running "$svc" || break
    sleep 0.2
  done
  if is_running "$svc"; then
    kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    sleep 0.3
  fi
  rm -f "$pf"
  echo "■ stopped $svc"
}

status_one() {
  local svc="$1"
  if is_running "$svc"; then
    printf "✓ %-9s running  pid %-8s :%s\n" "$svc" "$(cat "$(pidfile "$svc")")" "$(port_for "$svc")"
  else
    printf "✗ %-9s stopped\n" "$svc"
  fi
}

logs_one() {
  local svc="$1" log; log="$(logfile "$svc")"
  [[ -f "$log" ]] || { echo "no log for $svc yet ($log)"; return 1; }
  exec tail -n 40 -f "$log"
}

# Print the frontend URL. Most terminals auto-linkify http:// so this is
# click/Ctrl+click-able, no browser is launched, and it works on any OS.
print_frontend_url() {
  echo "🌐 Frontend ready → http://localhost:${FRONTEND_PORT}"
}

# --- dispatch --------------------------------------------------------------
resolve_services() {
  case "${1:-all}" in
    all|"") echo "backend frontend" ;;
    backend) echo "backend" ;;
    frontend) echo "frontend" ;;
    *) echo "unknown service: $1" >&2; exit 2 ;;
  esac
}

action="${1:-}"; shift || true
target="${1:-all}"

case "$action" in
  start)   for s in $(resolve_services "$target"); do start_one "$s"; done ;;
  stop)    for s in $(resolve_services "$target"); do stop_one  "$s"; done ;;
  restart) for s in $(resolve_services "$target"); do stop_one "$s"; start_one "$s"; done ;;
  status)  for s in $(resolve_services "$target"); do status_one "$s"; done ;;
  logs)
    [[ "$target" == "all" ]] && { echo "logs: specify 'backend' or 'frontend'"; exit 2; }
    logs_one "$target" ;;
  *)
    echo "Usage: scripts/services.sh {start|stop|restart|status|logs} [backend|frontend|all]" >&2
    exit 2 ;;
esac

# Only print the URL after a start/restart that actually (re)started the
# frontend — never on stop, status, logs, or a backend-only operation.
if [[ "$action" == start || "$action" == restart ]] && (( OPEN_FRONTEND )); then
  print_frontend_url
fi
