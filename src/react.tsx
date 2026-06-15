"use client";

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { type Flap } from "./drum";
import { FlapBoard as Engine, type CellEvent } from "./engine";
import {
  buildFlapGrid,
  isDenseGlyphCluster,
  isComplexScript,
  shouldRenderWholeGlyph,
  show,
  type BoardDims,
} from "./layout";
import { DEFAULT_TIMING, type FlapTiming } from "./timing";

/**
 * Renders the face of a single character as a drawn SVG mark instead of a font
 * glyph. Some characters (a hyphen, a chevron) read better hand-drawn and
 * centred on the flap than as a typeface glyph. Receives the shared
 * `sf-g sf-g-mark` className so it lays out like any other face.
 */
export type GlyphMark = (props: { className: string }) => ReactNode;

export type FlapBoardMotion = {
  /**
   * What to do when the page scrolls while the board is animating.
   *
   * - "continue" keeps the physical cascade uninterrupted.
   * - "finish" snaps active motors to their target to protect scroll FPS.
   */
  whileScrolling?: "continue" | "finish";
};

/**
 * The marks drawn by default: `-` as a centred bar and `>` as a chevron. Spread
 * your own on top via the `marks` prop to add or override (e.g. an arrow glyph).
 */
export const DEFAULT_MARKS: Record<string, GlyphMark> = {
  "-": ({ className }) => (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <line className="sf-mark" x1="32" x2="68" y1="50" y2="50" />
    </svg>
  ),
  ">": ({ className }) => (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <polyline className="sf-mark" points="34,30 68,50 34,70" />
    </svg>
  ),
};

export type FlapBoardProps = {
  /** The message. Word-wrapped and centered unless `lines` is given. */
  value: string;
  /** Pin explicit lines instead of auto-wrapping `value`. */
  lines?: readonly string[];
  /** Flag palette painted around the perimeter. */
  flag?: readonly string[];
  rows?: number;
  cols?: number;
  /** Target line length the wrap balancer aims for. */
  idealLineCols?: number;
  timing?: FlapTiming;
  staggerMs?: number;
  /** Fired once the whole board comes to rest after a change. */
  onSettled?: () => void;
  /** Fired once per individual flip — wire a click sound here. */
  onTick?: () => void;
  /** Motion policy for external page interactions. */
  motion?: FlapBoardMotion;
  /** Characters to draw as SVG marks rather than font glyphs. Merged over
   *  {@link DEFAULT_MARKS} (`-`, `>`), so pass `{}` to keep the defaults and add
   *  your own, or override a default by re-supplying its key. */
  marks?: Record<string, GlyphMark>;
  /** Source of randomness for the motor jitter. Inject a seeded PRNG for
   *  deterministic animation (used by the visual tests). Defaults to Math.random. */
  random?: () => number;
  className?: string;
};

function defaultReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** One flap face — a character, a registered SVG mark, or a colour chip fill. */
function Face({
  flap,
  marks,
}: {
  flap: Flap;
  marks: Record<string, GlyphMark>;
}) {
  if (flap.kind === "color") {
    return (
      <span
        className="sf-g sf-g-color"
        style={{ backgroundColor: flap.value }}
      />
    );
  }
  const value = show(flap.value);
  const mark = marks[value];
  if (mark) return mark({ className: "sf-g sf-g-mark" });
  return (
    <span
      className="sf-g sf-g-char"
      data-complex={isComplexScript(value) || undefined}
      data-dense={isDenseGlyphCluster(value) || undefined}
      aria-hidden="true"
    >
      <span className="sf-text">{value}</span>
    </span>
  );
}

