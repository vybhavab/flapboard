import { describe, it, expect } from "vitest";

import {
  DEFAULT_TIMING,
  motorStepDelay,
  visualFoldDuration,
} from "../../src/timing";

describe("motorStepDelay", () => {
  it("returns the slow max step for a single-step spin", () => {
    expect(motorStepDelay(0, 1, DEFAULT_TIMING)).toBe(DEFAULT_TIMING.maxStepMs);
  });

  it("is slow at the ends and fastest in the middle of a spin", () => {
    const total = 21;
    const first = motorStepDelay(0, total, DEFAULT_TIMING);
    const middle = motorStepDelay(10, total, DEFAULT_TIMING);
    const last = motorStepDelay(total - 1, total, DEFAULT_TIMING);

    expect(middle).toBeLessThan(first);
    expect(middle).toBeLessThan(last);
    expect(middle).toBeCloseTo(DEFAULT_TIMING.minStepMs, 0);
  });

  it("never leaves the [minStepMs, maxStepMs] band", () => {
    const total = 30;
    for (let step = 0; step < total; step++) {
      const d = motorStepDelay(step, total, DEFAULT_TIMING);
      expect(d).toBeGreaterThanOrEqual(DEFAULT_TIMING.minStepMs);
      expect(d).toBeLessThanOrEqual(DEFAULT_TIMING.maxStepMs);
    }
  });
});

describe("visualFoldDuration", () => {
  it("runs a touch longer than the base fold so the fold completes before retire", () => {
    expect(visualFoldDuration(DEFAULT_TIMING)).toBeGreaterThan(
      DEFAULT_TIMING.foldBaseMs
    );
  });
});
