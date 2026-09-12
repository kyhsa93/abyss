#!/usr/bin/env python3
"""Print a finished prompt, ready to paste.

`docs/art-prompts.md` says how the asks are filed and why every constraint is
in them.  This holds the text, because a prompt assembled by hand is a prompt
that drifts: the block is what keeps twenty-one sheets looking like one world,
and it only does that if all twenty-one carry it identically.

  python3 pipeline/make_prompt.py list          what there is
  python3 pipeline/make_prompt.py townsman      one, to stdout
  python3 pipeline/make_prompt.py --all out/    all of them, as .txt

Through npm a flag needs its own `--`: `npm run prompt -- --all out/`, because
npm eats the first one for itself.

An id is `<class>_<reach>_<name>`, which is also what the resulting art should
be filed under — see the document.
"""
import os
import sys

# Every sheet carries this, unchanged, or they stop looking like one world.
# The palette is the only line that moves, and it moves as a whole line.
BLOCK = """고해상도 핸드페인팅 2.5D 쿼터뷰 게임 아트. 고급 픽셀아트 RPG의 질감 —
디테일 밀도가 높고 붓질이 살아 있으며, 지붕 기와 한 장, 널빤지 한 장,
잎사귀 한 장이 각각 읽힌다.

카메라  직교 투영, 정확한 2:1 아이소메트릭. 고도 26.57도(arctan 0.5),
방위각 45도. 정사각형 땅은 가로가 세로의 정확히 두 배인 마름모로 보인다.
시트 안의 모든 칸이 같은 카메라, 같은 거리, 같은 축척을 쓴다.

조명    따뜻한 키 라이트 하나를 카메라와 같은 쪽, 오른쪽 앞 약 48도
높이에. 그림자는 깊되 색이 남는다 — 차가운 청보라, 검정이 아니다.
실루엣 윗면에 얇고 따뜻한 림 라이트.

팔레트  {palette}

배경    완전 투명. 바닥 그림자 없음, 접지 그림자 없음, 회색 배경판 없음,
칸을 나누는 선 없음, 글자·이름표·번호 없음.

축척    모든 칸이 같은 크기. 지면에 닿는 밑면이 모든 칸에서 정확히 같은
높이에 놓인다.

금지    평평한 셀 셰이딩, 로우폴리, 벡터, 장난감 느낌, 외곽선, 사진,
3D 렌더, 흐림, 원근, 소실점."""

# The ground sheets replace two paragraphs outright.  A tile is drawn from
# straight above, and it cannot carry a light direction: a rim light repeated
# across a lattice is a lattice of rim lights, which is a pattern and not a
# field.  Leaving the block's own lighting paragraph in place while asking for
# a seamless tile is asking for both at once.
TOPDOWN = {
    '카메라': '카메라  정수직 부감. 원근 없음. 타일 내부에 방향성 조명 없음.',
    '조명': '조명    균일한 확산광. 방향 없음, 그림자 없음, 하이라이트 없음.',
}

PALETTES = {
    'temperate': """잎과 풀 #688028 #809030 #507028 (차가운 민트 금지).
회벽·모래·길 #c8a068 #d0a870. 목재·나무껍질 #604028 #7a5432.
기와지붕 #984028 #a84830. 물 #206080. 녹·가죽 #783010.""",
    'arid': """마른 풀 #a89040 #c0a850. 모래·바위 #d8b878 #b09060.
목재 #8a6a40. 천막·차양 #c04828. 물 #3a7a88.""",
    'dark': """잎 #3a5028 #2a3a20. 안개 낀 회색 #6a6a78.
죽은 나무 #4a3a30. 이끼 #58703a. 물 #2a4050.""",
    'snow': """눈 #e8eef4 #c8d8e8. 침엽수 #2a4a38. 얼음 #a8cce0.
목재 #5a4430. 물 #3a6880.""",
}

# The eight directions, written once, because every sheet names them and a
# retyped list is a list that stops agreeing with itself.
DIRS = """8방향, 왼쪽부터 정확히 이 순서:
      ① 정면(카메라를 향함) ② 정면-오른쪽 ③ 오른쪽 옆
      ④ 뒤-오른쪽 ⑤ 뒤 ⑥ 뒤-왼쪽 ⑦ 왼쪽 옆 ⑧ 정면-왼쪽"""

