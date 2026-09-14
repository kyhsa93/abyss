#!/usr/bin/env python3
"""Where the original puts each piece of its interface.

  python3 pipeline/layout.py [client] [out]

The interface was the last thing in this repository with no source.  The
terrain comes out of `.adt` files, the people out of AzerothCore, what a
warrior can do out of `Spell.dbc` — and the screen was laid out from memory,
which is why it kept coming back wrong one piece at a time.  A panel put where
it looked right is a hand-tuned constant, and this repository's own rule is
that a constant tuned twice should be derived.

It is derivable.  The client ships its whole interface as XML — `FrameXML` —
and every frame in it declares a size and an anchor in plain numbers:

    <Frame name="GossipFrame" ...>
      <Size><AbsDimension x="384" y="512"/></Size>
      <Anchors><Anchor point="TOPLEFT"><Offset><AbsDimension x="0" y="-104"/>

That is the gossip window: 384 wide, 512 tall, pinned to the **top left** of
the screen.  Ours was a strip across the bottom, directly on top of the action
bar, so talking to somebody hid the bar — which is not a near miss, it is a
different design.

**Only the numbers leave.**  Blizzard's textures, fonts and strings stay in the
archive; what comes out is a box and an anchor, which is the same bargain
`spells.py` makes with `Spell.dbc` and `bake_terrain.py` makes with a model
path.  The art on our frames is ours.

The offsets are in the interface's own units, where the screen is 1024 by 768
whatever the monitor is; `src/hud.ts` scales that to the viewport.
"""
import json
import os
import re
import struct
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bake_terrain as B  # noqa: E402
from spells import CHAIN as DBC_CHAIN  # noqa: E402

# The archives, locale patches first, then the interface's own.
CHAIN = DBC_CHAIN + ['interface.MPQ', 'common.MPQ', 'common-2.MPQ']

# The screen the interface is laid out against, whatever the monitor is.
REF_W, REF_H = 1024, 768

# What this game has a panel for, and the frame in the original that owns that
# job.  Everything else in `FrameXML` is a job we do not do yet.
WANT = {
    'PlayerFrame': 'units',        # portrait, health, the player's own block
    'TargetFrame': 'target',
    'MinimapCluster': 'map',
    'MainMenuBar': 'bar',          # the action bar
    'MainMenuExpBar': 'xp',
    'CastingBarFrame': 'cast',     # ours is the swing timer, same place
    'GossipFrame': 'talk',
    'CharacterFrame': 'sheet',
    'ChatFrame1': 'log',
    'BuffFrame': 'auras',
    'WorldMapFrame': 'world',
    # The buttons that are always there.  In the original they sit *on* the
    # action bar's art, bags at its right end and the menu row left of them —
    # ours were floating above the bar and landed on the experience strip.
    'MainMenuBarBackpackButton': 'bags',
    'CharacterMicroButton': 'micro',
    # Buying.  It was not in this list, so buying a thing was four lines of a
    # conversation — and the icons page had already printed what that looks
    # like: *"lines 4 and 5 have the same words and the same price."*
    'MerchantFrame': 'shop',
    # And making a character, which happens before any of the above exists.
    'CharacterSelectCharacterFrame': 'pick',
}

# And the screens that come before the world.  `GlueXML` is its own directory
# and this pipeline had never opened it — see `tree`.
GLUE = ['CharacterCreate.xml', 'CharacterSelect.xml']

# The screen that makes a character, which is **sizes and not places**.
#
# `GlueXML` anchors its controls through templates and a scroll frame — a race
# button hangs off the one above it inside `CharacterCreateRaceScrollChild`,
# which is the `<ScrollChild>` of a `<ScrollFrame>` inside a backdrop frame
# inside `CharacterCreateFrame` — and this reader resolves a chain four deep
# against the screen, so every one of them came back at the same point or off
# the bottom edge.  What is read instead is what each control **is**, which the
# file states outright, plus the pitch of the stacks out of the second button's
# own offset.  Where they go is ours, and this comment is the declaration of
# that — the same kind of statement `spec.unread` makes.
CREATE = {
    'race': 'CharacterCreateRaceButtonTemplate',
    'class': 'CharacterCreateClassButtonTemplate',
    'sex': 'CharacterCreateGenderButtonTemplate',
    'look': 'CharacterCustomizationFrameTemplate',
    'name': 'CharacterCreateNameEdit',
    'ok': 'CharCreateOkayButton',
    'back': 'CharCreateBackButton',
    'dice': 'CharCreateRandomizeButton',
    'list': 'CharacterCreateRaceScrollFrame',
}

