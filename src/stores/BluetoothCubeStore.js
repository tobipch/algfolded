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
    // 'idle'          : nothing to track
    // 'scrambling'    : user is reproducing the scramble on the physical cube
    // 'awaiting_solve': letter-pair mode — virtual cube is already scrambled,
    //                   waiting for the first solving move (timer not started yet)
    // 'solving'       : tracking the solution; cube returning to solved ends it
    const phase = ref('idle')
    const scrambleMoves = ref([])
    const position = ref(0)
    const correctionMoves = ref([])

    // Pending face turn: reactive so Scramble.vue can show orange state
    // { face: string, accumulated: number (quarter turns mod 4), moves: string[] }
    const pendingFaceTurn = ref(null)

    // Paused: when true, incoming cube moves are ignored
    const paused = ref(false)

    // Letter-pair mode: true when the solving cube is far from solved (likely a
    // wrong alg), used to surface the "spin the bottom layer to reset" hint.
    const tooFarFromSolved = ref(false)
    // Bumped each time the user performs the reset gesture (a full 360° spin of
    // the bottom layer), so the UI can show a toast.
    const resetSignal = ref(0)
    // Bumped when the user performs the "help" gesture — a full 360° spin of the
    // left (L) layer — so the UI can reveal the current case's algorithm.
    const hintSignal = ref(0)

    // Moves of the finished solve, for algorithm detection. Set when the cube
    // reaches solved; consumed (and cleared) by the session store's stopTimer.
    const lastSolveMoves = ref(null)

    // Internal (not exposed)
    let solveMoves = []           // moves made since the solving phase began
    let cube = null               // underlying brand-specific connection object
    let cubeDisconnect = null     // brand-specific disconnect fn
    let gattDevice = null         // BluetoothDevice for gattserverdisconnected listener
    let subscriptions = []        // active event subscriptions ({ unsubscribe() })
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

    // The fully-scrambled state — where the solve (the algorithm) begins.
    const startPattern = () =>
        expectedPatterns.length > 0 ? expectedPatterns[expectedPatterns.length - 1] : null

    // Cube reached solved: freeze the executed moves for alg detection and
    // finish the attempt.
    const finishSolve = () => {
        lastSolveMoves.value = solveMoves.slice()
        solveMoves = []
        phase.value = 'idle'
    }

    // Hand the executed moves of the last finished solve to the caller
    // exactly once (avoids a stale sequence leaking into the next case).
    const consumeSolveMoves = () => {
        const moves = lastSolveMoves.value
        lastSolveMoves.value = null
        return moves
    }

    // --- Reset gesture + "too far from solved" detection (letter-pair mode) ---

    // Count how many edge/corner pieces (ignoring centers) are out of place
    // relative to solved. 0 = solved; a wrong LTCT alg leaves at least 3 off.
    const piecesOff = (pattern) => {
        try {
            const a = pattern.patternData, b = solvedPattern.patternData
            let off = 0
            for (const orbit in a) {
                if (/CENTER/i.test(orbit)) continue
                const oa = a[orbit], ob = b[orbit]
                for (let i = 0; i < oa.pieces.length; i++) {
                    if (oa.pieces[i] !== ob.pieces[i] || (oa.orientation[i] ?? 0) !== (ob.orientation[i] ?? 0)) off++
                }
            }
            return off
        } catch (_) {
            return 99 // if we can't tell, assume far so the hint can still show
        }
    }

    const FAR_IDLE_MS = 2000      // idle time before flagging a likely wrong alg
    const FAR_PIECES_THRESHOLD = 3 // minimum misplaced pieces to count as "far"
    let idleTimer = null
    const clearIdleTimer = () => { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null } }

    // After each solving move, (re)arm an idle check. If the user stops with the
    // cube clearly unsolved, surface the reset hint.
    const scheduleFarCheck = () => {
        clearIdleTimer()
        const settings = useSettingsStore()
        if (!settings.store.letterPairMode) return
        idleTimer = setTimeout(() => {
            idleTimer = null
            if (phase.value === 'solving' && cubePattern && solvedPattern
                && !cubePattern.isIdentical(solvedPattern)
                && piecesOff(cubePattern) >= FAR_PIECES_THRESHOLD) {
                tooFarFromSolved.value = true
            }
        }, FAR_IDLE_MS)
    }

    // Detect a full 360° spin of the bottom (D) or top (U) layer used as a
    // "reset this case" gesture: e.g. D D D D, D' D' D' D', D2 D2 (or the same
    // with U). These are all net-identity, so they never appear in real algs.
    // Returns true once a full spin completes. The buffer only ever holds moves
    // of a single face — switching faces (D→U or vice versa) starts over.
    let resetGestureMoves = []
    const checkResetGesture = (move) => {
        const face = moveFace(move)
        if (face !== 'D' && face !== 'U') { resetGestureMoves = []; return false }
        // Switching reset face starts the gesture over.
        if (resetGestureMoves.length > 0 && moveFace(resetGestureMoves[0]) !== face) {
            resetGestureMoves = []
        }
        resetGestureMoves.push(move)
        if (resetGestureMoves.length > 4) resetGestureMoves = resetGestureMoves.slice(-4)
        const last4 = resetGestureMoves.slice(-4)
        if (last4.length === 4 && (last4.every(m => m === face) || last4.every(m => m === face + "'"))) return true
        const last2 = resetGestureMoves.slice(-2)
        if (last2.length === 2 && last2.every(m => m === face + '2')) return true
        return false
    }

    // Detect a full 360° spin of the left (L) layer used as a "show me the
    // algorithm" gesture: L L L L, L' L' L' L', or L2 L2. Net-identity, so it
    // never appears in a real alg and leaves the cube state untouched.
    let hintGestureMoves = []
    const checkHintGesture = (move) => {
        if (moveFace(move) !== 'L') { hintGestureMoves = []; return false }
        hintGestureMoves.push(move)
        if (hintGestureMoves.length > 4) hintGestureMoves = hintGestureMoves.slice(-4)
        const last4 = hintGestureMoves.slice(-4)
        if (last4.length === 4 && (last4.every(m => m === 'L') || last4.every(m => m === "L'"))) return true
        const last2 = hintGestureMoves.slice(-2)
        if (last2.length === 2 && last2.every(m => m === 'L2')) return true
        return false
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

    // An unexpected drop (device powered off / out of range / the OS tearing
    // the link down when the page is backgrounded). Guard so it runs once.
    const onGattDisconnect = () => {
        if (!connected.value) return
        const display = useDisplayStore()
        cleanupConnection()
        display.showToast('Smart cube connection lost — tap the bluetooth icon to reconnect', 'danger')
    }

    // --- Connection liveness -------------------------------------------------
    // On mobile the OS can tear down the GATT link (e.g. during an app switch)
    // without always delivering the 'gattserverdisconnected' event, which would
    // leave the header showing "connected" while moves do nothing. Poll the GATT
    // state, and re-check the instant the page returns to the foreground.
    let livenessTimer = null
    const gattIsLive = () => !!(gattDevice && gattDevice.gatt && gattDevice.gatt.connected)
    const checkLiveness = () => {
        if (connected.value && gattDevice && !gattIsLive()) onGattDisconnect()
    }
    const startLivenessMonitor = () => {
        stopLivenessMonitor()
        livenessTimer = setInterval(checkLiveness, 3000)
    }
    const stopLivenessMonitor = () => {
        if (livenessTimer) { clearInterval(livenessTimer); livenessTimer = null }
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') checkLiveness()
        })
    }

    // GAN cubes derive their encryption key from the device MAC address. The
    // library auto-detects it from the BLE advertisement when possible; if that
    // fails it calls this provider as a last resort, where we ask the user.
    const ganMacProvider = async (device, isFallbackCall) => {
        if (!isFallbackCall) return null // let the library try auto-detection first
        const mac = window.prompt(
            'Enter your GAN cube MAC address (e.g. AB:CD:EF:12:34:56).\n' +
            'You can find it in the GAN / Cube Station app.'
        )
        const trimmed = (mac || '').trim()
        return /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(trimmed) ? trimmed : null
    }

    // Connect a MoYu / QiYi cube via btcube-web.
    const connectMoyu = async (display) => {
        const {connectSmartCube} = await import('btcube-web')
        patchRequestDevice()
        const c = await connectSmartCube()
        cube = c
        cubeDisconnect = () => { try { c.commands.disconnect() } catch (_) {} }
        connected.value = true
        deviceName.value = c.device?.name || 'Smart Cube'
        subscriptions.push(c.events.moves.subscribe(event => onMove(event.move)))
        subscriptions.push(c.events.info.subscribe(event => {
            if ('battery' in event) battery.value = event.battery
        }))
        gattDevice = c.device || null
        gattDevice?.addEventListener('gattserverdisconnected', onGattDisconnect)
        startLivenessMonitor()
        display.showToast('Connected to ' + deviceName.value, 'success')
    }

    // Web Bluetooth on non-Chromium browsers (notably Bluefy on iOS) is
    // fussy about requestDevice options in ways the cube libraries trip over:
    //   - the GAN library passes `optionalManufacturerData`, a Chromium-only
    //     member -> "Request payload could not be parsed";
    //   - the QiYi library lists a numeric 16-bit service UUID (0xFFF0),
    //     which iOS rejects -> immediate "Unknown error", no chooser;
    //   - name-prefix filters often reveal no device in the iOS chooser.
    // So on those browsers we rewrite the request to show every BLE device
    // (`acceptAllDevices`) with all services reachable via `optionalServices`
    // (numeric UUIDs normalized to canonical 128-bit strings). The user picks
    // the cube manually; the libraries then match it by name as before.
    // Chromium keeps the original filtered request untouched.

    // Warm the (large) cube-library chunks ahead of time. Called when the user
    // opens the connect menu, so that when they pick a brand the module is
    // already cached and requestDevice fires promptly within the click gesture
    // — otherwise the dynamic import's await can consume the user activation
    // and the browser's device chooser appears late (or not at all).
    let libsWarmed = false
    const warmupLibraries = () => {
        if (libsWarmed) return
        libsWarmed = true
        import('btcube-web').catch(() => { libsWarmed = false })
        import('gan-web-bluetooth').catch(() => { libsWarmed = false })
    }

    // BLE 16/32-bit numeric UUID -> canonical 128-bit string form.
    const canonicalUuid = (u) =>
        typeof u === 'number'
            ? '0000' + (u >>> 0).toString(16).padStart(4, '0') + '-0000-1000-8000-00805f9b34fb'
            : u

    // Every service UUID mentioned anywhere in a requestDevice options object.
    const collectServices = (options) => {
        const out = new Set()
        for (const f of options.filters || []) {
            for (const s of f.services || []) out.add(canonicalUuid(s))
        }
        for (const s of options.optionalServices || []) out.add(canonicalUuid(s))
        return [...out]
    }

    // The permissive fallback: show every BLE device, keep all services
    // reachable (numeric UUIDs normalized to strings, Chromium-only members
    // dropped). The user picks the cube; the library matches it by name.
    const permissiveOptions = (options) => ({
        acceptAllDevices: true,
        optionalServices: collectServices(options),
    })

    // Only the shapes that mean "this browser rejected the options object"
    // (Bluefy/iOS: "payload could not be parsed", numeric UUID, unknown
    // member). A cancelled chooser, missing adapter or permission error must
    // NOT trigger a retry — that would pointlessly re-open the chooser on
    // Chrome and make it feel slow/flaky.
    const looksLikeOptionsRejection = (e) =>
        e?.name === 'TypeError' ||
        /parse|argument|member|dictionary|not a valid|expected|malformed/i.test(e?.message || '')

    // Try the library's request as-is (best UX + speed on Chromium); only when
    // the browser rejects the options shape, retry with the permissive
    // fallback. This is what makes Bluefy/iOS work while leaving Chrome's
    // single, immediate chooser untouched.
    const wrapRequestDevice = (original) => async (options) => {
        if (!options) return await original(options)
        try {
            return await original(options)
        } catch (e) {
            if (looksLikeOptionsRejection(e)) return await original(permissiveOptions(options))
            throw e
        }
    }

    // Install the wrapper once. Some browsers expose navigator.bluetooth as
    // read-only, so fall back from plain assignment to defineProperty on the
    // bluetooth object, then to shadowing navigator.bluetooth with a proxy.
    let requestDevicePatched = false
    const patchRequestDevice = () => {
        if (requestDevicePatched || !navigator.bluetooth) return
        const bt = navigator.bluetooth
        const wrapped = wrapRequestDevice(bt.requestDevice.bind(bt))
        try { bt.requestDevice = wrapped } catch (_) { /* try harder below */ }
        if (bt.requestDevice !== wrapped) {
            try {
                Object.defineProperty(bt, 'requestDevice', {value: wrapped, configurable: true})
            } catch (_) { /* try harder below */ }
        }
        if (bt.requestDevice !== wrapped) {
            try {
                // plain shadow object (a Proxy would trip invariants on a
                // frozen target); other members are carried over bound
                const shadow = {requestDevice: wrapped}
                for (const k in bt) {
                    if (k === 'requestDevice') continue
                    const v = bt[k]
                    shadow[k] = typeof v === 'function' ? v.bind(bt) : v
                }
                Object.defineProperty(navigator, 'bluetooth', {value: shadow, configurable: true})
            } catch (_) { /* proceed unwrapped: original behaviour */ }
        }
        requestDevicePatched = true
    }

    // Connect a GAN cube via gan-web-bluetooth.
    const connectGan = async (display) => {
        const {connectGanCube} = await import('gan-web-bluetooth')
        patchRequestDevice()
        const conn = await connectGanCube(ganMacProvider)
        cube = conn
        cubeDisconnect = () => { try { conn.disconnect() } catch (_) {} }
        connected.value = true
        deviceName.value = conn.deviceName || 'GAN Smart Cube'
        // The library exposes the BluetoothDevice; keep it for liveness polling.
        gattDevice = conn.device || null
        subscriptions.push(conn.events$.subscribe(event => {
            if (event.type === 'MOVE') {
                onMove(event.move)
            } else if (event.type === 'BATTERY') {
                battery.value = event.batteryLevel
            } else if (event.type === 'DISCONNECT') {
                onGattDisconnect()
            }
        }))
        startLivenessMonitor()
        // Ask the cube to report its hardware info and battery level.
        try { await conn.sendCubeCommand({type: 'REQUEST_HARDWARE'}) } catch (_) {}
        try { await conn.sendCubeCommand({type: 'REQUEST_BATTERY'}) } catch (_) {}
        display.showToast('Connected to ' + deviceName.value, 'success')
    }

    const connect = async (brand = 'moyu') => {
        const display = useDisplayStore()
        try {
            if (!navigator.bluetooth) {
                display.showToast('Bluetooth is not supported in this browser', 'danger')
                return
            }
            if (brand === 'gan') {
                await connectGan(display)
            } else {
                await connectMoyu(display)
            }
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
        if (cubeDisconnect) cubeDisconnect()
        cleanupConnection()
        display.showToast('Smart cube disconnected', 'info')
    }

    const cleanupConnection = () => {
        stopLivenessMonitor()
        for (const s of subscriptions) { try { s.unsubscribe() } catch (_) {} }
        subscriptions = []
        if (gattDevice) {
            try { gattDevice.removeEventListener('gattserverdisconnected', onGattDisconnect) } catch (_) {}
            gattDevice = null
        }
        cube = null
        cubeDisconnect = null
        connected.value = false
        deviceName.value = null
        battery.value = null
        resetTracking()
    }

    // Set up the virtual cube for the current scrambleMoves. In normal mode the
    // virtual cube starts solved and the user reproduces the scramble; in
    // letter-pair mode the virtual cube is set directly to the scrambled state so
    // the user can execute the solution immediately (the physical cube can be in
    // any state — we only ever track relative moves).
    const initVirtualState = (kpuzzle) => {
        const settings = useSettingsStore()
        solvedPattern = kpuzzle.defaultPattern()
        correctionMoves.value = []
        pendingFaceTurn.value = null
        tooFarFromSolved.value = false
        resetGestureMoves = []
        hintGestureMoves = []
        solveMoves = []
        clearIdleTimer()
        computeExpectedPatterns(kpuzzle)

        if (settings.store.letterPairMode && scrambleMoves.value.length > 0) {
            // Jump the virtual cube straight to the fully-scrambled state.
            cubePattern = expectedPatterns[expectedPatterns.length - 1]
            position.value = scrambleMoves.value.length
            phase.value = 'awaiting_solve'
        } else {
            cubePattern = solvedPattern
            position.value = 0
            phase.value = scrambleMoves.value.length > 0 ? 'scrambling' : 'idle'
        }
    }

    const startTracking = async (scrambleString) => {
        if (!scrambleString) return
        scrambleMoves.value = scrambleString.split(' ').filter(m => m.length > 0)
        // Track physical cube state; solved detection triggers when the cube
        // returns to solved after scrambling + solving (normal mode) or after
        // executing the solution (letter-pair mode).
        const kpuzzle = await getKPuzzle()
        initVirtualState(kpuzzle)
    }

    const resetTracking = () => {
        phase.value = 'idle'
        scrambleMoves.value = []
        position.value = 0
        correctionMoves.value = []
        pendingFaceTurn.value = null
        paused.value = false
        tooFarFromSolved.value = false
        resetGestureMoves = []
        hintGestureMoves = []
        solveMoves = []
        clearIdleTimer()
        cubePattern = null
        solvedPattern = null
        expectedPatterns = []
    }

    const pauseTracking = () => { paused.value = true }
    const resumeTracking = () => { paused.value = false }

    // Re-arm tracking for the current case from the beginning. In normal mode
    // this resets the virtual cube to solved (re-sync after the physical cube is
    // back to solved); in letter-pair mode it re-scrambles the virtual cube so the
    // case can be attempted again. Useful after the user did random moves (e.g.
    // while paused).
    const resetToSolved = async () => {
        const kpuzzle = await getKPuzzle()
        paused.value = false
        initVirtualState(kpuzzle)
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

        // Reset gesture: a full 360° spin of the bottom layer re-arms the case.
        // It's net-identity, so the cube state is unchanged before we re-init.
        if (checkResetGesture(move)) {
            resetGestureMoves = []
            resetSignal.value++
            resetToSolved()
            return
        }

        // Help gesture: a full 360° spin of the left layer reveals the alg.
        // Net-identity, so the cube state is unchanged; strip the gesture's
        // stray L moves from the solution recording so alg detection is intact.
        if (checkHintGesture(move)) {
            hintGestureMoves = []
            if (phase.value === 'solving') {
                while (solveMoves.length && moveFace(solveMoves[solveMoves.length - 1]) === 'L') solveMoves.pop()
            }
            hintSignal.value++
            return
        }

        const wasScrambling = phase.value === 'scrambling'

        if (phase.value === 'scrambling') {
            processScrambleMove(move)
            // State-based reconciliation: if the physical cube is in a valid
            // intermediate scramble state, snap to it and drop any noise
            // corrections. This is what makes slice moves and out-of-order
            // commuting moves self-heal.
            reconcileState()
        } else if (phase.value === 'awaiting_solve') {
            // Letter-pair mode or a restarted measurement: the first move
            // begins the solution. Switch to 'solving' (which starts the
            // timer) and immediately check for the (degenerate) case where
            // one move already solves it.
            phase.value = 'solving'
            solveMoves = [move]
            if (cubePattern && solvedPattern && cubePattern.isIdentical(solvedPattern)) {
                finishSolve()
            }
        } else if (phase.value === 'solving') {
            solveMoves.push(move)
            if (cubePattern && solvedPattern && cubePattern.isIdentical(solvedPattern)) {
                finishSolve()
            } else if (startPattern() && cubePattern && cubePattern.isIdentical(startPattern())) {
                // The user undid their mistakes all the way back to the case's
                // start position: restart the measurement (and the executed-
                // move recording) from scratch — the next move re-starts the
                // timer.
                solveMoves = []
                phase.value = 'awaiting_solve'
            }
        }

        // When the scramble just completed and we've entered the solving phase,
        // drop the reset-gesture buffer. Otherwise D-layer moves at the end of
        // the scramble would carry over and combine with the first moves of the
        // user's algorithm (e.g. a scramble ending in D2 and an alg starting with
        // D2 would look like a D2 D2 reset gesture). Resetting after the scramble
        // therefore requires a fresh full spin (D4/U4), while resetting *during*
        // the scramble keeps working.
        if (wasScrambling && phase.value === 'solving') {
            resetGestureMoves = []
            hintGestureMoves = []
        }

        // Refresh the "too far from solved" hint: any move clears it and re-arms
        // the idle check (which only fires while still solving and unsolved).
        tooFarFromSolved.value = false
        scheduleFarCheck()
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
            if (move && (phase.value === 'scrambling' || phase.value === 'awaiting_solve' || phase.value === 'solving')) {
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
        tooFarFromSolved, resetSignal, hintSignal, lastSolveMoves, consumeSolveMoves, warmupLibraries,
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
