import { describe, it, expect } from 'vitest'
import { buildTree } from './tree'
import type { AlgCase, AlgsetLevel } from './types'

const levels: AlgsetLevel[] = [
  { id: 'group', display: (v) => ({ primary: v }), order: ['UU', 'UD'] },
  { id: 'subgroup', display: (v) => ({ primary: v }), order: ['UBL', 'UFL'] },
  { id: 'case', display: (v) => ({ primary: v }) },
]

const mk = (id: string): AlgCase => ({ id, path: id.split(' '), algs: [], scrambles: [] })

describe('buildTree', () => {
  it('nests by path and sorts each level by its order', () => {
    const cases = [mk('UD UFL X'), mk('UU UFL B'), mk('UU UBL A')]
    const tree = buildTree(cases, levels)

    expect(tree.map((n) => n.value)).toEqual(['UU', 'UD']) // group order honored

    const uu = tree[0]
    expect(uu.children.map((n) => n.value)).toEqual(['UBL', 'UFL']) // subgroup order honored
  })

  it('leaf nodes carry the case id and have no children', () => {
    const tree = buildTree([mk('UU UBL A')], levels)
    const leaf = tree[0].children[0].children[0]
    expect(leaf.caseId).toBe('UU UBL A')
    expect(leaf.children).toEqual([])
  })

  it('values without an order entry sort after ordered ones', () => {
    const tree = buildTree([mk('ZZ UBL A'), mk('UU UBL A')], levels)
    expect(tree.map((n) => n.value)).toEqual(['UU', 'ZZ'])
  })
})
