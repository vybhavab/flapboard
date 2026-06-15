# flapboard

A split-flap display engine for your browser.

The board is modelled as a **state machine of autonomous motors**, not a set of
CSS transitions. There is one piece of truth — the _target_ grid — and one
animation loop. Every cell is an independent motor with its own current flap,
its own clock, and its own jitter, so the desync that reads as "alive" is the
default rather than something faked on top.

`setTarget` is **fully interruptible**: it never moves a motor's current
position, only its destination. Change the message mid-flip and every tile
redirects toward the new message from wherever it physically is — a state change
_flows_ across the board instead of jumping.

The core is framework-agnostic (no DOM beyond an injectable clock + rAF). A
React view ships alongside it.

## Usage (React)

```tsx
import { FlapBoard } from "flapboard/react";
import "flapboard/styles.css";

<FlapBoard
  value="HELLO WORLD"
  flag={["#C8102E", "#FFFFFF", "#012169"]}
  rows={6}
  cols={23}
/>;
```

Change `value` / `lines` / `flag` and the board animates to it — interrupt it
any time. `onSettled` fires when the board comes to rest; `onTick` fires per
flip (wire a click sound here).

### Motion policy

If the board sits in a scrollable page, a full-board cascade can compete with
scrolling for paint/compositor budget. The default behavior is to keep the
physical cascade uninterrupted, but you can opt into a scroll-responsive motion
policy:

```tsx
import { type FlapBoardMotion } from "flapboard/react";

const scrollResponsiveMotion: FlapBoardMotion = { whileScrolling: "finish" };

<FlapBoard value="HELLO WORLD" motion={scrollResponsiveMotion} />;
```

`whileScrolling: "finish"` snaps active motors to their target when the page
scrolls. Use it when scroll responsiveness is more important than completing
every visible flap.

### Custom glyph marks

A few characters read better drawn than set in a typeface. `-` and `>` ship as
SVG marks by default ({@link DEFAULT_MARKS}); pass `marks` to add or override —
the map is merged over the defaults, keyed by the (uppercased) character:

```tsx
import { FlapBoard, type GlyphMark } from "flapboard/react";

const arrow: GlyphMark = ({ className }) => (
  <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
    <line className="sf-mark" x1="26" x2="74" y1="50" y2="50" />
    <polyline className="sf-mark" points="56,32 78,50 56,68" fill="none" />
  </svg>
);

<FlapBoard value="GATE → 22" marks={{ "→": arrow }} />;
```

### Deterministic animation (`random`)

The motor jitter is the only nondeterminism in the engine, and it's injectable.
Pass `random` (a `() => number` PRNG) to make a board animate identically every
run — this is how the visual tests get pixel-stable frames. Defaults to
`Math.random`.

## Usage (engine only)

```ts
import { FlapBoardEngine, buildFlapGrid } from "flapboard";

const board = new FlapBoardEngine({ rows: 6, cols: 23, onSettled: () => {} });
board.subscribeCell(0, 0, (e) => paint(e));
board.setTarget(buildFlapGrid("HELLO", undefined, []));
board.setTarget(buildFlapGrid("WORLD", undefined, [])); // interrupts the first
```

## Design notes

- **Uppercase-only drum.** The board displays uppercase, so the drum carries a
  single letter run; flap values are uppercased. No redundant lowercase block to
  spin through.
- **Colours at the front of the drum.** The flag border lands in a couple of
  steps instead of a full alphabet spin.
- **Near-black flag stripes render as blank** — invisible on a dark board, and
  no colour flap to spin to.
- **Re-seeded jitter per spin** (start delay, step speed, fold duration), so the
  board never animates the same way twice.

## Development & tests

The package is a standalone pnpm project with build, quality, and test suites.

```bash
pnpm --filter flapboard build          # tsup -> dist (esm + .d.ts + styles.css)
pnpm --filter flapboard test:unit      # Vitest, runs in plain Node (no DOM)
pnpm --filter flapboard test:visual    # Playwright, real Chromium
```

Local consumers can link this repo during development, while deployed apps should install the published npm package. `dist` is the publishable artifact.

### Unit tests (Vitest)

The engine, drum, layout and timing modules are DOM-free — the engine takes an
injectable clock, rAF and `random` — so the logic suite runs in Node with a
manual clock and a seeded PRNG (`test/support/rng.ts`). No jsdom.

### Visual tests (Playwright)

`test/harness/` is a tiny Vite page that mounts the real view and exposes a
deterministic driver on `window.__flap` (seeded RNG + a manual clock installed
over `requestAnimationFrame`/`performance.now`). `test/visual/board.spec.ts`
captures settled boards across scenarios; `test/visual/onion-skin.spec.ts`
drives one transition frame-by-frame and composites the cascade frames into a
single onion-skin still (`test/onion-skin.ts`, via `sharp`) that is both
attached to the report and snapshot-compared.

```bash
pnpm --filter flapboard test:visual:update   # (re)generate baselines
```

Baselines are committed per platform (`…-chromium-darwin.png`,
`…-chromium-linux.png`). CI runs in the version-matched Playwright Linux
container; the first run on a new platform has no baselines yet — grab the
`flapboard-visual` artifact, commit the generated `*-linux.png` files, and
re-run.

## Releases

This repo uses Changesets for npm releases and pkg.pr.new for preview packages.

```bash
pnpm changeset          # add a release note
pnpm version            # apply pending changesets
pnpm release            # build and publish to npm
```

Pull requests get preview packages through pkg.pr.new after CI builds the package. The preview workflow uses `pnpm exec pkg-pr-new publish --comment=update --packageManager=pnpm`, matching pkg.pr.new's guidance to run from the lockfile in CI.
