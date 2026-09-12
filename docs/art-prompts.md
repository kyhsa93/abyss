# Prompts for generating the art

What to ask a generator for, how the asks are filed, and — the part worth
keeping rather than pasting into a chat window — why each line of a prompt is
in it. Every constraint below is there because getting it wrong cost this
repository a round.

The prompts are Korean and the prose around them is English. That is the split
`src/talk.ts` already makes: the words a person reads are one thing, the string
a machine consumes is another. A prompt is pasted verbatim, so it stays in the
language it is used in.

## How a prompt is filed

One primary axis and two tags. The primary axis is not negotiable — it decides
the *shape* of the sheet, and two classes cannot share one, because a ground
tile wants a camera pointing straight down and an actor eats sixteen cells on
its own.

### Primary: what the engine does with it

| class | sheet shape | per sheet | pipeline | what to check |
|---|---|---|---|---|
| `actor` | 8 directions × 2 rows | **one subject** | `render_actor` → `pack_actor` | direction order, foot line, does the walk read as a walk |
| `prop` | grid, one view each | ~20 | `bake_tiles` `RENDERED` | contact line, alpha margin |
| `paired` | the same thing, two ways round | in pairs | as `prop`, plus `across` | one picture along x, a different one along y |
| `ground` | seamless squares, camera straight down | ~12 | `bake_tiles` `GROUND` | **tile it 4 × 4 and look** |
| `ui` | no camera, no light | free | — | not built yet |

`paired` is its own class rather than a note on `prop` because a fence along x
and a fence along y are two different pictures, not one picture turned. Wired
the other way round, a field reads as a row of gates standing across their own
fence line — which is what this repository shipped for one commit.

### Tag one: how far it travels

This is the tag that decides the **order to generate in**, because it decides
how many times an asset pays for itself.

| tag | meaning | examples |
|---|---|---|
| `global` | anywhere on the continent | townsfolk, wolf, bear, barrel, cart |
| `biome` | one climate | broadleaf oak, meadow ground, timber-framed house |
| `zone` | one place | kobold, a named boss |

**Generate every `global` first, then `biome`, and `zone` last.** The other way
round means starting over with each new zone.

### Tag two: which biome, which is to say which palette

The only line of the block that changes: `temperate`, `arid`, `dark`, `snow`,
`volcanic`, `swamp`. Everything else — camera, light, background, scale — is
identical across all of them.

It only attaches to ground, vegetation and buildings. **A barrel has no
biome.** A barrel in the desert is a barrel, so nothing tagged `global` needs
a palette variant, and that is most of the list.

## Zone is not an axis

It is a query, not a folder. Counted out of AzerothCore's `creature` table
across the whole of map 0, against the forest's own bounds:

| kind | in Elwynn | on the rest of the continent |
|---|---|---|
| townsfolk | 980 | **13,664** |
| guard | 130 | 719 |
| boar | 128 | 572 |
| bear | 47 | 488 |
| wolf | 233 | 426 |
| bandit | 200 | 424 |
| skeleton | 13 | 348 |
| cat | 18 | 340 |
| murloc | 162 | 313 |
| spider | 25 | 310 |
| rabbit | 90 | 224 |
| ghost | 29 | 183 |
| cow | 49 | 103 |
| horse | 49 | 93 |
| chicken | 24 | 85 |
| sheep | 20 | 61 |
| **kobold** | 199 | 42 |
| **deer** | 59 | 23 |

Seventeen of nineteen are continental; only the kobold and the deer lean this
way. File by zone and you draw the same townsman forty times.

What that costs, in sheets: **Elwynn is 21, of which 15 are `global`, 5 are
`biome:temperate` and 1 is `zone`.** A second temperate zone is six to eight.
Westfall wants dry ground, dry vegetation and its own gnolls and coyotes;
Duskwood wants a dark palette and undead; Stormwind wants stone buildings and
paved ground and no new people at all.

The honest edge of this: AzerothCore has **5,151 creature names the classifier
has no kind for** — totems, elementals, drakes, kodos, raptors, gryphons,
crocolisks. A continent is not 21 sheets. A temperate forest is.

## The sheet is the unit of consistency

