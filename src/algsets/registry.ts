import type { Algset } from '@/algsets/types'
import { ltct } from '@/algsets/ltct'
import { t2c } from '@/algsets/t2c'
import { parities } from '@/algsets/parities'
import { threeTwists } from '@/algsets/three_twists'
import { cornerComms, edgeComms } from '@/algsets/commutators'
import { cornerTwists2, edgeFlips } from '@/algsets/flip_twist'

// The list of all available algsets (this order drives the set picker). Adding
// a new set = add its data file and append its definition here.
export const ALGSETS: Algset[] = [cornerComms, edgeComms, cornerTwists2, edgeFlips, threeTwists, ltct, t2c, parities]

export const DEFAULT_ALGSET_ID = 'commCorner'

// The set the pre-multi-algset (flat) localStorage data belonged to; legacy
// migrations must keep targeting it regardless of the default above.
export const LEGACY_ALGSET_ID = 'ltct'

export const getAlgset = (id: string): Algset | undefined =>
  ALGSETS.find((a) => a.id === id)
