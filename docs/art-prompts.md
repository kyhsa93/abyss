# Prompts for generating the art

Twenty-one sheets fill Elwynn Forest. This is what to ask for and, more
usefully, why each constraint is in the prompt — every one of them is here
because getting it wrong cost this repository a round.

The prompts themselves are in Korean and the document around them is in
English, which is the same split `src/talk.ts` makes: the prose a person reads
is one language, the thing a machine consumes is another. A prompt is pasted
verbatim into a generator, so it is left exactly as it is used.

## What is needed, and how much of it

Counted out of `public/data/terrain.json` and `public/world/npcs.json` — the
world as it stands, not a guess. These drift when the bake does.

| sheet | contents | how many |
|---|---|---|
| A | trees, bushes, rocks, reeds, lilies | 1 |
| B | village props, fences, carts, crops, campfire | 1 |
| C | buildings — 65 houses, 16 halls, 4 towers, 24 tents | 1 |
| D | ground tiles | 1 |
| E | one creature a sheet, eight directions and a walk | 17 |

The scenery it has to cover: 2,624 bushes, 2,584 trees, 1,900 water plants,
1,506 fences, 1,052 yard props, 580 rocks, 363 barrels, 266 lily pads, 65
houses, 34 carts, 28 crops, 24 tents, 16 halls, 11 grass tufts, 4 towers and
2 campfires. The cast: 512 townsfolk, 233 wolves, 199 kobolds, 186 bandits,
162 murlocs, 128 boars, 127 guards, 90 rabbits, 59 deer, 47 bears, 46 cows,
25 spiders, 23 chickens, 18 sheep, 16 cats, 9 horses, 4 ghosts.

## Why each line of the block is there

**The camera is not a style choice.** `src/main.ts` projects with `x - y` on
the horizontal and `(x + y)` halved on the vertical. That is a 2:1 diamond,
and a 2:1 diamond is an orthographic camera at an elevation of `atan(0.5)` —
26.57 degrees — looking down the 45 degree diagonal. Any other elevation and
the sprite does not sit on this ground, and no amount of scaling fixes it.

**Both camera-facing faces must be lit.** A 45 degree orthographic camera sees
exactly two faces of anything box-shaped. The first building rendered in this
repository came out as a black silhouette with lit window frames, because the
key light was on the far side.

**One palette, stated in hex.** Three model kits went into the last round and
none of them agreed about the colour of a leaf; the fix was a whole pass
(`pipeline/grade_kit.py`) pulling greens onto the grass. The hex values below
are the ones measured off the reference concept art, not invented.

**A fence needs two pictures.** Drawn flat it never mattered which way a
boundary ran. In quarter view a fence along x and a fence along y are two
different pictures, not one picture moved — wired the other way round, a field
reads as a row of gates standing across their own fence line.

**Every cell at one scale, with one foot line.** The first character sheet that
came back had its three rows at 158, 146 and 141 pixels — a twelve per cent
drift. `pipeline/pack_actor.py` measures the lowest opaque row across every
cell and writes it into the sheet as `anchor`; if the cells disagree, that
number is meaningless and the character bobs as it walks.

**Eight directions, in a stated order.** A rig has as many directions as you
ask it for and a drawing has as many as somebody drew. Five views at uneven
spacing cannot be turned into eight, and four leaves the pose 45 degrees out
half the time, which is the compromise this whole art direction exists to end.

**No baked shadow, no background.** The scene draws its own contact shadow,
sized off the sprite. A shadow painted into the cell doubles it and, worse,
lands in the alpha bounding box and moves the foot line.

## The block — prepend to all twenty-one

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

팔레트  잎과 풀 #688028 #809030 #507028 (차가운 민트 금지).
회벽·모래·길 #c8a068 #d0a870. 목재·나무껍질 #604028 #7a5432.
기와지붕 #984028 #a84830. 물 #206080. 녹·가죽 #783010.

배경    완전 투명. 바닥 그림자 없음, 접지 그림자 없음, 회색 배경판 없음,
칸을 나누는 선 없음, 글자·이름표·번호 없음.

축척    모든 칸이 같은 크기. 지면에 닿는 밑면이 모든 칸에서 정확히 같은
높이에 놓인다.

