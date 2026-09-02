/**
 * Build the field sprites out of Liberated Pixel Cup parts.
 *
 * LPC is a modular pixel-art set: a body, and separate sheets for legs, torso,
 * head, weapon and shield that line up with it frame for frame, every one of
 * them drawn in four directions with a real walk cycle. That last part is why
 * it is here. A body on this floor has to face four ways and walk, and the
 * generator this replaced could not produce frames that agree with each other
 * — its motion had to be arithmetic on a single still.
 *
 * What each class wears is read off `classes.ts` rather than decided here.
 * `armorType` is already a game concept, printed on the roster card next to
 * the mitigation it buys, so plate looks like plate for the same reason it
 * reduces damage like plate. Tanks carry a shield because tanks carry a
 * shield. Nothing about the picture is a second opinion about what the class
 * is.
 *
 * Class colour is deliberately not in the sprite. The disc under a body
 * already carries it on its ring, and four armour types across seventeen specs
 * is the wrong channel to try to say "shaman" with — the ring says which
 * class, the body says what kind of fighter, and neither repeats the other.
 *
 * Licence is a condition rather than a courtesy here: the parts are variously
 * CC-BY-SA 3.0, GPL 3.0, OGA-BY and CC0, and every one names an author. The
 * credits are collected from the same definitions the layers come from and
 * written out, so the list cannot drift from what was actually used.
 *
 *   npm run lpc -- --lpc ~/src/Universal-LPC-Spritesheet-Character-Generator
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

import { CLASSES, CLASS_ORDER } from '../src/sim/classes'
import { classColor } from '../src/render/theme'
import type { ClassId } from '../src/sim/classes'

const IMAGE = resolve(process.cwd(), 'public/art/lpc.webp')
const TABLE = resolve(process.cwd(), 'src/render/lpc.ts')
const CREDITS = resolve(process.cwd(), 'art/LPC-CREDITS.md')

const args = process.argv.slice(2)
const at = args.indexOf('--lpc')
const LPC = resolve(at >= 0 && args[at + 1] ? args[at + 1]! : join(homedir(), 'src/lpc'))

/** LPC's own cell, and its four directions. */
const CELL = 64
const DIRECTIONS = 4

/**
 * Five frames per animation, subsampled from whatever LPC ships.
 *
 * The sheets are nine frames for a walk and six or seven for an action, and at
 * sixty pixels on a phone nothing survives of the difference between four
 * frames of a stride and eight. Taking five evenly is what pays for the second
 * animation: narrowing the columns almost exactly offsets doubling the rows,
 * so casting costs nothing in bytes.
 *
 * Frame zero is kept whatever else is dropped. It is LPC's standing pose and
 * the renderer reserves it for standing still.
 */
const FRAMES = 5

/**
 * How big a cell has to be to hold everything drawn into it.
 *
 * Not a number. The cell used to be forty wide, measured once off a body and
 * never again, and the comment here said it was re-measured at build time —
 * which it was not. Everything narrower than a person fitted; a longsword
 * mid-swing needed a hundred and sixty-two and got forty, so a warrior's
 * blade was sliced off at the wrist and had been for as long as there were
 * swords.
 *
 * So it is measured, every build, off the alpha of the layers that were
 * actually resolved: the union of every frame of every direction of every
 * subject, and the cell is whatever holds it. A layer table that gains a
 * two-handed axe gets a wider atlas and nobody has to notice.
 *
 * Height is measured the same way and in two halves, because a body's feet
 * are not in the middle of anything: `LPC_FOOT` is how far down the cell the
 * ground line sits, and a sword can swing below it.
 *
 * The cap is LPC's own largest cell. Past that is not a wide weapon, it is a
 * sheet being read wrong, and the atlas should not quietly quadruple for it.
 */
const CELL_CAP = CELL * 3

/** Painted detail is what compresses badly and pixel art has none. */
const QUALITY = 0.85

/**
 * What the armour on the roster card looks like.
 *
 * Mail has no plate-style leg piece in the set, so it borrows the plain
 * trousers the light classes wear — at sixty pixels the torso is what reads,
 * and a wrong pair of greaves is invisible next to a wrong chestpiece.
 */
const ARMOUR: Record<string, { torso: string; legs: string; feet: string }> = {
  plate: {
    torso: 'torso/armour/plate/male',
    legs: 'legs/armour/plate/male',
    feet: 'feet/armour/plate/male',
  },
  mail: {
    torso: 'torso/chainmail/male',
    legs: 'legs/pants/male',
    feet: 'feet/boots/fold/male',
  },
  leather: {
    torso: 'torso/armour/leather/male',
    legs: 'legs/pants/male',
    feet: 'feet/boots/basic/male',
  },
  // Sandals rather than boots, and the difference is the point: the three
  // cloth classes are the ones with nothing on their feet worth calling
  // armour, and a bare ankle says so at a glance.
  cloth: {
    torso: 'torso/clothes/shortsleeve/tshirt/male',
    legs: 'legs/pants/male',
    feet: 'feet/sandals/male',
  },
}

/**
 * What the class fights with.
 *
 * A weapon is a handful of pixels at this size, which is the point: it is the
 * silhouette's outline that separates a staff from a bow, and that survives
 * being small far better than a colour does.
 */
