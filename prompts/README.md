# The prompts, written out

Every asset prompt this repository asks for, one file a sheet, finished and
ready to paste into a generator. Nothing to run, nothing to assemble.

```
order.txt                          the order to generate in
actor_global_townsman_1of4.txt     one sheet
```

**Generate in the order of `order.txt`.** It is not alphabetical and the
ordering is the whole point of it:

* `global` before `biome` before `zone`, because that is how many times an
  asset pays for itself. Seventeen of Elwynn's nineteen creature kinds also
  live on the rest of the continent; file by zone and you draw the same
  townsman forty times.
* Sheet `1of4` of a subject before `2of4`, because every later sheet says
  **참조** and names sheet 1. Attach that image to the call. It is the only
  thing holding one character together across four generations — an image model
  has no memory between calls, so the same description twice gets you two
  different people.

## These are generated, and there is a check for it

`pipeline/make_prompt.py` writes them. They are committed anyway, so a prompt
can be used without a Python on the machine — but the moment a file is
committed the script stops being the only copy, and two copies of a paragraph
are two paragraphs that drift. That is exactly why `docs/art-prompts.md` holds
no prompt text at all.

So the second copy only exists with something checking it against the first:

```
npm run prompt -- --all prompts/   rewrite them
npm run promptcheck                are they still what the script writes?
```

Change a prompt in the script, not here. An edit made here is reverted by the
next `--all`, and `promptcheck` will tell you before that happens.

## Fewer, taller sheets

A generator hands back one canvas whatever is asked of it, so the number of
sheets is a function of how tall an image yours will return. A cell wants 128
pixels:

```
npm run prompt -- --rows 24 --all prompts/
```

| `--rows` | image | sheets |
|---|---|---|
| 12 | 1024 × 1536 | 60 |
| **16** (default) | 1024 × 2048 | **52** |
| 24 | 1024 × 3072 | 36 |

Nothing is lost between them — the rows are the same rows on fewer canvases.
Committed at 16.

## What the art has to come back as

`docs/art-prompts.md` is the rest of this: why every line of a prompt is in it,
what each class of sheet is checked for, and how big anything is on screen. The
short version — a sheet is worthless if its cells disagree with each other. The
first character sheet that came back had its three rows at 158, 146 and 141
pixels, and a twelve per cent scale drift inside one image makes the character
bob as he walks.
