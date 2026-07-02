export const random_element = <T>(arr: readonly T[]): T => {
  return arr[Math.floor(Math.random() * arr.length)];
}

// shuffles array in place
export const shuffle = <T>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i+1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Maps a sticker (e.g. "UFL") to its scheme letter
export type ToLetter = (sticker: string) => string

export interface ParsedCaseKey {
    group: string
    target: string
    twist: string
    targetLetter: string
    twistLetter: string
    letters: string
}

// "UU UFL LUB" -> "UU-UFL LUB"
export const formatCaseKey = (key: string): string => {
    const [group, target, twist] = key.split(' ');
    return `${group}-${target} ${twist}`;
}

// Parse an LTCT key and translate pieces using the letter scheme
export const parseLtctKey = (key: string, toLetter: ToLetter): ParsedCaseKey => {
    const [group, target, twist] = key.split(' ')
    const targetLetter = toLetter(target)
    const twistLetter = toLetter(twist)
    return { group, target, twist, targetLetter, twistLetter, letters: targetLetter + twistLetter }
}

export function areSetsEqual<T>(setA: Set<T>, setB: Set<T>): boolean {
    return setA.size === setB.size && [...setA].every(item => setB.has(item));
}

// Case-insensitive search with optional wildcards: `*` matches any sequence,
// `?` matches a single character. Without wildcards it's a plain substring
// match; with wildcards the pattern must match the whole text.
export const matchesWildcard = (pattern: string, text: string): boolean => {
    const p = pattern.trim().toLowerCase()
    if (p === '') return true
    const t = text.toLowerCase()
    if (!p.includes('*') && !p.includes('?')) return t.includes(p)
    const rx = '^' + p.split('').map(ch =>
        ch === '*' ? '.*'
        : ch === '?' ? '.'
        : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ).join('') + '$'
    return new RegExp(rx).test(t)
}

// One-time migration of a renamed localStorage key (oldKey -> newKey).
// Copies the old value to the new key if the new key isn't set yet, then drops the old key.
export const migrateLocalStorageKey = (oldKey: string, newKey: string): void => {
    if (typeof localStorage === 'undefined' || !localStorage) return
    const oldVal = localStorage.getItem(oldKey)
    if (oldVal === null) return
    if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal)
    }
    localStorage.removeItem(oldKey)
}