const WEAPON: Record<ClassId, string | null> = {
  warrior: 'weapon/sword/longsword',
  paladin: 'weapon/sword/arming',
  // One staff between the five of them, and it is the set that decided that
  // rather than this table. A caster spends the fight casting, and `spellcast`
  // is drawn for exactly one weapon in the whole of LPC — the plain staff. The
  // gnarled, crystal and diamond staffs are drawn walking and thrusting and
  // nothing else, so a druid holding one had it in hand right up to the moment
  // it did the thing a druid does, and then it was gone.
  //
  // Little is lost. What a weapon is here is the outline that separates a
  // staff from a bow, not the one that separates a staff from another staff —
  // which class is being looked at is what the ring under the body is for.
  priest: 'weapon/magic/simple',
  druid: 'weapon/magic/simple',
  shaman: 'weapon/magic/simple',
  mage: 'weapon/magic/simple',
  warlock: 'weapon/magic/simple',
  hunter: 'weapon/ranged/bow/normal',
  rogue: 'weapon/sword/dagger',
}

/**
 * The bosses, out of the same set.
 *
 * LPC ships no monsters, but it ships monstrous heads — skeleton, zombie,
 * orc, troll, minotaur, lizard, alien — and they are drawn to sit on the same
 * bodies as the human ones. That is enough: a boss here has to read as a large
 * hostile thing at a glance, and the head is what carries that.
 *
 * Armour only exists for the male, female and teen bodies, so a boss that
 * wears any is built on one of those with a monster's head. The Long Ledger
 * wears nothing, which is what lets it be an actual skeleton.
 *
 * Each is chosen against the `demand` line the encounter already shows before
 * a pull, so the picture cannot promise a fight the encounter does not run.
 */
const BOSS: Record<string, Layer[]> = {
  // "the floor, and whoever is standing on it" — a drowned jailer in plate.
  warden: [
    { z: 10, dir: 'body/bodies/male' },
    { z: 15, dir: 'feet/armour/plate/male' },
    { z: 20, dir: 'legs/armour/plate/male' },
    { z: 60, dir: 'torso/armour/plate/male' },
    { z: 100, dir: 'head/heads/zombie/adult' },
  ],
  // "stay apart, and out-heal the singing" — something robed with a lantern
  // for a head, which is as close to a many-mouthed chorus as the set goes.
  choir: [
    { z: 10, dir: 'body/bodies/male' },
    { z: 15, dir: 'feet/shoes/basic/male' },
    { z: 20, dir: 'legs/pants/male' },
    { z: 60, dir: 'torso/clothes/shortsleeve/tshirt/male' },
    { z: 100, dir: 'head/heads/jack/adult' },
  ],
  // "come in, get behind, change target" — an armoured thing from the water.
  tidebreaker: [
    { z: 10, dir: 'body/bodies/male' },
    { z: 15, dir: 'feet/armour/plate/male' },
    { z: 20, dir: 'legs/armour/plate/male' },
    { z: 60, dir: 'torso/armour/plate/male' },
    { z: 100, dir: 'head/heads/lizard/male' },
  ],
  // "stop, look away, and leave it whole" — the head is all eyes.
  watcher: [
    { z: 10, dir: 'body/bodies/male' },
    { z: 15, dir: 'feet/shoes/basic/male' },
    { z: 20, dir: 'legs/pants/male' },
    { z: 60, dir: 'torso/clothes/shortsleeve/tshirt/male' },
    { z: 100, dir: 'head/heads/alien/adult' },
  ],
  // "decide who pays, then pay it" — a skeleton, wearing nothing, which is the
  // one boss the bare skeleton body is exactly right for.
  ledger: [
    { z: 10, dir: 'body/bodies/skeleton' },
    { z: 100, dir: 'head/heads/skeleton/adult' },
  ],
}

/**
 * Hair, one per spec.
 *
 * This is the channel that separates two specs of the same class. Armour comes
 * off `armorType` and a warrior's two specs wear the same plate, so without
 * this the protection and arms tiles are the same person holding the same
 * sword. It is a few pixels at the top of a head and it is enough, because at
 * this size a silhouette is mostly outline.
 *
 * Named by style rather than by path: some styles keep their frames under
 * `adult/`, some under `male/`, some behind another `fg/`, and the resolver
 * below finds whichever it is.
 */
const HAIR: Record<string, string> = {
  'warrior-protection': 'buzzcut',
  'warrior-arms': 'mop',
  'paladin-protection': 'parted',
  'paladin-holy': 'long',
  'paladin-retribution': 'swoop',
  'priest-discipline': 'bob',
  'priest-shadow': 'long_messy',
  'druid-guardian': 'dreadlocks_short',
  'druid-restoration': 'braid',
  'druid-balance': 'long_straight',
  'druid-feral': 'unkempt',
  'shaman-restoration': 'cornrows',
  'shaman-elemental': 'twists_fade',
  'mage-frost': 'xlong',
  'warlock-destruction': 'spiked',
  'hunter-marksmanship': 'ponytail',
  'rogue-assassination': 'pixie',
}