function WholeGlyphFace({
  flap,
  marks,
}: {
  flap: Flap;
  marks: Record<string, GlyphMark>;
}) {
  if (flap.kind === "color") return <Face flap={flap} marks={marks} />;

  const value = show(flap.value);
  const mark = marks[value];
  if (mark) return mark({ className: "sf-g sf-g-mark" });

  const dense = isDenseGlyphCluster(value);

  return (
    <svg
      className="sf-g sf-g-whole"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      data-complex={isComplexScript(value) || undefined}
      data-dense={dense || undefined}
    >
      <text
        className="sf-svg-text"
        x="50"
        y="53"
        textAnchor="middle"
        dominantBaseline="middle"
        textLength={dense ? 68 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {value}
      </text>
    </svg>
  );
}

const BLANK_FLAP: Flap = { kind: "char", value: " " };

function usesWholeFace(flap: Flap, marks: Record<string, GlyphMark>) {
  return (
    flap.kind === "char" &&
    !marks[show(flap.value)] &&
    shouldRenderWholeGlyph(show(flap.value))
  );
}

type CellState = {
  cur: Flap;
  prev: Flap;
  animating: boolean;
  animKey: number;
  foldMs: number;
};

/**
 * One tile. A dumb subscriber: the engine decides *when* and *to what* it
 * flips; this just paints `cur`/`prev` and restarts the CSS fold (via `animKey`
 * remount) on each flip — the same proven render the board has always used.
 */
const Cell = memo(function Cell({
  engine,
  row,
  col,
  baseFoldMs,
  marks,
}: {
  engine: Engine;
  row: number;
  col: number;
  baseFoldMs: number;
  marks: Record<string, GlyphMark>;
}) {
  const [state, setState] = useState<CellState>(() => {
    const flap = engine.currentFlap(row, col);
    return {
      cur: flap,
      prev: flap,
      animating: false,
      animKey: 0,
      foldMs: baseFoldMs,
    };
  });
  const foldTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const unsubscribe = engine.subscribeCell(row, col, (event: CellEvent) => {
      if (event.type === "snap") {
        clearTimeout(foldTimer.current);
        setState((s) => ({
          ...s,
          cur: event.flap,
          prev: event.flap,
          animating: false,
        }));
        return;
      }
      setState((s) => ({
        cur: event.next,
        prev: event.prev,
        animating: true,
        animKey: s.animKey + 1,
        foldMs: event.foldMs,
      }));
      // Retire the flapping leaves once this fold finishes so the static halves
      // show the landed flap. A faster following flip just resets this.
      clearTimeout(foldTimer.current);
      foldTimer.current = setTimeout(
        () => setState((s) => ({ ...s, animating: false, prev: s.cur })),
        Math.ceil(event.foldMs * 1.14)
      );
    });
    return () => {
      unsubscribe();
      clearTimeout(foldTimer.current);
    };
  }, [engine, row, col]);

  const { cur, prev, animating, animKey, foldMs } = state;
  const wholeFace =
    usesWholeFace(cur, marks) || (animating && usesWholeFace(prev, marks));
  const staticTop = wholeFace ? BLANK_FLAP : cur;
  const staticBottom = wholeFace ? BLANK_FLAP : animating ? prev : cur;
  const flipTop = wholeFace ? BLANK_FLAP : prev;
  const flipBottom = wholeFace ? BLANK_FLAP : cur;

  return (
    <span
      className="sf-cell"
      data-whole-glyph={wholeFace || undefined}
      style={{ "--sf-cell-fold": `${foldMs}ms` } as CSSProperties}
    >
      <span className="sf-unit">
        <span className="sf-half sf-top">
          <Face flap={staticTop} marks={marks} />
        </span>
        <span className="sf-half sf-bottom">
          <Face flap={staticBottom} marks={marks} />
        </span>
        {animating && (
          <>
            <span key={`t${animKey}`} className="sf-flip sf-top">
              <Face flap={flipTop} marks={marks} />
            </span>
            <span key={`b${animKey}`} className="sf-flip sf-bottom">
              <Face flap={flipBottom} marks={marks} />
            </span>
          </>
        )}
        {wholeFace && (
          <span className="sf-whole-face">
            <WholeGlyphFace flap={cur} marks={marks} />
          </span>
        )}
      </span>
    </span>
  );
});

/**
 * A split-flap board. Owns one engine for its lifetime; prop changes call
 * `setTarget`, so updates are interruptible — change the message mid-flip and
 * the tiles redirect rather than restart.
 */
export function FlapBoard({
  value,
  lines,
  flag = [],
  rows = 6,
  cols = 23,
  idealLineCols = 16,
  timing = DEFAULT_TIMING,
  staggerMs = 18,
  onSettled,
  onTick,
  motion,
  marks,
  random,
  className,
}: FlapBoardProps) {
  const dims: BoardDims = { rows, cols, idealLineCols };

  // Resolve the mark map once per distinct `marks` prop so memo'd Cells aren't
  // forced to re-render on every parent render by a fresh object identity.
  const resolvedMarks = useMemo(
    () => (marks ? { ...DEFAULT_MARKS, ...marks } : DEFAULT_MARKS),
    [marks]
  );

  const onSettledRef = useRef(onSettled);
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);
  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  const [engine] = useState(() => {
    const nextEngine = new Engine({
      rows,
      cols,
      timing,
      staggerMs,
      onTick: () => onTickRef.current?.(),
      onSettled: () => onSettledRef.current?.(),
      reducedMotion: defaultReducedMotion,
      random,
    });
    // First target snaps; no intro flap on initial paint.
    nextEngine.setTarget(buildFlapGrid(value, lines, flag, dims));
    return nextEngine;
  });

  useEffect(() => engine.setTiming(timing), [engine, timing]);
  useEffect(() => () => engine.destroy(), [engine]);
  useEffect(() => {
    if (motion?.whileScrolling !== "finish" || typeof window === "undefined")
      return;

    const finish = () => engine.finish();
    window.addEventListener("scroll", finish, { passive: true });
    return () => window.removeEventListener("scroll", finish);
  }, [engine, motion?.whileScrolling]);

  // Retarget whenever the message changes. Skip the very first run (the engine
  // was already snapped to it during creation).
  const sig = JSON.stringify([value, lines ?? [], flag]);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    engine.setTarget(buildFlapGrid(value, lines, flag, dims));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, sig]);

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(
        <Cell
          key={`${r}-${c}`}
          engine={engine}
          row={r}
          col={c}
          baseFoldMs={timing.foldBaseMs}
          marks={resolvedMarks}
        />
      );
    }
  }

  return (
    <div
      className={
        className ? `sf-board font-mono ${className}` : "sf-board font-mono"
      }
      role="img"
      aria-label={value}
      style={
        {
          "--cols": cols,
          "--sf-fold": `${timing.foldBaseMs}ms`,
        } as CSSProperties
      }
    >
      {cells}
    </div>
  );
}
