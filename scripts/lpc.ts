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

import { CLASSES, CLASS_ORDER, handsOf } from '../src/sim/classes'
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
 * What a body of this spec might be carrying.
 *
 * A list rather than one weapon, and per spec rather than per class. Every
 * body in a twenty-five man used to hold the identical object, which is a
 * thing you notice in a raid and cannot unnotice: eight warriors, one sword,
 * traced eight times. Which of a list a given body draws is decided by the
 * renderer off its own id, so it is stable for a fight and different between
 * neighbours.
 *
 * The lists are cut by what the role has to keep saying, not by what the set
 * has. A weapon is a handful of pixels and almost all of what it says is the
 * silhouette's outline, so the divisions that survive being small are the ones
 * worth keeping: a tank has a shield in the other hand, so what is in this one
 * is a one-hander; a rogue is the small quick one, so it is a blade rather
 * than an axe. Inside those, variety is free.
 *
 * A spec that has to be drawn casting has no list at all, and that is the
 * set's decision rather than this table's: `spellcast` is drawn for exactly
 * one weapon in the whole of LPC.
 */

/** One-handers, for a hand that has a shield in the other. */
const ONE_HANDED = [
  'weapon/sword/arming',
  'weapon/sword/saber',
  'weapon/sword/rapier',
  'weapon/blunt/mace',
  'weapon/blunt/flail',
]

/**
 * The ones that take both hands, which is to say the ones drawn big.
 *
 * Nothing in the set is drawn held in two hands — a body has one slash and it
 * swings whatever it is given the same way — so "two-handed" here is the
 * silhouette and the swing timer agreeing about the same weapon rather than a
 * grip anybody can see. A poleaxe on a body with no shield is read as a
 * two-hander because there is nothing else it could be.
 */
const TWO_HANDED = [
  'weapon/sword/longsword',
  'weapon/blunt/waraxe',
  'weapon/polearm/halberd',
  'weapon/polearm/scythe',
]

/** Small and quick, which is the whole of what a rogue looks like. */
const BLADES = ['weapon/sword/dagger', 'weapon/sword/rapier', 'weapon/sword/saber']

// Three swords are missing from these lists and it is not taste. The scimitar,
// the katana and the alternate longsword are drawn on thirteen frames, and no
// body in the set has a thirteen-frame walk or slash to pair them with — nine
// and six is what a body does. Taken anyway they play some other moment of
// their own swing against every frame of the body's, which reads as a sword
// that vanishes halfway through being swung. `beat` below refuses them rather
// than letting them back in quietly.
//
// The glowsword is missing for taste. It is the one weapon in the set that
// brings a colour of its own, and colour on this floor is how a body is told
// apart from the one beside it.

/** The one staff that is drawn casting. */
const STAFF = ['weapon/magic/simple']

const BOWS = [
  'weapon/ranged/bow/normal',
  'weapon/ranged/bow/recurve',
  'weapon/ranged/bow/great',
]

const ARMS: Record<string, string[]> = {
  'warrior-protection': ONE_HANDED,
  'warrior-arms': TWO_HANDED,
  'paladin-protection': ONE_HANDED,
  'paladin-retribution': TWO_HANDED,
  // A healer in plate, with a sword and a shield like the rest of its class.
  //
  // The sword is not drawn while it casts, and cannot be: `spellcast` exists
  // for one weapon in the whole set and it is a staff. That reads better here
  // than it sounds, and better than the staff it replaced — a body holding a
  // shield and raising its free hand is what casting with a shield looks like,
  // and the shield never goes anywhere. What it must not be is a hand holding
  // nothing at all, which is what this was before there was a shield in it.
  'paladin-holy': ONE_HANDED,
  'priest-discipline': STAFF,
  'priest-shadow': STAFF,
  'druid-restoration': STAFF,
  'druid-balance': STAFF,
  'shaman-restoration': STAFF,
  'shaman-elemental': STAFF,
  'mage-frost': STAFF,
  'warlock-destruction': STAFF,
  'hunter-marksmanship': BOWS,
  'rogue-assassination': BLADES,
  // The two forms carry nothing. A bear has no hands.
}

/** Which of the three a thing in a hand is drawn doing. */
function kindOf(dir: string): string {
  if (dir.startsWith('weapon/ranged/')) return 'shoot'
  if (dir.startsWith('weapon/magic/')) return 'spellcast'
  return 'slash'
}

