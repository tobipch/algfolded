import type { Algset } from '@/algsets/types'
import { ltct } from '@/algsets/ltct'
import { threeTwists } from '@/algsets/three_twists'
import { cornerComms, edgeComms } from '@/algsets/commutators'

// The list of all available algsets (this order drives the set picker). Adding
// a new set = add its data file and append its definition here.
export const ALGSETS: Algset[] = [cornerComms, edgeComms, threeTwists, ltct]

export const DEFAULT_ALGSET_ID = 'ltct'

export const getAlgset = (id: string): Algset | undefined =>
  ALGSETS.find((a) => a.id === id)
