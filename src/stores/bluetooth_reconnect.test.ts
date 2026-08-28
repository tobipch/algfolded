import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Reconnecting after a disconnect used to be impossible: nothing in the app
// ever closed the GATT link itself. It delegated that to the cube libraries,
// which only close it on their happy path — so a connect attempt that died
// after `gatt.connect()` had succeeded (or one that never finished at all)
// left the cube bound to the browser. A bound cube stops advertising, so it
// no longer shows up in the chooser and every later attempt fails too, until
// the page is reloaded or the cube is power-cycled.

// --- fake Web Bluetooth ------------------------------------------------------

class FakeGatt {
  connected = false
  device: FakeDevice
  constructor(device: FakeDevice) { this.device = device }
  async connect() { this.connected = true; return this }
  disconnect() {
    if (!this.connected) return
    this.connected = false
    this.device.dispatch('gattserverdisconnected')
  }
}

class FakeDevice {
  name: string
  gatt: FakeGatt
  listeners: Record<string, Function[]> = {}
  constructor(name: string) { this.name = name; this.gatt = new FakeGatt(this) }
  addEventListener(type: string, fn: Function) { (this.listeners[type] ||= []).push(fn) }
  removeEventListener(type: string, fn: Function) {
    this.listeners[type] = (this.listeners[type] || []).filter(l => l !== fn)
  }
  dispatch(type: string) { for (const l of [...(this.listeners[type] || [])]) l({ target: this }) }
}

let lastDevice: FakeDevice | null = null
const requestDevice = vi.fn(async () => {
  lastDevice = new FakeDevice('WCU_MY32_ABCD')
  return lastDevice
})

// --- fake cube libraries -----------------------------------------------------

type Behaviour = 'ok' | 'throw-after-gatt' | 'hang'
let behaviour: Behaviour = 'ok'

const makeSubject = () => {
  const subs: Function[] = []
  return {
    subscribe: (fn: Function) => { subs.push(fn); return { unsubscribe: () => {} } },
    next: (v: unknown) => { for (const fn of [...subs]) fn(v) },
  }
}

const connectSmartCube = vi.fn(async () => {
  const device = await (navigator as any).bluetooth.requestDevice({ filters: [] })
  await device.gatt.connect()
  if (behaviour === 'throw-after-gatt') throw new Error("Can't find target BLE services")
  if (behaviour === 'hang') await new Promise(() => {}) // never settles
  return {
    device,
    events: { moves: makeSubject(), info: makeSubject(), state: makeSubject() },
    commands: { disconnect: async () => device.gatt.disconnect() },
  }
})

vi.mock('btcube-web', () => ({ connectSmartCube: (...a: unknown[]) => connectSmartCube(...a as []) }))
vi.mock('gan-web-bluetooth', () => ({ connectGanCube: vi.fn() }))

const freshStore = async () => {
  const { useBluetoothCubeStore } = await import('@/stores/BluetoothCubeStore')
  return useBluetoothCubeStore()
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  setActivePinia(createPinia())
  behaviour = 'ok'
  lastDevice = null
  requestDevice.mockClear()
  connectSmartCube.mockClear()
  Object.defineProperty(navigator, 'bluetooth', {
    value: { requestDevice }, configurable: true, writable: true,
  })
})

afterEach(() => { vi.useRealTimers() })

describe('smart cube connect / disconnect / reconnect', () => {
  it('reconnects after a clean disconnect', async () => {
    const bt = await freshStore()
    await bt.connect('moyu')
    expect(bt.connected).toBe(true)
    const first = lastDevice!

    bt.disconnect()
    expect(bt.connected).toBe(false)
    expect(first.gatt.connected).toBe(false) // link really closed

    await bt.connect('moyu')
    expect(bt.connected).toBe(true)
    expect(lastDevice).not.toBe(first)
    expect(lastDevice!.gatt.connected).toBe(true)
  })

  it('closes the GATT link when the connect attempt fails after connecting', async () => {
    const bt = await freshStore()
    behaviour = 'throw-after-gatt'
    await bt.connect('moyu')

    expect(bt.connected).toBe(false)
    // The cube must not stay bound to the browser, or it stops advertising
    // and no later attempt can find it.
    expect(lastDevice!.gatt.connected).toBe(false)
  })

  it('gives up on a connect that never finishes, and closes the link', async () => {
    const bt = await freshStore()
    behaviour = 'hang'
    const p = bt.connect('moyu')
    await vi.advanceTimersByTimeAsync(60000)
    await p

    expect(bt.connected).toBe(false)
    expect(bt.connecting).toBe(false)
    expect(lastDevice!.gatt.connected).toBe(false)
  })

  it('ignores a second connect attempt while one is in flight', async () => {
    const bt = await freshStore()
    behaviour = 'hang'
    const p = bt.connect('moyu')
    await vi.advanceTimersByTimeAsync(0) // let the dynamic import settle
    expect(connectSmartCube).toHaveBeenCalledTimes(1)
    await bt.connect('moyu') // second tap while the first is still in flight
    expect(connectSmartCube).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(60000)
    await p
  })

  it('does not give up while the user is still picking a device', async () => {
    const bt = await freshStore()
    let pick: () => void = () => {}
    const chooser = new Promise<void>(r => { pick = r })
    requestDevice.mockImplementationOnce(async () => {
      await chooser
      lastDevice = new FakeDevice('WCU_MY32_ABCD')
      return lastDevice
    })

    const p = bt.connect('moyu')
    await vi.advanceTimersByTimeAsync(120000) // two minutes in the chooser
    expect(bt.connecting).toBe(true)

    pick()
    await vi.advanceTimersByTimeAsync(0)
    await p
    expect(bt.connected).toBe(true)
  })

  it('tears down a connect that only succeeds after we gave up on it', async () => {
    const bt = await freshStore()
    let release: () => void = () => {}
    behaviour = 'ok'
    const gate = new Promise<void>(r => { release = r })
    connectSmartCube.mockImplementationOnce(async () => {
      const device = await (navigator as any).bluetooth.requestDevice({ filters: [] })
      await device.gatt.connect()
      await gate
      return {
        device,
        events: { moves: makeSubject(), info: makeSubject(), state: makeSubject() },
        commands: { disconnect: async () => device.gatt.disconnect() },
      }
    })

    const p = bt.connect('moyu')
    await vi.advanceTimersByTimeAsync(60000) // times out
    await p
    expect(bt.connected).toBe(false)

    release()
    await vi.advanceTimersByTimeAsync(0)
    // The late arrival must not install itself, and must not leave the cube
    // bound to the browser.
    expect(bt.connected).toBe(false)
    expect(lastDevice!.gatt.connected).toBe(false)
  })

  it('does not report a lost connection when the user disconnects', async () => {
    const bt = await freshStore()
    const { useDisplayStore } = await import('@/stores/DisplayStore')
    const display = useDisplayStore()
    await bt.connect('moyu')
    bt.disconnect()
    expect(display.toastType).not.toBe('danger')
  })
})