Anything that has to match has to be generated together. Anything in a
different sheet **will** drift — three model kits went into the last round and
none of them agreed about the colour of a leaf, which cost a whole pass
(`pipeline/grade_kit.py`); and the first character sheet that came back had its
three rows at 158, 146 and 141 pixels, a twelve per cent scale drift inside one
image.

So the real question when filing an asset is not *what is it* but **what does
it have to look like the same as**. Three kinds of fence in one sheet, because
a boundary made of three that disagree is a mess. Six townsfolk across two
sheets is fine, because they are supposed to differ.

## Naming

The axes go in the filename, so the pipeline can branch on it without a table:

```
actor_global_townsman_male
actor_zone_kobold_miner
prop_global_barrel
paired_biome_temperate_fence_rail
ground_temperate_meadow
prop_biome_temperate_oak
```

This is what the `kit_` prefix does today — it means "rendered rather than
cut" — done with three fields instead of one.

## The block

Prepend to everything. The palette line is the biome tag; swap that line and
nothing else.

```
고해상도 핸드페인팅 2.5D 쿼터뷰 게임 아트. 고급 픽셀아트 RPG의 질감 —
디테일 밀도가 높고 붓질이 살아 있으며, 지붕 기와 한 장, 널빤지 한 장,
잎사귀 한 장이 각각 읽힌다.

카메라  직교 투영, 정확한 2:1 아이소메트릭. 고도 26.57도(arctan 0.5),
방위각 45도. 정사각형 땅은 가로가 세로의 정확히 두 배인 마름모로 보인다.
시트 안의 모든 칸이 같은 카메라, 같은 거리, 같은 축척을 쓴다.

조명    따뜻한 키 라이트 하나를 카메라와 같은 쪽, 오른쪽 앞 약 48도
높이에. 그림자는 깊되 색이 남는다 — 차가운 청보라, 검정이 아니다.
실루엣 윗면에 얇고 따뜻한 림 라이트.

팔레트  [생물군계 줄 — 아래에서 하나]

배경    완전 투명. 바닥 그림자 없음, 접지 그림자 없음, 회색 배경판 없음,
칸을 나누는 선 없음, 글자·이름표·번호 없음.

축척    모든 칸이 같은 크기. 지면에 닿는 밑면이 모든 칸에서 정확히 같은
높이에 놓인다.

금지    평평한 셀 셰이딩, 로우폴리, 벡터, 장난감 느낌, 외곽선, 사진,
3D 렌더, 흐림, 원근, 소실점.
```

The biome lines. `temperate` is measured off the reference concept art; the
rest follow its structure.

```
temperate  잎과 풀 #688028 #809030 #507028 (차가운 민트 금지).
           회벽·모래·길 #c8a068 #d0a870. 목재·나무껍질 #604028 #7a5432.
           기와지붕 #984028 #a84830. 물 #206080. 녹·가죽 #783010.

arid       마른 풀 #a89040 #c0a850. 모래·바위 #d8b878 #b09060.
           목재 #8a6a40. 천막·차양 #c04828. 물 #3a7a88.

dark       잎 #3a5028 #2a3a20. 안개 낀 회색 #6a6a78.
           죽은 나무 #4a3a30. 이끼 #58703a. 물 #2a4050.

snow       눈 #e8eef4 #c8d8e8. 침엽수 #2a4a38. 얼음 #a8cce0.
           목재 #5a4430. 물 #3a6880.
```

## `actor` — one subject a sheet

```
[블록]

생물 한 종류만. 16칸을 8열 2행으로 배치한다.

윗줄  서 있는 자세, 8방향. 왼쪽부터 정확히 이 순서:
      ① 정면(카메라를 향함) ② 정면-오른쪽 ③ 오른쪽 옆
      ④ 뒤-오른쪽 ⑤ 뒤 ⑥ 뒤-왼쪽 ⑦ 왼쪽 옆 ⑧ 정면-왼쪽
      회전만 다르고 개체·복장·비율은 완전히 동일하다.

아랫줄  같은 8방향, 걷는 중간 자세(한쪽 다리가 앞으로 나간 순간).
        윗줄과 같은 개체, 같은 크기, 같은 밑면 높이.

대상  [여기]
크기  [여기]
```

Eight and not four because four leaves the pose 45 degrees out half the time,
which is the compromise this whole art direction exists to end. In a stated
order because five views at uneven spacing cannot be turned into eight.

