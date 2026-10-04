import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'

/**
 * No name, place or line on the screen is the source's.
 *
 * The bosses were named in this game's own words from the start; the people
 * standing in the halls, the trash, the gunship's crew and a few rooms were not
 * -- they carried the source's names and, for seven of them, its lines word for
 * word. The owner decided on 2026-10-04 that what reaches the screen is this
 * game's (the risk of the source's words lands on a person, not on the site),
 * and this is the line held: every string literal under `src/` and, when there
 * is a build, every string in the bundle, against the list below.
 *
 * Comments are not strings. Where a number came from is still written next to
 * it, with the source's names in it, and that is the point of those comments.
 *
 * The list is the source's coinages plus the exact names this game used to
 * carry. A plain English word ("Gargoyle", "Abomination") is not on it; the
 * combination the source used ("Belfry Gargoyle") is.
 */

const COINED = [
  'Tirion', 'Fordring', 'Darion', 'Mograine', 'Arnath', 'Grondel', 'Crok', 'Scourgebane',
  'Finklestein', 'Aronen', 'Kunz', 'Grimtong', 'Halford', 'Ormus', 'Vadu', 'Torgo', 'Svalna',
  'Sindragosa', 'Arthas', 'Lich King', 'Icecrown', 'Frozen Throne', 'Frost Queen', "Shadow's Edge",
  'Argent', 'Ebon Blade', 'Scourge', 'Vrykul', 'Ymirjar', 'Darkfallen', 'Deathspeaker', 'Deathbound',
  'Frostwarden', 'Frostwing', 'Fleshreaper', 'Plagueworks', 'Skybreaker', "Kor'kron", 'Rimefang',
  'Spinestalker', "Nerub'ar", 'Marrowgar', 'Deathwhisper', 'Saurfang', 'Festergut', 'Rotface',
  'Putricide', "Lana'thel", 'Valanar', 'Keleseth', 'Taldaram', 'Valithria', 'Muradin', 'Garrosh',
  'Azeroth', 'Northrend', 'Warcraft', 'Frostmourne', 'Thrall',
]

// The exact names that were on the screen and are made of ordinary words.
const FORMER = [
  'The Damned', 'Servant of the Throne', 'Ancient Skeletal Soldier', 'Spire Gargoyle', 'Spire Minion',
  'Frenzied Abomination', 'Rotting Frost Giant', 'Blighted Abomination', 'Plague Scientist',
  'Pustulating Horror', 'Decaying Colossus', 'Stinky', 'Precious', 'Captain Brandon', 'Captain Rupert',
  'Goodman the', 'Scott the Merciful', 'Stefan', 'The Lower Spire', 'Crimson Hall', 'The Oratory',
  'The Sanctum', 'The Spire',
]

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const FORBIDDEN = new RegExp(`\\b(${[...COINED, ...FORMER].map(escape).join('|')})\\b`)

const root = process.cwd()
const found: string[] = []

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return files(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

const LITERAL = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
])

for (const path of files(resolve(root, 'src'))) {
  const text = readFileSync(path, 'utf8')
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
  const visit = (node: ts.Node): void => {
    // A key written bare (`Stinky: { ... }`) is a string in the bundle all the
    // same, and four of the trash were keyed that way.
    const bareKey = ts.isIdentifier(node) && node.parent !== undefined &&
      (ts.isPropertyAssignment(node.parent) || ts.isPropertySignature(node.parent)) && node.parent.name === node
    if (LITERAL.has(node.kind) || bareKey) {
      const value = bareKey ? (node as ts.Identifier).text : (node as ts.LiteralLikeNode).text
      const hit = FORBIDDEN.exec(value)
      if (hit) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart())
        found.push(`${path.slice(root.length + 1)}:${line + 1}: "${hit[1]}" in ${JSON.stringify(value.slice(0, 80))}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

// The build, when there is one: what actually ships, after every constant has
// been folded in.
const assets = resolve(root, 'dist/assets')
if (existsSync(assets)) {
  for (const name of readdirSync(assets).filter((n) => n.endsWith('.js'))) {
    const text = readFileSync(join(assets, name), 'utf8')
    const hit = FORBIDDEN.exec(text)
    if (hit) found.push(`dist/assets/${name}: "${hit[1]}" near ${JSON.stringify(text.slice(Math.max(0, hit.index - 40), hit.index + 40))}`)
  }
}

if (found.length > 0) {
  console.error(`namecheck: ${found.length} of the source's names on the screen`)
  for (const line of found.slice(0, 40)) console.error(`  ${line}`)
  process.exit(1)
}
console.log('namecheck: no name, place or line on the screen is the source\'s')
