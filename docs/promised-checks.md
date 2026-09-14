# What the wiki promised to check, and what actually checks it

The wiki's thirty-odd pages end in a section called **붙일 검사** — "checks to
add" — and issue 191 asked the obvious question nobody had: how many of them
are actually in the harness?  Nothing counted, which is this repository's own
recurring shape, the one it has already paid for three times: **a thing
computed and never read, a thing promised and never attached.**

Counted: **102 promises across 14 pages, 80 of them kept.**

`npm run promisecheck` is the gate, and it is deliberately two checks with
different reaches:

  * **Without the wiki** — which is what CI has — it reads this table and
    asserts that every check named in the right-hand column *exists*.  A
    promise this file claims is kept by a label nobody runs any more is the
    same lie in a different place.
  * **With the wiki** (`ABYSS_WIKI=<a clone>`) it also asserts that this table
    and the wiki's own 붙일 검사 tables name the **same set of promises**.  So
    a new line in the wiki fails until somebody writes down what keeps it, or
    that nothing does.

The right-hand column has three shapes.  A quoted string is a check label and
must appear verbatim in the file named — quoted rather than named because
`padcheck` and `shotcheck` build some of their labels out of a template, and
the part that is not the template is what identifies the check.  A bare word
is a symbol in a pipeline stage, because a Python check is a `print('check:
...')` with an f-string in it and there is no literal to match.  An em dash is
**nobody keeps this yet**, and the reason follows it.

Generated once from the wiki and maintained by hand after; the check is what
keeps it honest.

## [건물을-다시-그린다](https://github.com/kyhsa93/abyss/wiki/건물을-다시-그린다)