/**
 * The three things a boss puts on the floor.
 *
 * A thrall and a stalker walk in and hit somebody, which is what every summon
 * before them did and what the party's rules already understand — one body
 * covers both.
 *
 * The other two break that rule in opposite directions and the whole demand of
 * their fights is telling them apart, so they are drawn to be told apart. The
 * knell hurts nobody and has to be killed anyway: it is a skeleton, a thing.
 * The vessel hurts somebody and must not be killed: it is a person, in cloth,
 * with a human face — the one summon on the floor that does not look like
 * something to swing at.
 */
const ADD: Record<string, Layer[]> = {
  thrall: [
    { z: 10, dir: 'body/bodies/male' },
    { z: 15, dir: 'feet/boots/basic/male' },
    { z: 20, dir: 'legs/pants/male' },
    { z: 60, dir: 'torso/armour/leather/male' },
    { z: 100, dir: 'head/heads/goblin/adult' },
    { z: 140, dir: 'weapon/sword/dagger' },
  ],
  knell: [
    { z: 10, dir: 'body/bodies/skeleton' },
    { z: 100, dir: 'head/heads/skeleton/adult' },
  ],
  // The interlude's elite. A thrall's kin in heavier plate — the same kind of
  // thing the escort beside it is, promoted, which is what the fight is
  // saying: this is not a second boss, it is the biggest of them.
  herald: [
    { z: 10, dir: 'body/bodies/male' },
    { z: 15, dir: 'feet/armour/plate/male' },
    { z: 20, dir: 'legs/armour/plate/male' },
    { z: 60, dir: 'torso/armour/plate/male' },
    { z: 100, dir: 'head/heads/goblin/adult' },
    { z: 120, dir: 'hat/helmet/barbarian/adult' },
    // The same blade the escort carries. Plate and a helmet and half again the
    // height are what say which of them is the one the fight stopped for; a
    // different weapon on a body this size is a detail nobody can see.
    { z: 140, dir: 'weapon/sword/dagger' },
  ],
  vessel: [
    { z: 10, dir: 'body/bodies/male' },
    // Barefoot, like the rest of it: the one summon that is a person rather
    // than a thing, and nothing about it should look equipped.
    { z: 20, dir: 'legs/pants/male' },
    { z: 60, dir: 'torso/clothes/shortsleeve/tshirt/male' },
    { z: 100, dir: 'head/heads/human/male' },
    { z: 110, dir: 'hair/long' },
  ],
}

/**
 * What a class puts on its head and shoulders.
 *
 * Colour separated the classes and this separates their outlines, which is the
 * half colour cannot do: a shape survives being small, being dimmed under a
 * telegraph, and being seen out of the corner of an eye while something else
 * is being read. A pointed hat is a mage from across the room.
 *
 * Not everyone gets one. A druid in nothing is a druid, and a set where every
 * class wears a hat is a set where the hat has stopped meaning anything.
 */
const HEADGEAR: Partial<Record<ClassId, string>> = {
  warrior: 'hat/helmet/barbarian',
  paladin: 'hat/helmet/armet_simple',
  priest: 'hat/cloth/hood',
  mage: 'hat/magic/wizard',
  warlock: 'hat/cloth/hood',
  hunter: 'hat/cloth/leather_cap',
  rogue: 'hat/cloth/hood',
}

/** Heavy shoulders read as heavy armour from further away than plate does. */
const SHOULDERS: Partial<Record<ClassId, string>> = {
  warrior: 'shoulders/pauldrons',
  paladin: 'shoulders/pauldrons',
  shaman: 'shoulders/mantal',
}

/** A cape is a silhouette that moves, which is worth more than one that does not. */
/**
 * What hangs off the back.
 *
 * Everyone, now that the camera stands behind the player. A cape used to be on
 * three classes and it was the right call while the view looked down at the
 * top of everybody's head — a back is not much of a silhouette from up there.
 * The camera sits behind a shoulder now and the back is most of what is on
 * screen, so a body without one is a body with nothing to look at.
 *
 * Two cuts rather than one, which is what keeps this from being the mistake
 * the headgear table warns about. A set where every class wears the same cape
 * is a set where the cape has stopped saying anything: solid for the ones in
 * armour and in ceremony, tattered for the ones who live outside. The colour
 * is the class's own, as it is on every other worn layer.
 */
const CAPE: Partial<Record<ClassId, string>> = {
  warrior: 'cape/solid',
  paladin: 'cape/solid',
  priest: 'cape/solid',
  mage: 'cape/solid',
  warlock: 'cape/solid',
  rogue: 'cape/tattered',
  hunter: 'cape/tattered',
  shaman: 'cape/tattered',
  druid: 'cape/tattered',
}

/** Only tanks, because only tanks are holding one. */
const SHIELD = 'shield/heater'

/**
 * The two things a body on this floor is ever doing.
 *
 * Walking, and the thing it does when it presses a button. Which of the three
 * shapes the second one takes is decided in `actionFor`.
 */
const ANIMATIONS = ['walk', 'action'] as const

/** What LPC calls the animation, and what else it might call it. */
const ALIASES: Record<string, string[]> = {
  walk: ['walk'],
  slash: ['slash', 'attack_slash'],
  spellcast: ['spellcast', 'cast'],
  shoot: ['shoot', 'attack_bow'],
}

