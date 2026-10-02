# Art licences

The MIT licence in `LICENSE` covers the code. It does not cover the art. Every
picture the game draws comes from one of the sets below and stays under that
set's own terms. Nothing in the build was drawn for this game.

| Set | What it draws | Licences | Authors | Piece by piece |
| --- | --- | --- | --- | --- |
| [Liberated Pixel Cup](https://lpc.opengameart.org/) | The bodies on the field (`public/art/lpc.webp`) | CC-BY 3.0, CC-BY 3.0+, CC-BY 4.0, CC-BY-SA 3.0, CC-BY-SA 4.0, CC0, GPL 2.0, GPL 3.0, OGA-BY 3.0, OGA-BY 3.0+, OGA-SA 3.0 | 39 names | [`LPC-CREDITS.md`](LPC-CREDITS.md) |
| [Liberated Pixel Cup tilesets](https://lpc.opengameart.org/) | The floor and what stands on it (`public/art/props.webp`) | CC-BY 3.0, CC-BY-SA 3.0, GPL 2.0, GPL 3.0, OGA-BY 3.0 | Casper Nilsson, Lanea Zimmerman (AKA Sharm) | [`LPC-TERRAIN-CREDITS.md`](LPC-TERRAIN-CREDITS.md) |
| [game-icons.net](https://game-icons.net) | The ability icons (`public/art/icons.webp`, `art/svg/`), recoloured | CC-BY 3.0 | andymeneely, caro-asercion, darkzaitzev, delapouite, heavenly-dog, lorc, sbed, skoll, willdabeast, zeromancer | [`icons.json`](icons.json) |
| [Superpowers asset packs](https://github.com/sparklinlabs/superpowers-asset-packs) | The hits landing (`public/art/fx.webp`) | CC0 | — | — |
| [Pixel Art Spells](https://opengameart.org/content/pixel-art-spells) | The bolts in flight (`public/art/bolt.webp`) | CC0 | DevWizard | — |

Where a piece is offered under more than one licence, it may be used under any
one of them. Attribution is a condition of every licence here except CC0, and
share-alike of CC-BY-SA, GPL and OGA-SA: a changed copy of those pieces has to
be offered under the same terms.

The in-game credits screen carries the same sets, names and licences, from
`src/credits.ts`. `npm run artcheck` fails if this table, that file, the three
credit lists and the art itself disagree.