# The screen that **chooses** one, which is the same bargain as `CREATE`:
# sizes, not places.  A character row is 256 by 70 with a 217-wide line inside
# it, and the three buttons under the list say how big a button is here.
#
# `CharacterSelectDeleteButton` is in the list because deleting is half of
# what this screen is for — the original ships a confirmation dialog for it,
# which is the client saying out loud that it is not a small button.
PICK = {
    'row': 'CharSelectCharacterButtonTemplate',
    'enter': 'CharSelectEnterWorldButton',
    'back': 'CharacterSelectBackButton',
    'new': 'CharSelectCreateCharacterButton',
    'erase': 'CharacterSelectDeleteButton',
    'list': 'CharacterSelectCharacterFrame',
}

#: Which field of `ChrRaces.dbc` and `ChrClasses.dbc` holds the name in this
#: client's own language.  Found rather than looked up in a layout table: the
#: only field of either whose every value is an offset into the string block
#: that reads back as Korean.
RACE_NAME, CLASS_NAME = 15, 5

#: Which race this game is, and what `CharBaseInfo.dbc` says it may be.  The
#: seven are warrior, paladin, rogue, priest, death knight, mage and warlock —
#: written here so a misread column cannot come back as a plausible list.
HUMAN = 1
HUMAN_CLASSES = [1, 2, 4, 5, 6, 8, 9]

FILES = ['PlayerFrame.xml', 'TargetFrame.xml', 'Minimap.xml', 'MainMenuBar.xml',
         'CastingBarFrame.xml', 'GossipFrame.xml', 'CharacterFrame.xml',
         'FloatingChatFrame.xml', 'BuffFrame.xml', 'ContainerFrame.xml',
         'WorldMap.xml', 'UIPanelTemplates.xml', 'MainMenuBarBagButtons.xml',
         'MainMenuBarMicroButtons.xml', 'ActionBarFrame.xml',
         'MerchantFrame.xml',
         'UnitFrame.xml', 'TargetFrameTemplate.xml']


def tree(client, name, where='FrameXML'):
    """One interface file, with the namespaces stripped so ElementTree copes.

    `where` because the directory was written into this line, and the screen
    that makes a character is not in it: `FrameXML` is the game's interface and
    `GlueXML` is everything before you are in the world — the login, the list
    of characters, the one that makes one.  Adding a name to `FILES` could
    never have reached it.
    """
    data, _src = client.read('Interface\\%s\\%s' % (where, name))
    if not data:
        return None
    s = data.decode('utf-8', 'replace')
    s = re.sub(r'\sxmlns(:xsi)?="[^"]*"', '', s)
    s = re.sub(r'\sxsi:schemaLocation="[^"]*"', '', s, flags=re.S)
    try:
        return ET.fromstring(s)
    except ET.ParseError:
        return None


def collect(client):
    """Every named frame in the files we read, and what it sits inside.

    The enclosing frame matters: a frame whose anchor names no `relativeTo` is
    anchored to its parent, and the parent is the frame it is nested in.  The
    experience bar says `point="TOP"` with no relative — read as the screen
    that puts it across the top of the monitor, and read as its parent it is
    the strip along the top of the action bar, which is where it belongs.
    """
    found, owner = {}, {}
    for name, where in ([(f, 'FrameXML') for f in FILES]
                        + [(g, 'GlueXML') for g in GLUE]):
        t = tree(client, name, where)
        if t is None:
            continue

        def walk(node, parent):
            for ch in node:
                nm = ch.get('name')
                if nm:
                    found.setdefault(nm, ch)
                    owner.setdefault(nm, ch.get('parent') or parent)
                walk(ch, nm or parent)
        walk(t, None)
    return found, owner