/**
 * What pressing a button looks like.
 *
 * Read off what is in the hands rather than off the spec, which is the same
 * rule the rest of this table keeps: plate looks like plate because the class
 * wears plate, and a bow is drawn because the class carries a bow.
 *
 * `melee` was the whole answer once, and it is only two thirds of one. It is
 * a question about distance — does this spec have to close it — and there are
 * two ways to answer a fight from across the room. A hunter carried a bow
 * through every frame and then raised a hand and cast with it, which reads as
 * a caster who happens to be holding a stick.
 *
 * The set has the frames: `shoot` is drawn for the body, for every piece of
 * leather a hunter wears, and for the bow itself. Nothing here had to be
 * chosen for it except which of the three to ask for.
 */
function actionFor(classId: ClassId, melee: boolean): string {
  if (melee) return 'slash'
  return WEAPON[classId]?.startsWith('weapon/ranged/') === true ? 'shoot' : 'spellcast'
}

/**
 * Find a sheet for one animation somewhere under a directory.
 *
 * LPC does not lay its equipment out one way. A longsword keeps its walk
 * frames at `walk/longsword.png`, a gnarled staff at
 * `universal/walk/foreground.png`, a plain one at `foreground/walk/simple.png`
 * and a shield several directories further down again. Hard-coding those was
 * five wrong guesses in a row, so the path in the table is the equipment and
 * this finds the sheet.
 *
 * A piece with two halves is asked for by half, because for most of them
 * neither one alone is the piece. Which side of a body a sword hangs on is a
 * fact about which way it is facing, so the set draws the half in front of the
 * body and the half behind it as separate sheets and leaves the other empty —
 * and a packer that took the front half only got a sword for two of the four
 * directions and nothing for the other two. The cape learned this first.
 *
 * The set names the two halves six ways: `foreground`/`background`,
 * `fg`/`bg`, and a `behind` or `universal_behind` folder for the sheets that
 * were drawn before the convention settled. A sheet in none of those is a
 * piece with only one half, and it answers to whichever is asked for.
 */
function behindHalf(p: string): boolean {
  return /(^|\/)(background|bg|behind|universal_behind)(\/|\.png$)/.test(p)
}

/**
 * How many frames across a sheet is, and how tall a cell it is drawn on.
 *
 * Straight out of the PNG header, which is thirty-three bytes and always in
 * the same place. Four rows, one a direction, so the height says the cell.
 */
function geometry(rel: string): { cell: number; frames: number } {
  const buf = readFileSync(join(LPC, 'spritesheets', `${rel}.png`))
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const cell = Math.max(1, Math.round(height / DIRECTIONS))
  return { cell, frames: Math.max(1, Math.round(width / cell)) }
}

/**
 * @param frames How many frames the body is drawing for this animation, when
 *   that is known. The layers of one animation have to agree frame for frame —
 *   that agreement is the whole of what makes this set modular — so a sheet
 *   with a different count is a sheet showing something else. It is not a
 *   theoretical worry: the bow keeps a thirteen-frame sheet in its `walk`
 *   folder beside the eight-frame walk, and taken on depth alone the wrong one
 *   won, which put a hunter halfway through drawing its bow on every stride.
 *
 *   Nearest rather than equal, because agreement is not always available: a
 *   body walks in nine frames and a good many things it carries walk in eight.
 *   Eight against nine is a stride half a frame out at the end of the cycle,
 *   which is nothing; thirteen against nine is a different animation.
 */
function findAnim(
  dir: string,
  anim: string,
  half: 'front' | 'behind' = 'front',
  frames?: number,
): string | null {
  const root = join(LPC, 'spritesheets', dir)
  if (!existsSync(root)) return null

  const names = ALIASES[anim] ?? [anim]
  const hits: string[] = []
  const walk = (d: string, depth: number) => {
    if (depth > 5) return
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full, depth + 1)
      else if (entry.name.endsWith('.png')) {
        const matches = names.some((n) => full.includes(`/${n}/`) || entry.name === `${n}.png`)
        if (matches) hits.push(full)
      }
    }
  }
  walk(root, 0)

  // Whichever half was asked for, with the sheets that are neither counted as
  // front: a piece drawn as a single sheet is a piece that hangs in front.
  const wanted = hits.filter((p) => (half === 'behind' ? behindHalf(p) : !behindHalf(p)))
  if (wanted.length === 0) return null

  const rel = (p: string) => p.slice(join(LPC, 'spritesheets').length + 1, -4)

  // Agreeing with the body first, then shallowest: under a half's own folder
  // the set keeps recolours, and the one at the top is the plain metal the
  // table means.
  const apart = (p: string) =>
    frames === undefined ? 0 : Math.abs(geometry(rel(p)).frames - frames)
  wanted.sort((a, b) => apart(a) - apart(b) || a.split('/').length - b.split('/').length)
  return rel(wanted[0]!)
}

