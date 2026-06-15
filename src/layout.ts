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

function emptyGrid(dims: BoardDims): string[][] {
  return Array.from({ length: dims.rows }, () =>
    Array<string>(dims.cols).fill(" ")
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
function layoutLines(lines: string[], dims: BoardDims): string[][] {
  const grid = emptyGrid(dims);
  const { rows, cols } = dims;

  if (lines.length === rows) {
    lines.forEach((text, r) => {
      const g = graphemes(text).slice(0, cols);
      const hasFixedColumn = text.startsWith(" ");
      const leftPad = hasFixedColumn
        ? 0
        : Math.max(0, Math.floor((cols - g.length) / 2));
      g.forEach((cluster, ci) => {
        grid[r][leftPad + ci] = cluster;
      });
    });
    return grid;
  }

  const trimmedLines = lines.map((line) => line.trim()).slice(0, rows);
  while (trimmedLines[0] === "") trimmedLines.shift();
  while (trimmedLines.at(-1) === "") trimmedLines.pop();
  const startRow = Math.max(0, Math.floor((rows - trimmedLines.length) / 2));

  trimmedLines.forEach((text, i) => {
    const r = startRow + i;
    if (r >= rows) return;
    const g = graphemes(text).slice(0, cols);
    const leftPad = Math.max(0, Math.floor((cols - g.length) / 2));
    g.forEach((cluster, ci) => {
      grid[r][leftPad + ci] = cluster;
    });
  });
  return grid;
}

/** Word-wrap `value` into the grid, centered both ways. */
function layoutGrid(value: string, dims: BoardDims): string[][] {
  const used = balanceTextLines(value, dims).map(graphemes);
  const startRow = Math.floor((dims.rows - used.length) / 2);

  const grid = emptyGrid(dims);
  used.forEach((ln, li) => {
    const r = startRow + li;
    const leftPad = Math.floor((dims.cols - ln.length) / 2);
    ln.forEach((cluster, ci) => {
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

/**
 * Paint the perimeter as a band of the flag's colours, walking the ring
 * clockwise from the top-left and cycling through the palette. `null` marks the
 * (uncoloured) interior and any near-black stripe.
 */
function buildBorderColors(
  flag: readonly string[],
  dims: BoardDims
): (string | null)[][] {
  const { rows, cols } = dims;
  const grid: (string | null)[][] = Array.from({ length: rows }, () =>
    Array<string | null>(cols).fill(null)
  );
  if (!flag.length) return grid;

  const ring: [number, number][] = [];
  for (let c = 0; c < cols; c++) ring.push([0, c]); // top, →
  for (let r = 1; r < rows; r++) ring.push([r, cols - 1]); // right, ↓
  for (let c = cols - 2; c >= 0; c--) ring.push([rows - 1, c]); // bottom, ←
  for (let r = rows - 2; r >= 1; r--) ring.push([r, 0]); // left, ↑

  ring.forEach(([r, c], i) => {
    const color = flag[i % flag.length];
    grid[r][c] = isBlackish(color) ? null : color;
  });
  return grid;
}

/** Compose the target board as a grid of flaps: text wins, then flag colours. */
export function buildFlapGrid(
  value: string,
  lines: readonly string[] | undefined,
  flag: readonly string[],
  dims: BoardDims = DEFAULT_DIMS
): Flap[][] {
  const text = lines ? layoutLines([...lines], dims) : layoutGrid(value, dims);
  const colors = buildBorderColors(flag, dims);

  return text.map((row, r) =>
    row.map((ch, c) => {
      // The board renders uppercase (CSS text-transform), so normalise the flap
      // value to match — keeps the drum to a single letter run and stops tiles
      // spinning the long way round through a lowercase block to an uppercase
      // target. No-op for caseless scripts, digits, punctuation and the seam.
      if (ch !== " ") return { kind: "char", value: ch.toUpperCase() } as Flap;
      const color = colors[r][c];
      if (color) return { kind: "color", value: color } as Flap;
      return { kind: "char", value: " " } as Flap;
    })
  );
}