def size_of(found, node, depth=0):
    """A frame's size, following `inherits` when it does not state one.

    Half the frames in the original state no size of their own: the target
    frame is a `TargetFrameTemplate` and the template is where the 232 by 100
    lives.  Reading only the frame gave `None` and a panel with no size is a
    panel drawn wherever the browser feels like.
    """
    if node is None or depth > 4:
        return None
    sz = node.find('Size')
    if sz is not None:
        d = sz.find('AbsDimension')
        if d is not None:
            return int(float(d.get('x') or 0)), int(float(d.get('y') or 0))
        if sz.get('x'):
            return int(float(sz.get('x'))), int(float(sz.get('y') or 0))
    for base in (node.get('inherits') or '').split(','):
        got = size_of(found, found.get(base.strip()), depth + 1)
        if got:
            return got
    return None


def anchors_of(node):
    out = []
    an = node.find('Anchors')
    if an is None:
        return out
    for a in an.findall('Anchor'):
        o = a.find('Offset/AbsDimension')
        x = int(float(o.get('x') or 0)) if o is not None else 0
        y = int(float(o.get('y') or 0)) if o is not None else 0
        if o is None and a.find('Offset') is not None:
            off = a.find('Offset')
            x = int(float(off.get('x') or 0))
            y = int(float(off.get('y') or 0))
        out.append((a.get('point'), a.get('relativeTo'), a.get('relativePoint'), x, y))
    return out


def place(size, anchors, against):
    """An anchor plus a size, as a box on the 1024 by 768 screen.

    `against` is the box the anchor is measured from — the screen for anything
    parented to `UIParent`, and the parent's own box otherwise.
    """
    if not size:
        return None
    w, h = size
    bx, by, bw, bh = against
    for point, _rel, relpoint, x, y in anchors:
        p = (point or 'TOPLEFT').upper()
        rp = (relpoint or p).upper()
        # Where on the thing we are anchored to the anchor lands.
        ax = bx if 'LEFT' in rp else bx + bw if 'RIGHT' in rp else bx + bw / 2
        ay = by if 'TOP' in rp else by + bh if 'BOTTOM' in rp else by + bh / 2
        ax += x
        ay -= y                       # the interface's y grows upwards
        # And which of the frame's own corners is sitting there.
        left = ax if 'LEFT' in p else ax - w if 'RIGHT' in p else ax - w / 2
        top = ay if 'TOP' in p else ay - h if 'BOTTOM' in p else ay - h / 2
        return [round(left), round(top), w, h]
    return None


def from_lua(client):
    """The two panels the original places in code rather than in XML.

    `ContainerFrame1` has no anchor in the XML because the backpack is placed
    by `ContainerFrame.lua`, out of four constants it declares at the top —
    `CONTAINER_WIDTH`, `CONTAINER_OFFSET_X`, `CONTAINER_OFFSET_Y` — against the
    bottom right of the screen.  Numbers, so they may leave, the same as the
    anchors in the XML.
    """
    out = {}
    data, _src = client.read('Interface\\FrameXML\\ContainerFrame.lua')
    if data:
        s = data.decode('utf-8', 'replace')

        def num(name, default):
            m = re.search(r'\b%s\s*=\s*(-?[\d.]+)' % name, s)
            return float(m.group(1)) if m else default
        out['bag'] = {'at': 'BOTTOMRIGHT', 'x': round(num('CONTAINER_OFFSET_X', 0)),
                      'y': round(num('CONTAINER_OFFSET_Y', 70)),
                      'w': round(num('CONTAINER_WIDTH', 192)), 'h': 320}
        out['bag']['box'] = [REF_W - out['bag']['x'] - out['bag']['w'],
                             REF_H - out['bag']['y'] - out['bag']['h'],
                             out['bag']['w'], out['bag']['h']]
    return out


PANEL_FILES = ['UIParent.lua']
# The `area` a window takes and how many may share it.  These names are the
# original's, not ours; `WANT` translates.
PANEL_RE = re.compile(
    r'UIPanelWindows\["(\w+)"\]\s*=\s*\{([^}]*)\}')


