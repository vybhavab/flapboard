/**
 * flapboard — an interruptible split-flap display engine.
 *
 * The framework-agnostic core lives here; the React view is at `flapboard/react`
 * and the styles at `flapboard/styles.css`.
 */

export { FlapBoard as FlapBoardEngine } from "./engine";
export type { CellEvent, CellListener, FlapBoardOptions } from "./engine";

export {
  type Flap,
  flapKey,
  sameFlap,
  buildDrum,
  forwardSteps,
  BASE_FLAPS,
} from "./drum";

export {
  buildFlapGrid,
  graphemes,
  isDenseGlyphCluster,
  isComplexScript,
  shouldRenderWholeGlyph,
  show,
  type BoardDims,
  DEFAULT_DIMS,
} from "./layout";

export {
  type FlapTiming,
  DEFAULT_TIMING,
  motorStepDelay,
  visualFoldDuration,
} from "./timing";

// NOTE: the glyph-mark API (DEFAULT_MARKS, GlyphMark) and FlapBoardProps live on
// the React entry (`flapboard/react`), not here — DEFAULT_MARKS is JSX, and this
// core entry stays framework-agnostic (no React import).
