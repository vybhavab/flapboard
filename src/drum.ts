/**
 * Split-flap "drum".
 *
 * A real split-flap tile is a physical drum: a fixed, ordered loop of flaps it
 * can only rotate *forward* through. To change a tile from one glyph to another
 * you advance the drum one flap at a time — passing through every intermediate
 * glyph — until the target comes up. That forward-only rotation is what gives a
 * split-flap board its signature tumbling cascade, and the engine animates it
 * the same way.
 *
 * We are software, not sheet metal, so we take two liberties a physical board
 * cannot: the board only ever *displays* uppercase, so the drum carries a
 * single letter run (no redundant lowercase block), and colour chips sit right
 * after the blank rather than at the tail — the flag border almost always
 * animates blank → colour or colour → colour, so keeping the chips near the
 * front lands the border in a couple of steps instead of a full alphabet spin.
 */

export type Flap =
  | { kind: "char"; value: string }
  | { kind: "color"; value: string };

export function flapKey(f: Flap): string {
  return (f.kind === "color" ? "c:" : "g:") + f.value;
}

export function sameFlap(a: Flap, b: Flap): boolean {
  return a.kind === b.kind && a.value === b.value;
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const PUNCT = "!@#$%&'\"()+-.,:;/?";

/** The fixed front of every drum: blank, A-Z, 0-9, punctuation. */
export const BASE_FLAPS: Flap[] = [" ", ...UPPER, ...DIGITS, ...PUNCT].map(
  (value) => ({ kind: "char", value }) as Flap
);

const BASE_KEYS = new Set(BASE_FLAPS.map(flapKey));

/**
 * Assemble the drum for a transition: the leading blank, then the colour chips
 * in play (sorted), then the rest of the fixed base (A-Z, 0-9, punctuation),
 * then any extra unicode glyphs present in the boards (sorted). Every flap that
 * any board shows is guaranteed a slot, so a tile can always rotate forward
 * from its current flap to its target.
 */
export function buildDrum(used: Iterable<Flap>): Flap[] {
  const seen = new Set(BASE_KEYS);
  const extras: Flap[] = [];
  const colors: Flap[] = [];

  for (const f of used) {
    const k = flapKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    (f.kind === "color" ? colors : extras).push(f);
  }

  const byValue = (a: Flap, b: Flap) =>
    a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
  extras.sort(byValue);
  colors.sort(byValue);

  const [blank, ...rest] = BASE_FLAPS;
  return [blank, ...colors, ...rest, ...extras];
}

/** Forward (wrap-around) distance from one drum index to another. */
export function forwardSteps(from: number, to: number, length: number): number {
  return (((to - from) % length) + length) % length;
}
