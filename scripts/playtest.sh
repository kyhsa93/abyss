#!/usr/bin/env bash
# Every hour, somebody plays this game and files what they find.
#
# What to play, what counts as a finding and how to write it is not here --
# `docs/playtest.md` is the spec. This script decides when to run, where, and
# what the job is physically able to change.
#
# **Hourly poll, hourly gate.** Same shape as the other jobs on this machine and
# for the same reason: a fixed minute would skip any hour the machine was off at
# that moment, and this one is off overnight often enough to matter.
#
#   crontab:  35 * * * *  /home/young/workspace/abyss/scripts/playtest.sh
#
# Manual:  playtest.sh now    (run even if this hour is already done)
# Log: ~/.local/state/abyss-playtest/YYYY-MM.log
#
# **It runs in its own worktree, not in the checkout you are reading this in.**
# Three reasons, each of which has already cost this repo a round: somebody's
# unfinished work lives in the main tree most days and a bot that played it
# would be reporting bugs in a half-written sprite sheet; `upkeep.sh` runs in
# the main tree too and holds a different lock, so the two would collide once a
# week; and a job that plays the game has to be playing what is on `main`.
# The worktree is made on first run and kept, because `npm ci` is not free.

set -uo pipefail

# cron's PATH is nearly empty, and node lives under nvm.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
if [ -d "$HOME/.nvm/versions/node" ]; then
  NODE_BIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
fi

# Named rather than derived from this file's own path. cron points at the copy
# inside the bot worktree, so the job picks up its own changes on the next tick;
# derived, that copy would decide it was the main checkout and try to make a
# worktree of itself.
MAIN="${ABYSS_MAIN:-$HOME/workspace/abyss}"
BOT="${ABYSS_PLAYTEST_DIR:-$HOME/workspace/abyss-playtest}"
LOGDIR="$HOME/.local/state/abyss-playtest"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/$(date +%Y-%m).log"
STATE="$LOGDIR/last-hour"

# How often a session actually runs, in hours. The poll stays hourly either way.
EVERY_HOURS="${ABYSS_PLAYTEST_EVERY:-1}"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

FORCE=""
[ "${1:-}" = "now" ] && FORCE=1

exec 9>"$LOGDIR/lock"
flock -n 9 || { log "skip: previous session still going"; exit 0; }

HOUR="$(date +%Y-%m-%dT%H)"
# Most ticks end here, without touching git or writing a log line.
if [ -z "$FORCE" ]; then
  [ "$HOUR" = "$(cat "$STATE" 2>/dev/null)" ] && exit 0
  if [ "$EVERY_HOURS" -gt 1 ] && [ "$(($(date +%-H) % EVERY_HOURS))" -ne 0 ]; then
    exit 0
  fi
fi

# The worktree, made once. `-B playtest` rather than `main`, because git will not
# check the same branch out twice and the main checkout already has it; the push
# at the end is explicit about where it lands.
# `.git` in a worktree is a file pointing at the real one, not a directory, so
# `-d` here would remake the worktree every hour and fail every hour.
if [ ! -e "$BOT/.git" ]; then
  log "making the playtest worktree at $BOT"
  git -C "$MAIN" fetch -q origin || log "warn: fetch failed"
  git -C "$MAIN" worktree add -B playtest "$BOT" origin/main >>"$LOG" 2>&1 || {
    log "fail: could not make the worktree"
    exit 1
  }
  (cd "$BOT" && npm ci >>"$LOG" 2>&1) || { log "fail: npm ci"; exit 1; }
fi

cd "$BOT" || { log "fail: no worktree at $BOT"; exit 1; }

git fetch -q origin 2>>"$LOG"
if ! git pull --rebase --quiet origin main 2>>"$LOG"; then
  # Nothing of anybody's lives in this tree, so the recovery is to take main
  # again. The carried save is ignored by git and survives it.
  log "warn: rebase failed -- resetting the bot worktree to origin/main"
  git rebase --abort 2>/dev/null
  git reset --hard -q origin/main
fi

BEFORE="$(git rev-parse HEAD)"
log "session $HOUR at $(git rev-parse --short HEAD)"

PROMPT="Play this game for a while, and file what you find.

## Read the spec first

What to play, what counts as a finding and how to write it is in the repository,
not in this prompt. Read these, in this order, and follow them:

