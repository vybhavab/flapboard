import { describe, it, expect } from "vitest";

import { type Flap } from "../../src/drum";
import {
  graphemes,
  isDenseGlyphCluster,
  isComplexScript,
  shouldRenderWholeGlyph,
  show,
  buildFlapGrid,
  type BoardDims,
} from "../../src/layout";

const DIMS: BoardDims = { rows: 6, cols: 23, idealLineCols: 16 };

/** Flatten a flap grid back to one trimmed string per row for easy assertions. */
function rowsToText(grid: Flap[][]): string[] {
  return grid.map((row) =>
    row
      .map((f) => (f.kind === "char" ? f.value : "■"))
      .join("")
      .trimEnd()
  );
}

describe("graphemes", () => {
  it("splits by grapheme cluster, keeping combining marks whole", () => {
    // Telugu "క" + vowel sign should stay a single cluster, not two code points.
    expect(graphemes("కా")).toEqual(["కా"]);
    expect(graphemes("ab")).toEqual(["a", "b"]);
  });
});

describe("isComplexScript", () => {
  it("flags non-Latin scripts but treats accented Latin as simple", () => {
    expect(isComplexScript("అ")).toBe(true); // Telugu
    expect(isComplexScript("好")).toBe(true); // CJK
    expect(isComplexScript("é")).toBe(false); // accented Latin renders full size
    expect(isComplexScript("A")).toBe(false);
    expect(isComplexScript("5")).toBe(false);
  });
});

describe("isDenseGlyphCluster", () => {
  it("flags multi-codepoint grapheme clusters", () => {
    expect(isDenseGlyphCluster("ಕಾ")).toBe(true);
    expect(isDenseGlyphCluster("é")).toBe(true);
    expect(isDenseGlyphCluster("A")).toBe(false);
  });
});

describe("shouldRenderWholeGlyph", () => {
  it("keeps compact Latin glyphs on the split-half renderer", () => {
    expect(shouldRenderWholeGlyph("A")).toBe(false);
    expect(shouldRenderWholeGlyph("é")).toBe(false);
    expect(shouldRenderWholeGlyph("5")).toBe(false);
  });

  it("uses the whole-glyph renderer for scripts and clusters that clip badly", () => {
    expect(shouldRenderWholeGlyph("ಕಾ")).toBe(true); // Kannada
    expect(shouldRenderWholeGlyph("好")).toBe(true); // CJK
    expect(shouldRenderWholeGlyph("👋")).toBe(true); // emoji
    expect(shouldRenderWholeGlyph("é")).toBe(true); // combining cluster
  });
});

describe("show", () => {
  it("maps empty/space to a single space, passes everything else through", () => {
    expect(show("")).toBe(" ");
    expect(show(" ")).toBe(" ");
    expect(show("A")).toBe("A");
  });
});

describe("buildFlapGrid", () => {
  it("uppercases letters so the drum keeps a single letter run", () => {
    const grid = buildFlapGrid("hello", undefined, [], DIMS);
    const text = rowsToText(grid).join("");
    expect(text).toContain("HELLO");
    expect(text).not.toContain("hello");
  });

  it("produces a grid of exactly rows x cols", () => {
    const grid = buildFlapGrid("hi", undefined, [], DIMS);
    expect(grid.length).toBe(DIMS.rows);
    for (const row of grid) expect(row.length).toBe(DIMS.cols);
  });

  it("wraps and vertically centers a long message", () => {
    const grid = buildFlapGrid(
      "the quick brown fox jumps",
      undefined,
      [],
      DIMS
    );
    const nonEmpty = rowsToText(grid)
      .map((t, i) => [t, i] as const)
      .filter(([t]) => t.length > 0);
    expect(nonEmpty.length).toBeGreaterThan(1); // it wrapped
    // centered: there is at least one blank row above the first text row
    expect(nonEmpty[0][1]).toBeGreaterThan(0);
  });

  it("paints flag colours around the perimeter and leaves the interior text", () => {
    const grid = buildFlapGrid("HI", undefined, ["#ff0000", "#00ff00"], DIMS);
    // top-left corner is on the perimeter ring -> a colour chip
    expect(grid[0][0].kind).toBe("color");
    // an interior cell with no text stays a blank char, never a colour
    expect(grid[3][1].kind).toBe("char");
  });

  it("treats a near-black flag stripe as a blank tile, not a colour chip", () => {
    const grid = buildFlapGrid("HI", undefined, ["#050505"], DIMS);
    // every perimeter cell would be near-black -> none should be a colour chip
    const anyColor = grid.flat().some((f) => f.kind === "color");
    expect(anyColor).toBe(false);
  });

  it("lets text win over a colour on the same cell", () => {
    // Pin exactly `rows` lines so line 0 maps to row 0 (no vertical centering);
    // a full-width top line then overlaps the red perimeter, and text wins.
    const top = "A".repeat(DIMS.cols);
    const lines = [top, "", "", "", "", ""];
    const grid = buildFlapGrid("", lines, ["#ff0000"], DIMS);
    expect(grid[0][0]).toEqual<Flap>({ kind: "char", value: "A" });
  });
});