The sizes are the ones `pipeline/bake_npcs.py` recorded for the drawn sheet —
an animal's length in yards, taken from its side view, which is the only view a
length is visible in.

| tag | 대상 | 크기 |
|---|---|---|
| `global` | 중세 마을 남자. 리넨 셔츠, 가죽 조끼, 모직 바지, 가죽 장화 | 키 1.8야드 |
| `global` | 중세 마을 여자. 리넨 원피스, 앞치마, 머릿수건, 가죽 신발 | 키 1.7야드 |
| `global` | 사슬 갑옷과 할버드를 든 마을 경비병. 붉은 겉옷, 투구 | 키 1.8야드 |
| `global` | 누더기 가죽을 걸친 산적. 두건, 짧은 검, 허리에 자루 | 키 1.8야드 |
| `global` | 반투명한 망령. 형체는 사람이나 아래로 갈수록 흐려진다 | 키 1.8야드 |
| `global` | 낡은 검과 방패를 든 해골 전사 | 키 1.8야드 |
| `global` | 회색 숲늑대. 날렵한 몸, 두꺼운 어깨, 쫑긋 선 귀 | 길이 2.0야드 |
| `global` | 갈색 곰. 두툼한 어깨, 낮은 머리 | 길이 2.4야드 |
| `global` | 숲멧돼지. 뻣뻣한 갈기, 굽은 엄니 | 길이 1.6야드 |
| `global` | 들토끼. 갈색 털, 긴 귀 | 길이 0.6야드 |
| `global` | 얼룩소. 흰 바탕에 갈색 반점 | 길이 2.4야드 |
| `global` | 양. 두꺼운 양모, 검은 얼굴 | 길이 1.5야드 |
| `global` | 암탉. 갈색 깃털 | 길이 0.7야드 |
| `global` | 길고양이. 회색 줄무늬 | 길이 0.9야드 |
| `global` | 짐말. 갈색 털, 굴레와 안장 | 길이 2.6야드 |
| `global` | 큰 숲거미. 털 난 다리 여덟, 붉은 눈 | 길이 1.4야드 |
| `global` | 늪지 어인. 비늘 피부, 물갈퀴, 지느러미 볏, 뼈 작살 | 키 1.6야드 |
| `biome` | 붉은사슴 수컷. 가지뿔 | 길이 2.0야드 |
| `zone` | 광산 코볼트. 작고 마른 몸, 뾰족한 코, 촛불 달린 두건, 곡괭이 | 키 1.1야드 |

512 townsfolk is a great deal of one person. Take the first two rows two or
three times over with different hair and cloth; the drawn sheet needed the same
thing, and two hundred redheads in identical white shirts is how that was found
out.

## `prop` — many a sheet

```
[블록]

어두운 무채색 배경 위에 자산 시트 한 장. 물체들을 일정한 간격의 격자로
배치한다. 각 물체는 온전하고 서로 떨어져 있으며 겹치지 않는다.
축척은 하나로 통일 — [기준 물체]가 [N]야드일 때 나머지가 그 비율이다.

내용  [여기]
```

**`prop_biome_temperate` — the wood**

```
여름 활엽 참나무(5야드), 기울어진 참나무, 키 큰 전나무(6야드),
어린 자작나무, 잎 진 고사목, 도끼 자국 난 그루터기, 이끼 덮인 쓰러진
통나무, 가시덤불(1야드), 고사리 무더기, 낮은 관목, 키 큰 풀 포기,
붉은 들꽃 무리, 화강암 바위(1.5야드), 이끼 낀 바위 무더기, 흩어진 잔돌,
연못가 갈대 다발(1.2야드), 부들, 수련잎, 꽃 핀 수련, 붉은 독버섯 무리,
갈색 버섯 무리.
```

**`prop_global` — the village's furniture**

```
쇠테 두른 참나무 통, 세 개 쌓은 통, 곡식 자루, 사과 바구니, 나무 궤짝,
도끼 박힌 장작 받침, 쪼갠 장작더미, 대장간 모루, 건초 더미, 바퀴 두 개
달린 손수레, 건초 실은 수레, 줄무늬 차양 친 노점, 두레박 달린 돌우물,
기둥에 매단 철제 등, 나무 이정표, 돌 두른 모닥불, 옥수수 두 포기,
당근 밭 한 줄, 호박, 토마토 덤불.
```

