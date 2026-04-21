import {defineStore} from 'pinia'
import {ref} from 'vue'
import {invertMove, moveFace, moveAmount, amountToMove, buildMoveRemap} from '@/helpers/scramble_utils'
import {useDisplayStore} from '@/stores/DisplayStore'
import {useSettingsStore} from '@/stores/SettingsStore'

let kpuzzlePromise = null
async function getKPuzzle() {
    if (!kpuzzlePromise) {
        kpuzzlePromise = import('cubing/puzzles').then(m => m.puzzles['3x3x3'].kpuzzle())
    }
    return kpuzzlePromise
}

export const useBluetoothCubeStore = defineStore('bluetoothCube', () => {
    const connected = ref(false)
    const deviceName = ref(null)
    const battery = ref(null)

    // Scramble tracking
    const phase = ref('idle') // 'idle' | 'scrambling' | 'solving'
    const scrambleMoves = ref([])
    const position = ref(0)
    const correctionMoves = ref([])

    // Pending face turn: reactive so Scramble.vue can show orange state
    // { face: string, accumulated: number (quarter turns mod 4), moves: string[] }
    const pendingFaceTurn = ref(null)

    // Paused: when true, incoming cube moves are ignored
    const paused = ref(false)

    // Internal (not exposed)
    let cube = null
    let moveSubscription = null
    let infoSubscription = null
    let cubePattern = null
    let solvedPattern = null
    // expectedPatterns[k] = pattern after applying scrambleMoves[0..k-1] to solved.
    // Used by reconcileState() to snap position/corrections to the physical cube state.
    let expectedPatterns = []

    const computeExpectedPatterns = (kpuzzle) => {
        let p = kpuzzle.defaultPattern()
        expectedPatterns = [p]
        for (const m of scrambleMoves.value) {
            try { p = p.applyMove(m) } catch (_) {}
            expectedPatterns.push(p)
        }
    }

    // After every physical move, check whether the cube now matches any expected
    // scramble state near the current position. If it does, snap position and
    // clear correction/pending state — this makes slice moves, out-of-order
    // commuting moves, and other "noise" self-heal as soon as the cube reaches
    // a state consistent with the scramble.
    const reconcileState = () => {
        if (!cubePattern || expectedPatterns.length === 0) return
        // Fast path: already at the expected state for current position
        if (cubePattern.isIdentical(expectedPatterns[position.value])) {
            if (correctionMoves.value.length > 0) correctionMoves.value = []
            if (pendingFaceTurn.value !== null) pendingFaceTurn.value = null
            return
        }
        // Scan forward first (advance on matching state)
        for (let k = position.value + 1; k < expectedPatterns.length; k++) {
            if (cubePattern.isIdentical(expectedPatterns[k])) {
                position.value = k
                correctionMoves.value = []
                pendingFaceTurn.value = null
                if (position.value >= scrambleMoves.value.length) phase.value = 'solving'
                return
            }
        }
        // Scan backward (user undid previous moves)
        for (let k = position.value - 1; k >= 0; k--) {
            if (cubePattern.isIdentical(expectedPatterns[k])) {
                position.value = k
                correctionMoves.value = []
                pendingFaceTurn.value = null
                return
            }
        }
    }

    const connect = async () => {
        const display = useDisplayStore()
        try {
            if (!navigator.bluetooth) {
                display.showToast('Bluetooth is not supported in this browser', 'danger')
                return
            }
            const {connectSmartCube} = await import('btcube-web')
            cube = await connectSmartCube()
            connected.value = true
            deviceName.value = cube.device?.name || 'Smart Cube'

            // Listen for moves
            moveSubscription = cube.events.moves.subscribe(event => {
                onMove(event.move)
            })

            // Listen for battery/info
            infoSubscription = cube.events.info.subscribe(event => {
                if ('battery' in event) {
                    battery.value = event.battery
                }
            })

            // Handle disconnect
            cube.device?.addEventListener('gattserverdisconnected', () => {
                cleanupConnection()
                display.showToast('Smart cube disconnected', 'info')
            })

            display.showToast('Connected to ' + deviceName.value, 'success')
        } catch (e) {
            console.error('Bluetooth connect failed:', e)
            cleanupConnection()
            if (e?.name === 'NotFoundError') {
                display.showToast('No smart cube found. Make sure your cube is on and nearby.', 'danger')
            } else {
                display.showToast('Failed to connect: ' + (e?.message || 'Unknown error'), 'danger')
            }
        }
    }

    const disconnect = () => {
        const display = useDisplayStore()
        if (keyboardListener) {
            disconnectKeyboard()
            display.showToast('Keyboard simulator disconnected', 'info')
            return
        }
        if (cube) {
            try { cube.commands.disconnect() } catch (_) {}
        }
        cleanupConnection()
        display.showToast('Smart cube disconnected', 'info')
    }

    const cleanupConnection = () => {
        if (moveSubscription) { moveSubscription.unsubscribe(); moveSubscription = null }
        if (infoSubscription) { infoSubscription.unsubscribe(); infoSubscription = null }
        cube = null
        connected.value = false
        deviceName.value = null
        battery.value = null
        resetTracking()
    }

    const startTracking = async (scrambleString) => {
        if (!scrambleString) return
        scrambleMoves.value = scrambleString.split(' ').filter(m => m.length > 0)
        position.value = 0
        correctionMoves.value = []
        pendingFaceTurn.value = null
        phase.value = 'scrambling'

        // Track physical cube state from solved; solved detection triggers
        // when the cube returns to solved after scrambling + solving
        const kpuzzle = await getKPuzzle()
        solvedPattern = kpuzzle.defaultPattern()
        cubePattern = solvedPattern
        computeExpectedPatterns(kpuzzle)
    }

    const resetTracking = () => {
        phase.value = 'idle'
        scrambleMoves.value = []
        position.value = 0
        correctionMoves.value = []
        pendingFaceTurn.value = null
        paused.value = false
        cubePattern = null
        solvedPattern = null
        expectedPatterns = []
    }

    const pauseTracking = () => { paused.value = true }
    const resumeTracking = () => { paused.value = false }

    // Reset the virtual cube to its solved state and restart scramble tracking
    // from the beginning. Useful after the user did random moves (e.g. while paused)
    // and manually solved the cube again.
    const resetToSolved = async () => {
        const kpuzzle = await getKPuzzle()
        solvedPattern = kpuzzle.defaultPattern()
        cubePattern = solvedPattern
        position.value = 0
        correctionMoves.value = []
        pendingFaceTurn.value = null
        paused.value = false
        // Recompute expected patterns defensively, in case scrambleMoves has
        // drifted from the original (it shouldn't, since we no longer mutate it,
        // but this keeps the invariant airtight across resets).
        computeExpectedPatterns(kpuzzle)
        if (scrambleMoves.value.length > 0) {
            phase.value = 'scrambling'
        }
    }

    const advancePosition = () => {
        position.value++
        if (position.value >= scrambleMoves.value.length) {
            phase.value = 'solving'
        }
    }

    const onMove = (rawMove) => {
        if (paused.value) return

        // Remap move based on cube orientation setting
        const settings = useSettingsStore()
        const remap = buildMoveRemap(settings.store.cubeOrientation)
        const move = remap ? remap(rawMove) : rawMove

        // Track cube state in the user/scramble frame (remapped move). Slice
        // moves (M/S/E) and rotations are understood by cubing.js and will
        // update the pattern correctly.
        if (cubePattern) {
            try { cubePattern = cubePattern.applyMove(move) } catch (_) {}
        }

        if (phase.value === 'scrambling') {
            processScrambleMove(move)
            // State-based reconciliation: if the physical cube is in a valid
            // intermediate scramble state, snap to it and drop any noise
            // corrections. This is what makes slice moves and out-of-order
            // commuting moves self-heal.
            reconcileState()
        } else if (phase.value === 'solving') {
            if (cubePattern && solvedPattern && cubePattern.isIdentical(solvedPattern)) {
                phase.value = 'idle'
            }
        }
    }

    const processScrambleMove = (move) => {
        // Priority 1: Pending face turn (forward or backward)
        if (pendingFaceTurn.value) {
            const pending = pendingFaceTurn.value
            const isBackward = pending.direction === 'backward'
            const expected = isBackward
                ? invertMove(scrambleMoves.value[position.value - 1])
                : scrambleMoves.value[position.value]

            if (moveFace(move) === pending.face) {
                const newAcc = (pending.accumulated + moveAmount(move)) % 4
                if (newAcc === moveAmount(expected)) {
                    pendingFaceTurn.value = null
                    if (isBackward) {
                        position.value--
                    } else {
                        advancePosition()
                    }
                } else if (newAcc === 0) {
                    pendingFaceTurn.value = null
                } else {
                    pendingFaceTurn.value = {
                        ...pending,
                        accumulated: newAcc,
                        moves: [...pending.moves, move]
                    }
                }
            } else {
                const pendingMoves = pending.moves
                pendingFaceTurn.value = null
                for (const m of pendingMoves) {
                    correctionMoves.value.push(invertMove(m))
                }
                processScrambleMove(move)
            }
            return
        }

        // Priority 2: Corrections (immediate merge for same-face moves)
        if (correctionMoves.value.length > 0) {
            const last = correctionMoves.value[correctionMoves.value.length - 1]
            if (move === last) {
                correctionMoves.value.pop()
            } else if (moveFace(move) === moveFace(last)) {
                const merged = (moveAmount(last) + moveAmount(invertMove(move))) % 4
                if (merged === 0) {
                    correctionMoves.value.pop()
                } else {
                    correctionMoves.value[correctionMoves.value.length - 1] =
                        amountToMove(moveFace(last), merged)
                }
            } else {
                correctionMoves.value.push(invertMove(move))
            }
            return
        }

        // Priority 3: Normal scramble matching
        if (position.value < scrambleMoves.value.length) {
            const expected = scrambleMoves.value[position.value]
            if (move === expected) {
                advancePosition()
            } else if (moveFace(move) === moveFace(expected)) {
                pendingFaceTurn.value = {
                    face: moveFace(move),
                    accumulated: moveAmount(move),
                    moves: [move],
                    direction: 'forward'
                }
            } else {
                // Out-of-order / unrelated move: record as a correction.
                // Opposite-face swap is no longer done in-place (it mutated
                // scrambleMoves and bled state across resetToSolved). Instead
                // reconcileState() snaps position forward when the physical
                // cube state matches a later expectedPattern — which covers
                // arbitrary commuting-move reorderings, not just opposite-face
                // adjacent swaps.
                if (tryBackward(move)) return
                correctionMoves.value.push(invertMove(move))
            }
        }
    }

    // Check if move undoes the previous scramble move (go backward)
    const tryBackward = (move) => {
        if (position.value === 0) return false
        const prevMove = scrambleMoves.value[position.value - 1]
        const undoMove = invertMove(prevMove)
        if (move === undoMove) {
            position.value--
            return true
        }
        if (moveFace(move) === moveFace(undoMove)) {
            pendingFaceTurn.value = {
                face: moveFace(move),
                accumulated: moveAmount(move),
                moves: [move],
                direction: 'backward'
            }
            return true
        }
        return false
    }

    // Keyboard simulator for testing without a real cube
    let keyboardListener = null

    const connectKeyboard = () => {
        if (keyboardListener) return
        connected.value = true
        deviceName.value = 'Keyboard Simulator'
        battery.value = 100

        const keyMap = {
            'r': 'R', 'l': 'L', 'u': 'U', 'd': 'D', 'f': 'F', 'b': 'B',
            'R': "R'", 'L': "L'", 'U': "U'", 'D': "D'", 'F': "F'", 'B': "B'",
        }

        keyboardListener = (e) => {
            let move = null
            const lower = e.key.toLowerCase()
            if (e.ctrlKey && 'rludfb'.includes(lower)) {
                move = lower.toUpperCase() + '2'
            } else {
                move = keyMap[e.key]
            }
            if (move && (phase.value === 'scrambling' || phase.value === 'solving')) {
                e.preventDefault()
                e.stopPropagation()
                onMove(move)
            }
        }
        window.addEventListener('keydown', keyboardListener, true) // capture phase
        console.log(
            '%cKeyboard cube simulator active!',
            'color: #0d6efd; font-weight: bold',
            '\n  r/l/u/d/f/b = clockwise',
            '\n  R/L/U/D/F/B (shift) = prime',
            '\n  Ctrl+r/l/u/d/f/b = double (R2, L2, ...)',
            '\n  Disconnect: window.btSim.disconnect()'
        )
    }

    const disconnectKeyboard = () => {
        if (keyboardListener) {
            window.removeEventListener('keydown', keyboardListener, true)
            keyboardListener = null
        }
        connected.value = false
        deviceName.value = null
        battery.value = null
        resetTracking()
    }

    // Expose internals for btSim (set up after store return)
    const _getInternals = () => ({ connectKeyboard, disconnectKeyboard, onMove })

    return {
        connected, deviceName, battery,
        phase, scrambleMoves, position, correctionMoves, pendingFaceTurn, paused,
        connect, disconnect, startTracking, resetTracking,
        pauseTracking, resumeTracking, resetToSolved, _getInternals
    }
})

// Expose keyboard simulator on window at module load time (no store instantiation needed)
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'btSim', {
        get() {
            const store = useBluetoothCubeStore()
            const { connectKeyboard, disconnectKeyboard, onMove } = store._getInternals()
            return {
                connect: connectKeyboard,
                disconnect: disconnectKeyboard,
                move: (m) => onMove(m),
            }
        },
        configurable: true
    })
}
