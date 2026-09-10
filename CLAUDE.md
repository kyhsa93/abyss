# Working on this repo

Notes to whoever is editing this next, written after a round where the details
came one at a time from the person who had walked the place rather than from
anything in here. That is the failure this file exists to stop.

## Rooms, and anything else taken from the source

**Never read walkability off a picture.** The one mistake that cost this repo a
whole round: the first fight's floor was measured off the client's map tile,
correctly, and the circle that was measured turned out to be half floor and
half ice cliff. A map says where a shape is. It does not say what the shape
*is*, and the difference is a room twice the size it should be with a drop
across the middle of it.

So before a room is modelled or re-measured:

1. Read `docs/reading-the-source.md`. It has the sheets, the rulers, the
   measurements already taken, and the method.
2. Fetch the source's own map **and** a walkthrough of the place in words — a
   wiki or a raid guide describing how a group actually moves through it.
   Ramps, balconies, stairs, which side you come in by, what you cannot walk
   on: none of that is in the picture and all of it is in the prose.
3. Write down what you learned in `docs/reading-the-source.md` before writing
   any code with it, including anything a person told you. A fact that lives
   only in a conversation is a fact the next change gets wrong again.

## Numbers

**A number tuned by hand twice is a number that should be derived.** If you
find yourself running a check, nudging a constant, and running it again, stop
and make the constant come out of the thing it is really a function of. The
citadel's room positions used to be typed and are now derived from the rooms
and the ground between them; the marching formation's width is read off the
roster; the narrowest a room may be built is read off the raid that stands in
it.

**Every geometric promise gets a check.** `scripts/dungeoncheck.ts` is where
they live. A promise here is anything that would be a bug a player can see: no
floor is laid over a cliff, no step of the lower spire walks backwards, no two
rooms nothing joins touch. When a promise is checked, the number that satisfies
it can be moved by anybody without asking.

## Finishing a change

`npm run check` is the gate and it is slow — the balance sweep alone runs about
fifty minutes. Run the fast ones as you go (`tsc`, `dungeoncheck`,
`rendercheck`, `touchcheck`) and the sweep once at the end.

**Look at it.** The render path only runs in a browser, so a change to a room,
a shape or the HUD is not finished until it has been seen: `npx vite` and drive
it with Playwright (`node_modules/playwright`, Chromium is installed), or
`npm run visualcheck` for a contact sheet. Screenshots catch the things checks
do not.

**Come back with a result, not with a step.** Fetch, measure, build, check,
look, fix — the whole loop, then report. Decide the details yourself and say
which way you decided; ask only when the answer changes what the game *is*,
not when it changes a number a check can hold.

## Style

Comments explain *why*, and the reason a thing is not something else. Most
comments in this repo carry a mistake that was actually made — keep that: it is
what stops the mistake being made again. Docs and comments are in English; the
person who owns this repo is written to in Korean, and GitHub issues on it are
in Korean.