def panels(client):
    """Which windows share a place on the screen, and what happens when two do.

    `layout.py` read the anchors out of `FrameXML` and **not the rule that
    governs them**, and the result was two windows sitting on exactly the same
    418 by 129 rectangle with the shopkeeper's words showing through the
    character sheet.  It was not a misreading: the client really does put the
    gossip window and the character frame in the same place, because
    `UIPanelWindows` says they are both `left` and the left place holds one.

    Thirty-seven rows, four areas, and twenty-seven windows contending for
    `left`.  `pushable` of 0 means the window already there closes; a positive
    number means it slides aside and both stay up.

    Same file format, same boundary, same argument as the four constants this
    file already takes out of `ContainerFrame.lua`: numbers, so they may
    leave.  No text of any kind is read.
    """
    data, _src = client.read('Interface\\FrameXML\\UIParent.lua')
    if not data:
        return {}
    s = data.decode('utf-8', 'replace')
    out = {}
    for name, body in PANEL_RE.findall(s):
        area = re.search(r'area\s*=\s*"(\w+)"', body)
        push = re.search(r'pushable\s*=\s*(\d+)', body)
        if area:
            out[name] = {'area': area.group(1),
                         'push': int(push.group(1)) if push else 0}
    return out


def who(client):
    """Which races and classes exist, and which pairs of them are legal.

    Three tables and they answer three questions.  `CharBaseInfo.dbc` is the
    one that matters and it is **two bytes a row, 62 of them** — a race and a
    class and nothing else — so it is the whole of "may a human be a hunter"
    and there is no rule to reimplement.  A human's seven are 1, 2, 4, 5, 6, 8
    and 9.

    The names come out of the string block, and **that is a line this
    repository did not use to cross.**  `spells.py` reads 49 MB of `Spell.dbc`
    and never touches its 2.7 MB of strings; `talk.ts` writes every word a
    player sees.  The owner reversed that for quest prose on 2026-09-14 (issue
    190) and asked for these names the same way (issue 186), so they are read —
    ten class names and twenty-one race names, about 400 bytes of Korean.
    `CLAUDE.md`'s paragraph about words not leaving now has two exceptions and
    issue 209 is where that document catches up.

    Numbers and names.  No texture, no description, no sentence.
    """
    def rows(name):
        data, _src = client.read('DBFilesClient\\%s.dbc' % name)
        if data is None:
            return None, None
        magic, n, fields, rsize, _sb = struct.unpack_from('<4sIIII', data, 0)
        if magic != b'WDBC':
            return None, None
        return data, (n, fields, rsize, 20)

    def named(name, field):
        data, head = rows(name)
        if not head:
            return {}
        n, fields, rsize, at = head
        strings = data[at + n * rsize:]

        def word(off):
            end = strings.index(b'\0', off)
            return strings[off:end].decode('utf-8', 'replace')
        out = {}
        for i in range(n):
            r = struct.unpack_from('<%di' % fields, data, at + i * rsize)
            try:
                got = word(r[field])
            except (ValueError, IndexError):
                got = ''
            if got:
                out[r[0]] = got
        return out

    data, head = rows('CharBaseInfo')
    pairs = []
    if head:
        n, _fields, rsize, at = head
        # Two bytes a row, so this one cannot go through the int reader every
        # other table here uses: `<2i` on a two-byte record reads the next
        # thirty rows as one.
        pairs = [list(struct.unpack_from('<BB', data, at + i * rsize))
                 for i in range(n)]
    got = {'races': named('ChrRaces', RACE_NAME),
           'classes': named('ChrClasses', CLASS_NAME),
           'pairs': pairs}
    # The one number worth asserting, because it is the whole of the rule: a
    # human's seven.  Read a field wrong and this comes back as something
    # plausible — the pairs are small integers and every wrong column of a
    # two-byte record still parses.
    mine = sorted(c for r, c in pairs if r == HUMAN)
    if pairs and mine != HUMAN_CLASSES:
        sys.exit('CharBaseInfo says a human may be %s, which is not the '
                 'seven this client should have (%s)' % (mine, HUMAN_CLASSES))
    print('check: %d races, %d classes, %d legal pairs; a human may be %s'
          % (len(got['races']), len(got['classes']), len(pairs),
             ', '.join(got['classes'].get(c, str(c)) for c in mine)))
    return got


