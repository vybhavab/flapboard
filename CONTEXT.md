# flapboard

A split-flap display engine for the browser. This glossary fixes the language we
use for the board's parts so the API, docs, and code stay consistent.

## Language

**Flap**:
One face a cell can show — a single character or a solid colour chip.
_Avoid_: tile face, card, letter

**Motor**:
The autonomous per-cell state machine that flips toward its target flap.
_Avoid_: cell-machine, spinner

**Cell**:
One position on the board grid, driven by exactly one motor.
_Avoid_: tile (tile is the rendered DOM, not the position), slot

**Target grid**:
The resolved `Flap[][]` giving every cell's target flap; the engine's single
source of truth.
_Avoid_: state, frame buffer, board state

**Declaration**:
A single snapshot of what the board should show — a list of layers (or the easy
view props that produce them) resolved into one target grid; motion over time is
a sequence of declarations, never a property of one.
_Avoid_: spec, scene, message, model

**Layer**:
One entry in a declaration: some content (e.g. text or a frame) over a region.
_Avoid_: element, item

**Region**:
The rectangular area of cells a layer applies to.
_Avoid_: rect (rect is the type), zone, box

**Resolution**:
Turning a declaration into the target grid — for each cell, the last declaration
covering it sets that cell's target flap (declaration order wins).
_Avoid_: compile, paint, render

**Engine**:
The framework-agnostic core that holds the target grid, resolves declarations,
and runs the animation loop.
_Avoid_: controller, model

**View**:
A framework-specific renderer (e.g. React) that forwards declarations to the
engine and paints cell subscriptions; it holds no board state of its own.
_Avoid_: component, widget

**Theme**:
A named bundle of `--sf-*` token overrides selecting a board's look.
_Avoid_: skin, style, preset

**Driver**:
An optional helper that advances the engine through a sequence of declarations
on a clock (e.g. marquee, cycle); it lives outside the engine.
_Avoid_: animator, scheduler, ticker

## Relationships

- A **Declaration** is a list of **Layers**; each **Layer** targets a **Region**.
- **Resolution** turns a **Declaration** into the **Target grid**.
- The **Target grid** assigns each **Cell** one target **Flap**; its **Motor** flips there.
- The **Engine** owns the **Target grid** and **Resolution**; a **View** only forwards **Declarations** and paints **Motors**.
- Motion over time is a sequence of **Declarations** fed to the **Engine** by a **Driver** or the app; the **Engine** is time-agnostic apart from the flip itself.

## Example dialogue

> **Dev:** "Two layers cover the same cell — a frame's border and a line of text. Which flap does the cell flip to?"
> **Domain expert:** "Whichever layer is declared last. Resolution walks the declaration in order; the last layer covering that cell sets its target flap. The motor flips there. Nothing is layered on top of anything visually — there's only one final flap per cell."

## Flagged ambiguities

- "Painting / layering over" was used for how layers combine — resolved: the board does not paint, it **resolves** one target flap per cell and the motor **flips** to it. Last declaration covering a cell wins.
- "Declaration" names both the data form (a `Layer[]`) and the easy view props (`text`/`lines`/`frame`) that produce it — resolved: same concept; the props build layers and resolve identically. (A JSX component tier was considered and dropped as redundant surface.)
- "Marquee / sliding / animation" was treated as a board capability — resolved: a **Declaration** is a still snapshot; motion is a sequence of declarations driven by an external clock (a **Driver** or the app), not something the engine sequences.
- "Region" was used both for a layer's placement and for the area text must stay inside — resolved: same thing. A **Region** is the allowed area (and hard clip boundary) for a layer; whether text sits inside or overlaps a border is chosen by the region you give it, not decided by the engine.
