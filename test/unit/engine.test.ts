import { describe, it, expect, beforeEach } from "vitest";

import { type Flap, sameFlap } from "../../src/drum";
import { FlapBoard, type CellEvent } from "../../src/engine";
import { buildFlapGrid } from "../../src/layout";
import { mulberry32 } from "../support/rng";

const ROWS = 6;
const COLS = 23;
const DIMS = { rows: ROWS, cols: COLS, idealLineCols: 16 };

const grid = (value: string, flag: string[] = []) =>
  buildFlapGrid(value, undefined, flag, DIMS);

/**
 * A manual clock + single-slot rAF queue. The engine reads `now()` itself and
 * its per-frame catch-up loop steps every motor whose next flip is due, so a
 * single big `tick` settles the whole board, while small ticks let us stop the
 * cascade mid-flight. Randomness is seeded for reproducibility.
 */
function makeDriver(seed = 1, reducedMotion = false) {
  let t = 0;
  const slot: { cb: (() => void) | null } = { cb: null };
  let id = 0;
  const events: CellEvent[] = [];

  const board = new FlapBoard({
    rows: ROWS,
    cols: COLS,
    now: () => t,
    raf: (cb) => {
      slot.cb = cb;
      return ++id;
    },
    caf: () => {
      slot.cb = null;
    },
    random: mulberry32(seed),
    reducedMotion: () => reducedMotion,
    onSettled: () => settledCount++,
    onTick: () => tickCount++,
  });

  let settledCount = 0;
  let tickCount = 0;

  // Subscribe every cell so we can inspect emitted events.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      board.subscribeCell(r, c, (e) => events.push(e));
    }
  }

  const tick = (ms: number) => {
    t += ms;
    const cb = slot.cb;
    slot.cb = null;
    cb?.();
  };

  const runToSettle = (stepMs = 24, maxSteps = 100000) => {
    let n = 0;
    while (slot.cb && n++ < maxSteps) tick(stepMs);
    if (n >= maxSteps) throw new Error("animation did not settle");
  };

  const currentGrid = (): Flap[][] =>
    Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => board.currentFlap(r, c))
    );

  const gridsEqual = (a: Flap[][], b: Flap[][]) =>
    a.every((row, r) => row.every((f, c) => sameFlap(f, b[r][c])));

  return {
    board,
    events,
    tick,
    runToSettle,
    currentGrid,
    gridsEqual,
    get settledCount() {
      return settledCount;
    },
    get tickCount() {
      return tickCount;
    },
    flips: () => events.filter((e) => e.type === "flip"),
    snaps: () => events.filter((e) => e.type === "snap"),
    clearEvents: () => {
      events.length = 0;
    },
  };
}

describe("FlapBoard engine", () => {
  let d: ReturnType<typeof makeDriver>;
  beforeEach(() => {
    d = makeDriver();
  });

  it("snaps on first paint — no flips, lands exactly on target", () => {
    d.board.setTarget(grid("HELLO"));
    expect(d.flips()).toHaveLength(0);
    expect(d.gridsEqual(d.currentGrid(), grid("HELLO"))).toBe(true);
  });

  it("animates a message change and converges to the new target", () => {
    d.board.setTarget(grid("HELLO")); // first paint snaps
    d.clearEvents();

    d.board.setTarget(grid("WORLD"));
    d.runToSettle();
    expect(d.flips().length).toBeGreaterThan(0); // it actually animated
    expect(d.gridsEqual(d.currentGrid(), grid("WORLD"))).toBe(true);
  });

  it("fires onSettled exactly once for an animated change", () => {
    d.board.setTarget(grid("HELLO"));
    d.board.setTarget(grid("GOODBYE"));
    d.runToSettle();
    expect(d.settledCount).toBe(1);
  });

  it("mid-flight retarget flows (no snap) and converges to the latest target", () => {
    d.board.setTarget(grid("HELLO")); // first paint
    d.clearEvents();

    d.board.setTarget(grid("WORLD")); // start animating
    // Advance until the cascade has actually started flipping tiles, but well
    // before it settles — this is the genuine mid-flight state.
    for (let i = 0; i < 40 && d.flips().length === 0; i++) d.tick(50);
    expect(d.flips().length).toBeGreaterThan(0);

    d.board.setTarget(grid("PEACE")); // interrupt mid-flight
    d.runToSettle();

    // A mid-flight retarget must never snap a tile — it redirects in place.
    expect(d.snaps()).toHaveLength(0);
    expect(d.gridsEqual(d.currentGrid(), grid("PEACE"))).toBe(true);
  });

  it("treats a no-op retarget as already-settled (one onSettled, no flips)", () => {
    d.board.setTarget(grid("HELLO"));
    d.clearEvents();

    d.board.setTarget(grid("HELLO")); // identical — nothing to do
    expect(d.flips()).toHaveLength(0);
    expect(d.settledCount).toBe(1);
  });

  it("regression: retargeting to the live positions mid-flight settles ONCE, not twice", () => {
    // This is the onSettled double/premature-fire bug: a retarget that halts the
    // remaining motors (willAnimate=false) while a loop is still scheduled used
    // to fire onSettled immediately AND again when the loop drained.
    d.board.setTarget(grid("HELLO"));
    d.board.setTarget(grid("WORLD"));
    d.tick(500); // mid-cascade, loop still running

    // Point every tile at exactly where it physically is right now.
    d.board.setTarget(d.currentGrid());
    d.runToSettle();

    expect(d.settledCount).toBe(1);
  });

  it("snaps instantly when reduced motion is requested", () => {
    const rd = makeDriver(2, /* reducedMotion */ true);
    rd.board.setTarget(grid("HELLO")); // first paint
    rd.clearEvents();

    rd.board.setTarget(grid("WORLD")); // reduced -> snap, no animation
    expect(rd.flips()).toHaveLength(0);
    expect(rd.snaps().length).toBeGreaterThan(0);
    expect(rd.settledCount).toBe(1);
    expect(rd.gridsEqual(rd.currentGrid(), grid("WORLD"))).toBe(true);
  });

  it("produces identical animations for identical seeds (determinism)", () => {
    const a = makeDriver(42);
    const b = makeDriver(42);
    a.board.setTarget(grid("HELLO"));
    b.board.setTarget(grid("HELLO"));
    a.board.setTarget(grid("WORLD"));
    b.board.setTarget(grid("WORLD"));
    a.runToSettle();
    b.runToSettle();
    expect(a.flips().length).toBe(b.flips().length);
  });
});