interface Layer {
  z: number
  /** A directory. Which sheet inside it depends on the animation being built. */
  dir: string
  /**
   * Which half of a two-part piece this layer is, when it is one.
   *
   * Defaults to the front, which is also what a piece with only one sheet
   * answers to. Anything drawn on both sides of a body — a cape, a weapon, a
   * shield — goes in twice, once each side, at two different `z`.
   */
  half?: 'front' | 'behind'
  /**
   * Push this layer towards a colour, keeping its shading.
   *
   * Set on the worn layers and nothing else. Four armour types across
   * seventeen specs left every class reading as the same person in a different
   * hat, and colour is the fastest channel there is — the game already assigns
   * each class one and the roster, the party frames and the ring under a body
   * all use it. Skin and hair are left alone: a paladin is a person in gold
   * armour, not a gold person.
   */
  tint?: string
}

/**
 * The two druid specs that fight as something else.
 *
 * A bear holds the boss and a cat opens its back, which is the one class in
 * this game whose two melee specs are the same person doing two unrelated
 * jobs — and until now they were the same twenty pixels doing them.
 *
 * Neither is on four legs, and that is the set rather than a choice: it ships
 * beast heads, ears and tails to put on a person, and no quadrupeds at all. So
 * these are the shapes that read at the size a body is actually drawn — one
 * heavy and shaggy, one lean and dark — rather than the shapes the names
 * promise.
 *
 * Everything worn comes off with them. A bear in pauldrons and a cape is a
 * costume; what makes a form read is that the outline stops being a person's.
 */
const FORMS: Record<string, { body: string; head: string; tail?: string }> = {
  'druid/guardian': {
    body: 'body/bodies/muscular',
    head: 'head/heads/wartotaur',
  },
  'druid/feral': {
    body: 'body/bodies/male',
    // Named down to the variant. `findAnim` searches, and the wolf ships a
    // child, a female and a male — it reached the child first and gave the
    // druid a cub's skull on a grown body.
    head: 'head/heads/wolf/male',
    tail: 'body/tail/cat/adult',
  },
}

function layersFor(classId: ClassId, spec: string, role: string): Layer[] {
  const form = FORMS[`${classId}/${spec}`]
  if (form) {
    // Tinted like every worn layer, and for the same job: the class colour is
    // how a body is told apart on the floor, and a form that dropped it would
    // be the one druid nobody could pick out. It lands on the hide here rather
    // than on cloth, which also stops these two reading as bare skin — a beast
    // the colour of a person is a person with an odd head.
    const hide = classColor(classId)
    const stack: Layer[] = [
      { z: 10, dir: form.body, tint: hide },
      { z: 100, dir: form.head, tint: hide },
    ]
    if (form.tail) {
      // Behind the body and in front of it, for the reason a cape is: which
      // side of a body a tail falls on is a fact about which way it is facing.
      stack.push({ z: 5, dir: `${form.tail}/bg`, tint: hide, half: 'behind' })
      stack.push({ z: 120, dir: `${form.tail}/fg`, tint: hide })
    }
    return stack
  }

  const armour = ARMOUR[CLASSES[classId].armorType] ?? ARMOUR.cloth!
  const weapon = WEAPON[classId]

  // Enough to say which class without washing out the shading that says which
  // armour. Legs take less than the torso: they are half in shadow already and
  // the same strength on both read as a costume rather than as kit.
  const colour = classColor(classId)

  const stack: Layer[] = [
    { z: 10, dir: 'body/bodies/male' },
    // Under the legs, because trousers hang over a boot rather than the other
    // way round.
    { z: 15, dir: armour.feet, tint: colour },
    { z: 20, dir: armour.legs, tint: colour },
    { z: 60, dir: armour.torso, tint: colour },
    { z: 100, dir: 'head/heads/human/male' },
  ]

  // A cape is two layers, not one, and the set ships them apart for a reason
  // this renderer cares about more than most: which side of the body it falls
  // on depends on which way the body is facing. Walking away from the camera
  // you see the cloth over their back; walking toward it you see it behind
  // their shoulders.
  //
  // It went in as one layer and `findAnim` picked whichever it found first,
  // which was the one that hangs behind. The camera now stands behind the
  // player, so the one view that matters most was the one with no cape in it.
  const cape = CAPE[classId]
  if (cape) {
    stack.push({ z: 5, dir: `${cape}/bg`, tint: colour, half: 'behind' })
    // Above the torso and below anything held, so it falls over the armour and
    // a drawn weapon still reads in front of it.
    stack.push({ z: 130, dir: `${cape}/fg`, tint: colour })
  }

  // Above the head, below anything held: hair is drawn on a head, and a shield
  // arm passes in front of it.
  const hair = HAIR[`${classId}-${spec}`]
  if (hair) stack.push({ z: 110, dir: `hair/${hair}` })

  const shoulders = SHOULDERS[classId]
  if (shoulders) stack.push({ z: 115, dir: shoulders, tint: colour })

  // Over the hair, because it is worn on top of it.
  const hat = HEADGEAR[classId]
  if (hat) stack.push({ z: 120, dir: hat, tint: colour })

  // Both halves, for the reason the cape is both: which side of a body a
  // thing hangs on is a fact about which way it is facing, and the set draws
  // the two sides as separate sheets. Taken front-only, a sword was drawn for
  // the two directions that carry it in front and for the other two the hand
  // was empty — and a bow, whose walk frames are all behind, was never drawn
  // at all except while being fired.
  if (role === 'tank') {
    stack.push({ z: 7, dir: SHIELD, tint: colour, half: 'behind' })
    stack.push({ z: 130, dir: SHIELD, tint: colour })
  }
  if (weapon) {
    stack.push({ z: 6, dir: weapon, half: 'behind' })
    stack.push({ z: 140, dir: weapon })
  }
  return stack
}