/**
 * What pressing a button looks like.
 *
 * Two questions, and the mistake each time was answering with one of them.
 * `melee` alone was the first: it asks whether a spec has to close the
 * distance, and there are two ways to answer a fight from across the room, so
 * a hunter raised a hand and cast with a bow in it. The weapon alone was the
 * second, and it is wrong in the other direction — a paladin healer carrying a
 * sword then heals *by swinging the sword*, which is a healer that looks like
 * it is attacking whoever it is saving.
 *
 * So both, in that order. Whether the body closes the distance decides between
 * swinging and doing something at range; only then does what is in the hands
 * decide which of the two things at range it is. A holy paladin comes out of
 * that casting, with a shield on one arm and the other hand raised, which is
 * what casting with a shield looks like.
 */
function actionFor(id: string, melee: boolean): string {
  if (melee) return 'slash'
  const arms = ARMS[id]
  return arms && arms.length > 0 && kindOf(arms[0]!) === 'shoot' ? 'shoot' : 'spellcast'
}

/**
 * That what a spec is drawn holding is what the simulation thinks it holds.
 *
 * Two tables, one fact. `classes.ts` decides how fast a spec swings and it
 * decides that by how many hands the weapon takes; this file decides which
 * weapons it may be drawn with. Nothing connects them but agreement, and
 * agreement that nothing checks is agreement until somebody edits one of them.
 *
 * So it is checked, and the check is the interesting half of the rule: a body
 * that swings a poleaxe every four and a half seconds must not be drawn with a
 * shield on its other arm, because a shield is the picture of the hand that
 * poleaxe is using.
 */
function disagreements(): string[] {
  const wrong: string[] = []
  for (const classId of CLASS_ORDER) {
    for (const spec of CLASSES[classId].specs) {
      const id = `${classId}-${spec.id}`
      const arms = ARMS[id]
      if (!arms) continue
      // Nought hands is a spec that never swings at all — a holy paladin
      // carries a sword and heals with it sheathed — and what it carries is
      // held rather than used, so it answers to the one-handed rule: it has a
      // hand free, which is why it can put a shield in it.
      const hands = handsOf(spec) === 2 ? 2 : 1
      for (const dir of arms) {
        if (dir.startsWith('weapon/magic/') || dir.startsWith('weapon/ranged/')) continue
        const takes = TWO_HANDED.includes(dir) ? 2 : 1
        if (takes !== hands) {
          wrong.push(`${id} is a ${hands}-handed body drawn holding ${dir}`)
        }
      }
      if (hands === 2 && GUARD.includes(id)) {
        wrong.push(`${id} swings with two hands and is given a shield`)
      }
    }
  }
  return wrong
}