#: What the original calls each of the thirteen places this game has, and what
#: we call it.
#:
#: The seam every other id in this pipeline sits on, one more time: the name on
#: the left is Blizzard's and the word on the right is ours.  Six of the
#: original's nineteen are not here at all — neck, tabard, two rings and two
#: trinkets — because no item in this slice goes in them, and a square nothing
#: can ever fill is a square that teaches the player the game is unfinished.
DOLL_SLOTS = {
    'CharacterHeadSlot': 'head',
    'CharacterShoulderSlot': 'shoulder',
    'CharacterBackSlot': 'back',
    'CharacterChestSlot': 'chest',
    'CharacterShirtSlot': 'shirt',
    'CharacterWristSlot': 'wrist',
    'CharacterHandsSlot': 'hands',
    'CharacterWaistSlot': 'belt',
    'CharacterLegsSlot': 'legs',
    'CharacterFeetSlot': 'feet',
    'CharacterMainHandSlot': 'weapon',
    'CharacterSecondaryHandSlot': 'offhand',
    'CharacterRangedSlot': 'ranged',
}


def doll_columns(client):
    """Where the original puts the squares: two columns and a row of weapons.

    `PaperDollFrame.xml` anchors nineteen slot buttons and **only three of them
    carry a position** — 21,-74 for the head, 305,-74 for the hands and
    122,127 up from the bottom for the main hand.  Everything else hangs four
    pixels under the one above it, so the file states an *order* and a *side*
    rather than nineteen coordinates, and the order is the thing worth having:
    head at the top and feet at the bottom is a body, and our grid of thirteen
    squares in reading order was a spreadsheet.

    Followed rather than transcribed: the chain is walked from whichever
    buttons anchor to the frame itself, so a slot that moves in the file moves
    here.  Returns `{'left': [...], 'right': [...], 'bottom': [...]}` in our
    own words, with the six this game has no items for left out.
    """
    data, _src = client.read('Interface\\FrameXML\\PaperDollFrame.xml')
    if not data:
        return {}
    text = data.decode('utf-8', 'replace')
    anchor, roots = {}, []
    for m in re.finditer(r'<Button name="(Character\w+Slot)"([\s\S]{0,900}?)</Button>',
                         text):
        name, body = m.group(1), m.group(2)
        rel = re.search(r'<Anchor point="\w+" relativeTo="(Character\w+Slot)"', body)
        if rel:
            anchor[rel.group(1)] = name
        else:
            roots.append(name)
    if len(roots) != 3:
        sys.exit('PaperDollFrame.xml anchors %d columns, not three: %s'
                 % (len(roots), roots))

    def chain(head):
        out_, at = [], head
        while at and len(out_) < 20:
            out_.append(at)
            at = anchor.get(at)
        return out_

    # Which of the three is which, out of the file rather than by name: the two
    # that hang from the top are the columns, left before right by their own x,
    # and the one measured up from the bottom is the weapons.
    where = {}
    for name in roots:
        m = re.search(r'<Button name="%s"([\s\S]{0,900}?)</Button>' % name, text)
        body = m.group(1) if m else ''
        rel = re.search(r'relativePoint="(\w+)"', body)
        pos = re.search(r'<AbsDimension x="(-?[\d.]+)" y="(-?[\d.]+)"', body)
        where[name] = ((rel.group(1) if rel else 'TOPLEFT'),
                       float(pos.group(1)) if pos else 0.0)
    bottom = [n for n in roots if 'BOTTOM' in where[n][0]]
    tops = sorted((n for n in roots if n not in bottom), key=lambda n: where[n][1])
    if len(bottom) != 1 or len(tops) != 2:
        sys.exit('PaperDollFrame.xml does not lay out two columns and a row')
    ours = lambda names: [DOLL_SLOTS[n] for n in names if n in DOLL_SLOTS]  # noqa: E731
    return {'left': ours(chain(tops[0])), 'right': ours(chain(tops[1])),
            'bottom': ours(chain(bottom[0]))}


