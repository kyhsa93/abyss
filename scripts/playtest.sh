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

# cron's PATH is nearly empty, and node lives under nvm. Whatever the caller had
# stays in front of it, which is the only way this file can be tested: a stubbed
# `claude` and `git` on the front of `PATH` exercise the whole scheduler for
# nothing, and this script has now shipped four bugs that a test would have
# caught -- a `.git` that is a file, a revert that ate the work it was guarding, a
# commit subject read off the wrong line, and a script that rewrote itself while
# bash was reading it.
export PATH="${PATH:+$PATH:}$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
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
# Overridable for the same reason as `PATH`: a test must not share the real job's
# lock, log or hour-gate.
LOGDIR="${ABYSS_PLAYTEST_STATE:-$HOME/.local/state/abyss-playtest}"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/$(date +%Y-%m).log"
STATE="$LOGDIR/last-hour"

# How often a session actually runs, in hours. The poll stays hourly either way.
EVERY_HOURS="${ABYSS_PLAYTEST_EVERY:-1}"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

FORCE=""
[ "${1:-}" = "now" ] && FORCE=1

# **A wedged session has to be killed, not waited for -- and the lock file thrown
# away with it.**
#
# The other job on this machine that runs `claude -p` under `timeout` was found
# sitting on its lock seven days into a one-hour budget. The cause was not the
# timeout: `claude` was already defunct, and one of its threads -- `Bun Pool 3`
# -- was stuck in `D`, uninterruptible, so the process could never finish exiting
# and `timeout` waited forever on a child that was already dead. `-k` would not
# have saved it; there was nothing left to signal.
#
# A thread in `D` cannot be killed by anything, and it keeps the dying process's
# descriptors -- including the lock -- open. So killing the holder is only half of
# it: the other half is unlinking the lock file, which leaves the dying side
# holding a lock on an inode nothing can reach and lets the next tick take a
# fresh one. On the job that was actually stuck, that released it without a
# reboot.
#
# Every tick in between had logged "skip: previous session still going" into a
# file nobody was reading, which is why the age is now in the line: a job that is
# dead for a week must not look the same as a job that is merely busy.
HOUR="$(date +%Y-%m-%dT%H)"

# Everything from here to the hand-over belongs to the first pass only. After the
# `exec` below the script starts again from the top with the marker set, and the
# lock must not be released and retaken on the way through: reopening file
# descriptor 9 would drop it for an instant, which is exactly long enough for a
# second tick to take it.
if [ -z "${ABYSS_PLAYTEST_FRESH:-}" ]; then

exec 9>"$LOGDIR/lock"
if ! flock -n 9; then
  SINCE="$(cat "$LOGDIR/running.since" 2>/dev/null || echo 0)"
  HELD=$(( $(date +%s) - SINCE ))
  HOLDER="$(cat "$LOGDIR/running.pid" 2>/dev/null || echo 0)"
  if [ "$SINCE" -gt 0 ] && [ "$HELD" -gt 10800 ] && [ "$HOLDER" -gt 1 ]; then
    log "WEDGED: session $HOLDER has held the lock ${HELD}s -- killing it and taking a fresh lock"
    kill -9 -- "-$HOLDER" 2>/dev/null || kill -9 "$HOLDER" 2>/dev/null
    # The half that actually releases it. See above.
    rm -f "$LOGDIR/lock"
    # Not taking its turn here. The next tick gets a clean tree and a clean lock.
    exit 1
  fi
  log "skip: previous session still going (${HELD}s)"
  exit 0
fi

# Recorded so the tick after a wedge can tell how long it has been, and whom to
# kill. No `set -m` here on purpose: job control would give each child its own
# process group, and killing the group is the whole point -- under cron this
# script leads its group, so `kill -- -$$` takes the `claude` underneath it too.
echo $$ > "$LOGDIR/running.pid"
date +%s > "$LOGDIR/running.since"

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

# **Hand over to the copy that was just pulled.**
#
# bash reads a script as it goes, and the rebase above rewrites the very file it
# is reading, from underneath it, by however many lines the change was. So a fix
# committed at ten past the hour did not take effect at half past: the tick
# rebased it in and then carried on executing the old text from a byte offset
# that no longer meant anything. That is how two fixes in a row -- a rule against
# deferring work, and the check that would have caught the deferral -- both landed
# on `main` and both failed to run on the next session, silently.
#
# `exec` keeps the process, so file descriptor 9 keeps the lock and `$$` keeps
# the pid the wedge guard records. Nothing is re-acquired and there is no window
# for a second tick to slip in. The marker stops it looping.
export ABYSS_PLAYTEST_FRESH=1
exec bash "$BOT/scripts/playtest.sh" "$@"

fi
# --- the second pass: the file as it stands on `main`, with the lock inherited --

cd "$BOT" || { log "fail: no worktree at $BOT"; exit 1; }
# Traps do not survive `exec`, so the cleanup is re-armed here rather than above.
trap 'rm -f "$LOGDIR/running.pid" "$LOGDIR/running.since"' EXIT

BEFORE="$(git rev-parse HEAD)"
# How many sessions the ledger knew about before this one. A session that writes
# no line is a session that did not finish, and `playpick` counts lines -- so
# without this the second session ever run left the picker believing it was still
# the first, and the commit below wore the previous session's subject.
LEDGER_WAS="$(wc -l < playtest/sessions.jsonl 2>/dev/null || echo 0)"
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
Anything you would like changed in the game is an issue, not an edit.