SAME = """모든 칸이 같은 개체, 같은 복장, 같은 비율, 같은 크기,
        같은 밑면 높이. 회전과 동작만 다르다."""

# Everything one subject needs, in one sheet.
#
# Split across two it would be two subjects: generating the same character
# twice is the one part of this that is genuinely hard, and an image model has
# no memory between calls.  So the whole clip list goes in one call even though
# it is a large one, and the resolution line below is what makes that possible
# rather than optimistic.
#
# Two sets, because a chicken does not swing at anything.  What is in them is
# what the scene will actually play — a walk that is four frames because
# `src/main.ts` cycles four, a death because things die, and nothing else.
# No sit, no emote, no cast: there is nothing to drive them, and a row nobody
# plays is a row of cells taken away from the rows somebody does.
CLIPS = {
    'fighter': [
        '서 있는 자세(대기).',
        '걷기 1/4 — 왼발이 앞으로 나간 접지 순간.',
        '걷기 2/4 — 두 발이 스쳐 지나가는 순간, 몸이 가장 높다.',
        '걷기 3/4 — 오른발이 앞으로 나간 접지 순간.',
        '걷기 4/4 — 두 발이 스쳐 지나가는 순간, 반대쪽.',
        '공격 1/3 — 때릴 준비. 팔을(무기가 있으면 무기를) 뒤로 젖힌다.',
        '공격 2/3 — 휘두르는 순간, 몸이 가장 앞으로 나간다.',
        '공격 3/3 — 휘두른 뒤 따라가는 자세.',
        '피격 — 뒤로 밀리며 움츠린다.',
        '쓰러짐 1/3 — 무릎이 꺾인다.',
        '쓰러짐 2/3 — 앞으로 무너진다.',
        '쓰러짐 3/3 — 땅에 누운 채 움직이지 않는다.',
    ],
    'critter': [
        '서 있는 자세(대기).',
        '걷기 1/4 — 앞다리 한쪽이 앞으로 나간 접지 순간.',
        '걷기 2/4 — 네 발이 스쳐 지나가는 순간.',
        '걷기 3/4 — 반대쪽 앞다리가 앞으로 나간 접지 순간.',
        '걷기 4/4 — 네 발이 스쳐 지나가는 순간, 반대쪽.',
        '피격 — 움츠린다.',
        '쓰러짐 1/2 — 다리가 꺾인다.',
        '쓰러짐 2/2 — 옆으로 누운 채 움직이지 않는다.',
    ],
}

ACTOR = """생물 한 종류만. {cells}칸을 8열 {rows}행으로 배치한다.
각 행이 {dirs}

{table}

{same}

해상도  한 칸이 최소 128픽셀은 되어야 한다. 8열 {rows}행이므로
        출력은 최소 {wide}×{tall}, 가능하면 그 두 배.

대상  {what}
크기  {size}"""