def spec(client, found):
    """The rest of the interface, as numbers.

    `layout.py` opened with the right principle — *the screen was laid out
    from memory, so it kept being wrong one piece at a time; a number tuned by
    hand twice is a number that should be derived* — and then carried thirteen
    boxes out of it.  The client states a great deal more, and all of it is
    literals:

      * `<Backdrop>` says how a panel's border is built: five `edgeSize`
        values across sixty-nine of them, and forty-two combinations of inset.
      * `<Font>` says the type scale: thirteen sizes, two shadow offsets, two
        outlines.  The Korean client's own face is `Fonts\\2002.TTF`, which we
        cannot ship and do not need — a scale is not a typeface.
      * `UnitFrame.lua` and `MainMenuBar.lua` state the bar colours outright.
        Ours were picked by eye: rage `#a32d22` where the client says
        (1, 0, 0), the experience bar `#5b3fa8` where it says (0.58, 0, 0.55).

    **What is deliberately not read, in one place** — the same idea as the
    pipeline's `*_DEFAULT_OK`: texture file names, any string a player sees,
    and `frameStrata`, which is a word rather than a number and would need our
    own stacking model to mean anything.
    """
    out = {}
    # Where the thirteen squares go — see `doll_columns`.
    out['doll'] = doll_columns(client)
    # Backdrops: how thick an edge is and how far the ground is inset.
    #
    # `edgeSize` is a child element and not an attribute — `<EdgeSize><AbsValue
    # val="16"/></EdgeSize>` — which the first pass read as an attribute and
    # came back with none of the sixty-nine.  Read off the whole of every file
    # the toc opens rather than off the thirteen frames this file already
    # walks, because a backdrop belongs to a panel and not to a frame we
    # happen to want a box for.
    edges, insets, tiles = set(), set(), set()
    for name in FILES:
        data, _src = client.read('Interface\\FrameXML\\' + name)
        if not data:
            continue
        t = data.decode('utf-8', 'replace')
        for block in re.findall(r'<Backdrop[\s\S]{0,600}?</Backdrop>', t):
            m = re.search(r'<EdgeSize>\s*<AbsValue val="([\d.]+)"', block)
            if m:
                edges.add(int(float(m.group(1))))
            m = re.search(r'<TileSize>\s*<AbsValue val="([\d.]+)"', block)
            if m:
                tiles.add(int(float(m.group(1))))
            for ins in re.findall(
                    r'<AbsInset left="(-?[\d.]+)" right="(-?[\d.]+)"'
                    r' top="(-?[\d.]+)" bottom="(-?[\d.]+)"', block):
                insets.add(tuple(int(float(v)) for v in ins))
    out['edge'] = sorted(edges)
    out['inset'] = sorted(insets)
    out['tile'] = sorted(tiles)
    # The type scale, out of `Fonts.xml`.
    data, _src = client.read('Interface\\FrameXML\\Fonts.xml')
    if data:
        t = data.decode('utf-8', 'replace')
        sizes = sorted({int(float(v)) for v in re.findall(r'<AbsValue val="([\d.]+)"', t)})
        out['font'] = [v for v in sizes if 8 <= v <= 30]
        off = re.findall(r'<Offset>\s*<AbsDimension x="(-?[\d.]+)" y="(-?[\d.]+)"', t)
        out['shadow'] = sorted({(int(float(a)), int(float(b))) for a, b in off})
    # And the colours, which are the ones we guessed.
    cols = {}
    data, _src = client.read('Interface\\FrameXML\\UnitFrame.lua')
    if data:
        t = data.decode('utf-8', 'replace')
        for k, r, g, b in re.findall(
                r'PowerBarColor\["(\w+)"\]\s*=\s*\{\s*r\s*=\s*([\d.]+),'
                r'\s*g\s*=\s*([\d.]+),\s*b\s*=\s*([\d.]+)', t):
            cols[k.lower()] = [round(float(r), 2), round(float(g), 2), round(float(b), 2)]
    data, _src = client.read('Interface\\FrameXML\\MainMenuBar.lua')
    if data:
        t = data.decode('utf-8', 'replace')
        bars = re.findall(r'SetStatusBarColor\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)', t)
        # Two of them and the order is the file's: rested first, then normal.
        for name, hit in zip(('xpRested', 'xp'), bars):
            cols[name] = [round(float(v), 2) for v in hit]
    out['colour'] = cols
    # How many things a shop shows at once, and how big one row of it is.
    #
    # `MERCHANT_ITEMS_PER_PAGE` is a constant at the top of
    # `MerchantFrame.lua`, the same shape of thing `from_lua` already takes out
    # of `ContainerFrame.lua`, and it is the reason the original has page
    # buttons at all.  Our own stock says the same: 90 vendors, 528 rows
    # between them, a median of five and a longest of twenty-eight — **78 fit
    # on one page and 12 do not.**
    #
    # The row's size comes out of the XML rather than the Lua: `MerchantItem`
    # is a `<Button>` template with its own `<Size>`, so `size_of` reads it the
    # way it reads any other frame.
    lua, _src = client.read('Interface\\FrameXML\\MerchantFrame.lua')
    if lua:
        t = lua.decode('utf-8', 'replace')
        for key, name in (('page', 'MERCHANT_ITEMS_PER_PAGE'),
                          ('buyback', 'BUYBACK_ITEMS_PER_PAGE')):
            m = re.search(r'\b%s\s*=\s*(\d+)' % name, t)
            if m:
                out.setdefault('shop', {})[key] = int(m.group(1))
    row = found.get('MerchantItemTemplate')
    if row is not None:
        got = size_of(found, row)
        if got:
            out.setdefault('shop', {})['row'] = [got[0], got[1]]
    # The character-creation screen: what each control is, and how far apart
    # two of them stand.  See `CREATE`.
    made = {}
    for key, name in CREATE.items():
        node = found.get(name)
        if node is None:
            continue
        got = size_of(found, node)
        if got:
            made[key] = [got[0], got[1]]
    # And the pitch, off the second button's own anchor: `CharacterCreateRace
    # Button2` hangs from button 1's `BOTTOMLEFT` at `y = -21`, so 21 is the
    # gap and 38 + 21 is how far apart two of them stand.  A grid cannot be
    # made out of one box.
    for key, name in (('racePitch', 'CharacterCreateRaceButton2'),
                      ('classPitch', 'CharacterCreateClassButton2')):
        node = found.get(name)
        if node is None:
            continue
        for an in node.findall('./Anchors/Anchor'):
            # Both, because the two stacks do not run the same way: the races
            # go down the scroll frame off `BOTTOMLEFT` and the classes go
            # across off `TOPRIGHT`.  One number would have made a column of
            # the classes, which is not what that screen does.
            made[key] = [abs(int(float(an.get('x') or 0))),
                         abs(int(float(an.get('y') or 0)))]
    if made:
        out['create'] = made
    # And the screen that chooses one.  **How many there may be is a number
    # the client states**, which is the difference between reading a rule and
    # picking one: `MAX_CHARACTERS_PER_REALM` is ten in `CharacterSelect.lua`
    # and `MAX_CHARACTERS_DISPLAYED` is ten beside it, so ten is how many
    # slots there are and ten is how many fit on the screen at once.  The
    # issue that asked for this said the number was ours to decide; it is not,
    # any more than `MERCHANT_ITEMS_PER_PAGE` was.
    chose = {}
    for key, name in PICK.items():
        node = found.get(name)
        if node is None:
            continue
        got = size_of(found, node)
        if got:
            chose[key] = [got[0], got[1]]
    lua, _src = client.read('Interface\\GlueXML\\CharacterSelect.lua')
    if lua:
        t = lua.decode('utf-8', 'replace')
        for key, name in (('slots', 'MAX_CHARACTERS_PER_REALM'),
                          ('shown', 'MAX_CHARACTERS_DISPLAYED')):
            m = re.search(r'\b%s\s*=\s*(\d+)' % name, t)
            if m:
                chose[key] = int(m.group(1))
    if chose:
        out['pick'] = chose
    # And what is left on purpose.
    out['unread'] = ['texture file names', 'anything a player reads',
                     'frameStrata (a word, and we have no stacking model)',
                     'edgeSize as a CSS border — it is the width of a '
                     'nine-slice artwork frame and ours is a one-pixel line']
    return out