**Do not commit and do not push.** Leave the files; the runner commits what is
under \`playtest/\`, with your ledger line's \`message\` as the subject, and pushes
it. Anything you leave outside \`playtest/\` is put back and logged as a mistake,
and so is anything you commit outside it.

Issues are in Korean. Source and \`playtest/\` files are in English. Label them
\`playtest\` plus \`bug\` or \`enhancement\`.

The last field of your ledger line must be \`\"message\"\`: one sentence, in
English and in this repository's voice, that will be the commit subject.

## Rules

- **Do not ask questions.** Nobody is here. Decide, and report why.
- **Never run \`playbot\` in the background. Not once, not briefly.** Run it in the
  foreground and let it block. It prints as it goes and a four-minute pull costs
  four minutes; if that is too long, pass fewer seconds.
  **Ending your turn ends the session.** There is no later to pick anything up in:
  the tree is committed as it stands and whatever you were waiting for is never
  read. Four sessions have now been lost here, three of them in a row, and the last
  one's entire output was \"I'll wait here for that background run to finish before
  continuing\" -- which ended it.
- **Write the ledger line even when the session went badly.** \`playpick\` counts
  lines to decide what is under-played, so a missing line makes the next session
  replay this one's cell. A line saying the run was abandoned and why is worth
  more than no line.
- **Do not look for other copies of yourself.** A lock guarantees one. The
  \`playtest.sh\` and \`claude -p\` in the process list are you.
- **Two issues is the cap and 0 is a normal session.** If twelve or more
  \`playtest\` issues are open, file nothing and say the gate was shut.
- **Measure before you claim.** Every number comes from a journal line, and the
  line goes in with it.

## Finish

Report the cell you played, what you did in it that no session had done before,
what you found, what you filed, and why there was not more."

# `-k 120`: SIGTERM at the budget, SIGKILL two minutes later. Without it a child
# that catches SIGTERM and hangs holds this job's lock forever -- which is exactly
# what happened to the other `claude -p` job on this machine.
timeout -k 120 5400 claude -p "$PROMPT" \
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

# And the same boundary, on what it *committed*.
#
# The check above reads the working tree, which is the whole story only while the
# session does as it is told. The first session ever run committed and pushed its
# own work instead of leaving it -- harmlessly, it had only touched `playtest/` --
# and in doing so walked straight past the guard. A session that had edited `src/`
# and committed it would have shipped.
#
# Put back rather than reset: by the time this runs the commit may already be on
# `main`, so the repair has to be a commit of its own.
if [ "$(git rev-parse HEAD)" != "$BEFORE" ]; then
  COMMITTED_OUT="$(git diff --name-only "$BEFORE"..HEAD -- . ':(exclude)playtest')"
  if [ -n "$COMMITTED_OUT" ]; then
    log "WARN: the session committed outside playtest/ -- putting it back"
    echo "$COMMITTED_OUT" >> "$LOG"
    git checkout "$BEFORE" -- . ':(exclude)playtest' 2>>"$LOG"
    git commit -q -m "Put back what a playtest session changed outside playtest/" >>"$LOG" 2>&1
  else
    log "note: the session committed its own work ($(git rev-parse --short HEAD)), inside the boundary"
  fi
fi

if [ "$RC" -ne 0 ]; then
  # A failed hour is not this hour's turn used up.
  log "fail: claude exited $RC -- will retry next tick"
  exit "$RC"
fi

echo "$HOUR" > "$STATE"

# The ledger line carries its own commit subject, so the message says what the
# session did rather than that a session happened.
#
# But only if there *is* a new line. The second session ever run started a play
# script in the background, said it would pick it up when it finished, and ended
# -- so it left a plan file, no ledger line, and a commit wearing the previous
# session's subject, which described work that commit did not contain. A subject
# that lies is worse than a dull one.
LEDGER_NOW="$(wc -l < playtest/sessions.jsonl 2>/dev/null || echo 0)"
if [ -n "$(git status --porcelain -- playtest)" ]; then
  if [ "$LEDGER_NOW" -gt "$LEDGER_WAS" ]; then
    SUBJECT="$(node -e '
      const fs = require("fs")
      const lines = fs.readFileSync("playtest/sessions.jsonl", "utf8").trim().split("\n")
      try { process.stdout.write(JSON.parse(lines[lines.length - 1]).message ?? "") } catch {}
    ' 2>/dev/null)"
    [ -z "$SUBJECT" ] && SUBJECT="An hour of it, played and written down"
  else
    log "warn: the session wrote no ledger line -- it did not finish"
    SUBJECT="A session that did not finish, and what it got as far as"
    # And a line saying so, because the next session is told to read the last few
    # and a gap says nothing. Three sessions in a row ended with "I'll wait here
    # for that background run to finish" and each one left the ledger looking
    # exactly as the one before had: the failure was invisible to the only reader
    # who could have avoided it. The cell is left empty so `playpick` credits no
    # axis for an hour nothing was played in, while still counting the attempt.
    node -e '
      const fs = require("fs")
      fs.appendFileSync("playtest/sessions.jsonl", JSON.stringify({
        when: new Date().toISOString(),
        cell: {},
        plan: null,
        new: "nothing: this session ended without writing a line",
        faults: [],
        saw: "the runner wrote this. The session stopped with work outstanding -- most likely it started playbot in the background and ended its turn, which ends the session. Read the rule about that before doing anything else.",
        verified: [],
        filed: [],
        gate: "unknown",
        abandoned: true,
        message: "A session that did not finish, and what it got as far as",
      }) + "\n")
    ' 2>>"$LOG" || log "warn: could not write the abandoned-session line"
  fi
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
