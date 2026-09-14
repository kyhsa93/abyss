# What the wiki promised to check, and what actually checks it

The wiki's thirty-odd pages end in a section called **붙일 검사** — "checks to
add" — and issue 191 asked the obvious question nobody had: how many of them
are actually in the harness?  Nothing counted, which is this repository's own
recurring shape, the one it has already paid for three times: **a thing
computed and never read, a thing promised and never attached.**

Counted: **182 promises across 22 pages, 159 of them kept.**

It was 114 across 15 for a while, and the missing twenty-three are the more
useful number: `wikicheck` matched a heading spelled **붙일 검사** and five
pages do not spell it that way — four say 붙여야 할 검사 and one says 붙인 검사.
So the gate whose whole job is counting promises was not counting a sixth of
them, and passed while saying the two sides agreed.  Sixteen of the twenty-three
turned out to be kept already by checks nobody had written down.

`npm run wikicheck` is the gate, and it is deliberately two checks with
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
| **보이는 건물의 디코드 합계가 예산 안이다** | `scripts/budgetcheck.mjs: "a building is a mask and a tileset, not a picture of itself"` |
| **세계가 세운 건물이 전부 한 장으로 그려진다** | `scripts/viewcheck.mjs: "every building the world stands is drawn in one piece"` |
| **대부분이 타일 격자가 못 담는 각도로 선다** | `scripts/viewcheck.mjs: "and most of them stand at an angle the world grid cannot hold"` |
| **구운 문이 전부 그려진 형태 안에 있다** | `scripts/viewcheck.mjs: "and every door the bake put on a building is inside the shape it draws"` |
| **설명서에 클라이언트의 것이 하나도 없다** | `scripts/bordercheck.mjs: "nothing of the client is in the building briefs"` |
| **설명서의 표면 낱말이 전부 우리 것이다** | `scripts/bordercheck.mjs: "and every surface word in them is one of ours"` |
| **설명서의 크기가 구운 평면도와 맞는다** | `scripts/bordercheck.mjs: "and a brief is the same size as the building the world was baked from"` |
| **평면도가 없는 설명서는 세계가 아무 데도 안 세운 모델이다** | `scripts/bordercheck.mjs: "and a brief with no plan is a model the world placed nowhere"` |
| 파이프라인의 어떤 줄도 `.blp` 를 열지 않는다 | `scripts/bordercheck.mjs: "and nothing in the pipeline opens one of the client's textures"` |
| 보이는 건물 스프라이트가 예산 안이다 | — 건물 스프라이트가 아직 없다 (#218 이 값을 재 두었다) |
| **굴이 지어낸 것이 아니라 모델에서 온다** | `scripts/viewcheck.mjs: "the mines are dug from where the world stands its creatures"` |
| 굴의 입구가 지형 구멍(`gaps` 674칸)과 맞는다 | `scripts/viewcheck.mjs: "the mouth of a mine is a hole and not ground"` |

## [남은-일](https://github.com/kyhsa93/abyss/wiki/남은-일)

| 약속 | 지키는 검사 |
| --- | --- |
| **위키가 "붙일 검사"로 적은 줄이 전부 하니스에 있다** | `scripts/wikicheck.mjs: "every promise the wiki makes is in this table"` |
| 층이 둘 이상인 건물에서 위층에 올라갈 수 있다 | `scripts/viewcheck.mjs: "walking on to a landing puts you on the floor above"` |
| 구운 오브젝트 중 화면에 안 서는 것마다 이유가 붙어 있다 | — 세는 계수기가 없다 (#197) |
| 낱말마다 그림 수가 모델 수의 절반 이상이다 | `scripts/viewcheck.mjs: "no word draws more pictures than the client has models"` |
| **위키에 답이 난 질문이 남아 있지 않다** | — 152개가 그대로 남아 있다 (#192) |
| 예산 문서의 숫자가 실측이다 | `scripts/budgetcheck.mjs: "and the budget document says what was just measured"` |
| 소리 여덟 개가 서로 1 dB 안에 있다 | `scripts/soundcheck.mjs: "and no sound is louder than another"` |
| 소리가 나야 할 자리 중 조용한 것마다 이유가 있다 | `scripts/soundcheck.mjs: "and every silent place on it carries the reason it is silent"` |
| 뒤집힌 결정을 아직 적고 있는 파일이 없다 | `scripts/docscheck.mjs: "and nothing still states a decision that was reversed"` |

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
| 구운 덮개가 클라이언트의 알파와 어긋나지 않는다 | `pipeline/bake_terrain.py: "away from what the "` |
| 페인트 칸이 낱말 둘과 두 번째의 몫을 들고 있다 | `scripts/viewcheck.mjs: "a paint cell carries two grounds and how much of the second"` |
| 섞임이 클라이언트가 가진 정밀도로 유지된다 | `scripts/viewcheck.mjs: "and the mix is kept at the precision the client has, not more"` |
| 숲의 상당 부분이 실제로 두 번째 바닥을 들고 있다 | `scripts/viewcheck.mjs: "and a good share of the forest actually carries one"` |
| 땅을 그릴 때 두 번째 것이 실제로 깔린다 | `scripts/viewcheck.mjs: "and the ground pass lays the second one down"` |
| 보이는 청크 캐시가 예산 안이다 | `scripts/viewcheck.mjs: "and what it keeps to do that is inside its budget"` |
| 그리는 횟수가 지금보다 적다 | `scripts/viewcheck.mjs: "and the plain ground is drawn a plate at a time, not a tile at a time"` |
| 땅이 타일 하나씩이 아니라 판 하나씩 그려진다 | `scripts/viewcheck.mjs: "and the plain ground is drawn a plate at a time, not a tile at a time"` |
| 음영 단계 수가 아틀라스를 키우지 않는다 | `scripts/viewcheck.mjs: "the light is multiplied over the ground, so the atlas does not grow"` |
| 실내 바닥의 음영이 세 단 이하다 | `scripts/viewcheck.mjs: "and a room is lit flat"` |
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
| 굴에 걸어 들어가고 걸어 나올 수 있다 | `scripts/viewcheck.mjs: "a man can walk into a mine"` |
| 굴 안의 사람이 밖에서 안 보이고 안에서는 보인다 | `scripts/viewcheck.mjs: "and what is down there is out of sight until he does"` |
| 통로 폭이 몸 하나이고, 마스크가 재고 나서도 그렇다 | `scripts/viewcheck.mjs: "a passage is a body wide, after the mask has sampled it"` |
| 굴 하나와 다음 굴 사이의 간격이 굴 안 통로보다 훨씬 길다 | `scripts/viewcheck.mjs: "and the cut between one warren and the next is not a close call"` |
| 땅 밑의 모두가 굴에 있거나 세어져 있다 | `scripts/viewcheck.mjs: "and everybody under the surface is in a mine or counted out"` |
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
| **정보창에 3D 모델이 없다** | `scripts/viewcheck.mjs: "the character sheet does not claim to show what you are wearing"` |
| 정보창이 입은 것 전부를 보여 준다 | `scripts/viewcheck.mjs: "and shows every slot as a square instead"` |
| **실내에서 미니맵이 바깥 지형을 안 그린다** | `scripts/viewcheck.mjs: "and indoors it is a map of the building"` |
| 실내 미니맵이 지금 층만 그린다 | `scripts/viewcheck.mjs: "and a map of the storey you are standing on"` |

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

## [자동-시전과-주문서](https://github.com/kyhsa93/abyss/wiki/자동-시전과-주문서)

| 약속 | 지키는 검사 |
| --- | --- |
| **자동 공격이 바의 칸을 차지하지 않는다** | `scripts/uicheck.mjs: "no square on the bar is the attack"` |
| 대상이 없고 닿는 곳에 적이 있으면 저절로 대상이 잡힌다 | `scripts/uicheck.mjs: "and it finds something to aim at without being handed one"` |
| 자동이 꺼져 있으면 화 안 난 것은 안 겨눈다 | `scripts/uicheck.mjs: "and with it off it aims at nothing that is not already angry"` |
| 전화기의 자동 단추를 손가락으로 켜고 끌 수 있다 | `scripts/padcheck.mjs: "and a finger turns it on and off again"` |
| **자동 시전이 켜져 있으면 바에 올린 것이 실제로 시전된다** | `scripts/uicheck.mjs: "and with it on, the bar casts itself"` |
| 자동 시전이 쓸 수 없는 것을 안 쓴다 (`why(sp) !== null`) | `scripts/uicheck.mjs: "and it is the leftmost square it can use"` |
| 자동 시전을 켠 쪽이 끈 쪽보다 많이 이긴다 (화면이 아니라 시뮬에서 — 브라우저는 400판을 못 돌린다) | `scripts/simcheck.mjs: "and pressing something beats pressing nothing"` |
| 주문서의 모든 주문을 창에서 볼 수 있다 | `scripts/uicheck.mjs: "and every spell the character knows is in it"` |
| **바에 놓은 자리가 다시 켜도 그대로다** | `scripts/uicheck.mjs: "and the arrangement comes back out of the save"` |
| 전화기와 데스크톱에서 같은 자동 시전이 돈다 | `src/touch.ts: setAuto` |

## [옛-아비스에서-계승할-것](https://github.com/kyhsa93/abyss/wiki/옛-아비스에서-계승할-것)

| 약속 | 지키는 검사 |
| --- | --- |
| 상태창이 2.9 : 1 이고 14픽셀 아래로 안 내려간다 | `scripts/padcheck.mjs: "the player's frame is the old game's shape"` |

## [전화기](https://github.com/kyhsa93/abyss/wiki/전화기)

| 약속 | 지키는 검사 |
| --- | --- |
| **주문서의 모든 능력이 엄지 밑에 온다** | `scripts/padcheck.mjs: "and every ability in the spellbook comes under a thumb"` |
| **쪽 넘김이 한 바퀴 돌아온다** | `scripts/padcheck.mjs: "and the page turn comes back round"` |
| **한글을 쓰는 것 중 11px 아래가 없다** | `scripts/padcheck.mjs: "and nothing on the glass writes Hangul below it"` |
| **바닥 해상도에서, 눕혀서도, 배치가 같은 약속을 지킨다** | `scripts/padcheck.mjs: "the floor, lying down"` |
| 각 자리를 눌렀을 때 그 능력이 나간다 | `scripts/padcheck.mjs: "a thumb beside the button still presses it"` |
| hover 없이도 능력의 비용과 대기가 화면에 있다 | `scripts/padcheck.mjs: "holding a button asks what it is"` |
| 세계를 탭하면 겨눠지고, 스틱·버튼을 방해하지 않는다 | `scripts/padcheck.mjs: "and a tap on something that fights back aims at it"` |
| 스틱과 버튼이 안전영역 밖이다 | `scripts/padcheck.mjs: "the thumbs rest above whatever the phone has taken"` |
| 경험치바가 엄지와 안 겹치고 아래 변에 붙어 있다 | `scripts/padcheck.mjs: "the strip that is read and not pressed is under the thumbs"` |
| 경험치바가 홈 인디케이터 위에 꽂혀 있다 | `scripts/padcheck.mjs: "and it is pinned above the home indicator"` |
| 채팅창이 원작의 모서리·비율이다 | `scripts/padcheck.mjs: "the chat window is the original's shape"` |
| 채팅창이 스틱 위에서 멈춘다 | `scripts/padcheck.mjs: "and it stops above the stick"` |
| **줌의 천장이 유도된 수다** | `scripts/viewcheck.mjs: "the zoom floor is the opening framing over the camera slider"` |
| **어느 줌에서도 프레임률이 바닥 아래로 안 떨어진다** | `scripts/viewcheck.mjs: "no zoom drops the ground below the floor"` |
| **가장 멀리 당긴 화면에서 사람이 곁의 글자보다 작지 않다** | `scripts/padcheck.mjs: "and a person is no smaller there than the type beside him"` |
| 세계 캔버스가 `pixelated` 다 | — 캔버스의 CSS 를 읽는 것이 없다 |
| 예산표에 전화기 열이 있고 넘긴 것이 없다 | — `docs/budget.md` 는 실측이지만 전화기 열이 따로 없다 |
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
| **가로에서도 한 화면에 든다** | `scripts/padcheck.mjs: "most of it is on the glass"` |
| 누를 것이 전부 44픽셀 이상이다 | `scripts/padcheck.mjs: "every one of them takes a finger"` |
| 미리보기가 어느 항목을 고르든 보인다 | `scripts/padcheck.mjs: "the preview is on the glass"` |

## [퀘스트를-원본과-대-보다](https://github.com/kyhsa93/abyss/wiki/퀘스트를-원본과-대-보다)

| 약속 | 지키는 검사 |
| --- | --- |
| 구운 퀘스트가 전부 `slice.json` 의 레벨 안에 있다 | `pipeline/quests.py: taken_at` |
| 구운 퀘스트를 전부 그 클래스가 받을 수 있다 | `scripts/classcheck.mjs: "no errand is shipped for a class this game has not got"` |
| **레벨 1~10에 벌 수 있는 퀘스트 돈 < 훈련비 + 최고 장비** | `pipeline/items.py: purse` |
| 보상 아이템이 전부 `items.json` 안에 있다 | `pipeline/items.py: check_rewards` |
| `ExclusiveGroup` 이 같은 것 중 하나만 할 수 있다 | `scripts/questcheck.mjs: "no two of one exclusive group are both on offer"` |
| **이 지역의 일거리를 다 하면 평판이 한 등급을 넘는다** | `pipeline/quests.py: check_standing` |
| 사슬을 끝까지 걸었을 때 밖으로 나가지 않는다 | `scripts/questcheck.mjs: "every link of every chain points inside this game"` |


## [소리](https://github.com/kyhsa93/abyss/wiki/소리)

| 약속 | 지키는 검사 |
| --- | --- |
| 소리 파일 합계가 예산 안이다 | `scripts/budgetcheck.mjs: "and the sounds are a rounding error"` |
| 모든 소리에 크레딧이 있다 | `scripts/soundcheck.mjs: "has a row for every sound"` |
| 소리를 끄고도 모든 정보가 화면에 있다 | `scripts/soundcheck.mjs: "and every row names what says the same on screen"` |
| 동시 재생이 상한을 넘지 않는다 | — 상한이 없기 때문이다. 겹치는 소리마다 소스 노드를 새로 만들고, 여덟 개가 다 0.7초 아래이며 한 번의 교전이 초당 한 번 남짓 때린다. 셀 상한이 생기는 날 붙는다 |
| 여덟 개가 서로 1 dB 안에 있다 | `scripts/soundcheck.mjs: "and no sound is louder than another"` |
| 여덟 개가 전부 모노 22,050 Hz 16비트다 | `scripts/soundcheck.mjs: "and every one of them is mono"` |
| `SOUNDS` 의 낱말마다 실제로 내는 곳이 있다 | `scripts/soundcheck.mjs: "and every word the game has is actually said somewhere"` |
| 조용한 자리마다 조용한 이유가 적혀 있다 | `scripts/soundcheck.mjs: "and every silent place on it carries the reason it is silent"` |

## [데이터-경제와-상점](https://github.com/kyhsa93/abyss/wiki/데이터-경제와-상점)

| 약속 | 지키는 검사 |
| --- | --- |
| 슬라이스에서 벌 수 있는 돈 ≥ 훈련 비용 | `pipeline/items.py: "the slice pays about"` |
| 슬라이스에서 벌 수 있는 돈 < 훈련 + 최고 장비 | `pipeline/items.py: "the slice pays about"` |
| 모든 상인의 `item` 이 구운 아이템 안에 있다 | `pipeline/items.py: "things for sale"` |
| 모든 훈련사의 주문이 구운 주문 안에 있다 | `pipeline/items.py: "trainers over"` |
| `SellPrice = 0` 인 전리품의 비율 | — 떨어지는 것에 행이 있는지는 보지만(`"can fall off something here"`), 그중 못 파는 것의 **비율**은 아무도 안 센다 |
| **채집으로 얻는 재료마다 그것을 쓰는 조리법이 있다** | `pipeline/trades.py: "materials can be gathered at a rank this game"` |
| 조리법이 부르는 재료를 이 세계가 내놓거나 만든다 | `pipeline/trades.py: "of them asking"` |

## [데이터-좌표계와-단위](https://github.com/kyhsa93/abyss/wiki/데이터-좌표계와-단위)

| 약속 | 지키는 검사 |
| --- | --- |
| 알려진 좌표 → 타일 번호 표 | `pipeline/bake_terrain.py: "human start"` |
| 타일 번호 → 좌표 → 타일 번호 왕복 | — `tile_of` 의 괄호 교훈은 주석에 있고 왕복은 아무 데서도 돌지 않는다 |
| 이웃 타일의 높이 격자가 경계에서 일치 | `pipeline/bake_terrain.py: "of them written twice"` |
| 월드 → 화면 → 월드 왕복 (같은 높이에서) | — 정방향은 세 줄이 못 박지만(북·서·야드), 역방향 `worldAt` 은 클릭 조준이 쓰기만 하고 왕복으로 재는 곳이 없다 |
| 1 야드가 화면에서 항상 같은 픽셀 | `scripts/viewcheck.mjs: "and a yard is a yard either way round"` |

## [데이터-대화와-조건](https://github.com/kyhsa93/abyss/wiki/데이터-대화와-조건)

| 약속 | 지키는 검사 |
| --- | --- |
| 구현하지 않은 조건 타입을 만나면 **기록한다** | `pipeline/spawn_npcs.py: "conditions this game cannot answer, by kind"` |
| 조건이 참조하는 퀘스트·아이템·주문이 슬라이스 안에 있다 | — 조건이 못 읽는 종류는 세어 출력하지만, 읽은 조건이 **가리키는 것**이 이 슬라이스에 있는지는 아무도 안 묻는다 |
| `ElseGroup` 이 AND/OR 표로 재현된다 | — `ElseGroup` 을 아직 읽지 않는다. 좁은 마스크가 촌평이고 부정 행이 여집합이라는 두 규칙이 그 자리에 있다 |
| 대화 선택지가 가리키는 메뉴·상점·훈련사가 존재한다 | — `directs` 는 굽고 `talk.ts` 가 읽지만, 가리키는 메뉴가 실제로 있는지는 확인하지 않는다 |

## [걸을-수-있는-세계를-재는-법](https://github.com/kyhsa93/abyss/wiki/걸을-수-있는-세계를-재는-법)

| 약속 | 지키는 검사 |
| --- | --- |
| 엄격한 잣대가 느슨한 잣대만큼의 세계를 잰다 (걸음 14만 칸·있을 수 있나 20만 칸 아래로 내려가면 실패) | `scripts/viewcheck.mjs: "the strict yardstick reaches as much world as the loose one"` |
| **네 잣대 전부가 중요한 곳들에 대해 같은 답을 한다** — 이것이 없던 것이다 | `scripts/viewcheck.mjs: "and every yardstick agrees you can get to the places that matter"` |
| 시작 지점에서 골드샤이어까지 **실제로 걸어서 간다** (물 붓기가 찾은 길을 칸마다, 스틱을 미는 것과 같은 `walk` 으로, `slide` 까지 걸어서) | `scripts/viewcheck.mjs: "and a man can actually walk from the start to Goldshire"` |

## [저작권과-배포-경계](https://github.com/kyhsa93/abyss/wiki/저작권과-배포-경계)

| 약속 | 지키는 검사 |
| --- | --- |
| 뒤집힌 결정을 아직 적고 있는 파일이 없다 | `scripts/docscheck.mjs: "and nothing still states a decision that was reversed"` |
| 구운 파일에 모델 경로·아카이브·테이블 이름이 없다 | `pipeline/bake.py: verify` |
| 번역마다 원문의 해시가 있고 낡은 것을 말한다 | `pipeline/prose.py: "the English moved under these"` |
| 커밋된 것 중 영어 퀘스트 원문이 없다 | — `prose.py` 가 영어를 안 쓰는 것은 규칙이지 검사가 아니다. 커밋된 파일에 영어 원문이 없는지 세는 곳이 없다 |
