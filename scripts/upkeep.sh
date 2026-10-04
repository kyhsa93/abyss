#!/usr/bin/env bash
# Once a week, ask whether this is still the game the README says it is.
#
# What to look at and what may be changed is not here — `docs/upkeep.md` is the
# spec and it defers to `README.md`'s "What it is". This script decides when to
# run and what the job is allowed to touch.
#
# **Hourly poll, weekly gate.** A fixed day and hour would skip any week the
# machine was off at that moment. Polling and gating catches up the moment it
# comes back.
#
#   crontab:  45 * * * *  /home/young/workspace/abyss/scripts/upkeep.sh
#
# Manual:  upkeep.sh now    (run even if this week is already done)
# Log: ~/.local/state/abyss-upkeep/YYYY-MM.log

set -uo pipefail

# cron's PATH is nearly empty, and node lives under nvm. Whatever the caller had
# stays in front, so `scripts/botlockcheck.sh` can put stubs there.
export PATH="${PATH:+$PATH:}$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
if [ -d "$HOME/.nvm/versions/node" ]; then
  NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Overridable so a test does not share the real job's lock, log or week-gate.
LOGDIR="${ABYSS_UPKEEP_STATE:-$HOME/.local/state/abyss-upkeep}"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/$(date +%Y-%m).log"
STATE="$LOGDIR/last-week"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

FORCE=""
[ "${1:-}" = "now" ] && FORCE=1

# **The lock must not outlive this script, and a lock nobody is holding on
# purpose must be thrown away.** In another repository on this machine the
# job ran `git pull` with descriptor 9 open; the pull started `git gc --auto`,
# which detached, inherited the descriptor, and stuck in `D` on a sector the
# disk could not read. The job's shell exited normally and the gc kept the lock:
# thirty hours of "skip", with the age counting from the epoch, because the exit
# trap had already cleared `running.since`. So:
#
# - every command started after the lock gets `9>&-`, and git gets
#   `gc.auto=0` -- in the environment as well, so the git that the `claude`
#   session runs under this script cannot start one either;
# - a held lock whose `running.pid` is missing or dead is held by an orphan,
#   and is unlinked the same way as a wedged one.
#
# `scripts/botlockcheck.sh` reproduces both against stubs.
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=gc.auto GIT_CONFIG_VALUE_0=0
exec 9>"$LOGDIR/lock"
if ! flock -n 9; then
  SINCE="$(cat "$LOGDIR/running.since" 2>/dev/null || echo 0)"
  HELD=$(( $(date +%s) - SINCE ))
  HOLDER="$(cat "$LOGDIR/running.pid" 2>/dev/null || echo 0)"
  if [ "$HOLDER" -le 1 ] || ! kill -0 "$HOLDER" 2>/dev/null; then
    # Read between another tick's `flock` and its `echo $$` this would be a
    # false alarm, but ticks are an hour apart and that window is one line.
    log "WEDGED: the lock is held and no run owns it (pid file: ${HOLDER}) -- an orphan has it; taking a fresh lock"
    rm -f "$LOGDIR/lock"
    exit 1
  fi
  # Two hours of session and its two-minute kill, with an hour to spare.
  if [ "$SINCE" -gt 0 ] && [ "$HELD" -gt 10800 ]; then
    log "WEDGED: run $HOLDER has held the lock ${HELD}s -- killing it and taking a fresh lock"
    kill -9 -- "-$HOLDER" 2>/dev/null || kill -9 "$HOLDER" 2>/dev/null
    rm -f "$LOGDIR/lock"
    exit 1
  fi
  log "skip: previous run $HOLDER still going (${HELD}s)"
  exit 0
fi
echo $$ > "$LOGDIR/running.pid"
date +%s > "$LOGDIR/running.since"
trap 'rm -f "$LOGDIR/running.pid" "$LOGDIR/running.since"' EXIT

WEEK="$(date +%G-W%V)"
if [ -z "$FORCE" ] && [ "$WEEK" = "$(cat "$STATE" 2>/dev/null)" ]; then
  exit 0
fi

cd "$REPO" || { log "fail: no repository at $REPO"; exit 1; }

# **The one hard safety rule.** Somebody's unfinished work lives in this tree
# often enough that assuming otherwise is how a bot commits half a sprite sheet.
# A dirty tree means audit only: look, file issues, change nothing.
DIRTY="$(git -c gc.auto=0 status --porcelain 9>&-)"
if [ -n "$DIRTY" ]; then
  READONLY=1
  log "tree is dirty — audit only, no commits this week"
  echo "$DIRTY" | head -10 >> "$LOG"
else
  READONLY=""
  git -c gc.auto=0 pull --rebase --quiet origin main 2>>"$LOG" 9>&- || log "warn: pull failed, using local state"
fi

log "upkeep start $WEEK ($(git -c gc.auto=0 rev-parse --short HEAD 9>&-))${READONLY:+ [read-only]}"

