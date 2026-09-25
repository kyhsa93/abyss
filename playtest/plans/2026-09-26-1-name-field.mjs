// One-off Playwright script, not a `.play` script: the name field is a real
// DOM <input> (src/render/nameinput.ts), and the .play vocabulary has no
// generic "type text" command -- only fixed keys (1-5, wasd, escape, r, m).
// docs/playtest.md invites exactly this case: "the vocabulary cannot say what
// you want to try, go around it."
//
// What this checks: src/render/nameinput.ts sets the native <input>'s
// `maxLength` to NAME_MAX (12), and the browser enforces maxLength by UTF-16
// *code unit*, not by Unicode code point. src/name.ts's `cleanName`, by
// contrast, slices by code point (`[...single].slice(0, NAME_MAX)`), which is
// exactly the fix README.md's "A name of your own" section describes ("cut to
// twelve characters rather than twelve code units, or a name of emoji comes
// out cut literally in half, into an unpaired surrogate"). If the DOM-level
// maxLength can truncate mid-surrogate-pair before cleanName ever sees the
// string, the fix that check protects does not reach the real input path.
//
// Run: node playtest/plans/2026-09-26-1-name-field.mjs

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

async function serve() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const port = 5200 + ((process.pid + attempt * 37) % 300)
    const child = spawn(
      'npx',
      ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], detached: true },
    )
    let log = ''
    let dead = false
    child.stdout?.on('data', (b) => (log += b.toString()))
    child.stderr?.on('data', (b) => (log += b.toString()))
    child.on('exit', () => (dead = true))
    const stop = () => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
      } catch {}
    }
    const url = `http://127.0.0.1:${port}/`
    const deadline = Date.now() + 40_000
    let up = false
    while (Date.now() < deadline && !dead) {
      try {
        const res = await fetch(url)
        if (res.ok) {
          up = true
          break
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250))
    }
    if (up) return { url, stop }
    stop()
    if (!log.includes('in use') && !dead) throw new Error(`vite did not come up on ${port}:\n${log}`)
  }
  throw new Error('no free port between 5200 and 5500')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Shots go outside the repo -- playtest/ commits its scripts, not its
// screenshots (see direction.md's #282 note: "playtest/ keeps no shots
// directory").
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const OUT = mkdtempSync(join(tmpdir(), 'playtest-name-field-'))
console.log('shots ->', OUT)

