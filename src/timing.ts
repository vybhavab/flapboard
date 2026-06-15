/**
 * Motor timing. A spinning tile is a little motor: it kicks off, ramps up to
 * speed, holds, then eases down and settles onto its target with a slightly
 * slower final flip — the mechanical "catch". `motorStepDelay` shapes that
 * speed curve across the steps of a single spin; the engine layers per-motor
 * jitter on top so no two motors run identically.
 */

export type FlapTiming = {
  /** Fastest step (ms) — top motor speed, reached around the middle of a spin. */
  minStepMs: number;
  /** Slowest step (ms) — the kick-off and the final landing flip. */
  maxStepMs: number;
  /** Ramp-up sharpness. Higher = snaps up to speed within a step or two. */
  rampUpCurve: number;
  /** Ramp-down softness. Lower = a gentler glide into the target. */
  rampDownCurve: number;
  /** Base duration (ms) of one card's fold animation. */
  foldBaseMs: number;
};

export const DEFAULT_TIMING: FlapTiming = {
  minStepMs: 90,
  maxStepMs: 360,
  rampUpCurve: 4.6,
  rampDownCurve: 2.2,
  foldBaseMs: 155,
};

/** How long the CSS fold animation runs for one flip, given the timing. */
export function visualFoldDuration(timing: FlapTiming): number {
  return Math.ceil(timing.foldBaseMs * 1.14);
}

/**
 * Delay before the `step`-th flip of a spin of `totalSteps`. Slow at the ends
 * (kick-off, landing), fast in the middle — an ease-in/ease-out across the
 * whole spin. `rampUpCurve`/`rampDownCurve` make the two halves asymmetric:
 * snap up to speed, glide back down.
 */
export function motorStepDelay(
  step: number,
  totalSteps: number,
  timing: FlapTiming
): number {
  if (totalSteps <= 1) return timing.maxStepMs;

  const progress = step / (totalSteps - 1);
  const isRampUp = progress <= 0.5;
  const distanceFromMiddle = isRampUp
    ? (0.5 - progress) / 0.5
    : (progress - 0.5) / 0.5;
  const curve = isRampUp ? timing.rampUpCurve : timing.rampDownCurve;
  const ease =
    curve >= 0
      ? distanceFromMiddle ** Math.max(0.01, curve)
      : 1 - (1 - distanceFromMiddle) ** Math.max(0.01, Math.abs(curve));
  const delay = timing.minStepMs + (timing.maxStepMs - timing.minStepMs) * ease;

  return Math.min(timing.maxStepMs, Math.max(timing.minStepMs, delay));
}