# **The sweep is read off CI, not run here.** It takes about fifty minutes, and
# the session used to be told to run it in the background and read the tables
# -- so W39 and W40 started it, ended their turn, and were logged as done two
# minutes in, having read nothing. CI runs the same sweep on every push to
# main and keeps it, so the runner fetches the last green run's tables and the
# bands are checked against them before the session starts. The session reads a
# file; nothing it is told to read is still being written.
HARNESS="$LOGDIR/harness-$WEEK.txt"
BANDS="$LOGDIR/bands-$WEEK.txt"
CI_RUN="$(gh run list --branch main --workflow Deploy --status success --limit 1 --json databaseId,headSha \
  -q '.[0] | "\(.databaseId) \(.headSha[0:7])"' 2>>"$LOG" 9>&-)"
PARTS="$LOGDIR/parts-$WEEK"
rm -rf "$PARTS"
if [ -n "$CI_RUN" ] && gh run download "${CI_RUN%% *}" -p 'harness-*' -D "$PARTS" >>"$LOG" 2>&1 9>&-; then
  # By file name, which is the order one process would have printed them in;
  # the artifacts land in a directory per runner, so a sort on the whole path
  # interleaves the runners and splits every table across the seams.
  cat $(find "$PARTS" -name 'part-*.txt' -printf '%f\t%p\n' | sort | cut -f2) > "$HARNESS"
  ABYSS_HARNESS_OUT="$HARNESS" npm run -s balancecheck > "$BANDS" 2>&1 9>&-
  log "bands read off CI run $CI_RUN: $(grep -c '^balancecheck: .* — ok' "$BANDS") ok, $(grep -c '^  - ' "$BANDS") line(s) crossed"
else
  log "fail: could not fetch the sweep from CI -- no session this tick"
  exit 1
fi

PERMISSION="If a band is red you may retune the numbers it measures, run \`npm run check\`,
and push once it passes. Stage only files you changed yourself — never \`git add -A\`,
never \`git add .\`."
if [ -n "$READONLY" ]; then
  PERMISSION="**This week you may not commit, push, or modify any file.** The working tree
already had somebody else's unfinished work in it when you started, and there is no way to
separate it from yours. Audit and file issues only. Say in your report that the tree was dirty."
fi

PROMPT="Look at this game once and decide whether it is still the game its README says it is.
Write everything — issues, commit messages, your report — in English, the way this repository does.

## Read the spec first

What to look at, what may be changed and what may not is in the repository, not in this prompt:

1. \`docs/upkeep.md\` — **the spec. Read all of it and follow it.**
2. \`README.md\`, the \"What it is\" section — the concept and the four laws it rests on.
3. \`docs/mechanic-rules.md\` — how a mechanic is allowed to behave.

## Permission

$PERMISSION

You may never move a band to turn a red one green, and you may never edit the concept
section of the README. Both are decisions for a person; open an issue with the argument in it.

## Rules

- **Run \`gh issue list --state all --limit 100\` first.** Closed ones too — a closed issue is
  a decision somebody already made.
- **The sweep has already run.** CI ran it on \`${CI_RUN#* }\` and the runner checked the
  bands against it before you started: the tables are in \`$HARNESS\` and the band
  results in \`$BANDS\`. Read those. Do not run \`npm run check\` or the harness to look.
- **Only if you change a number** do you run \`npm run check\`, and then **in the
  foreground, never in the background**: it takes about fifty minutes and ending your
  turn ends the session. Two weeks were lost to a check started in the background and
  never read.
- **Your report must contain one line starting \`BANDS:\`** that says what the bands file
  said, band by band. The runner does not count the week as done without it.
- **Measure before you claim.** Every number in an issue or a commit message comes from a
  command you actually ran, and the command goes in with it.
- **0 issues is a normal week.** Two is a cap, not a target.
- **Do not ask questions.** Nobody is here to answer. Decide, and report why.
- **Do not look for other copies of yourself.** A lock already guarantees one. The
  \`upkeep.sh\` and \`claude -p\` in the process list are you.
- Label issues \`upkeep\`, plus \`bug\` or \`enhancement\`.

## Finish

Report what you checked, what you changed, what you filed, and why there was not more."

SAID="$LOGDIR/said-$WEEK.txt"
# `-k 120`: a child that catches SIGTERM and hangs is SIGKILLed two minutes on.
timeout -k 120 7200 claude -p "$PROMPT" \
  --model claude-sonnet-5 \
  --allowedTools Bash Read Glob Grep Edit Write WebFetch \
  > "$SAID" 2>&1 9>&-
RC=$?
cat "$SAID" >> "$LOG"
# A week that never said what the bands said did not read them.
if [ "$RC" -eq 0 ] && ! grep -q '^BANDS:' "$SAID"; then
  log "fail: the session reported no BANDS: line -- not counting this week as done"
  exit 1
fi

if [ -n "$READONLY" ]; then
  NOW="$(git -c gc.auto=0 status --porcelain 9>&-)"
  [ "$NOW" != "$DIRTY" ] && log "warn: tree changed during a read-only week"
fi

if [ "$RC" -ne 0 ]; then
  # A failed week is not this week's turn used up. Try again on the next tick.
  log "fail: claude exited $RC — will retry"
  exit "$RC"
fi

echo "$WEEK" > "$STATE"
OPEN="$(gh issue list --state open --label upkeep --limit 50 2>/dev/null 9>&- | wc -l)"
log "upkeep end $WEEK — $OPEN open upkeep issues, HEAD $(git -c gc.auto=0 rev-parse --short HEAD 9>&-)"
