# The performance budget, measured

**Written by `npm run budgetcheck -- --write`.  Do not edit by hand** — a
plain `npm run budgetcheck` fails when this file says something other than
what the check would write: every word exactly, and every measured number to
within its last shown digit, so a rounding step between two builds is not a
failure and a real drift is.

The wiki page [성능 예산] keeps the *decisions* — why the decoded-sheet
ratchet is twenty-four and not sixty-four, why one world is counted and not
two — and points here for the numbers.  A number written in two places is a
number that goes stale in one of them, which is what issue 207 found: the
page opened with *"every number above is a draft"* while this check had been
going red on four of them for rounds.

| what | measured | budget |
| --- | ---: | ---: |
| the script a browser is handed | 82 KB | 500 KB |
| the world a first visit downloads | 3.37 MB | 4.00 MB |
| everything the deploy carries | 31.13 MB | 200.00 MB |
| the sounds | 135 KB | 2048 KB |
| the sheets the scene opens, decoded | 21.58 MB | 24.00 MB |
| and against the desktop ceiling | 21.58 MB | 64.00 MB |
| the buildings, decoded | 0.41 MB | 4.00 MB |
| a save, a character who has finished this game | 2 KB | 4 KB |
| and every slot holding one | 16 KB | 40 KB |

* **the script a browser is handed** — gzipped; `dist` less the service worker.
* **the world a first visit downloads** — gzipped; one world — the client's terrain plus everything that is not terrain.
* **everything the deploy carries** — on disk, not gzipped, and every file — both worlds, all 157 sheets, every icon.  A Pages site may be a gigabyte; two hundred megabytes is where this repository would start thinking about `git lfs` again.
* **the sounds** — 8 files, on disk, mono at 22,050 Hz and levelled to within a decibel of each other.  The headroom is not spare: one music track from the same collection is 1.5 MB.
* **the sheets the scene opens, decoded** — `width × height × 4`, not the file size — a transparent pixel is free in a PNG and full price in memory.  A ratchet rather than a device limit.
* **and against the desktop ceiling** — the same pixels against the figure the budget page has always carried.
* **the buildings, decoded** — every footprint the world ships, unpacked to one bit a cell — five masks a storey.  The rejected alternative, one bitmap a model at the ground's own 24 pixels a yard, is 299 MB.
* **a save, a character who has finished this game** — JSON in UTF-8 — the newest sample in `scripts/fixtures/saves/`, level 10, with all 51 of the world's errands done.
* **and every slot holding one** — 10 slots, the client's `MAX_CHARACTERS_PER_REALM`.
