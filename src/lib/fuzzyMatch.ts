export interface FuzzyResult {
  match: boolean
  score: number
  indices: number[]
}

export function fuzzyMatch(query: string, target: string): FuzzyResult {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const indices: number[] = []
  let score = 0
  let qi = 0

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti)
      // Consecutive match bonus
      if (indices.length > 1 && indices[indices.length - 2] === ti - 1) {
        score += 2
      } else {
        score += 1
      }
      // Start-of-string or after separator bonus
      if (ti === 0 || t[ti - 1] === '/' || t[ti - 1] === '.' || t[ti - 1] === '-' || t[ti - 1] === '_') {
        score += 3
      }
      qi++
    }
  }

  if (qi < q.length) {
    return { match: false, score: 0, indices: [] }
  }
  return { match: true, score, indices }
}
