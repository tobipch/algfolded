/**
 * Reproducible before/after benchmark for the payload / startup work.
 *
 *   node scripts/bench.mjs <label>
 *
 * Builds nothing — run `npm run build` first. Writes
 * scripts/.bench/<label>.json and prints a summary. Compare two runs with
 *   node scripts/bench.mjs --compare before after
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'scripts', '.bench')
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const PORT = 4390

const DATA_FILES = ['edge_comms', 'corner_comms', 'parities_map', 'ltct_map',
  't2c_map', 'three_twists', 'edge_flips', 'corner_twists2']

const gz = (buf) => gzipSync(buf).length

// ---------- 1. source data ----------
const measureData = () => {
  const files = {}
  let raw = 0, gzip = 0, scrambles = 0
  for (const f of DATA_FILES) {
    const buf = readFileSync(join(ROOT, 'src/assets', f + '.json'))
    const j = JSON.parse(buf.toString())
    const n = Object.values(j).reduce((a, c) => a + (c.scrambles?.length ?? 0), 0)
    files[f] = { raw: buf.length, gzip: gz(buf), cases: Object.keys(j).length, scrambles: n }
    raw += buf.length; gzip += files[f].gzip; scrambles += n
  }
  return { files, totalRaw: raw, totalGzip: gzip, totalScrambles: scrambles }
}

// ---------- 2. built bundle ----------
const measureDist = () => {
  const dir = join(ROOT, 'dist/assets')
  if (!existsSync(dir)) return null
  const assets = {}
  let js = 0, jsGz = 0, css = 0, cssGz = 0, total = 0
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (!statSync(p).isFile()) continue
    const buf = readFileSync(p)
    const g = gz(buf)
    assets[name] = { raw: buf.length, gzip: g }
    total += buf.length
    if (name.endsWith('.js')) { js += buf.length; jsGz += g }
    if (name.endsWith('.css')) { css += buf.length; cssGz += g }
  }
  return { assets, js, jsGz, css, cssGz, total }
}

// ---------- 3. dependencies ----------
const measureDeps = () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const dirSize = (p) => {
    if (!existsSync(p)) return 0
    let n = 0
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const q = join(d, e.name)
        if (e.isDirectory()) walk(q)
        else if (e.isFile()) n += statSync(q).size
      }
    }
    walk(p)
    return n
  }
  const deps = Object.keys(pkg.dependencies ?? {})
  const installed = Object.fromEntries(
    deps.map((d) => [d, dirSize(join(ROOT, 'node_modules', d))]))
  return {
    count: deps.length,
    devCount: Object.keys(pkg.devDependencies ?? {}).length,
    installedBytes: Object.values(installed).reduce((a, b) => a + b, 0),
    installed,
  }
}

// ---------- 4. tests ----------
const measureTests = () => new Promise((res) => {
  // stderr must be drained too, or vitest's progress output wedges the pipe.
  const p = spawn('npx', ['vitest', 'run', '--reporter=json'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
  let out = ''
  p.stdout.on('data', (d) => { out += d })
  p.on('close', () => {
    try {
      const j = JSON.parse(out.slice(out.indexOf('{')))
      res({ files: j.testResults?.length ?? 0, tests: j.numTotalTests, passed: j.numPassedTests })
    } catch { res({ files: 0, tests: 0, passed: 0, error: true }) }
  })
})

const countLines = (dir, testOnly) => {
  let n = 0
  const walk = (d) => {
    if (!existsSync(d)) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const q = join(d, e.name)
      if (e.isDirectory()) { walk(q); continue }
      if (!/\.(ts|js|vue)$/.test(e.name)) continue
      const isTest = e.name.includes('.test.')
      if (isTest !== testOnly) continue
      n += readFileSync(q, 'utf8').split('\n').length
    }
  }
  walk(dir)
  return n
}

const measureCoverageShape = () => Object.fromEntries(
  ['algsets', 'helpers', 'stores', 'components', 'views'].map((a) => [a, {
    code: countLines(join(ROOT, 'src', a), false),
    tests: countLines(join(ROOT, 'src', a), true),
  }]))

// ---------- 5. browser: transfer + timings ----------
const withServer = async (fn) => {
  // stdio: 'ignore' matters — vite preview logs every request, and an unread
  // stdout pipe fills up and wedges the server mid-benchmark.
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT)],
    { cwd: ROOT, stdio: 'ignore' })
  try {
    let up = false
    for (let i = 0; i < 60 && !up; i++) {
      await new Promise((r) => setTimeout(r, 500))
      try { up = (await fetch(`http://localhost:${PORT}/`)).ok } catch { /* not up yet */ }
    }
    if (!up) throw new Error(`vite preview auf Port ${PORT} nicht erreichbar`)
    return await fn()
  } finally {
    srv.kill('SIGKILL')
  }
}

