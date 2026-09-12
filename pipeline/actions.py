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

  CLIP    one action: its name, and a sentence for every frame it takes
  GROUP   the clips that go on one sheet together, per role where they differ
  ROLE    which groups a kind of creature has at all

A sheet is `<subject>_<group>`, eight directions wide by its clips' frames
tall.  `base` is generated first and is the identity reference for the rest —
see `docs/art-prompts.md`.
"""
import sys

# id -> (label, [what each frame shows]).  A frame, not a clip, gets its own
# sentence: the first version put all four beats of a walk in one string and
# tagged the rows [1/4]..[4/4], which tells a generator that row four is "one
# of these four" and nothing more.  Frame counts are what the scene needs to
# read, not what an animator would want — a walk is four because fewer slides,
# a swing is three because a wind-up and a follow-through are what make it land.
CLIP = {
    # --- moving ---
    'stand': ('대기', ['서 있는 자세.']),
    'fidget': ('제자리 동작', [
        '무게중심을 한쪽 발로 옮긴다.',
        '주위를 둘러보고 돌아온다.']),
    'walk': ('걷기', [
        '왼발이 앞으로 나간 접지 순간.',
        '두 발이 스쳐 지나가는 순간, 몸이 가장 높다.',
        '오른발이 앞으로 나간 접지 순간.',
        '반대쪽으로 스쳐 지나가는 순간.']),
    'run': ('달리기', [
        '왼발 접지. 보폭이 넓고 상체가 앞으로 기운다.',
        '두 발이 모두 땅에서 떨어진 순간.',
        '오른발 접지.',
        '반대쪽으로 두 발이 떨어진 순간.']),
    'backpedal': ('뒤로 물러나기', [
        '왼발을 뒤로 빼는 순간. 몸은 앞을 향한 채다.',
        '오른발을 뒤로 빼는 순간.']),
    'swim': ('헤엄', [
        '한 팔을 물 앞으로 뻗는다. 허리까지 잠겨 있다.',
        '그 팔을 뒤로 젓는다.']),
    'swim_idle': ('물에 떠 있기', ['가만히 뜬 자세. 허리까지 잠겨 있다.']),

    # --- hitting things ---
    'ready_melee': ('근접 전투 자세', ['무릎을 굽히고 무기를 든 대기 자세.']),
    'attack': ('휘두르기', [
        '팔을(무기가 있으면 무기를) 뒤로 젖히는 예비 동작.',
        '몸이 가장 앞으로 나가는 타격 순간.',
        '휘두른 뒤 따라가는 자세.']),
    'attack_off': ('반대 손 공격', [
        '반대 손을 당긴다.',
        '짧게 찔러 넣는다.']),
    'bite': ('물기', [
        '몸을 낮추는 예비 동작.',
        '앞으로 뛰어들며 무는 순간.',
        '물러나는 자세.']),
    'parry': ('받아넘기기', ['무기로 받아 흘리는 순간.']),
    'dodge': ('회피', ['옆으로 몸을 비트는 순간.']),
    'block': ('막기', ['방패를 앞으로 세운 자세.']),
    'hit': ('피격', ['뒤로 밀리며 움츠린다.']),
    'hit_crit': ('치명타 피격', ['크게 젖혀지며 휘청인다.']),

    # --- spells ---
    'ready_spell': ('주문 자세', ['한 손을 앞으로, 다른 손은 가슴 앞에 둔 대기 자세.']),
    'precast': ('시전 준비', [
        '손을 모으며 힘을 끌어올린다.',
        '손 안에 빛이 모인 정점.']),
    'cast_directed': ('대상 지정 시전', [
        '팔을 뒤로 당긴다.',
        '앞으로 뻗어 내보내는 순간.']),
    'cast_instant': ('즉시 시전', [
        '예비 동작 없이 손을 튕겨 올린다.',
        '끊어 내리는 순간.']),
    'channel': ('유지 시전', [
        '두 손을 들고 버틴다.',
        '같은 자세에서 몸이 미세하게 떨린다.']),
    'cast_end': ('시전 종료', ['팔을 내리는 자세.']),

    # --- shooting ---
    'ready_bow': ('활 자세', ['활을 들고 화살을 메긴 대기 자세.']),
    'draw': ('시위 당기기', [
        '시위를 반쯤 당긴다.',
        '턱까지 완전히 당긴 정점.']),
    'loose': ('발사', [
        '시위를 놓는 순간.',
        '활이 튕기고 몸이 젖혀지는 순간.']),
    'reload': ('화살 꺼내기', ['등 뒤 화살통에서 화살을 뽑는 자세.']),

    # --- ending ---
    'death': ('쓰러짐', [
        '무릎이 꺾인다.',
        '앞으로 무너진다.',
        '땅에 닿는다.']),
    'dead': ('사망', ['누운 채 움직이지 않는다.']),
    'death_beast': ('쓰러짐', [
        '다리가 꺾인다.',
        '옆으로 눕는다.']),

    # --- being somewhere ---
    'sit': ('앉기', ['바닥에 앉은 자세.']),
    'kneel': ('무릎 꿇기', ['한쪽 무릎을 꿇은 자세.']),
    'graze': ('풀 뜯기', [
        '고개를 숙인다.',
        '입을 움직이며 씹는다.']),
    'sleep': ('잠', ['웅크리고 자는 자세.']),

    # --- being a person ---
    'talk': ('말하기', [
        '한 손을 가볍게 들어 말한다.',
        '손을 내리며 이어 말한다.']),
    'point': ('가리키기', ['한 팔을 들어 가리킨다.']),
    'wave': ('손 흔들기', ['손을 들어 인사한다.']),
    'bow_to': ('인사', ['허리를 굽힌다.']),
    'loot': ('줍기', [
        '몸을 숙인다.',
        '바닥의 것을 집어 든다.']),
    'work': ('작업', [
        '도구를 들어올린다.',
        '내리친다.',
        '반동으로 돌아온다.']),
    'eat': ('먹기', [
        '손을 입으로 가져간다.',
        '씹으며 손을 내린다.']),
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


def order(role):
    """Every clip a role has, in the order it should be generated in.

    `base` first, because its sheet is the identity reference every other sheet
    of that subject is generated against.
    """
    out = []
    for group in ROLE.get(role, ()):
        out.extend(clips(role, group))
    return out


def sheets(role, budget):
    """The clips packed into sheets of at most `budget` rows.

    Filed by clip group, a sheet could be five rows against another's twelve —
    and a generator hands back one canvas whatever is asked of it, so the short
    sheet throws most of its away.  Packed, the canvas is full and the number of
    times somebody types a prompt goes down with it.

    A clip is never split across two sheets: half a walk in one image and half
    in another is two walks, for the same reason two calls are two characters.
    """
    out, cur, used = [], [], 0
    for cid in order(role):
        n = len(CLIP[cid][1])
        if cur and used + n > budget:
            out.append(cur)
            cur, used = [], 0
        cur.append(cid)
        used += n
    if cur:
        out.append(cur)
    return out


def lines(ids):
    """One line a row: the clip's name, where in it this frame is, and the pose."""
    out = []
    for cid in ids:
        label, frames = CLIP[cid]
        for i, frame in enumerate(frames):
            where = f'{label} {i + 1}/{len(frames)}' if len(frames) > 1 else label
            out.append((cid, f'{where} — {frame}'))
    return out


