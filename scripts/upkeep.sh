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

# cron's PATH is nearly empty, and node lives under nvm.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
if [ -d "$HOME/.nvm/versions/node" ]; then
  NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGDIR="$HOME/.local/state/abyss-upkeep"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/$(date +%Y-%m).log"
STATE="$LOGDIR/last-week"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

FORCE=""
[ "${1:-}" = "now" ] && FORCE=1

exec 9>"$LOGDIR/lock"
flock -n 9 || { log "skip: previous run still going"; exit 0; }

WEEK="$(date +%G-W%V)"
if [ -z "$FORCE" ] && [ "$WEEK" = "$(cat "$STATE" 2>/dev/null)" ]; then
  exit 0
fi

cd "$REPO" || { log "fail: no repository at $REPO"; exit 1; }

# **The one hard safety rule.** Somebody's unfinished work lives in this tree
# often enough that assuming otherwise is how a bot commits half a sprite sheet.
# A dirty tree means audit only: look, file issues, change nothing.
DIRTY="$(git status --porcelain)"
if [ -n "$DIRTY" ]; then
  READONLY=1
  log "tree is dirty — audit only, no commits this week"
  echo "$DIRTY" | head -10 >> "$LOG"
else
  READONLY=""
  git pull --rebase --quiet origin main 2>>"$LOG" || log "warn: pull failed, using local state"
fi

log "upkeep start $WEEK ($(git rev-parse --short HEAD))${READONLY:+ [read-only]}"

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
- **\`npm run check\` takes about an hour.** Run it once, in the background, and read the
  tables it prints. Do not run it twice.
- **Measure before you claim.** Every number in an issue or a commit message comes from a
  command you actually ran, and the command goes in with it.
- **0 issues is a normal week.** Two is a cap, not a target.
- **Do not ask questions.** Nobody is here to answer. Decide, and report why.
- **Do not look for other copies of yourself.** A lock already guarantees one. The
  \`upkeep.sh\` and \`claude -p\` in the process list are you.
- Label issues \`upkeep\`, plus \`bug\` or \`enhancement\`.

## Finish

Report what you checked, what you changed, what you filed, and why there was not more."

timeout 7200 claude -p "$PROMPT" \
  --model claude-sonnet-5 \
  --allowedTools Bash Read Glob Grep Edit Write WebFetch \
  >> "$LOG" 2>&1
RC=$?

if [ -n "$READONLY" ]; then
  NOW="$(git status --porcelain)"
  [ "$NOW" != "$DIRTY" ] && log "warn: tree changed during a read-only week"
fi

if [ "$RC" -ne 0 ]; then
  # A failed week is not this week's turn used up. Try again on the next tick.
  log "fail: claude exited $RC — will retry"
  exit "$RC"
fi

echo "$WEEK" > "$STATE"
OPEN="$(gh issue list --state open --label upkeep --limit 50 2>/dev/null | wc -l)"
log "upkeep end $WEEK — $OPEN open upkeep issues, HEAD $(git rev-parse --short HEAD)"
