# Algfolded

Fork of [Roman Strakhov's ZBLL Trainer](https://github.com/Roman-/zbll), originally adapted for LTCT with permission from the original author. Algorithm data sourced from [blddb](https://github.com/nbwzx/blddb).

A timer-based trainer for **blindfolded (BLD) speedcubing algorithms**. It started as an **LTCT (Last Target Corner Twist)** trainer and now hosts multiple algsets — LTCT, 3-twists, and (coming) commutators — each with its own cases, scrambles and progress.

## Features

- **Multiple algsets** (LTCT, 3-twists, …) with pre-generated scrambles, each with its own selection, stats and spaced-repetition history
- **Interactive 3D cube visualization** (touch/drag to rotate)
- **Customizable letter scheme** (Speffz default)
- **Cube orientation setting** for preferred solving perspective
- **Timer with stats tracking** — per-solve history, notes, and result management
- **Presets** for organizing practice sessions (starred, custom)
- **Multiple themes** (light/dark, 20+ Bootswatch themes) **and languages** (EN, DE, FR, IT)

### Smart Cube (Bluetooth)

Connect a Bluetooth smart cube for hands-free scramble tracking. Supported brands: **GAN** (Gen2/Gen3/Gen4, via `gan-web-bluetooth`) and **MoYu / QiYi** (via `btcube-web`). Click the Bluetooth button and pick your cube's brand.

- **Real-time scramble tracking** — completed moves turn green, wrong moves appear in red as corrections to undo
- **Automatic solved detection** — recognizes when the cube returns to solved after scrambling + solving
- **State-based reconciliation** — handles slice moves (M/S/E), out-of-order commuting moves, and other noise by comparing the physical cube state against the expected scramble state
- **Pause / resume tracking** (Alt+Y) — temporarily ignore moves, e.g. while adjusting grip
- **Reset virtual cube** (Alt+M) — re-sync when the physical cube is back to solved
- **Letterpair mode** — practice straight from the letter pair: instead of the scramble, the bar shows the case's letter pair (e.g. `Letterpair: BI`) so you know which LTCT to execute. The virtual cube starts already in the scrambled state, so you just do the alg and the timer stops the moment the virtual cube is solved. Only relative moves are tracked, so the physical cube can stay scrambled between cases — no re-scrambling, no doubt about whether your alg was correct. Enable it in settings.
- **Keyboard simulator** for testing without a physical cube (`window.btSim.connect()` in the browser console)

### Smart Case Selection

When enabled (default), cases are selected using a weighted random algorithm inspired by spaced repetition:

- **Slowness weight** — cases with higher solve times are selected more often
- **Recency weight** — cases you haven't practiced recently get prioritized
- Configurable via *Speed emphasis* (0–4) and *Recency emphasis* (0–2) in settings

### "Didn't Know" Button

After a solve, mark a case as forgotten — this multiplies its internal priority by 5×, so it comes up again sooner. The penalty clears automatically after the next successful solve.

### Recap Mode

Go through every selected case exactly once (Alt+R). Useful for systematic review — the counter shows how many cases remain. Normal selection resumes once all cases have been covered.

### Session Summary

At the end of a session, view:

- Solve count, unique cases covered, total and mean solve time
- Sparkline graph of solve times
- Slowest cases with a one-click button to practice them

## Development

```bash
npm install
npm run dev
```

To regenerate scrambles:

```bash
node scripts/generate_scrambles.mjs
node scripts/verify_scrambles.mjs
```