# (name, reach, clips, 대상, 크기).  The sizes are the ones `bake_npcs.py`
# recorded for the drawn sheet — an animal's length in yards, taken from its
# side view, which is the only view a length is visible in.
ACTORS = [
    ('townsman', 'global', 'fighter', '중세 마을 남자. 리넨 셔츠, 가죽 조끼, 모직 바지, 가죽 장화', '키 1.8야드'),
    ('townswoman', 'global', 'fighter', '중세 마을 여자. 리넨 원피스, 앞치마, 머릿수건, 가죽 신발', '키 1.7야드'),
    ('guard', 'global', 'fighter', '사슬 갑옷과 할버드를 든 마을 경비병. 붉은 겉옷, 투구', '키 1.8야드'),
    ('bandit', 'global', 'fighter', '누더기 가죽을 걸친 산적. 두건, 짧은 검, 허리에 자루', '키 1.8야드'),
    ('ghost', 'global', 'fighter', '반투명한 망령. 형체는 사람이나 아래로 갈수록 흐려진다', '키 1.8야드'),
    ('skeleton', 'global', 'fighter', '낡은 검과 방패를 든 해골 전사', '키 1.8야드'),
    ('murloc', 'global', 'fighter', '늪지 어인. 비늘 피부, 물갈퀴, 지느러미 볏, 뼈 작살', '키 1.6야드'),
    ('wolf', 'global', 'fighter', '회색 숲늑대. 날렵한 몸, 두꺼운 어깨, 쫑긋 선 귀', '길이 2.0야드'),
    ('bear', 'global', 'fighter', '갈색 곰. 두툼한 어깨, 낮은 머리', '길이 2.4야드'),
    ('boar', 'global', 'fighter', '숲멧돼지. 뻣뻣한 갈기, 굽은 엄니', '길이 1.6야드'),
    ('rabbit', 'global', 'critter', '들토끼. 갈색 털, 긴 귀', '길이 0.6야드'),
    ('cow', 'global', 'critter', '얼룩소. 흰 바탕에 갈색 반점', '길이 2.4야드'),
    ('sheep', 'global', 'critter', '양. 두꺼운 양모, 검은 얼굴', '길이 1.5야드'),
    ('chicken', 'global', 'critter', '암탉. 갈색 깃털', '길이 0.7야드'),
    ('cat', 'global', 'critter', '길고양이. 회색 줄무늬', '길이 0.9야드'),
    ('horse', 'global', 'critter', '짐말. 갈색 털, 굴레와 안장', '길이 2.6야드'),
    ('spider', 'global', 'fighter', '큰 숲거미. 털 난 다리 여덟, 붉은 눈', '길이 1.4야드'),
    ('deer', 'biome', 'critter', '붉은사슴 수컷. 가지뿔', '길이 2.0야드'),
    ('kobold', 'zone', 'fighter', '광산 코볼트. 작고 마른 몸, 뾰족한 코, 촛불 달린 두건, 곡괭이', '키 1.1야드'),
]

GRID = """어두운 무채색 배경 위에 자산 시트 한 장. 물체들을 일정한 간격의 격자로
배치한다. 각 물체는 온전하고 서로 떨어져 있으며 겹치지 않는다.
{scale}

내용  {what}"""

BUILDINGS = """어두운 무채색 배경 위에 건물 시트 한 장. 각 건물은 온전하고 서로
떨어져 있으며 겹치지 않는다.

한 층은 처마까지 2야드. 카메라를 향한 벽은 정확히 두 면이고 둘 다 빛을
받는다 — 그늘에 잠긴 벽은 없다. 각 건물은 땅에 평평하게 앉고 밑면은
깔끔한 수평선이다.

내용  {what}"""

PAIRED = """어두운 무채색 배경 위에 시트 한 장. 각 물건을 두 번씩 넣는다 — 한 번은
화면 오른쪽 위 대각선을 따라(월드의 북쪽), 한 번은 화면 왼쪽 위
대각선을 따라(월드의 서쪽). 두 벌은 같은 물건의 서로 다른 그림이지
같은 그림을 돌린 것이 아니다.

내용  {what}"""

GROUND = """심리스 정사각 32×32 지면 텍스처 시트. 각 타일은 자기 복제본과
가장자리가 이어져 이음매가 보이지 않아야 하고, 반복했을 때 눈에 띌 만큼
큰 무늬가 없어야 한다. 타일 사이는 여백으로 확실히 띄운다.

내용  {what}"""

