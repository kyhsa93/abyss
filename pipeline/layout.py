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
}

FILES = ['PlayerFrame.xml', 'TargetFrame.xml', 'Minimap.xml', 'MainMenuBar.xml',
         'CastingBarFrame.xml', 'GossipFrame.xml', 'CharacterFrame.xml',
         'FloatingChatFrame.xml', 'BuffFrame.xml', 'ContainerFrame.xml',
         'WorldMap.xml', 'UIPanelTemplates.xml', 'MainMenuBarBagButtons.xml',
         'MainMenuBarMicroButtons.xml', 'ActionBarFrame.xml',
         'UnitFrame.xml', 'TargetFrameTemplate.xml']


def tree(client, name):
    """One `FrameXML` file, with the namespaces stripped so ElementTree copes."""
    data, _src = client.read('Interface\\FrameXML\\' + name)
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
    for name in FILES:
        t = tree(client, name)
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
        json.dump({'ref': [REF_W, REF_H], 'frames': frames, 'panels': ours}, f)
    print(f'{len(frames)} frames -> {path}   (screen {REF_W}x{REF_H})')
    for k, v in sorted(frames.items(), key=lambda kv: kv[1]['box'][1]):
        print('  %-8s %-11s %4d, %-4d  %4d x %-4d' % (k, v['at'], v['x'],
                                                      v['y'], v['w'], v['h']))
    if missed:
        print('  not in this client, left to the stylesheet: ' + ', '.join(missed))


if __name__ == '__main__':
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1
                            else '~/workspace/warmane'),
         sys.argv[2] if len(sys.argv) > 2 else 'public/world')