**`prop_biome_temperate` — the buildings**

```
[블록]

어두운 무채색 배경 위에 건물 시트 한 장. 각 건물은 온전하고 서로
떨어져 있으며 겹치지 않는다.

한 층은 처마까지 2야드. 카메라를 향한 벽은 정확히 두 면이고 둘 다 빛을
받는다 — 그늘에 잠긴 벽은 없다. 각 건물은 땅에 평평하게 앉고 밑면은
깔끔한 수평선이다.

내용  목골조 시골집 — 크림빛 회벽, 짙은 참나무 기둥, 가파른 붉은 기와
박공지붕, 돌 굴뚝, 덧문, 창가 화분, 널문.
같은 집의 2층짜리 변형. 간판 걸린 여관. 화덕이 열린 대장간.
초가지붕 헛간. 종탑 박공 달린 돌 예배당. 물레바퀴 달린 물방앗간.
사각 석조 망루(3층). 삼각 천막 두 동(한 동은 깃발).
```

Two lit faces because a 45 degree orthographic camera sees exactly two of them.
The first building rendered in this repository came out as a black silhouette
with lit window frames, because the key light was on the far side.

## `paired` — two ways round, in one sheet

```
[블록]

어두운 무채색 배경 위에 시트 한 장. 각 물건을 두 번씩 넣는다 — 한 번은
화면 오른쪽 위 대각선을 따라(월드의 북쪽), 한 번은 화면 왼쪽 위
대각선을 따라(월드의 서쪽). 두 벌은 같은 물건의 서로 다른 그림이지
같은 그림을 돌린 것이 아니다.

내용  두 줄 가로장 나무 울타리 한 구간(2야드), 말뚝 울타리 한 구간,
부서진 울타리, 나무 문, 낮은 돌담, 돌담의 모서리.
```

## `ground` — the camera changes

```
[블록 — 단, 카메라 항목만 아래로 교체]

카메라  정수직 부감. 원근 없음. 타일 내부에 방향성 조명 없음.

심리스 정사각 32×32 지면 텍스처 시트. 각 타일은 자기 복제본과
가장자리가 이어져 이음매가 보이지 않아야 하고, 반복했을 때 눈에 띌 만큼
큰 무늬가 없어야 한다. 타일 사이는 여백으로 확실히 띄운다.

내용  여름 초원 풀, 붉은 들꽃 섞인 풀, 마른 누런 풀, 닳은 흙길,
다져진 수레 자국, 마을 자갈길, 강모래, 자갈 비치는 얕은 물, 깊은 물,
이끼 낀 판석, 어두운 숲 부엽토, 가을 낙엽, 갈라진 바위 지면.
```

Tile every one of these 4 × 4 before believing it. A tile that does not repeat
is a tile you find out about at 4 × 4 and never before.

## How big anything is on screen

`PPY = 24` pixels to the yard, which is the constant `src/main.ts` draws with.
Horizontal extent is `yards × 24`; height is `yards × 24 × cos(26.57°)`, which
is `yards × 21.5`.

| | yards | pixels |
|---|---|---|
| one ground tile | 1.33 | a 64 × 32 diamond, cut as a 32 × 32 square |
| a person | 1.8 tall | 39 wide, 67 tall including the head |
| a storey, to the eaves | 2 | 43 |
| a fence section | 2 long | 48 |
| an oak | 5 tall | 107 |

A source cell wants to be two or three times the final size, so an `actor` cell
is 150–200 pixels and a sheet of sixteen of them is upwards of 1,600 across.
That arithmetic is why one subject is one sheet: eighteen creatures at sixteen
cells each is 288 cells, and 288 cells at 200 pixels does not fit in anything a
generator will hand back.

## Do one before doing twenty-one

Take the first `actor` row — the townsman — and nothing else. Put it through
the whole pipeline: cut, pack, atlas, and walk him around in the game. Then
look at whether the eight directions are in the order the sheet claims, whether
the foot line holds while he walks, and whether the walk reads as a walk.

Everything this repository got wrong about rendered characters was invisible
until one of them was in the game: eight directions that turned out to be eight
copies of one pose, a cast rendered at 39% of the size the arithmetic asked
for, and a standing frame that was the bind pose with its arms straight out.
None of those threw an error and all of them exited cleanly.