async function main() {
  const server = await serve()
  const context = await chromium.launchPersistentContext(resolve('playtest/profile'), {
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
    deviceScaleFactor: 1,
    headless: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('PAGE-ERROR', e.message.split('\n')[0]))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ws:\/\/|WebSocket|\[vite\]|HMR/i.test(m.text())) {
      console.log('CONSOLE-ERROR', m.text().slice(0, 200))
    }
  })

  try {
    await page.goto(server.url, { waitUntil: 'load' })
    await page.waitForFunction('window.__abyss !== undefined', null, { timeout: 20_000 })

    async function toPage(x, y) {
      const box = await page.locator('#stage').boundingBox()
      const logical = await page.evaluate('({ w: window.innerWidth, h: window.innerHeight })')
      return { x: box.x + (x / logical.w) * box.width, y: box.y + (y / logical.h) * box.height }
    }

    async function tapLabel(label) {
      const targets = await page.evaluate('window.__abyss.targets()')
      const hit = targets.find((t) => t.label === label) ?? targets.find((t) => t.label.startsWith(`${label}:`))
      if (!hit) {
        console.log('NO-SUCH-CONTROL', label, 'saw', targets.map((t) => t.label).join(','))
        return null
      }
      const p = await toPage(hit.x, hit.y)
      await page.touchscreen.tap(p.x, p.y)
      await sleep(150)
      return hit
    }

    async function fieldValue() {
      return await page.evaluate('document.querySelector("input")?.value ?? null')
    }
    async function storedName() {
      return await page.evaluate('localStorage.getItem("abyss.name")')
    }
    function hasLoneSurrogate(s) {
      if (s === null) return false
      // eslint-disable-next-line no-control-regex
      return /[\uD800-\uDFFF]/.test(s) && !/[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(s)
    }

    console.log('screen', await page.evaluate('window.__abyss.screen()'))
    await tapLabel('settings')
    console.log('screen', await page.evaluate('window.__abyss.screen()'))
    await page.screenshot({ path: `${OUT}/name-1-settings.png` })

    // --- Case 1: plain ASCII over the 12-character cap, both layers agree ---
    await tapLabel('name')
    console.log('editing (case1)?', await page.evaluate('document.querySelector("input") !== null'))
    await page.keyboard.insertText('a'.repeat(15))
    const afterAscii = await fieldValue()
    console.log('case1 field value:', JSON.stringify(afterAscii), 'len', afterAscii?.length)
    await page.keyboard.press('Enter')
    await sleep(150)
    console.log('case1 stored:', JSON.stringify(await storedName()))

    // --- Case 2: whitespace/control characters collapse and trim ---
    await tapLabel('name')
    await page.keyboard.insertText('  a\tb\n\nc  ')
    const afterWs = await fieldValue()
    console.log('case2 field value:', JSON.stringify(afterWs))
    await page.keyboard.press('Enter')
    await sleep(150)
    console.log('case2 stored:', JSON.stringify(await storedName()))

    // --- Case 3: whitespace-only falls back to the default ---
    await tapLabel('name')
    await page.keyboard.insertText('    ')
    await page.keyboard.press('Enter')
    await sleep(150)
    console.log('case3 stored (should be default "You"):', JSON.stringify(await storedName()))

    // --- Case 4: the one this is really here for. 11 ASCII chars (11 UTF-16
    // units) then one astral emoji (2 units) -- 13 units against a
    // maxLength=12 native <input>, which enforces by code unit. If the
    // browser truncates the insertion at the boundary instead of rejecting it
    // outright, the field's own value now holds an unpaired high surrogate
    // *before* cleanName ever runs.
    await tapLabel('name')
    await page.keyboard.insertText('a'.repeat(11))
    console.log('case4 after 11 ascii:', JSON.stringify(await fieldValue()))
    await page.keyboard.insertText('\u{1F600}') // 😀, U+1F600, a surrogate pair
    const afterEmoji = await fieldValue()
    console.log(
      'case4 field value after +emoji:',
      JSON.stringify(afterEmoji),
      'utf16-len',
      afterEmoji?.length,
      'lone surrogate in field?',
      hasLoneSurrogate(afterEmoji),
    )
    await page.screenshot({ path: `${OUT}/name-2-emoji-boundary.png` })
    await page.keyboard.press('Enter')
    await sleep(150)
    const case4Stored = await storedName()
    console.log(
      'case4 stored:',
      JSON.stringify(case4Stored),
      'code points',
      case4Stored === null ? 0 : [...case4Stored].length,
      'lone surrogate in stored?',
      hasLoneSurrogate(case4Stored),
    )
    await page.screenshot({ path: `${OUT}/name-3-emoji-committed.png` })

    // --- Case 5: thirteen whole emoji typed one at a time (26 UTF-16 units,
    // 13 code points) -- what a real emoji-picker keyboard sends, one grapheme
    // per tap, never mid-character. Says whether case 4's boundary needs an
    // odd-length prefix to trigger, or happens on any overflow.
    await tapLabel('name')
    for (let i = 0; i < 13; i++) {
      await page.keyboard.insertText('\u{1F600}')
    }
    const case5Field = await fieldValue()
    console.log(
      'case5 field value (13 emoji typed one at a time):',
      JSON.stringify(case5Field),
      'utf16-len',
      case5Field?.length,
      'lone surrogate?',
      hasLoneSurrogate(case5Field),
    )
    await page.keyboard.press('Enter')
    await sleep(150)
    const case5Stored = await storedName()
    console.log(
      'case5 stored:',
      JSON.stringify(case5Stored),
      'code points',
      case5Stored === null ? 0 : [...case5Stored].length,
      'lone surrogate?',
      hasLoneSurrogate(case5Stored),
    )
    await page.screenshot({ path: `${OUT}/name-4-thirteen-emoji.png` })

    // --- Case 6: the same 11-ASCII + emoji overflow, but via paste rather
    // than insertText. A physical/virtual keyboard sends whole characters, so
    // case 4 could not split a surrogate pair -- but a paste is browsers'
    // other text-insertion path, and some clamp a pasted value to `maxLength`
    // by slicing UTF-16 code units rather than rejecting the paste outright,
    // which is exactly how a surrogate pair gets cut in half.
    await tapLabel('name')
    await page.keyboard.insertText('a'.repeat(11))
    await page.evaluate('navigator.clipboard.writeText("\u{1F600}")')
    await page.keyboard.press('Control+v')
    await sleep(150)
    const afterPasteEmoji = await fieldValue()
    console.log(
      'case6 field value after pasting emoji onto 11 ascii:',
      JSON.stringify(afterPasteEmoji),
      'utf16-len',
      afterPasteEmoji?.length,
      'lone surrogate in field?',
      hasLoneSurrogate(afterPasteEmoji),
    )
    await page.screenshot({ path: `${OUT}/name-5-paste-boundary.png` })
    await page.keyboard.press('Enter')
    await sleep(150)
    const case6Stored = await storedName()
    console.log(
      'case6 stored:',
      JSON.stringify(case6Stored),
      'code points',
      case6Stored === null ? 0 : [...case6Stored].length,
      'lone surrogate in stored?',
      hasLoneSurrogate(case6Stored),
    )

    // --- Case 7: a long paste, all emoji, no ascii prefix -- the more
    // direct version of "a name of emoji comes out cut in half."
    await tapLabel('name')
    await page.evaluate('navigator.clipboard.writeText("\u{1F600}".repeat(13))')
    await page.keyboard.press('Control+v')
    await sleep(150)
    const case7Field = await fieldValue()
    console.log(
      'case7 field value after pasting 13 emoji:',
      JSON.stringify(case7Field),
      'utf16-len',
      case7Field?.length,
      'lone surrogate?',
      hasLoneSurrogate(case7Field),
    )
    await page.keyboard.press('Enter')
    await sleep(150)
    const case7Stored = await storedName()
    console.log(
      'case7 stored:',
      JSON.stringify(case7Stored),
      'code points',
      case7Stored === null ? 0 : [...case7Stored].length,
      'lone surrogate?',
      hasLoneSurrogate(case7Stored),
    )
    await page.screenshot({ path: `${OUT}/name-6-paste-thirteen.png` })

    // Leave the carried profile's name back at the default rather than a test
    // string, since this profile is reused by future sessions.
    await tapLabel('name')
    await page.keyboard.insertText('You')
    await page.keyboard.press('Enter')
    await sleep(150)
    console.log('reset stored:', JSON.stringify(await storedName()))
  } finally {
    await context.close()
    server.stop()
  }
}

main().catch((e) => {
  console.error('SCRIPT-THREW', e)
  process.exit(1)
})
