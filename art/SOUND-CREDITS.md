# Sound credits

Every sound here is from the Superpowers asset packs, which are **CC0** — the
licence asks for nothing and the credit is here anyway, because a pack that
asks for nothing still had somebody make it.

Made by Pixel-boy for Superpowers.
https://github.com/sparklinlabs/superpowers-asset-packs

Written by `pipeline/bake_sounds.py`; `npm run soundcheck` holds the game to it.

| what | from | and on screen | ms | arrives | levelled by | loudest 0.1 s |
|---|---|---|---|---|---|---|
| `hit` | `prehistoric-platformer/sound/hit-1.wav` | the damage number over whatever you hit | 261 | 6 ms | -1.7 dB | -15.2 dBFS |
| `miss` | `medieval-fantasy/sounds/woosh-1.wav` | the word for the outcome over it, and a line in the log | 210 | 5 ms | +2.9 dB | -15.2 dBFS |
| `crit` | `top-down-shooter/sounds/sword-2.wav` | the number, and “치명타” in the log | 338 | 22 ms | -2.3 dB | -15.2 dBFS |
| `hurt` | `prehistoric-platformer/sound/hit-2.wav` | the number over you and your health bar | 322 | 0 ms | -5.0 dB | -15.2 dBFS |
| `die` | `top-down-shooter/sounds/death.wav` | the log line, and waking up at a graveyard | 359 | 0 ms | -1.8 dB | -15.2 dBFS |
| `cast` | `medieval-fantasy/sounds/woosh-2.wav` | the square on the bar going dark | 339 | 50 ms | -1.3 dB | -15.2 dBFS |
| `level` | `space-shooter/sounds/power-up-1.wav` | “N레벨이 되었다” in the log and the bar emptying | 628 | 0 ms | -2.2 dB | -15.2 dBFS |
| `loot` | `space-shooter/sounds/gold-1.wav` | what was taken, in the log | 672 | 0 ms | +5.6 dB | -15.2 dBFS |

The third column is not decoration: **turning the sound off may not lose
information**, and `viewcheck` holds the game to it.

The last two are the levelling.  The pack shipped these eight spanning
**10.7 dB** and they leave here inside
**0.0 dB** of each other, because relative loudness is a statement about
which event matters and it should be made on purpose rather than inherited
from four different games' mastering.

## The character of it

The eight come from **4 packs**:

  * `medieval-fantasy` — miss, cast
  * `prehistoric-platformer` — hit, hurt
  * `space-shooter` — level, loot
  * `top-down-shooter` — crit, die

Which is the finding, and it is a count rather than a taste: this game is a
medieval one and **two of the eight come from a space shooter**, while the same
collection holds a `medieval-fantasy` pack and a `rpg-battle-system` pack with
**60 sounds** between them that were never opened.  That is the half of "does
the pack fit" a script can answer; the other half needed ears, and `--listen`
writes the page they used.  The verdict and the argument are on the wiki page 소리.

## Where a sound could go, and does not

| when | says | or why not |
|---|---|---|
| a blow of yours lands | `hit` |  |
| a blow of yours is a critical | `crit` |  |
| a blow of yours misses, or is dodged, parried or blocked | `miss` |  |
| something lands a blow on you | `hurt` |  |
| something dies, you included | `die` |  |
| an ability goes off | `cast` |  |
| you gain a level | `level` |  |
| you take something — a corpse, a chest, a node, a reward | `loot` |  |
| you walk | — | there is exactly one footstep in the whole collection and it is `western-fps-2d/sounds/sand-step.ogg`.  A footstep is not one sound: it is a cadence, and a different sample for grass, stone, wood and water, which this game already knows because `__floor` answers it.  One sand step under a forest is worse than silence |
| a conversation opens | — | the six `ninja-adventure/sounds/menu-*.ogg` are the candidates and they are a ninja game’s menu.  Held with the button below, because a UI voice is one decision and not two |
| a button or a panel is pressed | — | the same six, and the same decision.  This one also has a second objection: the phone presses a button on every attack, so a click here is a click under every swing |
| you are attacked from behind, or something turns on you | — | the aggro sound is the one thing on this list the log does *not* already say, so it is the strongest candidate left — and the pack has nothing for it that is not a monster grunt belonging to one creature |
| an errand is taken or finished | — | `medieval-fantasy/sounds/victory-*.wav` are named for it.  Left until the character question below is settled, because three of the eight already shipped are from games this is not |
| a thing is made, or a lesson bought | — | the same three victories |
| the wind, the water, a room tone | — | `medieval-fantasy/sounds/forest-ambience.wav` exists and a loop is not a one-shot: it wants the fade, the pause and the zone that the music decision below declines for the same reasons |

**8 of 15** places in this game have a voice and **7** do not.  Every one of the
silent ones carries the reason, and `soundcheck` counts them both, so a place
that goes quiet without an argument fails a gate rather than going unnoticed.
