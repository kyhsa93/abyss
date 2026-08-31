# Abyss

**[Play it](https://kyhsa93.github.io/abyss/)**

**Single-player multiplayer.** The content that needs a group — a raid boss, a
battleground — played alone, at any hour, with nobody to wait for and no server
to run. You pick one of fifteen specs; everybody else on the field is AI. No
assets, no network: everything is shapes, timers and a deterministic simulation.

## What it is

That one sentence decides the rest, so it is worth being exact about what it
buys and what it forbids.

**The boss is a script, not an AI.** A boss that improvises cannot be learned,
and learning the fight is the whole genre. The only randomness is *who* gets
targeted. See [Design](#design).

**Everyone else has to read as a person.** This is not a flourish on top of the
AI — it is the product. A party of perfect bots is a solver with a health bar,
and playing alongside it is not multiplayer in any sense a player would accept.
So the AI carries reaction delay, fumbles, personalities and a clustering term
that pulls it away from the optimal tile.

**Nothing on your character gets stronger.** There is no gear, no level, no
currency. What a kill opens is more of the game, never a bigger number, and what
improves between attempts is you. Take this away and the fights would have to be
tuned around a power curve instead of around a player learning them.

**The simulation is deterministic.** Same seed, same fight, down to the tick.
That is what lets today's run be *the same run everybody else got*, which is how
a game with no server still offers the thing a server usually provides. It is
also what would later allow replays and verified scores.

What the sentence rules out: character progression, loot, gacha, matchmaking,
live services, and anything that needs an artist. Those are not omissions to be
filled in later. Each of them breaks one of the four above.

### Four shapes of the same promise

| Mode | The promise | Where it lives |
|---|---|---|
| `raid` | learn one fight by repeating it | the whole engine |
| `battleground` | a team fight, five against five | `sim/battleground.ts`, `sim/bgai.ts` |
| `daily` | the run everybody else got today | `sim/daily.ts`, `sim/affix.ts` |
| `descent` | one attempt, boss after boss | `sim/descent.ts` |

The raid is the engine and the other three are framings of it. A mode that
cannot be described as *content that would otherwise need other people* does
not belong on the front screen. `npm run conceptcheck` fails if the home screen
grows a mode this table has not heard of, because a menu is easier to add to
than a concept is to revisit.

## Run it

```bash
npm install
npm run dev
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
The workflow runs `npm run check` before building, so a broken encounter or a
type error blocks the deploy.

## Getting in

**One question per screen.** The front page asks what kind of thing you are
doing — RAID, BATTLEGROUND or SETTINGS — and each answer leads to the settings
that kind of thing actually has:

```
            ┌──────────────┐
            │     ABYSS    │
            └──────┬───────┘
       ┌───────────┼────────────┐
     RAID    BATTLEGROUND    SETTINGS
       │           │             │
  boss, size,  which map      sound, volume
  difficulty       │
       └─────┬─────┘
        pick your class
             │
           PULL
```

All of it used to be one screen. That meant a battleground was chosen on a
page that also offered a raid's difficulty and a list of bosses, with half the
controls hidden depending on what you had already picked — and the hiding was
its own bug, since the hidden rows still reserved their space.

The four summary lines above the class grid are counted rather than placed by
hand, and the grid starts under the last of them. Adding the boss name as a
fourth line without moving the grid is how it came to be drawn across the first
row of specs on every screen, twenty-five pixels into them on a desktop. Every
check passed at the time: the layout checks compare rectangles, and text is not
a rectangle. They read the drawn labels now.

On the raid screen: pick a boss, a size (5, 10 or 25) and a difficulty — from
what you have opened, which starts as the first boss at five on normal and
grows one setting per kill along [the chain](#the-chain). Then
the class screen asks what
you are playing. That last one is the only pick you make, and the screen shows
nothing else — you show up to a raid, you do not build one, and a board of
twenty-four strangers you did not choose and cannot change is a readout nobody
needs before a pull. Pick a class and hit PULL.

The rest is rolled around you. The roll keeps the role counts and leaves
everything else to chance: which classes fill them and where they stand.
Drawing freely would leave you without a tank about half the time, since only
one class in eight tanks, and a pull that cannot be won is a penalty rather
than a surprise. Your own role comes out of the counts the raid needed anyway,
so taking the tank spot in a five-man means the raid rolls one fewer tank
rather than fielding two. Your pick is remembered between visits, so a return
trip is one tap.

**Colour is the class, the glyph is the role.** Every class has its own colour
and wears it everywhere it appears: the token on the floor, the dot on the
minimap, the name on its party frame, its row on the meter and in the record,
its tile on the pick screen. The letter on the token still says T, H or D, so
both readings are available at once. Before this a raid was three shades of
blue and pink — you could see who was tanking and never see that half the
damage was mages.

`WASD` to move — `Q` and `E` strafe left and right alongside `A` and `D`, since
there is no facing here for them to turn — `1` `2` `3` `4` for abilities, `R`
to pull again, `M` to mute, `Esc` to go back to the class screen. The keys are
not printed on screen — the retry button names its own shortcut and the rest is
a raid game's standard layout. On touch there is a `party` button under the
fight readout. Leaving without changing anything keeps your pull count, since
the AI's learning is tied to how many times *these* five have pulled.

**`AUTO` presses your rotation for you.** A toggle above the ability cluster,
touch only, remembered between visits. On a phone both thumbs are already
spoken for — one steers, the other is on the buttons — and a fight that asks
you to dodge a ring *and* keep a three-button rotation going is a fight where
one of the two quietly stops happening. With it on, the other thumb is about
position, which is the half of the game the screen is actually showing.

It reads the same state the buttons draw from, so it can never press something
the bar would have shown as unusable: nothing through a cooldown, nothing on a
global, nothing mid-cast, nothing out of range, and one press per tick rather
than two. It also presses only what is *on* the bar — the party AI's healers
fill spare globals with damage, but that ability is not on a player's bar at
all, so a healer with nobody hurt presses nothing rather than reaching for a
button the screen never offered.

Against the harness's old stand-in, which mashes one button on a loop, at the
ninth pull: a mage deals 7.6k rather than 4.4k and wins 67% of pulls rather
than 42%; a rogue deals 2.9k rather than 0.4k. It is worse than playing well
and much better than a thumb that is busy steering.

Sound lives on the settings screen rather than in the corner of the fight:
on/off, and a volume in three steps, which plays a note as you pick it because
a setting you cannot hear is one you cannot set. The `M` key still works
mid-fight — the reason to reach for it is usually something that just
happened — and taking the button out of the corner also settled a collision
where it sat on the party frames on a 320-pixel phone.

A press that cannot go out says why. Cooldowns and empty mana are already
drawn on the button, so the one reason nothing on screen was giving is being
too far away: the slot turns red while the target is out of reach, and
pressing it anyway prints `Out of range` over your character rather than doing
nothing, which is what a broken button also does. It costs no cooldown, so the
answer is to walk in and press again.

**A pull opens with three seconds on the clock.** You arrive on the floor,
the raid is standing where it starts, and nothing moves until the count runs
out: no boss script, no timers, and no clock — `s.time` is still zero when the
fight begins, so an encounter is the same length whether or not a countdown
ran in front of it. Input is dropped for the same reason the boss is held; the
position everyone starts from is the one they agreed to.

The count is drawn over the world rather than instead of it, since the reason
to pause is to find your own token and read what is around it. A ring closes
inward on the player each second — the same rule the cast ring follows, where
anything leaving a token has already happened and anything about to happen has
to come in — and the number sits above it rather than on top of it. A flat
tone marks each second and one an octave up says go.

The party frames down the left are a grid of parties rather than one long
column: a party is a column read top to bottom, and the columns run left to
right three at a time before wrapping, so a ten-man is two columns side by
side and a twenty-five man is three and then two underneath.

The block is capped at half the screen height, and everything else follows
from that — the frames are as tall as half a screen divided by the rows they
have to hold, and as wide as that height allows at a fixed shape, so a frame
is never long and thin on one screen and square on another. Narrower than
three columns is only considered once three has been squeezed past legibility,
and then only if it actually comes out bigger: on a short screen fewer columns
means more rows, which is worse in the direction that is already binding. They
used to be a flat 108-150 by 46-70 whatever the screen and whatever the raid,
which was a five-man's frames worn by a twenty-five man and ran two screens
off the bottom.

**The ability buttons are a corner cluster, not a column.** Five of them in
two offset rows, half the size they were, tucked into the bottom right — the
whole group is 109 by 67 pixels and every one of them is inside a single
thumb's arc. They used to run up the right edge, three in a column with two
beside it, which is a shape a thumb travels rather than covers: the column
alone stood nine button-radii tall and its top reached most of the way up the
arena. The offset second row is what keeps it from reading as a line of
buttons you have to aim along.

Small buttons need a hit radius wider than they are, and once they were this
close together those radii started to overlap. A press goes to the *nearest*
button rather than the first one it lands inside — taking the first match
handed every shared pixel to the lowest-numbered slot, so slot one quietly ate
the inner edge of its neighbours. The touch check presses either side of the
midpoint between the two closest buttons, and first asserts that both presses
land where the radii actually overlap, since outside it the two rules give the
same answer and the check would prove nothing.

On a touch device the controls are there from the start: a translucent stick
on the left that relocates to wherever you press, the ability buttons gathered
into the bottom right corner, and the buttons on the end-of-fight overlay — two of them, or
three after a kill with a boss still to come (a battleground has no third
button: there is nothing after it to go on to). Only those answer a tap there:
the rest of that screen is the report, and reading it used to start the next
pull. The canvas
fills the viewport and the layout is recomputed per orientation, so portrait
and landscape both work.

The top right corner carries a minimap and the bottom right a live meter. The
minimap is the whole floor at map scale — fire, boss, thralls, everyone else —
with a box marking the part of it currently on screen, which is the only thing
that tells you how much of the arena the camera is not showing you. The meter
ranks the raid on damage plus healing, the same way the after-action report
does so a healer is not permanently last, and your own row is always on it
even when you are twenty-fifth of twenty-five. Where the meter sits depends on
what is already in the corner: the thumbs own it on touch, and the centred
action bar reaches it in portrait without them, so it sits above whichever is
on screen and takes the corner itself only on a wide keyboard layout.

The camera is locked to your own character rather than to the arena: your
token stays in the middle of the viewport and the floor scrolls under it. In
a twenty-five player pull, finding yourself was the slowest thing on screen.
The middle of the viewport is not the middle of the arena — the arena is laid
out to fit between the top band and the thumbs, which on a portrait phone put
its centre in the upper third of the screen — so the arena's size now sets the
zoom and nothing else.

## The fight behind the menus

Every screen that is not the game has a real fight going on behind it. Not a
video and not a loop of sprites: an actual pull, stepped at the same rate as a
real one, with the player's slot handed to the AI. The party is rolled fresh
each time, the boss or the map is drawn from a shuffled round so the same one
never follows itself, and the AI does what it does in a pull — which means it
is never quite the same scene twice and none of it had to be animated.

It costs almost nothing because the pieces were already there. The simulation
runs without a screen, which is what the harness has always leaned on; the
renderer draws a state rather than a session; and every lookup of the player
inside the simulation is already written to cope with there being none,
because a battleground's other five never had one. Handing the slot over is
five lines, and the rest is a fight.

Two things had to be got right for it to be usable rather than clever.

**It has to stay behind the menu.** The scene is drawn at just over half
opacity and then washed most of the way back to the background colour, so what
survives is movement and colour at the edge of attention. The check asserts
the wash covers the screen and goes on last — anything drawn over it would be
a fight instead of a menu. Hits do not shove the view either: a background
that jolts every time somebody crits drags the eye off the thing being read.

It also sits twice as close as the game does. At the playing scale the whole
arena fits on screen, which is right when you are the one dodging and wrong
dimmed to a third behind text, where a party at that size is a scatter of
moving dots. Twice in gives up the edges of the arena — there is nothing there
worth keeping behind a menu — and gets back figures that are recognisably
swinging at something. Two is also about as far as it goes: measured over
several fights, 2× keeps 92% of the living party in frame and never empties
the screen, while 2.5× and 3× both have moments with nobody on it at all. The
check measures that rather than trusting it, and the zoom is applied inside a
`save`, since a transform left open would draw the menu itself at double size.

**And it must never hitch.** Each scene skips its first twenty-two seconds,
because the opening of a pull is five people walking in and that is the part a
background would otherwise show most of. Running that skip on the frame the
scene changes costs eight milliseconds on this desktop and several times that
on a phone — a dropped frame or three, in a menu somebody is reading, every
forty seconds. So the next fight is prepared a second at a time while the
current one is still on screen: five minutes of menu now costs 0.012ms a frame
on average and 3.5ms at its worst, and a cut is free. The check fails if a cut
ever lands on a fight that has not been warmed up.

The first version also showed one frozen frame of a corpse every time a fight
ended, because it asked whether to cut *before* stepping rather than after —
found by a check written to assert exactly that, on the grounds that a
background stuck on a dead boss is worse than no background.

It can be turned off in settings, and it defaults to off where the device has
asked for reduced motion. A running battle behind every screen is precisely
what that setting is about.

## How close the camera sits

Four settings, from the arena fitted to the screen out to nearly twice that.
One is the framing every layout number in the game was worked out against —
but it is not where the camera starts. **The default is the closest step**,
because fitting the whole arena on screen is the wrong framing for what the
game actually asks you to do: read your own token, your own numbers and the
shape under your feet. The arena's edges are what the minimap is for.

It is a multiplier on the fitted arena radius, not a transform of its own, so
everything drawn in world units moves together and nothing else has to know
the camera exists — the same reason the arena's edge keeps up with the floor
inside it without being told to. The minimap deliberately does not move: what
the setting trades is warning for legibility, and the minimap is what is left
saying where the things off the edges are.

The one interaction worth catching was with the fight running behind the
menus, which has a camera of its own at twice the fitted distance. Multiplied
rather than divided by the setting, a player who likes the game close would
get the menus at three and a half times, which is past the point where both
teams walk out of frame and the background goes empty. The check measures what
the scene *applies* rather than what it is supposed to apply — asking a check
to compute the intended factor is asking it to agree with the bug — and it
catches the compounding version at 5.70 against 1.76.

Moving the default surfaced the same class of mistake in two older checks,
which had encoded "the background sits at twice the world scale" — true only
while the world scale had no camera in it. They ask the scene for its own
factor now.

## A name of your own

Set in settings, and it is the one place in the game that asks for text.

Everything else here is a canvas and a thumb, and a canvas cannot be typed
into: on a phone there is no keyboard without a focused form element, so an
on-canvas field would be a field only a desktop could use. So a real `input`
is laid over the row it belongs to and taken away the moment it is done — the
native keyboard, the native caret and the paste menu, none of which are worth
reimplementing badly. It is deliberately not left in the page: a stray focused
input under a canvas swallows the keys the fight is played with, and the tap
that closes it by blurring it must not also press whatever is under it.

**The simulation is never told.** A name changes nothing about a fight, the
harness must not depend on what is in storage, and a replay from a seed has to
be the same fight whoever is playing it — so the slot is still built as `You`
and the actor is renamed on the way out.

The part worth checking is what a typed name *becomes*, since anything at all
can be typed into a text field and all of it ends up drawn over a token and
written into a record that outlives the session. Empty and whitespace-only
fall back to the default rather than leaving a nameless body on the floor;
newlines and tabs become spaces rather than vanishing, so `a\nb` stays two
words; runs of whitespace collapse; and it is cut to twelve *characters*
rather than twelve code units, or a name of emoji comes out cut literally in
half, into an unpaired surrogate. That last check was wrong the first time —
it tested whether the string ended in a surrogate, which every well-formed
emoji does.

## Names over the tokens

Everyone on your side carries their name above their head, in nine pixels of
dim grey, over the top of the health bar rather than instead of it.

Instead of was what it used to be: the name was drawn only while somebody was
at full health, on the grounds that a hurt body is already carrying a bar
where the name would go. Which meant a name vanished at the exact moment its
owner became worth looking at. The bar keeps the place it had and the name
moves up over it.

Everyone, at every raid size and on every screen. There was briefly a rule
withholding them from a twenty-five man on a small screen, on the grounds that
twenty-five names is mush rather than information — but a name you cannot rely
on being there is worse than a crowded one, and picking a particular body out
of a crowd is exactly what the raid size makes hard. The boss is not named
over its token, since it has a frame across the top of the screen, and a
thrall is one of a crowd with nothing to say.

## Every press aimed at the boss, including the heals

Reported as a visual oddity — heal bolts flying at the boss — and it was not
visual. Playing a healer, **every heal you cast healed the boss.**

One line did it. Targeting for a press read

```ts
const target = ability.kind === 'taunt' ? BOSS_ID : playerTarget(s)
```

which is right for everything that hurts something and wrong for the one kind
that does not. The heal was aimed at the boss, so the bolt flew there, the
landing code healed whatever it arrived at, and the player was credited with
the healing on their own meter. Measured at 473 health handed to the Drowned
Warden per press of a discipline priest's filler, with the party getting
nothing.

The autocast had already worked this out and had the right rule — the wrong
one downstream simply overwrote its answer — and the action bar had the same
wrong rule, so a healer's buttons were lit against the distance to the boss,
which is not where any of them were going. There is now one function that
answers "what does this press aim at", used by the press, the bar and the
autocast: taunts to the boss, heals to whoever is furthest from full, anything
else to what is being hit.

Underneath it there were **three** copies of "who is most hurt" — one in the
autocast, one in the party AI, one in the action bar. They agreed, but only by
coincidence, and the one place that needed the answer most did not ask any of
them. There is one now.

The checks press every healing button of every healing spec and follow it the
whole way: what it aims at, where the bolt goes, that the boss gains nothing,
and that the player is credited with healing that actually landed on the
party.

## Reading your own numbers

Four things were wrong with the floating damage and healing numbers, and all
four were the same thing: they were drawn as if the arena behind them were
empty.

- **No outline.** Twelve pixels of pale red over a magenta puddle is not a
  number, it is texture. Every number is stroked in near-black before it is
  filled now, and that one change is most of the fix; everything below is a
  refinement of something already legible.
- **They faded from the frame they appeared on.** The alpha ran from one to
  zero across the whole life, so a number spent most of its existence half
  gone. It holds at full strength for the first half and then leaves.
- **They stacked.** Every hit landed on the same point, so a fast rotation
  turned four numbers into one smudge. They fan into four lanes as they rise,
  taken from the id the simulation already hands out in order, so consecutive
  hits take consecutive lanes.
- **A filler and a finisher were the same size** despite differing by a factor
  of ten, so the only way to tell a big hit from a small one was to stop and
  read it. Size now follows the hit.

Then all of it went up again by about a third — 18 to 27 pixels for a hit, 22
to 34 for a crit — along with the two things that had been left behind at the
bottom of the scale. A message about why a press did nothing (out of range,
out of mana, on cooldown) is a sentence rather than a number and was the
smallest thing on the screen at eleven pixels; and the chat, which is where
the tells live — a phase break, a call for a heal, the line before the ring —
was eleven pixels of dim grey in a corner, which is a thing nobody reads
during a pull. The lanes the numbers fan into widened to match, since bigger
numbers thirteen pixels apart stop being separated by being fanned.

Then all of it doubled. Eighteen to twenty-seven became thirty-six to
fifty-four, a crit runs to sixty-eight, and the message about why a press did
nothing is thirty-two. One constant does it, and it multiplies more than the
font: the lanes the numbers fan into, how far they rise, and how high above the
body they start. Doubling the glyphs alone would put twice-as-wide numbers into
lanes built for the old ones, which is the smudge the lanes exist to prevent —
the check that guards it caught exactly that when the lanes were put back by
hand, at twelve pixels of gap against forty-one-pixel glyphs.

What that check asserts is a ratio rather than a number: the gap between lanes
against the size of the glyphs, which has been about half a glyph since the
lanes existed. The fan has never pulled multi-digit numbers fully apart — two
four-character numbers are wider than any lane gap — and it does not need to.
It offsets them enough to read as separate, and the ratio is what says whether
it still does.

Sizes drift back down unless something holds them, so the checks assert a
floor on each rather than just a difference, and a taller chat has to still
fit five lines above where it starts on every screen — which the mutation test
confirms by pushing the line spacing until the top ones leave the screen.

And one thing was missing rather than wrong: what you dealt and what landed on
you were the same red. They are different colours now — your own damage in
near-white, what hits you in red, healing in green — which is the whole point
of the two being different kinds of event.

The checks paint a frame through a recorder that keeps the font, the fill and
the alpha for every string drawn, and assert each of the five properties. All
five were verified by putting the old behaviour back one at a time.

## Why it looks like this

Hardcore raiders barely look at boss models. They watch timer bars, debuff
icons and raid frames. The information a raid encounter actually runs on is
already abstract, so this prototype renders exactly that and nothing else.

### The bodies

Everything on the floor used to be a filled circle with a letter in it, which
is honest about position and silent about everything else. Two things were
being thrown away by that. Colour says the class, but ten colours is ten
colours — a mage and a shaman are two blues, and at a glance on a phone that
is one blue. And every actor has a bearing that the gaze mechanic asks about,
which nothing on screen showed.

So a token is a body now: legs, a torso in the class colour, shoulders, arms,
a head, and one thing in its hands per class. It is drawn from the same
primitives as the rest of the render path — arcs, lines, filled paths — so
there is no art in the repo, nothing to load, nothing to regenerate, and a new
class is a colour in one table and a shape in one switch.

Two decisions in `src/render/sprite.ts` are worth keeping:

**The body faces the screen, and only the ground turns.** A body drawn from
above and rotated with its bearing was tried first and reads as an insect: a
person seen from directly overhead is a blob with shoulders, and turning the
blob makes it worse. The body mirrors left or right with the way it is turned,
and the bearing itself is a mark on the rim of the disc it stands on.

**The disc is still the hitbox.** The footprint is drawn first, at the actor's
own radius, exactly as before — the body over it is a picture, and a picture
must never be what position is read off. Under nine pixels the picture is
dropped entirely and the token is a disc again, and under fifteen it keeps its
shape and loses whatever it was holding: a greatsword at twelve pixels is not
a greatsword, it is a smudge on the silhouette that was doing the work.

Bodies stand up out of their footprints, so the party is drawn in depth order
and health bars and names are placed off the body height rather than the
radius. The boss stays underneath the party: letting it into the depth order
put a very large body in front of whoever was standing north of it.

## Design

**The boss is a script, not an AI.** A boss that improvises cannot be learned,
and learning the script is the entire genre. `src/sim/boss.ts` is a fixed
timeline with hard phase transitions. The only randomness is *who* gets
targeted, which keeps pulls from being identical without making them
unlearnable.

**The party members are AI, and their job is to look human.** `src/sim/ai.ts`
scores candidate positions and actions in three layers — stay alive, do your
role, fill with damage. A perfect bot reads as a robot, so on top of that sits
a humanity layer:

- reaction delay before danger is acted on, rolled per danger rather than per tick
- fumble rolls that make a tank occasionally eat a slam it could have blocked
- personalities (`steady`, `greedy`, `timid`) that shift panic thresholds
- a clustering term that pulls each member toward the group instead of toward
  the mathematically optimal tile

They also get sharper every pull, because real groups learn a fight by
repeating it.

## Size and difficulty

A raid is built from parties of five: ten is two parties, twenty-five is five.
They stand together in the arena and the roster screen lists them one row per
party, because grouping has consequences — a puddle dropped on one party is a
puddle on five people.

Support is capped for the whole raid rather than per party: **one or two
tanks, one to three healers.** More tanks than that is wasted on a
single-target fight, and the healer ceiling is what stops a larger raid simply
out-healing the encounter. Both caps are enforced rather than advised: a
third tank or a fourth healer cannot be selected on the party screen at all —
the entry is drawn locked — and a roster saved before the caps existed falls
back to the default instead of loading.

**A five-man is exact rather than capped: one tank, one healer, three
damage.** There is no arrangement of five slots that plays, so picking a role
there is read as a trade — tap a tank into your own slot and the slot that was
tanking takes the one you gave up. Refusing it instead would freeze the
composition, since a fixed shape has no legal intermediate state to pass
through and the player could never move off the role they started on.

So a twenty-five man is mostly damage, and it works out because the extra
damage shortens the fight rather than adding survival — 25-player normal ends
up at the same four ninth pulls in five as a five-man does, having won almost
none of its first ones.

Mechanics scale with headcount, in three ways.

**The volume of one scales.** A fixed number of puddles across twenty-five
players means any one player is almost never targeted, so without it the
bigger raid would be the easier one — pools and marks both go up with the
roster, and thralls come in larger waves. That last one is proportional rather
than banded now, and floored at one rather than two: three thralls against ten
and five against twenty-five is not the same ask, and neither is two against
five.

**The shapes aimed at the arena grow.** Everything above is dropped *on
people*; a cone and a ring are aimed at the floor, and a cone of a fixed angle
catches roughly the same fraction of a raid whatever its size. That is not
"slightly easier", because everything else about a bigger raid is slack — see
[The Tidebreaker, and the size that was too safe](#the-tidebreaker-and-the-size-that-was-too-safe).

**And the *number* of them scales**, which is the ladder below.

Boss health is not linear with headcount either: larger groups lose
proportionally more time to mechanics, so a flat multiple per player would
again make 25 the soft option.

**Both axes buy a rung of the boss's ladder.** A boss owns more mechanics than
any one raid meets: which of them turn up tonight is decided by how many of
you came and which button you ticked at the door. A five-man on normal meets
two, and every step up the size or across to heroic buys one more, to five for
a heroic twenty-five. See [The bosses](#the-bosses) for the ladders themselves.

Heroic used to be boss health and nothing else — the difficulty button
literally said *more health, same mechanics* — and the honest description of
it was "the same fight for longer". Tuning it that way had revealed that fight
length *is* a difficulty here: time spent dodging is damage not dealt, which
lengthens the fight, which brings round more mechanics and drains more healer
mana. That is still true and heroic still carries a health multiplier. What it
cannot do is ask for something the normal fight never asked for, and a rung
can.

**A short kit is paid back as tempo.** Two mechanics on the boss's own cadence
is not an easier fight, it is a quieter one: measured, a five-man normal
Warden went from winning a fifth of its first pulls to winning all of them,
and the pulls were shorter and emptier rather than gentler. So the rungs a
raid did not buy come back as speed — a kit of two runs at about five-eighths
of the table's interval, and by the full five it is on the table's own
numbers. The pressure still rises with the rungs, because five mechanics at
full cadence ask for more per second than two at five-eighths *and* they ask
for five different things.

Every attempt to raise heroic's damage or mechanic frequency on top of that
took the win rate from 80% to 0% with nothing in between — survival turns out
to be a cliff, not a slope. It holds until healing throughput is exceeded,
then collapses. The rung is the lever that does not behave that way, because
what it costs is attention rather than health.

Measured against the Drowned Warden, a balanced roster at each size:

| | 1st pull | 9th pull | kit |
| --- | --- | --- | --- |
| 5-player normal | 29% | 79% | pools, the sweep |
| 5-player heroic | 14% | 57% | + rot |
| 10-player normal | 14% | 86% | pools, the sweep, rot |
| 10-player heroic | 14% | 50% | + the armour break |
| 25-player normal | 0% | 79% | pools, the sweep, rot, the armour break |
| 25-player heroic | 0% | 50% | + the gathering |

**Heroic never wins more than normal at the same size, and wins clearly less
by the ninth pull, in all nine boss-and-size cells.** That is the thing the
rung was added to make true — it used to hold on some of them and be a coin
flip on the rest, because more health is not more difficulty when the party
had health to spare. The harness prints the kit beside every row, so a
difficulty that stopped costing anything would show up as two rows asking for
the same list.

Two cells sit at the edges and are left there. A heroic twenty-five man Choir
is the hardest fight in the game and the harness has not won one: it is the
only place the marks, the stalker, the floor and the chorus arrive together.
And a heroic twenty-five man Tidebreaker is the other, for a related reason:
it is the only place a raid meets a cone, a ring, a sweep, thralls *and* a
stalker, on a boss whose shapes are already widened for the size.

## Today's run

One fight a day, the same one for everybody. The date picks the boss, the raid
size, the difficulty, the seed the fight runs on and the four people rolled
around you; the only thing left to you is which class you bring — that is the
choice the game is about, and taking it away to make the comparison tidier
would be trading the game for the scoreboard.

This is the first thing here that uses reproducibility as a *feature* rather
than as a testing property. The simulation has always replayed exactly from a
seed — that is what the harness leans on — and keyed off the date instead it
becomes the one thing a game with no server can still offer: a run somebody
else played too, on the same boss with the same rolls, where the only
difference is how it was played.

The date is not the seed. Consecutive days differ by one, and neighbouring
seeds make neighbouring fights, so the key is multiplied out first; the check
draws twenty-eight days and fails if they are not at least six distinct
setups. It is keyed in UTC so two people in different places get the same day.

**Every day carries a twist.** One affix, drawn from the same date as the rest
of it:

| | |
| --- | --- |
| Lingering | puddles stay twice as long |
| Swarming | twice as many thralls |
| Faltering | healing lands for a quarter less |
| Restless | shockwaves and breaths come round about twice as fast |
| Quickened | the boss swings faster |
| Festering | the rot bites half again as hard |
| Scattering | spread marks reach further |
| Hastened | the enrage arrives more than two minutes early |

The boss stays a script — that rule is the genre and nothing here touches it.
An affix changes a number the script already had, so everything learned last
week still applies and has to be applied a little differently.

They ride the daily and nothing else. A raid you are learning has to be the
same fight on the ninth pull as on the first, and the check fails if an
ordinary pull or a battleground ever carries one.

Levelling them took measuring: each costs between five and nine points of win
rate now, but the first cut had Quickened and Festering at thirteen while
**Restless made the fight easier** — the shockwave asks people to come in, and
asking more often was doing them a favour. Hastened did nothing at all through
two rounds of tuning, because an ordinary pull ends well inside the timer and
moving it by forty seconds moved no fights whatever.

Retries are allowed and counted. There is no server to cheat against, and a
run you cannot practise is one you only ever see once. The record keeps the
best answer to a day rather than the last: a kill always beats a loss, a
faster kill beats a slower one, and between two losses the one that left the
boss lower.

## A floor rolls its own fight

The three bosses on the ladder are sentences written by hand out of a fixed
vocabulary — the Warden no cone and no ring, the Choir nothing on the floor
until its fourth rung, the Tidebreaker no marks and no rot. The descent used to
run those same three in a loop, `(depth - 1) % 3`, so floor four was the first
boss again with more health and floor seven was it a third time.

Now a floor takes a boss for its shape, its health and its damage, and rolls
what it *asks for*: a budget that grows with the depth, spent on mechanics from
the same vocabulary. The boss's swing and slam survive, since that is what
makes one hit differently from another; everything else the plan decides, and
anything it does not buy is switched off — including the boss's own ladder,
which a floor replaces outright rather than climbing.

The purse moves on the same two axes the ladders do: a ten-man is worth one
and a half more, a twenty-five three, and heroic another one and a half.
Without that the descent would be the one place in the game where bringing
twenty-five people and ticking heroic bought nothing but a longer health
bar.

**The prices are measured, and they are not what they look like.** A
mechanic's cost here is not the damage it deals, it is what it takes out of
the party's output — this party heals by standing still and casting, so
anything that moves people is expensive and anything that only hurts them is
cheap. The gathering costs six and the stalker five, because they were measured
at thirty points of win rate and sixteen percent of the raid's damage; the
armour break, the sweep and the rot cost two apiece, because they move nobody
at all.

| | cost | from floor |
| --- | --- | --- |
| pools, the sweep, rot | 2 | 1 |
| marks, the cone | 3 | 1 |
| the armour break | 2 | 3 |
| the ring, thralls | 4 | 2 |
| the stalker | 5 | 2 |
| the gathering | 6 | 3 |

Two rules keep a roll from being a lottery. Every floor buys something that
asks the party to *be somewhere* before it buys anything else, because a roll
of nothing but a sweep, a rot and an armour break is a fight where nobody ever
has to move — not a cheap fight, a damage meter. And the budget has a ceiling,
because a floor that can afford every mechanic at once asks for everything and
therefore for nothing: there is no room left to answer any of it.

The floor says what it rolled during the three-second countdown, next to the
boss's name. A fight assembled by a die is only interesting if you can see what
it was assembled out of, and unlike a raid boss — learned by repeating it — a
floor is met once.

**What is checked is the budget, not any one floor.** Nothing here is authored,
so there is nothing to hand-tune: the checks sample seven hundred rolls across
twelve depths and assert that none overspends, none is empty, none is
motionless, the whole vocabulary is reachable, the expensive things are gated
by depth as well as by price, and the same seed is the same floor twice. The
harness samples floors for a win-rate curve, and then walks whole runs the way
the game does — half a health bar back between floors, one of the fallen up per
floor — because the difficulty of a descent is the product of its floors
rather than the hardest one. Runs currently end at a median and a mean of floor
four, with the harness's deliberately mediocre player.
The depth curve was pulled down when the ladders went in — the multiplier is
against the boss's own health and the bosses got heavier, so the same curve had
quietly become a third steeper and the median had fallen to under four, which
is a different game rather than a harder one.

## The armour break, and the second tank

Every mechanic in this game is answered by moving. Puddles say leave where you
stand, the cone says get behind, the ring says come in, spread says separate.
That is one verb, and a fight built entirely out of it asks the party exactly
one kind of question.

The armour break asks a different one: it stacks on whoever is holding the
boss, takes twelve hundred armour off them a stack, and lasts sixteen seconds.
Nothing about it is dodgeable. The answer is to decide who is standing there —
the other tank takes it at three stacks and the first one's falls off while
they hold — which is a decision about composition rather than about position,
and the only one in the game so far.

**A five-man never sees it.** A party of five fields one tank and one healer,
so it cannot answer the question, and asking anyway measured as a straight tax
on the size least able to pay it: five-man heroic fell from 12% to 5% over
sixty pulls a cell. So the mechanic is what the second tank is *for*, and the
fight does not have it without one — asserted in the checks, not left to the
table. The five-man rows in the harness are unchanged to the point.

It also had to be armour rather than a damage multiplier, which is what it was
first written as. The two are not the same mechanic under different names: a
multiplier compounds with everything else already scaling — heroic's damage,
the enrage — and it did, taking ten-man heroic from 17% to 3% while normal
barely moved. Run through the same curve plate and cloth already sit on, it
bites hardest on the target that had the most armour to lose, cannot take more
than there was, and lands near half again rather than near double.

One AI rule had to be measured the same way. The first version let any tank
spend its wall on a heavy stack, which meant the wall was on cooldown when the
slam landed — the swap already answers the stack, and the wall is the answer
to the slam. Tanks with a partner now trade instead.

## The circle, and where a mechanic can afford to live

Spread says separate. The circle says the opposite: everyone stands in one
place at one moment, what lands is divided by however many did, and then it is
dealt to *everybody* — so staying out is not an escape, it is a cost passed to
the people who went. It is the only thing here the party answers together.

Three things had to be measured rather than assumed.

**The damage had to be per head, not a flat pool.** A pool divided by the
soakers keeps its size as people die, so a party down to two takes half of it
each, which kills them, which makes it worse for whoever is left. Measured, a
late circle in a five-man was dealing 2,922 to people with 2,900 health. The
share is taken against the living headcount instead: everybody in is the same
number whatever the size of the raid, half in is double, and the multiplier
stops at four so a circle nobody reached is a disaster rather than an
extinction.

**Two mechanics that cancel are not a hard fight.** Puddles are dropped on
people, so a party gathered into a circle got the whole set inside it and was
then told to leave; a spread detonates on its carrier and catches everyone
within 110 units, which is every one of a party standing in a circle of 135.
Both are held while the circle is out — the spread for three seconds past it,
long enough to walk out of each other's radius, the floor for barely half a
second, because holding the whole floor for eight seconds of every twenty-four
turned out to be a bigger gift than the mechanic was a cost. That one was
worth 37 points of first-pull win rate on its own.

The rule needed its other half, which was missing for as long as nothing
happened to expose it. The floor held itself back while a circle was live, and
nothing held the circle back while the floor was still *in the air*: a pool
with a second left on its telegraph goes off and then lingers for five and a
half, which is most of the walk into a circle the party has just been told to
stand in. The check that guards this counted zero for months and then
forty-two the first time the timings moved underneath it — it had been passing
on luck. The circle now waits for a clear floor as well as a clear spread, and
only for the telegraph: waiting out every pool's residue would be waiting out
the fight.

**And its real price is not damage.** With the damage turned down to nothing
the Warden still lost thirty points of win rate: this party heals by standing
still and casting, so a mechanic that moves all five of them at once takes the
healer's output away in the same seconds it takes health off everybody. Moving
the circle from 250 units away to just outside the party helped; it did not
fix it. At a cost small enough for the ladder to absorb, the mechanic was not
worth having.

So it goes where its cost is the intention. On the descent that is from the
third floor down, tightening as it goes — every floor there is meant to be
worse than the last, so there is no fixed difficulty to protect. On the ladder
it is **the Warden's last rung and nothing else's**: reached only by a
twenty-five man on heroic, which is both the raid with the bodies to pay for
it and the one that ticked the box asking to. Every smaller raid, and every
other boss, meets the same fight without it. A mechanic that costs thirty
points of win rate is not a bad mechanic, it is a mechanic that needs
somewhere to be the last thing asked rather than one of the first.

It is also the one mechanic here that is *not* multiplied by the boss it is
attached to. Everything else on the floor runs through the encounter's own
multiplier, which is half again as heavy on the Tidebreaker as on the
Warden — and the gathering asks the same question on both, "is everybody
standing here", so the tax attached to it is the same on both.

## The thing that follows one of you

The only mechanic here aimed at a single person, and the only one with two
answers at the same time. Something walks out of the dark, picks a damage
dealer, and goes after them and nobody else — slower than they are, so it is
always kiteable, but heavy enough on contact that being caught is a real
mistake. The one it picked has to keep moving, which costs them every cast
they would have made standing still; everyone else has to decide whether to
break off and kill it or leave them to it.

Never a tank, and never a healer. A tank that runs takes the boss with it. A
healer that runs stops healing, and in this party that is the whole fight:
hunting the healer one pull in four raised deaths in *every* role, including
the tank, who is never picked at all.

It is on the descent, from the second floor down, and finding out why was the
most useful measurement of the round. A stalker with its damage turned down to
**one point of damage** and less health than an ordinary thrall still took the
Warden from 65% to 8%. Nothing it does is dangerous; what it costs is 16% of
the party's damage output, because three dealers break off to kill it and the
one it picked walks instead of casting. Sixteen percent is most of the margin
a tuned fight has.

That is the finding, and it is not a fact about stalkers. **This ladder is
balanced on a party that stands still and casts, so movement and
target-switching are the expensive currency here — not damage.** The armour
break was affordable on the ladder because it moves nobody. The circle and the
stalker both cost a third of a fight's margin, so both live on the descent,
where every floor being worse than the last is the design rather than a
regression. All three tuned encounters still sit on the exact numbers they
were tuned to: 18/55/65, 43/65/68, 8/13/15.

One AI weighting had to be measured too. The first version scored a chaser as
worse than fire, so the one being hunted would stand in a puddle to put eight
paces between itself and something walking. Its deaths were the mechanic's
real damage, not anything it landed.

## The Tidebreaker, and the size that was too safe

The ladders left one row of the table reading a hundred percent: a ten-man on
normal against the third boss, every pull won, and a twenty-five man alongside
it at ninety-three. Nothing about the boss moved it. Its health, its weapon,
its unavoidable damage and its floor multiplier were each tried and each moved
all three sizes together — a number that makes a ten-man sweat makes a
five-man unwinnable, and the five-man was already at fifty-five.

What the harness said, once it was asked the right question, was that the
ten-man was not surviving by dodging. It ate **sixty-three mechanic hits a
pull, lost one body out of ten, and finished with the healers on eleven
percent of their mana.** The five-man ate four. So the mechanics were landing;
the raid was simply healing through them, and it could do that because of two
things that have nothing to do with the boss.

**A ten-man is the safe size, by construction.** It fields the same one healer
per five bodies a five-man does, and *two tanks* — and the boss's weapon and
its slam are one target's worth of damage whoever is holding it. So it covers
the same raid damage with the same healing and half the tank load. A
twenty-five man does not get that: three healers to twenty-five bodies is
thinner than one to five.

**And the Tidebreaker is the only boss made entirely of shapes aimed at the
arena.** Everything else in the vocabulary is dropped *on people* and already
scales with the roster — pools per cast, marks, thrall waves — because a fixed
number of them across twenty-five means nobody is ever the target. A cone of a
fixed angle catches about the same fraction of a raid whatever its size, and a
ring sweeps everyone regardless. The one boss built out of those was the one
boss that got easier the more people turned up.

So the cone and the ring widen with the roster, by a table per shape and per
size. Four things it took to get right:

**The widest correction goes to the ten-man, not the twenty-five.** The table
is aimed at how safe a size is, not at how many people it has.

**The cone has a cliff and the ring does not.** Past about 0.85 radians the
cone stops being a cone: twenty-five bodies do not spread far enough to get
out of one, so it becomes a raid-wide hit for two thousand every eight
seconds. The twenty-five man went from winning every pull at 0.83 to winning
one in twenty-five at 0.86. A number sitting on that edge is a number the next
change to the AI would flip, so the twenty-five's correction is carried by its
ring instead — which is answered by running *in*, and a wider band only makes
the pocket smaller.

**Banded, not interpolated**, for the same reason `sizeHealth` is: the sizes
are three fixed rosters, not a slider. A straight line through them read as
nothing at ten — an eighth wider against twice the raid.

**Not the sweep.** It already scales, and by a better rule: it catches whoever
is in reach, who is the melee, and a bigger raid brings more of them.
Multiplying its range as well took it past the arena's own radius, which is
not a wider sweep, it is a sweep with no outside.

| Tidebreaker, normal | before | after |
| --- | --- | --- |
| 5-player | 57% / 86% | 86% / 100% |
| 10-player | 100% / 100% | 29% / 93% |
| 25-player | 93% / 100% | 7% / 36% |

The first and ninth pull of each. The order it leaves is the one the size was
always supposed to have — a bigger raid is a harder fight, not a safer one.

One cell is left at zero and named rather than tuned away: a heroic
twenty-five man Tidebreaker is the only place a raid meets the cone, the ring,
the sweep, thralls and a stalker at once, on shapes already widened for the
size.

**And one real bug came out of writing it.** The size tables were first
written as `{ 5: SHOCKWAVE_BAND, 10: 96, 25: 104 }`, above the line that
declares `SHOCKWAVE_BAND`. A five-man's ring got a band of `undefined` and its
cone an angle of `undefined` — and an `undefined` half-width fails every
comparison it is in, so the cone silently stopped hitting anybody at one size
only. Nothing threw. It read as a tuning result for two rounds. The check now
plays a pull at each size and asserts both shapes have a real width, that
neither has grown past having an outside, and that both are wider than a
five-man's.

### The backdrop, and a check that was passing on luck

The menu backdrop is a real pull, stepped at the same rate as a played one
with the player's slot handed to the AI, and there is a check that says it
never shows an empty screen — a phone holds a third of a desktop's width and
the backdrop is drawn twice as close as the game, so at that range the middle
of the arena is sometimes a view of nothing.

The check had been failing at random since it was written, roughly one run in
three, and always on a battleground. Which is exactly where the bug was: the
backdrop camera aimed at the *average* of everyone alive, and the average of a
battleground is an empty patch of floor between two crowds. Then the scene the
backdrop rolls is picked at random, so whether the check saw it was a coin
toss — a real defect and a flaky gate at the same time, and the flakiness is
what kept the defect.

It aims at whoever is nearest that average now. That makes the guarantee
rather than improving the odds: the camera is centred on somebody, so somebody
is always in frame. It costs nothing when the fight is together, which is
every raid — the nearest body to the middle of a raid *is* the middle. Worst
case across twelve matches went from nobody on screen to two players in
fifteen.

## Sharing

There is no server, no account and no replay sitting in a database, so there
is nothing to link *to*. What there is instead is the same reproducibility the
daily run is built on: the fight is not stored anywhere, it is rebuilt from a
seed. A link can therefore carry the fight itself rather than a picture of it,
and sharing here means an invitation rather than a screenshot — which is the
only shape worth having when the thing being compared is how it was played.

Three places offer one. Today's screen shares the day, with whatever you have
made of it so far attached; the results screen shares a kill, with the boss,
the size, the difficulty and the time; and the front page shares the game
itself, next to the record. All three hand the text to `navigator.share` where
the device has a share sheet and to the clipboard where it does not, and the
button says `COPIED` for a moment afterwards, because a clipboard write is
otherwise completely silent and a button that appears to do nothing is a
button people press twice.

The front page's is the odd one out: it is about the game rather than about a
fight, so its link carries no fragment at all — there is nothing to reproduce,
only somewhere to arrive. What makes it worth sending rather than a bare URL
is the line under it, which counts the bosses down, the deepest floor reached
and the fastest kill of the furthest boss. One best rather than a table: a
list of three is a spreadsheet. A player who has done nothing yet claims
nothing, and the check fails if that message ever grows a number.

The link is a fragment — `#d=20260820` for a day, `#b=warden&s=10&h=1` for a
fight — read once at startup and then cleared out of the address bar. Leaving
it there would mean every reload for the rest of the session dragged you back
to somebody else's fight.

An invitation is a stranger's text, so it is read as one: a boss id that is
not a boss, a raid size the game cannot field, a day that is not a date, and
anything else that arrives in a URL is dropped rather than honoured, and a
link that decodes to nothing simply opens the front page. The checks round
trip every size and difficulty through the encoder, and feed it seven kinds of
junk. A day link opens *today's* run rather than the day it names — a daily
ends at midnight and so does the comparison it was shared for. A fight link
unlocks the boss it points at and keeps it unlocked: the boss ladder is there
so a new player meets them in order, not to stop somebody being invited past
it.

The share button sits in the corner of the results screen rather than in the
button row, which was already three wide after a kill and could not hold a
fourth on a phone without every button shrinking below a thumb. It is also the
only thing on that screen that is not a way off it. The checks assert at four
screen sizes that it does not overlap the row, that it answers its own tap,
that a wipe offers none, and — on today's screen, where `SHARE` was carved out
of `PULL`'s width — that the two do not overlap, since a share that also pulls
would start the run you meant to send.

## The descent

One attempt, boss after boss, each floor harder than the last, and the party
arrives at the next one in whatever state it left the last. No retry: pressing
it starts a fresh run from the first floor, which is the point of there being
a depth to lose. What is kept between runs is one number — how deep you got.

Nothing is gained on the way down. That is the same rule the rest of the game
keeps: what improves between attempts is you, not a number on a character.
What the depth buys is a sentence worth saying — eleven floors is a different
story from four.

The floors start *below* an ordinary pull and pass it around the fifth: a run
that ends on floor one most of the time is a raid with the retry button taken
away. Between floors the survivors get a little over half their health back
and one of the fallen gets up. A full heal would make every floor the first
floor; nothing at all would mean a party that finished at ten percent had
already lost the next one and was only being told a minute later.

The party gets better as it goes, too — they are the same five people who have
now been through several fights together — so the AI's learning is tied to the
floor rather than to a pull count that a descent never has.

Tuning it took four rounds against the harness, which kept ending runs on the
first or second floor, and the fix in the middle of that was the interesting
one: reading the depth multiplier as `depth || 1` gave **every ordinary raid
in the game the first floor's numbers** — a boss with 42% of its health. The
harness caught it because the boss stopped holding threat, and no amount of
looking at the screen would have.

## Getting better at it

Nothing on the character gets stronger, which leaves a problem: the party
*does* get better, by a lot, and until now nothing said so. Measured over
twenty-four pulls, the first attempt at a boss wins **8%** of the time and the
ninth wins **50%** — six times the win rate, entirely from the party reacting
faster and fumbling less. Your own damage over those same nine pulls does not
move at all, because there is no number on you to move.

So the evidence is the record, and the record now speaks up:

- **The results screen says how this kill compares** with your last one against
  the same boss at the same difficulty — "4.2s faster than your last kill, 6
  kills on this one". A trend needs two kills to have a direction, so it says
  nothing until there are two.
- **Personal bests announce themselves** as they are beaten, in the same banner
  the awards use: fastest kill of a boss, fewest mechanics eaten in a kill,
  deepest floor, biggest pull. The first time something is recorded is not a
  best — an announcement that fires every time announces nothing — so it stays
  quiet until there is something to beat.

## Battlegrounds

Two of them, five against five, on the same floor with the same classes. The
party screen's first row picks what PULL does: the raid, or one of these.

| | Winning is | Ends at |
| --- | --- | --- |
| The Three Cairns | hold ground, and the clock does the rest | 400 points, or 300s |
| The Long Haul | walk yours forward, and stand in front of theirs | a cart arriving, or 300s |
| Ebb and Flow | carry theirs home while yours is still standing | 3 captures, or 360s |

A point is taken by standing on it, four seconds from neutral and eight from
the other team's. It pays only at the far end of that bar, so pulling one back
off them costs the whole thing and a defender left behind is worth leaving.

Even numbers on a point stop it — that is a fight, not a capture — but three
against one still moves it, at half speed. Freezing a contested point outright
was the first thing that had to go: a fight on the circle stopped the circle,
and with a healer on each side those fights do not resolve, so the bar sat
still through a third of every match and pushing harder changed nothing
anybody could see.

**A cart is neither of the other two.** A capture point is somewhere to stand
and a flag is something to carry; a cart rolls forward on its own for as long
as your side keeps it company, so the fight follows it rather than the other
way round, and losing a minute costs you a minute of ground rather than an
objective. Both sides push one down the same length of track in opposite
directions, so there is no attacker and no defender and neither is handed the
better half of an asymmetric map.

Even numbers on a cart creep it forward; being outnumbered stops it. Freezing
on a tie was the first rule and it made one missing body decisive — five
against four is one cart moving and one standing still, so a side that lost a
single fight lost the match, and the harness's weaker stand-in never won a
game. The tie creeping keeps a bad minute from being the whole story. Nobody
on it at all is not a tie, which the check caught immediately: for one round
of tuning zero against zero counted as even numbers and empty carts rolled
across an empty map on their own.

It is also the map where individual fighting matters most, because numbers on
the cart convert straight into ground — which is why the harness's one-button
stand-in reads far lower here than on the other two.

A flag is taken by walking onto it and scored by carrying it to your own base,
**and only while your own flag is still at home.** Otherwise two carriers pass
each other in the middle and the match is a footrace. A carrier who dies drops
it where they fell; your own dropped flag goes back the moment a teammate
touches it, and returns itself after five seconds if nobody does.

That rule locks a match solid unless something breaks the tie, and the first
version had nothing that did. Both flags were out 89% of the time — neither
side able to score, for stretches of nearly four minutes — because both teams
leave at the same moment, both take a flag, and then nothing changes: a
carrier was no easier to catch than anyone else, only the tank and the healer
went to fetch ours back, and three dealers escorted a carrier who had nowhere
to score. Three things fixed it. **Carrying it is a handicap** — eighteen
percent slower and a quarter more damage taken, so killing a carrier is
something that happens rather than something you suggest. **A dropped flag
returns in five seconds** rather than fifteen. And when both flags are out,
**everyone but one escort goes to get ours back**, since standing still is a
loss for both sides.

Both flags out is still the usual state, at 76%, but it is now a state a match
passes through rather than sits in: the longest anybody goes without scoring
fell from 235 seconds to 74, and an average match from 181 seconds to 81.

The dead come back after twelve seconds at their own base. A battleground
where they do not is a deathmatch with extra reading — the first team to win a
fight wins the match, and every objective after that is a formality.

**The other team is not a boss.** It is five of the same fifteen specs, rolled
at the door like yours, running the same AI file — because a battleground
where the other side plays worse than yours is a training dummy that takes
longer. That AI is a separate file from the raid's (`bgai.ts`), since the two
answer different questions: a raid AI scores tiles by how survivable they are,
because a boss puts hazards on the floor and the job is being somewhere else.
A battleground has no hazards and no threat table. It has somewhere you are
meant to be standing, and five people who would rather you were not.

**There is terrain, and it is rolled per match.** Rocks, drawn as raised
discs, on both maps and neither raid — a boss fight puts its hazards on the
floor and a second thing to walk around would only get in the way of them. A
capture map gets four to seven, a flag map four or five, in a new arrangement
every time you enter one.

They are **mirrored across the vertical axis**, always. Both maps are
left-right symmetric — two bases facing each other, three points in an
isosceles triangle — so a rock on one side and not the other is a rock that
favours a team, and nothing measured afterwards would tell you which match it
decided. A pair either side costs nothing and settles it. Capping the list to
a fixed count broke this the first time round: the cap cut a pair in half and
left a block on one side of the map with nothing facing it.

The gaps are the part that has to be right. Rocks are kept a lane apart from
each other, from the arena wall, and from anything that has to be stood on,
because two rocks that touch make a concave shape — and sliding round a circle
always ends, while sliding into the crease between two of them does not. The
check rolls sixty maps per battleground and asserts placement, spacing,
symmetry and that the layouts actually differ, then walks a body from its base
to every objective on twelve more and fails if it does not arrive.

A battleground's seed counts entries rather than pulls, because a raid is the
same encounter learned over attempts while a map you have already walked is
not the point of rolling one.

They are circles, and that is a decision rather than a shortcut. Everything
here walks straight at what it wants, so the shape has to be one that a body
slides around on its own; a concave one needs path-finding, and an AI stuck on
scenery is the failure this game has already had twice.

Sliding is the whole of it: walk into a rock, get put back on its surface, and
the part of the step that was spent being pushed out comes back along the
surface instead — whichever way round the step already leaned. A step aimed
dead at the centre has no lean and takes one fixed side, because that tie has
to be broken or it is a wall. It was a wall in the first version: pushing
without sliding left a body re-walking into the same rock for thirty seconds,
a quarter of the way to where it was going. The check walks something straight
through a rock and fails if it does not come out the other side.

A charge is the one move that crosses the gap rather than walking it, so it is
the one that can end up inside a rock. It stops against one now: terrain a
cooldown ignores is terrain nobody has to respect. That was two actor-ticks
inside a block over one match, and only the check saw it.

**Everyone is assigned a point and stays on it**, whoever owns it — holding
one is defending it, so there is no separate "go and defend" rule. Five people
over three points is two-two-one and stays that way.

That shape is the third attempt. The first sorted the points by distance from
the actor and indexed into the list, so a step toward one reordered the list,
reassigned the actor, and sent it back: ten AI pacing between two points for
entire matches, covering **four percent** of the ground they walked. Nothing
threw, both teams did it, and the win rates stayed level — what it cost was
visible only as people stuck in the middle of the map.

Committing to a point fixed the pacing and produced the opposite failure. A
contested point called the whole team to it, both teams answered, and nine
people stood on one circle for three minutes while the other two sat
unattended and paid out to whoever had taken them first. A fixed split has
neither problem, and the check for it now measures distance covered against
distance walked — 0.04 before, 0.89 after — and counts how often an actor
changes its mind.

The one rule that took rewriting is a leash. Left alone, defenders chased
kiting casters off the point they were defending — which concedes the point
and costs the caster nothing — so a goal now carries a radius, and inside a
capture circle the fight happens on the circle.

The flag map was given no radius at all, on the reasoning that a carrier is a
moving objective and following one across the map is the correct play. That is
true of following one and of nothing else. With the leash at zero, the combat
positioning overrode every flag goal there is: a ranged actor whose nearest
enemy stood beyond its spell range walked at the enemy instead of the flag, and
a melee one chased anybody who strayed near where it was going. Carriers spent
a quarter of their time being sent *away* from their own base, which is the one
place a flag has to reach. It is half a percent now, and a carrier is leashed
tighter than anybody, because carrying is the one state in this game where
there is nothing to be won by turning round.

### The rally, and why every second used to be the same second

A boss is a script. Phases at known health, a telegraph before every hit, an
enrage at a known second — and learning one is almost entirely learning *when*
things happen. The battlegrounds were supposed to have the rules supply the
shape the script used to, and they did not: three hundred seconds in which
every second was worth what every other second was worth.

Win rate cannot see that. A lead taken in the first ten seconds and held reads
the same hundred percent as one that changed hands four times, and a formality
and a war both end at the time limit. So the harness counts three more things
now — how often the lead changed, how often the thing that scores changed
hands, and the spread of the fight's own centroid, sampled once a second. That
last one is what said it out loud: on a floor nine hundred across, the fight
wandered inside a radius of about thirty-five. On all three maps.

So every mode has one scheduled contest. It sits on the perpendicular bisector
of the two bases, which makes it exactly as far from one as from the other, and
never at the origin, because the fight already happens in the middle and a
contest for ground everybody is standing on is not a contest. It warns for nine
seconds, it is held the way a capture point is held, and it pays once. Everyone
but the last of the five is called to it, and a flag carrier is excused —
everything a rally is worth is worth less than the flag already in your hands.

Three things had to change before it was a decision rather than a decoration,
and the harness found all three:

**It was timed as a fraction of the time limit.** Two of the three limits are
not what their matches run to — a flag match finishes around forty-five seconds
against a limit of three hundred and sixty — so the rally landed a hundred and
twenty seconds after the match it was meant to interrupt had ended. It was in
the build, in the state and in the AI, and the only thing the numbers showed
was that nothing had changed. The schedule is seconds per mode now, read off
measured match lengths.

**It paid only in respawn time.** A stand-in that ignored the rally entirely
and kept playing the objective won more than eight matches in ten: one extra
body on the board for thirty seconds beats making the other side walk further
later. A mechanic whose correct answer is to ignore it is not a decision, it is
a tax on whoever reads the screen. It pays in the currency each mode already
counts now — points, cart progress, a capture — and the respawn penalty is what
it pays on top.

**It had to be taken outright.** Four against four never produces the numbers
advantage a capture bar moves on, so half of all rallies expired untouched at
dead level. It settles on a lean instead, with a deadband wide enough that a
genuine standstill still pays nobody.

Respawns grow with the clock as well, so a death late is the one you cannot
take back, and the rally's loser walks twice as far while its penalty lasts.
The fight's centroid now travels 81, 76 and 92 against 32, 35 and 61, and the
escort map's turnovers doubled.

### A side that decides things

The rally gave the match a clock. What it still did not have was anybody making
a decision on it: every actor answered "where should I be" from its own index
in the team and never asked again. Nothing in that read the score, the clock,
or where anybody was standing. It was written to stop the AI pacing between two
points — which it did — but stable turned out to mean a match with no macro
layer at all, and a stand-in that knew only "walk at whatever we do not own"
beat the real thing on all three maps.

The pacing came from recomputing a *continuous* quantity. Sorting the points by
distance from the actor meant a step toward one reordered the list, reassigned
the actor and sent it back. So the plan recomputes a **discrete** one instead —
who owns what, how many of us are standing, what the flags are doing, roughly
how far the carts have got — and only when it changes, never more often than
every four seconds. Anything that flickers is deliberately left out of that
reading, because a reading that changes every tick plans every tick, which is
the old bug wearing a hat.

On the capture map a side holds **one body on each point it has** and puts
everything spare on **one point it does not**. Holding is worth exactly one
body — a point pays while it is held and a second defender adds nothing — while
the capture rate climbs with numbers, so a four-stack takes a point in a third
of the time one does. The target is kept until it is taken: both sides pick the
nearest thing they do not own, both flip one at about the same moment, and
re-choosing on every flip pointed everybody at the far end of the map before
anybody had arrived at this one.

Jobs go to whoever is **nearest**, not to whoever comes first in the team. Team
order means nothing on the floor, and blue's first slot is always the player's
— so the player was posted to a quiet corner of every capture map they ever
played while the other four went and had the match. Posts keep their incumbent
even so: re-picking a flag guard by "closest to home" every time the board moved
handed the job to whoever happened to be walking back, took it off them the
moment somebody else was nearer, and left the flag unwatched in between.

### A flag you can actually defend

None of that helped the flag map, because a flag came off on touch. A guard
could not guard: standing there was worth nothing unless it had already killed
the four people arriving, and one defender does not. Eight pickups a match,
four captures, and the whole thing over in forty-odd seconds against a limit of
three hundred and sixty.

A flag at home is **stood on** now, the way a capture point is, and anybody
defending it in reach stops the clock rather than having to win the fight
first. Progress is lost twice as fast as it is earned, so trading the circle
back and forth is not a way of taking a flag one second at a time. A flag lying
in a field is still picked up on touch — the fight that dropped it has already
happened, and making the winner stand over it is making them win it twice.

Three captures and a three-hundred-and-sixty-second limit became four and a
hundred and eighty, because that limit was not a limit: no match ever reached
it, and a clock nobody can run out is no reason to hurry. Matches run to 86
seconds of 180 now, with twice the deaths in them.

### What the numbers say now

The fight's centroid travels 80, 119 and 111 where it travelled 32, 35 and 61
before this work started, and the capture map's objectives change hands 33
times a match against 8. The AI beats the objective-only stand-in by 25 points
on the capture map and is level with it on the other two — level being the
right answer, since that stand-in is what a person who understands the
objective and nothing else would do.

One instrument note, which is the more useful finding. These rows were sampled
thirty matches deep, which puts two standard errors at about eighteen points —
wider than most of the differences they were being read for, including by the
round that added the rally. They run ninety deep now and print their own margin
in the header. A win rate is a coin flip counted a few times, and it is worth
acting on when it moves further than that and not before.

### Making it fair was most of the work

Three bugs, none of which threw anything, all found by playing the same two
compositions from both sides and asking whether the *side* won:

**Only the party could crit.** A raid gives crits to the party alone, since a
boss that occasionally hits half again as hard makes healing a coin toss. In a
battleground both sides are the party, so that rule was a seven percent damage
tax on red.

**Every cast red finished was thrown away.** The other team shares the boss's
faction, and finished casts on that faction were routed into the boss script,
which knows two abilities and silently drops everything else. Red was playing
instants only.

**Blue was checked first, everywhere.** Whoever is checked first wins every
tie, and in a symmetric match ties are not rare — both teams leave at the same
moment and reach the flag on the same tick. Blue took it first, and since you
cannot capture while your own flag is out, red spent the match carrying
something it could never score with. Ninety percent of matches went to
whichever side the loops happened to name first. Team order now alternates by
tick, which keeps replays deterministic while making "first" a coin that is
not always the same coin.

With all three fixed, ten AI and nobody driving comes out at 52% and 58% over
sixty matches a side.

## Classes and roles

Most classes fill more than one role, and a class in a different role is a
different character: its own abilities, its own health and its own armour. A
protection warrior and an arms warrior share nothing but a name.

| Class | Tank | Heal | Damage |
| --- | --- | --- | --- |
| Warrior | ✓ | | ✓ |
| Paladin | ✓ | ✓ | ✓ |
| Druid | ✓ | ✓ | ✓ |
| Priest | | ✓ | ✓ |
| Shaman | | ✓ | ✓ |
| Mage | | | ✓ |
| Warlock | | | ✓ |
| Hunter | | | ✓ |
| Rogue | | | ✓ |

Seventeen combinations in all, and the raid screen lists them individually
rather than asking you to pick a class and then a role.

**Every spec has one rule that is its own** — healers and tanks included.

| Healer | Its rule |
| --- | --- |
| Priest | **Ward** — puts the reduction on *before* the hit, which needs you to know what the boss does next |
| Druid | **Bloom** — a direct heal on somebody already mending bursts; the over-time is the setup, not a trickle |
| Shaman | **Chain** — the heal jumps to whoever is standing near, and to nobody when the raid is spread |
| Paladin | **Anchor** — worth half again on the tank and less on everybody else |

| Tank | Its rule |
| --- | --- |
| Warrior | **Guard** — rage is earned by being hit and spent on being hit less |
| Paladin | **Cadence** — a reduction on a clock, two and a half seconds in every eight, so a healer can plan around it |
| Druid | **Thick** — gives back a slice of whatever lands, over time; the healer tops up rather than catching spikes |

Three of the four healers were also playing with a button switched off:
autocast's priority list had no line for the over-time heal at all, so Renew,
Rejuvenation and Riptide were pressed **zero percent** of the time. Pressing
them took healing from 72 to 112 a second. Healing costs enough to be a budget
now — at the old prices a healer at half uptime spent exactly what it
regenerated and never had a decision to make.

**Every damage spec has one rule that is its own.** They used to share a
rotation and differ only in numbers, which measured out as nine names for one
spec: filler, dot, finisher, the same three presses in the same order, the
numbers within thirteen percent of each other. Picking a class chose a colour.

| Spec | Its rule |
| --- | --- |
| Rogue, Feral | **Combo** — the filler banks a point, the finisher spends the bank. Five points is double |
| Mage | **Momentum** — casting without moving compounds, and moving spends the compound |
| Balance | **Eclipse** — the finisher opens a window its filler hits half again as hard inside |
| Hunter | **Distance** — paid for the range it keeps, up to a third more at the far edge |
| Shadow, Retribution | **Affliction** — the filler is worth 40% more on a target already marked |
| Arms | **Overflow** — rage near the top makes the next swing land half again as hard |
| Elemental | **Chain** — the finisher jumps to two more bodies for a third each, and to nothing on a lone boss |
| Destruction | **Pact** — buys a window of harder fillers with eight percent of its own health |

The last of those is the only one paid for in a currency somebody else can
see. Every other price in the game is private — mana, rage, a cooldown, a
global — and is settled between a player and their own bar. Life Tap spends
eight percent of the health bar the healers are watching, and buys three
fillers worth half again, so the question it asks is not "what do I press
next" but "can the raid afford me right now".

It sits off the global cooldown on purpose, and that is the whole of its
tuning. On the global it came out last of the ten dealers at 103 against a
field of 111 to 150 — the press was being charged twice for one idea, once in
health and once in rotation time. Off it, the price is health and nothing
else, and it lands at 128, seventh of ten. Nothing else about it moved.

What it does with the fights is the part worth having. The rotation stops
tapping below half a bar, so the boss decides how much of the class you get to
play: the same warlock taps fourteen times on the Warden and seven on the
Unblinking Watch, because one of them keeps hitting it. A spec whose output is
throttled by the fight rather than by its own cooldowns is the one thing none
of the other nine do.

Each one is drawn where you are already looking, above the cast bar: a rogue
banking points it cannot see is a rogue pressing the same three buttons as
everybody else.

The rhythms differ too, which is the other half of it. Playing a spec for a
minute, with the rotation pressed for you:

| | presses/min | cast-locked | damage is |
| --- | --- | --- | --- |
| Paladin | 28 | 0% | steady (0.68) |
| Feral | 24 | 0% | steady (0.68) |
| Rogue | 22 | 0% | steady (0.90) |
| Shaman | 21 | 10% | lumpy (1.20) |
| Mage | 19 | **37%** | lumpy (1.14) |
| Priest | 18 | 0% | lumpy (1.08) |
| Balance | 18 | 10% | lumpiest (1.27) |
| Warrior | 16 | 0% | lumpy (1.18) |
| Hunter | 10 | 0% | lumpy (1.33) |

A mage spends over a third of a fight rooted in a cast; a paladin presses
something nearly three times as often as a hunter and its damage barely moves.
Same damage per second, different job.

One of these checks caught the boss itself wearing a tank's trait. A boss
borrows a class and a spec for its name and its colour, and the warrior tank's
rule is "rage near the top means a quarter less damage taken" — a boss has no
rage bar at all, so the comparison was always true and it quietly took a
quarter less from everything. Every balance number measured while that was live
was measured against a boss with free armour.

The traits are checked directly rather than inferred — five combo points
against none, an eclipse window open against closed, a mark up against not,
rage full against empty, a hunter far against near — because a trait that only
exists in the tuning notes is a comment. The chain is measured in a
battleground, where a crowd exists: a raid opens with a boss and nothing else,
and the first version of that check quietly skipped itself.

Rotations still share a shape per role; what differs is the rule, the numbers
and the cast times. The hunter is entirely instant and keeps damaging while it
repositions, the mage's finisher is a 2.5s cast that competes directly with
dodging, and the rogue has to be next to the boss to do anything at all, which
is why it is reliably the one standing in fire.

The three tanks are not interchangeable either:

| | Health | Armour | Block | 540 swing lands as |
| --- | --- | --- | --- | --- |
| Warrior | 6200 | 50% | 260 | 138 |
| Paladin | 5800 | 49% | 240 | 153 |
| Druid (bear) | 9200 | 56% | — | 237 |

A flat block is worth a great deal against a fast weapon, so the druid pays
for having none with a far larger pool: harder to spike down, more of a drain
on the healers. Tuned to within a few points of each other in practice — a
druid-tank, shaman-healed five-man wins 53% by the ninth pull against the
default composition's 73%.

## Defence

Armour is a rating run through `armor / (armor + 9000)`, so it diminishes and
never approaches immunity. Shield carriers also remove a flat amount before
mitigation, which is worth more against many small hits than one large one —
the shape of a tank's job.

It only applies to the boss's weapon. Mechanics are magic and ignore armour
entirely, so a plate tank and a cloth caster take a puddle equally. The tank's
role is to stand in front of the swings, not to be immune to the fight.

That gap is the whole point:

| | 540 swing lands as | swings to die |
| --- | --- | --- |
| Warrior | 138 | 45 |
| Hunter | 395 | 9 |
| Mage | 491 | 6 |

A dealer that pulls threat has about ten seconds to live, which is why the
threat readout is on the party frames.

**Threat is taken, not handed out.** The table starts at zero for everyone,
including the tank, so the first thing a pull needs is somebody to take the
boss: every tank carries a taunt on its fourth slot — Taunt, Hand of
Reckoning, Growl — and it sets you a nose ahead of whoever the boss is
currently looking at rather than granting a pile of threat. Taking it back is
free; keeping it is the job. Tanks only taunt off a non-tank, so two of them
in a raid do not trade the boss back and forth across the melee on cooldown.

Personality belongs to the slot rather than the class. Kestrel gambles on long
casts with a telegraph already on the floor and reacts late; Wren bails early
and overheals.

**Classes run on four different resources.** Warriors and bear druids on rage,
rogues and cat druids on energy, hunters on focus, everyone else on mana, and
every ability is paid for out of it. The resource sits on the spec rather than
the class, because one druid answers four different ways: rage in bear form,
mana as a caster, energy as a cat, mana again healing. What you are playing
decides it, not what you picked on the roster.

That is also why a pick names a spec rather than a role. The druid deals
damage two ways — Balance casts at range on mana, Feral swings a weapon on
energy — so "druid, dps" stopped being an answer to which character you meant.
Rosters saved before specs had names are migrated on load rather than thrown
away: a class and a role still identify the spec that existed when they were
saved.

They are three different problems, not one bar in three colours. Mana is a
budget for the whole fight: a caster spends faster than it regenerates and the
question is whether it lasts to the kill. Energy and focus refill on their own
at a rate that covers roughly a filler per global cooldown, so you are never
short of them for long, only right now — the question is whether you can
afford the expensive button as well. Rage is neither. It starts at zero and is
earned by landing weapon swings and by being hit, so a warrior opens a pull
able to do nothing at all, a tank being hit every couple of seconds ends up
with more than it can spend, and a warrior who cannot reach anything stays
poor. Ground damage is silent and lands thirty times a second, so it pays
nothing: standing in fire is not a rage generator.

Defensives and taunts are free. They are the answer to a mechanic, and an
answer that is sometimes unaffordable for a reason the button cannot show is
worse than having no resource at all.

**A hunter needs the distance.** Every shot it has — the bow included — has a
near edge at ninety units, so a hunter with something standing on it cannot
shoot that thing. Pressing anyway says `Too close`, the same words and the
same red slot a charge from melee gets, and costs nothing. The bow shoots past
what is in its face at whatever it can reach instead, so a thrall on a hunter
costs it a target rather than its whole rotation.

The party AI had to learn it too. Its shared idea of far enough — ninety-five
units from the boss's centre — is inside a bow's edge measured from the boss's
edge, so a hunter would have stood at a distance the AI was happy with and
fired nothing. A shooter is asked about its own rule now. It is only asked
about the boss: running from a thrall costs more uptime than the thrall does.

**Five buttons each, and the fifth is always the same question.** Every spec
carries exactly five: what it presses when nothing else is up, what it keeps
running, what it saves for, the one that is only its own, and — always under
the same finger — what it does when none of that is the question any more.
Before this the bars ran from two to five, and the eleven specs at the short
end were the ones with no answer to the floor at all: a mechanic here is
dodged or eaten, and only the tanks and the two leather melee owned anything
to do about the eating.

That fifth button is a brace: thirty percent off for four seconds, free, off
the global cooldown, on a fifty-second cooldown. Deliberately not a wall — a
tank's is sixty percent for six, and eleven bodies holding the tank's number
would be eleven tanks. The party AI reaches for it by personality, since it is
the same decision the reaction delay already models: the timid one at
fifty-five percent health, the steady one at forty-two, the greedy one at
thirty and sometimes not at all.

**And it does nothing at all about the floor.** A brace answers what could not
have been avoided — the beat that hits everybody, the boss's dot, a thrall in
your back — and is worth nothing against what you stood in. The rule is a
design one rather than a tuning one: avoidable damage is the only thing
practice removes, so a press that makes the fire safe is a press that deletes
the fight. It is checked directly, both halves of it, because half of the rule
is not the rule.

It still pays, because the unavoidable is most of what kills a dealer over two
minutes: deaths over sixty pulls a spec fell where they were worst — the mage
from 37 to 30, the warlock 30 to 26, the rogue 27 to 21, the balance druid 28
to 24 — and the damage spread across the ten dealers came in from 1.34 to
**1.30**, since the specs that were dying most were the ones losing the most
damage to being dead.

And the teaching survived it, which is the number that decided whether any of
this shipped. At 120 paired pulls a mechanic, before and after: the puddle
teaches 4.0 points against 4.2, the mirror 6.9 against 7.0, the fault 6.3
against 5.5, the judgement 10.2 against 8.3 — all four still real, the
judgement's the only one that moved by more than its error bar, and it is the
one answered by a healer rather than by feet, so the healers' own new buttons
are where that went.

The first read of this said something else. The harness prints the same gaps
at thirty pulls a row, and there the puddle went from 5 points to 1 — which
was a phantom, and one the file warns about in as many words: a check whose
error is the size of the thing it is judging gets answered by tuning until it
goes green. `scripts/teachprobe.ts` exists to print the bar that belongs to the
number, and at 120 runs the gap had not moved at all.

**One of those five had never been reachable.** The `attack` slot — a healer's
damage button and the mage's one instant — was in the kit, was pressed by the
party AI, and was not on the bar the screen draws or the keyboard maps. Five
specs carried a button only the four bodies standing next to you could press.
The README has been describing Ice Lance as "the one thing it can press with
its feet moving" for two rounds; for the player it did not exist. The check
that would have caught it asks the question directly now: every ability in a
kit has to appear on that spec's bar.

**Leather melee carry a way out.** A rogue's Sprint and a cat's Dash: half
again the speed for five seconds, free, on a forty-five second cooldown. Melee
range is 52 units, so walking out of a puddle is walking out of the fight,
while a caster keeps working from 340 — plate answers that with armour it can
afford to eat a hit through, and leather could not answer it at all. It is one
exit and one return rather than a way to play the whole fight at speed, which
is what the five seconds are for.

**A warrior charges, and so does a bear — and now the paladin rides.** Both
warrior specs carry Charge, the guardian druid carries Wild Charge, and the
protection paladin carries Divine Steed: a tank that cannot get back to
whatever wandered off is a tank whose raid is being eaten while it jogs.

The paladin was the one tank without one, on the grounds that a charge is
where a warrior's rage comes from and a paladin runs on mana. That was the
justification for the button, not for the gap it left, and the gap measured:
against the same fights with the same healers, a protection paladin took
0.019 bars a second and the other two took 0.008 and 0.007. With a way to
close its own gap it takes 0.009, which is the same tank as the other two
rather than the one that spends the fight walking.

Measured rather than assumed, the same way the warrior's was: 2.3 uses a pull,
never spent from inside melee, average gap 111 units.

Both specs carry it: it crosses up to 260 units to
whatever it is aimed at, stops at swinging distance rather than inside it, and
arrives with 25 rage — which is the answer to a resource that starts at
nothing, since a warrior otherwise opens a pull unable to press anything. It
costs nothing itself, because charging to earn the rage you needed to charge
would be a circle.

It is the one ability with a near edge. Standing on top of something is not a
reason to spend a cooldown, so a charge from melee is refused and says `Too
close` rather than `Out of range`, which would be exactly the wrong thing to
say. The button reads as unusable at both edges, since from either one the
answer is the same.

Adding it took the key labels off the abilities. Each one carried the number
it was pressed with, which worked only while an ability sat in the same slot
for everybody: charge is the fifth button as protection and the fourth as
arms. The slot is the label now, and the bar grew to five — a second column
beside the first rather than a taller stack, since four rows already reach
back into the arena on a phone.

**Weapons swing on their own.** Melee specs hit whatever is in reach every
three seconds and the hunter shoots from spell range, as physical damage, on
no global cooldown and with no press — white damage is what happens while you
are busy deciding, and without it a rogue standing in melee between presses
was doing literally nothing. Casters have none: a wand plink is not the
fantasy and not worth the numbers it would put on screen.

It is sized against what the party actually does rather than against the
ability tooltips. The AI loses damage to reaction delay and to walking out of
puddles; a weapon loses none, so white damage lands at nearly full uptime and
is worth far more per point than it looks. At fifty a swing it is about a
sixth of an auto-attacker's own output and a seventh of the raid's.

**Hits crit.** Fifteen percent of the time, for half again as much, marked as
a crit in the floating text — a kind the text has carried since long before
anything emitted one. They are the party's alone: incoming damage is the
healers' problem, and a boss that occasionally hits half again as hard makes
that a coin toss rather than a job. Mechanics never crit either, for the same
reason. A crit throws a wider burst with more spokes and shoves the view,
which is the only thing on screen that moves the camera; it falls off inside a
fifth of a second, because a shove that outlasts the hit reads as the game
stuttering. The world is shoved and the interface is not — a heads-up display
that shakes is one nobody can read.

Boss health went up seven and a half percent with them, the same as the damage
they add, so the encounter is the length it was.

**Bolts have a trail and a halo.** The trail is the last few places the bolt
was, thinning toward where it came from, and it lives in the renderer keyed by
projectile id — decoration has no business in a state that has to replay
identically. The halo is a radial gradient rather than a flat disc, which is
the difference between light and a circle of paint.

**A cast is drawn on the caster.** A ring gathers inward as it runs and a dial
fills clockwise around the token, which is the same number as the cast bar on
the party frame put where you are actually looking. Gathering rather than
expanding is the rule that keeps it readable: everything that leaves a token
is something that already happened, so something about to happen has to close
in. Completing it throws the ring off in the caster's colour; breaking it
collapses the ring back into them instead, so a cast that came apart never
looks like one that went off.

**A bar appears over anybody who is hurt.** One line, no name, no number, and
nothing at all over somebody at full health. Always-on bars would be
twenty-seven of them in a twenty-five man — wallpaper rather than information,
and the party frames already carry exactly that in a grid built to be read at a
glance. Showing them only below full turns the arena itself into a readout at
the moment it matters and leaves it clean the rest of the time.

It goes red below a third, so a glance sorts "chipped" from "about to die"
without reading a number that is not there. On a portrait phone a token is
seven pixels across, and colour and length are the only two things that
survive at that size — which is why there is no name and no number on it. The
name is drawn there instead when somebody is *not* hurt, so the two never
stack.

**Only your own numbers float.** What you dealt and what landed on you —
either end counts as yours. Twenty-four other people trading hits is a wall of
numbers over a fight whose actual state is already on the party frames and the
meter, which is the same reason only your own hits make a sound. The report at
the end still counts everything.

**A hit looks like whatever threw it.** Every damaging ability used to make
the same expanding ring with the same six spokes in the ability's colour — a
fireball, a dagger and an arrow were one picture tinted three ways, and the
picture is what anybody is actually looking at during a fight, since nobody
watches the buttons.

| | |
| --- | --- |
| **cleave** | an arc across the target, along the line the blow came in on — warrior, rogue, cat |
| **pierce** | a streak straight through and a short spray behind — hunter, elemental |
| **crush** | short, wide and heavy: it does not travel, it arrives — paladin |
| **wither** | closes inward instead of pushing out — shadow, moonfire |
| **burst** | the ring, for anything without an edge or a point — mage, balance |

The style is read off the icon rather than listed separately: a blade already
draws a blade on its button, so a blade cleaves. It comes out of the same
three primitives the effects already had, so it is a table of parameters
rather than a second renderer.

**A hit the spec's own rule paid for is drawn as more.** A rogue's finisher on
five combo points deals double and looked exactly like one on none; the trait
existed in the numbers and nowhere else. Now a second, wider ring arrives a
beat behind it — queued with a negative age so it reads as a second beat
rather than a thicker first one. The simulation says whether the rule was
paying, because that is the one thing the renderer cannot work out for itself.

**Hits have a picture.** Every ability that lands and every weapon swing
queues an effect, and the renderer draws it from three primitives: a ring
expanding out of the hit, spokes radiating from it, and an arc where a melee
swing went. Bigger hits reach further, on a square root — a finisher deals ten
times a filler and drawing that literally would black out the arena. Heals
close inward instead of detonating.

The effects live in the renderer, not the simulation, for the same reason the
sound does: a pull replays identically from its seed, and particles ageing
inside the state would make that untrue. The simulation emits what happened on
a channel drained every tick, exactly as it does for sound, and the harness
never sees any of it.

They are drawn additively, which is the one thing that makes flat shapes read
as energy rather than as paint, and there is a cap on how many can be on
screen — a twenty-five man swinging and casting at once queues more than
anyone can read, and the oldest go first so the hit you are looking at is
never the one dropped.

**Every bolt is the colour of its own ability.** Fifty-one spells were flying
as four colours of dot; the table that tells them apart already existed, since
every ability needs a distinct icon. The shape and speed still come from the
kind of bolt it is, the colour now comes from the icon — thirty-four distinct
colours across the thirty-six abilities that put anything in the air.

**Ranged casts throw a bolt, and the bolt is the hit.** It leaves on the press
and resolves where it lands, roughly four tenths of a second later across a
spell's range, so range costs something now: a shot at a thrall about to die
is wasted, a heal can arrive after the person it was for, and two healers can
both be mid-flight on the same target. It used to resolve the instant the
ability did, with the bolt flying after damage that had already happened —
scenery rather than a mechanic. Its shape and speed still come from what the
ability is (heal, damage-over-time, finisher, filler) so a new spell gets one
automatically, its colour comes from the ability's own icon, and it lives in
simulation state rather than in the renderer, so replays stay frame-identical.

Anything used in melee or on yourself still lands on the press: there is
nothing in the air to wait for. A hunter's auto shot is the exception that
proves the rule — its damage happens where the hunter stands and the bolt is
drawn after the fact, so it carries no payload and lands nothing.

**Distances are all relative to the arena.** The floor has a world radius of
460 and everything else is expressed against it — ability ranges, the AI's
sampling rings, puddle size, how far out adds spawn. Widening the floor without
widening those just spreads the party out of range of each other, so they move
together. The renderer takes the radius from the simulation rather than
keeping its own copy, which is the sort of pair that silently drifts.

**The simulation is deterministic.** Fixed 30 Hz timestep, seeded PRNG, stable
iteration order, render interpolation on top. A frame that falls behind drops
the backlog rather than replaying it: catching up is visible as the fight
running at several times speed, which is worse than losing the time. The clock
lives in `src/loop.ts` as a pure function so that behaviour can be tested,
because getting it wrong does not throw — it just runs at the wrong speed. `Math.random()` is never called
inside `src/sim/`. That is what keeps replays, leaderboard verification and a
future server-authoritative port possible.

## The bosses

Three fights that ask for different things — and, for a long time, three
fights that looked like one.

The tables always differed, and the check saying so has passed since the
second boss existed, and it was still not enough — see
[the ladders](#the-ladders) for what was actually wrong with it and what
replaced it. What that check does get right is *how* it asks: what each boss
puts on the floor is measured from a real pull rather than read off the table
it came from, and it is asked of tonight's kit rather than of the whole table,
so a mechanic the boss owns and this raid did not climb to is one the check
insists never appears.

None of which reached the player, because every boss cast the same two spells
under the same two names in the same red. `ABYSSAL SLAM` and `TIDAL BREATH`
were hard-coded in the cast bar for all three, the two shared telegraphs said
`Sweeping` and `Rotting — need a heal` whoever was fighting, and the boss was
one colour. A fight that asks for something different has to say something
different, so the names and the colour moved into the table with the numbers:
the Choir's `DISCORDANT CHORD`, the Tidebreaker's `SHATTERING BLOW` and
`RIPTIDE BREATH`, a line each for the sweep and the rot, and an accent apiece.

They also had to *land* like different things, and until now they did not
land like anything. Every damaging ability the party owns has drawn its own
hit since there were hit styles at all — an arc for a blade, a streak for an
arrow, something that sinks in for poison. The boss's arsenal pushed no effect
of any kind: the slam, the cone, the ring, the floor going off and the
party-wide hit all arrived as a number over somebody's head and a shape on the
floor changing state, and the only thing a boss did that made a picture was
its sweep.

So each mechanic got a look, taken from what it already is on the floor: the
slam crushes in orange, the cone streaks through you in the cone's own blue,
the ring runs you down in amber and along the line it caught you on, the floor
sinks in in magenta and throws a ring the size it went off at, the sweep is
steel because it is the one thing armour answers, the party-wide hit bursts on
all of you at once, and a phase break throws a ring off the boss. The casts
gather a ring on the wind-up like every other caster in the game — the boss
was setting its cast bar by hand and never got one.

The floor got the same treatment: the puddle has a core that breathes, the
ring drags three fading rings of wake behind its edge so it reads as
travelling rather than being redrawn bigger, and the cone runs arcs out along
itself while it is actually firing, which is the one thing its shape never
said.

None of it touches the fight. Effects live in the renderer for the same reason
sound does — a pull replays exactly from its seed, and particles that aged
inside the state would make that untrue — so the simulation only says what
happened. The harness agrees: every win rate in the table above is the number
it was before this went in.

The checks now assert that a boss names a cast exactly when it uses one and
announces a mechanic exactly when it has one — a nameless mechanic and a line
for a mechanic that never fires are both table rot — that no two bosses say
the same thing or share a colour, and that the colour reaches the screen,
which is asked of the renderer by recording what it actually painted.

For the effects the pair is the same shape: every mechanic a boss throws must
have a look of its own, or it falls back to one orange ring shared with every
other boss cast; and every look in the table must be thrown by some boss, or
it is a colour for a mechanic that does not exist. Each boss's slam, puddle
and party-wide hit have to be seen *landing* — recorded by kind, not just by
name, because a slam that winds up and connects with nothing would otherwise
pass on the strength of its own cast. That hole was real: the first version of
the check passed with the slam's impact deleted, because the phase break was
borrowing the slam's id. The phase break has its own now.

Three of them, fought in order — and each of them six times over, which is
[the chain](#the-chain) below. A kill puts a button on the results screen to
the left of PULL AGAIN, and taking it moves you on with the pull count back at
zero: the party's learning is learning *this* fight, and a group that killed
the Warden nine times at five has not seen the rot the heroic rung buys.

Killing something is what opens the next thing, not pressing the button:
leaving through CHANGE PARTY after a kill keeps the progress. Where you are
and how far you have got are stored apart, so going back to farm an earlier
fight does not lock the later ones away again. Every row on the setup screen
draws what you have not reached locked but named — what is left up there is
worth knowing.

### The chain

The raid used to be three locked doors and nothing else. A boss opened when
the one before it died, and the size and the difficulty were free from the
first pull — so the first thing a new player could do was walk a heroic
twenty-five man into the Drowned Warden and meet all five of its rungs at
once. The ladders made that worse rather than better: their whole point is
that a size and a difficulty each buy a mechanic, and a game that hands you
the top of a ladder is a game with no rungs.

So there is one chain, and it runs *through* the settings rather than past
them. Six rungs a boss, in the order the fight gets harder, and the last of
one boss opens the first of the next:

> Warden 5 normal → 5 heroic → 10 normal → 10 heroic → 25 normal → 25 heroic →
> Choir 5 normal → … → Tidebreaker 25 heroic

Eighteen kills to open the game. **Clearing a rung opens the one after it, and
nothing else does** — not reaching it, not clearing something harder somewhere
else — so what is open is always a prefix of that list and a single number
describes it. Which is also why nothing in here ever has to ask "but did they
clear the *other* twenty-five man".

**Size before difficulty at each step**, rather than all three sizes and then
all three heroics. That is the order they actually get harder in: heroic at
one size sits below normal at the next in every cell of the harness table
above, and a chain that ran 5N–10N–25N–5H would ask a raid that had just
fielded twenty-five people to go back down to five to carry on.

The results button is named for what it does. It used to say NEXT BOSS after
every kill, which was true once in six — now it says `5-MAN HEROIC` or
`10-MAN NORMAL` when the next rung is this same boss one setting harder, and
NEXT BOSS only at the top of the six, where it really is.

Three places can hand the setup screen a setting it has not earned: a save
written before the chain existed, a shared link to somebody else's fight, and
pressing a boss whose top rungs are still locked. All three settle the same
way — down to the best rung *of the boss that was asked for*, never sideways
onto a different one. A player who pressed the Choir and got moved to the
Warden because their difficulty was locked would be reading a stranger answer
than a player who got moved to normal.

A save from before the chain held a boss index, since a boss was the only
thing that was ever locked. It is read as the *first* rung of that boss: the
progress that was actually earned is kept, and the axes that were never a door
become one. That does take away settings somebody had, which is the cost of
the change rather than an oversight.

An invitation still opens what it points at, and keeps it. The chain is there
so a new player meets the game in order, not to stop somebody being invited
past it — and locking the retry button after they have already fought it once
would only be a puzzle. Today's run is not on the chain either: it is one
fight a day, the same one for everybody, and gating it would make it a
different fight for everybody.

### The ladders

For a long time the three tables differed and the first one owned nearly
everything: the Warden threw pools, marks, the cone, the ring, thralls, the
sweep, the rot and the armour break, and the other two were the Warden with
things taken away. Three fights that opened on the same two mechanics and only
diverged once the party was already dead — which is not three fights, it is
one fight with two shorter versions of itself. The check that said they
differed passed the whole time, because it compared the full tables rather
than what any raid actually meets.

So each boss now owns a **ladder**: the mechanics it asks for, in the order it
starts asking. How far up tonight's raid climbs is `kitCount`, and it moves on
the two axes the setup screen already had — a five-man on normal gets two
rungs, and every step up the size or across to heroic buys one more.

| | normal | heroic |
| --- | --- | --- |
| 5 | 2 | 3 |
| 10 | 3 | 4 |
| 25 | 4 | 5 |

| Rung | The Drowned Warden | The Choir Beneath | The Tidebreaker |
| --- | --- | --- | --- |
| 1 | pools | marks | the cone |
| 2 | the sweep | rot | the ring |
| 3 | rot | the stalker | the sweep |
| 4 | the armour break | pools | thralls |
| 5 | the gathering | thralls | the stalker |

The order is the design, not the contents. **The first two rungs are disjoint
across all three**, so the fight everybody sees — a five-man on normal, and
the first forty percent of any pull that goes wrong — is a different fight per
boss: the floor and a wide swing, marks and something walking after you, a
cone and a ring. The sets only begin to rhyme at the sizes where a raid has
the bodies to notice, and **no boss's kit is ever a subset of another's** at
any rung. Both of those are asserted rather than eyeballed, along with the
containment down each column: heroic asks for everything normal did and one
thing more, and so does each size against the one below it.

Two constraints shaped where things sit. The armour break is answered by
swapping tanks and a five-man fields one, so no ladder sells it before the
rung a five-man cannot reach. The gathering costs about thirty points of win
rate wherever it is put, so it is the Warden's last word and belongs to a
heroic twenty-five or a deep descent floor and to nothing else.

| Boss | Asks for | Leans on |
| --- | --- | --- |
| The Drowned Warden | the floor, and whoever is standing on it | pools, the sweep, the armour break — nobody has to go far |
| The Choir Beneath | stay apart, and out-heal the singing | marks, rot, one thing walking after you |
| The Tidebreaker | come in, get behind, change target | the cone, the ring, thralls |

They are one script and three tables (`src/sim/encounters.ts`). A second boss
written as a second timeline would be a second copy of what a shockwave does,
and that rule — the ring outruns you, so the answer is to already be inside —
took three attempts to get right. It is not being written twice.

What separates them is which mechanics they lean on, in what order, and how
hard the floor hits. The Warden is the ground fight: nothing to get behind and
nothing to run into, a floor that goes unusable and a wide swing for whoever
is still in reach, and at the sizes that field a second tank it starts asking
who that is. The Choir has no cone, no ring and nothing on the floor until its
fourth rung: everything it does lands on one person at a time while the
unavoidable damage never stops, so it ends on healer mana. The Tidebreaker is
the opposite of both — almost nothing to stand in, and almost no time standing
anywhere, with a ring to run into, a cone to get behind and something new to
hit every time you have settled on a target. Its floor hits half again as hard
as the Warden's, because a mechanic you have room to dodge has to be worth
dodging — and its two shapes are the ones that widen with the roster, which is
its own section below.

| Sweep | Physical damage to everyone in reach — **the one thing armour answers** |
| Rot | A magic dot on somebody; armour is no help at all |

Those two are a pair, and they exist because everything a boss threw was magic
except its weapon. Magic ignores armour entirely, so a plate dealer took the
same mechanic damage as a mage in cloth: over thirty pulls both died at the
same rate, took the same number of mechanic hits, and the melee paid for the
privilege by standing where the boss was aiming. Plate was a line in a table.
The sweep is wide enough to catch the ranged as well — a melee-only physical
hit would be a tax on exactly the people whose armour was supposed to be the
reward — and the rot is the counterweight, so no stat block is the whole answer
to a fight.

| Mechanic | What it asks of you | Warden | Choir | Tidebreaker |
| --- | --- | --- | --- | --- |
| Slam | Tank cooldown, or the tank takes a large hit | always | always | always |
| Crushing tide | Unavoidable party damage — the floor under the healer | always | always | always |
| The boss itself | Faster than the whole party; you cannot outrun it | always | always | always |
| Pools | Move out fast; the warning is short and they linger | rung 1 | rung 4 | |
| Sweep | Get out of reach, or wear something | rung 2 | | rung 3 |
| Rot | Nothing — it is the healer's to answer | rung 3 | rung 2 | |
| The armour break | Trade the boss, or survive the top of the stack | rung 4 | | |
| The gathering | Everyone in one circle, and it is divided by who came | rung 5 | | |
| Marks | The target walks away from everyone else | | rung 1 | |
| The stalker | One dealer kites; the rest decide whether to chase | | rung 3 | rung 5 |
| Thralls | Summoned adds beeline for the nearest body; dealers switch | | rung 5 | rung 4 |
| The cone | A frontal cone — get out of the front, or behind it | | | rung 1 |
| The ring | It outruns you, so the answer is **in**, not out | | | rung 2 |
| Enrage | A hard damage check | 240s | 230s | 250s |

A cadence of zero disables a mechanic, and that is also how a rung the raid
did not buy is switched off: one rule for a mechanic being absent rather than
two. Zero is where it went wrong first, too — the schedulers counted down from
it and fired every tick instead of never, so the Tidebreaker marked the whole
raid for spread thirty times a second. Every scheduler checks its own cadence
now, and the render check plays each boss through to the end and asserts that
what reached the floor is exactly tonight's kit: everything on it seen, and
nothing off it, including the rungs the boss owns and this raid did not
reach.

Each mechanic asks for something different, which is what stops a fight being
a single dodge repeated: puddles say leave where you stand, the breath says get
behind, the shockwave says come in, spread says separate, adds say switch
targets, and the tide asks nothing at all except that the healer kept up.

Only the tide cannot be dodged, and that is deliberate: a party that dodges
well takes almost nothing else, so without a floor of damage the healer is
never tested and the only failure mode left is the enrage timer.

Because it cannot be dodged it has to be legible, or losing health right after
stepping out of a puddle reads as a broken hitbox. It gets a countdown above
the arena, a pulse when it is about to land, and a screen flash when it does.
Residual puddle damage is silent by design, so anyone standing in fire is
ringed in red instead.

The puddle hit test allows a little grace at the rim — your token has to be
meaningfully inside, not merely overlapping the edge.

Your `Burst` has a two-second cast and movement cancels it, so the real
decision is when you can afford to stand still. A cancelled cast costs
nothing: mana is only spent when a cast resolves, and the cooldown is handed
back the moment it breaks. Charging for a spell that never went off made
standing in the fire the cheaper play, which is the opposite of the decision
the cast time is there to create.

## Awards

Twelve of them, on the second tab of `RECORD`, which is on the front page. Some are about a pull — kill
it, kill it heroic, kill it with twenty-five, kill it without losing anyone,
kill it without standing in anything, kill it inside a hundred and ten
seconds, finish a kill top of the meter, finish one holding the threat, finish
one having healed more than anybody dealt. Some are about the record — ten
pulls in, five classes played, all nine.

Each is one pure function of the pull that just ended and the record kept
before it, so an award is a rule you can read rather than a flag somebody
remembered to set. They are judged after the record is written, since several
of them are about the record rather than about the pull, and the simulation
does not know they exist — which is what stops one from ever changing how a
pull plays out.

The locked ones are drawn too, saying what they want. An award you cannot see
the shape of is not something to go and do; it is a surprise you either had or
did not. A newly earned one is announced over the results screen and fades on
its own, because the only input on that screen is the two buttons and a banner
that needed dismissing would be a third.

## The record

`RECORD` on the front page keeps the meter, pull by pull. Newest at the top:
a line saying whether it was a kill and what raid it was, and under it the
board exactly as it stood when the fight ended — ranked, with the bars, your
own row picked out. Above them is the night rather than the pull: how many
pulls, how many kills, the best you have personally managed and the best
anybody has.

The meter is the thing anyone actually reads during a fight and the thing they
argue about afterwards, so the record is the meter. It writes itself at the
moment a pull resolves and there is nothing to press.

The ranking lives in one place and both use it, because a record that
disagreed with the meter it came from would eventually be two different
answers to the same question. Nine rows a pull and twenty pulls kept — your
own row survives the cap however it placed, since a board you dropped off the
bottom of does not answer the question you opened it for. A row that does not
parse is dropped and the rest still reads, and nothing in a fight can see any
of it.

## Installable and offline

The game ships as a PWA. Everything runs client-side, so once it is cached
there is nothing left to be online for — it is fully playable in airplane mode.

Freshness is handled in two layers, because a cache-first PWA will happily
serve a build that was replaced weeks ago:

- the worker fetches the page itself network-first, with a 3s timeout falling
  back to the cached shell, so a launch with any connection at all gets the
  current build. Hashed assets stay cache-first — a changed file has a
  different name, so a hit can never be stale.
- `sw.js` is registered with `updateViaCache: 'none'` and updated on load, and
  the page reloads once when a new worker takes over. The first visit is
  excluded, so nobody gets bounced on arrival.

Icons are generated, not drawn: `python3 scripts/make-icons.py` renders them
from the same shapes the game uses. The PNGs are committed; rerun it only if
the palette changes.

## Development

```bash
npm run check        # types, then headless render pass, then balance harness
npm run harness      # win rate and puddle-uptime by attempt number
npm run rendercheck  # draws every frame against a stub canvas, asserts controls land on screen
npm run touchcheck   # pointer and key mapping, joystick vector, multi-touch, layout bounds
npm run pwacheck     # manifest, icons, precache list and offline shell (runs in build)
npm run visualcheck  # boots dist in a real browser, every boss, frames to shots/
npm run build
```

`visualcheck` exists because the checks assert on numbers — which catches a
control that never got drawn and cannot catch a frame that looks wrong. It
boots the built game in headless Chromium, walks into a pull on every boss by
the invite link, and writes frames to `shots/`. It also fails the run if the
page throws: every other check imports modules directly, so a fight that dies
on boot, on a missing asset or on a browser API the code assumed would pass
all of them, and that is the failure a player meets first.

```bash
npm run visualcheck -- out 1280 800   # a directory and a viewport
```

The harness is the main tool here. Tuning AI or balance without measuring it
produces party members that feel wrong in ways that are hard to name, so every
change to `ai.ts`, `boss.ts` or ability numbers should be followed by a run.

Since the party is now chosen, the harness runs several compositions —
including bad ones — with a deliberately mediocre scripted player, 60 runs per
cell. An earlier 24 was small enough that the noise read as a trend:

| Composition | 1st pull | 5th | 9th | avg time |
| --- | --- | --- | --- | --- |
| 1 tank, 1 healer, 3 damage | 35% | 60% | 68% | 150s |
| 1 tank, 2 healers, 2 damage | 0% | 3% | 8% | 238s |
| 1 tank, 0 healers, 4 damage | 0% | 0% | 0% | 77s |
| 0 tanks, 1 healer, 4 damage | 0% | 0% | 0% | 83s |
| all melee | 3% | 12% | 20% | 161s |
| all caster | 60% | 77% | 78% | 137s |
| druid tank, shaman healer | 37% | 58% | 73% | 143s |

Two of these are further apart than they should be, and are named here rather
than quietly left. **All-caster now beats all-melee by a wide margin**, because
melee pay for their range in ways a training dummy cannot see — they walk out
of puddles mid-rotation, lose uptime to it and die more — and the traits did
not change that. And **two healers no longer clears**: with healers answering
half again as much as they used to, what beat that composition was never the
healing, it was the damage check, and two dealers cannot make the enrage.

Two healers works but grinds against the 240s enrage. Dropping the tank or the
healer entirely does not work at all, which is the intended shape. All-melee is
still the worst real composition, for the same reason it is a bad idea in the
real thing — everyone is stacked in the one place the boss is aiming — but it
is no longer close to unplayable: weapons swing whether or not you are in
position to press anything, and melee are the ones carrying them, so a gap
that was fifty points on a first pull is thirty-three.

Battlegrounds are measured three ways, thirty matches each, because "is it
fair" and "does playing well matter" are different questions:

| | player | win% | avg time |
| --- | --- | --- | --- |
| The Three Cairns | driven by the AI | 57% | 198s |
| The Three Cairns | walks objectives, presses its filler | 37% | 215s |
| The Three Cairns | stands at the spawn | 20% | 192s |
| Ebb and Flow | driven by the AI | 27% | 85s |
| Ebb and Flow | walks objectives, presses its filler | 33% | 95s |
| Ebb and Flow | stands at the spawn | 10% | 69s |

The first row is the fairness check — the player's slot reasoning like
everyone else, so anything far from even is a rule that favours a side rather
than a party that played better. The rest is the point of the mode: standing
at the spawn loses The Three Cairns every single time, because a point pays
nobody while nobody is on it.

Ebb and Flow reads lower across the board because the scripted player is a
worse duellist than the AI it replaces — it presses one button on a loop — and
a flag match is decided by fights far more than a capture match is. Ten AI with
nobody in the player's slot come out at 52% and 58%.

One row per boss, same party, forty runs a cell. A boss inherits nothing from
the one before it — different mechanics land at different rates, so each has to
be measured rather than assumed to be in range:

| Boss | 1st pull | 5th | 9th | avg time | lost to enrage |
| --- | --- | --- | --- | --- | --- |
| The Drowned Warden | 33% | 50% | 73% | 126s | 0% |
| The Choir Beneath | 28% | 50% | 68% | 118s | 0% |
| The Tidebreaker | 13% | 43% | 68% | 203s | 22% |

The order is the point: a first pull gets harder down the list while a ninth
stays winnable, so each boss is a wall you learn rather than one you cannot
pass. The Tidebreaker is the only one that loses pulls to the enrage, which is
what the fight is — it has the most to dodge, and time spent dodging is damage
not dealt.

Tuning them showed the same cliff the difficulties did. Six thousand health on
the Choir, about a tenth, moved its first pull from 43% to 5%: it is a fight
that ends on healer mana, and mana either lasts to the kill or it does not.

Per-member detail for the default composition, `puddle uptime / units walked
per second`:

| Attempt | Bastion (warrior tank) | Wren (priest heal, timid) | Kestrel (hunter, greedy) | Vale (rogue, steady) |
| --- | --- | --- | --- | --- |
| 1st pull | 1.07% / 18 | 0.71% / 22 | 0.78% / 20 | 2.24% / 30 |
| 9th pull | 0.51% / 20 | 0.64% / 25 | 0.38% / 25 | 1.41% / 32 |

The player is not in the table. It is a scripted stand-in here rather than the
AI under test, and its puddle time would read as somebody's bad decision.

Two things are being watched here, and neither shows up in the win rate.

**Puddle uptime must stay ordered, on two axes.** Melee above ranged, since
standing next to the boss is standing where it aims — the rogue is reliably
the worst and always has been. Then, within a reach, greedy above timid: that
spread *is* the humanity layer, and if it flattens, personality has stopped
reaching the simulation.

The tank used to be lowest of anybody, which was true when it was the only
melee in the party and the rule was written from that. Classes gave the party
a rogue, weapons gave everybody a reason to stay in reach, and a threat table
made the tank hold a position rather than kite from it, so the tank now sits
where a melee sits — above both ranged, below the rogue. It still drags the
boss off a puddle rather than eating one to keep melee range (`ai.ts`, role
positioning), which is what keeps it under the rogue at half the uptime.

**Distance walked must stay low.** An earlier version had the party return to a
fixed home position whenever the floor cleared, and because that home was
defined relative to a moving boss, they chased it forever: the healer walked 70
units a second, pacing back and forth all fight. It looked busy and read as
broken. Movement is now only for danger and for genuinely being out of range.

## Icon art

The ability icons come from [game-icons.net](https://game-icons.net) under the
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) licence, recoloured
per school by `npm run atlas`. Attribution is a condition of that licence:

> Icons made by andymeneely, caro-asercion, darkzaitzev, delapouite,
> heavenly-dog, lorc, sbed, skoll, willdabeast and zeromancer.
> Available on https://game-icons.net

`art/icons.json` records which icon each ability uses and who drew it. It is a
committed decision rather than a build step — `npm run iconmatch` picks once,
a person reads the list, and the game is never one API call away from a
different icon set.


## Sprite art

The field bodies are built from [Liberated Pixel Cup](https://lpc.opengameart.org/)
parts by `npm run lpc`, which needs a checkout of the
[spritesheet repository](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
passed as `--lpc <dir>`.

The parts are variously CC-BY-SA 3.0, GPL 3.0, OGA-BY 3.0 and CC0. Attribution
is a condition of the first three, and share-alike of the first two, so the art
in this repository is under those terms. The credit list is in
`art/LPC-CREDITS.md` and is generated from the same definitions the layers come
from, so it cannot fall behind a change to the layer table.

## Hit effects

The impact animations come from the
[Superpowers asset packs](https://github.com/sparklinlabs/superpowers-asset-packs),
packed by `npm run fx -- --packs <a checkout>`. They are CC0: no attribution
required and no share-alike, which is the lightest licence anything here runs
under, so there is no credits file to go with them.

## The camera

The view sits behind the player and looks at whatever the mode is about — the
boss in a raid, the objective this player's own orders point at in a
battleground. Walking around that thing walks the camera around it, so you see
your own back and the thing you are working on stays at the top of the screen.

Two rules keep it from spreading into the rest of the code.

The rotation is applied in `worldToScreen` rather than as a canvas transform.
`ctx.rotate` would turn the glyphs with the floor, and every nameplate, damage
number and body sprite here is drawn axis-aligned on purpose.

And the stick is turned into world space in `input.ts`, before `step` is ever
called. The simulation never learns there is a camera, so a recorded input
replays into the same fight whichever way the view happened to be pointed. A
camera that reached inside the tick would have to be recorded with it.

## Projectiles

The bodies of the bolts in flight are DevWizard's
[Pixel Art Spells](https://opengameart.org/content/pixel-art-spells), also CC0,
packed by `npm run bolt -- --spells <the unpacked directory>`.

They are stored greyscale and tinted per ability at draw time, which is the
one thing to know before touching them. A projectile's colour comes from the
ability's own icon and is the only thing telling fifty-one spells apart in
flight, so a sprite with a colour baked in would send a frost bolt across the
arena in orange. Desaturating also freed the choice of shapes: picking only
sprites that happened to be drawn grey left three usable ones, one of which was
a beam segment.
