// Lightweight fuzzy subsequence matcher (no dependency). Returns a score >= 0
// when every character of `query` appears in `text` in order (higher = better:
// consecutive and word-start matches score more), or -1 when it doesn't match.
export const fuzzyScore = (text: string, query: string): number => {
  if (!query) return 0
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let ti = 0
  let score = 0
  let streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    let found = -1
    for (let i = ti; i < t.length; i++) {
      if (t[i] === ch) { found = i; break }
    }
    if (found === -1) return -1
    // reward matches at a word boundary and consecutive matches
    const atBoundary = found === 0 || /[\s/\-·]/.test(t[found - 1])
    streak = found === ti ? streak + 1 : 0
    score += 1 + (atBoundary ? 3 : 0) + streak
    ti = found + 1
  }
  return score
}
