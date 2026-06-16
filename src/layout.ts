/**
 * Text → flap grid. Turns a message (and optional flag palette) into the
 * `Flap[][]` target the engine animates to: word-wrapped or pinned lines,
 * centered both ways, with the perimeter painted as a band of flag colours.
 *
 * Everything is split by *grapheme cluster* (Intl.Segmenter), not code point,
 * so combining-mark scripts (Telugu, Devanagari, emoji…) keep each cluster
 * whole on a single tile.
 */

import { type Flap } from "./drum";

export type BoardDims = {
  rows: number;
  cols: number;
  /** Target line length the wrap balancer aims for. */
  idealLineCols: number;
};

export const DEFAULT_DIMS: BoardDims = { rows: 6, cols: 23, idealLineCols: 16 };

export type Rect = {
  row: number;
  col: number;
  rows: number;
  cols: number;
};

export type TextAlign = "start" | "center" | "end";
export type TextWrap = "balance" | "word" | "none";
export type ColorMode = "fill" | "border";
export type TextOverflow = "clip" | "warn";

export type TextLayer = {
  kind: "text";
  region?: Rect;
  text?: string;
  lines?: readonly string[];
  align?: TextAlign;
  valign?: TextAlign;
  wrap?: TextWrap;
  overflow?: TextOverflow;
};

export type ColorLayer = {
  kind: "color";
  region?: Rect;
  colors: readonly string[];
  mode?: ColorMode;
};

export type Layer = TextLayer | ColorLayer;
export type Declaration = readonly Layer[];

export type TextLayerOptions = Omit<TextLayer, "kind">;

export type ColorLayerOptions = Omit<ColorLayer, "kind" | "colors">;

export function fullRect(dims: BoardDims): Rect {
  return { row: 0, col: 0, rows: dims.rows, cols: dims.cols };
}

export function text(
  value?: string,
  options?: Omit<TextLayerOptions, "text">
): TextLayer;
export function text(options?: TextLayerOptions): TextLayer;
export function text(
  valueOrOptions: string | TextLayerOptions = "",
  maybeOptions: Omit<TextLayerOptions, "text"> = {}
): TextLayer {
  const textValue =
    typeof valueOrOptions === "string" ? valueOrOptions : valueOrOptions.text;
  const options =
    typeof valueOrOptions === "string" ? maybeOptions : valueOrOptions;
  return {
    kind: "text",
    region: options.region,
    text: textValue ?? "",
    lines: options.lines,
    align: options.align,
    valign: options.valign,
    wrap: options.wrap,
    overflow: options.overflow,
  };
}

export function color(
  colors: string | readonly string[],
  options: Partial<ColorLayerOptions> = {}
): ColorLayer {
  return {
    kind: "color",
    region: options.region,
    colors: typeof colors === "string" ? [colors] : colors,
    mode: options.mode,
  };
}

export function frame(
  colors: string | readonly string[],
  options: Omit<Partial<ColorLayerOptions>, "mode"> = {}
): ColorLayer {
  return color(colors, { ...options, mode: "border" });
}

function translateRegion(parent: Rect, child: Rect): Rect {
  return {
    row: parent.row + child.row,
    col: parent.col + child.col,
    rows: child.rows,
    cols: child.cols,
  };
}

export function region(parent: Rect, declaration: Declaration): Layer[] {
  return declaration.map((layer) => ({
    ...layer,
    region: translateRegion(
      parent,
      layer.region ?? { row: 0, col: 0, rows: parent.rows, cols: parent.cols }
    ),
  }));
}

let segmenter: Intl.Segmenter | null = null;
export function graphemes(str: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(segmenter.segment(str), (s) => s.segment);
  }
  return Array.from(str);
}

export const show = (c: string) => (c === " " || c === "" ? " " : c);

// Only genuinely non-Latin scripts (Thai, Telugu, CJK, Arabic…) need the
// shrink-to-fit treatment. Accented Latin (ě, š, ñ, ü, Vietnamese…) is
// Script=Latin and must render full-size; Common covers punctuation/digits,
// Inherited covers combining marks.
export const isComplexScript = (c: string) =>
  /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(c);