1. \`docs/playtest.md\` — **the spec. All of it.**
2. \`playtest/direction.md\` — what the last sessions came to believe
3. \`README.md\`, the \"What it is\" section — the concept and the four laws
4. \`docs/upkeep.md\`, the \"already decided\" list — do not propose those again

## The shape of it

\`npm run playpick\` says what to play. Write the play script under
\`playtest/plans/\`, run it with \`npm run playbot\`, read the journal, **look at
the screenshots**, and judge. Before any of that, re-check whatever was closed
since the last ledger line — the spec's \"Re-evaluating\" section is the reason
this job is worth running for months instead of once.

## What you may change

**Only files under \`playtest/\`.** Nothing else — not \`src/\`, not the docs.
Anything you would like changed in the game is an issue, not an edit. You do not
need to commit: whatever you leave under \`playtest/\` is committed and pushed for
you, and anything you leave outside it is thrown away and logged as a mistake.

Issues are in Korean. Source and \`playtest/\` files are in English. Label them
\`playtest\` plus \`bug\` or \`enhancement\`.

The last field of your ledger line must be \`\"message\"\`: one sentence, in
English and in this repository's voice, that will be the commit subject.

## Rules

- **Do not ask questions.** Nobody is here. Decide, and report why.
- **Do not look for other copies of yourself.** A lock guarantees one. The
  \`playtest.sh\` and \`claude -p\` in the process list are you.
- **Two issues is the cap and 0 is a normal session.** If twelve or more
  \`playtest\` issues are open, file nothing and say the gate was shut.
- **Measure before you claim.** Every number comes from a journal line, and the
  line goes in with it.

## Finish

Report the cell you played, what you did in it that no session had done before,
what you found, what you filed, and why there was not more."

timeout 5400 claude -p "$PROMPT" \
  --model claude-sonnet-5 \
  --allowedTools Bash Read Glob Grep Edit Write \
  >> "$LOG" 2>&1
RC=$?

# Anything the session left running, swept here rather than after the push,
# because the run that leaks is the one killed by the timeout above -- and that
# path exits before the push ever happens. `playbot` puts its dev server in its
# own process group and stops it on the way out; a killed session never gets to
# the way out, and a leaked server every hour is how a job that runs forever
# takes the machine down rather than the game.
#
# The bracket is not a typo. A bare `pkill -f vite` matches pkill's own command
# line, which on this machine has already killed the shell that ran it.
LEFT="$(pgrep -f 'vit[e] --port 5[234][0-9][0-9]' | tr '\n' ' ')"
if [ -n "$LEFT" ]; then
  log "warn: the session left a dev server running ($LEFT) -- stopping it"
  # shellcheck disable=SC2086
  kill $LEFT 2>/dev/null
fi

# The boundary, enforced rather than asked for. Anything touched outside
# `playtest/` goes back, loudly: the job is not allowed to fix the game, and a
# job that quietly started to would be the most expensive kind of helpful.
STRAY="$(git status --porcelain -- . ':(exclude)playtest' | head -20)"
if [ -n "$STRAY" ]; then
  log "warn: the session touched files outside playtest/ -- reverting them"
  echo "$STRAY" >> "$LOG"
  # The exclusion is not decoration. `git checkout -- .` reverts *everything*
  # tracked, which here means the ledger line and `direction.md` the session had
  # just spent an hour on: the boundary guard would eat the work it was guarding.
  # This was found by doing it, by hand, to a tree in the middle of this round.
  git checkout -- . ':(exclude)playtest' 2>>"$LOG"
  git clean -fdq -e playtest 2>>"$LOG"
fi

if [ "$RC" -ne 0 ]; then
  # A failed hour is not this hour's turn used up.
  log "fail: claude exited $RC -- will retry next tick"
  exit "$RC"
fi

echo "$HOUR" > "$STATE"

# The ledger line carries its own commit subject, so the message says what the
# session did rather than that a session happened.
if [ -n "$(git status --porcelain -- playtest)" ]; then
  SUBJECT="$(node -e '
    const fs = require("fs")
    const lines = fs.readFileSync("playtest/sessions.jsonl", "utf8").trim().split("\n")
    try { process.stdout.write(JSON.parse(lines[lines.length - 1]).message ?? "") } catch {}
  ' 2>/dev/null)"
  [ -z "$SUBJECT" ] && SUBJECT="An hour of it, played and written down"
  git add -- playtest
  git -c user.name="abyss playtest" -c user.email="kyhsa93@naver.com" \
    commit -q -m "$SUBJECT" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>" >>"$LOG" 2>&1
  if git push -q origin playtest:main 2>>"$LOG"; then
    log "pushed $(git rev-parse --short HEAD): $SUBJECT"
  else
    log "warn: push rejected -- next session rebases and retries"
  fi
else
  log "session left nothing to commit"
fi

OPEN="$(gh issue list --state open --label playtest --limit 50 2>/dev/null | wc -l)"
log "session end $HOUR -- $OPEN open playtest issues, was $BEFORE now $(git rev-parse --short HEAD)"