def rows(role, group):
    """One line a row: the clip's name, where in it this frame is, and the pose."""
    out = []
    for cid in clips(role, group):
        label, frames = CLIP[cid]
        for i, frame in enumerate(frames):
            where = f'{label} {i + 1}/{len(frames)}' if len(frames) > 1 else label
            out.append((cid, f'{where} — {frame}'))
    return out


def main(argv):
    from make_prompt import ACTORS
    budget = 12
    if argv and argv[0].isdigit():
        budget, argv = int(argv[0]), argv[1:]
    want = argv[0] if argv else None
    print(f'rows a sheet: {budget}\n')
    print(f'{"subject":<12}{"role":<11}{"clips":>7}{"rows":>7}{"cells":>8}{"sheets":>8}')
    tc = tr = ts = 0
    for name, _reach, role, _what, _size in ACTORS:
        if want and name != want:
            continue
        packed = sheets(role, budget)
        nrows = sum(len(CLIP[c][1]) for c in order(role))
        print(f'{name:<12}{role:<11}{len(order(role)):>7}{nrows:>7}'
              f'{nrows * 8:>8}{len(packed):>8}')
        tc += len(order(role)); tr += nrows; ts += len(packed)
    if not want:
        print(f'\n{len(ACTORS)} subjects, {tr * 8:,} cells, {ts} sheets')
        print(f'{len(CLIP)} clips in the vocabulary, '
              f'{sum(len(f) for _, f in CLIP.values())} frames')


if __name__ == '__main__':
    sys.path.insert(0, __file__.rsplit('/', 1)[0])
    main(sys.argv[1:])