export const isDenseGlyphCluster = (c: string) =>
  graphemes(c).length === 1 && Array.from(c).length > 1;

export const shouldRenderWholeGlyph = (c: string) => {
  if (c === " " || c === "") return false;
  return (
    isComplexScript(c) ||
    isDenseGlyphCluster(c) ||
    /\p{Extended_Pictographic}/u.test(c)
  );
};

function lineLength(value: string): number {
  return graphemes(value).length;
}

function emptyGrid(size: Pick<BoardDims, "rows" | "cols">): string[][] {
  return Array.from({ length: size.rows }, () =>
    Array<string>(size.cols).fill(" ")
  );
}

function splitLongWord(word: string, maxLength: number): string[] {
  const chars = graphemes(word);
  const chunks: string[] = [];
  for (let i = 0; i < chars.length; i += maxLength) {
    chunks.push(chars.slice(i, i + maxLength).join(""));
  }
  return chunks;
}

function wrapWords(value: string, maxLength: number): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (lineLength(next) <= maxLength) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (lineLength(word) > maxLength) {
      lines.push(...splitLongWord(word, maxLength));
      line = "";
    } else {
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function lineScore(lines: string[], idealLineCols: number): number {
  const lengths = lines.map(lineLength);
  const longest = Math.max(...lengths);
  const shortest = Math.min(...lengths);
  const raggedness = lengths.reduce(
    (sum, length) => sum + Math.abs(length - idealLineCols),
    0
  );
  return (longest - shortest) * 3 + raggedness + lines.length * 0.5;
}

function balanceTextLines(value: string, dims: BoardDims): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [""];

  let best = wrapWords(trimmed, dims.cols).slice(0, dims.rows);
  let bestScore = lineScore(best, dims.idealLineCols);

  for (
    let maxLength = Math.min(dims.cols, Math.max(8, lineLength(trimmed)));
    maxLength >= 8;
    maxLength -= 1
  ) {
    const candidate = wrapWords(trimmed, maxLength);
    if (candidate.length > dims.rows) break;
    const score = lineScore(candidate, dims.idealLineCols);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

/** Center explicit lines vertically and horizontally on the board. */
function alignOffset(
  available: number,
  used: number,
  align: TextAlign,
  preserveFixedStart = false
): number {
  if (preserveFixedStart) return 0;
  if (align === "start") return 0;
  if (align === "end") return Math.max(0, available - used);
  return Math.max(0, Math.floor((available - used) / 2));
}

function layoutLines(
  lines: string[],
  dims: BoardDims,
  align: TextAlign = "center",
  valign: TextAlign = "center"
): string[][] {
  const grid = emptyGrid(dims);
  const { rows, cols } = dims;

  if (lines.length === rows) {
    lines.forEach((text, r) => {
      const g = graphemes(text).slice(0, cols);
      const hasFixedColumn = text.startsWith(" ");
      const leftPad = alignOffset(cols, g.length, align, hasFixedColumn);
      g.forEach((cluster, ci) => {
        grid[r][leftPad + ci] = cluster;
      });
    });
    return grid;
  }

  const trimmedLines = lines.map((line) => line.trim()).slice(0, rows);
  while (trimmedLines[0] === "") trimmedLines.shift();
  while (trimmedLines.at(-1) === "") trimmedLines.pop();
  const startRow = alignOffset(rows, trimmedLines.length, valign);

  trimmedLines.forEach((text, i) => {
    const r = startRow + i;
    if (r >= rows) return;
    const g = graphemes(text).slice(0, cols);
    const leftPad = alignOffset(cols, g.length, align);
    g.forEach((cluster, ci) => {
      grid[r][leftPad + ci] = cluster;
    });
  });
  return grid;
}

/** Word-wrap `value` into the grid, centered both ways. */
function layoutGrid(
  value: string,
  dims: BoardDims,
  align: TextAlign = "center",
  valign: TextAlign = "center",
  wrap: TextWrap = "balance"
): string[][] {
  const lines =
    wrap === "none"
      ? value.split(/\r?\n/)
      : wrap === "word"
        ? wrapWords(value, dims.cols)
        : balanceTextLines(value, dims);
  const used = lines.slice(0, dims.rows).map(graphemes);
  const startRow = alignOffset(dims.rows, used.length, valign);

  const grid = emptyGrid(dims);
  used.forEach((ln, li) => {
    const r = startRow + li;
    const visible = ln.slice(0, dims.cols);
    const leftPad = alignOffset(dims.cols, visible.length, align);
    visible.forEach((cluster, ci) => {
      grid[r][leftPad + ci] = cluster;
    });
  });
  return grid;
}

// A near-black flag stripe is indistinguishable from an unlit tile on a dark
// board — and rendering it as a colour chip just forces that border tile to
// spin all the way to a colour flap. Treat near-black as a blank tile instead.
function isBlackish(hex: string): boolean {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.replace(/(.)/g, "$1$1") : h;
  if (v.length !== 6) return false;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return Math.max(r, g, b) < 48;
}

function colorFlap(value: string): Flap {
  return isBlackish(value)
    ? { kind: "char", value: " " }
    : { kind: "color", value };
}

/**
 * Resolve the perimeter as a band of colour flaps, walking the ring clockwise
 * from the top-left and cycling through the palette. `null` marks cells outside
 * the border; near-black border cells resolve to blank char flaps.
 */
function buildBorderFlaps(
  colors: readonly string[],
  size: Pick<BoardDims, "rows" | "cols">
): (Flap | null)[][] {
  const { rows, cols } = size;
  const grid: (Flap | null)[][] = Array.from({ length: rows }, () =>
    Array<Flap | null>(cols).fill(null)
  );
  if (!colors.length || rows <= 0 || cols <= 0) return grid;

  const ring: [number, number][] = [];
  for (let c = 0; c < cols; c++) ring.push([0, c]); // top, →
  for (let r = 1; r < rows; r++) ring.push([r, cols - 1]); // right, ↓
  for (let c = cols - 2; c >= 0; c--) ring.push([rows - 1, c]); // bottom, ←
  for (let r = rows - 2; r >= 1; r--) ring.push([r, 0]); // left, ↑

  ring.forEach(([r, c], i) => {
    grid[r][c] = colorFlap(colors[i % colors.length]);
  });
  return grid;
}

function blankFlapGrid(dims: BoardDims): Flap[][] {
  return Array.from({ length: dims.rows }, () =>
    Array.from(
      { length: dims.cols },
      () => ({ kind: "char", value: " " }) as Flap
    )
  );
}

function clampRect(rect: Rect, dims: BoardDims): Rect {
  const row = Math.max(0, Math.min(dims.rows, rect.row));
  const col = Math.max(0, Math.min(dims.cols, rect.col));
  return {
    row,
    col,
    rows: Math.max(0, Math.min(dims.rows - row, rect.rows)),
    cols: Math.max(0, Math.min(dims.cols - col, rect.cols)),
  };
}

function normalizeFlapChar(ch: string): Flap {
  // The board renders uppercase (CSS text-transform), so normalise the flap
  // value to match — keeps the drum to a single letter run and stops tiles
  // spinning the long way round through a lowercase block to an uppercase
  // target. No-op for caseless scripts, digits, punctuation and the seam.
  return { kind: "char", value: ch.toUpperCase() };
}

function warnDev(message: string, details: Record<string, unknown>) {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    return;
  }
  console.warn(`[flapboard] ${message}`, details);
}

function rectWasClipped(rect: Rect, clipped: Rect): boolean {
  return (
    rect.row !== clipped.row ||
    rect.col !== clipped.col ||
    rect.rows !== clipped.rows ||
    rect.cols !== clipped.cols
  );
}

function layerRect(layer: Layer, dims: BoardDims): Rect {
  return layer.region ?? fullRect(dims);
}

function warnIfRectClipped(layer: Layer, rect: Rect, clipped: Rect) {
  if (!rectWasClipped(rect, clipped)) return;
  warnDev("Layer region exceeded board bounds and was clipped.", {
    kind: layer.kind,
    region: rect,
    clipped,
  });
}

function textLinesForLayer(layer: TextLayer, dims: BoardDims): string[] {
  if (layer.lines) return [...layer.lines];
  const value = layer.text ?? "";
  if ((layer.wrap ?? "balance") === "none") return value.split(/\r?\n/);
  if ((layer.wrap ?? "balance") === "word") return wrapWords(value, dims.cols);
  return wrapWords(value.trim(), dims.cols);
}

function warnIfTextClipped(layer: TextLayer, dims: BoardDims) {
  if ((layer.overflow ?? "warn") === "clip") return;
  const lines = textLinesForLayer(layer, dims);
  const rowOverflow = lines.length > dims.rows;
  const colOverflow = lines.some((line) => lineLength(line) > dims.cols);
  if (!rowOverflow && !colOverflow) return;
  warnDev("Text layer overflowed its region and was clipped.", {
    region: layer.region,
    rows: dims.rows,
    cols: dims.cols,
    lineCount: lines.length,
    maxLineLength: Math.max(0, ...lines.map(lineLength)),
  });
}

function resolveColorLayer(target: Flap[][], layer: ColorLayer, rect: Rect) {
  if (rect.rows <= 0 || rect.cols <= 0 || !layer.colors.length) return;

  if ((layer.mode ?? "fill") === "fill") {
    const flap = colorFlap(layer.colors[0]);
    for (let r = 0; r < rect.rows; r++) {
      for (let c = 0; c < rect.cols; c++) {
        target[rect.row + r][rect.col + c] = flap;
      }
    }
    return;
  }

  const colors = buildBorderFlaps(layer.colors, rect);
  for (let r = 0; r < rect.rows; r++) {
    for (let c = 0; c < rect.cols; c++) {
      const flap = colors[r][c];
      if (flap) target[rect.row + r][rect.col + c] = flap;
    }
  }
}

function resolveTextLayer(
  target: Flap[][],
  layer: TextLayer,
  dims: BoardDims,
  rect: Rect
) {
  if (rect.rows <= 0 || rect.cols <= 0) return;
  const textDims: BoardDims = {
    rows: rect.rows,
    cols: rect.cols,
    idealLineCols: Math.min(dims.idealLineCols, rect.cols),
  };
  warnIfTextClipped(layer, textDims);
  const text = layer.lines
    ? layoutLines(
        [...layer.lines],
        textDims,
        layer.align ?? "center",
        layer.valign ?? "center"
      )
    : layoutGrid(
        layer.text ?? "",
        textDims,
        layer.align ?? "center",
        layer.valign ?? "center",
        layer.wrap ?? "balance"
      );

  for (let r = 0; r < rect.rows; r++) {
    for (let c = 0; c < rect.cols; c++) {
      const ch = text[r][c];
      if (ch !== " ")
        target[rect.row + r][rect.col + c] = normalizeFlapChar(ch);
    }
  }
}

/** Resolve declaration layers into one target grid. Later covering layers win. */
export function resolve(
  declaration: Declaration,
  dims: BoardDims = DEFAULT_DIMS
): Flap[][] {
  const target = blankFlapGrid(dims);

  for (const layer of declaration) {
    const rawRect = layerRect(layer, dims);
    const rect = clampRect(rawRect, dims);
    warnIfRectClipped(layer, rawRect, rect);
    if (layer.kind === "color") {
      resolveColorLayer(target, layer, rect);
    } else {
      resolveTextLayer(target, layer, dims, rect);
    }
  }

  return target;
}

/** Convert a target grid to one trimmed string per row for text assertions. */
export function gridToText(grid: readonly (readonly Flap[])[]): string[] {
  return grid.map((row) =>
    row
      .map((flap) => (flap.kind === "char" ? flap.value : "■"))
      .join("")
      .trimEnd()
  );
}

/** Compose the target board as a grid of flaps: text wins, then flag colours. */
export function buildFlapGrid(
  value: string,
  lines: readonly string[] | undefined,
  flag: readonly string[],
  dims: BoardDims = DEFAULT_DIMS
): Flap[][] {
  return resolve(
    [
      ...(flag.length ? [frame(flag, { region: fullRect(dims) })] : []),
      text(value, {
        region: fullRect(dims),
        lines,
        align: "center",
        valign: "center",
        wrap: "balance",
      }),
    ],
    dims
  );
}
