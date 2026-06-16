# Data-first declarations; drop the JSX component tier

**Status:** accepted

The React API is moving from JSX composition (`<FlapText>` / `<FlapFrame>` /
`<FlapRegion>` children) to a **data-first declaration model**: a board's content
is a `Layer[]` resolved by the engine into the target grid, exposed through easy
view props (`text` / `lines` / `frame`) for the common case and a `layers` prop
for the expert case. The JSX component tier is removed.

## Why

The primary consumer of this API is increasingly a coding agent, which has no
view of the rendered board. That reframes "good DX" around three properties the
JSX model violated:

1. **Fail loud, never silent-wrong.** A full-board `<FlapFrame>` silently inset a
   full-board `<FlapText>` by one ring (`compileFlapLayout`'s `insetRect`),
   reflowing layouts with no signal — it broke the consuming site's Spotify mode
   (6 explicit lines + palette border) invisibly. Auto-inset is removed: a layer
   fills exactly the region it is given; the last declaration covering a cell
   wins. Inset is something you _declare_ (an inset region), never magic.
2. **Local reasoning.** Adding one sibling layer must never move another. The
   declaration is a flat `Layer[]` with absolute regions; nesting exists only as
   a build-time helper that flattens.
3. **Inspectable / programmable.** `Layer[]` can be built in a loop, diffed,
   logged, and asserted against `resolve()` + `gridToText()` with no browser —
   the agent's substitute for eyes. Nested JSX can only be eyeballed.

## Considered options

- **Keep JSX as the canonical API** — rejected: most real consumers hold board
  state as _data_ (from an API/DB) and would hand-write a data→JSX adapter; the
  one function that produced correct output (`buildFlapGrid`) was unreachable
  from the React component.
- **Keep JSX + add data props (two coexisting expert tiers)** — rejected as
  over-engineered: it required a mutual-exclusion error system to police mixing,
  and JSX is the awkward middle (more verbose than props, less programmable than
  `layers`). v0.1.0 has effectively one consumer, so the breaking removal is cheap.

## Consequences

- The engine owns resolution + content-based dedup (`setTarget(declaration)`),
  so every view (React, vanilla, …) is a thin forwarder and the engine stays the
  reusable product. `setTarget(grid)` remains as the raw escape hatch.
- The core layer vocabulary is just `text` + `color` (with a `border` mode);
  `frame` and `region` are builders, not kinds. Marquee/animation is a sequence
  of declarations driven by an external clock — never a property of one
  declaration, and not the engine's concern.
- Do not re-introduce the JSX tier or auto-inset to be "helpful"; both were
  removed deliberately. See [CONTEXT.md](../../CONTEXT.md) for the vocabulary.
