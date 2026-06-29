export const random_element = arr => {
  return arr[Math.floor(Math.random() * arr.length)];
}

// shuffles array in place
export const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i+1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// "UU UFL LUB" -> "UU-UFL LUB"
export const formatCaseKey = key => {
    const [group, target, twist] = key.split(' ');
    return `${group}-${target} ${twist}`;
}

// Parse an LTCT key and translate pieces using the letter scheme
// Returns { group, target, twist, targetLetter, twistLetter, letters }
export const parseLtctKey = (key, toLetter) => {
    const [group, target, twist] = key.split(' ')
    const targetLetter = toLetter(target)
    const twistLetter = toLetter(twist)
    return { group, target, twist, targetLetter, twistLetter, letters: targetLetter + twistLetter }
}

export function areSetsEqual(setA, setB) {
    return setA.size === setB.size && [...setA].every(item => setB.has(item));
}

// One-time migration of a renamed localStorage key (oldKey -> newKey).
// Copies the old value to the new key if the new key isn't set yet, then drops the old key.
export const migrateLocalStorageKey = (oldKey, newKey) => {
    if (typeof localStorage === 'undefined' || !localStorage) return
    const oldVal = localStorage.getItem(oldKey)
    if (oldVal === null) return
    if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal)
    }
    localStorage.removeItem(oldKey)
}