/**
 * Who drew what, on a screen inside the game.
 *
 * Attribution is a condition of most of the licences this game's art is under,
 * and a condition met only in the repository is a condition met for people who
 * read repositories. The build is what gets distributed, so the build has to
 * carry the names — which is the whole reason this file exists rather than the
 * two markdown files being enough.
 *
 * A summary rather than a copy. The per-piece lists in `art/LPC-CREDITS.md` and
 * `art/LPC-TERRAIN-CREDITS.md` are generated from the definitions the art is
 * cut from and run to seventy lines; what belongs on a screen is every name and
 * every licence, once. `npm run artcheck` fails if this file and those two
 * disagree, so the screen cannot fall behind the art.
 *
 * Names are copied exactly as the sets record them, including two spellings of
 * the same person and one upstream typo. Deciding that two spellings are one
 * person is a judgement about somebody else's name, and the safe direction is
 * to credit both.
 */

export interface ArtSet {
  /** What this set draws, in the game's own terms. */
  what: string
  set: string
  url: string
  /** Every licence any piece in the set is under. */
  licences: string[]
  /** Every name, as the set spells it. */
  authors: string[]
  /** Where the piece-by-piece list lives. */
  file: string
}

export const ART: ArtSet[] = [
  {
    what: 'The bodies on the field',
    set: 'Liberated Pixel Cup',
    url: 'https://lpc.opengameart.org/',
    licences: [
      'CC-BY 3.0',
      'CC-BY 3.0+',
      'CC-BY 4.0',
      'CC-BY-SA 3.0',
      'CC0',
      'GPL 2.0',
      'GPL 3.0',
      'OGA-BY 3.0',
      'OGA-BY 3.0+',
    ],
    authors: [
      'Benjamin K. Smith (BenCreating)',
      'Daniel Eddeland (daneeklu)',
      'Dr. Jamgo',
      'Durrani',
      'Eliza Wyatt (ElizaWy)',
      'ElizaWy',
      'ElizaWy; walk and down by JaidynReiman',
      'Evert',
      'JaidynReiman',
      'Joe White',
      'Johannes Sjölund (wulax)',
      'Luke Mehl',
      'Mandi Paugh',
      'Manuel Riecke (MrBeast)',
      'Matthew Krohn (Makrohn)',
      'Matthew Krohn (makrohn)',
      'Michael Whitlock (bigbeargames)',
      'MuffinElZangano',
      'Napsio',
      'Napsio (Vitruvian Studio)',
      'Nila122',
      'Pierre Vigier (pvigier)',
      'Radomir Dopieralski',
      'Sander Frenken (castelonia)',
      'Stephen Challener (Redshrike)',
      'TheraHedwig',
      'Tuomo Untinen (reemax)',
      'William.Thompsonj',
      'William.Thomsponj',
      'bluecarrot16',
      'dalonedrau',
      'gr3yh47',
      'kcilds/Rocetti/Eredah',
      'thecilekli',
    ],
    file: 'art/LPC-CREDITS.md',
  },
  {
    what: 'The floor and what stands on it',
    set: 'Liberated Pixel Cup tilesets',
    url: 'https://lpc.opengameart.org/',
    licences: [
      'CC-BY 3.0',
      'CC-BY-SA 3.0',
      'GPL 2.0',
      'GPL 3.0',
      'OGA-BY 3.0',
    ],
    authors: [
      'Casper Nilsson',
      'Lanea Zimmerman (AKA Sharm)',
    ],
    file: 'art/LPC-TERRAIN-CREDITS.md',
  },
]

/** Every name in the game, once, for a screen that lists them together. */
export function everyAuthor(): string[] {
  return [...new Set(ART.flatMap((set) => set.authors))].sort((a, b) => a.localeCompare(b))
}
