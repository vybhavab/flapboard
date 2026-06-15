/**
 * Visual-test harness. Mounts the real `FlapBoard` and exposes a deterministic
 * driver on `window.__flap` for Playwright:
 *
 *   reset(seed, opts) — remount with a fresh seeded engine and clock at 0
 *   setMessage(value, flag, marks?) — retarget the board
 *   tick(ms) — advance the *engine* clock and run the queued rAF frames
 *   pendingFrames() — how many rAF frames are queued (0 ⇒ board at rest)
 *
 * The engine reads global `requestAnimationFrame` / `performance.now`, so we
 * override those with a manual clock here — the board is driven entirely by
 * `tick`, never by wall time. CSS folds still run on real time, so tests wait a
 * beat after ticking (and screenshot with animations frozen) to capture the
 * landed faces of each cascade step.
 */
import { createRoot, type Root } from "react-dom/client";

import { FlapBoard, type GlyphMark } from "../../src/react";

import "../../src/styles.css";
import { mulberry32 } from "../support/rng";

type Opts = { value?: string; flag?: string[]; rows?: number; cols?: number };

// --- manual clock + rAF queue, installed over the globals the engine uses ---
// `performance.now` can be non-writable, so define it (strict-mode ESM would
// throw on a plain assignment). rAF/cAF are plain window props.
let now = 0;
let queue: FrameRequestCallback[] = [];
Object.defineProperty(window.performance, "now", {
  configurable: true,
  writable: true,
  value: () => now,
});
window.requestAnimationFrame = ((cb: FrameRequestCallback) =>
  queue.push(cb)) as typeof window.requestAnimationFrame;
window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;

let root: Root | null = null;
let mountKey = 0;
let random: () => number = mulberry32(1);
let state: {
  value: string;
  flag: string[];
  rows: number;
  cols: number;
  marks?: Record<string, GlyphMark>;
} = { value: "", flag: [], rows: 6, cols: 23 };

function render() {
  root ??= createRoot(document.getElementById("root")!);
  root.render(
    <FlapBoard
      key={mountKey}
      value={state.value}
      flag={state.flag}
      rows={state.rows}
      cols={state.cols}
      marks={state.marks}
      random={random}
    />
  );
}

const arrowMark: GlyphMark = ({ className }) => (
  <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
    <line className="sf-mark" x1="26" x2="74" y1="50" y2="50" />
    <polyline className="sf-mark" points="56,32 78,50 56,68" fill="none" />
  </svg>
);

window.__flap = {
  reset(seed = 1, opts: Opts = {}) {
    now = 0;
    queue = [];
    mountKey++;
    random = mulberry32(seed);
    state = {
      value: opts.value ?? "",
      flag: opts.flag ?? [],
      rows: opts.rows ?? 6,
      cols: opts.cols ?? 23,
    };
    render();
  },
  setMessage(value: string, flag: string[] = [], useArrowMark = false) {
    state = {
      ...state,
      value,
      flag,
      marks: useArrowMark ? { "→": arrowMark } : undefined,
    };
    render();
  },
  tick(ms: number) {
    now += ms;
    const frames = queue;
    queue = [];
    for (const cb of frames) cb(now);
  },
  pendingFrames() {
    return queue.length;
  },
};

declare global {
  interface Window {
    __flap: {
      reset: (seed?: number, opts?: Opts) => void;
      setMessage: (
        value: string,
        flag?: string[],
        useArrowMark?: boolean
      ) => void;
      tick: (ms: number) => void;
      pendingFrames: () => number;
    };
  }
}