// Playwright is deliberately NOT a project dependency — it's a heavy install
// for a script nobody needs to run in CI. Resolved from the project if present,
// otherwise from PLAYWRIGHT_DIR (an absolute path to a node_modules that has
// it; NODE_PATH doesn't work for ESM). Without it the script still reports
// data / bundle / dependency / test metrics.
const loadPlaywright = async () => {
  // playwright is CJS, so importing it by file URL yields { default: exports } —
  // unwrap so both resolution paths hand back the same shape.
  const unwrap = (m) => (m?.chromium ? m : m?.default)
  try { return unwrap(await import('playwright')) } catch { /* not in the project */ }
  const dir = process.env.PLAYWRIGHT_DIR
  if (!dir) return null
  try { return unwrap(await import(pathToFileURL(join(dir, 'playwright', 'index.js')).href)) }
  catch (e) { console.log('  PLAYWRIGHT_DIR gesetzt, Import fehlgeschlagen:', e.message); return null }
}

const measureBrowser = async () => {
  const pw = await loadPlaywright()
  if (!pw) {
    console.log('(playwright nicht auflösbar -> Browser-Messungen übersprungen)')
    return null
  }
  const browser = await pw.chromium.launch({ executablePath: CHROME })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    const page = await ctx.newPage()
    // `requestfinished` + sizes() reports the bytes that actually crossed the
    // wire and never blocks; awaiting response.body() can hang once the buffer
    // has been released.
    const seen = []
    page.on('requestfinished', async (req) => {
      if (!req.url().startsWith(`http://localhost:${PORT}`)) return
      let len = 0
      try { len = (await req.sizes()).responseBodySize } catch { /* gone */ }
      seen.push({ url: req.url().split('/').pop().split('?')[0], len })
    })
    const snap = () => ({
      requests: seen.length,
      bytes: seen.reduce((a, b) => a + b.len, 0),
      js: seen.filter((s) => s.url.endsWith('.js')).reduce((a, b) => a + b.len, 0),
    })

    // What the user actually waits for: navigation start -> the case grid has
    // content. Median of several cold loads (fresh context each time) so the
    // number isn't one lucky sample.
    const loadSamples = []
    for (let i = 0; i < 5; i++) {
      const c = await browser.newContext({ viewport: { width: 1400, height: 900 } })
      const p = await c.newPage()
      // Stamp the moment the first group card exists, measured in-page against
      // navigation start (performance.now() is relative to it).
      // `.group-grid-item` only renders once algset.loaded flips true, so it
      // marks "data arrived AND derived AND painted", not just shell paint.
      await p.addInitScript(() => {
        const tick = () => {
          if (document.querySelector('.group-grid-item')) window.__casesAt = performance.now()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'commit' })
      await p.waitForFunction(() => window.__casesAt !== undefined, { timeout: 30000 })
      loadSamples.push(await p.evaluate(() => window.__casesAt))
      await c.close()
    }
    loadSamples.sort((a, b) => a - b)
    const timeToCases = Math.round(loadSamples[Math.floor(loadSamples.length / 2)])

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(2500)
    const shell = snap()

    // count localStorage writes from here on
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem
      window.__w = []
      Storage.prototype.setItem = function (k, v) {
        window.__w.push({ k, bytes: String(v).length }); return orig.call(this, k, v)
      }
    })

    await page.locator('select:has(option[value="t2c"])').selectOption('t2c')
    await page.waitForTimeout(2000)
    const afterSwitch = snap()

    await page.getByText('All', { exact: true }).first().click()
    await page.waitForTimeout(400)
    await page.getByText('start', { exact: true }).first().click()
    await page.waitForTimeout(2000)
    const timer = snap()

    await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space')
    await page.waitForTimeout(1200)
    await page.keyboard.down('Space'); await page.waitForTimeout(200); await page.keyboard.up('Space')
    await page.waitForTimeout(4000)
    const firstSolve = snap()

    const writes = await page.evaluate(() => window.__w)

    // real localStorage read-modify-write cost at realistic history sizes
    const lsCost = await page.evaluate(() => {
      const mkStats = (n) => Array.from({ length: n }, (_, i) => ({
        i, key: 'UFR UBL LUF', scramble: "R U R' U' R U R' U' R U R' U'", ms: 3200 + i,
        clientId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', alg: "R U R' U'" }))
      const out = {}
      for (const [label, sets, own] of [['light', 0, 100], ['mid', 3, 300], ['heavy', 7, 1000]]) {
        const combined = {}
        for (let s = 0; s < sets; s++) combined['set' + s] = { stats: mkStats(own), keys: [], keysCount: {} }
        combined.active = { stats: mkStats(own), keys: [], keysCount: {}, upcoming: [] }
        // (a) shared key: read all, replace one slot, write all
        localStorage.setItem('bench_shared', JSON.stringify(combined))
        const shared = () => {
          const ex = JSON.parse(localStorage.getItem('bench_shared'))
          ex.active = combined.active
          localStorage.setItem('bench_shared', JSON.stringify(ex))
        }
        // (b) per-set key: write only the active set
        const perSet = () => localStorage.setItem('bench_active', JSON.stringify(combined.active))
        const reps = own >= 1000 ? 20 : 60
        try {
          for (let i = 0; i < 10; i++) { shared(); perSet() }
        } catch (e) { out[label] = { error: String(e).slice(0, 80) }; continue }
        let t = performance.now(); for (let i = 0; i < reps; i++) shared()
        const sharedMs = (performance.now() - t) / reps
        t = performance.now(); for (let i = 0; i < reps; i++) perSet()
        const perSetMs = (performance.now() - t) / reps
        out[label] = {
          sharedMs: +sharedMs.toFixed(2), perSetMs: +perSetMs.toFixed(2),
          sharedKb: Math.round(localStorage.getItem('bench_shared').length / 1024),
        }
        localStorage.removeItem('bench_shared'); localStorage.removeItem('bench_active')
      }
      return out
    })

    await ctx.close()
    return { timeToCases, loadSamples: loadSamples.map(Math.round), shell, afterSwitch, timer, firstSolve, lsCost,
      writes: { count: writes.length, byKey: writes.reduce((a, w) => {
        a[w.k] = a[w.k] || { n: 0, maxKb: 0 }
        a[w.k].n++; a[w.k].maxKb = Math.max(a[w.k].maxKb, Math.round(w.bytes / 1024))
        return a }, {}) } }
  } finally {
    await browser.close()
  }
}

const fmtKb = (b) => (b / 1024).toFixed(0) + 'K'
const fmtMb = (b) => (b / 1048576).toFixed(2) + 'M'

const step = (msg) => process.stderr.write(`  … ${msg}\n`)

const run = async (label) => {
  mkdirSync(OUT, { recursive: true })
  step('Daten')
  const data = measureData()
  step('dist')
  const dist = measureDist()
  step('Dependencies')
  const deps = measureDeps()
  step('Codezeilen')
  const shape = measureCoverageShape()
  step('Tests (vitest)')
  const tests = await measureTests()
  step('Browser (vite preview + chromium)')
  const browser = await withServer(measureBrowser)
  step('fertig')
  const result = { label, at: new Date().toISOString(), data, dist, deps, shape, tests, browser }
  writeFileSync(join(OUT, label + '.json'), JSON.stringify(result, null, 2))

  console.log(`\n=== ${label} ===`)
  console.log(`Daten            ${fmtMb(data.totalRaw)} roh / ${fmtKb(data.totalGzip)} gzip, ${data.totalScrambles} Scrambles`)
  if (dist) console.log(`dist             JS ${fmtKb(dist.js)} (${fmtKb(dist.jsGz)} gzip), CSS ${fmtKb(dist.css)}`)
  console.log(`Dependencies     ${deps.count} prod / ${deps.devCount} dev, ${fmtMb(deps.installedBytes)} installiert`)
  console.log(`Tests            ${tests.tests} in ${tests.files} Dateien`)
  if (browser) {
    console.log(`Zeit bis Fallliste ${browser.timeToCases} ms (Median von ${browser.loadSamples.length}: ${browser.loadSamples.join(', ')})`)
    console.log(`Transfer  Shell  ${fmtMb(browser.shell.bytes)} (${browser.shell.requests} Requests)`)
    console.log(`       1. Solve  ${fmtMb(browser.firstSolve.bytes)} (${browser.firstSolve.requests} Requests)`)
    console.log(`localStorage     geteilter Key vs. pro Set:`)
    for (const [k, v] of Object.entries(browser.lsCost))
      console.log(`   ${k.padEnd(6)} ${String(v.sharedMs).padStart(6)} ms  vs ${String(v.perSetMs).padStart(6)} ms   (Key ${v.sharedKb} KB)`)
    console.log(`Schreibvorgänge nach Boot: ${browser.writes.count}`)
  }
  console.log(`\n-> ${join('scripts/.bench', label + '.json')}`)
}

const compare = (a, b) => {
  const A = JSON.parse(readFileSync(join(OUT, a + '.json'), 'utf8'))
  const B = JSON.parse(readFileSync(join(OUT, b + '.json'), 'utf8'))
  const pct = (x, y) => (x === 0 ? '—' : ((y - x) / x * 100).toFixed(0) + '%')
  const row = (label, x, y, fmt = fmtKb) =>
    console.log(`${label.padEnd(34)} ${fmt(x).padStart(9)} -> ${fmt(y).padStart(9)}   ${pct(x, y).padStart(6)}`)
  const n = (x) => String(x)
  console.log(`\n${''.padEnd(34)} ${a.padStart(9)}    ${b.padStart(9)}   Delta`)
  console.log('-'.repeat(70))
  row('Daten roh', A.data.totalRaw, B.data.totalRaw, fmtMb)
  row('Daten gzip', A.data.totalGzip, B.data.totalGzip)
  row('Scrambles (Anzahl)', A.data.totalScrambles, B.data.totalScrambles, n)
  if (A.dist && B.dist) {
    row('dist JS roh', A.dist.js, B.dist.js, fmtMb)
    row('dist JS gzip', A.dist.jsGz, B.dist.jsGz)
  }
  if (A.browser && B.browser) {
    row('Zeit bis Fallliste (ms)', A.browser.timeToCases, B.browser.timeToCases, n)
    row('Transfer App-Shell', A.browser.shell.bytes, B.browser.shell.bytes, fmtMb)
    row('Transfer bis 1. Solve', A.browser.firstSolve.bytes, B.browser.firstSolve.bytes, fmtMb)
    row('Requests bis 1. Solve', A.browser.firstSolve.requests, B.browser.firstSolve.requests, n)
  }
  row('Dependencies (prod)', A.deps.count, B.deps.count, n)
  row('node_modules (prod-Deps)', A.deps.installedBytes, B.deps.installedBytes, fmtMb)
  row('Tests', A.tests.tests, B.tests.tests, n)
  row('Testdateien', A.tests.files, B.tests.files, n)
  for (const area of Object.keys(A.shape)) {
    row(`Testzeilen ${area}`, A.shape[area].tests, B.shape[area].tests, n)
  }
  if (A.browser && B.browser) {
    console.log('\nlocalStorage-Persist (ms pro Solve):')
    for (const k of Object.keys(A.browser.lsCost)) {
      console.log(`  ${k.padEnd(6)} ${String(A.browser.lsCost[k].sharedMs).padStart(6)} ms -> ${String(B.browser.lsCost[k].perSetMs).padStart(6)} ms`)
    }
  }
}

const [arg, x, y] = process.argv.slice(2)
if (arg === '--compare') compare(x, y)
else await run(arg || 'run')
