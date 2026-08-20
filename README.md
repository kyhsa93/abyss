# Abyss

**[Play it](https://kyhsa93.github.io/abyss/)**

A browser raid-boss prototype. You pick one of fifteen specs, the rest of a
five, ten or twenty-five player raid is rolled around you, and everybody in it
but you is AI. No assets, no server, no network: everything is shapes, timers
and a deterministic simulation.

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

On the raid screen: pick a boss, a size (5, 10 or 25) and a difficulty. Then
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

## Why it looks like this

Hardcore raiders barely look at boss models. They watch timer bars, debuff
icons and raid frames. The information a raid encounter actually runs on is
already abstract, so this prototype renders exactly that and nothing else.

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
damage shortens the fight rather than adding survival — 25-player normal wins
10% of first pulls rising to 70%, against a five-man's 30% to 60%.

Mechanics scale with headcount. A fixed number of puddles across twenty-five
players means any one player is almost never targeted, so without scaling the
bigger raid would be the easier one — puddles and spread marks both go up with
the roster, and adds come in larger waves.

Boss health is not linear with headcount either: larger groups lose
proportionally more time to mechanics, so a flat multiple per player would
again make 25 the soft option.

**Heroic raises boss health and nothing else**, which sounds thin and is not.
Tuning it revealed that fight length *is* the difficulty here: time spent
dodging is damage not dealt, which lengthens the fight, which brings round
more mechanics and drains more healer mana. Every attempt to also raise damage
or mechanic frequency took the win rate from 80% to 0% with nothing in
between — survival turns out to be a cliff, not a slope. It holds until
healing throughput is exceeded, then collapses.

| | 1st pull | 9th pull |
| --- | --- | --- |
| 5-player normal | 30% | 60% |
| 5-player heroic | 0% | 0% |
| 10-player normal | 65% | 95% |
| 10-player heroic | 10% | 75% |
| 25-player normal | 10% | 70% |
| 25-player heroic | 0% | 20% |

Five-man heroic is the hardest thing in the game, and the harness has never
won one: the same difficulty multipliers with none of the slack a larger
roster brings.

## Battlegrounds

Two of them, five against five, on the same floor with the same classes. The
party screen's first row picks what PULL does: the raid, or one of these.

| | Winning is | Ends at |
| --- | --- | --- |
| The Three Cairns | hold ground, and the clock does the rest | 400 points, or 300s |
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

The one rule that took rewriting is a leash. Left alone, defenders chased
kiting casters off the point they were defending — which concedes the point
and costs the caster nothing — so a goal now carries a radius, and inside a
capture circle the fight happens on the circle. A flag has no such radius:
whoever is carrying it *is* the objective, and following them across the map
is the correct play.

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
| Hunter | | | ✓ |
| Rogue | | | ✓ |

Fifteen combinations in all, and the raid screen lists them individually
rather than asking you to pick a class and then a role.

Rotations are shared per role; what differs is the numbers and the cast times.
That is enough to change how something plays — the hunter is entirely instant
and keeps damaging while it repositions, the mage's finisher is a 2.5s cast
that competes directly with dodging, and the rogue has to be next to the boss
to do anything at all, which is why it is reliably the one standing in fire.

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

**A warrior charges.** Both specs carry it: it crosses up to 260 units to
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

**Only your own numbers float.** What you dealt and what landed on you —
either end counts as yours. Twenty-four other people trading hits is a wall of
numbers over a fight whose actual state is already on the party frames and the
meter, which is the same reason only your own hits make a sound. The report at
the end still counts everything.

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

Three of them, fought in order. A kill puts a **NEXT BOSS** button on the
results screen, to the left of PULL AGAIN, and taking it moves you on with the
pull count back at zero — the party's learning is learning *this* fight, and a
group that killed the first boss nine times has never seen the second one's
opening.

Killing a boss is what opens the next, not pressing the button: leaving
through CHANGE PARTY after a kill keeps the progress. Where you are and how
far you have got are stored apart, so going back to farm an earlier boss does
not lock the later ones away again. The party screen carries a row of them and
draws the ones you have not reached locked but named — what is left down there
is worth knowing.

| Boss | Asks for | Leans on |
| --- | --- | --- |
| The Drowned Warden | every mechanic, none of them often | all of them, gently |
| The Choir Beneath | stay apart, and out-heal the singing | spread, puddles, unavoidable damage |
| The Tidebreaker | come in, get behind, change target | shockwave, breath, adds |

They are one script and three tables (`src/sim/encounters.ts`). A second boss
written as a second timeline would be a second copy of what a shockwave does,
and that rule — the ring outruns you, so the answer is to already be inside —
took three attempts to get right. It is not being written twice.

What separates them is which mechanics they lean on and how hard the floor
hits. The Choir has no cone, no ring and no adds at all: its floor is busy and
its damage never stops, so it ends on healer mana. The Tidebreaker is the
opposite — almost nothing to stand in, and almost no time standing anywhere,
with a ring to run into, a cone to get behind and something new to hit every
time you have settled on a target. Its floor hits more than twice as hard as
the Warden's, because a mechanic you have room to dodge has to be worth
dodging.

| Mechanic | What it asks of you | Warden | Choir | Tidebreaker |
| --- | --- | --- | --- | --- |
| Slam | Tank cooldown, or the tank takes a large hit | ✓ | ✓ | ✓ |
| Puddles | Move out fast; the warning is short and they linger | ✓ | ✓ | rarely |
| Tidal Breath | A frontal cone — get out of the front, or behind it | ✓ | | ✓ |
| Shockwave | An expanding ring. It outruns you, so the answer is **in**, not out | ✓ | | ✓ |
| Spread | The target walks away from everyone else | ✓ | ✓ | |
| Thralls | Summoned adds beeline for the nearest body; dealers switch to them | ✓ | | ✓ |
| Crushing tide | Unavoidable party damage — the floor under the healer | ✓ | ✓ | ✓ |
| The boss itself | Faster than the whole party; you cannot outrun it | ✓ | ✓ | ✓ |
| Enrage | A hard damage check | 240s | 230s | 250s |

A cadence of zero disables a mechanic, which is how the table says a boss does
not have one. That is also where it went wrong first: the schedulers counted
down from zero and fired every tick instead of never, so the Tidebreaker
marked the whole raid for spread thirty times a second. Every scheduler checks
its own cadence now, and the render check plays each boss through to the end
and asserts that what reached the floor is what the table claims.

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
pulls in, five classes played, all eight.

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
npm run build
```

The harness is the main tool here. Tuning AI or balance without measuring it
produces party members that feel wrong in ways that are hard to name, so every
change to `ai.ts`, `boss.ts` or ability numbers should be followed by a run.

Since the party is now chosen, the harness runs several compositions —
including bad ones — with a deliberately mediocre scripted player, 60 runs per
cell. An earlier 24 was small enough that the noise read as a trend:

| Composition | 1st pull | 5th | 9th | avg time |
| --- | --- | --- | --- | --- |
| 1 tank, 1 healer, 3 damage | 37% | 53% | 73% | 126s |
| 1 tank, 2 healers, 2 damage | 28% | 60% | 67% | 224s |
| 1 tank, 0 healers, 4 damage | 0% | 0% | 2% | 80s |
| 0 tanks, 1 healer, 4 damage | 0% | 0% | 0% | 78s |
| all melee | 17% | 50% | 43% | 133s |
| all caster | 50% | 60% | 68% | 141s |
| druid tank, shaman healer | 17% | 43% | 53% | 127s |

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
| The Three Cairns | driven by the AI | 47% | 100s |
| The Three Cairns | walks objectives, presses its filler | 20% | 113s |
| The Three Cairns | stands at the spawn | 0% | 96s |
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