interface Subject {
  id: string
  layers: Layer[]
  /** Which sheet the action animation is built from. */
  action: string
}

/** Every spec in the order the roster shows them, then every boss. */
function specs(): Subject[] {
  const out: Subject[] = []
  for (const classId of CLASS_ORDER) {
    for (const spec of CLASSES[classId].specs) {
      out.push({
        id: `${classId}-${spec.id}`,
        layers: layersFor(classId, spec.id, spec.role),
        action: actionFor(classId, spec.melee),
      })
    }
  }
  // A boss's mechanics are scripted rather than cast off an ability table, and
  // every one of them reads as something being done to the room. Slash is the
  // closer of the two to that.
  for (const [id, layers] of Object.entries(BOSS)) {
    out.push({ id: `boss-${id}`, layers, action: 'slash' })
  }
  // A thrall swings. The other two never do anything a swing would describe,
  // but a block has to exist for every subject, and standing on frame zero of
  // one is what they will be doing.
  for (const [id, layers] of Object.entries(ADD)) {
    out.push({ id: `add-${id}`, layers, action: 'slash' })
  }
  return out
}

/**
 * Who drew what, gathered from the definitions rather than from memory.
 *
 * Each definition carries a `credits` array naming the file, its authors and
 * its licences. Walking the definitions for the paths actually used means the
 * attribution cannot fall behind a change to the layer table.
 */
function credits(paths: Set<string>): string[] {
  const lines = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.json')) {
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>
        } catch {
          continue
        }
        const rows = parsed.credits
        if (!Array.isArray(rows)) continue
        for (const row of rows as Array<Record<string, string>>) {
          const file = String(row.file ?? '')
          if (!file) continue
          // A definition credits a directory; the layer table names a file
          // inside it, so the match is by prefix in either direction.
          const used = [...paths].some((p) => p.startsWith(file) || file.startsWith(p.split('/').slice(0, -1).join('/')))
          if (!used) continue
          const authors = row.authors ?? row.notes ?? ''
          const licence = row.licenses ?? row.license ?? ''
          lines.add(`- \`${file}\` — ${authors} (${licence})`)
        }
      }
    }
  }
  walk(join(LPC, 'sheet_definitions'))
  return [...lines].sort()
}

