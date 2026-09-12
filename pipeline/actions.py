#!/usr/bin/env python3
"""Every action anything in this world can perform, written down once.

This is the catalogue the art is generated from and the animation ids the scene
will eventually play — one table, so a clip cannot exist in the sheet and not in
the engine, or the other way round.

It is written out in full rather than grown a clip at a time.  Adding `attack`
after the walk sheet has been generated does not cost one row; it costs the
whole subject, because generating the same character twice gets you two
characters and an image model has no memory between calls.  So the whole
vocabulary is decided before anything is drawn, and what a given creature needs
is a lookup rather than an argument.

  python3 pipeline/actions.py            the catalogue, with cell counts
  python3 pipeline/actions.py townsman   what one subject needs

Three levels:

  CLIP    one action: how many frames it takes and what the frame shows
  GROUP   the clips that go on one sheet together, per role where they differ
  ROLE    which groups a kind of creature has at all

A sheet is `<subject>_<group>`, eight directions wide by its clips' frames
tall.  `base` is generated first and is the identity reference for the rest —
see `docs/art-prompts.md`.
"""
import sys

# (frames, what each frame shows).  Frame counts are what the scene needs to
# read, not what an animator would want: a walk is four because fewer slides, a
# swing is three because a wind-up and a follow-through are what make it land.
CLIP = {
    # --- moving ---
    'stand': (1, '서 있는 자세(대기).'),
    'fidget': (2, '제자리에서 몸을 푸는 동작 — 무게중심을 옮기고 주위를 둘러본다.'),
    'walk': (4, '걷기 — 왼발 접지 / 두 발이 스쳐 지나가며 몸이 가장 높은 순간 /'
                ' 오른발 접지 / 반대쪽으로 스쳐 지나가는 순간.'),
    'run': (4, '달리기 — 걷기와 같은 네 박자지만 보폭이 넓고 상체가 앞으로 기운다.'),
    'backpedal': (2, '뒤로 물러나는 걸음 두 박자. 몸은 앞을 향한 채다.'),
    'swim': (2, '헤엄 — 팔을 젓는 두 박자. 허리까지 물에 잠겨 있다.'),
    'swim_idle': (1, '물에 뜬 채 가만히 있는 자세.'),

    # --- hitting things ---
    'ready_melee': (1, '근접 전투 자세 — 무릎을 굽히고 무기를 든다.'),
    'attack': (3, '휘두르기 — 뒤로 젖히는 예비 / 몸이 가장 앞으로 나가는 타격 순간 /'
                  ' 휘두른 뒤 따라가는 자세.'),
    'attack_off': (2, '반대 손 공격 두 박자. 주 무기 공격보다 짧고 빠르다.'),
    'bite': (3, '물기 — 몸을 낮추는 예비 / 앞으로 뛰어들며 무는 순간 / 물러나는 자세.'),
    'parry': (1, '무기로 받아넘기는 순간.'),
    'dodge': (1, '옆으로 몸을 비트는 회피.'),
    'block': (1, '방패로 막는 자세.'),
    'hit': (1, '피격 — 뒤로 밀리며 움츠린다.'),
    'hit_crit': (1, '치명타 피격 — 크게 젖혀지며 휘청인다.'),

    # --- spells ---
    'ready_spell': (1, '주문 자세 — 한 손을 앞으로, 다른 손은 가슴 앞에.'),
    'precast': (2, '시전 준비 두 박자 — 손 안에 힘을 모은다.'),
    'cast_directed': (2, '대상 지정 시전 — 손을 앞으로 뻗어 내보내는 두 박자.'),
    'cast_instant': (2, '즉시 시전 — 예비 동작 없이 짧고 강하게 끊는 두 박자.'),
    'channel': (2, '유지 시전 — 두 손을 들고 버티는 두 박자, 자세는 거의 고정.'),
    'cast_end': (1, '시전이 끝나고 팔을 내리는 자세.'),

    # --- shooting ---
    'ready_bow': (1, '활 자세 — 활을 들고 화살을 메긴다.'),
    'draw': (2, '시위를 당기는 두 박자.'),
    'loose': (2, '발사 — 놓는 순간 / 활이 튕기고 몸이 젖혀지는 순간.'),
    'reload': (1, '화살통에서 화살을 꺼내는 자세.'),

    # --- ending ---
    'death': (3, '쓰러짐 — 무릎이 꺾인다 / 앞으로 무너진다 / 땅에 닿는다.'),
    'dead': (1, '누운 채 움직이지 않는다.'),
    'death_beast': (2, '쓰러짐 — 다리가 꺾인다 / 옆으로 눕는다.'),

    # --- being somewhere ---
    'sit': (1, '바닥에 앉은 자세.'),
    'kneel': (1, '한쪽 무릎을 꿇은 자세.'),
    'graze': (2, '고개를 숙여 풀을 뜯는 두 박자.'),
    'sleep': (1, '웅크리고 자는 자세.'),

    # --- being a person ---
    'talk': (2, '말하는 동작 두 박자 — 손을 가볍게 쓴다.'),
    'point': (1, '한 팔을 들어 가리킨다.'),
    'wave': (1, '손을 드는 인사.'),
    'bow_to': (1, '허리를 굽혀 인사한다.'),
    'loot': (2, '몸을 숙여 바닥의 것을 줍는 두 박자.'),
    'work': (3, '반복 작업 세 박자 — 내리치고, 들어올리고, 돌아온다'
                ' (채광·벌목·대장일 어느 쪽으로도 읽히는 동작).'),
    'eat': (2, '먹거나 마시는 두 박자.'),
}