/** Which action each spec plays, so what it holds can be drawn playing it. */
function actions(): Map<string, string> {
  const out = new Map<string, string>()
  for (const classId of CLASS_ORDER) {
    for (const spec of CLASSES[classId].specs) {
      out.set(`${classId}-${spec.id}`, actionFor(`${classId}-${spec.id}`, spec.melee))
    }
  }
  return out
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

/**
 * What is on the other arm.
 *
 * The six the set draws for every animation a body here plays, and six that
 * can be told apart at thirty pixels: a heater, a crusader's, a tower, a
 * round Greek one, a cross and a scalloped one. The kite and the round are
 * left out for the reason three of the swords are — the set draws them
 * walking and swinging and not casting, and one of the bodies carrying a
 * shield here is a healer.
 *
 * The trimmed variants of the scutum and the two-engrailed are left out for
 * the opposite reason: they are the same outline with a line of colour on it,
 * and an outline is all that survives being this small.
 *
 * They carry no class colour, unlike the armour under them. That was true when
 * there was one shield and every tank had it, and it is the wrong way round
 * now: a shield with a device of its own is a shield, and a shield painted the
 * colour of the person holding it is a coloured shape they happen to be
 * carrying. The plate still says which class, and the ring under the feet
 * still says it louder than either.
 */
/**
 * Who has a hand free for one.
 *
 * The two that hold the boss, and the healer that stands next to them in the
 * same plate. Nothing else: a shield is an arm given up, and every other spec
 * here is using both.
 *
 * The bear is not in the list and could not be. A form replaces the body
 * outright, and it has no arms to give up.
 */
const GUARD = ['warrior-protection', 'paladin-protection', 'paladin-holy']

const SHIELDS = [
  'shield/heater',
  'shield/crusader',
  'shield/scutum',
  'shield/spartan',
  'shield/plus',
  'shield/two_engrailed',
]

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

function layersFor(classId: ClassId, spec: string): Layer[] {
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
        layers: layersFor(classId, spec.id),
        action: actionFor(`${classId}-${spec.id}`, spec.melee),
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
  // And everything carried, on rows of its own.
  //
  // Baked into a body, a sword costs a whole extra body every time it varies:
  // eight swords for a warrior is eight warriors in the atlas, and at that
  // rate the sheet outgrows what a phone will hold. On its own row it costs
  // one row, whoever picks it up, and a seventh shield costs one more.
  //
  // Two rows apiece rather than one, because a thing held is drawn on both
  // sides of the body holding it and the body goes between them. That is the
  // same fact the cape is split for.
  //
  // And a row for each action it is held through, because a thing held does
  // whatever the arm it is on is doing. A sword carried by a warrior has to be
  // drawn mid-swing; the same sword carried by a paladin healer has to be
  // drawn through a cast, which the set does not draw — so that row comes out
  // empty, and the paladin's sword hand is empty for the second it is casting,
  // with the shield still on its other arm. Better that than a sword swinging
  // while somebody is being healed.
  const held = new Map<string, string[]>()
  for (const [id, action] of actions()) {
    for (const dir of [...(ARMS[id] ?? []), ...(GUARD.includes(id) ? SHIELDS : [])]) {
      held.set(dir, [...new Set([...(held.get(dir) ?? []), action])])
    }
  }
  for (const [dir, kinds] of [...held].sort(([a], [b]) => (a < b ? -1 : 1))) {
    for (const action of [...kinds].sort()) {
      out.push({ id: `${dir}:${action}:behind`, layers: [{ z: 0, dir, half: 'behind' }], action })
      out.push({ id: `${dir}:${action}:front`, layers: [{ z: 0, dir }], action })
    }
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
  const offbeat: string[] = []

  // A block per subject per animation, four directions inside each. A layer
  // that has no sheet for an animation is dropped rather than fatal — a staff
  // with no slash frames is a staff that is not drawn mid-swing, which is
  // better than no character.
  const blocks = all.flatMap((spec, index) =>
    ANIMATIONS.map((anim, order) => {
      const sheet = anim === 'walk' ? 'walk' : spec.action
      // The body sets the beat. It is the one layer that is never optional and
      // never has two halves, so it is resolved first and everything else is
      // held to the number of frames it came back with. A weapon on its own
      // row has no body of its own and is held to the ordinary one, which is
      // what it will be drawn over.
      const bodyLayer = spec.layers.find((layer) => layer.dir.startsWith('body/'))
      const bodySheet = findAnim(bodyLayer?.dir ?? 'body/bodies/male', sheet)
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
          // And nothing that cannot keep time with the body it is worn on.
          //
          // One frame of slack, because a body walks in nine and a good many
          // things it carries walk in eight, and half a frame at the end of a
          // stride is nothing. Past that it is not the same animation: three
          // of the swords are drawn on thirteen frames against a six-frame
          // swing, and played against it a sword disappears halfway through
          // its own arc. Loud rather than dropped, because the layer table is
          // where it has to be fixed.
          const kept = geometry(found).frames
          if (beat !== undefined && Math.abs(kept - beat) > 1) {
            offbeat.push(
              `${spec.id}: ${found} is ${kept} frames against the body's ${beat} for ${sheet}`,
            )
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

  for (const line of disagreements()) console.error(`  ! hands        ${line}`)
  for (const line of missing) console.error(`  ! missing layer  ${line}`)
  for (const line of new Set(offbeat)) console.error(`  ! off the beat   ${line}`)

  const browser = await chromium.launch()
  let packed: {
    png: string
    width: number
    height: number
    cells: [number, number, number, number, number][]
  }
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

        // --- how much room each block actually needs -----------------------
        //
        // Off the alpha of the sheets that were resolved, and only over the
        // frames actually taken: a sheet has nine or thirteen and the atlas
        // keeps five, so measuring the ones dropped would size a cell for art
        // that never lands in it.
        //
        // Cached by the sheet itself, because the same trousers are worn by
        // nine specs and the read below is a pixel at a time. The bounds are
        // relative to the body's own square, which is the one thing every
        // sheet agrees on, so one reading serves whoever wears it.
        const probe = document.createElement('canvas')
        const pr = probe.getContext('2d', { willReadFrequently: true })!
        type Box = { l: number; r: number; t: number; b: number }
        const seen = new Map<string, Box | null>()

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
            seen.set(
              layer.data,
              l > r ? null : { l: l - inset, r: r - inset, t: t - inset, b: b - inset },
            )
          }
        }

        // --- a cell a block at a time --------------------------------------
        //
        // One size for every cell is the obvious way and it is the expensive
        // one. The widest thing in this atlas is a longsword at the far end of
        // a swing, which wants a hundred and sixty-two; the middle of the
        // distribution wants forty-eight. Sized to the widest, two thirds of
        // every other cell is margin — and margin costs nothing in the file,
        // where it compresses to almost nothing, and full price in memory,
        // where the browser holds four bytes a pixel whether or not anything
        // was drawn there. That is the number that matters on a phone: this
        // atlas at one size was a hundred and twenty-five megabytes decoded,
        // against ten before there were weapons in it.
        //
        // So a block is measured on its own. A raid of staves is drawn on
        // narrow cells and the two warriors get the wide ones, and the atlas
        // costs the sum rather than the maximum.
        const sized = blocks.map((c) => {
          let l = Infinity
          let r = -Infinity
          let t = Infinity
          let b = -Infinity
          for (const layer of c.layers) {
            const box = seen.get(layer.data)
            if (!box) continue
            l = Math.min(l, box.l)
            r = Math.max(r, box.r)
            t = Math.min(t, box.t)
            b = Math.max(b, box.b)
          }
          // A block with nothing in it still needs somewhere to be.
          if (l > r) return { ...c, w: 2, h: cell, foot: cell }
          const wide = Math.max((cell / 2 - l) * 2, (r + 1 - cell / 2) * 2)
          const padTop = Math.min(cellCap - cell, Math.max(0, Math.ceil(-t)))
          const padBottom = Math.min(cellCap - cell, Math.max(0, Math.ceil(b + 1 - cell)))
          return {
            ...c,
            // Even, so the body square sits on a whole pixel either side of
            // centre.
            w: Math.min(cellCap, Math.max(2, Math.ceil(wide / 2) * 2)),
            h: cell + padTop + padBottom,
            foot: padTop + cell,
          }
        })

        // --- shelves -------------------------------------------------------
        //
        // Blocks laid left to right and wrapped, tallest first so a shelf is
        // not held open by one late arrival. The sheet is as wide as its widest
        // block has to be, which is one longsword, and everything else fills in
        // around it.
        const width = Math.max(...sized.map((c) => c.w * frames * directions))
        const order = [...sized].sort((a, b) => b.h - a.h)
        const placed = new Map<number, { x: number; y: number; w: number; h: number; foot: number }>()
        let penX = 0
        let penY = 0
        let shelf = 0
        for (const c of order) {
          const run = c.w * frames * directions
          if (penX + run > width) {
            penX = 0
            penY += shelf
            shelf = 0
          }
          placed.set(c.block, { x: penX, y: penY, w: c.w, h: c.h, foot: c.foot })
          penX += run
          shelf = Math.max(shelf, c.h)
        }
        const height = penY + shelf

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = false

        // One scratch canvas, reused: tinting has to happen on the layer alone,
        // before it is composited, or it would take the layers under it with it.
        const scratch = document.createElement('canvas')
        const sc = scratch.getContext('2d')!

        for (const c of blocks) {
          const at = placed.get(c.block)!
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
            const padTop = at.foot - cell

            // Frame by frame rather than whole-sheet, because what is copied is
            // a window on the body's square rather than the sheet's own cell,
            // and the two are the same size only by coincidence. Where the
            // window falls outside the sheet there is nothing to read — a
            // sixty-four cell has no pixels forty-nine to its left — so it is
            // clipped to what exists and lands correspondingly inset.
            for (let f = 0; f < frames; f++) {
              // Frame zero stays frame zero — it is the standing pose and the
              // renderer reserves it — and the rest spread over the remainder.
              const from = slot(f, count)
              const left = from * srcCell
              const wantX = left + inset + cell / 2 - at.w / 2
              const sx = Math.max(wantX, left)
              const sw = Math.min(wantX + at.w, left + srcCell) - sx
              if (sw <= 0) continue
              for (let d = 0; d < directions; d++) {
                const top = d * srcCell
                const wantY = top + inset - padTop
                const sy = Math.max(wantY, top)
                const sh = Math.min(wantY + at.h, top + srcCell) - sy
                if (sh <= 0) continue
                ctx.drawImage(
                  source,
                  sx,
                  sy,
                  sw,
                  sh,
                  at.x + (d * frames + f) * at.w + (sx - wantX),
                  at.y + (sy - wantY),
                  sw,
                  sh,
                )
              }
            }
          }
        }
        return {
          png: canvas.toDataURL('image/webp', quality),
          width,
          height,
          cells: blocks.map((c) => {
            const at = placed.get(c.block)!
            return [at.x, at.y, at.w, at.h, at.foot] as [number, number, number, number, number]
          }),
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
  const cells = packed.cells.map((c) => `  [${c.join(', ')}],`).join('\n')
  const rowOf = new Map(all.map((spec, index) => [spec.id, index]))
  const played = actions()
  const carried = (id: string, list: string[]): string => {
    const pairs = list
      .map((dir) => {
        const key = `${dir}:${played.get(id)}`
        return `[${rowOf.get(`${key}:behind`)}, ${rowOf.get(`${key}:front`)}]`
      })
      .join(', ')
    const names = list.map((d) => d.replace(/^(weapon|shield)\//, '')).join(', ')
    return `  // ${names}\n  '${id}': [${pairs}],`
  }
  const guard = GUARD.map((id) => carried(id, SHIELDS)).join('\n')
  const arms = Object.entries(ARMS)
    .map(([id, list]) => carried(id, list))
    .join('\n')
  writeFileSync(
    TABLE,
    `/**
 * Which block of \`public/art/lpc.webp\` belongs to each spec.
 *
 * Generated by \`npm run lpc\` — edit the layer table in the packer, not this
 * file.
 *
 * One run of cells a block, a subject owning \`LPC_ANIMATIONS\` of them. Along a
 * run are the four directions in LPC's own order — up, left, down, right — and
 * inside each direction \`LPC_FRAMES\` frames.
 *
 * Where a block sits and how big its cells are is \`LPC_CELLS\`, indexed by
 * \`LPC_ROW[id] * LPC_ANIMATIONS + block\` and holding \`[x, y, w, h, foot]\`.
 * A cell is wider and taller than the body it holds, because a longsword
 * mid-swing is, and blocks are sized one at a time because most of them are
 * not holding a longsword. So a cell is at
 *
 *   x + (direction * LPC_FRAMES + frame) * w,  y
 *
 * \`LPC_BODY\` is the square the body itself stands in, centred across the cell
 * whatever its width, and \`foot\` is how far down the cell its ground line sits
 * — draw the whole cell scaled so that \`LPC_BODY\` comes out the size the body
 * should be, with \`foot\` on the actor's own position.
 *
 * The art is Liberated Pixel Cup, variously CC-BY-SA 3.0, GPL 3.0, OGA-BY and
 * CC0. Attribution is a condition of those, and the list is in
 * \`art/LPC-CREDITS.md\`.
 */

/** The square a body stands in, centred across whatever cell holds it. */
export const LPC_BODY = ${CELL}
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

/**
 * Which weapons a spec might be carrying, as the two rows each one occupies —
 * the half that hangs behind the body and the half in front of it.
 *
 * A list rather than one, so a raid of eight warriors is eight swords. Which
 * of them a given body draws is the renderer's to decide and it decides off
 * the body's own id, which is stable for a fight and differs between
 * neighbours. A spec with no entry carries nothing: a bear has no hands.
 */
export const LPC_ARMS: Record<string, [number, number][]> = {
${arms}
}

/**
 * And what is on the other arm, the same way.
 *
 * A separate table because a shield is not a weapon: it is worn by whoever has
 * an arm spare rather than by whoever fights a particular way, and the two
 * lists have nothing to say to each other. The shields carry no class colour —
 * see the packer — so one row of them serves every class that picks it up.
 */
export const LPC_GUARD: Record<string, [number, number][]> = {
${guard}
}

/** Every block's place and size in the sheet, as [x, y, w, h, foot]. */
export const LPC_CELLS: [number, number, number, number, number][] = [
${cells}
]
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
  const { width, height } = packed
  const widest = Math.max(...packed.cells.map((c) => c[2]))
  const filled = packed.cells.reduce((t, c) => t + c[2] * FRAMES * DIRECTIONS * c[3], 0)
  console.log(`lpc: ${all.length} specs, ${width}x${height}, ${kb} kB webp`)
  console.log(
    `  cells ${Math.min(...packed.cells.map((c) => c[2]))}-${widest} wide, ` +
      // What it costs held open rather than what it costs on disk, which is
      // the number that decides whether a phone can keep it.
      `${((width * height * 4) / 1e6).toFixed(0)} MB decoded, ` +
      `${((filled / (width * height)) * 100).toFixed(0)}% of the sheet used`,
  )
  console.log(`  ${used.size} distinct layers, ${lines.length} credit lines`)
  if (missing.length > 0 || offbeat.length > 0 || disagreements().length > 0) process.exit(1)
}

main()
