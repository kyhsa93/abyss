# What art this game has, and whose it is

Built by `pipeline/catalogue.py` out of what
`pipeline/fetch_assets.py` acquired. Do not edit; run it.

## Whose

| source | licence | author | files |
|---|---|---|---|
| game-icons.net | CC-BY-3.0 | Lorc, Delapouite and contributors (named per icon in the archive) | 4179 |
| Kenney game assets | CC0-1.0 | Kenney (Kenney.nl) | 15503 |
| Modular RPG Characters | CC0-1.0 | System G6 (Qoma) | 51 |
| Poly Pizza (Quaternius and others) | CC0-1.0 / CC-BY-3.0 | per model, recorded at fetch | 599 |
| Pretendard | OFL-1.1 | 길형진 (orioncactus) | 56 |

CC0 asks for nothing. **CC-BY and CC-BY-SA ask for the author by name**, and
the author of a game-icons piece is the directory it sits in — so the path is
the attribution and it has to survive into whatever the bake writes.

## What

Two questions, kept apart: **kind** is what a file depicts and **form** is what
shape it is in. A sword icon is both, and filing it under one of them means
either the spellbook or the armoury cannot find it.

| kind | font | icon | model | sound | sprite | texture | animated | total |
|---|---|---|---|---|---|---|---|---|
| `ui` | 33 | 2137 | 52 | 57 | 4692 |  |  | 6971 |
| `(no kind)` | 44 | 3305 | 436 | 236 | 893 | 87 |  | 5001 |
| `prop` |  | 339 | 1450 |  | 231 | 6 | 3 | 2026 |
| `building` |  | 139 | 1196 |  | 191 | 18 | 4 | 1544 |
| `weapon` | 1 | 411 | 124 |  | 416 |  | 1 | 952 |
| `particle` | 12 | 126 | 16 | 25 | 581 | 13 |  | 773 |
| `vegetation` |  | 75 | 572 | 5 | 111 |  |  | 763 |
| `rock` |  | 41 | 568 |  | 128 |  |  | 737 |
| `tile` |  | 6 | 288 |  | 414 |  |  | 708 |
| `creature` | 2 | 215 | 145 |  | 155 |  | 72 | 517 |
| `character` |  | 21 | 165 |  | 16 | 82 | 62 | 284 |
| `armour` |  | 68 | 8 |  | 12 | 24 | 2 | 112 |

20388 files. 5001 of them carry no kind — they are in the register all the same and
findable by name; `python3 pipeline/catalogue.py --stray` lists them.