async function main(): Promise<void> {
  if (!existsSync(join(LPC, 'spritesheets'))) {
    console.error(`no LPC checkout at ${LPC}`)
    console.error('  git clone --depth 1 https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator.git')
    console.error('  npm run lpc -- --lpc <that directory>')
    process.exit(1)
  }

  const all = specs()
  const used = new Set<string>()
  const missing: string[] = []

  // A block per subject per animation, four directions inside each. A layer
  // that has no sheet for an animation is dropped rather than fatal — a staff
  // with no slash frames is a staff that is not drawn mid-swing, which is
  // better than no character.
  const blocks = all.flatMap((spec, index) =>
    ANIMATIONS.map((anim, order) => {
      const sheet = anim === 'walk' ? 'walk' : spec.action
      // The body sets the beat. It is the one layer that is never optional and
      // never has two halves, so it is resolved first and everything else is
      // held to the number of frames it came back with.
      const bodyLayer = spec.layers.find((layer) => layer.dir.startsWith('body/'))
      const bodySheet = bodyLayer ? findAnim(bodyLayer.dir, sheet) : null
      const beat = bodySheet ? geometry(bodySheet).frames : undefined
      const layers = spec.layers
        .map((layer) => {
          const found = findAnim(layer.dir, sheet, layer.half ?? 'front', beat)
          if (!found) {
            // A piece with no behind half is the ordinary case, not a gap.
            if (anim === 'walk' && (layer.half ?? 'front') === 'front') {
              missing.push(`${spec.id}: ${layer.dir} has no ${sheet}`)
            }
            return null
          }
          used.add(found)
          const file = join(LPC, 'spritesheets', `${found}.png`)
          return {
            z: layer.z,
            tint: layer.tint ?? null,
            data: `data:image/png;base64,${readFileSync(file).toString('base64')}`,
          }
        })
        .filter((l): l is { z: number; tint: string | null; data: string } => l !== null)
        .sort((a, b) => a.z - b.z)

      return { id: spec.id, block: index * ANIMATIONS.length + order, layers }
    }),
  )

  for (const line of missing) console.error(`  ! missing layer  ${line}`)

  const browser = await chromium.launch()
  let packed: { png: string; cellW: number; cellH: number; foot: number; wanted: number }
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><meta charset="utf-8">', { waitUntil: 'load' })
    packed = await page.evaluate(
      async ({ blocks, cell, cellCap, frames, directions, quality }) => {
        /** Which frame of a sheet of `count` the packer takes for slot `f`. */
        const slot = (f: number, count: number) =>
          f === 0 ? 0 : Math.min(count - 1, Math.round((f * (count - 1)) / (frames - 1)))

        /**
         * How big a cell this sheet is drawn on, which is not always the body's.
         *
         * A weapon that swings wide does not fit in the square its owner stands
         * in, so LPC ships those on a bigger canvas — a hundred and twenty-eight
         * for an arming sword, a hundred and ninety-two for a longsword
         * mid-slash — with the body's own sixty-four square centred inside it.
         * Every one is still four rows, one a direction, so the height says
         * which.
         */
        const shapeOf = (image: HTMLImageElement) => {
          const srcCell = Math.max(1, Math.round(image.naturalHeight / directions))
          return {
            srcCell,
            inset: (srcCell - cell) / 2,
            count: Math.max(1, Math.round(image.naturalWidth / srcCell)),
          }
        }

        // --- how big the cell has to be ------------------------------------
        //
        // Off the alpha of the sheets that were actually resolved, and only
        // over the frames actually taken: a sheet has nine or thirteen and the
        // atlas keeps five, so measuring the ones dropped would size the cell
        // for art that never lands in it.
        //
        // Cached by the sheet itself. The same trousers are worn by nine specs
        // and the same body by every one of them, and the read below is a
        // pixel at a time.
        const probe = document.createElement('canvas')
        const pr = probe.getContext('2d', { willReadFrequently: true })!
        const seen = new Map<string, { l: number; r: number; t: number; b: number } | null>()

        for (const c of blocks) {
          for (const layer of c.layers) {
            if (seen.has(layer.data)) continue
            const image = new Image()
            image.src = layer.data
            await image.decode()
            const { srcCell, inset, count } = shapeOf(image)
            probe.width = image.naturalWidth
            probe.height = image.naturalHeight
            pr.clearRect(0, 0, probe.width, probe.height)
            pr.drawImage(image, 0, 0)
            const px = pr.getImageData(0, 0, probe.width, probe.height).data
            let l = Infinity
            let r = -Infinity
            let t = Infinity
            let b = -Infinity
            for (let f = 0; f < frames; f++) {
              const from = slot(f, count)
              for (let d = 0; d < directions; d++) {
                for (let y = 0; y < srcCell; y++) {
                  const row = d * srcCell + y
                  for (let x = 0; x < srcCell; x++) {
                    if (px[(row * probe.width + from * srcCell + x) * 4 + 3]! < 8) continue
                    if (x < l) l = x
                    if (x > r) r = x
                    if (y < t) t = y
                    if (y > b) b = y
                  }
                }
              }
            }
            // Everything is kept relative to the body's own square, which is
            // the one thing every sheet agrees on.
            seen.set(
              layer.data,
              l > r ? null : { l: l - inset, r: r - inset, t: t - inset, b: b - inset },
            )
          }
        }

        let wanted = cell
        let padTop = 0
        let padBottom = 0
        for (const box of seen.values()) {
          if (!box) continue
          wanted = Math.max(wanted, (cell / 2 - box.l) * 2, (box.r + 1 - cell / 2) * 2)
          padTop = Math.max(padTop, -box.t)
          padBottom = Math.max(padBottom, box.b + 1 - cell)
        }
        // Even, so the body square sits on a whole pixel either side of centre.
        const cellW = Math.min(cellCap, Math.ceil(wanted / 2) * 2)
        padTop = Math.min(cellCap - cell, Math.ceil(padTop))
        padBottom = Math.min(cellCap - cell, Math.ceil(padBottom))
        const cellH = cell + padTop + padBottom

        // --- the atlas -----------------------------------------------------
        //
        // Directions across rather than down. It used to be one column of
        // every direction of every block, which was fine while a cell was
        // forty wide and is not now: at a hundred and sixty-two the same
        // arrangement is seventeen thousand pixels tall, and past sixteen
        // thousand is where hardware starts refusing to hold a texture. Laid
        // this way the same pixels come out roughly square.
        const canvas = document.createElement('canvas')
        canvas.width = directions * frames * cellW
        canvas.height = blocks.length * cellH
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = false

        // One scratch canvas, reused: tinting has to happen on the layer alone,
        // before it is composited, or it would take the layers under it with it.
        const scratch = document.createElement('canvas')
        const sc = scratch.getContext('2d')!

        for (const c of blocks) {
          for (const layer of c.layers) {
            const image = new Image()
            image.src = layer.data
            await image.decode()

            let source: CanvasImageSource = image
            if (layer.tint) {
              scratch.width = image.naturalWidth
              scratch.height = image.naturalHeight
              sc.globalCompositeOperation = 'source-over'
              sc.clearRect(0, 0, scratch.width, scratch.height)
              sc.drawImage(image, 0, 0)
              // `source-atop` paints only where the layer already is, so the
              // colour lands on the garment and not on the empty cell around
              // it. Partial alpha is what keeps the shading underneath.
              sc.globalCompositeOperation = 'source-atop'
              sc.fillStyle = layer.tint
              sc.globalAlpha = 0.42
              sc.fillRect(0, 0, scratch.width, scratch.height)
              sc.globalAlpha = 1
              source = scratch
            }

            const { srcCell, inset, count } = shapeOf(image)

            // Frame by frame rather than whole-sheet, because what is copied
            // is a window on the body's square rather than the sheet's cell,
            // and the two are only the same size by coincidence. Where the
            // window falls outside the sheet there is nothing to read — a
            // sixty-four cell has no pixels forty-nine to its left — so it is
            // clipped to what exists and lands correspondingly inset.
            for (let f = 0; f < frames; f++) {
              // Frame zero stays frame zero — it is the standing pose and the
              // renderer reserves it — and the rest spread over the remainder.
              const from = slot(f, count)
              const left = from * srcCell
              const wantX = left + inset + cell / 2 - cellW / 2
              const sx = Math.max(wantX, left)
              const sw = Math.min(wantX + cellW, left + srcCell) - sx
              if (sw <= 0) continue
              for (let d = 0; d < directions; d++) {
                const top = d * srcCell
                const wantY = top + inset - padTop
                const sy = Math.max(wantY, top)
                const sh = Math.min(wantY + cellH, top + srcCell) - sy
                if (sh <= 0) continue
                ctx.drawImage(
                  source,
                  sx,
                  sy,
                  sw,
                  sh,
                  (d * frames + f) * cellW + (sx - wantX),
                  c.block * cellH + (sy - wantY),
                  sw,
                  sh,
                )
              }
            }
          }
        }
        return {
          png: canvas.toDataURL('image/webp', quality),
          cellW,
          cellH,
          foot: padTop + cell,
          wanted: Math.ceil(wanted),
        }
      },
      {
        blocks,
        cell: CELL,
        cellCap: CELL_CAP,
        frames: FRAMES,
        directions: DIRECTIONS,
        quality: QUALITY,
      },
    )
  } finally {
    await browser.close()
  }

  mkdirSync(resolve(process.cwd(), 'public/art'), { recursive: true })
  const bytes = Buffer.from(packed.png.slice(packed.png.indexOf(',') + 1), 'base64')
  writeFileSync(IMAGE, bytes)

  const rows = all.map((spec, index) => `  '${spec.id}': ${index},`).join('\n')
  writeFileSync(
    TABLE,
    `/**
 * Which block of \`public/art/lpc.webp\` belongs to each spec.
 *
 * Generated by \`npm run lpc\` — edit the layer table in the packer, not this
 * file.
 *
 * One row of cells a block, a subject owning \`LPC_ANIMATIONS\` of them. Across
 * a row are the four directions in LPC's own order — up, left, down, right —
 * and inside each direction \`LPC_FRAMES\` frames. So a cell is at
 *
 *   x = (direction * LPC_FRAMES + frame) * LPC_CELL_W
 *   y = (LPC_ROW[id] * LPC_ANIMATIONS + block) * LPC_CELL_H
 *
 * The cell is wider and taller than the body it holds, because a longsword
 * mid-swing is. \`LPC_BODY\` is the square the body itself stands in, centred
 * across the cell, and \`LPC_FOOT\` is how far down the cell its ground line
 * sits — draw the whole cell scaled so that \`LPC_BODY\` comes out the size the
 * body should be, with \`LPC_FOOT\` on the actor's own position.
 *
 * The art is Liberated Pixel Cup, variously CC-BY-SA 3.0, GPL 3.0, OGA-BY and
 * CC0. Attribution is a condition of those, and the list is in
 * \`art/LPC-CREDITS.md\`.
 */

export const LPC_CELL_W = ${packed.cellW}
export const LPC_CELL_H = ${packed.cellH}
/** The square a body stands in, centred across the cell. */
export const LPC_BODY = ${CELL}
/** How far down the cell the ground under that body is. */
export const LPC_FOOT = ${packed.foot}
export const LPC_FRAMES = ${FRAMES}
export const LPC_DIRECTIONS = ${DIRECTIONS}

/** Blocks per subject, in this order. A block is four directions. */
export const LPC_WALK = 0
export const LPC_ACTION = 1
export const LPC_ANIMATIONS = ${ANIMATIONS.length}
export const LPC_SRC = 'art/lpc.webp'

/** Column order across a block, which is LPC's own direction order. */
export const LPC_UP = 0
export const LPC_LEFT = 1
export const LPC_DOWN = 2
export const LPC_RIGHT = 3

export const LPC_ROW: Record<string, number> = {
${rows}
}
`,
  )

  const lines = credits(used)
  mkdirSync(resolve(process.cwd(), 'art'), { recursive: true })
  writeFileSync(
    CREDITS,
    `# Sprite credits

The field sprites are built from [Liberated Pixel Cup](https://lpc.opengameart.org/)
parts by \`npm run lpc\`. The parts are variously licensed CC-BY-SA 3.0, GPL
3.0, OGA-BY 3.0 and CC0; attribution is a condition of the first three, so this
list is generated from the same definitions the layers are taken from and
cannot fall behind a change to them.

${lines.join('\n')}
`,
  )

  const kb = (bytes.length / 1024).toFixed(1)
  const width = DIRECTIONS * FRAMES * packed.cellW
  const height = blocks.length * packed.cellH
  console.log(`lpc: ${all.length} specs, ${width}x${height}, ${kb} kB webp`)
  console.log(
    `  cell ${packed.cellW}x${packed.cellH}, foot at ${packed.foot}` +
      (packed.wanted > packed.cellW ? `  (clipped: wanted ${packed.wanted})` : ''),
  )
  console.log(`  ${used.size} distinct layers, ${lines.length} credit lines`)
  if (missing.length > 0) process.exit(1)
}

main()