금지    평평한 셀 셰이딩, 로우폴리, 벡터, 장난감 느낌, 외곽선, 사진,
3D 렌더, 흐림, 원근, 소실점.
```

## E — one creature a sheet, seventeen times

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

The sizes are the ones `pipeline/bake_npcs.py` recorded for the drawn sheet —
an animal's length in yards, measured from its side view, which is the only
view a length is visible in.

| 대상 | 크기 |
|---|---|
| 중세 마을 남자. 리넨 셔츠, 가죽 조끼, 모직 바지, 가죽 장화 | 키 1.8야드 |
| 중세 마을 여자. 리넨 원피스, 앞치마, 머릿수건, 가죽 신발 | 키 1.7야드 |
| 사슬 갑옷과 할버드를 든 마을 경비병. 붉은 겉옷, 투구 | 키 1.8야드 |
| 누더기 가죽을 걸친 산적. 두건, 짧은 검, 허리에 자루 | 키 1.8야드 |
| 광산 코볼트. 작고 마른 몸, 뾰족한 코, 촛불 달린 두건, 곡괭이 | 키 1.1야드 |
| 늪지 어인. 비늘 피부, 물갈퀴, 지느러미 볏, 뼈 작살 | 키 1.6야드 |
| 반투명한 망령. 형체는 사람이나 아래로 갈수록 흐려진다 | 키 1.8야드 |
| 회색 숲늑대. 날렵한 몸, 두꺼운 어깨, 쫑긋 선 귀 | 길이 2.0야드 |
| 갈색 곰. 두툼한 어깨, 낮은 머리 | 길이 2.4야드 |
| 숲멧돼지. 뻣뻣한 갈기, 굽은 엄니 | 길이 1.6야드 |
| 붉은사슴 수컷. 가지뿔 | 길이 2.0야드 |
| 들토끼. 갈색 털, 긴 귀 | 길이 0.6야드 |
| 얼룩소. 흰 바탕에 갈색 반점 | 길이 2.4야드 |
| 양. 두꺼운 양모, 검은 얼굴 | 길이 1.5야드 |
| 암탉. 갈색 깃털 | 길이 0.7야드 |
| 길고양이. 회색 줄무늬 | 길이 0.9야드 |
| 짐말. 갈색 털, 굴레와 안장 | 길이 2.6야드 |
| 큰 숲거미. 털 난 다리 여덟, 붉은 눈 | 길이 1.4야드 |

512 townsfolk is a lot of one person. Take the first two rows two or three
times over with different hair and cloth — the drawn sheet needed the same
thing, and two hundred redheads in identical white shirts is how that was
found out.

## A — the wood

```
[블록]

어두운 무채색 배경 위에 자산 시트 한 장. 물체들을 일정한 간격의 격자로
배치한다. 각 물체는 온전하고 서로 떨어져 있으며 겹치지 않는다.
축척은 하나로 통일 — 참나무가 5야드일 때 나머지가 그 비율이다.

내용  여름 활엽 참나무(5야드), 기울어진 참나무, 키 큰 전나무(6야드),
어린 자작나무, 잎 진 고사목, 도끼 자국 난 그루터기, 이끼 덮인 쓰러진
통나무, 가시덤불(1야드), 고사리 무더기, 낮은 관목, 키 큰 풀 포기,
붉은 들꽃 무리, 화강암 바위(1.5야드), 이끼 낀 바위 무더기, 흩어진 잔돌,
연못가 갈대 다발(1.2야드), 부들, 수련잎, 꽃 핀 수련, 붉은 독버섯 무리,
갈색 버섯 무리.
```

## B — the village's furniture

```
[블록]

어두운 무채색 배경 위에 자산 시트 한 장. 가지런한 격자, 각 물체는
온전하고 서로 떨어져 있으며 겹치지 않는다.

내용  쇠테 두른 참나무 통, 세 개 쌓은 통, 곡식 자루, 사과 바구니,
나무 궤짝, 도끼 박힌 장작 받침, 쪼갠 장작더미, 대장간 모루, 건초 더미,
바퀴 두 개 달린 손수레, 건초 실은 수레, 줄무늬 차양 친 노점,
두레박 달린 돌우물, 기둥에 매단 철제 등, 나무 이정표, 돌 두른 모닥불,
옥수수 두 포기, 당근 밭 한 줄, 호박, 토마토 덤불.

울타리는 같은 시트에 두 벌을 넣는다 — 하나는 화면 오른쪽 위 대각선을
따라 놓인 두 줄 가로장 울타리 한 구간, 다른 하나는 같은 울타리를
화면 왼쪽 위 대각선을 따라 놓은 것. 나무 문도 같은 두 방향으로.
```

## C — the buildings

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

## D — the ground

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

## How big anything is on screen

Everything below is `PPY = 24` pixels to the yard, which is the constant
`src/main.ts` draws with. Horizontal extent is `yards * 24`; height is
`yards * 24 * cos(26.57°)`, which is `yards * 21.5`.

| | yards | pixels |
|---|---|---|
| one ground tile | 1.33 | a 64 x 32 diamond, cut as a 32 x 32 square |
| a person | 1.8 tall | 39 wide, 67 tall including the head |
| a storey, to the eaves | 2 | 43 |
| a fence section | 2 long | 48 |
| an oak | 5 tall | 107 |

## Do one before doing twenty-one

Take the first row of the creature template — the townsman — and nothing else.
Put it through the whole pipeline: cut, pack, atlas, and walk him around in the
game. Then look at whether the eight directions are in the order the sheet
claims, whether the foot line holds while he walks, and whether the walk reads
as a walk.

Everything this repository got wrong about rendered characters was invisible
until one of them was in the game: eight directions that were eight copies of
one pose, a cast that rendered at 39% of the size the arithmetic asked for, and
a standing frame that was the bind pose with its arms straight out. None of
those threw an error and all of them exited cleanly.