def main(client_root, out):
    client = B.Client(client_root)
    B.CHAIN = CHAIN
    found, owner = collect(client)
    if not found:
        sys.exit('no FrameXML in this client — is `interface.MPQ` there?')

    screen = [0, 0, REF_W, REF_H]
    boxes = {}

    def box_of(name, depth=0):
        """One frame's box, placing its parent first if it needs to."""
        if name in boxes or depth > 4:
            return boxes.get(name)
        node = found.get(name)
        if node is None:
            return None
        par = owner.get(name)
        against = screen if not par or par == 'UIParent' else box_of(par, depth + 1)
        got = place(size_of(found, node), anchors_of(node), against or screen)
        if got:
            boxes[name] = got
        return got

    def screen_point(name, depth=0):
        """Which corner of the *screen* a frame is ultimately pinned to.

        A box on a 1024 by 768 screen is not a layout: put it on a wider
        monitor and every panel drifts towards the middle.  What survives the
        resize is the anchor, so the chain is walked up to whatever hangs off
        `UIParent` and that frame's point is the one the stylesheet uses.  The
        action bar is `BOTTOM` and stays on the bottom edge; the gossip window
        is `TOPLEFT` and stays in the corner.
        """
        par = owner.get(name)
        node = found.get(name)
        if node is None:
            return 'TOPLEFT'
        if par and par != 'UIParent' and depth < 4:
            return screen_point(par, depth + 1)
        an = anchors_of(node)
        return (an[0][0] or 'TOPLEFT').upper() if an else 'TOPLEFT'

    frames, missed = {}, []
    for name, ours in WANT.items():
        got = box_of(name)
        if got is None:
            missed.append(name)
            continue
        left, top, w, h = got
        at = screen_point(name)
        x = left if 'LEFT' in at else (REF_W - left - w if 'RIGHT' in at
                                       else round(left + w / 2 - REF_W / 2))
        y = top if 'TOP' in at else (REF_H - top - h if 'BOTTOM' in at
                                     else round(top + h / 2 - REF_H / 2))
        frames[ours] = {'at': at, 'x': x, 'y': y, 'w': w, 'h': h,
                        'box': got}

    # The layout, checked against a fact rather than trusted.  The gossip
    # window is 384 wide and pinned to the left edge; if it comes back at the
    # bottom of the screen the anchor arithmetic is wrong, which is exactly the
    # bug this file exists to end.
    frames.update(from_lua(client))

    talk = frames.get('talk')
    if not talk or talk['box'][0] != 0 or talk['w'] != 384 \
            or 'LEFT' not in talk['at']:
        sys.exit(f'the gossip window came back as {talk}, which is not '
                 f'384 wide against the left edge — the anchors are misread')
    bar = frames.get('bar')
    if not bar or bar['at'] != 'BOTTOM' or bar['y'] != 0:
        sys.exit(f'the action bar came back as {bar}, which is not sitting on '
                 f'the bottom edge — the anchors are misread')

    # And the rule that governs those anchors, which had never been read.
    seats = panels(client)
    ours = {}
    for name, word in WANT.items():
        # Whether or not the frame itself came back.  `WorldMapFrame` has no
        # XML in this client and so no box, but it is in `UIPanelWindows` as
        # `full` — a window that covers everything — and our own map panel is
        # exactly that.  A missing box is a missing position, not a missing
        # rule.
        if name in seats:
            ours[word] = seats[name]
    # The gossip window is its own frame in the original and our talk panel is
    # both a gossip window and a shop, so it takes the stricter of the two.
    if 'talk' in ours and 'MerchantFrame' in seats:
        ours['talk'] = {'area': 'left', 'push': 0}
    if not ours.get('sheet') or ours['sheet']['area'] != 'left':
        sys.exit('CharacterFrame came back as %s, and the whole point of '
                 'reading this table is that it is left and pushable'
                 % ours.get('sheet'))
    print('  %d windows in UIPanelWindows, %d of them ours: %s'
          % (len(seats), len(ours),
             ', '.join('%s %s/%d' % (k, v['area'], v['push'])
                       for k, v in sorted(ours.items()))))

    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, 'layout.json')
    with open(path, 'w') as f:
        doc = {'ref': [REF_W, REF_H], 'frames': frames, 'panels': ours,
               'spec': spec(client, found),
               'who': who(client)}
        json.dump(doc, f)
    print(f'{len(frames)} frames -> {path}   (screen {REF_W}x{REF_H}, '
          f'{os.path.getsize(path) // 1024} KiB)')
    sp = doc['spec']
    print('  spec: %d edge sizes, %d insets, %d font sizes, %d colours; '
          'not read: %s' % (len(sp['edge']), len(sp['inset']),
                            len(sp.get('font', [])), len(sp['colour']),
                            '; '.join(sp['unread'])))
    for k, v in sorted(frames.items(), key=lambda kv: kv[1]['box'][1]):
        print('  %-8s %-11s %4d, %-4d  %4d x %-4d' % (k, v['at'], v['x'],
                                                      v['y'], v['w'], v['h']))
    if missed:
        print('  not in this client, left to the stylesheet: ' + ', '.join(missed))


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                            else '~/workspace/warmane'),
         sys.argv[2] if len(sys.argv) > 2 else 'public/world')