| 약속 | 지키는 검사 |
| --- | --- |
| **그린 그림의 크기가 모델의 상자와 어긋나지 않는다** | — 건물 스프라이트가 아직 없다 (#216) |
| 그린 그림의 문 자리가 구운 문 좌표와 맞는다 | — 건물 스프라이트가 아직 없다 (#216) |
| 건물마다 그림이 있고, 없으면 세어 출력한다 | `pipeline/facade.py: "sheets cover half the placements"` |
| **나가는 데이터에 Blizzard 텍스처가 없다** | `pipeline/bake.py: verify` |
| 보이는 건물 스프라이트가 예산 안이다 | — 건물 스프라이트가 아직 없다 (#218 이 값을 재 두었다) |
| **굴이 지어낸 것이 아니라 모델에서 온다** | `scripts/viewcheck.mjs: "the mines are dug from where the world stands its creatures"` |
| 굴의 입구가 지형 구멍(`gaps` 674칸)과 맞는다 | `scripts/viewcheck.mjs: "the mouth of a mine is a hole and not ground"` |

## [남은-일](https://github.com/kyhsa93/abyss/wiki/남은-일)

| 약속 | 지키는 검사 |
| --- | --- |
| **위키가 "붙일 검사"로 적은 줄이 전부 하니스에 있다** | `scripts/promisecheck.mjs: "every promise the wiki makes is in this table"` |
| 층이 둘 이상인 건물에서 위층에 올라갈 수 있다 | `scripts/viewcheck.mjs: "walking on to a landing puts you on the floor above"` |
| 구운 오브젝트 중 화면에 안 서는 것마다 이유가 붙어 있다 | — 세는 계수기가 없다 (#197) |
| 낱말마다 그림 수가 모델 수의 절반 이상이다 | `scripts/viewcheck.mjs: "no word draws more pictures than the client has models"` |
| **위키에 답이 난 질문이 남아 있지 않다** | — 152개가 그대로 남아 있다 (#192) |
| 예산 문서의 숫자가 실측이다 | — 문서가 아직 "전부 초안"이다 (#207) |

## [문과-층](https://github.com/kyhsa93/abyss/wiki/문과-층)

| 약속 | 지키는 검사 |
| --- | --- |
| **시작 지점에서 걸어 닿는 칸의 수가 이전 판보다 줄지 않는다** | `scripts/viewcheck.mjs: "the walkable world is still a world"` |
| **시작 지점에서 골드샤이어와 수도원 문 둘 다에 걸어 닿는다** | `scripts/viewcheck.mjs: "and every yardstick agrees you can get to the places that matter"` |
| 구운 문의 90% 이상을 밖에서 걸어가 밟을 수 있다 | `scripts/viewcheck.mjs: "every door on a building's outside can be walked to"` |
| 어떤 순간이동도 막힌 칸에 사람을 내려놓지 않는다 | `scripts/viewcheck.mjs: "a charge that would land inside something lands beside it instead"` |
| 막힌 칸에서 출발해도 열린 칸으로만 나갈 수 있다 | `scripts/viewcheck.mjs: "and every way out of it ends somewhere you can stand"` |
| 쫓아오는 NPC가 플레이어가 못 지나는 곳을 못 지난다 | `scripts/viewcheck.mjs: "and it does not walk through the wall to get at you"` |
| 층이 둘 이상인 건물에서 위층에 올라갈 수 있다 | `scripts/viewcheck.mjs: "walking on to a landing puts you on the floor above"` |
| 구운 문의 층 분포가 클라이언트의 문턱 분포와 같다 | `pipeline/bake_terrain.py: "doorways on every floor come out open"` |

## [바닥이-꼭-타일이어야-하나](https://github.com/kyhsa93/abyss/wiki/바닥이-꼭-타일이어야-하나)

| 약속 | 지키는 검사 |
| --- | --- |
| **땅에 한 타일 주기의 되풀이가 없다** | `scripts/shotcheck.mjs: "and the grid does not stand out at one tile"` |
| 구운 덮개가 클라이언트의 알파와 어긋나지 않는다 | — 덮개를 낱말로 누르고 있다 (#211) |
| 보이는 청크 캐시가 예산 안이다 | — 청크 비트맵이 아직 없다 (#212) |
| 그리는 횟수가 지금보다 적다 | — 청크 비트맵이 아직 없다 (#212) |
| **나가는 데이터에 Blizzard 텍스처가 없다** | `pipeline/bake.py: verify` |

## [세계가-비어-보인다](https://github.com/kyhsa93/abyss/wiki/세계가-비어-보인다)

| 약속 | 지키는 검사 |
| --- | --- |
| **`blocked` 로 재도 시작 지점에서 골드샤이어에 걸어 닿는다** | `scripts/viewcheck.mjs: "and a man can actually walk from the start to Goldshire"` |
| 걸을 수 있는 자리에서 한 화면에 사람이 평균 한 명 이상 보인다 | `scripts/viewcheck.mjs: "and a walkable spot has somebody on screen on average"` |
| 밖에서 안 보이는 NPC 가 실제로 지붕 아래에만 있다 | `scripts/viewcheck.mjs: ", everybody left out of the scene is under a roof"` |
| **주인공이 든 것이 화면에 그려진다** | `scripts/viewcheck.mjs: "and holding one puts another layer on the man"` |
| 때릴 때 주인공과 대상이 서 있는 자세가 아니다 | `scripts/viewcheck.mjs: "every clip that was cut gets played"` |
| 구워 놓고 한 번도 안 트는 동작이 없다 | `scripts/viewcheck.mjs: "every clip that was cut gets played"` |
| 물에 들어갈 수 있다 | `scripts/viewcheck.mjs: "most of the water can be got to"` |
| 구운 퀘스트 수가 원작의 받을 수 있는 퀘스트 수의 80% 이상이다 | `pipeline/quests.py: runnable` |

## [실내-바닥](https://github.com/kyhsa93/abyss/wiki/실내-바닥)

| 약속 | 지키는 검사 |
| --- | --- |
| **실내로 판정된 칸에 바깥 땅 그림이 한 장도 안 그려진다** | `scripts/viewcheck.mjs: "and no outdoor ground is drawn inside it"` |
| 건물 하나의 실내에 쓰이는 바닥 그림이 세 종 이하다 | — 세는 것이 없다 |
| `solid` 중 4칸 이하 덩어리에 있는 칸이 20% 미만이다 | `pipeline/bake_terrain.py: "of them in lumps of"` |
| 건물 테두리 중 벽으로 표시된 비율이 80% 이상이다 | `pipeline/bake_terrain.py: "cells of outline"` |
| **건물 중심에서 걸어 나갈 수 있는 방향의 수가 문 개수와 맞는다** | `scripts/viewcheck.mjs: "every door on a building's outside can be walked to"` |
| 실내 바닥의 음영 단계가 세 단 이하다 | — 실내 음영을 세는 것이 없다 |

## [실내와-바깥](https://github.com/kyhsa93/abyss/wiki/실내와-바깥)

| 약속 | 지키는 검사 |
| --- | --- |
| 닫힌 건물마다 문이 하나 이상이거나, 없다고 **선언**돼 있다 | `pipeline/facade.py: "have no ground-floor door"` |
| 모든 문의 바깥 칸이 들에서 걸어 닿는다 | `scripts/viewcheck.mjs: "and the ground outside almost every door can be walked to"` |
| 모든 문의 안쪽 칸이 그 실내의 `floor` 다 | — 안쪽 칸을 재는 것이 없다 |
| 들에서 건물 안쪽 땅이 한 칸도 안 그려진다 | `scripts/viewcheck.mjs: "and no outdoor ground is drawn inside it"` |
| 실내로 옮겨 간 55명이 하나도 사라지지 않는다 (역할별 수 보존) | `scripts/viewcheck.mjs: ", everybody left out of the scene is under a roof"` |
| 굴 안의 크리처가 들에도 서 있지 않는다 | `scripts/viewcheck.mjs: "and nobody is standing inside one"` |
| 같은 씨앗은 같은 굴 | `scripts/viewcheck.mjs: "and the same world digs the same mine"` |
| 실내에서 저장하고 불러오면 실내다 | — 저장이 실내인지를 안 적는다 (#206) |
| `shotcheck` 에 실내 자리 둘 (여관·수도원) | — 기준 그림 여섯 장이 전부 바깥이다 |

## [아이콘](https://github.com/kyhsa93/abyss/wiki/아이콘)

| 약속 | 지키는 검사 |
| --- | --- |
| 액션바의 아이콘이 전부 서로 다르다 (기본값이 두 번 쓰이지 않는다) | `pipeline/bake_ui.py: "none of them shared"` |
| 주문서의 모든 주문에 `ICON_OF` 항목이 있다 | `pipeline/bake_ui.py: "abilities with no picture"` |
| `(낱말, 칸)` 짝 31가지에 전부 아이콘이 있다 | `pipeline/bake_ui.py: check_goods` |
| 화면에 걸린 `<img>` 가 전부 불러와진다 (`naturalWidth > 0`) | — 화면의 <img> 를 세는 것이 없다 |
| **품질이 화면 어딘가에서 읽힌다** | `scripts/bordercheck.mjs: "every baked item column is read somewhere in src/"` |
| `art/UI-CREDITS.md` 가 쓰는 아이콘 전부를 담는다 | `pipeline/bake_ui.py: CREDIT` |

## [원본과의-대조](https://github.com/kyhsa93/abyss/wiki/원본과의-대조)

| 약속 | 지키는 검사 |
| --- | --- |
| `#bar` 의 채워진 칸 수 = 주문서의 크기 | `scripts/uicheck.mjs: "the bar starts with what the character knows"` |
| 각 칸의 `key` 를 눌렀을 때 그 칸의 능력이 나간다 | `scripts/uicheck.mjs: "and every square answers to the letter on it"` |
| 건물 안에 구멍으로 그려지는 칸이 0 | `scripts/viewcheck.mjs: "Goldshire has no pit in the middle of it"` |
| 세 시의 화면과 정오의 화면이 **다르다** | `scripts/viewcheck.mjs: "noon is brighter than three in the morning"` |
| 물이 20%를 넘는 지역은 건물 이름을 갖지 않는다 | `scripts/bordercheck.mjs: "nowhere a fifth under water is named after a building"` |
| 훈련사가 가르치는 주문이 전부 구운 주문서 안에 있다 | `pipeline/items.py: check_lessons` |
| 걸을 수 있는 칸 중 슬라이스 밖 지역의 비율이 0 | `scripts/viewcheck.mjs: "no walkable ground belongs to another zone"` |
| `lineFor` 의 대체 경로가 한 번도 안 쓰인다 | `scripts/viewcheck.mjs: "and the bare-handed fallback is never reached"` |

## [원작의-창](https://github.com/kyhsa93/abyss/wiki/원작의-창)

| 약속 | 지키는 검사 |
| --- | --- |
| **전화기에서 어떤 판도 스틱과 다섯 칸을 덮지 않는다** | `scripts/padcheck.mjs: ": nothing is drawn on a thumb"` |
| 전화기에서 늘 떠 있는 요소가 상태 표시뿐이다 | `scripts/padcheck.mjs: "and everything left standing is a readout"` |
| 상인 창의 자리와 크기가 `layout.json` 에서 온다 | `scripts/uicheck.mjs: "a shop is the original's window"` |
| 재고가 열 칸을 넘으면 쪽이 넘어간다 | `scripts/uicheck.mjs: "a shop is the original's window"` |
| 화면의 글씨 크기가 전부 `spec.font` 에서 나온 값이다 | `scripts/padcheck.mjs: "the phone type is the client's own ladder"` |
| **정보창에 3D 모델이 없다** | `scripts/viewcheck.mjs: "the character sheet has no paperdoll on it"` |
| 정보창이 입은 것 전부를 보여 준다 | `scripts/viewcheck.mjs: "and shows every slot as a square instead"` |
| **실내에서 미니맵이 바깥 지형을 안 그린다** | — 실내 미니맵이 아직 없다 (#205) |
| 실내 미니맵이 지금 층만 그린다 | — 실내 미니맵이 아직 없다 (#205) |

## [인터페이스의-명세](https://github.com/kyhsa93/abyss/wiki/인터페이스의-명세)

| 약속 | 지키는 검사 |
| --- | --- |
| 상태에 **두 창을 같이 여는 조합**이 있고, 같은 `area` 는 같이 못 뜬다 | `scripts/uicheck.mjs: ": no panel covers another"` |
| 화면의 모든 글자 크기가 `<FontHeight>` 눈금 위에 있다 | `scripts/padcheck.mjs: "the phone type is the client's own ladder"` |
| 자원 바의 색이 `PowerBarColor` 다 | `scripts/uicheck.mjs: "and the page is using it"` |
| 테두리 두께가 edgeSize 다섯 중 하나다 | `scripts/uicheck.mjs: "and what it does not take is written down"` |
| 프레임의 조각 수가 클라이언트의 조각 수와 같다 | — 조각을 세는 것이 없다 |
| 초상이 비어 있지 않고, 장비를 바꾸면 바뀐다 | `scripts/viewcheck.mjs: "and what he is wearing changes the picture"` |
| 내보낸 숫자에 파일 이름도 문장도 없다 | `scripts/uicheck.mjs: "and what it does not take is written down"` |
| `shotcheck` 기준을 다시 뜰 때 사람이 본다 | `scripts/shotcheck.mjs: " is a picture of somewhere"` |

## [전화기](https://github.com/kyhsa93/abyss/wiki/전화기)

| 약속 | 지키는 검사 |
| --- | --- |
| 엄지 버튼 자리의 수 = 전화기가 쓸 수 있는 능력의 수 | `scripts/padcheck.mjs: "the thumb can reach the abilities"` |
| 각 자리를 눌렀을 때 그 능력이 나간다 | `scripts/padcheck.mjs: "a thumb beside the button still presses it"` |
| hover 없이도 능력의 비용과 대기가 화면에 있다 | `scripts/padcheck.mjs: "holding a button asks what it is"` |
| 세계를 탭하면 겨눠지고, 스틱·버튼을 방해하지 않는다 | — 세계를 탭해도 안 겨눠진다 (#203) |
| 스틱과 버튼이 안전영역 밖이다 | `scripts/padcheck.mjs: "the thumbs rest above whatever the phone has taken"` |
| 세계 캔버스가 `pixelated` 다 | — 캔버스의 CSS 를 읽는 것이 없다 |
| 예산표에 전화기 열이 있고 넘긴 것이 없다 | — 예산 문서에 실측이 없다 (#207) |
| **두 마리가 붙었을 때의 사망률을 전화기에서도 잰다** | — 전화기에서 싸움을 재는 것이 없다 |

## [처음-만드는-화면](https://github.com/kyhsa93/abyss/wiki/처음-만드는-화면)

| 약속 | 지키는 검사 |
| --- | --- |
| 화면의 자리와 크기가 `GlueXML` 에서 나온 값이다 | `scripts/uicheck.mjs: "and every control is the size the client states"` |
| **종족·직업 이름이 DBC 에서 나온다** | `pipeline/layout.py: who` |
| 고를 수 있는 (종족, 직업) 짝이 `CharBaseInfo` 와 같다 | `scripts/uicheck.mjs: "the screen offers exactly what CharBaseInfo allows"` |
| 고를 수 있는 직업 전부에 주문서가 있다 | `scripts/classcheck.mjs: "every class a player may pick has a spellbook"` |
| 고를 수 있는 직업 전부에 슬라이스 안 훈련사가 있다 | `scripts/classcheck.mjs: "every class a player may pick has a trainer in the slice"` |
| **외모를 고른 대로 세계의 스프라이트가 바뀐다** | `scripts/uicheck.mjs: "and the world draws what was chosen"` |
| 만든 캐릭터가 저장되고 목록에 나온다 | `scripts/uicheck.mjs: "a character that was made is there when you come back"` |
| 전화기에서도 만들고 고를 수 있다 | `scripts/padcheck.mjs: "and a finger picks one and goes in"` |

## [퀘스트를-원본과-대-보다](https://github.com/kyhsa93/abyss/wiki/퀘스트를-원본과-대-보다)

| 약속 | 지키는 검사 |
| --- | --- |
| 구운 퀘스트가 전부 `slice.json` 의 레벨 안에 있다 | `pipeline/quests.py: taken_at` |
| 구운 퀘스트를 전부 그 클래스가 받을 수 있다 | `scripts/classcheck.mjs: "no errand is shipped for a class this game has not got"` |
| **레벨 1~10에 벌 수 있는 퀘스트 돈 < 훈련비 + 최고 장비** | `pipeline/items.py: purse` |
| 보상 아이템이 전부 `items.json` 안에 있다 | `pipeline/items.py: check_rewards` |
| `ExclusiveGroup` 이 같은 것 중 하나만 할 수 있다 | `scripts/questcheck.mjs: "no two of one exclusive group are both on offer"` |
| 사슬을 끝까지 걸었을 때 밖으로 나가지 않는다 | `scripts/questcheck.mjs: "every link of every chain points inside this game"` |

