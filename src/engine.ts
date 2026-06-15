/**
 * The flapboard engine: a state machine of autonomous motors.
 *
 * The board holds one piece of truth — the *target* grid — and one animation
 * loop. Every cell is an independent little motor with its OWN current flap,
 * its own clock, and its own jitter. The loop ticks them all; each motor flips
 * toward its target on its own schedule, so desync (the thing that reads as
 * "alive") is the default, not something faked on top.
 *
 * `setTarget` is fully interruptible. It never touches a motor's *current*
 * position — it only moves the goalposts. A motor mid-spin toward one message
 * just recomputes its path to the new message from wherever its flap physically
 * is and keeps rolling. No teardown, no snap-to-grid, no jump: a state change
 * *flows* across the board. That is the whole point of modelling it this way.
 *
 * The engine is framework-agnostic — it knows nothing about the DOM beyond an
 * injectable clock and rAF. A view subscribes per cell and paints on `flip` /
 * `snap` events.
 */

import { type Flap, flapKey, buildDrum, forwardSteps } from "./drum";
import { type FlapTiming, DEFAULT_TIMING, motorStepDelay } from "./timing";

export type CellEvent =
  | { type: "flip"; prev: Flap; next: Flap; foldMs: number }
  | { type: "snap"; flap: Flap };

export type CellListener = (event: CellEvent) => void;

type Motor = {
  current: Flap; // the flap shown right now
  target: Flap; // where it's heading
  index: number; // drum index of `current`
  targetIndex: number; // drum index of `target`
  spinning: boolean;
  nextAt: number; // ms timestamp of this motor's next flip
  stepsDone: number; // steps taken this spin (drives the ramp)
  stepsTotal: number; // planned steps this spin (drives the ramp)
  speed: number; // per-spin step-time multiplier — each motor a little different
  foldMs: number; // per-spin fold duration
  listener: CellListener | null;
};

export type FlapBoardOptions = {
  rows: number;
  cols: number;
  timing?: FlapTiming;
  /** Per-tile diagonal cascade offset (ms). The board ripples instead of detonating. */
  staggerMs?: number;
  /** Called once per flip — wire up the mechanical tick here (rate-limit yourself). */
  onTick?: () => void;
  /** Called when the whole board comes to rest after a change. */
  onSettled?: () => void;
  /** Return true to skip animation and snap straight to the target. */
  reducedMotion?: () => boolean;
  now?: () => number;
  raf?: (cb: () => void) => number;
  caf?: (id: number) => void;
  /** Source of randomness for per-motor jitter. Inject a seeded PRNG for
   *  deterministic animation (used by the visual tests). Defaults to Math.random. */
  random?: () => number;
};

const BLANK: Flap = { kind: "char", value: " " };

const defaultNow = () =>
  typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();

export class FlapBoard {
  readonly rows: number;
  readonly cols: number;

  private timing: FlapTiming;
  private staggerMs: number;
  private motors: Motor[];
  private drum: Flap[] = [];
  private indexMap = new Map<string, number>();

  private initialized = false;
  private animating = false;
  private rafId = 0;

  private onTick?: () => void;
  private onSettled?: () => void;
  private reducedMotion?: () => boolean;
  private now: () => number;
  private raf: (cb: () => void) => number;
  private caf: (id: number) => void;
  private random: () => number;

  constructor(opts: FlapBoardOptions) {
    this.rows = opts.rows;
    this.cols = opts.cols;
    this.timing = opts.timing ?? DEFAULT_TIMING;
    this.staggerMs = opts.staggerMs ?? 18;
    this.onTick = opts.onTick;
    this.onSettled = opts.onSettled;
    this.reducedMotion = opts.reducedMotion;
    this.now = opts.now ?? defaultNow;
    this.raf =
      opts.raf ??
      ((cb) =>
        typeof requestAnimationFrame !== "undefined"
          ? requestAnimationFrame(cb)
          : 0);
    this.caf =
      opts.caf ??
      ((id) => {
        if (typeof cancelAnimationFrame !== "undefined")
          cancelAnimationFrame(id);
      });
    this.random = opts.random ?? Math.random;

    this.motors = Array.from({ length: this.rows * this.cols }, () => ({
      current: BLANK,
      target: BLANK,
      index: 0,
      targetIndex: 0,
      spinning: false,
      nextAt: 0,
      stepsDone: 0,
      stepsTotal: 0,
      speed: 1,
      foldMs: this.timing.foldBaseMs,
      listener: null,
    }));
  }

  /** Subscribe a view to one cell. Returns an unsubscribe fn. */
  subscribeCell(row: number, col: number, listener: CellListener): () => void {
    const motor = this.motorAt(row, col);
    motor.listener = listener;
    return () => {
      if (motor.listener === listener) motor.listener = null;
    };
  }

  /** The flap a cell is currently showing — used for a view's initial paint. */
  currentFlap(row: number, col: number): Flap {
    return this.motorAt(row, col).current;
  }

  /** Update timing live (e.g. user dials the speed). Applies to the next spin. */
  setTiming(timing: FlapTiming): void {
    this.timing = timing;
  }