# (name, class, reach, biome, body).
SHEETS = [
    ('wood', 'prop', 'biome', 'temperate', GRID.format(
        scale='축척은 하나로 통일 — 참나무가 5야드일 때 나머지가 그 비율이다.',
        what="""여름 활엽 참나무(5야드), 기울어진 참나무, 키 큰 전나무(6야드),
어린 자작나무, 잎 진 고사목, 도끼 자국 난 그루터기, 이끼 덮인 쓰러진
통나무, 가시덤불(1야드), 고사리 무더기, 낮은 관목, 키 큰 풀 포기,
붉은 들꽃 무리, 화강암 바위(1.5야드), 이끼 낀 바위 무더기, 흩어진 잔돌,
연못가 갈대 다발(1.2야드), 부들, 수련잎, 꽃 핀 수련, 붉은 독버섯 무리,
갈색 버섯 무리.""")),
    ('yard', 'prop', 'global', 'temperate', GRID.format(
        scale='축척은 하나로 통일 — 통이 1야드일 때 나머지가 그 비율이다.',
        what="""쇠테 두른 참나무 통, 세 개 쌓은 통, 곡식 자루, 사과 바구니, 나무 궤짝,
도끼 박힌 장작 받침, 쪼갠 장작더미, 대장간 모루, 건초 더미, 바퀴 두 개
달린 손수레, 건초 실은 수레, 줄무늬 차양 친 노점, 두레박 달린 돌우물,
기둥에 매단 철제 등, 나무 이정표, 돌 두른 모닥불, 옥수수 두 포기,
당근 밭 한 줄, 호박, 토마토 덤불.""")),
    ('houses', 'prop', 'biome', 'temperate', BUILDINGS.format(
        what="""목골조 시골집 — 크림빛 회벽, 짙은 참나무 기둥, 가파른 붉은 기와
박공지붕, 돌 굴뚝, 덧문, 창가 화분, 널문.
같은 집의 2층짜리 변형. 간판 걸린 여관. 화덕이 열린 대장간.
초가지붕 헛간. 종탑 박공 달린 돌 예배당. 물레바퀴 달린 물방앗간.
사각 석조 망루(3층). 삼각 천막 두 동(한 동은 깃발).""")),
    ('fences', 'paired', 'biome', 'temperate', PAIRED.format(
        what="""두 줄 가로장 나무 울타리 한 구간(2야드), 말뚝 울타리 한 구간,
부서진 울타리, 나무 문, 낮은 돌담, 돌담의 모서리.""")),
    ('tiles', 'ground', 'biome', 'temperate', GROUND.format(
        what="""여름 초원 풀, 붉은 들꽃 섞인 풀, 마른 누런 풀, 닳은 흙길,
다져진 수레 자국, 마을 자갈길, 강모래, 자갈 비치는 얕은 물, 깊은 물,
이끼 낀 판석, 어두운 숲 부엽토, 가을 낙엽, 갈라진 바위 지면.""")),
]


def block(biome, topdown=False):
    b = BLOCK.format(palette=PALETTES[biome].replace('\n', '\n        '))
    if topdown:
        out, skip = [], False
        for ln in b.split('\n'):
            head = ln.split()[0] if ln.split() else ''
            if head in TOPDOWN:
                out.append(TOPDOWN[head])
                skip = True
                continue
            if skip:
                if ln.strip() == '':
                    skip = False
                    out.append(ln)
                continue
            out.append(ln)
        b = '\n'.join(out)
    return b


def every():
    out = {}
    for name, reach, clips, what, size in ACTORS:
        rows = CLIPS[clips]
        table = '\n'.join(f'{i + 1:>2}행  {c}' for i, c in enumerate(rows))
        out[f'actor_{reach}_{name}'] = block('temperate') + '\n\n' + ACTOR.format(
            cells=len(rows) * 8, rows=len(rows), dirs=DIRS, table=table, same=SAME,
            wide=8 * 128, tall=len(rows) * 128, what=what, size=size)
    for name, cls, reach, biome, body in SHEETS:
        out[f'{cls}_{reach}_{name}'] = (
            block(biome, topdown=(cls == 'ground')) + '\n\n' + body)
    return out


def main(argv):
    made = every()
    if not argv or argv[0] == 'list':
        print(f'{len(made)} sheets\n')
        for k in made:
            print(' ', k)
        print('\nan id also works without its class and reach: `townsman`')
        return
    if argv[0] == '--all':
        out = argv[1] if len(argv) > 1 else 'prompts'
        os.makedirs(out, exist_ok=True)
        for k, v in made.items():
            with open(os.path.join(out, k + '.txt'), 'w') as f:
                f.write(v + '\n')
        print(f'{len(made)} prompts -> {out}/')
        return
    want = argv[0]
    hits = [k for k in made if k == want or k.split('_', 2)[2] == want]
    if not hits:
        hits = [k for k in made if k.split('_', 2)[2].startswith(want + '_')]
    if len(hits) != 1:
        sys.exit(f'{want!r} matches {len(hits)} sheets; `list` shows them all')
    print(made[hits[0]])


if __name__ == '__main__':
    main(sys.argv[1:])
