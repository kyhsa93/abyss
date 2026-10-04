#!/usr/bin/env bash
# The two cron jobs, run against stubs, to show their lock cannot be lost.
#
#   bash scripts/botlockcheck.sh            # the scripts in this checkout
#   bash scripts/botlockcheck.sh <dir>      # the scripts in <dir>, e.g. an old copy
#
# **What it guards against happened on this machine.** Another repository's job
# held its lock in file descriptor 9 and ran `git pull` with it open. The pull
# started `git gc --auto`, which detached, inherited the descriptor, and stuck in
# `D` on a sector the disk could not read. The job's shell exited normally; the
# gc kept the lock; and every tick after that logged "skip: previous run still
# going" for thirty hours, with the age in the line counting from the epoch
# because the shell's own exit trap had cleared the start time.
#
# Two checks per job, each with real processes and a real `flock`:
#
#   leak   -- a stubbed `git pull` leaves a detached child behind, the way
#             `gc --auto` does. Once the job exits, the lock must be free.
#   orphan -- something holds the lock and no `running.pid` is alive: the state
#             a leaked child leaves. The next tick must call it wedged and throw
#             the lock file away, and the tick after that must get to run.
#
# Nothing here touches git, the network, `claude` or the real jobs' state: every
# command the jobs call is a stub on the front of `PATH`, and both jobs read
# their state directory from the environment.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "${1:-$HERE}" && pwd)"
WORK="$(mktemp -d)"
FAILED=0
# Whatever the stubs left behind, gone however this ends.
trap 'pkill -P $$ 2>/dev/null; pkill -f "[b]otlockcheck-child $WORK" 2>/dev/null; rm -rf "$WORK"' EXIT

ok() { echo "  ok    $*"; }
bad() { echo "  FAIL  $*"; FAILED=$((FAILED + 1)); }

# --- stubs -------------------------------------------------------------------
STUBS="$WORK/bin"
mkdir -p "$STUBS"
# The child a pull leaves behind. Named so the trap can find it, and long enough
# to outlive the job by a margin no slow machine eats.
cat > "$STUBS/git" <<STUB
#!/usr/bin/env bash
for a in "\$@"; do
  case "\$a" in
    pull) ( exec -a "botlockcheck-child $WORK" sleep 30 ) & exit 0 ;;
    rev-parse) echo 0000000; exit 0 ;;
  esac
done
exit 0
STUB
for name in claude gh pgrep npm; do printf '#!/usr/bin/env bash\nexit 0\n' > "$STUBS/$name"; done
chmod +x "$STUBS"/*
export PATH="$STUBS:$PATH"

# A lock is free when another process can take it at once.
free() { flock -n "$1" true; }

# Held by a process that is nobody the job knows about.
hold() { ( exec 9>"$1"; flock 9; exec -a "botlockcheck-child $WORK" sleep 30 ) & sleep 0.3; }

# --- playtest.sh ---------------------------------------------------------------
playtest() {
  local state="$WORK/playtest-state" bot="$WORK/bot"
  mkdir -p "$state" "$bot/scripts" "$bot/playtest"
  touch "$bot/.git" "$bot/playtest/sessions.jsonl" "$bot/playtest/direction.md"
  cp "$SRC/playtest.sh" "$bot/scripts/playtest.sh"
  ABYSS_PLAYTEST_STATE="$state" ABYSS_MAIN="$WORK/main" ABYSS_PLAYTEST_DIR="$bot" \
    bash "$bot/scripts/playtest.sh" now
}

echo "playtest.sh"
playtest
if free "$WORK/playtest-state/lock"; then ok "leak: the lock is free once the job exits"
else bad "leak: a child of the job's git pull still holds the lock"; fi
pkill -f "[b]otlockcheck-child $WORK"; sleep 0.3

rm -f "$WORK/playtest-state/running.pid" "$WORK/playtest-state/running.since"
hold "$WORK/playtest-state/lock"
: > "$WORK/playtest-state/$(date +%Y-%m).log"
playtest
if grep -q 'WEDGED' "$WORK/playtest-state/$(date +%Y-%m).log"; then ok "orphan: the tick calls it wedged"
else bad "orphan: the tick did not notice -- it said: $(tail -1 "$WORK/playtest-state/$(date +%Y-%m).log")"; fi
: > "$WORK/playtest-state/$(date +%Y-%m).log"
playtest
if grep -q '^\[.*\] session ' "$WORK/playtest-state/$(date +%Y-%m).log"; then ok "orphan: the tick after it runs"
else bad "orphan: the tick after it did not run -- it said: $(tail -1 "$WORK/playtest-state/$(date +%Y-%m).log")"; fi
pkill -f "[b]otlockcheck-child $WORK"; sleep 0.3

# --- upkeep.sh -----------------------------------------------------------------
# It finds its repository from its own path, so it runs from a copy with a stub
# repository around it. `gh` fails to fetch the sweep, which ends the tick right
# after the pull -- the part under test.
upkeep() {
  local repo="$WORK/repo"
  mkdir -p "$repo/scripts"
  cp "$SRC/upkeep.sh" "$repo/scripts/upkeep.sh"
  printf '#!/usr/bin/env bash\nexit 1\n' > "$STUBS/gh"
  ABYSS_UPKEEP_STATE="$WORK/upkeep-state" HOME="$WORK/home" bash "$repo/scripts/upkeep.sh" now
}
# An old copy without the override writes under $HOME, which is pointed here too.
upstate() { [ -d "$WORK/upkeep-state" ] && echo "$WORK/upkeep-state" || echo "$WORK/home/.local/state/abyss-upkeep"; }

echo "upkeep.sh"
upkeep
if free "$(upstate)/lock"; then ok "leak: the lock is free once the job exits"
else bad "leak: a child of the job's git pull still holds the lock"; fi
pkill -f "[b]otlockcheck-child $WORK"; sleep 0.3

rm -f "$(upstate)/running.pid" "$(upstate)/running.since"
hold "$(upstate)/lock"
: > "$(upstate)/$(date +%Y-%m).log"
upkeep
if grep -q 'WEDGED' "$(upstate)/$(date +%Y-%m).log"; then ok "orphan: the tick calls it wedged"
else bad "orphan: the tick did not notice -- it said: $(tail -1 "$(upstate)/$(date +%Y-%m).log")"; fi
: > "$(upstate)/$(date +%Y-%m).log"
upkeep
if grep -q 'upkeep start' "$(upstate)/$(date +%Y-%m).log"; then ok "orphan: the tick after it runs"
else bad "orphan: the tick after it did not run -- it said: $(tail -1 "$(upstate)/$(date +%Y-%m).log")"; fi

echo
[ "$FAILED" -eq 0 ] && echo "botlockcheck: all passed" || echo "botlockcheck: $FAILED failed"
exit $((FAILED > 0))
