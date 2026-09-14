// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

// A table the API queries but scripts/setup_db.mjs never creates is invisible
// in every test and in the build: it only shows up in production as a 500 from
// the endpoint that touches it (that is how /api/presets shipped without
// user_presets existing). This suite pins the two sides together.
const root = fileURLToPath(new URL('../..', import.meta.url))

const tsFilesIn = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...tsFilesIn(path))
    else if (entry.endsWith('.ts')) out.push(path)
  }
  return out
}

const createdTables = (): Set<string> => {
  const sql = readFileSync(join(root, 'scripts/setup_db.mjs'), 'utf8')
  const names = new Set<string>()
  for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) names.add(m[1])
  return names
}

// Only uppercase keywords count, so prose in a comment ("follow the user from
// device to device") is not mistaken for a query. `UPDATE` needs the SET to
// tell a real UPDATE from the tail of `ON DUPLICATE KEY UPDATE col = …`.
const TABLE_REF = /\b(?:FROM|INTO|JOIN)\s+(\w+)|\bUPDATE\s+(\w+)\s+SET\b/g

const usedTables = (): Map<string, string[]> => {
  const used = new Map<string, string[]>()
  for (const file of tsFilesIn(join(root, 'api'))) {
    const source = readFileSync(file, 'utf8')
    for (const m of source.matchAll(TABLE_REF)) {
      const table = m[1] ?? m[2]
      const where = file.slice(root.length)
      used.set(table, [...(used.get(table) ?? []), where])
    }
  }
  return used
}

describe('api tables and scripts/setup_db.mjs', () => {
  it('creates every table the API queries', () => {
    const created = createdTables()
    const missing = [...usedTables()].filter(([table]) => !created.has(table))
    expect(missing.map(([table, files]) => `${table} (${[...new Set(files)].join(', ')})`)).toEqual([])
  })

  it('finds the tables at all', () => {
    // Guards the regexes above: if either stops matching, the first test
    // passes vacuously and stops protecting anything.
    expect(createdTables()).toContain('user_presets')
    expect([...usedTables().keys()]).toContain('user_presets')
  })
})