# What goes on one sheet together, and what a role puts in each.  `'*'` is the
# version everybody shares.
GROUP = {
    'base': {
        '*': ['stand', 'fidget', 'walk', 'run'],
        'critter': ['stand', 'fidget', 'walk'],
    },
    'melee': {
        'human': ['ready_melee', 'attack', 'attack_off', 'parry', 'dodge',
                  'block', 'hit', 'hit_crit'],
        'humanoid': ['ready_melee', 'attack', 'parry', 'hit', 'hit_crit'],
        'beast': ['ready_melee', 'bite', 'dodge', 'hit', 'hit_crit'],
    },
    'cast': {
        '*': ['ready_spell', 'precast', 'cast_directed', 'cast_instant',
              'channel', 'cast_end'],
    },
    'ranged': {
        '*': ['ready_bow', 'draw', 'loose', 'reload', 'backpedal'],
    },
    'state': {
        'human': ['death', 'dead', 'swim', 'swim_idle', 'sit', 'kneel'],
        'humanoid': ['death', 'dead', 'swim', 'swim_idle'],
        'beast': ['death_beast', 'dead', 'swim', 'sleep'],
        'livestock': ['death_beast', 'dead', 'graze', 'sleep'],
        'critter': ['death_beast', 'dead', 'sleep'],
    },
    'social': {
        '*': ['talk', 'point', 'wave', 'bow_to', 'loot', 'work', 'eat'],
    },
}

# Which groups a kind of creature has at all.  A chicken has no melee sheet
# because a chicken does not swing at anything, and a sheet nobody plays is a
# sheet of cells taken from the ones somebody does.
ROLE = {
    'human': ['base', 'melee', 'cast', 'ranged', 'state', 'social'],
    'humanoid': ['base', 'melee', 'cast', 'state'],
    'beast': ['base', 'melee', 'state'],
    'livestock': ['base', 'state'],
    'critter': ['base', 'state'],
}


def clips(role, group):
    """The clips one role puts on one sheet, or none if it has no such sheet."""
    if group not in ROLE.get(role, ()):
        return []
    table = GROUP[group]
    return table.get(role) or table.get('*') or []


def rows(role, group):
    """(clip id, frame index, what it shows) for every row of a sheet."""
    out = []
    for cid in clips(role, group):
        n, what = CLIP[cid]
        for i in range(n):
            out.append((cid, i, n, what))
    return out


def catalogue():
    from make_prompt import ACTORS
    return [(name, role) for name, _reach, role, _what, _size in ACTORS]


def main(argv):
    from make_prompt import ACTORS
    want = argv[0] if argv else None
    total = 0
    print(f'{"subject":<12}{"role":<10}' + ''.join(f'{g:>10}' for g in
                                                   ['base', 'melee', 'cast',
                                                    'ranged', 'state', 'social'])
          + f'{"cells":>9}')
    for name, _reach, role, _what, _size in ACTORS:
        if want and name != want:
            continue
        line, subtotal = '', 0
        for g in ['base', 'melee', 'cast', 'ranged', 'state', 'social']:
            n = len(rows(role, g))
            subtotal += n * 8
            line += f'{(str(n * 8) if n else "-"):>10}'
        total += subtotal
        print(f'{name:<12}{role:<10}{line}{subtotal:>9}')
    if not want:
        print(f'\n{len(ACTORS)} subjects, {total:,} cells, '
              f'{sum(1 for n, _r, role, _w, _s in ACTORS for g in ROLE[role])} sheets')
        print(f'{len(CLIP)} clips in the vocabulary, '
              f'{sum(n for n, _ in CLIP.values())} frames')


if __name__ == '__main__':
    sys.path.insert(0, __file__.rsplit('/', 1)[0])
    main(sys.argv[1:])
