import { describe, it, expect } from "vitest";

import {
  type Flap,
  flapKey,
  sameFlap,
  buildDrum,
  forwardSteps,
  BASE_FLAPS,
} from "../../src/drum";

const ch = (value: string): Flap => ({ kind: "char", value });
const color = (value: string): Flap => ({ kind: "color", value });

describe("flapKey / sameFlap", () => {
  it("namespaces colours and chars so a colour never collides with a glyph", () => {
    expect(flapKey(ch("A"))).not.toBe(flapKey(color("A")));
    expect(flapKey(ch("A"))).toBe("g:A");
    expect(flapKey(color("#fff"))).toBe("c:#fff");
  });

  it("sameFlap compares kind and value", () => {
    expect(sameFlap(ch("A"), ch("A"))).toBe(true);
    expect(sameFlap(ch("A"), color("A"))).toBe(false);
    expect(sameFlap(ch("A"), ch("B"))).toBe(false);
  });
});

describe("buildDrum", () => {
  it("leads with blank, then sorted colours, then the fixed base run", () => {
    const drum = buildDrum([color("#0000ff"), color("#00ff00"), ch("A")]);
    expect(drum[0]).toEqual(ch(" "));
    // Colours sit right after the blank, sorted by value.
    expect(drum[1]).toEqual(color("#0000ff"));
    expect(drum[2]).toEqual(color("#00ff00"));
    // Then the rest of the fixed base (A-Z, digits, punctuation).
    expect(drum[3]).toEqual(ch("A"));
  });

  it("dedupes against the base and across the used set", () => {
    // "A" and " " are already in BASE_FLAPS; a repeated colour appears once.
    const drum = buildDrum([ch("A"), ch(" "), color("#fff"), color("#fff")]);
    const colorCount = drum.filter(
      (f) => f.kind === "color" && f.value === "#fff"
    ).length;
    expect(colorCount).toBe(1);
    expect(drum.filter((f) => sameFlap(f, ch("A"))).length).toBe(1);
  });

  it("appends unknown unicode glyphs (sorted) after the base", () => {
    const drum = buildDrum([ch("అ"), ch("ఁ")]); // Telugu అ, ఁ
    const aIdx = drum.findIndex((f) => sameFlap(f, ch("అ")));
    const bIdx = drum.findIndex((f) => sameFlap(f, ch("ఁ")));
    const lastBase = drum.findIndex((f) =>
      sameFlap(f, BASE_FLAPS[BASE_FLAPS.length - 1])
    );
    expect(bIdx).toBeGreaterThan(lastBase);
    expect(bIdx).toBeLessThan(aIdx); // ఁ (0c01) sorts before అ (0c05)
  });

  it("guarantees a slot for every used flap (the engine's core invariant)", () => {
    const used = [ch("Z"), color("#abc"), ch("é"), ch("?")];
    const drum = buildDrum(used);
    for (const f of used) {
      expect(drum.some((d) => sameFlap(d, f))).toBe(true);
    }
  });
});

describe("forwardSteps", () => {
  it("is zero when already at the target", () => {
    expect(forwardSteps(3, 3, 10)).toBe(0);
  });

  it("counts forward distance without wrapping", () => {
    expect(forwardSteps(2, 5, 10)).toBe(3);
  });

  it("wraps around the end of the drum (forward-only rotation)", () => {
    expect(forwardSteps(8, 2, 10)).toBe(4); // 8 -> 9 -> 0 -> 1 -> 2
  });
});