  /**
   * Point the board at a new target grid. Interruptible: motors retarget from
   * wherever they are. The first call snaps (no intro flap on first paint).
   */
  setTarget(grid: Flap[][]): void {
    const firstPaint = !this.initialized;
    const reduced = !firstPaint && (this.reducedMotion?.() ?? false);

    // The drum must hold every flap any motor currently shows plus every target,
    // so any motor can always rotate forward to its destination.
    const used: Flap[] = [];
    for (const m of this.motors) used.push(m.current);
    for (const row of grid) for (const f of row) used.push(f);
    this.drum = buildDrum(used);
    this.indexMap = new Map(this.drum.map((f, i) => [flapKey(f), i]));
    const len = this.drum.length;

    const now = this.now();
    let willAnimate = false;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const m = this.motors[r * this.cols + c];
        const target = grid[r][c];
        m.target = target;
        // Re-index against the freshly built drum (indices may have shifted).
        m.index = this.indexMap.get(flapKey(m.current)) ?? 0;
        m.targetIndex = this.indexMap.get(flapKey(target)) ?? m.index;

        if (m.index === m.targetIndex) {
          // Already showing the target — halt here (handles "retarget to where I am").
          m.spinning = false;
          continue;
        }

        if (firstPaint || reduced) {
          m.current = target;
          m.index = m.targetIndex;
          m.spinning = false;
          m.listener?.({ type: "snap", flap: target });
          continue;
        }

        willAnimate = true;
        if (!m.spinning) {
          // Spin up: re-roll this motor's jitter so the board never repeats.
          m.spinning = true;
          m.stepsDone = 0;
          m.stepsTotal = forwardSteps(m.index, m.targetIndex, len);
          m.speed = this.jitterSpeed();
          m.foldMs = this.jitterFold();
          m.nextAt =
            now +
            this.cascadeDelay(r, c) +
            motorStepDelay(0, m.stepsTotal, this.timing) * m.speed;
        } else {
          // Mid-flight retarget: keep position and cadence, just re-plan the
          // remaining distance to the new target. This is what makes a state
          // change flow rather than jump.
          m.stepsTotal =
            m.stepsDone + forwardSteps(m.index, m.targetIndex, len);
        }
      }
    }

    this.initialized = true;

    if (willAnimate) {
      this.animating = true;
      this.ensureLoop();
    } else if (!firstPaint && !this.animating) {
      // No-op change or a reduced-motion snap with nothing already in flight: the
      // board is at rest right now, so settle once. If a previous spin IS still
      // running, we must NOT fire here — the running loop owns onSettled and will
      // fire it (exactly once) when it drains. Firing here would settle early and
      // then again on drain.
      this.stopLoop();
      this.onSettled?.();
    }
  }

  /** Snap everything to its target immediately (no animation). */
  finish(): void {
    let changed = false;
    for (const m of this.motors) {
      if (!m.spinning && m.index === m.targetIndex) continue;
      m.current = m.target;
      m.index = m.targetIndex;
      m.spinning = false;
      changed = true;
      m.listener?.({ type: "snap", flap: m.target });
    }
    this.stopLoop();
    if (changed) this.onSettled?.();
  }

  destroy(): void {
    this.stopLoop();
    for (const m of this.motors) m.listener = null;
  }

  // --- internals ---

  private motorAt(row: number, col: number): Motor {
    return this.motors[row * this.cols + col];
  }

  private jitterSpeed(): number {
    // Each motor runs ±18% off nominal — friction, slop, momentum.
    return 0.82 + this.random() * 0.36;
  }

  private jitterFold(): number {
    return Math.round(this.timing.foldBaseMs * (0.9 + this.random() * 0.2));
  }

  private cascadeDelay(row: number, col: number): number {
    // A diagonal wave from the top-left, with per-tile noise so the front edge
    // is organic rather than a ruler-straight line. Re-rolled every setTarget.
    const wave = (row + col) * this.staggerMs;
    const noise = (this.random() - 0.5) * 2 * this.staggerMs;
    return Math.max(0, wave + noise);
  }

  private ensureLoop(): void {
    if (!this.rafId) this.rafId = this.raf(this.frame);
  }

  private stopLoop(): void {
    if (this.rafId) this.caf(this.rafId);
    this.rafId = 0;
    this.animating = false;
  }

  private frame = (): void => {
    this.rafId = 0;
    const now = this.now();
    let active = false;

    for (const m of this.motors) {
      if (!m.spinning) continue;
      // Catch up if a frame ran late (or the tab was backgrounded): step until
      // this motor is current. Self-terminating — it stops at its target.
      while (m.spinning && now >= m.nextAt) this.step(m);
      if (m.spinning) active = true;
    }

    if (active) {
      this.rafId = this.raf(this.frame);
    } else if (this.animating) {
      this.animating = false;
      this.onSettled?.();
    }
  };

  private step(m: Motor): void {
    const prev = m.current;
    m.index = (m.index + 1) % this.drum.length;
    m.current = this.drum[m.index];
    m.stepsDone += 1;

    m.listener?.({ type: "flip", prev, next: m.current, foldMs: m.foldMs });
    this.onTick?.();

    if (m.index === m.targetIndex) {
      m.spinning = false;
      return;
    }
    m.nextAt +=
      motorStepDelay(m.stepsDone, m.stepsTotal, this.timing) * m.speed;
  }
}
