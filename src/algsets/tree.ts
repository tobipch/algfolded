import type { AlgCase, AlgsetLevel } from '@/algsets/types'

// A node in the rendered hierarchy. Leaf nodes (deepest level) carry a caseId.
export interface TreeNode {
  value: string        // this level's value, e.g. "UU"
  path: string[]       // full path to this node
  children: TreeNode[] // empty on leaf level
  caseId?: string      // set on leaf nodes
}

const sortValues = (values: string[], order?: string[]): string[] => {
  if (!order) return values
  const idx = new Map(order.map((v, i) => [v, i]))
  return [...values].sort((a, b) => (idx.get(a) ?? 1e9) - (idx.get(b) ?? 1e9))
}

// Number of leaf (case) nodes under a node (the node itself if it's a leaf).
export const countLeaves = (node: TreeNode): number =>
  node.caseId !== undefined ? 1 : node.children.reduce((sum, c) => sum + countLeaves(c), 0)

// Case ids of all leaves in traversal order (same order the tree renders).
export const flattenLeaves = (nodes: TreeNode[]): string[] => {
  const out: string[] = []
  const walk = (ns: TreeNode[]): void => {
    for (const n of ns) {
      if (n.caseId !== undefined) out.push(n.caseId)
      else walk(n.children)
    }
  }
  walk(nodes)
  return out
}

// Build the nested tree from flat cases, using each level's optional `order`.
// Assumes case.path.length === levels.length.
export const buildTree = (cases: AlgCase[], levels: AlgsetLevel[]): TreeNode[] => {
  const build = (subset: AlgCase[], depth: number, prefix: string[]): TreeNode[] => {
    const isLeafLevel = depth === levels.length - 1
    const groups = new Map<string, AlgCase[]>()
    for (const c of subset) {
      const v = c.path[depth]
      const bucket = groups.get(v)
      if (bucket) bucket.push(c)
      else groups.set(v, [c])
    }
    return sortValues([...groups.keys()], levels[depth].order).map((v): TreeNode => {
      const childCases = groups.get(v)!
      const path = [...prefix, v]
      return isLeafLevel
        ? { value: v, path, children: [], caseId: childCases[0].id }
        : { value: v, path, children: build(childCases, depth + 1, path) }
    })
  }
  return build(cases, 0, [])
}
