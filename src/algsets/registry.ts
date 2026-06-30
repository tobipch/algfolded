import type { Algset } from '@/algsets/types'
import { ltct } from '@/algsets/ltct'

// The list of all available algsets. Adding a new set = add its data file
// and append its definition here.
export const ALGSETS: Algset[] = [ltct]

export const DEFAULT_ALGSET_ID = 'ltct'

export const getAlgset = (id: string): Algset | undefined =>
  ALGSETS.find((a) => a.id === id)
