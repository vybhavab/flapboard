import { describe, it, expect, vi } from "vitest";

import { type Flap } from "../../src/drum";
import {
  graphemes,
  isDenseGlyphCluster,
  isComplexScript,
  shouldRenderWholeGlyph,
  show,
  buildFlapGrid,
  color,
  frame,
  fullRect,
  gridToText,
  region,
  resolve,
  text,
  type BoardDims,
  type Declaration,
} from "../../src/layout";

const DIMS: BoardDims = { rows: 6, cols: 23, idealLineCols: 16 };

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
    const text = gridToText(grid).join("");
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
    const nonEmpty = gridToText(grid)
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

describe("data-first declarations", () => {
  it("matches the easy helper for plain text", () => {
    const declaration = [text("hello world")] satisfies Declaration;

    expect(resolve(declaration, DIMS)).toEqual(
      buildFlapGrid("hello world", undefined, [], DIMS)
    );
  });

  it("matches explicit line behavior", () => {
    const lines = ["ARRIVALS", "GATE 22", "ON TIME"];

    expect(resolve([text({ lines })], DIMS)).toEqual(
      buildFlapGrid("", lines, [], DIMS)
    );
  });

  it("matches flag perimeter behavior through the frame builder", () => {
    const colors = ["#C8102E", "#FFFFFF", "#012169"];

    expect(resolve([frame(colors)], DIMS)).toEqual(
      buildFlapGrid("", undefined, colors, DIMS)
    );
  });

  it("treats near-black frame colors as blank", () => {
    const grid = resolve([frame("#050505")], DIMS);

    expect(grid.flat().some((flap) => flap.kind === "color")).toBe(false);
  });

  it("resolves declaration order as last covering layer wins", () => {
    const cell = { row: 0, col: 0, rows: 1, cols: 1 };
    const letter = text("a", {
      region: cell,
      align: "start",
      valign: "start",
      wrap: "none",
    });
    const red = color("#ff0000", { region: cell });

    expect(resolve([letter, red], DIMS)[0][0]).toEqual<Flap>({
      kind: "color",
      value: "#ff0000",
    });
    expect(resolve([red, letter], DIMS)[0][0]).toEqual<Flap>({
      kind: "char",
      value: "A",
    });
  });

  it("places region-scoped text only inside the region", () => {
    const grid = resolve(
      [
        text("AB", {
          region: { row: 1, col: 2, rows: 1, cols: 4 },
          align: "start",
          valign: "start",
          wrap: "none",
        }),
      ],
      DIMS
    );

    expect(grid[1][2]).toEqual<Flap>({ kind: "char", value: "A" });
    expect(grid[1][3]).toEqual<Flap>({ kind: "char", value: "B" });
    expect(grid[1][1]).toEqual<Flap>({ kind: "char", value: " " });
    expect(grid[1][6]).toEqual<Flap>({ kind: "char", value: " " });
  });

  it("paints a region-scoped frame only on the region perimeter", () => {
    const grid = resolve(
      [
        frame("#ff0000", {
          region: { row: 1, col: 2, rows: 3, cols: 4 },
        }),
      ],
      DIMS
    );

    expect(grid[1][2]).toEqual<Flap>({ kind: "color", value: "#ff0000" });
    expect(grid[2][3]).toEqual<Flap>({ kind: "char", value: " " });
    expect(grid[0][2]).toEqual<Flap>({ kind: "char", value: " " });
  });

  it("does not auto-inset full-board text when a full-board frame exists", () => {
    const top = "A".repeat(DIMS.cols);
    const grid = resolve(
      [
        frame("#ff0000", { region: fullRect(DIMS) }),
        text({
          region: fullRect(DIMS),
          lines: [top, "", "", "", "", ""],
        }),
      ],
      DIMS
    );

    expect(grid[0][0]).toEqual<Flap>({ kind: "char", value: "A" });
    expect(gridToText(grid)[0]).toBe(top);
  });

  it("clips overflow deterministically and warns in development", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const grid = resolve(
        [
          text("ABCDE", {
            region: { row: 0, col: 0, rows: 1, cols: 2 },
            align: "start",
            valign: "start",
            wrap: "none",
          }),
        ],
        DIMS
      );

      expect(gridToText(grid)[0]).toBe("AB");
      expect(warn).toHaveBeenCalledWith(
        "[flapboard] Text layer overflowed its region and was clipped.",
        expect.objectContaining({
          rows: 1,
          cols: 2,
          lineCount: 1,
          maxLineLength: 5,
        })
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("suppresses overflow warnings when overflow is clipped explicitly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const grid = resolve(
        [
          text("ABCDE", {
            region: { row: 0, col: 0, rows: 1, cols: 2 },
            align: "start",
            valign: "start",
            wrap: "none",
            overflow: "clip",
          }),
        ],
        DIMS
      );

      expect(gridToText(grid)[0]).toBe("AB");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("keeps Spotify explicit lines fixed when a full-board frame is added", () => {
    const spotifyLines = [
      "  listening",
      "give me ur love -",
      "another chemical",
      "love story",
      "another chemical",
      "  ",
    ];
    const withoutFrame = resolve([text({ lines: spotifyLines })], DIMS);
    const withFrame = resolve(
      [frame(["#1db954", "#f5f5f5", "#191414"]), text({ lines: spotifyLines })],
      DIMS
    );

    for (let row = 0; row < DIMS.rows; row++) {
      for (let col = 0; col < DIMS.cols; col++) {
        const expected = withoutFrame[row][col];
        if (expected.kind === "char" && expected.value !== " ") {
          expect(withFrame[row][col]).toEqual(expected);
        }
      }
    }
    expect(withFrame[0][0].kind).toBe("color");
    expect(withFrame[0][2]).toEqual<Flap>({ kind: "char", value: "L" });
  });

  it("flattens region helper declarations to absolute regions", () => {
    const grid = resolve(
      region({ row: 2, col: 3, rows: 2, cols: 5 }, [
        text("AB", {
          region: { row: 1, col: 1, rows: 1, cols: 2 },
          align: "start",
          valign: "start",
          wrap: "none",
        }),
      ]),
      DIMS
    );

    expect(grid[3][4]).toEqual<Flap>({ kind: "char", value: "A" });
    expect(grid[3][5]).toEqual<Flap>({ kind: "char", value: "B" });
    expect(grid[1][1]).toEqual<Flap>({ kind: "char", value: " " });
  });
});
